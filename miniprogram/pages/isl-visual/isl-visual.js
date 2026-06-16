// 星间链路 ISL 可视化
// 两颗卫星不再手填轨道根数，而是按 TLE 搜索选星（搜索/数据与星座地图同源），用 SGP4 算真实位置；
// 计算两星实际 ISL 距离、几何视距上限、切线高度与地球站对星几何。支持「实时」开关（1Hz 刷新）。
//
// 坐标系与星座地图一致：卫星 ECI 经 eciToEcf(gmstNow) 转地固系，再 ecef[x,y,z] -> render[x, z, -y]，
// 与海岸线/地球站（同 ecefToRender 映射）天然对齐，卫星自动压在真实星下点上。

const sat = require('./satellite.js'); // SGP4 全套（与星座地图同一份，分包各自内置，避免跨分包 require）
const tleStore = require('../../utils/tleStore.js');       // TLE 缓存/跨分组搜索索引/按组取星
const RE = 6378.137;          // 地球赤道半径 km (WGS-84，与链路计算一致)
const C_KM_S = 299792.458;    // 光速 km/s
const DEG = Math.PI / 180;
const REFRESH_MS = 1000;      // 「实时」开关刷新间隔（1Hz）
const COASTLINE = require('./coastline.js'); // 海岸线 + 国界 折线 [[lon,lat,...], ...]（度）

// 地固系 -> 渲染系（与星座地图 ecefToRender 完全一致）
const ecefToRender = (p) => [p.x, p.z, -p.y];

// 分组键 -> 中文名（与星座地图 GROUPS 一致，用于搜索结果显示所属星座）
const GROUP_LABEL = {
  all: '全部卫星', gps: 'GPS', glonass: 'GLONASS', beidou: '北斗', galileo: 'Galileo',
  o3b: 'O3b', geo: 'GEO', starlink: 'Starlink', oneweb: 'OneWeb', kuiper: 'Kuiper',
  qianfan: '千帆星座', guowang: '中国星网', iridium: '铱星', globalstar: 'Globalstar',
  stations: '空间站', planet: 'Planet', spire: 'Spire'
};

// 可选星座分组（先选分组、再在组内选具体卫星）；顺序按常用度排
const GROUP_LIST = ['guowang', 'qianfan', 'starlink', 'oneweb', 'kuiper', 'beidou', 'gps', 'glonass',
  'galileo', 'o3b', 'geo', 'iridium', 'globalstar', 'stations', 'planet', 'spire']
  .map((k) => ({ key: k, label: GROUP_LABEL[k] || k }));

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v, def) => {
  const n = parseFloat(v);
  return (isFinite(n)) ? n : def;
};

Page({
  data: {
    // 选星：先选分组 -> 组内搜索/选具体卫星
    groupList: GROUP_LIST,
    group1: '', group2: '',            // 已选分组 key（空=未选）
    group1Label: '', group2Label: '',  // 已选分组中文名（卫星右侧 chip 显示）
    groupOpen1: false, groupOpen2: false, // 分组选择浮层开关
    kw1: '', kw2: '',
    results1: [], results2: [],
    sat1Name: '', sat2Name: '',
    sat1Norad: '', sat2Norad: '',  // 已选星 NORAD（地球站对星栏展示）
    live: false,         // 「实时」开关，开启时 1Hz 刷新计算
    calcTime: '--',      // 本次 SGP4 计算时刻 HH:MM:SS
    timeOffset: 0,       // 时间轴：相对锚点的偏移（分钟，0~1440 = 0~24h）
    timePct: 0,          // 进度条填充/圆点位置（timeOffset/1440*100）
    timeLabel: '此刻',   // 时间轴当前对应的绝对时刻文本
    // 大气遮挡高度 (km)：视距切线需高于 RE+clearance（默认 100 km 大气层/卡门线）
    clearance: '100',
    // 计算结果
    dCur: '--',          // 当前 ISL 斜距 km
    dMax: '--',          // 几何视距上限 km
    losMargin: '--',     // 视距裕量 = 上限 − 当前 km
    thetaCur: '--',      // 当前地心角分离 °
    thetaMaxDeg: '--',   // 几何最大角分离 °
    tangentText: '--',   // 切线高度描述
    deltaH: '--',        // 两星高度差 km
    delayMs: '--',       // ISL 单向时延 ms
    rttMs: '--',         // ISL 往返时延 ms
    statusText: '视距通畅',
    blocked: false,
    // 显示开关
    show1: true, show2: true, showStation: true,
    autoRotate: true,    // 自转开关（UI 镜像 _autoRotate）
    // 地球站（辅助计算斜距）
    esLat: '39.93', esLon: '116.4',
    latHemi: '°N', lonHemi: '°E', esAddr: '--',
    slant1: '--', elev1: '--', az1: '--', esDelay1: '--', vis1: true,
    slant2: '--', elev2: '--', az2: '--', esDelay2: '--', vis2: true
  },

  // 渲染 / 交互状态
  _ctx: null,
  _canvas: null,
  _cw: 0,
  _ch: 0,
  _yaw: 0.6,
  _pitch: -0.42,
  _dragging: false,
  _lastX: 0,
  _lastY: 0,
  _autoRotate: true,
  _rafId: 0,
  _zoom: 1, _pinching: false, _pinchStartDist: 0, _pinchStartZoom: 1,
  _rec1: null, _rec2: null,       // 两颗星 satrec（null=未选）
  _groupSats1: null, _groupSats2: null, // 已选分组的全量卫星（组内搜索用，避免重复加载）
  _orbit1: null, _orbit2: null,   // 轨道环 render-XYZ 缓存
  _P1: null, _P2: null, _station: null,
  _R1: 0, _R2: 0, _maxR: RE * 3,  // 当前两星地心半径 + 自适应缩放基准
  _lastG: 0,                      // 最近一次计算用的 gmst（供轨道环重建复用）
  _calcMs: 0,                     // 最近一次计算的绝对时刻（ms，供轨道环采样起点）
  _baseTime: 0,                   // 时间轴锚点“此刻”（ms）；偏移在此基础上叠加
  _liveTimer: null,
  _trackLeft: 0, _trackW: 0,      // 自定义进度条触区的视口左缘/宽度（onReady 量一次，拖动时换算位置）

  onLoad() {
    this._baseTime = Date.now();  // 时间轴以进入页面的此刻为锚点（非实时探索）
    // 默认自动选两颗「中国星网」卫星（星下点贴近中国、连线跨在中国上空）；选不到再保持空结果
    this._recompute();
    this._pickDefaults();
  },

  onReady() {
    this._initCanvas();
    this._measureTrack();
  },

  onShow() {
    if (this.data.live) this._startLive(); // 仅当开关开启时恢复实时
  },
  onHide() {
    this._stopLive(); // 后台不空跑（开关状态保留，回前台再恢复）
  },
  onUnload() {
    this._stopLive();
    if (this._rafId && this._canvas) this._canvas.cancelAnimationFrame(this._rafId);
  },

  // ===================== 实时开关（1Hz） =====================
  _startLive() {
    if (this._liveTimer) return;
    this._liveTimer = setInterval(() => {
      this._recompute();
      this._refreshOrbits(this._lastG); // 地球已自转 -> 轨道环随之重建
    }, REFRESH_MS);
  },
  _stopLive() {
    if (this._liveTimer) { clearInterval(this._liveTimer); this._liveTimer = null; }
  },
  toggleLive() {
    const live = !this.data.live;
    if (live) {
      this.setData({ live });
      this._startLive();
    } else {
      // 退出实时：以当前真实时刻为新锚点，时间轴回到“此刻”
      this._stopLive();
      this._baseTime = Date.now();
      this.setData({ live: false, timeOffset: 0, timePct: 0 });
      this._recompute();
      this._refreshOrbits(this._lastG);
    }
    wx.vibrateShort({ type: 'light' });
  },

  // ===================== 时间轴（非实时，0~24h） =====================
  // 计算用时刻：实时=真实此刻；否则=锚点 + 偏移
  _calcAt() {
    if (this.data.live) return new Date();
    return new Date(this._baseTime + this.data.timeOffset * 60000);
  },
  // 量一次进度条触区的视口左缘/宽度（横向布局固定，页面仅纵向滚动，量一次即可复用）
  _measureTrack(cb) {
    wx.createSelectorQuery().in(this).select('.tb-track').boundingClientRect((r) => {
      if (r && r.width > 0) { this._trackLeft = r.left; this._trackW = r.width; }
      if (cb) cb();
    }).exec();
  },
  // 触摸位置 -> 偏移：换算 0~1440min，自动退出实时，按偏移重算并重建轨道环
  // 节流到 ~16fps，避免拖动时 setData 过密；touchend 会清节流确保落点精确
  _applyTouch(clientX) {
    if (!this._trackW) return;
    let pct = (clientX - this._trackLeft) / this._trackW;
    pct = clamp(pct, 0, 1);
    const v = Math.round(pct * 1440);
    const patch = { timeOffset: v, timePct: v / 1440 * 100 };
    if (this.data.live) { patch.live = false; this._stopLive(); }
    this.setData(patch);
    const now = Date.now();
    if (now - (this._lastTimeCalc || 0) < 60) return;
    this._lastTimeCalc = now;
    this._recompute();
    this._refreshOrbits(this._lastG);
  },
  onTrackTouch(e) {
    const t = e.touches && e.touches[0];
    if (!t) return;
    if (this._trackW) this._applyTouch(t.clientX);
    else this._measureTrack(() => this._applyTouch(t.clientX)); // 首触若未量到则补量
  },
  onTrackEnd(e) {
    const t = e.changedTouches && e.changedTouches[0];
    if (!t || !this._trackW) return;
    this._lastTimeCalc = 0; // 清节流，保证抬手落点精确
    this._applyTouch(t.clientX);
  },
  resetTime() {
    if (this.data.live || !this.data.timeOffset) return; // 实时态/已在此刻：无需重置
    this._baseTime = Date.now();
    this.setData({ timeOffset: 0, timePct: 0 });
    this._recompute();
    this._refreshOrbits(this._lastG);
    wx.vibrateShort({ type: 'light' });
  },
  // 精调步进：在拖动粗选后用 ±1m/±10m/±1h 精确落到目标分钟（限制在 0~24h 内）
  stepTime(e) {
    if (this.data.live) return; // 实时态不步进
    const delta = parseInt(e.currentTarget.dataset.d, 10) || 0;
    const v = clamp((this.data.timeOffset || 0) + delta, 0, 1440);
    if (v === this.data.timeOffset) return; // 已到端点：不空转
    this.setData({ timeOffset: v, timePct: v / 1440 * 100 });
    this._recompute();
    this._refreshOrbits(this._lastG);
    wx.vibrateShort({ type: 'light' });
  },

  // ===================== 选分组 / 组内选星 =====================
  // 展开/收起分组浮层（同时关掉另一槽的分组浮层，避免两层叠在一起）
  toggleGroup1() { this.setData({ groupOpen1: !this.data.groupOpen1, groupOpen2: false }); this._resumeDraw(); },
  toggleGroup2() { this.setData({ groupOpen2: !this.data.groupOpen2, groupOpen1: false }); this._resumeDraw(); },

  onPickGroup1(e) { const ds = e.currentTarget.dataset; this._selectGroup(1, ds.key, ds.label); },
  onPickGroup2(e) { const ds = e.currentTarget.dataset; this._selectGroup(2, ds.key, ds.label); },

  // 选定分组：记录分组、清空原有搜索/选星，加载该组全量卫星并直接列出（便于立刻挑具体卫星）
  _selectGroup(slot, key, label) {
    this.setData({
      ['group' + slot]: key, ['group' + slot + 'Label']: label,
      ['groupOpen' + slot]: false, ['kw' + slot]: '', ['results' + slot]: []
    });
    wx.vibrateShort({ type: 'light' });
    // 全选=跨全部星座的搜索索引；其余=单组全量 TLE
    const loader = (key === 'all')
      ? tleStore.ensureSearchIndex().then((index) => ({ sats: index || [] }))
      : tleStore.loadGroupSats(key);
    loader.then(({ sats }) => {
      // GEO：预算每颗定点经度并按经度排序（定点星经度基本不变，进组时算一次即可）
      this['_groupSats' + slot] = (key === 'geo') ? this._withGeoLon(sats || []) : (sats || []);
      this._filterGroup(slot, '');
    }).catch(() => wx.showToast({ title: '分组加载失败', icon: 'none' }));
  },
  // 给 GEO 卫星标注定点经度（SGP4 取此刻星下点经度）并按经度升序排
  _withGeoLon(sats) {
    const T = new Date(), g = sat.gstime(T);
    const out = sats.map((s) => {
      let lon = NaN;
      try {
        const rec = sat.twoline2satrec(s.line1, s.line2);
        if (rec && !rec.error) {
          const pv = sat.propagate(rec, T);
          if (pv && pv.position) lon = sat.eciToGeodetic(pv.position, g).longitude / DEG;
        }
      } catch (e) { /* 解析失败的留空，排到末尾 */ }
      const lonText = isFinite(lon) ? `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}` : '';
      return Object.assign({}, s, { lon, lonText });
    });
    // 从东经 100° 起、往东递增绕一圈排序（100°E 排最前，无经度的排末尾）
    const key = (lon) => isFinite(lon) ? ((lon - 100 + 360) % 360) : 1e9;
    out.sort((a, b) => key(a.lon) - key(b.lon));
    return out;
  },
  // 组内按关键字过滤（空关键字=列出前若干颗）；全选态下每条用其真实所属星座
  _filterGroup(slot, raw) {
    const sats = this['_groupSats' + slot] || [];
    const kw = (raw || '').trim().toLowerCase();
    const grp = this.data['group' + slot], label = this.data['group' + slot + 'Label'];
    const isAll = grp === 'all';
    const out = [];
    for (let i = 0; i < sats.length && out.length < 60; i++) {
      const s = sats[i];
      if (!kw || s.name.toLowerCase().indexOf(kw) >= 0 || String(s.noradId).indexOf(kw) >= 0) {
        const g = isAll ? (s.group || '') : grp;
        out.push({ name: s.name, noradId: s.noradId, group: g, groupLabel: isAll ? (GROUP_LABEL[g] || g) : label, lonText: s.lonText || '' });
      }
    }
    this.setData({ ['results' + slot]: out });
    this._resumeDraw(); // 结果增减会改变地球显隐 -> 重启绘制循环（隐藏期间 RAF 可能已停）
  },
  onSearchInput1(e) { this.setData({ kw1: e.detail.value }); if (this.data.group1) this._filterGroup(1, e.detail.value); },
  onSearchInput2(e) { this.setData({ kw2: e.detail.value }); if (this.data.group2) this._filterGroup(2, e.detail.value); },
  // 点搜索框：已选分组 -> 直接重列该组全部卫星（不打字也能挑/换星）；未选分组 -> 展开分组选择来引导
  onSearchFocus1() { if (this.data.group1) this._filterGroup(1, ''); else this.setData({ groupOpen1: true, groupOpen2: false }); },
  onSearchFocus2() { if (this.data.group2) this._filterGroup(2, ''); else this.setData({ groupOpen2: true, groupOpen1: false }); },

  _pick(noradId, group, slot) {
    tleStore.loadGroupSats(group).then(({ sats }) => {
      const id = String(noradId);
      const s = (sats || []).find((x) => String(x.noradId) === id);
      if (!s) { wx.showToast({ title: '未找到该星 TLE', icon: 'none' }); return; }
      let rec;
      try { rec = sat.twoline2satrec(s.line1, s.line2); } catch (e) { rec = null; }
      if (!rec || rec.error) { wx.showToast({ title: 'TLE 解析失败', icon: 'none' }); return; }
      if (slot === 1) { this._rec1 = rec; this.setData({ sat1Name: s.name, sat1Norad: s.noradId, kw1: s.name, results1: [] }); }
      else { this._rec2 = rec; this.setData({ sat2Name: s.name, sat2Norad: s.noradId, kw2: s.name, results2: [] }); }
      this._recompute();
      this._refreshOrbits(this._lastG);
      this._resumeDraw(); // 选定后列表收起、地球恢复 -> 重启绘制循环
      wx.vibrateShort({ type: 'light' });
    }).catch(() => wx.showToast({ title: '加载失败', icon: 'none' }));
  },
  onPickResult1(e) { const ds = e.currentTarget.dataset; this._pick(ds.norad, ds.group, 1); },
  onPickResult2(e) { const ds = e.currentTarget.dataset; this._pick(ds.norad, ds.group, 2); },
  // 关闭卫星列表浮层（不选也能退出；已选卫星保持不变）
  closeResults1() { this.setData({ results1: [] }); this._resumeDraw(); },
  closeResults2() { this.setData({ results2: [] }); this._resumeDraw(); },
  // 点空白遮罩：一并收起分组与卫星列表，地球恢复
  closeAllPops() { this.setData({ groupOpen1: false, groupOpen2: false, results1: [], results2: [] }); this._resumeDraw(); },

  // 进页面默认选两颗「中国星网(HULIANWANG)」卫星：取此刻星下点最贴近中国、且彼此较近的一对，
  // 让初始 ISL 连线就跨在中国上空。数据走 tleStore（与搜索同源），任何环节失败则静默保持未选。
  _pickDefaults() {
    if (this._rec1 || this._rec2) return; // 用户已手动选过则不覆盖
    const T = new Date();
    const g = sat.gstime(T);
    const CLAT = 35, CLON = 105;                                  // 中国大致中心
    const inChina = (la, lo) => la >= 5 && la <= 60 && lo >= 65 && lo <= 145;
    // 经度差按纬度余弦缩放，得到近似地表角距（°）
    const dist = (a, b) => {
      const dLat = a.lat - b.lat;
      const dLon = (a.lon - b.lon) * Math.cos((a.lat + b.lat) / 2 * DEG);
      return Math.hypot(dLat, dLon);
    };
    tleStore.loadGroupSats('guowang').then(({ sats }) => {
      if (this._rec1 || this._rec2) return;
      const cand = [];
      (sats || []).forEach((s) => {
        let rec; try { rec = sat.twoline2satrec(s.line1, s.line2); } catch (e) { return; }
        if (!rec || rec.error) return;
        let pv; try { pv = sat.propagate(rec, T); } catch (e) { return; }
        if (!pv || !pv.position) return;
        const gd = sat.eciToGeodetic(pv.position, g);
        cand.push({ s, rec, lat: gd.latitude / DEG, lon: gd.longitude / DEG });
      });
      if (!cand.length) return;
      const center = { lat: CLAT, lon: CLON };
      const over = cand.filter((c) => inChina(c.lat, c.lon));
      const pool = over.length ? over : cand;
      pool.sort((a, b) => dist(a, center) - dist(b, center));
      const first = pool[0];
      // 第二颗：挑离第一颗最近者（连线短、确保跨在中国上空）；两颗以上在境内时优先在境内挑
      const secPool = (over.length >= 2) ? over : cand;
      let second = null, best = Infinity;
      secPool.forEach((c) => {
        if (String(c.s.noradId) === String(first.s.noradId)) return;
        const dd = dist(c, first);
        if (dd < best) { best = dd; second = c; }
      });
      if (!second) return;
      this._rec1 = first.rec;
      this._rec2 = second.rec;
      this._groupSats1 = sats; this._groupSats2 = sats; // 默认组缓存，后续组内搜索零加载
      const gwLabel = GROUP_LABEL.guowang;
      this.setData({
        group1: 'guowang', group1Label: gwLabel,
        group2: 'guowang', group2Label: gwLabel,
        sat1Name: first.s.name, sat1Norad: first.s.noradId, kw1: first.s.name,
        sat2Name: second.s.name, sat2Norad: second.s.noradId, kw2: second.s.name
      });
      this._recompute();
      this._refreshOrbits(this._lastG);
    }).catch(() => {});
  },
  // 清除：保留已选分组，仅清掉关键字与已选卫星，并重新列出该组（便于改选同组其它星）
  clearSearch1() { this._rec1 = null; this._orbit1 = null; this.setData({ kw1: '', sat1Name: '', sat1Norad: '' }); this._recompute(); if (this.data.group1) this._filterGroup(1, ''); else { this.setData({ results1: [] }); this._resumeDraw(); } },
  clearSearch2() { this._rec2 = null; this._orbit2 = null; this.setData({ kw2: '', sat2Name: '', sat2Norad: '' }); this._recompute(); if (this.data.group2) this._filterGroup(2, ''); else { this.setData({ results2: [] }); this._resumeDraw(); } },

  _fmtTime(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  },
  // 时间轴标签：偏移 0 显示“此刻”，否则显示绝对时刻 MM-DD HH:MM（含偏移）
  _fmtStamp(d) {
    const p = (n) => String(n).padStart(2, '0');
    const off = this.data.timeOffset;
    if (this.data.live || !off) return this.data.live ? '实时' : '此刻';
    const oh = Math.floor(off / 60), om = off % 60;
    return `+${oh}h${p(om)}m · ${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  },

  // ===================== 轨道几何（真实 TLE / SGP4） =====================

  // 某 satrec 在时刻 T 的渲染坐标 + 地心半径 + 高度。失败/未选返回 null。
  // ECI -> eciToEcf(gmst) -> render[x,z,-y]，与海岸线/地球站同系，落在真实星下点。
  _stateOf(rec, T, g) {
    if (!rec) return null;
    let pv;
    try { pv = sat.propagate(rec, T); } catch (e) { return null; }
    if (!pv || !pv.position) return null;
    const ecf = sat.eciToEcf(pv.position, g);
    const R = Math.hypot(ecf.x, ecf.y, ecf.z);
    return { P: ecefToRender(ecf), R, h: R - RE };
  },

  // 轨道环：从“现在”起步进覆盖一个周期，统一用同一 gmst 转地固（得到相对当前地球朝向的惯性轨道环）
  _buildOrbit(rec, g) {
    if (!rec || !rec.no) return null;
    const periodMs = (2 * Math.PI / rec.no) * 60000; // no 单位 rad/min
    const N = 120, t0 = this._calcMs || Date.now(), pts = [];
    for (let k = 0; k <= N; k++) {
      let pv;
      try { pv = sat.propagate(rec, new Date(t0 + periodMs * (k / N))); } catch (e) { continue; }
      if (pv && pv.position) pts.push(ecefToRender(sat.eciToEcf(pv.position, g)));
    }
    return pts.length ? pts : null;
  },
  _refreshOrbits(g) {
    this._orbit1 = this._buildOrbit(this._rec1, g);
    this._orbit2 = this._buildOrbit(this._rec2, g);
  },

  // 地球站地表位置（与海岸线同一坐标系：极轴=Y，经度 0 在 +X，经度取负以对齐地图朝向）
  _stationPos(latDeg, lonDeg) {
    const lat = latDeg * DEG, lon = lonDeg * DEG;
    const cl = Math.cos(lat);
    return [RE * cl * Math.cos(lon), RE * Math.sin(lat), -RE * cl * Math.sin(lon)];
  },

  // 地球站到卫星的斜距 / 仰角 / 方位角（本地 ENU 坐标，极轴=Y）
  _slant(station, P) {
    const lx = P[0] - station[0], ly = P[1] - station[1], lz = P[2] - station[2];
    const slant = Math.sqrt(lx * lx + ly * ly + lz * lz);
    // 本地天顶 up = 站点单位矢量
    const ux = station[0] / RE, uy = station[1] / RE, uz = station[2] / RE;
    // 东向 east = normalize(up × Y轴)
    let ex = -uz, ey = 0, ez = ux;
    const en = Math.hypot(ex, ey, ez) || 1;
    ex /= en; ey /= en; ez /= en;
    // 北向 north = east × up
    const nx = ey * uz - ez * uy, ny = ez * ux - ex * uz, nz = ex * uy - ey * ux;
    const e = lx * ex + ly * ey + lz * ez;
    const n = lx * nx + ly * ny + lz * nz;
    const u = lx * ux + ly * uy + lz * uz;
    const elev = slant > 0 ? Math.asin(clamp(u / slant, -1, 1)) / DEG : 0;
    let az = Math.atan2(e, n) / DEG;
    if (az < 0) az += 360;
    return { slant, elev, az };
  },

  _recompute() {
    const d = this.data;
    const T = this._calcAt();
    const g = sat.gstime(T);
    this._lastG = g;
    this._calcMs = T.getTime();
    const Rc = RE + Math.max(0, num(d.clearance, 0));

    const st1 = this._stateOf(this._rec1, T, g);
    const st2 = this._stateOf(this._rec2, T, g);
    this._P1 = st1 ? st1.P : null;
    this._P2 = st2 ? st2.P : null;
    this._R1 = st1 ? st1.R : 0;
    this._R2 = st2 ? st2.R : 0;
    this._maxR = Math.max(this._R1, this._R2, RE * 1.05);

    // 地球站（始终可算）：输入框存正数“量值”，半球由 latHemi/lonHemi 决定符号（南纬/西经取负）
    const latMag = Math.abs(num(d.esLat, 0));
    const lonMag = Math.abs(num(d.esLon, 0));
    const latV = (d.latHemi === '°S') ? -latMag : latMag;
    const lonV = (d.lonHemi === '°W') ? -lonMag : lonMag;
    const station = this._stationPos(latV, lonV);
    this._station = station;

    const patch = {
      calcTime: this._fmtTime(T),
      timeLabel: this._fmtStamp(T),
      esAddr: `${lonMag}${d.lonHemi} / ${latMag}${d.latHemi}`
    };

    // 各星对地球站的斜距 / 仰角 / 方位角
    const fillStation = (st, n) => {
      if (st) {
        const a = this._slant(station, st.P);
        patch['slant' + n] = a.slant.toFixed(1);
        patch['elev' + n] = a.elev.toFixed(1);
        patch['az' + n] = a.az.toFixed(1);
        patch['esDelay' + n] = (a.slant / C_KM_S * 1000).toFixed(3);
        patch['vis' + n] = a.elev >= 0;
      } else {
        patch['slant' + n] = '--'; patch['elev' + n] = '--'; patch['az' + n] = '--';
        patch['esDelay' + n] = '--'; patch['vis' + n] = true;
      }
    };
    fillStation(st1, 1);
    fillStation(st2, 2);

    if (st1 && st2) {
      const P1 = st1.P, P2 = st2.P, R1 = st1.R, R2 = st2.R;
      // 弦长 + 当前地心角
      const dx = P2[0] - P1[0], dy = P2[1] - P1[1], dz = P2[2] - P1[2];
      const dCur = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const dot = P1[0] * P2[0] + P1[1] * P2[1] + P1[2] * P2[2];
      const thetaCur = Math.acos(clamp(dot / (R1 * R2), -1, 1)) / DEG;

      // 视线与地心最近距离（切线高度）
      const dd = dx * dx + dy * dy + dz * dz;
      const t = dd > 0 ? -(P1[0] * dx + P1[1] * dy + P1[2] * dz) / dd : -1;
      let minDist, hasGrazing;
      if (t > 0 && t < 1) {
        const fx = P1[0] + t * dx, fy = P1[1] + t * dy, fz = P1[2] + t * dz;
        minDist = Math.sqrt(fx * fx + fy * fy + fz * fz);
        hasGrazing = true;
      } else {
        minDist = Math.min(R1, R2);
        hasGrazing = false;
      }
      const tangentAlt = minDist - RE;
      const blocked = hasGrazing && (minDist < Rc);

      // 几何视距上限（与相位无关，仅取决于半径与余隙）
      const a1 = R1 > Rc ? Math.acos(clamp(Rc / R1, -1, 1)) : 0;
      const a2 = R2 > Rc ? Math.acos(clamp(Rc / R2, -1, 1)) : 0;
      const thetaMax = (a1 + a2) / DEG;
      const dMax = Math.sqrt(Math.max(0, R1 * R1 - Rc * Rc)) + Math.sqrt(Math.max(0, R2 * R2 - Rc * Rc));
      const delay = dCur / C_KM_S * 1000;

      patch.dCur = dCur.toFixed(1);
      patch.dMax = dMax.toFixed(1);
      patch.losMargin = (dMax - dCur).toFixed(1);
      patch.thetaCur = thetaCur.toFixed(1);
      patch.thetaMaxDeg = thetaMax.toFixed(1);
      patch.tangentText = hasGrazing ? `${tangentAlt.toFixed(0)} km` : '不掠地球';
      patch.deltaH = Math.abs(st1.h - st2.h).toFixed(0);
      patch.delayMs = delay.toFixed(3);
      patch.rttMs = (delay * 2).toFixed(3);
      patch.blocked = blocked;
      patch.statusText = blocked ? '视线被地球遮挡' : '视距通畅';
    } else {
      // 未选满两颗星 -> ISL 几何置空
      patch.dCur = '--'; patch.dMax = '--'; patch.losMargin = '--';
      patch.thetaCur = '--'; patch.thetaMaxDeg = '--'; patch.tangentText = '--';
      patch.deltaH = '--'; patch.delayMs = '--'; patch.rttMs = '--';
      patch.blocked = false; patch.statusText = '请选择两颗卫星';
    }

    this.setData(patch);
  },

  // ===================== 输入交互 =====================

  onInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [key]: e.detail.value }, () => this._recompute());
  },
  // 显示/隐藏 卫星1 / 卫星2 / 地球站（仅影响 3D 渲染，下一帧自动生效）
  onToggle(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [key]: !this.data[key] });
    wx.vibrateShort({ type: 'light' });
  },

  // 自转开关（按钮触发，与拖动/缩放暂停自转互不冲突）
  toggleRotate() {
    this._autoRotate = !this._autoRotate;
    this.setData({ autoRotate: this._autoRotate });
    wx.vibrateShort({ type: 'light' });
  },

  // 用户主动操作后关闭自转，并同步按钮状态
  _stopAutoRotate() {
    if (this._autoRotate) {
      this._autoRotate = false;
      this.setData({ autoRotate: false });
    }
  },

  // 点击经纬度后缀切换半球（正负号），以支持南纬 / 西经
  // 切换半球：只翻 °N/°S 或 °E/°W 标签，量值（输入框数字）保持正数不变，符号在 _recompute 里按半球取
  toggleHemi(e) {
    const key = e.currentTarget.dataset.key;
    if (key === 'esLat') {
      this.setData({ latHemi: this.data.latHemi === '°N' ? '°S' : '°N' }, () => this._recompute());
    } else {
      this.setData({ lonHemi: this.data.lonHemi === '°E' ? '°W' : '°E' }, () => this._recompute());
    }
    wx.vibrateShort({ type: 'light' });
  },

  // ===================== 3D 渲染 =====================

  _initCanvas(retry) {
    wx.createSelectorQuery().select('#globeCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        const r = res && res[0];
        // flex:1 的高度可能在 onReady 时尚未结算 -> 测得 0；短暂重试直到拿到真实尺寸，避免画布 0×0 黑屏
        if (!r || !r.node || !(r.width > 0) || !(r.height > 0)) {
          if ((retry || 0) < 12) setTimeout(() => this._initCanvas((retry || 0) + 1), 50);
          return;
        }
        const canvas = r.node;
        const ctx = canvas.getContext('2d');
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const dpr = info.pixelRatio || 2;
        canvas.width = r.width * dpr;
        canvas.height = r.height * dpr;
        ctx.scale(dpr, dpr);
        this._canvas = canvas;
        this._ctx = ctx;
        this._cw = r.width;
        this._ch = r.height;
        this._loop();
      });
  },

  _loop() {
    if (!this._canvas) return;
    if (this._autoRotate && !this._dragging && !this._pinching) this._yaw += 0.0006;
    this._draw();
    this._rafId = this._canvas.requestAnimationFrame(() => this._loop());
  },
  // 浮层关闭、地球从 hidden 恢复显示后，RAF 链可能已因隐藏中断 -> 重启一条（带去重，绝不双跑）
  _resumeDraw() {
    if (!this._canvas) return;
    if (this._rafId) { this._canvas.cancelAnimationFrame(this._rafId); this._rafId = 0; }
    this._loop();
  },

  // 旋转 + 正交投影
  // yaw/pitch 的 cos/sin 每帧只算一次(由 _draw 缓存到 this)，避免逐点重复三角运算
  _project(x, y, z, cx, cy, scale) {
    const cy0 = this._cYaw, sy0 = this._sYaw;
    let x1 = x * cy0 + z * sy0;
    let z1 = -x * sy0 + z * cy0;
    let y1 = y;
    const cp = this._cPitch, sp = this._sPitch;
    let y2 = y1 * cp - z1 * sp;
    let z2 = y1 * sp + z1 * cp;
    return { x: cx + x1 * scale, y: cy - y2 * scale, z: z2 };
  },

  _occluded(p, cx, cy, Rpx) {
    if (p.z >= 0) return false;
    const dx = p.x - cx, dy = p.y - cy;
    return (dx * dx + dy * dy) < Rpx * Rpx * 0.999;
  },

  _drawPath(pts, cx, cy, scale, Rpx, opt) {
    const ctx = this._ctx;
    const scr = pts.map(p => {
      const s = this._project(p[0], p[1], p[2], cx, cy, scale);
      s.hidden = this._occluded(s, cx, cy, Rpx);
      return s;
    });
    let prevHidden = null;
    ctx.lineWidth = opt.width || 1;
    for (let i = 1; i < scr.length; i++) {
      const a = scr[i - 1], b = scr[i];
      const hidden = a.hidden || b.hidden;
      if (hidden !== prevHidden) {
        if (prevHidden !== null) ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.strokeStyle = hidden ? (opt.hiddenColor || 'rgba(255,255,255,0.12)') : opt.color;
        ctx.setLineDash(hidden ? [3, 4] : (opt.dash || []));
        prevHidden = hidden;
      }
      ctx.lineTo(b.x, b.y);
    }
    if (prevHidden !== null) ctx.stroke();
    ctx.setLineDash([]);
  },

  _draw() {
    const ctx = this._ctx;
    const w = this._cw, h = this._ch;
    const cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);

    // 本帧旋转矩阵的三角量缓存，供 _project 逐点复用
    this._cYaw = Math.cos(this._yaw); this._sYaw = Math.sin(this._yaw);
    this._cPitch = Math.cos(this._pitch); this._sPitch = Math.sin(this._pitch);

    const d = this.data;

    const half = Math.min(w, h) / 2 * 0.92;
    const maxOrbit = this._maxR || RE * 3;        // 由当前两星地心半径自适应（_recompute 维护）
    const scale = half / maxOrbit * this._zoom;   // 自适应基准 × 用户缩放（双指/滚轮）
    const Rpx = RE * scale;

    // 大气薄辉光
    const glow = ctx.createRadialGradient(cx, cy, Rpx * 0.99, cx, cy, Rpx * 1.09);
    glow.addColorStop(0, 'rgba(90,130,165,0.12)');
    glow.addColorStop(1, 'rgba(90,130,165,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, Rpx * 1.09, 0, Math.PI * 2);
    ctx.fill();

    // 地球球体（低饱和、定向光照）
    const lightX = cx - Rpx * 0.3, lightY = cy - Rpx * 0.34;
    const earth = ctx.createRadialGradient(lightX, lightY, Rpx * 0.1, cx, cy, Rpx * 1.05);
    earth.addColorStop(0, '#3a5269');
    earth.addColorStop(0.5, '#263a4d');
    earth.addColorStop(0.82, '#172734');
    earth.addColorStop(1, '#0c1722');
    ctx.fillStyle = earth;
    ctx.beginPath();
    ctx.arc(cx, cy, Rpx, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, Rpx, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(110,145,180,0.22)';
    ctx.stroke();

    this._drawGraticule(cx, cy, scale, Rpx);
    this._drawCoastline(cx, cy, scale, Rpx);

    const show1 = d.show1, show2 = d.show2, showSt = d.showStation;

    // 两条真实轨道环（缓存 render-XYZ，逐帧只做投影）
    if (show1 && this._orbit1) this._drawPath(this._orbit1, cx, cy, scale, Rpx, { color: 'rgba(111,159,200,0.4)', hiddenColor: 'rgba(255,255,255,0.08)', width: 1 });
    if (show2 && this._orbit2) this._drawPath(this._orbit2, cx, cy, scale, Rpx, { color: 'rgba(194,162,94,0.4)', hiddenColor: 'rgba(255,255,255,0.08)', width: 1 });

    const P1 = this._P1, P2 = this._P2; // null=该星未选/传播失败

    // ISL 链路（两星都已选且都显示时才画）
    if (show1 && show2 && P1 && P2) {
      const blocked = d.blocked;
      const linePts = [];
      const N = 60;
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        linePts.push([
          P1[0] + (P2[0] - P1[0]) * t,
          P1[1] + (P2[1] - P1[1]) * t,
          P1[2] + (P2[2] - P1[2]) * t
        ]);
      }
      this._drawPath(linePts, cx, cy, scale, Rpx, {
        color: blocked ? '#c25b58' : '#5a93a8',
        hiddenColor: blocked ? 'rgba(194,91,88,0.22)' : 'rgba(90,147,168,0.18)',
        width: 1.6,
        dash: blocked ? [6, 5] : []
      });
    }

    // 地球站斜距线（站与对应卫星都显示时才画）
    const station = this._station || this._stationPos(
      (d.latHemi === '°S' ? -1 : 1) * Math.abs(num(d.esLat, 0)),
      (d.lonHemi === '°W' ? -1 : 1) * Math.abs(num(d.esLon, 0)));
    if (showSt && show1 && P1) this._drawSlant(station, P1, cx, cy, scale, Rpx, d.vis1);
    if (showSt && show2 && P2) this._drawSlant(station, P2, cx, cy, scale, Rpx, d.vis2);

    if (show1 && P1) this._drawSat(P1, cx, cy, scale, Rpx, '#6f9fc8', '卫星1');
    if (show2 && P2) this._drawSat(P2, cx, cy, scale, Rpx, '#c2a25e', '卫星2');
    if (showSt) this._drawStation(station, cx, cy, scale, Rpx);
  },

  // 站→星斜距线（可见绿、地平线下红，被地球挡住部分自动虚淡）
  _drawSlant(station, P, cx, cy, scale, Rpx, visible) {
    const pts = [];
    const N = 40;
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      pts.push([
        station[0] + (P[0] - station[0]) * t,
        station[1] + (P[1] - station[1]) * t,
        station[2] + (P[2] - station[2]) * t
      ]);
    }
    this._drawPath(pts, cx, cy, scale, Rpx, {
      color: visible ? '#6fb88f' : '#b87a6f',
      hiddenColor: visible ? 'rgba(111,184,143,0.18)' : 'rgba(184,122,111,0.15)',
      width: 1,
      dash: [4, 4]
    });
  },

  _drawStation(station, cx, cy, scale, Rpx) {
    const ctx = this._ctx;
    const s = this._project(station[0], station[1], station[2], cx, cy, scale);
    const hidden = this._occluded(s, cx, cy, Rpx);
    const r = hidden ? 3 : 4.5;
    // 方块标记
    ctx.beginPath();
    ctx.rect(s.x - r, s.y - r, r * 2, r * 2);
    ctx.fillStyle = '#6fb88f';
    ctx.globalAlpha = hidden ? 0.4 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (!hidden) this._label('地球站', s.x + 8, s.y + 4, '#a9d6bd');
  },

  // 带暗色描边的小标签，提升在轨道线上的可读性
  _label(text, x, y, color) {
    const ctx = this._ctx;
    ctx.font = '11px sans-serif';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(8,12,18,0.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color || 'rgba(214,222,232,0.95)';
    ctx.fillText(text, x, y);
  },

  _drawGraticule(cx, cy, scale, Rpx) {
    for (let lat = -60; lat <= 60; lat += 30) {
      const latR = lat * DEG;
      const pts = [];
      for (let lon = 0; lon <= 360; lon += 6) {
        const r = lon * DEG;
        pts.push([RE * Math.cos(latR) * Math.cos(r), RE * Math.sin(latR), RE * Math.cos(latR) * Math.sin(r)]);
      }
      this._drawPath(pts, cx, cy, scale, Rpx, {
        color: lat === 0 ? 'rgba(150,180,210,0.35)' : 'rgba(150,180,210,0.16)',
        hiddenColor: 'rgba(150,180,210,0.04)',
        width: lat === 0 ? 1 : 0.6
      });
    }
    for (let lon = 0; lon < 360; lon += 30) {
      const r = lon * DEG;
      const pts = [];
      for (let lat = -90; lat <= 90; lat += 6) {
        const latR = lat * DEG;
        pts.push([RE * Math.cos(latR) * Math.cos(r), RE * Math.sin(latR), RE * Math.cos(latR) * Math.sin(r)]);
      }
      this._drawPath(pts, cx, cy, scale, Rpx, {
        color: 'rgba(150,180,210,0.14)',
        hiddenColor: 'rgba(150,180,210,0.04)',
        width: 0.6
      });
    }
  },

  // 陆地/海岸线轮廓：每条折线投到地球表面（与经纬网同坐标系：极轴=Y，经度0在+X，绕Y到+Z）
  // 复用 _drawPath，背面自动虚淡，正面实线。
  // 球面 XYZ 与经纬度无关、不随旋转变化，故首帧构建一次缓存到 this._coastXYZ，
  // 后续帧只做投影，避免对 2 万+ 点逐帧重复三角运算（50m 数据下这是性能关键）。
  _buildCoastXYZ() {
    const polys = [];
    for (let p = 0; p < COASTLINE.length; p++) {
      const poly = COASTLINE[p];
      if (poly.length < 4) continue;
      const pts = [];
      for (let k = 0; k < poly.length; k += 2) {
        const lon = poly[k] * DEG, lat = poly[k + 1] * DEG;
        const cl = Math.cos(lat);
        // 经度取负：修正东西镜像（与 isl-visual 既有坐标系手性对齐，使大陆朝向正确）
        pts.push([RE * cl * Math.cos(lon), RE * Math.sin(lat), -RE * cl * Math.sin(lon)]);
      }
      polys.push(pts);
    }
    return polys;
  },

  _drawCoastline(cx, cy, scale, Rpx) {
    if (!this._coastXYZ) this._coastXYZ = this._buildCoastXYZ();
    const polys = this._coastXYZ;
    for (let p = 0; p < polys.length; p++) {
      this._drawPath(polys[p], cx, cy, scale, Rpx, {
        color: 'rgba(150,185,215,0.55)',
        hiddenColor: 'rgba(150,185,215,0.08)',
        width: 0.7
      });
    }
  },

  _drawSat(p, cx, cy, scale, Rpx, color, label) {
    const ctx = this._ctx;
    const s = this._project(p[0], p[1], p[2], cx, cy, scale);
    const hidden = this._occluded(s, cx, cy, Rpx);
    ctx.beginPath();
    ctx.arc(s.x, s.y, hidden ? 3.5 : 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = hidden ? 0.35 : 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(s.x, s.y, hidden ? 1.5 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#dfe6ee';
    ctx.fill();
    if (!hidden) this._label(label, s.x + 9, s.y - 7, color);
  },

  // ===================== 触摸旋转 =====================

  _touchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  },

  onTouchStart(e) {
    if (e.touches.length >= 2) {
      // 双指：进入缩放（暂停自转，不改变自转开关本身）
      this._pinching = true;
      this._dragging = false;
      this._stopAutoRotate();
      this._pinchStartDist = this._touchDist(e.touches);
      this._pinchStartZoom = this._zoom;
      return;
    }
    const t = e.touches[0];
    this._dragging = true;
    this._stopAutoRotate();
    this._lastX = t.clientX;
    this._lastY = t.clientY;
  },
  onTouchMove(e) {
    if (this._pinching && e.touches.length >= 2) {
      const d = this._touchDist(e.touches);
      if (this._pinchStartDist > 0) {
        this._zoom = clamp(this._pinchStartZoom * (d / this._pinchStartDist), 0.3, 50);
      }
      return;
    }
    if (!this._dragging) return;
    const t = e.touches[0];
    this._yaw += (t.clientX - this._lastX) * 0.01;
    this._pitch = clamp(this._pitch + (t.clientY - this._lastY) * 0.01, -1.45, 1.45);
    this._lastX = t.clientX;
    this._lastY = t.clientY;
  },
  onTouchEnd(e) {
    // 缩放手势结束（可能仍残留一根手指）
    if (this._pinching) {
      this._dragging = false;
      if (!e.touches || e.touches.length === 0) this._pinching = false;
      return;
    }
    this._dragging = false;
  },

  // 滚轮缩放（仅 PC 微信会派发 wheel；移动端触屏不产生此事件，对移动端无影响）
  onWheel(e) {
    const d = e.detail || {};
    const dy = (d.deltaY != null ? d.deltaY : d.delta) || 0;
    if (!dy) return;
    // 向上滚放大、向下滚缩小；指数手感顺滑，单次步进做边界以防触控板大 delta 跳变
    const factor = clamp(Math.exp(-dy * 0.0015), 0.5, 2);
    // 复用 pinch 相同的缩放上下限，保证两个入口一致
    this._zoom = clamp(this._zoom * factor, 0.3, 50);
  }
});

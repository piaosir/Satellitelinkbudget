// 星座地图：从云存储读取 CelesTrak TLE，前端用 SGP4 算“此刻”位置，在 3D 地球上以亮点展示星座。
// 静态快照（不做实时动画）：打开页面 / 切换分组 / 点“刷新此刻”时各算一次位置。
// 渲染核（正交投影 / 海岸线 / 经纬网 / 背面虚化 / 触摸旋转）复用自 isl-visual。
//
// 坐标系：极轴=Y、经度0在+X、绕Y到+Z、经度取负镜像（与 coastline 一致，地球固连/地理系）。
// 卫星 ECI 先经 eciToEcf(gmstNow) 转到地固系，再 ecef[x,y,z] -> render[x, z, -y]，与海岸线天然对齐。

const sat = require('../../utils/satellite.js');
const COASTLINE = require('./coastline.js');
const tleStore = require('../../utils/tleStore.js');

const RE = 6378.137;          // 地球赤道半径 km
const DEG = Math.PI / 180;
const ENV_ID = 'cloud1-8gjv5ekx41d6fb76';
const BUCKET = '636c-cloud1-8gjv5ekx41d6fb76-1385987144';
const MAX_RENDER = 3000;      // 单分组渲染点数上限（数据全保留，仅渲染抽稀以保流畅）
const MAX_RENDER_ALL = 3500; // “全部卫星”模式渲染上限：先放满非 Starlink，再用 Starlink 垫到该数

// Starlink 太大(~1.77MB)，云函数 60s 内拉不动 -> 前端众包（见 utils/tleStore）：
// 启动时已后台刷新云存储；进入本页时若云存储无当天数据，再本机直连兜底拉取。
const STARLINK_MAX_AGE_MS = 24 * 3600 * 1000;
const REFRESH_MS = 1000;      // 卫星位置实时刷新间隔（1Hz，由“刷新”开关独立控制，与旋转互不影响）

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 显示名 + 云存储分组键（与云函数 fetchTLE 的键一致）
const GROUPS = [
  { key: 'all', label: '全部卫星' }, // 合并显示所有星座
  { key: 'gps', label: 'GPS' },
  { key: 'glonass', label: 'GLONASS' },
  { key: 'beidou', label: '北斗' },
  { key: 'galileo', label: 'Galileo' },
  { key: 'o3b', label: 'O3b' },
  { key: 'geo', label: 'GEO' },
  { key: 'starlink', label: 'Starlink' },
  { key: 'oneweb', label: 'OneWeb' },
  { key: 'qianfan', label: '千帆' },
  { key: 'guowang', label: '国网' },
  { key: 'iridium', label: '铱星' },
  { key: 'globalstar', label: 'Globalstar' },
  { key: 'stations', label: '空间站' }
];
// 默认选中“国网/星网”（中国星网 China SatNet）
const DEFAULT_GROUP_INDEX = Math.max(0, GROUPS.findIndex((g) => g.key === 'guowang'));

// 分组键 -> 显示名
const GROUP_LABEL = {};
GROUPS.forEach((g) => { GROUP_LABEL[g.key] = g.label; });

// 地固系 -> 渲染系
const ecefToRender = (p) => [p.x, p.z, -p.y];

Page({
  data: {
    groups: GROUPS,
    groupIndex: DEFAULT_GROUP_INDEX, // 默认“国网/星网”
    loading: false,
    statusText: '',
    satCount: 0,             // 该组卫星总数
    shownCount: 0,           // 实际渲染点数
    decimated: false,        // 是否抽稀
    dataTime: '',            // TLE 历元/数据时间（fetchedAt）
    calcTime: '',            // 本次 SGP4 计算时刻
    selected: null,          // 选中卫星信息卡
    autoRotate: true,
    liveRefresh: false,      // 实时刷新卫星位置开关（与旋转独立，1Hz）
    keyword: '',             // 搜索关键字
    searchResults: []        // 搜索结果 [{idx, name, noradId, slot}]
  },

  // 渲染 / 数据状态
  _ctx: null, _canvas: null, _cw: 0, _ch: 0,
  _yaw: 0.6, _pitch: -0.42,
  _dragging: false, _moved: 0, _lastX: 0, _lastY: 0,
  _zoom: 1, _pinching: false, _pinchStartDist: 0, _pinchStartZoom: 1,
  _autoRotate: true, _rafId: 0,
  _recs: [],          // satrec 数组（全部）
  _meta: [],          // [{name, noradId}]
  _render: [],        // 渲染用：[{idx, pos:[x,y,z]}]（已抽稀）
  _screen: [],        // 每帧投影后的屏幕坐标缓存，用于点击命中
  _coastXYZ: null,
  _selIdx: -1,        // 选中卫星在 _recs 中的下标
  _selOrbit: null, _selTrack: null, _selFootprint: null,
  _selPos: null,      // 选中卫星当前渲染坐标（保证抽稀/搜索命中也能高亮）
  _refreshTimer: null,// 位置实时刷新定时器
  _index: null,       // 全局搜索索引 [{name, noradId, group}]（跨分组）
  _pendingNorad: null,// 跨分组选中：切组加载后待定位的 NORAD

  onLoad() {
    this._loadGroup(this.data.groupIndex);
    this._loadIndex();
  },
  onReady() {
    this._initCanvas();
  },
  onShow() {
    if (this.data.liveRefresh) this._startRefresh(); // 仅当开关开启时恢复刷新
  },
  onHide() {
    this._stopRefresh(); // 后台不空跑（开关状态保留，回到前台再恢复）
  },
  onUnload() {
    this._stopRefresh();
    if (this._rafId && this._canvas) this._canvas.cancelAnimationFrame(this._rafId);
  },

  // 每 REFRESH_MS 真实时间推进一次卫星位置（只算渲染子集，开销可控）
  _startRefresh() {
    if (this._refreshTimer) return;
    this._refreshTimer = setInterval(() => this._refreshPositions(), REFRESH_MS);
  },
  _stopRefresh() {
    if (this._refreshTimer) { clearInterval(this._refreshTimer); this._refreshTimer = null; }
  },

  // ===================== 数据加载 + SGP4 =====================

  onGroupChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ groupIndex: idx, keyword: '', searchResults: [] });
    this._loadGroup(idx);
  },

  // ===================== 搜索 =====================

  // 经度 -> 轨道槽位文本，如 105.5°E / 75.0°W（GEO 用）
  _fmtSlot(lonDeg) {
    const v = ((lonDeg % 360) + 540) % 360 - 180; // 归一化到 -180..180
    return `${Math.abs(v).toFixed(1)}°${v >= 0 ? 'E' : 'W'}`;
  },

  // 当前组内按 NORAD 找下标
  _idxByNorad(noradId) {
    const meta = this._meta, id = String(noradId);
    for (let i = 0; i < meta.length; i++) if (String(meta[i].noradId) === id) return i;
    return -1;
  },

  onSearchInput(e) {
    const raw = e.detail.value || '';
    this.setData({ keyword: raw });
    const kw = raw.trim().toLowerCase();
    if (!kw) { this.setData({ searchResults: [] }); return; }

    const curKey = GROUPS[this.data.groupIndex].key;
    // 优先用全局索引跨分组搜索；索引未就绪时退化为当前组
    const hasIndex = this._index && this._index.length;
    const src = hasIndex ? this._index : this._meta.map((m) => ({ name: m.name, noradId: m.noradId, group: curKey }));

    const now = new Date();
    const gmst = sat.gstime(now);
    const out = [];
    for (let i = 0; i < src.length && out.length < 40; i++) {
      const s = src[i];
      if (s.name.toLowerCase().indexOf(kw) >= 0 || String(s.noradId).indexOf(kw) >= 0) {
        // 槽位仅当该星属当前已加载分组且为 GEO 时才能算（其它情况无 TLE 在手）
        let slot = '';
        if (s.group === curKey && curKey === 'geo') {
          const idx = this._idxByNorad(s.noradId);
          if (idx >= 0) {
            const pv = sat.propagate(this._recs[idx], now);
            if (pv && pv.position) slot = this._fmtSlot(sat.degreesLong(sat.eciToGeodetic(pv.position, gmst).longitude));
          }
        }
        out.push({ name: s.name, noradId: s.noradId, group: s.group, groupLabel: GROUP_LABEL[s.group] || s.group, slot });
      }
    }
    this.setData({ searchResults: out });
  },

  clearSearch() {
    this.setData({ keyword: '', searchResults: [] });
  },

  onPickResult(e) {
    const norad = String(e.currentTarget.dataset.norad);
    const group = e.currentTarget.dataset.group;
    const curKey = GROUPS[this.data.groupIndex].key;
    this.setData({ searchResults: [] });

    // 已经就在该卫星所属分组 -> 直接选中
    if (group === curKey) {
      const idx = this._idxByNorad(norad);
      if (idx >= 0) { this._selectSat(idx); this._faceSat(); wx.vibrateShort({ type: 'light' }); }
      return;
    }
    // 否则跳转到该卫星所属分组，加载完成后在 _computePositions 中定位该星
    const gi = GROUPS.findIndex((g) => g.key === group);
    if (gi < 0) {
      // 分组未知（极少）-> 退化为当前视图内就地选中
      const li = this._idxByNorad(norad);
      if (li >= 0) { this._selectSat(li); this._faceSat(); wx.vibrateShort({ type: 'light' }); }
      return;
    }
    this._pendingNorad = norad;
    this.setData({ groupIndex: gi });
    this._loadGroup(gi);
    wx.vibrateShort({ type: 'light' });
  },

  // 旋转地球使选中卫星正对视图（基于其渲染坐标）
  _faceSat() {
    const p = this._selPos;
    if (!p) return;
    const h = Math.hypot(p[0], p[2]) || 1e-6;
    this._yaw = -Math.atan2(p[0], p[2]);
    this._pitch = clamp(Math.atan2(p[1], h), -1.45, 1.45);
    this._autoRotate = false;
    this.setData({ autoRotate: false });
  },

  refreshNow() {
    // 不重新下载，仅用已加载 TLE 重算此刻位置
    if (!this._recs.length) return this._loadGroup(this.data.groupIndex);
    this._computePositions();
    wx.vibrateShort({ type: 'light' });
  },

  _fileID(name) {
    return `cloud://${ENV_ID}.${BUCKET}/celestrak/${name}`;
  },

  // 下载云存储 JSON 并解析（Promise）
  _downloadJSON(fileID) {
    return new Promise((resolve, reject) => {
      wx.cloud.downloadFile({
        fileID,
        success: (res) => {
          wx.getFileSystemManager().readFile({
            filePath: res.tempFilePath, encoding: 'utf8',
            success: (r) => {
              try { resolve(JSON.parse(r.data)); } catch (e) { reject(e); }
            },
            fail: reject
          });
        },
        fail: reject
      });
    });
  },

  // 带重试的下载
  _downloadJSONRetry(fileID, tries) {
    return this._downloadJSON(fileID).catch((e) => {
      if (tries > 1) return this._downloadJSONRetry(fileID, tries - 1);
      throw e;
    });
  },

  // 限流并发执行 n 个任务（worker(i) 返回 Promise），失败的项置 null
  _pool(n, concurrency, worker) {
    return new Promise((resolve) => {
      const results = new Array(n);
      let next = 0, done = 0, active = 0;
      if (n === 0) { resolve(results); return; }
      const launch = () => {
        while (active < concurrency && next < n) {
          const i = next++; active++;
          Promise.resolve(worker(i))
            .then((r) => { results[i] = r; })
            .catch(() => { results[i] = null; })
            .then(() => { active--; done++; if (done === n) resolve(results); else launch(); });
        }
      };
      launch();
    });
  },

  // 加载全局搜索索引（跨分组）。Starlink 走前端众包，云端索引可能还没并入，
  // 故同时读众包的 _names_starlink.json 补齐，保证 Starlink 也能跨组搜到。
  _loadIndex() {
    Promise.all([
      this._downloadJSON(this._fileID('_index.json')).catch(() => null),
      this._downloadJSON(this._fileID('_names_starlink.json')).catch(() => null)
    ]).then(([idx, star]) => {
      const index = (idx && idx.sats) ? idx.sats.slice() : [];
      const hasStarlink = index.some((s) => s.group === 'starlink');
      if (!hasStarlink && star && star.names) {
        for (let i = 0; i < star.names.length; i++) {
          index.push({ name: star.names[i].name, noradId: star.names[i].noradId, group: 'starlink' });
        }
      }
      this._index = index;
    });
  },

  _loadGroup(idx) {
    const g = GROUPS[idx];
    this.setData({ loading: true, statusText: `加载 ${g.label} …`, selected: null });
    this._selIdx = -1; this._selOrbit = this._selTrack = this._selFootprint = null; this._selPos = null;

    if (g.key === 'all') { this._loadAll(); return; }
    if (g.key === 'starlink') { this._loadStarlink(g); return; }

    this._downloadJSON(this._fileID(`${g.key}.json`))
      .then((data) => {
        if (data && data.chunked) return this._loadChunks(g, data);
        this._ingest(data);
      })
      .catch(() => this._fail(`暂无 ${g.label} 数据（云端尚未生成）`));
  },

  // “全部卫星”：并行下载各组云存储数据，合并后统一入库（每颗带所属分组）
  _loadAll() {
    const keys = GROUPS.filter((g) => g.key !== 'all').map((g) => g.key);
    let done = 0;
    this.setData({ loading: true, statusText: `加载全部卫星 0/${keys.length} …` });
    const tasks = keys.map((key) =>
      this._downloadJSON(this._fileID(`${key}.json`))
        .then((data) => {
          done++;
          this.setData({ statusText: `加载全部卫星 ${done}/${keys.length} …` });
          if (!data || !data.sats) return [];
          for (let i = 0; i < data.sats.length; i++) data.sats[i]._group = key;
          return data.sats;
        })
        .catch(() => { done++; return []; })
    );
    Promise.all(tasks).then((arrs) => {
      const sats = [];
      for (let i = 0; i < arrs.length; i++) {
        for (let j = 0; j < arrs[i].length; j++) sats.push(arrs[i][j]);
      }
      if (!sats.length) { this._fail('暂无卫星数据（云端尚未生成）'); return; }
      this._ingest({ group: 'all', label: '全部卫星', fetchedAt: new Date().toISOString(), count: sats.length, sats });
    });
  },

  // Starlink 众包加载：云存储有“当天”数据就直接用；否则本机直连 CelesTrak 拉取+回传云存储
  _loadStarlink(g) {
    this._downloadJSON(this._fileID('starlink.json'))
      .then((data) => {
        const age = (data && data.fetchedAt) ? (Date.now() - new Date(data.fetchedAt).getTime()) : Infinity;
        if (data && data.sats && age < STARLINK_MAX_AGE_MS) {
          this._ingest(data); // 当天数据，直接用（快路径）
        } else {
          this._fetchStarlinkLive(g, data); // 过期/缺失：直连拉取，data 作兜底
        }
      })
      .catch(() => this._fetchStarlinkLive(g, null));
  },

  // 兜底：本机直连 CelesTrak 拉 Starlink（启动时后台刷新若未完成/失败时），立即展示并回传云存储
  _fetchStarlinkLive(g, fallback) {
    this.setData({ loading: true, statusText: '从 CelesTrak 获取 Starlink（首次较慢，请稍候）…' });
    tleStore.fetchStarlinkLive()
      .then((payload) => {
        this._ingest(payload);                  // 立即展示
        tleStore.uploadStarlinkPayload(payload); // 后台回传云存储，惠及后续用户
      })
      .catch(() => {
        if (fallback && fallback.sats) {
          this.setData({ statusText: '' });
          this._ingest(fallback);                // 拉取失败但有旧数据 -> 先用旧的
          wx.showToast({ title: '已用历史数据（实时获取失败）', icon: 'none' });
        } else {
          this._fail('Starlink 获取失败，请检查网络/域名白名单');
        }
      });
  },

  // 分块星座：限流并行（每次 4 个、各带重试）下载各分块，合并 sats 后统一入库
  _loadChunks(g, manifest) {
    const n = manifest.partCount || 0;
    if (n <= 0) { this._ingest({ ...manifest, sats: [] }); return; }
    let done = 0;
    return this._pool(n, 4, (p) =>
      this._downloadJSONRetry(this._fileID(`${g.key}_part${p}.json`), 2).then((part) => {
        done++;
        this.setData({ statusText: `加载 ${g.label} 分块 ${done}/${n} …` });
        return (part && part.sats) || [];
      })
    ).then((arrs) => {
      if (arrs.some((a) => a === null)) { this._fail(`${g.label} 部分分块下载失败，请重试`); return; }
      const sats = [];
      for (let i = 0; i < arrs.length; i++) {
        for (let j = 0; j < arrs[i].length; j++) sats.push(arrs[i][j]);
      }
      this._ingest({ ...manifest, sats });
    });
  },

  _fail(msg) {
    this.setData({ loading: false, statusText: msg, satCount: 0, shownCount: 0 });
    this._recs = []; this._meta = []; this._render = [];
  },

  // 把云端 JSON 转成 satrec，并立即算一次此刻位置
  _ingest(data) {
    const sats = (data && data.sats) || [];
    const recs = [], meta = [];
    for (let i = 0; i < sats.length; i++) {
      const s = sats[i];
      try {
        const rec = sat.twoline2satrec(s.line1, s.line2);
        if (rec && !rec.error) {
          recs.push(rec);
          meta.push({ name: s.name, noradId: s.noradId, group: s._group || (data && data.group) || '' });
        }
      } catch (e) { /* 跳过坏 TLE */ }
    }
    this._recs = recs;
    this._meta = meta;
    this.setData({
      satCount: recs.length,
      dataTime: (data && data.fetchedAt) ? this._fmtDate(new Date(data.fetchedAt)) : '—'
    });
    this._computePositions();
  },

  // 均匀抽稀：从 arr 取 n 个（n>=length 则原样返回）
  _decimate(arr, n) {
    if (arr.length <= n) return arr;
    const out = [], step = arr.length / n;
    for (let k = 0; k < n; k++) out.push(arr[Math.floor(k * step)]);
    return out;
  },

  // 对全部卫星算“此刻”地固坐标 -> 渲染坐标；超出上限则均匀抽稀渲染
  _computePositions() {
    const now = new Date();
    const gmst = sat.gstime(now);
    const recs = this._recs, meta = this._meta;
    const all = [];
    for (let i = 0; i < recs.length; i++) {
      const pv = sat.propagate(recs[i], now);
      if (!pv || !pv.position) continue;
      all.push({ idx: i, pos: ecefToRender(sat.eciToEcf(pv.position, gmst)) });
    }

    // 抽稀（仅渲染层面，数据/点击仍基于全量 _recs）
    let render;
    if (GROUPS[this.data.groupIndex].key === 'all') {
      // “全部”模式：先放满非 Starlink，再用 Starlink 垫满到 MAX_RENDER_ALL（Starlink 最后绘制，叠在最上）
      const nonStar = [], star = [];
      for (let i = 0; i < all.length; i++) {
        const m = meta[all[i].idx];
        (m && m.group === 'starlink' ? star : nonStar).push(all[i]);
      }
      const head = this._decimate(nonStar, MAX_RENDER_ALL);
      const remain = MAX_RENDER_ALL - head.length;
      render = remain > 0 ? head.concat(this._decimate(star, remain)) : head;
    } else {
      render = this._decimate(all, MAX_RENDER);
    }
    this._render = render;

    // 若已选中某星，刷新它的轨道/足迹
    if (this._selIdx >= 0) this._buildSelectedGeometry(this._selIdx, now, gmst);

    this.setData({ loading: false, statusText: '', calcTime: this._fmt(now) });

    // 跨分组搜索切组后：定位待选卫星
    if (this._pendingNorad) {
      const idx = this._idxByNorad(this._pendingNorad);
      this._pendingNorad = null;
      if (idx >= 0) { this._selectSat(idx); this._faceSat(); }
    }
  },

  _fmt(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  },
  _fmtDate(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },

  // ===================== 选中卫星几何 =====================

  // 轨道圈线（惯性轨道，统一用 gmstNow 旋到当前地球朝向）、星下点轨迹（逐时刻 gmst）、覆盖足迹圈
  _buildSelectedGeometry(idx, now, gmstNow) {
    const rec = this._recs[idx];
    if (!rec) return;
    const periodMin = (2 * Math.PI) / rec.no; // rec.no: rad/min
    const N = 120;

    // 轨道圈线：一个周期内逐点，全部用 now 时刻的 gmst 旋转 -> 冻结成当前时刻的轨道环
    const orbit = [];
    for (let k = 0; k <= N; k++) {
      const t = new Date(now.getTime() + (k / N) * periodMin * 60000);
      const pv = sat.propagate(rec, t);
      if (pv && pv.position) orbit.push(ecefToRender(sat.eciToEcf(pv.position, gmstNow)));
    }

    // 星下点轨迹：逐时刻 gmst -> 真实地表轨迹（贴地表 RE）
    const track = [];
    for (let k = 0; k <= N; k++) {
      const t = new Date(now.getTime() + (k / N) * periodMin * 60000);
      const pv = sat.propagate(rec, t);
      if (!pv || !pv.position) continue;
      const gd = sat.eciToGeodetic(pv.position, sat.gstime(t));
      const lat = gd.latitude, lon = gd.longitude, cl = Math.cos(lat);
      track.push([RE * cl * Math.cos(lon), RE * Math.sin(lat), -RE * cl * Math.sin(lon)]);
    }

    // 覆盖足迹圈：当前星下点处地平(ε=0)可视范围，地心半角 λ = acos(RE/(RE+h))
    const pvNow = sat.propagate(rec, now);
    let footprint = null;
    if (pvNow && pvNow.position) {
      this._selPos = ecefToRender(sat.eciToEcf(pvNow.position, gmstNow)); // 当前位置，供高亮/定位
      const gd = sat.eciToGeodetic(pvNow.position, gmstNow);
      const h = gd.height;
      const lambda = Math.acos(clamp(RE / (RE + h), -1, 1));
      // 星下点单位矢量（渲染系）
      const cl = Math.cos(gd.latitude);
      const u = [cl * Math.cos(gd.longitude), Math.sin(gd.latitude), -cl * Math.sin(gd.longitude)];
      footprint = this._circleOnSphere(u, lambda, 72);
    }

    this._selOrbit = orbit;
    this._selTrack = track;
    this._selFootprint = footprint;
  },

  // 以单位矢量 u 为轴心、地心半角 lambda 的地表小圆（返回渲染系点列，半径 RE）
  _circleOnSphere(u, lambda, N) {
    // 构造与 u 正交的基 e1,e2
    let ref = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let e1 = [
      u[1] * ref[2] - u[2] * ref[1],
      u[2] * ref[0] - u[0] * ref[2],
      u[0] * ref[1] - u[1] * ref[0]
    ];
    const n1 = Math.hypot(e1[0], e1[1], e1[2]) || 1;
    e1 = [e1[0] / n1, e1[1] / n1, e1[2] / n1];
    const e2 = [
      u[1] * e1[2] - u[2] * e1[1],
      u[2] * e1[0] - u[0] * e1[2],
      u[0] * e1[1] - u[1] * e1[0]
    ];
    const cosL = Math.cos(lambda), sinL = Math.sin(lambda);
    const pts = [];
    for (let k = 0; k <= N; k++) {
      const th = (k / N) * 2 * Math.PI, c = Math.cos(th), s = Math.sin(th);
      pts.push([
        RE * (cosL * u[0] + sinL * (c * e1[0] + s * e2[0])),
        RE * (cosL * u[1] + sinL * (c * e1[1] + s * e2[1])),
        RE * (cosL * u[2] + sinL * (c * e1[2] + s * e2[2]))
      ]);
    }
    return pts;
  },

  // ===================== 渲染 =====================

  _initCanvas() {
    wx.createSelectorQuery().select('#globeCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const dpr = info.pixelRatio || 2;
        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);
        this._canvas = canvas; this._ctx = ctx;
        this._cw = res[0].width; this._ch = res[0].height;
        this._loop();
      });
  },

  _loop() {
    if (!this._canvas) return;
    if (this._autoRotate && !this._dragging && !this._pinching) this._yaw += 0.0012;
    this._draw();
    this._rafId = this._canvas.requestAnimationFrame(() => this._loop());
  },

  _project(x, y, z, cx, cy, scale) {
    const cy0 = this._cYaw, sy0 = this._sYaw;
    const x1 = x * cy0 + z * sy0;
    const z1 = -x * sy0 + z * cy0;
    const y1 = y;
    const cp = this._cPitch, sp = this._sPitch;
    const y2 = y1 * cp - z1 * sp;
    const z2 = y1 * sp + z1 * cp;
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
    if (!ctx) return;
    const w = this._cw, h = this._ch;
    const cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);

    this._cYaw = Math.cos(this._yaw); this._sYaw = Math.sin(this._yaw);
    this._cPitch = Math.cos(this._pitch); this._sPitch = Math.sin(this._pitch);

    // 最远渲染半径：取所选轨道或星点的最大半径，保证 GEO 也在视野内
    let maxR = RE * 1.05;
    for (let i = 0; i < this._render.length; i++) {
      const p = this._render[i].pos;
      const r = Math.hypot(p[0], p[1], p[2]);
      if (r > maxR) maxR = r;
    }
    const half = Math.min(w, h) / 2 * 0.9;
    const scale = (half / maxR) * this._zoom;   // 自适应基准 × 用户双指缩放
    const Rpx = RE * scale;

    // 大气辉光
    const glow = ctx.createRadialGradient(cx, cy, Rpx * 0.99, cx, cy, Rpx * 1.09);
    glow.addColorStop(0, 'rgba(90,130,165,0.12)');
    glow.addColorStop(1, 'rgba(90,130,165,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, Rpx * 1.09, 0, Math.PI * 2); ctx.fill();

    // 地球
    const earth = ctx.createRadialGradient(cx - Rpx * 0.3, cy - Rpx * 0.34, Rpx * 0.1, cx, cy, Rpx * 1.05);
    earth.addColorStop(0, '#3a5269');
    earth.addColorStop(0.5, '#263a4d');
    earth.addColorStop(0.82, '#172734');
    earth.addColorStop(1, '#0c1722');
    ctx.fillStyle = earth;
    ctx.beginPath(); ctx.arc(cx, cy, Rpx, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, Rpx, 0, Math.PI * 2);
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(110,145,180,0.22)'; ctx.stroke();

    this._drawGraticule(cx, cy, scale, Rpx);
    this._drawCoastline(cx, cy, scale, Rpx);

    // 选中卫星的几何（在星点之下绘制）
    if (this._selFootprint) this._drawPath(this._selFootprint, cx, cy, scale, Rpx, {
      color: 'rgba(123,180,204,0.55)', hiddenColor: 'rgba(123,180,204,0.1)', width: 1, dash: [4, 3]
    });
    if (this._selTrack) this._drawPath(this._selTrack, cx, cy, scale, Rpx, {
      color: 'rgba(194,162,94,0.6)', hiddenColor: 'rgba(194,162,94,0.12)', width: 1
    });
    if (this._selOrbit) this._drawPath(this._selOrbit, cx, cy, scale, Rpx, {
      color: 'rgba(111,159,200,0.55)', hiddenColor: 'rgba(111,159,200,0.12)', width: 1
    });

    // 星点
    this._drawSats(cx, cy, scale, Rpx);
  },

  _drawSats(cx, cy, scale, Rpx) {
    const ctx = this._ctx;
    const render = this._render;
    const screen = new Array(render.length);
    for (let i = 0; i < render.length; i++) {
      const p = render[i].pos;
      const s = this._project(p[0], p[1], p[2], cx, cy, scale);
      const hidden = this._occluded(s, cx, cy, Rpx);
      screen[i] = { x: s.x, y: s.y, hidden, idx: render[i].idx };
      if (hidden) {
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = '#6f9fc8';
        ctx.fillRect(s.x - 0.8, s.y - 0.8, 1.6, 1.6);
      } else {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#9fd0ef';
        ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
      }
    }
    ctx.globalAlpha = 1;
    this._screen = screen;

    // 高亮选中星：直接用 _selPos（即使被抽稀掉、或通过搜索命中也能高亮）
    if (this._selIdx >= 0 && this._selPos) {
      const sel = this._project(this._selPos[0], this._selPos[1], this._selPos[2], cx, cy, scale);
      if (!this._occluded(sel, cx, cy, Rpx)) {
        ctx.beginPath(); ctx.arc(sel.x, sel.y, 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.beginPath(); ctx.arc(sel.x, sel.y, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd27a'; ctx.fill();
      }
    }
  },

  _drawGraticule(cx, cy, scale, Rpx) {
    for (let lat = -60; lat <= 60; lat += 30) {
      const latR = lat * DEG, pts = [];
      for (let lon = 0; lon <= 360; lon += 6) {
        const r = lon * DEG;
        pts.push([RE * Math.cos(latR) * Math.cos(r), RE * Math.sin(latR), RE * Math.cos(latR) * Math.sin(r)]);
      }
      this._drawPath(pts, cx, cy, scale, Rpx, {
        color: lat === 0 ? 'rgba(150,180,210,0.32)' : 'rgba(150,180,210,0.14)',
        hiddenColor: 'rgba(150,180,210,0.04)', width: lat === 0 ? 1 : 0.6
      });
    }
    for (let lon = 0; lon < 360; lon += 30) {
      const r = lon * DEG, pts = [];
      for (let lat = -90; lat <= 90; lat += 6) {
        const latR = lat * DEG;
        pts.push([RE * Math.cos(latR) * Math.cos(r), RE * Math.sin(latR), RE * Math.cos(latR) * Math.sin(r)]);
      }
      this._drawPath(pts, cx, cy, scale, Rpx, {
        color: 'rgba(150,180,210,0.12)', hiddenColor: 'rgba(150,180,210,0.04)', width: 0.6
      });
    }
  },

  _buildCoastXYZ() {
    const polys = [];
    for (let p = 0; p < COASTLINE.length; p++) {
      const poly = COASTLINE[p];
      if (poly.length < 4) continue;
      const pts = [];
      for (let k = 0; k < poly.length; k += 2) {
        const lon = poly[k] * DEG, lat = poly[k + 1] * DEG, cl = Math.cos(lat);
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
        color: 'rgba(150,185,215,0.5)', hiddenColor: 'rgba(150,185,215,0.07)', width: 0.7
      });
    }
  },

  // ===================== 触摸：旋转 + 点击命中 =====================

  _touchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  },

  onTouchStart(e) {
    if (e.touches.length >= 2) {
      // 双指：进入缩放（拖动/缩放期间由 _pinching/_dragging 暂停自转，不改变自转开关本身）
      this._pinching = true;
      this._dragging = false;
      this._pinchStartDist = this._touchDist(e.touches);
      this._pinchStartZoom = this._zoom;
      return;
    }
    const t = e.touches[0];
    this._dragging = true;
    this._moved = 0;
    this._lastX = t.clientX; this._lastY = t.clientY;
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
    const dx = t.clientX - this._lastX, dy = t.clientY - this._lastY;
    this._moved += Math.abs(dx) + Math.abs(dy);
    this._yaw += dx * 0.01;
    this._pitch = clamp(this._pitch + dy * 0.01, -1.45, 1.45);
    this._lastX = t.clientX; this._lastY = t.clientY;
  },
  onTouchEnd(e) {
    // 缩放手势结束（可能仍残留一根手指）：不触发点击
    if (this._pinching) {
      this._dragging = false;
      if (!e.touches || e.touches.length === 0) this._pinching = false;
      return;
    }
    this._dragging = false;
    if (this._moved < 8) {
      // 轻触（位移很小）视为点击 -> 命中最近星点（不影响自转）
      const t = (e.changedTouches && e.changedTouches[0]) || null;
      if (t) this._hitTest(t.clientX, t.clientY);
    } else if (this._autoRotate) {
      // 拖动旋转后：停止自动旋转，交由用户手动控制
      this._autoRotate = false;
      this.setData({ autoRotate: false });
    }
  },

  _hitTest(x, y) {
    const screen = this._screen;
    let best = -1, bestD = 14 * 14; // 命中半径 14px
    for (let i = 0; i < screen.length; i++) {
      const s = screen[i];
      if (s.hidden) continue;
      const dx = s.x - x, dy = s.y - y, d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = s.idx; }
    }
    if (best < 0) {
      // 点空白处：取消选中
      this._selIdx = -1; this._selOrbit = this._selTrack = this._selFootprint = null;
      this._selPos = null;
      this.setData({ selected: null });
      return;
    }
    this._selectSat(best);
    wx.vibrateShort({ type: 'light' });
  },

  // 组装选中卫星信息卡数据（供选中与实时刷新复用）
  _selCardData(idx, now, gmst) {
    const rec = this._recs[idx], m = this._meta[idx];
    const pv = sat.propagate(rec, now);
    if (!pv || !pv.position) return null;
    const gd = sat.eciToGeodetic(pv.position, gmst);
    const v = pv.velocity;
    const speed = v ? Math.hypot(v.x, v.y, v.z) : 0;
    const isGeo = (m.group || GROUPS[this.data.groupIndex].key) === 'geo';
    return {
      name: m.name,
      noradId: m.noradId,
      slot: isGeo ? this._fmtSlot(sat.degreesLong(gd.longitude)) : '',
      alt: gd.height.toFixed(0),
      speed: speed.toFixed(2),
      lat: sat.degreesLat(gd.latitude).toFixed(2),
      lon: sat.degreesLong(gd.longitude).toFixed(2),
      incl: (rec.inclo / DEG).toFixed(1),
      period: ((2 * Math.PI) / rec.no).toFixed(0)
    };
  },

  _selectSat(idx) {
    const now = new Date();
    const gmst = sat.gstime(now);
    const card = this._selCardData(idx, now, gmst);
    if (!card) return;
    this._selIdx = idx;
    this._buildSelectedGeometry(idx, now, gmst);
    this.setData({ selected: card });
  },

  // 实时刷新：按当前真实时间重算渲染子集的位置（不重新抽稀），并更新选中星几何/信息卡
  _refreshPositions() {
    if (this._dragging || this._pinching) return; // 手势中跳过，避免卡顿叠加
    const render = this._render;
    if (!render || !render.length) return;
    const now = new Date();
    const gmst = sat.gstime(now);
    for (let k = 0; k < render.length; k++) {
      const pv = sat.propagate(this._recs[render[k].idx], now);
      if (pv && pv.position) render[k].pos = ecefToRender(sat.eciToEcf(pv.position, gmst));
    }
    if (this._selIdx >= 0) {
      this._buildSelectedGeometry(this._selIdx, now, gmst);
      const card = this._selCardData(this._selIdx, now, gmst);
      if (card) this.setData({ selected: card, calcTime: this._fmt(now) });
      else this.setData({ calcTime: this._fmt(now) });
    } else {
      this.setData({ calcTime: this._fmt(now) });
    }
  },

  closeCard() {
    this._selIdx = -1; this._selOrbit = this._selTrack = this._selFootprint = null;
    this._selPos = null;
    this.setData({ selected: null });
  },

  toggleRotate() {
    this._autoRotate = !this._autoRotate;
    this.setData({ autoRotate: this._autoRotate });
  },

  // 实时刷新开关（与旋转独立，可叠加）；开启 1Hz 按真实时间推进卫星位置
  toggleRefresh() {
    const on = !this.data.liveRefresh;
    this.setData({ liveRefresh: on });
    if (on) { this._startRefresh(); this._refreshPositions(); } // 立即先刷一次
    else this._stopRefresh();
    wx.vibrateShort({ type: 'light' });
  }
});

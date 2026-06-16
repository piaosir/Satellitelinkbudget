// 星座地图：从云存储读取 CelesTrak TLE，前端用 SGP4 算“此刻”位置，在 3D 地球上以亮点展示星座。
// 静态快照（不做实时动画）：打开页面 / 切换分组 / 点“刷新此刻”时各算一次位置。
// 渲染核（正交投影 / 海岸线 / 经纬网 / 背面虚化 / 触摸旋转）复用自 isl-visual。
//
// 坐标系：极轴=Y、经度0在+X、绕Y到+Z、经度取负镜像（与 coastline 一致，地球固连/地理系）。
// 卫星 ECI 先经 eciToEcf(gmstNow) 转到地固系，再 ecef[x,y,z] -> render[x, z, -y]，与海岸线天然对齐。

const sat = require('./satellite.js');
const COASTLINE = require('./coastline-lo.js');      // 海岸线 ~10.5k（全程统一，= ISL 1:50m；高精度与之肉眼无差，已弃用）
const tleStore = require('../../utils/tleStore.js');

const RE = 6378.137;          // 地球赤道半径 km
const DEG = Math.PI / 180;
const ENV_ID = 'cloud1-8gjv5ekx41d6fb76';
const BUCKET = '636c-cloud1-8gjv5ekx41d6fb76-1385987144';
const MAX_RENDER = 5000;      // 单分组渲染点数上限（数据全保留，仅渲染抽稀以保流畅；实际仅 Starlink 超此值）
const MAX_RENDER_ALL = 6000; // “全部卫星”模式渲染上限：先放满非 Starlink，再用 Starlink 垫到该数

// 各组 TLE 全部前端众包（见 utils/tleStore）：启动时已按需后台刷新云存储；
// 进入本页时优先用当天本地缓存，缺失才下载云存储，云端也缺失才本机直连 CelesTrak 兜底拉取。
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
  { key: 'kuiper', label: 'Kuiper' },
  { key: 'qianfan', label: '千帆星座' },
  { key: 'guowang', label: '中国星网' },
  { key: 'iridium', label: '铱星' },
  { key: 'globalstar', label: 'Globalstar' },
  { key: 'stations', label: '空间站' },
  { key: 'planet', label: 'Planet' },
  { key: 'spire', label: 'Spire' }
];
// 默认选中“中国星网”（China SatNet）
const DEFAULT_GROUP_INDEX = Math.max(0, GROUPS.findIndex((g) => g.key === 'guowang'));

// 分组键 -> 显示名
const GROUP_LABEL = {};
GROUPS.forEach((g) => { GROUP_LABEL[g.key] = g.label; });

// 地固系 -> 渲染系
const ecefToRender = (p) => [p.x, p.z, -p.y];

Page({
  data: {
    groups: GROUPS,
    groupIndex: DEFAULT_GROUP_INDEX, // 默认“中国星网”
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
  _index: null,       // 全局搜索索引 [{name, noradId, group}]（跨分组，懒加载）
  _indexLoading: false,
  _pendingNorad: null,// 跨分组选中：切组加载后待定位的 NORAD

  onLoad() {
    this._loadGroup(this.data.groupIndex);
    // 跨分组搜索索引改懒加载：用户真去搜索时才下（见 onSearchInput -> _ensureIndex）
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

    this._ensureIndex(); // 首次搜索才加载跨分组索引（就绪后会自动重跑本次搜索）

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

  // ---- 本地按需缓存：每组每天最多下载一次，当天再看直接读本机（零 CDN）----
  _dateStr(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },
  _todayStr() { return this._dateStr(new Date()); },
  // 数据自身下载日期(fetchedAt)是否=今天：缓存/云副本「是否当天」的唯一判据
  _isToday(iso) { return !!iso && this._dateStr(new Date(iso)) === this._todayStr(); },
  _cachePath(key) { return `${wx.env.USER_DATA_PATH}/tle_${key}.json`; },
  // 当天有效则返回缓存对象，否则 null（读失败/过期都按未命中处理）
  _readCache(key) {
    try {
      if (wx.getStorageSync(`tle_date_${key}`) !== this._todayStr()) return null;
      const data = JSON.parse(wx.getFileSystemManager().readFileSync(this._cachePath(key), 'utf8'));
      // 双保险：文件自身 fetchedAt 不是今天则按未命中（堵住旧逻辑遗留的“标记今天/文件昨天”）
      if (data && data.fetchedAt && !this._isToday(data.fetchedAt)) return null;
      return data;
    } catch (e) { return null; }
  },
  _writeCache(key, data) {
    try {
      wx.getFileSystemManager().writeFileSync(this._cachePath(key), JSON.stringify(data), 'utf8');
      // 标记存“数据自身下载日期(fetchedAt)”而非“今天碰过”——旧副本不会被误判为当天
      const stamp = (data && data.fetchedAt) ? this._dateStr(new Date(data.fetchedAt)) : this._todayStr();
      wx.setStorageSync(`tle_date_${key}`, stamp);
    } catch (e) { /* 缓存写失败不影响展示 */ }
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

  // 懒加载全局搜索索引（跨分组）：仅用户首次搜索时触发，且当天本地缓存（零重复 CDN）。
  // Starlink 走前端众包，云端索引可能还没并入，故同时读众包的 _names_starlink.json 补齐。
  _ensureIndex() {
    if (this._index || this._indexLoading) return; // 已就绪/加载中
    const cached = this._readCache('_index');      // 当天本地缓存命中 -> 零 CDN
    if (cached && cached.sats) { this._index = cached.sats; return; }

    this._indexLoading = true;
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
      this._writeCache('_index', { sats: index });
      this._indexLoading = false;
      // 索引就绪后，若用户当前仍有关键字，重跑一次以升级为跨分组结果
      const kw = (this.data.keyword || '').trim();
      if (kw) this.onSearchInput({ detail: { value: this.data.keyword } });
    }).catch(() => { this._indexLoading = false; });
  },

  _loadGroup(idx) {
    const g = GROUPS[idx];
    this.setData({ loading: true, statusText: `加载 ${g.label} …`, selected: null });
    this._selIdx = -1; this._selOrbit = this._selTrack = this._selFootprint = null; this._selPos = null;

    if (g.key === 'all') { this._loadAll(); return; }

    // 当天本地缓存命中 -> 直接用，零 CDN（分块数据走旧路径不缓存）
    const cached = this._readCache(g.key);
    if (cached && cached.sats && !cached.chunked) { this._ingest(cached); return; }

    this._downloadJSON(this._fileID(`${g.key}.json`))
      .then((data) => {
        if (data && data.chunked) return this._loadChunks(g, data);
        // 云端缺失/为空/或不是当天 -> 现场直连 CelesTrak 拉“今天”的并回传（拿不到再退回这份旧副本）
        if (!data || !data.sats || !data.sats.length || !this._isToday(data.fetchedAt)) {
          return this._fetchGroupLive(g, data);
        }
        this._writeCache(g.key, data);
        this._ingest(data);
      })
      .catch(() => this._fetchGroupLive(g, null)); // 下载失败 -> 现场直连兜底
  },

  // “全部卫星”：各组优先用当天本地缓存（零 CDN），未命中才下载；合并后统一入库（每颗带所属分组）
  _loadAll() {
    const keys = GROUPS.filter((g) => g.key !== 'all').map((g) => g.key);
    let done = 0;
    this.setData({ loading: true, statusText: `加载全部卫星 0/${keys.length} …` });
    const bump = () => { done++; this.setData({ statusText: `加载全部卫星 ${done}/${keys.length} …` }); };
    const tag = (sats, key) => { for (let i = 0; i < sats.length; i++) sats[i]._group = key; return sats; };
    const tasks = keys.map((key) => {
      // 当天本地缓存命中 -> 直接用，零 CDN（与单组视图共享同一份缓存）
      const cached = this._readCache(key);
      if (cached && cached.sats && !cached.chunked) { bump(); return Promise.resolve(tag(cached.sats, key)); }
      return this._downloadJSON(this._fileID(`${key}.json`))
        .then((data) => {
          bump();
          if (!data || !data.sats) return []; // 分块/缺失：本视图按空处理（单组视图仍可加载）
          if (!data.chunked) this._writeCache(key, data); // 写缓存（标记 _group 前，保持缓存干净）
          return tag(data.sats, key);
        })
        .catch(() => { bump(); return []; });
    });
    Promise.all(tasks).then((arrs) => {
      const sats = [];
      for (let i = 0; i < arrs.length; i++) {
        for (let j = 0; j < arrs[i].length; j++) sats.push(arrs[i][j]);
      }
      if (!sats.length) { this._fail('暂无卫星数据（云端尚未生成）'); return; }
      this._ingest({ group: 'all', label: '全部卫星', fetchedAt: new Date().toISOString(), count: sats.length, sats });
    });
  },

  // 兜底：本机直连 CelesTrak 拉取某组（云端缺失/下载失败时），立即展示并回传云存储惠及后续用户
  _fetchGroupLive(g, fallback) {
    this.setData({ loading: true, statusText: `从 CelesTrak 获取 ${g.label}（首次较慢，请稍候）…` });
    tleStore.fetchGroupLive(g.key)
      .then((payload) => {
        payload.label = g.label;
        this._writeCache(g.key, payload);          // 当天本地缓存，后续重看零 CDN
        this._ingest(payload);                     // 立即展示
        tleStore.uploadGroupPayload(g.key, payload); // 后台回传云存储
      })
      .catch(() => {
        if (fallback && fallback.sats) {
          this.setData({ statusText: '' });
          this._ingest(fallback);                  // 拉取失败但有旧数据 -> 先用旧的
          wx.showToast({ title: '已用历史数据（实时获取失败）', icon: 'none' });
        } else {
          this._fail(`${g.label} 获取失败，请检查网络/域名白名单`);
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

    // 若已选中某星，刷新它的轨道/足迹与信息卡（与实时刷新保持一致）
    let selCard = null;
    if (this._selIdx >= 0) {
      this._buildSelectedGeometry(this._selIdx, now, gmst);
      selCard = this._selCardData(this._selIdx, now, gmst);
    }

    const patch = { loading: false, statusText: '', calcTime: this._fmt(now) };
    if (selCard) patch.selected = selCard;
    this.setData(patch);

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
        // DPR 用满（含 iPhone 的 3x），清晰度优先。为抵消 DPR3 的逐帧光栅开销：
        // ① 渐变背景盘（辉光+地球）只依赖缩放，缓存到离屏，缩放时才重绘；
        // ② 海岸线两遍批量描边（正面/背面各一次 stroke），二者把 DPR3 的额外成本基本抵消。
        const dpr = info.pixelRatio || 2;
        this._dpr = dpr;
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
    if (this._autoRotate && !this._dragging && !this._pinching) this._yaw += 0.0006;
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

  // ===================== 背景盘缓存（辉光+地球） =====================
  // 内容只随 Rpx / 画布尺寸变；自转、星点移动时直接贴图复用，避免逐帧重填两个大渐变盘（DPR3 下尤贵）。
  _drawBackground(cx, cy, Rpx, w, h) {
    const ctx = this._ctx;
    if (this._bgFailed) { this._paintBackground(ctx, cx, cy, Rpx); return; }
    const key = Math.round(Rpx) + 'x' + w + 'x' + h;
    try {
      if (this._bgKey !== key || !this._bgCanvas) this._renderBackground(cx, cy, Rpx, w, h, key);
      ctx.drawImage(this._bgCanvas, 0, 0, w, h);
    } catch (e) {
      this._bgFailed = true;       // 离屏不可用 → 永久回退到内联绘制，画面一致
      this._paintBackground(ctx, cx, cy, Rpx);
    }
  },

  _renderBackground(cx, cy, Rpx, w, h, key) {
    const dpr = this._dpr || 2;
    const pw = Math.ceil(w * dpr), ph = Math.ceil(h * dpr);
    if (!this._bgCanvas) {
      this._bgCanvas = wx.createOffscreenCanvas({ type: '2d', width: pw, height: ph });
      this._bgCtx = this._bgCanvas.getContext('2d');
    } else if (this._bgCanvas.width !== pw || this._bgCanvas.height !== ph) {
      this._bgCanvas.width = pw; this._bgCanvas.height = ph;
    }
    const bctx = this._bgCtx;
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, pw, ph);
    bctx.scale(dpr, dpr);
    this._paintBackground(bctx, cx, cy, Rpx);
    this._bgKey = key;
  },

  // 与原内联绘制逐像素一致（c 可为主 ctx 或离屏 ctx）
  _paintBackground(c, cx, cy, Rpx) {
    const glow = c.createRadialGradient(cx, cy, Rpx * 0.99, cx, cy, Rpx * 1.09);
    glow.addColorStop(0, 'rgba(90,130,165,0.12)');
    glow.addColorStop(1, 'rgba(90,130,165,0)');
    c.fillStyle = glow;
    c.beginPath(); c.arc(cx, cy, Rpx * 1.09, 0, Math.PI * 2); c.fill();
    const earth = c.createRadialGradient(cx - Rpx * 0.3, cy - Rpx * 0.34, Rpx * 0.1, cx, cy, Rpx * 1.05);
    earth.addColorStop(0, '#3a5269');
    earth.addColorStop(0.5, '#263a4d');
    earth.addColorStop(0.82, '#172734');
    earth.addColorStop(1, '#0c1722');
    c.fillStyle = earth;
    c.beginPath(); c.arc(cx, cy, Rpx, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(cx, cy, Rpx, 0, Math.PI * 2);
    c.lineWidth = 1; c.strokeStyle = 'rgba(110,145,180,0.22)'; c.stroke();
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

    // 大气辉光 + 地球：仅依赖缩放(Rpx)，与自转/星点移动无关 → 缓存到离屏，缩放时才重绘
    this._drawBackground(cx, cy, Rpx, w, h);

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

  // 把扁平 [lon,lat,...] 折线集转成球面 XYZ 折线集
  _buildCoastXYZ(src) {
    const polys = [];
    for (let p = 0; p < src.length; p++) {
      const poly = src[p];
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
    if (!this._coastXYZ) this._coastXYZ = this._buildCoastXYZ(COASTLINE); // 统一低精度 ~10.5k(= ISL 1:50m)
    const polys = this._coastXYZ;
    const ctx = this._ctx;
    const nPoly = polys.length;

    // 单次投影到复用缓存：每点存 [x, y, hidden]，避免逐 poly new Array（减少 GC）
    let scr = this._coastScr;
    if (!scr) scr = this._coastScr = [];
    for (let p = 0; p < nPoly; p++) {
      const poly = polys[p];
      let row = scr[p];
      if (!row) row = scr[p] = [];
      const n = poly.length;
      for (let i = 0, k = 0; i < n; i++, k += 3) {
        const s = this._project(poly[i][0], poly[i][1], poly[i][2], cx, cy, scale);
        row[k] = s.x; row[k + 1] = s.y; row[k + 2] = this._occluded(s, cx, cy, Rpx) ? 1 : 0;
      }
      row.len = n;
    }

    ctx.lineWidth = 0.7;

    // 第一遍：正面段（两端皆可见）实线，一次 stroke
    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(150,185,215,0.5)';
    for (let p = 0; p < nPoly; p++) {
      const row = scr[p], n = row.len;
      let pen = false;
      for (let i = 1; i < n; i++) {
        const k = i * 3, j = k - 3;
        if (!row[j + 2] && !row[k + 2]) {
          if (!pen) { ctx.moveTo(row[j], row[j + 1]); pen = true; }
          ctx.lineTo(row[k], row[k + 1]);
        } else pen = false;
      }
    }
    ctx.stroke();

    // 第二遍：背面段（任一端被遮）虚淡，一次 stroke
    ctx.beginPath();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(150,185,215,0.07)';
    for (let p = 0; p < nPoly; p++) {
      const row = scr[p], n = row.len;
      let pen = false;
      for (let i = 1; i < n; i++) {
        const k = i * 3, j = k - 3;
        if (row[j + 2] || row[k + 2]) {
          if (!pen) { ctx.moveTo(row[j], row[j + 1]); pen = true; }
          ctx.lineTo(row[k], row[k + 1]);
        } else pen = false;
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
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

  // 滚轮缩放（仅 PC 微信会派发 wheel；移动端触屏不产生此事件，对移动端无影响）
  onWheel(e) {
    const d = e.detail || {};
    const dy = (d.deltaY != null ? d.deltaY : d.delta) || 0;
    if (!dy) return;
    // 向上滚放大、向下滚缩小；指数手感顺滑，单次步进做边界以防触控板大 delta 跳变
    const factor = clamp(Math.exp(-dy * 0.0015), 0.5, 2);
    // 复用 pinch 相同的缩放上下限，保证两个入口一致
    this._zoom = clamp(this._zoom * factor, 0.3, 50);
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
    const v = pv.velocity, r = pv.position;
    // 惯性绝对速度：TEME（准惯性系）下的速度模
    const speedAbs = v ? Math.hypot(v.x, v.y, v.z) : 0;
    // 对地相对速度：扣除地球自转牵连速度 ω×r（ω 沿 +Z），模长在绕 Z 旋转下不变
    const WE = 7.2921159e-5; // 地球自转角速度 rad/s
    const speedRel = (v && r)
      ? Math.hypot(v.x + WE * r.y, v.y - WE * r.x, v.z)
      : 0;
    const RE = 6378.137; // SGP4 地球半径 km；altp/alta 以地球半径为单位
    const isGeo = (m.group || GROUPS[this.data.groupIndex].key) === 'geo';
    return {
      name: m.name,
      noradId: m.noradId,
      slot: isGeo ? this._fmtSlot(sat.degreesLong(gd.longitude)) : '',
      alt: gd.height.toFixed(0),
      speedAbs: speedAbs.toFixed(2),
      speedRel: speedRel.toFixed(2),
      lat: sat.degreesLat(gd.latitude).toFixed(2),
      lon: sat.degreesLong(gd.longitude).toFixed(2),
      incl: (rec.inclo / DEG).toFixed(1),
      period: ((2 * Math.PI) / rec.no).toFixed(0),
      ecc: rec.ecco.toFixed(4),
      raan: (((rec.nodeo / DEG) % 360 + 360) % 360).toFixed(1),
      argp: (((rec.argpo / DEG) % 360 + 360) % 360).toFixed(1),
      perigee: (rec.altp * RE).toFixed(0),
      apogee: (rec.alta * RE).toFixed(0)
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

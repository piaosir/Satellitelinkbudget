// 星座地图：从云存储读取 CelesTrak TLE，前端用 SGP4 算“此刻”位置，在 3D 地球上以亮点展示星座。
// 静态快照（不做实时动画）：打开页面 / 切换分组 / 点“刷新此刻”时各算一次位置。
// 渲染核（正交投影 / 海岸线 / 经纬网 / 背面虚化 / 触摸旋转）复用自 isl-visual。
//
// 坐标系：极轴=Y、经度0在+X、绕Y到+Z、经度取负镜像（与 coastline 一致，地球固连/地理系）。
// 卫星 ECI 先经 eciToEcf(gmstNow) 转到地固系，再 ecef[x,y,z] -> render[x, z, -y]，与海岸线天然对齐。

const sat = require('./satellite.js');
const COASTLINE = require('./coastline-lo.js');      // 海岸线 ~10.5k（全程统一，= ISL 1:50m；高精度与之肉眼无差，已弃用）
const tleStore = require('../../utils/tleStore.js');
const satSearch = require('./satSearch.js'); // 归一化/分词/中文别名匹配（与星间链路页同一份）
const satsimPack = require('../../utils/satsimPack.js'); // 仿真平台送来的「卫星集」（卫星组 / 自定义卫星 / 自定义星座）

const RE = 6378.137;          // 地球赤道半径 km
const DEG = Math.PI / 180;
const ENV_ID = 'cloud1-8gjv5ekx41d6fb76';
const BUCKET = '636c-cloud1-8gjv5ekx41d6fb76-1385987144';
const MAX_RENDER = 3500;      // 单分组渲染点数上限（数据全保留，仅渲染抽稀以保流畅；实际仅 Starlink 超此值）
const MAX_RENDER_ALL = 4500; // “全部卫星”模式渲染上限：先放满非 Starlink，再用 Starlink 垫到该数

// 各组 TLE 全部前端众包（见 utils/tleStore）：启动时已按需后台刷新云存储；
// 进入本页时优先用当天本地缓存，缺失才下载云存储，云端也缺失才本机直连 CelesTrak 兜底拉取。
const REFRESH_MS = 1000;      // 卫星位置实时刷新间隔（1Hz，由“刷新”开关独立控制，与旋转互不影响）

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 显示名 + 云存储分组键（与云函数 fetchTLE 的键一致）。
// ★ 这是【内置】分组表；屏上真正的分组列表 = 仿真平台导入的星座（置顶）+ 本表，见 _rebuildGroups。
//   凡「枚举真实星历源」的地方（_loadUniverse）必须用本表，别用 data.groups —— 导入的那几行
//   没有 CelesTrak 端点，混进去就是一串必然失败的下载。
const BUILT_IN = [
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
  { key: 'spire', label: 'Spire' },
  // 「其他」：全部在轨(active)里不属于以上任何已知星座的星。与仿真平台 ConstellationMap3D 的
  // GROUPS/loadOther 同口径；它没有独立星历源，取数走 active 后按归类过滤（见 _loadUniverse）。
  { key: 'other', label: '其他' }
];
// 非真实星历源的“合成分组”：由 active 全集派生，_loadUniverse 归类时要排除自身
const DERIVED_KEYS = ['all', 'other'];
// 没有导入星座时的默认分组：“中国星网”（China SatNet）
const DEFAULT_KEY = 'guowang';
// 导入星座的分组键前缀（后接 satsimPack 的 setId）
const SS_PREFIX = 'ss:';

// 内置分组键 -> 显示名
const BUILTIN_LABEL = {};
BUILT_IN.forEach((g) => { BUILTIN_LABEL[g.key] = g.label; });

// 地固系 -> 渲染系
const ecefToRender = (p) => [p.x, p.z, -p.y];

Page({
  data: {
    groups: BUILT_IN,        // 实际列表由 _rebuildGroups 现攒（导入星座置顶 + 内置分组）
    groupIndex: 0,
    impSets: [],             // 已导入的星座 [{id,name,count,src,from,ts,epochMode}]（按到达时间倒序）
    showImp: false,          // 导入面板（管理已导入星座 + 密钥导入）
    keyInput: '',            // 8 位密钥
    otpCells: [],
    keyFocus: false,
    importing: false,
    loading: false,
    statusText: '',
    satCount: 0,             // 该组卫星总数
    shownCount: 0,           // 实际渲染点数
    decimated: false,        // 是否抽稀
    dataTime: '',            // OMM 数据时间（fetchedAt）
    calcTime: '',            // 本次 SGP4 计算时刻
    selected: null,          // 选中卫星信息卡
    autoRotate: true,
    liveRefresh: false,      // 实时刷新卫星位置开关（与旋转独立，1Hz）
    timeOffset: 0,           // 时间轴：相对锚点的偏移（分钟，0~1440 = 0~24h，仅向未来）
    timePct: 0,              // 进度条填充/圆点位置（timeOffset/1440*100）
    timeLabel: '此刻',       // 时间轴当前对应的绝对时刻文本（live 态由 WXML 直接显示“实时”）
    keyword: '',             // 搜索关键字
    searchResults: [],       // 搜索结果 [{idx, name, noradId, slot}]
    beam: '',                // 选中星全波束角(°)用户自定义文本：空=自动取 ε=0 上限，非空=自定义
    beamAuto: '',            // 自动(ε=0)波束角文本，作输入框 placeholder 常显
    beamLock: false,         // 锁定波束角：开启后切换卫星不重置，固定值平等作用于每颗星（各自仍按 ε=0 上限夹断）
    // 锁图标(SVG，base64 data-URI；微信 image 对原始 svg data-uri 兼容差，须 base64)：锁定=闭合高亮青蓝、未锁=开口灰
    lockIcon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAyNCAyNCcgZmlsbD0nbm9uZScgc3Ryb2tlPScjOWZkMGVmJyBzdHJva2Utd2lkdGg9JzInIHN0cm9rZS1saW5lY2FwPSdyb3VuZCcgc3Ryb2tlLWxpbmVqb2luPSdyb3VuZCc+PHJlY3QgeD0nNScgeT0nMTEnIHdpZHRoPScxNCcgaGVpZ2h0PSc5JyByeD0nMicvPjxwYXRoIGQ9J004IDExVjdhNCA0IDAgMCAxIDggMHY0Jy8+PC9zdmc+",
    unlockIcon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAyNCAyNCcgZmlsbD0nbm9uZScgc3Ryb2tlPScjOGFhMGI4JyBzdHJva2Utd2lkdGg9JzInIHN0cm9rZS1saW5lY2FwPSdyb3VuZCcgc3Ryb2tlLWxpbmVqb2luPSdyb3VuZCc+PHJlY3QgeD0nNScgeT0nMTEnIHdpZHRoPScxNCcgaGVpZ2h0PSc5JyByeD0nMicvPjxwYXRoIGQ9J004IDExVjdhNCA0IDAgMCAxIDctMi42Jy8+PC9zdmc+"
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
  _loopGen: 0,        // 帧循环代号（画布 hidden 后重起循环时换代，作废在途 rAF 回调）
  _baseTime: 0,       // 时间轴锚点“此刻”（ms）；非实时时计算时刻 = 锚点 + timeOffset
  _trackLeft: 0, _trackW: 0, // 时间轴轨道触区的视口左缘/宽度（onReady 量一次，拖动时换算位置）
  _lastTimeCalc: 0,   // 拖动节流时间戳
  _index: null,       // 全局搜索索引 [{name, noradId, group}]（跨分组，懒加载）
  _indexLoading: false,
  _metaSrc: null, _metaSrcKey: '', // 索引未就绪时的退化搜索源（当前组），按组缓存
  _pendingNorad: null,// 跨分组选中：切组加载后待定位的 NORAD
  _pendingNoFace: false,// 恢复缓存选星时为 true：只选中不转向、不停自转（保持进页面默认旋转）

  onLoad() {
    this._baseTime = Date.now(); // 时间轴以进入页面的此刻为锚点（非实时探索）
    // 恢复上次的分组 + 选中卫星（永久缓存，切出再开保持不变）
    let saved = null;
    try { saved = wx.getStorageSync('constellation/selection'); } catch (e) { saved = null; }
    let wantKey = '';
    if (saved && typeof saved === 'object') {
      if (saved.groupKey) wantKey = String(saved.groupKey);
      // 老版本存的是【下标】（那时分组表是固定的内置表）→ 一次性换算成键。
      // 键化是必须的：导入的星座插在最前面，下标会整体错位，恢复出来的是另一个星座。
      else if (Number.isInteger(saved.groupIndex) && saved.groupIndex >= 0 && saved.groupIndex < BUILT_IN.length) {
        wantKey = BUILT_IN[saved.groupIndex].key;
      }
      // 选中星交给现有 _pendingNorad 机制：_computePositions 加载完按 NORAD 定位；
      // 若该星在最新数据中不存在则自然落空（仅恢复分组、无选中），符合失效回退默认。
      if (saved.selNorad) { this._pendingNorad = String(saved.selNorad); this._pendingNoFace = true; }
    }
    // 有新导入的星座（可能是上次没打开本页时后台同步进来的）→ 它就是本次的默认星座
    const fresh = satsimPack.takeFreshSet();
    this._rebuildGroups(fresh ? SS_PREFIX + fresh : wantKey);
    this._loadGroup(this.data.groupIndex);
    // 跨分组搜索索引改懒加载：用户真去搜索时才下（见 onSearchInput -> _ensureIndex）
  },
  onReady() {
    this._initCanvas();
    this._measureTrack();
  },
  onShow() {
    if (this.data.liveRefresh) this._startRefresh(); // 仅当开关开启时恢复刷新
    this._syncFromSatsim();
  },

  // 每次进入本页都拉一次平台投递（force：App.onShow 只在【应用回到前台】时触发，
  // 小程序内部从首页点进来不会 —— 那正是「刚在电脑上发完、马上进来看」的路径）。
  async _syncFromSatsim() {
    let box = null;
    try { box = require('../../utils/satsimBox'); } catch (e) { return; }
    if (!box.getCh()) return;                    // 没绑定过，不发任何请求
    let r = null;
    try { r = await box.syncNow({ force: true }); } catch (e) { return; }
    if (!r || !r.set) return;                    // 这一轮没有星座进来（配置/计划照旧由各自的页面消化）
    const fresh = satsimPack.takeFreshSet();
    const key = this._rebuildGroups(fresh ? SS_PREFIX + fresh : this._curKey());
    // 没有「新到的那一份」（只是名字/颗数变了）→ 列表已随 _rebuildGroups 刷新，不打断正在看的分组
    if (!fresh) return;
    this._loadGroup(this.data.groupIndex);
    this._saveSelection();
    wx.showToast({ title: '已同步「' + this._labelOf(key) + '」', icon: 'none', duration: 2000 });
  },

  // ===================== 分组列表（导入星座置顶 + 内置分组） =====================
  _curKey() {
    const g = this.data.groups[this.data.groupIndex];
    return g ? g.key : '';
  },
  _labelOf(key) {
    if (BUILTIN_LABEL[key]) return BUILTIN_LABEL[key];
    const row = (this.data.impSets || []).find((x) => SS_PREFIX + x.id === key);
    return row ? row.name : key;
  },
  /**
   * 重攒分组列表：仿真平台导入的星座排在最前（按到达时间倒序，最近发来的第一个），其后是内置分组。
   * preferKey 命中就选它；否则保持当前分组；再否则取第一个导入星座（没有则「中国星网」）。
   * 返回最终选中的分组键。只 setData，不加载 —— 加载与否由调用方决定。
   */
  _rebuildGroups(preferKey) {
    const sets = satsimPack.readSetIndex().slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const groups = sets.map((s) => ({ key: SS_PREFIX + s.id, label: s.name })).concat(BUILT_IN);
    const pick = (k) => (k ? groups.findIndex((g) => g.key === k) : -1);
    let idx = pick(preferKey);
    if (idx < 0) idx = pick(this._curKey());
    if (idx < 0) idx = pick(sets.length ? SS_PREFIX + sets[0].id : DEFAULT_KEY);
    if (idx < 0) idx = 0;
    this.setData({ groups: groups, impSets: sets, groupIndex: idx });
    return groups[idx] ? groups[idx].key : '';
  },

  // ===================== 导入面板（已导入星座的管理 + 密钥导入） =====================
  // 两条收件路径同一份内容，与「卫星覆盖」「频率计划」完全一致：
  //   · 绑定账号 —— 平台直投，打开本页即自动同步（见 _syncFromSatsim），不用输任何东西
  //   · 8 位密钥 —— 给没绑定过的人，在这里输
  onImportTap() {
    this.setData({ showImp: true, keyInput: '', otpCells: this.buildOtpCells(''), keyFocus: false });
  },
  hideImp() { this.setData({ showImp: false, keyFocus: false }, () => this._restartLoop()); },

  // 8 位分格输入，与「卫星覆盖 / 频率计划」那两处逐格同款（同一条通道，同一种手感）。
  // 真实 <input> 移出可视区：真机上它是画在 webview 之上的原生控件，文字与系统光标 CSS 压不住。
  buildOtpCells(key) {
    const chars = String(key || '').split('');
    const n = chars.length, cells = [];
    for (let i = 0; i < 8; i++) {
      if (i === 4) cells.push({ id: 'sep', sep: true });   // 第 4/5 格之间一个只读「-」
      cells.push({ id: 'c' + i, sep: false, char: chars[i] || '', filled: i < n, active: i === n });
    }
    return cells;
  },
  onKeyInput(e) {
    const key = satsimPack.normalizeKey(e.detail.value);
    this.setData({ keyInput: key, otpCells: this.buildOtpCells(key), keyFocus: true });
  },
  onOtpFocus() { this.setData({ keyFocus: true }); },
  onOtpBlur() { this.setData({ keyFocus: false }); },
  focusOtp() { if (!this.data.keyFocus) this.setData({ keyFocus: true }); },

  async confirmKeyImport() {
    const key = satsimPack.normalizeKey(this.data.keyInput);
    if (!/^[A-Z0-9]{8}$/.test(key)) { wx.showToast({ title: '请输入 8 位密钥', icon: 'none' }); return; }
    if (this.data.importing) return;
    this.setData({ importing: true });
    wx.showLoading({ title: '拉取中...', mask: true });
    let got = null;
    try {
      got = await satsimPack.fetchPack(key);
    } catch (e) {
      wx.hideLoading();
      this.setData({ importing: false });
      wx.showModal({ title: '导入失败', content: (e && e.message) || '未知错误', showCancel: false });
      return;
    }
    wx.hideLoading();
    this.setData({ importing: false });

    const pack = got.pack;
    if (!satsimPack.itemsOf(pack, 'sat-set').length) {
      // 同一个密钥在哪个入口输都拉得到同一个包 —— 说清这个包该去哪导，别让人反复试
      wx.showModal({
        title: '包里没有星座',
        content: '这个密钥装的是 ' + satsimPack.describePack(pack)
          + '。链路配置请到「我的配置 → 导入」，频率计划请到「工具栏 → 频率计划」输入。',
        showCancel: false
      });
      return;
    }
    const r = satsimPack.importSatSets(pack);
    this._applyImported(r);
  },

  // 导入落地后：重攒分组列表 → 选中刚进来的那一份 → 加载。密钥与绑定两条路共用。
  _applyImported(r) {
    const fresh = satsimPack.takeFreshSet();
    this._rebuildGroups(fresh ? SS_PREFIX + fresh : this._curKey());
    this.setData({ showImp: false, keyFocus: false, keyInput: '', otpCells: this.buildOtpCells('') }, () => this._restartLoop());
    this._loadGroup(this.data.groupIndex);
    this._saveSelection();
    const tail = r.failed ? `（${r.failed} 份存不下）` : '';
    wx.showToast({ title: '已导入 ' + (r.total - r.failed) + ' 份星座' + tail, icon: 'none', duration: 2000 });
  },

  // 面板里点某一份 -> 切到它
  onImpTap(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ showImp: false, keyword: '', searchResults: [] }, () => this._restartLoop());
    this._rebuildGroups(SS_PREFIX + id);
    this._loadGroup(this.data.groupIndex);
    this._saveSelection();
  },
  _impRow(e) {
    const id = e && e.currentTarget && e.currentTarget.dataset.id;
    return (this.data.impSets || []).find((x) => x.id === id) || null;
  },
  // 行上的「改名 / 移除」（catchtap，不触发切换分组）。长按同样出这两项 —— 有人会先去长按。
  onImpRename(e) { const row = this._impRow(e); if (row) this._renameImp(row); },
  onImpDelete(e) { const row = this._impRow(e); if (row) this._deleteImp(row); },
  onImpLongPress(e) {
    const row = this._impRow(e);
    if (!row) return;
    wx.showActionSheet({
      itemList: ['改名', '移除'],
      success: (res) => {
        if (res.tapIndex === 0) this._renameImp(row);
        else if (res.tapIndex === 1) this._deleteImp(row);
      }
    });
  },
  _renameImp(row) {
    wx.showModal({
      title: '改名', editable: true, placeholderText: row.name, content: row.name,
      success: (res) => {
        if (!res.confirm) return;
        const nm = String(res.content || '').trim();
        if (!nm || !satsimPack.renameSet(row.id, nm)) return;
        this._rebuildGroups(this._curKey());
      }
    });
  },
  _deleteImp(row) {
    wx.showModal({
      title: '移除星座',
      content: '移除「' + row.name + '」（' + row.count + ' 颗）？平台重新发送即可恢复。',
      success: (res) => {
        if (!res.confirm) return;
        const wasCur = this._curKey() === SS_PREFIX + row.id;
        satsimPack.removeSet(row.id);
        this._rebuildGroups(this._curKey());
        if (wasCur) { this._loadGroup(this.data.groupIndex); this._saveSelection(); }
        wx.showToast({ title: '已移除「' + row.name + '」', icon: 'none' });
      }
    });
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
    this._loadGroup(idx); // 内部已清空选中（_selIdx=-1）
    this._saveSelection();
  },

  // ===================== 选择缓存（永久持久化，切出再开保持不变） =====================
  _saveSelection() {
    const m = this._meta;
    const selNorad = (this._selIdx >= 0 && m && m[this._selIdx]) ? String(m[this._selIdx].noradId) : '';
    try {
      // 按【键】存而不是下标：导入的星座插在列表最前面，下标会整体错位
      wx.setStorageSync('constellation/selection', { groupKey: this._curKey(), selNorad });
    } catch (e) { /* 存储失败不影响功能 */ }
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

    const curKey = this._curKey();
    // 优先用全局索引跨分组搜索；索引未就绪时退化为当前组
    const hasIndex = this._index && this._index.length;
    if (!hasIndex && this._metaSrcKey !== curKey) {
      // 退化源按组缓存一份（同一数组身份才能命中 satSearch 的归一化名缓存）
      this._metaSrc = this._meta.map((m) => ({ name: m.name, noradId: m.noradId, group: curKey }));
      this._metaSrcKey = curKey;
    }
    const src = this._searchSrc(hasIndex ? this._index : (this._metaSrc || []));

    const now = new Date();
    const gmst = sat.gstime(now);
    const out = satSearch.searchSats(src, raw, 50).map((s) => {
      // 槽位仅当该星属当前已加载分组且为 GEO 时才能算（其它情况无 TLE 在手）
      let slot = '';
      if (s.group === curKey && curKey === 'geo') {
        const idx = this._idxByNorad(s.noradId);
        if (idx >= 0) {
          const pv = sat.propagate(this._recs[idx], now);
          if (pv && pv.position) slot = this._fmtSlot(sat.degreesLong(sat.eciToGeodetic(pv.position, gmst).longitude));
        }
      }
      return { name: s.name, noradId: s.noradId, group: s.group, groupLabel: this._labelOf(s.group), slot };
    });
    this.setData({ searchResults: out });
  },

  // 搜索源 = 导入星座的星（放最前，保证在 50 条上限内先被扫到）+ 跨分组索引（或退化的当前组）。
  // ★ 合并结果必须缓存住数组【身份】：satSearch 的归一化名缓存以数组本身为键，每次敲键都新造一个
  //   数组的话，那份缓存永远命中不了，几万条名字每按一个键重新归一化一遍。
  _searchSrc(base) {
    const imp = this._impSearchSrc();
    if (!imp.length) return base;
    if (this._mergedBase !== base || this._mergedImp !== imp) {
      this._mergedBase = base; this._mergedImp = imp; this._merged = imp.concat(base);
    }
    return this._merged;
  },
  // 导入星座的名录 [{name,noradId,group}]，按索引签名缓存（内容没变就不重新读一遍存储）
  _impSearchSrc() {
    const sets = this.data.impSets || [];
    const sig = sets.map((s) => s.id + ':' + (s.ts || 0)).join(',');
    if (this._impSrcSig === sig) return this._impSrc || [];
    const out = [];
    for (const row of sets) {
      const key = SS_PREFIX + row.id;
      for (const s of satsimPack.loadSetSats(row.id)) out.push({ name: s.name, noradId: s.noradId, group: key });
    }
    this._impSrcSig = sig; this._impSrc = out;
    return out;
  },

  clearSearch() {
    this.setData({ keyword: '', searchResults: [] });
  },

  onPickResult(e) {
    const norad = String(e.currentTarget.dataset.norad);
    const group = e.currentTarget.dataset.group;
    const curKey = this._curKey();
    this.setData({ searchResults: [] });

    // 已经就在该卫星所属分组 -> 直接选中
    if (group === curKey) {
      const idx = this._idxByNorad(norad);
      if (idx >= 0) { this._selectSat(idx); this._faceSat(); wx.vibrateShort({ type: 'light' }); }
      return;
    }
    // 否则跳转到该卫星所属分组，加载完成后在 _computePositions 中定位该星
    const gi = this.data.groups.findIndex((g) => g.key === group);
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

  // ===================== 时间轴（非实时，未来 0~24h；与星间链路一致） =====================
  // 计算用时刻：实时=真实此刻；否则=锚点 + 偏移
  _calcAt() {
    if (this.data.liveRefresh) return new Date();
    return new Date(this._baseTime + this.data.timeOffset * 60000);
  },
  // 量一次轨道触区的视口左缘/宽度（顶部布局固定，量一次即可复用）
  _measureTrack(cb) {
    wx.createSelectorQuery().in(this).select('.tb-track').boundingClientRect((r) => {
      if (r && r.width > 0) { this._trackLeft = r.left; this._trackW = r.width; }
      if (cb) cb();
    }).exec();
  },
  // 触摸位置 -> 偏移：换算 0~1440min，若在实时态则先退出并以当下为新锚点，按偏移重算
  // 节流到 ~16fps，避免拖动时 setData/SGP4 过密；touchend 会清节流确保落点精确
  _applyTouch(clientX) {
    if (!this._trackW) return;
    const pct = clamp((clientX - this._trackLeft) / this._trackW, 0, 1);
    const v = Math.round(pct * 1440);
    const patch = { timeOffset: v, timePct: v / 1440 * 100 };
    if (this.data.liveRefresh) { patch.liveRefresh = false; this._stopRefresh(); this._baseTime = Date.now(); }
    this.setData(patch);
    const now = Date.now();
    if (now - (this._lastTimeCalc || 0) < 60) return;
    this._lastTimeCalc = now;
    this._refreshPositions();
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
    if (this.data.liveRefresh || !this.data.timeOffset) return; // 实时态/已在此刻：无需重置
    this._baseTime = Date.now();
    this.setData({ timeOffset: 0, timePct: 0 });
    this._refreshPositions();
    wx.vibrateShort({ type: 'light' });
  },
  // 精调步进：拖动粗选后用 ±1m/±10m/±1h 精确落到目标分钟（限制在 0~24h 内）
  stepTime(e) {
    if (this.data.liveRefresh) return; // 实时态不步进
    const delta = parseInt(e.currentTarget.dataset.d, 10) || 0;
    const v = clamp((this.data.timeOffset || 0) + delta, 0, 1440);
    if (v === this.data.timeOffset) return; // 已到端点：不空转
    this.setData({ timeOffset: v, timePct: v / 1440 * 100 });
    this._refreshPositions();
    wx.vibrateShort({ type: 'light' });
  },
  // 时间轴标签：偏移 0 显示“此刻”，否则显示偏移量 + 绝对时刻 MM-DD HH:MM
  _fmtStamp(d) {
    const p = (n) => String(n).padStart(2, '0');
    const off = this.data.timeOffset;
    if (this.data.liveRefresh || !off) return this.data.liveRefresh ? '实时' : '此刻';
    const oh = Math.floor(off / 60), om = off % 60;
    return `+${oh}h${p(om)}m · ${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  },

  _fileID(name) {
    return `cloud://${ENV_ID}.${BUCKET}/celestrak/omm/${name}`;
  },

  // 云端 OMM 信封 {csv} -> 就地补出解析后的 sats（并删去 csv，避免本地缓存冗余）。
  // 老的 {sats} 直存格式也兼容（直接原样返回）。
  _omm(data) {
    if (data && data.csv && !data.sats) {
      data.sats = tleStore.parseOMMCsv(data.csv);
      delete data.csv;
    }
    return data;
  },

  // ---- 本地按需缓存：每组每天最多下载一次，当天再看直接读本机（零 CDN）----
  _dateStr(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },
  _todayStr() { return this._dateStr(new Date()); },
  // 数据自身下载日期(fetchedAt)是否=今天：缓存/云副本「是否当天」的唯一判据
  _isToday(iso) { return !!iso && this._dateStr(new Date(iso)) === this._todayStr(); },
  _cachePath(key) { return `${wx.env.USER_DATA_PATH}/tle_omm_${key}.json`; },
  // 当天有效则返回缓存对象，否则 null（读失败/过期都按未命中处理）
  _readCache(key) {
    try {
      if (wx.getStorageSync(`tle_omm_date_${key}`) !== this._todayStr()) return null;
      const data = JSON.parse(wx.getFileSystemManager().readFileSync(this._cachePath(key), 'utf8'));
      // 双保险：文件自身 fetchedAt 不是今天则按未命中（堵住旧逻辑遗留的“标记今天/文件昨天”）
      if (data && data.fetchedAt && !this._isToday(data.fetchedAt)) return null;
      return data;
    } catch (e) { return null; }
  },
  _writeCache(key, data) {
    try {
      // 本地缓存只存解析后的精简记录，去掉体积较大的原始 csv 文本
      let toWrite = data;
      if (data && data.csv) { toWrite = Object.assign({}, data); delete toWrite.csv; }
      wx.getFileSystemManager().writeFileSync(this._cachePath(key), JSON.stringify(toWrite), 'utf8');
      // 标记存“数据自身下载日期(fetchedAt)”而非“今天碰过”——旧副本不会被误判为当天
      const stamp = (data && data.fetchedAt) ? this._dateStr(new Date(data.fetchedAt)) : this._todayStr();
      wx.setStorageSync(`tle_omm_date_${key}`, stamp);
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

  // 懒加载全局搜索索引（跨分组）：仅用户首次搜索时触发。取数与「本地缓存/云端 _index.json + Starlink
  // 名单补齐/空结果不落盘」的口径统一收在 tleStore.ensureSearchIndex（星间链路页同一份），本页不再自建。
  _ensureIndex() {
    if ((this._index && this._index.length) || this._indexLoading) return; // 已就绪/加载中
    this._indexLoading = true;
    tleStore.ensureSearchIndex().then((index) => {
      this._index = (index && index.length) ? index : null; // 空 -> 置回 null，下次搜索重试而非当天钉死
      this._indexLoading = false;
      // 索引就绪后，若用户当前仍有关键字，重跑一次以升级为跨分组结果
      const kw = (this.data.keyword || '').trim();
      if (kw && this._index) this.onSearchInput({ detail: { value: this.data.keyword } });
    }).catch(() => { this._indexLoading = false; });
  },

  _loadGroup(idx) {
    const g = this.data.groups[idx];
    if (!g) return;
    this.setData(Object.assign({ loading: true, statusText: `加载 ${g.label} …`, selected: null }, this._beamResetPatch()));
    this._selIdx = -1; this._selOrbit = this._selTrack = this._selFootprint = null; this._selPos = null;

    // 仿真平台导入的星座：根数就在本地存储里，零网络（这批星里的自定义卫星/合成星
    // 本就不在 CelesTrak 目录中，除了平台送来的这一份别无来源）
    if (g.key.indexOf(SS_PREFIX) === 0) { this._loadImported(g); return; }
    if (g.key === 'all') { this._loadAll(); return; }
    if (g.key === 'other') { this._loadOther(); return; }

    // 当天本地缓存命中 -> 直接用，零 CDN（分块数据走旧路径不缓存）
    const cached = this._readCache(g.key);
    if (cached && cached.sats && !cached.chunked) { this._ingest(cached); return; }

    this._downloadJSON(this._fileID(`${g.key}.json`))
      .then((data) => {
        if (data && data.chunked) return this._loadChunks(g, data);
        data = this._omm(data); // OMM 信封 -> 解析出 sats
        // 云端缺失/为空/或不是当天 -> 现场直连 CelesTrak 拉“今天”的并回传（拿不到再退回这份旧副本）
        if (!data || !data.sats || !data.sats.length || !this._isToday(data.fetchedAt)) {
          return this._fetchGroupLive(g, data);
        }
        this._writeCache(g.key, data);
        this._ingest(data);
      })
      .catch(() => this._fetchGroupLive(g, null)); // 下载失败 -> 现场直连兜底
  },

  // 仿真平台导入的星座：读本地存储那份 OMM 根数直接建 satrec。
  // 「OMM 时间」取记录里最新的那个历元（不是导入时刻）—— 屏上那一行说的是根数有多新，
  // 而根数的新旧只由历元决定；导入时刻早晚不改变星在哪儿。
  _loadImported(g) {
    const id = g.key.slice(SS_PREFIX.length);
    const sats = satsimPack.loadSetSats(id);
    if (!sats.length) { this._fail('「' + g.label + '」没有可用的轨道根数，请让仿真平台重新发送'); return; }
    let latest = '';
    for (let i = 0; i < sats.length; i++) { const e = sats[i].epoch || ''; if (e > latest) latest = e; }
    // OMM 的 EPOCH 列不带时区后缀，直接 new Date 会被当本地时间读 —— 与 omm2satrec 同样补 Z 当 UTC
    if (latest && !/Z$/i.test(latest)) latest += 'Z';
    this.setData({ statusText: '' });
    this._ingest({ group: g.key, label: g.label, fetchedAt: latest || '', count: sats.length, sats: sats });
  },

  // 全集：各已知星座组并集 ∪「全部在轨」(active)，按 NORAD 去重后归类——在已知组里的标该组，
  // 其余标 'other'（=「其他」分组）。与仿真平台 ConstellationMap3D 的 loadUniverse 同口径。
  // 各已知组优先用当天本地缓存（零 CDN），未命中才下载；active 走 _loadActive（缓存→云端→直连兜底）。
  // active 拿不到时自动退化为已知组并集（此时「其他」为空），与平台一致。
  // 返回 Promise<{sats, fetchedAt}>；sats 每颗带 _group。label 仅用于进度文案（「全部卫星」/「其他」共用本函数）。
  _loadUniverse(label) {
    // 只枚举【内置】真实星历源：导入的星座没有 CelesTrak 端点，也不该混进「全部卫星 / 其他」的归类
    const keys = BUILT_IN.filter((g) => DERIVED_KEYS.indexOf(g.key) < 0).map((g) => g.key);
    const total = keys.length + 1; // +1 = 全部在轨(active)
    let done = 0;
    this.setData({ loading: true, statusText: `加载${label} 0/${total} …` });
    const bump = () => { done++; this.setData({ statusText: `加载${label} ${done}/${total} …` }); };
    const fetchedAts = []; // 各组实际下载时间 -> 合并视图取最新一份作为 OMM 显示时间
    const stamp = (data) => { if (data && data.fetchedAt) fetchedAts.push(data.fetchedAt); };

    const tasks = keys.map((key) => {
      // 当天本地缓存命中 -> 直接用，零 CDN（与单组视图共享同一份缓存）
      const cached = this._readCache(key);
      if (cached && cached.sats && !cached.chunked) { bump(); stamp(cached); return Promise.resolve(cached.sats); }
      return this._downloadJSON(this._fileID(`${key}.json`))
        .then((data) => {
          bump();
          if (data && data.chunked) return []; // 分块（旧路径）：本视图按空处理（单组视图仍可加载）
          data = this._omm(data); // OMM 信封 -> 解析出 sats
          if (!data || !data.sats) return []; // 缺失：本视图按空处理
          this._writeCache(key, data);
          stamp(data);
          return data.sats;
        })
        .catch(() => { bump(); return []; });
    });

    return Promise.all(tasks).then((arrs) => {
      // 已知组按 GROUPS 次序先到先认领（同一颗星只留一份）
      const universe = [], groupOf = Object.create(null);
      for (let i = 0; i < arrs.length; i++) {
        const key = keys[i], a = arrs[i];
        for (let j = 0; j < a.length; j++) {
          const s = a[j];
          if (groupOf[s.noradId]) continue;
          groupOf[s.noradId] = key;
          s._group = key;
          universe.push(s);
        }
      }
      // 再并入「全部在轨」中未被认领的 -> 「其他」
      return this._loadActive().then((act) => {
        bump();
        stamp(act);
        const asats = (act && act.sats) || [];
        for (let j = 0; j < asats.length; j++) {
          const s = asats[j];
          if (groupOf[s.noradId]) continue;
          groupOf[s.noradId] = 'other';
          s._group = 'other';
          universe.push(s);
        }
        const latest = fetchedAts.length ? fetchedAts.reduce((a, b) => (b > a ? b : a)) : null;
        return { sats: universe, fetchedAt: latest || new Date().toISOString() };
      });
    });
  },

  // 「全部在轨」(active)：当天本地缓存 -> 云存储 -> 本机直连 CelesTrak 兜底（并回传云存储惠及后续用户）。
  // 明文约 5MB，故不进启动时的众包全量刷新（见 utils/tleStore 的 ALL_KEYS），只在用户真正打开
  // 「全部卫星 / 其他」时按需取一次，之后当天走本地缓存。四路都拿不到时返回 null（全集退化为已知组并集）。
  _loadActive() {
    // 拿到全集就顺手把其中不在搜索索引里的星补成「其他」（索引可能是缺「其他」的旧副本/云端那份
    // 本身就没建全）——否则这批星在搜索框里始终不存在，用户只能靠切到「其他」分组慢慢翻。
    const withIndex = (data) => { if (data && data.sats) tleStore.mergeOtherIntoIndex(data.sats); return data; };
    const cached = this._readCache('active');
    if (cached && cached.sats && cached.sats.length) return Promise.resolve(withIndex(cached));
    const live = () => {
      this.setData({ statusText: '从 CelesTrak 获取全部在轨（约 5MB，首次较慢）…' });
      return tleStore.fetchGroupLiveOrSup('active').then((payload) => {
        this._writeCache('active', payload);
        tleStore.uploadGroupPayload('active', payload); // 后台回传云存储，后续用户走 CDN
        return withIndex(payload);
      }).catch(() => null); // 直连也失败 -> 退化为已知组并集
    };
    return this._downloadJSON(this._fileID('active.json'))
      .then((data) => {
        data = this._omm(data);
        if (!data || !data.sats || !data.sats.length) return null;
        this._writeCache('active', data);
        return withIndex(data);
      })
      .catch(() => null)
      .then((data) => data || live()); // 云端缺失才直连，且只试一次
  },

  // “全部卫星”：全集（已知组并集 ∪ 全部在轨）
  _loadAll() {
    this._loadUniverse('全部卫星').then(({ sats, fetchedAt }) => {
      if (!sats.length) { this._fail('暂无卫星数据（云端尚未生成）'); return; }
      this._ingest({ group: 'all', label: '全部卫星', fetchedAt, count: sats.length, sats });
    }).catch(() => this._fail('全部卫星获取失败，请检查网络'));
  },

  // “其他”：全集中不属于任何已知星座的星
  _loadOther() {
    this._loadUniverse('其他').then(({ sats, fetchedAt }) => {
      const others = sats.filter((s) => s._group === 'other');
      if (!others.length) { this._fail('暂无“其他”卫星（全部在轨星历未加载成功）'); return; }
      this._ingest({ group: 'other', label: '其他', fetchedAt, count: others.length, sats: others });
    }).catch(() => this._fail('“其他”获取失败，请检查网络'));
  },

  // 兜底：本机直连 CelesTrak 拉取某组（云端缺失/下载失败时），立即展示并回传云存储惠及后续用户
  _fetchGroupLive(g, fallback) {
    this.setData({ loading: true, statusText: `从 CelesTrak 获取 ${g.label}（首次较慢，请稍候）…` });
    tleStore.fetchGroupLiveOrSup(g.key)
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
        const rec = sat.omm2satrec(s);
        if (rec && !rec.error) {
          recs.push(rec);
          meta.push({ name: s.name, noradId: s.noradId, group: s._group || (data && data.group) || '' });
        }
      } catch (e) { /* 跳过坏根数 */ }
    }
    this._recs = recs;
    this._meta = meta;
    this._metaSrc = null; this._metaSrcKey = ''; // 组数据换了 -> 退化搜索源作废
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
    const now = this._calcAt();
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
    if (this._curKey() === 'all') {
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
    this._recomputeBaseMaxR();   // 渲染集变化(换组/刷新数据/抽稀)后重算缩放基准并缓存

    // 若已选中某星，刷新它的轨道/足迹与信息卡（与实时刷新保持一致）
    let selCard = null;
    if (this._selIdx >= 0) {
      this._buildSelectedGeometry(this._selIdx, now, gmst);
      selCard = this._selCardData(this._selIdx, now, gmst);
    }

    const patch = { loading: false, statusText: '', calcTime: this._fmt(now), timeLabel: this._fmtStamp(now) };
    if (selCard) patch.selected = selCard;
    this.setData(patch);

    // 跨分组搜索切组后：定位待选卫星
    if (this._pendingNorad) {
      const idx = this._idxByNorad(this._pendingNorad);
      const noFace = this._pendingNoFace;
      this._pendingNorad = null;
      this._pendingNoFace = false;
      if (idx >= 0) { this._selectSat(idx); if (!noFace) this._faceSat(); } // 恢复态只选中、不转向、不停自转
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

    // 覆盖足迹圈：按用户波束角重算（设置 this._selPos / this._selFootprint）
    this._buildFootprint(rec, now, gmstNow);

    this._selOrbit = orbit;
    this._selTrack = track;
  },

  // 覆盖足迹圈：按选中星「全波束角 B」算地面足迹（空=自动取 ε=0 上限，可手填更小值）。
  // 几何(地心 O、卫星 S、地面边缘 P)：半角 η=B/2 为星上天底角，地心半角
  //   λ = arcsin( (RE+h)/RE · sinη ) − η，夹断到 ≤ 上限 B_max=2·arcsin(RE/(RE+h))（ε=0 掠地平）。
  // 同步把 ε=0 上限写到 beamAuto(作 placeholder 常显)；用户值超上限时回写夹断值到 beam。
  _buildFootprint(rec, now, gmstNow) {
    const pvNow = sat.propagate(rec, now);
    if (!pvNow || !pvNow.position) { this._selFootprint = null; return; }
    this._selPos = ecefToRender(sat.eciToEcf(pvNow.position, gmstNow)); // 当前位置，供高亮/定位
    const gd = sat.eciToGeodetic(pvNow.position, gmstNow);
    const h = gd.height;
    if (!(h > 0)) { this._selFootprint = null; return; }
    const r = RE + h;
    const etaMax = Math.asin(clamp(RE / r, -1, 1));   // 星上天底角上限 (rad)
    const bMaxDeg = 2 * etaMax / DEG;                  // ε=0 全波束角上限 (°)

    // 生效全波束角：空框/非法 -> 自动取上限；有效 -> 取用户值并夹断到 ≤ 上限(超限回写)
    const raw = parseFloat(this.data.beam);
    let bDeg, clampText = null;
    if (!(raw > 0)) bDeg = bMaxDeg;
    else if (raw > bMaxDeg) { bDeg = bMaxDeg; clampText = bMaxDeg.toFixed(1); }
    else bDeg = raw;

    const eta = (bDeg / 2) * DEG;                                   // 半角 (rad)
    const lambda = Math.asin(clamp(r / RE * Math.sin(eta), -1, 1)) - eta;
    const cl = Math.cos(gd.latitude);
    const u = [cl * Math.cos(gd.longitude), Math.sin(gd.latitude), -cl * Math.sin(gd.longitude)];
    this._selFootprint = this._circleOnSphere(u, lambda, 72);

    // 显示：placeholder 常显 ε=0 上限；超限回写夹断值（清空后不再被自动回填）。
    // 锁定态不回写——保留锁定值原样平等作用于每颗星，几何仍按各星 ε=0 上限夹断
    const autoText = bMaxDeg.toFixed(1);
    const patch = {};
    if (autoText !== this.data.beamAuto) patch.beamAuto = autoText;
    if (clampText != null && !this.data.beamLock && clampText !== this.data.beam) patch.beam = clampText;
    if (Object.keys(patch).length) this.setData(patch);
  },

  // 波束角输入：空=自动(ε=0 上限随高度，由 placeholder 常显)；非空=自定义(几何夹断到 ≤ 上限)。即时重画覆盖圈
  onBeamInput(e) {
    this.setData({ beam: e.detail.value }, () => {
      if (this._selIdx < 0) return;
      const now = this._calcAt();
      this._buildFootprint(this._recs[this._selIdx], now, sat.gstime(now));
    });
  },

  // 锁定/解锁波束角：锁定后切换卫星不重置该值（见 _beamResetPatch）
  toggleBeamLock() {
    this.setData({ beamLock: !this.data.beamLock });
    wx.vibrateShort({ type: 'light' });
  },

  // 切换/取消选星时的波束重置补丁：未锁定=清空回到自动；锁定=保留 beam，仅清 placeholder（由下次 _buildFootprint 重填）
  _beamResetPatch() {
    return this.data.beamLock ? { beamAuto: '' } : { beam: '', beamAuto: '' };
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
    const gen = this._loopGen;
    this._rafId = this._canvas.requestAnimationFrame(() => { if (gen === this._loopGen) this._loop(); });
  },
  // 画布被 hidden 过（导入弹窗期间）之后 rAF 不再回调，帧循环会永久停住 —— 关弹窗时重新起一轮。
  // ★ 必须在 setData 的渲染完成回调里调：this.data 是同步更新的，但画布真正解除 display:none 要等
  //   这一帧渲染完；早了就是对着还没显示的画布起循环，起完照样停。
  // ★★ 换代号作废所有在途回调：hidden 期间那个迟到的 rAF 若还会回来，两条循环并行就是双倍开销。
  _restartLoop() {
    this._loopGen = (this._loopGen || 0) + 1;
    if (this._canvas) this._loop();
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

  // 自适应缩放基准：星点瞬时最大地心半径 + 选中星轨道远地点(a(1+e)·RE，与时间无关)。
  // 仅在换组/刷新数据/选星/取消选中时调用并缓存到 _baseMaxR；时间轴拖动不更新，避免整图缩放跳动。
  _recomputeBaseMaxR() {
    let m = RE * 1.05;
    const render = this._render || [];
    for (let i = 0; i < render.length; i++) {
      const p = render[i].pos;
      const r = Math.hypot(p[0], p[1], p[2]);
      if (r > m) m = r;
    }
    if (this._selIdx >= 0) {
      const rec = this._recs[this._selIdx];
      if (rec && rec.a) {                       // 远地点半径 = a(1+e)·RE（rec.a 为地球半径单位），保证选中星整条轨道始终在视野内
        const apo = rec.a * (1 + rec.ecco) * RE;
        if (apo > m) m = apo;
      }
    }
    this._baseMaxR = m;
  },

  _draw() {
    const ctx = this._ctx;
    if (!ctx) return;
    const w = this._cw, h = this._ch;
    const cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);

    this._cYaw = Math.cos(this._yaw); this._sYaw = Math.sin(this._yaw);
    this._cPitch = Math.cos(this._pitch); this._sPitch = Math.sin(this._pitch);

    // 最远渲染半径(自适应缩放基准)：由 _recomputeBaseMaxR 维护并缓存，仅在换组/刷新数据/选星时更新，
    // 不随时间轴变化——否则偏心轨道(如空间站组 FREGAT DEB、GPS 退役星)瞬时半径随时间漂移会让整图缩放跳动。
    let maxR = this._baseMaxR;
    if (!maxR) { this._recomputeBaseMaxR(); maxR = this._baseMaxR || RE * 1.05; }
    const half = Math.min(w, h) / 2 * 0.9;
    const scale = (half / maxR) * this._zoom;   // 自适应基准 × 用户双指缩放
    const Rpx = RE * scale;

    // 大气辉光 + 地球：仅依赖缩放(Rpx)，与自转/星点移动无关 → 缓存到离屏，缩放时才重绘
    this._drawBackground(cx, cy, Rpx, w, h);

    this._drawGraticule(cx, cy, scale, Rpx);
    this._drawCoastline(cx, cy, scale, Rpx);

    // 选中卫星的几何（在星点之下绘制）
    if (this._selFootprint) this._drawPath(this._selFootprint, cx, cy, scale, Rpx, {
      color: 'rgba(150,215,240,0.92)', hiddenColor: 'rgba(150,215,240,0.2)', width: 1, dash: [4, 3]
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
      this._recomputeBaseMaxR();   // 去掉选中星远地点项，基准回落到星点
      this.setData(Object.assign({ selected: null }, this._beamResetPatch()));
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
    // 轨位读数：内置 GEO 分组直接认；导入的星座里也可能全是 GEO 星（平台的卫星组常常就是几颗
    // 同步轨道星），那批星没有分组身份可依，改按根数判——周期≈恒星日、近圆、近赤道。
    const grp = m.group || this._curKey();
    const isGeo = grp === 'geo' || (grp.indexOf(SS_PREFIX) === 0
      && Math.abs((2 * Math.PI) / rec.no - 1436.07) < 12 && rec.ecco < 0.01 && Math.abs(rec.inclo / DEG) < 15);
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
    const now = this._calcAt();
    const gmst = sat.gstime(now);
    const card = this._selCardData(idx, now, gmst);
    if (!card) return;
    this._selIdx = idx;
    this._recomputeBaseMaxR();   // 折入选中星远地点：偏心/高轨星整条轨道始终在视野内，且基准不随时间漂移
    this.setData(this._beamResetPatch()); // 新选星 -> 未锁定则波束回到自动；锁定则保留固定值
    this._buildSelectedGeometry(idx, now, gmst);
    this.setData({ selected: card });
    this._saveSelection();
  },

  // 实时刷新：按当前真实时间重算渲染子集的位置（不重新抽稀），并更新选中星几何/信息卡
  _refreshPositions() {
    if (this._dragging || this._pinching) return; // 手势中跳过，避免卡顿叠加
    const render = this._render;
    if (!render || !render.length) return;
    const now = this._calcAt();
    const gmst = sat.gstime(now);
    for (let k = 0; k < render.length; k++) {
      const pv = sat.propagate(this._recs[render[k].idx], now);
      if (pv && pv.position) render[k].pos = ecefToRender(sat.eciToEcf(pv.position, gmst));
    }
    const patch = { calcTime: this._fmt(now), timeLabel: this._fmtStamp(now) };
    if (this._selIdx >= 0) {
      this._buildSelectedGeometry(this._selIdx, now, gmst);
      const card = this._selCardData(this._selIdx, now, gmst);
      if (card) patch.selected = card;
    }
    this.setData(patch);
  },

  closeCard() {
    this._selIdx = -1; this._selOrbit = this._selTrack = this._selFootprint = null;
    this._selPos = null;
    this._recomputeBaseMaxR();   // 取消选中：去掉选中星远地点项，基准回落到星点
    this.setData(Object.assign({ selected: null }, this._beamResetPatch()));
    this._saveSelection();
  },

  toggleRotate() {
    this._autoRotate = !this._autoRotate;
    this.setData({ autoRotate: this._autoRotate });
  },

  // 实时刷新开关（与旋转独立，可叠加）；开启 1Hz 按真实时间推进卫星位置
  toggleRefresh() {
    const on = !this.data.liveRefresh;
    if (on) {
      this.setData({ liveRefresh: on });
      this._startRefresh();
      this._refreshPositions(); // 立即先刷一次
    } else {
      // 退出实时：以当前真实时刻为新锚点，时间轴回到“此刻”
      this._stopRefresh();
      this._baseTime = Date.now();
      this.setData({ liveRefresh: false, timeOffset: 0, timePct: 0, timeLabel: '此刻' });
      this._refreshPositions();
    }
    wx.vibrateShort({ type: 'light' });
  }
});

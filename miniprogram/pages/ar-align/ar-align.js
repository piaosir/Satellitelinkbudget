// ar-align.js
const app = getApp();
// 姿态解算与传感器口径检测：分包内纯函数模块，可在 Node 下仿真（scripts/simArAlign.js）
const arAtt = require('./arAttitude.js');
// 目标几何：SGP4 观测角 / 标称轨位回退 / 轨道分类 / 过境预报（纯函数，scripts/simArOrbit.js）
const arOrbit = require('./arOrbit.js');
// SGP4 与卫星搜索：分包各自内置一份（分包不能 require 其他分包，主包 utils 又受「主包未使用 JS」检查约束）
const sat = require('./satellite.js');
const satSearch = require('./satSearch.js');
// 星历取数与跨分组搜索索引：与星座地图 / 星间链路同一套本地缓存 + 云存储 + 直连兜底
const tleStore = require('../../utils/tleStore.js');
// 仿真平台送来的「卫星集」：从星座地图带星跳转过来时，卫星可能属于这类导入分组（键以 ss: 开头）
const satsimPack = require('../../utils/satsimPack.js');

// iOS 新口径开关：true = 矩阵解算 + 罗盘锚定零点（消除仰角 45° 处的翻转跳变与罗盘抖动）；
// false = 逐位回到改动前的「罗盘直出 + 仰角>45° 补 180°」旧逻辑，仅作应急回退。
const IOS_ANCHOR_MODE = true;
// 手动 180° 翻转开关的持久化键：任何机型遇到方向反向时的保底手段
const FLIP_STORAGE_KEY = 'arAlign_flip180';
// 上次选择的目标（与星座地图 / 星间链路一样永久记住，失效回退默认）
const SEL_STORAGE_KEY = 'arAlign/selection';
const D2R = Math.PI / 180;

// ---- 常用同步轨道通信卫星（主力服务星：中星系列）----
// position = 标称轨位（°E），noradId = CelesTrak 编目号。有星历时按 SGP4 取真实位置（含倾角与漂移），
// 标称轨位只作离线回退：例如中星 10 已由 110.5°E 迁到 85.5°E，按老标称算方位会偏 30° 以上；
// 中星 9 倾角近 1°，一天内仰角来回摆 ±1°。没有 noradId 的（CelesTrak GEO 组里找不到对应编目）只能按标称算。
// 名称与主页 / 覆盖图那份列表一致（那两处仍按标称轨位口径，不在本页范围内）。
const COMMON_GSO = [
  { name: 'CHINASAT 6C', position: '130.5', noradId: '44067' },  // ZHONGXING-6C
  { name: 'CHINASAT 6D', position: '125', noradId: '52255' },    // ZHONGXING-6D
  { name: 'CHINASAT 6E', position: '115.5', noradId: '58253' },  // ZHONGXING-6E
  { name: 'CHINASAT 9', position: '92.2', noradId: '33051' },    // ZHONGXING-9（倾角 ~1°）
  { name: 'CHINASAT 9B', position: '101.4', noradId: '49125' },
  { name: 'CHINASAT 9C', position: '92.2', noradId: '64470' },
  { name: 'CHINASAT 10', position: '85.5', noradId: '37677' },   // ZHONGXING-10：星历显示已在 85.5°E（原 110.5°E 由 10R 接替）
  { name: 'CHINASAT 10R', position: '110.5', noradId: '63075' }, // ZHONGXING-10R
  { name: 'CHINASAT 11', position: '98', noradId: '39157' },     // ZHONGXING-11
  { name: 'CHINASAT 12', position: '87.5', noradId: '39017' },   // ZHONGXING-12
  { name: 'CHINASAT 15', position: '51.5', noradId: '' },        // CelesTrak GEO 组无对应编目 → 只能按标称
  { name: 'CHINASAT 19', position: '163.4', noradId: '54230' },  // ZHONGXING-19
  { name: 'CHINASAT 16', position: '110.5', noradId: '42662' },  // CHINASAT 16 (SJ-13)
  { name: 'CHINASAT 26', position: '125', noradId: '55686' },    // ZHONGXING-26
  { name: 'CHINASAT 27', position: '87.5', noradId: '' },        // 同上，只能按标称
  { name: 'APSTAR 5C', position: '138', noradId: '43611' },      // CelesTrak 名 TELSTAR 18V（与 APT 合营，即亚太 5C）
  { name: 'APSTAR 6C', position: '134', noradId: '43450' },
  { name: 'APSTAR 7', position: '76.5', noradId: '38107' },
  { name: 'APSTAR 9', position: '142', noradId: '40982' },
  { name: 'APSTAR 6D', position: '134', noradId: '45863' },
  { name: 'AsiaSat 5', position: '100.5', noradId: '35696' },
  { name: 'AsiaSat 6', position: '120', noradId: '40141' },
  { name: 'AsiaSat 7', position: '105.5', noradId: '37933' },
  { name: 'AsiaSat 9', position: '122', noradId: '42942' }
];

// NGSO 分组（键与 utils/tleStore 的 GROUP_QUERY / 星座地图 BUILT_IN 一致；'' = 跨全部在轨搜索）
const NGSO_GROUPS = [
  { key: '', label: '全部在轨' },
  { key: 'beidou', label: '北斗' },
  { key: 'gps', label: 'GPS' },
  { key: 'glonass', label: 'GLONASS' },
  { key: 'galileo', label: 'Galileo' },
  { key: 'starlink', label: 'Starlink' },
  { key: 'oneweb', label: 'OneWeb' },
  { key: 'kuiper', label: 'Kuiper' },
  { key: 'qianfan', label: '千帆星座' },
  { key: 'guowang', label: '中国星网' },
  { key: 'iridium', label: '铱星' },
  { key: 'globalstar', label: 'Globalstar' },
  { key: 'o3b', label: 'O3b' },
  { key: 'stations', label: '空间站' },
  { key: 'planet', label: 'Planet' },
  { key: 'spire', label: 'Spire' },
  { key: 'other', label: '其他' }
];
const GROUP_LABEL = { geo: 'GEO' };
NGSO_GROUPS.forEach((g) => { if (g.key) GROUP_LABEL[g.key] = g.label; });
const SS_PREFIX = 'ss:';
// 目标信息刷新周期：选择页 1 s（卡片读数），AR 阶段 250 ms（LEO 过顶时方位每秒可动 1°，再慢图标就漂）
const TICK_INPUT_MS = 1000;
const TICK_AR_MS = 250;

// 千分位（本页只用于 km 读数）
function fmtInt(v) {
  if (!Number.isFinite(v)) return '-';
  return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function pad2(n) { return String(n).padStart(2, '0'); }
// 时刻：当天只显示 HH:MM，跨天前置 MM-DD
function fmtClock(d, now) {
  if (!d) return '-';
  const sameDay = now && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  const hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  return sameDay ? hm : (pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + hm);
}
function fmtLonText(lon) {
  if (!Number.isFinite(lon)) return '';
  return Math.abs(lon).toFixed(1) + '°' + (lon >= 0 ? 'E' : 'W');
}
function fmtDur(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ':' + pad2(s);
}

Page({
  data: {
    // 阶段: 'input' 选择目标, 'ar' AR对星
    stage: 'input',

    // 系统信息
    platform: '', // 平台信息：ios, android, devtools

    // ---- 目标选择 ----
    mode: 'gso',                 // 'gso' 同步轨道 | 'ngso' 非同步轨道
    satellites: COMMON_GSO,      // GSO 常用列表
    satelliteIndex: 0,
    groups: NGSO_GROUPS,         // NGSO 分组
    groupIndex: 0,
    keyword: '',
    results: [],                 // 搜索/浏览结果 [{name, noradId, group, groupLabel, lonText}]
    resultsTitle: '',
    tgt: null,                   // 选中目标的静态描述 {name, badge, sub, noradId, src}
    tInfo: null,                 // 目标实时观测 {az, el, range, alt, vis, visText, pass}
    locText: '定位中…',
    locOk: false,

    // 用户位置
    userLatitude: 0,
    userLongitude: 0,

    // 设备方向
    deviceAlpha: 0,  // 设备方向角度 (0-360)
    deviceBeta: 0,   // 前后倾斜 (-180 到 180)
    deviceGamma: 0,  // 左右倾斜 (-90 到 90)
    compassDirection: 0,  // 罗盘方向 (0-360)

    // 卫星位置计算结果（目标角度）
    azimuth: 0,      // 目标方位角
    elevation: 0,    // 目标仰角
    targetLine: '',  // AR 信息栏第三行：轨道类别 / 距离 / 可见状态
    belowHorizon: false,

    // 手机当前指向（实时角度）
    currentAzimuth: 0,    // 当前方位角
    currentElevation: 0,  // 当前仰角

    // AR状态
    satelliteVisible: false,
    satelliteX: 0,
    satelliteY: 0,
    isAligned: false,
    isAtEdge: false,
    offsetDistance: 0,
    showTip: true,
    lastAlignedState: false,

    // 传感器数据平滑 - 减少历史记录以提高跟手性
    sensorHistory: [],
    historySize: 2,

    // 屏幕尺寸
    screenWidth: 0,
    screenHeight: 0,

    // 加载状态
    loading: false,
    loadingText: '',

    // 保底与诊断
    manualFlip: false,     // 手动把方位翻转 180°（持久化）
    debugVisible: false,   // 诊断面板
    debugLines: [],
    recording: false       // 正在录制 10 秒传感器数据
  },

  onLoad(options) {
    this._androidState = {
      enabled: false,
      calibrating: false,
      calibrationStartTs: 0,
      lastRenderTs: 0,
      renderIntervalMs: 50,
      elevationSamples: [],
      headingDiffSamples: [],
      pitchSamples: [],
      rollSamples: [],
      headingWindow: [],
      elevationWindow: [],
      azimuthOffset: 0,
      elevationOffset: 0,
      pitchZero: 0,
      rollZero: 0,
      headingJitter: 0,
      smoothedAzimuth: null,
      smoothedElevation: null
    };

    // 获取屏幕尺寸和系统信息
    const windowInfo = wx.getWindowInfo();
    const deviceInfo = wx.getDeviceInfo();
    console.log('系统信息:', {
      platform: deviceInfo.platform,
      system: deviceInfo.system,
      model: deviceInfo.model
    });

    let manualFlip = false;
    try { manualFlip = !!wx.getStorageSync(FLIP_STORAGE_KEY); } catch (e) { manualFlip = false; }
    this._manualFlip = manualFlip;

    this.setData({
      screenWidth: windowInfo.windowWidth,
      screenHeight: windowInfo.windowHeight,
      platform: deviceInfo.platform, // 保存平台信息用于后续判断
      manualFlip: manualFlip
    });

    // 平台分流：
    //   'android'          → 安卓路径（旋转矩阵，口径已在真机验证，本次未改）
    //   'ohos' / 'ohos_pc' → 鸿蒙路径（鸿蒙 NEXT 的 platform 是 'ohos'，改动前误走 iOS 路径：
    //                        安卓系罗盘的翻转点在地平线而非 45°，相机仰角 0~45° 时方位正好反 180°）
    //   其余（ios/devtools）→ iOS 路径
    const platform = deviceInfo.platform;
    this._androidState.enabled = platform === 'android';
    this._ohosState = { enabled: platform === 'ohos' || platform === 'ohos_pc' };
    this._iosState = { enabled: !this._androidState.enabled && !this._ohosState.enabled };
    let sdkVersion = '';
    try { sdkVersion = (wx.getAppBaseInfo && wx.getAppBaseInfo().SDKVersion) || ''; } catch (e) { sdkVersion = ''; }
    this._sysInfo = {
      platform: platform,
      system: deviceInfo.system || '',
      model: deviceInfo.model || '',
      sdk: sdkVersion
    };
    this._resetPathStates();

    // ---- 目标选择：观测站 / 目标 / 星历 / 搜索索引 ----
    this._obs = null;            // arOrbit.observer（定位成功后才有）
    this._look = null;           // 目标最近一次观测角 {az, el, range, alt, lat, lon}
    this._target = null;         // 当前目标：见 _setTarget
    this._gsoTarget = null;      // 两种模式各记最近一次目标，切换分段时来回恢复
    this._ngsoTarget = null;
    this._geoSats = null;        // GEO 组全量（带此刻定点经度，按经度排序）
    this._geoById = null;        // noradId -> 根数记录
    this._geoFetchedAt = '';
    this._geoLoading = null;
    this._index = null;          // 跨分组搜索索引 [{name, noradId, group}]
    this._indexLoading = false;
    this._indexGeo = null;       // 索引里的 GEO 组（GEO 根数没到手前的退化搜索源）
    this._indexNgso = null;      // 索引里除 GEO 外的全部
    this._indexByGroup = {};     // 索引按组切片缓存（数组身份稳定，satSearch 的归一化缓存才能命中）
    this._pass = null;           // 过境预报缓存 {key, result|null, at}
    this._passBusy = false;
    this._tgtTimer = null;
    this._tgtSeq = 0;            // 目标序号：异步星历回来时校验目标没被换掉

    this._initSelection(options || {});
    this._locate(false).catch(() => {});
    this._startTargetTimer(TICK_INPUT_MS);
  },

  onUnload() {
    // 停止监听传感器
    this.stopSensors();
    this._stopRecording();
    this._stopTargetTimer();
  },

  // ================= 目标选择 =================

  // 进页初始化目标：星座地图带星跳转（?norad&group&name）> 上次选择 > 默认中星 6C
  _initSelection(options) {
    if (options.norad && options.group) {
      const group = String(options.group);
      let name = '';
      try { name = decodeURIComponent(options.name || ''); } catch (e) { name = String(options.name || ''); }
      const mode = group === 'geo' ? 'gso' : 'ngso';
      this.setData({ mode: mode });
      this._setTarget({ kind: 'tle', name: name || ('NORAD ' + options.norad), noradId: String(options.norad), group: group, source: 'map' });
      this._resolveTle();
      if (mode === 'gso') this._ensureGeo();
      return;
    }
    let saved = null;
    try { saved = wx.getStorageSync(SEL_STORAGE_KEY) || null; } catch (e) { saved = null; }
    const mode = (saved && saved.mode === 'ngso') ? 'ngso' : 'gso';
    // GSO 槽：常用列表按名字找回（列表顺序/轨位可能已随版本变，不按下标）；找不到或搜索选的 GEO 星按 tle 恢复
    let gso = null;
    if (saved && saved.gso) {
      const li = COMMON_GSO.findIndex((s) => s.name === saved.gso.name);
      if (li >= 0) gso = this._commonTarget(li);
      else if (saved.gso.noradId) gso = { kind: 'tle', name: saved.gso.name || '', noradId: String(saved.gso.noradId), group: 'geo', source: 'restore' };
    }
    if (!gso) gso = this._commonTarget(0);
    let ngso = null;
    if (saved && saved.ngso && saved.ngso.noradId && saved.ngso.group) {
      ngso = { kind: 'tle', name: saved.ngso.name || '', noradId: String(saved.ngso.noradId), group: String(saved.ngso.group), source: 'restore' };
    }
    this._gsoTarget = gso;
    this._ngsoTarget = ngso;
    const cur = mode === 'ngso' ? (ngso || gso) : gso;
    this.setData({ mode: (mode === 'ngso' && ngso) ? 'ngso' : 'gso', satelliteIndex: gso.listIndex >= 0 ? gso.listIndex : 0 });
    this._setTarget(cur, true);
    if (cur.kind === 'tle') this._resolveTle();
    // GEO 组根数：常用星升级为 SGP4、GSO 搜索标注定点经度；NGSO 模式下也顺手预热（77KB，当天缓存）
    this._ensureGeo();
  },

  // 常用列表第 i 项 → 目标（标称轨位起步，GEO 根数到手后由 _upgradeCommon 升级为 SGP4）
  _commonTarget(i) {
    const s = COMMON_GSO[i];
    return { kind: 'slot', name: s.name, noradId: s.noradId || '', group: 'geo', slotLon: parseFloat(s.position), listIndex: i, source: 'common' };
  },

  // 设定当前目标并刷新卡片。t = { kind:'slot'|'tle', name, noradId, group, slotLon?, rec?, listIndex?, source }
  _setTarget(t, silent) {
    this._tgtSeq++;
    t.seq = this._tgtSeq;
    this._target = t;
    this._look = null;
    this._pass = null;
    if (t.group === 'geo' || t.kind === 'slot') this._gsoTarget = t; else this._ngsoTarget = t;
    if (t.kind === 'slot' && t.noradId && this._geoById) this._upgradeCommon();
    this.setData({ tgt: this._describeTarget(t), tInfo: null, belowHorizon: false });
    this._refreshTargetInfo(true);
    if (!silent) this._saveSelection();
  },

  // 目标的静态描述（卡片抬头）
  _describeTarget(t) {
    if (!t) return null;
    const cls = t.cls || (t.group === 'geo' || t.kind === 'slot' ? 'GEO' : '');
    let sub = '', src = '';
    if (t.rec) {
      const c = t.clsInfo;
      if (c && (c.cls === 'GEO' || c.cls === 'IGSO')) {
        sub = Number.isFinite(t.slotLon) ? ('标称轨位 ' + fmtLonText(t.slotLon)) : '';
      } else if (c) {
        sub = '高度 ' + fmtInt(c.altKm) + ' km · 倾角 ' + c.inclDeg.toFixed(1) + '° · 周期 ' + c.periodMin.toFixed(0) + ' min';
      }
      src = '星历 ' + (t.fetchedAt ? this._fmtFetched(t.fetchedAt) : '') + ' · SGP4';
    } else if (t.kind === 'slot') {
      sub = '标称轨位 ' + fmtLonText(t.slotLon);
      src = !t.noradId ? '无星历编目，按标称轨位计算'
        : (this._geoFailed ? '星历暂不可用，按标称轨位计算' : '星历加载中… 暂按标称轨位');
    } else {
      src = t.resolveFail ? ('星历获取失败' + (t.resolveMsg ? '：' + t.resolveMsg : '')) : '星历加载中…';
    }
    return {
      name: t.name || ('NORAD ' + t.noradId),
      badge: cls || (GROUP_LABEL[t.group] || ''),
      groupLabel: t.group.indexOf(SS_PREFIX) === 0 ? '导入星座' : (GROUP_LABEL[t.group] || ''),
      noradId: t.noradId || '',
      sub: sub,
      src: src,
      noEph: !t.rec
    };
  },

  _fmtFetched(iso) {
    try {
      const d = new Date(iso);
      return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    } catch (e) { return ''; }
  },

  // 按分组 + NORAD 取根数并解析 satrec（星座地图 / 星间链路同一套取数）。目标在等待期间被换掉则丢弃结果。
  _resolveTle() {
    const t = this._target;
    if (!t || t.kind !== 'tle' || t.rec) return Promise.resolve(!!(t && t.rec));
    if (t.resolving) return t.resolving;
    const key = t.group;
    let load;
    if (key.indexOf(SS_PREFIX) === 0) {
      load = Promise.resolve({ sats: satsimPack.loadSetSats(key.slice(SS_PREFIX.length)) || [], fetchedAt: '' });
    } else {
      load = tleStore.loadGroupSats(key);
    }
    t.resolving = load.then(({ sats, fetchedAt }) => {
      const id = String(t.noradId);
      const s = (sats || []).find((x) => String(x.noradId) === id);
      if (!s) throw new Error('编目里没有这颗星');
      let rec;
      try { rec = sat.omm2satrec(s); } catch (e) { rec = null; }
      if (!rec || rec.error) throw new Error('根数解析失败');
      return { s: s, rec: rec, fetchedAt: fetchedAt || s.epoch || '' };
    }).then(({ s, rec, fetchedAt }) => {
      t.resolving = null;
      if (this._target !== t) return false; // 已换目标
      this._applyRec(t, rec, s.name, fetchedAt);
      return true;
    }).catch((e) => {
      t.resolving = null;
      if (this._target !== t) return false;
      t.resolveFail = true;
      t.resolveMsg = (e && e.message) || '';
      this.setData({ tgt: this._describeTarget(t) });
      if (t.source === 'restore') {
        // 上次选的星失效 → 回退默认（与其他页面的失效口径一致）
        wx.showToast({ title: '上次所选卫星星历失效，已回退默认', icon: 'none' });
        const d = this._commonTarget(0);
        this.setData({ mode: 'gso', satelliteIndex: 0 });
        this._setTarget(d);
      } else {
        wx.showToast({ title: '星历获取失败' + (t.resolveMsg ? '：' + t.resolveMsg : ''), icon: 'none' });
      }
      return false;
    });
    return t.resolving;
  },

  // 根数到手：目标升级为 SGP4 口径
  _applyRec(t, rec, trueName, fetchedAt) {
    t.rec = rec;
    t.kind = 'tle';
    t.resolveFail = false;
    t.clsInfo = arOrbit.classify(rec);
    t.cls = t.clsInfo.cls;
    t.isGeo = t.clsInfo.cls === 'GEO' || t.clsInfo.cls === 'IGSO';
    t.fetchedAt = fetchedAt || '';
    if (trueName && t.source !== 'common') t.name = trueName; // 常用列表保留中文习惯名（CHINASAT），搜索来的用编目名
    this._pass = null;
    this.setData({ tgt: this._describeTarget(t) });
    this._refreshTargetInfo(true);
  },

  // GEO 组根数（当天本地缓存 → 云存储 → 直连），到手后：常用星升级 SGP4、GSO 搜索可标定点经度
  _ensureGeo() {
    if (this._geoSats) return Promise.resolve(this._geoSats);
    if (this._geoLoading) return this._geoLoading;
    this._geoLoading = tleStore.loadGroupSats('geo').then(({ sats, fetchedAt }) => {
      const list = this._withGeoLon(sats || []);
      const byId = Object.create(null);
      for (let i = 0; i < list.length; i++) byId[String(list[i].noradId)] = list[i]._raw;
      this._geoSats = list;
      this._geoById = byId;
      this._geoFetchedAt = fetchedAt || '';
      this._geoLoading = null;
      this._geoFailed = false;
      this._upgradeCommon();
      // 若用户正停在 GSO 搜索上，用带经度的源重跑一次
      if (this.data.mode === 'gso' && this.data.results.length) this._search(this.data.keyword);
      return list;
    }).catch(() => {
      this._geoLoading = null;
      this._geoFailed = true; // 下次 _ensureGeo 仍会重试；期间来源标注改为「暂不可用」
      // GEO 根数拿不到：常用星继续按标称轨位算（离线可用），搜索退化到索引
      const t = this._target;
      if (t && t.kind === 'slot') this.setData({ tgt: this._describeTarget(t) });
      return null;
    });
    return this._geoLoading;
  },

  // 常用列表的目标：有编目号且 GEO 根数在手 → 换成 SGP4
  _upgradeCommon() {
    const t = this._target;
    if (!t || t.kind !== 'slot' || !t.noradId || !this._geoById) return;
    const s = this._geoById[String(t.noradId)];
    if (!s) return;
    let rec;
    try { rec = sat.omm2satrec(s); } catch (e) { rec = null; }
    if (!rec || rec.error) return;
    this._applyRec(t, rec, '', this._geoFetchedAt);
  },

  // 给 GEO 卫星标注此刻定点经度并从东经 100° 起往东排一圈（与星间链路同口径）
  _withGeoLon(sats) {
    const T = new Date(), g = sat.gstime(T);
    const out = [];
    for (let i = 0; i < sats.length; i++) {
      const s = sats[i];
      let lon = NaN;
      try {
        const rec = sat.omm2satrec(s);
        if (rec && !rec.error) {
          const pv = sat.propagate(rec, T);
          if (pv && pv.position) lon = sat.eciToGeodetic(pv.position, g).longitude / D2R;
        }
      } catch (e) { /* 坏根数排到末尾 */ }
      out.push({ name: s.name, noradId: s.noradId, group: 'geo', lon: lon, lonText: fmtLonText(lon), _raw: s });
    }
    const key = (lon) => (Number.isFinite(lon) ? ((lon - 100 + 360) % 360) : 1e9);
    out.sort((a, b) => key(a.lon) - key(b.lon));
    return out;
  },

  // 跨分组搜索索引（名称 + 编号 + 所属分组，约 1.3 万条；当天本地缓存）
  _ensureIndex() {
    if (this._index || this._indexLoading) return;
    this._indexLoading = true;
    tleStore.ensureSearchIndex().then((index) => {
      this._indexLoading = false;
      if (!index || !index.length) return; // 空结果不粘住，下次打字重试
      this._index = index;
      this._indexGeo = index.filter((s) => s.group === 'geo');
      this._indexNgso = index.filter((s) => s.group !== 'geo');
      this._indexByGroup = {};
      if ((this.data.keyword || '').trim() || this.data.groupIndex > 0) this._search(this.data.keyword);
    }).catch(() => { this._indexLoading = false; });
  },

  _groupSlice(key) {
    if (!this._indexByGroup[key]) this._indexByGroup[key] = (this._index || []).filter((s) => s.group === key);
    return this._indexByGroup[key];
  },

  // 搜索 / 浏览：GSO 模式在 GEO 组内（有根数则带定点经度，空关键字按经度列全组）；
  // NGSO 模式按分组切片或跨全部在轨（跨全部时空关键字不列——1.3 万条没法翻）
  _search(raw) {
    const kw = String(raw == null ? '' : raw).trim();
    let list = [], title = '';
    if (this.data.mode === 'gso') {
      if (this._geoSats) {
        list = satSearch.filterSats(this._geoSats, kw, 80);
        title = kw ? ('GEO 组 · ' + list.length + ' 颗') : ('GEO 组 · 按定点经度自东经 100° 起 · 前 ' + list.length + ' 颗');
      } else {
        this._ensureGeo();
        this._ensureIndex();
        if (!this._indexGeo) { this.setData({ results: [], resultsTitle: kw ? '星历加载中…' : '' }); return; }
        list = satSearch.filterSats(this._indexGeo, kw, 80);
        title = 'GEO 组 · ' + list.length + ' 颗（定点经度待星历）';
      }
    } else {
      this._ensureIndex();
      const key = (NGSO_GROUPS[this.data.groupIndex] || NGSO_GROUPS[0]).key;
      if (!this._index) { this.setData({ results: [], resultsTitle: (kw || key) ? '索引加载中…' : '' }); return; }
      if (key) {
        list = satSearch.filterSats(this._groupSlice(key), kw, 80);
        title = GROUP_LABEL[key] + ' · ' + (kw ? list.length + ' 颗' : '前 ' + list.length + ' 颗，输入关键字缩小范围');
      } else {
        if (!kw) { this.setData({ results: [], resultsTitle: '' }); return; }
        list = satSearch.searchSats(this._indexNgso, kw, 80);
        title = '全部在轨（不含 GEO）· ' + list.length + ' 颗';
      }
    }
    const results = list.map((s) => ({
      name: s.name, noradId: s.noradId, group: s.group,
      groupLabel: GROUP_LABEL[s.group] || s.group,
      lonText: s.lonText || ''
    }));
    this.setData({ results: results, resultsTitle: title });
  },

  onModeTap(e) {
    const mode = e.currentTarget.dataset.mode === 'ngso' ? 'ngso' : 'gso';
    if (mode === this.data.mode) return;
    this.setData({ mode: mode, keyword: '', results: [], resultsTitle: '' });
    const t = mode === 'gso' ? (this._gsoTarget || this._commonTarget(0)) : this._ngsoTarget;
    if (t) {
      this._setTarget(t, true);
      if (t.kind === 'tle' && !t.rec) this._resolveTle();
    } else {
      this._target = null;
      this._look = null;
      this.setData({ tgt: null, tInfo: null });
    }
    if (mode === 'gso') this._ensureGeo(); else this._ensureIndex();
    this._saveSelection();
  },

  // 常用卫星 picker
  onSatelliteChange(e) {
    const index = parseInt(e.detail.value);
    if (!COMMON_GSO[index]) return;
    this.setData({ satelliteIndex: index, keyword: '', results: [], resultsTitle: '' });
    this._setTarget(this._commonTarget(index));
    this._ensureGeo();
  },

  onGroupChange(e) {
    const gi = parseInt(e.detail.value) || 0;
    this.setData({ groupIndex: gi, keyword: '' });
    this._search('');
  },

  onSearchInput(e) {
    const v = e.detail.value || '';
    this.setData({ keyword: v });
    this._search(v);
  },
  onSearchFocus() {
    if (!(this.data.keyword || '').trim()) this._search('');
  },
  clearSearch() {
    this.setData({ keyword: '', results: [], resultsTitle: '' });
  },
  closeResults() {
    this.setData({ results: [], resultsTitle: '' });
  },

  // 选中一条搜索结果 → 按所属分组取根数
  onPickResult(e) {
    const ds = e.currentTarget.dataset;
    const norad = String(ds.norad), group = String(ds.group || ''), name = String(ds.name || '');
    if (!norad || !group) return;
    this.setData({ results: [], resultsTitle: '', keyword: '' });
    const t = { kind: 'tle', name: name, noradId: norad, group: group, source: 'search' };
    // GSO 模式下常用列表里有这颗星 → 顺手把 picker 对到它，并带上标称轨位供对照
    if (group === 'geo') {
      const li = COMMON_GSO.findIndex((s) => s.noradId && s.noradId === norad);
      if (li >= 0) { t.slotLon = parseFloat(COMMON_GSO[li].position); t.listIndex = li; this.setData({ satelliteIndex: li }); }
    }
    this._setTarget(t);
    // GEO 根数已在手 → 直接解析，不再走一次取数
    if (group === 'geo' && this._geoById && this._geoById[norad]) {
      let rec;
      try { rec = sat.omm2satrec(this._geoById[norad]); } catch (err) { rec = null; }
      if (rec && !rec.error) { this._applyRec(t, rec, this._geoById[norad].name, this._geoFetchedAt); return; }
    }
    this._resolveTle();
    if (group === 'other') wx.showToast({ title: '「其他」分组首次需下载约 5MB 星历', icon: 'none' });
    wx.vibrateShort({ type: 'light' });
  },

  _saveSelection() {
    const g = this._gsoTarget, n = this._ngsoTarget;
    const rec = {
      mode: this.data.mode,
      gso: g ? { name: g.name, noradId: g.noradId || '', slotLon: g.slotLon } : null,
      ngso: n ? { name: n.name, noradId: n.noradId, group: n.group } : null
    };
    try { wx.setStorageSync(SEL_STORAGE_KEY, rec); } catch (e) { /* 忽略存储失败 */ }
  },

  // ---- 定位（WGS-84：轨道几何用的就是这个基准；GCJ-02 偏几百米对角度无感，但没必要带偏）----
  // interactive=false：进页静默取一次（系统授权框照常弹）；true：用户主动点了重试/开始对星，曾拒绝则引导去设置
  _locate(interactive) {
    return new Promise((resolve, reject) => {
      const doGet = () => {
        wx.getLocation({
          type: 'wgs84',
          success: (res) => {
            const h = (Number.isFinite(res.altitude) && Math.abs(res.altitude) < 9000) ? res.altitude / 1000 : 0;
            this._obs = arOrbit.observer(res.latitude, res.longitude, h);
            this.setData({
              userLatitude: res.latitude,
              userLongitude: res.longitude,
              locText: Math.abs(res.latitude).toFixed(4) + '°' + (res.latitude >= 0 ? 'N' : 'S') + ', ' +
                Math.abs(res.longitude).toFixed(4) + '°' + (res.longitude >= 0 ? 'E' : 'W'),
              locOk: true
            });
            this._pass = null;
            this._refreshTargetInfo(true);
            resolve(res);
          },
          fail: (err) => {
            console.error('获取位置失败:', err);
            this.setData({ locText: '定位失败，点此重试', locOk: false });
            reject(new Error('无法获取位置信息，请检查定位权限'));
          }
        });
      };
      if (!interactive || typeof wx.getSetting !== 'function') { doGet(); return; }
      wx.getSetting({
        success: (s) => {
          if (s.authSetting && s.authSetting['scope.userLocation'] === false) {
            wx.showModal({
              title: '需要定位权限',
              content: '计算卫星方位需要你的位置，请在设置中开启定位权限',
              confirmText: '去设置',
              success: (r) => {
                if (!r.confirm) { reject(new Error('未授权定位')); return; }
                wx.openSetting({
                  success: (o) => { if (o.authSetting && o.authSetting['scope.userLocation']) doGet(); else reject(new Error('未授权定位')); },
                  fail: () => reject(new Error('未授权定位'))
                });
              }
            });
          } else doGet();
        },
        fail: doGet
      });
    });
  },

  retryLocate() {
    if (this.data.locOk) return;
    this.setData({ locText: '定位中…' });
    this._locate(true).catch((e) => wx.showToast({ title: e.message || '定位失败', icon: 'none' }));
  },

  // ---- 目标观测信息：选择页 1 Hz 刷卡片，AR 阶段 4 Hz 刷目标角（NGSO 动目标）----
  _startTargetTimer(ms) {
    this._stopTargetTimer();
    this._tgtTimer = setInterval(() => this._refreshTargetInfo(false), ms);
  },
  _stopTargetTimer() {
    if (this._tgtTimer) { clearInterval(this._tgtTimer); this._tgtTimer = null; }
  },

  _refreshTargetInfo(force) {
    const t = this._target;
    if (!t) return;
    if (!this._obs) {
      if (force) this.setData({ tInfo: { pending: true } });
      return;
    }
    const now = new Date();
    let look = null;
    if (t.rec) look = arOrbit.lookAt(t.rec, this._obs, now);
    else if (Number.isFinite(t.slotLon)) look = arOrbit.slotLook(this._obs, t.slotLon);
    if (!look) {
      this._look = null;
      if (force) this.setData({ tInfo: { err: t.rec ? '根数异常，无法推算位置' : '星历尚未就绪' } });
      return;
    }
    this._look = look;
    // AR 渲染路径直接读 this.data.azimuth / elevation（字符串口径沿用）
    this.data.azimuth = look.az.toFixed(1);
    this.data.elevation = look.el.toFixed(1);
    const vis = look.el >= 0;
    const isGeo = t.rec ? t.isGeo : true;

    // 过境预报（仅非同步轨道；缓存到本段落下/下段升起为止）
    let passText = '', arPass = '';
    if (t.rec && !isGeo) {
      this._ensurePass(t, now);
      const p = this._pass && this._pass.key === t.seq ? this._pass.result : undefined;
      if (p === null) {
        passText = '24 小时内不过境本站';
      } else if (p) {
        const maxEl = '最高仰角 ' + p.maxEl.toFixed(0) + '°';
        if (p.inProgress) {
          passText = '可见中 · ' + (p.los ? fmtClock(p.los, now) + ' 落下 · ' : '') + maxEl;
          arPass = p.los ? ('可见剩余 ' + fmtDur((+p.los - +now) / 1000)) : '可见中';
        } else {
          passText = '下次过境 ' + fmtClock(p.aos, now) + (p.los ? '–' + fmtClock(p.los, now) : '') + ' · ' + maxEl;
          arPass = '下次 ' + fmtClock(p.aos, now) + ' 起 · ' + maxEl;
        }
      } else if (this._passBusy) {
        passText = '过境预报计算中…';
      }
    } else {
      passText = vis ? '同步轨道 · 本站长期可见' : '同步轨道 · 本站看不到（在地平线下）';
    }

    const cls = t.rec ? t.cls : 'GEO';
    const sync = cls === 'GEO' || cls === 'IGSO';
    const subLon = sync ? (' ' + fmtLonText(look.lon)) : (' 高度 ' + fmtInt(look.alt) + ' km');
    const visText = vis ? '可见' : '地平线下';
    // 卡片「在哪」一行：同步轨道给实测轨位（对照标称），其余给星下点与高度
    const where = !t.rec ? ''
      : (sync ? ('星历实测轨位 ' + fmtLonText(look.lon) + (Math.abs(look.lat) >= 0.5 ? ('，纬度 ' + look.lat.toFixed(1) + '°') : ''))
        : ('星下点 ' + Math.abs(look.lat).toFixed(1) + '°' + (look.lat >= 0 ? 'N' : 'S') + ' ' + fmtLonText(look.lon) + ' · 高度 ' + fmtInt(look.alt) + ' km'));
    const tInfo = {
      az: look.az.toFixed(1),
      el: look.el.toFixed(1),
      range: fmtInt(look.range),
      alt: fmtInt(look.alt),
      lonText: fmtLonText(look.lon),
      where: where,
      vis: vis,
      visText: visText,
      pass: passText
    };
    const targetLine = cls + subLon + ' · 距离 ' + fmtInt(look.range) + ' km · ' + (arPass || visText);
    if (this.data.stage === 'ar') {
      this.setData({ azimuth: this.data.azimuth, elevation: this.data.elevation, targetLine: targetLine, belowHorizon: !vis, tInfo: tInfo });
    } else {
      this.setData({ tInfo: tInfo, azimuth: this.data.azimuth, elevation: this.data.elevation, targetLine: targetLine, belowHorizon: !vis });
    }
  },

  // 过境预报：LEO 全天粗扫约 3000 次 SGP4（几十 ms），放到下一拍算，不卡当前 setData
  _ensurePass(t, now) {
    const cur = this._pass;
    if (cur && cur.key === t.seq) {
      const p = cur.result;
      const stale = p === null ? (+now - cur.at > 600e3)
        : (p.los ? +now > +p.los + 1000 : +now - cur.at > 600e3);
      if (!stale) return;
    }
    if (this._passBusy) return;
    this._passBusy = true;
    const seq = t.seq, obs = this._obs;
    setTimeout(() => {
      let result = null;
      try { result = arOrbit.nextPass(t.rec, obs, new Date()); } catch (e) { result = null; }
      this._passBusy = false;
      if (!this._target || this._target.seq !== seq) return;
      this._pass = { key: seq, result: result, at: Date.now() };
      this._refreshTargetInfo(true);
    }, 0);
  },

  // 开始AR对星
  async startAR() {
    const t = this._target;
    if (!t) {
      wx.showToast({ title: '请先选择卫星', icon: 'none' });
      return;
    }
    this.setData({ loading: true, loadingText: this._obs ? '准备中…' : '正在获取定位...' });
    try {
      // 1. 位置（进页时已静默取过；失败/未授权则在这里交互式再取）
      if (!this._obs) await this._locate(true);
      // 2. 星历（搜索来的星可能还在取数）
      if (t.kind === 'tle' && !t.rec) {
        this.setData({ loadingText: '正在获取星历...' });
        const ok = await this._resolveTle();
        if (!ok && !Number.isFinite(t.slotLon)) throw new Error('星历获取失败，无法计算目标位置');
      }
      // 3. 计算目标方位角和仰角
      this._refreshTargetInfo(true);
      if (!this._look) throw new Error('无法计算目标位置');
      // 4. 请求相机权限
      await this.requestCameraPermission();
      // 5. 启动传感器
      this.startSensors();
      // 6. 切换到AR阶段
      this.setData({
        stage: 'ar',
        loading: false,
        showTip: true,
        satelliteVisible: true,
        results: [],
        resultsTitle: ''
      });
      this._startTargetTimer(TICK_AR_MS);
      this.updateSatellitePosition();
      // 7. 3秒后隐藏提示
      setTimeout(() => {
        this.setData({ showTip: false });
      }, 3000);
    } catch (error) {
      console.error('启动AR失败:', error);
      this.setData({ loading: false });
      wx.showToast({
        title: error.message || '启动失败',
        icon: 'none'
      });
    }
  },

  // 请求相机权限
  requestCameraPermission() {
    return new Promise((resolve, reject) => {
      wx.authorize({
        scope: 'scope.camera',
        success: () => {
          resolve();
        },
        fail: () => {
          // 如果拒绝，引导用户打开设置
          wx.showModal({
            title: '需要相机权限',
            content: '请在设置中开启相机权限',
            confirmText: '去设置',
            success: (res) => {
              if (res.confirm) {
                wx.openSetting({
                  success: (settingRes) => {
                    if (settingRes.authSetting['scope.camera']) {
                      resolve();
                    } else {
                      reject(new Error('未授权相机权限'));
                    }
                  }
                });
              } else {
                reject(new Error('未授权相机权限'));
              }
            }
          });
        }
      });
    });
  },

  // 启动传感器监听
  startSensors() {
    console.log('开始启动传感器...');

    // 先停止可能存在的旧监听
    this.stopSensors();

    if (this._androidState && this._androidState.enabled) {
      this._androidState.calibrating = true;
      this._androidState.calibrationStartTs = Date.now();
      this._androidState.lastRenderTs = 0;
      this._androidState.elevationSamples = [];
      this._androidState.headingDiffSamples = [];
      this._androidState.pitchSamples = [];
      this._androidState.rollSamples = [];
      this._androidState.headingWindow = [];
      this._androidState.elevationWindow = [];
      this._androidState.azimuthOffset = 0;
      this._androidState.elevationOffset = 0;
      this._androidState.pitchZero = 0;
      this._androidState.rollZero = 0;
      this._androidState.headingJitter = 0;
      this._androidState.smoothedAzimuth = null;
      this._androidState.smoothedElevation = null;
    }

    // iOS 锚定 / 鸿蒙口径检测 / 输出平滑 的运行状态每次进入 AR 重置
    this._resetPathStates();

    // 监听设备方向变化
    wx.onDeviceMotionChange((res) => {
      if (this._androidState && this._androidState.enabled) {
        // Android: 直接使用原始传感器值，不做预平滑
        // AR需要零延迟跟踪，预平滑会让图标跟着镜头漂移
        this.data.deviceAlpha = res.alpha || 0;
        this.data.deviceBeta = res.beta || 0;
        this.data.deviceGamma = res.gamma || 0;
        this.collectAndroidCalibrationSamples();
        this._debugTick(Date.now());
      } else if (this._ohosState && this._ohosState.enabled) {
        // 鸿蒙：口径自适应后复用安卓解算路径（见 _onOhosMotion），自行触发渲染
        this._onOhosMotion(res);
        return;
      } else {
        // iOS：矩阵解算 + 罗盘锚定（见 _onIosMotion），自行触发渲染；旧口径变量仍照常维护供回退
        this._onIosMotion(res);
        return;
      }

      // 实时更新卫星位置
      this.updateSatellitePosition();
    });

    // 罗盘监听：iOS 用作方位零点锚定源（未锚定前直接作方位角），Android/鸿蒙用于口径自检与交叉验证
    const isAndroid = this._androidState && this._androidState.enabled;
    const isOhos = this._ohosState && this._ohosState.enabled;
    wx.onCompassChange((res) => {
      let direction = res.direction || 0;
      direction = this.normalizeAngle(direction);
      this.data.compassDirection = direction;
      this._compassAccuracy = res.accuracy;
      this._compassTs = Date.now();

      // 安卓/鸿蒙由 DeviceMotion 触发渲染
      if (isAndroid || isOhos) {
        return;
      }
      this._iosCompassUpdate(direction, res.accuracy);
      this.updateSatellitePosition();
    });

    // 启动设备方向监听 - 使用最快的更新频率
    wx.startDeviceMotionListening({
      interval: 'ui',
      success: () => {
        console.log('✓ 设备方向传感器启动成功');
      },
      fail: (err) => {
        console.error('✗ 启动设备方向传感器失败:', err);
        wx.showModal({
          title: '传感器启动失败',
          content: '设备方向传感器无法启动，AR功能可能无法正常使用。请确保您的设备支持陀螺仪。',
          showCancel: false
        });
      }
    });

    // 双平台启动罗盘：iOS用作主航向，Android用于交叉校验
    wx.startCompass({
      success: () => {
        console.log('✓ 罗盘启动成功' + (isAndroid ? '（Android用于交叉验证）' : ''));
      },
      fail: (err) => {
        console.error('✗ 启动罗盘失败:', err);
        if (!isAndroid) {
          wx.showModal({
            title: '罗盘启动失败',
            content: '罗盘传感器无法启动，AR功能可能无法正常使用。请确保您的设备支持磁力计（罗盘）并已授权相关权限。',
            showCancel: false
          });
        }
      }
    });
    if (isAndroid) {
      console.log('✓ Android平台：旋转矩阵解算方位 + 罗盘交叉验证');
    }

    // 延迟检查传感器是否正常工作
    setTimeout(() => {
      const { deviceBeta } = this.data;
      if (deviceBeta === 0 && (!isAndroid && this.data.compassDirection === 0)) {
        console.warn('⚠ 传感器可能未正常工作');
      } else {
        console.log('✓ 传感器数据正常接收中');
      }
    }, 800);
  },

  // Android专用：收集启动阶段样本并自动校准
  collectAndroidCalibrationSamples() {
    const state = this._androidState;
    if (!state || !state.enabled || !state.calibrating) {
      return;
    }

    const now = Date.now();
    const elapsed = now - state.calibrationStartTs;
    const { deviceAlpha, deviceBeta, deviceGamma, compassDirection } = this.data;
    const levelAngles = this.calculateLevelAngles(deviceBeta || 0, deviceGamma || 0);

    const elevationRaw = this.calculateDeviceElevation(deviceBeta || 0, deviceGamma || 0);
    if (Number.isFinite(elevationRaw)) {
      state.elevationSamples.push(elevationRaw);
    }

    if (Number.isFinite(levelAngles.pitch)) {
      state.pitchSamples.push(levelAngles.pitch);
    }

    if (Number.isFinite(levelAngles.roll)) {
      state.rollSamples.push(levelAngles.roll);
    }

    if (Number.isFinite(deviceAlpha) && Number.isFinite(compassDirection)) {
      const alpha = this.normalizeAngle(deviceAlpha || 0);
      const compass = this.normalizeAngle(compassDirection || 0);
      const diff = this.angleDifference(compass, alpha);
      state.headingDiffSamples.push(diff);
    }

    if (elapsed < 1200 && state.elevationSamples.length < 24) {
      return;
    }

    // 安卓机型差异较大，自动方向偏置容易引入大误差，保守策略不自动改方位零点
    state.elevationOffset = 0;
    state.azimuthOffset = 0;
    state.pitchZero = 0;
    state.rollZero = 0;
    state.calibrating = false;

    console.log('Android校准完成:', {
      elevationOffset: state.elevationOffset.toFixed(2),
      azimuthOffset: state.azimuthOffset.toFixed(2),
      pitchZero: state.pitchZero.toFixed(2),
      rollZero: state.rollZero.toFixed(2),
      samples: {
        elevation: state.elevationSamples.length,
        heading: state.headingDiffSamples.length,
        pitch: state.pitchSamples.length,
        roll: state.rollSamples.length
      }
    });
  },

  computeMedian(values) {
    if (!values || !values.length) {
      return 0;
    }
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  },

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },

  pushLimited(list, value, limit) {
    list.push(value);
    if (list.length > limit) {
      list.shift();
    }
  },

  computeCircularMean(values) {
    if (!values || !values.length) {
      return 0;
    }
    let sinSum = 0;
    let cosSum = 0;
    for (let i = 0; i < values.length; i++) {
      const rad = values[i] * Math.PI / 180;
      sinSum += Math.sin(rad);
      cosSum += Math.cos(rad);
    }
    const meanRad = Math.atan2(sinSum / values.length, cosSum / values.length);
    return this.normalizeAngle(meanRad * 180 / Math.PI);
  },

  // 水平仪式姿态：拆分俯仰/横滚并做安全夹角
  calculateLevelAngles(beta, gamma) {
    let pitch = beta;
    while (pitch > 180) pitch -= 360;
    while (pitch < -180) pitch += 360;
    pitch = this.clamp(pitch, -90, 90);

    let roll = gamma;
    while (roll > 180) roll -= 360;
    while (roll < -180) roll += 360;
    roll = this.clamp(roll, -90, 90);

    return { pitch, roll };
  },

  // 停止传感器监听
  stopSensors() {
    console.log('停止传感器监听...');
    try {
      wx.stopDeviceMotionListening({
        success: () => {
          console.log('✓ 设备方向监听已停止');
        }
      });
    } catch (e) {
      console.log('停止设备方向监听异常:', e);
    }

    try {
      wx.stopCompass({
        success: () => {
          console.log('✓ 罗盘监听已停止');
        }
      });
    } catch (e) {
      console.log('停止罗盘监听异常:', e);
    }

    // 移除事件监听
    wx.offDeviceMotionChange();
    wx.offCompassChange();
  },

  // 传感器数据平滑处理 - 优化为加权平均，提高跟手性
  smoothSensorData(newData) {
    const { sensorHistory, historySize } = this.data;

    // 添加新数据到历史记录
    sensorHistory.push(newData);

    // 保持历史记录大小
    if (sensorHistory.length > historySize) {
      sensorHistory.shift();
    }

    // 使用加权平均：最新数据权重更大
    // 权重: 最新=0.7, 次新=0.3 (当historySize=2时)
    // 这样可以在保持一定平滑度的同时提高响应速度
    if (sensorHistory.length === 1) {
      return newData;
    }

    const weights = sensorHistory.length === 2 ? [0.3, 0.7] : [0.2, 0.3, 0.5];
    let totalWeight = 0;
    const weighted = sensorHistory.reduce((acc, data, index) => {
      const weight = weights[index] || (1 / sensorHistory.length);
      totalWeight += weight;
      return {
        alpha: acc.alpha + data.alpha * weight,
        beta: acc.beta + data.beta * weight,
        gamma: acc.gamma + data.gamma * weight
      };
    }, { alpha: 0, beta: 0, gamma: 0 });

    return {
      alpha: weighted.alpha / totalWeight,
      beta: weighted.beta / totalWeight,
      gamma: weighted.gamma / totalWeight
    };
  },

  // 角度归一化到0-360范围
  normalizeAngle(angle) {
    let normalized = angle % 360;
    if (normalized < 0) {
      normalized += 360;
    }
    return normalized;
  },

  // 计算两个角度之间的最小差值（考虑360度循环）
  angleDifference(angle1, angle2) {
    let diff = angle1 - angle2;
    // 处理跨越0/360度边界的情况
    if (diff > 180) {
      diff -= 360;
    } else if (diff < -180) {
      diff += 360;
    }
    return diff;
  },

  // 计算设备指向的俯仰角（考虑三维旋转）
  // beta: 前后倾斜角 (-180 到 180)
  // gamma: 左右倾斜角 (-90 到 90)
  // 返回: 俯仰角 (-90 到 90)，正值表示向上，负值表示向下
  calculateDeviceElevation(beta, gamma) {
    // 标准化beta到-180到180范围
    while (beta > 180) beta -= 360;
    while (beta < -180) beta += 360;

    // 转换为弧度
    const betaRad = beta * Math.PI / 180;
    const gammaRad = gamma * Math.PI / 180;

    // 计算设备背面（相机方向）的指向向量
    // 设备坐标系：X轴向右，Y轴向前（屏幕顶部方向），Z轴向上（屏幕法线）
    // 相机朝向是-Z方向（屏幕背面）

    // 初始相机方向向量（设备平放时）: [0, 0, -1]
    // 应用旋转变换

    // 先应用gamma旋转（绕Y轴，左右倾斜）
    // 再应用beta旋转（绕X轴，前后倾斜）

    // 旋转后的向量 Z 分量
    // 使用旋转矩阵计算：R = Rx(beta) * Ry(gamma)
    const cosB = Math.cos(betaRad);
    const sinB = Math.sin(betaRad);
    const cosG = Math.cos(gammaRad);
    const sinG = Math.sin(gammaRad);

    // 相机初始方向 [0, 0, -1] 经过旋转后的向量
    // x = sinG * sinB
    // y = -sinB * cosG
    // z = -cosB * cosG

    const z = -cosB * cosG;

    // 计算俯仰角：向量与水平面的夹角
    // elevation = arcsin(z)
    let elevation = Math.asin(Math.max(-1, Math.min(1, z))) * 180 / Math.PI;

    // 确保在-90到90范围内
    elevation = Math.max(-90, Math.min(90, elevation));

    return elevation;
  },

  // 从DeviceMotion的alpha/beta/gamma解算相机指向的罗盘方位角
  // 原理：构建完整的ZXY旋转矩阵，将相机方向向量[0,0,-1]投影到地球坐标系的水平面
  // 这与安卓SensorManager.getOrientation()的方法一致
  computeHeadingFromMotion(alpha, beta, gamma) {
    const alphaRad = (alpha || 0) * Math.PI / 180;
    const betaRad = (beta || 0) * Math.PI / 180;
    const gammaRad = (gamma || 0) * Math.PI / 180;

    const cA = Math.cos(alphaRad);
    const sA = Math.sin(alphaRad);
    const sB = Math.sin(betaRad);
    const cG = Math.cos(gammaRad);
    const sG = Math.sin(gammaRad);

    // R = Rz(alpha) * Rx(beta) * Ry(gamma)  (W3C DeviceOrientation标准)
    // 相机方向 [0,0,-1] 在地球坐标系中的投影：
    // east  = -R[0][2] = -(cA*sG + sA*sB*cG)
    // north = -R[1][2] = -(sA*sG - cA*sB*cG)
    const east  = -(cA * sG + sA * sB * cG);
    const north = -(sA * sG - cA * sB * cG);

    // 方位角 = atan2(东向分量, 北向分量)，顺时针为正
    let heading = Math.atan2(east, north) * 180 / Math.PI;
    if (heading < 0) heading += 360;

    return heading;
  },

  // 更新卫星图标位置 - 优化版（高性能、高跟手性）
  updateSatellitePosition() {
    if ((this._androidState && this._androidState.enabled) || (this._ohosState && this._ohosState.enabled)) {
      return this.updateSatellitePositionAndroid();
    }

    return this.updateSatellitePositionIOS();
  },

  // iOS路径：保留现有实现
  updateSatellitePositionIOS() {
    // 渲染节流（16ms ≈ 60fps）：DeviceMotion 与罗盘两路回调都会触发，防止 setData 过频
    const iosState = this._iosState;
    if (iosState) {
      const nowTs = Date.now();
      if (nowTs - (iosState.lastRenderTs || 0) < 16) {
        return;
      }
      iosState.lastRenderTs = nowTs;
    }

    // 直接从 this.data 读取最新数据，避免解构的性能开销
    const compassDirection = this.data.compassDirection;
    const deviceBeta = this.data.deviceBeta;
    const deviceGamma = this.data.deviceGamma;
    const azimuth = this.data.azimuth;
    const elevation = this.data.elevation;
    const screenWidth = this.data.screenWidth;
    const screenHeight = this.data.screenHeight;

    // 快速验证：如果关键数据无效则直接返回
    if ((azimuth === '' || azimuth === null || azimuth === undefined) ||
        (elevation === '' || elevation === null || elevation === undefined) ||
        compassDirection === null || deviceBeta === null) {
      return;
    }

    // 计算视场角 (典型手机相机视场角)
    const fovH = 68; // 水平视场角
    const fovV = 51; // 垂直视场角

    // 当前俯仰角 / 方位角
    let currentElevation;
    let currentAzimuth;
    const iosAtt = (IOS_ANCHOR_MODE && iosState) ? iosState.att : null;
    if (iosAtt) {
      // 新口径：矩阵解算的仰角 + 罗盘锚定后的方位（见 _onIosMotion）。
      // δ 未锚定前沿用旧逻辑；锚定时刻 δ = 罗盘 − 相对方位，两者恰好相等，交接不跳变。
      let rawAz = iosState.anchor.heading(iosAtt.yawRel);
      if (rawAz === null) {
        rawAz = this.normalizeAngle(compassDirection);
        if (iosAtt.elevation > 45) {
          rawAz = this.normalizeAngle(rawAz + 180);
        }
      }
      // 输出级轻量自适应平滑（与安卓路径同参数）：大变化直接跟，小抖动轻微平滑
      if (iosState.smoothedAz === null) {
        iosState.smoothedAz = rawAz;
        iosState.smoothedEl = iosAtt.elevation;
      } else {
        const azDelta = this.angleDifference(rawAz, iosState.smoothedAz);
        const azK = Math.abs(azDelta) > 10 ? 1.0 : (Math.abs(azDelta) > 2 ? 0.6 : 0.3);
        iosState.smoothedAz = this.normalizeAngle(iosState.smoothedAz + azDelta * azK);
        const elDelta = iosAtt.elevation - iosState.smoothedEl;
        const elK = Math.abs(elDelta) > 5 ? 1.0 : (Math.abs(elDelta) > 1 ? 0.6 : 0.3);
        iosState.smoothedEl = iosState.smoothedEl + elDelta * elK;
      }
      currentAzimuth = iosState.smoothedAz;
      currentElevation = this.clamp(iosState.smoothedEl, -90, 90);
    } else {
      // 旧逻辑（IOS_ANCHOR_MODE=false 或尚无姿态帧）：罗盘直出 + 仰角>45° 补 180°
      currentElevation = this.calculateDeviceElevation(deviceBeta, deviceGamma);
      currentAzimuth = this.normalizeAngle(compassDirection);
      if (currentElevation > 45) {
        currentAzimuth = this.normalizeAngle(currentAzimuth + 180);
      }
    }
    currentAzimuth = this._applyManualFlip(currentAzimuth);

    const targetAzimuth = this.normalizeAngle(parseFloat(azimuth));
    const targetElevation = parseFloat(elevation);

    // 计算角度差值（目标相对于当前的偏移）
    // 注意：这里是 目标 - 当前，表示目标在当前视角的哪个方向
    const azimuthDiff = this.angleDifference(targetAzimuth, currentAzimuth);
    const elevationDiff = targetElevation - currentElevation;

    // 提前计算偏差距离用于判断
    const offsetDistance = Math.sqrt(
      Math.pow(azimuthDiff, 2) + Math.pow(elevationDiff, 2)
    );

    // 判断是否对准（偏差小于3度）
    const isAligned = offsetDistance < 3.0;

    // 调试输出（可选，低频率）
    if (Math.random() < 0.02) { // 2%概率输出，减少日志开销
      console.log('AR实时更新 - 方位差:', azimuthDiff.toFixed(1), '° 仰角差:', elevationDiff.toFixed(1),
                  '° 偏差:', offsetDistance.toFixed(1), '°');
    }

    // 将角度差转换为屏幕坐标偏移
    //
    // 原理说明：
    // - 相机视场角 fovH/fovV 是从左到右/从上到下的完整角度范围
    // - 屏幕中心对应相机视线的正中央
    // - 从中心到任一边缘对应的角度是 fovH/2 或 fovV/2
    //
    // 坐标转换：
    // - 当 azimuthDiff = fovH/2 时，目标在视野的最右侧边缘，xOffset = screenWidth/2
    // - 当 azimuthDiff = -fovH/2 时，目标在视野的最左侧边缘，xOffset = -screenWidth/2
    // - 因此：xOffset = azimuthDiff / (fovH/2) * (screenWidth/2)
    //
    // azimuthDiff > 0：目标在当前视角的右侧
    // elevationDiff > 0：目标在当前视角的上方（yOffset为负，因为屏幕Y轴向下）
    let xOffset = (azimuthDiff / (fovH/2)) * (screenWidth/2);
    let yOffset = -(elevationDiff / (fovV/2)) * (screenHeight/2);

    // 屏幕中心坐标
    const centerX = screenWidth / 2;
    const centerY = screenHeight / 2;

    // 计算理想卫星位置（未限制）
    let satelliteX = centerX + xOffset;
    let satelliteY = centerY + yOffset;

    // 检查卫星是否在屏幕可见范围内
    const isInView = Math.abs(azimuthDiff) < fovH / 2 &&
                     Math.abs(elevationDiff) < fovV / 2;

    // 如果超出视距，将图标限制在屏幕边缘
    const margin = 10; // 距离边缘的边距（像素）
    let isAtEdge = false;

    if (!isInView) {
      isAtEdge = true;

      // 计算从屏幕中心到卫星位置的向量
      const dx = satelliteX - centerX;
      const dy = satelliteY - centerY;

      // 计算屏幕边界（考虑边距）
      const minX = margin;
      const maxX = screenWidth - margin;
      const minY = margin;
      const maxY = screenHeight - margin;

      // 如果超出边界，将图标投影到屏幕边缘
      if (satelliteX < minX || satelliteX > maxX || satelliteY < minY || satelliteY > maxY) {
        // 计算与各边界的交点
        const angle = Math.atan2(dy, dx);

        // 测试与四个边的交点
        const intersections = [];

        // 左边界
        if (dx < 0) {
          const t = (minX - centerX) / dx;
          const y = centerY + dy * t;
          if (y >= minY && y <= maxY) {
            intersections.push({ x: minX, y: y, dist: Math.abs(t) });
          }
        }

        // 右边界
        if (dx > 0) {
          const t = (maxX - centerX) / dx;
          const y = centerY + dy * t;
          if (y >= minY && y <= maxY) {
            intersections.push({ x: maxX, y: y, dist: Math.abs(t) });
          }
        }

        // 上边界
        if (dy < 0) {
          const t = (minY - centerY) / dy;
          const x = centerX + dx * t;
          if (x >= minX && x <= maxX) {
            intersections.push({ x: x, y: minY, dist: Math.abs(t) });
          }
        }

        // 下边界
        if (dy > 0) {
          const t = (maxY - centerY) / dy;
          const x = centerX + dx * t;
          if (x >= minX && x <= maxX) {
            intersections.push({ x: x, y: maxY, dist: Math.abs(t) });
          }
        }

        // 选择最近的交点
        if (intersections.length > 0) {
          intersections.sort((a, b) => a.dist - b.dist);
          satelliteX = intersections[0].x;
          satelliteY = intersections[0].y;
        }
      }
    }

    // 使用前面计算的 offsetDistance 和 isAligned
    // 批量更新UI，只调用一次setData以提高性能
    this.setData({
      satelliteX: satelliteX,
      satelliteY: satelliteY,
      offsetDistance: offsetDistance.toFixed(1),
      isAligned: isAligned,
      satelliteVisible: true,
      isAtEdge: isAtEdge,
      currentAzimuth: currentAzimuth.toFixed(1),
      currentElevation: currentElevation.toFixed(1)
    });

    // 对准时震动反馈
    if (isAligned && !this.data.lastAlignedState) {
      wx.vibrateShort({
        type: 'medium'
      });
    }

    // 保存上一次对准状态
    this.data.lastAlignedState = isAligned;
  },

  // Android路径：使用正确的3D俯仰公式 + 单层自适应平滑 + 渲染节流
  updateSatellitePositionAndroid() {
    const state = this._androidState;
    if (!state) {
      return;
    }

    // AR模式：尽量降低延迟，让图标锚定在真实世界位置
    // 只做最小的渲染节流防止setData过频（16ms ≈ 60fps）
    const now = Date.now();
    if (now - state.lastRenderTs < 16) {
      return;
    }
    state.lastRenderTs = now;

    const deviceAlpha = this.data.deviceAlpha;
    const deviceBeta = this.data.deviceBeta;
    const deviceGamma = this.data.deviceGamma;
    const azimuth = this.data.azimuth;
    const elevation = this.data.elevation;
    const screenWidth = this.data.screenWidth;
    const screenHeight = this.data.screenHeight;

    if ((azimuth === '' || azimuth === null || azimuth === undefined) ||
        (elevation === '' || elevation === null || elevation === undefined) ||
        deviceAlpha === null || deviceAlpha === undefined || deviceBeta === null) {
      return;
    }

    const fovH = 68;
    const fovV = 51;

    // ==== 微信小程序已知平台差异（微信开放社区多次确认，官方从未修复）：====
    // Android alpha: 磁北顺时针递增（罗盘约定）→ 需转为W3C逆时针数学约定
    // Android beta/gamma: 与iOS/W3C方向相反 → 取反
    //
    // 关键修正：不能直接拿 alpha 当方位角！
    // alpha 是欧拉角绕Z轴的分量，只有手机完全竖直(β=90°,γ=0°)时才等于相机朝向。
    // 手机一倾斜，相机光轴的水平投影就偏离 alpha，误差可达数十度。
    // 正确做法：用完整旋转矩阵 Rz(α)·Rx(β)·Ry(γ) 将相机方向[0,0,-1]
    // 投影到地球坐标系，再用 atan2 求水平方位角。

    // ---- 步骤1：Android传感器值 → W3C标准坐标系 ----
    const alpha_wc = this.normalizeAngle(360 - (deviceAlpha || 0));  // 顺时针→逆时针
    const beta_wc = -(deviceBeta || 0);   // 符号取反
    const gamma_wc = -(deviceGamma || 0); // 符号取反

    // ---- 步骤2：完整旋转矩阵求相机方位角（正确处理所有倾斜姿态）----
    const rawAzimuth = this.computeHeadingFromMotion(alpha_wc, beta_wc, gamma_wc);

    // ---- 步骤3：旋转矩阵Z分量求仰角 ----
    const rawElevation = this.calculateDeviceElevation(beta_wc, gamma_wc);

    // ---- 轻量平滑：AR需要近乎1:1跟踪，只做最轻微的去抖 ----
    // 高alpha = 快速响应，图标锚定在真实世界位置
    if (state.smoothedAzimuth === null) {
      state.smoothedAzimuth = rawAzimuth;
      state.smoothedElevation = rawElevation;
    } else {
      // 方位角：快速跟踪，大变化直接跳，小变化轻微平滑
      const azDelta = this.angleDifference(rawAzimuth, state.smoothedAzimuth);
      const azAlpha = Math.abs(azDelta) > 10 ? 1.0   // 大变化：直接跟踪
                    : Math.abs(azDelta) > 2  ? 0.6   // 中变化：快速跟
                    :                          0.3;   // 小抖动：轻微平滑
      state.smoothedAzimuth = this.normalizeAngle(state.smoothedAzimuth + azDelta * azAlpha);

      // 俯仰角：同样快速跟踪
      const elDelta = rawElevation - state.smoothedElevation;
      const elAlpha = Math.abs(elDelta) > 5  ? 1.0
                    : Math.abs(elDelta) > 1  ? 0.6
                    :                          0.3;
      state.smoothedElevation = state.smoothedElevation + elDelta * elAlpha;
    }

    const currentAzimuth = this._applyManualFlip(state.smoothedAzimuth);
    const currentElevation = this.clamp(state.smoothedElevation, -90, 90);

    // 诊断日志：对比旋转矩阵方位角 vs 罗盘方位角 vs 原始alpha
    if (Math.random() < 0.05) {
      console.log('[Android AR] heading=' + currentAzimuth.toFixed(1) +
        ' el=' + currentElevation.toFixed(1) +
        ' | compass=' + (this.data.compassDirection || 0).toFixed(1) +
        ' alpha=' + (deviceAlpha || 0).toFixed(1) +
        ' β=' + (deviceBeta || 0).toFixed(1) +
        ' γ=' + (deviceGamma || 0).toFixed(1));
    }

    const targetAzimuth = this.normalizeAngle(parseFloat(azimuth));
    const targetElevation = parseFloat(elevation);

    const azimuthDiff = this.angleDifference(targetAzimuth, currentAzimuth);
    const elevationDiff = targetElevation - currentElevation;

    const offsetDistance = Math.sqrt(
      Math.pow(azimuthDiff, 2) + Math.pow(elevationDiff, 2)
    );
    const isAligned = offsetDistance < 3.5;

    let xOffset = (azimuthDiff / (fovH / 2)) * (screenWidth / 2);
    let yOffset = -(elevationDiff / (fovV / 2)) * (screenHeight / 2);

    const centerX = screenWidth / 2;
    const centerY = screenHeight / 2;

    let satelliteX = centerX + xOffset;
    let satelliteY = centerY + yOffset;

    const isInView = Math.abs(azimuthDiff) < fovH / 2 &&
                     Math.abs(elevationDiff) < fovV / 2;

    const margin = 10;
    let isAtEdge = false;

    if (!isInView) {
      isAtEdge = true;

      const dx = satelliteX - centerX;
      const dy = satelliteY - centerY;

      const minX = margin;
      const maxX = screenWidth - margin;
      const minY = margin;
      const maxY = screenHeight - margin;

      if (satelliteX < minX || satelliteX > maxX || satelliteY < minY || satelliteY > maxY) {
        const intersections = [];

        if (dx < 0) {
          const t = (minX - centerX) / dx;
          const y = centerY + dy * t;
          if (y >= minY && y <= maxY) {
            intersections.push({ x: minX, y: y, dist: Math.abs(t) });
          }
        }

        if (dx > 0) {
          const t = (maxX - centerX) / dx;
          const y = centerY + dy * t;
          if (y >= minY && y <= maxY) {
            intersections.push({ x: maxX, y: y, dist: Math.abs(t) });
          }
        }

        if (dy < 0) {
          const t = (minY - centerY) / dy;
          const x = centerX + dx * t;
          if (x >= minX && x <= maxX) {
            intersections.push({ x: x, y: minY, dist: Math.abs(t) });
          }
        }

        if (dy > 0) {
          const t = (maxY - centerY) / dy;
          const x = centerX + dx * t;
          if (x >= minX && x <= maxX) {
            intersections.push({ x: x, y: maxY, dist: Math.abs(t) });
          }
        }

        if (intersections.length > 0) {
          intersections.sort((a, b) => a.dist - b.dist);
          satelliteX = intersections[0].x;
          satelliteY = intersections[0].y;
        }
      }
    }

    this.setData({
      satelliteX: satelliteX,
      satelliteY: satelliteY,
      offsetDistance: offsetDistance.toFixed(1),
      isAligned: isAligned,
      satelliteVisible: true,
      isAtEdge: isAtEdge,
      currentAzimuth: currentAzimuth.toFixed(1),
      currentElevation: currentElevation.toFixed(1)
    });

    if (isAligned && !this.data.lastAlignedState) {
      wx.vibrateShort({
        type: 'medium'
      });
    }

    this.data.lastAlignedState = isAligned;
  },

  // ================= 平台路径状态（iOS 锚定 / 鸿蒙口径自适应）=================

  // 每次进入 AR 时重置各路径的运行状态（口径检测器、零点锚定、输出平滑）
  _resetPathStates() {
    const ios = this._iosState || (this._iosState = { enabled: true });
    ios.att = null;               // 最近一帧姿态：{ yawRel, elevation, tilt, roll, ts }
    ios.raw = null;
    ios.smoothedAz = null;
    ios.smoothedEl = null;
    ios.lastRenderTs = 0;
    ios.profile = { alphaCW: false, betaSign: 1, gammaSign: 1, yProjPatch: false }; // 微信 iOS 文档口径（W3C）
    ios.anchor = arAtt.createHeadingAnchor();
    ios.alphaSense = arAtt.createAlphaSenseDetector();

    const ohos = this._ohosState || (this._ohosState = { enabled: false });
    ohos.raw = null;
    ohos.betaSign = arAtt.createBetaSignDetector();
    ohos.crossing = arAtt.createHorizonCrossingDetector();
    ohos.alphaSense = arAtt.createAlphaSenseDetector();
    ohos.applied = { alphaCW: true, betaSign: 'android', patch: true, crossing: null }; // 当前生效口径（诊断面板显示）
    if (ohos.enabled && this._androidState) {
      this._androidState.lastRenderTs = 0;
      this._androidState.smoothedAzimuth = null;
      this._androidState.smoothedElevation = null;
    }

    this._compassAccuracy = undefined;
    this._compassTs = 0;
    this._debugTs = 0;
  },

  // ---------- iOS：矩阵解算 + 罗盘锚定 ----------
  // 微信 iOS 的 alpha 以开始监听时的朝向为 0°（非磁北），单靠姿态得不到绝对方位；
  // 苹果罗盘竖直持机时报后摄朝向、机顶后仰超过约 45° 才切轴反 180°（改动前 45° 补丁的由来）。
  // 因此：姿态矩阵给出连续的相对方位 yawRel，罗盘只在可信带内（tilt≤33°、横滚小）估计零点 δ，
  // 输出 = yawRel + δ，任意仰角连续，不再有 45° 处的跳变；δ 未锚定前沿用改动前的旧逻辑。
  _onIosMotion(res) {
    const st = this._iosState;
    const now = Date.now();
    const raw = { alpha: res.alpha || 0, beta: res.beta || 0, gamma: res.gamma || 0 };
    st.raw = raw;
    st.rawTs = now;

    // 旧口径变量照常维护（IOS_ANCHOR_MODE=false 的回退路径与诊断面板使用）
    const smoothedData = this.smoothSensorData({ alpha: raw.alpha, beta: raw.beta, gamma: raw.gamma });
    this.data.deviceAlpha = smoothedData.alpha;
    this.data.deviceBeta = smoothedData.beta;
    this.data.deviceGamma = smoothedData.gamma;

    if (IOS_ANCHOR_MODE) {
      const cosBeta = Math.cos(raw.beta * D2R);
      // alpha 转向自检：与罗盘同向转 → 顺时针口径；默认 W3C 逆时针
      const sense = st.alphaSense.feed(now, raw.alpha, cosBeta, this.data.compassDirection);
      if (sense && st.profile.alphaCW !== (sense === 'cw')) {
        // 转向口径改变意味着相对方位的意义变了，已锚定的 δ 作废：回退旧逻辑直到重新进入可信带锚定
        st.profile.alphaCW = (sense === 'cw');
        st.anchor.reset();
      }
      const cam = arAtt.solveCamera(raw, st.profile);
      st.att = { yawRel: cam.azimuth, elevation: cam.elevation, tilt: cam.tilt, roll: cam.rollMetric, ts: now };
    }

    this.updateSatellitePosition();
    this._debugTick(now);
  },

  _iosCompassUpdate(direction, accuracy) {
    const st = this._iosState;
    if (!IOS_ANCHOR_MODE || !st || !st.att) return;
    // iOS 的 accuracy 是数值，负值表示读数无效
    if (typeof accuracy === 'number' && accuracy < 0) return;
    st.anchor.update(direction, st.att.yawRel, st.att.tilt, st.att.roll);
  },

  // ---------- 鸿蒙：口径自适应后复用安卓解算路径 ----------
  // 鸿蒙 NEXT 的 platform 为 'ohos'，微信在鸿蒙上的传感器口径无文档、无真机可测，这里按三种可能口径自适应：
  //   P1 getOrientation 口径（azimuth 顺时针、pitch 有界 ±90、roll ±180）→ 与安卓路径完全一致，补丁不会触发；
  //   P2 连续 ZXY 口径（alpha 连续）→ 过地平线检测判为「连续」后关闭补丁；
  //   P3 传统方向传感器口径（azimuth = 机顶投影，相机越过地平线即反 180°，最可能）→ 默认开补丁：cosβ<0 时 alpha 加 180。
  // beta 符号由「AR 持机时机顶朝上」表决；alpha 转向由与罗盘的转动方向比对；
  // gamma 符号沿用安卓路径假设（只影响横滚时的精度）。
  _onOhosMotion(res) {
    const st = this._ohosState;
    const now = Date.now();
    const raw = { alpha: res.alpha || 0, beta: res.beta || 0, gamma: res.gamma || 0 };
    st.raw = raw;
    st.rawTs = now;

    const cosBeta = Math.cos(raw.beta * D2R);
    const betaSign = st.betaSign.feed(raw.beta) || 'android';
    const crossing = st.crossing.feed(now, raw.alpha, cosBeta);
    const sense = st.alphaSense.feed(now, raw.alpha, cosBeta, this.data.compassDirection) || 'cw';
    const patch = crossing !== 'continuous';
    st.applied = { alphaCW: sense === 'cw', betaSign: betaSign, patch: patch, crossing: crossing };

    // 换成安卓路径期望的口径：alpha 顺时针、beta 机顶压低为正、gamma 沿用安卓假设
    let alphaCW = sense === 'cw' ? raw.alpha : (360 - raw.alpha);
    if (patch && cosBeta < -0.02) alphaCW += 180; // 机顶投影在相机抬过地平线后反 180°，补回
    this.data.deviceAlpha = this.normalizeAngle(alphaCW);
    this.data.deviceBeta = betaSign === 'w3c' ? -raw.beta : raw.beta;
    this.data.deviceGamma = raw.gamma;

    this.updateSatellitePositionAndroid();
    this._debugTick(now);
  },

  // ---------- 保底：手动 180° 翻转 ----------
  _applyManualFlip(azimuth) {
    return this._manualFlip ? this.normalizeAngle(azimuth + 180) : azimuth;
  },

  toggleManualFlip() {
    this._manualFlip = !this._manualFlip;
    try { wx.setStorageSync(FLIP_STORAGE_KEY, this._manualFlip); } catch (e) { /* 忽略存储失败 */ }
    this.setData({ manualFlip: this._manualFlip });
    wx.showToast({ title: this._manualFlip ? '已翻转 180°' : '已还原', icon: 'none' });
  },

  // ---------- 诊断面板与录制 ----------
  toggleDebug() {
    const visible = !this.data.debugVisible;
    this.setData({ debugVisible: visible, debugLines: visible ? this._buildDebugLines() : [] });
  },

  _debugTick(now) {
    if (!this.data.debugVisible) return;
    if (now - (this._debugTs || 0) < 200) return;
    this._debugTs = now;
    this.setData({ debugLines: this._buildDebugLines() });
  },

  _latestRaw() {
    if (this._androidState && this._androidState.enabled) {
      return { alpha: this.data.deviceAlpha, beta: this.data.deviceBeta, gamma: this.data.deviceGamma };
    }
    const st = (this._ohosState && this._ohosState.enabled) ? this._ohosState : this._iosState;
    return (st && st.raw) || { alpha: 0, beta: 0, gamma: 0 };
  },

  _buildDebugLines() {
    const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '-');
    const info = this._sysInfo || {};
    const raw = this._latestRaw();
    const acc = this._compassAccuracy;
    const t = this._target || {};
    const lines = [
      (info.platform || '?') + ' | ' + (info.system || '') + ' | ' + (info.model || ''),
      '罗盘 ' + f1(this.data.compassDirection) + '  精度 ' + (acc === undefined ? '-' : acc),
      'α ' + f1(raw.alpha) + '  β ' + f1(raw.beta) + '  γ ' + f1(raw.gamma),
      '解算 方位 ' + this.data.currentAzimuth + '  仰角 ' + this.data.currentElevation +
        '  目标 ' + this.data.azimuth + '/' + this.data.elevation,
      '目标 ' + (t.name || '-') + ' ' + (t.rec ? ('SGP4 ' + (t.cls || '')) : (Number.isFinite(t.slotLon) ? '标称轨位' : '无星历')) +
        (this._look ? ('  距 ' + fmtInt(this._look.range) + ' km') : '')
    ];
    if (this._androidState && this._androidState.enabled) {
      lines.push('安卓路径：α顺时针 β/γ取反 旋转矩阵');
    } else if (this._ohosState && this._ohosState.enabled) {
      const a = this._ohosState.applied || {};
      const c = this._ohosState.crossing ? this._ohosState.crossing.counts() : { yproj: 0, continuous: 0 };
      lines.push('鸿蒙路径：α' + (a.alphaCW ? '顺' : '逆') + '时针 β号' + (a.betaSign === 'w3c' ? 'W3C' : '安卓') +
        ' 补丁' + (a.patch ? '开' : '关'));
      lines.push('过地平线判定 ' + (a.crossing || '未判') + '（跳变' + c.yproj + ' 连续' + c.continuous + '）');
    } else {
      const st = this._iosState || {};
      const an = st.anchor;
      lines.push('iOS路径：' + (IOS_ANCHOR_MODE ? '矩阵+锚定' : '旧逻辑') +
        ' α' + (st.profile && st.profile.alphaCW ? '顺' : '逆') + '时针');
      if (an) lines.push('δ ' + (an.anchored ? f1(an.delta) : '未锚定') + '  可信带' + (an.inBand ? '内' : '外') + '  更新' + an.updates);
      if (st.att) lines.push('tilt ' + f1(st.att.tilt) + '  roll ' + f1(st.att.roll));
    }
    lines.push('手动翻转 ' + (this._manualFlip ? '开' : '关'));
    return lines;
  },

  // 录 10 秒原始传感器值（10 Hz）并复制到剪贴板：没有真机的平台靠用户回传这份数据定口径
  startRecording() {
    if (this._rec) return;
    const t0 = Date.now();
    const samples = [];
    this._rec = {
      t0: t0,
      samples: samples,
      timer: setInterval(() => {
        const raw = this._latestRaw();
        const r1 = (v) => Math.round((Number(v) || 0) * 10) / 10;
        samples.push([
          Date.now() - t0,
          r1(this.data.compassDirection),
          r1(raw.alpha), r1(raw.beta), r1(raw.gamma),
          r1(this.data.currentAzimuth), r1(this.data.currentElevation)
        ]);
        if (Date.now() - t0 >= 10000) this._finishRecording();
      }, 100)
    };
    this.setData({ recording: true });
    wx.showToast({ title: '录制10秒：面朝正南，手机从平放抬到竖直再仰到60°，再左右横滚两次', icon: 'none', duration: 3000 });
  },

  _finishRecording() {
    const rec = this._rec;
    if (!rec) return;
    clearInterval(rec.timer);
    this._rec = null;
    this.setData({ recording: false });
    const payload = {
      v: 1,
      sys: this._sysInfo,
      path: (this._androidState && this._androidState.enabled) ? 'android'
        : ((this._ohosState && this._ohosState.enabled) ? 'ohos' : 'ios'),
      applied: (this._ohosState && this._ohosState.applied) || null,
      iosProfile: (this._iosState && this._iosState.profile) || null,
      target: { az: this.data.azimuth, el: this.data.elevation },
      cols: ['t_ms', 'compass', 'alpha', 'beta', 'gamma', 'az', 'el'],
      samples: rec.samples
    };
    wx.setClipboardData({
      data: JSON.stringify(payload),
      success: () => wx.showToast({ title: '已复制到剪贴板，请发给开发者', icon: 'none', duration: 2500 }),
      fail: () => wx.showToast({ title: '复制失败', icon: 'none' })
    });
  },

  _stopRecording() {
    if (this._rec) {
      clearInterval(this._rec.timer);
      this._rec = null;
      this.setData({ recording: false });
    }
  },

  // 相机错误处理
  onCameraError(e) {
    console.error('相机错误:', e);
    wx.showToast({
      title: '相机启动失败',
      icon: 'none'
    });
  },

  // 相机就绪回调
  onCameraReady() {
    console.log('相机已就绪，原生层级已加载');
    // 相机就绪后可以进行一些初始化操作
  },

  // 返回选择界面（AR 工具行「换星」）
  backToInput() {
    this.stopSensors();
    this._stopRecording();
    this.setData({
      stage: 'input',
      showTip: true,
      isAligned: false,
      satelliteVisible: false,
      debugVisible: false,
      debugLines: [],
      sensorHistory: [] // 清空传感器历史数据
    });
    this.data.lastAlignedState = false;
    this._startTargetTimer(TICK_INPUT_MS);
    this._refreshTargetInfo(true);
  }
});

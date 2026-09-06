'use strict';
/**
 * scripts/simArSelect.js — AR 对星页「目标选择」逻辑的离线冒烟（node scripts/simArSelect.js）
 *
 * 用真实页面代码 + 模拟 wx + 假的 utils/tleStore（固定几条 OMM 根数），走一遍：
 *   默认目标（中星 6C，先按标称轨位、GEO 根数到手后升级 SGP4）→ GSO 搜索「中星 10」并选中（定点经度 85.5°E）
 *   → 切 NGSO 搜「空间站」选 ISS（LEO、过境预报）→ 两栏各自记住上次目标 → 存储恢复 → 星座地图带参进入
 *   → 开始对星 / 换星 → 恢复失效回退默认。传感器路径不在本脚本范围（见 simArAlign.js）。
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const abs = (...p) => path.join(ROOT, 'miniprogram', ...p).split(path.sep).join('/');
const PAGE = abs('pages', 'ar-align', 'ar-align.js');

// ---- 固定根数（2026-09-06 CelesTrak）----
const CSV = [
  'OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,EPHEMERIS_TYPE,CLASSIFICATION_TYPE,NORAD_CAT_ID,ELEMENT_SET_NO,REV_AT_EPOCH,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT',
  'ISS (ZARYA),1998-067A,2026-09-06T03:26:51.861984,15.49001728,.00050232,51.6309,259.4125,112.3189,247.8332,0,U,25544,999,58430,.7453319E-4,.3658E-4,0',
  'CSS (TIANHE),2021-035A,2026-09-06T06:15:46.430784,15.59622579,.00023499,41.4675,189.8186,260.0025,100.0548,0,U,48274,999,30582,.16863369E-3,.13514E-3,0',
  'ZHONGXING-6C,2019-012A,2026-09-06T06:16:07.171104,1.00271971,.00138927,0.0374,352.5878,70.6012,146.6658,0,U,44067,999,2755,0,-.35E-5,0',
  'ZHONGXING-10,2011-026A,2026-09-06T02:57:21.464640,1.00268721,.00029069,1.2483,83.1148,67.6684,324.2565,0,U,37677,999,5581,0,-.202E-5,0',
  'BEIDOU-3 M1 (C19),2017-069A,2026-09-05T03:20:44.716416,1.86230754,.00073397,56.7655,60.4552,325.6441,34.3476,0,U,43001,999,6009,0,0,0'
].join('\n');
global.wx = { env: { USER_DATA_PATH: '' } };
const realTleStore = require(abs('utils', 'tleStore.js'));
const ALL = realTleStore.parseOMMCsv(CSV);
const byName = (n) => ALL.find((s) => s.name === n);
const GROUPS = {
  geo: [byName('ZHONGXING-6C'), byName('ZHONGXING-10')],
  stations: [byName('ISS (ZARYA)'), byName('CSS (TIANHE)')],
  beidou: [byName('BEIDOU-3 M1 (C19)')]
};
const INDEX = [];
Object.keys(GROUPS).forEach((g) => GROUPS[g].forEach((s) => INDEX.push({ name: s.name, noradId: s.noradId, group: g })));
INDEX.push({ name: 'STARLINK-1234', noradId: '900001', group: 'starlink' });

// ---- 假 tleStore / satsimPack：注入 require 缓存，页面 require 到的就是它们 ----
const calls = { loadGroupSats: [], ensureSearchIndex: 0 };
const fakeTleStore = {
  parseOMMCsv: realTleStore.parseOMMCsv,
  readLocalCache: () => null,
  loadGroupSats(key) {
    calls.loadGroupSats.push(key);
    if (key === 'other') key = 'active';
    const sats = key === 'active' ? ALL : GROUPS[key];
    return new Promise((resolve, reject) => setTimeout(() => (sats ? resolve({ sats, fetchedAt: '2026-09-06T08:00:00Z' }) : reject(new Error('no group'))), 5));
  },
  ensureSearchIndex() { calls.ensureSearchIndex++; return new Promise((r) => setTimeout(() => r(INDEX), 5)); },
  mergeOtherIntoIndex() {}
};
const fakeSatsim = { loadSetSats: () => [] };
function inject(file, exportsObj) {
  const key = require.resolve(file);
  require.cache[key] = { id: key, filename: key, loaded: true, exports: exportsObj };
}
inject(abs('utils', 'tleStore.js'), fakeTleStore);
inject(abs('utils', 'satsimPack.js'), fakeSatsim);

// ---- 页面副本（require 改绝对路径）----
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-ar-select-'));
function materialize() {
  let src = fs.readFileSync(PAGE, 'utf8');
  const map = {
    "require('./arAttitude.js')": abs('pages', 'ar-align', 'arAttitude.js'),
    "require('./arOrbit.js')": abs('pages', 'ar-align', 'arOrbit.js'),
    "require('./satellite.js')": abs('pages', 'ar-align', 'satellite.js'),
    "require('./satSearch.js')": abs('pages', 'ar-align', 'satSearch.js'),
    "require('../../utils/tleStore.js')": abs('utils', 'tleStore.js'),
    "require('../../utils/satsimPack.js')": abs('utils', 'satsimPack.js')
  };
  Object.keys(map).forEach((k) => { src = src.split(k).join("require('" + map[k] + "')"); });
  const file = path.join(TMP_DIR, 'ar-align.sel.js');
  fs.writeFileSync(file, src, 'utf8');
  return file;
}
const PAGE_FILE = materialize();

// ---- 模拟 wx（存储跨页面实例保留，模拟小程序本地存储）----
const storage = {};
function makeWx(opt) {
  const w = {
    toasts: [], modals: [], nav: [],
    env: { USER_DATA_PATH: '' },
    getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844 }),
    getDeviceInfo: () => ({ platform: 'ios', system: 'sim', model: 'sim' }),
    getAppBaseInfo: () => ({ SDKVersion: 'sim' }),
    onDeviceMotionChange() {}, offDeviceMotionChange() {}, onCompassChange() {}, offCompassChange() {},
    startDeviceMotionListening(o) { o && o.success && o.success(); },
    stopDeviceMotionListening(o) { o && o.success && o.success(); },
    startCompass(o) { o && o.success && o.success(); },
    stopCompass(o) { o && o.success && o.success(); },
    vibrateShort() {},
    showToast(o) { w.toasts.push(o && o.title); },
    showModal(o) { w.modals.push(o && o.title); if (o && o.success) o.success({ confirm: false }); },
    getStorageSync(k) { return storage[k]; },
    setStorageSync(k, v) { storage[k] = v; },
    removeStorageSync(k) { delete storage[k]; },
    setClipboardData(o) { o.success && o.success(); },
    getLocation(o) {
      if (opt && opt.noLocation) { o.fail && o.fail({ errMsg: 'sim deny' }); return; }
      o.success({ latitude: 39.9042, longitude: 116.4074, altitude: 50 });
    },
    getSetting(o) { o.success({ authSetting: {} }); },
    authorize(o) { o.success(); },
    openSetting(o) { o.success({ authSetting: { 'scope.userLocation': true, 'scope.camera': true } }); },
    navigateTo(o) { w.nav.push(o.url); },
    getFileSystemManager() { return { readFileSync() { throw new Error('nofs'); }, writeFileSync() {} }; }
  };
  return w;
}

const quiet = { log() {}, warn() {}, error() {}, info() {} };
function loadPage(opt) {
  const wx = makeWx(opt);
  let pageObj = null;
  global.wx = wx;
  global.getApp = () => ({});
  global.Page = (obj) => { pageObj = obj; };
  const realConsole = global.console;
  global.console = quiet;
  try {
    delete require.cache[require.resolve(PAGE_FILE)];
    require(PAGE_FILE);
  } finally { global.console = realConsole; }
  pageObj.setData = function (o, cb) { Object.assign(this.data, o); if (cb) cb(); };
  return { page: pageObj, wx: wx };
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 30));
const ev = (v) => ({ detail: { value: v }, currentTarget: { dataset: {} } });
const tap = (ds) => ({ currentTarget: { dataset: ds } });

let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + msg); };
const hasStr = (s, sub) => typeof s === 'string' && s.indexOf(sub) >= 0;

async function main() {
  const realConsole = global.console;
  const run = async (label, fn) => { console.log('\n== ' + label + ' =='); global.console = Object.assign({}, realConsole, { log: realConsole.log, error() {}, warn() {} }); await fn(); global.console = realConsole; };

  let P;
  await run('首次进页：默认中星 6C，标称起步 → GEO 根数到手升级 SGP4', async () => {
    P = loadPage();
    P.page.onLoad({});
    const d = P.page.data;
    check(d.mode === 'gso' && d.tgt && d.tgt.name === 'CHINASAT 6C', `默认目标 ${d.tgt && d.tgt.name}，模式 ${d.mode}`);
    check(d.tInfo && Number.isFinite(parseFloat(d.tInfo.az)) && Number.isFinite(parseFloat(d.tInfo.el)), `定位后即有读数：az ${d.tInfo && d.tInfo.az} el ${d.tInfo && d.tInfo.el} 距 ${d.tInfo && d.tInfo.range} km（标称轨位）`);
    check(hasStr(d.tgt.src, '标称'), `根数未到前来源标注：${d.tgt.src}`);
    await tick(40);
    // 星历实测 130.31°E（标称 130.5°E）：升级后卡片显示的是实测值
    check(hasStr(d.tgt.src, 'SGP4') && d.tInfo && d.tInfo.lonText === '130.3°E' && hasStr(d.tInfo.where, '实测'), `GEO 根数到手 → ${d.tgt.src}，${d.tInfo && d.tInfo.where}，badge ${d.tgt.badge}`);
    check(hasStr(d.tInfo.pass, '同步轨道'), `同步轨道不做过境预报：${d.tInfo.pass}`);
    check(d.azimuth === d.tInfo.az && d.elevation === d.tInfo.el, `AR 渲染读的 data.azimuth/elevation 与卡片一致：${d.azimuth}/${d.elevation}`);
  });

  await run('GSO 搜索「中星 10」并选中（定点 85.5°E，标称 85.5°E）', async () => {
    P.page.onSearchInput(ev('中星 10'));
    const d = P.page.data;
    check(d.results.length >= 1 && d.results[0].name === 'ZHONGXING-10' && d.results[0].lonText === '85.5°E', `结果：${JSON.stringify(d.results.map((r) => r.name + '@' + r.lonText))}`);
    P.page.onPickResult(tap({ norad: '37677', group: 'geo', name: 'ZHONGXING-10' }));
    await tick(40);
    check(d.tgt.name === 'ZHONGXING-10' && hasStr(d.tgt.src, 'SGP4') && d.satelliteIndex === 6, `选中 ${d.tgt.name}，picker 对到常用第 ${d.satelliteIndex} 项（CHINASAT 10），sub「${d.tgt.sub}」`);
    check(d.results.length === 0 && d.keyword === '', '选中后结果收起');
    check(storage['arAlign/selection'] && storage['arAlign/selection'].gso.noradId === '37677', `已存储：${JSON.stringify(storage['arAlign/selection'])}`);
  });

  await run('切到 NGSO：空目标 → 搜「空间站」选 ISS → LEO + 过境预报', async () => {
    P.page.onModeTap(tap({ mode: 'ngso' }));
    const d = P.page.data;
    check(d.mode === 'ngso' && d.tgt === null, `NGSO 初次无目标：tgt=${d.tgt}`);
    P.page.onSearchInput(ev('空间站'));
    await tick(40);
    check(d.results.length === 2 && d.results.every((r) => r.group === 'stations'), `跨全部在轨搜索：${d.results.map((r) => r.name).join(' / ')}`);
    P.page.onPickResult(tap({ norad: '25544', group: 'stations', name: 'ISS (ZARYA)' }));
    await tick(60);
    check(d.tgt && d.tgt.name === 'ISS (ZARYA)' && d.tgt.badge === 'LEO', `选中 ${d.tgt && d.tgt.name} badge ${d.tgt && d.tgt.badge} sub「${d.tgt && d.tgt.sub}」`);
    check(d.tInfo && (hasStr(d.tInfo.pass, '过境') || hasStr(d.tInfo.pass, '可见中')), `过境预报：${d.tInfo && d.tInfo.pass}`);
    check(hasStr(d.targetLine, 'LEO') && hasStr(d.targetLine, '距离'), `AR 第三行：${d.targetLine}`);
    check(calls.loadGroupSats.indexOf('stations') >= 0, `按真实分组取根数：${calls.loadGroupSats.join(',')}`);
  });

  await run('分组浏览：选「北斗」不打字即列组内', async () => {
    const gi = P.page.data.groups.findIndex((g) => g.key === 'beidou');
    P.page.onGroupChange(ev(String(gi)));
    const d = P.page.data;
    check(d.results.length === 1 && d.results[0].name === 'BEIDOU-3 M1 (C19)', `列出：${d.results.map((r) => r.name).join(',')}（${d.resultsTitle}）`);
    P.page.onSearchInput(ev('m1'));
    check(d.results.length === 1, '组内过滤 m1 命中 1 颗');
    P.page.closeResults();
  });

  await run('两栏各记上次目标：GSO↔NGSO 来回切', async () => {
    P.page.onModeTap(tap({ mode: 'gso' }));
    check(P.page.data.tgt.name === 'ZHONGXING-10', `回 GSO → ${P.page.data.tgt.name}`);
    P.page.onModeTap(tap({ mode: 'ngso' }));
    check(P.page.data.tgt.name === 'ISS (ZARYA)', `回 NGSO → ${P.page.data.tgt.name}`);
    check(storage['arAlign/selection'].mode === 'ngso' && storage['arAlign/selection'].ngso.noradId === '25544', `存储：${JSON.stringify(storage['arAlign/selection'])}`);
  });

  await run('开始对星 → AR 阶段目标随时间刷新 → 换星', async () => {
    await P.page.startAR();
    const d = P.page.data;
    check(d.stage === 'ar' && d.satelliteVisible === true && !d.loading, `stage=${d.stage} visible=${d.satelliteVisible}`);
    const az0 = d.azimuth;
    await tick(600);
    check(typeof d.azimuth === 'string' && d.targetLine, `AR 中目标角为字符串口径 ${az0} → ${d.azimuth}，第三行「${d.targetLine}」`);
    P.page.backToInput();
    check(d.stage === 'input' && d.tgt && d.tgt.name === 'ISS (ZARYA)', `换星回到选择页，目标仍为 ${d.tgt && d.tgt.name}`);
    P.page.onUnload();
  });

  await run('重新进页：按存储恢复 NGSO 的 ISS', async () => {
    P = loadPage();
    P.page.onLoad({});
    const d = P.page.data;
    check(d.mode === 'ngso' && d.tgt && d.tgt.name === 'ISS (ZARYA)' && hasStr(d.tgt.src, '加载中'), `恢复中：${d.tgt && d.tgt.name} / ${d.tgt && d.tgt.src}`);
    await tick(60);
    check(hasStr(d.tgt.src, 'SGP4') && d.tgt.badge === 'LEO', `恢复完成：${d.tgt.src} ${d.tgt.badge}`);
    P.page.onModeTap(tap({ mode: 'gso' }));
    await tick(60);
    check(d.tgt.name === 'ZHONGXING-10' && hasStr(d.tgt.src, 'SGP4'), `GSO 槽也恢复：${d.tgt.name} ${d.tgt.src}`);
    P.page.onUnload();
  });

  await run('星座地图带参进入（北斗 M1 → NGSO / MEO）', async () => {
    P = loadPage();
    P.page.onLoad({ norad: '43001', group: 'beidou', name: encodeURIComponent('BEIDOU-3 M1 (C19)') });
    const d = P.page.data;
    check(d.mode === 'ngso' && d.tgt.name === 'BEIDOU-3 M1 (C19)', `带参目标 ${d.tgt.name} 模式 ${d.mode}`);
    await tick(60);
    check(d.tgt.badge === 'MEO' && hasStr(d.tgt.sub, '高度'), `MEO：${d.tgt.badge} ${d.tgt.sub}`);
    check(d.tInfo && (hasStr(d.tInfo.pass, '过境') || hasStr(d.tInfo.pass, '可见中') || hasStr(d.tInfo.pass, '不过境')), `预报：${d.tInfo && d.tInfo.pass}`);
    P.page.onUnload();
  });

  await run('恢复失效：存储里的星取不到 → 回退默认中星 6C 并提示', async () => {
    storage['arAlign/selection'] = { mode: 'ngso', gso: null, ngso: { name: 'GHOST', noradId: '1', group: 'nosuch' } };
    P = loadPage();
    P.page.onLoad({});
    await tick(60);
    const d = P.page.data;
    check(d.mode === 'gso' && d.tgt.name === 'CHINASAT 6C', `回退：${d.mode} ${d.tgt.name}`);
    check(P.wx.toasts.some((t) => hasStr(t, '失效')), `提示：${P.wx.toasts.join(' | ')}`);
    P.page.onUnload();
  });

  await run('定位被拒：卡片等待定位，开始对星时交互式重试', async () => {
    storage['arAlign/selection'] = null;
    P = loadPage({ noLocation: true });
    P.page.onLoad({});
    await tick(40);
    const d = P.page.data;
    check(!d.locOk && d.tInfo && d.tInfo.pending, `定位失败：locText「${d.locText}」 tInfo.pending=${d.tInfo && d.tInfo.pending}`);
    await P.page.startAR();
    check(d.stage === 'input' && P.wx.toasts.some((t) => hasStr(t, '位置')), `无定位不进 AR，提示：${P.wx.toasts.join(' | ')}`);
    P.page.onUnload();
  });

  console.log('\n' + (fails ? `${fails} 项失败` : '全部通过'));
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error(e && e.stack || e); process.exit(2); });

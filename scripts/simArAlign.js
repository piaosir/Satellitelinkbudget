'use strict';
/**
 * scripts/simArAlign.js — AR 对星页面的离线仿真台（node scripts/simArAlign.js [口径关键字]）
 *
 * 用真实页面代码 + 模拟的 wx 传感器回调，回放一段标准动作（面朝正南、从低头抬起过地平线、
 * 保持、转身 ±30°、俯仰 40°→55°→40° 穿过 45°、横滚 ±15°），在多种传感器口径假设下比较页面解出的
 * 方位/仰角与真值，并统计「真值几乎不变时输出的突跳」次数：
 *   ios            苹果罗盘按倾角切参考轴（机顶偏离竖直 <45° 报后摄朝向，否则报机顶方向），alpha 以启动方向为 0
 *   ios-cwAlpha    同上但 alpha 顺时针（检验转向自检）
 *   android        getOrientation 口径 + 传统 roll 符号（安卓路径既有假设），仅作新旧回归比对
 *   ohos-P1-*      getOrientation 口径（azimuth 顺时针、pitch asin 有界 ±90、roll ±180），roll 符号 ±
 *   ohos-P2-*      连续 ZXY 口径（alpha 顺时针连续、beta ±180、gamma ±90），beta/gamma 符号 ±，另有 alpha 逆时针变体
 *   ohos-P3-*      传统方向传感器口径（azimuth = 机顶投影，越过地平线反 180°；pitch ±180；roll ±90），符号 ±
 * 每种口径分别跑「改动前(git HEAD)」与「当前工作区」两份页面代码；加 --legacy-ios 再跑一份 IOS_ANCHOR_MODE=false 的当前代码。
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PAGE_NEW = path.join(ROOT, 'miniprogram', 'pages', 'ar-align', 'ar-align.js');
const att = require(path.join(ROOT, 'miniprogram', 'pages', 'ar-align', 'arAttitude.js'));
const { norm360, angDiff, clamp, eulerToMatrix, cameraFromMatrix, yAxisHeading, R2D } = att;
const out = console;

// ---------- 页面副本：改写 require 为绝对路径后放到系统临时目录（不污染仓库）----------
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-ar-align-'));
function materializePage(src, name, mutate) {
  const abs = (...p) => path.join(ROOT, 'miniprogram', ...p).split(path.sep).join('/');
  // 旧版页面（git HEAD）只 require 前两项；新版还带目标几何 / SGP4 / 搜索 / 星历取数 / 导入星座，逐一改绝对路径
  const map = {
    "require('../../utils/linkCalculator')": abs('utils', 'linkCalculator.js'),
    "require('./arAttitude.js')": abs('pages', 'ar-align', 'arAttitude.js'),
    "require('./arOrbit.js')": abs('pages', 'ar-align', 'arOrbit.js'),
    "require('./satellite.js')": abs('pages', 'ar-align', 'satellite.js'),
    "require('./satSearch.js')": abs('pages', 'ar-align', 'satSearch.js'),
    "require('../../utils/tleStore.js')": abs('utils', 'tleStore.js'),
    "require('../../utils/satsimPack.js')": abs('utils', 'satsimPack.js')
  };
  Object.keys(map).forEach((k) => { src = src.split(k).join("require('" + map[k] + "')"); });
  if (mutate) src = mutate(src);
  const file = path.join(TMP_DIR, name);
  fs.writeFileSync(file, src, 'utf8');
  return file;
}
// 改动前（git HEAD）的页面
function materializeOldPage() {
  const src = execSync('git show HEAD:miniprogram/pages/ar-align/ar-align.js', {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24
  });
  return materializePage(src, 'ar-align.old.js');
}
// 当前页面但 IOS_ANCHOR_MODE=false：验证应急回退开关确实回到旧行为
function materializeLegacyIosPage() {
  const src = fs.readFileSync(PAGE_NEW, 'utf8');
  return materializePage(src, 'ar-align.legacy-ios.js', (t) => {
    if (t.indexOf('const IOS_ANCHOR_MODE = true;') < 0) throw new Error('IOS_ANCHOR_MODE 常量未找到');
    return t.replace('const IOS_ANCHOR_MODE = true;', 'const IOS_ANCHOR_MODE = false;');
  });
}

// ---------- wx 模拟 ----------
function makeWx(platform) {
  const w = {
    _motion: null, _compass: null, _storage: {}, clip: null, toasts: [],
    getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844 }),
    getDeviceInfo: () => ({ platform: platform, system: 'sim', model: 'sim', brand: 'sim' }),
    getAppBaseInfo: () => ({ SDKVersion: 'sim' }),
    onDeviceMotionChange(cb) { w._motion = cb; },
    offDeviceMotionChange() { w._motion = null; },
    onCompassChange(cb) { w._compass = cb; },
    offCompassChange() { w._compass = null; },
    startDeviceMotionListening(o) { if (o && o.success) o.success(); },
    stopDeviceMotionListening(o) { if (o && o.success) o.success(); },
    startCompass(o) { if (o && o.success) o.success(); },
    stopCompass(o) { if (o && o.success) o.success(); },
    vibrateShort() {},
    showToast(o) { w.toasts.push(o && o.title); },
    showModal() {},
    getStorageSync(k) { return w._storage[k]; },
    setStorageSync(k, v) { w._storage[k] = v; },
    removeStorageSync(k) { delete w._storage[k]; },
    setClipboardData(o) { w.clip = o.data; if (o.success) o.success(); },
    getLocation(o) { o.success({ latitude: 39.9, longitude: 116.4, altitude: 50 }); },
    getSetting(o) { if (o && o.success) o.success({ authSetting: {} }); },
    authorize(o) { o.success(); },
    navigateTo() {},
    // 新版页面经 utils/tleStore 取星历：仿真台没有云/网络/文件系统，让每一路都干净地失败，页面回退标称轨位
    env: { USER_DATA_PATH: '' },
    getFileSystemManager() {
      const fail = (o) => { if (o && o.fail) o.fail(new Error('sim: no fs')); };
      return { readFileSync() { throw new Error('sim: no fs'); }, writeFileSync() {}, unlinkSync() {}, readFile: fail, writeFile: fail };
    }
  };
  return w;
}

const quiet = { log() {}, warn() {}, error() {}, info() {}, table() {} };

function loadPage(file, platform) {
  const wx = makeWx(platform);
  let pageObj = null;
  global.wx = wx;
  global.getApp = () => ({});
  global.Page = (obj) => { pageObj = obj; };
  const realConsole = global.console;
  global.console = quiet;
  try {
    delete require.cache[require.resolve(file)];
    require(file);
  } finally {
    global.console = realConsole;
  }
  pageObj.setData = function (o, cb) { Object.assign(this.data, o); if (cb) cb(); };
  return { page: pageObj, wx: wx };
}

// ---------- 标准动作（真值）----------
function truthAt(tMs) {
  const t = tMs / 1000;
  let E, A = 180, roll = 0, phase;
  if (t < 1.5) { E = -70 + 60 * t / 1.5; phase = 'A低头'; }
  else if (t < 3) { E = -10 + 50 * (t - 1.5) / 1.5; phase = 'B抬起过地平'; }
  else if (t < 5) { E = 40; phase = 'C保持40°'; }
  else if (t < 7) { E = 40; A = 180 - 30 * Math.sin(Math.PI * (t - 5)); phase = 'D转身±30°'; }
  else if (t < 9) { E = 40 + 15 * Math.sin(Math.PI * (t - 7)); phase = 'E俯仰过45°'; }
  else if (t < 11) { E = 40; roll = 15 * Math.sin(Math.PI * (t - 9)); phase = 'F横滚±15°'; }
  else { E = 40; phase = 'G保持'; }
  return { A: A, E: E, roll: roll, phase: phase };
}
const PHASES = ['A低头', 'B抬起过地平', 'C保持40°', 'D转身±30°', 'E俯仰过45°', 'F横滚±15°', 'G保持'];

function w3cFromTruth(tr) {
  return { alpha: norm360(360 - tr.A), beta: 90 + tr.E, gamma: tr.roll };
}

// ---------- 传感器口径 ----------
function appleCompass(R) {
  const cam = cameraFromMatrix(R);
  return cam.tilt < 45 ? cam.azimuth : yAxisHeading(R);
}
function p1(rollSign) {
  return (w, R) => ({
    alpha: yAxisHeading(R),
    beta: Math.asin(clamp(-R[2][1], -1, 1)) * R2D,
    gamma: rollSign * Math.atan2(-R[2][0], R[2][2]) * R2D
  });
}
function p2(bs, gs, ccw) {
  return (w) => ({ alpha: ccw ? w.alpha : norm360(360 - w.alpha), beta: bs * w.beta, gamma: gs * w.gamma });
}
function p3(bs, gs) {
  return (w, R) => ({ alpha: yAxisHeading(R), beta: bs * w.beta, gamma: gs * w.gamma });
}
const yCompass = (R) => yAxisHeading(R);
const cwCompass = (R, w) => norm360(360 - w.alpha); // 连续口径下的罗盘 = 相机方位（零横滚）
const SEMANTICS = {
  'ios':            { platform: 'ios', motion: (w) => ({ alpha: norm360(w.alpha + 137), beta: w.beta, gamma: w.gamma }), compass: appleCompass },
  'ios-cwAlpha':    { platform: 'ios', motion: (w) => ({ alpha: norm360(360 - w.alpha + 137), beta: w.beta, gamma: w.gamma }), compass: appleCompass },
  'android':        { platform: 'android', motion: p1(-1), compass: yCompass },
  'ohos-P1-roll-':  { platform: 'ohos', motion: p1(-1), compass: yCompass },
  'ohos-P1-roll+':  { platform: 'ohos', motion: p1(+1), compass: yCompass },
  'ohos-P2-b+g+':   { platform: 'ohos', motion: p2(+1, +1, false), compass: cwCompass },
  'ohos-P2-b-g-':   { platform: 'ohos', motion: p2(-1, -1, false), compass: cwCompass },
  'ohos-P2-ccw':    { platform: 'ohos', motion: p2(+1, +1, true), compass: cwCompass },
  'ohos-P3-b+g+':   { platform: 'ohos', motion: p3(+1, +1), compass: yCompass },
  'ohos-P3-b-g-':   { platform: 'ohos', motion: p3(-1, -1), compass: yCompass },
  'ohos-P3-b-g+':   { platform: 'ohos', motion: p3(-1, +1), compass: yCompass }
};

// 可复现的伪随机噪声
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function gaussFactory(seed) {
  const rnd = mulberry32(seed);
  return (sigma) => {
    const u = Math.max(rnd(), 1e-12), v = rnd();
    return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

function runScenario(pageFile, semKey) {
  const sem = SEMANTICS[semKey];
  const { page, wx } = loadPage(pageFile, sem.platform);
  const gauss = gaussFactory(20260906);
  const realNow = Date.now;
  let simNow = 0;
  Date.now = () => simNow;
  const rows = [];
  const realConsole = global.console;
  global.console = quiet; // 页面运行期日志全部静默，仿真台自己用 out 输出
  try {
    page.onLoad();
    page.data.azimuth = '180.0';
    page.data.elevation = '40.0';
    page.data.satelliteVisible = true;
    page.startSensors();
    const dt = 1000 / 60;
    let nextCompass = 0;
    const noisyR = (tMs) => {
      const w = w3cFromTruth(truthAt(tMs));
      const wn = { alpha: norm360(w.alpha + gauss(0.3)), beta: w.beta + gauss(0.3), gamma: w.gamma + gauss(0.3) };
      return { w: wn, R: eulerToMatrix(wn.alpha, wn.beta, wn.gamma) };
    };
    let prevAz = null;
    let prevTrueAz = null;
    for (let t = 0; t <= 13000; t += dt) {
      simNow = Math.round(t);
      const tr = truthAt(t);
      const wTrue = w3cFromTruth(tr);
      const camTrue = cameraFromMatrix(eulerToMatrix(wTrue.alpha, wTrue.beta, wTrue.gamma));
      if (t >= nextCompass) {
        const lag = noisyR(Math.max(0, t - 100)); // 罗盘滞后 100 ms、20 Hz、噪声 1.5°
        const c = norm360(sem.compass(lag.R, lag.w) + gauss(1.5));
        if (wx._compass) wx._compass({ direction: c, accuracy: 10 });
        nextCompass += 50;
      }
      const m = noisyR(t);
      if (wx._motion) wx._motion(sem.motion(m.w, m.R));
      const az = parseFloat(page.data.currentAzimuth);
      const el = parseFloat(page.data.currentElevation);
      const jump = (prevAz !== null && Math.abs(angDiff(az, prevAz)) > 20 &&
        Math.abs(angDiff(camTrue.azimuth, prevTrueAz)) < 2) ? 1 : 0;
      rows.push({ t: t, phase: tr.phase, azErr: angDiff(az, camTrue.azimuth), elErr: el - camTrue.elevation, jump: jump });
      prevAz = az;
      prevTrueAz = camTrue.azimuth;
    }
  } finally {
    Date.now = realNow;
    try { page.stopSensors(); } catch (e) { /* ignore */ }
    try { page.onUnload(); } catch (e) { /* 新版页面在 onLoad 起了目标刷新定时器，不清掉 Node 进程不退出 */ }
    global.console = realConsole;
  }
  return rows;
}

function summarize(rows) {
  const res = {};
  for (const ph of PHASES) {
    const start = rows.find((r) => r.phase === ph);
    if (!start) continue;
    const sel = rows.filter((r) => r.phase === ph && r.t >= start.t + 400); // 每段前 400 ms 视为过渡
    if (!sel.length) continue;
    const azA = sel.map((r) => Math.abs(r.azErr));
    const elA = sel.map((r) => Math.abs(r.elErr));
    res[ph] = {
      azMean: azA.reduce((s, v) => s + v, 0) / azA.length,
      azMax: Math.max.apply(null, azA),
      elMax: Math.max.apply(null, elA),
      jumps: rows.filter((r) => r.phase === ph).reduce((s, r) => s + r.jump, 0)
    };
  }
  return res;
}

function fmt(v) { return Number.isFinite(v) ? v.toFixed(1).padStart(6) : '     -'; }

function main() {
  const args = process.argv.slice(2);
  const legacyIos = args.indexOf('--legacy-ios') >= 0;
  const only = args.find((a) => a.indexOf('--') !== 0);
  const oldFile = materializeOldPage();
  const variants = legacyIos
    ? [['旧', oldFile], ['新', PAGE_NEW], ['新·回退', materializeLegacyIosPage()]]
    : [['旧', oldFile], ['新', PAGE_NEW]];
  const keys = only ? Object.keys(SEMANTICS).filter((k) => k.indexOf(only) >= 0) : Object.keys(SEMANTICS);
  out.log('列：各阶段 方位误差均值/最大(°)，仰角误差最大(°)，突跳次数；阶段前 400 ms 不计入误差');
  for (const key of keys) {
    for (const [which, file] of variants) {
      let rows;
      try {
        rows = runScenario(file, key);
      } catch (e) {
        out.log(key.padEnd(15) + which + '  运行异常: ' + ((e && e.stack) || e));
        continue;
      }
      const s = summarize(rows);
      const parts = PHASES.filter((p) => s[p]).map((p) => {
        const r = s[p];
        return p + ' az' + fmt(r.azMean) + '/' + fmt(r.azMax) + ' el' + fmt(r.elMax) + ' 跳' + String(r.jumps).padStart(2);
      });
      out.log((key.padEnd(15) + which).padEnd(21) + parts.join(' | '));
    }
    out.log('');
  }
}

main();

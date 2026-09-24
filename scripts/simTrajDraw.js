'use strict';
/**
 * scripts/simTrajDraw.js — 「卫星覆盖」页手绘航迹的离线冒烟（node scripts/simTrajDraw.js）
 *
 * 真实页面代码 + 真实 trajLayer / tjIcon / satsimPack，模拟 wx 与地图上下文，走一遍平台「标记 → 轨迹」描绘态的手机版：
 *   坐标换算（GCJ-02 ↔ WGS-84 往返、屏幕点 → 底图坐标含跨 ±180°）→ ＋航行（自动名、0 点不入库）
 *   → 点地图逐点加（落点反解到 WGS-84，画回去正落在点的位置）→ 同一下点击双报只算一次 / 点航点、搜索标记不落点
 *   → 选中航点 + 点地图挪点 → 撤销 → 「手绘」按住拖动（每 14 px 一点、多指、慢视野、整笔撤销）
 *   → 「航点」面板（改名 / 改色 / 按经纬度加点 / 改坐标 / 删点 / 选点）→ 结束（空航迹丢弃）
 *   → 接着画平台发来的那条（平台重发仍整条覆盖）→ 存不下时回滚 → 残行清理 → 航点多不出手柄 → 套圈图标 PNG 可解
 *   → iOS：屏幕点换经纬度走地图原生换算（三点仿射；手绘 / 长按标点 / 点在地名上都落在手指处，老基础库与回调不来时退回 getRegion）。
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const abs = (...p) => path.join(ROOT, 'miniprogram', ...p);
const PAGE = abs('pages', 'satellite-coverage', 'satellite-coverage.js');
const trajLayer = require(abs('pages', 'satellite-coverage', 'trajLayer.js'));

// ---- 模拟 wx：存储、文件系统（tjIcon 真的往临时目录写 PNG）、选择器、弹窗 ----
const storage = {};
const USER_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-traj-draw-')).split(path.sep).join('/');
const RECT = { left: 0, top: 0, width: 375, height: 812 };
const W = {
  toasts: [], modals: [], modalReply: null, failKey: null,
  env: { USER_DATA_PATH: USER_DIR },
  getStorageSync(k) { return storage[k] === undefined ? '' : JSON.parse(JSON.stringify(storage[k])); },
  setStorageSync(k, v) {
    if (W.failKey && String(k).indexOf(W.failKey) === 0) throw new Error('setStorage:fail exceed storage max size');
    storage[k] = JSON.parse(JSON.stringify(v));
  },
  removeStorageSync(k) { delete storage[k]; },
  showToast(o) { W.toasts.push(o && o.title); },
  showModal(o) {
    W.modals.push(o && o.title);
    const r = W.modalReply ? W.modalReply(o) : { confirm: false };
    if (o && o.success) o.success(r);
  },
  showLoading() {}, hideLoading() {}, vibrateShort() {},
  getDeviceInfo: () => ({ platform: 'ios' }),
  getWindowInfo: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 3 }),
  getFileSystemManager() {
    return {
      accessSync(p) { fs.accessSync(p); },
      mkdirSync(p, rec) { fs.mkdirSync(p, { recursive: !!rec }); },
      writeFileSync(p, data) { fs.writeFileSync(p, Buffer.from(data)); },
      readdirSync(p) { return fs.readdirSync(p); },
      unlinkSync(p) { fs.unlinkSync(p); }
    };
  },
  createSelectorQuery() {
    const cbs = [];
    const q = {
      select() { return { boundingClientRect(cb) { cbs.push(cb); return q; } }; },
      exec() { setTimeout(() => cbs.forEach((cb) => cb && cb(Object.assign({}, RECT))), 1); }
    };
    return q;
  }
};
global.wx = W;
global.getApp = () => ({});
let PAGE_OBJ = null;
global.Page = (o) => { PAGE_OBJ = o; };
require(PAGE);
const satsimPack = require(abs('utils', 'satsimPack.js'));
const tjIcon = require(abs('pages', 'satellite-coverage', 'tjIcon.js'));

// 地图上下文：视野可换、getRegion 可调慢
const mapCtx = {
  region: { southwest: { latitude: 31.0, longitude: 121.2 }, northeast: { latitude: 31.6, longitude: 121.8 } },
  delay: 2, moved: null, included: null,
  getRegion(o) { const r = JSON.parse(JSON.stringify(this.region)); setTimeout(() => o.success && o.success(r), this.delay); },
  moveToLocation(o) { this.moved = o; },
  includePoints(o) { this.included = o; }
};

function newPage() {
  const p = Object.assign({}, PAGE_OBJ);
  p.data = JSON.parse(JSON.stringify(PAGE_OBJ.data));
  p.setData = function (o, cb) { Object.assign(this.data, o); if (cb) cb(); };
  p.data.currentSatellite = p.data.satellites[0];
  p.mapCtx = mapCtx;
  p._viewReady = true;
  p._isAndroid = false;
  p._isIOS = false;                                                // 默认走 getRegion 两角；iOS 那条路见末节
  p._initTrajs();
  return p;
}

const tick = (ms) => new Promise((r) => setTimeout(r, ms == null ? 30 : ms));
const tap = (ds) => ({ currentTarget: { dataset: ds || {} } });
const mapTap = (lat, lon) => ({ detail: { latitude: lat, longitude: lon } });
const touch = (id, x, y) => ({ identifier: id, clientX: x, clientY: y });
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + msg); };
const near = (a, b, eps) => Math.abs(a - b) <= eps;
const idx = () => satsimPack.readTrajIndex();
const body = (id) => satsimPack.loadTraj(id);
const disp = (p) => trajLayer.wgs2gcj(p[1], p[0]);                 // 航点 → 底图坐标
const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const unmerc = (y) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;

async function main() {
  console.log('== 坐标换算 ==');
  {
    let worst = 0, n = 0;
    for (let lat = 18.5; lat <= 53; lat += 1.7) {
      for (let lon = 74; lon <= 134; lon += 1.9) {
        const g = trajLayer.wgs2gcj(lat, lon);
        if (g.latitude === lat && g.longitude === lon) continue;   // 境外（分块矩形之外）
        const w = trajLayer.gcj2wgs(g.latitude, g.longitude);
        const back = trajLayer.wgs2gcj(w.latitude, w.longitude);
        worst = Math.max(worst, Math.abs(back.latitude - g.latitude), Math.abs(back.longitude - g.longitude),
          Math.abs(w.latitude - lat), Math.abs(w.longitude - lon));
        n++;
      }
    }
    check(n > 200 && worst < 1e-8, `境内 ${n} 个格点 WGS→GCJ→WGS 往返最大误差 ${worst.toExponential(2)}°（< 1e-8°）`);
    const sh = trajLayer.gcj2wgs(31.2304, 121.4737);
    const shM = trajLayer.geodesicM(sh.latitude, sh.longitude, 31.2304, 121.4737);
    check(shM > 100 && shM < 1000, `上海 GCJ(31.2304, 121.4737) → WGS(${sh.latitude.toFixed(6)}, ${sh.longitude.toFixed(6)})，反偏 ${shM.toFixed(0)} m（国测局偏移量级 100~1000 m）`);
    const tokyo = trajLayer.gcj2wgs(35.68, 139.76);
    check(tokyo.latitude === 35.68 && tokyo.longitude === 139.76, '境外（东京）原样不偏');
  }
  {
    const region = { southwest: { latitude: 30, longitude: 120 }, northeast: { latitude: 32, longitude: 122 } };
    const rect = { left: 0, top: 0, width: 400, height: 800 };
    const sw = trajLayer.screenToMap(region, rect, 0, 800), ne = trajLayer.screenToMap(region, rect, 400, 0);
    check(near(sw.latitude, 30, 1e-9) && near(sw.longitude, 120, 1e-9) && near(ne.latitude, 32, 1e-9) && near(ne.longitude, 122, 1e-9), '视野角点 → 西南 / 东北角原值');
    const c = trajLayer.screenToMap(region, rect, 200, 400);
    const want = unmerc((merc(30) + merc(32)) / 2);
    check(near(c.longitude, 121, 1e-9) && near(c.latitude, want, 1e-9) && c.latitude > 31, `视野中心纬度按墨卡托取（${c.latitude.toFixed(6)}°，不是算术平均 31°）`);
    const off = trajLayer.screenToMap(region, { left: 10, top: 50, width: 400, height: 800 }, 210, 450);
    check(near(off.latitude, c.latitude, 1e-9) && near(off.longitude, c.longitude, 1e-9), '地图组件有偏移时按其 boundingClientRect 扣掉');
    const dl = { southwest: { latitude: -10, longitude: 170 }, northeast: { latitude: 10, longitude: -170 } };
    const a = trajLayer.screenToMap(dl, rect, 300, 400), b = trajLayer.screenToMap(dl, rect, 100, 400);
    check(near(a.longitude, -175, 1e-9) && near(b.longitude, 175, 1e-9), `跨 ±180° 的视野：右半边 ${a.longitude}°、左半边 ${b.longitude}°`);
    const wp = trajLayer.toWaypoint(31.2304, 121.4737);
    const g = disp(wp);
    check(near(g.latitude, 31.2304, 1e-6) && near(g.longitude, 121.4737, 1e-6) && String(wp[0]).split('.')[1].length <= 6, `落点取整到 1e-6° 后画回去仍在原处：${JSON.stringify(wp)}`);
  }
  {
    // 三点仿射（iOS 原生换算那条路）：任意一张墨卡托地图 —— 中心、每弧度多少 px、转了多少度 —— 三个参考点定下后处处精确
    const mapOf = (lat0, lon0, s, rotDeg) => {
      const th = rotDeg * Math.PI / 180, cx = RECT.width / 2, cy = RECT.height / 2;
      return (x, y) => {
        const dx = x - cx, dy = cy - y;                                 // 屏幕 y 朝下，北朝上
        const X = lon0 * Math.PI / 180 + (Math.cos(th) * dx - Math.sin(th) * dy) / s;
        const Y = merc(lat0) + (Math.sin(th) * dx + Math.cos(th) * dy) / s;
        return { latitude: unmerc(Y), longitude: ((X * 180 / Math.PI + 180) % 360 + 360) % 360 - 180 };
      };
    };
    const refsOf = (f) => [[187.5, 406], [375, 406], [187.5, 812]].map((q) => Object.assign({ x: q[0], y: q[1] }, f(q[0], q[1])));
    const worstOf = (f) => {
      const proj = trajLayer.projectorOf(refsOf(f));
      if (!proj) return Infinity;
      let w = 0;
      for (let x = 0; x <= 375; x += 25) for (let y = 0; y <= 812; y += 29) {
        const a = proj(x, y), b = f(x, y);
        let dl = Math.abs(a.longitude - b.longitude); if (dl > 180) dl = 360 - dl;
        w = Math.max(w, Math.abs(a.latitude - b.latitude), dl);
      }
      return w;
    };
    const w1 = worstOf(mapOf(30, 118, 1300, 0)), w2 = worstOf(mapOf(52, 10, 900, 23)), w3 = worstOf(mapOf(-12, 179.6, 1500, 0));
    check(w1 < 1e-9 && w2 < 1e-9 && w3 < 1e-9, `三点仿射：北朝上 / 转了 23° / 跨 ±180° 三张图全屏最大误差 ${Math.max(w1, w2, w3).toExponential(1)}°`);
    const same = { latitude: 30, longitude: 118 };
    check(trajLayer.projectorOf([{ x: 0, y: 0, ...same }, { x: 10, y: 0, ...same }, { x: 0, y: 10, ...same }]) === null &&
      trajLayer.projectorOf([{ x: 0, y: 0, ...same }]) === null, '参考点缺 / 原生给回同一个点：不出换算（调用方退回 getRegion）');
  }

  console.log('\n== ＋航行：自动名、0 点不入库 ==');
  const P = newPage();
  P.onTrajNew(tap({ kind: 'sea' }));
  const d = P.data;
  const id1 = P._tjEdit && P._tjEdit.id;
  check(!!id1 && /^lt[a-z0-9]+$/.test(id1) && d.tjEdit && d.tjEdit.title === '航行轨迹「航行1」', `新建 ${id1}，横幅「${d.tjEdit && d.tjEdit.title}」「${d.tjEdit && d.tjEdit.sub}」`);
  check(idx().length === 0 && !d.showTrajPopup, '还没有航点：不入库、面板已收起');
  check(W.toasts.some((t) => /点地图/.test(t)), `进入描绘有一句操作提示：${W.toasts[W.toasts.length - 1]}`);
  P.onMapTouchStart({ touches: [touch(0, 100, 100)] });
  check(!P._longTapTimer, '描绘中不挂长按标点定时器');

  console.log('\n== 点地图逐点加 ==');
  const T1 = [31.2304, 121.4737], T2 = [31.30, 121.60], T3 = [31.40, 121.90];
  P.onMapTap(mapTap(T1[0], T1[1]));
  await tick(120);
  let row = idx().find((r) => r.id === id1);
  check(row && row.local === true && row.n === 1 && row.name === '航行1', `第一个航点落下即入库：${JSON.stringify(row && { n: row.n, local: row.local, name: row.name })}`);
  let pts = body(id1).pts;
  check(near(disp(pts[0]).latitude, T1[0], 1e-6) && near(disp(pts[0]).longitude, T1[1], 1e-6) && !near(pts[0][1], T1[0], 1e-4), `存的是 WGS-84 ${JSON.stringify(pts[0])}，偏回底图正落在点的位置`);
  check(P._tjShown.has(id1) && d.trajOn === 1, '入库即显示（勾上）');
  const mk0 = d.tjMarkers.find((m) => P._tjHits[m.id] && P._tjHits[m.id].i === 0 && !P._tjHits[m.id].head);
  check(mk0 && near(mk0.latitude, T1[0], 1e-6) && near(mk0.longitude, T1[1], 1e-6) && mk0.width === 20, '编辑中的航点画成手柄（点击框 20 px）');
  P.onMapTap(mapTap(T2[0], T2[1])); await tick(120);
  P.onMapTap(mapTap(T3[0], T3[1])); await tick(120);
  pts = body(id1).pts;
  const km = trajLayer.cumulative(pts)[2] / 1000;
  check(pts.length === 3 && d.tjEdit.sub === '3 点 · ' + trajLayer.fmtKm(km * 1000), `三个点：横幅「${d.tjEdit.sub}」`);
  check(d.tjLines.length === 1 && d.tjLines[0].points.length >= 3, `线已画出（${d.tjLines[0] && d.tjLines[0].points.length} 个显示点）`);

  console.log('\n== 同一下点击双报 / 点航点不落点 ==');
  P.onMapTap(mapTap(31.45, 122.0));
  P.onMapPoiTap(mapTap(31.4501, 122.0001));
  await tick(150);
  check(body(id1).pts.length === 4, `tap + poitap 同一下只落 1 个点（现 ${body(id1).pts.length} 点）`);
  P.tjUndo();
  check(body(id1).pts.length === 3, '「撤销」退掉刚才那一点');
  const hid = Object.keys(P._tjHits).find((k) => P._tjHits[k].i === 1 && P._tjHits[k].tid === id1);
  P.onMarkerTap({ markerId: Number(hid), detail: { markerId: Number(hid) } });
  P.onMapTap(mapTap(31.30, 121.60));                             // 有的机型点 marker 也报地图 tap
  await tick(150);
  check(body(id1).pts.length === 3 && d.tjEdit.sel === 1 && d.tjEdit.title === '第 2 / 3 点', `点航点 = 选中，不落点：横幅「${d.tjEdit.title}」「${d.tjEdit.sub}」`);
  const ring = d.tjMarkers.find((m) => m.width === 28);
  check(ring && near(ring.latitude, disp(pts[1]).latitude, 1e-9) && /ring-/.test(ring.iconPath), `选中的航点换成套圈：${ring && path.basename(ring.iconPath)}`);
  await tick(320);                                                 // 过了防抖窗，这一下是「挪过去」
  P.onMapTap(mapTap(31.35, 121.70)); await tick(120);
  pts = body(id1).pts;
  check(pts.length === 3 && near(disp(pts[1]).latitude, 31.35, 1e-6) && near(disp(pts[1]).longitude, 121.70, 1e-6) && d.tjEdit.sel === -1, '再点地图 = 把选中的航点挪过去，挪完即放开');
  P.tjUndo();
  pts = body(id1).pts;
  check(near(disp(pts[1]).latitude, T2[0], 1e-6) && near(disp(pts[1]).longitude, T2[1], 1e-6), '「撤销」把挪动退回原处');
  await tick(320);
  P.onMarkerTap({ markerId: 5000, detail: { markerId: 5000 } });   // 搜索标记（弹「删除标记」，这里答否）
  P.onMapTap(mapTap(31.5, 121.5)); await tick(150);
  check(body(id1).pts.length === 3, '描绘中点搜索标记：不落点');
  await tick(320);

  console.log('\n== 「手绘」按住拖动 ==');
  P.toggleTjFree();
  await tick(50);                                                  // 量尺寸 + 取视野两步异步（Windows 下计时器粒度约 15 ms）
  check(d.tjFree === true && typeof P._lastProj === 'function', '打开手绘：先备了一份屏幕点换算');
  const n0 = body(id1).pts.length;
  mapCtx.region = { southwest: { latitude: 31.0, longitude: 121.0 }, northeast: { latitude: 31.8, longitude: 121.9 } };
  P.onTjDrawStart({ touches: [touch(7, 100, 300)] });
  P.onTjDrawMove({ touches: [touch(7, 105, 300)] });               // 5 px：不落点
  P.onTjDrawMove({ touches: [touch(7, 120, 300)] });               // 20 px：落
  P.onTjDrawMove({ touches: [touch(7, 130, 300)] });               // 10 px：不落
  P.onTjDrawMove({ touches: [touch(7, 140, 300)] });               // 20 px：落
  P.onTjDrawMove({ touches: [touch(7, 140, 300), touch(8, 300, 600)] });   // 第二根手指落下：不影响这一笔
  P.onTjDrawMove({ touches: [touch(7, 150, 312)] });               // √(100+144) ≈ 15.6 px：落
  await tick(10);
  P.onTjDrawEnd({ changedTouches: [touch(8, 300, 600)] });         // 抬起的是后落的手指：这一笔还没完
  check(!!P._tjStroke, '抬起第二根手指不收笔');
  await tick(90);
  const markersMid = d.tjMarkers.length;
  const liveWant = trajLayer.densify([body(id1).pts[n0 - 1]].concat(P._tjStroke.wps)).length;   // 原末点到起笔处 0.66°，大圆加密补 1 点
  check(P._tjStroke.wps.length === 4 && d.tjLive.length === 1 && d.tjLive[0].points.length === liveWant && /^#FF6A4A/.test(d.tjLive[0].color) && d.tjLive[0].level === 'abovelabels',
    `手指按着：只重画这一笔（4 个航点接在原末点上，大圆加密后 ${d.tjLive[0] && d.tjLive[0].points.length} 个显示点，样式同整条）`);
  check(body(id1).pts.length === n0 && P._tjEditEntry().tr.pts.length === n0, '手指按着：这一笔不进航迹、不写存储');
  check(d.tjEdit.sub.indexOf((n0 + 4) + ' 点') === 0, `横幅连这一笔一起报：「${d.tjEdit.sub}」`);
  let threw = null;
  try { P._renderTrajs(); P._refreshTrajs(); } catch (err) { threw = err; }
  check(!threw && d.tjMarkers.length === markersMid, '划动中整层重画（换星、后台同步）安全：航点与几何缓存始终对得上');
  P.onTjDrawMove({ touches: [touch(7, 170, 312)] });               // 20 px：落
  P.onTjDrawEnd({ changedTouches: [touch(7, 170, 312)] });
  await tick(80);
  pts = body(id1).pts;
  const want = [[100, 300], [120, 300], [140, 300], [150, 312], [170, 312]].map((q) => {
    const ll = trajLayer.screenToMap(mapCtx.region, RECT, q[0], q[1]);
    return trajLayer.toWaypoint(ll.latitude, ll.longitude);
  });
  check(pts.length === n0 + 5 && want.every((w, i) => w[0] === pts[n0 + i][0] && w[1] === pts[n0 + i][1]), `一笔落 5 点（起笔 1 + 每满 14 px 1），坐标与屏幕点逐一对上；现 ${pts.length} 点`);
  check(!P._tjStroke && idx().find((r) => r.id === id1).n === n0 + 5 && d.tjLive.length === 0, '收笔：整笔并进航迹、落盘，临时那一截撤掉');
  const kmAll = trajLayer.cumulative(pts);
  check(d.tjEdit.sub === (n0 + 5) + ' 点 · ' + trajLayer.fmtKm(kmAll[kmAll.length - 1]), `收笔后横幅按整条重算：「${d.tjEdit.sub}」`);
  P.tjUndo();
  check(body(id1).pts.length === n0, '「撤销」整笔退回');
  P.onTjDrawStart({ touches: [touch(1, 200, 200)] });
  P.onTjDrawEnd({ changedTouches: [touch(1, 200, 200)] });
  await tick(20);
  check(body(id1).pts.length === n0 + 1, '手绘开着点一下 = 加一个点（起笔就落点）');
  P.onTjDrawStart({ touches: [touch(1, 10, 10), touch(2, 20, 20)] });
  check(!P._tjStroke, '两指同时按下不起笔');
  mapCtx.delay = 40;                                               // 视野取得慢：抬笔时还没回来
  P.onTjDrawStart({ touches: [touch(3, 50, 700)] });
  P.onTjDrawMove({ touches: [touch(3, 50, 670)] });
  P.onTjDrawEnd({ changedTouches: [touch(3, 50, 670)] });
  check(body(id1).pts.length === n0 + 1, '视野没回来之前不落点');
  await tick(80);
  check(body(id1).pts.length === n0 + 3 && !P._tjStroke, '视野回来后补落并收笔');
  mapCtx.delay = 2;
  P.toggleTjFree();
  check(d.tjFree === false, '关掉手绘');

  console.log('\n== 「航点」面板 ==');
  P.showTjEditPanel();
  const nNow = body(id1).pts.length;
  check(d.showTjEditPopup && d.tjSheet.n === nNow && d.tjSheet.rows.length === nNow && d.tjSheet.name === '航行1' && d.tjSheet.color === '', `面板：${d.tjSheet.n} 点，颜色「默认」`);
  P.onTjNameInput({ detail: { value: '  马尼拉—香港  ' } });
  P.hideTjEditPanel();
  check(idx().find((r) => r.id === id1).name === '马尼拉—香港' && d.tjEdit.title === '航行轨迹「马尼拉—香港」', '改名：收起面板时落，横幅跟着换');
  P.showTjEditPanel();
  P.onTjColor(tap({ c: '#2563EB' }));
  let b = body(id1);
  check(b.style.line === '#2563eb' && b.style.dot === '#2563eb' && b.style.icon === '#2563eb' && d.tjSheet.color === '#2563eb' && /^#2563EB/.test(d.tjLines[0].color), `改色：线 / 航点 / 图标一起换（线 ${d.tjLines[0].color}）`);
  P.onTjColor(tap({ c: '' }));
  b = body(id1);
  check(!b.style.line && /^#FF6A4A/.test(d.tjLines[0].color) && d.tjSheet.color === '', '「默认」回到航行出厂色');
  P.setData({ tjWpLat: '22.3', tjWpLon: '114.17' });
  P.onTjWpAdd();
  pts = body(id1).pts;
  check(pts.length === nNow + 1 && pts[nNow][0] === 114.17 && pts[nNow][1] === 22.3 && d.tjWpLat === '' && d.tjWpInto === 'tjwp' + nNow, '按经纬度加点：原值入库（手输就是 WGS-84，不再反偏），列表滚到末尾');
  P.setData({ tjWpLat: '95', tjWpLon: '114' });
  P.onTjWpAdd();
  check(body(id1).pts.length === nNow + 1 && /纬度/.test(W.toasts[W.toasts.length - 1]), '纬度越界：不加，提示范围');
  W.modalReply = () => ({ confirm: true, content: '22.25，114.2' });
  P.onTjWpEdit(tap({ i: nNow }));
  W.modalReply = null;
  pts = body(id1).pts;
  check(pts[nNow][1] === 22.25 && pts[nNow][0] === 114.2, '行上「改」：经纬度直接改（中文逗号也认）');
  P.onTjWpDel(tap({ i: 0 }));
  pts = body(id1).pts;
  check(pts.length === nNow && d.tjSheet.n === nNow && near(disp(pts[0]).latitude, T2[0], 1e-6), '行上「删」：第 1 点删掉，列表同步');
  P.onTjWpPick(tap({ i: 1 }));
  check(d.tjEdit.sel === 1 && !d.showTjEditPopup && mapCtx.moved && near(mapCtx.moved.latitude, disp(pts[1]).latitude, 1e-9), '点行 = 在图上选中、地图移过去');
  P.tjDelSel();
  check(body(id1).pts.length === nNow - 1 && d.tjEdit.sel === -1, '横幅「删除此点」');
  const keep = body(id1).pts.length;

  console.log('\n== 结束 / 空航迹丢弃 / 自动名 ==');
  P.tjEnd();
  check(d.tjEdit === null && !P._tjEdit && idx().length === 1 && idx()[0].n === keep, `结束：留下 ${keep} 点的「${idx()[0].name}」`);
  P.onTrajNew(tap({ kind: 'flight' }));
  check(d.tjEdit.title === '飞行轨迹「飞行2」', `自动名按总条数 + 1 起数（平台同规则）：${d.tjEdit.title}`);
  P.tjEnd();
  check(idx().length === 1, '一个点没落就结束：不留痕迹');
  P.onTrajNew(tap({ kind: 'sea' }));
  const id3 = P._tjEdit.id;
  P.onMapTap(mapTap(30, 122)); await tick(120);
  check(idx().length === 2, '落一个点入库');
  P.tjUndo();
  P.tjEnd();
  check(idx().length === 1 && !storage['satsimTraj_' + id3], '退空后结束：整条移除（本体一起删）');
  P.showTrajPanel();
  const r1 = d.trajRows.find((r) => r.id === id1);
  check(r1 && r1.local && !r1.editing && d.showTrajPopup, `面板行：本机标记 ${r1 && r1.local}，读数「${r1 && r1.sub}」`);
  P.hideTrajPanel();

  console.log('\n== 接着画平台发来的那条 ==');
  const pack = {
    kind: 'satsim-pack', from: '卫星仿真平台', items: [{
      type: 'traj', name: '平台航班', tid: 'mPLAT1', kind: 'flight', n: 2, n0: 9000,
      pts: [[120, 30], [125, 32]], style: { line: '#5ad1ff', dot: '#5ad1ff', icon: '#5ad1ff', w: 3, op: 0.9, dash: 'dash', dotPx: 0, iconOn: true, iconPx: 26 }
    }]
  };
  satsimPack.importTrajs(pack);
  P._takeFreshTrajs();
  const lenBefore = d.tjMarkers.length;
  P.onTrajEdit(tap({ id: 'mPLAT1' }));
  const handles = d.tjMarkers.filter((m) => P._tjHits[m.id] && P._tjHits[m.id].tid === 'mPLAT1' && !P._tjHits[m.id].head);
  check(P._tjEdit.id === 'mPLAT1' && handles.length === 2 && d.tjMarkers.length > lenBefore, `编辑平台航迹：样式关了圆点（dotPx 0），编辑时照样出 ${handles.length} 个手柄`);
  check(mapCtx.included && mapCtx.included.points.length > 2, '进入编辑把视野收到这条上');
  P.onMapTap(mapTap(33, 128)); await tick(120);
  const pr = idx().find((r) => r.id === 'mPLAT1');
  const pb = body('mPLAT1');
  check(pb.pts.length === 3 && pr.local === false && pr.from === '卫星仿真平台' && pr.n0 === 0 && pb.style.dash === 'dash' && pb.style.w === 3, '接着画：来源与样式保留，抽稀前点数（n0）不再报');
  P.onTjNameInput({ detail: { value: '改过名的航班' } });
  P.tjEnd();
  satsimPack.importTrajs({ kind: 'satsim-pack', from: '卫星仿真平台', items: [Object.assign({}, pack.items[0], { pts: [[120, 30], [126, 33]] })] });
  const pr2 = idx().find((r) => r.id === 'mPLAT1');
  check(body('mPLAT1').pts.length === 2 && pr2.name === '改过名的航班', '平台重发同一条：航点整条覆盖，手机上改的名字钉住');

  console.log('\n== 存不下 / 残行 / 隐藏即结束 ==');
  P.onTrajEdit(tap({ id: id1 }));
  const before = idx().find((r) => r.id === id1);
  W.failKey = 'satsimTraj_';
  const realErr = console.error;
  console.error = () => {};                                        // 页面自己会 console.error 一次，属预期
  P.onMapTap(mapTap(31.1, 121.3)); await tick(120);
  console.error = realErr;
  W.failKey = null;
  const after = idx().find((r) => r.id === id1);
  check(after.n === before.n && after.ts === before.ts && body(id1).pts.length === before.n && /存储空间不足/.test(W.toasts[W.toasts.length - 1]), '本体写不进去：索引退回原样，存储里仍是上一版，提示一句');
  P.onTrajToggle(tap({ id: id1 }));
  check(!P._tjEdit && d.tjEdit === null && !P._tjShown.has(id1), '藏起正在描绘的那条 = 结束描绘');
  storage.satsimTrajIds = storage.satsimTrajIds.concat([{ id: 'ltdead', name: '残行', kind: 'sea', n: 0, ts: 1 }]);
  storage.satsimTraj_ltdead = { kind: 'sea', pts: [], style: {} };
  const P2 = newPage();
  check(!idx().some((r) => r.id === 'ltdead') && !storage.satsimTraj_ltdead && P2.data.trajRows.length === 2, '进页清掉 0 点残行');

  console.log('\n== 航点多到不出手柄 / 套圈图标 ==');
  const many = [];
  for (let i = 0; i < 400; i++) many.push([110 + i * 0.05, 20 + Math.sin(i / 20)]);
  const tr = { id: 'big', name: '日志', kind: 'sea', pts: many, style: {} };
  const ov0 = trajLayer.buildOverlay([tr], { edit: { id: 'big', sel: -1 }, selIcon: () => 'ring.png', dotIcon: () => 'dot.png', vehicleIcon: () => 'v.png' });
  const ov1 = trajLayer.buildOverlay([tr], { edit: { id: 'big', sel: 5 }, selIcon: () => 'ring.png', dotIcon: () => 'dot.png', vehicleIcon: () => 'v.png' });
  check(ov0.markers.length === 1 && ov1.markers.length === 2 && ov1.markers[0].iconPath === 'ring.png' && ov1.hits[ov1.markers[0].id].i === 5, `400 点：不出手柄（${ov0.markers.length} 枚 = 航迹头），列表选中的那一点照样套圈`);
  const ringPath = tjIcon.ringIcon('#ff6a4a', 18, 28);
  const png = fs.readFileSync(ringPath);
  const sig = png.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const N = png.readUInt32BE(16);
  let off = 8, idat = null;
  while (off < png.length) { const len = png.readUInt32BE(off), type = png.toString('ascii', off + 4, off + 8); if (type === 'IDAT') idat = png.slice(off + 8, off + 8 + len); off += 12 + len; }
  const raw = zlib.inflateSync(idat);
  const px = (x, y) => { const o = y * (N * 4 + 1) + 1 + x * 4; return [raw[o], raw[o + 1], raw[o + 2], raw[o + 3]]; };
  const mid = px(N >> 1, N >> 1), edge = px(N >> 1, Math.round(N / 2 - 18 * 3 / 2 + 1.2)), corner = px(0, 0);
  check(sig && raw.length === (N * 4 + 1) * N && N === 84, `套圈 PNG 可解：${N}×${N}（3 倍屏 28 px）`);
  check(near(mid[0], 255, 2) && near(mid[1], 106, 2) && near(mid[2], 74, 2) && mid[3] === 255 && edge[0] < 60 && edge[3] > 180 && corner[3] === 0, `正中航迹色 rgb(${mid.slice(0, 3)})、外圈墨色 rgb(${edge.slice(0, 3)}) a${edge[3]}、四角透明`);

  console.log('\n== iOS：屏幕点换经纬度走地图原生换算 ==');
  {
    // 模拟一张墨卡托、北朝上的地图：中心 (30°N, 118°E)，每度经度 23 px（约 5 级，纬向跨 ~30°）。
    // fromScreenLocation 给精确值；getRegion 故意按「中心 ± 跨度一半」报两角 —— 与屏上所见在纬度上差出一截
    const C0 = { lat: 30, lon: 118 }, K = 23, RAD = 180 / Math.PI, H2 = RECT.height / 2, W2 = RECT.width / 2;
    const exact = (x, y) => ({ latitude: unmerc(merc(C0.lat) - (y - H2) / (K * RAD)), longitude: C0.lon + (x - W2) / K });
    const yOf = (lat) => H2 - (merc(lat) - merc(C0.lat)) * K * RAD;   // 纬度 → 屏上 y
    const N = exact(0, 0).latitude, S = exact(0, RECT.height).latitude;
    const skewed = {
      southwest: { latitude: C0.lat - (N - S) / 2, longitude: C0.lon - W2 / K },
      northeast: { latitude: C0.lat + (N - S) / 2, longitude: C0.lon + W2 / K }
    };
    const iosMap = Object.assign({}, mapCtx, {
      getRegion(o) { setTimeout(() => o.success(JSON.parse(JSON.stringify(skewed))), 2); },
      fromScreenLocation(o) { setTimeout(() => o.success(exact(o.x, o.y)), 2); }
    });
    const viaRegion = trajLayer.screenToMap(skewed, RECT, W2, H2);
    const offPx = Math.abs(yOf(viaRegion.latitude) - H2);
    check(offPx > 10, `对照：这样的两角按 getRegion 插值，屏幕正中的落点就偏开 ${offPx.toFixed(0)} px`);

    const P4 = newPage();
    P4._isIOS = true;
    P4.mapCtx = iosMap;
    P4.onTrajNew(tap({ kind: 'sea' }));
    const id4 = P4._tjEdit.id;
    P4.toggleTjFree();
    await tick(10);
    const Q = [[80, 200], [100, 200], [120, 210], [140, 230]];
    P4.onTjDrawStart({ touches: [touch(5, Q[0][0], Q[0][1])] });
    for (const q of Q.slice(1)) P4.onTjDrawMove({ touches: [touch(5, q[0], q[1])] });
    P4.onTjDrawEnd({ changedTouches: [touch(5, Q[3][0], Q[3][1])] });
    await tick(80);
    let got = body(id4) ? body(id4).pts : [];
    const wantI = Q.map((q) => { const ll = exact(q[0], q[1]); return trajLayer.toWaypoint(ll.latitude, ll.longitude); });
    const offI = got.length === Q.length ? Math.max(...got.map((p, i) => Math.abs(yOf(disp(p).latitude) - Q[i][1]))) : Infinity;
    check(got.length === Q.length && wantI.every((w, i) => near(w[0], got[i][0], 2e-6) && near(w[1], got[i][1], 2e-6)) && offI < 0.05,
      `iOS 手绘：${got.length} 个航点按原生换算落下，画回去离手指 ${offI.toFixed(3)} px`);

    P4.toggleTjFree();                                             // 关手绘，改点地图
    P4.onMapTouchStart({ touches: [touch(0, 250, 500)] });
    P4.onMapTouchEnd({});
    P4.onMapPoiTap({ detail: { name: '某地名', latitude: 10, longitude: 100 } });
    await tick(200);
    got = body(id4).pts;
    const e5 = exact(250, 500), w5 = trajLayer.toWaypoint(e5.latitude, e5.longitude);
    check(got.length === Q.length + 1 && near(got[Q.length][0], w5[0], 2e-6) && near(got[Q.length][1], w5[1], 2e-6),
      '点在地名上（poitap）：航点落在手指处，不吸到地名坐标上');
    P4._touchStartTime = Date.now() - 5000;
    P4.onMapPoiTap({ detail: { name: '某地名', latitude: 31.2, longitude: 121.5 } });
    await tick(200);
    got = body(id4).pts;
    const w6 = trajLayer.toWaypoint(31.2, 121.5);
    check(got.length === Q.length + 2 && got[Q.length + 1][0] === w6[0] && got[Q.length + 1][1] === w6[1], '按下的位置不可考（隔得太久）：退回地名坐标');
    P4.tjEnd();

    const nm0 = P4.data.searchMarkers.length;
    P4.handleMapLongTap(300, 600);
    await tick(80);
    const mk = P4.data.searchMarkers[nm0], e7 = exact(300, 600);
    check(mk && near(mk.latitude, e7.latitude, 1e-9) && near(mk.longitude, e7.longitude, 1e-9), `iOS 长按标点：标记落在手指处（${mk && mk.latitude.toFixed(4)}, ${mk && mk.longitude.toFixed(4)}）`);

    const fbWant = trajLayer.screenToMap(skewed, RECT, W2, H2);
    const noNative = Object.assign({}, iosMap);
    delete noNative.fromScreenLocation;
    P4.mapCtx = noNative;
    let fb = null;
    P4._tjScreenToMap(W2, H2, (ll) => { fb = ll; });
    await tick(80);
    check(fb && near(fb.latitude, fbWant.latitude, 1e-12), '老基础库没有 fromScreenLocation：退回 getRegion');
    P4.mapCtx = Object.assign({}, iosMap, { fromScreenLocation() {} });
    let late = null;
    P4._tjScreenToMap(W2, H2, (ll) => { late = ll; });
    await tick(800);
    check(late && near(late.latitude, fbWant.latitude, 1e-12), '原生换算迟迟不回：到点退回 getRegion，不把这一下挂住');
  }

  console.log('\n' + (fails ? `✗ ${fails} 项未通过` : '✓ 全部通过'));
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

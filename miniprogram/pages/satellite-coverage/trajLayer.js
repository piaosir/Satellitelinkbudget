// 航迹层（「卫星覆盖」页）：仿真平台发来的、手机上手绘的航行 / 飞行航迹 → map 组件的 polyline + markers。
//
// 纯函数、不碰 wx（图标路径、仰角由调用方注入）—— 验证台在 Node 里直接 require 跑。
// 手绘那一侧的换算（点地图 / 手指划过的屏幕点 → WGS-84 航点）也在这里：projectorOf / regionProjector、toWaypoint。
//
// 几何口径：
//   · 航点之间走【球面大圆】，按 GC_STEP_DEG 等角加密 —— 与平台 3D 航迹线同一条大圆。腾讯地图是 Web 墨卡托，
//     两点直连在图上是等角航线，跨洋航段与大圆能差出上千公里，故必须加密后再交给 polyline。
//   · 跨 ±180° 在接缝处切段：polyline 相邻两点按经度差直连，不切就横穿整张世界图。
//   · 显示坐标 WGS-84 → GCJ-02（只在中国境内）：腾讯地图国内底图是 GCJ-02，不偏的话港口 / 机场级缩放下航迹
//     整体偏出去几百米，与「显示当前位置」那个蓝点（wx.getLocation 取的就是 gcj02）也对不上。
//     读数（航点坐标、航程）一律报平台送来的 WGS-84 原值 —— 偏移只是为了画在对的地方。
//   · 航程 = 各段 WGS-84 测地线长之和（Vincenty 反算），与平台航迹运动学的读数口径同一。
//
// 样式口径（随件送来，见平台 shared/trajMiniExport.js 的 trajStyleOf）：
//   线色 / 线粗 / 透明度 / 实虚线、航点圆点（该数的一半作直径）、航迹头载具图标（边长 × 0.85，与平台 2D 同一条尺寸律）、
//   航迹名（字号 × 0.76）。线另加 1 px 同色相的深色描边：平台底图是深色，这边是浅色底图 / 卫星影像两种，
//   浅蓝的飞行航迹压在浅蓝的海面上几乎看不见，描边是让它在两种底上都立得住的最小代价。

const GC_STEP_DEG = 0.5;          // 大圆加密步长（与平台 2D 大圆加密同值）
const ID_BASE = 700000000;        // marker id 段（map 组件上限 9 位）：远离页面已用的 1~9999 各段
const DOT_CAP = 300;              // 单条航迹超过这么多航点就不画逐点圆点（导入的航行日志：点比线还密，只剩噪声）
// 整层 marker 上限。每枚带着读数气泡（callout）约 0.5 KB，一次 setData 过 400 KB 真机就开始掉帧、拖图发粘
const MARKER_CAP = 800;
const ICON_K = 0.85;              // 载具图标：平台 2D 的尺寸律（ST_ICON_K）
const FONT_K = 50 / 66;           // 航迹名：平台 MK_FONT_K
const DOT_MIN = 4;                // 圆点最小直径（px）：平台出厂 2 px，手机上就是一粒灰，给个下限
const DOT_BOX = 20;               // 圆点的点击框（px）：圆点本身很小，框大一圈手指才点得中
// 编辑中的那条：航点一律画成手柄（平台「调点」态的可拖拽圆环同一个意思 —— 看得见才点得中），
// 选中的那一个换成套圈大一号。样式里把圆点关掉（dotPx 0）的航迹，编辑时照样出手柄。
const EDIT_DOT = 9;
const SEL_D = 18, SEL_BOX = 28;

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const fin = (v) => typeof v === 'number' && isFinite(v);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---------------------------------------------------------------------------
// 大圆
// ---------------------------------------------------------------------------
function unit(lat, lon) {
  const p = lat * D2R, l = lon * D2R, c = Math.cos(p);
  return [c * Math.cos(l), c * Math.sin(l), Math.sin(p)];
}
function toLatLon(v) {
  return { lat: Math.atan2(v[2], Math.sqrt(v[0] * v[0] + v[1] * v[1])) * R2D, lon: Math.atan2(v[1], v[0]) * R2D };
}
/** 两点间球心角（弧度） */
function centralAngle(a, b) {
  const cx = a[1] * b[2] - a[2] * b[1], cy = a[2] * b[0] - a[0] * b[2], cz = a[0] * b[1] - a[1] * b[0];
  return Math.atan2(Math.sqrt(cx * cx + cy * cy + cz * cz), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
}
/** 大圆上 A→B 的 f 分点（球面线性插值）。A、B 重合时退回 A */
function gcInterp(latA, lonA, latB, lonB, f) {
  const a = unit(latA, lonA), b = unit(latB, lonB);
  const om = centralAngle(a, b);
  if (om < 1e-12) return { lat: latA, lon: lonA };
  const s = Math.sin(om), ka = Math.sin((1 - f) * om) / s, kb = Math.sin(f * om) / s;
  return toLatLon([ka * a[0] + kb * b[0], ka * a[1] + kb * b[1], ka * a[2] + kb * b[2]]);
}

/**
 * 航点 [[lon, lat]] → 大圆加密后的点列 [{lat, lon}]：每段按 ceil(θ/步长) 等角细分，首点保留、段间不重复端点。
 */
function densify(pts, stepDeg) {
  const step = (stepDeg || GC_STEP_DEG) * D2R;
  const out = [];
  if (!pts || !pts.length) return out;
  out.push({ lat: pts[0][1], lon: pts[0][0] });
  for (let i = 1; i < pts.length; i++) {
    const A = pts[i - 1], B = pts[i];
    const om = centralAngle(unit(A[1], A[0]), unit(B[1], B[0]));
    const n = Math.max(1, Math.ceil(om / step));
    for (let k = 1; k < n; k++) out.push(gcInterp(A[1], A[0], B[1], B[0], k / n));
    out.push({ lat: B[1], lon: B[0] });
  }
  return out;
}

/** 末段在航迹头处的真方位（度，正北起顺时针）：大圆 prev→last 在 last 处的切向。墨卡托保角，图上即此角 */
function headBearing(pts) {
  if (!pts || pts.length < 2) return 0;
  let j = pts.length - 2;
  const L = pts[pts.length - 1];
  while (j >= 0 && Math.abs(pts[j][0] - L[0]) < 1e-12 && Math.abs(pts[j][1] - L[1]) < 1e-12) j--;   // 末尾重复点跳过
  if (j < 0) return 0;
  const P = pts[j];
  // last 处指向 prev 的方位 + 180°
  const p1 = L[1] * D2R, p2 = P[1] * D2R, dl = (P[0] - L[0]) * D2R;
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  const back = Math.atan2(y, x) * R2D;
  return ((back + 180) % 360 + 360) % 360;
}

// ---------------------------------------------------------------------------
// WGS-84 → GCJ-02（国测局加偏的公开近似式）。境内判定用分块矩形（含港澳、海南，剔台湾与越北、
// 蒙古、俄远东、朝鲜半岛北缘这些落在粗矩形里的邻国）——只用一个大矩形会把首尔、平壤、河内也偏几百米。
// ---------------------------------------------------------------------------
const CN_IN = [
  [49.2204, 79.4462, 42.8899, 96.3304], [54.1415, 109.6872, 39.3742, 135.0002],
  [42.8899, 73.1246, 29.5297, 124.1433], [29.5297, 82.9684, 26.7186, 97.0352],
  [29.5297, 97.0253, 20.4141, 124.3674], [20.4141, 107.9758, 17.8715, 111.7441]
];
const CN_OUT = [
  [25.3986, 119.9213, 21.785, 122.4976], [22.284, 101.8652, 20.0988, 106.665],
  [21.5422, 106.4525, 20.4878, 108.051], [55.8175, 109.0323, 50.3257, 119.127],
  [55.8175, 127.4568, 49.5574, 137.0227], [44.8922, 131.2662, 42.5692, 137.0227]
];
const inBox = (b, lat, lon) => lat <= b[0] && lat >= b[2] && lon >= b[1] && lon <= b[3];
function inChina(lat, lon) {
  if (!CN_IN.some((b) => inBox(b, lat, lon))) return false;
  return !CN_OUT.some((b) => inBox(b, lat, lon));
}
const GA = 6378245.0, GEE = 0.00669342162296594323;
function tLat(x, y) {
  let r = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
  r += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
  r += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320.0 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
  return r;
}
function tLon(x, y) {
  let r = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
  r += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
  r += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
  return r;
}
/** WGS-84 → GCJ-02；境外原样返回 */
function wgs2gcj(lat, lon) {
  if (!inChina(lat, lon)) return { latitude: lat, longitude: lon };
  let dLat = tLat(lon - 105.0, lat - 35.0), dLon = tLon(lon - 105.0, lat - 35.0);
  const rad = lat / 180.0 * Math.PI;
  let m = Math.sin(rad);
  m = 1 - GEE * m * m;
  const sm = Math.sqrt(m);
  dLat = (dLat * 180.0) / ((GA * (1 - GEE)) / (m * sm) * Math.PI);
  dLon = (dLon * 180.0) / (GA / sm * Math.cos(rad) * Math.PI);
  return { latitude: lat + dLat, longitude: lon + dLon };
}
/**
 * GCJ-02 → WGS-84：wgs2gcj 的数值反解（不动点迭代，偏移量随位置变化极缓，三四步即到 1e-9°）。
 * 手绘航迹用：点地图拿到的是底图坐标（国内 GCJ-02），航迹一律按 WGS-84 存 —— 与平台发来的同一个口径，
 * 画回去时再经 wgs2gcj 偏回原处。境外原样返回。
 */
function gcj2wgs(lat, lon) {
  if (!inChina(lat, lon)) return { latitude: lat, longitude: lon };
  let wLat = lat, wLon = lon;
  for (let i = 0; i < 12; i++) {
    const g = wgs2gcj(wLat, wLon);
    const eLat = g.latitude - lat, eLon = g.longitude - lon;
    wLat -= eLat; wLon -= eLon;
    if (Math.abs(eLat) < 1e-9 && Math.abs(eLon) < 1e-9) break;
  }
  return { latitude: wLat, longitude: wLon };
}

// ---------------------------------------------------------------------------
// 屏幕点 → 底图坐标（手绘、长按标点用）。两条路，页面按平台挑（satellite-coverage.js 的 _mapProjector）：
//   · projectorOf：地图原生 fromScreenLocation 换出的三个参考点定仿射 —— iOS 走这条。iOS 上按 getRegion
//     两角插值，落点与手指对不上（该端报的两角与屏上所见并不严格对应，缩得越小偏得越多）；原生换算不经 region。
//   · regionProjector / screenToMap：getRegion 的两角即屏幕两角，经度线性、纬度按 Web 墨卡托 —— 其它平台走这条。
//     前提是地图北朝上不转（wxml 的 enable-rotate 与 setting.enableRotate 都关着）。补了跨 ±180° 的视野（西南角经度 > 东北角）。
// ---------------------------------------------------------------------------
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + clamp(lat, -85.05113, 85.05113) * D2R / 2));
const unMercY = (y) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * R2D;
const wrapLon = (lon) => ((lon + 180) % 360 + 360) % 360 - 180;
/**
 * @param {object} region  mapCtx.getRegion 的结果 { southwest, northeast }
 * @param {object} rect    地图组件的 boundingClientRect { left, top, width, height }
 * @returns {{latitude:number, longitude:number}|null}  底图坐标（国内 GCJ-02）
 */
function screenToMap(region, rect, clientX, clientY) {
  const sw = region && region.southwest, ne = region && region.northeast;
  if (!sw || !ne || !rect || !(rect.width > 0) || !(rect.height > 0)) return null;
  const fx = (clientX - rect.left) / rect.width, fy = (clientY - rect.top) / rect.height;
  let span = ne.longitude - sw.longitude;
  if (span <= 0) span += 360;
  const lon = wrapLon(sw.longitude + fx * span);
  const yN = mercY(ne.latitude), yS = mercY(sw.latitude);
  const lat = unMercY(yN - fy * (yN - yS));
  return fin(lat) && fin(lon) ? { latitude: lat, longitude: lon } : null;
}
/** getRegion 两角 + 地图矩形 → 换算函数 (clientX, clientY) → 底图坐标（与 projectorOf 同形）；视野无效给 null */
function regionProjector(region, rect) {
  if (!rect || !screenToMap(region, rect, rect.left, rect.top)) return null;
  return (x, y) => screenToMap(region, rect, x, y);
}

/**
 * 三个参考点 → 换算函数 (x, y) → 底图坐标 { latitude, longitude } | null。
 * 参考点取自地图原生换算（mapCtx.fromScreenLocation）：屏幕与 Web 墨卡托平面（经度, mercY）之间只差
 * 平移 + 缩放 + 旋转，三点定下的仿射处处精确 —— 不看 getRegion 怎么报视野，地图万一转了也照样对。
 * @param {Array} refs  [{ x, y, latitude, longitude }] × 3：x / y 与之后换算的屏幕点同一坐标系，三点不共线
 * @returns {function|null}  参考点缺失 / 退化（共线、原生给回同一个点）时 null —— 调用方退回 regionProjector
 */
function projectorOf(refs) {
  const a = refs && refs[0], b = refs && refs[1], c = refs && refs[2];
  const ok = (r) => r && fin(r.x) && fin(r.y) && fin(r.latitude) && fin(r.longitude);
  if (!ok(a) || !ok(b) || !ok(c)) return null;
  const near = (lon) => lon - 360 * Math.round((lon - a.longitude) / 360);   // 就近展开到 a 那侧（参考点跨在 ±180° 接缝两边时）
  const X0 = a.longitude, X1 = near(b.longitude), X2 = near(c.longitude);
  const Y0 = mercY(a.latitude), Y1 = mercY(b.latitude), Y2 = mercY(c.latitude);
  const dx1 = b.x - a.x, dy1 = b.y - a.y, dx2 = c.x - a.x, dy2 = c.y - a.y;
  const det = dx1 * dy2 - dx2 * dy1;
  if (!(Math.abs(det) > 1e-6)) return null;
  if (!(Math.abs((X1 - X0) * (Y2 - Y0) - (X2 - X0) * (Y1 - Y0)) > 1e-15)) return null;
  return (x, y) => {
    const ex = x - a.x, ey = y - a.y;
    const u = (ex * dy2 - ey * dx2) / det, v = (dx1 * ey - dy1 * ex) / det;
    const lat = unMercY(Y0 + u * (Y1 - Y0) + v * (Y2 - Y0));
    const lon = wrapLon(X0 + u * (X1 - X0) + v * (X2 - X0));
    return fin(lat) && fin(lon) ? { latitude: lat, longitude: lon } : null;
  };
}

/** WGS-84 经纬度 → 航点 [lon, lat]（经度折回 ±180，1e-6° ≈ 0.11 m —— 平台发送时同一个取整）。手输坐标走这个 */
const r6 = (v) => Math.round(v * 1e6) / 1e6;
function waypointOf(lat, lon) {
  return [r6(((lon + 180) % 360 + 360) % 360 - 180), r6(clamp(lat, -90, 90))];
}
/** 点地图 / 手指划过的落点：底图坐标（国内 GCJ-02）→ 航点（WGS-84） */
function toWaypoint(mapLat, mapLon) {
  const w = gcj2wgs(mapLat, mapLon);
  return waypointOf(w.latitude, w.longitude);
}

// ---------------------------------------------------------------------------
// 跨 ±180° 切段（显示点 {latitude, longitude}）：相邻两点经度差 > 180° 即跨了接缝，
// 在接缝上补一对端点（纬度线性插值 —— 加密后相邻点只差 0.5°，线性足够）后断开。
// 接缝取 ±179.99999 而不是 ±180：恰好 ±180 的点在个别机型上会被折到另一侧。
// ---------------------------------------------------------------------------
const SEAM = 179.99999;
function splitSeam(points) {
  const segs = [];
  if (!points || points.length < 2) return segs;
  let cur = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const d = b.longitude - a.longitude;
    if (Math.abs(d) > 180) {
      const east = a.longitude > 0;                                 // 从东半球越过去（+180 → −180）
      const bl = east ? b.longitude + 360 : b.longitude - 360;
      const edge = east ? 180 : -180;
      const t = (edge - a.longitude) / (bl - a.longitude);
      const lat = a.latitude + t * (b.latitude - a.latitude);
      cur.push({ latitude: lat, longitude: east ? SEAM : -SEAM });
      if (cur.length >= 2) segs.push(cur);
      cur = [{ latitude: lat, longitude: east ? -SEAM : SEAM }];
    }
    cur.push(b);
  }
  if (cur.length >= 2) segs.push(cur);
  return segs;
}

// ---------------------------------------------------------------------------
// WGS-84 测地线长（Vincenty 反算，m）。近对跖不收敛时退回平均半径球面距离（航迹里不会有这种段）。
// ---------------------------------------------------------------------------
const WA = 6378137, WB = 6356752.3142, WF = (WA - WB) / WA;
function geodesicM(lat1, lon1, lat2, lon2) {
  let L = (lon2 - lon1) * D2R;
  L -= 2 * Math.PI * Math.round(L / (2 * Math.PI));
  const U1 = Math.atan((1 - WF) * Math.tan(lat1 * D2R)), U2 = Math.atan((1 - WF) * Math.tan(lat2 * D2R));
  const sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2);
  let lam = L, prev, it = 0, sinS, cosS, sig, cos2a, c2sm;
  do {
    const sl = Math.sin(lam), cl = Math.cos(lam);
    const t1 = cU2 * sl, t2 = cU1 * sU2 - sU1 * cU2 * cl;
    sinS = Math.sqrt(t1 * t1 + t2 * t2);
    if (sinS === 0) return 0;                                        // 重合
    cosS = sU1 * sU2 + cU1 * cU2 * cl;
    sig = Math.atan2(sinS, cosS);
    const sinA = cU1 * cU2 * sl / sinS;
    cos2a = 1 - sinA * sinA;
    c2sm = cos2a !== 0 ? cosS - 2 * sU1 * sU2 / cos2a : 0;
    const C = WF / 16 * cos2a * (4 + WF * (4 - 3 * cos2a));
    prev = lam;
    lam = L + (1 - C) * WF * sinA * (sig + C * sinS * (c2sm + C * cosS * (-1 + 2 * c2sm * c2sm)));
    if (Math.abs(lam) > Math.PI) { it = 1000; break; }
  } while (Math.abs(lam - prev) > 1e-12 && ++it < 200);
  if (it >= 200) return centralAngle(unit(lat1, lon1), unit(lat2, lon2)) * 6371008.8;
  const u2 = cos2a * (WA * WA - WB * WB) / (WB * WB);
  const A = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
  const B = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const dS = B * sinS * (c2sm + B / 4 * (cosS * (-1 + 2 * c2sm * c2sm) - B / 6 * c2sm * (-3 + 4 * sinS * sinS) * (-3 + 4 * c2sm * c2sm)));
  return WB * A * (sig - dS);
}
/** 逐航点累计航程（m），[0] = 0 */
function cumulative(pts) {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + geodesicM(pts[i - 1][1], pts[i - 1][0], pts[i][1], pts[i][0]));
  return out;
}

// ---------------------------------------------------------------------------
// 读数格式
// ---------------------------------------------------------------------------
const fmtLat = (v) => Math.abs(v).toFixed(4) + '°' + (v >= 0 ? 'N' : 'S');
const fmtLon = (v) => Math.abs(v).toFixed(4) + '°' + (v >= 0 ? 'E' : 'W');
const fmtLL = (lat, lon) => fmtLat(lat) + ', ' + fmtLon(lon);
function fmtKm(m) {
  const km = m / 1000;
  if (!fin(km)) return '—';
  if (km < 10) return km.toFixed(2) + ' km';
  if (km < 1000) return km.toFixed(1) + ' km';
  return String(Math.round(km)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' km';
}
const kindLabel = (k) => (k === 'flight' ? '飞行' : '航行');

// ---------------------------------------------------------------------------
// 样式 → map 属性
// ---------------------------------------------------------------------------
function hex6(c, fb) { const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '')); return (m ? m[1] : fb).toUpperCase(); }
const aHex = (a) => Math.round(clamp(a, 0, 1) * 255).toString(16).padStart(2, '0').toUpperCase();
// 描边：同色相压暗（混 55% 黑）—— 保住「这是哪条航迹」的颜色身份，只加一圈轮廓
function darker(h6) {
  const n = parseInt(h6, 16), k = 0.45;
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.round(x * k).toString(16).padStart(2, '0'));
  return c.join('').toUpperCase();
}
function isLight(h6) {
  const n = parseInt(h6, 16);
  const lin = (x) => { const s = x / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255) > 0.35;
}
function styleOf(tr) {
  const s = (tr && tr.style) || {};
  const fl = tr && tr.kind === 'flight';
  const num = (v, d, lo, hi) => { const n = Number(v); return fin(n) ? clamp(n, lo, hi) : d; };
  return {
    line: hex6(s.line, fl ? '5ad1ff' : 'ff6a4a'),
    dot: hex6(s.dot || s.line, fl ? '5ad1ff' : 'ff9a5a'),
    icon: hex6(s.icon || s.line, fl ? '5ad1ff' : 'ff6a4a'),
    w: num(s.w, 2.2, 0.1, 8),
    op: num(s.op, 0.95, 0.05, 1),
    dash: s.dash && s.dash !== 'solid',
    dotPx: num(s.dotPx, 4, 0, 60),
    iconOn: s.iconOn !== false,
    iconPx: num(s.iconPx, 26, 1, 60),
    nameOn: !!s.nameOn,
    nameFont: num(s.nameFont, 13, 1, 32),
    nameColor: hex6(s.nameColor, 'ffffff')
  };
}

// 线的 map 属性（整层与划动中那一截同一套：颜色 + 透明度、线粗、虚实、同色相深描边、压在地名之上）
function lineStyle(st) {
  return {
    color: '#' + st.line + aHex(st.op),
    width: Math.round(clamp(st.w, 1, 8) * 10) / 10,
    dottedLine: !!st.dash,
    arrowLine: false,
    borderColor: '#' + darker(st.line) + aHex(st.op * 0.9),
    borderWidth: 1,
    level: 'abovelabels'
  };
}

// 安卓的 marker label textAlign:'center' 不生效，按字宽估算手动居中（与页面 _buildCenteredLabel 同口径）
function textW(s, fs) {
  let w = 0;
  for (let i = 0; i < s.length; i++) w += s.charCodeAt(i) > 127 ? fs : fs * 0.61;
  return w;
}

// ---------------------------------------------------------------------------
// 几何（与样式、当前卫星无关的那一半）：按航迹缓存，换卫星 / 开关别的航迹都不重算
// ---------------------------------------------------------------------------
function geometryOf(tr) {
  const pts = (tr && Array.isArray(tr.pts)) ? tr.pts : [];
  const dense = pts.length >= 2 ? densify(pts) : [];
  const disp = dense.map((p) => wgs2gcj(p.lat, p.lon));
  return {
    segs: splitSeam(disp),
    wp: pts.map((p) => wgs2gcj(p[1], p[0])),                         // 航点的显示位置（与线同一套偏移）
    cum: cumulative(pts),
    bearing: headBearing(pts),
    fit: disp.length ? disp : pts.map((p) => wgs2gcj(p[1], p[0]))    // 「定位」用
  };
}

/**
 * 整层航迹 → { lines, markers, hits }。
 * @param {Array} list  [{ id, name, kind, pts:[[lon,lat]], style, n0?, cruiseAltM? }]（显示中的那几条，按列表次序）
 * @param {object} opt
 *   geo(tr)                    取几何（调用方缓存 geometryOf 的结果；不给就现算）
 *   vehicleIcon(shape, color, box) / dotIcon(color, d, box)  图标路径（'' = 画不出来，退回透明占位）
 *   blank                      透明占位图路径
 *   elevOf(lat, lon)           当前卫星在该点的仰角（度），不给就不写仰角
 *   isAndroid
 *   edit { id, sel }           正在编辑的那条（航点画成手柄）与选中的航点下标（-1 = 没选）
 *   selIcon(color, d, box)     选中航点的套圈图标路径
 */
function buildOverlay(list, opt) {
  const o = opt || {};
  const lines = [], markers = [], hits = {};
  let id = ID_BASE;
  const geo = o.geo || geometryOf;
  const elevTxt = (lat, lon) => {
    if (!o.elevOf) return '';
    const e = o.elevOf(lat, lon);
    return fin(e) ? '\n仰角: ' + (e > 0 ? e.toFixed(1) + '°' : '不可见') : '';
  };
  const callout = (content) => ({
    content: content, color: '#1F2937', fontSize: 11, borderRadius: 4, borderWidth: 1, borderColor: '#E5E7EB',
    bgColor: '#FFFFFF', padding: 6, display: 'BYCLICK', textAlign: 'left'
  });

  for (const tr of (Array.isArray(list) ? list : [])) {
    const pts = (tr && Array.isArray(tr.pts)) ? tr.pts : [];
    if (!pts.length) continue;
    const st = styleOf(tr);
    const g = geo(tr);

    // —— 线（逐段；★ 排在覆盖等值线之后，level 压在地名之上：与平台「航迹整层在地名之上」同一个制图分工）——
    const ls = lineStyle(st);
    for (const seg of g.segs) lines.push(Object.assign({ points: seg }, ls));

    const n = pts.length;
    const total = g.cum[n - 1] || 0;
    const nameOf = String(tr.name || (tr.kind === 'flight' ? '飞行航迹' : '航行航迹'));
    const L = pts[n - 1];
    const headInfo = nameOf + '\n' + kindLabel(tr.kind) + ' · ' + (tr.n0 > n ? tr.n0 : n) + ' 点 · ' + fmtKm(total) +
      '\n' + fmtLL(L[1], L[0]) + (tr.kind === 'flight' && Number(tr.cruiseAltM) > 0 ? '\n巡航高度 ' + Math.round(Number(tr.cruiseAltM)) + ' m' : '') +
      elevTxt(L[1], L[0]);

    // 航迹名（锚在航迹头上方，让开图标那一截）
    const nameLabel = (box) => {
      const fs = Math.round(clamp(st.nameFont * FONT_K, 9, 18));
      const pad = 3;
      const lab = {
        content: nameOf, color: '#' + st.nameColor, fontSize: fs,
        // 名字底衬：浅色字配深底、深色字配浅底 —— 平台是深色底图上的白字，这边底图浅深两种都有
        bgColor: isLight(st.nameColor) ? '#0B121CB3' : '#FFFFFFD9',
        padding: pad, borderRadius: 3, textAlign: 'center',
        anchorX: 0, anchorY: -Math.round(box / 2 + fs + pad * 2 + 3)
      };
      if (o.isAndroid) lab.anchorX = -Math.round(textW(nameOf, fs) / 2 + pad);
      return lab;
    };

    // —— 航点圆点（航点太多的日志型航迹不画：点比线还密，只剩噪声，也拖慢真机）——
    const editing = !!(o.edit && o.edit.id === tr.id);
    const sel = editing && Number.isInteger(o.edit.sel) ? o.edit.sel : -1;
    const dotD = editing ? Math.max(EDIT_DOT, st.dotPx / 2) : (st.dotPx > 0 ? Math.max(DOT_MIN, st.dotPx / 2) : 0);
    const dots = dotD > 0 && n <= DOT_CAP && markers.length + n < MARKER_CAP;
    if (dots) {
      const icon = o.dotIcon ? o.dotIcon('#' + st.dot, dotD, DOT_BOX) : '';
      const selIcon = sel >= 0 && o.selIcon ? o.selIcon('#' + st.dot, SEL_D, SEL_BOX) : '';
      for (let i = 0; i < n; i++) {
        // 没有载具图标时，末航点这一枚兼任航迹头：点它出整条航迹的读数，航迹名也挂在它上面
        const isHead = i === n - 1 && !st.iconOn;
        const isSel = i === sel;
        const box = isSel ? SEL_BOX : DOT_BOX;
        const p = pts[i];
        const m = {
          id: id, latitude: g.wp[i].latitude, longitude: g.wp[i].longitude,
          iconPath: (isSel ? selIcon : icon) || icon || o.blank || '', width: box, height: box, anchor: { x: 0.5, y: 0.5 },
          alpha: isSel ? 1 : st.op, zIndex: isSel ? 80 : (isHead ? 70 : 60),
          callout: callout(isHead ? headInfo : (nameOf + ' · ' + (i + 1) + '/' + n + '\n' + fmtLL(p[1], p[0]) + '\n距起点 ' + fmtKm(g.cum[i]) + elevTxt(p[1], p[0])))
        };
        if (isHead && st.nameOn) m.label = nameLabel(box);
        markers.push(m);
        hits[id] = { tid: tr.id, i: i, head: isHead };
        id++;
      }
    } else if (sel >= 0 && sel < n && markers.length < MARKER_CAP) {
      // 航点多到不出手柄的那条：从「航点」列表里选中的那一个照样套圈 —— 看得见要挪的是哪一点
      const p = pts[sel];
      markers.push({
        id: id, latitude: g.wp[sel].latitude, longitude: g.wp[sel].longitude,
        iconPath: (o.selIcon ? o.selIcon('#' + st.dot, SEL_D, SEL_BOX) : '') || o.blank || '',
        width: SEL_BOX, height: SEL_BOX, anchor: { x: 0.5, y: 0.5 }, alpha: 1, zIndex: 80,
        callout: callout(nameOf + ' · ' + (sel + 1) + '/' + n + '\n' + fmtLL(p[1], p[0]) + '\n距起点 ' + fmtKm(g.cum[sel]) + elevTxt(p[1], p[0]))
      });
      hits[id] = { tid: tr.id, i: sel, head: false };
      id++;
    }

    // —— 航迹头：载具图标（船首 / 机头顺着末段大圆走向）。不画图标也不画圆点时，放一枚透明占位承接点击与航迹名 ——
    if ((st.iconOn || !dots) && markers.length < MARKER_CAP) {
      const box = st.iconOn ? Math.round(clamp(st.iconPx * ICON_K, 8, 60)) : DOT_BOX;
      const icon = st.iconOn && o.vehicleIcon ? o.vehicleIcon(tr.kind === 'flight' ? 'plane' : 'ship', '#' + st.icon, box) : '';
      const m = {
        id: id, latitude: g.wp[n - 1].latitude, longitude: g.wp[n - 1].longitude,
        iconPath: icon || o.blank || '', width: box, height: box, anchor: { x: 0.5, y: 0.5 },
        rotate: st.iconOn ? Math.round(g.bearing * 10) / 10 : 0,
        alpha: st.op, zIndex: 70,
        callout: callout(headInfo)
      };
      if (st.nameOn) m.label = nameLabel(box);
      markers.push(m);
      hits[id] = { tid: tr.id, i: n - 1, head: true };
      id++;
    }
  }
  return { lines: lines, markers: markers, hits: hits };
}

/**
 * 手绘划动中的那一截 → polyline（接在航迹原末点上，样式同整条）。
 * 手指按着的时候只算、只送这一截：整条航迹的几何（大圆加密 + 偏移 + 逐段测地线）与整层 marker 等收笔再重出 ——
 * 否则每划 14 px 就把整条航迹重算一遍、整层 setData 一遍，iOS 上（小程序逻辑层无 JIT）几百点就跟不上手。
 * @param {object} tr   航迹（pts 为起笔前已有的航点）
 * @param {Array}  wps  这一笔落下的航点 [[lon, lat]]
 */
function strokeLines(tr, wps) {
  const head = tr && tr.pts && tr.pts.length ? [tr.pts[tr.pts.length - 1]] : [];
  const pts = head.concat(wps || []);
  if (pts.length < 2) return [];
  const ls = lineStyle(styleOf(tr));
  return splitSeam(densify(pts).map((p) => wgs2gcj(p.lat, p.lon))).map((seg) => Object.assign({ points: seg }, ls));
}

/** 「定位」用的点：给 includePoints 的点数压到 200 以内（等步长取样，首末保留） */
function fitPoints(geos) {
  const all = [];
  for (const g of geos) for (const p of (g && g.fit) || []) all.push(p);
  if (all.length <= 200) return all;
  const step = (all.length - 1) / 199;
  return Array.from({ length: 200 }, (_, i) => all[Math.round(i * step)]);
}

module.exports = {
  GC_STEP_DEG: GC_STEP_DEG,
  ID_BASE: ID_BASE,
  DOT_CAP: DOT_CAP,
  densify: densify,
  gcInterp: gcInterp,
  headBearing: headBearing,
  wgs2gcj: wgs2gcj,
  gcj2wgs: gcj2wgs,
  inChina: inChina,
  screenToMap: screenToMap,
  regionProjector: regionProjector,
  projectorOf: projectorOf,
  waypointOf: waypointOf,
  toWaypoint: toWaypoint,
  splitSeam: splitSeam,
  geodesicM: geodesicM,
  cumulative: cumulative,
  fmtKm: fmtKm,
  fmtLL: fmtLL,
  styleOf: styleOf,
  geometryOf: geometryOf,
  buildOverlay: buildOverlay,
  strokeLines: strokeLines,
  fitPoints: fitPoints
};

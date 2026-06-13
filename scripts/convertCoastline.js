/**
 * 海岸线 + 国界 轮廓数据转换脚本
 *
 * 输入: world-atlas countries-50m.json (Natural Earth 1:50m, TopoJSON, 公有领域)
 *   下载: https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json
 *   每个国家为独立多边形，相邻国家共享的弧段即国界线；解码全部弧段
 *   即同时得到海岸线 + 所有国界，且共享边界只画一次、无重复。
 *   (如只要海岸线/陆地轮廓，可改用 land-50m.json，脚本逻辑通用。)
 *
 * 输出: miniprogram/pages/isl-visual/coastline.js
 *   module.exports = [[lon,lat,lon,lat,...], ...]  每条折线为扁平经纬度(度)
 *
 * 做法: 直接解码 TopoJSON 的 arcs（弧段），每段输出一条折线。
 *   相邻多边形共享的边界弧只存一次，比按环(ring)导出更紧凑且无重复描边。
 *   再用 Douglas-Peucker 简化(容差 TOL 度)，在保留 50m 形状细节的同时
 *   把点数压到约一半，兼顾真机自动旋转时的绘制性能。
 *   坐标四舍五入到 2 位小数(~1km)，并剔除舍入后的连续重复点。
 *
 * 使用: node scripts/convertCoastline.js [输入json] [容差度=0.05]
 */

const fs = require('fs');
const path = require('path');

const INPUT = process.argv[2] || 'C:\\tmp\\countries-50m.json';
const TOL = parseFloat(process.argv[3]) || 0.2; // Douglas-Peucker 容差(度)，小地球视图下 0.2 形状足够且文件轻量
const OUTPUT = process.argv[4] || path.join(__dirname, '..', 'miniprogram', 'pages', 'isl-visual', 'coastline.js');
const LEVEL = process.argv[5] || '50m'; // 仅用于输出文件头注释标注数据档位

const topo = JSON.parse(fs.readFileSync(INPUT, 'utf-8'));
const { scale, translate } = topo.transform;

// Douglas-Peucker 简化：pts 为 [[lon,lat],...]，容差 tol(度)
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0, idx = -1;
    const ax = pts[s][0], ay = pts[s][1], bx = pts[e][0], by = pts[e][1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    for (let i = s + 1; i < e; i++) {
      const px = pts[i][0], py = pts[i][1];
      let d;
      if (len2 === 0) {
        d = Math.hypot(px - ax, py - ay);
      } else {
        const t = ((px - ax) * dx + (py - ay) * dy) / len2;
        const tc = t < 0 ? 0 : t > 1 ? 1 : t;
        d = Math.hypot(px - (ax + tc * dx), py - (ay + tc * dy));
      }
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > -1) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

// 解码每条 arc：delta 编码 + 量化反变换 → 经纬度(度)
function decodeArc(arc) {
  let x = 0, y = 0;
  const out = [];
  for (let i = 0; i < arc.length; i++) {
    x += arc[i][0];
    y += arc[i][1];
    const lon = x * scale[0] + translate[0];
    const lat = y * scale[1] + translate[1];
    out.push([+lon.toFixed(2), +lat.toFixed(2)]);
  }
  return out;
}

const polylines = [];
let rawPts = 0, keptPts = 0;

for (const arc of topo.arcs) {
  rawPts += arc.length;
  const coords = simplify(decodeArc(arc), TOL);
  // 剔除舍入后的连续重复点
  const flat = [];
  let pl = NaN, pa = NaN;
  for (const [lon, lat] of coords) {
    if (lon === pl && lat === pa) continue;
    flat.push(lon, lat);
    pl = lon; pa = lat;
  }
  if (flat.length >= 4) { // 至少 2 个点
    polylines.push(flat);
    keptPts += flat.length / 2;
  }
}

const header =
  `// 海岸线 + 国界 折线（Natural Earth 1:${LEVEL} countries via world-atlas, 公有领域）\n` +
  '// 每条折线为扁平 [lon,lat,lon,lat,...]（度）。转成球面点用 _drawPath 绘制。\n' +
  'module.exports = ';
const body = '[' + polylines.map(p => '[' + p.join(',') + ']').join(',') + '];\n';

fs.writeFileSync(OUTPUT, header + body);

const bytes = Buffer.byteLength(header + body);
console.log(`折线数: ${polylines.length}`);
console.log(`点数: ${rawPts} → ${keptPts} (去重后)`);
console.log(`输出: ${OUTPUT}`);
console.log(`大小: ${(bytes / 1024).toFixed(1)} KB`);

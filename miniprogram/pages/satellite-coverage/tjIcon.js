// 航迹图标（船舶 / 飞机 / 航点圆点 / 手绘编辑时选中航点的套圈）→ 本地 PNG 文件，供 map 组件的 marker 当 iconPath 用。
//
// ★ 为什么现画：marker 只认图片路径，不能着色；而航迹的颜色是任意的（平台整层两档色、逐条可改色，
//   随件送来的是 #rrggbb）。预置几张 PNG 覆盖不了，canvas 导图又要挂一个画布节点、异步回调 ——
//   故这里纯 JS 光栅化 + 自写 PNG 编码（deflate 存储块，不压缩），同步出图，落 USER_DATA_PATH。
//   按「形状 × 颜色 × 像素尺寸」命名，同名即复用：同一种样式全程只画一次，重进页面也不再画。
//
// ★★ 形状与平台 src/viz/vehicleSymbol.js 逐点同源（128 视框、船首 / 机头朝正北、锚点在视框中心、
//    套色描边 rgba(6,11,18,0.82) 宽 4.5、船的上层建筑用描边色填）—— 手机上与平台是同一枚图标。
//    朝向由 marker 的 rotate 转（顺时针度数），图标本身恒朝北画。
//    圆点同平台 paintMarkSymbol 的 circle：直径 d 内含描边，描边宽 0.18d、白 0.92。
//
// 抗锯齿：逐像素算到轮廓的有向距离（内负外正），覆盖率 = clamp(0.5 − 距离)，描边 = clamp(半宽 + 0.5 − |距离|)
// —— 1 px 解析抗锯齿，与 canvas 的边缘观感一致，不必超采样。

const VB = 128;
const CASE_RGB = [6, 11, 18];
const CASE_A = 0.82;
const CASE_W = 4.5;             // 128 视框下的描边宽
const VER = 'v1';               // 形状 / 画法改了就升版本：文件名一变，旧图自然不再被引用
const DIR_NAME = 'satsim_tjicon';
const PRUNE_AT = 400;           // 目录里超过这么多张就整目录清掉重来（每张几 KB，只是防无限堆）

// —— 形状（照抄 vehicleSymbol.js）——
const SHIP_BODY = [
  ['M', 64, 8], ['C', 73, 25, 88, 47, 88, 63], ['L', 88, 99], ['L', 81, 115], ['Q', 80, 119, 76, 119],
  ['L', 52, 119], ['Q', 48, 119, 47, 115], ['L', 40, 99], ['L', 40, 63], ['C', 40, 47, 55, 25, 64, 8], ['Z']
];
const SHIP_DECK = [['M', 53, 74], ['L', 75, 74], ['L', 75, 99], ['L', 53, 99], ['Z']];
const PLANE_BODY = [
  ['M', 64, 7], ['C', 68.4, 7, 72, 13.3, 72, 21],
  ['L', 72, 51], ['L', 122, 83], ['L', 122, 94], ['L', 72, 79],
  ['L', 72, 103], ['L', 84, 112], ['L', 84, 121], ['L', 64, 115],
  ['L', 44, 121], ['L', 44, 112], ['L', 56, 103], ['L', 56, 79],
  ['L', 6, 94], ['L', 6, 83], ['L', 56, 51], ['L', 56, 21],
  ['C', 56, 13.3, 59.6, 7, 64, 7], ['Z']
];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function parseHex(c, fb) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c || ''));
  const h = m ? m[1] : fb;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// 命令数组 → 折线环（像素坐标，隐式闭合）。三次曲线 16 段、二次 12 段：180 px 以内看不出折角
function flatten(cmds, s) {
  const rings = [];
  let ring = null, cx = 0, cy = 0, sx = 0, sy = 0;
  const pt = (x, y) => { ring.push(x * s, y * s); cx = x; cy = y; };
  for (const c of cmds) {
    if (c[0] === 'M') { ring = []; rings.push(ring); sx = c[1]; sy = c[2]; pt(c[1], c[2]); }
    else if (c[0] === 'L') pt(c[1], c[2]);
    else if (c[0] === 'C') {
      const x0 = cx, y0 = cy;
      for (let i = 1; i <= 16; i++) {
        const t = i / 16, u = 1 - t;
        pt(u * u * u * x0 + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5],
          u * u * u * y0 + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6]);
      }
    } else if (c[0] === 'Q') {
      const x0 = cx, y0 = cy;
      for (let i = 1; i <= 12; i++) {
        const t = i / 12, u = 1 - t;
        pt(u * u * x0 + 2 * u * t * c[1] + t * t * c[3], u * u * y0 + 2 * u * t * c[2] + t * t * c[4]);
      }
    } else if (c[0] === 'Z') { cx = sx; cy = sy; }
  }
  return rings;
}

// 点到一组环的有向距离（像素；内负外正，内外按非零环绕数判）
function sdRings(rings, px, py) {
  let d2 = Infinity, wn = 0;
  for (let k = 0; k < rings.length; k++) {
    const r = rings[k], n = r.length >> 1;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const x1 = r[j * 2], y1 = r[j * 2 + 1], x2 = r[i * 2], y2 = r[i * 2 + 1];
      const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
      let t = l2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x1 + t * dx - px, ey = y1 + t * dy - py, e2 = ex * ex + ey * ey;
      if (e2 < d2) d2 = e2;
      const side = dx * (py - y1) - (px - x1) * dy;
      if (y1 <= py) { if (y2 > py && side > 0) wn++; }
      else if (y2 <= py && side < 0) wn--;
    }
  }
  const d = Math.sqrt(d2);
  return wn !== 0 ? -d : d;
}

// 预乘 alpha 的 over 合成，最后回写直通 alpha（PNG 要的是直通）
function makeCanvas(N) {
  const px = new Uint8Array(N * N * 4);
  let r = 0, g = 0, b = 0, a = 0;
  return {
    px,
    begin() { r = g = b = a = 0; },
    over(rgb, sa) { if (sa <= 0) return; r = rgb[0] * sa + r * (1 - sa); g = rgb[1] * sa + g * (1 - sa); b = rgb[2] * sa + b * (1 - sa); a = sa + a * (1 - sa); },
    end(i) {
      if (a <= 0) return;
      px[i] = Math.round(r / a); px[i + 1] = Math.round(g / a); px[i + 2] = Math.round(b / a); px[i + 3] = Math.round(a * 255);
    }
  };
}

/** 船 / 机：N×N 像素，填色 rgb，套色描边，船另画上层建筑 */
function rasterVehicle(shape, rgb, N) {
  const s = N / VB;
  const body = flatten(shape === 'plane' ? PLANE_BODY : SHIP_BODY, s);
  const deck = shape === 'plane' ? null : flatten(SHIP_DECK, s);
  const hw = CASE_W * s / 2;
  const cv = makeCanvas(N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const px = x + 0.5, py = y + 0.5;
      const sd = sdRings(body, px, py);
      if (sd > hw + 1) continue;                                   // 离轮廓一个像素开外：全透明
      cv.begin();
      cv.over(rgb, clamp01(0.5 - sd));
      cv.over(CASE_RGB, clamp01(hw + 0.5 - Math.abs(sd)) * CASE_A);
      if (deck) cv.over(CASE_RGB, clamp01(0.5 - sdRings(deck, px, py)) * CASE_A);
      cv.end((y * N + x) * 4);
    }
  }
  return cv.px;
}

/** 航点圆点：N×N 的透明框（给手指留点击余量）正中一个直径 d 的圆，白描边 0.18d */
function rasterDot(rgb, d, N) {
  const c = N / 2, ew = 0.18 * d, R = d / 2 - ew / 2;
  const cv = makeCanvas(N);
  const WHITE = [255, 255, 255];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      const sd = Math.sqrt(dx * dx + dy * dy) - R;
      if (sd > ew / 2 + 1) continue;
      cv.begin();
      cv.over(rgb, clamp01(0.5 - sd));
      cv.over(WHITE, clamp01(ew / 2 + 0.5 - Math.abs(sd)) * 0.92);
      cv.end((y * N + x) * 4);
    }
  }
  return cv.px;
}

/**
 * 选中航点的套圈（手绘编辑时）：白底圆盘 + 墨色圆环 + 正中一粒航迹色实心点。
 * 圆环用平台描边那个墨色（CASE_RGB）—— 浅色底图、卫星影像上都立得住，与航迹本色也分得开。
 */
function rasterRing(rgb, d, N) {
  const c = N / 2, rw = Math.max(1.5, 0.14 * d), R = d / 2 - rw / 2, rc = 0.24 * d, ew = Math.max(1, 0.08 * d);
  const cv = makeCanvas(N);
  const WHITE = [255, 255, 255];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > R + rw / 2 + 1) continue;
      cv.begin();
      cv.over(WHITE, clamp01(R + 0.5 - r) * 0.88);
      cv.over(CASE_RGB, clamp01(rw / 2 + 0.5 - Math.abs(r - R)) * 0.92);
      cv.over(rgb, clamp01(rc + 0.5 - r));
      cv.over(WHITE, clamp01(ew / 2 + 0.5 - Math.abs(r - rc)) * 0.92);
      cv.end((y * N + x) * 4);
    }
  }
  return cv.px;
}

// ============================================================================
// PNG 编码：IHDR（8 位 RGBA）+ IDAT（zlib 存储块）+ IEND。图标几 KB，不压缩就够。
// ============================================================================
let CRC_TABLE = null;
function crc32(u8, start, end) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
const u32 = (u8, p, v) => { u8[p] = (v >>> 24) & 0xFF; u8[p + 1] = (v >>> 16) & 0xFF; u8[p + 2] = (v >>> 8) & 0xFF; u8[p + 3] = v & 0xFF; };

function encodePng(w, h, rgba) {
  const rowLen = w * 4 + 1;
  const raw = new Uint8Array(rowLen * h);
  for (let y = 0; y < h; y++) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * rowLen + 1);   // 每行滤波字节 0
  const nBlk = Math.max(1, Math.ceil(raw.length / 65535));
  const z = new Uint8Array(2 + raw.length + nBlk * 5 + 4);
  z[0] = 0x78; z[1] = 0x01;
  let p = 2;
  for (let i = 0; i < nBlk; i++) {
    const s = i * 65535, len = Math.min(65535, raw.length - s);
    z[p++] = i === nBlk - 1 ? 1 : 0;
    z[p++] = len & 0xFF; z[p++] = len >>> 8; z[p++] = ~len & 0xFF; z[p++] = (~len >>> 8) & 0xFF;
    z.set(raw.subarray(s, s + len), p); p += len;
  }
  let a = 1, b = 0;
  for (let i = 0; i < raw.length; i++) { a += raw[i]; if (a >= 65521) a -= 65521; b += a; if (b >= 65521) b -= 65521; }
  u32(z, p, ((b << 16) | a) >>> 0);

  const out = new Uint8Array(8 + 25 + 12 + z.length + 12);
  out.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  let q = 8;
  const chunk = (type, data) => {
    u32(out, q, data.length);
    for (let i = 0; i < 4; i++) out[q + 4 + i] = type.charCodeAt(i);
    out.set(data, q + 8);
    u32(out, q + 8 + data.length, crc32(out, q + 4, q + 8 + data.length));
    q += 12 + data.length;
  };
  const ihdr = new Uint8Array(13);
  u32(ihdr, 0, w); u32(ihdr, 4, h); ihdr[8] = 8; ihdr[9] = 6;       // 8 位、RGBA；压缩 / 滤波 / 隔行全 0
  chunk('IHDR', ihdr);
  chunk('IDAT', z);
  chunk('IEND', new Uint8Array(0));
  return out.buffer;
}

// ============================================================================
// 文件缓存
// ============================================================================
const made = Object.create(null);
let dirOk = false;
const dirPath = () => wx.env.USER_DATA_PATH + '/' + DIR_NAME;
function fsm() { try { return wx.getFileSystemManager(); } catch (e) { return null; } }
function ensureDir(fs) {
  if (dirOk) return true;
  try { fs.accessSync(dirPath()); dirOk = true; }
  catch (e) { try { fs.mkdirSync(dirPath(), true); dirOk = true; } catch (e2) { dirOk = false; } }
  return dirOk;
}

// 同名即复用；取不到文件系统 / 写不进去返回 ''（调用方退回透明占位，航迹线照画）
function ensure(name, draw) {
  const path = dirPath() + '/' + name;
  if (made[path]) return path;
  const fs = fsm();
  if (!fs) return '';
  try { fs.accessSync(path); made[path] = true; return path; } catch (e) { /* 没有就现画 */ }
  if (!ensureDir(fs)) return '';
  try {
    const d = draw();
    fs.writeFileSync(path, encodePng(d.n, d.n, d.px), 'binary');
    made[path] = true;
    return path;
  } catch (e) {
    console.warn('[tjIcon] 图标写不进去：', name, e);
    return '';
  }
}

let DPR = 0;
function dpr() {
  if (DPR) return DPR;
  let r = 2;
  try {
    const w = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
    r = Number(w && w.pixelRatio) || 2;
  } catch (e) { /* 取不到按 2 倍屏 */ }
  DPR = Math.min(3, Math.max(1, r));
  return DPR;
}

const hex6 = (c, fb) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '')); return (m ? m[1] : fb).toLowerCase(); };

/**
 * 载具图标路径。box = 上屏边长（逻辑 px）；图按设备像素画，上屏不糊。
 * @param {'ship'|'plane'} shape
 */
function vehicleIcon(shape, color, box) {
  const sh = shape === 'plane' ? 'plane' : 'ship';
  const c = hex6(color, sh === 'plane' ? '5ad1ff' : 'ff6a4a');
  const n = Math.max(8, Math.min(192, Math.round(box * dpr())));
  return ensure(`${sh}-${c}-${n}-${VER}.png`, () => ({ n, px: rasterVehicle(sh, parseHex(c), n) }));
}

/** 航点圆点路径：box = 点击框边长、d = 圆点直径（均为逻辑 px） */
function dotIcon(color, d, box) {
  const c = hex6(color, 'ff9a5a');
  const k = dpr();
  const n = Math.max(4, Math.min(128, Math.round(box * k)));
  const dp = Math.max(2, Math.min(n, Math.round(d * k * 2) / 2));
  return ensure(`dot-${c}-${String(dp).replace('.', 'p')}-${n}-${VER}.png`, () => ({ n, px: rasterDot(parseHex(c), dp, n) }));
}

/** 选中航点的套圈路径：d = 套圈直径、box = 点击框边长（均为逻辑 px） */
function ringIcon(color, d, box) {
  const c = hex6(color, 'ff9a5a');
  const k = dpr();
  const n = Math.max(8, Math.min(160, Math.round(box * k)));
  const dp = Math.max(6, Math.min(n, Math.round(d * k * 2) / 2));
  return ensure(`ring-${c}-${String(dp).replace('.', 'p')}-${n}-${VER}.png`, () => ({ n, px: rasterRing(parseHex(c), dp, n) }));
}

/** 进页时调一次：目录里堆得太多就整个清掉（都是可重画的缓存） */
function prune() {
  const fs = fsm();
  if (!fs) return;
  try {
    const names = fs.readdirSync(dirPath());
    if (!names || names.length <= PRUNE_AT) return;
    for (const nm of names) { try { fs.unlinkSync(dirPath() + '/' + nm); } catch (e) { /* 清不掉只是占地方 */ } }
    for (const k of Object.keys(made)) delete made[k];
  } catch (e) { /* 目录还不存在 */ }
}

module.exports = {
  vehicleIcon: vehicleIcon,
  dotIcon: dotIcon,
  ringIcon: ringIcon,
  prune: prune,
  // 以下给验证台用
  _rasterVehicle: rasterVehicle,
  _rasterDot: rasterDot,
  _rasterRing: rasterRing,
  _encodePng: encodePng,
  _crc32: crc32
};

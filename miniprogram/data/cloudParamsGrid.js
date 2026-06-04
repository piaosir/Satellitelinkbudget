// cloudParamsGrid.js
// ITU-R P.840-9 云衰 — Lred 对数正态参数全球地图（可注入模块，数据不内嵌）
//
// 数据放微信云存储（p840_logn_v1.bin，原生 0.25° 全精度），由 app.js 启动时
// 后台下载并通过 setData() 注入。注入前 getParams() 返回 null，
// 计算器自动回退到工程保守经验表（getCloudLWC），不影响出数。
//
// .bin 格式：三张 Int16LE 图按 [m][σ][Pclw] 顺序拼接，各 721×1441。
//   m  = ln(L) 均值   × 1000
//   σ  = ln(L) 标准差 × 1000
//   Pclw = 云出现概率(%) × 100
// 网格：左上角 (−90°N, −180°E)，0.25° 步长，行 r→纬度=−90+r×0.25，列 c→经度=−180+c×0.25。

const ROWS = 721;
const COLS = 1441;
const STEP = 0.25;
const LAT_MIN = -90;
const LON_MIN = -180;
const BLOCK = ROWS * COLS;              // 每张图的元素数
const EXPECTED_SIZE = BLOCK * 3 * 2;    // 三张 Int16 图的总字节数

let _m = null, _s = null, _p = null;

/**
 * 注入全精度数据（app.js 下载后调用）
 * @param {ArrayBuffer} arrayBuffer Int16LE [m][σ][Pclw] 拼接
 * @returns {boolean} 是否注入成功
 */
function setData(arrayBuffer) {
  if (!arrayBuffer || arrayBuffer.byteLength !== EXPECTED_SIZE) {
    console.warn('[P.840] 数据大小不匹配: 期望', EXPECTED_SIZE, '实际', arrayBuffer ? arrayBuffer.byteLength : 0);
    return false;
  }
  const all = new Int16Array(arrayBuffer);
  _m = all.subarray(0, BLOCK);
  _s = all.subarray(BLOCK, BLOCK * 2);
  _p = all.subarray(BLOCK * 2, BLOCK * 3);
  console.log('[P.840] 全精度参数已注入:', ROWS, '×', COLS, '@', STEP, '°');
  return true;
}

function isReady() {
  return _m !== null;
}

// 双线性插值（arr 为 Int16 视图，scale 为还原系数）
function bilinear(arr, lat, lon, scale) {
  const rf = (lat - LAT_MIN) / STEP;
  const cf = (lon - LON_MIN) / STEP;
  let r0 = Math.floor(rf), c0 = Math.floor(cf);
  r0 = Math.max(0, Math.min(ROWS - 1, r0));
  c0 = Math.max(0, Math.min(COLS - 1, c0));
  const r1 = Math.min(ROWS - 1, r0 + 1), c1 = Math.min(COLS - 1, c0 + 1);
  const dy = rf - Math.floor(rf), dx = cf - Math.floor(cf);
  const v00 = arr[r0 * COLS + c0], v10 = arr[r0 * COLS + c1];
  const v01 = arr[r1 * COLS + c0], v11 = arr[r1 * COLS + c1];
  const top = v00 + (v10 - v00) * dx, bot = v01 + (v11 - v01) * dx;
  return (top + (bot - top) * dy) / scale;
}

/**
 * 返回 {m, sigma, Pclw(%)}；数据未注入或坐标非法时返回 null
 */
function getParams(lat, lon) {
  if (!_m || lat == null || lon == null || isNaN(lat) || isNaN(lon)) return null;
  return {
    m: bilinear(_m, lat, lon, 1000),
    sigma: bilinear(_s, lat, lon, 1000),
    Pclw: bilinear(_p, lat, lon, 100)
  };
}

module.exports = {
  setData,
  isReady,
  getParams,
  EXPECTED_SIZE
};

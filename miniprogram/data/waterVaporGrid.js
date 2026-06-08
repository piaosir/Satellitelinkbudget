// waterVaporGrid.js — 自动生成，勿手动修改（node scripts/convertP836.js）
// ITU-R P.836-6 地面水汽密度 (g/m³) — 云存储版
//
// 数据放云存储（p836_rho_v1.bin），由 app.js 启动时后台下载并通过 setData() 注入。
// 注入前 getRhoWs() 回退到 ITU-R P.835 纬度带估算值，不影响出数。
//
// .bin 格式：两张 Int16LE 图按 [晴天 RHO_90_v4.txt][雨天 RHO_10_v4.txt] 顺序拼接，各 161×321。
//   值 × 100 存储（精度 0.01 g/m³）。
// 网格：行 r → 纬度 = 90 − r×1.125（行0=90°N），列 c → 经度 = −180 + c×1.125（列0=−180°）。

const ROWS     = 161;
const COLS     = 321;
const STEP     = 1.125;
const LAT_TOP  = 90;
const LON_LEFT = -180;
const BLOCK    = ROWS * COLS;
const EXPECTED_SIZE = BLOCK * 2 * 2;

let _clear = null, _rainy = null;

function setData(arrayBuffer) {
  if (!arrayBuffer || arrayBuffer.byteLength !== EXPECTED_SIZE) {
    console.warn('[P.836] 数据大小不匹配: 期望', EXPECTED_SIZE, '实际', arrayBuffer ? arrayBuffer.byteLength : 0);
    return false;
  }
  const all = new Int16Array(arrayBuffer);
  _clear = all.slice(0, BLOCK);
  _rainy = all.slice(BLOCK, BLOCK * 2);
  console.log('[P.836] 水汽密度数据已注入:', ROWS, '×', COLS, '× 2图');
  return true;
}

function isReady() { return _clear !== null; }

// P.835 纬度带兜底（云数据未加载时使用）
function _p835(lat) {
  const a = Math.abs(lat);
  if (a < 22) return 19.0;
  if (a < 45) return 8.9;
  return 5.2;
}

// 对数空间双线性插值
function _bilinear(arr, lat, lon) {
  const rf = (LAT_TOP - lat) / STEP;
  const cf = (lon - LON_LEFT) / STEP;
  const r0 = Math.max(0, Math.min(ROWS - 2, Math.floor(rf)));
  const c0 = Math.max(0, Math.min(COLS - 2, Math.floor(cf)));
  const r1 = r0 + 1, c1 = c0 + 1;
  const dy = rf - r0, dx = cf - c0;
  const get = (r, c) => { const v = arr[r * COLS + c]; return v > 0 ? v / 100 : _p835(LAT_TOP - r * STEP); };
  const lv00 = Math.log(get(r0, c0)), lv10 = Math.log(get(r0, c1));
  const lv01 = Math.log(get(r1, c0)), lv11 = Math.log(get(r1, c1));
  return Math.exp(lv00 + (lv10 - lv00) * dx + (lv01 - lv00) * dy + (lv11 - lv10 - lv01 + lv00) * dx * dy);
}

function getRhoWs(lat, lon, rainy) {
  if (lat == null || lon == null || !isFinite(lat) || !isFinite(lon)) {
    return rainy ? 20.0 : _p835(lat || 0);
  }
  const arr = rainy ? _rainy : _clear;
  if (!arr) return _p835(lat);  // 云数据未加载，回退 P.835
  return _bilinear(arr, lat, lon);
}

module.exports = { setData, isReady, getRhoWs, EXPECTED_SIZE };

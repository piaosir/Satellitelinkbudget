/**
 * ITU-R P.836-6 地面水汽密度地图转换脚本
 *
 * 作用：把 P.836-6「RHO Annual Maps.zip」中两张图转换为直接内嵌于
 *      miniprogram/data/waterVaporGrid.js 的 Base64 二进制模块。
 *
 * 输入（从 ZIP 内直接读取，无需手动解压内层 ZIP）：
 *   RHO_90_v4.txt — 90% 超越概率（偏干低值，10%时间比这干）→ 晴天水汽密度
 *   RHO_10_v4.txt — 10% 超越概率（高湿高值，仅10%时间更湿）→ 雨天水汽密度
 *
 * 网格（由 LAT1dot125.txt 验证）：
 *   161 行 × 321 列，步长 1.125°
 *   行 r → 纬度 = 90 − r × 1.125（行0=90°N，行160=−90°S）
 *   列 c → 经度 = −180 + c × 1.125（列0=−180°，列320=+180°）
 *
 * 用法：node scripts/convertP836.js
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ===== 配置 =====
const ZIP_FILE   = 'C:\\Users\\85256\\Downloads\\R-REC-P.836-6-201712-I!!ZIP-E\\P_836_Maps_annual\\Surface Water Vapor Density\\RHO Annual Maps.zip';
const FILE_CLEAR = 'RHO_90_v4.txt';
const FILE_RAINY = 'RHO_10_v4.txt';
const OUTPUT_JS  = path.join(__dirname, '..', 'miniprogram', 'data', 'waterVaporGrid.js');

// ===== 网格常量 =====
const ROWS    = 161;
const COLS    = 321;
const STEP    = 1.125;
const LAT_TOP = 90;
const LON_LEFT = -180;

// ===== 从 ZIP 内提取文件 =====
function readFromZip(zipFile, entry) {
  return execSync(`unzip -p "${zipFile}" "${entry}"`, { maxBuffer: 20 * 1024 * 1024 }).toString();
}

// ===== 解析 TXT 矩阵 =====
function parseMatrix(txt, label) {
  const rows = txt.trim().split(/\r?\n/).map(line =>
    line.trim().split(/\s+/).map(v => (v === 'NaN' || v === 'nan' ? NaN : parseFloat(v)))
  );
  if (rows.length !== ROWS) { console.error(`[${label}] 行数 ${rows.length} ≠ 期望 ${ROWS}`); process.exit(1); }
  if (rows[0].length !== COLS) { console.error(`[${label}] 列数 ${rows[0].length} ≠ 期望 ${COLS}`); process.exit(1); }
  return rows;
}

// ===== NaN 填充：同行最近有效值；全行无效则用 P.835 纬度默认 =====
function p835Default(lat) {
  const a = Math.abs(lat);
  if (a < 22) return 19.0;
  if (a < 45) return 8.9;
  return 5.2;
}

function fillNaN(matrix) {
  let count = 0;
  for (let r = 0; r < ROWS; r++) {
    const lat = LAT_TOP - r * STEP;
    for (let c = 0; c < COLS; c++) {
      if (!isNaN(matrix[r][c])) continue;
      count++;
      let found = NaN;
      for (let d = 1; d < COLS && isNaN(found); d++) {
        if (c - d >= 0   && !isNaN(matrix[r][c - d])) found = matrix[r][c - d];
        if (c + d < COLS && !isNaN(matrix[r][c + d])) found = matrix[r][c + d];
      }
      matrix[r][c] = isNaN(found) ? p835Default(lat) : found;
    }
  }
  return count;
}

// ===== 主流程 =====
console.log('=== ITU-R P.836-6 水汽密度地图转换 ===\n');

console.log(`读取 ${FILE_CLEAR} ...`);
const clearMat = parseMatrix(readFromZip(ZIP_FILE, FILE_CLEAR), 'RHO_50');
console.log(`读取 ${FILE_RAINY} ...`);
const rainyMat = parseMatrix(readFromZip(ZIP_FILE, FILE_RAINY), 'RHO_1');

const nanC = fillNaN(clearMat);
const nanR = fillNaN(rainyMat);
console.log(`NaN 填充：晴天 ${nanC} 个，雨天 ${nanR} 个`);

let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  if (clearMat[r][c] < minC) minC = clearMat[r][c];
  if (clearMat[r][c] > maxC) maxC = clearMat[r][c];
  if (rainyMat[r][c] < minR) minR = rainyMat[r][c];
  if (rainyMat[r][c] > maxR) maxR = rainyMat[r][c];
}
console.log(`晴天 RHO_90 范围: [${minC.toFixed(2)}, ${maxC.toFixed(2)}] g/m³`);
console.log(`雨天 RHO_10 范围: [${minR.toFixed(2)}, ${maxR.toFixed(2)}] g/m³`);

// ===== Int16LE 编码（值 × 100，精度 0.01 g/m³）=====
const BLOCK = ROWS * COLS;
const buf = Buffer.alloc(BLOCK * 2 * 2);  // 两张图
let off = 0;
function writeMap(mat) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const iv = Math.max(1, Math.min(32767, Math.round(mat[r][c] * 100)));  // 最小1（非零，区别未填充）
    buf.writeInt16LE(iv, off); off += 2;
  }
}
writeMap(clearMat);
writeMap(rainyMat);

// ===== 输出二进制文件（用于云存储上传）=====
const OUTPUT_BIN = path.join(__dirname, '..', 'p836_rho_v1.bin');
fs.writeFileSync(OUTPUT_BIN, buf);
console.log(`\n二进制输出: ${OUTPUT_BIN}`);
console.log(`  大小: ${(buf.length / 1024).toFixed(1)} KB (两张 Int16LE 图，各 ${ROWS}×${COLS})`);

// ===== 抽查 =====
const CHECKS = [
  { n: '北京',   lat: 39.9,  lon: 116.4 },
  { n: '广州',   lat: 23.1,  lon: 113.3 },
  { n: '新加坡', lat: 1.35,  lon: 103.8 },
  { n: '迪拜',   lat: 25.2,  lon: 55.3  },
  { n: '纽约',   lat: 40.7,  lon: -74.0 },
  { n: '莫斯科', lat: 55.8,  lon: 37.6  },
  { n: '悉尼',   lat: -33.9, lon: 151.2 },
  { n: '南极点', lat: -90,   lon: 0     },
];
console.log('\n=== 抽查（最近邻格点值）===');
for (const p of CHECKS) {
  const r = Math.max(0, Math.min(ROWS - 1, Math.round((LAT_TOP - p.lat) / STEP)));
  const c = Math.max(0, Math.min(COLS - 1, Math.round((p.lon - LON_LEFT) / STEP)));
  console.log(`  ${p.n.padEnd(4)}: 晴天=${clearMat[r][c].toFixed(2).padStart(5)}, 雨天=${rainyMat[r][c].toFixed(2).padStart(5)} g/m³`);
}

// ===== 生成桩 JS 模块（数据由 app.js 从云存储注入，包内仅含接口+P.835回退）=====
const EXPECTED_SIZE = BLOCK * 2 * 2;
const js = `// waterVaporGrid.js — 自动生成，勿手动修改（node scripts/convertP836.js）
// ITU-R P.836-6 地面水汽密度 (g/m³) — 云存储版
//
// 数据放云存储（p836_rho_v1.bin），由 app.js 启动时后台下载并通过 setData() 注入。
// 注入前 getRhoWs() 回退到 ITU-R P.835 纬度带估算值，不影响出数。
//
// .bin 格式：两张 Int16LE 图按 [晴天 ${FILE_CLEAR}][雨天 ${FILE_RAINY}] 顺序拼接，各 ${ROWS}×${COLS}。
//   值 × 100 存储（精度 0.01 g/m³）。
// 网格：行 r → 纬度 = 90 − r×1.125（行0=90°N），列 c → 经度 = −180 + c×1.125（列0=−180°）。

const ROWS     = ${ROWS};
const COLS     = ${COLS};
const STEP     = ${STEP};
const LAT_TOP  = ${LAT_TOP};
const LON_LEFT = ${LON_LEFT};
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
`;

fs.writeFileSync(OUTPUT_JS, js, 'utf-8');
console.log(`桩模块输出: ${OUTPUT_JS}`);
console.log('=== 完成 ===');
console.log('下一步: 把 p836_rho_v1.bin 上传到微信云存储（建议路径 P836/p836_rho_v1.bin），填入 app.js P836_CLOUD_FILE');

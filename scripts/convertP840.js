/**
 * ITU-R P.840-9 云衰减 — 对数正态参数地图转换脚本
 *
 * 作用：把 ITU 官方 P.840-9「LogN_Annual」三张全球参数图转换为小程序可用的
 *      内嵌数据模块 miniprogram/data/cloudParamsGrid.js（Base64 + 双线性插值）。
 *
 * 官方数据（来自 N1-P14_LogN_Annual.zip，解压后即三个 TXT，无坐标文件）：
 *   - mL.TXT : ln(L) 对数正态分布的均值 m
 *   - sL.TXT : ln(L) 对数正态分布的标准差 σ
 *   - PL.TXT : 云出现概率 Pclw（脚本自动判别 0~1 还是 %）
 *
 * 网格由 P.840-9 Part 15(Readme) Table 1 固定，无需 LAT/LON 文件：
 *   721 行 × 1441 列，0.25° 步长，左上角 (−90°N, −180°E)，
 *   行 r → 纬度 = −90 + r×0.25，列 c → 经度 = −180 + c×0.25（均升序）。
 *
 * 使用方法：
 *   1. 把 INPUT_DIR 改成你解压后的目录（含 mL.TXT/sL.TXT/PL.TXT）。
 *   2. node scripts/convertP840.js
 *   3. 生成 miniprogram/data/cloudParamsGrid.js（覆盖桩文件）即可。
 */

const fs = require('fs');
const path = require('path');

// ===== 配置：改成你本地解压后的目录 =====
const INPUT_DIR = 'C:\\Users\\85256\\Downloads\\R-REC-P.840Part14-0-202308-I!!ZIP-E';
const FILE_M     = 'mL.TXT';   // ln(L) 均值
const FILE_SIGMA = 'sL.TXT';   // ln(L) 标准差
const FILE_PCLW  = 'PL.TXT';   // 云出现概率

// ===== P.840-9 Part 15 Table 1 固定网格 =====
const SRC_ROWS = 721;
const SRC_COLS = 1441;
const SRC_STEP = 0.25;
const LAT0 = -90;    // 行 0 的纬度
const LON0 = -180;   // 列 0 的经度

// 输出原生 0.25° 全精度二进制，供上传微信云存储（不进小程序包，零精度损失）。
// 格式：三张 Int16LE 图 [m][σ][Pclw] 拼接，各 721×1441；m,σ×1000，Pclw(%)×100。
const OUTPUT_BIN = path.join(__dirname, '..', 'p840_logn_v1.bin');

console.log('=== ITU-R P.840-9 云衰参数地图转换 ===\n');

// ---- 读取 721×1441 数值矩阵（空白分隔，行=纬度升序，列=经度升序）----
function readMatrix(file) {
  const txt = fs.readFileSync(path.join(INPUT_DIR, file), 'utf-8').trim();
  const rows = txt.split(/\r?\n/).map(line => line.trim().split(/\s+/).map(Number));
  if (rows.length !== SRC_ROWS || rows[0].length !== SRC_COLS) {
    console.error(`错误: ${file} 尺寸 ${rows.length}×${rows[0].length}, 期望 ${SRC_ROWS}×${SRC_COLS}`);
    process.exit(1);
  }
  return rows;
}

console.log('读取 mL/sL/PL 矩阵 ...');
const M     = readMatrix(FILE_M);
const SIGMA = readMatrix(FILE_SIGMA);
const PCLW  = readMatrix(FILE_PCLW);
console.log(`  网格: ${SRC_ROWS}×${SRC_COLS}, ${SRC_STEP}°, 纬 ${LAT0}..${LAT0 + (SRC_ROWS - 1) * SRC_STEP}, 经 ${LON0}..${LON0 + (SRC_COLS - 1) * SRC_STEP}`);

// ---- 自动判别 Pclw 量纲：取全局最大值，≤1.5 视为 0~1，否则视为 % ----
let maxPL = 0;
for (let r = 0; r < SRC_ROWS; r++) for (let c = 0; c < SRC_COLS; c++) if (PCLW[r][c] > maxPL) maxPL = PCLW[r][c];
const PCLW_IS_FRACTION = maxPL <= 1.5;
console.log(`  Pclw 最大值 ${maxPL.toFixed(3)} → 判定为 ${PCLW_IS_FRACTION ? '0~1 分数(将×100转%)' : '百分比%'}`);

// ---- 最近邻取源网格点（源 0.25° → 容器 1.0°）----
function srcIndex(lat, lon) {
  let r = Math.round((lat - LAT0) / SRC_STEP);
  let c = Math.round((lon - LON0) / SRC_STEP);
  r = Math.max(0, Math.min(SRC_ROWS - 1, r));
  c = ((c % SRC_COLS) + SRC_COLS) % SRC_COLS;  // 经度环绕保险
  return [r, c];
}

// ---- 输出原生 0.25° 全精度二进制：三张 Int16LE 图 [m][σ][Pclw] 拼接 ----
// 源矩阵已是 纬度升序(行0=−90)/经度升序(列0=−180)，与运行时 cloudParamsGrid 索引一致，直接逐点写入。
const BLOCK = SRC_ROWS * SRC_COLS;
const buf = Buffer.alloc(BLOCK * 3 * 2);
let off = 0, clip = 0, mMin = Infinity, mMax = -Infinity;

function writeBlock(MAT, scale, isPclw) {
  for (let r = 0; r < SRC_ROWS; r++) {
    for (let c = 0; c < SRC_COLS; c++) {
      let v = MAT[r][c];
      if (isPclw) v *= (PCLW_IS_FRACTION ? 100 : 1);
      else { if (v < mMin) mMin = v; if (v > mMax) mMax = v; }
      let iv = Math.round(v * scale);
      if (iv > 32767) { iv = 32767; clip++; }
      if (iv < -32768) { iv = -32768; clip++; }
      buf.writeInt16LE(iv, off);
      off += 2;
    }
  }
}

writeBlock(M, 1000, false);      // m × 1000
writeBlock(SIGMA, 1000, false);  // σ × 1000
writeBlock(PCLW, 100, true);     // Pclw(%) × 100

fs.writeFileSync(OUTPUT_BIN, buf);
console.log(`\n输出: ${OUTPUT_BIN}`);
console.log(`  大小: ${(buf.length / 1024 / 1024).toFixed(2)} MB (${BLOCK}×3 Int16, 原生 0.25°)`);
console.log(`  m/σ 范围: m∈[${mMin.toFixed(3)}, ${mMax.toFixed(3)}], Int16 裁剪点数: ${clip}`);

// ---- 抽查 ----
console.log('\n=== 抽查（最近邻源值）===');
for (const tp of [
  { n: '北京',   lat: 39.9, lon: 116.4 },
  { n: '广州',   lat: 23.1, lon: 113.3 },
  { n: '新加坡', lat: 1.35, lon: 103.8 },
  { n: '迪拜',   lat: 25.2, lon: 55.3 },
  { n: '纽约',   lat: 40.7, lon: -74.0 },
]) {
  const [r, c] = srcIndex(tp.lat, tp.lon);
  const pclw = PCLW[r][c] * (PCLW_IS_FRACTION ? 100 : 1);
  console.log(`  ${tp.n}: m=${M[r][c].toFixed(3)}, sigma=${SIGMA[r][c].toFixed(3)}, Pclw=${pclw.toFixed(1)}%`);
}
console.log('\n=== 完成 ===');
console.log('下一步:');
console.log(`  1. 把 ${OUTPUT_BIN} 上传到微信云存储（建议路径 P840/p840_logn_v1.bin）`);
console.log('  2. 把返回的 fileID 填入 app.js 的 P840_CLOUD_FILE');

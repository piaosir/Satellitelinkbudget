/**
 * ITU-R P.837-7 降雨率数据转换脚本
 * 
 * 输入: P.837_R001_Maps 目录下的 R001.TXT / LAT_R001.TXT / LON_R001.TXT
 * 输出:
 *   1. p837_r001_v2.bin — 全精度 uint16 LE 二进制 (1441×2881, 0.125°网格, 值=R×100, 0.01mm/h精度)
 *      → 上传到微信云存储供小程序后台下载
 *   2. miniprogram/data/rainRateGrid.js — 0.5°降采样回退数据 (361×721, uint8整数精度, Base64编码)
 * 
 * 使用方法: node scripts/convertP837.js
 */

const fs = require('fs');
const path = require('path');

// ===== 配置 =====
const INPUT_DIR = 'C:\\Users\\85256\\Desktop\\雨衰相关\\P.837_R001_Maps';
const OUTPUT_BIN = path.join(__dirname, '..', 'p837_r001_v2.bin');
const OUTPUT_JS = path.join(__dirname, '..', 'miniprogram', 'data', 'rainRateGrid.js');

// 网格参数 (ITU-R P.837-7)
const FULL_ROWS = 1441;   // -90° 到 +90°, 步长 0.125°
const FULL_COLS = 2881;   // -180° 到 +180°, 步长 0.125°
const FULL_STEP = 0.125;

// 降采样参数 (0.5°)
const DS_FACTOR = 4;       // 0.5° / 0.125° = 4
const DS_ROWS = 361;       // Math.floor(1440/4) + 1
const DS_COLS = 721;       // Math.floor(2880/4) + 1
const DS_STEP = 0.5;

console.log('=== ITU-R P.837 降雨率数据转换 ===\n');

// ===== 步骤1: 读取原始数据 =====
console.log('读取 R001.TXT ...');
const r001Text = fs.readFileSync(path.join(INPUT_DIR, 'R001.TXT'), 'utf-8');
const lines = r001Text.trim().split('\n');

if (lines.length !== FULL_ROWS) {
  console.error(`错误: R001.TXT 行数 ${lines.length}, 期望 ${FULL_ROWS}`);
  process.exit(1);
}

// ===== 步骤2: 生成全精度 uint16 LE 二进制 (值 = R × 100) =====
console.log(`生成全精度 uint16 二进制 (${FULL_ROWS}×${FULL_COLS}) ...`);
const fullBuf = Buffer.alloc(FULL_ROWS * FULL_COLS * 2); // uint16 = 2 bytes
let maxVal = 0;
let clippedCount = 0;

for (let r = 0; r < FULL_ROWS; r++) {
  const vals = lines[r].trim().split(/\s+/);
  if (vals.length !== FULL_COLS) {
    console.error(`错误: 第 ${r} 行列数 ${vals.length}, 期望 ${FULL_COLS}`);
    process.exit(1);
  }
  for (let c = 0; c < FULL_COLS; c++) {
    let v = Math.round(parseFloat(vals[c]) * 100);
    if (v > 65535) {
      clippedCount++;
      v = 65535;
    }
    if (v < 0) v = 0;
    if (v > maxVal) maxVal = v;
    fullBuf.writeUInt16LE(v, (r * FULL_COLS + c) * 2);
  }
}

// 同时生成 uint8 整数版本供降采样回退用
const fullBufU8 = Buffer.alloc(FULL_ROWS * FULL_COLS);
for (let i = 0; i < FULL_ROWS * FULL_COLS; i++) {
  let v = Math.round(fullBuf.readUInt16LE(i * 2) / 100);
  if (v > 255) v = 255;
  fullBufU8[i] = v;
}

fs.writeFileSync(OUTPUT_BIN, fullBuf);
const binSize = fullBuf.length;
console.log(`  输出: ${OUTPUT_BIN}`);
console.log(`  大小: ${(binSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`  最大值(×100): ${maxVal}, 即 ${(maxVal/100).toFixed(2)} mm/h, 裁剪点数: ${clippedCount}`);

// ===== 步骤3: 生成0.5°降采样数据 (uint8 整数精度, 作为回退) =====
console.log(`\n生成0.5°降采样数据 (${DS_ROWS}×${DS_COLS}, uint8回退) ...`);
const dsBuf = Buffer.alloc(DS_ROWS * DS_COLS);

for (let r = 0; r < DS_ROWS; r++) {
  const srcRow = r * DS_FACTOR;
  for (let c = 0; c < DS_COLS; c++) {
    const srcCol = c * DS_FACTOR;
    dsBuf[r * DS_COLS + c] = fullBufU8[srcRow * FULL_COLS + srcCol];
  }
}

// 编码为 Base64
const base64Data = dsBuf.toString('base64');
console.log(`  降采样数据点: ${DS_ROWS * DS_COLS}`);
console.log(`  Base64 大小: ${(base64Data.length / 1024).toFixed(1)} KB`);

// ===== 步骤4: 写入 JS 模块 =====
const jsContent = `// rainRateGrid.js
// ITU-R P.837-7 降雨率网格数据 — 0.5°降采样回退数据
// 自动生成，请勿手动编辑
// 生成时间: ${new Date().toISOString()}
//
// 网格: ${DS_ROWS} 行 × ${DS_COLS} 列
// 纬度: -90° 到 +90°, 步长 ${DS_STEP}°
// 经度: -180° 到 +180°, 步长 ${DS_STEP}°
// 数据: R0.01 降雨率 (mm/h), uint8 整数精度
// 编码: Base64 → ArrayBuffer → Uint8Array

const GRID_ROWS = ${DS_ROWS};
const GRID_COLS = ${DS_COLS};
const GRID_STEP = ${DS_STEP};
const LAT_MIN = -90;
const LON_MIN = -180;

// Base64 编码的网格数据
const GRID_BASE64 = '${base64Data}';

/**
 * 解码 Base64 为 Uint8Array
 */
let _gridData = null;
function getGridData() {
  if (_gridData) return _gridData;
  
  // 微信小程序的 base64 解码
  if (typeof wx !== 'undefined' && wx.base64ToArrayBuffer) {
    _gridData = new Uint8Array(wx.base64ToArrayBuffer(GRID_BASE64));
  } else {
    // Node.js 环境
    const buf = Buffer.from(GRID_BASE64, 'base64');
    _gridData = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  return _gridData;
}

module.exports = {
  GRID_ROWS,
  GRID_COLS,
  GRID_STEP,
  LAT_MIN,
  LON_MIN,
  getGridData
};
`;

// 确保输出目录存在
const jsDir = path.dirname(OUTPUT_JS);
if (!fs.existsSync(jsDir)) {
  fs.mkdirSync(jsDir, { recursive: true });
}

fs.writeFileSync(OUTPUT_JS, jsContent, 'utf-8');
console.log(`  输出: ${OUTPUT_JS}`);
console.log(`  JS文件大小: ${(jsContent.length / 1024).toFixed(1)} KB`);

// ===== 步骤5: 验证 =====
console.log('\n=== 验证 ===');

// 测试几个已知城市
const testPoints = [
  { name: '北京', lat: 39.9, lon: 116.47, expected: 40 },
  { name: '上海', lat: 31.22, lon: 121.48, expected: 55 },
  { name: '广州', lat: 23.17, lon: 113.33, expected: 80 },
  { name: '迪拜', lat: 25.20, lon: 55.27, expected: 20 },
  { name: '东京', lat: 35.68, lon: 139.69, expected: 55 },
];

for (const tp of testPoints) {
  // 全精度查询 (uint16, ÷100)
  const fullRow = Math.round((tp.lat + 90) / FULL_STEP);
  const fullCol = Math.round((tp.lon + 180) / FULL_STEP);
  const fullVal = fullBuf.readUInt16LE((fullRow * FULL_COLS + fullCol) * 2) / 100;
  
  // 降采样查询 (uint8)
  const dsRow = Math.round((tp.lat + 90) / DS_STEP);
  const dsCol = Math.round((tp.lon + 180) / DS_STEP);
  const dsVal = dsBuf[dsRow * DS_COLS + dsCol];
  
  console.log(`  ${tp.name} (${tp.lat}°N, ${tp.lon}°E): 全精度=${fullVal.toFixed(2)}, 0.5°回退=${dsVal}, 旧值=${tp.expected}`);
}

console.log('\n=== 完成 ===');
console.log(`下一步:`);
console.log(`  1. 将 ${OUTPUT_BIN} 上传到微信云存储 (uint16 LE, 值=R×100)`);
console.log(`  2. ${OUTPUT_JS} 已就绪 (uint8 回退数据)`);

/**
 * ITU-R P.1511 地形高度(海拔)数据转换脚本
 *
 * 输入: TOPO.dat (Earth2014 模型, 2164 行 × 4324 列, 单位:米, 高于平均海平面)
 *   - 行对应纬度, 列对应经度, 步长 1/12° (~0.08333°)
 *   - 含上下各1行、左右各2列环绕缓冲(用于双三次插值)
 *   - "虚拟"左上角: 纬度 +90.125°, 经度 -180.125°, 行/列递增 1/12°
 *     lat(row) = 90.125 - row/12 ; lon(col) = -180.125 + col/12
 *
 * 输出: topo_v1.bin — 全精度 Int16 LE 二进制 (2164×4324, 值=高度米)
 *   - 海拔含负值(海平面以下), 故用带符号 Int16 (范围 ±32767, 足够覆盖 ±9000m)
 *   - 大小 ≈ 17.85 MB, 不打包进小程序, 上传云存储后由 app.js 懒加载
 *
 * 使用方法: node scripts/convertTopo.js
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = 'C:\\Users\\85256\\Downloads\\TOPO.dat';
const OUTPUT_BIN = path.join(__dirname, '..', 'topo_v1.bin');

const ROWS = 2164;
const COLS = 4324;

console.log('=== ITU-R P.1511 海拔数据转换 ===\n');

if (!fs.existsSync(INPUT_FILE)) {
  console.error('错误: 找不到输入文件', INPUT_FILE);
  process.exit(1);
}

console.log('读取 TOPO.dat ...');
const text = fs.readFileSync(INPUT_FILE, 'utf-8');
const lines = text.split('\n').filter(l => l.trim().length > 0);

if (lines.length !== ROWS) {
  console.error(`错误: TOPO.dat 行数 ${lines.length}, 期望 ${ROWS}`);
  process.exit(1);
}

console.log(`生成全精度 Int16 二进制 (${ROWS}×${COLS}) ...`);
const buf = Buffer.alloc(ROWS * COLS * 2); // Int16 = 2 bytes
let minVal = Infinity;
let maxVal = -Infinity;
let clipped = 0;

for (let r = 0; r < ROWS; r++) {
  const vals = lines[r].trim().split(/\s+/);
  if (vals.length !== COLS) {
    console.error(`错误: 第 ${r} 行列数 ${vals.length}, 期望 ${COLS}`);
    process.exit(1);
  }
  for (let c = 0; c < COLS; c++) {
    let v = Math.round(parseFloat(vals[c]));
    if (!isFinite(v)) v = 0;
    if (v > 32767) { v = 32767; clipped++; }
    if (v < -32768) { v = -32768; clipped++; }
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
    buf.writeInt16LE(v, (r * COLS + c) * 2);
  }
}

fs.writeFileSync(OUTPUT_BIN, buf);
console.log(`  输出: ${OUTPUT_BIN}`);
console.log(`  大小: ${(buf.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`  高度范围: ${minVal} ~ ${maxVal} m, 裁剪点数: ${clipped}`);
console.log('\n完成。请将 topo_v1.bin 上传到云存储, 并把 fileID 填入 app.js 的 TOPO_CLOUD_FILE。');

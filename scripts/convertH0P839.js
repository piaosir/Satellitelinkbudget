// convertH0P839.js
// 将 ITU-R P.839-4 的 h0.txt 转换为微信小程序可用的 JS 数据模块
// 用法: node scripts/convertH0P839.js <h0.txt路径>

const fs = require('fs');
const path = require('path');

const h0Path = process.argv[2] || 'C:\\Users\\85256\\Downloads\\R-REC-P.839-4-201309-I!!ZIP-E\\h0.txt';
const outPath = path.join(__dirname, '../miniprogram/data/isothermHeightGrid.js');

// 读取 h0.txt
const raw = fs.readFileSync(h0Path, 'utf8');
const lines = raw.trim().split(/\r?\n/);

const ROWS = 121;  // 90° to -90°, step 1.5°
const COLS = 241;  // 0° to 360°, step 1.5°

if (lines.length !== ROWS) {
  console.error(`行数不匹配: 期望 ${ROWS}, 实际 ${lines.length}`);
  process.exit(1);
}

// 解析数值并编码为 Uint16 (值 × 1000, 精度 0.001 km)
const buf = Buffer.alloc(ROWS * COLS * 2);
let offset = 0;

for (let r = 0; r < ROWS; r++) {
  const cols = lines[r].trim().split(/\s+/);
  if (cols.length !== COLS) {
    console.error(`第 ${r+1} 行列数不匹配: 期望 ${COLS}, 实际 ${cols.length}`);
    process.exit(1);
  }
  for (let c = 0; c < COLS; c++) {
    const val = parseFloat(cols[c]);
    if (isNaN(val)) {
      console.error(`第 ${r+1} 行第 ${c+1} 列解析失败: "${cols[c]}"`);
      process.exit(1);
    }
    // 编码: uint16 = round(val * 1000), 可表示 0.000 ~ 65.535 km
    const encoded = Math.round(val * 1000);
    buf.writeUInt16LE(encoded, offset);
    offset += 2;
  }
}

const base64 = buf.toString('base64');

// 生成 JS 文件
const output = `// isothermHeightGrid.js
// ITU-R P.839-4 零度等温线高度 h0 网格数据
// 自动生成，请勿手动编辑
// 生成时间: ${new Date().toISOString()}
//
// 网格: ${ROWS} 行 × ${COLS} 列
// 纬度: 90° 到 -90°, 步长 1.5° (行0 = 90°, 行120 = -90°)
// 经度: 0° 到 360°, 步长 1.5° (列0 = 0°, 列240 = 360°)
// 数据: h0 零度等温线年均高度 (km), uint16 × 1000 精度
// 编码: Base64 → ArrayBuffer → Uint16Array (LE)

const H0_ROWS = ${ROWS};
const H0_COLS = ${COLS};
const H0_LAT_START = 90;   // 第 0 行对应纬度
const H0_LAT_STEP = -1.5;  // 纬度步长（递减）
const H0_LON_START = 0;    // 第 0 列对应经度
const H0_LON_STEP = 1.5;   // 经度步长

// Base64 编码的 Uint16LE 网格数据 (值 = h0 × 1000)
const H0_BASE64 = '${base64}';

let _h0Data = null;

function getH0Data() {
  if (_h0Data) return _h0Data;
  if (typeof wx !== 'undefined' && wx.base64ToArrayBuffer) {
    // 微信小程序环境
    const ab = wx.base64ToArrayBuffer(H0_BASE64);
    _h0Data = new Uint16Array(ab);
  } else {
    // Node.js 环境
    const buf = Buffer.from(H0_BASE64, 'base64');
    _h0Data = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
  }
  return _h0Data;
}

module.exports = {
  H0_ROWS,
  H0_COLS,
  H0_LAT_START,
  H0_LAT_STEP,
  H0_LON_START,
  H0_LON_STEP,
  getH0Data
};
`;

fs.writeFileSync(outPath, output, 'utf8');
console.log(`✓ 已生成: ${outPath}`);
console.log(`  网格: ${ROWS} × ${COLS}, 数据大小: ${buf.length} 字节, Base64: ${base64.length} 字符`);

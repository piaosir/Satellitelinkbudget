// isothermHeight.js
// ITU-R P.839-4 零度等温线高度 h0 查询模块
// 数据来源: ITU-R P.839-4 Table 2 全球网格数据
// 网格精度: 1.5° × 1.5°

const {
  H0_ROWS, H0_COLS,
  H0_LAT_START, H0_LAT_STEP,
  H0_LON_START, H0_LON_STEP,
  getH0Data
} = require('../data/isothermHeightGrid');

/**
 * 双线性插值查询 h0 (Uint16Array, 值 = h0 × 1000)
 * @param {Uint16Array} data - 网格数据
 * @param {number} lat - 纬度 (-90 ~ +90)
 * @param {number} lon - 经度，归一化到 [0, 360)
 * @returns {number} h0 值 (km)
 */
function bilinearInterpolate(data, lat, lon) {
  // 浮点行/列索引 (行0 = 90°, 行120 = -90°)
  var rowF = (H0_LAT_START - lat) / (-H0_LAT_STEP);  // (90 - lat) / 1.5
  var colF = (lon - H0_LON_START) / H0_LON_STEP;      // lon / 1.5

  var r0 = Math.floor(rowF);
  var c0 = Math.floor(colF);
  var r1 = r0 + 1;
  var c1 = c0 + 1;

  // 边界裁剪
  r0 = Math.max(0, Math.min(H0_ROWS - 1, r0));
  r1 = Math.max(0, Math.min(H0_ROWS - 1, r1));
  c0 = Math.max(0, Math.min(H0_COLS - 1, c0));
  c1 = Math.max(0, Math.min(H0_COLS - 1, c1));

  var dy = rowF - Math.floor(rowF);
  var dx = colF - Math.floor(colF);

  // 四角值 (uint16 → km)
  var v00 = data[r0 * H0_COLS + c0] / 1000;
  var v10 = data[r0 * H0_COLS + c1] / 1000;
  var v01 = data[r1 * H0_COLS + c0] / 1000;
  var v11 = data[r1 * H0_COLS + c1] / 1000;

  return (1 - dy) * ((1 - dx) * v00 + dx * v10) +
         dy * ((1 - dx) * v01 + dx * v11);
}

/**
 * 查询指定位置的零度等温线高度 h0
 * @param {number} lat - 纬度 (-90 ~ +90)
 * @param {number} lon - 经度 (-180 ~ +180 或 0 ~ 360)
 * @returns {number} h0 (km), 即年均零度等温线高度
 */
function getIsothermHeight(lat, lon) {
  // 输入范围裁剪
  lat = Math.max(-90, Math.min(90, lat));
  // 归一化经度到 [0, 360)
  lon = ((lon % 360) + 360) % 360;

  var data = getH0Data();
  var h0 = bilinearInterpolate(data, lat, lon);

  // 保留三位小数
  return Math.round(h0 * 1000) / 1000;
}

module.exports = { getIsothermHeight };

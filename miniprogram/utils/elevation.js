// elevation.js
// ITU-R P.1511 地形高度(海拔)查询模块
// 数据来源: Earth2014 模型 (TOPO.dat, 5 arcmin 分辨率)
// 全精度数据(0.08333°)由 app.js 后台从云存储下载后注入; 未就绪时查询返回 null。

// ===== 全精度数据参数 =====
// 网格 2164 行 × 4324 列, 步长 1/12°(~0.08333°)
// "虚拟"左上角: 纬度 +90.125°, 经度 -180.125°
//   lat(row) = 90.125 - row/12 ; lon(col) = -180.125 + col/12
var FULL_ROWS = 2164;
var FULL_COLS = 4324;
var STEP = 1 / 12;          // 度/格
var LAT_TOP = 90.125;       // row 0 对应纬度
var LON_LEFT = -180.125;    // col 0 对应经度

// 全精度数据 (Int16Array, 值=高度米, 含负值)
var _fullData = null;

/**
 * 设置全精度海拔数据 (从 app.js 调用)
 * @param {ArrayBuffer} arrayBuffer - Int16 LE 二进制数据
 */
function setFullPrecisionElevation(arrayBuffer) {
  var expectedBytes = FULL_ROWS * FULL_COLS * 2; // Int16 = 2 bytes
  if (arrayBuffer && arrayBuffer.byteLength === expectedBytes) {
    _fullData = new Int16Array(arrayBuffer);
    console.log('[P.1511] 全精度海拔数据已加载:', FULL_ROWS, '×', FULL_COLS, '(int16 米)');
  } else {
    console.warn('[P.1511] 海拔数据大小不匹配: 期望', expectedBytes, '实际', arrayBuffer ? arrayBuffer.byteLength : 0);
  }
}

/**
 * 检查全精度数据是否就绪
 */
function isElevationReady() {
  return _fullData !== null;
}

/**
 * 双线性插值查询(工程近似, 标准建议双三次/P.1144, 此处用双线性已足够)
 * @param {number} lat - 查询纬度 (-90 ~ +90)
 * @param {number} lon - 查询经度 (-180 ~ +180)
 * @returns {number} 海拔(米)
 */
function bilinearInterpolate(lat, lon) {
  // 纬度 → 行索引(浮点, 纬度向下递减)
  var rowF = (LAT_TOP - lat) / STEP;
  // 经度 → 列索引(浮点)
  var colF = (lon - LON_LEFT) / STEP;

  var r0 = Math.floor(rowF);
  var c0 = Math.floor(colF);
  var r1 = r0 + 1;
  var c1 = c0 + 1;

  // 边界裁剪
  if (r0 < 0) r0 = 0;
  if (c0 < 0) c0 = 0;
  if (r0 >= FULL_ROWS) r0 = FULL_ROWS - 1;
  if (c0 >= FULL_COLS) c0 = FULL_COLS - 1;
  if (r1 < 0) r1 = 0;
  if (c1 < 0) c1 = 0;
  if (r1 >= FULL_ROWS) r1 = FULL_ROWS - 1;
  if (c1 >= FULL_COLS) c1 = FULL_COLS - 1;

  var dy = rowF - Math.floor(rowF);
  var dx = colF - Math.floor(colF);

  var v00 = _fullData[r0 * FULL_COLS + c0];
  var v10 = _fullData[r0 * FULL_COLS + c1];
  var v01 = _fullData[r1 * FULL_COLS + c0];
  var v11 = _fullData[r1 * FULL_COLS + c1];

  return (1 - dy) * ((1 - dx) * v00 + dx * v10) +
         dy * ((1 - dx) * v01 + dx * v11);
}

/**
 * 查询海拔(高于平均海平面)
 * @param {number} lat - 纬度 (-90 ~ +90)
 * @param {number} lon - 经度 (-180 ~ +180)
 * @returns {Object} { success, altitude(米), source } 数据未就绪时 success=false
 */
function queryElevation(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
    return { success: false, error: '无效的经纬度' };
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return { success: false, error: '经纬度超出范围' };
  }
  if (!_fullData) {
    return { success: false, error: '海拔数据未就绪' };
  }

  var raw = bilinearInterpolate(lat, lon);
  return {
    success: true,
    altitude: Math.round(raw),
    source: 'ITU-R P.1511 (Earth2014)',
    precision: '0.0833°'
  };
}

module.exports = {
  setFullPrecisionElevation,
  isElevationReady,
  queryElevation
};

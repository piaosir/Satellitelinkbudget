// rainRate.js
// ITU-R P.837-7 降雨率查询模块
// 数据来源: ITU-R P.837-7 R001 全球降雨率数字地图
// 支持两层数据: 全精度(0.125°) + 降采样回退(0.5°)

const {
  GRID_ROWS, GRID_COLS, GRID_STEP, LAT_MIN, LON_MIN, getGridData
} = require('../data/rainRateGrid');

// ===== 全精度数据参数 =====
const FULL_ROWS = 1441;
const FULL_COLS = 2881;
const FULL_STEP = 0.125;

// 全精度数据 (由 app.js 后台下载后注入)
// 格式: Uint16Array, 每个值 = R × 100 (0.01 mm/h 精度)
let _fullData = null;

/**
 * 设置全精度数据 (从 app.js 调用)
 * @param {ArrayBuffer} arrayBuffer - uint16 LE 二进制数据
 */
function setFullPrecisionData(arrayBuffer) {
  var expectedBytes = FULL_ROWS * FULL_COLS * 2; // uint16 = 2 bytes per point
  if (arrayBuffer && arrayBuffer.byteLength === expectedBytes) {
    _fullData = new Uint16Array(arrayBuffer);
    console.log('[P.837] 全精度数据已加载:', FULL_ROWS, '×', FULL_COLS, '(uint16×100)');
  } else {
    console.warn('[P.837] 全精度数据大小不匹配: 期望', expectedBytes, '实际', arrayBuffer ? arrayBuffer.byteLength : 0);
  }
}

/**
 * 检查全精度数据是否就绪
 */
function isFullDataReady() {
  return _fullData !== null;
}

/**
 * 双线性插值查询
 * @param {Uint8Array} grid - 网格数据
 * @param {number} rows - 行数
 * @param {number} cols - 列数
 * @param {number} step - 网格步长(度)
 * @param {number} lat - 查询纬度
 * @param {number} lon - 查询经度
 * @returns {number} 插值后的降雨率 (mm/h)
 */
function bilinearInterpolate(grid, rows, cols, step, lat, lon) {
  // 纬度 → 行索引 (浮点)
  var rowF = (lat - (-90)) / step;
  // 经度 → 列索引 (浮点)
  var colF = (lon - (-180)) / step;

  // 四角索引
  var r0 = Math.floor(rowF);
  var c0 = Math.floor(colF);
  var r1 = r0 + 1;
  var c1 = c0 + 1;

  // 边界裁剪
  if (r0 < 0) r0 = 0;
  if (c0 < 0) c0 = 0;
  if (r1 >= rows) r1 = rows - 1;
  if (c1 >= cols) c1 = cols - 1;
  if (r0 >= rows) r0 = rows - 1;
  if (c0 >= cols) c0 = cols - 1;

  // 插值权重
  var dy = rowF - Math.floor(rowF);
  var dx = colF - Math.floor(colF);

  // 四角值
  var v00 = grid[r0 * cols + c0];
  var v10 = grid[r0 * cols + c1];
  var v01 = grid[r1 * cols + c0];
  var v11 = grid[r1 * cols + c1];

  // 双线性插值
  var result = (1 - dy) * ((1 - dx) * v00 + dx * v10) +
               dy * ((1 - dx) * v01 + dx * v11);

  return result;
}

/**
 * 查询降雨率 R0.01 (0.01%时间超过的降雨率)
 * 优先使用全精度数据(0.125°)，自动回退到降采样数据(0.5°)
 *
 * @param {number} lat - 纬度 (-90 ~ +90)
 * @param {number} lon - 经度 (-180 ~ +180)
 * @returns {Object} { rainRate, source, precision }
 */
function queryRainRate(lat, lon) {
  if (_fullData) {
    // _fullData 是 Uint16Array, 值 = R × 100
    var rawRate = bilinearInterpolate(_fullData, FULL_ROWS, FULL_COLS, FULL_STEP, lat, lon);
    var rate = Math.round(rawRate / 100 * 1000) / 1000; // 还原并保留3位小数
    return {
      rainRate: rate,
      source: 'ITU-R P.837-7',
      precision: '0.125°'
    };
  }

  // 回退: 使用内嵌降采样数据 (uint8 整数精度)
  var gridData = getGridData();
  var rawRate = bilinearInterpolate(gridData, GRID_ROWS, GRID_COLS, GRID_STEP, lat, lon);
  var rate = Math.round(rawRate * 1000) / 1000; // 保留3位小数
  return {
    rainRate: rate,
    source: 'ITU-R P.837-7 (近似)',
    precision: '0.5°'
  };
}

/**
 * 计算指定位置的降雨率 (兼容旧接口)
 * @param {number} lat - 纬度
 * @param {number} lon - 经度
 * @returns {Object}
 */
function calculateRainRate(lat, lon) {
  var result = queryRainRate(lat, lon);
  return {
    rainRate: result.rainRate,
    distance: 0,
    nearestPoint: { lon: lon, lat: lat },
    isEquatorialZone: false
  };
}

/**
 * 估算降雨率（用于小程序）
 * @param {number} lat - 纬度
 * @param {number} lon - 经度
 * @param {number} [oldRainRate] - 可选，旧的降雨率值
 * @returns {Object} 包含降雨率和数据源信息
 */
function estimateRainRate(lat, lon, oldRainRate) {
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return { success: false, error: '无效的经纬度' };
  }
  if (lat < -90 || lat > 90) {
    return { success: false, error: '纬度必须在-90到90之间' };
  }
  if (lon < -180 || lon > 180) {
    return { success: false, error: '经度必须在-180到180之间' };
  }

  var result = queryRainRate(lat, lon);
  var finalRainRate = result.rainRate;
  var changed = true;

  // 如果提供了旧降雨率，且新旧差值小于10，保持旧值不变
  if (typeof oldRainRate === 'number' && oldRainRate > 0) {
    var diff = Math.abs(result.rainRate - oldRainRate);
    if (diff < 10) {
      finalRainRate = oldRainRate;
      changed = false;
    }
  }

  return {
    success: true,
    rainRate: finalRainRate,
    calculatedRainRate: result.rainRate,
    changed: changed,
    distance: 0,
    nearestPoint: { lon: lon, lat: lat },
    isEquatorialZone: false,
    source: result.source,
    precision: result.precision
  };
}

/**
 * 获取降雨率信息 (兼容旧 getNearestCityInfo 接口)
 * @param {number} lat - 纬度
 * @param {number} lon - 经度
 * @returns {Object}
 */
function getNearestCityInfo(lat, lon) {
  var result = queryRainRate(lat, lon);
  return {
    rainRate: result.rainRate,
    distance: 0,
    nearestPoint: { lon: lon, lat: lat },
    isEquatorialZone: false,
    source: result.source,
    precision: result.precision
  };
}

/**
 * Haversine距离计算函数 (保留，其他模块可能引用)
 */
function haversine(lat1, lon1, lat2, lon2) {
  var R = 6371e3;
  var φ1 = lat1 * Math.PI / 180;
  var φ2 = lat2 * Math.PI / 180;
  var Δφ = (lat2 - lat1) * Math.PI / 180;
  var Δλ = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = {
  estimateRainRate,
  calculateRainRate,
  haversine,
  getNearestCityInfo,
  // 新增接口
  setFullPrecisionData,
  isFullDataReady,
  queryRainRate
};

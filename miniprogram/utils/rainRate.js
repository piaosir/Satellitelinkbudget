// rainRate.js
// 降雨率自动估算模块 - 从 index.html 提取

/**
 * 全球降雨率参考点数据
 * 数据结构：前N*2个数字是N个点的经纬度（经度、纬度交替），后N个数字是对应的降雨率(R0.01 mm/h)
 * 总计: 188个城市点
 */
const RAIN_DATA = [
  // ========== 经度、纬度数据 ==========
  // 中国原有城市 - 北京至兰州
  116.47, 39.9, 117.18, 39.15, 114.47, 38.03, 119.51, 39.95, 112.57, 37.87,
  113.28, 40.1, 111.78, 40.82, 118.97, 42.28, 123.4, 41.83, 121.62, 38.92,
  124.38, 40.13, 125.32, 43.88, 126.68, 45.75, 123.9, 47.32, 125.13, 46.58,
  130.37, 46.82, 129.62, 44.6, 122.43, 53.58, 121.48, 31.22, 118.78, 32.04,
  117.2, 34.26, 119.16, 34.59, 120.3, 31.57, 120.15, 30.28, 121.56, 29.86,
  117.27, 31.86, 118.18, 30.16, 119.3, 26.08, 118.08, 24.46, 115.89, 28.68,
  117, 36.65, 120.3, 36.07, 113.65, 34.76, 112.44, 34.68, 114.31, 30.52,
  110.79, 32.66, 111.3, 30.7, 113, 28.21, 113.03, 25.7, 112.62, 26.89,
  113.33, 23.17, 116.69, 23.39, 110.35, 21.27, 114.07, 22.62, 113.52, 22.3,
  110.35, 20.02, 108.29, 22.84, 109.4, 24.33, 109.12, 21.49, 104.06, 30.57,
  106.54, 29.56, 101.71, 26.58, 102.23, 27.92, 106.71, 26.58, 102.73, 25.04,
  103.2, 23.39, 91.0, 29.66, 108.95, 34.27, 107.15, 34.36, 103.73, 36.03,
  // 中国原有城市续 - 酒泉至西沙
  98.53, 39.74, 101.74, 36.56, 94.9, 36.42, 106.27, 38.47, 87.68, 43.77,
  75.99, 39.47, 121.5, 25.05, 114.17, 22.28, 102.6, 17.96, 51.41, 35.7,
  139.69, 35.68, 30, -3.42, 151.21, -33.87, 144.96, -37.81, 120.98, 14.60,
  77.21, 28.61, 72.88, 19.08, 73.05, 33.68, 55.27, 25.20, 46.68, 24.71,
  37.62, 55.76, 139.69, 35.69, 126.98, 37.57, 125.75, 39.03, 135.50, 34.69,
  141.35, 43.06, 126.52, 33.50, 112.33, 16.83,
  // 中国新增城市 - 海口至大同
  110.33, 20.03, 118.09, 24.48, 118.59, 24.87, 117.65, 24.52, 110.36, 21.27,
  113.58, 22.27, 113.12, 23.02, 113.75, 23.04, 113.38, 22.52, 114.42, 23.11,
  106.63, 26.65, 102.83, 24.88, 108.33, 22.82, 109.42, 24.33, 110.29, 25.27,
  106.93, 27.73, 103.82, 36.06, 106.23, 38.47, 101.78, 36.62, 91.13, 29.65,
  87.62, 43.82, 111.75, 40.85, 109.83, 40.66, 109.78, 39.61, 113.30, 40.08,
  // 中东地区 - 迪拜至伊斯法罕
  55.27, 25.20, 54.37, 24.45, 51.53, 25.29, 47.98, 29.37, 50.58, 26.23,
  46.72, 24.69, 39.17, 21.54, 39.83, 21.43, 39.61, 24.47, 58.41, 23.59,
  44.21, 15.35, 45.03, 12.78, 35.93, 31.95, 36.29, 33.51, 35.50, 33.89,
  44.37, 33.31, 47.79, 30.51, 51.39, 35.69, 52.53, 29.62, 59.57, 36.30,
  51.68, 32.65,
  // 北非地区 - 开罗至拉巴特
  31.24, 30.05, 29.92, 31.20, 32.90, 24.09, 32.64, 25.69, 13.19, 32.89,
  20.07, 32.12, 10.17, 36.80, 3.06, 36.75, -7.62, 33.59, -6.83, 34.02,
  // 撒哈拉以南非洲 - 内罗毕至安塔那那利佛
  36.82, -1.29, 39.67, -4.04, 39.28, -6.82, 39.19, -6.16, 32.58, 0.32,
  30.06, -1.95, 38.76, 9.01, 43.15, 11.59, 3.39, 6.45, 7.49, 9.06,
  -0.19, 5.56, -4.03, 5.32, -17.44, 14.69, 15.31, -4.32, 28.05, -26.20,
  18.42, -33.93, 31.02, -29.86, 57.50, -20.16, 47.52, -18.91,
  // 东南亚地区 - 曼谷至仰光
  100.50, 13.75, 98.99, 18.79, 98.39, 7.89, 100.90, 12.93, 105.85, 21.03,
  106.66, 10.82, 108.22, 16.07, 106.85, -6.21, 112.75, -7.25, 107.60, -6.92,
  115.09, -8.35, 98.67, 3.59, 104.76, -2.99, 101.69, 3.14, 100.33, 5.42,
  103.76, 1.49, 116.07, 5.98, 110.35, 1.55, 103.82, 1.35, 120.98, 14.60,
  123.90, 10.32, 125.61, 7.07, 104.92, 11.56, 102.60, 17.97, 96.16, 16.80,
  
  // ========== 降雨率数据 R0.01 (mm/h) ==========
  // 中国原有城市降雨率 - 北京至兰州
  40, 45, 36, 50, 27, 25, 19, 47, 47, 50,
  50, 40, 35, 27, 30, 34, 43, 20, 55, 53,
  50, 55, 55, 55, 55, 53, 54, 63, 65, 57,
  50, 55, 45, 43, 55, 45, 55, 53, 53, 70,
  80, 73, 83, 85, 81, 95, 68, 65, 85, 40,
  52, 37, 37, 47, 41, 37, 8, 36, 22, 16,
  // 中国原有城市续降雨率 - 酒泉至西沙
  8, 11, 8, 14, 9, 7, 95, 85, 72, 22,
  55, 49, 28, 22, 82, 50, 80, 60, 20, 11,
  32, 55, 48, 51, 50, 65, 40, 87,
  // 中国新增城市降雨率 - 海口至大同
  86, 63, 61, 65, 83, 77, 74, 75, 76, 72,
  47, 41, 68, 65, 59, 43, 16, 14, 11, 7,
  9, 20, 18, 16, 22,
  // 中东地区降雨率 - 迪拜至伊斯法罕
  20, 18, 16, 14, 18, 11, 25, 28, 16, 22,
  38, 48, 25, 20, 32, 16, 14, 22, 20, 16, 18,
  // 北非地区降雨率 - 开罗至拉巴特
  20, 25, 6, 5, 28, 25, 34, 38, 40, 43,
  // 撒哈拉以南非洲降雨率 - 内罗毕至安塔那那利佛
  48, 62, 65, 68, 52, 49, 38, 28,
  68, 58, 65, 70, 45, 68, 42, 30, 55, 62, 56,
  // 东南亚地区降雨率 - 曼谷至仰光
  87, 65, 95, 80, 75, 82, 78,
  80, 77, 74, 70, 81, 90,
  90, 82, 95, 85, 90, 103.7,
  82, 85, 88, 78, 72, 82
];

/**
 * 解析降雨率数据
 * @returns {Object} { cities: Array, rainRates: Array }
 */
function parseRainData() {
  const totalCities = Math.floor(RAIN_DATA.length / 3);
  const cities = [];
  const rainRates = [];
  
  for (let i = 0; i < totalCities; i++) {
    const lon = RAIN_DATA[2 * i];           // 经度
    const lat = RAIN_DATA[2 * i + 1];       // 纬度
    const rate = RAIN_DATA[2 * totalCities + i];  // 降雨率（位于数组后半部分）
    cities.push({ lon, lat });
    rainRates.push(rate);
  }
  
  return { cities, rainRates };
}

// 解析数据
const { cities, rainRates } = parseRainData();

/**
 * Haversine距离计算函数
 * 计算地球表面两点之间的距离
 * @param {number} lat1 - 第一个点的纬度
 * @param {number} lon1 - 第一个点的经度
 * @param {number} lat2 - 第二个点的纬度
 * @param {number} lon2 - 第二个点的经度
 * @returns {number} 距离（米）
 */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // 地球半径，单位米
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

/**
 * 计算指定位置的降雨率
 * @param {number} lat - 纬度
 * @param {number} lon - 经度
 * @returns {Object} { rainRate: number, distance: number, nearestPoint: Object }
 */
function calculateRainRate(lat, lon) {
  // 首先查找最近的参考点
  let minDistance = Infinity;
  let closestIndex = -1;
  
  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];
    const distance = haversine(lat, lon, city.lat, city.lon);
    
    if (distance < minDistance) {
      minDistance = distance;
      closestIndex = i;
    }
  }
  
  // 如果找到近距离参考点（100km以内），优先使用精确数据
  if (closestIndex !== -1 && minDistance < 100000) {
    return {
      rainRate: rainRates[closestIndex],
      distance: minDistance,
      nearestPoint: cities[closestIndex],
      isEquatorialZone: false
    };
  }
  
  // 特殊赤道区域处理（仅当没有近距离精确数据时）
  // 如果在赤道带（纬度±14度）且在特定经度范围内，返回固定值90 mm/h
  if (lat > -14 && lat < 14 &&
      ((lon >= 90 && lon <= 180) ||
       (lon >= 15 && lon <= 28) ||
       (lon >= -70 && lon <= -50) ||
       (lon >= -160 && lon <= -80))) {
    return {
      rainRate: 90,
      distance: 0,
      nearestPoint: { lon, lat },
      isEquatorialZone: true
    };
  }
  
  // 使用最近的参考点
  if (closestIndex === -1) {
    return {
      rainRate: 0,
      distance: 0,
      nearestPoint: null,
      isEquatorialZone: false
    };
  }
  
  return {
    rainRate: rainRates[closestIndex],
    distance: minDistance,
    nearestPoint: cities[closestIndex],
    isEquatorialZone: false
  };
}

/**
 * 估算降雨率（用于小程序）
 * @param {number} lat - 纬度
 * @param {number} lon - 经度
 * @param {number} [oldRainRate] - 可选，旧的降雨率值，用于判断是否需要更新
 * @returns {Object} 包含降雨率和距离信息
 */
function estimateRainRate(lat, lon, oldRainRate) {
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return {
      success: false,
      error: '无效的经纬度'
    };
  }
  
  if (lat < -90 || lat > 90) {
    return {
      success: false,
      error: '纬度必须在-90到90之间'
    };
  }
  
  if (lon < -180 || lon > 180) {
    return {
      success: false,
      error: '经度必须在-180到180之间'
    };
  }
  
  const result = calculateRainRate(lat, lon);
  let finalRainRate = result.rainRate;
  let changed = true;
  
  // 如果提供了旧降雨率，且新旧差值小于10，保持旧值不变
  if (typeof oldRainRate === 'number' && oldRainRate > 0) {
    const diff = Math.abs(result.rainRate - oldRainRate);
    if (diff < 10) {
      finalRainRate = oldRainRate;
      changed = false;
    }
  }
  
  return {
    success: true,
    rainRate: finalRainRate,
    calculatedRainRate: result.rainRate, // 实际计算值（供调试用）
    changed: changed, // 是否发生了变化
    distance: Math.round(result.distance / 1000), // 转换为公里
    nearestPoint: result.nearestPoint,
    isEquatorialZone: result.isEquatorialZone
  };
}

/**
 * 获取最近城市的降雨率信息
 * @param {number} lat - 纬度
 * @param {number} lon - 经度
 * @returns {Object} 包含降雨率、距离和最近点信息
 */
function getNearestCityInfo(lat, lon) {
  const result = calculateRainRate(lat, lon);
  
  return {
    rainRate: result.rainRate,
    distance: Math.round(result.distance / 1000), // 转换为公里
    nearestPoint: result.nearestPoint,
    isEquatorialZone: result.isEquatorialZone || false
  };
}

module.exports = {
  estimateRainRate,
  calculateRainRate,
  haversine,
  getNearestCityInfo
};

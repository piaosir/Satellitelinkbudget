// rainRate.js
// 降雨率自动估算模块 - 从 index.html 提取

/**
 * 全球降雨率参考点数据
 * 数据结构：前220个数字是110个点的经纬度（经度、纬度交替），后110个数字是对应的降雨率
 */
const RAIN_DATA = [
  // 经度、纬度数据（110个点 × 2 = 220个值）
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
  98.53, 39.74, 101.74, 36.56, 94.9, 36.42, 106.27, 38.47, 87.68, 43.77, 
  75.99, 39.47, 121.5, 25.05, 114.17, 22.28, 102.6, 17.96, 51.41, 35.7, 
  139.69, 35.68, 30, -3.42, 151.2093, -33.8688, 144.9631, -37.8136, 
  120.9842, 14.5995, 77.2090, 28.6139, 72.8777, 19.0760, 73.0479, 33.6844, 
  55.2708, 25.2048, 46.6753, 24.7136, 37.6173, 55.7558, 139.692, 35.689, 
  126.98, 37.57, 125.75, 39.03, 135.50, 34.69, 141.35, 43.06, 126.52, 33.50, 
  112.33, 16.83,
  // 降雨率数据（110个值）
  40, 45, 36, 50, 27, 25, 19, 47, 47, 50, 50, 40, 35, 27, 30, 34, 43, 20, 
  55, 53, 50, 55, 55, 55, 55, 53, 54, 63, 65, 57, 50, 55, 45, 43, 55, 45, 
  55, 53, 53, 70, 80, 73, 95, 85, 81, 95, 75, 72, 85, 40, 52, 37, 37, 55, 
  45, 37, 13, 36, 22, 15, 3, 10, 3, 23, 2, 2, 95, 95, 93, 18, 55, 53, 28, 
  22, 85, 50, 80, 60, 38, 18, 32, 48, 51, 50, 65, 40, 53, 87
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
  // 特殊赤道区域处理
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
  
  // 查找最近的参考点
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
 * @returns {Object} 包含降雨率和距离信息
 */
function estimateRainRate(lat, lon) {
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
  
  return {
    success: true,
    rainRate: result.rainRate,
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

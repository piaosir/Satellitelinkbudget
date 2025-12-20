// cities.js
// 城市数据 - 从 index.html 提取

const CITIES_DATA = [
  // 中国省会及主要城市 (60个)
  { name: "北京", lat: 39.904, lon: 116.407, alt: 43.5 },
  { name: "上海", lat: 31.230, lon: 121.473, alt: 4.0 },
  { name: "天津", lat: 39.084, lon: 117.201, alt: 5.0 },
  { name: "重庆", lat: 29.563, lon: 106.551, alt: 237.0 },
  { name: "哈尔滨", lat: 45.803, lon: 126.535, alt: 150.0 },
  { name: "长春", lat: 43.817, lon: 125.324, alt: 215.0 },
  { name: "沈阳", lat: 41.805, lon: 123.431, alt: 55.0 },
  { name: "呼和浩特", lat: 40.842, lon: 111.749, alt: 1065.0 },
  { name: "石家庄", lat: 38.042, lon: 114.514, alt: 83.0 },
  { name: "乌鲁木齐", lat: 43.825, lon: 87.617, alt: 800.0 },
  { name: "兰州", lat: 36.061, lon: 103.834, alt: 1520.0 },
  { name: "西宁", lat: 36.623, lon: 101.779, alt: 2275.0 },
  { name: "西安", lat: 34.342, lon: 108.940, alt: 400.0 },
  { name: "银川", lat: 38.487, lon: 106.232, alt: 1112.0 },
  { name: "郑州", lat: 34.746, lon: 113.625, alt: 110.0 },
  { name: "济南", lat: 36.651, lon: 117.120, alt: 58.0 },
  { name: "太原", lat: 37.870, lon: 112.549, alt: 800.0 },
  { name: "合肥", lat: 31.821, lon: 117.227, alt: 37.0 },
  { name: "武汉", lat: 30.593, lon: 114.305, alt: 37.0 },
  { name: "长沙", lat: 28.228, lon: 112.939, alt: 66.0 },
  { name: "南京", lat: 32.060, lon: 118.797, alt: 20.0 },
  { name: "成都", lat: 30.572, lon: 104.066, alt: 500.0 },
  { name: "贵阳", lat: 26.647, lon: 106.630, alt: 1070.0 },
  { name: "昆明", lat: 25.043, lon: 102.832, alt: 1892.0 },
  { name: "南宁", lat: 22.817, lon: 108.366, alt: 72.0 },
  { name: "拉萨", lat: 29.645, lon: 91.117, alt: 3650.0 },
  { name: "杭州", lat: 30.274, lon: 120.155, alt: 19.0 },
  { name: "南昌", lat: 28.683, lon: 115.858, alt: 50.0 },
  { name: "广州", lat: 23.129, lon: 113.264, alt: 21.0 },
  { name: "福州", lat: 26.075, lon: 119.296, alt: 10.0 },
  { name: "台北", lat: 25.033, lon: 121.565, alt: 10.0 },
  { name: "海口", lat: 20.020, lon: 110.320, alt: 14.0 },
  { name: "香港", lat: 22.319, lon: 114.169, alt: 32.0 },
  { name: "澳门", lat: 22.199, lon: 113.544, alt: 22.0 },
  { name: "大连", lat: 38.914, lon: 121.615, alt: 93.0 },
  { name: "青岛", lat: 36.067, lon: 120.383, alt: 76.0 },
  { name: "宁波", lat: 29.868, lon: 121.544, alt: 150.0 },
  { name: "厦门", lat: 24.480, lon: 118.089, alt: 63.0 },
  { name: "深圳", lat: 22.543, lon: 114.058, alt: 17.0 },
  { name: "珠海", lat: 22.271, lon: 113.576, alt: 36.0 },
  { name: "汕头", lat: 23.354, lon: 116.682, alt: 51.0 },
  { name: "三亚", lat: 18.253, lon: 109.504, alt: 7.0 },
  { name: "桂林", lat: 25.234, lon: 110.180, alt: 153.0 },
  { name: "张家界", lat: 29.117, lon: 110.479, alt: 183.0 },
  { name: "丽江", lat: 26.855, lon: 100.228, alt: 2400.0 },
  { name: "敦煌", lat: 40.142, lon: 94.662, alt: 1140.0 },
  { name: "喀什", lat: 39.468, lon: 75.994, alt: 1289.0 },
  { name: "林芝", lat: 29.654, lon: 94.361, alt: 3000.0 },
  { name: "日喀则", lat: 29.267, lon: 88.881, alt: 3836.0 },
  { name: "阿里", lat: 32.501, lon: 80.106, alt: 4278.0 },
  { name: "那曲", lat: 31.476, lon: 92.071, alt: 4507.0 },
  { name: "昌都", lat: 31.141, lon: 97.172, alt: 3240.0 },
  { name: "山南", lat: 29.237, lon: 91.773, alt: 3700.0 },
  { name: "嘉峪关", lat: 39.773, lon: 98.290, alt: 1700.0 },
  { name: "酒泉", lat: 39.734, lon: 98.500, alt: 1477.0 },
  { name: "西昌", lat: 27.892, lon: 102.265, alt: 1590.0 },
  { name: "文昌", lat: 19.613, lon: 110.750, alt: 34.0 },
  { name: "苏州", lat: 31.299, lon: 120.585, alt: 6.0 },
  { name: "徐州", lat: 34.205, lon: 117.284, alt: 41.0 },
  { name: "怀来", lat: 40.415, lon: 115.517, alt: 535.0 },
  
  // 国际主要城市 (50个)
  { name: "东京", lat: 35.689, lon: 139.692, alt: 40.0 },
  { name: "首尔", lat: 37.566, lon: 126.978, alt: 38.0 },
  { name: "曼谷", lat: 13.756, lon: 100.502, alt: 2.0 },
  { name: "新加坡", lat: 1.352, lon: 103.819, alt: 15.0 },
  { name: "吉隆坡", lat: 3.139, lon: 101.687, alt: 22.0 },
  { name: "雅加达", lat: -6.208, lon: 106.845, alt: 8.0 },
  { name: "马尼拉", lat: 14.599, lon: 120.984, alt: 16.0 },
  { name: "河内", lat: 21.028, lon: 105.854, alt: 16.0 },
  { name: "胡志明市", lat: 10.823, lon: 106.629, alt: 19.0 },
  { name: "新德里", lat: 28.613, lon: 77.209, alt: 216.0 },
  { name: "孟买", lat: 19.076, lon: 72.877, alt: 14.0 },
  { name: "伊斯兰堡", lat: 33.684, lon: 73.047, alt: 507.0 },
  { name: "卡拉奇", lat: 24.861, lon: 67.010, alt: 8.0 },
  { name: "迪拜", lat: 25.204, lon: 55.271, alt: 5.0 },
  { name: "利雅得", lat: 24.713, lon: 46.675, alt: 612.0 },
  { name: "德黑兰", lat: 35.689, lon: 51.389, alt: 1200.0 },
  { name: "安卡拉", lat: 39.933, lon: 32.859, alt: 938.0 },
  { name: "伊斯坦布尔", lat: 41.008, lon: 28.978, alt: 40.0 },
  { name: "莫斯科", lat: 55.755, lon: 37.617, alt: 156.0 },
  { name: "圣彼得堡", lat: 59.934, lon: 30.335, alt: 3.0 },
  { name: "柏林", lat: 52.520, lon: 13.405, alt: 34.0 },
  { name: "巴黎", lat: 48.856, lon: 2.352, alt: 35.0 },
  { name: "伦敦", lat: 51.507, lon: -0.128, alt: 24.0 },
  { name: "罗马", lat: 41.902, lon: 12.496, alt: 21.0 },
  { name: "马德里", lat: 40.416, lon: -3.703, alt: 667.0 },
  { name: "里斯本", lat: 38.722, lon: -9.139, alt: 2.0 },
  { name: "阿姆斯特丹", lat: 52.367, lon: 4.904, alt: -2.0 },
  { name: "布鲁塞尔", lat: 50.850, lon: 4.351, alt: 13.0 },
  { name: "维也纳", lat: 48.208, lon: 16.373, alt: 171.0 },
  { name: "日内瓦", lat: 46.204, lon: 6.143, alt: 375.0 },
  { name: "斯德哥尔摩", lat: 59.329, lon: 18.068, alt: 28.0 },
  { name: "奥斯陆", lat: 59.913, lon: 10.752, alt: 23.0 },
  { name: "赫尔辛基", lat: 60.169, lon: 24.938, alt: 17.0 },
  { name: "哥本哈根", lat: 55.676, lon: 12.568, alt: 14.0 },
  { name: "华沙", lat: 52.229, lon: 21.012, alt: 113.0 },
  { name: "布拉格", lat: 50.075, lon: 14.437, alt: 177.0 },
  { name: "布达佩斯", lat: 47.497, lon: 19.040, alt: 102.0 },
  { name: "雅典", lat: 37.983, lon: 23.727, alt: 70.0 },
  { name: "开罗", lat: 30.044, lon: 31.236, alt: 23.0 },
  { name: "约翰内斯堡", lat: -26.204, lon: 28.047, alt: 1753.0 },
  { name: "内罗毕", lat: -1.286, lon: 36.817, alt: 1795.0 },
  { name: "华盛顿", lat: 38.907, lon: -77.037, alt: 20.0 },
  { name: "纽约", lat: 40.712, lon: -74.006, alt: 10.0 },
  { name: "洛杉矶", lat: 34.052, lon: -118.244, alt: 93.0 },
  { name: "芝加哥", lat: 41.878, lon: -87.629, alt: 182.0 },
  { name: "多伦多", lat: 43.653, lon: -79.383, alt: 76.0 },
  { name: "温哥华", lat: 49.282, lon: -123.121, alt: 2.0 },
  { name: "墨西哥城", lat: 19.432, lon: -99.133, alt: 2240.0 },
  { name: "里约热内卢", lat: -22.906, lon: -43.173, alt: 2.0 },
  { name: "布宜诺斯艾利斯", lat: -34.603, lon: -58.382, alt: 25.0 },
  { name: "悉尼", lat: -33.868, lon: 151.209, alt: 6.0 },
  { name: "墨尔本", lat: -37.813, lon: 144.963, alt: 31.0 }
];

/**
 * 获取所有城市列表
 */
function getAllCities() {
  return CITIES_DATA;
}

/**
 * 获取中国城市列表
 */
function getChinaCities() {
  return CITIES_DATA.slice(0, 60);
}

/**
 * 获取国际城市列表
 */
function getInternationalCities() {
  return CITIES_DATA.slice(60);
}

/**
 * 根据城市名称查找城市信息
 */
function getCityByName(name) {
  return CITIES_DATA.find(city => city.name === name);
}

/**
 * 搜索城市（支持模糊搜索）
 */
function searchCities(keyword) {
  if (!keyword || keyword.trim() === '') {
    return CITIES_DATA;
  }
  
  const lowerKeyword = keyword.toLowerCase().trim();
  return CITIES_DATA.filter(city => 
    city.name.toLowerCase().includes(lowerKeyword)
  );
}

module.exports = {
  CITIES_DATA,
  getAllCities,
  getChinaCities,
  getInternationalCities,
  getCityByName,
  searchCities
};

// coverageSettingsCache.js
// 卫星覆盖设置本地缓存管理工具

const CACHE_KEY = 'satellite_coverage_settings';
const CACHE_VERSION = '1.0';

/**
 * 获取所有卫星的覆盖设置缓存
 * @returns {Object} 缓存对象，key为卫星名称
 */
function getAllSettings() {
  try {
    const cache = wx.getStorageSync(CACHE_KEY);
    if (cache && cache.version === CACHE_VERSION) {
      return cache.settings || {};
    }
    return {};
  } catch (e) {
    console.error('读取覆盖设置缓存失败:', e);
    return {};
  }
}

/**
 * 获取指定卫星的覆盖设置
 * @param {string} satelliteName - 卫星名称
 * @returns {Object|null} 卫星的覆盖设置
 */
function getSettings(satelliteName) {
  const allSettings = getAllSettings();
  return allSettings[satelliteName] || null;
}

/**
 * 保存卫星的覆盖设置
 * @param {string} satelliteName - 卫星名称
 * @param {Object} settings - 覆盖设置
 */
function saveSettings(satelliteName, settings) {
  try {
    const allSettings = getAllSettings();
    
    allSettings[satelliteName] = {
      ...settings,
      lastModified: new Date().toISOString()
    };
    
    wx.setStorageSync(CACHE_KEY, {
      version: CACHE_VERSION,
      settings: allSettings,
      lastUpdated: new Date().toISOString()
    });
    
    console.log(`已保存 ${satelliteName} 的覆盖设置缓存`);
    return true;
  } catch (e) {
    console.error('保存覆盖设置缓存失败:', e);
    return false;
  }
}

/**
 * 删除指定卫星的覆盖设置
 * @param {string} satelliteName - 卫星名称
 */
function deleteSettings(satelliteName) {
  try {
    const allSettings = getAllSettings();
    
    if (allSettings[satelliteName]) {
      delete allSettings[satelliteName];
      
      wx.setStorageSync(CACHE_KEY, {
        version: CACHE_VERSION,
        settings: allSettings,
        lastUpdated: new Date().toISOString()
      });
      
      console.log(`已删除 ${satelliteName} 的覆盖设置缓存`);
    }
    return true;
  } catch (e) {
    console.error('删除覆盖设置缓存失败:', e);
    return false;
  }
}

/**
 * 清除所有覆盖设置缓存
 */
function clearAllSettings() {
  try {
    wx.removeStorageSync(CACHE_KEY);
    console.log('已清除所有覆盖设置缓存');
    return true;
  } catch (e) {
    console.error('清除覆盖设置缓存失败:', e);
    return false;
  }
}

/**
 * 获取缓存统计信息
 * @returns {Object} 统计信息
 */
function getCacheStats() {
  const allSettings = getAllSettings();
  const satelliteNames = Object.keys(allSettings);
  
  return {
    count: satelliteNames.length,
    satellites: satelliteNames,
    lastUpdated: allSettings.lastUpdated || null
  };
}

/**
 * 创建默认的覆盖设置对象
 * @returns {Object} 默认设置
 */
function createDefaultSettings() {
  return {
    selectedBand: '',
    selectedBeams: [],
    selectedType: 'EIRP',
    selectedGainValues: [],
    showElevationContours: false,
    elevationAngles: [3, 5, 10, 15],
    showCoverageContours: false,
    showBeamLabels: false,
    mapScale: 3,
    mapCenter: null // { latitude, longitude }
  };
}

/**
 * 合并用户设置和默认设置
 * @param {Object} userSettings - 用户设置
 * @returns {Object} 合并后的设置
 */
function mergeWithDefaults(userSettings) {
  const defaults = createDefaultSettings();
  
  if (!userSettings) {
    return defaults;
  }
  
  return {
    ...defaults,
    ...userSettings
  };
}

module.exports = {
  getSettings,
  saveSettings,
  deleteSettings,
  getAllSettings,
  clearAllSettings,
  getCacheStats,
  createDefaultSettings,
  mergeWithDefaults
};

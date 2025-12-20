// utils/formatter.js
// 数据格式化工具函数

/**
 * 格式化数字，保留指定小数位
 * @param {number} value - 待格式化的值
 * @param {number} decimals - 小数位数，默认2位
 * @returns {string} 格式化后的字符串
 */
function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) {
    return '-';
  }
  return Number(value).toFixed(decimals);
}

/**
 * 格式化科学计数法
 * @param {number} value - 待格式化的值
 * @param {number} exponent - 指数部分
 * @returns {string} 格式化后的字符串，如 1×10⁻⁷
 */
function formatScientific(value, exponent) {
  if (exponent === null || exponent === undefined) {
    return formatNumber(value);
  }
  
  const superscripts = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '-': '⁻', '+': '⁺'
  };
  
  const expStr = String(exponent).split('').map(char => superscripts[char] || char).join('');
  return `${value}×10${expStr}`;
}

/**
 * 格式化BER（误码率）
 * @param {number} exponent - BER的指数部分
 * @returns {string} 格式化后的字符串
 */
function formatBER(exponent) {
  return formatScientific(1, -Math.abs(exponent));
}

/**
 * 格式化百分比
 * @param {number} value - 待格式化的值（0-100）
 * @param {number} decimals - 小数位数，默认2位
 * @returns {string} 格式化后的字符串
 */
function formatPercent(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) {
    return '-';
  }
  return `${formatNumber(value, decimals)}%`;
}

/**
 * 格式化日期时间
 * @param {Date|string|number} date - 日期对象或时间戳
 * @param {string} format - 格式，默认 'YYYY-MM-DD HH:mm:ss'
 * @returns {string} 格式化后的日期字符串
 */
function formatDateTime(date, format = 'YYYY-MM-DD HH:mm:ss') {
  if (!date) {
    return '-';
  }
  
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    return '-';
  }
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的文件大小
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  if (!bytes) return '-';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * 格式化坐标
 * @param {number} longitude - 经度
 * @param {number} latitude - 纬度
 * @returns {string} 格式化后的坐标字符串
 */
function formatCoordinate(longitude, latitude) {
  if (longitude === null || longitude === undefined || 
      latitude === null || latitude === undefined) {
    return '-';
  }
  
  const lonDir = longitude >= 0 ? 'E' : 'W';
  const latDir = latitude >= 0 ? 'N' : 'S';
  
  return `${formatNumber(Math.abs(longitude), 4)}°${lonDir}, ${formatNumber(Math.abs(latitude), 4)}°${latDir}`;
}

/**
 * 格式化带单位的数值
 * @param {number} value - 数值
 * @param {string} unit - 单位
 * @param {number} decimals - 小数位数
 * @returns {string} 格式化后的字符串
 */
function formatWithUnit(value, unit = '', decimals = 2) {
  const formattedValue = formatNumber(value, decimals);
  return unit ? `${formattedValue} ${unit}` : formattedValue;
}

/**
 * 解析科学计数法输入
 * @param {string} input - 输入字符串
 * @returns {number} 解析后的数值
 */
function parseScientificInput(input) {
  if (!input) return 0;
  
  // 支持 1e-7, 1E-7, 1*10^-7 等格式
  const normalized = input.toLowerCase()
    .replace(/\*/g, '')
    .replace(/\^/g, '')
    .replace(/10/g, 'e');
  
  return parseFloat(normalized);
}

/**
 * 格式化结果对象为显示数组
 * @param {object} results - 计算结果对象
 * @param {object} labels - 标签配置
 * @returns {array} 格式化后的结果数组
 */
function formatResultsForDisplay(results, labels) {
  if (!results || !labels) {
    return [];
  }
  
  return labels.params.map(param => {
    const value = results[param.key];
    let formattedValue = '-';
    
    if (value !== null && value !== undefined && !isNaN(value)) {
      if (param.unit === '%') {
        formattedValue = formatPercent(value);
      } else {
        formattedValue = formatWithUnit(value, param.unit);
      }
    }
    
    return {
      label: param.label,
      value: formattedValue,
      rawValue: value,
      unit: param.unit,
      key: param.key
    };
  });
}

module.exports = {
  formatNumber,
  formatScientific,
  formatBER,
  formatPercent,
  formatDateTime,
  formatFileSize,
  formatCoordinate,
  formatWithUnit,
  parseScientificInput,
  formatResultsForDisplay
};

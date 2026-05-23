// utils/validator.js
// 参数验证工具函数

/**
 * 解析FEC码率字符串，支持任意形式的分数（如 11/55, 3/4, 188/204 等）和小数
 * @param {string|number} fec - FEC码率
 * @returns {object} { value: number|null, original: string, isValid: boolean }
 */
function parseFecValue(fec) {
  if (fec === '' || fec === null || fec === undefined) {
    return { value: null, original: '', isValid: false };
  }
  
  const fecStr = String(fec).trim();
  
  // 如果包含/，说明是分数格式
  if (fecStr.includes('/')) {
    const parts = fecStr.split('/');
    if (parts.length !== 2) {
      return { value: null, original: fecStr, isValid: false };
    }
    
    const numeratorStr = parts[0].trim();
    const denominatorStr = parts[1].trim();
    const numerator = parseFloat(numeratorStr);
    const denominator = parseFloat(denominatorStr);
    
    if (isNaN(numerator) || isNaN(denominator) || denominator === 0) {
      return { value: null, original: fecStr, isValid: false };
    }
    
    return { value: numerator / denominator, original: fecStr, isValid: true };
  } else {
    // 小数格式
    const value = parseFloat(fecStr);
    if (isNaN(value)) {
      return { value: null, original: fecStr, isValid: false };
    }
    return { value: value, original: fecStr, isValid: true };
  }
}

/**
 * 验证FEC码率（支持任意形式的分数和小数格式）
 * @param {string|number} fec - FEC码率
 * @returns {object} { valid: boolean, message: string, value: number, original: string }
 */
function validateFec(fec) {
  if (fec === '' || fec === null || fec === undefined) {
    return {
      valid: false,
      message: 'FEC码率不能为空',
      value: null,
      original: ''
    };
  }

  const fecStr = String(fec).trim();
  const parsed = parseFecValue(fecStr);

  // 如果包含/，说明是分数格式
  if (fecStr.includes('/')) {
    const parts = fecStr.split('/');
    if (parts.length !== 2) {
      return {
        valid: false,
        message: 'FEC码率分数格式错误，应为 a/b 格式（如 3/4 或 11/55）',
        value: null,
        original: fecStr
      };
    }
    
    const numeratorStr = parts[0].trim();
    const denominatorStr = parts[1].trim();
    const numerator = parseFloat(numeratorStr);
    const denominator = parseFloat(denominatorStr);
    
    if (isNaN(numerator) || isNaN(denominator)) {
      return {
        valid: false,
        message: 'FEC码率分数格式错误，分子和分母必须是数字',
        value: null,
        original: fecStr
      };
    }
    
    if (denominator === 0) {
      return {
        valid: false,
        message: 'FEC码率分数的分母不能为0',
        value: null,
        original: fecStr
      };
    }
  } else {
    // 小数格式
    if (!parsed.isValid) {
      return {
        valid: false,
        message: 'FEC码率必须是数字或分数格式（如 0.75 或 3/4 或 11/55）',
        value: null,
        original: fecStr
      };
    }
  }

  const fecValue = parsed.value;

  // 验证范围
  if (fecValue <= 0 || fecValue > 1) {
    return {
      valid: false,
      message: 'FEC码率必须在0到1之间',
      value: null,
      original: fecStr
    };
  }

  return { 
    valid: true, 
    message: '',
    value: fecValue,
    original: fecStr
  };
}

/**
 * 验证数值范围
 * @param {number} value - 待验证的值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @param {string} fieldName - 字段名称
 * @returns {object} { valid: boolean, message: string }
 */
function validateRange(value, min, max, fieldName) {
  if (value === '' || value === null || value === undefined) {
    return {
      valid: false,
      message: `${fieldName}不能为空`
    };
  }

  const numValue = parseFloat(value);
  if (isNaN(numValue)) {
    return {
      valid: false,
      message: `${fieldName}必须是数字`
    };
  }

  if (numValue < min || numValue > max) {
    return {
      valid: false,
      message: `${fieldName}必须在${min}到${max}之间`
    };
  }

  return { valid: true, message: '' };
}

/**
 * 验证经度
 * @param {number} longitude - 经度值
 * @returns {object} { valid: boolean, message: string }
 */
function validateLongitude(longitude) {
  return validateRange(longitude, -180, 180, '经度');
}

/**
 * 验证纬度
 * @param {number} latitude - 纬度值
 * @returns {object} { valid: boolean, message: string }
 */
function validateLatitude(latitude) {
  return validateRange(latitude, -90, 90, '纬度');
}

/**
 * 验证卫星参数
 * @param {object} params - 卫星参数对象
 * @returns {object} { valid: boolean, errors: array }
 */
function validateSatelliteParams(params) {
  const errors = [];

  if (!params.satelliteName || params.satelliteName.trim() === '') {
    errors.push('卫星名称不能为空');
  }

  const orbitResult = validateRange(params.orbitPosition, -180, 180, '轨道位置');
  if (!orbitResult.valid) {
    errors.push(orbitResult.message);
  }

  const sfdResult = validateRange(params.sfdRef, -200, 100, 'SFD参考值');
  if (!sfdResult.valid) {
    errors.push(sfdResult.message);
  }

  // 转发器带宽不设置参数范围，只验证是否为正数
  if (!params.transponderBandwidth || parseFloat(params.transponderBandwidth) <= 0) {
    errors.push('转发器带宽必须大于0');
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * 验证链路参数
 * @param {object} params - 链路参数对象
 * @returns {object} { valid: boolean, errors: array }
 */
function validateLinkParams(params) {
  const errors = [];

  // 验证上行站参数
  const earthLonResult = validateLongitude(params.longitude);
  if (!earthLonResult.valid) {
    errors.push(earthLonResult.error);
  }

  const earthLatResult = validateLatitude(params.latitude);
  if (!earthLatResult.valid) {
    errors.push('上行站' + earthLatResult.message);
  }

  // 天线口径不设置范围限制，只验证是否为正数
  if (!params.antennaDiameter || parseFloat(params.antennaDiameter) <= 0) {
    errors.push('天线口径必须大于0');
  }

  const efficiencyResult = validateRange(params.antennaEfficiency, 1, 100, '天线效率');
  if (!efficiencyResult.valid) {
    errors.push(efficiencyResult.message);
  }

  const uplinkFreqResult = validateRange(params.centerFrequency, 0, 100, '上行频率');
  if (!uplinkFreqResult.valid) {
    errors.push(uplinkFreqResult.message);
  }

  // 验证接收站参数
  const rxLonResult = validateLongitude(params.rxLongitude);
  if (!rxLonResult.valid) {
    errors.push('接收站' + rxLonResult.message);
  }

  const rxLatResult = validateLatitude(params.rxLatitude);
  if (!rxLatResult.valid) {
    errors.push('接收站' + rxLatResult.message);
  }

  // 接收天线口径不设置范围限制，只验证是否为正数
  if (!params.rxAntennaDiameter || parseFloat(params.rxAntennaDiameter) <= 0) {
    errors.push('接收天线口径必须大于0');
  }

  const downlinkFreqResult = validateRange(params.rxCenterFrequency, 0, 100, '下行频率');
  if (!downlinkFreqResult.valid) {
    errors.push(downlinkFreqResult.message);
  }

  // 验证载波参数
  // 信息速率不设置参数范围，只验证是否为正数
  if (!params.infoRate || parseFloat(params.infoRate) <= 0) {
    errors.push('信息速率必须大于0');
  }

  const fecResult = validateFec(params.fec);
  if (!fecResult.valid) {
    errors.push(fecResult.message);
  }

  const ebnoResult = validateRange(params.ebno, -100, 100, 'Eb/N0门限');
  if (!ebnoResult.valid) {
    errors.push(ebnoResult.message);
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * 验证仰角
 * @param {number} elevation - 仰角值（度）
 * @param {string} stationName - 站点名称（发信站/收信站）
 * @returns {object} { valid: boolean, level: string, message: string }
 */
function validateElevation(elevation, stationName = '') {
  const prefix = stationName ? `${stationName}` : '';
  
  if (elevation < 0) {
    return {
      valid: false,
      level: 'error',
      message: `${prefix}卫星不可见`
    };
  }
  
  if (elevation < 3) {
    return {
      valid: true,
      level: 'warning',
      message: `${prefix}仰角过低`
    };
  }
  
  if (elevation < 10) {
    return {
      valid: true,
      level: 'warning',
      message: `${prefix}仰角小于10度`
    };
  }
  
  return {
    valid: true,
    level: 'ok',
    message: ''
  };
}

/**
 * 验证所有必填参数
 * @param {object} satelliteParams - 卫星参数
 * @param {object} linkParams - 链路参数
 * @returns {object} { valid: boolean, errors: array }
 */
function validateAllParams(satelliteParams, linkParams) {
  const allErrors = [];

  // 验证卫星参数
  const satResult = validateSatelliteParams(satelliteParams);
  if (!satResult.valid) {
    allErrors.push(...satResult.errors);
  }

  // 验证链路参数
  const linkResult = validateLinkParams(linkParams);
  if (!linkResult.valid) {
    allErrors.push(...linkResult.errors);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors
  };
}

module.exports = {
  parseFecValue,
  validateRange,
  validateLongitude,
  validateLatitude,
  validateFec,
  validateElevation,
  validateSatelliteParams,
  validateLinkParams,
  validateAllParams
};

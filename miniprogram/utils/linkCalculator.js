// linkCalculator.js
// 卫星链路本地计算模块

const validator = require('./validator.js');

/**
 * 解析FEC编码率字符串，支持任意形式的分数和小数
 * @param {string|number} fecInput - FEC编码率输入（如 "3/4", "11/55", "0.75"）
 * @param {number} defaultValue - 默认值
 * @returns {number} 解析后的数值
 */
function parseFecForCalculation(fecInput, defaultValue = 0.75) {
  if (fecInput === '' || fecInput === null || fecInput === undefined) {
    return defaultValue;
  }
  
  const fecStr = String(fecInput).trim();
  
  // 如果包含/，说明是分数格式
  if (fecStr.includes('/')) {
    const parts = fecStr.split('/');
    if (parts.length === 2) {
      const numerator = parseFloat(parts[0].trim());
      const denominator = parseFloat(parts[1].trim());
      if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
        return numerator / denominator;
      }
    }
    return defaultValue;
  }
  
  // 小数格式
  const value = parseFloat(fecStr);
  return isNaN(value) ? defaultValue : value;
}

/**
 * 解析RS编码码率字符串，支持任意形式的分数和小数
 * @param {string|number} rsCodeInput - RS编码码率输入（如 "188/204", "0.92"）
 * @param {number} defaultValue - 默认值 (188/204 ≈ 0.9216)
 * @returns {number} 解析后的数值
 */
function parseRsCodeForCalculation(rsCodeInput, defaultValue = 188/204) {
  if (rsCodeInput === '' || rsCodeInput === null || rsCodeInput === undefined) {
    return defaultValue;
  }
  
  const rsCodeStr = String(rsCodeInput).trim();
  
  // 如果包含/，说明是分数格式
  if (rsCodeStr.includes('/')) {
    const parts = rsCodeStr.split('/');
    if (parts.length === 2) {
      const numerator = parseFloat(parts[0].trim());
      const denominator = parseFloat(parts[1].trim());
      if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
        return numerator / denominator;
      }
    }
    return defaultValue;
  }
  
  // 小数格式
  const value = parseFloat(rsCodeStr);
  return isNaN(value) ? defaultValue : value;
}

// 物理常量
const CONSTANTS = {
  LIGHT_SPEED: 299792.458, // 光速 km/s
  EARTH_RADIUS: 6378.137, // 地球平均半径 km
  SATELLITE_ALTITUDE: 35786, // 地球同步卫星高度 km
  GEO_RADIUS: 42644,
  PI: Math.PI,
  BOLTZMANN: -228.6 // 玻尔兹曼常数 dBW/K/Hz
};

// 调制因子
const MODULATION_FACTORS = {
  'BPSK': 1,
  'QPSK': 2,
  '8PSK': 3,
  '8QAM': 3,
  '16QAM': 4,
  '16APSK': 4,
  '32APSK': 5,
  '64APSK': 6,
  '128APSK': 7
};

// ITU-R P.838 降雨衰减系数表 (完全按照 index.html)
const P838_TABLE = {
  1: { k_H: 0.0000387, alpha_H: 0.912, k_V: 0.0000352, alpha_V: 0.880 },
  2: { k_H: 0.000154, alpha_H: 0.963, k_V: 0.000138, alpha_V: 0.923 },
  4: { k_H: 0.00014279, alpha_H: 1.352238369, k_V: 0.0002092, alpha_V: 1.211336093 },
  6: { k_H: 0.000582217, alpha_H: 1.586916682, k_V: 0.000488094, alpha_V: 1.586916682 },
  7: { k_H: 0.00301, alpha_H: 1.332, k_V: 0.00265, alpha_V: 1.312 },
  8: { k_H: 0.00454, alpha_H: 1.327, k_V: 0.00395, alpha_V: 1.310 },
  10: { k_H: 0.0101, alpha_H: 1.276, k_V: 0.00887, alpha_V: 1.264 },
  11: { k_H: 0.020107088, alpha_H: 1.186292179, k_V: 0.02, alpha_V: 1.158356387 },
  12: { k_H: 0.02403, alpha_H: 1.16692498, k_V: 0.024375695, alpha_V: 1.13649 },
  13: { k_H: 0.0361, alpha_H: 1.12532, k_V: 0.0378, alpha_V: 1.0887762 },
  14: { k_H: 0.04025286, alpha_H: 1.114709104, k_V: 0.042385097, alpha_V: 1.076671696 },
  15: { k_H: 0.0367, alpha_H: 1.154, k_V: 0.0335, alpha_V: 1.128 },
  17: { k_H: 0.07045588, alpha_H: 1.0631, k_V: 0.073645, alpha_V: 1.023248061 },
  20: { k_H: 0.09276, alpha_H: 1.0381, k_V: 0.095, alpha_V: 1.002 },
  25: { k_H: 0.124, alpha_H: 1.061, k_V: 0.113, alpha_V: 1.030 },
  30: { k_H: 0.2375, alpha_H: 0.94, k_V: 0.2319, alpha_V: 0.92213 },
  35: { k_H: 0.263, alpha_H: 0.979, k_V: 0.233, alpha_V: 0.963 },
  40: { k_H: 0.4431, alpha_H: 0.8673, k_V: 0.4274, alpha_V: 0.8421 },
  42: { k_H: 0.4865, alpha_H: 0.8539, k_V: 0.4712, alpha_V: 0.8296 },
  45: { k_H: 0.442, alpha_H: 0.903, k_V: 0.393, alpha_V: 0.897 },
  50: { k_H: 0.66, alpha_H: 0.8084, k_V: 0.6472, alpha_V: 0.7871 },
  52: { k_H: 0.7020, alpha_H: 0.7987, k_V: 0.6901, alpha_V: 0.7783 },
  55: { k_H: 0.7635, alpha_H: 0.7853, k_V: 0.7527, alpha_V: 0.7661 },
  60: { k_H: 0.8606, alpha_H: 0.7656, k_V: 0.8515, alpha_V: 0.7486 },
  70: { k_H: 1.0315, alpha_H: 0.7345, k_V: 1.0253, alpha_V: 0.7215 },
  80: { k_H: 0.975, alpha_H: 0.769, k_V: 0.906, alpha_V: 0.769 },
  90: { k_H: 1.06, alpha_H: 0.753, k_V: 0.999, alpha_V: 0.754 },
  100: { k_H: 1.12, alpha_H: 0.743, k_V: 1.06, alpha_V: 0.744 }
};

/**
 * ITU-R S.465-6 地球站天线离轴增益计算
 * 用于频率协调的参考辐射方向图
 * @param {number} diameter - 天线直径 (m)
 * @param {number} wavelength - 波长 (m)
 * @param {number} efficiency - 天线效率 (0-1)
 * @param {number} phi - 离轴角 (度)
 * @returns {number} 离轴增益 G(φ) (dBi)
 */
function calculateITU465OffAxisGain(diameter, wavelength, efficiency, phi) {
  const ratio = diameter / wavelength; // D/λ
  const Gmax = 20 * Math.log10(Math.PI * diameter / wavelength) + 10 * Math.log10(efficiency);
  
  // 确保 phi > 0
  if (phi <= 0) {
    return Gmax;
  }
  
  let G_phi;
  
  if (ratio >= 100) {
    // 情况A：D/λ ≥ 100 (大型天线)
    const G1 = 2 + 15 * Math.log10(ratio);
    const phi1 = (20 * wavelength / diameter) * Math.sqrt(Gmax - G1);
    const phi_r = 15.85 * Math.pow(ratio, -0.6);
    
    if (phi < phi1) {
      // 主波束区域
      G_phi = Gmax - 0.0025 * Math.pow(ratio * phi, 2);
    } else if (phi < phi_r) {
      // 第一旁瓣平台区
      G_phi = G1;
    } else if (phi < 36) {
      // 旁瓣衰减区
      G_phi = 29 - 25 * Math.log10(phi);
    } else if (phi < 48) {
      // 过渡区
      G_phi = -5;
    } else {
      // 远旁瓣区
      G_phi = -10;
    }
  } else if (ratio >= 50) {
    // 情况B：50 ≤ D/λ < 100 (中型天线)
    const L_S = 39 - 5 * Math.log10(ratio);
    const L_F = -3 - 5 * Math.log10(ratio);
    
    // 数值求解 phi1: Gmax - 0.0025*(ratio*phi1)^2 = L_S - 25*log10(phi1)
    // 使用迭代法求解
    let phi1 = 1;
    for (let i = 0; i < 20; i++) {
      const left = Gmax - 0.0025 * Math.pow(ratio * phi1, 2);
      const right = L_S - 25 * Math.log10(phi1);
      if (Math.abs(left - right) < 0.01) break;
      phi1 = phi1 * Math.pow(10, (left - right) / 50);
      phi1 = Math.max(0.1, Math.min(phi1, 10));
    }
    
    if (phi < phi1) {
      G_phi = Gmax - 0.0025 * Math.pow(ratio * phi, 2);
    } else if (phi < 48) {
      G_phi = L_S - 25 * Math.log10(phi);
    } else {
      G_phi = L_F;
    }
  } else {
    // 情况C：D/λ < 50 (小型天线)
    const L_S = 29;
    const L_F = -10 - 10 * Math.log10(ratio);
    
    
    if (phi < 70 / ratio) {
      G_phi = Gmax - 0.0025 * Math.pow(ratio * phi, 2);
    } else if (phi < 48) {
      G_phi = 29 - 25 * Math.log10(phi);
    } else {
      G_phi = L_F;
    }
  }
  
  return G_phi;
}

/**
 * 计算 ITU-R S.465-6 隔离度 (ISO)
 * @param {number} diameter - 天线直径 (m)
 * @param {number} wavelength - 波长 (m)
 * @param {number} efficiency - 天线效率 (0-1)
 * @param {number} phi - 离轴角/邻星角度偏差 (度)
 * @returns {number} 隔离度 ISO (dB)
 */
function calculateITU465Isolation(diameter, wavelength, efficiency, phi) {
  const Gmax = 20 * Math.log10(Math.PI * diameter / wavelength) + 10 * Math.log10(efficiency);
  const G_phi = calculateITU465OffAxisGain(diameter, wavelength, efficiency, phi);
  return Gmax - G_phi;
}

/**
 * 卫星链路预算计算主函数
 */
function calculateLinkBudget(satParams, linkParams) {
  try {
    console.log('收到的参数:', JSON.stringify({ satParams, linkParams }));
    
    // 参数验证
    if (!satParams || !linkParams) {
      throw new Error('缺少必需的参数：satParams 或 linkParams');
    }
    
    console.log('参数验证通过，开始计算');
    
    // 执行链路计算 - 使用完整算法
    const results = performCalculations(satParams, linkParams);
    
    console.log('计算完成，结果:', JSON.stringify(results));
    
    return {
      success: true,
      data: results
    };
  } catch (error) {
    console.error('计算错误:', error);
    console.error('错误堆栈:', error.stack);
    return {
      success: false,
      message: error.message || '计算失败',
      error: error.toString(),
      stack: error.stack
    };
  }
}

/**
 * 主计算函数 - 严格遵循 index.html 的 performCalculations 算法
 */
function performCalculations(satParams, inputs) {
  const results = {};
  
  // ============ 基础参数提取 ============
  const satelliteName = satParams.satelliteName || satParams.name || "未命名卫星";
  const frequencyBand = satParams.frequencyBand;
  const transponderStatus = satParams.transponderStatus || 'single';
  // 修复：优先从 inputs 读取极化参数，如果没有则从 satParams 读取
  // 保存原始极化显示值（LHCP/RHCP/V/H），并转换为计算用的值（C/V/H）
  const uplinkPolarizationDisplay = inputs.uplinkPolarization || satParams.uplinkPolarization || 'V';
  const uplinkPolarization = (uplinkPolarizationDisplay === 'LHCP' || uplinkPolarizationDisplay === 'RHCP') ? 'C' : uplinkPolarizationDisplay;
  const transponderBandwidth = parseFloat(satParams.transponderBandwidth) || 36; // MHz
  const _orbitPosRaw = satParams.orbitPosition !== undefined && satParams.orbitPosition !== '' && satParams.orbitPosition !== null
    ? satParams.orbitPosition : (satParams.position !== undefined && satParams.position !== '' && satParams.position !== null ? satParams.position : null);
  const orbitPosition = _orbitPosRaw !== null ? parseFloat(_orbitPosRaw) : 110.5;
  const EIRPs = parseFloat(inputs.rxEIRP) || 46; // dBW - 卫星下行EIRP
  const G_Ts = parseFloat(inputs.G_Ts) || 2; // dB/K - 卫星G/T
  const SFDref = (satParams.sfdRef !== '' && satParams.sfdRef !== null && satParams.sfdRef !== undefined)
    ? parseFloat(satParams.sfdRef) : -82; // dBW/m² - SFD参考值
  
  // ============ 通信参数 ============
  const infoRate = parseFloat(inputs.infoRate) || 2048; // kbps - 信息速率
  const modulation = inputs.modulation || "QPSK";
  // FEC编码率：支持分数和小数格式，保留原始输入用于显示
  const fecOriginal = String(inputs.fec || '0.75').trim();
  const fec = parseFecForCalculation(fecOriginal, 0.75); // FEC编码率（数值）
  // RS编码码率：支持分数和小数格式，保留原始输入用于显示
  const rsCodeOriginal = String(inputs.rsCode || '188/204').trim();
  const rsCode = parseRsCodeForCalculation(rsCodeOriginal, 188/204); // RS码效率（数值）
  const bandwidthFactor = parseFloat(inputs.bandwidthFactor) || 1.4; // 带宽系数
  const berExponent = ((inputs.ber !== '' && inputs.ber !== null && inputs.ber !== undefined)
    ? parseFloat(inputs.ber) : 7) * -1; // 误码率指数
  
  // 噪声比模式：支持 'ebno' 或 'esno'
  const noiseRatioMode = inputs.noiseRatioMode || 'ebno';
  const inputNoiseRatio = inputs.ebno !== '' && inputs.ebno !== null && inputs.ebno !== undefined
    ? parseFloat(inputs.ebno) : 5.0; // dB - 输入的噪声比值
  
  // 修复：正确处理 margin = 0 的情况
  const margin = (inputs.margin !== '' && inputs.margin !== null && inputs.margin !== undefined)
    ? parseFloat(inputs.margin) : 3; // dB - 链路余量
  const m = parseFloat(inputs.m) || 1.0; // 扩频增益
  
  // ============ 上行站参数 ============
  const earthLon = (inputs.longitude !== '' && inputs.longitude !== null && inputs.longitude !== undefined)
    ? parseFloat(inputs.longitude) : 116.4074;
  const earthLat = (inputs.latitude !== '' && inputs.latitude !== null && inputs.latitude !== undefined)
    ? parseFloat(inputs.latitude) : 39.9042;
  const antennaDiameter = parseFloat(inputs.antennaDiameter) || 7.3; // meters
  const antennaEfficiency = (parseFloat(inputs.antennaEfficiency) || 65) / 100;
  const feederLoss = inputs.feederLoss !== undefined && inputs.feederLoss !== '' && inputs.feederLoss !== null
    ? parseFloat(inputs.feederLoss) 
    : 0.2; // dB (支持输入0)
  const uplinkAvailability = (inputs.uplinkAvailability !== '' && inputs.uplinkAvailability !== null && inputs.uplinkAvailability !== undefined)
    ? parseFloat(inputs.uplinkAvailability) : 99.90; // %
  const rainRate = parseFloat(inputs.rainRate) || 0; // mm/h
  const altitude = (parseFloat(inputs.altitude) || 0) / 1000; // km
  const earthStationLocation = inputs.earthStationLocation || "上行站";
  
  // ============ 接收站参数 ============
  const rxLongitude = (inputs.rxLongitude !== '' && inputs.rxLongitude !== null && inputs.rxLongitude !== undefined)
    ? parseFloat(inputs.rxLongitude) : 116.4074;
  const rxLatitude = (inputs.rxLatitude !== '' && inputs.rxLatitude !== null && inputs.rxLatitude !== undefined)
    ? parseFloat(inputs.rxLatitude) : 39.9042;
  const rxAntennaDiameter = parseFloat(inputs.rxAntennaDiameter) || 1.2; // meters
  const rxAntennaEfficiency = (parseFloat(inputs.rxAntennaEfficiency) || 65) / 100;
  const rxFeederLoss = inputs.rxFeederLoss !== undefined && inputs.rxFeederLoss !== '' && inputs.rxFeederLoss !== null
    ? parseFloat(inputs.rxFeederLoss) 
    : 0.2; // dB (支持输入0)
  const rxDownlinkAvailability = ((inputs.rxDownlinkAvailability !== '' && inputs.rxDownlinkAvailability !== null && inputs.rxDownlinkAvailability !== undefined)
    ? parseFloat(inputs.rxDownlinkAvailability) : 99.90) / 100;
  const rxRainRate = parseFloat(inputs.rxRainRate) || 0; // mm/h
  const rxAltitude = (parseFloat(inputs.rxAltitude) || 0) / 1000; // km
  
  // 噪声温度参数
  const antennaNoiseTemp = parseFloat(inputs.rxAntennaNoiseTemp) ||
    ((frequencyBand === 'C' || frequencyBand === 'ExtC') ? 30 : 35); // K
  const receiverNoiseTemp = parseFloat(inputs.rxReceiverNoiseTemp) ||
    ((frequencyBand === 'C' || frequencyBand === 'ExtC') ? 40 : 75); // K
  
  // 干扰因子 - 从卫星参数中读取 (支持输入0)
  const deltaTheta = satParams.deltaTheta !== undefined && satParams.deltaTheta !== '' && satParams.deltaTheta !== null
    ? parseFloat(satParams.deltaTheta) 
    : 3; // 度 - 角度偏差
  const adjUplinkFactor = satParams.adjUplinkFactor !== undefined && satParams.adjUplinkFactor !== '' && satParams.adjUplinkFactor !== null
    ? parseFloat(satParams.adjUplinkFactor) 
    : 25; // dB
  const adjDownlinkFactor = satParams.adjDownlinkFactor !== undefined && satParams.adjDownlinkFactor !== '' && satParams.adjDownlinkFactor !== null
    ? parseFloat(satParams.adjDownlinkFactor) 
    : 25; // dB
  const xpolUplinkFactor = satParams.xpolUplinkFactor !== undefined && satParams.xpolUplinkFactor !== '' && satParams.xpolUplinkFactor !== null
    ? parseFloat(satParams.xpolUplinkFactor) 
    : 30; // dB
  const xpolDownlinkFactor = satParams.xpolDownlinkFactor !== undefined && satParams.xpolDownlinkFactor !== '' && satParams.xpolDownlinkFactor !== null
    ? parseFloat(satParams.xpolDownlinkFactor) 
    : 30; // dB
  const intermodFactor = satParams.intermodFactor !== undefined && satParams.intermodFactor !== '' && satParams.intermodFactor !== null
    ? parseFloat(satParams.intermodFactor) 
    : 22; // dB
  
  // UPC参数
  const uplinkPowerControl = inputs.uplinkPowerControl || '否';
  const paBackoff = inputs.paBackoff !== undefined && inputs.paBackoff !== '' && inputs.paBackoff !== null
    ? parseFloat(inputs.paBackoff) 
    : 0; // dB - 功放回退 (支持输入0)
  
  // ============ 精细化损耗参数 ============
  // 天线指向误差（度）- 用于计算指向损耗
  const pointingError = inputs.pointingError !== undefined && inputs.pointingError !== '' && inputs.pointingError !== null
    ? parseFloat(inputs.pointingError)
    : 0.05; // 默认0.05度
  
  // 极化失配损耗（dB）
  const polarizationLoss = inputs.polarizationLoss !== undefined && inputs.polarizationLoss !== '' && inputs.polarizationLoss !== null
    ? parseFloat(inputs.polarizationLoss)
    : 0.1; // 默认0.1 dB
  
  // 天线罩损耗（dB）- 按频段默认
  const radomeLoss = inputs.radomeLoss !== undefined && inputs.radomeLoss !== '' && inputs.radomeLoss !== null
    ? parseFloat(inputs.radomeLoss)
    : getDefaultRadomeLoss(parseFloat(inputs.centerFrequency) || 14.25);
  
  // 接头/法兰损耗（dB）
  const connectorLoss = inputs.connectorLoss !== undefined && inputs.connectorLoss !== '' && inputs.connectorLoss !== null
    ? parseFloat(inputs.connectorLoss)
    : 0.1; // 默认0.1 dB
  
  // ============ 频率参数 ============
  const uplinkFrequency = (inputs.centerFrequency !== '' && inputs.centerFrequency !== null && inputs.centerFrequency !== undefined)
    ? parseFloat(inputs.centerFrequency) : 14.25; // GHz
  const downlinkFrequency = (inputs.rxCenterFrequency !== '' && inputs.rxCenterFrequency !== null && inputs.rxCenterFrequency !== undefined)
    ? parseFloat(inputs.rxCenterFrequency) : 12.5; // GHz
  
  // ============ 计算波长和天线增益 ============
  const wavelength = 0.299792458 / uplinkFrequency; // 上行波长 (米)
  const rxWavelength = 0.299792458 / downlinkFrequency; // 下行波长 (米)
  
  // 卫星天线每平方米增益
  const antennaGain = 10 * Math.log10(4 * CONSTANTS.PI / (wavelength ** 2));
  
  // 转发器回退参数 - 从卫星参数中读取 (支持输入0)
  const BOi = satParams.BOi !== undefined && satParams.BOi !== '' && satParams.BOi !== null
    ? parseFloat(satParams.BOi) 
    : 6; // 输入回退 (dB)
  const BOo = satParams.BOo !== undefined && satParams.BOo !== '' && satParams.BOo !== null
    ? parseFloat(satParams.BOo) 
    : 3; // 输出回退 (dB)
  
  // SFDs计算
  const SFDs = SFDref - G_Ts;
  
  // 下行极化方式 - 修复：优先从 inputs 读取，如果没有则根据上行极化自动推导
  // 保存原始极化显示值（LHCP/RHCP/V/H），并转换为计算用的值（C/V/H）
  const downlinkPolarizationDisplay = inputs.downlinkPolarization || 
                               (uplinkPolarizationDisplay === 'LHCP' ? 'LHCP' :
                               (uplinkPolarizationDisplay === 'RHCP' ? 'RHCP' :
                               (uplinkPolarization === 'V' ? 'H' : 'V')));
  const downlinkPolarization = (downlinkPolarizationDisplay === 'LHCP' || downlinkPolarizationDisplay === 'RHCP') ? 'C' : downlinkPolarizationDisplay;
  
  // 系统可用度
  const rxdownlinkAvailability = rxDownlinkAvailability * 100;
  const systemAvailability = (uplinkAvailability * rxDownlinkAvailability).toFixed(2);
  
  // ============ 调制与带宽计算 ============
  const modulationFactor = MODULATION_FACTORS[modulation] || 2;
  const carrierRate = infoRate / rsCode / fec; // 传输速率 (kbps)
  const ChipRate = carrierRate * m; // 码片速率 (kbps)
  const symbolRate = ChipRate / modulationFactor; // 符号速率 (ksps)
  // 分配带宽计算：保留三位小数
  const allocBandwidth = Math.round(bandwidthFactor * symbolRate * 1000) / 1000; // 分配带宽 (kHz)
  const k = (fec * rsCode * modulationFactor) / m; // 组合效率
  
  // 根据噪声比模式计算 ebno 和 esno
  let ebno, esno;
  if (noiseRatioMode === 'esno') {
    // 如果输入的是 Es/N0，需要转换为 Eb/N0
    esno = inputNoiseRatio;
    ebno = esno - 10 * Math.log10(k);
  } else {
    // 如果输入的是 Eb/N0（默认）
    ebno = inputNoiseRatio;
    esno = ebno + 10 * Math.log10(k);
  }
  
  // ============ 上行站几何计算 ============
  const earthLatRad = earthLat * CONSTANTS.PI / 180;
  
  // 仰角计算
  const deltaLonRad_elev = (orbitPosition - earthLon) * CONSTANTS.PI / 180;
  const cosTerm_elev = Math.cos(earthLatRad) * Math.cos(deltaLonRad_elev);
  const elevationRad = Math.atan(
    (cosTerm_elev - 0.15127) / Math.sqrt(1 - Math.pow(cosTerm_elev, 2))
  );
  const elevation = elevationRad * 180 / CONSTANTS.PI;
  
  // 验证发信站仰角
  const txElevationValidation = validator.validateElevation(elevation, '发信站');
  
  // 方位角计算
  let azimuth;
  if (earthLat > 0) {
    const temp = Math.abs(Math.atan(
      Math.tan((earthLon - orbitPosition) * CONSTANTS.PI / 180) / Math.sin(earthLatRad)
    ) * 180 / CONSTANTS.PI);
    azimuth = (orbitPosition > earthLon) ? 180 - temp : 180 + temp;
  } else {
    const temp = Math.abs(Math.atan(
      Math.tan((earthLon - orbitPosition) * CONSTANTS.PI / 180) / Math.sin(earthLatRad)
    ) * 180 / CONSTANTS.PI);
    azimuth = (orbitPosition > earthLon) ? temp : 360 - temp;
  }
  
  // 极化角计算
  const uplinkPolarizationAngle = calculatePolarizationAngle(earthLon, earthLat, orbitPosition);
  
  // 波束宽度
  const beamWidth = (70 * wavelength) / antennaDiameter;
  
  // 上行天线增益
  const txAntennaGain = 20 * Math.log10((CONSTANTS.PI * antennaDiameter) / wavelength) + 
                        10 * Math.log10(antennaEfficiency);
  
  // 上行站星地距离
  const deltaLonRad_dist = (earthLon - orbitPosition) * CONSTANTS.PI / 180;
  const cosTerm_dist = Math.cos(earthLatRad) * Math.cos(deltaLonRad_dist);
  
  // 使用余弦定理精确计算星地距离
  const earthRadius = CONSTANTS.EARTH_RADIUS;
  const orbitRadius = CONSTANTS.EARTH_RADIUS + CONSTANTS.SATELLITE_ALTITUDE;
  const slantRange = Math.sqrt(Math.pow(earthRadius, 2) + Math.pow(orbitRadius, 2) - 2 * earthRadius * orbitRadius * cosTerm_dist);
  
  // 上行自由空间损耗
  const uplinkFSL = 20 * (Math.log10(uplinkFrequency) + Math.log10(slantRange * 1000)) + 
                    20 * Math.log10((4 * CONSTANTS.PI) / 0.299792458);
  
  // ============ 接收站几何计算 ============
  const rxDeltaLonRad = (orbitPosition - rxLongitude) * CONSTANTS.PI / 180;
  const rxEarthLatRad = rxLatitude * CONSTANTS.PI / 180;
  const rxCosTerm = Math.cos(rxEarthLatRad) * Math.cos(rxDeltaLonRad);
  const rxElevationRad = Math.atan(
    (rxCosTerm - 0.15127) / Math.sqrt(1 - Math.pow(rxCosTerm, 2))
  );
  const rxElevation = rxElevationRad * 180 / CONSTANTS.PI;
  
  // 验证收信站仰角
  const rxElevationValidation = validator.validateElevation(rxElevation, '收信站');
  
  // 接收站方位角
  let rxAzimuth;
  if (rxLatitude > 0) {
    const temp = Math.abs(Math.atan(
      Math.tan(rxDeltaLonRad) / Math.sin(rxEarthLatRad)
    ) * 180 / CONSTANTS.PI);
    rxAzimuth = (orbitPosition > rxLongitude) ? 180 - temp : 180 + temp;
  } else {
    const temp = Math.abs(Math.atan(
      Math.tan(rxDeltaLonRad) / Math.sin(rxEarthLatRad)
    ) * 180 / CONSTANTS.PI);
    rxAzimuth = (orbitPosition > rxLongitude) ? temp : 360 - temp;
  }
  
  // 接收站极化角
  const downlinkPolarizationAngle = calculatePolarizationAngle(rxLongitude, rxLatitude, orbitPosition);
  
  // 接收站星地距离
  const rxDeltaLonRad_dist = (rxLongitude - orbitPosition) * CONSTANTS.PI / 180;
  const rxCosTerm_dist = Math.cos(rxLatitude * CONSTANTS.PI / 180) * Math.cos(rxDeltaLonRad_dist);
  
  // 使用余弦定理精确计算星地距离
  const rxSlantRange = Math.sqrt(Math.pow(earthRadius, 2) + Math.pow(orbitRadius, 2) - 2 * earthRadius * orbitRadius * rxCosTerm_dist);
  
  // 下行自由空间损耗
  const downlinkFSL = 20 * (Math.log10(downlinkFrequency) + Math.log10(rxSlantRange * 1000)) + 
                      20 * Math.log10((4 * CONSTANTS.PI) / 0.299792458);
  
  // 接收天线增益
  const rxAntennaGain = 20 * Math.log10((CONSTANTS.PI * rxAntennaDiameter) / rxWavelength) + 
                        10 * Math.log10(rxAntennaEfficiency);
  
  // 接收天线半功率波束宽度
  const theta3 = 70 * rxWavelength / rxAntennaDiameter;
  
  // ============ 大气衰减计算 (ITU-R P.676-13) ============
  const uplinkAtmosphericAttenuation = calculateAtmosphericAttenuation(uplinkFrequency, elevation);
  const downlinkAtmosphericAttenuation = calculateAtmosphericAttenuation(downlinkFrequency, rxElevation);
  
  // ============ 降雨衰减计算 ============
  // 上行降雨衰减
  const uplinkUnavailability = uplinkAvailability / 100;
  const freqKey = findClosestFrequency(uplinkFrequency);
  const A001 = calculateSinglePathRainAttenuation(
    rainRate, freqKey, uplinkPolarization, earthLat, earthLon, orbitPosition, altitude
  );
  
  const C0 = uplinkFrequency < 10 ? 0.12 : 
             0.12 + 0.4 * Math.log10(Math.pow(uplinkFrequency / 10, 0.8));
  const C1 = Math.pow(0.07, C0) * Math.pow(0.12, 1 - C0);
  const C2 = 0.855 * C0 + 0.546 * (1 - C0);
  const C3 = 0.139 * C0 + 0.043 * (1 - C0);
  const uplinkRainAttenuation = (C1 * Math.pow((1 - uplinkUnavailability) * 100, 
    -1 * (C2 + C3 * Math.log10((1 - uplinkUnavailability) * 100)))) * A001;
  
  // 下行降雨衰减
  const downlinkFreqKey = findClosestFrequency(downlinkFrequency);
  const downlinkA001 = calculateSinglePathRainAttenuation(
    rxRainRate, downlinkFreqKey, downlinkPolarization, 
    rxLatitude, rxLongitude, orbitPosition, rxAltitude
  );
  
  const dC0 = downlinkFrequency < 10 ? 0.12 : 
              0.12 + 0.4 * Math.log10(Math.pow(downlinkFrequency / 10, 0.8));
  const dC1 = Math.pow(0.07, dC0) * Math.pow(0.12, 1 - dC0);
  const dC2 = 0.855 * dC0 + 0.546 * (1 - dC0);
  const dC3 = 0.139 * dC0 + 0.043 * (1 - dC0);
  const downlinkRainAttenuation = (dC1 * Math.pow((1 - rxDownlinkAvailability) * 100,
    -1 * (dC2 + dC3 * Math.log10((1 - rxDownlinkAvailability) * 100)))) * downlinkA001;
  
  // ============ 云衰减计算 ============
  const uplinkCloudAttenuation = calculateCloudAttenuation(uplinkFrequency, elevation, rainRate);
  const downlinkCloudAttenuation = calculateCloudAttenuation(downlinkFrequency, rxElevation, rxRainRate);
  
  // ============ 噪声温度计算 ============
  // 降雨噪声温度
  const rainNoiseTemp = 273.15 * (1 - 1 / Math.pow(10, downlinkRainAttenuation / 10));
  
  // 接收系统等效噪声温度
  const feederLossLinear = Math.pow(10, rxFeederLoss / 10);
  const systemNoiseTempK = (antennaNoiseTemp / feederLossLinear) + 
                           290 * (1 - 1 / feederLossLinear) + 
                           receiverNoiseTemp;
  const systemNoiseTempDb = 10 * Math.log10(systemNoiseTempK);
  
  // 地球站G/Te
  const gOverTe = rxAntennaGain - systemNoiseTempDb - rxFeederLoss;
  
  // 降雨衰减引起的G/T下降
  const numerator = systemNoiseTempK + (rainNoiseTemp / feederLossLinear);
  const gOverTdegradation = 10 * Math.log10(numerator / systemNoiseTempK);
  
  // ============ 载波与带宽计算 ============
  const noiseBW = symbolRate * 1; // kHz
  const RXnoiseBW = 10 * Math.log10(noiseBW * 1000); // dBHz
  
  // 载波门限值C/T
  const carrierThreshold = ebno + CONSTANTS.BOLTZMANN + 10 * Math.log10(infoRate * 1000);
  
  // 载波总C/T, C/N
  const carrierTotalCT = carrierThreshold + margin;
  const carrierTotalCN = carrierTotalCT - CONSTANTS.BOLTZMANN - RXnoiseBW;
  
  // 门限C/N
  const thresholdCN = ebno + 10 * Math.log10(infoRate / noiseBW);
  
  // ============ 干扰计算 ============
  // 邻星干扰隔离度（接收站）- 使用 ITU-R S.465-6
  const ISO = calculateITU465Isolation(rxAntennaDiameter, rxWavelength, rxAntennaEfficiency, deltaTheta);
  const rxOffAxisGain = calculateITU465OffAxisGain(rxAntennaDiameter, rxWavelength, rxAntennaEfficiency, deltaTheta);
  const deltagain = rxAntennaGain - rxOffAxisGain;
  
  // 发信站旁瓣增益计算（根据邻星轨位差）- 使用 ITU-R S.465-6
  const txISO = calculateITU465Isolation(antennaDiameter, wavelength, antennaEfficiency, deltaTheta);
  const txOffAxisGain = calculateITU465OffAxisGain(antennaDiameter, wavelength, antennaEfficiency, deltaTheta);
  const txSidelobeGain = txOffAxisGain; // 发信站旁瓣发射增益
  
  // ============ 综合损耗计算（简化模型，基于频率）============
  // 综合损耗包含：指向损耗、极化损耗、天线罩损耗、接头损耗、闪烁衰减等
  // 使用基于频率的简化模型，避免复杂计算导致的NaN问题
  const uplinkMiscLoss = calculateMiscLossByFrequency(uplinkFrequency);
  const downlinkMiscLoss = calculateMiscLossByFrequency(downlinkFrequency);
  
  // 各项C/T值计算
  const uplinkCT = SFDs - antennaGain - BOi + G_Ts;
  const adjUplinkCT = 10 * Math.log10(transponderBandwidth * 1e6) + 
                      CONSTANTS.BOLTZMANN + adjUplinkFactor;
  const xpolUplinkCT = 10 * Math.log10(transponderBandwidth * 1e6) + 
                       CONSTANTS.BOLTZMANN + xpolUplinkFactor;
  const downlinkCT = EIRPs - BOo - downlinkFSL - downlinkCloudAttenuation - 
                     downlinkAtmosphericAttenuation + gOverTe - downlinkMiscLoss;
  const adjDownlinkCT = 10 * Math.log10(transponderBandwidth * 1e6) + 
                        CONSTANTS.BOLTZMANN + adjDownlinkFactor;
  const xpolDownlinkCT = 10 * Math.log10(transponderBandwidth * 1e6) + 
                         CONSTANTS.BOLTZMANN + xpolDownlinkFactor;
  const intermodCT = 10 * Math.log10(transponderBandwidth * 1e6) + 
                     CONSTANTS.BOLTZMANN + intermodFactor;
  
  // 计算总C/T（对数运算）
  // 先计算上行总C/T
  const uplinkTotalCTLinear = 1 / (
    Math.pow(10, -uplinkCT / 10) +
    Math.pow(10, -adjUplinkCT / 10) +
    Math.pow(10, -xpolUplinkCT / 10)
  );
  const uplinkTotalCT = 10 * Math.log10(uplinkTotalCTLinear);
  
  // 再计算下行总C/T
  const downlinkTotalCTLinear = 1 / (
    Math.pow(10, -downlinkCT / 10) +
    Math.pow(10, -adjDownlinkCT / 10) +
    Math.pow(10, -xpolDownlinkCT / 10) 
  );
  const downlinkTotalCT = 10 * Math.log10(downlinkTotalCTLinear);
  
  // 最后合并上下行得到总C/T
  const totalCTLinear = 1 / (
    Math.pow(10, -uplinkTotalCT / 10) +
    Math.pow(10, -downlinkTotalCT / 10) +
    Math.pow(10, -intermodCT / 10)
  );
  const totalCT = 10 * Math.log10(totalCTLinear);
  
  // ============ UPC补偿计算 ============
  let upcMargin = 0;
  const upcRawValue = (uplinkPowerControl || '').toString().trim();
  
  if (upcRawValue === '是' || upcRawValue.toLowerCase() === 'yes') {
    // UPC开启：补偿所有上行降雨衰减
    upcMargin = uplinkRainAttenuation;
  } else if (upcRawValue === '自定义') {
    // UPC自定义：使用用户输入的UPC数值作为UPC余量
    const customUpcValue = parseFloat(inputs.upcValue);
    if (!isNaN(customUpcValue) && isFinite(customUpcValue)) {
      upcMargin = Math.max(0, customUpcValue);
    }
  }
  
  const residualRainLoss = Math.max(0, uplinkRainAttenuation - upcMargin);
  const extraUPCGain = Math.max(0, upcMargin - uplinkRainAttenuation);
  const totalCTRain = totalCT - residualRainLoss;
  
  // ============ C/N计算 ============
  // 上行C/N (dB) - 基于实际上行C/T计算
  const actualUplinkCT = uplinkTotalCT - totalCT + carrierTotalCT;
  const uplinkCN = actualUplinkCT - CONSTANTS.BOLTZMANN - RXnoiseBW;
  

  
  // ============ 链路余量计算 ============
  const linkmargin = carrierTotalCN - thresholdCN;
  
  // ============ 转发器容量计算 ============
  // 转发器容量 - 上行降雨
  const transponderCapacity = totalCTRain - carrierTotalCT;
  
  // 每载波占卫星EIRPs - 上行降雨
  const eirpPerCarrier = EIRPs - BOo - transponderCapacity;
  
  // 上行雨天功率占比
  const uplinkPowerRatio = Math.pow(10, (eirpPerCarrier - EIRPs + BOo) / 10) * 100;
  
  // 下行降雨干扰计算
  // 先计算上行总C/T（上行部分不变）
  const rainUplinkTotalCTLinear = 1 / (
    Math.pow(10, -uplinkCT / 10) +
    Math.pow(10, -adjUplinkCT / 10) +
    Math.pow(10, -xpolUplinkCT / 10)
  );
  const rainUplinkTotalCT = 10 * Math.log10(rainUplinkTotalCTLinear);
  
  // 再计算下行总C/T（考虑下行降雨衰减和G/T恶化）
  const rainDownlinkTotalCTLinear = 1 / (
    Math.pow(10, -(downlinkCT - downlinkRainAttenuation - gOverTdegradation) / 10) +
    Math.pow(10, -adjDownlinkCT / 10) +
    Math.pow(10, -xpolDownlinkCT / 10) 
  );
  const rainDownlinkTotalCT = 10 * Math.log10(rainDownlinkTotalCTLinear);
  
  // 最后合并上下行得到下行雨卫星总C/T
  const totalInterferenceLinear = 1 / (
    Math.pow(10, -rainUplinkTotalCT / 10) +
    Math.pow(10, -rainDownlinkTotalCT / 10) +
    Math.pow(10, -intermodCT / 10)
  );
  
  // 下行雨卫星总C/T
  const downlinkComponent = 10 * Math.log10(totalInterferenceLinear);
  const downlinkPowerRatio = Math.pow(10, (EIRPs - BOo - downlinkComponent + 
                                           carrierTotalCT - EIRPs + BOo) / 10) * 100;
  
  // 转发器容量 - 下行降雨
  const RXtransponderCapacity = downlinkComponent - carrierTotalCT;
    // 下行C/N (dB) - 基于实际下行C/T计算
  const actualDownlinkCT = downlinkTotalCT - RXtransponderCapacity;
  const downlinkCN = actualDownlinkCT - CONSTANTS.BOLTZMANN - RXnoiseBW;
  // 下行降雨 - 载波占有卫星有效全向辐射功率
  const RXeirpPerCarrier = EIRPs - BOo - RXtransponderCapacity;
  
  // ============ 带宽和功率占用 ============
  const bandwidthUsageRatio = (allocBandwidth / (transponderBandwidth * 1000)) * 100;
  const powerUsageRatio = Math.max(uplinkPowerRatio, downlinkPowerRatio);
  const PowerBW = powerUsageRatio * transponderBandwidth * 10;
  
  // 转发器资源受限判断和最大载波数计算
  const transponderLimitedBy = bandwidthUsageRatio >= powerUsageRatio ? '带宽' : '功率';
  const maxCarrierByBandwidth = Math.floor(100 / bandwidthUsageRatio);
  const maxCarrierByPower = Math.floor(100 / powerUsageRatio);
  const maxCarrierCount = Math.min(maxCarrierByBandwidth, maxCarrierByPower);
  
  // ============ 功放计算 ============
  const basePaBackoff = paBackoff;
  const totalPaBackoff = basePaBackoff + extraUPCGain;
  

  
  // 上行功率计算（使用精细化损耗替代0.6dB）
  const UPPOWER = (SFDs - BOi + uplinkFSL - antennaGain - transponderCapacity + 
                  totalCTRain - totalCT + uplinkRainAttenuation + uplinkMiscLoss + uplinkCloudAttenuation) - 
                  txAntennaGain + feederLoss + uplinkAtmosphericAttenuation;
  
  // 下行功率计算
  const totalInterference = Math.pow(10, -uplinkCT / 10) +
    Math.pow(10, -adjUplinkCT / 10) +
    Math.pow(10, -xpolUplinkCT / 10) +
    Math.pow(10, -downlinkCT / 10) +
    Math.pow(10, -adjDownlinkCT / 10) +
    Math.pow(10, -xpolDownlinkCT / 10) +
    Math.pow(10, -intermodCT / 10);
  const interferenceTerm = 10 * Math.log10(totalInterferenceLinear);
  
  // 下行功率计算（使用精细化损耗替代0.6dB）
  const DOWNPOWER = (SFDs - BOi + uplinkFSL - antennaGain - interferenceTerm + 
                    carrierTotalCT) - 
                    txAntennaGain + feederLoss + uplinkRainAttenuation + uplinkAtmosphericAttenuation  + uplinkMiscLoss + uplinkCloudAttenuation;
  
  // 选择功率类型 - 使用高精度计算
  const selectedPower = (uplinkPowerRatio > downlinkPowerRatio) ? UPPOWER : DOWNPOWER;
  // 保持完整精度，仅在最终显示时四舍五入
  const selectedPowerW = Math.pow(10, selectedPower / 10);
  
  // 功放最大输出功率 - 使用高精度计算
  const paRecommendationdB = selectedPower + totalPaBackoff;
  const paRecommendation = Math.pow(10, paRecommendationdB / 10);
  
  // ============ EIRP和通量密度 ============
  const stationEIRP = selectedPower + txAntennaGain - feederLoss;
  // 根据上下行功率占比选择实际转发器回退
  const actualTransponderCapacity = (uplinkPowerRatio > downlinkPowerRatio) ? transponderCapacity : RXtransponderCapacity;
  const PFDc = SFDs - BOi - actualTransponderCapacity;
  
  // 地球站功率谱密度：EIRP - 10*log10(带宽Hz)
  const stationPSD = stationEIRP - 10 * Math.log10(allocBandwidth * 1000);
  
  // ============ ITU-R 功率谱密度门限计算 ============
  // 根据ITU Radio Regulations Article 21 和 ITU-R S.524-9
  // 针对GEO FSS卫星地球站的off-axis EIRP功率谱密度最大允许电平
  // 覆盖55GHz以下全部卫星上行频段
  
  const phi = deltaTheta > 0 ? deltaTheta : 3; // 使用邻星轨位差作为离轴角，默认3°
  let ituPsdLimit4kHz; // ITU要求（统一转换为dBW/4kHz）
  let ituRefBandwidth; // ITU参考带宽标识
  
  // 根据上行频率(GHz)判断适用的ITU-R限值
  if (uplinkFrequency >= 1.6 && uplinkFrequency < 1.66) {
    // L频段: 1.6265-1.6605 GHz (移动卫星业务上行)
    // 参考 ITU-R M.1184, ITU RR Article 21 Table 21-1
    // 参考带宽4kHz
    ituRefBandwidth = '4kHz';
    if (phi < 2.5) {
      ituPsdLimit4kHz = 33 - 25 * Math.log10(2.5);
    } else if (phi < 7) {
      ituPsdLimit4kHz = 33 - 25 * Math.log10(phi);
    } else if (phi < 9.2) {
      ituPsdLimit4kHz = 12;
    } else if (phi < 48) {
      ituPsdLimit4kHz = 36 - 25 * Math.log10(phi);
    } else {
      ituPsdLimit4kHz = -6;
    }
  } else if (uplinkFrequency >= 2.5 && uplinkFrequency < 2.69) {
    // S频段: 2.5-2.69 GHz (广播卫星馈线上行)
    // 参考 ITU RR Article 21 Table 21-2
    // 参考带宽4kHz
    ituRefBandwidth = '4kHz';
    if (phi < 2.5) {
      ituPsdLimit4kHz = 34 - 25 * Math.log10(2.5);
    } else if (phi < 7) {
      ituPsdLimit4kHz = 34 - 25 * Math.log10(phi);
    } else if (phi < 9.2) {
      ituPsdLimit4kHz = 13;
    } else if (phi < 48) {
      ituPsdLimit4kHz = 37 - 25 * Math.log10(phi);
    } else {
      ituPsdLimit4kHz = -5;
    }
  } else if (uplinkFrequency >= 5.091 && uplinkFrequency < 5.25) {
    // 低C频段(航空移动卫星): 5.091-5.25 GHz
    // 参考 ITU-R M.1643
    // 参考带宽4kHz
    ituRefBandwidth = '4kHz';
    if (phi < 2.5) {
      ituPsdLimit4kHz = 34 - 25 * Math.log10(2.5);
    } else if (phi < 7) {
      ituPsdLimit4kHz = 25 - 25 * Math.log10(phi);
    } else if (phi < 9.2) {
      ituPsdLimit4kHz = 4;
    } else if (phi < 48) {
      ituPsdLimit4kHz = 28 - 25 * Math.log10(phi);
    } else {
      ituPsdLimit4kHz = -8;
    }
  } else if (uplinkFrequency >= 5.85 && uplinkFrequency <= 6.725) {
    // C频段: 5.850-6.725 GHz (FSS上行)
    // ITU RR Article 21 Table 21-4A, 参考带宽4kHz
    ituRefBandwidth = '4kHz';
    if (phi < 2.5) {
      ituPsdLimit4kHz = 35 - 25 * Math.log10(2.5);
    } else if (phi < 7) {
      ituPsdLimit4kHz = 26 - 25 * Math.log10(phi);
    } else if (phi < 9.2) {
      ituPsdLimit4kHz = 5;
    } else if (phi < 48) {
      ituPsdLimit4kHz = 29 - 25 * Math.log10(phi);
    } else {
      ituPsdLimit4kHz = -7;
    }
  } else if (uplinkFrequency >= 7.9 && uplinkFrequency <= 8.4) {
    // X频段: 7.9-8.4 GHz (政府/军用FSS上行)
    // 参考 ITU RR Article 21 Table 21-4B, 参考带宽4kHz
    ituRefBandwidth = '4kHz';
    if (phi < 2.5) {
      ituPsdLimit4kHz = 33 - 25 * Math.log10(2.5);
    } else if (phi < 7) {
      ituPsdLimit4kHz = 24 - 25 * Math.log10(phi);
    } else if (phi < 9.2) {
      ituPsdLimit4kHz = 3;
    } else if (phi < 48) {
      ituPsdLimit4kHz = 27 - 25 * Math.log10(phi);
    } else {
      ituPsdLimit4kHz = -9;
    }
  } else if (uplinkFrequency >= 10.7 && uplinkFrequency < 11.7) {
    // 扩展X/Ku频段: 10.7-11.7 GHz (用于馈线链路)
    // 参考 ITU RR Article 21 Table 21-4C, 参考带宽40kHz
    ituRefBandwidth = '40kHz';
    let ituLimit40kHz;
    if (phi < 2.5) {
      ituLimit40kHz = 38 - 25 * Math.log10(2.5);
    } else if (phi < 7) {
      ituLimit40kHz = 38 - 25 * Math.log10(phi);
    } else if (phi < 9.2) {
      ituLimit40kHz = 17;
    } else if (phi < 48) {
      ituLimit40kHz = 41 - 25 * Math.log10(phi);
    } else {
      ituLimit40kHz = -1;
    }
    ituPsdLimit4kHz = ituLimit40kHz - 10; // 40kHz转4kHz
  } else if (uplinkFrequency >= 12.75 && uplinkFrequency < 13.25) {
    // 扩展Ku频段: 12.75-13.25 GHz
    // ITU RR Article 21 Table 21-4D, 参考带宽40kHz
    ituRefBandwidth = '40kHz';
    let ituLimit40kHz;
    if (phi < 2.5) {
      ituLimit40kHz = 39 - 25 * Math.log10(2.5);
    } else if (phi < 7) {
      ituLimit40kHz = 39 - 25 * Math.log10(phi);
    } else if (phi < 9.2) {
      ituLimit40kHz = 18;
    } else if (phi < 48) {
      ituLimit40kHz = 42 - 25 * Math.log10(phi);
    } else {
      ituLimit40kHz = 0;
    }
    ituPsdLimit4kHz = ituLimit40kHz - 10; // 40kHz转4kHz
  } else if (uplinkFrequency >= 13.75 && uplinkFrequency <= 14.5) {
    // Ku频段: 13.75-14.5 GHz (主要FSS上行)
    // ITU RR Article 21 Table 21-4E, 参考带宽40kHz
    ituRefBandwidth = '40kHz';
    let ituLimit40kHz;
    if (phi < 2.5) {
      ituLimit40kHz = 39 - 25 * Math.log10(2.5);
    } else if (phi < 7) {
      ituLimit40kHz = 39 - 25 * Math.log10(phi);
    } else if (phi < 9.2) {
      ituLimit40kHz = 18;
    } else if (phi < 48) {
      ituLimit40kHz = 42 - 25 * Math.log10(phi);
    } else {
      ituLimit40kHz = 0;
    }
    ituPsdLimit4kHz = ituLimit40kHz - 10; // 40kHz转4kHz
  } else if (uplinkFrequency >= 17.3 && uplinkFrequency < 18.4) {
    // Ka低频段(BSS馈线): 17.3-18.4 GHz
    // 参考 ITU RR Article 21 Table 21-4E, 参考带宽40kHz
    ituRefBandwidth = '40kHz';
    let ituLimit40kHz;
    if (phi < 2.5) {
      ituLimit40kHz = 35 - 25 * Math.log10(2.5);
    } else if (phi < 7) {
      ituLimit40kHz = 35 - 25 * Math.log10(phi);
    } else if (phi < 9.2) {
      ituLimit40kHz = 14;
    } else if (phi < 48) {
      ituLimit40kHz = 38 - 25 * Math.log10(phi);
    } else {
      ituLimit40kHz = -4;
    }
    ituPsdLimit4kHz = ituLimit40kHz - 10; // 40kHz转4kHz
  } else if (uplinkFrequency >= 27.5 && uplinkFrequency <= 31.0) {
    // Ka频段: 27.5-31.0 GHz (FSS上行)
    // ITU RR Article 21 Table 21-4F/G, 参考带宽40kHz
    ituRefBandwidth = '40kHz';
    let ituLimit40kHz;
    if (phi < 2.0) {
      ituLimit40kHz = 19 - 25 * Math.log10(2.0);
    } else if (phi < 7) {
      ituLimit40kHz = 19 - 25 * Math.log10(phi);
    } else if (phi < 9.2) {
      ituLimit40kHz = -2;
    } else if (phi < 48) {
      ituLimit40kHz = 22 - 25 * Math.log10(phi);
    } else {
      ituLimit40kHz = -10;
    }
    ituPsdLimit4kHz = ituLimit40kHz - 10; // 40kHz转4kHz
  } else if (uplinkFrequency >= 42.5 && uplinkFrequency < 43.5) {
    // Q频段: 42.5-43.5 GHz (FSS上行)
    // 参考 ITU-R S.524-9, 参考带宽1MHz
    ituRefBandwidth = '1MHz';
    let ituLimit1MHz;
    if (phi < 2.0) {
      ituLimit1MHz = 33 - 25 * Math.log10(2.0);
    } else if (phi < 7) {
      ituLimit1MHz = 33 - 25 * Math.log10(phi);
    } else if (phi < 9.2) {
      ituLimit1MHz = 12;
    } else if (phi < 48) {
      ituLimit1MHz = 36 - 25 * Math.log10(phi);
    } else {
      ituLimit1MHz = -6;
    }
    // 1MHz转4kHz: 10*log10(1000000/4000) = 10*log10(250) ≈ 23.98 dB
    ituPsdLimit4kHz = ituLimit1MHz - 23.98;
  } else if (uplinkFrequency >= 47.2 && uplinkFrequency < 50.2) {
    // V频段: 47.2-50.2 GHz (FSS上行)
    // 参考 ITU-R S.524-9, 参考带宽1MHz
    ituRefBandwidth = '1MHz';
    let ituLimit1MHz;
    if (phi < 2.0) {
      ituLimit1MHz = 30 - 25 * Math.log10(2.0);
    } else if (phi < 7) {
      ituLimit1MHz = 30 - 25 * Math.log10(phi);
    } else if (phi < 9.2) {
      ituLimit1MHz = 9;
    } else if (phi < 48) {
      ituLimit1MHz = 33 - 25 * Math.log10(phi);
    } else {
      ituLimit1MHz = -9;
    }
    // 1MHz转4kHz
    ituPsdLimit4kHz = ituLimit1MHz - 23.98;
  } else if (uplinkFrequency >= 50.4 && uplinkFrequency <= 51.4) {
    // V频段高端: 50.4-51.4 GHz (FSS上行)
    // 参考 ITU-R S.524-9, 参考带宽1MHz
    ituRefBandwidth = '1MHz';
    let ituLimit1MHz;
    if (phi < 2.0) {
      ituLimit1MHz = 28 - 25 * Math.log10(2.0);
    } else if (phi < 7) {
      ituLimit1MHz = 28 - 25 * Math.log10(phi);
    } else if (phi < 9.2) {
      ituLimit1MHz = 7;
    } else if (phi < 48) {
      ituLimit1MHz = 31 - 25 * Math.log10(phi);
    } else {
      ituLimit1MHz = -11;
    }
    // 1MHz转4kHz
    ituPsdLimit4kHz = ituLimit1MHz - 23.98;
  } else {
    // 其他未明确定义的频段：
    // 根据频率范围选择合适的参考限值
    if (uplinkFrequency < 3) {
      // 低于3GHz，参考L/S频段限值
      ituRefBandwidth = '4kHz';
      if (phi < 2.5) {
        ituPsdLimit4kHz = 33 - 25 * Math.log10(2.5);
      } else if (phi < 7) {
        ituPsdLimit4kHz = 33 - 25 * Math.log10(phi);
      } else if (phi < 9.2) {
        ituPsdLimit4kHz = 12;
      } else if (phi < 48) {
        ituPsdLimit4kHz = 36 - 25 * Math.log10(phi);
      } else {
        ituPsdLimit4kHz = -6;
      }
    } else if (uplinkFrequency < 10) {
      // 3-10GHz，参考C/X频段限值
      ituRefBandwidth = '4kHz';
      if (phi < 2.5) {
        ituPsdLimit4kHz = 34 - 25 * Math.log10(2.5);
      } else if (phi < 7) {
        ituPsdLimit4kHz = 25 - 25 * Math.log10(phi);
      } else if (phi < 9.2) {
        ituPsdLimit4kHz = 4;
      } else if (phi < 48) {
        ituPsdLimit4kHz = 28 - 25 * Math.log10(phi);
      } else {
        ituPsdLimit4kHz = -8;
      }
    } else if (uplinkFrequency < 20) {
      // 10-20GHz，参考Ku频段限值
      ituRefBandwidth = '40kHz';
      let ituLimit40kHz;
      if (phi < 2.5) {
        ituLimit40kHz = 38 - 25 * Math.log10(2.5);
      } else if (phi < 7) {
        ituLimit40kHz = 38 - 25 * Math.log10(phi);
      } else if (phi < 9.2) {
        ituLimit40kHz = 17;
      } else if (phi < 48) {
        ituLimit40kHz = 41 - 25 * Math.log10(phi);
      } else {
        ituLimit40kHz = -1;
      }
      ituPsdLimit4kHz = ituLimit40kHz - 10;
    } else if (uplinkFrequency < 40) {
      // 20-40GHz，参考Ka频段限值
      ituRefBandwidth = '40kHz';
      let ituLimit40kHz;
      if (phi < 2.0) {
        ituLimit40kHz = 19 - 25 * Math.log10(2.0);
      } else if (phi < 7) {
        ituLimit40kHz = 19 - 25 * Math.log10(phi);
      } else if (phi < 9.2) {
        ituLimit40kHz = -2;
      } else if (phi < 48) {
        ituLimit40kHz = 22 - 25 * Math.log10(phi);
      } else {
        ituLimit40kHz = -10;
      }
      ituPsdLimit4kHz = ituLimit40kHz - 10;
    } else {
      // 40GHz以上，参考Q/V频段限值
      ituRefBandwidth = '1MHz';
      let ituLimit1MHz;
      if (phi < 2.0) {
        ituLimit1MHz = 30 - 25 * Math.log10(2.0);
      } else if (phi < 7) {
        ituLimit1MHz = 30 - 25 * Math.log10(phi);
      } else if (phi < 9.2) {
        ituLimit1MHz = 9;
      } else if (phi < 48) {
        ituLimit1MHz = 33 - 25 * Math.log10(phi);
      } else {
        ituLimit1MHz = -9;
      }
      ituPsdLimit4kHz = ituLimit1MHz - 23.98;
    }
  }
  
  // 转换为dBW/Hz（统一从4kHz基准转换）
  // 10*log10(4000) ≈ 36.02 dB
  const ituPsdLimitHz = ituPsdLimit4kHz - 10 * Math.log10(4000);
  
  // 发信站旁瓣EIRP：功率 + 旁瓣增益 - 馈电损耗
  const txSidelobeEIRP = selectedPower + txSidelobeGain - feederLoss;
  
  // 发信站旁瓣功率谱密度：旁瓣EIRP - 10*log10(带宽Hz)
  const txSidelobePSD = txSidelobeEIRP - 10 * Math.log10(allocBandwidth * 1000);
  
  // 卫星功率谱密度：卫星EIRP - 10*log10(带宽Hz)
  // 使用每载波占用的卫星EIRP
  const satellitePSD = eirpPerCarrier - 10 * Math.log10(allocBandwidth * 1000);
  
  // ============ 卫星到地面的PFD计算 ============
  // PFD (功率通量密度) = EIRP - 10*log10(4*π*d²) 单位: dBW/m²
  // 其中 d 是斜距（米）
  // 这是一个与频率无关的物理量，只取决于EIRP和距离
  // 注意：不应使用FSL，因为FSL包含了频率项（用于计算接收功率）
  // PFD可以进一步减去大气和云衰减以得到地面实际功率通量密度
  const satelliteActualEIRP = eirpPerCarrier; // 使用载波占用的卫星EIRP
  const rxSlantRangeMeters = rxSlantRange * 1000; // 下行斜距转换为米
  // PFD = EIRP - 10*log10(4*π*d²) = EIRP - 10*log10(4π) - 20*log10(d)
  const spreadingLoss = 10 * Math.log10(4 * CONSTANTS.PI) + 20 * Math.log10(rxSlantRangeMeters);
  const satellitePFD = satelliteActualEIRP - spreadingLoss - downlinkAtmosphericAttenuation - 
                       downlinkCloudAttenuation; // PFD到达地面（不含雨衰）
  
  // ============ ITU RR Article 21 PFD限制计算 ============
  // 根据国际电联无线电规则第21条计算地面PFD限制
  // 参考带宽为4kHz，根据下行频率和收信站仰角计算
  const delta = rxElevation; // 收信站仰角（度）
  let ituPfdLimit4kHz; // ITU PFD限制值 (dBW/m²/4kHz)
  let ituPfdRefBandwidth = '4kHz'; // ITU参考带宽
  
  // 根据下行频率判断适用的ITU限值表格
  if (downlinkFrequency >= 3.4 && downlinkFrequency <= 4.2) {
    // C频段下行: 3.4-4.2 GHz (Table 21-4, RR Article 21)
    if (delta <= 5) {
      ituPfdLimit4kHz = -152;
    } else if (delta <= 25) {
      ituPfdLimit4kHz = -152 + 0.5 * (delta - 5);
    } else {
      ituPfdLimit4kHz = -142;
    }
  } else if (downlinkFrequency >= 4.5 && downlinkFrequency <= 4.8) {
    // 扩展C频段下行: 4.5-4.8 GHz (Table 21-4, RR Article 21)
    if (delta <= 5) {
      ituPfdLimit4kHz = -152;
    } else if (delta <= 25) {
      ituPfdLimit4kHz = -152 + 0.5 * (delta - 5);
    } else {
      ituPfdLimit4kHz = -142;
    }
  } else if (downlinkFrequency >= 10.7 && downlinkFrequency <= 11.7) {
    // Ku频段下行: 10.7-11.7 GHz (Table 21-4A, RR Article 21)
    if (delta <= 5) {
      ituPfdLimit4kHz = -150;
    } else if (delta <= 25) {
      ituPfdLimit4kHz = -150 + 0.5 * (delta - 5);
    } else {
      ituPfdLimit4kHz = -140;
    }
  } else if (downlinkFrequency >= 11.7 && downlinkFrequency <= 12.2) {
    // Ku频段下行: 11.7-12.2 GHz (Table 21-4A, RR Article 21)
    // Region 2 和 Region 3
    if (delta <= 5) {
      ituPfdLimit4kHz = -150;
    } else if (delta <= 25) {
      ituPfdLimit4kHz = -150 + 0.5 * (delta - 5);
    } else {
      ituPfdLimit4kHz = -140;
    }
  } else if (downlinkFrequency >= 12.2 && downlinkFrequency <= 12.75) {
    // Ku频段下行: 12.2-12.75 GHz (Table 21-4A, RR Article 21)
    if (delta <= 5) {
      ituPfdLimit4kHz = -148;
    } else if (delta <= 25) {
      ituPfdLimit4kHz = -148 + 0.5 * (delta - 5);
    } else {
      ituPfdLimit4kHz = -138;
    }
  } else if (downlinkFrequency >= 17.7 && downlinkFrequency <= 19.7) {
    // Ka频段下行: 17.7-19.7 GHz (Table 21-4A-1, RR Article 21)
    // 参考带宽1MHz
    ituPfdRefBandwidth = '1MHz';
    let ituPfdLimit1MHz;
    if (delta <= 5) {
      ituPfdLimit1MHz = -115;
    } else if (delta <= 25) {
      ituPfdLimit1MHz = -115 + 0.5 * (delta - 5);
    } else {
      ituPfdLimit1MHz = -105;
    }
    // 转换为4kHz参考: 1MHz到24kHz = -10*log10(1000000/4000) = -23.98 dB
    ituPfdLimit4kHz = ituPfdLimit1MHz - 10 * Math.log10(1000000 / 4000);
  } else if (downlinkFrequency >= 19.7 && downlinkFrequency <= 21.2) {
    // Ka频段下行: 19.7-21.2 GHz (Table 21-4A-2, RR Article 21)
    // 参考带宽1MHz
    ituPfdRefBandwidth = '1MHz';
    let ituPfdLimit1MHz;
    if (delta <= 5) {
      ituPfdLimit1MHz = -115;
    } else if (delta <= 25) {
      ituPfdLimit1MHz = -115 + 0.5 * (delta - 5);
    } else {
      ituPfdLimit1MHz = -105;
    }
    ituPfdLimit4kHz = ituPfdLimit1MHz - 10 * Math.log10(1000000 / 4000);
  } else if (downlinkFrequency >= 37.5 && downlinkFrequency <= 40.5) {
    // Q频段下行: 37.5-40.5 GHz (Table 21-4B, RR Article 21)
    // 参考带宽1MHz
    ituPfdRefBandwidth = '1MHz';
    let ituPfdLimit1MHz;
    if (delta <= 5) {
      ituPfdLimit1MHz = -115;
    } else if (delta <= 25) {
      ituPfdLimit1MHz = -115 + 0.5 * (delta - 5);
    } else {
      ituPfdLimit1MHz = -105;
    }
    ituPfdLimit4kHz = ituPfdLimit1MHz - 10 * Math.log10(1000000 / 4000);
  } else if (downlinkFrequency >= 40.5 && downlinkFrequency <= 42.5) {
    // V频段下行: 40.5-42.5 GHz (Table 21-4B, RR Article 21)
    // 参考带宽1MHz
    ituPfdRefBandwidth = '1MHz';
    let ituPfdLimit1MHz;
    if (delta <= 5) {
      ituPfdLimit1MHz = -115;
    } else if (delta <= 25) {
      ituPfdLimit1MHz = -115 + 0.5 * (delta - 5);
    } else {
      ituPfdLimit1MHz = -105;
    }
    ituPfdLimit4kHz = ituPfdLimit1MHz - 10 * Math.log10(1000000 / 4000);
  } else {
    // 其他频段：根据频率范围估算
    if (downlinkFrequency < 10) {
      // 低GHz频段，参考C频段限值
      if (delta <= 5) {
        ituPfdLimit4kHz = -152;
      } else if (delta <= 25) {
        ituPfdLimit4kHz = -152 + 0.5 * (delta - 5);
      } else {
        ituPfdLimit4kHz = -142;
      }
    } else if (downlinkFrequency < 18) {
      // 10-18 GHz，参考Ku频段限值
      if (delta <= 5) {
        ituPfdLimit4kHz = -150;
      } else if (delta <= 25) {
        ituPfdLimit4kHz = -150 + 0.5 * (delta - 5);
      } else {
        ituPfdLimit4kHz = -140;
      }
    } else {
      // 18 GHz以上，参考Ka频段限值
      ituPfdRefBandwidth = '1MHz';
      let ituPfdLimit1MHz;
      if (delta <= 5) {
        ituPfdLimit1MHz = -115;
      } else if (delta <= 25) {
        ituPfdLimit1MHz = -115 + 0.5 * (delta - 5);
      } else {
        ituPfdLimit1MHz = -105;
      }
      ituPfdLimit4kHz = ituPfdLimit1MHz - 10 * Math.log10(1000000 / 4000);
    }
  }
  
  // 转换为dBW/m²（每平方米）
  // 从4kHz参考带宽转换到实际载波带宽
  const ituPfdLimitPerM2 = ituPfdLimit4kHz + 10 * Math.log10(allocBandwidth / 4);
  
  // ============ 填充结果对象 ============
  // 误码率显示
  const superscriptMap = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻'
  };
  const berExponentStr = berExponent.toString();
  const superscriptExp = berExponentStr.split('').map(c => superscriptMap[c] || c).join('');
  
  // 极化方式显示映射
  const polarizationDisplayMap = {
    'V': 'V',
    'H': 'H',
    'LHCP': 'LHCP',
    'RHCP': 'RHCP'
  };
  
  // 上行站结果
  results.earthAntennaDiameterResult = antennaDiameter.toFixed(2);
  results.earthLongitudeResult = earthLon.toFixed(4);
  results.earthLatitudeResult = earthLat.toFixed(4);
  results.uplinkPolarizationResult = polarizationDisplayMap[uplinkPolarizationDisplay] || uplinkPolarizationDisplay; // 上行极化方式显示值
  results.elevationResult = elevation.toFixed(2);
  results.elevationValidation = txElevationValidation;
  results.azimuthResult = azimuth.toFixed(2);
  // 圆极化时极化角显示为'-'
  results.uplinkPolarizationAngleResult = (uplinkPolarizationDisplay === 'LHCP' || uplinkPolarizationDisplay === 'RHCP') ? '-' : uplinkPolarizationAngle.toFixed(2);
  results.earthAntennaEfficiencyResult = inputs.antennaEfficiency || "65";
  results.wavelengthResult = wavelength.toFixed(4);
  results.beamWidthResult = beamWidth.toFixed(2);
  results.txAntennaGainResult = txAntennaGain.toFixed(2);
  results.txSidelobeGainResult = txSidelobeGain.toFixed(2); // 发信站旁瓣发射增益
  results.txSidelobeEIRPResult = txSidelobeEIRP.toFixed(2); // 发信站旁瓣EIRP
  results.txSidelobePSDResult = txSidelobePSD.toFixed(3); // 发信站旁瓣功率谱密度
  results.ituPsdLimit4kHz = ituPsdLimit4kHz.toFixed(2); // ITU功率谱密度门限(dBW/4kHz)
  results.ituPsdLimitHz = ituPsdLimitHz.toFixed(3); // ITU功率谱密度门限(dBW/Hz)
  results.feederLossResult = feederLoss.toFixed(2);
  results.slantRangeResult = slantRange.toFixed(2);
  results.uplinkFSLResult = uplinkFSL.toFixed(2);
  results.uplinkRainAttenuation = uplinkRainAttenuation.toFixed(2);
  results.uplinkCloudAttenuation = uplinkCloudAttenuation.toFixed(2);
  results.uplinkAtmosphericAttenuationResult = uplinkAtmosphericAttenuation.toFixed(2);
  results.uplinkCN = uplinkCN.toFixed(2);
  results.actualUplinkCT = actualUplinkCT.toFixed(2); // 载波上行C/T
  
  // 精细化损耗参数
  results.pointingErrorResult = pointingError.toFixed(3); // 指向误差(度)
  results.polarizationLossResult = polarizationLoss.toFixed(2); // 极化失配损耗(dB)
  results.radomeLossResult = radomeLoss.toFixed(2); // 天线罩损耗(dB)
  results.connectorLossResult = connectorLoss.toFixed(2); // 接头损耗(dB)
  results.uplinkMiscLossResult = uplinkMiscLoss.toFixed(3); // 上行综合杂散损耗(dB)
  results.downlinkMiscLossResult = downlinkMiscLoss.toFixed(3); // 下行综合杂散损耗(dB)
  
  // 接收站结果
  results.rxAntennaDiameterResult = rxAntennaDiameter.toFixed(2);
  results.rxLongitudeResult = rxLongitude.toFixed(4);
  results.rxLatitudeResult = rxLatitude.toFixed(4);
  results.downlinkPolarizationResult = polarizationDisplayMap[downlinkPolarizationDisplay] || downlinkPolarizationDisplay; // 下行极化方式显示值
  results.rxElevationResult = rxElevation.toFixed(2);
  results.rxElevationValidation = rxElevationValidation;
  results.rxAzimuthResult = rxAzimuth.toFixed(2);
  // 圆极化时极化角显示为'-'
  results.downlinkPolarizationAngleResult = (downlinkPolarizationDisplay === 'LHCP' || downlinkPolarizationDisplay === 'RHCP') ? '-' : downlinkPolarizationAngle.toFixed(2);
  results.rxAntennaEfficiencyResult = (rxAntennaEfficiency * 100).toFixed(0);
  results.rxWavelengthResult = rxWavelength.toFixed(4); // 下行波长
  results.rxAntennaGainResult = rxAntennaGain.toFixed(2);
  results.theta3 = theta3.toFixed(2);
  results.rxSlantRangeResult = rxSlantRange.toFixed(2);
  results.downlinkFSLResult = downlinkFSL.toFixed(2);
  results.downlinkRainAttenuationResult = downlinkRainAttenuation.toFixed(2);
  results.downlinkCloudAttenuation = downlinkCloudAttenuation.toFixed(2);
  results.downlinkAtmosphericAttenuationResult = downlinkAtmosphericAttenuation.toFixed(2);
  results.downlinkCN = downlinkCN.toFixed(2);
  results.actualDownlinkCT = actualDownlinkCT.toFixed(2); // 载波下行C/T
  results.satellitePFD = satellitePFD.toFixed(2);
  results.ituPfdLimit4kHz = ituPfdLimit4kHz.toFixed(2); // ITU PFD限制(dBW/m²/4kHz)
  results.ituPfdLimitPerM2 = ituPfdLimitPerM2.toFixed(2); // ITU PFD限制(转换到载波带宽)
  results.ituPfdRefBandwidth = ituPfdRefBandwidth; // ITU参考带宽
  // 噪声温度
  results.antennaNoiseTempResult = antennaNoiseTemp;
  results.receiverNoiseTempResult = receiverNoiseTemp;
  results.rainNoiseTempResult = rainNoiseTemp.toFixed(2);
  results.systemNoiseTempKResult = systemNoiseTempK.toFixed(2);
  results.systemNoiseTempDbResult = systemNoiseTempDb.toFixed(2);
  results.gOverTeResult = gOverTe.toFixed(2);
  results.gOverTdegradationResult = gOverTdegradation.toFixed(2);
  results.rxFeederLossResult = rxFeederLoss.toFixed(1);
  results.rxSidelobeGainResult = (rxAntennaGain - ISO).toFixed(2); // 接收旁瓣增益
  
  // 卫星参数
  results.orbitPositionResult = orbitPosition;
  results.EIRPsResult = EIRPs.toFixed(1);
  results.satellitePSDResult = satellitePSD.toFixed(3);
  results.SFDsResult = SFDs.toFixed(2);
  results.BOiResult = BOi;
  results.BOoResult = BOo;
  results.antennaGainResult = antennaGain.toFixed(2);
  results.transponderBandwidthResult = transponderBandwidth;
  
  // 通信参数
  results.uplinkFrequencyResult = uplinkFrequency.toFixed(2);
  results.downlinkFrequencyResult = downlinkFrequency.toFixed(2);
  // 极化方式显示值已在上方设置（使用 polarizationDisplayMap），此处不再重复赋值
  results.infoRateResult = infoRate;
  results.modulationResult = modulation;
  results.modulationFactorResult = modulationFactor;
  results.berResult = `1×10${superscriptExp}`;
  results.ebnoResult = ebno.toFixed(2);
  results.esnoResult = esno.toFixed(2);
  // RS编码率显示：保持原始输入格式（分数或小数）
  results.rsCodeResult = rsCodeOriginal;
  // FEC编码率显示：保持原始输入格式（分数或小数）
  results.fecResult = fecOriginal;
  results.carrierRateResult = carrierRate.toFixed(2);
  results.ChipRateResult = ChipRate.toFixed(2);
  results.symbolRateResult = symbolRate.toFixed(2);
  results.allocBandwidthResult = allocBandwidth;
  results.noiseBW = noiseBW.toFixed(2);
  results.RXnoiseBW = RXnoiseBW.toFixed(2);
  results.marginResult = margin.toFixed(2);
  
  // 可用度
  results.uplinkAvailabilityResult = uplinkAvailability.toFixed(2);
  results.downlinkAvailabilityResult = rxdownlinkAvailability.toFixed(2);
  results.systemAvailabilityResult = systemAvailability;
  
  // C/T和C/N
  results.uplinkCTResult = uplinkCT.toFixed(2);
  results.adjUplinkCTResult = adjUplinkCT.toFixed(2);
  results.xpolUplinkCTResult = xpolUplinkCT.toFixed(2);
  results.downlinkCTResult = downlinkCT.toFixed(2);
  results.adjDownlinkCTResult = adjDownlinkCT.toFixed(2);
  results.xpolDownlinkCTResult = xpolDownlinkCT.toFixed(2);
  results.intermodCTResult = intermodCT.toFixed(2);
  results.totalCTResult = totalCT.toFixed(2);
  results.totalCTRainResult = totalCTRain.toFixed(2);
  results.carrierThresholdCT = carrierThreshold.toFixed(2);
  results.carrierTotalCT = carrierTotalCT.toFixed(2);
  results.carrierTotalCN = carrierTotalCN.toFixed(2);
  results.thresholdCN = thresholdCN.toFixed(2);
  results.linkmargin = linkmargin.toFixed(2);
  
  
  
  // 链路计算结果
  
  results.bandwidthUsageRatio = bandwidthUsageRatio.toFixed(3);
  results.powerUsageRatio = powerUsageRatio.toFixed(3);
  results.transponderLimitedBy = transponderLimitedBy;
  results.maxCarrierCount = maxCarrierCount;
  results.PowerBWResult = PowerBW.toFixed(3);
  results.selectedPowerResult = selectedPower.toFixed(3);
  results.selectedPowerWResult = selectedPowerW.toFixed(3);
  results.paRecommendationdBResult = paRecommendationdB.toFixed(3);
  results.paRecommendation = paRecommendation.toFixed(3);
  results.UPCmarginResult = upcMargin.toFixed(2);
  results.stationEIRPResult = stationEIRP.toFixed(3);
  results.PFDcResult = PFDc.toFixed(3);
  results.stationPSDResult = stationPSD.toFixed(3);
  results.satellitePSDResult = satellitePSD.toFixed(3);
  results.deltagain = deltagain.toFixed(2);
  results.transponderCapacity = transponderCapacity.toFixed(3);
  results.eirpPerCarrier = eirpPerCarrier.toFixed(3);
  results.uplinkPowerRatioResult = uplinkPowerRatio.toFixed(3);
  results.downlinkPowerRatioResult = downlinkPowerRatio.toFixed(3);
  results.downlinkComponentResult = downlinkComponent.toFixed(3);
  results.RXtransponderCapacityResult = RXtransponderCapacity.toFixed(3);
  results.RXeirpPerCarrierResult = RXeirpPerCarrier.toFixed(3);
  results.actualTransponderCapacityResult = actualTransponderCapacity.toFixed(3);
  
  // 转发器回退 (Transponder Backoff) = 卫星的EIRP - 载波占有的EIRP
  // 使用上行雨情况下的载波占有EIRP
  const transponderBackoff = EIRPs - eirpPerCarrier -BOo;
  results.transponderBackoffResult = transponderBackoff.toFixed(3);

  
  return results;
}

/**
 * 获取默认天线罩损耗（根据频率）
 * @param {number} frequencyGHz - 频率 (GHz)
 * @returns {number} 天线罩损耗 (dB)
 */
function getDefaultRadomeLoss(frequencyGHz) {
  if (frequencyGHz <= 8) {
    return 0.05; // C/X频段
  } else if (frequencyGHz <= 18) {
    return 0.15; // Ku频段
  } else if (frequencyGHz <= 32) {
    return 0.3; // Ka频段
  } else {
    return 0.5; // Q/V频段及以上
  }
}

/**
 * 计算天线指向损耗
 * 根据高斯天线方向图近似：L_pointing = 12 * (theta_error / theta_3dB)^2
 * @param {number} pointingError - 指向误差角度 (度)
 * @param {number} beamWidth - 天线3dB波束宽度 (度)
 * @returns {number} 指向损耗 (dB)
 */
function calculatePointingLoss(pointingError, beamWidth) {
  if (beamWidth <= 0 || pointingError <= 0) {
    return 0;
  }
  const ratio = pointingError / beamWidth;
  const pointingLoss = 12 * Math.pow(ratio, 2);
  return Math.min(pointingLoss, 3); // 限制最大3dB，超过说明指向严重偏离
}

/**
 * 根据频率计算综合损耗（简化模型）
 * 综合损耗包含：指向损耗、极化损耗、天线罩损耗、接头损耗、闪烁衰减等
 * 使用线性插值，频率越高损耗越大
 * @param {number} frequencyGHz - 频率 (GHz)
 * @returns {number} 综合损耗 (dB)
 */
function calculateMiscLossByFrequency(frequencyGHz) {
  const MIN_LOSS = 0.05; // 最小综合损耗 dB
  const MAX_LOSS = 1.8;  // 最大综合损耗 dB
  
  // 频率-损耗对照表（线性插值节点）
  const freqLossTable = [
    { freq: 0,  loss: 0.05 },
    { freq: 4,  loss: 0.4 },
    { freq: 6,  loss: 0.5 },
    { freq: 12, loss: 0.8 },
    { freq: 14, loss: 0.9 },
    { freq: 18, loss: 1.0 },
    { freq: 20, loss: 1.1 },
    { freq: 30, loss: 1.5 },
    { freq: 40, loss: 1.6 },
    { freq: 54, loss: 1.7 },
    { freq: 100, loss: 1.8 } // 54GHz以上均为1.8dB
  ];
  
  // 边界检查
  if (frequencyGHz <= 0) {
    return MIN_LOSS;
  }
  if (frequencyGHz >= 54) {
    return MAX_LOSS;
  }
  
  // 线性插值
  for (let i = 0; i < freqLossTable.length - 1; i++) {
    const lower = freqLossTable[i];
    const upper = freqLossTable[i + 1];
    
    if (frequencyGHz >= lower.freq && frequencyGHz <= upper.freq) {
      // 线性插值公式
      const ratio = (frequencyGHz - lower.freq) / (upper.freq - lower.freq);
      const loss = lower.loss + ratio * (upper.loss - lower.loss);
      return Math.max(MIN_LOSS, Math.min(MAX_LOSS, loss));
    }
  }
  
  // 默认返回最大值
  return MAX_LOSS;
}

/**
 * 计算大气闪烁衰减 - 根据 ITU-R P.618-14
 * 适用于仰角 > 5° 的情况
 * @param {number} frequencyGHz - 频率 (GHz)
 * @param {number} elevationDeg - 仰角 (度)
 * @param {number} antennaDiameter - 天线直径 (m)
 * @param {number} availability - 链路可用度 (%, 如 99.9)
 * @returns {number} 闪烁衰减 (dB)
 */
function calculateScintillationFading(frequencyGHz, elevationDeg, antennaDiameter, availability) {
  // 仰角过低时闪烁效应计算不准确
  if (elevationDeg < 4) {
    elevationDeg = 4;
  }
  
  const elevationRad = elevationDeg * CONSTANTS.PI / 180;
  
  // 步骤1: 计算参考标准差 σ_ref (ITU-R P.618-14 第2.4.1节)
  // 使用中等湿度条件下的典型值
  const Nwet = 42; // 湿项折射率的标准差，典型值42 (可根据地区调整)
  
  // 步骤2: 计算有效路径长度 L
  const hL = 1000; // 湍流层高度 (m)，典型值1000m
  const L = 2 * hL / (Math.sqrt(Math.sin(elevationRad) * Math.sin(elevationRad) + 2.35e-4) + Math.sin(elevationRad));
  
  // 步骤3: 计算天线平均因子 g(x)
  // x = sqrt(k*D^2/L), k = 2*pi*f/c
  const wavelengthM = 0.299792458 / frequencyGHz; // 波长 (m)
  const k = 2 * CONSTANTS.PI / wavelengthM;
  const Deff = antennaDiameter * Math.sqrt(0.65); // 有效天线直径（考虑效率）
  const x = Math.sqrt(k * Deff * Deff / L);
  
  // 天线平均因子 g(x) 的近似公式
  let gx;
  if (x < 0.5) {
    gx = 1.0;
  } else if (x < 2) {
    gx = Math.sqrt(3.86 * Math.pow(x, 2) * Math.pow(1 + 1 / (9 * x * x) - Math.pow(1 + 1 / (x * x), 5/6), 2) + 1) - 1;
    gx = Math.sqrt(1 - gx / (3.86 * x * x));
  } else {
    gx = Math.sqrt(3.86 * Math.pow(x, 2) * Math.pow(11/6, 2) / Math.pow(x * x, 11/6));
    gx = Math.pow(x, -7/6) * 1.09;
  }
  gx = Math.max(0.1, Math.min(gx, 1.0)); // 限制在合理范围
  
  // 步骤4: 计算参考闪烁强度标准差 σ
  const sigma_ref = 3.6e-3 + Nwet * 1e-4; // 参考标准差
  const sigma = sigma_ref * Math.pow(frequencyGHz, 7/12) * gx / Math.pow(Math.sin(elevationRad), 1.2);
  
  // 步骤5: 根据可用度计算闪烁衰减
  // 使用对数正态分布的百分比因子
  const p = 100 - availability; // 不可用百分比
  let a_p;
  if (p <= 0.01) {
    a_p = 3.5; // 99.99%可用度
  } else if (p <= 0.1) {
    a_p = 3.0; // 99.9%可用度
  } else if (p <= 1) {
    a_p = 2.3; // 99%可用度
  } else if (p <= 5) {
    a_p = 1.65; // 95%可用度
  } else {
    a_p = 1.0; // 90%可用度
  }
  
  const scintillationFading = a_p * sigma;
  
  // 限制最大值，避免异常
  return Math.min(scintillationFading, 3.0);
}

/**
 * 计算极化角
 */
function calculatePolarizationAngle(stationLon, stationLat, satLon) {
  const deltaLonRad = (stationLon - satLon) * CONSTANTS.PI / 180;
  const latRad = stationLat * CONSTANTS.PI / 180;
  const polarizationAngleRad = Math.atan(Math.sin(deltaLonRad) / Math.tan(latRad));
  const polarizationAngleDeg = polarizationAngleRad * 180 / CONSTANTS.PI;
  return polarizationAngleDeg;
}

/**
 * 获取天顶方向的大气衰减分量（氧气 + 水蒸气）
 * 基于 ITU-R P.676-13 Annex 2 简化模型
 * 标准大气条件: 温度15°C, 水蒸气密度7.5 g/m³, 地面气压1013 hPa
 *
 * @param {number} freq - 频率 (GHz)
 * @returns {object} { oxygenZenith, waterVaporZenith } 天顶方向氧气和水蒸气衰减 (dB)
 */
function getZenithAttenuation(freq) {
  // γ_o × h_o 和 γ_w × h_w 的典型值（标准大气）
  // 氧气等效高度 h_o ≈ 6 km, 水蒸气等效高度 h_w ≈ 2.1 km
  if (freq >= 55) return { oxygenZenith: 40.00, waterVaporZenith: 2.33 };
  if (freq >= 54) return { oxygenZenith: 17.50, waterVaporZenith: 1.25 };
  if (freq >= 53) return { oxygenZenith: 7.50,  waterVaporZenith: 0.95 };
  if (freq >= 52) return { oxygenZenith: 3.80,  waterVaporZenith: 0.70 };
  if (freq >= 50) return { oxygenZenith: 1.50,  waterVaporZenith: 0.50 };
  if (freq >= 45) return { oxygenZenith: 0.52,  waterVaporZenith: 0.37 };
  if (freq >= 40) return { oxygenZenith: 0.22,  waterVaporZenith: 0.30 };
  if (freq >= 20) return { oxygenZenith: 0.08,  waterVaporZenith: 0.20 };
  if (freq >= 18) return { oxygenZenith: 0.06,  waterVaporZenith: 0.10 };
  if (freq >= 10) return { oxygenZenith: 0.04,  waterVaporZenith: 0.06 };
  return { oxygenZenith: 0.03, waterVaporZenith: 0.03 };
}

/**
 * 计算大气衰减 - 根据 ITU-R P.676-13 建议书
 *
 * 参考文献:
 *   ITU-R P.676-13 (12/2022)
 *   "Attenuation by atmospheric gases and related effects"
 *   Annex 2, Section 2.2 — Slant path gaseous attenuation
 *
 * 天顶方向大气衰减:
 *   A_zenith = γ_o × h_o + γ_w × h_w          (Eq. 37)
 *
 * 倾斜路径衰减:
 *   仰角 θ ≥ 10°:
 *     A(θ) = A_zenith / sin(θ)                (Eq. 38)
 *   仰角 θ < 10°（考虑地球曲率修正）:
 *     A(θ) = (γ_o·h_o)/√(sin²θ + 2·h_o/R_e)
 *          + (γ_w·h_w)/√(sin²θ + 2·h_w/R_e)  (Eq. 39)
 *   其中:
 *     h_o = 6.0 km   — 干燥空气(氧气)等效高度
 *     h_w = 2.1 km   — 水蒸气等效高度
 *     R_e = 8500 km  — 等效地球半径
 *
 * @param {number} frequencyGHz  - 频率 (GHz)
 * @param {number} elevationDeg  - 仰角 (度)
 * @returns {number} 大气衰减 (dB)
 */
function calculateAtmosphericAttenuation(frequencyGHz, elevationDeg) {
  const { oxygenZenith, waterVaporZenith } = getZenithAttenuation(frequencyGHz);
  const zenithTotal = oxygenZenith + waterVaporZenith;

  // 未提供仰角时返回天顶衰减（向后兼容）
  if (elevationDeg === undefined || elevationDeg === null || elevationDeg >= 90) {
    return zenithTotal;
  }

  // 最低限制为 0°
  if (elevationDeg < 0) elevationDeg = 0;

  // ITU-R P.676-13 等效高度参数
  const h_o = 6.0;    // 干燥空气等效高度 (km)
  const h_w = 2.1;    // 水蒸气等效高度 (km)
  const R_e = 8500;   // 等效地球半径 (km)

  const sinEl = Math.sin(elevationDeg * Math.PI / 180);

  if (elevationDeg >= 10) {
    // 仰角 ≥ 10°: 余割法则 — ITU-R P.676-13 Eq. (38)
    return zenithTotal / sinEl;
  }

  // 仰角 < 10°: 分别对氧气和水蒸气应用地球曲率修正
  // ITU-R P.676-13 Eq. (39)
  const oxygenSlant     = oxygenZenith     / Math.sqrt(sinEl * sinEl + 2 * h_o / R_e);
  const waterVaporSlant  = waterVaporZenith / Math.sqrt(sinEl * sinEl + 2 * h_w / R_e);
  return oxygenSlant + waterVaporSlant;
}

/**
 * 计算云衰减 - 根据ITU-R P.840-9建议书
 */
function calculateCloudAttenuation(frequency, elevation, rainRate) {
  // 如果降雨率为0，云衰减为0
  if (rainRate === 0 || rainRate === null || rainRate === undefined) {
    return 0;
  }
  
  // 频率单位：GHz, 仰角单位：度, 降雨率单位：mm/h
  
  // 云液态水含量 (kg/m²)
  const L = 0.2 + 0.003 * Math.sqrt(rainRate);
  
  // 温度参数
  const T = 273; // K
  
  // 计算复介电常数的虚部 (Debye模型)
  const epsilon_0 = 77.6 + 103.3 * (T - 273) / T;
  const epsilon_inf = 5.48;
  const fp = 20.09 - 142.4 * (T - 273) / T + 294.6 * Math.pow((T - 273) / T, 2);
  
  // 复介电常数的虚部
  const epsilon_imag = ((epsilon_0 - epsilon_inf) * frequency) / 
                       (fp * (1 + Math.pow(frequency / fp, 2)));
  
  // 比衰减系数 (dB/km per kg/m²)
  const Kl = (0.819 * frequency) / (epsilon_imag + 2.25);
  
  // 计算路径长度因子
  const elevationRad = elevation * CONSTANTS.PI / 180;
  const sinElevation = Math.sin(elevationRad);
  
  let pathLengthFactor;
  if (elevation >= 5) {
    pathLengthFactor = 1 / sinElevation;
  } else {
    pathLengthFactor = 1 / Math.sqrt(sinElevation * sinElevation + 2.35e-4);
  }
  
  // 云层厚度
  const cloudThickness = 2.0; // km
  
  // 云衰减 (dB)
  const cloudAttenuation = Kl * L * pathLengthFactor * cloudThickness;
  
  return cloudAttenuation;
}

/**
 * 查找最接近的频率键
 */
function findClosestFrequency(freq) {
  const keys = Object.keys(P838_TABLE).map(Number);
  let closest = keys[0];
  let minDiff = Math.abs(freq - closest);
  
  for (const key of keys) {
    const diff = Math.abs(freq - key);
    if (diff < minDiff) {
      minDiff = diff;
      closest = key;
    }
  }
  
  return closest;
}

/**
 * 获取P838系数 - 根据频率和极化
 */
function getCoefficients(freq, pol) {
  const entry = P838_TABLE[freq];
  if (!entry) {
    return [0, 0];
  }
  
  if (pol === 'C') { // 圆极化
    const k_H = entry.k_H;
    const alpha_H = entry.alpha_H;
    const k_V = entry.k_V;
    const alpha_V = entry.alpha_V;
    // 公式（4）计算k
    const k = (k_H + k_V) / 2;
    // 公式（5）计算alpha
    const alpha = (k_H * alpha_H + k_V * alpha_V) / (2 * k);
    return [k, alpha];
  }
  
  return pol === 'H'
    ? [entry.k_H, entry.alpha_H]
    : [entry.k_V, entry.alpha_V];
}

/**
 * 计算单路径降雨衰减 - 完全按照 index.html 实现
 */
function calculateSinglePathRainAttenuation(R001, freq, pol, latitude, longitude, orbitPos, altitude) {
  if (R001 === 0 || R001 === null || R001 === undefined) {
    return 0;
  }
  
  // 步骤 1: 计算卫星仰角
  const earthLatRad = latitude * CONSTANTS.PI / 180;
  const deltaLonRad_elev = (orbitPos - longitude) * CONSTANTS.PI / 180;
  const cosTerm_elev = Math.cos(earthLatRad) * Math.cos(deltaLonRad_elev);
  const denominator = Math.sqrt(Math.max(1e-10, 1 - Math.pow(cosTerm_elev, 2))); // 防止除零
  const elevationRad = Math.atan((cosTerm_elev - 0.15127) / denominator);
  const elevationDeg = elevationRad * 180 / CONSTANTS.PI;
  
  // 步骤 2: 根据纬度确定雨高（按照 ITU-R P.839 建议）
  let h0;
  const absLat = Math.abs(latitude);
  if (absLat < 23) {
    h0 = 4.9; // 热带地区
  } else if (absLat >= 23.5 && absLat < 45) {
    h0 = 4.9 - ((absLat - 23.5) * 0.075); // 中纬度地区
  } else {
    h0 = 3.45; // 高纬度地区
  }
  const hR = h0 + 0.36; // 雨高（km）
  
  // 步骤 3: 计算通过雨区的倾斜路径长度
  let Ls;
  if (elevationDeg >= 5) {
    // 对于仰角 ≥ 5° 的情况使用简化公式
    Ls = (hR - altitude) / Math.sin(elevationRad);
  } else {
    // 对于低仰角使用更准确的公式（考虑地球曲率）
    const Re = 8495; // 有效地球半径（km）
    const sinElev = Math.sin(elevationRad);
    Ls = (2 * (hR - altitude)) / (Math.sqrt(sinElev * sinElev + 2 * (hR - altitude) / Re) + sinElev);
  }
  
  // 步骤 4: 计算水平投影长度
  const LG = Ls * Math.cos(elevationRad);
  
  // 步骤 5: 计算比降雨衰减（specific attenuation）
  const [k, alpha] = getCoefficients(freq, pol);
  const gamma = k * Math.pow(R001, alpha); // 比降雨衰减 (dB/km)
  
  // 步骤 6: 计算水平路径缩减因子
  const r001 = 1 / (1 + 0.78 * Math.sqrt(LG * gamma / freq) - 0.38 * (1 - Math.exp(-2 * LG)));
  
  // 步骤 7: 计算垂直调整因子
  let zeta = Math.atan((hR - altitude) / (LG * r001));
  if (zeta > elevationRad) {
    zeta = elevationRad;
  }
  const LR = LG * r001 / Math.cos(zeta);
  
  // 按照 ITU-R P.618-13 计算垂直调整因子
  const term = 31 * (1 - Math.exp(-elevationDeg / (1 + elevationDeg))) * Math.sqrt(LR * gamma) / (freq * freq);
  let v001 = 1 / (1 + Math.sqrt(Math.sin(elevationRad)) * (term - 0.45));
  
  // 根据纬度调整垂直因子
  const chi = 36 - absLat; // 纬度依赖因子
  if (chi > 0) {
    const chiRad = chi * CONSTANTS.PI / 180;
    v001 = (1 + Math.cos(chiRad) * Math.cos(chiRad) * v001) / 2;
  }
  
  // 步骤 8: 计算有效路径长度
  const LE = LR * v001;
  
  // 步骤 9: 计算0.01%时间超过的衰减值
  const A001 = gamma * LE;
  
  return A001;
}

/**
 * 计算卫星方位角和仰角
 * @param {number} userLat - 用户纬度（度）
 * @param {number} userLon - 用户经度（度）
 * @param {number} satLon - 卫星轨位经度（度）
 * @returns {object} 包含 azimuth（方位角）和 elevation（仰角）的对象
 */
function calculateSatelliteAngle(userLat, userLon, satLon) {
  const earthLatRad = userLat * CONSTANTS.PI / 180;
  
  // 仰角计算
  const deltaLonRad_elev = (satLon - userLon) * CONSTANTS.PI / 180;
  const cosTerm_elev = Math.abs(Math.cos(earthLatRad) * Math.cos(deltaLonRad_elev));
  const elevationRad = Math.atan(
    (cosTerm_elev - 0.15127) / Math.sqrt(1 - Math.pow(cosTerm_elev, 2))
  );
  const elevation = elevationRad * 180 / CONSTANTS.PI;
  
  // 方位角计算
  let azimuth;
  if (userLat > 0) {
    const temp = Math.abs(Math.atan(
      Math.tan((userLon - satLon) * CONSTANTS.PI / 180) / Math.sin(earthLatRad)
    ) * 180 / CONSTANTS.PI);
    azimuth = (satLon > userLon) ? 180 - temp : 180 + temp;
  } else {
    const temp = Math.abs(Math.atan(
      Math.tan((userLon - satLon) * CONSTANTS.PI / 180) / Math.sin(earthLatRad)
    ) * 180 / CONSTANTS.PI);
    azimuth = (satLon > userLon) ? temp : 360 - temp;
  }
  
  return {
    azimuth: azimuth,
    elevation: elevation
  };
}

module.exports = {
  calculateLinkBudget,
  calculateSatelliteAngle
};

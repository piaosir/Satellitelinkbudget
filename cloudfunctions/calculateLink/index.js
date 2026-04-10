// cloudfunctions/calculateLink/index.js
// 卫星链路计算云函数 - 完整算法版本

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

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
  EARTH_RADIUS: 6371, // 地球平均半径 km
  SATELLITE_ALTITUDE: 35786, // 地球同步卫星高度 km
  GEO_RADIUS: 42644, // 地球同步轨道半径 km
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

exports.main = async (event, context) => {
  try {
    console.log('收到的事件数据:', JSON.stringify(event));
    
    const { satelliteParams, linkParams, linkNum } = event;
    
    // 参数验证
    if (!satelliteParams || !linkParams) {
      throw new Error('缺少必需的参数：satelliteParams 或 linkParams');
    }
    
    console.log('参数验证通过，开始计算');
    
    // 执行链路计算 - 使用完整算法
    const results = performCalculations(satelliteParams, linkParams);
    
    console.log('计算完成，结果:', JSON.stringify(results));
    
    return {
      success: true,
      data: results,
      linkNum: linkNum
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
};

/**
 * 主计算函数 - 严格遵循 index.html 的 performCalculations 算法
 */
function performCalculations(satParams, inputs) {
  const results = {};
  
  // ============ 基础参数提取 ============
  const satelliteName = satParams.name || "未命名卫星";
  const frequencyBand = satParams.frequencyBand;
  const transponderStatus = satParams.transponderStatus || 'single';
  // 保存原始极化显示值（LHCP/RHCP/V/H），并转换为计算用的值（C/V/H）
  const uplinkPolarizationDisplay = inputs.uplinkPolarization || satParams.uplinkPolarization || 'V';
  const uplinkPolarization = (uplinkPolarizationDisplay === 'LHCP' || uplinkPolarizationDisplay === 'RHCP') ? 'C' : uplinkPolarizationDisplay;
  const transponderBandwidth = parseFloat(satParams.transponderBandwidth) || 36; // MHz
  const orbitPosition = (satParams.position !== '' && satParams.position !== null && satParams.position !== undefined)
    ? parseFloat(satParams.position) : 110.5;
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
  
  // 干扰因子 (支持输入0)
  const deltaTheta = inputs.deltaTheta !== undefined && inputs.deltaTheta !== '' && inputs.deltaTheta !== null
    ? parseFloat(inputs.deltaTheta) 
    : 3; // 度 - 角度偏差
  const aciUplinkFactor = inputs.aciUplinkFactor !== undefined && inputs.aciUplinkFactor !== '' && inputs.aciUplinkFactor !== null
    ? parseFloat(inputs.aciUplinkFactor) 
    : 30; // dB
  const adjUplinkFactor = inputs.adjUplinkFactor !== undefined && inputs.adjUplinkFactor !== '' && inputs.adjUplinkFactor !== null
    ? parseFloat(inputs.adjUplinkFactor) 
    : 25; // dB
  const adjDownlinkFactor = inputs.adjDownlinkFactor !== undefined && inputs.adjDownlinkFactor !== '' && inputs.adjDownlinkFactor !== null
    ? parseFloat(inputs.adjDownlinkFactor) 
    : 25; // dB
  const xpolUplinkFactor = inputs.xpolUplinkFactor !== undefined && inputs.xpolUplinkFactor !== '' && inputs.xpolUplinkFactor !== null
    ? parseFloat(inputs.xpolUplinkFactor) 
    : 26; // dB
  const xpolDownlinkFactor = inputs.xpolDownlinkFactor !== undefined && inputs.xpolDownlinkFactor !== '' && inputs.xpolDownlinkFactor !== null
    ? parseFloat(inputs.xpolDownlinkFactor) 
    : 26; // dB
  const hpaIntermodFactor = inputs.hpaIntermodFactor !== undefined && inputs.hpaIntermodFactor !== '' && inputs.hpaIntermodFactor !== null
    ? parseFloat(inputs.hpaIntermodFactor) 
    : 24; // dB
  const aciDownlinkFactor = inputs.aciDownlinkFactor !== undefined && inputs.aciDownlinkFactor !== '' && inputs.aciDownlinkFactor !== null
    ? parseFloat(inputs.aciDownlinkFactor) 
    : 30; // dB
  const xpdrIntermodFactor = inputs.xpdrIntermodFactor !== undefined && inputs.xpdrIntermodFactor !== '' && inputs.xpdrIntermodFactor !== null
    ? parseFloat(inputs.xpdrIntermodFactor) 
    : 21; // dB
  
  // UPC参数
  const uplinkPowerControl = inputs.uplinkPowerControl || '否';
  const paBackoff = inputs.paBackoff !== undefined && inputs.paBackoff !== '' && inputs.paBackoff !== null
    ? parseFloat(inputs.paBackoff) 
    : 0; // dB - 功放回退 (支持输入0)
  
  // ============ 频率参数 ============
  const uplinkFrequency = (inputs.centerFrequency !== '' && inputs.centerFrequency !== null && inputs.centerFrequency !== undefined)
    ? parseFloat(inputs.centerFrequency) : 14.25; // GHz
  const downlinkFrequency = (inputs.rxCenterFrequency !== '' && inputs.rxCenterFrequency !== null && inputs.rxCenterFrequency !== undefined)
    ? parseFloat(inputs.rxCenterFrequency) : 12.5; // GHz
  
  // ============ 计算波长和天线增益 ============
  const wavelength = 0.3 / uplinkFrequency; // 上行波长 (米)
  const rxWavelength = 0.3 / downlinkFrequency; // 下行波长 (米)
  
  // 卫星天线每平方米增益
  const antennaGain = 10 * Math.log10(4 * CONSTANTS.PI / (wavelength ** 2));
  
  // 转发器回退参数
  const BOi = transponderStatus === 'single' ? 0 : 6; // 输入回退 (dB)
  const BOo = transponderStatus === 'single' ? 0 : 3; // 输出回退 (dB)
  
  // SFDs计算
  const SFDs = SFDref - G_Ts;
  
  // 下行极化方式 - 保存原始极化显示值（LHCP/RHCP/V/H），并转换为计算用的值（C/V/H）
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
  const cosTerm_elev = Math.abs(Math.cos(earthLatRad) * Math.cos(deltaLonRad_elev));
  const elevationRad = Math.atan(
    (cosTerm_elev - 0.151) / Math.sqrt(1 - Math.pow(cosTerm_elev, 2))
  );
  const elevation = elevationRad * 180 / CONSTANTS.PI;
  
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
  const slantRange = CONSTANTS.GEO_RADIUS * Math.sqrt(1 - 0.2954 * cosTerm_dist);
  
  // 上行自由空间损耗
  const uplinkFSL = 20 * (Math.log10(uplinkFrequency) + Math.log10(slantRange * 1000)) + 
                    20 * Math.log10((4 * CONSTANTS.PI) / 0.3);
  
  // ============ 接收站几何计算 ============
  const rxDeltaLonRad = (orbitPosition - rxLongitude) * CONSTANTS.PI / 180;
  const rxEarthLatRad = rxLatitude * CONSTANTS.PI / 180;
  const rxCosTerm = Math.cos(rxEarthLatRad) * Math.cos(rxDeltaLonRad);
  const rxElevationRad = Math.atan(
    (rxCosTerm - 0.151) / Math.sqrt(1 - Math.pow(rxCosTerm, 2))
  );
  const rxElevation = rxElevationRad * 180 / CONSTANTS.PI;
  
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
  const rxSlantRange = CONSTANTS.GEO_RADIUS * Math.sqrt(1 - 0.2954 * rxCosTerm_dist);
  
  // 下行自由空间损耗
  const downlinkFSL = 20 * (Math.log10(downlinkFrequency) + Math.log10(rxSlantRange * 1000)) + 
                      20 * Math.log10((4 * CONSTANTS.PI) / 0.3);
  
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
  const noiseBW = symbolRate * 1.05; // kHz
  const RXnoiseBW = 10 * Math.log10(noiseBW * 1000); // dBHz
  
  // 载波门限值C/T
  const carrierThreshold = ebno + CONSTANTS.BOLTZMANN + 10 * Math.log10(infoRate * 1000);
  
  // 载波总C/T, C/N
  const carrierTotalCT = carrierThreshold + margin;
  const carrierTotalCN = carrierTotalCT + CONSTANTS.BOLTZMANN - RXnoiseBW;
  
  // 门限C/N
  const thresholdCN = ebno + 10 * Math.log10(infoRate / noiseBW);
  
  // ============ 干扰计算 ============
  // 邻星干扰隔离度
  let ISO;
  if (deltaTheta < theta3) {
    ISO = 0.0025 * Math.pow((rxAntennaDiameter * deltaTheta) / rxWavelength, 2);
  } else if (deltaTheta >= theta3 && deltaTheta <= 20) {
    ISO = rxAntennaGain - (29 - 25 * Math.log10(deltaTheta));
  } else {
    ISO = rxAntennaGain + 3.50;
  }
  const deltagain = rxAntennaGain - ISO;
  
  // 各项C/T值计算
  const uplinkCT = SFDs - antennaGain - BOi + G_Ts;
  const aciUplinkCT = 10 * Math.log10(transponderBandwidth * 1e6) + 
                      CONSTANTS.BOLTZMANN + aciUplinkFactor;
  const adjUplinkCT = 10 * Math.log10(transponderBandwidth * 1e6) + 
                      CONSTANTS.BOLTZMANN + adjUplinkFactor;
  const xpolUplinkCT = 10 * Math.log10(transponderBandwidth * 1e6) + 
                       CONSTANTS.BOLTZMANN + xpolUplinkFactor;
  const hpaIntermodCT = 10 * Math.log10(transponderBandwidth * 1e6) + 
                        CONSTANTS.BOLTZMANN + hpaIntermodFactor;
  const downlinkCT = EIRPs - BOo - downlinkFSL - 0.85 - downlinkCloudAttenuation - 
                     downlinkAtmosphericAttenuation + gOverTe;
  const aciDownlinkCT = 10 * Math.log10(transponderBandwidth * 1e6) + 
                        CONSTANTS.BOLTZMANN + aciDownlinkFactor;
  const adjDownlinkCT = ISO + CONSTANTS.BOLTZMANN + 
                        10 * Math.log10(transponderBandwidth * 1e6) + adjDownlinkFactor;
  const xpolDownlinkCT = 10 * Math.log10(transponderBandwidth * 1e6) + 
                         CONSTANTS.BOLTZMANN + xpolDownlinkFactor;
  const xpdrIntermodCT = 10 * Math.log10(transponderBandwidth * 1e6) + 
                         CONSTANTS.BOLTZMANN + xpdrIntermodFactor;
  
  // 计算总C/T（对数运算）
  // 先计算上行总C/T
  const uplinkTotalCTLinear = 1 / (
    Math.pow(10, -uplinkCT / 10) +
    Math.pow(10, -aciUplinkCT / 10) +
    Math.pow(10, -adjUplinkCT / 10) +
    Math.pow(10, -xpolUplinkCT / 10) +
    Math.pow(10, -hpaIntermodCT / 10)
  );
  const uplinkTotalCT = 10 * Math.log10(uplinkTotalCTLinear);
  
  // 再计算下行总C/T（含Xpdr互调）
  const downlinkTotalCTLinear = 1 / (
    Math.pow(10, -downlinkCT / 10) +
    Math.pow(10, -aciDownlinkCT / 10) +
    Math.pow(10, -adjDownlinkCT / 10) +
    Math.pow(10, -xpolDownlinkCT / 10) +
    Math.pow(10, -xpdrIntermodCT / 10)
  );
  const downlinkTotalCT = 10 * Math.log10(downlinkTotalCTLinear);
  
  // 合并上下行得到总C/T
  const totalCTLinear = 1 / (
    Math.pow(10, -uplinkTotalCT / 10) +
    Math.pow(10, -downlinkTotalCT / 10)
  );
  const totalCT = 10 * Math.log10(totalCTLinear);
  
  // ============ UPC补偿计算 ============
  let upcMargin = 0;
  const upcRawValue = (uplinkPowerControl || '').toString().trim().toLowerCase();
  if (upcRawValue === '是' || upcRawValue === 'yes') {
    upcMargin = uplinkRainAttenuation;
  } else if (upcRawValue !== '否' && upcRawValue !== 'no' && upcRawValue !== '') {
    const customMargin = parseFloat(uplinkPowerControl);
    if (!isNaN(customMargin) && isFinite(customMargin)) {
      upcMargin = Math.max(0, customMargin);
    }
  }
  
  const residualRainLoss = Math.max(0, uplinkRainAttenuation - upcMargin);
  const extraUPCGain = Math.max(0, upcMargin - uplinkRainAttenuation);
  const totalCTRain = totalCT - residualRainLoss;
  
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
  // 上行总C/T（上行部分不变）
  const rainUplinkTotalCTLinear = 1 / (
    Math.pow(10, -uplinkCT / 10) +
    Math.pow(10, -aciUplinkCT / 10) +
    Math.pow(10, -adjUplinkCT / 10) +
    Math.pow(10, -xpolUplinkCT / 10) +
    Math.pow(10, -hpaIntermodCT / 10)
  );
  const rainUplinkTotalCT = 10 * Math.log10(rainUplinkTotalCTLinear);
  
  // 下行总C/T（考虑下行降雨衰减和G/T恶化，含Xpdr互调）
  const rainDownlinkTotalCTLinear = 1 / (
    Math.pow(10, -(downlinkCT - downlinkRainAttenuation - gOverTdegradation) / 10) +
    Math.pow(10, -aciDownlinkCT / 10) +
    Math.pow(10, -adjDownlinkCT / 10) +
    Math.pow(10, -xpolDownlinkCT / 10) +
    Math.pow(10, -xpdrIntermodCT / 10)
  );
  const rainDownlinkTotalCT = 10 * Math.log10(rainDownlinkTotalCTLinear);
  
  // 合并上下行
  const totalInterferenceLinear = Math.pow(10, -rainUplinkTotalCT / 10) +
    Math.pow(10, -rainDownlinkTotalCT / 10);
  
  // 下行雨卫星总C/T
  const downlinkComponent = 10 * Math.log10(1 / totalInterferenceLinear);
  const downlinkPowerRatio = Math.pow(10, (EIRPs - BOo - downlinkComponent + 
                                           carrierTotalCT - EIRPs + BOo) / 10) * 100;
  
  // 转发器容量 - 下行降雨
  const RXtransponderCapacity = downlinkComponent - carrierTotalCT;
  
  // 下行降雨 - 载波占有卫星有效全向辐射功率
  const RXeirpPerCarrier = EIRPs - BOo - RXtransponderCapacity;
  
  // ============ 带宽和功率占用 ============
  const bandwidthUsageRatio = (allocBandwidth / (transponderBandwidth * 1000)) * 100;
  const powerUsageRatio = Math.max(uplinkPowerRatio, downlinkPowerRatio);
  const PowerBW = powerUsageRatio * transponderBandwidth * 10;
  
  // ============ 功放计算 ============
  const basePaBackoff = paBackoff;
  const totalPaBackoff = basePaBackoff + extraUPCGain;
  
  // 上行功率计算
  const UPPOWER = (SFDs - BOi + uplinkFSL - antennaGain - transponderCapacity + 
                  totalCTRain - totalCT + uplinkRainAttenuation + 0.85 + uplinkCloudAttenuation) - 
                  txAntennaGain + feederLoss + uplinkAtmosphericAttenuation;
  
  // 下行功率计算
  const totalInterference = Math.pow(10, -uplinkCT / 10) +
    Math.pow(10, -aciUplinkCT / 10) +
    Math.pow(10, -adjUplinkCT / 10) +
    Math.pow(10, -xpolUplinkCT / 10) +
    Math.pow(10, -hpaIntermodCT / 10) +
    Math.pow(10, -downlinkCT / 10) +
    Math.pow(10, -aciDownlinkCT / 10) +
    Math.pow(10, -adjDownlinkCT / 10) +
    Math.pow(10, -xpolDownlinkCT / 10) +
    Math.pow(10, -xpdrIntermodCT / 10);
  const interferenceTerm = 10 * Math.log10(1 / totalInterferenceLinear);
  
  const DOWNPOWER = (SFDs - BOi + uplinkFSL - antennaGain - interferenceTerm + 
                    carrierTotalCT + 0.85 + downlinkCloudAttenuation) - 
                    txAntennaGain + feederLoss + uplinkRainAttenuation + uplinkAtmosphericAttenuation;
  
  // 选择功率类型 - 使用高精度计算
  const selectedPower = (uplinkPowerRatio > downlinkPowerRatio) ? UPPOWER : DOWNPOWER;
  // 保持完整精度，仅在最终显示时四舍五入
  const selectedPowerW = Math.pow(10, selectedPower / 10);
  
  // 功放最大输出功率 - 使用高精度计算
  const paRecommendationdB = selectedPower + totalPaBackoff;
  const paRecommendation = Math.pow(10, paRecommendationdB / 10);
  
  // ============ EIRP和通量密度 ============
  const stationEIRP = selectedPower + txAntennaGain - feederLoss;
  const PFDc = SFDs - BOi + 10 * Math.log10(allocBandwidth / (transponderBandwidth * 1000));
  
  // 地球站功率谱密度：EIRP - 10*log10(带宽Hz)
  const stationPSD = stationEIRP - 10 * Math.log10(allocBandwidth * 1000);
  
  // 卫星功率谱密度：卫星EIRP - 10*log10(带宽Hz)
  // 使用每载波占用的卫星EIRP
  const satellitePSD = eirpPerCarrier - 10 * Math.log10(allocBandwidth * 1000);
  
  // ============ 卫星到地面的PFD计算 ============
  // PFD = EIRP_satellite - 下行自由空间损耗 - 大气衰减 - 云衰减
  // 卫星实际输出的EIRP = EIRPs - BOo (饱和EIRP减去输出回退)
  // 考虑下行链路损耗（不含雨衰）
  const satelliteActualEIRP = eirpPerCarrier; // 使用载波占用的卫星EIRP
  const satellitePFD = satelliteActualEIRP - downlinkFSL - downlinkAtmosphericAttenuation - 
                       downlinkCloudAttenuation + 
                       10 * Math.log10(4 * CONSTANTS.PI); // PFD = EIRP - FSL + 10log(4π)
  
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
  } else if (downlinkFrequency >= 19.7 && downlinkFrequency <= 21.2) {
    // Ka频段下行: 19.7-21.2 GHz (Table 21-4A-2, RR Article 21)
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
      if (delta <= 5) {
        ituPfdLimit4kHz = -152;
      } else if (delta <= 25) {
        ituPfdLimit4kHz = -152 + 0.5 * (delta - 5);
      } else {
        ituPfdLimit4kHz = -142;
      }
    } else if (downlinkFrequency < 18) {
      if (delta <= 5) {
        ituPfdLimit4kHz = -150;
      } else if (delta <= 25) {
        ituPfdLimit4kHz = -150 + 0.5 * (delta - 5);
      } else {
        ituPfdLimit4kHz = -140;
      }
    } else {
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
    'V': '垂直极化(V)',
    'H': '水平极化(H)',
    'LHCP': '左旋圆极化(LHCP)',
    'RHCP': '右旋圆极化(RHCP)'
  };
  
  // 上行站结果
  results.earthAntennaDiameterResult = antennaDiameter.toFixed(2);
  results.earthLongitudeResult = earthLon.toFixed(4);
  results.earthLatitudeResult = earthLat.toFixed(4);
  results.uplinkPolarizationResult = polarizationDisplayMap[uplinkPolarizationDisplay] || uplinkPolarizationDisplay; // 上行极化方式显示值
  results.elevationResult = elevation.toFixed(2);
  results.azimuthResult = azimuth.toFixed(2);
  // 圆极化时极化角显示为'-'
  results.uplinkPolarizationAngleResult = (uplinkPolarizationDisplay === 'LHCP' || uplinkPolarizationDisplay === 'RHCP') ? '-' : uplinkPolarizationAngle.toFixed(2);
  results.earthAntennaEfficiencyResult = inputs.antennaEfficiency || "65";
  results.wavelengthResult = wavelength.toFixed(4);
  results.beamWidthResult = beamWidth.toFixed(2);
  results.txAntennaGainResult = txAntennaGain.toFixed(2);
  results.feederLossResult = feederLoss.toFixed(2);
  results.slantRangeResult = slantRange.toFixed(2);
  results.uplinkFSLResult = uplinkFSL.toFixed(2);
  results.uplinkRainAttenuation = uplinkRainAttenuation.toFixed(2);
  results.uplinkCloudAttenuation = uplinkCloudAttenuation.toFixed(2);
  results.uplinkAtmosphericAttenuationResult = uplinkAtmosphericAttenuation.toFixed(2);
  
  // 接收站结果
  results.rxAntennaDiameterResult = rxAntennaDiameter.toFixed(2);
  results.rxLongitudeResult = rxLongitude.toFixed(4);
  results.rxLatitudeResult = rxLatitude.toFixed(4);
  results.downlinkPolarizationResult = polarizationDisplayMap[downlinkPolarizationDisplay] || downlinkPolarizationDisplay; // 下行极化方式显示值
  results.rxElevationResult = rxElevation.toFixed(2);
  results.rxAzimuthResult = rxAzimuth.toFixed(2);
  // 圆极化时极化角显示为'-'
  results.downlinkPolarizationAngleResult = (downlinkPolarizationDisplay === 'LHCP' || downlinkPolarizationDisplay === 'RHCP') ? '-' : downlinkPolarizationAngle.toFixed(2);
  results.rxAntennaEfficiencyResult = (rxAntennaEfficiency * 100).toFixed(0);
  results.rxAntennaGainResult = rxAntennaGain.toFixed(2);
  results.theta3 = theta3.toFixed(2);
  results.rxSlantRangeResult = rxSlantRange.toFixed(2);
  results.downlinkFSLResult = downlinkFSL.toFixed(2);
  results.downlinkRainAttenuationResult = downlinkRainAttenuation.toFixed(2);
  results.downlinkCloudAttenuation = downlinkCloudAttenuation.toFixed(2);
  results.downlinkAtmosphericAttenuationResult = downlinkAtmosphericAttenuation.toFixed(2);
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
  results.uplinkPolarizationResult = uplinkPolarization;
  results.downlinkPolarizationResult = downlinkPolarization;
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
  // 预计中断时长（基于系统可用度，按年计算）
  const systemUnavailability = (100 - parseFloat(systemAvailability)) / 100;
  const interruptionMinutes = systemUnavailability * 365.25 * 24 * 60;
  const interruptionHours = interruptionMinutes / 60;
  results.interruptionMinutes = interruptionMinutes.toFixed(2);
  results.interruptionHours = interruptionHours.toFixed(2);
  
  // C/T和C/N
  results.uplinkCTResult = uplinkCT.toFixed(2);
  results.aciUplinkCTResult = aciUplinkCT.toFixed(2);
  results.adjUplinkCTResult = adjUplinkCT.toFixed(2);
  results.xpolUplinkCTResult = xpolUplinkCT.toFixed(2);
  results.hpaIntermodCTResult = hpaIntermodCT.toFixed(2);
  results.downlinkCTResult = downlinkCT.toFixed(2);
  results.aciDownlinkCTResult = aciDownlinkCT.toFixed(2);
  results.adjDownlinkCTResult = adjDownlinkCT.toFixed(2);
  results.xpolDownlinkCTResult = xpolDownlinkCT.toFixed(2);
  results.xpdrIntermodCTResult = xpdrIntermodCT.toFixed(2);
  results.totalCTResult = totalCT.toFixed(2);
  results.totalCTRainResult = totalCTRain.toFixed(2);
  results.carrierThresholdCT = carrierThreshold.toFixed(2);
  results.carrierTotalCT = carrierTotalCT.toFixed(2);
  results.carrierTotalCN = carrierTotalCN.toFixed(2);
  results.thresholdCN = thresholdCN.toFixed(2);
  results.linkmargin = linkmargin.toFixed(2);
  
  // 转发器和功率
  results.transponderCapacity = transponderCapacity.toFixed(3);
  results.eirpPerCarrier = eirpPerCarrier.toFixed(3);
  results.uplinkPowerRatioResult = uplinkPowerRatio.toFixed(3);
  results.downlinkPowerRatioResult = downlinkPowerRatio.toFixed(3);
  results.downlinkComponentResult = downlinkComponent.toFixed(3);
  results.RXtransponderCapacityResult = RXtransponderCapacity.toFixed(3);
  results.RXeirpPerCarrierResult = RXeirpPerCarrier.toFixed(3);
  
  // 带宽和功率占用
  results.bandwidthUsageRatio = bandwidthUsageRatio.toFixed(3);
  results.powerUsageRatio = powerUsageRatio.toFixed(3);
  results.PowerBWResult = PowerBW.toFixed(3);
  
  // 功放和发射功率
  results.selectedPowerResult = selectedPower.toFixed(3);
  results.selectedPowerWResult = selectedPowerW.toFixed(3);
  results.paRecommendationdBResult = paRecommendationdB.toFixed(3);
  results.paRecommendation = paRecommendation.toFixed(3);
  results.UPCmarginResult = upcMargin.toFixed(2);
  
  // EIRP和通量
  results.stationEIRPResult = stationEIRP.toFixed(3);
  results.PFDcResult = PFDc.toFixed(3);
  results.stationPSDResult = stationPSD.toFixed(3);
  results.satellitePSDResult = satellitePSD.toFixed(3);
  
  // 干扰
  results.deltagain = deltagain.toFixed(2);
  
  return results;
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

// ============================================================
// 大气气体衰减计算 — 严格依据 ITU-R P.676-13 (12/2022)
// "Attenuation by atmospheric gases and related effects"
// Annex 2: Approximate estimation of gaseous attenuation
// 适用频率范围: 1 – 350 GHz
//
// 关键吸收特征:
//   22.235 GHz — 水蒸气谐振吸收线
//   60 GHz 附近 — 氧气吸收复合体 (50-70 GHz)
//   118.75 GHz — 氧气吸收线
//   183.31 GHz — 水蒸气吸收线
//
// 参考标准大气 (ITU-R P.835-6):
//   气压 P = 1013.25 hPa, 温度 T = 15°C, 水蒸气密度 ρ = 7.5 g/m³
// ============================================================

function phi676(rp, rt, a, b, c, d) {
  return Math.pow(rp, a) * Math.pow(rt, b) *
         Math.exp(c * (1 - rp) + d * (1 - rt));
}

/**
 * 干燥空气(氧气)比衰减 γ_o (dB/km)
 * ITU-R P.676-13 Annex 2 Section 2.1, Eq. (22a)-(22f)
 */
function calcSpecificAttenOxygen(f, rp, rt) {
  const xi1 = phi676(rp, rt, 0.0717, -1.8132, 0.0156, -1.6515);
  const xi2 = phi676(rp, rt, 0.5146, -4.6368, -0.1921, -5.7416);
  const xi3 = phi676(rp, rt, 0.3414, -6.5851, 0.2130, -8.5854);

  if (f <= 54) {
    const A = 7.2 * Math.pow(rt, 2.8) /
              (f * f + 0.34 * rp * rp * Math.pow(rt, 1.6));
    const B = 0.62 * xi3 /
              (Math.pow(Math.max(54 - f, 0.5), 1.16 * xi1) + 0.83 * xi2);
    return (A + B) * f * f * rp * rp * 1e-3;
  }

  if (f > 66 && f <= 120) {
    const xi4 = phi676(rp, rt, -0.0112, 0.0092, -0.1033, -0.0009);
    const xi5 = phi676(rp, rt, 0.2705, -2.7192, -0.3016, -4.1033);
    const xi6 = phi676(rp, rt, 0.2445, -5.9191, 0.0422, -8.0719);
    const xi7 = phi676(rp, rt, -0.1833, 6.5589, -0.2402, 6.131);
    const A = 3.02e-4 * Math.pow(rt, 3.5);
    const B = 0.283 * Math.pow(rt, 3.8) /
              (Math.pow(f - 118.75, 2) + 2.91 * rp * rp * Math.pow(rt, 1.6));
    const C = 0.502 * xi6 * (1 - 0.0163 * xi7 * (f - 66)) /
              (Math.pow(f - 66, 1.4346 * xi4) + 1.15 * xi5);
    return (A + B + C) * f * f * rp * rp * 1e-3;
  }

  if (f > 120) {
    const A = 3.02e-4 / (1 + 1.9e-5 * Math.pow(f, 1.5));
    const B = 0.283 * Math.pow(rt, 0.3) /
              (Math.pow(f - 118.75, 2) + 2.91 * rp * rp * Math.pow(rt, 1.6));
    return (A + B) * f * f * rp * rp * Math.pow(rt, 3.5) * 1e-3;
  }

  // 54 < f ≤ 66: 氧气吸收复合体（对数插值）
  const gamma54 = calcSpecificAttenOxygen(54, rp, rt);
  const gamma66 = calcSpecificAttenOxygen(66.01, rp, rt);
  const gammaPeak60 = 14.9 * rp * rp * Math.pow(rt, 3.5);
  if (f <= 60) {
    const t = (f - 54) / 6;
    return Math.exp(Math.log(gamma54) * (1 - t) + Math.log(gammaPeak60) * t);
  }
  const t = (f - 60) / 6;
  return Math.exp(Math.log(gammaPeak60) * (1 - t) + Math.log(gamma66) * t);
}

/**
 * 水蒸气比衰减 γ_w (dB/km)
 * ITU-R P.676-13 Annex 2 Section 2.1, Eq. (23)
 */
function calcSpecificAttenWaterVapor(f, rp, rt, rho) {
  const eta1 = 0.955 * rp * Math.pow(rt, 0.68) + 0.006 * rho;
  const eta2 = 0.735 * rp * Math.pow(rt, 0.5) + 0.0353 * Math.pow(rt, 4) * rho;

  function g(fi) {
    const r = (f - fi) / (f + fi);
    return 1 + r * r;
  }

  const sum =
      3.98 * eta1 * Math.exp(2.23 * (1 - rt)) /
        (Math.pow(f - 22.235, 2) + 9.42 * eta1 * eta1) * g(22)
    + 11.96 * eta1 * Math.exp(0.7 * (1 - rt)) /
        (Math.pow(f - 183.31, 2) + 11.14 * eta1 * eta1)
    + 0.081 * eta1 * Math.exp(6.44 * (1 - rt)) /
        (Math.pow(f - 321.226, 2) + 6.29 * eta1 * eta1)
    + 3.66 * eta1 * Math.exp(1.6 * (1 - rt)) /
        (Math.pow(f - 325.153, 2) + 9.22 * eta1 * eta1)
    + 25.37 * eta1 * Math.exp(1.09 * (1 - rt)) /
        Math.pow(f - 380, 2)
    + 17.4 * eta1 * Math.exp(1.46 * (1 - rt)) /
        Math.pow(f - 448, 2)
    + 844.6 * eta1 * Math.exp(0.17 * (1 - rt)) /
        Math.pow(f - 557, 2) * g(557)
    + 290 * eta1 * Math.exp(0.41 * (1 - rt)) /
        Math.pow(f - 752, 2) * g(752)
    + 8.3328e4 * eta2 * Math.exp(0.99 * (1 - rt)) /
        Math.pow(f - 1780, 2) * g(1780);

  return sum * f * f * Math.pow(rt, 2.5) * rho * 1e-4;
}

/**
 * 氧气等效高度 h_o (km)
 * ITU-R P.676-13 Annex 2 Section 2.2, Eq. (32)
 */
function calcEquivHeightOxygen(f, rp) {
  const sigma1 = 2.87 + 12.4 * Math.exp(-7.9 * rp);
  const t1 = 4.64 / (1 + 0.066 * Math.pow(rp, -2.3)) *
             Math.exp(-Math.pow((f - 59.7) / sigma1, 2));
  const t2 = 0.14 * Math.exp(2.12 * rp) /
             (Math.pow(f - 118.75, 2) + 0.031 * Math.exp(2.2 * rp));
  const t3 = 0.0114 / (1 + 0.14 * Math.pow(rp, -2.6)) * f *
             (-0.0247 + 0.0001 * f + 1.61e-6 * f * f) /
             (1 - 0.0169 * f + 4.1e-5 * f * f + 3.2e-7 * f * f * f);
  return 6.1 / (1 + 0.17 * Math.pow(rp, -1.1)) * (1 + t1 + t2 + t3);
}

/**
 * 水蒸气等效高度 h_w (km)
 * ITU-R P.676-13 Annex 2 Section 2.2, Eq. (33)
 */
function calcEquivHeightWaterVapor(f, rp) {
  const sigmaW = 1.013 / (1 + Math.exp(-8.6 * (rp - 0.57)));
  return 1.66 * (1
    + 1.39 * sigmaW / (Math.pow(f - 22.235, 2) + 2.56 * sigmaW)
    + 3.37 * sigmaW / (Math.pow(f - 183.31, 2) + 4.69 * sigmaW)
    + 1.58 * sigmaW / (Math.pow(f - 325.1, 2) + 2.89 * sigmaW)
  );
}

/**
 * 计算大气衰减 — ITU-R P.676-13 Annex 2 完整算法
 */
function calculateAtmosphericAttenuation(frequencyGHz, elevationDeg) {
  // 输入防护: 防止 NaN 传播
  if (!isFinite(frequencyGHz) || frequencyGHz <= 0) return 0;
  if (elevationDeg !== undefined && elevationDeg !== null && !isFinite(elevationDeg)) {
    elevationDeg = undefined;
  }

  const rp  = 1.0;
  const rt  = 1.0;
  const rho = 7.5;

  const gammaO = calcSpecificAttenOxygen(frequencyGHz, rp, rt);
  const gammaW = calcSpecificAttenWaterVapor(frequencyGHz, rp, rt, rho);
  const ho = calcEquivHeightOxygen(frequencyGHz, rp);
  const hw = calcEquivHeightWaterVapor(frequencyGHz, rp);

  const Ao = gammaO * ho;
  const Aw = gammaW * hw;

  if (elevationDeg === undefined || elevationDeg === null || elevationDeg >= 90) {
    return Ao + Aw;
  }
  if (elevationDeg < 0) elevationDeg = 0;

  const sinEl = Math.sin(elevationDeg * Math.PI / 180);
  const Re = 8500;

  if (elevationDeg >= 10) {
    return (Ao + Aw) / sinEl;
  }

  const oxygenSlant     = Ao / Math.sqrt(sinEl * sinEl + 2 * ho / Re);
  const waterVaporSlant = Aw / Math.sqrt(sinEl * sinEl + 2 * hw / Re);
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
  const elevationRad = Math.atan((cosTerm_elev - 0.151) / denominator);
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

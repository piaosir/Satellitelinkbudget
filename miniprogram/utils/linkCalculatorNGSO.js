// linkCalculatorNGSO.js
// NGSO（非地球静止轨道）卫星链路本地计算模块
const { P676_PART1 } = require('./p676Data.js');
const CLOUD_GRID = require('../data/cloudParamsGrid.js'); // ITU-R P.840-9 Lred 对数正态参数地图
const { getRhoWs } = require('../data/waterVaporGrid.js'); // ITU-R P.836-6 地面水汽密度地图
// 基于 linkCalculator.js，针对 NGSO 链路做了以下调整：
// 1. 绕过 GEO 专属的轨位/几何计算，直接使用用户输入的最低仰角
// 2. 根据用户选择使用 “轨道高度” 或 “星地斜距” 计算链路距离
//    - 轨道高度模式采用球形地球模型下的精确公式：
//      d = -Re·sin(el) + sqrt(Re²·sin²(el) + h² + 2·Re·h)
// 3. 在最后合并上下行得到总 C/T 时引入星间链路 (ISL)
// 4. 星地经度差在 NGSO 链路计算中的作用说明：详见文件末尾分析注释

const validator = require('./validator.js');
const { getIsothermHeight } = require('./isothermHeight.js');

/**
 * 解析FEC码率字符串，支持任意形式的分数和小数
 * @param {string|number} fecInput - FEC码率输入（如 "3/4", "11/55", "0.75"）
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
  '128APSK': 7,
  '256APSK': 8
};

// ITU-R P.838 降雨衰减系数表 (完全按照 index.html)
const P838_TABLE = {
  1: { k_H: 0.000025892705, alpha_H: 0.96907444, k_V: 0.000030797361, alpha_V: 0.85922053 },
  2: { k_H: 0.000084686876, alpha_H: 1.0664189, k_V: 0.000099766062, alpha_V: 0.94896086 },
  3: { k_H: 0.000138979031, alpha_H: 1.2321603, k_V: 0.000194231849, alpha_V: 1.0687585 },
  4: { k_H: 0.00010713452, alpha_H: 1.6008816, k_V: 0.000246077198, alpha_V: 1.2475492 },
  5: { k_H: 0.000216150314, alpha_H: 1.6969267, k_V: 0.000242763745, alpha_V: 1.5317316 },
  6: { k_H: 0.000705586708, alpha_H: 1.5900457, k_V: 0.000487824508, alpha_V: 1.5727561 },
  7: { k_H: 0.0019149876, alpha_H: 1.4810276, k_V: 0.0014247707, alpha_V: 1.4744899 },
  8: { k_H: 0.0041154302, alpha_H: 1.390512, k_V: 0.0034498248, alpha_V: 1.3797357 },
  9: { k_H: 0.0075346436, alpha_H: 1.3154597, k_V: 0.0066908078, alpha_V: 1.2895105 },
  10: { k_H: 0.012166988, alpha_H: 1.2570969, k_V: 0.01129187, alpha_V: 1.215645 },
  11: { k_H: 0.017718799, alpha_H: 1.2140084, k_V: 0.017307344, alpha_V: 1.1617056 },
  12: { k_H: 0.023857793, alpha_H: 1.1824726, k_V: 0.02454833, alpha_V: 1.1215943 },
  13: { k_H: 0.03041288, alpha_H: 1.158639, k_V: 0.032656034, alpha_V: 1.0900799 },
  14: { k_H: 0.037375011, alpha_H: 1.139556, k_V: 0.041258318, alpha_V: 1.0646263 },
  15: { k_H: 0.044814639, alpha_H: 1.1232753, k_V: 0.050082454, alpha_V: 1.0439919 },
  16: { k_H: 0.052817368, alpha_H: 1.1086208, k_V: 0.058991895, alpha_V: 1.02729 },
  17: { k_H: 0.061455939, alpha_H: 1.0949247, k_V: 0.067968978, alpha_V: 1.0137111 },
  18: { k_H: 0.070784069, alpha_H: 1.0818267, k_V: 0.077076121, alpha_V: 1.0025047 },
  19: { k_H: 0.080838515, alpha_H: 1.0691419, k_V: 0.086417626, alpha_V: 0.99301241 },
  20: { k_H: 0.091642669, alpha_H: 1.0567811, k_V: 0.096111206, alpha_V: 0.98468993 },
  21: { k_H: 0.1032095, alpha_H: 1.0447058, k_V: 0.10627015, alpha_V: 0.97711019 },
  22: { k_H: 0.1155435, alpha_H: 1.0329027, k_V: 0.11699376, alpha_V: 0.96995443 },
  23: { k_H: 0.12864198, alpha_H: 1.0213699, k_V: 0.12836316, alpha_V: 0.96299667 },
  24: { k_H: 0.14249583, alpha_H: 1.0101105, k_V: 0.1404403, alpha_V: 0.95608638 },
  25: { k_H: 0.15709015, alpha_H: 0.9991285, k_V: 0.15326853, alpha_V: 0.94913169 },
  26: { k_H: 0.17240481, alpha_H: 0.98842745, k_V: 0.16687405, alpha_V: 0.94208463 },
  27: { k_H: 0.18841489, alpha_H: 0.97800963, k_V: 0.18126761, alpha_V: 0.93492872 },
  28: { k_H: 0.20509125, alpha_H: 0.96787591, k_V: 0.19644632, alpha_V: 0.92766912 },
  29: { k_H: 0.22240103, alpha_H: 0.95802573, k_V: 0.21239548, alpha_V: 0.92032489 },
  30: { k_H: 0.24030819, alpha_H: 0.94845732, k_V: 0.22909032, alpha_V: 0.91292323 },
  31: { k_H: 0.25877402, alpha_H: 0.93916779, k_V: 0.24649762, alpha_V: 0.9054953 },
  32: { k_H: 0.27775773, alpha_H: 0.93015338, k_V: 0.26457728, alpha_V: 0.89807327 },
  33: { k_H: 0.29721692, alpha_H: 0.92140958, k_V: 0.2832838, alpha_V: 0.89068829 },
  34: { k_H: 0.31710806, alpha_H: 0.91293129, k_V: 0.30256755, alpha_V: 0.88336924 },
  35: { k_H: 0.33738699, alpha_H: 0.90471296, k_V: 0.32237605, alpha_V: 0.876142 },
  36: { k_H: 0.35800932, alpha_H: 0.89674868, k_V: 0.34265498, alpha_V: 0.86902908 },
  37: { k_H: 0.37893081, alpha_H: 0.88903227, k_V: 0.36334918, alpha_V: 0.86204954 },
  38: { k_H: 0.40010772, alpha_H: 0.8815574, k_V: 0.38440346, alpha_V: 0.85521909 },
  39: { k_H: 0.42149715, alpha_H: 0.8743176, k_V: 0.40576327, alpha_V: 0.84855024 },
  40: { k_H: 0.44305724, alpha_H: 0.86730633, k_V: 0.42737533, alpha_V: 0.84205265 },
  41: { k_H: 0.46474746, alpha_H: 0.86051705, k_V: 0.44918808, alpha_V: 0.83573336 },
  42: { k_H: 0.48652876, alpha_H: 0.85394324, k_V: 0.47115201, alpha_V: 0.82959713 },
  43: { k_H: 0.50836375, alpha_H: 0.84757842, k_V: 0.49322003, alpha_V: 0.82364674 },
  44: { k_H: 0.53021678, alpha_H: 0.84141619, k_V: 0.51534758, alpha_V: 0.81788326 },
  45: { k_H: 0.55205407, alpha_H: 0.83545023, k_V: 0.53749282, alpha_V: 0.81230635 },
  46: { k_H: 0.57384377, alpha_H: 0.82967436, k_V: 0.55961668, alpha_V: 0.80691446 },
  47: { k_H: 0.59555596, alpha_H: 0.8240825, k_V: 0.58168291, alpha_V: 0.80170507 },
  48: { k_H: 0.61716269, alpha_H: 0.81866871, k_V: 0.60365804, alpha_V: 0.79667486 },
  49: { k_H: 0.638638, alpha_H: 0.81342718, k_V: 0.62551134, alpha_V: 0.79181991 },
  50: { k_H: 0.65995784, alpha_H: 0.80835228, k_V: 0.64721474, alpha_V: 0.78713577 },
  51: { k_H: 0.68110011, alpha_H: 0.80343849, k_V: 0.66874277, alpha_V: 0.78261767 },
  52: { k_H: 0.70204455, alpha_H: 0.79868046, k_V: 0.69007239, alpha_V: 0.77826056 },
  53: { k_H: 0.72277271, alpha_H: 0.79407301, k_V: 0.71118294, alpha_V: 0.77405922 },
  54: { k_H: 0.7432679, alpha_H: 0.78961108, k_V: 0.73205596, alpha_V: 0.77000832 },
  55: { k_H: 0.76351508, alpha_H: 0.78528979, k_V: 0.7526751, alpha_V: 0.76610252 },
  60: { k_H: 0.86061304, alpha_H: 0.76563228, k_V: 0.85152007, alpha_V: 0.74856482 },
  70: { k_H: 1.0314779, alpha_H: 0.73446512, k_V: 1.0253337, alpha_V: 0.72153399 },
  80: { k_H: 1.170445, alpha_H: 0.71149456, k_V: 1.166831, alpha_V: 0.7020764 },
  90: { k_H: 1.2807147, alpha_H: 0.6943701, k_V: 1.2794572, alpha_V: 0.68761399 },
  100: { k_H: 1.3671083, alpha_H: 0.68145001, k_V: 1.3680473, alpha_V: 0.67654052 },
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
 * NGSO 专用：由轨道高度 + 最低仰角计算星地斜距（球形地球精确几何）
 *
 * 推导：在由 地球中心 O、地面站 G、卫星 S 构成的三角形中
 *   |OG| = Re        （地球半径）
 *   |OS| = Re + h    （卫星地心距）
 *   在 G 点从地平面测得的仰角为 el，则向量 GS 与地平切线夹角为 el
 *   ∠OGS = 90° + el
 * 由余弦定理：
 *   |OS|² = |OG|² + |GS|² − 2·|OG|·|GS|·cos(∠OGS)
 *   (Re+h)² = Re² + d² + 2·Re·d·sin(el)
 * 解关于 d 的一元二次方程（取正根）：
 *   d = -Re·sin(el) + sqrt(Re²·sin²(el) + h² + 2·Re·h)
 *
 * @param {number} orbitAltitudeKm 轨道高度 (km)
 * @param {number} elevationDeg 仰角 (°)
 * @returns {number} 星地斜距 (km)
 */
function slantRangeFromAltitude(orbitAltitudeKm, elevationDeg) {
  const Re = 6378.137; // WGS-84 赤道半径 km（与 GEO 计算保持一致）
  const h = Math.max(0, Number(orbitAltitudeKm) || 0);
  const el = Math.max(0, Math.min(90, Number(elevationDeg) || 0)) * Math.PI / 180;
  const sinEl = Math.sin(el);
  return -Re * sinEl + Math.sqrt(Re * Re * sinEl * sinEl + h * h + 2 * Re * h);
}

/**
 * NGSO 专用：由星地斜距 + 仰角反算轨道高度（slantRangeFromAltitude 的逆运算）
 * (Re+h)² = Re² + d² + 2·Re·d·sin(el)  ⇒  h = sqrt(Re² + d² + 2·Re·d·sin(el)) − Re
 * @param {number} slantRangeKm 斜距 (km)
 * @param {number} elevationDeg 仰角 (°)
 * @returns {number} 轨道高度 (km)
 */
function altitudeFromSlantRange(slantRangeKm, elevationDeg) {
  const Re = 6378.137;
  const d = Math.max(0, Number(slantRangeKm) || 0);
  const el = Math.max(0, Math.min(90, Number(elevationDeg) || 0)) * Math.PI / 180;
  const sinEl = Math.sin(el);
  return Math.sqrt(Re * Re + d * d + 2 * Re * d * sinEl) - Re;
}

/**
 * NGSO 专用：根据输入模式统一解析星地斜距
 * @param {string} mode 'slantRange' | 'altitude'
 * @param {number|string} slantRangeInput 用户输入的斜距(km)
 * @param {number|string} altitudeInput 用户输入的轨道高度(km)
 * @param {number} elevationDeg 最低仰角(°)
 * @param {number} defaultAltitude 缺省轨道高度
 * @returns {number} 斜距 (km)
 */
function resolveNgsoSlantRange(mode, slantRangeInput, altitudeInput, elevationDeg, defaultAltitude = 1200) {
  if (mode === 'slantRange') {
    const d = parseFloat(slantRangeInput);
    if (!isNaN(d) && isFinite(d) && d > 0) return d;
    // 回退：按缺省高度+当前仰角推算
    return slantRangeFromAltitude(defaultAltitude, elevationDeg);
  }
  // altitude 模式
  const h = parseFloat(altitudeInput);
  const hUse = (!isNaN(h) && isFinite(h) && h > 0) ? h : defaultAltitude;
  return slantRangeFromAltitude(hUse, elevationDeg);
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
  // 取数助手：仅当为空('' / null / undefined)时回退默认；输入了什么(含 0、含非法字符)就如实 parseFloat，
  // 不再用 `parseFloat(x) || 默认` 的二次兜底（那会把用户输入的 0 当成默认值，导致输入与计算结果对不上）
  const pickNum = (v, def) => (v !== '' && v !== null && v !== undefined) ? parseFloat(v) : def;

  // ============ 基础参数提取 ============
  const satelliteName = satParams.satelliteName || satParams.name || "未命名卫星";
  const frequencyBand = satParams.frequencyBand;
  const transponderStatus = satParams.transponderStatus || 'single';
  // 修复：优先从 inputs 读取极化参数，如果没有则从 satParams 读取
  // 保存原始极化显示值（LHCP/RHCP/V/H），并转换为计算用的值（C/V/H）
  const uplinkPolarizationDisplay = inputs.uplinkPolarization || satParams.uplinkPolarization || 'V';
  const uplinkPolarization = (uplinkPolarizationDisplay === 'LHCP' || uplinkPolarizationDisplay === 'RHCP') ? 'C' : uplinkPolarizationDisplay;
  const transponderBandwidth = pickNum(satParams.transponderBandwidth, 36); // MHz
  const _orbitPosRaw = satParams.orbitPosition !== undefined && satParams.orbitPosition !== '' && satParams.orbitPosition !== null
    ? satParams.orbitPosition : (satParams.position !== undefined && satParams.position !== '' && satParams.position !== null ? satParams.position : null);
  const orbitPosition = _orbitPosRaw !== null ? parseFloat(_orbitPosRaw) : 110.5;
  const EIRPs = pickNum(inputs.rxEIRP, 46); // dBW - 卫星下行EIRP
  const G_Ts = pickNum(inputs.G_Ts, 2); // dB/K - 卫星G/T
  const SFDref = (satParams.sfdRef !== '' && satParams.sfdRef !== null && satParams.sfdRef !== undefined)
    ? parseFloat(satParams.sfdRef) : -82; // dBW/m² - SFD参考值
  
  // ============ 通信参数 ============
  const infoRate = pickNum(inputs.infoRate, 2048); // kbps - 信息速率
  const modulation = inputs.modulation || "QPSK";
  // FEC码率：支持分数和小数格式，保留原始输入用于显示
  const fecOriginal = String(inputs.fec || '0.75').trim();
  const fec = parseFecForCalculation(fecOriginal, 0.75); // FEC码率（数值）
  // RS编码码率：支持分数和小数格式，保留原始输入用于显示
  const rsCodeOriginal = String(inputs.rsCode || '188/204').trim();
  const rsCode = parseRsCodeForCalculation(rsCodeOriginal, 188/204); // RS码效率（数值）
  const bandwidthFactor = pickNum(inputs.bandwidthFactor, 1.2); // 带宽系数(默认与应用预填/实时预览统一为 1.2)
  const berExponent = ((inputs.ber !== '' && inputs.ber !== null && inputs.ber !== undefined)
    ? parseFloat(inputs.ber) : 7) * -1; // 误码率指数
  
  // 噪声比模式：支持 'ebno' 或 'esno'
  const noiseRatioMode = inputs.noiseRatioMode || 'ebno';
  const inputNoiseRatio = inputs.ebno !== '' && inputs.ebno !== null && inputs.ebno !== undefined
    ? parseFloat(inputs.ebno) : 5.0; // dB - 输入的噪声比值
  
  // 修复：正确处理 margin = 0 的情况
  const margin = (inputs.margin !== '' && inputs.margin !== null && inputs.margin !== undefined)
    ? parseFloat(inputs.margin) : 3; // dB - 链路余量
  const m = pickNum(inputs.m, 1.0); // 扩频增益
  
  // ============ 上行站参数 ============
  const earthLon = (inputs.longitude !== '' && inputs.longitude !== null && inputs.longitude !== undefined)
    ? parseFloat(inputs.longitude) : 116.4074;
  const earthLat = (inputs.latitude !== '' && inputs.latitude !== null && inputs.latitude !== undefined)
    ? parseFloat(inputs.latitude) : 39.9042;
  const antennaDiameter = pickNum(inputs.antennaDiameter, 7.3); // meters
  const antennaEfficiency = pickNum(inputs.antennaEfficiency, 65) / 100;
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
  const rxAntennaDiameter = pickNum(inputs.rxAntennaDiameter, 1.2); // meters
  const rxAntennaEfficiency = pickNum(inputs.rxAntennaEfficiency, 65) / 100;
  const rxFeederLoss = inputs.rxFeederLoss !== undefined && inputs.rxFeederLoss !== '' && inputs.rxFeederLoss !== null
    ? parseFloat(inputs.rxFeederLoss) 
    : 0.2; // dB (支持输入0)
  const rxDownlinkAvailability = ((inputs.rxDownlinkAvailability !== '' && inputs.rxDownlinkAvailability !== null && inputs.rxDownlinkAvailability !== undefined)
    ? parseFloat(inputs.rxDownlinkAvailability) : 99.90) / 100;
  const rxRainRate = parseFloat(inputs.rxRainRate) || 0; // mm/h
  const rxAltitude = (parseFloat(inputs.rxAltitude) || 0) / 1000; // km
  
  // 噪声温度参数 (支持输入0)
  const antennaNoiseTemp = (inputs.rxAntennaNoiseTemp !== undefined && inputs.rxAntennaNoiseTemp !== '' && inputs.rxAntennaNoiseTemp !== null)
    ? parseFloat(inputs.rxAntennaNoiseTemp)
    : ((frequencyBand === 'C' || frequencyBand === 'ExtC') ? 30 : 35); // K
  const receiverNoiseTemp = (inputs.rxReceiverNoiseTemp !== undefined && inputs.rxReceiverNoiseTemp !== '' && inputs.rxReceiverNoiseTemp !== null)
    ? parseFloat(inputs.rxReceiverNoiseTemp)
    : ((frequencyBand === 'C' || frequencyBand === 'ExtC') ? 40 : 75); // K
  
  // 干扰因子 - 从卫星参数中读取 (支持输入0)
  const deltaTheta = satParams.deltaTheta !== undefined && satParams.deltaTheta !== '' && satParams.deltaTheta !== null
    ? parseFloat(satParams.deltaTheta) 
    : 3; // 度 - 角度偏差

  // ============ NGSO 专属：轨道倾角 ============
  // 轨道倾角影响地球自转对多普勒频移的贡献分量：v_E_eff = ω_E·r·cos(i)
  // i=0°(赤道轨道)：地球自转贡献最大；i=90°(极轨道)：地球自转不参与多普勒
  const orbitInclination = (satParams.orbitInclination !== undefined && satParams.orbitInclination !== '' && satParams.orbitInclination !== null)
    ? parseFloat(satParams.orbitInclination) : 50; // 度，默认 50°

  // ============ NGSO 专属：星间链路(ISL) 参数 ============
  // cIsl: ISL SNR (dB，解调带宽内，用户输入）；计算时内部转换为 C/T (dBW/K)
  // islHops: 星间链路跳数（0 表示无 ISL）
  // islDistance: 每跳星间链路距离，取 1500 km（LEO 典型值；基于 2(R_E+h)sin(π/N) 几何估算，
  //              550 km/22颗/面 ≈ 1960 km，1200 km/18颗/面 ≈ 2630 km，取保守代表值）
  const ISL_HOP_DISTANCE_KM = 2000; // km/跳，代表性 LEO 星间链路单跳距离
  const cIsl = (satParams.cIsl !== undefined && satParams.cIsl !== '' && satParams.cIsl !== null)
    ? parseFloat(satParams.cIsl) : 30;
  const islHopsRaw = (satParams.islHops !== undefined && satParams.islHops !== '' && satParams.islHops !== null)
    ? parseFloat(satParams.islHops) : 0;
  const islHops = (isFinite(islHopsRaw) && islHopsRaw >= 0) ? Math.floor(islHopsRaw) : 0;
  // ISL 计算模式：'manual'（直接给 SNR/C·N₀，默认，兼容旧配置）/ 'rf'（射频链路预算）/ 'optical'（光学链路预算）
  const islMode = (satParams.islMode === 'rf' || satParams.islMode === 'optical') ? satParams.islMode : 'manual';
  // ISL 参数读取助手：取数，缺省回退 def
  const islNum = (key, def) => {
    const v = satParams[key];
    if (v === undefined || v === '' || v === null) return def;
    const n = parseFloat(v);
    return (isFinite(n)) ? n : def;
  };
  // 单跳 ISL 距离（km）：用户可覆盖，否则用代表值
  const islHopDistanceKm = islNum('islHopDistance', ISL_HOP_DISTANCE_KM);
  // —— RF ISL 参数（默认取代表性高增益定向星间终端：Ka/V 频段，~45 dBW EIRP、~12 dB/K G/T）——
  const islRfEirp = islNum('islEirp', 45);        // ISL 发射 EIRP (dBW)
  const islRfGT = islNum('islGT', 12);            // ISL 接收 G/T (dB/K)
  const islRfFreq = islNum('islFreq', 23);        // ISL 频率 (GHz，典型 Ka/V 频段星间)
  const islRfMiscLoss = islNum('islMiscLoss', 1); // ISL 其他损耗 (dB)
  // —— 光学 ISL 参数（接收灵敏度法）——
  const islOptTxPower = islNum('islOptTxPower', 20);      // 发射光功率 (dBm，厂商手册口径；默认 20 dBm = 0.1 W)
  const islOptTxAperture = islNum('islOptTxAperture', 0.08); // 发射望远镜口径 (m)
  const islOptRxAperture = islNum('islOptRxAperture', 0.08); // 接收望远镜口径 (m)
  const islOptWavelengthNm = islNum('islOptWavelength', 1550); // 工作波长 (nm)
  const islOptPointingLoss = islNum('islOptPointingLoss', 3);  // 指向 + 光学损耗 (dB)
  // 接收灵敏度三参数：在参考速率、目标 BER 下的最小接收功率 P_req（单位 dBm，对齐厂商手册），及该点所需 Eb/N₀
  const islOptSensitivity = islNum('islOptSensitivity', -30); // 接收灵敏度 P_req (dBm，厂商手册值，如 -36 dBm)
  const islOptSensRate = islNum('islOptSensRate', 1000);      // 灵敏度参考速率 (Mbps)
  const islOptSensEbN0 = islNum('islOptSensEbN0', 13);        // 灵敏度点所需 Eb/N₀ (dB，由 BER+调制格式查得，用户自查填入)
  const aciUplinkFactor = satParams.aciUplinkFactor !== undefined && satParams.aciUplinkFactor !== '' && satParams.aciUplinkFactor !== null
    ? parseFloat(satParams.aciUplinkFactor) 
    : 30; // dB
  const adjUplinkFactor = satParams.adjUplinkFactor !== undefined && satParams.adjUplinkFactor !== '' && satParams.adjUplinkFactor !== null
    ? parseFloat(satParams.adjUplinkFactor) 
    : 25; // dB
  const adjDownlinkFactor = satParams.adjDownlinkFactor !== undefined && satParams.adjDownlinkFactor !== '' && satParams.adjDownlinkFactor !== null
    ? parseFloat(satParams.adjDownlinkFactor) 
    : 25; // dB
  const xpolUplinkFactor = satParams.xpolUplinkFactor !== undefined && satParams.xpolUplinkFactor !== '' && satParams.xpolUplinkFactor !== null
    ? parseFloat(satParams.xpolUplinkFactor) 
    : 26; // dB
  const xpolDownlinkFactor = satParams.xpolDownlinkFactor !== undefined && satParams.xpolDownlinkFactor !== '' && satParams.xpolDownlinkFactor !== null
    ? parseFloat(satParams.xpolDownlinkFactor) 
    : 26; // dB
  const hpaIntermodFactor = satParams.hpaIntermodFactor !== undefined && satParams.hpaIntermodFactor !== '' && satParams.hpaIntermodFactor !== null
    ? parseFloat(satParams.hpaIntermodFactor) 
    : 24; // dB
  const aciDownlinkFactor = satParams.aciDownlinkFactor !== undefined && satParams.aciDownlinkFactor !== '' && satParams.aciDownlinkFactor !== null
    ? parseFloat(satParams.aciDownlinkFactor) 
    : 30; // dB
  const xpdrIntermodFactor = satParams.xpdrIntermodFactor !== undefined && satParams.xpdrIntermodFactor !== '' && satParams.xpdrIntermodFactor !== null
    ? parseFloat(satParams.xpdrIntermodFactor) 
    : 21; // dB
  
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
    : 6; // 转发器IBO (dB)
  const BOo = satParams.BOo !== undefined && satParams.BOo !== '' && satParams.BOo !== null
    ? parseFloat(satParams.BOo) 
    : 3; // 转发器OBO (dB)
  
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
  const systemAvailability = (uplinkAvailability * rxDownlinkAvailability).toFixed(5);
  
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
  
  // ============ 上行站几何计算（NGSO） ============
  // NGSO 模式下，仰角由用户直接输入（最低仰角），不再基于 orbitPosition 反算
  const earthLatRad = earthLat * CONSTANTS.PI / 180;

  const minElevationInput = (inputs.minElevation !== '' && inputs.minElevation !== null && inputs.minElevation !== undefined)
    ? parseFloat(inputs.minElevation) : NaN;
  const elevation = (!isNaN(minElevationInput) && isFinite(minElevationInput))
    ? minElevationInput
    : 10; // 缺省 10°
  const elevationRad = elevation * CONSTANTS.PI / 180;

  // 验证发信站仰角
  const txElevationValidation = validator.validateElevation(elevation, '发信站');

  // 方位角 / 极化角：NGSO 下卫星位置时变，此处不再依赖 orbitPosition 做 GEO 式反算
  // 保留占位以兼容原结果结构
  const azimuth = 0;
  const uplinkPolarizationAngle = 0;

  // 波束宽度
  const beamWidth = (70 * wavelength) / antennaDiameter;

  // 上行天线增益
  const txAntennaGain = 20 * Math.log10((CONSTANTS.PI * antennaDiameter) / wavelength) +
                        10 * Math.log10(antennaEfficiency);

  // 上行站星地距离（NGSO）
  // 根据用户选择的输入模式：
  //   - distanceMode === 'slantRange'：直接使用输入的斜距
  //   - distanceMode === 'altitude'（默认）：由轨道高度 + 最低仰角精确换算
  const distanceMode = inputs.distanceMode || 'altitude';
  const slantRange = resolveNgsoSlantRange(
    distanceMode,
    inputs.slantRange,
    inputs.orbitAltitude,
    elevation,
    1200
  );

  // 上行自由空间损耗
  const uplinkFSL = 20 * (Math.log10(uplinkFrequency) + Math.log10(slantRange * 1000)) +
                    20 * Math.log10((4 * CONSTANTS.PI) / 0.299792458);

  // ============ 接收站几何计算（NGSO） ============
  const rxMinElevationInput = (inputs.rxMinElevation !== '' && inputs.rxMinElevation !== null && inputs.rxMinElevation !== undefined)
    ? parseFloat(inputs.rxMinElevation) : NaN;
  const rxElevation = (!isNaN(rxMinElevationInput) && isFinite(rxMinElevationInput))
    ? rxMinElevationInput
    : 10;
  const rxElevationRad = rxElevation * CONSTANTS.PI / 180;

  // 验证收信站仰角
  const rxElevationValidation = validator.validateElevation(rxElevation, '收信站');

  // 方位角 / 极化角：NGSO 下不做 GEO 式反算
  const rxAzimuth = 0;
  const downlinkPolarizationAngle = 0;

  // 接收站星地距离（NGSO）
  const rxDistanceMode = inputs.rxDistanceMode || 'altitude';
  const rxSlantRange = resolveNgsoSlantRange(
    rxDistanceMode,
    inputs.rxSlantRange,
    inputs.rxOrbitAltitude,
    rxElevation,
    1200
  );

  // 下行自由空间损耗
  const downlinkFSL = 20 * (Math.log10(downlinkFrequency) + Math.log10(rxSlantRange * 1000)) +
                      20 * Math.log10((4 * CONSTANTS.PI) / 0.299792458);

  // 接收天线增益
  const rxAntennaGain = 20 * Math.log10((CONSTANTS.PI * rxAntennaDiameter) / rxWavelength) + 
                        10 * Math.log10(rxAntennaEfficiency);
  
  // 接收天线半功率波束宽度
  const theta3 = 70 * rxWavelength / rxAntennaDiameter;
  
  // ============ 大气衰减计算 (ITU-R P.676-13) ============
  // 三个气象参数均按地理位置修正：
  //   Ps  — P.835-6 标准大气公式，按站址海拔 h(km) 修正：Ps = 1013.25×(1−6.5h/288.15)^5.2561
  //   Ts  — P.835-6 纬度分区参考大气，叠加 6.5 K/km 海拔递减率
  //   ρ_ws— P.836-6 全球地图，晴天取 RHO_50（年中位数），雨天取 RHO_1
  const uplinkPs    = 1013.25 * Math.pow(Math.max(0.01, 1 - 6.5 * altitude / 288.15), 5.2561);
  const uplinkTs    = Math.max(200, (Math.abs(earthLat) < 22 ? 300.4 : Math.abs(earthLat) < 45 ? 283.1 : 272.4) - 6.5 * altitude);
  const uplinkRhoWs = getRhoWs(earthLat, earthLon, uplinkAvailability < 100);

  const downlinkPs    = 1013.25 * Math.pow(Math.max(0.01, 1 - 6.5 * rxAltitude / 288.15), 5.2561);
  const downlinkTs    = Math.max(200, (Math.abs(rxLatitude) < 22 ? 300.4 : Math.abs(rxLatitude) < 45 ? 283.1 : 272.4) - 6.5 * rxAltitude);
  const downlinkRhoWs = getRhoWs(rxLatitude, rxLongitude, rxdownlinkAvailability < 100);

  const uplinkAtmosphericAttenuation   = calculateAtmosphericAttenuation(uplinkFrequency,   elevation,  uplinkPs,   uplinkTs,   uplinkRhoWs);
  const downlinkAtmosphericAttenuation = calculateAtmosphericAttenuation(downlinkFrequency, rxElevation, downlinkPs, downlinkTs, downlinkRhoWs);
  
  // ============ 降雨衰减计算 ============
  // 上行降雨衰减
  const uplinkUnavailability = uplinkAvailability / 100;
  // 雨衰直接传入具体频率（P.838 系数由 interpolateP838 插值），不再四舍五入到整数频点
  const { A001, hR: uplinkRainHeight } = calculateSinglePathRainAttenuation(
    rainRate, uplinkFrequency, uplinkPolarization, earthLat, earthLon, orbitPosition, altitude, elevation
  );
  
  // ITU-R P.618-14 公式(8) 换算到目标可用度（p=0 即可用度100% 返回0，即晴天）
  const uplinkRainAttenuation = scaleRainAttenP618_14(
    A001, (1 - uplinkUnavailability) * 100, earthLat, elevation
  );
  
  // 下行降雨衰减
  const { A001: downlinkA001, hR: downlinkRainHeight } = calculateSinglePathRainAttenuation(
    rxRainRate, downlinkFrequency, downlinkPolarization, 
    rxLatitude, rxLongitude, orbitPosition, rxAltitude, rxElevation
  );
  
  const downlinkRainAttenuation = scaleRainAttenP618_14(
    downlinkA001, (1 - rxDownlinkAvailability) * 100, rxLatitude, rxElevation
  );
  
  // ============ 降雨去极化 XPD 计算 (ITU-R P.618-14 §4.1) ============
  // 倾斜角 τ：线极化电场矢量相对当地水平的倾角。考虑极化偏转角，
  //   水平极化 H → τ = 极化偏转角；垂直极化 V → τ = 极化偏转角 + 90°；圆极化 C → τ = 45°
  const uplinkXpdTau = uplinkPolarization === 'C'
    ? 45
    : (uplinkPolarization === 'V' ? uplinkPolarizationAngle + 90 : uplinkPolarizationAngle);
  const downlinkXpdTau = downlinkPolarization === 'C'
    ? 45
    : (downlinkPolarization === 'V' ? downlinkPolarizationAngle + 90 : downlinkPolarizationAngle);

  // 雨致 XPD（与同极化降雨衰减取同一时间百分比 p = 100 - 可用度）
  const uplinkRainXPD = calculateRainXPD_P618_14(
    uplinkRainAttenuation, uplinkFrequency, uplinkXpdTau, elevation, (1 - uplinkUnavailability) * 100
  );
  const downlinkRainXPD = calculateRainXPD_P618_14(
    downlinkRainAttenuation, downlinkFrequency, downlinkXpdTau, rxElevation, (1 - rxDownlinkAvailability) * 100
  );
  
  // ============ 云衰减计算 (ITU-R P.840-9) ============
  // 第三参数为超越概率 p（=100-可用度）；p≤5% 时 L 封顶在 5% 值，p=0(可用度100%)按晴天返回0
  const uplinkCloudAttenuation = calculateCloudAttenuation(uplinkFrequency, elevation, 100 - uplinkAvailability, earthLat, earthLon);
  const downlinkCloudAttenuation = calculateCloudAttenuation(downlinkFrequency, rxElevation, 100 - rxdownlinkAvailability, rxLatitude, rxLongitude);

  // ============ 闪烁衰减计算 (ITU-R P.618-14 §2.4.1) ============
  const uplinkScintillation = calculateScintillationFading(uplinkFrequency, elevation, antennaDiameter, uplinkAvailability, antennaEfficiency);
  const downlinkScintillation = calculateScintillationFading(downlinkFrequency, rxElevation, rxAntennaDiameter, rxdownlinkAvailability, rxAntennaEfficiency);

  // ============ 总衰减合并 (ITU-R P.618-14 §2.5 公式65/66/67/68) ============
  // p = 超越概率（不可用概率），%
  // 公式 65/66 在 p=5% 分界（p>5% 丢弃雨衰项）；
  // 云衰 AC(p) 取旧版口径：p<1% 封顶在 1% 值（见 calculateCloudAttenuation 内 pEff）
  const uplinkP = 100 - uplinkAvailability;       // 上行超越概率 (%)
  const downlinkP = 100 - rxdownlinkAvailability; // 下行超越概率 (%)

  // 上行总衰减 AT(p)：公式(65) p≤5%；公式(66) p>5%
  let uplinkTotalAttenuation;
  if (uplinkP <= 5) {
    // AT = AG_eff + sqrt((AR + AC_eff)^2 + AS^2)
    uplinkTotalAttenuation = uplinkAtmosphericAttenuation +
      Math.sqrt(Math.pow(uplinkRainAttenuation + uplinkCloudAttenuation, 2) + Math.pow(uplinkScintillation, 2));
  } else {
    // AT = AG_eff + sqrt(AC_eff^2 + AS^2)
    uplinkTotalAttenuation = uplinkAtmosphericAttenuation +
      Math.sqrt(Math.pow(uplinkCloudAttenuation, 2) + Math.pow(uplinkScintillation, 2));
  }

  // 下行总衰减 AT(p)：公式(65) p≤5%；公式(66) p>5%
  let downlinkTotalAttenuation;
  if (downlinkP <= 5) {
    // AT = AG_eff + sqrt((AR + AC_eff)^2 + AS^2)
    downlinkTotalAttenuation = downlinkAtmosphericAttenuation +
      Math.sqrt(Math.pow(downlinkRainAttenuation + downlinkCloudAttenuation, 2) + Math.pow(downlinkScintillation, 2));
  } else {
    // AT = AG_eff + sqrt(AC_eff^2 + AS^2)
    downlinkTotalAttenuation = downlinkAtmosphericAttenuation +
      Math.sqrt(Math.pow(downlinkCloudAttenuation, 2) + Math.pow(downlinkScintillation, 2));
  }

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

  // ============ ISL 单跳 C/T (dBW/K) ============
  // 三种模式：
  //  manual：用户直接给 SNR/C·N₀（解调带宽内）→ C/T = SNR + 10·lgB + k（B 取转发器带宽，与旧版兼容）
  //  rf    ：射频链路预算 C/T = EIRP − FSL(d,f) + G/T − 其他损耗
  //  optical：光学链路预算 C/N₀ = P_tx + G_tx − FSL_opt − 指向损耗 + G_rx − N₀；C/T = C/N₀ + k
  let cIsl_CT;
  // 按链路类型捕获中间量，供瀑布表「ISL 性能评估」段按 islMode 分链路展示（逐行可算通）
  const islBudgetDetail = {};
  if (islMode === 'rf') {
    // FSL：与上下行同式（d 取单跳 ISL 距离，单位 m；f 单位 GHz）
    const islFsl = 20 * (Math.log10(islRfFreq) + Math.log10(islHopDistanceKm * 1000)) +
                   20 * Math.log10((4 * CONSTANTS.PI) / 0.299792458);
    cIsl_CT = islRfEirp - islFsl + islRfGT - islRfMiscLoss;
    islBudgetDetail.rf = {
      eirp: islRfEirp, freq: islRfFreq, dist: islHopDistanceKm,
      fsl: islFsl, gt: islRfGT, miscLoss: islRfMiscLoss
    };
  } else if (islMode === 'optical') {
    // 几何（严格）：望远镜增益 G = 20·log10(π·D/λ)（衍射极限孔径增益）；FSL = 20·log10(4π·d/λ)
    const lambdaM = islOptWavelengthNm * 1e-9;        // 波长 (m)
    const dM = islHopDistanceKm * 1000;               // 单跳距离 (m)
    const gTxOpt = 20 * Math.log10(CONSTANTS.PI * islOptTxAperture / lambdaM);
    const gRxOpt = 20 * Math.log10(CONSTANTS.PI * islOptRxAperture / lambdaM);
    const fslOpt = 20 * Math.log10(4 * CONSTANTS.PI * dM / lambdaM);
    // 接收光功率（截断/波前等真实劣化并入「指向+光学损耗」）
    // 发射光功率以 dBm 输入（厂商手册口径），此处 −30 换算到 dBW 再参与计算
    const pRxOpt = (islOptTxPower - 30) + gTxOpt - fslOpt - islOptPointingLoss + gRxOpt; // dBW
    // 接收灵敏度法：由灵敏度反推接收机等效噪声谱密度 N₀ = P_req − 10·lg(R_ref) − (Eb/N₀)_req
    // 灵敏度以 dBm 输入（厂商手册口径），此处 −30 换算到 dBW 再参与计算
    const n0Opt = (islOptSensitivity - 30) - 10 * Math.log10(islOptSensRate * 1e6) - islOptSensEbN0; // dBW/Hz
    const cn0Opt = pRxOpt - n0Opt;                    // C/N₀ (dBHz)
    cIsl_CT = cn0Opt + CONSTANTS.BOLTZMANN;           // C/T = C/N₀ + k
    // 展示统一用 dBm 口径（与发射功率/灵敏度输入一致，逐行算得通）：pRx、N₀ 各 +30 转 dBm
    islBudgetDetail.opt = {
      txPowerDbm: islOptTxPower, txAperture: islOptTxAperture, rxAperture: islOptRxAperture,
      wavelengthNm: islOptWavelengthNm, dist: islHopDistanceKm,
      gTx: gTxOpt, fsl: fslOpt, pointLoss: islOptPointingLoss, gRx: gRxOpt,
      pRxDbm: pRxOpt + 30, n0Dbm: n0Opt + 30, cn0: cn0Opt,
      sensDbm: islOptSensitivity, sensRate: islOptSensRate, sensEbN0: islOptSensEbN0
    };
  } else {
    // manual（默认，兼容旧配置）：SNR → C/T = SNR + 10·lgB + k
    cIsl_CT = cIsl + 10 * Math.log10(transponderBandwidth * 1e6) + CONSTANTS.BOLTZMANN;
    islBudgetDetail.manual = {
      inputSnr: cIsl, refBandwidthMHz: transponderBandwidth
    };
  }
  
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
  
  // ============ 其他损耗（用户输入，上下行分别设置）============
  const uplinkMiscLoss = inputs.uplinkOtherLoss !== undefined && inputs.uplinkOtherLoss !== '' && inputs.uplinkOtherLoss !== null
    ? parseFloat(inputs.uplinkOtherLoss)
    : 0.3; // 上行其他损耗 (dB) 默认值0.3dB
  const downlinkMiscLoss = inputs.downlinkOtherLoss !== undefined && inputs.downlinkOtherLoss !== '' && inputs.downlinkOtherLoss !== null
    ? parseFloat(inputs.downlinkOtherLoss)
    : 0.3; // 下行其他损耗 (dB) 默认值0.3dB
  
  // 各项C/T值计算
  const uplinkCT = SFDs - antennaGain - BOi + G_Ts;
  const aciUplinkCT = 10 * Math.log10(transponderBandwidth * 1e6) + 
                      CONSTANTS.BOLTZMANN + aciUplinkFactor;
  const adjUplinkCT = 10 * Math.log10(transponderBandwidth * 1e6) + 
                      CONSTANTS.BOLTZMANN + adjUplinkFactor;
  // 交叉极化隔离度：晴空设备 XPI 与降雨去极化 XPD（ITU-R P.618-14 §4.1）功率合成
  const effectiveXpolUplinkFactor = -10 * Math.log10(
    Math.pow(10, -xpolUplinkFactor / 10) + Math.pow(10, -uplinkRainXPD / 10)
  );
  const xpolUplinkCT = 10 * Math.log10(transponderBandwidth * 1e6) + 
                       CONSTANTS.BOLTZMANN + effectiveXpolUplinkFactor;
  const hpaIntermodCT = 10 * Math.log10(transponderBandwidth * 1e6) + 
                        CONSTANTS.BOLTZMANN + hpaIntermodFactor;
  const downlinkCT = EIRPs - BOo - downlinkFSL - downlinkCloudAttenuation - 
                     downlinkAtmosphericAttenuation + gOverTe - downlinkMiscLoss;
  const aciDownlinkCT = 10 * Math.log10(transponderBandwidth * 1e6) + 
                        CONSTANTS.BOLTZMANN + aciDownlinkFactor;
  const adjDownlinkCT = 10 * Math.log10(transponderBandwidth * 1e6) + 
                        CONSTANTS.BOLTZMANN + adjDownlinkFactor;
  // 交叉极化隔离度：晴空设备 XPI 与降雨去极化 XPD（ITU-R P.618-14 §4.1）功率合成
  const effectiveXpolDownlinkFactor = -10 * Math.log10(
    Math.pow(10, -xpolDownlinkFactor / 10) + Math.pow(10, -downlinkRainXPD / 10)
  );
  const xpolDownlinkCT = 10 * Math.log10(transponderBandwidth * 1e6) + 
                         CONSTANTS.BOLTZMANN + effectiveXpolDownlinkFactor;
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
  
  // 最后合并上下行得到总C/T
  // NGSO 专属：在此处引入星间链路 (ISL) 贡献
  //   用户输入单跳 C/N，已在上方转换为 C/T（cIsl_CT），多跳按线性倒数累加
  //   islHops = 0 时不引入任何项（保持兼容 GEO 行为）
  const invTotalCT = Math.pow(10, -uplinkTotalCT / 10)
                   + Math.pow(10, -downlinkTotalCT / 10)
                   + (islHops > 0 ? islHops * Math.pow(10, -cIsl_CT / 10) : 0);
  const totalCTLinear = 1 / invTotalCT;
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
  // 载波上行C/T（目标分配，仅用于详情的载波上行C/T·C/N₀展示）
  const actualUplinkCT = uplinkTotalCT - totalCT + carrierTotalCT;
  

  
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
    Math.pow(10, -aciUplinkCT / 10) +
    Math.pow(10, -adjUplinkCT / 10) +
    Math.pow(10, -xpolUplinkCT / 10) +
    Math.pow(10, -hpaIntermodCT / 10)
  );
  const rainUplinkTotalCT = 10 * Math.log10(rainUplinkTotalCTLinear);
  
  // 再计算下行总C/T（考虑下行降雨衰减和G/T恶化，含Xpdr互调）
  const rainDownlinkTotalCTLinear = 1 / (
    Math.pow(10, -(downlinkCT - downlinkRainAttenuation - gOverTdegradation) / 10) +
    Math.pow(10, -aciDownlinkCT / 10) +
    Math.pow(10, -adjDownlinkCT / 10) +
    Math.pow(10, -xpolDownlinkCT / 10) +
    Math.pow(10, -xpdrIntermodCT / 10)
  );
  const rainDownlinkTotalCT = 10 * Math.log10(rainDownlinkTotalCTLinear);
  
  // 合并上下行得到下行雨卫星总C/T（含ISL，与晴天 totalCT 保持一致）
  const totalInterferenceLinear = 1 / (
    Math.pow(10, -rainUplinkTotalCT / 10) +
    Math.pow(10, -rainDownlinkTotalCT / 10) +
    (islHops > 0 ? islHops * Math.pow(10, -cIsl_CT / 10) : 0)
  );
  
  // 下行雨卫星总C/T
  const downlinkComponent = 10 * Math.log10(totalInterferenceLinear);
  const downlinkPowerRatio = Math.pow(10, (EIRPs - BOo - downlinkComponent + 
                                           carrierTotalCT - EIRPs + BOo) / 10) * 100;
  
  // 转发器容量 - 下行降雨
  const RXtransponderCapacity = downlinkComponent - carrierTotalCT;
    // 载波下行C/T（目标分配，仅用于详情的载波下行C/T·C/N₀展示）
  const actualDownlinkCT = downlinkTotalCT - totalCT + carrierTotalCT;
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
    Math.pow(10, -aciUplinkCT / 10) +
    Math.pow(10, -adjUplinkCT / 10) +
    Math.pow(10, -xpolUplinkCT / 10) +
    Math.pow(10, -hpaIntermodCT / 10) +
    Math.pow(10, -downlinkCT / 10) +
    Math.pow(10, -aciDownlinkCT / 10) +
    Math.pow(10, -adjDownlinkCT / 10) +
    Math.pow(10, -xpolDownlinkCT / 10) +
    Math.pow(10, -xpdrIntermodCT / 10);
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

  // 转发器输出EIRP（每载波）：卫星饱和EIRP - 输出回退 - 转发器工作区回退
  const transponderOutputEIRP = EIRPs - BOo - actualTransponderCapacity;

  // ============ 上/下行 C/N 评估（按主导降雨场景分别计算）============
  // 与链路瀑布功率链一致：先沿功率链得到“热噪声 C/N”，再与干扰 C/I 噪声并联合成实际 C/N，
  // 干扰损失 = 热噪声 C/N − 实际 C/N（反算）。
  // 主导场景：上行降雨占主导时，下行按晴空（下行雨衰与 G/T 劣化不参与）；
  //          下行降雨占主导时，下行计入雨衰与 G/T 劣化，上行雨衰按实际值参与。
  const uplinkRainDominant = uplinkPowerRatio > downlinkPowerRatio;

  // 上行：到达卫星载波电平 → 热噪声 C/N（始终含上行雨衰）
  const cLevelAtSatellite = stationEIRP - uplinkFSL - uplinkAtmosphericAttenuation -
                            uplinkRainAttenuation - uplinkCloudAttenuation - uplinkMiscLoss;
  // 实际到达卫星通量密度：到达卫星载波电平 + 卫星单位面积增益（与级联自洽，含实际上行雨衰）
  const arrivalPFDAtSatellite = cLevelAtSatellite + antennaGain;
  const uplinkThermalCN = cLevelAtSatellite + G_Ts - CONSTANTS.BOLTZMANN - RXnoiseBW;
  // 上行干扰损失（dB）：纯干扰造成的 C/N 退化 = 仅热噪声上行 C/T − 含干扰上行总 C/T
  // EIRP、雨衰、带宽、k 等热噪声项在差值中抵消，结果只反映 ACI/ASI/XPI/IM 干扰，与降雨解耦
  const uplinkInterferenceLoss = uplinkCT - uplinkTotalCT;
  // 上行 C/N = 热噪声 C/N − 干扰损失
  const uplinkCN = uplinkThermalCN - uplinkInterferenceLoss;
  // 上行干扰等效 C/I（仅展示，由热噪声与实际 C/N 反推）
  const uplinkInterferenceCN = -10 * Math.log10(
    Math.max(Math.pow(10, -uplinkCN / 10) - Math.pow(10, -uplinkThermalCN / 10), 1e-30)
  );

  // 下行：到达地面载波电平 → 热噪声 C/N（仅下行降雨占主导时计入下行雨衰与 G/T 劣化）
  const downlinkRainEff = uplinkRainDominant ? 0 : downlinkRainAttenuation;
  const downlinkGtDegEff = uplinkRainDominant ? 0 : gOverTdegradation;
  const cLevelAtGround = transponderOutputEIRP - downlinkFSL - downlinkAtmosphericAttenuation -
                         downlinkRainEff - downlinkCloudAttenuation - downlinkMiscLoss;
  // 实际到达地面通量密度：到达地面载波电平 + 下行单位面积增益（与级联自洽，含实际下行雨衰/其他损耗）
  const rxAntennaUnitAreaGain = 10 * Math.log10(4 * CONSTANTS.PI / (rxWavelength ** 2));
  const arrivalPFDAtGround = cLevelAtGround + rxAntennaUnitAreaGain;
  const downlinkThermalCN = cLevelAtGround + gOverTe - downlinkGtDegEff - CONSTANTS.BOLTZMANN - RXnoiseBW;
  // ISL（星间链路）折算到载波噪声带宽的等效 C/N（原始：ISL 链路自身性能，供 ISL 性能段展示）
  // 单跳 C/N = 单跳 C/T − k − 10·lgB（B 为载波噪声带宽 RXnoiseBW）；多跳噪声并联（线性倒数相加）
  const islPerHopCN = islHops > 0 ? (cIsl_CT - CONSTANTS.BOLTZMANN - RXnoiseBW) : null;
  const islCNlinearSum = islHops > 0 ? islHops * Math.pow(10, -islPerHopCN / 10) : 0;
  // ISL 总等效 C/N（islHops 跳并联后）
  const islTotalCN = islHops > 0 ? -10 * Math.log10(islCNlinearSum) : null;
  // ── ISL 并入「上行侧」（口径统一到 totalCT）──
  // ISL 已计入工作区饱和总 C/T（invTotalCT 含 ISL 项）。为使瀑布里 ISL 的影响 ＝ 它在 totalCT 的影响，
  // 不直接用 ISL 自身工作点 C/N（islTotalCN，会过度惩罚、致下行反解为负→300、合成>上行），
  // 而是取 ISL 在饱和总 C/T 中的噪声份额 f_isl = (islHops·10^(-cIsl_CT/10)) / invTotalCT，
  // 折算到工作点：ISL 等效 C/N = carrierTotalCN − 10·lg(f_isl)，即级联噪声份额 = f_isl·10^(-carrierTotalCN/10)。
  // 这样 ISL 对合计的代价与它对 totalCT 的代价一致（小），上行(含ISL) 恒 > 合计，反解下行恒为正。
  const islFraction = islHops > 0 ? (islHops * Math.pow(10, -cIsl_CT / 10)) / invTotalCT : 0;
  const islCascadeLin = islFraction * Math.pow(10, -carrierTotalCN / 10);
  const uplinkWithIslCN = -10 * Math.log10(Math.pow(10, -uplinkCN / 10) + islCascadeLin);
  // 下行 C/N 反算：有效上行(含 ISL) ⊕ 下行 = 合计，故由合计扣除有效上行反算下行
  // islHops=0 时 islCascadeLin=0、uplinkWithIslCN=uplinkCN，退化为原逻辑，保持兼容
  const downlinkCN = -10 * Math.log10(
    Math.max(Math.pow(10, -carrierTotalCN / 10) - Math.pow(10, -uplinkWithIslCN / 10), 1e-30)
  );
  // ISL 对上行侧的代价（dB，≥0）：上行(纯) − 上行(含 ISL)，与 totalCT 口径一致
  const islImpact = islHops > 0 ? (uplinkCN - uplinkWithIslCN) : null;
  // 下行干扰等效 C/I（仅展示，由热噪声与反算 C/N 反推）
  const downlinkInterferenceCN = -10 * Math.log10(
    Math.max(Math.pow(10, -downlinkCN / 10) - Math.pow(10, -downlinkThermalCN / 10), 1e-30)
  );

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
  const satellitePSD = transponderOutputEIRP - 10 * Math.log10(allocBandwidth * 1000);
  
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
  results.earthAntennaEfficiencyResult = (antennaEfficiency * 100).toFixed(0); // 回显实际参与计算的效率(对齐下行 rxAntennaEfficiencyResult)
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
  results.uplinkRainHeightResult = uplinkRainHeight.toFixed(3);
  // 上行降雨去极化 XPD (ITU-R P.618-14 §4.1)，无降雨时显示'-'
  results.uplinkRainXPDResult = isFinite(uplinkRainXPD) ? uplinkRainXPD.toFixed(2) : '-';
  results.effectiveXpolUplinkFactorResult = effectiveXpolUplinkFactor.toFixed(2);
  results.uplinkCloudAttenuation = uplinkCloudAttenuation.toFixed(2);
  results.uplinkAtmosphericAttenuationResult = uplinkAtmosphericAttenuation.toFixed(2);
  results.uplinkScintillationResult = uplinkScintillation.toFixed(2); // 上行闪烁衰减 AS(p) (dB)
  results.uplinkTotalAttenuationResult = uplinkTotalAttenuation.toFixed(2); // 上行总衰减 AT(p) ITU-R P.618-14 §2.5
  results.uplinkCN = uplinkCN.toFixed(2);
  // 有效上行 C/N（已并入 ISL；无 ISL 时等于上行 C/N）。NGSO 瀑布「合成」行用它与下行合成，使 上行(含ISL)⊕下行=合计
  results.uplinkWithIslCN = uplinkWithIslCN.toFixed(2);
  results.uplinkThermalCN = uplinkThermalCN.toFixed(2); // 上行热噪声 C/N
  results.uplinkInterferenceCN = uplinkInterferenceCN.toFixed(2); // 上行干扰 C/I（表达为 C/N）
  results.uplinkRainDominant = uplinkRainDominant; // 上行降雨是否占主导
  results.actualUplinkCT = actualUplinkCT.toFixed(2); // 载波上行C/T
  results.actualUplinkCN0 = (actualUplinkCT + 228.6).toFixed(2); // 载波上行C/N₀
  
  // 精细化损耗参数
  results.pointingErrorResult = pointingError.toFixed(3); // 指向误差(度)
  results.polarizationLossResult = polarizationLoss.toFixed(2); // 极化失配损耗(dB)
  results.radomeLossResult = radomeLoss.toFixed(2); // 天线罩损耗(dB)
  results.connectorLossResult = connectorLoss.toFixed(2); // 接头损耗(dB)
  results.uplinkMiscLossResult = uplinkMiscLoss.toFixed(3); // 上行链路其他损耗(dB) = 其他损耗
  results.downlinkMiscLossResult = downlinkMiscLoss.toFixed(3); // 下行链路其他损耗(dB) = 其他损耗
  
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
  results.downlinkRainHeightResult = downlinkRainHeight.toFixed(3);
  // 下行降雨去极化 XPD (ITU-R P.618-14 §4.1)，无降雨时显示'-'
  results.downlinkRainXPDResult = isFinite(downlinkRainXPD) ? downlinkRainXPD.toFixed(2) : '-';
  results.effectiveXpolDownlinkFactorResult = effectiveXpolDownlinkFactor.toFixed(2);
  results.downlinkCloudAttenuation = downlinkCloudAttenuation.toFixed(2);
  results.downlinkAtmosphericAttenuationResult = downlinkAtmosphericAttenuation.toFixed(2);
  results.downlinkScintillationResult = downlinkScintillation.toFixed(2); // 下行闪烁衰减 AS(p) (dB)
  results.downlinkTotalAttenuationResult = downlinkTotalAttenuation.toFixed(2); // 下行总衰减 AT(p) ITU-R P.618-14 §2.5
  results.downlinkCN = downlinkCN.toFixed(2);
  results.downlinkThermalCN = downlinkThermalCN.toFixed(2); // 下行热噪声 C/N
  results.downlinkInterferenceCN = downlinkInterferenceCN.toFixed(2); // 下行干扰 C/I（表达为 C/N）
  // ============ ISL（星间链路）结果（仅 islHops > 0 时输出，供 NGSO 瀑布表 ISL 段使用）============
  results.islHopsResult = islHops;
  if (islHops > 0) {
    results.islPerHopCTResult = cIsl_CT.toFixed(2);                 // 单跳 ISL C/T (dBW/K)
    results.islPerHopCNResult = islPerHopCN.toFixed(2);             // 单跳 ISL 折算到载波噪声带宽的 C/N (dB)
    results.islTotalCTResult = (cIsl_CT - 10 * Math.log10(islHops)).toFixed(2); // 多跳并联后等效 C/T (dBW/K)
    results.islTotalCNResult = islTotalCN.toFixed(2);               // 多跳并联后等效 C/N (dB，ISL 链路自身)
    results.islImpactResult = islImpact.toFixed(2);                 // ISL 对合计 C/N 的代价 (dB)
    // 级联折算 C/N（口径同 totalCT）：使 上行C/N ⊕ 该值 = 上行C/N(含ISL)，瀑布逐行算得通
    results.islCascadeCNResult = (-10 * Math.log10(islCascadeLin)).toFixed(2);
    // ISL 计算模式 + 各模式链路预算中间量（供瀑布「ISL 性能评估」段按链路类型分别展示）
    results.islModeResult = islMode; // 'manual' | 'rf' | 'optical'
    if (islMode === 'rf' && islBudgetDetail.rf) {
      const b = islBudgetDetail.rf;
      results.islRfEirpResult = b.eirp.toFixed(2);        // ISL EIRP (dBW)
      results.islRfFreqResult = b.freq.toFixed(2);        // ISL 频率 (GHz)
      results.islRfDistResult = b.dist.toFixed(0);        // 单跳距离 (km)
      results.islRfFslResult = b.fsl.toFixed(2);          // ISL 自由空间损耗 (dB)
      results.islRfGtResult = b.gt.toFixed(2);            // ISL G/T (dB/K)
      results.islRfMiscLossResult = b.miscLoss.toFixed(2); // 其他损耗 (dB)
    } else if (islMode === 'optical' && islBudgetDetail.opt) {
      const b = islBudgetDetail.opt;
      results.islOptTxPowerResult = b.txPowerDbm.toFixed(2);   // 发射光功率 (dBm)
      results.islOptTxApertureResult = b.txAperture.toFixed(3); // 发射口径 (m)
      results.islOptRxApertureResult = b.rxAperture.toFixed(3); // 接收口径 (m)
      results.islOptWavelengthResult = b.wavelengthNm.toFixed(0); // 波长 (nm)
      results.islOptDistResult = b.dist.toFixed(0);            // 单跳距离 (km)
      results.islOptGTxResult = b.gTx.toFixed(2);              // 发射望远镜增益 (dBi)
      results.islOptFslResult = b.fsl.toFixed(2);              // 光学自由空间损耗 (dB)
      results.islOptPointLossResult = b.pointLoss.toFixed(2);  // 指向+光学损耗 (dB)
      results.islOptGRxResult = b.gRx.toFixed(2);              // 接收望远镜增益 (dBi)
      results.islOptPRxResult = b.pRxDbm.toFixed(2);           // 接收光功率 (dBm)
      results.islOptN0Result = b.n0Dbm.toFixed(2);             // 等效噪声谱密度 N₀ (dBm/Hz)
      results.islOptCN0Result = b.cn0.toFixed(2);              // 单跳 C/N₀ (dBHz)
      results.islOptSensResult = b.sensDbm.toFixed(2);         // 接收灵敏度 (dBm)
      results.islOptSensRateResult = b.sensRate.toFixed(0);    // 灵敏度参考速率 (Mbps)
      results.islOptSensEbN0Result = b.sensEbN0.toFixed(2);    // 灵敏度点 Eb/N₀ (dB)
    } else if (islMode === 'manual' && islBudgetDetail.manual) {
      const b = islBudgetDetail.manual;
      results.islManualSnrResult = b.inputSnr.toFixed(2);          // 输入 SNR (dB)
      results.islManualRefBwResult = b.refBandwidthMHz.toFixed(2); // 参考带宽 (MHz)
    }
  }
  results.actualDownlinkCT = actualDownlinkCT.toFixed(2); // 载波下行C/T
  results.actualDownlinkCN0 = (actualDownlinkCT + 228.6).toFixed(2); // 载波下行C/N₀
  results.satellitePFD = satellitePFD.toFixed(2);
  results.arrivalPFDAtGroundResult = arrivalPFDAtGround.toFixed(2); // 实际到达地面通量密度（到达地面载波电平+下行单位面积增益）
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
  results.satelliteGTResult = G_Ts.toFixed(2); // 卫星接收 G/T (dB/K)，上行 C/T 转换用
  results.BOiResult = BOi;
  results.BOoResult = BOo;
  results.antennaGainResult = antennaGain.toFixed(2);
  results.transponderBandwidthResult = transponderBandwidth;
  // 链路时延（NGSO单程端到端传播时延，含ISL跳数）
  // τ = (d_up + d_ISL + d_down) / c
  // d_up/d_down: 上/下行星地斜距(km)；d_ISL = islHops × islDistance (km)；c = 299792.458 km/s
  const islTotalDistance = islHops * ISL_HOP_DISTANCE_KM; // ISL段总距离 (km)
  const linkDelay = (slantRange + islTotalDistance + rxSlantRange) / 299792.458 * 1000; // ms
  results.linkDelayResult = linkDelay.toFixed(1);
  // 上/下行单程传播时延（分列展示，上下行星地斜距不同 → 时延可不同）
  results.linkDelayUpResult = (slantRange / 299792.458 * 1000).toFixed(1);     // ms，上行段传播时延
  results.linkDelayDownResult = (rxSlantRange / 299792.458 * 1000).toFixed(1); // ms，下行段传播时延
  // 最大多普勒频移（NGSO专属，上下行独立计算）
  // 公式：f_d_max = f_c/c · |v_sat − ω_E·r·cos(i)| · Re·cos(ε_min) / r
  //   v_sat = sqrt(μ/r)：惯性系轨道速度
  //   ω_E·r·cos(i)：星下点随地球自转的共转线速度在轨道平面内的有效分量
  //     （i=0° 顺行赤道轨道时为 ω_E·r；i=90° 极轨时为 0）。务必用轨道半径 r，非地球半径 Re。
  //   Re·cos(ε_min)/r：最低仰角处的几何投影系数（由正弦定理 sinγ=Re·cosε/r 推导）
  // 同步轨道校验：i=0、h=35786km 时 v_sat=√(μ/r)=ω_E·r（地球同步定义）→ 相对速度=0 → 多普勒=0。
  // 倾角修正说明：对于倾角 i 的圆形轨道，地球自转对相对切向速度的贡献乘以 cos(i)；
  //   非赤道倾斜轨道 (i≠0) 抵消量更小，实际多普勒比同高度赤道轨道更大。
  // 参考：Maral & Bousquet "Satellite Communications Systems" 5th Ed §5.1；ITU-R S.1711
  const MU_EARTH = 3.986004418e5; // km³/s²（WGS-84）
  const RE_KM = 6378.137;         // km（WGS-84）
  const C_KM_S = 299792.458;      // km/s
  const OMEGA_E = 7.2921150e-5;   // rad/s（WGS-84）
  const inclRad = orbitInclination * Math.PI / 180; // 轨道倾角（弧度）

  // ── 上行链路 ──
  const h_tx = altitudeFromSlantRange(slantRange, elevation);
  const r_tx = RE_KM + h_tx;
  const v_sat_tx = Math.sqrt(MU_EARTH / r_tx);
  // 相对地面运动速度 = |v_sat − ω_E·r·cos(i)|：卫星相对随地球自转参考系的切向速度。
  //   注意此处必须用轨道半径 r（星下点共转线速度 ω_E·r），而非地球半径 RE。
  //   地球同步轨道(i=0, r=r_GEO)时 v_sat=ω_E·r → 相对速度=0 → 多普勒=0。
  const v_ground_tx = Math.abs(v_sat_tx - OMEGA_E * r_tx * Math.cos(inclRad));
  const v_radial_tx = v_ground_tx * RE_KM * Math.cos(elevation * Math.PI / 180) / r_tx;
  const maxDopplerUplink = v_radial_tx / C_KM_S * uplinkFrequency * 1e6;   // kHz

  // ── 下行链路 ──
  const h_rx = altitudeFromSlantRange(rxSlantRange, rxElevation);
  const r_rx = RE_KM + h_rx;
  const v_sat_rx = Math.sqrt(MU_EARTH / r_rx);
  const v_ground_rx = Math.abs(v_sat_rx - OMEGA_E * r_rx * Math.cos(inclRad));
  const v_radial_rx = v_ground_rx * RE_KM * Math.cos(rxElevation * Math.PI / 180) / r_rx;
  const maxDopplerDownlink = v_radial_rx / C_KM_S * downlinkFrequency * 1e6; // kHz

  results.orbitAltitudeResult = h_rx.toFixed(1);      // km，下行链路轨道高度
  results.orbitVelocityResult = v_sat_rx.toFixed(3);  // km/s，下行惯性系轨道速度
  results.orbitAltitudeUpResult = h_tx.toFixed(1);     // km，上行链路轨道高度
  results.orbitVelocityUpResult = v_sat_tx.toFixed(3); // km/s，上行惯性系轨道速度
  results.groundRelVelResult = v_ground_rx.toFixed(3);   // km/s，下行相对地面运动速度
  results.groundRelVelUpResult = v_ground_tx.toFixed(3); // km/s，上行相对地面运动速度
  results.maxDopplerUplinkResult = maxDopplerUplink.toFixed(1);   // kHz
  results.maxDopplerDownlinkResult = maxDopplerDownlink.toFixed(1); // kHz

  // ============ 可见性几何（NGSO 专属，纯轨道几何，严格有据；上下行各自计算，可不同）============
  // 参考：Maral & Bousquet "Satellite Communications Systems" 5th Ed §2/§5；Wertz, SMAD（几何）
  //   轨道周期    P = 2π·√(r³/μ)
  //   覆盖地心半角 λ = arccos( (Re/r)·cos ε_min ) − ε_min   （地面站最低仰角 ε_min 处的中心角）
  //   地面覆盖半径 = Re·λ（大圆弧长，sub-satellite 点到 ε_min 边界）
  //   最大过境时长 = 2λ / |ω_s − ω_E·cos(i)|（天顶过境，卫星相对地面扫过中心角 2λ）
  //     ω_s = √(μ/r³) 轨道角速度；ω_E·cos(i) 地球自转在轨道平面内的有效分量。
  //     顺行轨道地球自转使过境变长；同步轨道(ω_s→ω_E·cos i)时相对角速度→0 即常驻可见(∞)。
  //     ※ 不可用 2λ/ω_s（忽略地球自转）——该近似仅 LEO 成立，MEO 误差~25%、GEO 完全失真。
  // 上行用(r_tx, elevation)、下行用(r_rx, rxElevation)分别计算——上下行轨道高度/仰角可不同，结果可不同。
  // 注：重访周期 / 可见卫星数需星座规模（轨道面数、每面卫星数），工具无此输入 → 不臆造。
  const visMetrics = (r, epsDeg) => {
    const eps = epsDeg * Math.PI / 180;
    const omegaS = Math.sqrt(MU_EARTH / Math.pow(r, 3));          // rad/s 轨道角速度
    const P = 2 * Math.PI / omegaS;                              // s 轨道周期
    const lam = Math.acos((RE_KM / r) * Math.cos(eps)) - eps;    // rad 覆盖地心半角
    const omegaRel = Math.abs(omegaS - OMEGA_E * Math.cos(inclRad)); // rad/s 相对地面过顶角速度
    const passMin = omegaRel > 1e-7 ? (2 * lam / omegaRel) / 60 : Infinity; // min（≈0 即同步常驻可见）
    return { periodMin: P / 60, halfAngleDeg: lam * 180 / Math.PI, radiusKm: RE_KM * lam, passMin };
  };
  const fmtPass = (m) => isFinite(m) ? m.toFixed(2) : '常驻可见(∞)';
  const visUp = visMetrics(r_tx, elevation);
  const visDown = visMetrics(r_rx, rxElevation);
  results.orbitPeriodUpResult = visUp.periodMin.toFixed(2);
  results.orbitPeriodDownResult = visDown.periodMin.toFixed(2);
  results.coverageHalfAngleUpResult = visUp.halfAngleDeg.toFixed(2);
  results.coverageHalfAngleDownResult = visDown.halfAngleDeg.toFixed(2);
  results.coverageRadiusUpResult = visUp.radiusKm.toFixed(1);
  results.coverageRadiusDownResult = visDown.radiusKm.toFixed(1);
  results.maxPassDurationUpResult = fmtPass(visUp.passMin);
  results.maxPassDurationDownResult = fmtPass(visDown.passMin);
  
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
  // 实际 Eb/N₀ / Es/N₀：由实际合成 C/N 折算（门限值 + 链路余量，ISL 已按份额并入合成 C/N）
  results.ebnoActualResult = (ebno + linkmargin).toFixed(2);
  results.esnoActualResult = (esno + linkmargin).toFixed(2);
  // 帧效率显示：保持原始输入格式（分数或小数）
  results.rsCodeResult = rsCodeOriginal;
  // FEC码率显示：保持原始输入格式（分数或小数）
  results.fecResult = fecOriginal;
  results.carrierRateResult = carrierRate.toFixed(2);
  results.ChipRateResult = ChipRate.toFixed(2);
  results.symbolRateResult = symbolRate.toFixed(2);
  results.allocBandwidthResult = allocBandwidth;
  // 频谱效率 η = R_info(bps) / B_alloc(Hz) = infoRate(kbps) / allocBandwidth(kHz)
  const spectralEfficiency = (allocBandwidth > 0) ? (infoRate / allocBandwidth) : 0; // bps/Hz
  results.spectralEfficiencyResult = spectralEfficiency.toFixed(3);
  results.noiseBW = noiseBW.toFixed(2);
  results.RXnoiseBW = RXnoiseBW.toFixed(2);
  results.marginResult = margin.toFixed(2);
  
  // 可用度
  results.uplinkAvailabilityResult = uplinkAvailability.toFixed(5);
  results.downlinkAvailabilityResult = rxdownlinkAvailability.toFixed(5);
  results.systemAvailabilityResult = systemAvailability;
  // 预计中断时长（基于系统可用度，按年计算）
  const systemUnavailability = (100 - parseFloat(systemAvailability)) / 100;
  const interruptionMinutes = systemUnavailability * 365.25 * 24 * 60;
  const interruptionHours = interruptionMinutes / 60;
  results.interruptionMinutes = interruptionMinutes.toFixed(2);
  results.interruptionHours = interruptionHours.toFixed(2);
  
  // C/T和C/N
  results.uplinkCTResult = uplinkCT.toFixed(2);
  results.uplinkCN0Result = (uplinkCT + 228.6).toFixed(2);
  results.aciUplinkCTResult = aciUplinkCT.toFixed(2);
  results.aciUplinkCN0Result = (aciUplinkCT + 228.6).toFixed(2);
  results.adjUplinkCTResult = adjUplinkCT.toFixed(2);
  results.adjUplinkCN0Result = (adjUplinkCT + 228.6).toFixed(2);
  results.xpolUplinkCTResult = xpolUplinkCT.toFixed(2);
  results.xpolUplinkCN0Result = (xpolUplinkCT + 228.6).toFixed(2);
  results.hpaIntermodCTResult = hpaIntermodCT.toFixed(2);
  results.hpaIntermodCN0Result = (hpaIntermodCT + 228.6).toFixed(2);
  results.downlinkCTResult = downlinkCT.toFixed(2);
  results.downlinkCN0Result = (downlinkCT + 228.6).toFixed(2);
  results.aciDownlinkCTResult = aciDownlinkCT.toFixed(2);
  results.aciDownlinkCN0Result = (aciDownlinkCT + 228.6).toFixed(2);
  results.adjDownlinkCTResult = adjDownlinkCT.toFixed(2);
  results.adjDownlinkCN0Result = (adjDownlinkCT + 228.6).toFixed(2);
  results.xpolDownlinkCTResult = xpolDownlinkCT.toFixed(2);
  results.xpolDownlinkCN0Result = (xpolDownlinkCT + 228.6).toFixed(2);
  results.xpdrIntermodCTResult = xpdrIntermodCT.toFixed(2);
  results.xpdrIntermodCN0Result = (xpdrIntermodCT + 228.6).toFixed(2);
  results.totalCTResult = totalCT.toFixed(2);
  results.totalCN0Result = (totalCT + 228.6).toFixed(2);
  results.totalCTRainResult = totalCTRain.toFixed(2);
  results.totalCN0RainResult = (totalCTRain + 228.6).toFixed(2);
  results.carrierThresholdCT = carrierThreshold.toFixed(2);
  results.carrierThresholdCN0 = (carrierThreshold + 228.6).toFixed(2);
  results.carrierTotalCT = carrierTotalCT.toFixed(2);
  results.carrierTotalCN0 = (carrierTotalCT + 228.6).toFixed(2);
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
  results.arrivalPFDAtSatelliteResult = arrivalPFDAtSatellite.toFixed(3); // 实际到达卫星通量密度（载波电平+单位面积增益）
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
  results.transponderOutputEIRP = transponderOutputEIRP.toFixed(3);
  
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

// calculateMiscLossByFrequency 已移除，上下行综合损耗改为使用用户输入的"其他损耗"参数

function calculateScintillationFading(frequencyGHz, elevationDeg, antennaDiameter, availability, antennaEfficiency, Nwet) {
  // P.618-14 §2.4.1 适用范围：θ≥5°，4≤f≤55 GHz
  if (elevationDeg < 5) return 0;
  if (frequencyGHz < 4 || frequencyGHz > 55) return 0;

  const eta = (antennaEfficiency !== undefined) ? antennaEfficiency : 0.5;
  const nwet = (Nwet !== undefined) ? Nwet : 42;

  const elevRad = elevationDeg * Math.PI / 180;

  // Step 1: σ_ref（公式42）
  const sigma_ref = 3.6e-3 + 1e-4 * nwet;

  // Step 2: 有效路径长度 L（公式43），单位 m
  const hL = 1000;
  const L = 2 * hL / (Math.sqrt(Math.pow(Math.sin(elevRad), 2) + 2.35e-4) + Math.sin(elevRad));

  // Step 3: 有效天线直径 Deff（公式44），单位 m
  const Deff = Math.sqrt(eta) * antennaDiameter;

  // Step 4: x（公式46），f 单位 GHz，L 单位 m
  const x = 1.22 * Deff * Deff * (frequencyGHz / L);

  // Step 5: g(x)（公式45）
  if (x >= 7.0) return 0;
  const zeta = (11 / 6) * Math.atan(1 / x);
  const inner = 3.86 * Math.pow(x * x + 1, 11 / 12) * Math.sin(zeta) - 7.08 * Math.pow(x, 5 / 6);
  if (inner <= 0) return 0;
  const gx = Math.sqrt(inner);

  // Step 6: σ（公式47）
  const sigma = sigma_ref * Math.pow(frequencyGHz, 7 / 12) * gx / Math.pow(Math.sin(elevRad), 1.2);

  // Step 7: a(p)（公式48），p = 超越概率%
  const p = 100 - availability;
  if (p < 0.01 || p > 50) return 0; // 超出适用范围
  const logP = Math.log10(p);
  const a_p = -0.061 * Math.pow(logP, 3) + 0.072 * Math.pow(logP, 2) - 1.71 * logP + 3.0;

  // Step 8: 闪烁衰减（公式49）
  return a_p * sigma;
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

/**
 * 辅助函数 φ(rp, rt, a, b, c, d)
 * ITU-R P.676-13 Annex 2
 */
function phi676(rp, rt, a, b, c, d) {
  return Math.pow(rp, a) * Math.pow(rt, b) *
         Math.exp(c * (1 - rp) + d * (1 - rt));
}

/**
 * 干燥空气(氧气)比衰减 γ_o (dB/km)
 * ITU-R P.676-13 Annex 2 Section 2.1, Eq. (22a)-(22f)
 *
 * @param {number} f   频率 (GHz), 1-350
 * @param {number} rp  气压比 = P/1013
 * @param {number} rt  逆温度比 = 288/(273+t)
 * @returns {number} γ_o (dB/km)
 */
function calcSpecificAttenOxygen(f, rp, rt) {
  const xi1 = phi676(rp, rt, 0.0717, -1.8132, 0.0156, -1.6515);
  const xi2 = phi676(rp, rt, 0.5146, -4.6368, -0.1921, -5.7416);
  const xi3 = phi676(rp, rt, 0.3414, -6.5851, 0.2130, -8.5854);

  if (f <= 54) {
    // Eq. (22a)
    const A = 7.2 * Math.pow(rt, 2.8) /
              (f * f + 0.34 * rp * rp * Math.pow(rt, 1.6));
    const B = 0.62 * xi3 /
              (Math.pow(54 - f, 1.16 * xi1) + 0.83 * xi2);
    return (A + B) * f * f * rp * rp * 1e-3;
  }

  if (f > 66 && f <= 120) {
    // Eq. (22e)
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
    // Eq. (22f)，含修正项 δ
    const delta = -0.00306 * phi676(rp, rt, 3.211, -14.94, 1.583, -16.37);
    const A = 3.02e-4 / (1 + 1.9e-5 * Math.pow(f, 1.5));
    const B = 0.283 * Math.pow(rt, 0.3) /
              (Math.pow(f - 118.75, 2) + 2.91 * rp * rp * Math.pow(rt, 1.6));
    return (A + B) * f * f * rp * rp * Math.pow(rt, 3.5) * 1e-3 + delta;
  }

  // 54 < f ≤ 66: 氧气吸收复合体 — ITU-R P.676-13 Eq.(22b)(22c)(22d)
  // 参考比衰减 γ54…γ66（Eq.22 表中 φ 形式）
  const g54 = 2.192 * phi676(rp, rt, 1.8286, -1.9487, 0.4051, -2.8509);
  const g58 = 12.59 * phi676(rp, rt, 1.0045,  3.5610, 0.1588,  1.2834);
  const g60 = 15.00 * phi676(rp, rt, 0.9003,  4.1335, 0.0427,  1.6088);
  const g62 = 14.28 * phi676(rp, rt, 0.9886,  3.4176, 0.1827,  1.3429);
  const g64 = 6.819 * phi676(rp, rt, 1.4320,  0.6258, 0.3177, -0.5914);
  const g66 = 1.908 * phi676(rp, rt, 2.0717, -4.1404, 0.4910, -4.8718);

  if (f <= 60) {
    // Eq. (22b): 54 < f ≤ 60
    return Math.exp(
      Math.log(g54) / 24 * (f - 58) * (f - 60) -
      Math.log(g58) /  8 * (f - 54) * (f - 60) +
      Math.log(g60) / 12 * (f - 54) * (f - 58)
    );
  }
  if (f <= 62) {
    // Eq. (22c): 60 < f ≤ 62（线性内插）
    return g60 + (g62 - g60) * (f - 60) / 2;
  }
  // Eq. (22d): 62 < f ≤ 66
  return Math.exp(
    Math.log(g62) / 8 * (f - 64) * (f - 66) -
    Math.log(g64) / 4 * (f - 62) * (f - 66) +
    Math.log(g66) / 8 * (f - 62) * (f - 64)
  );
}

/**
 * 水蒸气比衰减 γ_w (dB/km)
 * ITU-R P.676-13 Annex 2 Section 2.1, Eq. (23)
 *
 * 包含 22.235 GHz 水蒸气谐振吸收线的精确建模
 *
 * @param {number} f    频率 (GHz)
 * @param {number} rp   气压比
 * @param {number} rt   逆温度比
 * @param {number} rho  水蒸气密度 (g/m³)
 * @returns {number} γ_w (dB/km)
 */
function calcSpecificAttenWaterVapor(f, rp, rt, rho) {
  const eta1 = 0.955 * rp * Math.pow(rt, 0.68) + 0.006 * rho;
  const eta2 = 0.735 * rp * Math.pow(rt, 0.5) + 0.0353 * Math.pow(rt, 4) * rho;

  // g(f, fi) = 1 + ((f - fi)/(f + fi))²  — Eq. (23) 中的线型函数
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
 * 对 P.676-13 Part 1 数据线性插值
 * @param {number} f  频率 (GHz)，范围 1–350
 * @returns {number[]} [ao, bo, co, d_coef]
 */
function interpP676Part1(f) {
  const data = P676_PART1;
  const n = data.length;
  if (f <= data[0][0]) return [data[0][1], data[0][2], data[0][3], data[0][4]];
  if (f >= data[n - 1][0]) return [data[n-1][1], data[n-1][2], data[n-1][3], data[n-1][4]];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (data[mid][0] <= f) lo = mid; else hi = mid;
  }
  const t = (f - data[lo][0]) / (data[hi][0] - data[lo][0]);
  return [
    data[lo][1] + t * (data[hi][1] - data[lo][1]),
    data[lo][2] + t * (data[hi][2] - data[lo][2]),
    data[lo][3] + t * (data[hi][3] - data[lo][3]),
    data[lo][4] + t * (data[hi][4] - data[lo][4])
  ];
}

/**
 * 氧气等效高度 h_o (km)
 * ITU-R P.676-13 Annex 2 — Part 1 系数表插值
 *   h_o = ao(f) + bo(f)·Ts + co(f)·Ps + do(f)·ρws    [Eq.(30)]
 *
 * @param {number} f      频率 (GHz)
 * @param {number} Ts     地面温度 (K)
 * @param {number} Ps     地面总气压 (hPa)
 * @param {number} rhoWs  地面水汽密度 (g/m³)
 * @returns {number} h_o (km)
 */
function calcEquivHeightOxygen(f, Ts, Ps, rhoWs) {
  const [ao, bo, co, d_coef] = interpP676Part1(f);
  return ao + bo * Ts + co * Ps + d_coef * rhoWs;
}

/**
 * 水汽等效高度 h_w (km)
 * ITU-R P.676-13 Annex 2 方法1（固定系数，与气象参数无关）
 *   h_w(f) = A·f + B + Σ[aᵢ / ((f−fᵢ)² + bᵢ)]        [Eq.(33)]
 *
 * @param {number} f  频率 (GHz)
 * @returns {number} h_w (km)
 */
function calcEquivHeightWaterVapor(f) {
  const t1 = 2.6846 / (Math.pow(f - 22.235080,  2) + 2.7649);
  const t2 = 5.8905 / (Math.pow(f - 183.310087, 2) + 4.9219);
  const t3 = 2.9810 / (Math.pow(f - 325.152888, 2) + 3.0748);
  return 5.6585e-5 * f + 1.8348 + t1 + t2 + t3;
}

/**
 * 计算大气气体衰减 — ITU-R P.676-13 (12/2022) Annex 2 更新算法
 *
 * 算法流程（P.676-13 Annex 2）：
 *   1) 比衰减: γ_o(f, rp, rt)  — Annex 2 解析公式 Eq.(22)
 *              γ_w(f, rp, rt, ρws) — Annex 2 解析公式 Eq.(23)
 *   2) 等效高度（新）:
 *      h_o = ao(f)·1 + bo(f)·Ts + co(f)·Ps + do(f)·ρws   [Part 1 插值 Eq.(30)]
 *      h_w = 5.6585×10⁻⁵·f + 1.8348 + Σ[ai/((f-fi)²+bi)] [方法1 Eq.(33)]
 *   3) 倾斜路径（θ ≥ 5°）:
 *      AG = (γ_o·h_o + γ_w·h_w) / sin(θ)                 [Eq.(29)/(35)]
 *      θ < 5°: 球面地球修正（保守外推）
 *
 * @param {number} frequencyGHz  频率 (GHz), 1–350
 * @param {number} elevationDeg  仰角 (度)，undefined 时返回天顶衰减
 * @param {number} [Ps]    地面总气压 (hPa)，默认 1013.25
 * @param {number} [Ts]    地面温度 (K)，默认 288.15
 * @param {number} [rhoWs] 地面水汽密度 (g/m³)，默认 7.5
 * @returns {number} 大气衰减 AG (dB)
 */
function calculateAtmosphericAttenuation(frequencyGHz, elevationDeg, Ps, Ts, rhoWs) {
  if (!isFinite(frequencyGHz) || frequencyGHz <= 0) return 0;
  if (elevationDeg !== undefined && elevationDeg !== null && !isFinite(elevationDeg)) {
    elevationDeg = undefined;
  }

  // 默认大气参数：气压/温度取 ITU-R P.835-6 标准参考大气，水汽密度取 10 g/m³（偏保守工程默认值，SatMaster 等商业软件惯例；ITU-R P.835 标准参考值为 7.5 g/m³）
  if (!Ps   || !isFinite(Ps))    Ps    = 1013.25;
  if (!Ts   || !isFinite(Ts))    Ts    = 288.15;
  if (rhoWs == null || !isFinite(rhoWs)) rhoWs = 20.0;  // g/m³

  const rp  = Ps / 1013.25;
  const rt  = 288.15 / Ts;

  const gammaO = calcSpecificAttenOxygen(frequencyGHz, rp, rt);
  const gammaW = calcSpecificAttenWaterVapor(frequencyGHz, rp, rt, rhoWs);

  const ho = calcEquivHeightOxygen(frequencyGHz, Ts, Ps, rhoWs);
  const hw = calcEquivHeightWaterVapor(frequencyGHz);

  const Ao = gammaO * Math.max(ho, 0);
  const Aw = gammaW * Math.max(hw, 0);

  if (elevationDeg === undefined || elevationDeg === null || elevationDeg >= 90) {
    return Ao + Aw;
  }
  if (elevationDeg < 0) elevationDeg = 0;

  if (elevationDeg >= 5) {
    return (Ao + Aw) / Math.sin(elevationDeg * Math.PI / 180);
  }

  const sinEl = Math.sin(elevationDeg * Math.PI / 180);
  const Re = 8500;
  const hoSafe = Math.max(ho, 0.1);
  const hwSafe = Math.max(hw, 0.1);
  return Ao / Math.sqrt(sinEl * sinEl + 2 * hoSafe / Re) +
         Aw / Math.sqrt(sinEl * sinEl + 2 * hwSafe / Re);
}

/**
 * 反误差函数 erfinv（Giles 2010 近似），用于对数正态分位数反算
 */
function erfinv(x) {
  const w0 = -Math.log((1 - x) * (1 + x));
  let p, w;
  if (w0 < 5) {
    w = w0 - 2.5;
    p = 2.81022636e-08;
    p = 3.43273939e-07 + p * w;
    p = -3.5233877e-06 + p * w;
    p = -4.39150654e-06 + p * w;
    p = 0.00021858087 + p * w;
    p = -0.00125372503 + p * w;
    p = -0.00417768164 + p * w;
    p = 0.246640727 + p * w;
    p = 1.50140941 + p * w;
  } else {
    w = Math.sqrt(w0) - 3;
    p = -0.000200214257;
    p = 0.000100950558 + p * w;
    p = 0.00134934322 + p * w;
    p = -0.00367342844 + p * w;
    p = 0.00573950773 + p * w;
    p = -0.0076224613 + p * w;
    p = 0.00943887047 + p * w;
    p = 1.00167406 + p * w;
    p = 2.83297682 + p * w;
  }
  return p * x;
}
function erfcinv(y) {
  return erfinv(1 - y);
}

/**
 * ITU-R P.840-9 比衰减系数 Kl（瑞利近似，双 Debye 水介电模型，<1000 GHz）
 *   Kl = 0.819·f / [ε″·(1+η²)]，η=(2+ε′)/ε″，单位 (dB/km)/(g/m³)
 * @param {number} f 频率 GHz
 * @param {number} T 温度 K（云默认 273.15）
 */
function cloudSpecificAttenuation(f, T) {
  const theta = 300 / T;
  const d = theta - 1;
  const e0 = 77.66 + 103.3 * d;
  const e1 = 0.0671 * e0;
  const e2 = 3.52;
  const fp = 20.20 - 146 * d + 316 * d * d;  // 主弛豫频率 GHz
  const fs = 39.8 * fp;                       // 次弛豫频率 GHz
  const rp = f / fp, rs = f / fs;
  const eImag = f * (e0 - e1) / (fp * (1 + rp * rp)) +
                f * (e1 - e2) / (fs * (1 + rs * rs));
  const eReal = (e0 - e1) / (1 + rp * rp) +
                (e1 - e2) / (1 + rs * rs) + e2;
  const eta = (2 + eReal) / eImag;
  return 0.819 * f / (eImag * (1 + eta * eta));
}

/**
 * 对数正态法求液态水柱含量 Lred(p)（完全符合 P.840-9）
 *   Lred = exp(m + σ·√2·erfcinv(2p/Pclw))，p<Pclw；否则 0
 * @param {number} pPercent 超越概率 %
 * @param {{m:number,sigma:number,Pclw:number}} params Pclw 单位 %
 * @returns {number} kg/m²
 */
function cloudLWCFromLognormal(pPercent, params) {
  const Pclw = params.Pclw;
  if (!(Pclw > 0) || pPercent >= Pclw) return 0;  // 云出现概率不足 → 无云
  const arg = 2 * pPercent / Pclw;                 // ∈(0,2)
  return Math.exp(params.m + params.sigma * Math.SQRT2 * erfcinv(arg));
}

/**
 * 云液态水柱含量 L(p) - 工程保守回退表（官方 Lred 地图未导入时使用），kg/m²
 * - p ≤ 1%：封顶在 1% 值（保守取湿润端）；1%~50% 线性递减；≥50% 取下限
 * @param {number} p 超越概率 %
 */
function getCloudLWC(p) {
  const tbl = [
    { p: 1,  L: 1.6 },   // 封顶值：所有 p<1% 都用它
    { p: 5,  L: 1.0 },
    { p: 10, L: 0.7 },
    { p: 20, L: 0.45 },
    { p: 30, L: 0.3 },
    { p: 50, L: 0.2 },
  ];
  if (p <= 1)  return tbl[0].L;
  if (p >= 50) return tbl[tbl.length - 1].L;
  for (let i = 0; i < tbl.length - 1; i++) {
    const a = tbl[i], b = tbl[i + 1];
    if (p >= a.p && p <= b.p) {
      return a.L + (b.L - a.L) * (p - a.p) / (b.p - a.p);
    }
  }
  return tbl[0].L;
}

/**
 * 计算云衰减 - 根据 ITU-R P.840-9 建议书
 * 斜路径云衰减 A = Kl·Lred / sinθ
 *   优先用官方对数正态参数地图按站点(lat,lon)取 Lred(p)（完全符合）；
 *   地图未导入时回退到工程保守表 getCloudLWC。
 * 截断规则（P.840 旧版口径）：p<1% 时取 1% 值，故内部用 pEff=max(p,1)。
 * @param {number} frequency 频率 GHz
 * @param {number} elevation 仰角 度
 * @param {number} p 超越概率 %，= 100 - 可用度
 * @param {number} lat 地球站纬度（用于查 Lred 地图，可选）
 * @param {number} lon 地球站经度（用于查 Lred 地图，可选）
 */
function calculateCloudAttenuation(frequency, elevation, p, lat, lon) {
  // 可用度 100% → p=0 → 视为晴天，不考虑云衰减
  if (p === null || p === undefined || p <= 0) return 0;
  if (!elevation || elevation <= 0) return 0;

  const pEff = Math.max(p, 1);  // p<1% 封顶在 1% 值

  // L：优先官方 Lred 对数正态地图，否则回退保守表
  let L = null;
  try {
    const params = (lat !== undefined && lon !== undefined && CLOUD_GRID && CLOUD_GRID.getParams)
      ? CLOUD_GRID.getParams(lat, lon) : null;
    if (params) L = cloudLWCFromLognormal(pEff, params);
  } catch (e) { /* 地图异常时静默回退 */ }
  if (L === null || L === undefined || isNaN(L)) L = getCloudLWC(pEff);

  const Kl = cloudSpecificAttenuation(frequency, 273.15);
  return Kl * L / Math.sin(elevation * CONSTANTS.PI / 180);
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
 * ITU-R P.618-14 公式(8)：将 A(0.01%) 换算为目标时间百分比 p 的雨衰
 * @param {number} A001    超过年均 0.01% 时间的衰减（dB）
 * @param {number} p       目标时间百分比（%），如 0.1 表示 0.1%
 * @param {number} latDeg  地球站纬度（度）
 * @param {number} elevDeg 链路仰角（度）
 * @returns {number} Ap（dB）
 */
function scaleRainAttenP618_14(A001, p, latDeg, elevDeg) {
  // 可用度 100% → p = 0 → 晴天，直接返回 0
  if (p <= 0 || A001 <= 0) return 0;
  // P.618-14 公式(8) 仅在 0.001%~5% 有效；p>5% 时雨衰记为 0（与 §2.5 总衰减合并一致）
  if (p > 5) return 0;

  const absLat = Math.abs(latDeg);
  const elevRad = elevDeg * CONSTANTS.PI / 180;
  const sinElev = Math.sin(elevRad);

  // 确定修正系数 β（ITU-R P.618-14 Step 10）
  let beta;
  if (p >= 1 || absLat >= 36) {
    beta = 0;
  } else if (elevDeg >= 25) {
    // p < 1%、|φ| < 36°、θ ≥ 25°
    beta = -0.005 * (absLat - 36);
  } else {
    // p < 1%、|φ| < 36°、θ < 25°
    beta = -0.005 * (absLat - 36) + 1.8 - 4.25 * sinElev;
  }

  // 公式(8): Ap = A0.01 × (p/0.01)^[−(0.655 + 0.033·ln(p) − 0.045·ln(A0.01) − β·(1−p)·sinθ)]
  const exponent = -(0.655 + 0.033 * Math.log(p) - 0.045 * Math.log(A001)
                    - beta * (1 - p) * sinElev);
  return A001 * Math.pow(p / 0.01, exponent);
}

/**
 * ITU-R P.618-14 §4.1：由同极化降雨衰减统计估算去极化（交叉极化鉴别度 XPD）
 *
 * 适用范围：8 ≤ f ≤ 35 GHz（频率项 Cf 给出的扩展范围为 6 ≤ f ≤ 55 GHz），θ ≤ 60°。
 * 严格按照电联（ITU-R P.618-14）规定的 8 个步骤实现，结果为 p% 时间不被超过的 XPD。
 *
 * @param {number} Ap      超过 p% 时间的同极化降雨衰减（CPA，dB），与 XPD 同一时间百分比
 * @param {number} freq    频率（GHz）
 * @param {number} tauDeg  线极化电场矢量相对当地水平方向的倾斜角 τ（度），圆极化取 45°
 * @param {number} elevDeg 路径仰角 θ（度）
 * @param {number} p       时间百分比（%）
 * @returns {number} XPDp（dB）；无降雨或参数无效时返回 Infinity（表示无去极化效应）
 */
function calculateRainXPD_P618_14(Ap, freq, tauDeg, elevDeg, p) {
  // 无降雨衰减或参数无效 → 不产生雨致去极化
  if (!(Ap > 0) || !(freq > 0) || !(p > 0)) return Infinity;

  // 方法有效仰角范围 θ ≤ 60°，超出则限幅到 60°
  const theta = Math.min(Math.max(elevDeg, 0), 60);
  const D2R = CONSTANTS.PI / 180;

  // Step 1: 频率相关项 Cf = 30·log f （6 ≤ f ≤ 55 GHz）
  const Cf = 30 * Math.log10(freq);

  // Step 2: 降雨衰减相关项 CA = V(f)·log(Ap)
  //   V(f) = 12.8·f^0.19   (6 ≤ f ≤ 9 GHz)
  //   V(f) = 22.6          (9 < f ≤ 36 GHz)
  //   V(f) = 13.0·f^0.19   (36 < f ≤ 55 GHz)
  let Vf;
  if (freq <= 9)        Vf = 12.8 * Math.pow(freq, 0.19);
  else if (freq <= 36)  Vf = 22.6;
  else                  Vf = 13.0 * Math.pow(freq, 0.19);
  const CA = Vf * Math.log10(Ap);

  // Step 3: 极化改善因子 Cτ = -10·log[1 - 0.484·(1 + cos4τ)]
  //   τ=0°(水平) 或 τ=90°(垂直) → Cτ ≈ 15 dB；τ=45°(圆极化) → Cτ = 0
  const Ctau = -10 * Math.log10(1 - 0.484 * (1 + Math.cos(4 * tauDeg * D2R)));

  // Step 4: 仰角相关项 Cθ = -40·log(cosθ) （θ ≤ 60°）
  const Ctheta = -40 * Math.log10(Math.cos(theta * D2R));

  // Step 5: 雨滴倾角分布相关项 Cσ = 0.0053·σ²
  //   σ 为雨滴倾角分布的有效标准差（度），对 1%/0.1%/0.01%/0.001%
  //   分别取 0/5/10/15 度，即 σ = -5·log10(p)（p ≥ 1% 时取 0）
  const sigma = Math.max(0, -5 * Math.log10(p));
  const Csigma = 0.0053 * sigma * sigma;

  // Step 6: 降雨去极化 XPDrain = Cf - CA + Cτ + Cθ + Cσ （dB）
  const XPDrain = Cf - CA + Ctau + Ctheta + Csigma;

  // Step 7: 冰晶相关项 Cice = XPDrain·(0.3 + 0.1·log p)/2 （dB）
  const Cice = XPDrain * (0.3 + 0.1 * Math.log10(p)) / 2;

  // Step 8: 含冰晶效应的 XPD（p% 时间不被超过的 XPD）
  return XPDrain - Cice;
}

/**
 * ITU-R P.838-3 频率插值：返回任意频率 f(GHz) 处的 {k_H, alpha_H, k_V, alpha_V}
 *
 * 标准插值规则（ITU-R P.838-3，§ 注释）：
 *   - 频率 f 采用对数刻度；
 *   - 系数 k 采用对数刻度（即 k 关于 log f 做 log-log 线性插值）；
 *   - 指数 α 采用线性刻度（即 α 关于 log f 做半对数线性插值）。
 * 表外频率夹紧到 [1, 100] GHz（表的有效范围）；整数频点直接返回表值（向后兼容）。
 *
 * @param {number} freqGHz 频率（GHz）
 * @returns {{k_H:number, alpha_H:number, k_V:number, alpha_V:number}}
 */
function interpolateP838(freqGHz) {
  const keys = Object.keys(P838_TABLE).map(Number).sort((a, b) => a - b);
  const fMin = keys[0];
  const fMax = keys[keys.length - 1];

  // 表外夹紧到有效范围
  if (freqGHz <= fMin) return Object.assign({}, P838_TABLE[fMin]);
  if (freqGHz >= fMax) return Object.assign({}, P838_TABLE[fMax]);
  // 整数频点直接命中表值（避免浮点误差，向后兼容）
  if (P838_TABLE[freqGHz]) return Object.assign({}, P838_TABLE[freqGHz]);

  // 定位相邻两频点 f1 < f < f2
  let f1 = fMin;
  let f2 = fMax;
  for (let i = 0; i < keys.length - 1; i++) {
    if (keys[i] <= freqGHz && freqGHz <= keys[i + 1]) {
      f1 = keys[i];
      f2 = keys[i + 1];
      break;
    }
  }
  const e1 = P838_TABLE[f1];
  const e2 = P838_TABLE[f2];

  // 频率对数刻度上的插值比例
  const t = (Math.log(freqGHz) - Math.log(f1)) / (Math.log(f2) - Math.log(f1));
  // k：log-log（k 取对数后线性插值）
  const logInterp = (y1, y2) => Math.exp(Math.log(y1) + t * (Math.log(y2) - Math.log(y1)));
  // α：半对数（α 关于 log f 线性插值）
  const linInterp = (y1, y2) => y1 + t * (y2 - y1);

  return {
    k_H: logInterp(e1.k_H, e2.k_H),
    alpha_H: linInterp(e1.alpha_H, e2.alpha_H),
    k_V: logInterp(e1.k_V, e2.k_V),
    alpha_V: linInterp(e1.alpha_V, e2.alpha_V),
  };
}

/**
 * 获取P838系数 - 根据频率和极化
 * @param {number} freq 具体频率（GHz，非整数频率经 interpolateP838 插值）
 */
function getCoefficients(freq, pol, elevationDeg) {
  const entry = interpolateP838(freq);
  if (!entry) {
    return [0, 0];
  }

  const { k_H, alpha_H, k_V, alpha_V } = entry;

  // ITU-R P.838-3 极化合成公式：
  //   k     = (k_H + k_V + (k_H - k_V) * cos²θ * cos2τ) / 2
  //   alpha = (k_H·αH + k_V·αV + (k_H·αH - k_V·αV) * cos²θ * cos2τ) / (2k)
  // τ=0°  → H 极化，cos2τ = +1
  // τ=90° → V 极化，cos2τ = -1
  // τ=45° → 圆极化，cos2τ =  0（θ项消去，与仰角无关）
  const theta = (elevationDeg !== undefined && elevationDeg !== null) ? elevationDeg : 0;
  const cos2Theta = Math.pow(Math.cos(theta * Math.PI / 180), 2);

  let cos2Tau;
  if (pol === 'H')      cos2Tau =  1;
  else if (pol === 'V') cos2Tau = -1;
  else                  cos2Tau =  0; // 圆极化 C

  const k     = (k_H + k_V + (k_H - k_V) * cos2Theta * cos2Tau) / 2;
  const alpha = (k_H * alpha_H + k_V * alpha_V
               + (k_H * alpha_H - k_V * alpha_V) * cos2Theta * cos2Tau) / (2 * k);
  return [k, alpha];
}

/**
 * 计算单路径降雨衰减 - 完全按照 index.html 实现
 */
function calculateSinglePathRainAttenuation(R001, freq, pol, latitude, longitude, orbitPos, altitude, elevationDegOverride) {
  if (R001 === 0 || R001 === null || R001 === undefined) {
    return { A001: 0, hR: 0 };
  }

  // 步骤 1: 计算卫星仰角
  //   — 若提供了 elevationDegOverride（NGSO 使用用户输入的最低仰角），则直接采用
  //   — 否则按 GEO 几何由经纬度 + 轨道经度反算仰角（原行为，保持 GEO 路径向后兼容）
  let elevationRad, elevationDeg;
  if (elevationDegOverride !== undefined && elevationDegOverride !== null && isFinite(elevationDegOverride)) {
    elevationDeg = Math.max(0, Math.min(90, Number(elevationDegOverride)));
    elevationRad = elevationDeg * CONSTANTS.PI / 180;
  } else {
    const earthLatRad = latitude * CONSTANTS.PI / 180;
    const deltaLonRad_elev = (orbitPos - longitude) * CONSTANTS.PI / 180;
    const cosTerm_elev = Math.cos(earthLatRad) * Math.cos(deltaLonRad_elev);
    const denominator = Math.sqrt(Math.max(1e-10, 1 - Math.pow(cosTerm_elev, 2))); // 防止除零
    elevationRad = Math.atan((cosTerm_elev - 0.15127) / denominator);
    elevationDeg = elevationRad * 180 / CONSTANTS.PI;
  }
  
  // 步骤 2: 查询零度等温线高度（ITU-R P.839-4 数据库）
  const h0 = getIsothermHeight(latitude, longitude);
  const hR = h0 + 0.36; // 雨高（km）
  const absLat = Math.abs(latitude);

  // hR - hs ≤ 0：站址高于雨高，无降雨衰减（P.618-14 Step 2）
  if (hR - altitude <= 0) {
    return { A001: 0, hR };
  }

  // 步骤 3: 计算通过雨区的倾斜路径长度
  let Ls;
  if (elevationDeg >= 5) {
    // 对于仰角 ≥ 5° 的情况使用简化公式
    Ls = (hR - altitude) / Math.sin(elevationRad);
  } else {
    // 对于低仰角使用更准确的公式（考虑地球曲率）
    const Re = 8500; // 有效地球半径（km）
    const sinElev = Math.sin(elevationRad);
    Ls = (2 * (hR - altitude)) / (Math.sqrt(sinElev * sinElev + 2 * (hR - altitude) / Re) + sinElev);
  }
  
  // 步骤 4: 计算水平投影长度
  const LG = Ls * Math.cos(elevationRad);
  
  // 步骤 5: 计算比降雨衰减（specific attenuation）
  const [k, alpha] = getCoefficients(freq, pol, elevationDeg);
  const gamma = k * Math.pow(R001, alpha); // 比降雨衰减 (dB/km)
  
  // 步骤 6: 计算水平路径缩减因子
  const r001 = 1 / (1 + 0.78 * Math.sqrt(LG * gamma / freq) - 0.38 * (1 - Math.exp(-2 * LG)));
  
  // 步骤 7: 计算垂直调整系数 v0.01（ITU-R P.618-14 Step 7）
  // 第一步：辅助角 ζ
  const zetaRad = Math.atan((hR - altitude) / (LG * r001));

  // 第二步：有效雨区路径长度 LR
  //   ζ > θ → 水平受限路径；否则 → 全斜路径
  let LR;
  if (zetaRad > elevationRad) {
    LR = LG * r001 / Math.cos(elevationRad);
  } else {
    LR = (hR - altitude) / Math.sin(elevationRad);
  }

  // 第三步：纬度修正量 χ（度）— 直接代入指数，不做事后二次修正
  const chi = absLat < 36 ? (36 - absLat) : 0;

  // 第四步：v0.01（P.618-14 关键变化：χ 在 e 的指数内，替代旧版中的 θ）
  const term = 31 * (1 - Math.exp(-elevationDeg / (1 + chi))) * Math.sqrt(LR * gamma) / (freq * freq);
  const v001 = 1 / (1 + Math.sqrt(Math.sin(elevationRad)) * (term - 0.45));
  
  // 步骤 8: 计算有效路径长度
  const LE = LR * v001;
  
  // 步骤 9: 计算0.01%时间超过的衰减值
  const A001 = gamma * LE;
  
  return { A001, hR };
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
  calculateSatelliteAngle,
  slantRangeFromAltitude,
  altitudeFromSlantRange
};

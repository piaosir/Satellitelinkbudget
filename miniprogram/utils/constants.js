// utils/constants.js
// 卫星链路计算系统常量定义

// 调制方式和调制因子对照表
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

// 调制方式选项
const MODULATION_OPTIONS = [
  { value: 'BPSK', label: 'BPSK' },
  { value: 'QPSK', label: 'QPSK' },
  { value: '8PSK', label: '8PSK' },
  { value: '8QAM', label: '8QAM' },
  { value: '16QAM', label: '16QAM' },
  { value: '16APSK', label: '16APSK' },
  { value: '32APSK', label: '32APSK' },
  { value: '64APSK', label: '64APSK' },
  { value: '128APSK', label: '128APSK' }
];

// 工作频段选项及其对应的默认上下行频率
const FREQUENCY_BAND_OPTIONS = [
  { value: 'L', label: 'L频段', uplinkFreq: 1.6, downlinkFreq: 1.5 },
  { value: 'S', label: 'S频段', uplinkFreq: 2.1, downlinkFreq: 2.3 },
  { value: 'C', label: 'C频段', uplinkFreq: 6.15, downlinkFreq: 3.95 },
  { value: 'X', label: 'X频段', uplinkFreq: 8.0, downlinkFreq: 7.25 },
  { value: 'Ku-BSS', label: 'Ku-BSS频段', uplinkFreq: 17.5, downlinkFreq: 11.9 },
  { value: 'ExtC', label: '扩展C频段', uplinkFreq: 6.545, downlinkFreq: 3.54 },
  { value: 'ExtKu', label: '扩展Ku频段', uplinkFreq: 13.868, downlinkFreq: 11.58 },
  { value: 'Ku', label: 'Ku频段', uplinkFreq: 14.25, downlinkFreq: 12.5 },
  { value: 'Ka', label: 'Ka频段', uplinkFreq: 29.50, downlinkFreq: 19.45 },
  { value: 'Q', label: 'Q频段', uplinkFreq: 30.0, downlinkFreq: 42.5 },
  { value: 'V', label: 'V频段', uplinkFreq: 52.0, downlinkFreq: 20.0 }
];

// 极化方式选项
const POLARIZATION_OPTIONS = [
  { value: 'V', label: '垂直极化(V)' },
  { value: 'H', label: '水平极化(H)' },
  { value: 'C', label: '左旋极化(LHCP)' },
  { value: 'C', label: '右旋极化(RHCP)' }
];

// 转发器工作状态选项
const TRANSPONDER_STATUS_OPTIONS = [
  { value: 'single', label: '单载波' },
  { value: 'multi', label: '多载波' }
];

// UPC控制选项
const UPC_OPTIONS = [
  { value: 'no', label: '否' },
  { value: 'yes', label: '是' },
  { value: 'custom', label: '自定义' }
];

// FEC编码率选项（已废弃，改用直接输入）
const FEC_OPTIONS = [
  { value: 0.5, label: '1/2' },
  { value: 0.66667, label: '2/3' },
  { value: 0.75, label: '3/4' },
  { value: 0.8, label: '4/5' },
  { value: 0.9, label: '9/10' }
];

// ITU-R P.838标准降雨衰减系数表（与 linkCalculator.js 保持一致）
const P838_TABLE = {
  1: { kH: 0.0000387, kV: 0.0000352, alphaH: 0.912, alphaV: 0.880 },
  2: { kH: 0.000154, kV: 0.000138, alphaH: 0.963, alphaV: 0.923 },
  4: { kH: 0.00014279, kV: 0.0002092, alphaH: 1.352238369, alphaV: 1.211336093 },
  6: { kH: 0.000582217, kV: 0.000488094, alphaH: 1.586916682, alphaV: 1.586916682 },
  7: { kH: 0.00301, kV: 0.00265, alphaH: 1.332, alphaV: 1.312 },
  8: { kH: 0.00454, kV: 0.00395, alphaH: 1.327, alphaV: 1.310 },
  10: { kH: 0.0101, kV: 0.00887, alphaH: 1.276, alphaV: 1.264 },
  11: { kH: 0.020107088, kV: 0.02, alphaH: 1.186292179, alphaV: 1.158356387 },
  12: { kH: 0.02403, kV: 0.024375695, alphaH: 1.16692498, alphaV: 1.13649 },
  13: { kH: 0.0361, kV: 0.0378, alphaH: 1.12532, alphaV: 1.0887762 },
  14: { kH: 0.04025286, kV: 0.042385097, alphaH: 1.114709104, alphaV: 1.076671696 },
  15: { kH: 0.0367, kV: 0.0335, alphaH: 1.154, alphaV: 1.128 },
  17: { kH: 0.07045588, kV: 0.073645, alphaH: 1.0631, alphaV: 1.023248061 },
  20: { kH: 0.09276, kV: 0.095, alphaH: 1.0381, alphaV: 1.002 },
  25: { kH: 0.124, kV: 0.113, alphaH: 1.061, alphaV: 1.030 },
  30: { kH: 0.2375, kV: 0.2319, alphaH: 0.94, alphaV: 0.92213 },
  35: { kH: 0.263, kV: 0.233, alphaH: 0.979, alphaV: 0.963 },
  40: { kH: 0.4431, kV: 0.4274, alphaH: 0.8673, alphaV: 0.8421 },
  42: { kH: 0.4865, kV: 0.4712, alphaH: 0.8539, alphaV: 0.8296 },
  45: { kH: 0.442, kV: 0.393, alphaH: 0.903, alphaV: 0.897 },
  50: { kH: 0.66, kV: 0.6472, alphaH: 0.8084, alphaV: 0.7871 },
  52: { kH: 0.7020, kV: 0.6901, alphaH: 0.7987, alphaV: 0.7783 },
  55: { kH: 0.7635, kV: 0.7527, alphaH: 0.7853, alphaV: 0.7661 },
  60: { kH: 0.8606, kV: 0.8515, alphaH: 0.7656, alphaV: 0.7486 },
  70: { kH: 1.0315, kV: 1.0253, alphaH: 0.7345, alphaV: 0.7215 },
  80: { kH: 0.975, kV: 0.906, alphaH: 0.769, alphaV: 0.769 },
  90: { kH: 1.06, kV: 0.999, alphaH: 0.753, alphaV: 0.754 },
  100: { kH: 1.12, kV: 1.06, alphaH: 0.743, alphaV: 0.744 }
};

// 物理常量
const CONSTANTS = {
  LIGHT_SPEED: 299792.458, // 光速 km/s
  BOLTZMANN: 1.38064852e-23, // 玻尔兹曼常数 J/K
  EARTH_RADIUS: 6371, // 地球平均半径 km
  SATELLITE_ALTITUDE: 35786, // 地球同步卫星高度 km
  PI: Math.PI
};

// 结果参数标签配置
const RESULT_LABELS = {
  // 上行站结果
  uplink: {
    title: '上行站计算结果',
    params: [
      { key: 'antennaDiameter', label: '地球站天线口径', unit: '米' },
      { key: 'longitude', label: '地球站经度', unit: '°E' },
      { key: 'latitude', label: '地球站纬度', unit: '°N' },
      { key: 'elevationAngle', label: '对卫星仰角', unit: '度' },
      { key: 'azimuthAngle', label: '对卫星方位角', unit: '度' },
      { key: 'polarizationAngle', label: '对卫星极化角', unit: '度' },
      { key: 'antennaEfficiency', label: '天线效率', unit: '%' },
      { key: 'uplinkFrequency', label: '上行中心频率', unit: 'GHz' },
      { key: 'downlinkFrequency', label: '下行中心频率', unit: 'GHz' },
      { key: 'uplinkAvailability', label: '上行可用度', unit: '%' },
      { key: 'downlinkAvailability', label: '下行可用度', unit: '%' },
      { key: 'systemAvailability', label: '系统可用度', unit: '%' }
    ]
  },
  // 载波参数结果
  carrier: {
    title: '载波参数计算结果',
    params: [
      { key: 'infoRate', label: '信息速率', unit: 'kbps' },
      { key: 'modulation', label: '调制方式', unit: '' },
      { key: 'modulationFactor', label: '调制因子', unit: '' },
      { key: 'ber', label: '误码率', unit: '' },
      { key: 'ebno', label: 'Eb/N0', unit: 'dB' },
      { key: 'esno', label: 'Es/N0', unit: 'dB' },
      { key: 'rsCode', label: 'RS编码率', unit: '' },
      { key: 'fec', label: 'FEC编码率', unit: '' },
      { key: 'carrierRate', label: '载波速率', unit: 'kbps' },
      { key: 'symbolRate', label: '符号速率', unit: 'ksps' },
      { key: 'bandwidth', label: '分配带宽', unit: 'kHz' },
      { key: 'linkMargin', label: '链路余量', unit: 'dB' }
    ]
  },
  // 链路预算结果
  budget: {
    title: '链路预算结果',
    params: [
      { key: 'bandwidthRatio', label: '带宽占用比', unit: '%' },
      { key: 'powerRatio', label: '功率占用比', unit: '%' },
      { key: 'amplifierPower', label: '功放最大输出功率', unit: 'W' },
      { key: 'amplifierPowerDbw', label: '功放最大输出功率', unit: 'dBW' },
      { key: 'totalCN', label: '载波总C/N', unit: 'dB' },
      { key: 'thresholdCN', label: '门限C/N', unit: 'dB' },
      { key: 'totalCT', label: '载波总C/T', unit: 'dB/K' },
      { key: 'linkMargin', label: '链路余量', unit: 'dB' },
      { key: 'earthStationEIRP', label: '地球站EIRP', unit: 'dBW' },
      { key: 'fluxDensity', label: '到达卫星的载波通量密度', unit: 'dBW/m²' }
    ]
  }
};

module.exports = {
  MODULATION_FACTORS,
  MODULATION_OPTIONS,
  FREQUENCY_BAND_OPTIONS,
  POLARIZATION_OPTIONS,
  TRANSPONDER_STATUS_OPTIONS,
  UPC_OPTIONS,
  FEC_OPTIONS,
  P838_TABLE,
  CONSTANTS,
  RESULT_LABELS
};

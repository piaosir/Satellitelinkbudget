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
  '64QAM': 6,   // 3GPP NR/NR-NTN (TS 38.211)
  '64APSK': 6,
  '128APSK': 7,
  '256APSK': 8
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
  { value: '64QAM', label: '64QAM' },   // 3GPP NR-NTN (TS 38.211)
  { value: '64APSK', label: '64APSK' },
  { value: '128APSK', label: '128APSK' },
  { value: '256APSK', label: '256APSK' }
];

// 工作频段选项及其对应的默认上下行频率
const FREQUENCY_BAND_OPTIONS = [
  { value: 'L', label: 'L', uplinkFreq: 1.6, downlinkFreq: 1.5 },
  { value: 'S', label: 'S', uplinkFreq: 2.1, downlinkFreq: 2.3 },

  

  { value: 'X', label: 'X', uplinkFreq: 8.0, downlinkFreq: 7.25 },

  

  { value: 'ExtC', label: '扩展C', uplinkFreq: 6.545, downlinkFreq: 3.54 },
  { value: 'C', label: 'C', uplinkFreq: 6.15, downlinkFreq: 3.95 },
  { value: 'ExtKu', label: '扩展Ku', uplinkFreq: 13.85, downlinkFreq: 11.55 },

  { value: 'Ku', label: 'Ku', uplinkFreq: 14.25, downlinkFreq: 12.5 },
  { value: 'Ku-BSS', label: 'Ku-BSS', uplinkFreq: 17.5, downlinkFreq: 11.9 },
  { value: 'Ka', label: 'Ka', uplinkFreq: 29.50, downlinkFreq: 19.45 },
  { value: 'Q', label: 'Q', uplinkFreq: 30.0, downlinkFreq: 42.5 },
  { value: 'V', label: 'V', uplinkFreq: 52.0, downlinkFreq: 20.0 }
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

// FEC码率选项（已废弃，改用直接输入）
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

// 通信标准选项
// DVB-S/S2/S2X: ETSI EN 300 421 / EN 302 307-1 / EN 302 307-2
// DVB-RCS2:    ETSI EN 301 545-2 V1.2.1 (Second Generation DVB Interactive Satellite System)
// 3GPP NR-NTN: 3GPP TS 38.211/38.212/38.214 Release 17 (TR 38.821)
// 3GPP NB-IoT NTN: 3GPP TS 36.211/36.212/36.213 Release 17 (TR 36.763)
const DVB_STANDARD_OPTIONS = [
  { value: 'custom', label: '自定义' },
  { value: 'DVB-S', label: 'DVB-S' },
  { value: 'DVB-S2', label: 'DVB-S2' },
  { value: 'DVB-RCS2', label: 'DVB-RCS2' },
  { value: 'DVB-S2X', label: 'DVB-S2X' },
  { value: '3GPP NR-NTN', label: '3GPP NR-NTN' },
  { value: '3GPP NB-IoT NTN', label: '3GPP NB-IoT NTN' }
];

// DVB-S MODCOD预设表 (Eb/N₀, RS=188/204, 1+α=1.35)
const DVBS_MODCOD_TABLE = [
  { label: 'QPSK 1/2', modulation: 'QPSK', fec: '1/2', rsCode: '188/204', bandwidthFactor: 1.35, noiseRatioMode: 'ebno', threshold: 4.5 },
  { label: 'QPSK 2/3', modulation: 'QPSK', fec: '2/3', rsCode: '188/204', bandwidthFactor: 1.35, noiseRatioMode: 'ebno', threshold: 5.0 },
  { label: 'QPSK 3/4', modulation: 'QPSK', fec: '3/4', rsCode: '188/204', bandwidthFactor: 1.35, noiseRatioMode: 'ebno', threshold: 5.5 },
  { label: 'QPSK 5/6', modulation: 'QPSK', fec: '5/6', rsCode: '188/204', bandwidthFactor: 1.35, noiseRatioMode: 'ebno', threshold: 6.0 },
  { label: 'QPSK 7/8', modulation: 'QPSK', fec: '7/8', rsCode: '188/204', bandwidthFactor: 1.35, noiseRatioMode: 'ebno', threshold: 6.4 },
  { label: '8PSK 2/3', modulation: '8PSK', fec: '2/3', rsCode: '188/204', bandwidthFactor: 1.35, noiseRatioMode: 'ebno', threshold: 6.9 },
  { label: '8PSK 5/6', modulation: '8PSK', fec: '5/6', rsCode: '188/204', bandwidthFactor: 1.35, noiseRatioMode: 'ebno', threshold: 8.9 },
  { label: '8PSK 8/9', modulation: '8PSK', fec: '8/9', rsCode: '188/204', bandwidthFactor: 1.35, noiseRatioMode: 'ebno', threshold: 9.4 },
  { label: '16QAM 3/4', modulation: '16QAM', fec: '3/4', rsCode: '188/204', bandwidthFactor: 1.35, noiseRatioMode: 'ebno', threshold: 9.0 },
  { label: '16QAM 7/8', modulation: '16QAM', fec: '7/8', rsCode: '188/204', bandwidthFactor: 1.35, noiseRatioMode: 'ebno', threshold: 10.7 }
];

// DVB-RCS2 MODCOD预设表 (Es/N₀, Turbo码, 1+α=1.2)
// 帧效率: 0.9; Es/N₀门限: AWGN信道 PER=10⁻⁵
const DVB_RCS2_MODCOD_TABLE = [
  { label: 'QPSK 1/3',  modulation: 'QPSK',  fec: '1/3', rsCode: '0.9', bandwidthFactor: 1.2, noiseRatioMode: 'esno', threshold: -0.8 },
  { label: 'QPSK 1/2',  modulation: 'QPSK',  fec: '1/2', rsCode: '0.9', bandwidthFactor: 1.2, noiseRatioMode: 'esno', threshold:  1.4 },
  { label: 'QPSK 2/3',  modulation: 'QPSK',  fec: '2/3', rsCode: '0.9', bandwidthFactor: 1.2, noiseRatioMode: 'esno', threshold:  3.8 },
  { label: 'QPSK 3/4',  modulation: 'QPSK',  fec: '3/4', rsCode: '0.9', bandwidthFactor: 1.2, noiseRatioMode: 'esno', threshold:  4.8 },
  { label: 'QPSK 5/6',  modulation: 'QPSK',  fec: '5/6', rsCode: '0.9', bandwidthFactor: 1.2, noiseRatioMode: 'esno', threshold:  6.4 },
  { label: '8PSK 2/3',  modulation: '8PSK',  fec: '2/3', rsCode: '0.9', bandwidthFactor: 1.2, noiseRatioMode: 'esno', threshold:  7.8 },
  { label: '8PSK 3/4',  modulation: '8PSK',  fec: '3/4', rsCode: '0.9', bandwidthFactor: 1.2, noiseRatioMode: 'esno', threshold:  8.8 },
  { label: '8PSK 5/6',  modulation: '8PSK',  fec: '5/6', rsCode: '0.9', bandwidthFactor: 1.2, noiseRatioMode: 'esno', threshold: 10.4 },
  { label: '16QAM 3/4', modulation: '16QAM', fec: '3/4', rsCode: '0.9', bandwidthFactor: 1.2, noiseRatioMode: 'esno', threshold: 12.8 },
  { label: '16QAM 5/6', modulation: '16QAM', fec: '5/6', rsCode: '0.9', bandwidthFactor: 1.2, noiseRatioMode: 'esno', threshold: 14.4 }
];

// DVB-S2 MODCOD预设表 (Es/N₀, RS=0.9, 1+α=1.05)
const DVBS2_MODCOD_TABLE = [
  { label: 'QPSK 1/4', modulation: 'QPSK', fec: '1/4', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: -1.20 },
  { label: 'QPSK 1/3', modulation: 'QPSK', fec: '1/3', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: -0.70 },
  { label: 'QPSK 2/5', modulation: 'QPSK', fec: '2/5', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 0.00 },
  { label: 'QPSK 1/2', modulation: 'QPSK', fec: '1/2', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 1.00 },
  { label: 'QPSK 3/5', modulation: 'QPSK', fec: '3/5', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 2.23 },
  { label: 'QPSK 2/3', modulation: 'QPSK', fec: '2/3', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 3.10 },
  { label: 'QPSK 3/4', modulation: 'QPSK', fec: '3/4', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 4.03 },
  { label: 'QPSK 4/5', modulation: 'QPSK', fec: '4/5', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 4.68 },
  { label: 'QPSK 5/6', modulation: 'QPSK', fec: '5/6', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 5.18 },
  { label: 'QPSK 8/9', modulation: 'QPSK', fec: '8/9', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 6.20 },
  { label: 'QPSK 9/10', modulation: 'QPSK', fec: '9/10', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 6.42 },
  { label: '8PSK 3/5', modulation: '8PSK', fec: '3/5', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 5.50 },
  { label: '8PSK 2/3', modulation: '8PSK', fec: '2/3', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 6.62 },
  { label: '8PSK 3/4', modulation: '8PSK', fec: '3/4', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 7.91 },
  { label: '8PSK 5/6', modulation: '8PSK', fec: '5/6', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 9.35 },
  { label: '8PSK 8/9', modulation: '8PSK', fec: '8/9', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 10.69 },
  { label: '8PSK 9/10', modulation: '8PSK', fec: '9/10', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 10.98 },
  { label: '16APSK 2/3', modulation: '16APSK', fec: '2/3', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 8.97 },
  { label: '16APSK 3/4', modulation: '16APSK', fec: '3/4', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 10.21 },
  { label: '16APSK 4/5', modulation: '16APSK', fec: '4/5', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 11.03 },
  { label: '16APSK 5/6', modulation: '16APSK', fec: '5/6', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 11.61 },
  { label: '16APSK 8/9', modulation: '16APSK', fec: '8/9', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 12.89 },
  { label: '16APSK 9/10', modulation: '16APSK', fec: '9/10', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 13.13 },
  { label: '32APSK 3/4', modulation: '32APSK', fec: '3/4', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 12.73 },
  { label: '32APSK 4/5', modulation: '32APSK', fec: '4/5', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 13.64 },
  { label: '32APSK 5/6', modulation: '32APSK', fec: '5/6', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 14.28 },
  { label: '32APSK 8/9', modulation: '32APSK', fec: '8/9', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 15.69 },
  { label: '32APSK 9/10', modulation: '32APSK', fec: '9/10', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 16.05 }
];

// DVB-S2X MODCOD预设表 (Es/N₀, RS=0.9, 1+α=1.05)
// 参考标准: ETSI EN 302 307-2 V1.3.1 (2021-07), Table 20a
// 包含全部DVB-S2 MODCOD (向后兼容) 及 DVB-S2X 新增MODCOD
// 门限值为正常FECFRAME (64800 bits), AWGN信道, QEF (PER < 10⁻⁷) 条件下的Es/N₀
const DVBS2X_MODCOD_TABLE = [
  // ——— QPSK (DVB-S2 legacy + S2X新增) ———
  { label: 'QPSK 2/9',  modulation: 'QPSK', fec: '2/9',  rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: -2.85 },
  { label: 'QPSK 13/45', modulation: 'QPSK', fec: '13/45', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: -2.03 },
  { label: 'QPSK 1/4',  modulation: 'QPSK', fec: '1/4',  rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: -1.20 },
  { label: 'QPSK 1/3',  modulation: 'QPSK', fec: '1/3',  rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: -0.70 },
  { label: 'QPSK 2/5',  modulation: 'QPSK', fec: '2/5',  rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 0.00 },
  { label: 'QPSK 9/20', modulation: 'QPSK', fec: '9/20', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 0.69 },
  { label: 'QPSK 1/2',  modulation: 'QPSK', fec: '1/2',  rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 1.00 },
  { label: 'QPSK 11/20', modulation: 'QPSK', fec: '11/20', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 1.58 },
  { label: 'QPSK 3/5',  modulation: 'QPSK', fec: '3/5',  rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 2.23 },
  { label: 'QPSK 2/3',  modulation: 'QPSK', fec: '2/3',  rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 3.10 },
  { label: 'QPSK 3/4',  modulation: 'QPSK', fec: '3/4',  rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 4.03 },
  { label: 'QPSK 4/5',  modulation: 'QPSK', fec: '4/5',  rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 4.68 },
  { label: 'QPSK 5/6',  modulation: 'QPSK', fec: '5/6',  rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 5.18 },
  { label: 'QPSK 8/9',  modulation: 'QPSK', fec: '8/9',  rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 6.20 },
  { label: 'QPSK 9/10', modulation: 'QPSK', fec: '9/10', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 6.42 },
  // ——— 8PSK (DVB-S2 legacy + S2X新增) ———
  { label: '8PSK 3/5',   modulation: '8PSK', fec: '3/5',   rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 5.50 },
  { label: '8PSK 23/36', modulation: '8PSK', fec: '23/36', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 6.12 },
  { label: '8PSK 2/3',   modulation: '8PSK', fec: '2/3',   rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 6.62 },
  { label: '8PSK 25/36', modulation: '8PSK', fec: '25/36', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 7.05 },
  { label: '8PSK 13/18', modulation: '8PSK', fec: '13/18', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 7.49 },
  { label: '8PSK 3/4',   modulation: '8PSK', fec: '3/4',   rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 7.91 },
  { label: '8PSK 5/6',   modulation: '8PSK', fec: '5/6',   rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 9.35 },
  { label: '8PSK 8/9',   modulation: '8PSK', fec: '8/9',   rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 10.69 },
  { label: '8PSK 9/10',  modulation: '8PSK', fec: '9/10',  rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 10.98 },
  // ——— 16APSK (DVB-S2 legacy + S2X新增) ———
  { label: '16APSK 26/45', modulation: '16APSK', fec: '26/45', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 7.80 },
  { label: '16APSK 3/5',   modulation: '16APSK', fec: '3/5',   rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 8.38 },
  { label: '16APSK 28/45', modulation: '16APSK', fec: '28/45', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 8.56 },
  { label: '16APSK 23/36', modulation: '16APSK', fec: '23/36', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 8.77 },
  { label: '16APSK 2/3',   modulation: '16APSK', fec: '2/3',   rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 8.97 },
  { label: '16APSK 25/36', modulation: '16APSK', fec: '25/36', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 9.49 },
  { label: '16APSK 3/4',   modulation: '16APSK', fec: '3/4',   rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 10.21 },
  { label: '16APSK 13/18', modulation: '16APSK', fec: '13/18', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 9.90 },
  { label: '16APSK 7/9',   modulation: '16APSK', fec: '7/9',   rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 10.69 },
  { label: '16APSK 4/5',   modulation: '16APSK', fec: '4/5',   rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 11.03 },
  { label: '16APSK 5/6',   modulation: '16APSK', fec: '5/6',   rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 11.61 },
  { label: '16APSK 77/90', modulation: '16APSK', fec: '77/90', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 12.09 },
  { label: '16APSK 8/9',   modulation: '16APSK', fec: '8/9',   rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 12.89 },
  { label: '16APSK 9/10',  modulation: '16APSK', fec: '9/10',  rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 13.13 },
  // ——— 32APSK (DVB-S2 legacy + S2X新增) ———
  { label: '32APSK 2/3',   modulation: '32APSK', fec: '2/3',   rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 11.75 },
  { label: '32APSK 32/45', modulation: '32APSK', fec: '32/45', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 12.14 },
  { label: '32APSK 11/15', modulation: '32APSK', fec: '11/15', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 12.49 },
  { label: '32APSK 3/4',   modulation: '32APSK', fec: '3/4',   rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 12.73 },
  { label: '32APSK 7/9',   modulation: '32APSK', fec: '7/9',   rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 13.24 },
  { label: '32APSK 4/5',   modulation: '32APSK', fec: '4/5',   rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 13.64 },
  { label: '32APSK 5/6',   modulation: '32APSK', fec: '5/6',   rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 14.28 },
  { label: '32APSK 8/9',   modulation: '32APSK', fec: '8/9',   rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 15.69 },
  { label: '32APSK 9/10',  modulation: '32APSK', fec: '9/10',  rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 16.05 },
  // ——— 64APSK (DVB-S2X新增) ———
  { label: '64APSK 32/45', modulation: '64APSK', fec: '32/45', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 13.98 },
  { label: '64APSK 11/15', modulation: '64APSK', fec: '11/15', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 14.81 },
  { label: '64APSK 7/9',   modulation: '64APSK', fec: '7/9',   rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 15.52 },
  { label: '64APSK 4/5',   modulation: '64APSK', fec: '4/5',   rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 16.20 },
  { label: '64APSK 5/6',   modulation: '64APSK', fec: '5/6',   rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 16.55 },
  // ——— 128APSK (DVB-S2X新增) ———
  { label: '128APSK 3/4',  modulation: '128APSK', fec: '3/4',  rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 17.73 },
  { label: '128APSK 7/9',  modulation: '128APSK', fec: '7/9',  rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 18.53 },
  // ——— 256APSK (DVB-S2X新增) ———
  { label: '256APSK 29/45', modulation: '256APSK', fec: '29/45', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 16.98 },
  { label: '256APSK 2/3',   modulation: '256APSK', fec: '2/3',   rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 17.24 },
  { label: '256APSK 31/45', modulation: '256APSK', fec: '31/45', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 18.10 },
  { label: '256APSK 32/45', modulation: '256APSK', fec: '32/45', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 18.59 },
  { label: '256APSK 11/15', modulation: '256APSK', fec: '11/15', rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 18.84 },
  { label: '256APSK 3/4',   modulation: '256APSK', fec: '3/4',   rsCode: '0.9', bandwidthFactor: 1.05, noiseRatioMode: 'esno', threshold: 19.57 }
];

// 3GPP NR-NTN MODCOD预设表 (Es/N₀, LDPC, CP-OFDM, bandwidthFactor=1.0)
// 参考标准: 3GPP TS 38.214 V17.x.x Table 5.1.3.1-1 (MCS Index Table 1, 64QAM)
// MCS调制阶数与目标码率来自TS 38.214 Release 17; Es/N₀门限基于AWGN信道BLER=10%条件
// 链路仿真参考: 3GPP TR 38.821 V17.x.x (Non-Terrestrial Networks link budget)
// rsCode=0.9 综合考虑CP开销(~6.7%)及DMRS/导频开销; bandwidthFactor=1.0(CP-OFDM无滚降滤波器)
const NR_NTN_MODCOD_TABLE = [
  // ——— QPSK (MCS 0–9) ———
  { label: 'MCS0  QPSK  120/1024', modulation: 'QPSK',  fec: '120/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: -5.10 },
  { label: 'MCS1  QPSK  157/1024', modulation: 'QPSK',  fec: '157/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: -4.10 },
  { label: 'MCS2  QPSK  193/1024', modulation: 'QPSK',  fec: '193/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: -3.16 },
  { label: 'MCS3  QPSK  251/1024', modulation: 'QPSK',  fec: '251/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: -1.80 },
  { label: 'MCS4  QPSK  308/1024', modulation: 'QPSK',  fec: '308/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: -0.69 },
  { label: 'MCS5  QPSK  379/1024', modulation: 'QPSK',  fec: '379/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold:  0.73 },
  { label: 'MCS6  QPSK  449/1024', modulation: 'QPSK',  fec: '449/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold:  2.02 },
  { label: 'MCS7  QPSK  526/1024', modulation: 'QPSK',  fec: '526/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold:  3.41 },
  { label: 'MCS8  QPSK  602/1024', modulation: 'QPSK',  fec: '602/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold:  4.72 },
  { label: 'MCS9  QPSK  679/1024', modulation: 'QPSK',  fec: '679/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold:  5.94 },
  // ——— 16QAM (MCS 10–16) ———
  { label: 'MCS10 16QAM 340/1024', modulation: '16QAM', fec: '340/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold:  5.95 },
  { label: 'MCS11 16QAM 378/1024', modulation: '16QAM', fec: '378/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold:  6.93 },
  { label: 'MCS12 16QAM 434/1024', modulation: '16QAM', fec: '434/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold:  8.12 },
  { label: 'MCS13 16QAM 490/1024', modulation: '16QAM', fec: '490/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold:  9.31 },
  { label: 'MCS14 16QAM 553/1024', modulation: '16QAM', fec: '553/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: 10.68 },
  { label: 'MCS15 16QAM 616/1024', modulation: '16QAM', fec: '616/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: 11.93 },
  { label: 'MCS16 16QAM 658/1024', modulation: '16QAM', fec: '658/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: 12.73 },
  // ——— 64QAM (MCS 17–28) ———
  { label: 'MCS17 64QAM 438/1024', modulation: '64QAM', fec: '438/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: 12.79 },
  { label: 'MCS18 64QAM 466/1024', modulation: '64QAM', fec: '466/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: 13.65 },
  { label: 'MCS19 64QAM 517/1024', modulation: '64QAM', fec: '517/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: 14.93 },
  { label: 'MCS20 64QAM 567/1024', modulation: '64QAM', fec: '567/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: 16.13 },
  { label: 'MCS21 64QAM 616/1024', modulation: '64QAM', fec: '616/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: 17.40 },
  { label: 'MCS22 64QAM 666/1024', modulation: '64QAM', fec: '666/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: 18.62 },
  { label: 'MCS23 64QAM 719/1024', modulation: '64QAM', fec: '719/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: 19.84 },
  { label: 'MCS24 64QAM 772/1024', modulation: '64QAM', fec: '772/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: 21.19 },
  { label: 'MCS25 64QAM 822/1024', modulation: '64QAM', fec: '822/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: 22.40 },
  { label: 'MCS26 64QAM 873/1024', modulation: '64QAM', fec: '873/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: 23.66 },
  { label: 'MCS27 64QAM 910/1024', modulation: '64QAM', fec: '910/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: 24.59 },
  { label: 'MCS28 64QAM 948/1024', modulation: '64QAM', fec: '948/1024', rsCode: '0.9', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: 25.56 }
];

// 3GPP NB-IoT NTN MODCOD预设表 (Es/N₀, Turbo码, OFDMA/SC-FDMA, bandwidthFactor=1.0)
// 参考标准: 3GPP TS 36.213 V17.x.x Table 16.4.1.5.1-1 (NPDSCH MCS, 多载波模式, N_rep=1)
//           3GPP TR 36.763 V17.x.x (NB-IoT/eMTC NTN 研究项目链路预算)
// 码率依据: 每子帧可用编码比特数 = (14-3)×12×2 = 264 bits (含DMRS开销扣除)
// Es/N₀门限: AWGN信道BLER=10%条件下Turbo码仿真结果
// rsCode=1.0 (NB-IoT无外码; 物理层开销已隐含于fec码率中)
// bandwidthFactor=1.0 (CP-OFDM/SC-FDMA)
const NB_IOT_NTN_MODCOD_TABLE = [
  // I_TBS=0, TBS=16b/SF:  码率≈1/16, 深度覆盖场景
  { label: 'MCS0  QPSK  1/16 (I_TBS=0)',  modulation: 'QPSK', fec: '1/16', rsCode: '1', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: -8.80 },
  // I_TBS=2, TBS=32b/SF:  码率≈1/8
  { label: 'MCS2  QPSK  1/8  (I_TBS=2)',  modulation: 'QPSK', fec: '1/8',  rsCode: '1', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: -5.70 },
  // I_TBS=4, TBS=56b/SF:  码率≈1/5
  { label: 'MCS4  QPSK  1/5  (I_TBS=4)',  modulation: 'QPSK', fec: '1/5',  rsCode: '1', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: -4.37 },
  // I_TBS=5, TBS=72b/SF:  码率≈1/4
  { label: 'MCS5  QPSK  1/4  (I_TBS=5)',  modulation: 'QPSK', fec: '1/4',  rsCode: '1', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: -2.50 },
  // I_TBS=6, TBS=88b/SF:  码率≈1/3
  { label: 'MCS6  QPSK  1/3  (I_TBS=6)',  modulation: 'QPSK', fec: '1/3',  rsCode: '1', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold: -1.26 },
  // I_TBS=8, TBS=120b/SF: 码率≈1/2
  { label: 'MCS8  QPSK  1/2  (I_TBS=8)',  modulation: 'QPSK', fec: '1/2',  rsCode: '1', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold:  1.00 },
  // I_TBS=11, TBS=176b/SF: 码率≈2/3
  { label: 'MCS11 QPSK  2/3  (I_TBS=11)', modulation: 'QPSK', fec: '2/3',  rsCode: '1', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold:  3.25 },
  // I_TBS=12, TBS=208b/SF: 码率≈3/4 (最高MCS)
  { label: 'MCS12 QPSK  3/4  (I_TBS=12)', modulation: 'QPSK', fec: '3/4',  rsCode: '1', bandwidthFactor: 1.1, noiseRatioMode: 'esno', threshold:  4.76 }
];

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
      { key: 'uplinkFrequency', label: '上行频率', unit: 'GHz' },
      { key: 'downlinkFrequency', label: '下行频率', unit: 'GHz' },
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
      { key: 'rsCode', label: '频谱效率', unit: 'bps/Hz' },
      { key: 'fec', label: 'FEC码率', unit: '' },
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
  DVB_STANDARD_OPTIONS,
  DVBS_MODCOD_TABLE,
  DVBS2_MODCOD_TABLE,
  DVBS2X_MODCOD_TABLE,
  DVB_RCS2_MODCOD_TABLE,
  NR_NTN_MODCOD_TABLE,
  NB_IOT_NTN_MODCOD_TABLE,
  P838_TABLE,
  CONSTANTS,
  RESULT_LABELS
};

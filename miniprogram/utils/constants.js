// utils/constants.js
// 卫星链路计算系统常量定义

// 调制方式和调制因子对照表（每符号承载的比特数）
const MODULATION_FACTORS = {
  'BPSK': 1,
  'QPSK': 2,
  '8PSK': 3,
  '8QAM': 3,
  '16QAM': 4,
  '16APSK': 4,
  '32APSK': 5,
  '64QAM': 6,    // 3GPP NR/NR-NTN (TS 38.211)
  '64APSK': 6,
  '128APSK': 7,
  '256QAM': 8,   // 3GPP NR-NTN MCS 表 2 (TS 38.214 Table 5.1.3.1-2)
  '256APSK': 8
};

// 调制因子：先查上表，查不到就按名字算（256QAM → log2(256) = 8）。
//
// ★ 为什么不能直接 MODULATION_FACTORS[x] || 2：这个 || 2 会把「表里没这个名字」和「它是 QPSK」
//   混成一件事。NR-NTN 的 MCS 表 2 出来时表里没有 '256QAM'，选中 MCS20 以上各档全部静默按 QPSK
//   算（调制因子 2 而不是 8），符号率、载波带宽、Eb/N₀ 换算一起错，界面上却写着 256QAM ——
//   与 v3.8.8 修过的 '64QAM' 缺档是同一个坑，补一个名字治不了第二次。
//   现在：名字形如「<阶数>QAM / PSK / APSK」的一律现算，认不出才回落 QPSK 并在控制台留一行。
const MOD_NAME_RE = /^(\d+)\s*(APSK|QAM|PSK)$/i;
function modFactorOf(name) {
  const s = String(name == null ? '' : name).trim().toUpperCase();
  if (MODULATION_FACTORS[s] != null) return MODULATION_FACTORS[s];
  const m = s.match(MOD_NAME_RE);
  if (m) {
    const order = parseInt(m[1], 10);
    // 阶数必须是 2 的幂且 ≥ 2（8QAM 这类非 log2 记法已在上表里逐条列出，走不到这里）
    if (order >= 2 && (order & (order - 1)) === 0) return Math.round(Math.log2(order));
  }
  console.warn('[constants] 认不出的调制方式「' + name + '」，按 QPSK 计');
  return 2;
}

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
  { value: '256QAM', label: '256QAM' }, // 3GPP NR-NTN MCS 表 2
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
// 3GPP NR-NTN: 3GPP TS 38.211/38.212/38.214 Release 17/18 (TR 38.821)
// 3GPP NB-IoT NTN: 3GPP TS 36.211/36.212/36.213 Release 17 (TR 36.763)
//
// ★ 3GPP 一族由两张表扩到八张，与仿真平台逐条同名同 key：NR 的 MCS 表 1/2/3 与 PUSCH 变换预编码
//   表 1/2 是【五张不同的表】（TS 38.214 §5.1.3.1 三张 + §6.1.4.1 两张），同一个 MCS 序号在不同表里
//   是不同的调制与码率；NB-IoT 的 NPDSCH / NPUSCH 多音 / NPUSCH 单音同理（TS 36.213 §16.4.1.5 与
//   §16.5.1.2），且单音那张的行号是 I_MCS 而非 I_TBS，要经 Table 16.5.1.2-1 映射。原先只给一张
//   「NR-NTN」和一张「NB-IoT NTN」，等于把这些表混成一张 —— 选中的档位在标准里往往并不存在。
// ★ 两个老 key（'3GPP NR-NTN' / '3GPP NB-IoT NTN'）刻意保持原字不动：改了名，老配置与历史记录里
//   存的 dvbStandard 就指空，MODCOD 下拉会静默退回「自定义」。它们现在分别指表 1 与 NPDSCH。
const DVB_STANDARD_OPTIONS = [
  { value: 'custom', label: '自定义' },
  { value: 'DVB-S', label: 'DVB-S' },
  { value: 'DVB-S2', label: 'DVB-S2' },
  { value: 'DVB-RCS2', label: 'DVB-RCS2' },
  { value: 'DVB-S2X', label: 'DVB-S2X' },
  { value: '3GPP NR-NTN', label: '3GPP NR-NTN · 表1 64QAM' },
  { value: '3GPP NR-NTN T2', label: '3GPP NR-NTN · 表2 256QAM' },
  { value: '3GPP NR-NTN T3', label: '3GPP NR-NTN · 表3 低频谱效率' },
  { value: '3GPP NR-NTN TP1', label: '3GPP NR-NTN · 预编码表1' },
  { value: '3GPP NR-NTN TP2', label: '3GPP NR-NTN · 预编码表2' },
  { value: '3GPP NB-IoT NTN', label: '3GPP NB-IoT · NPDSCH' },
  { value: '3GPP NB-IoT NTN NPUSCH MT', label: '3GPP NB-IoT · NPUSCH 多音' },
  { value: '3GPP NB-IoT NTN NPUSCH ST', label: '3GPP NB-IoT · NPUSCH 单音' }
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

// ===================== 3GPP NTN =====================
//
// ★ 门限口径是 SNR（noiseRatioMode: 'snr'），不是 Es/N₀ ——【每资源元素 RE 的信噪比，噪声带宽取
//   占用带宽 B_occ = N_RB×12×SCS（NB-IoT 上行 = 音数×SCS）】。它与 Es/N₀ 在物理上是同一个量，
//   区别在噪声带宽怎么取：厂家、3GPP（TS 38.215 §5.1.6 SS-SINR/CSI-SINR）、MATLAB 5G Toolbox 的
//   链路级仿真、gNB 从 DMRS 估出来的读数，全是按 RE 算；平台原来那条 DVB 链是拿信息速率除以一个
//   经验帧效率 0.9 反推符号率，比每 RE 口径高 0.50 dB（下行）/ 0.20 dB（上行）。
//   占用带宽 / 信道带宽 / TBS / 信息速率一律由 utils/ntnPhy.js 按载波的物理层参数 phy 算，故本表的
//   rsCode 与 bandwidthFactor 两列【不参与任何计算】，写 1 只是占位（口径推导见 ntnPhy.js 文件头）。
//
// 调制与码率两列是 TS 38.214 V17.0.0 / TS 36.213 的原值转录：
//   NR 表1 = Table 5.1.3.1-1（64QAM）、表2 = 5.1.3.1-2（256QAM）、表3 = 5.1.3.1-3（低频谱效率）、
//   变换预编码表1 = Table 6.1.4.1-1、表2 = Table 6.1.4.1-2（π/2-BPSK，NTN 上行主力）。
//   变换预编码表前几档随 tp-pi2BPSK 配置分 q=1（π/2-BPSK）/ q=2（QPSK）两种解读，两者频谱效率相同、
//   门限同值，故在本表里拆成两行、idx（MCS 序号）相同；π/2-BPSK 在平台调制体系里记作 BPSK
//   （相位旋转只影响 PAPR，不影响 bit/符号）。
//   NB-IoT NPDSCH = Table 16.4.1.5.1-1、NPUSCH 多音 = 16.5.1.2-2、单音 I_MCS 映射 = 16.5.1.2-1。
//   fec 一列写成「TBS / 每子帧(RU)可用编码比特数」的未约分形式：多音与下行都是 (14−3)×12×2 = 264，
//   单音是 (16 slot × 7 − 16 DMRS) × Qm = 96（π/2-BPSK）/ 192（π/4-QPSK）。★ 单音这个分母是按
//   TS 36.211 §10.1.3 的时隙结构推的，不是原文转录的一列数；它只用于显示（NB-IoT 的速率走 TBS 表）。
//
// ★ 门限一列 3GPP 不规定（各家实现差几个 dB 是常态），本表是公开链路级仿真的重定基线：
//   NR —— 按 Shannon 极限 10lg(2^SE − 1) + 按调制族线性拟合的实现差距 gap(SE) 算，SE = Qm·R/1024：
//         QPSK/π-BPSK gap = 1.606 − 0.270·SE；16QAM gap = 1.689 + 0.094·SE；
//         64QAM / 256QAM gap = 2.019 + 0.121·SE。拟合锚点 = UC3M/York《BLER-SNR Curves for 5G NR
//         MCS under AWGN》(VTC2024-Fall) 表 II 的 BLER 1e-2 值减 0.3 dB，与《Fluid Antenna System
//         Empowering 5G NR》(arXiv 2503.05384) 表 II 的 BLER 0.1 值。
//         条件：AWGN、SISO、大码块（≥3000 bit）、BLER 10% 首传、N_rep = 1。
//         2026-09-05 前平台的旧预置比这套基线保守 0.6 dB(MCS0)…6.2 dB(MCS28)，高阶档会把容量整体压低一档。
//   NB-IoT —— Kodheli 等《Link budget analysis for satellite-based narrowband IoT systems》(AdHoc-Now
//         2019) 表 3，每档取最大吞吐 TBS、Turbo、AWGN、BLER 10% 首传、N_rep = 1。
//         旧预置比它乐观 0.3–3.0 dB（I_TBS=0：−8.80 vs −5.80），方向是危险的那一边。
//   参考但【不作基线】：srsRAN Project mcs_calculator.cpp 的 UL 表（真 gNB + ZMQ，作者自标 temporary）、
//         5G-LENA nr-eesm-t1/t2.cc（绝对值比上两者高 3–5 dB；其「小码块惩罚」CBS ≤ 500 bit 高
//         +0.3…+2.2 dB 只作元数据提示，不自动加）。
//   诚实边界：NTN 实际信道（NTN-TDL/CDL、残余多普勒、功放非线性、1–2 PRB 小分配）还要再要 1–3 dB，
//         靠厂家实测表在「文件管理 · MODCOD 表」原样录入覆盖 —— 那才是本表存在的意义。

// 3GPP NR-NTN · MCS 表 1（64QAM）—— TS 38.214 Table 5.1.3.1-1，MCS 0–28
const NR_NTN_MODCOD_TABLE = [
  { label: 'MCS0  QPSK  120/1024', modulation: 'QPSK',   fec: '120/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -6.00, idx: 0 },
  { label: 'MCS1  QPSK  157/1024', modulation: 'QPSK',   fec: '157/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -4.70, idx: 1 },
  { label: 'MCS2  QPSK  193/1024', modulation: 'QPSK',   fec: '193/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -3.70, idx: 2 },
  { label: 'MCS3  QPSK  251/1024', modulation: 'QPSK',   fec: '251/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -2.50, idx: 3 },
  { label: 'MCS4  QPSK  308/1024', modulation: 'QPSK',   fec: '308/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -1.40, idx: 4 },
  { label: 'MCS5  QPSK  379/1024', modulation: 'QPSK',   fec: '379/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -0.30, idx: 5 },
  { label: 'MCS6  QPSK  449/1024', modulation: 'QPSK',   fec: '449/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  0.60, idx: 6 },
  { label: 'MCS7  QPSK  526/1024', modulation: 'QPSK',   fec: '526/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  1.50, idx: 7 },
  { label: 'MCS8  QPSK  602/1024', modulation: 'QPSK',   fec: '602/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  2.30, idx: 8 },
  { label: 'MCS9  QPSK  679/1024', modulation: 'QPSK',   fec: '679/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  3.00, idx: 9 },
  { label: 'MCS10 16QAM 340/1024', modulation: '16QAM',  fec: '340/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  3.60, idx: 10 },
  { label: 'MCS11 16QAM 378/1024', modulation: '16QAM',  fec: '378/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  4.30, idx: 11 },
  { label: 'MCS12 16QAM 434/1024', modulation: '16QAM',  fec: '434/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  5.30, idx: 12 },
  { label: 'MCS13 16QAM 490/1024', modulation: '16QAM',  fec: '490/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  6.30, idx: 13 },
  { label: 'MCS14 16QAM 553/1024', modulation: '16QAM',  fec: '553/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  7.30, idx: 14 },
  { label: 'MCS15 16QAM 616/1024', modulation: '16QAM',  fec: '616/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  8.30, idx: 15 },
  { label: 'MCS16 16QAM 658/1024', modulation: '16QAM',  fec: '658/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  8.90, idx: 16 },
  { label: 'MCS17 64QAM 438/1024', modulation: '64QAM',  fec: '438/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  9.30, idx: 17 },
  { label: 'MCS18 64QAM 466/1024', modulation: '64QAM',  fec: '466/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  9.90, idx: 18 },
  { label: 'MCS19 64QAM 517/1024', modulation: '64QAM',  fec: '517/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  10.90, idx: 19 },
  { label: 'MCS20 64QAM 567/1024', modulation: '64QAM',  fec: '567/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  12.00, idx: 20 },
  { label: 'MCS21 64QAM 616/1024', modulation: '64QAM',  fec: '616/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  12.90, idx: 21 },
  { label: 'MCS22 64QAM 666/1024', modulation: '64QAM',  fec: '666/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  13.90, idx: 22 },
  { label: 'MCS23 64QAM 719/1024', modulation: '64QAM',  fec: '719/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  15.00, idx: 23 },
  { label: 'MCS24 64QAM 772/1024', modulation: '64QAM',  fec: '772/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  16.00, idx: 24 },
  { label: 'MCS25 64QAM 822/1024', modulation: '64QAM',  fec: '822/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  16.90, idx: 25 },
  { label: 'MCS26 64QAM 873/1024', modulation: '64QAM',  fec: '873/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  17.90, idx: 26 },
  { label: 'MCS27 64QAM 910/1024', modulation: '64QAM',  fec: '910/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  18.60, idx: 27 },
  { label: 'MCS28 64QAM 948/1024', modulation: '64QAM',  fec: '948/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  19.30, idx: 28 }
];

// 3GPP NR-NTN · MCS 表 2（256QAM）—— TS 38.214 Table 5.1.3.1-2，MCS 0–27
const NR_NTN_T2_MODCOD_TABLE = [
  { label: 'MCS0  QPSK  120/1024', modulation: 'QPSK',   fec: '120/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -6.00, idx: 0 },
  { label: 'MCS1  QPSK  193/1024', modulation: 'QPSK',   fec: '193/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -3.70, idx: 1 },
  { label: 'MCS2  QPSK  308/1024', modulation: 'QPSK',   fec: '308/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -1.40, idx: 2 },
  { label: 'MCS3  QPSK  449/1024', modulation: 'QPSK',   fec: '449/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  0.60, idx: 3 },
  { label: 'MCS4  QPSK  602/1024', modulation: 'QPSK',   fec: '602/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  2.30, idx: 4 },
  { label: 'MCS5  16QAM 378/1024', modulation: '16QAM',  fec: '378/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  4.30, idx: 5 },
  { label: 'MCS6  16QAM 434/1024', modulation: '16QAM',  fec: '434/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  5.30, idx: 6 },
  { label: 'MCS7  16QAM 490/1024', modulation: '16QAM',  fec: '490/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  6.30, idx: 7 },
  { label: 'MCS8  16QAM 553/1024', modulation: '16QAM',  fec: '553/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  7.30, idx: 8 },
  { label: 'MCS9  16QAM 616/1024', modulation: '16QAM',  fec: '616/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  8.30, idx: 9 },
  { label: 'MCS10 16QAM 658/1024', modulation: '16QAM',  fec: '658/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  8.90, idx: 10 },
  { label: 'MCS11 64QAM 466/1024', modulation: '64QAM',  fec: '466/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  9.90, idx: 11 },
  { label: 'MCS12 64QAM 517/1024', modulation: '64QAM',  fec: '517/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  10.90, idx: 12 },
  { label: 'MCS13 64QAM 567/1024', modulation: '64QAM',  fec: '567/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  12.00, idx: 13 },
  { label: 'MCS14 64QAM 616/1024', modulation: '64QAM',  fec: '616/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  12.90, idx: 14 },
  { label: 'MCS15 64QAM 666/1024', modulation: '64QAM',  fec: '666/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  13.90, idx: 15 },
  { label: 'MCS16 64QAM 719/1024', modulation: '64QAM',  fec: '719/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  15.00, idx: 16 },
  { label: 'MCS17 64QAM 772/1024', modulation: '64QAM',  fec: '772/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  16.00, idx: 17 },
  { label: 'MCS18 64QAM 822/1024', modulation: '64QAM',  fec: '822/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  16.90, idx: 18 },
  { label: 'MCS19 64QAM 873/1024', modulation: '64QAM',  fec: '873/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  17.90, idx: 19 },
  { label: 'MCS20 256QAM682.5/1024', modulation: '256QAM', fec: '682.5/1024', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  18.60, idx: 20 },
  { label: 'MCS21 256QAM711/1024', modulation: '256QAM', fec: '711/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  19.30, idx: 21 },
  { label: 'MCS22 256QAM754/1024', modulation: '256QAM', fec: '754/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  20.40, idx: 22 },
  { label: 'MCS23 256QAM797/1024', modulation: '256QAM', fec: '797/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  21.50, idx: 23 },
  { label: 'MCS24 256QAM841/1024', modulation: '256QAM', fec: '841/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  22.50, idx: 24 },
  { label: 'MCS25 256QAM885/1024', modulation: '256QAM', fec: '885/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  23.60, idx: 25 },
  { label: 'MCS26 256QAM916.5/1024', modulation: '256QAM', fec: '916.5/1024', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  24.40, idx: 26 },
  { label: 'MCS27 256QAM948/1024', modulation: '256QAM', fec: '948/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  25.20, idx: 27 }
];

// 3GPP NR-NTN · MCS 表 3（低频谱效率 64QAM）—— TS 38.214 Table 5.1.3.1-3，MCS 0–28。
// NTN 覆盖受限场景（手持终端、深度覆盖）常用这一张：最低档 QPSK 30/1024 的门限低到 −12.2 dB。
const NR_NTN_T3_MODCOD_TABLE = [
  { label: 'MCS0  QPSK  30/1024', modulation: 'QPSK',   fec: '30/1024',   rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -12.20, idx: 0 },
  { label: 'MCS1  QPSK  40/1024', modulation: 'QPSK',   fec: '40/1024',   rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -11.00, idx: 1 },
  { label: 'MCS2  QPSK  50/1024', modulation: 'QPSK',   fec: '50/1024',   rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -10.00, idx: 2 },
  { label: 'MCS3  QPSK  64/1024', modulation: 'QPSK',   fec: '64/1024',   rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -8.90, idx: 3 },
  { label: 'MCS4  QPSK  78/1024', modulation: 'QPSK',   fec: '78/1024',   rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -8.00, idx: 4 },
  { label: 'MCS5  QPSK  99/1024', modulation: 'QPSK',   fec: '99/1024',   rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -6.90, idx: 5 },
  { label: 'MCS6  QPSK  120/1024', modulation: 'QPSK',   fec: '120/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -6.00, idx: 6 },
  { label: 'MCS7  QPSK  157/1024', modulation: 'QPSK',   fec: '157/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -4.70, idx: 7 },
  { label: 'MCS8  QPSK  193/1024', modulation: 'QPSK',   fec: '193/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -3.70, idx: 8 },
  { label: 'MCS9  QPSK  251/1024', modulation: 'QPSK',   fec: '251/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -2.50, idx: 9 },
  { label: 'MCS10 QPSK  308/1024', modulation: 'QPSK',   fec: '308/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -1.40, idx: 10 },
  { label: 'MCS11 QPSK  379/1024', modulation: 'QPSK',   fec: '379/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -0.30, idx: 11 },
  { label: 'MCS12 QPSK  449/1024', modulation: 'QPSK',   fec: '449/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  0.60, idx: 12 },
  { label: 'MCS13 QPSK  526/1024', modulation: 'QPSK',   fec: '526/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  1.50, idx: 13 },
  { label: 'MCS14 QPSK  602/1024', modulation: 'QPSK',   fec: '602/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  2.30, idx: 14 },
  { label: 'MCS15 16QAM 340/1024', modulation: '16QAM',  fec: '340/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  3.60, idx: 15 },
  { label: 'MCS16 16QAM 378/1024', modulation: '16QAM',  fec: '378/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  4.30, idx: 16 },
  { label: 'MCS17 16QAM 434/1024', modulation: '16QAM',  fec: '434/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  5.30, idx: 17 },
  { label: 'MCS18 16QAM 490/1024', modulation: '16QAM',  fec: '490/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  6.30, idx: 18 },
  { label: 'MCS19 16QAM 553/1024', modulation: '16QAM',  fec: '553/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  7.30, idx: 19 },
  { label: 'MCS20 16QAM 616/1024', modulation: '16QAM',  fec: '616/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  8.30, idx: 20 },
  { label: 'MCS21 64QAM 438/1024', modulation: '64QAM',  fec: '438/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  9.30, idx: 21 },
  { label: 'MCS22 64QAM 466/1024', modulation: '64QAM',  fec: '466/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  9.90, idx: 22 },
  { label: 'MCS23 64QAM 517/1024', modulation: '64QAM',  fec: '517/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  10.90, idx: 23 },
  { label: 'MCS24 64QAM 567/1024', modulation: '64QAM',  fec: '567/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  12.00, idx: 24 },
  { label: 'MCS25 64QAM 616/1024', modulation: '64QAM',  fec: '616/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  12.90, idx: 25 },
  { label: 'MCS26 64QAM 666/1024', modulation: '64QAM',  fec: '666/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  13.90, idx: 26 },
  { label: 'MCS27 64QAM 719/1024', modulation: '64QAM',  fec: '719/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  15.00, idx: 27 },
  { label: 'MCS28 64QAM 772/1024', modulation: '64QAM',  fec: '772/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  16.00, idx: 28 }
];

// 3GPP NR-NTN · PUSCH 变换预编码表 1 —— TS 38.214 Table 6.1.4.1-1，MCS 0–27（MCS 0/1 分 q=1/q=2 两行）
const NR_NTN_TP1_MODCOD_TABLE = [
  { label: 'MCS0  (q=1) π/2-BPSK 240/1024', modulation: 'BPSK',   fec: '240/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -6.00, idx: 0 },
  { label: 'MCS0  (q=2) QPSK     120/1024', modulation: 'QPSK',   fec: '120/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -6.00, idx: 0 },
  { label: 'MCS1  (q=1) π/2-BPSK 314/1024', modulation: 'BPSK',   fec: '314/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -4.70, idx: 1 },
  { label: 'MCS1  (q=2) QPSK     157/1024', modulation: 'QPSK',   fec: '157/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -4.70, idx: 1 },
  { label: 'MCS2  QPSK  193/1024', modulation: 'QPSK',   fec: '193/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -3.70, idx: 2 },
  { label: 'MCS3  QPSK  251/1024', modulation: 'QPSK',   fec: '251/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -2.50, idx: 3 },
  { label: 'MCS4  QPSK  308/1024', modulation: 'QPSK',   fec: '308/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -1.40, idx: 4 },
  { label: 'MCS5  QPSK  379/1024', modulation: 'QPSK',   fec: '379/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -0.30, idx: 5 },
  { label: 'MCS6  QPSK  449/1024', modulation: 'QPSK',   fec: '449/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  0.60, idx: 6 },
  { label: 'MCS7  QPSK  526/1024', modulation: 'QPSK',   fec: '526/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  1.50, idx: 7 },
  { label: 'MCS8  QPSK  602/1024', modulation: 'QPSK',   fec: '602/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  2.30, idx: 8 },
  { label: 'MCS9  QPSK  679/1024', modulation: 'QPSK',   fec: '679/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  3.00, idx: 9 },
  { label: 'MCS10 16QAM 340/1024', modulation: '16QAM',  fec: '340/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  3.60, idx: 10 },
  { label: 'MCS11 16QAM 378/1024', modulation: '16QAM',  fec: '378/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  4.30, idx: 11 },
  { label: 'MCS12 16QAM 434/1024', modulation: '16QAM',  fec: '434/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  5.30, idx: 12 },
  { label: 'MCS13 16QAM 490/1024', modulation: '16QAM',  fec: '490/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  6.30, idx: 13 },
  { label: 'MCS14 16QAM 553/1024', modulation: '16QAM',  fec: '553/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  7.30, idx: 14 },
  { label: 'MCS15 16QAM 616/1024', modulation: '16QAM',  fec: '616/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  8.30, idx: 15 },
  { label: 'MCS16 16QAM 658/1024', modulation: '16QAM',  fec: '658/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  8.90, idx: 16 },
  { label: 'MCS17 64QAM 466/1024', modulation: '64QAM',  fec: '466/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  9.90, idx: 17 },
  { label: 'MCS18 64QAM 517/1024', modulation: '64QAM',  fec: '517/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  10.90, idx: 18 },
  { label: 'MCS19 64QAM 567/1024', modulation: '64QAM',  fec: '567/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  12.00, idx: 19 },
  { label: 'MCS20 64QAM 616/1024', modulation: '64QAM',  fec: '616/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  12.90, idx: 20 },
  { label: 'MCS21 64QAM 666/1024', modulation: '64QAM',  fec: '666/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  13.90, idx: 21 },
  { label: 'MCS22 64QAM 719/1024', modulation: '64QAM',  fec: '719/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  15.00, idx: 22 },
  { label: 'MCS23 64QAM 772/1024', modulation: '64QAM',  fec: '772/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  16.00, idx: 23 },
  { label: 'MCS24 64QAM 822/1024', modulation: '64QAM',  fec: '822/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  16.90, idx: 24 },
  { label: 'MCS25 64QAM 873/1024', modulation: '64QAM',  fec: '873/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  17.90, idx: 25 },
  { label: 'MCS26 64QAM 910/1024', modulation: '64QAM',  fec: '910/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  18.60, idx: 26 },
  { label: 'MCS27 64QAM 948/1024', modulation: '64QAM',  fec: '948/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  19.30, idx: 27 }
];

// 3GPP NR-NTN · PUSCH 变换预编码表 2（低频谱效率）—— TS 38.214 Table 6.1.4.1-2，MCS 0–27（MCS 0–5 分两行）
const NR_NTN_TP2_MODCOD_TABLE = [
  { label: 'MCS0  (q=1) π/2-BPSK 60/1024', modulation: 'BPSK',   fec: '60/1024',   rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -12.20, idx: 0 },
  { label: 'MCS0  (q=2) QPSK     30/1024', modulation: 'QPSK',   fec: '30/1024',   rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -12.20, idx: 0 },
  { label: 'MCS1  (q=1) π/2-BPSK 80/1024', modulation: 'BPSK',   fec: '80/1024',   rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -11.00, idx: 1 },
  { label: 'MCS1  (q=2) QPSK     40/1024', modulation: 'QPSK',   fec: '40/1024',   rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -11.00, idx: 1 },
  { label: 'MCS2  (q=1) π/2-BPSK 100/1024', modulation: 'BPSK',   fec: '100/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -10.00, idx: 2 },
  { label: 'MCS2  (q=2) QPSK     50/1024', modulation: 'QPSK',   fec: '50/1024',   rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -10.00, idx: 2 },
  { label: 'MCS3  (q=1) π/2-BPSK 128/1024', modulation: 'BPSK',   fec: '128/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -8.90, idx: 3 },
  { label: 'MCS3  (q=2) QPSK     64/1024', modulation: 'QPSK',   fec: '64/1024',   rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -8.90, idx: 3 },
  { label: 'MCS4  (q=1) π/2-BPSK 156/1024', modulation: 'BPSK',   fec: '156/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -8.00, idx: 4 },
  { label: 'MCS4  (q=2) QPSK     78/1024', modulation: 'QPSK',   fec: '78/1024',   rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -8.00, idx: 4 },
  { label: 'MCS5  (q=1) π/2-BPSK 198/1024', modulation: 'BPSK',   fec: '198/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -6.90, idx: 5 },
  { label: 'MCS5  (q=2) QPSK     99/1024', modulation: 'QPSK',   fec: '99/1024',   rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -6.90, idx: 5 },
  { label: 'MCS6  QPSK  120/1024', modulation: 'QPSK',   fec: '120/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -6.00, idx: 6 },
  { label: 'MCS7  QPSK  157/1024', modulation: 'QPSK',   fec: '157/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -4.70, idx: 7 },
  { label: 'MCS8  QPSK  193/1024', modulation: 'QPSK',   fec: '193/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -3.70, idx: 8 },
  { label: 'MCS9  QPSK  251/1024', modulation: 'QPSK',   fec: '251/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -2.50, idx: 9 },
  { label: 'MCS10 QPSK  308/1024', modulation: 'QPSK',   fec: '308/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -1.40, idx: 10 },
  { label: 'MCS11 QPSK  379/1024', modulation: 'QPSK',   fec: '379/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold: -0.30, idx: 11 },
  { label: 'MCS12 QPSK  449/1024', modulation: 'QPSK',   fec: '449/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  0.60, idx: 12 },
  { label: 'MCS13 QPSK  526/1024', modulation: 'QPSK',   fec: '526/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  1.50, idx: 13 },
  { label: 'MCS14 QPSK  602/1024', modulation: 'QPSK',   fec: '602/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  2.30, idx: 14 },
  { label: 'MCS15 QPSK  679/1024', modulation: 'QPSK',   fec: '679/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  3.00, idx: 15 },
  { label: 'MCS16 16QAM 378/1024', modulation: '16QAM',  fec: '378/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  4.30, idx: 16 },
  { label: 'MCS17 16QAM 434/1024', modulation: '16QAM',  fec: '434/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  5.30, idx: 17 },
  { label: 'MCS18 16QAM 490/1024', modulation: '16QAM',  fec: '490/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  6.30, idx: 18 },
  { label: 'MCS19 16QAM 553/1024', modulation: '16QAM',  fec: '553/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  7.30, idx: 19 },
  { label: 'MCS20 16QAM 616/1024', modulation: '16QAM',  fec: '616/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  8.30, idx: 20 },
  { label: 'MCS21 16QAM 658/1024', modulation: '16QAM',  fec: '658/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  8.90, idx: 21 },
  { label: 'MCS22 16QAM 699/1024', modulation: '16QAM',  fec: '699/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  9.50, idx: 22 },
  { label: 'MCS23 16QAM 772/1024', modulation: '16QAM',  fec: '772/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  10.50, idx: 23 },
  { label: 'MCS24 64QAM 567/1024', modulation: '64QAM',  fec: '567/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  12.00, idx: 24 },
  { label: 'MCS25 64QAM 616/1024', modulation: '64QAM',  fec: '616/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  12.90, idx: 25 },
  { label: 'MCS26 64QAM 666/1024', modulation: '64QAM',  fec: '666/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  13.90, idx: 26 },
  { label: 'MCS27 64QAM 772/1024', modulation: '64QAM',  fec: '772/1024',  rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  16.00, idx: 27 }
];

// 3GPP NB-IoT NTN · NPDSCH —— TS 36.213 V17.4.0 / V18.3.0 Table 16.4.1.5.1-1（Rel-14 全表），I_TBS 0–13。
// FEC 码率 = (TBS + 24 bit CRC) / 每传输块编码比特数，按 I_SF = 0、独立 / 保护带部署、2 个 NRS 端口
// 算得分母 304（带内部署为 208，由引擎按当前部署模式与 I_SF 现算，见 ntnPhy.nbCodeRate）。
// ★ 原先这一列写成 TBS/264，264 =（14−3）×12×2 对哪张表都不是分母——编出来的数，不参与计算却上了报表。
// 门限：Kodheli 等 AdHoc-Now 2019 表 3 的 NPDSCH 列（行号是 I_TBS）。
const NB_IOT_NTN_MODCOD_TABLE = [
  { label: 'I_TBS 0 · QPSK · TBS 16', modulation: 'QPSK', fec: '40/304', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  -5.80, idx: 0 },
  { label: 'I_TBS 1 · QPSK · TBS 24', modulation: 'QPSK', fec: '48/304', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  -4.90, idx: 1 },
  { label: 'I_TBS 2 · QPSK · TBS 32', modulation: 'QPSK', fec: '56/304', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  -3.90, idx: 2 },
  { label: 'I_TBS 3 · QPSK · TBS 40', modulation: 'QPSK', fec: '64/304', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  -3.00, idx: 3 },
  { label: 'I_TBS 4 · QPSK · TBS 56', modulation: 'QPSK', fec: '80/304', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  -2.00, idx: 4 },
  { label: 'I_TBS 5 · QPSK · TBS 72', modulation: 'QPSK', fec: '96/304', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  -1.10, idx: 5 },
  { label: 'I_TBS 6 · QPSK · TBS 88', modulation: 'QPSK', fec: '112/304', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  -0.10, idx: 6 },
  { label: 'I_TBS 7 · QPSK · TBS 104', modulation: 'QPSK', fec: '128/304', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:   0.60, idx: 7 },
  { label: 'I_TBS 8 · QPSK · TBS 120', modulation: 'QPSK', fec: '144/304', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:   1.30, idx: 8 },
  { label: 'I_TBS 9 · QPSK · TBS 136', modulation: 'QPSK', fec: '160/304', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:   2.20, idx: 9 },
  { label: 'I_TBS 10 · QPSK · TBS 144', modulation: 'QPSK', fec: '168/304', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:   3.10, idx: 10 },
  { label: 'I_TBS 11 · QPSK · TBS 176', modulation: 'QPSK', fec: '200/304', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:   4.20, idx: 11 },
  { label: 'I_TBS 12 · QPSK · TBS 208', modulation: 'QPSK', fec: '232/304', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:   5.50, idx: 12 },
  { label: 'I_TBS 13 · QPSK · TBS 224', modulation: 'QPSK', fec: '248/304', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:   6.90, idx: 13 }
];

// 3GPP NB-IoT NTN · NPUSCH 多音（3/6/12 子载波）—— TS 36.213 V17.4.0 / V18.3.0 Table 16.5.1.2-2
// （Rel-14 全表），I_TBS 0–13。FEC 码率分母 288：一个 RU 无论 3/6/12 子载波都是 144 RE × QPSK
// （TS 36.211 Table 10.1.2.3-1 与 10.1.4.2-1，每时隙 7 符号扣 1 个 DMRS 符号）。
const NB_IOT_NTN_MT_MODCOD_TABLE = [
  { label: 'I_TBS 0 · QPSK · TBS 16', modulation: 'QPSK', fec: '40/288', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  -5.80, idx: 0 },
  { label: 'I_TBS 1 · QPSK · TBS 24', modulation: 'QPSK', fec: '48/288', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  -4.90, idx: 1 },
  { label: 'I_TBS 2 · QPSK · TBS 32', modulation: 'QPSK', fec: '56/288', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  -3.90, idx: 2 },
  { label: 'I_TBS 3 · QPSK · TBS 40', modulation: 'QPSK', fec: '64/288', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  -3.00, idx: 3 },
  { label: 'I_TBS 4 · QPSK · TBS 56', modulation: 'QPSK', fec: '80/288', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  -2.00, idx: 4 },
  { label: 'I_TBS 5 · QPSK · TBS 72', modulation: 'QPSK', fec: '96/288', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  -1.10, idx: 5 },
  { label: 'I_TBS 6 · QPSK · TBS 88', modulation: 'QPSK', fec: '112/288', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  -0.20, idx: 6 },
  { label: 'I_TBS 7 · QPSK · TBS 104', modulation: 'QPSK', fec: '128/288', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:   0.70, idx: 7 },
  { label: 'I_TBS 8 · QPSK · TBS 120', modulation: 'QPSK', fec: '144/288', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:   1.40, idx: 8 },
  { label: 'I_TBS 9 · QPSK · TBS 136', modulation: 'QPSK', fec: '160/288', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:   2.20, idx: 9 },
  { label: 'I_TBS 10 · QPSK · TBS 144', modulation: 'QPSK', fec: '168/288', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:   3.10, idx: 10 },
  { label: 'I_TBS 11 · QPSK · TBS 176', modulation: 'QPSK', fec: '200/288', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:   4.20, idx: 11 },
  { label: 'I_TBS 12 · QPSK · TBS 208', modulation: 'QPSK', fec: '232/288', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:   5.50, idx: 12 },
  { label: 'I_TBS 13 · QPSK · TBS 224', modulation: 'QPSK', fec: '248/288', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:   6.90, idx: 13 }
];

// 3GPP NB-IoT NTN · NPUSCH 单音（15 / 3.75 kHz）—— TS 36.213 Table 16.5.1.2-1 的 I_MCS 0–10。
// ★ 行按 I_TBS 升序排（I_MCS 1 与 2 的 I_TBS 是反的：1→I_TBS 2、2→I_TBS 1），照 I_MCS 排门限就不单调。
// 单音的意义在噪声带宽：15 kHz 比 12 音的 180 kHz 小 10.8 dB、3.75 kHz 小 16.8 dB，
// 这是 IoT-NTN 上行闭合链路的核心手段（与重复次数一起用）。
// FEC 码率 = (TBS + 24 bit CRC) / (96 × Qm)：一个 RU 是 16 时隙 × 6 符号 × 1 子载波 = 96 RE。
const NB_IOT_NTN_ST_MODCOD_TABLE = [
  { label: 'I_MCS 0 · π/2-BPSK · TBS 16', modulation: 'BPSK', fec: '40/96', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  -4.20, idx: 0 },
  { label: 'I_MCS 2 · π/4-QPSK · TBS 24', modulation: 'QPSK', fec: '48/192', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  -3.20, idx: 2 },
  { label: 'I_MCS 1 · π/2-BPSK · TBS 32', modulation: 'BPSK', fec: '56/96', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  -2.20, idx: 1 },
  { label: 'I_MCS 3 · π/4-QPSK · TBS 40', modulation: 'QPSK', fec: '64/192', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  -1.20, idx: 3 },
  { label: 'I_MCS 4 · π/4-QPSK · TBS 56', modulation: 'QPSK', fec: '80/192', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:  -0.10, idx: 4 },
  { label: 'I_MCS 5 · π/4-QPSK · TBS 72', modulation: 'QPSK', fec: '96/192', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:   0.90, idx: 5 },
  { label: 'I_MCS 6 · π/4-QPSK · TBS 88', modulation: 'QPSK', fec: '112/192', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:   1.90, idx: 6 },
  { label: 'I_MCS 7 · π/4-QPSK · TBS 104', modulation: 'QPSK', fec: '128/192', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:   3.10, idx: 7 },
  { label: 'I_MCS 8 · π/4-QPSK · TBS 120', modulation: 'QPSK', fec: '144/192', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:   4.30, idx: 8 },
  { label: 'I_MCS 9 · π/4-QPSK · TBS 136', modulation: 'QPSK', fec: '160/192', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:   5.60, idx: 9 },
  { label: 'I_MCS 10 · π/4-QPSK · TBS 144', modulation: 'QPSK', fec: '168/192', rsCode: '1', bandwidthFactor: 1, noiseRatioMode: 'snr', threshold:   6.90, idx: 10 }
];

// 每张 3GPP 表的条件元数据：门限那一列在什么条件下成立。只进 title，不进版面。
// 用户自建标准可在「文件管理 · MODCOD 表」的标准头上自己填（厂家给表时把条件一起录进来）。
const NTN_TABLE_META = {
  '3GPP NR-NTN':                { bler: 0.1, channel: 'AWGN', block: '≥3000 bit', rep: 1, snrRef: 'perRE', source: 'UC3M/York VTC2024-Fall 表 II + Fluid-Antenna arXiv 2503.05384 表 II 拟合' },
  '3GPP NR-NTN T2':             { bler: 0.1, channel: 'AWGN', block: '≥3000 bit', rep: 1, snrRef: 'perRE', source: '同表 1 的拟合式外推到 256QAM' },
  '3GPP NR-NTN T3':             { bler: 0.1, channel: 'AWGN', block: '≥3000 bit', rep: 1, snrRef: 'perRE', source: '同表 1 的拟合式；R ≤ 99/1024 各档为外推' },
  '3GPP NR-NTN TP1':            { bler: 0.1, channel: 'AWGN', block: '≥3000 bit', rep: 1, snrRef: 'perRE', source: '同表 1 的拟合式；π/2-BPSK 用 QPSK 的 gap（同频谱效率）' },
  '3GPP NR-NTN TP2':            { bler: 0.1, channel: 'AWGN', block: '≥3000 bit', rep: 1, snrRef: 'perRE', source: '同表 3' },
  '3GPP NB-IoT NTN':            { bler: 0.1, channel: 'AWGN', block: '每档最大吞吐 TBS', rep: 1, snrRef: 'perRE', source: 'Kodheli 等 AdHoc-Now 2019 表 3（NPDSCH 列，行号 = I_TBS）；TBS 表 TS 36.213 V17.4.0 Table 16.4.1.5.1-1' },
  '3GPP NB-IoT NTN NPUSCH MT':  { bler: 0.1, channel: 'AWGN', block: '每档最大吞吐 TBS', rep: 1, snrRef: 'perRE', source: 'Kodheli 等 AdHoc-Now 2019 表 3（NPUSCH 多音列，行号 = I_TBS）；TBS 表 TS 36.213 V17.4.0 Table 16.5.1.2-2' },
  '3GPP NB-IoT NTN NPUSCH ST':  { bler: 0.1, channel: 'AWGN', block: '每档最大吞吐 TBS', rep: 1, snrRef: 'perRE', source: 'Kodheli 等 AdHoc-Now 2019 表 3（NPUSCH 单音列）' }
};

// 内置标准 key → MODCOD 表。选标准 / 载入配置 / 历史回放三处共用这一张，免得各写一遍 if 链
// 漏掉新表（原先 index.js 里两处 if 链各写一份，加一张表就要改两处）。
const MODCOD_TABLE_OF = {
  'DVB-S': DVBS_MODCOD_TABLE,
  'DVB-S2': DVBS2_MODCOD_TABLE,
  'DVB-RCS2': DVB_RCS2_MODCOD_TABLE,
  'DVB-S2X': DVBS2X_MODCOD_TABLE,
  '3GPP NR-NTN': NR_NTN_MODCOD_TABLE,
  '3GPP NR-NTN T2': NR_NTN_T2_MODCOD_TABLE,
  '3GPP NR-NTN T3': NR_NTN_T3_MODCOD_TABLE,
  '3GPP NR-NTN TP1': NR_NTN_TP1_MODCOD_TABLE,
  '3GPP NR-NTN TP2': NR_NTN_TP2_MODCOD_TABLE,
  '3GPP NB-IoT NTN': NB_IOT_NTN_MODCOD_TABLE,
  '3GPP NB-IoT NTN NPUSCH MT': NB_IOT_NTN_MT_MODCOD_TABLE,
  '3GPP NB-IoT NTN NPUSCH ST': NB_IOT_NTN_ST_MODCOD_TABLE
};

// 3GPP 标准 key → 该体制的物理层描述子缺省值（选中这个标准时给载波表单铺的初值）。
// 与仿真平台 packages/core/utils/modcodTables.js 的 PHY_OF 逐字一致 —— 两边配同一条载波必须
// 落在同一组缺省上，否则「电脑上算 4.2 dB、手机上算 4.7 dB」而参数看上去一模一样。
//
// 取值都是「最常见的那一档」：NR 下行 = 5 MHz@15 kHz 整载波（25 PRB），NR 上行 = 一个终端的 1 PRB
// 分配；NB-IoT 下行 = 整个 180 kHz 载波（12 子载波），上行多音 = 满 12 音、单音 = 1 音。重复次数从 1 起。
// 符号数：下行留 2 个符号给 PDCCH（12 个），上行 14 个；DMRS 都按 12 RE。
// band 缺省 n256（S 频段，TR 38.821 的基线频段）—— 它决定该子载波间隔可选的信道带宽档。
//
// ★ st = 这张表的行号口径与子载波数是不是被标准锁死的（见 utils/ntnPhy.js 的 normalizePhy）：
//   NPDSCH 没有单音/多音之分记 null；NPUSCH 多音表 false（3/6/12 子载波、恒 15 kHz、行号 = I_TBS）；
//   单音表 true（恒 1 子载波、行号 = I_MCS，要经 Table 16.5.1.2-1 映射）。不锁的话，选了单音表再把
//   子载波数改成 12，门限还是单音那一列（高 1.6~3.8 dB），而 I_MCS 又被当 I_TBS 直读。
const NTN_PHY_OF = {
  '3GPP NR-NTN': { kind: 'nr', dir: 'dl', band: 'n256', mcsTable: 't1', scs: 15, chBwMHz: 5, nRb: 25, nSymb: 12, nDmrs: 12, nOh: 0, rateModel: 'tbs', layers: 1, nRep: 1, combLossDb: 0 },
  '3GPP NR-NTN T2': { kind: 'nr', dir: 'dl', band: 'n256', mcsTable: 't2', scs: 15, chBwMHz: 5, nRb: 25, nSymb: 12, nDmrs: 12, nOh: 0, rateModel: 'tbs', layers: 1, nRep: 1, combLossDb: 0 },
  '3GPP NR-NTN T3': { kind: 'nr', dir: 'dl', band: 'n256', mcsTable: 't3', scs: 15, chBwMHz: 5, nRb: 25, nSymb: 12, nDmrs: 12, nOh: 0, rateModel: 'tbs', layers: 1, nRep: 1, combLossDb: 0 },
  '3GPP NR-NTN TP1': { kind: 'nr', dir: 'ul', band: 'n256', mcsTable: 'tp1', scs: 15, chBwMHz: null, nRb: 1, nSymb: 14, nDmrs: 12, nOh: 0, rateModel: 'tbs', layers: 1, q: 2, nRep: 1, combLossDb: 0 },
  '3GPP NR-NTN TP2': { kind: 'nr', dir: 'ul', band: 'n256', mcsTable: 'tp2', scs: 15, chBwMHz: null, nRb: 1, nSymb: 14, nDmrs: 12, nOh: 0, rateModel: 'tbs', layers: 1, q: 2, nRep: 1, combLossDb: 0 },
  '3GPP NB-IoT NTN': { kind: 'nbiot', dir: 'dl', st: null, opMode: 'standalone', scs: 15, nTones: 12, iTbs: 0, iSf: 0, nRep: 1, combLossDb: 0 },
  '3GPP NB-IoT NTN NPUSCH MT': { kind: 'nbiot', dir: 'ul', st: false, opMode: 'standalone', scs: 15, nTones: 12, iTbs: 0, iRu: 0, nRep: 1, combLossDb: 0 },
  '3GPP NB-IoT NTN NPUSCH ST': { kind: 'nbiot', dir: 'ul', st: true, opMode: 'standalone', scs: 15, nTones: 1, iTbs: 0, iRu: 0, nRep: 1, combLossDb: 0 }
};

// 这个标准走不走 3GPP 那条链（门限口径 snr + 占用带宽由 phy 算）
function isNtnStandard(key) {
  return Object.prototype.hasOwnProperty.call(NTN_PHY_OF, String(key == null ? '' : key));
}

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
  modFactorOf,
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
  NR_NTN_T2_MODCOD_TABLE,
  NR_NTN_T3_MODCOD_TABLE,
  NR_NTN_TP1_MODCOD_TABLE,
  NR_NTN_TP2_MODCOD_TABLE,
  NB_IOT_NTN_MODCOD_TABLE,
  NB_IOT_NTN_MT_MODCOD_TABLE,
  NB_IOT_NTN_ST_MODCOD_TABLE,
  NTN_TABLE_META,
  MODCOD_TABLE_OF,
  NTN_PHY_OF,
  isNtnStandard,
  P838_TABLE,
  CONSTANTS,
  RESULT_LABELS
};

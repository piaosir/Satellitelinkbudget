// 3GPP NTN 载波的物理层口径（纯函数，平台无关）——占用带宽 / 信道带宽 / TBS / 信息速率 / 含重复的有效门限。
// ★★ 本文件是仿真平台 packages/core/utils/ntnPhy.js 的【逐字副本】，一个字都不要在这边改。
//   要改先改平台那份（那里有 ntnPhy.test.mjs 的对拍向量守着），再整份 cp 过来。
//   两边算的必须是同一个数：同一条 3GPP 载波在电脑上和手机上出不同的门限，比两边都算错更难查。
//   小程序不引 require，本文件自包含，故可原样复制。
//
//
// 由来：平台原先把 3GPP 的两张 MODCOD 表塞进 DVB 那条链算（信息速率 →÷帧效率÷FEC→ 符号率 →×滚降→ 载波带宽），
// 于是「噪声带宽」是由用户填的信息速率和一个经验帧效率 0.9 反推出来的数，PRB 数与子载波间隔在平台里根本不存在。
// 厂家/3GPP 谈的 SNR 不是这个：
//
//   TS 38.215 §5.1.6 的 SS-SINR / CSI-SINR 按【资源元素 RE】定义；MATLAB 5G Toolbox 的链路级仿真
//   （"SNR Definition Used in Link Simulations"）同样 SNR = S_RE / N_RE；gNB 从 DMRS 估出来的 PUSCH SNR、
//   模组 AT 指令回的 SNR 也都是这一口径。
//
//   对 OFDM：信号功率均摊在 N_sc = N_RB×12 个子载波上，S_RE = C / N_sc；每 RE 噪声 N_RE = N₀·SCS；
//   于是 SNR_RE = C / (N₀ · N_RB·12·SCS) = C / (N₀ · B_occ)。又 Es = S_RE/SCS，故 Es/N₀ ≡ SNR_RE。
//   ★ 三者是同一个数，前提只有一条：噪声带宽取【占用带宽 B_occ = N_RB × 12 × SCS】
//     （NB-IoT 上行 = 子载波数 × SCS）。CP 被接收端丢掉、DMRS 不载数据，这些只进 Eb/N₀，不进 SNR。
//
// 所以改法不是「加一个换算系数」，而是让 3GPP 载波按 PRB / SCS / MCS / 重复描述，噪声带宽 = 占用带宽，
// SNR 自然就对上。旧链按帧效率 0.9 反推符号率，比厂家口径高 0.50 dB（下行 OH 0.14）/ 0.20 dB（上行 OH 0.08）。
//
// 出处：TS 38.214 §5.1.3.1 / §5.1.3.2 / §6.1.4.1（MCS 表与 TBS）、TS 38.215 §5.1.6（SINR 定义）、
//       TS 38.306 §4.1.2（速率近似式与 OH）、TS 38.101-5（信道带宽 ↔ N_RB）、
//       TS 36.213 §16.4.1.5 / §16.5.1.2（NB-IoT TBS 与单音 I_MCS 映射）、TR 38.821 / TR 36.763（NTN 链路预算）。
//
// ★ 本文件是【真值】；渲染端 src/shared/ntnPhy.js 是逐值手写副本（载波面板要实时算，走 IPC 问不现实）。
//   两份必须逐条一致，packages/core/test/ntnPhy.test.mjs 拿同一组向量对拍，改一处必须改另一处。

// ===== 子载波间隔 → numerology μ（时隙长度 = 1 ms / 2^μ）=====
const MU_OF = { 15: 0, 30: 1, 60: 2, 120: 3 }

// ===== 信道带宽(MHz) → N_RB（TS 38.101-5 V19.5.0 Table 5.3.2-1 / 5.3.2-2）=====
// * FR1 与 FR2 必须【分成两张】：同一个 60 kHz / 50 MHz，FR1-NTN 是 65 RB、FR2-NTN 是 66 RB。
//   合成一张表就是同一个键两个值，谁后写谁赢。
const NR_RB_FR1 = {
  15: { 3: 15, 5: 25, 10: 52, 15: 79, 20: 106, 25: 133, 30: 160, 35: 188, 50: 270 },
  30: { 5: 11, 10: 24, 15: 38, 20: 51, 25: 65, 30: 78, 35: 92, 50: 133, 70: 189, 100: 273 },
  60: { 10: 11, 15: 18, 20: 24, 25: 31, 30: 38, 35: 44, 50: 65, 70: 93, 100: 135 }
}
const NR_RB_FR2 = {
  60: { 50: 66, 100: 132, 200: 264 },
  120: { 50: 32, 100: 66, 200: 132, 400: 264 }
}

// ===== NTN 频段 -> 频率范围与逐频段信道带宽档 =====
// 出处：TS 38.101-5 V19.5.0 Table 5.2.2-1（FR1 频段）、5.2.3-1（FR2 频段）、5.3.5-1 / 5.3.5-2（逐频段带宽）。
// 为什么要逐频段：N_RB 表（5.3.2-1）只说「这个带宽在这个子载波间隔下是多少 PRB」，【哪个频段允许哪几档】
// 是另一张表（5.3.5-1）。只看前者，5 MHz@30 kHz、n254 的 20 MHz 这些标准里没有的载波都配得出来。
// * 30 MHz：V18.6.0 / V18.11.0 / V19.5.0 三版的 5.3.5-1 逐频段一栏【没有任何频段有 30 MHz】，
//   只有表头那一列带 NOTE（SAN 侧部署须先补齐射频与解调要求）。CR 0033「Adding 30 MHz CBW for NTN UE」
//   只往 5.3.2-1 加了 N_RB 列（160/78/38）。故本表不给任何频段 30 MHz —— 平台早先「Rel-18 为 n255
//   增加 30 MHz」的说法不成立，已删。
// optional = 本版标记为可选（NOTE 2）；dlOnly = 只用于下行（NOTE 3）。
const NTN_BANDS = {
  // —— FR1-NTN（L / S / Ku）——
  n256: { fr: 1, ul: [1980, 2010], dl: [2170, 2200],
    bw: { 15: [{ mhz: 3, optional: true }, { mhz: 5 }, { mhz: 10 }, { mhz: 15 }, { mhz: 20 }], 30: [{ mhz: 10 }, { mhz: 15 }, { mhz: 20 }], 60: [{ mhz: 10 }, { mhz: 15 }, { mhz: 20 }] } },
  n255: { fr: 1, ul: [1626.5, 1660.5], dl: [1525, 1559],
    bw: { 15: [{ mhz: 3, optional: true }, { mhz: 5 }, { mhz: 10 }, { mhz: 15 }, { mhz: 20 }], 30: [{ mhz: 10 }, { mhz: 15 }, { mhz: 20 }], 60: [{ mhz: 10 }, { mhz: 15 }, { mhz: 20 }] } },
  n254: { fr: 1, ul: [1610, 1626.5], dl: [2483.5, 2500],
    bw: { 15: [{ mhz: 3, optional: true }, { mhz: 5 }, { mhz: 10 }, { mhz: 15 }], 30: [{ mhz: 10 }, { mhz: 15 }], 60: [{ mhz: 10 }, { mhz: 15 }] } },
  n253: { fr: 1, ul: [1668, 1675], dl: [1518, 1525], bw: { 15: [{ mhz: 5 }] } },
  n252: { fr: 1, ul: [2000, 2020], dl: [2180, 2200],
    bw: { 15: [{ mhz: 5 }, { mhz: 10 }, { mhz: 15 }, { mhz: 20 }], 30: [{ mhz: 10 }, { mhz: 15 }, { mhz: 20 }], 60: [{ mhz: 10 }, { mhz: 15 }, { mhz: 20 }] } },
  n251: { fr: 1, ul: [1626.5, 1660.5], dl: [1518, 1559],
    bw: { 15: [{ mhz: 5 }, { mhz: 10 }, { mhz: 15 }, { mhz: 20 }], 30: [{ mhz: 10 }, { mhz: 15 }, { mhz: 20 }], 60: [{ mhz: 10 }, { mhz: 15 }, { mhz: 20 }] } },
  n250: { fr: 1, ul: [1668, 1675], dl: [1518, 1559],
    bw: { 15: [{ mhz: 5 }, { mhz: 10, dlOnly: true }, { mhz: 15, dlOnly: true }, { mhz: 20, dlOnly: true }],
      30: [{ mhz: 10, dlOnly: true }, { mhz: 15, dlOnly: true }, { mhz: 20, dlOnly: true }],
      60: [{ mhz: 10, dlOnly: true }, { mhz: 15, dlOnly: true }, { mhz: 20, dlOnly: true }] } },
  // Ku：n248 / n247 的下行 Region 2 限 10700-12700、美国 Mobile VSAT 限 10700-12200（本表按全球上限收）
  n248: { fr: 1, ul: [14000, 14500], dl: [10700, 12750],
    bw: { 15: [{ mhz: 10 }, { mhz: 15 }, { mhz: 25 }, { mhz: 35 }, { mhz: 50 }], 30: [{ mhz: 10 }, { mhz: 20 }, { mhz: 25 }, { mhz: 35 }, { mhz: 50 }, { mhz: 70 }, { mhz: 100 }] } },
  n247: { fr: 1, ul: [13750, 14000], dl: [10700, 12750],
    bw: { 15: [{ mhz: 10 }, { mhz: 15 }, { mhz: 25 }, { mhz: 35 }, { mhz: 50 }], 30: [{ mhz: 10 }, { mhz: 20 }, { mhz: 25 }, { mhz: 35 }, { mhz: 50 }, { mhz: 70 }, { mhz: 100 }] } },
  // —— FR2-NTN（Ka / Ku）——
  n512: { fr: 2, ul: [27500, 30000], dl: [17300, 20200],
    bw: { 60: [{ mhz: 50 }, { mhz: 100 }, { mhz: 200, optional: true }], 120: [{ mhz: 50 }, { mhz: 100 }, { mhz: 200, optional: true }, { mhz: 400, optional: true }] } },
  n511: { fr: 2, ul: [28350, 30000], dl: [17300, 20200],
    bw: { 60: [{ mhz: 50 }, { mhz: 100 }, { mhz: 200, optional: true }], 120: [{ mhz: 50 }, { mhz: 100 }, { mhz: 200, optional: true }, { mhz: 400, optional: true }] } },
  n510: { fr: 2, ul: [27500, 28350], dl: [17300, 20200],
    bw: { 60: [{ mhz: 50 }, { mhz: 100 }, { mhz: 200, optional: true }], 120: [{ mhz: 50 }, { mhz: 100 }, { mhz: 200, optional: true }, { mhz: 400, optional: true }] } },
  n509: { fr: 2, ul: [14000, 14500], dl: [10700, 12750],
    bw: { 120: [{ mhz: 50 }, { mhz: 100 }, { mhz: 200, optional: true }, { mhz: 400, optional: true }] } },
  n508: { fr: 2, ul: [13750, 14000], dl: [10700, 12750],
    bw: { 120: [{ mhz: 50 }, { mhz: 100 }, { mhz: 200, optional: true }, { mhz: 400, optional: true, dlOnly: true }] } }
}

// 各 FR 出现过的信道带宽档（清单，供文案与老式判据引用；【不是】某一个频段的可选档）
const NR_FR1_BW_MHZ = [3, 5, 10, 15, 20, 25, 35, 50, 70, 100]
const NR_FR2_BW_MHZ = [50, 100, 200, 400]

// ===== TS 38.214 Table 5.1.3.2-1：N_info ≤ 3824 时的 TBS 量化表（93 档）=====
const TBS_QUANT = [
  24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120, 128, 136, 144, 152, 160, 168, 176,
  184, 192, 208, 224, 240, 256, 272, 288, 304, 320, 336, 352, 368, 384, 408, 432, 456, 480,
  504, 528, 552, 576, 608, 640, 672, 704, 736, 768, 808, 848, 888, 928, 984, 1032, 1064,
  1128, 1160, 1192, 1224, 1256, 1288, 1320, 1352, 1416, 1480, 1544, 1608, 1672, 1736, 1800,
  1864, 1928, 2024, 2088, 2152, 2216, 2280, 2408, 2472, 2536, 2600, 2664, 2728, 2792, 2856,
  2976, 3104, 3240, 3368, 3496, 3624, 3752, 3824
]

// ===== NB-IoT TBS 表（TS 36.213 V17.4.0 = V18.3.0，Rel-14 全表）=====
// 行 = I_TBS 0-13，列 = I_SF / I_RU 0-7（对应 N_SF / N_RU = 1,2,3,4,5,6,8,10）。Rel-14 起没有空格：
// Cat-NB2 把 Rel-13 表里那 32 个空档全填上，并加了第 13 行；Rel-13 的每一格原值不变
//（上行 (6,7) 仍是 1000、(7,5) 仍是 712）。IoT-NTN 的商用模组几乎全是 Cat-NB2，收 Rel-13 截断表
// 等于把一半档位判成「算不出」。
// * (I_TBS 13, I_SF/I_RU 3) 这一格：V14.2.0 印的是 1128，V17.4.0 / V18.3.0 都是 1032 —— 以新版为准。
//   下一个人对着 Rel-14 老文本核这一格时别改回 1128。
// 出处：Table 16.4.1.5.1-1（NPDSCH）、Table 16.5.1.2-2（NPUSCH）。
// I_TBS 范围（§16.4.1.5.1 / §16.5.1.2）：NPDSCH 带内部署 0-10、独立 / 保护带 0-13；NPUSCH 0-13。
// 16QAM 档（Rel-17，I_TBS 14-21）未收。
const NB_TBS_DL = [   // NPDSCH Table 16.4.1.5.1-1
  [16, 32, 56, 88, 120, 152, 208, 256],
  [24, 56, 88, 144, 176, 208, 256, 344],
  [32, 72, 144, 176, 208, 256, 328, 424],
  [40, 104, 176, 208, 256, 328, 440, 568],
  [56, 120, 208, 256, 328, 408, 552, 680],
  [72, 144, 224, 328, 424, 504, 680, 872],
  [88, 176, 256, 392, 504, 600, 808, 1032],
  [104, 224, 328, 472, 584, 680, 968, 1224],
  [120, 256, 392, 536, 680, 808, 1096, 1352],
  [136, 296, 456, 616, 776, 936, 1256, 1544],
  [144, 328, 504, 680, 872, 1032, 1384, 1736],
  [176, 376, 584, 776, 1000, 1192, 1608, 2024],
  [208, 440, 680, 904, 1128, 1352, 1800, 2280],
  [224, 488, 744, 1032, 1256, 1544, 2024, 2536]
]
const NB_TBS_UL = [   // NPUSCH Table 16.5.1.2-2
  [16, 32, 56, 88, 120, 152, 208, 256],
  [24, 56, 88, 144, 176, 208, 256, 344],
  [32, 72, 144, 176, 208, 256, 328, 424],
  [40, 104, 176, 208, 256, 328, 440, 568],
  [56, 120, 208, 256, 328, 408, 552, 680],
  [72, 144, 224, 328, 424, 504, 680, 872],
  [88, 176, 256, 392, 504, 600, 808, 1000],
  [104, 224, 328, 472, 584, 712, 1000, 1224],
  [120, 256, 392, 536, 680, 808, 1096, 1384],
  [136, 296, 456, 616, 776, 936, 1256, 1544],
  [144, 328, 504, 680, 872, 1000, 1384, 1736],
  [176, 376, 584, 776, 1000, 1192, 1608, 2024],
  [208, 440, 680, 1000, 1128, 1352, 1800, 2280],
  [224, 488, 744, 1032, 1256, 1544, 2024, 2536]
]
// 每传输块的编码比特数（「有效码率」那一列的分母；按 TS 36.211 的结构算，不是拍出来的数）：
//   NPDSCH  一子帧 14 符号 x 12 子载波 = 168 RE，减 NRS（§10.2.6.2：每时隙末两个符号、每符号 2 RE
//           -> 每端口每子帧 8 RE；2 个端口时另一端口的 NRS 位置也不载数据 -> 16 RE）= 152 RE
//           -> 304 bit（QPSK，独立 / 保护带部署，l_DataStart = 0）。带内部署 l_DataStart = 3 再扣
//           CRS：11x12 - 16 - 12 = 104 RE -> 208 bit（TS 36.213 §16.4.1.4）。
//   NPUSCH 多音 一个 RU 无论 3/6/12 子载波都是 144 RE（12 子载波 2 时隙、6 子载波 4 时隙、
//           3 子载波 8 时隙，每时隙 7 符号扣 1 个 DMRS 符号，Table 10.1.4.2-1）-> 288 bit（QPSK）。
//   NPUSCH 单音 16 时隙 x 6 符号 x 1 子载波 = 96 RE -> 96 bit（pi/2-BPSK）/ 192 bit（pi/4-QPSK）。
// 分子含 24 bit CRC —— 与 NR 的 R 同口径（N_info = N_RE·R·Qm ≈ TBS + CRC）。
// * 原先三张表的 fec 列一律写成 TBS/264，264 =（14−3）x12x2 对哪张表都不是分母：编出来的数。
const NB_CODED_BITS = { dlStandalone: 304, dlInband: 208, ulMulti: 288, ulSingle: 96 }
const NB_CRC_BITS = 24
const NB_SF_COUNT = [1, 2, 3, 4, 5, 6, 8, 10]   // I_SF / I_RU → N_SF / N_RU

// NPUSCH 单音 Table 16.5.1.2-1：I_MCS → (调制, I_TBS)。
// π/2-BPSK 在平台调制体系里记作 BPSK（M-PSK, M=2）、π/4-QPSK 记作 QPSK —— 相位旋转只影响 PAPR，
// 不影响 bit/符号，故调制因子一致。
const NB_ST_MCS = [
  { modulation: 'BPSK', label: 'pi/2-BPSK', iTbs: 0 },
  { modulation: 'BPSK', label: 'pi/2-BPSK', iTbs: 2 },
  { modulation: 'QPSK', label: 'pi/4-QPSK', iTbs: 1 },
  { modulation: 'QPSK', label: 'pi/4-QPSK', iTbs: 3 },
  { modulation: 'QPSK', label: 'pi/4-QPSK', iTbs: 4 },
  { modulation: 'QPSK', label: 'pi/4-QPSK', iTbs: 5 },
  { modulation: 'QPSK', label: 'pi/4-QPSK', iTbs: 6 },
  { modulation: 'QPSK', label: 'pi/4-QPSK', iTbs: 7 },
  { modulation: 'QPSK', label: 'pi/4-QPSK', iTbs: 8 },
  { modulation: 'QPSK', label: 'pi/4-QPSK', iTbs: 9 },
  { modulation: 'QPSK', label: 'pi/4-QPSK', iTbs: 10 }
]

// ===== 重复次数 N_rep 的值域 =====
// NB-IoT 是【枚举】不是任意整数：填 3 或 5000 照算的话，门限按 10lg N 白降下来，
// 配出来的是网络根本下发不了的重复次数。TS 36.213 Table 16.4.1.3-2（NPDSCH）与 16.5.1.1-3（NPUSCH）。
const NB_NREP_DL = [1, 2, 4, 8, 16, 32, 64, 128, 192, 256, 384, 512, 768, 1024, 1536, 2048]
const NB_NREP_UL = [1, 2, 4, 8, 16, 32, 64, 128]
// NR 只判上限（档位随版本增补，卡死枚举会把合法配置误判成错）。2026-09-06 逐条核 TS 38.331 V17.5.0：
//   PDSCH：repetitionNumber-r16 / -v1730 = {n2,n3,n4,n5,n6,n7,n8,n16}、pdsch-AggregationFactor = {n2,n4,n8}
//          → 上限 16。
//   PUSCH：numberOfRepetitionsExt-r17 = {n1,n2,n3,n4,n7,n8,n12,n16}（★ 到 16，不是 32——原任务书把它
//          写成 n32 了）、pusch-AggregationFactor = {n2,n4,n8}；到 n32 的是同一个扩展组里的
//          numberOfSlotsTBoMS-r17（一个传输块跨多个时隙），它在链路预算上与重复同效——门限 −10lg N、
//          速率 ÷ N，故上行上限仍按 32 收，不把 Rel-17 覆盖增强的这一档挡在外面。
const NR_NREP_MAX_UL = 32
const NR_NREP_MAX_DL = 16

// 这条载波落在 FR1 还是 FR2。* 判据是【频段】不是子载波间隔：60 kHz 两个 FR 都有
// （n256 等的 60 kHz 在 FR1，n510-n512 的 60 kHz 在 FR2），按 scs >= 120 判会让 Ka 的 60 kHz
// 配置拿到 FR1 的 N_RB 表与开销系数。没指定频段时只能退回子载波间隔判（120 kHz 只在 FR2）。
function frOf(phy) {
  const b = NTN_BANDS[phy && phy.band]
  if (b) return b.fr
  return Number(phy && phy.scs) >= 120 ? 2 : 1
}

// ===== TS 38.306 §4.1.2 的开销系数 OH（近似速率式用）=====
// FR1 下行 0.14 / 上行 0.08；FR2 下行 0.18 / 上行 0.10。
function ohOf(phy) {
  const fr2 = frOf(phy) === 2
  return phy.dir === 'ul' ? (fr2 ? 0.10 : 0.08) : (fr2 ? 0.18 : 0.14)
}

// 一个资源单元 RU 的时长(ms)：子载波数 + SCS 决定（TS 36.211 Table 10.1.2.3-1）
function nbRuMs(phy) {
  if (Number(phy.scs) === 3.75) return 32
  const t = Number(phy.nTones)
  if (t === 1) return 8
  if (t === 3) return 4
  if (t === 6) return 2
  return 1                                       // 12 子载波
}

const numOr = (v, d) => { const n = Number(v); return isFinite(n) ? n : d }
const intOr = (v, d) => { const n = Math.round(Number(v)); return isFinite(n) ? n : d }

// ===== 载波描述子归一化 =====
// 认不出（非 3GPP 载波、或 kind 不对）一律返回 null —— 引擎据此判「这条不是 snr 行」。
// ★ 入参可能是 IPC 过来的纯数据，也可能是渲染端的响应式代理；本函数只读不写，返回全新纯对象。
function normalizePhy(p) {
  if (!p || typeof p !== 'object') return null
  const kind = String(p.kind || '').toLowerCase()
  const dir = String(p.dir || '').toLowerCase() === 'ul' ? 'ul' : 'dl'
  const nRep = Math.max(1, intOr(p.nRep, 1))
  const combLossDb = numOr(p.combLossDb, 0)
  // 门限那一列的目标 BLER（3GPP 各表恒 10% 首传）。缺省 0.1：老配置没有这个字段，回显 10% 即实情。
  const bt = Number(p.blerTarget)
  const blerTarget = isFinite(bt) && bt > 0 && bt < 1 ? bt : 0.1
  if (kind === 'nr') {
    let scs = intOr(p.scs, 15)
    if (MU_OF[scs] === undefined) scs = 15
    const chBw = (p.chBwMHz === '' || p.chBwMHz == null) ? NaN : numOr(p.chBwMHz, NaN)
    const mcsTable = String(p.mcsTable || 't1')
    // ★ 变换预编码表只用于 transform precoding 使能的 PUSCH（TS 38.214 §6.1.4.1）——
    //   PDSCH 没有这两张表。放任它选下行，配出来的是标准里不存在的下行载波（π/2-BPSK 的
    //   MCS 0/1 更是只在上行有），故这里强制归上行，不给用户留一个配得出来的错。
    const tp = mcsTable === 'tp1' || mcsTable === 'tp2'
    const nrDir = tp ? 'ul' : dir
    return {
      kind: 'nr', dir: nrDir, scs,
      // NTN 频段：决定该子载波间隔可选的信道带宽档（TS 38.101-5 Table 5.3.5-1/-2）。
      // * 缺省空串 = 不指定 —— 老配置没有这个字段，一律按「该 FR 下所有频段的并集」放行，
      //   逐位照旧算得通；只有新选一次 MODCOD 才铺上内置骨架里的 n256。认不出的频段名照原样
      //   留着，由 resolve() 报错，不静默换一个。
      band: String(p.band == null ? '' : p.band),
      nRb: Math.max(1, intOr(p.nRb, 25)),
      chBwMHz: isFinite(chBw) && chBw > 0 ? chBw : null,
      mcsTable,
      mcs: Math.max(0, intOr(p.mcs, 0)),
      q: intOr(p.q, 2) === 1 ? 1 : 2,
      nSymb: Math.max(1, Math.min(14, intOr(p.nSymb, nrDir === 'ul' ? 14 : 12))),
      nDmrs: Math.max(0, intOr(p.nDmrs, 12)),
      nOh: Math.max(0, intOr(p.nOh, 0)),
      rateModel: String(p.rateModel || 'tbs') === 'oh38306' ? 'oh38306' : 'tbs',
      oh: (p.oh === '' || p.oh == null || !isFinite(Number(p.oh))) ? null : numOr(p.oh, null),
      layers: Math.max(1, intOr(p.layers, 1)),
      nRep, combLossDb, blerTarget
    }
  }
  if (kind === 'nbiot') {
    // ★ 下行 NPDSCH 的载波结构是定死的：12 个子载波 × 15 kHz = 180 kHz，一个 NB-IoT 载波就这么宽
    //   （TS 36.211 §10.2.3）。3.75 kHz 子载波间隔与「少于 12 个子载波」都只存在于【上行】NPUSCH
    //   （§10.1.2 的 single-tone / multi-tone）。下行强制归位，不接受这两个参数——放任它们进来，
    //   占用带宽会算成 3.75 kHz，频谱效率报出 34 bps/Hz 这种数。
    const ul = dir === 'ul'
    // ★ st = 这条载波挂的是不是 NPUSCH【单音表】——它是标准属性（跟着 MODCOD 表走，见
    //   modcodTables.PHY_OF），不是用户偏好：
    //     true  = 单音表，恒 1 个子载波；表里的行号是 I_MCS，要经 Table 16.5.1.2-1 映射成 I_TBS
    //     false = 多音表，3/6/12 子载波、恒 15 kHz；行号直接就是 I_TBS，且 TS 36.213 §16.5.1.2
    //             规定 N_sc^RU > 1 时恒 QPSK（单音那两档 π/2-BPSK 套不上来）
    //     null  = 自建标准 / 老配置，行号口径只有填表的人知道，一律不锁（照旧按当前子载波数判）
    //   两张表的门限差 1.6 dB@I_TBS 0 … 3.8 dB@I_TBS 10，选定表之后再改子载波数，
    //   等于拿另一张表的门限算这条载波。
    const st = p.st === true ? true : (p.st === false ? false : null)
    // 3.75 kHz 只在上行 NPUSCH 单音；多音表没有这一档
    const scs = (ul && st !== false && Number(p.scs) === 3.75) ? 3.75 : 15
    let nTones = ul ? intOr(p.nTones, 12) : 12
    if ([1, 3, 6, 12].indexOf(nTones) < 0) nTones = 12
    if (scs === 3.75) nTones = 1                 // 3.75 kHz 只有单音
    if (st === true) nTones = 1                  // 单音表锁死 1 个子载波
    // ★ st === false 且填了 1：【不归正】，留给 resolve() 报错。悄悄改成 3 音等于替用户挑了
    //   一个他没选的配置，而门限还是多音那一列的——比单音低 1.6~3.8 dB，账面上一切正常。
    // 部署模式（TS 36.213 §16.4.1.4 / §16.4.1.5.1）：带内部署的 NPDSCH 前 3 个符号要让给 LTE 的
    // 控制区、并被 CRS 打孔，于是每传输块的编码比特数从 304 掉到 208，I_TBS 也只到 10。
    // 缺省独立部署 —— NTN 的典型形态（TS 36.102 §5.4B.1 的 200 kHz 独立栅格）。NPUSCH 不受影响。
    const om = String(p.opMode || '').toLowerCase()
    const opMode = (om === 'inband' || om === 'guardband') ? om : 'standalone'
    return {
      kind: 'nbiot', dir, st, scs, nTones, opMode,
      iTbs: Math.max(0, intOr(p.iTbs, 0)),
      iSf: Math.max(0, Math.min(7, intOr(p.iSf, 0))),
      iRu: Math.max(0, Math.min(7, intOr(p.iRu, 0))),
      nRep, combLossDb, blerTarget
    }
  }
  return null
}

// ===== NR =====
// 某个 (子载波间隔, FR) 下的「信道带宽 -> N_RB」。fr 不给时按 FR1（60 kHz 两个 FR 都有，别猜）。
function nrRbTable(scs, fr) {
  const t = (Number(fr) === 2 ? NR_RB_FR2 : NR_RB_FR1)[Number(scs)]
  return t || null
}

// 这条载波在【它那个频段】下允许的信道带宽档：[{ mhz, nRb, optional, dlOnly }]，按带宽升序。
// band 为空 = 不指定 -> 取同 FR 所有频段的并集（老配置照旧算得通）；并集里只要有一个频段把
// 某档列为必选 / 收发都用，就按宽的那一份算 —— 不指定频段时本来就不该替用户挑最严的那个。
function nrBwSteps(phy) {
  const rb = nrRbTable(phy.scs, frOf(phy))
  if (!rb) return []
  const out = []
  const add = (e) => {
    if (rb[e.mhz] == null) return                 // 该子载波间隔下这一档没有 N_RB（5.3.2-1 的 N/A）
    const i = out.findIndex((x) => x.mhz === e.mhz)
    if (i < 0) { out.push({ mhz: e.mhz, nRb: rb[e.mhz], optional: !!e.optional, dlOnly: !!e.dlOnly }); return }
    if (!e.optional) out[i].optional = false
    if (!e.dlOnly) out[i].dlOnly = false
  }
  const band = NTN_BANDS[phy.band]
  if (band) for (const e of (band.bw[phy.scs] || [])) add(e)
  else {
    const fr = frOf(phy)
    for (const k of Object.keys(NTN_BANDS)) {
      if (NTN_BANDS[k].fr !== fr) continue
      for (const e of (NTN_BANDS[k].bw[phy.scs] || [])) add(e)
    }
  }
  return out.sort((a, b) => a.mhz - b.mhz)
}

// 占用带宽 B_occ = N_RB × 12 × SCS（kHz）—— ★ SNR / Es/N₀ / C/N 的噪声带宽就是它
function nrOccupiedBwKHz(phy) { return phy.nRb * 12 * phy.scs }

// 信道带宽（kHz）：显式给了就用；否则【只对下行】查表取「能装下这些 PRB 的最小档」；查不到退回占用带宽。
// 只用于信道带宽档位核对与转发器占用比，不当噪声带宽（与每 RE SNR 差 0.18~0.46 dB）。
//
// ★ 上行不查表：一条上行载波 = 一个终端本次的分配，它在转发器上占的就是自己那点占用带宽。
//   拿「装得下 1 PRB 的最小信道档」去当它的载波带宽，会把 180 kHz 的 PUSCH 报成 5 MHz——
//   转发器带宽占用比当场虚高 27 倍。要按整载波算占用的，显式填信道带宽（显式恒优先）。
function nrChannelBwKHz(phy) {
  if (phy.chBwMHz != null && isFinite(phy.chBwMHz) && phy.chBwMHz > 0) return phy.chBwMHz * 1000
  if (phy.dir === 'ul') return nrOccupiedBwKHz(phy)
  // ★ 反查【跳过本版可选的档】（Rel-19 给 L/S 各频段新加的 3 MHz 就是可选档）：反查是替用户挑，
  //   挑到一个"可选"的档等于替他做了一个部署决定；而且这会把老配置里 1 PRB 的下行从 5 MHz
  //   改报成 3 MHz —— 静默换数。要用可选档，在下拉里显式选。
  let best = null
  for (const st of nrBwSteps(phy)) {
    if (st.optional || (st.dlOnly && phy.dir === 'ul')) continue
    if (st.nRb >= phy.nRb && (best == null || st.mhz < best)) best = st.mhz
  }
  return best != null ? best * 1000 : nrOccupiedBwKHz(phy)
}

// 该 (子载波间隔, FR) 下表里最大的一档信道带宽能装几个 PRB。返回 { nRb, bwMHz }；没有这个 SCS 返回 null。
// * 这是【表级】上限，不含逐频段的限制；判「PRB 数填过了头」用下面那个按频段来的。
function nrMaxRb(scs, fr) {
  const t = nrRbTable(scs, fr)
  if (!t) return null
  let best = null
  for (const k of Object.keys(t)) if (best == null || t[k] > best.nRb) best = { nRb: t[k], bwMHz: Number(k) }
  return best
}

// 这条载波在【它那个频段】下最大的一档能装几个 PRB —— 判「PRB 数填过了头」用这个。
// n256@15 kHz 顶格是 20 MHz = 106 PRB，而表级上限是 50 MHz = 270 PRB（那是 Ku 的 n248 才有的档）。
function nrBandMaxRb(phy) {
  let best = null
  for (const s of nrBwSteps(phy)) if (best == null || s.nRb > best.nRb) best = { nRb: s.nRb, bwMHz: s.mhz }
  return best
}

// 频段 / 信道带宽档的组合校验。返回空串 = 这个组合在 TS 38.101-5 里存在。
function nrBandError(phy) {
  if (phy.band && !NTN_BANDS[phy.band]) {
    return 'NTN 频段 ' + phy.band + ' 不在 TS 38.101-5 的频段表里'
  }
  const steps = nrBwSteps(phy)
  if (!steps.length) {
    return (phy.band || (frOf(phy) === 2 ? 'FR2-NTN' : 'FR1-NTN')) + ' 没有 ' + phy.scs + ' kHz 这一档子载波间隔'
  }
  const who = phy.band || (frOf(phy) === 2 ? 'FR2-NTN' : 'FR1-NTN')
  if (phy.chBwMHz != null) {
    const hit = steps.find((x) => x.mhz === phy.chBwMHz)
    if (!hit) {
      return who + ' 在 ' + phy.scs + ' kHz 下没有 ' + phy.chBwMHz + ' MHz 这一档信道带宽（可取 ' +
        steps.map((x) => x.mhz).join(' / ') + ' MHz）'
    }
    if (hit.dlOnly && phy.dir === 'ul') return who + ' 的 ' + phy.chBwMHz + ' MHz 只用于下行'
  }
  const mx = nrBandMaxRb(phy)
  if (mx && phy.nRb > mx.nRb) {
    return 'PRB 数 ' + phy.nRb + ' 超出 ' + who + ' 在 ' + phy.scs + ' kHz 下的最大信道带宽档（' +
      mx.bwMHz + ' MHz = ' + mx.nRb + ' PRB）'
  }
  return ''
}

// TS 38.214 §5.1.3.2 精确 TBS（bit / 时隙）。Qm = 调制阶数(bit/符号), R = 目标码率(0–1)。
// 只算 PDSCH/PUSCH 的数据 RE，不含 PDCCH/SSB/CSI-RS 的系统级开销（那些在 oh38306 模型里）。
function nrTbsPerSlot(phy, Qm, R) {
  if (!(Qm > 0) || !(R > 0)) return null
  const nRePrime = 12 * phy.nSymb - phy.nDmrs - phy.nOh
  if (!(nRePrime > 0)) return null
  const nRe = Math.min(156, nRePrime) * phy.nRb
  const nInfo = nRe * R * Qm * phy.layers
  if (!(nInfo > 0)) return null
  if (nInfo <= 3824) {
    const n = Math.max(3, Math.floor(Math.log2(nInfo)) - 6)
    const p = Math.pow(2, n)
    const quant = Math.max(24, p * Math.floor(nInfo / p))
    for (let i = 0; i < TBS_QUANT.length; i++) if (TBS_QUANT[i] >= quant) return TBS_QUANT[i]
    return TBS_QUANT[TBS_QUANT.length - 1]
  }
  const n = Math.floor(Math.log2(nInfo - 24)) - 5
  const p = Math.pow(2, n)
  // 标准要求 .5 向上取整；(nInfo−24)/2^n 恒为正，Math.round 正好是这个语义
  const quant = Math.max(3840, p * Math.round((nInfo - 24) / p))
  if (R <= 0.25) {
    const C = Math.ceil((quant + 24) / 3816)
    return 8 * C * Math.ceil((quant + 24) / (8 * C)) - 24
  }
  if (quant > 8424) {
    const C = Math.ceil((quant + 24) / 8424)
    return 8 * C * Math.ceil((quant + 24) / (8 * C)) - 24
  }
  return 8 * Math.ceil((quant + 24) / 8) - 24
}

// 信息速率（kbps）。两个模型：
//   'tbs'      —— 每时隙 TBS × 每秒时隙数(1000·2^μ)，厂家谈的就是这个口径，缺省
//   'oh38306'  —— TS 38.306 §4.1.2 近似式，含 PDCCH/SSB/CSI-RS 的平均系统开销
// 两者都 ÷ 重复次数（重复只提门限、不提速率）。
function nrInfoRateKbps(phy, Qm, R) {
  if (phy.rateModel === 'oh38306') {
    if (!(Qm > 0) || !(R > 0)) return null
    const oh = (phy.oh != null && isFinite(phy.oh)) ? phy.oh : ohOf(phy)
    // N_RB·12/T_s ≡ B_occ · 14/15（T_s 是含 CP 的平均符号时长 = 1ms/(14·2^μ)）
    return nrOccupiedBwKHz(phy) * (14 / 15) * (1 - oh) * Qm * R * phy.layers / phy.nRep
  }
  const tbs = nrTbsPerSlot(phy, Qm, R)
  if (tbs == null) return null
  return tbs * Math.pow(2, MU_OF[phy.scs]) / phy.nRep
}

// ===== NB-IoT =====
function nbOccupiedBwKHz(phy) { return phy.nTones * phy.scs }

// 信道带宽（kHz）。下行一条载波就是整个 NB-IoT 载波，落在 200 kHz 栅格上（占用 180 kHz）。
// ★ 上行一律报占用带宽，与 NR 上行同一把尺：一条上行载波 = 一个终端本次的分配，它在转发器上占的
//   就是自己那几个子载波。满 12 子载波曾按 200 kHz 报（把栅格的 20 kHz 保护带算成这个终端占的），
//   转发器带宽占用比虚高 11%，且与 NR 上行「不查表」的口径正好相反。
function nbChannelBwKHz(phy) {
  if (phy.dir === 'dl') return 200
  return nbOccupiedBwKHz(phy)
}

// TBS（bit / 传输块）。越界（该 I_TBS 下这个 I_SF/I_RU 不存在）返回 null。
function nbTbs(phy) {
  const tbl = phy.dir === 'ul' ? NB_TBS_UL : NB_TBS_DL
  const row = tbl[phy.iTbs]
  if (!row) return null
  const v = row[phy.dir === 'ul' ? phy.iRu : phy.iSf]
  return v == null ? null : v
}

// 该 I_TBS 行允许的最大 I_SF / I_RU 下标（表里最后一个非空格）；整行皆空返回 −1。
// Cat-NB1 的 TBS 有上限（下行 680 bit / 上行 1000 bit），越靠后的 I_TBS 行越短。
function nbMaxSfIdx(phy) {
  const tbl = phy.dir === 'ul' ? NB_TBS_UL : NB_TBS_DL
  const row = tbl[phy.iTbs]
  if (!row) return -1
  let last = -1
  for (let i = 0; i < row.length; i++) if (row[i] != null) last = i
  return last
}

// I_MCS → (调制, I_TBS)：NPUSCH 单音专用（多音 I_MCS ≡ I_TBS，QPSK）
function nbSingleToneMcs(iMcs) { return NB_ST_MCS[intOr(iMcs, -1)] || null }

// 信息速率（kbps）：下行 TBS/(N_SF·1ms·N_rep)，上行 TBS/(N_RU·T_RU·N_rep)
function nbInfoRateKbps(phy) {
  const tbs = nbTbs(phy)
  if (tbs == null) return null
  if (phy.dir === 'ul') return tbs / (NB_SF_COUNT[phy.iRu] * nbRuMs(phy) * phy.nRep)
  return tbs / (NB_SF_COUNT[phy.iSf] * phy.nRep)
}

// 这条 NB-IoT 载波每传输块的编码比特数（一个 RU / 子帧的量，再乘 N_SF / N_RU 就是整块的）。
function nbCodedBitsPerUnit(phy) {
  if (phy.dir === 'ul') {
    // 单音按调制走：pi/2-BPSK 96 bit、pi/4-QPSK 192 bit；多音无论 3/6/12 子载波都是 288 bit
    if (phy.nTones === 1) return NB_CODED_BITS.ulSingle * (nbSingleToneQm(phy) || 2)
    return NB_CODED_BITS.ulMulti
  }
  return phy.opMode === 'inband' ? NB_CODED_BITS.dlInband : NB_CODED_BITS.dlStandalone
}

// 单音这一档是 pi/2-BPSK 还是 pi/4-QPSK：由 I_TBS 反查 Table 16.5.1.2-1（I_TBS 0 和 2 是 BPSK）。
// * 面板上存的是 I_TBS 不是 I_MCS，故只能反查；查不到按 QPSK（表里 11 档之外没有单音配置）。
function nbSingleToneQm(phy) {
  for (const e of NB_ST_MCS) if (e.iTbs === phy.iTbs) return e.modulation === 'BPSK' ? 1 : 2
  return 2
}

// NB-IoT 这条载波的【有效码率】= (TBS + 24 bit CRC) / 每传输块编码比特数。
// 与 NR 的 R 同口径（N_info = N_RE·R·Qm ≈ TBS + CRC）。算不出返回 null。
function nbCodeRate(phy) {
  const tbs = nbTbs(phy)
  if (tbs == null) return null
  const n = NB_SF_COUNT[phy.dir === 'ul' ? phy.iRu : phy.iSf]
  const coded = nbCodedBitsPerUnit(phy) * n
  return coded > 0 ? (tbs + NB_CRC_BITS) / coded : null
}

// ===== 通用 =====
// 重复次数的值域校验。返回空串 = 合法。
// NB-IoT 报枚举全表（合法值就那么几个，列出来用户能直接改）；NR 只报上限。
function nRepError(phy) {
  const n = phy.nRep
  if (phy.kind === 'nbiot') {
    const ul = phy.dir === 'ul'
    const list = ul ? NB_NREP_UL : NB_NREP_DL
    if (list.indexOf(n) < 0) {
      return '重复次数 ' + n + ' 不是 ' + (ul ? 'NPUSCH' : 'NPDSCH') + ' 的合法档，可取 ' + list.join(' / ')
    }
    return ''
  }
  const mx = phy.dir === 'ul' ? NR_NREP_MAX_UL : NR_NREP_MAX_DL
  if (n > mx) return '重复次数 ' + n + ' 超出 ' + (phy.dir === 'ul' ? 'PUSCH' : 'PDSCH') + ' 上限 ' + mx
  return ''
}

// 含重复的有效门限：SNR_req(N) = SNR_req(1) − 10lg N + L_comb。
// 理想合并 L_comb = 0（MATLAB NB-IoT NTN 示例即按 10lg N 折算）；非理想信道估计下 0.5–1.5 dB，缺省 0。
function effectiveThresholdDb(thresholdDb, phy) {
  // ★ Number('') 与 Number(null) 都是 0：不先挡住空值，缺门限的行会静默按 0 dB 算出一个像样的余量
  if (thresholdDb === '' || thresholdDb == null) return null
  const t = Number(thresholdDb)
  if (!isFinite(t)) return null
  const rep = phy && phy.nRep > 0 ? phy.nRep : 1
  const loss = phy && isFinite(phy.combLossDb) ? phy.combLossDb : 0
  return t - 10 * Math.log10(rep) + loss
}

function occupiedBwKHz(phy) { return phy.kind === 'nr' ? nrOccupiedBwKHz(phy) : nbOccupiedBwKHz(phy) }
function channelBwKHz(phy) { return phy.kind === 'nr' ? nrChannelBwKHz(phy) : nbChannelBwKHz(phy) }
function infoRateKbps(phy, Qm, R) { return phy.kind === 'nr' ? nrInfoRateKbps(phy, Qm, R) : nbInfoRateKbps(phy) }
function tbsOf(phy, Qm, R) { return phy.kind === 'nr' ? nrTbsPerSlot(phy, Qm, R) : nbTbs(phy) }

/**
 * 引擎入口：一次算齐 snr 行要的全部量。
 * rawPhy 未归一化亦可；Qm = 调制阶数(bit/符号)、R = 目标码率(0–1)，来自选中的 MODCOD 行。
 * 返回 null = 这不是 3GPP 载波；返回对象里 error 非空 = 参数越界，其余数值字段为 null。
 */
function resolve(rawPhy, Qm, R) {
  const phy = normalizePhy(rawPhy)
  if (!phy) return null
  const bOccKHz = occupiedBwKHz(phy)
  const bChKHz = channelBwKHz(phy)
  const tbs = tbsOf(phy, Qm, R)
  const rate = infoRateKbps(phy, Qm, R)
  let error = ''
  if (!(bOccKHz > 0)) error = '占用带宽为零'
  // 多音表配单子载波：标准里没有这个组合（TS 36.213 §16.5.1.2），且门限、I_MCS↔I_TBS 映射两头都不对
  else if (phy.kind === 'nbiot' && phy.st === false && phy.nTones === 1) {
    error = 'NPUSCH 多音表不含单子载波配置'
  } else if (phy.kind === 'nbiot' && phy.dir === 'ul' && phy.nTones === 1 && phy.iTbs > 10) {
    // 单子载波的 I_TBS 只到 10：TS 36.213 Table 16.5.1.2-1 的单音行只有 I_MCS 0–10，映射出来的
    // I_TBS 就是 {0…10}，11–13 那三档单音根本取不到。放任它算，「有效码率」会算出 >1 的数。
    error = 'NPUSCH 单子载波只到 I_TBS 10（Table 16.5.1.2-1 的 I_MCS 0–10），当前 ' + phy.iTbs
  } else if (nRepError(phy)) { error = nRepError(phy) }
  // 占用带宽不能超过信道带宽：显式填了 5 MHz 信道又把 PRB 数改到 50，配出来的是标准里不存在的载波。
  // 上行的信道带宽就是占用带宽本身（见 nrChannelBwKHz），这一条对它恒不触发，故另有下面那条。
  else if (bChKHz > 0 && bOccKHz > bChKHz + 1e-9) {
    error = '占用带宽 ' + bOccKHz + ' kHz 超过信道带宽 ' + bChKHz + ' kHz'
  } else if (phy.kind === 'nr' && nrBandError(phy)) {
    error = nrBandError(phy)
  } else if (phy.kind === 'nbiot' && phy.dir === 'dl' && phy.opMode === 'inband' && phy.iTbs > 10) {
    // 带内部署的 NPDSCH 只到 I_TBS 10（TS 36.213 §16.4.1.5.1：operationModeInfo 为 '00' / '01' 时
    // 0 <= I_TBS <= 10）。NPUSCH 不受这一条限制。
    error = '带内部署的 NPDSCH 只到 I_TBS 10，当前 ' + phy.iTbs
  } else if (tbs == null) {
    if (phy.kind !== 'nbiot') error = 'NR TBS 算不出（调制阶数或码率无效）'
    else if (phy.iTbs > 13) error = 'NB-IoT I_TBS=' + phy.iTbs + ' 未收录（16QAM 档为 Rel-17 的 I_TBS 14–21）'
    else {
      // 报「上限是多少」而不是「这一格没有」：界面上那个下拉显示的是子帧数 / RU 数本身（1…10），
      // I_SF / I_RU 这个下标一个字都不出现，照抄下标等于没说。
      const ul = phy.dir === 'ul'
      const mx = nbMaxSfIdx(phy)
      error = 'NB-IoT I_TBS=' + phy.iTbs + ' 的' + (ul ? ' RU 数' : '子帧数') + '上限 ' +
        (mx >= 0 ? NB_SF_COUNT[mx] : 0) + '，当前 ' + NB_SF_COUNT[ul ? phy.iRu : phy.iSf]
    }
  } else if (!(rate > 0)) error = '信息速率为零'
  // NB-IoT 的有效码率由当前 I_SF / I_RU 与部署模式现算（MODCOD 表那一列只是 I_SF/I_RU = 0 的值）；
  // NR 的码率就是 MODCOD 表里的 R，由调用方回显，这里不重复给。
  const codeRate = (!error && phy.kind === 'nbiot') ? nbCodeRate(phy) : null
  return {
    phy,
    bOccKHz: error ? null : bOccKHz,
    bChKHz: error ? null : bChKHz,
    tbs: error ? null : tbs,
    tbsUnit: phy.kind === 'nr' ? 'slot' : (phy.dir === 'ul' ? 'ru' : 'sf'),
    infoRateKbps: error ? null : rate,
    codeRate,
    nRep: phy.nRep,
    combLossDb: phy.combLossDb,
    blerTarget: phy.blerTarget,
    error
  }
}

/**
 * 引擎的 snr 分支：一次给出「替换 DVB 换算链」要的全部量。
 * thresholdDb = MODCOD 行的门限（表值，不含重复折算）；Qm / R 来自同一行的调制方式与 FEC 码率。
 *
 * 返回 null = 这不是 3GPP 载波，引擎照旧走 DVB 链（信息速率 →÷帧效率÷FEC→ 载波速率 →×扩频→ 码片率
 * →÷调制因子→ 符号率 →×滚降→ 载波带宽）。error 非空 = 参数越界，数值字段一律 null，
 * 调用方应当场抛错，不要拿半个数往下算。
 *
 * ★ symbolRate := B_occ 是【刻意】的：引擎下游一行 `noiseBW = symbolRate` 就是噪声带宽，
 *   把占用带宽放进这个位置，恒等式 thresholdCN = ebno + 10lg(infoRate/noiseBW) 立刻就等于门限 SNR，
 *   整条功率链一个字不用改。代价是这个变量对 3GPP 行名不副实（OFDM 的真符号率 = B_occ×14/15，
 *   即每秒的 RE 数），故引擎【不出】符号率/载波速率/码片速率三个 DVB 读数，改出 noiseBw。
 */
function engineChain(rawPhy, thresholdDb, Qm, R) {
  const rv = resolve(rawPhy, Qm, R)
  if (!rv) return null
  const out = {
    phy: rv.phy, tbs: rv.tbs, tbsUnit: rv.tbsUnit, nRep: rv.nRep, combLossDb: rv.combLossDb,
    codeRate: rv.codeRate, blerTarget: rv.blerTarget,
    thresholdTable: null, tbsReported: null, error: rv.error,
    infoRate: null, symbolRate: null, allocBandwidth: null, k: null, esno: null, ebno: null
  }
  if (rv.error) return out
  const thr = effectiveThresholdDb(thresholdDb, rv.phy)
  if (thr == null) { out.error = '门限值为空'; return out }
  out.thresholdTable = Number(thresholdDb)
  // 走 38.306 近似式时不报 TBS：那条路的速率不是「每时隙 TBS × 时隙数」，两个数并列摆在级联表里
  // 只会让人去乘一遍然后发现对不上。NB-IoT 的速率本来就由 TBS 定，照报。
  out.tbsReported = (rv.phy.kind === 'nr' && rv.phy.rateModel === 'oh38306') ? null : rv.tbs
  out.infoRate = rv.infoRateKbps
  out.symbolRate = rv.bOccKHz
  out.allocBandwidth = rv.bChKHz
  out.k = rv.infoRateKbps / rv.bOccKHz          // 占用带宽上的频谱效率 bit/s/Hz
  out.esno = thr                                 // 含重复折算的有效门限 ≡ 每 RE SNR ≡ B_occ 内的 C/N
  out.ebno = thr - 10 * Math.log10(out.k)        // Eb/N₀ 自动把 CP / DMRS / 开销 / 重复全算进去
  return out
}

// MCS 表 key → 短名（描述串与级联用）
const MCS_TABLE_SHORT = { t1: 'T1', t2: 'T2', t3: 'T3', tp1: 'TP1', tp2: 'TP2' }
const MCS_TABLE_ZH = { t1: '表1', t2: '表2', t3: '表3', tp1: '预编码表1', tp2: '预编码表2' }

// 这条载波在标准表里的档位：NR 报「哪张 MCS 表 + 第几档」，NB-IoT 报 I_TBS（一个纯数，无需翻译）。
// 级联表拿它当「MCS」/「I_TBS」那一行的值；标签随 kind 走，由级联表按当前语言给。
function mcsLabel(rawPhy, lang) {
  const phy = normalizePhy(rawPhy)
  if (!phy) return ''
  if (phy.kind !== 'nr') return String(phy.iTbs)
  const en = String(lang || 'zh').toLowerCase().indexOf('en') === 0
  const tbl = en ? (MCS_TABLE_SHORT[phy.mcsTable] || phy.mcsTable) : (MCS_TABLE_ZH[phy.mcsTable] || phy.mcsTable)
  return tbl + ' · MCS ' + phy.mcs
}

// 传输方向的中/英文本（数据的呈现由 core 现造，呈现层不许翻——见 describe 的同款说明）
function dirLabel(rawPhy, lang) {
  const phy = normalizePhy(rawPhy)
  if (!phy) return ''
  const en = String(lang || 'zh').toLowerCase().indexOf('en') === 0
  return phy.dir === 'ul' ? (en ? 'Uplink' : '上行') : (en ? 'Downlink' : '下行')
}

// NB-IoT 一个传输块摊在几个子帧（下行 NPDSCH）/ 几个资源单元（上行 NPUSCH）上 —— 报的是数目本身
// （1…10），不是 I_SF / I_RU 那个下标。NR 没有这个概念，返回 null。
function nbUnitCount(rawPhy) {
  const phy = normalizePhy(rawPhy)
  if (!phy || phy.kind !== 'nbiot') return null
  return NB_SF_COUNT[phy.dir === 'ul' ? phy.iRu : phy.iSf]
}

/**
 * 载波描述短串（资源库自动命名 / 级联表头用）。
 * ★ 这是数据不是界面文案：中英两版由 lang 现造，绝不在渲染时替换（自动名必须 byLang 生成）。
 */
function describe(rawPhy, lang) {
  const phy = normalizePhy(rawPhy)
  if (!phy) return ''
  const en = String(lang || 'zh').toLowerCase().indexOf('en') === 0
  const dir = phy.dir === 'ul' ? (en ? 'UL' : '上行') : (en ? 'DL' : '下行')
  if (phy.kind === 'nr') {
    const tbl = en ? (MCS_TABLE_SHORT[phy.mcsTable] || phy.mcsTable) : (MCS_TABLE_ZH[phy.mcsTable] || phy.mcsTable)
    return 'NR ' + dir + ' · ' + phy.nRb + ' PRB × ' + phy.scs + ' kHz · ' + tbl + ' MCS' + phy.mcs + ' · ×' + phy.nRep
  }
  // ★ 「音数」不是规范用词：TS 36.211 §10.1.2 的参数是 N_sc^RU（每资源单元的子载波数，1/3/6/12）。
  //   single-tone / multi-tone 是【传输模式】的名字，只用在 NPUSCH 那两张 MODCOD 表的表名上；
  //   参数本身一律叫「子载波数」，免得同行读成别的东西。
  const sc = phy.nTones + (en ? ' SC × ' : ' 子载波 × ') + phy.scs + ' kHz'
  return 'NB-IoT ' + dir + ' · ' + sc + ' · I_TBS ' + phy.iTbs + ' · ×' + phy.nRep
}

module.exports = {
  MU_OF, NR_RB_FR1, NR_RB_FR2, NTN_BANDS, NR_FR1_BW_MHZ, NR_FR2_BW_MHZ,
  TBS_QUANT, NB_TBS_DL, NB_TBS_UL, NB_SF_COUNT, NB_ST_MCS, NB_CODED_BITS, NB_CRC_BITS,
  NB_NREP_DL, NB_NREP_UL, NR_NREP_MAX_UL, NR_NREP_MAX_DL, nRepError,
  MCS_TABLE_SHORT, MCS_TABLE_ZH,
  normalizePhy, frOf, nrRbTable, nrBwSteps, nrMaxRb, nrBandMaxRb, nrBandError,
  nrOccupiedBwKHz, nrChannelBwKHz, nrTbsPerSlot, nrInfoRateKbps,
  nbRuMs, nbOccupiedBwKHz, nbChannelBwKHz, nbTbs, nbMaxSfIdx, nbSingleToneMcs, nbInfoRateKbps,
  nbCodedBitsPerUnit, nbCodeRate,
  effectiveThresholdDb, occupiedBwKHz, channelBwKHz, infoRateKbps, tbsOf, resolve, engineChain, describe,
  mcsLabel, nbUnitCount, dirLabel
}

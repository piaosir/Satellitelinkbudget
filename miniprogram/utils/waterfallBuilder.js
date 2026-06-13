// utils/waterfallBuilder.js
// 链路瀑布表数据构建器（自 pages/results-detail 抽取共享）。
// 供结果详情页、历史记录/配置管理「专业版」导出共同使用，保证页面与报告口径完全一致。
//
// buildWaterfallSegments(ctx) → segments[]
//   ctx: {
//     results,            // 计算引擎输出（linkCalculator/linkCalculatorNGSO 的 results）
//     lang,               // 'zh' | 'en'
//     txLocation,         // 发信站城市
//     rxLocation,         // 收信站城市
//     orbitType,          // 'GEO' | 'NGSO'
//     satelliteGT         // 可选：linkParams.G_Ts，用于旧记录 satelliteGTResult 缺失时回填
//   }
// buildLinkSummary(results, meta) → 链路总览关键指标（供多链路专业版报告首页对比表）

// ============ 链路瀑布表中英文翻译字典 ============
// 标题、参数标签、特殊单位的中→英映射；未命中的键原样返回（如 dB、GHz 等通用单位）
const WF_DICT = {
  // —— 段标题 ——
  '载波与调制参数': 'Carrier & Modulation',
  '几何与天线（上行 / 下行）': 'Geometry & Antenna (Up / Down)',
  '传播损耗（上行 / 下行）': 'Propagation Loss (Up / Down)',
  '卫星与转发器': 'Satellite & Transponder',
  '旁瓣·功率谱·增益与噪声': 'Sidelobe · PSD · Gain & Noise',
  '链路预算级联（上行 / 下行 / 合计）': 'Link Budget Cascade (Up / Down / Total)',
  '可用度与资源': 'Availability & Resources',
  // —— 载波与调制 ——
  '载波带宽': 'Allocated Bandwidth',
  '功率带宽': 'Power Bandwidth',
  '频谱效率': 'Spectral Efficiency',
  '信息速率': 'Information Rate',
  '载波速率': 'Carrier Rate',
  '符号速率': 'Symbol Rate',
  '码片速率': 'Chip Rate',
  '调制方式': 'Modulation',
  '调制因子': 'Modulation Factor',
  'FEC 码率': 'FEC Code Rate',
  '误码率': 'BER',
  '门限 Eb/N₀': 'Threshold Eb/N₀',
  '门限 Es/N₀': 'Threshold Es/N₀',
  '载波噪声带宽': 'Carrier Noise Bandwidth',
  '系统余量': 'System Margin',
  // —— 几何与天线 ——
  '城市': 'City',
  '频率': 'Frequency',
  '极化方式': 'Polarization',
  '极化角': 'Polarization Angle',
  '地球站天线口径': 'Earth Station Antenna Diameter',
  '地球站经度': 'Earth Station Longitude',
  '地球站纬度': 'Earth Station Latitude',
  '对卫星仰角': 'Elevation to Satellite',
  '对卫星方位角': 'Azimuth to Satellite',
  '天线效率': 'Antenna Efficiency',
  '波长': 'Wavelength',
  '3dB 波束宽度': '3dB Beamwidth',
  '天线增益': 'Antenna Gain',
  '星地距离': 'Slant Range',
  // —— 传播损耗 ——
  '自由空间损耗': 'Free Space Loss',
  '大气衰减 P.676': 'Atmospheric Attenuation P.676',
  '雨衰 P.618': 'Rain Attenuation P.618',
  '云衰 P.840': 'Cloud Attenuation P.840',
  '其他损耗': 'Other Losses',
  '总衰减': 'Total Attenuation',
  '雨层高度 P.839': 'Rain Height P.839',
  // —— 卫星与转发器 ——
  '卫星轨道位置': 'Satellite Orbital Position',
  '轨道高度': 'Orbital Altitude',
  '轨道速度': 'Orbital Velocity',
  '轨道速度(惯性系)': 'Orbital Velocity (Inertial)',
  '相对地面运动速度': 'Ground-relative Velocity',
  '链路时延(单程)': 'Link Delay (One-way)',
  '链路时延(单程·分段)': 'Link Delay (One-way, per-leg)',
  '链路时延(单程·端到端)': 'Link Delay (One-way, end-to-end)',
  '上行最大多普勒': 'Max Uplink Doppler',
  '下行最大多普勒': 'Max Downlink Doppler',
  '卫星饱和 EIRP': 'Satellite Saturated EIRP',
  '卫星天线增益': 'Satellite Antenna Gain',
  '卫星天线单位面积增益': 'Satellite Antenna Gain per Unit Area',
  '卫星 SFD': 'Satellite SFD',
  'IBO': 'IBO',
  '转发器带宽': 'Transponder Bandwidth',
  '卫星功率谱密度': 'Satellite PSD',
  // —— 旁瓣·功率谱·增益与噪声 ——
  '功放建议功率(W)': 'Recommended PA Power (W)',
  '旁瓣发射增益': 'Tx Sidelobe Gain',
  '旁瓣 EIRP': 'Sidelobe EIRP',
  '旁瓣功率谱密度': 'Sidelobe PSD',
  '地球站功率谱密度': 'Earth Station PSD',
  'ITU 旁瓣 PSD 建议值': 'ITU Sidelobe PSD Limit',
  '到达卫星通量密度': 'PFD at Satellite',
  '到达卫星通量密度（晴天）': 'PFD at Satellite (Clear Sky)',
  '卫星到地面 PFD': 'Satellite-to-Ground PFD',
  'ITU PFD 限值': 'ITU PFD Limit',
  '接收旁瓣增益': 'Rx Sidelobe Gain',
  '接收馈线损耗': 'Rx Feeder Loss',
  'G/T 劣化': 'G/T Degradation',
  '天线噪声温度': 'Antenna Noise Temperature',
  '接收机噪声温度': 'Receiver Noise Temperature',
  '雨噪声温度': 'Rain Noise Temperature',
  '系统噪声温度': 'System Noise Temperature',
  '系统噪声温度(dB)': 'System Noise Temperature (dB)',
  // —— 链路预算级联 ——
  '功放建议功率': 'Recommended PA Power',
  '功放回退': 'PA Backoff',
  '馈线损耗': 'Feeder Loss',
  '发射天线增益': 'Tx Antenna Gain',
  '地球站 EIRP': 'Earth Station EIRP',
  '到达卫星载波电平 C': 'Carrier Level at Satellite C',
  '卫星 G/T': 'Satellite G/T',
  '上行 C/T': 'Uplink C/T',
  '−玻尔兹曼常数 k': '−Boltzmann Constant k',
  '上行 C/N₀': 'Uplink C/N₀',
  '载波噪声带宽 10·lgB': 'Noise Bandwidth 10·lgB',
  '上行 C/N（热噪声）': 'Uplink C/N (Thermal)',
  '上行干扰损失 ACI/ASI/XPI/IM': 'Uplink Interference Loss ACI/ASI/XPI/IM',
  '上行 C/N': 'Uplink C/N',
  'OBO': 'OBO',
  '转发器工作区回退': 'Transponder Operating Backoff',
  '转发器输出 EIRP': 'Transponder Output EIRP',
  '每载波占卫星 EIRP': 'EIRP per Carrier',
  '到达地面载波电平 C': 'Carrier Level at Ground C',
  '接收天线增益': 'Rx Antenna Gain',
  '地球站 G/T': 'Earth Station G/T',
  'G/T 劣化（降雨）': 'G/T Degradation (Rain)',
  '下行 C/T': 'Downlink C/T',
  '下行 C/N₀': 'Downlink C/N₀',
  '下行 C/N（热噪声）': 'Downlink C/N (Thermal)',
  '下行干扰损失 ACI/ASI/XPI/IM': 'Downlink Interference Loss ACI/ASI/XPI/IM',
  '下行 C/N': 'Downlink C/N',
  'C/N（合成）': 'C/N (Combined)',
  '门限 C/N': 'Threshold C/N',
  '链路余量': 'Link Margin',
  // —— 可用度与资源 ——
  '系统可用度': 'System Availability',
  '上行可用度': 'Uplink Availability',
  '下行可用度': 'Downlink Availability',
  '年中断(分钟)': 'Annual Outage (min)',
  '年中断(小时)': 'Annual Outage (h)',
  '转发器受限因素': 'Transponder Limited By',
  '最大载波数': 'Max Carrier Count',
  '带宽占用比': 'Bandwidth Usage Ratio',
  '功率占用比': 'Power Usage Ratio',
  '上行功率占比': 'Uplink Power Ratio',
  '下行功率占比': 'Downlink Power Ratio',
  '功放实际输出': 'Actual PA Output',
  '功放实际输出(W)': 'Actual PA Output (W)',
  '功放建议值': 'Recommended PA Value',
  '功放建议值(W)': 'Recommended PA Value (W)',
  'UPC 上行功控余量': 'UPC Uplink Power Control Margin',
  // —— NGSO 专属 ——
  '卫星参数': 'Satellite Parameters',
  '卫星参数（上行 / 下行）': 'Satellite Parameters (Up / Down)',
  '最大多普勒': 'Max Doppler Shift',
  '星间链路 ISL（性能评估）': 'Inter-Satellite Link ISL (Performance)',
  'ISL 跳数': 'ISL Hops',
  'ISL 单跳 C/T': 'ISL C/T per Hop',
  'ISL 单跳 C/N': 'ISL C/N per Hop',
  'ISL 等效 C/T（并联）': 'ISL Equivalent C/T (Combined)',
  'ISL 等效 C/N（并联）': 'ISL Equivalent C/N (Combined)',
  'ISL 等效 C/N（计入总C/T）': 'ISL Equivalent C/N (into Total C/T)',
  'ISL 对上行 C/N 代价': 'ISL Cost to Uplink C/N',
  '上行 C/N（含 ISL）': 'Uplink C/N (incl. ISL)',
  '跳': 'hops',
  // —— ISL 分链路展示（按 islMode）——
  '星间链路 ISL（经验值）': 'Inter-Satellite Link ISL (Empirical)',
  '星间链路 ISL（微波链路）': 'Inter-Satellite Link ISL (Microwave)',
  '星间链路 ISL（激光链路）': 'Inter-Satellite Link ISL (Laser)',
  'ISL 频率': 'ISL Frequency',
  '单跳距离': 'Per-Hop Distance',
  'ISL EIRP': 'ISL EIRP',
  'ISL 自由空间损耗': 'ISL Free Space Loss',
  'ISL G/T': 'ISL G/T',
  '发射口径': 'Tx Aperture',
  '接收口径': 'Rx Aperture',
  '发射光功率': 'Tx Optical Power',
  '发射望远镜增益': 'Tx Telescope Gain',
  '光学自由空间损耗': 'Optical Free Space Loss',
  '指向+光学损耗': 'Pointing + Optical Loss',
  '接收望远镜增益': 'Rx Telescope Gain',
  '接收光功率': 'Rx Optical Power',
  '接收灵敏度': 'Rx Sensitivity',
  '灵敏度参考速率': 'Sensitivity Ref. Rate',
  '灵敏度 Eb/N₀': 'Sensitivity Eb/N₀',
  '等效噪声谱密度 N₀': 'Equiv. Noise PSD N₀',
  '单跳 C/N₀': 'C/N₀ per Hop',
  '输入 SNR': 'Input SNR',
  '参考带宽': 'Reference Bandwidth',
  // —— 可见性几何 / NGSO 干扰适配 ——
  '可见性几何': 'Visibility Geometry',
  '轨道周期': 'Orbital Period',
  '覆盖地心半角': 'Earth-Central Coverage Half-Angle',
  '地面覆盖半径': 'Ground Coverage Radius',
  '最大过境时长(天顶)': 'Max Pass Duration (Zenith)',
  '功率谱·PFD·增益与噪声': 'PSD · PFD · Gain & Noise',
  'ITU PFD 限值(Art.21)': 'ITU PFD Limit (Art.21)',
  // —— 特殊单位 ——
  '米': 'm'
};

// ============ 构建器（每次调用创建一个独立上下文） ============
function createBuilder(ctx) {
  const lang = ctx.lang === 'en' ? 'en' : 'zh';
  const txLocation = ctx.txLocation || '';
  const rxLocation = ctx.rxLocation || '';

  // 卫星 G/T 回填：部分（尤其是较早保存的）记录 calculationResults 中可能缺少
  // satelliteGTResult，此处用链路参数中的卫星 G/T 输入值（linkParams.G_Ts）补齐，
  // 与计算引擎 results.satelliteGTResult = G_Ts 的取值一致。
  const results = Object.assign({}, ctx.results || {});
  if (results.satelliteGTResult === undefined || results.satelliteGTResult === null || results.satelliteGTResult === '') {
    const gt = parseFloat(ctx.satelliteGT);
    if (!isNaN(gt)) results.satelliteGTResult = gt.toFixed(2);
  }

  const b = {};

  // 按语言翻译标签/标题/特殊单位；中文或未命中则原样返回
  b._t = function (s) {
    if (lang !== 'en') return s;
    return (s && WF_DICT[s] !== undefined) ? WF_DICT[s] : s;
  };

  // 解析结果字符串为数值，非数值返回 null
  b._num = function (v) {
    if (v === undefined || v === null) return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };

  // 格式化（最多保留 2 位小数）
  b._fmt = function (n) {
    if (n === null) return '—';
    return '' + (Math.round(n * 100) / 100);
  };

  // 透传引擎已格式化字符串（无值显示破折号；避免科学计数法被四舍五入）
  b._disp = function (raw) {
    return (raw === undefined || raw === null || raw === '' || raw === '-') ? '—' : ('' + raw);
  };

  // 构建单值行（单列段）。kind: base|gain|loss|sub|ref|kpi|margin
  // src 为结果字段名（默认从 results 取）；若 isLiteral 为 true 则 src 直接作为原始值
  b._wfRow = function (kind, label, src, unit, isLiteral) {
    const raw = isLiteral ? src : results[src];
    const isCalc = (kind === 'base' || kind === 'gain' || kind === 'loss' || kind === 'sub');
    const value = isCalc ? b._fmt(b._num(raw)) : b._disp(raw);
    const signMap = { base: '', gain: '+', loss: '−', sub: '=', ref: '', kpi: '', margin: '=' };
    return { key: label, kind, sign: signMap[kind], label: b._t(label), up: value, down: '', total: '', unit: b._t(unit) || '', cum: '', _raw: raw };
  };

  // 双列行（上行 / 下行）。key 为 '_none' 表示该侧不适用（留空，不画横杠）
  b._dualRow = function (label, upKey, downKey, unit, kind) {
    const cell = (k) => (k === '_none' ? '' : b._disp(results[k]));
    return { key: label, kind: kind || 'ref', sign: '', label: b._t(label), up: cell(upKey), down: cell(downKey), total: '', unit: b._t(unit) || '', cum: '' };
  };

  // 纯参考段（单列）：list 为 [label, key, unit] 数组，自动剔除无值行
  b._refSeg = function (title, list) {
    const rows = list
      .map((t) => b._wfRow('ref', t[0], t[1], t[2]))
      .filter((row) => row.up !== '—');
    return { title: b._t(title), cols: 1, rows };
  };

  // 级联单值行（三列布局）：value 路由到指定列 col（'up'|'down'|'total'）。
  // key 为 null 表示该格为计算检查点，值由 _cascadeTriSeg 沿链路累加后回填；
  // key 为数值时作为字面量原始值（用于 +228.6、噪声带宽、干扰损失等链路桥接项）。
  b._cRow = function (kind, label, key, unit, col) {
    const calc = (kind === 'base' || kind === 'gain' || kind === 'loss' || kind === 'sub' || kind === 'chk');
    const isLit = typeof key === 'number';
    const raw = key === null ? null : (isLit ? key : results[key]);
    const val = key === null ? '' : (calc ? b._fmt(b._num(raw)) : b._disp(raw));
    const signMap = { base: '', gain: '+', loss: '−', sub: '=', chk: '=', ref: '', kpi: '', margin: '=' };
    const row = { key: col + '·' + label, kind, sign: signMap[kind], label: b._t(label), up: '', down: '', total: '', unit: b._t(unit) || '', cum: '', _raw: raw, _col: col };
    row[col] = val;
    return row;
  };

  // 级联三列行：上行 / 下行 / 合计 同行展示（缺列传 null → 留空）
  b._cTri = function (kind, label, upKey, downKey, totalKey, unit) {
    const d = (k) => (k === null || k === undefined) ? '' : b._disp(results[k]);
    const signMap = { base: '', gain: '+', loss: '−', sub: '=', chk: '=', ref: '', kpi: '', margin: '=' };
    return { key: label, kind, sign: signMap[kind], label: b._t(label), up: d(upKey), down: d(downKey), total: d(totalKey), unit: b._t(unit) || '', cum: '', _raw: null, _col: null };
  };

  // 级联段（三列：上行 / 下行 / 合计）：沿功率链单一 running 累加，
  // 回填无引擎字段的计算检查点（到达卫星 / 转发器输出 / 到达地面电平），再剔除空 ref/kpi 行。
  b._cascadeTriSeg = function (title, rows) {
    let running = null;
    rows.forEach((row) => {
      const k = row.kind;
      if (k !== 'base' && k !== 'gain' && k !== 'loss' && k !== 'sub' && k !== 'chk') return;
      const n = b._num(row._raw);
      if (k === 'base') {
        running = n;
      } else if (k === 'gain') {
        if (running !== null && n !== null) running += n;
      } else if (k === 'loss') {
        if (running !== null && n !== null) running -= n;
      } else if (k === 'sub' || k === 'chk') {
        if (n !== null) running = n; // 引擎权威检查点
        else if (running !== null && row._col) row[row._col] = b._fmt(running); // 计算检查点回填
      }
    });
    const hasVal = (v) => v !== '' && v !== '—';
    const kept = rows.filter((row) =>
      (row.kind !== 'ref' && row.kind !== 'kpi') || hasVal(row.up) || hasVal(row.down) || hasVal(row.total));
    return { title: b._t(title), cols: 3, rows: kept };
  };

  // 双列段（上行 / 下行）：list 为 [label, upKey, downKey, unit]，上下行皆空则剔除
  b._dualSeg = function (title, list) {
    const rows = list
      .map((t) => b._dualRow(t[0], t[1], t[2], t[3]))
      .filter((row) => !(row.up === '—' && row.down === '—'));
    return { title: b._t(title), cols: 2, rows };
  };

  // ============ GEO 链路瀑布（弯管转发器模型） ============
  b.buildGEO = function () {
    const r = results;
    if (r.linkmargin === undefined) return [];
    const segs = [];

    // ① 载波与调制参数（链路级，单列）
    segs.push(b._refSeg('载波与调制参数', [
      ['载波带宽', 'allocBandwidthResult', 'kHz'],
      ['功率带宽', 'PowerBWResult', 'kHz'],
      ['频谱效率', 'spectralEfficiencyResult', 'bit/s/Hz'],
      ['信息速率', 'infoRateResult', 'kbps'],
      ['载波速率', 'carrierRateResult', 'kbps'],
      ['符号速率', 'symbolRateResult', 'ksps'],
      ['码片速率', 'ChipRateResult', 'kcps'],
      ['调制方式', 'modulationResult', ''],
      ['调制因子', 'modulationFactorResult', ''],
      ['FEC 码率', 'fecResult', ''],
      ['误码率', 'berResult', ''],
      ['门限 Eb/N₀', 'ebnoResult', 'dB'],
      ['门限 Es/N₀', 'esnoResult', 'dB'],
      ['Eb/N₀', 'ebnoActualResult', 'dB'],
      ['Es/N₀', 'esnoActualResult', 'dB'],
      ['载波噪声带宽', 'RXnoiseBW', 'dB-Hz'],
      ['系统余量', 'marginResult', 'dB']
    ]));

    // ② 几何与天线（上行 / 下行 双列）
    const geoSeg = b._dualSeg('几何与天线（上行 / 下行）', [
      ['频率', 'uplinkFrequencyResult', 'downlinkFrequencyResult', 'GHz'],
      ['极化方式', 'uplinkPolarizationResult', 'downlinkPolarizationResult', ''],
      ['极化角', 'uplinkPolarizationAngleResult', 'downlinkPolarizationAngleResult', '°'],
      ['地球站天线口径', 'earthAntennaDiameterResult', 'rxAntennaDiameterResult', '米'],
      ['地球站经度', 'earthLongitudeResult', 'rxLongitudeResult', '°E'],
      ['地球站纬度', 'earthLatitudeResult', 'rxLatitudeResult', '°N'],
      ['对卫星仰角', 'elevationResult', 'rxElevationResult', '°'],
      ['对卫星方位角', 'azimuthResult', 'rxAzimuthResult', '°'],
      ['天线效率', 'earthAntennaEfficiencyResult', 'rxAntennaEfficiencyResult', '%'],
      ['波长', 'wavelengthResult', 'rxWavelengthResult', 'm'],
      ['3dB 波束宽度', 'beamWidthResult', 'theta3', '°'],
      ['天线增益', 'txAntennaGainResult', 'rxAntennaGainResult', 'dBi'],
      ['星地距离', 'slantRangeResult', 'rxSlantRangeResult', 'km']
    ]);
    // 在频率行上方插入「城市」行（上行=发信站城市，下行=收信站城市）
    geoSeg.rows.unshift({
      key: '城市', kind: 'ref', sign: '', label: b._t('城市'),
      up: b._disp(txLocation), down: b._disp(rxLocation),
      total: '', unit: '', cum: ''
    });
    segs.push(geoSeg);

    // ③ 传播损耗（上行 / 下行 双列）
    segs.push(b._dualSeg('传播损耗（上行 / 下行）', [
      ['自由空间损耗', 'uplinkFSLResult', 'downlinkFSLResult', 'dB'],
      ['大气衰减 P.676', 'uplinkAtmosphericAttenuationResult', 'downlinkAtmosphericAttenuationResult', 'dB'],
      ['雨衰 P.618', 'uplinkRainAttenuation', 'downlinkRainAttenuationResult', 'dB'],
      ['云衰 P.840', 'uplinkCloudAttenuation', 'downlinkCloudAttenuation', 'dB'],
      ['其他损耗', 'uplinkMiscLossResult', 'downlinkMiscLossResult', 'dB'],
      ['总衰减', 'uplinkTotalAttenuationResult', 'downlinkTotalAttenuationResult', 'dB'],
      ['雨层高度 P.839', 'uplinkRainHeightResult', 'downlinkRainHeightResult', 'km']
    ]));

    // ④ 卫星与转发器（单列）
    segs.push(b._refSeg('卫星与转发器', [
      ['卫星轨道位置', 'orbitPositionResult', '°E'],
      ['轨道高度', 'orbitAltitudeResult', 'km'],
      ['轨道速度', 'orbitVelocityResult', 'km/s'],
      ['链路时延(单程)', 'linkDelayResult', 'ms'],
      ['上行最大多普勒', 'maxDopplerUplinkResult', 'kHz'],
      ['下行最大多普勒', 'maxDopplerDownlinkResult', 'kHz'],
      ['卫星饱和 EIRP', 'EIRPsResult', 'dBW'],
      ['卫星天线增益', 'antennaGainResult', 'dBi'],
      ['卫星 SFD', 'SFDsResult', 'dBW/m²'],
      ['IBO', 'BOiResult', 'dB'],
      ['OBO', 'BOoResult', 'dB'],
      ['转发器带宽', 'transponderBandwidthResult', 'MHz'],
      ['卫星功率谱密度', 'satellitePSDResult', 'dBW/Hz']
    ]));

    // ⑤ 旁瓣·功率谱·增益与噪声（单列）
    segs.push(b._refSeg('旁瓣·功率谱·增益与噪声', [
      ['功放建议功率(W)', 'paRecommendation', 'W'],
      ['旁瓣发射增益', 'txSidelobeGainResult', 'dBi'],
      ['旁瓣 EIRP', 'txSidelobeEIRPResult', 'dBW'],
      ['旁瓣功率谱密度', 'txSidelobePSDResult', 'dBW/Hz'],
      ['地球站功率谱密度', 'stationPSDResult', 'dBW/Hz'],
      ['ITU 旁瓣 PSD 建议值', 'ituPsdLimitHz', 'dBW/Hz'],
      ['到达卫星通量密度（晴天）', 'PFDcResult', 'dBW/m²'],
      ['卫星到地面 PFD', 'satellitePFD', 'dBW/m²'],
      ['ITU PFD 限值', 'ituPfdLimitPerM2', 'dBW/m²'],
      ['接收旁瓣增益', 'rxSidelobeGainResult', 'dBi'],
      ['接收馈线损耗', 'rxFeederLossResult', 'dB'],
      ['G/T', 'gOverTeResult', 'dB/K'],
      ['G/T 劣化', 'gOverTdegradationResult', 'dB'],
      ['天线噪声温度', 'antennaNoiseTempResult', 'K'],
      ['接收机噪声温度', 'receiverNoiseTempResult', 'K'],
      ['雨噪声温度', 'rainNoiseTempResult', 'K'],
      ['系统噪声温度', 'systemNoiseTempKResult', 'K'],
      ['系统噪声温度(dB)', 'systemNoiseTempDbResult', 'dBK']
    ]));

    // ⑥ 链路预算级联（上行 / 下行 / 合计 三列）
    // 设计目标：整张表「从上往下逐行可算通」。每个 `=` 是一个累加检查点，
    // 每个 `+ / −` 是一步可手算的加减；干扰则汇总为单行「干扰损失」桥接热噪声与实际值。
    // 转换链：到达载波电平 C(dBW) ──+G/T──▶ C/T(dBW/K) ──+228.6(−玻尔兹曼常数k)──▶ C/N₀(dBHz) ──−噪声带宽──▶ C/N(热)──−干扰损失──▶ C/N(实际)
    // 合计：上行C/N ⊕ 下行C/N（噪声并联）= 合计C/N；链路余量 = 合计C/N − 门限C/N。
    const C = b._cRow;
    const T = b._cTri;
    const num = (k) => b._num(r[k]);
    const KB = 228.6; // −玻尔兹曼常数 k（dB）
    const noiseBW = num('RXnoiseBW');
    // 功放回退：功放建议功率 − 回退 = 实际输出（selectedPower）
    const paBackoffDb = num('paRecommendationdBResult') - num('selectedPowerResult');
    // 上行：沿功率链得到到达卫星热噪声 C/N，再扣除上行干扰损失 → 引擎实际上行 C/N
    const cUp = num('stationEIRPResult') - num('uplinkFSLResult') - num('uplinkAtmosphericAttenuationResult')
      - num('uplinkRainAttenuation') - num('uplinkCloudAttenuation') - num('uplinkMiscLossResult');
    const upThermalCN = cUp + num('satelliteGTResult') + KB - noiseBW;
    const upIntfLoss = upThermalCN - num('uplinkCN');
    // 主导降雨场景：上行降雨占主导时，下行按晴空（下行雨衰与 G/T 劣化不参与）
    const uplinkRainDominant = num('uplinkPowerRatioResult') > num('downlinkPowerRatioResult');
    const dnRainEff = uplinkRainDominant ? 0 : num('downlinkRainAttenuationResult');
    const dnGtDegEff = uplinkRainDominant ? 0 : num('gOverTdegradationResult');
    // 下行：沿功率链得到到达地面热噪声 C/N，扣除 G/T 劣化（降雨）与下行干扰损失 → 引擎实际下行 C/N
    const cDn = num('transponderOutputEIRP') - num('downlinkFSLResult') - num('downlinkAtmosphericAttenuationResult')
      - dnRainEff - num('downlinkCloudAttenuation') - num('downlinkMiscLossResult');
    const dnThermalCN = cDn + num('gOverTeResult') + KB - noiseBW;
    const dnIntfLoss = dnThermalCN - dnGtDegEff - num('downlinkCN');
    segs.push(b._cascadeTriSeg('链路预算级联（上行 / 下行 / 合计）', [
      // —— 上行：地球站 → 到达卫星 → C/T → C/N₀ → C/N ——
      C('base', '功放建议功率', 'paRecommendationdBResult', 'dBW', 'up'),
      C('loss', '功放回退', paBackoffDb, 'dB', 'up'),
      C('loss', '馈线损耗', 'feederLossResult', 'dB', 'up'),
      C('gain', '发射天线增益', 'txAntennaGainResult', 'dBi', 'up'),
      C('sub', '地球站 EIRP', 'stationEIRPResult', 'dBW', 'up'),
      C('loss', '自由空间损耗', 'uplinkFSLResult', 'dB', 'up'),
      C('loss', '大气衰减 P.676', 'uplinkAtmosphericAttenuationResult', 'dB', 'up'),
      C('loss', '雨衰 P.618', 'uplinkRainAttenuation', 'dB', 'up'),
      C('loss', '云衰 P.840', 'uplinkCloudAttenuation', 'dB', 'up'),
      C('loss', '其他损耗', 'uplinkMiscLossResult', 'dB', 'up'),
      C('sub', '到达卫星载波电平 C', null, 'dBW', 'up'),
      C('ref', '到达卫星通量密度', 'arrivalPFDAtSatelliteResult', 'dBW/m²', 'up'),
      C('gain', '卫星 G/T', 'satelliteGTResult', 'dB/K', 'up'),
      C('chk', '上行 C/T', null, 'dBW/K', 'up'),
      C('gain', '−玻尔兹曼常数 k', KB, 'dB', 'up'),
      C('chk', '上行 C/N₀', null, 'dBHz', 'up'),
      C('loss', '载波噪声带宽 10·lgB', noiseBW, 'dB', 'up'),
      C('chk', '上行 C/N（热噪声）', null, 'dB', 'up'),
      C('loss', '上行干扰损失 ACI/ASI/XPI/IM', upIntfLoss, 'dB', 'up'),
      C('sub', '上行 C/N', null, 'dB', 'up'),
      // —— 下行：卫星转发器 → 到达地面 → C/T → C/N₀ → C/N ——
      C('base', '卫星饱和 EIRP', 'EIRPsResult', 'dBW', 'down'),
      C('loss', 'OBO', 'BOoResult', 'dB', 'down'),
      C('loss', '转发器工作区回退', 'actualTransponderCapacityResult', 'dB', 'down'),
      C('sub', '转发器输出 EIRP', 'transponderOutputEIRP', 'dBW', 'down'),
      C('ref', '卫星功率谱密度', 'satellitePSDResult', 'dBW/Hz', 'down'),
      C('loss', '自由空间损耗', 'downlinkFSLResult', 'dB', 'down'),
      C('loss', '大气衰减 P.676', 'downlinkAtmosphericAttenuationResult', 'dB', 'down'),
      C('loss', '雨衰 P.618', dnRainEff, 'dB', 'down'),
      C('loss', '云衰 P.840', 'downlinkCloudAttenuation', 'dB', 'down'),
      C('loss', '其他损耗', 'downlinkMiscLossResult', 'dB', 'down'),
      C('sub', '到达地面载波电平 C', null, 'dBW', 'down'),
      C('ref', '卫星到地面 PFD', 'arrivalPFDAtGroundResult', 'dBW/m²', 'down'),
      C('ref', '接收天线增益', 'rxAntennaGainResult', 'dBi', 'down'),
      C('gain', '地球站 G/T', 'gOverTeResult', 'dB/K', 'down'),
      C('loss', 'G/T 劣化（降雨）', dnGtDegEff, 'dB', 'down'),
      C('chk', '下行 C/T', null, 'dBW/K', 'down'),
      C('gain', '−玻尔兹曼常数 k', KB, 'dB', 'down'),
      C('chk', '下行 C/N₀', null, 'dBHz', 'down'),
      C('loss', '载波噪声带宽 10·lgB', noiseBW, 'dB', 'down'),
      C('chk', '下行 C/N（热噪声）', null, 'dB', 'down'),
      C('loss', '下行干扰损失 ACI/ASI/XPI/IM', dnIntfLoss, 'dB', 'down'),
      C('sub', '下行 C/N', null, 'dB', 'down'),
      // —— 合成与余量：上行 ⊕ 下行（噪声并联）= 合计 ——
      T('kpi', 'C/N（合成）', 'uplinkCN', 'downlinkCN', 'carrierTotalCN', 'dB'),
      T('ref', '门限 C/N', null, null, 'thresholdCN', 'dB'),
      T('margin', '链路余量', null, null, 'linkmargin', 'dB')
    ]));

    // ⑦ 可用度与资源（计算结果，单列）
    segs.push(b._refSeg('可用度与资源', [
      ['系统可用度', 'systemAvailabilityResult', '%'],
      ['上行可用度', 'uplinkAvailabilityResult', '%'],
      ['下行可用度', 'downlinkAvailabilityResult', '%'],
      ['年中断(分钟)', 'interruptionMinutes', 'min'],
      ['年中断(小时)', 'interruptionHours', 'h'],
      ['转发器受限因素', 'transponderLimitedBy', ''],
      ['最大载波数', 'maxCarrierCount', ''],
      ['带宽占用比', 'bandwidthUsageRatio', '%'],
      ['功率占用比', 'powerUsageRatio', '%'],
      ['功放实际输出', 'selectedPowerResult', 'dBW'],
      ['功放实际输出(W)', 'selectedPowerWResult', 'W'],
      ['功放建议值', 'paRecommendationdBResult', 'dBW'],
      ['功放建议值(W)', 'paRecommendation', 'W'],
      ['UPC 上行功控余量', 'UPCmarginResult', 'dB']
    ]));

    return segs;
  };

  // ============ NGSO 链路瀑布（透明弯管 + 星间链路 ISL 模型） ============
  // 与 GEO 构建器完全独立：卫星段改为「卫星参数」（无轨道位置）、级联引入 ISL、
  // 合成为 上行 ⊕ ISL ⊕ 下行，并新增 ISL 性能评估段。改动本函数不影响 GEO。
  b.buildNGSO = function () {
    const r = results;
    if (r.linkmargin === undefined) return [];
    const segs = [];
    const hasIsl = b._num(r.islHopsResult) > 0;

    // ① 载波与调制参数（链路级，单列）
    segs.push(b._refSeg('载波与调制参数', [
      ['载波带宽', 'allocBandwidthResult', 'kHz'],
      ['功率带宽', 'PowerBWResult', 'kHz'],
      ['频谱效率', 'spectralEfficiencyResult', 'bit/s/Hz'],
      ['信息速率', 'infoRateResult', 'kbps'],
      ['载波速率', 'carrierRateResult', 'kbps'],
      ['符号速率', 'symbolRateResult', 'ksps'],
      ['码片速率', 'ChipRateResult', 'kcps'],
      ['调制方式', 'modulationResult', ''],
      ['调制因子', 'modulationFactorResult', ''],
      ['FEC 码率', 'fecResult', ''],
      ['误码率', 'berResult', ''],
      ['门限 Eb/N₀', 'ebnoResult', 'dB'],
      ['门限 Es/N₀', 'esnoResult', 'dB'],
      ['Eb/N₀', 'ebnoActualResult', 'dB'],
      ['Es/N₀', 'esnoActualResult', 'dB'],
      ['载波噪声带宽', 'RXnoiseBW', 'dB-Hz'],
      ['系统余量', 'marginResult', 'dB']
    ]));

    // ② 几何与天线（上行 / 下行 双列）。NGSO「对卫星仰角」为最低仰角
    // 注：NGSO 不含「极化角」——卫星位置时变，GEO 式极化偏转/方位反算不适用（恒为 0，已移除）
    const geoSeg = b._dualSeg('几何与天线（上行 / 下行）', [
      ['频率', 'uplinkFrequencyResult', 'downlinkFrequencyResult', 'GHz'],
      ['极化方式', 'uplinkPolarizationResult', 'downlinkPolarizationResult', ''],
      ['地球站天线口径', 'earthAntennaDiameterResult', 'rxAntennaDiameterResult', '米'],
      ['地球站经度', 'earthLongitudeResult', 'rxLongitudeResult', '°E'],
      ['地球站纬度', 'earthLatitudeResult', 'rxLatitudeResult', '°N'],
      ['对卫星仰角', 'elevationResult', 'rxElevationResult', '°'],
      ['天线效率', 'earthAntennaEfficiencyResult', 'rxAntennaEfficiencyResult', '%'],
      ['波长', 'wavelengthResult', 'rxWavelengthResult', 'm'],
      ['3dB 波束宽度', 'beamWidthResult', 'theta3', '°'],
      ['天线增益', 'txAntennaGainResult', 'rxAntennaGainResult', 'dBi'],
      ['星地距离', 'slantRangeResult', 'rxSlantRangeResult', 'km']
    ]);
    geoSeg.rows.unshift({
      key: '城市', kind: 'ref', sign: '', label: b._t('城市'),
      up: b._disp(txLocation), down: b._disp(rxLocation),
      total: '', unit: '', cum: ''
    });
    // 可见性几何（并入几何天线段，上行/下行双列——上下行轨道高度/仰角可不同，结果可不同）
    // 纯轨道几何，依据 Maral&Bousquet/Wertz：周期 P=2π√(r³/μ)、覆盖地心半角 λ=arccos((Re/r)cosε)−ε、
    // 地面覆盖半径 Re·λ、最大过境时长 λ·P/π。重访/可见星数需星座规模，工具无输入，故不展示。
    const visRow = (label, upKey, downKey, unit) => ({
      key: label, kind: 'ref', sign: '', label: b._t(label),
      up: b._disp(r[upKey]), down: b._disp(r[downKey]), total: '', unit: b._t(unit) || '', cum: ''
    });
    geoSeg.rows.push(
      visRow('轨道周期', 'orbitPeriodUpResult', 'orbitPeriodDownResult', 'min'),
      visRow('覆盖地心半角', 'coverageHalfAngleUpResult', 'coverageHalfAngleDownResult', '°'),
      visRow('地面覆盖半径', 'coverageRadiusUpResult', 'coverageRadiusDownResult', 'km'),
      visRow('最大过境时长(天顶)', 'maxPassDurationUpResult', 'maxPassDurationDownResult', 'min')
    );
    segs.push(geoSeg);

    // ③ 传播损耗（上行 / 下行 双列）
    segs.push(b._dualSeg('传播损耗（上行 / 下行）', [
      ['自由空间损耗', 'uplinkFSLResult', 'downlinkFSLResult', 'dB'],
      ['大气衰减 P.676', 'uplinkAtmosphericAttenuationResult', 'downlinkAtmosphericAttenuationResult', 'dB'],
      ['雨衰 P.618', 'uplinkRainAttenuation', 'downlinkRainAttenuationResult', 'dB'],
      ['云衰 P.840', 'uplinkCloudAttenuation', 'downlinkCloudAttenuation', 'dB'],
      ['其他损耗', 'uplinkMiscLossResult', 'downlinkMiscLossResult', 'dB'],
      ['总衰减', 'uplinkTotalAttenuationResult', 'downlinkTotalAttenuationResult', 'dB'],
      ['雨层高度 P.839', 'uplinkRainHeightResult', 'downlinkRainHeightResult', 'km']
    ]));

    // ④ 卫星参数（NGSO：无轨道位置；上下行轨道高度/速度/时延/多普勒可不同 → 双列；
    //    卫星载荷参数按收发侧归列：单位面积增益/SFD/IBO 为上行接收侧，EIRP/OBO/PSD 为下行发射侧）
    segs.push(b._dualSeg('卫星参数（上行 / 下行）', [
      ['轨道高度', 'orbitAltitudeUpResult', 'orbitAltitudeResult', 'km'],
      ['轨道速度(惯性系)', 'orbitVelocityUpResult', 'orbitVelocityResult', 'km/s'],
      ['相对地面运动速度', 'groundRelVelUpResult', 'groundRelVelResult', 'km/s'],
      ['链路时延(单程·端到端)', 'linkDelayResult', '_none', 'ms'],
      ['最大多普勒', 'maxDopplerUplinkResult', 'maxDopplerDownlinkResult', 'kHz'],
      ['卫星天线单位面积增益', 'antennaGainResult', '_none', 'dBi/m²'],
      ['卫星 SFD', 'SFDsResult', '_none', 'dBW/m²'],
      ['IBO', 'BOiResult', '_none', 'dB'],
      ['卫星饱和 EIRP', '_none', 'EIRPsResult', 'dBW'],
      ['OBO', '_none', 'BOoResult', 'dB'],
      ['转发器带宽', 'transponderBandwidthResult', 'transponderBandwidthResult', 'MHz'],
      ['卫星功率谱密度', '_none', 'satellitePSDResult', 'dBW/Hz']
    ]));

    // ⑤ 功率谱·PFD·增益与噪声（单列）
    // NGSO 已移除 GEO 弧「邻星旁瓣/隔离」相关行（旁瓣增益/EIRP/PSD、ITU 旁瓣 PSD 建议值、接收旁瓣增益）——
    // 这些基于邻星轨位差 deltaTheta + ITU-R S.465，是 GEO 静止弧概念，不适配 NGSO。
    // 保留落地 PFD vs ITU Article 21 限值（对 NGSO 下行有效）。
    segs.push(b._refSeg('功率谱·PFD·增益与噪声', [
      ['功放建议功率(W)', 'paRecommendation', 'W'],
      ['地球站功率谱密度', 'stationPSDResult', 'dBW/Hz'],
      ['到达卫星通量密度（晴天）', 'PFDcResult', 'dBW/m²'],
      ['卫星到地面 PFD', 'satellitePFD', 'dBW/m²'],
      ['ITU PFD 限值(Art.21)', 'ituPfdLimitPerM2', 'dBW/m²'],
      ['接收馈线损耗', 'rxFeederLossResult', 'dB'],
      ['G/T', 'gOverTeResult', 'dB/K'],
      ['G/T 劣化', 'gOverTdegradationResult', 'dB'],
      ['天线噪声温度', 'antennaNoiseTempResult', 'K'],
      ['接收机噪声温度', 'receiverNoiseTempResult', 'K'],
      ['雨噪声温度', 'rainNoiseTempResult', 'K'],
      ['系统噪声温度', 'systemNoiseTempKResult', 'K'],
      ['系统噪声温度(dB)', 'systemNoiseTempDbResult', 'dBK']
    ]));

    // ⑥ 链路预算级联（上行 / 下行 / ISL / 合计 三列）
    // NGSO 合成：上行 C/N ⊕ ISL 等效 C/N ⊕ 下行 C/N（噪声并联）= 合计 C/N。
    // ISL 段折算到载波噪声带宽后并入合成，使整表「逐行可算通」。
    const C = b._cRow;
    const T = b._cTri;
    const num = (k) => b._num(r[k]);
    const KB = 228.6;
    const noiseBW = num('RXnoiseBW');
    const paBackoffDb = num('paRecommendationdBResult') - num('selectedPowerResult');
    const cUp = num('stationEIRPResult') - num('uplinkFSLResult') - num('uplinkAtmosphericAttenuationResult')
      - num('uplinkRainAttenuation') - num('uplinkCloudAttenuation') - num('uplinkMiscLossResult');
    const upThermalCN = cUp + num('satelliteGTResult') + KB - noiseBW;
    const upIntfLoss = upThermalCN - num('uplinkCN');
    const uplinkRainDominant = num('uplinkPowerRatioResult') > num('downlinkPowerRatioResult');
    const dnRainEff = uplinkRainDominant ? 0 : num('downlinkRainAttenuationResult');
    const dnGtDegEff = uplinkRainDominant ? 0 : num('gOverTdegradationResult');
    const cDn = num('transponderOutputEIRP') - num('downlinkFSLResult') - num('downlinkAtmosphericAttenuationResult')
      - dnRainEff - num('downlinkCloudAttenuation') - num('downlinkMiscLossResult');
    const dnThermalCN = cDn + num('gOverTeResult') + KB - noiseBW;
    const dnIntfLoss = dnThermalCN - dnGtDegEff - num('downlinkCN');

    const cascadeRows = [
      // —— 上行：地球站 → 到达卫星 → C/T → C/N₀ → C/N ——
      C('base', '功放建议功率', 'paRecommendationdBResult', 'dBW', 'up'),
      C('loss', '功放回退', paBackoffDb, 'dB', 'up'),
      C('loss', '馈线损耗', 'feederLossResult', 'dB', 'up'),
      C('gain', '发射天线增益', 'txAntennaGainResult', 'dBi', 'up'),
      C('sub', '地球站 EIRP', 'stationEIRPResult', 'dBW', 'up'),
      C('loss', '自由空间损耗', 'uplinkFSLResult', 'dB', 'up'),
      C('loss', '大气衰减 P.676', 'uplinkAtmosphericAttenuationResult', 'dB', 'up'),
      C('loss', '雨衰 P.618', 'uplinkRainAttenuation', 'dB', 'up'),
      C('loss', '云衰 P.840', 'uplinkCloudAttenuation', 'dB', 'up'),
      C('loss', '其他损耗', 'uplinkMiscLossResult', 'dB', 'up'),
      C('sub', '到达卫星载波电平 C', null, 'dBW', 'up'),
      C('ref', '到达卫星通量密度', 'arrivalPFDAtSatelliteResult', 'dBW/m²', 'up'),
      C('gain', '卫星 G/T', 'satelliteGTResult', 'dB/K', 'up'),
      C('chk', '上行 C/T', null, 'dBW/K', 'up'),
      C('gain', '−玻尔兹曼常数 k', KB, 'dB', 'up'),
      C('chk', '上行 C/N₀', null, 'dBHz', 'up'),
      C('loss', '载波噪声带宽 10·lgB', noiseBW, 'dB', 'up'),
      C('chk', '上行 C/N（热噪声）', null, 'dB', 'up'),
      C('loss', '上行干扰损失 ACI/ASI/XPI/IM', upIntfLoss, 'dB', 'up'),
      C('sub', '上行 C/N', null, 'dB', 'up'),
      // —— 下行：卫星转发器 → 到达地面 → C/T → C/N₀ → C/N ——
      C('base', '卫星饱和 EIRP', 'EIRPsResult', 'dBW', 'down'),
      C('loss', 'OBO', 'BOoResult', 'dB', 'down'),
      C('loss', '转发器工作区回退', 'actualTransponderCapacityResult', 'dB', 'down'),
      C('sub', '转发器输出 EIRP', 'transponderOutputEIRP', 'dBW', 'down'),
      C('ref', '卫星功率谱密度', 'satellitePSDResult', 'dBW/Hz', 'down'),
      C('loss', '自由空间损耗', 'downlinkFSLResult', 'dB', 'down'),
      C('loss', '大气衰减 P.676', 'downlinkAtmosphericAttenuationResult', 'dB', 'down'),
      C('loss', '雨衰 P.618', dnRainEff, 'dB', 'down'),
      C('loss', '云衰 P.840', 'downlinkCloudAttenuation', 'dB', 'down'),
      C('loss', '其他损耗', 'downlinkMiscLossResult', 'dB', 'down'),
      C('sub', '到达地面载波电平 C', null, 'dBW', 'down'),
      C('ref', '卫星到地面 PFD', 'arrivalPFDAtGroundResult', 'dBW/m²', 'down'),
      C('ref', '接收天线增益', 'rxAntennaGainResult', 'dBi', 'down'),
      C('gain', '地球站 G/T', 'gOverTeResult', 'dB/K', 'down'),
      C('loss', 'G/T 劣化（降雨）', dnGtDegEff, 'dB', 'down'),
      C('chk', '下行 C/T', null, 'dBW/K', 'down'),
      C('gain', '−玻尔兹曼常数 k', KB, 'dB', 'down'),
      C('chk', '下行 C/N₀', null, 'dBHz', 'down'),
      C('loss', '载波噪声带宽 10·lgB', noiseBW, 'dB', 'down'),
      C('chk', '下行 C/N（热噪声）', null, 'dB', 'down'),
      C('loss', '下行干扰损失 ACI/ASI/XPI/IM', dnIntfLoss, 'dB', 'down'),
      C('sub', '下行 C/N', null, 'dB', 'down')
    ];
    // —— 星间链路 ISL 并入「上行侧」：弯管端到端落地前噪声逐段累加，上行 C/N ⊕ ISL = 有效上行 C/N ——
    // 插在「上行 C/N」之后、下行段之前，得到「上行 C/N（含 ISL）」，使合成 上行(含ISL)⊕下行=合计 逐行算得通
    if (hasIsl) {
      const islUpRows = [
        C('ref', 'ISL 跳数', 'islHopsResult', '跳', 'up'),
        C('ref', 'ISL 单跳 C/T', 'islPerHopCTResult', 'dBW/K', 'up'),
        // 折算入总 C/T 的 ISL 等效 C/N：上行 C/N ⊕ 该值 = 上行 C/N（含 ISL），逐行算得通
        C('ref', 'ISL 等效 C/N（计入总C/T）', 'islCascadeCNResult', 'dB', 'up'),
        C('sub', '上行 C/N（含 ISL）', 'uplinkWithIslCN', 'dB', 'up')
      ];
      const idx = cascadeRows.findIndex((row) => row.key === 'up·上行 C/N');
      if (idx >= 0) cascadeRows.splice(idx + 1, 0, ...islUpRows);
      else cascadeRows.push(...islUpRows);
    }
    // —— 合成与余量：有效上行（含 ISL）⊕ 下行（噪声并联）= 合计 ——
    cascadeRows.push(
      T('kpi', 'C/N（合成）', hasIsl ? 'uplinkWithIslCN' : 'uplinkCN', 'downlinkCN', 'carrierTotalCN', 'dB'),
      T('ref', '门限 C/N', null, null, 'thresholdCN', 'dB'),
      T('margin', '链路余量', null, null, 'linkmargin', 'dB')
    );
    segs.push(b._cascadeTriSeg('链路预算级联（上行 / 下行 / 合计）', cascadeRows));

    // ⑥-b 星间链路 ISL（性能评估，单列；按 islMode 分链路展示，逐行可算通）
    // 经验值(manual)：仅展示输入 SNR → 折算单跳 C/T；
    // 微波(rf)：EIRP − FSL(频率/距离) + G/T − 其他损耗 = 单跳 C/T；
    // 激光(optical)：发射光功率 + 发射增益 − 光学FSL − 指向损耗 + 接收增益 = 接收光功率，−N₀ = C/N₀，+k = 单跳 C/T。
    if (hasIsl) {
      const islMode = r.islModeResult || 'manual';
      const islRows = [['ISL 跳数', 'islHopsResult', '跳']];
      if (islMode === 'rf') {
        islRows.push(
          ['ISL 频率', 'islRfFreqResult', 'GHz'],
          ['单跳距离', 'islRfDistResult', 'km'],
          ['ISL EIRP', 'islRfEirpResult', 'dBW'],
          ['ISL 自由空间损耗', 'islRfFslResult', 'dB'],
          ['ISL G/T', 'islRfGtResult', 'dB/K'],
          ['其他损耗', 'islRfMiscLossResult', 'dB']
        );
      } else if (islMode === 'optical') {
        islRows.push(
          ['波长', 'islOptWavelengthResult', 'nm'],
          ['发射口径', 'islOptTxApertureResult', 'm'],
          ['接收口径', 'islOptRxApertureResult', 'm'],
          ['单跳距离', 'islOptDistResult', 'km'],
          ['发射光功率', 'islOptTxPowerResult', 'dBm'],
          ['发射望远镜增益', 'islOptGTxResult', 'dBi'],
          ['光学自由空间损耗', 'islOptFslResult', 'dB'],
          ['指向+光学损耗', 'islOptPointLossResult', 'dB'],
          ['接收望远镜增益', 'islOptGRxResult', 'dBi'],
          ['接收光功率', 'islOptPRxResult', 'dBm'],
          ['接收灵敏度', 'islOptSensResult', 'dBm'],
          ['灵敏度参考速率', 'islOptSensRateResult', 'Mbps'],
          ['灵敏度 Eb/N₀', 'islOptSensEbN0Result', 'dB'],
          ['等效噪声谱密度 N₀', 'islOptN0Result', 'dBm/Hz'],
          ['单跳 C/N₀', 'islOptCN0Result', 'dBHz']
        );
      } else {
        islRows.push(
          ['输入 SNR', 'islManualSnrResult', 'dB'],
          ['参考带宽', 'islManualRefBwResult', 'MHz']
        );
      }
      islRows.push(
        ['ISL 单跳 C/T', 'islPerHopCTResult', 'dBW/K'],
        ['ISL 单跳 C/N', 'islPerHopCNResult', 'dB'],
        ['ISL 等效 C/T（并联）', 'islTotalCTResult', 'dBW/K'],
        ['ISL 等效 C/N（并联）', 'islTotalCNResult', 'dB'],
        ['ISL 对上行 C/N 代价', 'islImpactResult', 'dB']
      );
      const modeLabel = islMode === 'rf' ? '微波链路' : (islMode === 'optical' ? '激光链路' : '经验值');
      segs.push(b._refSeg('星间链路 ISL（' + modeLabel + '）', islRows));
    }

    // ⑦ 可用度与资源（计算结果，单列）
    segs.push(b._refSeg('可用度与资源', [
      ['系统可用度', 'systemAvailabilityResult', '%'],
      ['上行可用度', 'uplinkAvailabilityResult', '%'],
      ['下行可用度', 'downlinkAvailabilityResult', '%'],
      ['年中断(分钟)', 'interruptionMinutes', 'min'],
      ['年中断(小时)', 'interruptionHours', 'h'],
      ['转发器受限因素', 'transponderLimitedBy', ''],
      ['最大载波数', 'maxCarrierCount', ''],
      ['带宽占用比', 'bandwidthUsageRatio', '%'],
      ['功率占用比', 'powerUsageRatio', '%'],
      ['功放实际输出', 'selectedPowerResult', 'dBW'],
      ['功放实际输出(W)', 'selectedPowerWResult', 'W'],
      ['功放建议值', 'paRecommendationdBResult', 'dBW'],
      ['功放建议值(W)', 'paRecommendation', 'W'],
      ['UPC 上行功控余量', 'UPCmarginResult', 'dB']
    ]));

    return segs;
  };

  return b;
}

// 构建链路瀑布 segments（路由：按轨道类型分派到 GEO / NGSO 专属构建器）
function buildWaterfallSegments(ctx) {
  const builder = createBuilder(ctx || {});
  return (ctx && ctx.orbitType === 'NGSO') ? builder.buildNGSO() : builder.buildGEO();
}

// 链路总览关键指标（多链路专业版报告首页对比表用）：值为引擎展示字符串，单位由报告端补
function buildLinkSummary(results, meta) {
  const r = results || {};
  const m = meta || {};
  const d = (v) => (v === undefined || v === null || v === '' || v === '-') ? '—' : ('' + v);
  // NGSO 含 ISL 时，上行侧口径取「上行 C/N（含 ISL）」，与级联表合成行一致
  const hasIsl = parseFloat(r.islHopsResult) > 0;
  const upCN = (hasIsl && r.uplinkWithIslCN !== undefined) ? r.uplinkWithIslCN : r.uplinkCN;
  return {
    satellite: d(m.satelliteName),
    orbit: d(m.orbitLabel),
    band: d(m.frequencyBand),
    infoRate: d(r.infoRateResult),
    modulation: d(r.modulationResult),
    fec: d(r.fecResult),
    carrierBW: d(r.allocBandwidthResult),
    powerBW: d(r.PowerBWResult),
    upCN: d(upCN),
    downCN: d(r.downlinkCN),
    totalCN: d(r.carrierTotalCN),
    thresholdCN: d(r.thresholdCN),
    linkMargin: d(r.linkmargin),
    availability: d(r.systemAvailabilityResult),
    bwUsage: d(r.bandwidthUsageRatio),
    pwrUsage: d(r.powerUsageRatio),
    paPower: d(r.paRecommendation),
    paPowerDb: d(r.paRecommendationdBResult)
  };
}

module.exports = {
  WF_DICT,
  buildWaterfallSegments,
  buildLinkSummary
};

// 云函数入口文件 - 生成卫星链路预算报告（Excel/PDF/Word）
const cloud = require('wx-server-sdk');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, TableLayoutType, VerticalAlign, ShadingType } = require('docx');
const path = require('path');
const fs = require('fs');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 翻译文本（与报告页面完全一致）
const TRANSLATIONS = {
  zh: {
    // 标题区
    reportTitle: '卫星通信链路预算分析报告',
    institutionLine: 'LinkLab Satellite Analysis',
    frequencyBandSuffix: '频段',
    // 链路评估
    linkStatus: '链路状态',
    linkMargin: '链路余量',
    systemAvailability: '系统可用度',
    // 状态文本
    statusExcellent: '优秀',
    statusGood: '良好',
    statusQualified: '合格',
    statusPoor: '不足',
    // 系统配置
    sectionSystemConfig: 'I. 系统配置',
    infoRate: '信息速率',
    modulation: '调制方式',
    fecCode: 'FEC码率',
    symbolRate: '符号速率',
    allocBandwidth: '占用带宽',
    uplinkFreq: '上行频率',
    downlinkFreq: '下行频率',
    threshold: '门限',
    // 卫星参数
    sectionSatellite: 'II. 卫星参数',
    sfdRef: '卫星SFD',
    transponderBW: '转发器带宽',
    inputBackoff: '转发器IBO',
    outputBackoff: '转发器OBO',
    satelliteEIRP: 'EIRPs',
    satelliteSFD: '信号到星通量密度',
    satellitePSD: '卫星输出功率谱密度',
    groundPFD: '卫星到地通量密度',
    // 链路质量
    sectionLinkQuality: 'III. 链路质量',
    totalCN: '综合C/N',
    thresholdCN: '门限C/N',
    availability: '可用度',
    ber: '误码率',
    bwUsage: '带宽占用',
    pwrUsage: '功率占用',
    // 上下行链路
    sectionUplink: 'IV. 上行链路',
    sectionDownlink: 'V. 下行链路',
    antennaDiameter: '天线口径',
    antennaGain: '天线增益',
    txPower: '发射功率',
    gtValue: 'G/T值',
    stationEIRP: '地面站EIRP',
    eirpOutput: 'EIRP输出',
    polarization: '极化方式',
    elevation: '仰角',
    minElevation: '最低仰角',
    polarAngle: '方位角',
    orbitTypeLabel: '轨道类型',
    orbitAltitude: '轨道高度',
    orbitVelocity: '轨道速度',
    uplinkSlantRange: '上行斜距',
    downlinkSlantRange: '下行斜距',
    slantRange: '星地斜距',
    linkDelay: '链路时延',
    maxDopplerUplink: '上行最大多普勒',
    maxDopplerDownlink: '下行最大多普勒',
    fsl: '自由空间损耗',
    rainAtten: '降雨衰减',
    feederLoss: '馈线损耗',
    uplinkCN: '上行C/N',
    downlinkCN: '下行C/N',
    // 功放配置
    sectionPA: 'VI. 功放配置建议',
    recommendedPower: '推荐功率',
    carrierBW: '载波带宽',
    powerBW: '功率带宽',
    // 汇总
    summaryTitle: '汇总',
    equivalentBwTotal: '等效转发器带宽占用总计',
    linkCount: '链路数量',
    // 页脚
    footerText: '本报告由卫星链路预算计算系统自动生成',
    excelSheetName: '链路预算报告',
    // Excel 专用
    configName: '配置名称',
    satellite: '卫星',
    orbitPosition: '轨道位置',
    frequencyBand: '频段',
    parameter: '参数',
    value: '数值',
    unit: '单位'
  },
  en: {
    // 标题区
    reportTitle: 'Satellite Link Budget Analysis Report',
    institutionLine: 'LinkLab Satellite Analysis',
    frequencyBandSuffix: 'Band',
    // 链路评估
    linkStatus: 'Link Status',
    linkMargin: 'Link Margin',
    systemAvailability: 'Availability',
    // 状态文本
    statusExcellent: 'Excellent',
    statusGood: 'Good',
    statusQualified: 'Qualified',
    statusPoor: 'Poor',
    // 系统配置
    sectionSystemConfig: 'I. System Config',
    infoRate: 'Info Rate',
    modulation: 'Modulation',
    fecCode: 'FEC Code',
    symbolRate: 'Symbol Rate',
    allocBandwidth: 'Bandwidth',
    uplinkFreq: 'Uplink Freq',
    downlinkFreq: 'Downlink Freq',
    threshold: 'Threshold',
    // 卫星参数
    sectionSatellite: 'II. Satellite Params',
    sfdRef: 'Effective SFD',
    transponderBW: 'Transponder BW',
    inputBackoff: 'Input Backoff',
    outputBackoff: 'Output Backoff',
    satelliteEIRP: 'EIRPs',
    satelliteSFD: 'Flux to Satellite',
    satellitePSD: 'Sat Output PSD',
    groundPFD: 'Sat to Ground PFD',
    // 链路质量
    sectionLinkQuality: 'III. Link Quality',
    totalCN: 'Total C/N',
    thresholdCN: 'Threshold C/N',
    availability: 'Availability',
    ber: 'BER',
    bwUsage: 'BW Usage',
    pwrUsage: 'Power Usage',
    // 上下行链路
    sectionUplink: 'IV. Uplink',
    sectionDownlink: 'V. Downlink',
    antennaDiameter: 'Antenna Dia.',
    antennaGain: 'Antenna Gain',
    txPower: 'TX Power',
    gtValue: 'G/T',
    stationEIRP: 'Ground Station EIRP',
    eirpOutput: 'EIRP Output',
    polarization: 'Polarization',
    elevation: 'Elevation',
    minElevation: 'Min Elevation',
    polarAngle: 'Azimuth',
    orbitTypeLabel: 'Orbit Type',
    orbitAltitude: 'Orbit Altitude',
    orbitVelocity: 'Orbit Velocity',
    uplinkSlantRange: 'Uplink Slant Range',
    downlinkSlantRange: 'Downlink Slant Range',
    slantRange: 'Slant Range',
    linkDelay: 'Link Delay',
    maxDopplerUplink: 'Max Uplink Doppler',
    maxDopplerDownlink: 'Max Downlink Doppler',
    fsl: 'Free Space Loss',
    rainAtten: 'Rain Atten.',
    feederLoss: 'Feeder Loss',
    uplinkCN: 'Uplink C/N',
    downlinkCN: 'Downlink C/N',
    // 功放配置
    sectionPA: 'VI. PA Recommendation',
    recommendedPower: 'Rec. Power',
    carrierBW: 'Carrier BW',
    powerBW: 'Power BW',
    // 汇总
    summaryTitle: 'Summary',
    equivalentBwTotal: 'Total Equivalent Transponder BW',
    linkCount: 'Link Count',
    // 页脚
    footerText: 'Generated by Satellite Link Budget System',
    excelSheetName: 'Link Budget Report',
    // Excel 专用
    configName: 'Config Name',
    satellite: 'Satellite',
    orbitPosition: 'Orbit Position',
    frequencyBand: 'Freq Band',
    parameter: 'Parameter',
    value: 'Value',
    unit: 'Unit'
  }
};

// 获取链路状态
function getLinkStatus(linkMargin) {
  try {
    const margin = parseFloat(linkMargin);
    if (margin >= 3) return 'excellent';
    if (margin >= 1) return 'good';
    if (margin >= 0) return 'qualified';
    return 'poor';
  } catch (e) {
    return 'poor';
  }
}

// 格式化日期时间
function formatDateTime(date, format) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

// 自适应格式化带宽（输入为kHz，自动选择合适的单位）
function formatBandwidth(bandwidthKHz) {
  const bw = parseFloat(bandwidthKHz) || 0;
  
  // 转换为MHz
  const bwMHz = bw / 1000;
  if (bwMHz >= 0.01) {
    // MHz显示（保留2位小数，至少0.01MHz）
    return `${bwMHz.toFixed(2)}MHz`;
  }
  
  // kHz显示
  if (bw >= 0.01) {
    return `${bw.toFixed(2)}kHz`;
  }
  
  // Hz显示
  const bwHz = bw * 1000;
  return `${bwHz.toFixed(2)}Hz`;
}

// 多选对比数据（Word/PDF 共用）：参数为行、链路为列，含节标题分组
// 返回 { resultSections, paramSections }，每节 = { title, rows: [{ label, vals: [...], red?, em? }] }
function _buildCompareSections(records, lang, t) {
  const isZh = (lang !== 'en');
  const u = (val, unit) => {
    if (val === undefined || val === null || val === '') return '--';
    return unit ? `${val} ${unit}` : String(val);
  };

  // 每条记录的派生量
  const D = records.map(rec => {
    const { config, sat, lp, r } = rec;
    const isNGSO = sat.orbitType === 'NGSO';
    const ngsoClass = sat.ngsoOrbitClass || 'LEO';
    const dvbLabel = lp.dvbStandard === 'DVB-S' ? 'DVB-S' : lp.dvbStandard === 'DVB-S2' ? 'DVB-S2' : lp.dvbStandard === 'DVB-S2X' ? 'DVB-S2X' : (isZh ? '自定义' : 'Custom');
    const isForward = lp.calcMode === 'forward';
    const noiseLabel = (config.noiseRatioMode || 'ebno') === 'esno' ? 'Es/N0' : 'Eb/N0';
    const linkMargin = r.linkmargin || '0';
    const status = getLinkStatus(linkMargin);
    const statusText = t[`status${status.charAt(0).toUpperCase() + status.slice(1)}`];
    const availWeather = parseFloat(r.systemAvailabilityResult) >= 100
      ? (isZh ? '（晴天）' : ' (Clear Sky)') : (isZh ? '（雨天）' : ' (Rain)');
    const eqBWFmt = formatBandwidth(Math.max(parseFloat(r.allocBandwidthResult) || 0, parseFloat(r.PowerBWResult) || 0));
    const upDistVal = (lp.distanceMode || 'altitude') === 'slantRange' ? u(lp.slantRange, 'km') : u(lp.orbitAltitude, 'km');
    const rxDistVal = (lp.rxDistanceMode || 'altitude') === 'slantRange' ? u(lp.rxSlantRange, 'km') : u(lp.rxOrbitAltitude, 'km');
    return { sat, lp, r, isNGSO, ngsoClass, dvbLabel, isForward, noiseLabel, linkMargin, statusText, availWeather, eqBWFmt, upDistVal, rxDistVal };
  });

  const anyNGSO = D.some(d => d.isNGSO);
  const anyGEO = D.some(d => !d.isNGSO);
  const anyForward = D.some(d => d.isForward);
  const anyReverse = D.some(d => !d.isForward);
  const row = (label, fn, opts) => Object.assign({ label, vals: D.map(fn) }, opts || {});
  const ifNGSO = (fn) => (d) => d.isNGSO ? fn(d) : '--';
  const ifGEO = (fn) => (d) => d.isNGSO ? '--' : fn(d);
  // 仰角行标签：GEO=仰角，NGSO=最低仰角，混选时合并标注
  const elevLabel = anyNGSO && anyGEO ? (isZh ? '仰角/最低仰角' : 'Elev./Min Elev.')
    : anyNGSO ? (isZh ? '最低仰角' : 'Min Elevation') : (isZh ? '仰角' : 'Elevation');

  const resultSections = [
    { title: isZh ? '卫星与转发器' : 'Satellite & Transponder', rows: [
      row(isZh ? '卫星名称' : 'Satellite', d => u(d.sat.satelliteName)),
      row(isZh ? '轨道' : 'Orbit', d => d.isNGSO ? `${d.ngsoClass} / NGSO` : u(d.sat.orbitPosition, '°E')),
      ...(anyNGSO ? [
        row(isZh ? '轨道高度' : 'Orbit Alt.', ifNGSO(d => u(d.r.orbitAltitudeResult, 'km'))),
        row(isZh ? '轨道速度' : 'Orbit Vel.', ifNGSO(d => u(d.r.orbitVelocityResult, 'km/s'))),
      ] : []),
      row(isZh ? '频段' : 'Band', d => u(d.sat.frequencyBand)),
      row(isZh ? '上行频率/极化' : 'UL Freq/Pol', d => `${u(d.r.uplinkFrequencyResult, 'GHz')} (${d.r.uplinkPolarizationResult || ''})`),
      row(isZh ? '下行频率/极化' : 'DL Freq/Pol', d => `${u(d.r.downlinkFrequencyResult, 'GHz')} (${d.r.downlinkPolarizationResult || ''})`),
      row(isZh ? '转发器带宽' : 'Xpdr BW', d => u(d.sat.transponderBandwidth, 'MHz')),
      row(isZh ? '卫星EIRP' : 'Sat. EIRP', d => u(d.r.EIRPsResult, 'dBW')),
      row(isZh ? '卫星SFD' : 'Sat. SFD', d => u(d.r.SFDsResult, 'dBW/m²')),
      row(isZh ? '转发器IBO' : 'IBO', d => u(d.sat.BOi, 'dB')),
      row(isZh ? '转发器OBO' : 'OBO', d => u(d.sat.BOo, 'dB')),
      ...(anyNGSO ? [
        row(isZh ? '上行最大多普勒' : 'Max Doppler UL', ifNGSO(d => u(d.r.maxDopplerUplinkResult, 'kHz'))),
        row(isZh ? '下行最大多普勒' : 'Max Doppler DL', ifNGSO(d => u(d.r.maxDopplerDownlinkResult, 'kHz'))),
        row(isZh ? '链路时延' : 'Link Delay', ifNGSO(d => u(d.r.linkDelayResult, 'ms'))),
      ] : []),
    ]},
    { title: isZh ? '载波与调制' : 'Carrier & Modulation', rows: [
      row(isZh ? '信息速率' : 'Info Rate', d => u(d.r.infoRateResult, 'kbps')),
      row(isZh ? '调制方式' : 'Modulation', d => u(d.r.modulationResult)),
      row('FEC', d => u(d.r.fecResult)),
      row(isZh ? '符号速率' : 'Symbol Rate', d => u(d.r.symbolRateResult, 'ksps')),
      row(isZh ? '门限Eb/N0' : 'Thresh. Eb/N0', d => u(d.r.ebnoResult, 'dB')),
      row(isZh ? '门限Es/N0' : 'Thresh. Es/N0', d => u(d.r.esnoResult, 'dB')),
      row('Eb/N0', d => u(d.r.ebnoActualResult, 'dB')),
      row('Es/N0', d => u(d.r.esnoActualResult, 'dB')),
    ]},
    { title: isZh ? '上行链路' : 'Uplink', rows: [
      row(isZh ? '发信站位置' : 'TX Station', d => u(d.lp.earthStationLocation)),
      row(isZh ? '天线口径' : 'Antenna Dia.', d => u(d.r.earthAntennaDiameterResult, 'm')),
      row(isZh ? '天线增益' : 'Antenna Gain', d => u(d.r.txAntennaGainResult, 'dB')),
      row(isZh ? '发射功率' : 'TX Power', d => `${u(d.r.selectedPowerWResult, 'W')} (${u(d.r.selectedPowerResult, 'dBW')})`),
      row(isZh ? '地面站EIRP' : 'Station EIRP', d => u(d.r.stationEIRPResult, 'dBW')),
      row(elevLabel, d => u(d.r.elevationResult, '°')),
      ...(anyGEO ? [row(isZh ? '方位角' : 'Azimuth', ifGEO(d => u(d.r.azimuthResult, '°')))] : []),
      ...(anyNGSO ? [row(isZh ? '上行斜距' : 'UL Slant Range', ifNGSO(d => u(d.r.slantRangeResult, 'km')))] : []),
      row(isZh ? '自由空间损耗' : 'Free Space Loss', d => u(d.r.uplinkFSLResult, 'dB')),
      row(isZh ? '降雨衰减' : 'Rain Atten.', d => u(d.r.uplinkRainAttenuation, 'dB')),
      row(isZh ? '馈线损耗' : 'Feeder Loss', d => u(d.r.feederLossResult, 'dB')),
      row(isZh ? '上行C/N' : 'Uplink C/N', d => u(d.r.uplinkCN, 'dB')),
    ]},
    { title: isZh ? '下行链路' : 'Downlink', rows: [
      row(isZh ? '收信站位置' : 'RX Station', d => u(d.lp.rxEarthStationLocation)),
      row(isZh ? '天线口径' : 'Antenna Dia.', d => u(d.r.rxAntennaDiameterResult, 'm')),
      row(isZh ? '天线增益' : 'Antenna Gain', d => u(d.r.rxAntennaGainResult, 'dB')),
      row('G/T', d => u(d.r.gOverTeResult, 'dB/K')),
      row(isZh ? 'EIRP输出' : 'EIRP Output', d => u(d.r.RXeirpPerCarrierResult, 'dBW')),
      row(elevLabel, d => u(d.r.rxElevationResult, '°')),
      ...(anyGEO ? [row(isZh ? '方位角' : 'Azimuth', ifGEO(d => u(d.r.rxAzimuthResult, '°')))] : []),
      ...(anyNGSO ? [row(isZh ? '下行斜距' : 'DL Slant Range', ifNGSO(d => u(d.r.rxSlantRangeResult, 'km')))] : []),
      row(isZh ? '自由空间损耗' : 'Free Space Loss', d => u(d.r.downlinkFSLResult, 'dB')),
      row(isZh ? '降雨衰减' : 'Rain Atten.', d => u(d.r.downlinkRainAttenuationResult, 'dB')),
      row(isZh ? '馈线损耗' : 'Feeder Loss', d => u(d.r.rxFeederLossResult, 'dB')),
      row(isZh ? '下行C/N' : 'Downlink C/N', d => u(d.r.downlinkCN, 'dB')),
    ]},
    { title: isZh ? '结论' : 'Conclusion', rows: [
      row(isZh ? '综合C/N' : 'Total C/N', d => u(d.r.carrierTotalCN, 'dB')),
      row(isZh ? '门限C/N' : 'Threshold C/N', d => u(d.r.thresholdCN, 'dB')),
      row(isZh ? '链路余量' : 'Link Margin', d => u(d.linkMargin, 'dB'), { em: true }),
      row(isZh ? '链路状态' : 'Link Status', d => d.statusText),
      row(isZh ? '系统可用度' : 'Availability', d => u(d.r.systemAvailabilityResult, '%') + d.availWeather),
      row(isZh ? '推荐功放功率' : 'Rec. PA Power', d => u(d.r.paRecommendation, 'W')),
      row(isZh ? '载波带宽' : 'Carrier BW', d => u(d.r.allocBandwidthResult, 'kHz')),
      row(isZh ? '功率带宽' : 'Power BW', d => u(d.r.PowerBWResult, 'kHz')),
      row(isZh ? '带宽占用' : 'BW Usage', d => u(d.r.bandwidthUsageRatio, '%'), { red: true }),
      row(isZh ? '功率占用' : 'Power Usage', d => u(d.r.powerUsageRatio, '%'), { red: true }),
      row(isZh ? '等效占用带宽' : 'Equiv. BW', d => d.eqBWFmt),
    ]},
  ];

  const paramSections = [
    { title: isZh ? '卫星与转发器' : 'Satellite & Transponder', rows: [
      row(isZh ? '卫星名称' : 'Satellite', d => u(d.sat.satelliteName)),
      row(isZh ? '轨道' : 'Orbit', d => d.isNGSO ? `${d.ngsoClass} / NGSO` : u(d.sat.orbitPosition, '°E')),
      row(isZh ? '工作频段' : 'Band', d => u(d.sat.frequencyBand)),
      row('SFD', d => u(d.sat.sfdRef, 'dBW/m²')),
      row(isZh ? '参考G/T' : 'Ref. G/T', d => u(d.sat.sfdGtRef || 0, 'dB/K')),
      row(isZh ? '转发器带宽' : 'Xpdr BW', d => u(d.sat.transponderBandwidth, 'MHz')),
      ...(anyGEO ? [row(isZh ? '邻星离轴角' : 'Adj. Sat. Offset', ifGEO(d => u(d.sat.deltaTheta, '°')))] : []),
      row(isZh ? '转发器IBO' : 'IBO', d => u(d.sat.BOi, 'dB')),
      row(isZh ? '转发器OBO' : 'OBO', d => u(d.sat.BOo, 'dB')),
    ]},
    { title: isZh ? '干扰因子' : 'Interference Factors', rows: [
      row(isZh ? '上行 C/ACI' : 'UL C/ACI', d => u(d.sat.aciUplinkFactor, 'dB')),
      row(isZh ? '上行 C/ASI' : 'UL C/ASI', d => u(d.sat.adjUplinkFactor, 'dB')),
      row(isZh ? '上行 C/XPI' : 'UL C/XPI', d => u(d.sat.xpolUplinkFactor, 'dB')),
      row('HPA C/IM', d => u(d.sat.hpaIntermodFactor, 'dB')),
      row(isZh ? '下行 C/ACI' : 'DL C/ACI', d => u(d.sat.aciDownlinkFactor, 'dB')),
      row(isZh ? '下行 C/ASI' : 'DL C/ASI', d => u(d.sat.adjDownlinkFactor, 'dB')),
      row(isZh ? '下行 C/XPI' : 'DL C/XPI', d => u(d.sat.xpolDownlinkFactor, 'dB')),
      row('Xpdr C/IM', d => u(d.sat.xpdrIntermodFactor, 'dB')),
    ]},
    { title: isZh ? '上行站参数' : 'Uplink Station', rows: [
      row(isZh ? '地面站位置' : 'TX Station', d => u(d.lp.earthStationLocation)),
      row(isZh ? '极化方式' : 'Polarization', d => u(d.lp.uplinkPolarization)),
      row(isZh ? '天线口径' : 'Antenna Dia.', d => u(d.lp.antennaDiameter, 'm')),
      row(isZh ? '天线效率' : 'Efficiency', d => u(d.lp.antennaEfficiency, '%')),
      row(isZh ? '经度' : 'Longitude', d => u(d.lp.longitude, '°E')),
      row(isZh ? '纬度' : 'Latitude', d => u(d.lp.latitude, '°N')),
      row(isZh ? '上行频率' : 'UL Freq.', d => u(d.lp.centerFrequency, 'GHz')),
      row(isZh ? '卫星 G/T' : 'Sat. G/T', d => u(d.lp.G_Ts, 'dB/K')),
      ...(anyNGSO ? [
        row(isZh ? '最低仰角' : 'Min Elevation', ifNGSO(d => u(d.lp.minElevation, '°'))),
        row(isZh ? '轨道高度/斜距' : 'Alt./Slant Range', ifNGSO(d => d.upDistVal)),
      ] : []),
      row(isZh ? '海拔' : 'Altitude', d => u(d.lp.altitude, 'm')),
      row(isZh ? '降雨率' : 'Rain Rate', d => u(d.lp.rainRate, 'mm/h')),
      row(isZh ? '功放回退' : 'PA Backoff', d => u(d.lp.paBackoff, 'dB')),
      row(isZh ? '馈线损耗' : 'Feeder Loss', d => u(d.lp.feederLoss, 'dB')),
      row('UPC', d => d.lp.uplinkPowerControl === '自定义'
        ? (isZh ? `自定义 (${u(d.lp.upcValue)} dB)` : `Custom (${u(d.lp.upcValue)} dB)`)
        : u(d.lp.uplinkPowerControl)),
      row(isZh ? '可用度' : 'Availability', d => u(d.lp.uplinkAvailability, '%')),
    ]},
    { title: isZh ? '接收站参数' : 'Downlink Station', rows: [
      row(isZh ? '地面站位置' : 'RX Station', d => u(d.lp.rxEarthStationLocation)),
      row(isZh ? '极化方式' : 'Polarization', d => u(d.lp.downlinkPolarization)),
      row(isZh ? '天线口径' : 'Antenna Dia.', d => u(d.lp.rxAntennaDiameter, 'm')),
      row(isZh ? '天线效率' : 'Efficiency', d => u(d.lp.rxAntennaEfficiency, '%')),
      row(isZh ? '经度' : 'Longitude', d => u(d.lp.rxLongitude, '°E')),
      row(isZh ? '纬度' : 'Latitude', d => u(d.lp.rxLatitude, '°N')),
      row(isZh ? '下行频率' : 'DL Freq.', d => u(d.lp.rxCenterFrequency, 'GHz')),
      row(isZh ? '卫星 EIRP' : 'Sat. EIRP', d => u(d.lp.rxEIRP, 'dBW')),
      ...(anyNGSO ? [
        row(isZh ? '最低仰角' : 'Min Elevation', ifNGSO(d => u(d.lp.rxMinElevation, '°'))),
        row(isZh ? '轨道高度/斜距' : 'Alt./Slant Range', ifNGSO(d => d.rxDistVal)),
      ] : []),
      row(isZh ? '海拔' : 'Altitude', d => u(d.lp.rxAltitude, 'm')),
      row(isZh ? '降雨率' : 'Rain Rate', d => u(d.lp.rxRainRate, 'mm/h')),
      row(isZh ? '天线噪温' : 'Ant. Noise Temp.', d => u(d.lp.rxAntennaNoiseTemp, 'K')),
      row(isZh ? '接收机噪温' : 'Rx Noise Temp.', d => u(d.lp.rxReceiverNoiseTemp, 'K')),
      row(isZh ? '馈线损耗' : 'Feeder Loss', d => u(d.lp.rxFeederLoss, 'dB')),
      row(isZh ? '可用度' : 'Availability', d => u(d.lp.rxDownlinkAvailability, '%')),
    ]},
    { title: isZh ? '载波与调制' : 'Carrier & Modulation', rows: [
      row(isZh ? 'DVB 标准' : 'DVB Standard', d => d.dvbLabel),
      row(isZh ? '调制方式' : 'Modulation', d => u(d.lp.modulation)),
      row(isZh ? '信息速率' : 'Info Rate', d => u(d.lp.infoRate, 'kbps')),
      row('FEC', d => u(d.lp.fec)),
      row(isZh ? '频谱效率' : 'Spectral Eff.', d => u(d.r.spectralEfficiencyResult, 'bps/Hz')),
      row(isZh ? '滚降系数 (1+α)' : 'Roll-off (1+a)', d => u(d.lp.bandwidthFactor)),
      row('BER', d => `1x10^-${u(d.lp.ber)}`),
      row(isZh ? '门限' : 'Threshold', d => `${u(d.lp.ebno, 'dB')} (${d.noiseLabel})`),
      ...(anyForward ? [row(isZh ? '功放功率' : 'PA Power', d => d.isForward ? u(d.lp.inputPaPower, 'W') : '--')] : []),
      ...(anyReverse ? [row(isZh ? '余量' : 'Margin', d => d.isForward ? '--' : u(d.lp.margin, 'dB'))] : []),
    ]},
  ];

  return { resultSections, paramSections };
}

// ────────────────────────────────────────────────────────────────────────────
// 单条记录的「计算结果 / 参数配置」分节定义（PDF / Word / Excel 单条共用）
// 统一口径：以前 PDF、Word、Excel 三套单条渲染各写一遍，标签/单位/格式已各自漂移。
// 现抽成单一数据源，三种格式仅做「结构 → 各自绘制原语」的薄适配，
// 今后新增/调整字段只改这里一处。每节 = { title, rows }；
// 每行 = { a:[标签,值], b:[标签,值]|null, em?, red? }（b 为 null 时整行单列）。
function _fmtU(val, unit) {
  if (val === undefined || val === null || val === '') return '--';
  return unit ? `${val} ${unit}` : String(val);
}

// 计算结果分节（rec: { config, sat, lp, r }）
function buildRecordResultSections(rec, isZh) {
  const { config, sat, lp, r } = rec;
  const u = _fmtU;
  const isNGSO = sat.orbitType === 'NGSO';
  const ngsoClass = sat.ngsoOrbitClass || 'LEO';
  const linkMargin = r.linkmargin || '0';
  const status = getLinkStatus(linkMargin);
  const t = TRANSLATIONS[isZh ? 'zh' : 'en'] || TRANSLATIONS.zh;
  const statusText = t[`status${status.charAt(0).toUpperCase() + status.slice(1)}`];
  const availWeather = parseFloat(r.systemAvailabilityResult) >= 100
    ? (isZh ? '（晴天）' : ' (Clear Sky)') : (isZh ? '（雨天）' : ' (Rain)');
  const allocBW = parseFloat(r.allocBandwidthResult) || 0;
  const powerBW = parseFloat(r.PowerBWResult) || 0;
  const eqBWFmt = formatBandwidth(Math.max(allocBW, powerBW));
  const R = (a, b, flags) => Object.assign({ a, b: b || null }, flags || {});

  const satRows = [];
  if (isNGSO) {
    satRows.push(R([isZh ? '卫星名称' : 'Satellite', u(sat.satelliteName)], [isZh ? '轨道类型' : 'Orbit Type', `${ngsoClass} / NGSO`]));
    satRows.push(R([isZh ? '轨道高度' : 'Orbit Alt.', u(r.orbitAltitudeResult, 'km')], [isZh ? '轨道速度' : 'Orbit Vel.', u(r.orbitVelocityResult, 'km/s')]));
  } else {
    satRows.push(R([isZh ? '卫星名称' : 'Satellite', u(sat.satelliteName)], [isZh ? '轨道位置' : 'Orbit', u(sat.orbitPosition, '°E')]));
  }
  satRows.push(R([isZh ? '频段' : 'Band', u(sat.frequencyBand)], [isZh ? '上行频率/极化' : 'UL Freq/Pol', `${u(r.uplinkFrequencyResult, 'GHz')} (${r.uplinkPolarizationResult || ''})`]));
  satRows.push(R([isZh ? '下行频率/极化' : 'DL Freq/Pol', `${u(r.downlinkFrequencyResult, 'GHz')} (${r.downlinkPolarizationResult || ''})`], [isZh ? '转发器带宽' : 'Xpdr BW', u(sat.transponderBandwidth, 'MHz')]));
  satRows.push(R([isZh ? '卫星EIRP' : 'Sat. EIRP', u(r.EIRPsResult, 'dBW')], [isZh ? '卫星SFD' : 'Sat. SFD', u(r.SFDsResult, 'dBW/m²')]));
  satRows.push(R([isZh ? '转发器IBO' : 'IBO', u(sat.BOi, 'dB')], [isZh ? '转发器OBO' : 'OBO', u(sat.BOo, 'dB')]));
  if (isNGSO) {
    satRows.push(R([isZh ? '上行最大多普勒' : 'Max Doppler UL', u(r.maxDopplerUplinkResult, 'kHz')], [isZh ? '下行最大多普勒' : 'Max Doppler DL', u(r.maxDopplerDownlinkResult, 'kHz')]));
    satRows.push(R([isZh ? '链路时延' : 'Link Delay', u(r.linkDelayResult, 'ms')]));
  }

  const sections = [];
  sections.push({ title: isZh ? '卫星与转发器' : 'Satellite & Transponder', rows: satRows });
  sections.push({ title: isZh ? '载波与调制' : 'Carrier & Modulation', rows: [
    R([isZh ? '信息速率' : 'Info Rate', u(r.infoRateResult, 'kbps')], [isZh ? '调制方式' : 'Modulation', u(r.modulationResult)]),
    R(['FEC', u(r.fecResult)], [isZh ? '符号速率' : 'Symbol Rate', u(r.symbolRateResult, 'ksps')]),
    R([isZh ? '门限Eb/N0' : 'Thresh. Eb/N0', u(r.ebnoResult, 'dB')], [isZh ? '门限Es/N0' : 'Thresh. Es/N0', u(r.esnoResult, 'dB')]),
    R(['Eb/N0', u(r.ebnoActualResult, 'dB')], ['Es/N0', u(r.esnoActualResult, 'dB')])
  ]});
  sections.push({ title: `${isZh ? '上行链路' : 'Uplink'} — ${lp.earthStationLocation || ''}`, rows: [
    R([isZh ? '天线口径' : 'Antenna Dia.', u(r.earthAntennaDiameterResult, 'm')], [isZh ? '天线增益' : 'Antenna Gain', u(r.txAntennaGainResult, 'dB')]),
    R([isZh ? '发射功率' : 'TX Power', `${u(r.selectedPowerWResult, 'W')} (${u(r.selectedPowerResult, 'dBW')})`], [isZh ? '地面站EIRP' : 'Station EIRP', u(r.stationEIRPResult, 'dBW')]),
    R([isZh ? (isNGSO ? '最低仰角' : '仰角') : 'Elevation', u(r.elevationResult, '°')], [isNGSO ? (isZh ? '上行斜距' : 'UL Slant Range') : (isZh ? '方位角' : 'Azimuth'), isNGSO ? u(r.slantRangeResult, 'km') : u(r.azimuthResult, '°')]),
    R([isZh ? '自由空间损耗' : 'Free Space Loss', u(r.uplinkFSLResult, 'dB')], [isZh ? '降雨衰减' : 'Rain Atten.', u(r.uplinkRainAttenuation, 'dB')]),
    R([isZh ? '馈线损耗' : 'Feeder Loss', u(r.feederLossResult, 'dB')], [isZh ? '上行C/N' : 'Uplink C/N', u(r.uplinkCN, 'dB')])
  ]});
  sections.push({ title: `${isZh ? '下行链路' : 'Downlink'} — ${lp.rxEarthStationLocation || ''}`, rows: [
    R([isZh ? '天线口径' : 'Antenna Dia.', u(r.rxAntennaDiameterResult, 'm')], [isZh ? '天线增益' : 'Antenna Gain', u(r.rxAntennaGainResult, 'dB')]),
    R(['G/T', u(r.gOverTeResult, 'dB/K')], [isZh ? 'EIRP输出' : 'EIRP Output', u(r.RXeirpPerCarrierResult, 'dBW')]),
    R([isZh ? (isNGSO ? '最低仰角' : '仰角') : 'Elevation', u(r.rxElevationResult, '°')], [isNGSO ? (isZh ? '下行斜距' : 'DL Slant Range') : (isZh ? '方位角' : 'Azimuth'), isNGSO ? u(r.rxSlantRangeResult, 'km') : u(r.rxAzimuthResult, '°')]),
    R([isZh ? '自由空间损耗' : 'Free Space Loss', u(r.downlinkFSLResult, 'dB')], [isZh ? '降雨衰减' : 'Rain Atten.', u(r.downlinkRainAttenuationResult, 'dB')]),
    R([isZh ? '馈线损耗' : 'Feeder Loss', u(r.rxFeederLossResult, 'dB')], [isZh ? '下行C/N' : 'Downlink C/N', u(r.downlinkCN, 'dB')])
  ]});
  sections.push({ title: isZh ? '结论' : 'Conclusion', rows: [
    R([isZh ? '综合C/N' : 'Total C/N', u(r.carrierTotalCN, 'dB')], [isZh ? '门限C/N' : 'Threshold C/N', u(r.thresholdCN, 'dB')]),
    R([isZh ? '链路余量' : 'Link Margin', u(linkMargin, 'dB')], [isZh ? '链路状态' : 'Link Status', statusText], { em: true }),
    R([isZh ? '系统可用度' : 'Availability', u(r.systemAvailabilityResult, '%') + availWeather], [isZh ? '推荐功放功率' : 'Rec. PA Power', u(r.paRecommendation, 'W')]),
    R([isZh ? '载波带宽' : 'Carrier BW', u(r.allocBandwidthResult, 'kHz')], [isZh ? '功率带宽' : 'Power BW', u(r.PowerBWResult, 'kHz')]),
    R([isZh ? '带宽占用' : 'BW Usage', u(r.bandwidthUsageRatio, '%')], [isZh ? '功率占用' : 'Power Usage', u(r.powerUsageRatio, '%')], { red: true }),
    R([isZh ? '等效占用带宽' : 'Equiv. BW', eqBWFmt])
  ]});
  return sections;
}

// 参数配置（输入参数）分节（rec: { config, sat, lp, r }）
function buildRecordParamSections(rec, isZh) {
  const { config, sat, lp, r } = rec;
  const u = _fmtU;
  const isNGSO = sat.orbitType === 'NGSO';
  const ngsoClass = sat.ngsoOrbitClass || 'LEO';
  const isForward = lp.calcMode === 'forward';
  const dvbLabel = lp.dvbStandard === 'DVB-S' ? 'DVB-S' : lp.dvbStandard === 'DVB-S2' ? 'DVB-S2' : lp.dvbStandard === 'DVB-S2X' ? 'DVB-S2X' : (isZh ? '自定义' : 'Custom');
  const noiseMode = (config && config.noiseRatioMode) || 'ebno';
  const noiseLabel = noiseMode === 'esno' ? 'Es/N0' : 'Eb/N0';
  const R = (a, b) => ({ a, b: b || null });

  const satRows = [];
  if (isNGSO) {
    satRows.push(R([isZh ? '卫星名称' : 'Satellite', u(sat.satelliteName)], [isZh ? '轨道类型' : 'Orbit Type', `${ngsoClass} / NGSO`]));
    satRows.push(R([isZh ? '工作频段' : 'Band', u(sat.frequencyBand)], ['SFD', u(sat.sfdRef, 'dBW/m²')]));
    satRows.push(R([isZh ? '参考G/T' : 'Ref. G/T', u(sat.sfdGtRef || 0, 'dB/K')]));
    satRows.push(R([isZh ? '转发器带宽' : 'Xpdr BW', u(sat.transponderBandwidth, 'MHz')]));
    satRows.push(R([isZh ? '转发器IBO' : 'IBO', u(sat.BOi, 'dB')], [isZh ? '转发器OBO' : 'OBO', u(sat.BOo, 'dB')]));
  } else {
    satRows.push(R([isZh ? '卫星名称' : 'Satellite', u(sat.satelliteName)], [isZh ? '轨道位置' : 'Orbit', u(sat.orbitPosition, '°E')]));
    satRows.push(R([isZh ? '工作频段' : 'Band', u(sat.frequencyBand)], ['SFD', u(sat.sfdRef, 'dBW/m²')]));
    satRows.push(R([isZh ? '参考G/T' : 'Ref. G/T', u(sat.sfdGtRef || 0, 'dB/K')]));
    satRows.push(R([isZh ? '转发器带宽' : 'Xpdr BW', u(sat.transponderBandwidth, 'MHz')], [isZh ? '邻星离轴角' : 'Adj. Sat. Offset', u(sat.deltaTheta, '°')]));
    satRows.push(R([isZh ? '转发器IBO' : 'IBO', u(sat.BOi, 'dB')], [isZh ? '转发器OBO' : 'OBO', u(sat.BOo, 'dB')]));
  }

  const upRows = [
    R([isZh ? '地面站位置' : 'TX Station', u(lp.earthStationLocation)], [isZh ? '极化方式' : 'Polarization', u(lp.uplinkPolarization)]),
    R([isZh ? '天线口径' : 'Antenna Dia.', u(lp.antennaDiameter, 'm')], [isZh ? '天线效率' : 'Efficiency', u(lp.antennaEfficiency, '%')]),
    R([isZh ? '经度' : 'Longitude', u(lp.longitude, '°E')], [isZh ? '纬度' : 'Latitude', u(lp.latitude, '°N')]),
    R([isZh ? '上行频率' : 'UL Freq.', u(lp.centerFrequency, 'GHz')], [isZh ? '卫星 G/T' : 'Sat. G/T', u(lp.G_Ts, 'dB/K')])
  ];
  if (isNGSO) {
    const upDistMode = lp.distanceMode || 'altitude';
    const upDistLabel = upDistMode === 'slantRange' ? (isZh ? '星地斜距' : 'Slant Range') : (isZh ? '轨道高度' : 'Orbit Alt.');
    const upDistVal = upDistMode === 'slantRange' ? u(lp.slantRange, 'km') : u(lp.orbitAltitude, 'km');
    upRows.push(R([isZh ? '最低仰角' : 'Min Elevation', u(lp.minElevation, '°')], [upDistLabel, upDistVal]));
  }
  upRows.push(R([isZh ? '海拔' : 'Altitude', u(lp.altitude, 'm')], [isZh ? '降雨率' : 'Rain Rate', u(lp.rainRate, 'mm/h')]));
  upRows.push(R([isZh ? '功放回退' : 'PA Backoff', u(lp.paBackoff, 'dB')], [isZh ? '馈线损耗' : 'Feeder Loss', u(lp.feederLoss, 'dB')]));
  upRows.push(R(['UPC', lp.uplinkPowerControl === '自定义' ? (isZh ? `自定义 (${u(lp.upcValue, 'dB')})` : `Custom (${u(lp.upcValue, 'dB')})`) : u(lp.uplinkPowerControl)], [isZh ? '可用度' : 'Availability', u(lp.uplinkAvailability, '%')]));

  const rxRows = [
    R([isZh ? '地面站位置' : 'RX Station', u(lp.rxEarthStationLocation)], [isZh ? '极化方式' : 'Polarization', u(lp.downlinkPolarization)]),
    R([isZh ? '天线口径' : 'Antenna Dia.', u(lp.rxAntennaDiameter, 'm')], [isZh ? '天线效率' : 'Efficiency', u(lp.rxAntennaEfficiency, '%')]),
    R([isZh ? '经度' : 'Longitude', u(lp.rxLongitude, '°E')], [isZh ? '纬度' : 'Latitude', u(lp.rxLatitude, '°N')]),
    R([isZh ? '下行频率' : 'DL Freq.', u(lp.rxCenterFrequency, 'GHz')], [isZh ? '卫星 EIRP' : 'Sat. EIRP', u(lp.rxEIRP, 'dBW')])
  ];
  if (isNGSO) {
    const rxDistMode = lp.rxDistanceMode || 'altitude';
    const rxDistLabel = rxDistMode === 'slantRange' ? (isZh ? '星地斜距' : 'Slant Range') : (isZh ? '轨道高度' : 'Orbit Alt.');
    const rxDistVal = rxDistMode === 'slantRange' ? u(lp.rxSlantRange, 'km') : u(lp.rxOrbitAltitude, 'km');
    rxRows.push(R([isZh ? '最低仰角' : 'Min Elevation', u(lp.rxMinElevation, '°')], [rxDistLabel, rxDistVal]));
  }
  rxRows.push(R([isZh ? '海拔' : 'Altitude', u(lp.rxAltitude, 'm')], [isZh ? '降雨率' : 'Rain Rate', u(lp.rxRainRate, 'mm/h')]));
  rxRows.push(R([isZh ? '天线噪温' : 'Ant. Noise Temp.', u(lp.rxAntennaNoiseTemp, 'K')], [isZh ? '接收机噪温' : 'Rx Noise Temp.', u(lp.rxReceiverNoiseTemp, 'K')]));
  rxRows.push(R([isZh ? '馈线损耗' : 'Feeder Loss', u(lp.rxFeederLoss, 'dB')], [isZh ? '可用度' : 'Availability', u(lp.rxDownlinkAvailability, '%')]));

  const sections = [];
  sections.push({ title: isZh ? '卫星与转发器' : 'Satellite & Transponder', rows: satRows });
  sections.push({ title: isZh ? '干扰因子' : 'Interference Factors', rows: [
    R([isZh ? '上行 C/ACI' : 'UL C/ACI', u(sat.aciUplinkFactor, 'dB')], [isZh ? '上行 C/ASI' : 'UL C/ASI', u(sat.adjUplinkFactor, 'dB')]),
    R([isZh ? '上行 C/XPI' : 'UL C/XPI', u(sat.xpolUplinkFactor, 'dB')], ['HPA C/IM', u(sat.hpaIntermodFactor, 'dB')]),
    R([isZh ? '下行 C/ACI' : 'DL C/ACI', u(sat.aciDownlinkFactor, 'dB')], [isZh ? '下行 C/ASI' : 'DL C/ASI', u(sat.adjDownlinkFactor, 'dB')]),
    R([isZh ? '下行 C/XPI' : 'DL C/XPI', u(sat.xpolDownlinkFactor, 'dB')], ['Xpdr C/IM', u(sat.xpdrIntermodFactor, 'dB')])
  ]});
  sections.push({ title: isZh ? '上行站参数' : 'Uplink Station', rows: upRows });
  sections.push({ title: isZh ? '接收站参数' : 'Downlink Station', rows: rxRows });
  sections.push({ title: isZh ? '载波与调制' : 'Carrier & Modulation', rows: [
    R([isZh ? 'DVB 标准' : 'DVB Standard', dvbLabel], [isZh ? '调制方式' : 'Modulation', u(lp.modulation)]),
    R([isZh ? '信息速率' : 'Info Rate', u(lp.infoRate, 'kbps')], ['FEC', u(lp.fec)]),
    R([isZh ? '频谱效率' : 'Spectral Eff.', u(r.spectralEfficiencyResult, 'bps/Hz')], [isZh ? '滚降系数 (1+α)' : 'Roll-off (1+a)', u(lp.bandwidthFactor)]),
    R(['BER', `1x10^-${u(lp.ber)}`], [`${noiseLabel}${isZh ? '门限' : ' Thresh.'}`, u(lp.ebno, 'dB')]),
    R(isForward ? [isZh ? '功放功率' : 'PA Power', u(lp.inputPaPower, 'W')] : [isZh ? '余量' : 'Margin', u(lp.margin, 'dB')])
  ]});
  return sections;
}

// 生成 Excel 报告（简洁格式：两列布局，左标题右数值+单位）
// 共享辅助：在 workbook 中添加计算结果 Sheet（4列三线表：参数标题 | 参数值 | 参数标题 | 参数值）
function _writeResultsToSheet(workbook, sheetName, configs, lang, compareMode) {
  const isZh = (lang !== 'en');
  const t = TRANSLATIONS[lang] || TRANSLATIONS.zh;
  const sheet = workbook.addWorksheet(sheetName.substring(0, 31));

  const u = (val, unit) => {
    if (val === '' || val === null || val === undefined) return '--';
    return unit ? `${val} ${unit}` : String(val);
  };

  const FONT = 'Times New Roman';
  const headerFont = { bold: true, size: 11, name: FONT, color: { argb: 'FF000000' } };
  const sectionFont = { bold: true, italic: true, size: 11, name: FONT, color: { argb: 'FF000000' } };
  const labelFont = { size: 11, name: FONT, color: { argb: 'FF333333' } };
  const valFont = { size: 11, name: FONT, color: { argb: 'FF000000' } };
  const topRule = { style: 'medium', color: { argb: 'FF000000' } };
  const bottomRule = { style: 'medium', color: { argb: 'FF000000' } };
  const thinRule = { style: 'thin', color: { argb: 'FF000000' } };
  const noBorder = { style: 'none' };
  const headerBorder = { top: topRule, bottom: thinRule, left: noBorder, right: noBorder };
  const sectionBorder = { top: thinRule, bottom: thinRule, left: noBorder, right: noBorder };
  const dataBorder = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
  const lastRowBorder = { top: noBorder, bottom: bottomRule, left: noBorder, right: noBorder };
  const yellowFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
  const redFont = { size: 11, name: FONT, color: { argb: 'FFCC0000' } };
  const redBoldFont = { bold: true, size: 11, name: FONT, color: { argb: 'FFCC0000' } };

  const S = 'section', D = 'data';
  const allLinksData = [];
  let totalEquivalentBW = 0;

  for (const config of configs) {
    const calc = config.calculationResults || {};
    if (Object.keys(calc).length === 0) continue;
    const sat = config.satelliteParams || {};
    const links = config.linkParams || {};

    for (const linkNum of Object.keys(calc)) {
      const r = calc[linkNum];
      const lp = links[linkNum] || {};
      const linkMargin = r.linkmargin || '0';
      const status = getLinkStatus(linkMargin);
      const statusText = t[`status${status.charAt(0).toUpperCase() + status.slice(1)}`];
      const availWeather = parseFloat(r.systemAvailabilityResult) >= 100
        ? (isZh ? '（晴天）' : ' (Clear Sky)') : (isZh ? '（雨天）' : ' (Rain)');
      const allocBW = parseFloat(r.allocBandwidthResult) || 0;
      const powerBW = parseFloat(r.PowerBWResult) || 0;
      const equivalentBW = Math.max(allocBW, powerBW);
      totalEquivalentBW += equivalentBW;
      const eqBWFmt = formatBandwidth(equivalentBW);

      // NGSO 适配
      const isNGSO = (sat.orbitType === 'NGSO');
      const ngsoClass_r = sat.ngsoOrbitClass || 'LEO';
      const orbitTag = isNGSO ? `[${ngsoClass_r}/NGSO]` : '[GEO]';
      const configTitle = `${config.configName || 'Unknown'} | ${sat.satelliteName || ''} ${orbitTag} | ${sat.frequencyBand || ''}${t.frequencyBandSuffix}`;

      // 4列配对行：[type, label1, val1, label2?, val2?]
      const rows = [
        [S, isZh ? '卫星参数' : 'Satellite Parameters'],
        isNGSO
          ? [D, isZh ? '卫星名称' : 'Satellite', u(sat.satelliteName), isZh ? '轨道类型' : 'Orbit Type', `${ngsoClass_r} / NGSO`]
          : [D, isZh ? '卫星名称' : 'Satellite', u(sat.satelliteName), isZh ? '轨道位置' : 'Orbit', u(sat.orbitPosition, '°E')],
        ...(isNGSO ? [
          [D, isZh ? '轨道高度' : 'Orbit Alt.', u(r.orbitAltitudeResult, 'km'), isZh ? '轨道速度' : 'Orbit Vel.', u(r.orbitVelocityResult, 'km/s')],
        ] : []),
        [D, isZh ? '频段' : 'Band', u(sat.frequencyBand), isZh ? '上行频率/极化' : 'UL Freq/Pol', `${u(r.uplinkFrequencyResult, 'GHz')} (${r.uplinkPolarizationResult || ''})`],
        [D, isZh ? '下行频率/极化' : 'DL Freq/Pol', `${u(r.downlinkFrequencyResult, 'GHz')} (${r.downlinkPolarizationResult || ''})`, isZh ? '转发器带宽' : 'Xpdr BW', u(sat.transponderBandwidth, 'MHz')],
        [D, isZh ? '卫星EIRP' : 'Sat. EIRP', u(r.EIRPsResult, 'dBW'), isZh ? '卫星SFD' : 'Sat. SFD', u(r.SFDsResult, 'dBW/m²')],
        [D, isZh ? '转发器IBO' : 'BOi', u(sat.BOi, 'dB'), isZh ? '转发器OBO' : 'BOo', u(sat.BOo, 'dB')],
        ...(isNGSO ? [
          [D, isZh ? '上行最大多普勒' : 'Max Doppler UL', u(r.maxDopplerUplinkResult, 'kHz'), isZh ? '下行最大多普勒' : 'Max Doppler DL', u(r.maxDopplerDownlinkResult, 'kHz')],
          [D, isZh ? '链路时延' : 'Link Delay', u(r.linkDelayResult, 'ms')],
        ] : []),
        [S, isZh ? '载波参数' : 'Carrier Parameters'],
        [D, isZh ? '信息速率' : 'Info Rate', u(r.infoRateResult, 'kbps'), isZh ? '调制方式' : 'Modulation', u(r.modulationResult)],
        [D, 'FEC', u(r.fecResult), isZh ? '符号速率' : 'Symbol Rate', u(r.symbolRateResult, 'ksps')],
        [D, isZh ? '上行频率' : 'UL Freq.', u(r.uplinkFrequencyResult, 'GHz'), isZh ? '下行频率' : 'DL Freq.', u(r.downlinkFrequencyResult, 'GHz')],
        [D, isZh ? '门限Eb/N0' : 'Thresh. Eb/N0', u(r.ebnoResult, 'dB'), isZh ? '门限Es/N0' : 'Thresh. Es/N0', u(r.esnoResult, 'dB')],
        [D, 'Eb/N0', u(r.ebnoActualResult, 'dB'), 'Es/N0', u(r.esnoActualResult, 'dB')],
        [S, isZh ? '上行链路' : 'Uplink'],
        [D, isZh ? '发信站位置' : 'TX Station', u(lp.earthStationLocation), isZh ? '天线口径' : 'Antenna Dia.', u(r.earthAntennaDiameterResult, 'm')],
        [D, isZh ? '天线增益' : 'Antenna Gain', u(r.txAntennaGainResult, 'dB'), isZh ? '发射功率' : 'TX Power', `${u(r.selectedPowerWResult, 'W')} (${u(r.selectedPowerResult, 'dBW')})`],
        [D, isZh ? '地面站EIRP' : 'Station EIRP', u(r.stationEIRPResult, 'dBW'), isZh ? (isNGSO ? '最低仰角' : '仰角') : 'Elevation', u(r.elevationResult, '°')],
        isNGSO
          ? [D, isZh ? '上行斜距' : 'UL Slant Range', u(r.slantRangeResult, 'km'), isZh ? '自由空间损耗' : 'FSL', u(r.uplinkFSLResult, 'dB')]
          : [D, isZh ? '方位角' : 'Azimuth', u(r.azimuthResult, '°'), isZh ? '自由空间损耗' : 'FSL', u(r.uplinkFSLResult, 'dB')],
        [D, isZh ? '降雨衰减' : 'Rain Atten.', u(r.uplinkRainAttenuation, 'dB'), isZh ? '馈线损耗' : 'Feeder Loss', u(r.feederLossResult, 'dB')],
        [D, isZh ? '上行C/N' : 'Uplink C/N', u(r.uplinkCN, 'dB')],
        [S, isZh ? '下行链路' : 'Downlink'],
        [D, isZh ? '收信站位置' : 'RX Station', u(lp.rxEarthStationLocation), isZh ? '天线口径' : 'Antenna Dia.', u(r.rxAntennaDiameterResult, 'm')],
        [D, isZh ? '天线增益' : 'Antenna Gain', u(r.rxAntennaGainResult, 'dB'), 'G/T', u(r.gOverTeResult, 'dB/K')],
        isNGSO
          ? [D, isZh ? '最低仰角' : 'Min Elevation', u(r.rxElevationResult, '°'), isZh ? '下行斜距' : 'DL Slant Range', u(r.rxSlantRangeResult, 'km')]
          : [D, isZh ? '仰角' : 'Elevation', u(r.rxElevationResult, '°'), isZh ? '方位角' : 'Azimuth', u(r.rxAzimuthResult, '°')],
        [D, isZh ? '自由空间损耗' : 'FSL', u(r.downlinkFSLResult, 'dB'), isZh ? '降雨衰减' : 'Rain Atten.', u(r.downlinkRainAttenuationResult, 'dB')],
        [D, isZh ? '馈线损耗' : 'Feeder Loss', u(r.rxFeederLossResult, 'dB'), isZh ? '下行C/N' : 'Downlink C/N', u(r.downlinkCN, 'dB')],
        [S, isZh ? '结论' : 'Conclusion'],
        [D, isZh ? '综合C/N' : 'Total C/N', u(r.carrierTotalCN, 'dB'), isZh ? '门限C/N' : 'Thresh. C/N', u(r.thresholdCN, 'dB')],
        [D, isZh ? '链路余量' : 'Link Margin', u(linkMargin, 'dB'), isZh ? '链路状态' : 'Link Status', statusText],
        [D, isZh ? '系统可用度' : 'Availability', u(r.systemAvailabilityResult, '%') + availWeather, isZh ? '推荐功放功率' : 'Rec. PA Power', u(r.paRecommendation, 'W')],
        [D, isZh ? '占用带宽' : 'Alloc. BW', u(r.allocBandwidthResult, 'kHz'), isZh ? '功率带宽' : 'Power BW', u(r.PowerBWResult, 'kHz')],
        ['red', isZh ? '带宽占用' : 'BW Usage', u(r.bandwidthUsageRatio, '%'), isZh ? '功率占用' : 'Power Usage', u(r.powerUsageRatio, '%')],
        [D, isZh ? '等效占用带宽' : 'Equiv. BW', eqBWFmt]
      ];
      allLinksData.push({ configTitle, rows, equivalentBW });
    }
  }

  if (allLinksData.length === 0) return { totalEquivalentBW: 0, linkCount: 0 };

  const linkCount = allLinksData.length;
  const C4 = 4; // 每链路4列
  const SEP = 1; // 配置间隔列
  const colStep = C4 + SEP;
  const columns = [];
  for (let i = 0; i < linkCount; i++) {
    columns.push({ width: 14 }, { width: 16 }, { width: 14 }, { width: 16 });
    if (i < linkCount - 1) columns.push({ width: 2 }); // 间隔列
  }
  sheet.columns = columns;

  const baseRows = compareMode && linkCount > 1 ? allLinksData[0].rows : null;

  // 标题行（合并4列，顶粗线）
  for (let i = 0; i < linkCount; i++) {
    const ci = i * colStep + 1;
    sheet.mergeCells(1, ci, 1, ci + C4 - 1);
    const cell = sheet.getCell(1, ci);
    cell.value = `${allLinksData[i].configTitle}    ${new Date().toISOString().slice(0, 10)}`;
    cell.font = headerFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    for (let c = ci; c < ci + C4; c++) sheet.getCell(1, c).border = headerBorder;
  }
  sheet.getRow(1).height = 20;

  // 数据行
  const maxRows = Math.max(...allLinksData.map(d => d.rows.length));
  let lastDataRowNum = 2;

  for (let ri = 0; ri < maxRows; ri++) {
    const rowNum = ri + 2;
    for (let li = 0; li < linkCount; li++) {
      const ci = li * colStep + 1;
      const ld = allLinksData[li];
      const rd = ld.rows[ri];
      if (!rd) { continue; }

      if (rd[0] === S) {
        sheet.mergeCells(rowNum, ci, rowNum, ci + C4 - 1);
        const cell = sheet.getCell(rowNum, ci);
        cell.value = rd[1];
        cell.font = sectionFont;
        cell.border = sectionBorder;
        cell.alignment = { vertical: 'middle' };
        for (let c = ci + 1; c < ci + C4; c++) sheet.getCell(rowNum, c).border = sectionBorder;
      } else {
        const isRed = rd[0] === 'red';
        const lf = isRed ? redBoldFont : labelFont;
        const vf = isRed ? redFont : valFont;
        const l1 = sheet.getCell(rowNum, ci);
        l1.value = rd[1]; l1.font = lf; l1.border = dataBorder; l1.alignment = { vertical: 'middle' };
        const v1 = sheet.getCell(rowNum, ci + 1);
        v1.value = rd[2]; v1.font = vf; v1.border = dataBorder; v1.alignment = { vertical: 'middle' };

        if (rd.length >= 5) {
          const l2 = sheet.getCell(rowNum, ci + 2);
          l2.value = rd[3]; l2.font = lf; l2.border = dataBorder; l2.alignment = { vertical: 'middle' };
          const v2 = sheet.getCell(rowNum, ci + 3);
          v2.value = rd[4]; v2.font = vf; v2.border = dataBorder; v2.alignment = { vertical: 'middle' };
        } else {
          sheet.mergeCells(rowNum, ci + 2, rowNum, ci + 3);
          sheet.getCell(rowNum, ci + 2).border = dataBorder;
        }
        lastDataRowNum = rowNum;
      }
    }
    const fr = allLinksData[0].rows[ri];
    sheet.getRow(rowNum).height = (fr && fr[0] === S) ? 18 : 17;
  }

  // 底粗线（各配置分别处理）
  for (let li = 0; li < linkCount; li++) {
    const ci = li * colStep + 1;
    for (let c = ci; c < ci + C4; c++) {
      sheet.getCell(lastDataRowNum, c).border = lastRowBorder;
    }
  }

  // 汇总行（非对比模式）
  if (!compareMode) {
    const sumRow = lastDataRowNum + 2;
    const totalCols = linkCount * colStep - SEP; // 去掉末尾间隔列
    sheet.mergeCells(sumRow, 1, sumRow, totalCols);
    const sumCell = sheet.getCell(sumRow, 1);
    const totalFmt = formatBandwidth(totalEquivalentBW);
    sumCell.value = isZh
      ? `本报告共包含 ${linkCount} 条链路，等效转发器带宽占用总计为 ${totalFmt}。`
      : `This report contains ${linkCount} links with a total equivalent transponder bandwidth of ${totalFmt}.`;
    sumCell.font = { bold: true, size: 11, name: FONT };
    sumCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sumCell.border = { top: topRule, bottom: bottomRule, left: noBorder, right: noBorder };
    sheet.getRow(sumRow).height = 22;
  }
}

async function generateExcel(configs, lang, compareMode = false) {
  const t = TRANSLATIONS[lang] || TRANSLATIONS.zh;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Satellite Link Budget System';
  workbook.created = new Date();

  _writeResultsToSheet(workbook, t.excelSheetName.substring(0, 31), configs, lang, compareMode);

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

// 生成 PDF 报告（期刊三线表：思源宋体衬线 + 黑白灰）
// 单选：逐节明细表；多选：表1计算结果对比 + 表2参数配置对比（参数为行、链路为列）
async function generatePDF(configs, lang) {
  const t = TRANSLATIONS[lang] || TRANSLATIONS.zh;
  const isZh = (lang !== 'en');

  const serifPath = path.join(__dirname, 'fonts', 'NotoSerifSC-Regular.otf');
  const serifBoldPath = path.join(__dirname, 'fonts', 'NotoSerifSC-Bold.otf');
  const hasSerif = fs.existsSync(serifPath);
  const hasSerifBold = fs.existsSync(serifBoldPath);

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 36, bottom: 20, left: 45, right: 45 },
      info: { Title: t.reportTitle, Author: 'LinkLab Satellite Analysis' }
    });
    if (hasSerif) doc.registerFont('Serif', serifPath);
    if (hasSerifBold) doc.registerFont('SerifBold', serifBoldPath);
    const font = (size) => { doc.font(hasSerif ? 'Serif' : 'Times-Roman').fontSize(size); return doc; };
    const fontBold = (size) => { doc.font(hasSerifBold ? 'SerifBold' : (hasSerif ? 'Serif' : 'Times-Bold')).fontSize(size); return doc; };

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // 期刊黑白灰；仅两个功能色：红=占用比，黄=对比差异高亮（与Excel一致）
    const INK = '#000000', LABEL = '#444444', META = '#555555', FAINT = '#999999';
    const RED = '#CC0000', HL = '#FFF3B0', RULE_FAINT = '#BBBBBB';

    const W = 505, L = 45;
    const TOP = 36, BOTTOM = 768;
    let y = TOP;
    let page = 1;

    const u = (val, unit) => {
      if (val === undefined || val === null || val === '') return '--';
      return unit ? `${val} ${unit}` : String(val);
    };

    const footer = () => {
      doc.lineWidth(0.3).moveTo(L, 786).lineTo(L + W, 786).stroke(RULE_FAINT);
      font(7.5).fillColor(FAINT)
        .text(t.footerText, L, 791, { width: W * 0.7, lineBreak: false })
        .text(`— ${page} —`, L, 791, { width: W, align: 'right', lineBreak: false });
    };
    const breakPage = () => { footer(); doc.addPage(); page++; y = TOP; };
    const ensure = (h) => { if (y + h > BOTTOM) breakPage(); };
    const rule = (weight) => { doc.lineWidth(weight).moveTo(L, y).lineTo(L + W, y).stroke(INK); };

    // 4列配对布局（比例与Excel一致：标签0.20 | 值0.30 | 标签0.20 | 值0.30）
    const colW = [W * 0.20, W * 0.30, W * 0.20, W * 0.30];
    const rowH = 16.5;

    // 节标题：上下细线之间，加粗
    const drawSec = (title) => {
      ensure(22 + rowH);
      y += 2; rule(0.6); y += 3.5;
      fontBold(9.5).fillColor(INK).text(title, L + 2, y, { width: W, lineBreak: false });
      y += 13.5; rule(0.6); y += 2.5;
    };

    // 数据行：标签灰 | 值黑；red=占用比红色；em=首值加粗放大（链路余量）
    const drawP = (l1, v1, l2, v2, opts = {}) => {
      ensure(rowH);
      const lc = opts.red ? RED : LABEL;
      const vc = opts.red ? RED : INK;
      let x = L;
      (opts.red || opts.em ? fontBold(9) : font(9)).fillColor(lc).text(l1 || '', x + 2, y + 3.5, { width: colW[0] - 4, lineBreak: false });
      x += colW[0];
      (opts.em ? fontBold(10.5) : font(9)).fillColor(vc).text(v1 === undefined || v1 === '' ? '--' : String(v1), x + 2, y + (opts.em ? 2 : 3.5), { width: colW[1] - 4, lineBreak: false });
      x += colW[1];
      if (l2 !== undefined) {
        (opts.red ? fontBold(9) : font(9)).fillColor(lc).text(l2 || '', x + 2, y + 3.5, { width: colW[2] - 4, lineBreak: false });
        x += colW[2];
        font(9).fillColor(vc).text(v2 === undefined || v2 === '' ? '--' : String(v2), x + 2, y + 3.5, { width: colW[3] - 4, lineBreak: false });
      }
      y += rowH;
    };

    const dateStr = new Date().toISOString().slice(0, 10);

    // ── 收集所有链路记录 ──
    const records = [];
    for (const config of configs) {
      const calc = config.calculationResults || {};
      if (Object.keys(calc).length === 0) continue;
      const sat = config.satelliteParams || {};
      const links = config.linkParams || {};
      const linkNums = Object.keys(calc);
      for (const linkNum of linkNums) {
        records.push({ config, sat, links, linkNum, r: calc[linkNum], lp: links[linkNum] || {}, multiLink: linkNums.length > 1 });
      }
    }

    let totalEquivalentBW = 0;
    const entries = records.map(rec => {
      const r = rec.r;
      const allocBW = parseFloat(r.allocBandwidthResult) || 0;
      const powerBW = parseFloat(r.PowerBWResult) || 0;
      totalEquivalentBW += Math.max(allocBW, powerBW);
      return { name: (rec.config.configName || dateStr) + (rec.multiLink ? `-L${rec.linkNum}` : '') };
    });
    const totalFmt = formatBandwidth(totalEquivalentBW);

    // ── 多选：报告页眉（标题 + meta + 底纹说明）──
    const drawCompareHeader = () => {
      rule(2.2); y += 10;
      fontBold(15).fillColor(INK).text(t.reportTitle, L, y, { width: W, align: 'center' });
      y += 24;
      font(9).fillColor(META).text(`${entries.length} ${isZh ? '条链路' : 'links'} · ${dateStr} · LinkLab Satellite Analysis`, L, y, { width: W, align: 'center' });
      y += 15; rule(0.8); y += 12;
      font(8).fillColor(META).text(isZh
        ? `注：共 ${entries.length} 条链路，等效转发器带宽合计 ${totalFmt}。`
        : `Note: ${entries.length} links in total, combined equivalent bandwidth ${totalFmt}.`,
        L, y, { width: W });
      y += 24;
    };

    // ── 单条记录：记录头 + 计算结果 + 参数配置 ──
    const drawRecord = (rec) => {
      // 行内容已统一由 buildRecordResultSections / buildRecordParamSections 提供，
      // 此处仅保留记录头所需的几项。
      const { config, sat, linkNum } = rec;
      const isNGSO = sat.orbitType === 'NGSO';
      const ngsoClass = sat.ngsoOrbitClass || 'LEO';
      const orbitMeta = isNGSO ? `${ngsoClass} / NGSO` : `${sat.orbitPosition || ''}°E [GEO]`;
      const recName = (config.configName || dateStr) + (rec.multiLink ? `-L${linkNum}` : '');

      // 记录头：顶粗线 → 配置名/日期 → meta → 中线
      rule(2); y += 7;
      fontBold(13).fillColor(INK).text(recName, L, y, { width: W * 0.72, lineBreak: false });
      font(8.5).fillColor(FAINT).text(dateStr, L + W * 0.72, y + 4, { width: W * 0.28, align: 'right', lineBreak: false });
      y += 19;
      font(9).fillColor(META).text(`${sat.satelliteName || ''} · ${sat.frequencyBand || ''}${t.frequencyBandSuffix} · ${orbitMeta}`, L, y, { width: W, lineBreak: false });
      y += 13; rule(1); y += 1;

      // ═══ 计算结果 ═══（单条 PDF/Word 共用 buildRecordResultSections）
      buildRecordResultSections(rec, isZh).forEach((sec) => {
        drawSec(sec.title);
        sec.rows.forEach((row) => {
          const opts = {};
          if (row.em) opts.em = true;
          if (row.red) opts.red = true;
          drawP(row.a[0], row.a[1], row.b ? row.b[0] : undefined, row.b ? row.b[1] : undefined, opts);
        });
      });
      y += 1; rule(2); y += 14;

      // ═══ 参数配置（输入参数）═══
      ensure(44 + rowH * 5);
      fontBold(10.5).fillColor(INK).text(isZh ? '参数配置（输入参数）' : 'Parameter Configuration (Inputs)', L, y, { width: W, align: 'center' });
      y += 17; rule(1.2); y += 1;

      // 参数配置各节同样走 buildRecordParamSections（统一口径）
      buildRecordParamSections(rec, isZh).forEach((sec) => {
        drawSec(sec.title);
        sec.rows.forEach((row) => {
          drawP(row.a[0], row.a[1], row.b ? row.b[0] : undefined, row.b ? row.b[1] : undefined);
        });
      });
      y += 1; rule(2);
    };

    // ── 多选：表1 计算结果对比 + 表2 参数配置对比（参数为行、链路为列）──
    const drawCompareDetails = () => {
      const { resultSections, paramSections } = _buildCompareSections(records, lang, t);
      const names = entries.map(e => e.name);
      const n = names.length;
      const PER = 4; // 每块最多并排4条链路，超出分块续表

      // 指定字号/字重测量文本高度（用于自适应行高换行）
      const measure = (text, w, size, bold) => {
        doc.font(bold ? (hasSerifBold ? 'SerifBold' : (hasSerif ? 'Serif' : 'Times-Bold')) : (hasSerif ? 'Serif' : 'Times-Roman')).fontSize(size);
        return doc.heightOfString(String(text), { width: w });
      };

      let tableNo = 1;
      const drawTable = (title, sections) => {
        for (let s = 0; s < n; s += PER) {
          const e2 = Math.min(n, s + PER);
          const cols = e2 - s;
          const labW = W * 0.235;
          const cw = (W - labW) / cols;
          const FS = cols <= 2 ? 9 : cols === 3 ? 8.5 : 8;

          // 表头行（顶粗线 + 列名 + 细线），跨页时重绘
          const drawHeader = () => {
            const hh = Math.max(
              measure(isZh ? '参数' : 'Parameter', labW - 4, FS, true),
              ...names.slice(s, e2).map(nm => measure(nm, cw - 4, FS, true))
            ) + 7;
            ensure(hh + 14);
            rule(1.5);
            fontBold(FS).fillColor(LABEL).text(isZh ? '参数' : 'Parameter', L + 2, y + 3.5, { width: labW - 4 });
            let x = L + labW;
            for (let i = s; i < e2; i++) {
              fontBold(FS).fillColor(INK).text(names[i], x + 2, y + 3.5, { width: cw - 4, align: 'right' });
              x += cw;
            }
            y += hh;
            rule(0.6);
          };

          // 表题
          ensure(64);
          const cap = `${isZh ? '表' : 'Table'} ${tableNo}${s > 0 ? (isZh ? '（续）' : ' (cont.)') : ''}　${title}`;
          fontBold(10.5).fillColor(INK).text(cap, L, y, { width: W, align: 'center' });
          y += 18;
          drawHeader();

          for (const sec of sections) {
            // 节标题行
            if (y + 38 > BOTTOM) { breakPage(); drawHeader(); }
            y += 2; rule(0.6); y += 3.5;
            fontBold(9.5).fillColor(INK).text(sec.title, L + 2, y, { width: W, lineBreak: false });
            y += 13.5; rule(0.6); y += 2.5;

            for (const rw of sec.rows) {
              const vals = rw.vals.slice(s, e2);
              const vfs = rw.em ? FS + 1 : FS;
              const hh = Math.max(
                measure(rw.label, labW - 4, FS, rw.red || rw.em),
                ...vals.map(v => measure(v, cw - 4, vfs, rw.em))
              ) + 6.5;
              if (y + hh > BOTTOM) { breakPage(); drawHeader(); }
              const lc = rw.red ? RED : LABEL;
              const vc = rw.red ? RED : INK;
              (rw.red || rw.em ? fontBold(FS) : font(FS)).fillColor(lc).text(rw.label, L + 2, y + 3, { width: labW - 4 });
              x = L + labW;
              vals.forEach(v => {
                (rw.em ? fontBold(vfs) : font(FS)).fillColor(vc).text(v, x + 2, y + 3, { width: cw - 4, align: 'right' });
                x += cw;
              });
              y += hh;
            }
          }
          rule(1.5);
          y += 18;
        }
        tableNo++;
      };

      drawTable(isZh ? '计算结果对比' : 'Calculation Results Comparison', resultSections);
      drawTable(isZh ? '参数配置对比（输入参数）' : 'Parameter Configuration (Inputs)', paramSections);
    };

    if (records.length === 0) {
      font(10).fillColor(META).text(isZh ? '所选记录没有计算结果数据。' : 'No calculation results in the selected records.', L, y);
    } else if (entries.length > 1) {
      drawCompareHeader();
      drawCompareDetails();
    } else {
      drawRecord(records[0]);
    }
    footer();

    doc.end();
  });
}

// 生成 Word 报告（期刊三线表：Times New Roman + 宋体，黑白灰）
// 单选：逐节明细表；多选：表1计算结果对比 + 表2参数配置对比（参数为行、链路为列，表头跨页重复）
async function generateWord(configs, lang) {
  const isZh = (lang !== 'en');
  const t = TRANSLATIONS[lang] || TRANSLATIONS.zh;

  const u = (val, unit) => {
    if (val === '' || val === null || val === undefined) return '--';
    return unit ? `${val} ${unit}` : String(val);
  };

  // 期刊字型：西文 Times New Roman，中文宋体
  const FONTS = { ascii: 'Times New Roman', hAnsi: 'Times New Roman', eastAsia: 'SimSun' };
  const SZ       = 21;  // 10.5pt 正文
  const SZ_SEC   = 22;  // 11pt 节标题
  const SZ_NAME  = 26;  // 13pt 记录名
  const SZ_TITLE = 32;  // 16pt 对比首页主标题

  const HL = 'FFF3B0'; // 对比差异高亮（与Excel一致）

  // 三线表边框
  const noBdr    = { style: BorderStyle.NONE,   size: 0,  color: 'FFFFFF' };
  const thinBdr  = { style: BorderStyle.SINGLE, size: 4,  color: '000000' };
  const thickBdr = { style: BorderStyle.SINGLE, size: 14, color: '000000' };

  // A4，2.5cm页边距
  const PAGE_W = 11906;
  const PAGE_M = 1418;
  const TBL_W  = PAGE_W - PAGE_M * 2;
  const W1 = 2100, W2 = 2435, W3 = 2100, W4 = TBL_W - W1 - W2 - W3;

  const run = (text, opts = {}) => new TextRun(Object.assign({
    text: (text === undefined || text === null) ? '' : String(text),
    font: FONTS, size: SZ, noProof: true
  }, opts));

  // 节标题行：首节顶粗线，其余上细线；下细线
  const secRow = (text, first = false) => new TableRow({
    children: [new TableCell({
      columnSpan: 4,
      width: { size: TBL_W, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      borders: { top: first ? thickBdr : thinBdr, bottom: thinBdr, left: noBdr, right: noBdr },
      children: [new Paragraph({
        children: [run(text, { size: SZ_SEC, bold: true })],
        spacing: { before: 90, after: 50, line: 264 }
      })]
    })]
  });

  // 数据行：标签灰 | 值黑；red=占用比红色；em=首值加粗放大；isLast=底粗线
  const dataRow = (l1, v1, l2, v2, opts = {}) => {
    const { isLast = false, isRed = false, em = false } = opts;
    const bot = isLast ? thickBdr : noBdr;
    const lc = isRed ? 'CC0000' : '444444';
    const vc = isRed ? 'CC0000' : '000000';
    const mkC = (text, w, color, bold, size, spanCols = 1, spanW = null) => new TableCell({
      columnSpan: spanCols,
      width: { size: spanW !== null ? spanW : w, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      borders: { top: noBdr, bottom: bot, left: noBdr, right: noBdr },
      children: [new Paragraph({
        children: [run((text === undefined || text === null || text === '') ? '--' : text, { bold, color, size })],
        spacing: { before: 36, after: 36, line: 264 }
      })]
    });
    if (l2 !== undefined) {
      return new TableRow({ children: [
        mkC(l1, W1, lc, isRed || em, SZ),
        mkC(v1, W2, vc, em, em ? SZ + 2 : SZ),
        mkC(l2, W3, lc, isRed, SZ),
        mkC(v2, W4, vc, false, SZ)
      ] });
    }
    return new TableRow({ children: [
      mkC(l1, W1, lc, isRed || em, SZ),
      mkC(v1, W2 + W3 + W4, vc, em, em ? SZ + 2 : SZ, 3, W2 + W3 + W4)
    ] });
  };

  // 表题（居中加粗）
  const caption = (text, opts = {}) => new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [run(text, { bold: true, size: SZ + 1 })],
    spacing: { before: opts.first ? 60 : 300, after: 100 }
  });

  // 共享分节定义 → Word 表行（首节顶粗线，末行底粗线；em/red 透传）
  const sectionsToTableRows = (sections) => {
    const out = [];
    sections.forEach((sec, si) => {
      out.push(secRow(sec.title, si === 0));
      sec.rows.forEach((row, ri) => {
        const opts = { isLast: si === sections.length - 1 && ri === sec.rows.length - 1 };
        if (row.em) opts.em = true;
        if (row.red) opts.isRed = true;
        out.push(dataRow(row.a[0], row.a[1], row.b ? row.b[0] : undefined, row.b ? row.b[1] : undefined, opts));
      });
    });
    return out;
  };

  const dateStr = new Date().toISOString().slice(0, 10);

  // ── 收集所有链路记录 ──
  const records = [];
  for (const config of configs) {
    const calc = config.calculationResults || {};
    if (Object.keys(calc).length === 0) continue;
    const sat = config.satelliteParams || {};
    const links = config.linkParams || {};
    const linkNums = Object.keys(calc);
    for (const linkNum of linkNums) {
      records.push({ config, sat, links, linkNum, r: calc[linkNum], lp: links[linkNum] || {}, multiLink: linkNums.length > 1 });
    }
  }

  let totalEquivalentBW = 0;
  const entries = records.map(rec => {
    const r = rec.r;
    const allocBW = parseFloat(r.allocBandwidthResult) || 0;
    const powerBW = parseFloat(r.PowerBWResult) || 0;
    totalEquivalentBW += Math.max(allocBW, powerBW);
    return { name: (rec.config.configName || dateStr) + (rec.multiLink ? `-L${rec.linkNum}` : '') };
  });
  const totalFmt = formatBandwidth(totalEquivalentBW);

  const docChildren = [];

  // ── 多选：报告页眉（标题 + meta + 底纹说明）──
  if (entries.length > 1) {
    docChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [run(t.reportTitle, { bold: true, size: SZ_TITLE })],
      spacing: { before: 120, after: 80 },
      border: { top: { style: BorderStyle.SINGLE, size: 18, color: '000000', space: 10 } }
    }));
    docChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [run(`${entries.length} ${isZh ? '条链路' : 'links'} · ${dateStr} · LinkLab Satellite Analysis`, { size: SZ - 3, color: '555555' })],
      spacing: { after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 10 } }
    }));
    docChildren.push(new Paragraph({
      children: [run(isZh
        ? `注：共 ${entries.length} 条链路，等效转发器带宽合计 ${totalFmt}。`
        : `Note: ${entries.length} links in total, combined equivalent bandwidth ${totalFmt}.`,
        { size: SZ - 4, color: '555555' })],
      spacing: { before: 60, after: 60 }
    }));
  }

  // ── 多选：表1 计算结果对比 + 表2 参数配置对比（参数为行、链路为列）──
  if (entries.length > 1) {
    const { resultSections, paramSections } = _buildCompareSections(records, lang, t);
    const names = entries.map(e => e.name);
    const n = names.length;
    const PER = 4; // 每块最多并排4条链路，超出分块续表
    let tableNo = 1;

    const pushDetailTable = (title, sections) => {
      for (let s = 0; s < n; s += PER) {
        const e2 = Math.min(n, s + PER);
        const cols = e2 - s;
        const labW = 2200;
        const cw = Math.floor((TBL_W - labW) / cols);
        const FS = cols <= 2 ? SZ - 2 : cols === 3 ? SZ - 3 : SZ - 4; // 列多时缩字号

        // 表题
        docChildren.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [run(`${isZh ? '表' : 'Table'} ${tableNo}${s > 0 ? (isZh ? '（续）' : ' (cont.)') : ''}　${title}`, { bold: true, size: SZ + 1 })],
          spacing: { before: tableNo === 1 && s === 0 ? 60 : 300, after: 100 }
        }));

        const mk = (text, w, opts = {}) => new TableCell({
          width: { size: w, type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          borders: { top: opts.top || noBdr, bottom: opts.bottom || noBdr, left: noBdr, right: noBdr },
          children: [new Paragraph({
            alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [run((text === undefined || text === null || text === '') ? '--' : text, { bold: !!opts.bold, color: opts.color || '000000', size: opts.size || FS })],
            spacing: { before: 30, after: 30, line: 252 }
          })]
        });

        const tRows = [];
        // 表头行（顶粗线，跨页重复）
        tRows.push(new TableRow({
          tableHeader: true,
          children: [mk(isZh ? '参数' : 'Parameter', labW, { bold: true, color: '444444', top: thickBdr, bottom: thinBdr })]
            .concat(names.slice(s, e2).map(nm => mk(nm, cw, { bold: true, right: true, top: thickBdr, bottom: thinBdr })))
        }));

        // 展平：节标题行 + 数据行；最后一行加底粗线
        const flat = [];
        sections.forEach(sec => { flat.push({ secTitle: sec.title }); sec.rows.forEach(rw => flat.push(rw)); });
        flat.forEach((rw, fi) => {
          const isLast = fi === flat.length - 1;
          if (rw.secTitle) {
            tRows.push(new TableRow({
              children: [new TableCell({
                columnSpan: cols + 1,
                width: { size: TBL_W, type: WidthType.DXA },
                verticalAlign: VerticalAlign.CENTER,
                borders: { top: thinBdr, bottom: thinBdr, left: noBdr, right: noBdr },
                children: [new Paragraph({
                  children: [run(rw.secTitle, { bold: true, size: FS + 1 })],
                  spacing: { before: 70, after: 40, line: 252 }
                })]
              })]
            }));
          } else {
            const bot = isLast ? thickBdr : noBdr;
            const base = rw.vals[0]; // 差异基准=全局第1条链路
            const lc = rw.red ? 'CC0000' : '444444';
            const vc = rw.red ? 'CC0000' : '000000';
            tRows.push(new TableRow({
              children: [mk(rw.label, labW, { color: lc, bold: !!(rw.red || rw.em), bottom: bot })]
                .concat(rw.vals.slice(s, e2).map((v, vi) => {
                  const hl = s + vi > 0 && v !== '--' && base !== '--' && v !== base;
                  return mk(v, cw, { right: true, hl, bold: !!rw.em, color: vc, bottom: bot, size: rw.em ? FS + 1 : FS });
                }))
            }));
          }
        });

        docChildren.push(new Table({ width: { size: TBL_W, type: WidthType.DXA }, layout: TableLayoutType.FIXED, rows: tRows }));
      }
      tableNo++;
    };

    pushDetailTable(isZh ? '计算结果对比' : 'Calculation Results Comparison', resultSections);
    pushDetailTable(isZh ? '参数配置对比（输入参数）' : 'Parameter Configuration (Inputs)', paramSections);
  }

  // ── 单选：记录头 + 计算结果表 + 参数配置表 ──
  if (entries.length <= 1) records.forEach((rec, idx) => {
    // 行内容统一由 buildRecordResultSections / buildRecordParamSections 提供；
    // 这里仅保留记录头所需的几项。
    const { config, sat, linkNum } = rec;
    const isNGSO = sat.orbitType === 'NGSO';
    const ngsoClass = sat.ngsoOrbitClass || 'LEO';
    const orbitMeta = isNGSO ? `${ngsoClass} / NGSO` : `${sat.orbitPosition || ''}°E [GEO]`;
    const recName = (config.configName || dateStr) + (rec.multiLink ? `-L${linkNum}` : '');

    // 记录间分页（有对比首页时第一条记录也分页）
    if (idx > 0 || entries.length > 1) {
      docChildren.push(new Paragraph({ pageBreakBefore: true, children: [], spacing: { before: 0, after: 0 } }));
    }

    // 记录头：顶粗线 → 配置名 + meta/日期 → 中线
    docChildren.push(new Paragraph({
      children: [
        run(recName, { bold: true, size: SZ_NAME }),
        new TextRun({ break: 1 }),
        run(`${sat.satelliteName || ''} · ${sat.frequencyBand || ''}${t.frequencyBandSuffix} · ${orbitMeta}`, { size: SZ - 3, color: '555555' }),
        run(`　　${dateStr}`, { size: SZ - 4, color: '999999' })
      ],
      spacing: { before: 60, after: 140, line: 300 },
      border: {
        top:    { style: BorderStyle.SINGLE, size: 16, color: '000000', space: 4 },
        bottom: { style: BorderStyle.SINGLE, size: 8,  color: '000000', space: 4 }
      }
    }));

    // ═══ 计算结果表 ═══
    docChildren.push(caption(isZh ? '计算结果' : 'Calculation Results', { first: true }));

    const rRows = sectionsToTableRows(buildRecordResultSections(rec, isZh));

    docChildren.push(new Table({ width: { size: TBL_W, type: WidthType.DXA }, layout: TableLayoutType.FIXED, rows: rRows }));

    // ═══ 参数配置表（输入参数）═══
    docChildren.push(caption(isZh ? '参数配置（输入参数）' : 'Parameter Configuration (Inputs)'));

    const pRows = sectionsToTableRows(buildRecordParamSections(rec, isZh));

    docChildren.push(new Table({ width: { size: TBL_W, type: WidthType.DXA }, layout: TableLayoutType.FIXED, rows: pRows }));
  });

  // 单条导出时的汇总句（多选时对比表表注已含合计）
  if (entries.length === 1) {
    docChildren.push(new Paragraph({
      children: [run(isZh
        ? `本报告共包含 1 条链路，等效转发器带宽占用总计为 ${totalFmt}。`
        : `This report contains 1 link with a total equivalent transponder bandwidth of ${totalFmt}.`,
        { bold: true })],
      spacing: { before: 320, line: 280 },
      border: {
        top:    { style: BorderStyle.SINGLE, size: 4,  color: '000000', space: 6 },
        bottom: { style: BorderStyle.SINGLE, size: 16, color: '000000', space: 6 }
      }
    }));
  }

  if (docChildren.length === 0) {
    docChildren.push(new Paragraph({
      children: [run(isZh ? '所选记录没有计算结果数据。' : 'No calculation results in the selected records.')]
    }));
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_W, height: 16838 },
          margin: { top: PAGE_M, bottom: PAGE_M, left: PAGE_M, right: PAGE_M }
        }
      },
      children: docChildren
    }]
  });

  return await Packer.toBuffer(doc);
}

// 获取配置中第一条有效链路参数
function getFirstLinkParams(config) {
  const links = config.linkParams || {};
  const nums = Object.keys(links).filter(k => typeof links[k] === 'object');
  return nums.length > 0 ? links[nums[0]] : {};
}

// 获取配置中第一条有效计算结果
function getFirstCalcResults(config) {
  const results = config.calculationResults || {};
  const nums = Object.keys(results).filter(k => typeof results[k] === 'object');
  return nums.length > 0 ? results[nums[0]] : {};
}

// 生成 Excel 参数设置文档（学术三线表风格，横向多配置并排，配置间隔一列）
async function generateExcelParams(configs, lang, compareMode = false) {
  const isZh = (lang !== 'en');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Satellite Link Budget System';
  workbook.created = new Date();

  const sheetName = isZh ? '参数设置' : 'Parameters';
  const sheet = workbook.addWorksheet(sheetName);

  const u = (val, unit) => {
    if (val === undefined || val === null || val === '') return '--';
    return unit ? `${val} ${unit}` : String(val);
  };

  const FONT = 'Times New Roman';
  const headerFont = { bold: true, size: 11, name: FONT, color: { argb: 'FF000000' } };
  const sectionFont = { bold: true, italic: true, size: 11, name: FONT, color: { argb: 'FF000000' } };
  const labelFont = { size: 11, name: FONT, color: { argb: 'FF333333' } };
  const valFont = { size: 11, name: FONT, color: { argb: 'FF000000' } };
  const topRule = { style: 'medium', color: { argb: 'FF000000' } };
  const bottomRule = { style: 'medium', color: { argb: 'FF000000' } };
  const thinRule = { style: 'thin', color: { argb: 'FF000000' } };
  const noBorder = { style: 'none' };
  const headerBorder = { top: topRule, bottom: thinRule, left: noBorder, right: noBorder };
  const sectionBorder = { top: thinRule, bottom: thinRule, left: noBorder, right: noBorder };
  const dataBorder = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
  const lastRowBorder = { top: noBorder, bottom: bottomRule, left: noBorder, right: noBorder };
  const yellowFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
  const S = 'section', D = 'data';
  const allConfigsData = [];

  for (const config of configs) {
    const sat = config.satelliteParams || {};
    const lp = getFirstLinkParams(config);
    const cr = getFirstCalcResults(config);
    const configTitle = config.configName || (isZh ? '卫星链路参数设置' : 'Link Parameters');

    // 走与 PDF/Word 单条相同的 buildRecordParamSections，保证三格式口径一致
    const rows = [];
    buildRecordParamSections({ config, sat, lp, r: cr }, isZh).forEach((sec) => {
      rows.push([S, sec.title]);
      sec.rows.forEach((row) => {
        if (row.b) rows.push([D, row.a[0], row.a[1], row.b[0], row.b[1]]);
        else rows.push([D, row.a[0], row.a[1]]);
      });
    });
    allConfigsData.push({ configTitle, rows });
  }

  if (allConfigsData.length === 0) {
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  }

  const configCount = allConfigsData.length;
  const C4 = 4;   // 每配置4列（标签+值，左右各一对）
  const SEP = 1;  // 配置间隔列数
  const colStep = C4 + SEP;

  // 设置列宽：每配置4列 + 间隔列
  const columns = [];
  for (let i = 0; i < configCount; i++) {
    columns.push({ width: 16 }, { width: 17 }, { width: 16 }, { width: 17 });
    if (i < configCount - 1) columns.push({ width: 2 }); // 间隔列
  }
  sheet.columns = columns;

  // 标题行（顶粗线）
  for (let i = 0; i < configCount; i++) {
    const ci = i * colStep + 1;
    sheet.mergeCells(1, ci, 1, ci + C4 - 1);
    const cell = sheet.getCell(1, ci);
    cell.value = `${allConfigsData[i].configTitle}    ${new Date().toISOString().slice(0, 10)}`;
    cell.font = headerFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = ci; c < ci + C4; c++) sheet.getCell(1, c).border = headerBorder;
  }
  sheet.getRow(1).height = 20;

  // 数据行
  const maxRows = Math.max(...allConfigsData.map(d => d.rows.length));
  let lastDataRowNum = 2;

  for (let ri = 0; ri < maxRows; ri++) {
    const rowNum = ri + 2;
    for (let li = 0; li < configCount; li++) {
      const ci = li * colStep + 1;
      const rd = allConfigsData[li].rows[ri];
      if (!rd) continue;

      if (rd[0] === S) {
        sheet.mergeCells(rowNum, ci, rowNum, ci + C4 - 1);
        const cell = sheet.getCell(rowNum, ci);
        cell.value = rd[1];
        cell.font = sectionFont;
        cell.border = sectionBorder;
        cell.alignment = { vertical: 'middle' };
        for (let c = ci + 1; c < ci + C4; c++) sheet.getCell(rowNum, c).border = sectionBorder;
      } else {
        const l1 = sheet.getCell(rowNum, ci);
        l1.value = rd[1]; l1.font = labelFont; l1.border = dataBorder; l1.alignment = { vertical: 'middle' };
        const v1 = sheet.getCell(rowNum, ci + 1);
        v1.value = rd[2]; v1.font = valFont; v1.border = dataBorder; v1.alignment = { vertical: 'middle' };
        if (rd.length >= 5) {
          const l2 = sheet.getCell(rowNum, ci + 2);
          l2.value = rd[3]; l2.font = labelFont; l2.border = dataBorder; l2.alignment = { vertical: 'middle' };
          const v2 = sheet.getCell(rowNum, ci + 3);
          v2.value = rd[4]; v2.font = valFont; v2.border = dataBorder; v2.alignment = { vertical: 'middle' };
        } else {
          sheet.mergeCells(rowNum, ci + 2, rowNum, ci + 3);
          sheet.getCell(rowNum, ci + 2).border = dataBorder;
        }
        lastDataRowNum = rowNum;
      }
    }
    const fr = allConfigsData[0].rows[ri];
    sheet.getRow(rowNum).height = (fr && fr[0] === S) ? 18 : 17;
  }

  // 底粗线（各配置分别处理）
  for (let li = 0; li < configCount; li++) {
    const ci = li * colStep + 1;
    for (let c = ci; c < ci + C4; c++) {
      sheet.getCell(lastDataRowNum, c).border = lastRowBorder;
    }
  }

  // Sheet2: 计算结果
  _writeResultsToSheet(workbook, isZh ? '计算结果' : 'Results', configs, lang, compareMode);

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}


// 删除指定的云存储文件
async function deleteCloudFile(fileID) {
  if (!fileID) return false;
  try {
    await cloud.deleteFile({ fileList: [fileID] });
    return true;
  } catch (error) {
    console.log('删除文件失败:', error.message);
    return false;
  }
}

// 云函数入口函数
exports.main = async (event, context) => {
  const { configs, format, lang = 'zh', oldFileID, compareMode = false } = event;
  
  if (!configs || !Array.isArray(configs) || configs.length === 0) {
    return {
      success: false,
      error: '未提供配置数据'
    };
  }
  
  if (!['excel', 'pdf', 'word', 'excel-params'].includes(format)) {
    return {
      success: false,
      error: '无效的导出格式，请使用 excel、pdf、word 或 excel-params'
    };
  }
  
  try {
    // 如果提供了旧文件ID，先删除旧文件
    if (oldFileID) {
      await deleteCloudFile(oldFileID);
    }
    
    let buffer;
    let fileName;
    let contentType;
    
    const timestamp = formatDateTime(new Date(), 'YYYYMMDD_HHmmss');
    
    if (format === 'excel') {
      buffer = await generateExcel(configs, lang, compareMode);
      fileName = `reports/LinkBudget_${timestamp}.xlsx`;
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (format === 'excel-params') {
      buffer = await generateExcelParams(configs, lang, compareMode);
      fileName = `reports/LinkParams_${timestamp}.xlsx`;
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (format === 'pdf') {
      buffer = await generatePDF(configs, lang);
      fileName = `reports/LinkBudgetReport_${timestamp}.pdf`;
      contentType = 'application/pdf';
    } else {
      buffer = await generateWord(configs, lang);
      fileName = `reports/LinkBudgetReport_${timestamp}.docx`;
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    
    // 上传到云存储
    const uploadResult = await cloud.uploadFile({
      cloudPath: fileName,
      fileContent: buffer
    });
    
    // 获取临时下载链接（有效期2小时）
    const tempUrlResult = await cloud.getTempFileURL({
      fileList: [uploadResult.fileID]
    });
    
    const tempFileURL = tempUrlResult.fileList[0].tempFileURL;
    
    return {
      success: true,
      fileID: uploadResult.fileID,
      tempFileURL: tempFileURL,
      fileName: fileName.split('/').pop(),
      format: format
    };
    
  } catch (error) {
    console.error('生成报告失败:', error);
    return {
      success: false,
      error: error.message || '生成报告失败'
    };
  }
};

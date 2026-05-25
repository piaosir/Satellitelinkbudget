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
    islCno: 'ISL C/N0',
    islSnr: 'ISL SNR',
    islHops: 'ISL跳数',
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
    islCno: 'ISL C/N0',
    islSnr: 'ISL SNR',
    islHops: 'ISL Hops',
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

      const islMode_r = sat.islInputMode || 'cno';
      const islLabel_r = islMode_r === 'cno' ? (isZh ? 'ISL C/N₀' : 'ISL C/N0') : 'ISL SNR';
      const islUnit_r = islMode_r === 'cno' ? 'dBHz' : 'dB';
      const islDisplayVal_r = (sat.cIslDisplay !== undefined && sat.cIslDisplay !== '' && sat.cIslDisplay !== null) ? sat.cIslDisplay : sat.cIsl;

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
          [D, islLabel_r, u(islDisplayVal_r, islUnit_r), isZh ? 'ISL跳数' : 'ISL Hops', u(sat.islHops)],
          [D, isZh ? '上行最大多普勒' : 'Max Doppler UL', u(r.maxDopplerUplinkResult, 'kHz'), isZh ? '下行最大多普勒' : 'Max Doppler DL', u(r.maxDopplerDownlinkResult, 'kHz')],
          [D, isZh ? '链路时延' : 'Link Delay', u(r.linkDelayResult, 'ms')],
        ] : []),
        [S, isZh ? '载波参数' : 'Carrier Parameters'],
        [D, isZh ? '信息速率' : 'Info Rate', u(r.infoRateResult, 'kbps'), isZh ? '调制方式' : 'Modulation', u(r.modulationResult)],
        [D, 'FEC', u(r.fecResult), isZh ? '符号速率' : 'Symbol Rate', u(r.symbolRateResult, 'ksps')],
        [D, isZh ? '上行频率' : 'UL Freq.', u(r.uplinkFrequencyResult, 'GHz'), isZh ? '下行频率' : 'DL Freq.', u(r.downlinkFrequencyResult, 'GHz')],
        [D, isZh ? '门限Eb/N0' : 'Thresh. Eb/N0', u(r.ebnoResult, 'dB'), isZh ? '门限Es/N0' : 'Thresh. Es/N0', u(r.esnoResult, 'dB')],
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
          if (baseRows && li > 0) {
            const br = baseRows[ri] || [];
            if (rd[2] !== '--' && br[2] !== '--' && rd[2] !== br[2]) { l1.fill = yellowFill; v1.fill = yellowFill; }
            if (rd[4] !== '--' && br[4] !== '--' && rd[4] !== br[4]) { l2.fill = yellowFill; v2.fill = yellowFill; }
          }
        } else {
          sheet.mergeCells(rowNum, ci + 2, rowNum, ci + 3);
          sheet.getCell(rowNum, ci + 2).border = dataBorder;
          if (baseRows && li > 0) {
            const br = baseRows[ri] || [];
            if (rd[2] !== '--' && br[2] !== '--' && rd[2] !== br[2]) { l1.fill = yellowFill; v1.fill = yellowFill; }
          }
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

// 生成 PDF 报告（IPO招股书样式，参数配置+计算结果双页，大字体版）
async function generatePDF(configs, lang) {
  const t = TRANSLATIONS[lang] || TRANSLATIONS.zh;
  const isZh = (lang !== 'en');

  // 加载字体
  const chineseFontPath = path.join(__dirname, 'fonts', 'NotoSansSC-Regular.ttf');
  const englishFontPath = path.join(__dirname, 'fonts', 'GoogleSansFlex-VariableFont_GRAD,ROND,opsz,slnt,wdth,wght.ttf');
  const hasChinese = fs.existsSync(chineseFontPath);
  const hasEnglish = fs.existsSync(englishFontPath);
  
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 40, bottom: 40, left: 45, right: 45 },
      info: { Title: t.reportTitle, Author: 'LinkLab Satellite Analysis' }
    });
    
    // 注册中文字体和英文字体
    if (hasChinese) {
      doc.registerFont('Chinese', chineseFontPath);
    }
    if (hasEnglish) {
      doc.registerFont('English', englishFontPath);
    }
    
    // 字体辅助函数
    const font = (size) => {
      doc.font(hasChinese ? 'Chinese' : 'Helvetica').fontSize(size);
      return doc;
    };
    const fontBold = (size) => {
      doc.font(hasChinese ? 'Chinese' : 'Helvetica-Bold').fontSize(size);
      return doc;
    };
    const fontEn = (size) => {
      doc.font(hasEnglish ? 'English' : 'Helvetica').fontSize(size);
      return doc;
    };
    const fontEnBold = (size) => {
      doc.font(hasEnglish ? 'English' : 'Helvetica-Bold').fontSize(size);
      return doc;
    };
    
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    
    // 颜色
    const C = {
      primary: '#0d47a1',
      accent: '#c9a227',
      excellent: '#1b5e20',
      good: '#f57f17',
      qualified: '#e65100',
      poor: '#b71c1c',
      text: '#1a1a2e',
      gray: '#546e7a',
      light: '#90a4ae',
      bg: '#f5f5f5',
      white: '#ffffff',
      border: '#e0e0e0'
    };
    
    const W = 505; // page width
    const L = 45;  // left margin
    let page = 0;
    
    // ===== 预定义格式化函数 =====
    const formatPFD = (val) => {
      if (!val) return '';
      const num = String(val).replace(/[^0-9.-]/g, '');
      return num ? `${num} dBW/m2` : val;
    };
    const formatPSD = (val) => {
      if (!val) return '';
      const num = String(val).replace(/[^0-9.-]/g, '');
      return num ? `${num} dBW/Hz` : val;
    };
    const superscriptToNormal = {
      '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
      '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-'
    };
    const formatBER = (val) => {
      if (!val) return '';
      let str = String(val);
      for (const [sup, norm] of Object.entries(superscriptToNormal)) {
        str = str.replace(new RegExp(sup, 'g'), norm);
      }
      return str.replace(/×/g, 'x');
    };

    const u = (val, unit) => {
      if (val === undefined || val === null || val === '') return '--';
      return unit ? `${val} ${unit}` : String(val);
    };

    // 预先计算等效转发器带宽总计
    let totalEquivalentBW = 0;
    let totalLinkCount = 0;
    for (const config of configs) {
      const calc = config.calculationResults || {};
      for (const linkNum of Object.keys(calc)) {
        const r = calc[linkNum];
        const allocBW = parseFloat(r.allocBandwidthResult) || 0;
        const powerBW = parseFloat(r.PowerBWResult) || 0;
        totalEquivalentBW += Math.max(allocBW, powerBW);
        totalLinkCount++;
      }
    }
    const totalEquivalentBWFormatted = formatBandwidth(totalEquivalentBW);

    // ===== 参数配置页（IPO招股书三线表，10pt大字体）=====
    const drawParamsPage = (config, sat, links, linkNum) => {
      const lp = links[linkNum] || {};
      const r = (config.calculationResults || {})[linkNum] || {};
      const isNGSO = sat.orbitType === 'NGSO';
      const ngsoClass = sat.ngsoOrbitClass || 'LEO';
      const islMode = sat.islInputMode || 'cno';
      const islLabel = islMode === 'cno' ? (isZh ? 'ISL C/N₀' : 'ISL C/N0') : 'ISL SNR';
      const islUnit = islMode === 'cno' ? 'dBHz' : 'dB';
      const dvbLabel = lp.dvbStandard === 'DVB-S' ? 'DVB-S' : lp.dvbStandard === 'DVB-S2' ? 'DVB-S2' : lp.dvbStandard === 'DVB-S2X' ? 'DVB-S2X' : (isZh ? '自定义' : 'Custom');
      const isForward = lp.calcMode === 'forward';
      const noiseMode = config.noiseRatioMode || 'ebno';
      const noiseLabel = noiseMode === 'esno' ? 'Es/N₀' : 'Eb/N₀';
      const upDistMode = lp.distanceMode || 'altitude';
      const upDistLabel = upDistMode === 'slantRange' ? (isZh ? '星地斜距' : 'Slant Range') : (isZh ? '轨道高度' : 'Orbit Alt');
      const upDistVal = upDistMode === 'slantRange' ? u(lp.slantRange, 'km') : u(lp.orbitAltitude, 'km');
      const rxDistMode = lp.rxDistanceMode || 'altitude';
      const rxDistLabel = rxDistMode === 'slantRange' ? (isZh ? '星地斜距' : 'Slant Range') : (isZh ? '轨道高度' : 'Orbit Alt');
      const rxDistVal = rxDistMode === 'slantRange' ? u(lp.rxSlantRange, 'km') : u(lp.rxOrbitAltitude, 'km');
      const islDisplayVal = (sat.cIslDisplay !== undefined && sat.cIslDisplay !== '' && sat.cIslDisplay !== null) ? sat.cIslDisplay : sat.cIsl;
      const orbitMeta = isNGSO ? `${ngsoClass} / NGSO` : `${sat.orbitPosition || ''}°E`;

      let y = 32;

      // 顶粗线
      doc.lineWidth(1.8).moveTo(L, y).lineTo(L + W, y).stroke('#000000');
      y += 6;

      // 第一行：配置名称（主标识，13pt 粗体）
      fontBold(13).fillColor('#000000').text(
        config.configName || new Date().toISOString().slice(0, 10),
        L, y, { width: W, lineBreak: false }
      );
      y += 18;

      // 第二行：卫星 · 频段 · 轨道  /  日期右对齐（9pt 灰色）
      font(9).fillColor(C.gray).text(
        `${sat.satelliteName || ''} · ${sat.frequencyBand || ''} · ${orbitMeta}`,
        L, y, { width: W * 0.65, align: 'left', lineBreak: false }
      );
      font(9).fillColor(C.light).text(
        new Date().toISOString().slice(0, 10),
        L + W * 0.65, y, { width: W * 0.35, align: 'right', lineBreak: false }
      );
      y += 14;

      // 细分隔线
      doc.lineWidth(0.5).moveTo(L, y).lineTo(L + W, y).stroke('#000000');
      y += 6;

      // 4列布局比例: 0.20 | 0.30 | 0.20 | 0.30
      const colW = [W * 0.20, W * 0.30, W * 0.20, W * 0.30];
      const rowH = 19;

      const drawSec = (title) => {
        if (y + 26 > 775) { doc.addPage(); page++; y = 32; }
        y += 3;
        doc.lineWidth(0.5).moveTo(L, y).lineTo(L + W, y).stroke('#000000');
        y += 4;
        fontBold(11).fillColor('#000000').text(title, L + 3, y, { width: W });
        y += 16;
        doc.lineWidth(0.3).moveTo(L, y).lineTo(L + W, y).stroke('#000000');
        y += 3;
      };

      const drawP = (l1, v1, l2, v2) => {
        if (y + rowH > 775) { doc.addPage(); page++; y = 32; }
        let x = L;
        font(10).fillColor('#333333').text(l1 || '', x + 3, y + 2, { width: colW[0] - 6, lineBreak: false });
        x += colW[0];
        font(10).fillColor('#1a1a1a').text(v1 || '--', x + 3, y + 2, { width: colW[1] - 6, lineBreak: false });
        x += colW[1];
        if (l2 !== undefined) {
          font(10).fillColor('#333333').text(l2 || '', x + 3, y + 2, { width: colW[2] - 6, lineBreak: false });
          x += colW[2];
          font(10).fillColor('#1a1a1a').text(v2 || '--', x + 3, y + 2, { width: colW[3] - 6, lineBreak: false });
        }
        y += rowH;
      };

      if (isNGSO) {
        drawP(isZh ? '卫星名称' : 'Satellite', u(sat.satelliteName), isZh ? '轨道类型' : 'Orbit Type', `${ngsoClass} / NGSO`);
        drawP(isZh ? '工作频段' : 'Band', u(sat.frequencyBand), 'SFD', u(sat.sfdRef, 'dBW/m²'));
        drawP(isZh ? '转发器带宽' : 'Xpdr BW', u(sat.transponderBandwidth, 'MHz'), islLabel, `${u(islDisplayVal)} ${islUnit}`);
        drawP(isZh ? '转发器IBO' : 'IBO', u(sat.BOi, 'dB'), isZh ? '转发器OBO' : 'OBO', u(sat.BOo, 'dB'));
        drawP(isZh ? 'ISL跳数' : 'ISL Hops', u(sat.islHops));
      } else {
        drawP(isZh ? '卫星名称' : 'Satellite', u(sat.satelliteName), isZh ? '轨道位置' : 'Orbit', u(sat.orbitPosition, '°E'));
        drawP(isZh ? '工作频段' : 'Band', u(sat.frequencyBand), 'SFD', u(sat.sfdRef, 'dBW/m²'));
        drawP(isZh ? '转发器带宽' : 'Xpdr BW', u(sat.transponderBandwidth, 'MHz'), isZh ? '邻星离轴角' : 'Isolation', u(sat.deltaTheta, '°'));
        drawP(isZh ? '转发器IBO' : 'IBO', u(sat.BOi, 'dB'), isZh ? '转发器OBO' : 'OBO', u(sat.BOo, 'dB'));
      }

      drawP(isZh ? '上行 C/ACI' : 'UL C/ACI', u(sat.aciUplinkFactor, 'dB'), isZh ? '上行 C/ASI' : 'UL C/ASI', u(sat.adjUplinkFactor, 'dB'));
      drawP(isZh ? '上行 C/XPI' : 'UL C/XPI', u(sat.xpolUplinkFactor, 'dB'), 'HPA C/IM', u(sat.hpaIntermodFactor, 'dB'));
      drawP(isZh ? '下行 C/ACI' : 'DL C/ACI', u(sat.aciDownlinkFactor, 'dB'), isZh ? '下行 C/ASI' : 'DL C/ASI', u(sat.adjDownlinkFactor, 'dB'));
      drawP(isZh ? '下行 C/XPI' : 'DL C/XPI', u(sat.xpolDownlinkFactor, 'dB'), 'Xpdr C/IM', u(sat.xpdrIntermodFactor, 'dB'));

      drawSec(isZh ? '上行站参数' : 'Uplink Station');
      drawP(isZh ? '地面站位置' : 'TX Station', u(lp.earthStationLocation), isZh ? '极化方式' : 'Polarization', u(lp.uplinkPolarization));
      drawP(isZh ? '天线口径' : 'Antenna Dia.', u(lp.antennaDiameter, 'm'), isZh ? '天线效率' : 'Efficiency', u(lp.antennaEfficiency, '%'));
      drawP(isZh ? '经度' : 'Longitude', u(lp.longitude, '°E'), isZh ? '纬度' : 'Latitude', u(lp.latitude, '°N'));
      drawP(isZh ? '上行频率' : 'UL Freq.', u(lp.centerFrequency, 'GHz'), isZh ? '卫星 G/T' : 'Sat. G/T', u(lp.G_Ts, 'dB/K'));
      if (isNGSO) drawP(isZh ? '最低仰角' : 'Min Elevation', u(lp.minElevation, '°'), upDistLabel, upDistVal);
      drawP(isZh ? '海拔' : 'Altitude', u(lp.altitude, 'm'), isZh ? '降雨率' : 'Rain Rate', u(lp.rainRate, 'mm/h'));
      drawP(isZh ? '功放回退' : 'PA Backoff', u(lp.paBackoff, 'dB'), isZh ? '馈线损耗' : 'Feeder Loss', u(lp.feederLoss, 'dB'));
      drawP('UPC', lp.uplinkPowerControl === '自定义' ? (isZh ? `自定义 (${u(lp.upcValue)} dB)` : `Custom (${u(lp.upcValue)} dB)`) : u(lp.uplinkPowerControl), isZh ? '可用度' : 'Availability', u(lp.uplinkAvailability, '%'));
      if (isForward) drawP(isZh ? '功放功率' : 'PA Power', u(lp.inputPaPower, 'W'));

      drawSec(isZh ? '接收站参数' : 'Downlink Station');
      drawP(isZh ? '地面站位置' : 'RX Station', u(lp.rxEarthStationLocation), isZh ? '极化方式' : 'Polarization', u(lp.downlinkPolarization));
      drawP(isZh ? '天线口径' : 'Antenna Dia.', u(lp.rxAntennaDiameter, 'm'), isZh ? '天线效率' : 'Efficiency', u(lp.rxAntennaEfficiency, '%'));
      drawP(isZh ? '经度' : 'Longitude', u(lp.rxLongitude, '°E'), isZh ? '纬度' : 'Latitude', u(lp.rxLatitude, '°N'));
      drawP(isZh ? '下行频率' : 'DL Freq.', u(lp.rxCenterFrequency, 'GHz'), isZh ? '卫星 EIRP' : 'Sat. EIRP', u(lp.rxEIRP, 'dBW'));
      if (isNGSO) drawP(isZh ? '最低仰角' : 'Min Elevation', u(lp.rxMinElevation, '°'), rxDistLabel, rxDistVal);
      drawP(isZh ? '海拔' : 'Altitude', u(lp.rxAltitude, 'm'), isZh ? '降雨率' : 'Rain Rate', u(lp.rxRainRate, 'mm/h'));
      drawP(isZh ? '天线噪温' : 'Ant. Noise Temp.', u(lp.rxAntennaNoiseTemp, 'K'), isZh ? '接收机噪温' : 'Rx Noise Temp.', u(lp.rxReceiverNoiseTemp, 'K'));
      drawP(isZh ? '馈线损耗' : 'Feeder Loss', u(lp.rxFeederLoss, 'dB'), isZh ? '可用度' : 'Availability', u(lp.rxDownlinkAvailability, '%'));

      drawP(isZh ? 'DVB 标准' : 'DVB Standard', dvbLabel, isZh ? '调制方式' : 'Modulation', u(lp.modulation));
      drawP(isZh ? '信息速率' : 'Info Rate', u(lp.infoRate, 'kbps'), 'FEC', u(lp.fec));
      drawP(isZh ? '频谱效率' : 'Spectral Eff.', u(r.spectralEfficiencyResult, 'bps/Hz'), isZh ? '滚降系数 (1+α)' : 'Roll-off (1+a)', u(lp.bandwidthFactor));
      drawP('BER', `1x10^-${u(lp.ber)}`, noiseLabel, u(lp.ebno, 'dB'));
      if (!isForward) drawP(isZh ? '余量' : 'Margin', u(lp.margin, 'dB'));

      // ===== 计算结果区 =====
      const margin = r.linkmargin || '0';
      const status = getLinkStatus(margin);
      const statusText = t[`status${status.charAt(0).toUpperCase() + status.slice(1)}`];
      const availWeather = parseFloat(r.systemAvailabilityResult) >= 100
        ? (isZh ? '（晴天）' : ' (Clear)') : (isZh ? '（雨天）' : ' (Rain)');

      // 计算结果标题分隔
      y += 6;
      if (y + 30 > 775) { doc.addPage(); page++; y = 32; }
      doc.lineWidth(1.0).moveTo(L, y).lineTo(L + W, y).stroke('#000000');
      y += 5;
      fontBold(12).fillColor('#000000').text(isZh ? '计算结果' : 'Calculation Results', L + 3, y, { width: W });
      y += 18;
      doc.lineWidth(0.5).moveTo(L, y).lineTo(L + W, y).stroke('#000000');
      y += 5;

      // 核心结论
      drawSec(isZh ? '核心结论' : 'Key Results');
      drawP(isZh ? '链路状态' : 'Link Status', statusText, isZh ? '链路余量' : 'Link Margin', u(margin, 'dB'));
      drawP(isZh ? '综合C/N' : 'Total C/N', u(r.carrierTotalCN, 'dB'), isZh ? '门限C/N' : 'Threshold C/N', u(r.thresholdCN, 'dB'));
      drawP(isZh ? '系统可用度' : 'Availability', u(r.systemAvailabilityResult, '%') + availWeather, isZh ? '推荐功放' : 'Rec. PA Power', u(r.paRecommendation, 'W'));
      drawP(isZh ? '占用带宽' : 'Alloc BW', u(r.allocBandwidthResult, 'kHz'), isZh ? '功率带宽' : 'Power BW', u(r.PowerBWResult, 'kHz'));

      // 卫星参数（结果区）
      drawSec(isZh ? '卫星参数' : 'Satellite Parameters');
      if (isNGSO) {
        drawP(isZh ? '轨道类型' : 'Orbit Type', `${ngsoClass} / NGSO`, isZh ? '轨道高度' : 'Orbit Alt.', u(r.orbitAltitudeResult, 'km'));
        drawP(isZh ? '轨道速度' : 'Orbit Vel.', u(r.orbitVelocityResult, 'km/s'), isZh ? '链路时延' : 'Link Delay', u(r.linkDelayResult, 'ms'));
        drawP(islLabel, `${u(islDisplayVal)} ${islUnit}`, isZh ? 'ISL跳数' : 'ISL Hops', u(sat.islHops));
        drawP(isZh ? '上行多普勒' : 'Doppler UL', `+/-${u(r.maxDopplerUplinkResult)} kHz`, isZh ? '下行多普勒' : 'Doppler DL', `+/-${u(r.maxDopplerDownlinkResult)} kHz`);
      } else {
        drawP(isZh ? '卫星EIRP' : 'Sat. EIRP', u(r.EIRPsResult, 'dBW'), isZh ? '卫星SFD' : 'Sat. SFD', u(r.SFDsResult, 'dBW/m²'));
        drawP(isZh ? '转发器IBO' : 'IBO', u(sat.BOi, 'dB'), isZh ? '转发器OBO' : 'OBO', u(sat.BOo, 'dB'));
      }

      // 载波参数（结果区）
      drawSec(isZh ? '载波参数' : 'Carrier Parameters');
      drawP(isZh ? '信息速率' : 'Info Rate', u(r.infoRateResult, 'kbps'), isZh ? '调制方式' : 'Modulation', u(r.modulationResult));
      drawP('FEC', u(r.fecResult), isZh ? '符号速率' : 'Symbol Rate', u(r.symbolRateResult, 'ksps'));
      drawP(isZh ? '上行频率' : 'UL Freq.', u(r.uplinkFrequencyResult, 'GHz'), isZh ? '下行频率' : 'DL Freq.', u(r.downlinkFrequencyResult, 'GHz'));
      drawP(isZh ? '带宽占用率' : 'BW Usage', u(r.bandwidthUsageRatio, '%'), isZh ? '功率占用率' : 'Power Usage', u(r.powerUsageRatio, '%'));

      // 上行链路（结果区）
      drawSec(`${isZh ? '上行链路' : 'Uplink'} — ${lp.earthStationLocation || ''}`);
      drawP(isZh ? '天线口径' : 'Antenna Dia.', u(r.earthAntennaDiameterResult, 'm'), isZh ? '天线增益' : 'Antenna Gain', u(r.txAntennaGainResult, 'dB'));
      drawP(isZh ? '发射功率' : 'TX Power', `${u(r.selectedPowerWResult)} W (${u(r.selectedPowerResult)} dBW)`, isZh ? '地面站EIRP' : 'Station EIRP', u(r.stationEIRPResult, 'dBW'));
      drawP(isZh ? (isNGSO ? '最低仰角' : '仰角') : 'Elevation', u(r.elevationResult, '°'), isNGSO ? (isZh ? '斜距' : 'Slant Range') : (isZh ? '方位角' : 'Azimuth'), isNGSO ? u(r.slantRangeResult, 'km') : u(r.azimuthResult, '°'));
      drawP(isZh ? '自由空间损耗' : 'FSL', u(r.uplinkFSLResult, 'dB'), isZh ? '降雨衰减' : 'Rain Atten.', u(r.uplinkRainAttenuation, 'dB'));
      drawP(isZh ? '馈线损耗' : 'Feeder Loss', u(r.feederLossResult, 'dB'), isZh ? '上行C/N' : 'Uplink C/N', u(r.uplinkCN, 'dB'));

      // 下行链路（结果区）
      drawSec(`${isZh ? '下行链路' : 'Downlink'} — ${lp.rxEarthStationLocation || ''}`);
      drawP(isZh ? '天线口径' : 'Antenna Dia.', u(r.rxAntennaDiameterResult, 'm'), isZh ? '天线增益' : 'Antenna Gain', u(r.rxAntennaGainResult, 'dB'));
      drawP('G/T', u(r.gOverTeResult, 'dB/K'), isZh ? 'EIRP输出' : 'EIRP Output', u(r.RXeirpPerCarrierResult, 'dBW'));
      drawP(isZh ? (isNGSO ? '最低仰角' : '仰角') : 'Elevation', u(r.rxElevationResult, '°'), isNGSO ? (isZh ? '斜距' : 'Slant Range') : (isZh ? '方位角' : 'Azimuth'), isNGSO ? u(r.rxSlantRangeResult, 'km') : u(r.rxAzimuthResult, '°'));
      drawP(isZh ? '自由空间损耗' : 'FSL', u(r.downlinkFSLResult, 'dB'), isZh ? '降雨衰减' : 'Rain Atten.', u(r.downlinkRainAttenuationResult, 'dB'));
      drawP(isZh ? '馈线损耗' : 'Feeder Loss', u(r.rxFeederLossResult, 'dB'), isZh ? '下行C/N' : 'Downlink C/N', u(r.downlinkCN, 'dB'));

      // 底粗线
      y += 4;
      if (y < 775) {
        doc.lineWidth(1.8).moveTo(L, y).lineTo(L + W, y).stroke('#000000');
      }

      // 页脚
      doc.lineWidth(0.3).moveTo(L, 780).lineTo(L + W, 780).stroke(C.border);
      font(8).fillColor(C.light).text(t.footerText, L, 785, { width: W * 0.7 });
      font(8).fillColor(C.light).text(`- ${page} -`, L, 785, { width: W, align: 'right' });
    };

    // ===== 链路预算结果页（IPO招股书三线表，与参数页统一样式）=====
    const drawResultsPage = (config, sat, links, linkNum) => {
      const lp = links[linkNum] || {};
      const r = (config.calculationResults || {})[linkNum] || {};
      const isNGSO = sat.orbitType === 'NGSO';
      const ngsoClass = sat.ngsoOrbitClass || 'LEO';
      const islMode = sat.islInputMode || 'cno';
      const islLabel = islMode === 'cno' ? (isZh ? 'ISL C/N0' : 'ISL C/N0') : 'ISL SNR';
      const islUnit = islMode === 'cno' ? 'dBHz' : 'dB';
      const islDisplayVal = (sat.cIslDisplay !== undefined && sat.cIslDisplay !== '' && sat.cIslDisplay !== null) ? sat.cIslDisplay : sat.cIsl;
      const orbitMeta = isNGSO ? `${ngsoClass} / NGSO` : `${sat.orbitPosition || ''}°E`;
      const margin = r.linkmargin || '0';
      const status = getLinkStatus(margin);
      const statusText = t[`status${status.charAt(0).toUpperCase() + status.slice(1)}`];
      const availWeather = parseFloat(r.systemAvailabilityResult) >= 100
        ? (isZh ? '（晴天）' : ' (Clear)') : (isZh ? '（雨天）' : ' (Rain)');

      let y = 32;

      doc.lineWidth(1.8).moveTo(L, y).lineTo(L + W, y).stroke('#000000');
      y += 6;

      // 第一行：配置名称（主标识，13pt 粗体）
      fontBold(13).fillColor('#000000').text(
        config.configName || new Date().toISOString().slice(0, 10),
        L, y, { width: W, lineBreak: false }
      );
      y += 18;

      // 第二行：卫星 · 频段 · 轨道  /  「计算结果」右对齐（9pt 灰色）
      font(9).fillColor(C.gray).text(
        `${sat.satelliteName || ''} · ${sat.frequencyBand || ''} · ${orbitMeta}`,
        L, y, { width: W * 0.65, align: 'left', lineBreak: false }
      );
      font(9).fillColor(C.light).text(
        isZh ? '计算结果' : 'Results',
        L + W * 0.65, y, { width: W * 0.35, align: 'right', lineBreak: false }
      );
      y += 14;

      doc.lineWidth(0.5).moveTo(L, y).lineTo(L + W, y).stroke('#000000');
      y += 6;

      const colW = [W * 0.20, W * 0.30, W * 0.20, W * 0.30];
      const rowH = 19;

      const drawSec = (title) => {
        if (y + 26 > 775) { doc.addPage(); page++; y = 32; }
        y += 3;
        doc.lineWidth(0.5).moveTo(L, y).lineTo(L + W, y).stroke('#000000');
        y += 4;
        fontBold(11).fillColor('#000000').text(title, L + 3, y, { width: W });
        y += 16;
        doc.lineWidth(0.3).moveTo(L, y).lineTo(L + W, y).stroke('#000000');
        y += 3;
      };

      const drawP = (l1, v1, l2, v2) => {
        if (y + rowH > 775) { doc.addPage(); page++; y = 32; }
        let x = L;
        font(10).fillColor('#333333').text(l1 || '', x + 3, y + 2, { width: colW[0] - 6, lineBreak: false });
        x += colW[0];
        font(10).fillColor('#1a1a1a').text(v1 || '--', x + 3, y + 2, { width: colW[1] - 6, lineBreak: false });
        x += colW[1];
        if (l2 !== undefined) {
          font(10).fillColor('#333333').text(l2 || '', x + 3, y + 2, { width: colW[2] - 6, lineBreak: false });
          x += colW[2];
          font(10).fillColor('#1a1a1a').text(v2 || '--', x + 3, y + 2, { width: colW[3] - 6, lineBreak: false });
        }
        y += rowH;
      };

      // 核心结论
      drawSec(isZh ? '核心结论' : 'Key Results');
      drawP(isZh ? '链路状态' : 'Link Status', statusText, isZh ? '链路余量' : 'Link Margin', u(margin, 'dB'));
      drawP(isZh ? '综合C/N' : 'Total C/N', u(r.carrierTotalCN, 'dB'), isZh ? '门限C/N' : 'Threshold C/N', u(r.thresholdCN, 'dB'));
      drawP(isZh ? '系统可用度' : 'Availability', u(r.systemAvailabilityResult, '%') + availWeather, isZh ? '推荐功放' : 'Rec. PA Power', u(r.paRecommendation, 'W'));
      drawP(isZh ? '占用带宽' : 'Alloc BW', u(r.allocBandwidthResult, 'kHz'), isZh ? '功率带宽' : 'Power BW', u(r.PowerBWResult, 'kHz'));

      // 卫星参数
      drawSec(isZh ? '卫星参数' : 'Satellite Parameters');
      if (isNGSO) {
        drawP(isZh ? '轨道类型' : 'Orbit Type', `${ngsoClass} / NGSO`, isZh ? '轨道高度' : 'Orbit Alt.', u(r.orbitAltitudeResult, 'km'));
        drawP(isZh ? '轨道速度' : 'Orbit Vel.', u(r.orbitVelocityResult, 'km/s'), isZh ? '链路时延' : 'Link Delay', u(r.linkDelayResult, 'ms'));
        drawP(islLabel, `${u(islDisplayVal)} ${islUnit}`, isZh ? 'ISL跳数' : 'ISL Hops', u(sat.islHops));
        drawP(isZh ? '上行多普勒' : 'Doppler UL', `+/-${u(r.maxDopplerUplinkResult)} kHz`, isZh ? '下行多普勒' : 'Doppler DL', `+/-${u(r.maxDopplerDownlinkResult)} kHz`);
      } else {
        drawP(isZh ? '卫星EIRP' : 'Sat. EIRP', u(r.EIRPsResult, 'dBW'), isZh ? '卫星SFD' : 'Sat. SFD', u(r.SFDsResult, 'dBW/m²'));
        drawP(isZh ? '转发器IBO' : 'IBO', u(sat.BOi, 'dB'), isZh ? '转发器OBO' : 'OBO', u(sat.BOo, 'dB'));
      }

      // 载波参数
      drawSec(isZh ? '载波参数' : 'Carrier Parameters');
      drawP(isZh ? '信息速率' : 'Info Rate', u(r.infoRateResult, 'kbps'), isZh ? '调制方式' : 'Modulation', u(r.modulationResult));
      drawP('FEC', u(r.fecResult), isZh ? '符号速率' : 'Symbol Rate', u(r.symbolRateResult, 'ksps'));
      drawP(isZh ? '上行频率' : 'UL Freq.', u(r.uplinkFrequencyResult, 'GHz'), isZh ? '下行频率' : 'DL Freq.', u(r.downlinkFrequencyResult, 'GHz'));
      drawP(isZh ? '带宽占用率' : 'BW Usage', u(r.bandwidthUsageRatio, '%'), isZh ? '功率占用率' : 'Power Usage', u(r.powerUsageRatio, '%'));

      // 上行链路
      drawSec(`${isZh ? '上行链路' : 'Uplink'} — ${lp.earthStationLocation || ''}`);
      drawP(isZh ? '天线口径' : 'Antenna Dia.', u(r.earthAntennaDiameterResult, 'm'), isZh ? '天线增益' : 'Antenna Gain', u(r.txAntennaGainResult, 'dB'));
      drawP(isZh ? '发射功率' : 'TX Power', `${u(r.selectedPowerWResult)} W (${u(r.selectedPowerResult)} dBW)`, isZh ? '地面站EIRP' : 'Station EIRP', u(r.stationEIRPResult, 'dBW'));
      drawP(isZh ? (isNGSO ? '最低仰角' : '仰角') : 'Elevation', u(r.elevationResult, '°'), isNGSO ? (isZh ? '斜距' : 'Slant Range') : (isZh ? '方位角' : 'Azimuth'), isNGSO ? u(r.slantRangeResult, 'km') : u(r.azimuthResult, '°'));
      drawP(isZh ? '自由空间损耗' : 'FSL', u(r.uplinkFSLResult, 'dB'), isZh ? '降雨衰减' : 'Rain Atten.', u(r.uplinkRainAttenuation, 'dB'));
      drawP(isZh ? '馈线损耗' : 'Feeder Loss', u(r.feederLossResult, 'dB'), isZh ? '上行C/N' : 'Uplink C/N', u(r.uplinkCN, 'dB'));

      // 下行链路
      drawSec(`${isZh ? '下行链路' : 'Downlink'} — ${lp.rxEarthStationLocation || ''}`);
      drawP(isZh ? '天线口径' : 'Antenna Dia.', u(r.rxAntennaDiameterResult, 'm'), isZh ? '天线增益' : 'Antenna Gain', u(r.rxAntennaGainResult, 'dB'));
      drawP('G/T', u(r.gOverTeResult, 'dB/K'), isZh ? 'EIRP输出' : 'EIRP Output', u(r.RXeirpPerCarrierResult, 'dBW'));
      drawP(isZh ? (isNGSO ? '最低仰角' : '仰角') : 'Elevation', u(r.rxElevationResult, '°'), isNGSO ? (isZh ? '斜距' : 'Slant Range') : (isZh ? '方位角' : 'Azimuth'), isNGSO ? u(r.rxSlantRangeResult, 'km') : u(r.rxAzimuthResult, '°'));
      drawP(isZh ? '自由空间损耗' : 'FSL', u(r.downlinkFSLResult, 'dB'), isZh ? '降雨衰减' : 'Rain Atten.', u(r.downlinkRainAttenuationResult, 'dB'));
      drawP(isZh ? '馈线损耗' : 'Feeder Loss', u(r.rxFeederLossResult, 'dB'), isZh ? '下行C/N' : 'Downlink C/N', u(r.downlinkCN, 'dB'));

      // 底粗线
      y += 4;
      if (y < 775) {
        doc.lineWidth(1.8).moveTo(L, y).lineTo(L + W, y).stroke('#000000');
      }
      // 页脚
      doc.lineWidth(0.3).moveTo(L, 780).lineTo(L + W, 780).stroke(C.border);
      font(8).fillColor(C.light).text(t.footerText, L, 785, { width: W * 0.7 });
      font(8).fillColor(C.light).text(`- ${page} -`, L, 785, { width: W, align: 'right' });
    };

    for (const config of configs) {
      const calc = config.calculationResults || {};
      if (Object.keys(calc).length === 0) continue;

      const sat = config.satelliteParams || {};
      const links = config.linkParams || {};
      const isNGSO = sat.orbitType === 'NGSO';
      const orbitMeta = isNGSO ? `${sat.ngsoOrbitClass || 'LEO'} / NGSO` : `${sat.orbitPosition || ''}°E`;
      const islMode = sat.islInputMode || 'cno';
      const islValue = sat.cIslDisplay || sat.cIsl || '';
      const islUnit = islMode === 'cno' ? 'dBHz' : 'dB';

      for (const linkNum of Object.keys(calc)) {
        const r = calc[linkNum];
        const lp = links[linkNum] || {};

        // ===== 参数配置+计算结果合并页（IPO招股书样式）=====
        if (page > 0) doc.addPage();
        page++;
        drawParamsPage(config, sat, links, linkNum);
      }
    }

    // 最后一页汇总
    if (totalLinkCount > 1) {
      const summaryY = 745;
      const summaryText = lang === 'zh'
        ? `本报告共包含 ${totalLinkCount} 条链路，等效转发器带宽占用总计为 ${totalEquivalentBWFormatted}。`
        : `This report contains ${totalLinkCount} links with a total equivalent transponder bandwidth of ${totalEquivalentBWFormatted}.`;
      doc.rect(L, summaryY, W, 28).fill(C.bg);
      doc.rect(L, summaryY, 3, 28).fill(C.accent);
      fontBold(10).fillColor(C.text).text(summaryText, L + 10, summaryY + 8, { width: W - 20, align: 'center' });
    }

    doc.end();
  });
}

// 生成 Word 报告（IPO招股书样式，Times New Roman 14pt，含参数配置+计算结果）
async function generateWord(configs, lang) {
  const isZh = (lang !== 'en');
  const t = TRANSLATIONS[lang] || TRANSLATIONS.zh;

  let totalEquivalentBW = 0;
  let linkIndex = 0;
  const docChildren = [];

  const u = (val, unit) => {
    if (val === '' || val === null || val === undefined) return '--';
    return unit ? `${val} ${unit}` : String(val);
  };
  const v = (val) => (val !== undefined && val !== null && val !== '') ? String(val) : '--';

  // IPO招股书字型：Times New Roman 10pt
  const FONT    = 'Times New Roman';
  const SZ      = 24;   // 12pt (half-points)
  const SZ_H1   = 28;   // 14pt 章节标题
  const SZ_TITLE = 36;  // 18pt 文档主标题

  // 三线表边框
  const noBdr    = { style: BorderStyle.NONE,   size: 0,  color: 'FFFFFF' };
  const thinBdr  = { style: BorderStyle.SINGLE, size: 4,  color: '000000' };
  const midBdr   = { style: BorderStyle.SINGLE, size: 8,  color: '000000' };
  const thickBdr = { style: BorderStyle.SINGLE, size: 14, color: '000000' };

  // A4，2.5cm页边距
  const PAGE_W = 11906;
  const PAGE_M  = 1418;
  const TBL_W   = PAGE_W - PAGE_M * 2; // 9070 DXA
  // 4列宽: 标签 | 值 | 标签 | 值
  const W1 = 2100, W2 = 2435, W3 = 2100, W4 = TBL_W - W1 - W2 - W3;

  // 创建表格单元格
  const cell = (text, w, opts = {}) => {
    const { bold = false, italic = false, topBdr = noBdr, bottomBdr = noBdr,
            spanCols = 1, spanW = null, color = '000000' } = opts;
    return new TableCell({
      columnSpan: spanCols,
      width: { size: spanW !== null ? spanW : w, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      borders: { top: topBdr, bottom: bottomBdr, left: noBdr, right: noBdr },
      children: [new Paragraph({
        children: [new TextRun({ text: String(text || ''), font: FONT, size: SZ, bold, italic, color, noProof: true })],
        spacing: { before: 50, after: 50, line: 276 }
      })]
    });
  };

  // 标题行：顶粗+底细，全宽
  const titleRow = (text) => new TableRow({
    children: [cell(text, TBL_W, { bold: true, spanCols: 4, spanW: TBL_W, topBdr: thickBdr, bottomBdr: thinBdr })]
  });

  // 节标题行：首节顶粗线，非首节顶中线，纯三线表（无填充），粗体
  const secRow = (text, first = false) => new TableRow({
    children: [new TableCell({
      columnSpan: 4,
      width: { size: TBL_W, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      borders: { top: first ? thickBdr : midBdr, bottom: thinBdr, left: noBdr, right: noBdr },
      children: [new Paragraph({
        children: [new TextRun({ text: String(text || ''), font: FONT, size: SZ + 2, bold: true, noProof: true })],
        spacing: { before: 100, after: 60, line: 276 }
      })]
    })]
  });

  // 数据行：4列或2列（标签+跨列值）
  const dataRow = (l1, v1, l2, v2, isLast = false, isRed = false, isFirst = false) => {
    const bot = isLast ? thickBdr : noBdr;
    const top = isFirst ? thickBdr : noBdr;
    const lc  = isRed ? 'CC0000' : '666666';
    const vc  = isRed ? 'CC0000' : '000000';
    const mkC = (text, w, color, bold, spanCols = 1, spanW = null) => new TableCell({
      columnSpan: spanCols,
      width: { size: spanW !== null ? spanW : w, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      borders: { top: top, bottom: bot, left: noBdr, right: noBdr },
      children: [new Paragraph({
        children: [new TextRun({ text: String(text || '--'), font: FONT, size: SZ, bold, color, noProof: true })],
        spacing: { before: 40, after: 40, line: 276 }
      })]
    });
    if (l2 !== undefined) {
      return new TableRow({ children: [mkC(l1, W1, lc, isRed), mkC(v1, W2, vc, false), mkC(l2, W3, lc, isRed), mkC(v2, W4, vc, false)] });
    } else {
      return new TableRow({ children: [mkC(l1, W1, lc, isRed), mkC(v1, W2 + W3 + W4, vc, false, 3, W2 + W3 + W4)] });
    }
  };

  for (const config of configs) {
    const calc = config.calculationResults || {};
    if (Object.keys(calc).length === 0) continue;

    const sat     = config.satelliteParams || {};
    const links   = config.linkParams || {};
    const isNGSO  = sat.orbitType === 'NGSO';
    const ngsoClass = sat.ngsoOrbitClass || 'LEO';
    const orbitTag  = isNGSO ? `${ngsoClass} / NGSO` : `${sat.orbitPosition || ''}°E`;
    const islMode   = sat.islInputMode || 'cno';
    const islLabel  = islMode === 'cno' ? (isZh ? 'ISL C/N0' : 'ISL C/N0') : 'ISL SNR';
    const islUnit   = islMode === 'cno' ? 'dBHz' : 'dB';
    const islVal    = (sat.cIslDisplay !== undefined && sat.cIslDisplay !== '' && sat.cIslDisplay !== null)
                      ? sat.cIslDisplay : sat.cIsl;

    for (const linkNum of Object.keys(calc)) {
      const r  = calc[linkNum];
      const lp = links[linkNum] || {};
      linkIndex++;

      const dateStr   = new Date().toISOString().slice(0, 10);
      const dvbLabel  = lp.dvbStandard === 'DVB-S' ? 'DVB-S' : lp.dvbStandard === 'DVB-S2' ? 'DVB-S2' : lp.dvbStandard === 'DVB-S2X' ? 'DVB-S2X' : (isZh ? '自定义' : 'Custom');
      const isForward = lp.calcMode === 'forward';
      const noiseMode = config.noiseRatioMode || 'ebno';
      const noiseLabel = noiseMode === 'esno' ? 'Es/N0' : 'Eb/N0';

      const allocBW      = parseFloat(r.allocBandwidthResult) || 0;
      const powerBW      = parseFloat(r.PowerBWResult) || 0;
      const equivalentBW = Math.max(allocBW, powerBW);
      totalEquivalentBW += equivalentBW;
      const eqBWFmt      = formatBandwidth(equivalentBW);

      const linkMargin   = r.linkmargin || '0';
      const status       = getLinkStatus(linkMargin);
      const statusText   = t[`status${status.charAt(0).toUpperCase() + status.slice(1)}`];
      const availWeather = parseFloat(r.systemAvailabilityResult) >= 100
        ? (isZh ? '（晴天）' : ' (Clear Sky)') : (isZh ? '（雨天）' : ' (Rain)');

      // 链路间页断
      if (linkIndex > 1) {
        docChildren.push(new Paragraph({ pageBreakBefore: true, children: [], spacing: { before: 0, after: 0 } }));
      }

      // ===== 链路标识头（两行：配置名 + 卫星信息）=====
      docChildren.push(new Paragraph({
        children: [
          new TextRun({ text: config.configName || dateStr, font: FONT, size: SZ + 4, bold: true, noProof: true }),
          new TextRun({ break: 1 }),
          new TextRun({ text: `${sat.satelliteName || ''}  ·  ${sat.frequencyBand || ''}  ·  ${orbitTag}`, font: FONT, size: SZ - 2, italic: true, color: '444444', noProof: true }),
          new TextRun({ text: `    ${dateStr}`, font: FONT, size: SZ - 4, color: '888888', noProof: true })
        ],
        spacing: { before: 100, after: 120, line: 320 },
        border: {
          top:    { style: BorderStyle.SINGLE, size: 16, color: '000000', space: 4 },
          bottom: { style: BorderStyle.SINGLE, size: 4,  color: '000000', space: 4 }
        }
      }));

      // 参数配置标签
      docChildren.push(new Paragraph({
        children: [new TextRun({ text: isZh ? '参数配置' : 'Parameter Configuration', font: FONT, size: SZ + 4, bold: true, noProof: true })],
        spacing: { before: 80, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '000000', space: 3 } }
      }));

      const pRows = [];

      if (isNGSO) {
        pRows.push(dataRow(isZh ? '卫星名称' : 'Satellite', v(sat.satelliteName), isZh ? '轨道类型' : 'Orbit Type', `${ngsoClass} / NGSO`, false, false, true));
        pRows.push(dataRow(isZh ? '工作频段' : 'Band', v(sat.frequencyBand), 'SFD', u(sat.sfdRef, 'dBW/m²')));
        pRows.push(dataRow(isZh ? '转发器带宽' : 'Xpdr BW', u(sat.transponderBandwidth, 'MHz'), islLabel, u(islVal, islUnit)));
        pRows.push(dataRow(isZh ? '转发器IBO' : 'IBO', u(sat.BOi, 'dB'), isZh ? '转发器OBO' : 'OBO', u(sat.BOo, 'dB')));
        pRows.push(dataRow(isZh ? 'ISL跳数' : 'ISL Hops', v(sat.islHops)));
      } else {
        pRows.push(dataRow(isZh ? '卫星名称' : 'Satellite', v(sat.satelliteName), isZh ? '轨道位置' : 'Orbit', u(sat.orbitPosition, '°E'), false, false, true));
        pRows.push(dataRow(isZh ? '工作频段' : 'Band', v(sat.frequencyBand), 'SFD', u(sat.sfdRef, 'dBW/m²')));
        pRows.push(dataRow(isZh ? '转发器带宽' : 'Xpdr BW', u(sat.transponderBandwidth, 'MHz'), isZh ? '邻星离轴角' : 'Isolation', u(sat.deltaTheta, '°')));
        pRows.push(dataRow(isZh ? '转发器IBO' : 'IBO', u(sat.BOi, 'dB'), isZh ? '转发器OBO' : 'OBO', u(sat.BOo, 'dB')));
      }

      pRows.push(dataRow(isZh ? '上行 C/ACI' : 'UL C/ACI', u(sat.aciUplinkFactor, 'dB'), isZh ? '上行 C/ASI' : 'UL C/ASI', u(sat.adjUplinkFactor, 'dB')));
      pRows.push(dataRow(isZh ? '上行 C/XPI' : 'UL C/XPI', u(sat.xpolUplinkFactor, 'dB'), 'HPA C/IM', u(sat.hpaIntermodFactor, 'dB')));
      pRows.push(dataRow(isZh ? '下行 C/ACI' : 'DL C/ACI', u(sat.aciDownlinkFactor, 'dB'), isZh ? '下行 C/ASI' : 'DL C/ASI', u(sat.adjDownlinkFactor, 'dB')));
      pRows.push(dataRow(isZh ? '下行 C/XPI' : 'DL C/XPI', u(sat.xpolDownlinkFactor, 'dB'), 'Xpdr C/IM', u(sat.xpdrIntermodFactor, 'dB')));

      pRows.push(secRow(isZh ? '上行站参数' : 'Uplink Station'));
      pRows.push(dataRow(isZh ? '地面站位置' : 'TX Station', v(lp.earthStationLocation), isZh ? '极化方式' : 'Polarization', v(lp.uplinkPolarization)));
      pRows.push(dataRow(isZh ? '天线口径' : 'Antenna Dia.', u(lp.antennaDiameter, 'm'), isZh ? '天线效率' : 'Efficiency', u(lp.antennaEfficiency, '%')));
      pRows.push(dataRow(isZh ? '经度' : 'Longitude', u(lp.longitude, '°E'), isZh ? '纬度' : 'Latitude', u(lp.latitude, '°N')));
      pRows.push(dataRow(isZh ? '上行频率' : 'UL Freq.', u(lp.centerFrequency, 'GHz'), isZh ? '卫星 G/T' : 'Sat. G/T', u(lp.G_Ts, 'dB/K')));
      if (isNGSO) {
        const upDistMode = lp.distanceMode || 'altitude';
        const upDistLabel = upDistMode === 'slantRange' ? (isZh ? '星地斜距' : 'Slant Range') : (isZh ? '轨道高度' : 'Orbit Alt.');
        const upDistVal   = upDistMode === 'slantRange' ? u(lp.slantRange, 'km') : u(lp.orbitAltitude, 'km');
        pRows.push(dataRow(isZh ? '最低仰角' : 'Min Elevation', u(lp.minElevation, '°'), upDistLabel, upDistVal));
      }
      pRows.push(dataRow(isZh ? '海拔' : 'Altitude', u(lp.altitude, 'm'), isZh ? '降雨率' : 'Rain Rate', u(lp.rainRate, 'mm/h')));
      pRows.push(dataRow(isZh ? '功放回退' : 'PA Backoff', u(lp.paBackoff, 'dB'), isZh ? '馈线损耗' : 'Feeder Loss', u(lp.feederLoss, 'dB')));
      pRows.push(dataRow('UPC', lp.uplinkPowerControl === '自定义' ? (isZh ? `自定义 (${u(lp.upcValue, 'dB')})` : `Custom (${u(lp.upcValue, 'dB')})`) : v(lp.uplinkPowerControl), isZh ? '可用度' : 'Availability', u(lp.uplinkAvailability, '%')));
      if (isForward) pRows.push(dataRow(isZh ? '功放功率' : 'PA Power', u(lp.inputPaPower, 'W')));

      pRows.push(secRow(isZh ? '接收站参数' : 'Downlink Station'));
      pRows.push(dataRow(isZh ? '地面站位置' : 'RX Station', v(lp.rxEarthStationLocation), isZh ? '极化方式' : 'Polarization', v(lp.downlinkPolarization)));
      pRows.push(dataRow(isZh ? '天线口径' : 'Antenna Dia.', u(lp.rxAntennaDiameter, 'm'), isZh ? '天线效率' : 'Efficiency', u(lp.rxAntennaEfficiency, '%')));
      pRows.push(dataRow(isZh ? '经度' : 'Longitude', u(lp.rxLongitude, '°E'), isZh ? '纬度' : 'Latitude', u(lp.rxLatitude, '°N')));
      pRows.push(dataRow(isZh ? '下行频率' : 'DL Freq.', u(lp.rxCenterFrequency, 'GHz'), isZh ? '卫星 EIRP' : 'Sat. EIRP', u(lp.rxEIRP, 'dBW')));
      if (isNGSO) {
        const rxDistMode  = lp.rxDistanceMode || 'altitude';
        const rxDistLabel = rxDistMode === 'slantRange' ? (isZh ? '星地斜距' : 'Slant Range') : (isZh ? '轨道高度' : 'Orbit Alt.');
        const rxDistVal   = rxDistMode === 'slantRange' ? u(lp.rxSlantRange, 'km') : u(lp.rxOrbitAltitude, 'km');
        pRows.push(dataRow(isZh ? '最低仰角' : 'Min Elevation', u(lp.rxMinElevation, '°'), rxDistLabel, rxDistVal));
      }
      pRows.push(dataRow(isZh ? '海拔' : 'Altitude', u(lp.rxAltitude, 'm'), isZh ? '降雨率' : 'Rain Rate', u(lp.rxRainRate, 'mm/h')));
      pRows.push(dataRow(isZh ? '天线噪温' : 'Ant. Noise Temp.', u(lp.rxAntennaNoiseTemp, 'K'), isZh ? '接收机噪温' : 'Rx Noise Temp.', u(lp.rxReceiverNoiseTemp, 'K')));
      pRows.push(dataRow(isZh ? '馈线损耗' : 'Feeder Loss', u(lp.rxFeederLoss, 'dB'), isZh ? '可用度' : 'Availability', u(lp.rxDownlinkAvailability, '%')));

      pRows.push(dataRow(isZh ? 'DVB 标准' : 'DVB Standard', dvbLabel, isZh ? '调制方式' : 'Modulation', v(lp.modulation)));
      pRows.push(dataRow(isZh ? '信息速率' : 'Info Rate', u(lp.infoRate, 'kbps'), 'FEC', v(lp.fec)));
      pRows.push(dataRow(isZh ? '频谱效率' : 'Spectral Eff.', u(r.spectralEfficiencyResult, 'bps/Hz'), isZh ? '滚降系数 (1+a)' : 'Roll-off (1+a)', v(lp.bandwidthFactor)));
      pRows.push(dataRow('BER', `1x10^-${v(lp.ber)}`, noiseLabel, u(lp.ebno, 'dB'), isForward));
      if (!isForward) pRows.push(dataRow(isZh ? '余量' : 'Margin', u(lp.margin, 'dB'), undefined, undefined, true));

      docChildren.push(new Table({ width: { size: TBL_W, type: WidthType.DXA }, layout: TableLayoutType.FIXED, rows: pRows }));

      // 计算结果标签
      docChildren.push(new Paragraph({
        children: [new TextRun({ text: isZh ? '计算结果' : 'Calculation Results', font: FONT, size: SZ + 4, bold: true, noProof: true })],
        spacing: { before: 320, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '000000', space: 3 } }
      }));

      const rRows = [];

      // 卫星参数（计算值）
      rRows.push(secRow(isZh ? '卫星参数' : 'Satellite Parameters', true));
      if (isNGSO) {
        rRows.push(dataRow(isZh ? '卫星名称' : 'Satellite', u(sat.satelliteName), isZh ? '轨道类型' : 'Orbit Type', `${ngsoClass} / NGSO`));
        rRows.push(dataRow(isZh ? '轨道高度' : 'Orbit Alt.', u(r.orbitAltitudeResult, 'km'), isZh ? '轨道速度' : 'Orbit Vel.', u(r.orbitVelocityResult, 'km/s')));
      } else {
        rRows.push(dataRow(isZh ? '卫星名称' : 'Satellite', u(sat.satelliteName), isZh ? '轨道位置' : 'Orbit', u(sat.orbitPosition, '°E')));
      }
      rRows.push(dataRow(isZh ? '频段' : 'Band', u(sat.frequencyBand), isZh ? '上行频率' : 'UL Freq.', `${u(r.uplinkFrequencyResult, 'GHz')} (${r.uplinkPolarizationResult || ''})` ));
      rRows.push(dataRow(isZh ? '下行频率' : 'DL Freq.', `${u(r.downlinkFrequencyResult, 'GHz')} (${r.downlinkPolarizationResult || ''})`, isZh ? '转发器带宽' : 'Xpdr BW', u(sat.transponderBandwidth, 'MHz')));
      rRows.push(dataRow(isZh ? '卫星EIRP' : 'Sat. EIRP', u(r.EIRPsResult, 'dBW'), isZh ? '卫星SFD' : 'Sat. SFD', u(r.SFDsResult, 'dBW/m²')));
      rRows.push(dataRow(isZh ? '转发器IBO' : 'IBO', u(sat.BOi, 'dB'), isZh ? '转发器OBO' : 'OBO', u(sat.BOo, 'dB')));
      if (isNGSO) {
        rRows.push(dataRow(islLabel, u(islVal, islUnit), isZh ? 'ISL跳数' : 'ISL Hops', u(sat.islHops)));
        rRows.push(dataRow(isZh ? '上行多普勒' : 'Doppler UL', u(r.maxDopplerUplinkResult, 'kHz'), isZh ? '下行多普勒' : 'Doppler DL', u(r.maxDopplerDownlinkResult, 'kHz')));
        rRows.push(dataRow(isZh ? '链路时延' : 'Link Delay', u(r.linkDelayResult, 'ms')));
      }

      // 载波参数（计算值）
      rRows.push(secRow(isZh ? '载波参数' : 'Carrier Parameters'));
      rRows.push(dataRow(isZh ? '信息速率' : 'Info Rate', u(r.infoRateResult, 'kbps'), isZh ? '调制方式' : 'Modulation', u(r.modulationResult)));
      rRows.push(dataRow('FEC', u(r.fecResult), isZh ? '符号速率' : 'Symbol Rate', u(r.symbolRateResult, 'ksps')));
      rRows.push(dataRow(isZh ? '门限Eb/N0' : 'Thresh. Eb/N0', u(r.ebnoResult, 'dB'), isZh ? '门限Es/N0' : 'Thresh. Es/N0', u(r.esnoResult, 'dB')));

      // 上行链路
      rRows.push(secRow(`${isZh ? '上行链路' : 'Uplink'} — ${lp.earthStationLocation || ''}`));
      rRows.push(dataRow(isZh ? '天线口径' : 'Antenna Dia.', u(r.earthAntennaDiameterResult, 'm'), isZh ? '天线增益' : 'Antenna Gain', u(r.txAntennaGainResult, 'dB')));
      rRows.push(dataRow(isZh ? '发射功率 (W/dBW)' : 'TX Power (W/dBW)', `${u(r.selectedPowerWResult)} / ${u(r.selectedPowerResult)}`, isZh ? '地面站EIRP' : 'Station EIRP', u(r.stationEIRPResult, 'dBW')));
      rRows.push(dataRow(isZh ? (isNGSO ? '最低仰角' : '仰角') : 'Elevation', u(r.elevationResult, '°'), isNGSO ? (isZh ? '上行斜距' : 'UL Slant Range') : (isZh ? '方位角' : 'Azimuth'), isNGSO ? u(r.slantRangeResult, 'km') : u(r.azimuthResult, '°')));
      rRows.push(dataRow(isZh ? '自由空间损耗' : 'Free Space Loss', u(r.uplinkFSLResult, 'dB'), isZh ? '降雨衰减' : 'Rain Atten.', u(r.uplinkRainAttenuation, 'dB')));
      rRows.push(dataRow(isZh ? '馈线损耗' : 'Feeder Loss', u(r.feederLossResult, 'dB'), isZh ? '上行C/N' : 'Uplink C/N', u(r.uplinkCN, 'dB')));

      // 下行链路
      rRows.push(secRow(`${isZh ? '下行链路' : 'Downlink'} — ${lp.rxEarthStationLocation || ''}`));
      rRows.push(dataRow(isZh ? '天线口径' : 'Antenna Dia.', u(r.rxAntennaDiameterResult, 'm'), isZh ? '天线增益' : 'Antenna Gain', u(r.rxAntennaGainResult, 'dB')));
      rRows.push(dataRow('G/T', u(r.gOverTeResult, 'dB/K'), isZh ? 'EIRP输出' : 'EIRP Output', u(r.RXeirpPerCarrierResult, 'dBW')));
      rRows.push(dataRow(isZh ? (isNGSO ? '最低仰角' : '仰角') : 'Elevation', u(r.rxElevationResult, '°'), isNGSO ? (isZh ? '下行斜距' : 'DL Slant Range') : (isZh ? '方位角' : 'Azimuth'), isNGSO ? u(r.rxSlantRangeResult, 'km') : u(r.rxAzimuthResult, '°')));
      rRows.push(dataRow(isZh ? '自由空间损耗' : 'Free Space Loss', u(r.downlinkFSLResult, 'dB'), isZh ? '降雨衰减' : 'Rain Atten.', u(r.downlinkRainAttenuationResult, 'dB')));
      rRows.push(dataRow(isZh ? '馈线损耗' : 'Feeder Loss', u(r.rxFeederLossResult, 'dB'), isZh ? '下行C/N' : 'Downlink C/N', u(r.downlinkCN, 'dB')));

      // 链路预算结论
      rRows.push(secRow(isZh ? '链路预算结论' : 'Link Budget Conclusion'));
      rRows.push(dataRow(isZh ? '综合C/N' : 'Total C/N', u(r.carrierTotalCN, 'dB'), isZh ? '门限C/N' : 'Threshold C/N', u(r.thresholdCN, 'dB')));
      rRows.push(dataRow(isZh ? '链路余量' : 'Link Margin', u(linkMargin, 'dB'), isZh ? '链路状态' : 'Link Status', statusText));
      rRows.push(dataRow(isZh ? '系统可用度' : 'Availability', u(r.systemAvailabilityResult, '%') + availWeather, isZh ? '推荐功放功率' : 'Rec. PA Power', u(r.paRecommendation, 'W')));
      rRows.push(dataRow(isZh ? '载波带宽' : 'Carrier BW', u(r.allocBandwidthResult, 'kHz'), isZh ? '功率带宽' : 'Power BW', u(r.PowerBWResult, 'kHz')));
      rRows.push(dataRow(isZh ? '带宽占用' : 'BW Usage', u(r.bandwidthUsageRatio, '%'), isZh ? '功率占用' : 'Power Usage', u(r.powerUsageRatio, '%'), false, true));
      rRows.push(dataRow(isZh ? '等效占用带宽' : 'Equiv. BW', eqBWFmt, undefined, undefined, true));

      docChildren.push(new Table({ width: { size: TBL_W, type: WidthType.DXA }, layout: TableLayoutType.FIXED, rows: rRows }));
    }
  }

  // 汇总段落
  const totalFmt    = formatBandwidth(totalEquivalentBW);
  const summaryText = isZh
    ? `本报告共包含 ${linkIndex} 条链路，等效转发器带宽占用总计为 ${totalFmt}。`
    : `This report contains ${linkIndex} links with a total equivalent transponder bandwidth of ${totalFmt}.`;

  docChildren.push(new Paragraph({
    children: [new TextRun({ text: summaryText, font: FONT, size: SZ, bold: true, noProof: true })],
    spacing: { before: 320, line: 280 },
    border: {
      top:    { style: BorderStyle.SINGLE, size: 4,  color: '000000', space: 6 },
      bottom: { style: BorderStyle.SINGLE, size: 16, color: '000000', space: 6 }
    }
  }));

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

// 生成 Word 参数设置文档（仅包含输入参数，不含计算结果）
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
    const dvbLabel = lp.dvbStandard === 'DVB-S' ? 'DVB-S' : lp.dvbStandard === 'DVB-S2' ? 'DVB-S2' : lp.dvbStandard === 'DVB-S2X' ? 'DVB-S2X' : (isZh ? '自定义' : 'Custom');
    const isForward = lp.calcMode === 'forward';
    const isNGSO = sat.orbitType === 'NGSO';
    const ngsoClass = sat.ngsoOrbitClass || 'LEO';
    const islMode = sat.islInputMode || 'cno';
    const islLabel = islMode === 'cno' ? (isZh ? 'ISL C/N₀' : 'ISL C/N0') : 'ISL SNR';
    const islUnit = islMode === 'cno' ? 'dBHz' : 'dB';
    const upDistMode = lp.distanceMode || 'altitude';
    const upDistLabel = upDistMode === 'slantRange' ? (isZh ? '星地斜距' : 'Slant Range') : (isZh ? '轨道高度' : 'Orbit Alt');
    const upDistVal = upDistMode === 'slantRange' ? u(lp.slantRange, 'km') : u(lp.orbitAltitude, 'km');
    const rxDistMode = lp.rxDistanceMode || 'altitude';
    const rxDistLabel = rxDistMode === 'slantRange' ? (isZh ? '星地斜距' : 'Slant Range') : (isZh ? '轨道高度' : 'Orbit Alt');
    const rxDistVal = rxDistMode === 'slantRange' ? u(lp.rxSlantRange, 'km') : u(lp.rxOrbitAltitude, 'km');
    const islDisplayVal = (sat.cIslDisplay !== undefined && sat.cIslDisplay !== '' && sat.cIslDisplay !== null) ? sat.cIslDisplay : sat.cIsl;
    const noiseMode = config.noiseRatioMode || 'ebno';
    const noiseLabel = noiseMode === 'esno' ? 'Es/N0' : 'Eb/N0';
    const lastLabel = isForward ? (isZh ? '功放功率' : 'PA Power') : (isZh ? '余量' : 'Margin');
    const lastVal = isForward ? u(lp.inputPaPower, 'W') : u(cr.linkmargin !== undefined ? cr.linkmargin : lp.margin, 'dB');
    const configTitle = config.configName || (isZh ? '卫星链路参数设置' : 'Link Parameters');

    const rows = [
      [S, isZh ? '卫星参数' : 'Satellite Parameters'],
      ...(isNGSO ? [
        [D, isZh ? '卫星名称' : 'Satellite', u(sat.satelliteName), isZh ? '轨道类型' : 'Orbit Type', `${ngsoClass} / NGSO`],
        [D, isZh ? '工作频段' : 'Band', u(sat.frequencyBand), 'SFD', u(sat.sfdRef, 'dBW/m²')],
        [D, isZh ? '转发器带宽' : 'Xpdr BW', u(sat.transponderBandwidth, 'MHz'), islLabel, u(islDisplayVal, islUnit)],
        [D, isZh ? '转发器IBO' : 'BOi', u(sat.BOi, 'dB'), isZh ? '转发器OBO' : 'BOo', u(sat.BOo, 'dB')],
        [D, isZh ? 'ISL跳数' : 'ISL Hops', u(sat.islHops)],
      ] : [
        [D, isZh ? '卫星名称' : 'Satellite', u(sat.satelliteName), isZh ? '轨道位置' : 'Orbit', u(sat.orbitPosition, '°E')],
        [D, isZh ? '工作频段' : 'Band', u(sat.frequencyBand), 'SFD', u(sat.sfdRef, 'dBW/m²')],
        [D, isZh ? '转发器带宽' : 'Xpdr BW', u(sat.transponderBandwidth, 'MHz'), isZh ? '邻星离轴角' : 'Isolation', u(sat.deltaTheta, '°')],
        [D, isZh ? '转发器IBO' : 'BOi', u(sat.BOi, 'dB'), isZh ? '转发器OBO' : 'BOo', u(sat.BOo, 'dB')],
      ]),
      [S, isZh ? '干扰因子' : 'Interference Factors'],
      [D, isZh ? '上行C/ACI' : 'UL C/ACI', u(sat.aciUplinkFactor, 'dB'), isZh ? '上行C/ASI' : 'UL C/ASI', u(sat.adjUplinkFactor, 'dB')],
      [D, isZh ? '上行C/XPI' : 'UL C/XPI', u(sat.xpolUplinkFactor, 'dB'), 'HPA C/IM', u(sat.hpaIntermodFactor, 'dB')],
      [D, isZh ? '下行C/ACI' : 'DL C/ACI', u(sat.aciDownlinkFactor, 'dB'), isZh ? '下行C/ASI' : 'DL C/ASI', u(sat.adjDownlinkFactor, 'dB')],
      [D, isZh ? '下行C/XPI' : 'DL C/XPI', u(sat.xpolDownlinkFactor, 'dB'), 'Xpdr C/IM', u(sat.xpdrIntermodFactor, 'dB')],
      [S, isZh ? '上行站参数' : 'Uplink Station'],
      [D, isZh ? '地面站位置' : 'Station', u(lp.earthStationLocation), isZh ? '极化方式' : 'Polarization', u(lp.uplinkPolarization)],
      [D, isZh ? '天线口径' : 'Antenna Dia.', u(lp.antennaDiameter, 'm'), isZh ? '天线效率' : 'Efficiency', u(lp.antennaEfficiency, '%')],
      [D, isZh ? '经度' : 'Longitude', u(lp.longitude, '°E'), isZh ? '纬度' : 'Latitude', u(lp.latitude, '°N')],
      [D, isZh ? '上行频率' : 'UL Freq.', u(lp.centerFrequency, 'GHz'), isZh ? '卫星G/T' : 'Sat. G/T', u(lp.G_Ts, 'dB/K')],
      ...(isNGSO ? [[D, isZh ? '最低仰角' : 'Min Elevation', u(lp.minElevation, '°'), upDistLabel, upDistVal]] : []),
      [D, isZh ? '海拔' : 'Altitude', u(lp.altitude, 'm'), isZh ? '降雨率' : 'Rain Rate', u(lp.rainRate, 'mm/h')],
      [D, isZh ? '功放回退' : 'PA Backoff', u(lp.paBackoff, 'dB'), isZh ? '馈线损耗' : 'Feeder Loss', u(lp.feederLoss, 'dB')],
      [D, 'UPC', lp.uplinkPowerControl === '自定义' ? (isZh ? '自定义 ' + u(lp.upcValue, 'dB') : 'Custom ' + u(lp.upcValue, 'dB')) : u(lp.uplinkPowerControl), isZh ? '可用度' : 'Availability', u(lp.uplinkAvailability, '%')],
      [S, isZh ? '接收站参数' : 'Downlink Station'],
      [D, isZh ? '地面站位置' : 'Station', u(lp.rxEarthStationLocation), isZh ? '极化方式' : 'Polarization', u(lp.downlinkPolarization)],
      [D, isZh ? '天线口径' : 'Antenna Dia.', u(lp.rxAntennaDiameter, 'm'), isZh ? '天线效率' : 'Efficiency', u(lp.rxAntennaEfficiency, '%')],
      [D, isZh ? '经度' : 'Longitude', u(lp.rxLongitude, '°E'), isZh ? '纬度' : 'Latitude', u(lp.rxLatitude, '°N')],
      [D, isZh ? '下行频率' : 'DL Freq.', u(lp.rxCenterFrequency, 'GHz'), isZh ? '卫星EIRP' : 'Sat. EIRP', u(lp.rxEIRP, 'dBW')],
      ...(isNGSO ? [[D, isZh ? '最低仰角' : 'Min Elevation', u(lp.rxMinElevation, '°'), rxDistLabel, rxDistVal]] : []),
      [D, isZh ? '海拔' : 'Altitude', u(lp.rxAltitude, 'm'), isZh ? '降雨率' : 'Rain Rate', u(lp.rxRainRate, 'mm/h')],
      [D, isZh ? '天线噪温' : 'Ant. Noise T', u(lp.rxAntennaNoiseTemp, 'K'), isZh ? '接收机噪温' : 'Rx Noise T', u(lp.rxReceiverNoiseTemp, 'K')],
      [D, isZh ? '馈线损耗' : 'Feeder Loss', u(lp.rxFeederLoss, 'dB'), isZh ? '可用度' : 'Availability', u(lp.rxDownlinkAvailability, '%')],
      [S, isZh ? '载波参数' : 'Carrier Parameters'],
      [D, isZh ? '标准' : 'DVB Std', dvbLabel, isZh ? '调制方式' : 'Modulation', u(lp.modulation)],
      [D, isZh ? '信息速率' : 'Info Rate', u(lp.infoRate, 'kbps'), isZh ? 'FEC码率' : 'FEC Rate', u(lp.fec)],
      [D, isZh ? '频谱效率' : 'Spectral Eff.', u(cr.spectralEfficiencyResult, 'bps/Hz'), isZh ? '滚降系数' : 'Roll-off (1+α)', u(lp.bandwidthFactor)],
      [D, isZh ? '误码率' : 'BER', '1E-' + u(lp.ber), noiseLabel, u(lp.ebno, 'dB')],
      [D, lastLabel, lastVal],
    ];
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
          if (compareMode && li > 0) {
            const br = allConfigsData[0].rows[ri] || [];
            if (rd[2] !== '--' && br[2] !== '--' && rd[2] !== br[2]) { l1.fill = yellowFill; v1.fill = yellowFill; }
            if (rd[4] !== '--' && br[4] !== '--' && rd[4] !== br[4]) { l2.fill = yellowFill; v2.fill = yellowFill; }
          }
        } else {
          sheet.mergeCells(rowNum, ci + 2, rowNum, ci + 3);
          sheet.getCell(rowNum, ci + 2).border = dataBorder;
          if (compareMode && li > 0) {
            const br = allConfigsData[0].rows[ri] || [];
            if (rd[2] !== '--' && br[2] !== '--' && rd[2] !== br[2]) { l1.fill = yellowFill; v1.fill = yellowFill; }
          }
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

// 生成 PDF 参数设置文档（学术三线表风格，紧凑专业）
async function generatePdfParams(configs, lang) {
  const isZh = (lang !== 'en');

  // 加载字体
  const chineseFontPath = path.join(__dirname, 'fonts', 'NotoSansSC-Regular.ttf');
  const hasChinese = fs.existsSync(chineseFontPath);

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 28, bottom: 28, left: 32, right: 32 },
      info: { Title: isZh ? '参数设置' : 'Link Parameters', Author: 'LinkLab Satellite Analysis' }
    });

    if (hasChinese) {
      doc.registerFont('Chinese', chineseFontPath);
    }
    // Times New Roman 系列 — PDFKit 内置 Times-Roman / Times-Bold
    const font = (size) => { doc.font(hasChinese ? 'Chinese' : 'Times-Roman').fontSize(size); return doc; };
    const fontBold = (size) => { doc.font(hasChinese ? 'Chinese' : 'Times-Bold').fontSize(size); return doc; };
    const fontItalic = (size) => { doc.font(hasChinese ? 'Chinese' : 'Times-Italic').fontSize(size); return doc; };

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // 学术配色（极简黑白灰）
    const C = {
      black: '#000000',
      text: '#1a1a1a',
      label: '#333333',
      gray: '#666666',
      light: '#999999',
      rule: '#000000'
    };

    const W = 531;  // A4-32*2 边距
    const L = 32;
    const u = (val, unit) => {
      if (val === undefined || val === null || val === '') return '--';
      return unit ? `${val} ${unit}` : String(val);
    };

    let page = 0;

    for (const config of configs) {
      const sat = config.satelliteParams || {};
      const lp = getFirstLinkParams(config);
      const cr = getFirstCalcResults(config);
      const dvbLabel = lp.dvbStandard === 'DVB-S' ? 'DVB-S' : lp.dvbStandard === 'DVB-S2' ? 'DVB-S2' : lp.dvbStandard === 'DVB-S2X' ? 'DVB-S2X' : (isZh ? '自定义' : 'Custom');
      const isForward = lp.calcMode === 'forward';

      // NGSO 适配
      const isNGSO = sat.orbitType === 'NGSO';
      const ngsoClass = sat.ngsoOrbitClass || 'LEO';
      const islMode = sat.islInputMode || 'cno';
      const islLabel = islMode === 'cno' ? (isZh ? 'ISL C/N₀' : 'ISL C/N0') : 'ISL SNR';
      const islUnit = islMode === 'cno' ? 'dBHz' : 'dB';
      const upDistMode = lp.distanceMode || 'altitude';
      const upDistLabel = upDistMode === 'slantRange' ? (isZh ? '星地斜距' : 'Slant Range') : (isZh ? '轨道高度' : 'Orbit Alt');
      const upDistVal = upDistMode === 'slantRange' ? u(lp.slantRange, 'km') : u(lp.orbitAltitude, 'km');
      const rxDistMode = lp.rxDistanceMode || 'altitude';
      const rxDistLabel = rxDistMode === 'slantRange' ? (isZh ? '星地斜距' : 'Slant Range') : (isZh ? '轨道高度' : 'Orbit Alt');
      const rxDistVal = rxDistMode === 'slantRange' ? u(lp.rxSlantRange, 'km') : u(lp.rxOrbitAltitude, 'km');

      if (page > 0) doc.addPage();
      page++;

      let y = 26;

      // === 顶粗线 ===
      doc.lineWidth(1.5).moveTo(L, y).lineTo(L + W, y).stroke(C.rule);
      y += 4;

      // 标题行（名称 + 日期同行）
      const configTitle = config.configName || (isZh ? '卫星链路参数设置' : 'Link Parameters');
      fontBold(11).fillColor(C.black).text(configTitle, L + 2, y, { width: W * 0.7, continued: false });
      font(9).fillColor(C.gray).text(new Date().toISOString().slice(0, 10), L + W * 0.7, y + 1, { width: W * 0.3, align: 'right' });
      y += 16;

      // 标题下细线
      doc.lineWidth(0.5).moveTo(L, y).lineTo(L + W, y).stroke(C.rule);
      y += 3;

      // 紧凑列宽（比例：0.19 / 0.31 / 0.19 / 0.31）
      const colW = [W * 0.19, W * 0.31, W * 0.19, W * 0.31];
      const rowH = 13;

      // 绘制分节标题（斜体加粗，上下细线）
      const drawSection = (title) => {
        if (y + rowH + 6 > 790) { doc.addPage(); y = 28; doc.lineWidth(1.5).moveTo(L, y).lineTo(L + W, y).stroke(C.rule); y += 4; }
        y += 2;
        doc.lineWidth(0.5).moveTo(L, y).lineTo(L + W, y).stroke(C.rule);
        y += 2;
        fontBold(8).fillColor(C.black).text(title, L + 2, y, { width: W });
        y += 12;
        doc.lineWidth(0.3).moveTo(L, y).lineTo(L + W, y).stroke(C.rule);
        y += 2;
      };

      // 绘制参数行（无垂直线，纯净三线表内容区）
      const drawParam = (label1, val1, label2, val2) => {
        if (y + rowH > 790) { doc.addPage(); y = 28; doc.lineWidth(1.5).moveTo(L, y).lineTo(L + W, y).stroke(C.rule); y += 4; }
        let x = L;
        // 标签1
        font(7).fillColor(C.label).text(label1, x + 2, y + 2, { width: colW[0] - 4 });
        x += colW[0];
        // 值1
        font(7).fillColor(C.text).text(val1, x + 2, y + 2, { width: colW[1] - 4 });
        x += colW[1];
        if (label2 !== undefined) {
          // 标签2
          font(7).fillColor(C.label).text(label2, x + 2, y + 2, { width: colW[2] - 4 });
          x += colW[2];
          // 值2
          font(7).fillColor(C.text).text(val2 || '--', x + 2, y + 2, { width: colW[3] - 4 });
        }
        y += rowH;
      };

      // 卫星参数
      drawSection(isZh ? '卫星参数' : 'Satellite Parameters');
      if (isNGSO) {
        drawParam(isZh ? '卫星名称' : 'Satellite', u(sat.satelliteName), isZh ? '轨道类型' : 'Orbit Type', `${ngsoClass} / NGSO`);
        drawParam(isZh ? '工作频段' : 'Band', u(sat.frequencyBand), 'SFD', u(sat.sfdRef, 'dBW/m²'));
        drawParam(isZh ? '转发器带宽' : 'Xpdr BW', u(sat.transponderBandwidth, 'MHz'), islLabel, u(sat.cIsl, islUnit));
        drawParam(isZh ? '转发器IBO' : 'BOi', u(sat.BOi, 'dB'), isZh ? '转发器OBO' : 'BOo', u(sat.BOo, 'dB'));
        drawParam(isZh ? 'ISL跳数' : 'ISL Hops', u(sat.islHops));
      } else {
        drawParam(isZh ? '卫星名称' : 'Satellite', u(sat.satelliteName), isZh ? '轨道位置' : 'Orbit', u(sat.orbitPosition, '°E'));
        drawParam(isZh ? '工作频段' : 'Band', u(sat.frequencyBand), 'SFD', u(sat.sfdRef, 'dBW/m²'));
        drawParam(isZh ? '转发器带宽' : 'Xpdr BW', u(sat.transponderBandwidth, 'MHz'), isZh ? '邻星离轴角' : 'Isolation', u(sat.deltaTheta, '°'));
        drawParam(isZh ? '转发器IBO' : 'BOi', u(sat.BOi, 'dB'), isZh ? '转发器OBO' : 'BOo', u(sat.BOo, 'dB'));
      }

      // 干扰因子
      drawSection(isZh ? '干扰因子' : 'Interference Factors');
      drawParam(isZh ? '上行C/ACI' : 'UL C/ACI', u(sat.aciUplinkFactor, 'dB'), isZh ? '上行C/ASI' : 'UL C/ASI', u(sat.adjUplinkFactor, 'dB'));
      drawParam(isZh ? '上行C/XPI' : 'UL C/XPI', u(sat.xpolUplinkFactor, 'dB'), 'HPA C/IM', u(sat.hpaIntermodFactor, 'dB'));
      drawParam(isZh ? '下行C/ACI' : 'DL C/ACI', u(sat.aciDownlinkFactor, 'dB'), isZh ? '下行C/ASI' : 'DL C/ASI', u(sat.adjDownlinkFactor, 'dB'));
      drawParam(isZh ? '下行C/XPI' : 'DL C/XPI', u(sat.xpolDownlinkFactor, 'dB'), 'Xpdr C/IM', u(sat.xpdrIntermodFactor, 'dB'));

      // 上行站参数
      drawSection(isZh ? '上行站参数' : 'Uplink Station');
      drawParam(isZh ? '地面站位置' : 'Station', u(lp.earthStationLocation), isZh ? '极化方式' : 'Polarization', u(lp.uplinkPolarization));
      drawParam(isZh ? '天线口径' : 'Antenna Dia.', u(lp.antennaDiameter, 'm'), isZh ? '天线效率' : 'Efficiency', u(lp.antennaEfficiency, '%'));
      drawParam(isZh ? '经度' : 'Longitude', u(lp.longitude, '°E'), isZh ? '纬度' : 'Latitude', u(lp.latitude, '°N'));
      drawParam(isZh ? '上行频率' : 'UL Freq.', u(lp.centerFrequency, 'GHz'), isZh ? '卫星G/T' : 'Sat. G/T', u(lp.G_Ts, 'dB/K'));
      if (isNGSO) {
        drawParam(isZh ? '最低仰角' : 'Min Elevation', u(lp.minElevation, '°'), upDistLabel, upDistVal);
      }
      drawParam(isZh ? '海拔' : 'Altitude', u(lp.altitude, 'm'), isZh ? '降雨率' : 'Rain Rate', u(lp.rainRate, 'mm/h'));
      drawParam(isZh ? '功放回退' : 'PA Backoff', u(lp.paBackoff, 'dB'), isZh ? '馈线损耗' : 'Feeder Loss', u(lp.feederLoss, 'dB'));
      drawParam('UPC', lp.uplinkPowerControl === '自定义' ? (isZh ? '自定义 ' + u(lp.upcValue, 'dB') : 'Custom ' + u(lp.upcValue, 'dB')) : u(lp.uplinkPowerControl), isZh ? '可用度' : 'Availability', u(lp.uplinkAvailability, '%'));
      if (isForward) drawParam(isZh ? '功放功率' : 'PA Power', u(lp.inputPaPower, 'W'));

      // 接收站参数
      drawSection(isZh ? '接收站参数' : 'Downlink Station');
      drawParam(isZh ? '地面站位置' : 'Station', u(lp.rxEarthStationLocation), isZh ? '极化方式' : 'Polarization', u(lp.downlinkPolarization));
      drawParam(isZh ? '天线口径' : 'Antenna Dia.', u(lp.rxAntennaDiameter, 'm'), isZh ? '天线效率' : 'Efficiency', u(lp.rxAntennaEfficiency, '%'));
      drawParam(isZh ? '经度' : 'Longitude', u(lp.rxLongitude, '°E'), isZh ? '纬度' : 'Latitude', u(lp.rxLatitude, '°N'));
      drawParam(isZh ? '下行频率' : 'DL Freq.', u(lp.rxCenterFrequency, 'GHz'), isZh ? '卫星EIRP' : 'Sat. EIRP', u(lp.rxEIRP, 'dBW'));
      if (isNGSO) {
        drawParam(isZh ? '最低仰角' : 'Min Elevation', u(lp.rxMinElevation, '°'), rxDistLabel, rxDistVal);
      }
      drawParam(isZh ? '海拔' : 'Altitude', u(lp.rxAltitude, 'm'), isZh ? '降雨率' : 'Rain Rate', u(lp.rxRainRate, 'mm/h'));
      drawParam(isZh ? '天线噪温' : 'Ant. Noise T', u(lp.rxAntennaNoiseTemp, 'K'), isZh ? '接收机噪温' : 'Rx Noise T', u(lp.rxReceiverNoiseTemp, 'K'));
      drawParam(isZh ? '馈线损耗' : 'Feeder Loss', u(lp.rxFeederLoss, 'dB'), isZh ? '可用度' : 'Availability', u(lp.rxDownlinkAvailability, '%'));

      // 载波参数
      drawSection(isZh ? '载波参数' : 'Carrier Parameters');
      drawParam(isZh ? '标准' : 'DVB Std', dvbLabel, isZh ? '调制方式' : 'Modulation', u(lp.modulation));
      drawParam(isZh ? '信息速率' : 'Info Rate', u(lp.infoRate, 'kbps'), isZh ? 'FEC码率' : 'FEC Rate', u(lp.fec));
      drawParam(isZh ? '频谱效率' : 'Spectral Eff.', u(cr.spectralEfficiencyResult, 'bps/Hz'), isZh ? '滚降系数' : 'Roll-off (1+α)', u(lp.bandwidthFactor));
      const noiseMode = config.noiseRatioMode || 'ebno';
      const noiseLabel = noiseMode === 'esno' ? 'Es/N0' : 'Eb/N0';
      drawParam(isZh ? '误码率' : 'BER', '1E-' + u(lp.ber), noiseLabel, u(lp.ebno, 'dB'));
      if (!isForward) drawParam(isZh ? '余量' : 'Margin', u(lp.margin, 'dB'));

      // === 底粗线 ===
      y += 2;
      doc.lineWidth(1.5).moveTo(L, y).lineTo(L + W, y).stroke(C.rule);

      // 页脚
      font(6).fillColor(C.light).text('LinkLab Satellite Analysis', L, 800, { width: W * 0.7 });
      font(6).fillColor(C.light).text(`- ${page} -`, L, 800, { width: W, align: 'right' });
    }

    doc.end();
  });
}

// 生成 Word 参数设置文档（表格样式，与主页面排版一致）
async function generateWordParams(configs, lang) {
  const isZh = (lang !== 'en');
  const children = [];
  const FONT = isZh ? 'SimSun' : 'Arial';
  const FONT_TITLE = isZh ? 'SimHei' : 'Arial';
  const SZ = 18;       // 9pt
  const SZ_SEC = 19;   // 分节标题略大
  const SZ_TITLE = 26; // 文档标题

  // 深色主题色（深蓝灰，严肃科技感）
  const C_SECTION_BG = 'D6DCE4';  // 分节行底色
  const C_LABEL_BG = 'F2F4F7';    // 标签列底色
  const C_BORDER = '8D9AAF';      // 边框色（蓝灰）
  const C_SECTION_TEXT = '1F3864'; // 分节标题文字色（深蓝）

  const cellBorders = {
    top: { style: BorderStyle.SINGLE, size: 1, color: C_BORDER },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: C_BORDER },
    left: { style: BorderStyle.SINGLE, size: 1, color: C_BORDER },
    right: { style: BorderStyle.SINGLE, size: 1, color: C_BORDER },
  };

  // A4纵向: 11906 DXA, 页边距各567, 可用宽度 = 11906 - 567*2 = 10772
  const PAGE_W = 11906;
  const PAGE_M = 567;
  const TBL_W = PAGE_W - PAGE_M * 2; // 10772
  // 4列: 标签2400 + 值3000 + 标签2400 + 值2972 = 10772
  const W_LABEL = 2400;
  const W_VAL = 3000;
  const W_LABEL2 = 2400;
  const W_VAL2 = TBL_W - W_LABEL - W_VAL - W_LABEL2; // 2972

  // 标签单元格（浅灰底 + 加粗）
  function labelCell(text, w) {
    return new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: String(text), font: FONT, size: SZ, bold: true })],
        spacing: { line: 260 },
      })],
      width: { size: w, type: WidthType.DXA },
      borders: cellBorders,
      verticalAlign: VerticalAlign.CENTER,
      shading: { type: ShadingType.SOLID, color: C_LABEL_BG, fill: C_LABEL_BG },
    });
  }

  // 值单元格（白底）
  function valCell(text, w) {
    return new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: String(text), font: FONT, size: SZ })],
        spacing: { line: 260 },
      })],
      width: { size: w, type: WidthType.DXA },
      borders: cellBorders,
      verticalAlign: VerticalAlign.CENTER,
    });
  }

  // 分节标题行（深蓝灰底 + 深蓝字）
  function sectionRow(text, cols) {
    return new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text, font: FONT_TITLE, size: SZ_SEC, bold: true, color: C_SECTION_TEXT })],
            spacing: { line: 260 },
          })],
          columnSpan: cols,
          borders: cellBorders,
          verticalAlign: VerticalAlign.CENTER,
          shading: { type: ShadingType.SOLID, color: C_SECTION_BG, fill: C_SECTION_BG },
        }),
      ]
    });
  }

  // 参数行（4列固定DXA宽度）
  function paramRow(label1, val1, label2, val2) {
    const cells = [
      labelCell(label1, W_LABEL),
      valCell(val1, W_VAL),
    ];
    if (label2 !== undefined) {
      cells.push(labelCell(label2, W_LABEL2));
      cells.push(valCell(val2, W_VAL2));
    } else {
      cells.push(new TableCell({
        children: [new Paragraph({ children: [], spacing: { line: 260 } })],
        columnSpan: 2,
        width: { size: W_LABEL2 + W_VAL2, type: WidthType.DXA },
        borders: cellBorders,
      }));
    }
    return new TableRow({ children: cells });
  }

  const v = (val) => (val !== undefined && val !== null && val !== '') ? String(val) : '--';
  const u = (val, unit) => (val === undefined || val === null || val === '') ? '--' : (unit ? `${val} ${unit}` : String(val));

  for (const config of configs) {
    const sat = config.satelliteParams || {};
    const lp = getFirstLinkParams(config);
    const cr = getFirstCalcResults(config);
    const dvbLabel = lp.dvbStandard === 'DVB-S' ? 'DVB-S' : lp.dvbStandard === 'DVB-S2' ? 'DVB-S2' : lp.dvbStandard === 'DVB-S2X' ? 'DVB-S2X' : (isZh ? '自定义' : 'Custom');
    const isForward = lp.calcMode === 'forward';

    // 文档标题
    children.push(new Paragraph({
      children: [new TextRun({ text: config.configName || (isZh ? '卫星链路参数设置' : 'Link Parameters'), font: FONT_TITLE, size: SZ_TITLE, bold: true, color: C_SECTION_TEXT })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80, line: 276 },
    }));
    // 副标题（生成时间）
    children.push(new Paragraph({
      children: [new TextRun({ text: new Date().toISOString().slice(0, 10), font: FONT, size: 16, color: '808080' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 160, line: 240 },
    }));

    const rows = [];
    const COL = 4;

    rows.push(paramRow(isZh ? '卫星名称' : 'Satellite', v(sat.satelliteName), isZh ? '轨道位置' : 'Orbit', u(sat.orbitPosition, '°E')));
    rows.push(paramRow(isZh ? '工作频段' : 'Band', v(sat.frequencyBand), 'SFD', u(sat.sfdRef, 'dBW/m²')));
    rows.push(paramRow(isZh ? '转发器带宽' : 'Xpdr BW', u(sat.transponderBandwidth, 'MHz'), isZh ? '邻星离轴角' : 'Isolation', u(sat.deltaTheta, '°')));
    rows.push(paramRow(isZh ? '转发器IBO' : 'BOi', u(sat.BOi, 'dB'), isZh ? '转发器OBO' : 'BOo', u(sat.BOo, 'dB')));

    rows.push(paramRow(isZh ? '上行C/ACI' : 'UL C/ACI', u(sat.aciUplinkFactor, 'dB'), isZh ? '上行C/ASI' : 'UL C/ASI', u(sat.adjUplinkFactor, 'dB')));
    rows.push(paramRow(isZh ? '上行C/XPI' : 'UL C/XPI', u(sat.xpolUplinkFactor, 'dB'), 'HPA C/IM', u(sat.hpaIntermodFactor, 'dB')));
    rows.push(paramRow(isZh ? '下行C/ACI' : 'DL C/ACI', u(sat.aciDownlinkFactor, 'dB'), isZh ? '下行C/ASI' : 'DL C/ASI', u(sat.adjDownlinkFactor, 'dB')));
    rows.push(paramRow(isZh ? '下行C/XPI' : 'DL C/XPI', u(sat.xpolDownlinkFactor, 'dB'), 'Xpdr C/IM', u(sat.xpdrIntermodFactor, 'dB')));

    rows.push(sectionRow(isZh ? '上行站参数' : 'Uplink Station', COL));
    rows.push(paramRow(isZh ? '地面站位置' : 'Station', v(lp.earthStationLocation), isZh ? '极化方式' : 'Pol', v(lp.uplinkPolarization)));
    rows.push(paramRow(isZh ? '天线口径' : 'Dia', u(lp.antennaDiameter, 'm'), isZh ? '天线效率' : 'Eff', u(lp.antennaEfficiency, '%')));
    rows.push(paramRow(isZh ? '经度' : 'Lon', u(lp.longitude, '°E'), isZh ? '纬度' : 'Lat', u(lp.latitude, '°N')));
    rows.push(paramRow(isZh ? '上行频率' : 'Freq', u(lp.centerFrequency, 'GHz'), isZh ? '卫星 G/T' : 'G/T', u(lp.G_Ts, 'dB/K')));
    rows.push(paramRow(isZh ? '海拔' : 'Alt', u(lp.altitude, 'm'), isZh ? '降雨率' : 'Rain', u(lp.rainRate, 'mm/h')));
    rows.push(paramRow(isZh ? '功放回退' : 'PA BO', u(lp.paBackoff, 'dB'), isZh ? '馈线损耗' : 'Feeder', u(lp.feederLoss, 'dB')));
    rows.push(paramRow('UPC', lp.uplinkPowerControl === '自定义' ? (isZh ? '自定义(' + u(lp.upcValue, 'dB') + ')' : 'Custom(' + u(lp.upcValue, 'dB') + ')') : v(lp.uplinkPowerControl), isZh ? '可用度' : 'Avail', u(lp.uplinkAvailability, '%')));
    if (isForward) rows.push(paramRow(isZh ? '功放功率' : 'PA Power', u(lp.inputPaPower, 'W')));

    rows.push(sectionRow(isZh ? '接收站参数' : 'Downlink Station', COL));
    rows.push(paramRow(isZh ? '地面站位置' : 'Station', v(lp.rxEarthStationLocation), isZh ? '极化方式' : 'Pol', v(lp.downlinkPolarization)));
    rows.push(paramRow(isZh ? '天线口径' : 'Dia', u(lp.rxAntennaDiameter, 'm'), isZh ? '天线效率' : 'Eff', u(lp.rxAntennaEfficiency, '%')));
    rows.push(paramRow(isZh ? '经度' : 'Lon', u(lp.rxLongitude, '°E'), isZh ? '纬度' : 'Lat', u(lp.rxLatitude, '°N')));
    rows.push(paramRow(isZh ? '下行频率' : 'Freq', u(lp.rxCenterFrequency, 'GHz'), isZh ? '卫星 EIRP' : 'EIRP', u(lp.rxEIRP, 'dBW')));
    rows.push(paramRow(isZh ? '海拔' : 'Alt', u(lp.rxAltitude, 'm'), isZh ? '降雨率' : 'Rain', u(lp.rxRainRate, 'mm/h')));
    rows.push(paramRow(isZh ? '天线噪温' : 'AntT', u(lp.rxAntennaNoiseTemp, 'K'), isZh ? '接收机噪温' : 'RxT', u(lp.rxReceiverNoiseTemp, 'K')));
    rows.push(paramRow(isZh ? '馈线损耗' : 'Feeder', u(lp.rxFeederLoss, 'dB'), isZh ? '可用度' : 'Avail', u(lp.rxDownlinkAvailability, '%')));

    rows.push(paramRow(isZh ? '标准' : 'DVB Std', dvbLabel, isZh ? '调制方式' : 'Mod', v(lp.modulation)));
    rows.push(paramRow(isZh ? '信息速率' : 'Rate', u(lp.infoRate, 'kbps'), isZh ? 'FEC码率' : 'FEC', v(lp.fec)));
    rows.push(paramRow(isZh ? '频谱效率' : 'Spectral Eff', u(cr.spectralEfficiencyResult, 'bps/Hz'), isZh ? '滚降系数(1+α)' : '1+α', v(lp.bandwidthFactor)));
    const noiseMode = config.noiseRatioMode || 'ebno';
    const noiseLabel = noiseMode === 'esno' ? 'Es/N₀' : 'Eb/N₀';
    rows.push(paramRow(isZh ? '误码率' : 'BER', '1E-' + v(lp.ber), noiseLabel, u(lp.ebno, 'dB')));
    if (!isForward) rows.push(paramRow(isZh ? '余量' : 'Margin', u(lp.margin, 'dB')));

    const table = new Table({
      rows,
      width: { size: TBL_W, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
    });

    children.push(table);
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_W, height: 16838 },
          margin: { top: PAGE_M, bottom: PAGE_M, left: PAGE_M, right: PAGE_M },
        },
      },
      children,
    }]
  });
  return await Packer.toBuffer(doc);
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
  
  if (!['excel', 'pdf', 'word', 'word-params', 'excel-params', 'pdf-params'].includes(format)) {
    return {
      success: false,
      error: '无效的导出格式，请使用 excel、pdf、word、word-params、excel-params 或 pdf-params'
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
    } else if (format === 'pdf-params') {
      buffer = await generatePdfParams(configs, lang);
      fileName = `reports/LinkParams_${timestamp}.pdf`;
      contentType = 'application/pdf';
    } else if (format === 'word-params') {
      buffer = await generateWordParams(configs, lang);
      fileName = `reports/LinkParams_${timestamp}.docx`;
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
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

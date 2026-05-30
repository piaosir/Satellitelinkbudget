// pages/results-detail/results-detail.js

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
  '链路时延(单程)': 'Link Delay (One-way)',
  '上行最大多普勒': 'Max Uplink Doppler',
  '下行最大多普勒': 'Max Downlink Doppler',
  '卫星饱和 EIRP': 'Satellite Saturated EIRP',
  '卫星天线增益': 'Satellite Antenna Gain',
  '卫星 SFD': 'Satellite SFD',
  '输入补偿 IBO': 'Input Backoff IBO',
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
  '输出补偿 OBO': 'Output Backoff OBO',
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
  // —— 特殊单位 ——
  '米': 'm'
};

// 链路瀑布表界面文案（表头 / 工具栏）的中英文
const WF_UI = {
  zh: {
    docTitle: '链路预算表', exportText: '导出', exportingText: '导出中…',
    colParam: '参数', colValue: '数值', colUp: '上行', colDown: '下行', colTotal: '合计', colUnit: '单位',
    langBtn: 'EN'
  },
  en: {
    docTitle: 'Link Budget Table', exportText: 'Export', exportingText: 'Exporting…',
    colParam: 'Parameter', colValue: 'Value', colUp: 'Uplink', colDown: 'Downlink', colTotal: 'Total', colUnit: 'Unit',
    langBtn: '中'
  }
};

Page({
  data: {
    results: {},
    txLocation: '',
    rxLocation: '',
    orbitType: 'GEO',
    // NGSO 子类（LEO/MEO/HEO），仅当 orbitType === 'NGSO' 时有效
    ngsoOrbitClass: '',
    // 用于页面顶部 Banner 显示的轨道类型标签，如 "GEO" / "NGSO · LEO"
    orbitTypeLabel: 'GEO',
    orbitTypeDesc: '同步轨道（地球同步）',
    markedParams: [],
    // 分组折叠状态，默认全部展开
    expandedSections: {
      txStation: true,
      rxStation: true,
      satellite: true,
      comm: true,
      availability: true,
      ctcn: true,
      linkResult: true
    },
    // 搜索关键词
    searchKeyword: '',
    // 是否正在搜索
    isSearching: false,
    // 快速定位锚点列表
    sectionAnchors: [
      { id: 'sec-tx', label: '发信站' },
      { id: 'sec-rx', label: '收信站' },
      { id: 'sec-sat', label: '卫星' },
      { id: 'sec-comm', label: '通信' },
      { id: 'sec-avail', label: '可用度' },
      { id: 'sec-ctcn', label: '载噪比' },
      { id: 'sec-link', label: '结论' }
    ],
    activeAnchor: '',
    scrollTop: 0,
    scrollViewHeight: 0,
    elevationWarningInfo: { tx: null, rx: null },
    // 视图模式：'waterfall' 链路瀑布（默认） / 'detail' 分组明细
    viewMode: 'waterfall',
    // 链路瀑布表语言：'zh' 中文（默认） / 'en' 英文
    lang: 'zh',
    // 链路瀑布表界面文案（表头 / 工具栏），随 lang 切换
    wfUI: WF_UI.zh,
    // 链路瀑布数据（由 buildWaterfall 生成）
    waterfall: [],
    // 导出元信息（卫星 / 频段，用于报表副标题）
    exportMeta: { satelliteName: '', frequencyBand: '' },
    // 是否正在导出
    exporting: false
  },

  onReady() {
    this.measureHeight();
  },

  // 测量分组明细视图 scroll-view 可用高度（依赖 .scroll-anchor，仅 detail 视图存在）
  measureHeight() {
    const query = wx.createSelectorQuery().in(this);
    query.select('.scroll-anchor').boundingClientRect();
    query.exec((res) => {
      if (res[0]) {
        const sysInfo = wx.getWindowInfo();
        this.setData({
          scrollViewHeight: sysInfo.windowHeight - res[0].bottom
        });
      }
    });
  },

  onLoad(options) {
    options = options || {};
    // 报告模式：携带 linkNum 参数（来自「生成报告」/配置管理「报告」按钮），从全局数据读取
    // 详情模式：无参数（来自链路计算页「查看详情」），从上一页数据读取
    if (options.linkNum) {
      const linkNum = parseInt(options.linkNum) || 1;
      const g = getApp().globalData || {};
      const satelliteParams = g.satelliteParams || {};
      const linkParams = (g.linkParams || {})[linkNum] || {};
      this.applyReportData({
        results: (g.calculationResults || {})[linkNum] || {},
        markedParams: g.markedParams || [],
        txLocation: linkParams.earthStationLocation || '',
        rxLocation: linkParams.rxEarthStationLocation || '',
        orbitType: satelliteParams.orbitType || g.orbitType || 'GEO',
        ngsoOrbitClass: satelliteParams.ngsoOrbitClass || '',
        satelliteName: satelliteParams.satelliteName || '',
        frequencyBand: satelliteParams.frequencyBand || '',
        satelliteGT: linkParams.G_Ts
      });
      return;
    }

    // 详情模式：从上一页获取计算结果
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];
    if (prevPage && prevPage.data) {
      this.applyReportData({
        results: prevPage.data.results || {},
        markedParams: prevPage.data.markedParams || [],
        txLocation: (prevPage.data.linkParams && prevPage.data.linkParams.earthStationLocation) || '',
        rxLocation: (prevPage.data.linkParams && prevPage.data.linkParams.rxEarthStationLocation) || '',
        orbitType: prevPage.data.orbitType || 'GEO',
        ngsoOrbitClass: (prevPage.data.satelliteParams && prevPage.data.satelliteParams.ngsoOrbitClass)
          || prevPage.data.ngsoOrbitClass || '',
        satelliteName: (prevPage.data.satelliteParams && prevPage.data.satelliteParams.satelliteName) || '',
        frequencyBand: (prevPage.data.satelliteParams && prevPage.data.satelliteParams.frequencyBand) || '',
        satelliteGT: prevPage.data.linkParams && prevPage.data.linkParams.G_Ts
      });
    }
  },

  // 统一应用数据：计算轨道 Banner、仰角告警，并构建链路瀑布
  applyReportData(src) {
    const orbitType = src.orbitType || 'GEO';
    const ngsoClass = orbitType === 'NGSO' ? (src.ngsoOrbitClass || 'LEO') : (src.ngsoOrbitClass || '');
    // 计算用于顶部 Banner 的标签与描述
    let orbitTypeLabel = 'GEO';
    let orbitTypeDesc = '同步轨道（地球同步轨道，约 35786 km）';
    if (orbitType === 'NGSO') {
      const cls = (ngsoClass || 'LEO').toUpperCase();
      const descMap = {
        LEO: '低地球轨道（约 300–2000 km）',
        MEO: '中地球轨道（约 2000–35786 km）',
        HEO: '高椭圆轨道（远地点 > 35786 km）'
      };
      orbitTypeLabel = 'NGSO · ' + cls;
      orbitTypeDesc = descMap[cls] || '非地球同步轨道';
    }
    const results = src.results || {};

    // 卫星 G/T 回填：部分（尤其是较早保存的）配置 calculationResults 中可能缺少
    // satelliteGTResult，此处用链路参数中的卫星 G/T 输入值（linkParams.G_Ts）补齐，
    // 与计算引擎 results.satelliteGTResult = G_Ts 的取值一致。
    if (results.satelliteGTResult === undefined || results.satelliteGTResult === null || results.satelliteGTResult === '') {
      const gt = parseFloat(src.satelliteGT);
      if (!isNaN(gt)) results.satelliteGTResult = gt.toFixed(2);
    }

    // 计算仰角告警
    let txWarn = null, rxWarn = null;
    if (results.elevationValidation && results.elevationValidation.level !== 'ok') {
      const v = results.elevationValidation;
      txWarn = { level: v.level, message: v.message };
    }
    if (results.rxElevationValidation && results.rxElevationValidation.level !== 'ok') {
      const v = results.rxElevationValidation;
      rxWarn = { level: v.level, message: v.message };
    }

    this.setData({
      results: results,
      markedParams: src.markedParams || [],
      txLocation: src.txLocation || '',
      rxLocation: src.rxLocation || '',
      orbitType: orbitType,
      ngsoOrbitClass: ngsoClass,
      orbitTypeLabel: orbitTypeLabel,
      orbitTypeDesc: orbitTypeDesc,
      elevationWarningInfo: { tx: txWarn, rx: rxWarn },
      exportMeta: {
        satelliteName: src.satelliteName || '',
        frequencyBand: src.frequencyBand || ''
      }
    });

    // 构建链路瀑布数据
    this.buildWaterfall();
  },

  // ============ 链路瀑布 ============

  // 按当前语言翻译标签/标题/特殊单位；中文或未命中则原样返回
  _t(s) {
    if (this.data.lang !== 'en') return s;
    return (s && WF_DICT[s] !== undefined) ? WF_DICT[s] : s;
  },

  // 解析结果字符串为数值，非数值返回 null
  _num(v) {
    if (v === undefined || v === null) return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  },

  // 格式化（最多保留 2 位小数）
  _fmt(n) {
    if (n === null) return '—';
    return '' + (Math.round(n * 100) / 100);
  },

  _numOrDash(v) {
    return this._fmt(this._num(v));
  },

  // 透传引擎已格式化字符串（无值显示破折号；避免科学计数法被四舍五入）
  _disp(raw) {
    return (raw === undefined || raw === null || raw === '' || raw === '-') ? '—' : ('' + raw);
  },

  // 构建单值行（单列段）。kind: base|gain|loss|sub|ref|kpi|margin
  // src 为结果字段名（默认从 results 取）；若 isLiteral 为 true 则 src 直接作为原始值
  _wfRow(kind, label, src, unit, isLiteral) {
    const r = this.data.results || {};
    const raw = isLiteral ? src : r[src];
    const isCalc = (kind === 'base' || kind === 'gain' || kind === 'loss' || kind === 'sub');
    const value = isCalc ? this._fmt(this._num(raw)) : this._disp(raw);
    const signMap = { base: '', gain: '+', loss: '−', sub: '=', ref: '', kpi: '', margin: '=' };
    return { key: label, kind, sign: signMap[kind], label: this._t(label), up: value, down: '', total: '', unit: this._t(unit) || '', cum: '', _raw: raw };
  },

  // 双列行（上行 / 下行）
  _dualRow(label, upKey, downKey, unit, kind) {
    const r = this.data.results || {};
    return { key: label, kind: kind || 'ref', sign: '', label: this._t(label), up: this._disp(r[upKey]), down: this._disp(r[downKey]), total: '', unit: this._t(unit) || '', cum: '' };
  },

  // 纯参考段（单列）：list 为 [label, key, unit] 数组，自动剔除无值行
  _refSeg(title, list) {
    const rows = list
      .map((t) => this._wfRow('ref', t[0], t[1], t[2]))
      .filter((row) => row.up !== '—');
    return { title: this._t(title), cols: 1, rows };
  },

  // 级联单值行（三列布局）：value 路由到指定列 col（'up'|'down'|'total'）。
  // key 为 null 表示该格为计算检查点，值由 _cascadeTriSeg 沿链路累加后回填；
  // key 为数值时作为字面量原始值（用于 +228.6、噪声带宽、干扰损失等链路桥接项）。
  _cRow(kind, label, key, unit, col) {
    const r = this.data.results || {};
    const calc = (kind === 'base' || kind === 'gain' || kind === 'loss' || kind === 'sub' || kind === 'chk');
    const isLit = typeof key === 'number';
    const raw = key === null ? null : (isLit ? key : r[key]);
    const val = key === null ? '' : (calc ? this._fmt(this._num(raw)) : this._disp(raw));
    const signMap = { base: '', gain: '+', loss: '−', sub: '=', chk: '=', ref: '', kpi: '', margin: '=' };
    const row = { key: col + '·' + label, kind, sign: signMap[kind], label: this._t(label), up: '', down: '', total: '', unit: this._t(unit) || '', cum: '', _raw: raw, _col: col };
    row[col] = val;
    return row;
  },

  // 级联三列行：上行 / 下行 / 合计 同行展示（缺列传 null → 留空）
  _cTri(kind, label, upKey, downKey, totalKey, unit) {
    const r = this.data.results || {};
    const d = (k) => (k === null || k === undefined) ? '' : this._disp(r[k]);
    const signMap = { base: '', gain: '+', loss: '−', sub: '=', chk: '=', ref: '', kpi: '', margin: '=' };
    return { key: label, kind, sign: signMap[kind], label: this._t(label), up: d(upKey), down: d(downKey), total: d(totalKey), unit: this._t(unit) || '', cum: '', _raw: null, _col: null };
  },

  // 级联段（三列：上行 / 下行 / 合计）：沿功率链单一 running 累加，
  // 回填无引擎字段的计算检查点（到达卫星 / 转发器输出 / 到达地面电平），再剔除空 ref/kpi 行。
  _cascadeTriSeg(title, rows) {
    let running = null;
    rows.forEach((row) => {
      const k = row.kind;
      if (k !== 'base' && k !== 'gain' && k !== 'loss' && k !== 'sub' && k !== 'chk') return;
      const n = this._num(row._raw);
      if (k === 'base') {
        running = n;
      } else if (k === 'gain') {
        if (running !== null && n !== null) running += n;
      } else if (k === 'loss') {
        if (running !== null && n !== null) running -= n;
      } else if (k === 'sub' || k === 'chk') {
        if (n !== null) running = n; // 引擎权威检查点
        else if (running !== null && row._col) row[row._col] = this._fmt(running); // 计算检查点回填
      }
    });
    const hasVal = (v) => v !== '' && v !== '—';
    const kept = rows.filter((row) =>
      (row.kind !== 'ref' && row.kind !== 'kpi') || hasVal(row.up) || hasVal(row.down) || hasVal(row.total));
    return { title: this._t(title), cols: 3, rows: kept };
  },

  // 双列段（上行 / 下行）：list 为 [label, upKey, downKey, unit]，上下行皆空则剔除
  _dualSeg(title, list) {
    const rows = list
      .map((t) => this._dualRow(t[0], t[1], t[2], t[3]))
      .filter((row) => !(row.up === '—' && row.down === '—'));
    return { title: this._t(title), cols: 2, rows };
  },

  buildWaterfall() {
    const r = this.data.results || {};
    if (r.linkmargin === undefined) {
      this.setData({ waterfall: [] });
      return;
    }
    const segs = [];

    // ① 载波与调制参数（链路级，单列）
    segs.push(this._refSeg('载波与调制参数', [
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
      ['Eb/N₀', 'ebnoResult', 'dB'],
      ['Es/N₀', 'esnoResult', 'dB'],
      ['载波噪声带宽', 'RXnoiseBW', 'dB-Hz'],
      ['系统余量', 'marginResult', 'dB']
    ]));

    // ② 几何与天线（上行 / 下行 双列）
    const geoSeg = this._dualSeg('几何与天线（上行 / 下行）', [
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
      key: '城市', kind: 'ref', sign: '', label: this._t('城市'),
      up: this._disp(this.data.txLocation), down: this._disp(this.data.rxLocation),
      total: '', unit: '', cum: ''
    });
    segs.push(geoSeg);

    // ③ 传播损耗（上行 / 下行 双列）
    segs.push(this._dualSeg('传播损耗（上行 / 下行）', [
      ['自由空间损耗', 'uplinkFSLResult', 'downlinkFSLResult', 'dB'],
      ['大气衰减 P.676', 'uplinkAtmosphericAttenuationResult', 'downlinkAtmosphericAttenuationResult', 'dB'],
      ['雨衰 P.618', 'uplinkRainAttenuation', 'downlinkRainAttenuationResult', 'dB'],
      ['云衰 P.840', 'uplinkCloudAttenuation', 'downlinkCloudAttenuation', 'dB'],
      ['其他损耗', 'uplinkMiscLossResult', 'downlinkMiscLossResult', 'dB'],
      ['总衰减', 'uplinkTotalAttenuationResult', 'downlinkTotalAttenuationResult', 'dB'],
      ['雨层高度 P.839', 'uplinkRainHeightResult', 'downlinkRainHeightResult', 'km']
    ]));

    // ④ 卫星与转发器（单列）
    segs.push(this._refSeg('卫星与转发器', [
      ['卫星轨道位置', 'orbitPositionResult', '°E'],
      ['轨道高度', 'orbitAltitudeResult', 'km'],
      ['轨道速度', 'orbitVelocityResult', 'km/s'],
      ['链路时延(单程)', 'linkDelayResult', 'ms'],
      ['上行最大多普勒', 'maxDopplerUplinkResult', 'kHz'],
      ['下行最大多普勒', 'maxDopplerDownlinkResult', 'kHz'],
      ['卫星饱和 EIRP', 'EIRPsResult', 'dBW'],
      ['卫星天线增益', 'antennaGainResult', 'dBi'],
      ['卫星 SFD', 'SFDsResult', 'dBW/m²'],
      ['输入补偿 IBO', 'BOiResult', 'dB'],
      ['转发器带宽', 'transponderBandwidthResult', 'MHz'],
      ['卫星功率谱密度', 'satellitePSDResult', 'dBW/Hz']
    ]));

    // ⑤ 旁瓣·功率谱·增益与噪声（单列）
    segs.push(this._refSeg('旁瓣·功率谱·增益与噪声', [
      ['功放建议功率(W)', 'paRecommendation', 'W'],
      ['旁瓣发射增益', 'txSidelobeGainResult', 'dBi'],
      ['旁瓣 EIRP', 'txSidelobeEIRPResult', 'dBW'],
      ['旁瓣功率谱密度', 'txSidelobePSDResult', 'dBW/Hz'],
      ['地球站功率谱密度', 'stationPSDResult', 'dBW/Hz'],
      ['ITU 旁瓣 PSD 建议值', 'ituPsdLimitHz', 'dBW/Hz'],
      ['到达卫星通量密度', 'PFDcResult', 'dBW/m²'],
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
    const C = this._cRow.bind(this);
    const T = this._cTri.bind(this);
    const num = (k) => this._num(r[k]);
    const KB = 228.6; // −玻尔兹曼常数 k（dB）
    const noiseBW = num('RXnoiseBW');
    // 功放回退：功放建议功率 − 回退 = 实际输出（selectedPower）
    const paBackoffDb = num('paRecommendationdBResult') - num('selectedPowerResult');
    // 上行：沿功率链得到到达卫星热噪声 C/N，再扣除上行干扰损失 → 引擎实际上行 C/N
    const cUp = num('stationEIRPResult') - num('uplinkFSLResult') - num('uplinkAtmosphericAttenuationResult')
      - num('uplinkRainAttenuation') - num('uplinkCloudAttenuation') - num('uplinkMiscLossResult');
    const upThermalCN = cUp + num('satelliteGTResult') + KB - noiseBW;
    const upIntfLoss = upThermalCN - num('uplinkCN');
    // 下行：沿功率链得到到达地面热噪声 C/N，扣除 G/T 劣化（降雨）与下行干扰损失 → 引擎实际下行 C/N
    const cDn = num('eirpPerCarrier') - num('downlinkFSLResult') - num('downlinkAtmosphericAttenuationResult')
      - num('downlinkRainAttenuationResult') - num('downlinkCloudAttenuation') - num('downlinkMiscLossResult');
    const gtDeg = num('gOverTdegradationResult'); // G/T 降雨劣化（dB，晴空为 0）
    const dnThermalCN = cDn + num('gOverTeResult') + KB - noiseBW;
    const dnIntfLoss = dnThermalCN - gtDeg - num('downlinkCN');
    segs.push(this._cascadeTriSeg('链路预算级联（上行 / 下行 / 合计）', [
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
      C('ref', '到达卫星通量密度', 'PFDcResult', 'dBW/m²', 'up'),
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
      C('loss', '输出补偿 OBO', 'BOoResult', 'dB', 'down'),
      C('loss', '转发器工作区回退', 'actualTransponderCapacityResult', 'dB', 'down'),
      C('sub', '转发器输出 EIRP', null, 'dBW', 'down'),
      C('base', '每载波占卫星 EIRP', 'eirpPerCarrier', 'dBW', 'down'),
      C('ref', '卫星功率谱密度', 'satellitePSDResult', 'dBW/Hz', 'down'),
      C('loss', '自由空间损耗', 'downlinkFSLResult', 'dB', 'down'),
      C('loss', '大气衰减 P.676', 'downlinkAtmosphericAttenuationResult', 'dB', 'down'),
      C('loss', '雨衰 P.618', 'downlinkRainAttenuationResult', 'dB', 'down'),
      C('loss', '云衰 P.840', 'downlinkCloudAttenuation', 'dB', 'down'),
      C('loss', '其他损耗', 'downlinkMiscLossResult', 'dB', 'down'),
      C('sub', '到达地面载波电平 C', null, 'dBW', 'down'),
      C('ref', '卫星到地面 PFD', 'satellitePFD', 'dBW/m²', 'down'),
      C('ref', '接收天线增益', 'rxAntennaGainResult', 'dBi', 'down'),
      C('gain', '地球站 G/T', 'gOverTeResult', 'dB/K', 'down'),
      C('loss', 'G/T 劣化（降雨）', gtDeg, 'dB', 'down'),
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
    segs.push(this._refSeg('可用度与资源', [
      ['系统可用度', 'systemAvailabilityResult', '%'],
      ['上行可用度', 'uplinkAvailabilityResult', '%'],
      ['下行可用度', 'downlinkAvailabilityResult', '%'],
      ['年中断(分钟)', 'interruptionMinutes', 'min'],
      ['年中断(小时)', 'interruptionHours', 'h'],
      ['转发器受限因素', 'transponderLimitedBy', ''],
      ['最大载波数', 'maxCarrierCount', ''],
      ['带宽占用比', 'bandwidthUsageRatio', '%'],
      ['功率占用比', 'powerUsageRatio', '%'],
      ['上行功率占比', 'uplinkPowerRatioResult', '%'],
      ['下行功率占比', 'downlinkPowerRatioResult', '%'],
      ['功放实际输出', 'selectedPowerResult', 'dBW'],
      ['功放实际输出(W)', 'selectedPowerWResult', 'W'],
      ['功放建议值', 'paRecommendationdBResult', 'dBW'],
      ['功放建议值(W)', 'paRecommendation', 'W'],
      ['UPC 上行功控余量', 'UPCmarginResult', 'dB']
    ]));

    this.setData({ waterfall: segs });
  },

  // 切换视图模式
  switchView(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.viewMode) return;
    this.setData({ viewMode: mode });
    if (mode === 'detail') {
      setTimeout(() => { this.measureHeight(); }, 50);
    }
  },

  // 一键切换链路瀑布表中英文，重建表格数据与界面文案
  toggleLang() {
    const lang = this.data.lang === 'en' ? 'zh' : 'en';
    this.setData({ lang, wfUI: WF_UI[lang] }, () => {
      this.buildWaterfall();
    });
  },

  // 切换分组展开/折叠
  toggleSection(e) {
    const section = e.currentTarget.dataset.section;
    const key = `expandedSections.${section}`;
    this.setData({
      [key]: !this.data.expandedSections[section]
    });
  },

  // 全部展开
  expandAll() {
    const expanded = {};
    Object.keys(this.data.expandedSections).forEach(key => {
      expanded[`expandedSections.${key}`] = true;
    });
    this.setData(expanded);
  },

  // 全部折叠
  collapseAll() {
    const collapsed = {};
    Object.keys(this.data.expandedSections).forEach(key => {
      collapsed[`expandedSections.${key}`] = false;
    });
    this.setData(collapsed);
  },

  // 搜索输入
  onSearchInput(e) {
    const keyword = e.detail.value;
    this.setData({
      searchKeyword: keyword,
      isSearching: keyword.length > 0
    });
  },

  // 清除搜索
  clearSearch() {
    this.setData({
      searchKeyword: '',
      isSearching: false
    });
  },

  // 快速定位到分组
  scrollToSection(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ activeAnchor: id });

    // 锚点ID到折叠key的映射
    const anchorToSection = {
      'sec-tx': 'txStation',
      'sec-rx': 'rxStation',
      'sec-sat': 'satellite',
      'sec-comm': 'comm',
      'sec-avail': 'availability',
      'sec-ctcn': 'ctcn',
      'sec-link': 'linkResult'
    };
    const sectionKey = anchorToSection[id];
    if (sectionKey && !this.data.expandedSections[sectionKey]) {
      this.setData({ [`expandedSections.${sectionKey}`]: true });
    }

    // 等待展开动画后再定位
    setTimeout(() => {
      const query = wx.createSelectorQuery().in(this);
      query.select('#' + id).boundingClientRect();
      query.select('.results-scroll').boundingClientRect();
      query.select('.results-scroll').scrollOffset();
      query.exec((res) => {
        if (res[0] && res[1] && res[2]) {
          const targetTop = res[0].top;
          const scrollTop = res[2].scrollTop;
          const containerTop = res[1].top;
          this.setData({
            scrollTop: scrollTop + targetTop - containerTop
          });
        }
      });
    }, 50);
  },

  // 切换高亮标记
  toggleHighlight(e) {
    const param = e.currentTarget.dataset.param;
    const markedParams = [...this.data.markedParams];
    const index = markedParams.indexOf(param);
    
    if (index > -1) {
      markedParams.splice(index, 1);
    } else {
      markedParams.push(param);
    }
    
    this.setData({ markedParams });
    
    // 同步回主页
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];
    if (prevPage) {
      prevPage.setData({ markedParams });
    }
  },

  // 导出链路预算表（Word / Excel）
  exportTable() {
    if (this.data.exporting) return;
    const segments = this.data.waterfall || [];
    if (!segments.length) {
      wx.showToast({ title: '暂无可导出的数据', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: ['导出 Word（.docx）', '导出 Excel（.xlsx）'],
      success: (res) => {
        const format = res.tapIndex === 0 ? 'word' : 'excel';
        this.doExport(format);
      }
    });
  },

  // 调用云函数生成并打开文档
  async doExport(format) {
    const segments = this.data.waterfall || [];
    const meta = this.buildExportMeta();
    const fileType = format === 'word' ? 'docx' : 'xlsx';
    const storageKey = format === 'word' ? 'lastLinkBudgetWordFileID' : 'lastLinkBudgetExcelFileID';

    this.setData({ exporting: true });
    wx.showLoading({ title: format === 'word' ? '生成 Word…' : '生成 Excel…', mask: true });

    try {
      const oldFileID = wx.getStorageSync(storageKey) || null;
      const res = await wx.cloud.callFunction({
        name: 'exportLinkBudget',
        data: { segments, meta, format, oldFileID, lang: this.data.lang }
      });

      if (!res.result || !res.result.success) {
        throw new Error((res.result && res.result.error) || '云函数返回错误');
      }

      wx.setStorageSync(storageKey, res.result.fileID);

      const downloadRes = await wx.cloud.downloadFile({ fileID: res.result.fileID });
      if (!downloadRes.tempFilePath) {
        throw new Error('文件下载失败');
      }

      wx.hideLoading();
      this.setData({ exporting: false });

      wx.openDocument({
        filePath: downloadRes.tempFilePath,
        showMenu: true,
        fileType,
        fail: (err) => {
          console.error('打开文档失败:', err);
          wx.showModal({
            title: '导出成功',
            content: `链路预算表已生成\n\n文件名: ${res.result.fileName}\n\n请点击右上角菜单转发或保存`,
            showCancel: false
          });
        }
      });
    } catch (error) {
      console.error('导出链路预算表失败:', error);
      wx.hideLoading();
      this.setData({ exporting: false });
      wx.showToast({ title: error.message || '导出失败', icon: 'none', duration: 2500 });
    }
  },

  // 组装报告副标题（卫星 · 频段 · 轨道 · 时间）
  buildExportMeta() {
    const m = this.data.exportMeta || {};
    const en = this.data.lang === 'en';
    const parts = [];
    if (m.satelliteName) parts.push(m.satelliteName);
    if (m.frequencyBand) parts.push(m.frequencyBand + (en ? ' Band' : ' 频段'));
    if (this.data.orbitTypeLabel) parts.push(this.data.orbitTypeLabel);
    const d = new Date();
    const p = (n) => ('' + n).padStart(2, '0');
    const dateText = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    parts.push(dateText);
    return {
      title: en ? 'Link Budget Table' : '链路预算表',
      subtitle: parts.join('　·　')
    };
  },

  // 返回主页
  goBack() {
    wx.navigateBack();
  }
});

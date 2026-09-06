// pages/results-detail/results-detail.js

// 链路瀑布数据构建（含 WF_DICT 中英文翻译字典）已抽取至 utils/waterfallBuilder.js，
// 与历史记录/配置管理「专业版」导出共用，保证页面与报告口径完全一致。
const { buildWaterfallSegments } = require('../../utils/waterfallBuilder');

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
    exporting: false,
    // 「通信参数」段实际行数（3GPP 与 DVB 载波的行不同，见 _commCount）
    commCount: 0
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
      },
      commCount: this._commCount(results)
    });

    // 构建链路瀑布数据
    this.buildWaterfall();
  },

  // 「通信参数」那一段实际会画出几行。
  //
  // 由来：这个数原先写死成「21项」。3GPP NTN 载波多出十来行物理层参数（PRB 数、重复次数、
  // 传输块大小、两档 SNR 门限…），又少了载波速率 / 符号率 / 码片速率 / 误码率四行（对 OFDM 没有
  // 这几个量，引擎刻意不出假读数），写死的数对哪一族都不对。逐项按 WXML 里那些 wx:if 的判据数一遍。
  _commCount(r) {
    const always = ['uplinkFrequencyResult', 'downlinkFrequencyResult', 'allocBandwidthResult',
      'spectralEfficiencyResult', 'uplinkPolarizationResult', 'downlinkPolarizationResult',
      'infoRateResult', 'modulationResult', 'modulationFactorResult', 'ebnoResult',
      'fecResult', 'RXnoiseBW', 'marginResult'];
    // 值为空即整行不出的那些（DVB 专有四项 + 3GPP 物理层十余项）
    const maybe = ['berResult', 'ebnoActualResult',
      'carrierRateResult', 'ChipRateResult', 'symbolRateResult',
      'phyDescResult', 'phyDirTextResult', 'phyBandResult', 'phyMcsResult', 'phyScsResult',
      'phyUnitsResult', 'phySpanResult', 'phyRepResult', 'phyTbsResult', 'phyCodeRateResult',
      'phyBlerResult', 'noiseBwResult', 'snrThresholdResult', 'snrThresholdEffResult', 'snrActualResult'];
    const has = (k) => { const v = r && r[k]; return v !== undefined && v !== null && v !== ''; };
    // Es/N₀ 两行：引擎对 3GPP 载波照常出这两个数（与每资源元素 SNR 恒同值，不是空串），WXML 按
    // phyKindResult 整行隐藏、另出「门限 SNR」两行（与首页结果面板、瀑布表同一口径），故 3GPP 时不计
    const esno = (r && r.phyKindResult) ? [] : ['esnoResult', 'esnoActualResult'];
    return always.filter(has).length + maybe.filter(has).length + esno.filter(has).length;
  },

  // ============ 链路瀑布 ============
  // 数据构建（GEO/NGSO 七段三线表）已抽取至 utils/waterfallBuilder.js 共享，
  // 历史记录/配置管理「专业版」导出走同一构建器，改字段映射只需改 util 一处。
  buildWaterfall() {
    const segs = buildWaterfallSegments({
      results: this.data.results,
      lang: this.data.lang,
      txLocation: this.data.txLocation,
      rxLocation: this.data.rxLocation,
      orbitType: this.data.orbitType
    });
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

  // 导出链路预算表（Word / Excel / PDF）
  exportTable() {
    if (this.data.exporting) return;
    const segments = this.data.waterfall || [];
    if (!segments.length) {
      wx.showToast({ title: '暂无可导出的数据', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: ['导出 Word（.docx）', '导出 Excel（.xlsx）', '导出 PDF（.pdf）'],
      success: (res) => {
        const format = res.tapIndex === 0 ? 'word' : (res.tapIndex === 1 ? 'excel' : 'pdf');
        this.doExport(format);
      }
    });
  },

  // 调用云函数生成并打开文档
  async doExport(format) {
    const segments = this.data.waterfall || [];
    const meta = this.buildExportMeta();
    const fileType = format === 'word' ? 'docx' : (format === 'excel' ? 'xlsx' : 'pdf');
    const storageKey = format === 'word' ? 'lastLinkBudgetWordFileID'
      : (format === 'excel' ? 'lastLinkBudgetExcelFileID' : 'lastLinkBudgetPdfFileID');
    const loadingText = format === 'word' ? '生成 Word…' : (format === 'excel' ? '生成 Excel…' : '生成 PDF…');

    this.setData({ exporting: true });
    wx.showLoading({ title: loadingText, mask: true });

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

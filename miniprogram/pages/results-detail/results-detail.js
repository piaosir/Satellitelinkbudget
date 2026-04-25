// pages/results-detail/results-detail.js
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
    scrollViewHeight: 0
  },

  onReady() {
    // 计算 scroll-view 可用高度
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
    // 从全局获取计算结果
    const app = getApp();
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];
    
    if (prevPage && prevPage.data) {
      const orbitType = prevPage.data.orbitType || 'GEO';
      const ngsoClass = (prevPage.data.satelliteParams && prevPage.data.satelliteParams.ngsoOrbitClass)
        || prevPage.data.ngsoOrbitClass
        || '';
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
      this.setData({
        results: prevPage.data.results || {},
        markedParams: prevPage.data.markedParams || [],
        txLocation: prevPage.data.linkParams && prevPage.data.linkParams.earthStationLocation || '',
        rxLocation: prevPage.data.linkParams && prevPage.data.linkParams.rxEarthStationLocation || '',
        orbitType: orbitType,
        ngsoOrbitClass: ngsoClass,
        orbitTypeLabel: orbitTypeLabel,
        orbitTypeDesc: orbitTypeDesc
      });
    }
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

  // 返回主页
  goBack() {
    wx.navigateBack();
  }
});

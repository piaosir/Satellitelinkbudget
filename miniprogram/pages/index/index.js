// index.js
const app = getApp();
const { MODULATION_OPTIONS, FREQUENCY_BAND_OPTIONS, FEC_OPTIONS, DVB_STANDARD_OPTIONS, DVBS_MODCOD_TABLE, DVBS2_MODCOD_TABLE, DVBS2X_MODCOD_TABLE } = require('../../utils/constants');
const { validateAllParams } = require('../../utils/validator');
const { formatResultsForDisplay } = require('../../utils/formatter');
const { calculateLinkBudget } = require('../../utils/linkCalculator');
const { getAllCities, getDisplayOrderCities, searchCities, getCityByName } = require('../../utils/cities');
const { estimateRainRate, getNearestCityInfo } = require('../../utils/rainRate');
const { calculateSunOutage, BAND_PARAMS } = require('../../utils/sunOutageCalculator');

// 解析分数或小数字符串的辅助函数
function parseFractionOrDecimal(input, defaultValue) {
  if (input === '' || input === null || input === undefined) {
    return defaultValue;
  }
  const str = String(input).trim();
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 2) {
      const numerator = parseFloat(parts[0].trim());
      const denominator = parseFloat(parts[1].trim());
      if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
        return numerator / denominator;
      }
    }
    return defaultValue;
  }
  const value = parseFloat(str);
  return isNaN(value) ? defaultValue : value;
}

// 调制因子（用于符号率反推信息速率）
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

Page({
  data: {
    // 链路编号
    linkNumbers: [1, 2, 3, 4, 5, 6, 7, 8],
    currentLinkNum: 1,

    // 导航栏位置信息
    navBarTop: 0,
    navBarHeight: 32,
    navBarRight: 0,
    contentScrollTop: 0,
    
    // 卫星列表
    satellites: [
      { "name": "CHINASAT 10R", "position": "110.5" },
      { "name": "CHINASAT 6D", "position": "125" },
      { "name": "CHINASAT 6C", "position": "130.5" },
      { "name": "CHINASAT 6E", "position": "115.5" },
      { "name": "CHINASAT 9", "position": "92.2" },
      { "name": "CHINASAT 9B", "position": "101.4" },
      { "name": "CHINASAT 9C", "position": "92.2" },
      { "name": "CHINASAT 10", "position": "110.5" },
      { "name": "CHINASAT 11", "position": "98" },
      { "name": "CHINASAT 12", "position": "87.5" },
      { "name": "CHINASAT 15", "position": "51.5" },
      { "name": "CHINASAT 19", "position": "163.4" },
      { "name": "CHINASAT 16", "position": "110.5" },
      { "name": "CHINASAT 26", "position": "125" },
      { "name": "CHINASAT 27", "position": "87.5" },
      { "name": "APSTAR 5C", "position": "138" },
      { "name": "APSTAR 6C", "position": "134" },
      { "name": "APSTAR 7", "position": "76.5" },
      { "name": "APSTAR 9", "position": "142" },
      { "name": "APSTAR 6D", "position": "134" },
      { "name": "AsiaSat 5", "position": "100.5" },
      { "name": "AsiaSat 6", "position": "120" },
      { "name": "AsiaSat 7", "position": "105.5" },
      { "name": "AsiaSat 9", "position": "122" },
      { "name": "JCSAT-1C", "position": "150" },
      { "name": "JCSAT-2B", "position": "154" },
      { "name": "JCSAT-3A", "position": "128" },
      { "name": "JCSAT-4B", "position": "124" }
    ],
    satelliteIndex: 0,
    
    // 卫星参数
    satelliteParams: {},
    satelliteParamsExpandState: 'full', // 'full', 'partial', 'collapsed'
    
    // 链路参数
    linkParams: {},
    uplinkParamsExpandState: 'full', // 'full', 'partial', 'collapsed'
    downlinkParamsExpandState: 'full', // 'full', 'partial', 'collapsed'
    carrierParamsExpandState: 'full', // 'full', 'partial', 'collapsed' - 基带参数默改为默认全展开
    
    // 计算结果展开状态
    resultsExpandState: 'full', // 'full', 'partial', 'collapsed'
    
    // 噪声比模式
    noiseRatioMode: 'ebno', // 'ebno' 或 'esno'
    
    // 余量相关
    marginValue: '3.00', // 当前余量值
    marginMode: 'manual', // 'manual' 手动设置 或 'balanced' 功带平衡
    isBalancing: false, // 是否正在进行功带平衡计算
    
    // 正向计算模式 - 输入功放功率反推余量
    calcMode: 'reverse', // 'reverse' 反向(默认，根据余量算功放) 或 'forward' 正向(根据功放算余量)
    inputPaPower: '', // 正向计算时输入的功放功率(瓦特)
    isForwardCalculating: false, // 是否正在进行正向计算
    showMarginPopup: false, // 是否显示余量弹出面板
    
    // 历史记录
    historyRecords: [], // 最近10次计算记录
    showHistoryPanel: false, // 是否显示历史记录面板
    historySelectMode: false, // 历史记录多选模式
    selectedHistoryIds: [], // 已选择的历史记录ID列表
    
    // 可视化面板
    showVisualPopup: false, // 是否显示可视化功能选择面板

    // 方位仰角工具
    showAzElToolPopup: false,
    azElLatitude: '',
    azElLongitude: '',
    azElSatelliteIndex: 0,
    azElUseCustom: false,
    azElCustomPosition: '',
    azElResultReady: false,
    azElAzimuth: '--',
    azElElevation: '--',
    azElInputLatitude: '--',
    azElInputLongitude: '--',
    azElSatelliteName: '--',
    azElSatelliteOrbit: '--',
    azElConclusionLevel: 'warn',
    azElConclusionTitle: '--',
    azElSuggestion: '--',
    azElAzimuthGuide: '--',
    azElElevationGuide: '--',

    // 日凌计算工具
    showSunOutagePopup: false,
    sunOutageSatelliteIndex: 0,
    sunOutageUseCustom: false,
    sunOutageCustomPosition: '',
    sunOutageLatitude: '',
    sunOutageLongitude: '',
    sunOutageDiameter: '3.0',
    sunOutageYear: String(new Date().getFullYear()),
    sunOutageSeasonIndex: 0,
    sunOutageSeasons: ['春分时', '秋分时'],
    sunOutageBandIndex: 1,
    sunOutageBands: ['C', 'Ku', '扩展Ku', 'Ka', 'Q'],
    sunOutageCustomFreq: '',
    sunOutageShowCustomFreq: false,
    sunOutageCalculating: false,
    sunOutageResultReady: false,
    sunOutageResult: null,
    sunOutageShowDetail: false,
    sunOutageTimeMode: 'bjt', // 'bjt' 北京时间 | 'gmt' GMT时间
    
    // 选项数据
    frequencyBandOptions: FREQUENCY_BAND_OPTIONS,
    frequencyBandIndex: 7, // 默认Ku
    modulationOptions: MODULATION_OPTIONS,
    modulationIndex: 1, // 默认QPSK
    dvbStandardOptions: DVB_STANDARD_OPTIONS,
    dvbStandardIndex: 0, // 默认"自定义"
    currentModcodList: [],
    modcodPickerIndex: 0,
    upcOptions: [
      { label: '是', value: '是' },
      { label: '否', value: '否' },
      { label: '自定义', value: '自定义' }
    ],
    upcIndex: 1, // 默认"否"
    polarizationOptions: [
      { label: '垂直极化(V)', value: 'V' },
      { label: '水平极化(H)', value: 'H' },
      { label: '左旋圆极化(LHCP)', value: 'LHCP' },
      { label: '右旋圆极化(RHCP)', value: 'RHCP' }
    ],
    uplinkPolarizationIndex: 0, // 默认V
    downlinkPolarizationIndex: 1, // 默认H
    
    // 城市选择器相关
    showUplinkCityDropdown: false,
    showDownlinkCityDropdown: false,
    filteredCities: getDisplayOrderCities(),
    filteredCitiesRx: getDisplayOrderCities(),
    cityInputTimer: null,
    
    // 计算状态
    calculating: false,
    hasResults: false,
    
    // 速率计算模式: 'infoRate' 以信息速率为准, 'symbolRate' 以符号率为准
    rateCalcMode: 'infoRate',
    
    // 计算结果
    results: {},
    
    // 标记参数 - 默认无高亮，用户可手动标记
    markedParams: [],
    
    // 实时计算结果
    realtimeParams: {
      stationEIRP: '--',
      paRecommendation: '--',
      gOverTe: '--',
      carrierBandwidth: '--',
      symbolRate: '--'
    },
    
    // 输入框全选控制
    inputSelectAll: false,
    
    // 键盘高度（用于底部占位）
    keyboardHeight: 0,
    
    // 当前编辑状态
    isEditingConfig: false,
    editingConfigName: '',

    // 平台标识
    isNotIOS: false
  },

  onLoad() {
    // 获取胶囊按钮位置信息，用于对齐悬浮按钮
    try {
      const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
      const windowInfo = wx.getWindowInfo();
      const deviceInfo = wx.getDeviceInfo();
      
      this.setData({
        navBarTop: menuButtonInfo.top,
        navBarHeight: menuButtonInfo.height,
        navBarRight: windowInfo.windowWidth - menuButtonInfo.right,
        isNotIOS: deviceInfo.platform !== 'ios'
      });
    } catch (e) {
      console.error('获取胶囊按钮位置失败:', e);
      // 默认值
      this.setData({
        navBarTop: 24, // 常见状态栏高度
        navBarHeight: 32, // 常见胶囊高度
        navBarRight: 10
      });
    }

    // 检查是否有分享码需要跳转到配置页面
    this.checkAndRedirectToConfigs();

    // 为卫星列表添加含轨道位置的显示名称
    const satellites = this.data.satellites.map(sat => ({
      ...sat,
      displayName: sat.position ? sat.name + ' (' + sat.position + '°E)' : sat.name
    }));
    this.setData({ satellites });

    // 初始化参数
    this.initParams();

    // 初始化雨衰检查坐标记录（用于判断经纬度是否同时变化）
    this._lastRainCheckCoords = {
      uplink: { lon: this.data.linkParams.longitude || '', lat: this.data.linkParams.latitude || '' },
      downlink: { lon: this.data.linkParams.rxLongitude || '', lat: this.data.linkParams.rxLatitude || '' }
    };
    
    // 恢复噪声比模式
    try {
      const savedNoiseRatioMode = wx.getStorageSync('noiseRatioMode');
      if (savedNoiseRatioMode) {
        this.setData({
          noiseRatioMode: savedNoiseRatioMode
        });
      }
    } catch (e) {
      console.error('恢复噪声比模式失败:', e);
    }
    
    // 恢复余量值和模式
    try {
      const savedMarginValue = wx.getStorageSync('marginValue');
      const savedMarginMode = wx.getStorageSync('marginMode');
      
      if (savedMarginValue) {
        this.setData({
          marginValue: savedMarginValue
        });
      }
      
      if (savedMarginMode) {
        this.setData({
          marginMode: savedMarginMode
        });
      }
    } catch (e) {
      console.error('恢复余量设置失败:', e);
    }
    
    // 恢复历史记录
    this.loadHistoryRecords();

    // ===== 键盘管理：初始化 =====
    this._keyboardHeight = 0;
    this._currentScrollTop = 0;
    this._lastTouchY = 0;
    this._focusingInput = false;
    this._useSystemFocusAdjust = false;
    this._scrollCounter = 0; // 用于确保scroll-top每次值不同以触发滚动
    try {
      const windowInfo = wx.getWindowInfo();
      this._windowHeight = windowInfo.windowHeight;
    } catch (e) {
      this._windowHeight = 667;
    }
    // 监听键盘高度变化
    this._kbCallback = (res) => {
      const prevHeight = this._keyboardHeight;
      this._keyboardHeight = res.height;
      if (res.height > 0 && this._focusingInput && !this._useSystemFocusAdjust) {
        // 键盘刚弹出，执行平滑滚动
        this._adjustScrollForKeyboard();
      }
      if (res.height === 0 && prevHeight > 0) {
        // 键盘收起
        this.setData({ keyboardHeight: 0 });
      } else if (res.height > 0) {
        this.setData({ keyboardHeight: res.height });
      }
    };
    wx.onKeyboardHeightChange(this._kbCallback);
  },

  onUnload() {
    // 清理键盘监听
    if (this._kbCallback) {
      wx.offKeyboardHeightChange(this._kbCallback);
    }
  },

  // scroll-view滚动事件：记录滚动位置（替代onPageScroll）
  onContentScroll(e) {
    this._currentScrollTop = e.detail.scrollTop;
    // 安卓：用户手动滚动时收起键盘，防止原生input覆盖层脱离scroll-view位置
    if (this.data.isNotIOS && this._keyboardHeight > 0) {
      // 排除编程式滚动（聚焦输入框时的自动定位滚动）
      if (!this._programmaticScrollUntil || Date.now() > this._programmaticScrollUntil) {
        wx.hideKeyboard();
      }
    }
  },

  // 检查是否有分享码需要跳转到配置页面
  checkAndRedirectToConfigs() {
    const launchShareCode = app.globalData.launchShareCode;
    const launchScene = app.globalData.launchScene;
    
    if (launchShareCode || launchScene) {
      console.log('检测到分享码参数，准备跳转到配置页面');
      
      // 清除标记，避免重复跳转
      app.globalData.launchShareCode = null;
      app.globalData.launchScene = null;
      
      // 构建跳转URL
      let url = '/pages/configs/configs';
      if (launchShareCode) {
        url += `?shareCode=${launchShareCode}`;
      } else if (launchScene) {
        url += `?scene=${encodeURIComponent(launchScene)}`;
      }
      
      // 延迟跳转，确保页面已完成初始化
      setTimeout(() => {
        wx.navigateTo({
          url: url,
          fail: (err) => {
            console.error('跳转到配置页面失败:', err);
          }
        });
      }, 100);
    }
  },
  
  onShow() {
    // 每次显示页面时，检查是否有更新的配置需要加载
    try {
      // 检查是否正在编辑配置
      if (app.globalData.currentEditingConfigId) {
        this.setData({
          isEditingConfig: true,
          editingConfigName: app.globalData.currentEditingConfigName || '未命名配置'
        });
      } else {
        this.setData({
          isEditingConfig: false,
          editingConfigName: ''
        });
      }
      
      // 从全局数据恢复噪声比模式
      if (app.globalData.noiseRatioMode) {
        this.setData({
          noiseRatioMode: app.globalData.noiseRatioMode
        });
      }
      
      // 从全局数据恢复参数
      if (app.globalData.satelliteParams) {
        this.setData({
          satelliteParams: app.globalData.satelliteParams
        });
        
        // 同步更新卫星选择器索引
        const satelliteName = app.globalData.satelliteParams.satelliteName;
        if (satelliteName) {
          const satIndex = this.data.satellites.findIndex(sat => sat.name === satelliteName);
          if (satIndex !== -1) {
            this.setData({ satelliteIndex: satIndex });
          }
        }
        
        // 同步更新频段选择器索引
        const frequencyBand = app.globalData.satelliteParams.frequencyBand;
        if (frequencyBand) {
          const bandIndex = FREQUENCY_BAND_OPTIONS.findIndex(opt => opt.value === frequencyBand);
          if (bandIndex !== -1) {
            this.setData({ frequencyBandIndex: bandIndex });
          }
        }
      }
      
      if (app.globalData.linkParams && app.globalData.linkParams[this.data.currentLinkNum]) {
        const linkParams = app.globalData.linkParams[this.data.currentLinkNum];
        this.setData({
          linkParams: linkParams
        });
        
        // 同步更新DVB标准选择器索引和ModCod列表
        {
          const dvbStandard = linkParams.dvbStandard || 'custom';
          const dvbIdx = DVB_STANDARD_OPTIONS.findIndex(opt => opt.value === dvbStandard);
          let modcodList = [];
          if (dvbStandard === 'DVB-S') {
            modcodList = DVBS_MODCOD_TABLE;
          } else if (dvbStandard === 'DVB-S2') {
            modcodList = DVBS2_MODCOD_TABLE;
          } else if (dvbStandard === 'DVB-S2X') {
            modcodList = DVBS2X_MODCOD_TABLE;
          }
          const modcodIdx = (linkParams.modcodIndex >= 0 && linkParams.modcodIndex < modcodList.length)
            ? linkParams.modcodIndex : 0;
          this.setData({
            dvbStandardIndex: dvbIdx >= 0 ? dvbIdx : 0,
            currentModcodList: modcodList,
            modcodPickerIndex: modcodIdx
          });
        }

        // 同步更新调制方式选择器索引
        if (linkParams.modulation) {
          const modIndex = MODULATION_OPTIONS.findIndex(opt => opt.value === linkParams.modulation);
          if (modIndex !== -1) {
            this.setData({ modulationIndex: modIndex });
          }
        }
        
        // 同步更新上行功控选择器索引
        if (linkParams.uplinkPowerControl) {
          const upcIdx = this.data.upcOptions.findIndex(opt => opt.value === linkParams.uplinkPowerControl);
          if (upcIdx !== -1) {
            this.setData({ upcIndex: upcIdx });
          }
        }
        
        // 同步更新上行极化选择器索引
        if (linkParams.uplinkPolarization) {
          const upPolIdx = this.data.polarizationOptions.findIndex(opt => opt.value === linkParams.uplinkPolarization);
          if (upPolIdx !== -1) {
            this.setData({ uplinkPolarizationIndex: upPolIdx });
          }
        }
        
        // 同步更新下行极化选择器索引
        if (linkParams.downlinkPolarization) {
          const downPolIdx = this.data.polarizationOptions.findIndex(opt => opt.value === linkParams.downlinkPolarization);
          if (downPolIdx !== -1) {
            this.setData({ downlinkPolarizationIndex: downPolIdx });
          }
        }
        
        // 同步更新余量值
        if (linkParams.margin !== undefined && linkParams.margin !== null && linkParams.margin !== '') {
          this.setData({
            marginValue: String(parseFloat(linkParams.margin).toFixed(2))
          });
        }
        
        // 同步更新计算模式和功放功率（旧配置无此字段时重置为默认值）
        this.setData({
          calcMode: linkParams.calcMode || 'reverse',
          inputPaPower: (linkParams.inputPaPower !== undefined && linkParams.inputPaPower !== '') ? linkParams.inputPaPower : ''
        });
        
        // 同步恢复速率计算模式和符号率（旧配置无此字段时重置为默认值）
        this.setData({
          rateCalcMode: linkParams.rateCalcMode || 'infoRate',
          'realtimeParams.symbolRate': (linkParams.symbolRate !== undefined && linkParams.symbolRate !== '' && linkParams.symbolRate !== '--') ? linkParams.symbolRate : '--',
          'realtimeParams.carrierBandwidth': (linkParams.carrierBandwidth !== undefined && linkParams.carrierBandwidth !== '' && linkParams.carrierBandwidth !== '--') ? linkParams.carrierBandwidth : '--'
        });
      }
      
      // 从全局数据恢复计算结果
      if (app.globalData.calculationResults && app.globalData.calculationResults[this.data.currentLinkNum]) {
        const results = app.globalData.calculationResults[this.data.currentLinkNum];
        this.setData({
          hasResults: true,
          results: results
        });
      }
      
      // 从全局数据恢复标记的参数
      if (app.globalData.markedParams && app.globalData.markedParams.length > 0) {
        this.setData({
          markedParams: app.globalData.markedParams
        });
      }
      
      // 从全局数据恢复高亮行
      if (app.globalData.highlightedRows) {
        this.setData({
          highlightedRows: app.globalData.highlightedRows
        });
      }
      
      // 更新实时参数
      this.updateRealtimeParams();

      // 回填来自覆盖页的地图选点
      this.consumeAzElPickedLocation();
      this.consumeSunOutagePickedLocation();
    } catch (e) {
      console.error('恢复配置失败:', e);
    }
  },

  consumeAzElPickedLocation() {
    try {
      const picked = wx.getStorageSync('azElPickedLocation');
      if (!picked || !picked.timestamp) return;

      // 超过10分钟的旧数据忽略
      if (Date.now() - picked.timestamp > 10 * 60 * 1000) {
        wx.removeStorageSync('azElPickedLocation');
        return;
      }

      this.setData({
        azElLatitude: String(picked.latitude),
        azElLongitude: String(picked.longitude),
        azElSatelliteIndex: typeof picked.satelliteIndex === 'number' ? picked.satelliteIndex : this.data.azElSatelliteIndex,
        showAzElToolPopup: true
      });
      wx.removeStorageSync('azElPickedLocation');
      wx.showToast({
        title: '已回填地图坐标',
        icon: 'none'
      });
    } catch (e) {
      console.error('读取地图选点失败:', e);
    }
  },

  consumeSunOutagePickedLocation() {
    try {
      const picked = wx.getStorageSync('sunOutagePickedLocation');
      if (!picked || !picked.timestamp) return;

      if (Date.now() - picked.timestamp > 10 * 60 * 1000) {
        wx.removeStorageSync('sunOutagePickedLocation');
        return;
      }

      this.setData({
        sunOutageLatitude: String(picked.latitude),
        sunOutageLongitude: String(picked.longitude),
        sunOutageSatelliteIndex: typeof picked.satelliteIndex === 'number' ? picked.satelliteIndex : this.data.sunOutageSatelliteIndex,
        showSunOutagePopup: true,
        sunOutageResultReady: false
      });
      wx.removeStorageSync('sunOutagePickedLocation');
      wx.showToast({
        title: '已回填地图坐标',
        icon: 'none'
      });
    } catch (e) {
      console.error('读取日凌地图选点失败:', e);
    }
  },

  // 初始化参数
  initParams() {
    const satelliteParams = app.getDefaultSatelliteParams();
    const linkParams = app.getDefaultLinkParams();
    
    this.setData({
      satelliteParams: satelliteParams,
      linkParams: linkParams
    });
    
    // 初始计算实时参数
    this.updateRealtimeParams();
  },

  // 切换链路
  switchLink(e) {
    const linkNum = e.currentTarget.dataset.link;
    
    // 保存当前链路参数
    this.saveLinkParams();
    
    // 切换到新链路
    this.setData({
      currentLinkNum: linkNum,
      linkParams: app.globalData.linkParams[linkNum],
      hasResults: false
    });

    // 更新雨衰检查坐标记录
    const lp = this.data.linkParams;
    this._lastRainCheckCoords = {
      uplink: { lon: lp.longitude || '', lat: lp.latitude || '' },
      downlink: { lon: lp.rxLongitude || '', lat: lp.rxLatitude || '' }
    };
  },

  // 保存当前链路参数
  saveLinkParams() {
    // 将余量、计算模式、功放功率、速率模式、符号率合并到 linkParams 中保存
    const linkParamsToSave = {
      ...this.data.linkParams,
      margin: this.data.marginValue,
      calcMode: this.data.calcMode,
      inputPaPower: this.data.inputPaPower,
      rateCalcMode: this.data.rateCalcMode,
      symbolRate: this.data.realtimeParams.symbolRate,
      carrierBandwidth: this.data.realtimeParams.carrierBandwidth
    };
    app.globalData.linkParams[this.data.currentLinkNum] = linkParamsToSave;
    // 同时保存噪声比模式
    app.globalData.noiseRatioMode = this.data.noiseRatioMode;
  },

  // 折叠/展开卫星参数 - 三态循环
  toggleSatelliteParams() {
    const states = ['full', 'partial', 'collapsed'];
    const currentIndex = states.indexOf(this.data.satelliteParamsExpandState);
    const nextIndex = (currentIndex + 1) % states.length;
    
    this.setData({
      satelliteParamsExpandState: states[nextIndex]
    });
  },

  // 折叠/展开上行站参数 - 三态循环
  toggleUplinkParams() {
    const states = ['full', 'partial', 'collapsed'];
    const currentIndex = states.indexOf(this.data.uplinkParamsExpandState);
    const nextIndex = (currentIndex + 1) % states.length;
    
    this.setData({
      uplinkParamsExpandState: states[nextIndex]
    });
  },

  // 折叠/展开接收站参数 - 三态循环
  toggleDownlinkParams() {
    const states = ['full', 'partial', 'collapsed'];
    const currentIndex = states.indexOf(this.data.downlinkParamsExpandState);
    const nextIndex = (currentIndex + 1) % states.length;
    
    this.setData({
      downlinkParamsExpandState: states[nextIndex]
    });
  },

  // 折叠/展开载波参数 - 三态循环
  toggleCarrierParams() {
    const states = ['full', 'partial', 'collapsed'];
    const currentIndex = states.indexOf(this.data.carrierParamsExpandState);
    const nextIndex = (currentIndex + 1) % states.length;
    
    this.setData({
      carrierParamsExpandState: states[nextIndex]
    });
  },

  // 折叠/展开计算结果 - 三态循环
  toggleResults() {
    const states = ['full', 'partial', 'collapsed'];
    const currentIndex = states.indexOf(this.data.resultsExpandState);
    const nextIndex = (currentIndex + 1) % states.length;
    
    this.setData({
      resultsExpandState: states[nextIndex]
    });
  },

  // 卫星参数输入变化
  onSatelliteParamChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    
    this.setData({
      [`satelliteParams.${field}`]: value
    });
    
    // 更新实时参数
    this.updateRealtimeParams();
    
    // 保存到全局
    app.globalData.satelliteParams = this.data.satelliteParams;
  },

  // 卫星参数选择器变化
  onSatellitePickerChange(e) {
    const field = e.currentTarget.dataset.field;
    const index = e.detail.value;
    
    let value;
    if (field === 'frequencyBand') {
      value = FREQUENCY_BAND_OPTIONS[index].value;
      const bandOption = FREQUENCY_BAND_OPTIONS[index];
      
      // 更新频段和对应的上下行频率
      this.setData({
        frequencyBandIndex: index,
        [`satelliteParams.${field}`]: value,
        'linkParams.centerFrequency': bandOption.uplinkFreq,
        'linkParams.rxCenterFrequency': bandOption.downlinkFreq
      });
      
      // 显示提示信息
      wx.showToast({
        title: `已更新为${bandOption.label}默认频率`,
        icon: 'success',
        duration: 2000
      });
    } else if (field === 'satellite') {
      const satellite = this.data.satellites[index];
      const updateData = {
        satelliteIndex: index,
        'satelliteParams.satelliteName': satellite.name,
        'satelliteParams.orbitPosition': satellite.position
      };
      // 中星26 特殊默认参数
      if (satellite.name === 'CHINASAT 26') {
        updateData['satelliteParams.transponderBandwidth'] = 880;
        updateData['satelliteParams.sfdRef'] = -68;
      }
      this.setData(updateData);
    }
    
    // 更新实时参数
    this.updateRealtimeParams();
    
    // 保存到全局
    app.globalData.satelliteParams = this.data.satelliteParams;
  },

  // 内容区域触摸事件：记录触摸位置用于键盘弹出时的滚动计算
  onContentTouchStart(e) {
    if (e.touches && e.touches.length > 0) {
      this._lastTouchY = e.touches[0].clientY;
    }
  },

  // 输入框聚焦时全选内容 + 键盘滚动管理
  onInputFocus(e) {
    this.setData({ inputSelectAll: true });
    const focusArea = e && e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.focusArea
      : '';
    this._useSystemFocusAdjust = focusArea === 'carrier' || focusArea === 'station';

    if (this._useSystemFocusAdjust) {
      this._focusingInput = false;
      return;
    }

    this._focusingInput = true;

    // 如果键盘已经弹出（切换输入框），直接调整滚动
    if (this._keyboardHeight > 0) {
      // 延迟一帧让触摸位置更新
      setTimeout(() => {
        this._adjustScrollForKeyboard();
        this._focusingInput = false;
      }, 50);
    }
    // 否则等待 onKeyboardHeightChange 回调触发滚动
  },

  // 余量面板输入框聚焦 - 只全选，不滚动页面
  onMarginInputFocus(e) {
    this.setData({ inputSelectAll: true });
  },

  // 阻止触摸移动事件，防止滚动穿透
  preventTouchMove() {
    return false;
  },

  // 平滑滚动：仅当输入框被键盘遮挡时才滚动
  _adjustScrollForKeyboard() {
    const keyboardHeight = this._keyboardHeight;
    if (!keyboardHeight) return;

    const touchY = this._lastTouchY;
    if (touchY <= 0) return;

    const windowHeight = this._windowHeight;
    const keyboardTop = windowHeight - keyboardHeight;

    // 只有输入框被键盘完全遮挡时才滚动
    if (touchY > keyboardTop) {
      const visibleHeight = keyboardTop;
      const targetY = visibleHeight * 0.4;
      const scrollDelta = touchY - targetY;
      this._scrollTo(Math.max(0, this._currentScrollTop + scrollDelta));
    }
  },

  // 通过scroll-view的scroll-top属性实现编程式滚动
  // 每次设置不同的值以确保scroll-view响应（相同值不会触发滚动）
  _scrollTo(scrollTop) {
    // 标记编程式滚动时间窗口，防止onContentScroll误收键盘
    this._programmaticScrollUntil = Date.now() + 400;
    this._scrollCounter++;
    this.setData({
      contentScrollTop: scrollTop + this._scrollCounter * 0.001
    });
  },

  // 输入框失焦时重置全选状态
  onInputBlur(e) {
    this.setData({ inputSelectAll: false });
  },

  // 链路参数输入变化
  onLinkParamChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    
    // 如果修改的是信息速率，切换为信息速率优先模式
    if (field === 'infoRate') {
      this.setData({
        [`linkParams.${field}`]: value,
        rateCalcMode: 'infoRate'
      });
    } else {
      this.setData({
        [`linkParams.${field}`]: value
      });
    }
    
    // 更新实时参数
    this.updateRealtimeParams();
  },

  // 载波带宽输入变化 - 实时更新显示值
  onCarrierBandwidthInput(e) {
    const value = e.detail.value;
    this.setData({
      'realtimeParams.carrierBandwidth': value
    });
  },

  // 载波带宽输入完成 - 反推符号率和信息速率
  onCarrierBandwidthBlur(e) {
    const carrierBandwidth = parseFloat(e.detail.value);
    
    if (isNaN(carrierBandwidth) || carrierBandwidth <= 0) {
      // 无效值，恢复计算
      this.updateRealtimeParams();
      return;
    }
    
    // 获取当前参数
    const bandwidthFactor = parseFloat(this.data.linkParams.bandwidthFactor) || 1.2;
    const modulation = this.data.linkParams.modulation || 'QPSK';
    const fec = parseFractionOrDecimal(this.data.linkParams.fec, 0.75);
    const rsCode = parseFractionOrDecimal(this.data.linkParams.rsCode, 188/204);
    const m = parseFloat(this.data.linkParams.m) || 1; // 扩频增益
    
    // 获取调制因子
    const modulationFactor = MODULATION_FACTORS[modulation] || 2;
    
    // 根据滚降系数计算符号率: symbolRate = carrierBandwidth / bandwidthFactor
    const symbolRate = Math.round(carrierBandwidth / bandwidthFactor * 1000) / 1000;
    
    // 反推信息速率: infoRate = symbolRate * modulationFactor / m * rsCode * fec
    const infoRate = symbolRate * modulationFactor / m * rsCode * fec;
    
    // 更新信息速率（保留3位小数，去除末尾多余的零）
    const infoRateFormatted = parseFloat(infoRate.toFixed(3)).toString();
    
    // 设置为载波带宽优先模式
    this.setData({
      'linkParams.infoRate': infoRateFormatted,
      'realtimeParams.symbolRate': parseFloat(symbolRate.toFixed(3)).toString(),
      rateCalcMode: 'carrierBandwidth'
    });
    
    // 更新实时参数
    this.updateRealtimeParams();
  },

  // 符号率输入变化 - 实时更新显示值
  onSymbolRateInput(e) {
    const value = e.detail.value;
    this.setData({
      'realtimeParams.symbolRate': value
    });
  },

  // 符号率输入完成 - 反推信息速率
  onSymbolRateBlur(e) {
    const symbolRate = parseFloat(e.detail.value);
    
    if (isNaN(symbolRate) || symbolRate <= 0) {
      // 无效值，恢复计算
      this.updateRealtimeParams();
      return;
    }
    
    // 获取当前参数
    const modulation = this.data.linkParams.modulation || 'QPSK';
    const fec = parseFractionOrDecimal(this.data.linkParams.fec, 0.75);
    const rsCode = parseFractionOrDecimal(this.data.linkParams.rsCode, 188/204);
    const m = parseFloat(this.data.linkParams.m) || 1; // 扩频增益
    
    // 获取调制因子
    const modulationFactor = MODULATION_FACTORS[modulation] || 2;
    
    // 反推信息速率: infoRate = symbolRate * modulationFactor * rsCode * fec / m
    // 推导: symbolRate = ChipRate / modulationFactor
    //       ChipRate = carrierRate * m
    //       carrierRate = infoRate / rsCode / fec
    // 所以: symbolRate = (infoRate / rsCode / fec) * m / modulationFactor
    //       infoRate = symbolRate * modulationFactor / m * rsCode * fec
    const infoRate = symbolRate * modulationFactor / m * rsCode * fec;
    
    // 更新信息速率（保留3位小数，去除末尾多余的零）
    const infoRateFormatted = parseFloat(infoRate.toFixed(3)).toString();
    
    // 设置为符号率优先模式，后续修改调制/FEC等时保持符号率不变
    this.setData({
      'linkParams.infoRate': infoRateFormatted,
      rateCalcMode: 'symbolRate'
    });
    
    // 更新实时参数
    this.updateRealtimeParams();
  },

  // 经纬度输入框失去焦点时检查降雨率
  // 只有经度和纬度同时变化才触发雨衰自动填充
  onCoordinateBlur(e) {
    const field = e.currentTarget.dataset.field;
    
    // 初始化记录（防止未经onLoad初始化的情况）
    if (!this._lastRainCheckCoords) {
      this._lastRainCheckCoords = {
        uplink: { lon: '', lat: '' },
        downlink: { lon: '', lat: '' }
      };
    }

    let type = '';
    if (field === 'longitude' || field === 'latitude') {
      type = 'uplink';
    } else if (field === 'rxLongitude' || field === 'rxLatitude') {
      type = 'downlink';
    }
    if (!type) return;

    const curLon = (type === 'uplink' ? this.data.linkParams.longitude : this.data.linkParams.rxLongitude) || '';
    const curLat = (type === 'uplink' ? this.data.linkParams.latitude : this.data.linkParams.rxLatitude) || '';
    const last = this._lastRainCheckCoords[type];

    const lonChanged = String(curLon) !== String(last.lon);
    const latChanged = String(curLat) !== String(last.lat);

    // 任一坐标变化即触发降雨率更新
    if (lonChanged || latChanged) {
      this._lastRainCheckCoords[type] = { lon: curLon, lat: curLat };
      this.checkRainRateEstimation(type);
    }
  },

  // 检查是否需要估算降雨率（在输入完成后调用）
  checkRainRateEstimation(type) {
    if (type === 'uplink') {
      const lon = parseFloat(this.data.linkParams.longitude);
      const lat = parseFloat(this.data.linkParams.latitude);
      
      // 只有经纬度都有效时才提示
      if (!isNaN(lon) && !isNaN(lat)) {
        this.promptRainRateEstimation(lon, lat, 'uplink');
      }
    } else if (type === 'downlink') {
      const lon = parseFloat(this.data.linkParams.rxLongitude);
      const lat = parseFloat(this.data.linkParams.rxLatitude);
      
      // 只有经纬度都有效时才提示
      if (!isNaN(lon) && !isNaN(lat)) {
        this.promptRainRateEstimation(lon, lat, 'downlink');
      }
    }
  },

  // 提示降雨率估算
  promptRainRateEstimation(lon, lat, type) {
    const cityInfo = getNearestCityInfo(lat, lon);
    const field = type === 'uplink' ? 'rainRate' : 'rxRainRate';
    
    this.setData({
      [`linkParams.${field}`]: cityInfo.rainRate
    });
  },

  // 链路参数选择器变化
  onLinkPickerChange(e) {
    const field = e.currentTarget.dataset.field;
    const index = e.detail.value;
    
    let value;
    if (field === 'modulation') {
      value = MODULATION_OPTIONS[index].value;
      this.setData({
        modulationIndex: index,
        [`linkParams.${field}`]: value
      });
    } else if (field === 'uplinkPowerControl') {
      value = this.data.upcOptions[index].value;
      this.setData({
        upcIndex: index,
        [`linkParams.${field}`]: value
      });
    } else if (field === 'uplinkPolarization') {
      value = this.data.polarizationOptions[index].value;
      this.setData({
        uplinkPolarizationIndex: index,
        [`linkParams.${field}`]: value
      });
    } else if (field === 'downlinkPolarization') {
      value = this.data.polarizationOptions[index].value;
      this.setData({
        downlinkPolarizationIndex: index,
        [`linkParams.${field}`]: value
      });
    }
    
    // 更新实时参数
    this.updateRealtimeParams();
  },

  // DVB标准选择变化 — 立即切换标准相关参数并选中第一个MODCOD
  onDvbStandardChange(e) {
    const index = parseInt(e.detail.value);
    const standard = DVB_STANDARD_OPTIONS[index].value;
    let modcodList = [];
    const updateData = {
      dvbStandardIndex: index,
      'linkParams.dvbStandard': standard,
      modcodPickerIndex: 0
    };

    if (standard === 'DVB-S') {
      modcodList = DVBS_MODCOD_TABLE;
    } else if (standard === 'DVB-S2') {
      modcodList = DVBS2_MODCOD_TABLE;
    } else if (standard === 'DVB-S2X') {
      modcodList = DVBS2X_MODCOD_TABLE;
    }

    updateData.currentModcodList = modcodList;

    // 非自定义模式：自动选中第一个MODCOD并填充全部参数
    if (standard !== 'custom' && modcodList.length > 0) {
      const firstModcod = modcodList[0];
      const modIdx = MODULATION_OPTIONS.findIndex(opt => opt.value === firstModcod.modulation);

      updateData['linkParams.modcodIndex'] = 0;
      updateData['linkParams.modulation'] = firstModcod.modulation;
      updateData['linkParams.fec'] = firstModcod.fec;
      updateData['linkParams.rsCode'] = firstModcod.rsCode;
      updateData['linkParams.bandwidthFactor'] = firstModcod.bandwidthFactor;
      updateData['linkParams.ebno'] = firstModcod.threshold.toFixed(2);
      updateData.modulationIndex = modIdx >= 0 ? modIdx : 1;
      updateData.noiseRatioMode = firstModcod.noiseRatioMode;

      app.globalData.noiseRatioMode = firstModcod.noiseRatioMode;
      try {
        wx.setStorageSync('noiseRatioMode', firstModcod.noiseRatioMode);
      } catch (err) {
        console.error('保存噪声比模式失败:', err);
      }
    } else {
      updateData['linkParams.modcodIndex'] = -1;
    }

    this.setData(updateData);
    this.updateRealtimeParams();
  },

  // MODCOD选择变化 — 自动填充各参数
  onModcodChange(e) {
    const index = parseInt(e.detail.value);
    const modcod = this.data.currentModcodList[index];
    if (!modcod) return;

    // 查找调制方式在MODULATION_OPTIONS中的索引
    const modIndex = MODULATION_OPTIONS.findIndex(opt => opt.value === modcod.modulation);

    this.setData({
      modcodPickerIndex: index,
      'linkParams.modcodIndex': index,
      'linkParams.modulation': modcod.modulation,
      'linkParams.fec': modcod.fec,
      'linkParams.rsCode': modcod.rsCode,
      'linkParams.bandwidthFactor': modcod.bandwidthFactor,
      'linkParams.ebno': modcod.threshold.toFixed(2),
      modulationIndex: modIndex >= 0 ? modIndex : 1,
      noiseRatioMode: modcod.noiseRatioMode
    });

    // 保存噪声比模式
    app.globalData.noiseRatioMode = modcod.noiseRatioMode;
    try {
      wx.setStorageSync('noiseRatioMode', modcod.noiseRatioMode);
    } catch (err) {
      console.error('保存噪声比模式失败:', err);
    }

    // 更新实时参数
    this.updateRealtimeParams();
  },

  // FEC码率输入处理（支持分数和小数，保持原始输入格式）
  onFecInput(e) {
    let value = e.detail.value.trim();
    
    // 保持原始输入值（分数或小数），不进行转换
    // 计算时再在后台进行转换
    this.setData({
      'linkParams.fec': value
    });
    
    // 更新实时参数
    this.updateRealtimeParams();
  },

  // RS编码码率输入处理（支持分数和小数，保持原始输入格式）
  onRsCodeInput(e) {
    let value = e.detail.value.trim();
    
    // 保持原始输入值（分数或小数），不进行转换
    // 计算时再在后台进行转换
    this.setData({
      'linkParams.rsCode': value
    });
    
    // 更新实时参数
    this.updateRealtimeParams();
  },

  // 切换Eb/N0和Es/N0
  toggleEbnoEsno() {
    const currentMode = this.data.noiseRatioMode;
    const newMode = currentMode === 'ebno' ? 'esno' : 'ebno';
    
    // 如果有值，进行转换
    const currentValue = parseFloat(this.data.linkParams.ebno);
    if (!isNaN(currentValue) && this.data.linkParams.modulation) {
      let convertedValue = currentValue;
      
      // 从常量中获取调制方式的比特数（调制因子）
      const modulation = this.data.linkParams.modulation;
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
      
      const modulationFactor = MODULATION_FACTORS[modulation] || 2;
      
      // 获取FEC码率、帧效率、扩频增益（支持分数格式）
      const fec = parseFractionOrDecimal(this.data.linkParams.fec, 0.75);
      const rsCode = parseFractionOrDecimal(this.data.linkParams.rsCode, 188/204);
      const m = parseFloat(this.data.linkParams.m) || 1.0;
      
      // 计算组合效率 k = (fec * rsCode * modulationFactor) / m
      // 这与 linkCalculator.js 中的计算保持一致
      const k = (fec * rsCode * modulationFactor) / m;
      
      // Eb/N0 和 Es/N0 的关系: Es/N0 = Eb/N0 + 10*log10(k)
      // 其中 k = (编码率 * RS码效率 * 调制因子) / 扩频增益
      // 这是每符号承载的有效信息比特数
      if (newMode === 'esno') {
        // 从 Eb/N0 转换到 Es/N0
        convertedValue = currentValue + 10 * Math.log10(k);
      } else {
        // 从 Es/N0 转换到 Eb/N0
        convertedValue = currentValue - 10 * Math.log10(k);
      }
      
      this.setData({
        noiseRatioMode: newMode,
        'linkParams.ebno': convertedValue.toFixed(2)
      });
    } else {
      this.setData({
        noiseRatioMode: newMode
      });
    }
    
    // 同步到全局数据
    app.globalData.noiseRatioMode = newMode;
    
    // 保存到本地存储
    try {
      wx.setStorageSync('noiseRatioMode', newMode);
    } catch (e) {
      console.error('保存噪声比模式失败:', e);
    }
    
    // 触觉反馈
    wx.vibrateShort({
      type: 'light'
    });
  },

  // ============ 城市选择相关方法 ============
  
  // 城市输入变化处理（带搜索功能）
  onCityInput(e) {
    const field = e.currentTarget.dataset.field;
    const type = e.currentTarget.dataset.type;
    const value = e.detail.value;
    
    // 更新输入值
    this.setData({
      [`linkParams.${field}`]: value
    });
    
    // 清除之前的定时器
    if (this.data.cityInputTimer) {
      clearTimeout(this.data.cityInputTimer);
    }
    
    // 设置新的定时器进行搜索（防抖）
    const timer = setTimeout(() => {
      this.filterCities(value, type);
    }, 300);
    
    this.setData({
      cityInputTimer: timer
    });
  },

  // 过滤城市列表
  filterCities(keyword, type) {
    const allCities = searchCities(keyword);
    
    if (type === 'uplink') {
      this.setData({
        filteredCities: allCities
      });
    } else if (type === 'downlink') {
      this.setData({
        filteredCitiesRx: allCities
      });
    }
  },

  // 确认城市输入（支持自定义输入）
  onCityConfirm(e) {
    const field = e.currentTarget.dataset.field;
    const type = e.currentTarget.dataset.type;
    const value = e.detail.value;
    
    // 尝试查找匹配的城市
    const city = getCityByName(value);
    
    if (city) {
      // 找到城市，更新经纬度和海拔
      this.updateCityInfo(city, type);
      // 自动更新降雨率
      this.promptRainRateEstimation(city.lon, city.lat, type);
    } else {
      // 自定义输入，只更新名称
      this.setData({
        [`linkParams.${field}`]: value
      });
      
      // 更新实时参数
      this.updateRealtimeParams();
      
      wx.showToast({
        title: '已输入自定义位置',
        icon: 'none',
        duration: 1500
      });
    }
    
    // 隐藏下拉列表
    if (type === 'uplink') {
      this.setData({
        showUplinkCityDropdown: false
      });
    } else if (type === 'downlink') {
      this.setData({
        showDownlinkCityDropdown: false
      });
    }
  },

  // 切换城市下拉列表显示
  toggleCityDropdown(e) {
    const type = e.currentTarget.dataset.type;
    
    if (type === 'uplink') {
      const show = !this.data.showUplinkCityDropdown;
      this.setData({
        showUplinkCityDropdown: show
      });
      
      if (show) {
        // 重置过滤列表
        this.setData({
          filteredCities: getDisplayOrderCities()
        });
      }
    } else if (type === 'downlink') {
      const show = !this.data.showDownlinkCityDropdown;
      this.setData({
        showDownlinkCityDropdown: show
      });
      
      if (show) {
        // 重置过滤列表
        this.setData({
          filteredCitiesRx: getDisplayOrderCities()
        });
      }
    }
  },

  // 选择城市
  onCitySelect(e) {
    const city = e.currentTarget.dataset.city;
    const type = e.currentTarget.dataset.type;
    
    if (!city) return;
    
    // 更新城市信息
    this.updateCityInfo(city, type);
    
    // 自动估算降雨率
    this.promptRainRateEstimation(city.lon, city.lat, type);
    
    // 隐藏下拉列表
    if (type === 'uplink') {
      this.setData({
        showUplinkCityDropdown: false
      });
    } else if (type === 'downlink') {
      this.setData({
        showDownlinkCityDropdown: false
      });
    }
    
    wx.showToast({
      title: `已选择 ${city.name}`,
      icon: 'success',
      duration: 1500
    });
  },

  // 更新城市信息（名称、经纬度、海拔）
  updateCityInfo(city, type) {
    if (type === 'uplink') {
      this.setData({
        'linkParams.earthStationLocation': city.name,
        'linkParams.longitude': city.lon,
        'linkParams.latitude': city.lat,
        'linkParams.altitude': city.alt
      });
    } else if (type === 'downlink') {
      this.setData({
        'linkParams.rxEarthStationLocation': city.name,
        'linkParams.rxLongitude': city.lon,
        'linkParams.rxLatitude': city.lat,
        'linkParams.rxAltitude': city.alt
      });
    }
    
    // 更新实时参数
    this.updateRealtimeParams();
  },

  // 阻止事件冒泡
  stopPropagation() {
    // 空函数，用于阻止点击下拉列表时触发失焦
  },

  // ============ 原有方法 ============

  // 开始计算
  onStartCalculate() {
    if (this.data.calcMode === 'forward') {
      this.forwardCalculate();
    } else {
      this.calculateLink();
    }
  },

  calculateLink() {
    // 震动反馈
    wx.vibrateShort({
      type: 'medium'
    });
    
    // 保存当前链路参数到全局
    this.saveLinkParams();
    
    // 保存卫星参数到全局
    app.globalData.satelliteParams = this.data.satelliteParams;
    
    // 保存噪声比模式到全局
    app.globalData.noiseRatioMode = this.data.noiseRatioMode;
    
    // 将工具栏的余量值合并到链路参数中
    const linkParamsWithMargin = {
      ...this.data.linkParams,
      margin: this.data.marginValue
    };
    
    // 缓存所有参数到本地存储
    try {
      wx.setStorageSync('satelliteParams', this.data.satelliteParams);
      wx.setStorageSync('linkParams_' + this.data.currentLinkNum, linkParamsWithMargin);
      wx.setStorageSync('currentLinkNum', this.data.currentLinkNum);
      wx.setStorageSync('noiseRatioMode', this.data.noiseRatioMode);
    } catch (e) {
      console.error('缓存参数失败:', e);
    }
    
    // 参数验证
    const validation = validateAllParams(
      this.data.satelliteParams,
      linkParamsWithMargin
    );
    
    if (!validation.valid) {
      wx.showModal({
        title: '参数错误',
        content: validation.errors.join('\n'),
        showCancel: false
      });
      return;
    }
    
    // 显示加载状态
    this.setData({ calculating: true });
    
    wx.showLoading({
      title: '计算中...',
      mask: true
    });
    
    try {
      console.log('准备进行本地计算');
      console.log('卫星参数:', this.data.satelliteParams);
      console.log('链路参数:', linkParamsWithMargin);
      console.log('噪声比模式:', this.data.noiseRatioMode);
      console.log('余量模式:', this.data.marginMode);
      console.log('余量值:', this.data.marginValue);
      
      // 本地计算 - 传递噪声比模式
      const linkParamsWithMode = {
        ...linkParamsWithMargin,
        noiseRatioMode: this.data.noiseRatioMode
      };
      
      const response = calculateLinkBudget(
        this.data.satelliteParams,
        linkParamsWithMode
      );
      
      console.log('计算完成，响应:', response);
      
      // 检查计算是否成功
      if (!response.success) {
        throw new Error(response.message || response.error || '计算失败');
      }
      
      const results = response.data;
      
      // 显示结果
      this.displayResults(results);
      
      // 检查仰角警告
      this.checkElevationWarnings(results);
      
      // 保存结果到全局
      app.globalData.calculationResults[this.data.currentLinkNum] = results;
      
      // 保存到历史记录
      this.saveToHistory(results);
      
      wx.showToast({
        title: '计算完成',
        icon: 'success'
      });
    } catch (error) {
      console.error('计算错误详情:', error);
      
      wx.showModal({
        title: '计算失败',
        content: error.message || '计算过程中出现错误',
        showCancel: false
      });
    } finally {
      this.setData({ calculating: false });
      wx.hideLoading();
    }
  },

  // 后台执行计算（不显示加载提示，用于保存配置和生成报告）
  performBackgroundCalculation() {
    try {
      // 将工具栏的余量值合并到链路参数中
      const linkParamsWithMargin = {
        ...this.data.linkParams,
        margin: this.data.marginValue
      };
      
      // 参数验证
      const validation = validateAllParams(
        this.data.satelliteParams,
        linkParamsWithMargin
      );
      
      if (!validation.valid) {
        console.error('后台计算参数验证失败:', validation.errors);
        return null;
      }
      
      // 本地计算 - 传递噪声比模式
      const linkParamsWithMode = {
        ...linkParamsWithMargin,
        noiseRatioMode: this.data.noiseRatioMode
      };
      
      const response = calculateLinkBudget(
        this.data.satelliteParams,
        linkParamsWithMode
      );
      
      // 检查计算是否成功
      if (!response.success) {
        console.error('后台计算失败:', response.message || response.error);
        return null;
      }
      
      const results = response.data;
      
      // 更新页面显示结果
      this.displayResults(results);
      
      return results;
    } catch (error) {
      console.error('后台计算异常:', error);
      return null;
    }
  },

  // 显示计算结果
  displayResults(results) {
    // 直接使用完整的结果对象
    this.setData({
      hasResults: true,
      results: results,
      resultsExpandState: 'full' // 自动展开计算结果
    });
    // 计算完成后不再自动滚动到结果区域
  },

  // 检查仰角警告
  checkElevationWarnings(results) {
    const warnings = [];
    
    // 检查发信站仰角
    if (results.elevationValidation) {
      const txValidation = results.elevationValidation;
      if (txValidation.level === 'error') {
        warnings.push(txValidation.message);
      } else if (txValidation.level === 'warning') {
        warnings.push(txValidation.message);
      }
    }
    
    // 检查收信站仰角
    if (results.rxElevationValidation) {
      const rxValidation = results.rxElevationValidation;
      if (rxValidation.level === 'error') {
        warnings.push(rxValidation.message);
      } else if (rxValidation.level === 'warning') {
        warnings.push(rxValidation.message);
      }
    }
    
    // 如果有警告，显示提示
    if (warnings.length > 0) {
      // 延迟显示，避免与"计算完成"的toast冲突
      setTimeout(() => {
        wx.showModal({
          title: '仰角提示',
          content: warnings.join('\n'),
          showCancel: false,
          confirmText: '知道了'
        });
      }, 1500);
    }
  },

  // 显示配置管理菜单
  showConfigMenu() {
    wx.showActionSheet({
      itemList: ['保存配置', '管理配置', '地球站参数互换', '生成报告'],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 保存配置
          this.saveConfig();
        } else if (res.tapIndex === 1) {
          // 管理配置
          this.loadConfig();
        } else if (res.tapIndex === 2) {
          // 地球站参数互换
          this.swapStationParams();
        } else if (res.tapIndex === 3) {
          // 生成报告
          this.generateReport();
        }
      }
    });
  },

  // 保存配置
  saveConfig() {
    this.saveLinkParams();
    
    // 保存卫星参数到全局
    app.globalData.satelliteParams = this.data.satelliteParams;
    
    // 在后台执行一次计算，确保保存最新的计算结果
    const results = this.performBackgroundCalculation();
    if (results) {
      app.globalData.calculationResults = app.globalData.calculationResults || {};
      app.globalData.calculationResults[this.data.currentLinkNum] = results;
    }
    
    // 保存标记的参数
    app.globalData.markedParams = this.data.markedParams || [];
    
    // 保存高亮行
    app.globalData.highlightedRows = this.data.highlightedRows || [];
    
    // 检查是否正在编辑现有配置
    const editingConfigId = app.globalData.currentEditingConfigId;
    // 使用页面上的配置名（用户可能已修改）
    const editingConfigName = this.data.editingConfigName || app.globalData.currentEditingConfigName;
    // 同步到全局
    if (editingConfigName) {
      app.globalData.currentEditingConfigName = editingConfigName;
    }
    
    if (editingConfigId) {
      // 如果正在编辑现有配置，询问用户是更新还是另存为
      wx.showActionSheet({
        itemList: [`更新"${editingConfigName}"`, '另存为新配置', '放弃更改'],
        success: (res) => {
          if (res.tapIndex === 0) {
            // 更新原配置
            this.updateExistingConfig();
          } else if (res.tapIndex === 1) {
            // 另存为新配置 - 只清除配置ID，保留配置名供用户使用
            app.globalData.currentEditingConfigId = null;
            app.globalData.currentEditingConfigIsLocal = false;
            // 不清除 currentEditingConfigName，让用户可以使用修改后的配置名
            this.setData({
              isEditingConfig: false
            });
            wx.navigateTo({
              url: '/pages/configs/configs?action=save'
            });
          }
          // tapIndex === 2 时不做任何操作
        }
      });
    } else {
      wx.navigateTo({
        url: '/pages/configs/configs?action=save'
      });
    }
  },

  // 更新现有配置
  async updateExistingConfig() {
    const configId = app.globalData.currentEditingConfigId;
    const isLocal = app.globalData.currentEditingConfigIsLocal;
    // 使用页面上的配置名（用户可能已修改）
    const configName = this.data.editingConfigName || app.globalData.currentEditingConfigName;
    
    console.log('updateExistingConfig - 页面配置名:', this.data.editingConfigName, 
                '全局配置名:', app.globalData.currentEditingConfigName,
                '最终使用:', configName,
                'isLocal:', isLocal);
    
    // 同步到全局
    app.globalData.currentEditingConfigName = configName;
    
    wx.showLoading({
      title: '保存中...',
      mask: true
    });
    
    try {
      if (isLocal) {
        // 更新本地配置
        const configs = wx.getStorageSync('savedConfigs') || [];
        const index = configs.findIndex(item => item._id === configId);
        
        if (index !== -1) {
          configs[index] = {
            ...configs[index],
            configName: configName,
            satelliteParams: app.globalData.satelliteParams,
            linkParams: app.globalData.linkParams,
            calculationResults: app.globalData.calculationResults || {},
            noiseRatioMode: app.globalData.noiseRatioMode || 'ebno',
            markedParams: app.globalData.markedParams || [],
            highlightedRows: app.globalData.highlightedRows || [],
            updateTime: new Date()
          };
          
          wx.setStorageSync('savedConfigs', configs);
          
          wx.showToast({
            title: '配置已更新',
            icon: 'success'
          });
          
          // 清除编辑状态
          this.clearEditingState();
          
          // 跳转到配置管理页面
          wx.navigateTo({
            url: '/pages/configs/configs'
          });
        } else {
          throw new Error('配置不存在');
        }
      } else {
        // 更新云端配置
        console.log('更新云端配置，配置名:', configName);
        const res = await wx.cloud.callFunction({
          name: 'configManager',
          data: {
            action: 'update',
            data: {
              configId: configId,
              configName: configName,
              satelliteParams: app.globalData.satelliteParams,
              linkParams: app.globalData.linkParams,
              calculationResults: app.globalData.calculationResults || {},
              noiseRatioMode: app.globalData.noiseRatioMode || 'ebno',
              markedParams: app.globalData.markedParams || [],
              highlightedRows: app.globalData.highlightedRows || []
            }
          }
        });
        
        console.log('云函数返回结果:', res.result);
        
        if (res.result && res.result.success) {
          console.log('配置更新成功，返回的配置名:', res.result.configName);
          wx.showToast({
            title: '配置已更新',
            icon: 'success'
          });
          
          // 清除编辑状态
          this.clearEditingState();
          
          // 跳转到配置管理页面
          wx.navigateTo({
            url: '/pages/configs/configs'
          });
        } else {
          throw new Error(res.result?.error || '更新失败');
        }
      }
    } catch (error) {
      console.error('更新配置失败:', error);
      wx.showModal({
        title: '更新失败',
        content: error.message || '无法更新配置',
        showCancel: false
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 清除编辑状态
  clearEditingState() {
    app.globalData.currentEditingConfigId = null;
    app.globalData.currentEditingConfigIsLocal = false;
    app.globalData.currentEditingConfigName = null;
    this.setData({
      isEditingConfig: false,
      editingConfigName: ''
    });
  },

  // 取消编辑配置
  cancelEditingConfig() {
    wx.showModal({
      title: '取消编辑',
      content: '确定要取消编辑吗？所做的更改将不会保存。',
      confirmText: '取消编辑',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          this.clearEditingState();
          wx.showToast({
            title: '已退出编辑',
            icon: 'none'
          });
        }
      }
    });
  },

  // 处理配置名称输入变化
  onEditingConfigNameChange(e) {
    const newName = e.detail.value;
    this.setData({
      editingConfigName: newName
    });
    // 实时同步到全局，确保保存时能获取到最新值
    app.globalData.currentEditingConfigName = newName;
  },

  // 配置名称输入框失焦时同步到全局
  onEditingConfigNameBlur(e) {
    const newName = e.detail.value.trim();
    if (newName) {
      app.globalData.currentEditingConfigName = newName;
      this.setData({
        editingConfigName: newName
      });
    } else {
      // 如果为空，恢复原名称
      const originalName = app.globalData.currentEditingConfigName || '未命名配置';
      this.setData({
        editingConfigName: originalName
      });
    }
  },

  // 加载配置
  loadConfig() {
    wx.navigateTo({
      url: '/pages/configs/configs?action=load'
    });
  },

  // 跳转到AR对星辅助页面
  goToARAlign() {
    this.setData({ showVisualPopup: false });
    wx.navigateTo({
      url: '/pages/ar-align/ar-align'
    });
  },

  // 跳转到详细计算结果页面
  goToResultsDetail() {
    if (!this.data.hasResults) return;
    wx.navigateTo({
      url: '/pages/results-detail/results-detail'
    });
  },

  // 跳转到卫星覆盖图页面
  goToCoverageMap() {
    this.setData({ showVisualPopup: false });
    const satelliteIndex = this.data.satelliteIndex;
    wx.navigateTo({
      url: `/pages/satellite-coverage/satellite-coverage?satelliteIndex=${satelliteIndex}`
    });
  },

  // 显示方位仰角工具面板
  showAzElToolPanel() {
    const defaultLat = this.data.linkParams.latitude || '';
    const defaultLon = this.data.linkParams.longitude || '';
    this.setData({
      showVisualPopup: false,
      showAzElToolPopup: true,
      azElSatelliteIndex: this.data.satelliteIndex,
      azElLatitude: this.data.azElLatitude || defaultLat,
      azElLongitude: this.data.azElLongitude || defaultLon
    });
  },

  hideAzElToolPanel() {
    this.setData({
      showAzElToolPopup: false
    });
  },

  onAzElLatitudeInput(e) {
    this.setData({
      azElLatitude: e.detail.value,
      azElResultReady: false
    });
  },

  onAzElLongitudeInput(e) {
    this.setData({
      azElLongitude: e.detail.value,
      azElResultReady: false
    });
  },

  onAzElSatelliteChange(e) {
    this.setData({
      azElSatelliteIndex: Number(e.detail.value || 0),
      azElResultReady: false
    });
  },

  toggleAzElCustomMode() {
    this.setData({
      azElUseCustom: !this.data.azElUseCustom,
      azElResultReady: false
    });
  },

  onAzElCustomPositionInput(e) {
    this.setData({
      azElCustomPosition: e.detail.value,
      azElResultReady: false
    });
  },

  goToMapPickForAzEl() {
    const satIndex = this.data.azElSatelliteIndex || 0;
    wx.navigateTo({
      url: `/pages/satellite-coverage/satellite-coverage?satelliteIndex=${satIndex}&pickMode=1&pickSource=azElTool`
    });
  },

  useMyLocationForAzEl() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.setData({
          azElLatitude: String(Number(res.latitude).toFixed(6)),
          azElLongitude: String(Number(res.longitude).toFixed(6)),
          azElResultReady: false
        });
        wx.showToast({
          title: '已填入我的位置',
          icon: 'none'
        });
      },
      fail: () => {
        wx.showToast({
          title: '获取位置失败',
          icon: 'none'
        });
      }
    });
  },

  computeAzEl(lat, lon, satLon) {
    const PI = Math.PI;
    const latRad = lat * PI / 180;
    const deltaLonRad = (satLon - lon) * PI / 180;
    const cosTerm = Math.cos(latRad) * Math.cos(deltaLonRad);

    const denom = Math.sqrt(Math.max(1 - Math.pow(cosTerm, 2), 1e-12));
    const elevation = Math.atan((cosTerm - 0.15127) / denom) * 180 / PI;

    let azimuth;
    if (Math.abs(Math.sin(latRad)) < 1e-8) {
      azimuth = (satLon > lon) ? 90 : 270;
    } else {
      const temp = Math.abs(Math.atan(
        Math.tan((lon - satLon) * PI / 180) / Math.sin(latRad)
      ) * 180 / PI);
      if (lat > 0) {
        azimuth = (satLon > lon) ? 180 - temp : 180 + temp;
      } else {
        azimuth = (satLon > lon) ? temp : 360 - temp;
      }
    }

    return {
      azimuth: Number(azimuth.toFixed(2)),
      elevation: Number(elevation.toFixed(2))
    };
  },

  calculateAzElConclusion() {
    const lat = parseFloat(this.data.azElLatitude);
    const lon = parseFloat(this.data.azElLongitude);

    if (isNaN(lat) || isNaN(lon)) {
      wx.showToast({
        title: '请先输入有效经纬度',
        icon: 'none'
      });
      return;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      wx.showToast({
        title: '经纬度超出范围',
        icon: 'none'
      });
      return;
    }

    const isCustom = this.data.azElUseCustom;
    const sat = isCustom ? null : this.data.satellites[this.data.azElSatelliteIndex];
    const satLon = isCustom ? parseFloat(this.data.azElCustomPosition) : parseFloat(sat.position);
    if (isNaN(satLon) || satLon < -180 || satLon > 180) {
      wx.showToast({
        title: isCustom ? '请输入有效轨道位置' : '该卫星轨位无效',
        icon: 'none'
      });
      return;
    }

    const result = this.computeAzEl(lat, lon, satLon);
    const satName = isCustom ? '自定义 (' + satLon + '°E)' : (sat.name || '--');
    const satOrbit = `${satLon.toFixed(1)}°E`;
    const latText = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}`;
    const lonText = `${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;
    const azimuthGuide = `方位角定义为“从正北(0°)开始，顺时针转到天线指向方向”的夹角；操作时先校准指南针，再顺时针转到 ${result.azimuth}°。`;
    const elevationGuide = `使用天线仰角刻度或手机测斜仪，从水平 0° 抬升到 ${result.elevation}°，锁紧后小步微调。`;

    let level = 'ok';
    let title = '可见，当前站点可以对星';
    let suggestion = '可按下方步骤完成初对星，再结合信号强度做微调。';

    if (result.elevation <= 0) {
      level = 'danger';
      title = '不可见，当前站点无法对该星';
      suggestion = '该星在地平线以下，建议切换卫星轨位或更换站点后重算。';
    } else if (result.elevation < 5) {
      level = 'warn';
      title = '低仰角，可见但链路风险较高';
      suggestion = '仰角较低，先确认地平线方向无遮挡，再按下方步骤对星并复核雨衰。';
    }

    this.setData({
      azElResultReady: true,
      azElInputLatitude: latText,
      azElInputLongitude: lonText,
      azElSatelliteName: satName,
      azElSatelliteOrbit: satOrbit,
      azElAzimuth: result.azimuth,
      azElElevation: result.elevation,
      azElConclusionLevel: level,
      azElConclusionTitle: title,
      azElSuggestion: suggestion,
      azElAzimuthGuide: azimuthGuide,
      azElElevationGuide: elevationGuide
    });
  },

  // ====== 日凌计算工具 ======
  showSunOutagePanel() {
    const defaultLat = this.data.linkParams.latitude || '';
    const defaultLon = this.data.linkParams.longitude || '';
    this.setData({
      showVisualPopup: false,
      showSunOutagePopup: true,
      sunOutageSatelliteIndex: this.data.satelliteIndex,
      sunOutageLatitude: this.data.sunOutageLatitude || defaultLat,
      sunOutageLongitude: this.data.sunOutageLongitude || defaultLon,
      sunOutageResultReady: false,
      sunOutageShowDetail: false
    });
  },

  hideSunOutagePanel() {
    this.setData({ showSunOutagePopup: false });
  },

  onSunOutageSatelliteChange(e) {
    this.setData({ sunOutageSatelliteIndex: Number(e.detail.value || 0), sunOutageResultReady: false });
  },

  toggleSunOutageCustomMode() {
    this.setData({ sunOutageUseCustom: !this.data.sunOutageUseCustom, sunOutageResultReady: false });
  },

  onSunOutageCustomPositionInput(e) {
    this.setData({ sunOutageCustomPosition: e.detail.value, sunOutageResultReady: false });
  },

  onSunOutageLatInput(e) {
    this.setData({ sunOutageLatitude: e.detail.value, sunOutageResultReady: false });
  },

  onSunOutageLonInput(e) {
    this.setData({ sunOutageLongitude: e.detail.value, sunOutageResultReady: false });
  },

  onSunOutageDiameterInput(e) {
    this.setData({ sunOutageDiameter: e.detail.value, sunOutageResultReady: false });
  },

  onSunOutageYearInput(e) {
    this.setData({ sunOutageYear: e.detail.value, sunOutageResultReady: false });
  },

  onSunOutageSeasonChange(e) {
    this.setData({ sunOutageSeasonIndex: Number(e.detail.value || 0), sunOutageResultReady: false });
  },

  onSunOutageBandChange(e) {
    this.setData({ sunOutageBandIndex: Number(e.detail.value || 0), sunOutageResultReady: false });
  },

  onSunOutageCustomFreqInput(e) {
    this.setData({ sunOutageCustomFreq: e.detail.value, sunOutageResultReady: false });
  },

  toggleSunOutageCustomFreq() {
    this.setData({ sunOutageShowCustomFreq: !this.data.sunOutageShowCustomFreq });
  },

  toggleSunOutageDetail() {
    this.setData({ sunOutageShowDetail: !this.data.sunOutageShowDetail });
  },

  toggleSunOutageTimeMode() {
    this.setData({
      sunOutageTimeMode: this.data.sunOutageTimeMode === 'bjt' ? 'gmt' : 'bjt'
    });
  },

  goToMapPickForSunOutage() {
    const satIndex = this.data.sunOutageSatelliteIndex || 0;
    wx.navigateTo({
      url: `/pages/satellite-coverage/satellite-coverage?satelliteIndex=${satIndex}&pickMode=1&pickSource=sunOutageTool`
    });
  },

  useMyLocationForSunOutage() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.setData({
          sunOutageLatitude: String(Number(res.latitude).toFixed(6)),
          sunOutageLongitude: String(Number(res.longitude).toFixed(6)),
          sunOutageResultReady: false
        });
        wx.showToast({ title: '已填入我的位置', icon: 'none' });
      },
      fail: () => {
        wx.showToast({ title: '获取位置失败', icon: 'none' });
      }
    });
  },

  calculateSunOutage() {
    const lat = parseFloat(this.data.sunOutageLatitude);
    const lon = parseFloat(this.data.sunOutageLongitude);
    const diameter = parseFloat(this.data.sunOutageDiameter);
    const year = parseInt(this.data.sunOutageYear);

    if (isNaN(lat) || isNaN(lon)) {
      wx.showToast({ title: '请输入有效经纬度', icon: 'none' });
      return;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      wx.showToast({ title: '经纬度超出范围', icon: 'none' });
      return;
    }
    if (isNaN(diameter) || diameter <= 0) {
      wx.showToast({ title: '请输入有效天线口径', icon: 'none' });
      return;
    }
    if (isNaN(year) || year < 2000 || year > 2100) {
      wx.showToast({ title: '年份范围 2000-2100', icon: 'none' });
      return;
    }

    const isCustomSo = this.data.sunOutageUseCustom;
    const sat = isCustomSo ? null : this.data.satellites[this.data.sunOutageSatelliteIndex];
    const satLon = isCustomSo ? parseFloat(this.data.sunOutageCustomPosition) : parseFloat(sat.position);
    if (isNaN(satLon) || satLon < -180 || satLon > 180) {
      wx.showToast({ title: isCustomSo ? '请输入有效轨道位置' : '该卫星轨位无效', icon: 'none' });
      return;
    }

    const bandMap = { 0: 'C', 1: 'Ku', 2: 'ExtKu', 3: 'Ka', 4: 'Q' };
    const band = bandMap[this.data.sunOutageBandIndex] || 'Ku';
    const season = this.data.sunOutageSeasonIndex === 0 ? 'vernal' : 'autumnal';

    let customFreq = null;
    if (this.data.sunOutageShowCustomFreq && this.data.sunOutageCustomFreq) {
      customFreq = parseFloat(this.data.sunOutageCustomFreq);
      if (isNaN(customFreq) || customFreq <= 0) {
        wx.showToast({ title: '请输入有效频率', icon: 'none' });
        return;
      }
    }

    this.setData({ sunOutageCalculating: true, sunOutageResultReady: false });

    // 使用 setTimeout 让 UI 先更新"计算中"状态
    setTimeout(() => {
      const result = calculateSunOutage({
        lat, lon, satLon, diameter, year, season, band, customFreq
      });

      if (result.error) {
        wx.showToast({ title: result.message, icon: 'none' });
        this.setData({ sunOutageCalculating: false });
        return;
      }

      // 附加显示用字段
      result.satName = sat.name;
      result.satLonDisplay = satLon;
      result.stationLat = lat;
      result.stationLon = lon;
      result.antennaD = diameter;

      this.setData({
        sunOutageCalculating: false,
        sunOutageResultReady: true,
        sunOutageResult: result,
        sunOutageShowDetail: false
      });
    }, 50);
  },

  // 显示可视化功能面板
  showVisualPanel() {
    this.setData({ showVisualPopup: true });
  },

  // 隐藏可视化功能面板
  hideVisualPanel() {
    this.setData({ showVisualPopup: false });
  },

  // 生成报告
  generateReport() {
    // 保存当前数据到全局
    this.saveLinkParams();
    app.globalData.satelliteParams = this.data.satelliteParams;
    
    // 在后台执行一次计算，确保生成报告时使用最新的计算结果
    const results = this.performBackgroundCalculation();
    if (!results) {
      wx.showModal({
        title: '提示',
        content: '计算失败，无法生成报告',
        showCancel: false
      });
      return;
    }
    
    app.globalData.calculationResults = app.globalData.calculationResults || {};
    app.globalData.calculationResults[this.data.currentLinkNum] = results;
    app.globalData.markedParams = this.data.markedParams;

    // 跳转到报告页面
    wx.navigateTo({
      url: `/pages/report/report?linkNum=${this.data.currentLinkNum}`
    });
  },

  // 地球站参数互换
  swapStationParams() {
    try {
      const linkParams = this.data.linkParams;
      
      // 定义需要互换的参数对（不包括馈线损耗和频率）
      const swapPairs = [
        ['earthStationLocation', 'rxEarthStationLocation'],  // 地面站位置
        ['antennaDiameter', 'rxAntennaDiameter'],            // 天线口径
        ['longitude', 'rxLongitude'],                        // 经度
        ['latitude', 'rxLatitude'],                          // 纬度
        ['altitude', 'rxAltitude'],                          // 海拔
        ['rainRate', 'rxRainRate'],                          // 降雨率
        ['antennaEfficiency', 'rxAntennaEfficiency'],        // 天线效率
        ['uplinkAvailability', 'rxDownlinkAvailability']     // 可用性
      ];

      // 执行参数互换
      const updatedParams = { ...linkParams };
      swapPairs.forEach(([param1, param2]) => {
        const temp = updatedParams[param1];
        updatedParams[param1] = updatedParams[param2];
        updatedParams[param2] = temp;
      });

      // 更新数据
      this.setData({
        linkParams: updatedParams
      });

      // 保存到全局数据
      app.globalData.linkParams[this.data.currentLinkNum] = updatedParams;

      wx.showToast({
        title: '参数互换成功',
        icon: 'success',
        duration: 1500
      });

    } catch (error) {
      console.error('参数互换失败:', error);
      wx.showToast({
        title: '互换失败',
        icon: 'none'
      });
    }
  },

  // 余量输入处理
  onMarginInput(e) {
    const value = e.detail.value;
    this.setData({
      marginValue: value,
      marginMode: 'manual' // 手动输入时切换为手动模式
    });
    
    // 更新实时参数
    this.updateRealtimeParams();
    
    // 保存到本地存储
    try {
      wx.setStorageSync('marginValue', value);
      wx.setStorageSync('marginMode', 'manual');
    } catch (err) {
      console.error('保存余量值失败:', err);
    }
  },

  // 功带平衡计算
  autoBalanceMargin() {
    // 震动反馈
    wx.vibrateShort({
      type: 'medium'
    });
    
    // 检查是否已在计算中
    if (this.data.isBalancing) {
      wx.showToast({
        title: '正在计算中...',
        icon: 'none',
        duration: 1500
      });
      return;
    }

    // 参数验证
    const validation = validateAllParams(
      this.data.satelliteParams,
      this.data.linkParams
    );
    
    if (!validation.valid) {
      wx.showModal({
        title: '参数错误',
        content: '请先完善必填参数:\n' + validation.errors.join('\n'),
        showCancel: false
      });
      return;
    }

    // 显示加载状态
    this.setData({
      isBalancing: true,
      marginMode: 'balanced'
    });

    wx.showLoading({
      title: '功带平衡计算中...',
      mask: true
    });

    // 使用setTimeout让UI有时间更新
    setTimeout(() => {
      try {
        const result = this.findOptimalMargin();
        
        if (result.success) {
          this.setData({
            marginValue: result.margin.toFixed(3),
            isBalancing: false
          }, () => {
            // 更新实时参数
            this.updateRealtimeParams();
            
            // 延迟一小段时间触发完整计算
            setTimeout(() => {
              this.calculateLink();
            }, 200);
          });
          
          // 保存结果
          try {
            wx.setStorageSync('marginValue', result.margin.toFixed(3));
            wx.setStorageSync('marginMode', 'balanced');
          } catch (err) {
            console.error('保存余量值失败:', err);
          }
          
          wx.hideLoading();
          wx.showToast({
            title: `平衡余量: ${result.margin.toFixed(3)} dB`,
            icon: 'success',
            duration: 2000
          });
          
        } else {
          throw new Error(result.message || '平衡计算失败');
        }
      } catch (error) {
        console.error('功带平衡失败:', error);
        this.setData({
          isBalancing: false
        });
        wx.hideLoading();
        wx.showModal({
          title: '计算失败',
          content: error.message || '功带平衡计算出错',
          showCancel: false
        });
      }
    }, 100);
  },

  // 寻找最优余量 - 二分搜索算法
  findOptimalMargin() {
    let minMargin = -50;
    let maxMargin = 50;
    const maxIterations = 300;
    const tolerance = 0.001; // 精度
    let iterations = 0;

    // 测试指定余量下的带宽差异
    const testMargin = (margin) => {
      try {
        // 临时设置余量值
        const tempLinkParams = {
          ...this.data.linkParams,
          margin: margin.toString(),
          noiseRatioMode: this.data.noiseRatioMode
        };
        
        // 执行计算
        const results = calculateLinkBudget(
          this.data.satelliteParams,
          tempLinkParams
        );
        
        if (!results.success) {
          return { difference: Infinity, error: true };
        }
        
        // 获取分配带宽和功率带宽
        const allocBandwidth = parseFloat(results.data.allocBandwidthResult) || 0;
        const powerBW = parseFloat(results.data.PowerBWResult) || 0;
        
        // 计算差异
        const difference = Math.abs(allocBandwidth - powerBW);
        
        return { difference, allocBandwidth, powerBW, error: false };
        
      } catch (error) {
        console.error('测试余量时出错:', error);
        return { difference: Infinity, error: true };
      }
    };

    // 二分搜索
    while (iterations < maxIterations) {
      iterations++;
      
      const midMargin = (minMargin + maxMargin) / 2;
      const midResult = testMargin(midMargin);
      
      if (midResult.error) {
        return { success: false, message: '计算过程出错' };
      }
      
      // 检查是否满足精度要求
      if (midResult.difference <= tolerance) {
        return { 
          success: true, 
          margin: midMargin,
          difference: midResult.difference,
          allocBandwidth: midResult.allocBandwidth,
          powerBW: midResult.powerBW
        };
      }
      
      // 测试上下偏移，确定搜索方向
      const plusResult = testMargin(midMargin + 0.01);
      
      if (plusResult.error) {
        return { success: false, message: '计算过程出错' };
      }
      
      if (plusResult.difference < midResult.difference) {
        // 向更高余量搜索
        minMargin = midMargin;
      } else {
        const minusResult = testMargin(midMargin - 0.01);
        
        if (minusResult.error) {
          return { success: false, message: '计算过程出错' };
        }
        
        if (minusResult.difference < midResult.difference) {
          // 向更低余量搜索
          maxMargin = midMargin;
        } else {
          // 已到达局部最优点
          return { 
            success: true, 
            margin: midMargin,
            difference: midResult.difference,
            allocBandwidth: midResult.allocBandwidth,
            powerBW: midResult.powerBW
          };
        }
      }
    }
    
    // 达到最大迭代次数，返回当前最优值
    const finalMargin = (minMargin + maxMargin) / 2;
    const finalResult = testMargin(finalMargin);
    
    return { 
      success: true, 
      margin: finalMargin,
      difference: finalResult.difference,
      allocBandwidth: finalResult.allocBandwidth,
      powerBW: finalResult.powerBW
    };
  },

  // 实时计算参数
  updateRealtimeParams() {
    try {
      // 如果是符号率优先模式，先根据当前符号率反推信息速率和载波带宽
      if (this.data.rateCalcMode === 'symbolRate') {
        const currentSymbolRate = parseFloat(this.data.realtimeParams.symbolRate);
        
        // 只有当符号率是有效数值时才反推
        if (!isNaN(currentSymbolRate) && currentSymbolRate > 0) {
          const modulation = this.data.linkParams.modulation || 'QPSK';
          const fec = parseFractionOrDecimal(this.data.linkParams.fec, 0.75);
          const rsCode = parseFractionOrDecimal(this.data.linkParams.rsCode, 188/204);
          const m = parseFloat(this.data.linkParams.m) || 1;
          const bandwidthFactor = parseFloat(this.data.linkParams.bandwidthFactor) || 1.2;
          const modulationFactor = MODULATION_FACTORS[modulation] || 2;
          
          // 反推信息速率: infoRate = symbolRate * modulationFactor / m * rsCode * fec
          const infoRate = currentSymbolRate * modulationFactor / m * rsCode * fec;
          const infoRateFormatted = parseFloat(infoRate.toFixed(3)).toString();
          
          // 直接基于符号率计算载波带宽
          const carrierBandwidth = Math.round(bandwidthFactor * currentSymbolRate * 1000) / 1000;
          
          // 更新信息速率和载波带宽
          this.setData({
            'linkParams.infoRate': infoRateFormatted,
            'realtimeParams.carrierBandwidth': carrierBandwidth
          });
        }
      }
      
      // 如果是载波带宽优先模式，先根据当前载波带宽反推符号率和信息速率
      if (this.data.rateCalcMode === 'carrierBandwidth') {
        const currentBandwidth = parseFloat(this.data.realtimeParams.carrierBandwidth);
        
        if (!isNaN(currentBandwidth) && currentBandwidth > 0) {
          const modulation = this.data.linkParams.modulation || 'QPSK';
          const fec = parseFractionOrDecimal(this.data.linkParams.fec, 0.75);
          const rsCode = parseFractionOrDecimal(this.data.linkParams.rsCode, 188/204);
          const m = parseFloat(this.data.linkParams.m) || 1;
          const bandwidthFactor = parseFloat(this.data.linkParams.bandwidthFactor) || 1.2;
          const modulationFactor = MODULATION_FACTORS[modulation] || 2;
          
          // 根据滚降系数计算符号率: symbolRate = carrierBandwidth / bandwidthFactor
          const symbolRate = Math.round(currentBandwidth / bandwidthFactor * 1000) / 1000;
          
          // 反推信息速率: infoRate = symbolRate * modulationFactor / m * rsCode * fec
          const infoRate = symbolRate * modulationFactor / m * rsCode * fec;
          const infoRateFormatted = parseFloat(infoRate.toFixed(3)).toString();
          
          // 更新符号率和信息速率
          this.setData({
            'linkParams.infoRate': infoRateFormatted,
            'realtimeParams.symbolRate': parseFloat(symbolRate.toFixed(3)).toString()
          });
        }
      }
      
      // 准备参数，包含当前的余量值
      const linkParamsWithMargin = {
        ...this.data.linkParams,
        margin: this.data.marginValue,
        noiseRatioMode: this.data.noiseRatioMode
      };
      
      // 调用计算函数
      const results = calculateLinkBudget(this.data.satelliteParams, linkParamsWithMargin);
      
      if (results.success) {
        // 根据模式决定是否更新符号率和载波带宽
        if (this.data.rateCalcMode === 'symbolRate') {
          // 符号率优先模式：保持符号率和载波带宽不变，只更新其他参数
          this.setData({
            'realtimeParams.stationEIRP': results.data.stationEIRPResult,
            'realtimeParams.paRecommendation': results.data.paRecommendation,
            'realtimeParams.gOverTe': results.data.gOverTeResult
          });
        } else if (this.data.rateCalcMode === 'carrierBandwidth') {
          // 载波带宽优先模式：保持载波带宽不变，符号率由带宽反推，只更新其他参数
          this.setData({
            'realtimeParams.stationEIRP': results.data.stationEIRPResult,
            'realtimeParams.paRecommendation': results.data.paRecommendation,
            'realtimeParams.gOverTe': results.data.gOverTeResult
          });
        } else {
          // 信息速率优先模式：正常更新所有参数包括符号率
          this.setData({
            'realtimeParams.stationEIRP': results.data.stationEIRPResult,
            'realtimeParams.paRecommendation': results.data.paRecommendation,
            'realtimeParams.gOverTe': results.data.gOverTeResult,
            'realtimeParams.carrierBandwidth': results.data.allocBandwidthResult,
            'realtimeParams.symbolRate': results.data.symbolRateResult
          });
        }
      }
    } catch (e) {
      // 实时计算出错不阻断用户操作，仅在控制台记录
      console.log('实时计算更新失败:', e);
    }
  },

  // 切换参数标记状态
  toggleHighlight(e) {
    const paramKey = e.currentTarget.dataset.param;
    console.log('toggleHighlight clicked, paramKey:', paramKey);
    
    if (!paramKey) {
      console.log('paramKey is empty, returning');
      return;
    }
    
    const markedParams = [...this.data.markedParams]; // 创建新数组
    const index = markedParams.indexOf(paramKey);
    
    console.log('Before toggle - markedParams:', markedParams);
    console.log('paramKey index:', index);
    
    if (index > -1) {
      // 已标记，取消标记
      markedParams.splice(index, 1);
      console.log('Removed mark');
    } else {
      // 未标记，添加标记
      markedParams.push(paramKey);
      console.log('Added mark');
    }
    
    console.log('After toggle - markedParams:', markedParams);
    
    this.setData({
      markedParams: markedParams
    }, () => {
      console.log('setData completed, new markedParams:', this.data.markedParams);
    });
    
    // 触觉反馈
    wx.vibrateShort({
      type: 'light'
    });
  },

  // 分享给好友
  onShareAppMessage() {
    return {
      title: '地球静止轨道卫星链路计算工具',
      path: '/pages/index/index',
      imageUrl: '' // 可选，可以设置分享图片
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: '地球静止轨道卫星链路计算工具',
      query: '',
      imageUrl: '' // 可选，可以设置分享图片
    };
  },

  // ============ 正向计算功能 ============
  
  // 显示余量弹出面板
  showMarginPanel() {
    this.setData({
      showMarginPopup: true
    });
  },

  // 隐藏余量弹出面板
  hideMarginPanel() {
    this.setData({
      showMarginPopup: false
    });
  },

  // 设置计算模式
  setCalcMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      calcMode: mode
    });
  },

  // 切换计算模式
  toggleCalcMode() {
    const newMode = this.data.calcMode === 'reverse' ? 'forward' : 'reverse';
    this.setData({
      calcMode: newMode
    });
    
    wx.showToast({
      title: newMode === 'forward' ? '正向模式：输入功放→算余量' : '反向模式：输入余量→算功放',
      icon: 'none',
      duration: 2000
    });
  },

  // 功放功率输入 - 实时反推余量并更新参数
  onPaPowerInput(e) {
    const value = e.detail.value;
    this.setData({
      inputPaPower: value
    });
    
    // 清除之前的防抖定时器
    if (this._paPowerInputTimer) {
      clearTimeout(this._paPowerInputTimer);
    }
    
    // 防抖处理，300ms后执行实时反推计算
    this._paPowerInputTimer = setTimeout(() => {
      const paPower = parseFloat(value);
      if (isNaN(paPower) || paPower <= 0) {
        return;
      }
      
      // 参数验证
      const validation = validateAllParams(
        this.data.satelliteParams,
        this.data.linkParams
      );
      
      if (!validation.valid) {
        return; // 参数不完整时不进行实时计算
      }
      
      // 使用快速版本反推余量
      const result = this.findMarginByPaPowerQuick(paPower);
      
      if (result.success) {
        this.setData({
          marginValue: result.margin.toFixed(2)
        }, () => {
          // 更新实时参数
          this.updateRealtimeParams();
        });
        
        // 保存余量值
        try {
          wx.setStorageSync('marginValue', result.margin.toFixed(2));
        } catch (err) {
          console.error('保存余量值失败:', err);
        }
      }
    }, 300);
  },
  
  // 快速版反推余量 - 解析反推法（只需2次计算，全程高精度）
  findMarginByPaPowerQuick(targetPaPowerW) {
    // 执行单次计算的辅助函数 - 使用高精度margin字符串
    const doCalculation = (margin) => {
      try {
        const tempLinkParams = {
          ...this.data.linkParams,
          // 使用高精度字符串传递margin，保留完整精度
          margin: typeof margin === 'number' ? margin.toFixed(10) : margin.toString(),
          noiseRatioMode: this.data.noiseRatioMode
        };
        
        const results = calculateLinkBudget(
          this.data.satelliteParams,
          tempLinkParams
        );
        
        if (!results.success) {
          return { paPower: 0, paPowerdB: -Infinity, error: true };
        }
        
        const paPowerParsed = parseFloat(results.data.paRecommendation);
        const paPowerdBParsed = parseFloat(results.data.paRecommendationdBResult);
        const paPower = isNaN(paPowerParsed) ? 0 : paPowerParsed;
        const paPowerdB = isNaN(paPowerdBParsed) ? -Infinity : paPowerdBParsed;
        return { paPower, paPowerdB, error: false };
      } catch (error) {
        return { paPower: 0, paPowerdB: -Infinity, error: true };
      }
    };

    // 步骤1: 用当前余量做基准计算，获取常量K（保持完整精度）
    const currentMargin = parseFloat(this.data.marginValue) || 3;
    const baseResult = doCalculation(currentMargin);
    
    // 利用公式: P_dBW = margin + K，推导 K = P_dBW - margin（完整精度）
    const K = baseResult.paPowerdB - currentMargin;
    
    // 步骤2: 直接解析反推新余量（完整精度计算）
    const targetPaPowerdB = 10 * Math.log10(targetPaPowerW);
    const preciseMargin = targetPaPowerdB - K; // 保持完整精度
    
    // 步骤3: 使用精确margin进行验证计算
    const verifyResult = doCalculation(preciseMargin);
    
    if (verifyResult.error) {
      return { success: false, message: '验证计算失败' };
    }
    
    // 只在最终返回时四舍五入到2位小数（用于显示）
    const displayMargin = parseFloat(preciseMargin.toFixed(2));
    
    return { 
      success: true, 
      margin: displayMargin,
      preciseMargin: preciseMargin, // 返回精确值供需要时使用
      actualPaPower: verifyResult.paPower
    };
  },

  // 正向计算 - 根据功放功率反推余量
  forwardCalculate() {
    // 震动反馈
    wx.vibrateShort({
      type: 'medium'
    });

    const paPower = parseFloat(this.data.inputPaPower);
    if (isNaN(paPower) || paPower <= 0) {
      wx.showToast({
        title: '请输入有效的功放功率',
        icon: 'none'
      });
      return;
    }

    // 参数验证
    const validation = validateAllParams(
      this.data.satelliteParams,
      this.data.linkParams
    );
    
    if (!validation.valid) {
      wx.showModal({
        title: '参数错误',
        content: '请先完善必填参数:\n' + validation.errors.join('\n'),
        showCancel: false
      });
      return;
    }

    this.setData({ isForwardCalculating: true });
    wx.showLoading({ title: '正向计算中...', mask: true });

    setTimeout(() => {
      try {
        const result = this.findMarginByPaPower(paPower);
        
        if (result.success) {
          // 更新余量值
          this.setData({
            marginValue: result.margin.toFixed(2),
            isForwardCalculating: false
          }, () => {
            // 立即更新实时参数
            this.updateRealtimeParams();
            
            // 延迟一小段时间触发完整计算，确保UI先更新
            setTimeout(() => {
              this.calculateLink();
            }, 200);
          });
          
          wx.hideLoading();
          wx.showToast({
            title: `${paPower}W功放 → 余量${result.margin.toFixed(2)}dB`,
            icon: 'success',
            duration: 2000
          });
        } else {
          throw new Error(result.message || '计算失败');
        }
      } catch (error) {
        console.error('正向计算失败:', error);
        this.setData({ isForwardCalculating: false });
        wx.hideLoading();
        wx.showModal({
          title: '计算失败',
          content: error.message || '正向计算出错',
          showCancel: false
        });
      }
    }, 100);
  },

  // 根据功放功率反推余量 - 解析反推法（高精度版，只需2-3次计算，全程高精度）
  findMarginByPaPower(targetPaPowerW) {
    // 执行单次计算的辅助函数 - 使用高精度margin
    const doCalculation = (margin) => {
      try {
        const tempLinkParams = {
          ...this.data.linkParams,
          // 使用高精度字符串传递margin，保留完整精度
          margin: typeof margin === 'number' ? margin.toFixed(10) : margin.toString(),
          noiseRatioMode: this.data.noiseRatioMode
        };
        
        const results = calculateLinkBudget(
          this.data.satelliteParams,
          tempLinkParams
        );
        
        if (!results.success) {
          return { paPower: 0, paPowerdB: -Infinity, error: true };
        }
        
        // 获取功放建议功率（瓦特）和dBW值
        // 修复：使用 isNaN 检查代替 || 运算符，避免 0 dBW (1W) 被误判为 falsy
        const paPowerParsed = parseFloat(results.data.paRecommendation);
        const paPowerdBParsed = parseFloat(results.data.paRecommendationdBResult);
        const paPower = isNaN(paPowerParsed) ? 0 : paPowerParsed;
        const paPowerdB = isNaN(paPowerdBParsed) ? -Infinity : paPowerdBParsed;
        
        return { paPower, paPowerdB, error: false };
      } catch (error) {
        console.error('计算时出错:', error);
        return { paPower: 0, paPowerdB: -Infinity, error: true };
      }
    };

    // 步骤1: 用当前余量做基准计算，获取常量K（保持完整精度）
    // 原理: 功放功率(dBW) = margin + K，其中K是由其他参数决定的常量
    const currentMargin = parseFloat(this.data.marginValue) || 3;
    const baseResult = doCalculation(currentMargin);
    
    // 计算常量K: K = P_dBW - margin（完整精度）
    const K = baseResult.paPowerdB - currentMargin;
    
    // 步骤2: 直接解析反推新余量（完整精度计算）
    const targetPaPowerdB = 10 * Math.log10(targetPaPowerW);
    let preciseMargin = targetPaPowerdB - K; // 保持完整精度
    
    // 步骤3: 使用精确margin进行验证计算
    let verifyResult = doCalculation(preciseMargin);
    
    if (verifyResult.error) {
      return { success: false, message: '验证计算失败' };
    }
    
    // 检查误差（处理功率受限类型变化等边界情况）
    const relativeError = Math.abs(verifyResult.paPower - targetPaPowerW) / targetPaPowerW;
    
    if (relativeError > 0.001) {
      // 误差超过0.1%，说明可能发生功率受限类型切换，用验证结果重新计算K
      const newK = verifyResult.paPowerdB - preciseMargin;
      preciseMargin = targetPaPowerdB - newK; // 保持完整精度
      
      // 再次验证（使用精确margin）
      verifyResult = doCalculation(preciseMargin);
      if (verifyResult.error) {
        return { success: false, message: '二次验证计算失败' };
      }
    }
    
    // 只在最终返回时四舍五入到2位小数（用于显示）
    const displayMargin = parseFloat(preciseMargin.toFixed(2));
    
    return { 
      success: true, 
      margin: displayMargin,
      preciseMargin: preciseMargin, // 返回精确值供需要时使用
      actualPaPower: verifyResult.paPower
    };
  },

  // ============ 历史记录功能 ============

  // 加载历史记录
  loadHistoryRecords() {
    try {
      const records = wx.getStorageSync('calculationHistory') || [];
      this.setData({
        historyRecords: records
      });
    } catch (e) {
      console.error('加载历史记录失败:', e);
    }
  },

  // 保存计算到历史记录
  saveToHistory(results) {
    try {
      let records = wx.getStorageSync('calculationHistory') || [];
      
      // 创建历史记录条目
      const record = {
        id: Date.now(),
        time: this.formatDateTime(new Date()),
        satelliteName: this.data.satelliteParams.satelliteName || '未命名',
        orbitPosition: this.data.satelliteParams.orbitPosition,
        frequencyBand: this.data.satelliteParams.frequencyBand,
        txLocation: this.data.linkParams.earthStationLocation || '发信站',
        rxLocation: this.data.linkParams.rxEarthStationLocation || '收信站',
        infoRate: this.data.linkParams.infoRate,
        modulation: this.data.linkParams.modulation,
        margin: this.data.marginValue,
        paRecommendation: results.paRecommendation,
        // 保存完整参数用于加载
        satelliteParams: JSON.parse(JSON.stringify(this.data.satelliteParams)),
        linkParams: JSON.parse(JSON.stringify(this.data.linkParams)),
        calculationResults: JSON.parse(JSON.stringify(results)),
        marginValue: this.data.marginValue,
        noiseRatioMode: this.data.noiseRatioMode
      };
      
      // 添加到开头
      records.unshift(record);
      
      // 只保留最近20条
      if (records.length > 20) {
        records = records.slice(0, 20);
      }
      
      // 保存到本地
      wx.setStorageSync('calculationHistory', records);
      
      this.setData({
        historyRecords: records
      });
    } catch (e) {
      console.error('保存历史记录失败:', e);
    }
  },

  // 格式化日期时间
  formatDateTime(date) {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hour = date.getHours().toString().padStart(2, '0');
    const minute = date.getMinutes().toString().padStart(2, '0');
    return `${month}-${day} ${hour}:${minute}`;
  },

  // 显示/隐藏历史记录面板
  toggleHistoryPanel() {
    // 重置所有项的滑动位置
    if (!this.data.showHistoryPanel) {
      this.resetHistoryItemsPosition();
    }
    this.setData({
      showHistoryPanel: !this.data.showHistoryPanel,
      historySelectMode: false,
      selectedHistoryIds: []
    });
  },

  // 切换历史记录多选模式
  toggleHistorySelectMode() {
    wx.vibrateShort({ type: 'light' });
    const newMode = !this.data.historySelectMode;
    this.setData({
      historySelectMode: newMode,
      selectedHistoryIds: []
    });
    // 进入多选时重置滑动位置
    if (newMode) {
      this.resetHistoryItemsPosition();
    }
  },

  // 切换历史记录选择状态
  toggleHistorySelection(e) {
    const recordId = e.currentTarget.dataset.id;
    let selected = [...this.data.selectedHistoryIds];
    const idx = selected.indexOf(recordId);
    if (idx >= 0) {
      selected.splice(idx, 1);
    } else {
      selected.push(recordId);
    }
    this.setData({ selectedHistoryIds: selected });
  },

  // 导出选中的历史记录为Excel（含对比高亮）
  async exportHistoryExcel() {
    const { selectedHistoryIds, historyRecords } = this.data;
    if (selectedHistoryIds.length === 0) {
      wx.showToast({ title: '请先选择记录', icon: 'none' });
      return;
    }

    // 按选择顺序获取记录
    const selectedRecords = selectedHistoryIds.map(id => historyRecords.find(r => r.id === id)).filter(Boolean);

    // 检查是否有计算结果
    const recordsWithResults = selectedRecords.filter(r => r.calculationResults);
    if (recordsWithResults.length === 0) {
      wx.showModal({
        title: '无法导出',
        content: '选中的历史记录没有计算结果数据（旧版记录不支持导出，请重新计算后再试）',
        showCancel: false
      });
      return;
    }

    wx.showLoading({ title: '生成Excel中...', mask: true });

    try {
      // 将历史记录转为配置格式以复用云函数
      const configs = recordsWithResults.map(record => ({
        configName: `${record.satelliteName}_${record.time}`,
        satelliteParams: record.satelliteParams,
        linkParams: { 1: record.linkParams },
        calculationResults: { 1: record.calculationResults },
        noiseRatioMode: record.noiseRatioMode || 'ebno'
      }));

      const lastExcelFileID = wx.getStorageSync('lastHistoryExcelFileID') || null;

      const res = await wx.cloud.callFunction({
        name: 'generateReport',
        data: {
          configs: configs,
          format: 'excel',
          lang: 'zh',
          compareMode: true,
          oldFileID: lastExcelFileID
        }
      });

      if (!res.result || !res.result.success) {
        throw new Error(res.result?.error || '云函数返回错误');
      }

      wx.setStorageSync('lastHistoryExcelFileID', res.result.fileID);

      const downloadRes = await wx.cloud.downloadFile({
        fileID: res.result.fileID
      });

      if (!downloadRes.tempFilePath) {
        throw new Error('文件下载失败');
      }

      wx.hideLoading();

      wx.openDocument({
        filePath: downloadRes.tempFilePath,
        showMenu: true,
        fileType: 'xlsx',
        success: () => {
          wx.showToast({ title: '点击右上角可转发', icon: 'none', duration: 3000 });
        },
        fail: (err) => {
          console.error('打开文档失败:', err);
          wx.showModal({
            title: '导出成功',
            content: `Excel文件已生成\n\n文件名: ${res.result.fileName}\n\n请点击右上角菜单转发或保存`,
            showCancel: false
          });
        }
      });
    } catch (error) {
      console.error('导出历史Excel失败:', error);
      wx.hideLoading();
      wx.showModal({
        title: '导出失败',
        content: error.message || '无法导出Excel，请稍后重试',
        showCancel: false
      });
    }
  },

  // 重置所有历史记录项的滑动位置
  resetHistoryItemsPosition() {
    const records = this.data.historyRecords.map(item => ({
      ...item,
      offsetX: 0
    }));
    this.setData({ historyRecords: records });
  },

  // 历史记录项 touch 开始
  onHistoryTouchStart(e) {
    const touch = e.touches[0];
    this._historyTouchStartX = touch.clientX;
    this._historyTouchStartY = touch.clientY;
    this._historyTouchId = e.currentTarget.dataset.id;
    this._historyTouchMoved = false;
    
    // 获取当前项的偏移量
    const record = this.data.historyRecords.find(r => r.id === this._historyTouchId);
    this._historyStartOffsetX = record ? (record.offsetX || 0) : 0;
  },

  // 历史记录项 touch 移动
  onHistoryTouchMove(e) {
    const touch = e.touches[0];
    const deltaX = touch.clientX - this._historyTouchStartX;
    const deltaY = touch.clientY - this._historyTouchStartY;
    
    // 判断是横向滑动还是纵向滑动
    if (!this._historyTouchMoved) {
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
        this._historyTouchMoved = true;
        this._historyIsHorizontal = true;
      } else if (Math.abs(deltaY) > 10) {
        this._historyTouchMoved = true;
        this._historyIsHorizontal = false;
      }
    }
    
    // 只处理横向滑动
    if (this._historyIsHorizontal) {
      let newOffsetX = this._historyStartOffsetX + deltaX;
      
      // 限制滑动范围
      const maxOffset = 0;
      const minOffset = -140; // 两个按钮的宽度 (280rpx ≈ 140px)
      
      newOffsetX = Math.max(minOffset, Math.min(maxOffset, newOffsetX));
      
      // 更新当前项的偏移量
      const index = this.data.historyRecords.findIndex(r => r.id === this._historyTouchId);
      if (index !== -1) {
        this.setData({
          [`historyRecords[${index}].offsetX`]: newOffsetX
        });
      }
    }
  },

  // 历史记录项 touch 结束
  onHistoryTouchEnd(e) {
    const index = this.data.historyRecords.findIndex(r => r.id === this._historyTouchId);
    if (index === -1) return;
    
    const currentOffsetX = this.data.historyRecords[index].offsetX || 0;
    const threshold = -50; // 阈值
    
    // 重置其他项并决定当前项的最终位置
    const records = this.data.historyRecords.map((item, i) => {
      if (i === index) {
        return {
          ...item,
          offsetX: currentOffsetX < threshold ? -140 : 0,
          animating: true // 添加动画标记
        };
      }
      return {
        ...item,
        offsetX: 0,
        animating: true
      };
    });
    
    this.setData({ historyRecords: records });
    
    // 动画结束后移除标记
    setTimeout(() => {
      const resetRecords = this.data.historyRecords.map(item => ({
        ...item,
        animating: false
      }));
      this.setData({ historyRecords: resetRecords });
    }, 150);
    
    // 重置状态
    this._historyIsHorizontal = false;
  },

  // 加载历史记录
  loadHistoryRecord(e) {
    // 如果是滑动操作，不触发加载
    if (this._historyTouchMoved && this._historyIsHorizontal) {
      return;
    }
    
    // 震动反馈
    wx.vibrateShort({ type: 'light' });
    
    const recordId = e.currentTarget.dataset.id;
    const record = this.data.historyRecords.find(r => r.id === recordId);
    
    if (!record) {
      wx.showToast({ title: '记录不存在', icon: 'none' });
      return;
    }

    // 恢复参数
    this.setData({
      satelliteParams: record.satelliteParams,
      linkParams: record.linkParams,
      marginValue: record.marginValue,
      noiseRatioMode: record.noiseRatioMode,
      showHistoryPanel: false
    });
    
    // 更新全局数据
    app.globalData.satelliteParams = record.satelliteParams;
    app.globalData.linkParams[this.data.currentLinkNum] = record.linkParams;
    
    // 更新实时参数
    this.updateRealtimeParams();

    wx.showToast({
      title: '已加载历史记录',
      icon: 'success',
      duration: 1500
    });
  },

  // 删除历史记录
  deleteHistoryRecord(e) {
    const recordId = e.currentTarget.dataset.id;
    
    // 震动反馈
    wx.vibrateShort({ type: 'medium' });
    
    // 直接删除，无需确认
    let records = this.data.historyRecords.filter(r => r.id !== recordId);
    
    wx.setStorageSync('calculationHistory', records);
    
    this.setData({
      historyRecords: records
    });
    
    wx.showToast({ title: '已删除', icon: 'success', duration: 1000 });
  },

  // 清空所有历史记录
  clearAllHistory() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有历史记录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.setStorageSync('calculationHistory', []);
          this.setData({ historyRecords: [] });
          wx.showToast({ title: '已清空', icon: 'success' });
        }
      }
    });
  },

  // 收藏历史记录到配置
  saveHistoryToConfig(e) {
    // 震动反馈
    wx.vibrateShort({ type: 'light' });
    
    const recordId = e.currentTarget.dataset.id;
    const record = this.data.historyRecords.find(r => r.id === recordId);
    
    if (!record) {
      wx.showToast({ title: '记录不存在', icon: 'none' });
      return;
    }

    // 生成默认配置名称
    const defaultName = `${record.satelliteName}_${record.txLocation}_${record.time}`;
    
    wx.showModal({
      title: '收藏到配置',
      editable: true,
      placeholderText: '请输入配置名称',
      content: defaultName,
      success: (res) => {
        if (res.confirm) {
          const configName = res.content || defaultName;
          this.doSaveHistoryToConfig(record, configName);
        }
      }
    });
  },

  // 执行保存历史到配置
  doSaveHistoryToConfig(record, configName) {
    try {
      // 从本地存储读取现有配置
      const configs = wx.getStorageSync('savedConfigs') || [];
      
      // 创建新配置
      const newConfig = {
        _id: `config_${Date.now()}`,
        configName: configName,
        satelliteParams: record.satelliteParams,
        linkParams: record.linkParams,
        calculationResults: {},
        noiseRatioMode: record.noiseRatioMode || 'ebno',
        markedParams: this.data.markedParams || [],
        highlightedRows: [],
        createTime: new Date(),
        updateTime: new Date(),
        fromHistory: true // 标记来源于历史记录
      };
      
      // 添加到配置列表开头
      configs.unshift(newConfig);
      
      // 保存到本地存储
      wx.setStorageSync('savedConfigs', configs);
      
      wx.showToast({
        title: '已收藏到配置',
        icon: 'success'
      });
    } catch (error) {
      console.error('收藏到配置失败:', error);
      wx.showToast({
        title: '收藏失败',
        icon: 'none'
      });
    }
  }
});

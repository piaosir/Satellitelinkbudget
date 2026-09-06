// index.js
const app = getApp();
const { modFactorOf, MODULATION_OPTIONS, FREQUENCY_BAND_OPTIONS, FEC_OPTIONS, DVB_STANDARD_OPTIONS, MODCOD_TABLE_OF, NTN_PHY_OF, NTN_TABLE_META, isNtnStandard } = require('../../utils/constants');
const ntnPhy = require('../../utils/ntnPhy.js');
const { validateAllParams } = require('../../utils/validator');
const { formatResultsForDisplay } = require('../../utils/formatter');
const { calculateLinkBudget: calculateLinkBudgetGEO } = require('../../utils/linkCalculator');
const { calculateLinkBudget: calculateLinkBudgetNGSO, slantRangeFromAltitude, altitudeFromSlantRange } = require('../../utils/linkCalculatorNGSO');
const { getAllCities, getDisplayOrderCities, searchCities, getCityByName } = require('../../utils/cities');
const { estimateRainRate, getNearestCityInfo } = require('../../utils/rainRate');
const { queryElevation, isElevationReady } = require('../../utils/elevation');
const { calculateSunOutage, BAND_PARAMS } = require('../../utils/sunOutageCalculator');
const { buildWaterfallSegments, buildLinkSummary } = require('../../utils/waterfallBuilder');

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

// 取数助手：仅当为空('' / null / undefined)时回退默认；输入了什么(含 0)就如实 parseFloat，
// 与计算器(linkCalculator/NGSO)口径一致，保证实时预览与最终结果不会因 0 被吞而对不上
function pickNum(v, def) {
  return (v !== '' && v !== null && v !== undefined) ? parseFloat(v) : def;
}

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
      { "name": "AsiaSat 9", "position": "122" }
    ],
    satelliteIndex: 0,
    
    // 轨道类型：GEO（地球静止轨道）/ NGSO（非地球静止轨道）
    orbitType: 'GEO',

    // NGSO 轨道分类（LEO/MEO/HEO）及典型轨道高度参考（km）
    // LEO: 星网(GW-2)  MEO: 北斗 MEO  HEO: 中国 HEO 典型远地点
    ngsoOrbitClassOptions: [
      { key: 'LEO', label: 'LEO', altitude: 1145 },
      { key: 'MEO', label: 'MEO', altitude: 21528 },
      { key: 'HEO', label: 'HEO', altitude: 39000 }
    ],
    // 默认 LEO
    ngsoOrbitClassIndex: 0,
    ngsoOrbitClass: 'LEO',

    // 卫星参数
    satelliteParams: {},

    // 链路参数
    linkParams: {},

    // 噪声比模式：'ebno' / 'esno' / 'snr'
    // 'snr' 是 3GPP NTN 的口径 —— 每资源元素 RE 的信噪比，噪声带宽取占用带宽，见 utils/ntnPhy.js
    noiseRatioMode: 'ebno',

    // 3GPP NTN 物理层面板的派生态（整体由 refreshNtnPanel 重算，界面只读不写）
    ntn: { on: false },

    // 帧效率/频谱效率切换模式
    rsCodeMode: 'spectral', // 'fraction' (帧效率) 或 'spectral' (频谱效率 bps/Hz)

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

    // 仰角警告置顶提示
    elevationWarningInfo: { tx: null, rx: null }, // { tx/rx: { level, message, elevation } | null }

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
    resultsFlash: false, // 计算完成时结果区短暂高亮（非打扰式完成反馈）
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
      symbolRate: '--',
      spectralEfficiency: ''
    },
    
    // 输入框全选控制
    inputSelectAll: false,

    // 当前聚焦的输入框字段（原生input的:focus伪类不可靠，用类名驱动聚焦样式）
    focusedField: '',
    
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
    this._preFocusScrollTop = null; // 键盘避让滚动前的阅读位置，键盘收起后回位
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
        // 键盘收起：清除聚焦高亮
        this.setData({ focusedField: '' });
        // 若做过键盘避让滚动且用户未手动接管，先平滑回位，
        // 再收起底部占位（先收占位会导致内容被钳位下坠）
        if (this._preFocusScrollTop !== null) {
          const target = this._preFocusScrollTop;
          this._preFocusScrollTop = null;
          this._scrollTo(target);
          setTimeout(() => {
            this.setData({ keyboardHeight: 0 });
          }, 250);
        } else {
          this.setData({ keyboardHeight: 0 });
        }
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
  },

  // 用户手指开始拖动（enhanced scroll-view 专属事件，编程式滚动不会触发）
  onContentDragStart() {
    // 用户手动接管滚动：取消键盘收起后的自动回位
    this._preFocusScrollTop = null;
    // 安卓：原生input覆盖层会脱离scroll-view位置，拖动时直接收起键盘
    if (this.data.isNotIOS && this._keyboardHeight > 0) {
      wx.hideKeyboard();
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

        // 同步轨道类型：GEO/NGSO（兼容旧配置无 orbitType 字段，默认 GEO）
        // 优先使用刚加载配置时设置的 app.globalData.orbitType（configs 页加载/编辑时会同步）
        const restoredOrbitType = app.globalData.orbitType
          || app.globalData.satelliteParams.orbitType
          || 'GEO';
        if (restoredOrbitType !== this.data.orbitType) {
          this.setData({ orbitType: restoredOrbitType });
        }
        if (!app.globalData.satelliteParams.orbitType) {
          app.globalData.satelliteParams.orbitType = restoredOrbitType;
          this.setData({ 'satelliteParams.orbitType': restoredOrbitType });
        }
        app.globalData.orbitType = restoredOrbitType;

        // 同步 NGSO 轨道分类（LEO/MEO/HEO）
        if (restoredOrbitType === 'NGSO') {
          const ngsoClass = app.globalData.satelliteParams.ngsoOrbitClass || 'LEO';
          const ngsoIdx = this.data.ngsoOrbitClassOptions.findIndex(o => o.key === ngsoClass);
          this.setData({
            ngsoOrbitClass: ngsoClass,
            ngsoOrbitClassIndex: ngsoIdx >= 0 ? ngsoIdx : 0,
            'satelliteParams.ngsoOrbitClass': ngsoClass
          });
          app.globalData.satelliteParams.ngsoOrbitClass = ngsoClass;
        }

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
      
      // 载入的配置可能只有 1 号槽（仿真平台送来的配置一律只有一条链路；分享码导入亦然）。
      // 当前停在 3 号槽时原先直接跳过这一段 —— 界面还显示着上一份配置第 3 条的参数，而全局里
      // 那一槽已经不存在了，屏上与将要参与计算的数不是同一份。故落回 1 号槽（并把选中项一起挪过去）。
      const _lp = app.globalData.linkParams || {};
      const _slot = _lp[this.data.currentLinkNum] ? this.data.currentLinkNum : 1;
      if (_lp[_slot]) {
        const linkParams = _lp[_slot];
        if (_slot !== this.data.currentLinkNum) this.setData({ currentLinkNum: _slot });
        this.setData({
          linkParams: linkParams,
          // 门限口径优先取这一槽里存的（3GPP 一族出来后同一份配置的多条链路口径可以不同），
          // 槽里没有就回落到上面刚从 globalData 读的那个配置级值 —— 存量配置全走这条回落路。
          noiseRatioMode: this._modeOfLink(linkParams)
        });

        // 同步更新DVB标准选择器索引和ModCod列表
        {
          const dvbStandard = linkParams.dvbStandard || 'custom';
          const dvbIdx = DVB_STANDARD_OPTIONS.findIndex(opt => opt.value === dvbStandard);
          const modcodList = MODCOD_TABLE_OF[dvbStandard] || [];
          // 按内容认档而不是照下标直取，见 _resolveModcodIndex
          const modcodIdx = this._resolveModcodIndex(modcodList, linkParams);
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
    
    // 切换到新链路。★ 必须兜底：载入配置是【整块替换】 app.globalData.linkParams = config.linkParams，
    // 而配置里可以只有 1 号槽（分享码导入本就够得着；仿真平台送来的配置一律只写 1 号槽——
    // 那边一份配置就是一条链路）。取不到时置 undefined，界面绑定全断成白屏。
    // 门限口径跟着这一条链路走：1 号槽是 DVB-S2 的 Es/N₀、2 号槽是 NR-NTN 的每 RE SNR，
    // 切过去必须一起换，否则表单上的门限数字是新链路的、口径还是上一条的
    const _next = app.globalData.linkParams[linkNum] || app.getDefaultLinkParams();
    this.setData({
      currentLinkNum: linkNum,
      linkParams: _next,
      noiseRatioMode: this._modeOfLink(_next),
      hasResults: false
    });
    this.updateRealtimeParams();   // 重算 3GPP 物理层面板与实时读数

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
      carrierBandwidth: this.data.realtimeParams.carrierBandwidth,
      // ★ 门限口径【随这一条链路走】，不再只存配置那一级。
      //   一份配置可以有多条链路，3GPP 一族出来之后它们的口径可以不同（1 号槽 DVB-S2 的 Es/N₀、
      //   2 号槽 NR-NTN 的每 RE SNR）。只存配置级的话，切一次链路整份配置的口径就被后存的那条
      //   顶掉，而门限数字原样留着 —— 一个 −6.00 的 SNR 被当成 Eb/N₀ 去算，账面上毫无异样。
      //   配置级那一份仍照旧写（见 configs.js），留给还没存过槽位口径的旧档兜底。
      noiseRatioMode: this.data.noiseRatioMode
    };
    app.globalData.linkParams[this.data.currentLinkNum] = linkParamsToSave;
    // 同时保存噪声比模式（配置级：旧档回落用）
    app.globalData.noiseRatioMode = this.data.noiseRatioMode;
  },

  // 一条链路该用哪个门限口径：优先槽位里存的那一份，其次配置级，最后 'ebno'。
  // 存量配置的槽位里没有这个字段，回落到配置级即原样照旧。
  _modeOfLink(lp) {
    const m = lp && lp.noiseRatioMode;
    if (m === 'ebno' || m === 'esno' || m === 'snr') return m;
    const g = app.globalData.noiseRatioMode;
    return (g === 'ebno' || g === 'esno' || g === 'snr') ? g : 'ebno';
  },

  // 存档里那个 modcodIndex 在【本版】表里还指着同一档吗？
  //
  // 由来：3GPP 一族由两张表扩到八张，NB-IoT NPDSCH 从 8 行补到 Rel-14 全表 14 行，行序也变了
  // （单音表按 I_TBS 升序排）。老配置存的是下标，照原下标去新表里取，标签会显示成另一档 ——
  // 而参与计算的调制/码率/门限是随配置存下来的那一份旧值，于是「屏上写着 I_TBS 5、算的是
  // 上一版的 MCS8」。两者对不上又都不报错，是最难查的一类。
  //
  // 口径：按内容认档，分两层——
  //   ① 调制 + 码率 + 门限三者全中：确定就是这一档；
  //   ② 只有调制 + 码率中：仍是这一档（这两项唯一确定了表里的行），只是门限与本版内置值不同。
  //      门限本来就允许被改（用户按厂家实测覆盖是常规做法），本版又重定过 3GPP 那几张表的基线，
  //      要求它一起对上会把明明存在的档判成「没有」。选择器照常指向这一档，门限框显示实际在用的值。
  //   ③ 都不中：置空，让人看见「这一档在本版表里没有」，而不是给一个像模像样的错标签。
  // 无论哪一层，参与计算的调制 / 码率 / 门限都是配置里存的那一份，一位不动。
  _resolveModcodIndex(list, lp) {
    if (!list || !list.length) return -1;
    const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;
    const sameRow = (row) => row && row.modulation === lp.modulation && String(row.fec) === String(lp.fec);
    const sameAll = (row) => sameRow(row) && near(row.threshold, lp.ebno);
    const i = Number(lp.modcodIndex);
    if (i >= 0 && i < list.length && sameAll(list[i])) return i;
    const exact = list.findIndex(sameAll);
    if (exact >= 0) return exact;
    if (i >= 0 && i < list.length && sameRow(list[i])) return i;
    return list.findIndex(sameRow);   // findIndex 找不到返回 -1，正是我们要的「置空」
  },

  // 切换轨道类型 GEO ↔ NGSO
  toggleOrbitType() {
    const next = this.data.orbitType === 'GEO' ? 'NGSO' : 'GEO';
    this.applyOrbitTypeChange(next);
  },

  // 分段控件点击
  onOrbitTypeChange(e) {
    const type = e.currentTarget.dataset.type;
    if (type && type !== this.data.orbitType) {
      this.applyOrbitTypeChange(type);
    }
  },

  // 应用轨道类型切换：NGSO 默认上行 RHCP / 下行 LHCP + LEO 典型几何
  applyOrbitTypeChange(type) {
    const currentType = this.data.orbitType; // 切换前的类型

    // ── 切换前：把当前 satelliteParams 存入对应 slot ──
    const fromSlot = currentType === 'GEO' ? 'geoSatelliteParams' : 'ngsoSatelliteParams';
    app.globalData[fromSlot] = Object.assign({}, this.data.satelliteParams);

    // ── 如果目标 slot 已有记录，直接恢复并同步 UI，无需走默认值流程 ──
    const toSlot = type === 'GEO' ? 'geoSatelliteParams' : 'ngsoSatelliteParams';
    const savedParams = app.globalData[toSlot];
    const hasSaved = savedParams && Object.keys(savedParams).length > 0;

    if (hasSaved) {
      const restored = Object.assign({}, savedParams, { orbitType: type });
      app.globalData.satelliteParams = restored;
      app.globalData.orbitType = type;

      const update = { orbitType: type, satelliteParams: restored };

      // 同步 NGSO 轨道子类选择器
      if (type === 'NGSO') {
        const ngsoClass = restored.ngsoOrbitClass || 'LEO';
        const ngsoIdx = this.data.ngsoOrbitClassOptions.findIndex(o => o.key === ngsoClass);
        update.ngsoOrbitClass = ngsoClass;
        update.ngsoOrbitClassIndex = ngsoIdx >= 0 ? ngsoIdx : 0;
      }
      // 同步卫星下拉选择器索引
      if (restored.satelliteName) {
        const satIndex = this.data.satellites.findIndex(s => s.name === restored.satelliteName);
        if (satIndex !== -1) update.satelliteIndex = satIndex;
      }
      // 同步频段选择器索引
      if (restored.frequencyBand) {
        const bandIndex = FREQUENCY_BAND_OPTIONS.findIndex(o => o.value === restored.frequencyBand);
        if (bandIndex !== -1) update.frequencyBandIndex = bandIndex;
      }
      this.setData(update);
      return;
    }

    // ── 无保存记录：走原有默认逻辑 ──
    const update = { orbitType: type, 'satelliteParams.orbitType': type };
    // GEO 时清除 ngsoOrbitClass；NGSO 在下面分支里写入
    if (type === 'GEO') {
      update['satelliteParams.ngsoOrbitClass'] = '';
      if (app.globalData.satelliteParams) {
        app.globalData.satelliteParams.ngsoOrbitClass = '';
      }
    }
    // 同步到全局数据，配置/历史保存时会随 satelliteParams 一并写入
    if (app.globalData.satelliteParams) {
      app.globalData.satelliteParams.orbitType = type;
    }
    app.globalData.orbitType = type;
    if (type === 'NGSO') {
      const polOpts = this.data.polarizationOptions;
      const upIdx = polOpts.findIndex(o => o.value === 'RHCP');
      const downIdx = polOpts.findIndex(o => o.value === 'LHCP');
      if (upIdx >= 0) {
        update.uplinkPolarizationIndex = upIdx;
        update['linkParams.uplinkPolarization'] = 'RHCP';
      }
      if (downIdx >= 0) {
        update.downlinkPolarizationIndex = downIdx;
        update['linkParams.downlinkPolarization'] = 'LHCP';
      }

      // LEO 典型场景：仰角 25°，轨道高度 1145 km（星网 GW-2）
      const leoIdx = this.data.ngsoOrbitClassOptions.findIndex(o => o.key === 'LEO');
      const leoOpt = leoIdx >= 0 ? this.data.ngsoOrbitClassOptions[leoIdx] : null;
      if (leoOpt) {
        const el = 25;
        const range = slantRangeFromAltitude(leoOpt.altitude, el);
        update.ngsoOrbitClassIndex = leoIdx;
        update.ngsoOrbitClass = 'LEO';
        update['satelliteParams.ngsoOrbitClass'] = 'LEO';
        if (app.globalData.satelliteParams) {
          app.globalData.satelliteParams.ngsoOrbitClass = 'LEO';
        }
        update['linkParams.minElevation'] = String(el);
        update['linkParams.rxMinElevation'] = String(el);
        update['linkParams.orbitAltitude'] = String(leoOpt.altitude);
        update['linkParams.rxOrbitAltitude'] = String(leoOpt.altitude);
        update['linkParams.slantRange'] = String(parseFloat(range.toFixed(4)));
        update['linkParams.rxSlantRange'] = String(parseFloat(range.toFixed(4)));
        update['linkParams.distanceMode'] = 'altitude';
        update['linkParams.rxDistanceMode'] = 'altitude';
      }
    }
    this.setData(update);
  },

  // 进入计算引擎前的卫星参数预处理：
  // 表单输入的 SFD 以 G/Tref(dB/K) 为参考，引擎需要 G/T=0 参考的 SFD。
  // 换算：SFD(G/T=0) = SFD(G/Tref) + G/Tref（G/T 越高越灵敏，饱和通量密度越低）
  _engineSatParams() {
    const sp = this.data.satelliteParams;
    const gtRef = parseFloat(sp.sfdGtRef);
    if (!gtRef || isNaN(gtRef)) return sp; // 0/空/非法 → 原样（向后兼容）
    const sfd = parseFloat(sp.sfdRef);
    if (isNaN(sfd)) return sp;
    return { ...sp, sfdRef: sfd + gtRef };
  },

  // 根据当前轨道类型路由到对应的链路预算计算模型
  calculateLinkBudget(satelliteParams, linkParams) {
    if (this.data.orbitType === 'NGSO') {
      return calculateLinkBudgetNGSO(satelliteParams, linkParams);
    }
    return calculateLinkBudgetGEO(satelliteParams, linkParams);
  },

  // NGSO：切换"轨道高度 ⇄ 星地斜距"输入模式
  // 切换时根据当前仰角将已有数值做等价换算（类比 Eb/N0 ⇄ Es/N0）
  onDistanceModeToggle(e) {
    const type = e.currentTarget.dataset.type; // 'uplink' | 'downlink'
    const isDown = type === 'downlink';
    const modeField = isDown ? 'rxDistanceMode' : 'distanceMode';
    const altField = isDown ? 'rxOrbitAltitude' : 'orbitAltitude';
    const rangeField = isDown ? 'rxSlantRange' : 'slantRange';
    const elField = isDown ? 'rxMinElevation' : 'minElevation';

    const lp = this.data.linkParams || {};
    const current = lp[modeField];
    const next = current === 'slantRange' ? 'altitude' : 'slantRange';

    // 当前仰角（缺省 10°）
    const elInput = parseFloat(lp[elField]);
    const el = (!isNaN(elInput) && isFinite(elInput)) ? elInput : 10;

    const update = { [`linkParams.${modeField}`]: next };

    if (next === 'slantRange') {
      // altitude -> slantRange：用已有轨道高度 + 当前仰角换算斜距
      const h = parseFloat(lp[altField]);
      if (!isNaN(h) && isFinite(h) && h > 0) {
        const d = slantRangeFromAltitude(h, el);
        update[`linkParams.${rangeField}`] = String(parseFloat(d.toFixed(4)));
      }
    } else {
      // slantRange -> altitude：用已有斜距 + 当前仰角反算轨道高度
      const d = parseFloat(lp[rangeField]);
      if (!isNaN(d) && isFinite(d) && d > 0) {
        const h = altitudeFromSlantRange(d, el);
        update[`linkParams.${altField}`] = String(parseFloat(h.toFixed(4)));
      }
    }

    wx.vibrateShort({ type: 'light' });
    this.setData(update);
  },

  // NGSO：选择轨道分类（LEO/MEO/HEO）→ 自动填入典型轨道高度 / 斜距
  onNgsoOrbitClassChange(e) {
    const idx = parseInt(e.detail.value, 10);
    const opt = this.data.ngsoOrbitClassOptions[idx];
    if (!opt) return;

    const lp = this.data.linkParams || {};
    // 取上/下行当前仰角（缺省 10°）
    const txElInput = parseFloat(lp.minElevation);
    const rxElInput = parseFloat(lp.rxMinElevation);
    const txEl = (!isNaN(txElInput) && isFinite(txElInput)) ? txElInput : 10;
    const rxEl = (!isNaN(rxElInput) && isFinite(rxElInput)) ? rxElInput : 10;

    // HEO 场景：上行站为远地点高轨（39000km），下行站为近地点低轨（1000km）
    const txH = opt.key === 'HEO' ? 39000 : opt.altitude;
    const rxH = opt.key === 'HEO' ? 1000 : opt.altitude;
    const txRange = slantRangeFromAltitude(txH, txEl);
    const rxRange = slantRangeFromAltitude(rxH, rxEl);

    // 同时写入 altitude 与 slantRange 两组字段，保证切换模式后也有值
    this.setData({
      ngsoOrbitClassIndex: idx,
      ngsoOrbitClass: opt.key,
      'satelliteParams.ngsoOrbitClass': opt.key,
      'linkParams.orbitAltitude': String(txH),
      'linkParams.rxOrbitAltitude': String(rxH),
      'linkParams.slantRange': String(parseFloat(txRange.toFixed(4))),
      'linkParams.rxSlantRange': String(parseFloat(rxRange.toFixed(4)))
    });
    if (app.globalData.satelliteParams) {
      app.globalData.satelliteParams.ngsoOrbitClass = opt.key;
    }
  },

  // 卫星参数输入变化
  onSatelliteParamChange(e) {
    this.disarmSelectAll();
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
    const dataset = (e && e.currentTarget && e.currentTarget.dataset) || {};
    this.setData({
      inputSelectAll: true,
      focusedField: dataset.field || ''
    });
    const focusArea = dataset.focusArea || '';
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
    this.setData({ inputSelectAll: true, focusedField: '' });
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
      // 记录本次键盘会话开始前的阅读位置（切换输入框时保留最初锚点）
      if (this._preFocusScrollTop === null) {
        this._preFocusScrollTop = this._currentScrollTop;
      }
      const visibleHeight = keyboardTop;
      const targetY = visibleHeight * 0.4;
      const scrollDelta = touchY - targetY;
      this._scrollTo(Math.max(0, this._currentScrollTop + scrollDelta));
    }
  },

  // 通过scroll-view的scroll-top属性实现编程式滚动
  // 每次设置不同的值以确保scroll-view响应（相同值不会触发滚动）
  _scrollTo(scrollTop) {
    this._scrollCounter++;
    this.setData({
      contentScrollTop: scrollTop + this._scrollCounter * 0.001
    });
  },

  // 用户开始输入后立即解除全选状态：
  // selection-start/end 若在输入过程中保持激活，后续 setData 重渲染会让
  // 已输入内容被再次全选并被下一个按键覆盖（光标跳动），故首个按键即解除
  disarmSelectAll() {
    if (this.data.inputSelectAll) {
      this.setData({ inputSelectAll: false });
    }
  },

  // 链路参数输入变化
  onLinkParamChange(e) {
    this.disarmSelectAll();
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
    this.disarmSelectAll();
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
    const bandwidthFactor = pickNum(this.data.linkParams.bandwidthFactor, 1.2);
    const modulation = this.data.linkParams.modulation || 'QPSK';
    const fec = parseFractionOrDecimal(this.data.linkParams.fec, 0.75);
    const rsCode = parseFractionOrDecimal(this.data.linkParams.rsCode, 188/204);
    const m = pickNum(this.data.linkParams.m, 1); // 扩频增益
    
    // 获取调制因子
    const modulationFactor = modFactorOf(modulation);
    
    // 根据滚降系数计算符号率: symbolRate = carrierBandwidth / bandwidthFactor
    const symbolRate = Math.round(carrierBandwidth / bandwidthFactor * 1000) / 1000;
    
    // 反推信息速率: infoRate = symbolRate * modulationFactor / m * rsCode * fec
    const infoRate = symbolRate * modulationFactor / m * rsCode * fec;
    
    // 更新信息速率（保留3位小数，去除末尾多余的零）
    const infoRateFormatted = parseFloat(infoRate.toFixed(4)).toString();
    
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
    this.disarmSelectAll();
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
    const m = pickNum(this.data.linkParams.m, 1); // 扩频增益
    
    // 获取调制因子
    const modulationFactor = modFactorOf(modulation);
    
    // 反推信息速率: infoRate = symbolRate * modulationFactor * rsCode * fec / m
    // 推导: symbolRate = ChipRate / modulationFactor
    //       ChipRate = carrierRate * m
    //       carrierRate = infoRate / rsCode / fec
    // 所以: symbolRate = (infoRate / rsCode / fec) * m / modulationFactor
    //       infoRate = symbolRate * modulationFactor / m * rsCode * fec
    const infoRate = symbolRate * modulationFactor / m * rsCode * fec;
    
    // 更新信息速率（保留3位小数，去除末尾多余的零）
    const infoRateFormatted = parseFloat(infoRate.toFixed(4)).toString();
    
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

    // 同步根据经纬度自动填充海拔(P.1511 Earth2014)，数据未就绪时不覆盖现有值
    this.promptElevationEstimation(lon, lat, type);
  },

  // 根据经纬度自动填充海拔(高于平均海平面)
  promptElevationEstimation(lon, lat, type) {
    if (!isElevationReady()) return;
    const result = queryElevation(lat, lon);
    if (!result || !result.success) return;
    const field = type === 'uplink' ? 'altitude' : 'rxAltitude';
    this.setData({
      [`linkParams.${field}`]: result.altitude
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

    modcodList = MODCOD_TABLE_OF[standard] || [];

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
      // 3GPP 一族：铺这张表的物理层骨架，并把第一档的表内序号写进去。
      // 换到 DVB 一族则把 phy 整个撤掉 —— 留着它，下次再切回 3GPP 会拿到上一张表的 PRB 数 /
      // 子载波数（表不同、口径也不同），而界面上看不出这份残留是哪来的。
      updateData['linkParams.phy'] = isNtnStandard(standard)
        ? this._phyForModcod(standard, firstModcod)
        : null;

      app.globalData.noiseRatioMode = firstModcod.noiseRatioMode;
      try {
        wx.setStorageSync('noiseRatioMode', firstModcod.noiseRatioMode);
      } catch (err) {
        console.error('保存噪声比模式失败:', err);
      }
    } else {
      updateData['linkParams.modcodIndex'] = -1;
      updateData['linkParams.phy'] = null;      // 「自定义」没有体制骨架
    }

    this.setData(updateData);
    this.updateRealtimeParams();
  },

  // 选中某一档 MODCOD 时该配的 phy：内置骨架 + 这一行在标准表里的序号。
  // ★ 序号必须从表行的 idx 取，不能从 label 里正则抠 —— 单音表的行是按 I_TBS 升序排的
  //   （I_MCS 1 与 2 的 I_TBS 反着来），按行下标当序号会取到另一档的调制方式。
  _phyForModcod(standard, modcod, prevPhy) {
    const base = NTN_PHY_OF[standard];
    if (!base) return null;
    // 换 MODCOD 不该把用户调好的 PRB 数 / 重复次数清掉，故在同一张表内沿用上一份可继承的字段
    const keep = (prevPhy && typeof prevPhy === 'object') ? prevPhy : null;
    const phy = Object.assign({}, base, keep ? {
      dir: keep.dir, band: keep.band, scs: keep.scs, chBwMHz: keep.chBwMHz, nRb: keep.nRb,
      nSymb: keep.nSymb, nDmrs: keep.nDmrs, nOh: keep.nOh, rateModel: keep.rateModel,
      layers: keep.layers, nTones: keep.nTones, opMode: keep.opMode, iSf: keep.iSf, iRu: keep.iRu,
      nRep: keep.nRep, combLossDb: keep.combLossDb
    } : null);
    // 骨架里定死的三项（体制 / 表 / 单音标志）恒以内置为准，不许被上一份带偏
    phy.kind = base.kind; phy.st = base.st; phy.mcsTable = base.mcsTable; phy.dir = base.dir;
    if (keep && base.kind === 'nr' && base.mcsTable !== 'tp1' && base.mcsTable !== 'tp2') phy.dir = keep.dir || base.dir;
    const idx = (modcod && modcod.idx != null) ? Number(modcod.idx) : 0;
    if (base.kind === 'nr') { phy.mcs = idx; phy.q = (modcod && modcod.modulation === 'BPSK') ? 1 : 2; }
    else phy.iTbs = idx;
    // 门限那一列的目标 BLER：跟着表走，供结果页回显（3GPP 各表恒 10% 首传）
    const meta = NTN_TABLE_META[standard];
    if (meta && meta.bler) phy.blerTarget = meta.bler;
    return ntnPhy.normalizePhy(phy);
  },

  // MODCOD选择变化 — 自动填充各参数
  onModcodChange(e) {
    const index = parseInt(e.detail.value);
    const modcod = this.data.currentModcodList[index];
    if (!modcod) return;

    // 查找调制方式在MODULATION_OPTIONS中的索引
    const modIndex = MODULATION_OPTIONS.findIndex(opt => opt.value === modcod.modulation);

    const standard = this.data.linkParams.dvbStandard;
    this.setData({
      modcodPickerIndex: index,
      'linkParams.modcodIndex': index,
      'linkParams.modulation': modcod.modulation,
      'linkParams.fec': modcod.fec,
      'linkParams.rsCode': modcod.rsCode,
      'linkParams.bandwidthFactor': modcod.bandwidthFactor,
      'linkParams.ebno': modcod.threshold.toFixed(2),
      modulationIndex: modIndex >= 0 ? modIndex : 1,
      noiseRatioMode: modcod.noiseRatioMode,
      // 换档只改表内序号（NR 的 MCS / NB-IoT 的 I_TBS），PRB 数、重复次数等沿用当前这一份
      'linkParams.phy': isNtnStandard(standard)
        ? this._phyForModcod(standard, modcod, this.data.linkParams.phy)
        : null
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

  // ==================== 3GPP NTN 物理层参数面板 ====================
  // 为什么要有这一块：3GPP 的门限是【每资源元素 RE 的信噪比】，噪声带宽取占用带宽
  // B_occ = PRB 数 × 12 × 子载波间隔（NB-IoT 上行 = 子载波数 × 子载波间隔）。DVB 那条链是拿信息
  // 速率除以帧效率反推符号率当噪声带宽 —— 对 OFDM 根本不是一回事。没有这几个参数，门限就无处安放，
  // 只能被当成 Es/N₀ 硬算，整条链错零点几到几个 dB。口径与出处见 utils/ntnPhy.js 文件头。
  // 面板本身不算数：它只负责把 phy 配成一份标准里存在的载波，计算仍在引擎里做。

  // 面板派生态整体重算。散字段（ntnBandIndex、ntnScsIndex…）会有十几个键，且每次都要一一对齐；
  // 集中成一个 ntn 对象，setData 一次写完，界面读 ntn.xxx。
  refreshNtnPanel() {
    const lp = this.data.linkParams || {};
    const on = this.data.noiseRatioMode === 'snr' && isNtnStandard(lp.dvbStandard);
    const phy = on ? ntnPhy.normalizePhy(lp.phy) : null;
    if (!phy) {
      // 选着 3GPP 的标准、门限口径却不是 snr，或者没有物理层参数 —— 这是 v3.8.11 之前存下的档：
      // 那一版把 3GPP 的门限当 Es/N₀、拿 DVB 那条链算，且表数据停在旧版本。
      // 【不自动改】：静默换掉一份存档的门限与算法，用户无从知道自己的结论何时变了。改由这一行
      // 明写出来，重新选一次 MODCOD 即整条载波对齐到本版口径（与仿真平台同一套规矩）。
      const legacy = isNtnStandard(lp.dvbStandard) && this.data.noiseRatioMode !== 'snr';
      this.setData({ ntn: { on: false, legacy: legacy } });
      return;
    }

    const isNr = phy.kind === 'nr';
    const modFactor = modFactorOf(lp.modulation);
    const fecV = this._fecValue(lp.fec);
    const rv = ntnPhy.resolve(lp.phy, modFactor, fecV);
    const bOcc = ntnPhy.occupiedBwKHz(phy);
    const bCh = ntnPhy.channelBwKHz(phy);
    const rate = ntnPhy.infoRateKbps(phy, modFactor, fecV);
    const tbs = ntnPhy.tbsOf(phy, modFactor, fecV);
    const ro = (v) => (v == null || !isFinite(v) ? '—' : String(Math.round(v * 1000) / 1000));

    const ntn = {
      on: true,
      isNr: isNr,
      kindText: isNr ? 'NR' : 'NB-IoT',
      // 变换预编码表只用于 PUSCH（TS 38.214 §6.1.4.1），PDSCH 没有这两张表；NB-IoT 的方向由信道定
      //（NPDSCH 只在下行、NPUSCH 只在上行），两种情况下方向都不是用户能改的东西
      dirLocked: !isNr || phy.mcsTable === 'tp1' || phy.mcsTable === 'tp2',
      dirText: phy.dir === 'ul' ? '上行' : '下行',
      dirIndex: phy.dir === 'ul' ? 1 : 0,
      dirOptions: ['下行', '上行'],
      nRep: phy.nRep,
      combLossDb: phy.combLossDb,
      mcsText: ntnPhy.mcsLabel(lp.phy, 'zh'),
      descText: ntnPhy.describe(lp.phy, 'zh'),
      out: {
        bOcc: ro(bOcc), bCh: ro(bCh), rate: ro(rate),
        tbs: tbs == null ? '—' : String(tbs),
        // 频谱效率按【信道带宽】算，与计算结果里那一项同口径。曾按占用带宽算，于是面板与详细结果
        // 同名两个数（NB-IoT 下行 0.311 vs 0.280），读的人无从判断该信哪个。
        se: (rate != null && bCh > 0) ? (rate / bCh).toFixed(4) : '—',
        error: (rv && rv.error) || ''
      }
    };

    if (isNr) {
      // 频段决定该子载波间隔可选的信道带宽档（TS 38.101-5 Table 5.3.5-1/-2）
      ntn.bandOptions = Object.keys(ntnPhy.NTN_BANDS).map((k) => ({
        value: k, label: k + '（' + (ntnPhy.NTN_BANDS[k].fr === 1 ? 'FR1' : 'FR2') + '）'
      }));
      ntn.bandOptions.unshift({ value: '', label: '不指定' });
      const bi = ntn.bandOptions.findIndex((o) => o.value === (phy.band || ''));
      ntn.bandIndex = bi >= 0 ? bi : 0;
      // 子载波间隔按频段所在的 FR 给：FR1 是 15/30/60，FR2 是 60/120。不指定频段时全给。
      const fr = ntnPhy.NTN_BANDS[phy.band] ? ntnPhy.NTN_BANDS[phy.band].fr : 0;
      const scsList = fr === 1 ? [15, 30, 60] : (fr === 2 ? [60, 120] : [15, 30, 60, 120]);
      ntn.scsOptions = scsList.map((v) => ({ value: v, label: String(v) }));
      const si = scsList.indexOf(phy.scs);
      ntn.scsIndex = si >= 0 ? si : 0;
      ntn.scsLocked = false;
      // 上行把「只用于下行」的档滤掉（TS 38.101-5 Table 5.3.5-1 的 NOTE 3）
      const steps = ntnPhy.nrBwSteps(phy).filter((x) => !(x.dlOnly && phy.dir === 'ul'));
      ntn.bwSteps = steps;
      ntn.bwOptions = steps.map((x) => ({
        value: x.mhz,
        label: x.mhz + ' MHz · ' + x.nRb + ' PRB' + (x.optional ? '（本版可选）' : '')
      }));
      ntn.bwOptions.unshift({ value: null, label: '不指定（直填 PRB）' });
      const wi = ntn.bwOptions.findIndex((o) => o.value === phy.chBwMHz);
      ntn.bwIndex = wi >= 0 ? wi : 0;
      ntn.nRb = phy.nRb;
      ntn.nSymb = phy.nSymb;
      ntn.nDmrs = phy.nDmrs;
      ntn.nOh = phy.nOh;
      ntn.layers = phy.layers;
      ntn.rateModelOptions = [
        { value: 'tbs', label: 'TBS（38.214 §5.1.3.2）' },
        { value: 'oh38306', label: '近似式（38.306 §4.1.2）' }
      ];
      ntn.rateModelIndex = phy.rateModel === 'oh38306' ? 1 : 0;
      ntn.isTbs = phy.rateModel !== 'oh38306';
    } else {
      // 单音表锁死 1 个子载波、多音表只有 3/6/12（TS 36.213 §16.5.1.2 规定 N_sc^RU > 1 时恒 QPSK）；
      // 下行 NPDSCH 的载波结构是定死的 12 × 15 kHz = 180 kHz（TS 36.211 §10.2.3），不给选
      const toneList = phy.dir !== 'ul' ? [12]
        : (phy.st === true ? [1] : (phy.st === false ? [3, 6, 12] : [1, 3, 6, 12]));
      ntn.toneOptions = toneList.map((v) => ({ value: v, label: String(v) }));
      const ti = toneList.indexOf(phy.nTones);
      ntn.toneIndex = ti >= 0 ? ti : 0;
      ntn.toneLocked = toneList.length < 2;
      // 3.75 kHz 只存在于上行 NPUSCH 单音（TS 36.211 §10.1.2）
      const scsList = (phy.dir === 'ul' && phy.st !== false) ? [15, 3.75] : [15];
      ntn.scsOptions = scsList.map((v) => ({ value: v, label: String(v) }));
      const si2 = scsList.indexOf(phy.scs);
      ntn.scsIndex = si2 >= 0 ? si2 : 0;
      ntn.scsLocked = scsList.length < 2;
      // 部署模式只改下行：带内部署的 NPDSCH 前 3 个符号让给 LTE 控制区并被 CRS 打孔，
      // 每传输块的编码比特数从 304 掉到 208，I_TBS 也只到 10（TS 36.213 §16.4.1.5.1）
      ntn.opModeOptions = [
        { value: 'standalone', label: '独立部署' },
        { value: 'guardband', label: '保护带部署' },
        { value: 'inband', label: '带内部署' }
      ];
      const oi = ntn.opModeOptions.findIndex((o) => o.value === phy.opMode);
      ntn.opModeIndex = oi >= 0 ? oi : 0;
      ntn.opModeOn = phy.dir !== 'ul';
      // 一个传输块摊在几个子帧（下行 I_SF）/ 几个资源单元（上行 I_RU）。越过本行上限的档不给选：
      // 那些格子在 TS 36.213 的表里是空的（该 I_TBS 根本没有那么大的传输块）。
      const mx = ntnPhy.nbMaxSfIdx(phy);
      const cnt = ntnPhy.NB_SF_COUNT;
      const lim = mx >= 0 ? mx : cnt.length - 1;
      ntn.spanLabel = phy.dir === 'ul' ? 'RU 数' : '子帧数';
      ntn.spanOptions = cnt.slice(0, lim + 1).map((n, i) => ({ value: i, label: String(n) }));
      const cur = phy.dir === 'ul' ? phy.iRu : phy.iSf;
      ntn.spanIndex = cur <= lim ? cur : 0;
      ntn.iTbs = phy.iTbs;
    }
    // 信息速率是全小程序的存储字段（历史记录、配置、导出报表都读它）：3GPP 行由物理层参数算出来，
    // 这里同步写回，免得「面板上写着 768 kbps、历史记录里还是上一次的 2048」。
    // ★ 只在真的变了才写：否则每次实时刷新都 setData 一次，正在编辑的输入框会被顶着复位。
    const patch = { ntn: ntn };
    if (rate != null && isFinite(rate)) {
      const v = Math.round(rate * 1000) / 1000;
      if (Number(lp.infoRate) !== v) patch['linkParams.infoRate'] = v;
    }
    this.setData(patch);
  },

  // FEC 码率的数值（面板算 TBS 时要用）。走与引擎同一套解析，免得「3/4」在面板里被当成 3
  _fecValue(raw) {
    const t = String(raw == null ? '' : raw).trim();
    if (!t) return 0.75;
    const m = t.match(/^([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)$/);
    if (m) { const d = parseFloat(m[2]); return d > 0 ? parseFloat(m[1]) / d : 0.75; }
    const v = parseFloat(t);
    return isFinite(v) && v > 0 ? v : 0.75;
  },

  // phy 整体替换而不是就地改字段：linkParams 可能是从存档读出来的普通对象，
  // 就地改属性在部分路径上不会被 setData 的差量比较认出来，界面读数不跟着动。
  _setPhy(patch) {
    const cur = (this.data.linkParams && typeof this.data.linkParams.phy === 'object' && this.data.linkParams.phy)
      ? this.data.linkParams.phy : {};
    this.setData({ 'linkParams.phy': Object.assign({}, cur, patch) }, () => {
      this.updateRealtimeParams();   // 它的第一行就是 refreshNtnPanel
    });
  },

  // 换方向 = 换分配对象：下行一条载波就是整个 NR 载波，上行是一个终端本次的分配。
  // 原样留着 25 PRB / 5 MHz 切到上行，等于把一个终端的分配报成整载波（转发器占用比虚高 27 倍）。
  onNtnDirChange(e) {
    const dir = Number(e.detail.value) === 1 ? 'ul' : 'dl';
    const phy = ntnPhy.normalizePhy(this.data.linkParams.phy);
    // ★ 方向被锁死时直接不受理。界面上这一格本就不是 picker（见 ntn.dirLocked），但归一化只保证
    //   【算的时候】按上行算，存下来的 dir 仍是写进去的那个 —— 若在这里照常受理，下面那段「换方向
    //   重铺分配」会把用户的 1 PRB 上行分配改成整载波的 15 PRB，而面板上还显示「上行」，看不出哪里变了。
    if (!phy || phy.kind !== 'nr' || phy.mcsTable === 'tp1' || phy.mcsTable === 'tp2') return;
    if (phy.dir === dir) { this._setPhy({ dir: dir }); return; }
    if (dir === 'ul') { this._setPhy({ dir: dir, chBwMHz: null, nRb: 1, nSymb: 14 }); return; }
    const first = ntnPhy.nrBwSteps(Object.assign({}, phy, { dir: dir }))[0] || null;
    this._setPhy(first ? { dir: dir, chBwMHz: first.mhz, nRb: first.nRb, nSymb: 12 } : { dir: dir, nSymb: 12 });
  },

  // 换频段：原来那一档信道带宽在新频段可能根本没有（n256 的 20 MHz 到 n254 就没了），
  // 就地落到新频段的档 —— 留着不动，配出来的是标准里不存在的载波。
  onNtnBandChange(e) {
    const opt = this.data.ntn.bandOptions[Number(e.detail.value)];
    if (!opt) return;
    const band = opt.value;
    const phy = ntnPhy.normalizePhy(this.data.linkParams.phy);
    if (!phy) { this._setPhy({ band: band }); return; }
    // 换 FR 会连子载波间隔一起换（FR2 没有 15/30 kHz），先把 SCS 归到新 FR 的档内
    const fr = ntnPhy.NTN_BANDS[band] ? ntnPhy.NTN_BANDS[band].fr : 0;
    const scsList = fr === 1 ? [15, 30, 60] : (fr === 2 ? [60, 120] : [15, 30, 60, 120]);
    const scs = scsList.indexOf(phy.scs) >= 0 ? phy.scs : scsList[0];
    const probe = Object.assign({}, phy, { band: band, scs: scs });
    const next = ntnPhy.nrBwSteps(probe).filter((x) => !(x.dlOnly && phy.dir === 'ul'));
    if (phy.chBwMHz == null) { this._setPhy({ band: band, scs: scs }); return; }
    const pick = next.find((x) => x.mhz === phy.chBwMHz) || next[0] || null;
    this._setPhy(pick ? { band: band, scs: scs, chBwMHz: pick.mhz, nRb: pick.nRb } : { band: band, scs: scs });
  },

  // 换子载波间隔 = 换一张档位表：同一个 10 MHz 在 15/30/60 kHz 下的 PRB 数不同，且未必都有这一档
  onNtnScsChange(e) {
    const opt = this.data.ntn.scsOptions[Number(e.detail.value)];
    if (!opt) return;
    const scs = Number(opt.value);
    const phy = ntnPhy.normalizePhy(this.data.linkParams.phy);
    if (!phy || phy.kind !== 'nr') {
      // NB-IoT：3.75 kHz 只有单子载波一种配置
      this._setPhy(scs === 3.75 ? { scs: scs, nTones: 1 } : { scs: scs });
      return;
    }
    const patch = { scs: scs };
    if (phy.chBwMHz != null) {
      const next = ntnPhy.nrBwSteps(Object.assign({}, phy, { scs: scs })).filter((x) => !(x.dlOnly && phy.dir === 'ul'));
      const pick = next.find((x) => x.mhz === phy.chBwMHz) || next[0] || null;
      if (pick) { patch.chBwMHz = pick.mhz; patch.nRb = pick.nRb; }
    }
    this._setPhy(patch);
  },

  // 下行按「信道带宽 + 子载波间隔」查表自动填 PRB 数；选「不指定」则由用户直填（上行的常态）
  onNtnBwChange(e) {
    const opt = this.data.ntn.bwOptions[Number(e.detail.value)];
    if (!opt) return;
    if (opt.value == null) { this._setPhy({ chBwMHz: null }); return; }
    const hit = (this.data.ntn.bwSteps || []).find((x) => x.mhz === opt.value);
    this._setPhy({ chBwMHz: opt.value, nRb: hit ? hit.nRb : this.data.ntn.nRb });
  },

  onNtnToneChange(e) {
    const opt = this.data.ntn.toneOptions[Number(e.detail.value)];
    if (opt) this._setPhy({ nTones: Number(opt.value) });
  },

  onNtnOpModeChange(e) {
    const opt = this.data.ntn.opModeOptions[Number(e.detail.value)];
    if (opt) this._setPhy({ opMode: opt.value });
  },

  onNtnSpanChange(e) {
    const opt = this.data.ntn.spanOptions[Number(e.detail.value)];
    if (!opt) return;
    const ul = this.data.ntn.dirText === '上行';
    this._setPhy(ul ? { iRu: Number(opt.value) } : { iSf: Number(opt.value) });
  },

  onNtnRateModelChange(e) {
    const opt = this.data.ntn.rateModelOptions[Number(e.detail.value)];
    if (opt) this._setPhy({ rateModel: opt.value });
  },

  // 数字输入框统一入口（PRB 数 / 符号数 / DMRS / 其他开销 / 层数 / 重复次数 / 合并损失）。
  // ★ 首行必须先解除全选，否则下一次 setData 会把光标连同选区一起复位（见 inputSelectAll 机制）
  onNtnNumInput(e) {
    this.disarmSelectAll();
    const field = e.currentTarget.dataset.field;
    const raw = e.detail.value;
    if (!field) return;
    // 空串不写回：写回会被 normalizePhy 归成缺省值，用户正在删字就被顶回一个数，删不动
    if (raw === '' || raw === '-') { this.setData({ ['ntn.' + field]: raw }); return; }
    const v = parseFloat(raw);
    if (!isFinite(v)) return;
    this._setPhy({ [field]: v });
  },


  // FEC码率输入处理（支持分数和小数，保持原始输入格式）
  onFecInput(e) {
    this.disarmSelectAll();
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
    this.disarmSelectAll();
    let value = e.detail.value.trim();

    if (this.data.rsCodeMode === 'spectral') {
      // 频谱效率模式：允许直接输入频谱效率，并反推帧效率供实际计算使用
      const se = parseFloat(value);
      if (!isNaN(se) && se > 0) {
        const modulation = this.data.linkParams.modulation || 'QPSK';
        const modulationFactor = modFactorOf(modulation);
        const fec = parseFractionOrDecimal(this.data.linkParams.fec, 0.75);
        const bandwidthFactor = pickNum(this.data.linkParams.bandwidthFactor, 1.2);
        const m = pickNum(this.data.linkParams.m, 1);
        const denominator = modulationFactor * fec;

        if (denominator > 0 && isFinite(denominator)) {
          const rsCode = se * bandwidthFactor * m / denominator;
          if (isFinite(rsCode) && rsCode >= 0) {
            this.setData({
              'linkParams.rsCode': rsCode.toFixed(6),
              'realtimeParams.spectralEfficiency': value
            });
            // 跳过频谱效率回写，避免覆盖用户正在输入的原始值导致闪烁
            this.updateRealtimeParams({ skipSpectralEfficiency: true });
            return;
          }
        }
      }

      // 保留输入中的中间态（如空字符串、正在输入小数点）
      this.setData({
        'realtimeParams.spectralEfficiency': value
      });
      return;
    }

    // 帧效率模式：保持原始输入值（分数或小数），计算时后台解析
    this.setData({
      'linkParams.rsCode': value
    });

    this.updateRealtimeParams();
  },

  // 切换帧效率/频谱效率显示模式
  toggleRsCodeMode() {
    const currentMode = this.data.rsCodeMode;
    const newMode = currentMode === 'fraction' ? 'spectral' : 'fraction';

    if (newMode === 'spectral') {
      // 切换到频谱效率：计算当前帧效率对应的频谱效率并显示
      const modulation = this.data.linkParams.modulation || 'QPSK';
      const modulationFactor = modFactorOf(modulation);
      const fec = parseFractionOrDecimal(this.data.linkParams.fec, 0.75);
      const rsCode = parseFractionOrDecimal(this.data.linkParams.rsCode, 188/204);
      const bandwidthFactor = pickNum(this.data.linkParams.bandwidthFactor, 1.2);
      const m = pickNum(this.data.linkParams.m, 1);
      const se = modulationFactor * fec * rsCode / (bandwidthFactor * m);
      this.setData({
        rsCodeMode: newMode,
        'realtimeParams.spectralEfficiency': isNaN(se) ? '' : se.toFixed(4)
      });
    } else {
      // 切换回帧效率：linkParams.rsCode 已保存真实帧效率，直接切回即可
      this.setData({ rsCodeMode: newMode });
    }

    wx.vibrateShort({ type: 'light' });
  },

  // 切换Eb/N0和Es/N0
  toggleEbnoEsno() {
    const currentMode = this.data.noiseRatioMode;
    // ★ 3GPP 的 snr 行不给切：门限是每资源元素信噪比，噪声带宽由 phy 的占用带宽定；切到 Eb/N₀ 会
    //   拿 DVB 那个组合效率 k 去换算（k 是按符号率反推的，对 OFDM 不成立），换出来的数看着像模像样
    //   却对不上任何一份厂家表。要改口径请先把标准换回 DVB 或「自定义」。
    if (currentMode === 'snr') {
      wx.showToast({ title: '3GPP 门限按每资源元素 SNR 定，不换算', icon: 'none', duration: 2400 });
      return;
    }
    const newMode = currentMode === 'ebno' ? 'esno' : 'ebno';
    
    // 如果有值，进行转换
    const currentValue = parseFloat(this.data.linkParams.ebno);
    if (!isNaN(currentValue) && this.data.linkParams.modulation) {
      let convertedValue = currentValue;
      
      // 从常量中获取调制方式的比特数（调制因子）
      const modulation = this.data.linkParams.modulation;
      const modulationFactor = modFactorOf(modulation);
      
      // 获取FEC码率、帧效率、扩频增益（支持分数格式）
      const fec = parseFractionOrDecimal(this.data.linkParams.fec, 0.75);
      const rsCode = parseFractionOrDecimal(this.data.linkParams.rsCode, 188/204);
      const m = pickNum(this.data.linkParams.m, 1.0);
      
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
        'linkParams.ebno': String(parseFloat(convertedValue.toFixed(4)))
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
      
      const response = this.calculateLinkBudget(
        this._engineSatParams(),
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

      // 非打扰式完成反馈：轻震动 + 结果区短暂高亮，不弹任何遮挡层
      wx.vibrateShort({ type: 'light' });
      if (this._resultsFlashTimer) clearTimeout(this._resultsFlashTimer);
      this.setData({ resultsFlash: true });
      this._resultsFlashTimer = setTimeout(() => {
        this.setData({ resultsFlash: false });
      }, 700);
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
      
      const response = this.calculateLinkBudget(
        this._engineSatParams(),
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
      results: results
    });
    // 计算完成后不再自动滚动到结果区域
  },

  // 检查仰角警告
  checkElevationWarnings(results) {
    const empty = { tx: null, rx: null };
    // NGSO 模式下仰角由用户直接输入（最低仰角），不做提醒
    if (this.data.orbitType === 'NGSO') {
      this.setData({ elevationWarningInfo: empty });
      return;
    }

    let tx = null;
    let rx = null;

    // 检查发信站仰角
    if (results.elevationValidation && results.elevationValidation.level !== 'ok') {
      const v = results.elevationValidation;
      tx = {
        level: v.level,
        message: v.message,
        elevation: results.elevationResult  // 计算得出的仰角值（字符串，如 "5.23"）
      };
    }

    // 检查收信站仰角
    if (results.rxElevationValidation && results.rxElevationValidation.level !== 'ok') {
      const v = results.rxElevationValidation;
      rx = {
        level: v.level,
        message: v.message,
        elevation: results.rxElevationResult
      };
    }

    this.setData({ elevationWarningInfo: { tx, rx } });
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
      // 构造轨道类型标记，用于弹窗标题，和配置列表保持一致
      const _orbitType = this.data.orbitType || 'GEO';
      const _ngsoClass = this.data.ngsoOrbitClass || 'LEO';
      const _orbitTag = _orbitType === 'NGSO' ? `[${_ngsoClass}]` : '[GEO]';
      // 如果正在编辑现有配置，询问用户是更新还是另存为
      wx.showActionSheet({
        itemList: [`更新 ${_orbitTag} "${editingConfigName}"`, '另存为新配置', '放弃更改'],
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
    const satellite = this.data.satellites[satelliteIndex];
    const satelliteName = encodeURIComponent(satellite ? satellite.name : '');
    wx.navigateTo({
      url: `/pages/satellite-coverage/satellite-coverage?satelliteIndex=${satelliteIndex}&satelliteName=${satelliteName}`
    });
  },

  // 跳转到星间链路 ISL 可视化页面（复用全局参数）
  goToISLVisual() {
    this.setData({ showVisualPopup: false });
    // 确保最新参数写入全局，供 ISL 页面读取
    this.saveLinkParams();
    app.globalData.orbitType = this.data.orbitType || 'GEO';
    app.globalData.ngsoOrbitClass = this.data.ngsoOrbitClass || '';
    app.globalData.satelliteParams = {
      ...this.data.satelliteParams,
      orbitType: this.data.orbitType || 'GEO',
      ngsoOrbitClass: this.data.orbitType === 'NGSO' ? (this.data.ngsoOrbitClass || 'LEO') : ''
    };
    wx.navigateTo({
      url: '/pages/isl-visual/isl-visual'
    });
  },

  // 跳转到星座地图页面（从云存储读 TLE，前端 SGP4 算当前星位）
  goToConstellationMap() {
    this.setData({ showVisualPopup: false });
    wx.navigateTo({
      url: '/pages/constellation-map/constellation-map'
    });
  },

  // 跳转到频率计划页面（只读；内容一律从仿真平台按密钥导入，本地不新建不编辑）
  goToFreqPlan() {
    this.setData({ showVisualPopup: false });
    wx.navigateTo({
      url: '/pages/freq-plan/freq-plan'
    });
  },

  // 仿真平台绑定（认证码 / 已连接的平台 / 立即同步）。
  // ★ pages/settings 此前在 app.json 里注册着、却没有任何一处导航到它 —— 是个够不着的孤儿页。
  //   绑定卡放在它最上面，这里是它唯一的入口。
  goToSettings() {
    this.setData({ showVisualPopup: false });
    wx.navigateTo({
      url: '/pages/settings/settings'
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
    const sat = this.data.satellites[satIndex];
    const satelliteName = encodeURIComponent(sat ? sat.name : '');
    wx.navigateTo({
      url: `/pages/satellite-coverage/satellite-coverage?satelliteIndex=${satIndex}&satelliteName=${satelliteName}&pickMode=1&pickSource=azElTool`
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
      sunOutageResultReady: false
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

  toggleSunOutageTimeMode() {
    this.setData({
      sunOutageTimeMode: this.data.sunOutageTimeMode === 'bjt' ? 'gmt' : 'bjt'
    });
  },

  goToMapPickForSunOutage() {
    const satIndex = this.data.sunOutageSatelliteIndex || 0;
    const sat = this.data.satellites[satIndex];
    const satelliteName = encodeURIComponent(sat ? sat.name : '');
    wx.navigateTo({
      url: `/pages/satellite-coverage/satellite-coverage?satelliteIndex=${satIndex}&satelliteName=${satelliteName}&pickMode=1&pickSource=sunOutageTool`
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
        sunOutageResult: result
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
    app.globalData.orbitType = this.data.orbitType || 'GEO';
    app.globalData.satelliteParams = {
      ...this.data.satelliteParams,
      orbitType: this.data.orbitType || 'GEO',
      ngsoOrbitClass: this.data.orbitType === 'NGSO' ? (this.data.ngsoOrbitClass || 'LEO') : ''
    };
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

    // 跳转到报告页面（链路瀑布 / 链路预算表）
    wx.navigateTo({
      url: `/pages/results-detail/results-detail?linkNum=${this.data.currentLinkNum}`
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
    this.disarmSelectAll();
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
        const results = this.calculateLinkBudget(
          this._engineSatParams(),
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
  updateRealtimeParams(options) {
    // 3GPP 物理层面板跟着这里走：改标准、改 MODCOD、载入配置、回放历史、导入分享包 —— 二十来处
    // 改完参数最后都会调到这里，逐处补一行 refreshNtnPanel 迟早会漏一处（漏掉的那处界面读数
    // 停在上一份，用户看着 12 PRB 而实际按 25 PRB 在算）。集中在入口调一次，非 3GPP 时它立刻返回。
    this.refreshNtnPanel();
    const skipSpectralEfficiency = !!(options && options.skipSpectralEfficiency);
    try {
      // 如果是符号率优先模式，先根据当前符号率反推信息速率和载波带宽
      if (this.data.rateCalcMode === 'symbolRate') {
        const currentSymbolRate = parseFloat(this.data.realtimeParams.symbolRate);
        
        // 只有当符号率是有效数值时才反推
        if (!isNaN(currentSymbolRate) && currentSymbolRate > 0) {
          const modulation = this.data.linkParams.modulation || 'QPSK';
          const fec = parseFractionOrDecimal(this.data.linkParams.fec, 0.75);
          const rsCode = parseFractionOrDecimal(this.data.linkParams.rsCode, 188/204);
          const m = pickNum(this.data.linkParams.m, 1);
          const bandwidthFactor = pickNum(this.data.linkParams.bandwidthFactor, 1.2);
          const modulationFactor = modFactorOf(modulation);
          
          // 反推信息速率: infoRate = symbolRate * modulationFactor / m * rsCode * fec
          const infoRate = currentSymbolRate * modulationFactor / m * rsCode * fec;
          const infoRateFormatted = parseFloat(infoRate.toFixed(4)).toString();
          
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
          const m = pickNum(this.data.linkParams.m, 1);
          const bandwidthFactor = pickNum(this.data.linkParams.bandwidthFactor, 1.2);
          const modulationFactor = modFactorOf(modulation);
          
          // 根据滚降系数计算符号率: symbolRate = carrierBandwidth / bandwidthFactor
          const symbolRate = Math.round(currentBandwidth / bandwidthFactor * 1000) / 1000;
          
          // 反推信息速率: infoRate = symbolRate * modulationFactor / m * rsCode * fec
          const infoRate = symbolRate * modulationFactor / m * rsCode * fec;
          const infoRateFormatted = parseFloat(infoRate.toFixed(4)).toString();
          
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
      const results = this.calculateLinkBudget(this._engineSatParams(), linkParamsWithMargin);
      
      if (results.success) {
        // 频谱效率始终从当前 rsCode + 调制/FEC/扩频/滚降参数实时计算
        const _modulation = this.data.linkParams.modulation || 'QPSK';
        const _modulationFactor = modFactorOf(_modulation);
        const _fec = parseFractionOrDecimal(this.data.linkParams.fec, 0.75);
        const _rsCode = parseFractionOrDecimal(this.data.linkParams.rsCode, 188/204);
        const _bandwidthFactor = pickNum(this.data.linkParams.bandwidthFactor, 1.2);
        const _m = pickNum(this.data.linkParams.m, 1);
        const _se = _modulationFactor * _fec * _rsCode / (_bandwidthFactor * _m);
        const spectralEfficiencyUpdate = skipSpectralEfficiency ? {} : {
          'realtimeParams.spectralEfficiency': isNaN(_se) ? '' : _se.toFixed(4)
        };

        // 根据模式决定是否更新符号率和载波带宽
        if (this.data.rateCalcMode === 'symbolRate') {
          // 符号率优先模式：保持符号率和载波带宽不变，只更新其他参数
          this.setData(Object.assign({
            'realtimeParams.stationEIRP': results.data.stationEIRPResult,
            'realtimeParams.paRecommendation': results.data.paRecommendation,
            'realtimeParams.gOverTe': results.data.gOverTeResult
          }, spectralEfficiencyUpdate));
        } else if (this.data.rateCalcMode === 'carrierBandwidth') {
          // 载波带宽优先模式：保持载波带宽不变，符号率由带宽反推，只更新其他参数
          this.setData(Object.assign({
            'realtimeParams.stationEIRP': results.data.stationEIRPResult,
            'realtimeParams.paRecommendation': results.data.paRecommendation,
            'realtimeParams.gOverTe': results.data.gOverTeResult
          }, spectralEfficiencyUpdate));
        } else {
          // 信息速率优先模式：正常更新所有参数包括符号率
          this.setData(Object.assign({
            'realtimeParams.stationEIRP': results.data.stationEIRPResult,
            'realtimeParams.paRecommendation': results.data.paRecommendation,
            'realtimeParams.gOverTe': results.data.gOverTeResult,
            'realtimeParams.carrierBandwidth': results.data.allocBandwidthResult,
            'realtimeParams.symbolRate': results.data.symbolRateResult
          }, spectralEfficiencyUpdate));
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

  // 内容区点击：余量弹窗为非模态，点击弹窗外侧收起（滚动拖拽不触发 tap，不受影响）
  onContentTap() {
    if (this.data.showMarginPopup) {
      this.hideMarginPanel();
    }
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
    this.disarmSelectAll();
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
        
        const results = this.calculateLinkBudget(
          this._engineSatParams(),
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
          // 反推结果已实时显示在悬浮胶囊的余量位上，轻震动确认即可，不弹居中提示
          wx.vibrateShort({ type: 'light' });
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
        
        const results = this.calculateLinkBudget(
          this._engineSatParams(),
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

      // 获取并递增全局序号计数器
      let seqCounter = wx.getStorageSync('historySeqCounter') || 0;
      seqCounter += 1;
      wx.setStorageSync('historySeqCounter', seqCounter);
      
      // 创建历史记录条目
      const record = {
        id: Date.now(),
        seqNo: seqCounter,
        time: this.formatDateTime(new Date()),
        satelliteName: this.data.satelliteParams.satelliteName || '未命名',
        orbitPosition: this.data.satelliteParams.orbitPosition,
        frequencyBand: this.data.satelliteParams.frequencyBand,
        orbitType: this.data.orbitType || 'GEO',
        ngsoOrbitClass: this.data.orbitType === 'NGSO' ? (this.data.ngsoOrbitClass || '') : '',
        txLocation: this.data.linkParams.earthStationLocation || '发信站',
        rxLocation: this.data.linkParams.rxEarthStationLocation || '收信站',
        infoRate: this.data.linkParams.infoRate,
        modulation: this.data.linkParams.modulation,
        margin: this.data.marginValue,
        paRecommendation: results.paRecommendation,
        paRecommendationdB: results.paRecommendationdBResult,
        linkmargin: results.linkmargin,
        carrierTotalCN: results.carrierTotalCN,
        thresholdCN: results.thresholdCN,
        bandwidthPct: parseFloat(results.bandwidthUsageRatio).toFixed(3),
        powerPct: parseFloat(results.powerUsageRatio).toFixed(3),
        stationEIRP: results.stationEIRPResult,
        symbolRate: results.symbolRateResult,
        calcMode: this.data.calcMode,
        inputPaPower: this.data.inputPaPower,
        // 保存完整参数用于加载
        satelliteParams: JSON.parse(JSON.stringify(this.data.satelliteParams)),
        linkParams: {
          ...JSON.parse(JSON.stringify(this.data.linkParams)),
          calcMode: this.data.calcMode,
          inputPaPower: this.data.inputPaPower,
          margin: this.data.marginValue,
          rateCalcMode: this.data.rateCalcMode,
          symbolRate: this.data.realtimeParams.symbolRate,
          carrierBandwidth: this.data.realtimeParams.carrierBandwidth,
          // 门限口径也写进这一条链路（记录级的 noiseRatioMode 照旧留着，供旧版本读）：
          // 回放时这份 linkParams 会被整块塞进全局槽位，槽里没有口径的话，下一次 onShow
          // 按 _modeOfLink 取到的就是上一条链路的口径，而门限数字已经是这一条的了。
          noiseRatioMode: this.data.noiseRatioMode,
          // phy 已随上面的深拷贝带过来，这里不用再写一遍
        },
        calculationResults: JSON.parse(JSON.stringify(results)),
        marginValue: this.data.marginValue,
        noiseRatioMode: this.data.noiseRatioMode
      };
      
      // 添加到开头
      records.unshift(record);
      
      // 只保留最近50条
      if (records.length > 50) {
        records = records.slice(0, 50);
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

  // 构建历史记录导出configs（含轨道类型标签）
  _buildHistoryExportConfigs(recordsWithResults) {
    const historyRecords = this.data.historyRecords;
    return recordsWithResults.map((record, fallbackIndex) => {
      const historyPos = historyRecords.findIndex(r => r.id === record.id);
      const seqLabel = historyPos >= 0 ? historyPos + 1 : fallbackIndex + 1;
      const orbitLabel = record.orbitType === 'NGSO'
        ? `${record.ngsoOrbitClass || 'LEO'}/NGSO`
        : 'GEO';
      return {
        configName: `[${seqLabel}] ${record.satelliteName}[${orbitLabel}]_${record.time}`,
        satelliteParams: record.satelliteParams,
        linkParams: { 1: record.linkParams },
        calculationResults: { 1: record.calculationResults },
        noiseRatioMode: record.noiseRatioMode || 'ebno'
      };
    });
  },

  // 历史记录导出入口：点 Word/Excel/PDF 后选择「普通版（参数对比）」或「专业版（链路预算瀑布）」
  exportHistoryWord() { this._chooseHistoryExport('word'); },
  exportHistoryExcel() { this._chooseHistoryExport('excel'); },
  exportHistoryPDF() { this._chooseHistoryExport('pdf'); },

  // 取选中且含计算结果的记录；无选择/无可导出数据时给出提示并返回 null
  _getSelectedHistoryRecords() {
    const { selectedHistoryIds, historyRecords } = this.data;
    if (selectedHistoryIds.length === 0) {
      wx.showToast({ title: '请先选择记录', icon: 'none' });
      return null;
    }
    const selectedRecords = selectedHistoryIds.map(id => historyRecords.find(r => r.id === id)).filter(Boolean);
    const recordsWithResults = selectedRecords.filter(r => r.calculationResults);
    if (recordsWithResults.length === 0) {
      wx.showModal({
        title: '无法导出',
        content: '选中的历史记录没有计算结果数据（旧版记录不支持导出，请重新计算后再试）',
        showCancel: false
      });
      return null;
    }
    return recordsWithResults;
  },

  // 弹出版式选择：普通版 = 参数对比表（generateReport）；专业版 = 链路预算瀑布报告（exportLinkBudget）
  _chooseHistoryExport(format) {
    const recordsWithResults = this._getSelectedHistoryRecords();
    if (!recordsWithResults) return;
    wx.showActionSheet({
      itemList: ['普通版（参数对比）', '专业版（链路预算瀑布）'],
      success: (res) => {
        if (res.tapIndex === 0) this._exportHistoryStandard(format, recordsWithResults);
        else if (res.tapIndex === 1) this._exportHistoryPro(format, recordsWithResults);
      }
    });
  },

  // 打开生成的文档（共用：下载 → openDocument → 失败兜底弹窗）
  async _openExportedDoc(fileID, fileName, fileType) {
    const downloadRes = await wx.cloud.downloadFile({ fileID });
    if (!downloadRes.tempFilePath) throw new Error('文件下载失败');
    wx.hideLoading();
    wx.openDocument({
      filePath: downloadRes.tempFilePath,
      showMenu: true,
      fileType,
      success: () => {
        wx.showToast({ title: '点击右上角可转发', icon: 'none', duration: 3000 });
      },
      fail: (err) => {
        console.error('打开文档失败:', err);
        wx.showModal({
          title: '导出成功',
          content: `文件已生成\n\n文件名: ${fileName}\n\n请点击右上角菜单转发或保存`,
          showCancel: false
        });
      }
    });
  },

  // 普通版：参数对比表（保持原行为，走 generateReport）
  async _exportHistoryStandard(format, recordsWithResults) {
    const cloudFormat = format === 'excel' ? 'excel-params' : format;
    const fileType = format === 'word' ? 'docx' : (format === 'excel' ? 'xlsx' : 'pdf');
    const storageKey = { word: 'lastHistoryWordFileID', excel: 'lastHistoryExcelFileID', pdf: 'lastHistoryPDFFileID' }[format];
    const loadingTitle = { word: '生成Word中...', excel: '生成Excel参数文档...', pdf: '生成PDF中...' }[format];

    wx.showLoading({ title: loadingTitle, mask: true });
    try {
      const configs = this._buildHistoryExportConfigs(recordsWithResults);
      const oldFileID = wx.getStorageSync(storageKey) || null;
      const res = await wx.cloud.callFunction({
        name: 'generateReport',
        data: {
          configs,
          format: cloudFormat,
          lang: 'zh',
          compareMode: cloudFormat === 'excel-params' && recordsWithResults.length > 1,
          oldFileID
        }
      });

      if (!res.result || !res.result.success) {
        throw new Error(res.result?.error || '云函数返回错误');
      }
      wx.setStorageSync(storageKey, res.result.fileID);
      await this._openExportedDoc(res.result.fileID, res.result.fileName, fileType);
    } catch (error) {
      console.error('导出历史(普通版)失败:', error);
      wx.hideLoading();
      wx.showModal({ title: '导出失败', content: error.message || '无法导出，请稍后重试', showCancel: false });
    }
  },

  // 专业版：链路预算瀑布报告（走 exportLinkBudget，多选→多链路对比 + 逐链路明细）
  async _exportHistoryPro(format, recordsWithResults) {
    const fileType = format === 'word' ? 'docx' : (format === 'excel' ? 'xlsx' : 'pdf');
    const storageKey = { word: 'lastHistoryProWordFileID', excel: 'lastHistoryProExcelFileID', pdf: 'lastHistoryProPdfFileID' }[format];
    const loadingTitle = { word: '生成 Word…', excel: '生成 Excel…', pdf: '生成 PDF…' }[format];

    wx.showLoading({ title: loadingTitle, mask: true });
    try {
      const links = this._buildHistoryProLinks(recordsWithResults);
      const oldFileID = wx.getStorageSync(storageKey) || null;
      const res = await wx.cloud.callFunction({
        name: 'exportLinkBudget',
        data: { links, format, lang: 'zh', oldFileID }
      });

      if (!res.result || !res.result.success) {
        throw new Error(res.result?.error || '云函数返回错误');
      }
      wx.setStorageSync(storageKey, res.result.fileID);
      await this._openExportedDoc(res.result.fileID, res.result.fileName, fileType);
    } catch (error) {
      console.error('导出历史(专业版)失败:', error);
      wx.hideLoading();
      wx.showModal({ title: '导出失败', content: error.message || '无法导出，请稍后重试', showCancel: false });
    }
  },

  // 由历史记录构建链路瀑布报告的 links 数组（每条记录 = 一条链路，含 segments + summary）
  _buildHistoryProLinks(recordsWithResults) {
    const historyRecords = this.data.historyRecords;
    return recordsWithResults.map((record, fallbackIndex) => {
      const historyPos = historyRecords.findIndex(r => r.id === record.id);
      const seqLabel = historyPos >= 0 ? historyPos + 1 : fallbackIndex + 1;
      const sat = record.satelliteParams || {};
      const lp = record.linkParams || {};
      const results = record.calculationResults || {};
      const orbitType = record.orbitType || sat.orbitType || 'GEO';
      const ngsoClass = record.ngsoOrbitClass || sat.ngsoOrbitClass || 'LEO';
      const orbitLabel = orbitType === 'NGSO' ? `NGSO · ${ngsoClass}` : 'GEO';
      const satName = record.satelliteName || sat.satelliteName || '未命名';
      const band = record.frequencyBand || sat.frequencyBand || '';

      const segments = buildWaterfallSegments({
        results,
        lang: 'zh',
        txLocation: record.txLocation || lp.earthStationLocation || '',
        rxLocation: record.rxLocation || lp.rxEarthStationLocation || '',
        orbitType,
        satelliteGT: lp.G_Ts
      });
      const summary = buildLinkSummary(results, { satelliteName: satName, orbitLabel, frequencyBand: band });

      const subtitleParts = [satName];
      if (band) subtitleParts.push(band + ' 频段');
      subtitleParts.push(orbitLabel);
      if (record.time) subtitleParts.push(record.time);

      return {
        name: `[${seqLabel}] ${satName}`,
        subtitle: subtitleParts.join('　·　'),
        orbitType,
        segments,
        summary
      };
    });
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

    // 恢复轨道类型（GEO/NGSO）。旧记录无标注 → 默认 GEO
    const recordOrbitType = record.orbitType
      || (record.satelliteParams && record.satelliteParams.orbitType)
      || 'GEO';
    // NGSO 轨道子类 LEO/MEO/HEO
    const recordNgsoClass = recordOrbitType === 'NGSO'
      ? (record.ngsoOrbitClass
          || (record.satelliteParams && record.satelliteParams.ngsoOrbitClass)
          || 'LEO')
      : '';
    const restoredSatelliteParams = Object.assign({}, record.satelliteParams, {
      orbitType: recordOrbitType,
      ngsoOrbitClass: recordNgsoClass
    });

    // 同步 NGSO 轨道子类选择器索引
    const ngsoIdx = recordNgsoClass
      ? this.data.ngsoOrbitClassOptions.findIndex(o => o.key === recordNgsoClass)
      : 0;

    // 恢复计算模式与功放功率（正向记录需还原瓦数输入，旧记录无此字段默认反向）
    const recordLp = record.linkParams || {};
    const recordCalcMode = record.calcMode || recordLp.calcMode || 'reverse';
    const recordPaPower = (record.inputPaPower !== undefined && record.inputPaPower !== '')
      ? record.inputPaPower
      : ((recordLp.inputPaPower !== undefined && recordLp.inputPaPower !== '') ? recordLp.inputPaPower : '');

    // 恢复参数
    this.setData({
      satelliteParams: restoredSatelliteParams,
      linkParams: record.linkParams,
      marginValue: record.marginValue,
      noiseRatioMode: record.noiseRatioMode,
      calcMode: recordCalcMode,
      inputPaPower: recordPaPower,
      rateCalcMode: recordLp.rateCalcMode || 'infoRate',
      'realtimeParams.symbolRate': (recordLp.symbolRate !== undefined && recordLp.symbolRate !== '' && recordLp.symbolRate !== '--') ? recordLp.symbolRate : '--',
      'realtimeParams.carrierBandwidth': (recordLp.carrierBandwidth !== undefined && recordLp.carrierBandwidth !== '' && recordLp.carrierBandwidth !== '--') ? recordLp.carrierBandwidth : '--',
      orbitType: recordOrbitType,
      ngsoOrbitClass: recordNgsoClass || this.data.ngsoOrbitClass,
      ngsoOrbitClassIndex: ngsoIdx >= 0 ? ngsoIdx : 0,
      showHistoryPanel: false
    });

    // 更新全局数据
    app.globalData.satelliteParams = restoredSatelliteParams;
    // 同步写入对应 slot，确保切换轨道类型时能正确恢复
    const _hSlot = recordOrbitType === 'GEO' ? 'geoSatelliteParams' : 'ngsoSatelliteParams';
    app.globalData[_hSlot] = Object.assign({}, restoredSatelliteParams);
    // 旧记录 linkParams 内可能缺少 calcMode/inputPaPower，补齐后写入，避免 onShow 从全局恢复时丢失模式
    app.globalData.linkParams[this.data.currentLinkNum] = Object.assign({}, record.linkParams, {
      calcMode: recordCalcMode,
      inputPaPower: recordPaPower,
      // 旧记录的 linkParams 里没有门限口径，用记录级那一份补上 —— 不补的话，
      // 这一槽往后被 _modeOfLink 读到的会是别的链路留下的口径
      noiseRatioMode: record.noiseRatioMode || recordLp.noiseRatioMode || 'ebno'
    });
    app.globalData.noiseRatioMode = record.noiseRatioMode || 'ebno';
    app.globalData.orbitType = recordOrbitType;
    
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

      // 将历史记录的轨道类型注入 satelliteParams，确保配置侧能识别 NGSO
      const recordOrbitType = record.orbitType
        || (record.satelliteParams && record.satelliteParams.orbitType)
        || 'GEO';
      const recordNgsoClass = recordOrbitType === 'NGSO'
        ? (record.ngsoOrbitClass
            || (record.satelliteParams && record.satelliteParams.ngsoOrbitClass)
            || 'LEO')
        : '';
      const satelliteParamsForConfig = Object.assign({}, record.satelliteParams, {
        orbitType: recordOrbitType,
        ngsoOrbitClass: recordNgsoClass
      });

      // 创建新配置
      const newConfig = {
        _id: `config_${Date.now()}`,
        configName: configName,
        satelliteParams: satelliteParamsForConfig,
        // 配置里的 linkParams 是槽位形 { 1:{...} }（同 _buildHistoryExportConfigs）。
        // 历史记录存的是单条链路的扁平参数，这里必须包一层，否则载入时槽位取不到、链路参数整段不恢复。
        linkParams: { 1: record.linkParams },
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

// index.js
const app = getApp();
const { MODULATION_OPTIONS, FREQUENCY_BAND_OPTIONS, FEC_OPTIONS } = require('../../utils/constants');
const { validateAllParams } = require('../../utils/validator');
const { formatResultsForDisplay } = require('../../utils/formatter');
const { calculateLinkBudget } = require('../../utils/linkCalculator');
const { getAllCities, searchCities, getCityByName } = require('../../utils/cities');
const { estimateRainRate, getNearestCityInfo } = require('../../utils/rainRate');

Page({
  data: {
    // 链路编号
    linkNumbers: [1, 2, 3, 4, 5, 6, 7, 8],
    currentLinkNum: 1,

    // 导航栏位置信息
    navBarTop: 0,
    navBarHeight: 32,
    navBarRight: 0,
    
    // 卫星列表
    satellites: [
      { "name": "CHINASAT 6D", "position": "125" },
      { "name": "CHINASAT 6C", "position": "130.5" },
      { "name": "CHINASAT 6E", "position": "115.5" },
      { "name": "CHINASAT 9", "position": "92.2" },
      { "name": "CHINASAT 9B", "position": "101.4" },
      { "name": "CHINASAT 9C", "position": "92.2" },
      { "name": "CHINASAT 10", "position": "110.5" },
      { "name": "CHINASAT 10R", "position": "110.5" },
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
      { "name": "JCSAT-4B", "position": "124" },
      { "name": "其他", "position": "" }
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
    
    // 可视化面板
    showVisualPopup: false, // 是否显示可视化功能选择面板
    
    // 选项数据
    frequencyBandOptions: FREQUENCY_BAND_OPTIONS,
    frequencyBandIndex: 7, // 默认Ku
    modulationOptions: MODULATION_OPTIONS,
    modulationIndex: 1, // 默认QPSK
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
    filteredCities: getAllCities(),
    filteredCitiesRx: getAllCities(),
    cityInputTimer: null,
    
    // 计算状态
    calculating: false,
    hasResults: false,
    
    // 计算结果
    results: {},
    
    // 标记参数 - 默认标记链路计算结果的前12项
    markedParams: [
      'bandwidthUsageRatio',
      'powerUsageRatio',
      'allocBandwidthResult',
      'PowerBWResult',
      'selectedPowerResult',
      'selectedPowerWResult',
      'paRecommendationdBResult',
      'paRecommendation',
      'UPCmarginResult',
      'stationEIRPResult',
      'PFDcResult',
      'stationPSDResult',
      'satellitePSDResult'
    ],
    
    // 实时计算结果
    realtimeParams: {
      stationEIRP: '--',
      paRecommendation: '--',
      gOverTe: '--',
      carrierBandwidth: '--',
      symbolRate: '--'
    }
  },

  onLoad() {
    // 获取胶囊按钮位置信息，用于对齐悬浮按钮
    try {
      const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
      const systemInfo = wx.getSystemInfoSync();
      
      this.setData({
        navBarTop: menuButtonInfo.top,
        navBarHeight: menuButtonInfo.height,
        navBarRight: systemInfo.windowWidth - menuButtonInfo.right
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

    // 初始化参数
    this.initParams();
    
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
  },
  
  onShow() {
    // 每次显示页面时，检查是否有更新的配置需要加载
    try {
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
      }
      
      if (app.globalData.linkParams && app.globalData.linkParams[this.data.currentLinkNum]) {
        this.setData({
          linkParams: app.globalData.linkParams[this.data.currentLinkNum]
        });
      }
      
      // 更新实时参数
      this.updateRealtimeParams();
    } catch (e) {
      console.error('恢复配置失败:', e);
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
  },

  // 保存当前链路参数
  saveLinkParams() {
    app.globalData.linkParams[this.data.currentLinkNum] = this.data.linkParams;
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
      this.setData({
        satelliteIndex: index,
        'satelliteParams.satelliteName': satellite.name,
        'satelliteParams.orbitPosition': satellite.position
      });
    }
    
    // 更新实时参数
    this.updateRealtimeParams();
    
    // 保存到全局
    app.globalData.satelliteParams = this.data.satelliteParams;
  },

  // 链路参数输入变化
  onLinkParamChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    
    this.setData({
      [`linkParams.${field}`]: value
    });
    
    // 更新实时参数
    this.updateRealtimeParams();
    
    // 如果是经纬度变化，提示是否自动估算降雨率
    if (field === 'longitude' || field === 'latitude') {
      this.checkRainRateEstimation('uplink');
    } else if (field === 'rxLongitude' || field === 'rxLatitude') {
      this.checkRainRateEstimation('downlink');
    }
  },

  // 检查是否需要估算降雨率
  checkRainRateEstimation(type) {
    // 清除之前的定时器
    if (this.rainRateTimer) {
      clearTimeout(this.rainRateTimer);
    }
    
    // 延迟执行，避免频繁弹窗
    this.rainRateTimer = setTimeout(() => {
      if (type === 'uplink') {
        const lon = parseFloat(this.data.linkParams.longitude);
        const lat = parseFloat(this.data.linkParams.latitude);
        
        if (!isNaN(lon) && !isNaN(lat)) {
          this.promptRainRateEstimation(lon, lat, 'uplink');
        }
      } else if (type === 'downlink') {
        const lon = parseFloat(this.data.linkParams.rxLongitude);
        const lat = parseFloat(this.data.linkParams.rxLatitude);
        
        if (!isNaN(lon) && !isNaN(lat)) {
          this.promptRainRateEstimation(lon, lat, 'downlink');
        }
      }
    }, 1000); // 1秒后提示
  },

  // 提示降雨率估算
  promptRainRateEstimation(lon, lat, type) {
    const cityInfo = getNearestCityInfo(lat, lon);
    const field = type === 'uplink' ? 'rainRate' : 'rxRainRate';
    const currentRate = parseFloat(this.data.linkParams[field]) || 0;
    
    // 如果已有降雨率且与估算值接近，不提示
    if (currentRate > 0 && Math.abs(currentRate - cityInfo.rainRate) < 5) {
      return;
    }
    
    wx.showModal({
      title: '降雨率估算',
      content: `建议降雨率: ${cityInfo.rainRate} mm/h\n\n是否填充？`,
      confirmText: '填充',
      cancelText: '保持当前',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            [`linkParams.${field}`]: cityInfo.rainRate
          });
          
          wx.showToast({
            title: `已设置降雨率 ${cityInfo.rainRate} mm/h`,
            icon: 'success',
            duration: 2000
          });
        }
      }
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

  // FEC编码率输入处理（支持分数和小数）
  onFecInput(e) {
    let value = e.detail.value.trim();
    
    // 如果输入包含/，说明是分数格式，转换为小数
    if (value.includes('/')) {
      const parts = value.split('/');
      if (parts.length === 2) {
        const numerator = parseFloat(parts[0]);
        const denominator = parseFloat(parts[1]);
        if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
          value = (numerator / denominator).toFixed(5);
          // 移除末尾多余的0
          value = parseFloat(value).toString();
        }
      }
    }
    
    this.setData({
      'linkParams.fec': value
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
      
      // 获取FEC编码率、RS码效率、扩频增益
      const fec = parseFloat(this.data.linkParams.fec) || 0.75;
      const rsCode = parseFloat(this.data.linkParams.rsCode) || 1.0;
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
          filteredCities: getAllCities()
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
          filteredCitiesRx: getAllCities()
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
      itemList: ['保存配置', '加载配置', '地球站参数互换', '生成报告'],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 保存配置
          this.saveConfig();
        } else if (res.tapIndex === 1) {
          // 加载配置
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
    
    wx.navigateTo({
      url: '/pages/configs/configs?action=save'
    });
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

  // 跳转到卫星覆盖图页面
  goToCoverageMap() {
    this.setData({ showVisualPopup: false });
    const satelliteIndex = this.data.satelliteIndex;
    wx.navigateTo({
      url: `/pages/satellite-coverage/satellite-coverage?satelliteIndex=${satelliteIndex}`
    });
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
    // 检查是否已经计算过
    if (!this.data.hasResults) {
      wx.showModal({
        title: '提示',
        content: '请先进行链路计算',
        showCancel: false
      });
      return;
    }

    // 保存当前数据到全局
    this.saveLinkParams();
    app.globalData.satelliteParams = this.data.satelliteParams;
    app.globalData.calculationResults = app.globalData.calculationResults || {};
    app.globalData.calculationResults[this.data.currentLinkNum] = this.data.results;
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
      // 准备参数，包含当前的余量值
      const linkParamsWithMargin = {
        ...this.data.linkParams,
        margin: this.data.marginValue,
        noiseRatioMode: this.data.noiseRatioMode
      };
      
      // 调用计算函数
      const results = calculateLinkBudget(this.data.satelliteParams, linkParamsWithMargin);
      
      if (results.success) {
        this.setData({
          'realtimeParams.stationEIRP': results.data.stationEIRPResult,
          'realtimeParams.paRecommendation': results.data.paRecommendation,
          'realtimeParams.gOverTe': results.data.gOverTeResult,
          'realtimeParams.carrierBandwidth': results.data.allocBandwidthResult,
          'realtimeParams.symbolRate': results.data.symbolRateResult
        });
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
      title: '卫星链路计算器 - 专业的卫星通信链路预算工具',
      path: '/pages/index/index',
      imageUrl: '' // 可选，可以设置分享图片
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: '卫星链路计算器 - 专业的卫星通信链路预算工具',
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
        
        const paPower = parseFloat(results.data.paRecommendation) || 0;
        const paPowerdB = parseFloat(results.data.paRecommendationdBResult) || -Infinity;
        return { paPower, paPowerdB, error: false };
      } catch (error) {
        return { paPower: 0, paPowerdB: -Infinity, error: true };
      }
    };

    // 步骤1: 用当前余量做基准计算，获取常量K（保持完整精度）
    const currentMargin = parseFloat(this.data.marginValue) || 3;
    const baseResult = doCalculation(currentMargin);
    
    if (baseResult.error || baseResult.paPower <= 0) {
      return { success: false, message: '基准计算失败' };
    }
    
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
        const paPower = parseFloat(results.data.paRecommendation) || 0;
        const paPowerdB = parseFloat(results.data.paRecommendationdBResult) || -Infinity;
        
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
    
    if (baseResult.error || baseResult.paPower <= 0) {
      return { success: false, message: '基准计算失败' };
    }
    
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
      showHistoryPanel: !this.data.showHistoryPanel
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

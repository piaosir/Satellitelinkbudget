// configs.js
const app = getApp();
const { formatDateTime } = require('../../utils/formatter');

Page({
  data: {
    configs: [],
    loading: false,
    currentShareConfig: null // 当前要分享的配置
  },

  onLoad(options) {
    // 如果是保存操作
    if (options.action === 'save') {
      this.saveCurrentConfig();
    } else if (options.shareCode) {
      // 如果是从分享链接进入，自动导入配置
      this.importSharedConfig(options.shareCode);
    } else {
      this.loadConfigs();
    }
  },

  onShow() {
    // 每次显示页面时刷新列表
    if (this.data.configs.length > 0) {
      this.loadConfigs();
    }
  },

  // 分享给朋友
  onShareAppMessage() {
    const { currentShareConfig } = this.data;
    
    if (currentShareConfig) {
      return {
        title: `分享配置：${currentShareConfig.configName}`,
        path: `/pages/configs/configs?shareCode=${currentShareConfig.shareCode}`,
        imageUrl: '' // 可以设置分享图片
      };
    }
    
    return {
      title: '卫星链路预算配置',
      path: '/pages/configs/configs'
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    const { currentShareConfig } = this.data;
    
    if (currentShareConfig) {
      return {
        title: `卫星链路配置：${currentShareConfig.configName}`,
        query: `shareCode=${currentShareConfig.shareCode}`,
        imageUrl: '' // 可以设置分享图片
      };
    }
    
    return {
      title: '卫星链路预算',
      query: ''
    };
  },

  // 导入分享的配置
  async importSharedConfig(shareCode) {
    wx.showLoading({
      title: '导入配置中...',
      mask: true
    });
    
    try {
      await this.doImportConfig(shareCode);
    } catch (error) {
      console.error('导入分享配置失败:', error);
    } finally {
      wx.hideLoading();
    }
  },

  // 加载配置列表
  async loadConfigs() {
    this.setData({ loading: true });
    
    wx.showLoading({
      title: '加载中...',
      mask: true
    });
    
    try {
      // 从本地存储读取配置列表
      const configs = wx.getStorageSync('savedConfigs') || [];
      
      // 格式化日期
      const formattedConfigs = configs.map(item => ({
        ...item,
        createTime: formatDateTime(item.createTime, 'YYYY-MM-DD HH:mm')
      }));
      
      this.setData({
        configs: formattedConfigs
      });
      
      if (formattedConfigs.length === 0) {
        wx.showToast({
          title: '暂无配置',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('加载配置失败:', error);
      wx.showModal({
        title: '加载失败',
        content: error.message || '无法加载配置列表',
        showCancel: false
      });
    } finally {
      this.setData({ loading: false });
      wx.hideLoading();
    }
  },

  // 保存当前配置
  async saveCurrentConfig() {
    wx.showModal({
      title: '保存配置',
      editable: true,
      placeholderText: '请输入配置名称',
      content: `卫星链路配置_${formatDateTime(new Date(), 'YYYY-MM-DD')}`,
      success: async (res) => {
        if (res.confirm) {
          await this.doSaveConfig(res.content || `配置_${Date.now()}`);
        } else {
          wx.navigateBack();
        }
      }
    });
  },

  // 执行保存操作
  async doSaveConfig(configName) {
    wx.showLoading({
      title: '保存中...',
      mask: true
    });
    
    try {
      // 从本地存储读取现有配置
      const configs = wx.getStorageSync('savedConfigs') || [];
      
      // 创建新配置
      const newConfig = {
        _id: `config_${Date.now()}`, // 生成唯一ID
        configName: configName,
        satelliteParams: app.globalData.satelliteParams,
        linkParams: app.globalData.linkParams,
        calculationResults: app.globalData.calculationResults || {}, // 保存计算结果
        noiseRatioMode: app.globalData.noiseRatioMode || 'ebno', // 保存噪声比模式
        markedParams: app.globalData.markedParams || [], // 保存标记参数
        highlightedRows: app.globalData.highlightedRows || [],
        createTime: new Date(),
        updateTime: new Date()
      };
      
      // 添加到配置列表开头（最新的在前面）
      configs.unshift(newConfig);
      
      // 保存到本地存储
      wx.setStorageSync('savedConfigs', configs);
      
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      });
      
      // 刷新列表
      setTimeout(() => {
        this.loadConfigs();
      }, 1000);
    } catch (error) {
      console.error('保存配置失败:', error);
      wx.showModal({
        title: '保存失败',
        content: error.message || '无法保存配置',
        showCancel: false
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 加载配置
  async loadConfig(e) {
    const configId = e.currentTarget.dataset.id;
    
    wx.showModal({
      title: '确认加载',
      content: '加载此配置将覆盖当前参数，是否继续？',
      success: async (res) => {
        if (res.confirm) {
          await this.doLoadConfig(configId);
        }
      }
    });
  },

  // 执行加载操作
  async doLoadConfig(configId) {
    wx.showLoading({
      title: '加载中...',
      mask: true
    });
    
    try {
      // 从本地存储读取配置列表
      const configs = wx.getStorageSync('savedConfigs') || [];
      
      // 查找指定ID的配置
      const config = configs.find(item => item._id === configId);
      
      if (config) {
        // 更新全局数据
        app.globalData.satelliteParams = config.satelliteParams;
        app.globalData.linkParams = config.linkParams;
        app.globalData.calculationResults = config.calculationResults || {}; // 恢复计算结果
        app.globalData.noiseRatioMode = config.noiseRatioMode || 'ebno'; // 恢复噪声比模式
        app.globalData.markedParams = config.markedParams || []; // 恢复标记参数
        app.globalData.highlightedRows = config.highlightedRows || [];
        
        // 同时保存到本地存储，以便返回计算页面时能恢复
        wx.setStorageSync('noiseRatioMode', config.noiseRatioMode || 'ebno');
        
        wx.showToast({
          title: '加载成功',
          icon: 'success'
        });
        
        // 返回计算页面
        setTimeout(() => {
          wx.navigateBack();
        }, 1000);
      } else {
        throw new Error('配置不存在');
      }
    } catch (error) {
      console.error('加载配置失败:', error);
      wx.showModal({
        title: '加载失败',
        content: error.message || '无法加载配置',
        showCancel: false
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 删除配置
  async deleteConfig(e) {
    const configId = e.currentTarget.dataset.id;
    
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，是否继续？',
      success: async (res) => {
        if (res.confirm) {
          await this.doDeleteConfig(configId);
        }
      }
    });
  },

  // 分享配置
  async shareConfig(e) {
    const configId = e.currentTarget.dataset.id;
    
    wx.showLoading({
      title: '准备分享...',
      mask: true
    });
    
    try {
      // 从本地存储读取配置列表
      const configs = wx.getStorageSync('savedConfigs') || [];
      
      // 查找指定ID的配置
      const config = configs.find(item => item._id === configId);
      
      if (!config) {
        throw new Error('配置不存在');
      }
      
      // 将配置数据转换为JSON字符串并编码
      const configData = {
        configName: config.configName,
        satelliteParams: config.satelliteParams,
        linkParams: config.linkParams,
        noiseRatioMode: config.noiseRatioMode || 'ebno',
        highlightedRows: config.highlightedRows || []
      };
      
      const encodedConfig = encodeURIComponent(JSON.stringify(configData));
      
      // 显示分享选项
      wx.hideLoading();
      
      wx.showActionSheet({
        itemList: ['分享链接', '生成分享码'],
        success: (res) => {
          if (res.tapIndex === 0) {
            // 分享链接
            this.shareLink(config);
          } else if (res.tapIndex === 1) {
            // 生成分享码
            this.generateShareCode(config);
          }
        }
      });
      
    } catch (error) {
      console.error('准备分享失败:', error);
      wx.hideLoading();
      wx.showModal({
        title: '分享失败',
        content: error.message || '无法分享配置',
        showCancel: false
      });
    }
  },

  // 分享链接
  shareLink(config) {
    // 生成分享码（Base64格式）
    const configData = {
      configName: config.configName,
      satelliteParams: config.satelliteParams,
      linkParams: config.linkParams,
      noiseRatioMode: config.noiseRatioMode || 'ebno',
      highlightedRows: config.highlightedRows || []
    };
    
    const shareCode = JSON.stringify(configData);
    const base64Code = wx.arrayBufferToBase64(this.stringToArrayBuffer(shareCode));
    
    // 触发分享
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
    
    // 设置当前要分享的配置
    this.setData({
      currentShareConfig: {
        configName: config.configName,
        shareCode: base64Code
      }
    });
    
    wx.showModal({
      title: '分享配置',
      content: '点击右上角"..."按钮，选择"转发"分享给好友',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // 生成分享码
  generateShareCode(config) {
    // 直接保存完整的配置数据，确保与本地保存的配置完全一致
    const configData = {
      configName: config.configName,
      satelliteParams: config.satelliteParams,
      linkParams: config.linkParams,
      noiseRatioMode: config.noiseRatioMode || 'ebno',
      highlightedRows: config.highlightedRows || []
    };
    
    // 转换为JSON字符串和Base64
    const shareCode = JSON.stringify(configData);
    console.log('生成分享码 - JSON长度:', shareCode.length);
    console.log('生成分享码 - JSON前100字符:', shareCode.substring(0, 100));
    
    const base64Code = wx.arrayBufferToBase64(this.stringToArrayBuffer(shareCode));
    console.log('生成分享码 - Base64长度:', base64Code.length);
    console.log('生成分享码 - Base64前50字符:', base64Code.substring(0, 50));
    
    wx.setClipboardData({
      data: base64Code,
      success: () => {

      }
    });
  },

  // 字符串转ArrayBuffer (使用 UTF-8 编码)
  stringToArrayBuffer(str) {
    // 使用 TextEncoder 进行 UTF-8 编码（如果支持）
    if (typeof TextEncoder !== 'undefined') {
      const encoder = new TextEncoder();
      return encoder.encode(str).buffer;
    }
    
    // 降级方案：使用 encodeURIComponent 和手动转换
    const utf8 = unescape(encodeURIComponent(str));
    const buffer = new ArrayBuffer(utf8.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < utf8.length; i++) {
      view[i] = utf8.charCodeAt(i);
    }
    return buffer;
  },

  // 执行删除操作
  async doDeleteConfig(configId) {
    wx.showLoading({
      title: '删除中...',
      mask: true
    });
    
    try {
      // 从本地存储读取配置列表
      const configs = wx.getStorageSync('savedConfigs') || [];
      
      // 过滤掉要删除的配置
      const updatedConfigs = configs.filter(item => item._id !== configId);
      
      // 保存更新后的配置列表
      wx.setStorageSync('savedConfigs', updatedConfigs);
      
      wx.showToast({
        title: '删除成功',
        icon: 'success'
      });
      
      // 刷新列表
      this.loadConfigs();
    } catch (error) {
      console.error('删除配置失败:', error);
      wx.showModal({
        title: '删除失败',
        content: error.message || '无法删除配置',
        showCancel: false
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 前往计算页面
  goToCalculate() {
    wx.navigateTo({
      url: '/pages/index/index'
    });
  },

  // 导入配置
  importConfig() {
    // 直接调用输入分享码
    this.inputShareCode();
  },

  // 手动输入分享码
  inputShareCode() {
    wx.showModal({
      title: '导入配置',
      editable: true,
      placeholderText: '请粘贴分享码',
      content: '',
      success: async (res) => {
        if (res.confirm && res.content) {
          let shareCode = res.content.trim();
          
          // 如果包含各种前缀，去除前缀
          if (shareCode.startsWith('SATLINK:')) {
            shareCode = shareCode.substring(8);
          } else if (shareCode.startsWith('SL:')) {
            shareCode = shareCode.substring(3);
          } else if (shareCode.startsWith('S:')) {
            shareCode = shareCode.substring(2);
          }
          
          await this.doImportConfig(shareCode);
        }
      }
    });
  },

  // 执行导入操作
  async doImportConfig(shareCode) {
    wx.showLoading({
      title: '导入中...',
      mask: true
    });
    
    try {
      // 尝试解析Base64分享码
      let configData;
      try {
        console.log('开始解析分享码，长度:', shareCode.length);
        console.log('分享码前50字符:', shareCode.substring(0, 50));
        
        const decodedStr = this.arrayBufferToString(wx.base64ToArrayBuffer(shareCode));
        console.log('Base64解码后:', decodedStr.substring(0, 100));
        
        configData = JSON.parse(decodedStr);
        console.log('解析成功，数据类型:', typeof configData);
      } catch (e) {
        console.error('Base64解析失败:', e);
        // 如果Base64解析失败，尝试直接解析JSON
        try {
          configData = JSON.parse(shareCode);
          console.log('直接JSON解析成功');
        } catch (e2) {
          console.error('JSON解析也失败:', e2);
          throw new Error(`无效的分享码格式: ${e.message || e}`);
        }
      }
      
      let newConfig;
      
      // 判断是新格式（对象，包含完整字段）还是旧格式（数组或压缩对象）
      if (configData.satelliteParams && configData.linkParams) {
        // 新格式：完整的配置对象
        console.log('检测到完整配置格式');
        newConfig = {
          _id: `config_${Date.now()}`,
          configName: configData.configName || `导入配置_${new Date().toLocaleDateString()}`,
          satelliteParams: configData.satelliteParams,
          linkParams: configData.linkParams,
          noiseRatioMode: configData.noiseRatioMode || 'ebno',
          highlightedRows: configData.highlightedRows || [],
          createTime: new Date(),
          updateTime: new Date()
        };
      } else if (Array.isArray(configData)) {
        // 旧格式：数组格式（向后兼容，但字段不完整）
        if (configData.length < 3) {
          throw new Error('配置数据不完整：缺少必要的数组元素');
        }
        
        console.log('检测到旧数组格式，字段可能不完整');
        
        const satelliteData = configData[0];
        const linkData = configData[1];
        const mode = configData[2];
        const configName = configData[3] || `导入配置_${new Date().toLocaleDateString()}`;
        const highlightedRows = configData[4] || [];
        
        // 验证数组数据的完整性
        if (!Array.isArray(satelliteData) || satelliteData.length < 7) {
          throw new Error('卫星参数数据不完整');
        }
        if (!Array.isArray(linkData) || linkData.length < 10) {
          throw new Error('链路参数数据不完整');
        }
        
        console.log('解析数组格式配置:', {
          satelliteName: satelliteData[0],
          latitude: linkData[0],
          mode: mode === 1 ? 'esno' : 'ebno'
        });
        
        // 注意：数组格式只包含部分字段，缺少很多链路参数
        // 缺失的字段将使用默认值
        const defaultLinkParams = app.getDefaultLinkParams();
        
        newConfig = {
          _id: `config_${Date.now()}`,
          configName: configName,
          satelliteParams: {
            satelliteName: satelliteData[0],
            orbitPosition: satelliteData[1],
            frequencyBand: satelliteData[2],
            uplinkFrequency: satelliteData[3],
            downlinkFrequency: satelliteData[4],
            satelliteEirp: satelliteData[5],
            uplinkGT: satelliteData[6]
          },
          linkParams: {
            ...defaultLinkParams, // 先使用默认值填充所有字段
            // 然后覆盖数组中包含的字段
            latitude: linkData[0],
            longitude: linkData[1],
            antennaDiameter: linkData[2],
            antennaEfficiency: linkData[3],
            systemNoiseTemperature: linkData[4],
            transmitPower: linkData[5],
            symbolRate: linkData[6],
            modulationType: linkData[7],
            codingType: linkData[8],
            rollOffFactor: linkData[9]
          },
          noiseRatioMode: mode === 1 ? 'esno' : 'ebno',
          highlightedRows: highlightedRows,
          createTime: new Date(),
          updateTime: new Date()
        };
      } else {
        // 旧格式：对象格式
        // 验证配置数据
        if (!configData.s || !configData.l) {
          throw new Error('配置数据不完整');
        }
        
        // 还原完整的配置对象
        newConfig = {
          _id: `config_${Date.now()}`,
          configName: configData.n || '导入的配置',
          satelliteParams: {
            satelliteName: configData.s.sn,
            orbitPosition: configData.s.op,
            frequencyBand: configData.s.fb,
            uplinkFrequency: configData.s.uf,
            downlinkFrequency: configData.s.df,
            satelliteEirp: configData.s.se,
            uplinkGT: configData.s.ug
          },
          linkParams: {
            latitude: configData.l.lat,
            longitude: configData.l.lon,
            antennaDiameter: configData.l.ad,
            antennaEfficiency: configData.l.ae,
            systemNoiseTemperature: configData.l.snt,
            transmitPower: configData.l.tp,
            symbolRate: configData.l.sr,
            modulationType: configData.l.mt,
            codingType: configData.l.ct,
            rollOffFactor: configData.l.rf
          },
          noiseRatioMode: configData.m || 'ebno',
          highlightedRows: configData.h || [],
          createTime: new Date(),
          updateTime: new Date()
        };
      }
      
      // 保存到本地存储
      const configs = wx.getStorageSync('savedConfigs') || [];
      configs.unshift(newConfig);
      wx.setStorageSync('savedConfigs', configs);
      
      wx.showToast({
        title: '导入成功',
        icon: 'success'
      });
      
      // 刷新列表
      setTimeout(() => {
        this.loadConfigs();
      }, 1000);
      
    } catch (error) {
      console.error('导入配置失败:', error);
      console.error('错误堆栈:', error.stack);
      
      // 根据错误类型提供更具体的提示
      let errorMsg = error.message || '无法导入配置';
      if (errorMsg.includes('Base64') || errorMsg.includes('JSON')) {
        errorMsg = '分享码格式错误，请确保复制完整的分享码';
      } else if (errorMsg.includes('数据不完整')) {
        errorMsg = error.message;
      }
      
      wx.showModal({
        title: '导入失败',
        content: errorMsg,
        showCancel: false,
        confirmText: '知道了'
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 生成报告
  async generateReport(e) {
    const configId = e.currentTarget.dataset.id;
    
    wx.showLoading({
      title: '准备生成报告...',
      mask: true
    });
    
    try {
      // 从本地存储读取配置列表
      const configs = wx.getStorageSync('savedConfigs') || [];
      
      // 查找指定ID的配置
      const config = configs.find(item => item._id === configId);
      
      if (!config) {
        throw new Error('配置不存在');
      }
      
      // 检查配置是否包含计算结果
      if (!config.calculationResults || Object.keys(config.calculationResults).length === 0) {
        wx.hideLoading();
        wx.showModal({
          title: '无法生成报告',
          content: '该配置没有计算结果，请先加载配置并进行计算后再保存',
          showCancel: false
        });
        return;
      }
      
      // 更新全局数据
      app.globalData.satelliteParams = config.satelliteParams;
      app.globalData.linkParams = config.linkParams;
      app.globalData.calculationResults = config.calculationResults; // 加载计算结果
      app.globalData.noiseRatioMode = config.noiseRatioMode || 'ebno';
      app.globalData.markedParams = config.markedParams || [];
      
      wx.hideLoading();
      
      // 跳转到报告页面 - 使用配置中存在的第一个链路编号
      const linkNumbers = Object.keys(config.calculationResults).map(k => parseInt(k));
      const firstLinkNum = linkNumbers.length > 0 ? linkNumbers[0] : 1;
      
      wx.navigateTo({
        url: `/pages/report/report?linkNum=${firstLinkNum}&fromConfig=true`
      });
    } catch (error) {
      console.error('生成报告失败:', error);
      wx.hideLoading();
      wx.showModal({
        title: '生成报告失败',
        content: error.message || '无法生成报告',
        showCancel: false
      });
    }
  },

  // ArrayBuffer转字符串 (使用 UTF-8 解码)
  arrayBufferToString(buffer) {
    // 使用 TextDecoder 进行 UTF-8 解码（如果支持）
    if (typeof TextDecoder !== 'undefined') {
      const decoder = new TextDecoder('utf-8');
      return decoder.decode(buffer);
    }
    
    // 降级方案：手动转换和 decodeURIComponent
    const view = new Uint8Array(buffer);
    let str = '';
    for (let i = 0; i < view.length; i++) {
      str += String.fromCharCode(view[i]);
    }
    try {
      return decodeURIComponent(escape(str));
    } catch (e) {
      // 如果解码失败，返回原始字符串
      return str;
    }
  }
});

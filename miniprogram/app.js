// app.js
const { setFullPrecisionData } = require('./utils/rainRate');

App({
  onLaunch: function (options) {
    // 保存启动参数（用于分享码跳转）
    if (options && options.query) {
      if (options.query.shareCode) {
        this.globalData = this.globalData || {};
        this.globalData.launchShareCode = options.query.shareCode;
        console.log('检测到启动参数 shareCode:', options.query.shareCode);
      }
      if (options.query.scene) {
        this.globalData = this.globalData || {};
        this.globalData.launchScene = options.query.scene;
        console.log('检测到启动参数 scene:', options.query.scene);
      }
    }

    // 初始化云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        // env 参数说明：
        //   env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会默认请求到哪个云环境的资源
        //   此处请填入环境 ID, 环境 ID 可打开云控制台查看
        //   如不填则使用默认环境（第一个创建的环境）
        env: 'cloud1-8gjv5ekx41d6fb76', // 已注释，使用默认环境
        traceUser: true,
      });
      
      // 验证云开发是否初始化成功
      console.log('云开发初始化成功');
    }

    this.globalData = {
      // 当前选中的链路编号
      currentLinkNum: 1,
      // 卫星参数
      satelliteParams: this.getDefaultSatelliteParams(),
      // GEO / NGSO 独立卫星参数 slot
      geoSatelliteParams: {},
      ngsoSatelliteParams: {},
      // 链路参数（支持8条链路）
      linkParams: {},
      // 计算结果
      calculationResults: {},
      // 标记的参数行
      markedParams: [],
      // 标记的结果行（用于报告生成）
      highlightedRows: [],
      // 噪声比模式：'ebno' 或 'esno'
      noiseRatioMode: 'ebno',
      // 当前正在编辑的配置ID（用于编辑后保存）
      currentEditingConfigId: null,
      // 当前正在编辑的配置是否为本地配置
      currentEditingConfigIsLocal: false,
      // 当前正在编辑的配置名称
      currentEditingConfigName: null,
      // 启动时的分享码参数（用于从扫码进入时跳转）
      launchShareCode: this.globalData ? this.globalData.launchShareCode : null,
      launchScene: this.globalData ? this.globalData.launchScene : null
    };

    // 初始化8条链路的默认参数
    for (let i = 1; i <= 8; i++) {
      this.globalData.linkParams[i] = this.getDefaultLinkParams();
    }

    // 后台静默下载 ITU-R P.837 全精度降雨率数据
    this._loadP837Data();
  },

  // ===== P.837 降雨率数据加载 =====
  // 云存储文件路径 (上传 p837_r001_v1.bin 后填入 fileID)
  P837_CLOUD_FILE: 'cloud://cloud1-8gjv5ekx41d6fb76.636c-cloud1-8gjv5ekx41d6fb76-1385987144/R001/p837_r001_v2.bin',
  P837_LOCAL_PATH: wx.env.USER_DATA_PATH + '/p837_r001_v2.bin',
  P837_VERSION_KEY: 'p837_data_version',
  P837_CURRENT_VERSION: 'v2',
  P837_EXPECTED_SIZE: 1441 * 2881 * 2, // 8,303,042 bytes (uint16)

  _loadP837Data() {
    const fs = wx.getFileSystemManager();
    const savedVersion = wx.getStorageSync(this.P837_VERSION_KEY);

    // 优先尝试加载本地缓存
    if (savedVersion === this.P837_CURRENT_VERSION) {
      try {
        const arrayBuffer = fs.readFileSync(this.P837_LOCAL_PATH);
        if (arrayBuffer && arrayBuffer.byteLength === this.P837_EXPECTED_SIZE) {
          setFullPrecisionData(arrayBuffer);
          console.log('[P.837] 从本地缓存加载成功');
          return;
        }
      } catch (e) {
        console.warn('[P.837] 本地缓存读取失败，重新下载:', e.message);
      }
    }

    // 后台下载
    this._downloadP837Data(fs);
  },

  _downloadP837Data(fs) {
    console.log('[P.837] 开始后台下载全精度数据...');
    wx.cloud.downloadFile({
      fileID: this.P837_CLOUD_FILE,
      success: (res) => {
        if (res.statusCode === 200 && res.tempFilePath) {
          try {
            // 读取临时文件
            const arrayBuffer = fs.readFileSync(res.tempFilePath);
            if (arrayBuffer.byteLength !== this.P837_EXPECTED_SIZE) {
              console.warn('[P.837] 下载数据大小不匹配:', arrayBuffer.byteLength);
              return;
            }

            // 持久化到用户目录
            fs.writeFileSync(this.P837_LOCAL_PATH, arrayBuffer);
            wx.setStorageSync(this.P837_VERSION_KEY, this.P837_CURRENT_VERSION);

            // 注入到 rainRate 模块
            setFullPrecisionData(arrayBuffer);
            console.log('[P.837] 下载并缓存成功');
          } catch (e) {
            console.error('[P.837] 保存失败:', e.message);
          }
        }
      },
      fail: (err) => {
        console.warn('[P.837] 下载失败(将使用0.5°近似数据):', err.errMsg);
      }
    });
  },

  // 获取默认卫星参数 - 完全对齐 index.html
  getDefaultSatelliteParams() {
    return {
      satelliteName: 'Satellite',
      orbitPosition: 110.5,
      frequencyBand: 'Ku',
      uplinkPolarization: 'V',
      sfdRef: -84,
      transponderBandwidth: 36,
      beamInput: '中国波束',
      BOi: 6,
      BOo: 3,
      deltaTheta: 2.5,
      aciUplinkFactor: 30,
      adjUplinkFactor: 25,
      xpolUplinkFactor: 26,
      hpaIntermodFactor: 24,
      aciDownlinkFactor: 30,
      adjDownlinkFactor: 25,
      xpolDownlinkFactor: 26,
      xpdrIntermodFactor: 21,

      // NGSO 专属参数
      cIsl: 30,
      islHops: 0
    };
  },

    // 获取默认链路参数 - 完全对齐 index.html
  getDefaultLinkParams() {
    return {
      // 上行站参数
      earthStationLocation: '',
      antennaDiameter: 6.2,
      longitude: 116.4074,
      latitude: 39.9042,
      centerFrequency: 14.25,
      uplinkPolarization: 'V',
      G_Ts: 2,
      altitude: 0,
      rainRate: 46.167,
      antennaEfficiency: 65,
      paBackoff: 5,
      feederLoss: 3.5,
      uplinkPowerControl: '否',
      uplinkAvailability: 99.90,
      uplinkOtherLoss: 0.3,

      // NGSO 发信站专属参数（LEO 典型场景）
      minElevation: 25,
      distanceMode: 'altitude', // 'altitude' | 'slantRange'
      orbitAltitude: 1145,
      slantRange: 2120,

      // 接收站参数
      rxEarthStationLocation: '',
      rxAntennaDiameter: 3.7,
      rxLongitude: 116.4074,
      rxLatitude: 39.9042,
      rxCenterFrequency: 12.5,
      downlinkPolarization: 'H',
      rxEIRP: 46,
      rxAltitude: 0,
      rxRainRate: 46.167,
      rxAntennaEfficiency: 65,
      rxAntennaNoiseTemp: 35,
      rxReceiverNoiseTemp: 75,
      rxFeederLoss: 0.2,
      rxDownlinkAvailability: 99.90,
      downlinkOtherLoss: 0.3,

      // NGSO 收信站专属参数（LEO 典型场景）
      rxMinElevation: 25,
      rxDistanceMode: 'altitude', // 'altitude' | 'slantRange'
      rxOrbitAltitude: 1145,
      rxSlantRange: 2120,

      // 载波参数
      dvbStandard: 'custom',
      modcodIndex: -1,
      infoRate: 2048,
      modulation: 'QPSK',
      fec: '3/4',
      rsCode: '188/204',
      m: 1.00,
      bandwidthFactor: 1.20,
      ber: 7,
      ebno: 5.50,
      margin: 3.00,

      // 计算模式与速率模式
      calcMode: 'reverse',
      inputPaPower: '',
      rateCalcMode: 'infoRate',
      symbolRate: '--'
    };
  },

  globalData: {
    currentLinkNum: 1,
    satelliteParams: {},
    geoSatelliteParams: {},
    ngsoSatelliteParams: {},
    linkParams: {},
    calculationResults: {},
    highlightedRows: [],
    orbitType: 'GEO'
  }
});

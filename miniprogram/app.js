// app.js
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
      // 链路参数（支持8条链路）
      linkParams: {},
      // 计算结果
      calculationResults: {},
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
      adjUplinkFactor: 25,
      adjDownlinkFactor: 25,
      xpolUplinkFactor: 26,
      xpolDownlinkFactor: 26,
      intermodFactor: 21
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
      rainRate: 40,
      antennaEfficiency: 65,
      paBackoff: 5,
      feederLoss: 3.5,
      uplinkPowerControl: '否',
      uplinkAvailability: 99.90,

      // 接收站参数
      rxEarthStationLocation: '',
      rxAntennaDiameter: 3.7,
      rxLongitude: 116.4074,
      rxLatitude: 39.9042,
      rxCenterFrequency: 12.5,
      downlinkPolarization: 'H',
      rxEIRP: 46,
      rxAltitude: 0,
      rxRainRate: 40,
      rxAntennaEfficiency: 65,
      rxAntennaNoiseTemp: 35,
      rxReceiverNoiseTemp: 75,
      rxFeederLoss: 0.2,
      rxDownlinkAvailability: 99.90,

      // 载波参数
      infoRate: 2048,
      modulation: 'QPSK',
      fec: '3/4',
      rsCode: '188/204',
      m: 1.00,
      bandwidthFactor: 1.20,
      ber: 7,
      ebno: 5.50,
      margin: 3.00
    };
  },

  globalData: {
    currentLinkNum: 1,
    satelliteParams: {},
    linkParams: {},
    calculationResults: {},
    highlightedRows: []
  }
});

// app.js
const { setFullPrecisionData } = require('./utils/rainRate');
const { setFullPrecisionElevation } = require('./utils/elevation');
const pako = require('./utils/lib/pako_inflate.min.js');
const { setData: setCloudParamsData } = require('./data/cloudParamsGrid');
const { setData: setWaterVaporData } = require('./data/waterVaporGrid');

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

      // 启动即后台静默刷新 TLE：每设备「每过本地 0 点」直连 CelesTrak 拉全部分组各一次，
      // 写本地缓存（进“星座地图”直接读本机、零 CDN）并带闸门回传云存储（云端恒为当天最新、
      // 仅作兜底）。详见 utils/tleStore.js。
      try {
        require('./utils/tleStore').ensureTLEFresh();
      } catch (e) {
        console.warn('TLE 后台刷新启动失败：', e);
      }

      // 仿真平台绑定：后台自动同步（见 utils/satsimBox.js）。
      // 没绑定过就直接返回，不产生任何网络调用。
      this.satsimSync();
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

    // 后台静默【串行】下载四份 ITU-R 资源数据。
    // 必须串行：四份并发下载会同时在微信临时文件区堆多个数 MB 的临时文件，超出临时区容量后
    // 系统会清理临时文件，导致某个 success 回调里 readFileSync 报 "http://tmp/xxx.bin not found"。
    // 串行时任一时刻只占用一个临时文件，规避该问题。
    this._loadITUData();
  },

  // ITU-R 四份数据串行加载链：并发会撑爆临时文件区(见 onLaunch 注释)，故串行；
  // 任一份走缓存命中/下载成功/失败回退都返回 resolved，不阻断后续。
  _loadITUData() {
    Promise.resolve()
      .then(() => this._loadP837Data())
      .then(() => this._loadTopoData())
      .then(() => this._loadP840Data())
      .then(() => this._loadP836Data())
      .catch((e) => console.warn('[ITU] 串行加载异常:', e && e.message));
  },

  // 落盘缓存(非致命)：写 USER_DATA_PATH + 记版本号。失败只告警，
  // 不影响已注入内存的数据(例如 topo 17.85MB 超出本地文件上限写不进时，内存仍可用)。
  _persistBin(fs, localPath, arrayBuffer, versionKey, version, tag) {
    try {
      fs.writeFileSync(localPath, arrayBuffer);
      wx.setStorageSync(versionKey, version);
      console.log('[' + tag + '] 下载并缓存成功');
    } catch (e) {
      console.warn('[' + tag + '] 已注入内存，但本地缓存写入失败(下次启动将重新下载):', e.message);
    }
  },

  // ===== P.836 水汽密度数据加载 =====
  P836_CLOUD_FILE: 'cloud://cloud1-8gjv5ekx41d6fb76.636c-cloud1-8gjv5ekx41d6fb76-1385987144/P836/p836_rho_v1.bin',  // 上传 p836_rho_v1.bin 后填入 fileID（路径建议：P836/p836_rho_v1.bin）
  P836_LOCAL_PATH: wx.env.USER_DATA_PATH + '/p836_rho_v1.bin',
  P836_VERSION_KEY: 'p836_data_version',
  P836_CURRENT_VERSION: 'v1',
  P836_EXPECTED_SIZE: 161 * 321 * 2 * 2,  // 两张 Int16LE 图，206,724 bytes

  _loadP836Data() {
    if (!this.P836_CLOUD_FILE) return Promise.resolve();  // fileID 未填写时跳过
    const fs = wx.getFileSystemManager();
    const savedVersion = wx.getStorageSync(this.P836_VERSION_KEY);
    if (savedVersion === this.P836_CURRENT_VERSION) {
      try {
        const arrayBuffer = fs.readFileSync(this.P836_LOCAL_PATH);
        if (arrayBuffer && arrayBuffer.byteLength === this.P836_EXPECTED_SIZE) {
          setWaterVaporData(arrayBuffer);
          console.log('[P.836] 从本地缓存加载成功');
          return Promise.resolve();
        }
      } catch (e) {
        console.warn('[P.836] 本地缓存读取失败，重新下载:', e.message);
      }
    }
    return this._downloadP836Data(fs);
  },

  _downloadP836Data(fs) {
    console.log('[P.836] 开始后台下载水汽密度数据...');
    return new Promise((resolve) => {
      wx.cloud.downloadFile({
        fileID: this.P836_CLOUD_FILE,
        success: (res) => {
          if (res.statusCode === 200 && res.tempFilePath) {
            try {
              const arrayBuffer = fs.readFileSync(res.tempFilePath);
              if (arrayBuffer.byteLength !== this.P836_EXPECTED_SIZE) {
                console.warn('[P.836] 下载数据大小不匹配:', arrayBuffer.byteLength);
              } else {
                // 先注入内存(落盘失败也能用)，再尝试写本地缓存
                setWaterVaporData(arrayBuffer);
                this._persistBin(fs, this.P836_LOCAL_PATH, arrayBuffer, this.P836_VERSION_KEY, this.P836_CURRENT_VERSION, 'P.836');
              }
            } catch (e) {
              console.error('[P.836] 读取临时文件失败:', e.message);
            }
          } else {
            console.warn('[P.836] 下载返回异常: statusCode=', res.statusCode);
          }
          resolve();
        },
        fail: (err) => {
          console.warn('[P.836] 下载失败(将使用P.835纬度带估算):', err.errMsg);
          resolve();
        }
      });
    });
  },

  // ===== P.840 云衰参数数据加载 =====
  // 云存储文件路径 (上传 p840_logn_v1.bin 后填入实际 fileID)
  P840_CLOUD_FILE: 'cloud://cloud1-8gjv5ekx41d6fb76.636c-cloud1-8gjv5ekx41d6fb76-1385987144/P840/p840_logn_v1.bin',
  P840_LOCAL_PATH: wx.env.USER_DATA_PATH + '/p840_logn_v1.bin',
  P840_VERSION_KEY: 'p840_data_version',
  P840_CURRENT_VERSION: 'v1',
  P840_EXPECTED_SIZE: 721 * 1441 * 3 * 2, // 6,233,766 bytes (Int16 ×3图)

  _loadP840Data() {
    const fs = wx.getFileSystemManager();
    const savedVersion = wx.getStorageSync(this.P840_VERSION_KEY);

    // 优先尝试加载本地缓存
    if (savedVersion === this.P840_CURRENT_VERSION) {
      try {
        const arrayBuffer = fs.readFileSync(this.P840_LOCAL_PATH);
        if (arrayBuffer && arrayBuffer.byteLength === this.P840_EXPECTED_SIZE) {
          setCloudParamsData(arrayBuffer);
          console.log('[P.840] 从本地缓存加载成功');
          return Promise.resolve();
        }
      } catch (e) {
        console.warn('[P.840] 本地缓存读取失败，重新下载:', e.message);
      }
    }

    // 后台下载
    return this._downloadP840Data(fs);
  },

  _downloadP840Data(fs) {
    console.log('[P.840] 开始后台下载全精度云参数...');
    return new Promise((resolve) => {
      wx.cloud.downloadFile({
        fileID: this.P840_CLOUD_FILE,
        success: (res) => {
          if (res.statusCode === 200 && res.tempFilePath) {
            try {
              const arrayBuffer = fs.readFileSync(res.tempFilePath);
              if (arrayBuffer.byteLength !== this.P840_EXPECTED_SIZE) {
                console.warn('[P.840] 下载数据大小不匹配:', arrayBuffer.byteLength);
              } else {
                // 先注入内存(落盘失败也能用)，再尝试写本地缓存
                setCloudParamsData(arrayBuffer);
                this._persistBin(fs, this.P840_LOCAL_PATH, arrayBuffer, this.P840_VERSION_KEY, this.P840_CURRENT_VERSION, 'P.840');
              }
            } catch (e) {
              console.error('[P.840] 读取临时文件失败:', e.message);
            }
          } else {
            console.warn('[P.840] 下载返回异常: statusCode=', res.statusCode);
          }
          resolve();
        },
        fail: (err) => {
          console.warn('[P.840] 下载失败(将使用保守回退表):', err.errMsg);
          resolve();
        }
      });
    });
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
          return Promise.resolve();
        }
      } catch (e) {
        console.warn('[P.837] 本地缓存读取失败，重新下载:', e.message);
      }
    }

    // 后台下载
    return this._downloadP837Data(fs);
  },

  _downloadP837Data(fs) {
    console.log('[P.837] 开始后台下载全精度数据...');
    return new Promise((resolve) => {
      wx.cloud.downloadFile({
        fileID: this.P837_CLOUD_FILE,
        success: (res) => {
          if (res.statusCode === 200 && res.tempFilePath) {
            try {
              // 读取临时文件
              const arrayBuffer = fs.readFileSync(res.tempFilePath);
              if (arrayBuffer.byteLength !== this.P837_EXPECTED_SIZE) {
                console.warn('[P.837] 下载数据大小不匹配:', arrayBuffer.byteLength);
              } else {
                // 先注入 rainRate 模块(落盘失败也能用)，再尝试写本地缓存
                setFullPrecisionData(arrayBuffer);
                this._persistBin(fs, this.P837_LOCAL_PATH, arrayBuffer, this.P837_VERSION_KEY, this.P837_CURRENT_VERSION, 'P.837');
              }
            } catch (e) {
              console.error('[P.837] 读取临时文件失败:', e.message);
            }
          } else {
            console.warn('[P.837] 下载返回异常: statusCode=', res.statusCode);
          }
          resolve();
        },
        fail: (err) => {
          console.warn('[P.837] 下载失败(将使用0.5°近似数据):', err.errMsg);
          resolve();
        }
      });
    });
  },

  // ===== P.1511 海拔数据加载 =====
  // 云存储现在只放 gzip 无损压缩包 topo_v1.gz(≈4.32MB, 原 17.85MB)。
  // 下载后用 pako 解压成 Int16 二进制再注入; 本地缓存仍存解压后的 bin,
  // 因此 pako 只在"首次下载"时跑一次, 热启动读本地缓存与旧版完全一致。
  // ↓ 上传 topo_v1.gz 后填入对应 fileID
  TOPO_CLOUD_FILE: 'cloud://cloud1-8gjv5ekx41d6fb76.636c-cloud1-8gjv5ekx41d6fb76-1385987144/TOPO/topo_v1.gz',
  TOPO_LOCAL_PATH: wx.env.USER_DATA_PATH + '/topo_v1.bin', // 本地缓存=解压后的 bin
  TOPO_VERSION_KEY: 'topo_data_version',
  TOPO_CURRENT_VERSION: 'v2', // v1→v2: 数据源改 gzip, 让旧缓存失效重新下载
  TOPO_EXPECTED_SIZE: 2164 * 4324 * 2, // 18,714,272 bytes (int16, 解压后)

  _loadTopoData() {
    const fs = wx.getFileSystemManager();
    const savedVersion = wx.getStorageSync(this.TOPO_VERSION_KEY);

    // 优先尝试加载本地缓存
    if (savedVersion === this.TOPO_CURRENT_VERSION) {
      try {
        const arrayBuffer = fs.readFileSync(this.TOPO_LOCAL_PATH);
        if (arrayBuffer && arrayBuffer.byteLength === this.TOPO_EXPECTED_SIZE) {
          setFullPrecisionElevation(arrayBuffer);
          console.log('[P.1511] 从本地缓存加载成功');
          return Promise.resolve();
        }
      } catch (e) {
        console.warn('[P.1511] 本地缓存读取失败，重新下载:', e.message);
      }
    }

    // 后台下载
    return this._downloadTopoData(fs);
  },

  _downloadTopoData(fs) {
    console.log('[P.1511] 开始后台下载全精度海拔数据(gzip)...');
    return new Promise((resolve) => {
      wx.cloud.downloadFile({
        fileID: this.TOPO_CLOUD_FILE,
        success: (res) => {
          if (res.statusCode === 200 && res.tempFilePath) {
            try {
              // 下载到的是 gzip 压缩包, 先解压成 Int16 二进制
              const gzBuf = fs.readFileSync(res.tempFilePath);
              const inflated = pako.inflate(new Uint8Array(gzBuf)); // Uint8Array
              if (inflated.byteLength !== this.TOPO_EXPECTED_SIZE) {
                console.warn('[P.1511] 解压后数据大小不匹配:', inflated.byteLength);
              } else {
                // pako 输出可能是大 buffer 上的子视图, 取精确长度的 ArrayBuffer 再用
                const arrayBuffer = (inflated.byteOffset === 0 && inflated.buffer.byteLength === inflated.byteLength)
                  ? inflated.buffer
                  : inflated.buffer.slice(inflated.byteOffset, inflated.byteOffset + inflated.byteLength);
                // 先注入 elevation 模块(落盘失败也能用)，再尝试写本地缓存(解压后的 bin, 热启动直接读)
                setFullPrecisionElevation(arrayBuffer);
                this._persistBin(fs, this.TOPO_LOCAL_PATH, arrayBuffer, this.TOPO_VERSION_KEY, this.TOPO_CURRENT_VERSION, 'P.1511');
              }
            } catch (e) {
              console.error('[P.1511] 解压/读取失败:', e.message);
            }
          } else {
            console.warn('[P.1511] 下载返回异常: statusCode=', res.statusCode);
          }
          resolve();
        },
        fail: (err) => {
          console.warn('[P.1511] 下载失败(海拔自动填充将不可用):', err.errMsg);
          resolve();
        }
      });
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
      sfdGtRef: 0, // SFD 的参考 G/T(dB/K)，引擎入口换算回 G/T=0 参考
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
      xpdrIntermodFactor: 21
    };
  },

    // 获取默认链路参数 - 完全对齐 index.html
  getDefaultLinkParams() {
    return {
      // 上行站参数
      earthStationLocation: '北京',
      antennaDiameter: 6.2,
      longitude: 116.4074,
      latitude: 39.9042,
      centerFrequency: 14.25,
      uplinkPolarization: 'V',
      G_Ts: 2,
      altitude: 47,
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
      rxEarthStationLocation: '北京',
      rxAntennaDiameter: 3.7,
      rxLongitude: 116.4074,
      rxLatitude: 39.9042,
      rxCenterFrequency: 12.5,
      downlinkPolarization: 'H',
      rxEIRP: 46,
      rxAltitude: 47,
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

  // 回到前台也同步一次：用户常常是「在电脑上发完，立刻掏出手机看」，
  // 这时小程序多半已经在后台开着，只有 onShow 会触发。satsimBox 自带 60s 节流，不怕频繁。
  onShow: function () { this.satsimSync(); },

  // 后台静默同步。全程吞异常：这是个背景任务，没绑定 / 没网 / 云函数没部署都不该打扰用户。
  //
  // ★ 本地没码 ≠ 没绑过：换了手机、或清过缓存的用户，码在云端（按 openid 存）。这里若只看本地
  //   就直接返回，那台设备的自动同步等于【永远关着】，而用户完全看不出来 —— 平台照投不误，
  //   只是没人取。故本地无码时去云端找回一次（recoverCh 自带一天一次的节流，见 satsimBox.js）。
  satsimSync: function () {
    try {
      const box = require('./utils/satsimBox');
      if (box.getCh()) { this.satsimPull(box); return; }
      box.recoverCh()
        .then((ch) => { if (ch) this.satsimPull(box); })
        .catch((e) => console.warn('[satsim] 认证码找回失败：', e));
    } catch (e) {
      console.warn('[satsim] 自动同步启动失败：', e);
    }
  },

  satsimPull: function (box) {
    box.syncNow().then((r) => {
      if (!r || !r.ok || !r.n) return;
      this.globalData = this.globalData || {};
      this.globalData.satsimLastSync = r;
      // 全自动同步下用户不知道发生了什么，给一句。延迟让首屏先渲染完，免得和页面自己的 loading 打架。
      const parts = [];
      if (r.cfg) parts.push(r.cfg + ' 份配置');
      if (r.plan) parts.push(r.plan + ' 份频率计划');
      if (r.gxt) parts.push(r.gxt + ' 份覆盖');
      setTimeout(() => {
        wx.showToast({ title: '已同步 ' + parts.join(' · '), icon: 'none', duration: 2400 });
      }, 1200);
    }).catch((e) => console.warn('[satsim] 自动同步失败：', e));
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

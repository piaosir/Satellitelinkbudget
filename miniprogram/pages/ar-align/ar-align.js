// ar-align.js
const app = getApp();
const { calculateSatelliteAngle } = require('../../utils/linkCalculator');

Page({
  data: {
    // 阶段: 'input' 输入轨位, 'ar' AR对星
    stage: 'input',
    
    // 系统信息
    platform: '', // 平台信息：ios, android, devtools
    
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
      { "name": "AsiaSat 9", "position": "122" }
    ],
    satelliteIndex: 0,
    orbitPosition: '125',
    orbitDisplay: 'CHINASAT 6D (125°E)',
    
    // 用户位置
    userLatitude: 0,
    userLongitude: 0,
    
    // 设备方向
    deviceAlpha: 0,  // 设备方向角度 (0-360)
    deviceBeta: 0,   // 前后倾斜 (-180 到 180)
    deviceGamma: 0,  // 左右倾斜 (-90 到 90)
    compassDirection: 0,  // 罗盘方向 (0-360)
    
    // 卫星位置计算结果（目标角度）
    azimuth: 0,      // 目标方位角
    elevation: 0,    // 目标仰角
    
    // 手机当前指向（实时角度）
    currentAzimuth: 0,    // 当前方位角
    currentElevation: 0,  // 当前仰角
    
    // AR状态
    satelliteVisible: false,
    satelliteX: 0,
    satelliteY: 0,
    isAligned: false,
    isAtEdge: false,
    offsetDistance: 0,
    showTip: true,
    lastAlignedState: false,
    
    // 传感器数据平滑 - 减少历史记录以提高跟手性
    sensorHistory: [],
    historySize: 2,
    
    // 屏幕尺寸
    screenWidth: 0,
    screenHeight: 0,
    
    // 加载状态
    loading: false,
    loadingText: ''
  },

  onLoad() {
    this._androidState = {
      enabled: false,
      calibrating: false,
      calibrationStartTs: 0,
      lastRenderTs: 0,
      renderIntervalMs: 50,
      elevationSamples: [],
      headingDiffSamples: [],
      pitchSamples: [],
      rollSamples: [],
      headingWindow: [],
      elevationWindow: [],
      azimuthOffset: 0,
      elevationOffset: 0,
      pitchZero: 0,
      rollZero: 0,
      headingJitter: 0,
      smoothedAzimuth: null,
      smoothedElevation: null
    };

    // 获取屏幕尺寸和系统信息
    const windowInfo = wx.getWindowInfo();
    const deviceInfo = wx.getDeviceInfo();
    console.log('系统信息:', {
      platform: deviceInfo.platform,
      system: deviceInfo.system,
      model: deviceInfo.model
    });
    
    this.setData({
      screenWidth: windowInfo.windowWidth,
      screenHeight: windowInfo.windowHeight,
      platform: deviceInfo.platform // 保存平台信息用于后续判断
    });

    this._androidState.enabled = deviceInfo.platform === 'android';
  },

  onUnload() {
    // 停止监听传感器
    this.stopSensors();
  },

  // 选择卫星
  onSatelliteChange(e) {
    const index = parseInt(e.detail.value);
    const satellite = this.data.satellites[index];
    
    this.setData({
      satelliteIndex: index,
      orbitPosition: satellite.position,
      orbitDisplay: `${satellite.name} (${satellite.position}°E)`
    });
  },

  // 开始AR对星
  async startAR() {
    const { orbitPosition } = this.data;
    
    // 验证输入
    if (!orbitPosition) {
      wx.showToast({
        title: '请选择卫星',
        icon: 'none'
      });
      return;
    }
    
    const position = parseFloat(orbitPosition);
    if (isNaN(position) || position < 0 || position > 180) {
      wx.showToast({
        title: '卫星轨位数据异常',
        icon: 'none'
      });
      return;
    }
    
    this.setData({
      loading: true,
      loadingText: '正在获取定位...'
    });
    
    try {
      // 1. 获取用户位置
      await this.getUserLocation();
      
      // 2. 计算卫星方位角和仰角
      this.calculateSatellitePosition();
      
      // 3. 请求相机权限
      await this.requestCameraPermission();
      
      // 4. 启动传感器
      this.startSensors();
      
      // 5. 切换到AR阶段
      this.setData({
        stage: 'ar',
        loading: false
      });
      
      // 6. 3秒后隐藏提示
      setTimeout(() => {
        this.setData({
          showTip: false
        });
      }, 3000);
      
    } catch (error) {
      console.error('启动AR失败:', error);
      this.setData({
        loading: false
      });
      wx.showToast({
        title: error.message || '启动失败',
        icon: 'none'
      });
    }
  },

  // 获取用户位置
  getUserLocation() {
    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          console.log('用户位置:', res);
          this.setData({
            userLatitude: res.latitude,
            userLongitude: res.longitude
          });
          resolve(res);
        },
        fail: (err) => {
          console.error('获取位置失败:', err);
          reject(new Error('无法获取位置信息，请检查定位权限'));
        }
      });
    });
  },

  // 请求相机权限
  requestCameraPermission() {
    return new Promise((resolve, reject) => {
      wx.authorize({
        scope: 'scope.camera',
        success: () => {
          resolve();
        },
        fail: () => {
          // 如果拒绝，引导用户打开设置
          wx.showModal({
            title: '需要相机权限',
            content: '请在设置中开启相机权限',
            confirmText: '去设置',
            success: (res) => {
              if (res.confirm) {
                wx.openSetting({
                  success: (settingRes) => {
                    if (settingRes.authSetting['scope.camera']) {
                      resolve();
                    } else {
                      reject(new Error('未授权相机权限'));
                    }
                  }
                });
              } else {
                reject(new Error('未授权相机权限'));
              }
            }
          });
        }
      });
    });
  },

  // 计算卫星方位角和仰角
  calculateSatellitePosition() {
    const { userLatitude, userLongitude, orbitPosition } = this.data;
    
    // 将轨位转换为实际经度（所有卫星都是东经）
    let satelliteLongitude = parseFloat(orbitPosition);
    
    // 使用链路计算中的标准算法计算方位角和仰角
    const result = calculateSatelliteAngle(
      userLatitude,
      userLongitude,
      satelliteLongitude
    );
    
    console.log('卫星位置计算结果:', result);
    
    this.setData({
      azimuth: result.azimuth.toFixed(1),
      elevation: result.elevation.toFixed(1),
      satelliteVisible: true
    }, () => {
      // 计算完成后立即更新卫星图标位置
      this.updateSatellitePosition();
    });
  },

  // 启动传感器监听
  startSensors() {
    console.log('开始启动传感器...');
    
    // 先停止可能存在的旧监听
    this.stopSensors();

    if (this._androidState && this._androidState.enabled) {
      this._androidState.calibrating = true;
      this._androidState.calibrationStartTs = Date.now();
      this._androidState.lastRenderTs = 0;
      this._androidState.elevationSamples = [];
      this._androidState.headingDiffSamples = [];
      this._androidState.pitchSamples = [];
      this._androidState.rollSamples = [];
      this._androidState.headingWindow = [];
      this._androidState.elevationWindow = [];
      this._androidState.azimuthOffset = 0;
      this._androidState.elevationOffset = 0;
      this._androidState.pitchZero = 0;
      this._androidState.rollZero = 0;
      this._androidState.headingJitter = 0;
      this._androidState.smoothedAzimuth = null;
      this._androidState.smoothedElevation = null;
    }
    
    // 监听设备方向变化
    wx.onDeviceMotionChange((res) => {
      if (this._androidState && this._androidState.enabled) {
        // Android: 直接使用原始传感器值，不做预平滑
        // AR需要零延迟跟踪，预平滑会让图标跟着镜头漂移
        this.data.deviceAlpha = res.alpha || 0;
        this.data.deviceBeta = res.beta || 0;
        this.data.deviceGamma = res.gamma || 0;
        this.collectAndroidCalibrationSamples();
      } else {
        // iOS: 保留原有加权平均
        const smoothedData = this.smoothSensorData({
          alpha: res.alpha || 0,
          beta: res.beta || 0,
          gamma: res.gamma || 0
        });
        this.data.deviceAlpha = smoothedData.alpha;
        this.data.deviceBeta = smoothedData.beta;
        this.data.deviceGamma = smoothedData.gamma;
      }
      
      // 实时更新卫星位置
      this.updateSatellitePosition();
    });
    
    // 罗盘监听：iOS用作主方位角源，Android用于交叉验证旋转矩阵结果
    const isAndroid = this._androidState && this._androidState.enabled;
    wx.onCompassChange((res) => {
      let direction = res.direction || 0;
      direction = this.normalizeAngle(direction);
      this.data.compassDirection = direction;
      
      // 仅iOS通过罗盘触发位置更新；Android由DeviceMotion触发
      if (!isAndroid) {
        this.updateSatellitePosition();
      }
    });
    
    // 启动设备方向监听 - 使用最快的更新频率
    wx.startDeviceMotionListening({
      interval: 'ui',
      success: () => {
        console.log('✓ 设备方向传感器启动成功');
      },
      fail: (err) => {
        console.error('✗ 启动设备方向传感器失败:', err);
        wx.showModal({
          title: '传感器启动失败',
          content: '设备方向传感器无法启动，AR功能可能无法正常使用。请确保您的设备支持陀螺仪。',
          showCancel: false
        });
      }
    });
    
    // 双平台启动罗盘：iOS用作主航向，Android用于交叉校验
    wx.startCompass({
      success: () => {
        console.log('✓ 罗盘启动成功' + (isAndroid ? '（Android用于交叉验证）' : ''));
      },
      fail: (err) => {
        console.error('✗ 启动罗盘失败:', err);
        if (!isAndroid) {
          wx.showModal({
            title: '罗盘启动失败',
            content: '罗盘传感器无法启动，AR功能可能无法正常使用。请确保您的设备支持磁力计（罗盘）并已授权相关权限。',
            showCancel: false
          });
        }
      }
    });
    if (isAndroid) {
      console.log('✓ Android平台：旋转矩阵解算方位 + 罗盘交叉验证');
    }
    
    // 延迟检查传感器是否正常工作
    setTimeout(() => {
      const { deviceBeta } = this.data;
      if (deviceBeta === 0 && (!isAndroid && this.data.compassDirection === 0)) {
        console.warn('⚠ 传感器可能未正常工作');
      } else {
        console.log('✓ 传感器数据正常接收中');
      }
    }, 800);
  },

  // Android专用：收集启动阶段样本并自动校准
  collectAndroidCalibrationSamples() {
    const state = this._androidState;
    if (!state || !state.enabled || !state.calibrating) {
      return;
    }

    const now = Date.now();
    const elapsed = now - state.calibrationStartTs;
    const { deviceAlpha, deviceBeta, deviceGamma, compassDirection } = this.data;
    const levelAngles = this.calculateLevelAngles(deviceBeta || 0, deviceGamma || 0);

    const elevationRaw = this.calculateDeviceElevation(deviceBeta || 0, deviceGamma || 0);
    if (Number.isFinite(elevationRaw)) {
      state.elevationSamples.push(elevationRaw);
    }

    if (Number.isFinite(levelAngles.pitch)) {
      state.pitchSamples.push(levelAngles.pitch);
    }

    if (Number.isFinite(levelAngles.roll)) {
      state.rollSamples.push(levelAngles.roll);
    }

    if (Number.isFinite(deviceAlpha) && Number.isFinite(compassDirection)) {
      const alpha = this.normalizeAngle(deviceAlpha || 0);
      const compass = this.normalizeAngle(compassDirection || 0);
      const diff = this.angleDifference(compass, alpha);
      state.headingDiffSamples.push(diff);
    }

    if (elapsed < 1200 && state.elevationSamples.length < 24) {
      return;
    }

    // 安卓机型差异较大，自动方向偏置容易引入大误差，保守策略不自动改方位零点
    state.elevationOffset = 0;
    state.azimuthOffset = 0;
    state.pitchZero = 0;
    state.rollZero = 0;
    state.calibrating = false;

    console.log('Android校准完成:', {
      elevationOffset: state.elevationOffset.toFixed(2),
      azimuthOffset: state.azimuthOffset.toFixed(2),
      pitchZero: state.pitchZero.toFixed(2),
      rollZero: state.rollZero.toFixed(2),
      samples: {
        elevation: state.elevationSamples.length,
        heading: state.headingDiffSamples.length,
        pitch: state.pitchSamples.length,
        roll: state.rollSamples.length
      }
    });
  },

  computeMedian(values) {
    if (!values || !values.length) {
      return 0;
    }
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  },

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },

  pushLimited(list, value, limit) {
    list.push(value);
    if (list.length > limit) {
      list.shift();
    }
  },

  computeCircularMean(values) {
    if (!values || !values.length) {
      return 0;
    }
    let sinSum = 0;
    let cosSum = 0;
    for (let i = 0; i < values.length; i++) {
      const rad = values[i] * Math.PI / 180;
      sinSum += Math.sin(rad);
      cosSum += Math.cos(rad);
    }
    const meanRad = Math.atan2(sinSum / values.length, cosSum / values.length);
    return this.normalizeAngle(meanRad * 180 / Math.PI);
  },

  // 水平仪式姿态：拆分俯仰/横滚并做安全夹角
  calculateLevelAngles(beta, gamma) {
    let pitch = beta;
    while (pitch > 180) pitch -= 360;
    while (pitch < -180) pitch += 360;
    pitch = this.clamp(pitch, -90, 90);

    let roll = gamma;
    while (roll > 180) roll -= 360;
    while (roll < -180) roll += 360;
    roll = this.clamp(roll, -90, 90);

    return { pitch, roll };
  },

  // 停止传感器监听
  stopSensors() {
    console.log('停止传感器监听...');
    try {
      wx.stopDeviceMotionListening({
        success: () => {
          console.log('✓ 设备方向监听已停止');
        }
      });
    } catch (e) {
      console.log('停止设备方向监听异常:', e);
    }
    
    try {
      wx.stopCompass({
        success: () => {
          console.log('✓ 罗盘监听已停止');
        }
      });
    } catch (e) {
      console.log('停止罗盘监听异常:', e);
    }
    
    // 移除事件监听
    wx.offDeviceMotionChange();
    wx.offCompassChange();
  },

  // 传感器数据平滑处理 - 优化为加权平均，提高跟手性
  smoothSensorData(newData) {
    const { sensorHistory, historySize } = this.data;
    
    // 添加新数据到历史记录
    sensorHistory.push(newData);
    
    // 保持历史记录大小
    if (sensorHistory.length > historySize) {
      sensorHistory.shift();
    }
    
    // 使用加权平均：最新数据权重更大
    // 权重: 最新=0.7, 次新=0.3 (当historySize=2时)
    // 这样可以在保持一定平滑度的同时提高响应速度
    if (sensorHistory.length === 1) {
      return newData;
    }
    
    const weights = sensorHistory.length === 2 ? [0.3, 0.7] : [0.2, 0.3, 0.5];
    let totalWeight = 0;
    const weighted = sensorHistory.reduce((acc, data, index) => {
      const weight = weights[index] || (1 / sensorHistory.length);
      totalWeight += weight;
      return {
        alpha: acc.alpha + data.alpha * weight,
        beta: acc.beta + data.beta * weight,
        gamma: acc.gamma + data.gamma * weight
      };
    }, { alpha: 0, beta: 0, gamma: 0 });
    
    return {
      alpha: weighted.alpha / totalWeight,
      beta: weighted.beta / totalWeight,
      gamma: weighted.gamma / totalWeight
    };
  },
  
  // 角度归一化到0-360范围
  normalizeAngle(angle) {
    let normalized = angle % 360;
    if (normalized < 0) {
      normalized += 360;
    }
    return normalized;
  },
  
  // 计算两个角度之间的最小差值（考虑360度循环）
  angleDifference(angle1, angle2) {
    let diff = angle1 - angle2;
    // 处理跨越0/360度边界的情况
    if (diff > 180) {
      diff -= 360;
    } else if (diff < -180) {
      diff += 360;
    }
    return diff;
  },
  
  // 计算设备指向的俯仰角（考虑三维旋转）
  // beta: 前后倾斜角 (-180 到 180)
  // gamma: 左右倾斜角 (-90 到 90)
  // 返回: 俯仰角 (-90 到 90)，正值表示向上，负值表示向下
  calculateDeviceElevation(beta, gamma) {
    // 标准化beta到-180到180范围
    while (beta > 180) beta -= 360;
    while (beta < -180) beta += 360;
    
    // 转换为弧度
    const betaRad = beta * Math.PI / 180;
    const gammaRad = gamma * Math.PI / 180;
    
    // 计算设备背面（相机方向）的指向向量
    // 设备坐标系：X轴向右，Y轴向前（屏幕顶部方向），Z轴向上（屏幕法线）
    // 相机朝向是-Z方向（屏幕背面）
    
    // 初始相机方向向量（设备平放时）: [0, 0, -1]
    // 应用旋转变换
    
    // 先应用gamma旋转（绕Y轴，左右倾斜）
    // 再应用beta旋转（绕X轴，前后倾斜）
    
    // 旋转后的向量 Z 分量
    // 使用旋转矩阵计算：R = Rx(beta) * Ry(gamma)
    const cosB = Math.cos(betaRad);
    const sinB = Math.sin(betaRad);
    const cosG = Math.cos(gammaRad);
    const sinG = Math.sin(gammaRad);
    
    // 相机初始方向 [0, 0, -1] 经过旋转后的向量
    // x = sinG * sinB
    // y = -sinB * cosG
    // z = -cosB * cosG
    
    const z = -cosB * cosG;
    
    // 计算俯仰角：向量与水平面的夹角
    // elevation = arcsin(z)
    let elevation = Math.asin(Math.max(-1, Math.min(1, z))) * 180 / Math.PI;
    
    // 确保在-90到90范围内
    elevation = Math.max(-90, Math.min(90, elevation));
    
    return elevation;
  },

  // 从DeviceMotion的alpha/beta/gamma解算相机指向的罗盘方位角
  // 原理：构建完整的ZXY旋转矩阵，将相机方向向量[0,0,-1]投影到地球坐标系的水平面
  // 这与安卓SensorManager.getOrientation()的方法一致
  computeHeadingFromMotion(alpha, beta, gamma) {
    const alphaRad = (alpha || 0) * Math.PI / 180;
    const betaRad = (beta || 0) * Math.PI / 180;
    const gammaRad = (gamma || 0) * Math.PI / 180;

    const cA = Math.cos(alphaRad);
    const sA = Math.sin(alphaRad);
    const sB = Math.sin(betaRad);
    const cG = Math.cos(gammaRad);
    const sG = Math.sin(gammaRad);

    // R = Rz(alpha) * Rx(beta) * Ry(gamma)  (W3C DeviceOrientation标准)
    // 相机方向 [0,0,-1] 在地球坐标系中的投影：
    // east  = -R[0][2] = -(cA*sG + sA*sB*cG)
    // north = -R[1][2] = -(sA*sG - cA*sB*cG)
    const east  = -(cA * sG + sA * sB * cG);
    const north = -(sA * sG - cA * sB * cG);

    // 方位角 = atan2(东向分量, 北向分量)，顺时针为正
    let heading = Math.atan2(east, north) * 180 / Math.PI;
    if (heading < 0) heading += 360;

    return heading;
  },

  // 更新卫星图标位置 - 优化版（高性能、高跟手性）
  updateSatellitePosition() {
    if (this._androidState && this._androidState.enabled) {
      return this.updateSatellitePositionAndroid();
    }

    return this.updateSatellitePositionIOS();
  },

  // iOS路径：保留现有实现
  updateSatellitePositionIOS() {
    // 直接从 this.data 读取最新数据，避免解构的性能开销
    const compassDirection = this.data.compassDirection;
    const deviceBeta = this.data.deviceBeta;
    const deviceGamma = this.data.deviceGamma;
    const azimuth = this.data.azimuth;
    const elevation = this.data.elevation;
    const screenWidth = this.data.screenWidth;
    const screenHeight = this.data.screenHeight;
    
    // 快速验证：如果关键数据无效则直接返回
    if ((azimuth === '' || azimuth === null || azimuth === undefined) ||
        (elevation === '' || elevation === null || elevation === undefined) ||
        compassDirection === null || deviceBeta === null) {
      return;
    }
    
    // 计算视场角 (典型手机相机视场角)
    const fovH = 68; // 水平视场角
    const fovV = 51; // 垂直视场角
    
    // 使用新的方法计算当前俯仰角（-90到90度）
    const currentElevation = this.calculateDeviceElevation(deviceBeta, deviceGamma);

    // 归一化角度 - 使用罗盘方向作为当前方位角
    let currentAzimuth = this.normalizeAngle(compassDirection);

    // 修复：当仰角大于45度时，方位角会错误反转180度，这里进行补偿
    if (currentElevation > 45) {
      currentAzimuth = this.normalizeAngle(currentAzimuth + 180);
    }

    const targetAzimuth = this.normalizeAngle(parseFloat(azimuth));
    const targetElevation = parseFloat(elevation);
    
    // 计算角度差值（目标相对于当前的偏移）
    // 注意：这里是 目标 - 当前，表示目标在当前视角的哪个方向
    const azimuthDiff = this.angleDifference(targetAzimuth, currentAzimuth);
    const elevationDiff = targetElevation - currentElevation;
    
    // 提前计算偏差距离用于判断
    const offsetDistance = Math.sqrt(
      Math.pow(azimuthDiff, 2) + Math.pow(elevationDiff, 2)
    );
    
    // 判断是否对准（偏差小于3度）
    const isAligned = offsetDistance < 3.0;
    
    // 调试输出（可选，低频率）
    if (Math.random() < 0.02) { // 2%概率输出，减少日志开销
      console.log('AR实时更新 - 方位差:', azimuthDiff.toFixed(1), '° 仰角差:', elevationDiff.toFixed(1), 
                  '° 偏差:', offsetDistance.toFixed(1), '°');
    }
    
    // 将角度差转换为屏幕坐标偏移
    // 
    // 原理说明：
    // - 相机视场角 fovH/fovV 是从左到右/从上到下的完整角度范围
    // - 屏幕中心对应相机视线的正中央
    // - 从中心到任一边缘对应的角度是 fovH/2 或 fovV/2
    // 
    // 坐标转换：
    // - 当 azimuthDiff = fovH/2 时，目标在视野的最右侧边缘，xOffset = screenWidth/2
    // - 当 azimuthDiff = -fovH/2 时，目标在视野的最左侧边缘，xOffset = -screenWidth/2
    // - 因此：xOffset = azimuthDiff / (fovH/2) * (screenWidth/2)
    // 
    // azimuthDiff > 0：目标在当前视角的右侧
    // elevationDiff > 0：目标在当前视角的上方（yOffset为负，因为屏幕Y轴向下）
    let xOffset = (azimuthDiff / (fovH/2)) * (screenWidth/2);
    let yOffset = -(elevationDiff / (fovV/2)) * (screenHeight/2);
    
    // 屏幕中心坐标
    const centerX = screenWidth / 2;
    const centerY = screenHeight / 2;
    
    // 计算理想卫星位置（未限制）
    let satelliteX = centerX + xOffset;
    let satelliteY = centerY + yOffset;
    
    // 检查卫星是否在屏幕可见范围内
    const isInView = Math.abs(azimuthDiff) < fovH / 2 && 
                     Math.abs(elevationDiff) < fovV / 2;
    
    // 如果超出视距，将图标限制在屏幕边缘
    const margin = 10; // 距离边缘的边距（像素）
    let isAtEdge = false;
    
    if (!isInView) {
      isAtEdge = true;
      
      // 计算从屏幕中心到卫星位置的向量
      const dx = satelliteX - centerX;
      const dy = satelliteY - centerY;
      
      // 计算屏幕边界（考虑边距）
      const minX = margin;
      const maxX = screenWidth - margin;
      const minY = margin;
      const maxY = screenHeight - margin;
      
      // 如果超出边界，将图标投影到屏幕边缘
      if (satelliteX < minX || satelliteX > maxX || satelliteY < minY || satelliteY > maxY) {
        // 计算与各边界的交点
        const angle = Math.atan2(dy, dx);
        
        // 测试与四个边的交点
        const intersections = [];
        
        // 左边界
        if (dx < 0) {
          const t = (minX - centerX) / dx;
          const y = centerY + dy * t;
          if (y >= minY && y <= maxY) {
            intersections.push({ x: minX, y: y, dist: Math.abs(t) });
          }
        }
        
        // 右边界
        if (dx > 0) {
          const t = (maxX - centerX) / dx;
          const y = centerY + dy * t;
          if (y >= minY && y <= maxY) {
            intersections.push({ x: maxX, y: y, dist: Math.abs(t) });
          }
        }
        
        // 上边界
        if (dy < 0) {
          const t = (minY - centerY) / dy;
          const x = centerX + dx * t;
          if (x >= minX && x <= maxX) {
            intersections.push({ x: x, y: minY, dist: Math.abs(t) });
          }
        }
        
        // 下边界
        if (dy > 0) {
          const t = (maxY - centerY) / dy;
          const x = centerX + dx * t;
          if (x >= minX && x <= maxX) {
            intersections.push({ x: x, y: maxY, dist: Math.abs(t) });
          }
        }
        
        // 选择最近的交点
        if (intersections.length > 0) {
          intersections.sort((a, b) => a.dist - b.dist);
          satelliteX = intersections[0].x;
          satelliteY = intersections[0].y;
        }
      }
    }
    
    // 使用前面计算的 offsetDistance 和 isAligned
    // 批量更新UI，只调用一次setData以提高性能
    this.setData({
      satelliteX: satelliteX,
      satelliteY: satelliteY,
      offsetDistance: offsetDistance.toFixed(1),
      isAligned: isAligned,
      satelliteVisible: true,
      isAtEdge: isAtEdge,
      currentAzimuth: currentAzimuth.toFixed(1),
      currentElevation: currentElevation.toFixed(1)
    });
    
    // 对准时震动反馈
    if (isAligned && !this.data.lastAlignedState) {
      wx.vibrateShort({
        type: 'medium'
      });
    }
    
    // 保存上一次对准状态
    this.data.lastAlignedState = isAligned;
  },

  // Android路径：使用正确的3D俯仰公式 + 单层自适应平滑 + 渲染节流
  updateSatellitePositionAndroid() {
    const state = this._androidState;
    if (!state) {
      return;
    }

    // AR模式：尽量降低延迟，让图标锚定在真实世界位置
    // 只做最小的渲染节流防止setData过频（16ms ≈ 60fps）
    const now = Date.now();
    if (now - state.lastRenderTs < 16) {
      return;
    }
    state.lastRenderTs = now;

    const deviceAlpha = this.data.deviceAlpha;
    const deviceBeta = this.data.deviceBeta;
    const deviceGamma = this.data.deviceGamma;
    const azimuth = this.data.azimuth;
    const elevation = this.data.elevation;
    const screenWidth = this.data.screenWidth;
    const screenHeight = this.data.screenHeight;

    if ((azimuth === '' || azimuth === null || azimuth === undefined) ||
        (elevation === '' || elevation === null || elevation === undefined) ||
        deviceAlpha === null || deviceAlpha === undefined || deviceBeta === null) {
      return;
    }

    const fovH = 68;
    const fovV = 51;

    // ==== 微信小程序已知平台差异（微信开放社区多次确认，官方从未修复）：====
    // Android alpha: 磁北顺时针递增（罗盘约定）→ 需转为W3C逆时针数学约定
    // Android beta/gamma: 与iOS/W3C方向相反 → 取反
    //
    // 关键修正：不能直接拿 alpha 当方位角！
    // alpha 是欧拉角绕Z轴的分量，只有手机完全竖直(β=90°,γ=0°)时才等于相机朝向。
    // 手机一倾斜，相机光轴的水平投影就偏离 alpha，误差可达数十度。
    // 正确做法：用完整旋转矩阵 Rz(α)·Rx(β)·Ry(γ) 将相机方向[0,0,-1]
    // 投影到地球坐标系，再用 atan2 求水平方位角。

    // ---- 步骤1：Android传感器值 → W3C标准坐标系 ----
    const alpha_wc = this.normalizeAngle(360 - (deviceAlpha || 0));  // 顺时针→逆时针
    const beta_wc = -(deviceBeta || 0);   // 符号取反
    const gamma_wc = -(deviceGamma || 0); // 符号取反

    // ---- 步骤2：完整旋转矩阵求相机方位角（正确处理所有倾斜姿态）----
    const rawAzimuth = this.computeHeadingFromMotion(alpha_wc, beta_wc, gamma_wc);

    // ---- 步骤3：旋转矩阵Z分量求仰角 ----
    const rawElevation = this.calculateDeviceElevation(beta_wc, gamma_wc);

    // ---- 轻量平滑：AR需要近乎1:1跟踪，只做最轻微的去抖 ----
    // 高alpha = 快速响应，图标锚定在真实世界位置
    if (state.smoothedAzimuth === null) {
      state.smoothedAzimuth = rawAzimuth;
      state.smoothedElevation = rawElevation;
    } else {
      // 方位角：快速跟踪，大变化直接跳，小变化轻微平滑
      const azDelta = this.angleDifference(rawAzimuth, state.smoothedAzimuth);
      const azAlpha = Math.abs(azDelta) > 10 ? 1.0   // 大变化：直接跟踪
                    : Math.abs(azDelta) > 2  ? 0.6   // 中变化：快速跟
                    :                          0.3;   // 小抖动：轻微平滑
      state.smoothedAzimuth = this.normalizeAngle(state.smoothedAzimuth + azDelta * azAlpha);

      // 俯仰角：同样快速跟踪
      const elDelta = rawElevation - state.smoothedElevation;
      const elAlpha = Math.abs(elDelta) > 5  ? 1.0
                    : Math.abs(elDelta) > 1  ? 0.6
                    :                          0.3;
      state.smoothedElevation = state.smoothedElevation + elDelta * elAlpha;
    }

    const currentAzimuth = state.smoothedAzimuth;
    const currentElevation = this.clamp(state.smoothedElevation, -90, 90);

    // 诊断日志：对比旋转矩阵方位角 vs 罗盘方位角 vs 原始alpha
    if (Math.random() < 0.05) {
      console.log('[Android AR] heading=' + currentAzimuth.toFixed(1) +
        ' el=' + currentElevation.toFixed(1) +
        ' | compass=' + (this.data.compassDirection || 0).toFixed(1) +
        ' alpha=' + (deviceAlpha || 0).toFixed(1) +
        ' β=' + (deviceBeta || 0).toFixed(1) +
        ' γ=' + (deviceGamma || 0).toFixed(1));
    }

    const targetAzimuth = this.normalizeAngle(parseFloat(azimuth));
    const targetElevation = parseFloat(elevation);

    const azimuthDiff = this.angleDifference(targetAzimuth, currentAzimuth);
    const elevationDiff = targetElevation - currentElevation;

    const offsetDistance = Math.sqrt(
      Math.pow(azimuthDiff, 2) + Math.pow(elevationDiff, 2)
    );
    const isAligned = offsetDistance < 3.5;

    let xOffset = (azimuthDiff / (fovH / 2)) * (screenWidth / 2);
    let yOffset = -(elevationDiff / (fovV / 2)) * (screenHeight / 2);

    const centerX = screenWidth / 2;
    const centerY = screenHeight / 2;

    let satelliteX = centerX + xOffset;
    let satelliteY = centerY + yOffset;

    const isInView = Math.abs(azimuthDiff) < fovH / 2 &&
                     Math.abs(elevationDiff) < fovV / 2;

    const margin = 10;
    let isAtEdge = false;

    if (!isInView) {
      isAtEdge = true;

      const dx = satelliteX - centerX;
      const dy = satelliteY - centerY;

      const minX = margin;
      const maxX = screenWidth - margin;
      const minY = margin;
      const maxY = screenHeight - margin;

      if (satelliteX < minX || satelliteX > maxX || satelliteY < minY || satelliteY > maxY) {
        const intersections = [];

        if (dx < 0) {
          const t = (minX - centerX) / dx;
          const y = centerY + dy * t;
          if (y >= minY && y <= maxY) {
            intersections.push({ x: minX, y: y, dist: Math.abs(t) });
          }
        }

        if (dx > 0) {
          const t = (maxX - centerX) / dx;
          const y = centerY + dy * t;
          if (y >= minY && y <= maxY) {
            intersections.push({ x: maxX, y: y, dist: Math.abs(t) });
          }
        }

        if (dy < 0) {
          const t = (minY - centerY) / dy;
          const x = centerX + dx * t;
          if (x >= minX && x <= maxX) {
            intersections.push({ x: x, y: minY, dist: Math.abs(t) });
          }
        }

        if (dy > 0) {
          const t = (maxY - centerY) / dy;
          const x = centerX + dx * t;
          if (x >= minX && x <= maxX) {
            intersections.push({ x: x, y: maxY, dist: Math.abs(t) });
          }
        }

        if (intersections.length > 0) {
          intersections.sort((a, b) => a.dist - b.dist);
          satelliteX = intersections[0].x;
          satelliteY = intersections[0].y;
        }
      }
    }

    this.setData({
      satelliteX: satelliteX,
      satelliteY: satelliteY,
      offsetDistance: offsetDistance.toFixed(1),
      isAligned: isAligned,
      satelliteVisible: true,
      isAtEdge: isAtEdge,
      currentAzimuth: currentAzimuth.toFixed(1),
      currentElevation: currentElevation.toFixed(1)
    });

    if (isAligned && !this.data.lastAlignedState) {
      wx.vibrateShort({
        type: 'medium'
      });
    }

    this.data.lastAlignedState = isAligned;
  },

  // 相机错误处理
  onCameraError(e) {
    console.error('相机错误:', e);
    wx.showToast({
      title: '相机启动失败',
      icon: 'none'
    });
  },
  
  // 相机就绪回调
  onCameraReady() {
    console.log('相机已就绪，原生层级已加载');
    // 相机就绪后可以进行一些初始化操作
  },

  // 返回输入界面
  backToInput() {
    this.stopSensors();
    this.setData({
      stage: 'input',
      showTip: true,
      isAligned: false,
      satelliteVisible: false,
      sensorHistory: [] // 清空传感器历史数据
    });
  },

  // 打开卫星覆盖图
  openCoverageMap() {
    const { satelliteIndex } = this.data;
    wx.navigateTo({
      url: `/pages/satellite-coverage/satellite-coverage?satelliteIndex=${satelliteIndex}`
    });
  }
});

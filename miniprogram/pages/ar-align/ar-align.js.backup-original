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
      { "name": "AsiaSat 9", "position": "122" },
      { "name": "JCSAT-1C", "position": "150" },
      { "name": "JCSAT-2B", "position": "154" },
      { "name": "JCSAT-3A", "position": "128" },
      { "name": "JCSAT-4B", "position": "124" }
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
    // 获取屏幕尺寸和系统信息
    const systemInfo = wx.getSystemInfoSync();
    console.log('系统信息:', {
      platform: systemInfo.platform,
      system: systemInfo.system,
      model: systemInfo.model
    });
    
    this.setData({
      screenWidth: systemInfo.windowWidth,
      screenHeight: systemInfo.windowHeight,
      platform: systemInfo.platform // 保存平台信息用于后续判断
    });
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
    
    // 监听设备方向变化
    wx.onDeviceMotionChange((res) => {
      // 平滑处理传感器数据
      const smoothedData = this.smoothSensorData({
        alpha: res.alpha || 0,
        beta: res.beta || 0,
        gamma: res.gamma || 0
      });
      
      // 直接更新数据并立即刷新位置，减少延迟
      this.data.deviceAlpha = smoothedData.alpha;
      this.data.deviceBeta = smoothedData.beta;
      this.data.deviceGamma = smoothedData.gamma;
      
      // 调试输出（可选）
      if (Math.random() < 0.05) { // 5%的概率输出，避免日志过多
        console.log('设备姿态 - Beta:', smoothedData.beta.toFixed(1), 
                    'Gamma:', smoothedData.gamma.toFixed(1));
      }
      
      // 实时更新卫星位置 - 直接调用而不等待setData
      this.updateSatellitePosition();
    });
    
    // 监听罗盘 - 使用独立变量存储罗盘方向
    wx.onCompassChange((res) => {
      // 处理罗盘方向，确保在0-360范围内
      let direction = res.direction || 0;
      
      // Android平台罗盘方向可能需要额外处理
      // 确保方向在0-360范围内
      direction = this.normalizeAngle(direction);
      
      // 直接更新数据，减少延迟
      this.data.compassDirection = direction;
      
      // 调试输出（可选）
      if (Math.random() < 0.05) { // 5%的概率输出
        console.log('罗盘方向:', direction.toFixed(1));
      }
      
      // 实时更新卫星位置 - 直接调用而不等待setData
      this.updateSatellitePosition();
    });
    
    // 启动设备方向监听 - 使用最快的更新频率
    wx.startDeviceMotionListening({
      interval: 'ui', // 使用ui模式获得最快的更新（约16.7ms间隔，60fps）
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
    
    // 启动罗盘监听
    wx.startCompass({
      success: () => {
        console.log('✓ 罗盘启动成功');
      },
      fail: (err) => {
        console.error('✗ 启动罗盘失败:', err);
        wx.showModal({
          title: '罗盘启动失败',
          content: '罗盘传感器无法启动，AR功能可能无法正常使用。请确保您的设备支持磁力计（罗盘）并已授权相关权限。',
          showCancel: false
        });
      }
    });
    
    // Android平台额外检查：延迟200ms后验证传感器是否正常工作
    setTimeout(() => {
      const { compassDirection, deviceBeta } = this.data;
      if (compassDirection === 0 && deviceBeta === 0) {
        console.warn('⚠ 传感器可能未正常工作，尝试重新初始化');
        // 可以考虑重新初始化或提示用户
      } else {
        console.log('✓ 传感器数据正常接收中');
      }
    }, 200);
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
  
  // 更新卫星图标位置 - 优化版（高性能、高跟手性）
  updateSatellitePosition() {
    // 直接从 this.data 读取最新数据，避免解构的性能开销
    const compassDirection = this.data.compassDirection;
    const deviceBeta = this.data.deviceBeta;
    const deviceGamma = this.data.deviceGamma;
    const azimuth = this.data.azimuth;
    const elevation = this.data.elevation;
    const screenWidth = this.data.screenWidth;
    const screenHeight = this.data.screenHeight;
    
    // 快速验证：如果关键数据无效则直接返回
    if (!azimuth || !elevation || compassDirection === null || deviceBeta === null) {
      return;
    }
    
    // 计算视场角 (典型手机相机视场角)
    const fovH = 67; // 水平视场角
    const fovV = 41; // 垂直视场角
    
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

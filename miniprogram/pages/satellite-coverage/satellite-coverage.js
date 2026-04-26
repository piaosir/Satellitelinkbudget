// satellite-coverage.js
// 卫星覆盖图页面 - 使用原生map组件展示卫星覆盖范围

const app = getApp();
const coverageIndex = require('./coverageIndex.js');

Page({
  data: {
    // 导航栏位置
    navBarTop: 24,
    navBarHeight: 32,
    navBarRight: 10,
    
    // 地图配置
    latitude: 35.0,      // 默认中心纬度（中国中部）
    longitude: 105.0,    // 默认中心经度
    scale: 1,            // 缩放级别（1-20）
    
    // 地图设置 - 隐藏POI点和道路线
    mapSetting: {
      showCompass: 0,      // 不显示指南针
      showScale: 1,        // 显示比例尺
      enableZoom: 1,       // 允许缩放
      enableScroll: 1,     // 允许拖动
      enableRotate: 0,     // 禁止旋转
      gestureEnable: 1,    // 允许手势
      showMapText: 1,      // 显示地图文字（省份、城市等标签）
      enable3D: 0,         // 禁用3D
      enablePoi: 1,        // 启用POI点显示
      enableTraffic: 0,    // 禁用交通线
      baseMap: {
        features: ['base', 'point']  // 仅显示基础底图和点要素，不包含道路road
      }
    },
    
    // 卫星地图开关
    enableSatellite: false,
    
    // 用户位置
    userLatitude: 0,
    userLongitude: 0,
    hasUserLocation: false,
    
    // 当前选中的卫星
    currentSatellite: null,
    satelliteIndex: 0,
    
    // 卫星选择弹窗
    showSatellitePopup: false,
    
    // 卫星列表（与AR对星保持一致）
    satellites: [
      { "name": "CHINASAT 6D", "position": 125, "coverage": { "lat": 25, "lng": 125, "radius": 3500 } },
      { "name": "CHINASAT 6C", "position": 130.5, "coverage": { "lat": 22, "lng": 130.5, "radius": 3200 } },
      { "name": "CHINASAT 6E", "position": 115.5, "coverage": { "lat": 28, "lng": 115.5, "radius": 3300 } },
      { "name": "CHINASAT 9", "position": 92.2, "coverage": { "lat": 30, "lng": 92.2, "radius": 3000 } },
      { "name": "CHINASAT 9B", "position": 101.4, "coverage": { "lat": 32, "lng": 101.4, "radius": 3100 } },
      { "name": "CHINASAT 9C", "position": 92.2, "coverage": { "lat": 30, "lng": 92.2, "radius": 3000 } },
      { "name": "CHINASAT 10", "position": 110.5, "coverage": { "lat": 30, "lng": 110.5, "radius": 3200 } },
      { "name": "CHINASAT 10R", "position": 110.5, "coverage": { "lat": 30, "lng": 110.5, "radius": 3200 } },
      { "name": "CHINASAT 11", "position": 98, "coverage": { "lat": 28, "lng": 98, "radius": 3100 } },
      { "name": "CHINASAT 12", "position": 87.5, "coverage": { "lat": 25, "lng": 87.5, "radius": 3000 } },
      { "name": "CHINASAT 15", "position": 51.5, "coverage": { "lat": 20, "lng": 51.5, "radius": 2800 } },
      { "name": "CHINASAT 19", "position": 163.4, "coverage": { "lat": 10, "lng": 163.4, "radius": 2500 } },
      { "name": "CHINASAT 16", "position": 110.5, "coverage": { "lat": 30, "lng": 110.5, "radius": 3200 } },
      { "name": "CHINASAT 26", "position": 125, "coverage": { "lat": 25, "lng": 125, "radius": 3500 } },
      { "name": "APSTAR 6D", "position": 134, "coverage": { "lat": 22, "lng": 134, "radius": 3600 } },
      { "name": "APSTAR 6C", "position": 134, "coverage": { "lat": 22, "lng": 134, "radius": 3600 } },
      { "name": "APSTAR 7", "position": 76.5, "coverage": { "lat": 25, "lng": 76.5, "radius": 3200 } },
      { "name": "APSTAR 9", "position": 142, "coverage": { "lat": 18, "lng": 142, "radius": 3500 } },
      { "name": "CHINASAT 27", "position": 87.5, "coverage": { "lat": 25, "lng": 87.5, "radius": 3000 } },
      { "name": "APSTAR 5C", "position": 138, "coverage": { "lat": 20, "lng": 138, "radius": 3800 } },
      { "name": "AsiaSat 5", "position": 100.5, "coverage": { "lat": 28, "lng": 100.5, "radius": 4000 } },
      { "name": "AsiaSat 6", "position": 120, "coverage": { "lat": 25, "lng": 120, "radius": 3800 } },
      { "name": "AsiaSat 7", "position": 105.5, "coverage": { "lat": 30, "lng": 105.5, "radius": 4000 } },
      { "name": "AsiaSat 9", "position": 122, "coverage": { "lat": 24, "lng": 122, "radius": 4200 } },
      { "name": "JCSAT-1C", "position": 150, "coverage": { "lat": 15, "lng": 150, "radius": 3000 } },
      { "name": "JCSAT-2B", "position": 154, "coverage": { "lat": 12, "lng": 154, "radius": 2800 } },
      { "name": "JCSAT-3A", "position": 128, "coverage": { "lat": 22, "lng": 128, "radius": 3200 } },
      { "name": "JCSAT-4B", "position": 124, "coverage": { "lat": 24, "lng": 124, "radius": 3100 } }
    ],
    
    // 地图覆盖物
    circles: [],       // 覆盖区域圆形
    markers: [],       // 标记点
    polylines: [],     // 等仰角线
    
    // 用户是否在覆盖范围内
    isInCoverage: false,
    
    // 等仰角线显示状态
    showElevationContours: false,
    showElevationPopup: false,           // 仰角设置弹窗
    elevationAngles: [5, 10],  // 需要绘制的仰角值（度）
    elevationInputText: '5, 10',  // 用户输入的仰角值文本
    
    // 覆盖图相关状态
    showCoverageContours: false,         // 是否显示覆盖图
    showCoveragePopup: false,            // 覆盖图设置弹窗
    hasCoverageData: false,              // 当前卫星是否有覆盖数据
    availableBands: [],                  // 可用频段列表
    availableBeams: [],                  // 可用波束列表
    selectedBand: '',                    // 选中的频段
    selectedBeams: [],                   // 选中的波束（多选）
    selectedType: 'EIRP',                // 选中的类型 (EIRP/GT)
    hasEIRP: false,                      // 当前选择是否有EIRP数据
    hasGT: false,                        // 当前选择是否有G/T数据
    currentCoverageData: null,           // 当前加载的覆盖数据（兼容单波束）
    currentCoverageDataList: [],         // 多波束覆盖数据列表
    availableGainValues: [],             // 可用的增益值列表
    selectedGainValues: [],              // 选中的增益值
    gainValueItems: [],                  // 带选中状态的增益值项目
    showCustomValuePopup: false,         // 自定义覆盖值弹窗
    customValueInput: '',                // 自定义值输入
    showBeamLabels: false,               // 是否显示波束名标签
    
    // 实时显示当前位置
    showCurrentLocation: false,          // 地图 show-location 开关
    
    // 位置搜索相关
    showSearchPopup: false,              // 搜索弹窗显示状态
    searchMode: 'location',              // 搜索模式：location(地点搜索) / coordinate(经纬度)
    searchKeyword: '',                   // 搜索关键词
    searchResults: [],                   // 搜索结果列表
    searchNoResult: false,               // 是否无搜索结果
    suggestionList: [],                  // 关键词建议列表
    showSuggestions: false,              // 是否显示建议列表
    inputLatitude: '',                   // 输入的纬度
    inputLongitude: '',                  // 输入的经度
    searchMarkerIdCounter: 5000,         // 搜索标记ID计数器（5000+范围，避免与波束名标记冲突）
    searchMarkers: [],                   // 搜索结果标记列表
    
    // 加载状态
    loading: true,
    
    // 底部按钮收起状态
    bottomBtnsCollapsed: false,
    
    // 卫星切换状态（防止快速切换导致状态不同步）
    isSwitchingSatellite: false,
    // 覆盖数据加载中状态
    isLoadingCoverageData: false,

    // 选点回传模式（给首页方位仰角工具使用）
    pickMode: false,
    pickSource: ''
  },

  onLoad(options) {
    // 获取胶囊按钮位置信息，用于对齐悬浮按钮
    try {
      const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
      const windowInfo = wx.getWindowInfo();
      
      this.setData({
        navBarTop: menuButtonInfo.top,
        navBarHeight: menuButtonInfo.height,
        navBarRight: windowInfo.windowWidth - menuButtonInfo.right
      });
    } catch (e) {
      console.error('获取胶囊按钮位置失败:', e);
    }
    
    // 检测平台（安卓的 map label textAlign:'center' 不生效，需手动补偿 anchorX）
    try {
      const deviceInfo = wx.getDeviceInfo();
      this._isAndroid = deviceInfo.platform === 'android';
    } catch (e) {
      this._isAndroid = false;
    }

    // 获取从主页面传来的卫星索引（优先按名称查找，避免两页面列表顺序不同导致错位）
    let satelliteIndex = 0;
    if (options && options.satelliteName) {
      const name = decodeURIComponent(options.satelliteName);
      const foundIdx = this.data.satellites.findIndex(s => s.name === name);
      if (foundIdx !== -1) {
        satelliteIndex = foundIdx;
      } else if (options.satelliteIndex !== undefined) {
        satelliteIndex = parseInt(options.satelliteIndex);
      }
    } else if (options && options.satelliteIndex !== undefined) {
      satelliteIndex = parseInt(options.satelliteIndex);
    }

    const pickMode = options && options.pickMode === '1';
    const pickSource = options && options.pickSource ? options.pickSource : '';
    
    const currentSatellite = this.data.satellites[satelliteIndex];
    
    this.setData({
      satelliteIndex: satelliteIndex,
      currentSatellite: currentSatellite,
      pickMode,
      pickSource
    });

    if (pickMode) {
      this.setData({
        mapSetting: {
          ...this.data.mapSetting,
          enablePoi: 1,
          showMapText: 1
        }
      });
    }

    if (pickMode) {
      setTimeout(() => {
        wx.showToast({
          title: '搜索或输入坐标后点“定位”即可回填',
          icon: 'none',
          duration: 2200
        });
      }, 400);
    }
    
    // 检查并初始化覆盖数据状态
    this.updateCoverageDataStatus();
    
    // 获取用户位置
    this.getUserLocation();
  },

  onReady() {
    // 获取地图上下文
    this.mapCtx = wx.createMapContext('coverageMap');
  },

  // 构建地图标签配置（兼容 iOS/Android 居中对齐）
  _buildCenteredLabel(content, fontSize, color, anchorY) {
    const label = {
      content: content,
      color: color,
      fontSize: fontSize,
      anchorX: 0,
      anchorY: anchorY,
      textAlign: 'center'
    };
    // 安卓的 map marker label textAlign:'center' 不生效，手动计算偏移量
    if (this._isAndroid) {
      let textWidth = 0;
      for (let i = 0; i < content.length; i++) {
        textWidth += content.charCodeAt(i) > 127 ? fontSize : fontSize * 0.61;
      }
      label.anchorX = -Math.round(textWidth / 2);
    }
    return label;
  },

  onHide() {
    // 页面隐藏时保存所有设置（包括搜索标记和线条）
    this.saveCoverageSettings();
  },

  onUnload() {
    // 页面卸载时保存所有设置
    this.saveCoverageSettings();
  },

  // 获取用户位置
  getUserLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        console.log('用户位置:', res);
        this.setData({
          userLatitude: res.latitude,
          userLongitude: res.longitude,
          hasUserLocation: true
        });
        
        // 更新地图显示
        this.updateMapDisplay();
      },
      fail: (err) => {
        console.error('获取位置失败:', err);
        wx.showToast({
          title: '无法获取位置',
          icon: 'none'
        });
        // 使用默认位置更新地图
        this.updateMapDisplay();
      },
      complete: () => {
        this.setData({ loading: false });
      }
    });
  },

  // 更新地图显示
  updateMapDisplay() {
    const { currentSatellite, userLatitude, userLongitude, hasUserLocation } = this.data;
    
    if (!currentSatellite) return;
    
    const coverage = currentSatellite.coverage;
    
    // 不再显示覆盖圆圈
    const circles = [];
    
    // 保留等仰角线标记（id>=100且<1000），并验证坐标有效性
    const existingElevationMarkers = this.data.markers.filter(m => 
      m.id >= 100 && m.id < 1000 &&
      isFinite(m.latitude) && isFinite(m.longitude) &&
      m.latitude >= -90 && m.latitude <= 90 &&
      m.longitude >= -180 && m.longitude <= 180
    );
    
    // 保留覆盖值标记（id 1000-1999）
    const existingCoverageMarkers = this.data.markers.filter(m => 
      m.id >= 1000 && m.id < 2000
    );
    
    // 保留波束中心标记（id 3000-3999）
    const existingBorePointMarkers = this.data.markers.filter(m => 
      m.id >= 3000 && m.id < 4000
    );
    
    // 保留波束名标记（id 4000-4999）
    const existingBeamLabelMarkers = this.data.markers.filter(m => 
      m.id >= 4000 && m.id < 5000
    );
    
    // 保留搜索标记（id>=5000且<10000，排除残留描边层）
    const existingSearchMarkers = this.data.markers.filter(m => m.id >= 5000 && m.id < 10000);
    
    // 根据地图类型确定卫星信息文字颜色
    const satelliteTextColor = this.data.enableSatellite ? '#FFFFFF' : '#333333';
    
    // 创建新的卫星标记
    const satelliteMarker = {
      id: 1,
      latitude: 0,  // 卫星在赤道上
      longitude: currentSatellite.position,  // 使用卫星轨位作为经度
      iconPath: '/images/satellite.png',
      width: 28,
      height: 28,
      anchor: { x: 0.5, y: 0.5 },  // 图标中心对准坐标点
      callout: {
        content: `${currentSatellite.name}\n轨位: ${currentSatellite.position}°E`,
        color: satelliteTextColor,
        fontSize: 10,
        borderRadius: 3,
        bgColor: '#00000000',
        padding: 4,
        display: 'BYCLICK'  // 点击时显示
      }
    };
    
    // 合并标记：卫星标记 + 保留的等仰角线标记 + 覆盖值标记 + 波束中心标记 + 波束名标记 + 搜索标记
    const markers = [satelliteMarker, ...existingElevationMarkers, ...existingCoverageMarkers, ...existingBorePointMarkers, ...existingBeamLabelMarkers, ...existingSearchMarkers];
    
    // 判断用户是否在覆盖范围内
    if (hasUserLocation) {
      // 用户位置使用地图内置的 show-location 显示，无需额外标记
      const isInCoverage = this.checkIfInCoverage(
        userLatitude, userLongitude,
        coverage.lat, coverage.lng,
        coverage.radius
      );
      
      this.setData({ isInCoverage });
    }
    
    // 设置地图中心点（卫星在赤道上）
    const centerLat = 0;
    const centerLng = currentSatellite.position;
    
    this.setData({
      circles,
      markers,
      latitude: centerLat,
      longitude: centerLng,
      scale: 3  // 缩小以显示整个覆盖区域
    });
  },

  // 检查点是否在覆盖范围内（使用Haversine公式计算距离）
  checkIfInCoverage(lat1, lng1, lat2, lng2, radiusKm) {
    const R = 6371; // 地球半径（公里）
    const dLat = this.deg2rad(lat2 - lat1);
    const dLng = this.deg2rad(lng2 - lng1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return distance <= radiusKm;
  },

  deg2rad(deg) {
    return deg * (Math.PI / 180);
  },

  rad2deg(rad) {
    return rad * (180 / Math.PI);
  },

  /**
   * 计算给定地面站位置对卫星的仰角
   * 使用精确的地球同步卫星仰角公式
   * @param {number} stationLat - 地面站纬度（度）
   * @param {number} stationLon - 地面站经度（度）
   * @param {number} satLon - 卫星轨位经度（度）
   * @returns {number} 仰角（度），如果卫星不可见则返回负值
   */
  calculateElevationAngle(stationLat, stationLon, satLon) {
    const Re = 6378.137;  // 地球赤道半径（公里）
    const Rs = 42164.0;   // 地球同步卫星轨道半径（公里）
    
    const latRad = this.deg2rad(stationLat);
    const lonDiffRad = this.deg2rad(stationLon - satLon);
    
    // 计算地心角 γ (gamma)
    const cosGamma = Math.cos(latRad) * Math.cos(lonDiffRad);
    
    // 检查卫星是否可见（地心角必须小于81.3度左右）
    if (cosGamma <= Re / Rs) {
      return -90;  // 卫星不可见
    }
    
    // 计算仰角
    // 公式: tan(El) = (cos(γ) - Re/Rs) / sin(γ)
    const sinGamma = Math.sqrt(1 - cosGamma * cosGamma);
    const tanEl = (cosGamma - Re / Rs) / sinGamma;
    const elevation = this.rad2deg(Math.atan(tanEl));
    
    return elevation;
  },

  /**
   * 计算等仰角线上的点
   * 给定卫星轨位和目标仰角，计算等仰角线上的一系列点
   * @param {number} satLon - 卫星轨位经度（度）
   * @param {number} targetElevation - 目标仰角（度）
   * @param {number} numPoints - 采样点数
   * @returns {Array} 等仰角线上的点 [{latitude, longitude}]
   */
  calculateElevationContour(satLon, targetElevation, numPoints = 180) {
    const points = [];
    const Re = 6378.137;  // 地球赤道半径（公里）
    const Rs = 42164.0;   // 地球同步卫星轨道半径（公里）
    
    const elRad = this.deg2rad(targetElevation);
    
    // 计算对应此仰角的地心角
    // 从公式反推: cos(γ) = (Re/Rs + tan(El) * sin(γ))
    // 经过推导: cos(γ) = cos(El) * Re/Rs + sin(El) * sqrt((Rs/Re)^2 - cos(El)^2)
    // 但使用更直接的方法：遍历纬度，计算对应的经度差
    
    // 对于给定仰角El，地心角γ满足:
    // tan(El) = (cos(γ) - Re/Rs) / sin(γ)
    // 设 k = Re/Rs ≈ 0.1513
    // tan(El) = (cos(γ) - k) / sin(γ)
    // tan(El) * sin(γ) = cos(γ) - k
    // tan(El) * sin(γ) - cos(γ) = -k
    // -sin(El)/cos(El) * sin(γ) + cos(γ) = k
    // 令 A = 1/cos(El), B = tan(El)
    // cos(γ) - B*sin(γ) = k
    // 用三角恒等式: R*cos(γ + φ) = k
    // 其中 R = sqrt(1 + B^2) = 1/cos(El)
    // cos(γ + φ) = k * cos(El)
    // γ + φ = arccos(k * cos(El))
    // 其中 tan(φ) = B = tan(El), 所以 φ = El
    // 因此: γ = arccos(k * cos(El)) - El
    
    const k = Re / Rs;
    const cosElk = k * Math.cos(elRad);
    
    // 检查是否有解
    if (Math.abs(cosElk) > 1) {
      return points;  // 此仰角无法达到
    }
    
    // 计算地心角
    const gamma = Math.acos(cosElk) - elRad;
    
    if (gamma <= 0 || gamma >= Math.PI / 2) {
      return points;  // 无效的地心角
    }
    
    const cosGamma = Math.cos(gamma);
    
    // 遍历方位角，计算等仰角线上的点
    // 等仰角线满足: cos(lat) * cos(lonDiff) = cos(γ)
    for (let i = 0; i < numPoints; i++) {
      // 使用参数化方法生成点
      // 设经度差 Δλ 从 -γ 到 +γ 变化
      const t = (i / (numPoints - 1)) * 2 - 1;  // -1 到 1
      const lonDiffDeg = this.rad2deg(gamma) * t;
      const lonDiffRad = this.deg2rad(lonDiffDeg);
      
      const cosLonDiff = Math.cos(lonDiffRad);
      
      if (cosLonDiff === 0) continue;
      
      // 从 cos(lat) * cos(lonDiff) = cos(γ) 求 lat
      const cosLat = cosGamma / cosLonDiff;
      
      if (Math.abs(cosLat) > 1) continue;  // 无效的纬度
      
      const lat = this.rad2deg(Math.acos(cosLat));
      const lon = satLon + lonDiffDeg;
      
      // 生成北半球的点
      if (lat <= 90 && lat >= 0) {
        points.push({
          latitude: lat,
          longitude: this.normalizeLongitude(lon)
        });
      }
    }
    
    // 添加南半球对称点（从后往前添加以形成闭合曲线）
    const northPoints = [...points];
    for (let i = northPoints.length - 1; i >= 0; i--) {
      const p = northPoints[i];
      if (p.latitude > 0) {  // 只对非赤道点添加南半球对称点
        points.push({
          latitude: -p.latitude,
          longitude: p.longitude
        });
      }
    }
    
    // 闭合曲线 - 添加第一个点作为最后一个点
    if (points.length > 2) {
      points.push({
        latitude: points[0].latitude,
        longitude: points[0].longitude
      });
    }
    
    return points;
  },

  /**
   * 将经度标准化到 -180 到 180 度范围
   */
  normalizeLongitude(lon) {
    // 处理无效值
    if (!isFinite(lon) || isNaN(lon)) {
      return 0;  // 返回默认值
    }
    // 使用取模运算代替循环，避免极端值导致的问题
    lon = lon % 360;
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;
    return lon;
  },

  /**
   * 将等仰角线分割成多段，避免跨越180°经线时的绘制问题
   * @param {Array} points - 原始点数组 [{latitude, longitude}]
   * @returns {Array} 分割后的线段数组 [[{latitude, longitude}], ...]
   */
  splitContourAtAntimeridian(points) {
    if (points.length < 2) return [points];
    
    const segments = [];
    let currentSegment = [points[0]];
    
    for (let i = 1; i < points.length; i++) {
      const prevLon = points[i - 1].longitude;
      const currLon = points[i].longitude;
      
      // 检测是否跨越180°经线（经度差超过180°说明跨越了）
      const lonDiff = Math.abs(currLon - prevLon);
      
      if (lonDiff > 180) {
        // 跨越了180°经线，需要分割
        // 计算与180°经线的交点
        const lat1 = points[i - 1].latitude;
        const lon1 = prevLon;
        const lat2 = points[i].latitude;
        const lon2 = currLon;
        
        // 调整经度以便插值（将跨越边界的点调整到同一侧）
        let adjustedLon2 = lon2;
        if (lon1 > 0 && lon2 < 0) {
          adjustedLon2 = lon2 + 360;  // 从东半球看，西边的点加360
        } else if (lon1 < 0 && lon2 > 0) {
          adjustedLon2 = lon2 - 360;  // 从西半球看，东边的点减360
        }
        
        // 线性插值计算交点纬度
        // 使用179.9999替代精确的180，避免边界像素渲染瑕疵
        const boundary = lon1 > 0 ? 179.9999 : -179.9999;
        const t = (boundary - lon1) / (adjustedLon2 - lon1);
        const intersectLat = lat1 + t * (lat2 - lat1);
        
        // 添加边界交点到当前线段
        currentSegment.push({
          latitude: intersectLat,
          longitude: boundary
        });
        
        // 保存当前线段
        if (currentSegment.length >= 2) {
          segments.push(currentSegment);
        }
        
        // 开始新线段，从另一侧的边界点开始
        currentSegment = [{
          latitude: intersectLat,
          longitude: -boundary  // 另一侧的边界
        }];
      }
      
      currentSegment.push(points[i]);
    }
    
    // 添加最后一个线段
    if (currentSegment.length >= 2) {
      segments.push(currentSegment);
    }
    
    return segments;
  },

  /**
   * 显示等仰角线设置弹窗
   */
  showElevationPanel() {
    this.setData({ showElevationPopup: true });
  },

  /**
   * 隐藏等仰角线设置弹窗
   */
  hideElevationPanel() {
    this.setData({ showElevationPopup: false });
  },

  /**
   * 处理仰角输入（单个文本框，逗号分隔）
   */
  onElevationInputText(e) {
    this.setData({ elevationInputText: e.detail.value });
  },

  /**
   * 应用用户输入的仰角值并绘制
   */
  applyElevationAngles() {
    const inputText = this.data.elevationInputText;
    // 支持中英文逗号、空格分隔
    const parts = inputText.split(/[,，\s]+/).filter(s => s.trim() !== '');
    const angles = [];
    
    for (let i = 0; i < parts.length; i++) {
      const num = parseFloat(parts[i].trim());
      if (!isNaN(num) && num >= 0 && num <= 90) {
        angles.push(num);
      }
    }
    
    if (angles.length === 0) {
      wx.showToast({
        title: '请输入有效仰角值',
        icon: 'none'
      });
      return;
    }
    
    // 排序并去重
    const uniqueAngles = [...new Set(angles)].sort((a, b) => a - b);
    
    this.setData({
      elevationAngles: uniqueAngles,
      showElevationPopup: false,
      showElevationContours: true
    });
    
    // 自动保存设置
    this.saveCoverageSettings();
    
    this.drawElevationContours();
  },

  /**
   * 清除等仰角线
   */
  clearElevationContours() {
    // 保留卫星标记(id=1)、覆盖值标记(id 1000-1999)、波束中心标记(id 3000-3999)、波束名标记(id 4000-4999)、搜索标记(id>=5000且<10000)
    // 移除仰角线标注(id 100-999)和残留描边层(id>=10000)
    const markers = this.data.markers.filter(m => 
      m.id === 1 || 
      (m.id >= 1000 && m.id < 2000) ||  // 覆盖值标记
      (m.id >= 3000 && m.id < 4000) ||  // 波束中心标记
      (m.id >= 4000 && m.id < 5000) ||  // 波束名标记
      (m.id >= 5000 && m.id < 10000)    // 搜索标记
    );
    // 保留覆盖图线条（非黑色或白色的线条，即覆盖图线条）
    const polylines = this.data.polylines.filter(p => 
      p.color !== '#000000' && p.color !== '#FFFFFF'
    );
    
    this.setData({
      polylines: polylines,
      markers: markers,
      showElevationContours: false,
      showElevationPopup: false
    });
    
    // 清除缓存中的仰角线数据
    this.clearElevationContourCache();
    
    wx.showToast({
      title: '仰角线已清除',
      icon: 'success',
      duration: 1500
    });
  },
  
  /**
   * 清除缓存中的仰角线数据（同时清除新旧版本缓存）
   */
  clearElevationContourCache() {
    const { currentSatellite } = this.data;
    if (!currentSatellite) return;
    
    const satelliteName = currentSatellite.name;
    const cacheKeyV2 = `coverage_settings_v2_${satelliteName}`;
    const cacheKeyOld = `coverage_settings_${satelliteName}`;
    
    try {
      // 清除v2版本缓存中的仰角线数据
      const cachedSettingsV2 = wx.getStorageSync(cacheKeyV2);
      if (cachedSettingsV2) {
        cachedSettingsV2.elevationPolylines = [];
        cachedSettingsV2.elevationMarkers = [];
        cachedSettingsV2.showElevationContours = false;
        cachedSettingsV2.timestamp = Date.now();
        
        wx.setStorageSync(cacheKeyV2, cachedSettingsV2);
        console.log(`已清除 ${satelliteName} 的v2版仰角线缓存`);
      }
      
      // 清除旧版本缓存中的仰角线相关数据
      const cachedSettingsOld = wx.getStorageSync(cacheKeyOld);
      if (cachedSettingsOld) {
        // 旧版本格式：polylines包含所有线条，savedMarkers包含所有标记
        // 过滤掉仰角线（黑色或白色线条）
        if (cachedSettingsOld.polylines) {
          cachedSettingsOld.polylines = cachedSettingsOld.polylines.filter(p => 
            p.color !== '#000000' && p.color !== '#FFFFFF'
          );
        }
        // 过滤掉仰角线标记（id 100-999）
        if (cachedSettingsOld.savedMarkers) {
          cachedSettingsOld.savedMarkers = cachedSettingsOld.savedMarkers.filter(m => 
            m.id < 100 || m.id >= 1000
          );
        }
        cachedSettingsOld.showElevationContours = false;
        
        wx.setStorageSync(cacheKeyOld, cachedSettingsOld);
        console.log(`已清除 ${satelliteName} 的旧版仰角线缓存`);
      }
    } catch (e) {
      console.error('清除仰角线缓存失败:', e);
    }
  },

  /**
   * 绘制所有等仰角线
   */
  drawElevationContours() {
    const { currentSatellite, elevationAngles, enableSatellite } = this.data;
    if (!currentSatellite) return;
    
    // 根据地图模式选择颜色（卫星地图用白色，普通地图用黑色）
    const lineColor = enableSatellite ? '#FFFFFF' : '#000000';
    
    const satLon = currentSatellite.position;
    // 保留现有的覆盖图线条（非仰角线的线条）
    const existingCoveragePolylines = this.data.polylines.filter(p => 
      p.color !== '#000000' && p.color !== '#FFFFFF'
    );
    const polylines = [];
    // 保留卫星标记(id=1)、覆盖值标记(id 1000-1999)、波束中心标记(id 3000-3999)、波束名标记(id 4000-4999)、搜索标记(id>=5000且<10000)
    // 只移除之前的仰角标注(id 100-999)和残留描边层(id>=10000)
    const existingMarkers = this.data.markers.filter(m => 
      m.id === 1 || 
      (m.id >= 1000 && m.id < 2000) ||  // 覆盖值标记
      (m.id >= 3000 && m.id < 4000) ||  // 波束中心标记
      (m.id >= 4000 && m.id < 5000) ||  // 波束名标记
      (m.id >= 5000 && m.id < 10000)    // 搜索标记
    );
    const markers = [...existingMarkers];
    
    // 为每个仰角生成等仰角线
    // 低仰角（≤2°）由于覆盖范围大、点数多，减少采样点以解决真机渲染限制
    elevationAngles.forEach((angle, index) => {
      // 根据仰角动态调整采样点数：低仰角使用较少采样点
      const numPoints = angle <= 2 ? 120 : 360;
      const points = this.calculateElevationContour(satLon, angle, numPoints);
      
      if (points.length > 2) {
        // 分割跨越180°经线的线段
        const segments = this.splitContourAtAntimeridian(points);
        
        // 为每个分割后的线段创建polyline
        segments.forEach(segment => {
          if (segment.length >= 2) {
            polylines.push({
              points: segment,
              color: lineColor,  // 根据地图模式选择颜色
              width: 1,
              dottedLine: false,
              arrowLine: false,
              level: 'abovelabels'  // 显示在所有POI之上
            });
          }
        });
        
        // 在线条上添加仰角值标注（上、下、左、右四个方向各一个）
        if (points.length > 0) {
          // 找到四个极值点
          let maxLatPoint = points[0];  // 最北（上）
          let minLatPoint = points[0];  // 最南（下）
          let eastPoint = points[0];    // 最东（右）- 相对于卫星经度
          let westPoint = points[0];    // 最西（左）- 相对于卫星经度
          
          // 计算相对于卫星经度的偏移量（处理跨180°经线的情况）
          const calcLonOffset = (lon) => {
            let offset = lon - satLon;
            // 标准化到 -180 到 180 范围
            while (offset > 180) offset -= 360;
            while (offset < -180) offset += 360;
            return offset;
          };
          
          let maxEastOffset = calcLonOffset(points[0].longitude);
          let maxWestOffset = calcLonOffset(points[0].longitude);
          
          for (const p of points) {
            if (p.latitude > maxLatPoint.latitude) maxLatPoint = p;
            if (p.latitude < minLatPoint.latitude) minLatPoint = p;
            
            const offset = calcLonOffset(p.longitude);
            if (offset > maxEastOffset) {
              maxEastOffset = offset;
              eastPoint = p;
            }
            if (offset < maxWestOffset) {
              maxWestOffset = offset;
              westPoint = p;
            }
          }
          
          // 上方标签（最北点）- 标签底部贴着仰角线
          markers.push({
            id: 100 + index * 4,
            latitude: maxLatPoint.latitude,
            longitude: maxLatPoint.longitude,
            iconPath: '/images/transparent.png',
            width: 1,
            height: 1,
            label: {
              content: angle + '°',
              color: lineColor,
              fontSize: 9,
              anchorX: -8,
              anchorY: -11
            }
          });
          
          // 下方标签（最南点）- 标签顶部贴着仰角线
          markers.push({
            id: 100 + index * 4 + 1,
            latitude: minLatPoint.latitude,
            longitude: minLatPoint.longitude,
            iconPath: '/images/transparent.png',
            width: 1,
            height: 1,
            label: {
              content: angle + '°',
              color: lineColor,
              fontSize: 9,
              anchorX: -8,
              anchorY: 1
            }
          });
          
          // 右侧标签（最东点）- 标签左侧贴着仰角线
          markers.push({
            id: 100 + index * 4 + 2,
            latitude: eastPoint.latitude,
            longitude: eastPoint.longitude,
            iconPath: '/images/transparent.png',
            width: 1,
            height: 1,
            label: {
              content: angle + '°',
              color: lineColor,
              fontSize: 9,
              anchorX: 2,
              anchorY: -5
            }
          });
          
          // 左侧标签（最西点）- 标签右侧贴着仰角线
          markers.push({
            id: 100 + index * 4 + 3,
            latitude: westPoint.latitude,
            longitude: westPoint.longitude,
            iconPath: '/images/transparent.png',
            width: 1,
            height: 1,
            label: {
              content: angle + '°',
              color: lineColor,
              fontSize: 9,
              anchorX: -18,
              anchorY: -5
            }
          });
        }
      }
    });
    
    // 合并覆盖图线条和等仰角线
    this.setData({ polylines: [...existingCoveragePolylines, ...polylines], markers });
    
    // 显示实际绘制的仰角值
    const angleStr = elevationAngles.map(a => a + '°').join(', ');
    wx.showToast({
      title: `等仰角线: ${angleStr}`,
      icon: 'none',
      duration: 2000
    });
  },

  // 切换卫星地图显示
  toggleSatelliteMap() {
    const newValue = !this.data.enableSatellite;
    this.setData({
      enableSatellite: newValue
    });
    
    // 更新仰角线和标签颜色（卫星地图下为白色，普通地图下为黑色）
    this.updateMapElementsColor(newValue);
    
    wx.showToast({
      title: newValue ? '卫星地图已开启' : '卫星地图已关闭',
      icon: 'none',
      duration: 1500
    });
  },
  
  // 根据地图模式更新仰角线和标签颜色
  updateMapElementsColor(isSatelliteMode) {
    const lineColor = isSatelliteMode ? '#FFFFFF' : '#000000';
    const textColor = isSatelliteMode ? '#FFFFFF' : '#333333';
    
    // 更新仰角线颜色
    const updatedPolylines = this.data.polylines.map(p => {
      // 只更新仰角线（黑色或白色的线条），保留覆盖图线条
      if (p.color === '#000000' || p.color === '#FFFFFF') {
        return { ...p, color: lineColor };
      }
      return p;
    });
    
    // 更新标签颜色（卫星标记、仰角标签和搜索标记）
    const updatedMarkers = this.data.markers.map(m => {
      // 卫星标记（id = 1）
      if (m.id === 1 && m.callout) {
        return {
          ...m,
          callout: { ...m.callout, color: textColor }
        };
      }
      // 仰角标签（id 100-999）
      if (m.id >= 100 && m.id < 1000 && m.label) {
        return {
          ...m,
          label: { ...m.label, color: lineColor }
        };
      }
      // 搜索标记（id >= 5000）
      if (m.id >= 5000 && m.callout) {
        return {
          ...m,
          callout: { ...m.callout, color: textColor }
        };
      }
      return m;
    });
    
    this.setData({
      polylines: updatedPolylines,
      markers: updatedMarkers
    });
  },

  // 显示卫星选择器
  showSatelliteSelector() {
    this.setData({ showSatellitePopup: true });
  },

  // 隐藏卫星选择器
  hideSatelliteSelector() {
    this.setData({ showSatellitePopup: false });
  },

  // 切换卫星
  onSatelliteChange(e) {
    const index = parseInt(e.currentTarget.dataset.index);
    const newSatellite = this.data.satellites[index];
    
    // 如果选择的是同一个卫星，不做任何处理
    if (this.data.currentSatellite && this.data.currentSatellite.name === newSatellite.name) {
      this.setData({ showSatellitePopup: false });
      return;
    }
    
    // 防止快速切换：如果正在切换中，忽略此次点击
    if (this.data.isSwitchingSatellite) {
      console.log('正在切换卫星中，请稍候...');
      return;
    }
    
    // 设置切换中状态
    this.setData({ isSwitchingSatellite: true });
    
    // 【重要】先保存当前卫星的设置和绘制内容，确保缓存独立
    this.saveCoverageSettings();
    
    // 保存当前仰角线状态，以便切换卫星后自动重绘
    const wasElevationContoursShown = this.data.showElevationContours;
    
    // 先清空所有覆盖物（强制地图组件识别变化）
    this.setData({
      polylines: [],
      markers: [],
      circles: []
    });
    
    // 使用 setTimeout 确保地图组件有时间处理清空操作
    setTimeout(() => {
      // 根据地图类型确定卫星信息文字颜色
      const satelliteTextColor = this.data.enableSatellite ? '#FFFFFF' : '#333333';
      
      // 创建新卫星的标记
      const newMarkers = [{
        id: 1,
        latitude: 0,
        longitude: newSatellite.position,
        iconPath: '/images/satellite.png',
        width: 28,
        height: 28,
        anchor: { x: 0.5, y: 0.5 },
        callout: {
          content: `${newSatellite.name}\n轨位: ${newSatellite.position}°E`,
          color: satelliteTextColor,
          fontSize: 10,
          borderRadius: 3,
          bgColor: '#00000000',
          padding: 4,
          display: 'BYCLICK'
        }
      }];
      
      // 重置所有状态到初始值，准备加载新卫星的缓存
      this.setData({
        satelliteIndex: index,
        currentSatellite: newSatellite,
        showSatellitePopup: false,
        // 重置所有覆盖图状态
        showCoverageContours: false,
        currentCoverageData: null,
        currentCoverageDataList: [],
        availableGainValues: [],
        selectedGainValues: [],
        gainValueItems: [],
        // 重置仰角线状态（会从新卫星的缓存中恢复）
        showElevationContours: false,
        showBeamLabels: false,
        // 重置搜索标记
        searchMarkers: [],
        searchMarkerIdCounter: 5000,
        // 重置加载状态（防止旧卫星的加载状态残留）
        isLoadingCoverageData: false,
        // 设置新的标记和地图中心
        markers: newMarkers,
        latitude: 0,
        longitude: newSatellite.position,
        scale: 3
      });
      
      // 更新覆盖数据状态（这会从新卫星的缓存加载设置）
      this.updateCoverageDataStatus();
      
      // 加载完缓存后，检查是否需要重绘仰角线
      // 注意：如果新卫星有缓存的仰角线状态，使用缓存的状态
      // 否则使用之前卫星的状态
      setTimeout(() => {
        const shouldShowElevation = this.data.showElevationContours || wasElevationContoursShown;
        if (shouldShowElevation) {
          this.setData({ showElevationContours: true });
          this.drawElevationContours();
        }
        // 切换完成，重置切换状态
        this.setData({ isSwitchingSatellite: false });
      }, 100);
    }, 50);
  },

  /**
   * 一键清除所有绘图（等仰角线和覆盖图）
   */
  clearAllDrawings() {
    const { currentSatellite } = this.data;
    
    // 先清空所有标记和线条（强制地图组件识别变化）
    this.setData({
      polylines: [],
      markers: [],
      circles: []
    });
    
    // 使用 setTimeout 确保地图组件有时间处理清空操作
    // 微信小程序地图组件对 markers 的更新有时不会立即生效
    setTimeout(() => {
      // 根据地图类型确定卫星信息文字颜色
      const satelliteTextColor = this.data.enableSatellite ? '#FFFFFF' : '#333333';
      
      // 重新创建卫星标记
      const newMarkers = [];
      if (currentSatellite) {
        newMarkers.push({
          id: 1,
          latitude: 0,
          longitude: currentSatellite.position,
          iconPath: '/images/satellite.png',
          width: 40,
          height: 40,
          anchor: { x: 0.5, y: 0.5 },
          callout: {
            content: `${currentSatellite.name}\n轨位: ${currentSatellite.position}°E`,
            color: satelliteTextColor,
            fontSize: 12,
            borderRadius: 4,
            bgColor: '#ffffff',
            padding: 8,
            display: 'BYCLICK'
          }
        });
      }
      
      this.setData({
        markers: newMarkers,
        showElevationContours: false,
        showCoverageContours: false,
        currentCoverageData: null,
        currentCoverageDataList: [],
        availableGainValues: [],
        selectedGainValues: [],
        gainValueItems: [],
        showBeamLabels: false  // 同时重置波束名标签状态
      });
    }, 50);
    
    wx.showToast({
      title: '已清除所有绘图',
      icon: 'none'
    });
  },

  // 移动到用户位置
  moveToUserLocation() {
    if (!this.data.hasUserLocation) {
      wx.showToast({
        title: '暂无位置信息',
        icon: 'none'
      });
      return;
    }
    
    this.mapCtx.moveToLocation({
      latitude: this.data.userLatitude,
      longitude: this.data.userLongitude
    });
  },

  // 移动到卫星覆盖中心
  moveToSatellite() {
    const coverage = this.data.currentSatellite.coverage;
    this.setData({
      latitude: coverage.lat,
      longitude: coverage.lng,
      scale: 3
    });
  },

  /**
   * 更新当前卫星的覆盖数据状态
   */
  updateCoverageDataStatus() {
    const { currentSatellite } = this.data;
    if (!currentSatellite) return;
    
    const hasCoverage = coverageIndex.hasCoverageData(currentSatellite.name);
    
    if (hasCoverage) {
      const bands = coverageIndex.getBandsForSatellite(currentSatellite.name);
      const firstBand = bands[0] || '';
      
      this.setData({
        hasCoverageData: true,
        availableBands: bands,
        selectedBand: firstBand
      });
      
      // 初始化第一个频段的波束
      if (firstBand) {
        this.updateBeamsForBand(firstBand);
      }
      
      // 尝试从缓存加载之前的设置（包括搜索标记和线条）
      this.loadCoverageSettings();
    } else {
      this.setData({
        hasCoverageData: false,
        availableBands: [],
        availableBeams: [],
        selectedBand: '',
        selectedBeams: [],
        hasEIRP: false,
        hasGT: false
      });
      
      // 即使没有覆盖数据，也要尝试恢复搜索标记和线条
      this.loadDrawnContentOnly();
    }
  },

  /**
   * 更新指定频段的波束列表
   */
  updateBeamsForBand(band) {
    const { currentSatellite } = this.data;
    if (!currentSatellite) return;
    
    const beams = coverageIndex.getBeamsForBand(currentSatellite.name, band);
    const beamNames = [...new Set(beams.map(b => b.beam))];
    
    this.setData({
      availableBeams: beamNames,
      selectedBeams: []  // 切换频段时清空已选波束
    });
    
    // 更新类型可用性（根据整个频段）
    this.updateTypeAvailabilityForBand(band);
  },

  /**
   * 更新EIRP/GT类型的可用性（根据整个频段）
   */
  updateTypeAvailabilityForBand(band) {
    const { currentSatellite } = this.data;
    if (!currentSatellite) return;
    
    const beams = coverageIndex.getBeamsForBand(currentSatellite.name, band);
    
    const hasEIRP = beams.some(b => b.type === 'EIRP');
    const hasGT = beams.some(b => b.type === 'GT');
    
    // 自动选择可用的类型
    let selectedType = this.data.selectedType;
    if (selectedType === 'EIRP' && !hasEIRP && hasGT) {
      selectedType = 'GT';
    } else if (selectedType === 'GT' && !hasGT && hasEIRP) {
      selectedType = 'EIRP';
    }
    
    this.setData({
      hasEIRP,
      hasGT,
      selectedType
    });
  },

  /**
   * 更新EIRP/GT类型的可用性（根据选中的波束）
   */
  updateTypeAvailability(band, beamList) {
    const { currentSatellite } = this.data;
    if (!currentSatellite) return;
    
    const allBeams = coverageIndex.getBeamsForBand(currentSatellite.name, band);
    const matchingBeams = allBeams.filter(b => beamList.includes(b.beam));
    
    const hasEIRP = matchingBeams.some(b => b.type === 'EIRP');
    const hasGT = matchingBeams.some(b => b.type === 'GT');
    
    // 自动选择可用的类型
    let selectedType = this.data.selectedType;
    if (selectedType === 'EIRP' && !hasEIRP && hasGT) {
      selectedType = 'GT';
    } else if (selectedType === 'GT' && !hasGT && hasEIRP) {
      selectedType = 'EIRP';
    }
    
    this.setData({
      hasEIRP,
      hasGT,
      selectedType
    });
  },

  /**
   * 显示覆盖图设置弹窗
   */
  showCoveragePanel() {
    const { hasCoverageData } = this.data;
    
    if (!hasCoverageData) {
      wx.showToast({
        title: '该卫星暂无覆盖数据',
        icon: 'none'
      });
      return;
    }
    
    this.setData({ showCoveragePopup: true });
  },

  /**
   * 隐藏覆盖图设置弹窗
   */
  hideCoveragePanel() {
    this.setData({ showCoveragePopup: false });
  },

  /**
   * 频段选择改变
   */
  onBandChange(e) {
    const band = e.currentTarget.dataset.band;
    this.setData({ selectedBand: band });
    this.updateBeamsForBand(band);
    // 自动保存设置
    this.saveCoverageSettings();
  },

  /**
   * 波束选择改变（多选）
   */
  onBeamChange(e) {
    const beam = e.currentTarget.dataset.beam;
    const { selectedBeams, selectedBand } = this.data;
    
    let newSelectedBeams;
    if (selectedBeams.includes(beam)) {
      // 已选中，取消选择
      newSelectedBeams = selectedBeams.filter(b => b !== beam);
    } else {
      // 未选中，添加选择
      newSelectedBeams = [...selectedBeams, beam];
    }
    
    this.setData({ selectedBeams: newSelectedBeams });
    
    // 更新类型可用性
    if (newSelectedBeams.length > 0) {
      this.updateTypeAvailability(selectedBand, newSelectedBeams);
    }
    // 自动保存设置
    this.saveCoverageSettings();
  },

  /**
   * 全选/取消全选波束
   */
  toggleAllBeams() {
    const { availableBeams, selectedBeams, selectedBand } = this.data;
    const allSelected = selectedBeams.length === availableBeams.length;
    
    const newSelectedBeams = allSelected ? [] : [...availableBeams];
    
    this.setData({ selectedBeams: newSelectedBeams });
    
    // 更新类型可用性
    if (newSelectedBeams.length > 0) {
      this.updateTypeAvailability(selectedBand, newSelectedBeams);
    }
    // 自动保存设置
    this.saveCoverageSettings();
  },

  /**
   * 类型选择改变 (EIRP/GT)
   */
  onTypeChange(e) {
    const type = e.currentTarget.dataset.type;
    const { hasEIRP, hasGT } = this.data;
    
    // 检查类型是否可用
    if (type === 'EIRP' && !hasEIRP) {
      wx.showToast({ title: 'EIRP数据不可用', icon: 'none' });
      return;
    }
    if (type === 'GT' && !hasGT) {
      wx.showToast({ title: 'G/T数据不可用', icon: 'none' });
      return;
    }
    
    this.setData({ selectedType: type });
    // 自动保存设置
    this.saveCoverageSettings();
  },

  /**
   * 仅加载覆盖数据（不重绘），用于从缓存恢复时补充数据
   * @param {string} selectedBand - 选中的频段
   * @param {Array} selectedBeams - 选中的波束列表
   * @param {string} selectedType - 选中的类型
   */
  loadCoverageDataOnly(selectedBand, selectedBeams, selectedType) {
    const { currentSatellite } = this.data;
    
    if (!currentSatellite || !selectedBand || selectedBeams.length === 0) {
      return;
    }
    
    // 获取卫星文件夹名
    const satellite = coverageIndex.coverageIndex[currentSatellite.name];
    if (!satellite) {
      return;
    }
    
    const satelliteFolder = satellite.folder;
    const allBeams = coverageIndex.getBeamsForBand(currentSatellite.name, selectedBand);
    
    // 收集所有需要加载的波束信息
    const beamsToLoad = [];
    for (const beamName of selectedBeams) {
      const beamInfo = allBeams.find(b => b.beam === beamName && b.type === selectedType);
      if (beamInfo) {
        const jsonFilename = beamInfo.file.replace(/\.gxt$/i, '.json');
        beamsToLoad.push({
          beamName: beamName,
          filename: jsonFilename,
          satelliteFolder: satelliteFolder
        });
      }
    }
    
    if (beamsToLoad.length === 0) {
      return;
    }
    
    // 设置加载中状态
    this.setData({ isLoadingCoverageData: true });
    
    // 初始化多波束加载（静默模式，不显示loading）
    this.pendingBeamDataForRestore = [];
    this.totalBeamsToRestore = beamsToLoad.length;
    this.restoredBeamsCount = 0;
    
    // 并行加载所有波束数据
    for (const beam of beamsToLoad) {
      this.loadCoverageDataOnlyFromCloud(beam.satelliteFolder, beam.filename, beam.beamName, selectedType);
    }
  },

  /**
   * 从云存储加载覆盖数据（仅加载数据，不绘制）
   */
  loadCoverageDataOnlyFromCloud(satelliteFolder, filename, beamName, selectedType) {
    const that = this;
    
    wx.cloud.callFunction({
      name: 'getCoverageData',
      data: {
        satellite: satelliteFolder,
        filename: filename
      },
      success: res => {
        if (res.result && res.result.success && res.result.data) {
          that.processCoverageDataForRestore(res.result.data, beamName, selectedType);
        } else if (res.result && res.result.tempUrl) {
          // 如果云函数返回临时URL，则通过URL下载
          that.downloadCoverageDataOnlyFromUrl(res.result.tempUrl, beamName, selectedType);
        } else {
          that.restoredBeamsCount++;
          that.checkAllBeamsRestoredDataLoaded();
        }
      },
      fail: err => {
        console.error('加载覆盖数据失败:', err);
        that.restoredBeamsCount++;
        that.checkAllBeamsRestoredDataLoaded();
      }
    });
  },

  /**
   * 从URL下载覆盖数据（仅加载数据，不绘制）
   */
  downloadCoverageDataOnlyFromUrl(url, beamName, selectedType) {
    const that = this;
    
    wx.request({
      url: url,
      success: res => {
        if (res.statusCode === 200 && res.data) {
          that.processCoverageDataForRestore(res.data, beamName, selectedType);
        } else {
          that.restoredBeamsCount++;
          that.checkAllBeamsRestoredDataLoaded();
        }
      },
      fail: err => {
        console.error('下载覆盖数据失败:', err);
        that.restoredBeamsCount++;
        that.checkAllBeamsRestoredDataLoaded();
      }
    });
  },

  /**
   * 处理恢复的覆盖数据（仅存储，不绘制）
   */
  processCoverageDataForRestore(data, beamName, selectedType) {
    if (!data || !data.contours) {
      this.restoredBeamsCount++;
      this.checkAllBeamsRestoredDataLoaded();
      return;
    }
    
    // 添加波束名到数据中
    data.beamName = beamName;
    data.type = selectedType;
    
    // 添加到待处理列表
    this.pendingBeamDataForRestore.push(data);
    this.restoredBeamsCount++;
    
    // 检查是否所有波束都加载完成
    this.checkAllBeamsRestoredDataLoaded();
  },

  /**
   * 检查所有恢复数据是否加载完成
   */
  checkAllBeamsRestoredDataLoaded() {
    if (this.restoredBeamsCount < this.totalBeamsToRestore) {
      return;
    }
    
    const beamDataList = this.pendingBeamDataForRestore;
    
    if (beamDataList.length === 0) {
      // 没有数据，重置加载状态
      this.setData({ isLoadingCoverageData: false });
      return;
    }
    
    // 提取所有波束的覆盖值
    const allGainValues = new Set();
    const perBeamGainSets = [];
    beamDataList.forEach(data => {
      if (data && data.contours) {
        const beamGains = new Set();
        data.contours.forEach(c => {
          if (c && c.g !== undefined) {
            allGainValues.add(c.g);
            beamGains.add(c.g);
          }
        });
        if (beamGains.size > 0) {
          perBeamGainSets.push(beamGains);
        }
      }
    });
    
    const gainValues = [...allGainValues].sort((a, b) => b - a);
    
    if (gainValues.length === 0) {
      // 没有有效数据，重置加载状态
      this.setData({ isLoadingCoverageData: false });
      return;
    }
    
    // 多波束时求交集，用于更合理的默认选择
    let commonGainValues = gainValues;
    if (perBeamGainSets.length > 1) {
      const intersection = gainValues.filter(v => 
        perBeamGainSets.every(s => s.has(v))
      );
      if (intersection.length > 0) {
        commonGainValues = intersection;
      }
    }
    
    // 使用缓存的增益值选择，如果没有则从共有值中默认选3个，并保证每个波束至少有一条
    const cachedSelectedGainValues = this.data.selectedGainValues;
    const selectedGainValues = cachedSelectedGainValues.length > 0 
      ? cachedSelectedGainValues.filter(v => gainValues.includes(v))
      : (perBeamGainSets.length > 1
        ? this.selectDefaultGainValuesMultiBeam(gainValues, commonGainValues, perBeamGainSets)
        : this.selectDefaultGainValues(commonGainValues));
    
    const gainValueItems = gainValues.map(v => ({
      value: v,
      selected: selectedGainValues.includes(v)
    }));
    
    // 存储多波束数据（不绘制，因为线条已从缓存恢复）
    this.setData({
      currentCoverageDataList: beamDataList,
      currentCoverageData: beamDataList[0],
      availableGainValues: gainValues,
      selectedGainValues: selectedGainValues,
      gainValueItems,
      // 重置加载状态
      isLoadingCoverageData: false
    });
    
    console.log('已从缓存恢复覆盖数据:', beamDataList.length, '个波束');
  },

  /**
   * 加载并绘制覆盖图
   * 支持多波束叠加显示
   * 从云存储动态加载覆盖数据
   */
  loadAndDrawCoverage() {
    const { currentSatellite, selectedBand, availableBeams, selectedType } = this.data;
    let { selectedBeams } = this.data;
    
    if (!currentSatellite || !selectedBand) {
      wx.showToast({ title: '请先选择频段', icon: 'none' });
      return;
    }
    
    // 如果没有选择波束，使用全部可用波束
    if (selectedBeams.length === 0 && availableBeams.length > 0) {
      selectedBeams = [...availableBeams];
      this.setData({ selectedBeams });
      // 更新类型可用性
      this.updateTypeAvailability(selectedBand, selectedBeams);
      // 保存设置
      this.saveCoverageSettings();
    }
    
    if (selectedBeams.length === 0) {
      wx.showToast({ title: '无可用波束', icon: 'none' });
      return;
    }
    
    // 获取卫星文件夹名
    const satellite = coverageIndex.coverageIndex[currentSatellite.name];
    if (!satellite) {
      wx.showToast({ title: '卫星数据不存在', icon: 'none' });
      return;
    }
    
    const satelliteFolder = satellite.folder;
    const allBeams = coverageIndex.getBeamsForBand(currentSatellite.name, selectedBand);
    
    // 收集所有需要加载的波束信息
    const beamsToLoad = [];
    for (const beamName of selectedBeams) {
      const beamInfo = allBeams.find(b => b.beam === beamName && b.type === selectedType);
      if (beamInfo) {
        const jsonFilename = beamInfo.file.replace(/\.gxt$/i, '.json');
        beamsToLoad.push({
          beamName: beamName,
          filename: jsonFilename,
          satelliteFolder: satelliteFolder
        });
      }
    }
    
    if (beamsToLoad.length === 0) {
      wx.showToast({ title: '未找到对应覆盖数据', icon: 'none' });
      return;
    }
    
    wx.showLoading({ title: '加载中...' });
    
    // 初始化多波束加载
    this.pendingBeamData = [];
    this.totalBeamsToLoad = beamsToLoad.length;
    this.loadedBeamsCount = 0;
    
    // 并行加载所有波束数据
    for (const beam of beamsToLoad) {
      this.loadCoverageFromCloudMulti(beam.satelliteFolder, beam.filename, beam.beamName, selectedType);
    }
  },

  /**
   * 从云存储加载覆盖数据
   * @param {string} satelliteFolder - 卫星文件夹名
   * @param {string} filename - JSON文件名
   */
  loadCoverageFromCloud(satelliteFolder, filename) {
    const { selectedBeam, selectedType } = this.data;
    const that = this;
    
    console.log('正在从云存储加载:', satelliteFolder, filename);
    
    // 使用云函数加载数据
    wx.cloud.callFunction({
      name: 'getCoverageData',
      data: {
        satellite: satelliteFolder,
        filename: filename
      },
      success: res => {
        console.log('云函数返回:', res);
        if (res.result && res.result.success && res.result.data) {
          that.processCoverageData(res.result.data, selectedBeam, selectedType);
        } else if (res.result && res.result.tempUrl) {
          // 如果云函数返回临时URL，则通过URL下载
          that.downloadCoverageFromUrl(res.result.tempUrl, selectedBeam, selectedType);
        } else {
          wx.hideLoading();
          console.error('云函数返回错误:', res.result);
          wx.showToast({ 
            title: res.result?.errMsg || '加载数据失败', 
            icon: 'none' 
          });
        }
      },
      fail: err => {
        console.error('云函数调用失败:', err);
        // 尝试直接从云存储下载（备选方案）
        that.loadCoverageFromCloudStorage(satelliteFolder, filename, selectedBeam, selectedType);
      }
    });
  },

  /**
   * 直接从云存储下载覆盖数据（备选方案）
   */
  loadCoverageFromCloudStorage(satelliteFolder, filename, selectedBeam, selectedType) {
    const that = this;
    
    // 构建云存储文件ID - 需要根据实际上传后的文件ID格式调整
    const cloudPath = `coverage/${satelliteFolder}/${filename}`;
    
    console.log('尝试直接从云存储下载:', cloudPath);
    
    // 先尝试下载文件
    wx.cloud.downloadFile({
      fileID: cloudPath,
      success: res => {
        // 读取下载的文件
        const fs = wx.getFileSystemManager();
        fs.readFile({
          filePath: res.tempFilePath,
          encoding: 'utf8',
          success: fileRes => {
            try {
              const data = JSON.parse(fileRes.data);
              that.processCoverageData(data, selectedBeam, selectedType);
            } catch (e) {
              wx.hideLoading();
              console.error('解析JSON失败:', e);
              wx.showToast({ title: '数据格式错误', icon: 'none' });
            }
          },
          fail: readErr => {
            wx.hideLoading();
            console.error('读取文件失败:', readErr);
            wx.showToast({ title: '读取数据失败', icon: 'none' });
          }
        });
      },
      fail: err => {
        wx.hideLoading();
        console.error('云存储下载失败:', err);
        wx.showToast({ title: '云存储访问失败', icon: 'none' });
      }
    });
  },

  /**
   * 从URL下载覆盖数据
   */
  downloadCoverageFromUrl(url, selectedBeam, selectedType) {
    const that = this;
    
    wx.request({
      url: url,
      method: 'GET',
      success: (response) => {
        if (response.statusCode === 200 && response.data) {
          that.processCoverageData(response.data, selectedBeam, selectedType);
        } else {
          wx.hideLoading();
          console.error('下载覆盖数据失败:', response);
          wx.showToast({ title: '下载数据失败', icon: 'none' });
        }
      },
      fail: (error) => {
        wx.hideLoading();
        console.error('请求覆盖数据失败:', error);
        wx.showToast({ title: '网络请求失败', icon: 'none' });
      }
    });
  },

  /**
   * 从云存储加载覆盖数据（多波束版本）
   * @param {string} satelliteFolder - 卫星文件夹名
   * @param {string} filename - JSON文件名
   * @param {string} beamName - 波束名称
   * @param {string} selectedType - 选中的类型
   */
  loadCoverageFromCloudMulti(satelliteFolder, filename, beamName, selectedType) {
    const that = this;
    
    console.log('正在从云存储加载波束:', beamName, satelliteFolder, filename);
    
    // 使用云函数加载数据
    wx.cloud.callFunction({
      name: 'getCoverageData',
      data: {
        satellite: satelliteFolder,
        filename: filename
      },
      success: res => {
        console.log('云函数返回 (波束:', beamName, '):', res);
        if (res.result && res.result.success && res.result.data) {
          that.onBeamDataLoaded(res.result.data, beamName, selectedType, true);
        } else if (res.result && res.result.tempUrl) {
          // 如果云函数返回临时URL，则通过URL下载
          that.downloadCoverageFromUrlMulti(res.result.tempUrl, beamName, selectedType);
        } else {
          console.error('云函数返回错误 (波束:', beamName, '):', res.result);
          that.onBeamDataLoaded(null, beamName, selectedType, false);
        }
      },
      fail: err => {
        console.error('云函数调用失败 (波束:', beamName, '):', err);
        // 尝试直接从云存储下载（备选方案）
        that.loadCoverageFromCloudStorageMulti(satelliteFolder, filename, beamName, selectedType);
      }
    });
  },

  /**
   * 直接从云存储下载覆盖数据（多波束版本）
   */
  loadCoverageFromCloudStorageMulti(satelliteFolder, filename, beamName, selectedType) {
    const that = this;
    const cloudPath = `coverage/${satelliteFolder}/${filename}`;
    
    console.log('尝试直接从云存储下载 (波束:', beamName, '):', cloudPath);
    
    wx.cloud.downloadFile({
      fileID: cloudPath,
      success: res => {
        const fs = wx.getFileSystemManager();
        fs.readFile({
          filePath: res.tempFilePath,
          encoding: 'utf8',
          success: fileRes => {
            try {
              const data = JSON.parse(fileRes.data);
              that.onBeamDataLoaded(data, beamName, selectedType, true);
            } catch (e) {
              console.error('解析JSON失败 (波束:', beamName, '):', e);
              that.onBeamDataLoaded(null, beamName, selectedType, false);
            }
          },
          fail: readErr => {
            console.error('读取文件失败 (波束:', beamName, '):', readErr);
            that.onBeamDataLoaded(null, beamName, selectedType, false);
          }
        });
      },
      fail: err => {
        console.error('云存储下载失败 (波束:', beamName, '):', err);
        that.onBeamDataLoaded(null, beamName, selectedType, false);
      }
    });
  },

  /**
   * 从URL下载覆盖数据（多波束版本）
   */
  downloadCoverageFromUrlMulti(url, beamName, selectedType) {
    const that = this;
    
    wx.request({
      url: url,
      method: 'GET',
      success: (response) => {
        if (response.statusCode === 200 && response.data) {
          that.onBeamDataLoaded(response.data, beamName, selectedType, true);
        } else {
          console.error('下载覆盖数据失败 (波束:', beamName, '):', response);
          that.onBeamDataLoaded(null, beamName, selectedType, false);
        }
      },
      fail: (error) => {
        console.error('请求覆盖数据失败 (波束:', beamName, '):', error);
        that.onBeamDataLoaded(null, beamName, selectedType, false);
      }
    });
  },

  /**
   * 单个波束数据加载完成的回调
   * @param {Object} data - 覆盖数据
   * @param {string} beamName - 波束名称
   * @param {string} selectedType - 选中的类型
   * @param {boolean} success - 是否成功
   */
  onBeamDataLoaded(data, beamName, selectedType, success) {
    this.loadedBeamsCount++;
    
    if (success && data && data.contours) {
      // 为数据添加波束名称标记
      data.beamName = beamName;
      this.pendingBeamData.push(data);
    }
    
    // 检查是否所有波束都加载完成
    if (this.loadedBeamsCount >= this.totalBeamsToLoad) {
      wx.hideLoading();
      
      if (this.pendingBeamData.length === 0) {
        wx.showToast({ title: '所有波束数据加载失败', icon: 'none' });
        return;
      }
      
      // 处理并绘制所有波束数据
      this.processMultiBeamData(this.pendingBeamData, selectedType);
    }
  },

  /**
   * 处理多波束覆盖数据
   * @param {Array} beamDataList - 波束数据数组
   * @param {string} selectedType - 选中的类型
   */
  processMultiBeamData(beamDataList, selectedType) {
    // 收集所有波束的增益值（并集，用于完整列表展示）
    const allGainValues = new Set();
    // 收集每个波束各自的增益值集合（用于求交集）
    const perBeamGainSets = [];
    beamDataList.forEach(data => {
      if (data && data.contours) {
        const beamGains = new Set();
        data.contours.forEach(c => {
          if (c && c.g !== undefined) {
            allGainValues.add(c.g);
            beamGains.add(c.g);
          }
        });
        if (beamGains.size > 0) {
          perBeamGainSets.push(beamGains);
        }
      }
    });
    
    const gainValues = [...allGainValues].sort((a, b) => b - a);
    
    if (gainValues.length === 0) {
      wx.showToast({ title: '无有效覆盖数据', icon: 'none' });
      return;
    }
    
    // 多波束时，求各波束共有的增益值交集，用于更合理的默认选择
    let commonGainValues = gainValues;
    if (perBeamGainSets.length > 1) {
      const intersection = gainValues.filter(v => 
        perBeamGainSets.every(s => s.has(v))
      );
      if (intersection.length > 0) {
        commonGainValues = intersection;
      }
    }
    
    // 尝试从缓存获取之前选择的覆盖值，无缓存则从共有值中默认选3个，并保证每个波束至少有一条
    const cachedSelectedGainValues = this.getCachedGainValues(gainValues);
    const selectedGainValues = cachedSelectedGainValues.length > 0 
      ? cachedSelectedGainValues 
      : (perBeamGainSets.length > 1 
        ? this.selectDefaultGainValuesMultiBeam(gainValues, commonGainValues, perBeamGainSets)
        : this.selectDefaultGainValues(commonGainValues));
    
    const gainValueItems = gainValues.map(v => ({
      value: v,
      selected: selectedGainValues.includes(v)
    }));
    
    // 存储多波束数据
    this.setData({
      currentCoverageDataList: beamDataList,  // 多波束数据列表
      currentCoverageData: beamDataList[0],   // 兼容旧逻辑，保留第一个
      availableGainValues: gainValues,
      selectedGainValues: selectedGainValues,
      gainValueItems,
      showCoveragePopup: false,
      showCoverageContours: true
    });
    
    // 绘制所有波束的覆盖图（使用缓存的或全部的覆盖值）
    this.drawMultiBeamCoverageContours(beamDataList, selectedGainValues);
    
    // 显示加载结果
    const beamNames = beamDataList.map(d => d.beamName).join(', ');
    wx.showToast({
      title: `已加载 ${beamDataList.length} 个波束`,
      icon: 'success',
      duration: 2000
    });
  },

  /**
   * 处理从云端获取的覆盖数据
   * @param {Object} data - 覆盖数据对象
   * @param {string} selectedBeam - 选中的波束
   * @param {string} selectedType - 选中的类型
   */
  processCoverageData(data, selectedBeam, selectedType) {
    if (!data || !data.contours) {
      wx.hideLoading();
      wx.showToast({ title: '覆盖数据格式错误', icon: 'none' });
      return;
    }
    
    // 提取可用的增益值 (数据中使用 'g' 属性表示增益值)
    const gainValues = data.contours
      .filter(c => c && c.g !== undefined)
      .map(c => c.g)
      .sort((a, b) => b - a);
    
    if (gainValues.length === 0) {
      wx.hideLoading();
      wx.showToast({ title: '无有效覆盖数据', icon: 'none' });
      return;
    }
    
    // 尝试从缓存获取之前选择的覆盖值，无缓存则默认选3个
    const cachedSelectedGainValues = this.getCachedGainValues(gainValues);
    const selectedGainValues = cachedSelectedGainValues.length > 0 
      ? cachedSelectedGainValues 
      : this.selectDefaultGainValues(gainValues);
    
    const gainValueItems = gainValues.map(v => ({
      value: v,
      selected: selectedGainValues.includes(v)
    }));
    
    this.setData({
      currentCoverageData: data,
      availableGainValues: gainValues,
      selectedGainValues: selectedGainValues,
      gainValueItems,
      showCoveragePopup: false,
      showCoverageContours: true
    });
    
    // 绘制覆盖图（使用缓存的或全部的覆盖值）
    this.drawCoverageContours(data, selectedGainValues);
    
    wx.hideLoading();
  },

  /**
   * 计算波束中心（使用覆盖值最高的等值线的几何中心）
   */
  calculateBeamCenter(data) {
    if (!data || !data.contours || data.contours.length === 0) return null;
    
    // 找到覆盖值（g值）最高的等值线
    let maxGainContour = null;
    let maxGain = -Infinity;
    
    data.contours.forEach(contour => {
      if (contour && contour.g !== undefined && contour.g > maxGain && contour.p && contour.p.length > 0) {
        maxGain = contour.g;
        maxGainContour = contour;
      }
    });
    
    if (!maxGainContour || !maxGainContour.p || maxGainContour.p.length === 0) return null;
    
    let totalLat = 0;
    let totalLon = 0;
    let pointCount = 0;
    
    maxGainContour.p.forEach(p => {
      const lon = p[0];
      const lat = p[1];
      if (typeof lon === 'number' && typeof lat === 'number' 
          && !isNaN(lon) && !isNaN(lat)
          && isFinite(lon) && isFinite(lat)
          && lat >= -90 && lat <= 90) {
        totalLat += lat;
        totalLon += lon;
        pointCount++;
      }
    });
    
    if (pointCount === 0) return null;
    
    return {
      latitude: totalLat / pointCount,
      longitude: this.normalizeLongitude(totalLon / pointCount)
    };
  },

  /**
   * 计算等值线的智能标签位置
   * 模拟satsoft效果：标签嵌在线上，不同等值线的标签位置错开
   * @param {Array} points - 等值线上的点数组 [{latitude, longitude}]
   * @param {number} gValue - 等值线的g值，用作确定位置偏移
   * @param {number} contourIndex - 等值线在当前显示列表中的索引
   * @returns {Array} 标签位置数组 [{point, anchorX, anchorY}]
   */
  calculateContourLabelPositions(points, gValue = 0, contourIndex = 0) {
    if (!points || points.length < 2) return [];
    
    // 过滤有效点
    const validPoints = points.filter(p => 
      p.latitude >= -90 && p.latitude <= 90 &&
      p.longitude >= -180 && p.longitude <= 180 &&
      isFinite(p.latitude) && isFinite(p.longitude)
    );
    
    if (validPoints.length < 2) return [];
    
    // 计算两点间的经度差（处理跨越180度经线的情况）
    const lonDiff = (lon1, lon2) => {
      let diff = lon2 - lon1;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      return diff;
    };
    
    // 计算等值线的总长度（累计距离）和每个点的累计距离
    const distances = [0];
    for (let i = 1; i < validPoints.length; i++) {
      const p1 = validPoints[i - 1];
      const p2 = validPoints[i];
      const dLat = p2.latitude - p1.latitude;
      const dLon = lonDiff(p1.longitude, p2.longitude);
      const segmentLength = Math.sqrt(dLat * dLat + dLon * dLon);
      distances.push(distances[i - 1] + segmentLength);
    }
    const totalLength = distances[distances.length - 1];
    
    if (totalLength < 0.5) {
      // 等值线太小，只放一个标签在中点
      const midIdx = Math.floor(validPoints.length / 2);
      return [{
        point: validPoints[midIdx],
        anchorX: 0,
        anchorY: 0  // 标签中心在线上
      }];
    }
    
    // 根据等值线长度决定标签数量：2个标签，大的等值线可以有3个
    const labelCount = totalLength > 60 ? 3 : 2;
    
    // 使用等值线索引来错开不同等值线的标签位置
    // 这样相邻的等值线（如48和46）标签不会在同一位置
    const baseOffset = (contourIndex % labelCount) / labelCount;
    
    // 计算均匀分布的目标距离位置
    const selectedLabels = [];
    for (let i = 0; i < labelCount; i++) {
      // 计算这个标签的目标位置（0-1之间的比例）
      // 每个标签均匀分布，加上基于索引的偏移让不同等值线错开
      const ratio = ((i + 0.5) / labelCount + baseOffset) % 1;
      const targetDistance = ratio * totalLength;
      
      // 找到这个距离对应的点
      let found = false;
      for (let j = 1; j < distances.length; j++) {
        if (distances[j] >= targetDistance) {
          const prevDist = distances[j - 1];
          const currDist = distances[j];
          const segmentLen = currDist - prevDist;
          
          if (segmentLen < 0.0001) {
            selectedLabels.push({
              point: validPoints[j - 1],
              anchorX: 0,
              anchorY: 0
            });
          } else {
            const t = (targetDistance - prevDist) / segmentLen;
            const p1 = validPoints[j - 1];
            const p2 = validPoints[j];
            
            let interpolatedLon = p1.longitude + t * lonDiff(p1.longitude, p2.longitude);
            if (interpolatedLon > 180) interpolatedLon -= 360;
            if (interpolatedLon < -180) interpolatedLon += 360;
            
            const interpolatedPoint = {
              latitude: p1.latitude + t * (p2.latitude - p1.latitude),
              longitude: interpolatedLon
            };
            
            selectedLabels.push({
              point: interpolatedPoint,
              anchorX: 0,
              anchorY: 0  // 标签中心正好在线上
            });
          }
          found = true;
          break;
        }
      }
      
      if (!found && validPoints.length > 0) {
        selectedLabels.push({
          point: validPoints[validPoints.length - 1],
          anchorX: 0,
          anchorY: 0
        });
      }
    }
    
    return selectedLabels;
  },

  /**
   * 绘制覆盖等值线
   */
  drawCoverageContours(data, selectedValues) {
    if (!data || !data.contours) return;
    
    const polylines = [];
    const colors = this.generateColorPalette(selectedValues.length);
    
    // 保留现有的marker（卫星标记id=1，等仰角线标记id>=100且<1000，搜索标记id>=5000且<10000）
    // 注意：波束名标记id在4000-4999范围，不会被保留，每次重新绘制
    // 排除id>=10000的残留描边层markers
    const existingMarkers = this.data.markers.filter(m => m.id === 1 || (m.id >= 100 && m.id < 1000) || (m.id >= 5000 && m.id < 10000));
    const coverageMarkers = [];
    let markerIdCounter = 1000;  // 使用自增计数器避免同一增益值多段等值线导致ID重复
    
    data.contours.forEach((contour, idx) => {
      // 跳过无效数据或未选中的值
      if (!contour || contour.g === undefined) return;
      if (!selectedValues.includes(contour.g)) return;
      
      const colorIndex = selectedValues.indexOf(contour.g);
      const color = colors[colorIndex % colors.length];
      
      // 数据格式: p 是点数组，每个点是 [lon, lat]
      if (contour.p && contour.p.length >= 2) {
        const points = contour.p
          .filter(p => {
            // 过滤掉无效的坐标点
            const lon = p[0];
            const lat = p[1];
            return typeof lon === 'number' && typeof lat === 'number' 
              && !isNaN(lon) && !isNaN(lat)
              && isFinite(lon) && isFinite(lat)
              && lat >= -90 && lat <= 90
              && lon >= -360 && lon <= 360;  // 允许稍大范围，后面会标准化
          })
          .map(p => {
            const normalizedLon = this.normalizeLongitude(p[0]);
            return {
              latitude: p[1],   // 纬度是第二个元素
              longitude: normalizedLon   // 经度标准化到 [-180, 180]
            };
          });
        
        // 分割跨越180°经线的线段
        const segments = this.splitContourAtAntimeridian(points);
        
        segments.forEach(segment => {
          if (segment.length >= 2) {
            polylines.push({
              points: segment,
              color: color,
              width: 1,
              dottedLine: false,
              arrowLine: false,
              level: 'abovelabels'  // 显示在所有POI之上
            });
          }
        });
        
        // 在等值线上添加覆盖值标注（satsoft风格：标签嵌入线中，不同等值线错开）
        if (points.length > 0) {
          const labelPositions = this.calculateContourLabelPositions(points, contour.g, colorIndex);
          
          labelPositions.forEach((labelPos, labelIdx) => {
            coverageMarkers.push({
              id: markerIdCounter++,
              latitude: labelPos.point.latitude,
              longitude: labelPos.point.longitude,
              iconPath: '/images/transparent.png',
              width: 1,
              height: 1,
              label: {
                content: contour.g + '',
                color: color,
                fontSize: 9,
                anchorX: labelPos.anchorX,
                anchorY: labelPos.anchorY
              }
            });
          });
        }
      }
    });
    
    // 保留现有的等仰角线（放在覆盖图上层，避免被遮挡）
    let existingElevationPolylines = [];
    if (this.data.showElevationContours) {
      // 等仰角线使用黑色，覆盖图使用彩色
      existingElevationPolylines = this.data.polylines.filter(p => p.color === '#000000');
    }
    
    // 绘制波束中心标记（borePoints）：在波束中心画"+"号，标注覆盖值，显示波束名
    const beamName = data.beamName || (this.data.selectedBeams.length > 0 ? this.data.selectedBeams[0] : '');
    let borePointIdCounter = 3000;
    if (data.borePoints && data.borePoints.length > 0) {
      const labelColor = colors.length > 0 ? colors[0] : '#2563eb';
      data.borePoints.forEach((bore) => {
        if (!bore || !bore.pos || bore.pos.length < 2) return;
        const boreLon = this.normalizeLongitude(bore.pos[0]);
        const boreLat = bore.pos[1];
        if (!isFinite(boreLat) || !isFinite(boreLon)) return;
        
        // "+" 号标记：anchorY=-9使18px字体的中心精确对准经纬度坐标
        coverageMarkers.push({
          id: borePointIdCounter++,
          latitude: boreLat,
          longitude: boreLon,
          iconPath: '/images/transparent.png',
          width: 1,
          height: 1,
          label: this._buildCenteredLabel('+', 14, labelColor, -7)
        });
        
        // 覆盖值（"+"正上方）：底边紧贴"+"顶边
        if (bore.gain !== undefined) {
          coverageMarkers.push({
            id: borePointIdCounter++,
            latitude: boreLat,
            longitude: boreLon,
            iconPath: '/images/transparent.png',
            width: 1,
            height: 1,
            label: this._buildCenteredLabel(bore.gain + '', 9, labelColor, -16)
          });
        }
        
        // 波束名（"+"正下方）：顶边紧贴"+"底边
        if (this.data.showBeamLabels && beamName) {
          coverageMarkers.push({
            id: borePointIdCounter++,
            latitude: boreLat,
            longitude: boreLon,
            iconPath: '/images/transparent.png',
            width: 1,
            height: 1,
            label: this._buildCenteredLabel(beamName, 9, labelColor, 7)
          });
        }
      });
    } else if (this.data.showBeamLabels && beamName) {
      // 无borePoints时回退到几何中心显示波束名
      const beamCenter = this.calculateBeamCenter(data);
      if (beamCenter && isFinite(beamCenter.latitude) && isFinite(beamCenter.longitude)) {
        const labelText = beamName || '波束';
        const fontSize = 9;
        const labelColor = colors.length > 0 ? colors[0] : '#2563eb';
        coverageMarkers.push({
          id: 4000,
          latitude: beamCenter.latitude,
          longitude: beamCenter.longitude,
          iconPath: '/images/transparent.png',
          width: 1,
          height: 1,
          label: this._buildCenteredLabel(labelText, fontSize, labelColor, -fontSize / 2)
        });
      }
    }
    
    // 覆盖图在底层，等仰角线在顶层（后面的polyline会显示在上层）
    this.setData({
      polylines: [...polylines, ...existingElevationPolylines],
      markers: [...existingMarkers, ...coverageMarkers]
    });
  },

  /**
   * 绘制多波束覆盖等值线（叠加显示）
   * @param {Array} beamDataList - 波束数据数组
   * @param {Array} selectedValues - 选中的增益值
   */
  drawMultiBeamCoverageContours(beamDataList, selectedValues) {
    if (!beamDataList || beamDataList.length === 0) return;
    
    const polylines = [];
    const coverageMarkers = [];
    
    // 保留现有的marker（卫星标记id=1，等仰角线标记id>=100且<1000，搜索标记id>=5000且<10000）
    // 注意：波束名标记id在4000-4999范围，不会被保留，每次重新绘制
    // 排除id>=10000的残留描边层markers
    const existingMarkers = this.data.markers.filter(m => m.id === 1 || (m.id >= 100 && m.id < 1000) || (m.id >= 5000 && m.id < 10000));
    
    // 为每个波束分配不同的颜色系
    const beamColorSets = [
      ['#FF0000', '#FF4500', '#FFA500', '#FFD700', '#FFFF00'],  // 红-橙-黄系
      ['#32CD32', '#00FA9A', '#00CED1', '#1E90FF', '#4169E1'],  // 绿-青-蓝系
      ['#8A2BE2', '#FF00FF', '#FF1493', '#DC143C', '#C71585'],  // 紫-粉系
      ['#2E8B57', '#3CB371', '#66CDAA', '#8FBC8F', '#20B2AA'],  // 深绿系
      ['#FF6347', '#FF7F50', '#F08080', '#CD5C5C', '#E9967A'],  // 珊瑚红系
      ['#4682B4', '#5F9EA0', '#6495ED', '#00BFFF', '#87CEEB'],  // 蓝色系
      ['#DAA520', '#B8860B', '#D2691E', '#CD853F', '#DEB887'],  // 金棕系
      ['#9370DB', '#BA55D3', '#DDA0DD', '#EE82EE', '#DA70D6']   // 紫罗兰系
    ];
    
    let markerIdCounter = 1000;
    let beamLabelIdCounter = 4001;  // 波束名标记从4001开始（4000-4999范围）
    let borePointIdCounter = 3000;  // 波束中心标记从3000开始（3000-3999范围）
    
    beamDataList.forEach((data, beamIndex) => {
      if (!data || !data.contours) return;
      
      const beamName = data.beamName || `波束${beamIndex + 1}`;
      const colorSet = beamColorSets[beamIndex % beamColorSets.length];
      
      // 筛选该波束的选中增益值
      const beamGainValues = data.contours
        .filter(c => c && c.g !== undefined && selectedValues.includes(c.g))
        .map(c => c.g)
        .sort((a, b) => b - a);
      
      const uniqueGainValues = [...new Set(beamGainValues)];
      
      data.contours.forEach((contour) => {
        if (!contour || contour.g === undefined) return;
        if (!selectedValues.includes(contour.g)) return;
        
        // 根据增益值在该波束中的排序分配颜色
        const valueIndex = uniqueGainValues.indexOf(contour.g);
        const color = colorSet[valueIndex % colorSet.length];
        
        if (contour.p && contour.p.length >= 2) {
          const points = contour.p
            .filter(p => {
              const lon = p[0];
              const lat = p[1];
              return typeof lon === 'number' && typeof lat === 'number' 
                && !isNaN(lon) && !isNaN(lat)
                && isFinite(lon) && isFinite(lat)
                && lat >= -90 && lat <= 90
                && lon >= -360 && lon <= 360;
            })
            .map(p => {
              const normalizedLon = this.normalizeLongitude(p[0]);
              return {
                latitude: p[1],
                longitude: normalizedLon
              };
            });
          
          const segments = this.splitContourAtAntimeridian(points);
          
          segments.forEach(segment => {
            if (segment.length >= 2) {
              polylines.push({
                points: segment,
                color: color,
                width: 1,
                dottedLine: false,
                arrowLine: false,
                level: 'abovelabels'  // 显示在所有POI之上
              });
            }
          });
          
          // 添加覆盖值标注（satsoft风格：标签嵌入线中，不同等值线错开）
          if (points.length > 0) {
            const labelPositions = this.calculateContourLabelPositions(points, contour.g, valueIndex);
            
            labelPositions.forEach((labelPos) => {
              coverageMarkers.push({
                id: markerIdCounter++,
                latitude: labelPos.point.latitude,
                longitude: labelPos.point.longitude,
                iconPath: '/images/transparent.png',
                width: 1,
                height: 1,
                label: {
                  content: contour.g + '',
                  color: color,
                  fontSize: 9,
                  anchorX: labelPos.anchorX,
                  anchorY: labelPos.anchorY
                }
              });
            });
          }
        }
      });
      
      // 绘制波束中心标记（borePoints）：在波束中心画"+"号，标注覆盖值，显示波束名
      const labelColor = colorSet[0 % colorSet.length];
      if (data.borePoints && data.borePoints.length > 0) {
        data.borePoints.forEach((bore) => {
          if (!bore || !bore.pos || bore.pos.length < 2) return;
          const boreLon = this.normalizeLongitude(bore.pos[0]);
          const boreLat = bore.pos[1];
          if (!isFinite(boreLat) || !isFinite(boreLon)) return;
          
          // "+" 号标记：anchorY=-9使18px字体的中心精确对准经纬度坐标
          coverageMarkers.push({
            id: borePointIdCounter++,
            latitude: boreLat,
            longitude: boreLon,
            iconPath: '/images/transparent.png',
            width: 1,
            height: 1,
            label: this._buildCenteredLabel('+', 14, labelColor, -7)
          });
          
          // 覆盖值（"+"正上方）：底边紧贴"+"顶边
          if (bore.gain !== undefined) {
            coverageMarkers.push({
              id: borePointIdCounter++,
              latitude: boreLat,
              longitude: boreLon,
              iconPath: '/images/transparent.png',
              width: 1,
              height: 1,
              label: this._buildCenteredLabel(bore.gain + '', 9, labelColor, -16)
            });
          }
          
          // 波束名（"+"正下方）：顶边紧贴"+"底边
          if (this.data.showBeamLabels && beamName) {
            coverageMarkers.push({
              id: borePointIdCounter++,
              latitude: boreLat,
              longitude: boreLon,
              iconPath: '/images/transparent.png',
              width: 1,
              height: 1,
              label: this._buildCenteredLabel(beamName, 9, labelColor, 7)
            });
          }
        });
      } else if (this.data.showBeamLabels && uniqueGainValues.length > 0) {
        // 无borePoints时回退到几何中心显示波束名
        const beamCenter = this.calculateBeamCenter(data);
        if (beamCenter && isFinite(beamCenter.latitude) && isFinite(beamCenter.longitude)) {
          coverageMarkers.push({
            id: beamLabelIdCounter++,
            latitude: beamCenter.latitude,
            longitude: beamCenter.longitude,
            iconPath: '/images/transparent.png',
            width: 1,
            height: 1,
            label: this._buildCenteredLabel(beamName, 9, labelColor, -5)
          });
        }
      }
    });
    
    // 保留现有的等仰角线
    let existingElevationPolylines = [];
    if (this.data.showElevationContours) {
      existingElevationPolylines = this.data.polylines.filter(p => p.color === '#000000');
    }
    
    // 覆盖图在底层，等仰角线在顶层
    this.setData({
      polylines: [...polylines, ...existingElevationPolylines],
      markers: [...existingMarkers, ...coverageMarkers]
    });
  },

  /**
   * 生成颜色调色板
   */
  generateColorPalette(count) {
    const palette = [
      '#FF0000', '#FF4500', '#FFA500', '#FFD700', '#FFFF00',
      '#9ACD32', '#32CD32', '#00FA9A', '#00CED1', '#1E90FF',
      '#4169E1', '#8A2BE2', '#FF00FF', '#FF1493', '#DC143C'
    ];
    
    if (count <= palette.length) {
      return palette.slice(0, count);
    }
    
    // 如果需要更多颜色，循环使用
    const result = [];
    for (let i = 0; i < count; i++) {
      result.push(palette[i % palette.length]);
    }
    return result;
  },

  /**
   * 清除覆盖图内容（保留仰角线和定位标签）
   */
  resetMap() {
    const { currentSatellite, enableSatellite } = this.data;
    
    // 保留等仰角线的polylines（黑色或白色线条是仰角线）
    const elevationPolylines = this.data.polylines.filter(p => 
      p.color === '#000000' || p.color === '#FFFFFF'
    );
    
    // 保留等仰角线标记（id >= 100 且 < 1000）和搜索标记/定位标签（id >= 5000 且 < 10000）
    // 排除id>=10000的残留描边层markers
    const preservedMarkers = this.data.markers.filter(m => 
      (m.id >= 100 && m.id < 1000) ||  // 等仰角线标记
      (m.id >= 5000 && m.id < 10000)   // 搜索标记/定位标签
    );
    
    // 创建新的标记数组，包含卫星标记和保留的标记
    const newMarkers = [];
    
    // 根据地图类型确定卫星信息文字颜色
    const satelliteTextColor = enableSatellite ? '#FFFFFF' : '#333333';
    
    // 添加卫星标记
    if (currentSatellite) {
      newMarkers.push({
        id: 1,
        latitude: 0,
        longitude: currentSatellite.position,
        iconPath: '/images/satellite.png',
        width: 40,
        height: 40,
        anchor: { x: 0.5, y: 0.5 },
        callout: {
          content: `${currentSatellite.name}\n轨位: ${currentSatellite.position}°E`,
          color: satelliteTextColor,
          fontSize: 12,
          borderRadius: 4,
          bgColor: '#ffffff',
          padding: 8,
          display: 'BYCLICK'
        }
      });
    }
    
    // 合并卫星标记和保留的标记
    const finalMarkers = [...newMarkers, ...preservedMarkers];
    
    // 重置地图到卫星位置
    const centerLat = 0;
    const centerLng = currentSatellite ? currentSatellite.position : 105;
    
    this.setData({
      polylines: elevationPolylines,
      markers: finalMarkers,
      circles: [],
      latitude: centerLat,
      longitude: centerLng,
      scale: 3,
      showCoverageContours: false,
      showCoveragePopup: false,
      // 保留 showElevationContours 状态，不重置仰角线显示状态
      currentCoverageData: null,
      currentCoverageDataList: [],
      availableGainValues: [],
      selectedGainValues: [],
      gainValueItems: [],
      showBeamLabels: false  // 只重置波束名标签状态
    });
    
    // 清除覆盖图相关缓存数据
    this.clearCoverageContourCache();
    
    wx.showToast({
      title: '覆盖图已清除',
      icon: 'success',
      duration: 1500
    });
  },
  
  /**
   * 清除缓存中的覆盖图相关数据（等值线及标签，同时清除新旧版本缓存）
   */
  clearCoverageContourCache() {
    const { currentSatellite } = this.data;
    if (!currentSatellite) return;
    
    const satelliteName = currentSatellite.name;
    const cacheKeyV2 = `coverage_settings_v2_${satelliteName}`;
    const cacheKeyOld = `coverage_settings_${satelliteName}`;
    
    try {
      // 清除v2版本缓存中的覆盖图数据
      const cachedSettingsV2 = wx.getStorageSync(cacheKeyV2);
      if (cachedSettingsV2) {
        cachedSettingsV2.coveragePolylines = [];
        cachedSettingsV2.coverageMarkers = [];
        cachedSettingsV2.borePointMarkers = [];
        cachedSettingsV2.beamLabelMarkers = [];
        cachedSettingsV2.showCoverageContours = false;
        cachedSettingsV2.showBeamLabels = false;
        cachedSettingsV2.selectedGainValues = [];
        cachedSettingsV2.timestamp = Date.now();
        
        wx.setStorageSync(cacheKeyV2, cachedSettingsV2);
        console.log(`已清除 ${satelliteName} 的v2版覆盖图缓存`);
      }
      
      // 清除旧版本缓存中的覆盖图相关数据
      const cachedSettingsOld = wx.getStorageSync(cacheKeyOld);
      if (cachedSettingsOld) {
        // 旧版本格式：polylines包含所有线条，savedMarkers包含所有标记
        // 保留仰角线（黑色或白色线条），移除覆盖图线条
        if (cachedSettingsOld.polylines) {
          cachedSettingsOld.polylines = cachedSettingsOld.polylines.filter(p => 
            p.color === '#000000' || p.color === '#FFFFFF'
          );
        }
        // 保留仰角线标记（id 100-999）和搜索标记（id>=5000），移除覆盖值标记（id 1000-1999）和波束名标记（id 4000-4999）
        if (cachedSettingsOld.savedMarkers) {
          cachedSettingsOld.savedMarkers = cachedSettingsOld.savedMarkers.filter(m => 
            (m.id >= 100 && m.id < 1000) || m.id >= 5000
          );
        }
        cachedSettingsOld.showCoverageContours = false;
        cachedSettingsOld.showBeamLabels = false;
        cachedSettingsOld.selectedGainValues = [];
        
        wx.setStorageSync(cacheKeyOld, cachedSettingsOld);
        console.log(`已清除 ${satelliteName} 的旧版覆盖图缓存`);
      }
    } catch (e) {
      console.error('清除覆盖图缓存失败:', e);
    }
  },

  /**
   * 显示自定义覆盖值弹窗
   */
  showCustomValuePanel() {
    // 检查是否正在切换卫星
    if (this.data.isSwitchingSatellite) {
      wx.showToast({ title: '正在切换卫星，请稍候', icon: 'none' });
      return;
    }
    
    // 检查是否正在加载覆盖数据
    if (this.data.isLoadingCoverageData) {
      wx.showToast({ title: '覆盖数据加载中，请稍候', icon: 'none' });
      return;
    }
    
    if (!this.data.showCoverageContours || (!this.data.currentCoverageData && this.data.currentCoverageDataList.length === 0)) {
      wx.showToast({ title: '请先加载覆盖图', icon: 'none' });
      return;
    }
    this.setData({ showCustomValuePopup: true });
  },

  /**
   * 隐藏自定义覆盖值弹窗
   */
  hideCustomValuePanel() {
    this.setData({ showCustomValuePopup: false });
  },

  /**
   * 切换单个增益值的选中状态
   */
  toggleGainValue(e) {
    const value = e.currentTarget.dataset.value;
    const { gainValueItems, selectedGainValues } = this.data;
    
    const newItems = gainValueItems.map(item => ({
      ...item,
      selected: item.value === value ? !item.selected : item.selected
    }));
    
    const newSelected = newItems.filter(item => item.selected).map(item => item.value);
    
    this.setData({
      gainValueItems: newItems,
      selectedGainValues: newSelected
    });
  },

  /**
   * 全选/取消全选增益值
   */
  toggleAllGainValues() {
    const { gainValueItems, selectedGainValues, availableGainValues } = this.data;
    const allSelected = selectedGainValues.length === availableGainValues.length;
    
    const newItems = gainValueItems.map(item => ({
      ...item,
      selected: !allSelected
    }));
    
    const newSelected = allSelected ? [] : [...availableGainValues];
    
    this.setData({
      gainValueItems: newItems,
      selectedGainValues: newSelected
    });
  },

  /**
   * 处理自定义值输入
   */
  onCustomValueInput(e) {
    this.setData({ customValueInput: e.detail.value });
  },

  /**
   * 应用覆盖值选择
   */
  applyCoverageSelection() {
    const { currentCoverageData, selectedGainValues, customValueInput, availableGainValues } = this.data;
    
    let valuesToDraw = [];
    
    // 处理自定义输入 - 如果输入了特定值，只使用特定值
    if (customValueInput.trim()) {
      const customValues = customValueInput.split(/[,，\s]+/)
        .map(v => parseFloat(v.trim()))
        .filter(v => !isNaN(v) && availableGainValues.includes(v));
      
      if (customValues.length > 10) {
        wx.showToast({ title: '最多支持输入10个值', icon: 'none' });
        return;
      }
      
      if (customValues.length > 0) {
        valuesToDraw = customValues;
      } else {
        wx.showToast({ title: '输入的值不在可用范围内', icon: 'none' });
        return;
      }
    } else {
      // 没有输入特定值时，使用已选中的值
      valuesToDraw = [...selectedGainValues];
    }
    
    if (valuesToDraw.length === 0) {
      wx.showToast({ title: '请至少选择一个值', icon: 'none' });
      return;
    }
    
    // 更新选中的增益值
    this.setData({
      selectedGainValues: valuesToDraw
    });
    
    // 自动保存设置
    this.saveCoverageSettings();
    
    // 重新绘制 - 支持多波束
    const beamDataList = this.data.currentCoverageDataList;
    if (beamDataList && beamDataList.length > 1) {
      // 多波束模式
      this.drawMultiBeamCoverageContours(beamDataList, valuesToDraw.sort((a, b) => b - a));
    } else {
      // 单波束模式（兼容旧逻辑）
      this.drawCoverageContours(currentCoverageData, valuesToDraw.sort((a, b) => b - a));
    }
    
    this.setData({
      showCustomValuePopup: false,
      customValueInput: ''
    });
  },

  /**
   * 切换波束名标签显示
   */
  toggleBeamLabels() {
    const { showBeamLabels, currentCoverageData, currentCoverageDataList, selectedGainValues } = this.data;
    const newShowBeamLabels = !showBeamLabels;
    
    this.setData({ showBeamLabels: newShowBeamLabels });
    
    // 自动保存设置
    this.saveCoverageSettings();
    
    // 如果有覆盖数据，重新绘制
    if (selectedGainValues.length > 0) {
      if (currentCoverageDataList && currentCoverageDataList.length > 1) {
        // 多波束模式
        this.drawMultiBeamCoverageContours(currentCoverageDataList, selectedGainValues.sort((a, b) => b - a));
      } else if (currentCoverageData) {
        // 单波束模式
        this.drawCoverageContours(currentCoverageData, selectedGainValues.sort((a, b) => b - a));
      }
    }
  },

  // ==================== 位置搜索功能 ====================
  
  /**
   * 显示搜索弹窗
   */
  showSearchPanel() {
    this.setData({ 
      showSearchPopup: true,
      searchResults: [],
      searchNoResult: false,
      searchKeyword: '',
      inputLatitude: '',
      inputLongitude: '',
      suggestionList: [],
      showSuggestions: false
    });
  },

  /**
   * 隐藏搜索弹窗
   */
  hideSearchPanel() {
    this.setData({ 
      showSearchPopup: false,
      searchResults: [],
      searchNoResult: false,
      suggestionList: [],
      showSuggestions: false
    });
  },

  /**
   * 切换搜索模式
   */
  switchSearchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ 
      searchMode: mode,
      searchResults: [],
      searchNoResult: false
    });
  },

  /**
   * 搜索关键词输入（带防抖的建议提示）
   */
  onSearchKeywordInput(e) {
    const keyword = e.detail.value;
    this.setData({ searchKeyword: keyword });
    
    // 清除之前的防抖定时器
    if (this.suggestionTimer) {
      clearTimeout(this.suggestionTimer);
    }
    
    // 关键词为空时清空建议
    if (!keyword.trim()) {
      this.setData({ 
        suggestionList: [],
        showSuggestions: false
      });
      return;
    }
    
    // 防抖300ms后调用建议接口
    this.suggestionTimer = setTimeout(() => {
      this.fetchSuggestions(keyword.trim());
    }, 300);
  },

  /**
   * 获取关键词输入建议（腾讯地图Suggestion API）
   */
  fetchSuggestions(keyword) {
    if (!keyword) return;
    
    wx.request({
      url: 'https://apis.map.qq.com/ws/place/v1/suggestion',
      data: {
        keyword: keyword,
        region: '中国',
        region_fix: 0,
        policy: 1,
        page_size: 8,
        key: 'PJYBZ-TSQEZ-ZYYXY-7VPPU-62MNO-LXFZ4'
      },
      success: (res) => {
        console.log('Suggestion API返回:', res.data);
        if (res.data && res.data.status === 0 && res.data.data && res.data.data.length > 0) {
          const suggestions = res.data.data.map(item => ({
            id: item.id || '',
            title: item.title,
            address: item.address || (item.province || '') + (item.city || '') + (item.district || ''),
            latitude: item.location ? item.location.lat : null,
            longitude: item.location ? item.location.lng : null,
            city: item.city || '',
            district: item.district || ''
          }));
          this.setData({ 
            suggestionList: suggestions,
            showSuggestions: true
          });
        } else {
          this.setData({ 
            suggestionList: [],
            showSuggestions: false
          });
        }
      },
      fail: (err) => {
        console.error('Suggestion API请求失败:', err);
        this.setData({ 
          suggestionList: [],
          showSuggestions: false
        });
      }
    });
  },

  /**
   * 选择建议项
   */
  selectSuggestion(e) {
    const index = e.currentTarget.dataset.index;
    const suggestion = this.data.suggestionList[index];
    
    if (suggestion) {
      // 如果建议项有经纬度，直接定位
      if (suggestion.latitude && suggestion.longitude) {
        this.setData({
          searchKeyword: suggestion.title,
          suggestionList: [],
          showSuggestions: false,
          searchResults: [{
            name: suggestion.title,
            address: suggestion.address,
            latitude: suggestion.latitude,
            longitude: suggestion.longitude
          }],
          searchNoResult: false
        });
      } else {
        // 没有经纬度时，填充关键词并搜索
        this.setData({
          searchKeyword: suggestion.title,
          suggestionList: [],
          showSuggestions: false
        });
        this.searchLocation();
      }
    }
  },

  /**
   * 隐藏建议列表
   */
  hideSuggestions() {
    this.setData({
      suggestionList: [],
      showSuggestions: false
    });
  },

  /**
   * 纬度输入
   */
  onLatitudeInput(e) {
    this.setData({ inputLatitude: e.detail.value });
  },

  /**
   * 经度输入
   */
  onLongitudeInput(e) {
    this.setData({ inputLongitude: e.detail.value });
  },

  /**
   * 搜索地点
   */
  searchLocation() {
    const keyword = this.data.searchKeyword.trim();
    if (!keyword) {
      wx.showToast({ title: '请输入搜索关键词', icon: 'none' });
      return;
    }

    // 优先使用内置城市数据搜索（无需网络请求）
    const builtinResults = this.searchBuiltinLocations(keyword, false);
    
    if (builtinResults.length > 0) {
      // 内置数据找到匹配结果
      this.setData({ 
        searchResults: builtinResults,
        searchNoResult: false
      });
    } else {
      // 内置数据未找到，先尝试国内搜索，再尝试海外搜索
      wx.showLoading({ title: '搜索中...' });
      
      // 先尝试国内搜索
      wx.request({
        url: 'https://apis.map.qq.com/ws/place/v1/search',
        data: {
          keyword: keyword,
          boundary: 'region(中国,0)',
          page_size: 10,
          page_index: 1,
          key: 'PJYBZ-TSQEZ-ZYYXY-7VPPU-62MNO-LXFZ4'
        },
        success: (res) => {
          console.log('腾讯地图国内API返回:', res.data);
          if (res.data && res.data.status === 0 && res.data.data && res.data.data.length > 0) {
            wx.hideLoading();
            const results = res.data.data.map(item => ({
              name: item.title,
              address: item.address || (item.province || '') + (item.city || '') + (item.district || ''),
              latitude: item.location.lat,
              longitude: item.location.lng
            }));
            this.setData({ 
              searchResults: results,
              searchNoResult: false
            });
          } else {
            // 国内没找到结果，尝试海外搜索
            console.log('国内搜索无结果，尝试海外搜索...');
            this.searchOverseasLocation(keyword);
          }
        },
        fail: (err) => {
          console.error('腾讯地图国内API请求失败:', err);
          // 国内API失败，尝试海外API
          this.searchOverseasLocation(keyword);
        }
      });
    }
  },

  /**
   * 海外地点搜索
   * 使用腾讯地图海外关键词输入提示API
   * https://lbs.qq.com/service/webService/webServiceGuide/Overseas/webServiceSuggestion
   */
  searchOverseasLocation(keyword) {
    const that = this;
    
    wx.request({
      url: 'https://apis.map.qq.com/ws/place/v1/suggestion',
      data: {
        keyword: keyword,
        oversea: 1,           // 启用海外搜索
        key: 'PJYBZ-TSQEZ-ZYYXY-7VPPU-62MNO-LXFZ4'
      },
      success: (res) => {
        wx.hideLoading();
        console.log('腾讯地图海外API返回:', res.data);
        if (res.data && res.data.status === 0 && res.data.data && res.data.data.length > 0) {
          const results = res.data.data.map(item => ({
            name: item.title,
            address: item.address || '',
            latitude: item.location.lat,
            longitude: item.location.lng
          }));
          that.setData({ 
            searchResults: results,
            searchNoResult: false
          });
        } else {
          console.log('海外搜索也无结果');
          that.setData({ 
            searchResults: [],
            searchNoResult: true
          });
          wx.showToast({ 
            title: '未找到相关地点', 
            icon: 'none' 
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('腾讯地图海外API请求失败:', err);
        wx.showToast({ title: '网络请求失败', icon: 'none' });
        that.setData({ 
          searchResults: [],
          searchNoResult: true
        });
      }
    });
  },

  /**
   * 使用内置城市数据搜索（备用方案）
   */
  searchBuiltinLocations(keyword) {
    // 内置主要城市数据
    const cities = [
      { name: '北京', latitude: 39.9042, longitude: 116.4074, address: '中国首都' },
      { name: '上海', latitude: 31.2304, longitude: 121.4737, address: '中国上海市' },
      { name: '广州', latitude: 23.1291, longitude: 113.2644, address: '广东省广州市' },
      { name: '深圳', latitude: 22.5431, longitude: 114.0579, address: '广东省深圳市' },
      { name: '成都', latitude: 30.5728, longitude: 104.0668, address: '四川省成都市' },
      { name: '杭州', latitude: 30.2741, longitude: 120.1551, address: '浙江省杭州市' },
      { name: '武汉', latitude: 30.5928, longitude: 114.3055, address: '湖北省武汉市' },
      { name: '西安', latitude: 34.3416, longitude: 108.9398, address: '陕西省西安市' },
      { name: '南京', latitude: 32.0603, longitude: 118.7969, address: '江苏省南京市' },
      { name: '重庆', latitude: 29.4316, longitude: 106.9123, address: '中国重庆市' },
      { name: '天津', latitude: 39.3434, longitude: 117.3616, address: '中国天津市' },
      { name: '香港', latitude: 22.3193, longitude: 114.1694, address: '中国香港特别行政区' },
      { name: '澳门', latitude: 22.1987, longitude: 113.5439, address: '中国澳门特别行政区' },
      { name: '台北', latitude: 25.0330, longitude: 121.5654, address: '中国台湾省台北市' },
      { name: '新加坡', latitude: 1.3521, longitude: 103.8198, address: '新加坡' },
      { name: '东京', latitude: 35.6762, longitude: 139.6503, address: '日本东京都' },
      { name: '首尔', latitude: 37.5665, longitude: 126.9780, address: '韩国首尔' },
      { name: '曼谷', latitude: 13.7563, longitude: 100.5018, address: '泰国曼谷' },
      { name: '吉隆坡', latitude: 3.1390, longitude: 101.6869, address: '马来西亚吉隆坡' },
      { name: '雅加达', latitude: -6.2088, longitude: 106.8456, address: '印度尼西亚雅加达' },
      { name: '马尼拉', latitude: 14.5995, longitude: 120.9842, address: '菲律宾马尼拉' },
      { name: '河内', latitude: 21.0285, longitude: 105.8542, address: '越南河内' },
      { name: '新德里', latitude: 28.6139, longitude: 77.2090, address: '印度新德里' },
      { name: '孟买', latitude: 19.0760, longitude: 72.8777, address: '印度孟买' },
      { name: '迪拜', latitude: 25.2048, longitude: 55.2708, address: '阿联酋迪拜' },
      { name: '莫斯科', latitude: 55.7558, longitude: 37.6173, address: '俄罗斯莫斯科' },
      { name: '悉尼', latitude: -33.8688, longitude: 151.2093, address: '澳大利亚悉尼' },
      { name: '墨尔本', latitude: -37.8136, longitude: 144.9631, address: '澳大利亚墨尔本' },
      { name: '伦敦', latitude: 51.5074, longitude: -0.1278, address: '英国伦敦' },
      { name: '巴黎', latitude: 48.8566, longitude: 2.3522, address: '法国巴黎' },
      { name: '纽约', latitude: 40.7128, longitude: -74.0060, address: '美国纽约' },
      { name: '洛杉矶', latitude: 34.0522, longitude: -118.2437, address: '美国洛杉矶' },
      { name: '旧金山', latitude: 37.7749, longitude: -122.4194, address: '美国旧金山' },
      { name: '拉萨', latitude: 29.6500, longitude: 91.1000, address: '西藏自治区拉萨市' },
      { name: '乌鲁木齐', latitude: 43.8256, longitude: 87.6168, address: '新疆维吾尔自治区乌鲁木齐市' },
      { name: '哈尔滨', latitude: 45.8038, longitude: 126.5350, address: '黑龙江省哈尔滨市' },
      { name: '沈阳', latitude: 41.8057, longitude: 123.4315, address: '辽宁省沈阳市' },
      { name: '大连', latitude: 38.9140, longitude: 121.6147, address: '辽宁省大连市' },
      { name: '青岛', latitude: 36.0671, longitude: 120.3826, address: '山东省青岛市' },
      { name: '济南', latitude: 36.6512, longitude: 117.1201, address: '山东省济南市' },
      { name: '郑州', latitude: 34.7466, longitude: 113.6254, address: '河南省郑州市' },
      { name: '长沙', latitude: 28.2282, longitude: 112.9388, address: '湖南省长沙市' },
      { name: '福州', latitude: 26.0745, longitude: 119.2965, address: '福建省福州市' },
      { name: '厦门', latitude: 24.4798, longitude: 118.0894, address: '福建省厦门市' },
      { name: '南宁', latitude: 22.8170, longitude: 108.3665, address: '广西壮族自治区南宁市' },
      { name: '昆明', latitude: 25.0389, longitude: 102.7183, address: '云南省昆明市' },
      { name: '贵阳', latitude: 26.6470, longitude: 106.6302, address: '贵州省贵阳市' },
      { name: '海口', latitude: 20.0440, longitude: 110.1999, address: '海南省海口市' },
      { name: '三亚', latitude: 18.2528, longitude: 109.5120, address: '海南省三亚市' }
    ];

    // 模糊搜索
    const results = cities.filter(city => 
      city.name.includes(keyword) || city.address.includes(keyword)
    );

    // 返回搜索结果（不直接setData，由调用方处理）
    return results;
  },

  /**
   * 选择搜索结果
   */
  selectSearchResult(e) {
    const index = e.currentTarget.dataset.index;
    const result = this.data.searchResults[index];
    
    if (result) {
      this.goToLocation(result.latitude, result.longitude, result.name);
    }
  },

  /**
   * 确认搜索（经纬度模式或重新搜索）
   */
  confirmSearch() {
    if (this.data.searchMode === 'coordinate') {
      // 经纬度模式
      const lat = parseFloat(this.data.inputLatitude);
      const lon = parseFloat(this.data.inputLongitude);
      
      if (isNaN(lat) || isNaN(lon)) {
        wx.showToast({ title: '请输入有效的经纬度', icon: 'none' });
        return;
      }
      
      if (lat < -90 || lat > 90) {
        wx.showToast({ title: '纬度范围: -90 到 90', icon: 'none' });
        return;
      }
      
      if (lon < -180 || lon > 180) {
        wx.showToast({ title: '经度范围: -180 到 180', icon: 'none' });
        return;
      }
      
      this.goToLocation(lat, lon, `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`);
    } else {
      // 地点搜索模式，如果有结果则选择第一个
      if (this.data.searchResults.length > 0) {
        const result = this.data.searchResults[0];
        this.goToLocation(result.latitude, result.longitude, result.name);
      } else {
        // 执行搜索
        this.searchLocation();
      }
    }
  },

  /**
   * 前往我的位置
   */
  goToMyLocation() {
    const { userLatitude, userLongitude, hasUserLocation } = this.data;
    
    if (hasUserLocation) {
      this.goToLocation(userLatitude, userLongitude, '我的位置');
    } else {
      // 重新获取位置
      wx.showLoading({ title: '获取位置中...' });
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          wx.hideLoading();
          this.setData({
            userLatitude: res.latitude,
            userLongitude: res.longitude,
            hasUserLocation: true
          });
          this.goToLocation(res.latitude, res.longitude, '我的位置');
        },
        fail: () => {
          wx.hideLoading();
          wx.showToast({ title: '无法获取位置', icon: 'none' });
        }
      });
    }
  },

  /**
   * 前往指定位置并添加标记（支持多个标记同时存在）
   */
  goToLocation(latitude, longitude, name) {
    // 计算该位置对卫星的仰角
    const satLon = this.data.currentSatellite.position;
    const elevation = this.calculateElevationAngle(latitude, longitude, satLon);
    
    // 构建经纬度显示字符串
    const latStr = latitude >= 0 ? `${latitude.toFixed(2)}°N` : `${Math.abs(latitude).toFixed(2)}°S`;
    const lonStr = longitude >= 0 ? `${longitude.toFixed(2)}°E` : `${Math.abs(longitude).toFixed(2)}°W`;
    const coordStr = `${latStr}, ${lonStr}`;
    
    // 构建标记显示内容
    let calloutContent;
    // 如果是"我的位置"或者name本身就是经纬度格式（包含°符号），只显示经纬度和仰角
    if (name === '我的位置' || name.includes('°')) {
      calloutContent = `${coordStr}\n仰角: ${elevation > 0 ? elevation.toFixed(1) + '°' : '不可见'}`;
    } else {
      // 普通搜索位置：显示地名、经纬度、仰角
      calloutContent = `${name}\n${coordStr}\n仰角: ${elevation > 0 ? elevation.toFixed(1) + '°' : '不可见'}`;
    }
    
    // 使用递增ID创建新标记
    const markerId = this.data.searchMarkerIdCounter;
    // 根据地图模式选择文字颜色（卫星地图用白色，普通地图用深色）
    const textColor = this.data.enableSatellite ? '#FFFFFF' : '#333333';
    const searchMarker = {
      id: markerId,
      latitude: latitude,
      longitude: longitude,
      width: 18,
      height: 26,
      anchor: { x: 0.5, y: 1 },  // 图标底部尖端对准坐标点
      callout: {
        content: calloutContent,
        color: textColor,
        fontSize: 10,
        borderRadius: 3,
        bgColor: '#00000000',
        padding: 4,
        display: 'ALWAYS'
      }
    };
    
    // 添加到标记列表（保留已有标记）
    let markers = [...this.data.markers, searchMarker];
    let searchMarkers = [...this.data.searchMarkers, searchMarker];
    
    this.setData({
      markers: markers,
      searchMarkers: searchMarkers,
      searchMarkerIdCounter: markerId + 1,
      latitude: latitude,
      longitude: longitude,
      scale: 8,
      showSearchPopup: false
    });
    
    // 保存设置（确保搜索标记被持久化）
    this.saveCoverageSettings();

    // 选点回传模式：确认后将经纬度回填给首页工具
    if (this.data.pickMode && (this.data.pickSource === 'azElTool' || this.data.pickSource === 'sunOutageTool')) {
      wx.showModal({
        title: '使用该位置',
        content: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        confirmText: '回填',
        success: (res) => {
          if (!res.confirm) return;
          const storageKey = this.data.pickSource === 'sunOutageTool' ? 'sunOutagePickedLocation' : 'azElPickedLocation';
          try {
            wx.setStorageSync(storageKey, {
              latitude,
              longitude,
              name,
              satelliteIndex: this.data.satelliteIndex,
              timestamp: Date.now()
            });
          } catch (e) {
            console.error('写入选点数据失败:', e);
          }
          wx.navigateBack();
        }
      });
      return;
    }
    
    // 显示仰角信息
    if (elevation > 0) {
      wx.showToast({
        title: `仰角: ${elevation.toFixed(1)}°`,
        icon: 'none',
        duration: 2000
      });
    } else {
      wx.showToast({
        title: '该位置无法看到卫星',
        icon: 'none',
        duration: 2000
      });
    }
  },

  /**
   * 标记点击事件 - 删除搜索标记
   */
  onMarkerTap(e) {
    const markerId = e.markerId;
    // 只处理搜索标记（id >= 2000）
    if (markerId >= 2000) {
      wx.showModal({
        title: '删除标记',
        content: '确定要删除这个标记吗？',
        success: (res) => {
          if (res.confirm) {
            const markers = this.data.markers.filter(m => m.id !== markerId);
            const searchMarkers = this.data.searchMarkers.filter(m => m.id !== markerId);
            this.setData({ markers, searchMarkers });
            // 保存设置
            this.saveCoverageSettings();
          }
        }
      });
    }
  },

  /**
   * 地图触摸开始事件 - 用于实现长按标点
   */
  onMapTouchStart(e) {
    // 记录触摸开始的时间和位置
    if (e.touches && e.touches.length === 1) {
      const touch = e.touches[0];
      this._touchStartTime = Date.now();
      this._touchStartX = touch.clientX;
      this._touchStartY = touch.clientY;
      this._touchMoved = false;
      
      // 设置长按定时器（500ms）
      this._longTapTimer = setTimeout(() => {
        if (!this._touchMoved) {
          this.handleMapLongTap(touch.clientX, touch.clientY);
        }
      }, 500);
    }
  },

  /**
   * 地图触摸移动事件 - 取消长按
   */
  onMapTouchMove(e) {
    if (this._touchStartX !== undefined && e.touches && e.touches.length === 1) {
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - this._touchStartX);
      const dy = Math.abs(touch.clientY - this._touchStartY);
      // 如果移动超过10像素，认为是拖动而非长按
      if (dx > 10 || dy > 10) {
        this._touchMoved = true;
        if (this._longTapTimer) {
          clearTimeout(this._longTapTimer);
          this._longTapTimer = null;
        }
      }
    }
  },

  /**
   * 地图触摸结束事件 - 清除长按定时器
   */
  onMapTouchEnd(e) {
    if (this._longTapTimer) {
      clearTimeout(this._longTapTimer);
      this._longTapTimer = null;
    }
  },

  /**
   * 处理地图长按 - 通过屏幕坐标计算经纬度并添加标记
   */
  handleMapLongTap(clientX, clientY) {
    // 提供触觉反馈
    wx.vibrateShort({ type: 'medium' });
    
    // 不做偏移补偿，直接使用触摸坐标
    const adjustedY = clientY;
    
    // 获取地图组件的位置信息
    const query = wx.createSelectorQuery();
    query.select('#coverageMap').boundingClientRect().exec((res) => {
      if (!res || !res[0]) {
        console.log('无法获取地图组件位置');
        return;
      }
      
      const mapRect = res[0];
      // 计算触摸点相对于地图的位置（0-1范围），使用偏移后的Y坐标
      const relX = (clientX - mapRect.left) / mapRect.width;
      const relY = (adjustedY - mapRect.top) / mapRect.height;
      
      // 使用 mapContext.getRegion 获取准确的视野范围
      if (this.mapCtx) {
        this.mapCtx.getRegion({
          success: (region) => {
            // region 包含 southwest 和 northeast 两个角的坐标
            const sw = region.southwest;
            const ne = region.northeast;
            
            // 使用Mercator投影修正纬度计算（地图使用Web Mercator投影，纬度在屏幕上非线性分布）
            const latToMercY = (lat) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
            const mercYToLat = (y) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
            const swMercY = latToMercY(sw.latitude);
            const neMercY = latToMercY(ne.latitude);
            const mercY = neMercY - relY * (neMercY - swMercY);
            const latitude = mercYToLat(mercY);
            const longitude = sw.longitude + relX * (ne.longitude - sw.longitude);
            
            // 添加标记
            this.addLongTapMarker(latitude, longitude);
          },
          fail: () => {
            // 降级：使用简单计算
            const centerLat = this.data.latitude;
            const centerLng = this.data.longitude;
            const scale = this.data.scale;
            
            const latRange = 360 / Math.pow(2, scale - 1) * (mapRect.height / mapRect.width);
            const lngRange = 360 / Math.pow(2, scale - 1);
            
            const latitude = centerLat + (0.5 - relY) * latRange;
            const longitude = centerLng + (relX - 0.5) * lngRange;
            
            this.addLongTapMarker(latitude, longitude);
          }
        });
      }
    });
  },

  /**
   * 在指定位置添加长按标记
   */
  addLongTapMarker(latitude, longitude) {
    const satLon = this.data.currentSatellite.position;
    const elevation = this.calculateElevationAngle(latitude, longitude, satLon);

    // 选点回传模式：长按也支持直接回填
    if (this.data.pickMode && (this.data.pickSource === 'azElTool' || this.data.pickSource === 'sunOutageTool')) {
      wx.showModal({
        title: '使用该位置',
        content: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        confirmText: '回填',
        success: (res) => {
          if (!res.confirm) return;
          const storageKey = this.data.pickSource === 'sunOutageTool' ? 'sunOutagePickedLocation' : 'azElPickedLocation';
          try {
            wx.setStorageSync(storageKey, {
              latitude,
              longitude,
              name: `${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°`,
              satelliteIndex: this.data.satelliteIndex,
              timestamp: Date.now()
            });
          } catch (e) {
            console.error('写入选点数据失败:', e);
          }
          wx.navigateBack();
        }
      });
      return;
    }
    
    // 构建经纬度显示字符串
    const latStr = latitude >= 0 ? `${latitude.toFixed(2)}°N` : `${Math.abs(latitude).toFixed(2)}°S`;
    const lonStr = longitude >= 0 ? `${longitude.toFixed(2)}°E` : `${Math.abs(longitude).toFixed(2)}°W`;
    const coordStr = `${latStr}, ${lonStr}`;
    
    // 构建标记显示内容（经纬度 + 仰角）
    const elevationStr = elevation > 0 ? `${elevation.toFixed(1)}°` : '不可见';
    const calloutContent = `${coordStr}\n仰角: ${elevationStr}`;
    
    // 使用递增ID创建新标记
    const markerId = this.data.searchMarkerIdCounter;
    // 根据地图模式选择文字颜色（卫星地图用白色，普通地图用深色）
    const textColor = this.data.enableSatellite ? '#FFFFFF' : '#333333';
    
    const longTapMarker = {
      id: markerId,
      latitude: latitude,
      longitude: longitude,
      width: 18,
      height: 26,
      anchor: { x: 0.5, y: 1 },  // 图标底部尖端对准坐标点
      callout: {
        content: calloutContent,
        color: textColor,
        fontSize: 10,
        borderRadius: 3,
        bgColor: '#00000000',
        padding: 4,
        display: 'ALWAYS'
      }
    };
    
    console.log('添加标记:', longTapMarker);
    
    // 添加到标记列表（保留已有标记）
    let markers = [...this.data.markers, longTapMarker];
    let searchMarkers = [...this.data.searchMarkers, longTapMarker];
    
    this.setData({
      markers: markers,
      searchMarkers: searchMarkers,
      searchMarkerIdCounter: markerId + 1
    });
    
    // 保存设置
    this.saveCoverageSettings();
  },

  /**
   * 切换实时显示当前位置
   */
  toggleShowLocation() {
    const newVal = !this.data.showCurrentLocation;
    this.setData({ showCurrentLocation: newVal });
    if (newVal && !this.data.hasUserLocation) {
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          this.setData({
            userLatitude: res.latitude,
            userLongitude: res.longitude,
            hasUserLocation: true
          });
        },
        fail: () => {
          wx.showToast({ title: '无法获取位置', icon: 'none' });
          this.setData({ showCurrentLocation: false });
        }
      });
    }
  },

  /**
   * 清除所有搜索标记
   */
  clearAllSearchMarkers() {
    const hasMarkers = this.data.searchMarkers && this.data.searchMarkers.length > 0;
    if (!hasMarkers) {
      wx.showToast({ title: '暂无标记', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '清除所有标记',
      content: '确定要清除所有搜索标记吗？',
      success: (res) => {
        if (res.confirm) {
          // 基于 searchMarkers 的实际 ID 集合精确移除
          const searchIds = new Set(this.data.searchMarkers.map(m => m.id));
          const markers = this.data.markers.filter(m => !searchIds.has(m.id));
          this.setData({ 
            markers, 
            searchMarkers: [],
            searchMarkerIdCounter: 5000
          });
          // 保存设置
          this.saveCoverageSettings();
          wx.showToast({ title: '已清除', icon: 'success' });
        }
      }
    });
  },

  // 切换底部按钮收起/展开状态
  toggleBottomBtns() {
    this.setData({
      bottomBtnsCollapsed: !this.data.bottomBtnsCollapsed
    });
  },

  /**
   * 从增益值列表中选取默认显示的3个等值线
   * 算法：选取25%分位（偏高值）、50%中位值、75%分位（偏低值），避免极端值
   * @param {Array} gainValues - 已从大到小排序的增益值数组
   * @returns {Array} 选中的增益值（最多3个）
   */
  selectDefaultGainValues(gainValues) {
    if (!gainValues || gainValues.length <= 3) {
      return [...gainValues];
    }
    const len = gainValues.length;
    const q25 = gainValues[Math.floor(len * 0.25)];  // 偏高值
    const q50 = gainValues[Math.floor(len * 0.5)];   // 中位值
    const q75 = gainValues[Math.floor(len * 0.75)];  // 偏低值
    // 去重
    return [...new Set([q25, q50, q75])];
  },

  /**
   * 多波束场景下选取默认等值线，保证每个波束至少分到一条
   * 算法：
   * 1. 基于全部增益值的范围，计算25%/50%/75%分位的目标值（连续值，非索引）
   * 2. 在每个波束中，找最接近各目标值的实际等值线
   * 3. 汇总去重，保证每个波束至少被一条选中的等值线覆盖
   * @param {Array} gainValues - 全部可用增益值（并集，已从大到小排序）
   * @param {Array} commonGainValues - 各波束共有增益值（交集，已排序）
   * @param {Array} perBeamGainSets - 每个波束各自的增益值 Set 数组
   * @returns {Array} 选中的增益值
   */
  selectDefaultGainValuesMultiBeam(gainValues, commonGainValues, perBeamGainSets) {
    if (!gainValues || gainValues.length === 0) return [];
    
    // 计算全局范围的25%/50%/75%目标值（连续值）
    const globalMax = gainValues[0];
    const globalMin = gainValues[gainValues.length - 1];
    const range = globalMax - globalMin;
    const targets = [
      globalMax - range * 0.25,  // 75%分位值（偏高）
      globalMax - range * 0.50,  // 50%中位值
      globalMax - range * 0.75   // 25%分位值（偏低）
    ];
    
    // 辅助函数：在一组值中找最接近target的值
    const findClosest = (values, target) => {
      let closest = values[0];
      let minDiff = Math.abs(values[0] - target);
      for (let i = 1; i < values.length; i++) {
        const diff = Math.abs(values[i] - target);
        if (diff < minDiff) {
          minDiff = diff;
          closest = values[i];
        }
      }
      return closest;
    };
    
    const selected = new Set();
    
    // 对每个波束，从其自身的等值线中找最匹配3个目标值的
    perBeamGainSets.forEach(beamGainSet => {
      const beamValues = [...beamGainSet].sort((a, b) => b - a);
      if (beamValues.length === 0) return;
      
      // 对每个目标值，在该波束中找最近的
      targets.forEach(t => {
        selected.add(findClosest(beamValues, t));
      });
    });
    
    // 最终检查：确保每个波束至少有一条被选中
    perBeamGainSets.forEach(beamGainSet => {
      const hasCoverage = [...selected].some(v => beamGainSet.has(v));
      if (!hasCoverage) {
        const beamValues = [...beamGainSet].sort((a, b) => b - a);
        selected.add(beamValues[Math.floor(beamValues.length / 2)]);
      }
    });
    
    return [...selected].sort((a, b) => b - a);
  },

  /**
   * 从缓存获取已选择的覆盖值
   * 只返回当前数据中仍然存在的值
   * @param {Array} availableGainValues - 当前数据中可用的增益值列表
   * @returns {Array} 有效的缓存覆盖值列表，如果没有有效缓存则返回空数组
   */
  getCachedGainValues(availableGainValues) {
    const { currentSatellite } = this.data;
    if (!currentSatellite) return [];
    
    const satelliteName = currentSatellite.name;
    
    try {
      // 先尝试v2版本缓存
      let settings = wx.getStorageSync(`coverage_settings_v2_${satelliteName}`);
      if (!settings) {
        settings = wx.getStorageSync(`coverage_settings_${satelliteName}`);
      }
      
      if (!settings || !settings.selectedGainValues || settings.selectedGainValues.length === 0) {
        return [];
      }
      
      // 只保留当前数据中存在的值
      const validValues = settings.selectedGainValues.filter(v => 
        availableGainValues.includes(v)
      );
      
      return validValues;
    } catch (e) {
      console.error('获取缓存覆盖值失败:', e);
      return [];
    }
  },

  /**
   * 保存覆盖图设置到本地缓存
   * 按卫星名称分别存储，包含频段、波束、类型、增益值等选择
   * 使用版本控制确保缓存兼容性
   */
  saveCoverageSettings() {
    const { currentSatellite, selectedBand, selectedBeams, selectedType, 
            selectedGainValues, showBeamLabels, elevationAngles, showElevationContours,
            searchMarkers, searchMarkerIdCounter, polylines, markers, showCoverageContours } = this.data;
    
    if (!currentSatellite) return;
    
    const satelliteName = currentSatellite.name;
    const cacheKey = `coverage_settings_v2_${satelliteName}`;
    
    // 分离等仰角线相关内容和覆盖图相关内容
    // 等仰角线polylines: 黑色(#000000)或白色(#FFFFFF)
    const elevationPolylines = (polylines || []).filter(p => 
      p.color === '#000000' || p.color === '#FFFFFF'
    );
    const coveragePolylines = (polylines || []).filter(p => 
      p.color !== '#000000' && p.color !== '#FFFFFF'
    );
    
    // 分离标记
    // 等仰角线标记: id 100-999
    // 覆盖值标记: id 1000-1999
    // 波束中心标记: id 3000-3999
    // 波束名标记: id 4000-4999
    // 搜索标记/定位标签: id >= 5000 且 < 10000
    const allMarkers = markers || [];
    const elevationMarkers = allMarkers.filter(m => m.id >= 100 && m.id < 1000);
    const coverageMarkers = allMarkers.filter(m => m.id >= 1000 && m.id < 2000);
    const borePointMarkers = allMarkers.filter(m => m.id >= 3000 && m.id < 4000);
    const beamLabelMarkers = allMarkers.filter(m => m.id >= 4000 && m.id < 5000);
    const locationMarkers = allMarkers.filter(m => m.id >= 5000 && m.id < 10000);
    
    const settings = {
      // 缓存版本号
      version: 2,
      // 卫星名称（用于验证）
      satelliteName: satelliteName,
      // 覆盖图设置选择
      selectedBand,
      selectedBeams,
      selectedType,
      selectedGainValues: selectedGainValues || [],
      showBeamLabels: showBeamLabels || false,
      showCoverageContours: showCoverageContours || false,
      // 仰角线设置
      elevationAngles: elevationAngles || [5, 10],
      showElevationContours: showElevationContours || false,
      // 分离存储的绘制内容
      elevationPolylines: elevationPolylines,
      elevationMarkers: elevationMarkers,
      coveragePolylines: coveragePolylines,
      coverageMarkers: coverageMarkers,
      borePointMarkers: borePointMarkers,
      beamLabelMarkers: beamLabelMarkers,
      // 定位标签
      locationMarkers: locationMarkers,
      searchMarkerIdCounter: searchMarkerIdCounter || 5000,
      // 时间戳
      timestamp: Date.now()
    };
    
    try {
      wx.setStorageSync(cacheKey, settings);
      console.log(`已保存 ${satelliteName} 的覆盖设置缓存`);
    } catch (e) {
      console.error('保存覆盖设置失败:', e);
      // 如果存储失败（可能是存储空间不足），尝试清理旧版本缓存
      this.cleanupOldCache(satelliteName);
    }
  },

  /**
   * 清理指定卫星的旧版本缓存
   */
  cleanupOldCache(satelliteName) {
    try {
      // 删除旧版本缓存key
      wx.removeStorageSync(`coverage_settings_${satelliteName}`);
      console.log(`已清理 ${satelliteName} 的旧版本缓存`);
    } catch (e) {
      console.error('清理旧缓存失败:', e);
    }
  },

  /**
   * 从本地缓存加载覆盖图设置
   * 返回 true 表示成功加载了缓存设置，false 表示没有缓存或加载失败
   */
  loadCoverageSettings() {
    const { currentSatellite, availableBands, availableBeams } = this.data;
    
    if (!currentSatellite) return false;
    
    const satelliteName = currentSatellite.name;
    
    // 先尝试加载v2版本缓存
    let settings = null;
    let cacheKey = `coverage_settings_v2_${satelliteName}`;
    
    try {
      settings = wx.getStorageSync(cacheKey);
      
      // 如果v2缓存不存在，尝试加载旧版本缓存并迁移
      if (!settings) {
        const oldCacheKey = `coverage_settings_${satelliteName}`;
        const oldSettings = wx.getStorageSync(oldCacheKey);
        if (oldSettings) {
          console.log(`迁移 ${satelliteName} 的旧版本缓存`);
          settings = this.migrateOldCache(oldSettings, satelliteName);
          // 迁移后删除旧缓存
          wx.removeStorageSync(oldCacheKey);
        }
      }
      
      if (!settings) return false;
      
      // 验证缓存是否属于当前卫星（防止数据混淆）
      if (settings.satelliteName && settings.satelliteName !== satelliteName) {
        console.warn(`缓存数据不匹配: 期望 ${satelliteName}, 实际 ${settings.satelliteName}`);
        return false;
      }
      
      // 恢复绘制内容（与频段无关）
      this.restoreDrawnContent(settings);
      
      // 验证缓存的频段是否仍然可用
      if (settings.selectedBand && availableBands.includes(settings.selectedBand)) {
        // 先更新频段，这会同时更新可用波束列表
        this.setData({ selectedBand: settings.selectedBand });
        this.updateBeamsForBand(settings.selectedBand);
        
        // 获取更新后的可用波束列表
        const updatedBeams = this.data.availableBeams;
        
        // 验证并恢复波束选择（只保留仍然可用的波束）
        const validBeams = (settings.selectedBeams || []).filter(beam => 
          updatedBeams.includes(beam)
        );
        
        if (validBeams.length > 0) {
          this.setData({ selectedBeams: validBeams });
          // 更新类型可用性
          this.updateTypeAvailability(settings.selectedBand, validBeams);
        }
        
        // 恢复类型选择
        if (settings.selectedType && (settings.selectedType === 'EIRP' || settings.selectedType === 'GT')) {
          const { hasEIRP, hasGT } = this.data;
          if ((settings.selectedType === 'EIRP' && hasEIRP) || 
              (settings.selectedType === 'GT' && hasGT)) {
            this.setData({ selectedType: settings.selectedType });
          }
        }
        
        // 恢复增益值选择
        if (settings.selectedGainValues && settings.selectedGainValues.length > 0) {
          this.setData({ selectedGainValues: settings.selectedGainValues });
        }
        
        // 恢复波束标签显示状态
        if (typeof settings.showBeamLabels === 'boolean') {
          this.setData({ showBeamLabels: settings.showBeamLabels });
        }
        
        // 恢复仰角设置
        if (settings.elevationAngles && settings.elevationAngles.length > 0) {
          this.setData({ 
            elevationAngles: settings.elevationAngles,
            elevationInputText: settings.elevationAngles.join(', ')
          });
        }
        
        // 恢复仰角线显示状态
        if (typeof settings.showElevationContours === 'boolean') {
          this.setData({ showElevationContours: settings.showElevationContours });
        }
        
        // 恢复覆盖图显示状态
        if (typeof settings.showCoverageContours === 'boolean') {
          this.setData({ showCoverageContours: settings.showCoverageContours });
          
          // 如果覆盖图已显示，需要重新加载覆盖数据（仅加载数据，不重绘）
          if (settings.showCoverageContours && validBeams.length > 0) {
            this.loadCoverageDataOnly(settings.selectedBand, validBeams, settings.selectedType);
          }
        }
        
        return true;
      }
      
      return false;
    } catch (e) {
      console.error('加载覆盖设置失败:', e);
      return false;
    }
  },

  /**
   * 迁移旧版本缓存到新格式
   */
  migrateOldCache(oldSettings, satelliteName) {
    const polylines = oldSettings.polylines || [];
    const savedMarkers = oldSettings.savedMarkers || [];
    const searchMarkers = oldSettings.searchMarkers || [];
    
    // 分离等仰角线相关内容和覆盖图相关内容
    const elevationPolylines = polylines.filter(p => 
      p.color === '#000000' || p.color === '#FFFFFF'
    );
    const coveragePolylines = polylines.filter(p => 
      p.color !== '#000000' && p.color !== '#FFFFFF'
    );
    
    // 分离标记（排除残留描边层 id >= 10000）
    const elevationMarkers = savedMarkers.filter(m => m.id >= 100 && m.id < 1000);
    const coverageMarkers = savedMarkers.filter(m => m.id >= 1000 && m.id < 2000);
    const beamLabelMarkers = savedMarkers.filter(m => m.id >= 4000 && m.id < 5000);
    const locationMarkersFromSaved = savedMarkers.filter(m => m.id >= 5000 && m.id < 10000);
    
    // 合并位置标记
    const allLocationMarkers = [...searchMarkers];
    locationMarkersFromSaved.forEach(m => {
      if (!allLocationMarkers.find(existing => existing.id === m.id)) {
        allLocationMarkers.push(m);
      }
    });
    
    return {
      version: 2,
      satelliteName: satelliteName,
      selectedBand: oldSettings.selectedBand,
      selectedBeams: oldSettings.selectedBeams,
      selectedType: oldSettings.selectedType,
      selectedGainValues: oldSettings.selectedGainValues || [],
      showBeamLabels: oldSettings.showBeamLabels || false,
      showCoverageContours: oldSettings.showCoverageContours || false,
      elevationAngles: oldSettings.elevationAngles || [5, 10],
      showElevationContours: oldSettings.showElevationContours || false,
      elevationPolylines: elevationPolylines,
      elevationMarkers: elevationMarkers,
      coveragePolylines: coveragePolylines,
      coverageMarkers: coverageMarkers,
      borePointMarkers: [],  // 旧缓存无bore数据
      beamLabelMarkers: beamLabelMarkers,
      locationMarkers: allLocationMarkers,
      searchMarkerIdCounter: oldSettings.searchMarkerIdCounter || 5000,
      timestamp: Date.now()
    };
  },

  /**
   * 恢复绘制的内容（搜索标记、线条等）
   * 支持新旧两种缓存格式
   */
  restoreDrawnContent(settings) {
    if (!settings) return;
    
    const updateData = {};
    const isV2 = settings.version === 2;
    
    // 获取卫星标记
    const satelliteMarker = this.data.markers.find(m => m.id === 1);
    const baseMarkers = satelliteMarker ? [satelliteMarker] : [];
    
    if (isV2) {
      // V2版本：分离存储的格式
      const allPolylines = [];
      const allMarkers = [...baseMarkers];
      
      // 恢复等仰角线
      if (settings.elevationPolylines && settings.elevationPolylines.length > 0) {
        allPolylines.push(...settings.elevationPolylines);
      }
      if (settings.elevationMarkers && settings.elevationMarkers.length > 0) {
        allMarkers.push(...settings.elevationMarkers);
      }
      
      // 恢复覆盖图
      if (settings.coveragePolylines && settings.coveragePolylines.length > 0) {
        allPolylines.push(...settings.coveragePolylines);
      }
      if (settings.coverageMarkers && settings.coverageMarkers.length > 0) {
        allMarkers.push(...settings.coverageMarkers);
      }
      
      // 恢复波束中心标记
      if (settings.borePointMarkers && settings.borePointMarkers.length > 0) {
        allMarkers.push(...settings.borePointMarkers);
      }
      
      // 恢复波束名标记
      if (settings.beamLabelMarkers && settings.beamLabelMarkers.length > 0) {
        allMarkers.push(...settings.beamLabelMarkers);
      }
      
      // 恢复位置标记/定位标签
      if (settings.locationMarkers && settings.locationMarkers.length > 0) {
        allMarkers.push(...settings.locationMarkers);
        updateData.searchMarkers = settings.locationMarkers;
      }
      
      // 恢复搜索标记ID计数器
      if (settings.searchMarkerIdCounter) {
        updateData.searchMarkerIdCounter = settings.searchMarkerIdCounter;
      }
      
      if (allPolylines.length > 0) {
        updateData.polylines = allPolylines;
      }
      if (allMarkers.length > baseMarkers.length) {
        updateData.markers = allMarkers;
      }
    } else {
      // 旧版本：兼容处理
      // 恢复搜索标记
      if (settings.searchMarkers && settings.searchMarkers.length > 0) {
        updateData.searchMarkers = settings.searchMarkers;
        updateData.markers = [...baseMarkers, ...settings.searchMarkers];
      }
      
      // 恢复搜索标记ID计数器
      if (settings.searchMarkerIdCounter) {
        updateData.searchMarkerIdCounter = settings.searchMarkerIdCounter;
      }
      
      // 恢复线条（等仰角线和覆盖图线条）
      if (settings.polylines && settings.polylines.length > 0) {
        updateData.polylines = settings.polylines;
      }
      
      // 恢复其他标记（仰角标注、覆盖值标记、波束名标记）
      if (settings.savedMarkers && settings.savedMarkers.length > 0) {
        const currentMarkers = updateData.markers || [...baseMarkers];
        // 过滤出非搜索标记（id < 5000）的已保存标记
        const otherSavedMarkers = settings.savedMarkers.filter(m => m.id < 5000);
        // 获取搜索标记（排除残留描边层 id >= 10000）
        const searchMarkersToAdd = settings.savedMarkers.filter(m => m.id >= 5000 && m.id < 10000);
        updateData.markers = [...currentMarkers, ...otherSavedMarkers, ...searchMarkersToAdd];
        
        // 如果有单独保存的searchMarkers，也要加入
        if (settings.searchMarkers && settings.searchMarkers.length > 0) {
          // 去重：只添加还没在markers中的搜索标记
          const existingIds = new Set(updateData.markers.map(m => m.id));
          const newSearchMarkers = settings.searchMarkers.filter(m => !existingIds.has(m.id));
          updateData.markers = [...updateData.markers, ...newSearchMarkers];
        }
      }
    }
    
    if (Object.keys(updateData).length > 0) {
      // 根据当前地图类型调整标记和线条的颜色
      const isSatelliteMode = this.data.enableSatellite;
      const lineColor = isSatelliteMode ? '#FFFFFF' : '#000000';
      const textColor = isSatelliteMode ? '#FFFFFF' : '#333333';
      
      // 更新线条颜色（仅等仰角线，黑白色的线条）
      if (updateData.polylines) {
        updateData.polylines = updateData.polylines.map(p => {
          if (p.color === '#000000' || p.color === '#FFFFFF') {
            return { ...p, color: lineColor };
          }
          return p;
        });
      }
      
      // 更新标记颜色
      if (updateData.markers) {
        updateData.markers = updateData.markers.map(m => {
          // 仰角标签（id 100-999）
          if (m.id >= 100 && m.id < 1000 && m.label) {
            return {
              ...m,
              label: { ...m.label, color: lineColor }
            };
          }
          // 覆盖值标记（id 1000-1999）- 保持原有颜色不变
          if (m.id >= 1000 && m.id < 2000 && m.label) {
            return m;  // 覆盖值标记的颜色由覆盖数据决定，不需要调整
          }
          // 波束名标记（id 4000-4999）- 保持原有颜色不变
          if (m.id >= 4000 && m.id < 5000 && m.label) {
            return m;  // 波束名标记的颜色由覆盖数据决定，不需要调整
          }
          // 搜索标记/定位标签（id >= 5000）
          if (m.id >= 5000 && m.callout) {
            return {
              ...m,
              callout: { ...m.callout, color: textColor }
            };
          }
          return m;
        });
      }
      
      // 同步更新 searchMarkers 的颜色
      if (updateData.searchMarkers) {
        updateData.searchMarkers = updateData.searchMarkers.map(m => {
          if (m.callout) {
            return {
              ...m,
              callout: { ...m.callout, color: textColor }
            };
          }
          return m;
        });
      }
      
      this.setData(updateData);
      console.log('已恢复绘制内容:', Object.keys(updateData));
    }
  },

  /**
   * 仅加载绘制内容（搜索标记和线条），不加载覆盖图设置
   * 用于没有覆盖数据但仍需恢复用户标记的场景
   */
  loadDrawnContentOnly() {
    const { currentSatellite } = this.data;
    if (!currentSatellite) return;
    
    const satelliteName = currentSatellite.name;
    
    // 先尝试v2版本缓存
    let settings = null;
    try {
      settings = wx.getStorageSync(`coverage_settings_v2_${satelliteName}`);
      if (!settings) {
        settings = wx.getStorageSync(`coverage_settings_${satelliteName}`);
      }
      
      if (settings) {
        this.restoreDrawnContent(settings);
        
        // 恢复仰角设置（与覆盖数据无关）
        if (settings.elevationAngles && settings.elevationAngles.length > 0) {
          this.setData({ 
            elevationAngles: settings.elevationAngles,
            elevationInputText: settings.elevationAngles.join(', ')
          });
        }
        
        // 恢复仰角线显示状态
        if (typeof settings.showElevationContours === 'boolean') {
          this.setData({ showElevationContours: settings.showElevationContours });
        }
      }
    } catch (e) {
      console.error('加载绘制内容失败:', e);
    }
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  }
});

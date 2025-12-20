// satellite-coverage.js
// 卫星覆盖图页面 - 使用原生map组件展示卫星覆盖范围

const app = getApp();

Page({
  data: {
    // 导航栏位置
    navBarTop: 24,
    navBarHeight: 32,
    navBarRight: 10,
    
    // 地图配置
    latitude: 35.0,      // 默认中心纬度（中国中部）
    longitude: 105.0,    // 默认中心经度
    scale: 4,            // 缩放级别（1-20）
    
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
      { "name": "CHINASAT 27", "position": 87.5, "coverage": { "lat": 25, "lng": 87.5, "radius": 3000 } },
      { "name": "APSTAR 5C", "position": 138, "coverage": { "lat": 20, "lng": 138, "radius": 3800 } },
      { "name": "APSTAR 6C", "position": 134, "coverage": { "lat": 22, "lng": 134, "radius": 3600 } },
      { "name": "APSTAR 7", "position": 76.5, "coverage": { "lat": 25, "lng": 76.5, "radius": 3200 } },
      { "name": "APSTAR 9", "position": 142, "coverage": { "lat": 18, "lng": 142, "radius": 3500 } },
      { "name": "APSTAR 6D", "position": 134, "coverage": { "lat": 22, "lng": 134, "radius": 3600 } },
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
    elevationAngles: [3, 5, 10, 15],  // 需要绘制的仰角值（度）
    elevationInputText: '3, 5, 10, 15',  // 用户输入的仰角值文本
    
    // 加载状态
    loading: true
  },

  onLoad(options) {
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
    }
    
    // 获取从主页面传来的卫星索引
    let satelliteIndex = 0;
    if (options && options.satelliteIndex !== undefined) {
      satelliteIndex = parseInt(options.satelliteIndex);
    }
    
    this.setData({
      satelliteIndex: satelliteIndex,
      currentSatellite: this.data.satellites[satelliteIndex]
    });
    
    // 获取用户位置
    this.getUserLocation();
  },

  onReady() {
    // 获取地图上下文
    this.mapCtx = wx.createMapContext('coverageMap');
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
    
    // 创建标记点
    const markers = [];
    
    // 卫星标记（位于赤道上，纬度为0）
    markers.push({
      id: 1,
      latitude: 0,  // 卫星在赤道上
      longitude: currentSatellite.position,  // 使用卫星轨位作为经度
      iconPath: '/images/satellite.png',
      width: 40,
      height: 40,
      anchor: { x: 0.5, y: 0.5 },  // 图标中心对准坐标点
      callout: {
        content: `${currentSatellite.name}\n轨位: ${currentSatellite.position}°E`,
        color: '#333333',
        fontSize: 12,
        borderRadius: 4,
        bgColor: '#ffffff',
        padding: 8,
        display: 'BYCLICK'  // 点击时显示
      }
    });
    
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
    while (lon > 180) lon -= 360;
    while (lon < -180) lon += 360;
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
        const boundary = lon1 > 0 ? 180 : -180;
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
    
    this.drawElevationContours();
  },

  /**
   * 清除等仰角线
   */
  clearElevationContours() {
    // 只保留卫星标记（id=1）
    const markers = this.data.markers.filter(m => m.id === 1);
    this.setData({
      polylines: [],
      markers: markers,
      showElevationContours: false,
      showElevationPopup: false
    });
  },

  /**
   * 绘制所有等仰角线
   */
  drawElevationContours() {
    const { currentSatellite, elevationAngles } = this.data;
    if (!currentSatellite) return;
    
    const satLon = currentSatellite.position;
    const polylines = [];
    // 只保留卫星标记（id=1），移除之前的仰角标注
    const markers = this.data.markers.filter(m => m.id === 1);
    
    // 为每个仰角生成等仰角线，全部使用黑色，增加采样点使线条更圆润
    elevationAngles.forEach((angle, index) => {
      const points = this.calculateElevationContour(satLon, angle, 360);
      
      if (points.length > 2) {
        // 分割跨越180°经线的线段
        const segments = this.splitContourAtAntimeridian(points);
        
        // 为每个分割后的线段创建polyline
        segments.forEach(segment => {
          if (segment.length >= 2) {
            polylines.push({
              points: segment,
              color: '#000000',  // 黑色线条
              width: 1,
              dottedLine: false,
              arrowLine: false
            });
          }
        });
        
        // 在线条上添加仰角值标注（在最北端的点）- 简单悬浮数字
        if (points.length > 0) {
          // 找到纬度最高的点作为标注位置
          let maxLatPoint = points[0];
          for (const p of points) {
            if (p.latitude > maxLatPoint.latitude) {
              maxLatPoint = p;
            }
          }
          
          markers.push({
            id: 100 + index,
            latitude: maxLatPoint.latitude,
            longitude: maxLatPoint.longitude,
            iconPath: '/images/transparent.png',
            width: 1,
            height: 1,
            label: {
              content: angle + '°',
              color: '#000000',
              fontSize: 11,
              anchorX: 0,
              anchorY: -15
            }
          });
        }
      }
    });
    
    this.setData({ polylines, markers });
    
    // 显示实际绘制的仰角值
    const angleStr = elevationAngles.map(a => a + '°').join(', ');
    wx.showToast({
      title: `等仰角线: ${angleStr}`,
      icon: 'none',
      duration: 2000
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
    this.setData({
      satelliteIndex: index,
      currentSatellite: this.data.satellites[index],
      showSatellitePopup: false
    });
    
    // 重新更新地图
    this.updateMapDisplay();
    
    // 如果等仰角线已开启，重新绘制
    if (this.data.showElevationContours) {
      this.drawElevationContours();
    }
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

  // 返回上一页
  goBack() {
    wx.navigateBack();
  }
});

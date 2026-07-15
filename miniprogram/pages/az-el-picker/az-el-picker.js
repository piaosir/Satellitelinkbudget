Page({
  data: {
    navBarTop: 24,
    navBarHeight: 32,
    navBarRight: 10,
    satelliteIndex: 0,
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
      { "name": "其他", "position": "" }
    ],
    latitude: 35,
    longitude: 105,
    scale: 4,
    hasUserLocation: false,
    selectedLatitude: null,
    selectedLongitude: null,
    selectedLatitudeText: '--',
    selectedLongitudeText: '--',
    markers: []
  },

  onLoad(options) {
    try {
      const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
      const windowInfo = wx.getWindowInfo();
      this.setData({
        navBarTop: menuButtonInfo.top,
        navBarHeight: menuButtonInfo.height,
        navBarRight: windowInfo.windowWidth - menuButtonInfo.right
      });
    } catch (e) {}

    const satelliteIndex = options && options.satelliteIndex !== undefined ? Number(options.satelliteIndex) : 0;
    this.setData({ satelliteIndex: isNaN(satelliteIndex) ? 0 : satelliteIndex });
    this.getMyLocation(false);
  },

  goBack() {
    wx.navigateBack();
  },

  onSatelliteChange(e) {
    this.setData({ satelliteIndex: Number(e.detail.value || 0) });
  },

  getMyLocation(moveCenter) {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        const update = {
          hasUserLocation: true
        };
        if (moveCenter) {
          update.latitude = res.latitude;
          update.longitude = res.longitude;
          update.scale = 8;
        }
        this.setData(update);
      }
    });
  },

  moveToMyLocation() {
    this.getMyLocation(true);
  },

  onMapTap(e) {
    const lat = e.detail.latitude;
    const lon = e.detail.longitude;
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      wx.showToast({ title: '请重试选点', icon: 'none' });
      return;
    }

    this.setData({
      selectedLatitude: lat,
      selectedLongitude: lon,
      selectedLatitudeText: lat.toFixed(6),
      selectedLongitudeText: lon.toFixed(6),
      markers: [{
        id: 1,
        latitude: lat,
        longitude: lon,
        width: 20,
        height: 28,
        anchor: { x: 0.5, y: 1 },
        callout: {
          content: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
          color: '#111827',
          fontSize: 10,
          borderRadius: 3,
          bgColor: '#ffffff',
          padding: 4,
          display: 'ALWAYS'
        }
      }]
    });
  },

  clearSelection() {
    this.setData({
      selectedLatitude: null,
      selectedLongitude: null,
      selectedLatitudeText: '--',
      selectedLongitudeText: '--',
      markers: []
    });
  },

  confirmPick() {
    if (this.data.selectedLatitude === null || this.data.selectedLongitude === null) {
      wx.showToast({ title: '请先在地图上选点', icon: 'none' });
      return;
    }

    try {
      wx.setStorageSync('azElPickedLocation', {
        latitude: this.data.selectedLatitude,
        longitude: this.data.selectedLongitude,
        satelliteIndex: this.data.satelliteIndex,
        timestamp: Date.now()
      });
    } catch (e) {
      wx.showToast({ title: '回填失败', icon: 'none' });
      return;
    }

    wx.navigateBack();
  }
});

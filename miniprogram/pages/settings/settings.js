// settings.js
Page({
  data: {},

  onLoad() {},

  // 清除缓存
  clearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '清除后将删除所有本地缓存数据，云端配置不受影响。是否继续？',
      success: (res) => {
        if (res.confirm) {
          try {
            wx.clearStorageSync();
            wx.showToast({
              title: '缓存已清除',
              icon: 'success'
            });
          } catch (error) {
            wx.showToast({
              title: '清除失败',
              icon: 'error'
            });
          }
        }
      }
    });
  },

  // 导出数据
  exportData() {
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  },

  // 显示帮助
  showHelp() {
    wx.showModal({
      title: '使用帮助',
      content: '1. 在"链路计算"页面输入参数\n2. 点击"开始计算"进行计算\n3. 计算完成后可保存配置或生成报告\n4. 在"配置管理"页面可加载历史配置',
      showCancel: false
    });
  },

  // 意见反馈
  feedback() {
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  }
});

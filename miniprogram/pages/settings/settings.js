// settings.js
const satsimBox = require('../../utils/satsimBox.js');

// 「清除缓存」要保住的键：认证码是【长期收件地址】，平台侧记着它往里投。
// 一旦被清掉又生成新的，所有已绑定的平台就都成了死地址 —— 而平台侧毫不知情，
// 照样投递成功，只是再没人来取。所以这里不能再用光秃秃的 wx.clearStorageSync()。
const KEEP_KEYS = ['satsimCh', 'satsimSeen', 'satsimPlatforms', 'satsimChSynced'];

Page({
  data: {
    ch: '',
    chFmt: '',
    platforms: [],       // 已连接的仿真平台（上次同步时看到的）
    syncing: false,
    syncMsg: ''
  },

  onLoad() { this.refreshBinding(); },
  onShow() { this.setData({ platforms: satsimBox.knownPlatforms() }); },

  async refreshBinding() {
    // ensureCh：本地 → 云端 → 现生成。云端那一步保证换手机 / 清过缓存后拿回的是【同一个码】
    const ch = await satsimBox.ensureCh();
    this.setData({ ch: ch, chFmt: satsimBox.fmtCh(ch), platforms: satsimBox.knownPlatforms() });
  },

  copyCh() {
    if (!this.data.chFmt) return;
    wx.setClipboardData({
      data: this.data.chFmt,
      success: () => wx.showToast({ title: '已复制，发到电脑上粘贴即可', icon: 'none', duration: 2200 })
    });
  },

  resetCh() {
    wx.showModal({
      title: '重置认证码',
      content: '重置后换一个新的收件地址，已绑定的仿真平台全部失效，需要拿新认证码重新绑一次。\n\n只在认证码可能泄露时才需要重置。',
      confirmText: '重置',
      confirmColor: '#d9534f',
      success: async (r) => {
        if (!r.confirm) return;
        const ch = await satsimBox.resetCh();
        this.setData({ ch: ch, chFmt: satsimBox.fmtCh(ch), platforms: [], syncMsg: '' });
        wx.showToast({ title: '已重置', icon: 'success' });
      }
    });
  },

  async syncNow() {
    if (this.data.syncing) return;
    this.setData({ syncing: true, syncMsg: '' });
    const r = await satsimBox.syncNow({ force: true });
    this.setData({ syncing: false, platforms: r.platforms && r.platforms.length ? r.platforms : this.data.platforms });

    if (r.reason === 'nobind') { this.setData({ syncMsg: '还没有认证码' }); return; }
    if (r.reason === 'net') { this.setData({ syncMsg: '同步失败：' + (r.error || '网络问题') }); return; }
    if (!r.n) { this.setData({ syncMsg: '已是最新' }); return; }

    const parts = [];
    if (r.cfg) parts.push(r.cfg + ' 份链路配置');
    if (r.plan) parts.push(r.plan + ' 份频率计划');
    if (r.gxt) parts.push(r.gxt + ' 份覆盖快照');
    let msg = '已同步 ' + parts.join(' · ');
    if (r.left) msg += '，还有 ' + r.left + ' 件待同步';
    if (r.failed) msg += '（' + r.failed + ' 件失败，下次自动重试）';
    this.setData({ syncMsg: msg });
    wx.showToast({ title: '同步完成', icon: 'success' });
  },

  // 清除缓存（保住绑定，见 KEEP_KEYS）
  clearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '清除后将删除本地缓存数据，云端配置与仿真平台绑定不受影响。是否继续？',
      success: (res) => {
        if (!res.confirm) return;
        try {
          const keep = {};
          for (const k of KEEP_KEYS) {
            const v = wx.getStorageSync(k);
            if (v !== '' && v !== null && v !== undefined) keep[k] = v;
          }
          wx.clearStorageSync();
          for (const k of Object.keys(keep)) wx.setStorageSync(k, keep[k]);
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

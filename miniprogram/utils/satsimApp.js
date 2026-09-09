// 「卫星仿真平台」（Windows 桌面端）的固定下载地址与最新版本查询。
//
// 下载地址是固定的：平台每次发版都会把安装包在 COS 桶内复制一份到这个键名（见平台仓
// scripts/publish-cos.mjs 的 STABLE_FILE / copyToStable，那是唯一的产出方，键名改了这里要跟着改），
// 所以这里写死一个地址即可，不随版本号变。小程序打不开外部网页，只能把地址复制到剪贴板、
// 由用户在电脑浏览器里打开。平台自己的「关于」窗口不展示这个地址（装着平台的人不需要再下载平台）。
//
// 最新版本号 / 大小 / 日期来自同一目录下的 latest.yml（electron-updater 的清单），经云函数
// importGxtSnapshot 的 latest 动作代拉（COS 域名不在小程序 request 合法域名里，直连不了）。
// 云函数还是旧版（没有 latest 动作）或没网时静默失败，页面只显示下载地址不显示版本。
const DOWNLOAD_URL = 'https://update-1385987144.cos.ap-beijing.myqcloud.com/updates/satsim-setup.exe';
const KEY_LATEST = 'satsimLatest';          // { version, size, date, at }
const TTL_MS = 6 * 3600 * 1000;             // 版本信息缓存 6 小时

function readCache() {
  try { const v = wx.getStorageSync(KEY_LATEST); return v && v.version ? v : null; } catch (e) { return null; }
}

function fetchLatest() {
  return new Promise((resolve) => {
    wx.cloud.callFunction({
      name: 'importGxtSnapshot',
      data: { action: 'latest' },
      success: (res) => {
        const r = res && res.result;
        const d = r && r.success && r.data;
        if (!d || !d.version) { resolve(null); return; }
        const v = { version: String(d.version), size: Number(d.size) || 0, date: String(d.releaseDate || '').slice(0, 10), at: Date.now() };
        try { wx.setStorageSync(KEY_LATEST, v); } catch (e) { /* 存不下就不缓存 */ }
        resolve(v);
      },
      fail: () => resolve(null)
    });
  });
}

/** 最新版本（先缓存后网络）：{ version, size, date } 或 null */
async function latest() {
  const c = readCache();
  if (c && Date.now() - c.at < TTL_MS) return c;
  return (await fetchLatest()) || c;
}

/** 「最新版本 v1.4.6 · 218 MB · 2026-09-07」一行；没有版本信息返回空串 */
function latestText(v) {
  if (!v || !v.version) return '';
  const parts = ['最新版本 v' + v.version];
  if (v.size) parts.push(Math.round(v.size / 1048576) + ' MB');
  if (v.date) parts.push(v.date);
  return parts.join(' · ');
}

module.exports = { DOWNLOAD_URL: DOWNLOAD_URL, latest: latest, latestText: latestText };

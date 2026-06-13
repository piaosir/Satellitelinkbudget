// Starlink TLE 众包刷新工具。
// Starlink ~1.77MB，CelesTrak 大响应不压缩、腾讯云直连境外慢，云函数 60s 内拉不动，
// 故改为：任何用户启动小程序时后台静默检查云存储 starlink.json 新鲜度，过期/缺失就由该用户
// 本机直连 CelesTrak 拉取并回传云存储（一天只更一次，谁启动算谁的），惠及后续所有用户。

const ENV_ID = 'cloud1-8gjv5ekx41d6fb76';
const BUCKET = '636c-cloud1-8gjv5ekx41d6fb76-1385987144';
const STARLINK_TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle';
const DEFAULT_MAX_AGE_MS = 24 * 3600 * 1000;

let _refreshing = false; // 本会话内防重入

const fileID = (path) => `cloud://${ENV_ID}.${BUCKET}/${path}`;

// TLE 文本 -> [{name, noradId, line1, line2}]
function parseTLE(text) {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, '')).filter((l) => l.length > 0);
  const sats = [];
  let pendingName = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('1 ') && i + 1 < lines.length && lines[i + 1].startsWith('2 ')) {
      const line1 = line, line2 = lines[i + 1];
      const noradId = line1.substring(2, 7).trim();
      sats.push({ name: (pendingName || ('NORAD ' + noradId)).trim(), noradId, line1, line2 });
      pendingName = ''; i += 1;
    } else if (!line.startsWith('1 ') && !line.startsWith('2 ')) {
      pendingName = line;
    }
  }
  return sats;
}

function downloadJSON(path) {
  return new Promise((resolve, reject) => {
    wx.cloud.downloadFile({
      fileID: fileID(path),
      success: (res) => {
        wx.getFileSystemManager().readFile({
          filePath: res.tempFilePath, encoding: 'utf8',
          success: (r) => { try { resolve(JSON.parse(r.data)); } catch (e) { reject(e); } },
          fail: reject
        });
      },
      fail: reject
    });
  });
}

// 写临时文件再上传云存储（best-effort）
function uploadJSON(cloudPath, obj) {
  const fs = wx.getFileSystemManager();
  const local = `${wx.env.USER_DATA_PATH}/${cloudPath.replace(/\//g, '_')}`;
  fs.writeFile({
    filePath: local, data: JSON.stringify(obj), encoding: 'utf8',
    success: () => wx.cloud.uploadFile({ cloudPath, filePath: local, success: () => {}, fail: () => {} }),
    fail: () => {}
  });
}

// 把一份 Starlink payload 回传云存储（数据文件 + 跨分组索引用的精简名单）
function uploadStarlinkPayload(payload) {
  uploadJSON('celestrak/starlink.json', payload);
  uploadJSON('celestrak/_names_starlink.json', {
    group: 'starlink', fetchedAt: payload.fetchedAt,
    names: payload.sats.map((s) => ({ name: s.name, noradId: s.noradId }))
  });
}

// 直连 CelesTrak 拉取 Starlink TLE -> payload（Promise）
function fetchStarlinkLive() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: STARLINK_TLE_URL, method: 'GET', dataType: 'text', responseType: 'text', timeout: 120000,
      success: (res) => {
        const text = (typeof res.data === 'string') ? res.data : '';
        const sats = parseTLE(text);
        if (!sats.length) return reject(new Error('empty'));
        resolve({ group: 'starlink', label: 'Starlink', fetchedAt: new Date().toISOString(), count: sats.length, sats });
      },
      fail: reject
    });
  });
}

// 启动时调用：云存储无当天数据则后台拉取+回传（静默，失败不抛）
function ensureStarlinkFresh(maxAgeMs) {
  const maxAge = maxAgeMs || DEFAULT_MAX_AGE_MS;
  if (_refreshing || !wx.cloud) return;
  _refreshing = true;
  const done = () => { _refreshing = false; };

  downloadJSON('celestrak/starlink.json')
    .then((data) => {
      const age = (data && data.fetchedAt) ? (Date.now() - new Date(data.fetchedAt).getTime()) : Infinity;
      if (data && data.sats && age < maxAge) { done(); return; } // 已是当天数据
      return fetchStarlinkLive().then((p) => { uploadStarlinkPayload(p); done(); });
    })
    .catch(() => {
      // 云存储无文件 -> 直接拉取回传
      fetchStarlinkLive().then((p) => { uploadStarlinkPayload(p); }).catch(() => {}).then(done);
    });
}

module.exports = { parseTLE, ensureStarlinkFresh, uploadStarlinkPayload, fetchStarlinkLive };

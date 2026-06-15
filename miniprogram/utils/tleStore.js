// 全星座 TLE 众包刷新工具。
// 背景：云函数从境外 CelesTrak 拉取常超时/被限流（尤以 Starlink ~1.77MB 为甚），定时器不可靠。
// 方案：改为前端众包——任一用户启动小程序时，每设备每天检查一次云存储各组新鲜度（只下 ~1KB manifest），
//   过期的组由该用户本机直连 CelesTrak 拉取（走用户自己流量）并回传云存储，惠及后续所有用户。
//   每天首个用户若把全部组都刷新了，顺带重建跨分组搜索索引 _index.json。
// 注意：云存储存的是 TLE 文本（轨道根数），SGP4 推演在前端打开页面时做（LEO 每秒移动 ~7.5km，
//       预存坐标会过期）。

const ENV_ID = 'cloud1-8gjv5ekx41d6fb76';
const BUCKET = '636c-cloud1-8gjv5ekx41d6fb76-1385987144';
const DEFAULT_MAX_AGE_MS = 24 * 3600 * 1000;
const DAILY_KEY = 'tle_check_date'; // 每设备每天只检查一次的本地标记

// 各组 -> CelesTrak GP 查询参数（须与云函数 fetchTLE 的 GROUPS 保持一致）
const GROUP_QUERY = {
  starlink:   'GROUP=starlink',
  oneweb:     'GROUP=oneweb',
  gps:        'GROUP=gps-ops',
  beidou:     'GROUP=beidou',
  galileo:    'GROUP=galileo',
  qianfan:    'GROUP=qianfan',
  guowang:    'NAME=HULIANWANG', // 国网/互联网低轨真实星名为 HULIANWANG
  geo:        'GROUP=geo',
  glonass:    'GROUP=glo-ops',
  o3b:        'NAME=O3B',
  iridium:    'GROUP=iridium-NEXT',
  globalstar: 'GROUP=globalstar',
  stations:   'GROUP=stations'
};
const ALL_KEYS = Object.keys(GROUP_QUERY);

let _refreshing = false; // 本会话内防重入

const fileID = (path) => `cloud://${ENV_ID}.${BUCKET}/${path}`;
const tleUrl = (key) => `https://celestrak.org/NORAD/elements/gp.php?${GROUP_QUERY[key]}&FORMAT=tle`;

function todayStr() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

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

// 下载云存储 JSON 并解析（Promise）
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

// 写临时文件再上传云存储（best-effort，恒 resolve(true/false) 便于串联）
function uploadJSON(cloudPath, obj) {
  return new Promise((resolve) => {
    const fs = wx.getFileSystemManager();
    const local = `${wx.env.USER_DATA_PATH}/${cloudPath.replace(/\//g, '_')}`;
    fs.writeFile({
      filePath: local, data: JSON.stringify(obj), encoding: 'utf8',
      success: () => wx.cloud.uploadFile({ cloudPath, filePath: local, success: () => resolve(true), fail: () => resolve(false) }),
      fail: () => resolve(false)
    });
  });
}

// 直连 CelesTrak 拉取某组 TLE -> payload（Promise）
function fetchGroupLive(key) {
  return new Promise((resolve, reject) => {
    if (!GROUP_QUERY[key]) return reject(new Error('unknown group: ' + key));
    wx.request({
      url: tleUrl(key), method: 'GET', dataType: 'text', responseType: 'text', timeout: 120000,
      success: (res) => {
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
        const text = (typeof res.data === 'string') ? res.data : '';
        const sats = parseTLE(text);
        if (!sats.length) return reject(new Error('empty'));
        resolve({ group: key, fetchedAt: new Date().toISOString(), count: sats.length, sats });
      },
      fail: reject
    });
  });
}

// 把某组 payload 回传云存储（数据文件 + 跨分组索引用的精简名单）。返回 Promise。
function uploadGroupPayload(key, payload) {
  return Promise.all([
    uploadJSON(`celestrak/${key}.json`, payload),
    uploadJSON(`celestrak/_names_${key}.json`, {
      group: key, fetchedAt: payload.fetchedAt,
      names: payload.sats.map((s) => ({ name: s.name, noradId: s.noradId }))
    })
  ]);
}

// 读取 manifest（各组 fetchedAt/count），不存在返回 null
function loadManifest() {
  return downloadJSON('celestrak/manifest.json').catch(() => null);
}

// 读-改-写 manifest：把 entries({key:{fetchedAt,count}}) 合并进去
function updateManifest(entries) {
  return loadManifest().then((m) => {
    const manifest = (m && m.groups) ? m : { groups: {} };
    Object.keys(entries).forEach((k) => { manifest.groups[k] = entries[k]; });
    manifest.updatedAt = new Date().toISOString();
    return uploadJSON('celestrak/manifest.json', manifest);
  });
}

// 用各组名单重建跨分组搜索索引 _index.json
function uploadIndex(namesByKey) {
  const sats = [];
  Object.keys(namesByKey).forEach((k) => {
    const arr = namesByKey[k] || [];
    for (let i = 0; i < arr.length; i++) sats.push({ name: arr[i].name, noradId: arr[i].noradId, group: k });
  });
  return uploadJSON('celestrak/_index.json', { builtAt: new Date().toISOString(), count: sats.length, sats });
}

// 启动时调用：每设备每天只查一次；只下 ~1KB manifest 判断各组新鲜度，
// 过期的组本机直连 CelesTrak 串行拉取（走用户自己流量）回传云存储；
// 若本次刷新了全部组，顺带重建索引。静默、失败不抛。
function ensureTLEFresh(maxAgeMs) {
  const maxAge = maxAgeMs || DEFAULT_MAX_AGE_MS;
  if (_refreshing || !wx.cloud) return;
  try { if (wx.getStorageSync(DAILY_KEY) === todayStr()) return; } catch (e) {} // 当天已查 -> 零网络
  _refreshing = true;
  const finish = (ok) => {
    if (ok) { try { wx.setStorageSync(DAILY_KEY, todayStr()); } catch (e) {} }
    _refreshing = false;
  };

  loadManifest().then((manifest) => {
    const groups = (manifest && manifest.groups) || {};
    const stale = ALL_KEYS.filter((k) => {
      const f = groups[k] && groups[k].fetchedAt;
      const age = f ? (Date.now() - new Date(f).getTime()) : Infinity;
      return age >= maxAge;
    });
    if (!stale.length) { finish(true); return; } // 全部当天数据，仅花 ~1KB

    const entries = {};    // 成功刷新的组 -> {fetchedAt,count}
    const namesByKey = {}; // 成功刷新的组 -> names（重建索引用）
    let i = 0;
    const next = () => {
      if (i >= stale.length) return afterAll();
      const key = stale[i++];
      return fetchGroupLive(key)
        .then((payload) => uploadGroupPayload(key, payload).then(() => {
          entries[key] = { fetchedAt: payload.fetchedAt, count: payload.count };
          namesByKey[key] = payload.sats.map((s) => ({ name: s.name, noradId: s.noradId }));
        }))
        .catch(() => {}) // 单组失败跳过，继续其它
        .then(() => new Promise((r) => setTimeout(r, 300))) // 轻微间隔，温柔对待 CelesTrak
        .then(next);
    };
    const afterAll = () => {
      const refreshed = Object.keys(entries);
      if (!refreshed.length) { finish(false); return; } // 全失败 -> 不标记，下次重试
      const tasks = [updateManifest(entries)];
      // 本次把全部组都刷新了 -> 顺带重建跨分组搜索索引
      if (refreshed.length === ALL_KEYS.length) tasks.push(uploadIndex(namesByKey));
      Promise.all(tasks).then(() => finish(true), () => finish(true));
    };
    next();
  }).catch(() => finish(false));
}

module.exports = {
  parseTLE,
  ensureTLEFresh,
  fetchGroupLive,
  uploadGroupPayload,
  GROUP_QUERY
};

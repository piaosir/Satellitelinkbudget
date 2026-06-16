// 全星座 TLE 众包刷新工具。
// 背景：云函数从境外 CelesTrak 拉取常超时/被限流（尤以 Starlink ~1.77MB 为甚），定时器不可靠。
// 方案（v3.8）：每设备「每过本地 0 点」直连 CelesTrak 拉取全部分组各一次——
//   ① 写入本地缓存（与星座地图同一套键）→ 用户进图直接读本机，几乎不走云存储 CDN；
//   ② 带闸门回传云存储（仅当云端那份不是“今天”才传，避免重复覆盖）→ 云端恒为当天最新，
//      仅在用户本机直连失败/还没拉好时作兜底。全部分组就绪后本地重建搜索索引（搜索亦零 CDN）。
// 注意：云存储存的是 TLE 文本（轨道根数），SGP4 推演在前端打开页面时做（LEO 每秒移动 ~7.5km，
//       预存坐标会过期）。

const ENV_ID = 'cloud1-8gjv5ekx41d6fb76';
const BUCKET = '636c-cloud1-8gjv5ekx41d6fb76-1385987144';
const DAILY_KEY = 'tle_check_date'; // 每设备「每过本地 0 点」只跑一次全量直连的本地标记

// 各组 -> CelesTrak GP 查询参数（须与云函数 fetchTLE 的 GROUPS 保持一致）
const GROUP_QUERY = {
  starlink:   'GROUP=starlink',
  oneweb:     'GROUP=oneweb',
  kuiper:     'GROUP=kuiper',
  gps:        'GROUP=gps-ops',
  beidou:     'GROUP=beidou',
  galileo:    'GROUP=galileo',
  qianfan:    'GROUP=qianfan',
  guowang:    'NAME=HULIANWANG', // 中国星网/互联网低轨真实星名为 HULIANWANG
  geo:        'GROUP=geo',
  glonass:    'GROUP=glo-ops',
  o3b:        'NAME=O3B',
  iridium:    'GROUP=iridium-NEXT',
  globalstar: 'GROUP=globalstar',
  stations:   'GROUP=stations',
  planet:     'GROUP=planet',
  spire:      'GROUP=spire'
};
const ALL_KEYS = Object.keys(GROUP_QUERY);

let _refreshing = false; // 本会话内防重入

const fileID = (path) => `cloud://${ENV_ID}.${BUCKET}/${path}`;
const tleUrl = (key) => `https://celestrak.org/NORAD/elements/gp.php?${GROUP_QUERY[key]}&FORMAT=tle`;

function todayStr() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ISO 时间戳 -> 本地日期串（用于判断云端那份是否“今天”）
function localDateOf(iso) {
  try {
    const d = new Date(iso), p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  } catch (e) { return ''; }
}

// ---- 本地缓存：与星座地图 _readCache/_writeCache 完全同一套键（tle_<key>.json + tle_date_<key>），
//      让启动直连拉到的数据直接喂给地图读，用户进图零 CDN。'_index' 即跨分组搜索索引缓存。----
const cachePath = (key) => `${wx.env.USER_DATA_PATH}/tle_${key}.json`;
function localCacheIsToday(key) {
  try { return wx.getStorageSync(`tle_date_${key}`) === todayStr(); } catch (e) { return false; }
}
function writeLocalCache(key, data) {
  try {
    wx.getFileSystemManager().writeFileSync(cachePath(key), JSON.stringify(data), 'utf8');
    // 标记存“数据自身下载日期(fetchedAt)”——与星座地图 _writeCache 同一口径，旧副本不被误判为当天
    const stamp = (data && data.fetchedAt) ? localDateOf(data.fetchedAt) : todayStr();
    wx.setStorageSync(`tle_date_${key}`, stamp);
  } catch (e) { /* 缓存写失败不影响回传与展示 */ }
}
function readLocalCache(key) {
  try {
    if (wx.getStorageSync(`tle_date_${key}`) !== todayStr()) return null;
    const data = JSON.parse(wx.getFileSystemManager().readFileSync(cachePath(key), 'utf8'));
    if (data && data.fetchedAt && localDateOf(data.fetchedAt) !== todayStr()) return null;
    return data;
  } catch (e) { return null; }
}
// 用当天本地各组缓存重建跨分组搜索索引，写入本地 '_index'（搜索零 CDN）
function buildLocalIndex() {
  try {
    const sats = [];
    for (let i = 0; i < ALL_KEYS.length; i++) {
      const key = ALL_KEYS[i];
      const c = readLocalCache(key);
      const arr = (c && c.sats) || [];
      for (let j = 0; j < arr.length; j++) sats.push({ name: arr[j].name, noradId: arr[j].noradId, group: key });
    }
    writeLocalCache('_index', { sats });
  } catch (e) { /* 索引为锦上添花，失败时搜索退回云端 _index.json */ }
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
        if (res.statusCode !== 200) {
          // CelesTrak 对“数据自上次下载后未更新”的重复请求返回 403 提示页 -> 视为未更新（非失败），
          // 上抛 NOT_MODIFIED 由调用方跳过（沿用现有本地/云端那份即可，避免误判为下载失败去兜底）。
          const body = (typeof res.data === 'string') ? res.data : '';
          if (res.statusCode === 403 && /not updated/i.test(body)) return reject(new Error('NOT_MODIFIED'));
          return reject(new Error('HTTP ' + res.statusCode));
        }
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

// 启动时调用：每设备「每过本地 0 点」跑一次。串行直连 CelesTrak 拉取全部分组，每组：
//   ① 写本地缓存（喂给星座地图，用户进图零 CDN）；
//   ② 带闸门回传云存储——仅当云端那份不是“今天”才传，保证云端恒为当天最新又不重复覆盖。
// 已是当天本地缓存的组跳过（支持当天多次启动只补失败/缺失组）；全部分组当天就绪后本地重建搜索
// 索引并标记 DAILY_KEY（仅此时；否则下次启动继续补，保证用户看到的 TLE 与当天一致）。静默、失败不抛。
function ensureTLEFresh() {
  if (_refreshing || !wx.cloud) return;
  try { if (wx.getStorageSync(DAILY_KEY) === todayStr()) return; } catch (e) {} // 当天已完成 -> 零网络
  _refreshing = true;

  loadManifest().then((manifest) => {
    const cloudGroups = (manifest && manifest.groups) || {};
    const entries = {};    // 实际回传云存储的组 -> {fetchedAt,count}（用于批量更新 manifest）
    const namesByKey = {}; // 本次直连成功的组 -> names（自己刷全了才重建云端索引用）
    let i = 0;

    const next = () => {
      if (i >= ALL_KEYS.length) return afterAll();
      const key = ALL_KEYS[i++];
      // 本组当天本地缓存已就绪 -> 跳过，避免重复直连
      if (localCacheIsToday(key)) return next();

      return fetchGroupLive(key)
        .then((payload) => {
          // ① 写本地缓存（与星座地图同一套键）-> 用户进图直接读本机
          writeLocalCache(key, payload);
          namesByKey[key] = payload.sats.map((s) => ({ name: s.name, noradId: s.noradId }));
          // ② 带闸门回传：仅当云端那份不是“今天”才上传（首个活跃用户传一次，其余跳过）
          const cf = cloudGroups[key] && cloudGroups[key].fetchedAt;
          if (cf && localDateOf(cf) === todayStr()) return; // 云端已是今天 -> 不重复覆盖
          return uploadGroupPayload(key, payload).then(() => {
            entries[key] = { fetchedAt: payload.fetchedAt, count: payload.count };
            cloudGroups[key] = entries[key]; // 会话内标记云端已新
          });
        })
        .catch(() => {}) // NOT_MODIFIED / 单组失败 -> 跳过；该组下次启动再补，地图临时走云存储兜底
        .then(() => new Promise((r) => setTimeout(r, 300))) // 轻微间隔，温柔对待 CelesTrak
        .then(next);
    };

    const afterAll = () => {
      const tasks = [];
      if (Object.keys(entries).length) tasks.push(updateManifest(entries));

      // 全部分组当天本地缓存就绪 -> 本地重建搜索索引（搜索零 CDN）+ 标记当天完成
      const allFresh = ALL_KEYS.every(localCacheIsToday);
      if (allFresh) {
        buildLocalIndex();
        // 本次自己把全部组都直连刷新了 -> 顺带更新云端索引（惠及兜底用户）
        if (Object.keys(namesByKey).length === ALL_KEYS.length) tasks.push(uploadIndex(namesByKey));
      }

      const done = () => {
        if (allFresh) { try { wx.setStorageSync(DAILY_KEY, todayStr()); } catch (e) {} }
        _refreshing = false;
      };
      if (tasks.length) Promise.all(tasks).then(done, done); else done();
    };

    next();
  }).catch(() => { _refreshing = false; });
}

module.exports = {
  parseTLE,
  ensureTLEFresh,
  fetchGroupLive,
  uploadGroupPayload,
  GROUP_QUERY
};

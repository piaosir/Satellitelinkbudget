// 全星座轨道根数（OMM/CSV）众包刷新工具。
// 背景：云函数从境外 CelesTrak 拉取常超时/被限流（尤以 Starlink ~1.77MB 为甚），定时器不可靠。
// 方案（v3.8）：每设备「每过本地 0 点」直连 CelesTrak 拉取全部分组各一次——
//   ① 写入本地缓存（与星座地图同一套键）→ 用户进图直接读本机，几乎不走云存储 CDN；
//   ② 带闸门回传云存储（仅当云端那份不是“今天”才传，避免重复覆盖）→ 云端恒为当天最新，
//      仅在用户本机直连失败/还没拉好时作兜底。全部分组就绪后本地重建搜索索引（搜索亦零 CDN）。
//
// 【v3.8 起改用 OMM/CSV，取代经典 TLE】CelesTrak 公告：5 位 NORAD 编号约 2026-07-12 耗尽，之后
//   新星用 9 位编号，TLE 的 5 字符列宽塞不下。故改 CelesTrak GP 查询 FORMAT=csv（OMM 均根数），
//   noradId 取完整 NORAD_CAT_ID。为不影响商店在用旧版本（共用同一云存储），新格式放独立命名空间
//   celestrak/omm/*，本地缓存键也用 tle_omm_* 隔离；旧 celestrak/* 由旧版本各自维护，互不干扰。
// 存储分层：云存储存 CSV 信封 {group,fetchedAt,count,csv}（CDN 下行最省）；本地缓存存解析后的
//   精简记录 {group,fetchedAt,count,sats}（页面零解析直接构 satrec）。
// 注意：存的是轨道根数，SGP4 推演在前端打开页面时做（LEO 每秒移动 ~7.5km，预存坐标会过期）。

const ENV_ID = 'cloud1-8gjv5ekx41d6fb76';
const BUCKET = '636c-cloud1-8gjv5ekx41d6fb76-1385987144';
const OMM_PREFIX = 'celestrak/omm/'; // OMM/CSV 独立命名空间（与旧 TLE 的 celestrak/* 隔离）
const DAILY_KEY = 'tle_omm_check_date'; // 每设备「每过本地 0 点」只跑一次全量直连的本地标记

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
const tleUrl = (key) => `https://celestrak.org/NORAD/elements/gp.php?${GROUP_QUERY[key]}&FORMAT=csv`;

// 部分大 LEO 组在 CelesTrak 有「运营商补充星历」端点(sup-gp.php)，其限流与主端点(gp.php)互相独立。
// 主端点 403「未更新」/失败且本地·云端都无副本时，转打此端点兜底，破冷启动死锁。值=sup-gp.php 的 FILE 参数。
const SUP_FILE = { starlink: 'starlink', oneweb: 'oneweb', kuiper: 'kuiper', planet: 'planet', iridium: 'iridium', gps: 'gps' };
const supUrl = (key) => `https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=${SUP_FILE[key]}&FORMAT=csv`;

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

// ---- 本地缓存：与星座地图 _readCache/_writeCache 完全同一套键（tle_omm_<key>.json + tle_omm_date_<key>），
//      让启动直连拉到的数据直接喂给地图读，用户进图零 CDN。'_index' 即跨分组搜索索引缓存。----
const cachePath = (key) => `${wx.env.USER_DATA_PATH}/tle_omm_${key}.json`;
function localCacheIsToday(key) {
  try { return wx.getStorageSync(`tle_omm_date_${key}`) === todayStr(); } catch (e) { return false; }
}
function writeLocalCache(key, data) {
  try {
    wx.getFileSystemManager().writeFileSync(cachePath(key), JSON.stringify(data), 'utf8');
    // 标记存“数据自身下载日期(fetchedAt)”——与星座地图 _writeCache 同一口径，旧副本不被误判为当天
    const stamp = (data && data.fetchedAt) ? localDateOf(data.fetchedAt) : todayStr();
    wx.setStorageSync(`tle_omm_date_${key}`, stamp);
  } catch (e) { /* 缓存写失败不影响回传与展示 */ }
}
function readLocalCache(key) {
  try {
    if (wx.getStorageSync(`tle_omm_date_${key}`) !== todayStr()) return null;
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

// 解析一行 CSV（RFC4180：双引号包裹、内部 "" 转义为一个引号）-> 字段数组
function splitCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') { inQ = true; }
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// CelesTrak OMM CSV(FORMAT=csv) -> [{name,noradId,objectId,epoch,meanMotion,ecc,incl,raan,argp,ma,bstar,mdot,mddot}]
// 按表头列名定位（不依赖列序）；编号取完整 NORAD_CAT_ID（可达 9 位）。数值保留字符串，由 omm2satrec 取 Number。
function parseOMMCsv(text) {
  const lines = text.split(/\r?\n/);
  let h = 0;
  while (h < lines.length && !lines[h].trim()) h++;
  if (h >= lines.length) return [];
  const header = splitCsvLine(lines[h]).map((s) => s.trim().toUpperCase());
  const col = {};
  for (let i = 0; i < header.length; i++) col[header[i]] = i;
  const ix = (n) => (n in col ? col[n] : -1);
  const iName = ix('OBJECT_NAME'), iObj = ix('OBJECT_ID'), iEpoch = ix('EPOCH'),
        iMM = ix('MEAN_MOTION'), iEcc = ix('ECCENTRICITY'), iInc = ix('INCLINATION'),
        iRaan = ix('RA_OF_ASC_NODE'), iArgp = ix('ARG_OF_PERICENTER'), iMa = ix('MEAN_ANOMALY'),
        iId = ix('NORAD_CAT_ID'), iB = ix('BSTAR'), iMdot = ix('MEAN_MOTION_DOT'), iMddot = ix('MEAN_MOTION_DDOT');
  if (iEpoch < 0 || iMM < 0 || iId < 0) return []; // 关键列缺失（非 OMM CSV / 错误提示文本）-> 视为无效
  const g = (f, i) => (i >= 0 && i < f.length ? f[i].trim() : '');
  const sats = [];
  for (let r = h + 1; r < lines.length; r++) {
    if (!lines[r].trim()) continue;
    const f = splitCsvLine(lines[r]);
    const noradId = g(f, iId);
    if (!noradId) continue;
    sats.push({
      name: g(f, iName) || ('NORAD ' + noradId),
      noradId,
      objectId: g(f, iObj),
      epoch: g(f, iEpoch),
      meanMotion: g(f, iMM),
      ecc: g(f, iEcc),
      incl: g(f, iInc),
      raan: g(f, iRaan),
      argp: g(f, iArgp),
      ma: g(f, iMa),
      bstar: g(f, iB) || '0',
      mdot: g(f, iMdot) || '0',
      mddot: g(f, iMddot) || '0'
    });
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

// 请求某 CSV 端点并解析为 payload（含原始 csv 文本 + 解析后的 sats）。Promise。
function fetchCsv(key, url) {
  return new Promise((resolve, reject) => {
    wx.request({
      url, method: 'GET', dataType: 'text', responseType: 'text', timeout: 120000,
      success: (res) => {
        if (res.statusCode !== 200) {
          // CelesTrak 对“数据自上次下载后未更新”的重复请求返回 403 提示页 -> 视为未更新（非失败），
          // 上抛 NOT_MODIFIED 由调用方跳过（沿用现有本地/云端那份即可，避免误判为下载失败去兜底）。
          const body = (typeof res.data === 'string') ? res.data : '';
          if (res.statusCode === 403 && /not updated/i.test(body)) return reject(new Error('NOT_MODIFIED'));
          return reject(new Error('HTTP ' + res.statusCode));
        }
        const text = (typeof res.data === 'string') ? res.data : '';
        const sats = parseOMMCsv(text);
        if (!sats.length) return reject(new Error('empty'));
        resolve({ group: key, fetchedAt: new Date().toISOString(), count: sats.length, csv: text, sats });
      },
      fail: reject
    });
  });
}

// 直连 CelesTrak 主端点(gp.php)拉取某组 OMM/CSV。保留 NOT_MODIFIED 语义供 ensureTLEFresh 判“未更新则跳过”。
function fetchGroupLive(key) {
  if (!GROUP_QUERY[key]) return Promise.reject(new Error('unknown group: ' + key));
  return fetchCsv(key, tleUrl(key));
}

// 直连 CelesTrak 补充星历端点(sup-gp.php)；仅覆盖部分大 LEO 组（见 SUP_FILE）。
function fetchGroupSup(key) {
  if (!SUP_FILE[key]) return Promise.reject(new Error('no supplemental: ' + key));
  return fetchCsv(key, supUrl(key));
}

// 冷启动按需取数用：主端点拿不到（含 403 未更新/失败）时，有补充源就转打补充端点。
// 注意：ensureTLEFresh 的日常刷新仍用纯 fetchGroupLive，以保留“未更新即跳过、不重复下载”语义。
function fetchGroupLiveOrSup(key) {
  return fetchGroupLive(key).catch((e) => {
    if (SUP_FILE[key]) return fetchGroupSup(key);
    return Promise.reject(e);
  });
}

// 把某组 payload 回传云存储（CSV 信封数据文件 + 跨分组索引用的精简名单）。返回 Promise。
function uploadGroupPayload(key, payload) {
  return Promise.all([
    uploadJSON(`${OMM_PREFIX}${key}.json`, {
      group: key, fetchedAt: payload.fetchedAt, count: payload.count, csv: payload.csv
    }),
    uploadJSON(`${OMM_PREFIX}_names_${key}.json`, {
      group: key, fetchedAt: payload.fetchedAt,
      names: payload.sats.map((s) => ({ name: s.name, noradId: s.noradId }))
    })
  ]);
}

// 读取 manifest（各组 fetchedAt/count），不存在返回 null
function loadManifest() {
  return downloadJSON(`${OMM_PREFIX}manifest.json`).catch(() => null);
}

// 读-改-写 manifest：把 entries({key:{fetchedAt,count}}) 合并进去
function updateManifest(entries) {
  return loadManifest().then((m) => {
    const manifest = (m && m.groups) ? m : { groups: {} };
    Object.keys(entries).forEach((k) => { manifest.groups[k] = entries[k]; });
    manifest.updatedAt = new Date().toISOString();
    return uploadJSON(`${OMM_PREFIX}manifest.json`, manifest);
  });
}

// 用各组名单重建跨分组搜索索引 _index.json
function uploadIndex(namesByKey) {
  const sats = [];
  Object.keys(namesByKey).forEach((k) => {
    const arr = namesByKey[k] || [];
    for (let i = 0; i < arr.length; i++) sats.push({ name: arr[i].name, noradId: arr[i].noradId, group: k });
  });
  return uploadJSON(`${OMM_PREFIX}_index.json`, { builtAt: new Date().toISOString(), count: sats.length, sats });
}

// 启动时调用：每设备「每过本地 0 点」跑一次。串行直连 CelesTrak 拉取全部分组，每组：
//   ① 写本地缓存（喂给星座地图，用户进图零 CDN）；
//   ② 带闸门回传云存储——仅当云端那份不是“今天”才传，保证云端恒为当天最新又不重复覆盖。
// 已是当天本地缓存的组跳过（支持当天多次启动只补失败/缺失组）；全部分组当天就绪后本地重建搜索
// 索引并标记 DAILY_KEY（仅此时；否则下次启动继续补，保证用户看到的根数与当天一致）。静默、失败不抛。
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
          // ① 写本地缓存（仅解析记录，不含 csv）-> 用户进图直接读本机
          writeLocalCache(key, { group: payload.group, fetchedAt: payload.fetchedAt, count: payload.count, sats: payload.sats });
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

// ---- 供星间链路页复用：跨分组搜索索引 + 按 NORAD 取某星根数 ----
// （星座地图把同等逻辑写在页面内联；这里抽出共享，不改动地图，避免回归）

let _indexCache = null; // 本会话内索引缓存

// 跨分组搜索索引 [{name, noradId, group}]：本地 '_index' 缓存命中即返回，否则下云端 _index.json
// 并补 Starlink 名单（众包可能尚未并入云端索引），写回本地缓存。
function ensureSearchIndex() {
  if (_indexCache) return Promise.resolve(_indexCache);
  const cached = readLocalCache('_index');
  if (cached && cached.sats) { _indexCache = cached.sats; return Promise.resolve(_indexCache); }
  return Promise.all([
    downloadJSON(`${OMM_PREFIX}_index.json`).catch(() => null),
    downloadJSON(`${OMM_PREFIX}_names_starlink.json`).catch(() => null)
  ]).then(([idx, star]) => {
    const index = (idx && idx.sats) ? idx.sats.slice() : [];
    const hasStarlink = index.some((s) => s.group === 'starlink');
    if (!hasStarlink && star && star.names) {
      for (let i = 0; i < star.names.length; i++) {
        index.push({ name: star.names[i].name, noradId: star.names[i].noradId, group: 'starlink' });
      }
    }
    _indexCache = index;
    writeLocalCache('_index', { sats: index });
    return index;
  });
}

// 取某分组全量 sats（[{name,noradId,...OMM根数}]）：当天本地缓存 -> 云端(<key>.json 的 CSV 信封) -> 直连兜底
function loadGroupSats(key) {
  const cached = readLocalCache(key);
  if (cached && cached.sats && cached.sats.length) {
    return Promise.resolve({ sats: cached.sats, fetchedAt: cached.fetchedAt });
  }
  const live = () => fetchGroupLiveOrSup(key).then((p) => ({ sats: p.sats, fetchedAt: p.fetchedAt }));
  return downloadJSON(`${OMM_PREFIX}${key}.json`).then((data) => {
    if (data && data.csv) {
      const sats = parseOMMCsv(data.csv);
      return sats.length ? { sats, fetchedAt: data.fetchedAt } : live();
    }
    return live();
  }).catch(live);
}

module.exports = {
  parseOMMCsv,
  ensureTLEFresh,
  fetchGroupLive,
  fetchGroupLiveOrSup,
  uploadGroupPayload,
  GROUP_QUERY,
  readLocalCache,
  ensureSearchIndex,
  loadGroupSats
};

// cloudfunctions/fetchTLE/index.js
// 从 CelesTrak 下载各星座 OMM/CSV（FORMAT=csv），原始 CSV 文本整体写入云存储 celestrak/omm/<group>.json。
//
// 【v3.8 起改用 OMM/CSV，取代经典 TLE】CelesTrak 公告：5 位 NORAD 编号约 2026-07-12 耗尽，之后新星
//   用 9 位编号，TLE 5 字符列宽塞不下。故改 FORMAT=csv，noradId 取完整 NORAD_CAT_ID。为不影响商店在用
//   旧版本（共用同一云存储），新格式放独立命名空间 celestrak/omm/*；旧 celestrak/* 不再由本函数维护。
//
// 【仅手动调用】日常刷新已改为前端众包（见 miniprogram/utils/tleStore.js）。本函数不挂定时触发器，
// 仅供需要时手动播种/兜底：
//   - wx.cloud.callFunction({ name:'fetchTLE', data:{ group:'starlink' } })：刷新单组。
//   - data:{} 或不带参：刷新除 starlink 外的全部分组（主集合）。
//
// 跨分组搜索索引 celestrak/omm/_index.json + manifest.json：每次运行都从已保存的各组名单文件
//   _names_<group>.json 重建，故即使某次只刷新部分组/某组失败，索引仍含所有“曾成功保存过”的组（含 starlink）。
//
// 注意：云存储存的是轨道根数（OMM CSV 文本），不是坐标。SGP4 推演在前端打开页面时做一次，
//       这样看到的才是“此刻”真实位置（LEO 每秒移动约 7.5km，云端预存坐标会严重过期）。

const cloud = require('wx-server-sdk');
const https = require('https');
const zlib = require('zlib');

const ENV_ID = 'cloud1-8gjv5ekx41d6fb76';
const BUCKET = '636c-cloud1-8gjv5ekx41d6fb76-1385987144';
cloud.init({ env: ENV_ID });

const fileID = (path) => `cloud://${ENV_ID}.${BUCKET}/${path}`;

// 显示名 → CelesTrak GP 查询参数。Guowang(国网) 无专门 GROUP，用按名称查询 NAME=GUOWANG。
const GROUPS = {
  starlink: { query: 'GROUP=starlink', label: 'Starlink' },
  oneweb:   { query: 'GROUP=oneweb',   label: 'OneWeb' },
  kuiper:   { query: 'GROUP=kuiper',   label: 'Kuiper' },              // 亚马逊 Amazon Leo/Kuiper（LEO 宽带）
  gps:      { query: 'GROUP=gps-ops',  label: 'GPS' },
  beidou:   { query: 'GROUP=beidou',   label: '北斗 BeiDou' },
  galileo:  { query: 'GROUP=galileo',  label: 'Galileo' },
  qianfan:  { query: 'GROUP=qianfan',  label: '千帆星座 Qianfan' },
  guowang:  { query: 'NAME=HULIANWANG', label: '中国星网 Guowang' }, // 中国星网/互联网低轨真实星名为 HULIANWANG；GUOWANG 仅 4 个测试星
  geo:      { query: 'GROUP=geo',      label: 'GEO 地球静止' },
  glonass:    { query: 'GROUP=glo-ops',      label: 'GLONASS' },      // 俄 GNSS（MEO，星名 COSMOS）
  o3b:        { query: 'NAME=O3B',           label: 'O3b' },          // SES O3b/mPOWER（MEO 通信）；无 GROUP，按名称查
  iridium:    { query: 'GROUP=iridium-NEXT', label: '铱星 Iridium' }, // 铱星 NEXT（LEO 通信）
  globalstar: { query: 'GROUP=globalstar',   label: 'Globalstar' },   // Globalstar（LEO 通信）
  stations:   { query: 'GROUP=stations',     label: '空间站' },       // ISS/天宫 等空间站
  planet:     { query: 'GROUP=planet',       label: 'Planet' },       // Planet Labs Flock/SkySat（对地遥感）
  spire:      { query: 'GROUP=spire',        label: 'Spire' }         // Spire Lemur（气象/AIS/ADS-B 遥感）
};

const CELESTRAK_HOST = 'celestrak.org';
const MAIN_KEYS = Object.keys(GROUPS).filter((k) => k !== 'starlink'); // 主集合：除 starlink 外全部

// 部分大 LEO 组在 CelesTrak 有「运营商补充星历」端点(sup-gp.php)，限流与主端点(gp.php)互相独立。
// 主端点 403「未更新」/失败时转打此端点，让手动播种即使在服务器 IP 已被限流时仍能成功。值=FILE 参数。
const SUP_FILE = { starlink: 'starlink', oneweb: 'oneweb', kuiper: 'kuiper', planet: 'planet', iridium: 'iridium', gps: 'gps' };

function httpsGetText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'SatLinkBudget-MiniProgram/1.0 (TLE constellation map)',
        // 启用压缩：境外大文件(如 Starlink 1.5MB)压缩后 ~300KB，下载快数倍，避免 60s 超时
        'Accept-Encoding': 'gzip, deflate'
      },
      timeout: 25000
    }, (res) => {
      // 跟随一次重定向（CelesTrak 偶有 301/302）
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(httpsGetText(res.headers.location));
      }
      if (res.statusCode !== 200) {
        // CelesTrak 对“数据自上次下载后未更新”的重复请求返回 403 提示页 -> 视为未更新（非失败）
        let b = '';
        res.on('data', (c) => { b += c; });
        res.on('end', () => {
          if (res.statusCode === 403 && /not updated/i.test(b)) return reject(new Error('NOT_MODIFIED'));
          reject(new Error(`HTTP ${res.statusCode}${b ? '：' + b.slice(0, 80).replace(/\s+/g, ' ') : ''}`));
        });
        return;
      }
      // 按响应的 content-encoding 解压（不支持时服务器返回原文，无 encoding 头）
      const enc = (res.headers['content-encoding'] || '').toLowerCase();
      let stream = res;
      if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
      else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      stream.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
  });
}

// 带 1 次重试（处理 CelesTrak 偶发请求超时）；“未更新”不重试，直接上抛
async function httpsGetTextRetry(url) {
  try {
    return await httpsGetText(url);
  } catch (e) {
    if (e.message === 'NOT_MODIFIED') throw e;
    return await httpsGetText(url);
  }
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

// CelesTrak OMM CSV(FORMAT=csv) -> 精简名单 [{ name, noradId }]（仅供计数与索引重建用；
// 完整根数以原始 csv 文本整体存入云存储信封，前端解析）。按表头列名定位，编号取完整 NORAD_CAT_ID。
function parseOMMNames(text) {
  const lines = text.split(/\r?\n/);
  let h = 0;
  while (h < lines.length && !lines[h].trim()) h++;
  if (h >= lines.length) return [];
  const header = splitCsvLine(lines[h]).map((s) => s.trim().toUpperCase());
  const col = {};
  for (let i = 0; i < header.length; i++) col[header[i]] = i;
  const iName = 'OBJECT_NAME' in col ? col.OBJECT_NAME : -1;
  const iId = 'NORAD_CAT_ID' in col ? col.NORAD_CAT_ID : -1;
  if (iId < 0) return []; // 关键列缺失（非 OMM CSV / 错误提示文本）
  const g = (f, i) => (i >= 0 && i < f.length ? f[i].trim() : '');
  const names = [];
  for (let r = h + 1; r < lines.length; r++) {
    if (!lines[r].trim()) continue;
    const f = splitCsvLine(lines[r]);
    const noradId = g(f, iId);
    if (!noradId) continue;
    names.push({ name: g(f, iName) || `NORAD ${noradId}`, noradId });
  }
  return names;
}

function uploadJSON(cloudPath, obj) {
  return cloud.uploadFile({
    cloudPath,
    fileContent: Buffer.from(JSON.stringify(obj), 'utf8')
  });
}

async function refreshGroup(key) {
  const g = GROUPS[key];
  if (!g) throw new Error(`未知分组：${key}`);
  const primary = `https://${CELESTRAK_HOST}/NORAD/elements/gp.php?${g.query}&FORMAT=csv`;
  const sup = SUP_FILE[key]
    ? `https://${CELESTRAK_HOST}/NORAD/elements/supplemental/sup-gp.php?FILE=${SUP_FILE[key]}&FORMAT=csv`
    : null;
  const t0 = Date.now();
  let text, source = primary;
  try {
    text = await httpsGetTextRetry(primary);
  } catch (e) {
    // 主端点 403「未更新」/失败 -> 有补充源就转打独立限流的补充星历端点（破服务器 IP 被限流时的播种死锁）
    if (sup) {
      console.log(`[fetchTLE] ${key} 主端点 ${e.message}，改打补充星历 sup-gp.php`);
      try {
        text = await httpsGetTextRetry(sup);
        source = sup;
      } catch (e2) {
        if (e.message === 'NOT_MODIFIED' || e2.message === 'NOT_MODIFIED') {
          console.log(`[fetchTLE] ${key} 主端点未更新且补充端点不可用，沿用现有云存储数据`);
          return { group: key, notModified: true };
        }
        throw e2;
      }
    } else {
      if (e.message === 'NOT_MODIFIED') {
        console.log(`[fetchTLE] ${key} 未更新，沿用现有云存储数据`);
        return { group: key, notModified: true };
      }
      throw e;
    }
  }
  console.log(`[fetchTLE] ${key} 下载完成：${(text.length / 1024).toFixed(0)}KB / ${Date.now() - t0}ms（${source === sup ? '补充星历' : '主端点'}）`);

  // CelesTrak 查询失败会返回纯文本提示（如 "Invalid query" / "No GP data found"）；
  // 有效 OMM CSV 第一行表头必含 NORAD_CAT_ID。
  if (!/NORAD_CAT_ID/i.test(text)) {
    throw new Error(`无有效 OMM CSV（返回："${text.slice(0, 80).replace(/\s+/g, ' ')}"）`);
  }

  const names = parseOMMNames(text);
  if (names.length === 0) throw new Error('解析后卫星数为 0');

  const fetchedAt = new Date().toISOString();

  // 单文件信封存储：完整根数以原始 CSV 文本整体存入（CDN 下行最省），前端解析。含 starlink；
  // 不切块，避免一次调用做十几次云存储 IO 叠加超时。放 OMM 独立命名空间 celestrak/omm/*。
  await uploadJSON(`celestrak/omm/${key}.json`, {
    group: key, label: g.label, source, fetchedAt, count: names.length, csv: text
  });
  // 精简名单文件（仅名称+编号，供跨分组索引重建用）
  await uploadJSON(`celestrak/omm/_names_${key}.json`, { group: key, label: g.label, fetchedAt, names });

  return { group: key, count: names.length };
}

// 下载并解析云存储 JSON（云函数侧）；不存在返回 null
async function downloadJSON(path) {
  try {
    const r = await cloud.downloadFile({ fileID: fileID(path) });
    return JSON.parse(r.fileContent.toString('utf8'));
  } catch (e) {
    return null;
  }
}

// 从所有已保存的 _names_<group>.json 重建跨分组索引 _index.json，并同步刷新 manifest.json
// （manifest 供前端众包 ensureTLEFresh 判断各组新鲜度，~1KB）。
async function rebuildIndex() {
  const keys = Object.keys(GROUPS);
  const datas = await Promise.all(keys.map((k) => downloadJSON(`celestrak/omm/_names_${k}.json`)));
  const index = [];
  const groups = {};
  keys.forEach((k, i) => {
    const d = datas[i];
    if (!d || !d.names) return;
    for (let j = 0; j < d.names.length; j++) index.push({ name: d.names[j].name, noradId: d.names[j].noradId, group: k });
    groups[k] = { fetchedAt: d.fetchedAt, count: d.names.length };
  });
  await uploadJSON('celestrak/omm/_index.json', { builtAt: new Date().toISOString(), count: index.length, sats: index });
  await uploadJSON('celestrak/omm/manifest.json', { updatedAt: new Date().toISOString(), groups });
  return index.length;
}

// 决定本次运行刷新哪些分组：event.group 指定单组；否则跑主集合（除 starlink 外全部）。
function pickKeys(event) {
  if (event && event.group) return [event.group];
  return MAIN_KEYS;
}

exports.main = async (event) => {
  const keys = pickKeys(event);
  const results = await Promise.all(keys.map(async (key) => {
    try {
      const r = await refreshGroup(key);
      if (!r.notModified) console.log(`[fetchTLE] ${key} 完成：${r.count} 颗`);
      return { ...r, success: true };
    } catch (err) {
      console.error(`[fetchTLE] ${key} 失败：`, err.message);
      return { group: key, success: false, errMsg: err.message };
    }
  }));

  // 重建跨分组索引 + manifest。starlink 单独运行时跳过（省时间、确保 starlink 压进 60s）；
  // 索引由跑主集合的 {} 重建，会读取 starlink 上次保存的 _names_starlink.json。
  const starlinkOnly = keys.length === 1 && keys[0] === 'starlink';
  let indexCount = -1;
  if (!starlinkOnly) {
    try {
      indexCount = await rebuildIndex();
      console.log(`[fetchTLE] 索引重建：${indexCount} 条`);
    } catch (e) {
      console.error('[fetchTLE] 索引重建失败：', e.message);
    }
  }

  return {
    success: results.every((r) => r.success),
    updatedAt: new Date().toISOString(),
    indexCount,
    results
  };
};

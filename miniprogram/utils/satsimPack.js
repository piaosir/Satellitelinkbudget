// 仿真平台密钥导入（配置页与频率计划页共用）。
//
// 一个密钥 = 一个包，包里可以装多件：
//   { kind:'satsim-pack', v:1, from, ts, expiresAt, name,
//     items:[ {type:'lb-config', name, mod, config},
//             {type:'freq-plan', name, meta, draw, chs, beams, los, alloc, xlsx},
//             {type:'sat-set',   name, setId, src, epochMode, count, sats:[OMM记录]},
//             {type:'traj',      name, tid, kind, n, n0?, pts:[[lon,lat]], style, cruiseAltM?} ] }
//
// 通道与「卫星覆盖」的密钥导入是同一条：云函数 importGxtSnapshot 按密钥从平台约定的 COS 公读地址
// 拉取，内联返回。故一个密钥在哪个入口输都能认出来 —— 包里有什么就落什么，两个入口共用本文件。
//
// ★ 单向。小程序侧的配置是扁平的（没有平台那三个全局资源库），回传无法还原引用闭包。
//   导进来之后它与用户自建的配置无差别，现有的分享码 / 批量分享照常可用。
//
// ★★ 两边算出来的数会不一样。平台这一年修了 14 项科学性问题（云噪入 T_sys、XPD 标度、
//   P.618 §8 全链路…），本小程序没有跟进。故平台把它算出的结果随配置带了过来，配置详情里
//   显示的是【平台计算值】；用户在本地点一次「计算」后就换成本地引擎的值。不做静默对齐。

const FP_INDEX_KEY = 'fpPlanIds';
const FP_PLAN_KEY = (id) => 'fpPlan_' + id;
const FP_DRAW_KEY = (id) => 'fpDraw_' + id;
const FP_XLSX_KEY = (id) => 'fpXlsx_' + id;

// 卫星集（平台的卫星组 / 自定义卫星 / 自定义星座）：星座地图分组列表里的一行。
// 同频率计划一样分键存 —— 一份几百颗星就是几十上百 KB，攒几份即越过微信单键 1 MB 上限。
const SS_INDEX_KEY = 'satsimSetIds';
const SS_KEY = (id) => 'satsimSet_' + id;
// 「刚导入的那一份」：星座地图据此把它选成本次的默认星座。
// ★ 必须是持久标志位而不是 importSatSets 的返回值 —— 后台自动同步落地时星座地图多半没打开，
//   回值当场就没人接；下次进图要仍然能知道「有新东西进来了」。取走即清（takeFreshSet）。
const SS_FRESH_KEY = 'satsimSetFresh';

// 航迹（平台标记层的航行 / 飞行航迹）：「卫星覆盖」页的航迹层。一条一键（一条上千航点就是几十 KB）。
const TJ_INDEX_KEY = 'satsimTrajIds';
const TJ_KEY = (id) => 'satsimTraj_' + id;
const TJ_SHOWN_KEY = 'satsimTrajShown';   // 当前显示中的航迹 id（勾选状态跨会话保留）
// 刚导入的那几条：「卫星覆盖」页据此把它们打开并定位过去。同卫星集，必须是持久标志位 ——
// 后台同步落地时覆盖页多半没开着，下次进页要仍然知道「有新航迹进来了」。取走即清（takeFreshTrajs）。
const TJ_FRESH_KEY = 'satsimTrajFresh';

// 密钥归一：去分隔符、大写。字母表 A-Z2-9（去 I L O 0 1），长度 8 —— 与云函数、平台同口径。
function normalizeKey(raw) {
  return String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

/** 按密钥取包。失败一律 reject(Error)，errMsg 直接可展示。 */
function fetchPack(rawKey) {
  const key = normalizeKey(rawKey);
  if (!/^[A-Z0-9]{8}$/.test(key)) return Promise.reject(new Error('请输入 8 位密钥'));
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'importGxtSnapshot',
      data: { key: key },
      success: (res) => {
        const r = res && res.result;
        if (!r || !r.success || !r.data) { reject(new Error((r && r.errMsg) || '导入失败')); return; }
        if (r.data.kind !== 'satsim-pack') {
          reject(new Error('这个密钥装的是卫星覆盖快照，请到「工具栏 → 卫星覆盖 → 导入」输入。'));
          return;
        }
        resolve({ key: key, pack: r.data, meta: r.meta || {} });
      },
      fail: (err) => reject(new Error('调用云函数失败：' + ((err && err.errMsg) || '未知错误')))
    });
  });
}

const itemsOf = (pack, type) => (pack && Array.isArray(pack.items) ? pack.items : []).filter((it) => it && it.type === type);

/** 包内清单的一句话（导入前的确认弹窗用） */
function describePack(pack) {
  const n1 = itemsOf(pack, 'lb-config').length;
  const n2 = itemsOf(pack, 'freq-plan').length;
  const n3 = itemsOf(pack, 'sat-set').length;
  const n4 = itemsOf(pack, 'traj').length;
  const parts = [];
  if (n1) parts.push(n1 + ' 份链路配置');
  if (n2) parts.push(n2 + ' 份频率计划');
  if (n3) parts.push(n3 + ' 份星座');
  if (n4) parts.push(n4 + ' 条航迹');
  return parts.join(' · ') || '空包';
}

const trajTag = (it) => it.label || (it.kind === 'flight' ? '飞行航迹' : '航行航迹');

/** 包内清单的逐条明细（确认弹窗的正文） */
function listPack(pack) {
  const lines = (pack && Array.isArray(pack.items) ? pack.items : []).map((it) => {
    const tag = it.type === 'lb-config' ? (it.mod || 'GEO')
      : it.type === 'sat-set' ? (it.src || '星座')
        : it.type === 'traj' ? trajTag(it) : '频率计划';
    return '· [' + tag + '] ' + (it.name || '未命名');
  });
  if (lines.length > 8) return lines.slice(0, 8).join('\n') + '\n… 共 ' + lines.length + ' 件';
  return lines.join('\n');
}

// ============================================================================
// 链路配置：落进「我的配置」
// ============================================================================
// 落地那一段与既有的分享码导入（configs.js 的 importFromBase64）同款：优先上云，失败回退本地。
// configManager 的 save 不做字段白名单，整块 satelliteParams / linkParams 原样落库，故零改动。

// srcId = 这一条链路在平台侧的稳定身份（见平台 shared/lbMiniExport.js 的 miniConfigItem）。
// 有它就走 syncSave（云函数按 srcId 覆盖），没有就退回 save（新增）。
// ★ 这是自动同步能成立的前提：平台改一次内容重新投递，手机上是【覆盖那一份】而不是多堆一份。
function saveOneConfig(cfg, srcId) {
  return new Promise((resolve) => {
    wx.cloud.callFunction({
      name: 'configManager',
      data: {
        action: srcId ? 'syncSave' : 'save',
        data: {
          srcId: srcId || '',
          configName: cfg.configName,
          satelliteParams: cfg.satelliteParams,
          linkParams: cfg.linkParams,
          calculationResults: cfg.calculationResults || {},
          noiseRatioMode: cfg.noiseRatioMode || 'ebno',
          markedParams: cfg.markedParams || [],
          highlightedRows: cfg.highlightedRows || []
        }
      },
      success: (res) => resolve(!!(res.result && res.result.success)),
      fail: () => resolve(false)
    });
  });
}

// 本地兜底那一份也要幂等：云函数调不通时走这里，若同样不按 srcId 覆盖，
// 断网期间每同步一次就多堆一份，联网后云端是对的、本地是一堆重复。
function saveConfigLocal(cfg, srcId) {
  const list = wx.getStorageSync('savedConfigs') || [];
  const row = {
    _id: 'satsim_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    srcId: srcId || '',
    configName: cfg.configName,
    satelliteParams: cfg.satelliteParams,
    linkParams: cfg.linkParams,
    calculationResults: cfg.calculationResults || {},
    noiseRatioMode: cfg.noiseRatioMode || 'ebno',
    markedParams: cfg.markedParams || [],
    highlightedRows: cfg.highlightedRows || [],
    createTime: new Date(),
    updateTime: new Date(),
    isLocal: true
  };
  const at = srcId ? list.findIndex((x) => x && x.srcId === srcId) : -1;
  if (at >= 0) { row._id = list[at]._id; row.createTime = list[at].createTime || row.createTime; list[at] = row; }
  else list.unshift(row);
  wx.setStorageSync('savedConfigs', list);
}

/**
 * 把包里的链路配置逐份落地。返回 { total, cloud, local }。
 * 名字统一冠「[平台]」前缀，与用户自建的分得开（同既有导入的「[导入]」口径）。
 */
async function importConfigs(pack) {
  const items = itemsOf(pack, 'lb-config');
  let cloud = 0, local = 0;
  for (const it of items) {
    const c = it.config;
    if (!c || !c.satelliteParams || !c.linkParams) continue;
    const cfg = Object.assign({}, c, { configName: '[平台] ' + (c.configName || it.name || '配置') });
    // eslint-disable-next-line no-await-in-loop
    const okCloud = await saveOneConfig(cfg, it.srcId || '');
    if (okCloud) cloud++;
    else { saveConfigLocal(cfg, it.srcId || ''); local++; }
  }
  return { total: items.length, cloud: cloud, local: local };
}

// ============================================================================
// 频率计划：落进本地存储（只读）
// ============================================================================
// 分键存（规避单键 1 MB）：索引一条、明细一条、绘制指令一条。同一份计划重发即按平台侧的
// 计划 id 覆盖 —— 不然改一次重发一次就多出一条同名的。

function readPlanIndex() {
  const v = wx.getStorageSync(FP_INDEX_KEY);
  return Array.isArray(v) ? v : [];
}
function writePlanIndex(list) { wx.setStorageSync(FP_INDEX_KEY, list); }

function importPlans(pack) {
  const items = itemsOf(pack, 'freq-plan');
  if (!items.length) return { total: 0, added: 0, replaced: 0 };
  const index = readPlanIndex();
  let added = 0, replaced = 0;
  for (const it of items) {
    const meta = it.meta || {};
    const id = String(meta.id || ('fp' + Date.now() + Math.floor(Math.random() * 1000)));
    const row = {
      id: id,
      name: it.name || meta.name || '频率计划',
      satName: meta.satName || '',
      band: meta.band || '',
      summary: meta.summary || '',
      transponders: meta.transponders || 0,
      beams: meta.beams || 0,
      from: pack.from || '',
      ts: Date.now()
    };
    wx.setStorageSync(FP_PLAN_KEY(id), {
      meta: meta, chs: it.chs || [], beams: it.beams || [], los: it.los || [], alloc: it.alloc || null
    });
    wx.setStorageSync(FP_DRAW_KEY(id), it.draw || null);
    // Excel 数据表的表模型：与绘制指令同理另存一键。它只在「导出数据表」那一下才读，
    // 跟着明细一起存会把那一条撑到接近单键上限（一条载波一行、一行二十来格）。
    wx.setStorageSync(FP_XLSX_KEY(id), it.xlsx || null);
    const at = index.findIndex((x) => x && x.id === id);
    if (at >= 0) { index[at] = row; replaced++; } else { index.unshift(row); added++; }
  }
  writePlanIndex(index);
  return { total: items.length, added: added, replaced: replaced };
}

function loadPlan(id) {
  const p = wx.getStorageSync(FP_PLAN_KEY(id));
  return p && p.meta ? p : null;
}
function loadDraw(id) { return wx.getStorageSync(FP_DRAW_KEY(id)) || null; }
// 早于「导出数据表」那一版导入的计划没有这一件 —— 返回 null，由调用方提示重新导入，
// 不在这边现造一份（造出来的就是第二份真相，见本文件头）
function loadXlsx(id) { return wx.getStorageSync(FP_XLSX_KEY(id)) || null; }

function removePlan(id) {
  wx.removeStorageSync(FP_PLAN_KEY(id));
  wx.removeStorageSync(FP_DRAW_KEY(id));
  wx.removeStorageSync(FP_XLSX_KEY(id));
  writePlanIndex(readPlanIndex().filter((x) => x && x.id !== id));
}

function renamePlan(id, name) {
  const list = readPlanIndex();
  const row = list.find((x) => x && x.id === id);
  if (!row) return false;
  row.name = name;
  writePlanIndex(list);
  return true;
}

// ============================================================================
// 卫星集：落进本地存储，供「星座地图」当一个分组直接渲染
// ============================================================================
// 一份 = 平台侧的一个卫星组 / 一个导入星历组 / 一座自定义星座，内容是 OMM 根数本身，
// 星座地图照 omm2satrec 建 satrec 就能画 —— 不走 CelesTrak，也不需要那份 5MB 的全集。
//
// ★ 幂等按平台给的 setId 覆盖（同频率计划按 meta.id）：平台那边改一次重发，这边是【覆盖那一份】，
//   不是每同步一次就在分组列表里多堆一行同名的。
// ★★ 看到的是【发送那一刻】的根数。真实目录星的历元会随时间变旧，要新的就让平台重发。
//    这一点没法在本地补救：这批星里的自定义卫星/合成星根本不在 CelesTrak 目录里，无从刷新。

const ssId = (s) => String(s == null ? '' : s).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48);

function readSetIndex() {
  const v = wx.getStorageSync(SS_INDEX_KEY);
  return Array.isArray(v) ? v.filter((x) => x && x.id) : [];
}
function writeSetIndex(list) { wx.setStorageSync(SS_INDEX_KEY, list); }

/**
 * 把包里的卫星集逐份落地。返回 { total, added, replaced, failed, newest }。
 * failed 计的是「存不下 / 没有一颗可用根数」的件；存不下时把刚写的那一键撤掉，不留孤儿。
 */
function importSatSets(pack) {
  const items = itemsOf(pack, 'sat-set');
  if (!items.length) return { total: 0, added: 0, replaced: 0, failed: 0, newest: '' };
  const index = readSetIndex();
  let added = 0, replaced = 0, failed = 0, newest = '';
  for (const it of items) {
    // 缺历元/平均运动的记录构不出 satrec，进来只会在 _ingest 里被静默跳过 —— 在这里就滤掉，
    // 免得列表上写着 200 颗、图上只有 180 颗。
    const sats = (Array.isArray(it.sats) ? it.sats : []).filter((s) => s && s.noradId && s.epoch && s.meanMotion);
    if (!sats.length) { failed++; continue; }
    const id = ssId(it.setId) || ('ss' + Date.now() + Math.floor(Math.random() * 1000));
    try {
      wx.setStorageSync(SS_KEY(id), { sats: sats });
    } catch (e) {
      try { wx.removeStorageSync(SS_KEY(id)); } catch (e2) { /* 没写进去就没得删 */ }
      console.error('[satsimPack] 卫星集存不下：', it.name, e);
      failed++;
      continue;
    }
    const row = {
      id: id,
      name: it.name || '导入星座',
      count: sats.length,
      src: it.src || '',
      epochMode: it.epochMode || 'file',
      from: pack.from || '',
      ts: Date.now()
    };
    const at = index.findIndex((x) => x.id === id);
    if (at >= 0) { index[at] = row; replaced++; } else { index.unshift(row); added++; }
    newest = id;
  }
  try {
    writeSetIndex(index);
  } catch (e) {
    console.error('[satsimPack] 卫星集索引写不下：', e);
    return { total: items.length, added: 0, replaced: 0, failed: items.length, newest: '' };
  }
  if (newest) { try { wx.setStorageSync(SS_FRESH_KEY, newest); } catch (e) { /* 只影响「自动选中新的那份」 */ } }
  return { total: items.length, added: added, replaced: replaced, failed: failed, newest: newest };
}

/** 某份卫星集的根数（不存在返回空数组） */
function loadSetSats(id) {
  const v = wx.getStorageSync(SS_KEY(ssId(id)));
  return (v && Array.isArray(v.sats)) ? v.sats : [];
}

function removeSet(id) {
  const i = ssId(id);
  try { wx.removeStorageSync(SS_KEY(i)); } catch (e) { /* 清不掉只是占地方 */ }
  writeSetIndex(readSetIndex().filter((x) => x.id !== i));
  if (wx.getStorageSync(SS_FRESH_KEY) === i) { try { wx.removeStorageSync(SS_FRESH_KEY); } catch (e) {} }
}

function renameSet(id, name) {
  const nm = String(name == null ? '' : name).trim();
  if (!nm) return false;
  const list = readSetIndex();
  const row = list.find((x) => x.id === ssId(id));
  if (!row) return false;
  row.name = nm;
  writeSetIndex(list);
  return true;
}

/** 取走「刚导入的那一份」的 id（取一次即清）。没有新导入返回空串。 */
function takeFreshSet() {
  const v = wx.getStorageSync(SS_FRESH_KEY);
  if (!v) return '';
  try { wx.removeStorageSync(SS_FRESH_KEY); } catch (e) { /* 清不掉会多选中一次，无害 */ }
  const id = ssId(v);
  return readSetIndex().some((x) => x.id === id) ? id : '';
}

// ============================================================================
// 航迹：落进本地存储，供「卫星覆盖」页的航迹层绘制
// ============================================================================
// 一件 = 平台标记层的一条航行 / 飞行航迹：航点（WGS-84，[lon, lat]）+ 平台解析好的样式（线色 / 线型 /
// 圆点 / 载具图标 / 航迹名）。怎么连（大圆）、怎么偏（GCJ-02）、怎么切（±180°）是覆盖页的事，这里只管存取。
//
// ★ 幂等按平台给的 tid 覆盖：平台改一条重发一条，这边覆盖那一条，不堆同名的。
// ★★ 手机上改过名的钉住（nameLocal）：平台重发只更新航点与样式，名字以用户在这边起的为准。

function readIds(key) {
  const v = wx.getStorageSync(key);
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : [];
}
function writeIds(key, ids) {
  const seen = {};
  wx.setStorageSync(key, (ids || []).filter((x) => x && !seen[x] && (seen[x] = true)));
}

function readTrajIndex() {
  const v = wx.getStorageSync(TJ_INDEX_KEY);
  return Array.isArray(v) ? v.filter((x) => x && x.id) : [];
}
function writeTrajIndex(list) { wx.setStorageSync(TJ_INDEX_KEY, list); }

// 航点归一：[lon, lat] 两个有限数、纬度在 ±90 内，经度折回 [−180, 180]。坏点逐个丢，不整条作废
function cleanPts(raw) {
  const out = [];
  for (const p of (Array.isArray(raw) ? raw : [])) {
    if (!Array.isArray(p) || p.length < 2) continue;
    let lon = Number(p[0]);
    const lat = Number(p[1]);
    if (!isFinite(lon) || !isFinite(lat) || lat < -90 || lat > 90) continue;
    if (lon > 180 || lon < -180) lon = ((lon + 180) % 360 + 360) % 360 - 180;
    out.push([lon, lat]);
  }
  return out;
}

/**
 * 把包里的航迹逐条落地。返回 { total, added, replaced, failed, ids }（ids = 本次落地的那几条）。
 * failed 计的是「一个有效航点都没有 / 存不下」的件；存不下时把刚写的那一键撤掉，不留孤儿。
 */
function importTrajs(pack) {
  const items = itemsOf(pack, 'traj');
  if (!items.length) return { total: 0, added: 0, replaced: 0, failed: 0, ids: [] };
  const index = readTrajIndex();
  let added = 0, replaced = 0, failed = 0;
  const ids = [];
  for (const it of items) {
    const pts = cleanPts(it.pts);
    if (!pts.length) { failed++; continue; }
    const id = ssId(it.tid) || ('tj' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36));
    const kind = it.kind === 'flight' ? 'flight' : 'sea';
    const body = { kind: kind, pts: pts, style: (it.style && typeof it.style === 'object') ? it.style : {} };
    if (Number(it.n0) > pts.length) body.n0 = Number(it.n0);
    if (kind === 'flight' && Number(it.cruiseAltM) > 0) body.cruiseAltM = Number(it.cruiseAltM);
    try {
      wx.setStorageSync(TJ_KEY(id), body);
    } catch (e) {
      try { wx.removeStorageSync(TJ_KEY(id)); } catch (e2) { /* 没写进去就没得删 */ }
      console.error('[satsimPack] 航迹存不下：', it.name, e);
      failed++;
      continue;
    }
    const at = index.findIndex((x) => x.id === id);
    const prev = at >= 0 ? index[at] : null;
    const fallback = kind === 'flight' ? '飞行航迹' : '航行航迹';
    const row = {
      id: id,
      name: prev && prev.nameLocal ? prev.name : (String(it.name || '').trim() || fallback),
      nameLocal: !!(prev && prev.nameLocal),
      kind: kind,
      n: pts.length,
      n0: body.n0 || 0,
      color: String((body.style && body.style.line) || ''),
      from: pack.from || '',
      ts: Date.now()
    };
    if (at >= 0) { index[at] = row; replaced++; } else { index.unshift(row); added++; }
    ids.push(id);
  }
  try {
    writeTrajIndex(index);
  } catch (e) {
    console.error('[satsimPack] 航迹索引写不下：', e);
    return { total: items.length, added: 0, replaced: 0, failed: items.length, ids: [] };
  }
  if (ids.length) { try { writeIds(TJ_FRESH_KEY, readIds(TJ_FRESH_KEY).concat(ids)); } catch (e) { /* 只影响「自动打开新到的那几条」 */ } }
  return { total: items.length, added: added, replaced: replaced, failed: failed, ids: ids };
}

/** 某条航迹的内容 { kind, pts:[[lon,lat]], style, n0?, cruiseAltM? }（不存在返回 null） */
function loadTraj(id) {
  const v = wx.getStorageSync(TJ_KEY(ssId(id)));
  return v && Array.isArray(v.pts) ? v : null;
}

function removeTraj(id) {
  const i = ssId(id);
  try { wx.removeStorageSync(TJ_KEY(i)); } catch (e) { /* 清不掉只是占地方 */ }
  writeTrajIndex(readTrajIndex().filter((x) => x.id !== i));
  writeIds(TJ_SHOWN_KEY, readIds(TJ_SHOWN_KEY).filter((x) => x !== i));
  writeIds(TJ_FRESH_KEY, readIds(TJ_FRESH_KEY).filter((x) => x !== i));
}

function renameTraj(id, name) {
  const nm = String(name == null ? '' : name).trim();
  if (!nm) return false;
  const list = readTrajIndex();
  const row = list.find((x) => x.id === ssId(id));
  if (!row) return false;
  row.name = nm;
  row.nameLocal = true;
  writeTrajIndex(list);
  return true;
}

/** 取走「刚导入的那几条」的 id（取一次即清；已被移除的不算） */
function takeFreshTrajs() {
  const v = readIds(TJ_FRESH_KEY);
  if (!v.length) return [];
  try { wx.removeStorageSync(TJ_FRESH_KEY); } catch (e) { /* 清不掉会多打开一次，无害 */ }
  const alive = {};
  for (const x of readTrajIndex()) alive[x.id] = true;
  return v.filter((id) => alive[id]);
}

/** 显示中的航迹 id（只留还在索引里的） */
function readTrajShown() {
  const alive = {};
  for (const x of readTrajIndex()) alive[x.id] = true;
  return readIds(TJ_SHOWN_KEY).filter((id) => alive[id]);
}
function writeTrajShown(ids) { writeIds(TJ_SHOWN_KEY, ids); }

// —— 手机上手绘的航迹（「卫星覆盖」页 → 航迹 →「＋航行 / ＋飞行」）——
// 与平台发来的同一套存储（索引 + 一条一键），行上记 local:true。平台发来的那几条在手机上接着画、改点
// 也走这里（saveTraj）；平台重发同一条照旧整条覆盖（见 importTrajs），名字按 nameLocal 钉住。

/** 新航迹的自动名：同类顺序编号、不与现有名撞车（平台 trajAutoName 同一条规则：从「总条数 + 1」起数） */
function trajAutoName(kind) {
  const base = kind === 'flight' ? '飞行' : '航行';
  const list = readTrajIndex();
  const used = {};
  for (const x of list) used[String(x.name || '')] = true;
  let i = list.length + 1;
  while (used[base + i]) i++;
  return base + i;
}

/** 手绘航迹的 id：'lt' 打头（平台的航迹 id 是 'm' 打头），字符集守 ssId */
function newLocalTrajId() {
  return 'lt' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

/**
 * 写回一条航迹（手绘新建 / 接着画 / 改点 / 改色）：索引行与本体一起落，不在索引里的作为手绘航迹插到最前。
 * 先写索引、后写本体：本体（上千航点几十 KB）写不进去时把索引退回原样 —— 两边不会一新一旧。
 * n0 不再带：航点在这边动过，「平台抽稀前多少点」就不是这条航迹的读数了。
 * @param {object} t { id, name, kind, pts:[[lon,lat]], style, cruiseAltM? }
 * @returns {object} 落下的索引行；存不下抛错（调用方提示，手上的编辑不丢）
 */
function saveTraj(t) {
  const id = ssId(t && t.id);
  if (!id) throw new Error('航迹缺少 id');
  const kind = t.kind === 'flight' ? 'flight' : 'sea';
  const style = (t.style && typeof t.style === 'object') ? t.style : {};
  const body = { kind: kind, pts: cleanPts(t.pts), style: style };
  if (kind === 'flight' && Number(t.cruiseAltM) > 0) body.cruiseAltM = Number(t.cruiseAltM);
  const index = readTrajIndex();
  const at = index.findIndex((x) => x.id === id);
  const prev = at >= 0 ? index[at] : null;
  const row = {
    id: id,
    name: String(t.name || '').trim() || (prev && prev.name) || (kind === 'flight' ? '飞行航迹' : '航行航迹'),
    nameLocal: !!(prev && prev.nameLocal),
    kind: kind,
    n: body.pts.length,
    n0: 0,
    color: String(style.line || ''),
    from: prev ? (prev.from || '') : '',
    local: prev ? !!prev.local : true,
    ts: Date.now()
  };
  const next = index.slice();
  if (at >= 0) next[at] = row; else next.unshift(row);
  writeTrajIndex(next);
  try {
    wx.setStorageSync(TJ_KEY(id), body);
  } catch (e) {
    try { writeTrajIndex(index); } catch (e2) { /* 退不回去：索引多一行 / 读数旧一拍，本体还是上一版，能读 */ }
    throw e;
  }
  return row;
}

/** 没有航点的残行（手绘到一半应用被杀）：进页时清掉。返回清掉的条数 */
function pruneEmptyTrajs() {
  const dead = readTrajIndex().filter((x) => !(x.n > 0));
  for (const x of dead) removeTraj(x.id);
  return dead.length;
}

/**
 * 包里有什么就落什么（见本文件头）：链路配置 / 频率计划 / 卫星集 / 航迹逐类落地。
 * 给「什么都能导」的入口用（我的配置 → 平台密钥、卫星覆盖 → 航迹 → 密钥导入）。
 */
async function importAll(pack) {
  const cfg = await importConfigs(pack);
  return { cfg: cfg, plan: importPlans(pack), set: importSatSets(pack), traj: importTrajs(pack) };
}

// ============================================================================
// 读数：MHz → 屏上。参数（刻度因子 f 与小数位 dec）由平台随包算好送过来，
// 故本地不做任何单位判断 —— 刻度是整份计划的属性，这边再给一个下拉就是第二个真相源。
// ============================================================================
function fmtFreq(mhz, u) {
  if (mhz === null || mhz === undefined || !isFinite(mhz)) return '';
  const f = (u && u.f) || 1;
  const dec = (u && typeof u.dec === 'number') ? u.dec : 2;
  const s = (Number(mhz) / f).toFixed(dec);
  return dec ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}
const fmtFreqU = (mhz, u) => {
  const s = fmtFreq(mhz, u);
  return s === '' ? '—' : s + ' ' + ((u && u.label) || 'MHz');
};

module.exports = {
  normalizeKey: normalizeKey,
  fetchPack: fetchPack,
  describePack: describePack,
  listPack: listPack,
  itemsOf: itemsOf,
  importConfigs: importConfigs,
  importPlans: importPlans,
  readPlanIndex: readPlanIndex,
  loadPlan: loadPlan,
  loadDraw: loadDraw,
  loadXlsx: loadXlsx,
  removePlan: removePlan,
  renamePlan: renamePlan,
  importSatSets: importSatSets,
  readSetIndex: readSetIndex,
  loadSetSats: loadSetSats,
  removeSet: removeSet,
  renameSet: renameSet,
  takeFreshSet: takeFreshSet,
  importTrajs: importTrajs,
  readTrajIndex: readTrajIndex,
  loadTraj: loadTraj,
  removeTraj: removeTraj,
  renameTraj: renameTraj,
  takeFreshTrajs: takeFreshTrajs,
  readTrajShown: readTrajShown,
  writeTrajShown: writeTrajShown,
  trajAutoName: trajAutoName,
  newLocalTrajId: newLocalTrajId,
  saveTraj: saveTraj,
  pruneEmptyTrajs: pruneEmptyTrajs,
  importAll: importAll,
  fmtFreq: fmtFreq,
  fmtFreqU: fmtFreqU
};

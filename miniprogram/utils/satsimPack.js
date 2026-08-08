// 仿真平台密钥导入（配置页与频率计划页共用）。
//
// 一个密钥 = 一个包，包里可以装多件：
//   { kind:'satsim-pack', v:1, from, ts, expiresAt, name,
//     items:[ {type:'lb-config', name, mod, config},
//             {type:'freq-plan', name, meta, draw, chs, beams, los, alloc, xlsx},
//             {type:'sat-set',   name, setId, src, epochMode, count, sats:[OMM记录]} ] }
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
          reject(new Error('这个密钥装的是卫星覆盖快照，请到「可视化工具 → 卫星覆盖 → 导入」输入。'));
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
  const parts = [];
  if (n1) parts.push(n1 + ' 份链路配置');
  if (n2) parts.push(n2 + ' 份频率计划');
  if (n3) parts.push(n3 + ' 份星座');
  return parts.join(' · ') || '空包';
}

/** 包内清单的逐条明细（确认弹窗的正文） */
function listPack(pack) {
  const lines = (pack && Array.isArray(pack.items) ? pack.items : []).map((it) => {
    const tag = it.type === 'lb-config' ? (it.mod || 'GEO') : (it.type === 'sat-set' ? (it.src || '星座') : '频率计划');
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
  fmtFreq: fmtFreq,
  fmtFreqU: fmtFreqU
};

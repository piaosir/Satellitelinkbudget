// 仿真平台绑定 —— 自动同步（设置页、配置页、频率计划页、卫星覆盖页共用）。
//
// 与「密钥导入」（utils/satsimPack.js）的关系：同一条 COS 通道、同一种信封，只是收件方式不同。
//   · 密钥：平台每发一次给一个 8 位一次性密钥，用户手输。给客户 / 临时协作。
//   · 绑定：本机生成一个 12 位【认证码】当长期收件地址，人肉带到平台一次，之后平台一直往里投，
//           本机打开即自动同步。给自己和同事。
//
// ★ 认证码由【小程序端】生成，方向不能反。通道是单向的（平台能写 COS，本端只能经云函数读），
//   若由平台出码让本端扫，平台就永远不知道谁扫了 —— 也就做不到「绑定多个账号、分别投递」。
//
// ★★ 认证码即凭证：知道它的人能往这个账号投东西、也能读到投过来的东西。所以
//   ① 存云端一份（换手机 / 清缓存能找回，否则平台侧会变成一个没人取的死地址且毫不知情）
//   ② 必须留「重置」这条路（重置 = 换收件地址，各平台需重新绑）
//
// ★★★ 幂等：一件内容 = 一条消息，消息 id 由平台侧的稳定身份（配置 srcId / 计划 id）哈希而来。
//   平台改一次重发，落到本端是【覆盖那一份】而不是多堆一份 —— 这是自动同步能成立的前提。

const satsimPack = require('./satsimPack.js');

const KEY_CH = 'satsimCh';             // 本账号的认证码
const KEY_SEEN = 'satsimSeen';         // { <消息id>: 投递时刻 } —— 判「这件同步过没有 / 是不是又变了」
const KEY_GXT = 'satsimGxtInbox';      // 覆盖快照待消化队列的【索引】（由「卫星覆盖」页取走，见本文件末尾）
const GXT_KEY = (id) => 'satsimGxt_' + id;    // 一份快照一键（同 satsimPack 的 fpPlan_*）
const KEY_LAST = 'satsimLastSync';     // 上次同步时刻（节流）
const KEY_PLAT = 'satsimPlatforms';    // 上次看到的平台清单（设置页显示「已连接」）
// 认证码是否已成功备份到云端（见 ensureCh 的 ★★）。
// ★ 键名带 V2 是【故意的】：老版本云函数按 _openid 存取绑定，而云函数是管理端身份、写入不会
//   自动带 _openid（见 cloudfunctions/configManager 的 BIND_COLL 段），于是那边存进去的是一条
//   查不出来的无主记录 —— 老的 satsimChSynced=1 记的是一次【假成功】。沿用旧键的话，已经绑好的
//   那台永远不会补传，云端一直是空的，换机/清缓存照样找不回，这次修复等于没修。
//   换个键名 = 所有设备升级后重新校验一次云端，各自补上该补的那一步。
const KEY_SYNCED = 'satsimChSyncedV2';
const KEY_OTHER = 'satsimChOther';     // 云端记着的另一个码（本机与云端分裂了，见 ensureCh 的 ★★★）
const KEY_PROBE = 'satsimChProbe';     // 上次去云端探过码的时刻（见 recoverCh 的节流）

const CH_LEN = 12;
const CH_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // 去 I L O 0 1，与平台/密钥同源
const MIN_INTERVAL_MS = 60 * 1000;     // 自动同步最小间隔（手动同步不受限）
const MAX_PER_ROUND = 12;              // 一轮最多拉几件，剩下的下一轮 —— 避免首次绑定时一次拉几十件
const PROBE_INTERVAL_MS = 24 * 3600 * 1000;   // 本地无码时，多久去云端探一次
const GXT_MAX = 20;                    // 待消化队列最多囤几份
const GXT_BUDGET = 4 * 1024 * 1024;    // 待消化队列的总字节预算（微信整个 storage 上限 10 MB）

// ============================================================================
// 认证码
// ============================================================================
function normalizeCh(raw) {
  return String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CH_LEN);
}
function isCh(s) {
  const v = normalizeCh(s);
  return v.length === CH_LEN && v.split('').every((c) => CH_ALPHABET.indexOf(c) >= 0);
}
/** 显示成 ABCD-EFGH-JKMN（抄写/核对友好；平台侧粘进去会自动去掉分隔符） */
function fmtCh(s) {
  const v = normalizeCh(s);
  return v ? (v.match(/.{1,4}/g) || []).join('-') : '';
}

// 认证码是长期凭证，优先用 wx.getRandomValues（密码学随机，基础库 2.15.0+）。
// 低版本没有这个接口 → 退回 Math.random：它不是密码学安全的，但这里唯一现实的威胁是【暴力猜】，
// 而 12 位 31 字母表有 ~7.9e17 的空间，够用。取模偏置在 256 % 31 上极小（<0.4%），忽略。
function genCh() {
  return new Promise((resolve) => {
    const fallback = () => {
      let out = '';
      for (let i = 0; i < CH_LEN; i++) out += CH_ALPHABET[Math.floor(Math.random() * CH_ALPHABET.length)];
      resolve(out);
    };
    if (typeof wx.getRandomValues !== 'function') { fallback(); return; }
    try {
      wx.getRandomValues({
        length: CH_LEN,
        success: (res) => {
          try {
            const b = new Uint8Array(res.randomValues);
            let out = '';
            for (let i = 0; i < CH_LEN; i++) out += CH_ALPHABET[b[i] % CH_ALPHABET.length];
            resolve(out.length === CH_LEN ? out : fallback());
          } catch (e) { fallback(); }
        },
        fail: fallback
      });
    } catch (e) { fallback(); }
  });
}

function getCh() {
  const v = normalizeCh(wx.getStorageSync(KEY_CH));
  return isCh(v) ? v : '';
}

function setChLocal(ch) { wx.setStorageSync(KEY_CH, normalizeCh(ch)); }

/** 云端备份（best-effort）：集合不存在 / 没网 / 未登录都静默跳过，只影响「换设备找回」 */
function saveChCloud(ch) {
  return new Promise((resolve) => {
    wx.cloud.callFunction({
      name: 'configManager',
      data: { action: 'saveBinding', data: { ch: ch } },
      success: (res) => resolve(!!(res.result && res.result.success)),
      fail: () => resolve(false)
    });
  });
}
function loadChCloud() {
  return new Promise((resolve) => {
    wx.cloud.callFunction({
      name: 'configManager',
      data: { action: 'loadBinding' },
      success: (res) => {
        const d = res && res.result && res.result.data;
        resolve(d && isCh(d.ch) ? normalizeCh(d.ch) : '');
      },
      fail: () => resolve('')
    });
  });
}

/**
 * 拿到本账号的认证码：本地 → 云端 → 现生成。
 * ★ 云端那一步不能省：用户清过缓存 / 换了手机时，本地是空的但平台侧还记着旧码，
 *   直接生成新码会让所有已绑定的平台变成死地址（且平台侧看不出来）。
 * ★★ 云备份是 best-effort（云函数还没部署 / 没网 / 没登录都会失败），故用 KEY_SYNCED 记一笔，
 *    没成过的每次进来补传一次 —— 否则「首次生成时恰好云函数没部署」会让跨设备找回【永久】失效，
 *    而且毫无征兆：本地一直有码，用着没问题，直到换手机那天才发现找不回来。
 * ★★★ 补传前必须【先读一眼云端】。读到的码与本地不同时，两边都不动：
 *    改本地 = 本机那个码多半已经人肉带到平台上绑好了，改掉就再也收不到；
 *    覆盖云端 = 把另一台（很可能才是平台绑的那台）的码抹掉，往后所有新设备都取到错的那个。
 *    只把云端那个记进 KEY_OTHER，由设置页提示用户「换绑」—— 谁并到谁是用户的决定，不猜。
 */
async function ensureCh() {
  const local = getCh();
  if (local) {
    if (!wx.getStorageSync(KEY_SYNCED)) {
      const cloud = await loadChCloud();
      if (cloud && cloud !== local) {
        // 分裂了。不标 SYNCED：下次进设置页再探一次，云端那边并过来了就能自愈
        wx.setStorageSync(KEY_OTHER, cloud);
      } else if (cloud === local || await saveChCloud(local)) {
        wx.removeStorageSync(KEY_OTHER);
        wx.setStorageSync(KEY_SYNCED, 1);
      }
    }
    return local;
  }
  const cloud = await loadChCloud();
  if (cloud) { setChLocal(cloud); wx.setStorageSync(KEY_SYNCED, 1); return cloud; }
  const born = await genCh();
  setChLocal(born);
  wx.setStorageSync(KEY_SYNCED, (await saveChCloud(born)) ? 1 : '');
  return born;
}

/**
 * 启动路径的轻量找回：本地无码时去云端看一眼，有就采纳。
 * ★ 与 ensureCh 的差别：云端也没有时【不生成】—— 只是开了个小程序的用户不该在云端多一条记录。
 *   生成留给设置页（用户真要绑定时才会去那儿）。
 * ★★ 节流一天一次：从没绑过的用户每次冷启都查一次云端是纯浪费；而另一台新生成的码，
 *    本机最迟一天内自动接上（等不及就进设置页，那条路是立即查的）。
 */
async function recoverCh() {
  const local = getCh();
  if (local) return local;
  const last = Number(wx.getStorageSync(KEY_PROBE) || 0);
  if (Date.now() - last < PROBE_INTERVAL_MS) return '';
  wx.setStorageSync(KEY_PROBE, Date.now());
  const cloud = await loadChCloud();
  if (!cloud) return '';
  setChLocal(cloud);
  wx.setStorageSync(KEY_SYNCED, 1);
  return cloud;
}

/** 云端记着的另一个码（本机与云端分裂时才有值）。设置页据此提示换绑。 */
function otherCh() {
  const v = normalizeCh(wx.getStorageSync(KEY_OTHER));
  return isCh(v) && v !== getCh() ? v : '';
}

/**
 * 换绑：把本机的收件地址改成一个已有的认证码（多半是自己另一台手机上的）。
 * ★ 必须清 KEY_SEEN：消息 id 是 hash(平台id|内容身份)，【与认证码无关】—— 同一份内容投给两个
 *   地址是同一个 id。不清的话换绑后会把新地址里那些「id 见过」的内容当成已同步，直接漏掉。
 */
async function adoptCh(raw) {
  const ch = normalizeCh(raw);
  if (!isCh(ch)) return { ok: false, error: '认证码应为 12 位（在另一台手机的「设置 → 仿真平台绑定」里复制）' };
  if (ch === getCh()) return { ok: true, ch: ch, same: true };
  setChLocal(ch);
  wx.setStorageSync(KEY_SEEN, {});
  wx.setStorageSync(KEY_PLAT, []);
  wx.removeStorageSync(KEY_OTHER);
  wx.setStorageSync(KEY_SYNCED, (await saveChCloud(ch)) ? 1 : '');
  return { ok: true, ch: ch };
}

/** 重置：换一个新收件地址。旧码作废，已绑定的平台需要重新绑。 */
async function resetCh() {
  const born = await genCh();
  setChLocal(born);
  wx.setStorageSync(KEY_SEEN, {});     // 新地址是空的，旧的已同步记录没有意义
  wx.setStorageSync(KEY_PLAT, []);
  wx.removeStorageSync(KEY_OTHER);     // 云端已被这个新码覆盖，分裂提示不再成立
  wx.setStorageSync(KEY_SYNCED, (await saveChCloud(born)) ? 1 : '');
  return born;
}

// ============================================================================
// 拉取
// ============================================================================
function callBox(data) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'importGxtSnapshot',
      data: data,
      success: (res) => {
        const r = res && res.result;
        if (!r || !r.success) { reject(new Error((r && r.errMsg) || '拉取失败')); return; }
        resolve(r.data);
      },
      fail: (err) => reject(new Error('调用云函数失败：' + ((err && err.errMsg) || '未知错误')))
    });
  });
}

/** 清单（轻，几 KB）：{ ch, platforms:[{pid,label,app,lastAt}], msgs:[{id,pid,from,name,kind,ts,bytes,items}] } */
const fetchList = (ch) => callBox({ action: 'box', ch: normalizeCh(ch) });

/** 一件的内容（信封原样） */
const fetchMsg = (ch, pid, mid) => callBox({ action: 'boxMsg', ch: normalizeCh(ch), pid: pid, mid: mid });

// ============================================================================
// 已同步记录
// ============================================================================
function readSeen() {
  const v = wx.getStorageSync(KEY_SEEN);
  return v && typeof v === 'object' ? v : {};
}
function writeSeen(m) { wx.setStorageSync(KEY_SEEN, m); }

// 判「要不要同步这一件」：没见过，或者见过但平台又重发了（ts 变新 = 内容改过）
const isFresh = (m, seen) => !!m && (!seen[m.id] || Number(seen[m.id]) < Number(m.ts || 0));

// ============================================================================
// 覆盖快照的待消化队列
// ============================================================================
// 覆盖快照要合成「波束」才能画，而那段逻辑（_mergeSnapshotToBeamData / _persistBeam）长在
// 卫星覆盖页里、依赖页面状态。后台同步够不着它，也不该把那段逻辑复制一份到这里
// —— 复制出来的就是第二份真相。故这里只排队，由覆盖页 onLoad 时取走消化。
//
// ★ 分键存（同 satsimPack 的频率计划）：索引一键、每份快照一键。原先整队列囤在 KEY_GXT 一个键下，
//   一份快照就有几百 KB，攒几份即越过微信单键 1 MB 上限 —— setStorageSync 当场抛错，这一件不记
//   seen，下一轮重新下载再抛，无限循环烧流量而快照永远到不了覆盖页。
function readGxtIndex() {
  const q = wx.getStorageSync(KEY_GXT);
  return Array.isArray(q) ? q.filter((x) => x && x.id) : [];
}

/** 入队一份快照。返回 false = 没存下（存储满 / 单件仍超上限），由调用方记账。 */
function queueGxt(row, snap) {
  const id = row.id;
  let bytes = 0;
  try {
    const s = JSON.stringify(snap);
    bytes = s.length;
    wx.setStorageSync(GXT_KEY(id), s);
  } catch (e) {
    try { wx.removeStorageSync(GXT_KEY(id)); } catch (e2) { /* 没写进去就没得删 */ }
    console.error('[satsimBox] 覆盖快照存不下：', row.name, e);
    return false;
  }
  const list = readGxtIndex();
  const item = { id: id, name: row.name || snap.name || '覆盖快照', from: row.from || '', ts: row.ts || Date.now(), bytes: bytes };
  const at = list.findIndex((x) => x.id === id);
  if (at >= 0) list[at] = item; else list.push(item);
  // 超份数 / 超总预算时丢最旧的，连它那一键一起删 —— 只删索引会留下永远没人读的孤儿键。
  // 剩最后一份就不再丢：它自己已经写进去了，丢了也腾不出别的空间。
  let total = list.reduce((s, x) => s + (Number(x.bytes) || 0), 0);
  while (list.length > 1 && (list.length > GXT_MAX || total > GXT_BUDGET)) {
    const gone = list.shift();
    total -= Number(gone.bytes) || 0;
    try { wx.removeStorageSync(GXT_KEY(gone.id)); } catch (e) { /* 清不掉只是占地方 */ }
  }
  // 索引写不进去（存储整体满了）就把刚存的那一键撤掉，否则留下一份没人索引得到的孤儿
  try {
    wx.setStorageSync(KEY_GXT, list);
  } catch (e) {
    try { wx.removeStorageSync(GXT_KEY(id)); } catch (e2) { /* 同上 */ }
    console.error('[satsimBox] 覆盖快照索引写不下：', row.name, e);
    return false;
  }
  return true;
}

/** 覆盖页取待消化的快照。内容取不到的 snap 给 null，由覆盖页照空快照吃掉出队。 */
function takeGxtQueue() {
  return readGxtIndex().map((x) => {
    if (x.snap) return x;                       // 分键存之前的老队列，内容就在索引里
    const raw = wx.getStorageSync(GXT_KEY(x.id));
    let snap = null;
    if (raw && typeof raw === 'object') snap = raw;
    else if (typeof raw === 'string' && raw) { try { snap = JSON.parse(raw); } catch (e) { snap = null; } }
    return Object.assign({}, x, { snap: snap });
  });
}
/** 覆盖页消化完某几件后清掉 */
function clearGxtQueue(ids) {
  const drop = new Set(Array.isArray(ids) ? ids : []);
  const rest = readGxtIndex().filter((x) => !drop.has(x.id));
  for (const id of drop) if (id) { try { wx.removeStorageSync(GXT_KEY(id)); } catch (e) { /* 同上 */ } }
  wx.setStorageSync(KEY_GXT, rest);
  return rest;
}

// ============================================================================
// 同步
// ============================================================================
/**
 * 拉一轮。
 * @param {object} opts { force 忽略节流 }
 * @returns {Promise<{ok:boolean, reason?:string, n:number, cfg:number, plan:number, gxt:number,
 *                    left:number, platforms:Array, error?:string}>}
 */
async function syncNow(opts) {
  const force = !!(opts && opts.force);
  const empty = { ok: false, n: 0, cfg: 0, plan: 0, gxt: 0, left: 0, platforms: [] };

  const ch = getCh();
  if (!ch) return Object.assign({}, empty, { reason: 'nobind' });

  const last = Number(wx.getStorageSync(KEY_LAST) || 0);
  if (!force && Date.now() - last < MIN_INTERVAL_MS) return Object.assign({}, empty, { ok: true, reason: 'throttled' });

  let list;
  try {
    list = await fetchList(ch);
  } catch (e) {
    return Object.assign({}, empty, { reason: 'net', error: String((e && e.message) || e) });
  }
  wx.setStorageSync(KEY_LAST, Date.now());

  const platforms = (list && Array.isArray(list.platforms)) ? list.platforms : [];
  wx.setStorageSync(KEY_PLAT, platforms);

  const all = (list && Array.isArray(list.msgs)) ? list.msgs : [];
  const seen = readSeen();
  const fresh = all.filter((m) => isFresh(m, seen));
  if (!fresh.length) {
    pruneSeen(seen, all);
    return { ok: true, n: 0, cfg: 0, plan: 0, gxt: 0, left: 0, platforms: platforms };
  }

  // 老的先落：同一份内容若在一轮里出现多次（不该发生，但索引是平台写的，不做此假设），
  // 后落的那次是最新的，正好覆盖。
  fresh.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const round = fresh.slice(0, MAX_PER_ROUND);

  let cfg = 0, plan = 0, gxt = 0, failed = 0;
  for (const m of round) {
    let snap = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      snap = await fetchMsg(ch, m.pid, m.id);
    } catch (e) {
      // 单件失败（被撤回 / 网络抖）不该中断整轮：不记 seen，下一轮自然重试
      failed++;
      continue;
    }
    if (!snap || !snap.kind) { failed++; continue; }
    try {
      if (snap.kind === 'satsim-pack') {
        // eslint-disable-next-line no-await-in-loop
        const cr = await satsimPack.importConfigs(snap);
        const pr = satsimPack.importPlans(snap);
        cfg += cr.total; plan += pr.total;
      } else if (snap.kind === 'gxt-snapshot') {
        // 存不下时照样往下走记 seen：存储满 / 单件超上限是持久状态，重拉每轮都会再失败一次，只烧流量
        if (queueGxt(m, snap)) gxt++; else failed++;
      } else {
        // 未知 kind：新版本平台发来的东西，记 seen 免得每轮都重拉
        console.warn('[satsimBox] 未知载荷 kind：', snap.kind);
      }
      seen[m.id] = m.ts || Date.now();
    } catch (e) {
      failed++;
      console.error('[satsimBox] 落地失败：', m.name, e);
    }
  }
  pruneSeen(seen, all);

  return {
    ok: true,
    n: cfg + plan + gxt,
    cfg: cfg, plan: plan, gxt: gxt,
    failed: failed,
    left: Math.max(0, fresh.length - round.length),
    platforms: platforms
  };
}

// seen 只保留还在索引里的消息：平台撤回 / 索引滚出上限后，那些 id 永远不会再出现，留着白占空间
function pruneSeen(seen, all) {
  const alive = new Set(all.map((m) => m && m.id));
  const next = {};
  for (const k of Object.keys(seen)) if (alive.has(k)) next[k] = seen[k];
  writeSeen(next);
}

/** 只看有没有新东西（不落地），给红点用。失败一律当「没有」，不打扰用户。 */
async function peekNew() {
  const ch = getCh();
  if (!ch) return 0;
  try {
    const list = await fetchList(ch);
    const seen = readSeen();
    return ((list && list.msgs) || []).filter((m) => isFresh(m, seen)).length;
  } catch (e) { return 0; }
}

const knownPlatforms = () => {
  const v = wx.getStorageSync(KEY_PLAT);
  return Array.isArray(v) ? v : [];
};

module.exports = {
  CH_LEN: CH_LEN,
  normalizeCh: normalizeCh,
  isCh: isCh,
  fmtCh: fmtCh,
  getCh: getCh,
  ensureCh: ensureCh,
  recoverCh: recoverCh,
  otherCh: otherCh,
  adoptCh: adoptCh,
  resetCh: resetCh,
  syncNow: syncNow,
  peekNew: peekNew,
  knownPlatforms: knownPlatforms,
  takeGxtQueue: takeGxtQueue,
  clearGxtQueue: clearGxtQueue
};

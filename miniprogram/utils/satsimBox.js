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
const KEY_GXT = 'satsimGxtInbox';      // 覆盖快照待消化队列（由「卫星覆盖」页取走，见本文件末尾）
const KEY_LAST = 'satsimLastSync';     // 上次同步时刻（节流）
const KEY_PLAT = 'satsimPlatforms';    // 上次看到的平台清单（设置页显示「已连接」）
const KEY_SYNCED = 'satsimChSynced';   // 认证码是否已成功备份到云端（见 ensureCh 的 ★★）

const CH_LEN = 12;
const CH_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // 去 I L O 0 1，与平台/密钥同源
const MIN_INTERVAL_MS = 60 * 1000;     // 自动同步最小间隔（手动同步不受限）
const MAX_PER_ROUND = 12;              // 一轮最多拉几件，剩下的下一轮 —— 避免首次绑定时一次拉几十件

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
 */
async function ensureCh() {
  const local = getCh();
  if (local) {
    if (!wx.getStorageSync(KEY_SYNCED)) {
      const okUp = await saveChCloud(local);
      if (okUp) wx.setStorageSync(KEY_SYNCED, 1);
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

/** 重置：换一个新收件地址。旧码作废，已绑定的平台需要重新绑。 */
async function resetCh() {
  const born = await genCh();
  setChLocal(born);
  wx.setStorageSync(KEY_SEEN, {});     // 新地址是空的，旧的已同步记录没有意义
  wx.setStorageSync(KEY_PLAT, []);
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
function queueGxt(row, snap) {
  const q = wx.getStorageSync(KEY_GXT);
  const list = Array.isArray(q) ? q : [];
  const at = list.findIndex((x) => x && x.id === row.id);
  const item = { id: row.id, name: row.name || snap.name || '覆盖快照', from: row.from || '', ts: row.ts || Date.now(), snap: snap };
  if (at >= 0) list[at] = item; else list.push(item);
  wx.setStorageSync(KEY_GXT, list.slice(-20));
}

/** 覆盖页取待消化的快照 */
function takeGxtQueue() {
  const q = wx.getStorageSync(KEY_GXT);
  return Array.isArray(q) ? q : [];
}
/** 覆盖页消化完某几件后清掉 */
function clearGxtQueue(ids) {
  const drop = new Set(Array.isArray(ids) ? ids : []);
  const rest = takeGxtQueue().filter((x) => x && !drop.has(x.id));
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
        queueGxt(m, snap); gxt++;
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
  resetCh: resetCh,
  syncNow: syncNow,
  peekNew: peekNew,
  knownPlatforms: knownPlatforms,
  takeGxtQueue: takeGxtQueue,
  clearGxtQueue: clearGxtQueue
};

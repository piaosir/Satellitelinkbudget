// cloudfunctions/importGxtSnapshot/index.js
// 密钥导入：据用户输入的短密钥，从仿真平台约定的 COS 公读地址拉取快照 JSON，
// 落进本用户的微信云存储 gxt/<openid>/<KEY>.json，返回 fileID 供页面渲染。
//
// 两种载荷共用这一个函数（而不是另起一个）：COS_BASE（桶 / 地域 / 前缀）必须与平台
// electron/services/share.js 的写入路径逐字一致，两个函数就是两份要同步的副本，迟早漂。
//   kind = 'gxt-snapshot'  卫星覆盖页的「当前绘制状态」快照（2026-07 落地，行为逐字不变）
//   kind = 'satsim-pack'   仿真平台的多件包：链路配置 / 频率计划（2026-08 新增，见平台
//                          src/shared/miniPack.js）。信封自带 expiresAt，过期即拒收。
//
// 快照来源（程序内置、与仿真平台约定）：仿真平台「发送到小程序」把覆盖等值线 + 协调区多边形打成
//   一份快照，用其内置的 COS 子账号 PUT 到 gxt/<KEY>.json（对象匿名可读、不可列举，密钥即凭证）：
//     https://update-1385987144.cos.ap-beijing.myqcloud.com/gxt/<KEY>.json
// 云函数运行在腾讯云服务端，发外部 HTTPS 不受小程序「request 合法域名」限制（同 fetchTLE 已验证）。

const cloud = require('wx-server-sdk');
const https = require('https');
const zlib = require('zlib');

cloud.init({ env: 'cloud1-8gjv5ekx41d6fb76' });   // 与小程序 app.js 的 wx.cloud.init 环境一致

// 仿真平台约定的下载基址：腾讯云 COS 桶 update-1385987144 / ap-beijing 的 updates/gxt/ 前缀
// （复用发布用的 updates/ 前缀——本就匿名可读，故无需额外配置桶策略）
const COS_BASE = 'https://update-1385987144.cos.ap-beijing.myqcloud.com/updates/gxt/';

// 密钥归一：去分隔符、大写。密钥字母表为 A-Z2-9（去 I L O 0 1），长度 8
function normalizeKey(raw) {
  return String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function httpsGetText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'SatLinkBudget-MiniProgram/1.0 (coverage import)', 'Accept-Encoding': 'gzip, deflate' },
      timeout: 15000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve(httpsGetText(res.headers.location)); }
      if (res.statusCode !== 200) {
        let b = '';
        res.on('data', (c) => { b += c; });
        res.on('end', () => reject(new Error((res.statusCode === 403 || res.statusCode === 404) ? 'KEY_NOT_FOUND' : `HTTP ${res.statusCode}`)));
        return;
      }
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

// ============================================================================
// 绑定投递（免密钥）：action = 'box' 拉清单 / 'boxMsg' 拉一件
// ============================================================================
// 小程序端生成 12 位认证码(CH)当收件地址，平台记下后一直往里投。对象布局见平台
// electron/services/share.js 的「绑定投递」段：
//   box/<CH>/roster.json        谁绑了这个账号
//   box/<CH>/<PID>/index.json   该平台的消息索引
//   box/<CH>/<PID>/<MID>.json   消息件
//
// ★ 为什么清单与内容分两次调用：云函数返回值上限 1 MB，而频率计划一件就几百 KB。
//   日常同步只拉清单（几 KB，判断有没有新东西），要哪件才拉哪件。
//
// ★★ 路径段必须严格白名单化再拼 URL：这几个值直接来自小程序端传参，
//    若放过 `../` 就能越出 box/ 前缀去拉 updates/ 下的别的对象（那里放着安装包和 latest.yml）。
//    下面三个 clean* 只保留字母数字，穿越序列连同分隔符一起被吃掉，构造不出来。
const cleanCh = (s) => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const cleanSeg = (s) => String(s == null ? '' : s).replace(/[^A-Za-z0-9_-]/g, '');

async function fetchJson(url) {
  const text = await httpsGetText(url);
  try { return JSON.parse(text); } catch (e) { return null; }
}

/** 清单：roster → 逐平台索引 → 合并成一张按时间倒序的消息表 */
async function boxList(ch) {
  const C = cleanCh(ch);
  if (!/^[A-Z0-9]{12}$/.test(C)) return { success: false, errMsg: '认证码格式不正确（应为 12 位）' };

  let roster;
  try {
    roster = await fetchJson(`${COS_BASE}box/${C}/roster.json`);
  } catch (e) {
    // 还没有任何平台往这个码投过东西 —— 不是错误，是「新绑定还没收到内容」的正常态
    if (e.message === 'KEY_NOT_FOUND') return { success: true, data: { ch: C, platforms: [], msgs: [] } };
    return { success: false, errMsg: '拉取失败：' + e.message };
  }
  const platforms = (roster && Array.isArray(roster.platforms) ? roster.platforms : [])
    .filter((p) => p && cleanSeg(p.pid))
    .map((p) => ({ pid: cleanSeg(p.pid), label: String(p.label || ''), app: String(p.app || ''), lastAt: Number(p.lastAt) || 0 }));

  const now = Date.now();
  const msgs = [];
  // 逐平台并发拉索引；某个平台的索引缺失/损坏不该拖垮整次同步，故各自 catch 成空
  await Promise.all(platforms.map(async (p) => {
    let idx = null;
    try { idx = await fetchJson(`${COS_BASE}box/${C}/${p.pid}/index.json`); } catch (e) { idx = null; }
    for (const m of (idx && Array.isArray(idx.msgs) ? idx.msgs : [])) {
      if (!m || !cleanSeg(m.id)) continue;
      if (m.expiresAt && now > Number(m.expiresAt)) continue;   // 过期的不进清单（信封自带 TTL）
      msgs.push({
        id: cleanSeg(m.id),
        pid: p.pid,
        from: p.label || p.pid,
        sync: String(m.sync || ''),
        name: String(m.name || ''),
        kind: String(m.kind || ''),
        ts: Number(m.ts) || 0,
        bytes: Number(m.bytes) || 0,
        items: Array.isArray(m.items) ? m.items : []
      });
    }
  }));
  msgs.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return { success: true, data: { ch: C, platforms, msgs } };
}

/** 一件的内容（信封原样返回，小程序侧的 importConfigs / importPlans 照收） */
async function boxMsg(ch, pid, mid) {
  const C = cleanCh(ch);
  const P = cleanSeg(pid);
  const M = cleanSeg(mid);
  if (!/^[A-Z0-9]{12}$/.test(C) || !P || !M) return { success: false, errMsg: '参数不正确' };
  let snap;
  try {
    snap = await fetchJson(`${COS_BASE}box/${C}/${P}/${M}.json`);
  } catch (e) {
    if (e.message === 'KEY_NOT_FOUND') return { success: false, errMsg: '这一件已被撤回或过期' };
    return { success: false, errMsg: '拉取失败：' + e.message };
  }
  if (!snap || !snap.kind) return { success: false, errMsg: '这一件已被撤回' };   // 撤回是覆写成 {}
  if (snap.expiresAt && Date.now() > Number(snap.expiresAt)) return { success: false, errMsg: '这一件已过期' };
  return { success: true, data: snap };
}

exports.main = async (event) => {
  const act = event && event.action;
  if (act === 'box') return await boxList(event.ch);
  if (act === 'boxMsg') return await boxMsg(event.ch, event.pid, event.mid);

  const key = normalizeKey(event && event.key);
  if (!/^[A-Z0-9]{8}$/.test(key)) return { success: false, errMsg: '密钥格式不正确（应为 8 位字母数字）' };

  // 1) 从约定的 COS 公读地址拉取快照 JSON 文本
  let text;
  try {
    text = await httpsGetText(COS_BASE + key + '.json');
  } catch (e) {
    if (e.message === 'KEY_NOT_FOUND') return { success: false, errMsg: '未找到该密钥对应的数据（密钥错误或已失效）' };
    return { success: false, errMsg: '拉取失败：' + e.message };
  }

  // 2) 校验 kind 白名单 + 过期
  let snap;
  try { snap = JSON.parse(text); } catch (e) { return { success: false, errMsg: '数据损坏（非法 JSON）' }; }
  const kind = snap && snap.kind;
  if (kind !== 'gxt-snapshot' && kind !== 'satsim-pack') {
    return { success: false, errMsg: '不是有效的仿真平台数据' };
  }
  // 对象在 COS 上没有 TTL，故过期由信封自带的 expiresAt 判（老快照无此字段 → 永不过期，行为不变）
  if (snap.expiresAt && Date.now() > Number(snap.expiresAt)) {
    return { success: false, errMsg: '该密钥已过期，请让发送方重新发送' };
  }

  // 3) 直接把快照数据内联返回（与现有 getCoverageData 同款，页面无需再下载，规避云存储读权限坑）
  //    同时 best-effort 落进本用户云存储空间（按 openid 隔离，满足「拉进云存储」诉求；失败不影响渲染）
  let fileID = '';
  try {
    const openid = (cloud.getWXContext() || {}).OPENID || 'anon';
    const up = await cloud.uploadFile({ cloudPath: `gxt/${openid}/${key}.json`, fileContent: Buffer.from(text, 'utf8') });
    fileID = up.fileID;
  } catch (e) {
    console.error('落云存储失败（非致命，已内联返回数据）:', e && e.message);
  }

  // meta 按 kind 分支：调用方据它出「包内清单」，不必自己再解一遍 data
  let meta;
  if (kind === 'satsim-pack') {
    const items = Array.isArray(snap.items) ? snap.items : [];
    const count = (t) => items.filter((it) => it && it.type === t).length;
    meta = {
      kind: kind,
      name: snap.name || '',
      from: snap.from || '',
      createdAt: snap.ts || 0,
      expiresAt: snap.expiresAt || 0,
      itemCount: items.length,
      configCount: count('lb-config'),
      planCount: count('freq-plan'),
      items: items.map((it) => ({ type: it.type || '', name: it.name || '', mod: it.mod || '' }))
    };
  } else {
    const beams = (snap.coverage && Array.isArray(snap.coverage.beams)) ? snap.coverage.beams.length : 0;
    const polygons = Array.isArray(snap.polygons) ? snap.polygons.length : 0;
    meta = { kind: kind, name: snap.name || '', beams: beams, polygons: polygons, createdAt: snap.createdAt || 0 };
  }
  return { success: true, data: snap, fileID, key, kind: kind, meta: meta };
};

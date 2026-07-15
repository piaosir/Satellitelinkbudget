// cloudfunctions/importGxtSnapshot/index.js
// 密钥导入：据用户输入的短密钥，从仿真平台约定的 COS 公读地址拉取「当前绘制状态」快照 JSON，
// 落进本用户的微信云存储 gxt/<openid>/<KEY>.json，返回 fileID 供卫星覆盖页下载渲染。
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

exports.main = async (event) => {
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

  // 2) 校验为有效覆盖快照
  let snap;
  try { snap = JSON.parse(text); } catch (e) { return { success: false, errMsg: '快照数据损坏（非法 JSON）' }; }
  if (!snap || snap.kind !== 'gxt-snapshot') return { success: false, errMsg: '不是有效的覆盖快照' };

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

  const beams = (snap.coverage && Array.isArray(snap.coverage.beams)) ? snap.coverage.beams.length : 0;
  const polygons = Array.isArray(snap.polygons) ? snap.polygons.length : 0;
  return {
    success: true, data: snap, fileID, key,
    meta: { name: snap.name || '', beams, polygons, createdAt: snap.createdAt || 0 }
  };
};

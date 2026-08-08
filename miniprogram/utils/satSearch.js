// 卫星搜索匹配（星座地图 / 星间链路共用）。
//
// 背景：原先两页各自写 `name.toLowerCase().indexOf(kw) >= 0 || String(noradId).indexOf(kw) >= 0`，
// 要求关键字是编目名的「连续子串」，于是这些常见输入一律零结果：
//   · 分隔符不同：CelesTrak 名为 STARLINK-1234，用户打「starlink 1234」/「starlink1234」都搜不到；
//   · 多词分打：「beidou m1」（真名 BEIDOU-3 M1，中间隔着 -3）、「iridium 133」之外的顺序都不成立；
//   · 中文名：编目全是英文，「北斗 / 星链 / 天宫 / 风云 / 遥感」等中文一律搜不到。
// 本模块统一为「归一化 + 分词全命中 + 中文别名」：把名字与关键字都压成 [a-z0-9] 串（去掉空格、
// 连字符、括号、点），关键字按空白与中英边界切成若干 token，每个 token 都要命中（名字子串或编号
// 子串）才算匹配，中文 token 先经别名表换成编目里的拉丁写法。命中后按相关度排序，避免长表被
// 前 N 条截断时把用户真正要的那颗挤掉。

// 中文/俗称 -> 编目名里的拉丁写法（值为归一化后的形式，可多个，命中任一即可）。
// 键按「出现在 token 里即命中」匹配，故「北斗三号」也能经「北斗」命中。
const ALIAS = {
  // 星座
  '星链': ['starlink'],
  '一网': ['oneweb'],
  '柯伊伯': ['kuiper'],
  '北斗': ['beidou'],
  '千帆': ['qianfan'],
  '星网': ['hulianwang', 'guowang'],
  '国网': ['hulianwang', 'guowang'],
  '互联网': ['hulianwang'],
  '铱星': ['iridium'],
  '格洛纳斯': ['cosmos'],
  '伽利略': ['galileo'],
  // 空间站
  '空间站': ['iss', 'zarya', 'css', 'tianhe'],
  '国际空间站': ['iss', 'zarya'],
  '天宫': ['css', 'tianhe'],
  '天和': ['tianhe'],
  // 中国常见系列
  '风云': ['fengyun', 'fy'],
  '高分': ['gaofen'],
  '遥感': ['yaogan'],
  '海洋': ['haiyang'],
  '资源': ['ziyuan'],
  '环境': ['huanjing'],
  '实践': ['shijian'],
  '中星': ['chinasat'],
  '亚太': ['apstar'],
  '天通': ['tiantong'],
  '天链': ['tianlian'],
  '北斗导航': ['beidou'],
  '吉林': ['jilin'],
  '珠海': ['zhuhai'],
  '试验': ['shiyan'],
  '通信技术试验': ['tongxin'],
  // 国外常见
  '哈勃': ['hst', 'hubble'],
  '陆地卫星': ['landsat'],
  '铱': ['iridium'],
  '国际通信卫星': ['intelsat'],
  '欧星': ['eutelsat'],
  '国际海事': ['inmarsat']
};
const ALIAS_KEYS = Object.keys(ALIAS).sort((a, b) => b.length - a.length); // 长键优先

// 归一化：小写 + 只留 [a-z0-9] 与中日韩汉字（空格/连字符/括号/点/下划线全抹掉）
const CJK = '\\u4e00-\\u9fff';
const RE_NORM = new RegExp('[^a-z0-9' + CJK + ']+', 'g');
const RE_CHUNK = new RegExp('[' + CJK + ']+|[a-z0-9]+', 'g');
const RE_ALL_CJK = new RegExp('^[' + CJK + ']+$');
function norm(s) {
  return String(s == null ? '' : s).toLowerCase().replace(RE_NORM, '');
}

// 关键字 -> token 列表，每个 token 带若干「可接受形式」（中文经别名展开）
// 例：「北斗 3」-> [{forms:['beidou']}, {forms:['3']}]；「starlink-1234」-> [{forms:['starlink']}, {forms:['1234']}]
function tokenize(raw) {
  const s = String(raw == null ? '' : raw).toLowerCase().trim();
  if (!s) return [];
  const out = [];
  const chunks = s.match(RE_CHUNK) || []; // 中文段与英数段各自成 token
  for (let i = 0; i < chunks.length; i++) {
    const t = chunks[i];
    if (RE_ALL_CJK.test(t)) {
      const forms = [];
      for (let k = 0; k < ALIAS_KEYS.length; k++) {
        if (t.indexOf(ALIAS_KEYS[k]) >= 0) {
          const v = ALIAS[ALIAS_KEYS[k]];
          for (let j = 0; j < v.length; j++) if (forms.indexOf(v[j]) < 0) forms.push(v[j]);
        }
      }
      out.push({ forms: forms.length ? forms : [t], cjk: true });
    } else {
      out.push({ forms: [t], cjk: false });
    }
  }
  return out;
}

// 归一化名缓存：键=传入的数组本身（索引数组/分组数组各一份，切换时自然淘汰）。
// 不把归一化名挂到条目对象上，避免被 JSON.stringify 一起写进本地缓存文件而白白翻倍体积。
const NORM_CACHE = [];
const NORM_CACHE_MAX = 4;
function normsOf(list) {
  for (let i = 0; i < NORM_CACHE.length; i++) {
    if (NORM_CACHE[i].list === list && NORM_CACHE[i].n.length === list.length) return NORM_CACHE[i].n;
  }
  const n = new Array(list.length);
  for (let i = 0; i < list.length; i++) n[i] = norm(list[i] && list[i].name);
  NORM_CACHE.unshift({ list, n });
  if (NORM_CACHE.length > NORM_CACHE_MAX) NORM_CACHE.length = NORM_CACHE_MAX;
  return n;
}

function anyIn(forms, hay) {
  for (let i = 0; i < forms.length; i++) if (hay.indexOf(forms[i]) >= 0) return true;
  return false;
}
function startsAny(forms, hay) {
  for (let i = 0; i < forms.length; i++) if (hay.indexOf(forms[i]) === 0) return true;
  return false;
}

// 在 list（[{name, noradId, ...}]）里搜 raw，返回原条目数组（按相关度排序，最多 limit 条）。
// 相关度：完全同名/编号 > 名字以首 token 开头 > 名字命中 > 仅编号命中；同档保持原次序。
function searchSats(list, raw, limit) {
  const arr = list || [];
  const toks = tokenize(raw);
  const cap = limit || 50;
  if (!toks.length) return [];
  const names = normsOf(arr);
  const first = toks[0].forms;
  // 分档桶而非排序：全表扫完也只是 O(n)，且每档内天然保持原次序（编号/星座序）
  const buckets = [[], [], [], []];
  for (let i = 0; i < arr.length; i++) {
    const nm = names[i];
    const id = String((arr[i] && arr[i].noradId) || '');
    let ok = true, byName = false;
    for (let t = 0; t < toks.length; t++) {
      const f = toks[t].forms;
      const inName = anyIn(f, nm);
      if (!inName && !(!toks[t].cjk && anyIn(f, id))) { ok = false; break; } // 名字与编号都不沾 -> 淘汰
      if (inName) byName = true;
    }
    if (!ok) continue;
    let score = 3;                                       // 仅编号命中
    if (byName) score = 2;                               // 名字命中
    if (byName && startsAny(first, nm)) score = 1;       // 名字以首 token 开头（STARLINK-… 优先于 …STARLINK…）
    if (first.indexOf(nm) >= 0 || first.indexOf(id) >= 0) score = 0; // 完全同名/同编号
    if (buckets[score].length < cap) buckets[score].push(arr[i]);    // 每档留够 cap 条即可，低档再多也用不上
    if (score === 0 && buckets[0].length >= cap) break;              // 最高档已装满 -> 无需再扫
  }
  const out = [];
  for (let b = 0; b < buckets.length && out.length < cap; b++) {
    for (let k = 0; k < buckets[b].length && out.length < cap; k++) out.push(buckets[b][k]);
  }
  return out;
}

// 空关键字 = 列出前 limit 条（分组浏览用；有关键字则等同 searchSats）
function filterSats(list, raw, limit) {
  const cap = limit || 60;
  if (!String(raw == null ? '' : raw).trim()) return (list || []).slice(0, cap);
  return searchSats(list, raw, cap);
}

module.exports = { searchSats, filterSats, norm, tokenize };

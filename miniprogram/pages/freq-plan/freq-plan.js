// 转发器频率计划（只读）。
//
// ★ 只能从仿真平台导入。这一页不新建、不编辑 —— 平台那边的版式口径（LO 推算与 cross-strap 解耦、
//   波束占段的三路、分层、断口折叠…）2026-07~08 连改三轮，在这边照抄一份必漂。故平台在发送那一刻
//   把版式摊平成一串【绘制指令】随包送来，这一页只做三件事：
//     ① 按指令画（drawOps）  ② 按命中矩形认点击（hitAt）  ③ 按解析结果显示明细（chs / alloc）
//   零算法、零单位换算 —— 连「MHz 怎么写成人读的数」都是平台随包给的参数（meta.u）。
//
// ★★ 频率分配表那一页同理：频带条的几何（视域、载波块、波束色带的分层、跨切点的分色、功率衬底）
//   也是平台摊平成【百分比】送来的（alloc.groups[].strip / mini），这边只把它们落成 view 的
//   left / width。屏上这条条与平台 FpAlloc 那条是同一条，不是照着描的第二张。
//
// ★★★ 导出两条：
//   PNG   —— 按倍率把绘制指令【重画一遍】到离屏画布（不是放大屏上那张位图，那只有视口那么大）；
//   Excel —— 平台随包送的表模型（xlsx: 列/行/数字格式）交云函数 exportFreqPlan 刷格子，
//            与平台自己导出的那本「频率计划数据表」逐格一致。
//
// ★★★★ 代价是诚实的：看到的是【导入那一刻】的版式。平台后续改了计划要重发（同一份计划重发即覆盖）。

const satsimPack = require('../../utils/satsimPack');

const TAP_SLOP = 10;        // 手指移动小于这个距离才算「点」，不算「拖」
const MIN_SCALE = 0.2;
const MAX_SCALE = 12;
// 画布里的字体。★ 与平台 freqPlanRender 的 SERIF_STACK 同一串 —— 图上的字与表里的字是同一批数，
// 两处不该是两种字。canvas 不继承 WXSS 的 font-family，故这里必须自己写死一份。
const FONT_STACK = "'Times New Roman', 'Nimbus Roman', 'Liberation Serif', '宋体', SimSun, serif";

// 导出 PNG 的尺寸上限：长边一条、总像素一条。
// ★ 不是「取上限直接画」：位图撑破了本机，多数机器不报错，只是一笔都落不下去 —— 出一张白图。
//   故从梯子最上面一档往下试，画完探一个像素，是白图就退一档重来（见 pngAt / probeBlank）。
// ★★ 4× 是平台侧 PNG 的默认倍率（fpExport 的 scale=4），两处出的图得是一个清晰度，
//    故长边留到 5120 —— 平台的图幅宽 1280，正好够 4× 落地。
const PNG_EDGE_MAX = 5120;
const PNG_AREA_MAX = 12e6;                       // 12MP 的位图约 48MB，再往上低端机吃不消
const PNG_STEPS = [6, 5, 4, 3.5, 3, 2.5, 2, 1.5, 1];

// 行内样式里的百分比：数 → '12.121%'。★ 单位在这边接上，不在 wxml 里接 ——
// 「left:{{x}}%」那种在 }} 后面还跟单位的写法会被编辑器的 CSS 解析器判成语法错误。
const PCT = (v) => (v == null ? '0%' : v + '%');
// 未定频载波的斜纹（条上的块与收起行的缩略段各一档密度）。★ 只能写在这里：
// 行内的 background-image 压得过类规则，wxss 里再写一条 .float 的永远不生效。
const STRIPE = 'repeating-linear-gradient(45deg, rgba(255,255,255,.3) 0 8rpx, transparent 8rpx 16rpx)';
const STRIPE_SM = 'repeating-linear-gradient(45deg, rgba(255,255,255,.45) 0 6rpx, transparent 6rpx 12rpx)';

Page({
  data: {
    view: 'list',           // 'list' | 'plan'
    plans: [],              // 索引（本地存储）
    cur: null,              // 当前计划的索引行
    meta: null,
    tab: 'chart',           // 'chart' | 'list' | 'alloc'
    // 图
    canvasReady: false,
    zoomText: '100%',
    beams: [],              // 图例（含 on 标记）
    pick: null,             // 底部详情卡（点中的那条转发器）
    // 表
    rows: [],               // 转发器清单（已按当前刻度写好读数）
    allocGroups: [],
    allocSummary: null,
    allocUnassigned: [],
    allocSel: '',           // 条上点中的那条载波（明细表里同一条高亮）
    // 导出用的离屏画布尺寸（null = 不挂那个节点）
    exp: null,
    // 密钥导入（分格输入，与「卫星覆盖」的密钥导入同一套）
    showKey: false,
    keyInput: '',
    keyFocus: false,
    otpCells: [],
    importing: false
  },

  onLoad() {
    this.refreshList();
  },
  onShow() {
    if (this.data.view === 'list') this.refreshList();
    else if (this.data.tab === 'chart') this.initCanvas(true);
    this._syncFromSatsim();
  },

  // 进本页就拉一次平台投递（App.onShow 只在应用回到前台时触发，小程序内部翻页不会）。
  // 拉到新计划就刷新列表 —— 在列表页才刷，正看着某份计划的图时不打断。
  async _syncFromSatsim() {
    let box = null;
    try { box = require('../../utils/satsimBox'); } catch (e) { return; }
    if (!box.getCh()) return;
    let r = null;
    try { r = await box.syncNow({ force: true }); } catch (e) { return; }
    if (r && r.plan && this.data.view === 'list') {
      this.refreshList();
      wx.showToast({ title: '已同步 ' + r.plan + ' 份计划', icon: 'none' });
    }
  },
  // 画布尺寸一变就得重建位图：位图（cv.width/height）与 CSS 框一旦不等比，CSS 会把图拉伸变形。
  // 详情卡已改成浮层不再挤画布（见 wxss 的 .pick），这里兜的是转屏 / 键盘 / 分屏那几种外部变化。
  onResize() {
    if (this.data.view === 'plan' && this.data.tab === 'chart') this.initCanvas(true);
  },

  // ===================== 计划列表 =====================
  refreshList() {
    this.setData({ plans: satsimPack.readPlanIndex() });
  },

  // —— 密钥导入弹窗：8 位分格输入，与「卫星覆盖」那一处逐格同款（同一条通道，同一种手感）——
  // 隐形的真实 <input> 移出可视区而不是盖在分格上：真机上 <input> 是画在 webview 之上的原生控件，
  // 它的文字与系统光标 CSS 压不住（会看到小字母与两个光标）。聚焦靠点分格区程序化触发。
  onImportTap() {
    this.setData({ showKey: true, keyInput: '', otpCells: this.buildOtpCells(''), keyFocus: true });
  },
  hideKeyPanel() { this.setData({ showKey: false, keyFocus: false }); },
  buildOtpCells(key) {
    const chars = String(key || '').split('');
    const n = chars.length;
    const cells = [];
    for (let i = 0; i < 8; i++) {
      if (i === 4) cells.push({ id: 'sep', sep: true });   // 第 4/5 格之间一个只读「-」
      cells.push({ id: 'c' + i, sep: false, char: chars[i] || '', filled: i < n, active: i === n });
    }
    return cells;
  },
  onKeyInput(e) {
    const key = satsimPack.normalizeKey(e.detail.value);
    this.setData({ keyInput: key, otpCells: this.buildOtpCells(key), keyFocus: true });
  },
  onOtpFocus() { this.setData({ keyFocus: true }); },
  onOtpBlur() { this.setData({ keyFocus: false }); },
  focusOtp() { if (!this.data.keyFocus) this.setData({ keyFocus: true }); },
  confirmKeyImport() {
    const key = satsimPack.normalizeKey(this.data.keyInput);
    if (!/^[A-Z0-9]{8}$/.test(key)) { wx.showToast({ title: '请输入 8 位密钥', icon: 'none' }); return; }
    this.doImport(key);
  },

  async doImport(rawKey) {
    if (this.data.importing) return;
    this.setData({ importing: true });
    wx.showLoading({ title: '拉取中...', mask: true });
    let got;
    try {
      got = await satsimPack.fetchPack(rawKey);
    } catch (e) {
      wx.hideLoading();
      this.setData({ importing: false });
      wx.showModal({ title: '导入失败', content: (e && e.message) || '未知错误', showCancel: false });
      return;
    }
    wx.hideLoading();
    this.setData({ importing: false });

    const pack = got.pack;
    const plans = satsimPack.itemsOf(pack, 'freq-plan');
    if (!plans.length) {
      // 同一个密钥在哪个入口输都拉得到同一个包 —— 说清这个包该去哪导，别让人反复试
      wx.showModal({
        title: '包里没有频率计划',
        content: '这个密钥装的是 ' + satsimPack.describePack(pack)
          + '。链路配置请到「我的配置 → 导入」，星座请到「工具栏 → 星座地图 → 导入」输入。',
        showCancel: false
      });
      return;
    }
    const r = satsimPack.importPlans(pack);
    this.setData({ showKey: false, keyFocus: false, keyInput: '' });
    this.refreshList();
    wx.showToast({ title: '已导入 ' + r.total + ' 份' + (r.replaced ? '（覆盖 ' + r.replaced + '）' : ''), icon: 'none', duration: 2000 });
  },

  onPlanTap(e) {
    const id = e.currentTarget.dataset.id;
    this.openPlan(id);
  },

  onPlanLongPress(e) {
    const id = e.currentTarget.dataset.id;
    const row = this.data.plans.find((p) => p.id === id);
    if (!row) return;
    wx.showActionSheet({
      itemList: ['重命名', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.showModal({
            title: '重命名', editable: true, content: row.name,
            success: (r) => {
              const nm = (r.content || '').trim();
              if (r.confirm && nm) { satsimPack.renamePlan(id, nm); this.refreshList(); }
            }
          });
        } else if (res.tapIndex === 1) {
          wx.showModal({
            title: '删除', content: '删除「' + row.name + '」？',
            success: (r) => { if (r.confirm) { satsimPack.removePlan(id); this.refreshList(); } }
          });
        }
      }
    });
  },

  backToList() {
    this._draw = null;
    this._plan = null;
    this.setData({ view: 'list', cur: null, meta: null, pick: null, canvasReady: false });
    this.refreshList();
  },

  // ===================== 打开一份计划 =====================
  openPlan(id) {
    const p = satsimPack.loadPlan(id);
    const draw = satsimPack.loadDraw(id);
    // 分键存的（明细一条、绘制指令一条），被清过缓存就只剩索引 —— 说清楚，别开出一片白画布
    if (!p || !draw) { wx.showModal({ title: '数据已丢失', content: '本地缓存被清理过，请重新用密钥导入。', showCancel: false }); return; }
    const row = this.data.plans.find((x) => x.id === id) || { id: id, name: p.meta.name };
    this._plan = p;
    this._draw = draw;
    // 波束 → 涉及哪些「转发器|侧」（点图例高亮用）。平台把归属解析好了，这里只做一次倒排。
    this._byBeam = {};
    for (const c of p.chs || []) {
      for (const b of c.beamsUp || []) (this._byBeam[b.id] = this._byBeam[b.id] || {})[c.id + '|up'] = 1;
      for (const b of c.beamsDn || []) (this._byBeam[b.id] = this._byBeam[b.id] || {})[c.id + '|dn'] = 1;
    }
    this._onBeam = '';        // 当前高亮的波束
    const groups = this.buildAlloc(p);
    // 满页收起的行，点开才看得见东西 —— 给一个落点（同平台：第一条装了载波的）
    if (groups.length) groups[0].open = true;
    this.setData({
      view: 'plan', tab: 'chart', cur: row, meta: p.meta, pick: null, allocSel: '',
      beams: (p.beams || []).map((b) => ({ id: b.id, name: b.name, color: b.color, label: b.label, on: false })),
      rows: this.buildRows(p),
      allocGroups: groups,
      allocSummary: this.buildAllocSummary(p),
      allocUnassigned: this.buildAllocRows((p.alloc && p.alloc.unassigned) || [], p.meta.u)
    }, () => this.initCanvas());
  },

  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab;
    // ★ 图那一层是 wx:if —— 切走再切回来是一个【新的】canvas 节点，老的 ctx 已经脱离视图树，
    //   往它上面画等于画在空气里（症状：切回来一片白）。故重新取节点，但保住当前缩放与位置。
    this.setData({ tab: tab }, () => { if (tab === 'chart') this.initCanvas(true); });
  },

  // ===================== 读数（刻度参数由平台随包给，本地不判单位）=====================
  fmt(v) { return satsimPack.fmtFreq(v, this._plan && this._plan.meta.u); },
  fmtU(v) { return satsimPack.fmtFreqU(v, this._plan && this._plan.meta.u); },

  buildRows(p) {
    const u = p.meta.u;
    const f = (v) => satsimPack.fmtFreq(v, u);
    return (p.chs || []).map((c) => ({
      id: c.id,
      no: c.no || '—',
      kind: c.kindLabel,
      mark: c.mark,
      upFc: c.up ? f(c.up.fc) : '—',
      upBw: c.up && c.up.bw != null ? f(c.up.bw) : '—',
      upPol: c.up ? c.up.pol : '—',
      dnFc: c.dn ? f(c.dn.fc) : '—',
      dnBw: c.dn && c.dn.bw != null ? f(c.dn.bw) : '—',
      dnPol: c.dn ? c.dn.pol : '—',
      lo: c.lo ? c.lo.name : '',
      derived: c.dnDerived,
      beam: (c.beamsUp || []).map((b) => b.name).join(' + ') || '—',
      color: (c.beamsUp && c.beamsUp[0] && c.beamsUp[0].color) || ''
    }));
  },

  buildAllocRows(rows, u, badSet) {
    const f = (v) => satsimPack.fmtFreq(v, u);
    return (rows || []).map((r) => ({
      id: r.id || '',
      idx: r.idx,
      name: r.name || '—',
      up: r.up.fc == null ? '—' : f(r.up.f1) + ' ~ ' + f(r.up.f2),
      upFc: f(r.up.fc),
      dn: r.dn.fc == null ? '—' : f(r.dn.f1) + ' ~ ' + f(r.dn.f2),
      dnFc: f(r.dn.fc),
      occ: r.occ == null ? '—' : f(r.occ),
      pwr: r.pwr == null ? '—' : f(r.pwr),
      rate: r.rate == null ? '—' : String(r.rate),
      modcod: r.modcod || '—',
      pol: r.pol || '—',
      beam: r.beam || '',
      beamColor: r.beamColor || '',
      placed: r.placed !== false,
      bad: !!(badSet && r.id && badSet[r.id]),
      note: r.note || ''
    }));
  },

  // 频带条：平台把几何算成了百分比（见 fpMiniExport 的 stripGeom），这边只补三件与【读法】
  // 有关的事 —— 按当前刻度写读数、按块宽决定写不写得下字、把波束色带的层高摊成 rpx。
  // ★ 一个数都不在这里另算：条上的位置、颜色、跨段的渐变全部照收。
  // ★★ 出去的每个几何量都【带着单位】（'12.1%' / '7rpx'）。wxml 里的行内样式必须写成
  //    「一条声明以 mustache 收尾」——「left:{{x}}%」那种在 }} 后面还跟着单位的写法，
  //    编辑器的 CSS 解析器会当成语法错误刷一屏红（小程序自己编译得了，但真错就被淹了）。
  buildStrip(g, u) {
    const s = g.strip;
    if (!s) return null;
    const f = (v) => satsimPack.fmtFreq(v, u);
    const lanes = Math.max(1, s.lanes || 1);
    // 色带总高 14rpx，叠着的几层平分（同平台：只画最后一个等于把别的藏了）
    const segH = Math.round((14 / lanes) * 10) / 10;
    return {
      band: { left: PCT(s.band.left), width: PCT(s.band.width) },
      segs: (s.segs || []).map((x) => ({
        left: PCT(x.left), width: PCT(x.width), color: x.color,
        top: (x.lane * segH) + 'rpx', h: segH + 'rpx'
      })),
      bars: (s.bars || []).map((b) => ({
        id: b.id, name: b.name, left: PCT(b.left), width: PCT(b.width),
        color: b.color, ink: b.ink, placed: b.placed, bad: b.bad,
        // 未定频的那几条铺斜纹。★ 斜纹只能从这里给：行内的 background-image 压得过 .blk.float
        //   那条类规则，两处都写的话类规则永远不生效（故 wxss 里那条已经去掉）。
        bgImg: b.placed ? (b.bg || 'none') : STRIPE,
        pwr: b.pwr == null ? '' : PCT(b.pwr),
        bw: b.occ == null ? '' : f(b.occ),
        // 块窄到写不下就不写（挤成一团比不写更难读，同平台按块宽判）：
        // 整条条约 700rpx，8% ≈ 两个字、22% ≈ 一行读数
        showNm: b.width >= 8, showBw: b.width >= 22
      })),
      axis: (s.axis || []).map((x) => ({ left: PCT(x.left), t: f(x.v) }))
    };
  },

  // 收起行里那条缩略占用条（同上：几何带着单位出去）
  buildMini(g) {
    const m = g.mini;
    if (!m) return null;
    return {
      segs: (m.segs || []).map((x) => ({
        left: PCT(x.left), width: PCT(x.width), color: x.color,
        bgImg: x.placed ? (x.bg || 'none') : STRIPE_SM
      })),
      pwr: PCT(m.pwr)
    };
  },

  buildAlloc(p) {
    const a = p.alloc;
    if (!a) return [];
    const u = p.meta.u;
    const f = (v) => satsimPack.fmtFreq(v, u);
    const pct = (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%');
    // 占用率只上色不写字（平台既定口径：结果输出纯数字，不出「达标 / 受限」这类判定）
    const cls = (v) => (v == null ? '' : v > 1.0001 ? 'over' : v > 0.9 ? 'near' : '');
    // 更早的版本导入的包没有频带条几何（也没标工作侧）。条画不出来时得分清是哪一种：
    // 「这条转发器没有下行频带」与「这份包该重发了」是两回事，说错了人会去查转发器。
    const legacy = a.side !== 'dn';
    return (a.groups || []).map((g) => {
      // 出问题的那几条载波：条上描红、明细表里也标一下（核算已按 carrierId 标好，这里只取来上色）
      const bad = {};
      for (const i of g.issues || []) if (i.carrierId) bad[i.carrierId] = 1;
      return {
        no: g.no || '—',
        channelId: g.channelId,
        // ★ 工作侧是【下行】（同平台那一页：频谱仪摆在接收站那一侧，卖出去的也是下行那一段）。
        //   上行仍并排写一行 —— 两侧凑齐才对得上频谱仪。
        band: g.dn.f1 == null ? '—' : f(g.dn.f1) + ' ~ ' + f(g.dn.f2),
        upBand: g.up.f1 == null ? '' : f(g.up.f1) + ' ~ ' + f(g.up.f2),
        pol: g.dn.pol || '—',
        upPol: g.up.pol || '',
        bw: g.bw == null ? '—' : f(g.bw),
        beam: g.beam || '',
        beams: g.beams || [],
        count: g.count,
        occ: f(g.occSum),
        pwr: f(g.pwrSum),
        free: g.freeMHz == null ? '—' : f(g.freeMHz),
        rate: g.rateSum == null ? '—' : (g.rateSum / 1000).toFixed(2),
        bwUtil: pct(g.bwUtil),
        pwrUtil: pct(g.pwrUtil),
        bwCls: cls(g.bwUtil),
        pwrCls: cls(g.pwrUtil),
        issues: (g.issues || []).map((i) => i.msg),
        rows: this.buildAllocRows(g.rows, u, bad),
        strip: this.buildStrip(g, u),
        mini: this.buildMini(g),
        legacy: legacy,
        open: false
      };
    });
  },

  buildAllocSummary(p) {
    const a = p.alloc;
    if (!a || !a.summary) return null;
    const s = a.summary;
    const u = p.meta.u;
    const f = (v) => satsimPack.fmtFreq(v, u);
    return {
      unit: u.label,
      tp: s.tpUsed + ' / ' + s.tpTotal,
      carriers: s.carrierCount,
      totalBw: f(s.totalBwMHz),
      occ: f(s.occupiedBwMHz),
      pwr: f(s.powerBwMHz),
      free: f(s.freeBwMHz),
      bwUtil: s.bwUtil == null ? '—' : (s.bwUtil * 100).toFixed(1) + '%',
      pwrUtil: s.pwrUtil == null ? '—' : (s.pwrUtil * 100).toFixed(1) + '%',
      rate: s.totalRateMbps == null ? '—' : s.totalRateMbps.toFixed(2),
      eff: s.avgEffBpsHz == null ? '—' : s.avgEffBpsHz.toFixed(2)
    };
  },

  onAllocToggle(e) {
    const i = Number(e.currentTarget.dataset.i);
    const key = 'allocGroups[' + i + '].open';
    const patch = {};
    patch[key] = !this.data.allocGroups[i].open;
    this.setData(patch);
  },

  // 条上点一块 / 明细里点一行 —— 两处是同一条载波，选中在两处同时亮（再点取消）
  onCarTap(e) {
    const id = e.currentTarget.dataset.id || '';
    this.setData({ allocSel: this.data.allocSel === id ? '' : id });
  },

  // 清单里点一条 → 跳到图上并选中它（两个视图看的是同一条转发器）
  onRowTap(e) {
    const id = e.currentTarget.dataset.id;
    const c = (this._plan.chs || []).find((x) => x.id === id);
    if (!c) return;
    this.setData({ tab: 'chart', pick: this.pickOf(c, '') }, () => this.scheduleDraw());
  },

  // ===================== 图：canvas 2d =====================
  // 取画布节点并把【位图尺寸】对齐到 CSS 框（× 设备像素比）。位图与框一旦不等比，
  // CSS 就会把图拉伸 —— 那正是「畸变」的成因，故凡是框可能变过的时机都要重走这一遍。
  // keepView = 保住当前缩放与位置（切页签回来 / 转屏），不给就回到「整幅铺满宽度」。
  initCanvas(keepView, retry) {
    if (!this._draw) return;
    wx.createSelectorQuery().in(this).select('#fpc').fields({ node: true, size: true }).exec((res) => {
      const r = res && res[0];
      if (!r || !r.node) return;
      // 布局还没完成时量到 0：位图设成 0 就再也画不出东西了，且没有人会来重量一次 —— 补一次重试
      if (!(r.width > 0 && r.height > 0)) {
        if (!retry) setTimeout(() => this.initCanvas(keepView, 1), 100);
        return;
      }
      const cv = r.node;
      const ctx = cv.getContext('2d');
      const dpr = wx.getWindowInfo ? (wx.getWindowInfo().pixelRatio || 2) : (wx.getSystemInfoSync().pixelRatio || 2);
      cv.width = r.width * dpr;
      cv.height = r.height * dpr;
      this._cv = cv; this._ctx = ctx; this._dpr = dpr;
      this._vw = r.width; this._vh = r.height;
      if (keepView && this._scale > 0) {
        this.clampView();
        this.setZoomText();
        this.scheduleDraw();
      } else this.fitView();
      this.setData({ canvasReady: true });
    });
  },

  // 缩放读数：100% = 整幅正好铺满画布宽度（换了框宽这个基准也跟着变，故与 clampView 一并调）
  setZoomText() {
    const base = this._vw / (this._draw.w || 1);
    this.setData({ zoomText: Math.round(this._scale / base * 100) + '%' });
  },

  // 初始视图：整幅按宽度铺满、顶端对齐
  fitView() {
    const d = this._draw;
    if (!d || !this._vw) return;
    this._scale = this._vw / (d.w || 1);
    this._tx = 0;
    this._ty = 0;
    this.clampView();
    this.setZoomText();
    this.scheduleDraw();
  },
  onResetTap() { this.fitView(); },

  // 平移边界：整幅至少留一半在视口里，别让人把图甩没了
  clampView() {
    const d = this._draw;
    const w = d.w * this._scale, h = d.h * this._scale;
    const minX = Math.min(0, this._vw - w), maxX = Math.max(0, this._vw - w);
    this._tx = Math.min(Math.max(this._tx, minX), maxX);
    const minY = Math.min(0, this._vh - h), maxY = Math.max(0, this._vh - h);
    this._ty = Math.min(Math.max(this._ty, minY), maxY);
  },

  scheduleDraw() {
    if (this._pending) return;
    this._pending = true;
    const run = () => { this._pending = false; this.draw(); };
    if (this._cv && this._cv.requestAnimationFrame) this._cv.requestAnimationFrame(run);
    else setTimeout(run, 16);
  },

  // 把绘制指令刷到一个 2d 上下文上（变换与底色由调用方先摆好）。
  //   s    = 当前缩放，只用来判「这个字缩得还画不画」
  //   cull = 视口的世界坐标框；不给就整幅都画 —— 导出走的正是这一路
  paintOps(ctx, d, s, cull) {
    const vx0 = cull ? cull.x0 : -Infinity, vy0 = cull ? cull.y0 : -Infinity;
    const vx1 = cull ? cull.x1 : Infinity, vy1 = cull ? cull.y1 : Infinity;
    const outY = (y, h) => (y > vy1 || y + (h || 0) < vy0);

    ctx.lineCap = 'butt';
    for (let i = 0; i < d.ops.length; i++) {
      const o = d.ops[i];
      if (o.k === 'r') {
        if (outY(o.y, o.h) || o.x > vx1 || o.x + o.w < vx0) continue;
        if (o.f) { ctx.fillStyle = o.f; ctx.fillRect(o.x, o.y, o.w, o.h); }
        if (o.s) {
          ctx.strokeStyle = o.s; ctx.lineWidth = o.sw || 1;
          if (o.d) ctx.setLineDash(o.d); else ctx.setLineDash([]);
          ctx.strokeRect(o.x, o.y, o.w, o.h);
          ctx.setLineDash([]);
        }
      } else if (o.k === 'l') {
        const a = o.a;
        if (Math.min(a[1], a[3]) > vy1 || Math.max(a[1], a[3]) < vy0) continue;
        ctx.strokeStyle = o.s; ctx.lineWidth = o.sw || 1;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[2], a[3]); ctx.stroke();
      } else if (o.k === 'c') {
        if (outY(o.y, 0)) continue;
        ctx.fillStyle = o.f;
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
      } else if (o.k === 'g') {
        const p = o.p;
        if (Math.min(p[1], p[3], p[5]) > vy1 || Math.max(p[1], p[3], p[5]) < vy0) continue;
        ctx.fillStyle = o.f;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]); ctx.lineTo(p[4], p[5]); ctx.closePath(); ctx.fill();
      } else if (o.k === 't') {
        if (o.y - o.fs > vy1 || o.y < vy0) continue;
        // 缩得太小的字不画：一堆 1px 的墨点只是噪声（平台侧同判据，见 blockNoFs）
        if (o.fs * s < 3) continue;
        ctx.fillStyle = o.f;
        ctx.font = (o.b ? 'bold ' : '') + o.fs.toFixed(2) + 'px ' + FONT_STACK;
        ctx.textAlign = o.m === 'middle' ? 'center' : (o.m === 'end' ? 'right' : 'left');
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(o.v, o.x, o.y);
      }
    }
    ctx.textAlign = 'left';
  },

  draw() {
    const ctx = this._ctx, d = this._draw;
    if (!ctx || !d) return;
    const dpr = this._dpr, s = this._scale, tx = this._tx, ty = this._ty;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this._vw * dpr, this._vh * dpr);
    ctx.fillStyle = d.paper || '#ffffff';
    ctx.fillRect(0, 0, this._vw * dpr, this._vh * dpr);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * tx, dpr * ty);

    // 视口裁剪（世界坐标）：几千条指令时不画看不见的那些
    const vx0 = -tx / s, vy0 = -ty / s, vx1 = vx0 + this._vw / s, vy1 = vy0 + this._vh / s;
    this.paintOps(ctx, d, s, { x0: vx0, y0: vy0, x1: vx1, y1: vy1 });

    // 图例高亮：不涉及该波束的块压暗（盖一层纸色半透明），比逐块重画省事也不改原笔画
    if (this._onBeam) {
      const set = this._byBeam[this._onBeam] || {};
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      for (const h of d.hits) {
        if (set[h.id + '|' + h.side]) continue;
        ctx.fillRect(h.x - 1, h.y - 1, h.w + 2, h.h + 2);
      }
    }
    // 选中的那条描一圈
    const pick = this.data.pick;
    if (pick) {
      ctx.strokeStyle = '#1a73e8';
      ctx.lineWidth = 2 / s;
      for (const h of d.hits) {
        if (h.id !== pick.id) continue;
        ctx.strokeRect(h.x - 1.5, h.y - 1.5, h.w + 3, h.h + 3);
      }
    }
  },

  // —— 手势：单指拖 / 双指缩放 / 点击选中 ——
  onTouchStart(e) {
    const t = e.touches;
    this._moved = 0;
    this._t0 = Date.now();
    if (t.length >= 2) {
      this._pinch = this.pinchOf(t);
      this._lastOne = null;
    } else if (t.length === 1) {
      this._pinch = null;
      this._lastOne = { x: t[0].x, y: t[0].y };
      this._downOne = { x: t[0].x, y: t[0].y };
    }
  },
  pinchOf(t) {
    const dx = t[0].x - t[1].x, dy = t[0].y - t[1].y;
    return { d: Math.max(1, Math.hypot(dx, dy)), cx: (t[0].x + t[1].x) / 2, cy: (t[0].y + t[1].y) / 2 };
  },
  onTouchMove(e) {
    const t = e.touches;
    if (t.length >= 2) {
      const p = this.pinchOf(t);
      if (this._pinch) {
        const k = p.d / this._pinch.d;
        const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this._scale * k));
        // 以两指中点为不动点缩放（世界坐标下那一点在屏上位置不变）
        const wx0 = (p.cx - this._tx) / this._scale;
        const wy0 = (p.cy - this._ty) / this._scale;
        this._scale = ns;
        this._tx = p.cx - wx0 * ns;
        this._ty = p.cy - wy0 * ns;
        this.clampView();
        this._moved += Math.abs(p.d - this._pinch.d);
        this.setZoomText();
        this.scheduleDraw();
      }
      this._pinch = p;
      this._lastOne = null;
      return;
    }
    if (t.length === 1 && this._lastOne) {
      const dx = t[0].x - this._lastOne.x, dy = t[0].y - this._lastOne.y;
      this._tx += dx; this._ty += dy;
      this._moved += Math.abs(dx) + Math.abs(dy);
      this._lastOne = { x: t[0].x, y: t[0].y };
      this.clampView();
      this.scheduleDraw();
    }
  },
  onTouchEnd(e) {
    const wasPinch = !!this._pinch;
    this._pinch = null;
    if (wasPinch || this._moved > TAP_SLOP || !this._downOne) { this._downOne = null; return; }
    if (Date.now() - this._t0 > 600) { this._downOne = null; return; }
    this.tapAt(this._downOne.x, this._downOne.y);
    this._downOne = null;
  },

  tapAt(cssX, cssY) {
    const d = this._draw;
    if (!d) return;
    const x = (cssX - this._tx) / this._scale;
    const y = (cssY - this._ty) / this._scale;
    // 图例：点它 = 只看这个波束，再点取消
    for (const L of d.legend || []) {
      if (x >= L.x && x <= L.x + L.w && y >= L.y && y <= L.y + L.h) { this.toggleBeam(L.beamId); return; }
    }
    const h = this.hitAt(x, y);
    if (!h) { if (this.data.pick) this.setData({ pick: null }, () => this.scheduleDraw()); return; }
    const c = (this._plan.chs || []).find((v) => v.id === h.id);
    if (!c) return;
    this.setData({ pick: this.pickOf(c, h.side) }, () => this.scheduleDraw());
  },

  hitAt(x, y) {
    const d = this._draw;
    // 倒序：分层时后画的在上面，点的应该是看得见的那一个。
    // 命中矩形直接用平台给的那一份（标记类载波那根箭头只有 1.5px 宽，平台侧的 markGeom 已把它的
    // 命中区放宽过了 —— 这边不再另加一层补边，加了会从相邻转发器手里抢走点击）。
    for (let i = d.hits.length - 1; i >= 0; i--) {
      const h = d.hits[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
    }
    return null;
  },

  toggleBeam(beamId) {
    this._onBeam = this._onBeam === beamId ? '' : beamId;
    this.setData({ beams: this.data.beams.map((b) => ({ ...b, on: b.id === this._onBeam })) }, () => this.scheduleDraw());
  },
  onBeamTap(e) { this.toggleBeam(e.currentTarget.dataset.id); },

  // 详情卡：这一条转发器的读数。
  // ★ 不列「波束占段」——那一行在图上已经画出来了（块内的色片就是各波束占的那几段），
  //   卡片里再用文字复述一遍是同一件事的第二种写法，密排时还特别长。
  pickOf(c, side) {
    const u = this._plan.meta.u;
    const f = (v) => satsimPack.fmtFreq(v, u);
    const fu = (v) => satsimPack.fmtFreqU(v, u);
    const num = (v, unit) => (v == null ? '' : v + ' ' + unit);
    const lb = [
      num(c.sfd, 'dBW/m²') && 'SFD ' + num(c.sfd, 'dBW/m²'),
      num(c.gt, 'dB/K') && 'G/T ' + num(c.gt, 'dB/K'),
      num(c.boi, 'dB') && 'IBO ' + num(c.boi, 'dB'),
      num(c.boo, 'dB') && 'OBO ' + num(c.boo, 'dB'),
      num(c.cim, 'dB') && 'C/IM ' + num(c.cim, 'dB')
    ].filter(Boolean).join(' · ');
    return {
      id: c.id,
      side: side,
      no: c.no || '—',
      kind: c.kindLabel,
      mark: c.mark,
      up: c.up ? { fc: fu(c.up.fc), bw: c.up.bw == null ? '—' : fu(c.up.bw), pol: c.up.pol, band: c.up.bw == null ? '' : f(c.up.f1) + ' ~ ' + f(c.up.f2) } : null,
      dn: c.dn ? { fc: fu(c.dn.fc), bw: c.dn.bw == null ? '—' : fu(c.dn.bw), pol: c.dn.pol, band: c.dn.bw == null ? '' : f(c.dn.f1) + ' ~ ' + f(c.dn.f2) } : null,
      derived: c.dnDerived,
      bwFromBeam: c.bwFromBeam,
      lo: c.lo ? c.lo.name + '  ' + fu(c.lo.value) : '',
      beamsUp: (c.beamsUp || []).map((b) => ({ name: b.name, color: b.color })),
      beamsDn: (c.beamsDn || []).map((b) => ({ name: b.name, color: b.color })),
      lb: lb,
      note: c.note || ''
    };
  },
  onPickClose() { this.setData({ pick: null }, () => this.scheduleDraw()); },

  // ===================== 导出 =====================
  onExportTap() {
    wx.showActionSheet({
      itemList: ['保存频率计划图（PNG）', '发送计划图给好友', '导出数据表（Excel）'],
      success: (r) => {
        if (r.tapIndex === 0) this.exportPng('album');
        else if (r.tapIndex === 1) this.exportPng('share');
        else if (r.tapIndex === 2) this.exportXlsx();
      }
    });
  },

  // —— PNG：按倍率把绘制指令【重画一遍】——
  // ★ 不是把屏上那张位图放大：屏上那张只有视口那么大（还带着当前的缩放与平移），放大出来是糊的、
  //   而且只有看得见的那一截。故另挂一个与整幅等大的离屏画布，从头画一遍（同平台 fpExport 的
  //   「按倍率重画几何」，那边也不是给 SVG 加 viewBox 放大）。
  exportPng(how) {
    const d = this._draw;
    if (!d || this._exporting) return;
    const W = Math.max(1, Math.ceil(d.w)), H = Math.max(1, Math.ceil(d.h));
    // 想要的倍率排成一条梯子，从最上面一档开始试（本机撑不住就在 pngAt 里逐档往下退）。
    // ★ 整幅本身就超限的（HTS 那种几十条转发器的长图）允许降到 1× 以下 —— 缩着出一张完整的图，
    //   好过让人只拿到「导出失败」四个字。
    const cap = Math.min(PNG_EDGE_MAX / W, PNG_EDGE_MAX / H, Math.sqrt(PNG_AREA_MAX / (W * H)));
    const ladder = PNG_STEPS.filter((x) => x <= cap);
    if (!ladder.length) {
      // 整幅本身就超限（HTS 那种几十条转发器的长图）：缩着出，一样从大往小试 ——
      // 缩到 0.4× 还画不下的机器也有，那就再对折两回
      const c0 = Math.max(0.1, Math.floor(cap * 20) / 20);
      for (const k of [1, 0.5, 0.25]) {
        const x = Math.max(0.1, Math.round(c0 * k * 100) / 100);
        if (ladder[ladder.length - 1] !== x) ladder.push(x);
      }
    }
    this._exporting = true;
    wx.showLoading({ title: '出图中…', mask: true });
    this.pngAt(ladder, 0, how, W, H);
  },

  // 照第 i 档倍率出一张。撑不住就退一档重来 —— 退过档的，存完要跟人说一声图比该有的小
  pngAt(ladder, i, how, W, H) {
    const d = this._draw, s = ladder[i];
    const pw = Math.round(W * s), ph = Math.round(H * s);
    const down = (why) => {
      if (i + 1 < ladder.length) this.pngAt(ladder, i + 1, how, W, H);
      else this.endExport(why);
    };
    // 节点是 wx:if 挂出来的，setData 的回调里才拿得到
    // wpx / hpx 是给 CSS 框用的（带单位，见 PCT 那一条的缘由）；w / h 是位图尺寸，两者取同一个数
    this.setData({ exp: { w: pw, h: ph, wpx: pw + 'px', hpx: ph + 'px' } }, () => {
      wx.createSelectorQuery().in(this).select('#fpx').fields({ node: true }).exec((res) => {
        const cv = res && res[0] && res[0].node;
        if (!cv) { this.endExport('画布未就绪，请重试'); return; }
        let ctx = null;
        try {
          // ★ 位图尺寸 = CSS 尺寸（见 wxml 里那个 style）：两者相等时
          //   canvasToTempFilePath 的 width/height 无论按哪一种解释都是同一个数
          cv.width = pw;
          cv.height = ph;
          ctx = cv.getContext('2d');
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.fillStyle = d.paper || '#ffffff';
          ctx.fillRect(0, 0, cv.width, cv.height);
          ctx.setTransform(s, 0, 0, s, 0, 0);
          this.paintOps(ctx, d, s, null);          // 不裁剪 —— 整幅都要
        } catch (e) {
          down('出图失败：' + ((e && e.message) || '画布异常'));
          return;
        }
        if (this.probeBlank(ctx)) { down('本机画布尺寸不足，请稍后重试'); return; }
        wx.canvasToTempFilePath({
          canvas: cv, x: 0, y: 0, width: cv.width, height: cv.height,
          destWidth: cv.width, destHeight: cv.height, fileType: 'png',
          success: (r) => this.afterPng(r.tempFilePath, how, i > 0),
          fail: (e) => down('出图失败：' + ((e && e.errMsg) || '未知错误'))
        });
      });
    });
  },

  // 位图没分配下来的机器上，画布照样「能画」，只是一笔都没落下 —— 底色铺过 (0,0)，
  // 那里还是透明的就说明这一档超了本机上限。
  // ★ 只有【确凿读到透明】才算数：探针本身取不到值（老基础库没有 getImageData）就当没探过，
  //   照常出图 —— 不能因为探不了就一路退到 1×。
  probeBlank(ctx) {
    try {
      const px = ctx.getImageData(0, 0, 1, 1);
      return !!(px && px.data && px.data.length >= 4) && px.data[3] === 0;
    } catch (e) {
      return false;
    }
  },

  endExport(msg) {
    wx.hideLoading();
    this._exporting = false;
    this.setData({ exp: null });
    if (msg) wx.showModal({ title: '导出失败', content: msg, showCancel: false });
  },

  afterPng(path, how, downgraded) {
    wx.hideLoading();
    this._exporting = false;
    this.setData({ exp: null });                   // 大位图用完即摘，别一直挂在视图树上
    if (how === 'share') {
      // 转发图片走系统的图片分享面板；老基础库没有它就退预览（长按仍可保存 / 转发）
      if (wx.showShareImageMenu) wx.showShareImageMenu({ path: path, fail: () => wx.previewImage({ urls: [path] }) });
      else wx.previewImage({ urls: [path] });
      return;
    }
    wx.saveImageToPhotosAlbum({
      filePath: path,
      // 退过档的说一声：这张比该有的糊，不然人只当图就这个清晰度
      success: () => (downgraded
        ? wx.showToast({ title: '已存入相册（本机上限，清晰度略降）', icon: 'none', duration: 2500 })
        : wx.showToast({ title: '已存入相册', icon: 'success' })),
      fail: (e) => {
        const m = (e && e.errMsg) || '';
        if (m.indexOf('auth') >= 0 || m.indexOf('deny') >= 0) {
          wx.showModal({
            title: '需要相册权限', content: '请在设置里允许「保存到相册」，再试一次。',
            confirmText: '去设置',
            success: (r) => { if (r.confirm) wx.openSetting(); }
          });
        } else if (m.indexOf('cancel') < 0) {
          wx.previewImage({ urls: [path] });        // 存不进相册也别让图丢了
        }
      }
    });
  },

  // —— Excel：平台随包送的表模型交云函数刷格子 ——
  // ★ 表模型（哪一列写什么、什么数字格式、空列出不出）在平台那边算好了（见 fpXlsxModel），
  //   这边一格都不另排 —— 排一遍就是第二份真相，与平台自己导出的那本对不上。
  async exportXlsx() {
    const cur = this.data.cur;
    const model = cur ? satsimPack.loadXlsx(cur.id) : null;
    if (!model || !Array.isArray(model.sheets) || !model.sheets.length) {
      wx.showModal({
        title: '这份计划没有数据表',
        // 两种情形：包太大被平台摘掉了（reason 会说明），或这份计划是更早的版本导入的
        content: (model && model.reason)
          || '数据表是随密钥包送来的。请在仿真平台上把这份计划重新发送一次（同一份计划重发即覆盖）。',
        showCancel: false
      });
      return;
    }
    wx.showLoading({ title: '生成 Excel…', mask: true });
    try {
      const oldFileID = wx.getStorageSync('lastFpXlsxFileID') || null;
      const res = await wx.cloud.callFunction({
        name: 'exportFreqPlan',
        data: { model: model, name: cur.name || '频率计划', oldFileID: oldFileID }
      });
      const r = res && res.result;
      if (!r || !r.success) throw new Error((r && r.error) || '云函数返回错误');
      wx.setStorageSync('lastFpXlsxFileID', r.fileID);
      const dl = await wx.cloud.downloadFile({ fileID: r.fileID });
      if (!dl.tempFilePath) throw new Error('文件下载失败');
      wx.hideLoading();
      wx.openDocument({
        filePath: dl.tempFilePath, showMenu: true, fileType: 'xlsx',
        success: () => wx.showToast({ title: '点击右上角可转发', icon: 'none', duration: 3000 }),
        fail: () => wx.showModal({
          title: '导出成功',
          content: '文件已生成：' + r.fileName + '\n\n请在聊天里打开或转发。',
          showCancel: false
        })
      });
    } catch (e) {
      wx.hideLoading();
      wx.showModal({ title: '导出失败', content: (e && e.message) || '无法导出，请稍后重试', showCancel: false });
    }
  }
});

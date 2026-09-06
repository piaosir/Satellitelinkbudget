// 使用帮助（页面版）。正文在 help-data.js，本文件只管展开/收起与目录跳转。
//
// 为什么做成折叠章节而不是一长条：全文十二章、手机上摊平接近两万字，滚动条会失去意义。
// 默认全收起 + 顶部目录，用户点哪章展开哪章。
const CHAPTERS = require('./help-data.js');

Page({
  data: {
    chapters: [],
    toc: []
  },

  onLoad(options) {
    const chapters = CHAPTERS.map((c, i) => ({
      no: i + 1,
      title: c.title,
      blocks: c.blocks,
      open: false
    }));
    this.setData({
      chapters: chapters,
      toc: chapters.map((c) => ({ no: c.no, title: c.title }))
    }, () => {
      // 直达某一章（设置页的「链路参数怎么填」「3GPP NTN 标准怎么配」两个入口带 ?ch=N 进来）。
      // 复用 jump 而不是另写一段：它已经处理了「先展开、渲染完再量位置」那件事——
      // 目标章原本收起，先量后展开会滚偏。
      const n = Number(options && options.ch);
      if (n >= 1 && n <= chapters.length) this.jumpTo(n - 1);
    });
  },

  toggle(e) {
    const i = Number(e.currentTarget.dataset.i);
    if (!(i >= 0)) return;
    this.setData({ ['chapters[' + i + '].open']: !this.data.chapters[i].open });
  },

  // 目录跳转：展开目标章节再滚过去。
  // ★ 必须等 setData 渲染完成再量位置 —— 展开会改变它上面那些章节的高度吗？不会（只展开自己），
  //   但目标章节本身若原本收起、现在展开，节点高度变了，先量后展开会滚偏。故量位置放在回调里。
  jump(e) {
    this.jumpTo(Number(e.currentTarget.dataset.i));
  },

  jumpTo(i) {
    if (!(i >= 0)) return;
    this.setData({ ['chapters[' + i + '].open']: true }, () => {
      wx.createSelectorQuery()
        .select('#ch' + this.data.chapters[i].no).boundingClientRect()
        .selectViewport().scrollOffset()
        .exec((res) => {
          const rect = res && res[0];
          const sc = res && res[1];
          if (!rect || !sc) return;
          wx.pageScrollTo({ scrollTop: Math.max(0, rect.top + sc.scrollTop - 12), duration: 240 });
        });
    });
  },

  expandAll() {
    const next = {};
    const open = !this.data.chapters.every((c) => c.open);   // 有一章没开就是「全部展开」，全开了才是「全部收起」
    this.data.chapters.forEach((c, i) => { next['chapters[' + i + '].open'] = open; });
    this.setData(next);
  }
});

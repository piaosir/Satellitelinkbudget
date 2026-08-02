// 云函数入口 —— 转发器频率计划「数据表」导出（.xlsx）。
//
// ★ 这里不认识转发器，也不认识波束：入参 model 是【仿真平台算好的表模型】
//   （fpXlsxModel.buildDataXlsx 的返回值，随密钥包一路送到小程序本地存储），
//   本函数只负责「第几行第几列写什么、什么数字格式、并到哪」。
//   分工照平台桌面端那条线（electron/services/freqPlanXlsx.js 的 writeDataSheet），
//   两处各写一遍口径必漂 —— 故这一份是它的逐条移植，不是另一套排版。
//
// 入参：{ model, name?, oldFileID? }
//   model = { kind:'data', meta:{planName,satName,…}, unit:{label,factor,dec,numFmt},
//             sheets:[ { name, title, kv?, columns:[{header,key,width,fmt,align}], rows:[[…]], freeze } ] }
// 出参：{ success, fileID, tempFileURL, fileName }
const cloud = require('wx-server-sdk');
const ExcelJS = require('exceljs');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 版式常量与平台桌面端同值（同一本表在两处打开不该是两个样子）
const FNT = 'Times New Roman';
const INK = 'FF17181A';
const DIM = 'FF6B7078';
const RULE = 'FF3A3F45';
const MED = { style: 'medium', color: { argb: RULE } };
const THIN = { style: 'thin', color: { argb: RULE } };
const HAIR = { style: 'hair', color: { argb: 'FFB9BEC5' } };
const HEAD_FILL = 'FFEDEFF2';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const txt = (v) => (v === null || v === undefined ? '' : String(v));

// ---- 单元格三件套（值 / 字 / 框）----
function put(ws, r, c, value, o) {
  const opt = o || {};
  const cell = ws.getRow(r).getCell(c);
  cell.value = value === '' || value === undefined ? null : value;
  cell.font = { name: FNT, size: opt.size || 10, bold: !!opt.bold, color: { argb: opt.ink || INK } };
  if (opt.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opt.fill } };
  cell.alignment = {
    horizontal: opt.align || 'left',
    vertical: 'middle',
    wrapText: !!opt.wrap
  };
  if (opt.fmt) cell.numFmt = opt.fmt;
  if (opt.border) cell.border = opt.border;
  return cell;
}

// 合并区：exceljs 只给左上格上样式，其余格默认无边框 —— 一并刷一遍，否则右半截没有框线
function span(ws, r, c0, c1, value, o) {
  const a = Math.min(c0, c1);
  const b = Math.max(c0, c1);
  for (let c = a; c <= b; c++) put(ws, r, c, c === a ? value : null, o);
  if (b > a) ws.mergeCells(r, a, r, b);
  return ws.getRow(r).getCell(a);
}

// Excel 的表名限制：≤31 字符、不含 : \ / ? * [ ]、不重名、不为空
function sheetName(raw, used) {
  let n = txt(raw).replace(/[:\\/?*[\]]/g, '·').trim() || '表';
  if (n.length > 31) n = n.slice(0, 30) + '…';
  let out = n;
  for (let i = 2; used.has(out); i++) {
    const tail = '(' + i + ')';
    out = (n.length + tail.length > 31 ? n.slice(0, 31 - tail.length) : n) + tail;
  }
  used.add(out);
  return out;
}

// 装不下的列放宽一点（只增不减）。桌面端走的是 reportAutofit，这里按字符宽粗估同一件事：
// 中日文字宽约两倍，故按 2 记。
function autofit(ws, columns, rows, maxWidth) {
  const wide = (v) => {
    const s = txt(v);
    let w = 0;
    for (let i = 0; i < s.length; i++) w += s.charCodeAt(i) > 0x2e80 ? 2 : 1;
    return w;
  };
  columns.forEach((c, i) => {
    let need = wide(c.header) / 2 + 3;                 // 表头是折行的，按半宽记
    for (const row of rows) need = Math.max(need, wide(row[i]) + 2);
    const col = ws.getColumn(i + 1);
    const now = col.width || 8;
    col.width = Math.min(maxWidth || 46, Math.max(now, need));
  });
}

// ---- 一张分表 ----
function writeDataSheet(wb, sh, model, used) {
  const ws = wb.addWorksheet(sheetName(sh.name, used), {
    views: [{
      showGridLines: false,
      state: sh.freeze ? 'frozen' : 'normal',
      xSplit: sh.freeze ? Math.min(sh.freeze, 3) : 0,
      ySplit: sh.freeze ? 4 : 0
    }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  const cols = sh.columns || [];
  const rows = sh.rows || [];
  cols.forEach((c, i) => { if (c.width) ws.getColumn(i + 1).width = c.width; });

  const unit = (model.unit && model.unit.label) || 'MHz';
  const meta = model.meta || {};
  span(ws, 1, 1, Math.max(1, cols.length), sh.title || meta.planName || '频率计划', { size: 13, bold: true });
  ws.getRow(1).height = 22;
  span(ws, 2, 1, Math.max(1, cols.length),
    (meta.satName ? meta.satName + ' · ' : '') + (meta.planName || '') + ' · 刻度 ' + unit,
    { size: 9, ink: DIM });

  if (sh.kv) {
    // 概览是键值表：分节行加粗、其余细线分隔（不套三线表 —— 那是给矩阵用的）
    let r = 4;
    let lastData = 0;
    for (const item of rows) {
      const k = item[0];
      const v = item[1];
      const u = item[2];
      const sec = v === null && u === null;
      if (!sec) lastData = r;
      if (sec) {
        span(ws, r, 1, 3, txt(k).replace(/^——\s*/, ''), { size: 10, bold: true, border: { bottom: THIN } });
      } else {
        put(ws, r, 1, k, { size: 10, border: { bottom: HAIR } });
        // 数右文左：这一列里既有数也有整句（计划名、校验说明），一律右对齐会把句子推到列尾去。
        // 不定小数位 —— 数值在平台出手前已按刻度收过小数。
        put(ws, r, 2, v, { size: 10, align: isNum(v) ? 'right' : 'left', border: { bottom: HAIR } });
        put(ws, r, 3, u, { size: 10, ink: DIM, border: { bottom: HAIR } });
      }
      r++;
    }
    if (lastData) {
      for (let c = 1; c <= 3; c++) {
        const cell = ws.getRow(lastData).getCell(c);
        cell.border = Object.assign({}, cell.border, { bottom: MED });
      }
    }
    autofit(ws, cols, rows.map((x) => [x[0], x[1], x[2]]), 52);
    return ws;
  }

  // 表头（三线表的上两条线）
  cols.forEach((c, i) => put(ws, 4, i + 1, c.header, {
    size: 9, bold: true, align: 'center', wrap: true, fill: HEAD_FILL, border: { top: MED, bottom: THIN }
  }));
  ws.getRow(4).height = 26;

  if (!rows.length) {
    span(ws, 5, 1, Math.max(1, cols.length), '无记录。', { size: 10, ink: DIM, align: 'center', border: { bottom: MED } });
    return ws;
  }
  rows.forEach((row, ri) => {
    const rr = 5 + ri;
    const bd = { bottom: ri === rows.length - 1 ? MED : HAIR };
    cols.forEach((c, ci) => {
      const v = row[ci];
      put(ws, rr, ci + 1, v === undefined ? null : v, {
        size: 9,
        align: c.align || (isNum(v) ? 'right' : 'left'),
        fmt: isNum(v) ? c.fmt : null,
        border: bd
      });
    });
  });
  // 自动筛选：几百行的载波表靠它挑（表头恰在第 4 行）
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: cols.length } };
  autofit(ws, cols, rows, 46);
  return ws;
}

// 主题字体：exceljs 硬写 Calibri/Cambria，换掉之后空白格与用户后填的内容也是 TNR
function applyBookFont(wb) {
  try {
    const theme1 = require('exceljs/lib/xlsx/xml/theme1.js');
    wb._themes = { theme1: String(theme1).replace(/<a:latin typeface="(Calibri|Cambria)"\/>/g, '<a:latin typeface="' + FNT + '"/>') };
  } catch (e) { /* exceljs 内部结构变了就跳过，已写入的单元格字体不受影响 */ }
  return wb;
}

async function buildWorkbook(model) {
  const wb = new ExcelJS.Workbook();
  wb.creator = '卫星链路预算小程序';
  wb.created = new Date();
  const used = new Set();
  for (const sh of model.sheets) writeDataSheet(wb, sh, model, used);
  return applyBookFont(wb).xlsx.writeBuffer();
}

// 文件名里不能有路径分隔符与控制字符；长度也收一收（云存储的 key 有上限）
function safeName(s) {
  return txt(s).replace(/[\\/:*?"<>|\r\n]/g, '_').trim().slice(0, 40) || '频率计划';
}

function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

exports.main = async (event) => {
  const model = event && event.model;
  if (!model || !Array.isArray(model.sheets) || !model.sheets.length) {
    return { success: false, error: '未提供数据表模型（请在仿真平台重新发送这份计划）' };
  }
  try {
    // 上一份先删：同一个人反复导出会在云存储里堆一摞同名文件
    if (event.oldFileID) {
      try { await cloud.deleteFile({ fileList: [event.oldFileID] }); } catch (e) { /* 删不掉不影响这一次导出 */ }
    }
    const buffer = await buildWorkbook(model);
    const base = safeName(event.name || (model.meta && model.meta.planName) || '频率计划');
    const cloudPath = 'reports/FreqPlan_' + stamp(new Date()) + '.xlsx';
    const up = await cloud.uploadFile({ cloudPath: cloudPath, fileContent: Buffer.from(buffer) });
    const url = await cloud.getTempFileURL({ fileList: [up.fileID] });
    return {
      success: true,
      fileID: up.fileID,
      tempFileURL: url.fileList[0].tempFileURL,
      fileName: base + '-频率计划数据表.xlsx'
    };
  } catch (error) {
    console.error('导出频率计划数据表失败:', error);
    return { success: false, error: (error && error.message) || '生成失败' };
  }
};

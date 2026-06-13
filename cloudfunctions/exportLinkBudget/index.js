// 云函数入口 - 导出链路预算表「专业版」（Word / Excel / PDF，三线表黑白风格）
// 直接复用前端「链路瀑布」的 segments 数据结构，确保三格式与小程序内链路预算表完全一致：
// 黑白三线表（粗顶线 + 表头细线 + 粗底线，数据行无横线）。
//
// 入参（两种形态，二选一）：
//   多链路：{ format, lang, oldFileID, reportTitle?, links: [{ name, subtitle, orbitType, segments, summary }] }
//   单链路（向后兼容 results-detail 旧调用）：{ format, lang, oldFileID, segments, meta:{ title, subtitle } }
// 多链路报告结构：页眉 → 链路总览对比表（参数行 × 链路列，≤4列分块）→ 逐链路章节（整套七段瀑布，换页分隔）。
// 单链路报告结构：标题 + 副标题 + 七段瀑布（保持原版式不变）。
const cloud = require('wx-server-sdk');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  TableLayoutType, VerticalAlign, ShadingType
} = require('docx');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// ====== 多语言界面文案 ======
const I18N = {
  zh: {
    param: '参数', value: '数值', up: '上行', down: '下行', total: '合计', unit: '单位',
    defaultTitle: '链路预算表', batchTitle: '链路预算对比报告（专业版）',
    overviewTitle: '链路总览对比', linkWord: '链路', linksUnit: '条链路', contMark: '（续）',
    footer: (t) => `生成时间：${t}　·　卫星链路预算计算系统`,
    creator: '卫星链路预算计算系统',
    note: (n, first) => `注：共 ${n} 条链路。`,
    // 链路总览指标行
    ov: {
      satellite: '卫星', orbit: '轨道', band: '频段', infoRate: '信息速率', modulation: '调制方式',
      fec: 'FEC 码率', carrierBW: '载波带宽', powerBW: '功率带宽',
      upCN: '上行 C/N', downCN: '下行 C/N', totalCN: '合成 C/N',
      thresholdCN: '门限 C/N', linkMargin: '链路余量', availability: '系统可用度',
      bwUsage: '带宽占用', pwrUsage: '功率占用', paPower: '功放建议', paPowerDb: '功放建议'
    }
  },
  en: {
    param: 'Parameter', value: 'Value', up: 'Uplink', down: 'Downlink', total: 'Total', unit: 'Unit',
    defaultTitle: 'Link Budget Table', batchTitle: 'Link Budget Comparison Report (Pro)',
    overviewTitle: 'Link Overview', linkWord: 'Link', linksUnit: 'links', contMark: ' (cont.)',
    footer: (t) => `Generated: ${t}　·　Satellite Link Budget System`,
    creator: 'Satellite Link Budget System',
    note: (n, first) => `Note: ${n} links in total.`,
    ov: {
      satellite: 'Satellite', orbit: 'Orbit', band: 'Band', infoRate: 'Info Rate', modulation: 'Modulation',
      fec: 'FEC Rate', carrierBW: 'Carrier BW', powerBW: 'Power BW',
      upCN: 'Uplink C/N', downCN: 'Downlink C/N', totalCN: 'Combined C/N',
      thresholdCN: 'Threshold C/N', linkMargin: 'Link Margin', availability: 'Availability',
      bwUsage: 'BW Usage', pwrUsage: 'Power Usage', paPower: 'Rec. PA', paPowerDb: 'Rec. PA'
    }
  }
};

function uiText(lang) {
  return I18N[lang === 'en' ? 'en' : 'zh'];
}

// 链路总览指标行定义：[key, 单位, 是否加粗]。summary 对象由前端 buildLinkSummary 提供。
function overviewRowDefs(ui) {
  return [
    ['satellite', '', false],
    ['orbit', '', false],
    ['band', '', false],
    ['infoRate', 'kbps', false],
    ['modulation', '', false],
    ['fec', '', false],
    ['carrierBW', 'kHz', false],
    ['powerBW', 'kHz', false],
    ['upCN', 'dB', false],
    ['downCN', 'dB', false],
    ['totalCN', 'dB', false],
    ['thresholdCN', 'dB', false],
    ['linkMargin', 'dB', true],
    ['availability', '%', false],
    ['bwUsage', '%', false],
    ['pwrUsage', '%', false],
    ['paPower', 'W', false],
    ['paPowerDb', 'dBW', false]
  ];
}

// ====== 公共：列定义 ======
function valueHeaders(cols, ui) {
  if (cols >= 3) return [ui.up, ui.down, ui.total];
  if (cols >= 2) return [ui.up, ui.down];
  return [ui.value];
}

function rowValues(row, cols) {
  if (cols >= 3) return [row.up || '', row.down || '', row.total || ''];
  if (cols >= 2) return [row.up || '', row.down || ''];
  return [row.up || ''];
}

function labelWithSign(row) {
  const sign = row.sign ? (row.sign + ' ') : '';
  return sign + (row.label || '');
}

function timestamp() {
  const d = new Date();
  const bj = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${bj.getUTCFullYear()}${p(bj.getUTCMonth() + 1)}${p(bj.getUTCDate())}_${p(bj.getUTCHours())}${p(bj.getUTCMinutes())}${p(bj.getUTCSeconds())}`;
}

function nowText() {
  const d = new Date();
  const bj = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${bj.getUTCFullYear()}-${p(bj.getUTCMonth() + 1)}-${p(bj.getUTCDate())} ${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}`;
}

// 归一化入参为 links 数组：[{ name, subtitle, orbitType, segments, summary }]
function normalizeLinks(event) {
  if (Array.isArray(event.links) && event.links.length > 0) {
    return event.links.map((l) => ({
      name: l.name || '',
      subtitle: l.subtitle || '',
      orbitType: l.orbitType || 'GEO',
      segments: Array.isArray(l.segments) ? l.segments : [],
      summary: l.summary || null
    }));
  }
  // 向后兼容：单链路 segments + meta
  const meta = event.meta || {};
  return [{
    name: meta.title || '',
    subtitle: meta.subtitle || '',
    orbitType: event.orbitType || 'GEO',
    segments: Array.isArray(event.segments) ? event.segments : [],
    summary: null
  }];
}

// ============================================================
// Word 生成（三线表）
// ============================================================
const BLACK = '000000';
const GREY = '999999';
const HLBG = 'FFF3B0'; // 对比差异黄底
const THICK = 18;
const THIN = 6;
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

function cellBorders({ top, bottom } = {}) {
  return { top: top || NONE, bottom: bottom || NONE, left: NONE, right: NONE };
}

function txt(text, { bold = false, size = 18, align = AlignmentType.LEFT, color = BLACK, mono = false } = {}) {
  return new Paragraph({
    alignment: align,
    spacing: { before: 20, after: 20, line: 240 },
    children: [new TextRun({
      text: text == null ? '' : String(text),
      bold, size, color, font: mono ? 'Consolas' : '微软雅黑'
    })]
  });
}

function colWidthsFor(cols) {
  if (cols >= 3) return [2800, 1300, 1300, 1300, 1000];
  if (cols >= 2) return [3000, 1500, 1500, 1100];
  return [3200, 1700, 1100];
}

function buildWordSegment(seg, ui) {
  const cols = seg.cols || 1;
  const vh = valueHeaders(cols, ui);
  const widths = colWidthsFor(cols);
  const totalCols = 2 + vh.length;
  const rows = [];

  const headerTexts = [ui.param, ...vh, ui.unit];
  rows.push(new TableRow({
    children: headerTexts.map((h, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      borders: cellBorders({
        top: { style: BorderStyle.SINGLE, size: THICK, color: BLACK },
        bottom: { style: BorderStyle.SINGLE, size: THIN, color: BLACK }
      }),
      children: [txt(h, { bold: true, size: 17, align: i === 0 ? AlignmentType.LEFT : (i === totalCols - 1 ? AlignmentType.LEFT : AlignmentType.RIGHT) })]
    }))
  }));

  const dataRows = seg.rows || [];
  dataRows.forEach((row, ri) => {
    const isLast = ri === dataRows.length - 1;
    const vals = rowValues(row, cols);
    const strong = ['base', 'sub', 'chk', 'kpi', 'margin'].indexOf(row.kind) > -1;
    const sepTop = ['sub', 'margin'].indexOf(row.kind) > -1;

    const cells = [];
    cells.push(new TableCell({
      width: { size: widths[0], type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      borders: cellBorders({
        top: sepTop ? { style: BorderStyle.SINGLE, size: THIN, color: GREY } : undefined,
        bottom: isLast ? { style: BorderStyle.SINGLE, size: THICK, color: BLACK } : undefined
      }),
      children: [txt(labelWithSign(row), { bold: strong, size: 18 })]
    }));
    vals.forEach((v, vi) => {
      const isTotalCol = cols >= 3 && vi === 2;
      cells.push(new TableCell({
        width: { size: widths[1 + vi], type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        borders: cellBorders({
          top: sepTop ? { style: BorderStyle.SINGLE, size: THIN, color: GREY } : undefined,
          bottom: isLast ? { style: BorderStyle.SINGLE, size: THICK, color: BLACK } : undefined
        }),
        children: [txt(v, { bold: strong || isTotalCol, size: 18, align: AlignmentType.RIGHT, mono: true })]
      }));
    });
    cells.push(new TableCell({
      width: { size: widths[totalCols - 1], type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      borders: cellBorders({
        top: sepTop ? { style: BorderStyle.SINGLE, size: THIN, color: GREY } : undefined,
        bottom: isLast ? { style: BorderStyle.SINGLE, size: THICK, color: BLACK } : undefined
      }),
      children: [txt(row.unit || '', { size: 16, color: '555555', mono: true })]
    }));

    rows.push(new TableRow({ children: cells }));
  });

  const table = new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE },
    rows
  });

  return [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 160, after: 40 },
      children: [new TextRun({ text: seg.title || '', bold: true, size: 19, color: BLACK, font: '微软雅黑' })]
    }),
    table
  ];
}

// 链路总览对比表（Word）：参数为行、链路为列；每块最多 4 列，超出分块为「续表」。
function buildWordOverview(links, ui) {
  const defs = overviewRowDefs(ui);
  const out = [];
  const CHUNK = 4;
  const first = links[0].summary || {};

  out.push(new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 60, after: 40 },
    children: [new TextRun({ text: ui.overviewTitle, bold: true, size: 22, color: BLACK, font: '微软雅黑' })]
  }));

  for (let start = 0; start < links.length; start += CHUNK) {
    const group = links.slice(start, start + CHUNK);
    const isCont = start > 0;
    const labelW = 2400;
    const colW = Math.floor((9000 - labelW) / group.length);
    const widths = [labelW, ...group.map(() => colW)];
    const fontSize = group.length <= 1 ? 19 : group.length === 2 ? 18 : group.length === 3 ? 17 : 16;

    if (isCont) {
      out.push(new Paragraph({
        spacing: { before: 120, after: 30 },
        children: [new TextRun({ text: ui.overviewTitle + ui.contMark, bold: true, size: 18, color: '555555', font: '微软雅黑' })]
      }));
    }

    const rows = [];
    // 表头：参数 | 链路名...
    rows.push(new TableRow({
      tableHeader: true,
      children: [
        new TableCell({
          width: { size: labelW, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
          borders: cellBorders({ top: { style: BorderStyle.SINGLE, size: THICK, color: BLACK }, bottom: { style: BorderStyle.SINGLE, size: THIN, color: BLACK } }),
          children: [txt(ui.param, { bold: true, size: fontSize })]
        }),
        ...group.map((l, gi) => new TableCell({
          width: { size: colW, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
          borders: cellBorders({ top: { style: BorderStyle.SINGLE, size: THICK, color: BLACK }, bottom: { style: BorderStyle.SINGLE, size: THIN, color: BLACK } }),
          children: [txt(`${ui.linkWord}${start + gi + 1}·${l.name || ''}`, { bold: true, size: fontSize, align: AlignmentType.RIGHT })]
        }))
      ]
    }));

    // 数据行
    defs.forEach((def, di) => {
      const [key, unit, strong] = def;
      const isLast = di === defs.length - 1;
      const baseVal = first[key];
      const cells = [
        new TableCell({
          width: { size: labelW, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
          borders: cellBorders({ bottom: isLast ? { style: BorderStyle.SINGLE, size: THICK, color: BLACK } : undefined }),
          children: [txt(ui.ov[key] + (unit ? `（${unit}）` : ''), { bold: strong, size: fontSize })]
        }),
        ...group.map((l, gi) => {
          const s = l.summary || {};
          const v = s[key] === undefined || s[key] === null ? '—' : String(s[key]);
          return new TableCell({
            width: { size: colW, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
            borders: cellBorders({ bottom: isLast ? { style: BorderStyle.SINGLE, size: THICK, color: BLACK } : undefined }),
            children: [txt(v, { bold: strong, size: fontSize, align: AlignmentType.RIGHT, mono: true })]
          });
        })
      ];
      rows.push(new TableRow({ children: cells }));
    });

    out.push(new Table({
      width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
      columnWidths: widths,
      layout: TableLayoutType.FIXED,
      borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE },
      rows
    }));
  }
  return out;
}

async function generateWord(links, reportMeta, ui) {
  const children = [];
  const multi = links.length > 1;

  // 文档标题
  children.push(new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 60 },
    children: [new TextRun({ text: reportMeta.title || ui.defaultTitle, bold: true, size: 30, color: BLACK, font: '微软雅黑' })]
  }));
  if (reportMeta.subtitle) {
    children.push(new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 200 },
      children: [new TextRun({ text: reportMeta.subtitle, size: 18, color: '555555', font: '微软雅黑' })]
    }));
  }

  // 多链路：总览对比表 + 差异说明
  if (multi && links.some((l) => l.summary)) {
    buildWordOverview(links, ui).forEach((el) => children.push(el));
    children.push(new Paragraph({
      spacing: { before: 80, after: 40 },
      children: [new TextRun({ text: ui.note(links.length, links[0].name || (ui.linkWord + '1')), size: 15, color: '777777', font: '微软雅黑' })]
    }));
  }

  // 逐链路章节
  links.forEach((link, li) => {
    if (multi) {
      children.push(new Paragraph({
        pageBreakBefore: true,
        spacing: { before: 120, after: 30 },
        children: [new TextRun({ text: `${ui.linkWord} ${li + 1} · ${link.name || ''}`, bold: true, size: 26, color: BLACK, font: '微软雅黑' })]
      }));
      if (link.subtitle) {
        children.push(new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({ text: link.subtitle, size: 17, color: '555555', font: '微软雅黑' })]
        }));
      }
    }
    (link.segments || []).forEach((seg) => {
      if (!seg || !seg.rows || seg.rows.length === 0) return;
      buildWordSegment(seg, ui).forEach((el) => children.push(el));
    });
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: '微软雅黑', size: 18 } } } },
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 900, right: 900 } } },
      children
    }]
  });
  return await Packer.toBuffer(doc);
}

// ============================================================
// Excel 生成（三线表）
// ============================================================
function setRowBorder(ws, rowNumber, fromCol, toCol, edges) {
  for (let c = fromCol; c <= toCol; c++) {
    const cell = ws.getCell(rowNumber, c);
    const b = Object.assign({}, cell.border);
    if (edges.top) b.top = edges.top;
    if (edges.bottom) b.bottom = edges.bottom;
    cell.border = b;
  }
}

const XL_THIN = { style: 'thin', color: { argb: 'FF000000' } };
const XL_MED = { style: 'medium', color: { argb: 'FF000000' } };
const XL_GREY = { style: 'hair', color: { argb: 'FF999999' } };
const XL_HL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3B0' } };

// 把一个 link 的七段瀑布写入工作表，返回写入后的下一行号
function writeLinkSheet(ws, link, ui) {
  const MAXCOL = 5;
  ws.columns = [{ width: 30 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 12 }];
  let r = 1;

  if (link.name) {
    ws.mergeCells(r, 1, r, MAXCOL);
    const tc = ws.getCell(r, 1);
    tc.value = link.name;
    tc.font = { name: '微软雅黑', bold: true, size: 16, color: { argb: 'FF000000' } };
    tc.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(r).height = 26;
    r++;
  }
  if (link.subtitle) {
    ws.mergeCells(r, 1, r, MAXCOL);
    const sub = ws.getCell(r, 1);
    sub.value = link.subtitle;
    sub.font = { name: '微软雅黑', size: 10, color: { argb: 'FF555555' } };
    sub.alignment = { horizontal: 'left', vertical: 'middle' };
    r++;
  }
  r++;

  (link.segments || []).forEach((seg) => {
    if (!seg || !seg.rows || seg.rows.length === 0) return;
    const cols = seg.cols || 1;
    const vh = valueHeaders(cols, ui);
    const totalCols = 2 + vh.length;

    ws.mergeCells(r, 1, r, totalCols);
    const cap = ws.getCell(r, 1);
    cap.value = seg.title || '';
    cap.font = { name: '微软雅黑', bold: true, size: 11, color: { argb: 'FF000000' } };
    cap.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(r).height = 20;
    r++;

    const headerTexts = [ui.param, ...vh, ui.unit];
    const headerRowNum = r;
    headerTexts.forEach((h, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = h;
      cell.font = { name: '微软雅黑', bold: true, size: 9, color: { argb: 'FF000000' } };
      cell.alignment = { horizontal: i === 0 ? 'left' : (i === totalCols - 1 ? 'left' : 'right'), vertical: 'middle' };
    });
    setRowBorder(ws, headerRowNum, 1, totalCols, { top: XL_MED, bottom: XL_THIN });
    r++;

    const dataRows = seg.rows;
    dataRows.forEach((row, ri) => {
      const isLast = ri === dataRows.length - 1;
      const vals = rowValues(row, cols);
      const strong = ['base', 'sub', 'chk', 'kpi', 'margin'].indexOf(row.kind) > -1;
      const sepTop = ['sub', 'margin'].indexOf(row.kind) > -1;
      const rowNum = r;

      const lc = ws.getCell(rowNum, 1);
      lc.value = labelWithSign(row);
      lc.font = { name: '微软雅黑', size: 10, bold: strong, color: { argb: 'FF1A1A1A' } };
      lc.alignment = { horizontal: 'left', vertical: 'middle' };

      vals.forEach((v, vi) => {
        const isTotalCol = cols >= 3 && vi === 2;
        const cell = ws.getCell(rowNum, 2 + vi);
        const sv = String(v).trim();
        const isNumeric = sv !== '' && !isNaN(sv) && !isNaN(parseFloat(sv));
        const num = v === '' || v === '—' ? v : (isNumeric ? parseFloat(v) : v);
        cell.value = num;
        cell.font = { name: 'Consolas', size: 10, bold: strong || isTotalCol, color: { argb: 'FF000000' } };
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      });

      const uc = ws.getCell(rowNum, totalCols);
      uc.value = row.unit || '';
      uc.font = { name: 'Consolas', size: 9, color: { argb: 'FF555555' } };
      uc.alignment = { horizontal: 'left', vertical: 'middle' };

      const edges = {};
      if (sepTop) edges.top = XL_GREY;
      if (isLast) edges.bottom = XL_MED;
      if (edges.top || edges.bottom) setRowBorder(ws, rowNum, 1, totalCols, edges);

      r++;
    });
    r++;
  });
  return r;
}

// 链路总览对比工作表（参数行 × 链路列，全列并排——Excel 可横向无限）
function writeOverviewSheet(ws, links, ui) {
  const defs = overviewRowDefs(ui);
  const n = links.length;
  ws.columns = [{ width: 22 }, ...links.map(() => ({ width: 20 }))];
  let r = 1;

  ws.mergeCells(r, 1, r, n + 1);
  const tc = ws.getCell(r, 1);
  tc.value = ui.overviewTitle;
  tc.font = { name: '微软雅黑', bold: true, size: 15, color: { argb: 'FF000000' } };
  tc.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(r).height = 24;
  r++;
  r++;

  // 表头
  const headerRow = r;
  const hp = ws.getCell(r, 1);
  hp.value = ui.param;
  hp.font = { name: '微软雅黑', bold: true, size: 10, color: { argb: 'FF000000' } };
  hp.alignment = { horizontal: 'left', vertical: 'middle' };
  links.forEach((l, i) => {
    const cell = ws.getCell(r, i + 2);
    cell.value = `${ui.linkWord}${i + 1}·${l.name || ''}`;
    cell.font = { name: '微软雅黑', bold: true, size: 10, color: { argb: 'FF000000' } };
    cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
  });
  setRowBorder(ws, headerRow, 1, n + 1, { top: XL_MED, bottom: XL_THIN });
  r++;

  const first = links[0].summary || {};
  defs.forEach((def, di) => {
    const [key, unit, strong] = def;
    const isLast = di === defs.length - 1;
    const lc = ws.getCell(r, 1);
    lc.value = ui.ov[key] + (unit ? `（${unit}）` : '');
    lc.font = { name: '微软雅黑', size: 10, bold: strong, color: { argb: 'FF1A1A1A' } };
    lc.alignment = { horizontal: 'left', vertical: 'middle' };

    const baseVal = first[key];
    links.forEach((l, i) => {
      const s = l.summary || {};
      const v = s[key] === undefined || s[key] === null ? '—' : s[key];
      const cell = ws.getCell(r, i + 2);
      const sv = String(v).trim();
      const isNumeric = sv !== '' && sv !== '—' && !isNaN(sv) && !isNaN(parseFloat(sv));
      cell.value = isNumeric ? parseFloat(v) : v;
      cell.font = { name: 'Consolas', size: 10, bold: strong, color: { argb: 'FF000000' } };
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    });

    const edges = {};
    if (isLast) edges.bottom = XL_MED;
    if (edges.bottom) setRowBorder(ws, r, 1, n + 1, edges);
    r++;
  });

  r++;
  const note = ws.getCell(r, 1);
  ws.mergeCells(r, 1, r, n + 1);
  note.value = ui.note(n, links[0].name || (ui.linkWord + '1'));
  note.font = { name: '微软雅黑', size: 9, color: { argb: 'FF777777' } };
  note.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
}

async function generateExcel(links, reportMeta, ui) {
  const wb = new ExcelJS.Workbook();
  wb.creator = ui.creator;
  wb.created = new Date();
  const multi = links.length > 1;

  if (multi && links.some((l) => l.summary)) {
    const ovWs = wb.addWorksheet(ui.overviewTitle, { views: [{ showGridLines: false }] });
    writeOverviewSheet(ovWs, links, ui);
  }

  if (!multi) {
    // 单链路：单工作表，标题用报告标题（保持原版式）
    const ws = wb.addWorksheet(reportMeta.title || ui.defaultTitle, { views: [{ showGridLines: false }] });
    writeLinkSheet(ws, { name: reportMeta.title || ui.defaultTitle, subtitle: reportMeta.subtitle, segments: links[0].segments }, ui);
    return await wb.xlsx.writeBuffer();
  }

  // 多链路：每链路一个工作表（表名去重并截断到 31 字符，Excel 限制）
  const usedNames = {};
  links.forEach((link, li) => {
    const base = (link.name || `${ui.linkWord}${li + 1}`).replace(/[\\/?*\[\]:]/g, ' ').trim() || `${ui.linkWord}${li + 1}`;
    let name = `${li + 1}·${base}`.slice(0, 31);
    let salt = 10;
    while (usedNames[name]) { name = `${li + 1}·${base}`.slice(0, 28) + '~' + (salt++); }
    usedNames[name] = true;
    const ws = wb.addWorksheet(name, { views: [{ showGridLines: false }] });
    writeLinkSheet(ws, link, ui);
  });

  return await wb.xlsx.writeBuffer();
}

// ============================================================
// PDF 生成（三线表，黑白；支持 CJK 字体 NotoSerifSC）
// ============================================================
function generatePDF(links, reportMeta, ui) {
  const serifPath = path.join(__dirname, 'fonts', 'NotoSerifSC-Regular.otf');
  const serifBoldPath = path.join(__dirname, 'fonts', 'NotoSerifSC-Bold.otf');
  const hasSerif = fs.existsSync(serifPath);
  const hasSerifBold = fs.existsSync(serifBoldPath);

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      size: 'A4',
      // 底边距取 20：页脚绘制在 y≈808，若边距 40 则超出 maxY(801.89)，
      // 会触发 pdfkit 自动分页 → 大量空白页（与普通版口径一致）。
      margins: { top: 40, bottom: 20, left: 45, right: 45 },
      info: { Title: reportMeta.title || ui.defaultTitle, Author: 'LinkLab Satellite Analysis' }
    });
    if (hasSerif) doc.registerFont('Serif', serifPath);
    if (hasSerifBold) doc.registerFont('SerifBold', serifBoldPath);
    const REG = hasSerif ? 'Serif' : 'Times-Roman';
    const BOLD = hasSerifBold ? 'SerifBold' : (hasSerif ? 'Serif' : 'Times-Bold');
    // 数值/单位列原用 Courier，无法渲染中文及 °/²/跳 等字符 → 乱码；
    // 有中文衬线字体时一律改用它（数字右对齐，等宽对齐损失可接受）。
    const MONO = hasSerif ? 'Serif' : 'Courier';
    const font = (f, size) => { doc.font(f).fontSize(size); return doc; };

    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const INK = '#000000', META = '#555555', FAINT = '#999999', HL = '#FFF3B0', GREYLINE = '#999999';
    const L = 45, W = 505;
    const TOP = 40, BOTTOM = 792;
    let y = TOP, page = 1;

    const footer = () => {
      doc.lineWidth(0.3).moveTo(L, 804).lineTo(L + W, 804).stroke(FAINT);
      font(REG, 7.5).fillColor(FAINT)
        .text(ui.footer(nowText()), L, 808, { width: W * 0.7, lineBreak: false })
        .text(`— ${page} —`, L, 808, { width: W, align: 'right', lineBreak: false });
    };
    const breakPage = () => { footer(); doc.addPage(); page++; y = TOP; };
    const ensure = (h) => { if (y + h > BOTTOM) breakPage(); };
    const hline = (x1, x2, weight, color) => { doc.lineWidth(weight).moveTo(x1, y).lineTo(x2, y).stroke(color || INK); };

    // —— 三线表渲染 ——
    const pdfColWidths = (cols) => {
      if (cols >= 3) return [175, 100, 100, 100, 30];
      if (cols >= 2) return [205, 125, 125, 50];
      return [230, 175, 100];
    };
    const ROWH = 15;

    const drawSegment = (seg) => {
      const cols = seg.cols || 1;
      const vh = valueHeaders(cols, ui);
      const widths = pdfColWidths(cols);
      const totalCols = 2 + vh.length;
      const headerTexts = [ui.param, ...vh, ui.unit];

      // 段标题
      ensure(18 + ROWH * 2);
      font(BOLD, 10).fillColor(INK).text(seg.title || '', L, y, { width: W, lineBreak: false });
      y += 15;

      // 表头：粗顶线 + 文本 + 细底线
      hline(L, L + W, 1.4, INK);
      y += 3;
      let drawHeaderTexts = () => {
        let x = L;
        headerTexts.forEach((h, i) => {
          const align = i === 0 ? 'left' : (i === totalCols - 1 ? 'left' : 'right');
          font(BOLD, 8).fillColor(INK).text(h, x + 2, y, { width: widths[i] - 4, align, lineBreak: false });
          x += widths[i];
        });
      };
      drawHeaderTexts();
      y += 11;
      hline(L, L + W, 0.5, INK);
      y += 1.5;

      const dataRows = seg.rows || [];
      dataRows.forEach((row, ri) => {
        const isLast = ri === dataRows.length - 1;
        const vals = rowValues(row, cols);
        const strong = ['base', 'sub', 'chk', 'kpi', 'margin'].indexOf(row.kind) > -1;
        const sepTop = ['sub', 'margin'].indexOf(row.kind) > -1;

        // 跨页：重绘表头
        if (y + ROWH > BOTTOM) {
          breakPage();
          font(BOLD, 9.5).fillColor(META).text((seg.title || '') + ui.contMark, L, y, { width: W, lineBreak: false });
          y += 13;
          hline(L, L + W, 1.4, INK); y += 3;
          drawHeaderTexts(); y += 11;
          hline(L, L + W, 0.5, INK); y += 1.5;
        }

        if (sepTop) { hline(L, L + W, 0.4, GREYLINE); }
        let x = L;
        // 参数列
        font(strong ? BOLD : REG, 8.5).fillColor(INK).text(labelWithSign(row), x + 2, y + 3, { width: widths[0] - 4, lineBreak: false });
        x += widths[0];
        // 数值列
        vals.forEach((v, vi) => {
          const isTotalCol = cols >= 3 && vi === 2;
          font((strong || isTotalCol) ? BOLD : MONO, 8.5).fillColor(INK)
            .text(v === '' ? '' : String(v), x + 2, y + 3, { width: widths[1 + vi] - 4, align: 'right', lineBreak: false });
          x += widths[1 + vi];
        });
        // 单位列
        font(MONO, 7.5).fillColor(META).text(row.unit || '', x + 2, y + 3.5, { width: widths[totalCols - 1] - 4, lineBreak: false });

        y += ROWH;
        if (isLast) { hline(L, L + W, 1.4, INK); }
      });
      y += 12;
    };

    // —— 链路总览对比表（PDF）——
    const drawOverview = () => {
      const defs = overviewRowDefs(ui);
      const CHUNK = 4;
      const first = links[0].summary || {};

      ensure(20);
      font(BOLD, 12).fillColor(INK).text(ui.overviewTitle, L, y, { width: W, lineBreak: false });
      y += 18;

      for (let start = 0; start < links.length; start += CHUNK) {
        const group = links.slice(start, start + CHUNK);
        const labelW = 120;
        const colW = (W - labelW) / group.length;
        const fs = group.length >= 4 ? 7.5 : group.length === 3 ? 8 : 8.5;

        ensure(ROWH * 3);
        if (start > 0) {
          font(BOLD, 9.5).fillColor(META).text(ui.overviewTitle + ui.contMark, L, y, { width: W, lineBreak: false });
          y += 13;
        }
        // 表头
        hline(L, L + W, 1.4, INK); y += 3;
        let x = L;
        font(BOLD, fs).fillColor(INK).text(ui.param, x + 2, y, { width: labelW - 4, lineBreak: false });
        x += labelW;
        group.forEach((l, gi) => {
          font(BOLD, fs).fillColor(INK).text(`${ui.linkWord}${start + gi + 1}·${l.name || ''}`, x + 2, y, { width: colW - 4, align: 'right', lineBreak: false });
          x += colW;
        });
        y += 11; hline(L, L + W, 0.5, INK); y += 1.5;

        defs.forEach((def, di) => {
          const [key, unit, strong] = def;
          const isLast = di === defs.length - 1;
          if (y + ROWH > BOTTOM) {
            breakPage();
            hline(L, L + W, 1.4, INK); y += 3;
            let xx = L;
            font(BOLD, fs).fillColor(INK).text(ui.param, xx + 2, y, { width: labelW - 4, lineBreak: false });
            xx += labelW;
            group.forEach((l, gi) => { font(BOLD, fs).fillColor(INK).text(`${ui.linkWord}${start + gi + 1}`, xx + 2, y, { width: colW - 4, align: 'right', lineBreak: false }); xx += colW; });
            y += 11; hline(L, L + W, 0.5, INK); y += 1.5;
          }
          const baseVal = first[key];
          let cx = L;
          font(strong ? BOLD : REG, fs).fillColor(INK).text(ui.ov[key] + (unit ? `（${unit}）` : ''), cx + 2, y + 3, { width: labelW - 4, lineBreak: false });
          cx += labelW;
          group.forEach((l, gi) => {
            const s = l.summary || {};
            const v = s[key] === undefined || s[key] === null ? '—' : String(s[key]);
            font(strong ? BOLD : MONO, fs).fillColor(INK).text(v, cx + 2, y + 3, { width: colW - 4, align: 'right', lineBreak: false });
            cx += colW;
          });
          y += ROWH;
          if (isLast) hline(L, L + W, 1.4, INK);
        });
        y += 6;
        font(REG, 7.5).fillColor(FAINT).text(ui.note(links.length, links[0].name || (ui.linkWord + '1')), L, y, { width: W });
        y += 16;
      }
      y += 4;
    };

    const multi = links.length > 1;

    // 文档标题
    doc.lineWidth(2.2).moveTo(L, y).lineTo(L + W, y).stroke(INK); y += 10;
    font(BOLD, 15).fillColor(INK).text(reportMeta.title || ui.defaultTitle, L, y, { width: W, align: multi ? 'center' : 'left' });
    y += multi ? 24 : 22;
    if (reportMeta.subtitle) {
      font(REG, 9).fillColor(META).text(reportMeta.subtitle, L, y, { width: W, align: multi ? 'center' : 'left' });
      y += 16;
    }
    doc.lineWidth(0.8).moveTo(L, y).lineTo(L + W, y).stroke(INK); y += 14;

    // 多链路：总览对比
    if (multi && links.some((l) => l.summary)) {
      drawOverview();
    }

    // 逐链路章节
    links.forEach((link, li) => {
      if (multi) {
        if (li > 0 || y > TOP + 40) breakPage();
        doc.lineWidth(2).moveTo(L, y).lineTo(L + W, y).stroke(INK); y += 8;
        font(BOLD, 13).fillColor(INK).text(`${ui.linkWord} ${li + 1} · ${link.name || ''}`, L, y, { width: W, lineBreak: false });
        y += 18;
        if (link.subtitle) {
          font(REG, 9).fillColor(META).text(link.subtitle, L, y, { width: W, lineBreak: false });
          y += 13;
        }
        doc.lineWidth(0.6).moveTo(L, y).lineTo(L + W, y).stroke(INK); y += 10;
      }
      (link.segments || []).forEach((seg) => {
        if (!seg || !seg.rows || seg.rows.length === 0) return;
        drawSegment(seg);
      });
    });

    footer();
    doc.end();
  });
}

// 删除旧文件
async function deleteCloudFile(fileID) {
  if (!fileID) return;
  try { await cloud.deleteFile({ fileList: [fileID] }); } catch (e) { /* ignore */ }
}

// ============================================================
// 入口
// ============================================================
exports.main = async (event) => {
  const { format, oldFileID, lang } = event;

  if (!['word', 'excel', 'pdf'].includes(format)) {
    return { success: false, error: '无效的导出格式，请使用 word、excel 或 pdf' };
  }

  const links = normalizeLinks(event);
  if (!links.length || links.every((l) => !l.segments || l.segments.length === 0)) {
    return { success: false, error: '未提供链路预算表数据' };
  }

  const ui = uiText(lang);
  const multi = links.length > 1;
  const reportMeta = multi
    ? {
        title: event.reportTitle || ui.batchTitle,
        subtitle: `${links.length} ${ui.linksUnit}　·　${nowText()}`
      }
    : { title: links[0].name || ui.defaultTitle, subtitle: links[0].subtitle || '' };

  try {
    if (oldFileID) await deleteCloudFile(oldFileID);

    let buffer, cloudPath;
    const ts = timestamp();
    if (format === 'word') {
      buffer = await generateWord(links, reportMeta, ui);
      cloudPath = `linkbudget/LinkBudgetPro_${ts}.docx`;
    } else if (format === 'excel') {
      buffer = await generateExcel(links, reportMeta, ui);
      cloudPath = `linkbudget/LinkBudgetPro_${ts}.xlsx`;
    } else {
      buffer = await generatePDF(links, reportMeta, ui);
      cloudPath = `linkbudget/LinkBudgetPro_${ts}.pdf`;
    }

    const uploadResult = await cloud.uploadFile({ cloudPath, fileContent: buffer });

    return {
      success: true,
      fileID: uploadResult.fileID,
      fileName: cloudPath.split('/').pop(),
      format
    };
  } catch (error) {
    console.error('导出链路预算表失败:', error);
    return { success: false, error: error.message || '导出失败' };
  }
};

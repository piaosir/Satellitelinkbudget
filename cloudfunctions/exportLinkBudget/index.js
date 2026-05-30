// 云函数入口 - 导出链路预算表（Word / Excel，三线表黑白风格）
// 直接复用前端「链路瀑布」的 segments 数据结构，确保 Word / Excel 与小程序内
// 链路预算表完全一致：黑白三线表（粗顶线 + 表头细线 + 粗底线，数据行无横线）。
const cloud = require('wx-server-sdk');
const ExcelJS = require('exceljs');
const {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  TableLayoutType, VerticalAlign
} = require('docx');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// ====== 多语言界面文案（表头 / 页脚 / 默认标题） ======
const I18N = {
  zh: {
    param: '参数', value: '数值', up: '上行', down: '下行', total: '合计', unit: '单位',
    defaultTitle: '链路预算表',
    footer: (t) => `生成时间：${t}　·　卫星链路预算计算系统`,
    creator: '卫星链路预算计算系统'
  },
  en: {
    param: 'Parameter', value: 'Value', up: 'Uplink', down: 'Downlink', total: 'Total', unit: 'Unit',
    defaultTitle: 'Link Budget Table',
    footer: (t) => `Generated: ${t}　·　Satellite Link Budget System`,
    creator: 'Satellite Link Budget System'
  }
};

function uiText(lang) {
  return I18N[lang === 'en' ? 'en' : 'zh'];
}

// ====== 公共：列定义 ======
// 根据段落列数返回数值列的表头文案
function valueHeaders(cols, ui) {
  if (cols >= 3) return [ui.up, ui.down, ui.total];
  if (cols >= 2) return [ui.up, ui.down];
  return [ui.value];
}

// 行的数值数组（按列数取 up/down/total）
function rowValues(row, cols) {
  if (cols >= 3) return [row.up || '', row.down || '', row.total || ''];
  if (cols >= 2) return [row.up || '', row.down || ''];
  return [row.up || ''];
}

// 带符号前缀的参数名（与页面 wf-sign 一致：+ − = 等）
function labelWithSign(row) {
  const sign = row.sign ? (row.sign + ' ') : '';
  return sign + (row.label || '');
}

function timestamp() {
  const d = new Date();
  // 北京时间
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

// ============================================================
// Word 生成（三线表）
// ============================================================
const BLACK = '000000';
const GREY = '999999';
const THICK = 18;  // 粗线（约 2.25pt）
const THIN = 6;    // 细线（约 0.75pt）
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

function cellBorders({ top, bottom } = {}) {
  return {
    top: top || NONE,
    bottom: bottom || NONE,
    left: NONE,
    right: NONE
  };
}

function txt(text, { bold = false, size = 18, align = AlignmentType.LEFT, color = BLACK, mono = false } = {}) {
  return new Paragraph({
    alignment: align,
    spacing: { before: 20, after: 20, line: 240 },
    children: [new TextRun({
      text: text == null ? '' : String(text),
      bold,
      size, // half-points
      color,
      font: mono ? 'Consolas' : '微软雅黑'
    })]
  });
}

// 列宽（百分比 → DXA，A4 正文约 9360 dxa）
function colWidthsFor(cols) {
  // 参数 | 数值列... | 单位（紧凑列宽，表格按总宽收紧，不撑满整页）
  if (cols >= 3) return [2800, 1300, 1300, 1300, 1000];
  if (cols >= 2) return [3000, 1500, 1500, 1100];
  return [3200, 1700, 1100];
}

function buildWordSegment(seg, ui) {
  const cols = seg.cols || 1;
  const vh = valueHeaders(cols, ui);
  const widths = colWidthsFor(cols);
  const totalCols = 2 + vh.length; // 参数 + 数值列 + 单位

  const rows = [];

  // 表头行：粗顶线 + 细底线
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

  // 数据行
  const dataRows = seg.rows || [];
  dataRows.forEach((row, ri) => {
    const isLast = ri === dataRows.length - 1;
    const vals = rowValues(row, cols);
    const strong = ['base', 'sub', 'chk', 'kpi', 'margin'].indexOf(row.kind) > -1;
    // 仅对小计/检查点/余量行加一条上方细分隔线，呼应页面样式
    const sepTop = ['sub', 'margin'].indexOf(row.kind) > -1;

    const cells = [];
    // 参数列
    cells.push(new TableCell({
      width: { size: widths[0], type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      borders: cellBorders({
        top: sepTop ? { style: BorderStyle.SINGLE, size: THIN, color: GREY } : undefined,
        bottom: isLast ? { style: BorderStyle.SINGLE, size: THICK, color: BLACK } : undefined
      }),
      children: [txt(labelWithSign(row), { bold: strong, size: 18 })]
    }));
    // 数值列
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
    // 单位列
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
    borders: {
      top: NONE, bottom: NONE, left: NONE, right: NONE,
      insideHorizontal: NONE, insideVertical: NONE
    },
    rows
  });

  return [
    // 表题（左对齐、加粗，置于顶线之上）
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 160, after: 40 },
      children: [new TextRun({ text: seg.title || '', bold: true, size: 19, color: BLACK, font: '微软雅黑' })]
    }),
    table
  ];
}

async function generateWord(segments, meta, ui) {
  const children = [];

  // 文档标题
  children.push(new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 60 },
    children: [new TextRun({ text: meta.title || ui.defaultTitle, bold: true, size: 30, color: BLACK, font: '微软雅黑' })]
  }));
  // 副标题（卫星 / 轨道 / 时间）
  if (meta.subtitle) {
    children.push(new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 200 },
      children: [new TextRun({ text: meta.subtitle, size: 18, color: '555555', font: '微软雅黑' })]
    }));
  }

  segments.forEach((seg) => {
    if (!seg || !seg.rows || seg.rows.length === 0) return;
    buildWordSegment(seg, ui).forEach((el) => children.push(el));
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

async function generateExcel(segments, meta, ui) {
  const wb = new ExcelJS.Workbook();
  wb.creator = ui.creator;
  wb.created = new Date();
  const ws = wb.addWorksheet(meta.title || ui.defaultTitle, {
    views: [{ showGridLines: false }]
  });

  // 最大列数：参数 + 上/下/合计 + 单位 = 5
  const MAXCOL = 5;
  ws.columns = [
    { width: 30 }, // 参数
    { width: 16 }, // 上行/数值
    { width: 16 }, // 下行
    { width: 16 }, // 合计
    { width: 12 }  // 单位
  ];

  const thinBlack = { style: 'thin', color: { argb: 'FF000000' } };
  const mediumBlack = { style: 'medium', color: { argb: 'FF000000' } };
  const thinGrey = { style: 'hair', color: { argb: 'FF999999' } };

  let r = 1;

  // 文档标题
  ws.mergeCells(r, 1, r, MAXCOL);
  const titleCell = ws.getCell(r, 1);
  titleCell.value = meta.title || ui.defaultTitle;
  titleCell.font = { name: '微软雅黑', bold: true, size: 16, color: { argb: 'FF000000' } };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(r).height = 26;
  r++;

  if (meta.subtitle) {
    ws.mergeCells(r, 1, r, MAXCOL);
    const sub = ws.getCell(r, 1);
    sub.value = meta.subtitle;
    sub.font = { name: '微软雅黑', size: 10, color: { argb: 'FF555555' } };
    sub.alignment = { horizontal: 'left', vertical: 'middle' };
    r++;
  }
  r++; // 空行

  segments.forEach((seg) => {
    if (!seg || !seg.rows || seg.rows.length === 0) return;
    const cols = seg.cols || 1;
    const vh = valueHeaders(cols, ui);
    const totalCols = 2 + vh.length; // 参数 + 数值列 + 单位

    // 表题（合并左对齐）
    ws.mergeCells(r, 1, r, totalCols);
    const cap = ws.getCell(r, 1);
    cap.value = seg.title || '';
    cap.font = { name: '微软雅黑', bold: true, size: 11, color: { argb: 'FF000000' } };
    cap.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(r).height = 20;
    r++;

    // 表头：参数 | 数值列... | 单位（粗顶线 + 细底线）
    const headerTexts = [ui.param, ...vh, ui.unit];
    const headerRowNum = r;
    headerTexts.forEach((h, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = h;
      cell.font = { name: '微软雅黑', bold: true, size: 9, color: { argb: 'FF000000' } };
      cell.alignment = {
        horizontal: i === 0 ? 'left' : (i === totalCols - 1 ? 'left' : 'right'),
        vertical: 'middle'
      };
    });
    setRowBorder(ws, headerRowNum, 1, totalCols, { top: mediumBlack, bottom: thinBlack });
    r++;

    // 数据行
    const dataRows = seg.rows;
    dataRows.forEach((row, ri) => {
      const isLast = ri === dataRows.length - 1;
      const vals = rowValues(row, cols);
      const strong = ['base', 'sub', 'chk', 'kpi', 'margin'].indexOf(row.kind) > -1;
      const sepTop = ['sub', 'margin'].indexOf(row.kind) > -1;
      const rowNum = r;

      // 参数列
      const lc = ws.getCell(rowNum, 1);
      lc.value = labelWithSign(row);
      lc.font = { name: '微软雅黑', size: 10, bold: strong, color: { argb: 'FF1A1A1A' } };
      lc.alignment = { horizontal: 'left', vertical: 'middle' };

      // 数值列
      vals.forEach((v, vi) => {
        const isTotalCol = cols >= 3 && vi === 2;
        const cell = ws.getCell(rowNum, 2 + vi);
        const num = v === '' || v === '—' ? v : (isNaN(parseFloat(v)) ? v : parseFloat(v));
        cell.value = num;
        cell.font = { name: 'Consolas', size: 10, bold: strong || isTotalCol, color: { argb: 'FF000000' } };
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      });

      // 单位列
      const uc = ws.getCell(rowNum, totalCols);
      uc.value = row.unit || '';
      uc.font = { name: 'Consolas', size: 9, color: { argb: 'FF555555' } };
      uc.alignment = { horizontal: 'left', vertical: 'middle' };

      const edges = {};
      if (sepTop) edges.top = thinGrey;
      if (isLast) edges.bottom = mediumBlack;
      if (edges.top || edges.bottom) setRowBorder(ws, rowNum, 1, totalCols, edges);

      r++;
    });

    r++; // 段间空行
  });

  return await wb.xlsx.writeBuffer();
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
  const { segments, meta = {}, format, oldFileID, lang } = event;

  if (!Array.isArray(segments) || segments.length === 0) {
    return { success: false, error: '未提供链路预算表数据' };
  }
  if (!['word', 'excel'].includes(format)) {
    return { success: false, error: '无效的导出格式，请使用 word 或 excel' };
  }

  const ui = uiText(lang);

  try {
    if (oldFileID) await deleteCloudFile(oldFileID);

    let buffer, cloudPath;
    const ts = timestamp();
    if (format === 'word') {
      buffer = await generateWord(segments, meta, ui);
      cloudPath = `linkbudget/LinkBudget_${ts}.docx`;
    } else {
      buffer = await generateExcel(segments, meta, ui);
      cloudPath = `linkbudget/LinkBudget_${ts}.xlsx`;
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

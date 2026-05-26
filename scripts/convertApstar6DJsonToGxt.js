/**
 * 将亚太6D的JSON数据反向转换为GXT格式
 * 运行: node scripts/convertApstar6DJsonToGxt.js
 *
 * 源目录: CoverageCloudData/亚太6D  (JSON格式)
 * 目标目录: C:\Users\85256\Desktop\亚太6D_GXT  (GXT格式, 同名同基础名)
 */
const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '../CoverageCloudData/亚太6D');
const targetDir = 'C:\\Users\\85256\\Desktop\\亚太6D_GXT';

/**
 * 将JSON对象转换为GXT文本格式
 */
function jsonToGxt(data) {
  const lines = [];

  // [FormatInfo]
  lines.push('[FormatInfo]');
  if (data.formatInfo && data.formatInfo.format_ver !== undefined) {
    lines.push(`format_ver=${data.formatInfo.format_ver}`);
  }
  lines.push('');

  // [GeoMain]
  lines.push('[GeoMain]');
  const geo = data.geoMain || {};
  if (geo.adm !== undefined)       lines.push(`adm=${geo.adm}`);
  if (geo.satName !== undefined)   lines.push(`sat_name=${geo.satName}`);
  if (geo.longitude !== undefined) lines.push(`long_nom=${geo.longitude}`);
  if (geo.nDiag !== undefined)     lines.push(`n_diag=${geo.nDiag}`);
  lines.push('');

  // [COHeader]
  lines.push('[COHeader]');
  const co = data.coHeader || {};
  if (co.beamId !== undefined)       lines.push(`beam_id=${co.beamId}`);
  if (co.emiRcp !== undefined)       lines.push(`emi_rcp=${co.emiRcp}`);
  if (co.polarization !== undefined) lines.push(`polar_disc=${co.polarization}`);
  if (co.reason !== undefined)       lines.push(`reason=${co.reason}`);
  if (co.nBore !== undefined)        lines.push(`n_bore=${co.nBore}`);
  if (co.nContours !== undefined)    lines.push(`n_cont=${co.nContours}`);
  lines.push('');

  // [B1], [B2], ...
  const bores = data.borePoints || [];
  bores.forEach(bore => {
    lines.push(`[B${bore.index}]`);
    if (bore.gain !== undefined) lines.push(`gain=${bore.gain}`);
    if (bore.pos && bore.pos.length === 2) {
      lines.push(`p=${bore.pos[0]};${bore.pos[1]}`);
    }
    lines.push('');
  });

  // [C1], [C2], ...
  const contours = data.contours || [];
  contours.forEach(contour => {
    lines.push(`[C${contour.i}]`);
    if (contour.g !== undefined) lines.push(`gain=${contour.g}`);
    const pts = contour.p || [];
    lines.push(`n_point=${pts.length}`);
    pts.forEach((pt, idx) => {
      lines.push(`p${idx}=${pt[0]};${pt[1]}`);
    });
    lines.push('');
  });

  return lines.join('\r\n');
}

// 确保目标目录存在
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
  console.log(`创建目录: ${targetDir}`);
}

// 读取源目录所有JSON文件
const jsonFiles = fs.readdirSync(sourceDir).filter(f => f.toLowerCase().endsWith('.json'));
console.log(`找到 ${jsonFiles.length} 个 JSON 文件\n`);

let successCount = 0;
let errorCount = 0;

jsonFiles.forEach(jsonFile => {
  const sourcePath = path.join(sourceDir, jsonFile);
  // 保持文件名不变，仅将扩展名从 .json 改为 .gxt
  const gxtFileName = jsonFile.replace(/\.json$/i, '.gxt');
  const targetPath = path.join(targetDir, gxtFileName);

  try {
    const raw = fs.readFileSync(sourcePath, 'utf-8');
    const data = JSON.parse(raw);
    const gxtContent = jsonToGxt(data);
    fs.writeFileSync(targetPath, gxtContent, 'utf-8');
    console.log(`  ✓ ${jsonFile} -> ${gxtFileName}`);
    successCount++;
  } catch (err) {
    console.error(`  ✗ ${jsonFile}: ${err.message}`);
    errorCount++;
  }
});

console.log(`\n完成! 成功: ${successCount}, 失败: ${errorCount}`);
console.log(`输出目录: ${targetDir}`);

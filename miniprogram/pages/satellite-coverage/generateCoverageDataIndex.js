/**
 * 生成覆盖数据静态索引文件
 * 微信小程序不支持动态 require，需要使用静态 require 预加载所有数据
 * 
 * 运行方式: node generateCoverageDataIndex.js
 */

const fs = require('fs');
const path = require('path');

// JSON/JS 文件目录
const JSON_DIR = path.join(__dirname, 'CoverageDATA', 'CoverageJSON');
// 输出索引文件
const OUTPUT_FILE = path.join(__dirname, 'CoverageDATA', 'coverageDataIndex.js');

/**
 * 递归遍历目录获取所有 JS 文件
 */
function getAllJsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      getAllJsFiles(filePath, fileList);
    } else if (file.toLowerCase().endsWith('.js')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

/**
 * 生成安全的变量名（用于 require）
 */
function generateVarName(index) {
  return `data_${index}`;
}

/**
 * 生成索引文件内容
 */
function generateIndexContent(files) {
  const lines = [];
  
  lines.push('/**');
  lines.push(' * 覆盖数据静态索引');
  lines.push(' * 自动生成，请勿手动编辑');
  lines.push(' * 生成时间: ' + new Date().toISOString());
  lines.push(' */');
  lines.push('');
  lines.push('// 静态 require 所有数据文件');
  
  const requireLines = [];
  const mapLines = [];
  
  files.forEach((filePath, index) => {
    // 计算相对路径（相对于 CoverageDATA 目录）
    const relativePath = path.relative(path.dirname(OUTPUT_FILE), filePath).replace(/\\/g, '/');
    
    // 生成完整路径键（用于查找）
    // 格式：/pages/satellite-coverage/CoverageDATA/CoverageJSON/中星6D/CHINASAT 6D_Ku_南亚_EIRP.js
    const keyPath = '/pages/satellite-coverage/CoverageDATA/' + 
      path.relative(path.join(__dirname, 'CoverageDATA'), filePath).replace(/\\/g, '/');
    
    const varName = generateVarName(index);
    
    requireLines.push(`const ${varName} = require('./${relativePath}');`);
    mapLines.push(`  '${keyPath}': ${varName}`);
  });
  
  lines.push(...requireLines);
  lines.push('');
  lines.push('// 路径到数据的映射');
  lines.push('const coverageDataMap = {');
  lines.push(mapLines.join(',\n'));
  lines.push('};');
  lines.push('');
  lines.push('/**');
  lines.push(' * 根据文件路径获取覆盖数据');
  lines.push(' * @param {string} filePath - 文件路径');
  lines.push(' * @returns {Object|null} 覆盖数据或 null');
  lines.push(' */');
  lines.push('function getCoverageData(filePath) {');
  lines.push('  return coverageDataMap[filePath] || null;');
  lines.push('}');
  lines.push('');
  lines.push('module.exports = {');
  lines.push('  getCoverageData,');
  lines.push('  coverageDataMap');
  lines.push('};');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * 主函数
 */
function main() {
  console.log('========================================');
  console.log('生成覆盖数据静态索引');
  console.log('========================================\n');
  
  // 检查源目录
  if (!fs.existsSync(JSON_DIR)) {
    console.error('错误: 数据目录不存在:', JSON_DIR);
    return;
  }
  
  // 获取所有 JS 文件
  const jsFiles = getAllJsFiles(JSON_DIR);
  console.log(`找到 ${jsFiles.length} 个数据文件\n`);
  
  if (jsFiles.length === 0) {
    console.error('错误: 没有找到任何数据文件');
    return;
  }
  
  // 生成索引内容
  const content = generateIndexContent(jsFiles);
  
  // 写入文件
  fs.writeFileSync(OUTPUT_FILE, content, 'utf-8');
  
  console.log('========================================');
  console.log(`索引文件已生成: ${OUTPUT_FILE}`);
  console.log(`包含 ${jsFiles.length} 个数据文件的映射`);
  console.log('========================================');
}

main();

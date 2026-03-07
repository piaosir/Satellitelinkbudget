/**
 * 将 JS 模块格式的覆盖数据转换为 JSON 格式
 * 运行: node scripts/convertJsToJson.js
 */
const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '../CoverageDATA_backup/CoverageJSON');
const targetDir = path.join(__dirname, '../CoverageCloudData');

// 确保目标目录存在
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// 获取所有卫星文件夹
const satellites = fs.readdirSync(sourceDir).filter(f => {
  return fs.statSync(path.join(sourceDir, f)).isDirectory();
});

console.log(`找到 ${satellites.length} 个卫星文件夹`);

let totalFiles = 0;
const fileIndex = {};

satellites.forEach(satellite => {
  const satSourceDir = path.join(sourceDir, satellite);
  const satTargetDir = path.join(targetDir, satellite);
  
  // 确保卫星目录存在
  if (!fs.existsSync(satTargetDir)) {
    fs.mkdirSync(satTargetDir, { recursive: true });
  }
  
  // 获取所有 JS 文件
  const jsFiles = fs.readdirSync(satSourceDir).filter(f => f.endsWith('.js'));
  
  jsFiles.forEach(jsFile => {
    const sourcePath = path.join(satSourceDir, jsFile);
    const jsonFileName = jsFile.replace('.js', '.json');
    const targetPath = path.join(satTargetDir, jsonFileName);
    
    try {
      // 读取 JS 文件内容
      const content = fs.readFileSync(sourcePath, 'utf-8');
      
      // 提取 module.exports = 后面的对象
      const match = content.match(/module\.exports\s*=\s*(\{[\s\S]*\});?\s*$/);
      if (match) {
        // 解析 JSON 对象
        const jsonStr = match[1];
        // 验证 JSON 有效性
        const data = eval('(' + jsonStr + ')');
        
        // 写入 JSON 文件
        fs.writeFileSync(targetPath, JSON.stringify(data), 'utf-8');
        
        // 记录到索引
        const cloudPath = `coverage/${satellite}/${jsonFileName}`;
        fileIndex[`${satellite}/${jsFile.replace('.js', '')}`] = cloudPath;
        
        totalFiles++;
        console.log(`✓ ${satellite}/${jsFile} -> ${jsonFileName}`);
      } else {
        console.error(`✗ ${satellite}/${jsFile}: 无法解析 module.exports`);
      }
    } catch (err) {
      console.error(`✗ ${satellite}/${jsFile}: ${err.message}`);
    }
  });
});

// 写入文件索引
const indexPath = path.join(targetDir, 'index.json');
fs.writeFileSync(indexPath, JSON.stringify(fileIndex, null, 2), 'utf-8');

console.log(`\n转换完成！共 ${totalFiles} 个文件`);
console.log(`索引文件: ${indexPath}`);

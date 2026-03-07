/**
 * 将新的 GXT 文件转换为 JSON 格式
 * 运行: node scripts/convertNewGxt.js
 * 
 * 处理三个卫星:
 * - 中星12 (新卫星)
 * - 中星19 (新卫星)
 * - 中星26（新）(替换现有数据)
 */
const fs = require('fs');
const path = require('path');

// GXT 文件源目录
const sourceBaseDir = 'C:\\Users\\85256\\Downloads\\20251222新gxt';
// 目标目录
const targetDir = path.join(__dirname, '../CoverageCloudData');

// 需要处理的卫星映射 (源文件夹名 -> 目标文件夹名)
const satelliteMapping = {
  '中星12': '中星12',
  '中星19': '中星19',
  '中星26（新）': '中星26'  // 替换现有数据
};

/**
 * 解析 GXT 文件内容为 JSON 对象
 */
function parseGxtFile(content, filename) {
  const lines = content.split('\n').map(l => l.trim());
  
  const result = {
    formatInfo: {},
    geoMain: {},
    coHeader: {},
    borePoints: [],
    contours: []
  };
  
  let currentSection = null;
  let currentBore = null;
  let currentContour = null;
  
  for (const line of lines) {
    // 跳过空行
    if (!line) continue;
    
    // 检测 section 头
    if (line.startsWith('[') && line.endsWith(']')) {
      // 保存之前的 contour（如果有）
      if (currentContour && currentContour.p.length > 0) {
        result.contours.push(currentContour);
        currentContour = null;
      }
      
      const sectionName = line.slice(1, -1);
      
      if (sectionName === 'FormatInfo') {
        currentSection = 'formatInfo';
      } else if (sectionName === 'GeoMain') {
        currentSection = 'geoMain';
      } else if (sectionName === 'COHeader') {
        currentSection = 'coHeader';
      } else if (sectionName.match(/^B\d+$/)) {
        currentSection = 'bore';
        currentBore = { index: parseInt(sectionName.slice(1)) };
      } else if (sectionName.match(/^C\d+$/)) {
        currentSection = 'contour';
        currentContour = { i: parseInt(sectionName.slice(1)), p: [] };
      }
      continue;
    }
    
    // 解析键值对
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    
    if (currentSection === 'formatInfo') {
      result.formatInfo[key] = value;
    } else if (currentSection === 'geoMain') {
      if (key === 'long_nom') {
        result.geoMain.longitude = parseFloat(value);
      } else if (key === 'sat_name') {
        result.geoMain.satName = value;
      } else if (key === 'n_diag') {
        result.geoMain.nDiag = parseInt(value);
      } else if (key === 'adm') {
        result.geoMain.adm = value;
      }
    } else if (currentSection === 'coHeader') {
      if (key === 'beam_id') {
        result.coHeader.beamId = parseInt(value);
      } else if (key === 'emi_rcp') {
        result.coHeader.emiRcp = value;
      } else if (key === 'polar_disc') {
        result.coHeader.polarization = value;
      } else if (key === 'reason') {
        result.coHeader.reason = value;
      } else if (key === 'n_bore') {
        result.coHeader.nBore = parseInt(value);
      } else if (key === 'n_cont') {
        result.coHeader.nContours = parseInt(value);
      }
    } else if (currentSection === 'bore') {
      if (key === 'gain') {
        currentBore.gain = parseFloat(value);
      } else if (key === 'p') {
        const coords = value.split(';').map(v => parseFloat(v.trim()));
        currentBore.pos = coords;
        result.borePoints.push(currentBore);
        currentBore = null;
      }
    } else if (currentSection === 'contour') {
      if (key === 'gain') {
        currentContour.g = parseFloat(value);
      } else if (key === 'n_point') {
        // 忽略点数，我们从实际点推断
      } else if (key.match(/^p\d+$/) || key === 'p') {
        const coords = value.split(';').map(v => parseFloat(v.trim()));
        currentContour.p.push(coords);
      }
    }
  }
  
  // 如果有未保存的 contour，保存它
  if (currentContour && currentContour.p.length > 0) {
    result.contours.push(currentContour);
  }
  
  return result;
}

/**
 * 处理单个卫星文件夹
 */
function processSatellite(sourceFolder, targetFolder) {
  const sourceDir = path.join(sourceBaseDir, sourceFolder);
  const satTargetDir = path.join(targetDir, targetFolder);
  
  // 检查源目录是否存在
  if (!fs.existsSync(sourceDir)) {
    console.error(`源目录不存在: ${sourceDir}`);
    return { success: 0, failed: 0, files: [] };
  }
  
  // 确保目标目录存在
  if (!fs.existsSync(satTargetDir)) {
    fs.mkdirSync(satTargetDir, { recursive: true });
    console.log(`创建目录: ${satTargetDir}`);
  }
  
  // 获取所有 GXT 文件
  const gxtFiles = fs.readdirSync(sourceDir).filter(f => f.toLowerCase().endsWith('.gxt'));
  
  let success = 0;
  let failed = 0;
  const processedFiles = [];
  
  gxtFiles.forEach(gxtFile => {
    const sourcePath = path.join(sourceDir, gxtFile);
    const jsonFileName = gxtFile.replace(/\.gxt$/i, '.json');
    const targetPath = path.join(satTargetDir, jsonFileName);
    
    try {
      // 读取 GXT 文件内容
      const content = fs.readFileSync(sourcePath, 'utf-8');
      
      // 解析 GXT 文件
      const data = parseGxtFile(content, gxtFile);
      
      // 验证数据有效性
      if (data.contours.length === 0) {
        console.warn(`⚠ ${sourceFolder}/${gxtFile}: 没有找到等值线数据`);
      }
      
      // 写入 JSON 文件
      fs.writeFileSync(targetPath, JSON.stringify(data), 'utf-8');
      
      processedFiles.push({
        source: gxtFile,
        target: jsonFileName,
        contours: data.contours.length
      });
      
      success++;
      console.log(`✓ ${sourceFolder}/${gxtFile} -> ${targetFolder}/${jsonFileName} (${data.contours.length} 条等值线)`);
    } catch (err) {
      failed++;
      console.error(`✗ ${sourceFolder}/${gxtFile}: ${err.message}`);
    }
  });
  
  return { success, failed, files: processedFiles };
}

/**
 * 更新索引文件
 */
function updateIndex(allFiles) {
  const indexPath = path.join(targetDir, 'index.json');
  
  // 读取现有索引
  let existingIndex = {};
  if (fs.existsSync(indexPath)) {
    existingIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  }
  
  // 对于中星26（替换），删除旧的条目
  const keysToRemove = Object.keys(existingIndex).filter(k => k.startsWith('中星26/'));
  keysToRemove.forEach(k => {
    delete existingIndex[k];
    console.log(`删除旧索引: ${k}`);
  });
  
  // 添加新条目
  Object.keys(allFiles).forEach(targetFolder => {
    allFiles[targetFolder].forEach(file => {
      const key = `${targetFolder}/${file.target.replace('.json', '')}`;
      const value = `coverage/${targetFolder}/${file.target}`;
      existingIndex[key] = value;
    });
  });
  
  // 按键排序
  const sortedIndex = {};
  Object.keys(existingIndex).sort().forEach(key => {
    sortedIndex[key] = existingIndex[key];
  });
  
  // 写入更新后的索引
  fs.writeFileSync(indexPath, JSON.stringify(sortedIndex, null, 2), 'utf-8');
  console.log(`\n索引文件已更新: ${indexPath}`);
}

// 主程序
console.log('开始转换 GXT 文件...\n');

const allProcessedFiles = {};
let totalSuccess = 0;
let totalFailed = 0;

Object.entries(satelliteMapping).forEach(([sourceFolder, targetFolder]) => {
  console.log(`\n处理卫星: ${sourceFolder} -> ${targetFolder}`);
  console.log('='.repeat(50));
  
  const result = processSatellite(sourceFolder, targetFolder);
  totalSuccess += result.success;
  totalFailed += result.failed;
  allProcessedFiles[targetFolder] = result.files;
});

// 更新索引
console.log('\n更新索引文件...');
updateIndex(allProcessedFiles);

console.log('\n' + '='.repeat(50));
console.log(`转换完成！成功: ${totalSuccess}, 失败: ${totalFailed}`);
console.log('\n接下来需要:');
console.log('1. 更新 coverageIndex.js 添加新卫星配置');
console.log('2. 将 CoverageCloudData 目录中的文件上传到云存储');

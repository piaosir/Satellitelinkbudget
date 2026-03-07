/**
 * 将中星12 C频段全球波束的 GXT 文件转换为 JSON 格式
 * 替换原有的 CHINASAT 12_C_CHINA_EIRP.json 和 CHINASAT 12_C_CHINA_GT.json
 * 运行: node scripts/convertCS12CGlobal.js
 */
const fs = require('fs');
const path = require('path');

// GXT 文件源目录
const sourceDir = 'C:\\Users\\85256\\Downloads\\中12+gxt新等2个文件\\中12 gxt新';
// 目标目录
const targetDir = path.join(__dirname, '../CoverageCloudData/中星12');

// 要删除的旧文件
const oldFiles = [
  'CHINASAT 12_C_CHINA_EIRP.json',
  'CHINASAT 12_C_CHINA_GT.json'
];

// 新文件映射
const fileMapping = [
  { source: 'CHINASAT 12_C_Global_EIRP.gxt', target: 'CHINASAT 12_C_Global_EIRP.json' },
  { source: 'CHINASAT 12_C_Global_GT.gxt', target: 'CHINASAT 12_C_Global_GT.json' }
];

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

// 主程序
console.log('开始处理中星12 C频段全球波束数据...\n');

// 1. 删除旧文件
console.log('步骤1: 删除旧的 C 频段数据文件');
oldFiles.forEach(file => {
  const filePath = path.join(targetDir, file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`  ✓ 已删除: ${file}`);
  } else {
    console.log(`  - 文件不存在: ${file}`);
  }
});

// 2. 转换新文件
console.log('\n步骤2: 转换新的 GXT 文件');
let success = 0;
let failed = 0;

fileMapping.forEach(({ source, target }) => {
  const sourcePath = path.join(sourceDir, source);
  const targetPath = path.join(targetDir, target);
  
  try {
    if (!fs.existsSync(sourcePath)) {
      console.error(`  ✗ 源文件不存在: ${source}`);
      failed++;
      return;
    }
    
    // 读取 GXT 文件内容
    const content = fs.readFileSync(sourcePath, 'utf-8');
    
    // 解析 GXT 文件
    const data = parseGxtFile(content, source);
    
    // 验证数据有效性
    if (data.contours.length === 0) {
      console.warn(`  ⚠ ${source}: 没有找到等值线数据`);
    }
    
    // 写入 JSON 文件
    fs.writeFileSync(targetPath, JSON.stringify(data), 'utf-8');
    
    console.log(`  ✓ ${source} -> ${target} (${data.contours.length} 条等值线)`);
    success++;
  } catch (err) {
    console.error(`  ✗ ${source}: ${err.message}`);
    failed++;
  }
});

// 3. 更新索引文件
console.log('\n步骤3: 更新索引文件');
const indexPath = path.join(__dirname, '../CoverageCloudData/index.json');

try {
  let index = {};
  if (fs.existsSync(indexPath)) {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  }
  
  // 删除旧的索引条目
  delete index['中星12/CHINASAT 12_C_CHINA_EIRP'];
  delete index['中星12/CHINASAT 12_C_CHINA_GT'];
  console.log('  ✓ 已删除旧索引条目');
  
  // 添加新的索引条目
  index['中星12/CHINASAT 12_C_Global_EIRP'] = 'coverage/中星12/CHINASAT 12_C_Global_EIRP.json';
  index['中星12/CHINASAT 12_C_Global_GT'] = 'coverage/中星12/CHINASAT 12_C_Global_GT.json';
  console.log('  ✓ 已添加新索引条目');
  
  // 按键排序
  const sortedIndex = {};
  Object.keys(index).sort().forEach(key => {
    sortedIndex[key] = index[key];
  });
  
  // 写入更新后的索引
  fs.writeFileSync(indexPath, JSON.stringify(sortedIndex, null, 2), 'utf-8');
  console.log(`  ✓ 索引文件已更新: ${indexPath}`);
} catch (err) {
  console.error(`  ✗ 更新索引失败: ${err.message}`);
}

console.log('\n' + '='.repeat(50));
console.log(`转换完成！成功: ${success}, 失败: ${failed}`);
console.log('\n接下来需要:');
console.log('1. 更新 miniprogram/data/coverageIndex.js 中的卫星配置（将 CHINA 改为 Global）');
console.log('2. 将新的 JSON 文件上传到云存储');

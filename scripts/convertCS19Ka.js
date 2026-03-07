/**
 * 将中星19 Ka波段 GXT 文件转换为 JSON 格式
 * 运行: node scripts/convertCS19Ka.js
 */
const fs = require('fs');
const path = require('path');

// GXT 文件源目录
const sourceDir = 'C:\\Users\\85256\\Desktop\\CS19 KA GXT';
// 目标目录
const targetDir = path.join(__dirname, '../CoverageCloudData/中星19');

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
 * 处理所有Ka波段GXT文件
 */
function processKaFiles() {
  // 检查源目录是否存在
  if (!fs.existsSync(sourceDir)) {
    console.error(`源目录不存在: ${sourceDir}`);
    return { success: 0, failed: 0, files: [] };
  }
  
  // 确保目标目录存在
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(`创建目录: ${targetDir}`);
  }
  
  // 获取所有 GXT 文件
  const gxtFiles = fs.readdirSync(sourceDir).filter(f => f.toLowerCase().endsWith('.gxt'));
  
  let success = 0;
  let failed = 0;
  const processedFiles = [];
  
  gxtFiles.forEach(gxtFile => {
    const sourcePath = path.join(sourceDir, gxtFile);
    const jsonFileName = gxtFile.replace(/\.gxt$/i, '.json');
    const targetPath = path.join(targetDir, jsonFileName);
    
    try {
      // 读取 GXT 文件内容
      const content = fs.readFileSync(sourcePath, 'utf-8');
      
      // 解析 GXT 文件
      const data = parseGxtFile(content, gxtFile);
      
      // 验证数据有效性
      if (data.contours.length === 0) {
        console.warn(`⚠ ${gxtFile}: 没有找到等值线数据`);
      }
      
      // 写入 JSON 文件
      fs.writeFileSync(targetPath, JSON.stringify(data), 'utf-8');
      
      processedFiles.push({
        source: gxtFile,
        target: jsonFileName,
        contours: data.contours.length
      });
      
      success++;
      console.log(`✓ ${gxtFile} -> ${jsonFileName} (${data.contours.length} 条等值线)`);
    } catch (err) {
      failed++;
      console.error(`✗ ${gxtFile}: ${err.message}`);
    }
  });
  
  return { success, failed, files: processedFiles };
}

/**
 * 更新索引文件
 */
function updateIndex(processedFiles) {
  const indexPath = path.join(__dirname, '../CoverageCloudData/index.json');
  
  // 读取现有索引
  let existingIndex = {};
  if (fs.existsSync(indexPath)) {
    existingIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  }
  
  // 添加新条目 (Ka波段)
  processedFiles.forEach(file => {
    const key = `中星19/${file.target.replace('.json', '')}`;
    const value = `coverage/中星19/${file.target}`;
    existingIndex[key] = value;
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
console.log('开始转换中星19 Ka波段 GXT 文件...\n');
console.log('='.repeat(60));

const result = processKaFiles();

if (result.files.length > 0) {
  // 更新索引
  console.log('\n更新索引文件...');
  updateIndex(result.files);
}

console.log('\n' + '='.repeat(60));
console.log(`转换完成！成功: ${result.success}, 失败: ${result.failed}`);
console.log('\n处理的文件列表:');
result.files.forEach(f => {
  console.log(`  - ${f.target}`);
});

console.log('\n接下来需要:');
console.log('1. 更新 coverageIndex.js 添加新的Ka波束配置 (已自动生成配置)');
console.log('2. 将 CoverageCloudData/中星19 目录中的新JSON文件上传到云存储');

// 输出需要添加到coverageIndex.js的配置
console.log('\n\n========== 需要添加到 coverageIndex.js 的配置 ==========\n');
const kaBeams = result.files.map(f => {
  // 解析文件名获取波束信息
  // 格式: CHINASAT 19_Ka_Beam No.1_EIRP.json 或 CHINASAT 19_Ka_馈电波束_EIRP.json
  const baseName = f.source.replace('.gxt', '');
  const parts = baseName.split('_');
  // parts[0] = "CHINASAT 19", parts[1] = "Ka", parts[2] = beam name, parts[3] = type
  const beamName = parts.slice(2, -1).join('_'); // 波束名称
  const type = parts[parts.length - 1]; // EIRP 或 GT
  
  return {
    band: 'Ka',
    beam: beamName,
    type: type,
    file: baseName + '.gxt'
  };
});

// 按波束编号排序
kaBeams.sort((a, b) => {
  // 提取波束编号
  const getNum = (beam) => {
    const match = beam.beam.match(/Beam No\.(\d+)/);
    if (match) return parseInt(match[1]);
    if (beam.beam === '馈电波束') return 999; // 馈电波束放最后
    return 0;
  };
  const numA = getNum(a);
  const numB = getNum(b);
  if (numA !== numB) return numA - numB;
  // 同一波束，EIRP在GT前面
  return a.type === 'EIRP' ? -1 : 1;
});

console.log('      // Ka波束');
kaBeams.forEach(beam => {
  console.log(`      { band: '${beam.band}', beam: '${beam.beam}', type: '${beam.type}', file: '${beam.file}' },`);
});

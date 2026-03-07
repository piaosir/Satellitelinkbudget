/**
 * 将中星19 Ka波段 USER BEAM G/T GXT 文件转换为 JSON 格式
 * 运行: node scripts/convertCS19KaUserBeamGT.js
 */
const fs = require('fs');
const path = require('path');

// GXT 文件路径
const sourceFile = path.join(__dirname, 'CHINASAT 19_Ka_USER BEAM_GT.gxt');
// 目标目录
const targetDir = path.join(__dirname, '../CoverageCloudData/中星19');

/**
 * 解析 GXT 文件内容为 JSON 对象
 */
function parseGxtFile(content) {
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
      } else if (key.match(/^p\d*$/)) {
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
 * 将用户波束数据按波束分组（根据bore point位置分组contours）
 */
function splitByBeams(data) {
  // 这个文件是所有28个用户波束合在一起的
  // 我们直接保存为一个整体文件
  return data;
}

/**
 * 处理GXT文件
 */
function processFile() {
  // 检查源文件是否存在
  if (!fs.existsSync(sourceFile)) {
    console.error(`源文件不存在: ${sourceFile}`);
    return false;
  }
  
  // 确保目标目录存在
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(`创建目录: ${targetDir}`);
  }
  
  try {
    // 读取 GXT 文件
    const content = fs.readFileSync(sourceFile, 'utf8');
    
    // 解析内容
    const data = parseGxtFile(content);
    
    // 输出文件名
    const targetPath = path.join(targetDir, 'CHINASAT 19_Ka_USER BEAM_GT.json');
    
    // 写入 JSON 文件
    fs.writeFileSync(targetPath, JSON.stringify(data));
    
    console.log(`成功转换: ${path.basename(targetPath)}`);
    console.log(`  - 波束点数: ${data.borePoints.length}`);
    console.log(`  - 等值线数: ${data.contours.length}`);
    
    return true;
  } catch (err) {
    console.error(`处理失败: ${err.message}`);
    return false;
  }
}

// 执行转换
console.log('开始转换中星19 Ka用户波束 G/T 数据...');
console.log('=====================================');

const success = processFile();

console.log('=====================================');
if (success) {
  console.log('转换完成！');
} else {
  console.log('转换失败！');
}

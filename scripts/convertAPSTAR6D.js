/**
 * 将亚太6D用户波束GXT文件转换为JSON格式并添加到云数据集
 * 运行: node scripts/convertAPSTAR6D.js
 * 
 * 源目录: C:\Users\85256\Desktop\亚太6D用户波束EIRP和GT
 *   - 亚太6D EIRP (EIRP文件)
 *   - 亚太6D GT   (GT文件)
 * 目标目录: CoverageCloudData/亚太6D
 * 
 * 命名规则: APSTAR 6D_Ku_BeamXX_EIRP.json / APSTAR 6D_Ku_BeamXX_GT.json
 * 其中XX为波束号 (如 01a, 01b, 02, 03, ...)
 */
const fs = require('fs');
const path = require('path');

// 源目录
const eirpDir = 'C:\\Users\\85256\\Desktop\\亚太6D用户波束EIRP和GT\\亚太6D EIRP';
const gtDir = 'C:\\Users\\85256\\Desktop\\亚太6D用户波束EIRP和GT\\亚太6D GT';
// 目标目录
const targetDir = path.join(__dirname, '../CoverageCloudData/亚太6D');
// 索引文件路径
const indexPath = path.join(__dirname, '../CoverageCloudData/index.json');

/**
 * 从GXT文件名提取波束号
 * 例如: Beam01a_EIRP.gxt -> 01a, Beam02_GT.gxt -> 02
 */
function extractBeamId(filename) {
  const match = filename.match(/Beam(\d+[a-z]?)_/i);
  return match ? match[1] : null;
}

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
    if (!line) continue;
    
    // 检测 section 头
    if (line.startsWith('[') && line.endsWith(']')) {
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
        // 忽略
      } else if (key.match(/^[Pp]\d*$/)) {
        const coords = value.split(';').map(v => parseFloat(v.trim()));
        currentContour.p.push(coords);
      }
    }
  }
  
  // 保存最后一个contour
  if (currentContour && currentContour.p.length > 0) {
    result.contours.push(currentContour);
  }
  
  return result;
}

/**
 * 处理一个目录下的所有GXT文件
 */
function processDirectory(dir, type) {
  if (!fs.existsSync(dir)) {
    console.error(`源目录不存在: ${dir}`);
    return [];
  }
  
  const gxtFiles = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.gxt'));
  console.log(`[${type}] 找到 ${gxtFiles.length} 个 GXT 文件`);
  
  const processedFiles = [];
  
  gxtFiles.forEach(gxtFile => {
    const beamId = extractBeamId(gxtFile);
    if (!beamId) {
      console.warn(`⚠ 无法解析波束号: ${gxtFile}`);
      return;
    }
    
    // 生成目标文件名: APSTAR 6D_Ku_BeamXX_EIRP/GT.json
    const jsonFileName = `APSTAR 6D_Ku_Beam${beamId}_${type}.json`;
    const sourcePath = path.join(dir, gxtFile);
    const targetPath = path.join(targetDir, jsonFileName);
    
    try {
      const content = fs.readFileSync(sourcePath, 'utf-8');
      const data = parseGxtFile(content);
      
      if (data.contours.length === 0) {
        console.warn(`⚠ ${gxtFile}: 没有找到等值线数据`);
      }
      
      fs.writeFileSync(targetPath, JSON.stringify(data), 'utf-8');
      
      processedFiles.push({
        source: gxtFile,
        target: jsonFileName,
        beamId: beamId,
        contours: data.contours.length,
        borePoints: data.borePoints.length
      });
      
      console.log(`  ✓ ${gxtFile} -> ${jsonFileName} (${data.contours.length} 条等值线, bore=${data.borePoints.length})`);
    } catch (err) {
      console.error(`  ✗ ${gxtFile}: ${err.message}`);
    }
  });
  
  return processedFiles;
}

/**
 * 更新索引文件
 */
function updateIndex(processedFiles) {
  let existingIndex = {};
  if (fs.existsSync(indexPath)) {
    let raw = fs.readFileSync(indexPath, 'utf-8');
    // 去掉 BOM
    if (raw.charCodeAt(0) === 0xFEFF) {
      raw = raw.slice(1);
    }
    existingIndex = JSON.parse(raw);
  }
  
  processedFiles.forEach(file => {
    const key = `亚太6D/${file.target.replace('.json', '')}`;
    const value = `coverage/亚太6D/${file.target}`;
    existingIndex[key] = value;
  });
  
  // 按键排序
  const sortedIndex = {};
  Object.keys(existingIndex).sort().forEach(key => {
    sortedIndex[key] = existingIndex[key];
  });
  
  fs.writeFileSync(indexPath, JSON.stringify(sortedIndex, null, 2), 'utf-8');
  console.log(`\n索引文件已更新: ${indexPath}`);
  console.log(`共 ${Object.keys(sortedIndex).length} 条索引记录`);
}

// ========== 主程序 ==========
console.log('开始转换亚太6D用户波束 GXT 文件...\n');
console.log(`EIRP 源目录: ${eirpDir}`);
console.log(`GT   源目录: ${gtDir}`);
console.log(`目标目录:     ${targetDir}`);
console.log('='.repeat(70));

// 确保目标目录存在
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
  console.log(`创建目录: ${targetDir}\n`);
}

// 处理 EIRP 文件
console.log('\n--- 处理 EIRP 文件 ---');
const eirpFiles = processDirectory(eirpDir, 'EIRP');

// 处理 GT 文件
console.log('\n--- 处理 GT 文件 ---');
const gtFiles = processDirectory(gtDir, 'GT');

const allFiles = [...eirpFiles, ...gtFiles];

if (allFiles.length > 0) {
  console.log('\n--- 更新索引 ---');
  updateIndex(allFiles);
}

console.log('\n' + '='.repeat(70));
console.log(`转换完成！`);
console.log(`  EIRP: ${eirpFiles.length} 个文件`);
console.log(`  GT:   ${gtFiles.length} 个文件`);
console.log(`  总计: ${allFiles.length} 个文件`);
console.log('\n接下来需要:');
console.log('1. 将 CoverageCloudData/亚太6D 目录中的文件上传到云存储');
console.log('2. 更新云端的 index.json 索引文件');

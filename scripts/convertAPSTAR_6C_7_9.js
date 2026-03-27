/**
 * 将亚太6C、亚太7、亚太9的GXT文件转换为JSON格式并添加到云数据集
 * 运行: node scripts/convertAPSTAR_6C_7_9.js
 * 
 * 源目录: C:\Users\85256\Desktop\亚太卫星GXT文件\亚太卫星GXT文件
 * 
 * 文件分析：
 * 亚太6C (134°E): C EIRP/GT (无波束名→亚太波束), Ku EIRP/GT (无波束名→亚太波束)
 * 亚太7  (76.5°E): C EIRP/GT (无波束名→亚太波束), Ku Africa Beam EIRP/GT, Ku China Beam EIRP/GT
 * 亚太9  (142°E): C EIRP/GT (无波束名→亚太波束), Ku West Beam EIRP/GT
 */
const fs = require('fs');
const path = require('path');

const sourceDir = 'C:\\Users\\85256\\Desktop\\亚太卫星GXT文件\\亚太卫星GXT文件';
const cloudDataDir = path.join(__dirname, '../CoverageCloudData');
const indexPath = path.join(cloudDataDir, 'index.json');

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
  
  if (currentContour && currentContour.p.length > 0) {
    result.contours.push(currentContour);
  }
  
  return result;
}

/**
 * 定义三颗卫星的文件映射
 * 卫星英文名 → { displayName, position, folder, files: [{source, band, beam, type}] }
 */
const satelliteConfigs = {
  'APSTAR 6C': {
    displayName: '亚太6C',
    position: 134,
    folder: '亚太6C',
    files: [
      { source: 'Apstar 6C C EIRP.gxt',  band: 'C',  beam: '亚太波束', type: 'EIRP' },
      { source: 'Apstar 6C C GT.gxt',     band: 'C',  beam: '亚太波束', type: 'GT' },
      { source: 'Apstar 6C Ku EIRP.gxt',  band: 'Ku', beam: '亚太波束', type: 'EIRP' },
      { source: 'Apstar 6C Ku GT.gxt',    band: 'Ku', beam: '亚太波束', type: 'GT' }
    ]
  },
  'APSTAR 7': {
    displayName: '亚太7',
    position: 76.5,
    folder: '亚太7',
    files: [
      { source: 'Apstar 7 C EIRP.gxt',              band: 'C',  beam: '亚太波束',    type: 'EIRP' },
      { source: 'Apstar 7 C GT.gxt',                 band: 'C',  beam: '亚太波束',    type: 'GT' },
      { source: 'Apstar 7 Ku Africa Beam EIRP.gxt',  band: 'Ku', beam: 'Africa Beam', type: 'EIRP' },
      { source: 'Apstar 7 Ku Africa Beam GT.gxt',    band: 'Ku', beam: 'Africa Beam', type: 'GT' },
      { source: 'Apstar 7 Ku China Beam ERIP.gxt',   band: 'Ku', beam: 'China Beam',  type: 'EIRP' },  // 注意：源文件名拼写为 ERIP
      { source: 'Apstar 7 Ku China Beam GT.gxt',     band: 'Ku', beam: 'China Beam',  type: 'GT' }
    ]
  },
  'APSTAR 9': {
    displayName: '亚太9',
    position: 142,
    folder: '亚太9',
    files: [
      { source: 'Apstar 9 C EIRP.gxt',             band: 'C',  beam: '亚太波束',   type: 'EIRP' },
      { source: 'Apstar 9 C GT.gxt',                band: 'C',  beam: '亚太波束',   type: 'GT' },
      { source: 'Apstar 9 Ku West Beam EIRP.gxt',   band: 'Ku', beam: 'West Beam', type: 'EIRP' },
      { source: 'Apstar 9 Ku West Beam GT.gxt',     band: 'Ku', beam: 'West Beam', type: 'GT' }
    ]
  }
};

/**
 * 生成JSON文件名
 * 格式: APSTAR XX_Band_Beam_TYPE.json
 */
function makeJsonFilename(satName, band, beam, type) {
  return `${satName}_${band}_${beam}_${type}.json`;
}

// ========== 主程序 ==========
console.log('开始转换亚太6C/7/9 GXT文件...\n');
console.log(`源目录: ${sourceDir}`);
console.log('='.repeat(70));

// 读取现有索引
let existingIndex = {};
if (fs.existsSync(indexPath)) {
  let raw = fs.readFileSync(indexPath, 'utf-8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  existingIndex = JSON.parse(raw);
}

let totalSuccess = 0;
let totalFailed = 0;

for (const [satName, config] of Object.entries(satelliteConfigs)) {
  console.log(`\n--- ${config.displayName} (${satName}, ${config.position}°E) ---`);
  
  const targetDir = path.join(cloudDataDir, config.folder);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(`创建目录: ${targetDir}`);
  }
  
  for (const fileConfig of config.files) {
    const sourcePath = path.join(sourceDir, fileConfig.source);
    const jsonFilename = makeJsonFilename(satName, fileConfig.band, fileConfig.beam, fileConfig.type);
    const targetPath = path.join(targetDir, jsonFilename);
    
    try {
      if (!fs.existsSync(sourcePath)) {
        console.error(`  ✗ 源文件不存在: ${fileConfig.source}`);
        totalFailed++;
        continue;
      }
      
      const content = fs.readFileSync(sourcePath, 'utf-8');
      const data = parseGxtFile(content);
      
      if (data.contours.length === 0) {
        console.warn(`  ⚠ ${fileConfig.source}: 没有找到等值线数据`);
      }
      
      fs.writeFileSync(targetPath, JSON.stringify(data), 'utf-8');
      
      // 更新索引
      const indexKey = `${config.folder}/${jsonFilename.replace('.json', '')}`;
      const indexValue = `coverage/${config.folder}/${jsonFilename}`;
      existingIndex[indexKey] = indexValue;
      
      console.log(`  ✓ ${fileConfig.source} -> ${jsonFilename} (${data.contours.length} 条等值线, bore=${data.borePoints.length})`);
      totalSuccess++;
    } catch (err) {
      console.error(`  ✗ ${fileConfig.source}: ${err.message}`);
      totalFailed++;
    }
  }
}

// 按键排序并写入索引
const sortedIndex = {};
Object.keys(existingIndex).sort().forEach(key => {
  sortedIndex[key] = existingIndex[key];
});
fs.writeFileSync(indexPath, JSON.stringify(sortedIndex, null, 2), 'utf-8');
console.log(`\n索引文件已更新，共 ${Object.keys(sortedIndex).length} 条记录`);

console.log('\n' + '='.repeat(70));
console.log(`转换完成！成功: ${totalSuccess}, 失败: ${totalFailed}`);

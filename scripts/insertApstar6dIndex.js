/**
 * 将亚太6D配置块插入coverageIndex.js中，放在中星26之后
 */
const fs = require('fs');
const path = require('path');

const indexFile = path.join(__dirname, '../miniprogram/pages/satellite-coverage/coverageIndex.js');
const blockFile = path.join(__dirname, 'apstar6d_index_block.txt');

let content = fs.readFileSync(indexFile, 'utf-8');
const block = fs.readFileSync(blockFile, 'utf-8');

// 检查是否已存在
if (content.includes("'APSTAR 6D'")) {
  console.log('亚太6D (APSTAR 6D) 已存在于coverageIndex中，跳过');
  process.exit(0);
}

// 在 "// 中星12" 之前插入亚太6D块
const insertBefore = '// 中星12';
const cs26End = content.indexOf(insertBefore);

if (cs26End === -1) {
  console.error('找不到中星12标记');
  process.exit(1);
}

// 在 `// 中星12` 之前插入亚太6D块
const newContent = content.slice(0, cs26End) + block.trimStart() + '\n\n  ' + content.slice(cs26End);

fs.writeFileSync(indexFile, newContent, 'utf-8');
console.log('成功将亚太6D配置插入coverageIndex.js');

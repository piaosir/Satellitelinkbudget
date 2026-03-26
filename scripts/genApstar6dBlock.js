const fs = require('fs');
const eirpFiles = fs.readdirSync('CoverageCloudData/亚太6D').filter(f => f.includes('EIRP')).sort();
const gtFiles = fs.readdirSync('CoverageCloudData/亚太6D').filter(f => f.includes('GT')).sort();
const eirpBeams = eirpFiles.map(f => f.match(/Beam(\w+)_EIRP/)[1]);
const gtBeams = gtFiles.map(f => f.match(/Beam(\w+)_GT/)[1]);
const allBeams = [...new Set([...eirpBeams, ...gtBeams])].sort((a,b) => {
  const numA = parseInt(a); const numB = parseInt(b);
  if (numA !== numB) return numA - numB;
  return a.localeCompare(b);
});
const entries = [];
allBeams.forEach(beam => {
  if (eirpBeams.includes(beam)) {
    entries.push(`      { band: 'Ku', beam: '${beam}', type: 'EIRP', file: 'APSTAR 6D_Ku_Beam${beam}_EIRP.json' }`);
  }
  if (gtBeams.includes(beam)) {
    entries.push(`      { band: 'Ku', beam: '${beam}', type: 'GT', file: 'APSTAR 6D_Ku_Beam${beam}_GT.json' }`);
  }
});

const block = `
  // 亚太6D - Ku波段用户波束
  'APSTAR 6D': {
    displayName: '亚太6D',
    position: 134,
    folder: '亚太6D',
    beams: [
${entries.join(',\n')}
    ]
  },`;

fs.writeFileSync('scripts/apstar6d_index_block.txt', block, 'utf-8');
console.log('Generated block with', entries.length, 'entries');

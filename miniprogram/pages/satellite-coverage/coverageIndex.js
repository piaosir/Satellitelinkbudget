/**
 * 卫星覆盖数据索引
 * 组织所有可用的GXT覆盖数据文件
 * 
 * 注意：覆盖数据已移至云存储，从云端动态加载
 */

// 覆盖数据基础路径 (GXT原始文件)
const COVERAGE_BASE_PATH_GXT = '/pages/satellite-coverage/CoverageDATA/CoverageForWechat/';
// 覆盖数据基础路径 (JSON转换后文件 - 现在从云存储加载)
const COVERAGE_BASE_PATH = '/pages/satellite-coverage/CoverageDATA/CoverageJSON/';

// 卫星覆盖数据索引 - 索引数据保留在本地，实际数据从云存储加载
const coverageIndex = {
  // 中星6C - C波段
  'CHINASAT 6C': {
    displayName: '中星6C',
    position: 130,
    folder: '中星6C',
    beams: [
      { band: 'C', beam: '1B', type: 'EIRP', file: 'CHINASAT 6C_C_1B_EIRP.gxt' },
      { band: 'C', beam: '2A', type: 'EIRP', file: 'CHINASAT 6C_C_2A_EIRP.gxt' },
      { band: 'C', beam: '2B', type: 'EIRP', file: 'CHINASAT 6C_C_2B_EIRP.gxt' },
      { band: 'C', beam: '3A', type: 'EIRP', file: 'CHINASAT 6C_C_3A_EIRP.gxt' },
      { band: 'C', beam: '3B', type: 'EIRP', file: 'CHINASAT 6C_C_3B_EIRP.gxt' },
      { band: 'C', beam: '4A', type: 'EIRP', file: 'CHINASAT 6C_C_4A_EIRP.gxt' },
      { band: 'C', beam: '4B', type: 'EIRP', file: 'CHINASAT 6C_C_4B_EIRP.gxt' },
      { band: 'C', beam: '5A', type: 'EIRP', file: 'CHINASAT 6C_C_5A_EIRP.gxt' },
      { band: 'C', beam: '5B', type: 'EIRP', file: 'CHINASAT 6C_C_5B_EIRP.gxt' },
      { band: 'C', beam: '6A', type: 'EIRP', file: 'CHINASAT 6C_C_6A_EIRP.gxt' },
      { band: 'C', beam: '6B', type: 'EIRP', file: 'CHINASAT 6C_C_6B_EIRP.gxt' },
      { band: 'C', beam: '7A', type: 'EIRP', file: 'CHINASAT 6C_C_7A_EIRP.gxt' },
      { band: 'C', beam: '7B', type: 'EIRP', file: 'CHINASAT 6C_C_7B_EIRP.gxt' },
      { band: 'C', beam: '8B', type: 'EIRP', file: 'CHINASAT 6C_C_8B_EIRP.gxt' },
      { band: 'C', beam: '9A', type: 'EIRP', file: 'CHINASAT 6C_C_9A_EIRP.gxt' },
      { band: 'C', beam: '9B', type: 'EIRP', file: 'CHINASAT 6C_C_9B_EIRP.gxt' },
      { band: 'C', beam: '10A', type: 'EIRP', file: 'CHINASAT 6C_C_10A_EIRP.gxt' },
      { band: 'C', beam: '10B', type: 'EIRP', file: 'CHINASAT 6C_C_10B_EIRP.gxt' },
      { band: 'C', beam: '11A', type: 'EIRP', file: 'CHINASAT 6C_C_11A_EIRP.gxt' },
      { band: 'C', beam: '11B', type: 'EIRP', file: 'CHINASAT 6C_C_11B_EIRP.gxt' },
      { band: 'C', beam: '12A', type: 'EIRP', file: 'CHINASAT 6C_C_12A_EIRP.gxt' },
      { band: 'C', beam: '12B', type: 'EIRP', file: 'CHINASAT 6C_C_12B_EIRP.gxt' },
      { band: 'C', beam: '13B', type: 'EIRP', file: 'CHINASAT 6C_C_13B_EIRP.gxt' },
      { band: 'C', beam: 'China Transponder1A', type: 'EIRP', file: 'CHINASAT 6C_C_China Transponder1A_EIRP.gxt' }
      // G/T 暂不开放选择
      // { band: 'C', beam: 'China Transponder1A', type: 'GT', file: 'CHINASAT 6C_C_China Transponder1A_GT.gxt' }
    ]
  },

  // 中星6D
  'CHINASAT 6D': {
    displayName: '中星6D',
    position: 125,
    folder: '中星6D',
    beams: [
      { band: 'C', beam: '中国波束', type: 'EIRP', file: 'CHINASAT 6D_C_中国波束_EIRP.gxt' },
      { band: 'Ku', beam: '中国波束', type: 'EIRP', file: 'CHINASAT 6D_Ku_中国波束_EIRP.gxt' },
      { band: 'Ku', beam: '中国波束', type: 'GT', file: 'CHINASAT 6D_Ku_中国波束_GT.gxt' },
      { band: 'Ku', beam: '南亚', type: 'EIRP', file: 'CHINASAT 6D_Ku_南亚_EIRP.gxt' },
      { band: 'Ku', beam: '南亚', type: 'GT', file: 'CHINASAT 6D_Ku_南亚_GT.gxt' }
    ]
  },

  // 中星6E
  'CHINASAT 6E': {
    displayName: '中星6E',
    position: 115.5,
    folder: '中星6E',
    beams: [
      { band: 'C', beam: '中国波束', type: 'EIRP', file: 'CHINASAT 6E_C_中国波束_EIRP.gxt' },
      { band: 'Ku', beam: 'allbeam', type: 'EIRP', file: 'CHINASAT 6E_Ku_allbeam_EIRP.gxt' },
      { band: 'Ku', beam: 'allbeam', type: 'GT', file: 'CHINASAT 6E_Ku_allbeam_GT.gxt' },
      { band: 'Ku', beam: 'beam 1&2', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam 1&2_EIRP.gxt' },
      { band: 'Ku', beam: 'beam1', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam1_EIRP.gxt' },
      { band: 'Ku', beam: 'beam1', type: 'GT', file: 'CHINASAT 6E_Ku_beam1_GT.gxt' },
      { band: 'Ku', beam: 'beam2', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam2_EIRP.gxt' },
      { band: 'Ku', beam: 'beam2', type: 'GT', file: 'CHINASAT 6E_Ku_beam2_GT.gxt' },
      { band: 'Ku', beam: 'beam3', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam3_EIRP.gxt' },
      { band: 'Ku', beam: 'beam3', type: 'GT', file: 'CHINASAT 6E_Ku_beam3_GT.gxt' },
      { band: 'Ku', beam: 'beam4', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam4_EIRP.gxt' },
      { band: 'Ku', beam: 'beam4', type: 'GT', file: 'CHINASAT 6E_Ku_beam4_GT.gxt' },
      { band: 'Ku', beam: 'beam5', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam5_EIRP.gxt' },
      { band: 'Ku', beam: 'beam5', type: 'GT', file: 'CHINASAT 6E_Ku_beam5_GT.gxt' },
      { band: 'Ku', beam: 'beam6', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam6_EIRP.gxt' },
      { band: 'Ku', beam: 'beam6', type: 'GT', file: 'CHINASAT 6E_Ku_beam6_GT.gxt' },
      { band: 'Ku', beam: 'beam7', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam7_EIRP.gxt' },
      { band: 'Ku', beam: 'beam7', type: 'GT', file: 'CHINASAT 6E_Ku_beam7_GT.gxt' },
      { band: 'Ku', beam: 'beam8', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam8_EIRP.gxt' },
      { band: 'Ku', beam: 'beam8', type: 'GT', file: 'CHINASAT 6E_Ku_beam8_GT.gxt' },
      { band: 'Ku', beam: 'beam9', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam9_EIRP.gxt' },
      { band: 'Ku', beam: 'beam9', type: 'GT', file: 'CHINASAT 6E_Ku_beam9_GT.gxt' },
      { band: 'Ku', beam: 'beam10', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam10_EIRP.gxt' },
      { band: 'Ku', beam: 'beam10', type: 'GT', file: 'CHINASAT 6E_Ku_beam10_GT.gxt' },
      { band: 'Ku', beam: 'beam11', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam11_EIRP.gxt' },
      { band: 'Ku', beam: 'beam11', type: 'GT', file: 'CHINASAT 6E_Ku_beam11_GT.gxt' },
      { band: 'Ku', beam: 'beam12', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam12_EIRP.gxt' },
      { band: 'Ku', beam: 'beam12', type: 'GT', file: 'CHINASAT 6E_Ku_beam12_GT.gxt' },
      { band: 'Ku', beam: 'beam13', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam13_EIRP.gxt' },
      { band: 'Ku', beam: 'beam13', type: 'GT', file: 'CHINASAT 6E_Ku_beam13_GT.gxt' },
      { band: 'Ku', beam: 'beam14', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam14_EIRP.gxt' },
      { band: 'Ku', beam: 'beam14', type: 'GT', file: 'CHINASAT 6E_Ku_beam14_GT.gxt' },
      { band: 'Ku', beam: 'beam15', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam15_EIRP.gxt' },
      { band: 'Ku', beam: 'beam15', type: 'GT', file: 'CHINASAT 6E_Ku_beam15_GT.gxt' },
      { band: 'Ku', beam: 'beam16', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam16_EIRP.gxt' },
      { band: 'Ku', beam: 'beam16', type: 'GT', file: 'CHINASAT 6E_Ku_beam16_GT.gxt' },
      { band: 'Ku', beam: 'beam17', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam17_EIRP.gxt' },
      { band: 'Ku', beam: 'beam17', type: 'GT', file: 'CHINASAT 6E_Ku_beam17_GT.gxt' },
      { band: 'Ku', beam: 'beam18', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam18_EIRP.gxt' },
      { band: 'Ku', beam: 'beam18', type: 'GT', file: 'CHINASAT 6E_Ku_beam18_GT.gxt' },
      { band: 'Ku', beam: 'beam19', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam19_EIRP.gxt' },
      { band: 'Ku', beam: 'beam19', type: 'GT', file: 'CHINASAT 6E_Ku_beam19_GT.gxt' },
      { band: 'Ku', beam: 'beam20', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam20_EIRP.gxt' },
      { band: 'Ku', beam: 'beam20', type: 'GT', file: 'CHINASAT 6E_Ku_beam20_GT.gxt' },
      { band: 'Ku', beam: 'beam21', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam21_EIRP.gxt' },
      { band: 'Ku', beam: 'beam21', type: 'GT', file: 'CHINASAT 6E_Ku_beam21_GT.gxt' },
      { band: 'Ku', beam: 'beam22', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam22_EIRP.gxt' },
      { band: 'Ku', beam: 'beam22', type: 'GT', file: 'CHINASAT 6E_Ku_beam22_GT.gxt' },
      { band: 'Ku', beam: 'beam23', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam23_EIRP.gxt' },
      { band: 'Ku', beam: 'beam23', type: 'GT', file: 'CHINASAT 6E_Ku_beam23_GT.gxt' },
      { band: 'Ku', beam: 'beam24', type: 'EIRP', file: 'CHINASAT 6E_Ku_beam24_EIRP.gxt' },
      { band: 'Ku', beam: 'beam24', type: 'GT', file: 'CHINASAT 6E_Ku_beam24_GT.gxt' }
    ]
  },

  // 中星9B
  'CHINASAT 9B': {
    displayName: '中星9B',
    position: 101.4,
    folder: '中星9B',
    beams: [
      { band: 'DBS', beam: '1A', type: 'EIRP', file: 'CHINASAT 9B_DBS_1A_EIRP.gxt' },
      { band: 'DBS', beam: '1B', type: 'EIRP', file: 'CHINASAT 9B_DBS_1B_EIRP.gxt' },
      { band: 'DBS', beam: '2A', type: 'EIRP', file: 'CHINASAT 9B_DBS_2A_EIRP.gxt' },
      { band: 'DBS', beam: '2B', type: 'EIRP', file: 'CHINASAT 9B_DBS_2B_EIRP.gxt' },
      { band: 'DBS', beam: '3A', type: 'EIRP', file: 'CHINASAT 9B_DBS_3A_EIRP.gxt' },
      { band: 'DBS', beam: '4A', type: 'EIRP', file: 'CHINASAT 9B_DBS_4A_EIRP.gxt' },
      { band: 'DBS', beam: '5A', type: 'EIRP', file: 'CHINASAT 9B_DBS_5A_EIRP.gxt' },
      { band: 'DBS', beam: '6A', type: 'EIRP', file: 'CHINASAT 9B_DBS_6A_EIRP.gxt' },
      { band: 'DBS', beam: '6B', type: 'EIRP', file: 'CHINASAT 9B_DBS_6B_EIRP.gxt' },
      { band: 'DBS', beam: '7A', type: 'EIRP', file: 'CHINASAT 9B_DBS_7A_EIRP.gxt' },
      { band: 'DBS', beam: '7B', type: 'EIRP', file: 'CHINASAT 9B_DBS_7B_EIRP.gxt' },
      { band: 'DBS', beam: '8A', type: 'EIRP', file: 'CHINASAT 9B_DBS_8A_EIRP.gxt' },
      { band: 'DBS', beam: '8B', type: 'EIRP', file: 'CHINASAT 9B_DBS_8B_EIRP.gxt' },
      { band: 'DBS', beam: '9A', type: 'EIRP', file: 'CHINASAT 9B_DBS_9A_EIRP.gxt' },
      { band: 'DBS', beam: '9B', type: 'EIRP', file: 'CHINASAT 9B_DBS_9B_EIRP.gxt' },
      { band: 'DBS', beam: '10B', type: 'EIRP', file: 'CHINASAT 9B_DBS_10B_EIRP.gxt' },
      { band: 'DBS', beam: '11A', type: 'EIRP', file: 'CHINASAT 9B_DBS_11A_EIRP.gxt' },
      { band: 'DBS', beam: '11B', type: 'EIRP', file: 'CHINASAT 9B_DBS_11B_EIRP.gxt' },
      { band: 'DBS', beam: '12A', type: 'EIRP', file: 'CHINASAT 9B_DBS_12A_EIRP.gxt' },
      { band: 'DBS', beam: '12B', type: 'EIRP', file: 'CHINASAT 9B_DBS_12B_EIRP.gxt' },
      { band: 'DBS', beam: '13B', type: 'EIRP', file: 'CHINASAT 9B_DBS_13B_EIRP.gxt' },
      { band: 'DBS', beam: 'SEA2B', type: 'EIRP', file: 'CHINASAT 9B_DBS_SEA2B_EIRP.gxt' },
      { band: 'DBS', beam: 'SEA3B', type: 'EIRP', file: 'CHINASAT 9B_DBS_SEA3B_EIRP.gxt' },
      { band: 'DBS', beam: 'SEA4B', type: 'EIRP', file: 'CHINASAT 9B_DBS_SEA4B_EIRP.gxt' },
      { band: 'DBS', beam: 'SEA5B', type: 'EIRP', file: 'CHINASAT 9B_DBS_SEA5B_EIRP.gxt' },
      { band: 'DBS', beam: 'SEA6B', type: 'EIRP', file: 'CHINASAT 9B_DBS_SEA6B_EIRP.gxt' },
      { band: 'DBS', beam: 'WEST9A', type: 'EIRP', file: 'CHINASAT 9B_DBS_WEST9A_EIRP.gxt' },
      { band: 'DBS', beam: 'WEST10A', type: 'EIRP', file: 'CHINASAT 9B_DBS_WEST10A_EIRP.gxt' },
      { band: 'DBS', beam: 'WEST11A', type: 'EIRP', file: 'CHINASAT 9B_DBS_WEST11A_EIRP.gxt' }
    ]
  },

  // 中星9C
  'CHINASAT 9C': {
    displayName: '中星9C',
    position: 92.2,
    folder: '中星9C',
    beams: [
      { band: 'DBS', beam: '1B', type: 'EIRP', file: 'CHINASAT 9C_DBS_1B_EIRP.gxt' },
      { band: 'DBS', beam: '2B', type: 'EIRP', file: 'CHINASAT 9C_DBS_2B_EIRP.gxt' },
      { band: 'DBS', beam: '3B', type: 'EIRP', file: 'CHINASAT 9C_DBS_3B_EIRP.gxt' },
      { band: 'DBS', beam: '4B', type: 'EIRP', file: 'CHINASAT 9C_DBS_4B_EIRP.gxt' },
      { band: 'DBS', beam: '5B', type: 'EIRP', file: 'CHINASAT 9C_DBS_5B_EIRP.gxt' },
      { band: 'DBS', beam: '6B', type: 'EIRP', file: 'CHINASAT 9C_DBS_6B_EIRP.gxt' },
      { band: 'DBS', beam: '7B', type: 'EIRP', file: 'CHINASAT 9C_DBS_7B_EIRP.gxt' },
      { band: 'DBS', beam: '8B', type: 'EIRP', file: 'CHINASAT 9C_DBS_8B_EIRP.gxt' },
      { band: 'DBS', beam: '9B', type: 'EIRP', file: 'CHINASAT 9C_DBS_9B_EIRP.gxt' },
      { band: 'DBS', beam: '10B', type: 'EIRP', file: 'CHINASAT 9C_DBS_10B_EIRP.gxt' },
      { band: 'DBS', beam: '11B', type: 'EIRP', file: 'CHINASAT 9C_DBS_11B_EIRP.gxt' },
      { band: 'DBS', beam: '12B', type: 'EIRP', file: 'CHINASAT 9C_DBS_12B_EIRP.gxt' },
      { band: 'DBS', beam: 'SEA8A', type: 'EIRP', file: 'CHINASAT 9C_DBS_SEA8A_EIRP.gxt' },
      { band: 'DBS', beam: 'SEA9A', type: 'EIRP', file: 'CHINASAT 9C_DBS_SEA9A_EIRP.gxt' },
      { band: 'DBS', beam: 'SEA10A', type: 'EIRP', file: 'CHINASAT 9C_DBS_SEA10A_EIRP.gxt' },
      { band: 'DBS', beam: 'WEST1A', type: 'EIRP', file: 'CHINASAT 9C_DBS_WEST1A_EIRP.gxt' },
      { band: 'DBS', beam: 'WEST2A', type: 'EIRP', file: 'CHINASAT 9C_DBS_WEST2A_EIRP.gxt' },
      { band: 'DBS', beam: 'WEST12A', type: 'EIRP', file: 'CHINASAT 9C_DBS_WEST12A_EIRP.gxt' },
      { band: 'Ka', beam: '', type: 'EIRP', file: 'CHINASAT 9C_Ka_EIRP.gxt' },
      { band: 'Ku', beam: '1A', type: 'EIRP', file: 'CHINASAT 9C_Ku_1A_EIRP.gxt' },
      { band: 'Ku', beam: '2A', type: 'EIRP', file: 'CHINASAT 9C_Ku_2A_EIRP.gxt' },
      { band: 'Ku', beam: '3A', type: 'EIRP', file: 'CHINASAT 9C_Ku_3A_EIRP.gxt' },
      { band: 'Ku', beam: '4A', type: 'EIRP', file: 'CHINASAT 9C_Ku_4A_EIRP.gxt' },
      { band: 'Ku', beam: '5A', type: 'EIRP', file: 'CHINASAT 9C_Ku_5A_EIRP.gxt' }
    ]
  },

  // 中星10R
  'CHINASAT 10R': {
    displayName: '中星10R',
    position: 110.5,
    folder: '中星10R',
    beams: [
      { band: 'Ku', beam: '中国波束', type: 'EIRP', file: 'CHINASAT 10R_Ku_中国波束_EIRP.gxt' },
      { band: 'Ku', beam: '中国波束', type: 'GT', file: 'CHINASAT 10R_Ku_中国波束_GT.gxt' },
      { band: 'Ku', beam: '东部波束', type: 'EIRP', file: 'CHINASAT 10R_Ku_东部波束_EIRP.gxt' },
      { band: 'Ku', beam: '东部波束', type: 'GT', file: 'CHINASAT 10R_Ku_东部波束_GT.gxt' },
      { band: 'Ku', beam: '西部波束', type: 'EIRP', file: 'CHINASAT 10R_Ku_西部波束_EIRP.gxt' },
      { band: 'Ku', beam: '西部波束', type: 'GT', file: 'CHINASAT 10R_Ku_西部波束_GT.gxt' },
      { band: 'Ku', beam: '东南亚波束', type: 'EIRP', file: 'CHINASAT 10R_Ku_东南亚波束_EIRP.gxt' },
      { band: 'Ku', beam: '东南亚波束', type: 'GT', file: 'CHINASAT 10R_Ku_东南亚波束_GT.gxt' },
      { band: 'Ku', beam: '印尼波束', type: 'EIRP', file: 'CHINASAT 10R_Ku_印尼波束_EIRP.gxt' },
      { band: 'Ku', beam: '印尼波束', type: 'GT', file: 'CHINASAT 10R_Ku_印尼波束_GT.gxt' }
    ]
  },

  // 中星11
  'CHINASAT 11': {
    displayName: '中星11',
    position: 98,
    folder: '中星11',
    beams: [
      { band: 'C', beam: 'CHINA', type: 'EIRP', file: 'CHINASAT 11_C_CHINA_EIRP.gxt' },
      { band: 'C', beam: 'CHINA', type: 'GT', file: 'CHINASAT 11_C_CHINA_GT.gxt' },
      { band: 'Ku', beam: 'Indonesia', type: 'EIRP', file: 'CHINASAT 11_Ku_Indonesia_EIRP.gxt' },
      { band: 'Ku', beam: 'Indonesia', type: 'GT', file: 'CHINASAT 11_Ku_Indonesia_GT.gxt' }
    ]
  },

  // 中星15
  'CHINASAT 15': {
    displayName: '中星15',
    position: 51.5,
    folder: '中星15',
    beams: [
      { band: 'C', beam: 'Globalbeam', type: 'EIRP', file: 'CHINASAT 15_C_Globalbeam_EIRP.gxt' },
      { band: 'C', beam: 'Globalbeam', type: 'GT', file: 'CHINASAT 15_C_Globalbeam_GT.gxt' },
      { band: 'C', beam: 'Africanbeam', type: 'EIRP', file: 'CHINASAT 15_C_Africanbeam_EIRP.gxt' },
      { band: 'C', beam: 'Africanbeam', type: 'GT', file: 'CHINASAT 15_C_Africanbeam_GT.gxt' },
      { band: 'C', beam: 'EastBeam', type: 'EIRP', file: 'CHINASAT 15_C_EastBeam_EIRP.gxt' },
      { band: 'C', beam: 'EastBeam', type: 'GT', file: 'CHINASAT 15_C_EastBeam_GT.gxt' },
      { band: 'Ku', beam: 'Africanbeam', type: 'EIRP', file: 'CHINASAT 15_Ku_Africanbeam_EIRP.gxt' },
      { band: 'Ku', beam: 'Africanbeam', type: 'GT', file: 'CHINASAT 15_Ku_Africanbeam_GT.gxt' }
    ]
  },

  // 中星26
  'CHINASAT 26': {
    displayName: '中星26',
    position: 125,
    folder: '中星26',
    beams: [
      { band: 'Ka', beam: '国土波束', type: 'EIRP', file: 'CHINASAT 26_Ka_CHINA_EIRP.gxt' },
      { band: 'Ka', beam: '国土波束', type: 'GT', file: 'CHINASAT 26_Ka_CHINA_GT.gxt' },
      { band: 'Ka', beam: '1.6°波束', type: 'EIRP', file: 'CHINASAT 26_Ka_Outside_EIRP.gxt' },
      { band: 'Ka', beam: '1.6°波束', type: 'GT', file: 'CHINASAT 26_Ka_Outside_GT.gxt' }
      // 以下波束暂时隐藏，数据文件保留，需要时可恢复
      // { band: 'Ka', beam: 'All', type: 'EIRP', file: 'CHINASAT 26_Ka_All_EIRP.gxt' },
      // { band: 'Ka', beam: 'All', type: 'GT', file: 'CHINASAT 26_Ka_All_GT.gxt' },
      // 拉萨关口站波束 (1,3,4,6,9,10,12,13)
      // 大理关口站波束 (2,5,11,18,24,27,33,39)
      // 喀什关口站波束 (8,15,16,20,29,38,43,45)
      // 乌鲁木齐关口站波束 (7,14,21,23,28,30,31,44,46,48,50,53,56,61)
      // 成都关口站波束 (17,19,25,26,32,34,40,41)
      // 哈尔滨关口站波束 (22,35,36,37,42,47,49,51,52,54,55,57,58,59,60,62)
      // 香港关口站波束 (63-94)
    ]
  },

  // 中星12
  'CHINASAT 12': {
    displayName: '中星12',
    position: 87.5,
    folder: '中星12',
    beams: [
      { band: 'C', beam: '全球', type: 'EIRP', file: 'CHINASAT 12_C_Global_EIRP.json' },
      { band: 'C', beam: '全球', type: 'GT', file: 'CHINASAT 12_C_Global_GT.json' },
      { band: 'Ku', beam: 'CHINA', type: 'EIRP', file: 'CHINASAT 12_Ku_CHINA_EIRP.gxt' },
      { band: 'Ku', beam: 'CHINA', type: 'GT', file: 'CHINASAT 12_Ku_CHINA_GT.gxt' },
      { band: 'Ku', beam: 'MENA', type: 'EIRP', file: 'CHINASAT 12_Ku_MENA_EIRP.gxt' },
      { band: 'Ku', beam: 'MENA', type: 'GT', file: 'CHINASAT 12_Ku_MENA_GT.gxt' },
      { band: 'Ku', beam: 'S1', type: 'EIRP', file: 'CHINASAT 12_Ku_S1_EIRP.gxt' },
      { band: 'Ku', beam: 'S1', type: 'GT', file: 'CHINASAT 12_Ku_S1_GT.gxt' },
      { band: 'Ku', beam: 'S2', type: 'EIRP', file: 'CHINASAT 12_Ku_S2_EIRP.gxt' },
      { band: 'Ku', beam: 'S2', type: 'GT', file: 'CHINASAT 12_Ku_S2_GT.gxt' },
      { band: 'Ku', beam: 'S3', type: 'EIRP', file: 'CHINASAT 12_Ku_S3_EIRP.gxt' },
      { band: 'Ku', beam: 'S3', type: 'GT', file: 'CHINASAT 12_Ku_S3_GT.gxt' },
      { band: 'Ku', beam: 'S4', type: 'EIRP', file: 'CHINASAT 12_Ku_S4_EIRP.gxt' },
      { band: 'Ku', beam: 'S4', type: 'GT', file: 'CHINASAT 12_Ku_S4_GT.gxt' }
    ]
  },

  // 中星19
  'CHINASAT 19': {
    displayName: '中星19',
    position: 163,
    folder: '中星19',
    beams: [
      { band: 'C', beam: 'GLOBAL', type: 'EIRP', file: 'CHINASAT 19_C_GLOBAL_EIRP.gxt' },
      { band: 'C', beam: 'GLOBAL', type: 'GT', file: 'CHINASAT 19_C_GLOBAL_GT.gxt' },
      { band: 'Ku', beam: 'BEAM A', type: 'EIRP', file: 'CHINASAT 19_Ku_BEAM A_EIRP.gxt' },
      { band: 'Ku', beam: 'BEAM A', type: 'GT', file: 'CHINASAT 19_Ku_BEAM A_GT.gxt' },
      { band: 'Ku', beam: 'BEAM B', type: 'EIRP', file: 'CHINASAT 19_Ku_BEAM B_EIRP.gxt' },
      { band: 'Ku', beam: 'BEAM B', type: 'GT', file: 'CHINASAT 19_Ku_BEAM B_GT.gxt' },
      { band: 'Ku', beam: 'BEAM C', type: 'EIRP', file: 'CHINASAT 19_Ku_BEAM C_EIRP.gxt' },
      { band: 'Ku', beam: 'BEAM C', type: 'GT', file: 'CHINASAT 19_Ku_BEAM C_GT.gxt' },
      { band: 'Ku', beam: 'BEAM D', type: 'EIRP', file: 'CHINASAT 19_Ku_BEAM D_EIRP.gxt' },
      { band: 'Ku', beam: 'BEAM D', type: 'GT', file: 'CHINASAT 19_Ku_BEAM D_GT.gxt' },
      // Ka波束
      { band: 'Ka', beam: 'No.1', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.1_EIRP.gxt' },
      { band: 'Ka', beam: 'No.2', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.2_EIRP.gxt' },
      { band: 'Ka', beam: 'No.3', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.3_EIRP.gxt' },
      { band: 'Ka', beam: 'No.4', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.4_EIRP.gxt' },
      { band: 'Ka', beam: 'No.5', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.5_EIRP.gxt' },
      { band: 'Ka', beam: 'No.6', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.6_EIRP.gxt' },
      { band: 'Ka', beam: 'No.7', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.7_EIRP.gxt' },
      { band: 'Ka', beam: 'No.8', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.8_EIRP.gxt' },
      { band: 'Ka', beam: 'No.9', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.9_EIRP.gxt' },
      { band: 'Ka', beam: 'No.10', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.10_EIRP.gxt' },
      { band: 'Ka', beam: 'No.11', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.11_EIRP.gxt' },
      { band: 'Ka', beam: 'No.12', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.12_EIRP.gxt' },
      { band: 'Ka', beam: 'No.13', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.13_EIRP.gxt' },
      { band: 'Ka', beam: 'No.14', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.14_EIRP.gxt' },
      { band: 'Ka', beam: 'No.15', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.15_EIRP.gxt' },
      { band: 'Ka', beam: 'No.16', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.16_EIRP.gxt' },
      { band: 'Ka', beam: 'No.17', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.17_EIRP.gxt' },
      { band: 'Ka', beam: 'No.18', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.18_EIRP.gxt' },
      { band: 'Ka', beam: 'No.19', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.19_EIRP.gxt' },
      { band: 'Ka', beam: 'No.20', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.20_EIRP.gxt' },
      { band: 'Ka', beam: 'No.21', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.21_EIRP.gxt' },
      { band: 'Ka', beam: 'No.22', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.22_EIRP.gxt' },
      { band: 'Ka', beam: 'No.23', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.23_EIRP.gxt' },
      { band: 'Ka', beam: 'No.24', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.24_EIRP.gxt' },
      { band: 'Ka', beam: 'No.25', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.25_EIRP.gxt' },
      { band: 'Ka', beam: 'No.26', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.26_EIRP.gxt' },
      { band: 'Ka', beam: 'No.27', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.27_EIRP.gxt' },
      { band: 'Ka', beam: 'No.28', type: 'EIRP', file: 'CHINASAT 19_Ka_Beam No.28_EIRP.gxt' },
      { band: 'Ka', beam: 'USER BEAM', type: 'GT', file: 'CHINASAT 19_Ka_USER BEAM_GT.gxt' },
      { band: 'Ka', beam: '馈电波束', type: 'EIRP', file: 'CHINASAT 19_Ka_馈电波束_EIRP.gxt' },
      { band: 'Ka', beam: '馈电波束', type: 'GT', file: 'CHINASAT 19_Ka_馈电波束_GT.gxt' }
    ]
  }
};

/**
 * 获取有覆盖数据的卫星列表
 * @returns {Array} 卫星名称数组
 */
function getSatellitesWithCoverage() {
  return Object.keys(coverageIndex);
}

/**
 * 获取卫星的所有波束
 * @param {string} satelliteName - 卫星名称
 * @returns {Array} 波束信息数组
 */
function getBeamsForSatellite(satelliteName) {
  const satellite = coverageIndex[satelliteName];
  if (!satellite) return [];
  return satellite.beams;
}

/**
 * 获取卫星的频段列表
 * @param {string} satelliteName - 卫星名称
 * @returns {Array} 频段数组
 */
function getBandsForSatellite(satelliteName) {
  const beams = getBeamsForSatellite(satelliteName);
  const bands = [...new Set(beams.map(b => b.band))];
  return bands.sort();
}

/**
 * 获取指定频段的波束列表
 * @param {string} satelliteName - 卫星名称
 * @param {string} band - 频段
 * @returns {Array} 波束信息数组
 */
function getBeamsForBand(satelliteName, band) {
  const beams = getBeamsForSatellite(satelliteName);
  return beams.filter(b => b.band === band);
}

/**
 * 获取JSON文件路径（已从GXT转换）
 * @param {string} satelliteName - 卫星名称
 * @param {Object} beamInfo - 波束信息对象
 * @returns {string} 完整文件路径
 */
function getGxtFilePath(satelliteName, beamInfo) {
  const satellite = coverageIndex[satelliteName];
  if (!satellite) return null;
  // 将 .gxt 扩展名替换为 .js（使用 JS 模块格式以支持微信小程序动态 require）
  const jsFile = beamInfo.file.replace(/\.gxt$/i, '.js');
  return COVERAGE_BASE_PATH + satellite.folder + '/' + jsFile;
}

/**
 * 获取卫星显示名称
 * @param {string} satelliteName - 卫星英文名称
 * @returns {string} 显示名称
 */
function getSatelliteDisplayName(satelliteName) {
  const satellite = coverageIndex[satelliteName];
  return satellite ? satellite.displayName : satelliteName;
}

/**
 * 检查卫星是否有覆盖数据
 * @param {string} satelliteName - 卫星名称
 * @returns {boolean}
 */
function hasCoverageData(satelliteName) {
  return satelliteName in coverageIndex;
}

module.exports = {
  coverageIndex,
  COVERAGE_BASE_PATH,
  getSatellitesWithCoverage,
  getBeamsForSatellite,
  getBandsForSatellite,
  getBeamsForBand,
  getGxtFilePath,
  getSatelliteDisplayName,
  hasCoverageData
};



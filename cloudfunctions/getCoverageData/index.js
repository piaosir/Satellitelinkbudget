// cloudfunctions/getCoverageData/index.js
// 获取卫星覆盖数据的云函数

const cloud = require('wx-server-sdk');

// 云环境配置
const ENV_ID = 'cloud1-8gjv5ekx41d6fb76';
const BUCKET_NAME = '636c-cloud1-8gjv5ekx41d6fb76-1385987144';

cloud.init({ 
  env: ENV_ID
});

/**
 * 获取卫星覆盖数据
 * @param {string} satellite - 卫星名称文件夹（如 "中星6C"）
 * @param {string} filename - 数据文件名（如 "CHINASAT 6C_C_1B_EIRP.json"）
 * @returns {Object} 覆盖数据对象
 */
exports.main = async (event, context) => {
  const { satellite, filename } = event;
  
  if (!satellite || !filename) {
    return {
      success: false,
      errMsg: '缺少必要参数：satellite 或 filename'
    };
  }
  
  console.log('请求参数:', { satellite, filename });
  
  try {
    // 构建完整的云存储文件ID
    // 格式: cloud://环境ID.存储桶名/文件路径
    const fileID = `cloud://${ENV_ID}.${BUCKET_NAME}/coverage/${satellite}/${filename}`;
    
    console.log('正在获取云存储文件:', fileID);
    
    // 下载文件
    try {
      const downloadResult = await cloud.downloadFile({
        fileID: fileID
      });
      
      // 读取文件内容
      const fileContent = downloadResult.fileContent.toString('utf8');
      const data = JSON.parse(fileContent);
      
      console.log('成功获取覆盖数据，等值线数量:', data.contours ? data.contours.length : 0);
      
      return {
        success: true,
        data: data
      };
    } catch (downloadErr) {
      console.log('下载文件失败:', downloadErr.message);
      
      // 尝试获取临时链接作为备选方案
      try {
        const tempUrlResult = await cloud.getTempFileURL({
          fileList: [fileID]
        });
        
        if (tempUrlResult.fileList && 
            tempUrlResult.fileList[0] && 
            tempUrlResult.fileList[0].tempFileURL) {
          return {
            success: true,
            tempUrl: tempUrlResult.fileList[0].tempFileURL
          };
        }
      } catch (tempErr) {
        console.log('获取临时链接失败:', tempErr.message);
      }
      
      return {
        success: false,
        errMsg: `文件下载失败: ${downloadErr.message}，fileID: ${fileID}`
      };
    }
    
  } catch (error) {
    console.error('获取覆盖数据失败:', error);
    
    return {
      success: false,
      errMsg: error.message || '获取覆盖数据失败'
    };
  }
};

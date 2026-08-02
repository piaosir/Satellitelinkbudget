// cloudfunctions/configManager/index.js
// 配置管理云函数 - 负责配置的云端保存、读取、删除和分享

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// 小程序配置（用于生成 URL Link）
const APPID = 'wxa214dba465dcc072';

// 获取 Access Token
async function getAccessToken() {
  try {
    // 使用云调用方式获取 access_token（推荐，无需 AppSecret）
    const result = await cloud.openapi.auth.getAccessToken({});
    return result.access_token;
  } catch (error) {
    console.error('获取 access_token 失败:', error);
    throw new Error('获取访问令牌失败');
  }
}

// 生成 URL Link（可在微信内外打开的链接）
async function generateUrlLink(shareCode) {
  try {
    // 使用云调用方式生成 URL Link
    const result = await cloud.openapi.urllink.generate({
      path: '/pages/configs/configs',
      query: `shareCode=${shareCode}`,
      expireType: 1,  // 0=永久 1=指定时间过期
      expireInterval: 30, // 30天后过期
      envVersion: 'release' // 正式版。可选 trial(体验版) develop(开发版)
    });
    
    console.log('生成 URL Link 成功:', result);
    return result.url_link;
  } catch (error) {
    console.error('生成 URL Link 失败:', error);
    // 如果生成失败，返回 null，前端可以降级使用分享码
    return null;
  }
}

// 生成分享码 (8位短码)
function generateShareCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 验证分享码唯一性
async function ensureUniqueShareCode() {
  let shareCode;
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    shareCode = generateShareCode();
    const existing = await db.collection('shared_configs').where({
      shareCode: shareCode
    }).count();
    
    if (existing.total === 0) {
      return shareCode;
    }
    attempts++;
  }
  
  // 如果10次都重复，使用时间戳确保唯一
  return generateShareCode() + Date.now().toString(36).slice(-4);
}

// ============================================================================
// 仿真平台绑定：认证码的云端备份（按 openid 一人一条）
// ============================================================================
// 认证码是这个账号的【长期收件地址】，平台侧记着它往里投。若只存在小程序本地 storage，
// 用户换台手机、或点一下设置页的「清除缓存」，绑定就没了 —— 而平台侧【毫无察觉】，
// 照样投递成功，只是再没人来取。所以必须有云端这一份。
//
// ★ 集合首次使用时自动创建（db.createCollection），不需要去云开发控制台建表。
//   已存在时会抛「collection already exists」，吞掉即可。
//
// ★★ 身份字段用普通的 `openid`，【不是】`_openid`：云函数是管理端身份，从这里 add 写进去的
//    记录不会自动带 `_openid`（只有小程序端直连数据库写才会自动带）。写不带 `_openid` 的记录、
//    又按 `_openid` 去查，这张表就成了只写不读 —— 每存一次多一条无主记录，loadBinding 永远
//    返回 null，于是「换手机 / 清缓存能找回同一个码」这件事【从来没生效过】，而且毫无征兆：
//    每台设备各自生成各自的码，用着都正常，只有平台绑的那台收得到东西。
//    与本文件 user_configs 的口径一致（见 saveConfig 的 openid 字段）。
const BIND_COLL = 'satsim_bindings';

async function ensureBindColl() {
  try { await db.createCollection(BIND_COLL); } catch (e) { /* 已存在 */ }
}

async function loadBinding(openid) {
  await ensureBindColl();
  const r = await db.collection(BIND_COLL).where({ openid }).limit(1).get();
  const row = r.data && r.data[0];
  return { success: true, data: row ? { ch: row.ch || '', createdAt: row.createdAt || 0, resetAt: row.resetAt || 0 } : null };
}

// 覆盖式：调用方（小程序 utils/satsimBox.js）在覆盖前已经决定过「该不该覆盖」——
// 本地有码且与云端不同时它不会调这里，而是提示用户去换绑。这里不再二次判断。
async function saveBinding(openid, data) {
  await ensureBindColl();
  const ch = String((data && data.ch) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{12}$/.test(ch)) return { success: false, error: '认证码格式不正确' };
  const now = Date.now();
  const r = await db.collection(BIND_COLL).where({ openid }).limit(1).get();
  const row = r.data && r.data[0];
  if (row) {
    // 换码 = 重置：把旧码作废的时刻记下来，便于用户回看「我什么时候重置过」
    const patch = row.ch === ch ? { ch } : { ch, resetAt: now };
    await db.collection(BIND_COLL).doc(row._id).update({ data: patch });
  } else {
    await db.collection(BIND_COLL).add({ data: { openid, ch, createdAt: now, resetAt: 0 } });
  }
  return { success: true, data: { ch } };
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  
  const { action, data } = event;
  
  console.log('配置管理云函数收到请求:', { action, openid });
  
  try {
    switch (action) {
      case 'save':
        return await saveConfig(openid, data);
      case 'update':
        return await updateConfig(openid, data);
      case 'list':
        return await listConfigs(openid, data);
      case 'load':
        return await loadConfig(openid, data);
      case 'delete':
        return await deleteConfig(openid, data);
      case 'share':
        return await shareConfig(openid, data);
      case 'getShared':
        return await getSharedConfig(data);
      case 'batchShare':
        return await batchShareConfigs(openid, data);
      case 'getBatchShared':
        return await getBatchSharedConfigs(data);
      case 'loadBinding':
        return await loadBinding(openid);
      case 'saveBinding':
        return await saveBinding(openid, data);
      case 'syncSave':
        return await syncSaveConfig(openid, data);
      default:
        return {
          success: false,
          error: '未知操作'
        };
    }
  } catch (error) {
    console.error('配置管理出错:', error);
    return {
      success: false,
      error: error.message || '操作失败'
    };
  }
};

// 仿真平台自动同步：按 srcId 覆盖式保存（有则更新、无则新增）
//
// srcId = 这一条链路在平台侧的稳定身份「<体制>:<配置id>:<行下标>」（平台 shared/lbMiniExport.js 出）。
// 没有它就只能靠「新增」，于是平台每同步一次就在手机上多堆一份同名配置 —— 自动同步就成了灾难。
// ★ 刻意不用 configName 当身份：名字里带着发信站→收信站，改个站名就变成另一份，
//   而改站名恰恰是「同一条链路被改了」最常见的形态。srcId 缺失时【退回新增】，不猜。
async function syncSaveConfig(openid, data) {
  const srcId = String((data && data.srcId) || '');
  if (!srcId) return await saveConfig(openid, data);

  const r = await db.collection('user_configs').where({ openid, srcId }).limit(1).get();
  const row = r.data && r.data[0];
  if (!row) return await saveConfig(openid, data);

  await db.collection('user_configs').doc(row._id).update({
    data: {
      configName: data.configName || row.configName,
      satelliteParams: data.satelliteParams || {},
      linkParams: data.linkParams || {},
      calculationResults: data.calculationResults || {},
      noiseRatioMode: data.noiseRatioMode || 'ebno',
      markedParams: data.markedParams || [],
      highlightedRows: data.highlightedRows || [],
      updateTime: db.serverDate()
    }
  });
  return { success: true, configId: row._id, replaced: true, message: '配置已更新' };
}

// 保存配置到云端
async function saveConfig(openid, data) {
  const { configName, satelliteParams, linkParams, calculationResults, noiseRatioMode, markedParams, highlightedRows, srcId } = data;

  if (!configName) {
    throw new Error('配置名称不能为空');
  }

  const now = db.serverDate();

  const configDoc = {
    openid,
    // 平台自动同步的身份（用户自建的配置没有这个字段）；见 syncSaveConfig
    srcId: String(srcId || ''),
    configName,
    satelliteParams: satelliteParams || {},
    linkParams: linkParams || {},
    calculationResults: calculationResults || {},
    noiseRatioMode: noiseRatioMode || 'ebno',
    markedParams: markedParams || [],
    highlightedRows: highlightedRows || [],
    createTime: now,
    updateTime: now
  };
  
  const result = await db.collection('user_configs').add({
    data: configDoc
  });
  
  console.log('配置保存成功:', result._id);
  
  return {
    success: true,
    configId: result._id,
    message: '配置已保存到云端'
  };
}

// 更新（覆盖）已有配置
async function updateConfig(openid, data) {
  const { configId, configName, satelliteParams, linkParams, calculationResults, noiseRatioMode, markedParams, highlightedRows } = data;
  
  console.log('updateConfig 收到参数:', { configId, configName: configName || '(未提供)' });
  
  if (!configId) {
    throw new Error('配置ID不能为空');
  }
  
  // 先验证是否是用户的配置
  const existing = await db.collection('user_configs').doc(configId).get();
  
  if (!existing.data) {
    throw new Error('配置不存在');
  }
  
  if (existing.data.openid !== openid) {
    throw new Error('无权更新此配置');
  }
  
  const now = db.serverDate();
  
  // 构建更新数据
  const updateData = {
    satelliteParams: satelliteParams || {},
    linkParams: linkParams || {},
    calculationResults: calculationResults || {},
    noiseRatioMode: noiseRatioMode || 'ebno',
    markedParams: markedParams || [],
    highlightedRows: highlightedRows || [],
    updateTime: now
  };
  
  // 如果提供了新名称，也更新名称
  if (configName) {
    updateData.configName = configName;
    console.log('将更新配置名称为:', configName);
  } else {
    console.log('未提供配置名称，保持原名称');
  }
  
  console.log('更新数据 configName:', updateData.configName);
  
  await db.collection('user_configs').doc(configId).update({
    data: updateData
  });
  
  console.log('配置更新成功:', configId, '配置名:', configName);
  
  // 同时更新相关的分享记录（如果有的话）
  try {
    const sharedUpdateData = {
      satelliteParams: satelliteParams || {},
      linkParams: linkParams || {},
      calculationResults: calculationResults || {},
      noiseRatioMode: noiseRatioMode || 'ebno',
      markedParams: markedParams || [],
      highlightedRows: highlightedRows || [],
      updateTime: now
    };
    
    if (configName) {
      sharedUpdateData.configName = configName;
    }
    
    await db.collection('shared_configs').where({
      configId,
      openid
    }).update({
      data: sharedUpdateData
    });
  } catch (e) {
    // 如果没有分享记录，忽略错误
    console.log('无分享记录需要更新');
  }
  
  return {
    success: true,
    configId: configId,
    configName: configName || '(未更新)',
    message: '配置已覆盖保存'
  };
}

// 获取用户的配置列表
async function listConfigs(openid, data) {
  const { page = 1, pageSize = 1000 } = data || {};
  
  const skip = (page - 1) * pageSize;
  
  // 获取总数
  const countResult = await db.collection('user_configs').where({
    openid
  }).count();
  
  // 获取列表
  const result = await db.collection('user_configs').where({
    openid
  })
  .orderBy('createTime', 'desc')
  .skip(skip)
  .limit(pageSize)
  .field({
    _id: true,
    configName: true,
    satelliteParams: true,
    noiseRatioMode: true,
    createTime: true,
    updateTime: true
  })
  .get();
  
  return {
    success: true,
    total: countResult.total,
    page,
    pageSize,
    configs: result.data
  };
}

// 加载单个配置详情
async function loadConfig(openid, data) {
  const { configId } = data;
  
  if (!configId) {
    throw new Error('配置ID不能为空');
  }
  
  const result = await db.collection('user_configs').doc(configId).get();
  
  if (!result.data) {
    throw new Error('配置不存在');
  }
  
  // 验证是否是用户自己的配置
  if (result.data.openid !== openid) {
    throw new Error('无权访问此配置');
  }
  
  return {
    success: true,
    config: result.data
  };
}

// 删除配置
async function deleteConfig(openid, data) {
  const { configId } = data;
  
  if (!configId) {
    throw new Error('配置ID不能为空');
  }
  
  // 先验证是否是用户的配置
  const existing = await db.collection('user_configs').doc(configId).get();
  
  if (!existing.data || existing.data.openid !== openid) {
    throw new Error('无权删除此配置');
  }
  
  await db.collection('user_configs').doc(configId).remove();
  
  // 同时删除相关的分享记录
  await db.collection('shared_configs').where({
    configId,
    openid
  }).remove();
  
  return {
    success: true,
    message: '配置已删除'
  };
}

// 分享配置 - 生成分享码
async function shareConfig(openid, data) {
  const { configId } = data;
  
  if (!configId) {
    throw new Error('配置ID不能为空');
  }
  
  // 获取原配置
  const configResult = await db.collection('user_configs').doc(configId).get();
  
  if (!configResult.data) {
    throw new Error('配置不存在');
  }
  
  if (configResult.data.openid !== openid) {
    throw new Error('无权分享此配置');
  }
  
  // 检查是否已有分享码
  const existingShare = await db.collection('shared_configs').where({
    configId,
    openid
  }).get();
  
  if (existingShare.data.length > 0) {
    const existingShareCode = existingShare.data[0].shareCode;
    let urlLink = existingShare.data[0].urlLink;
    
    // 如果之前没有生成 URL Link，或者已过期，重新生成
    if (!urlLink) {
      urlLink = await generateUrlLink(existingShareCode);
      // 更新记录中的 urlLink
      if (urlLink) {
        await db.collection('shared_configs').doc(existingShare.data[0]._id).update({
          data: {
            urlLink: urlLink,
            urlLinkCreateTime: db.serverDate()
          }
        });
      }
    }
    
    // 返回已有的分享码和 URL Link
    return {
      success: true,
      shareCode: existingShareCode,
      urlLink: urlLink,
      message: '使用已有的分享码'
    };
  }
  
  // 生成新的分享码
  const shareCode = await ensureUniqueShareCode();
  const config = configResult.data;
  
  // 生成 URL Link
  const urlLink = await generateUrlLink(shareCode);
  
  // 创建分享记录 - 保存完整配置副本
  await db.collection('shared_configs').add({
    data: {
      shareCode,
      urlLink: urlLink || null,
      urlLinkCreateTime: urlLink ? db.serverDate() : null,
      configId,
      openid,
      configName: config.configName,
      satelliteParams: config.satelliteParams,
      linkParams: config.linkParams,
      calculationResults: config.calculationResults,
      noiseRatioMode: config.noiseRatioMode,
      markedParams: config.markedParams,
      highlightedRows: config.highlightedRows,
      createTime: db.serverDate(),
      accessCount: 0
    }
  });
  
  return {
    success: true,
    shareCode,
    urlLink: urlLink,
    message: '分享链接创建成功'
  };
}

// 通过分享码获取配置
async function getSharedConfig(data) {
  const { shareCode } = data;
  
  if (!shareCode) {
    throw new Error('分享码不能为空');
  }
  
  const result = await db.collection('shared_configs').where({
    shareCode
  }).get();
  
  if (result.data.length === 0) {
    throw new Error('分享码无效或已过期');
  }
  
  const sharedConfig = result.data[0];
  
  // 更新访问计数
  await db.collection('shared_configs').doc(sharedConfig._id).update({
    data: {
      accessCount: _.inc(1),
      lastAccessTime: db.serverDate()
    }
  });
  
  // 返回配置数据（不包含敏感信息）
  return {
    success: true,
    config: {
      configName: sharedConfig.configName,
      satelliteParams: sharedConfig.satelliteParams,
      linkParams: sharedConfig.linkParams,
      calculationResults: sharedConfig.calculationResults,
      noiseRatioMode: sharedConfig.noiseRatioMode,
      markedParams: sharedConfig.markedParams,
      highlightedRows: sharedConfig.highlightedRows
    }
  };
}

// 生成批次分享码 (6位短码，用于scene参数，最大32字节)
function generateBatchCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = 'B'; // 以B开头标识批次码
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 确保 batch_shares 集合存在
async function ensureBatchSharesCollection() {
  try {
    // 尝试查询集合，如果不存在会抛出错误
    await db.collection('batch_shares').count();
  } catch (e) {
    if (e.errCode === -502005 || e.message.includes('not exist')) {
      // 集合不存在，创建它
      try {
        await db.createCollection('batch_shares');
        console.log('成功创建 batch_shares 集合');
      } catch (createError) {
        // 可能是并发创建导致的错误，忽略
        console.log('创建集合时的错误（可忽略）:', createError.message);
      }
    }
  }
}

// 验证批次码唯一性
async function ensureUniqueBatchCode() {
  // 先确保集合存在
  await ensureBatchSharesCollection();
  
  let batchCode;
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    batchCode = generateBatchCode();
    try {
      const existing = await db.collection('batch_shares').where({
        batchCode: batchCode
      }).count();
      
      if (existing.total === 0) {
        return batchCode;
      }
    } catch (e) {
      // 如果查询失败，直接返回当前生成的码
      return batchCode;
    }
    attempts++;
  }
  
  // 如果10次都重复，使用时间戳确保唯一
  return generateBatchCode() + Date.now().toString(36).slice(-2);
}

// 删除云存储文件
async function deleteCloudFile(fileID) {
  if (!fileID) return false;
  try {
    await cloud.deleteFile({ fileList: [fileID] });
    console.log('删除旧文件成功:', fileID);
    return true;
  } catch (error) {
    console.log('删除文件失败:', error.message);
    return false;
  }
}

// 批量分享配置 - 生成一个批次码和小程序码
async function batchShareConfigs(openid, data) {
  const { configIds, oldQRFileID } = data;
  
  // 如果提供了旧的二维码文件ID，先删除旧文件
  if (oldQRFileID) {
    await deleteCloudFile(oldQRFileID);
  }
  
  if (!configIds || !Array.isArray(configIds) || configIds.length === 0) {
    throw new Error('请选择要分享的配置');
  }
  
  if (configIds.length > 20) {
    throw new Error('单次最多分享20个配置');
  }
  
  console.log('批量分享配置:', { openid, configIds });
  
  // 获取所有配置详情
  const configsData = [];
  for (const configId of configIds) {
    try {
      const result = await db.collection('user_configs').doc(configId).get();
      if (result.data && result.data.openid === openid) {
        configsData.push({
          configId: configId,
          configName: result.data.configName,
          satelliteParams: result.data.satelliteParams,
          linkParams: result.data.linkParams,
          calculationResults: result.data.calculationResults || {},
          noiseRatioMode: result.data.noiseRatioMode || 'ebno',
          markedParams: result.data.markedParams || [],
          highlightedRows: result.data.highlightedRows || []
        });
      }
    } catch (e) {
      console.log('获取配置失败:', configId, e);
    }
  }
  
  if (configsData.length === 0) {
    throw new Error('没有可分享的配置');
  }
  
  // 生成批次码
  const batchCode = await ensureUniqueBatchCode();
  
  // 保存批次分享记录
  const batchDoc = {
    batchCode,
    openid,
    configs: configsData,
    configCount: configsData.length,
    createTime: db.serverDate(),
    expireTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天后过期
    accessCount: 0
  };
  
  await db.collection('batch_shares').add({
    data: batchDoc
  });
  
  // 生成小程序码
  let qrCodeFileID = null;
  try {
    const resp = await cloud.openapi.wxacode.getUnlimited({
      scene: batchCode,  // 使用批次码作为scene参数
      page: 'pages/configs/configs',
      width: 430,
      autoColor: false,
      lineColor: { r: 74, g: 124, b: 89 }, // 主题绿色
      isHyaline: false
    });
    
    if (resp.buffer) {
      // 上传到云存储
      const fileName = `batch_qrcodes/${batchCode}_${Date.now()}.png`;
      const uploadResult = await cloud.uploadFile({
        cloudPath: fileName,
        fileContent: resp.buffer
      });
      qrCodeFileID = uploadResult.fileID;
      console.log('小程序码上传成功:', qrCodeFileID);
    }
  } catch (qrError) {
    console.error('生成小程序码失败:', qrError);
    // 小程序码生成失败不影响分享功能，前端可以用文字码
  }
  
  // 获取临时访问链接
  let qrCodeUrl = null;
  if (qrCodeFileID) {
    try {
      const urlResult = await cloud.getTempFileURL({
        fileList: [qrCodeFileID]
      });
      if (urlResult.fileList && urlResult.fileList[0]) {
        qrCodeUrl = urlResult.fileList[0].tempFileURL;
      }
    } catch (e) {
      console.error('获取临时链接失败:', e);
    }
  }
  
  return {
    success: true,
    batchCode,
    qrCodeFileID,
    qrCodeUrl,
    configCount: configsData.length,
    configNames: configsData.map(c => c.configName),
    message: `已生成批量分享，包含 ${configsData.length} 个配置`
  };
}

// 通过批次码获取批量配置
async function getBatchSharedConfigs(data) {
  const { batchCode } = data;
  
  if (!batchCode) {
    throw new Error('批次码不能为空');
  }
  
  console.log('获取批量分享配置:', batchCode);
  
  // 先确保集合存在
  await ensureBatchSharesCollection();
  
  const result = await db.collection('batch_shares').where({
    batchCode
  }).get();
  
  if (result.data.length === 0) {
    throw new Error('批次码无效或已过期');
  }
  
  const batchShare = result.data[0];
  
  // 检查是否过期
  if (batchShare.expireTime && new Date(batchShare.expireTime) < new Date()) {
    throw new Error('该分享已过期');
  }
  
  // 更新访问计数
  await db.collection('batch_shares').doc(batchShare._id).update({
    data: {
      accessCount: _.inc(1),
      lastAccessTime: db.serverDate()
    }
  });
  
  // 返回所有配置数据
  return {
    success: true,
    configs: batchShare.configs,
    configCount: batchShare.configCount
  };
}

# 卫星覆盖数据上传说明

## 概述
由于微信小程序包体积限制（2MB），覆盖数据已从小程序包中移除，需要上传到微信云存储。

## 数据文件位置
转换后的 JSON 文件位于：`CoverageCloudData/` 目录

## 上传步骤

### 方法1：通过微信开发者工具上传

1. 打开微信开发者工具
2. 点击 "云开发" 按钮进入云开发控制台
3. 选择 "存储" 标签
4. 创建目录结构：`coverage/`
5. 在 `coverage/` 目录下创建各卫星子目录：
   - coverage/中星6C/
   - coverage/中星6D/
   - coverage/中星6E/
   - coverage/中星9B/
   - coverage/中星9C/
   - coverage/中星10R/
   - coverage/中星11/
   - coverage/中星15/
   - coverage/中星26/
6. 将 `CoverageCloudData/` 中对应的 JSON 文件上传到各子目录

### 方法2：使用命令行工具批量上传

需要安装微信云开发 CLI 工具：

```bash
# 安装 cloudbase CLI
npm install -g @cloudbase/cli

# 登录
tcb login

# 上传文件（需要替换为你的环境ID）
tcb storage:upload CoverageCloudData/中星6C/ coverage/中星6C/ --envId prod-4gnkifhy3ab9c12c
tcb storage:upload CoverageCloudData/中星6D/ coverage/中星6D/ --envId prod-4gnkifhy3ab9c12c
tcb storage:upload CoverageCloudData/中星6E/ coverage/中星6E/ --envId prod-4gnkifhy3ab9c12c
tcb storage:upload CoverageCloudData/中星9B/ coverage/中星9B/ --envId prod-4gnkifhy3ab9c12c
tcb storage:upload CoverageCloudData/中星9C/ coverage/中星9C/ --envId prod-4gnkifhy3ab9c12c
tcb storage:upload CoverageCloudData/中星10R/ coverage/中星10R/ --envId prod-4gnkifhy3ab9c12c
tcb storage:upload CoverageCloudData/中星11/ coverage/中星11/ --envId prod-4gnkifhy3ab9c12c
tcb storage:upload CoverageCloudData/中星15/ coverage/中星15/ --envId prod-4gnkifhy3ab9c12c
tcb storage:upload CoverageCloudData/中星26/ coverage/中星26/ --envId prod-4gnkifhy3ab9c12c
```

## 更新云存储文件ID

上传完成后，需要确认 `satellite-coverage.js` 中的云存储环境ID是否正确。

打开 `miniprogram/pages/satellite-coverage/satellite-coverage.js`，找到 `loadCoverageFromCloud` 函数，
确保 fileID 中的环境ID与你的云开发环境匹配：

```javascript
const fileID = `cloud://你的环境ID.xxxx/coverage/${satelliteFolder}/${filename}`;
```

## 部署云函数（可选）

如果使用云函数加载数据，需要部署 `getCoverageData` 云函数：

1. 在微信开发者工具中右键点击 `cloudfunctions/getCoverageData`
2. 选择 "上传并部署：云端安装依赖"

## 测试

1. 在小程序中打开卫星覆盖页面
2. 选择一个有覆盖数据的卫星（如 CHINASAT 6C）
3. 点击 "覆盖" 按钮
4. 选择频段和波束
5. 点击 "加载覆盖图" 按钮
6. 应该能看到覆盖等值线在地图上显示

## 故障排除

### 错误：云存储访问失败
- 确认已正确配置云开发环境
- 确认文件已上传到正确的路径
- 检查云存储权限设置

### 错误：获取数据链接失败
- 确认 fileID 格式正确
- 确认环境ID与实际环境匹配

### 错误：下载数据失败
- 检查网络连接
- 确认 JSON 文件格式正确

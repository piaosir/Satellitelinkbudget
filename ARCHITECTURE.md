# 卫星链路预算计算系统 — 软件架构分析

> **Satellite Link Budget Calculator — WeChat Mini Program Architecture**
>
> 本文档对该微信小程序的整体软件架构进行分析，不涉及任何代码改动。

---

## 1. 项目概述

本项目是一个基于**微信小程序**平台的卫星通信链路预算计算工具，名为"卫星链路计算系统"（appid: `wxa214dba465dcc072`）。系统支持多频段（L/S/C/X/Ku/Ka/Q/V）、多调制方式（BPSK~128APSK）的完整链路预算分析，并集成了 AR 对星辅助、卫星覆盖可视化、配置管理与报告生成等功能。

项目采用 **多平台架构**（`projectArchitecture: "multiPlatform"`），同时包含微信小程序端（`miniprogram/`）和 Android 原生应用骨架（`miniapp/android/`）。

---

## 2. 顶层目录结构

```
Satellitelinkbudget/
├── miniprogram/              # 微信小程序前端（核心）
│   ├── app.js                # 应用入口 & 全局状态
│   ├── app.json              # 页面路由 & 窗口配置
│   ├── app.wxss              # 全局样式（工业级设计系统）
│   ├── app.miniapp.json      # 多平台适配配置
│   ├── envList.js            # 云环境列表
│   ├── sitemap.json          # 微信搜索爬虫配置
│   ├── pages/                # 页面模块
│   ├── components/           # 公共组件
│   ├── utils/                # 工具库 & 核心算法
│   └── images/               # 图片资源
├── cloudfunctions/           # 腾讯云函数（后端）
│   ├── calculateLink/        # 链路计算云函数
│   └── quickstartFunctions/  # 基础云开发示例函数
├── miniapp/                  # 多平台原生资源
│   └── android/              # Android 原生配置
├── i18n/                     # 国际化配置模板
├── project.config.json       # 微信开发者工具项目配置
├── project.miniapp.json      # 多平台项目配置
├── project.private.config.json # 私有开发配置
└── uploadCloudFunction.sh    # 云函数部署脚本
```

---

## 3. 总体架构

### 3.1 架构模式

系统采用 **前端为主 + 云函数为辅** 的混合架构：

```
┌──────────────────────────────────────────────────────────┐
│                     微信客户端                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  App 层 (app.js)                                    │ │
│  │  · 云开发初始化 (wx.cloud.init)                      │ │
│  │  · 全局状态管理 (globalData)                         │ │
│  │  · 默认参数工厂 (getDefaultSatelliteParams/LinkParams)│ │
│  ├──────────────────────────────────────────────────────┤ │
│  │  页面层 (pages/)                                     │ │
│  │  ┌────────┐ ┌────────┐ ┌──────┐ ┌────────┐         │ │
│  │  │ index  │ │ report │ │ ar-  │ │satellite│         │ │
│  │  │(计算)  │ │(报告)  │ │align │ │coverage │         │ │
│  │  └───┬────┘ └───┬────┘ └──┬───┘ └───┬────┘         │ │
│  │      │          │         │          │               │ │
│  │  ┌───┴──┐  ┌────┴───┐ ┌──┴──┐  ┌───┴────┐         │ │
│  │  │configs│  │settings│ │     │  │        │         │ │
│  │  │(配置) │  │(设置)  │ │     │  │        │         │ │
│  │  └──────┘  └────────┘ │     │  │        │         │ │
│  ├───────────────────────┼─────┼──┼────────┼─────────┤ │
│  │  工具层 (utils/)      │     │  │        │         │ │
│  │  ┌────────────────┐   │     │  │        │         │ │
│  │  │linkCalculator  │◄──┘     │  │        │         │ │
│  │  │(核心算法引擎)   │◄────────┘  │        │         │ │
│  │  ├────────────────┤            │        │         │ │
│  │  │constants       │  cities    │rainRate│         │ │
│  │  │validator       │  formatter │qrcode  │         │ │
│  │  └────────────────┘            │        │         │ │
│  └──────────────────────────────────────────────────────┘ │
└───────────────────────────┬──────────────────────────────┘
                            │ wx.cloud.callFunction()
                            ▼
┌──────────────────────────────────────────────────────────┐
│                    腾讯云开发                              │
│  ┌──────────────────┐  ┌──────────────────────┐          │
│  │  calculateLink   │  │ quickstartFunctions   │          │
│  │  (链路计算)       │  │ (基础云开发)           │          │
│  └──────────────────┘  └──────────────────────┘          │
└──────────────────────────────────────────────────────────┘
```

### 3.2 关键设计决策

| 设计决策 | 说明 |
|---------|------|
| **本地优先计算** | 链路预算核心算法同时存在于前端 (`utils/linkCalculator.js`, 1731行) 和云函数 (`calculateLink/index.js`, 1028行)，前端本地即可完成全部计算，无需网络 |
| **全局状态共享** | 通过 `app.globalData` 在页面间共享卫星参数、链路参数和计算结果，无需引入状态管理库 |
| **多链路支持** | 支持同时管理 8 条独立链路，通过 `currentLinkNum` 切换 |
| **懒加载** | `app.json` 配置 `"lazyCodeLoading": "requiredComponents"` 实现组件按需加载 |
| **配置持久化** | 使用微信本地存储 (`wx.setStorageSync`) 保存/加载配置，支持 Base64 编码分享 |

---

## 4. 前端架构 (miniprogram/)

### 4.1 应用入口 — app.js

```
App({
  onLaunch()
    ├── wx.cloud.init()          // 初始化云开发
    └── this.globalData = {
          currentLinkNum: 1,       // 当前链路编号
          satelliteParams: {},     // 卫星参数
          linkParams: {1..8},      // 8条链路参数
          calculationResults: {},  // 计算结果
          highlightedRows: [],     // 报告标记行
          noiseRatioMode: 'ebno'   // Eb/N0 或 Es/N0
        }

  getDefaultSatelliteParams()     // 卫星参数工厂
  getDefaultLinkParams()          // 链路参数工厂
})
```

**职责**：
- 初始化微信云开发环境（环境 ID: `cloud1-8gjv5ekx41d6fb76`）
- 管理全局数据模型，为所有页面提供共享状态
- 提供默认参数模板（卫星参数、链路参数），确保与 Web 版 (`index.html`) 对齐

### 4.2 页面模块

#### 4.2.1 index（主计算页）— 2012 行

**路径**: `pages/index/index`

**职责**：主界面，负责参数输入、链路预算计算、结果展示。

**数据流**：
```
用户输入 → 参数验证(validator) → 本地计算(linkCalculator) → 结果展示
                                  ↕
                            globalData 同步
```

**关键特性**：
- 支持 8 条链路切换（Tab 标签）
- 卫星参数面板：卫星选择、轨道位置、频段、SFD、转发器带宽、极化等
- 上行站/接收站双栏布局：天线口径、位置坐标、频率、效率、馈线损耗等
- 载波参数：信息速率、调制方式、FEC编码率、符号速率
- 城市选择器：快速填充经纬度和降雨率
- 计算模式：反向模式（余量→功放功率）/ 正向模式（功放功率→余量）
- 功带平衡：自动调整余量使带宽占用率≈功率占用率
- 实时参数预览：EIRP、功放推荐、G/Te、带宽、符号速率
- 历史记录：保存最近 10 次计算

**依赖**：`constants`, `validator`, `formatter`, `linkCalculator`, `cities`, `rainRate`

#### 4.2.2 report（报告页）— 416 行

**路径**: `pages/report/report`

**职责**：生成专业的中英双语链路预算分析报告。

**关键特性**：
- 内置中英文翻译字典（`translations.zh` / `translations.en`）
- 报告分为六大章节：系统配置、卫星参数、链路质量、上行链路、下行链路、功放配置
- 链路质量评级：优秀(>6dB) / 良好(>3dB) / 合格(>0dB) / 不足(<0dB)
- 支持分享报告与复制文本

**数据来源**：从 `app.globalData.calculationResults` 读取计算结果

#### 4.2.3 ar-align（AR 对星页）— 708 行

**路径**: `pages/ar-align/ar-align`

**职责**：利用手机传感器和 GPS 辅助用户对准卫星。

**工作流程**：
```
1. 选择卫星 → 获取轨道位置
2. GPS定位 → 获取用户经纬度
3. calculateSatelliteAngle() → 计算目标方位角/仰角
4. 陀螺仪+罗盘 → 实时获取手机朝向
5. AR叠加 → 显示卫星指示图标 + 对准反馈
```

**传感器融合**：
- `wx.startDeviceMotionListening()` — 设备运动（beta/gamma 角度）
- `wx.startCompass()` — 电子罗盘（方位角）
- `wx.getLocation()` — GPS 定位
- 传感器数据平滑（历史记录滑动窗口，`historySize: 2`）

#### 4.2.4 satellite-coverage（卫星覆盖图）— 644 行

**路径**: `pages/satellite-coverage/satellite-coverage`

**职责**：在地图上可视化卫星覆盖范围和等仰角线。

**关键特性**：
- 使用微信原生 `<map>` 组件
- 覆盖数据文件存储在 `CoverageDATA/CoverageForWechat/` 目录下（按卫星分文件）
- 等仰角线绘制：支持自定义仰角值（默认 3°, 5°, 10°, 15°）
- 用户位置检测：判断是否在卫星覆盖范围内
- 支持 28 颗卫星的覆盖数据

#### 4.2.5 configs（配置管理页）— 755 行

**路径**: `pages/configs/configs`

**职责**：链路配置的保存、加载、分享与导入。

**数据持久化**：
```
本地存储 (wx.setStorageSync)
  ├── 保存配置 → JSON序列化 → 本地存储
  ├── 加载配置 → 本地存储 → 反序列化 → globalData
  └── 分享配置 → JSON → Base64编码 → 分享链接/二维码

分享流程:
  发送方: 配置 → Base64 → onShareAppMessage() → 微信分享
  接收方: shareCode参数 → Base64解码 → 导入配置
```

**支持**：微信好友分享 (`onShareAppMessage`) 和朋友圈分享 (`onShareTimeline`)

#### 4.2.6 settings（设置页）— 55 行

**路径**: `pages/settings/settings`

**职责**：缓存管理、帮助说明、用户反馈（基础占位实现）。

#### 4.2.7 example（示例页）

**路径**: `pages/example/`

**职责**：腾讯云开发功能示例代码（getOpenId、数据库操作、文件上传、AI Agent 集成），非核心业务功能。

---

### 4.3 工具层 (utils/)

| 模块 | 行数 | 职责 |
|------|------|------|
| **linkCalculator.js** | 1731 | **核心计算引擎**。包含完整的卫星链路预算算法，含 ITU-R P.838 降雨衰减、ITU-R S.465-6 天线离轴增益、仰角/方位角/极化角计算、自由空间损耗、C/N 计算、功带平衡等。导出 `calculateLinkBudget()` 和 `calculateSatelliteAngle()` |
| **constants.js** | 183 | 系统常量。调制方式/频段/极化选项、ITU-R P.838 系数表、物理常量、结果标签配置 |
| **validator.js** | 319 | 输入验证。FEC编码率（支持分数格式）、数值范围、经纬度、仰角、卫星参数、链路参数全量验证 |
| **formatter.js** | 199 | 数据格式化。数值、科学计数法、BER、百分比、日期时间、坐标、文件大小等格式化工具 |
| **cities.js** | 171 | 城市数据。中国及国际主要城市的经纬度坐标，支持搜索和按名查询 |
| **rainRate.js** | 198 | 降雨率数据。基于 ITU 统计的地理区域降雨率，支持按经纬度估算和最近城市查找 |
| **qrcode.js** | 888 | QR 码生成。用于配置分享的二维码生成库 |

### 4.4 组件层 (components/)

| 组件 | 职责 |
|------|------|
| **cloudTipModal** | 通用模态弹窗组件（标题、内容、关闭按钮），用于提示和引导信息 |

### 4.5 样式架构 (app.wxss)

全局样式系统采用"工业级专业化设计"风格：

- **设计系统**：统一的配色（深蓝/灰色调）、字体栈（系统字体 + 等宽数字字体）
- **布局系统**：Grid 网格布局（2/3/4列 + auto-fit）、双栏布局（发信/收信站并排）
- **组件库**：卡片 (`.card`)、表单 (`.form-*`)、按钮 (`.btn-*`)、折叠面板 (`.collapse-*`)、标签 (`.tag`)
- **工具类**：文本颜色 (`.text-*`)、背景色 (`.bg-*`)、微交互 (`.hover-lift`)
- **数字专用**：等宽数字字体类 (`.numeric`)，确保数据对齐

---

## 5. 后端架构 (cloudfunctions/)

### 5.1 calculateLink 云函数 — 1028 行

**运行环境**：腾讯云 SCF (Serverless Cloud Function)

**职责**：服务端链路预算计算，算法与前端 `linkCalculator.js` **保持一致**。

**算法一致性**：
- 物理常量定义相同
- ITU-R P.838 降雨衰减系数表相同
- 调制因子表相同
- 计算流程对齐

**调用方式**：
```javascript
wx.cloud.callFunction({
  name: 'calculateLink',
  data: { satParams, linkParams }
})
```

### 5.2 quickstartFunctions 云函数 — 186 行

**职责**：云开发基础功能封装。

**提供操作**：
- `getOpenId` — 获取用户 OpenID
- 数据库 CRUD 操作（增/改/删记录）
- 文件上传至云存储
- QR 码生成

---

## 6. 数据架构

### 6.1 全局数据模型

```
app.globalData
├── currentLinkNum: number          // 当前链路编号 (1-8)
├── noiseRatioMode: string          // 'ebno' | 'esno'
├── satelliteParams: {              // 卫星参数（全链路共享）
│     satelliteName, orbitPosition, frequencyBand,
│     uplinkPolarization, sfdRef, transponderBandwidth,
│     beamInput, BOi, BOo, deltaTheta,
│     adjUplinkFactor, adjDownlinkFactor,
│     xpolUplinkFactor, xpolDownlinkFactor, intermodFactor
│   }
├── linkParams: {                   // 链路参数（每条链路独立）
│     [1..8]: {
│       // 上行站: earthStationLocation, antennaDiameter,
│       //   longitude, latitude, centerFrequency, ...
│       // 接收站: rxEarthStationLocation, rxAntennaDiameter,
│       //   rxLongitude, rxLatitude, rxCenterFrequency, ...
│       // 载波: infoRate, modulation, fec, rsCode,
│       //   bandwidthFactor, ber, ebno, margin
│     }
│   }
├── calculationResults: {}          // 最新计算结果
└── highlightedRows: []             // 报告标记行
```

### 6.2 数据流

```
                        ┌──────────────┐
                        │  app.js      │
                        │  globalData  │
                        └──────┬───────┘
                   ┌───────────┼───────────┐
                   ▼           ▼           ▼
            ┌──────────┐ ┌──────────┐ ┌──────────┐
            │  index   │ │  report  │ │  configs  │
            │  (读/写) │ │  (只读)  │ │  (读/写)  │
            └──────────┘ └──────────┘ └──────────┘

index 页面:
  输入 → validate() → calculateLinkBudget() → globalData.calculationResults
                                              → setData() → 视图更新

report 页面:
  onLoad() → 读取 globalData.calculationResults → 渲染报告

configs 页面:
  保存: globalData → JSON → wx.setStorageSync()
  加载: wx.getStorageSync() → JSON → globalData
  分享: JSON → Base64 → 微信分享链接
```

### 6.3 持久化策略

| 数据类型 | 存储方式 | 说明 |
|---------|---------|------|
| 链路配置 | `wx.setStorageSync` | 本地存储，支持多份配置 |
| 计算结果 | 内存 (`globalData`) | 会话级，不持久化 |
| 历史记录 | `wx.setStorageSync` | 最近 10 次计算记录 |
| 分享配置 | Base64 URL 参数 | 通过分享链接传递 |

---

## 7. 核心算法架构

`linkCalculator.js` 是系统的计算核心（1731 行），实现了完整的卫星通信链路预算分析：

### 7.1 算法模块

```
linkCalculator.js
├── 物理常量 (CONSTANTS)
│     光速, 地球半径, GEO卫星高度, 玻尔兹曼常数
│
├── ITU-R 标准实现
│   ├── P.838 降雨衰减系数表 (P838_TABLE)
│   │     1~100 GHz 范围, H/V 极化
│   ├── calculateSinglePathRainAttenuation()
│   │     ITU-R 降雨衰减计算
│   └── S.465-6 天线离轴增益
│         calculateITU465OffAxisGain()
│         calculateITU465Isolation()
│         支持大/中/小型天线 (D/λ ≥100, ≥50, <50)
│
├── 几何计算
│   ├── calculateSatelliteAngle()
│   │     仰角, 方位角 (用于 AR 对星)
│   └── calculatePolarizationAngle()
│         极化角计算
│
├── 损耗计算
│   ├── 自由空间损耗 (FSL)
│   ├── 大气衰减 calculateAtmosphericAttenuation()
│   ├── 云雾衰减 calculateCloudAttenuation()
│   ├── 天线罩损耗 getDefaultRadomeLoss()
│   ├── 指向损耗 calculatePointingLoss()
│   └── 闪烁衰落 calculateScintillationFading()
│
├── 链路预算主函数
│   └── calculateLinkBudget(satParams, linkParams)
│       └── performCalculations(satParams, inputs)
│             ├── 上行链路: 天线增益, EIRP, FSL, 降雨衰减, C/T
│             ├── 下行链路: G/Te, FSL, 降雨衰减, C/T
│             ├── 载波参数: 符号速率, 带宽, C/N门限
│             ├── 干扰计算: 邻星/交叉极化/互调
│             ├── 总C/T合成: 上行+下行+干扰
│             ├── UPC补偿
│             ├── 链路余量
│             └── 转发器容量 & 功放推荐
│
└── 辅助函数
    ├── findClosestFrequency() — 频率插值
    └── getCoefficients() — 降雨系数获取
```

### 7.2 计算流程

```
输入参数
  ├── 卫星: 轨位, SFD, 转发器带宽, BOi/BOo, 干扰因子
  └── 链路: 发站/收站坐标, 天线, 频率, 调制, FEC, BER门限
      │
      ▼
┌─ 几何计算 ──────────────────────────────┐
│  仰角 → 方位角 → 极化角 → 星地距离      │
└─────────────────────────────────────────┘
      │
      ▼
┌─ 上行链路 ──────────────────────────────┐
│  天线增益 → EIRP → FSL → 降雨衰减       │
│  → 大气衰减 → 上行C/T                    │
│  → 邻星干扰C/T → 交叉极化C/T            │
└─────────────────────────────────────────┘
      │
      ▼
┌─ 下行链路 ──────────────────────────────┐
│  G/Te → FSL → 降雨衰减 → 大气衰减       │
│  → 下行C/T → 邻星干扰 → 交叉极化 → 互调 │
└─────────────────────────────────────────┘
      │
      ▼
┌─ 链路合成 ──────────────────────────────┐
│  上行总C/T + 下行总C/T → 系统总C/T       │
│  → UPC补偿 → 载波C/N → 链路余量          │
│  → 带宽占用率 → 功率占用率 → 功放推荐    │
└─────────────────────────────────────────┘
      │
      ▼
输出: 60+ 项计算结果
```

---

## 8. 页面路由与导航

```json
// app.json
{
  "pages": [
    "pages/index/index",                    // 首页（链路计算）
    "pages/report/report",                  // 报告页
    "pages/configs/configs",                // 配置管理
    "pages/settings/settings",              // 设置
    "pages/ar-align/ar-align",              // AR 对星
    "pages/satellite-coverage/satellite-coverage"  // 卫星覆盖
  ]
}
```

**导航方式**：
- `index` → `report`：计算完成后跳转查看报告
- `index` → `configs`：保存/加载配置
- `index` → `ar-align`：可视化功能面板进入
- `index` → `satellite-coverage`：可视化功能面板进入
- `index` → `settings`：设置入口
- 外部分享链接 → `configs`：通过 `shareCode` 参数直接导入配置

---

## 9. 权限与平台能力

### 9.1 所需权限

| 权限 | 用途 |
|------|------|
| `scope.userLocation` | AR 对星 — 获取用户 GPS 位置 |
| `scope.camera` | AR 对星 — 摄像头实时预览 |
| `getLocation` | 位置服务 |
| `startLocationUpdate` | 持续位置更新 |

### 9.2 平台 API 使用

| API | 页面 | 用途 |
|-----|------|------|
| `wx.cloud.init()` | app.js | 初始化云开发 |
| `wx.cloud.callFunction()` | index | 调用云函数计算 |
| `wx.setStorageSync()` | configs | 本地存储配置 |
| `wx.getLocation()` | ar-align | GPS 定位 |
| `wx.startDeviceMotionListening()` | ar-align | 陀螺仪 |
| `wx.startCompass()` | ar-align | 电子罗盘 |
| `wx.createMapContext()` | satellite-coverage | 地图操作 |
| `wx.onShareAppMessage()` | configs | 微信分享 |
| `wx.showToast/Modal/Loading()` | 多页面 | UI 反馈 |

---

## 10. 代码规模统计

| 模块 | 文件 | 行数 |
|------|------|------|
| **核心算法** | linkCalculator.js | 1,731 |
| **主计算页** | index.js | 2,012 |
| **云函数** | calculateLink/index.js | 1,028 |
| **QR码** | qrcode.js | 888 |
| **配置管理** | configs.js | 755 |
| **AR对星** | ar-align.js | 708 |
| **卫星覆盖** | satellite-coverage.js | 644 |
| **报告页** | report.js | 416 |
| **验证器** | validator.js | 319 |
| **格式化** | formatter.js | 199 |
| **降雨率** | rainRate.js | 198 |
| **常量** | constants.js | 183 |
| **城市数据** | cities.js | 171 |
| **云函数(基础)** | quickstartFunctions/index.js | 186 |
| **设置页** | settings.js | 55 |
| **总计** | — | **~9,493** |

---

## 11. 架构特点总结

### 优势

1. **离线优先**：核心计算逻辑在前端本地完成，无需网络即可使用
2. **算法冗余**：前端与云函数保持算法一致，提供双重计算路径
3. **标准合规**：严格遵循 ITU-R P.838、ITU-R S.465-6 等国际标准
4. **功能完整**：从参数输入、计算分析、AR辅助到报告生成的完整工作流
5. **配置可分享**：Base64 编码 + 微信社交分享链，方便团队协作
6. **多链路支持**：同时管理 8 条独立链路，适应复杂场景

### 关注点

1. **代码重复**：`linkCalculator.js` (1731行) 与 `calculateLink/index.js` (1028行) 存在大量重复的算法代码（常量表、计算逻辑），维护时需同步更新
2. **卫星列表硬编码**：28 颗卫星的数据在 `index.js`、`ar-align.js`、`satellite-coverage.js` 三个页面中各有一份，存在数据冗余
3. **状态管理简单**：仅使用 `app.globalData` 做全局状态，页面间数据同步依赖手动操作
4. **国际化未完整**：`i18n/base.json` 仅为模板，实际翻译内嵌在 `report.js` 中，其他页面为纯中文
5. **组件化程度低**：仅有 1 个公共组件 (`cloudTipModal`)，各页面 UI 直接在 WXML 中实现

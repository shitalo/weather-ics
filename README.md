# 天气订阅日历 (Weather ICS)

一个基于 Nuxt 3 的天气订阅服务，可以将天气预报转换为 iCalendar (.ics) 格式，支持添加到各种日历应用中。

## 🌟 功能特性

- **城市搜索**：支持中文城市名搜索，自动匹配地理位置
- **天气订阅**：生成7天天气预报的日历订阅链接
- **多API支持**：支持和风天气API和Nominatim地理编码API
- **IP定位**：自动获取用户位置作为默认选项
- **现代化UI**：响应式设计，支持移动端和桌面端
- **一键复制**：快速复制订阅链接到剪贴板
- **多平台部署**：支持Vercel、Cloudflare等平台部署

## 🏗️ 技术架构

### 前端技术栈
- **Nuxt 3** - Vue 3 全栈框架
- **Vue 3** - 渐进式JavaScript框架
- **TypeScript** - 类型安全的JavaScript

### 后端服务
- **Nuxt Server API** - 服务端API路由
- **和风天气API** - 天气预报数据源
- **Nominatim API** - 地理编码服务（可选）
- **ip-api.com** - IP地理位置服务

## 🔧 工作原理

1. **城市搜索**：用户输入城市名，系统调用地理编码API获取经纬度
2. **天气获取**：使用经纬度或城市ID调用和风天气API获取7天预报
3. **ICS生成**：将天气数据转换为iCalendar格式
4. **订阅链接**：生成包含天气信息的日历订阅URL

### API调用流程

```
用户输入城市名 → 地理编码API → 获取经纬度 → 和风天气API → 7天预报 → 生成ICS → 返回订阅链接
```

## 📋 环境变量配置

> 所有环境变量的**大小写均不敏感**：  
> - `GEO_API_PROVIDER` 会被统一转为小写后再判断  
> - `USE_SERVER_NOMINATIM` 会把值转为小写字符串后再对比 `true`

### 环境变量一览

| 变量名 | 是否必需 | 默认值 | 示例值 | 说明 |
|--------|----------|--------|--------|------|
| `HEFENG_API_KEY` | ✅ 必需 | 无 | `your_hefeng_api_key_here` | 和风天气 API Key，用于获取 7 天预报数据 |
| `GEO_API_PROVIDER` | ⭕ 可选 | `hefeng` | `hefeng` / `nominatim` | 地理编码提供商，支持和风 GeoAPI 或 OpenStreetMap Nominatim，值大小写不敏感（如 `NOMINATIM` 也可） |
| `USE_SERVER_NOMINATIM` | ⭕ 可选 | `false` | `true` | 是否优先通过服务端代理访问 Nominatim，`true` / `false` 大小写不敏感，`true` 时先请求 `/api/nominatim`，失败再回退到浏览器直连 |
| `NITRO_PRESET` | ⭕ 可选 | 自动检测 | `vercel` / `cloudflare` 等 | 手动指定 Nitro 部署预设，通常不需要设置，除非想覆盖自动检测结果 |

### 🎯 智能平台检测

项目支持自动检测部署平台，无需手动设置 `NITRO_PRESET`：

- **Vercel**：自动检测 `VERCEL` 环境变量
- **Cloudflare Pages**：自动检测 `CF_PAGES` 或 `CLOUDFLARE` 环境变量  
- **Netlify**：自动检测 `NETLIFY` 环境变量
- **Railway**：自动检测 `RAILWAY_STATIC_URL` 环境变量
- **Heroku**：自动检测 `HEROKU_APP_NAME` 环境变量

**优先级**：手动设置的 `NITRO_PRESET` > 自动检测 > 默认配置

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone <repository-url>
cd weather-ics
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

创建 `.env` 文件：

```bash
HEFENG_API_KEY=your_hefeng_api_key_here
GEO_API_PROVIDER=hefeng
USE_SERVER_NOMINATIM=false
```

### 4. 启动开发服务器

```bash
# 本地开发
pnpm dev

# 局域网访问（支持移动端测试）
pnpm dev:lan
```

### 5. 构建生产版本

```bash
pnpm build
pnpm preview
```

## 🌐 API接口

### 天气ICS订阅接口

**端点**：`GET /api/weather-ics`

**参数**：

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `locationId` | string | 可选 | 和风天气城市ID |
| `lat` | string | 可选 | 纬度 |
| `lon` | string | 可选 | 经度 |
| `city` | string | 可选 | 城市名称（用于显示） |

**使用方式**：

1. **使用城市ID**：
   ```
   /api/weather-ics?locationId=101010100&city=北京
   ```

2. **使用经纬度**：
   ```
   /api/weather-ics?lat=39.9042&lon=116.4074&city=北京
   ```

3. **自动IP定位**：
   ```
   /api/weather-ics
   ```

**返回格式**：`text/calendar` (iCalendar格式)

## 🔌 第三方API

### 和风天气API

- **天气预报**：`https://devapi.qweather.com/v7/weather/7d`
- **地理编码**：`https://geoapi.qweather.com/v2/city/lookup`
- **认证方式**：API Key
- **请求限制**：根据和风天气套餐限制

### Nominatim API (OpenStreetMap)

- **地理编码**：`https://nominatim.openstreetmap.org/search`
- **认证方式**：无需认证
- **请求限制**：1秒1次请求

### ip-api.com

- **IP定位**：`http://ip-api.com/json/{ip}`
- **认证方式**：无需认证
- **请求限制**：每分钟45次

## 📱 使用说明

### 1. 搜索城市
在首页输入框中输入城市名称（如：北京、上海、广州等）

### 2. 选择位置
从搜索结果中选择准确的城市位置

### 3. 获取订阅链接
系统自动生成包含天气信息的日历订阅链接

### 4. 添加到日历
- **复制链接**：点击"复制链接"按钮
- **打开链接**：点击"打开链接"按钮，选择日历应用

### 5. 订阅效果
日历中将显示每日天气信息，包括：
- 天气图标和描述
- 最高/最低温度
- 城市名称

## 🚀 部署指南

### Vercel部署

1. **推送代码**到GitHub/GitLab/Bitbucket
2. **导入项目**到Vercel，自动识别Nuxt
3. **配置环境变量**：
   - `HEFENG_API_KEY`（必需）
   - `GEO_API_PROVIDER`（可选）
   - `NITRO_PRESET=vercel`（可选，系统会自动检测）

**注意**：Vercel会自动设置 `VERCEL` 环境变量，系统会自动检测并配置为 `vercel` preset。

### Cloudflare部署

1. **安装wrangler**：
   ```bash
   pnpm add -D wrangler
   ```

2. **配置wrangler.toml**：
   ```toml
   name = "weather-ics"
   compatibility_date = "2024-01-01"
   ```

3. **设置环境变量**：
   ```bash
   wrangler secret put HEFENG_API_KEY
   ```

4. **部署**：
   ```bash
   wrangler deploy
   ```

**注意**：Cloudflare Pages会自动设置 `CF_PAGES` 环境变量，系统会自动检测并配置为 `cloudflare` preset。

### 其他平台

项目支持任何支持Nuxt 3的平台，如：
- **Netlify**：自动检测 `NETLIFY` 环境变量
- **Railway**：自动检测 `RAILWAY_STATIC_URL` 环境变量  
- **Heroku**：自动检测 `HEROKU_APP_NAME` 环境变量
- **自建服务器**：使用默认配置

### 🎯 部署建议

- **推荐**：让系统自动检测平台，无需手动设置 `NITRO_PRESET`
- **特殊情况**：如需强制使用特定配置，可手动设置 `NITRO_PRESET`
- **调试**：部署时查看构建日志，确认平台检测是否正常

## 🛠️ 开发指南

### 项目结构

```
weather-ics/
├── app.vue                 # 应用入口
├── pages/
│   └── index.vue          # 首页
├── server/
│   ├── api/
│   │   └── weather-ics.ts # ICS API接口
│   └── services/
│       ├── weatherHeFeng.ts # 和风天气服务
│       └── weatherTypes.ts  # 类型定义
├── nuxt.config.ts         # Nuxt配置
└── package.json           # 项目依赖
```

### 添加新的天气服务

1. 在 `server/services/` 创建新的服务文件
2. 实现统一的接口格式
3. 在API路由中集成新服务

### 自定义样式

项目使用Vue 3的 `<style scoped>` 进行样式隔离，可根据需要修改 `pages/index.vue` 中的样式。

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📞 支持

如有问题，请通过以下方式联系：
- 提交GitHub Issue
- 发送邮件至：[your-email@example.com]

---

**注意**：使用和风天气API需要注册开发者账号并获取API密钥。免费版有调用次数限制，请根据实际需求选择合适的套餐。

# Weather ICS

把天气预报变成可订阅的日历链接。

`Weather ICS` 是一个基于 Nuxt 3 的天气订阅服务。用户输入城市、街道或景点名称后，系统会完成地理编码、获取天气、生成 `.ics` 内容，并返回可以长期订阅的日历地址，适合添加到 Apple Calendar、Google Calendar、Outlook 或团队协作日历中。

## 为什么用它

- 订阅而不是手动查看：把天气直接放进日历
- 支持模糊地名搜索：城市、区县、街道、景点都可以尝试
- 支持和风 GeoAPI 与 Nominatim 两套地理编码方案
- 可选 MySQL 缓存，减少重复请求并保留历史天气数据
- 支持 IP 定位兜底，在未传位置参数时自动补足位置
- 服务端日志已统一，方便排查缓存、上游请求和部署问题

## 重要升级说明

当前版本是一次重要更新。

项目已仅支持和风天气控制台中的专属 API Host，不再兼容以下旧公共域名：

- `devapi.qweather.com`
- `api.qweather.com`
- `geoapi.qweather.com`

你现在必须配置：

```bash
HEFENG_API_HOST=abc.def.qweatherapi.com
```

升级后接口实际访问方式如下：

- 天气接口：`https://你的APIHost/v7/weather/7d`
- Geo 接口：`https://你的APIHost/geo/v2/city/lookup`

如果仍然沿用旧公共域名，服务会直接报错并拒绝请求。

这意味着：

- 本次更新可能与上一个版本的环境变量配置不兼容
- 请先确认部署平台上的 `HEFENG_API_HOST` 已更新，再执行升级

## 功能特性

- 地理编码：支持和风 GeoAPI，也支持 OpenStreetMap Nominatim
- 天气订阅：将天气预报转换为 iCalendar (`.ics`) 订阅源
- 历史数据合并：启用缓存后，可将历史天气一并写入生成结果
- 智能缓存：优先读取数据库中的新鲜数据，过期后自动刷新
- 平台兼容：支持常见系统日历与在线日历工具
- 自动部署适配：可自动识别 Vercel、Cloudflare Pages、Netlify、Railway、Heroku

## 工作流程

```text
输入地点名称
-> 地理编码
-> 获取经纬度或 locationId
-> 查询数据库缓存（可选）
-> 缓存有效则直接使用
-> 否则请求和风天气 7 日预报
-> 异步回写数据库（可选）
-> 合并历史缓存数据（可选）
-> 生成 ICS
-> 返回订阅链接
```

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

创建 `.env`：

```bash
HEFENG_API_KEY=your_hefeng_api_key_here
HEFENG_API_HOST=abc.def.qweatherapi.com

GEO_API_PROVIDER=hefeng
USE_SERVER_NOMINATIM=false

ENABLE_DATABASE_CACHE=false
ENABLE_IP_LOCATION_FALLBACK=false

MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=weather_ics

MAX_HISTORY_DAYS=31
CACHE_EXPIRE_MINUTES=90
```

### 3. 初始化数据库（可选）

如果你需要启用数据库缓存，先创建数据库并执行初始化脚本：

```bash
mysql -u root -p
CREATE DATABASE IF NOT EXISTS weather_ics CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE weather_ics;
SOURCE database/init.sql;
```

也可以直接执行：

```bash
mysql -u root -p weather_ics < database/init.sql
```

### 4. 启动开发环境

```bash
pnpm dev
```

如需局域网访问：

```bash
pnpm dev:lan
```

### 5. 构建生产版本

```bash
pnpm build
pnpm preview
```

## 环境变量说明

| 变量名 | 必需 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `HEFENG_API_KEY` | 是 | 无 | 和风天气 API Key |
| `HEFENG_API_HOST` | 是 | 无 | 和风天气专属 API Host，仅支持控制台中的 API Host |
| `GEO_API_PROVIDER` | 否 | `hefeng` | 地理编码提供方，可选 `hefeng` 或 `nominatim` |
| `USE_SERVER_NOMINATIM` | 否 | `false` | Nominatim 访问方式，可选 `true`、`false`、`auto` |
| `ENABLE_DATABASE_CACHE` | 否 | `false` | 是否启用 MySQL 天气缓存 |
| `ENABLE_IP_LOCATION_FALLBACK` | 否 | `false` | 未传位置参数时是否启用 IP 定位兜底 |
| `MYSQL_HOST` | 否 | 无 | MySQL 主机 |
| `MYSQL_PORT` | 否 | `3306` | MySQL 端口 |
| `MYSQL_USER` | 否 | 无 | MySQL 用户名 |
| `MYSQL_PASSWORD` | 否 | 无 | MySQL 密码 |
| `MYSQL_DATABASE` | 否 | 无 | MySQL 数据库名 |
| `MAX_HISTORY_DAYS` | 否 | `31` | 合并历史天气缓存的最大天数 |
| `CACHE_EXPIRE_MINUTES` | 否 | `90` | 缓存过期时间，单位分钟 |
| `NITRO_PRESET` | 否 | 自动检测 | Nitro 部署目标，如 `vercel`、`cloudflare` |

当前实现中的补充规则：

- `GEO_API_PROVIDER` 会被统一转为小写后判断
- `USE_SERVER_NOMINATIM` 支持 `true`、`false`、`auto`
- `ENABLE_DATABASE_CACHE` 与 `ENABLE_IP_LOCATION_FALLBACK` 支持 `true`、`false`
- 部署平台会自动检测 `VERCEL`、`CF_PAGES`、`NETLIFY`、`RAILWAY_STATIC_URL`、`HEROKU_APP_NAME`

## API 一览

### `GET /api/weather-ics`

生成天气日历订阅内容。

参数：

| 参数 | 必需 | 说明 |
| --- | --- | --- |
| `locationId` | 否 | 和风城市 ID |
| `lat` | 否 | 纬度 |
| `lon` | 否 | 经度 |
| `city` | 否 | 展示用地点名称 |

规则：

- 需要提供 `locationId`
- 或者同时提供 `lat` 和 `lon`
- 如果启用了 `ENABLE_IP_LOCATION_FALLBACK=true`，未传位置参数时会尝试按客户端 IP 自动定位

示例：

```text
/api/weather-ics?locationId=101010100&city=北京
/api/weather-ics?lat=39.9042&lon=116.4074&city=北京
```

返回：

- `text/calendar`
- 可直接作为日历订阅地址使用

### `GET /api/hefeng-geo`

和风天气地理编码代理接口。

示例：

```text
/api/hefeng-geo?location=北京
```

特点：

- 使用 `HEFENG_API_HOST/geo/v2/city/lookup`
- 会校验 API Host 是否为新的专属 Host
- 会把常见上游错误转换为更易理解的中文提示

### `GET /api/nominatim`

Nominatim 地理编码代理接口。

示例：

```text
/api/nominatim?q=beijing
```

特点：

- 作为可选地理编码方案
- 支持服务端代理访问
- 对超时、非 200 和服务不可用提供统一错误结构

## 缓存机制

启用 `ENABLE_DATABASE_CACHE=true` 后，系统会：

- 优先读取数据库中的今日及之后天气数据
- 在缓存未过期时直接使用缓存
- 在缓存过期或不存在时请求和风天气 API
- 异步回写最新天气数据到数据库
- 读取 `MAX_HISTORY_DAYS` 范围内的历史缓存并合并到 ICS 中

默认缓存过期时间为 `90` 分钟。

如果数据库不可用：

- 主流程不会中断
- 系统会自动回退到实时 API 获取数据

## 部署说明

项目支持自动识别以下平台：

- Vercel
- Cloudflare Pages
- Netlify
- Railway
- Heroku

也可以手动指定：

```bash
NITRO_PRESET=vercel
```

最少需要配置：

```bash
HEFENG_API_KEY=your_hefeng_api_key_here
HEFENG_API_HOST=abc.def.qweatherapi.com
```

如果继续使用旧公共域名，部署完成后请求会直接失败。

## 日志与排障

项目日志已统一为结构化格式，例如：

```text
[天气ICS] 请求开始 - locationId: ..., lat: ..., lon: ..., city: ...
[数据库查询] 查询完成 - 返回数据条数: ...
[和风天气] 7日天气获取成功 - location: ..., resultCount: ...
[错误] 错误堆栈: ...
```

这类日志会覆盖：

- 请求入口
- 缓存命中与过期判断
- 上游接口调用
- 数据库初始化、查询、保存
- 超时、异常与错误堆栈

适合在本地开发、云平台日志和服务器日志中快速定位问题。

## 项目结构

```text
weather-ics/
├─ app.vue
├─ pages/
│  └─ index.vue
├─ server/
│  ├─ api/
│  │  ├─ weather-ics.ts
│  │  ├─ hefeng-geo.ts
│  │  └─ nominatim.ts
│  ├─ qweather/
│  │  └─ index.ts
│  ├─ services/
│  │  ├─ weatherHeFeng.ts
│  │  ├─ weatherTypes.ts
│  │  └─ database.ts
│  └─ utils/
│     ├─ api.ts
│     └─ db-init.ts
├─ database/
│  └─ init.sql
├─ nuxt.config.ts
└─ package.json
```

## 技术栈

- Nuxt 3
- Vue 3
- TypeScript
- Nitro Server API
- MySQL（可选）

## License

MIT

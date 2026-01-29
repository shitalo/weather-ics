// https://nuxt.com/docs/api/configuration/nuxt-config

// 自动检测部署平台
function detectPlatform() {
  // 优先使用环境变量
  if (process.env.NITRO_PRESET) {
    return process.env.NITRO_PRESET
  }
  
  // 自动检测部署平台
  if (process.env.VERCEL) {
    return 'vercel'
  }
  if (process.env.CF_PAGES || process.env.CLOUDFLARE) {
    return 'cloudflare'
  }
  if (process.env.NETLIFY) {
    return 'netlify'
  }
  if (process.env.RAILWAY_STATIC_URL) {
    return 'railway'
  }
  if (process.env.HEROKU_APP_NAME) {
    return 'heroku'
  }
  
  // 默认不设置preset，使用通用配置
  return undefined
}

// 规范化环境变量，避免大小写影响结果
const rawGeoProvider = (process.env.GEO_API_PROVIDER || 'hefeng').toLowerCase()
const normalizedGeoProvider = ['hefeng', 'nominatim'].includes(rawGeoProvider)
  ? rawGeoProvider
  : 'hefeng'

// 支持 'true', 'false', 'auto' 三种选项
// 统一为字符串类型以便在 runtimeConfig 中使用
const rawUseServerNominatim = (process.env.USE_SERVER_NOMINATIM || 'false').toString().toLowerCase()
const normalizedUseServerNominatim = ['true', 'false', 'auto'].includes(rawUseServerNominatim)
  ? rawUseServerNominatim
  : 'false'

// 是否启用数据库缓存功能，默认 false（不启用）
const rawEnableDatabaseCache = (process.env.ENABLE_DATABASE_CACHE || 'false').toString().toLowerCase()
const normalizedEnableDatabaseCache = ['true', 'false'].includes(rawEnableDatabaseCache)
  ? rawEnableDatabaseCache === 'true'
  : false

export default defineNuxtConfig({
  compatibilityDate: '2025-05-15',
  devtools: { enabled: true },
  nitro: {
    preset: detectPlatform(),
  },
  router: {
    options: {
      strict: false
    }
  },
  runtimeConfig: {
    hefengApiKey: process.env.HEFENG_API_KEY,
    // 和风天气API Host（可选），用于替代公共API域名
    // 如果未配置，将使用旧的公共域名（devapi.qweather.com 和 geoapi.qweather.com）
    hefengApiHost: process.env.HEFENG_API_HOST,
    geoApiProvider: normalizedGeoProvider,
    // 是否启用数据库缓存功能，默认 false（不启用）
    enableDatabaseCache: normalizedEnableDatabaseCache,
    // MySQL数据库配置
    mysqlHost: process.env.MYSQL_HOST,
    mysqlPort: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306,
    mysqlUser: process.env.MYSQL_USER,
    mysqlPassword: process.env.MYSQL_PASSWORD,
    mysqlDatabase: process.env.MYSQL_DATABASE,
    // 历史天气数据最大天数，默认31天
    maxHistoryDays: process.env.MAX_HISTORY_DAYS ? parseInt(process.env.MAX_HISTORY_DAYS) : 31,
    public: {
      hefengApiKey: process.env.HEFENG_API_KEY,
      // 和风天气API Host（可选），前端也需要使用
      hefengApiHost: process.env.HEFENG_API_HOST,
      geoApiProvider: normalizedGeoProvider,
      // 是否通过服务端代理访问 Nominatim，默认 false（浏览器直连）
      // 可选值：'true'（服务端代理）、'false'（浏览器直连）、'auto'（自动检测）
      // 使用类型断言以支持字符串类型
      useServerNominatim: normalizedUseServerNominatim as any
    }
  }
})

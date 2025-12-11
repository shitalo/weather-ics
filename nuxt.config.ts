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

const normalizedUseServerNominatim =
  (process.env.USE_SERVER_NOMINATIM || '').toString().toLowerCase() === 'true'

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
    geoApiProvider: normalizedGeoProvider,
    useServerNominatim: normalizedUseServerNominatim,
    public: {
      hefengApiKey: process.env.HEFENG_API_KEY,
      geoApiProvider: normalizedGeoProvider,
      // 是否通过服务端代理访问 Nominatim，默认 false（浏览器直连）
      useServerNominatim: normalizedUseServerNominatim
    }
  }
})

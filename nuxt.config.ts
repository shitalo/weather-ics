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
    geoApiProvider: process.env.GEO_API_PROVIDER || 'hefeng',
    public: {
      hefengApiKey: process.env.HEFENG_API_KEY,
      geoApiProvider: process.env.GEO_API_PROVIDER || 'hefeng'
    }
  }
})

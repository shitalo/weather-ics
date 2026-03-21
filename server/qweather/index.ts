const LEGACY_PUBLIC_QWEATHER_HOSTS = new Set([
  'api.qweather.com',
  'devapi.qweather.com',
  'geoapi.qweather.com'
])

export type QWeatherConfigErrorCode =
  | 'MISSING_HEFENG_API_HOST'
  | 'INVALID_HEFENG_API_HOST'
  | 'LEGACY_HEFENG_API_HOST'

export class QWeatherConfigError extends Error {
  code: QWeatherConfigErrorCode

  constructor(code: QWeatherConfigErrorCode, message: string) {
    super(message)
    this.name = 'QWeatherConfigError'
    this.code = code
  }
}

export function resolveQWeatherApiBaseUrl(apiHost?: string): string {
  const rawHost = String(apiHost || '').trim()

  if (!rawHost) {
    throw new QWeatherConfigError(
      'MISSING_HEFENG_API_HOST',
      '缺少 HEFENG_API_HOST 配置，请在和风控制台复制你的 API Host 并设置环境变量'
    )
  }

  const normalizedHost = rawHost.replace(/\/+$/, '')
  const candidateUrl = /^https?:\/\//i.test(normalizedHost)
    ? normalizedHost
    : `https://${normalizedHost}`

  let url: URL
  try {
    url = new URL(candidateUrl)
  } catch {
    throw new QWeatherConfigError(
      'INVALID_HEFENG_API_HOST',
      'HEFENG_API_HOST 格式不正确，请填写和风控制台提供的 API Host 域名'
    )
  }

  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
    throw new QWeatherConfigError(
      'INVALID_HEFENG_API_HOST',
      'HEFENG_API_HOST 只需填写域名本身，例如 abc.def.qweatherapi.com'
    )
  }

  const hostname = url.hostname.toLowerCase()
  if (LEGACY_PUBLIC_QWEATHER_HOSTS.has(hostname)) {
    throw new QWeatherConfigError(
      'LEGACY_HEFENG_API_HOST',
      'HEFENG_API_HOST 不能再使用 api.qweather.com、devapi.qweather.com 或 geoapi.qweather.com，请改为和风控制台中的专属 API Host'
    )
  }

  return url.origin
}

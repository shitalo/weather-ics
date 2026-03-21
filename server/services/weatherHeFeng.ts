import { resolveQWeatherApiBaseUrl } from '../qweather'
import type { WeatherDay } from './weatherTypes'

function getApiBaseUrl(): string {
  const config = useRuntimeConfig()
  return resolveQWeatherApiBaseUrl(config.hefengApiHost)
}

export async function getWeather7d({
  locationId,
  lat,
  lon
}: {
  locationId?: string
  lat?: string
  lon?: string
}): Promise<WeatherDay[]> {
  const config = useRuntimeConfig()
  const apiKey = String(config.hefengApiKey || '').trim()
  const baseUrl = getApiBaseUrl()

  if (!apiKey) {
    throw new Error('缺少 HEFENG_API_KEY 配置')
  }

  const location = locationId || (lat && lon ? `${lon},${lat}` : '')
  if (!location) {
    throw new Error('Missing locationId or lat/lon')
  }

  console.log(`[和风天气] 开始请求7日天气 - locationId: ${locationId || 'N/A'}, lat: ${lat || 'N/A'}, lon: ${lon || 'N/A'}, location: ${location}, baseUrl: ${baseUrl}`)

  const url = `${baseUrl}/v7/weather/7d?${new URLSearchParams({
    location,
    key: apiKey,
    lang: 'zh-hans'
  }).toString()}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'weather-ics/1.0'
      }
    })

    if (!res.ok) {
      console.warn(`[和风天气] 上游服务返回非成功状态 - location: ${location}, httpStatus: ${res.status}, statusText: ${res.statusText}`)
      throw new Error(`和风天气API错误: ${res.status} ${res.statusText}`)
    }

    const data = await res.json()

    if (data.code !== '200') {
      console.warn(`[和风天气] 上游服务返回业务错误 - location: ${location}, code: ${data.code}, message: ${data.msg || '未知错误'}`)
      throw new Error(`和风天气API返回错误: ${data.code} - ${data.msg || '未知错误'}`)
    }

    console.log(`[和风天气] 7日天气获取成功 - location: ${location}, resultCount: ${Array.isArray(data.daily) ? data.daily.length : 0}`)
    return (data.daily || []).map((d: any) => ({
      date: d.fxDate,
      text: d.textDay,
      tempMin: d.tempMin,
      tempMax: d.tempMax,
      icon: d.iconDay,
      wind: d.windDirDay,
      code: d.iconDay,
      sunrise: d.sunrise || undefined,
      sunset: d.sunset || undefined,
    }))
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.warn(`[和风天气] 请求超时 - location: ${location}, timeoutMs: 15000`)
      throw new Error('和风天气API请求超时')
    }
    if (error.message?.includes('ECONNRESET') || error.message?.includes('fetch')) {
      console.warn(`[和风天气] 网络连接失败 - location: ${location}`)
      throw new Error('网络连接失败，请稍后重试')
    }

    console.error(`[和风天气] 请求7日天气失败 - location: ${location}, 错误信息: ${error.message}`)
    console.error('[和风天气] 错误堆栈:', error.stack)
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

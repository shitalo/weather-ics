// 和风天气 API 适配器
import type { WeatherDay } from './weatherTypes'

const HEFENG_API_KEY = process.env.HEFENG_API_KEY || ''
const BASE_URL = 'https://devapi.qweather.com/v7/weather/7d'

export async function getWeather7d({ locationId, lat, lon }: { locationId?: string, lat?: string, lon?: string }): Promise<WeatherDay[]> {
  let url = ''
  if (locationId) {
    url = `${BASE_URL}?location=${locationId}&key=${HEFENG_API_KEY}&lang=zh-hans`
  } else if (lat && lon) {
    url = `${BASE_URL}?location=${lon},${lat}&key=${HEFENG_API_KEY}&lang=zh-hans`
  } else {
    throw new Error('Missing locationId or lat/lon')
  }
  
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000) // 15秒超时
    
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'weather-ics/1.0'
      }
    })
    
    clearTimeout(timeoutId)
    
    if (!res.ok) {
      throw new Error(`和风天气API错误: ${res.status} ${res.statusText}`)
    }
    
    const data = await res.json()
    
    if (data.code !== '200') {
      throw new Error(`和风天气API返回错误: ${data.code} - ${data.msg || '未知错误'}`)
    }
    
    // 适配为通用格式
    return (data.daily || []).map((d: any) => ({
      date: d.fxDate,
      text: d.textDay,
      tempMin: d.tempMin,
      tempMax: d.tempMax,
      icon: d.iconDay,
      wind: d.windDirDay,
      code: d.iconDay,
      sunrise: d.sunrise || undefined, // 日出时间
      sunset: d.sunset || undefined,  // 日落时间
    }))
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('和风天气API请求超时')
    }
    if (error.message.includes('ECONNRESET') || error.message.includes('fetch')) {
      throw new Error('网络连接失败，请稍后重试')
    }
    throw error
  }
}


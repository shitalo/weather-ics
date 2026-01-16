// 和风天气 API 适配器
import type { WeatherDay } from './weatherTypes'

const HEFENG_API_KEY = process.env.HEFENG_API_KEY || ''
const BASE_URL = 'https://devapi.qweather.com/v7/weather/7d'
const HISTORICAL_BASE_URL = 'https://devapi.qweather.com/v7/historical/weather'
const GEO_API_URL = 'https://geoapi.qweather.com/v2/city/lookup'

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

/**
 * 通过经纬度获取LocationID
 */
async function getLocationIdByLatLon(lat: string, lon: string): Promise<string> {
  const url = `${GEO_API_URL}?location=${lon},${lat}&key=${HEFENG_API_KEY}&number=1`
  
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒超时
    
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'weather-ics/1.0'
      }
    })
    
    clearTimeout(timeoutId)
    
    if (!res.ok) {
      throw new Error(`和风天气GeoAPI错误: ${res.status} ${res.statusText}`)
    }
    
    const data = await res.json()
    
    if (data.code !== '200' || !data.location || !data.location.length) {
      throw new Error('无法获取LocationID')
    }
    
    return data.location[0].id
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('和风天气GeoAPI请求超时')
    }
    throw error
  }
}

/**
 * 获取单日历史天气数据
 */
async function getHistoricalWeather(locationId: string, date: string): Promise<WeatherDay | null> {
  // date格式：yyyyMMdd
  const url = `${HISTORICAL_BASE_URL}?location=${locationId}&date=${date}&key=${HEFENG_API_KEY}&lang=zh-hans`
  
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
      throw new Error(`和风天气历史API错误: ${res.status} ${res.statusText}`)
    }
    
    const data = await res.json()
    
    if (data.code !== '200') {
      // 如果返回错误，返回null而不是抛出异常（某些日期可能没有数据）
      return null
    }
    
    // 适配为通用格式
    if (data.weatherDaily) {
      // 从weatherHourly中获取代表性的天气描述（使用中午12点的数据，如果没有则用第一个）
      let text = '未知'
      let icon = ''
      let wind = ''
      
      if (data.weatherHourly && Array.isArray(data.weatherHourly) && data.weatherHourly.length > 0) {
        // 优先使用中午12点的数据（索引12，如果存在）
        const noonIndex = Math.min(12, data.weatherHourly.length - 1)
        const noonData = data.weatherHourly[noonIndex]
        if (noonData) {
          text = noonData.text || '未知'
          icon = noonData.icon || ''
          wind = noonData.windDir || ''
        } else {
          // 如果没有中午数据，使用第一个小时的数据
          const firstData = data.weatherHourly[0]
          if (firstData) {
            text = firstData.text || '未知'
            icon = firstData.icon || ''
            wind = firstData.windDir || ''
          }
        }
      }
      
      return {
        date: data.weatherDaily.date,
        text: text,
        tempMin: data.weatherDaily.tempMin || '',
        tempMax: data.weatherDaily.tempMax || '',
        icon: icon,
        wind: wind,
        code: icon,
      }
    }
    
    return null
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('和风天气历史API请求超时')
    }
    // 历史数据获取失败时返回null，不中断流程
    console.warn(`获取历史天气数据失败 (${date}):`, error.message)
    return null
  }
}

/**
 * 获取最近10天的历史天气数据（不包含今天）
 */
export async function getHistoricalWeather10d({ locationId, lat, lon }: { locationId?: string, lat?: string, lon?: string }): Promise<WeatherDay[]> {
  // 历史API需要LocationID
  let finalLocationId = locationId
  
  // 如果没有LocationID，通过经纬度获取
  if (!finalLocationId && lat && lon) {
    try {
      finalLocationId = await getLocationIdByLatLon(lat, lon)
    } catch (error: any) {
      console.warn('无法获取LocationID，跳过历史数据:', error.message)
      return []
    }
  }
  
  if (!finalLocationId) {
    return []
  }
  
  // 获取最近10天的日期（不包含今天），使用上海时区
  const now = new Date()
  const dates: string[] = []
  
  for (let i = 1; i <= 10; i++) {
    // 计算目标日期（i天前）
    const targetDate = new Date(now)
    targetDate.setDate(targetDate.getDate() - i)
    
    // 使用上海时区格式化日期为 yyyyMMdd 格式
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    const dateStr = formatter.format(targetDate).replace(/-/g, '')
    
    dates.push(dateStr)
  }
  
  // 并发获取历史数据（限制并发数避免API限制）
  const results: WeatherDay[] = []
  const batchSize = 3 // 每批3个请求
  
  for (let i = 0; i < dates.length; i += batchSize) {
    const batch = dates.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(date => getHistoricalWeather(finalLocationId!, date))
    )
    
    // 过滤掉null值并添加到结果中
    batchResults.forEach(result => {
      if (result) {
        results.push(result)
      }
    })
    
    // 批次之间稍作延迟，避免API限流
    if (i + batchSize < dates.length) {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }
  
  // 按日期排序（从旧到新）
  return results.sort((a, b) => a.date.localeCompare(b.date))
} 
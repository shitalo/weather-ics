import { getWeather7d } from '../services/weatherHeFeng'
import type { WeatherDay } from '../services/weatherTypes'

function weatherToEmoji(text: string) {
  if (text.includes('晴')) return '☀️'
  if (text.includes('雨')) return '🌧️'
  if (text.includes('雪')) return '❄️'
  if (text.includes('阴')) return '🌥️'
  if (text.includes('云')) return '☁️'
  if (text.includes('雷')) return '⛈️'
  if (text.includes('雾')) return '🌫️'
  return '🌡️'
}

function generateICS(days: WeatherDay[], city: string) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//weather-ics//CN',
    ...days.map(day => `BEGIN:VEVENT\nSUMMARY:${weatherToEmoji(day.text)}${day.text} ${day.tempMin}~${day.tempMax}℃\nDTSTART;VALUE=DATE:${day.date.replace(/-/g, '')}\nDTEND;VALUE=DATE:${day.date.replace(/-/g, '')}\nDESCRIPTION:${city}天气 ${day.text} ${day.tempMin}~${day.tempMax}℃\nEND:VEVENT`),
    'END:VCALENDAR',
  ]
  return lines.join('\n')
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  let locationId = query.locationId as string | undefined
  let lat = query.lat as string | undefined
  let lon = query.lon as string | undefined
  const city = (query.city as string) || ''

  // 如果没有参数，自动通过IP获取经纬度
  if (!locationId && (!lat || !lon)) {
    // 获取客户端IP
    let xff = event.node.req.headers['x-forwarded-for']
    let ip = Array.isArray(xff) ? xff[0] : (xff ? xff.split(',')[0] : '')
    if (!ip) ip = event.node.req.socket.remoteAddress || ''
    
    // ip-api.com 只支持公网IP，若本地开发可省略 query
    if (ip && ip !== '::1' && ip !== '127.0.0.1') {
      let ipApiUrl = `http://ip-api.com/json/${ip}?lang=zh-CN`
      
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000) // 5秒超时
        
        const res = await fetch(ipApiUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'weather-ics/1.0'
          }
        })
        
        clearTimeout(timeoutId)
        
        if (res.ok) {
          const data = await res.json()
          if (data.status === 'success' && data.lat && data.lon) {
            lat = String(data.lat)
            lon = String(data.lon)
          }
        }
      } catch (e) {
        // 忽略IP定位错误，继续走后续逻辑
        console.warn('IP定位失败:', e)
      }
    }
  }

  if (!locationId && (!lat || !lon)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing locationId or lat/lon'
    })
  }
  
  try {
    const days = await getWeather7d({ locationId, lat, lon })
    const ics = generateICS(days, city)
    setHeader(event, 'Content-Type', 'text/calendar; charset=utf-8')
    return ics
  } catch (error: any) {
    console.error('ICS生成错误:', error)
    throw createError({
      statusCode: 500,
      statusMessage: error.message || '天气数据获取失败'
    })
  }
}) 
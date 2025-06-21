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

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

function generateICS(days: WeatherDay[], city: string) {
  // 使用中国时区获取当前时间
  const now = new Date()
  const chinaTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Shanghai"}))
  const nowStr = chinaTime.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const todayStr = chinaTime.toISOString().split('T')[0].replace(/-/g, '')
  
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'METHOD:PUBLISH',
    'CLASS:PUBLIC',
    'X-WR-CALDESC:7天天气预报',
    'X-WR-CALNAME:天气预报',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Shanghai',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0800',
    'TZOFFSETTO:+0800',
    'END:STANDARD',
    'END:VTIMEZONE',
    ...days.map((day, index) => {
      const eventDate = day.date.replace(/-/g, '')
      const uid = generateUUID()
      const summary = `${weatherToEmoji(day.text)} ${day.text} ${day.tempMin}°/${day.tempMax}°`
      
      // 构建详细描述，使用中国时区的时间
      const description = [
        `⌚ 更新 ${chinaTime.toISOString().split('T')[0]} ${chinaTime.getHours().toString().padStart(2, '0')}:${chinaTime.getMinutes().toString().padStart(2, '0')}`,
        `${weatherToEmoji(day.text)} ${day.text}`,
        `🌡️ 温度 ${day.tempMin}°C ~ ${day.tempMax}°C`,
        `📍 地区 ${city}`
      ].join('\\n\\n')
      
      return [
        'BEGIN:VEVENT',
        `SUMMARY:${summary}`,
        `DTSTART;VALUE=DATE:${eventDate}`,
        `DTEND;VALUE=DATE:${eventDate}`,
        `DTSTAMP;VALUE=DATE:${todayStr}`,
        `UID:${uid}`,
        `DESCRIPTION:${description}`,
        `LOCATION:${city}`,
        'END:VEVENT'
      ].join('\n')
    }),
    'END:VCALENDAR',
  ]
  return lines.join('\n')
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  let locationId = query.locationId as string | undefined
  let lat = query.lat as string | undefined
  let lon = query.lon as string | undefined
  let city = (query.city as string) || ''

  // 如果没有参数，自动通过IP获取经纬度和城市信息
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
            
            // 如果没有提供city参数，使用IP定位获取的城市信息
            if (!city && data.city && data.regionName) {
              city = `${data.city}, ${data.regionName}`
            } else if (!city && data.city) {
              city = data.city
            } else if (!city && data.regionName) {
              city = data.regionName
            }
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
  
  // 如果仍然没有城市信息，使用默认值
  if (!city) {
    city = '未知地区'
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
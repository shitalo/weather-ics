import { getWeather7d, getHistoricalWeather10d } from '../services/weatherHeFeng'
import type { WeatherDay } from '../services/weatherTypes'

function weatherToEmoji(text: string) {
  if (text.includes('晴')) return '☀️'
  if (text.includes('雨')) return '🌧️'
  if (text.includes('雪')) return '❄️'
  if (text.includes('阴')) return '☁️'   // 阴天：阴云密布
  if (text.includes('云')) return '🌥️'   // 多云：云遮太阳
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
  
  // 使用 en-US 获取上海时区的日期和时间
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
  
  // 使用 formatToParts 获取日期各部分
  const dateParts = dateFormatter.formatToParts(now)
  const year = dateParts.find(p => p.type === 'year')?.value || ''
  const month = dateParts.find(p => p.type === 'month')?.value || ''
  const day = dateParts.find(p => p.type === 'day')?.value || ''
  const hour = dateParts.find(p => p.type === 'hour')?.value || ''
  const minute = dateParts.find(p => p.type === 'minute')?.value || ''
  
  const todayStr = `${year}${month}${day}` // yyyyMMdd
  const dateStr = `${year}-${month}-${day}` // yyyy-MM-dd
  const timeForDesc = `${hour}:${minute}` // HH:mm 格式，用于描述
  const timeForNowStr = `${hour}${minute}` // HHmm 格式
  const nowStr = `${todayStr}T${timeForNowStr}00+08:00`.replace(/[:\-]/g, '') // yyyyMMddTHHmmss+0800
  
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'METHOD:PUBLISH',
    'CLASS:PUBLIC',
    'X-WR-CALDESC:天气晴朗日历',
    'X-WR-CALNAME:天气晴朗日历',
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
      const descriptionParts = [
        `🔄 更新 ${dateStr} ${timeForDesc}`,
        `${weatherToEmoji(day.text)} ${day.text}`,
        `🌡️ 温度 ${day.tempMin}°C ~ ${day.tempMax}°C`
      ]
      
      // 添加日出日落时间（如果有）
      if (day.sunrise || day.sunset) {
        const timeInfo = []
        if (day.sunrise) {
          timeInfo.push(`🌅 日出 ${day.sunrise}`)
        }
        if (day.sunset) {
          timeInfo.push(`🌇 日落 ${day.sunset}`)
        }
        if (timeInfo.length > 0) {
          descriptionParts.push(timeInfo.join(' | '))
        }
      }
      
      descriptionParts.push(`📍 地区 ${city}`)
      
      const description = descriptionParts.join('\\n\\n')
      
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
    // 并行获取未来7天预报和历史10天数据
    const [futureDays, historicalDays] = await Promise.all([
      getWeather7d({ locationId, lat, lon }),
      getHistoricalWeather10d({ locationId, lat, lon }).catch(err => {
        // 历史数据获取失败不影响主流程
        console.warn('获取历史天气数据失败，仅使用未来预报:', err.message)
        return []
      })
    ])
    
    // 合并历史数据和未来数据，优先保留未来预报数据
    const dayMap = new Map<string, WeatherDay>()
    
    // 先添加未来预报数据（优先级高）
    futureDays.forEach(day => {
      dayMap.set(day.date, day)
    })
    
    // 再添加历史数据（只添加不重复的日期）
    historicalDays.forEach(day => {
      if (!dayMap.has(day.date)) {
        dayMap.set(day.date, day)
      }
    })
    
    // 转换为数组并按日期排序
    const sortedDays = Array.from(dayMap.values()).sort((a, b) => 
      a.date.localeCompare(b.date)
    )
    
    const ics = generateICS(sortedDays, city)
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
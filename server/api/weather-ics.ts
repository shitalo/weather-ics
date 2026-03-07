import { getWeather7d } from '../services/weatherHeFeng'
import type { WeatherDay } from '../services/weatherTypes'
import { saveWeatherData, getCachedWeatherData, getCachedWeatherDataFromToday } from '../services/database'

// 时区常量：统一使用中国时区
const TIMEZONE = 'Asia/Shanghai'

/**
 * 获取中国时区的当前时间
 */
function getChinaTime(): Date {
  const now = new Date()
  // 获取中国时区的ISO字符串，然后转换回Date对象
  // 这样可以确保时间是基于中国时区的
  const chinaTimeStr = now.toLocaleString('en-US', { timeZone: TIMEZONE })
  // 注意：toLocaleString返回的是本地格式的字符串，我们需要使用另一种方法
  // 实际上，Date对象本身是UTC时间，我们只需要在显示时使用正确的时区
  // 但为了确保一致性，我们创建一个基于中国时区当前时间的Date对象
  return now
}

/**
 * 将Date对象格式化为中国时区的日期时间字符串
 * @param date Date对象
 * @param includeTime 是否包含时间部分
 * @returns 格式化的字符串，日期格式：YYYY-MM-DD，时间格式：HH:mm
 */
function formatChinaDateTime(date: Date, includeTime: boolean = true): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime ? {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    } : {})
  })
  const parts = formatter.formatToParts(date)
  const year = parts.find(p => p.type === 'year')?.value || ''
  const month = parts.find(p => p.type === 'month')?.value || ''
  const day = parts.find(p => p.type === 'day')?.value || ''
  const dateStr = `${year}-${month}-${day}`
  
  if (includeTime) {
    const hour = parts.find(p => p.type === 'hour')?.value || ''
    const minute = parts.find(p => p.type === 'minute')?.value || ''
    return `${dateStr} ${hour}:${minute}`
  }
  return dateStr
}

/**
 * 将Date对象格式化为中国时区的日期字符串 (YYYY-MM-DD)
 */
function formatChinaDate(date: Date): string {
  return formatChinaDateTime(date, false)
}

/**
 * 将MySQL返回的TIMESTAMP转换为中国时区的Date对象
 * MySQL的TIMESTAMP在存储和读取时会根据服务器时区转换
 * 我们需要确保读取的时间被正确解释为中国时区
 */
function parseMySQLTimestamp(mysqlTimestamp: Date | string | null | undefined): Date | undefined {
  if (!mysqlTimestamp) {
    return undefined
  }
  
  // 如果已经是Date对象，直接返回
  if (mysqlTimestamp instanceof Date) {
    // MySQL返回的Date对象可能是UTC时间，我们需要确保它被正确解释
    // 由于Date对象内部存储的是UTC时间戳，我们只需要确保在显示时使用正确的时区
    return mysqlTimestamp
  }
  
  // 如果是字符串，转换为Date对象
  return new Date(mysqlTimestamp)
}

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
  // 使用中国时区获取当前时间（用于DTSTAMP等）
  const now = getChinaTime()
  
  // 格式化日期用于ICS文件
  const todayDateStr = formatChinaDate(now)
  const todayStr = todayDateStr.replace(/-/g, '') // yyyyMMdd
  
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
      
      // 格式化更新时间（使用中国时区）
      let updateTimeStr = ''
      if (day.updatedAt) {
        // 使用数据的实际更新时间，格式化为中国时区
        const updateDate = parseMySQLTimestamp(day.updatedAt) || day.updatedAt
        const updateDateTimeStr = formatChinaDateTime(updateDate)
        const [updateDateStr, updateTimeForDesc] = updateDateTimeStr.split(' ')
        updateTimeStr = `🔄 更新 ${updateDateStr} ${updateTimeForDesc || ''}`
        // 如果数据来自缓存，添加缓存标识
        if (day.fromCache) {
          updateTimeStr += ' [缓存]'
        }
      } else {
        // 如果没有更新时间，使用当前时间（向后兼容）
        const nowStr = formatChinaDateTime(now)
        const parts = nowStr.split(' ')
        const dateStr = parts[0] || todayDateStr
        const timeForDesc = parts[1] || ''
        updateTimeStr = `🔄 更新 ${dateStr} ${timeForDesc}`
      }
      
      // 构建详细描述
      const descriptionParts = [
        updateTimeStr,
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
  const config = useRuntimeConfig()
  const enableIpLocationFallback = config.enableIpLocationFallback ?? false
  let locationId = query.locationId as string | undefined
  let lat = query.lat as string | undefined
  let lon = query.lon as string | undefined
  let city = (query.city as string) || ''

  // 如果启用了 IP 定位兜底且没有传入位置参数，则自动通过 IP 获取经纬度和城市信息
  if (enableIpLocationFallback && !locationId && (!lat || !lon)) {
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
    const enableDatabaseCache = config.enableDatabaseCache ?? false
    
    console.log(`[天气ICS] 请求开始 - locationId: ${locationId || 'N/A'}, lat: ${lat || 'N/A'}, lon: ${lon || 'N/A'}, city: ${city || 'N/A'}`)
    
    // 确保有经纬度才能使用数据库缓存
    const hasLatLon = lat && lon
    
    // 计算今天的日期（使用中国时区）
    const today = getChinaTime()
    const todayDate = formatChinaDate(today)
    
    console.log(`[天气ICS] 今日日期: ${todayDate}, 数据库缓存: ${enableDatabaseCache ? '启用' : '禁用'}, IP定位兜底: ${enableIpLocationFallback ? '启用' : '禁用'}, 有经纬度: ${hasLatLon}`)
    
    // 使用Map来合并数据，确保每个日期只有一条记录
    const dayMap = new Map<string, WeatherDay>()
    
    let futureDays: WeatherDay[] = []
    let needFetchFromAPI = true
    
    // 如果启用了数据库缓存功能，优先从数据库获取今日及之后的数据
    if (enableDatabaseCache && hasLatLon && config.mysqlHost) {
      try {
        console.log(`[数据库查询] 开始查询今日及之后的数据 - lat: ${lat}, lon: ${lon}, todayDate: ${todayDate}`)
        const { data: cachedDaysFromToday, latestUpdateTime } = await getCachedWeatherDataFromToday(lat!, lon!, todayDate)
        console.log(`[数据库查询] 查询完成 - 返回数据条数: ${cachedDaysFromToday.length}, 更新时间: ${latestUpdateTime?.toISOString() || 'N/A'} (优先使用今天天气的更新时间)`)
        
        if (cachedDaysFromToday.length > 0 && latestUpdateTime) {
          // 检查数据是否过期
          // 确保使用相同的时间基准进行比较
          const now = getChinaTime()
          const cachedTime = parseMySQLTimestamp(latestUpdateTime)
          if (!cachedTime) {
            console.warn(`[缓存检查] 无法解析更新时间，将使用API获取数据`)
            needFetchFromAPI = true
          } else {
            // 从配置中获取缓存过期时间（分钟），默认30分钟
            const cacheExpireMinutes = config.cacheExpireMinutes ?? 30
            const timeDiff = now.getTime() - cachedTime.getTime()
            const expireTimeMs = cacheExpireMinutes * 60 * 1000 // 转换为毫秒数
            const minutesDiff = Math.floor(timeDiff / (60 * 1000))
            
            console.log(`[缓存检查] 数据时间差: ${minutesDiff}分钟, 过期阈值: ${cacheExpireMinutes}分钟, 是否过期: ${timeDiff > expireTimeMs ? '是' : '否'}, 缓存时间: ${formatChinaDateTime(cachedTime)}, 当前时间: ${formatChinaDateTime(now)}`)
            
            if (timeDiff <= expireTimeMs) {
              // 数据有效，使用缓存数据
              const cachedTimeStr = formatChinaDateTime(cachedTime)
              // 统一日期格式显示
              const minDate = cachedDaysFromToday[0]?.date.replace(/-/g, '') || ''
              const maxDate = cachedDaysFromToday[cachedDaysFromToday.length - 1]?.date.replace(/-/g, '') || ''
              console.log(`[缓存命中] 使用数据库缓存数据 - 经纬度: (${lat}, ${lon}), 更新时间: ${cachedTimeStr} (${cachedTime.toISOString()}), 数据条数: ${cachedDaysFromToday.length}, 数据日期范围: ${minDate} ~ ${maxDate}`)
              futureDays = cachedDaysFromToday.map(day => {
                // 标记数据来自缓存，确保updatedAt是Date对象，统一日期格式为 YYYYMMDD
                return {
                  ...day,
                  date: day.date.replace(/-/g, ''), // 统一日期格式
                  fromCache: true,
                  updatedAt: day.updatedAt ? parseMySQLTimestamp(day.updatedAt) : undefined
                } as WeatherDay
              })
              futureDays.forEach(day => {
                // 使用统一的日期格式（YYYYMMDD）作为key
                dayMap.set(day.date, day)
              })
              needFetchFromAPI = false
            } else {
              // 数据过期，需要从API获取
              console.log(`[缓存过期] 数据库缓存数据已过期（${minutesDiff}分钟 > ${cacheExpireMinutes}分钟），将从API获取新数据 - 经纬度: (${lat}, ${lon})`)
            }
          }
        } else {
          // 数据库中没有今日及之后的数据，需要从API获取
          console.log(`[缓存未命中] 数据库中没有今日及之后的数据（数据条数: ${cachedDaysFromToday.length}, 更新时间: ${latestUpdateTime?.toISOString() || 'N/A'}），将从API获取 - 经纬度: (${lat}, ${lon})`)
        }
      } catch (err: any) {
        // 数据库查询失败（连接失败、超时等异常），回退到使用API获取数据
        const errorType = err.code || err.name || 'Unknown'
        const errorMessage = err.message || '未知错误'
        console.error(`[数据库错误] 从数据库获取今日缓存数据失败 - 错误类型: ${errorType}, 错误信息: ${errorMessage}, 将回退到使用和风天气API获取数据`)
        console.error(`[数据库错误] 错误堆栈:`, err.stack)
        // 确保需要从API获取数据
        needFetchFromAPI = true
      }
    }
    
    // 如果需要从API获取数据
    if (needFetchFromAPI) {
      console.log(`[API调用] 开始从和风天气API获取数据 - locationId: ${locationId || 'N/A'}, lat: ${lat || 'N/A'}, lon: ${lon || 'N/A'}`)
      try {
        futureDays = await getWeather7d({ locationId, lat, lon })
        // 统一日期格式显示
        const minDate = futureDays[0]?.date.replace(/-/g, '') || ''
        const maxDate = futureDays[futureDays.length - 1]?.date.replace(/-/g, '') || ''
        console.log(`[API调用] 成功获取数据 - 数据条数: ${futureDays.length}, 数据日期范围: ${minDate} ~ ${maxDate}`)
      } catch (apiErr: any) {
        console.error(`[API错误] 和风天气API调用失败 - 错误信息: ${apiErr.message}`)
        console.error(`[API错误] 错误堆栈:`, apiErr.stack)
        throw apiErr
      }
      
      // 标记数据来自API，并设置更新时间为当前时间（中国时区）
      const now = getChinaTime()
      futureDays.forEach(day => {
        day.fromCache = false
        day.updatedAt = now
        // 统一日期格式为 YYYYMMDD（移除连字符）
        day.date = day.date.replace(/-/g, '')
      })
      console.log(`[API调用] 数据已标记更新时间: ${formatChinaDateTime(now)}`)
      
      // 如果启用了数据库缓存功能，异步保存天气数据到数据库（不阻塞主流程）
      if (enableDatabaseCache && hasLatLon && config.mysqlHost) {
        console.log(`[数据库保存] 开始异步保存天气数据到数据库 - 经纬度: (${lat}, ${lon}), 城市: ${city}, 数据条数: ${futureDays.length}`)
        // 注意：保存到数据库时需要将日期格式转换回 YYYY-MM-DD，但这里先保存原始格式
        // saveWeatherData 函数内部会处理日期格式转换
        saveWeatherData(lat!, lon!, city, futureDays).then(() => {
          console.log(`[数据库保存] 成功保存天气数据到数据库 - 经纬度: (${lat}, ${lon}), 数据条数: ${futureDays.length}`)
        }).catch(err => {
          console.error(`[数据库保存] 保存天气数据到数据库失败 - 错误信息: ${err.message}`)
          console.error(`[数据库保存] 错误堆栈:`, err.stack)
        })
      }
      
      // 添加从API获取的未来预报数据
      futureDays.forEach(day => {
        // 使用统一的日期格式（YYYYMMDD）作为key
        dayMap.set(day.date, day)
      })
    }
    
    // 如果启用了数据库缓存功能，从数据库获取该经纬度的历史缓存数据（今天之前的数据）
    if (enableDatabaseCache && hasLatLon && config.mysqlHost) {
      try {
        // 计算历史数据的起始日期（今天减去最大天数）
        // 使用 today（已通过 getChinaTime() 获取，确保时区一致）
        const maxHistoryDays = config.maxHistoryDays || 31
        const startDateObj = new Date(today.getTime())
        startDateObj.setDate(startDateObj.getDate() - maxHistoryDays)
        const startDate = formatChinaDate(startDateObj)
        
        console.log(`[历史数据查询] 开始查询历史缓存数据 - lat: ${lat}, lon: ${lon}, 起始日期: ${startDate}, 截止日期: ${todayDate}, 最大天数: ${maxHistoryDays}`)
        // 获取指定日期范围内的历史数据（使用 < 而不是 <=，排除今天）
        const cachedDays = await getCachedWeatherData(lat!, lon!, startDate, todayDate)
        
        console.log(`[历史数据查询] 查询完成 - 返回数据条数: ${cachedDays.length}, 经纬度: (${lat}, ${lon}), 截止日期: ${todayDate}`)
        if (cachedDays.length > 0) {
          // 确保日期格式统一为 YYYYMMDD，并正确显示范围
          const dates = cachedDays.map(d => d.date).filter(Boolean)
          if (dates.length > 0) {
            // 按日期排序（确保格式统一）
            const sortedDates = dates.sort((a, b) => {
              // 统一格式为 YYYYMMDD 进行比较
              const dateA = a.replace(/-/g, '')
              const dateB = b.replace(/-/g, '')
              return dateA.localeCompare(dateB)
            })
            const minDate = sortedDates[0]
            const maxDate = sortedDates[sortedDates.length - 1]
            console.log(`[历史数据查询] 数据日期范围: ${minDate} ~ ${maxDate} (共${dates.length}条)`)
            // 显示所有查询到的日期，便于诊断
            console.log(`[历史数据查询] 查询到的所有日期: ${sortedDates.join(', ')}`)
          }
        } else {
          // 如果没有查询到历史数据，记录警告
          console.log(`[历史数据查询] 未查询到历史数据 - 查询条件: startDate=${startDate}, endDate=${todayDate}`)
        }
        
        // 使用数据库缓存的历史数据，标记为来自缓存，确保updatedAt是Date对象
        let addedCount = 0
        let skippedCount = 0
        // 计算昨天的日期，用于检查是否包含昨天的数据
        const yesterdayObj = new Date(today.getTime())
        yesterdayObj.setDate(yesterdayObj.getDate() - 1)
        const yesterdayDate = formatChinaDate(yesterdayObj)
        const yesterdayDateStr = yesterdayDate.replace(/-/g, '')
        let hasYesterday = false
        
        cachedDays.forEach(day => {
          // 统一日期格式进行比较
          const dayDateStr = day.date.replace(/-/g, '')
          if (dayDateStr === yesterdayDateStr) {
            hasYesterday = true
          }
          
          // 使用统一的日期格式作为key
          if (!dayMap.has(dayDateStr)) {
            const dayWithCache: WeatherDay = {
              ...day,
              date: dayDateStr, // 确保日期格式统一为 YYYYMMDD
              fromCache: true,
              updatedAt: day.updatedAt ? parseMySQLTimestamp(day.updatedAt) : undefined
            }
            dayMap.set(dayDateStr, dayWithCache)
            addedCount++
          } else {
            skippedCount++
          }
        })
        
        if (!hasYesterday && cachedDays.length > 0) {
          console.log(`[历史数据合并] 警告: 查询到的历史数据中不包含昨天的数据 (${yesterdayDateStr})，可能数据库中确实没有昨天的数据`)
        }
        
        console.log(`[历史数据合并] 合并完成 - 新增: ${addedCount}条, 跳过(已存在): ${skippedCount}条`)
      } catch (err: any) {
        // 历史数据获取失败不影响主流程，只记录警告（主数据已从API获取）
        const errorType = err.code || err.name || 'Unknown'
        const errorMessage = err.message || '未知错误'
        console.error(`[历史数据错误] 从数据库获取历史缓存数据失败 - 错误类型: ${errorType}, 错误信息: ${errorMessage}, 将跳过历史数据`)
        console.error(`[历史数据错误] 错误堆栈:`, err.stack)
        // 历史数据获取失败不影响主流程，继续执行
      }
    }
    
    // 转换为数组并按日期排序
    // 确保日期格式统一为 YYYYMMDD 格式进行比较
    const sortedDays = Array.from(dayMap.values()).sort((a, b) => {
      // 统一格式为 YYYYMMDD 进行比较
      const dateA = a.date.replace(/-/g, '')
      const dateB = b.date.replace(/-/g, '')
      return dateA.localeCompare(dateB)
    })
    
    // 统计数据来源
    const cacheCount = sortedDays.filter(d => d.fromCache).length
    const apiCount = sortedDays.filter(d => !d.fromCache).length
    
    console.log(`[数据汇总] 最终数据统计 - 总条数: ${sortedDays.length}, 来自缓存: ${cacheCount}条, 来自API: ${apiCount}条`)
    if (sortedDays.length > 0) {
      // 统一日期格式显示（YYYYMMDD）
      const minDate = sortedDays[0]?.date.replace(/-/g, '') || ''
      const maxDate = sortedDays[sortedDays.length - 1]?.date.replace(/-/g, '') || ''
      console.log(`[数据汇总] 数据日期范围: ${minDate} ~ ${maxDate}`)
    }
    
    console.log(`[ICS生成] 开始生成ICS文件 - 城市: ${city}, 数据条数: ${sortedDays.length}`)
    const ics = generateICS(sortedDays, city)
    console.log(`[ICS生成] ICS文件生成完成 - 文件大小: ${ics.length} 字符`)
    setHeader(event, 'Content-Type', 'text/calendar; charset=utf-8')
    return ics
  } catch (error: any) {
    console.error(`[错误] ICS生成失败 - 错误信息: ${error.message}`)
    console.error(`[错误] 错误堆栈:`, error.stack)
    console.error(`[错误] 请求参数 - locationId: ${locationId || 'N/A'}, lat: ${lat || 'N/A'}, lon: ${lon || 'N/A'}, city: ${city || 'N/A'}`)
    throw createError({
      statusCode: 500,
      statusMessage: error.message || '天气数据获取失败'
    })
  }
}) 

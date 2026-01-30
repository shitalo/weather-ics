import mysql from 'mysql2/promise'

// 数据库连接池
let pool: mysql.Pool | null = null

// 时区常量：统一使用中国时区
const DB_TIMEZONE = '+08:00' // 中国时区 UTC+8
const TIMEZONE = 'Asia/Shanghai' // 中国时区

/**
 * 将Date对象格式化为中国时区的日期字符串 (YYYYMMDD)
 * 用于处理MySQL返回的Date对象，确保时区正确
 */
function formatDateInChinaTimezone(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  const parts = formatter.formatToParts(date)
  const year = parts.find(p => p.type === 'year')?.value || ''
  const month = parts.find(p => p.type === 'month')?.value || ''
  const day = parts.find(p => p.type === 'day')?.value || ''
  return `${year}${month}${day}`
}

// 初始化数据库连接池
export function initDatabase(config?: any) {
  const runtimeConfig = config || useRuntimeConfig()
  
  const dbConfig: mysql.PoolOptions = {
    host: runtimeConfig.mysqlHost || 'localhost',
    port: runtimeConfig.mysqlPort || 3306,
    user: runtimeConfig.mysqlUser || 'root',
    password: runtimeConfig.mysqlPassword || '',
    database: runtimeConfig.mysqlDatabase || 'weather_ics',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    // 在连接池配置中直接指定时区，所有连接都会使用此时区
    timezone: DB_TIMEZONE, // '+08:00' 中国时区
  }

  try {
    pool = mysql.createPool(dbConfig)
    console.log(`[数据库连接] MySQL连接池初始化成功，时区设置: ${DB_TIMEZONE} (Asia/Shanghai)`)
    
    // 在连接池初始化后，设置一个测试连接的时区，确保时区设置可用
    // 注意：由于连接池的特性，我们需要在使用连接时设置时区
    // 这里只是验证连接池可用
    return pool
  } catch (error) {
    console.error('[数据库连接] MySQL连接池初始化失败:', error)
    throw error
  }
}

// 注意：时区已在连接池配置中设置，无需在每个连接上单独设置
// 保留此函数仅作为备用（如果需要动态设置时区）
async function ensureTimezone(connection: mysql.PoolConnection): Promise<void> {
  // 由于时区已在连接池配置中设置，此函数现在不需要执行任何操作
  // 但保留函数签名以保持代码兼容性
}

// 获取数据库连接池
export function getPool(): mysql.Pool | null {
  if (!pool) {
    try {
      initDatabase()
    } catch (error) {
      console.error('无法初始化数据库连接池:', error)
      return null
    }
  }
  return pool
}

// 初始化数据库表结构
export async function initTables() {
  const pool = getPool()
  if (!pool) {
    throw new Error('数据库连接池未初始化')
  }

  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS weather_cache (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      lat DECIMAL(10, 7) NOT NULL COMMENT '纬度',
      lon DECIMAL(10, 7) NOT NULL COMMENT '经度',
      city VARCHAR(255) DEFAULT '' COMMENT '城市名称',
      date DATE NOT NULL COMMENT '日期',
      text VARCHAR(100) DEFAULT '' COMMENT '天气描述',
      temp_min VARCHAR(20) DEFAULT '' COMMENT '最低温度',
      temp_max VARCHAR(20) DEFAULT '' COMMENT '最高温度',
      wind VARCHAR(50) DEFAULT '' COMMENT '风向',
      sunrise VARCHAR(20) DEFAULT '' COMMENT '日出时间',
      sunset VARCHAR(20) DEFAULT '' COMMENT '日落时间',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      UNIQUE KEY uk_lat_lon_date (lat, lon, date),
      INDEX idx_lat_lon (lat, lon),
      INDEX idx_date (date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='天气数据缓存表';
  `

  try {
    // 时区已在连接池配置中设置，直接执行SQL
    await pool.execute(createTableSQL)
    console.log('[数据库初始化] 数据库表初始化成功')
  } catch (error) {
    console.error('[数据库初始化] 数据库表初始化失败:', error)
    throw error
  }
}

// 保存天气数据到数据库
export async function saveWeatherData(
  lat: string,
  lon: string,
  city: string,
  weatherDays: Array<{
    date: string
    text: string
    tempMin: string
    tempMax: string
    icon?: string
    wind?: string
    code?: string
    sunrise?: string
    sunset?: string
  }>
): Promise<void> {
  const pool = getPool()
  if (!pool) {
    console.warn('数据库连接池未初始化，跳过保存天气数据')
    return
  }

  const latNum = parseFloat(lat)
  const lonNum = parseFloat(lon)

  if (isNaN(latNum) || isNaN(lonNum)) {
    console.warn('无效的经纬度，跳过保存:', { lat, lon })
    return
  }

  try {
    console.log(`[数据库保存] 开始保存天气数据 - lat: ${latNum}, lon: ${lonNum}, city: ${city}, 数据条数: ${weatherDays.length}`)
    // 使用事务批量插入或更新
    // 时区已在连接池配置中设置，无需单独设置
    const connection = await pool.getConnection()
    
    try {
      await connection.beginTransaction()

      for (const day of weatherDays) {
        // 将日期格式从 yyyyMMdd 转换为 yyyy-MM-dd
        const dateStr = day.date.length === 8 
          ? `${day.date.substring(0, 4)}-${day.date.substring(4, 6)}-${day.date.substring(6, 8)}`
          : day.date

        // 使用NOW()函数获取当前时间，MySQL会根据服务器时区处理
        // 为了确保时区一致性，我们也可以显式设置会话时区，但为了兼容性，这里使用CURRENT_TIMESTAMP
        // MySQL的TIMESTAMP会根据服务器时区自动转换，我们需要确保服务器时区设置正确
        const insertSQL = `
          INSERT INTO weather_cache 
            (lat, lon, city, date, text, temp_min, temp_max, wind, sunrise, sunset)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            city = VALUES(city),
            text = VALUES(text),
            temp_min = VALUES(temp_min),
            temp_max = VALUES(temp_max),
            wind = VALUES(wind),
            sunrise = VALUES(sunrise),
            sunset = VALUES(sunset),
            updated_at = CURRENT_TIMESTAMP
        `

        await connection.execute(insertSQL, [
          latNum,
          lonNum,
          city || '',
          dateStr,
          day.text || '',
          day.tempMin || '',
          day.tempMax || '',
          day.wind || '',
          day.sunrise || '',
          day.sunset || ''
        ])
      }

      await connection.commit()
      console.log(`[数据库保存] 成功保存 ${weatherDays.length} 条天气数据到数据库 - lat: ${latNum}, lon: ${lonNum}, city: ${city}`)
    } catch (error) {
      await connection.rollback()
      console.error(`[数据库保存] 事务回滚 - lat: ${latNum}, lon: ${lonNum}, 错误信息: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    } finally {
      connection.release()
    }
  } catch (error: any) {
    console.error(`[数据库保存] 保存天气数据到数据库失败 - lat: ${latNum}, lon: ${lonNum}, city: ${city}, 错误信息: ${error.message}`)
    console.error(`[数据库保存] 错误堆栈:`, error.stack)
    // 不抛出错误，避免影响主流程
  }
}

// 从数据库获取历史天气数据
export async function getCachedWeatherData(
  lat: string,
  lon: string,
  startDate?: string,
  endDate?: string
): Promise<Array<{
  date: string
  text: string
  tempMin: string
  tempMax: string
  icon?: string
  wind?: string
  code?: string
  sunrise?: string
  sunset?: string
  updatedAt?: Date
}>> {
  const pool = getPool()
  if (!pool) {
    return []
  }

  const latNum = parseFloat(lat)
  const lonNum = parseFloat(lon)

  if (isNaN(latNum) || isNaN(lonNum)) {
    return []
  }

  try {
    // 处理同一经纬度、同一天存在多条数据的情况
    // 选择每个日期的最新记录（按 updated_at 降序，如果相同则按 id 降序）
    // 使用LEFT JOIN方式，兼容MySQL 5.6+，性能优于相关子查询
    let sql = `
      SELECT w1.date, w1.text, w1.temp_min, w1.temp_max, w1.wind, w1.sunrise, w1.sunset, w1.updated_at
      FROM weather_cache w1
      LEFT JOIN weather_cache w2 
        ON w1.lat = w2.lat 
        AND w1.lon = w2.lon 
        AND w1.date = w2.date
        AND (
          w2.updated_at > w1.updated_at 
          OR (w2.updated_at = w1.updated_at AND w2.id > w1.id)
        )
      WHERE w1.lat = ? AND w1.lon = ?
        AND w2.id IS NULL
    `
    const params: any[] = [latNum, lonNum]

    if (startDate) {
      sql += ' AND w1.date >= ?'
      params.push(startDate)
    }

    if (endDate) {
      // 使用 < 而不是 <=，确保不包含结束日期当天的数据
      sql += ' AND w1.date < ?'
      params.push(endDate)
    }

    sql += ' ORDER BY w1.date ASC'

    console.log(`[数据库查询] 执行SQL查询历史数据 - lat: ${latNum}, lon: ${lonNum}, startDate: ${startDate || 'N/A'}, endDate: ${endDate || 'N/A'}`)
    // 时区已在连接池配置中设置，直接执行查询
    const [rows] = await pool.execute(sql, params) as any[]
    console.log(`[数据库查询] SQL查询完成 - 返回行数: ${Array.isArray(rows) ? rows.length : 0}`)

    const result = rows.map((row: any) => {
      // 处理日期格式：MySQL的DATE类型可能返回Date对象或字符串
      let dateStr = ''
      if (row.date instanceof Date) {
        // 使用中国时区格式化Date对象，避免时区转换问题
        // 不使用 getFullYear/getMonth/getDate，因为它们会使用Date对象的本地时区
        dateStr = formatDateInChinaTimezone(row.date)
      } else if (typeof row.date === 'string') {
        // 如果已经是字符串，可能是 'YYYY-MM-DD' 格式
        dateStr = row.date.replace(/-/g, '')
      } else {
        // 其他情况，尝试转换为字符串并处理
        const dateStrRaw = String(row.date)
        // 如果是 'YYYY-MM-DD' 格式，移除连字符
        if (dateStrRaw.includes('-')) {
          dateStr = dateStrRaw.replace(/-/g, '')
        } else {
          dateStr = dateStrRaw
        }
      }
      
      // 处理更新时间
      let updatedAt: Date | undefined = undefined
      if (row.updated_at) {
        updatedAt = row.updated_at instanceof Date 
          ? row.updated_at 
          : new Date(row.updated_at)
      }
      
      return {
        date: dateStr,
        text: row.text || '',
        tempMin: row.temp_min || '',
        tempMax: row.temp_max || '',
        wind: row.wind || undefined,
        sunrise: row.sunrise || undefined,
        sunset: row.sunset || undefined,
        updatedAt: updatedAt
      }
    })
    
    console.log(`[数据库查询] 数据处理完成 - 结果条数: ${result.length}`)
    return result
  } catch (error: any) {
    console.error(`[数据库错误] 从数据库获取天气数据失败 - lat: ${lat}, lon: ${lon}, startDate: ${startDate || 'N/A'}, endDate: ${endDate || 'N/A'}, 错误信息: ${error.message}`)
    console.error(`[数据库错误] 错误堆栈:`, error.stack)
    return []
  }
}

// 从数据库获取今日及之后的天气数据，并返回更新时间信息
export async function getCachedWeatherDataFromToday(
  lat: string,
  lon: string,
  todayDate: string
): Promise<{
  data: Array<{
    date: string
    text: string
    tempMin: string
    tempMax: string
    icon?: string
    wind?: string
    code?: string
    sunrise?: string
    sunset?: string
    updatedAt?: Date
  }>
  latestUpdateTime: Date | null // 返回最新的更新时间
}> {
  const pool = getPool()
  if (!pool) {
    // 连接池未初始化，抛出异常让上层代码回退到API
    console.error(`[数据库] 连接池未初始化 - lat: ${lat}, lon: ${lon}, todayDate: ${todayDate}`)
    throw new Error('数据库连接池未初始化')
  }

  const latNum = parseFloat(lat)
  const lonNum = parseFloat(lon)

  if (isNaN(latNum) || isNaN(lonNum)) {
    // 参数无效，返回空数据（这不是数据库错误）
    console.warn(`[数据库] 参数无效 - lat: ${lat}, lon: ${lon}, todayDate: ${todayDate}`)
    return { data: [], latestUpdateTime: null }
  }

  try {
    console.log(`[数据库查询] 执行SQL查询今日及之后数据 - lat: ${latNum}, lon: ${lonNum}, todayDate: ${todayDate}`)
    // 获取今日及之后的数据，同时获取最新的更新时间
    let sql = `
      SELECT w1.date, w1.text, w1.temp_min, w1.temp_max, w1.wind, w1.sunrise, w1.sunset, w1.updated_at
      FROM weather_cache w1
      LEFT JOIN weather_cache w2 
        ON w1.lat = w2.lat 
        AND w1.lon = w2.lon 
        AND w1.date = w2.date
        AND (
          w2.updated_at > w1.updated_at 
          OR (w2.updated_at = w1.updated_at AND w2.id > w1.id)
        )
      WHERE w1.lat = ? AND w1.lon = ?
        AND w1.date >= ?
        AND w2.id IS NULL
      ORDER BY w1.date ASC
    `
    const params: any[] = [latNum, lonNum, todayDate]

    // 时区已在连接池配置中设置，直接执行查询
    const [rows] = await pool.execute(sql, params) as any[]
    console.log(`[数据库查询] SQL查询完成 - 返回行数: ${Array.isArray(rows) ? rows.length : 0}`)

    // 统一todayDate格式为 YYYYMMDD，用于比较
    const todayDateStr = todayDate.replace(/-/g, '')
    let todayUpdateTime: Date | null = null as Date | null // 今天天气的更新时间（优先使用）
    let latestUpdateTime: Date | null = null as Date | null // 所有数据中的最新更新时间（作为fallback）

    const result = rows.map((row: any) => {
      // 处理日期格式：MySQL的DATE类型可能返回Date对象或字符串
      let dateStr = ''
      if (row.date instanceof Date) {
        // 使用中国时区格式化Date对象，避免时区转换问题
        // 不使用 getFullYear/getMonth/getDate，因为它们会使用Date对象的本地时区
        dateStr = formatDateInChinaTimezone(row.date)
      } else if (typeof row.date === 'string') {
        dateStr = row.date.replace(/-/g, '')
      } else {
        const dateStrRaw = String(row.date)
        if (dateStrRaw.includes('-')) {
          dateStr = dateStrRaw.replace(/-/g, '')
        } else {
          dateStr = dateStrRaw
        }
      }

      // 处理更新时间
      let updatedAt: Date | undefined = undefined
      if (row.updated_at) {
        updatedAt = row.updated_at instanceof Date 
          ? row.updated_at 
          : new Date(row.updated_at)
        
        if (updatedAt instanceof Date) {
          // 优先使用今天天气的更新时间
          if (dateStr === todayDateStr && (!todayUpdateTime || updatedAt > todayUpdateTime)) {
            todayUpdateTime = updatedAt
          }
          // 同时记录所有数据中的最新更新时间（作为fallback）
          if (!latestUpdateTime || updatedAt > latestUpdateTime) {
            latestUpdateTime = updatedAt
          }
        }
      }
      
      return {
        date: dateStr,
        text: row.text || '',
        tempMin: row.temp_min || '',
        tempMax: row.temp_max || '',
        wind: row.wind || undefined,
        sunrise: row.sunrise || undefined,
        sunset: row.sunset || undefined,
        updatedAt: updatedAt
      }
    })
    
    // 优先使用今天天气的更新时间，如果今天没有数据，则使用所有数据中的最新更新时间
    const finalUpdateTime: Date | null = todayUpdateTime ? todayUpdateTime : (latestUpdateTime ? latestUpdateTime : null)
    const finalUpdateTimeStr: string = finalUpdateTime !== null 
      ? finalUpdateTime.toISOString() 
      : 'N/A'
    const updateTimeSource = todayUpdateTime ? '今天天气' : (latestUpdateTime ? '所有数据' : '无')
    console.log(`[数据库查询] 数据处理完成 - 结果条数: ${result.length}, 更新时间: ${finalUpdateTimeStr} (来源: ${updateTimeSource})`)
    return { data: result, latestUpdateTime: finalUpdateTime }
  } catch (error: any) {
    // 数据库连接失败、超时等真正的错误应该抛出异常，让上层代码能够回退到API
    // 而不是静默返回空数据
    console.error(`[数据库错误] 从数据库获取今日天气数据失败 - lat: ${lat}, lon: ${lon}, todayDate: ${todayDate}, 错误信息: ${error.message}`)
    console.error(`[数据库错误] 错误堆栈:`, error.stack)
    throw error // 重新抛出异常，让上层代码能够捕获并回退到API
  }
}


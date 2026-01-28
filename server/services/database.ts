import mysql from 'mysql2/promise'

// 数据库连接池
let pool: mysql.Pool | null = null

// 初始化数据库连接池
export function initDatabase(config?: any) {
  const runtimeConfig = config || useRuntimeConfig()
  
  const dbConfig = {
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
  }

  try {
    pool = mysql.createPool(dbConfig)
    console.log('MySQL连接池初始化成功')
    return pool
  } catch (error) {
    console.error('MySQL连接池初始化失败:', error)
    throw error
  }
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
    await pool.execute(createTableSQL)
    console.log('数据库表初始化成功')
  } catch (error) {
    console.error('数据库表初始化失败:', error)
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
    // 使用事务批量插入或更新
    const connection = await pool.getConnection()
    
    try {
      await connection.beginTransaction()

      for (const day of weatherDays) {
        // 将日期格式从 yyyyMMdd 转换为 yyyy-MM-dd
        const dateStr = day.date.length === 8 
          ? `${day.date.substring(0, 4)}-${day.date.substring(4, 6)}-${day.date.substring(6, 8)}`
          : day.date

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
      console.log(`成功保存 ${weatherDays.length} 条天气数据到数据库`)
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  } catch (error: any) {
    console.error('保存天气数据到数据库失败:', error.message)
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
      SELECT w1.date, w1.text, w1.temp_min, w1.temp_max, w1.wind, w1.sunrise, w1.sunset
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

    const [rows] = await pool.execute(sql, params) as any[]

    const result = rows.map((row: any) => {
      // 处理日期格式：MySQL的DATE类型可能返回Date对象或字符串
      let dateStr = ''
      if (row.date instanceof Date) {
        // 使用本地时间格式化，避免时区转换问题
        // 不使用 toISOString()，因为它会转换为 UTC 时间
        const year = row.date.getFullYear()
        const month = String(row.date.getMonth() + 1).padStart(2, '0')
        const day = String(row.date.getDate()).padStart(2, '0')
        dateStr = `${year}${month}${day}`
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
      
      return {
        date: dateStr,
        text: row.text || '',
        tempMin: row.temp_min || '',
        tempMax: row.temp_max || '',
        wind: row.wind || undefined,
        sunrise: row.sunrise || undefined,
        sunset: row.sunset || undefined
      }
    })
    
    return result
  } catch (error: any) {
    console.error('从数据库获取天气数据失败:', error.message)
    return []
  }
}


// 数据库初始化工具
// 在服务器启动时自动初始化数据库连接和表结构

import { initDatabase, initTables } from '../services/database'

export default defineNitroPlugin(async (nitroApp) => {
  const config = useRuntimeConfig()
  const enableDatabaseCache = config.enableDatabaseCache ?? false
  
  // 检查是否启用了数据库缓存功能并配置了MySQL
  if (enableDatabaseCache && config.mysqlHost && config.mysqlUser && config.mysqlDatabase) {
    try {
      console.log('正在初始化MySQL数据库连接...')
      initDatabase(config)
      await initTables()
      console.log('MySQL数据库初始化完成')
    } catch (error) {
      console.error('MySQL数据库初始化失败:', error)
      // 不抛出错误，允许应用在没有数据库的情况下运行
    }
  } else if (!enableDatabaseCache) {
    console.log('数据库缓存功能未启用（ENABLE_DATABASE_CACHE=false），跳过数据库初始化')
  } else {
    console.log('未配置MySQL数据库，跳过数据库初始化')
  }
})


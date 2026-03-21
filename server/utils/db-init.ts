// 数据库初始化工具
// 在服务器启动时自动初始化数据库连接和表结构

import { initDatabase, initTables } from '../services/database'

export default defineNitroPlugin(async () => {
  const config = useRuntimeConfig()
  const enableDatabaseCache = config.enableDatabaseCache ?? false

  console.log(`[数据库初始化] 开始检查数据库初始化条件 - enableDatabaseCache: ${enableDatabaseCache}, mysqlHost: ${config.mysqlHost || 'N/A'}, mysqlUser: ${config.mysqlUser || 'N/A'}, mysqlDatabase: ${config.mysqlDatabase || 'N/A'}`)

  if (enableDatabaseCache && config.mysqlHost && config.mysqlUser && config.mysqlDatabase) {
    try {
      console.log('[数据库初始化] 正在初始化 MySQL 数据库连接')
      initDatabase(config)
      await initTables()
      console.log('[数据库初始化] MySQL 数据库初始化完成')
    } catch (error: any) {
      console.error(`[数据库初始化] MySQL 数据库初始化失败 - 错误信息: ${error.message}`)
      console.error('[数据库初始化] 错误堆栈:', error.stack)
    }
  } else if (!enableDatabaseCache) {
    console.log('[数据库初始化] 数据库缓存功能未启用，跳过数据库初始化')
  } else {
    console.warn(`[数据库初始化] MySQL 配置不完整，跳过数据库初始化 - mysqlHost: ${config.mysqlHost || 'N/A'}, mysqlUser: ${config.mysqlUser || 'N/A'}, mysqlDatabase: ${config.mysqlDatabase || 'N/A'}`)
  }
})

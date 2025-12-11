export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const search = (query.q as string) || (query.query as string) || ''
  const keyword = search.trim()

  if (!keyword) {
    throw createError({
      statusCode: 400,
      statusMessage: '缺少查询参数'
    })
  }

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(keyword)}&format=json&addressdetails=1&limit=10`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'weather-ics/1.0',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    })

    if (!res.ok) {
      throw createError({
        statusCode: res.status,
        statusMessage: `Nominatim请求失败(${res.status})`
      })
    }

    return await res.json()
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw createError({
        statusCode: 504,
        statusMessage: 'Nominatim请求超时'
      })
    }
    if (error.statusCode) {
      throw error
    }
    console.error('Nominatim服务端请求失败:', error)
    throw createError({
      statusCode: 502,
      statusMessage: 'Nominatim服务不可用'
    })
  } finally {
    clearTimeout(timeoutId)
  }
})


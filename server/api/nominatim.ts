import { apiError, apiSuccess } from '../utils/api'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const search = (query.q as string) || (query.query as string) || ''
  const keyword = search.trim()

  if (!keyword) {
    console.warn('[Nominatim] 缺少查询参数')
    return apiError('MISSING_QUERY', '缺少查询参数')
  }

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(keyword)}&format=json&addressdetails=1&limit=10`
  console.log(`[Nominatim] 收到服务端地理编码请求 - keyword: ${keyword}`)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    console.log(`[Nominatim] 开始请求上游服务 - keyword: ${keyword}, url: ${url}`)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'weather-ics/1.0',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    })

    if (!res.ok) {
      console.warn(`[Nominatim] 上游服务返回非成功状态 - keyword: ${keyword}, httpStatus: ${res.status}`)
      return apiError('NOMINATIM_REQUEST_FAILED', `Nominatim 请求失败 (${res.status})`, {
        source: 'provider:nominatim',
        details: {
          provider: 'nominatim',
          httpStatus: res.status
        }
      })
    }

    const data = await res.json()
    console.log(`[Nominatim] 上游服务请求成功 - keyword: ${keyword}, resultCount: ${Array.isArray(data) ? data.length : 0}`)
    return apiSuccess(data)
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.warn(`[Nominatim] 上游服务请求超时 - keyword: ${keyword}, timeoutMs: 10000`)
      return apiError('NOMINATIM_TIMEOUT', 'Nominatim 请求超时', {
        source: 'provider:nominatim'
      })
    }

    console.error(`[Nominatim] 服务端请求失败 - keyword: ${keyword}, 错误信息: ${error.message}`)
    console.error('[Nominatim] 错误堆栈:', error.stack)
    return apiError('NOMINATIM_UNAVAILABLE', 'Nominatim 服务不可用', {
      source: 'provider:nominatim'
    })
  } finally {
    clearTimeout(timeoutId)
  }
})

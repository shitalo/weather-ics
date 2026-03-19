import { apiError, apiSuccess } from '../utils/api'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const search = (query.q as string) || (query.query as string) || ''
  const keyword = search.trim()

  if (!keyword) {
    return apiError('MISSING_QUERY', '缺少查询参数')
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
      return apiError('NOMINATIM_REQUEST_FAILED', `Nominatim 请求失败 (${res.status})`, {
        source: 'provider:nominatim',
        details: {
          provider: 'nominatim',
          httpStatus: res.status
        }
      })
    }

    return apiSuccess(await res.json())
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return apiError('NOMINATIM_TIMEOUT', 'Nominatim 请求超时', {
        source: 'provider:nominatim'
      })
    }

    console.error('Nominatim 服务端请求失败:', error)
    return apiError('NOMINATIM_UNAVAILABLE', 'Nominatim 服务不可用', {
      source: 'provider:nominatim'
    })
  } finally {
    clearTimeout(timeoutId)
  }
})

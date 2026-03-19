import { apiError, apiSuccess } from '../utils/api'

type QWeatherProblem = {
  status?: number
  type?: string
  title?: string
  detail?: string
  invalidParams?: string[]
}

type QWeatherErrorEnvelope = {
  error?: QWeatherProblem
  code?: string
  message?: string
  msg?: string
}

function getApiBaseUrl(apiHost?: string) {
  if (!apiHost) {
    return 'https://geoapi.qweather.com'
  }

  const host = String(apiHost).trim().replace(/\/$/, '')
  return host.startsWith('http') ? host : `https://${host}`
}

function getApiPath(apiHost?: string) {
  return apiHost ? '/geo/v2/city/lookup' : '/v2/city/lookup'
}

async function parseJsonSafely(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

async function parseTextSafely(res: Response) {
  try {
    return await res.text()
  } catch {
    return ''
  }
}

async function parseQWeatherError(res: Response) {
  const contentType = res.headers.get('content-type') || ''

  if (contentType.includes('application/json') || contentType.includes('application/problem+json')) {
    return {
      payload: await parseJsonSafely(res) as QWeatherErrorEnvelope | null,
      text: ''
    }
  }

  return {
    payload: null,
    text: await parseTextSafely(res)
  }
}

function buildErrorMessage(problem?: QWeatherProblem, fallback?: string) {
  const title = String(problem?.title || '').trim().toUpperCase()
  const invalidParams = problem?.invalidParams?.filter(Boolean) || []

  if (title === 'INVALID PARAMETER') {
    return invalidParams.length
      ? `和风天气请求参数错误，请检查：${invalidParams.join('、')}`
      : '和风天气请求参数错误，请检查请求内容'
  }

  if (title === 'MISSING PARAMETER') {
    return invalidParams.length
      ? `和风天气缺少必要参数：${invalidParams.join('、')}`
      : '和风天气缺少必要参数'
  }

  if (title === 'NO SUCH LOCATION') {
    return '未找到该地点，请尝试更完整的城市或地区名称'
  }

  if (title === 'DATA NOT AVAILABLE') {
    return '该地点暂不支持地理数据查询，请尝试其他地点'
  }

  if (title === 'UNAUTHORIZED') {
    return '和风天气认证失败，请检查 HEFENG_API_KEY 是否正确'
  }

  if (title === 'NO CREDIT') {
    return '和风天气账号可用额度不足，请充值或调整套餐'
  }

  if (title === 'OVERDUE') {
    return '和风天气账号存在逾期账单，请先完成支付'
  }

  if (title === 'SECURITY RESTRICTION') {
    return '当前请求触发了和风天气安全限制，请检查 API Key 或访问限制设置'
  }

  if (title === 'INVALID HOST') {
    return '当前 API Host 与和风控制台配置不一致，请检查 HEFENG_API_HOST'
  }

  if (title === 'ACCOUNT SUSPENSION') {
    return '和风天气账号已被冻结，请登录控制台处理'
  }

  if (title === 'FORBIDDEN') {
    return '当前账号无权访问该和风天气数据'
  }

  if (title === 'NOT FOUND') {
    return '和风天气 API 路径不存在，请检查 API Host 或请求路径'
  }

  if (title === 'METHOD NOT ALLOWED') {
    return '和风天气 Geo 接口仅支持 GET 请求'
  }

  if (title === 'TOO MANY REQUESTS') {
    return '请求过于频繁，请稍后重试'
  }

  if (title === 'OVER MONTHLY LIMIT') {
    return '本月和风天气请求量已达上限，请下月再试或升级套餐'
  }

  if (title === 'UNKNOWN ERROR') {
    return '和风天气服务发生异常，请稍后重试'
  }

  if (problem?.detail) {
    return problem.detail
  }

  return fallback || '和风天气请求失败'
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const apiKey = config.hefengApiKey
  const apiHost = config.hefengApiHost
  const query = getQuery(event)
  const location = String(query.location || '').trim()

  if (!location) {
    return apiError('MISSING_LOCATION', '缺少 location 参数')
  }

  if (!apiKey) {
    return apiError('MISSING_HEFENG_API_KEY', '缺少 HEFENG_API_KEY 配置')
  }

  const baseUrl = getApiBaseUrl(apiHost)
  const path = getApiPath(apiHost)
  const url = `${baseUrl}${path}?key=${encodeURIComponent(String(apiKey))}&location=${encodeURIComponent(location)}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'weather-ics/1.0'
      }
    })

    if (!res.ok) {
      const { payload, text } = await parseQWeatherError(res)
      const problem = payload?.error
      const details = {
        provider: 'qweather',
        httpStatus: res.status,
        type: problem?.type || null,
        title: problem?.title || null,
        invalidParams: problem?.invalidParams || [],
        raw: payload || text || null
      }

      return apiError(
        'HEFENG_GEO_REQUEST_FAILED',
        buildErrorMessage(problem, payload?.message || payload?.msg || text || ''),
        {
          source: 'provider:qweather',
          details
        }
      )
    }

    const data = await res.json()
    return apiSuccess(data)
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return apiError('HEFENG_GEO_TIMEOUT', '和风天气 API 请求超时', {
        source: 'provider:qweather'
      })
    }

    console.error('和风天气地理接口请求失败:', error)
    return apiError('HEFENG_GEO_UNAVAILABLE', '和风天气 API 不可用', {
      source: 'provider:qweather'
    })
  } finally {
    clearTimeout(timeoutId)
  }
})

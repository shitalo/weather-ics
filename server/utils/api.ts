export type ApiErrorShape = {
  code: string
  message: string
  source?: string
  details?: unknown
}

export type ApiSuccess<T> = {
  success: true
  data: T
  error: null
}

export type ApiFailure = {
  success: false
  data: null
  error: ApiErrorShape
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export function apiSuccess<T>(data: T): ApiSuccess<T> {
  return {
    success: true,
    data,
    error: null
  }
}

export function apiError(
  code: string,
  message: string,
  options: Omit<ApiErrorShape, 'code' | 'message'> = {}
): ApiFailure {
  return {
    success: false,
    data: null,
    error: {
      code,
      message,
      source: options.source || 'system',
      details: options.details
    }
  }
}

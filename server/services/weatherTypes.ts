// 通用天气类型定义
export interface WeatherDay {
  date: string
  text: string
  tempMin: string
  tempMax: string
  icon?: string
  wind?: string
  code?: string
  sunrise?: string // 日出时间，格式：HH:mm
  sunset?: string  // 日落时间，格式：HH:mm
} 
-- 天气数据缓存表
-- 用于存储用户查询的天气数据，支持按经纬度和日期查询历史数据

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


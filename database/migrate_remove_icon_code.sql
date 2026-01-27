-- 迁移脚本：移除 weather_cache 表中的 icon 和 code 字段
-- 如果表已经存在，执行此脚本来删除不需要的字段
-- 
-- 注意：如果字段不存在，执行会报错，可以忽略错误继续执行下一个语句

-- 删除 icon 字段
-- 如果字段不存在会报错，可以忽略
ALTER TABLE weather_cache DROP COLUMN icon;

-- 删除 code 字段
-- 如果字段不存在会报错，可以忽略
ALTER TABLE weather_cache DROP COLUMN code;


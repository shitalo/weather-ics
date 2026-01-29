<template>
  <div class="container">
    <h1>天气订阅日历 <span>☀️🌧️❄️</span></h1>
    <form @submit.prevent="onSearch" novalidate>
      <div class="input-group">
        <input 
          v-model="city" 
          placeholder="输入城市名，如：北京" 
          required 
          @blur="validateInput"
          @keydown.enter.prevent="onSearch"
          @keypress.enter.prevent
        />
        <div v-if="validationError" class="validation-error">{{ validationError }}</div>
      </div>
      <button type="button" @click="onSearch">搜索</button>
    </form>
    <div v-if="loading" class="loading-box">
      <span class="loading-spinner">🌦️</span>
      <span class="loading-text">正在查询天气…</span>
    </div>
    <div v-if="error" class="error">{{ error }}</div>
    <transition name="fade">
      <div v-if="candidates.length" class="candidates-list">
        <div v-for="item in candidates" :key="item.id" class="candidate-item">
          <span class="candidate-name" :title="item.name + (item.adm2 ? '，' + item.adm2 : '') + (item.adm1 ? '，' + item.adm1 : '') + (item.country ? '，' + item.country : '')" @click="showFullName(item)">
            {{ item.name }}<span v-if="item.adm2">，{{ item.adm2 }}</span><span v-if="item.adm1">，{{ item.adm1 }}</span><span v-if="item.country">，{{ item.country }}</span>
          </span>
          <button
            class="choose-btn"
            :class="{ chosen: isChosen(item) }"
            :disabled="isChosen(item)"
            @click="chooseCandidate(item)"
          >
            {{ isChosen(item) ? '已选' : '选择' }}
          </button>
        </div>
      </div>
    </transition>
    <transition name="fade">
      <div v-if="icsUrl" class="ics-card">
        <div class="ics-icon-row"><span class="ics-icon">📅</span></div>
        <div class="ics-info">
          <div class="chosen-name"><span class="chosen-icon">📍</span>{{ chosenName }}</div>
        </div>
        <div class="ics-btns">
          <button class="copy-btn" @click="copyIcsUrl">复制链接</button>
          <button class="open-btn" @click="openIcsUrl">打开链接</button>
        </div>
      </div>
    </transition>
    <transition name="fade">
      <div v-if="showNameTip" class="name-tip">{{ fullNameTip }}</div>
    </transition>
    <transition name="fade">
      <div v-if="showIcsTip" class="name-tip">{{ icsUrl }}</div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
const city = ref('')
const loading = ref(false)
const error = ref('')
const icsUrl = ref('')
const candidates = ref<any[]>([])
const showNameTip = ref(false)
const fullNameTip = ref('')
let tipTimer: any = null
const showIcsTip = ref(false)
let icsTipTimer: any = null
const chosenItem = ref<any>(null)
const validationError = ref('')
const config = useRuntimeConfig()
const hefengKey = config.public.hefengApiKey
const hefengApiHost = config.public.hefengApiHost
const geoApiProvider = config.public.geoApiProvider
const useServerNominatim = config.public.useServerNominatim

/**
 * 获取和风天气GeoAPI的URL
 * 如果配置了API Host，使用API Host并调整路径（v2 -> geo/v2）
 * 否则使用旧的公共域名
 */
function getHefengGeoApiUrl(path: string): string {
  if (hefengApiHost) {
    // 使用API Host，路径需要从 v2 改为 geo/v2
    const host = String(hefengApiHost).trim().replace(/\/$/, '')
    const baseUrl = host.startsWith('http') ? host : `https://${host}`
    // 将路径中的 /v2/ 替换为 /geo/v2/（根据和风天气API Host文档要求）
    const adjustedPath = path.replace(/^\/v2\//, '/geo/v2/')
    return `${baseUrl}${adjustedPath}`
  }
  // 向后兼容：使用旧的公共域名
  return `https://geoapi.qweather.com${path}`
}

// 检测结果缓存（在内存中，页面刷新后重置）
let networkCheckCache: boolean | null = null
let networkCheckPromise: Promise<boolean> | null = null

// 确保URL干净，没有查询参数
onMounted(() => {
  if (window.history && window.history.replaceState && window.location.search) {
    window.history.replaceState(null, '', window.location.pathname)
  }
})

const ellipsisIcsUrl = computed(() => {
  if (!icsUrl.value) return ''
  if (icsUrl.value.length <= 36) return icsUrl.value
  return icsUrl.value.slice(0, 16) + '...' + icsUrl.value.slice(-16)
})

const chosenName = computed(() => {
  if (!chosenItem.value) return ''
  let name = chosenItem.value.name
  if (chosenItem.value.adm2) name += '，' + chosenItem.value.adm2
  if (chosenItem.value.adm1) name += '，' + chosenItem.value.adm1
  if (chosenItem.value.country) name += '，' + chosenItem.value.country
  return name
})

function mapNominatimCandidates(data: any) {
  if (!Array.isArray(data) || !data.length) {
    throw new Error('未找到该城市')
  }
  return data.map((item: any) => ({
    id: item.place_id,
    name: item.display_name,
    lat: item.lat,
    lon: item.lon,
    adm1: item.address?.state || item.address?.region || item.address?.province,
    adm2: item.address?.city || item.address?.county || item.address?.town || item.address?.village,
    country: item.address?.country,
    raw: item
  }))
}

async function fetchNominatimData(url: string, label: string) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      throw new Error(`${label}错误: ${res.status}`)
    }
    const data = await res.json()
    return mapNominatimCandidates(data)
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('请求超时，请检查网络连接')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 检测浏览器是否能访问境外网站（用于判断是否使用浏览器直连）
 * 使用 Google DNS 作为检测目标（快速且可靠）
 */
async function checkOverseasNetworkAccess(): Promise<boolean> {
  // 如果已有缓存结果，直接返回
  if (networkCheckCache !== null) {
    return networkCheckCache
  }
  
  // 如果正在检测中，等待检测完成
  if (networkCheckPromise) {
    return networkCheckPromise
  }
  
  // 开始检测
  networkCheckPromise = (async () => {
    try {
      // 使用 Google DNS API 作为检测目标（快速且不需要实际访问完整页面）
      // 使用较短的超时时间，避免影响用户体验
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 2000) // 2秒超时
      
      const res = await fetch('https://dns.google/resolve?name=google.com&type=A', {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store'
      })
      
      clearTimeout(timeoutId)
      
      // 如果能成功访问（即使返回错误状态码也算能访问）
      const canAccess = res.ok || res.status === 400 // 400 也可能表示能访问但请求格式问题
      networkCheckCache = canAccess
      return canAccess
    } catch (error) {
      // 检测失败，默认认为不能访问，使用服务端代理
      networkCheckCache = false
      return false
    } finally {
      networkCheckPromise = null
    }
  })()
  
  return networkCheckPromise
}

async function getNominatimCandidates(cityName: string) {
  const q = encodeURIComponent(cityName)
  const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&addressdetails=1&limit=10`
  
  // 根据环境变量决定是否走服务端代理
  // useServerNominatim 可以是 true, false, 或 'auto'
  const serverNominatimMode = String(useServerNominatim).toLowerCase()
  
  if (serverNominatimMode === 'true') {
    // 强制使用服务端代理
    try {
      return await fetchNominatimData(`/api/nominatim?q=${q}`, '服务端Nominatim')
    } catch (serverError) {
      console.warn('服务端Nominatim失败，尝试浏览器直连', serverError)
      return await fetchNominatimData(nominatimUrl, 'Nominatim API')
    }
  } else if (serverNominatimMode === 'auto') {
    // 自动模式：先检测网络，再决定使用哪种方式
    const canAccessOverseas = await checkOverseasNetworkAccess()
    
    if (canAccessOverseas) {
      // 可以访问境外网站，使用浏览器直连
      try {
        return await fetchNominatimData(nominatimUrl, 'Nominatim API')
      } catch (browserError) {
        // 浏览器直连失败，回退到服务端代理
        console.warn('浏览器直连Nominatim失败，尝试服务端代理', browserError)
        return await fetchNominatimData(`/api/nominatim?q=${q}`, '服务端Nominatim')
      }
    } else {
      // 不能访问境外网站，使用服务端代理
      try {
        return await fetchNominatimData(`/api/nominatim?q=${q}`, '服务端Nominatim')
      } catch (serverError) {
        // 服务端代理失败，尝试浏览器直连（可能是网络暂时问题）
        console.warn('服务端Nominatim失败，尝试浏览器直连', serverError)
        return await fetchNominatimData(nominatimUrl, 'Nominatim API')
      }
    }
  } else {
    // 默认：直接通过浏览器访问 Nominatim
    return await fetchNominatimData(nominatimUrl, 'Nominatim API')
  }
}

function validateInput() {
  if (!city.value.trim()) {
    validationError.value = '请输入城市名称'
  } else {
    validationError.value = ''
  }
}

function isChosen(item: any) {
  if (!chosenItem.value) return false
  // 匹配方式：和风用id，nominatim用lat/lon
  if (geoApiProvider === 'nominatim') {
    return (
      chosenItem.value.lat === item.lat &&
      chosenItem.value.lon === item.lon &&
      chosenItem.value.name === item.name
    )
  } else {
    return chosenItem.value.id === item.id
  }
}

async function onSearch() {
  // 防止URL变化
  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, '', window.location.pathname)
  }
  
  if (!city.value.trim()) {
    validationError.value = '请输入城市名称'
    return
  }
  validationError.value = ''
  loading.value = true
  error.value = ''
  icsUrl.value = ''
  candidates.value = []
  chosenItem.value = null
  
  try {
    if (geoApiProvider === 'nominatim') {
      candidates.value = await getNominatimCandidates(city.value)
    } else {
      // 和风GeoAPI with timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒超时
      
      try {
        const geoApiUrl = getHefengGeoApiUrl('/v2/city/lookup')
        const res = await fetch(`${geoApiUrl}?key=${hefengKey}&location=${encodeURIComponent(city.value)}`, {
          signal: controller.signal
        })
        clearTimeout(timeoutId)
        
        if (!res.ok) {
          throw new Error(`和风天气API错误: ${res.status}`)
        }
        
        const data = await res.json()
        console.log('和风天气GeoAPI返回：', data)
        
        if (data.code !== '200' || !data.location?.length) {
          throw new Error('未找到该城市')
        }
        
        candidates.value = data.location
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        if (fetchError.name === 'AbortError') {
          throw new Error('请求超时，请检查网络连接')
        }
        throw fetchError
      }
    }
  } catch (e: any) {
    console.error('搜索错误:', e)
    if (e.message.includes('ECONNRESET') || e.message.includes('fetch')) {
      error.value = '网络连接失败，请检查网络后重试'
    } else {
      error.value = e.message || '查询失败'
    }
  } finally {
    loading.value = false
  }
}
function chooseCandidate(item: any) {
  chosenItem.value = item
  if (geoApiProvider === 'nominatim') {
    icsUrl.value = `${location.origin}/api/weather-ics?lat=${item.lat}&lon=${item.lon}&city=${encodeURIComponent(item.name)}`
  } else {
    icsUrl.value = `${location.origin}/api/weather-ics?locationId=${item.id}&lat=${item.lat}&lon=${item.lon}&city=${encodeURIComponent(item.name)}`
  }
}
function copyLink() {
  if (!icsUrl.value) return;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(icsUrl.value);
  } else {
    const textarea = document.createElement('textarea');
    textarea.value = icsUrl.value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
    } catch (err) {}
    document.body.removeChild(textarea);
  }
  showIcsTip.value = true;
  clearTimeout(icsTipTimer);
  icsTipTimer = setTimeout(() => {
    showIcsTip.value = false;
  }, 2000);
}
function copyIcsUrl() {
  copyLink();
}
function showFullName(item: any) {
  let name = item.name
  if (item.adm2) name += '，' + item.adm2
  if (item.adm1) name += '，' + item.adm1
  if (item.country) name += '，' + item.country
  fullNameTip.value = name
  showNameTip.value = true
  clearTimeout(tipTimer)
  tipTimer = setTimeout(() => {
    showNameTip.value = false
  }, 2000)
}
function openIcsUrl() {
  if (icsUrl.value) {
    window.open(icsUrl.value, '_blank');
  }
}
</script>

<style scoped>
.container {
  max-width: 420px;
  margin: 60px auto;
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 4px 32px #0001;
  padding: 2.5rem 2rem 2rem 2rem;
  text-align: center;
}
h1 {
  font-size: 2rem;
  margin-bottom: 1.5rem;
  font-weight: 700;
  letter-spacing: 2px;
}
form {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 0.7em;
  margin-bottom: 1.2em;
}
.input-group {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 80px;
}
input {
  width: 70%;
  padding: 0.7em 1em;
  border: 1px solid #eee;
  border-radius: 8px;
  font-size: 1rem;
  outline: none;
  transition: border 0.2s;
}
input:focus {
  border: 1.5px solid #007aff;
}
.validation-error {
  color: #e74c3c;
  font-size: 0.9em;
  margin-top: 0.3em;
  animation: fadeIn 0.2s ease-in;
  text-align: center;
  height: 1.2em;
  line-height: 1.2em;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}
button {
  padding: 0.7em 1.2em;
  background: linear-gradient(90deg, #007aff, #00c6fb);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s;
}
button:hover {
  background: linear-gradient(90deg, #005be7, #00a6d6);
}
.loading-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.8em;
  margin-top: 2em;
  padding: 1.5em;
  background: #f8fafc;
  border-radius: 12px;
  box-shadow: 0 2px 12px #007aff11;
}
.loading-spinner {
  font-size: 2.5em;
  animation: spin 1.5s linear infinite;
}
.loading-text {
  color: #007aff;
  font-size: 1.1em;
  font-weight: 600;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.4s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
.candidates-list {
  margin-top: 2em;
  background: #f6faff;
  border-radius: 12px;
  box-shadow: 0 1px 8px #007aff11;
  padding: 1em 0.5em;
}
.candidate-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5em 0.5em;
  border-bottom: 1px solid #e6eaf0;
  gap: 0.5em;
}
.candidate-item:last-child {
  border-bottom: none;
}
.candidate-name {
  font-size: 1.08em;
  color: #222;
  text-align: left;
  max-width: 65%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1 1 auto;
}
.choose-btn {
  flex-shrink: 0;
  min-width: 70px;
  max-width: 100px;
  background: #fff;
  color: #007aff;
  border: 1.5px solid #007aff;
  font-weight: 600;
  padding: 0.4em 1em;
  border-radius: 8px;
  box-shadow: 0 1px 4px #007aff11;
  transition: background 0.2s, color 0.2s;
  margin-left: 1em;
}
.choose-btn:hover {
  background: #007aff;
  color: #fff;
}
.choose-btn.chosen {
  background: #007aff;
  color: #fff;
  border-color: #007aff;
  cursor: default;
  opacity: 0.85;
}
.ics-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  background: #f8fafc;
  border-radius: 14px;
  box-shadow: 0 2px 12px #007aff22;
  padding: 1.2em 1em;
  margin-top: 2em;
  gap: 0.2em;
  justify-content: flex-start;
  position: relative;
  flex-wrap: wrap;
}
.ics-icon-row {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 0.2em;
}
.ics-icon {
  font-size: 2.2em;
  margin: 0 auto;
}
.ics-info {
  flex: 1 1 0;
  min-width: 0;
  text-align: left;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: stretch;
}
.ics-link {
  display: block;
  color: #222;
  font-size: 0.98em;
  word-break: break-all;
  margin-top: 0.1em;
  text-decoration: underline dotted #007aff44;
  transition: color 0.2s;
  cursor: pointer;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ics-link:hover {
  color: #007aff;
}
.ics-btns {
  display: flex;
  gap: 1em;
  margin-top: 0.5em;
  justify-content: center;
}
.copy-btn,
.open-btn {
  flex-shrink: 0;
  min-width: 90px;
  max-width: 120px;
  background: linear-gradient(90deg, #007aff, #00c6fb);
  color: #fff;
  border: none;
  font-weight: 600;
  padding: 0.6em 1.1em;
  border-radius: 8px;
  box-shadow: 0 1px 4px #007aff11;
  transition: background 0.2s, color 0.2s;
}
.copy-btn:hover,
.open-btn:hover {
  background: linear-gradient(90deg, #005be7, #00a6d6);
}
.name-tip {
  position: fixed;
  left: 50%;
  bottom: 32px;
  transform: translateX(-50%);
  background: #222;
  color: #fff;
  padding: 0.7em 1.5em;
  border-radius: 12px;
  font-size: 1.08em;
  box-shadow: 0 2px 12px #0003;
  z-index: 9999;
  max-width: 90vw;
  word-break: break-all;
  text-align: center;
  pointer-events: none;
}
.chosen-name {
  color: #007aff;
  font-size: 1.25em;
  font-weight: 700;
  margin-bottom: 0.9em;
  margin-top: 0.4em;
  word-break: break-all;
  background: #f0f7ff;
  border-radius: 12px;
  padding: 1em 1.5em;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 0.5em;
  box-shadow: 0 2px 12px #007aff11;
}
.chosen-icon {
  font-size: 1.3em;
  margin-right: 0.2em;
}
@media (max-width: 500px) {
  form {
    gap: 0.5em;
  }
  .input-group {
    min-height: 70px;
  }
  input {
    width: 70%;
    flex: none;
  }
  button[type='submit'] {
    width: auto;
    min-width: 64px;
    padding-left: 1.2em;
    padding-right: 1.2em;
  }
  .ics-card {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5em;
  }
  .ics-btns {
    flex-direction: column;
    gap: 0.5em;
  }
  .copy-btn,
  .open-btn {
    margin-left: 0;
    width: 100%;
    max-width: none;
    margin-top: 0;
  }
  .chosen-name {
    font-size: 1.1em;
    padding: 0.7em 1em;
    border-radius: 8px;
    margin-bottom: 0.7em;
    margin-top: 0.3em;
  }
}
.result {
  margin-top: 2em;
  word-break: break-all;
}
.error {
  color: #e74c3c;
  margin-top: 1em;
}
button[type='submit'] {
  margin-top: 0.1em;
}
</style> 
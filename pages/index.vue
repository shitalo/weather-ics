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
const geoApiProvider = config.public.geoApiProvider

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
    let data
    if (geoApiProvider === 'nominatim') {
      // Nominatim API with timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒超时
      
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city.value)}&format=json&addressdetails=1&limit=10`, {
          signal: controller.signal
        })
        clearTimeout(timeoutId)
        
        if (!res.ok) {
          throw new Error(`Nominatim API错误: ${res.status}`)
        }
        
        data = await res.json()
        console.log('Nominatim返回：', data)
        
        if (!Array.isArray(data) || !data.length) {
          throw new Error('未找到该城市')
        }
        
        candidates.value = data.map((item: any) => ({
          id: item.place_id,
          name: item.display_name,
          lat: item.lat,
          lon: item.lon,
          raw: item
        }))
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        if (fetchError.name === 'AbortError') {
          throw new Error('请求超时，请检查网络连接')
        }
        throw fetchError
      }
    } else {
      // 和风GeoAPI with timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒超时
      
      try {
        const res = await fetch(`https://geoapi.qweather.com/v2/city/lookup?key=${hefengKey}&location=${encodeURIComponent(city.value)}`, {
          signal: controller.signal
        })
        clearTimeout(timeoutId)
        
        if (!res.ok) {
          throw new Error(`和风天气API错误: ${res.status}`)
        }
        
        data = await res.json()
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
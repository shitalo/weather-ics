<template>
  <div class="page">
    <section class="atlas" aria-hidden="false">
      <div class="eyebrow">Weather ICS Atlas</div>
      <h1>天气日历订阅</h1>
      <p class="lead">
        把城市天气变成可订阅的日历事件，自动同步到系统日历、日程软件或团队日历。
        适合出差规划、行程提醒和日常天气关注。
      </p>
      <div class="atlas-grid">
        <div class="atlas-card">
          <div class="card-title">一键订阅</div>
          <div class="card-body">选择城市，复制链接即可订阅，日历会持续更新。</div>
        </div>
        <div class="atlas-card">
          <div class="card-title">精确定位</div>
          <div class="card-body">支持区县/州省/国家信息，避免同名城市混淆。</div>
        </div>
        <div class="atlas-card">
          <div class="card-title">跨平台</div>
          <div class="card-body">Apple/Google/Outlook 等主流日历均可订阅。</div>
        </div>
      </div>
      <div class="compass" aria-hidden="true">
        <div class="compass-ring"></div>
        <div class="compass-needle"></div>
      </div>
      <div class="fine-print">提示：搜索后请选择最准确的行政区匹配项。</div>
    </section>

    <main class="panel" aria-live="polite">
      <div class="panel-head">
        <div>
          <div class="panel-title">生成订阅链接</div>
          <div class="panel-subtitle">输入城市名称，系统会返回可选的地理位置。</div>
        </div>
        <div class="panel-badges">
          <span class="badge">iCal / ICS</span>
          <span class="badge">实时更新</span>
          <span class="badge">多端同步</span>
        </div>
      </div>

      <div class="panel-body">
        <section class="panel-search">
          <form class="search" @submit.prevent="onSearch" novalidate>
            <label class="field">
              <span class="label">城市名称</span>
              <div class="control" :class="{ invalid: validationError }">
                <input
                  v-model="city"
                  placeholder="例如：北京 / 上海 / San Francisco"
                  required
                  @blur="validateInput"
                  @keydown.enter.prevent="onSearch"
                  @keypress.enter.prevent
                />
                <button type="button" class="primary" @click="onSearch">搜索</button>
              </div>
              <span v-if="validationError" class="field-error">{{ validationError }}</span>
            </label>
          </form>

          <div v-if="loading" class="status loading">
            <span class="status-dot"></span>
            <span>正在查询天气位置…</span>
          </div>
          <div v-if="error" class="status error">{{ error }}</div>

          <div class="panel-notes">
            <div class="note">支持同名城市区分，建议选择带省/州标注的条目。</div>
            <div class="note">复制链接后，可粘贴到系统日历订阅入口。</div>
          </div>
        </section>

        <section class="panel-results">
          <transition name="fade">
            <div v-if="candidates.length" class="candidates">
              <div class="candidates-head">请选择一个地点</div>
              <div class="candidate" v-for="item in candidates" :key="item.id">
                <div class="candidate-main">
                  <div class="candidate-name" :title="formatFullName(item)" @click="showFullName(item)">
                    {{ item.name }}
                  </div>
                  <div class="candidate-meta">
                    <span v-if="item.adm2">{{ item.adm2 }}</span>
                    <span v-if="item.adm1">{{ item.adm1 }}</span>
                    <span v-if="item.country">{{ item.country }}</span>
                  </div>
                </div>
                <button
                  class="ghost"
                  :class="{ chosen: isChosen(item) }"
                  :disabled="isChosen(item)"
                  @click="chooseCandidate(item)"
                >
                  {{ isChosen(item) ? '已选择' : '选择' }}
                </button>
              </div>
            </div>
          </transition>

          <transition name="fade">
            <div v-if="icsUrl" class="result">
              <div class="result-head">
                <div class="result-title">订阅链接已生成</div>
                <div class="result-city">{{ chosenName }}</div>
              </div>
              <div class="result-link" :title="icsUrl" @click="copyIcsUrl">
                {{ ellipsisIcsUrl }}
              </div>
              <div class="result-actions">
                <button class="secondary" @click="copyIcsUrl">复制链接</button>
                <button class="primary" @click="openIcsUrl">打开链接</button>
              </div>
              <div class="hint">点击链接可复制，或直接打开进行订阅。</div>
            </div>
          </transition>
        </section>
      </div>

      <transition name="fade">
        <div v-if="showNameTip" class="toast">{{ fullNameTip }}</div>
      </transition>
      <transition name="fade">
        <div v-if="showIcsTip" class="toast">已复制：{{ icsUrl }}</div>
      </transition>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const city = ref('')
const loading = ref(false)
const error = ref('')
const icsUrl = ref('')
const candidates = ref<any[]>([])
const chosenItem = ref<any>(null)
const validationError = ref('')

const showNameTip = ref(false)
const fullNameTip = ref('')
let tipTimer: ReturnType<typeof setTimeout> | null = null

const showIcsTip = ref(false)
let icsTipTimer: ReturnType<typeof setTimeout> | null = null

const config = useRuntimeConfig()
const hefengKey = config.public.hefengApiKey
const hefengApiHost = config.public.hefengApiHost
const geoApiProvider = config.public.geoApiProvider
const useServerNominatim = config.public.useServerNominatim

function getHefengGeoApiUrl(path: string): string {
  if (hefengApiHost) {
    const host = String(hefengApiHost).trim().replace(/\/$/, '')
    const baseUrl = host.startsWith('http') ? host : `https://${host}`
    const adjustedPath = path.replace(/^\/v2\//, '/geo/v2/')
    return `${baseUrl}${adjustedPath}`
  }
  return `https://geoapi.qweather.com${path}`
}

let networkCheckCache: boolean | null = null
let networkCheckPromise: Promise<boolean> | null = null

onMounted(() => {
  if (window.history && window.history.replaceState && window.location.search) {
    window.history.replaceState(null, '', window.location.pathname)
  }
})

const ellipsisIcsUrl = computed(() => {
  if (!icsUrl.value) return ''
  if (icsUrl.value.length <= 42) return icsUrl.value
  return `${icsUrl.value.slice(0, 18)}...${icsUrl.value.slice(-18)}`
})

const chosenName = computed(() => {
  if (!chosenItem.value) return ''
  return formatFullName(chosenItem.value)
})

function formatFullName(item: any) {
  let name = item.name
  if (item.adm2) name += `，${item.adm2}`
  if (item.adm1) name += `，${item.adm1}`
  if (item.country) name += `，${item.country}`
  return name
}

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
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('请求超时，请检查网络连接')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

async function checkOverseasNetworkAccess(): Promise<boolean> {
  if (networkCheckCache !== null) {
    return networkCheckCache
  }

  if (networkCheckPromise) {
    return networkCheckPromise
  }

  networkCheckPromise = (async () => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 2000)

      const res = await fetch('https://dns.google/resolve?name=google.com&type=A', {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store'
      })

      clearTimeout(timeoutId)
      const canAccess = res.ok || res.status === 400
      networkCheckCache = canAccess
      return canAccess
    } catch (err) {
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
  const serverNominatimMode = String(useServerNominatim).toLowerCase()

  if (serverNominatimMode === 'true') {
    try {
      return await fetchNominatimData(`/api/nominatim?q=${q}`, '服务端 Nominatim')
    } catch (serverError) {
      console.warn('服务端 Nominatim 失败，尝试浏览器直连', serverError)
      return await fetchNominatimData(nominatimUrl, 'Nominatim API')
    }
  } else if (serverNominatimMode === 'auto') {
    const canAccessOverseas = await checkOverseasNetworkAccess()

    if (canAccessOverseas) {
      try {
        return await fetchNominatimData(nominatimUrl, 'Nominatim API')
      } catch (browserError) {
        console.warn('浏览器直连失败，尝试服务端代理', browserError)
        return await fetchNominatimData(`/api/nominatim?q=${q}`, '服务端 Nominatim')
      }
    } else {
      try {
        return await fetchNominatimData(`/api/nominatim?q=${q}`, '服务端 Nominatim')
      } catch (serverError) {
        console.warn('服务端 Nominatim 失败，尝试浏览器直连', serverError)
        return await fetchNominatimData(nominatimUrl, 'Nominatim API')
      }
    }
  }

  return await fetchNominatimData(nominatimUrl, 'Nominatim API')
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
  if (geoApiProvider === 'nominatim') {
    return (
      chosenItem.value.lat === item.lat &&
      chosenItem.value.lon === item.lon &&
      chosenItem.value.name === item.name
    )
  }
  return chosenItem.value.id === item.id
}

async function onSearch() {
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
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      try {
        const geoApiUrl = getHefengGeoApiUrl('/v2/city/lookup')
        const res = await fetch(`${geoApiUrl}?key=${hefengKey}&location=${encodeURIComponent(city.value)}`, {
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        if (!res.ok) {
          throw new Error(`和风天气 API 错误: ${res.status}`)
        }

        const data = await res.json()
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
  } catch (err: any) {
    console.error('搜索错误:', err)
    if (err.message?.includes('ECONNRESET') || err.message?.includes('fetch')) {
      error.value = '网络连接失败，请检查网络后重试'
    } else {
      error.value = err.message || '查询失败'
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
  if (!icsUrl.value) return
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(icsUrl.value)
  } else {
    const textarea = document.createElement('textarea')
    textarea.value = icsUrl.value
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    try {
      document.execCommand('copy')
    } catch (err) {
      console.warn('复制失败:', err)
    }
    document.body.removeChild(textarea)
  }
  showIcsTip.value = true
  if (icsTipTimer) clearTimeout(icsTipTimer)
  icsTipTimer = setTimeout(() => {
    showIcsTip.value = false
  }, 2000)
}

function copyIcsUrl() {
  copyLink()
}

function showFullName(item: any) {
  fullNameTip.value = formatFullName(item)
  showNameTip.value = true
  if (tipTimer) clearTimeout(tipTimer)
  tipTimer = setTimeout(() => {
    showNameTip.value = false
  }, 2000)
}

function openIcsUrl() {
  if (icsUrl.value) {
    window.open(icsUrl.value, '_blank')
  }
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500..800&family=Spline+Sans:wght@300..700&display=swap');

:global(html),
:global(body) {
  height: 100%;
  height: -webkit-fill-available;
}

.page {
  --ink: #1f2433;
  --muted: #5a6172;
  --paper: #f8f4ee;
  --sea: #4ab3c2;
  --sun: #f3b254;
  --glow: #efe3c8;
  --line: #d9dde6;
  --shadow: 0 28px 60px rgba(20, 24, 36, 0.18);
  -webkit-font-smoothing: antialiased;
  -webkit-text-size-adjust: 100%;
  text-rendering: optimizeLegibility;
  min-height: 100vh;
  min-height: -webkit-fill-available;
  min-height: 100dvh;
  padding: 3rem;
  padding: clamp(2rem, 5vw, 5rem);
  background:
    radial-gradient(1200px 600px at 10% 0%, rgba(253, 248, 235, 0.9), transparent 70%),
    radial-gradient(900px 500px at 90% 10%, rgba(240, 248, 253, 0.9), transparent 70%),
    linear-gradient(140deg, #fdfaf2, #eef2f7);
  background:
    radial-gradient(1200px 600px at 10% 0%, oklch(97% 0.03 80 / 0.8), transparent 70%),
    radial-gradient(900px 500px at 90% 10%, oklch(96% 0.03 210 / 0.9), transparent 70%),
    linear-gradient(140deg, oklch(98% 0.02 80), oklch(94% 0.02 260));
  color: var(--ink);
  font-family: 'Spline Sans', 'Noto Sans SC', sans-serif;
  display: grid;
  grid-template-columns: minmax(260px, 1.1fr) minmax(320px, 0.95fr);
  gap: clamp(1.5rem, 4vw, 4rem);
  position: relative;
  overflow: hidden;
}

@supports (color: oklch(0% 0 0)) {
  .page {
    --ink: oklch(19% 0.03 260);
    --muted: oklch(44% 0.03 260);
    --paper: oklch(98% 0.015 80);
    --sea: oklch(70% 0.14 210);
    --sun: oklch(72% 0.16 55);
    --glow: oklch(86% 0.06 80);
    --line: oklch(86% 0.02 260);
    --shadow: 0 28px 60px oklch(20% 0.04 260 / 0.18);
  }
}

.page::before {
  content: '';
  position: absolute;
  inset: 10% -20% auto -20%;
  height: 320px;
  background:
    repeating-linear-gradient(90deg, rgba(217, 222, 232, 0.5) 0 1px, transparent 1px 24px),
    repeating-linear-gradient(0deg, rgba(217, 222, 232, 0.3) 0 1px, transparent 1px 24px);
  background:
    repeating-linear-gradient(90deg, oklch(86% 0.02 260 / 0.5) 0 1px, transparent 1px 24px),
    repeating-linear-gradient(0deg, oklch(86% 0.02 260 / 0.3) 0 1px, transparent 1px 24px);
  opacity: 0.4;
  pointer-events: none;
}

.atlas {
  position: relative;
  padding: clamp(1rem, 2vw, 2rem) 0;
  display: grid;
  gap: 1.5rem;
}

.eyebrow {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.26em;
  color: var(--muted);
}

h1 {
  font-family: 'Fraunces', 'Noto Serif SC', serif;
  font-size: clamp(2.6rem, 3.4vw, 4rem);
  line-height: 1.05;
  margin: 0;
}

.lead {
  font-size: clamp(1rem, 1.4vw, 1.25rem);
  color: var(--muted);
  max-width: 38ch;
  line-height: 1.7;
  margin: 0;
}

.atlas-grid {
  display: grid;
  gap: 0.9rem;
}

.atlas-card {
  padding: 1.1rem 1.2rem;
  background: #f6f1e7;
  background: color-mix(in oklch, var(--paper) 86%, var(--glow));
  border: 1px solid var(--line);
  border-radius: 16px;
  box-shadow: 0 10px 24px rgba(26, 31, 45, 0.08);
  box-shadow: 0 10px 24px oklch(20% 0.02 260 / 0.08);
}

.card-title {
  font-weight: 700;
  font-size: 1rem;
  margin-bottom: 0.4rem;
}

.card-body {
  font-size: 0.95rem;
  color: var(--muted);
  line-height: 1.6;
}

.compass {
  position: absolute;
  right: 12%;
  top: 5%;
  width: 160px;
  height: 160px;
  opacity: 0.7;
}

.compass-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px dashed rgba(90, 170, 190, 0.8);
  border: 1px dashed oklch(72% 0.08 210);
  box-shadow: inset 0 0 0 12px rgba(250, 245, 236, 0.6);
  box-shadow: inset 0 0 0 12px oklch(95% 0.02 80 / 0.4);
}

.compass-needle {
  position: absolute;
  width: 2px;
  height: 60%;
  background: linear-gradient(180deg, var(--sun), transparent 70%);
  left: 50%;
  top: 20%;
  transform: translateX(-50%) rotate(16deg);
  transform-origin: bottom center;
}

.fine-print {
  font-size: 0.85rem;
  color: var(--muted);
}

.panel {
  background: #fbf8f2;
  background: color-mix(in oklch, var(--paper) 92%, white);
  border-radius: 24px;
  padding: clamp(1.5rem, 3vw, 2.5rem);
  box-shadow: var(--shadow);
  border: 1px solid var(--line);
  display: grid;
  gap: 1.4rem;
  position: relative;
  overflow: hidden;
  container-type: inline-size;
}

.panel-head {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 1rem;
  align-items: center;
}

.panel-badges {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.badge {
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  background: #f0ece4;
  background: color-mix(in oklch, var(--paper) 85%, var(--glow));
  border: 1px solid var(--line);
}

.panel::after {
  content: '';
  position: absolute;
  inset: auto -40% 0 -40%;
  height: 120px;
  background: radial-gradient(closest-side, rgba(170, 218, 236, 0.6), transparent);
  background: radial-gradient(closest-side, oklch(90% 0.08 210 / 0.6), transparent);
  opacity: 0.4;
  pointer-events: none;
}

.panel-title {
  font-weight: 700;
  font-size: 1.2rem;
}

.panel-subtitle {
  color: var(--muted);
  font-size: 0.95rem;
}

.panel-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
  gap: 1.4rem;
  align-items: start;
  min-width: 0;
  box-sizing: border-box;
}

.panel-search {
  display: grid;
  gap: 1rem;
  min-width: 0;
}

.panel-results {
  display: grid;
  gap: 1rem;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}

.panel-notes {
  display: grid;
  gap: 0.6rem;
  padding: 0.9rem 1rem;
  border-radius: 16px;
  background: #f1f4f6;
  background: color-mix(in oklch, var(--paper) 80%, var(--sea));
  border: 1px dashed var(--line);
}

.note {
  font-size: 0.9rem;
  color: var(--muted);
}

.search {
  display: grid;
  gap: 0.8rem;
}

.field {
  display: grid;
  gap: 0.5rem;
}

.label {
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.control {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.8rem;
  padding: 0.4rem;
  border-radius: 16px;
  border: 1px solid var(--line);
  background: white;
  transition: border 0.2s ease, box-shadow 0.2s ease;
}

.control.invalid {
  border-color: #d06a6a;
  border-color: oklch(63% 0.2 25);
  box-shadow: 0 0 0 3px rgba(233, 160, 160, 0.35);
  box-shadow: 0 0 0 3px oklch(83% 0.14 25 / 0.2);
}

input {
  -webkit-appearance: none;
  appearance: none;
  -webkit-tap-highlight-color: transparent;
  border: none;
  background: transparent;
  font-size: 1rem;
  padding: 0.6rem 0.8rem;
  outline: none;
  font-family: inherit;
  color: var(--ink);
}

input::placeholder {
  color: #8a90a2;
  color: oklch(60% 0.03 260);
}

button {
  -webkit-appearance: none;
  appearance: none;
  -webkit-tap-highlight-color: transparent;
  font-family: inherit;
  border: none;
  border-radius: 999px;
  padding: 0.55rem 1.2rem;
  cursor: pointer;
  font-weight: 600;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  transform: none;
}

.primary {
  background: linear-gradient(120deg, var(--sea), var(--sun));
  color: #1b2332;
  color: oklch(15% 0.02 260);
  box-shadow: 0 10px 20px rgba(42, 95, 120, 0.18);
  box-shadow: 0 10px 20px oklch(30% 0.1 220 / 0.2);
}

.primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(42, 95, 120, 0.26);
  box-shadow: 0 12px 24px oklch(30% 0.1 220 / 0.3);
}

.secondary {
  background: #e4e7ee;
  background: oklch(92% 0.03 260);
  color: var(--ink);
}

.ghost {
  background: transparent;
  border: 1px solid var(--line);
  color: var(--ink);
}

.ghost.chosen {
  background: #d8edf5;
  background: oklch(88% 0.08 210);
  border-color: #7bb6c9;
  border-color: oklch(70% 0.12 210);
}

.field-error {
  color: #b14e4e;
  color: oklch(55% 0.18 25);
  font-size: 0.9rem;
}

.status {
  padding: 0.8rem 1rem;
  border-radius: 14px;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.loading {
  background: rgba(191, 225, 240, 0.6);
  background: oklch(92% 0.06 210 / 0.5);
  color: #2e596c;
  color: oklch(34% 0.08 210);
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--sea);
  animation: pulse 1.3s ease-in-out infinite;
}

.error {
  background: rgba(240, 188, 188, 0.5);
  background: oklch(92% 0.12 25 / 0.4);
  color: #933c3c;
  color: oklch(40% 0.18 25);
}

.candidates {
  display: grid;
  gap: 0.7rem;
  padding: 1rem;
  border-radius: 18px;
  border: 1px solid var(--line);
  background: rgba(250, 248, 243, 0.85);
  background: oklch(97% 0.02 80 / 0.6);
  width: 100%;
  box-sizing: border-box;
}

.candidates-head {
  font-weight: 600;
}

.candidate {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.8rem;
  align-items: center;
  padding-bottom: 0.8rem;
  border-bottom: 1px dashed var(--line);
  min-width: 0;
}

.candidate:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.candidate-main {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
}

.candidate-name {
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.candidate-meta {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  color: var(--muted);
  font-size: 0.9rem;
  min-width: 0;
}

.result {
  padding: 1.2rem;
  border-radius: 18px;
  border: 1px solid #9fcfe0;
  border: 1px solid oklch(78% 0.1 210);
  background: linear-gradient(135deg, #f2f8fb, #fefcf6);
  background: linear-gradient(135deg, oklch(96% 0.03 210), oklch(98% 0.01 80));
  display: grid;
  gap: 0.8rem;
  width: 100%;
  box-sizing: border-box;
}

.result-head {
  display: grid;
  gap: 0.3rem;
}

.result-title {
  font-weight: 700;
}

.result-city {
  color: var(--muted);
  font-size: 0.95rem;
}

.result-link {
  padding: 0.7rem 0.9rem;
  background: white;
  border-radius: 12px;
  border: 1px dashed #a3cde0;
  border: 1px dashed oklch(80% 0.1 210);
  font-family: 'Spline Sans', sans-serif;
  cursor: pointer;
  word-break: break-all;
  -webkit-tap-highlight-color: transparent;
}

.result-actions {
  display: flex;
  gap: 0.8rem;
  flex-wrap: wrap;
}

.hint {
  color: var(--muted);
  font-size: 0.85rem;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  background: #1f2433;
  background: oklch(26% 0.02 260);
  color: white;
  padding: 0.7rem 1.2rem;
  border-radius: 999px;
  font-size: 0.95rem;
  box-shadow: 0 12px 30px rgba(20, 26, 36, 0.35);
  box-shadow: 0 12px 30px oklch(20% 0.03 260 / 0.4);
  max-width: 90vw;
  max-width: min(640px, 90vw);
  text-align: center;
  pointer-events: none;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.35s ease, transform 0.35s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(0.8);
    opacity: 0.6;
  }
  50% {
    transform: scale(1);
    opacity: 1;
  }
}

@container (max-width: 520px) {
  .control {
    grid-template-columns: 1fr;
  }

  .primary {
    width: 100%;
  }

  .result-actions {
    flex-direction: column;
  }

  .panel-head {
    grid-template-columns: 1fr;
    justify-items: start;
  }

  .panel-badges {
    justify-content: flex-start;
  }

  .panel-body {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .control {
    grid-template-columns: 1fr;
  }

  .primary {
    width: 100%;
  }

  .result-actions {
    flex-direction: column;
  }

  .panel-head {
    grid-template-columns: 1fr;
    justify-items: start;
  }

  .panel-badges {
    justify-content: flex-start;
  }

  .panel-body {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 980px) {
  .page {
    grid-template-columns: 1fr;
  }

  .compass {
    position: relative;
    right: 0;
    top: 0;
    margin-top: 1rem;
  }

  .panel-head {
    grid-template-columns: 1fr;
    justify-items: start;
  }

  .panel-badges {
    justify-content: flex-start;
  }

  .panel-body {
    grid-template-columns: 1fr;
  }
}

@supports (-webkit-touch-callout: none) {
  @media (max-width: 980px) {
    .panel-body {
      display: flex;
      flex-direction: column;
    }

    .panel-search {
      order: 1;
    }

    .panel-results {
      order: 2;
    }
  }

  @media (max-width: 1180px) and (orientation: landscape) {
    .panel-body {
      display: flex;
      flex-direction: column;
    }

    .panel-search {
      order: 1;
    }

    .panel-results {
      order: 2;
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>

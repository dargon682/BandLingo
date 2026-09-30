// 词库双级检索模块（内存优化版 + 分类元数据筛选）
// 一级：高频常用词对象（global.dictionary，常驻 ~6万条，~3MB）——词性/考段见核心词库元数据
// 二级：完整词库按首字母分桶的资源文件（src/common/dict/full_{a..z}.txt，~16万条）
//       运行时按需异步读取单个桶（LRU 最多保留 6 桶，生僻词不常驻对象）
// 检索优化：首字母分桶 + 前缀二分下界定位、桶内高频优先（Top-K）、长度范围剪枝、
//           结果缓存（LRU）、Jaro-Winkler 错拼纠错、中文反查（复用 结果缓存 兜底）。
// 启动时仅加载一级对象，二级桶/元数据按需异步读取，避免启动 OOM。

import file from '@system.file'

// 二级词库/元数据：按首字母桶资源文件，运行时按需读取（由 tools/split_resources.js 生成）
let _fullRaw = {}
let _metaRaw = {}
const _fullLoading = {}
const _metaLoading = {}

// 全量词条数（二级桶总和），供统计展示
export const TOTAL_WORDS = 165563

function readBucket(kind, c0, cb) {
  file.readText({
    uri: '/common/dict/' + kind + '_' + c0 + '.txt',
    success: (d) => { cb(null, d.text) },
    fail: (err, code) => { cb(code) }
  })
}

// 异步预载一个首字母的 二级桶 + 元数据桶；已加载/加载中时立即回调（避免重复读文件）
export function preloadBucket(c0, cb) {
  c0 = (c0 || '').toLowerCase()
  if (!/^[a-z]$/.test(c0)) { if (cb) cb(); return }
  let pending = 0
  const done = () => { if (--pending === 0 && cb) cb() }
  if (!_fullRaw[c0] && !_fullLoading[c0]) {
    pending++
    _fullLoading[c0] = true
    readBucket('full', c0, (err, text) => {
      if (!err && text) _fullRaw[c0] = text
      _fullLoading[c0] = false
      done()
    })
  }
  if (!_metaRaw[c0] && !_metaLoading[c0]) {
    pending++
    _metaLoading[c0] = true
    readBucket('meta', c0, (err, text) => {
      if (!err && text) _metaRaw[c0] = text
      _metaLoading[c0] = false
      done()
    })
  }
  if (pending === 0) { if (cb) cb() }
}

// 桶数据访问（仅返回已加载的桶，未加载返回空对象）
function fullBuckets() { return _fullRaw }
function metaBuckets() { return _metaRaw }

const SEP_ENTRY = "\u0001" // 桶内词条分隔
const SEP_PAIR = "\u0002"  // 词/义分隔（命题值内部）
const SEP_POS = "\u0003"   // 义/词性分隔
const SEP_LEVEL = "\u0004" // 词性/考段分隔

const EMPTY = { pos: "", level: "" }

let _coreKeys = null            // 一级 keys 缓存（避免每次 Object.keys 重建）
let _coreSorted = null          // 一级 keys 排序缓存（用于二分前缀）
let _fullCache = {}             // 已解析的二级桶：{ c0: {word: {def,pos,level}} }
let _fullOrder = []             // LRU 访问顺序（尾部最近使用）
let _coreMetaCache = {}         // 一级元数据桶缓存：{ c0: {word:{pos,level}} }
let _resultCache = {}           // 检索结果 LRU（键: 查询+筛选游标）
let _resultOrder = []           // 结果 LRU 访问顺序
const MAX_FULL_BUCKETS = 6      // 二级桶 LRU 上限
const MAX_META_BUCKETS = 26     // 元数据桶（常驻，量小）
const MAX_RESULT = 12           // 检索结果 LRU 上限

// 读取一级对象（由 app.ux 挂载，避免重复打包）
function coreDict() {
  return (global && global.dictionary) || {}
}

// ---------- 二级桶：按需解析并提取 pos/level ----------
function parseFullEntryValue(rest) {
  // rest = "def\u0003pos\u0004level"（pos/level 可能为空）
  const iPos = rest.indexOf(SEP_POS)
  if (iPos < 0) return { def: rest, pos: "", level: "" }
  const def = rest.substring(0, iPos)
  const mid = rest.substring(iPos + 1)
  const iLv = mid.indexOf(SEP_LEVEL)
  if (iLv < 0) return { def: def, pos: mid, level: "" }
  return { def: def, pos: mid.substring(0, iLv), level: mid.substring(iLv + 1) }
}

export function ensureFullBucket(c0) {
  c0 = c0.toLowerCase()
  if (_fullCache[c0]) {
    const idx = _fullOrder.indexOf(c0)
    if (idx > -1) { _fullOrder.splice(idx, 1); _fullOrder.push(c0) }
    return _fullCache[c0]
  }
  const raw = fullBuckets()[c0]
  if (!raw) return null
  const obj = {}
  const entries = raw.split(SEP_ENTRY)
  for (let i = 0; i < entries.length; i++) {
    const pair = entries[i]
    const sep = pair.indexOf(SEP_PAIR)
    if (sep < 0) continue
    const word = pair.substring(0, sep)
    obj[word] = parseFullEntryValue(pair.substring(sep + 1))
  }
  _fullCache[c0] = obj
  _fullOrder.push(c0)
  while (_fullOrder.length > MAX_FULL_BUCKETS) {
    const oldest = _fullOrder.shift()
    _fullCache[oldest] = null
    delete _fullCache[oldest]
  }
  return obj
}

// ---------- 一级元数据桶：慵懒解析 ----------
function coreMetaBucket(c0) {
  if (_coreMetaCache[c0]) return _coreMetaCache[c0]
  const raw = metaBuckets()[c0]
  const obj = {}
  if (raw) {
    const entries = raw.split(SEP_ENTRY)
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      const iPos = e.indexOf(SEP_POS)
      if (iPos < 0) continue
      const word = e.substring(0, iPos)
      const mid = e.substring(iPos + 1)
      const iLv = mid.indexOf(SEP_LEVEL)
      obj[word] = iLv < 0
        ? { pos: mid, level: "" }
        : { pos: mid.substring(0, iLv), level: mid.substring(iLv + 1) }
    }
  }
  _coreMetaCache[c0] = obj
  return obj
}

// 查询单个单词的词性/考段（一级优先从 coreMeta，二级从已解析桶）
export function getPosLevel(word) {
  const key = (word || "").toLowerCase()
  if (!key) return EMPTY
  const core = coreDict()
  if (core[key]) {
    const m = coreMetaBucket(key.charAt(0))[key]
    return (m && (m.pos || m.level)) ? m : EMPTY
  }
  const c0 = key.charAt(0)
  if (!/^[a-z]$/.test(c0)) return EMPTY
  const bucket = ensureFullBucket(c0)
  if (bucket && bucket[key]) {
    return { pos: bucket[key].pos || "", level: bucket[key].level || "" }
  }
  return EMPTY
}

// ---------- 精确查找（兼容：返回 {word, definition, pos?, level?}） ----------
export function exactLookup(word) {
  const key = (word || "").toLowerCase()
  if (!key) return null
  const core = coreDict()
  if (core[key]) {
    const m = coreMetaBucket(key.charAt(0))[key]
    return { word: key, definition: core[key], pos: (m&&m.pos)||"", level: (m&&m.level)||"" }
  }
  const c0 = key.charAt(0)
  if (!/^[a-z]$/.test(c0)) return null
  const bucket = ensureFullBucket(c0)
  if (bucket && bucket[key]) {
    return { word: key, definition: bucket[key].def, pos: bucket[key].pos||"", level: bucket[key].level||"" }
  }
  return null
}

// ---------- keys 缓存 ----------
export function getKeys() {
  if (_coreKeys) return _coreKeys
  _coreKeys = Object.keys(coreDict())
  return _coreKeys
}

// 一级 keys 排序缓存（二分前缀用）
export function getSortedKeys() {
  if (_coreSorted) return _coreSorted
  _coreSorted = getKeys().slice().sort()
  return _coreSorted
}

// 前缀二分下界：返回第一个 >= prefix 的位置（此后需判断是否真正以 prefix 开头）
export function binaryPrefixStart(sortedKeys, prefix) {
  let lo = 0, hi = sortedKeys.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sortedKeys[mid] < prefix) lo = mid + 1
    else hi = mid
  }
  return lo
}

// ---------- 前缀检索（核心）：二分定位起点 + 长度剪枝 + Top-K ----------
// opts: { max, maxLen, coreOnly }  —— 返回 { word, definition, pos, level }，按字典序截断为 Top-K
export function searchByPrefix(prefix, opts) {
  const p = (prefix || "").toLowerCase().replace(/[^a-z]/g, "")
  if (!p) return []
  const max = (opts && opts.max) || 50
  const maxLen = (opts && opts.maxLen) || 999
  const sortedKeys = getSortedKeys()
  let i = binaryPrefixStart(sortedKeys, p)
  const out = []
  for (; i < sortedKeys.length && out.length < max; i++) {
    const key = sortedKeys[i]
    if (key.length > maxLen) continue
    if (key.lastIndexOf(p, 0) !== 0) break
    out.push({ word: key, definition: coreDict()[key], pos: getPosLevel(key).pos, level: getPosLevel(key).level })
  }
  // 补充二级同首字母桶（生僻词，按桶内顺序即词频 Top-K）
  const c0 = p.charAt(0)
  if (!(opts && opts.coreOnly) && out.length < max) {
    const bucket = ensureFullBucket(c0)
    if (bucket) {
      const iter = Object.keys(bucket)
      for (let k = 0; k < iter.length && out.length < max; k++) {
        const w = iter[k]
        if (coreDict()[w]) continue
        if (w.length > maxLen) continue
        if (w.lastIndexOf(p, 0) !== 0) continue
        out.push({ word: w, definition: bucket[w].def, pos: bucket[w].pos||"", level: bucket[w].level||"" })
      }
    }
  }
  return out
}

// ---------- 检索结果 LRU 缓存（去抖/重复查询秒回） ----------
export function cacheGet(k) { return _resultCache[k] }
export function cachePut(k, v) {
  _resultCache[k] = v
  _resultOrder.push(k)
  while (_resultOrder.length > MAX_RESULT) {
    const oldest = _resultOrder.shift()
    delete _resultCache[oldest]
  }
}

// ---------- Jaro-Winkler 相似度 ----------
export function jaroWinkler(a, b) {
  if (a === b) return 1
  if (!a || !b) return 0
  const aLen = a.length, bLen = b.length
  if (aLen === 0 || bLen === 0) return 0
  const matchDist = Math.floor(Math.max(aLen, bLen) / 2) - 1
  const aMatch = [], bMatch = []
  for (let i = 0; i < aLen; i++) aMatch[i] = false
  for (let i = 0; i < bLen; i++) bMatch[i] = false
  let matches = 0
  for (let i = 0; i < aLen; i++) {
    const lo = Math.max(0, i - matchDist)
    const hi = Math.min(i + matchDist + 1, bLen)
    for (let j = lo; j < hi; j++) {
      if (bMatch[j]) continue
      if (a[i] !== b[j]) continue
      aMatch[i] = true
      bMatch[j] = true
      matches++
      break
    }
  }
  if (matches === 0) return 0
  let transpositions = 0, k = 0
  for (let i = 0; i < aLen; i++) {
    if (!aMatch[i]) continue
    while (!bMatch[k]) k++
    if (a[i] !== b[k]) transpositions++
    k++
  }
  transpositions /= 2
  const m = matches
  const jaro = (m / aLen + m / bLen + (m - transpositions) / m) / 3
  // Winkler 前缀加成
  let prefix = 0
  const maxP = Math.min(aLen, bLen, 4)
  while (prefix < maxP && a[prefix] === b[prefix]) prefix++
  return jaro + prefix * 0.1 * (1 - jaro)
}

// 错拼纠错：无命中时在「同首字母 + 长度接近」的一级词中找最相似词
export function suggestFuzzy(word, threshold) {
  const term = (word || "").toLowerCase().replace(/[^a-z]/g, "")
  if (!term || term.length < 2) return null
  const th = threshold || 0.80
  const c0 = term.charAt(0)
  const sortedKeys = getSortedKeys()
  let best = null, bestScore = 0
  const lo = binaryPrefixStart(sortedKeys, c0)
  const hi = binaryPrefixStart(sortedKeys, String.fromCharCode(c0.charCodeAt(0) + 1))
  for (let i = lo; i < hi; i++) {
    const key = sortedKeys[i]
    if (Math.abs(key.length - term.length) > 2) continue
    const sc = jaroWinkler(term, key)
    if (sc > bestScore) { bestScore = sc; best = key }
  }
  return (best && bestScore >= th) ? best : null
}

// ---------- 二/一级桶清理 ----------
export function clearCache() {
  _fullCache = {}
  _fullOrder = []
  _coreKeys = null
  _coreSorted = null
}

export function fullCacheInfo() {
  return { cached: Object.keys(_fullCache), order: _fullOrder.slice() }
}
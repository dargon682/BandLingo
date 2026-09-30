// 词库检索模块（全资源文件化，启动零大对象）
// 一级：高频常用词按首字母分桶资源文件（src/common/dict/tier1_{a..z}.txt，~6万条）
// 二级：完整词库按首字母分桶资源文件（src/common/dict/full_{a..z}.txt，~16万条）
// 元数据：词性/考段按首字母分桶资源文件（src/common/dict/meta_{a..z}.txt）
// 全部桶均运行时按需异步读取（LRU 限制解析后对象常驻数量），
// 启动不再挂载任何大词库对象，避免低内存设备启动 OOM 崩溃/反复重启。
// 检索优化：首字母分桶 + 桶内前缀二分下界定位、桶内高频优先（Top-K）、长度范围剪枝、
//           结果缓存（LRU）、Jaro-Winkler 错拼纠错、中文反查（仅扫已加载桶，兜底）。

import file from '@system.file'

// ---------- 桶原始文本缓存（按需异步读取） ----------
let _tier1Raw = {}
let _fullRaw = {}
let _metaRaw = {}
const _tier1Loading = {}
const _fullLoading = {}
const _metaLoading = {}

// 全量词条数（二级桶总和），供统计展示
export const TOTAL_WORDS = 165563

const SEP_ENTRY = "\u0001" // 桶内词条分隔
const SEP_PAIR = "\u0002"  // 词/义分隔
const SEP_POS = "\u0003"   // 义/词性分隔
const SEP_LEVEL = "\u0004" // 词性/考段分隔

const EMPTY = { pos: "", level: "" }

// 解析后对象缓存 + LRU
let _tier1Cache = {}          // { c0: {word: def} }
let _tier1Order = []
let _tier1Sorted = {}         // { c0: [words sorted] } 桶内二分用
let _fullCache = {}           // { c0: {word: {def,pos,level}} }
let _fullOrder = []
let _metaCache = {}           // { c0: {word: {pos,level}} }
let _metaOrder = []
let _resultCache = {}         // 检索结果 LRU（键: 查询+筛选游标）
let _resultOrder = []

// LRU 上限（解析后对象常驻桶数，控制运行时内存峰值）
const MAX_TIER1_BUCKETS = 4
const MAX_FULL_BUCKETS = 3
const MAX_META_BUCKETS = 6
const MAX_RESULT = 12

function readBucket(kind, c0, cb) {
  file.readText({
    uri: '/common/dict/' + kind + '_' + c0 + '.txt',
    success: (d) => { cb(null, d.text) },
    fail: (err, code) => { cb(code) }
  })
}

// 异步预载一个首字母的 一级桶 + 二级桶 + 元数据桶；已加载/加载中时立即回调
export function preloadBucket(c0, cb) {
  c0 = (c0 || '').toLowerCase()
  if (!/^[a-z]$/.test(c0)) { if (cb) cb(); return }
  let pending = 0
  const done = () => { if (--pending === 0 && cb) cb() }
  const ensure = (kind, raw, loading) => {
    if (!raw[c0] && !loading[c0]) {
      pending++
      loading[c0] = true
      readBucket(kind, c0, (err, text) => {
        if (!err && text) raw[c0] = text
        loading[c0] = false
        done()
      })
    }
  }
  ensure('tier1', _tier1Raw, _tier1Loading)
  ensure('full', _fullRaw, _fullLoading)
  ensure('meta', _metaRaw, _metaLoading)
  if (pending === 0) { if (cb) cb() }
}

// LRU 登记（逐出最旧桶）
function lruPush(order, cache, key, max) {
  const idx = order.indexOf(key)
  if (idx > -1) order.splice(idx, 1)
  order.push(key)
  while (order.length > max) {
    const oldest = order.shift()
    delete cache[oldest]
  }
}

// ---------- 一级桶：{word: def} ----------
function tier1Bucket(c0) {
  if (_tier1Cache[c0]) { lruPush(_tier1Order, _tier1Cache, c0, MAX_TIER1_BUCKETS); return _tier1Cache[c0] }
  const raw = _tier1Raw[c0]
  if (!raw) return null
  const obj = {}
  const entries = raw.split(SEP_ENTRY)
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    const sep = e.indexOf(SEP_PAIR)
    if (sep < 0) continue
    obj[e.substring(0, sep)] = e.substring(sep + 1)
  }
  _tier1Cache[c0] = obj
  lruPush(_tier1Order, _tier1Cache, c0, MAX_TIER1_BUCKETS)
  return obj
}

// 一级桶排序 keys（桶内二分用）
function tier1SortedKeys(c0) {
  if (_tier1Sorted[c0]) return _tier1Sorted[c0]
  const b = tier1Bucket(c0)
  if (!b) return null
  _tier1Sorted[c0] = Object.keys(b).sort()
  return _tier1Sorted[c0]
}

// 一级命中（仅查已加载桶；未加载返回 null，由 preloadBucket 保证加载）
function tier1Hit(key) {
  const b = tier1Bucket(key.charAt(0))
  if (!b) return null
  return Object.prototype.hasOwnProperty.call(b, key) ? b[key] : null
}

// ---------- 二级桶：按需解析并提取 pos/level ----------
function parseFullEntryValue(rest) {
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
  if (_fullCache[c0]) { lruPush(_fullOrder, _fullCache, c0, MAX_FULL_BUCKETS); return _fullCache[c0] }
  const raw = _fullRaw[c0]
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
  lruPush(_fullOrder, _fullCache, c0, MAX_FULL_BUCKETS)
  return obj
}

// ---------- 元数据桶：懒解析 + LRU ----------
function metaBucket(c0) {
  if (_metaCache[c0]) { lruPush(_metaOrder, _metaCache, c0, MAX_META_BUCKETS); return _metaCache[c0] }
  const raw = _metaRaw[c0]
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
  _metaCache[c0] = obj
  lruPush(_metaOrder, _metaCache, c0, MAX_META_BUCKETS)
  return obj
}

// 查询单个单词的词性/考段（一级优先 coreMeta，二级从已解析桶）
export function getPosLevel(word) {
  const key = (word || "").toLowerCase()
  if (!key) return EMPTY
  if (tier1Hit(key)) {
    const m = metaBucket(key.charAt(0))[key]
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

// 查询单词释义（一级/二级桶；未加载桶返回空串）
export function getDefinition(word) {
  const key = (word || "").toLowerCase()
  if (!key) return ""
  const c0 = key.charAt(0)
  if (!/^[a-z]$/.test(c0)) return ""
  const def = tier1Hit(key)
  if (def != null) return def
  const bucket = ensureFullBucket(c0)
  if (bucket && bucket[key]) return bucket[key].def
  return ""
}

// ---------- 精确查找 ----------
export function exactLookup(word) {
  const key = (word || "").toLowerCase()
  if (!key) return null
  const def = tier1Hit(key)
  if (def != null) {
    const m = metaBucket(key.charAt(0))[key]
    return { word: key, definition: def, pos: (m && m.pos) || "", level: (m && m.level) || "" }
  }
  const c0 = key.charAt(0)
  if (!/^[a-z]$/.test(c0)) return null
  const bucket = ensureFullBucket(c0)
  if (bucket && bucket[key]) {
    return { word: key, definition: bucket[key].def, pos: bucket[key].pos || "", level: bucket[key].level || "" }
  }
  return null
}

// ---------- keys（已加载一级桶的并集，供遍历/反查） ----------
export function getKeys() {
  const out = []
  for (const c0 of Object.keys(_tier1Cache)) {
    const b = _tier1Cache[c0]
    if (!b) continue
    for (const k of Object.keys(b)) out.push(k)
  }
  return out
}

// 兼容导出：已加载一级桶 keys 排序并集
export function getSortedKeys() {
  return getKeys().sort()
}

// 前缀二分下界：返回第一个 >= prefix 的位置
export function binaryPrefixStart(sortedKeys, prefix) {
  let lo = 0, hi = sortedKeys.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sortedKeys[mid] < prefix) lo = mid + 1
    else hi = mid
  }
  return lo
}

// ---------- 前缀检索：桶内二分 + 长度剪枝 + Top-K（含二级生僻桶兜底） ----------
export function searchByPrefix(prefix, opts) {
  const p = (prefix || "").toLowerCase().replace(/[^a-z]/g, "")
  if (!p) return []
  const max = (opts && opts.max) || 50
  const maxLen = (opts && opts.maxLen) || 999
  const c0 = p.charAt(0)
  const out = []
  // 一级桶内二分
  const sorted = tier1SortedKeys(c0)
  if (sorted) {
    const b = tier1Bucket(c0)
    const m = metaBucket(c0)
    let i = binaryPrefixStart(sorted, p)
    for (; i < sorted.length && out.length < max; i++) {
      const key = sorted[i]
      if (key.length > maxLen) continue
      if (key.lastIndexOf(p, 0) !== 0) break
      out.push({ word: key, definition: b[key], pos: (m[key] && m[key].pos) || "", level: (m[key] && m[key].level) || "" })
    }
  }
  // 补充二级同首字母桶（生僻词，按桶内顺序即词频 Top-K）
  if (!(opts && opts.coreOnly) && out.length < max) {
    const bucket = ensureFullBucket(c0)
    if (bucket) {
      const iter = Object.keys(bucket)
      for (let k = 0; k < iter.length && out.length < max; k++) {
        const w = iter[k]
        if (tier1Hit(w)) continue
        if (w.length > maxLen) continue
        if (w.lastIndexOf(p, 0) !== 0) continue
        out.push({ word: w, definition: bucket[w].def, pos: bucket[w].pos || "", level: bucket[w].level || "" })
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
  let prefix = 0
  const maxP = Math.min(aLen, bLen, 4)
  while (prefix < maxP && a[prefix] === b[prefix]) prefix++
  return jaro + prefix * 0.1 * (1 - jaro)
}

// 错拼纠错：无命中时在「同首字母一级桶」中找最相似词
export function suggestFuzzy(word, threshold) {
  const term = (word || "").toLowerCase().replace(/[^a-z]/g, "")
  if (!term || term.length < 2) return null
  const th = threshold || 0.80
  const c0 = term.charAt(0)
  const sorted = tier1SortedKeys(c0)
  if (!sorted) return null
  let best = null, bestScore = 0
  const lo = binaryPrefixStart(sorted, c0)
  const hi = binaryPrefixStart(sorted, String.fromCharCode(c0.charCodeAt(0) + 1))
  for (let i = lo; i < hi; i++) {
    const key = sorted[i]
    if (Math.abs(key.length - term.length) > 2) continue
    const sc = jaroWinkler(term, key)
    if (sc > bestScore) { bestScore = sc; best = key }
  }
  return (best && bestScore >= th) ? best : null
}

// ---------- 桶缓存清理 ----------
export function clearCache() {
  _tier1Cache = {}
  _tier1Order = []
  _tier1Sorted = {}
  _fullCache = {}
  _fullOrder = []
  _metaCache = {}
  _metaOrder = []
}

export function fullCacheInfo() {
  return { tier1: _tier1Order.slice(), full: _fullOrder.slice(), meta: _metaOrder.slice() }
}

/**
 * 拆分词库大常量为按首字母分桶的资源文件（.txt）
 * 目的：一级/二级词库与元数据不再以 JS 常量进入 app.jsc，
 *       避免启动时一次性解析大对象导致设备 OOM 崩溃。
 * 产物：src/common/dict/{tier1,full,meta}_{a..z}.txt（共 78 个）
 */
const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'src', 'common')
const OUT = path.join(SRC, 'dict')

// 按变量名提取 'export const NAME = {...};' 中的对象字面量
function loadConst(file, varName) {
  const src = fs.readFileSync(file, 'utf8')
  const m = src.match(new RegExp('export const ' + varName + '\\s*=\\s*\\{([\\s\\S]*?)\\};'))
  if (!m) throw new Error('not found: ' + varName)
  return new Function('return ({' + m[1] + '})')()
}

const SEP_PAIR = "\u0002" // 词/义分隔（与 dictionaryIndex.js 保持一致）

const full = loadConst(path.join(SRC, 'dictionaryFull.js'), 'DICT_FULL_BUCKETS')
const meta = loadConst(path.join(SRC, 'coreMeta.js'), 'CORE_META_BUCKETS')
const tier1 = loadConst(path.join(SRC, 'dictionary.js'), 'dictionary')

// 对象 -> 桶内紧凑字符串：词\u0002义 用 \u0001 分隔
function serialize(obj) {
  const parts = []
  for (const k of Object.keys(obj)) {
    parts.push(k + SEP_PAIR + obj[k])
  }
  return parts.join("\u0001")
}

fs.mkdirSync(OUT, { recursive: true })
let nFull = 0
let nMeta = 0
let nTier1 = 0
for (const c0 of 'abcdefghijklmnopqrstuvwxyz') {
  if (full[c0]) {
    fs.writeFileSync(path.join(OUT, 'full_' + c0 + '.txt'), full[c0], 'utf8')
    nFull++
  }
  if (meta[c0]) {
    fs.writeFileSync(path.join(OUT, 'meta_' + c0 + '.txt'), meta[c0], 'utf8')
    nMeta++
  }
  // 一级词库按首字母分桶（与原 dictionary.js 保持一致；value 即释义）
  const tier1Buckets = {}
  for (const k of Object.keys(tier1)) {
    const c = k.charAt(0).toLowerCase()
    if (!/^[a-z]$/.test(c)) continue
    if (!tier1Buckets[c]) tier1Buckets[c] = {}
    tier1Buckets[c][k] = tier1[k]
  }
  if (tier1Buckets[c0]) {
    fs.writeFileSync(path.join(OUT, 'tier1_' + c0 + '.txt'), serialize(tier1Buckets[c0]), 'utf8')
    nTier1++
  }
}
console.log('tier1 buckets:', nTier1, ' full buckets:', nFull, ' meta buckets:', nMeta)
console.log('output:', OUT)

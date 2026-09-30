/**
 * 拆分词库大常量为按首字母分桶的资源文件（.txt）
 * 目的：二级词库/元数据不再以 JS 常量进入 app.jsc，
 *       避免启动时一次性解析 10MB+ 字符串导致设备 OOM 崩溃。
 * 产物：src/common/dict/{full,meta}_{a..z}.txt（共 52 个）
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

const full = loadConst(path.join(SRC, 'dictionaryFull.js'), 'DICT_FULL_BUCKETS')
const meta = loadConst(path.join(SRC, 'coreMeta.js'), 'CORE_META_BUCKETS')

fs.mkdirSync(OUT, { recursive: true })
let nFull = 0
let nMeta = 0
for (const c0 of 'abcdefghijklmnopqrstuvwxyz') {
  if (full[c0]) {
    fs.writeFileSync(path.join(OUT, 'full_' + c0 + '.txt'), full[c0], 'utf8')
    nFull++
  }
  if (meta[c0]) {
    fs.writeFileSync(path.join(OUT, 'meta_' + c0 + '.txt'), meta[c0], 'utf8')
    nMeta++
  }
}
console.log('full buckets:', nFull, ' meta buckets:', nMeta)
console.log('output:', OUT)

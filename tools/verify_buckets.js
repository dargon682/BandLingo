// 验证：桶资源文件能被 dictionaryIndex 的解析逻辑正确读取
const fs = require('fs')
const path = require('path')

const DICT_DIR = path.join(__dirname, '..', 'src', 'common', 'dict')
const SEP_ENTRY = '\u0001'
const SEP_PAIR = '\u0002'
const SEP_POS = '\u0003'
const SEP_LEVEL = '\u0004'

function parseFullEntryValue(rest) {
  const iPos = rest.indexOf(SEP_POS)
  if (iPos < 0) return { def: rest, pos: '', level: '' }
  const def = rest.substring(0, iPos)
  const mid = rest.substring(iPos + 1)
  const iLv = mid.indexOf(SEP_LEVEL)
  if (iLv < 0) return { def: def, pos: mid, level: '' }
  return { def: def, pos: mid.substring(0, iLv), level: mid.substring(iLv + 1) }
}

function parseBucket(kind, c0) {
  const raw = fs.readFileSync(path.join(DICT_DIR, kind + '_' + c0 + '.txt'), 'utf8')
  const obj = {}
  const entries = raw.split(SEP_ENTRY)
  for (let i = 0; i < entries.length; i++) {
    const pair = entries[i]
    const sep = pair.indexOf(SEP_PAIR)
    if (sep < 0) continue
    const word = pair.substring(0, sep)
    obj[word] = parseFullEntryValue(pair.substring(sep + 1))
  }
  return obj
}

// 二级桶抽查
const a = parseBucket('full', 'a')
console.log('full_a 词条数:', Object.keys(a).length)
console.log('full_a affordable:', JSON.stringify(a['affordable']))
console.log('full_a 无元数据词 sample:', JSON.stringify(a['analog']))

const z = parseBucket('full', 'z')
console.log('full_z zone:', JSON.stringify(z['zone']))

// 元数据桶抽查（word\u0003pos\u0004level）
const metaA = fs.readFileSync(path.join(DICT_DIR, 'meta_a.txt'), 'utf8')
const metaEntries = metaA.split(SEP_ENTRY)
const m = {}
for (let i = 0; i < metaEntries.length; i++) {
  const e = metaEntries[i]
  const ip = e.indexOf(SEP_POS)
  if (ip < 0) continue
  const w = e.substring(0, ip)
  const mid = e.substring(ip + 1)
  const il = mid.indexOf(SEP_LEVEL)
  m[w] = il < 0 ? { pos: mid, level: '' } : { pos: mid.substring(0, il), level: mid.substring(il + 1) }
}
console.log('meta_a 词条数:', Object.keys(m).length)
console.log('meta_a and:', JSON.stringify(m['and']))
console.log('meta_a about:', JSON.stringify(m['about']))

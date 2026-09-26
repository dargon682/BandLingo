// 收藏夹统一操作模块（单一事实来源：searchResult / detail / favorites 共用）
// 所有收藏的读写/增删集中于此，保证存储格式一致、异常处理统一
import storage from "../storage"

const KEY = 'favorites'

// 安全读取收藏列表（损坏数据返回空数组）
export function readFavorites() {
  let list = []
  try {
    const data = storage.getSync({ key: KEY, default: '' })
    if (data) list = JSON.parse(data)
  } catch (e) {
    list = []
  }
  return Array.isArray(list) ? list : []
}

// 保存收藏列表，成功返回 true
export function saveFavorites(list) {
  try {
    storage.setSync({ key: KEY, value: JSON.stringify(list) })
    return true
  } catch (e) {
    return false
  }
}

// 查询单词是否已收藏
export function isFavorite(word) {
  return readFavorites().some(item => item.word === word)
}

// 切换收藏状态：返回切换后是否处于已收藏
export function toggleFavorite(word, definition) {
  const list = readFavorites()
  const idx = list.findIndex(item => item.word === word)
  if (idx >= 0) {
    list.splice(idx, 1)
    saveFavorites(list)
    return false
  }
  list.push({ word, definition: definition || '', addedTime: Date.now() })
  saveFavorites(list)
  return true
}

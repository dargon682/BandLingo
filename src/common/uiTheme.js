// UI 主题配置（单一事实来源：结果卡片配色 / 渐变底图 / 样式名映射）
// 新增 UI 样式时，在此登记样式名与名称，并在 searchResult.ux 模板中补充对应结构

// 彩色卡片背景色轮换（柔和深色系，保证白字可读性）
export const CARD_COLORS = [
  '#4A3828', // 柔和深棕
  '#2A3A3A', // 柔和深青灰
  '#3A3050', // 柔和深紫灰
  '#2A4A38', // 柔和深绿灰
  '#5A4828', // 柔和深金灰
  '#4A2848', // 柔和深洋红灰
  '#3A4830', // 柔和橄榄灰
  '#4A4038'  // 柔和深卡其灰
]

// 渐变卡片底图轮换
export const GRADIENT_IMAGES = [
  '/common/lightblue.png',
  '/common/lightgreen.png',
  '/common/lightpurple.png',
  '/common/lightpink.png',
  '/common/lightyellow.png'
]

// UI 样式键 → 显示名称
export const UI_STYLE_NAMES = {
  classic: '经典样式',
  colorful: '彩色小卡片',
  gradient: '渐变小卡片'
}

export const UI_STYLE_DEFAULT = 'classic'

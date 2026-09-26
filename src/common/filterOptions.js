// 分类筛选统一配置（单一事实来源：搜索筛选栏、结果元数据显示共用）
// 新增词性/考段档位时，只需在此扩展，各页面自动生效

// 词性筛选项：'' 表示"全部"（cycle 首项）
export const POS_OPTIONS = ['', 'n', 'v', 'adj', 'adv', 'conj', 'prep', 'pron', 'num', 'abbr', 'phr', 'interj', 'aux', 'art']

export const POS_LABELS = {
  '': '全部',
  n: '名词',
  v: '动词',
  adj: '形容词',
  adv: '副词',
  conj: '连词',
  prep: '介词',
  pron: '代词',
  num: '数词',
  abbr: '缩写',
  phr: '短语',
  interj: '叹词',
  aux: '助动词',
  art: '冠词'
}

// 考段筛选项：'' 表示"全部"
export const LEVEL_OPTIONS = ['', 'basic', 'middle', 'high', 'advanced']

export const LEVEL_LABELS = {
  '': '全部',
  basic: '中考以下',
  middle: '中考',
  high: '高考',
  advanced: '高考以上'
}

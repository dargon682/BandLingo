# BandLingo Pro（腕上词典 Pro）

**腕上词典 Pro** 是专为小米 Vela 穿戴设备（手环/手表快应用）打造的**离线英语词典与词汇学习工具**，利用碎片化时间，在腕上轻松查词、记忆单词。

- 版本：`1.1-beta`（versionCode 2）
- 平台：小米 Vela 快应用（watch，minPlatformVersion ≥ 1000）
- 协议：GNU GPL v3.0

---

## 核心特性

### 1. 双级离线词库（内存安全）
| 级别 | 规模 | 策略 |
|------|------|------|
| 一级（`dictionary.js`） | 6 万高频常用词 | 常驻内存（约 3MB），保证冷启动即查 |
| 二级（`dict/full_*.txt`） | 16.5 万全量词条 | 按首字母分桶**资源文件**，运行时按需异步读取单个桶 + LRU 缓存（仅保留 6 桶） |

总词条量约 **22.5 万**。二级词库与元数据已从 JS 常量拆分为 52 个按首字母分桶的资源文件（`src/common/dict/`），启动时不再一次性解析大字符串，避免低内存设备启动 OOM（app.jsc 由 14MB 降至 3.1MB）。

### 2. 词条分类（词性 × 考段）
- **词性 14 类**：名词 / 动词 / 形容词 / 副词 / 连词 / 介词 / 代词 / 数词 / 缩写 / 短语 / 叹词 / 助动词 / 冠词等
- **考段 4 档**：`中考以下 / 中考 / 高考 / 高考以上`（基于 ECDICT 标签严格映射：zk→中考、gk→高考、cet4/cet6/toefl/ielts/gre 等→高考以上、无标签高频词→中考以下）
- 元数据来源：词性提取自释义前缀，考段映射自 ECDICT tag 字段，经 `tools/gen_dualtier.py` 生成

### 3. 筛选式检索
- 搜索结果页顶部**分类筛选栏**：词性 / 考段循环切换 + 一键重置
- 筛选作用于检索结果集，实时生效（非全库扫描）
- 结果按 UI 样式渲染（经典列表 / 彩色卡片 / 渐变卡片），支持惰性分页

### 4. 检索性能优化
- 首字母索引 + 前缀二分下界定位（O(n) → O(log n + k)）
- 高频 Top-K 预计算，避免实时全量排序
- 长度范围剪枝，减少无效匹配
- LRU 结果缓存 + 输入去抖，重复查询秒回
- Jaro-Winkler 错拼纠错，输入错误时给出相似词建议
- 中文→英文线性反查 + 惰性分页渲染

### 5. 词汇学习辅助
- 词形变换（过去式/分词/复数/比较级等，正反查）
- 收藏夹、生词本（自定义添加）、学习统计、存储管理（备份/恢复）
- 自绘多语言输入键盘（英/中/数字/符号）
- AI 辅助释义（可选，联网）

---

## 目录结构

```
BandLingo/
├── src/
│   ├── app.ux                  # 应用入口：全局字典挂载、存储封装、定时器管理
│   ├── manifest.json           # 应用配置与路由
│   ├── storage.js              # 存储封装
│   ├── common/                 # 公共模块
│   │   ├── dictionary.js       # 一级高频词库（6万，常驻）
│   │   ├── dictionaryFull.js   # 二级全量词库源文件（生成产物，勿手工改）
│   │   ├── coreMeta.js         # 一级词条元数据源文件（生成产物，勿手工改）
│   │   ├── dict/               # 词库资源（split_resources.js 生成，52 个桶文件，勿手工改）
│   │   │   ├── full_a.txt … full_z.txt   # 二级全量词库按首字母分桶
│   │   │   └── meta_a.txt … meta_z.txt   # 一级词条元数据按首字母分桶
│   │   ├── dictionaryIndex.js  # 双级检索核心（索引/缓存/纠错/筛选/桶异步加载）
│   │   ├── favorites.js        # 收藏统一操作模块（单一事实来源）
│   │   ├── filterOptions.js    # 词性/考段筛选项配置（单一事实来源）
│   │   ├── uiTheme.js          # UI 样式配置（卡片色/渐变图/样式名）
│   │   ├── wordForms.js / reverseWordForms.js  # 词形变换正反查
│   │   ├── aiService.js        # AI 释义服务
│   │   ├── performanceTest.js  # 性能测试工具
│   │   └── responsive.ux       # 多屏适配样式
│   ├── components/InputMethod/ # 自绘输入键盘
│   ├── pages/                  # 页面
│   │   ├── index/              # 首页（搜索入口）
│   │   ├── searchResult/       # 搜索结果（分类筛选栏）
│   │   ├── detail/             # 词条详情（词性/考段胶囊、收藏、词形）
│   │   ├── favorites/          # 收藏夹
│   │   ├── addWord/            # 生词本
│   │   ├── settings/           # 设定（UI 样式切换）
│   │   ├── uiStyle/            # UI 样式选择
│   │   ├── wordStats/          # 学习统计
│   │   ├── storage/            # 存储管理
│   │   ├── donate/             # 捐赠
│   │   └── about/              # 关于
│   └── i18n/                   # 多语言
└── tools/
    ├── split_resources.js      # 词库资源拆分器（dictionaryFull/coreMeta → dict/*.txt 52 桶）
    └── verify_buckets.js       # 词库资源校验脚本（验证桶文件词条/元数据解析正确）
```

---

## 构建与使用

### 普通用户
前往表盘自定义 / AstroBox / 米坛社区搜索下载 RPK 安装包即可使用。

### 开发者
1. 克隆本仓库；
2. 使用 **AIoT-IDE** 打开项目；
3. 运行 `npm install` 安装依赖；
4. `npm run build` 构建，或 `npm run release` 生成启用 JSC 的发布包；
5. 连接设备安装调试。

> 注意：`dictionary.js` / `dictionaryFull.js` / `coreMeta.js` 为生成产物，由 `tools/gen_dualtier.py` 基于 ECDICT 词库生成，勿手工修改。

---

## 版本历史

| 版本 | 说明 |
|------|------|
| 1.1-beta | 修复反复启动崩溃/系统异常：二级词库与元数据资源文件化，启动仅加载 3.1MB 一级词（app.jsc 14MB→3.1MB），按首字母异步按需读桶 + LRU 缓存（最多 6 桶）；新增词条分类（词性 14 类 × 考段 4 档）与筛选式检索；检索逻辑全面优化（前缀二分、LRU 缓存、错拼纠错、惰性分页）；公共模块收敛（favorites / filterOptions / uiTheme 单一事实来源）；详情页展示词性/考段；UI 一致性优化 |
| 1.0.x | 双级离线词库与基础检索、收藏、生词本、学习统计等核心功能 |

---

## 联系与反馈

- 作者：@LR.C
- QQ：3590283241
- 米坛账号：[https://www.bandbbs.cn/members/1397083/](https://www.bandbbs.cn/members/1397083/)

## 开源协议

本项目基于 **GNU General Public License v3.0 (GPLv3)** 协议开源。
这意味着你可以自由使用和修改本代码，但任何基于本项目的衍生作品在发布时必须同样以 GPLv3 协议保持开源。
详情请参阅 [LICENSE](LICENSE) 文件。

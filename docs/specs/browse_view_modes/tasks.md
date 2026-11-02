# 编码任务分解：共享目录浏览多视图模式切换

> **文档编号**：PAD2-TASKS-BVM-001
> **Feature Name**：browse_view_modes
> **上游规格**：`docs/specs/browse_view_modes/spec.md`（PAD2-SPEC-BVM-001，14 条业务规则 + 8 条 DFX 约束）
> **上游设计**：`docs/specs/browse_view_modes/design.md`（PAD2-DESIGN-BVM-001，7 个关键决策 + 9 个新增文件 + 3 个变更文件）
> **文档定位**：本文档为规格驱动开发（SDD）第三阶段产物，将技术设计转化为可执行、可验收的编码任务清单。任务按业务功能垂直切割，按依赖关系排序，被依赖者在前。
> **硬约束（贯穿全部任务）**：
> - HC-01 零新增 npm 依赖
> - HC-02 冻结区零变更：`src/adapter/smb/SmbPlugin.ts` / `src/core/**` / `android/**`
> - HC-03 `src/main.tsx` 改动限 3 行内（本特性实际 0 行，复用既有 `hydrateUiPrefs`）
> - HC-04 store 分级：store 为 SmbPlugin 唯一调用入口，UI 层不得直接 import SmbPlugin
> - HC-05 既有界面偏好兼容（`pad2.prefs.v1` version 1 框架内扩展，不升版本号）
> - HC-06 只读模式兼容

---

## 任务总览与依赖图

| 阶段 | 任务 ID | 标题 | 依赖 | 覆盖需求 |
|------|---------|------|------|---------|
| P1 基础 | TASK-VM-01 | 扩展 uiPrefsStore viewMode 字段与白名单解析 | — | REQ-VM-03/04/05, DFX-VM-03/05/07 |
| P1 基础 | TASK-VM-02 | 新增 viewModeConfig 视图模式配置常量 | — | REQ-VM-06, 6.2-1/2/3 |
| P2 展示 | TASK-VM-03 | 新增 TileRow 平铺行布局变体 | — | REQ-VM-07 |
| P2 展示 | TASK-VM-04 | 新增 IconGridItem 网格项组件 | — | REQ-VM-06/12 |
| P2 展示 | TASK-VM-05 | 新增 IconGrid 网格布局容器 | TASK-VM-02, TASK-VM-04 | REQ-VM-06, DFX-VM-02 |
| P3 接入 | TASK-VM-06 | 新增 ViewModeMenu 切换入口组件 | TASK-VM-02 | REQ-VM-01/13 |
| P3 接入 | TASK-VM-07 | 改造 FileList 按 viewMode 分发渲染 | TASK-VM-02/03/05 | REQ-VM-02/06/07/08/11, DFX-VM-02/08 |
| P3 接入 | TASK-VM-08 | 改造 BrowsePage 接入 ViewModeMenu 与 viewMode 传递 | TASK-VM-01/06/07 | REQ-VM-01/02/09/10/13 |
| P4 测试 | TASK-TEST-01 | 单元测试（Node.js .mjs，JSON 输出） | P3 全部 | 全部 REQ/DFX |
| P4 测试 | TASK-TEST-02 | 集成测试（真机/模拟器） | TASK-TEST-01 | 关键交互路径 |
| P4 测试 | TASK-TEST-03 | 回归测试（既有功能兼容） | TASK-TEST-01 | HC-05, DFX-VM-07/08 |
| P5 验证 | TASK-VERIFY-01 | 硬约束与冻结区验证 | P4 全部 | HC-01~06 |
| P5 验证 | TASK-VERIFY-02 | 需求覆盖与设计一致性核对 | TASK-VERIFY-01 | 全部 REQ/DFX/决策 |

**依赖关系说明**：
- P1 两个任务互相独立，可并行开发（状态扩展与常量定义无交叉）
- P2 三个任务中 TASK-VM-03/04 互相独立可并行；TASK-VM-05 依赖 VM-02（常量）与 VM-04（网格项）
- P3 三个任务串行：VM-06 依赖 VM-02；VM-07 依赖 VM-02/03/05；VM-08 依赖 VM-01/06/07
- P4 测试依赖 P3 全部完成
- P5 验证依赖 P4 完成

---

## 1. 视图模式状态与配置常量（P1 基础）

### 1.1 TASK-VM-01：扩展 uiPrefsStore viewMode 字段与白名单解析

**涉及文件**：
- `src/state/uiPrefsStore.ts`（扩展，+20 行）

**实现步骤**：
- [ ] 在文件顶部（:10 `ThemeMode` 附近）新增视图模式枚举类型 `export type ViewMode = 'largeIcon' | 'mediumIcon' | 'smallIcon' | 'tile' | 'detail';`
- [ ] 在 `PersistedPrefs` 接口（:15-19）新增字段 `viewMode: ViewMode;`，注释说明"浏览页视图模式偏好（默认 detail，DFX-VM-08 向后兼容）"
- [ ] 新增类型守卫 `function isViewMode(value: unknown): value is ViewMode`，严格比对五种枚举值（与既有 `isThemeMode` :21-23 同风格，非法值返回 false）
- [ ] 在 `readPersistedPrefs`（:30-45）返回对象构造（:36-41）新增 `viewMode: isViewMode(parsed.viewMode) ? parsed.viewMode : 'detail',`（白名单解析，缺失/非法值降级 detail，异常场景2）
- [ ] 在 `UiPrefsState` 接口（:55-60）新增字段 `viewMode: ViewMode;` 与方法 `setViewMode(mode: ViewMode): void;`
- [ ] 在 `useUiPrefsStore` create 初始化（:62-75）新增 `viewMode: 'detail'` 默认值（DFX-VM-08）
- [ ] 新增 `setViewMode` setter（紧邻 `setSideNavCollapsed` :70-74 同模式）：`set({ viewMode: mode });` 后从 `get()` 读取完整状态调用 `persistPrefs({ version: PREFS_VERSION, themeMode, sideNavCollapsed, viewMode })`
- [ ] 改造既有 `setThemeMode`（:65-69）与 `setSideNavCollapsed`（:70-74）的 `persistPrefs` 调用，补充 `viewMode: get().viewMode` 字段（避免切换主题/折叠侧边栏时遗漏 viewMode 持久化，R-02）
- [ ] 在 `hydrateUiPrefs`（:78-86）的 `useUiPrefsStore.setState` 调用（:81-84）新增 `viewMode: persisted.viewMode`（启动水合恢复 viewMode）
- [ ] 保持 `PREFS_VERSION = 1`（:13）不升（HC-05，version 1 框架内兼容扩展，旧数据缺失 viewMode 视为 detail）

**验收标准**：
- [ ] 既有无 viewMode 字段的偏好数据加载后 viewMode 视为 `detail`（DFX-VM-07）
- [ ] `setViewMode('largeIcon')` 后持久化到 `pad2.prefs.v1`，重启加载 viewMode=`largeIcon`（REQ-VM-03）
- [ ] viewMode 字段仅为枚举字符串，不含密码/密文/路径（DFX-VM-05）
- [ ] 篡改 viewMode 为非枚举值（如 `"extraLarge"` 字符串）加载后降级为 `detail`，不崩溃（异常场景2）
- [ ] 既有 themeMode/sideNavCollapsed 偏好完整保留，无数据丢失（HC-05）
- [ ] 切换主题或折叠侧边栏后 viewMode 保留（R-02 回归）
- [ ] `PREFS_VERSION` 保持 1 不升
- [ ] `npm run build` 通过，无类型错误

**依赖**：无

**覆盖**：REQ-VM-03, REQ-VM-04, REQ-VM-05, DFX-VM-03, DFX-VM-05, DFX-VM-07, 决策 D-VM-01

---

### 1.2 TASK-VM-02：新增 viewModeConfig 视图模式配置常量

**涉及文件**：
- `src/ui/pages/BrowsePage/viewModeConfig.ts`（新增，~45 行）

**实现步骤**：
- [ ] 创建文件 `src/ui/pages/BrowsePage/viewModeConfig.ts`
- [ ] 导入 `import type { ViewMode } from '../../../state/uiPrefsStore';`
- [ ] 定义布局类型 `export type ViewLayout = 'grid' | 'row';`
- [ ] 定义配置接口 `export interface ViewModeConfigEntry`，含字段：`layout: ViewLayout` / `iconSize: number` / `columns: number`（网格列数，row 模式为 0）/ `rowHeight: number`（虚拟化行高）/ `abbr: string`（入口缩写徽章）/ `label: string`（BottomSheet 选项标签）
- [ ] 定义常量 `export const VIEW_MODE_CONFIG: Readonly<Record<ViewMode, ViewModeConfigEntry>>`，五种模式配置：
  - [ ] `largeIcon: { layout: 'grid', iconSize: 64, columns: 4, rowHeight: 112, abbr: '大', label: '大图标' }`
  - [ ] `mediumIcon: { layout: 'grid', iconSize: 48, columns: 6, rowHeight: 96, abbr: '中', label: '中图标' }`
  - [ ] `smallIcon: { layout: 'grid', iconSize: 32, columns: 8, rowHeight: 80, abbr: '小', label: '小图标' }`
  - [ ] `tile: { layout: 'row', iconSize: 24, columns: 0, rowHeight: 64, abbr: '平', label: '平铺' }`
  - [ ] `detail: { layout: 'row', iconSize: 24, columns: 0, rowHeight: 64, abbr: '详', label: '详细信息' }`
- [ ] 定义选项列表 `export const VIEW_MODE_OPTIONS: ReadonlyArray<{ mode: ViewMode; label: string; abbr: string }>`，按大/中/小/平铺/详细信息顺序排列（ViewModeMenu BottomSheet 渲染用）
- [ ] 约束验证（注释说明，6.2）：图标尺寸 64>48>32 严格递减（6.2-1）；列数 4<6<8 严格递增（6.2-2）；行布局图标 24px（6.2-3）

**验收标准**：
- [ ] `VIEW_MODE_CONFIG['largeIcon'].iconSize` (64) > `['mediumIcon'].iconSize` (48) > `['smallIcon'].iconSize` (32)（6.2-1 严格递减）
- [ ] `VIEW_MODE_CONFIG['largeIcon'].columns` (4) < `['mediumIcon'].columns` (6) < `['smallIcon'].columns` (8)（6.2-2 严格递增）
- [ ] `VIEW_MODE_CONFIG['tile'].iconSize` === 24 且 `['detail'].iconSize` === 24（6.2-3 行布局适配尺寸）
- [ ] `VIEW_MODE_CONFIG['tile'].rowHeight` === 64 且 `['detail'].rowHeight` === 64（与既有 FileRow 行高一致）
- [ ] `VIEW_MODE_OPTIONS` 含 5 个选项，mode 覆盖全部五种枚举
- [ ] 常量为 `Readonly` 不可变，无运行时修改风险
- [ ] `npm run build` 通过

**依赖**：无

**覆盖**：REQ-VM-06, 6.2-1, 6.2-2, 6.2-3, 决策 D-VM-04

---

## 2. 多模式呈现组件（P2 展示）

### 2.1 TASK-VM-03：新增 TileRow 平铺行布局变体

**涉及文件**：
- `src/ui/pages/BrowsePage/TileRow/index.tsx`（新增，~70 行）
- `src/ui/pages/BrowsePage/TileRow/style.module.css`（新增，~15 行，复用 FileRow 样式模式）

**实现步骤**：
- [ ] 创建目录 `src/ui/pages/BrowsePage/TileRow/`
- [ ] 参考 `src/ui/pages/BrowsePage/FileRow/index.tsx`（:1-102）模式实现 TileRow
- [ ] 导入：`memo` from 'react' / `ListRow` / `Icon` / `fileIcon` / `formatFileSize` / `useLongPress` / `SmbFileEntry` 类型
- [ ] 定义 `TileRowProps` 接口（与 FileRowProps 同签名）：`file` / `searchQuery` / `selected` / `selectionMode` / `onOpen` / `onEnterDirectory` / `onRowActivate`
- [ ] 复用 `HighlightedName` 搜索高亮组件（从 FileRow 提取或内联复制，大小写不敏感分段 + mark 语义，AS-VM-11）
- [ ] 实现 `TileRowImpl`：
  - [ ] 复用 `useLongPress<HTMLDivElement>`（与 FileRow :69-76 同模式）：长按 `onRowActivate(file.path)`，短按非多选态目录→`onEnterDirectory` / 文件→`onOpen`
  - [ ] 副标题：`file.isDirectory ? '文件夹' : formatFileSize(file.size)`（仅一行摘要，不含修改时间，REQ-VM-07）
  - [ ] 渲染 `<div ref={ref} className={styles.rowFixed} data-tile-row="">` 包裹 `<ListRow>`：
    - [ ] icon：目录 `icon-folder` / 文件 `fileIcon(file.name.split('.').pop() ?? '')`，size=24（6.2-3 行布局适配尺寸）
    - [ ] title：`<HighlightedName name={file.name} query={searchQuery} />`
    - [ ] subtitle：上述单行摘要
    - [ ] selected / selectionMode / onPress：与 FileRow :94-96 一致
- [ ] 导出 `export const TileRow = memo(TileRowImpl);`
- [ ] 创建 `style.module.css`：复用 FileRow 样式（`.rowFixed { height: 64px; overflow: hidden; display: flex; flex-direction: column; }` + `.markHighlight` 同 FileRow）

**验收标准**：
- [ ] 平铺模式每行为图标(24px) + 文件名（搜索高亮）+ 一行摘要（REQ-VM-07）
- [ ] 文件摘要为 `formatFileSize(size)`，目录摘要为"文件夹"（REQ-VM-07）
- [ ] 行高固定 64px（与 FileRow 一致，复用虚拟化行高）
- [ ] 目录单击进入子目录，文件单击触发 onOpen（与 FileRow 交互一致）
- [ ] 长按触发 `onRowActivate`（复用 useLongPress，AS-VM-12）
- [ ] 搜索高亮匹配段 mark 标记（复用 HighlightedName，AS-VM-11）
- [ ] 多选态点击由 ListRow onPress 分支处理（selectionMode 时 onPress=onRowActivate）
- [ ] `npm run build` 通过

**依赖**：无

**覆盖**：REQ-VM-07, 决策 D-VM-06

---

### 2.2 TASK-VM-04：新增 IconGridItem 网格项组件

**涉及文件**：
- `src/ui/pages/BrowsePage/IconGrid/IconGridItem/index.tsx`（新增，~80 行）
- `src/ui/pages/BrowsePage/IconGrid/IconGridItem/style.module.css`（新增，~40 行）

**实现步骤**：
- [ ] 创建目录 `src/ui/pages/BrowsePage/IconGrid/IconGridItem/`
- [ ] 导入：`memo` from 'react' / `Icon` / `fileIcon` / `useLongPress` / `SmbFileEntry` 类型
- [ ] 定义 `IconGridItemProps` 接口：`file: SmbFileEntry` / `iconSize: number` / `searchQuery: string` / `selected: boolean` / `selectionMode: boolean` / `onOpen` / `onEnterDirectory` / `onRowActivate`
- [ ] 复用 `HighlightedName` 搜索高亮组件（与 FileRow/TileRow 同实现，AS-VM-11）
- [ ] 实现 `IconGridItemImpl`：
  - [ ] 复用 `useLongPress<HTMLDivElement>`（与 FileRow :69-76 同模式）：长按 `onRowActivate(file.path)`，短按非多选态目录→`onEnterDirectory` / 文件→`onOpen`
  - [ ] 布局：垂直排列（图标居中 + 文件名多行截断），外层 `<div ref={ref} className={styles.item}>`
  - [ ] 图标区：多选态时渲染复选框（复用 ListRow 多选态视觉，`selectionMode` 时 `<span className={styles.checkmark} data-selected={selected} />`）；非多选态时渲染文件图标 `<Icon name={file.isDirectory ? 'icon-folder' : fileIcon(file.name.split('.').pop() ?? '')} size={iconSize} />`
  - [ ] 选中态：`selected` 时外层加 `styles['item--selected']`（brand-50 背景 + 边框）
  - [ ] 文件名：`<span className={styles.name}>` 包裹 `<HighlightedName>`，CSS `-webkit-line-clamp: 2` + `text-overflow: ellipsis` 最多 2 行截断
- [ ] 导出 `export const IconGridItem = memo(IconGridItemImpl);`
- [ ] 创建 `style.module.css`：
  - [ ] `.item`：垂直 flex 居中，padding/gap 适配网格项间距
  - [ ] `.item--selected`：brand-50 背景 + brand-500 边框
  - [ ] `.name`：`display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-align: center;`
  - [ ] `.checkmark`：复选框样式（复用 ListRow `.row__check` 视觉）
  - [ ] `.markHighlight`：搜索高亮（同 FileRow）

**验收标准**：
- [ ] 网格项垂直排列：图标居中 + 文件名最多 2 行截断（REQ-VM-06）
- [ ] 图标尺寸按 `iconSize` 传参渲染（大 64 / 中 48 / 小 32，6.2-1）
- [ ] 选中态 `selected=true` 时呈 brand-50 背景 + 边框（视觉与 ListRow 选中态协调）
- [ ] 多选态 `selectionMode=true` 时图标区换复选框（与 ListRow 多选态一致，REQ-VM-12）
- [ ] 目录单击进入子目录，文件单击触发 onOpen（与 FileRow 交互一致）
- [ ] 长按触发 `onRowActivate`（复用 useLongPress，AS-VM-12）
- [ ] 搜索高亮匹配段 mark 标记（复用 HighlightedName）
- [ ] `npm run build` 通过

**依赖**：无

**覆盖**：REQ-VM-06, REQ-VM-12, 决策 D-VM-07

---

### 2.3 TASK-VM-05：新增 IconGrid 网格布局容器

**涉及文件**：
- `src/ui/pages/BrowsePage/IconGrid/index.tsx`（新增，~90 行）
- `src/ui/pages/BrowsePage/IconGrid/style.module.css`（新增，~50 行）

**实现步骤**：
- [ ] 创建目录 `src/ui/pages/BrowsePage/IconGrid/`（IconGridItem 子目录已由 TASK-VM-04 创建）
- [ ] 导入：`useMemo` from 'react' / `useVirtualList` / `IconGridItem` / `VIEW_MODE_CONFIG` / `SmbFileEntry` / `ViewMode` 类型
- [ ] 定义 `IconGridProps` 接口：`files: SmbFileEntry[]` / `viewMode: 'largeIcon' | 'mediumIcon' | 'smallIcon'` / `searchQuery: string` / `selection: Set<string>` / `selectionMode: boolean` / `onOpen` / `onEnterDirectory` / `onRowActivate`
- [ ] 实现 `IconGrid`：
  - [ ] 读取配置 `const config = VIEW_MODE_CONFIG[viewMode];`（iconSize/columns/rowHeight）
  - [ ] 分块为网格行（useMemo 缓存，依赖 files + columns）：`const gridRows = useMemo(() => chunk(files, config.columns), [files, config.columns]);`
    - [ ] 实现 `chunk<T>(arr: T[], size: number): Array<Array<T | null>>` 辅助函数：按 size 分块，末行不足 N 项填充 null 占位（flex 等宽对齐）
  - [ ] 复用 `useVirtualList(gridRows, { rowHeight: config.rowHeight, overscan: 4 })`（overscan=4，网格行高较大缓冲区可减小，D-VM-02）
  - [ ] 渲染滚动容器（与 FileList :85-106 同结构）：`<div className={styles.scrollContainer} onScroll={virtual.onScroll}>` → spacer(totalHeight) → window(translateY) → 网格行
  - [ ] 每个可视网格行渲染 `<div className={styles.gridRow}>`（flex 横向排列），内部 map 每个网格项：
    - [ ] null 占位渲染 `<div className={styles.placeholder} />`（flex 等宽占位）
    - [ ] 非 null 渲染 `<IconGridItem key={file.path} file={file} iconSize={config.iconSize} searchQuery={searchQuery} selected={selection.has(file.path)} selectionMode={selectionMode} onOpen={onOpen} onEnterDirectory={onEnterDirectory} onRowActivate={onRowActivate} />`
- [ ] 创建 `style.module.css`：
  - [ ] `.scrollContainer` / `.spacer` / `.window`：复用 FileList 虚拟化容器样式（overflow-y:auto / position:relative / absolute translateY）
  - [ ] `.gridRow`：`display: flex; gap: var(--pad2-space-2); padding: 0 var(--pad2-space-2);`
  - [ ] `.placeholder`：`flex: 1 1 0;`（等宽占位，与 IconGridItem 等宽对齐）

**验收标准**：
- [ ] 大图标模式网格列数 4，中图标 6，小图标 8（REQ-VM-06，6.2-2）
- [ ] 网格项图标尺寸按 viewMode 分级（大 64 / 中 48 / 小 32，6.2-1）
- [ ] 大量条目（1000+）仅渲染可视区 ± 4 网格行（DFX-VM-02，虚拟化按行窗口化）
- [ ] 末行不足 N 项时填充占位，flex 等宽对齐不破版
- [ ] 滚动流畅，rAF 节流窗口更新（复用 useVirtualList，AS-VM-03）
- [ ] 选中项按 `file.path` 标识跨布局保留（REQ-VM-12）
- [ ] gridRows useMemo 缓存，仅 files 或 viewMode 变更时重算（R-06）
- [ ] `npm run build` 通过

**依赖**：TASK-VM-02（VIEW_MODE_CONFIG 常量）, TASK-VM-04（IconGridItem 组件）

**覆盖**：REQ-VM-06, DFX-VM-02, 决策 D-VM-02

---

## 3. 切换入口与 BrowsePage 接入（P3 接入）

### 3.1 TASK-VM-06：新增 ViewModeMenu 切换入口组件

**涉及文件**：
- `src/ui/pages/BrowsePage/ViewModeMenu/index.tsx`（新增，~80 行）
- `src/ui/pages/BrowsePage/ViewModeMenu/style.module.css`（新增，~40 行，复用 SortMenu 样式模式）

**实现步骤**：
- [ ] 创建目录 `src/ui/pages/BrowsePage/ViewModeMenu/`
- [ ] 参考 `src/ui/pages/BrowsePage/SortMenu/index.tsx`（:1-88）模式实现，字段集替换为五种视图模式，去掉升降序切换
- [ ] 导入：`useState` from 'react' / `BottomSheet` / `ListRow` / `Icon` / `ViewMode` 类型 / `VIEW_MODE_OPTIONS` / `VIEW_MODE_CONFIG`
- [ ] 定义 `ViewModeMenuProps` 接口：`viewMode: ViewMode` / `onChange(mode: ViewMode): void`
- [ ] 实现 `ViewModeMenu`：
  - [ ] `const [open, setOpen] = useState(false);`
  - [ ] 当前模式配置 `const current = VIEW_MODE_CONFIG[viewMode];`
  - [ ] 选择处理 `const applyMode = (mode: ViewMode) => { onChange(mode); setOpen(false); };`（选择即生效，无确认步骤）
  - [ ] 入口按钮（复用 SortMenu :46-57 模式）：`<button type="button" className={styles.trigger} aria-label={`视图：${current.label}`} onClick={() => setOpen(true)}>` 内含 `<Icon name="icon-eye" size={20} />` + `<span className={styles.abbrBadge}>{current.abbr}</span>`（icon-eye 既有图标，registry.ts:28/185，视图/查看语义；缩写徽章持久可见当前模式，REQ-VM-13）
  - [ ] BottomSheet（复用 SortMenu :58-85 模式）：`<BottomSheet title="查看方式" open={open} onDismiss={() => setOpen(false)}>` 内含 `<div className={styles.menuList}>` 渲染 `VIEW_MODE_OPTIONS.map` 每项 `<ListRow>`：
    - [ ] icon：`<Icon name="icon-eye" size={22} />`
    - [ ] title：`item.label`（大图标/中图标/小图标/平铺/详细信息）
    - [ ] trailing：`viewMode === item.mode ? <Icon name="icon-check-circle" size={20} /> : undefined`（选中态勾选）
    - [ ] selected：`viewMode === item.mode`
    - [ ] onPress：`() => applyMode(item.mode)`
  - [ ] 不含 SortMenu 的 directionRow 升降序切换（视图模式无升降序概念，D-VM-05）
- [ ] 创建 `style.module.css`：复用 SortMenu 样式（`.trigger` / `.abbrBadge` / `.menuList`，去掉 `.directionIndicator` / `.directionRow`）

**验收标准**：
- [ ] ViewModeMenu 入口呈现 icon-eye + 当前模式缩写徽章（持久可见，REQ-VM-13）
- [ ] 点击入口弹出 BottomSheet 含五个选项（大图标/中图标/小图标/平铺/详细信息，REQ-VM-01）
- [ ] 当前选中模式呈 icon-check-circle trailing 标识 + selected 高亮
- [ ] 选择目标模式后调用 onChange 并关闭 BottomSheet（选择即生效，无确认步骤）
- [ ] 切换到"中图标"后入口缩写徽章更新为"中"（REQ-VM-13）
- [ ] 不含升降序切换控件（视图模式无升降序概念）
- [ ] `npm run build` 通过

**依赖**：TASK-VM-02（VIEW_MODE_CONFIG / VIEW_MODE_OPTIONS 常量）

**覆盖**：REQ-VM-01, REQ-VM-13, 决策 D-VM-05

---

### 3.2 TASK-VM-07：改造 FileList 按 viewMode 分发渲染

**涉及文件**：
- `src/ui/pages/BrowsePage/FileList/index.tsx`（改造，+35 行）

**实现步骤**：
- [ ] 导入新增组件与常量：`TileRow` / `IconGrid` / `VIEW_MODE_CONFIG` / `ViewMode` 类型
- [ ] 在 `FileListProps` 接口（:18-29）新增可选字段 `viewMode?: ViewMode;`（默认 detail，向后兼容，DFX-VM-08）
- [ ] 在 `FileList` 函数签名（:33-45）解构新增 `viewMode = 'detail'`（默认值，未传时等价既有 FileRow 行布局）
- [ ] 删除既有 `const ROW_HEIGHT = 64;`（:31），改为按 viewMode 动态查询：`const config = VIEW_MODE_CONFIG[viewMode]; const rowHeight = config.rowHeight;`
- [ ] 改造 `useVirtualList` 调用（:52）：`useVirtualList(visible, { rowHeight, overscan: 8 })`（rowHeight 按模式，detail/tile=64，grid=112/96/80）
- [ ] 状态分支保持不变（REQ-VM-11）：loading→SkeletonList（:60-62）/ 空目录→EmptyState（:64-72）/ 搜索无结果→EmptyState（:74-83）分支不因 viewMode 变更
- [ ] 改造正常渲染分支（:85-107）按 viewMode 分发：
  - [ ] `viewMode === 'detail'`：既有 FileRow 渲染（零变更，DFX-VM-08 向后兼容）
  - [ ] `viewMode === 'tile'`：将 `<FileRow ... />` 替换为 `<TileRow ... />`（props 签名一致）
  - [ ] `viewMode ∈ {largeIcon, mediumIcon, smallIcon}`：替换为 `<IconGrid files={visible} viewMode={viewMode} searchQuery={searchQuery} selection={selection} selectionMode={selectionMode} onOpen={onOpen} onEnterDirectory={onEnterDirectory} onRowActivate={onRowActivate} />`（IconGrid 内部自管虚拟化，不复用外层 virtual）
- [ ] grid 模式渲染结构：直接 `<IconGrid ... />`（IconGrid 自带 scrollContainer/spacer/window）
- [ ] detail/tile 模式渲染结构：保持既有 `<div className={styles.scrollContainer} onScroll={virtual.onScroll}>` → spacer → window → FileRow/TileRow 列表结构
- [ ] 排序/搜索变更后 scrollToTop（:55-58）保持不变

**验收标准**：
- [ ] `viewMode='detail'`（默认）渲染 FileRow 行布局，视觉等价升级前（DFX-VM-08）
- [ ] `viewMode='tile'` 渲染 TileRow 行布局（REQ-VM-07）
- [ ] `viewMode='largeIcon'/'mediumIcon'/'smallIcon'` 渲染 IconGrid 网格布局（REQ-VM-06）
- [ ] 虚拟化 rowHeight 按 `VIEW_MODE_CONFIG[viewMode].rowHeight`（detail/tile=64，largeIcon=112，mediumIcon=96，smallIcon=80）
- [ ] loading 态呈现 SkeletonList，不因 viewMode 变更（REQ-VM-11）
- [ ] 空目录呈现 EmptyState"目录为空"，不因 viewMode 变更（REQ-VM-11）
- [ ] 搜索无结果呈现 EmptyState + 清空搜索按钮，不因 viewMode 变更（REQ-VM-11）
- [ ] 未传 viewMode 时默认 detail，既有调用方零变更（向后兼容）
- [ ] `npm run build` 通过

**依赖**：TASK-VM-02（VIEW_MODE_CONFIG）, TASK-VM-03（TileRow）, TASK-VM-05（IconGrid）

**覆盖**：REQ-VM-02, REQ-VM-06, REQ-VM-07, REQ-VM-08, REQ-VM-11, DFX-VM-02, DFX-VM-08, 决策 D-VM-03

---

### 3.3 TASK-VM-08：改造 BrowsePage 接入 ViewModeMenu 与 viewMode 传递

**涉及文件**：
- `src/ui/pages/BrowsePage/index.tsx`（改造，+12 行）

**实现步骤**：
- [ ] 新增导入：`useUiPrefsStore` from `../../../state/uiPrefsStore` / `ViewMode` 类型 / `ViewModeMenu` from `./ViewModeMenu`
- [ ] 在 `BrowsePage` 组件内（:51 附近）消费视图模式偏好：
  - [ ] `const viewMode = useUiPrefsStore((s) => s.viewMode);`
  - [ ] `const setViewMode = useUiPrefsStore((s) => s.setViewMode);`
- [ ] 在 toolbar 操作区（:228-239 `<div className={styles.toolbarActions}>`）紧邻 `<SortMenu>` 后新增 `<ViewModeMenu viewMode={viewMode} onChange={setViewMode} />`（D-VM-05 紧邻 SortMenu 放置）
- [ ] 在 `<FileList>` 调用（:257-268）新增 `viewMode={viewMode}` prop 传递
- [ ] 不修改既有 `visibleFiles` useMemo（:157-160，视图模式与排序/搜索正交，REQ-VM-09/10）
- [ ] 不修改既有 selection/selectionMode 消费（:52-56，视图模式与多选正交，REQ-VM-12）
- [ ] 不修改既有 enterDirectory/refresh/setSort/setSearchQuery 回调（视图模式不触发 SMB 请求，REQ-VM-02）
- [ ] UI 层零 SmbPlugin import（HC-04，viewMode 经 uiPrefsStore 承载，不直调 SmbPlugin）

**验收标准**：
- [ ] BrowsePage toolbar 呈现 ViewModeMenu 入口（icon-eye + 缩写徽章），紧邻 SortMenu（REQ-VM-01/13）
- [ ] 点击 ViewModeMenu 选择"大图标" → uiPrefsStore.viewMode=`largeIcon`，FileList 以 IconGrid 网格布局呈现（REQ-VM-02）
- [ ] 切换视图模式不触发 enterDirectory/refresh（无 SMB 请求，REQ-VM-02/14）
- [ ] 切换视图模式不改变 visibleFiles（排序/搜索结果不变，REQ-VM-09/10）
- [ ] 切换视图模式不改变 selection/selectionMode（多选态保留，REQ-VM-12）
- [ ] 视图模式从 uiPrefsStore 读取，跨共享统一（REQ-VM-05）
- [ ] 首次使用（viewMode 默认 detail）呈现既有 FileRow 行布局（DFX-VM-08）
- [ ] main.tsx 零变更（复用既有 hydrateUiPrefs 自动恢复 viewMode，HC-03）
- [ ] UI 层无 SmbPlugin import（HC-04）
- [ ] `npm run build` 通过

**依赖**：TASK-VM-01（uiPrefsStore viewMode 字段）, TASK-VM-06（ViewModeMenu 组件）, TASK-VM-07（FileList viewMode 分发）

**覆盖**：REQ-VM-01, REQ-VM-02, REQ-VM-05, REQ-VM-09, REQ-VM-10, REQ-VM-12, REQ-VM-13, DFX-VM-01, DFX-VM-04, DFX-VM-08

---

## 4. 测试验证

### 4.1 TASK-TEST-01：单元测试（Node.js .mjs，JSON 输出）

**涉及文件**：
- `tests/verify-vm-01.mjs` ~ `verify-vm-14.mjs`（14 个验证脚本）
- 对应 `tests/vm01-result.json` ~ `vm14-result.json`（JSON 输出）

**实现步骤**：
- [ ] **T-VM-01** `verify-vm-01.mjs`：mock Preferences 注入含 viewMode 的偏好数据，调用 `readPersistedPrefs`，断言 viewMode 正确解析；mock 旧数据（无 viewMode）加载后 viewMode=`detail`（覆盖 REQ-VM-03/DFX-VM-07）
- [ ] **T-VM-02** `verify-vm-02.mjs`：断言 `useUiPrefsStore` 初始 viewMode=`detail`；`hydrateUiPrefs` 无持久化时 viewMode 保持 `detail`（覆盖 REQ-VM-04/DFX-VM-08）
- [ ] **T-VM-03** `verify-vm-03.mjs`：mock 持久化 viewMode 为非法值（如 `"extraLarge"`），调用 `readPersistedPrefs`，断言降级为 `detail`，不崩溃（覆盖 DFX-VM-03/异常场景2）
- [ ] **T-VM-04** `verify-vm-04.mjs`：mock uiPrefsStore，`setViewMode('largeIcon')` 后切换共享（mock activeProfileId 变更），断言 viewMode 仍为 `largeIcon`（全局偏好，覆盖 REQ-VM-05）
- [ ] **T-VM-05** `verify-vm-05.mjs`：渲染 ViewModeMenu（React Testing Library），断言入口 icon-eye + 缩写徽章；点击弹出 BottomSheet 含五个选项（大图标/中图标/小图标/平铺/详细信息）（覆盖 REQ-VM-01/13）
- [ ] **T-VM-06** `verify-vm-06.mjs`：断言 `VIEW_MODE_CONFIG['largeIcon'].iconSize` (64) > `['mediumIcon'].iconSize` (48) > `['smallIcon'].iconSize` (32)（覆盖 REQ-VM-06/6.2-1）
- [ ] **T-VM-07** `verify-vm-07.mjs`：断言 `VIEW_MODE_CONFIG['largeIcon'].columns` (4) < `['mediumIcon'].columns` (6) < `['smallIcon'].columns` (8)（覆盖 REQ-VM-06/6.2-2）
- [ ] **T-VM-08** `verify-vm-08.mjs`：渲染 FileList 分别传 viewMode=detail/tile/largeIcon/mediumIcon/smallIcon，断言分发到 FileRow/TileRow/IconGrid（覆盖 REQ-VM-06/07/08）
- [ ] **T-VM-09** `verify-vm-09.mjs`：mock browseContextStore，`setViewMode` 后断言 `enterDirectory`/`refresh` 未被调用（无 SMB 请求，覆盖 REQ-VM-02/14）
- [ ] **T-VM-10** `verify-vm-10.mjs`：mock files + sort + searchQuery，`setViewMode` 后断言 `sortedAndFilteredFiles` 输出不变（视图模式与排序/搜索正交，覆盖 REQ-VM-09/10）
- [ ] **T-VM-11** `verify-vm-11.mjs`：渲染 FileList，loading=true 时断言 SkeletonList；files=[] 时断言 EmptyState"目录为空"；切换 viewMode 后分支不变（覆盖 REQ-VM-11）
- [ ] **T-VM-12** `verify-vm-12.mjs`：mock selection=Set{path1,path2,path3} + selectionMode=true，切换 viewMode 后渲染 IconGrid，断言 path1/path2/path3 对应网格项 selected=true（覆盖 REQ-VM-12）
- [ ] **T-VM-13** `verify-vm-13.mjs`：mock 1000 文件，渲染 IconGrid，断言 `useVirtualList` visibleItems 长度 << 1000（仅渲染可视区 ± 4 网格行，覆盖 DFX-VM-02）
- [ ] **T-VM-14** `verify-vm-14.mjs`：断言 `PersistedPrefs` 序列化后仅含 version/themeMode/sideNavCollapsed/viewMode，无密码/密文/路径字段（覆盖 DFX-VM-05）
- [ ] 测试注入点：`uiPrefsStore` 既有 Preferences 读写可经 mock Preferences 注入（与既有测试同模式）；`viewModeConfig` 常量直接断言；`FileList`/`IconGrid`/`TileRow`/`ViewModeMenu` 经 React Testing Library 渲染断言
- [ ] 每个脚本输出 JSON 结果文件（如 `vm01-result.json`），含 `testId`/`passed`/`coverage`/`durationMs`/`assertions` 字段

**验收标准**：
- [ ] 14 个验证脚本全部执行，JSON 输出 `passed=true`
- [ ] 覆盖 spec.md 全部 14 条业务规则（REQ-VM-01~14）+ 8 条 DFX 约束（DFX-VM-01~08）
- [ ] 测试脚本为 Node.js ES Module（.mjs），无新增 npm 依赖（HC-01）
- [ ] JSON 输出格式统一：`{ testId, passed, coverage, durationMs, assertions }`

**依赖**：TASK-VM-01~08（P3 全部完成）

**覆盖**：全部 REQ/DFX

---

### 4.2 TASK-TEST-02：集成测试（真机/模拟器）

**涉及文件**：
- 集成测试用例文档（手动执行清单）

**实现步骤**：
- [ ] **IT-VM-01**：进入共享浏览页，toolbar 存在视图模式入口（icon-eye + 缩写徽章），点击弹出五选项菜单（REQ-VM-01）
- [ ] **IT-VM-02**：选择"大图标"模式 → 目录以网格布局呈现，每项大尺寸图标+文件名，列数 4（REQ-VM-06）
- [ ] **IT-VM-03**：选择"中图标"/"小图标"模式 → 网格布局，图标尺寸递减（48/32），列数递增（6/8）（REQ-VM-06）
- [ ] **IT-VM-04**：选择"平铺"模式 → 行布局，每行图标+文件名+一行摘要（文件=大小，目录="文件夹"）（REQ-VM-07）
- [ ] **IT-VM-05**：选择"详细信息"模式 → 行布局，每行图标+文件名+大小+修改时间，视觉等价升级前（REQ-VM-08/DFX-VM-08）
- [ ] **IT-VM-06**：切换视图模式后彻底重启应用 → 视图模式自动恢复为重启前选择（REQ-VM-03）
- [ ] **IT-VM-07**：首次使用（无持久化 viewMode）→ 默认"详细信息"模式，视觉等价当前行布局（REQ-VM-04/DFX-VM-08）
- [ ] **IT-VM-08**：在共享 A 设置"大图标"后切换到共享 B → 共享 B 视图模式同样为"大图标"（全局偏好，REQ-VM-05）
- [ ] **IT-VM-09**：切换视图模式时网络监控 → 无 listDirectory/connect 网络请求发出（REQ-VM-02/14）
- [ ] **IT-VM-10**：按名称升序排列后切换到"大图标" → 网格中条目顺序仍为名称升序，内容不变（REQ-VM-09）
- [ ] **IT-VM-11**：输入搜索"doc"过滤后切换到"小图标" → 网格仅呈现名称含"doc"的条目，搜索关键词保留（REQ-VM-10）
- [ ] **IT-VM-12**：目录为空时切换视图模式 → 仍呈现 EmptyState"目录为空"引导（REQ-VM-11）
- [ ] **IT-VM-13**：目录加载中时切换视图模式 → 仍呈现 Skeleton 加载骨架（REQ-VM-11）
- [ ] **IT-VM-14**：多选态选中 3 项后切换到"大图标" → 网格中该 3 项仍呈选中态，多选态不退出（REQ-VM-12）
- [ ] **IT-VM-15**：目录含 1000+ 文件，切换到大图标模式 → 页面滚动流畅，不出现明显卡顿或内存溢出（DFX-VM-02）
- [ ] **IT-VM-16**：当前模式为"中图标"时入口标识 → toolbar ViewModeMenu 入口显示"中"缩写徽章（REQ-VM-13）
- [ ] **IT-VM-17**：连接态为 network_lost 且目录已有缓存内容 → 用户仍可切换视图模式查看缓存内容（DFX-VM-04）
- [ ] **IT-VM-18**：Preferences 损坏后重启 → 视图模式回默认详细信息，浏览页正常呈现（DFX-VM-03）

**验收标准**：
- [ ] 18 个集成测试场景全部通过
- [ ] 真机/模拟器执行，覆盖关键用户操作路径
- [ ] 每个 IT 记录执行结果与截图证据

**依赖**：TASK-TEST-01

**覆盖**：关键交互路径（视图模式切换/持久化/正交性/多选兼容/虚拟化）

---

### 4.3 TASK-TEST-03：回归测试（既有功能兼容）

**涉及文件**：
- 回归测试用例文档

**实现步骤**：
- [ ] **RT4.3-01**：既有界面偏好兼容（HC-05/DFX-VM-07）→ 升级后既有 themeMode/sideNavCollapsed 偏好保留，viewMode 视为默认 detail
- [ ] **4.3-02**：既有 `setThemeMode` / `setSideNavCollapsed` 持久化不破坏 viewMode → 切换主题/折叠侧边栏后 viewMode 保留（R-02）
- [ ] **4.3-03**：既有 `browseContextStore` 调用方不受影响 → BrowsePage 消费 files/sort/searchQuery 正常，视图模式正交（REQ-VM-09/10）
- [ ] **4.3-04**：既有 `browseStore` selection/selectionMode 行为不变 → 多选/选中/退出多选正常，跨视图模式保留选中态（REQ-VM-12）
- [ ] **4.3-05**：既有 `FileRow` detail 模式视觉等价 → detail 模式呈现与升级前 FileRow 行布局视觉一致（DFX-VM-08）
- [ ] **4.3-06**：既有 `useVirtualList` 行为不变 → FileList detail/tile 模式虚拟化行列表正常，IconGrid 网格虚拟化正常
- [ ] **4.3-07**：既有 `SortMenu` / `SearchField` 行为不变 → 排序/搜索与视图模式正交，切换视图模式不影响排序/搜索结果
- [ ] **4.3-08**：既有 `main.tsx` / `App.tsx` 启动链不变 → main.tsx 零变更，App.tsx `hydrateUiPrefs` 自动恢复 viewMode
- [ ] **4.3-09**：既有空态/加载态/错误态呈现不变 → EmptyState/SkeletonList/StatusBanner 分支不因视图模式变更

**验收标准**：
- [ ] 9 个回归测试全部通过
- [ ] 既有功能无退化
- [ ] 冻结区 git diff 为空（HC-02）

**依赖**：TASK-TEST-01

**覆盖**：HC-05, DFX-VM-07, DFX-VM-08, HC-02, HC-03

---

## 5. 硬约束与需求覆盖验证

### 5.1 TASK-VERIFY-01：硬约束与冻结区验证

**涉及文件**：
- 验证脚本 + git diff 检查

**实现步骤**：
- [ ] **HC-01 零新增 npm 依赖**：检查 `package.json` / `package-lock.json` 无新增 dependencies，`git diff package.json` 输出为空
- [ ] **HC-02 冻结区零变更**：`git diff --stat src/adapter/smb/SmbPlugin.ts src/core/ android/` 输出为空
- [ ] **HC-03 main.tsx 改动限 3 行内**：`git diff src/main.tsx` 统计 +/- 行数 ≤ 3（本特性预期 0 行，复用既有 hydrateUiPrefs）
- [ ] **HC-04 store 分级**：grep 检查 UI 层文件（`src/ui/**`）无 `import SmbPlugin`（ViewModeMenu/IconGrid/TileRow/FileList/BrowsePage 均经 uiPrefsStore/browseContextStore 承载状态，不直调 SmbPlugin）
- [ ] **HC-05 既有界面偏好兼容**：`PREFS_VERSION` 保持 1，旧数据加载 viewMode 视为 `detail`（RT4.3-01）
- [ ] **HC-06 只读模式兼容**：writebackConfig enabled=false 场景下视图模式切换功能正常（视图模式为纯 UI 呈现层变更，不依赖写回）

**验收标准**：
- [ ] HC-01~06 全部验证通过，记录证据
- [ ] 冻结区 git diff 为空
- [ ] main.tsx 改动 ≤ 3 行（预期 0 行）
- [ ] UI 层无 SmbPlugin import
- [ ] 验证结果记录到 `verify-vm-hc-result.json`

**依赖**：TASK-TEST-01, TASK-TEST-03

**覆盖**：HC-01~06

---

### 5.2 TASK-VERIFY-02：需求覆盖与设计一致性核对

**涉及文件**：
- 覆盖矩阵文档

**实现步骤**：
- [ ] 核对 spec.md 14 条业务规则（REQ-VM-01~14）每条均有任务覆盖
- [ ] 核对 spec.md 8 条 DFX 约束（DFX-VM-01~08）每条均有任务覆盖
- [ ] 核对 design.md 7 个关键决策（D-VM-01~07）均已落地：
  - [ ] D-VM-01 viewMode 持久化位置（uiPrefsStore 扩展）→ TASK-VM-01
  - [ ] D-VM-02 网格虚拟化策略（复用 useVirtualList 按行窗口化）→ TASK-VM-05
  - [ ] D-VM-03 FileList 按 viewMode 分发 → TASK-VM-07
  - [ ] D-VM-04 图标尺寸与网格列数分级常量 → TASK-VM-02
  - [ ] D-VM-05 ViewModeMenu 入口位置与模式 → TASK-VM-06
  - [ ] D-VM-06 TileRow 平铺模式行布局变体 → TASK-VM-03
  - [ ] D-VM-07 IconGridItem 网格项交互与选中态 → TASK-VM-04
- [ ] 核对 design.md 新增文件清单（9 个）全部创建：
  - [ ] `src/ui/pages/BrowsePage/viewModeConfig.ts`（TASK-VM-02）
  - [ ] `src/ui/pages/BrowsePage/ViewModeMenu/index.tsx` + `style.module.css`（TASK-VM-06）
  - [ ] `src/ui/pages/BrowsePage/IconGrid/index.tsx` + `style.module.css`（TASK-VM-05）
  - [ ] `src/ui/pages/BrowsePage/IconGrid/IconGridItem/index.tsx` + `style.module.css`（TASK-VM-04）
  - [ ] `src/ui/pages/BrowsePage/TileRow/index.tsx` + `style.module.css`（TASK-VM-03）
- [ ] 核对 design.md 变更文件清单（3 个）均已按预期变更：
  - [ ] `src/state/uiPrefsStore.ts`（TASK-VM-01，+20 行）
  - [ ] `src/ui/pages/BrowsePage/index.tsx`（TASK-VM-08，+12 行）
  - [ ] `src/ui/pages/BrowsePage/FileList/index.tsx`（TASK-VM-07，+35 行）
- [ ] 核对 design.md 保留兼容文件（12 个）零变更：
  - [ ] `src/main.tsx` / `src/App.tsx`（启动链零变更，复用既有 hydrateUiPrefs）
  - [ ] `src/state/browseContextStore.ts` / `src/state/browseStore.ts`（视图模式正交，零变更）
  - [ ] `src/ui/pages/BrowsePage/FileRow/index.tsx`（detail 模式渲染组件，零变更）
  - [ ] `src/ui/hooks/useVirtualList.ts` / `src/ui/components/ListRow/index.tsx` / `src/ui/components/BottomSheet/index.tsx`（复用，零变更）
  - [ ] `src/ui/icons/fileTypeIcons.ts` / `src/ui/icons/Icon.tsx` / `src/utils/fileUtils.ts` / `src/ui/hooks/useLongPress.ts`（复用，零变更）
- [ ] 生成需求覆盖矩阵表（REQ/DFX → TASK 映射）

**验收标准**：
- [ ] 14 条业务规则 + 8 条 DFX 约束 + 7 个决策全部覆盖，无遗漏
- [ ] 新增/变更/保留文件清单与 design.md 2.4 节完全一致
- [ ] 覆盖矩阵文档归档到 `docs/specs/browse_view_modes/coverage-matrix.md`
- [ ] 验证结果记录到 `verify-vm-coverage-result.json`

**依赖**：TASK-VERIFY-01

**覆盖**：全部 REQ/DFX/决策

---

## 任务执行顺序建议

```
P1（可并行）:
  TASK-VM-01 ─┐
  TASK-VM-02 ─┤
  TASK-VM-03 ─┼─→ P2
  TASK-VM-04 ─┘

P2（依赖 P1）:
  TASK-VM-05 (← VM-02, VM-04)

P3（依赖 P2，内部部分可并行）:
  TASK-VM-06 (← VM-02)
  TASK-VM-07 (← VM-02, VM-03, VM-05)
  TASK-VM-08 (← VM-01, VM-06, VM-07)

P4（依赖 P3 全部）:
  TASK-TEST-01 → TASK-TEST-02 / TASK-TEST-03

P5（依赖 P4）:
  TASK-VERIFY-01 → TASK-VERIFY-02
```

---

## 风险关注点（执行时持续监控）

| 风险编号 | 风险 | 关联任务 | 监控措施 |
|---------|------|---------|---------|
| R-01 | viewMode 字段旧数据兼容 | TASK-VM-01 | RT4.3-01 回归：旧数据加载 viewMode=`detail` |
| R-02 | 既有 setThemeMode/setSideNavCollapsed 持久化遗漏 viewMode | TASK-VM-01 | RT4.3-02 回归：切换主题/折叠侧边栏后 viewMode 保留 |
| R-03 | FileList viewMode 默认值与 uiPrefsStore 不一致 | TASK-VM-07/08 | 两者默认值均为 detail，BrowsePage 始终从 uiPrefsStore 读取传入 |
| R-04 | 大量条目网格渲染数千 DOM 节点导致卡顿 | TASK-VM-05 | T-VM-13：useVirtualList 按行窗口化仅渲染可视区 ± 4 网格行 |
| R-06 | 网格分块 chunk 每次渲染重复计算 | TASK-VM-05 | IconGrid 内部 useMemo 缓存 gridRows（依赖 files + columns） |
| R-08 | viewMode 持久化失败（Preferences 写入异常） | TASK-VM-01 | 既有 persistPrefs 静默降级（内存态生效，DFX-VM-03） |
| R-09 | viewMode 字段值非法（数据篡改） | TASK-VM-01 | T-VM-03：readPersistedPrefs 白名单 isViewMode 解析降级 detail |
| R-10 | 网格列数与移动端宽度不匹配导致破版 | TASK-VM-02/05 | D-VM-04 列数常量按移动端宽屏测算；CSS flex 等宽自适应 |
| R-11 | 多选态切换视图模式后选中项丢失 | TASK-VM-04/08 | T-VM-12：selection 按 path 标识跨布局保留（REQ-VM-12） |

---

> 本任务分解文档基于 spec.md（PAD2-SPEC-BVM-001）的 14 条业务规则 + 8 条 DFX 约束与 design.md（PAD2-DESIGN-BVM-001）的 7 个关键决策、9 个新增文件、3 个变更文件，分解为 5 个阶段 13 个任务（8 个实现 + 3 个测试 + 2 个验证）。任务按业务功能垂直切割（状态与常量/展示组件/切换入口与接入/测试/验证），按依赖关系排序（P1 基础 → P2 展示 → P3 接入 → P4 测试 → P5 验证），被依赖者在前。所有任务遵守 HC-01~06 硬约束，覆盖全部 REQ/DFX 与设计决策。下一步由编码执行 agent 按任务顺序实现。
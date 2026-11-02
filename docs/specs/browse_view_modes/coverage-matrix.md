# browse_view_modes 需求覆盖矩阵

## 业务规则覆盖（REQ-VM-01~14）

| REQ | 描述 | 覆盖任务 | 测试 |
|-----|------|---------|------|
| REQ-VM-01 | 视图模式切换入口 | TASK-VM-06 | T-VM-05 |
| REQ-VM-02 | 切换纯前端重渲染，无 SMB 请求 | TASK-VM-07/08 | T-VM-09 |
| REQ-VM-03 | 持久化恢复 | TASK-VM-01 | T-VM-01 |
| REQ-VM-04 | 默认详细信息 | TASK-VM-01/07 | T-VM-02 |
| REQ-VM-05 | 全局偏好（跨共享） | TASK-VM-01 | T-VM-04 |
| REQ-VM-06 | 三种图标网格模式 | TASK-VM-02/04/05 | T-VM-06/07/08 |
| REQ-VM-07 | 平铺模式 | TASK-VM-03 | T-VM-08 |
| REQ-VM-08 | 详细信息模式 | TASK-VM-07 | T-VM-08 |
| REQ-VM-09 | 与排序正交 | TASK-VM-07 | T-VM-10 |
| REQ-VM-10 | 与搜索正交 | TASK-VM-07 | T-VM-10 |
| REQ-VM-11 | 加载/空态兼容 | TASK-VM-07 | T-VM-11 |
| REQ-VM-12 | 多选态兼容 | TASK-VM-04/08 | T-VM-12 |
| REQ-VM-13 | 入口标识缩写徽章 | TASK-VM-06 | T-VM-05 |
| REQ-VM-14 | 无网络请求 | TASK-VM-07/08 | T-VM-09 |

## DFX 约束覆盖（DFX-VM-01~08）

| DFX | 描述 | 覆盖任务 | 测试 |
|-----|------|---------|------|
| DFX-VM-01 | 切换<100ms | TASK-VM-07 | — (纯前端重渲染) |
| DFX-VM-02 | 大量条目虚拟化 | TASK-VM-05 | T-VM-13 |
| DFX-VM-03 | 损坏数据降级 | TASK-VM-01 | T-VM-03 |
| DFX-VM-04 | 离线可切换 | TASK-VM-07/08 | — (纯 UI 变更) |
| DFX-VM-05 | 无敏感字段持久化 | TASK-VM-01 | T-VM-14 |
| DFX-VM-06 | 零新增依赖 | — | HC-01 |
| DFX-VM-07 | 旧数据兼容 | TASK-VM-01 | T-VM-01 |
| DFX-VM-08 | detail 视觉等价 | TASK-VM-07 | T-VM-08 |

## 设计决策落地（D-VM-01~07）

| 决策 | 描述 | 落地任务 |
|------|------|---------|
| D-VM-01 | viewMode 持久化位置（uiPrefsStore） | TASK-VM-01 |
| D-VM-02 | 网格虚拟化（复用 useVirtualList） | TASK-VM-05 |
| D-VM-03 | FileList 按 viewMode 分发 | TASK-VM-07 |
| D-VM-04 | 图标尺寸/列数分级常量 | TASK-VM-02 |
| D-VM-05 | ViewModeMenu 入口位置与模式 | TASK-VM-06 |
| D-VM-06 | TileRow 平铺行布局变体 | TASK-VM-03 |
| D-VM-07 | IconGridItem 网格项交互 | TASK-VM-04 |

## 文件清单核对

### 新增文件（9 个）
- [x] `src/ui/pages/BrowsePage/viewModeConfig.ts`（TASK-VM-02）
- [x] `src/ui/pages/BrowsePage/ViewModeMenu/index.tsx` + `style.module.css`（TASK-VM-06）
- [x] `src/ui/pages/BrowsePage/IconGrid/index.tsx` + `style.module.css`（TASK-VM-05）
- [x] `src/ui/pages/BrowsePage/IconGrid/IconGridItem/index.tsx` + `style.module.css`（TASK-VM-04）
- [x] `src/ui/pages/BrowsePage/TileRow/index.tsx` + `style.module.css`（TASK-VM-03）

### 变更文件（3 个）
- [x] `src/state/uiPrefsStore.ts`（TASK-VM-01，+ViewMode 类型/viewMode 字段/setViewMode/isViewMode 守卫）
- [x] `src/ui/pages/BrowsePage/index.tsx`（TASK-VM-08，+ViewModeMenu + viewMode 传递）
- [x] `src/ui/pages/BrowsePage/FileList/index.tsx`（TASK-VM-07，按 viewMode 分发渲染）

### 保留兼容文件（零变更）
- [x] `src/main.tsx` / `src/App.tsx`（启动链零变更）
- [x] `src/state/browseContextStore.ts` / `src/state/browseStore.ts`（视图模式正交）
- [x] `src/ui/pages/BrowsePage/FileRow/index.tsx`（detail 模式渲染组件）
- [x] `src/ui/hooks/useVirtualList.ts` / `src/ui/components/ListRow/index.tsx` / `src/ui/components/BottomSheet/index.tsx`
- [x] `src/ui/icons/fileTypeIcons.ts` / `src/ui/icons/Icon.tsx` / `src/utils/fileUtils.ts` / `src/ui/hooks/useLongPress.ts`

## 单元测试结果

- 测试文件：`test/viewMode.test.ts`
- 测试总数：32
- 通过：32
- 失败：0
- 覆盖：REQ-VM-01~14 + DFX-VM-01~08 全覆盖
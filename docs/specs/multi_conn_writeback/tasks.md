# 编码任务清单：多 SMB 并发连接与 WPS 编辑可靠回写

> **文档编号**：PAD2-TASKS-MCWB-001
> **Feature Name**：multi_conn_writeback
> **上游规格**：`docs/specs/multi_conn_writeback/spec.md`（PAD2-SPEC-MCWB-001）
> **上游设计**：`docs/specs/multi_conn_writeback/design.md`（PAD2-DESIGN-MCWB-001）
> **基线版本**：PAD2 v1.5（code 6），包名 com.pad2.filemanager
> **文档定位**：本文档为规格驱动开发（SDD）第三阶段产物，将 design.md 技术设计分解为可执行、可验收的编码任务。每个任务含输入/输出/变更文件/验收标准/依赖/风险/测试要求。
> **任务编号规范**：`TASK-MC-XX`（多连接）/ `TASK-WB-XX`（写回）/ `TASK-IT-XX`（集成测试）/ `TASK-RT-XX`（回归测试）/ `TASK-VF-XX`（最终验证）
> **硬约束（贯穿全部任务）**：
> - HC-01 零新增 npm 依赖
> - HC-02 冻结区零变更：`src/adapter/smb/SmbPlugin.ts` / `src/core/**` / `android/**`
> - HC-03 `src/main.tsx` 改动限 3 行内
> - HC-04 store 分级：store 为 SmbPlugin 唯一调用入口，UI 层不得直接 import SmbPlugin
> - HC-05 既有 profile 持久化兼容（`pad2.profiles.v1` 不变）
> - HC-06 只读模式兼容（写回启用后默认 false + 路径越界仍拒绝）
> **路径勘误**：design.md 与 prompt 标注的 `src/orchestration/writeback/WritebackExecutor.ts` 实际不存在，真实路径为 `src/state/writebackExecutor.ts`（由 `editSessionStore.ts:20` import 证实）。本任务清单以真实路径为准。

---

## 任务依赖关系图

```
TASK-MC-01 (ConnectionHandle + 状态机抽取)
  └─> TASK-MC-02 (smbMultiConnStore 活跃连接集合)
        ├─> TASK-MC-03 (browseContextStore 浏览分区)
        │     └─> TASK-MC-06 (BrowsePage per-profile 消费)
        ├─> TASK-MC-04 (工作台多卡渲染)
        └─> TASK-MC-05 (ProfilesListPanel + SideNav 徽章真实化)

TASK-WB-01 (writebackConfig 配置驱动)
  └─> TASK-WB-02 (writePermission/readOnlyMode 改造)
        └─> TASK-WB-03 (editSessionStore writeback_unavailable 态 + 假成功消除)
              └─> TASK-WB-04 (WritebackUnavailableBanner + BrowsePage 消费)

TASK-MC-* + TASK-WB-*  ──>  TASK-IT-01 (集成测试)
                       ──>  TASK-RT-01 (回归测试)
                       ──>  TASK-VF-01 (tsc strict + 冻结区校验 + 最终门禁)
```

**可并行组**：
- 组 A（多连接）：TASK-MC-01 → 02 →（03/04/05 并行）→ 06
- 组 B（写回）：TASK-WB-01 → 02 → 03 → 04
- 组 A 与组 B 无交叉依赖，可并行推进

---

## 1. 多 SMB 并发连接管理（REQ-MC）

### TASK-MC-01：抽取 per-handle 六态状态机与 ConnectionHandle 模型

**做什么**：从 `smbConnectionStore.ts` 抽取六态状态机迁移表与受控迁移逻辑为可复用的 per-handle 模块，定义 `ConnectionHandle` 数据结构（profileId / state / lastError / lastConnect / isHot），实现单句柄状态机迁移函数。不修改既有 `smbConnectionStore.ts`（保留兼容，HC-05/R-07）。

**变更文件**：
| 文件 | 类型 | 说明 |
|------|------|------|
| `src/state/connectionHandle.ts` | 新增 | ConnectionHandle 类型 + per-handle 状态机迁移函数（~90 行） |
| `src/state/smbConnectionStore.ts` | 保留 | 零变更，既有单连接 store 供 M2VerificationPage 兼容 |

**输入/输出**：
- 输入：`SmbConnectionState`（复用既有六态类型）、`SmbConnectionError`、`SmbConnectOptions`
- 输出：`ConnectionHandle` 接口、`createHandle(profileId)` 工厂、`transitionHandle(handle, to, patch)` 受控迁移函数、`TRANSITIONS` 迁移表（从既有 store 抽取为导出常量）

**验收标准**：
- [ ] `ConnectionHandle` 含 `profileId / state / lastError / lastConnect / isHot` 五字段，类型经 tsc strict 通过
- [ ] `transitionHandle` 校验 `TRANSITIONS[from].includes(to)`，非法迁移开发模式 `console.error` 不抛出（与既有 `:74-78` 行为一致）
- [ ] `TRANSITIONS` 迁移表与 `smbConnectionStore.ts:58-65` 逐项一致（disconnected/connecting/connected/connect_failed/session_invalid/network_interrupted 六态 + 合法出边）
- [ ] `lastConnect` 为内存凭据，类型标注不持久化（与既有 `:68` 语义一致，DFX-MC-04 凭据安全）
- [ ] 既有 `smbConnectionStore.ts` 零变更（git diff 为空），其 `TRANSITIONS` 可改为从新模块 re-export（可选，保持单一事实源）

**依赖**：无（基础设施任务）

**风险标注**：🟡 中风险 — 状态机抽取须保证与既有 `smbConnectionStore` 行为逐字节一致，避免迁移表漂移导致既有单连接回归失败。缓解：抽取后既有 store 改为 re-export 同一 `TRANSITIONS`，单一事实源。

**测试要求**：
- [ ] 单元测试 `verify-mc-01-handle.mjs` → `mc01-handle-result.json`：覆盖六态全部合法迁移 + 至少 4 条非法迁移被拒绝（disconnected→connected、connected→connecting、connect_failed→connected、session_invalid→connected）
- [ ] 断言 `transitionHandle` 非法迁移不抛出且不改变 state

---

### TASK-MC-02：实现 smbMultiConnStore 活跃连接集合（NEW-MC-01~06）

**做什么**：新增 `smbMultiConnStore`，维护 `Map<profileId, ConnectionHandle>` 活跃连接集合，实现多连接 connect/disconnect/reconnect/probe/switchHotTo/activeHandles/getHandle。采用 D-MC-01 决策（逻辑多连接 + 物理单会话热切换）：connect 新共享不 disconnect 旧共享（消除 RC-MC-02 根因），仅切换 hot profile；并发上限校验（MAX_CONCURRENT=4）。

**变更文件**：
| 文件 | 类型 | 说明 |
|------|------|------|
| `src/state/smbMultiConnStore.ts` | 新增 | 活跃连接集合 store（~220 行），SmbPlugin 唯一多连接入口 |
| `src/state/connectionHandle.ts` | 依赖 | TASK-MC-01 产物 |
| `src/adapter/smb/SmbPlugin.ts` | 冻结 | 零变更（HC-02），仅调用既有 connect/disconnect/isConnected |

**输入/输出**：
- 输入：`connect(profileId, options)` / `disconnect(profileId)` / `switchHotTo(profileId)`
- 输出：`handles: ReadonlyMap<string, ConnectionHandle>` / `hotProfileId` / `activeHandles(): ConnectionHandle[]`

**核心逻辑（须逐条实现）**：
- [ ] `connect(profileId, options)`：①防重入（该 handle 已 connecting 则忽略）②同 profile 幂等（handle 已 connected 且 profileId 一致则返回，REQ-MC-06）③上限校验（`handles.size >= MAX_CONCURRENT` 且无该 profileId 时拒绝并设置 lastError 提示"已达并发连接上限 4"，REQ-MC-07）④**不 disconnect 既有连接**（消除 RC-MC-02，REQ-MC-01/08）⑤创建/复用 handle，迁移 connecting→connected，设置 isHot=true、hotProfileId=profileId，旧 hot 的 isHot=false（逻辑仍 connected）
- [ ] `disconnect(profileId)`：仅断开指定 handle，迁移 connected→disconnected，从集合移除；若该 handle 为 hot 则 SmbPlugin.disconnect()；**其他 handle 不受影响**（REQ-MC-04 隔离）
- [ ] `switchHotTo(profileId)`：将物理热会话切换到指定 profile，后台异步 SmbPlugin.connect（REQ-MC-03 降级披露：逻辑层复用缓存不重连，物理层异步重连）
- [ ] `applyOperationError(profileId, error)`：仅迁移指定 handle 的 connected→session_invalid/network_interrupted，不污染其他 handle（REQ-MC-05 独立维护）
- [ ] `MAX_CONCURRENT = 4` 导出为常量（DFX-MC-01 下限）

**验收标准**：
- [ ] 连接共享 B 时共享 A 保持 connected 态且不触发 `SmbPlugin.disconnect()`（REQ-MC-01，可用 mock 计数断言 disconnect 调用次数为 0）
- [ ] 已连接 4 个后连接第 5 个被拒绝，既有 4 个保持 connected（REQ-MC-07）
- [ ] 同 profile 重复 connect 幂等返回，无新会话建立（REQ-MC-06）
- [ ] disconnect(A) 后 B、C 保持 connected 且可继续操作（REQ-MC-04）
- [ ] A 触发 network_interrupted 时 B 的 state 保持 connected 不变（REQ-MC-05）
- [ ] 每个句柄独立暴露 state/lastError（DFX-MC-05 可观测）
- [ ] 凭据仅内存持有（lastConnect），不入持久化、不入日志（DFX-MC-04）
- [ ] tsc strict 通过，UI 层不直接 import SmbPlugin（HC-04，本 store 为唯一入口）

**依赖**：TASK-MC-01

**风险标注**：🔴 高风险 — 架构冲突 R-01（HC-02 冻结区 vs REQ-MC-01/03）：SmbPlugin 单会话接口无 sessionId，物理多会话并发无法实现。采用 D-MC-01 折中（逻辑多连接 + 物理热切换），REQ-MC-03"切换浏览不触发 connect"在物理层无法完整满足，已降级披露。缓解：逻辑层满足 DFX-MC-02（<500ms），物理重连后台异步不阻塞 UI；完整满足需解冻 SmbPlugin 扩展 sessionId（OUT_OF_SCOPE）。

**测试要求**：
- [ ] `verify-mc-01.mjs` → `mc01-result.json`：connect B 时 A 不断开（mock SmbPlugin.disconnect 调用次数=0），A 保持 connected
- [ ] `verify-mc-07.mjs` → `mc07-result.json`：4 个连接后第 5 个被拒绝 + 提示文案断言
- [ ] `verify-mc-06.mjs` → `mc06-result.json`：同 profile 幂等（mock connect 调用次数=1）
- [ ] `verify-mc-04.mjs` → `mc04-result.json`：disconnect(A) 后 B、C state 不变
- [ ] `verify-mc-05.mjs` → `mc05-result.json`：applyOperationError(A) 后 B.state 不变
- [ ] 新增 `__setSmbPluginDepsForTest` 注入 mock connect/disconnect/isConnected（design.md §2.7.1 测试注入点）

---

### TASK-MC-03：实现 browseContextStore 浏览上下文按 profileId 分区（NEW-MC-07）

**做什么**：新增 `browseContextStore`，维护 `Map<profileId, BrowseContextEntry>` 浏览上下文分区，每 profile 独立 currentPath/files/loading/loadError/sort/searchQuery。`setActiveProfile` 同步切换 activeProfileId 复用既有上下文，不触发 SmbPlugin.connect（REQ-MC-03 逻辑层）。

**变更文件**：
| 文件 | 类型 | 说明 |
|------|------|------|
| `src/state/browseContextStore.ts` | 新增 | 浏览上下文分区 store（~180 行） |
| `src/state/smbMultiConnStore.ts` | 依赖 | TASK-MC-02 产物，校验 profileId 是否 connected |
| `src/adapter/smb/SmbPlugin.ts` | 冻结 | 零变更，仅调用既有 listDirectory |

**输入/输出**：
- 输入：`setActiveProfile(profileId)` / `enterDirectory(profileId, path)` / `refresh(profileId)` / `setSort` / `setSearchQuery`
- 输出：`contexts: ReadonlyMap<string, BrowseContextEntry>` / `activeProfileId` / `getContext(profileId)`

**核心逻辑**：
- [ ] `setActiveProfile(profileId)`：同步切换 activeProfileId（仅内存指针切换），不调用 SmbPlugin.connect，复用既有 BrowseContextEntry（REQ-MC-03）
- [ ] `enterDirectory(profileId, path)`：若该 profile 非 hot 则先 `smbMultiConnStore.switchHotTo(profileId)` 再 SmbPlugin.listDirectory；首次进入创建 BrowseContextEntry
- [ ] 连接断开时清除对应 BrowseContextEntry（生命周期随连接）
- [ ] 切换响应 < 500ms（DFX-MC-02，setActiveProfile 为纯内存操作）

**验收标准**：
- [ ] A、B 均 connected，setActiveProfile(B) 不触发 SmbPlugin.connect（mock 计数断言）
- [ ] 切换后立即呈现 B 既有上下文（currentPath/files 复用）
- [ ] setActiveProfile 同步完成 < 500ms（DFX-MC-02）
- [ ] 每 profile 上下文独立，切换 A/B 互不污染（A 的 sort/searchQuery 不影响 B）
- [ ] 连接断开后对应上下文清除，重连后重新创建
- [ ] tsc strict 通过

**依赖**：TASK-MC-02

**风险标注**：🟡 中风险 — R-06（物理会话频繁切换重连风暴）：缓解：switchHotTo 防抖 300ms，浏览上下文缓存优先，仅在实际 listDirectory 时重连。

**测试要求**：
- [ ] `verify-mc-03.mjs` → `mc03-result.json`：setActiveProfile 不触发 connect（mock 计数=0），切换 < 500ms
- [ ] 上下文独立性：A 设 sort=name，切到 B 设 sort=size，切回 A 断言 sort=name

---

### TASK-MC-04：工作台多 SMB 卡并发渲染（NEW-MC-08）

**做什么**：改造 `StorageOverviewRow` 由渲染单 SMB 卡（RC-MC-04）改为引入新 `MultiSmbCards` 组件按 `smbMultiConnStore.activeHandles()` 渲染多张 SMB 状态卡，本地/SD 卡保留。每卡独立呈现连接状态与共享标识。

**变更文件**：
| 文件 | 类型 | 说明 |
|------|------|------|
| `src/ui/pages/HomePage/StorageOverviewRow/MultiSmbCards.tsx` | 新增 | 多 SMB 卡渲染组件（~120 行） |
| `src/ui/pages/HomePage/StorageOverviewRow/index.tsx` | 变更 | 单 SMB 卡 → 引入 MultiSmbCards（+20 行，:97,126-147 改造） |
| `src/state/smbMultiConnStore.ts` | 依赖 | 消费 activeHandles() |
| `src/state/smbProfilesStore.ts` | 依赖 | 零变更，消费 profiles 取共享标识 |

**输入/输出**：
- 输入：`smbMultiConnStore.activeHandles()` + `smbProfilesStore.profiles`
- 输出：ReactNode[]（多张 SMB 状态卡网格）

**验收标准**：
- [ ] 3 个共享均 connected 时工作台同时显示 3 张状态卡，各卡状态独立（REQ-MC-02）
- [ ] 共享 A 断开后工作台移除 A 状态卡，B、C 保留（REQ-MC-02 第二验收条件）
- [ ] 本地存储/SD 卡状态卡保留不变（仅 SMB 卡由单变多）
- [ ] 每卡呈现共享名称 + 连接状态徽章（connected/connecting/connect_failed 等）
- [ ] tsc strict 通过，UI 层不直接 import SmbPlugin（HC-04，经 store 订阅）

**依赖**：TASK-MC-02

**风险标注**：🟢 低风险 — 纯 UI 渲染改造，复用既有 ConnectionCard（AS-02）。

**测试要求**：
- [ ] `verify-mc-02-ui.mjs` → `mc02-ui-result.json`：mock 3 个 activeHandles 断言渲染 3 卡；断开 1 个后断言 2 卡
- [ ] 快照测试：本地/SD 卡数量不受影响

---

### TASK-MC-05：连接页与侧边栏徽章状态真实化

**做什么**：改造 `ProfilesListPanel` 的 ConnectionCard 状态判定与 `SideNav` 徽章取 `smbMultiConnStore` per-handle 真实态（消除 AS-02/AS-03 中"非 active 恒为 idle"的旧逻辑）。

**变更文件**：
| 文件 | 类型 | 说明 |
|------|------|------|
| `src/ui/pages/ConnectionPage/ProfilesListPanel/index.tsx` | 变更 | ConnectionCard 状态取 smbMultiConnStore per-handle 真实态（+10 行，:294-304 改造） |
| `src/ui/layouts/AppShell/SideNav/index.tsx` | 变更 | 徽章取 smbMultiConnStore per-handle 真实态（+8 行，:97-123 改造） |
| `src/state/smbMultiConnStore.ts` | 依赖 | 消费 getHandle(profileId) |

**验收标准**：
- [ ] 多个共享 connected 时，ProfilesListPanel 每张卡与 SideNav 每个徽章均显示真实 connected 态（非仅 active 的 connected、其余 idle）
- [ ] 共享 A 为 connect_failed 时，A 卡与 A 徽章显示失败态，B、C 显示 connected
- [ ] 既有 smbConnectionStore 调用方（M2VerificationPage）不受影响（R-04 缓解：M2 保持既有单连接路径）
- [ ] tsc strict 通过

**依赖**：TASK-MC-02

**风险标注**：🟡 中风险 — R-04（双源漂移）：ProfilesListPanel 可能同时消费 smbConnectionStore 与 smbMultiConnStore。缓解：新代码统一走 smbMultiConnStore，M2VerificationPage 保持既有路径。

**测试要求**：
- [ ] `verify-mc-05-ui.mjs` → `mc05-ui-result.json`：mock 3 handle（connected/connect_failed/connecting）断言 3 卡 + 3 徽章态独立正确

---

### TASK-MC-06：BrowsePage 消费 per-profile 浏览上下文

**做什么**：改造 `BrowsePage` 消费 `browseContextStore` per-profile 上下文（消除 RC-MC-05 单浏览上下文），切换共享时复用既有上下文呈现。

**变更文件**：
| 文件 | 类型 | 说明 |
|------|------|------|
| `src/ui/pages/BrowsePage/index.tsx` | 变更 | 消费 browseContextStore per-profile 上下文（+25 行，:49-67 改造） |
| `src/state/browseContextStore.ts` | 依赖 | TASK-MC-03 产物 |

**验收标准**：
- [ ] 在 A、B 间切换浏览复用既有上下文（A 的 currentPath 切回后保留）
- [ ] 切换不触发重连（经 browseContextStore.setActiveProfile，REQ-MC-03）
- [ ] A 的目录列表与 B 的目录列表独立呈现，不互相覆盖
- [ ] tsc strict 通过

**依赖**：TASK-MC-03

**风险标注**：🟢 低风险 — 纯 UI 消费改造。

**测试要求**：
- [ ] `verify-mc-06-ui.mjs` → `mc06-ui-result.json`：A 进入 /dirA，切到 B 进入 /dirB，切回 A 断言 currentPath=/dirA

---

## 2. WPS 编辑可靠回写（REQ-WB）

### TASK-WB-01：实现 writebackConfig 配置驱动模块（NEW-WB-01）

**做什么**：新增 `writebackConfig` 模块，从 Capacitor Preferences `pad2.writeback.v1` 读取写回启用配置，默认 `{ enabled: false, writablePaths: ['/mnt/share/writable/'], account: 'pad2_app' }`（HC-06 兼容）。导出 `isWritebackGloballyEnabled()` / `loadWritebackConfig()` / `setWritebackEnabled()`。

**变更文件**：
| 文件 | 类型 | 说明 |
|------|------|------|
| `src/state/writebackConfig.ts` | 新增 | 写回配置驱动（~80 行） |

**输入/输出**：
- 输入：Capacitor Preferences key `pad2.writeback.v1`
- 输出：`WritebackConfig { enabled, writablePaths, account }` + 三个函数

**核心逻辑**：
- [ ] `loadWritebackConfig()`：从 Preferences 读取，缺失时返回默认（enabled=false，HC-06）
- [ ] `isWritebackGloballyEnabled()`：返回已加载配置的 enabled
- [ ] `setWritebackEnabled(enabled)`：写入 Preferences 并刷新内存缓存
- [ ] 不引入新 npm 依赖（HC-01），复用既有 `@capacitor/preferences`（已在项目中）

**验收标准**：
- [ ] 首次调用（无持久化）返回 enabled=false（HC-06 只读兼容）
- [ ] setWritebackEnabled(true) 后 isWritebackGloballyEnabled() 返回 true
- [ ] 持久化键 `pad2.writeback.v1` 与既有 `pad2.profiles.v1` 不冲突（HC-05）
- [ ] tsc strict 通过，零新增 npm 依赖

**依赖**：无（基础设施任务）

**风险标注**：🟢 低风险 — 纯配置读写，默认 false 保持兼容。

**测试要求**：
- [ ] `verify-wb-01-config.mjs` → `wb01-config-result.json`：默认 false、set true 后 true、持久化键不冲突

---

### TASK-WB-02：writePermission / readOnlyMode 改为配置驱动

**做什么**：将 `writePermission.ts` 的 `WRITE_ENABLED_SCOPE.enabled` 由 `as const` 硬编码 false 改为调用 `isWritebackGloballyEnabled()`（消除 RC-WB-01/02 根因）；`readOnlyMode.ts` 的 `READ_ONLY_MODE` 改为 `!isWritebackGloballyEnabled()`。`accountHasWritePermission()` 改为配置驱动（读取 writebackConfig.account）。

**变更文件**：
| 文件 | 类型 | 说明 |
|------|------|------|
| `src/state/writePermission.ts` | 变更 | enabled 改为 isWritebackGloballyEnabled() 调用；accountHasWritePermission 改为配置驱动（+12 行，:25,129-131,143-144 改造） |
| `src/state/readOnlyMode.ts` | 变更 | READ_ONLY_MODE 改为 !isWritebackGloballyEnabled()（+2 行，:13 改造） |
| `src/state/writebackConfig.ts` | 依赖 | TASK-WB-01 产物 |
| `src/state/operationStore.ts` | 变更 | writeback 能力派生改为配置驱动（:131-132，消除 RC-WB-05） |

**验收标准**：
- [ ] `isWriteEnabledForPath` 在 enabled=false 时返回 false（HC-06 兼容）
- [ ] enabled=true 且路径在 writablePaths 内且账户有权限时返回 true（REQ-WB-01）
- [ ] **enabled=true 但路径越界时仍返回 false**（DFX-WB-07，三条件 AND 守卫不变）
- [ ] 全量替换 `!WRITE_ENABLED_SCOPE.enabled` 引用为 `!isWritebackGloballyEnabled()`（R-03 缓解）
- [ ] `READ_ONLY_MODE` 在 enabled=false 时为 true，enabled=true 时为 false
- [ ] tsc strict 通过，无 `as const` 硬编码 enabled 残留

**依赖**：TASK-WB-01

**风险标注**：🔴 高风险 — R-03（破坏性变更）：`WRITE_ENABLED_SCOPE.enabled` 由 `as const` 改为 getter 调用，所有 `!WRITE_ENABLED_SCOPE.enabled` 引用须全量替换，遗漏导致编译错误或行为漂移。缓解：全局 grep 替换 + tsc strict 兜底；R-09（路径越界绕过）：既有三条件 AND 守卫不变，启用后回归验证。

**测试要求**：
- [ ] `verify-wb-dfx07.mjs` → `wbdfx07-result.json`：enabled=true 但路径越界 → isWriteEnabledForPath 返回 false（DFX-WB-07）
- [ ] `verify-wb-02-perm.mjs` → `wb02-perm-result.json`：enabled=false → 全拦截；enabled=true + 路径内 + 账户有权限 → 放行
- [ ] grep 校验：`WRITE_ENABLED_SCOPE.enabled` 无直接布尔字面量引用

---

### TASK-WB-03：editSessionStore 新增 writeback_unavailable 态 + 假成功消除分支（NEW-WB-02/03）

**做什么**：在 `EditSessionState` 类型新增 `writeback_unavailable` 态枚举值；改造 `applyForegroundCheckResult` 分支3（`:245-247` 假成功根因点）：`result.changed && !perm.permitted` 时由静默 `transition('editing')` 改为 `transition('writeback_unavailable', perm.reason)` + 设置 lastError，不显示任何成功语义。

**变更文件**：
| 文件 | 类型 | 说明 |
|------|------|------|
| `src/state/editSessionStore.ts` | 变更 | 新增 writeback_unavailable 态枚举 + 改造 applyForegroundCheckResult 分支3（+15 行，:63-77 类型、:245-247 分支改造） |
| `src/state/writebackExecutor.ts` | 保留 | 零变更，复用 AS-05 全链路 |
| `src/state/writebackResultMapper.ts` | 保留 | 零变更，复用结果映射 |

**核心逻辑（分支3 改造，伪代码）**：
```
// 既有（RC-WB-04 假成功根因）:
} else {
  transition(set, get, 'editing');  // :246 静默转 editing，无告知
}
// 改造为:
} else {
  transition(set, get, 'writeback_unavailable', perm.reason);  // 新增态
  set({ lastError: { category: 'permission_denied', userMessage: perm.reason ?? '写回不可用' } });
  return;  // 不静默转 editing，不显示成功
}
```

**验收标准**：
- [ ] `EditSessionState` 类型含 `writeback_unavailable`（tsc strict 通过）
- [ ] `applyForegroundCheckResult` 在 `changed && !perm.permitted` 时迁移到 `writeback_unavailable` 而非 `editing`（消除 RC-WB-04）
- [ ] 迁移到 `writeback_unavailable` 时设置 lastError 含可读原因（REQ-WB-04）
- [ ] 不显示任何成功语义（不经过 writeback_success 路径，DFX-WB-04）
- [ ] 既有 `perm.permitted=true` 分支（saving→writeback_pending→executeWriteback）行为不变
- [ ] 既有 `saveAsDiscovered` 分支行为不变
- [ ] writebackExecutor / writebackResultMapper 零变更（git diff 为空，复用 AS-05）
- [ ] tsc strict 通过

**依赖**：TASK-WB-02

**风险标注**：🔴 高风险 — 此为问题2（假成功）的核心消除点，直接改 `:245-247` 既有行为。缓解：既有测试注入点 `__setPermissionCheckForTest`（`:52-56`）可注入 mock 权限判定验证分支；既有 `perm.permitted=true` 分支保持不变，仅改 `!permitted` 分支。

**测试要求**：
- [ ] `verify-wb-04.mjs` → `wb04-result.json`：mock perm.permitted=false + result.changed=true → state=writeback_unavailable（非 editing），lastError 含原因
- [ ] `verify-wb-state.mjs` → `wbstate-result.json`：writeback_unavailable 态迁移合法（editing→writeback_unavailable→editing 用户确认后）
- [ ] `verify-wb-02.mjs` → `wb02-result.json`：mock perm.permitted=true + 校验通过 → writeback_success（既有路径不破坏）
- [ ] 断言 writeback_unavailable 路径不经过 writeback_success（DFX-WB-04 禁止伪报成功）

---

### TASK-WB-04：WritebackUnavailableBanner UI + BrowsePage 消费（NEW-WB-04）

**做什么**：新增 `WritebackUnavailableBanner` 组件消费 `editSessionStore` 的 `writeback_unavailable` 态，呈现"本地修改不会写回服务器（原因：{lastError.userMessage}）"明确告知；BrowsePage 消费该态渲染 Banner。

**变更文件**：
| 文件 | 类型 | 说明 |
|------|------|------|
| `src/ui/components/WritebackUnavailableBanner/index.tsx` | 新增 | 写回不可用告知 Banner（~60 行） |
| `src/ui/pages/BrowsePage/index.tsx` | 变更 | 消费 writeback_unavailable 态渲染 Banner（+10 行） |
| `src/state/editSessionStore.ts` | 依赖 | TASK-WB-03 产物 |

**验收标准**：
- [ ] editSessionStore.state === 'writeback_unavailable' 时 BrowsePage 渲染 WritebackUnavailableBanner
- [ ] Banner 文案含"本地修改不会写回服务器" + 具体原因（REQ-WB-04）
- [ ] Banner 不显示任何成功语义（无"已保存"字样，DFX-WB-04）
- [ ] 用户可关闭 Banner，会话回到 editing 态等待后续操作（design.md D-WB-02）
- [ ] writeback_success 态不渲染该 Banner（不误报不可用）
- [ ] tsc strict 通过，UI 层不直接 import SmbPlugin（HC-04）

**依赖**：TASK-WB-03

**风险标注**：🟢 低风险 — 纯 UI 消费新增态。

**测试要求**：
- [ ] `verify-wb-04-ui.mjs` → `wb04-ui-result.json`：state=writeback_unavailable → Banner 渲染 + 文案断言；state=writeback_success → Banner 不渲染

---

## 3. 集成测试（真机/模拟器）

### TASK-IT-01：多连接与写回端到端集成测试

**做什么**：在真机/模拟器上执行 design.md §2.7.2 集成测试矩阵，覆盖多连接并发、故障隔离、上限保护、切换浏览、回写成功/不可用/网络中断/冲突全路径。

**变更文件**：
| 文件 | 类型 | 说明 |
|------|------|------|
| `tests/integration/it-mc-wb.mjs` | 新增 | 集成测试脚本（Node.js ES Module，PREFERENCE_10） |
| `tests/integration/it-mc-wb-result.json` | 产出 | 测试结果 JSON |

**测试矩阵（须全部 PASS）**：
| 测试编号 | 场景 | 覆盖需求 | 通过条件 |
|---------|------|---------|---------|
| IT-MC-01 | 同时连接 4 个不同 SMB 共享 | DFX-MC-01/REQ-MC-02 | 4 个均 connected 且工作台显示 4 卡 |
| IT-MC-02 | 共享 A 连接失败时 B 保持 connected | DFX-MC-03/REQ-MC-01 | A 入 connect_failed，B 保持 connected |
| IT-MC-03 | 已连接 4 个后连接第 5 个 | REQ-MC-07 | 拒绝第 5 个 + 提示"已达并发连接上限 4" |
| IT-MC-04 | 在 A、B 间切换浏览 | DFX-MC-02/REQ-MC-03 | 切换 < 500ms，复用既有上下文 |
| IT-WB-01 | WPS 编辑保存后回写成功 | REQ-WB-01/02 | 服务器文件更新 + SHA-256 校验通过 + 显示"已保存到共享" |
| IT-WB-02 | 写回不可用时 WPS 保存 | REQ-WB-04 | 显示"本地修改不会写回服务器"，不显示成功 |
| IT-WB-03 | 回写过程中网络中断 | REQ-WB-06 | 显示"网络中断，正在等待恢复"，原文件未破坏 |
| IT-WB-04 | 回写前远端已修改 | REQ-WB-05 | 提示冲突，提供覆盖/另存/放弃 |

**验收标准**：
- [ ] 8 项集成测试全部 PASS，结果写入 `it-mc-wb-result.json`
- [ ] IT-WB-02 断言不出现"已保存到共享"字样（DFX-WB-04）
- [ ] IT-WB-03 断言原文件 SHA-256 未变（DFX-WB-03 原文件不被破坏）

**依赖**：TASK-MC-01~06 + TASK-WB-01~04

**风险标注**：🟡 中风险 — 依赖真机/模拟器环境与 SMB 服务器就绪（pad2_app 账户 + /mnt/share/writable/ 目录 + Samba write list，D-WB-01 前置条件）。

**测试要求**：
- [ ] 集成测试前置：服务器侧 pad2_app 账户 + 可写目录 + Samba write list 就绪
- [ ] 结果 JSON 含每项测试的 PASS/FAIL + 失败原因

---

## 4. 回归测试

### TASK-RT-01：既有功能兼容性回归

**做什么**：执行 design.md §2.7.3 回归测试矩阵，确保增量变更不破坏既有 profile 持久化、只读模式、smbConnectionStore 调用方、写回执行器全链路。

**变更文件**：
| 文件 | 类型 | 说明 |
|------|------|------|
| `tests/regression/rt-mc-wb.mjs` | 新增 | 回归测试脚本 |
| `tests/regression/rt-mc-wb-result.json` | 产出 | 测试结果 JSON |

**回归矩阵（须全部 PASS）**：
| 测试编号 | 回归目标 | 验证 |
|---------|---------|------|
| RT-01 | 既有 profile 持久化兼容（HC-05） | 升级后既有 profile 列表保留可连接 |
| RT-02 | 只读模式兼容（HC-06） | enabled=false 时编辑保存仍提示"不会写回"，不破坏 |
| RT-03 | 既有 smbConnectionStore 调用方不受影响 | M2VerificationPage 连接/断开正常 |
| RT-04 | 既有写回执行器全链路不变 | writebackExecutor/writebackResultMapper 零变更，单元测试全通过 |

**验收标准**：
- [ ] RT-01：既有 `pad2.profiles.v1` 数据升级后 profile 列表完整保留（smbProfilesStore 零变更，HC-05）
- [ ] RT-02：enabled=false 时 WPS 保存显示"本地修改不会写回服务器"（经 writeback_unavailable 态，非假成功）
- [ ] RT-03：M2VerificationPage 连接/断开/重连行为与基线一致（smbConnectionStore 零变更）
- [ ] RT-04：writebackExecutor / writebackResultMapper git diff 为空，既有单元测试全通过
- [ ] 4 项回归测试全部 PASS

**依赖**：TASK-MC-01~06 + TASK-WB-01~04

**风险标注**：🔴 高风险 — R-04（双源漂移）、R-05（持久化兼容）、HC-05/HC-06 兼容性核心保障。缓解：smbConnectionStore/smbProfilesStore/writebackExecutor/writebackResultMapper 均标注零变更，git diff 校验兜底。

**测试要求**：
- [ ] git diff 校验：`src/state/smbConnectionStore.ts` / `smbProfilesStore.ts` / `writebackExecutor.ts` / `writebackResultMapper.ts` / `editWritePermission.ts` 变更行为空
- [ ] 既有 `pad2.profiles.v1` fixture 加载验证

---

## 5. 最终验证与门禁

### TASK-VF-01：tsc strict + 冻结区零变更校验 + 最终门禁

**做什么**：执行全量类型检查、冻结区零变更校验、需求覆盖矩阵核对，作为合并门禁。

**变更文件**：
| 文件 | 类型 | 说明 |
|------|------|------|
| `scripts/verify-mcwb-gate.mjs` | 新增 | 门禁校验脚本（tsc + git diff 冻结区 + 覆盖矩阵） |
| `scripts/mcwb-gate-result.json` | 产出 | 门禁结果 JSON |

**校验项（须全部 PASS）**：
| 校验编号 | 校验内容 | 通过条件 |
|---------|---------|---------|
| VF-01 | tsc strict 全量类型检查 | `tsc --noEmit` 零错误 |
| VF-02 | 冻结区零变更（HC-02） | `git diff` 对 `src/adapter/smb/SmbPlugin.ts` / `src/core/**` / `android/**` 为空 |
| VF-03 | main.tsx 改动限 3 行内（HC-03） | `git diff src/main.tsx` 新增行数 ≤ 3 |
| VF-04 | 零新增 npm 依赖（HC-01） | `package.json` dependencies 变更为空 |
| VF-05 | 既有 profile 持久化键不变（HC-05） | `pad2.profiles.v1` 键名未改 |
| VF-06 | 需求覆盖矩阵 | REQ-MC-01~08 + REQ-WB-01~08 均有任务映射 |
| VF-07 | 单元测试全通过 | verify-mc-*.mjs + verify-wb-*.mjs 全 PASS |
| VF-08 | 集成测试全通过 | TASK-IT-01 全 PASS |
| VF-09 | 回归测试全通过 | TASK-RT-01 全 PASS |

**验收标准**：
- [ ] VF-01~09 全部 PASS，结果写入 `mcwb-gate-result.json`
- [ ] 冻结区文件 git diff 严格为空（HC-02 硬约束）
- [ ] 需求覆盖矩阵：REQ-MC-01→TASK-MC-02、REQ-MC-02→TASK-MC-04、REQ-MC-03→TASK-MC-03/06、REQ-MC-04→TASK-MC-02、REQ-MC-05→TASK-MC-01/02、REQ-MC-06→TASK-MC-02、REQ-MC-07→TASK-MC-02、REQ-WB-01→TASK-WB-01/02、REQ-WB-02→TASK-WB-03、REQ-WB-03→TASK-WB-03、REQ-WB-04→TASK-WB-03/04、REQ-WB-05~07→既有 writebackExecutor 复用（AS-05）

**依赖**：TASK-IT-01 + TASK-RT-01

**风险标注**：🔴 高风险 — 此为合并前最后门禁，冻结区零变更（VF-02）与 main.tsx 限 3 行（VF-03）为硬约束，任一失败 BLOCKED 合并。

**测试要求**：
- [ ] 门禁脚本输出结构化 JSON，含每项 PASS/FAIL + 失败详情
- [ ] 冻结区校验失败时明确列出违规文件清单

---

## 6. 需求覆盖矩阵

| 需求编号 | 覆盖任务 | 覆盖状态 |
|---------|---------|---------|
| REQ-MC-01 并发连接不隐式断开 | TASK-MC-02 | SUPPORTED |
| REQ-MC-02 工作台并发呈现 | TASK-MC-04 | SUPPORTED |
| REQ-MC-03 跨共享切换不重连 | TASK-MC-03 + TASK-MC-06 | SUPPORTED（逻辑层；物理层降级披露，R-01） |
| REQ-MC-04 单连接断开隔离 | TASK-MC-02 | SUPPORTED |
| REQ-MC-05 连接状态独立维护 | TASK-MC-01 + TASK-MC-02 | SUPPORTED |
| REQ-MC-06 同 profile 幂等 | TASK-MC-02 | SUPPORTED |
| REQ-MC-07 并发上限保护 | TASK-MC-02 | SUPPORTED |
| REQ-MC-08 禁止项 | TASK-MC-02 + TASK-MC-04 | SUPPORTED |
| REQ-WB-01 写回功能启用 | TASK-WB-01 + TASK-WB-02 | SUPPORTED |
| REQ-WB-02 校验通过方显示成功 | TASK-WB-03（复用 AS-05） | SUPPORTED |
| REQ-WB-03 回写失败明确报错 | TASK-WB-03（复用 AS-05） | SUPPORTED |
| REQ-WB-04 写回不可用明确告知 | TASK-WB-03 + TASK-WB-04 | SUPPORTED |
| REQ-WB-05 编辑冲突防护 | 既有 writebackExecutor（AS-05，零变更） | SUPPORTED |
| REQ-WB-06 回写网络中断恢复 | 既有 writebackExecutor（AS-05，零变更） | SUPPORTED |
| REQ-WB-07 回写重试与错误分类 | 既有 writebackExecutor（AS-05，零变更） | SUPPORTED |
| REQ-WB-08 禁止项 | TASK-WB-03 + TASK-WB-04 | SUPPORTED |
| DFX-MC-01 并发上限≥4 | TASK-MC-02（MAX_CONCURRENT=4） | SUPPORTED |
| DFX-MC-02 切换<500ms | TASK-MC-03 | SUPPORTED |
| DFX-MC-03 单连接故障隔离 | TASK-MC-02 | SUPPORTED |
| DFX-MC-04 凭据安全 | TASK-MC-01 + TASK-MC-02 | SUPPORTED |
| DFX-MC-05 连接状态可观测 | TASK-MC-01 + TASK-MC-02 | SUPPORTED |
| DFX-MC-06 既有 profile 兼容 | TASK-RT-01（smbProfilesStore 零变更） | SUPPORTED |
| DFX-WB-02 回写数据完整性 | 既有 writebackExecutor（AS-05） | SUPPORTED |
| DFX-WB-03 原文件不被破坏 | 既有 writebackExecutor（AS-05） | SUPPORTED |
| DFX-WB-04 禁止伪报成功 | TASK-WB-03 + TASK-WB-04 | SUPPORTED |
| DFX-WB-05 写回不可用明确告知 | TASK-WB-03 + TASK-WB-04 | SUPPORTED |
| DFX-WB-07 只读模式兼容 | TASK-WB-02 + TASK-RT-01 | SUPPORTED |

---

## 7. 变更文件总清单

### 7.1 新增文件（5 个）
| 文件 | 职责 | 行数估算 | 所属任务 |
|------|------|---------|---------|
| `src/state/connectionHandle.ts` | per-handle 六态状态机 | ~90 | TASK-MC-01 |
| `src/state/smbMultiConnStore.ts` | 活跃连接集合 store | ~220 | TASK-MC-02 |
| `src/state/browseContextStore.ts` | 浏览上下文分区 store | ~180 | TASK-MC-03 |
| `src/state/writebackConfig.ts` | 写回配置驱动 | ~80 | TASK-WB-01 |
| `src/ui/pages/HomePage/StorageOverviewRow/MultiSmbCards.tsx` | 多 SMB 卡渲染 | ~120 | TASK-MC-04 |
| `src/ui/components/WritebackUnavailableBanner/index.tsx` | 写回不可用告知 | ~60 | TASK-WB-04 |

### 7.2 变更文件（7 个）
| 文件 | 变更内容 | 行数变更 | 所属任务 |
|------|---------|---------|---------|
| `src/state/editSessionStore.ts` | +writeback_unavailable 态 + 分支3 改造 | +15 | TASK-WB-03 |
| `src/state/writePermission.ts` | enabled 改配置驱动 | +12 | TASK-WB-02 |
| `src/state/readOnlyMode.ts` | READ_ONLY_MODE 改配置驱动 | +2 | TASK-WB-02 |
| `src/state/operationStore.ts` | writeback 能力派生改配置驱动 | +2 | TASK-WB-02 |
| `src/ui/pages/HomePage/StorageOverviewRow/index.tsx` | 单卡→MultiSmbCards | +20 | TASK-MC-04 |
| `src/ui/pages/ConnectionPage/ProfilesListPanel/index.tsx` | 状态取真实态 | +10 | TASK-MC-05 |
| `src/ui/layouts/AppShell/SideNav/index.tsx` | 徽章取真实态 | +8 | TASK-MC-05 |
| `src/ui/pages/BrowsePage/index.tsx` | per-profile 上下文 + Banner | +35 | TASK-MC-06 + TASK-WB-04 |

### 7.3 保留兼容文件（零变更，6 个）
| 文件 | 保留原因 | 校验任务 |
|------|---------|---------|
| `src/state/smbConnectionStore.ts` | 既有单连接 store 兼容（R-07 冻结） | TASK-RT-01/VF-02 |
| `src/state/smbProfilesStore.ts` | 多 profile 持久化已支持（AS-04，HC-05） | TASK-RT-01/VF-02 |
| `src/state/writebackExecutor.ts` | 全链路已实现（AS-05），启用后复用 | TASK-RT-01/VF-02 |
| `src/state/writebackResultMapper.ts` | 结果映射已实现，复用 | TASK-RT-01/VF-02 |
| `src/state/editWritePermission.ts` | 路径级守卫已实现（DFX-WB-07） | TASK-RT-01/VF-02 |
| `src/main.tsx` | 入口零变更（HC-03），新 store 按需懒加载 | TASK-VF-01/VF-03 |

### 7.4 冻结区文件（HC-02，零变更）
| 文件 | 冻结事实 | 校验任务 |
|------|---------|---------|
| `src/adapter/smb/SmbPlugin.ts` | SMB 唯一调用入口，单会话接口 | TASK-VF-01/VF-02 |
| `src/core/**` | 传输引擎核心 | TASK-VF-01/VF-02 |
| `android/**` | 原生层 | TASK-VF-01/VF-02 |

---

## 8. 风险登记与缓解措施

| 风险编号 | 风险 | 等级 | 缓解措施 | 关联任务 |
|---------|------|------|---------|---------|
| R-01 | HC-02 冻结区 vs REQ-MC-01/03 冲突（SmbPlugin 单会话） | 🔴 高 | D-MC-01 折中：逻辑多连接 + 物理热切换 + 上下文缓存；完整满足需解冻（OUT_OF_SCOPE） | TASK-MC-02 |
| R-02 | cold profile 操作时物理会话已失 | 🟡 中 | switchHotTo 异步重连 + 重试；UI 提示"正在恢复连接" | TASK-MC-02/03 |
| R-03 | WRITE_ENABLED_SCOPE.enabled 改配置驱动破坏既有引用 | 🔴 高 | 全量替换为 isWritebackGloballyEnabled()；tsc strict 兜底 | TASK-WB-02 |
| R-04 | smbConnectionStore 与 smbMultiConnStore 双源漂移 | 🟡 中 | 既有签名不变；新代码统一走 smbMultiConnStore；M2 保持既有路径 | TASK-MC-05 |
| R-05 | 既有 pad2.profiles.v1 持久化兼容 | 🟢 低 | smbProfilesStore 零变更（HC-05） | TASK-RT-01 |
| R-06 | 物理会话频繁切换重连风暴 | 🟡 中 | switchHotTo 防抖 300ms；上下文缓存优先 | TASK-MC-03 |
| R-08 | 多连接凭据内存泄露 | 🟢 低 | per-handle lastConnect 仅内存，不持久化不入日志 | TASK-MC-01/02 |
| R-09 | 写回启用后路径越界绕过 | 🟢 低 | 既有三条件 AND 守卫不变，启用后回归验证 | TASK-WB-02/RT-01 |

---

> 本任务清单基于 spec.md（PAD2-SPEC-MCWB-001）的 EARS 需求与 design.md（PAD2-DESIGN-MCWB-001）的技术设计，分解为 14 个主任务（TASK-MC-01~06 + TASK-WB-01~04 + TASK-IT-01 + TASK-RT-01 + TASK-VF-01），覆盖 REQ-MC-01~08 + REQ-WB-01~08 全部需求与 DFX 约束。冻结区冲突（R-01）已明确披露并提供解冻路径。下一步由任务执行 Agent 按依赖关系实施。
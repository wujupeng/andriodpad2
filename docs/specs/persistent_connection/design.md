# 技术设计：已连接 SMB 共享工作台持久固定与仅手动离线断开

> **文档编号**：PAD2-DESIGN-PC-001
> **Feature Name**：persistent_connection
> **对应规格**：PAD2-SPEC-PC-001（`docs/specs/persistent_connection/spec.md`）
> **文档定位**：本文档为规格驱动开发（SDD）第二阶段产物，描述"怎么做"（HOW），将 spec.md 的业务规则转化为可落地的架构、接口与数据模型设计。不含逐行代码实现。
> **硬约束（继承自 spec.md）**：
> - HC-01 零新增 npm 依赖
> - HC-02 冻结区零变更：`src/adapter/smb/SmbPlugin.ts` / `src/core/**` / `android/**`
> - HC-03 `src/main.tsx` 改动限 3 行内（复用既有 `initBootProfiles` 启动编排入口）
> - HC-04 store 分级：store 为 SmbPlugin 唯一调用入口，UI 层不得直接 import SmbPlugin
> - HC-05 既有持久化兼容：不破坏 `pad2.profiles.v1` / `pad2.prefs.v1` 等既存数据
> - HC-06 只读模式兼容

---

# 一、需求与存量功能关系分析

## 1.1 需求功能与存量功能对比

### 1.1.1 已实现功能

已实现功能是指需求与存量代码完全匹配或高度相似、可直接复用无需改造的部分。

| 需求功能 | 存量功能 | 代码位置 | 匹配度 |
|---------|---------|---------|--------|
| 冷启动加载 profiles 持久化数据（REQ-RC-01 前置） | `smbProfilesStore.load()` 读取 `pad2.profiles.v1`，版本校验 + sanitize 白名单解析 + fail-secure 降级 | `src/state/smbProfilesStore.ts:177-211` | 100% |
| 冷启动自动重连编排入口（REQ-RC-01/03） | `initBootProfiles()` 由 main.tsx 调用，异步加载 profiles 后触发 `orchestrateAutoReconnect`，不阻塞应用可交互 | `src/orchestration/boot/autoReconnect.ts:19-28`、`src/main.tsx:14` | 100% |
| 凭据三态语义推断与自动重连凭据处理（REQ-RC-02） | `getPasswordSemantics()` 返回 remembered/empty_credential/unset；`orchestrateAutoReconnect` 按三态分流（remembered 解密/empty_credential 空密码/unset 跳过） | `src/state/smbProfilesStore.ts:107-120`、`src/orchestration/boot/autoReconnect.ts:38-66` | 100% |
| 自动重连并发上限保护 MAX_CONCURRENT=4（REQ-RC-04） | `smbMultiConnStore.connect` 入口校验 `handles.size >= MAX_CONCURRENT` 拒绝并置 connect_failed | `src/state/smbMultiConnStore.ts:22,94-103` | 100% |
| 单个 profile 重连失败不阻塞其他（REQ-RC-05/DFX-PC-05） | `orchestrateAutoReconnect` 循环内 `void connect().catch(() => {})`，单次失败不中断循环 | `src/orchestration/boot/autoReconnect.ts:78` | 100% |
| 自动重连失败呈现 connect_failed 态 + 可读原因（REQ-RC-05） | `smbMultiConnStore.connect` catch 分支 `transitionHandle(h, 'connect_failed', { lastError: mapSmbError(error) })` | `src/state/smbMultiConnStore.ts:124-130` | 100% |
| 工作台多卡区按 handles 渲染 connected/connecting/connect_failed 卡片（REQ-PN-02） | `MultiSmbCards` 过滤 `handles` 三态渲染，含状态徽章与 meta 文案 | `src/ui/pages/HomePage/StorageOverviewRow/MultiSmbCards.tsx:71,75-77` | 100% |
| 工作台已连接卡片"进入浏览"按钮（REQ-PN-03 部分） | `SmbStateCard` 在 `state === 'connected'` 时渲染"进入浏览"按钮，调 `switchBrowse(profileId)` | `src/ui/pages/HomePage/StorageOverviewRow/MultiSmbCards.tsx:59-65` | 100% |
| profile 持久化向后兼容可选字段扩展模式（DFX-PC-11/HC-05） | `sanitizeProfile` 对 `autoConnect`/`passwordEmpty` 采用 `=== true` 白名单解析，旧数据缺失视为 false/unset，`STORAGE_VERSION` 保持 1 不升 | `src/state/smbProfilesStore.ts:147-148,24,43-44` | 100% |
| 持久化写入失败静默降级不崩溃（DFX-PC-04） | `persist()` try/catch 静默降级，内存态不受影响 | `src/state/smbProfilesStore.ts:160-172` | 100% |
| 删除 profile 同步断开活跃连接（REQ-PN-06 前置） | `ProfilesListPanel.confirmRemove` 删除后调 `multiConn.disconnect(profile.id)` 同步清理 handle | `src/ui/pages/ConnectionPage/ProfilesListPanel/index.tsx:253-279` | 100% |
| 六态状态机迁移表与受控迁移（REQ-PN-04 状态语义基础） | `connectionHandle.TRANSITIONS` + `transitionHandle` 校验合法迁移，非法路径拒绝并开发模式告警 | `src/state/connectionHandle.ts:16-23,63-76` | 100% |
| 非用户主动断开不解除连接宣称（REQ-PN-04 状态层基础） | `applyOperationError` 对 network_lost/unreachable 仅迁移到 network_interrupted，不迁移到 disconnected；pinned 语义可在此之上叠加 | `src/state/smbMultiConnStore.ts:202-226` | 75% |

### 1.1.2 需要扩展的功能

需要扩展的功能是指需求与存量代码部分匹配，需在现有基础上改造的部分。

| 需求功能 | 存量功能 | 差异说明 | 扩展方向 |
|---------|---------|---------|---------|
| SmbProfile 承载 pinned 固定状态字段（REQ-PN-01/07，数据约束 6.1） | `SmbProfile` 已有 `autoConnect?: boolean` 可选字段，`sanitizeProfile` 已有白名单解析模式 | 缺少 `pinned?: boolean` 字段；缺少该字段的 sanitize 白名单解析；缺少 save 写入规则 | 在 `SmbProfile` 接口新增 `pinned?: boolean` 可选字段（默认 false，缺失视为 false）；在 `sanitizeProfile` 仿照 autoConnect 模式加 `if (p.pinned === true) profile.pinned = true;` 白名单解析；新增独立的 pinned 标记/解除 API（不耦合既有 save 的表单写入路径） |
| 冷启动自动重连筛选 pinned=true ∪ autoConnect=true 并集（REQ-CO-01） | `orchestrateAutoReconnect` 仅筛选 `p.autoConnect === true` | 筛选条件未含 pinned；需并集触发且幂等去重（pinned 与 autoConnect 同时为 true 不重复 connect） | 将筛选条件改为 `p.pinned === true \|\| p.autoConnect === true`；循环天然幂等（同一 profile 只 connect 一次）；凭据三态处理逻辑零变更复用 |
| 工作台已连接卡片新增"离线"按钮（REQ-PN-03） | `SmbStateCard` 在 connected 态仅渲染"进入浏览"按钮 | 缺少"离线"按钮；缺少点击后断开连接 + 解除 pinned 的编排 | 在 `SmbStateCard` connected 态新增"离线"按钮（与"进入浏览"并列）；新增 orchestration 层 `disconnectAndUnpin(profileId)` 编排函数承载"用户主动离线"语义；`MultiSmbCards` 注入 onOffline 回调 |
| 连接成功后标记 pinned=true 持久化（REQ-PN-01） | `smbMultiConnStore.connect` 成功后仅 `transitionHandle(connected)`，无 pinned 标记 | 缺少连接成功 → pinned 标记的触发链；需异步不阻塞连接 UI 反馈（DFX-PC-01） | 新增 orchestration 层 `pinnedSync` 订阅模块，监听 `smbMultiConnStore.handles` 变化，对新增 connected 态 handle 异步标记 pinned=true；`smbMultiConnStore` 零变更（pinned 语义由 orchestration 层叠加，保持 store 单一职责） |
| 手动离线解除 pinned=false 持久化（REQ-PN-04/05） | `smbMultiConnStore.disconnect` 仅移除 handle，不持久化"主动离线"语义 | 缺少 disconnect → pinned 解除的触发链；需区分"用户主动"与"非主动"（网络中断不走 disconnect） | 由 orchestration 层 `disconnectAndUnpin` 承载：调 `smbMultiConnStore.disconnect` + 标记 pinned=false；网络中断/会话失效走 `applyOperationError` 不触发 pinned 解除（既有路径不变） |
| 删除 profile 同步解除 pinned 语义（REQ-PN-06） | `smbProfilesStore.remove` 仅过滤 profiles 数组并 persist | pinned 字段随 profile 对象一并从数组移除，无残留；但需显式确认无 pinned 孤余 | `remove` 既有行为已满足（pinned 随 profile 消失）；仅需在 design 文档显式声明此路径的 pinned 清理由 profile 移除天然承载，无需额外代码 |
| 固定状态可观测（DFX-PC-09/10） | profile 的 autoConnect 可经配置编辑页观测，pinned 无观测入口 | 缺少 pinned 状态的查询与诊断观测 | pinned 为 SmbProfile 字段，可经 `smbProfilesStore.profiles` 查询；工作台卡片隐式观测（pinned=true 且 handles 含该 profile 即呈现）；变更路径经 pinnedSync/disconnectAndUnpin 可追溯 |

### 1.1.3 需要新增的功能或接口

需要新增的功能是指需求在存量代码中完全没有对应实现的部分。

#### 1.1.3.1 固定状态管理模块（orchestration 层）

| 功能点 | 输入 | 输出 | 核心逻辑 | 依赖关系 |
|--------|------|------|---------|---------|
| `pinnedSync` 订阅启动 | 无（启动时调用） | unsubscribe 函数 | 订阅 `smbMultiConnStore.handles` 变化，对新增 connected 态 handle 且对应 profile.pinned !== true 的，异步调 `smbProfilesStore` 标记 pinned=true | 依赖 `smbMultiConnStore`（订阅）、`smbProfilesStore`（标记）；被 `initBootProfiles` 调用 |
| `markPinned(profileId, pinned)` | profileId: string, pinned: boolean | Promise<void> | 在 `smbProfilesStore` 中更新指定 profile 的 pinned 字段并持久化；profile 不存在时静默返回；持久化失败静默降级（DFX-PC-04） | 依赖 `smbProfilesStore`（读取 + 持久化） |
| `disconnectAndUnpin(profileId)` | profileId: string | Promise<void> | 编排"用户主动离线"：调 `smbMultiConnStore.disconnect(profileId)` + `markPinned(profileId, false)`；物理断开失败不阻塞 pinned 解除与本地状态清理（DFX-PC-04） | 依赖 `smbMultiConnStore.disconnect`、`markPinned`；被工作台离线按钮调用 |

#### 1.1.3.2 工作台离线按钮 UI

| 功能点 | 输入 | 输出 | 核心逻辑 | 依赖关系 |
|--------|------|------|---------|---------|
| `SmbStateCard` 离线按钮渲染 | profileId, state, onOffline | JSX | 在 `state === 'connected'` 时与"进入浏览"并列渲染"离线"按钮（secondary/danger 变体）；点击调 onOffline | 依赖 `BaseButton`；被 `MultiSmbCards` 渲染 |
| `MultiSmbCards` onOffline 接线 | 无 | JSX | 将 `disconnectAndUnpin` 注入 `SmbStateCard.onOffline` | 依赖 `disconnectAndUnpin`（orchestration 层） |

## 1.2 存量功能详细分析

### 1.2.1 smbProfilesStore（profile 持久化）

**接口契约**：
- `load(): Promise<void>`：读取 `pad2.profiles.v1`，版本校验（`STORAGE_VERSION === 1`）+ JSON 解析 + `sanitizeProfile` 白名单清洗；失败安全降级为空列表（不崩溃）。
- `save(input: SmbProfileInput): Promise<void>`：按身份四元组（host+share+username+domain）查重 upsert；密码经 AES-GCM 加密落盘（rememberPassword 且 crypto 可用）；`autoConnect` 写入规则 `input.autoConnect === true ? true : undefined`。
- `remove(id: string): Promise<void>`：过滤 profiles 数组并 persist。
- `hasActiveOperations(id): boolean`：查询该 profile 是否有活跃操作（删除前警告用）。

**业务规则**：
- 持久化版本号固定为 1，可选字段（autoConnect/passwordEmpty）在 version 1 框架内向后兼容扩展，旧数据缺失视为 false/unset（不升级版本号，避免安全丢弃用户配置）。
- `sanitizeProfile` 对可选布尔字段采用严格 `=== true` 白名单解析（非布尔/篡改值静默丢弃），与密文 fail-secure 同风格。
- `persist` 错误静默降级（内存态不受影响），日志仅输出 `[smbProfilesStore]` 标识与存储层错误，永不输出凭据。

**扩展点**：
- `SmbProfile` 接口可新增可选字段（仿照 autoConnect/passwordEmpty 模式），`sanitizeProfile` 加白名单解析即可向后兼容扩展。
- `save` 的 `SmbProfileInput` 为表单写入路径，pinned 不应经此路径设置（pinned 由连接成功自动维护，非用户表单配置）——需新增独立的 pinned 标记 API，避免耦合表单写入语义。

**约束**：
- 持久化层为 `@capacitor/preferences`（HC-01 零新增依赖满足）。
- 接口签名冻结于 S1-09（R-07），本设计新增 pinned 字段为向后兼容扩展，不破坏既有接口契约。

### 1.2.2 smbMultiConnStore（多连接管理）

**接口契约**：
- `handles: ReadonlyMap<string, ConnectionHandle>`：活跃连接句柄集合，初始为空 Map（冷启动后为空，EV-PC-01）。
- `connect(profileId, options): Promise<void>`：防重入（connecting 忽略）+ 幂等（已 connected 同 profile 返回）+ 并发上限校验（MAX_CONCURRENT=4）+ 事实驱动（仅插件 resolve 判定 connected）。
- `disconnect(profileId): Promise<void>`：若为 hot 则物理断开，移除该 handle（其他 handle 不受影响，REQ-MC-04 隔离）。
- `switchHotTo/probe/applyOperationError`：热会话切换、连接探测、操作错误分类迁移（六态状态机）。

**业务规则**：
- 逻辑多连接 + 物理单会话热切换（HC-02 冻结区约束）。
- connect 成功后 `transitionHandle(h, 'connected', { lastError: null })`（行 123），此为 pinned 标记的天然触发点。
- disconnect 仅移除内存 handle，不持久化任何"主动离线"语义（EV-PC-07）——pinned 解除须由调用方（orchestration 层）承载。
- `applyOperationError` 对 network_lost/unreachable 仅迁移到 network_interrupted（不迁移到 disconnected），此为"非用户主动断开不解除连接宣称"的状态层基础，pinned 语义可在此之上叠加（pinned 保持 true）。

**扩展点**：
- connect 成功后的 connected 态迁移为 pinnedSync 订阅触发点（store 零变更，pinned 语义由 orchestration 层订阅叠加）。
- disconnect 的调用方区分：工作台离线按钮（用户主动，需解除 pinned）vs 测试连接断开（TEST_PROFILE_ID，不对应真实 profile）vs 删除 profile（pinned 随 profile 消失）——pinned 解除由 orchestration 层 `disconnectAndUnpin` 承载，store 零变更。

**约束**：
- store 为 SmbPlugin 唯一调用入口（HC-04），UI 层不得直接 import SmbPlugin。
- 并发上限 MAX_CONCURRENT=4 既有，本设计不突破。

### 1.2.3 orchestrateAutoReconnect（冷启动自动重连编排）

**接口契约**：
- `initBootProfiles(): void`：异步加载 profiles 后触发 `orchestrateAutoReconnect`，不阻塞应用可交互（main.tsx 以 `void initBootProfiles()` 调用）。
- `orchestrateAutoReconnect(): Promise<void>`（内部）：筛选 `autoConnect === true` 的 profile，按凭据三态分流自动重连。

**业务规则**：
- 筛选条件当前为 `p.autoConnect === true`（行 35），需扩展为 `p.pinned === true || p.autoConnect === true` 并集（REQ-CO-01）。
- 凭据三态处理完整：remembered（密文解密，失败置 connect_failed "密码无法解密"）/ empty_credential（空密码连接）/ unset（跳过，不发起 connect）——此逻辑零变更复用。
- 单个失败不阻塞其他（`void connect().catch(() => {})`，行 78），并发上限由 connect 入口校验承载。

**扩展点**：
- 筛选条件扩展为并集是本设计核心扩展点之一（REQ-CO-01）。
- `initBootProfiles` 内部新增 `pinnedSync` 订阅启动调用（HC-03 main.tsx 零变更或仅扩展 initBootProfiles 内部）。

**约束**：
- main.tsx 已调用 `initBootProfiles()`（行 14），HC-03 满足——本设计扩展 initBootProfiles 内部逻辑，main.tsx 零变更。

### 1.2.4 MultiSmbCards（工作台多卡渲染）

**接口契约**：
- 按 `smbMultiConnStore.handles` 过滤 connected/connecting/connect_failed 渲染 `SmbStateCard`。
- `SmbStateCard` 在 connected 态渲染"进入浏览"按钮（调 `switchBrowse(profileId)`）。

**业务规则**：
- handles 为空时渲染占位卡"未连接，点击进入配置连接"（行 79-96）。
- 已连接卡片仅"进入浏览"按钮，无"离线"按钮（EV-PC-06）。

**扩展点**：
- `SmbStateCard` 在 connected 态新增"离线"按钮（与"进入浏览"并列），点击调 onOffline 回调。
- `MultiSmbCards` 将 `disconnectAndUnpin` 注入 onOffline。

**约束**：
- UI 层不得直接 import SmbPlugin（HC-04），离线按钮经 orchestration 层 `disconnectAndUnpin` 中转。
- 既有"进入浏览"按钮零变更。

### 1.2.5 ConnectionFormPanel（autoConnect 配置 UI）

**接口契约**：
- autoConnect 勾选 UI 的 `disabled` 条件含 `!rememberPassword`（行 355）——须先勾选"记住密码"才能勾选"自动连接"（EV-PC-04）。
- autoConnect 由用户在配置编辑页独立设置，默认 false。

**业务规则**：
- autoConnect 为用户独立配置的"启动时自动连接"偏好，与本特性的"固定"语义正交（REQ-CO-02/03）。
- 本设计不修改 autoConnect UI 与默认值（NON-PC-07），pinned 不在配置编辑页设置（由连接成功自动维护）。

**约束**：
- ConnectionFormPanel 零变更（pinned 不经表单设置）。

### 1.2.6 ProfilesListPanel（连接列表与删除）

**接口契约**：
- `confirmRemove`：删除 profile 后同步 `multiConn.disconnect(profile.id)` 清理活跃连接。
- `connectWithProfile`：以存储凭据连接 profile，testOnly 路径成功后 disconnect（测试连接，非用户主动离线）。

**业务规则**：
- 删除 profile 时 pinned 字段随 profile 对象一并从数组移除（`remove` 过滤数组），无 pinned 残留（REQ-PN-06 天然满足）。
- testOnly 路径使用 TEST_PROFILE_ID（'profile-test'），不对应真实 profile，disconnect 不触发 pinned 解除（pinned 标记/解除仅对真实 profileId 生效）。

**约束**：
- ProfilesListPanel 零变更（删除路径的 pinned 清理由 profile 积除天然承载；连接路径的 pinned 标记由 pinnedSync 订阅承载）。

---
# 二、增量设计方案

## 2.1 实现模型

### 2.1.1 上下文视图

本特性在既有 conn_persist_recent_ui 架构之上叠加"固定"语义，不引入新外部系统，不突破既有上下文边界。

```plantuml
title 持久固定特性上下文视图（增量叠加于既有架构）

actor "普通成员" as Member
rectangle "PAD2 文件管理器" as App {
  rectangle "工作台\nMultiSmbCards\n(扩展: 离线按钮)" as Workbench
  rectangle "启动编排\ninitBootProfiles\n(扩展: pinnedSync 订阅)" as Boot
  rectangle "pinnedSync 订阅\n(新增)" as PinnedSync
  rectangle "disconnectAndUnpin\n(新增 orchestration)" as DiscAndUnpin
  rectangle "markPinned\n(新增 smbProfilesStore API)" as MarkPinned
  rectangle "smbMultiConnStore\n(零变更)" as MCS
  rectangle "smbProfilesStore\n(扩展: pinned 字段)" as PFS
  rectangle "orchestrateAutoReconnect\n(扩展: 并集筛选)" as AutoReconn
}
database "Preferences\npad2.profiles.v1\n(扩展: pinned 字段)" as Pref
database "Windows SMB 服务器" as SMB

Member --> Workbench : 连接成功 / 点击离线
Workbench --> DiscAndUnpin : onOffline(profileId)
DiscAndUnpin --> MCS : disconnect(profileId)
DiscAndUnpin --> MarkPinned : pinned=false
MarkPinned --> PFS : 更新 pinned 字段
PFS --> Pref : 持久化(版本1兼容扩展)

Boot --> PinnedSync : 启动订阅
PinnedSync --> MCS : subscribe(handles)
MCS --> PinnedSync : handle → connected 事件
PinnedSync --> MarkPinned : pinned=true
PinnedSync --> PFS : 更新 pinned 字段

Boot --> AutoReconn : 触发冷启动重连
AutoRenn --> PFS : 读取 profiles(pinned ∪ autoConnect)
AutoRenn --> MCS : connect(profileId, options)
MCS --> SMB : 建立会话
SMB --> MCS : 连接结果
MCS --> Workbench : handles 变化触发重渲染
```

**通信协议与调用频率**：
- `pinnedSync` → `smbMultiConnStore.subscribe`：进程内同步订阅（zustand），handles 变化时触发（低频，仅连接态迁移时）。
- `markPinned` → `smbProfilesStore` → `Preferences.set`：异步调用，单次连接成功触发一次（幂等，pinned 已为 true 时跳过）。
- `disconnectAndUnpin` → `smbMultiConnStore.disconnect`：异步调用，用户点击离线按钮触发（低频，用户主动）。
- `orchestrateAutoReconnect` → `smbMultiConnStore.connect`：异步调用，冷启动触发一次（受 MAX_CONCURRENT=4 上限保护）。

### 2.1.2 服务/组件总体架构

```plantuml
title 持久固定特性组件架构（增量模块与既有模块关系）

package "UI 层 (HC-04: 零 SmbPlugin import)" {
  [MultiSmbCards] as UI_Multi
  [SmbStateCard] as UI_Card
}

package "Orchestration 层 (新增)" {
  [pinnedSync] as ORC_Sync
  [disconnectAndUnpin] as ORC_Disc
  [initBootProfiles] as ORC_Boot
  [orchestrateAutoReconnect] as ORC_Reconn
}

package "State 层 (store, SmbPlugin 唯一调用入口)" {
  [smbMultiConnStore] as ST_Multi
  [smbProfilesStore] as ST_Prof
  [connectionHandle] as ST_Handle
}

package "Adapter 层 (HC-02 冻结区)" {
  [SmbPlugin] as AD_Smb
}

package "持久化层" {
  [Preferences\npad2.profiles.v1] as DB_Pref
}

UI_Multi --> UI_Card : 渲染(含离线按钮)
UI_Multi --> ORC_Disc : onOffline
UI_Multi --> ST_Multi : 读 handles
UI_Multi --> ST_Prof : 读 profiles

ORC_Boot --> ST_Prof : load()
ORC_Boot --> ORC_Reconn : 触发
ORC_Boot --> ORC_Sync : 启动订阅

ORC_Reconn --> ST_Prof : 读 profiles(pinned ∪ autoConnect)
ORC_Reconn --> ST_Multi : connect()

ORC_Sync --> ST_Multi : subscribe(handles)
ORC_Sync --> ST_Prof : markPinned(true)

ORC_Disc --> ST_Multi : disconnect()
ORC_Disc --> ST_Prof : markPinned(false)

ST_Multi --> AD_Smb : connect/disconnect/isConnected
ST_Multi --> ST_Handle : transitionHandle

ST_Prof --> DB_Pref : 读/写(version 1 兼容扩展)
```

**模块职责说明**：

| 模块 | 职责 | 变更类型 | 层级 |
|------|------|---------|------|
| `MultiSmbCards` / `SmbStateCard` | 工作台多卡渲染，已连接卡片新增"离线"按钮 | 扩展 | UI 层 |
| `pinnedSync`（新增） | 订阅 smbMultiConnStore handles 变化，连接成功时标记 pinned=true | 新增 | Orchestration 层 |
| `disconnectAndUnpin`（新增） | 编排"用户主动离线"：disconnect + 解除 pinned | 新增 | Orchestration 层 |
| `initBootProfiles` | 冷启动入口，扩展：启动 pinnedSync 订阅 | 扩展 | Orchestration 层 |
| `orchestrateAutoReconnect` | 冷启动自动重连，扩展：筛选条件改并集 | 扩展 | Orchestration 层 |
| `smbProfilesStore` | profile 持久化，扩展：pinned 字段 + markPinned API | 扩展 | State 层 |
| `smbMultiConnStore` | 多连接管理 | 零变更 | State 层 |
| `connectionHandle` | per-handle 六态状态机 | 零变更 | State 层 |
| `SmbPlugin` | SMB 协议层 | 零变更（HC-02 冻结区） | Adapter 层 |
| `main.tsx` | 启动链 | 零变更（HC-03，initBootProfiles 内部扩展） | 入口 |

**配置项及取值策略**：
- `MAX_CONCURRENT = 4`：既有配置，本特性复用，不突破（REQ-RC-04）。
- `STORAGE_VERSION = 1`：既有配置，pinned 字段在 version 1 框架内向后兼容扩展，不升级版本号（DFX-PC-11/HC-05）。

### 2.1.3 实现设计文档

#### 2.1.3.1 pinned 固定状态生命周期状态机

pinned 状态为 profile 级跨会话持久化标志，其生命周期与连接事实一致（DFX-PC-06）。

```plantuml
title pinned 固定状态生命周期状态机

state "未固定\npinned=false\n(初始/手动离线)" as Unpinned
state "已固定\npinned=true\n(连接成功)" as Pinned
state "持久化中\n(异步)" as Persisting

[*] --> Unpinned : 冷启动加载\n(缺失视为 false)

Unpinned --> Persisting : 连接成功事件\n(pinnedSync 触发)
Persisting --> Pinned : 持久化成功
Persisting --> Pinned : 持久化失败\n(内存态生效, DFX-PC-04)

Pinned --> Persisting : 用户手动离线\n(disconnectAndUnpin 触发)
Persisting --> Unpinned : 持久化成功
Persisting --> Unpinned : 持久化失败\n(内存态生效)

Pinned --> Pinned : 非用户主动断开\n(网络中断/会话失效)\npinned 保持 true
Unpinned --> Unpinned : 再次连接成功\n(重新标记 pinned=true)

note right of Pinned
  冷启动时：
  pinned=true ∪ autoConnect=true
  → 自动重连(并集, REQ-CO-01)
end note

note left of Unpinned
  pinned 与 autoConnect 正交：
  手动离线仅解除 pinned
  不改变 autoConnect 字段
  (REQ-CO-02)
end note
```

#### 2.1.3.2 冷启动固定恢复流程

```plantuml
title 冷启动固定恢复流程（扩展 orchestrateAutoReconnect）

start
:应用冷启动;
:main.tsx 调用 initBootProfiles();

:await smbProfilesStore.load();
note right: 读取 pad2.profiles.v1\n含 pinned/autoConnect 字段\n(版本1兼容扩展)

:启动 pinnedSync 订阅;
note right: 订阅 smbMultiConnStore.handles 变化\n连接成功时标记 pinned=true

:异步触发 orchestrateAutoReconnect();
note right: 不阻塞应用可交互(REQ-RC-03)

:应用立即可交互;

partition "异步重连编排(后台)" {
  :筛选 profiles;
  note right: 条件 = pinned=true ∪ autoConnect=true\n(REQ-CO-01 并集)

  while (未处理完所有候选 profile?) is (是)
    if (凭据可用?) then (remembered/empty_credential)
      if (密文解密成功?) then (是)
        :smbMultiConnStore.connect(profileId, options);
        note right: 受 MAX_CONCURRENT=4 上限保护\n(REQ-RC-04)
        if (连接成功?) then (是)
          :handle → connected;
          :pinnedSync 标记 pinned=true;
          note right: 幂等(已为 true 则跳过)
          :工作台呈现已连接卡片;
        else (否)
          :handle → connect_failed + 可读原因;
          note right: pinned 保持 true(REQ-RC-05)\n不阻塞其他 profile
        endif
      else (否, 解密失败)
        :跳过, 置 connect_failed "密码无法解密";
        note right: pinned 保持 true\n提示重新输入(REQ-RC-02)
      endif
    else (unset, 未记住密码)
      :跳过自动重连;
      note right: 提示"请手动输入密码连接"\n(REQ-RC-02, 不静默)
    endif
  endwhile (否)
}

stop
```

#### 2.1.3.3 用户手动离线流程（工作台离线按钮）

```plantuml
title 用户手动离线流程（disconnectAndUnpin 编排）

actor "普通成员" as Member
participant "MultiSmbCards" as UI
participant "disconnectAndUnpin\n(orchestration)" as Orc
participant "smbMultiConnStore" as MCS
participant "smbProfilesStore" as PFS
database "SMB 服务器" as SMB
database "Preferences" as Pref

Member -> UI : 点击"离线"按钮
UI -> Orc : disconnectAndUnpin(profileId)

Orc -> MCS : disconnect(profileId)
MCS -> SMB : 物理断开(若为 hot)
SMB --> MCS : 断开结果(成功/失败)
MCS --> Orc : handle 移除(本地状态清理)

Orc -> PFS : markPinned(profileId, false)
PFS -> Pref : 持久化 pinned=false
Pref --> PFS : 持久化结果

PFS --> Orc : 完成

alt 物理断开失败
  note over Orc, MCS
    DFX-PC-04: 物理断开失败不阻塞
    本地状态清理与 pinned 解除
    (连接上下文已不可信)
  end note
end

alt 持久化失败
  note over Orc, Pref
    DFX-PC-04: 持久化失败静默降级
    内存态 pinned=false 生效
    不崩溃, 不阻塞 UI 反馈
  end note
end

Orc --> UI : 完成
UI --> Member : 卡片切换为离线态或移除(< 300ms, DFX-PC-03)
```

#### 2.1.3.4 pinned 与 autoConnect 正交协调决策表

| 场景 | pinned | autoConnect | 冷启动行为 | 数据变更 |
|------|--------|-------------|-----------|---------|
| 初始未连接 | false | false | 不重连 | 无 |
| 用户勾选自动连接未连接 | false | true | 自动重连（autoConnect 触发） | 无（既有行为） |
| 连接成功（未勾自动连接） | true | false | 自动重连（pinned 触发） | pinned: false→true |
| 连接成功（已勾自动连接） | true | true | 自动重连（幂等，不重复 connect） | pinned: false→true，autoConnect 不变 |
| 手动离线（未勾自动连接） | false | false | 不重连 | pinned: true→false |
| 手动离线（已勾自动连接） | false | true | 自动重连（autoConnect 触发，既有行为保留） | pinned: true→false，autoConnect 保持 true |
| 网络中断 | true（保持） | 不变 | 自动重连（pinned 触发） | 无（非用户主动不解除） |
| 删除 profile | （随 profile 移除） | （随 profile 积除） | 无 profile 可重连 | profile + pinned 一并移除 |

**关键决策**：
- **D-PC-01 pinned 字段扩展策略**：仿照 autoConnect 模式，在 `SmbProfile` 新增 `pinned?: boolean` 可选字段，`sanitizeProfile` 加 `=== true` 白名单解析，`STORAGE_VERSION` 保持 1 不升（DFX-PC-11/HC-05）。
- **D-PC-02 pinned 标记触发链**：由 orchestration 层 `pinnedSync` 订阅 smbMultiConnStore handles 变化触发，smbMultiConnStore 零变更（保持 store 单一职责，避免 connect 耦合 pinned 语义）。
- **D-PC-03 pinned 解除触发链**：由 orchestration 层 `disconnectAndUnpin` 承载"用户主动离线"语义，smbMultiConnStore.disconnect 零变更；网络中断/会话失效走 applyOperationError 不触发 pinned 解除。
- **D-PC-04 冷启动重连并集筛选**：`orchestrateAutoReconnect` 筛选条件改为 `p.pinned === true || p.autoConnect === true`，循环天然幂等（同一 profile 只 connect 一次）。
- **D-PC-05 pinned 标记独立 API**：新增 `markPinned(profileId, pinned)` 独立 API，不耦合既有 `save` 的表单写入路径（pinned 由连接成功自动维护，非用户表单配置）。
- **D-PC-06 pinnedSync 订阅去重**：订阅回调中校验 `profile.pinned !== true` 才标记（幂等，避免重复持久化写入）。

## 2.2 接口设计

### 2.2.1 总体设计

本特性接口分为三类：扩展既有接口（smbProfilesStore/orchestrateAutoReconnect/initBootProfiles）、新增 orchestration 编排接口（pinnedSync/disconnectAndUnpin）、扩展 UI 组件 props（SmbStateCard/MultiSmbCards）。

| 接口 | 分类 | 稳定性等级 | 变更类型 |
|------|------|-----------|---------|
| `SmbProfile.pinned` | 数据模型 | 稳定 | 新增字段（向后兼容） |
| `smbProfilesStore.markPinned` | State 层 API | 稳定 | 新增方法 |
| `smbProfilesStore.load/save/remove` | State 层 API | 稳定 | 零变更（pinned 经 sanitize 白名单解析） |
| `orchestrateAutoReconnect` 筛选条件 | Orchestration 内部 | 内部 | 扩展（并集筛选） |
| `initBootProfiles` | Orchestration 入口 | 稳定 | 扩展（内部启动 pinnedSync） |
| `pinnedSync` | Orchestration 新增 | 稳定 | 新增模块 |
| `disconnectAndUnpin` | Orchestration 新增 | 稳定 | 新增函数 |
| `SmbStateCard.onOffline` | UI 组件 props | 稳定 | 新增 props |
| `smbMultiConnStore.*` | State 层 API | 稳定 | 零变更 |
| `SmbPlugin.*` | Adapter 层 | 冻结 | 零变更（HC-02） |

**接口变更策略**：
- 所有新增接口与字段均为向后兼容扩展（可选字段/新增方法），不破坏既有接口契约。
- pinned 字段不经 `SmbProfileInput` 表单写入路径暴露（pinned 由连接成功自动维护，非用户配置）。
- UI 层经 orchestration 层中转调用 store（HC-04 分级保持）。

### 2.2.2 接口清单

#### 2.2.2.1 SmbProfile.pinned 字段扩展

**接口签名**：
```typescript
interface SmbProfile {
  // ...既有字段...
  /** 工作台常驻固定标志（默认 false，HC-05 兼容，旧数据缺失视为 false）
   *  true = 已连接成功并被标记为工作台常驻固定，冷启动自动重连恢复
   *  由连接成功自动置 true（pinnedSync），用户手动离线自动置 false（disconnectAndUnpin）
   *  与 autoConnect 正交：pinned 由连接事实自动维护，autoConnect 由用户独立配置 */
  pinned?: boolean;
}
```

**业务说明**：profile 的跨会话持久化固定标志。连接成功时置 true，用户手动离线时置 false，非用户主动断开（网络中断/会话失效）不改变。

**前置条件**：无（可选字段，缺失视为 false）。

**后置条件**：
- pinned=true 的 profile 冷启动时进入自动重连候选集（与 autoConnect=true 并集）。
- pinned=false 的 profile 冷启动时不由 pinned 触发重连（autoConnect=true 仍可触发）。

**异常映射**：持久化值非布尔（篡改）时经 `sanitizeProfile` 白名单解析降级为 false（不崩溃，DFX-PC-04）。

#### 2.2.2.2 smbProfilesStore.markPinned

**接口签名**：
```typescript
interface SmbProfilesState {
  // ...既有方法...
  /** 标记/解除 profile 的固定状态并持久化
   *  @param profileId 目标 profile id
   *  @param pinned true=标记固定, false=解除固定
   *  @returns Promise<void> 持久化失败静默降级（内存态生效，DFX-PC-04） */
  markPinned(profileId: string, pinned: boolean): Promise<void>;
}
```

**业务说明**：独立的 pinned 字段更新 API，不耦合既有 `save` 的表单写入路径。供 `pinnedSync`（连接成功标记）与 `disconnectAndUnpin`（手动离线解除）调用。

**前置条件**：profileId 对应的 profile 须存在于 `smbProfilesStore.profiles`；不存在时静默返回（无 profile 可标记）。

**后置条件**：
- 指定 profile 的 pinned 字段更新为入参值并持久化到 `pad2.profiles.v1`。
- 其他字段（含 autoConnect/passwordEncrypted 等）零变更（REQ-CO-02/03 正交）。
- 持久化失败时内存态 pinned 生效，不崩溃，不阻塞调用方。

**异常映射**：Preferences 写入异常静默降级（既有 `persist` 模式），日志仅输出 `[smbProfilesStore]` 标识。

**调用示例**：
```typescript
// pinnedSync 订阅回调：连接成功标记固定
await useSmbProfilesStore.getState().markPinned(profileId, true);

// disconnectAndUnpin：手动离线解除固定
await useSmbProfilesStore.getState().markPinned(profileId, false);
```

#### 2.2.2.3 pinnedSync 订阅模块

**接口签名**：
```typescript
/** 启动 pinnedSync 订阅：监听 smbMultiConnStore handles 变化，连接成功时标记 pinned=true
 *  @returns unsubscribe 函数（停止订阅）
 *  幂等：profile.pinned 已为 true 时跳过（避免重复持久化写入） */
function startPinnedSync(): () => void;
```

**业务说明**：订阅 `smbMultiConnStore.handles` 变化，对新增 connected 态 handle 且对应 profile.pinned !== true 的，异步调 `markPinned(profileId, true)`。异步执行不阻塞连接成功的 UI 反馈（DFX-PC-01）。

**前置条件**：`smbProfilesStore.load()` 已完成（profiles 已加载到内存）。

**后置条件**：连接成功的 profile 被标记 pinned=true 并持久化，工作台持久呈现（跨会话保留）。

**异常映射**：
- profile 不存在（已删除）：静默跳过。
- markPinned 持久化失败：静默降级，内存态生效（DFX-PC-04）。

**调用示例**：
```typescript
// initBootProfiles 内部启动
const stopPinnedSync = startPinnedSync();
// 应用生命周期内持续订阅（无需显式 stop，随进程生命周期）
```

#### 2.2.2.4 disconnectAndUnpin 编排函数

**接口签名**：
```typescript
/** 编排"用户主动离线"：断开连接 + 解除固定状态
 *  @param profileId 目标 profile id
 *  @returns Promise<void>
 *  物理断开失败不阻塞本地状态清理与 pinned 解除（DFX-PC-04）
 *  持久化失败不阻塞本地状态清理（内存态 pinned=false 生效） */
async function disconnectAndUnpin(profileId: string): Promise<void>;
```

**业务说明**：承载"用户主动离线"语义（REQ-PN-04）。依次调用 `smbMultiConnStore.disconnect(profileId)`（物理断开 + handle 移除）与 `markPinned(profileId, false)`（解除固定持久化）。供工作台离线按钮调用。

**前置条件**：profileId 对应的 handle 须存在于 `smbMultiConnStore.handles`（否则 disconnect 静默返回）。

**后置条件**：
- 该 profile 的 handle 从 handles 移除，工作台卡片切换为离线态或移除（< 300ms，DFX-PC-03）。
- 该 profile 的 pinned 置 false 并持久化，冷启动不再由 pinned 触发重连（autoConnect=true 仍可触发，REQ-CO-02）。
- autoConnect 字段零变更（REQ-CO-02 正交）。

**异常映射**：
- SmbPlugin.disconnect 异常：静默降级，本地状态清理继续（既有 disconnect 模式）。
- markPinned 持久化异常：静默降级，内存态生效。

**调用示例**：
```typescript
// MultiSmbCards 工作台离线按钮
<BaseButton variant="danger" size="sm" onPress={() => void disconnectAndUnpin(profileId)}>
  离线
</BaseButton>
```

#### 2.2.2.5 orchestrateAutoReconnect 筛选条件扩展

**接口签名**（内部函数，签名不变）：
```typescript
async function orchestrateAutoReconnect(): Promise<void>;
```

**业务说明**：筛选条件由 `p.autoConnect === true` 扩展为 `p.pinned === true || p.autoConnect === true`（并集，REQ-CO-01）。凭据三态处理逻辑零变更复用。

**前置条件**：`smbProfilesStore.load()` 已完成。

**后置条件**：
- pinned=true 或 autoConnect=true 的 profile 均进入自动重连候选集。
- 同一 profile 不因 pinned 与 autoConnect 同时为 true 而重复 connect（循环天然幂等）。
- 既有 autoConnect=true 行为保留（DFX-PC-12 兼容）。

**异常映射**：既有逻辑零变更（凭据解密失败置 connect_failed，unset 跳过）。

#### 2.2.2.6 SmbStateCard / MultiSmbCards UI 扩展

**接口签名**：
```typescript
interface SmbCardProps {
  // ...既有 props...
  /** 离线回调（仅 connected 态渲染离线按钮） */
  onOffline: () => void;
}
```

**业务说明**：`SmbStateCard` 在 `state === 'connected'` 时与"进入浏览"并列渲染"离线"按钮（danger/secondary 变体），点击调 `onOffline`。`MultiSmbCards` 将 `disconnectAndUnpin(h.profileId)` 注入 `onOffline`。

**前置条件**：state === 'connected'。

**后置条件**：点击离线按钮触发 `disconnectAndUnpin`，卡片切换为离线态或移除。

**异常映射**：UI 层不直接处理异常，经 orchestration 层承载。

## 2.3 数据模型

### 2.3.1 设计目标

**需支持的业务场景**：
1. 连接成功后 profile 标记 pinned=true 并跨会话持久化（REQ-PN-01/07）。
2. 冷启动加载后 pinned 状态可恢复，驱动自动重连候选集（REQ-RC-01）。
3. 用户手动离线后 pinned=false 持久化，重启后不再由 pinned 触发重连（REQ-PN-04）。
4. pinned 与 autoConnect 正交共存，共同决定冷启动重连（REQ-CO-01）。
5. 删除 profile 时 pinned 随 profile 一并移除，无残留（REQ-PN-06）。

**性能、容量、扩展性目标**：
- pinned 为布尔字段，持久化开销可忽略（既有 JSON 序列化 + Preferences.set，单次写入 < 200ms，DFX-PC-01）。
- 容量无新增（pinned 复用既有 profile 对象，不新增独立存储结构）。
- 扩展性：pinned 字段在 version 1 框架内向后兼容扩展，未来可叠加更多固定语义维度（如固定时间戳）而不升版本号。

**与存量数据的兼容策略**：
- 旧数据（无 pinned 字段）加载时经 `sanitizeProfile` 白名单解析缺失视为 false（DFX-PC-11/HC-05）。
- `STORAGE_VERSION` 保持 1 不升（升版本 = 安全丢弃用户配置，违反 R08）。
- 持久化值非布尔（篡改）时降级为 false（DFX-PC-04）。

### 2.3.2 模型实现

```plantuml
title SmbProfile 数据模型（pinned 字段增量扩展）

class SmbProfile {
  + id : string
  + name : string
  + host : string
  + share : string
  + username : string
  + domain : string
  + passwordEncrypted : string
  + passwordEmpty : boolean
  + autoConnect : boolean
  + pinned : boolean
  + createdAt : number
  + lastConnectedAt : number
}

note right of SmbProfile
  pinned 字段约束：
  - 可选字段（默认 false）
  - version 1 框架向后兼容扩展
  - 旧数据缺失视为 false
  - 非布尔值降级为 false
  - 不携带敏感字段（DFX-PC-07）
  
  pinned 与 autoConnect 正交：
  - pinned：连接成功自动 true
            手动离线自动 false
  - autoConnect：用户独立配置
  - 冷启动重连 = pinned=true ∪ autoConnect=true
end note

class SmbProfileInput {
  + id : string
  + name : string
  + host : string
  + share : string
  + username : string
  + domain : string
  + password : string
  + rememberPassword : boolean
  + autoConnect : boolean
}

note right of SmbProfileInput
  表单写入路径不含 pinned：
  pinned 由连接成功自动维护
  （markPinned 独立 API）
  非用户表单配置
end note

SmbProfileInput ..> SmbProfile : save() 映射\n(pinned 不经此路径)

class ProfilesPersistShape {
  + version : number
  + profiles : SmbProfile[]
}

note bottom of ProfilesPersistShape
  持久化结构（pad2.profiles.v1）：
  version 固定 1（不升）
  profiles 数组含 pinned 字段
  JSON 序列化 + Preferences.set
end note

ProfilesPersistShape "1" *-- "0..*" SmbProfile
```

**对象关系与生命周期**：
- `SmbProfile` 为核心领域对象，pinned 为其可选布尔字段，生命周期与 profile 一致（创建时缺失/false，连接成功时 true，手动离线时 false，删除时随 profile 移除）。
- `SmbProfileInput` 为表单写入 DTO，不含 pinned（pinned 经 `markPinned` 独立 API 维护）。
- `ProfilesPersistShape` 为持久化 JSON 结构，version 固定 1，profiles 数组元素含 pinned 字段。

**对象创建和销毁策略**：
- 创建：profile 经 `smbProfilesStore.save` 创建时 pinned 缺失（视为 false）；连接成功后经 `markPinned` 置 true。
- 销毁：profile 经 `smbProfilesStore.remove` 删除时 pinned 随 profile 对象从数组移除，无残留。

**持久化策略**（不包含表结构）：
- 存储介质：`@capacitor/preferences`（HC-01 零新增依赖）。
- 存储键：`pad2.profiles.v1`（既有，不新增键）。
- 序列化：JSON.stringify({ version: 1, profiles })，profiles 元素含 pinned 字段。
- 读取：`sanitizeProfile` 白名单解析 pinned（`=== true` 才落位，非布尔/缺失视为 false）。
- 写入：`markPinned` 更新指定 profile 的 pinned 字段后调既有 `persist` 函数持久化整个 profiles 数组。
- 错误降级：写入失败静默降级（内存态生效），读取损坏降级为空列表或单字段 false（DFX-PC-04）。

---

## 3. DFX 约束实现方案

### 3.1 性能（DFX-PC-01/02/03）

| DFX 约束 | 实现方案 | 验证方式 |
|---------|---------|---------|
| DFX-PC-01 固定状态持久化不阻塞连接（< 200ms） | `pinnedSync` 订阅回调异步调 `markPinned`（不 await，不阻塞 connect 的 UI 反馈）；`markPinned` 内部调既有 `persist`（单次 Preferences.set） | 连接成功后立即呈现已连接卡片，pinned 持久化后台异步完成 |
| DFX-PC-02 冷启动固定恢复不阻塞启动 | `initBootProfiles` 既有异步模式（`void orchestrateAutoReconnect()`）；pinnedSync 订阅启动为同步轻量操作；应用立即可交互 | 冷启动有 pinned profile 时应用立即可交互，profile 异步重连 |
| DFX-PC-03 工作台离线按钮响应（< 300ms） | `disconnectAndUnpin` 先调 `smbMultiConnStore.disconnect`（同步移除 handle，UI 立即重渲染）后异步 `markPinned`；物理断开异步不阻塞 UI | 点击离线按钮后卡片 300ms 内切换，物理断开后台异步 |

### 3.2 可靠性（DFX-PC-04/05/06）

| DFX 约束 | 实现方案 |
|---------|---------|
| DFX-PC-04 持久化失败/读取损坏安全降级 | `markPinned` 复用既有 `persist` 静默降级模式；`sanitizeProfile` 白名单解析 pinned 非布尔降级为 false；`disconnectAndUnpin` 物理断开失败不阻塞本地状态清理（既有 disconnect 模式） |
| DFX-PC-05 单个固定 profile 重连失败不阻塞其他 | 既有 `orchestrateAutoReconnect` 循环内 `void connect().catch(() => {})` 零变更复用 |
| DFX-PC-06 固定状态与连接事实一致 | pinned=true 仅由 pinnedSync 监听 connected 态触发；pinned=false 仅由 disconnectAndUnpin（用户主动）触发；网络中断走 applyOperationError 不触发 pinned 解除 |

### 3.3 安全性（DFX-PC-07/08）

| DFX 约束 | 实现方案 |
|---------|---------|
| DFX-PC-07 固定状态不泄露凭据 | pinned 仅为布尔字段，`markPinned` 仅更新 pinned 字段不触碰 passwordEncrypted；持久化 JSON 中 pinned 为布尔值 |
| DFX-PC-08 未记住密码 profile 固定须提示 | `orchestrateAutoReconnect` 既有凭据三态处理零变更复用：unset 跳过自动重连（不静默，提示手动连接）；remembered 解密失败置 connect_failed 提示重新输入 |

### 3.4 可维护性（DFX-PC-09/10）

| DFX 约束 | 实现方案 |
|---------|---------|
| DFX-PC-09 固定状态可观测 | pinned 为 SmbProfile 字段，可经 `smbProfilesStore.profiles` 查询；工作台卡片隐式观测（pinned=true 且 handles 含该 profile 即呈现） |
| DFX-PC-10 固定状态变更可追溯 | 变更路径仅 pinnedSync（连接成功 → true）与 disconnectAndUnpin（手动离线 → false）两个入口，日志可标注变更来源（不含敏感字段） |

### 3.5 兼容性（DFX-PC-11/12）

| DFX 约束 | 实现方案 |
|---------|---------|
| DFX-PC-11 既有 profile 持久化兼容 | pinned 在 version 1 框架内向后兼容扩展，`sanitizeProfile` 白名单解析缺失视为 false，`STORAGE_VERSION` 保持 1 不升 |
| DFX-PC-12 既有 autoConnect 语义兼容 | `orchestrateAutoReconnect` 筛选条件为并集（pinned ∪ autoConnect），autoConnect=true 既有行为保留；`markPinned` 不触碰 autoConnect 字段；ConnectionFormPanel 零变更 |

---

## 4. 硬约束实现方案

| 硬约束 | 实现方案 | 验证 |
|--------|---------|------|
| HC-01 零新增 npm 依赖 | 本特性仅使用既有 `@capacitor/preferences`、`zustand`、`react`；无新增依赖 | package.json 零变更 |
| HC-02 冻结区零变更 | `SmbPlugin.ts` / `src/core/**` / `android/**` 零变更；物理会话由既有 smbMultiConnStore + SmbPlugin 承载 | 冻结区文件零变更 |
| HC-03 main.tsx 改动限 3 行内 | main.tsx 零变更（`initBootProfiles()` 既有调用，本特性扩展其内部逻辑：启动 pinnedSync 订阅） | main.tsx 零变更 |
| HC-04 store 分级 | UI 层（MultiSmbCards）经 orchestration 层（disconnectAndUnpin）中转调用 store；pinnedSync/markPinned 在 orchestration/state 层；UI 层零 SmbPlugin import | UI 层 import 检查 |
| HC-05 既有持久化兼容 | pinned 在 `pad2.profiles.v1` version 1 框架内向后兼容扩展；`pad2.prefs.v1` 零变更 | 旧数据加载测试 |
| HC-06 只读模式兼容 | 本特性仅作用于连接状态持久化与工作台卡片呈现，不涉及写操作；只读模式下 pinned 标记/解除逻辑不影响只读约束（连接成功/手动离线为连接管理操作，非文件写操作） | 只读模式回归测试 |

---

## 5. 远程构建与同步

| 项目 | 说明 |
|------|------|
| 远程构建服务器 | 192.168.2.3 |
| 同步范围 | `android/` 目录全量同步（含 Java 源码） |
| 本特性 android 变更 | 零变更（HC-02 冻结区） |
| 同步策略 | 本特性无 android 层变更，远程构建同步按既有流程执行；仅需同步 `src/` 下 TypeScript 变更（pinnedSync/disconnectAndUnpin/markPinned/MultiSmbCards 扩展/smbProfilesStore 扩展/autoReconnect 扩展） |

---

## 6. 需求追溯矩阵

| 需求编号 | 设计方案落点 | 关键决策 |
|---------|------------|---------|
| REQ-PN-01 连接成功即标记固定 | 2.1.3.1 状态机 / 2.2.2.3 pinnedSync / 2.2.2.1 pinned 字段 | D-PC-02 订阅触发 |
| REQ-PN-02 工作台持久呈现 | 2.1.3.2 冷启动恢复 / 1.2.4 MultiSmbCards 既有渲染 | 复用既有 handles 渲染 |
| REQ-PN-03 工作台离线按钮 | 2.2.2.6 SmbStateCard 扩展 / 2.1.3.3 手动离线流程 | 新增 onOffline props |
| REQ-PN-04 仅手动离线才解除 | 2.1.3.1 状态机 / 2.2.2.4 disconnectAndUnpin / D-PC-03 | orchestration 层承载用户主动语义 |
| REQ-PN-05 再次连接恢复固定 | 2.1.3.1 状态机（Unpinned → Persisting → Pinned） | pinnedSync 订阅幂等 |
| REQ-PN-06 删除同步解除固定 | 1.2.6 ProfilesListPanel / 2.3.2 模型实现 | pinned 随 profile 积除天然满足 |
| REQ-PN-07 固定状态跨会话保留 | 2.3.2 模型实现 / 2.2.2.2 markPinned | Preferences 持久化 |
| REQ-RC-01 冷启动恢复已固定 | 2.1.3.2 冷启动恢复流程 / 2.2.2.5 并集筛选 | D-PC-04 并集筛选 |
| REQ-RC-02 仅凭据可用重连 | 2.1.3.2 凭据三态分流 / 1.2.3 既有凭据处理 | 零变更复用 |
| REQ-RC-03 恢复不阻塞启动 | 2.1.3.2 异步编排 / 3.1 DFX-PC-02 | 既有异步模式 |
| REQ-RC-04 恢复并发上限保护 | 1.1.1 既有 MAX_CONCURRENT / 2.1.2 配置项 | 既有 connect 入口校验 |
| REQ-RC-05 恢复失败如实告知 | 1.1.1 既有 connect_failed / 2.1.3.2 失败分支 | 零变更复用 |
| REQ-RC-06 失败后可手动重试 | 1.1.1 既有 connect_failed 卡片 / 2.1.2 工作台渲染 | 既有重试入口 |
| REQ-CO-01 pinned ∪ autoConnect 决定重连 | 2.1.3.4 决策表 / 2.2.2.5 并集筛选 | D-PC-04 |
| REQ-CO-02 手动离线不改 autoConnect | 2.1.3.4 决策表 / 2.2.2.2 markPinned / 2.2.2.4 disconnectAndUnpin | D-PC-05 独立 API |
| REQ-CO-03 连接成功不改 autoConnect | 2.1.3.4 决策表 / 2.2.2.2 markPinned | D-PC-05 独立 API |

---

> 本技术设计文档基于 PAD2-SPEC-PC-001 规格生成，将"已连接 SMB 共享工作台持久固定与仅手动离线断开"需求转化为可落地的架构、接口与数据模型设计。核心方案：在 SmbProfile 上向后兼容扩展 pinned 字段（version 1 框架，仿 autoConnect 模式），由 orchestration 层 pinnedSync 订阅连接成功事件标记 pinned=true，disconnectAndUnpin 编排用户主动离线解除 pinned，orchestrateAutoReconnect 筛选条件扩展为 pinned ∪ autoConnect 并集。smbMultiConnStore/SmbPlugin/main.tsx 零变更（HC-02/03/04 满足），UI 层经 orchestration 中转（HC-04 满足），既有持久化兼容（HC-05/DFX-PC-11）。下一步须由 spec-task-agent 基于本设计生成 tasks.md 任务分解。
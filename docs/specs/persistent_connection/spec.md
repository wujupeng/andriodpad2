# 需求规格：已连接 SMB 共享工作台持久固定与仅手动离线断开

> **文档编号**：PAD2-SPEC-PC-001
> **Feature Name**：persistent_connection
> **需求来源**：用户报告已连接的 SMB 共享（如"车间数据"）在应用重启后消失需重新连接；期望已连接共享一直固定在工作台，除非用户手动离线，否则连接不应断开
> **基线版本**：PAD2 v1.5（code 6），包名 com.pad2.filemanager，已落地 conn_persist_recent_ui（PAD2-SPEC-CPRU-001，含 autoConnect per-profile 可选标志）、multi_conn_writeback（PAD2-SPEC-MCWB-001）、browse_view_modes（PAD2-SPEC-BVM-001）
> **文档定位**：本文档为规格驱动开发（SDD）第一阶段产物，描述"做什么"（WHAT），不含"怎么做"（HOW）。所有业务规则采用 EARS 格式（WHEN/IF/WHILE … THEN …）与可测试验收条件（触发场景 → 预期行为）描述。
> **EARS 格式说明**：
> - **WHEN** [触发事件] **THE SYSTEM SHALL** [响应] — 事件驱动
> - **IF** [前置条件] **THEN THE SYSTEM SHALL** [响应] — 条件驱动
> - **WHILE** [持续状态] **THE SYSTEM SHALL** [响应] — 状态驱动
> - **WHERE** [特征约束] **THE SYSTEM SHALL** [响应] — 可选特征驱动
> **硬约束（贯穿全文，继承自项目记忆）**：
> - HC-01 零新增 npm 依赖
> - HC-02 冻结区零变更：`src/adapter/smb/SmbPlugin.ts` / `src/core/**` / `android/**`
> - HC-03 `src/main.tsx` 改动限 3 行内（复用既有 `initBootProfiles` 启动编排入口）
> - HC-04 store 分级：store 为 SmbPlugin 唯一调用入口，UI 层不得直接 import SmbPlugin
> - HC-05 既有持久化兼容：不破坏 `pad2.profiles.v1` / `pad2.prefs.v1` 等既存数据
> - HC-06 只读模式兼容

---

# 0. 问题背景与当前状态

## 0.1 问题：已连接的 SMB 共享在应用重启后消失，需重新连接

**现象**：用户在工作台连接了 SMB 共享（如"车间数据"，状态"已连接"，有"进入浏览"按钮），彻底关闭 PAD2 后重新打开，已连接的共享卡片从工作台消失，需重新进入连接页手动连接。用户期望已连接的共享一直固定在工作台上，除非手动点击"离线"按钮，否则连接不应断开。

**当前架构事实（代码证据）**：

| 证据编号 | 代码位置 | 事实 |
|---------|---------|------|
| EV-PC-01 | `src/state/smbMultiConnStore.ts:83` | `handles: new Map()` 为会话内存初始值，冷启动后活跃连接集合为空，工作台无已连接卡片可渲染 |
| EV-PC-02 | `src/ui/pages/HomePage/StorageOverviewRow/MultiSmbCards.tsx:71,75-77` | 工作台多卡区按 `smbMultiConnStore.handles` 过滤 `connected/connecting/connect_failed` 渲染，handles 为空时渲染"未连接，点击进入配置连接"占位卡（行 79-96） |
| EV-PC-03 | `src/state/smbProfilesStore.ts:43-44` | `SmbProfile.autoConnect?: boolean` 为可选字段，默认 false（缺失视为 false），仅用户在连接配置编辑页主动勾选"自动连接"时才为 true |
| EV-PC-04 | `src/ui/pages/ConnectionPage/ConnectionFormPanel/index.tsx:112,354-356` | autoConnect 勾选 UI 的 `disabled` 条件含 `!rememberPassword`——须先勾选"记住密码"才能勾选"自动连接"，未记住密码的 profile 无法启用自动重连 |
| EV-PC-05 | `src/orchestration/boot/autoReconnect.ts:35-37` | `orchestrateAutoReconnect` 仅筛选 `autoConnect === true` 的 profile 自动重连，autoConnect=false（默认）的 profile 冷启动后不重连，工作台不显示 |
| EV-PC-06 | `src/ui/pages/HomePage/StorageOverviewRow/MultiSmbCards.tsx:59-65` | 工作台已连接共享卡片仅含"进入浏览"按钮，无"离线"按钮，用户无法在工作台直接断开连接 |
| EV-PC-07 | `src/state/smbMultiConnStore.ts:133-151` | `disconnect(profileId)` 仅移除内存 handle，不持久化"已主动离线"语义，重启后若该 profile autoConnect=true 仍会自动重连（无法区分"曾主动离线"与"未曾连接"） |
| EV-PC-08 | `src/state/smbConnectionStore.ts:119-128` | `disconnect()` 清空 `lastConnect` 会话内存上下文，重启后无重连凭据线索（autoConnect 标志在 profile 层，与此正交） |
| EV-PC-09 | `src/main.tsx:9,14` | 启动链已调用 `initBootProfiles()`（conn_persist_recent_ui 落地），冷启动加载 profiles + 自动重连编排入口已存在，本特性复用此入口扩展编排逻辑 |

**根因结论**：当前持久化模型为"用户主动勾选 autoConnect 才冷启动重连"（默认 false），已连接状态本身不跨会话持久化。工作台多卡区消费会话内存 `handles`（冷启动为空），仅 autoConnect=true 且凭据可用的 profile 重连后才填充。已连接共享卡片无"离线"按钮，且 disconnect 不持久化"主动离线"语义，无法满足"已连接即固定、仅手动离线才断开"的期望。需将"已连接"状态升级为跨会话持久化的"固定"语义，并在工作台卡片新增"离线"按钮以显式解除固定。

**期望**：用户成功连接 SMB 共享后，该共享固定显示在工作台；应用重启后自动重新连接所有"已固定且未手动离线"的共享并恢复工作台卡片；仅当用户在工作台或连接页手动点击"离线"按钮时才断开连接并解除固定；用户再次手动连接后恢复固定语义。

---

# 1. 组件定位

## 1.1 核心职责

本组件负责将"已连接"的 SMB 共享升级为跨会话持久固定的"工作台常驻"语义，实现连接成功即固定、应用重启自动重连恢复、仅用户手动离线才解除固定，并在工作台已连接卡片提供显式"离线"入口。

## 1.2 核心输入

1. **用户连接成功事件**：用户对某 SMB 共享连接成功，来源为 smbMultiConnStore.connect resolve connected 态。
2. **用户手动离线指令**：用户在工作台已连接卡片点击"离线"按钮，或在连接页对已连接 profile 触发断开，来源为工作台 MultiSmbCards 离线按钮与连接页断开操作。
3. **应用冷启动信号**：应用进程启动时的初始化触发，来源为 main.tsx → initBootProfiles 启动编排入口（既有，复用）。
4. **用户再次连接指令**：用户对已手动离线的 profile 再次发起连接，来源为连接页连接操作或工作台"去连接"入口。
5. **profile 持久化数据**：Preferences `pad2.profiles.v1` 中已保存的 SMB 共享配置（含 autoConnect 既有字段），来源为 smbProfilesStore.load()。

## 1.3 核心输出

1. **返回给用户的响应**：工作台持久呈现已固定的已连接共享卡片（含"进入浏览"与"离线"按钮），冷启动后自动恢复已固定共享的连接与卡片。
2. **发送给 Windows SMB 服务器的请求**：冷启动时对"已固定且未手动离线且凭据可用"的 profile 自动发起 SMB 会话建立。
3. **推送给用户的通知**：自动重连成功（卡片恢复"已连接"）、自动重连失败（卡片呈现失败态 + 可读原因）、凭据不可用跳过（提示手动连接）。
4. **持久化输出**：profile 的"固定"状态（已连接即固定、手动离线即解除）写入 Preferences `pad2.profiles.v1`（版本兼容扩展），跨会话保留。

## 1.4 职责边界

本组件**不负责**以下事项：

1. **不负责** SMB 协议层会话建立/断开的底层实现：物理会话由既有 smbMultiConnStore.connect/disconnect + SmbPlugin 承载（HC-02 冻结区），本组件仅定义"固定"语义的业务行为与持久化。
2. **不负责** 凭据的加密存储与解密：凭据安全由既有 smbProfilesStore（AES-GCM）承载，本组件仅消费凭据可用性决定是否自动重连。
3. **不负责** 强制对所有 profile 持久固定：仅"已连接成功"的 profile 触发固定语义，未连接过的 profile 不固定（避免无凭据 profile 重启后无效重连）。
4. **不负责** 后台保活/心跳维持永久在线：固定语义仅保证冷启动时自动重连一次，连接因网络/服务器原因断开后按既有六态状态机处理（network_interrupted/session_invalid 由用户手动重连或网络恢复探测），不引入额外心跳。
5. **不负责** 修改既有 browseContextStore 的 per-profile 浏览上下文分区：本组件仅作用于连接状态持久化与工作台卡片呈现，浏览上下文由既有逻辑承载。
6. **不负责** 连接配置的增删改查：profile 配置管理由既有 smbProfilesStore.save/remove 承载，本组件仅在 profile 上扩展"固定"状态字段。

---

# 2. 领域术语

**工作台常驻固定（pinned）**
: SMB 共享连接成功后，该共享被标记为"固定"状态，工作台持久呈现其卡片，应用重启后自动重连恢复，仅用户手动离线才解除的语义。

**手动离线（manual offline）**
: 用户在工作台已连接卡片的"离线"按钮或连接页的断开操作上主动触发的连接断开，解除该共享的固定状态，重启后不再自动重连。

**自动重连恢复（auto reconnect restore）**
: 应用冷启动时，对所有"已固定且未手动离线且凭据可用"的 profile 自动发起 SMB 连接建立，恢复工作台卡片与连接状态的行为。

**固定状态（pinned state）**
: profile 的跨会话持久化标志，取值为"已固定（pinned=true）"或"未固定（pinned=false）"。连接成功时置 true，手动离线时置 false。

**凭据可用（credential available）**
: profile 的密码语义为"remembered"（密文存在且可解密）或"empty_credential"（空密码合法凭据），自动重连可凭既有凭据建立会话；"unset"（未保存密码）为不可用。

**工作台离线按钮（offline button）**
: 工作台已连接共享卡片上提供的显式断开入口，点击后断开连接并解除固定状态，区别于连接页的断开操作。

**冷启动固定恢复**
: 应用冷启动加载 profile 配置后，对 pinned=true 且未手动离线且凭据可用的 profile 自动重连的过程，复用既有 initBootProfiles 启动编排入口。

---

# 3. 角色与边界

## 3.1 核心角色

1. **普通成员**：在工作台连接 SMB 共享、查看已固定共享卡片、点击"离线"按钮断开、重启后依赖自动重连恢复的终端用户。

## 3.2 外部系统

1. **Preferences 持久化层**：提供 `pad2.profiles.v1` 的读写，承载 profile 配置与"固定"状态持久化（版本兼容扩展）。
2. **Windows SMB 服务器**：自动重连恢复时建立 SMB 会话的上游系统。
3. **smbMultiConnStore（既有）**：承载多连接管理与物理会话，本组件消费其 connect/disconnect 接口并监听连接成功事件以触发固定。
4. **smbProfilesStore（既有）**：承载 profile 持久化，本组件扩展其字段承载"固定"状态。
5. **initBootProfiles 启动编排（既有）**：冷启动加载 profiles + 自动重连入口，本组件复用并扩展其编排逻辑。

## 3.3 交互上下文

```plantuml
title 已连接 SMB 共享工作台持久固定与仅手动离线断开交互上下文

actor "普通成员" as Member
rectangle "PAD2 文件管理器" as App {
  rectangle "工作台\n(MultiSmbCards)" as Workbench
  rectangle "工作台离线按钮\n(OfflineButton)" as OfflineBtn
  rectangle "连接页\n(ConnectionPage)" as ConnPage
  rectangle "启动编排\n(initBootProfiles)" as Boot
  rectangle "固定状态管理\n(PinnedState)" as Pinned
}
database "Preferences\n(pad2.profiles.v1)" as Pref
database "Windows SMB 服务器" as SMB

Member --> Workbench : 连接共享成功
Workbench --> Pinned : 标记固定(pinned=true)
Pinned --> Pref : 持久化固定状态
Workbench --> Member : 持久呈现已连接卡片(含离线按钮)

Member --> OfflineBtn : 点击"离线"
OfflineBtn --> Pinned : 解除固定(pinned=false)
Pinned --> Pref : 持久化解除固定
OfflineBtn --> SMB : 断开会话

Boot --> Pref : 冷启动加载 profiles + 固定状态
Pref --> Boot : profile 列表 + pinned 标志
Boot --> SMB : 自动重连恢复(pinned=true 且凭据可用)
SMB --> Boot : 连接成功/失败
Boot --> Workbench : 恢复已固定共享卡片
Workbench --> Member : 工作台呈现已固定共享
```

---

# 4. DFX 约束

## 4.1 性能

1. **DFX-PC-01 固定状态持久化不阻塞连接**：连接成功后标记固定并持久化的操作须异步执行，不阻塞连接成功的 UI 反馈，持久化在 200ms 内完成（Preferences 单次写入）。
   - 验收条件：[用户连接共享成功] → [立即呈现"已连接"卡片，固定状态持久化后台异步完成 < 200ms]
2. **DFX-PC-02 冷启动固定恢复不阻塞启动**：冷启动固定恢复须在 profiles 加载完成后异步触发，应用立即可交互，多个固定 profile 并行重连受 MAX_CONCURRENT（4）上限保护。
   - 验收条件：[冷启动有 3 个 pinned profile] → [应用立即可交互，3 个 profile 异步重连，活跃连接数不超上限 4]
3. **DFX-PC-03 工作台离线按钮响应时间**：点击工作台"离线"按钮后，卡片状态切换（已连接 → 离线/移除）须在 300ms 内完成（不含物理断开网络耗时）。
   - 验收条件：[用户点击工作台"离线"按钮] → [卡片在 300ms 内切换为离线态或移除，物理断开后台异步]

## 4.2 可靠性

1. **DFX-PC-04 固定状态持久化失败不崩溃**：Preferences 写入失败或读取损坏时，须安全降级——读取损坏回退为未固定，写入失败内存态仍生效，不崩溃，不阻塞连接。
   - 验收条件：[Preferences 损坏/写入异常] → [固定状态回退未固定或内存态生效，应用正常可用]
2. **DFX-PC-05 单个固定 profile 重连失败不阻塞其他**：单个固定 profile 自动重连失败不得影响其他固定 profile 的重连或应用可用性。
   - 验收条件：[pinned profile A 重连失败] → [pinned profile B 继续重连，应用可交互，A 呈现 connect_failed 态]
3. **DFX-PC-06 固定状态与连接事实一致**：固定状态须与连接事实一致——仅连接成功才固定，手动离线才解除，不出现"固定但未连接"或"已连接但未固定"的持久化矛盾（瞬态如 connecting 允许）。
   - 验收条件：[检查持久化数据] → [pinned=true 的 profile 均曾连接成功过，pinned=false 的 profile 均曾手动离线或未连接过]

## 4.3 安全性

1. **DFX-PC-07 固定状态不泄露凭据**：固定状态仅为布尔标志，不携带密码/密文/凭据，持久化不新增敏感字段。
   - 验收条件：[检查 pad2.profiles.v1 持久化数据] → [pinned 为布尔字段，不含密码/密文]
2. **DFX-PC-08 未记住密码 profile 固定须提示**：未记住密码的 profile 即使连接成功被标记固定，冷启动自动重连时须跳过并明确提示用户手动连接（无凭据无法建立会话）。
   - 验收条件：[pinned=true 且未记住密码的 profile 冷启动] → [跳过自动重连，提示"请手动输入密码连接"，不静默]

## 4.4 可维护性

1. **DFX-PC-09 固定状态可观测**：每个 profile 的固定状态须可查询，工作台卡片与连接页可观测当前固定状态，供诊断与用户确认。
   - 验收条件：[查询 profile 固定状态] → [返回 pinned 布尔值，工作台/连接页可观测]
2. **DFX-PC-10 固定状态变更可追溯**：固定状态的置位（连接成功）与解除（手动离线）须有可观测的变更路径，便于诊断"为何固定/为何未固定"。
   - 验收条件：[profile 固定状态变更] → [可追溯变更来源（连接成功/手动离线），不含敏感字段]

## 4.5 兼容性

1. **DFX-PC-11 既有 profile 持久化兼容**：新增 pinned 字段须在 `pad2.profiles.v1` version 1 框架内向后兼容扩展，旧数据缺失字段视为 pinned=false（不升级版本号，不安全丢弃用户配置）。
   - 验收条件：[既有无 pinned 字段的 profile 数据加载] → [pinned 视为 false，profile 列表完整保留]
2. **DFX-PC-12 既有 autoConnect 语义兼容**：本特性不破坏既有 autoConnect per-profile 可选标志语义，autoConnect=true 的 profile 仍按既有逻辑冷启动重连；pinned 与 autoConnect 共同决定冷启动重连行为（具体合并策略属设计阶段决策，本规格仅约束不破坏既有行为）。
   - 验收条件：[既有 autoConnect=true 的 profile 升级后冷启动] → [仍自动重连（既有行为保留），不因本特性变更而失效]

---

# 5. 核心能力

## 5.1 已连接共享工作台持久固定（REQ-PN）

### 5.1.1 业务规则

1. **REQ-PN-01 连接成功即标记固定**：WHEN 用户对 SMB 共享连接成功（smbMultiConnStore handle 进入 connected 态） THEN THE SYSTEM SHALL 将该 profile 标记为固定状态（pinned=true）并持久化到 Preferences，使工作台持久呈现该共享卡片。
   - 验收条件：[用户连接"车间数据"成功] → [profile.pinned=true 持久化，工作台持久呈现"车间数据"已连接卡片]
   - 验收条件：[连接成功后彻底重启应用] → [工作台仍呈现"车间数据"卡片（自动重连恢复后）]

2. **REQ-PN-02 工作台持久呈现已固定共享卡片**：WHEN 工作台渲染 AND 某 profile 处于固定状态（pinned=true）且连接态为 connected/connecting/connect_failed THEN THE SYSTEM SHALL 在工作台呈现该共享的状态卡片，卡片不因应用重启或页面切换而消失。
   - 验收条件：[profile pinned=true 且 connected，查看工作台] → [工作台呈现该共享已连接卡片]
   - 验收条件：[profile pinned=true 且 connect_failed（重连失败），查看工作台] → [工作台呈现该共享失败卡片（含重试入口）]

3. **REQ-PN-03 工作台已连接卡片含离线按钮**：WHEN 工作台呈现已连接（connected）的固定共享卡片 THEN THE SYSTEM SHALL 在卡片上提供"离线"按钮，点击后断开连接并解除固定状态。
   - 验收条件：[工作台已连接卡片] → [卡片含"离线"按钮，与"进入浏览"按钮并列]
   - 验收条件：[点击"离线"按钮] → [断开连接，pinned=false 持久化，卡片切换为离线态或移除]

4. **REQ-PN-04 仅手动离线才解除固定**：IF 用户手动点击工作台"离线"按钮或连接页断开操作 THEN THE SYSTEM SHALL 解除该 profile 的固定状态（pinned=false）并持久化；非用户主动触发的断开（如网络中断、会话失效）不解除固定状态。
   - 验收条件：[用户点击工作台"离线"] → [pinned=false 持久化，重启后不再自动重连]
   - 验收条件：[连接因网络中断进入 network_interrupted 态] → [pinned 保持 true（非用户主动），网络恢复后仍可重连]

5. **REQ-PN-05 再次连接恢复固定**：WHEN 用户对已手动离线（pinned=false）的 profile 再次连接成功 THEN THE SYSTEM SHALL 重新标记固定状态（pinned=true）并持久化，恢复工作台常驻语义。
   - 验收条件：[profile pinned=false，用户再次连接成功] → [pinned=true 持久化，工作台恢复持久呈现]

6. **REQ-PN-06 删除 profile 同步解除固定**：WHEN 用户删除某 profile 配置 THEN THE SYSTEM SHALL 同步解除该 profile 的固定状态（pinned 不再有效），删除后不残留固定语义。
   - 验收条件：[删除 pinned=true 的 profile] → [profile 与固定状态一并移除，不残留]

7. **REQ-PN-07 固定状态持久化跨会话保留**：IF profile 被标记固定（pinned=true）THEN THE SYSTEM SHALL 将固定状态持久化到 Preferences，跨会话保留，冷启动加载后固定状态可恢复。
   - 验收条件：[标记 pinned=true 后彻底重启] → [冷启动加载后 pinned 仍为 true]

8. **REQ-PN-08 禁止项**：禁止连接成功后不标记固定（导致重启消失）；禁止非用户主动断开解除固定（网络中断不应解除）；禁止工作台已连接卡片无离线按钮（用户无法显式解除）；禁止固定状态携带敏感字段；禁止删除 profile 后残留固定语义。
   - 验收条件：[连接成功] → [必标记固定，不出现重启后已连接共享消失]
   - 验收条件：[网络中断] → [pinned 保持 true，不解除固定]
   - 验收条件：[工作台已连接卡片] → [必含离线按钮]
   - 验收条件：[检查 pinned 持久化字段] → [仅为布尔值，不含敏感字段]

### 5.1.2 交互流程

```plantuml
title 已连接共享工作台持久固定与离线断开主干流程
actor "普通成员" as Member
participant "工作台\n(MultiSmbCards)" as Workbench
participant "smbMultiConnStore" as MCS
participant "固定状态管理\n(PinnedState)" as Pinned
database "Preferences\n(pad2.profiles.v1)" as Pref
database "SMB 服务器" as SMB

Member -> Workbench : 连接共享(如"车间数据")
Workbench -> MCS : connect(profileId, options)
MCS -> SMB : 建立会话
SMB --> MCS : 就绪
MCS --> Workbench : handle → connected
Workbench -> Pinned : 标记固定(profileId, pinned=true)
Pinned -> Pref : 持久化 pinned=true
Workbench --> Member : 持久呈现已连接卡片(含"进入浏览"+"离线")

Member -> Workbench : 点击"离线"按钮
Workbench -> MCS : disconnect(profileId)
MCS -> SMB : 断开会话
MCS --> Workbench : handle 移除
Workbench -> Pinned : 解除固定(profileId, pinned=false)
Pinned -> Pref : 持久化 pinned=false
Workbench --> Member : 卡片切换为离线态或移除
```

### 5.1.3 异常场景

1. **固定状态持久化失败**
   - 触发条件：连接成功后 Preferences.set 写入失败。
   - 系统行为：内存态 pinned=true 本次会话生效，持久化失败静默降级，不崩溃，不阻塞连接成功反馈。
   - 用户感知：本次会话工作台持久呈现，重启后可能回退为未固定（pinned=false），不报错。

2. **固定状态读取损坏**
   - 触发条件：冷启动加载时 pinned 字段值非法（非布尔/篡改）。
   - 系统行为：降级为 pinned=false（未固定），不崩溃，profile 其他配置完整保留。
   - 用户感知：该 profile 不自动重连，用户可手动连接后重新固定。

3. **工作台离线按钮点击时物理断开失败**
   - 触发条件：用户点击"离线"按钮，SmbPlugin.disconnect 抛异常。
   - 系统行为：本地状态仍清理（handle 移除、pinned=false 持久化），物理断开失败不阻塞本地状态清理（连接上下文已不可信）。
   - 用户感知：卡片切换为离线态或移除，pinned=false 生效，不残留固定。

4. **已固定 profile 被外部删除（配置同步异常）**
   - 触发条件：pinned=true 的 profile 在持久化层被外部删除（数据篡改/多设备同步）。
   - 系统行为：冷启动加载时 profile 不存在，固定状态随之失效（无 profile 可重连），不崩溃。
   - 用户感知：工作台不呈现该共享卡片，无错误提示。

---

## 5.2 冷启动固定恢复自动重连（REQ-RC）

### 5.2.1 业务规则

1. **REQ-RC-01 冷启动恢复已固定共享**：WHEN 应用冷启动加载 profiles 完成 AND 某 profile pinned=true AND 未被手动离线 THEN THE SYSTEM SHALL 自动发起该 profile 的 SMB 连接建立，恢复工作台卡片与连接状态。
   - 验收条件：[冷启动，profile pinned=true] → [自动发起 connect，工作台恢复该共享卡片]
   - 验收条件：[冷启动，profile pinned=false（手动离线过）] → [不自动重连，工作台不呈现该共享卡片]

2. **REQ-RC-02 仅对凭据可用 profile 自动重连**：WHEN 冷启动固定恢复 AND profile pinned=true AND profile 凭据可用（remembered 或 empty_credential） THEN THE SYSTEM SHALL 自动发起连接；凭据不可用（unset）的 profile 跳过并明确提示。
   - 验收条件：[pinned=true 且记住密码且解密成功] → [自动发起 connect]
   - 验收条件：[pinned=true 且未记住密码] → [跳过自动重连，提示"请手动输入密码连接"，不发起 connect]
   - 验收条件：[pinned=true 且密文解密失败] → [跳过自动重连，提示"保存的密码无法解密，请重新输入"，profile 呈现 connect_failed]

3. **REQ-RC-03 固定恢复不阻塞应用启动**：WHEN 冷启动固定恢复触发 THEN THE SYSTEM SHALL 异步执行，应用立即可交互，不等待自动重连完成才进入可交互状态。
   - 验收条件：[冷启动有 pinned profile] → [应用立即可交互，pinned profile 异步重连，工作台卡片随重连完成逐步恢复]

4. **REQ-RC-04 固定恢复并发上限保护**：WHEN 多个 pinned profile 并行重连 AND 活跃连接数达上限 THEN THE SYSTEM SHALL 超出上限的 profile 排队或拒绝，不突破 MAX_CONCURRENT（4）上限。
   - 验收条件：[5 个 pinned profile 且上限 4] → [4 个并行重连，第 5 个排队或拒绝并提示，活跃连接数不超 4]

5. **REQ-RC-05 固定恢复失败如实告知**：IF 固定恢复重连失败（网络不可达/认证失败/凭据解密失败） THEN THE SYSTEM SHALL 将该 profile 置于 connect_failed 态并呈现可读原因，不静默跳过，不阻塞其他 profile 重连，且保持 pinned=true（允许用户手动重试）。
   - 验收条件：[pinned profile A 重连失败] → [A 呈现 connect_failed + 可读原因，B 继续重连，A 的 pinned 保持 true]
   - 验收条件：[pinned profile 重连失败] → [不出现静默跳过无反馈，工作台呈现失败卡片含重试入口]

6. **REQ-RC-06 固定恢复失败后用户可手动重试**：WHEN pinned profile 固定恢复失败（connect_failed） THEN THE SYSTEM SHALL 工作台失败卡片或连接页提供重试入口，用户手动重试成功后恢复连接与工作台常驻。
   - 验收条件：[pinned profile 重连失败，用户点击重试成功] → [恢复 connected 态，工作台呈现已连接卡片]

7. **REQ-RC-07 禁止项**：禁止冷启动后已固定共享从工作台消失（用户以为配置丢失）；禁止未记住密码的 pinned profile 自动重连（无凭据必失败）；禁止固定恢复失败时静默无反馈；禁止固定恢复失败后解除固定（应保持 pinned=true 允许重试）。
   - 验收条件：[冷启动后查看工作台] → [pinned profile 随重连完成恢复卡片，不出现永久消失]
   - 验收条件：[未记住密码的 pinned profile] → [不发起 connect，提示手动连接]
   - 验收条件：[固定恢复失败] → [pinned 保持 true，不解除固定]

### 5.2.2 交互流程

```plantuml
title 冷启动固定恢复自动重连流程
actor "普通成员" as Member
participant "启动编排\n(initBootProfiles)" as Boot
participant "smbProfilesStore" as PFS
database "Preferences\n(pad2.profiles.v1)" as Pref
participant "smbMultiConnStore" as MCS
database "SMB 服务器" as SMB
participant "工作台\n(MultiSmbCards)" as Workbench

Boot -> PFS : load()
PFS -> Pref : 读取 pad2.profiles.v1
Pref --> PFS : { profiles, pinned 标志 }
PFS --> Boot : profiles 加载完成

loop 每个 pinned=true 且未手动离线的 profile
  alt 凭据可用(remembered/empty_credential)
    Boot -> MCS : connect(profileId, options)
    MCS -> SMB : 建立会话
    alt 连接成功
      SMB --> MCS : 就绪
      MCS --> Workbench : 恢复已连接卡片
      Workbench --> Member : 工作台呈现已固定共享
    else 连接失败
      SMB --> MCS : 失败
      MCS --> Workbench : 呈现失败卡片(含重试)
      Workbench --> Member : 提示"自动连接失败：{原因}"
    end
  else 凭据不可用(unset/解密失败)
    Boot --> Workbench : 跳过自动重连
    Workbench --> Member : 提示"请手动输入密码连接"
  end
end
```

### 5.2.3 异常场景

1. **冷启动 profiles 加载失败**
   - 触发条件：Preferences.get 抛异常或返回非法 JSON。
   - 系统行为：smbProfilesStore.load() 安全降级为空列表（既有 fail-secure 逻辑），固定恢复无 profile 可重连，不崩溃。
   - 用户感知：工作台无已固定卡片，应用正常可用，用户可手动连接。

2. **固定恢复凭据解密失败**
   - 触发条件：profile pinned=true 但 passwordEncrypted 解密失败（密文篡改/密钥不可用）。
   - 系统行为：跳过自动重连，profile 呈现 connect_failed 态，lastError 含"密码无法解密"，pinned 保持 true。
   - 用户感知：工作台呈现失败卡片，提示"保存的密码无法解密，请重新输入"，可手动重连。

3. **固定恢复网络不可达**
   - 触发条件：pinned profile 重连时 SMB 服务器网络不可达。
   - 系统行为：profile 进入 connect_failed 态，lastError 含网络原因，pinned 保持 true，不阻塞其他 profile。
   - 用户感知：工作台呈现失败卡片，提示"自动连接失败：网络不可达"，可手动重试。

4. **固定恢复并发上限超出**
   - 触发条件：pinned profile 数超过 MAX_CONCURRENT（4）。
   - 系统行为：前 4 个并行重连，超出部分排队或拒绝并提示。
   - 用户感知：超出上限的 profile 提示"已达并发连接上限，请手动连接"。

5. **固定恢复期间用户手动离线**
   - 触发条件：pinned profile 正在 connecting（固定恢复中），用户点击工作台"离线"按钮。
   - 系统行为：取消该 profile 的重连，pinned=false 持久化，handle 移除。
   - 用户感知：卡片移除，重启后不再自动重连该 profile。

---

## 5.3 固定状态与既有 autoConnect 协调（REQ-CO）

### 5.3.1 业务规则

1. **REQ-CO-01 pinned 与 autoConnect 共同决定冷启动重连**：WHEN 冷启动自动重连编排 THEN THE SYSTEM SHALL 对 pinned=true 或 autoConnect=true 的 profile 均触发自动重连（并集），不因本特性引入而破坏既有 autoConnect 行为。
   - 验收条件：[profile pinned=true 且 autoConnect=false] → [冷启动自动重连（由 pinned 触发）]
   - 验收条件：[profile pinned=false 且 autoConnect=true] → [冷启动自动重连（由 autoConnect 触发，既有行为保留）]
   - 验收条件：[profile pinned=true 且 autoConnect=true] → [冷启动自动重连（不重复发起，幂等）]

2. **REQ-CO-02 手动离线仅解除 pinned 不改变 autoConnect**：IF 用户手动离线 THEN THE SYSTEM SHALL 仅解除 pinned（pinned=false），不改变 profile.autoConnect 字段（autoConnect 为用户独立配置的"启动时自动连接"偏好，与本特性的"固定"语义正交）。
   - 验收条件：[profile autoConnect=true，用户手动离线] → [pinned=false，autoConnect 保持 true，重启后仍由 autoConnect 触发重连]
   - 验收条件：[profile autoConnect=false，用户手动离线] → [pinned=false，autoConnect 保持 false，重启后不重连]

3. **REQ-CO-03 连接成功标记 pinned 不改变 autoConnect**：WHEN 用户连接成功 THEN THE SYSTEM SHALL 标记 pinned=true，不改变 profile.autoConnect 字段（autoConnect 由用户在配置编辑页独立设置）。
   - 验收条件：[profile autoConnect=false，用户连接成功] → [pinned=true，autoConnect 保持 false]
   - 验收条件：[profile autoConnect=true，用户连接成功] → [pinned=true，autoConnect 保持 true]

4. **REQ-CO-04 禁止项**：禁止本特性破坏既有 autoConnect 行为；禁止手动离线改变 autoConnect 字段；禁止连接成功改变 autoConnect 字段。
   - 验收条件：[既有 autoConnect=true profile 升级后] → [冷启动仍自动重连（既有行为保留）]
   - 验收条件：[手动离线] → [autoConnect 字段不变]
   - 验收条件：[连接成功] → [autoConnect 字段不变]

### 5.3.2 交互流程

```plantuml
title 固定状态与既有 autoConnect 协调
actor "普通成员" as Member
participant "工作台" as Workbench
participant "固定状态管理\n(PinnedState)" as Pinned
participant "smbProfilesStore" as PFS
database "Preferences\n(pad2.profiles.v1)" as Pref

Member -> Workbench : 连接成功
Workbench -> Pinned : 标记 pinned=true
Pinned -> PFS : 更新 profile.pinned=true（不改变 autoConnect）
PFS -> Pref : 持久化（pinned=true, autoConnect 不变）
Workbench --> Member : 工作台持久呈现

Member -> Workbench : 点击"离线"
Workbench -> Pinned : 解除 pinned=false
Pinned -> PFS : 更新 profile.pinned=false（不改变 autoConnect）
PFS -> Pref : 持久化（pinned=false, autoConnect 不变）
Workbench --> Member : 卡片离线/移除

note right of PFS
  pinned 与 autoConnect 正交：
  - pinned：连接成功即固定，手动离线即解除
  - autoConnect：用户独立配置的启动重连偏好
  - 冷启动重连 = pinned=true ∪ autoConnect=true
end note
```

### 5.3.3 异常场景

1. **既有 autoConnect=true profile 升级后 pinned 字段缺失**
   - 触发条件：升级前 profile 无 pinned 字段，autoConnect=true。
   - 系统行为：pinned 缺失视为 false（DFX-PC-11 兼容），冷启动由 autoConnect=true 触发重连（既有行为保留），重连成功后标记 pinned=true。
   - 用户感知：升级后冷启动仍自动重连（无感升级），重连后固定语义生效。

2. **pinned 与 autoConnect 同时为 true**
   - 触发条件：profile 既被固定（pinned=true）又勾选了自动连接（autoConnect=true）。
   - 系统行为：冷启动重连幂等（不重复发起 connect），重连成功后 pinned 保持 true。
   - 用户感知：冷启动自动重连一次，工作台恢复卡片，无重复连接。

---

# 6. 数据约束

## 6.1 SmbProfile 扩展（pinned 字段）

1. **pinned**：可选布尔字段，默认 false（缺失视为 false，DFX-PC-11 兼容）。true 表示该 profile 已连接成功并被标记为工作台常驻固定，冷启动自动重连恢复。
2. **pinned 与连接事实关系**：pinned=true 的 profile 须曾连接成功过（REQ-PN-01）；pinned=false 表示未连接过或已手动离线（REQ-PN-04）。
3. **pinned 与 autoConnect 正交**：pinned 与 autoConnect 为两个独立字段，语义正交——pinned 由连接成功/手动离线自动维护，autoConnect 由用户在配置编辑页独立设置（REQ-CO-02/03）。
4. **pinned 不携带敏感字段**：pinned 仅为布尔值，不含密码/密文/凭据（DFX-PC-07）。
5. **持久化兼容**：pinned 在 `pad2.profiles.v1` version 1 框架内向后兼容扩展，不升级版本号，旧数据缺失字段视为 false（DFX-PC-11）。
6. **非法值降级**：持久化的 pinned 值非布尔（篡改）时降级为 false，不崩溃（DFX-PC-04）。

## 6.2 冷启动重连决策约束

1. **重连触发条件**：冷启动重连的 profile 集合 = { p | p.pinned=true } ∪ { p | p.autoConnect=true }（REQ-CO-01 并集）。
2. **凭据可用性约束**：仅对凭据可用（remembered 或 empty_credential）的 profile 发起自动重连，unset 的 profile 跳过并提示（REQ-RC-02）。
3. **并发上限约束**：并行重连数不超过 MAX_CONCURRENT（4），超出部分排队或拒绝（REQ-RC-04）。
4. **幂等约束**：同一 profile 不因 pinned 与 autoConnect 同时为 true 而重复发起 connect（REQ-CO-04）。

## 6.3 工作台卡片呈现约束

1. **已固定卡片呈现条件**：profile pinned=true 且连接态为 connected/connecting/connect_failed 时，工作台呈现状态卡片（REQ-PN-02）。
2. **已连接卡片按钮**：连接态为 connected 时，卡片含"进入浏览"与"离线"两个按钮（REQ-PN-03）。
3. **失败卡片重试入口**：连接态为 connect_failed 时，卡片含重试入口（REQ-RC-06）。
4. **离线后卡片处理**：手动离线后，卡片切换为离线态或从工作台移除（REQ-PN-04），不残留已连接视觉。

---

# 7. 非目标（明确不做什么）

1. **NON-PC-01**：不负责后台保活/心跳维持固定共享的永久在线——固定语义仅保证冷启动时自动重连一次，连接因网络/服务器原因断开后按既有六态状态机处理（network_interrupted/session_invalid 由用户手动重连或网络恢复探测），不引入额外心跳保活机制。
2. **NON-PC-02**：不负责凭据的加密存储与解密——凭据安全由既有 smbProfilesStore（AES-GCM）承载，本组件仅消费凭据可用性决定是否自动重连。
3. **NON-PC-03**：不负责强制对所有 profile 持久固定——仅"已连接成功"的 profile 触发固定语义，未连接过的 profile 不固定（避免无凭据 profile 重启后无效重连）。
4. **NON-PC-04**：不负责修改 SmbPlugin 冻结区接口（HC-02）——物理会话建立/断开由既有 smbMultiConnStore + SmbPlugin 承载，本组件仅定义"固定"语义的业务行为与持久化。
5. **NON-PC-05**：不负责修改既有 browseContextStore 的 per-profile 浏览上下文分区——本组件仅作用于连接状态持久化与工作台卡片呈现，浏览上下文由既有逻辑承载。
6. **NON-PC-06**：不负责连接配置的增删改查——profile 配置管理由既有 smbProfilesStore.save/remove 承载，本组件仅在 profile 上扩展 pinned 字段。
7. **NON-PC-07**：不负责改变既有 autoConnect 的用户配置入口与语义——autoConnect 仍由用户在连接配置编辑页独立勾选，本特性不修改其 UI 与默认值（默认 false），pinned 与 autoConnect 正交共存。
8. **NON-PC-08**：不负责多设备间的固定状态同步——pinned 持久化于本设备 Preferences，不跨设备同步，多设备间固定状态可能不一致（属未来功能）。

---

# 8. 需求追溯与覆盖矩阵

| 需求编号 | 对应期望 | 核心内容 | 关键 EARS 模式 |
|---------|---------|---------|---------------|
| REQ-PN-01 | 已连接即固定 | 连接成功标记 pinned=true 持久化 | WHEN…THEN |
| REQ-PN-02 | 工作台持久呈现 | 已固定共享卡片不因重启消失 | WHEN…THEN |
| REQ-PN-03 | 工作台离线按钮 | 已连接卡片含"离线"按钮 | WHEN…THEN |
| REQ-PN-04 | 仅手动离线才解除 | 非用户主动断开不解除固定 | IF…THEN |
| REQ-PN-05 | 再次连接恢复固定 | 手动离线后再连接成功恢复 pinned | WHEN…THEN |
| REQ-PN-06 | 删除同步解除固定 | 删除 profile 同步移除固定语义 | WHEN…THEN |
| REQ-PN-07 | 固定状态跨会话保留 | pinned 持久化跨会话 | IF…THEN |
| REQ-RC-01 | 冷启动恢复已固定 | pinned=true 冷启动自动重连 | WHEN…THEN |
| REQ-RC-02 | 仅凭据可用重连 | unset 跳过并提示 | WHEN…THEN |
| REQ-RC-03 | 恢复不阻塞启动 | 异步执行应用立即可交互 | WHEN…THEN |
| REQ-RC-04 | 恢复并发上限保护 | 不突破 MAX_CONCURRENT | WHEN…THEN |
| REQ-RC-05 | 恢复失败如实告知 | 失败呈现原因不静默 | IF…THEN |
| REQ-RC-06 | 失败后可手动重试 | 失败卡片含重试入口 | WHEN…THEN |
| REQ-CO-01 | pinned ∪ autoConnect 决定重连 | 并集触发不破坏既有 | WHEN…THEN |
| REQ-CO-02 | 手动离线不改 autoConnect | pinned 与 autoConnect 正交 | IF…THEN |
| REQ-CO-03 | 连接成功不改 autoConnect | pinned 标记不改变 autoConnect | WHEN…THEN |

---

> 本需求规格文档覆盖"已连接的 SMB 共享一直固定在工作台，除非用户手动离线，否则连接不应断开"这一需求的全部业务规则、验收条件、DFX 约束与非目标。核心语义为：连接成功即标记固定（pinned=true）并持久化，工作台持久呈现已固定共享卡片（含"离线"按钮），冷启动自动重连恢复已固定且凭据可用的共享，仅用户手动点击"离线"按钮才解除固定（pinned=false），非用户主动断开（网络中断/会话失效）不解除固定。pinned 与既有 autoConnect 正交共存，冷启动重连决策为 pinned=true ∪ autoConnect=true 并集，不破坏既有 autoConnect 行为（DFX-PC-12 兼容）。所有业务规则均采用 EARS 格式（WHEN/IF/WHILE … THEN …）与可测试验收条件（触发场景 → 预期行为）描述。硬约束 HC-01~06 贯穿全文，复用既有 initBootProfiles 启动编排入口（HC-03），pinned 字段在 `pad2.profiles.v1` version 1 框架内向后兼容扩展（HC-05/DFX-PC-11）。下一步须由 spec-design-agent 基于本规格生成 design.md 技术设计文档。
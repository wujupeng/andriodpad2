# 编码任务规划：已连接 SMB 共享工作台持久固定与仅手动离线断开

> **文档编号**：PAD2-TASK-PC-001
> **Feature Name**：persistent_connection
> **对应规格**：PAD2-SPEC-PC-001（`docs/specs/persistent_connection/spec.md`）
> **对应设计**：PAD2-DESIGN-PC-001（`docs/specs/persistent_connection/design.md`）
> **文档定位**：本文档为规格驱动开发（SDD）第三阶段产物，将 design.md 技术设计转化为可执行、可验收的编码任务清单。任务按依赖关系排序，被依赖者在前。
> **硬约束（继承）**：HC-01 零新增 npm 依赖 / HC-02 冻结区零变更（`src/adapter/smb/SmbPlugin.ts` / `src/core/**` / `android/**`）/ HC-03 `main.tsx` 改动限 3 行内 / HC-04 store 分级（UI 层不得直接 import SmbPlugin）/ HC-05 既有持久化兼容 / HC-06 只读模式兼容
> **命名规范**：任务编号采用 `TASK-PC-{组}-{序}` 结构化长命名；状态标签采用英文大写常量（PENDING/IN_PROGRESS/DONE/BLOCKED）；验收状态采用 PASS/FAIL。

---

## 1. 数据模型与持久化层扩展

**依赖关系**：无前置依赖（基础层，被任务组 2/3/5/6 依赖）
**对应需求**：REQ-PN-01/07, DFX-PC-04/07/11, HC-05
**对应设计**：2.2.2.1 SmbProfile.pinned 字段扩展、2.2.2.2 smbProfilesStore.markPinned、2.3.2 模型实现

### 1.1 TASK-PC-01-01 在 SmbProfile 接口新增 pinned 可选字段
- [ ] 在 `src/state/smbProfilesStore.ts` 的 `SmbProfile` 接口新增 `pinned?: boolean` 可选字段，添加 JSDoc 注释说明语义（默认 false、连接成功自动置 true、手动离线自动置 false、与 autoConnect 正交），保持既有字段零变更
- **涉及文件**：`src/state/smbProfilesStore.ts`
- **依赖**：无
- **验收标准**：[TypeScript 编译通过] AND [`SmbProfile` 类型含 `pinned?: boolean` 字段] AND [既有字段签名零变更] AND [pinned 字段不携带敏感字段（DFX-PC-07）]

### 1.2 TASK-PC-01-02 在 sanitizeProfile 添加 pinned 白名单解析
- [ ] 在 `src/state/smbProfilesStore.ts` 的 `sanitizeProfile` 函数内，仿照既有 `autoConnect` 解析模式（`if (p.autoConnect === true) profile.autoConnect = true;`），新增 `if (p.pinned === true) profile.pinned = true;` 白名单解析；`STORAGE_VERSION` 保持 1 不升（DFX-PC-11/HC-05）
- **涉及文件**：`src/state/smbProfilesStore.ts`
- **依赖**：TASK-PC-01-01
- **验收标准**：[旧数据缺失 pinned 字段加载后 pinned 视为 false] AND [pinned=true 落位正确] AND [pinned 非布尔值（篡改）降级为 false 不崩溃（DFX-PC-04）] AND [`STORAGE_VERSION` 保持 1] AND [既有 sanitize 逻辑零变更]

### 1.3 TASK-PC-01-03 新增 smbProfilesStore.markPinned 独立 API
- [ ] 在 `src/state/smbProfilesStore.ts` 新增 `markPinned(profileId: string, pinned: boolean): Promise<void>` 方法：按 profileId 查找 profile，不存在时静默返回；存在时更新 `pinned` 字段并调既有 `persist` 函数持久化整个 profiles 数组；持久化失败静默降级（内存态生效，复用既有 `persist` try/catch 模式，DFX-PC-04）；**不触碰 autoConnect/passwordEncrypted 等其他字段（REQ-CO-02/03 正交）**；日志仅输出 `[smbProfilesStore]` 标识，永不输出凭据
- **涉及文件**：`src/state/smbProfilesStore.ts`
- **依赖**：TASK-PC-01-01, TASK-PC-01-02
- **验收标准**：[profile 存在时 pinned 字段更新并持久化到 `pad2.profiles.v1`] AND [profile 不存在时静默返回不抛错] AND [持久化失败时内存态 pinned 生效且不崩溃（DFX-PC-04）] AND [autoConnect 字段零变更（REQ-CO-02/03）] AND [passwordEncrypted 字段零变更（DFX-PC-07）] AND [既有 `save`/`load`/`remove` 接口签名零变更]

---

## 2. Orchestration 层固定状态管理（新增模块）

**依赖关系**：依赖任务组 1（markPinned API）
**对应需求**：REQ-PN-01/04/05, DFX-PC-01/03/04/06
**对应设计**：2.2.2.3 pinnedSync 订阅模块、2.2.2.4 disconnectAndUnpin 编排函数、D-PC-02/03/05/06

### 2.1 TASK-PC-02-01 新增 pinnedSync 订阅模块
- [ ] 新建 `src/orchestration/boot/pinnedSync.ts`，导出 `startPinnedSync(): () => void` 函数：通过 `useSmbMultiConnStore.subscribe` 订阅 `handles` 变化；订阅回调中遍历新增 connected 态 handle，对对应 `profile.pinned !== true` 的 profile 异步调 `useSmbProfilesStore.getState().markPinned(profileId, true)`（不 await，不阻塞连接成功的 UI 反馈，DFX-PC-01）；profile 不存在（已删除）时静默跳过；返回 unsubscribe 函数；**幂等：profile.pinned 已为 true 时跳过（D-PC-06，避免重复持久化写入）**
- **涉及文件**：`src/orchestration/boot/pinnedSync.ts`（新建）
- **依赖**：TASK-PC-01-03
- **验收标准**：[连接成功后对应 profile 被异步标记 pinned=true] AND [pinned 已为 true 时不重复持久化写入（幂等）] AND [订阅回调不阻塞连接成功的 UI 反馈（DFX-PC-01）] AND [profile 不存在时静默跳过不抛错] AND [返回的 unsubscribe 函数调用后停止订阅] AND [smbMultiConnStore 零变更（D-PC-02）]

### 2.2 TASK-PC-02-02 新增 disconnectAndUnpin 编排函数
- [ ] 新建 `src/orchestration/boot/disconnectAndUnpin.ts`，导出 `disconnectAndUnpin(profileId: string): Promise<void>` 异步函数：依次调用 `useSmbMultiConnStore.getState().disconnect(profileId)`（物理断开 + handle 移除，UI 立即重渲染）与 `useSmbMultiConnStore.getState().markPinned(profileId, false)`（解除固定持久化）；**物理断开失败不阻塞本地状态清理与 pinned 解除**（try/catch 包裹 disconnect，异常静默降级，DFX-PC-04）；**持久化失败不阻塞本地状态清理**（markPinned 内部已静默降级）；autoConnect 字段零变更（REQ-CO-02）
- **涉及文件**：`src/orchestration/boot/disconnectAndUnpin.ts`（新建）
- **依赖**：TASK-PC-01-03
- **验收标准**：[调用后 handle 从 handles 移除] AND [pinned 置 false 并持久化] AND [物理断开异常时本地状态清理与 pinned 解除仍执行（DFX-PC-04）] AND [持久化异常时内存态 pinned=false 生效] AND [autoConnect 字段零变更（REQ-CO-02）] AND [smbMultiConnStore.disconnect 接口零变更（D-PC-03）]

---

## 3. 冷启动重连并集筛选与启动编排扩展

**依赖关系**：依赖任务组 1（pinned 字段）、任务组 2（pinnedSync）
**对应需求**：REQ-RC-01/03, REQ-CO-01/04, DFX-PC-02/12, HC-03
**对应设计**：2.2.2.5 orchestrateAutoReconnect 筛选条件扩展、2.1.3.2 冷启动固定恢复流程、D-PC-04

### 3.1 TASK-PC-03-01 扩展 orchestrateAutoReconnect 筛选条件为并集
- [ ] 在 `src/orchestration/boot/autoReconnect.ts` 的 `orchestrateAutoReconnect` 函数内，将筛选条件由 `profiles.filter((p) => p.autoConnect === true)` 扩展为 `profiles.filter((p) => p.pinned === true || p.autoConnect === true)`（并集，REQ-CO-01）；凭据三态处理逻辑（remembered 解密 / empty_credential 空密码 / unset 跳过）零变更复用；循环天然幂等（同一 profile 只 connect 一次，REQ-CO-04）
- **涉及文件**：`src/orchestration/boot/autoReconnect.ts`
- **依赖**：TASK-PC-01-02
- **验收标准**：[pinned=true 且 autoConnect=false 的 profile 冷启动自动重连] AND [pinned=false 且 autoConnect=true 的 profile 冷启动自动重连（既有行为保留，DFX-PC-12）] AND [pinned=true 且 autoConnect=true 的 profile 冷启动只 connect 一次（幂等）] AND [凭据三态处理逻辑零变更] AND [既有 autoConnect=true 行为保留]

### 3.2 TASK-PC-03-02 在 initBootProfiles 启动 pinnedSync 订阅
- [ ] 在 `src/orchestration/boot/autoReconnect.ts` 的 `initBootProfiles` 函数内，于 `await useSmbProfilesStore.getState().load()` 完成后、`void orchestrateAutoReconnect()` 调用前，新增 `startPinnedSync()` 订阅启动调用（导入 `./pinnedSync`）；`main.tsx` 零变更（HC-03，既有 `void initBootProfiles()` 调用不变）；订阅随进程生命周期持续（无需显式 stop）
- **涉及文件**：`src/orchestration/boot/autoReconnect.ts`
- **依赖**：TASK-PC-02-01
- **验收标准**：[冷启动 profiles 加载后 pinnedSync 订阅已启动] AND [`main.tsx` 零变更（HC-03）] AND [应用立即可交互不阻塞（DFX-PC-02）] AND [pinnedSync 订阅在 orchestrateAutoReconnect 之前启动，确保重连成功的 handle 能被订阅捕获]

---

## 4. 工作台离线按钮 UI 扩展

**依赖关系**：依赖任务组 2（disconnectAndUnpin）
**对应需求**：REQ-PN-03, DFX-PC-03, HC-04
**对应设计**：2.2.2.6 SmbStateCard / MultiSmbCards UI 扩展、2.1.3.3 用户手动离线流程

### 4.1 TASK-PC-04-01 在 SmbStateCard 新增离线按钮渲染
- [ ] 在 `src/ui/pages/HomePage/StorageOverviewRow/MultiSmbCards.tsx` 的 `SmbStateCard` 组件，于 `state === 'connected'` 分支内与"进入浏览"按钮并列新增"离线"按钮（使用既有 `BaseButton` 组件，variant 选用 danger 或 secondary，size 选用 sm）；按钮 `onPress` 调用新增的 `onOffline` props 回调；`SmbCardProps` 接口新增 `onOffline: () => void` 可选 props；**既有"进入浏览"按钮零变更**
- **涉及文件**：`src/ui/pages/HomePage/StorageOverviewRow/MultiSmbCards.tsx`
- **依赖**：无（UI 层 props 扩展，与 orchestration 层解耦）
- **验收标准**：[工作台已连接卡片含"离线"按钮，与"进入浏览"按钮并列] AND [点击"离线"按钮触发 `onOffline` 回调] AND [既有"进入浏览"按钮零变更] AND [非 connected 态不渲染离线按钮] AND [使用既有 `BaseButton` 组件无新增依赖（HC-01）]

### 4.2 TASK-PC-04-02 MultiSmbCards 注入 disconnectAndUnpin 到 onOffline
- [ ] 在 `src/ui/pages/HomePage/StorageOverviewRow/MultiSmbCards.tsx` 的 `MultiSmbCards` 组件，导入 `disconnectAndUnpin`（来自 `src/orchestration/boot/disconnectAndUnpin`），在渲染 `SmbStateCard` 时将 `onOffline={() => void disconnectAndUnpin(h.profileId)}` 注入 props；**UI 层不直接 import SmbPlugin（HC-04），经 orchestration 层中转**
- **涉及文件**：`src/ui/pages/HomePage/StorageOverviewRow/MultiSmbCards.tsx`
- **依赖**：TASK-PC-02-02, TASK-PC-04-01
- **验收标准**：[点击工作台"离线"按钮触发 `disconnectAndUnpin(profileId)`] AND [UI 层未直接 import `SmbPlugin`（HC-04）] AND [卡片在 300ms 内切换为离线态或移除（DFX-PC-03）] AND [既有 handles 渲染逻辑零变更]

---

## 5. 单元测试

**依赖关系**：依赖任务组 1-4
**对应需求**：覆盖 REQ-PN-01/04/05/07, REQ-CO-01/02/03, DFX-PC-04/06/07/11
**测试框架**：node:test + tsx（既有，HC-01 零新增依赖）
**测试目录**：`test/`（既有约定，文件命名 `xxx.test.ts`）

### 5.1 TASK-PC-05-01 sanitizeProfile pinned 白名单解析单元测试
- [ ] 新建 `test/persistentConnection/sanitizePinned.test.ts`，覆盖：① 旧数据缺失 pinned 字段加载后 pinned 视为 false（DFX-PC-11）；② pinned=true 落位正确；③ pinned 非布尔值（如 `"true"` 字符串、`1` 数字、`null`）降级为 false 不崩溃（DFX-PC-04）；④ pinned 字段不携带敏感字段（DFX-PC-07）；⑤ 既有 autoConnect 解析逻辑回归不破坏
- **涉及文件**：`test/persistentConnection/sanitizePinned.test.ts`（新建）
- **依赖**：TASK-PC-01-02
- **验收标准**：[5 个测试用例全部 PASS] AND [覆盖 DFX-PC-04/07/11] AND [既有 autoConnect 解析回归通过]

### 5.2 TASK-PC-05-02 markPinned API 单元测试
- [ ] 新建 `test/persistentConnection/markPinned.test.ts`，覆盖：① profile 存在时 pinned 字段更新并持久化；② profile 不存在时静默返回不抛错；③ 持久化失败时内存态 pinned 生效且不崩溃（DFX-PC-04，mock Preferences.set 抛异常）；④ autoConnect 字段零变更（REQ-CO-02/03）；⑤ passwordEncrypted 字段零变更（DFX-PC-07）；⑥ 既有 `save`/`load`/`remove` 接口回归不破坏
- **涉及文件**：`test/persistentConnection/markPinned.test.ts`（新建）
- **依赖**：TASK-PC-01-03
- **验收标准**：[6 个测试用例全部 PASS] AND [覆盖 DFX-PC-04/07, REQ-CO-02/03] AND [既有 smbProfilesStore 接口回归通过]

### 5.3 TASK-PC-05-03 pinnedSync 订阅模块单元测试
- [ ] 新建 `test/persistentConnection/pinnedSync.test.ts`，覆盖：① 连接成功（handle 进入 connected 态）后对应 profile 被异步标记 pinned=true（REQ-PN-01）；② pinned 已为 true 时不重复持久化写入（D-PC-06 幂等）；③ 订阅回调不阻塞连接成功的 UI 反馈（DFX-PC-01，验证 markPinned 异步调用）；④ profile 不存在（已删除）时静默跳过不抛错；⑤ unsubscribe 函数调用后停止订阅；⑥ 非用户主动断开（network_interrupted）不触发 pinned 标记（仅 connected 态触发）
- **涉及文件**：`test/persistentConnection/pinnedSync.test.ts`（新建）
- **依赖**：TASK-PC-02-01, TASK-PC-05-02
- **验收标准**：[6 个测试用例全部 PASS] AND [覆盖 REQ-PN-01, DFX-PC-01/06, D-PC-06] AND [smbMultiConnStore 零变更验证]

### 5.4 TASK-PC-05-04 disconnectAndUnpin 编排函数单元测试
- [ ] 新建 `test/persistentConnection/disconnectAndUnpin.test.ts`，覆盖：① 调用后 handle 从 handles 移除 + pinned 置 false 持久化（REQ-PN-04）；② 物理断开异常（mock disconnect 抛错）时本地状态清理与 pinned 解除仍执行（DFX-PC-04）；③ 持久化异常（mock markPinned 抛错）时内存态 pinned=false 生效；④ autoConnect 字段零变更（REQ-CO-02）；⑤ 卡片切换在 300ms 内完成（DFX-PC-03）
- **涉及文件**：`test/persistentConnection/disconnectAndUnpin.test.ts`（新建）
- **依赖**：TASK-PC-02-02, TASK-PC-05-02
- **验收标准**：[5 个测试用例全部 PASS] AND [覆盖 REQ-PN-04, DFX-PC-03/04, REQ-CO-02] AND [smbMultiConnStore.disconnect 接口零变更验证]

### 5.5 TASK-PC-05-05 orchestrateAutoReconnect 并集筛选单元测试
- [ ] 新建 `test/persistentConnection/autoReconnectUnion.test.ts`，覆盖：① pinned=true 且 autoConnect=false 的 profile 冷启动自动重连（REQ-CO-01）；② pinned=false 且 autoConnect=true 的 profile 冷启动自动重连（既有行为保留，DFX-PC-12）；③ pinned=true 且 autoConnect=true 的 profile 冷启动只 connect 一次（幂等，REQ-CO-04）；④ pinned=false 且 autoConnect=false 的 profile 冷启动不重连；⑤ 凭据三态处理逻辑零变更复用（remembered/empty_credential/unset 分流验证）
- **涉及文件**：`test/persistentConnection/autoReconnectUnion.test.ts`（新建）
- **依赖**：TASK-PC-03-01
- **验收标准**：[5 个测试用例全部 PASS] AND [覆盖 REQ-CO-01/04, DFX-PC-12] AND [既有凭据三态处理逻辑回归通过]

---

## 6. 集成测试与端到端验证

**依赖关系**：依赖任务组 5
**对应需求**：覆盖 REQ-PN-01~07, REQ-RC-01~06, REQ-CO-01~04 全部业务规则

### 6.1 TASK-PC-06-01 连接成功标记固定集成测试
- [ ] 新建 `test/persistentConnection/integration/connectPinned.test.ts`，覆盖端到端流程：用户连接 SMB 共享成功 → pinnedSync 订阅触发 → markPinned 持久化 pinned=true → 工作台持久呈现已连接卡片（含"进入浏览"+"离线"按钮）；验证 `pad2.profiles.v1` 持久化数据含 `pinned: true`；验证连接成功的 UI 反馈不被持久化阻塞（DFX-PC-01）
- **涉及文件**：`test/persistentConnection/integration/connectPinned.test.ts`（新建）
- **依赖**：TASK-PC-05-03, TASK-PC-04-02
- **验收标准**：[连接成功后 `pad2.profiles.v1` 含 `pinned: true`] AND [工作台呈现已连接卡片含"离线"按钮] AND [连接成功 UI 反馈立即呈现，持久化后台异步完成] AND [覆盖 REQ-PN-01/03, DFX-PC-01]

### 6.2 TASK-PC-06-02 冷启动固定恢复集成测试
- [ ] 新建 `test/persistentConnection/integration/coldBootRestore.test.ts`，覆盖端到端流程：持久化数据含 pinned=true profile → 模拟冷启动（initBootProfiles）→ orchestrateAutoReconnect 并集筛选 → 自动重连恢复 → 工作台呈现已固定共享卡片；覆盖：① 凭据可用（remembered/empty_credential）自动重连成功；② 凭据不可用（unset）跳过并提示；③ 密文解密失败置 connect_failed 提示重新输入；④ 并发上限保护（5 个 pinned profile，4 个并行第 5 个排队）；⑤ 单个失败不阻塞其他（DFX-PC-05）；⑥ 应用立即可交互不阻塞（DFX-PC-02）
- **涉及文件**：`test/persistentConnection/integration/coldBootRestore.test.ts`（新建）
- **依赖**：TASK-PC-05-05, TASK-PC-03-02
- **验收标准**：[pinned=true profile 冷启动自动重连恢复工作台卡片] AND [unset profile 跳过并提示不静默] AND [解密失败置 connect_failed 提示重新输入] AND [并发上限 4 不突破] AND [单个失败不阻塞其他] AND [应用立即可交互] AND [覆盖 REQ-RC-01~06, DFX-PC-02/05]

### 6.3 TASK-PC-06-03 手动离线解除固定集成测试
- [ ] 新建 `test/persistentConnection/integration/manualOffline.test.ts`，覆盖端到端流程：工作台已连接卡片 → 用户点击"离线"按钮 → disconnectAndUnpin 编排 → disconnect + markPinned(false) → 卡片切换为离线态或移除 → `pad2.profiles.v1` 含 `pinned: false`；覆盖：① 重启后不再由 pinned 触发重连（autoConnect=true 仍可触发，REQ-CO-02）；② 物理断开失败不阻塞本地状态清理（DFX-PC-04）；③ 卡片切换在 300ms 内完成（DFX-PC-03）；④ 再次连接成功恢复 pinned=true（REQ-PN-05）
- **涉及文件**：`test/persistentConnection/integration/manualOffline.test.ts`（新建）
- **依赖**：TASK-PC-05-04, TASK-PC-04-02
- **验收标准**：[点击离线后 `pad2.profiles.v1` 含 `pinned: false`] AND [重启后不再由 pinned 触发重连] AND [autoConnect=true 仍可触发重连（REQ-CO-02）] AND [物理断开失败时本地状态清理仍执行] AND [卡片 300ms 内切换] AND [再次连接成功恢复 pinned=true] AND [覆盖 REQ-PN-04/05, DFX-PC-03/04, REQ-CO-02]

### 6.4 TASK-PC-06-04 删除 profile 同步解除固定集成测试
- [ ] 新建 `test/persistentConnection/integration/deleteProfileUnpin.test.ts`，覆盖端到端流程：pinned=true profile → 用户删除 profile → `smbProfilesStore.remove` 过滤数组 → pinned 随 profile 一并移除无残留 → 冷启动无该 profile 可重连；验证 `pad2.profiles.v1` 中该 profile 完全移除（含 pinned 字段）
- **涉及文件**：`test/persistentConnection/integration/deleteProfileUnpin.test.ts`（新建）
- **依赖**：TASK-PC-01-03
- **验收标准**：[删除 pinned=true profile 后 `pad2.profiles.v1` 中该 profile 完全移除] AND [冷启动无该 profile 可重连] AND [无 pinned 残留] AND [覆盖 REQ-PN-06]

### 6.5 TASK-PC-06-05 既有 autoConnect 行为回归集成测试
- [ ] 新建 `test/persistentConnection/integration/autoConnectRegression.test.ts`，覆盖：① 既有 autoConnect=true profile（无 pinned 字段）升级后冷启动仍自动重连（DFX-PC-12）；② autoConnect=true 且 pinned=true 同时为 true 时冷启动只 connect 一次（幂等）；③ 手动离线仅解除 pinned 不改变 autoConnect（REQ-CO-02）；④ 连接成功标记 pinned 不改变 autoConnect（REQ-CO-03）；⑤ ConnectionFormPanel autoConnect UI 零变更验证
- **涉及文件**：`test/persistentConnection/integration/autoConnectRegression.test.ts`（新建）
- **依赖**：TASK-PC-05-05, TASK-PC-06-03
- **验收标准**：[既有 autoConnect=true 行为保留] AND [pinned 与 autoConnect 同时为 true 幂等] AND [手动离线不改 autoConnect] AND [连接成功不改 autoConnect] AND [ConnectionFormPanel 零变更] AND [覆盖 REQ-CO-01~04, DFX-PC-12]

---

## 7. 硬约束与 DFX 约束验证

**依赖关系**：依赖任务组 6
**对应需求**：HC-01~06, DFX-PC-01~12

### 7.1 TASK-PC-07-01 硬约束 HC-01~06 验证
- [ ] 新建 `test/persistentConnection/compliance/hardConstraints.test.ts`，覆盖：① HC-01 `package.json` 零新增依赖（diff 验证）；② HC-02 冻结区文件零变更（`src/adapter/smb/SmbPlugin.ts` / `src/core/**` / `android/**` git diff 验证）；③ HC-03 `src/main.tsx` 零变更（git diff 验证）；④ HC-04 UI 层（`MultiSmbCards.tsx`）未直接 import `SmbPlugin`（grep 验证）；⑤ HC-05 既有 `pad2.profiles.v1`/`pad2.prefs.v1` 旧数据加载兼容（无 pinned 字段视为 false）；⑥ HC-06 只读模式下 pinned 标记/解除逻辑不影响只读约束
- **涉及文件**：`test/persistentConnection/compliance/hardConstraints.test.ts`（新建）
- **依赖**：TASK-PC-06-05
- **验收标准**：[6 个硬约束验证全部 PASS] AND [package.json 零新增依赖] AND [冻结区文件零变更] AND [main.tsx 零变更] AND [UI 层零 SmbPlugin import] AND [既有持久化兼容] AND [只读模式兼容]

### 7.2 TASK-PC-07-02 DFX 约束 DFX-PC-01~12 验证
- [ ] 新建 `test/persistentConnection/compliance/dfxConstraints.test.ts`，覆盖：① DFX-PC-01 持久化不阻塞连接（< 200ms）；② DFX-PC-02 冷启动恢复不阻塞启动；③ DFX-PC-03 离线按钮响应（< 300ms）；④ DFX-PC-04 持久化失败/读取损坏安全降级；⑤ DFX-PC-05 单个失败不阻塞其他；⑥ DFX-PC-06 固定状态与连接事实一致；⑦ DFX-PC-07 不泄露凭据；⑧ DFX-PC-08 未记住密码提示；⑨ DFX-PC-09 固定状态可观测；⑩ DFX-PC-10 变更可追溯；⑪ DFX-PC-11 既有 profile 兼容；⑫ DFX-PC-12 既有 autoConnect 兼容
- **涉及文件**：`test/persistentConnection/compliance/dfxConstraints.test.ts`（新建）
- **依赖**：TASK-PC-06-05
- **验收标准**：[12 个 DFX 约束验证全部 PASS] AND [性能指标满足（< 200ms / < 300ms）] AND [可靠性降级验证通过] AND [安全性不泄露凭据验证通过] AND [兼容性验证通过]

### 7.3 TASK-PC-07-03 既有 173 个测试回归验证
- [ ] 运行既有 `test/` 目录全部测试（`node --test --import tsx test/**/*.test.ts` 或既有 npm script），确认本特性变更未破坏既有 173 个测试；记录测试结果到 `test/persistentConnection/compliance/regression-result.json`（含 total/pass/fail/skipped 与失败清单）
- **涉及文件**：`test/persistentConnection/compliance/regression-result.json`（新建，测试结果输出）
- **依赖**：TASK-PC-07-01, TASK-PC-07-02
- **验收标准**：[既有 173 个测试全部 PASS] AND [无既有测试因本特性变更而 FAIL] AND [regression-result.json 记录完整测试结果] AND [既有 conn_persist_recent_ui / multi_conn_writeback / browse_view_modes 功能回归通过]

---

## 8. 远程构建与同步

**依赖关系**：依赖任务组 7
**对应需求**：远程构建服务器 192.168.2.3 同步要求

### 8.1 TASK-PC-08-01 同步 src/ 变更到远程构建服务器
- [ ] 将本特性 `src/` 下 TypeScript 变更同步到远程构建服务器 192.168.2.3，同步范围：`src/state/smbProfilesStore.ts`（扩展）、`src/orchestration/boot/pinnedSync.ts`（新增）、`src/orchestration/boot/disconnectAndUnpin.ts`（新增）、`src/orchestration/boot/autoReconnect.ts`（扩展）、`src/ui/pages/HomePage/StorageOverviewRow/MultiSmbCards.tsx`（扩展）；`android/` 目录零变更（HC-02）无需同步，但按既有流程执行全量同步以保持一致性
- **涉及文件**：远程同步（`src/` 变更 + `android/` 全量同步）
- **依赖**：TASK-PC-07-03
- **验收标准**：[src/ 变更文件全部同步到 192.168.2.3] AND [android/ 目录全量同步完成] AND [同步后远程文件与本地一致（校验和/大小验证）]

### 8.2 TASK-PC-08-02 远程构建验证
- [ ] 在远程构建服务器 192.168.2.3 执行既有构建流程（`npm run build` 或既有 Android 构建命令），确认本特性变更构建通过；记录构建结果（PASS/FAIL + 构建日志关键摘要）
- **涉及文件**：远程构建（192.168.2.3）
- **依赖**：TASK-PC-08-01
- **验收标准**：[远程构建 PASS] AND [TypeScript 编译无错误] AND [Android APK 构建无错误（若涉及）] AND [构建产物可正常打包]

---

## 9. 代码审查与最终验证

**依赖关系**：依赖任务组 8
**对应需求**：交付质量保证

### 9.1 TASK-PC-09-01 关键代码 Review
- [ ] 对本特性所有变更文件进行代码 Review，重点审查：① `smbProfilesStore.ts` 的 `markPinned` 实现是否触碰 autoConnect/passwordEncrypted（REQ-CO-02/03, DFX-PC-07）；② `pinnedSync.ts` 的订阅回调是否异步不阻塞（DFX-PC-01）且幂等（D-PC-06）；③ `disconnectAndUnpin.ts` 的物理断开失败处理是否正确降级（DFX-PC-04）；④ `autoReconnect.ts` 的并集筛选是否保留既有 autoConnect 行为（DFX-PC-12）；⑤ `MultiSmbCards.tsx` 是否经 orchestration 中转未直接 import SmbPlugin（HC-04）；⑥ sanitize 白名单解析是否仿照 autoConnect 模式（DFX-PC-11）
- **涉及文件**：本特性全部变更文件
- **依赖**：TASK-PC-08-02
- **验收标准**：[6 个 Review 重点全部通过] AND [Review 意见记录并归档] AND [未通过项有跟进措施]

### 9.2 TASK-PC-09-02 设计与实现一致性核对
- [ ] 对照 design.md 的接口清单（2.2.2.1~2.2.2.6）与实现代码，逐项核对：① `SmbProfile.pinned` 字段签名与注释；② `smbProfilesStore.markPinned` 签名与异常映射；③ `startPinnedSync` 签名与返回 unsubscribe；④ `disconnectAndUnpin` 签名与异常映射；⑤ `orchestrateAutoReconnect` 筛选条件扩展；⑥ `SmbStateCard.onOffline` props 与渲染；⑦ 需求追溯矩阵（design.md 第 6 节）每条需求均有对应实现落点
- **涉及文件**：design.md + 本特性全部变更文件
- **依赖**：TASK-PC-09-01
- **验收标准**：[7 个接口清单项全部与实现一致] AND [需求追溯矩阵 15 条需求全部有实现落点] AND [设计与实现无偏差或偏差已记录说明]

### 9.3 TASK-PC-09-03 变更范围最终确认
- [ ] 执行 `git diff --stat` 与 `git status` 确认本特性最终变更范围，验证：① 变更文件清单与 design.md 第 5 节"远程构建与同步"一致；② 冻结区文件（`src/adapter/smb/SmbPlugin.ts` / `src/core/**` / `android/**`）零变更（HC-02）；③ `main.tsx` 零变更（HC-03）；④ `package.json`/`package-lock.json` 零变更（HC-01）；⑤ 新增文件清单（`pinnedSync.ts` / `disconnectAndUnpin.ts` / 测试文件）完整；记录变更范围摘要到 `docs/specs/persistent_connection/change-summary.md`
- **涉及文件**：`docs/specs/persistent_connection/change-summary.md`（新建，变更范围摘要）
- **依赖**：TASK-PC-09-02
- **验收标准**：[变更范围与 design.md 一致] AND [冻结区零变更] AND [main.tsx 零变更] AND [package.json 零变更] AND [新增文件清单完整] AND [change-summary.md 记录归档]

---

## 任务依赖关系图

```
任务组 1（数据模型与持久化层扩展）
  ├── TASK-PC-01-01 (SmbProfile.pinned 字段)
  ├── TASK-PC-01-02 (sanitize 白名单) ← 01-01
  └── TASK-PC-01-03 (markPinned API) ← 01-01, 01-02

任务组 2（Orchestration 固定状态管理）← 任务组 1
  ├── TASK-PC-02-01 (pinnedSync 订阅) ← 01-03
  └── TASK-PC-02-02 (disconnectAndUnpin) ← 01-03

任务组 3（冷启动重连并集筛选）← 任务组 1, 2
  ├── TASK-PC-03-01 (并集筛选扩展) ← 01-02
  └── TASK-PC-03-02 (initBootProfiles 启动订阅) ← 02-01

任务组 4（工作台离线按钮 UI）← 任务组 2
  ├── TASK-PC-04-01 (SmbStateCard 离线按钮)
  └── TASK-PC-04-02 (MultiSmbCards 接线) ← 02-02, 04-01

任务组 5（单元测试）← 任务组 1-4
  ├── TASK-PC-05-01 (sanitize 测试) ← 01-02
  ├── TASK-PC-05-02 (markPinned 测试) ← 01-03
  ├── TASK-PC-05-03 (pinnedSync 测试) ← 02-01, 05-02
  ├── TASK-PC-05-04 (disconnectAndUnpin 测试) ← 02-02, 05-02
  └── TASK-PC-05-05 (并集筛选测试) ← 03-01

任务组 6（集成测试）← 任务组 5
  ├── TASK-PC-06-01 (连接成功标记固定) ← 05-03, 04-02
  ├── TASK-PC-06-02 (冷启动固定恢复) ← 05-05, 03-02
  ├── TASK-PC-06-03 (手动离线解除固定) ← 05-04, 04-02
  ├── TASK-PC-06-04 (删除 profile 解除固定) ← 01-03
  └── TASK-PC-06-05 (autoConnect 回归) ← 05-05, 06-03

任务组 7（硬约束与 DFX 验证）← 任务组 6
  ├── TASK-PC-07-01 (HC-01~06 验证) ← 06-05
  ├── TASK-PC-07-02 (DFX-PC-01~12 验证) ← 06-05
  └── TASK-PC-07-03 (既有 173 测试回归) ← 07-01, 07-02

任务组 8（远程构建与同步）← 任务组 7
  ├── TASK-PC-08-01 (同步到 192.168.2.3) ← 07-03
  └── TASK-PC-08-02 (远程构建验证) ← 08-01

任务组 9（代码审查与最终验证）← 任务组 8
  ├── TASK-PC-09-01 (关键代码 Review) ← 08-02
  ├── TASK-PC-09-02 (设计与实现一致性核对) ← 09-01
  └── TASK-PC-09-03 (变更范围最终确认) ← 09-02
```

---

## 需求覆盖矩阵

| 需求编号 | 覆盖任务 |
|---------|---------|
| REQ-PN-01 连接成功即标记固定 | TASK-PC-02-01, 05-03, 06-01 |
| REQ-PN-02 工作台持久呈现 | TASK-PC-04-02, 06-01, 06-02 |
| REQ-PN-03 工作台离线按钮 | TASK-PC-04-01, 04-02, 06-01 |
| REQ-PN-04 仅手动离线才解除 | TASK-PC-02-02, 05-04, 06-03 |
| REQ-PN-05 再次连接恢复固定 | TASK-PC-02-01, 06-03 |
| REQ-PN-06 删除同步解除固定 | TASK-PC-06-04 |
| REQ-PN-07 固定状态跨会话保留 | TASK-PC-01-03, 05-02, 06-01 |
| REQ-RC-01 冷启动恢复已固定 | TASK-PC-03-01, 05-05, 06-02 |
| REQ-RC-02 仅凭据可用重连 | TASK-PC-05-05, 06-02 |
| REQ-RC-03 恢复不阻塞启动 | TASK-PC-03-02, 06-02 |
| REQ-RC-04 恢复并发上限保护 | TASK-PC-06-02 |
| REQ-RC-05 恢复失败如实告知 | TASK-PC-06-02 |
| REQ-RC-06 失败后可手动重试 | TASK-PC-06-02 |
| REQ-CO-01 pinned ∪ autoConnect 决定重连 | TASK-PC-03-01, 05-05, 06-05 |
| REQ-CO-02 手动离线不改 autoConnect | TASK-PC-01-03, 02-02, 05-04, 06-03, 06-05 |
| REQ-CO-03 连接成功不改 autoConnect | TASK-PC-01-03, 05-02, 06-05 |
| REQ-CO-04 禁止项 | TASK-PC-05-05, 06-05 |

| DFX/HC 约束 | 覆盖任务 |
|------------|---------|
| HC-01 零新增 npm 依赖 | TASK-PC-07-01, 09-03 |
| HC-02 冻结区零变更 | TASK-PC-07-01, 09-03 |
| HC-03 main.tsx 改动限 3 行内 | TASK-PC-03-02, 07-01, 09-03 |
| HC-04 store 分级 | TASK-PC-04-02, 07-01, 09-01 |
| HC-05 既有持久化兼容 | TASK-PC-01-02, 07-01 |
| HC-06 只读模式兼容 | TASK-PC-07-01 |
| DFX-PC-01~12 | TASK-PC-07-02（集中验证）+ 各任务内嵌验收 |

---

> 本编码任务规划文档基于 PAD2-SPEC-PC-001 规格与 PAD2-DESIGN-PC-001 设计生成，将"已连接 SMB 共享工作台持久固定与仅手动离线断开"需求转化为 9 个任务组、25 个可执行任务。任务按依赖关系排序（数据模型 → orchestration → 冷启动 → UI → 单元测试 → 集成测试 → 硬约束验证 → 远程构建 → 代码审查），覆盖 design.md 全部变更点与 spec.md 全部需求（REQ-PN-01~08, REQ-RC-01~07, REQ-CO-01~04, DFX-PC-01~12, HC-01~06）。冻结区（SmbPlugin/core/android）零变更，main.tsx 零变更，UI 层经 orchestration 中转保持 store 分级。下一步由编码执行 Agent 按任务依赖顺序逐项实施。
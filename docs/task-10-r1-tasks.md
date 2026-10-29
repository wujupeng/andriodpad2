# TASK-10-R1 编码任务清单：写回链路证据补齐与冲突覆盖安全修复

**任务编号**：TASK-10-R1
**日期**：2026-10-29
**文档类型**：tasks.md（编码任务清单）
**基线提交**：`4493314b`（TASK-10 完成提交）
**上游文档**：
- 需求规格：`.codeartsdoer/specs/task_10_r1/spec.md`（467 行，3 个问题 + 10 项约束 + 验收标准汇总）
- 实现方案：`.codeartsdoer/specs/task_10_r1/design.md`（777 行，9 章节 + 6 张 PlantUML 图 + 模块变更清单 M-1~M-5 + 7 项风险）

**与 TASK-10 关系**：不推翻 TASK-10 任何已通过验收的结论，仅对 PM 复核发现的三个证据缺口与一处安全风险做最小补齐。

---

## 任务总览

| 任务编号 | 任务名称 | 类型 | 前置依赖 | 覆盖验收 | 涉及模块 |
|---------|---------|------|---------|---------|---------|
| TASK-10-R1-T1-SEAM | 建立 SMB 方法依赖注入接缝 | 基础设施 | 无 | AC-1.5, AC-3.1, AC-3.5 | M-1 |
| TASK-10-R1-T2-CONFLICT-FIX | 修复冲突覆盖路径远端状态复查 | 安全修复 | T1 | AC-3.1, AC-3.5 | M-1 |
| TASK-10-R1-T3-SEMANTIC | 精确标记保存事件触发语义 | 注释/文档 | 无 | AC-2.1~2.5 | M-1, M-2 |
| TASK-10-R1-T4-INTEGRATION-TEST | 编写真实 store action 集成测试 | 测试新增 | T1, T2 | AC-1.1~1.5, AC-3.2~3.4 | M-3 |
| TASK-10-R1-T5-FIX-EXISTING-TEST | 修正固化错误行为的存量测试 | 测试修正 | T1, T2 | AC-3.1, AC-3.5 | M-4 |
| TASK-10-R1-T6-STATIC-CHECK | 执行三项静态检查 | 验证 | T1~T5 | AC-G.1~G.3 | — |
| TASK-10-R1-T7-FULL-TEST | 执行全量测试 | 验证 | T1~T5 | AC-G.4 | — |
| TASK-10-R1-T8-CONSTRAINT-GATE | 核验约束与冻结区零变更 | 门禁 | T1~T7 | AC-G.5~G.8, C-1~C-10 | — |
| TASK-10-R1-T9-VERIFICATION-REPORT | 产出 TASK-10-R1 验收报告 | 交付 | T1~T8 | 全部 | M-5 |

**执行顺序**：T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9

> T2（冲突修复）与 T3（语义标记）逻辑上相互独立可并行，但二者均修改 `editSessionStore.ts`，建议串行执行以避免合并冲突。

**模块变更清单对照**（来自 design.md 第三章）：

| 模块 | 文件路径 | 变更类型 | 对应任务 |
|------|---------|---------|---------|
| M-1 | `src/state/editSessionStore.ts` | 修改（接缝 + 修复 + 注释） | T1, T2, T3 |
| M-2 | `src/ui/hooks/useEditSessionMonitor.ts` | 修改（仅注释） | T3 |
| M-3 | `test/editSession-real-store-integration.test.ts` | 新增 | T4 |
| M-4 | `test/editSession-integration.test.ts` | 修改（第 206-222 行） | T5 |
| M-5 | `docs/task-10-r1-verification-report.md` | 新增 | T9 |

---

## 1. 建立 SMB 方法依赖注入接缝

**目标**：在 `editSessionStore.ts` 内新增 test-only SMB 方法依赖注入接缝，统一三条写回路径获取 `writeback`/`checkRemoteChanged` 的入口，使集成测试可注入可控 mock 而不触碰真实 `SmbPlugin`。此为问题 1（集成测试）与问题 3（冲突修复）的共同前置基础设施。

**对应 design.md**：§2.2.2.1（`__setSmbMethodDepsForTest`）、§2.2.2.2（`getSmbMethods`）、§2.3.2（数据模型）

### 1.1 新增 SmbMethodDeps 接口与模块级变量
- [ ] 在 `src/state/editSessionStore.ts` 顶部 import 区之后新增 `SmbMethodDeps` 接口，声明 `writeback: () => Promise<WritebackResult>` 与 `checkRemoteChanged: () => Promise<RemoteChangeResult>` 两个方法字段
- [ ] 新增模块级私有变量 `_smbMethodDeps: SmbMethodDeps | null`，初始值为 `null`（生产默认走 SmbPlugin）
- [ ] 验收：`npx tsc --noEmit` 零错误；`_smbMethodDeps` 不被 export，仅模块内部可见

### 1.2 实现 getSmbMethods 私有获取函数
- [ ] 在 `src/state/editSessionStore.ts` 新增模块私有函数 `getSmbMethods(): SmbMethodDeps`，逻辑为：`_smbMethodDeps` 非 null 时返回注入的 deps，否则返回 `{ writeback: () => SmbPlugin.writeback(), checkRemoteChanged: () => SmbPlugin.checkRemoteChanged() }`
- [ ] 验收：函数不 export；返回值非 null；生产环境（`_smbMethodDeps=null`）返回值等价于现有第 189/367 行的硬编码 SmbPlugin 调用

### 1.3 实现 __setSmbMethodDepsForTest 导出接缝函数
- [ ] 在 `src/state/editSessionStore.ts` 新增导出函数 `__setSmbMethodDepsForTest(deps: SmbMethodDeps | null): void`，赋值 `_smbMethodDeps = deps`
- [ ] 添加 JSDoc 注释 `@internal 仅供测试注入 SMB 方法依赖，生产代码禁止调用`
- [ ] 验收：函数以 `__` 前缀命名标记 internal；生产代码全库无调用（仅测试文件调用）；传 `null` 恢复生产默认

### 1.4 三路径改用 getSmbMethods() 统一获取 SMB 方法
- [ ] 将 `src/state/editSessionStore.ts:189`（applyForegroundCheckResult 自动触发路径）的 `{ writeback: () => SmbPlugin.writeback(), checkRemoteChanged: () => SmbPlugin.checkRemoteChanged() }` 改为 `getSmbMethods()`
- [ ] 将 `src/state/editSessionStore.ts:367`（manualStep('writeback') 路径）的同形硬编码改为 `getSmbMethods()`
- [ ] 验收：三路径（自动触发/manualStep，暂不含 OVERWRITE_CONFIRMED——由 T2 修复）均经 `getSmbMethods()` 单一入口获取 SMB 方法；`git diff` 确认无残留硬编码 `() => SmbPlugin.writeback()` 在 deps 注入位置

---

## 2. 修复冲突覆盖路径远端状态复查

**目标**：修复 `resolveConflict('OVERWRITE_CONFIRMED')` 中第 308 行固定 `remoteChanged: false` 的安全风险，改为经 `getSmbMethods().checkRemoteChanged` 执行真实远端状态复查，统一三条写回路径的冲突检测行为。此为问题 3 核心修复，是数据安全红线。

**对应 design.md**：§2.2.2.3（resolveConflict 修改后行为）、§2.1.3.2（状态机）、§4.3（数据流）

**前置依赖**：TASK-10-R1-T1-SEAM（复用 `getSmbMethods()` 接缝）

### 2.1 修复 resolveConflict OVERWRITE_CONFIRMED 固定无冲突返回
- [ ] 将 `src/state/editSessionStore.ts:307-308`（OVERWRITE_CONFIRMED 分支）中 `writeback: () => SmbPlugin.writeback()` 与 `checkRemoteChanged: async () => ({ remoteMtime: 0, baselineMtime: 0, remoteChanged: false })` 改为统一经 `getSmbMethods()` 获取，即 `const smb = getSmbMethods();` 后使用 `smb.writeback` 与 `smb.checkRemoteChanged`
- [ ] 验收（AC-3.1）：`grep -n "remoteChanged: false\|remoteChanged:false" src/state/editSessionStore.ts` 零匹配，确认固定无冲突返回已消除
- [ ] 验收（AC-3.5）：三路径（第 189/308/367 行）均经 `getSmbMethods()`，冲突检测行为一致

### 2.2 确认远端已变化时的状态流转
- [ ] 审查 `writebackExecutor.ts` 中 `checkRemoteChanged` 返回 `remoteChanged=true` 时的处理逻辑，确认执行器返回 `{ success: false, error: { category: 'conflict' } }` 且不调用 `writeback`
- [ ] 审查 `writebackResultMapper.ts` 中 conflict 映射，确认状态转为 `conflict` 并更新 `conflictInfo`
- [ ] 验收：OVERWRITE_CONFIRMED 路径在 `remoteChanged=true` 时不调用 writeback、状态为 `conflict`、提示"远端文件已再次修改，请重新确认"（由 T4-S6 测试覆盖）

---

## 3. 精确标记保存事件触发语义

**目标**：将代码注释与文档中不精确的"WPS 保存时自动触发"表述统一修正为"前台检测后触发（appStateChange + foregroundCheck）"，消除文档与代码行为的语义偏差。此为问题 2，零逻辑变更。

**对应 design.md**：§2.1.3.3（触发链路证明）、§5.2（保持有效）

### 3.1 修正 editSessionStore.ts 自动触发相关注释
- [ ] 审查 `src/state/editSessionStore.ts` 中 `applyForegroundCheckResult`（第 165-206 行）、`openFile` 内 appStateChange 监听（第 147-158 行）、`manualStep`/轮询相关注释，将所有"WPS 保存时自动触发"/"保存时自动触发"等不精确表述改为"前台检测后触发（appStateChange + foregroundCheck 检测到 changed）"
- [ ] 验收（AC-2.2）：`grep -rn "保存时自动触发\|保存时立即触发" src/state/editSessionStore.ts` 零匹配；含"自动触发"的注释均标注"前台检测后"或"appStateChange + foregroundCheck"前提

### 3.2 修正 useEditSessionMonitor.ts 注释
- [ ] 审查 `src/ui/hooks/useEditSessionMonitor.ts` 第 52-62 行 appStateChange 监听链路注释，明确标注"前台检测后触发：应用回到前台时经 SmbPlugin.foregroundCheck() 拉取 FileObserver 缓存的保存事件结果"
- [ ] 验收（AC-2.1）：注释明确触发点为 `App.addListener('appStateChange', ...)` 内 `isActive=true` 时的 `foregroundCheck()` 调用，非保存时即时触发
- [ ] 验收（AC-2.3）：注释说明 `isActive=false`（后台）时直接 return，不触发写回

### 3.3 记录完整触发链路证明
- [ ] 在验收报告（T9 产出）或设计文档中记录完整链路：`FileObserver(Java) → WpsSaveDetector.foregroundCheck() → SmbPlugin.foregroundCheck()(TS) → useEditSessionMonitor appStateChange 监听 → applyForegroundCheckResult`，证明无"WPS 保存时即时触发"分支
- [ ] 验收（AC-2.5）：链路图展示完整调用链，标注"应用在后台时不触发"与"前台返回时经 foregroundCheck 检测后触发"两个关键节点

---

## 4. 编写真实 store action 集成测试

**目标**：新增 `test/editSession-real-store-integration.test.ts`，直接调用真实 `useEditSessionStore` 实例的 `applyForegroundCheckResult`/`resolveConflict` action，通过 `__setSmbMethodDepsForTest` 注入可控 SMB mock，断言真实状态机迁移与执行器调用关系。此为问题 1 核心证据，并覆盖问题 3 的测试验收。

**对应 design.md**：§2.1.3.1（集成测试流程）、§4.2（数据流）、§7.1/§7.3（验收映射）

**前置依赖**：TASK-10-R1-T1-SEAM（接缝）、TASK-10-R1-T2-CONFLICT-FIX（修复后行为）

### 4.1 创建测试文件骨架与 mock 工厂
- [ ] 新增 `test/editSession-real-store-integration.test.ts`，使用 `node:test` 的 `describe`/`test`/`beforeEach`/`afterEach` 组织结构
- [ ] 实现 SMB mock 工厂：创建带调用计数器的 `writeback`/`checkRemoteChanged` mock，可配置返回 `remoteChanged` true/false 与 `writebackSuccess` true/false
- [ ] 在 `afterEach` 中执行 `__setSmbMethodDepsForTest(null)` 恢复接缝、`WRITE_ENABLED_SCOPE.enabled = false` 恢复权限开关（try/finally 兜底）
- [ ] 验收（AC-1.5）：测试不 import 真实 SmbPlugin 实现；所有 SMB 方法由 mock 提供；不发起真实 SMB 网络请求

### 4.2 许可路径：真实 action 触发执行器调用一次
- [ ] 编写测试用例：setup 注入 mock（`remoteChanged=false`、`writebackSuccess=true`）→ 临时翻转 `WRITE_ENABLED_SCOPE.enabled=true` → `store.setState({ state:'opened', baseline:{...} })` → 调用 `store.applyForegroundCheckResult({ changed:true })` → 轮询/微任务刷新等待最终态
- [ ] 断言：状态经真实状态机迁移至 `saving → writeback_pending → writeback_success → opened`；`mock.writebackCalls === 1`；`mock.checkRemoteCalls >= 1`
- [ ] 验收（AC-1.1）：直接调用真实 `store.applyForegroundCheckResult`，非 `simulateAutoTriggerFlow`
- [ ] 验收（AC-1.2）：权限许可 + changed=true → executeWriteback 调用恰好 1 次，最终 `opened`

### 4.3 权限拒绝路径：执行器不被调用
- [ ] 编写测试用例：setup 注入 mock → 保持 `WRITE_ENABLED_SCOPE.enabled=false` → `store.setState({ state:'opened', baseline:{...} })` → 调用 `store.applyForegroundCheckResult({ changed:true })`
- [ ] 断言：`mock.writebackCalls === 0`；`mock.checkRemoteCalls === 0`；状态为 `editing`；不经过 `saving`/`writeback_pending`
- [ ] 验收（AC-1.3）：权限拒绝 + changed=true → executeWriteback 调用 0 次，状态为 `editing`

### 4.4 状态机守卫：saving/writeback_pending 态重复调用被拦截
- [ ] 编写测试用例：setup 注入 mock → 翻转 enabled=true → 触发首次 `applyForegroundCheckResult({ changed:true })` 使状态进入 `saving`/`writeback_pending` → 再次调用 `applyForegroundCheckResult({ changed:true })`
- [ ] 断言：状态不重复迁移；`mock.writebackCalls` 不因第二次调用而增加（守卫第 167 行 `if (cur.state !== 'opened' && cur.state !== 'editing') return` 拦截）
- [ ] 验收（AC-1.4）：saving/writeback_pending 态重复调用被状态机守卫拦截，执行器不重复调用

### 4.5 依赖注入隔离：不发起真实 SMB 请求
- [ ] 编写测试用例：setup 注入 mock，mock 内部断言被调用时无网络请求标志 → 执行完整触发流程 → 验证 mock 计数器与网络请求标志
- [ ] 验收（AC-1.5）：集成测试运行期间不发起任何真实 SMB 网络请求；所有 SMB 方法由 mock 提供

### 4.6 远端已变化禁止覆盖测试（问题 3 测试证据）
- [ ] 编写测试用例：setup 注入 mock（`checkRemoteChanged` 返回 `remoteChanged=true`）→ 翻转 enabled=true → `store.setState({ state:'conflict', baseline:{...}, conflictInfo:{...} })` → 调用 `store.resolveConflict('OVERWRITE_CONFIRMED')` → 等待最终态
- [ ] 断言：`mock.writebackCalls === 0`；`mock.checkRemoteCalls >= 1`（真实复查被调用）；状态为 `conflict`
- [ ] 验收（AC-3.2）：OVERWRITE_CONFIRMED + remoteChanged=true → 不调用 writeback，状态为 conflict
- [ ] 验收（AC-3.4）：新增远端已变化禁止覆盖测试 PASS

### 4.7 远端未变化允许覆盖测试（问题 3 正向路径）
- [ ] 编写测试用例：setup 注入 mock（`checkRemoteChanged` 返回 `remoteChanged=false`、`writebackSuccess=true`）→ 翻转 enabled=true → `store.setState({ state:'conflict', baseline:{...}, conflictInfo:{...} })` → 调用 `store.resolveConflict('OVERWRITE_CONFIRMED')` → 等待最终态
- [ ] 断言：`mock.writebackCalls === 1`；`mock.checkRemoteCalls >= 1`；状态经 `writeback_pending → writeback_success → opened`
- [ ] 验收（AC-3.3）：OVERWRITE_CONFIRMED + remoteChanged=false → 调用 writeback，成功后 `writeback_success → opened`

---

## 5. 修正固化错误行为的存量测试

**目标**：修正 `test/editSession-integration.test.ts:206-222` 现有测试"OVERWRITE_CONFIRMED 路径 → 跳过冲突检测 → 直接写回"，该测试固化了问题 3 的错误行为（注入固定 `remoteChanged: false` 并断言 `checkRemoteCalls === 0`），须改为验证真实远端复查行为。

**对应 design.md**：§1.1.2（C-3 修正固化错误测试）、§六 R-04（风险缓解）

**前置依赖**：TASK-10-R1-T1-SEAM、TASK-10-R1-T2-CONFLICT-FIX

### 5.1 修正 OVERWRITE_CONFIRMED 跳过冲突检测的存量测试
- [ ] 修改 `test/editSession-integration.test.ts:206-222` 测试用例：将测试名从"OVERWRITE_CONFIRMED 路径 → 跳过冲突检测 → 直接写回"改为"OVERWRITE_CONFIRMED 路径 → 真实远端复查 → 远端未变化时写回"
- [ ] 将第 212 行 `checkRemoteChanged: async () => ({ remoteMtime: 0, baselineMtime: 0, remoteChanged: false })` 改为使用 mock adapter 的真实 `checkRemoteChanged`（即 `adapter.checkRemoteChanged`，返回 `remoteChanged=false`）
- [ ] 将第 221 行 `assert.equal(adapter.checkRemoteCalls, 0)` 改为 `assert.equal(adapter.checkRemoteCalls, 1)`（真实复查被调用一次）
- [ ] 验收：修正后测试 PASS；`grep -n "跳过冲突检测" test/editSession-integration.test.ts` 零匹配；测试验证真实复查行为而非固化跳过行为

### 5.2 新增远端已变化时拒绝覆盖的存量测试对应用例
- [ ] 在 `test/editSession-integration.test.ts` 同 describe 块内新增测试用例"OVERWRITE_CONFIRMED 路径 → 真实远端复查 → 远端已变化时拒绝覆盖"：注入 `checkRemoteChanged` 返回 `remoteChanged=true`，调用 `executeWriteback`，断言 `success === false`、`adapter.writebackCalls === 0`、`adapter.checkRemoteCalls === 1`、映射状态为 `conflict`
- [ ] 验收：新增用例 PASS；与 T4-S6 集成测试形成双层证据（单元层 + store 集成层）

---

## 6. 执行三项静态检查

**目标**：以三项静态检查替代 lint，确认类型安全与设计令牌合规。此为约束 C-7。

**对应 design.md**：§7.4（全局验收映射 AC-G.1~G.3）

**前置依赖**：T1~T5 全部代码与测试变更完成

### 6.1 TypeScript 类型检查
- [ ] 执行 `npx tsc --noEmit`，确认零错误
- [ ] 验收（AC-G.1）：输出无任何 TS 错误；接缝 `SmbMethodDeps` 接口类型严格

### 6.2 设计令牌检查
- [ ] 执行 `node scripts/check-design-tokens.mjs`，确认无硬编码色值、无 emoji
- [ ] 验收（AC-G.2）：脚本退出码 0；本任务不涉及 UI 样式变更，预期直接通过

### 6.3 对比度检查
- [ ] 执行 `node scripts/check-contrast.mjs`，确认 12 组合全部 ≥ 4.5:1（WCAG AA）
- [ ] 验收（AC-G.3）：脚本退出码 0；本任务不涉及 UI 样式变更，预期直接通过

---

## 7. 执行全量测试

**目标**：运行全量 `node:test` 测试套件（含新增集成测试与修正后的存量测试），确认全 PASS。

**对应 design.md**：§7.4（AC-G.4）

**前置依赖**：T1~T5 全部代码与测试变更完成

### 7.1 全量 node:test 执行
- [ ] 执行 `node --test`（或项目既定测试命令），运行全部测试文件
- [ ] 验收（AC-G.4）：全部测试 PASS，0 fail，0 skip；新增 `editSession-real-store-integration.test.ts` 全部用例 PASS；修正后的 `editSession-integration.test.ts` 全部用例 PASS；TASK-10 原有 34 项自动触发测试 + 26 项集成测试保持 PASS
- [ ] 验收：单次集成测试执行 < 2000ms（约束来自 spec.md §4.1）

---

## 8. 核验约束与冻结区零变更

**目标**：逐项核验 10 项约束（C-1~C-10）与冻结区零变更，确认未违反 PM 任何禁令。此为发布前门禁。

**对应 design.md**：§三冻结区核验表、§7.4（AC-G.5~G.8）

**前置依赖**：T1~T7 全部完成

### 8.1 冻结区零变更核验
- [ ] 执行 `git diff --stat src/adapter/smb/SmbPlugin.ts src/core/ android/app/src/main/java/com/pad2/filemanager/smb/`，确认零输出
- [ ] 验收（AC-G.5 / C-2）：冻结区三个路径全部零变更

### 8.2 WRITE_ENABLED_SCOPE 保持 false 核验
- [ ] 执行 `grep -n "enabled:" src/state/writePermission.ts`，确认仓库默认值为 `enabled: false as boolean`
- [ ] 验收（AC-G.6 / C-1）：`WRITE_ENABLED_SCOPE.enabled` 仓库默认值保持 false；集成测试仅在用例内临时翻转且 afterEach 恢复

### 8.3 main.tsx 改动行数核验
- [ ] 执行 `git diff src/main.tsx`，确认零变更（本任务不涉及入口改动）
- [ ] 验收（AC-G.7 / C-3）：改动 ≤ 3 行（实际为零变更）

### 8.4 package.json 零新增依赖核验
- [ ] 执行 `git diff package.json`，确认零输出
- [ ] 验收（AC-G.8 / C-4）：零新增 npm 依赖；测试使用 `node:test` 内置

### 8.5 store 分级与测试依赖核验
- [ ] 审查 `src/ui/hooks/useEditSessionMonitor.ts` import 语句，确认 UI 层不直接 import SmbPlugin/UpdatePlugin 用于写回（foregroundCheck/checkRemoteChanged 为检测调用，经 store action 中转写回）
- [ ] 审查 `test/editSession-real-store-integration.test.ts` import 语句，确认仅 import `node:test`、`editSessionStore`、`writePermission`，零新增测试依赖
- [ ] 验收（C-5 / C-8）：store 分级不变；单元测试用 node:test 零新增依赖

### 8.6 安全与行为声明核验
- [ ] 确认未修改生产服务器或凭据（C-9）：无服务器连接代码变更
- [ ] 确认验收报告不宣称"模拟 SMB 测试等于真实写回成功"（C-10）：报告明确区分模拟测试与真实写回
- [ ] 确认不重开设计评审、不推翻 TASK-10（C-6）：验收报告声明本任务为最小补齐

---

## 9. 产出 TASK-10-R1 验收报告

**目标**：产出 `docs/task-10-r1-verification-report.md`，统一使用"前台检测后触发"术语，记录三项修复证据，声明模拟测试与真实写回的边界。

**对应 design.md**：§八实现顺序第 7 步、§5.2（补齐内容）

**前置依赖**：T1~T8 全部完成并通过

### 9.1 编写验收报告
- [ ] 新增 `docs/task-10-r1-verification-report.md`，包含以下章节：
  - 问题 1 证据：真实 store action 集成测试用例清单与执行结果，附 `applyForegroundCheckResult` 真实调用证据
  - 问题 2 证据：触发链路图（FileObserver→WpsSaveDetector→SmbPlugin.foregroundCheck→appStateChange→applyForegroundCheckResult），注释修正前后对照
  - 问题 3 证据：`resolveConflict` 第 308 行修复前后代码对照，远端已变化禁止覆盖测试结果
  - 约束核验结果：C-1~C-10 逐项核验记录
  - 静态检查与全量测试结果
  - 术语统一声明：全文使用"前台检测后触发"
  - 边界声明：明确模拟 SMB 测试证明的是"真实 store action → 执行器调用关系"，非"真实 SMB 写回成功"（C-10）
- [ ] 验收：报告完整覆盖 AC-1.1~1.5、AC-2.1~2.5、AC-3.1~3.5、AC-G.1~G.8 全部验收标准；术语统一；边界声明清晰

---

## 约束与风险提示

### 约束清单（来自 spec.md §9，C-1~C-10）

| 约束编号 | 约束内容 | 核验任务 | 核验方法 |
|----------|----------|---------|---------|
| C-1 | `WRITE_ENABLED_SCOPE.enabled = false`（保持） | T8.2 | grep 确认 `enabled: false` |
| C-2 | 冻结区零变更（SmbPlugin.ts/core/android/smb） | T8.1 | `git diff --stat` 零输出 |
| C-3 | `src/main.tsx` 改动 ≤ 3 行 | T8.3 | `git diff` 行数统计 |
| C-4 | `package.json` 零新增依赖 | T8.4 | `git diff package.json` |
| C-5 | UI 层不直接 import SmbPlugin/UpdatePlugin | T8.5 | 代码审查 import 语句 |
| C-6 | 不重开设计评审，不推翻 TASK-10 | T8.6 | 验收报告声明 |
| C-7 | 三项静态检查替代 lint | T6 | tsc + design-tokens + contrast 全绿 |
| C-8 | 单元测试用 node:test，零新增依赖 | T8.5 | 测试文件 import 审查 |
| C-9 | 不修改生产服务器或凭据 | T8.6 | 无服务器连接代码 |
| C-10 | 不宣称模拟测试等于真实写回成功 | T8.6, T9 | 验收报告声明 |

### 风险清单（来自 design.md §六，R-01~R-07）

| 风险编号 | 风险描述 | 等级 | 缓解措施 | 责任任务 |
|---------|---------|------|---------|---------|
| R-01 | test-only 接缝 `__setSmbMethodDepsForTest` 被生产代码误调用 | 中 | `__` 前缀命名 + JSDoc 禁止标注 + 代码审查 + 接缝默认 null | T1.3, T8.5 |
| R-02 | 集成测试临时翻转 `WRITE_ENABLED_SCOPE.enabled=true` 若 teardown 失败导致全局状态泄漏 | 中 | 每用例 afterEach 恢复 + try/finally 兜底 + 独立测试文件隔离 | T4.1, T8.2 |
| R-03 | fire-and-forget IIFE 使测试无法 await 最终态 | 中 | 轮询/微任务刷新等待最终态 + mock 即时返回 + 单次 < 2000ms | T4.2 |
| R-04 | 修复 resolveConflict 后存量测试 `editSession-integration.test.ts:206-222` 固化行为失败 | 高 | T5 同步修正 + 修复与测试修正同提交 | T5 |
| R-05 | 真实远端复查引入 TOCTOU 竞态 | 低 | writeback 后 SHA-256 校验仍执行；依赖服务器端原子性；不在本任务范围 | T2.2 |
| R-06 | 接缝引入后三路径统一性被后续修改破坏 | 低 | 三路径均经 `getSmbMethods()` 单一入口 + 集成测试覆盖一致性 | T1.4, T4 |
| R-07 | `node:test` 在 Node.js v24 环境外的兼容性 | 低 | 约束明确 Node.js v24 内置 + 零新增依赖 + 现有测试已验证 | T7 |

### 关键风险应对优先级

1. **R-04（高）**：T2 修复与 T5 存量测试修正必须同提交，否则 CI 会因存量测试失败而阻塞。
2. **R-02（中）**：T4.1 的 afterEach 必须用 try/finally 包裹，确保即使断言失败也能恢复 `WRITE_ENABLED_SCOPE.enabled=false`，避免污染后续测试。
3. **R-03（中）**：T4.2~T4.7 的测试用例须使用轮询等待最终态（`await new Promise(r => setTimeout(r, 0))` 多次刷新微任务队列），不可直接同步读取状态。

---

## 全量验证命令

### 编码完成后逐项执行

```bash
# 1. TypeScript 类型检查（AC-G.1）
npx tsc --noEmit

# 2. 设计令牌检查（AC-G.2）
node scripts/check-design-tokens.mjs

# 3. 对比度检查（AC-G.3）
node scripts/check-contrast.mjs

# 4. 全量测试（AC-G.4）
node --test

# 5. 冻结区零变更核验（AC-G.5 / C-2）
git diff --stat src/adapter/smb/SmbPlugin.ts src/core/ android/app/src/main/java/com/pad2/filemanager/smb/

# 6. WRITE_ENABLED_SCOPE 保持 false（AC-G.6 / C-1）
grep -n "enabled:" src/state/writePermission.ts

# 7. main.tsx 改动行数（AC-G.7 / C-3）
git diff --stat src/main.tsx

# 8. package.json 零新增依赖（AC-G.8 / C-4）
git diff package.json

# 9. 问题 3 修复确认：固定 remoteChanged:false 已消除（AC-3.1）
grep -n "remoteChanged: false\|remoteChanged:false" src/state/editSessionStore.ts

# 10. 问题 2 语义确认：无"保存时自动触发"残留（AC-2.2）
grep -rn "保存时自动触发\|保存时立即触发" src/state/editSessionStore.ts src/ui/hooks/useEditSessionMonitor.ts
```

### 预期结果

| 命令 | 预期输出 |
|------|---------|
| `npx tsc --noEmit` | 零错误，退出码 0 |
| `node scripts/check-design-tokens.mjs` | 无硬编码色值，退出码 0 |
| `node scripts/check-contrast.mjs` | 12 组合 ≥ 4.5:1，退出码 0 |
| `node --test` | 全 PASS，0 fail，0 skip |
| `git diff --stat`（冻结区） | 零输出 |
| `grep "enabled:" writePermission.ts` | `enabled: false as boolean` |
| `git diff --stat src/main.tsx` | 零输出 |
| `git diff package.json` | 零输出 |
| `grep "remoteChanged: false" editSessionStore.ts` | 零匹配 |
| `grep "保存时自动触发"` | 零匹配 |

---

## 验收标准覆盖矩阵

| 验收编号 | 验收内容 | 覆盖任务 |
|---------|---------|---------|
| AC-1.1 | 集成测试直接调用真实 applyForegroundCheckResult | T4.2 |
| AC-1.2 | 权限许可 + changed=true → executeWriteback 调用 1 次 | T4.2 |
| AC-1.3 | 权限拒绝 + changed=true → executeWriteback 调用 0 次 | T4.3 |
| AC-1.4 | saving/writeback_pending 态重复调用被守卫拦截 | T4.4 |
| AC-1.5 | 集成测试通过依赖注入提供 mock | T4.1, T4.5 |
| AC-2.1 | appStateChange 触发点为前台返回时 foregroundCheck | T3.2 |
| AC-2.2 | "自动触发"描述须标注"前台检测后" | T3.1, T3.2 |
| AC-2.3 | 应用在后台 + WPS 保存 → 不触发写回 | T3.2 |
| AC-2.4 | 应用回到前台 + changed=true + permitted → 触发写回 | T4.2（同时证实） |
| AC-2.5 | 链路图记录完整调用链 | T3.3 |
| AC-3.1 | resolveConflict checkRemoteChanged 为真实复查 | T2.1, T5.1 |
| AC-3.2 | OVERWRITE_CONFIRMED + remoteChanged=true → 不覆盖 | T4.6 |
| AC-3.3 | OVERWRITE_CONFIRMED + remoteChanged=false → 覆盖 | T4.7 |
| AC-3.4 | 新增远端已变化禁止覆盖测试 | T4.6, T5.2 |
| AC-3.5 | 三路径 checkRemoteChanged 一致性 | T1.4, T2.1 |
| AC-G.1 | tsc --noEmit 零错误 | T6.1 |
| AC-G.2 | check-design-tokens 无硬编码色值 | T6.2 |
| AC-G.3 | check-contrast 12 组合 ≥ 4.5:1 | T6.3 |
| AC-G.4 | 全部测试全 PASS | T7.1 |
| AC-G.5 | 冻结区零变更 | T8.1 |
| AC-G.6 | WRITE_ENABLED_SCOPE.enabled 保持 false | T8.2 |
| AC-G.7 | src/main.tsx 改动 ≤ 3 行 | T8.3 |
| AC-G.8 | package.json 零新增依赖 | T8.4 |

**覆盖确认**：全部 21 项验收标准（AC-1.1~1.5、AC-2.1~2.5、AC-3.1~3.5、AC-G.1~G.8）均映射到具体任务，无遗漏。
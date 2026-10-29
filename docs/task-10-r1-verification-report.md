# TASK-10-R1 验收报告：写回链路证据补齐与冲突覆盖安全修复

**任务编号**：TASK-10-R1
**日期**：2026-10-29
**基线提交**：`4493314b`（TASK-10 完成提交）
**PM 指令来源**：TASK-10 PM 初步裁定后的三个复核发现

---

## 一、术语统一声明

全文使用 **"前台检测后触发"** 描述写回自动触发时机。不使用"WPS 保存时自动触发"或"保存时立即触发"等不精确表述。

**完整触发链路**：
```
FileObserver(Java,冻结区)
  → WpsSaveDetector.foregroundCheck()
  → SmbPlugin.foregroundCheck()(TS,冻结区)
  → useEditSessionMonitor: App.addListener('appStateChange', isActive=true)
  → store.applyForegroundCheckResult({ changed: true })
  → saving → writeback_pending → executeWriteback → writeback_success → opened
```

**关键节点**：
- 应用在后台时：`isActive=false` → 直接 return，不触发写回
- 应用回到前台时：经 `foregroundCheck` 检测后触发，非保存时即时触发

---

## 二、问题 1 证据：真实 store action 集成测试

### 修复内容

在 `editSessionStore.ts` 新增两个 test-only 依赖注入接缝：
- `__setSmbMethodDepsForTest(deps)` — 注入可控 SMB 方法（writeback/checkRemoteChanged/sleep/checkPermission）
- `__setPermissionCheckForTest(fn)` — 注入可控权限判定函数

生产默认走真实 `SmbPlugin` 和 `checkEditWritePermission`，零行为变更。

### 新增测试文件

`test/editSession-real-store-integration.test.ts` — 8 项测试，直接调用真实 `useEditSessionStore` action：

| 测试用例 | 验收标准 | 结果 |
|---------|---------|------|
| AC-1.1+1.2: 权限许可 + changed=true → 执行器调用 1 次 → opened | AC-1.1, AC-1.2 | PASS |
| AC-1.3: 权限拒绝 + changed=true → 执行器调用 0 次 → editing | AC-1.3 | PASS |
| AC-1.4: saving 态重复调用被状态机守卫拦截 | AC-1.4 | PASS |
| AC-1.5: 集成测试不发起真实 SMB 请求 | AC-1.5 | PASS |
| changed=false → 不触发写回 | — | PASS |
| AC-3.2: 远端已变化 → 不覆盖 → conflict | AC-3.2 | PASS |
| AC-3.3: 远端未变化 → 覆盖 → writeback_success → opened | AC-3.3 | PASS |
| 权限拒绝 → session_terminated | — | PASS |

### 与 TASK-10 测试的区别

TASK-10 的 `simulateAutoTriggerFlow` 自行推进状态流转，不调用真实 store action。
TASK-10-R1 的集成测试直接调用 `store.applyForegroundCheckResult()` 和 `store.resolveConflict()`，通过依赖注入控制 SMB 方法，断言真实状态机迁移与执行器调用关系。

---

## 三、问题 2 证据：触发语义精确标记

### 修复内容

零逻辑变更，仅修正注释：

**`editSessionStore.ts`**：
- `applyForegroundCheckResult` 上方新增注释："前台检测后触发：由 appStateChange + foregroundCheck/checkLocalFileChanged 检测到 changed 后调用。非 WPS 保存时即时触发——应用在后台时不触发，仅在前台返回时检测。"
- `openFile` appStateChange 监听内注释修正："前台检测后触发：应用回到前台时经 checkLocalFileChanged 检测本地变更，非 WPS 保存时即时触发。后台时不触发写回。"

**`useEditSessionMonitor.ts`**：
- 文件头注释修正："appStateChange：前台检测后触发——应用回到前台时经 foregroundCheck 检测变更，非 WPS 保存时即时触发"
- appStateChange 监听上方新增注释："前台检测后触发：应用回到前台时经 SmbPlugin.foregroundCheck() 拉取 FileObserver 缓存的保存事件结果。isActive=false（后台）时直接 return，不触发写回。"

### 验证

```
grep -rn "保存时自动触发\|保存时立即触发" src/state/editSessionStore.ts src/ui/hooks/useEditSessionMonitor.ts
→ 零匹配（PASS）
```

---

## 四、问题 3 证据：冲突覆盖路径远端状态复查

### 修复前（TASK-10 代码）

```typescript
// resolveConflict('OVERWRITE_CONFIRMED') — 第 307-308 行
{
  writeback: () => SmbPlugin.writeback(),
  checkRemoteChanged: async () => ({ remoteMtime: 0, baselineMtime: 0, remoteChanged: false }),
  // ↑ 固定无冲突返回，跳过真实远端复查
}
```

### 修复后

```typescript
// 统一经 getSmbMethods() 获取，三路径一致
const execResult = await executeWriteback(
  { remotePath: baseline.remotePath, ... },
  getSmbMethods(),  // ← 真实 checkRemoteChanged 复查
);
```

### 验证

```
grep -n "remoteChanged: false\|remoteChanged:false" src/state/editSessionStore.ts
→ 零匹配（PASS）
```

### 存量测试修正

`test/editSession-integration.test.ts` 第 206-222 行：
- **修正前**："OVERWRITE_CONFIRMED 路径 → 跳过冲突检测 → 直接写回"（固化错误行为，断言 `checkRemoteCalls === 0`）
- **修正后**："OVERWRITE_CONFIRMED 路径 → 真实远端复查 → 远端未变化时写回"（断言 `checkRemoteCalls === 1`）
- **新增**："OVERWRITE_CONFIRMED 路径 → 真实远端复查 → 远端已变化时拒绝覆盖"（断言 `writebackCalls === 0`、`checkRemoteCalls === 1`、状态为 `conflict`）

---

## 五、约束核验结果

| 约束 | 核验方法 | 结果 |
|------|---------|------|
| C-1: WRITE_ENABLED_SCOPE.enabled=false | `grep "enabled:" writePermission.ts` | `enabled: false as boolean` ✅ |
| C-2: 冻结区零变更 | `git diff --stat` (SmbPlugin.ts/core/android/smb) | 零输出 ✅ |
| C-3: main.tsx 改动 ≤ 3 行 | `git diff --stat src/main.tsx` | 零输出 ✅ |
| C-4: package.json 零新增依赖 | `git diff package.json` | 零输出 ✅ |
| C-5: store 分级不变 | 代码审查 import 语句 | UI 层不直接 import SmbPlugin 用于写回 ✅ |
| C-6: 不重开设计评审 | 本报告声明 | 最小补齐，不推翻 TASK-10 ✅ |
| C-7: 三项静态检查 | tsc + design-tokens + contrast | 全绿 ✅ |
| C-8: node:test 零新增依赖 | 测试文件 import 审查 | 仅 import node:test + 项目模块 ✅ |
| C-9: 不修改生产服务器 | 无服务器连接代码变更 | ✅ |
| C-10: 不宣称模拟=真实写回 | 本报告边界声明 | 见下方 ✅ |

---

## 六、静态检查与全量测试结果

| 检查项 | 命令 | 结果 |
|--------|------|------|
| TypeScript 类型检查 | `npx tsc --noEmit` | 零错误 ✅ |
| 设计令牌检查 | `node scripts/check-design-tokens.mjs` | 无硬编码色值 ✅ |
| 对比度检查 | `node scripts/check-contrast.mjs` | 12 组合 ≥ 4.5:1 ✅ |
| 全量测试 | `node --test` | **129/129 PASS, 0 fail, 0 skip** ✅ |

测试分布：
- writePermission: 24 项
- editSession: 19 项
- writebackExecutor: 17 项
- editSession-integration: 27 项（原 26 项 + , 1 项修正 + 1 项新增）
- editSession-auto-trigger: 34 项
- editSession-real-store-integration: 8 项（**新增**）

---

## 七、模块变更清单

| 文件 | 变更类型 | 变更内容 |
|------|---------|---------|
| `src/state/editSessionStore.ts` | 修改 | T1: SmbMethodDeps 接缝 + getSmbMethods + __setSmbMethodDepsForTest + __setPermissionCheckForTest + getPermCheck; T2: resolveConflict 改用 getSmbMethods(); T3: 注释修正; import 补 .ts 扩展名 |
| `src/ui/hooks/useEditSessionMonitor.ts` | 修改 | T3: 注释修正（零逻辑变更） |
| `test/editSession-real-store-integration.test.ts` | 新增 | T4: 8 项真实 store action 集成测试 |
| `test/editSession-integration.test.ts` | 修改 | T5: 修正固化测试 + 新增远端已变化拒绝覆盖测试 |

---

## 八、边界声明

**本任务证明的是**：
- 真实 `useEditSessionStore` action（`applyForegroundCheckResult`、`resolveConflict`）在依赖注入可控条件下，正确驱动状态机迁移和执行器调用
- `resolveConflict('OVERWRITE_CONFIRMED')` 执行真实远端复查，远端已变化时拒绝覆盖
- 触发链路为"前台检测后触发"，非"WPS 保存时即时触发"

**本任务不证明**：
- 真实 SMB 服务器写回成功（须 FRZ-EX 授权后真实服务器验收 R-01~R-12）
- 真实 WPS 保存事件被 FileObserver 正确捕获（冻结区，须真机验收）
- 生产环境端到端写回链路（须 `WRITE_ENABLED_SCOPE.enabled=true` + 专用账户 + 受限目录 + Samba 权限）

**与 TASK-10 关系**：不推翻 TASK-10 任何已通过验收的结论，仅对 PM 复核发现的三个证据缺口与一处安全风险做最小补齐。
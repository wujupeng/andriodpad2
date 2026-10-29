# TASK-06 验收报告

**任务**: editSessionStore 权限守卫集成
**日期**: 2026-10-29
**基线提交**: 3dde2a3fa297a32e0944e2bb333a4df0fecf4b4b
**PM 指令**: 将 isWriteEnabledForPath 接入 editSessionStore 所有编辑入口和状态转换

---

## 1. 交付物清单

### 1.1 新建文件

| 文件 | 行数 | 用途 |
|------|------|------|
| `src/state/editWritePermission.ts` | 52 | 纯函数权限守卫，不依赖 SmbPlugin/Capacitor |
| `test/editSession.test.ts` | 155 | 19 项单元测试（权限拒绝/路径边界/状态恢复） |

### 1.2 修改文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/state/editSessionStore.ts` | 集成 | 7 个写入口接入 checkEditWritePermission |
| `src/state/readOnlyMode.ts` | 导入修复 | `./writePermission` → `./writePermission.ts`（Node.js ESM 兼容） |

### 1.3 删除文件

| 文件 | 原因 |
|------|------|
| `src/state/sessionPermissionGuard.ts` | 未跟踪废弃存根，类型错误，已被 editWritePermission.ts 正确替代 |

---

## 2. 集成点清单（7 个写入口）

| 方法 | 入口类型 | 权限拒绝行为 | 守卫编号 |
|------|----------|-------------|----------|
| `applyForegroundCheckResult` (saveas_detected) | 被动监控 | 不转换状态（保持 opened） | R-ESS-03 |
| `applyForegroundCheckResult` (editing) | 被动监控 | 不进入 editing 态 | R-ESS-05 |
| `applyWritebackResult` | 主动写回 | → session_terminated + reason | R-ESS-02 |
| `applyRemoteCheckResult` | 被动监控 | 不进入 conflict 态 | R-ESS-05 |
| `applySaveAsDiscovery` | 主动发现 | → session_terminated + reason | R-ESS-03 |
| `resolveSaveAs` (OVERWRITE/WRITE_AS_NEW) | 主动写回 | → session_terminated + reason | **新增** |
| `resolveConflict` (OVERWRITE_CONFIRMED) | 主动写回 | → session_terminated + reason | R-ESS-04 |
| `manualStep` (writeback) | 主动写回 | → session_terminated + reason | R-ESS-02 |

**设计原则**:
- 被动监控（foreground check, remote check）→ 静默不转换写状态
- 主动写回（writeback, saveas, overwrite）→ 转入 session_terminated 并附 reason
- `resolveSaveAs` 此前无任何权限检查，本次**新增**守卫

---

## 3. checkEditWritePermission 函数签名

```typescript
export interface WritePermissionCheckResult {
  permitted: boolean;
  reason?: string;
}

export function checkEditWritePermission(
  remotePath: string | null,
  candidatePath?: string,
): WritePermissionCheckResult;
```

**三条件 AND（默认拒绝）**:
1. `remotePath` 非空（baseline 存在）
2. `isWriteEnabledForPath(pathToCheck)` — 全局开关 × 路径边界 × 账户权限
3. `candidatePath`（saveas 场景）优先于 `remotePath` 检查

**拒绝场景与 reason**:
- baseline 缺失 → "写回权限不足：未打开文件基线"
- READ_ONLY_MODE=true → READ_ONLY_NOTICES.writebackDisabledReason
- 路径不在可写目录 → "写回权限不足：该路径不在可写目录范围内"

---

## 4. 测试覆盖

### 4.1 新增测试（19 项）

| 分组 | 测试数 | 覆盖场景 |
|------|--------|----------|
| 未打开基线 | 3 | null/空字符串/candidatePath+null |
| AU-005 只读兼容 | 4 | 可写目录内/外/任意路径/reason 文案 |
| 路径边界校验 | 3 | 目录穿越/深层穿越/绝对路径逃逸 |
| candidatePath (saveas) | 4 | 可写目录内/穿越/逃逸/空字符串 |
| 默认拒绝原则 | 2 | enabled=false 全 denied/reason 非空 |
| 状态恢复语义 | 3 | 纯函数无副作用/幂等性/DISCARD 语义 |

### 4.2 全部测试结果

```
ℹ tests 43
ℹ suites 13
ℹ pass 43
ℹ fail 0
```

- 原有 24 项（writePermission.test.ts）: 全 PASS
- 新增 19 项（editSession.test.ts）: 全 PASS

---

## 5. 静态检查结果

| 检查项 | 命令 | 结果 |
|--------|------|------|
| TypeScript | `npx tsc --noEmit` | ✅ PASS（零错误） |
| 设计令牌 | `node scripts/check-design-tokens.mjs` | ✅ PASS（无硬编码色值/emoji） |
| 对比度 | `node scripts/check-contrast.mjs` | ✅ PASS（12 组合 ≥ 4.5:1 WCAG AA） |

---

## 6. 冻结区核验

| 冻结区 | 基线差异 | 状态 |
|--------|----------|------|
| `src/adapter/smb/SmbPlugin.ts` | 零变更 | ✅ |
| `src/core/` | 零变更 | ✅ |
| `android/app/src/main/java/com/pad2/filemanager/smb/` | 零变更 | ✅ |
| `src/main.tsx` | 零变更 | ✅ |
| `package.json` | 零新增依赖 | ✅ |

---

## 7. PM 禁令遵守

| 禁令 | 遵守状态 |
|------|----------|
| 不将 WRITE_ENABLED_SCOPE.enabled 提前设为 true | ✅ enabled=false 未变 |
| 不执行生产凭据轮换 | ✅ 未操作服务器 |
| 不实施未经授权的 ACTION_EDIT | ✅ edit 仍恒禁用 |
| 不以权限守卫接入完成宣称 WPS 写回已实现 | ✅ 本报告仅声明权限守卫集成完成 |
| 不提交或覆盖用户未授权代码变更 | ✅ 未执行 git commit |

---

## 8. 当前等价性验证

`WRITE_ENABLED_SCOPE.enabled = false` →
- `READ_ONLY_MODE = !enabled = true`
- `isWriteEnabledForPath(path) = false`（所有路径）
- `checkEditWritePermission() = { permitted: false }`（所有场景）
- 所有写入口被拦截 → **等价 AU-005 全只读行为**

---

## 9. 后续依赖

本任务完成权限守卫集成，但 **WPS 写回尚未实现**。后续任务依赖：
- TASK-07（useActionAvailability edit 判定）须 B-01 + B-05 授权
- TASK-08（写回执行器）须 B-01 + B-03 + B-04 授权
- 服务器侧 pad2_app 账户 + /mnt/share/writable/ + Samba write list 配置就绪后方可将 enabled 切换为 true
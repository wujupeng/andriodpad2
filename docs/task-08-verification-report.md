# TASK-08 验收报告：WPS 保存回写集成与验收准备

**日期**：2026-10-29
**基线提交**：`3dde2a3fa297a32e0944e2bb333a4df0fecf4b4b`
**PM 指令**：TASK-08 — WPS 保存回写集成与验收准备

---

## 1. 实际修改文件

### 新建文件
| 文件 | 用途 |
|------|------|
| `src/state/writebackResultMapper.ts` | 纯函数：WritebackExecutorResult → editSessionStore 状态映射 |
| `test/editSession-integration.test.ts` | 26 项集成测试（模拟 SMB 适配器） |
| `docs/task-08-verification-report.md` | 本报告 |

### 修改文件
| 文件 | 变更内容 |
|------|----------|
| `src/state/editSessionStore.ts` | `manualStep('writeback')` 和 `resolveConflict('OVERWRITE_CONFIRMED')` 改为经 `executeWriteback` 编排，替换直接 `SmbPlugin.writeback()` 调用 |

### 未修改文件（冻结区核验通过）
- `src/adapter/smb/SmbPlugin.ts` — 零变更
- `src/core/` — 零变更
- `android/app/src/main/java/com/pad2/filemanager/smb/` — 零变更
- `package.json` — 零新增依赖
- `src/main.tsx` — 零变更

---

## 2. 调用关系核查

### 接入前（TASK-07 完成时）
```
GlobalStatusRail → manualStep('writeback') → SmbPlugin.writeback() → applyWritebackResult()
resolveConflict('OVERWRITE_CONFIRMED') → SmbPlugin.writeback() → applyWritebackResult()
writebackExecutor.executeWriteback() — 已实现但未被任何 store 调用（孤儿）
```

**未连接环节**：
1. `writebackExecutor` 未被 `editSessionStore` 调用
2. 写回路径无冲突检测（`checkRemoteChanged`）
3. 写回路径无 SHA-256 校验（仅检查 `writebackSuccess`）
4. 写回路径无重试逻辑
5. 写回路径无错误分类（统一 `category: 'unknown'`）

### 接入后（TASK-08 完成）
```
GlobalStatusRail → manualStep('writeback')
  → checkEditWritePermission（store 层权限守卫）
  → executeWriteback（执行器编排）
    → checkPermission（执行器层权限守卫，防御纵深）
    → checkRemoteChanged（冲突检测）
    → writeback（含 SHA-256 校验）
    → 网络错误重试（指数退避，maxRetries=3）
  → mapWritebackExecutorResultToState（结果→状态映射）
  → transition（状态机转换）

resolveConflict('OVERWRITE_CONFIRMED')
  → checkEditWritePermission（store 层权限守卫）
  → executeWriteback（执行器编排，跳过冲突检测——用户已确认覆盖）
    → writeback（含 SHA-256 校验）
    → 网络错误重试
  → mapWritebackExecutorResultToState
  → transition
```

**已连接**：`writebackExecutor` → `editSessionStore` 两条写回路径全部接入。

---

## 3. 可复现命令

```bash
# TypeScript 类型检查
npx tsc --noEmit

# 全部测试（86 项 = 24 + 19 + 17 + 26）
node --test --experimental-strip-types \
  test/writePermission.test.ts \
  test/editSession.test.ts \
  test/writebackExecutor.test.ts \
  test/editSession-integration.test.ts

# 静态检查
node scripts/check-design-tokens.mjs
node scripts/check-contrast.mjs

# 冻结区核验
git diff --stat 3dde2a3fa297a32e0944e2bb333a4df0fecf4b4b \
  -- src/adapter/smb/SmbPlugin.ts src/core/ \
  android/app/src/main/java/com/pad2/filemanager/smb/ \
  package.json src/main.tsx
```

---

## 4. 测试结果

### 4.1 TypeScript 类型检查
```
npx tsc --noEmit → 通过（零错误）
```

### 4.2 单元 + 集成测试
```
tests 86 | pass 86 | fail 0 | duration 374ms
```

| 测试文件 | 测试数 | 状态 |
|----------|--------|------|
| `test/writePermission.test.ts` | 24 | ✅ 全通过 |
| `test/editSession.test.ts` | 19 | ✅ 全通过 |
| `test/writebackExecutor.test.ts` | 17 | ✅ 全通过 |
| `test/editSession-integration.test.ts` | 26 | ✅ 全通过 |

### 4.3 集成测试覆盖场景

| 场景 | 测试 | 期望状态 |
|------|------|----------|
| 权限拒绝（enabled=false） | 3 项 | `session_terminated` |
| 保存事件（正常写回） | 2 项 | `writeback_success` |
| 重复事件（幂等性） | 3 项 | 每次独立编排 |
| 并发冲突 | 2 项 | `conflict`（含 OVERWRITE_CONFIRMED 跳过冲突检测） |
| 网络失败与重试 | 4 项 | 重试成功 / 重试耗尽 / 重试时冲突 / 非网络不重试 |
| SHA-256 校验失败 | 1 项 | `writeback_failed` |
| 状态映射纯函数 | 9 项 | 全错误分类覆盖 |
| enabled=false 全链路 | 2 项 | `permission_denied` → `session_terminated` |

### 4.4 静态检查
```
check-design-tokens.mjs → 通过（无硬编码色值、无 emoji 图标）
check-contrast.mjs → 通过（12 组合全部 ≥ 4.5:1 WCAG AA）
```

### 4.5 冻结区核验
```
git diff --stat → 零输出（SmbPlugin.ts / src/core/ / android/.../smb/ / package.json / src/main.tsx 全部零变更）
```

---

## 5. 尚未实现的环节

### 5.1 真实服务器验收（未执行）
模拟 SMB 适配器测试验证的是**调用链编排逻辑**（权限→冲突→写回→SHA-256 校验→重试→状态映射），**不等同于真实 SMB 服务器写回验收**。真实服务器验收须在 FRZ-EX 授权后另行执行。

### 5.2 `WRITE_ENABLED_SCOPE.enabled = false`（保持只读）
全局写开关仍为 `false`。全链路经 `checkEditWritePermission` → `executeWriteback` 双层权限守卫，任何写回操作均被拒绝并转入 `session_terminated`。等价 AU-005 只读模式。

### 5.3 WPS 文件变更检测 → 自动触发写回（未连接）
当前 `openFile` 中的 `appStateChange` 监听仅做前台检测（`applyForegroundCheckResult`），不自动触发写回。用户须手动点击重试按钮（`GlobalStatusRail` → `manualStep('writeback')`）。自动触发须在 FRZ-EX 授权后实现。

### 5.4 `applyWritebackResult` 保留但不再被内部调用
`applyWritebackResult` 方法保留在 store 公共接口中供外部直接调用，但内部写回路径已改为经 `executeWriteback` + `mapWritebackExecutorResultToState` 编排。

---

## 6. 下一步所需授权

| 授权项 | 说明 | 当前状态 |
|--------|------|----------|
| FRZ-EX | 解冻生产写回路径，将 `WRITE_ENABLED_SCOPE.enabled` 改为 `true`，执行真实服务器验收 | **未授权** |
| B-02 凭据轮换 | PM + 运维联合授权 | **未授权** |
| B-03 专用账户 | 核准服务器变更申请 | **未授权** |
| B-04 受限目录 + Samba 权限 | 核准权限边界 + 备份 + 回滚 | **未授权** |
| B-05 ACTION_VIEW → ACTION_EDIT | 单独 FRZ-EX 授权 | **未授权** |
| B-07 Android Keystore | 明确代码工作单 + 凭据迁移 | **未授权** |

---

## 7. 安全保证

- `WRITE_ENABLED_SCOPE.enabled = false` — 全局只读，等价 AU-005
- 双层权限守卫：store 层 `checkEditWritePermission` + 执行器层 `checkPermission`
- 冲突检测：写回前检测远端变更，不自动覆盖
- SHA-256 校验：写回成功须 `localHash === verifyHash`
- 网络错误重试：指数退避（1s/2s/4s），重试前重新检测冲突
- 非网络错误不重试，立即返回
- OVERWRITE_CONFIRMED 跳过冲突检测（用户已显式确认覆盖）
- 冻结区零变更
- 无新增 npm 依赖
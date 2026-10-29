# TASK-10 验收报告：WPS 保存后自动触发写回与 saving 状态修复

**日期**：2026-10-29
**基线提交**：`3dde2a3fa297a32e0944e2bb333a4df0fecf4b4b`
**PM 指令**：TASK-10 — WPS 保存后自动触发写回与 saving 状态修复
**授权范围**：仅限代码实现和自动化测试

---

## 1. 修复的三个缺口

### GAP-1：`changed → saving` 状态迁移（对齐 design.md:441）

**修复前**：`applyForegroundCheckResult` 中 `changed + perm.permitted → transition('editing')`
**修复后**：`changed + perm.permitted → transition('saving')` + 自动触发写回

`'saving'` 状态不再为死状态——经自动触发可达。

### GAP-2：saving 态自动触发 writebackExecutor

**修复前**：`onStateChange` 为空函数，无自动触发逻辑
**修复后**：`applyForegroundCheckResult` 中 `perm.permitted=true` 时，transition 到 `'saving'` 后立即 fire-and-forget 调用 `executeWriteback`，编排权限→冲突→写回→SHA-256→重试→状态映射。

### GAP-3：幂等控制 + writeback_success → opened 自动回迁

**幂等控制**：状态机守卫 `state !== 'opened' && state !== 'editing'` 阻止 `saving`/`writeback_pending` 态的重复触发。双层去重：
1. `WpsSaveDetector` 三因子判定（mtime+SHA-256）— 事件级去重
2. 状态机守卫 — 状态级去重

**自动回迁**：`writeback_success → opened`（经 `shouldAutoTransitionToOpened` 判定），使下一轮编辑周期可被检测。失败态（`writeback_failed`/`conflict`/`network_interrupted`）不自动回迁，须用户手动处理。

---

## 2. 实际修改文件

### 修改文件
| 文件 | 变更 |
|------|------|
| `src/state/editSessionStore.ts` | `applyForegroundCheckResult`: `changed+permitted → saving` + 自动触发; `changed+!permitted → editing`（只读）; 三处写回路径增加 `writeback_success → opened` 自动回迁 |
| `src/state/writebackResultMapper.ts` | 新增 `shouldAutoTransitionToOpened` 纯函数 |

### 新建文件
| 文件 | 用途 |
|------|------|
| `test/editSession-auto-trigger.test.ts` | 34 项自动触发/幂等/状态转换/权限拒绝测试 |
| `docs/task-10-verification-report.md` | 本报告 |

### 未修改文件（冻结区核验通过）
- `src/adapter/smb/SmbPlugin.ts` — 零变更
- `src/core/` — 零变更
- `android/app/src/main/java/com/pad2/filemanager/smb/` — 零变更
- `package.json` — 零新增依赖
- `src/main.tsx` — 零变更

---

## 3. 状态机转换图（修复后）

```
                    ┌─── changed + permitted ───→ saving ───→ writeback_pending ──┐
                    │                                                              │
opened ─────────────┤                                                              ↓
                    │                                              writeback_success → opened
                    │                                                              │
                    ├─── changed + !permitted ───→ editing (只读)                  ↑
                    │                                                              │
                    └─── saveAsDiscovered ───────→ saveas_detected                 │
                                                                                   │
                    writeback_failed ────── (用户手动重试) ──→ writeback_pending ──┘
                    conflict ─────────── (用户决策) ─────────→ writeback_pending ──┘
                    network_interrupted ─ (网络恢复+重试) ──→ writeback_pending ──┘
```

---

## 4. 可复现命令

```bash
npx tsc --noEmit

node --test --experimental-strip-types \
  test/writePermission.test.ts \
  test/editSession.test.ts \
  test/writebackExecutor.test.ts \
  test/editSession-integration.test.ts \
  test/editSession-auto-trigger.test.ts

node scripts/check-design-tokens.mjs
node scripts/check-contrast.mjs

git diff --stat 3dde2a3fa297a32e0944e2bb333a4df0fecf4b4b \
  -- src/adapter/smb/SmbPlugin.ts src/core/ \
  android/app/src/main/java/com/pad2/filemanager/smb/ \
  package.json src/main.tsx
```

---

## 5. 测试结果

| 检查项 | 结果 |
|--------|------|
| TypeScript `tsc --noEmit` | ✅ 零错误 |
| 全部测试 | ✅ 120/120 PASS（0 fail, 0 skip, 455ms） |
| 设计令牌 | ✅ 无硬编码色值、无 emoji |
| 对比度 | ✅ 12 组合全部 ≥ 4.5:1（WCAG AA） |
| 冻结区 | ✅ 零变更 |

### 测试分布
| 测试文件 | 测试数 | 覆盖范围 |
|----------|--------|----------|
| `test/writePermission.test.ts` | 24 | 安全原语模块 |
| `test/editSession.test.ts` | 19 | 权限守卫纯函数 |
| `test/writebackExecutor.test.ts` | 17 | 写回执行器 |
| `test/editSession-integration.test.ts` | 26 | 集成测试（TASK-08） |
| `test/editSession-auto-trigger.test.ts` | 34 | **自动触发/幂等/状态转换/权限拒绝（TASK-10 新增）** |

### TASK-10 新增测试覆盖
| 场景 | 测试数 |
|------|--------|
| `shouldAutoTransitionToOpened` 纯函数 | 6 |
| GAP-1: `changed → saving` 状态迁移 | 3 |
| GAP-2: `saving` 态自动触发 writeback | 3 |
| GAP-3: 幂等控制（状态守卫） | 8 |
| 失败恢复（不自动回迁 opened） | 3 |
| 权限拒绝（enabled=false） | 3 |
| 重复事件合并 | 3 |
| 状态转换完整性（5 条路径） | 5 |

---

## 6. 安全保证

- `WRITE_ENABLED_SCOPE.enabled = false` — 全局只读，等价 AU-005
- `changed + !perm.permitted → editing`（不触发写回，只读模式行为不变）
- 双层权限守卫：store 层 `checkEditWritePermission` + 执行器层 `checkPermission`
- 双层去重：`WpsSaveDetector` 三因子判定 + 状态机守卫
- 冲突检测：自动触发前检测远端变更，不自动覆盖
- SHA-256 校验：写回成功须 `localHash === verifyHash`
- 网络错误重试：指数退避（1s/2s/4s），重试前重新检测冲突
- `writeback_success → opened` 自动回迁（准备下一编辑周期）
- 失败态不自动回迁（须用户手动处理）
- 冻结区零变更
- 无新增 npm 依赖

---

## 7. 已知缺陷与限制

### 7.1 真实服务器验收（未执行）
模拟 SMB 适配器测试验证调用链编排逻辑，**不等同于真实 SMB 服务器写回验收**。须在 FRZ-EX 授权后执行 TASK-09 验收清单 R-01~R-12。

### 7.2 `WRITE_ENABLED_SCOPE.enabled = false`（保持只读）
自动触发逻辑已实现但因 `enabled=false` 不会实际执行写回。`changed + !perm.permitted → editing`（只读模式行为不变）。

### 7.3 `applyWritebackResult` 保留但不再被内部调用
`applyWritebackResult` 方法保留在 store 公共接口中供外部直接调用，但内部写回路径已改为经 `executeWriteback` + `mapWritebackExecutorResultToState` 编排。

### 7.4 fire-and-forget 异步
`applyForegroundCheckResult` 保持同步签名（`void`），内部使用 fire-and-forget async IIFE 触发写回。错误经 `applyError` 回流状态机。

---

## 8. 下一项必要任务

真实 WPS→SMB 写回验收须以下授权：

| 授权项 | 说明 | 当前状态 |
|--------|------|----------|
| FRZ-EX | 解冻生产写回路径（`enabled → true`）+ 真实服务器验收 R-01~R-12 | **未授权** |
| B-02 凭据轮换 | PM + 运维联合授权 | **未授权** |
| B-03 专用账户 | 核准服务器变更申请 | **未授权** |
| B-04 受限目录 + Samba 权限 | 核准权限边界 + 备份 + 回滚 | **未授权** |
| B-05 ACTION_EDIT | 单独 FRZ-EX 授权 | **未授权** |
| B-07 Android Keystore | 明确代码工作单 + 凭据迁移 | **未授权** |

**建议下一步**：PM 审阅本报告后决定是否授权 FRZ-EX + 真实服务器验收。
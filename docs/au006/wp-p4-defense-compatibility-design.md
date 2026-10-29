# WP-P4-15 AU-005 防御层兼容性设计

> 任务编号：WP-P4-15-DEFENSE-COMPATIBILITY-DESIGN
> 关联 EARS 需求：REQ-SEC-010（回滚能力）、REQ-STATE-002（writeEnabled 条件化）、REQ-DEF-001（防御层保留）
> 关联 tasks.md：第 15 项 / 共 23 项
> 状态：DESIGN READY
> 上游依赖：WP-P3-08（权限矩阵）、WP-P4-14（状态机扩展）
> 下游影响：WP-P5-19（威胁分析）、WP-P5-22（回滚计划）

---

## 1. 设计目标

证明 AU-006 扩展**不破坏** AU-005 的三层防御体系，且在回滚时能完整恢复。须验证：

1. **OPERATION_CAPABILITIES 保留**：原 6 项 false 能力不删除，扩展而非替换。
2. **READ_ONLY_MODE 守卫保留**：原 7 处守卫不删除，改造为条件化。
3. **editSessionStore 7 态保留**：原 7 态不删除，新增 2 态。
4. **回滚等价性**：禁用写回后等价 AU-005。

---

## 2. AU-005 三层防御回顾

### 2.1 第一层：OPERATION_CAPABILITIES

```typescript
// AU-005 基线
export const OPERATION_CAPABILITIES = {
  canEdit: false,
  canSave: false,
  canSaveAs: false,
  canDelete: false,
  canRename: false,
  canCreate: false,
} as const;
```

6 项全 false，从能力层拒绝所有写操作。

### 2.2 第二层：READ_ONLY_MODE 守卫

```typescript
export const READ_ONLY_MODE = true as const;
```

7 处守卫（详见 WP-P4-14 §2.2）在操作层拒绝。

### 2.3 第三层：editSessionStore 状态机

7 态状态机（idle/opening/open_failed/opened/session_terminated/network_interrupted/session_invalid），无 write 态。

---

## 3. AU-006 扩展策略

### 3.1 扩展原则

| 原则 | 说明 |
|---|---|
| 加法扩展 | 仅新增，不删除原防御 |
| 条件放行 | 原守卫改造为 `原条件 && !writeEnabled(path)` |
| 可退化 | globalEnabled=false 时等价 AU-005 |

### 3.2 第一层扩展：OPERATION_CAPABILITIES

```typescript
// AU-006 扩展
export const OPERATION_CAPABILITIES = {
  // 原 6 项保留（AU-005 兼容）
  canEdit: false,      // 保留 false，运行时由 writeEnabled 放行
  canSave: false,      // 同上
  canSaveAs: false,    // 同上
  canDelete: false,    // 同上
  canRename: false,    // 同上
  canCreate: false,    // 同上
  // 新增：写回开关（AU-006）
  writeBackEnabled: true,  // 总开关，等价 WRITE_ENABLED_SCOPE.globalEnabled
} as const;
```

**关键**：原 6 项仍 false，不直接放行。运行时通过 `writeEnabled(path)` 函数动态评估，与 OPERATION_CAPABILITIES 解耦。

### 3.3 第二层扩展：READ_ONLY_MODE 守卫

| 守卫 | AU-005 | AU-006 | 兼容证明 |
|---|---|---|---|
| 1. openSession | `READ_ONLY_MODE` | `READ_ONLY_MODE`（不变） | ✅ 不变 |
| 2. editContent | `READ_ONLY_MODE` | `READ_ONLY_MODE && !writeEnabled(path)` | §3.4 证明 |
| 3. saveContent | `READ_ONLY_MODE` | `READ_ONLY_MODE && !writeEnabled(path)` | 同上 |
| 4. saveAsContent | `READ_ONLY_MODE` | `READ_ONLY_MODE && !writeEnabled(newPath)` | 同上 |
| 5. deleteDocument | `READ_ONLY_MODE` | `READ_ONLY_MODE && !writeEnabled(path)` | 同上 |
| 6. renameDocument | `READ_ONLY_MODE` | `READ_ONLY_MODE && !writeEnabled(path)` | 同上 |
| 7. closeSession | `READ_ONLY_MODE` | `READ_ONLY_MODE`（不变） | ✅ 不变 |

### 3.4 守卫兼容证明

**定理**：对任一守卫 i ∈ {2,3,4,5,6}，AU-006 守卫 `READ_ONLY_MODE && !writeEnabled(path)` 在 globalEnabled=false 时等价 AU-005 守卫 `READ_ONLY_MODE`。

**证明**：
- globalEnabled=false ⟹ writeEnabled(path)=false（WP-P4-14 §4.1 步骤 1）
- ⟹ !writeEnabled(path)=true
- ⟹ `READ_ONLY_MODE && !writeEnabled(path)` = `READ_ONLY_MODE && true` = `READ_ONLY_MODE`
- 等价 AU-005。 ∎

**推论**：globalEnabled=false 时，所有 7 处守卫等价 AU-005，防御完整保留。

### 3.5 第三层扩展：editSessionStore

| 项 | AU-005 | AU-006 | 兼容 |
|---|---|---|---|
| 状态集 | 7 态 | 9 态（新增 write_pending, write_completed） | ✅ 原 7 态保留 |
| 转移表 | 无 write 转移 | 新增 write 转移 | ✅ 原转移保留 |
| 可达性 | 7 态封闭 | 9 态封闭 | ✅ WP-P4-14 §3.4 |
| 退化 | - | globalEnabled=false 时 write 态不可达 | ✅ WP-P4-14 §6.1 |

---

## 4. 防御层叠加模型

### 4.1 AU-006 四层防御

```
写回请求
    │
    ▼
┌─────────────────────────────┐
│ 第 0 层：OPERATION_CAPABILITIES │  能力层（原 AU-005）
│ + writeBackEnabled 开关        │  + AU-006 扩展
└─────────────────────────────┘
    │ writeBackEnabled=true
    ▼
┌─────────────────────────────┐
│ 第 1 层：READ_ONLY_MODE 守卫   │  守卫层（原 AU-005）
│ + writeEnabled(path) 条件化    │  + AU-006 改造
└─────────────────────────────┘
    │ 守卫放行
    ▼
┌─────────────────────────────┐
│ 第 2 层：editSessionStore 状态机 │  状态层（原 AU-005）
│ + write_pending/completed 态   │  + AU-006 扩展
└─────────────────────────────┘
    │ 状态转移合法
    ▼
┌─────────────────────────────┐
│ 第 3 层：WRITE_PERMISSION_MATRIX │  矩阵层（AU-006 新增）
│ + 路径防御 + ACL              │  + 物理层兜底
└─────────────────────────────┘
    │ 矩阵允许 + ACL 允许
    ▼
    执行写回
```

### 4.2 层间关系

| 层 | 失败时 | 可被上层覆盖 | AU-005 对应 |
|---|---|---|---|
| 第 0 层 | 能力不足，拒绝 | 否（最前置） | OPERATION_CAPABILITIES |
| 第 1 层 | 守卫拒绝 | 否 | READ_ONLY_MODE |
| 第 2 层 | 状态非法 | 否 | editSessionStore |
| 第 3 层 | 矩阵/ACL 拒绝 | 否 | （AU-005 无此层，纯只读） |

**关键**：AU-006 在 AU-005 三层防御基础上**新增第 3 层**（矩阵+ACL），原三层保留。回滚时禁用第 0 层 writeBackEnabled，第 1-2 层自动退化，第 3 层虽存在但不可达。

---

## 5. 回滚等价性证明

### 5.1 回滚操作

```typescript
export async function rollbackToAU005(): Promise<void> {
  // 1. 禁用写回总开关
  WRITE_ENABLED_SCOPE.globalEnabled = false;
  OPERATION_CAPABILITIES.writeBackEnabled = false;

  // 2. 停止所有 write_pending 会话
  for (const session of activeSessions) {
    if (session.state === 'write_pending') {
      await transition(session, 'writeFailure');  // 转 session_invalid
    }
  }

  // 3. 清理可写副本（可选，保留审计）
  // await cleanupWritableCopies();

  // 4. 移除 [writable] SMB section（WP-P3-07 §4.3）
  await removeWritableSection();

  // 5. 禁用 pad2_app 账户（WP-P2-04）
  await disableAccount('pad2_app');

  // 6. 校验等价 AU-005
  await verifyAU005Equivalence();
}
```

### 5.2 等价性校验

| 校验项 | AU-006 回滚后 | AU-005 基线 | 等价 |
|---|---|---|---|
| OPERATION_CAPABILITIES.canEdit | false | false | ✅ |
| OPERATION_CAPABILITIES.canSave | false | false | ✅ |
| OPERATION_CAPABILITIES.writeBackEnabled | false | (不存在) | ✅ 等价 |
| READ_ONLY_MODE | true | true | ✅ |
| 守卫 1-7 | 等价（§3.4 证明） | 原守卫 | ✅ |
| editSessionStore 可达态 | 7 态 | 7 态 | ✅ |
| smb.conf [writable] | 已移除 | 不存在 | ✅ |
| pad2_app 账户 | 已禁用 | 不存在 | ✅ |
| /mnt/share/writable/ | (可选删除) | 不存在 | ✅ |

**结论**：回滚后系统等价 AU-005 基线。

---

## 6. 渐进部署兼容性

### 6.1 部署阶段

| 阶段 | 配置 | 防御层状态 | 等价 |
|---|---|---|---|
| 0 | AU-005 基线 | 三层防御 | AU-005 |
| 1 | + pad2_app 账户（禁用） | 三层防御 + 账户（未启用） | AU-005 |
| 2 | + [writable] section（无挂载） | 三层防御 + SMB section | AU-005 |
| 3 | + globalEnabled=false | 四层防御（第 3 层不可达） | AU-005 |
| 4 | + globalEnabled=true + 空白名单 | 四层防御（无路径放行） | AU-005 |
| 5 | + 部分白名单 | 四层防御（部分写回） | AU-006 部分启用 |
| 6 | + 完整白名单 | 四层防御（完整写回） | AU-006 完整 |

### 6.2 阶段回滚

| 阶段 | 回滚至 | 操作 |
|---|---|---|
| 6→5 | 移除部分白名单 | 修改矩阵 |
| 5→4 | 清空白名单 | 矩阵空 |
| 4→3 | globalEnabled=false | 开关 |
| 3→2 | 移除挂载 | umount |
| 2→1 | 移除 [writable] section | smb.conf |
| 1→0 | 禁用 pad2_app | WP-P2-04 |

每步可独立回滚，无需一次性退回阶段 0。

---

## 7. 防御层单测设计

### 7.1 测试矩阵

| 测试 | 第 0 层 | 第 1 层 | 第 2 层 | 第 3 层 | 期望 |
|---|---|---|---|---|---|
| T1 | writeBackEnabled=false | - | - | - | 拒绝（第 0 层） |
| T2 | true | READ_ONLY=true | - | - | 拒绝（第 1 层） |
| T3 | true | writeEnabled=false | - | - | 拒绝（第 1 层） |
| T4 | true | writeEnabled=true | state=write_pending | - | 拒绝（第 2 层状态非法） |
| T5 | true | writeEnabled=true | state=opened | 矩阵拒绝 | 拒绝（第 3 层） |
| T6 | true | writeEnabled=true | state=opened | ACL 拒绝 | 拒绝（第 3 层） |
| T7 | true | writeEnabled=true | state=opened | 矩阵+ACL 允许 | 成功 |

### 7.2 回滚测试

| 测试 | 操作 | 期望 |
|---|---|---|
| R1 | rollbackToAU005() | 等价 AU-005 |
| R2 | 回滚后尝试写回 | 拒绝（第 0 层） |
| R3 | 回滚后状态机 | 7 态 |
| R4 | 回滚后 smb.conf | 无 [writable] |

---

## 8. 验收标准

| 编号 | 标准 | 验证方法 |
|---|---|---|
| AC-1 | 原 6 项 OPERATION_CAPABILITIES 保留 false | 代码检查 |
| AC-2 | 原 7 处 READ_ONLY_MODE 守卫保留 | 代码检查 |
| AC-3 | 原 7 态 editSessionStore 保留 | 代码检查 |
| AC-4 | globalEnabled=false 时守卫等价 AU-005 | §3.4 证明 |
| AC-5 | globalEnabled=false 时状态机 7 态 | 退化测试 |
| AC-6 | 回滚后等价 AU-005 | §5.2 校验 |
| AC-7 | 四层防御叠加正确 | §7.1 测试矩阵 |
| AC-8 | 渐进部署 6 阶段兼容 | §6.1 阶段测试 |
| AC-9 | 每阶段可独立回滚 | §6.2 回滚测试 |
| AC-10 | 防御层单测全覆盖 | §7 测试设计 |

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 守卫改造遗漏 | 越权 | 7 处守卫逐一验证 + 单测 |
| 回滚不彻底 | 拋留写回能力 | §5.2 等价性校验 |
| 阶段跳跃部署 | 中间态不安全 | 严格按 §6.1 阶段顺序 |
| 新增层 bug | 防御绕过 | 第 3 层兜底（ACL） |

---

## 10. 待授权事项

- [ ] **NOT AUTHORIZED**：修改 OPERATION_CAPABILITIES（待安全团队授权）
- [ ] **NOT AUTHORIZED**：修改 READ_ONLY_MODE 守卫（待安全团队授权）
- [ ] **NOT AUTHORIZED**：执行 rollbackToAU005()（待运维授权）
- 本文档仅为设计产出。

---

## 11. 追溯

| EARS 需求 | 本文档章节 |
|---|---|
| REQ-SEC-010 回滚能力 | §5 回滚等价性 |
| REQ-STATE-002 writeEnabled 条件化 | §3.3 守卫改造 |
| REQ-DEF-001 防御层保留 | §3 扩展策略、§4 叠加模型 |
| REQ-OPS-017 渐进部署 | §6 渐进部署 |
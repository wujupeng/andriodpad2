# WP-P4-14 状态机扩展设计

> 任务编号：WP-P4-14-STATE-MACHINE-EXTENSION-DESIGN
> 关联 EARS 需求：REQ-STATE-001（状态机扩展）、REQ-STATE-002（writeEnabled 条件化）、REQ-STATE-003（状态可达性）
> 关联 tasks.md：第 14 项 / 共 23 项
> 状态：DESIGN READY
> 上游依赖：WP-P3-08（权限矩阵）、WP-P4-12（WPS 行为）、WP-P4-13（路径映射）
> 下游影响：WP-P4-15（防御兼容）、WP-P4-16（冲突检测）、WP-P5-19（威胁分析）

---

## 1. 设计目标

将 AU-005 的 `editSessionStore` 7 态状态机扩展为 9 态，新增写回相关状态，同时：

1. **保留原 7 态**：idle, opening, open_failed, opened, session_terminated, network_interrupted, session_invalid。
2. **新增 2 态**：write_pending, write_completed（或 write_failed）。
3. **保留 READ_ONLY_MODE 守卫**：原 7 处守卫不删除，新增 writeEnabled 条件化。
4. **可达性封闭**：新状态的转移须形成封闭集合，无悬挂状态。
5. **可回滚**：禁用写回后状态机退化为 7 态（等价 AU-005）。

---

## 2. AU-005 基线状态机

### 2.1 原 7 态

| 状态 | 含义 | 可转移至 |
|---|---|---|
| idle | 初始态 | opening |
| opening | 打开中 | opened, open_failed |
| open_failed | 打开失败 | idle |
| opened | 已打开（只读） | session_terminated, network_interrupted, session_invalid |
| session_terminated | 会话正常终止 | idle |
| network_interrupted | 网络中断 | opened, session_invalid |
| session_invalid | 会话失效 | idle |

### 2.2 原 7 处 READ_ONLY_MODE 守卫

| 守卫位置 | 守卫条件 | 行为 |
|---|---|---|
| 1. openSession | READ_ONLY_MODE === true | 仅只读打开 |
| 2. editContent | READ_ONLY_MODE === true | 拒绝编辑 |
| 3. saveContent | READ_ONLY_MODE === true | 拒绝保存 |
| 4. saveAsContent | READ_ONLY_MODE === true | 拒绝另存 |
| 5. deleteDocument | READ_ONLY_MODE === true | 拒绝删除 |
| 6. renameDocument | READ_ONLY_MODE === true | 拒绝重命名 |
| 7. closeSession | READ_ONLY_MODE === true | 仅关闭不保存 |

---

## 3. 扩展后 C 态状态机

### 3.1 新增 2 态

| 状态 | 含义 | 触发条件 |
|---|---|---|
| write_pending | 写回进行中 | 用户保存 + writeEnabled(path) |
| write_completed | 写回完成 | 写回成功 |
| write_failed | 写回失败 | 写回失败（可合并入 session_invalid） |

**设计决策**：新增 `8. write_pending 与 9. write_completed 两态，write_failed 合并到 session_invalid（避免状态膨胀）。

### 3.2 完整 9 态转移表

| 当前态 | 事件 | 条件 | 下一态 | 动作 |
|---|---|---|---|---|
| idle | openSession | - | opening | 发起打开 |
| opening | openSuccess | - | opened | 返回文件内容 |
| opening | openFailure | - | open_failed | 返回错误 |
| open_failed | retry | - | opening | 重试打开 |
| open_failed | dismiss | - | idle | 清理 |
| opened | beginWrite | writeEnabled(path) | write_pending | 发起写回 |
| opened | beginWrite | !writeEnabled(path) | opened | 返回 READ_ONLY �(拒绝) |
| opened | networkLoss | - | network_interrupted | 标记中断 |
| opened | terminate | - | session_terminated | 关闭会话 |
| write_pending | writeSuccess | - | write_completed | 记录审计 |
| write_pending | writeFailure | 可重试 | write_pending | 重试写回 |
| write_pending | writeFailure | 重试耗尽 | session_invalid | 标记失效 |
| write_pending | networkLoss | - | network_interrupted | 标记中断 |
| write_completed | continue | - | opened | 返回编辑 |
| write_completed | terminate | - | session_terminated | 关闭会话 |
| network_interrupted | reconnect | 写回未完成 | write_pending | 恢复写回 |
| network_interrupted | reconnect | 无写回 | opened | 恢复会话 |
| network_interrupted | timeout | - | session_invalid | 标记失效 |
| session_terminated | reset | - | idle | 清理 |
| session_invalid | reset | - | idle | 清理 |

### 3.3 状态转移图

```
                    ┌──────────┐
                    │   idle   │ ←────────────────────────────────┐
                    └────┬─────┘                                   │
                         │ openSession                              │
                         ▼                                          │
                    ┌──────────┐                                   │
                    │ opening  │                                   │
                    └────┬─────┘                                   │
                    ┌────┴─────┐                                   │
              openSuccess     openFailure                            │
                    │           │                                   │
                    ▼           ▼                                   │
              ┌──────────┐ ┌────────────┐                          │
              │  opened  │ │ open_failed │──dismiss────────────────┤
              └────┬─────┘ └────────────┘                          │
                   │ beginWrite                                    │
                   │ (writeEnabled)                                │
                   ▼                                               │
              ┌──────────────┐                                    │
              │ write_pending │──writeSuccess──→┌────────────────┐ │
              └──────┬───────┘                   │ write_completed │ │
                     │                           └───────┬────────┘ │
              writeFailure                               │          │
              (重试耗尽)                                  │ continue │
                     │                                    ▼          │
                     ▼                               ┌──────────┐   │
              ┌─────────────────┐                    │  opened  │   │
              │ session_invalid │                    └──────────┘   │
              └─────────────────┘                                   │
                    │                                               │
                    │ reset                                         │
                    └───────────────────────────────────────────────┘
```

### 3.4 可达性分析

| 状态 | 可达自 | 可达至 | 封闭 |
|---|---|---|---|
| idle | (初始), session_terminated, session_invalid, open_failed | opening | ✅ |
| opening | idle | opened, open_failed | ✅ |
| open_failed | opening | idle, opening | ✅ |
| opened | opening, write_completed, network_interrupted | write_pending, network_interrupted, session_terminated | ✅ |
| write_pending | opened, network_interrupted | write_completed, session_invalid, network_interrupted | ✅ |
| write_completed | write_pending | opened, session_terminated | ✅ |
| session_terminated | opened, write_completed | idle | ✅ |
| network_interrupted | opened, write_pending | opened, write_pending, session_invalid | ✅ |
| session_invalid | write_pending, network_interrupted | idle | ✅ |

**结论**：9 态形成封闭集合，无悬挂状态，无死锁。

---

## 4. writeEnabled 条件化守卫

### 4.1 writeEnabled 函数

```typescript
export function writeEnabled(path: string): boolean {
  // 1. 全局开关
  if (!WRITE_ENABLED_SCOPE.globalEnabled) {
    return false;
  }

  // 2. 路径白名单
  const inWritableScope = WRITE_ENABLED_SCOPE.writablePathPrefixes.some(
    prefix => path.startsWith(prefix),
  );
  if (!inWritableScope) {
    return false;
  }

  // 3. FRZ-EX 边界
  if (FRZ_EX_BOUNDARY.isWithinFrzEx(path, 'ACTION_EDIT')) {
    return false;
  }

  // 4. 账户授权（运行时上下文）
  if (!WRITE_ENABLED_SCOPE.authorizedAccounts.includes(currentAccount)) {
    return false;
  }

  return true;
}
```

### 4.2 守卫改造

| 原 AU-005 守卫 | AU-006 改造 | 行为 |
|---|---|---|
| 1. openSession: READ_ONLY_MODE | 保留 + 新增 writeEnabled 检查 | 只读打开仍允许，写回须 writeEnabled |
| 2. editContent: READ_ONLY_MODE | 改为 `READ_ONLY_MODE && !writeEnabled(path)` | writeEnabled 时允许编辑 |
| 3. saveContent: READ_ONLY_MODE | 改为 `READ_ONLY_MODE && !writeEnabled(path)` | writeEnabled 时允许保存 |
| 4. saveAsContent: READ_ONLY_MODE | 改为 `READ_ONLY_MODE && !writeEnabled(newPath)` | writeEnabled 时允许另存 |
| 5. deleteDocument: READ_ONLY_MODE | 改为 `READ_ONLY_MODE && !writeEnabled(path)` | writeEnabled 时允许删除 |
| 6. renameDocument: READ_ONLY_MODE | 改为 `READ_ONLY_MODE && !writeEnabled(path)` | writeEnabled 时允许重命名 |
| 7. closeSession: READ_ONLY_MODE | 保留（关闭不受影响） | 同 AU-005 |

### 4.3 守卫保留证明

**定理**：AU-006 守卫改造后，原 7 处 READ_ONLY_MODE 守卫语义保留。

**证明**：
- 当 `WRITE_ENABLED_SCOPE.globalEnabled = false`（回滚至 AU-005）：
  - `writeEnabled(path) = false`（§4.1 步骤 1）
  - `READ_ONLY_MODE && !writeEnabled(path) = READ_ONLY_MODE && true = READ_ONLY_MODE`
  - 等价 AU-005 原守卫。 ∎
- 当 `globalEnabled = true` 但路径不在白名单：
  - `writeEnabled(path) = false`（§4.1 步骤 2）
  - 同上等价 AU-005。 ∎
- 当 `globalEnabled = true` 且路径在白名单：
  - `writeEnabled(path) = true`
  - `READ_ONLY_MODE && !true = false`（守卫放行）
  - 允许写回（设计意图）。 ∎

---

## 5. editSessionStore 扩展

### 5.1 类型定义

```typescript
export type EditSessionState =
  | 'idle'
  | 'opening'
  | 'open_failed'
  | 'opened'
  | 'write_pending'      // 新增
  | 'write_completed'    // 新增
  | 'session_terminated'
  | 'network_interrupted'
  | 'session_invalid';

export interface EditSession {
  sessionId: string;
  state: EditSessionState;
  logicalPath: string;
  physicalPath: string;
  isWritableCopy: boolean;
  writeEnabled: boolean;
  createdAt: number;
  lastTransition: number;
  transitionHistory: Array<{ from: EditSessionState; to: EditSessionState; event: string; timestamp: number }>;
}
```

### 5.2 转移函数

```typescript
export function transition(
  session: EditSession,
  event: string,
  context?: { path?: string },
): EditSession {
  const { state } = session;
  const nextState = STATE_TRANSITION_TABLE[state]?.[event];

  if (!nextState) {
    throw new InvalidTransitionError(state, event);
  }

  // 守卫检查
  if (event === 'beginWrite') {
    const path = context?.path;
    if (!path || !writeEnabled(path)) {
      // 守卫拒绝：保持 opened 态
      return session;
    }
  }

  // 记录转移
  const newSession: EditSession = {
    ...session,
    state: nextState,
    lastTransition: Date.now(),
    transitionHistory: [
      ...session.transitionHistory,
      { from: state, to: nextState, event, timestamp: Date.now() },
    ],
  };

  return newSession;
}
```

---

## 6. 与 AU-005 兼容性

### 6.1 退化验证

当 `WRITE_ENABLED_SCOPE.globalEnabled = false`：

| 属性 | AU-006 扩展后 | AU-005 基线 | 等价 |
|---|---|---|---|
| 可达状态集 | 7 态（write_pending/write_completed 不可达） | 7 态 | ✅ |
| 守卫行为 | 等价 READ_ONLY_MODE | READ_ONLY_MODE | ✅ |
| 状态转移 | 无 write 转移 | 无 write 转移 | ✅ |
| editSessionStore | transitionHistory 无 write 记录 | 同 | ✅ |

### 6.2 渐进启用

| 阶段 | globalEnabled | 行为 |
|---|---|---|
| 阶段 0 | false | 等价 AU-005 |
| 阶段 1 | true + 空白名单 | 等价 AU-005（无路径放行） |
| 阶段 2 | true + 部分白名单 | 部分路径可写回 |
| 阶段 3 | true + 完整白名单 | 完整写回能力 |

---

## 7. 并发与竞态

### 7.1 并发写回

| 场景 | 处理 |
|---|---|
| 同一文件并发写 | 锁文件串行化（WP-P4-16） |
| 不同文件并发写 | 各自独立 session |
| 同一 session 并发事件 | 状态机串行处理（事件队列） |

### 7.2 状态一致性

| 保证 | 实现 |
|---|---|
| 原子转移 | transition 函数同步执行 |
| 历史完整 | transitionHistory 追加 |
| 可回放 | 历史可重放重建状态 |

---

## 8. 验收标准

| 编号 | 标准 | 验证方法 |
|---|---|---|
| AC-1 | 9 态全部可达 | 状态覆盖测试 |
| AC-2 | 无悬挂状态 | 可达性分析 |
| AC-3 | 无死锁 | 转移图分析 |
| AC-4 | globalEnabled=false 退化为 7 态 | 退化测试 |
| AC-5 | 守卫保留 READ_ONLY_MODE 语义 | §4.3 证明 |
| AC-6 | writeEnabled(path) 白名单生效 | 路径测试 |
| AC-7 | FRZ-EX 路径 writeEnabled=false | 边界测试 |
| AC-8 | transitionHistory 完整记录 | 历史测试 |
| AC-9 | 并发写回串行化 | 并发测试 |
| AC-10 | 网络中断恢复后正确转移 | 中断模拟 |
| AC-11 | 重试耗尽转 session_invalid | 重试测试 |
| AC-12 | write_completed 可继续编辑 | 连续操作 |

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 状态膨胀 | 复杂度上升 | 仅新增 2 态，write_failed 合并 |
| 守卫改造引入 bug | 越权 | §4.3 证明 + 单测 |
| 并发竞态 | 状态不一致 | 事件队列 + 锁 |
| 回滚不彻底 | 残留 write 态 | globalEnabled=false 强制退化 |

---

## 10. 待授权事项

- [ ] **NOT AUTHORIZED**：修改 editSessionStore 源码（待开发授权）
- [ ] **NOT AUTHORIZED**：修改 READ_ONLY_MODE 守卫（待安全团队授权）
- 本文档仅为设计产出。

---

## 11. 追溯

| EARS 需求 | 本文档章节 |
|---|---|
| REQ-STATE-001 状态机扩展 | §3 扩展后状态机 |
| REQ-STATE-002 writeEnabled 条件化 | §4 writeEnabled 守卫 |
| REQ-STATE-003 状态可达性 | §3.4 可达性分析 |
| REQ-SEC-010 回滚能力 | §6 兼容性 |
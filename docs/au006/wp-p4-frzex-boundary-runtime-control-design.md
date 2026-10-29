# WP-P4-18 FRZ-EX 边界运行时控制设计

> 任务编号：WP-P4-18-FRZEX-BOUNDARY-RUNTIME-CONTROL-DESIGN
> 关联 EARS 需求：REQ-SEC-007（FRZ-EX 边界）、REQ-FRZ-001（ACTION_VIEW→ACTION_EDIT NOT AUTHORIZED）、REQ-FRZ-002（运行时强制）
> 关联 tasks.md：第 18 项 / 共 23 项
> 状态：DESIGN READY
> 上游依赖：WP-P3-08（权限矩阵 FRZ-EX）、WP-P4-14（状态机）
> 下游影响：WP-P5-19（威胁分析）、WP-P5-20（风险登记）

---

## 1. 设计目标

设计 FRZ-EX（Freeze Exception）边界的**运行时强制**机制，确保：

1. **ACTION_VIEW → ACTION_EDIT 绝对禁止**：冻结路径上 ACTION_EDIT 永远 NOT AUTHORIZED，无论 globalEnabled 或矩阵配置如何。
2. **运行时不可绕过**：FRZ-EX 检查在状态机转移、权限评估、路径映射三层都执行，无单点绕过。
3. **配置不可降级**：FRZ-EX 边界配置须 immutable + 审计，运行时不可修改。
4. **明确拒绝反馈**：用户收到"此文件已冻结，不可编辑"明确提示。

---

## 2. FRZ-EX 边界定义

### 2.1 FRZ-EX 概念

FRZ-EX（Freeze Exception）是 AU-005 引入的**冻结异常边界**，标记某些路径/操作组合为永久冻结，即使 AU-006 启用写回也不解冻。

### 2.2 FRZ-EX 边界配置（来自 design.md）

```typescript
export const FRZ_EX_BOUNDARY = {
  // 冻结路径前缀：这些路径下的文件永远不可 ACTION_EDIT
  frozenPaths: [
    '/mnt/share/writable/documents/_frozen/',    // 显式冻结区
    '/mnt/share/system/',                         // 系统文件区
    '/mnt/share/archive/',                        // 归档区
  ],

  // 冻结操作：这些操作在冻结路径上永远禁止
  frozenOperations: [
    'ACTION_EDIT',       // 编辑（核心禁止项）
    'ACTION_DELETE',     // 删除
    'ACTION_RENAME',     // 重命名（可能改变路径逃逸冻结）
    'ACTION_MOVE',       // 移动
    'ACTION_PERMISSION_CHANGE',  // 权限变更
  ],

  // 允许的操作（冻结路径上仍允许）
  allowedOperations: [
    'ACTION_VIEW',       // 只读查看
    'ACTION_COPY',       // 复制（复制到非冻结区）
    'ACTION_METADATA',   // 读取元数据
  ],

  // 不可变标记
  immutable: true,
  version: '1.0.0',
} as const;
```

### 2.3 FRZ-EX 检查函数

```typescript
export function isWithinFrzEx(
  path: string,
  operation: string,
): { frozen: boolean; reason?: string } {
  // 1. 路径匹配
  const pathFrozen = FRZ_EX_BOUNDARY.frozenPaths.some(
    prefix => path.startsWith(prefix),
  );
  if (!pathFrozen) {
    return { frozen: false };
  }

  // 2. 操作匹配
  const opFrozen = FRZ_EX_BOUNDARY.frozenOperations.includes(operation);
  if (opFrozen) {
    return {
      frozen: true,
      reason: `FRZ_EX_BOUNDARY: path ${path} is frozen for ${operation}`,
    };
  }

  // 3. 路径冻结但操作允许（如 ACTION_VIEW）
  return { frozen: false };
}
```

---

## 3. 三层运行时强制

### 3.1 第一层：权限矩阵层

在 `evaluateWritePermission` 中前置 FRZ-EX 检查：

```typescript
export function evaluateWritePermission(
  account: string,
  absPath: string,
  operation: string,
): { allowed: boolean; reason: string } {
  // ★ FRZ-EX 前置检查（最高优先级）
  const frzEx = isWithinFrzEx(absPath, operation);
  if (frzEx.frozen) {
    return { allowed: false, reason: frzEx.reason! };
  }

  // 后续：全局开关、账户白名单、路径白名单、矩阵匹配...
  // （详见 WP-P3-08 §3.3）
}
```

**保证**：FRZ-EX 检查在矩阵评估最前置，任何后续放行逻辑无法绕过。

### 3.2 第二层：状态机层

在状态机 `transition` 中前置 FRZ-EX 检查：

```typescript
export function transition(
  session: EditSession,
  event: string,
  context?: { path?: string; operation?: string },
): EditSession {
  // ★ FRZ-EX 前置检查
  if (context?.path && context?.operation) {
    const frzEx = isWithinFrzEx(context.path, context.operation);
    if (frzEx.frozen) {
      // 不转移状态，返回原 session + 错误标记
      return {
        ...session,
        lastError: { type: 'FRZ_EX_BOUNDARY', reason: frzEx.reason },
      };
    }
  }

  // 后续：正常状态转移...
  // （详见 WP-P4-14 §5.2）
}
```

**保证**：FRZ-EX 冻结操作无法触发状态机转移，write_pending 态不可达。

### 3.3 第三层：路径映射层

在 `mapLogicalToPhysical` 中前置 FRZ-EX 检查：

```typescript
export function mapLogicalToPhysical(
  logicalPath: string,
  operation: 'read' | 'write',
): PathMappingResult {
  // ★ FRZ-EX 前置检查（仅对写操作）
  if (operation === 'write') {
    const frzEx = isWithinFrzEx(logicalPath, 'ACTION_EDIT');
    if (frzEx.frozen) {
      throw new FrzExBoundaryError(frzEx.reason!);
    }
  }

  // 后续：路径映射...
  // （详见 WP-P4-13 §3.1）
}
```

**保证**：FRZ-EX 冻结路径的写操作无法获得物理路径映射，无法触达文件系统。

### 3.4 三层叠加

```
写回请求 (path, ACTION_EDIT)
    │
    ▼
┌─────────────────────────┐
│ 第 1 层：权限矩阵        │  ← FRZ-EX 前置
│ evaluateWritePermission  │
└─────────────────────────┘
    │ FRZ-EX 冻结 → 拒绝
    │ 通过
    ▼
┌─────────────────────────┐
│ 第 2 层：状态机          │  ← FRZ-EX 前置
│ transition               │
└─────────────────────────┘
    │ FRZ-EX 冻结 → 不转移
    │ 通过
    ▼
┌─────────────────────────┐
│ 第 3 层：路径映射        │  ← FRZ-EX 前置
│ mapLogicalToPhysical     │
└─────────────────────────┘
    │ FRZ-EX 冻结 → 抛异常
    │ 通过
    ▼
    执行写回
```

**关键**：三层都执行 FRZ-EX 检查，任一层拒绝即终止。即使某层 bug 绕过，其他层仍拦截。

---

## 4. ACTION_VIEW → ACTION_EDIT 禁止证明

### 4.1 定理

**定理**：对任一冻结路径 path ∈ FRZ_EX_BOUNDARY.frozenPaths，ACTION_EDIT 操作永远 NOT AUTHORIZED，无论 globalEnabled、矩阵配置、账户权限如何。

### 4.2 证明

1. **第一层（权限矩阵）**：
   - `evaluateWritePermission` 第一步执行 `isWithinFrzEx(path, 'ACTION_EDIT')`
   - path ∈ frozenPaths 且 'ACTION_EDIT' ∈ frozenOperations
   - ⟹ frzEx.frozen = true
   - ⟹ 返回 `{ allowed: false, reason: 'FRZ_EX_BOUNDARY...' }`
   - 后续全局开关、账户白名单、矩阵匹配**不执行**。

2. **第二层（状态机）**：
   - `transition` 检查 `isWithinFrzEx(path, 'ACTION_EDIT')`
   - ⟹ frzEx.frozen = true
   - ⟹ 不转移状态，返回原 session + lastError
   - write_pending 态**不可达**。

3. **第三层（路径映射）**：
   - `mapLogicalToPhysical` 检查 `isWithinFrzEx(path, 'ACTION_EDIT')`
   - ⟹ frzEx.frozen = true
   - ⟹ 抛 FrzExBoundaryError
   - 物理路径**不返回**。

4. **三层都拒绝**，无单点绕过。 ∎

### 4.3 不可降级证明

**定理**：FRZ_EX_BOUNDARY 配置在运行时不可修改。

**证明**：
- `FRZ_EX_BOUNDARY` 声明为 `as const`（TypeScript 编译时不可变）
- `immutable: true` 标记
- 运行时无 setter / 无 mutable 引用
- 修改须重新部署代码 + 审计
- ∴ 运行时不可降级。 ∎

---

## 5. FRZ-EX 与 writeEnabled 交互

### 5.1 writeEnabled 中的 FRZ-EX 检查

```typescript
export function writeEnabled(path: string): boolean {
  // 1. 全局开关
  if (!WRITE_ENABLED_SCOPE.globalEnabled) return false;

  // 2. ★ FRZ-EX 边界（前置）
  if (isWithinFrzEx(path, 'ACTION_EDIT').frozen) return false;

  // 3. 路径白名单
  // 4. 账户授权
  // ...
}
```

### 5.2 交互矩阵

| globalEnabled | path ∈ FRZ-EX | writeEnabled | 结果 |
|---|---|---|---|
| false | 任意 | false | 拒绝（全局禁用） |
| true | 是 | false | 拒绝（FRZ-EX） |
| true | 否 | true（若白名单匹配） | 允许 |

**关键**：FRZ-EX 优先于 globalEnabled，即使 globalEnabled=true，冻结路径仍拒绝。

---

## 6. FRZ-EX 路径管理

### 6.1 冻结路径添加

冻结路径添加须**显式部署**，不可运行时动态添加：

```typescript
// 部署时配置（代码审查 + 审计）
export const FRZ_EX_BOUNDARY = {
  frozenPaths: [
    // 既有冻结路径
    ...EXISTING_FROZEN_PATHS,
    // 新增冻结路径（须代码审查）
    '/mnt/share/writable/documents/_frozen/',
  ],
  // ...
} as const;
```

### 6.2 冻结路径移除

移除冻结路径须**安全评估 + 审计**：

| 步骤 | 操作 | 授权 |
|---|---|---|
| 1 | 评估移除影响 | 安全团队 |
| 2 | 修改 FRZ_EX_BOUNDARY | 代码审查 |
| 3 | 部署新版本 | 运维 |
| 4 | 审计日志记录 | 自动 |

### 6.3 冻结路径扫描

```bash
#!/bin/bash
# scan-frozen-paths.sh
for prefix in "${FRZ_EX_FROZEN_PATHS[@]}"; do
  if [ -d "$prefix" ]; then
    find "$prefix" -type f -print0 | while IFS= read -r -d '' f; do
      # 检查文件是否有未授权的 ACTION_EDIT 记录
      grep "ACTION_EDIT" "$AUDIT_LOG" | grep "$f" | while read line; do
        echo "FRZ-EX VIOLATION: $line" >> /mnt/share/writable/.meta/audit/frz-ex-violations.jsonl
      done
    done
  fi
done
```

---

## 7. 用户反馈设计

### 7.1 ACTION_EDIT 拒绝弹窗

```
┌─────────────────────────────────────┐
│ ⚠ 此文件已冻结，不可编辑           │
│                                     │
│ 文件: /documents/_frozen/report.docx│
│ 原因: FRZ-EX 边界保护               │
│                                     │
│ 您可以:                             │
│ • 只读查看（ACTION_VIEW）           │
│ • 复制到可写区后编辑                │
│                                     │
│ [只读打开] [复制到可写区] [取消]    │
└─────────────────────────────────────┘
```

### 7.2 复制到可写区

```typescript
export async function copyFromFrozenToWritable(
  frozenPath: string,
): Promise<string> {
  // 1. 校验源路径确实冻结
  if (!isWithinFrzEx(frozenPath, 'ACTION_EDIT').frozen) {
    throw new Error('Source not frozen');
  }

  // 2. ACTION_COPY 允许
  const copyCheck = isWithinFrzEx(frozenPath, 'ACTION_COPY');
  if (copyCheck.frozen) {
    throw new Error('Copy not allowed');
  }

  // 3. 生成可写区路径
  const writablePath = frozenPath.replace('/_frozen/', '/');

  // 4. 复制
  const srcMapping = mapLogicalToPhysical(frozenPath, 'read');
  const dstMapping = mapLogicalToPhysical(writablePath, 'write');
  await fs.copyFile(srcMapping.physicalPath, dstMapping.physicalPath);

  // 5. 审计
  await logWritebackAudit({
    action: 'COPY_FROM_FROZEN',
    from: frozenPath,
    to: writablePath,
  });

  return writablePath;
}
```

---

## 8. FRZ-EX 审计

### 8.1 审计记录

```json
{
  "timestamp": "<ISO8601>",
  "type": "FRZ_EX_VIOLATION_ATTEMPT",
  "path": "/mnt/share/writable/documents/_frozen/report.docx",
  "operation": "ACTION_EDIT",
  "account": "pad2_app",
  "sessionId": "<sid>",
  "layer": "permission_matrix",
  "reason": "FRZ_EX_BOUNDARY: path ... is frozen for ACTION_EDIT",
  "action": "DENIED"
}
```

### 8.2 审计分析

| 指标 | 说明 | 告警阈值 |
|---|---|---|
| 违规尝试次数 | 每日 ACTION_EDIT 拒绝数 | >10 次/日 |
| 违规账户 | 哪些账户尝试 | 任何 |
| 违规路径 | 哪些路径被尝试 | 任何 |
| 违规层 | 哪层拦截 | 三层都应记录 |

---

## 9. 验收标准

| 编号 | 标准 | 验证方法 |
|---|---|---|
| AC-1 | 冻结路径 ACTION_EDIT 被拒 | §4.2 证明 |
| AC-2 | 冻结路径 ACTION_DELETE 被拒 | 同上 |
| AC-3 | 冻结路径 ACTION_VIEW 允许 | §2.3 检查 |
| AC-4 | 冻结路径 ACTION_COPY 允许 | §7.2 |
| AC-5 | 三层都执行 FRZ-EX 检查 | 代码检查 |
| AC-6 | FRZ-EX 优先于 globalEnabled | §5.2 矩阵 |
| AC-7 | FRZ_EX_BOUNDARY 运行时不可变 | §4.3 证明 |
| AC-8 | 用户收到明确提示 | §7.1 弹窗 |
| AC-9 | 复制到可写区成功 | §7.2 |
| AC-10 | 审计记录违规尝试 | §8.1 |
| AC-11 | globalEnabled=true 时冻结仍拒绝 | §5.2 |
| AC-12 | 矩阵配置不影响 FRZ-EX | §4.2 步骤 1 |

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| FRZ-EX 配置遗漏 | 冻结路径未保护 | 显式部署 + 审查 |
| 三层检查不一致 | 某层绕过 | 三层独立检查 + 单测 |
| 冻结路径误判 | 正常文件不可编辑 | 路径精确匹配 + 用户反馈 |
| 配置降级攻击 | 移冻结路径 | immutable + 部署审计 |

---

## 11. 待授权事项

- [ ] **NOT AUTHORIZED**：修改 FRZ_EX_BOUNDARY 配置（待安全团队授权）
- [ ] **NOT AUTHORIZED**：移除冻结路径（待安全评估 + 审计）
- [ ] **BLOCKED / NOT AUTHORIZED**：Production Release 须完成 FRZ-EX 边界渗透测试
- 本文档仅为设计产出。

---

## 12. 追溯

| EARS 需求 | 本文档章节 |
|---|---|
| REQ-SEC-007 FRZ-EX 边界 | §2 边界定义、§3 三层强制 |
| REQ-FRZ-001 ACTION_VIEW→ACTION_EDIT NOT AUTHORIZED | §4 禁止证明 |
| REQ-FRZ-002 运行时强制 | §3 三层、§4.3 不可降级 |
| REQ-SEC-008 审计日志 | §8 审计 |
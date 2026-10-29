# WP-P3-08 ACL 与权限矩阵

> 任务编号：WP-P3-08-ACL-PERMISSION-MATRIX
> 关联 EARS 需求：REQ-SEC-001（最小权限写回）、REQ-SEC-005（权限矩阵驱动）、REQ-SEC-006（选择性放行）
> 关联 tasks.md：第 8 项 / 共 23 项
> 状态：DESIGN READY
> 上游依赖：WP-P2-01（账户）、WP-P3-06（目录）、WP-P3-07（samba 配置）
> 下游影响：WP-P4-04（状态机扩展）、WP-P4-07（FRZ-EX 边界）

---

## 1. 设计目标

定义两层权限控制矩阵：

1. **文件系统 ACL 层**：Linux POSIX ACL + 传统 Unix 权限，控制物理访问。
2. **应用层权限矩阵**：`WRITE_PERMISSION_MATRIX` + `WRITE_ENABLED_SCOPE`，控制业务级写回放行。

两层叠加形成**默认拒绝 + 显式放行**的最小权限模型。

---

## 2. 文件系统 ACL 矩阵

### 2.1 物理路径 × 账户 × 操作

| 路径 | 账户 | 读 | 写 | 执行/遍历 | ACL 来源 |
|---|---|---|---|---|---|
| `/mnt/share/` | debian | ✅ | ✅ (1) | ✅ | owner (0775) |
| `/mnt/share/` | pad2_app | ✅ | ❌ | ✅ | other rx (0775) |
| `/mnt/share/` | winuser | ✅ | ❌ | ✅ | other rx (0775) |
| `/mnt/share/` | 其他 | ✅ | ❌ | ✅ | other rx (0775) |
| `/mnt/share/writable/` | debian | ✅ | ❌ | ✅ | setfacl u:debian:rx |
| `/mnt/share/writable/` | pad2_app | ✅ | ✅ | ✅ | owner (0750) |
| `/mnt/share/writable/` | pad2_app_group 成员 | ✅ | ✅ | ✅ | group (0750) |
| `/mnt/share/writable/` | winuser | ❌ | ❌ | ❌ | other 无 (0750) |
| `/mnt/share/writable/` | 其他 | ❌ | ❌ | ❌ | other 无 (0750) |
| `/mnt/share/writable/documents/` | debian | ✅ | ❌ | ✅ | 继承父 ACL |
| `/mnt/share/writable/documents/` | pad2_app | ✅ | ✅ | ✅ | owner |
| `/mnt/share/writable/documents/*` | pad2_app | ✅ | ✅ | - | owner (0640) |
| `/mnt/share/writable/sessions/<sid>/` | pad2_app | ✅ | ✅ | ✅ | owner |
| `/mnt/share/writable/.meta/` | debian | ❌ | ❌ | ❌ | veto files (SMB) + ACL |
| `/mnt/share/writable/.meta/` | pad2_app | ✅ | ✅ | ✅ | owner |

**(1)** debian 对 `/mnt/share/` 有写权限（owner），但 SMB 层 `read only = yes` 阻止 SMB 写入。本地 shell 写入仍可能，须由运维审计保证 debian 不直接 shell 写入。

### 2.2 ACL 设置命令

```bash
# /mnt/share/writable/ 基础 ACL
setfacl -m u:pad2_app:rwx /mnt/share/writable
setfacl -m g:pad2_app_group:rwx /mnt/share/writable
setfacl -m u:debian:rx /mnt/share/writable     # 审计遍历
setfacl -m o::--- /mnt/share/writable           # other 无权限

# 默认 ACL（新建子目录/文件继承）
setfacl -d -m u:pad2_app:rwx /mnt/share/writable
setfacl -d -m g:pad2_app_group:rwx /mnt/share/writable
setfacl -d -m u:debian:rx /mnt/share/writable
setfacl -d -m o::--- /mnt/share/writable

# .meta/ 特殊：禁止 debian 遍历
setfacl -m u:debian:--- /mnt/share/writable/.meta
setfacl -d -m u:debian:--- /mnt/share/writable/.meta
```

### 2.3 ACL 继承策略

| 父目录 | 新建对象 | 继承 ACL | mode |
|---|---|---|---|
| `writable/documents/` | 文件 | pad2_app:rw, pad2_app_group:rw, debian:r, other:无 | 0640 |
| `writable/documents/` | 子目录 | pad2_app:rwx, pad2_app_group:rwx, debian:rx, other:无 | 0750 |
| `writable/sessions/<sid>/` | 临时文件 | 同上 | 0640 |
| `writable/.meta/` | 元数据文件 | pad2_app:rw, pad2_app_group:rw, debian:无, other:无 | 0640 |

---

## 3. 应用层权限矩阵

### 3.1 WRITE_ENABLED_SCOPE（来自 design.md）

```typescript
export const WRITE_ENABLED_SCOPE = {
  // 全局开关：false 时所有写回被拒（等价 AU-005）
  globalEnabled: true,

  // 账户白名单：仅 pad2_app 可触发写回
  authorizedAccounts: ['pad2_app'],

  // 路径白名单前缀
  writablePathPrefixes: [
    '/mnt/share/writable/documents/',
  ],

  // 操作白名单
  allowedOperations: [
    'CREATE_DOCUMENT',
    'UPDATE_DOCUMENT',
    'DELETE_OWN_DOCUMENT',
  ],

  // 显式禁止操作（即使 globalEnabled=true 也拒绝）
  forbiddenOperations: [
    'DELETE_OTHERS_DOCUMENT',   // 不允许删他人文档
    'BULK_DELETE',              // 不允许批量删
    'DIRECTORY_TRAVERSAL_WRITE', // 不允许目录穿越写
  ],
} as const;
```

### 3.2 WRITE_PERMISSION_MATRIX（来自 design.md）

```typescript
export const WRITE_PERMISSION_MATRIX = {
  // 路径模式 → 允许的操作列表
  entries: [
    {
      pathPattern: '/mnt/share/writable/documents/*.docx',
      allowedOps: ['CREATE_DOCUMENT', 'UPDATE_DOCUMENT', 'DELETE_OWN_DOCUMENT'],
      ownerOnly: true,  // DELETE 仅限 owner
    },
    {
      pathPattern: '/mnt/share/writable/documents/*.xlsx',
      allowedOps: ['CREATE_DOCUMENT', 'UPDATE_DOCUMENT', 'DELETE_OWN_DOCUMENT'],
      ownerOnly: true,
    },
    {
      pathPattern: '/mnt/share/writable/documents/*.pptx',
      allowedOps: ['CREATE_DOCUMENT', 'UPDATE_DOCUMENT', 'DELETE_OWN_DOCUMENT'],
      ownerOnly: true,
    },
    {
      pathPattern: '/mnt/share/writable/sessions/*/*',
      allowedOps: ['CREATE_TEMP', 'UPDATE_TEMP', 'DELETE_TEMP'],
      ownerOnly: true,
      sessionScoped: true,  // 仅会话属主可操作
    },
  ],

  // 默认策略：未匹配任何 entry 的路径
  defaultPolicy: 'DENY' as const,
} as const;
```

### 3.3 矩阵评估流程

```typescript
export function evaluateWritePermission(
  account: string,
  absPath: string,
  operation: string,
  sessionId?: string,
): { allowed: boolean; reason: string } {

  // 1. 全局开关
  if (!WRITE_ENABLED_SCOPE.globalEnabled) {
    return { allowed: false, reason: 'GLOBAL_DISABLED' };
  }

  // 2. 账户白名单
  if (!WRITE_ENABLED_SCOPE.authorizedAccounts.includes(account)) {
    return { allowed: false, reason: 'ACCOUNT_NOT_AUTHORIZED' };
  }

  // 3. 显式禁止操作
  if (WRITE_ENABLED_SCOPE.forbiddenOperations.includes(operation)) {
    return { allowed: false, reason: 'OPERATION_FORBIDDEN' };
  }

  // 4. 路径白名单前缀
  const inWritableScope = WRITE_ENABLED_SCOPE.writablePathPrefixes.some(
    prefix => absPath.startsWith(prefix),
  );
  if (!inWritableScope) {
    return { allowed: false, reason: 'PATH_OUTSIDE_WRITABLE_SCOPE' };
  }

  // 5. 权限矩阵匹配
  const matchedEntry = WRITE_PERMISSION_MATRIX.entries.find(
    e => matchPattern(e.pathPattern, absPath) && e.allowedOps.includes(operation),
  );
  if (!matchedEntry) {
    return { allowed: false, reason: 'NO_MATRIX_ENTRY_MATCHED' };
  }

  // 6. ownerOnly 校验（需运行时查文件 owner）
  if (matchedEntry.ownerOnly && operation.startsWith('DELETE')) {
    const fileOwner = await getFileOwner(absPath);
    if (fileOwner !== account) {
      return { allowed: false, reason: 'NOT_FILE_OWNER' };
    }
  }

  // 7. sessionScoped 校验
  if (matchedEntry.sessionScoped && sessionId) {
    const sessionOwner = await getSessionOwner(sessionId);
    if (sessionOwner !== account) {
      return { allowed: false, reason: 'NOT_SESSION_OWNER' };
    }
  }

  return { allowed: true, reason: 'ALLOWED_BY_MATRIX' };
}
```

---

## 4. 双层权限叠加模型

### 4.1 决策流程

```
写回请求 (account, path, op)
        │
        ▼
┌─────────────────────────┐
│ 应用层权限矩阵评估       │  ← WRITE_PERMISSION_MATRIX
│ (evaluateWritePermission) │
└─────────────────────────┘
        │
   allowed=false → 拒绝（返回 403）
        │ allowed=true
        ▼
┌─────────────────────────┐
│ 路径规范化与符号链接检测  │  ← WP-P3-09
│ (normalizeAndValidatePath)│
└─────────────────────────┘
        │
   invalid → 拒绝（返回 400）
        │ valid
        ▼
┌─────────────────────────┐
│ SMB/文件系统 ACL 校验     │  ← 物理权限
│ (内核级强制)              │
└─────────────────────────┘
        │
   denied → 拒绝（返回 403）
        │ allowed
        ▼
    执行写回
```

### 4.2 层间关系

| 层 | 失败时 | 可否被上层覆盖 |
|---|---|---|
| 应用层矩阵 | 返回 403，不触达物理层 | 否（最前置） |
| 路径校验 | 返回 400，不触达物理层 | 否 |
| SMB/ACL | 内核拒绝，返回 EACCES | 否（最后置，最强） |

**关键**：应用层矩阵是**业务级放行**，SMB/ACL 是**物理级兜底**。即使应用层 bug 误放行，ACL 仍拒绝越权访问。

---

## 5. FRZ-EX 边界与矩阵交互

### 5.1 FRZ-EX ACTION_VIEW → ACTION_EDIT

| 操作 | 矩阵评估 | 结果 |
|---|---|---|
| ACTION_VIEW（只读路径） | 不经过写矩阵（只读） | 允许 |
| ACTION_EDIT（只读路径） | 路径不在 writablePathPrefixes | **NOT AUTHORIZED** |
| ACTION_EDIT（writable 路径） | 矩阵评估通过 | 允许（设计意图） |
| ACTION_EDIT（FRZ-EX 标记路径） | FRZ-EX 边界拦截（WP-P4-07） | **NOT AUTHORIZED** |

### 5.2 FRZ-EX 边界定义

```typescript
export const FRZ_EX_BOUNDARY = {
  // 这些路径即使落在 writable/ 下也禁止 ACTION_EDIT
  frozenPaths: [
    '/mnt/share/writable/documents/_frozen/',  // 冻结区
  ],
  // 这些操作永远禁止
  frozenOperations: [
    'ACTION_EDIT',   // FRZ-EX 不允许编辑
    'ACTION_DELETE', // FRZ-EX 不允许删除
  ],
  // 边界检查函数
  isWithinFrzEx: (path: string, op: string): boolean => {
    return FRZ_EX_BOUNDARY.frozenPaths.some(p => path.startsWith(p))
      && FRZ_EX_BOUNDARY.frozenOperations.includes(op);
  },
} as const;
```

---

## 6. 权限审计日志

每次权限评估须记录：

```json
{
  "timestamp": "<ISO8601>",
  "requestId": "<uuid>",
  "account": "pad2_app",
  "path": "/mnt/share/writable/documents/report.docx",
  "operation": "UPDATE_DOCUMENT",
  "sessionId": "<sid>",
  "decision": "ALLOWED_BY_MATRIX",
  "matrixEntryMatched": "/mnt/share/writable/documents/*.docx",
  "aclCheckPassed": true,
  "frzExChecked": false
}
```

日志写入 `/mnt/share/writable/.meta/audit/<date>.jsonl`，仅 pad2_app 可写，debian 不可读（ACL §2.2）。

---

## 7. 验收标准

| 编号 | 标准 | 验证方法 |
|---|---|---|
| AC-1 | pad2_app 对 documents/ 下 .docx 写回通过 | 矩阵评估返回 allowed=true |
| AC-2 | pad2_app 对 /mnt/share/ 根下写回拒绝 | PATH_OUTSIDE_WRITABLE_SCOPE |
| AC-3 | debian 对 writable/ 写回拒绝 | ACCOUNT_NOT_AUTHORIZED |
| AC-4 | winuser 对 writable/ 访问拒绝 | ACCOUNT_NOT_AUTHORIZED + ACL 拒绝 |
| AC-5 | DELETE_OTHERS_DOCUMENT 操作拒绝 | OPERATION_FORBIDDEN |
| AC-6 | BULK_DELETE 操作拒绝 | OPERATION_FORBIDDEN |
| AC-7 | FRZ-EX 路径 ACTION_EDIT 拒绝 | FRZ-EX 边界 |
| AC-8 | globalEnabled=false 时所有写回拒绝 | GLOBAL_DISABLED |
| AC-9 | ACL other 位无权限 | getfacl 显示 o::--- |
| AC-10 | 新建文件自动继承 ACL | 创建后 getfacl 校验 |
| AC-11 | .meta/ 对 debian 不可访问 | getfacl + SMB veto |
| AC-12 | 审计日志每次评估一条记录 | 日志计数 |

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 矩阵配置错误导致越权 | 数据泄露/损坏 | 双层兜底（ACL）+ 审计 |
| ACL 继承失效 | 新文件权限过宽 | create mask 强制 + 创建后校验 |
| FRZ-EX 边界遗漏 | 冻结文件被编辑 | WP-P4-07 运行时控制 + 单测 |
| 矩阵评估性能开销 | 写回延迟 | 矩阵常驻内存 + 路径前缀哈希 |

---

## 9. 待授权事项

- [ ] **NOT AUTHORIZED**：设置 `setfacl`（待运维授权）
- [ ] **NOT AUTHORIZED**：修改 `WRITE_ENABLED_SCOPE.globalEnabled`（待安全团队授权）
- 本文档仅为设计产出。

---

## 10. 追溯

| EARS 需求 | 本文档章节 |
|---|---|
| REQ-SEC-001 最小权限写回 | §3 应用层矩阵、§4 双层模型 |
| REQ-SEC-005 权限矩阵驱动 | §3.2 WRITE_PERMISSION_MATRIX |
| REQ-SEC-006 选择性放行 | §3.3 评估流程 |
| REQ-SEC-007 FRZ-EX 边界 | §5 FRZ-EX 交互 |
| REQ-SEC-008 审计日志 | §6 审计日志 |
# WP-P4-13 路径映射设计

> 任务编号：WP-P4-13-PATH-MAPPING-DESIGN
> 关联 EARS 需求：REQ-WPS-006（路径映射）、REQ-SEC-003（路径边界）、REQ-OPS-016（双 section 路由）
> 关联 tasks.md：第 13 项 / 共 23 项
> 状态：DESIGN READY
> 上游依赖：WP-P3-06（目录）、WP-P3-07（samba 双 section）、WP-P3-09（路径防御）、WP-P4-12（WPS 行为）
> 下游影响：WP-P4-04（状态机）、WP-P4-05（防御兼容）

---

## 1. 设计目标

设计应用层**路径映射层**，在 WPS 逻辑路径与 SMB 物理路径间建立双向映射：

1. **只读访问**：WPS 逻辑路径 → [share] section → /mnt/share/<path>
2. **写回访问**：WPS 逻辑路径 → [writable] section → /mnt/share/writable/<path>
3. **自动路由**：根据操作类型（读/写）和路径白名单自动选择 section。
4. **一致性**：同一文档在只读和可写视图间映射时不产生歧义。

---

## 2. 路径命名空间

### 2.1 三层路径模型

| 层 | 命名空间 | 示例 | 说明 |
|---|---|---|---|
| WPS 逻辑路径 | `/documents/report.docx` | WPS 内部路径 | 用户视角 |
| SMB URL | `//host/share/documents/report.docx` 或 `//host/writable/documents/report.docx` | SMB 协议路径 | 网络视角 |
| 物理路径 | `/mnt/share/documents/report.docx` 或 `/mnt/share/writable/documents/report.docx` | 文件系统路径 | 内核视角 |

### 2.2 路径前缀映射

| WPS 逻辑前缀 | 操作 | SMB section | 物理前缀 |
|---|---|---|---|
| `/documents/` | 读 | [share] | `/mnt/share/documents/` |
| `/documents/` | 写 | [writable] | `/mnt/share/writable/documents/` |
| `/writable/documents/` | 读/写 | [writable] | `/mnt/share/writable/documents/` |
| `/`（其他） | 读 | [share] | `/mnt/share/` |
| `/`（其他） | 写 | 拒绝 | - |

**关键**：同一逻辑路径 `/documents/report.docx` 根据操作类型映射到不同物理路径。读时走只读副本，写时走可写副本。

### 2.3 文档双副本策略

| 策略 | 描述 | 选用 |
|---|---|---|
| A. 单副本 + 双 section | 同一物理文件通过两个 section 暴露 | ❌ [share] read only 会覆盖 [writable] 写权限 |
| B. 双副本 | 只读副本在 /mnt/share/documents/，可写副本在 /mnt/share/writable/documents/ | ✅ |
| C. 硬链接双副本 | 两个路径硬链接同一 inode | ❌ 权限互斥困难 |

**选用策略 B**：文档在两个目录各存一份。写回时更新 writable 副本，只读副本保持不变（或异步同步）。

### 2.4 副本同步策略

| 场景 | 同步方向 | 时机 |
|---|---|---|
| 首次写回 | 只读 → 可写 | 写回前复制 |
| 后续读 | 可写 → 只读 | 不同步（只读副本保持旧版本） |
| 版本查询 | 两副本都读 | 用户选择版本 |
| 回滚 | 删除可写副本 | 恢复只读副本为权威 |

**设计决策**：只读副本是**历史快照**，可写副本是**工作副本**。用户显式"发布"才同步可写→只读（须授权，不在 AU-006 范围）。

---

## 3. 路径映射函数

### 3.1 逻辑→物理映射

```typescript
export interface PathMappingResult {
  physicalPath: string;
  smbSection: 'share' | 'writable';
  smbUrl: string;
  accessMode: 'read' | 'write';
  isWritableCopy: boolean;
}

export function mapLogicalToPhysical(
  logicalPath: string,
  operation: 'read' | 'write',
): PathMappingResult {
  // 1. 规范化逻辑路径
  const normalized = normalizeAndValidatePath(logicalPath, { allowAbsolute: true });

  // 2. 确定访问模式与 section
  const isWriteOp = operation === 'write';
  const isWithinWritable = normalized.startsWith('/writable/');
  const isDocumentsPath = normalized.startsWith('/documents/');

  // 3. 路由决策
  if (isWriteOp) {
    // 写操作：必须映射到 [writable]
    if (isWithinWritable) {
      // /writable/documents/x → /mnt/share/writable/documents/x
      return {
        physicalPath: '/mnt/share' + normalized,
        smbSection: 'writable',
        smbUrl: `//host/writable${normalized.slice('/writable'.length)}`,
        accessMode: 'write',
        isWritableCopy: true,
      };
    } else if (isDocumentsPath) {
      // /documents/x (write) → /mnt/share/writable/documents/x
      return {
        physicalPath: '/mnt/share/writable' + normalized,
        smbSection: 'writable',
        smbUrl: `//host/writable${normalized}`,
        accessMode: 'write',
        isWritableCopy: true,
      };
    } else {
      // 其他路径写 → 拒绝
      throw new PathMappingError('WRITE_OUTSIDE_WRITABLE_SCOPE');
    }
  } else {
    // 读操作：优先 [share]，writable/ 前缀走 [writable]
    if (isWithinWritable) {
      return {
        physicalPath: '/mnt/share' + normalized,
        smbSection: 'writable',
        smbUrl: `//host/writable${normalized.slice('/writable'.length)}`,
        accessMode: 'read',
        isWritableCopy: true,
      };
    } else {
      // 普通读 → [share]
      return {
        physicalPath: '/mnt/share' + normalized,
        smbSection: 'share',
        smbUrl: `//host/share${normalized}`,
        accessMode: 'read',
        isWritableCopy: false,
      };
    }
  }
}
```

### 3.2 物理→逻辑映射（反向）

```typescript
export function mapPhysicalToLogical(
  physicalPath: string,
): { logicalPath: string; isWritableCopy: boolean } {
  const normalized = normalizeAndValidatePath(physicalPath, { allowAbsolute: true });

  if (normalized.startsWith('/mnt/share/writable/')) {
    // /mnt/share/writable/documents/x → /documents/x
    const subPath = normalized.slice('/mnt/share/writable'.length);
    return {
      logicalPath: subPath,
      isWritableCopy: true,
    };
  } else if (normalized.startsWith('/mnt/share/')) {
    // /mnt/share/documents/x → /documents/x
    const subPath = normalized.slice('/mnt/share'.length);
    return {
      logicalPath: subPath,
      isWritableCopy: false,
    };
  } else {
    throw new PathMappingError('PHYSICAL_PATH_OUTSIDE_SHARE');
  }
}
```

### 3.3 映射表

| 逻辑路径 | 操作 | 物理路径 | SMB URL | section |
|---|---|---|---|---|
| `/documents/report.docx` | read | `/mnt/share/documents/report.docx` | `//host/share/documents/report.docx` | [share] |
| `/documents/report.docx` | write | `/mnt/share/writable/documents/report.docx` | `//host/writable/documents/report.docx` | [writable] |
| `/writable/documents/report.docx` | read | `/mnt/share/writable/documents/report.docx` | `//host/writable/documents/report.docx` | [writable] |
| `/writable/documents/report.docx` | write | `/mnt/share/writable/documents/report.docx` | `//host/writable/documents/report.docx` | [writable] |
| `/images/logo.png` | read | `/mnt/share/images/logo.png` | `//host/share/images/logo.png` | [share] |
| `/images/logo.png` | write | (拒绝) | - | - |

---

## 4. 副本初始化

### 4.1 首次写回时复制

```typescript
export async function ensureWritableCopy(
  logicalPath: string,
): Promise<string> {
  const readMapping = mapLogicalToPhysical(logicalPath, 'read');
  const writeMapping = mapLogicalToPhysical(logicalPath, 'write');

  // 1. 检查可写副本是否已存在
  try {
    await fs.access(writeMapping.physicalPath);
    return writeMapping.physicalPath;  // 已存在
  } catch {
    // 不存在，继续复制
  }

  // 2. 路径防御
  await assertWithinWritableScope(writeMapping.physicalPath);
  const symlinkCheck = await detectSymlink(writeMapping.physicalPath);
  if (!symlinkCheck.safe) {
    throw new SymlinkAttackError(symlinkCheck);
  }

  // 3. 复制只读副本到可写区
  await fs.copyFile(readMapping.physicalPath, writeMapping.physicalPath, fs.constants.COPYFILE_EXCL);

  // 4. 校验 owner/mode
  const stats = await fs.stat(writeMapping.physicalPath);
  assert(stats.uid === PAD2_APP_UID, 'OWNER_MISMATCH');
  assert((stats.mode & 0o777) === 0o640, 'MODE_MISMATCH');

  // 5. 记录审计
  await logWritebackAudit({
    action: 'COPY_TO_WRITABLE',
    from: readMapping.physicalPath,
    to: writeMapping.physicalPath,
  });

  return writeMapping.physicalPath;
}
```

### 4.2 复制时机

| 场景 | 复制 | 说明 |
|---|---|---|
| 首次写回 | ✅ | 只读→可写 |
| 后续写回 | ❌ | 可写副本已存在 |
| 只读打开 | ❌ | 直接读只读副本 |
| SaveAs 到新路径 | ✅ | 创建新可写副本 |

---

## 5. 路径映射与状态机交互

### 5.1 打开流程路径决策

```
用户打开 /documents/report.docx
    │
    ├─ 1. mapLogicalToPhysical(path, 'read') → [share] 只读
    ├─ 2. 通过 [share] 打开只读副本
    ├─ 3. editSessionStore: idle → opening → opened
    └─ 4. READ_ONLY_MODE=true（AU-005 守卫保留）
```

### 5.2 保存流程路径决策

```
用户保存 /documents/report.docx
    │
    ├─ 1. 检查 WRITE_ENABLED_SCOPE.globalEnabled
    ├─ 2. mapLogicalToPhysical(path, 'write') → [writable] 可写
    ├─ 3. ensureWritableCopy(path) → 复制到可写区（若不存在）
    ├─ 4. evaluateWritePermission(pad2_app, writePath, 'UPDATE_DOCUMENT')
    ├─ 5. detectSymlink(writePath)
    ├─ 6. 通过 [writable] 写回可写副本
    ├─ 7. editSessionStore: opened → write_pending → write_completed
    └─ 8. 审计日志
```

### 5.3 SaveAs 流程路径决策

```
用户 SaveAs /documents/new.docx
    │
    ├─ 1. mapLogicalToPhysical(newPath, 'write') → [writable]
    ├─ 2. evaluateWritePermission(pad2_app, writeNewPath, 'CREATE_DOCUMENT')
    ├─ 3. 通过 [writable] 创建新文件
    └─ 4. editSessionStore: opened → write_pending → write_completed
```

---

## 6. 路径映射缓存

### 6.1 缓存设计

```typescript
export class PathMappingCache {
  private cache = new Map<string, PathMappingResult>();

  get(logicalPath: string, operation: 'read' | 'write'): PathMappingResult | undefined {
    const key = `${operation}:${logicalPath}`;
    return this.cache.get(key);
  }

  set(logicalPath: string, operation: 'read' | 'write', result: PathMappingResult): void {
    const key = `${operation}:${logicalPath}`;
    this.cache.set(key, result);
  }

  invalidate(logicalPath: string): void {
    for (const key of this.cache.keys()) {
      if (key.endsWith(`:${logicalPath}`)) {
        this.cache.delete(key);
      }
    }
  }
}
```

### 6.2 缓存失效条件

| 条件 | 失效 |
|---|---|
| 文件删除 | ✅ |
| 文件 rename | ✅ |
| 会话结束 | ✅ 全清 |
| 配置变更 | ✅ 全清 |
| 路径防御检测 | ✅ 逐条 |

---

## 7. 边界情况

### 7.1 路径不存在

| 场景 | 映射结果 | 处理 |
|---|---|---|
| 只读副本不存在 | mapLogicalToPhysical 成功 | 打开时 ENOENT |
| 可写副本不存在（首次写） | mapLogicalToPhysical 成功 | ensureWritableCopy 复制 |
| 两副本都不存在 | mapLogicalToPhysical 成功 | 创建新文件（CREATE_DOCUMENT） |

### 7.2 路径冲突

| 场景 | 处理 |
|---|---|
| 只读副本与可写副本内容不一致 | 可写副本为权威（写回后） |
| 同一逻辑路径并发写 | 锁文件串行化 |
| 跨 section rename | 拒绝（不支持跨 section 移动） |

### 7.3 路径长度

| 层 | 限制 | 校验 |
|---|---|---|
| WPS 逻辑路径 | 260（Windows SMB） | normalizeAndValidatePath 步骤 10 |
| SMB URL | 260 | 同上 |
| 物理路径 | 4096（Linux） | 同上 |
| 可写物理路径 | /mnt/share/writable/ 前缀 + 逻辑路径 | 前缀长度 + 逻辑长度 ≤ 4096 |

---

## 8. 验收标准

| 编号 | 标准 | 验证方法 |
|---|---|---|
| AC-1 | 只读操作映射到 [share] | mapLogicalToPhysical 返回 section=share |
| AC-2 | 写操作映射到 [writable] | 返回 section=writable |
| AC-3 | /writable/ 前缀读映射到 [writable] | 返回 section=writable |
| AC-4 | 非白名单路径写拒绝 | WRITE_OUTSIDE_WRITABLE_SCOPE |
| AC-5 | 首次写回复制只读副本 | ensureWritableCopy 成功 |
| AC-6 | 后续写回不重复复制 | 二次调用跳过 |
| AC-7 | 复制后 owner=pad2_app mode=0640 | stat 校验 |
| AC-8 | 反向映射正确 | mapPhysicalToLogical 还原 |
| AC-9 | 缓存命中正确 | 缓存测试 |
| AC-10 | 缓存失效正确 | 失效后重新映射 |
| AC-11 | 路径长度限制生效 | 超长拒绝 |
| AC-12 | 跨 section rename 拒绝 | 错误抛出 |

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 双副本不一致 | 数据混乱 | 可写副本为权威 + 版本号 |
| 复制失败 | 写回失败 | 错误处理 + 重试 |
| 路径映射 bug | 越权 | 双层兜底（ACL） |
| 缓存过期 | 映射错误 | 主动失效机制 |

---

## 10. 待授权事项

- [ ] **NOT AUTHORIZED**：在测试环境验证路径映射（待测试授权）
- 本文档仅为设计产出。

---

## 11. 追溯

| EARS 需求 | 本文档章节 |
|---|---|
| REQ-WPS-006 路径映射 | §3 映射函数 |
| REQ-SEC-003 路径边界 | §3.1 路由决策 |
| REQ-OPS-016 双 section 路由 | §3 映射表 |
| REQ-WPS-001 WPS 写回兼容 | §5 状态机交互 |
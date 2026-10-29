# WP-P4-17 SaveAs 临时文件覆盖失败设计

> 任务编号：WP-P4-17-SAVEAS-TEMP-OVERWRITE-FAILURE-DESIGN
> 关联 EARS 需求：REQ-WPS-003（SaveAs 行为）、REQ-WPS-002（临时文件处理）、REQ-ERR-001（错误处理）
> 关联 tasks.md：第 17 项 / 共 23 项
> 状态：DESIGN READY
> 上游依赖：WP-P4-12（WPS 行为）、WP-P4-13（路径映射）、WP-P4-14（状态机）
> 下游影响：WP-P5-19（威胁分析）

---

## 1. 设计目标

设计 SaveAs 到只读路径或临时文件覆盖失败时的**优雅降级**流程：

1. **明确失败场景**：SaveAs 到 /mnt/share/ 只读区、临时文件已存在、权限不足等。
2. **用户友好错误**：WPS 弹窗引导用户选择可写路径。
3. **状态机正确转移**：失败后状态机恢复至 opened 态。
4. **无数据丢失**：失败时原文件与编辑内容保留。
5. **审计记录**：失败事件记录以供分析。

---

## 2. 失败场景清单

### 2.1 场景分类

| 场景 | 触发 | 错误码 | 严重 |
|---|---|---|---|
| F1. SaveAs 到只读区 | newPath 在 /mnt/share/ 非 writable/ | EACCES | 中 |
| F2. 临时文件已存在 | WPS 临时文件残留 | EEXIST | 低 |
| F3. 权限不足 | pad2_app 无写权限 | EACCES | 中 |
| F4. 磁盘已满 | ENOSPC | ENOSPC | 高 |
| F5. 路径过长 | ENAMETOOLONG | ENAMETOOLONG | 低 |
| F6. 网络中断 | ETIMEDOUT/ECONNRESET | 网络 | 中 |
| F7. 符号链接检测 | detectSymlink 拒绝 | EACCES | 高 |
| F8. 路径穿越检测 | normalizeAndValidatePath 拒绝 | EINVAL | 高 |
| F9. FRZ-EX 边界 | FRZ-EX 路径 ACTION_EDIT | EACCES | 高 |

### 2.2 失败时机

| 时机 | 可失败场景 |
|---|---|
| SaveAs 前（路径校验） | F1, F5, F7, F8, F9 |
| SaveAs 中（文件创建） | F2, F3, F4 |
| SaveAs 中（网络） | F6 |
| SaveAs 后（清理） | F2（临时文件清理） |

---

## 3. SaveAs 失败处理流程

### 3.1 总体流程

```
WPS SaveAs(newPath)
    │
    ▼
┌─────────────────────────────┐
│ 1. 路径校验（应用层）         │
│    normalizeAndValidatePath  │
│    assertWithinWritableScope │
│    detectSymlink             │
│    FRZ-EX 边界检查            │
└─────────────────────────────┘
    │ 失败 → 返回错误 + 弹窗
    │ 通过
    ▼
┌─────────────────────────────┐
│ 2. 权限评估（矩阵）           │
│    evaluateWritePermission   │
└─────────────────────────────┘
    │ 失败 → 返回 403 + 弹窗
    │ 通过
    ▼
┌─────────────────────────────┐
│ 3. 状态机转移                 │
│    opened → write_pending    │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 4. 执行 SaveAs（SMB/FS）      │
│    create + write + fsync    │
└─────────────────────────────┘
    │ 失败 → 错误处理 + 状态恢复
    │ 成功
    ▼
┌─────────────────────────────┐
│ 5. 状态机转移                 │
│    write_pending → write_completed │
└─────────────────────────────┘
    │
    ▼
  SaveAs 成功
```

### 3.2 失败处理代码

```typescript
export async function saveAsDocument(
  session: EditSession,
  newPath: string,
  content: Buffer,
): Promise<{ success: boolean; error?: SaveAsError }> {
  try {
    // 1. 路径校验
    const normalized = normalizeAndValidatePath(newPath, { allowAbsolute: true });
    assertWithinWritableScope(normalized);
    const symlinkCheck = await detectSymlink(normalized);
    if (!symlinkCheck.safe) {
      throw new SaveAsError('SYMLINK_DETECTED', normalized);
    }
    if (FRZ_EX_BOUNDARY.isWithinFrzEx(normalized, 'ACTION_EDIT')) {
      throw new SaveAsError('FRZ_EX_BOUNDARY', normalized);
    }

    // 2. 权限评估
    const perm = evaluateWritePermission(currentAccount, normalized, 'CREATE_DOCUMENT');
    if (!perm.allowed) {
      throw new SaveAsError('PERMISSION_DENIED', normalized, perm.reason);
    }

    // 3. 状态机转移
    session = transition(session, 'beginWrite', { path: normalized });

    // 4. 执行 SaveAs
    const mapping = mapLogicalToPhysical(normalized, 'write');
    await fs.writeFile(mapping.physicalPath, content, { flag: 'wx', mode: 0o640 });

    // 5. 状态机转移
    session = transition(session, 'writeSuccess');

    await logWritebackAudit({
      action: 'SAVEAS_SUCCESS',
      path: mapping.physicalPath,
      sessionId: session.sessionId,
    });

    return { success: true };

  } catch (err) {
    // 失败处理
    return handleSaveAsFailure(session, newPath, err);
  }
}
```

### 3.3 失败处理函数

```typescript
async function handleSaveAsFailure(
  session: EditSession,
  newPath: string,
  err: Error,
): Promise<{ success: boolean; error: SaveAsError }> {
  const saveAsError = classifyError(err, newPath);

  // 状态机恢复
  if (session.state === 'write_pending') {
    session = transition(session, 'writeFailure');
    // write_pending → session_invalid 或 → opened（可重试）
  }

  // 审计记录
  await logWritebackAudit({
    action: 'SAVEAS_FAILURE',
    path: newPath,
    error: saveAsError.type,
    sessionId: session.sessionId,
  });

  // 用户提示
  showSaveAsErrorDialog(saveAsError);

  return { success: false, error: saveAsError };
}
```

---

## 4. 错误分类与用户提示

### 4.1 错误分类

```typescript
function classifyError(err: Error, path: string): SaveAsError {
  if (err instanceof PathValidationError) {
    switch (err.code) {
      case 'PATH_TRAVERSAL_DETECTED': return { type: 'PATH_TRAVERSAL', path, severity: 'HIGH' };
      case 'PATH_OUTSIDE_WRITABLE_SCOPE': return { type: 'READONLY_PATH', path, severity: 'MEDIUM' };
      case 'PATH_IN_FORBIDDEN_ZONE': return { type: 'FORBIDDEN_PATH', path, severity: 'HIGH' };
      case 'PATH_TOO_LONG': return { type: 'PATH_TOO_LONG', path, severity: 'LOW' };
      default: return { type: 'INVALID_PATH', path, severity: 'MEDIUM' };
    }
  }
  if (err instanceof SymlinkAttackError) return { type: 'SYMLINK_DETECTED', path, severity: 'HIGH' };
  if (err.code === 'EEXIST') return { type: 'FILE_EXISTS', path, severity: 'LOW' };
  if (err.code === 'EACCES') return { type: 'PERMISSION_DENIED', path, severity: 'MEDIUM' };
  if (err.code === 'ENOSPC') return { type: 'DISK_FULL', path, severity: 'HIGH' };
  if (err.code === 'ENAMETOOLONG') return { type: 'PATH_TOO_LONG', path, severity: 'LOW' };
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET') return { type: 'NETWORK_ERROR', path, severity: 'MEDIUM' };
  return { type: 'UNKNOWN', path, severity: 'MEDIUM' };
}
```

### 4.2 用户提示弹窗

| 错误类型 | 弹窗内容 | 用户操作 |
|---|---|---|
| READONLY_PATH | "目标路径为只读，请选择可写路径" | [选择可写路径] [取消] |
| FILE_EXISTS | "文件已存在，是否覆盖？" | [覆盖] [另选] [取消] |
| PERMISSION_DENIED | "没有权限保存到此位置" | [选择其他位置] [取消] |
| DISK_FULL | "磁盘空间不足" | [清理空间] [取消] |
| PATH_TOO_LONG | "路径过长，请缩短文件名" | [重命名] [取消] |
| NETWORK_ERROR | "网络中断，正在重试..." | [等待] [本地保存] |
| SYMLINK_DETECTED | "安全检测失败：检测到符号链接" | [报告] [取消] |
| PATH_TRAVERSAL | "安全检测失败：非法路径" | [报告] [取消] |
| FRZ_EX_BOUNDARY | "此文件已冻结，不可编辑" | [取消] |
| FORBIDDEN_PATH | "禁止访问此路径" | [取消] |

### 4.3 引导用户选择可写路径

```typescript
function showSaveAsErrorDialog(error: SaveAsError): void {
  if (error.type === 'READONLY_PATH') {
    showDialog({
      title: '路径为只读',
      message: `目标路径 ${error.path} 为只读区域。\n请选择可写路径（如 /writable/documents/）`,
      buttons: [
        {
          text: '选择可写路径',
          action: () => openSaveAsDialog({ defaultPath: '/writable/documents/' }),
        },
        { text: '取消', action: () => {} },
      ],
    });
  }
  // ... 其他错误类型
}
```

---

## 5. 临时文件覆盖失败处理

### 5.1 临时文件冲突场景

| 场景 | 触发 | 处理 |
|---|---|---|
| WPS 临时文件残留 | 上次保存崩溃 | 清理后重试 |
| 锁文件冲突 | 文件被占用 | 提示用户 |
| 临时文件权限不足 | ACL 变更 | 重新评估权限 |

### 5.2 临时文件清理重试

```typescript
export async function saveWithTempRetry(
  physicalPath: string,
  content: Buffer,
  maxRetries = 3,
): Promise<void> {
  const tempPath = physicalPath + '.tmp';

  for (let i = 0; i < maxRetries; i++) {
    try {
      // 尝试创建临时文件
      await fs.writeFile(tempPath, content, { flag: 'wx', mode: 0o640 });
      await fs.rename(tempPath, physicalPath);
      return;  // 成功
    } catch (err) {
      if (err.code === 'EEXIST') {
        // 临时文件残留，清理后重试
        await fs.unlink(tempPath).catch(() => {});
        continue;
      }
      throw err;
    }
  }

  throw new SaveAsError('TEMP_FILE_CONFLICT', physicalPath);
}
```

---

## 6. 状态机失败恢复

### 6.1 失败后状态转移

| 失败时状态 | 失败类型 | 下一态 | 说明 |
|---|---|---|---|
| opened | 路径校验失败 | opened | 未进入 write_pending |
| write_pending | 可重试错误 | write_pending | 重试 |
| write_pending | 不可重试错误 | session_invalid | 标记失效 |
| write_pending | 用户中止 | opened | 恢复编辑 |

### 6.2 数据完整性保证

| 保证 | 实现 |
|---|---|
| 原文件不变 | SaveAs 不修改原文件 |
| 编辑内容保留 | 内存中 content 不清 |
| 临时文件清理 | 失败后 unlink temp |
| 锁文件维护 | 失败不影响原文件锁 |

---

## 7. SaveAs 到只读区详细处理

### 7.1 场景 F1 详述

```
用户: SaveAs /documents/report.docx (只读区)
    │
    ▼
mapLogicalToPhysical(/documents/report.docx, 'write')
    → physicalPath = /mnt/share/writable/documents/report.docx
    → smbSection = [writable]
    │
    ▼
assertWithinWritableScope(/mnt/share/writable/documents/report.docx)
    → 通过（在白名单内）
    │
    ▼
fs.writeFile(/mnt/share/writable/documents/report.docx, ...)
    → 成功（pad2_app 有写权限）
```

**注意**：SaveAs `/documents/report.docx` 会被路径映射重定向到 `/mnt/share/writable/documents/report.docx`，而非只读区的 `/mnt/share/documents/report.docx`。用户感知的是逻辑路径，物理路径由映射层处理。

### 7.2 真正的只读区 SaveAs

```
用户: SaveAs /images/logo.png (非白名单路径)
    │
    ▼
mapLogicalToPhysical(/images/logo.png, 'write')
    → 抛 WRITE_OUTSIDE_WRITABLE_SCOPE
    │
    ▼
handleSaveAsFailure
    → showSaveAsErrorDialog(READONLY_PATH)
    → 引导用户选择 /writable/images/logo.png 或其他可写路径
```

---

## 8. 审计日志

### 8.1 失败审计记录

```json
{
  "timestamp": "<ISO8601>",
  "action": "SAVEAS_FAILURE",
  "sessionId": "<sid>",
  "account": "pad2_app",
  "intendedPath": "/images/logo.png",
  "errorType": "READONLY_PATH",
  "severity": "MEDIUM",
  "stateBefore": "opened",
  "stateAfter": "opened",
  "userAction": "CANCELLED"
}
```

### 8.2 成功审计记录

```json
{
  "timestamp": "<ISO8601>",
  "action": "SAVEAS_SUCCESS",
  "sessionId": "<sid>",
  "account": "pad2_app",
  "logicalPath": "/documents/report.docx",
  "physicalPath": "/mnt/share/writable/documents/report.docx",
  "contentHash": "<sha256>",
  "fileSize": 12345
}
```

---

## 9. 验收标准

| 编号 | 标准 | 验证方法 |
|---|---|---|
| AC-1 | SaveAs 到只读区返回 READONLY_PATH | F1 测试 |
| AC-2 | 弹窗引导选择可写路径 | UI 测试 |
| AC-3 | 失败后状态恢复 opened | 状态机检查 |
| AC-4 | 失败后原文件不变 | 文件对比 |
| AC-5 | 失败后编辑内容保留 | 内存检查 |
| AC-6 | 临时文件残留清理重试 | F2 测试 |
| AC-7 | 权限不足弹窗 | F3 测试 |
| AC-8 | 磁盘满弹窗 | F4 测试 |
| AC-9 | 路径过长弹窗 | F5 测试 |
| AC-10 | 网络错误重试 | F6 测试 |
| AC-11 | 符号链接拒绝 | F7 测试 |
| AC-12 | 路径穿越拒绝 | F8 测试 |
| AC-13 | FRZ-EX 拒绝 | F9 测试 |
| AC-14 | 审计日志记录失败 | 日志检查 |

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 错误分类遗漏 | 未处理异常 | 兜底 UNKNOWN 分类 |
| 状态机恢复失败 | 状态不一致 | transition 原子 + 单测 |
| 临时文件清理失败 | 残留垃圾 | 定期扫描清理 |
| 用户误操作 | 数据丢失 | 弹窗确认 + 默认取消 |

---

## 11. 待授权事项

- [ ] **NOT AUTHORIZED**：在测试环境验证 SaveAs 行为（待测试授权）
- 本文档仅为设计产出。

---

## 12. 追溯

| EARS 需求 | 本文档章节 |
|---|---|
| REQ-WPS-003 SaveAs 行为 | §3 失败处理流程、§7 只读区处理 |
| REQ-WPS-002 临时文件处理 | §5 临时文件覆盖失败 |
| REQ-ERR-001 错误处理 | §4 错误分类 |
| REQ-STATE-001 状态机扩展 | §6 状态机失败恢复 |
| REQ-SEC-008 审计日志 | §8 审计日志 |
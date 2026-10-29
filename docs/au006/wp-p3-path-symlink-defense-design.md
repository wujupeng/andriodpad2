# WP-P3-09 路径与符号链接防御设计

> 任务编号：WP-P3-09-PATH-SYMLINK-DEFENSE-DESIGN
> 关联 EARS 需求：REQ-SEC-003（路径边界）、REQ-SEC-009（符号链接检测）、REQ-SEC-002（受限可写目录）
> 关联 tasks.md：第 9 项 / 共 23 项
> 状态：DESIGN READY
> 上游依赖：WP-P3-06（目录结构）、WP-P3-08（权限矩阵）
> 下游影响：WP-P4-03（路径映射）、WP-P4-06（SaveAs 失败设计）

---

## 1. 设计目标

防御两类路径攻击：

1. **路径穿越（Path Traversal）**：通过 `../`、绝对路径、编码绕过等手段逃逸出 `/mnt/share/writable/` 白名单。
2. **符号链接劫持（Symlink Attack）**：在 `writable/` 内放置符号链接指向外部敏感路径（如 `/etc/shadow`、`/mnt/share/` 只读区），使写回数据落入非预期位置。

防御须在**应用层**（路径规范化）和**文件系统层**（符号链接检测）双重实施。

---

## 2. 威胁模型

### 2.1 路径穿越攻击向量

| 向量 | 示例 | 危险 |
|---|---|---|
| 相对路径回溯 | `../../etc/shadow` | 逃逸 writable/ |
| 绝对路径注入 | `/etc/passwd` | 写入任意系统路径 |
| 编码绕过 | `%2e%2e%2f`、`..%2f`、`..\\` | 绕过字符串过滤 |
| 双斜杠 | `/mnt/share/writable//../../etc/` | 规范化前绕过 |
| 空字节注入 | `writable/doc.docx\0/etc/shadow` | 截断校验 |
| Unicode 同形 | `writable/⋯/etc`（全角点） | 视觉绕过 |
| 大小写混淆（Windows） | `Writable/` | 跨平台不一致 |

### 2.2 符号链接攻击向量

| 向量 | 示例 | 危险 |
|---|---|---|
| 软链接指向外部 | `ln -s /etc writable/escape` | 写回覆盖系统文件 |
| 软链接指向只读区 | `ln -s /mnt/share/doc writable/doc` | 绕过只读保护 |
| 硬链接（如允许） | `ln /etc/shadow writable/s` | 直接引用 inode |
| TOCTOU 竞态 | 校验后、写入前替换为链接 | 时间窗口攻击 |
| 目录链接 | `ln -s / writable/root` | 整个根暴露 |

---

## 3. 应用层路径规范化

### 3.1 normalizeAndValidatePath 设计（来自 design.md）

```typescript
/**
 * 路径规范化与校验：防御路径穿越。
 * 不做文件系统 I/O，纯字符串/逻辑校验。
 */
export function normalizeAndValidatePath(
  inputPath: string,
  options: { allowAbsolute?: boolean } = {},
): string {
  // 1. 拒绝空路径
  if (!inputPath || inputPath.length === 0) {
    throw new PathValidationError('EMPTY_PATH');
  }

  // 2. 拒绝空字节
  if (inputPath.includes('\0')) {
    throw new PathValidationError('NULL_BYTE_DETECTED');
  }

  // 3. 解码 URL 编码（防御 %2e%2e%2f）
  let decoded = inputPath;
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    throw new PathValidationError('INVALID_ENCODING');
  }

  // 4. 统一分隔符（Windows → Unix）
  decoded = decoded.replace(/\\/g, '/');

  // 5. 拒绝绝对路径（除非显式允许）
  if (!options.allowAbsolute && path.isAbsolute(decoded)) {
    throw new PathValidationError('ABSOLUTE_PATH_NOT_ALLOWED');
  }

  // 6. 路径分词
  const segments = decoded.split('/').filter(s => s.length > 0);

  // 7. 拒绝回溯段
  if (segments.includes('..')) {
    throw new PathValidationError('PATH_TRAVERSAL_DETECTED');
  }

  // 8. 拒绝单点段（冗余）
  segments.filter(s => s !== '.');

  // 9. 重建规范路径
  const normalized = '/' + segments.join('/');

  // 10. 长度限制
  if (normalized.length > 4096) {
    throw new PathValidationError('PATH_TOO_LONG');
  }

  // 11. 字符白名单校验
  const ALLOWED_CHARS = /^[a-zA-Z0-9._\-\/]+$/;
  if (!ALLOWED_CHARS.test(normalized)) {
    throw new PathValidationError('INVALID_CHARACTER');
  }

  return normalized;
}
```

### 3.2 白名单前缀校验

```typescript
/**
 * 校验规范路径是否落在可写白名单内。
 */
export function assertWithinWritableScope(normalizedAbsPath: string): void {
  const isAllowed = WRITABLE_DIR_CONFIG.ALLOWED_WRITE_PREFIXES.some(
    prefix => normalizedAbsPath.startsWith(prefix),
  );
  if (!isAllowed) {
    throw new PathValidationError('PATH_OUTSIDE_WRITABLE_SCOPE', {
      path: normalizedAbsPath,
      allowedPrefixes: WRITABLE_DIR_CONFIG.ALLOWED_WRITE_PREFIXES,
    });
  }

  // 额外：拒绝 FORBIDDEN_PATHS
  const isForbidden = WRITABLE_DIR_CONFIG.FORBIDDEN_PATHS.some(
    prefix => normalizedAbsPath.startsWith(prefix),
  );
  if (isForbidden) {
    throw new PathValidationError('PATH_IN_FORBIDDEN_ZONE');
  }
}
```

### 3.3 防御矩阵

| 攻击向量 | 防御点 | 拒绝原因 |
|---|---|---|
| `../../etc/shadow` | §3.1 步骤 7 | PATH_TRAVERSAL_DETECTED |
| `/etc/passwd` | §3.1 步骤 5 | ABSOLUTE_PATH_NOT_ALLOWED |
| `%2e%2e%2f` | §3.1 步骤 3 | 解码后步骤 7 捕获 |
| `..%2f` | §3.1 步骤 3 | 同上 |
| `writable//../` | §3.1 步骤 6+7 | 分词后捕获 |
| `doc\0/etc/shadow` | §3.1 步骤 2 | NULL_BYTE_DETECTED |
| `⋯`（全角） | §3.1 步骤 11 | INVALID_CHARACTER |
| `/mnt/share/writable/.meta/` | §3.2 FORBIDDEN | PATH_IN_FORBIDDEN_ZONE |
| 超长路径 | §3.1 步骤 10 | PATH_TOO_LONG |

---

## 4. 文件系统层符号链接检测

### 4.1 detectSymlink 设计（来自 design.md）

```typescript
/**
 * 符号链接检测：在写回前检查目标路径及其所有父目录是否为符号链接。
 * 防御 symlink attack 与 TOCTOU。
 */
export async function detectSymlink(absPath: string): Promise<SymlinkCheckResult> {
  const result: SymlinkCheckResult = {
    path: absPath,
    isSymlink: false,
    symlinkTargets: [],
    parentSymlinks: [],
    safe: true,
  };

  // 1. 检查目标路径本身
  try {
    const stats = await fs.lstat(absPath);
    if (stats.isSymbolicLink()) {
      const target = await fs.readlink(absPath);
      result.isSymlink = true;
      result.symlinkTargets.push(target);
      result.safe = false;
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    // 不存在：继续检查父目录
  }

  // 2. 逐级检查父目录（防目录链接）
  const parts = absPath.split('/').filter(Boolean);
  for (let i = 1; i < parts.length; i++) {
    const subPath = '/' + parts.slice(0, i).join('/');
    try {
      const stats = await fs.lstat(subPath);
      if (stats.isSymbolicLink()) {
        const target = await fs.readlink(subPath);
        result.parentSymlinks.push({ path: subPath, target });
        result.safe = false;
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  return result;
}
```

### 4.2 检测时机

| 时机 | 操作 | 说明 |
|---|---|---|
| 写回前 | `detectSymlink(targetPath)` | 检查目标与父目录 |
| 创建会话时 | `detectSymlink(sessionDir)` | 检查会话目录 |
| 定期扫描 | 扫描 `writable/` 全树 | 发现后告警 |

### 4.3 检测后处置

```typescript
export async function handleSymlinkDetection(
  result: SymlinkCheckResult,
): Promise<void> {
  if (!result.safe) {
    // 1. 拒绝写回
    throw new SymlinkAttackError(result);

    // 2. 记录安全事件
    await logSecurityEvent({
      type: 'SYMLINK_DETECTED_IN_WRITABLE_SCOPE',
      path: result.path,
      details: result,
      severity: 'HIGH',
    });

    // 3. （可选）删除恶意链接
    // await fs.unlink(result.path);  // 需运维授权
  }
}
```

### 4.4 TOCTOU 缓解

| 策略 | 实现 |
|---|---|
| 原子打开 | 使用 `fs.open(path, 'wx', mode)`（O_CREAT\|O_EXCL） |
| 路径与 fd 绑定 | 打开后用 fd 操作，不再引用路径 |
| 父目录锁 | 写回期间对 `writable/` 加 advisory lock |
| 链接检查后立即打开 | 缩小时间窗口（非完全消除） |

**最佳实践**：`detectSy8mlink` 后立即 `fs.open` 并使用 fd 完成所有 I/O，避免再次路径解析。

---

## 5. 硬链接防御

### 5.1 硬链接风险

硬链接直接引用 inode，无独立路径标记，`lstat` 无法检测。防御须从**文件系统配置**入手+**创建时校验**双管齐下。

### 5.2 防御措施

| 措施 | 实现 | 层级 |
|---|---|---|
| 内核参数 | `sysctl fs.protected_hardlinks=1` | OS |
| 分区隔离 | `writable/` 与系统目录在不同分区 | 部署 |
| 创建时检查 link count | `stat().nlink > 1` 则拒绝 | 应用 |
| 禁止 pad2_app 创建硬链接 | `setcap cap_linux_immutable-ep` / AppArmor | OS |

### 5.3 创建后 link count 校验

```typescript
export async function assertNoHardlink(fd: number): Promise<void> {
  const stats = await fs.fstat(fd);
  if (stats.nlink > 1) {
    throw new HardlinkDetectedError({
      nlink: stats.nlink,
      inode: stats.ino,
    });
  }
}
```

---

## 6. 综合防御流程

```
写回请求 (inputPath, content)
        │
        ▼
┌──────────────────────────────┐
│ 1. normalizeAndValidatePath  │  应用层路径穿越防御
│    (纯字符串校验)             │
└──────────────────────────────┘
        │ normalizedPath
        ▼
┌──────────────────────────────┐
│ 2. assertWithinWritableScope │  白名单前缀校验
└──────────────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│ 3. detectSymlink              │  符号链接检测
│    (文件系统 lstat)           │
└──────────────────────────────┘
        │ safe=true
        ▼
┌──────────────────────────────┐
│ 4. fs.open(path, 'wx', 0640)  │  原子创建（O_EXCL）
└──────────────────────────────┘
        │ fd
        ▼
┌──────────────────────────────┐
│ 5. assertNoHardlink(fd)       │  硬链接检查
└──────────────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│ 6. fs.write(fd, content)      │  通过 fd 写入
└──────────────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│ 7. fs.close(fd)               │  关闭并校验
└──────────────────────────────┘
        │
        ▼
    写回完成
```

---

## 7. 定期扫描设计

### 7.1 扫描任务

```typescript
export const SYMLINK_SCAN_CONFIG = {
  schedule: '0 */6 * * *',  // 每 6 小时
  scanRoot: '/mnt/share/writable',
  checkTypes: ['symlink', 'hardlink'] as const,
  onDetection: 'alert_and_log' as2 as const,  // 不自动删除
  alertEndpoint: '/api/security/alert',
};
```

### 7.2 扫描实现

```bash
#!/bin/bash
# scan-symlinks.sh
find /mnt/share/writable -type l -print0 | while IFS= read -r -d '' link; do
  target=$(readlink "$link")
  echo "{\"type\":\"symlink\",\"path\":\"$link\",\"target\":\"$target\",\"time\":\"$(date -Iseconds)\"}" \
    >> /mnt/share/writable/.meta/audit/symlink-scan.jsonl
done

find /mnt/share/writable -type f -links +1 -print0 | while IFS= read -r -d '' f; do
  echo "{\"type\":\"hardlink\",\"path\":\"$f\",\"nlink\":$(stat -c %h "$f\"),\"time\":\"$(date -Iseconds)\"}" \
    >> /mnt/share/writable/.meta/audit/symlink-scan.jsonl
done
```

---

## 8. 验收标准

| 编号 | 标准 | 验证方法 |
|---|---|---|
| AC-1 | `../../etc` 输入被拒 | normalizeAndValidatePath 抛 PATH_TRAVERSAL_DETECTED |
| AC-2 | `%2e%2e%2f` 输入被拒 | 解码后同上 |
| AC-3 | 空字节路径被拒 | NULL_BYTE_DETECTED |
| AC-4 | 全角字符路径被拒 | INVALID_CHARACTER |
| AC-5 | `/mnt/share/writable/.meta/x` 被拒 | PATH_IN_FORBIDDEN_ZONE9_ZONE |
| AC-6 | 超长路径被拒 | PATH_TOO_LONG |
| AC-7 | 符号链接目标被检测 | detectSymlink 返回 safe=false |
| AC-8 | 父目录符号链接被检测 | parentSymlinks 非空 |
| AC-9 | 硬链接被检测 | assertNoHardlink 抛异常 |
| AC-10 | O_EXCL 创建防止覆盖 | 重复创建抛 EEXIST |
| AC-11 | 定期扫描发现链接并告警 | 扫描日志有记录 |
| AC-12 | TOCTOU 窗口最小化 | fd 操作不重新解析路径 |

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 新型编码绕过 | 逃逸白名单 | 字符白名单（仅允许 `[a-zA-Z0-9._\-\/]`） |
| 内核漏洞允许穿越 | 防御失效 | 保持内核更新 + 最小权限 |
| TOCTOU 残留窗口 | 竞态替换 | fd 绑定 + 父目录锁 |
| 扫描期间大量链接 | 性能 | 增量扫描 + 限速 |

---

## 10. 待授权事项

- [ ] **NOT AUTHORIZED**：设置 `sysctl fs.protected_hardlinks=1`（待运维授权）
- [ ] **NOT AUTHORIZED**：配置 AppArmor 限制 pad2_app（待安全团队授权）
- [ ] **NOT AUTHORIZED**：部署定期扫描 cron（待运维授权）
- 本文档仅为设计产出。

---

## 11. 追溯

| EARS 需求 | 本文档章节 |
|---|---|
| REQ-SEC-003 路径边界 | §3 路径规范化 |
| REQ-SEC-009 符号链接检测 | §4 符号链接检测、§5 硬链接 |
| REQ-SEC-002 受限可写目录 | §3.2 白名单前缀 |
| REQ-SEC-010 回滚能力 | §4.3 检测后处置 |
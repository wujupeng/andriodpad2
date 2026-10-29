# WP-P4-16 冲突检测设计

> 任务编号：WP-P4-16-CONFLICT-DETECTION-DESIGN
> 关联 EARS 需求：REQ-WPS-004（锁文件处理）、REQ-CONFLICT-001（并发冲突检测）、REQ-CONFLICT-002（冲突解决）
> 关联 tasks.md：第 16 项 / 共 23 项
> 状态：DESIGN READY
> 上游依赖：WP-P4-12（WPS 行为）、WP-P4-14（状态机）
> 下游影响：WP-P5-19（威胁分析）

---

## 1. 设计目标

设计并发写回冲突检测与解决机制：

1. **锁文件冲突**：多用户/多会话同时编辑同一文档。
2. **版本冲突**：基于版本号的乐观锁。
3. **最后写入胜出（LWW）**：兜底策略。
4. **冲突解决 UI**：用户选择保留哪个版本。

---

## 2. 冲突场景

### 2.1 场景清单

| 场景 | 触发 | 危害 |
|---|---|---|
| S1. 同账户并发 | 同一 pad2_app 多会话编辑同一文件 | 数据混乱 |
| S2. 跨账户并发 | pad2_app 与未来其他账户编辑同一文件 | 覆盖他人修改 |
| S3. 网络分区后并发 | 网络中断期间两端编辑 | 合并困难 |
| S4. 锁文件残留 | WPS 崩溃后锁未释放 | 误判占用 |
| S5. 版本回退 | 基于旧版本编辑保存 | 覆盖新版本 |

### 2.2 冲突检测时机

| 时机 | 检测 | 说明 |
|---|---|---|
| 打开前 | 锁文件检查 | 是否被占用 |
| 保存前 | 版本号检查 | 是否被他人修改 |
| 保存前 | 锁文件重检查 | 防止 TOCTOU |
| 保存后 | 锁文件维护 | 确保持锁 |

---

## 3. 锁文件设计

### 3.1 锁文件格式

```
文件名: ~$<originalFilename>
内容: <accountId>,<hostname>,<timestamp>,<wpsVersion>,<sessionId>
```

示例：
```
pad2_app,app-host-01,2026-10-28T10:00:00Z,WPS-11.1.0,sess-abc123
```

### 3.2 锁文件操作

```typescript
export class FileLock {
  constructor(private lockPath: string) {}

  async acquire(accountId: string, sessionId: string): Promise<boolean> {
    // 1. 检查现有锁
    const existing = await this.readLock();
    if (existing) {
      if (existing.accountId === accountId && existing.sessionId === sessionId) {
        return true;  // 自己已持锁
      }
      if (await this.isStale(existing)) {
        await this.release();  // 清理过期锁
      } else {
        return false;  // 被他人占用
      }
    }

    // 2. 原子创建锁文件
    try {
      const content = `${accountId},${os.hostname()},${new Date().toISOString()},${WPS_VERSION},${sessionId}`;
      await fs.writeFile(this.lockPath, content, { flag: 'wx', mode: 0o640 });
      return true;
    } catch (err) {
      if (err.code === 'EEXIST') return false;  // 竞态失败
      throw err;
    }
  }

  async readLock(): Promise<LockInfo | null> {
    try {
      const content = await fs.readFile(this.lockPath, 'utf-8');
      const [accountId, hostname, timestamp, wpsVersion, sessionId] = content.split(',');
      return { accountId, hostname, timestamp: new Date(timestamp), wpsVersion, sessionId };
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async isStale(lock: LockInfo): Promise<boolean> {
    const age = Date.now() - lock.timestamp.getTime();
    return age > LOCK_TIMEOUT_MS;  // 300s = 5 分钟
  }

  async release(): Promise<void> {
    try {
      await fs.unlink(this.lockPath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
}
```

### 3.3 锁超时

| 参数 | 值 | 说明 |
|---|---|---|
| LOCK_TIMEOUT_MS | 300000 (5 分钟) | 锁过期阈值 |
| LOCK_CHECK_INTERVAL | 60000 (1 分钟) | 持锁期间心跳检查 |
| LOCK_CLEANUP_INTERVAL | 3600000 (1 小时) | 定期清理过期锁 |

---

## 4. 版本号乐观锁

### 4.1 版本号存储

```typescript
// 文档元数据
interface DocumentMetadata {
  logicalPath: string;
  version: number;          // 单调递增
  lastModified: number;     // 时间戳
  lastModifiedBy: string;   // 账户
  contentHash: string;      // SHA-256
}
```

元数据存储在 `/mnt/share/writable/.meta/versions/<path-hash>.json`。

### 4.2 保存时版本检查

```typescript
export async function saveWithVersionCheck(
  logicalPath: string,
  content: Buffer,
  expectedVersion: number,
): Promise<{ success: boolean; conflict?: ConflictInfo }> {
  const meta = await readMetadata(logicalPath);

  // 版本冲突检测
  if (meta && meta.version !== expectedVersion) {
    return {
      success: false,
      conflict: {
        type: 'VERSION_CONFLICT',
        expectedVersion,
        actualVersion: meta.version,
        lastModifiedBy: meta.lastModifiedBy,
        lastModified: meta.lastModified,
      },
    };
  }

  // 无冲突：执行保存
  const newVersion = (meta?.version ?? 0) + 1;
  const contentHash = crypto.createHash('sha256').update(content).digest('hex');

  await writeContent(logicalPath, content);
  await writeMetadata(logicalPath, {
    logicalPath,
    version: newVersion,
    lastModified: Date.now(),
    lastModifiedBy: currentAccount,
    contentHash,
  });

  return { success: true };
}
```

### 4.3 冲突解决策略

| 策略 | 触发 | 行为 |
|---|---|---|
| ABORT | 默认 | 拒绝保存，返回冲突信息 |
| FORCE_OVERWRITE | 用户显式选择 | 覆盖，版本号+1 |
| MERGE | 用户选择合并 | 三方合并（须差异工具） |
| SAVE_AS_NEW | 用户选择另存 | 保存为新文件名 |

```typescript
export async function resolveConflict(
  logicalPath: string,
  content: Buffer,
  conflict: ConflictInfo,
  strategy: 'ABORT' | 'FORCE_OVERWRITE' | 'MERGE' | 'SAVE_AS_NEW',
): Promise<{ savedPath?: string }> {
  switch (strategy) {
    case 'ABORT':
      return {};

    case 'FORCE_OVERWRITE':
      await writeContent(logicalPath, content);
      await incrementVersion(logicalPath);
      return { savedPath: logicalPath };

    case 'MERGE':
      const existing = await readContent(logicalPath);
      const merged = await threeWayMerge(existing, content, conflict.baseContent);
      await writeContent(logicalPath, merged);
      await incrementVersion(logicalPath);
      return { savedPath: logicalPath };

    case 'SAVE_AS_NEW':
      const newPath = generateNonConflictingPath(logicalPath);
      await writeContent(newPath, content);
      await initMetadata(newPath);
      return { savedPath: newPath };
  }
}
```

---

## 5. 最后写入胜出（LWW）兜底

### 5.1 LWW 触发条件

| 条件 | 说明 |
|---|---|
| 版本号缺失 | 旧文档无版本元数据 |
| 元数据损坏 | .meta/ 文件损坏 |
| 用户选择"强制保存" | 显式覆盖 |

### 5.2 LWW 实现

```typescript
export async function saveWithLWW(
  logicalPath: string,
  content: Buffer,
): Promise<void> {
  // 记录被覆盖的版本（审计）
  const oldMeta = await readMetadata(logicalPath);
  if (oldMeta) {
    await logWritebackAudit({
      action: 'LWW_OVERWRITE',
      path: logicalPath,
      oldVersion: oldMeta.version,
      oldModifiedBy: oldMeta.lastModifiedBy,
    });
  }

  // 直接覆盖
  await writeContent(logicalPath, content);
  await writeMetadata(logicalPath, {
    logicalPath,
    version: (oldMeta?.version ?? 0) + 1,
    lastModified: Date.now(),
    lastModifiedBy: currentAccount,
    contentHash: hash(content),
  });
}
```

### 5.3 LWW 风险

| 风险 | 缓解 |
|---|---|
| 静默覆盖他人修改 | 审计日志 + 用户确认 |
| 数据丢失 | 保留被覆盖版本快照（.meta/snapshots/） |
| 滥用 | LWW 须用户显式选择，不自动 |

---

## 6. 冲突解决 UI 流程

### 6.1 检测到冲突时

```
WPS 保存 → 版本冲突检测
    │
    ├─ 冲突 → 弹窗：
    │   ┌─────────────────────────────────┐
    │   │ 文件已被他人修改               │
    │   │                                │
    │   │ 你的版本: v3 (10:00)           │
    │   │ 当前版本: v4 (10:05) by user2  │
    │   │                                │
    │   │ [中止] [覆盖] [合并] [另存为]  │
    │   └─────────────────────────────────┘
    │
    └─ 无冲突 → 正常保存
```

### 6.2 用户选择处理

| 选择 | 后端操作 | 状态机 |
|---|---|---|
| 中止 | 无 | write_pending → opened |
| 覆盖 | FORCE_OVERWRITE | write_pending → write_completed |
| 合并 | MERGE | write_pending → write_completed |
| 另存为 | SAVE_AS_NEW | write_pending → write_completed |

---

## 7. 并发控制

### 7.1 同一文件并发保存

```
会话 A: save(file, v3) ────────→ 版本检查 v3==v3 ✅ → 保存 → v4
                                          │
会话 B: save(file, v3) ──────────────────→ 版本检查 v3!=v4 ❌ → 冲突
```

### 7.2 锁文件串行化

```
会话 A: acquireLock ──→ 持锁 ──→ 保存 ──→ releaseLock
                              │
会话 B: acquireLock ──────────→ 失败（锁占用）→ 等待/中止
```

### 7.3 原子性保证

| 操作 | 原子性 | 实现 |
|---|---|---|
| 锁文件创建 | O_EXCL | fs.writeFile flag='wx' |
| 版本号递增 | 文件锁 | flock 或原子 rename |
| 内容写入 | 原子替换 | rename(tmp, target) |
| 元数据更新 | 原子替换 | 同上 |

---

## 8. 锁文件清理

### 8.1 定期清理

```bash
#!/bin/bash
# cleanup-locks.sh
find /mnt/share/writable/documents -name '~$*' -mmin +5 -print0 | while IFS= read -r -d '' lock; do
  echo "Removing stale lock: $lock"
  rm -f "$lock"
done
```

### 8.2 会话结束时清理

```typescript
export async function onSessionTerminated(session: EditSession): Promise<void> {
  if (session.logicalPath) {
    const lock = new FileLock(getLockPath(session.logicalPath));
    const lockInfo = await lock.readLock();
    if (lockInfo?.sessionId === session.sessionId) {
      await lock.release();
    }
  }
}
```

---

## 9. 验收标准

| 编号 | 标准 | 验证方法 |
|---|---|---|
| AC-1 | 锁文件原子创建 | 并发 acquire 测试 |
| AC-2 | 自己重入持锁成功 | 同账户同 session |
| AC-3 | 他人持锁时 acquire 失败 | 跨账户测试 |
| AC-4 | 过期锁自动清理 | 5 分钟后清理 |
| AC-5 | 版本冲突检测 | 并发保存测试 |
| AC-6 | ABORT 不覆盖 | 冲突后文件不变 |
| AC-7 | FORCE_OVERWRITE 覆盖 | 文件更新 |
| AC-8 | SAVE_AS_NEW 创建新文件 | 新路径存在 |
| AC-9 | LWW 审计日志 | 日志记录 |
| AC-10 | 锁文件清理 | 定期清理 + 会话结束 |
| AC-11 | 并发保存串行化 | 锁串行 |
| AC-12 | 元数据原子更新 | rename 原子 |

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 锁文件竞态 | 双方都获锁 | O_EXCL 原子创建 |
| 版本号跳号 | 元数据不一致 | 单调递增 + 审计 |
| LWW 数据丢失 | 覆盖他人修改 | 快照 + 用户确认 |
| 合并冲突无解 | 三方合并失败 | 回退到 SAVE_AS_NEW |
| 锁文件残留 | 误判占用 | 超时清理 + 心跳 |

---

## 11. 待授权事项

- [ ] **NOT AUTHORIZED**：部署锁清理 cron（待运维授权）
- 本文档仅为设计产出。

---

## 12. 追溯

| EARS 需求 | 本文档章节 |
|---|---|
| REQ-WPS-004 锁文件处理 | §3 锁文件设计 |
| REQ-CONFLICT-001 并发冲突检测 | §4 版本号乐观锁 |
| REQ-CONFLICT-002 冲突解决 | §4.3 解决策略、§6 UI 流程 |
| REQ-SEC-008 审计日志 | §5.2 LWW 审计 |
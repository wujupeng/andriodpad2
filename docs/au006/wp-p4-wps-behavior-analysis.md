# WP-P4-12 WPS 写回行为分析

> 任务编号：WP-P4-12-WPS-BEHAVIOR-ANALYSIS
> 关联 EARS 需求：REQ-WPS-001（WPS 写回兼容）、REQ-WPS-002（临时文件处理）、REQ-WPS-003（SaveAs 行为）
> 关联 tasks.md：第 12 项 / 共 23 项
> 状态：DESIGN READY
> 上游依赖：WP-P3 全部（目录、samba、ACL、路径防御、权限分析）
> 下游影响：WP-P4-03（路径映射）、WP-P4-04（状态机扩展）、WP-P4-06（SaveAs 失败）

---

## 1. 设计目标

深入分析 WPS Office（Linux/Android 端）通过 SMB/CIFS 挂载写回文档时的**实际行为序列**，为状态机扩展（WP-P4-04）和路径映射（WP-P4-03）提供行为依据。分析须覆盖：

1. **正常写回序列**：打开→编辑→保存→关闭的完整 I/O 序列。
2. **异常序列**：网络中断、权限拒绝、磁盘满等。
3. **SaveAs 序列**：另存为新路径的特殊行为。
4. **临时文件与锁文件**：WPS 内部文件管理。
5. **重试与超时**：WPS 错误恢复策略。

---

## 2. WPS 写回 I/O 序列分析

### 2.1 打开文档序列

```
WPS File → Open
    │
    ├─ 1. stat(path)                     // 检查文件存在
    ├─ 2. open(path, O_RDONLY)           // 只读打开
    ├─ 3. read(fd, content)              // 读取内容
    ├─ 4. close(fd)                      // 关闭只读 fd
    ├─ 5. stat(path + '.lock')           // 检查锁文件 ~$path
    ├─ 6. 若无锁: create(lockPath, O_EXCL)  // 创建锁文件
    └─ 7. write(lockPath, lockContent)   // 写入锁信息（用户/时间）
```

**所需权限**：路径读 + 目录写（创建锁文件）。

### 2.2 编辑保存序列（原子替换模式）

```
WPS File → Save
    │
    ├─ 1. create(path + '.tmp', O_EXCL|O_WRONLY)   // 创建临时文件
    ├─ 2. write(tmpFd, newContent)                  // 写入新内容
    ├─ 3. fsync(tmpFd)                              // 刷盘
    ├─ 4. close(tmpFd)                              // 关闭临时 fd
    ├─ 5. rename(path + '.tmp', path)               // 原子替换原文件
    └─ 6. unlink(lockPath) 或更新锁文件             // 维护锁
```

**关键特性**：
- 步骤 5 `rename` 是原子操作（POSIX 保证），避免半写状态。
- 临时文件与原文件同目录，确保 rename 不跨文件系统。
- 所需权限：目录写（创建 tmp、rename、unlink）。

### 2.3 关闭文档序列

```
WPS File → Close
    │
    ├─ 1. 若有未保存修改: 提示用户
    ├─ 2. unlink(lockPath)                          // 删除锁文件
    └─ 3. 释放内存
```

### 2.4 SaveAs 序列

```
WPS File → Save As → newPath
    │
    ├─ 1. stat(newPath)                             // 检查目标是否存在
    ├─ 2. 若存在: 提示覆盖确认
    ├─ 3. create(newPath, O_EXCL|O_WRONLY)          // 创建新文件
    ├─ 4. write(newFd, content)                     // 写入内容
    ├─ 5. fsync(newFd)                              // 刷盘
    ├─ 6. close(newFd)                              // 关闭
    ├─ 7. 若用户选择"替换原文件": unlink(oldPath)   // 删除旧文件
    └─ 8. 更新锁文件或创建新锁
```

**关键风险**：若 newPath 在只读区，步骤 3 返回 EACCES，WPS 提示"无权限"。详见 WP-P4-06。

---

## 3. WPS 锁文件行为

### 3.1 锁文件命名规则

| WPS 版本 | 锁文件模式 | 示例 |
|---|---|---|
| WPS Office Linux | `~$filename.ext` | `~$report.docx` |
| WPS Office Android | `~$filename.ext` | 同上 |
| 兼容 OOo | `.~lock.filename.ext#` | `.~lock.report.docx#` |

### 3.2 锁文件内容

```
用户名,主机名,时间戳,WPS版本
```

示例：
```
pad2_app,app-host,2026-10-28T10:00:00Z,WPS-11.1.0
```

### 3.3 锁文件权限需求

| 操作 | 权限 | WP-P3 提供 |
|---|---|---|
| 创建锁文件 | 目录写 | ✅ documents/ owner |
| 读取锁文件 | 文件读 | ✅ owner/group |
| 删除锁文件 | 目录写 | ✅ documents/ owner |
| 锁文件 owner | - | pad2_app（force user） |

### 3.4 锁冲突处理

| 场景 | WPS 行为 | 应用响应 |
|---|---|---|
| 锁文件存在且属于当前用户 | 直接打开 | 正常 |
| 锁文件存在且属于他人 | 提示"文件被占用，是否只读打开" | 用户选择 |
| 锁文件存在但用户已离线 | 提示"文件被占用，可强制解锁" | 用户选择（需授权） |
| 锁文件损坏 | 忽略并重建 | 正常 |

---

## 4. WPS 临时文件行为

### 4.1 临时文件类型

| 类型 | 命名 | 生命周期 | 用途 |
|---|---|---|---|
| 写回临时 | `filename.ext.tmp` | 保存期间 | 原子替换 |
| 恢复临时 | `~$filename.ext.tmp` | 异常后 | 自动恢复 |
| 撤销临时 | `.wps-undo-XXXX` | 编辑期间 | 撤销栈 |

### 4.2 临时文件路径

WPS 默认在**源文件同目录**创建临时文件。WP-P3 设计中 `documents/` 允许 pad2_app 创建临时文件（矩阵 §5.1）。

**替代方案**：若 WPS 支持配置临时目录，可指向 `sessions/<sid>/`：
- 优点：临时文件隔离，不污染 documents/
- 缺点：rename 跨目录可能跨文件系统，失去原子性
- **结论**：保持同目录临时文件，依赖矩阵允许 `*.tmp`。

### 4.3 临时文件清理

| 场景 | 清理责任 |
|---|---|
| 正常保存后 | WPS 自动 unlink |
| WPS 崩溃后 | 应用启动时扫描 `*.tmp` 并提示恢复 |
| 会话超时 | 状态机 session_terminated 触发清理 |
| 定期扫描 | 扫描 `documents/*.tmp` 超过 1 小时的删除 |

---

## 5. WPS 错误处理行为

### 5.1 权限错误（EACCES）

| WPS 行为 | 触发场景 | 应用响应 |
|---|---|---|
| 弹窗"没有权限保存" | Save 到只读路径 | 引导用户 SaveAs 到 writable/ |
| 弹窗"没有权限创建" | SaveAs 到只读目录 | 同上 |
| 弹窗"文件被占用" | 锁文件冲突 | 用户选择只读或强制解锁 |

### 5.2 网络错误

| 错误 | WPS 行为 | 应用状态机 |
|---|---|---|
| ETIMEDOUT | 重试 3 次，间隔 1s/2s/4s | network_interrupted |
| ECONNRESET | 同上 | network_interrupted |
| EHOSTUNREACH | 提示"网络不可达" | network_interrupted |
| 重试耗尽 | 提示"保存失败，是否本地备份" | session_invalid |

### 5.3 磁盘错误

| 错误 | WPS 行为 | 应用响应 |
|---|---|---|
| ENOSPC | 弹窗"磁盘已满" | 告警 + 阻止写回 |
| EIO | 弹窗"I/O 错误" | 告警 + session_invalid |
| EDQUOT | 弹窗"超出配额" | 告警 |

### 5.4 路径错误

| 错误 | WPS 行为 | 应用响应 |
|---|---|---|
| ENOENT | 弹窗"文件不存在" | 刷新文件列表 |
| ENAMETOOLONG | 弹窗"文件名过长" | 引导缩短 |
| EINVAL | 弹窗"无效路径" | 路径校验拦截 |

---

## 6. WPS 重试与超时策略

### 6.1 重试参数

| 参数 | 值 | 说明 |
|---|---|---|
| maxRetries | 3 | 最大重试次数 |
| retryInterval | [1s, 2s, 4s] | 指数退避 |
| operationTimeout | 30s | 单次操作超时 |
| lockTimeout | 300s | 锁文件超时（5 分钟） |

### 6.2 重试触发条件

| 条件 | 重试 | 说明 |
|---|---|---|
| ETIMEDOUT | ✅ | 网络瞬时问题 |
| ECONNRESET | ✅ | 连接重置 |
| ENOSPC | ❌ | 磁盘满不重试 |
| EACCES | ❌ | 权限不重试 |
| EIO | ❌ | I/O 错误不重试 |

### 6.3 超时级联

```
单次操作超时 30s
    → 重试 3 次 = 30 + 1 + 30 + 2 + 30 + 4 = 97s 最坏
    → 重试耗尽 → session_invalid
    → 用户看到"保存失败"约 97s 后
```

**设计影响**：状态机 network_interrupted 须容忍 97s 窗口，不过早判定 session_invalid。

---

## 7. WPS 版本差异

### 7.1 Linux vs Android

| 行为 | WPS Linux | WPS Android | 影响 |
|---|---|---|---|
| 挂载方式 | CIFS 内核挂载 | JCIFS/SMBJ 库 | 路径处理不同 |
| 锁文件 | `~$file` | `~$file` | 一致 |
| 临时文件 | 同目录 | 同目录 | 一致 |
| 重试 | 内核重试 | 库内重试 | 超时参数不同 |
| 路径长度 | 4096 | 260 | Android 受限 |

### 7.2 版本兼容

| WPS 版本 | 兼容性 | 备注 |
|---|---|---|
| WPS 11.x | ✅ 完全兼容 | 目标版本 |
| WPS 10.x | ⚠️ 锁文件格式略异 | 兼容读取 |
| WPS < 10 | ❌ 不支持 | 需升级 |

---

## 8. WPS 写回状态时序

### 8.1 成功写回时序

```
时间轴 →

用户:  打开 ──── 编辑 ──── 保存 ──── 关闭
        │         │         │         │
WPS:    open    (内存)    save       close
        │                   │         │
FS:    stat               create     unlink
        open               tmp       lock
        read               write
        close              fsync
        create             rename
        lock               unlink
        write              tmp
        lock
```

### 8.2 失败写回时序（权限拒绝）

```
用户:  打开 ──── 编辑 ──── 保存(只读路径)
        │         │         │
WPS:    open    (内存)    save → EACCES
        │                   │
FS:    stat               open(O_WRONLY) → EACCES
        open
        read
        close
        create
        lock
        write
        lock
```

### 8.3 失败写回时序（网络中断）

```
用户:  打开 ──── 编辑 ──── 保存 ──── (网络断) ──── 重试 ──── 成功/失败
        │         │         │         │            │
WPS:    open    (内存)    save    ETIMEDOUT     retry
        │                   │         │            │
FS:    stat               create    (无响应)     create
        open               tmp                    tmp
        read               write                  write
        close              (中断)                 rename
        create             rename
        lock               (失败)
        write
        lock
```

---

## 9. 应用层适配需求

### 9.1 须实现的适配

| 适配项 | 来源 | 对应 WP-P4 |
|---|---|---|
| 路径映射 [share]↔[writable] | §2.2, §2.4 | WP-P4-03 |
| 状态机扩展 7→9 态 | §5.2, §6.3 | WP-P4-04 |
| 防御层兼容 | §5.1 权限错误 | WP-P4-05 |
| 冲突检测 | §3.4 锁冲突 | WP-P4-06 |
| SaveAs 失败处理 | §2.4, §5.1 | WP-P4-06 |
| FRZ-EX 边界 | §5.1 EACCES | WP-P4-07 |

### 9.2 须保留的 AU-005 防御

| 防御 | WPS 行为兼容 | 保留 |
|---|---|---|
| READ_ONLY_MODE 守卫 | 只读路径仍只读 | ✅ |
| OPERATION_CAPABILITIES | 扩展后仍校验 | ✅ |
| editSessionStore 7 态 | 扩展为 9 态，原 7 态保留 | ✅ |

---

## 10. 验收标准

| 编号 | 标准 | 验证方法 |
|---|---|---|
| AC-1 | 打开-编辑-保存-关闭序列完整 | I/O 追踪 |
| AC-2 | 原子替换保存（rename） | strace 捕获 rename |
| AC-3 | 锁文件 ~$file 创建删除 | 文件存在检查 |
| AC-4 | 临时文件 *.tmp 创建删除 | 同上 |
| AC-5 | 权限错误弹窗"没有权限" | EACCES 触发 |
| AC-6 | 网络错误重试 3 次 | 重试日志 |
| AC-7 | 超时 97s 后 session_invalid | 计时 |
| AC-8 | SaveAs 到只读路径 EACCES | 路径测试 |
| AC-9 | 中文文件名支持 | UTF-8 路径 |
| AC-10 | WPS 11.x 兼容 | 版本测试 |

---

## 11. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| WPS 行为变更（新版本） | 序列不符 | 版本锁定 + 回归测试 |
| JCIFS/SMBJ 库 bug | Android 异常 | 库版本固定 + 异常处理 |
| 锁文件残留 | 误判文件被占用 | 定期清理 + 超时解锁 |
| 临时文件残留 | 磁盘占用 | 定期扫描清理 |

---

## 12. 待授权事项

- [ ] **NOT AUTHORIZED**：在测试环境验证 WPS 实际行为（待测试环境授权）
- 本文档仅为设计产出。

---

## 13. 追溯

| EARS 需求 | 本文档章节 |
|---|---|
| REQ-WPS-001 WPS 写回兼容 | §2 I/O 序列 |
| REQ-WPS-002 临时文件处理 | §4 临时文件 |
| REQ-WPS-003 SaveAs 行为 | §2.4 SaveAs 序列 |
| REQ-WPS-004 锁文件处理 | §3 锁文件 |
| REQ-WPS-005 错误恢复 | §5 错误处理、§6 重试 |
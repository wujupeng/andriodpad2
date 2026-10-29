# WP-P3-10 WPS 写回权限分析

> 任务编号：WP-P3-10-WPS-WRITEBACK-PERMISSION-ANALYSIS
> 关联 EARS 需求：REQ-WPS-001（WPS 写回兼容）、REQ-SEC-001（最小权限写回）、REQ-SEC-006（选择性放行）
> 关联 tasks.md：第 10 项 / 共 23 项
> 状态：DESIGN READY
> 上游依赖：WP-P3-06（目录）、WP-P3-07（samba）、WP-P3-08（矩阵）、WP-P3-09（路径防御）
> 下游影响：WP-P4-01（WPS 行为分析）、WP-P4-04（状态机扩展）

---

## 1. 设计目标

分析 WPS Office 写回操作所需的**最小权限集**，并证明当前 WP-P3 设计（账户 + 目录 + samba + ACL + 矩阵）能精确满足该集合——既不过宽（最小权限）也不缺失（功能可用）。

---

## 2. WPS 写回操作清单

### 2.1 基本写回操作

| 操作 | WPS 内部动作 | 文件系统动作 | 所需权限 |
|---|---|---|---|
| 新建文档 | File → New → Save | create(path, 0640) + write | 目录写 + 文件创建 |
| 编辑保存 | File → Save | open(path, O_WRONLY\|O_TRUNC) + write | 文件写 |
| 另存为 | File → Save As | create(newPath, 0640) + write + unlink(oldPath)? | 新目录写 + 旧文件删 |
| 重命名 | (通过 Save As) | rename(old, new) | 旧目录写 + 新目录写 |
| 删除文档 | File → Close + Delete | unlink(path) | 目录写（删目录项） |
| 创建临时文件 | （WPS 内部） | create(tempPath, 0600) | 会话目录写 |
| 锁定文件 | （WPS 内部） | create(lockPath, O_EXCL) | 目录写 |

### 2.2 WPS 行为特性

| 特性 | 说明 | 权限影响 |
|---|---|---|
| 临时文件 | WPS 保存时先写 `~$doc.docx` 或 `.docx.tmp` | 须允许临时文件创建 |
| 锁文件 | WPS 打开时创建 `~$doc.docx` 锁文件 | 须允许锁文件创建/删除 |
| 原子替换 | 保存通常写临时文件后 rename 替换原文件 | 须允许 rename |
| 多次重试 | 网络失败时 WPS 可能重试 | 须幂等 |
| 路径长度 | WPS 路径可能含中文 | 须 UTF-8 支持 |

### 2.3 所需最小权限集

```
PMIN = {
  account: pad2_app,
  paths: /mnt/share/writable/documents/*,
  operations: {
    create_file,
    write_file,
    truncate_file,
    rename_file,
    unlink_file,
    create_dir,         // 仅在 documents/ 下创建子目录
    list_dir,           // 列目录
    stat_file,          // 读元数据
  },
  denied: {
    write_outside_writable,
    create_symlink,
    create_hardlink,
    chmod,
    chown,
    access_meta,
  }
}
```

---

## 3. WP-P3 提供的权限集

### 3.1 账户层（WP-P2-01）

| 权限 | pad2_app 是否具备 | 来源 |
|---|---|---|
| 系统账户存在 | ✅ | useradd |
| 专用组归属 | ✅ | pad2_app_group |
| 非 debian 组成员 | ✅ | 隔离 |
| sudo 权限 | ❌ | 无（最小权限） |
| shell 登录 | ❌ | /sbin/nologin |

### 3.2 目录层（WP-P3-06）

| 权限 | pad2_app 对 documents/ | 来源 |
|---|---|---|
| 目录读（list） | ✅ | owner r |
| 目录写（create/unlink） | ✅ | owner w |
| 目录遍历（execute） | ✅ | owner x |
| 文件创建 | ✅ | 目录 w |
| 文&目录 owner | ✅ | force user |

### 3.3 SMB 层（WP-P3-07）

| 权限 | pad2_app 通过 [writable] | 来源 |
|---|---|---|
| SMB 连接 | ✅ | valid users |
| SMB 写 | ✅ | write list |
| 文件 owner | ✅ | force user=pad2_app |
| 文件 group | ✅ | force group=pad2_app_group |
| create mask | 0640 | force create mode |
| directory mask | 0750 | force directory mode |

### 3.4 ACL 层（WP-P3-08）

| 权限 | pad2_app | 来源 |
|---|---|---|
| documents/ rwx | ✅ | owner ACL |
| sessions/ rwx | ✅ | owner ACL |
| .meta/ rwx | ✅ | owner ACL |
| /mnt/share/ 根 | 只读 | other rx |
| 其他系统路径 | 无 | 账户无权限 |

### 3.5 应用层矩阵（WP-P3-08）

| 操作 | 矩阵允许 | 来源 |
|---|---|---|
| CREATE_DOCUMENT | ✅ | entries[G0].allowedOps |
| UPDATE_DOCUMENT | ✅ | entries[0].allowedOps |
| DELETE_OWN_DOCUMENT | ✅ | entries[0].allowedOps |
| CREATE_TEMP | ✅ | entries[3].allowedOps |
| DELETE_OTHERS_DOCUMENT | ❌ | forbiddenOperations |
| BULK_DELETE | ❌ | forbiddenOperations |

### 3.6 路径防御层（WP-P3-09）

| 防御 | 效果 | 来源 |
|---|---|---|
| 路径穿越 | 拒绝 | normalizeAndValidatePath |
| 符号链接 | 拒绝 | detectSymlink |
| 硬链接 | 拒绝 | assertNoHardlink |
| 白名单外路径 | 拒绝 | assertWithinWritableScope |

---

## 4. 权限集对比

### 4.1 所需 vs 提供

| 所需权限（§2.3 PMIN） | WP-P3 提供（§3） | 匹配 |
|---|---|---|
# |---|---|
| create_file | ✅ §.2 + §,3.3 + 3.5 | ✅ |
| write_file | ✅ §3.2 + §3.3 + §3.5 | ✅ |
|9.5 | ✅ | ✅ |
| truncate_file | ✅ §3.3 (SMB write 隐含 truncate) | ✅ |
| rename_file | ✅ §3.2 (目录写) + §3.5 (UPDATE/DELETE) | ✅ |
| unlink_file | ✅ §3.2 + §3.5 (DELETE_OWN) | ✅ |
| create_dir | ✅ §3.20 + §3.3 (directory mask) | ✅ |
| list_dir | ✅ §3.2 + §3.4 | ✅ |
| stat_file | ✅ §3.4 | ✅ |
| write_outside_writable | ❌ §3.6 拒绝 | ✅（拒绝即正确） |
| create_symlink | ❌ §3.6 拒绝 | ✅ |
| create_hardlink | ❌ §3.6 拒绝 | ✅ |
| chmod | ❌（pad2_app 无 sudo） | ✅ |
| chown | ❌（pad2_app 无 sudo） | ✅ |
| access_meta | ❌ §3.4 + SMB veto | ✅ |

### 4.2 最小性证明

**定理**：) 提供的权限集恰等于 WPS 写回所需最小集 PMIN，无冗余。

**证明**：
1. **充分性**：§4.1 表显示 PMIN 每项操作在 WP-P3 中均有对应允许，故 WPS 写回功能可执行。
2. **最小性**：
   - 账户层：pad2_app 无 sudo/shell，无法提权。
   - 目录层：仅 documents/ 与 sessions/ 可写，无其他可写路径。
   - SMB 层：write list 仅 pad2_app，无组放行。
   - ACL 层：other 位无权限，group 仅 pad2_app_group（单一成员）。
   - 矩阵层：forbiddenOperations 显式拒绝 BULK_DELETE 等。
   - 路径层：白名单外路径与符号链接均拒绝。
3. 故 WP-P3 提供的权限集 = PMIN，无过宽。 ∎

---

## 5. WPS 兼容性细节

### 5.1 临时文件命名

WPS 临时文件命名模式：
- `~$filename.docx`（锁文件）
- `filename.docx.tmp`（写回临时）
- `.~lock.filename.docx#`（OOo 风格锁）

**矩阵须允许**：

```typescript
// 扩展 WRITE_PERMISSION_MATRIX.entries
{
  pathPattern: '/mnt/share/writable/documents/~$*',
  allowedOps: ['CREATE_TEMP', 'UPDATE_TEMP', 'DELETE_TEMP'],
  ownerOnly: false,  // 锁文件可能不同账户创建
  isWpsLockFile: true,
},
{
  pathPattern: '/mnt/share/writable/documents/*.tmp',
  allowedOps: ['CREATE_TEMP', 'UPDATE_TEMP', 'DELETE_TEMP'],
  ownerOnly: true,
  isWpsTempFile: true,
},
```

### 5.2 rename 操作权限

WPS 原子保存使用 rename(temp, target)：
- 须对 temp 所在目录有写权限（删旧目录项）→ documents/ owner) ✅
- 须对 target 所在目录有写权限（建新目录项）→ documents/ (owner) ✅
- 须对 temp 有 unlink 权限 → owner ✅
- 须对 target 有 create 权限 → owner ✅

**结论**：当前设计支持 rename，无需额外权限。

### 5.3 路径长度与 UTF-8

| 项 | WPS 需求 | WP-P3 提供 | 兼容 |
|---|---|---|---|
| 路径长度 | ≤ 260（Windows SMB） | 限制 4096（§3.1 步骤 10） | ✅ |
| 文件名 UTF-8 | 中文文件名 | 字符白名单含 a-zA-Z0-9._\-（须扩展） | ⚠️ |

**修正**：字符白名单须支持 UTF-8 中文：

```typescript
// 修正 §3.1 步骤 11
const ALLOWED_CHARS = /^[a-zA-Z0-9._\-\/\u4e00-\u9fff]+$/;
// 含中文 CJK 统一表意
```

### 5.4 WPS 错误处理期望

| WPS 期望 | WP-P3 行为 | 兼容 |
|---|---|---|
| 权限不足返回 EACCES | 应用层 403 + SMB EACCES | ✅ |
| 路径不存在返回 ENOENT | 应用层 404 | ✅ |
| 文件已存在返回 EEXIST | O_EXCL 创建 | ✅ |
| 网络中断自动重试 | 状态机 network_interrupted（WP-P4-04） | ✅ |

---

## 6. 不兼容场景与处置

### 6.1 SaveAs 到只读区

| 场景 | WPS 行为 | WP-P3 响应 |
|---|---|---|
| SaveAs 到 /mnt/share/ 只读路径 | WPS 发起 SMB write | SMB [share] read only=yes 拒绝 → EACCES → WPS 提示"无权限" |

**设计意图**：拒绝，引导用户选择 writable/ 路径。详见 WP-P4-06。

### 6.2 批量删除

| 场景 | WPS 行为 | WP-P3 响应 |
|---|---|---|
| 多选删除 | WPS 逐个 unlink | 矩阵 forbiddenOperations 含 BULK_DELETE → 拒绝 |

**注意**：BULK_DELETE 拒绝的是应用层批量 API，WPS 逐个删除走 DELETE_OWN_DOCUMENT，每个单独评估。若 WPS 一次 API 调用删多个，则拒绝。

### 6.3 移动到只读区

| 场景 | WPS 行为 | WP-P3 响应 |
|---|---|---|
| 移动文件到 /mnt/share/ | rename(writable/x, readonly/y) | 目标目录无写权限 → EACCES |

---

## 7. 权限审计矩阵

每次 WPS 写回操作记录：

```json
{
  "timestamp": "<ISO8601>",
  "wpsOperation": "SAVE",
  "account": "pad2_app",
  "path": "/mnt/share/writable/documents/report.docx",
  "fsOperations": ["open", "write", "rename", "unlink"],
  "permissionChecks": [
    { "layer": "app_matrix", "result": "ALLOWED_BY_MATRIX" },
    { "layer": "path_validation", "result": "VALID" },
    { "layer": "symlink_check", "result": "SAFE" },
    { "layer": "smb_acl", "result": "ALLOWED" }
  ],
  "finalResult": "SUCCESS"
}
```

---

## 8. 验收标准

| 编号 | 标准 | 验证方法 |
|---|---|---|
| AC-1 | pad2_app 可在 documents/ 创建 .docx | 实测 |
| AC-2 | pad2_app 可编辑保存现有 .docx | 实测 |
| AC-3 | pad2_app 可另存为新文件 | 实测 |
| AC-4 | pad2_app 可删除自己创建的文件 | 实测 |
| AC-5 | pad2_app 不可删除他人文件 | NOT_FILE_OWNER |
| AC-6 | pad2_app 不可写到 /mnt/share/ 根 | PATH_OUTSIDE_WRITABLE_SCOPE |
| AC-7 | pad2_app 不可创建符号链接 | detectSymlink 拒绝 |
| AC-8 | WPS 临时文件可正常创建删除 | 矩阵允许 ~$* 与 *.tmp |
| AC-9 | WPS rename 保存成功 | 原子替换测试 |
| AC-10 | 中文文件名支持 | UTF-8 路径测试 |
| AC-11 | SaveAs 到只读区返回 EACCES | WPS 提示无权限 |
| AC-12 | 审计日志记录四层检查 | 日志字段完整 |

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| WPS 新版本引入新临时文件模式 | 矩阵未覆盖 | 定期回归测试 + 矩阵可配置 |
| 矩阵过严导致正常操作被拒 | 用户体验差 | §5 兼容性分析 + 灰度验证 |
| rename 跨目录（temp 在 /tmp） | 权限不足 | 强制 temp 在 sessions/ 内 |

---

## 10. 待授权事项

- [ ] **NOT AUTHORIZED**：在服务器上验证 WPS 实际写回行为（待测试环境授权）
- 本文档仅为设计产出。

---

## 11. 追溯

| EARS 需求 | 本文档章节 |
|---|---|
| REQ-WPS-001 WPS 写回兼容 | §2 操作清单、§5 兼容性 |
| REQ-SEC-001 最小权限写回 | §4 权限集对比 |
| REQ-SEC-006 选择性放行 | §3.5 应用层矩阵 |
| REQ-WPS-002 临时文件处理 | §5.1 临时文件命名 |
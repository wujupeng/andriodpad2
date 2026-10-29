# WP-P3-06 受限可写目录结构设计

> 任务编号：WP-P3-06-DIRECTORY-STRUCTURE-DESIGN
> 关联 EARS 需求：REQ-SEC-002（受限可写目录）、REQ-SEC-003（路径边界）、REQ-OPS-012（目录初始化）
> 关联 tasks.md：第 6 项 / 共 23 项
> 状态：DESIGN READY（待授权执行）
> 上游依赖：WP-P2-01（pad2_app 账户）、WP-P2-05（隔离验证）
> 下游影响：WP-P3-07（samba 配置变更）、WP-P3-08（ACL 矩阵）、WP-P3-09（路径防御）

---

## 1. 设计目标

在保持 AU-005 只读架构（`read only = yes`）作为默认基线的前提下，引入一个**受限可写子目录** `/mnt/share/writable/`，仅允许 `pad2_app` 账户写入。该目录须满足：

1. **最小暴露面**：可写区域是只读父目录下的单一子树，不破坏父目录只读语义。
2. **路径可枚举**：所有可写路径必须落在 `/mnt/share/writable/` 前缀下，便于白名单校验。
3. **原子初始化**：目录创建、属主变更、ACL 应用须在一次事务中完成，避免中间态被利用。
4. **可回滚**：删除 `writable/` 子目录即可恢复 AU-005 纯只读架构。

---

## 2. 目录拓扑

### 2.1 现状（AU-005 基线）

```
/mnt/share/                  # owner=debian group=debian mode=0775
├── (现有只读内容)            # 通过 SMB [share] 暴露，read only=yes
└── (无 writable 子目录)
```

### 2.2 目标（AU-006 WP-P3）

```
/mnt/share/                  # owner=debian group=debian mode=0775  (保持不变)
├── (现有只读内容)            # 仍为只读
└── writable/                # owner=pad2_app group=pad2_app_group mode=0750  (新增)
    ├── .meta/               # owner=pad2_app group=pad2_app_group mode=0750
    │   ├── current.json     # 当前写回会话元数据
    │   └── audit/           # 写回审计日志（按日期分片）
    ├── sessions/            # owner=pad2_app group=pad2_app_group mode=0750
    │   └── <sessionId>/     # 每次写回会话的临时工作区
    └── documents/           # owner=pad2_app group=pad2_app_group mode=0750
        └── (实际写回的文档)  # 由 WPS 写回流程落盘
```

### 2.3 关键属性

| 路径 | owner | group | mode | 用途 | 可写账户 |
|---|---|---|---|---|---|
| `/mnt/share/` | debian | debian | 0775 | 只读根（保持不变） | 无（read only） |
| `/mnt/share/writable/` | pad2_app | pad2_app_group | 0750 | 可写子树根 | pad2_app |
| `/mnt/share/writable/.meta/` | pad2_app | pad2_app_group | 0750 | 元数据 | pad2_app |
| `/mnt/share/writable/.meta/audit/` | pad2_app | pad2_app_group | 0750 | 审计日志 | pad2_app |
| `/mnt/share/writable/sessions/` | pad2_app | pad2_app_group | 0750 | 会话临时区 | pad2_app |
| `/mnt/share/writable/documents/` | pad2_app | pad2_app_group | 0750 | 文档落盘区 | pad2_app |

**设计要点**：
- `mode=0750`：owner 全权限，group 读+执行，other 无任何权限。`pad2_app_group` 仅含 `pad2_app`，故 group 位实质等同 owner 位。
- 父目录 `/mnt/share/` mode=0775 允许 `debian` 组成员在根下创建子目录，但 `writable/` 一旦创建并由 `pad2_app` 接管，`debian` 账户因不在 `pad2_app_group` 中而无写权限。
- `.meta/` 以点开头，对 SMB 客户端默认隐藏（`hide dot files = yes` 已在 smb.conf 中）。

---

## 3. 初始化脚本设计

### 3.1 脚本签名

```bash
#!/bin/bash
# init-writable-dir.sh
# 用途：原子化创建 /mnt/share/writable/ 子树
# 前置：pad2_app 账户与 pad2_app_group 组已存在（WP-P2-01）
# 幂等：重复执行不报错，仅校验属性
set -euo pipefail

WRITABLE_ROOT="/mnt/share/writable"
APP_USER="pad2_app"
APP_GROUP="pad2_app_group"
DIR_MODE="0750"
```

### 3.2 执行步骤（原子序列）

| 步骤 | 命令 | 失败处理 |
|---|---|---|
| 1 | `getent group "$APP_GROUP"` | 不存在则退出 1（依赖 WP-P2-01 未完成） |
| 2 | `id -u "$APP_USER"` | 不存在则退出 1 |
| 3 | `mkdir -p "$WRITABLE_ROOT"` | 失败则退出 2（权限不足） |
| 4 | `mkdir -p "$WRITABLE_ROOT/.meta/audit"` | 失败回滚步骤 3 |
| 5 | `mkdir -p "$WRITABLE_ROOT/sessions"` | 失败回滚步骤 3-4 |
| 6 | `mkdir -p "$WRITABLE_ROOT/documents"` | 失败回滚步骤 3-5 |
| 7 | `chown -R "$APP_USER:$APP_GROUP" "$WRITABLE_ROOT"` | 失败退出 3 |
| 8 | `chmod "$DIR_MODE" "$WRITABLE_ROOT"` 及各子目录 | 失败退出 4 |
| 9 | `setfacl -m u:debian:rx "$WRITABLE_ROOT"` | 允许 debian 只读遍历以便审计 |
| 10 | 写入 `.meta/current.json` 初始内容 | 失败退出 5 |

### 3.3 幂等性保证

脚本在每一步前先校验目标状态：
- 若目录已存在且 owner/mode 正确，跳过该步骤并记录 `idempotent_skip`。
- 若目录存在但属性不符，**修正**而非报错（`chown`/`chmod` 幂等）。
- 若目录存在但 owner 为非 `pad2_app` 账户，**报错退出**（防止误接管已有数据）。

---

## 4. `.meta/current.json` 初始结构

```json
{
  "schemaVersion": "1.0.0",
  "initializedAt": "<ISO8601 timestamp>",
  "initializedBy": "init-writable-dir.sh",
  "writableRoot": "/mnt/share/writable",
  "owner": {
    "user": "pad2_app",
    "group": "pad2_app_group"
  },
  "mode": "0750",
  "subdirs": {
    "meta": ".meta",
    "sessions": "sessions",
    "documents": "documents"
  },
  "activeSessions": [],
  "lastWriteback": null,
  "rollbackAnchor": {
    "au005Baseline": "verified",
    "deletableForRollback": true
  }
}
```

---

## 5. 路径白名单常量

在应用代码中定义（TypeScript）：

```typescript
export const WRITABLE_DIR_CONFIG = {
  WRITABLE_ROOT: '/mnt/share/writable',
  DOCUMENTS_DIR: '/mnt/share/writable/documents',
  SESSIONS_DIR: '/mnt/share/writable/sessions',
  META_DIR: '/mnt/share/writable/.meta',
  AUDIT_DIR: '/mnt/share/writable/.meta/audit',
  ALLOWED_WRITE_PREFIXES: [
    '/mnt/share/writable/documents/',
    '/mnt/share/writable/sessions/',
  ],
  FORBIDDEN_PATHS: [
    '/mnt/share/writable/.meta/',   // 元数据由系统写入，非 WPS 直接写
  ],
} as const;
```

**校验函数**（详见 WP-P3-09）：

```typescript
export function isWithinWritableScope(absPath: string): boolean {
  const normalized = normalizeAndValidatePath(absPath);
  return WRITABLE_DIR_CONFIG.ALLOWED_WRITE_PREFIXES.some(
    prefix => normalized.startsWith(prefix)
  );
}
```

---

## 6. 回滚设计

### 6.1 回滚至 AU-005 只读架构

| 步骤 | 命令 | 说明 |
|---|---|---|
| 1 | 停止所有写回会话 | 通过状态机 session_terminated |
| 2 | `rm -rf /mnt/share/writable/sessions/*` | 清理会话临时区 |
| 3 | 归档 `.meta/audit/` 至外部存储 | 保留审计证据 |
| 4 | `rm -rf /mnt/share/writable/` | 删除整个可写子树 |
| 5 | 校验 `/mnt/share/` 下无 `writable/` | 确认回滚完成 |
| 6 | 恢复 smb.conf `read only = yes`（无 write list） | 详见 WP-P5 回滚计划 |

回滚后状态等价于 AU-005 基线：`/mnt/share/` 全只读，无 `pad2_app` 写权限路径。

### 6.2 回滚安全性

- `writable/` 子树是自包含的：删除不影响 `/mnt/share/` 下其他只读内容。
- `.meta/current.json` 的 `rollbackAnchor.deletableForRollback=true` 是回滚前置条件，防止在会话活跃时误删。
- 回滚操作须由 `debian`（管理员）执行，`pad2_app` 无权删除自己属主的根目录（因父目录 `/mnt/share/` owner=debian）。

---

## 7. 与 AU-005 基线的兼容性

| AU-005 属性 | AU-006 WP-P3 后状态 | 兼容性 |
|---|---|---|
| `/mnt/share/` read only=yes | 仍为 read only=yes（smb.conf 不变） | ✅ |
| `valid users=debian` | 变更为 `valid users=debian pad2_app`（WP-P3-07） | ⚠️ 需 WP-P3-07 |
| `force user=debian` | 不变（只读路径仍 force debian） | ✅ |
| 现有只读文件权限 | 不变 | ✅ |
| `editSessionStore` 7 态 | 扩展为 9 态（WP-P4-04） | ⚠️ 需 WP-P4 |

**结论**：目录结构设计本身不破坏 AU-005 只读语义，可写能力通过 SMB 配置（WP-P3-07）和 ACL（WP-P3-08）分层引入。

---

## 8. 验收标准

| 编号 | 标准 | 验证方法 |
|---|---|---|
| AC-1 | `/mnt/share/writable/` 存在且 owner=pad2_app:pad2_app_group | `stat` 命令 |
| AC-2 | mode 为 0750 | `stat -c %a` |
| AC-3 | 三个子目录 `.meta/`、`sessions/`、`documents/` 均存在 | `ls` |
| AC-4 | `debian` 账户可遍历但不可写 `writable/` | `sudo -u debian touch /mnt/share/writable/test` 应失败 |
| AC-5 | `pad2_app` 账户可写 `documents/` | `sudo -u pad2_app touch /mnt/share/writable/documents/test` 应成功 |
| AC-6 | 其他账户（如 `winuser`）不可访问 `writable/` | `sudo -u winuser ls /mnt/share/writable/` 应失败 |
| AC-7 | 脚本重复执行不报错 | 二次运行 exit code=0 |
| AC-8 | `.meta/current.json` 合法 JSON 且字段完整 | `jq .` 解析 |
| AC-9 | 删除 `writable/` 后 `/mnt/share/` 恢复纯只读 | 回滚验证 |

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| `writable/` 被符号链接劫持 | 写回数据落入外部路径 | WP-P3-09 路径防御 |
| `pad2_app_group` 误加入其他账户 | 权限扩散 | WP-P2-05 隔离验证 + group 成员审计 |
| 父目录 0775 允许 debian 组创建其他可写子目录 | 绕过白名单 | WP-P3-09 强制白名单 + 定期扫描 |
| 初始化脚本中途失败留下半建目录 | 中间态可利用 | 原子序列 + 失败回滚 |

---

## 10. 待授权事项

- [ ] **NOT AUTHORIZED**：在服务器上执行 `init-writable-dir.sh`（待运维授权）
- [ ] **NOT AUTHORIZED**：创建 `pad2_app_group` 组成员变更（待安全团队授权）
- 本文档仅为设计产出，未执行任何系统变更。

---

## 11. 追溯

| EARS 需求 | 本文档章节 |
|---|---|
| REQ-SEC-002 受限可写目录 | §2 目录拓扑、§3 初始化 |
| REQ-SEC-003 路径边界 | §5 路径白名单 |
| REQ-OPS-012 目录初始化 | §3 初始化脚本 |
| REQ-OPS-013 幂等性 | §3.3 |
| REQ-SEC-010 回滚能力 | §6 回滚设计 |
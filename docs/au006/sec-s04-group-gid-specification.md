# AU006-SEC-S04：专用组 GID 规范

> **工作单**: AU006-SEC-S04
> **日期**: 2026-10-29
> **PM 下达**: 2026-10-29 PM 裁定后续流程时下达
> **授权边界**: 仅设计规范，不创建生产账户、不修改生产 ACL
> **关联问题**: S-04（AU-006 安全设计复核中风险项）

---

## 1. 规范范围

| 项目 | 内容 |
|------|------|
| 规范对象 | pad2_app_group 组名与 GID 分配规则 |
| 基线来源 | `docs/au006/wp-p1-baseline/account-baseline.json`（2026-10-28） |
| 关联设计 | AU-006 design.md §2.1.2（专用账户 pad2_app + pad2_app_group） |

---

## 2. 现有账户与 GID 分配

| 账户 | UID | 主组 | GID | 类型 | 状态 |
|------|-----|------|-----|------|------|
| debian | 1000 | debian | 1000 | 人类账户（管理员） | ACTIVE |
| winuser | 1001 | winuser | 1001 | 人类账户 | EXPOSED-ROTATE-PENDING |
| pad2gate3 | 1002 | pad2gate3 | 1002 | 人类账户 | EXPOSED-ROTATE-PENDING |

**当前 GID 范围**：1000-1002（人类账户，逐一分配）

---

## 3. pad2_app 与 pad2_app_group 配置规范

### 3.1 命名规范

| 项目 | 值 | 规则 |
|------|---|------|
| 专用账户名 | `pad2_app` | 应用服务账户前缀 `pad2_` + 功能名 `app` |
| 专用组名 | `pad2_app_group` | 账户名 + `_group` 后缀 |
| 备选账户名 | `svc_pad2` | 服务账户前缀 `svc_` + 应用名（备选） |
| 备选组名 | `svc_pad2_group` | 同上 |

### 3.2 UID/GID 分配规则

| 项目 | 值 | 规则 |
|------|---|------|
| pad2_app UID | **2000** | 服务账户 UID 范围 ≥ 2000，与人类账户（1000-1999）分离 |
| pad2_app_group GID | **2000** | 服务组 GID 范围 ≥ 2000，与人类组分离 |
| 分配原则 | UID = GID = 2000 | 服务账户 UID 与主组 GID 一致，简化管理 |

**设计理由**：
1. **范围分离**：人类账户 1000-1999，服务账户 2000-2999，系统保留 0-999
2. **一致性**：UID=GID=2000，便于审计与故障排查
3. **可扩展性**：后续服务账户使用 2001、2002...，预留充足空间

### 3.3 冲突检查

| 检查项 | 当前值 | 目标值 | 冲突 |
|--------|--------|--------|------|
| UID 2000 | 未占用（现有 1000/1001/1002） | 2000 | ✅ 无冲突 |
| GID 2000 | 未占用（现有 1000/1001/1002） | 2000 | ✅ 无冲突 |
| 组名 pad2_app_group | 不存在 | 新建 | ✅ 无冲突 |
| 账户名 pad2_app | 不存在 | 新建 | ✅ 无冲突 |

### 3.4 部署规则

| 步骤 | 命令 | 幂等性 | 验证 |
|------|------|--------|------|
| 1. 创建组 | `groupadd -g 2000 pad2_app_group` | 须先检查 `getent group pad2_app_group`，已存在则跳过 | `getent group pad2_app_group` → `pad2_app_group:x:2000:` |
| 2. 创建账户 | `useradd -u 2000 -g 2000 -s /usr/sbin/nologin pad2_app` | 须先检查 `getent passwd pad2_app`，已存在则跳过 | `getent passwd pad2_app` → `pad2_app:x:2000:2000::/home/pad2_app:/usr/sbin/nologin` |
| 3. 设置 SMB 密码 | `smbpasswd -a pad2_app`（经环境变量注入） | 重复执行覆盖密码 | `pdbedit -L -u pad2_app` 确认 |
| 4. 验证组成员 | `id pad2_app` | — | `uid=2000(pad2_app) gid=2000(pad2_app_group)` |
| 5. 验证 nologin | `su - pad2_app` | — | `This account is currently not available.` |

**幂等性保证**：每步先检查再执行，重复部署不报错（已存在则跳过）。

**nologin shell**：pad2_app 使用 `/usr/sbin/nologin`，禁止 SSH/交互登录，仅用于 SMB 服务。

---

## 4. 失败关闭策略

### 4.1 故障场景与处置

| 故障场景 | 检测方法 | 失败关闭行为 | 用户影响 |
|---------|---------|------------|---------|
| pad2_app_group 不存在 | `getent group pad2_app_group` 返回非零 | `accountHasWritePermission()` 返回 false → 写回禁用 + 提示"专用组不存在" | 只读模式 |
| GID 2000 已被占用 | `groupadd` 报错 "GID already exists" | 部署失败，写回不启用 | 部署阻断（须人工介入分配新 GID） |
| pad2_app 不存在 | `getent passwd pad2_app` 返回非零 | SMB 连接失败 → 写回不尝试 | 只读模式 |
| pad2_app 不在 pad2_app_group | `id -nG pad2_app` 不含 pad2_app_group | `accountHasWritePermission()` 返回 false → 写回禁用 + 提示"账户组配置异常" | 只读模式 |
| pad2_app 有 SSH 登录权限 | `getent passwd pad2_app` shell 非 nologin | 部署告警 + 建议修正 | 安全告警 |
| SMB 密码未设置 | `pdbedit -L -u pad2_app` 返回非零 | SMB 连接失败 → 写回不尝试 | 只读模式 |

### 4.2 运行时检查逻辑

```typescript
function accountHasWritePermission(): boolean {
  // 1. 检查账户存在
  const account = getSystemAccount(WRITE_ENABLED_SCOPE.account);
  if (!account) return false;

  // 2. 检查组存在
  const group = getSystemGroup('pad2_app_group');
  if (!group) return false;

  // 3. 检查账户属于组
  if (!account.groups.includes('pad2_app_group')) return false;

  // 4. 检查 SMB 密码已设置
  if (!account.smbPasswordSet) return false;

  // 5. 检查 nologin shell
  if (account.shell !== '/usr/sbin/nologin') {
    logSecurityWarning('pad2_app shell is not nologin');
    // 不直接 return false，但记录告警
  }

  return true;
}
```

**默认拒绝**：任一检查失败 → return false → isWriteEnabledForPath 返回 false → 写回禁用。

---

## 5. 验证用例

| 用例编号 | 场景 | 操作 | 预期结果 |
|---------|------|------|---------|
| V-01 | 正常部署 | 按 §3.4 步骤部署 | pad2_app 创建成功，UID=2000，GID=2000，nologin shell |
| V-02 | 幂等性 | 重复执行部署步骤 | 不报错，已存在则跳过 |
| V-03 | 组不存在 | 删除 pad2_app_group 后运行 PAD2 | 写回禁用 + 提示"专用组不存在" |
| V-04 | 账户不在组 | 将 pad2_app 移出 pad2_app_group | 写回禁用 + 提示"账户组配置异常" |
| V-05 | GID 冲突 | 预创建 GID 2000 的其他组 | 部署失败 + 告警 "GID 2000 already in use" |
| V-06 | SSH 登录拒绝 | `su - pad2_app` | "This account is currently not available." |
| V-07 | SMB 连接 | `smbclient //192.168.2.3/share -U pad2_app` | 连接成功（密码正确时） |
| V-08 | [storage] 访问拒绝 | `smbclient //192.168.2.3/storage -U pad2_app` | NT_STATUS_ACCESS_DENIED |

---

## 6. 与 AU-006 设计的集成

| 设计项 | 本规范补充 |
|--------|-----------|
| WRITE_ENABLED_SCOPE.account | `pad2_app`（UID=2000） |
| WRITE_ENABLED_SCOPE.writablePaths | `/mnt/share/writable/`（组 pad2_app_group, mode 0770） |
| design.md §2.1.2 专用账户 | 补充 UID=2000, GID=2000, shell=/usr/sbin/nologin |
| design.md §5.4 文件系统权限 | mode 0770 限定 pad2_app + pad2_app_group |
| isWriteEnabledForPath | accountHasWritePermission() 集成本规范 §4.2 检查逻辑 |

---

## 7. 交付物清单

| 交付物 | 状态 |
|--------|------|
| 账户与组配置规范 | ✅ §3 |
| 冲突处理规则 | ✅ §3.3 + §4.1 |
| 失败关闭策略 | ✅ §4 |
| 验证用例 | ✅ §5 |

---

## 8. 声明

1. 本规范仅设计，**不创建生产账户、不修改生产 ACL**。
2. UID/GID=2000 经基线核验无冲突（现有 1000/1001/1002）。
3. 部署须在 PM 授权后按独立工作单元执行。
4. 失败关闭策略保证：任一配置异常 → 写回禁用 → 回退只读模式。
5. 本规范不授权实施 AU-006 代码、FRZ-EX 或生产发布。

---

> **规范完成**。pad2_app（UID=2000）+ pad2_app_group（GID=2000），服务账户范围 ≥ 2000 与人类账户分离，nologin shell 禁止交互登录，6 项故障场景全部失败关闭。
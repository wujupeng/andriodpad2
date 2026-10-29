# WP-P2 专用应用账户设计 — 命名 + 权限范围矩阵 + 隔离策略

> **任务编号**：TASK-AU006-P2-01
> **工作包**：WP-P2 专用应用账户设计
> **关联需求**：REQ-P2-01、REQ-P2-02、REQ-P2-06、REQ-P2-07、REQ-DFX-SEC-03、REQ-DFX-SEC-04、数据约束 6.2
> **前置依赖**：TASK-AU006-P1-01（SMB 配置基线）、TASK-AU006-P1-02（账户体系基线）
> **工作单元性质**：仅设计（Design-Only），不实施任何服务器账户变更（REQ-P2-09）。
> **授权边界**：仅授权设计文档产出，不授权在服务器上创建账户或修改权限。

---

## 1. 设计目标

为 PAD2 应用设计专用 SMB 应用账户，使 WPS 编辑回写经专用账户在受限目录范围内可行，同时通过账户隔离与最小权限原则降低越权写入与凭据泄露的影响面。

**核心设计决策**：
- 专用账户名：`pad2_app`（首选，语义清晰）
- 专用组：`pad2_app_group`（≠ debian 组）
- 权限范围：仅 `/mnt/share/writable/` 可写，其余只读/不可访问
- 隔离策略：不加入 debian/sudo/admin 组，不继承 debian 权限

---

## 2. 账户命名规范

### 2.1 候选命名

| 候选名 | 语义 | 适用场景 | 决策 |
|--------|------|---------|------|
| `pad2_app` | PAD2 应用专用账户，语义直观 | 应用级服务账户 | **首选** |
| `svc_pad2` | 服务账户前缀 svc_，符合服务账户命名惯例 | 企业级服务账户管理 | 备选 |

### 2.2 命名约束

1. **须区别于 `debian`**（REQ-P2-01）：专用账户名 ≠ `debian`，避免与人类用户通用账户混淆。
2. **须区别于现有账户**：≠ `winuser`（UID 1001）、≠ `pad2gate3`（UID 1002），避免 UID 冲突。
3. **须符合 SMB 账户命名规范**：小写字母 + 下划线，长度 ≤ 32 字符，无特殊字符。
4. **须符合 Linux 用户命名规范**：POSIX 兼容，可作 `useradd` 用户名。

### 2.3 决策理由

选择 `pad2_app` 作为首选命名，理由：
1. 语义清晰：`pad2` 标识应用，`_app` 标识账户类型为应用专用。
2. 便于运维识别：在 `pdbedit -L` 输出中可直观区分于人类账户。
3. 与 `debian` 形成明确对比：应用账户 vs 人类通用账户。
4. 符合数据约束 6.2-1：须区别于 `debian`，建议 `pad2_app` 或 `svc_pad2`。

---

## 3. 权限范围矩阵

### 3.1 路径权限矩阵

| 路径 | 专用账户 pad2_app 权限 | debian 权限（现状） | 其他账户权限 | 追溯需求 |
|------|----------------------|---------------------|------------|---------|
| `/mnt/share/writable/` | **读写执行（rwx）** | 只读（r-x） | 无访问（---） | REQ-P2-02、REQ-DFX-SEC-04 |
| `/mnt/share/`（writable 外） | 只读（r-x） | 读写执行（rwx，现状） | 无访问/只读 | REQ-P2-02 |
| `/mnt/share/writable/` 内符号链接 | **拒绝**（symlinkPolicy: deny） | — | — | REQ-P3-07、REQ-DFX-SEC-07 |
| `/mnt/storage/` | 无访问 | 读写（现状） | 无访问 | 不受 AU-006 影响 |
| `/etc/samba/smb.conf` | **无权限** | 无权限（须 root + immutable） | 无权限 | REQ-P2-06 |
| `/etc/samba/` 目录 | **无权限** | 无权限 | 无权限 | REQ-P2-06 |
| SSH 登录（`/bin/bash`） | **无权限**（shell=/sbin/nologin） | 有权限 | — | REQ-P2-06 |
| 共享级管理（smbcontrol） | **无权限** | 无权限 | 无权限 | REQ-P2-06 |
| sudo 权限 | **无权限** | 有权限（如属 sudo 组） | — | REQ-P2-06 |

### 3.2 SMB 协议级权限矩阵

| SMB 操作 | 专用账户 pad2_app | debian | 追溯需求 |
|---------|------------------|--------|---------|
| 连接 `[share]` | 允许（valid users 含 pad2_app） | 允许（现状） | REQ-P3-02 |
| 读取 `/mnt/share/` 下文件 | 允许 | 允许 | REQ-P2-02 |
| 写入 `/mnt/share/writable/` | **允许**（write list 含 pad2_app） | 拒绝（read only=yes，非 write list） | REQ-P2-02、REQ-DFX-SEC-04 |
| 写入 `/mnt/share/` 非 writable 路径 | **拒绝**（read only=yes + 非 write list 路径） | 拒绝（read only=yes） | REQ-P2-02 |
| 删除 `/mnt/share/writable/` 内文件 | **允许**（经 force user + mode 0770） | 拒绝 | REQ-P3-08 |
| 重命名 `/mnt/share/writable/` 内文件 | **允许** | 拒绝 | REQ-P3-08 |
| 创建 `/mnt/share/writable/` 内子目录 | **允许** | 拒绝 | REQ-P3-04 |
| 连接 `[storage]` | 拒绝（非 valid users） | 允许 | 不受 AU-006 影响 |

### 3.3 最小权限原则验证

| 权限项 | 专用账户是否具备 | 追溯需求 | 验证方法 |
|--------|----------------|---------|---------|
| 共享级管理权限 | **否** | REQ-P2-06 | `smbcontrol` 命令测试拒绝 |
| smb.conf 修改权限 | **否** | REQ-P2-06 | `ls -la /etc/samba/smb.conf` 非 pad2_app 可写 |
| SSH 登录权限 | **否**（shell=/sbin/nologin） | REQ-P2-06 | `getent passwd pad2_app` 确认 shell |
| sudo 权限 | **否** | REQ-P2-06 | `sudo -l -U pad2_app` 确认无 sudo |
| 受限目录写权限 | **是**（唯一写权限） | REQ-DFX-SEC-04 | `smbclient` 写入测试成功 |
| 非受限目录写权限 | **否** | REQ-DFX-SEC-04 | `smbclient` 越界写入测试拒绝 |

---

## 4. 账户隔离策略

### 4.1 专用组设计

| 维度 | 设计值 | 追溯需求 |
|------|--------|---------|
| 专用组名 | `pad2_app_group` | REQ-P2-07 |
| GID | 待分配（须 ≠ debian 组 GID） | REQ-P2-07 |
| 组成员 | 仅 `pad2_app` | REQ-P2-07 |
| 是否为 debian 子组 | **否** | REQ-P2-07 |
| 是否为 sudo/admin 子组 | **否** | REQ-P2-06 |

### 4.2 隔离规则

1. **专用账户不加入 `debian` 组**（REQ-P2-07）：`pad2_app` 的主组为 `pad2_app_group`，非 `debian`。
2. **专用账户不加入 `sudo`/`admin`/`wheel` 组**（REQ-P2-06）：无 sudo 权限。
3. **不继承 debian 权限**（REQ-P2-07）：UID 独立分配（建议 ≥ 1003，避免与现有 1000/1001/1002 冲突），非 debian 子账户。
4. **不共享 debian 凭据**：专用账户有独立密码 `${SMB_APP_PASSWORD}`，≠ debian 密码。
5. **不共享 debian home 目录**：`/home/pad2_app`（或 `/nonexistent`），≠ `/home/debian`。
6. **shell 设为 `/sbin/nologin`**：禁止 SSH 交互登录（REQ-P2-06）。

### 4.3 隔离验证矩阵

| 隔离项 | 预期 | 验证命令（设计，不执行） | 追溯需求 |
|--------|------|-------------------------|---------|
| 主组 ≠ debian | `getent group pad2_app_group` ≠ `getent group debian` | `id pad2_app` | REQ-P2-07 |
| 不在 debian 组 | `id pad2_app` 不含 `debian` | `id pad2_app` | REQ-P2-07 |
| 不在 sudo 组 | `id pad2_app` 不含 `sudo` | `id pad2_app` | REQ-P2-06 |
| 不在 admin 组 | `id pad2_app` 不含 `admin` | `id pad2_app` | REQ-P2-06 |
| shell = nologin | `getent passwd pad2_app` shell 为 `/sbin/nologin` | `getent passwd pad2_app` | REQ-P2-06 |
| UID 独立 | UID ≠ 1000/1001/1002 | `getent passwd pad2_app` | REQ-P2-07 |

---

## 5. SMB_APP_ACCOUNT 配置定义（设计文档产出）

```yaml
# 专用 SMB 应用账户配置（AU-006 设计，不实施）
SMB_APP_ACCOUNT:
  accountName: "pad2_app"          # 专用账户名（≠ debian，REQ-P2-01）
  uid: "TBD (≥1003, 避免与 1000/1001/1002 冲突)"  # UID 独立分配
  password: "${SMB_APP_PASSWORD}"  # 占位符，禁止明文（REQ-P2-08）
  shell: "/sbin/nologin"           # 禁止 SSH 登录（REQ-P2-06）
  home: "/nonexistent"             # 无 home 目录
  primaryGroup: "pad2_app_group"   # 专用组（≠ debian 组，REQ-P2-07）
  supplementaryGroups: []          # 不加入任何附加组
  permissions:
    writablePaths: ["/mnt/share/writable/"]
    readOnlyPaths: ["/mnt/share/"]
    deniedPaths: ["/etc/samba/", "/mnt/storage/"]
    deniedPermissions:
      - share_admin                 # 无共享级管理权限
      - smb_conf_modify             # 无 smb.conf 修改权限
      - ssh_login                   # 无 SSH 登录权限
      - sudo                        # 无 sudo 权限
  isolation:
    notInGroups: ["debian", "sudo", "admin", "wheel"]
    noInheritFromDebian: true
    independentUid: true
  sambaConfig:
    validUsers: "debian pad2_app"   # 含专用账户
    writeList: "pad2_app"           # 仅专用账户可写
    forceUser: "pad2_app"           # 受限目录内强制专用账户身份
    forceGroup: "pad2_app_group"
```

---

## 6. 与现有账户体系的关系

### 6.1 现有账户基线（WP-P1-02 产出）

| 账户名 | UID | 组 | 共享访问 | 密码状态 | AU-006 影响 |
|--------|-----|-----|---------|---------|------------|
| debian | 1000 | debian | READ+WRITE (valid users) | ACTIVE | 保留，新增 pad2_app 并列 |
| winuser | 1001 | winuser | NONE | EXPOSED-ROTATE-PENDING | 不受影响 |
| pad2gate3 | 1002 | pad2gate3 | NONE | EXPOSED-ROTATE-PENDING | 不受影响 |

### 6.2 新增专用账户

| 账户名 | UID | 组 | 共享访问 | 密码状态 | 追溯需求 |
|--------|-----|-----|---------|---------|---------|
| pad2_app | TBD (≥1003) | pad2_app_group | READ + WRITE (writable/ only) | `${SMB_APP_PASSWORD}`（占位符） | REQ-P2-01 |

### 6.3 关系声明

1. `pad2_app` 与 `debian` **并列**，非父子关系，非组成员关系。
2. `pad2_app` 不替代 `debian`：`debian` 保留为人类通用账户（valid users 保留）。
3. `pad2_app` 仅用于 PAD2 应用的 SMB 写回操作，非人类交互使用。
4. `pad2_app` 凭据独立于 `debian` 凭据，不共享密码。

---

## 7. 约束与禁止项

### 7.1 零服务器变更（REQ-P2-09）

AU-006 **不实施**以下操作：
- 不执行 `useradd pad2_app`（不创建账户）
- 不执行 `groupadd pad2_app_group`（不创建组）
- 不执行 `usermod`（不修改任何账户）
- 不执行 `smbpasswd -a pad2_app`（不设置 SMB 密码）
- 不执行 `passwd pad2_app`（不设置系统密码）

全部为设计文档产出，实施由运维在后续工作单元执行。

### 7.2 零明文密码（REQ-P2-08）

- 密码以 `${SMB_APP_PASSWORD}` 占位符表示。
- 9191 仅在"已暴露旧密码"上下文出现，不写明文。
- `grep -ri "9191\|password.*:" docs/au006/wp-p2-account-design.md` 无明文密码。

### 7.3 实施由后续工作单元执行（REQ-P2-10）

本设计文档标注：**实施由运维在后续工作单元执行，AU-006 仅设计。**

---

## 8. 追溯矩阵

| 需求编号 | 设计章节 | 覆盖状态 |
|---------|---------|---------|
| REQ-P2-01 | §2 账户命名规范 | ✅ pad2_app ≠ debian |
| REQ-P2-02 | §3 权限范围矩阵 | ✅ 仅受限目录可写 |
| REQ-P2-06 | §3.3 最小权限验证 | ✅ 无管理/smb.conf/SSH 权限 |
| REQ-P2-07 | §4 账户隔离策略 | ✅ ≠ debian 组，不继承 |
| REQ-P2-08 | §7.2 零明文密码 | ✅ 占位符脱敏 |
| REQ-P2-09 | §7.1 零服务器变更 | ✅ 仅设计不实施 |
| REQ-DFX-SEC-03 | §2 + §4 | ✅ 专用账户 ≠ debian，隔离 |
| REQ-DFX-SEC-04 | §3 权限范围矩阵 | ✅ 仅受限目录可写 |
| 数据约束 6.2 | 全文 | ✅ 命名/密码脱敏/权限/隔离 |

---

> **文档结束**。本文档为 WP-P2 专用应用账户设计的设计文档产出，仅设计不实施。密码以 `${SMB_APP_PASSWORD}` 占位符表示，零明文。
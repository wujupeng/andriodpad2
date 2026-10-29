# WP-P3-07 Samba 配置变更计划

> 任务编号：WP-P3-07-SAMBA-CONFIG-CHANGE-PLAN
> 关联 EARS 需求：REQ-SEC-001（最小权限写回）、REQ-SEC-004（SMB 写权限隔离）、REQ-OPS-014（配置原子变更）
> 关联 tasks.md：第 7 项 / 共 23 项
> 状态：DESIGN READY（待授权执行）
> 上游依赖：WP-P2-01（pad2_app 账户）、WP-P3-06（目录结构）
> 下游影响：WP-P3-08（ACL 矩阵）、WP-P4-03（路径映射）、WP-P5 回滚

---

## 1. 设计目标

定义 `smb.conf` 的**最小变更集**，使 `pad2_app` 账户能通过 SMB 写入 `/mnt/share/writable/`，同时保持 `/mnt/share/` 其余路径的只读语义不变。变更须：

1. **保留 `read only = yes` 作为默认**：不改变 [share] 的全局只读基线。
2. **通过 `write list` 精确放行**：仅 `pad2_app` 在 `writable/` 子树下获得写权限。
3. **`force user` 不变**：只读路径仍 force 到 `debian`，写回路径通过 `force user = pad2_app` 在独立 [writable] section 处理。
4. **原子变更**：使用 `samba-tool` 或备份-替换-校验三步法，避免配置损坏导致 SMB 服务不可用。

---

## 2. 现状基线（AU-005）

### 2.1 当前 smb.conf [share] section

```ini
[share]
    path = /mnt/share
    read only = yes
    valid users = debian
    force user = debian
    browseable = yes
    hide dot files = yes
    # immutable 属性已设置（chattr +i）
```

### 2.2 当前行为

- 所有 SMB 客户端以 `debian` 身份访问，`read only = yes` 强制只读。
- `force user = debian` 确保所有文件操作以 debian 身份执行。
- 无 `write list`、无 `admin users`、无 `writable` 覆盖。

---

## 3. 变更方案

### 3.1 方案选型

| 方案 | 描述 | 优点 | 缺点 | 选用 |
|---|---|---|---|---|
| A. 单 [share] + write list | 在现有 [share] 加 `write list = pad2_app` | 改动最小 | write list 对整个 path 生效，无法限制到 writable/ 子树 | ❌ |
| B. 双 section [share] + [writable] | 新增 [writable] section 指向 writable/ | 路径隔离清晰 | 客户端须映射新路径 | ✅ |
| C. [share] + include | 用 `include = /etc/samba/writable.conf` | 模块化 | include 在 [share] 内语义复杂 | ❌ |

**选用方案 B**：新增独立 `[writable]` section，路径指向 `/mnt/share/writable/`，与只读 `[share]` 完全隔离。

### 3.2 目标 smb.conf

```ini
# === AU-005 基线（保持不变） ===
[share]
    path = /mnt/share
    read only = yes
    valid users = debian
    force user = debian
    browseable = yes
    hide dot files = yes

# === AU-006 新增（WP-P3-07） ===
[writable]
    path = /mnt/share/writable
    read only = yes                  # 仍为 yes，通过 write list 放行
    valid users = debian pad2_app    # debian 可只读遍历审计，pad2_app 可写
    write list = pad2_app            # 仅 pad2_app 在写列表
    force user = pad2_app            # 写回操作强制以 pad2_app 身份落盘
    force group = pad2_app_group     # 强制组
    browseable = no                  # 不在浏览器列表显示，仅按路径访问
    hide dot files = yes             # 隐藏 .meta
    create mask = 0640               # 新文件权限
    directory mask = 0750            # 新目录权限
    force create mode = 0640         # 强制创建模式
    force directory mode = 0750      # 强制目录模式
    hosts allow = 127.0.0.1 <app_host_ip>  # 仅允许应用主机
    hosts deny = ALL                 # 拒绝其他
    veto files = /.meta/             # 禁止通过 SMB 访问 .meta
```

### 3.3 关键参数解释

| 参数 | 值 | 理由 |
|---|---|---|
| `read only` | `yes` | 保留只读默认，通过 write list 覆盖 |
| `write list` | `pad2_app` | 精确放行单一账户，非组放行 |
| `force user` | `pad2_app` | 写回强制以 pad2_app 落盘，确保 owner 正确 |
| `force group` | `pad2_app_group` | 强制组归属 |
| `create mask` | `0640` | owner rw, group r, other 无 |
| `directory mask` | `0750` | owner rwx, group rx, other 无 |
| `force create mode` | `0640` | 即使客户端请求更宽权限，强制收敛 |
| `browseable` | `no` | 不在网络邻居显示，减少暴露面 |
| `veto files` | `/.meta/` | 阻止 SMB 客户端访问元数据区 |
| `hosts allow` | `127.0.0.1 <app_host_ip>` | 仅本机和应用主机可访问 |

---

## 4. 变更执行计划

### 4.1 SMB_CONF_CHANGE_PLAN（来自 design.md）

```typescript
export const SMB_CONF_CHANGE_PLAN = {
  targetFile: '/etc/samba/smb.conf',
  backupFile: '/etc/samba/smb.conf.au005.bak',
  changeStrategy: 'append-new-section' as const,
  newSection: {
    name: 'writable',
    path: '/mnt/share/writable',
    params: {
      'read only': 'yes',
      'valid users': 'debian pad2_app',
      'write list': 'pad2_app',
      'force user': 'pad2_app',
      'force group': 'pad2_app_group',
      'browseable': 'no',
      'hide dot files': 'yes',
      'create mask': '0640',
      'directory mask': '0750',
      'force create mode': '0640',
      'force directory mode': '0750',
      'hosts allow': '127.0.0.1 <app_host_ip>',
      'hosts deny': 'ALL',
      'veto files': '/.meta/',
    },
  },
  validationSteps: [
    'testparm -s',                    // 语法校验
    'smbclient -L //localhost -N',    // 列表校验
    'smbclient //localhost/writable -U pad2_app',  // 写入测试
  ],
  rollbackStrategy: 'remove-new-section-and-restore-backup',
} as const;
```

### 4.2 执行步骤（原子序列）

| 步骤 | 命令 | 失败处理 |
|---|---|---|
| 1 | `cp /etc/samba/smb.conf /etc/samba/smb.conf.au005.bak` | 备份失败退出 1 |
| 2 | `chattr -i /etc/samba/smb.conf` | 解除 immutable（AU-005 设置） |
| 3 | 追加 `[writable]` section 至 smb.conf | 写入失败恢复备份 |
| 4 | `testparm -s` | 语法错误恢复备份退出 2 |
| 5 | `systemctl restart smbd` | 启动失败恢复备份退出 3 |
| 6 | `smbclient //localhost/writable -U pad2_app -c 'ls'` | 访问失败恢复备份退出 4 |
| 7 | 写回测试：创建+删除测试文件 | 失败恢复备份退出 5 |
| 8 | `chattr +i /etc/samba/smb.conf` | 重新设置 immutable |
| 9 | 记录变更至审计日志 | 完成 |

### 4.3 失败回滚

任一步骤失败时执行：

```bash
cp /etc/samba/smb.conf.au005.bak /etc/samba/smb.conf
systemctl restart smbd
# 校验恢复成功
testparm -s && smbclient -L //localhost -N
```

---

## 5. [share] 与 [writable] 隔离证明

### 5.1 路径隔离

| Section | path | 客户端访问路径 | 物理目录 |
|---|---|---|---|
| [share] | `/mnt/share` | `//host/share` | 整个共享根 |
| [writable] | `/mnt/share/writable` | `//host/writable` | 可写子树 |

**关键**：`[writable]` 是独立 SMB share，不是 `[share]` 的子目录写权限放行。客户端须显式连接 `//host/writable` 才能写回。通过 `//host/share/writable/` 访问时，仍受 [share] 的 `read only = yes` 约束。

### 5.2 账户隔离

| 账户 | [share] 权限 | [writable] 权限 |
|---|---|---|
| debian | 只读（force user=debian） | 只读遍历（valid users 含 debian，但不在 write list） |
| pad2_app | 无权限（不在 valid users） | 读写（在 write list，force user=pad2_app） |
| winuser | 无权限 | 无权限（不在 valid users） |
| 其他 | 无权限 | 无权限（hosts deny=ALL） |

### 5.3 force user 隔离

- [share] `force user = debian`：所有通过 [share] 的操作以 debian 身份执行。
- [writable] `force user = pad2_app`：所有通过 [writable] 的操作以 pad2_app 身份执行。
- **无交叉**：两个 section 的 force user 独立，不会出现 debian 身份写入 writable/ 的情况。

---

## 6. immutable 属性处理

AU-005 在 smb.conf 上设置了 `chattr +i`（immutable），任何写入操作须先解除：

| 阶段 | 操作 | immutable 状态 |
|---|---|---|
| 变更前 | `chattr -i` | 解除 |
| 变更中 | 编辑 smb.conf | 解除 |
| 变更后 | `chattr +i` | 恢复 |
| 回滚时 | `chattr -i` → 恢复备份 → `chattr +i` | 恢复 |

**安全意义**：immutable 防止非授权修改，变更流程须显式解除-修改-恢复，留下操作痕迹。

---

## 7. 客户端路径映射

### 7.1 WPS 写回路径转换

| WPS 逻辑路径 | SMB URL | 物理路径 |
|---|---|---|
| `/documents/report.docx`（只读） | `//host/share/documents/report.docx` | `/mnt/share/documents/report.docx` |
| `/writable/documents/report.docx`（写回） | `//host/writable/documents/report.docx` | `/mnt/share/writable/documents/report.docx` |

**映射规则**（详见 WP-P4-03）：
- 只读访问走 [share]，写回访问走 [writable]。
- 应用层 `normalizeAndValidatePath` 负责在两个 section 间路由。

### 7.2 挂载点设计

应用主机挂载两个 share：

```fstab
//host/share    /mnt/smb/readonly   cifs    guest,uid=app,gid=app,ro    0 0
//host/writable /mnt/smb/writable   cifs    username=pad2_app,password=${SMB_APP_PASSWORD},uid=app,gid=app    0 0
```

- 只读挂载使用 guest 或 debian 凭据（无密码或 debian 密码）。
- 可写挂载使用 `pad2_app` 凭据，密码通过 `${SMB_APP_PASSWORD}` 环境变量注入（禁止明文）。
- 挂载密码管理详见 WP-P2-02 凭据存储。

---

## 8. 验收标准

| 编号 | 标准 | 验证方法 |
|---|---|---|
| AC-1 | `testparm -s` 无错误 | 语法校验 |
| AC-2 | `smbclient -L //localhost -N` 显示 [share] 和 [writable] | 列表校验 |
| AC-3 | debian 通过 [share] 只读访问成功 | `smbclient //localhost/share -U debian` |
| AC-4 | debian 通过 [writable] 只读遍历成功 | `smbclient //localhost/writable -U debian -c 'ls'` |
| AC-5 | debian 通过 [writable] 写入失败 | `smbclient ... -c 'put test'` 应失败 |
| AC-6 | pad2_app 通过 [writable] 写入成功 | `smbclient ... -c 'put test'` 应成功 |
| AC-7 | pad2_app 通过 [share] 访问失败 | 不在 valid users |
| AC-8 | winuser 通过 [writable] 访问失败 | 不在 valid users |
| AC-9 | [writable] 创建的文件 owner=pad2_app group=pad2_app_group | `stat` |
| AC-10 | [writable] 创建的文件 mode=0640 | `stat -c %a` |
| AC-11 | smb.conf immutable 属性已恢复 | `lsattr /etc/samba/smb.conf` |
| AC-12 | 备份文件 smb.conf.au005.bak 存在且与原配置一致 | `diff` |

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| smb.conf 语法错误导致 smbd 启动失败 | SMB 服务中断 | testparm 预校验 + 自动回滚 |
| [writable] 意外暴露给其他主机 | 外部写入 | hosts allow/deny 限制 |
| force user 配置错误导致文件 owner 混乱 | 权限失控 | AC-9 强制校验 owner |
| immutable 解除期间被其他进程修改 | 配置污染 | 变更窗口最小化 + 操作审计 |

---

## 10. 待授权事项

- [ ] **NOT AUTHORIZED**：修改 `/etc/samba/smb.conf`（待运维授权）
- [ ] **NOT AUTHORIZED**：解除/恢复 `chattr` immutable 属性（待运维授权）
- [ ] **NOT AUTHORIZED**：重启 `smbd` 服务（待运维授权）
- [ ] **NOT AUTHORIZED**：在 `/etc/fstab` 添加挂载项（待运维授权）
- 本文档仅为设计产出，未执行任何系统变更。

---

## 11. 追溯

| EARS 需求 | 本文档章节 |
|---|---|
| REQ-SEC-001 最小权限写回 | §3 变更方案、§5 隔离证明 |
| REQ-SEC-004 SMB 写权限隔离 | §5 隔离证明 |
| REQ-OPS-014 配置原子变更 | §4 执行计划 |
| REQ-SEC-010 回滚能力 | §4.3 失败回滚 |
| REQ-SEC-011 immutable 保护 | §6 immutable 处理 |
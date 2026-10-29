# WP-P2 账户隔离与最小权限验证 — 隔离验证 + 最小权限验证

> **任务编号**：TASK-AU006-P2-05
> **工作包**：WP-P2 专用应用账户设计
> **关联需求**：REQ-P2-06、REQ-P2-07、REQ-P2-09、REQ-P2-10、REQ-DFX-SEC-03、REQ-DFX-SEC-04、数据约束 6.2
> **前置依赖**：TASK-AU006-P2-01（命名与权限范围已设计）、TASK-AU006-P2-03（轮换机制已设计）、TASK-AU006-P2-04（撤销机制已设计）
> **工作单元性质**：仅设计（Design-Only），不实施任何服务器账户变更（REQ-P2-09）。
> **授权边界**：仅授权设计验证文档产出，不授权在服务器上创建账户或修改权限。

---

## 1. 设计目标

验证专用账户 `pad2_app` 的隔离设计（≠ debian 组）与最小权限原则（无管理/smb.conf/SSH 权限），确认设计满足隔离与最小权限要求，产出验证文档。

---

## 2. 账户隔离验证

### 2.1 隔离验证矩阵

| 隔离项 | 预期 | 验证方法（设计，不执行） | 验证结果 | 追溯需求 |
|--------|------|-------------------------|---------|---------|
| 主组 ≠ debian 组 | `pad2_app` 主组为 `pad2_app_group`，非 `debian` | `id pad2_app` → 主组应为 `pad2_app_group` | ✅ 设计满足 | REQ-P2-07 |
| 不在 debian 组 | `pad2_app` 附加组不含 `debian` | `id pad2_app` → 附加组不含 `debian` | ✅ 设计满足 | REQ-P2-07 |
| 不在 sudo 组 | `pad2_app` 附加组不含 `sudo` | `id pad2_app` → 附加组不含 `sudo` | ✅ 设计满足 | REQ-P2-06 |
| 不在 admin 组 | `pad2_app` 附加组不含 `admin` | `id pad2_app` → 附加组不含 `admin` | ✅ 设计满足 | REQ-P2-06 |
| 不在 wheel 组 | `pad2_app` 附加组不含 `wheel` | `id pad2_app` → 附加组不含 `wheel` | ✅ 设计满足 | REQ-P2-06 |
| UID 独立 | `pad2_app` UID ≠ 1000/1001/1002 | `getent passwd pad2_app` → UID ≥ 1003 | ✅ 设计满足 | REQ-P2-07 |
| 不继承 debian 权限 | `pad2_app` 无 debian 组权限继承 | `id pad2_app` 无 debian 组 | ✅ 设计满足 | REQ-P2-07 |
| shell = nologin | `pad2_app` shell 为 `/sbin/nologin` | `getent passwd pad2_app` → shell=/sbin/nologin | ✅ 设计满足 | REQ-P2-06 |
| home 不共享 | `pad2_app` home ≠ `/home/debian` | `getent passwd pad2_app` → home=/nonexistent | ✅ 设计满足 | REQ-P2-07 |

### 2.2 隔离验证命令清单（设计，不执行）

```bash
# 1. 主组验证
id pad2_app
# 预期：uid=1003(pad2_app) gid=1003(pad2_app_group) groups=1003(pad2_app_group)

# 2. 不在 debian 组验证
id pad2_app | grep -q 'debian' && echo "FAIL: in debian group" || echo "PASS: not in debian group"

# 3. 不在 sudo 组验证
id pad2_app | grep -q 'sudo' && echo "FAIL: in sudo group" || echo "PASS: not in sudo group"

# 4. UID 独立验证
getent passwd pad2_app
# 预期：pad2_app:x:1003:1003::/nonexistent:/sbin/nologin

# 5. shell 验证
getent passwd pad2_app | cut -d: -f7
# 预期：/sbin/nologin
```

### 2.3 隔离设计声明

| 隔离维度 | 设计值 | 与 debian 关系 | 追溯需求 |
|---------|--------|---------------|---------|
| 主组 | `pad2_app_group` | ≠ `debian` 组 | REQ-P2-07 |
| 附加组 | 无 | 不含 `debian`/`sudo`/`admin` | REQ-P2-06/07 |
| UID | ≥ 1003 | ≠ 1000（debian） | REQ-P2-07 |
| shell | `/sbin/nologin` | ≠ `/bin/bash`（debian） | REQ-P2-06 |
| home | `/nonexistent` | ≠ `/home/debian` | REQ-P2-07 |
| SMB 密码 | `${SMB_APP_PASSWORD}` | ≠ debian 密码 | REQ-P2-07 |
| SMB 权限 | 仅 writable/ 可写 | ≠ debian 全共享可写 | REQ-DFX-SEC-04 |

---

## 3. 最小权限验证

### 3.1 最小权限验证矩阵

| 权限项 | 预期 | 验证方法（设计，不执行） | 验证结果 | 追溯需求 |
|--------|------|-------------------------|---------|---------|
| 共享级管理权限 | **无** | `smbcontrol pad2_app` 拒绝 | ✅ 设计满足 | REQ-P2-06 |
| smb.conf 修改权限 | **无** | `ls -la /etc/samba/smb.conf` 非 pad2_app 可写 | ✅ 设计满足 | REQ-P2-06 |
| SSH 登录权限 | **无** | `ssh pad2_app@192.168.2.3` 拒绝（shell=nologin） | ✅ 设计满足 | REQ-P2-06 |
| sudo 权限 | **无** | `sudo -l -U pad2_app` 无 sudo | ✅ 设计满足 | REQ-P2-06 |
| 受限目录写权限 | **有**（唯一写权限） | `smbclient` 写入 `/mnt/share/writable/` 成功 | ✅ 设计满足 | REQ-DFX-SEC-04 |
| 非受限目录写权限 | **无** | `smbclient` 写入 `/mnt/share/` 非 writable 拒绝 | ✅ 设计满足 | REQ-DFX-SEC-04 |
| `[storage]` 共享访问 | **无** | `smbclient //192.168.2.3/storage -U pad2_app` 拒绝 | ✅ 设计满足 | REQ-P2-02 |
| 系统账户创建权限 | **无** | `useradd` 须 root，pad2_app 非 root | ✅ 设计满足 | REQ-P2-06 |
| 系统服务管理权限 | **无** | `systemctl` 须 root/sudo，pad2_app 无 sudo | ✅ 设计满足 | REQ-P2-06 |

### 3.2 最小权限验证命令清单（设计，不执行）

```bash
# 1. 共享级管理权限验证
sudo smbcontrol pad2_app
# 预期：拒绝（pad2_app 非管理员）

# 2. smb.conf 修改权限验证
ls -la /etc/samba/smb.conf
# 预期：owner=root, group=root, mode=-rw-r--r--，pad2_app 不可写

# 3. SSH 登录权限验证
ssh pad2_app@192.168.2.3
# 预期：拒绝（shell=/sbin/nologin）

# 4. sudo 权限验证
sudo -l -U pad2_app
# 预期：无 sudo 权限

# 5. 受限目录写权限验证
smbclient //192.168.2.3/share -U pad2_app%${SMB_APP_PASSWORD} -c 'put /tmp/testfile writable/testfile'
# 预期：写入成功

# 6. 非受限目录写权限验证
smbclient //192.168.2.3/share -U pad2_app%${SMB_APP_PASSWORD} -c 'put /tmp/testfile testfile'
# 预期：NT_STATUS_ACCESS_DENIED

# 7. [storage] 共享访问验证
smbclient //192.168.2.3/storage -U pad2_app%${SMB_APP_PASSWORD} -c 'ls'
# 预期：NT_STATUS_ACCESS_DENIED（非 valid users）
```

---

## 4. 仅受限目录可写验证

### 4.1 可写范围验证矩阵

| 路径 | 预期权限 | 验证方法 | 验证结果 | 追溯需求 |
|------|---------|---------|---------|---------|
| `/mnt/share/writable/` | 读写执行（rwx） | `smbclient` 写入测试 | ✅ 可写 | REQ-DFX-SEC-04 |
| `/mnt/share/`（writable 外） | 只读（r-x） | `smbclient` 写入测试拒绝 | ✅ 只读 | REQ-DFX-SEC-04 |
| `/mnt/share/writable/` 内子目录 | 读写执行（rwx，经 directory mask 0770） | `smbclient` 创建子目录测试 | ✅ 可写 | REQ-DFX-SEC-04 |
| `/mnt/share/writable/` 内文件 | 读写（rw，经 create mask 0770） | `smbclient` 创建文件测试 | ✅ 可写 | REQ-DFX-SEC-04 |
| `/mnt/storage/` | 无访问 | `smbclient` 连接拒绝 | ✅ 无访问 | REQ-P2-02 |

### 4.2 可写范围严格限定验证

| 验证项 | 预期 | 追溯需求 |
|--------|------|---------|
| 可写范围 ⊂ `/mnt/share/writable/` | 是 | REQ-DFX-SEC-04 |
| 可写范围 ≠ 整个共享 | 是（仅 writable/ 子目录） | REQ-DFX-SEC-04 |
| 可写范围 ≠ `/mnt/share/` | 是 | REQ-DFX-SEC-04 |
| 可写范围 ≠ `/mnt/storage/` | 是 | REQ-DFX-SEC-04 |

---

## 5. 零服务器变更验证

### 5.1 零变更验证矩阵

| 变更项 | 预期 | 验证方法 | 验证结果 | 追溯需求 |
|--------|------|---------|---------|---------|
| 账户创建 | 不执行 `useradd` | AU-006 无 `useradd` 命令执行 | ✅ 零变更 | REQ-P2-09 |
| 组创建 | 不执行 `groupadd` | AU-006 无 `groupadd` 命令执行 | ✅ 零变更 | REQ-P2-09 |
| 账户修改 | 不执行 `usermod` | AU-006 无 `usermod` 命令执行 | ✅ 零变更 | REQ-P2-09 |
| 密码设置 | 不执行 `smbpasswd` | AU-006 无 `smbpasswd` 命令执行 | ✅ 零变更 | REQ-P2-09 |
| 权限修改 | 不执行 `chmod`/`chown` | AU-006 无 `chmod`/`chown` 命令执行 | ✅ 零变更 | REQ-P2-09 |

### 5.2 零变更声明

AU-006 全部为设计文档产出，不实施任何服务器变更：
- 不创建账户（`useradd`）
- 不创建组（`groupadd`）
- 不修改账户（`usermod`）
- 不设置密码（`smbpasswd`/`passwd`）
- 不修改权限（`chmod`/`chown`/`setfacl`）

实施由运维在后续工作单元执行（REQ-P2-10）。

---

## 6. 验证结果汇总

### 6.1 验证结果总览

| 验证类别 | 验证项数 | 通过项数 | 失败项数 | 通过率 | 追溯需求 |
|---------|---------|---------|---------|--------|---------|
| 账户隔离 | 9 | 9 | 0 | 100% | REQ-P2-07 |
| 最小权限 | 9 | 9 | 0 | 100% | REQ-P2-06 |
| 仅受限目录可写 | 5 | 5 | 0 | 100% | REQ-DFX-SEC-04 |
| 零服务器变更 | 5 | 5 | 0 | 100% | REQ-P2-09 |
| **合计** | **28** | **28** | **0** | **100%** | — |

### 6.2 验证结论

**AU-006 WP-P2 账户隔离与最小权限验证：PASS**

- 账户隔离设计满足 REQ-P2-07（≠ debian 组，不继承权限）。
- 最小权限设计满足 REQ-P2-06（无管理/smb.conf/SSH 权限）。
- 仅受限目录可写设计满足 REQ-DFX-SEC-04（仅 `/mnt/share/writable/` 可写）。
- 零服务器变更满足 REQ-P2-09（AU-006 仅设计不实施）。
- 实施由后续工作单元执行满足 REQ-P2-10。

---

## 7. 实施由后续工作单元执行声明

本验证文档标注：**实施由运维在后续工作单元执行，AU-006 仅设计验证。**

后续工作单元须：
1. 由运维执行 `groupadd pad2_app_group` + `useradd pad2_app` + `smbpasswd -a pad2_app`。
2. 由运维执行本验证文档中的验证命令，确认隔离与最小权限满足。
3. 验证通过后方可进入生产环境。

---

## 8. 追溯矩阵

| 需求编号 | 设计章节 | 覆盖状态 |
|---------|---------|---------|
| REQ-P2-06 | §3 最小权限验证 | ✅ 无管理/smb.conf/SSH 权限 |
| REQ-P2-07 | §2 账户隔离验证 | ✅ ≠ debian 组，不继承 |
| REQ-P2-09 | §5 零服务器变更 | ✅ 仅设计不实施 |
| REQ-P2-10 | §7 实施标注 | ✅ 后续工作单元执行 |
| REQ-DFX-SEC-03 | §2 隔离验证 | ✅ 专用账户 ≠ debian，隔离 |
| REQ-DFX-SEC-04 | §4 仅受限目录可写 | ✅ 仅 `/mnt/share/writable/` 可写 |
| 数据约束 6.2 | 全文 | ✅ 隔离/权限/轮换/撤销 |

---

> **文档结束**。本文档为 WP-P2 账户隔离与最小权限验证的设计文档产出，仅设计不实施。验证结果：PASS（28/28 项通过）。
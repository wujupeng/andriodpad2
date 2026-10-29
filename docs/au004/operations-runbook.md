# AU-004 Operations Runbook — GAP-01~04 运维闭环执行手册

> **文档版本**: 1.0
> **生成日期**: 2026-10-27
> **文档性质**: 运维执行手册（非代码研发产物）
> **授权边界**: 本手册供获授权运维人员执行 GAP-01~04 闭环操作使用。工具能力已完成（52/52 PASS），但 GAP 闭环须运维实际执行 + PM/Gate Reviewer 独立确认。
> **关键声明**: 工具能力完成 ≠ GAP 关闭 ≠ 发布解阻。本手册执行成功 ≠ 生产发布自动解阻。

---

## 0. 执行摘要

| 项目 | 当前状态 |
|------|---------|
| AU-003 发布候选加固 | PASS（报告级） |
| AU-003-POSTGATE-01 | PASS |
| AU-004 工具研发与 Gate Review | PASS（52/52） |
| GAP-01 凭据轮换 | 工具就绪，运维未执行 |
| GAP-02 旧凭据撤销 | 未验证完成 |
| GAP-03 SMB 权限收紧 | 工具就绪，运维未执行 |
| GAP-04 权限整改证据 | 尚未完成闭环 |
| Production Release | BLOCKED / NOT AUTHORIZED |

### 执行顺序（严格按序执行，避免轮换过程中失去 SMB 访问能力）

```
Phase 0  前置检查（只读，无副作用）
   ↓
Phase 1  凭据轮换（GAP-01）
   ↓
Phase 2  旧凭据撤销验证（GAP-02）
   ↓
Phase 3  SMB 权限收紧（GAP-03）
   ↓
Phase 4  权限收紧验证证据（GAP-04）
   ↓
Phase 5  证据生成与汇总
   ↓
Phase 6  安全与回滚验证
   ↓
Phase 7  PM 最终 Gate Review
```

---

## 1. 环境事实（执行前核验基线）

| 项目 | 值 |
|------|-----|
| SMB 服务器 | `debian@192.168.2.3` |
| SSH 密钥 | `~/.ssh/pad2_cred_closure` |
| SMB 共享名 | `share` |
| SMB 共享路径 | `/mnt/share` |
| APK 发布目录 | `/mnt/share/apk/` |
| APK 归档子目录 | `/mnt/share/apk/dazongli/` |
| SMB 配置文件 | `/etc/samba/smb.conf` |
| 当前 SMB 账户 | `debian`（UID 1000）、`winuser`（UID 1001）、`pad2gate3`（UID 1002） |
| 当前 SMB 密码 | `9090`（**已泄露**，历史 commit `dfd43cf` 明文暴露） |
| 当前 SMB 权限 | `read only = No`、`writable = yes`（**过宽**，须收紧为 `read only = Yes`） |
| smbd 服务状态 | `active (running)` |
| 发布目录权限 | `drwxrwxrwx`（777，过宽） |
| 归档子目录权限 | `drwxrwxr-x`（775） |
| 设备序列号 | `AJ7XJV6904H00320`（荣耀 NDL2_W09 / Android 16） |
| 设备端凭据文件 | `/sdcard/Android/data/com.pad2.filemanager/files/update_cred.json` |
| 设备端当前凭据 | `{"host":"192.168.2.3","share":"share","path":"apk","username":"debian","password":"9090","domain":""}` |
| ADB 路径 | `C:/Users/DELL/IDEProjects/pad2/local-sdk/platform-tools/adb.exe` |
| Node.js 版本 | v24.19.0 |
| 工作目录 | `C:\Users\DELL\IDEProjects\pad2` |
| Git HEAD | `3dde2a3`（AU-004 变更在工作区未提交） |

---

## 2. 安全要求（执行前必读）

### 2.1 凭据保护规则

| 规则 | 说明 |
|------|------|
| **新密码注入方式** | 通过环境变量 `PAD2_SMB_NEW_PASSWORD` 注入，**禁止**出现在命令行参数中（进程列表可见） |
| **旧密码注入方式** | 通过环境变量 `PAD2_SMB_OLD_PASSWORD` 注入 |
| **Shell 历史** | 执行前执行 `export HISTFILE=/dev/null` 或在受控终端执行，防止密码进入 Shell 历史 |
| **日志脱敏** | 工具内置 `redact.mjs` 模块，所有日志输出经 SHA-256 指纹 + 正则掩码脱敏 |
| **证据文件** | 证据 JSON 仅含凭据指纹（SHA-256），不含明文 |
| **进程信息** | 环境变量不会出现在 `ps` 命令的默认输出中（须 `ps -e` 或 root 权限才可见） |

### 2.2 停止条件（遇到以下任一情况立即停止执行）

| 停止条件编号 | 条件 | 处置 |
|-------------|------|------|
| STOP-01 | Phase 0 前置检查任一项 FAIL | 修复环境问题后重新从 Phase 0 开始 |
| STOP-02 | 凭据轮换后新凭据 SMB 连接失败 | 执行回滚（§8.1），排查新密码复杂度/字符转义问题 |
| STOP-03 | 旧凭据撤销验证发现旧凭据仍可用 | 执行回滚（§8.1），排查 smbpasswd 是否实际生效 |
| STOP-04 | 权限收紧后 SMB 读取功能失效 | 执行回滚（§8.2），排查 read only 配置是否过度收紧 |
| STOP-05 | 权限收紧后归档目录不可访问 | 执行回滚（§8.2），排查归档目录权限保留配置 |
| STOP-06 | ADB 设备连接断开 | 跳过设备部署步骤，标记 `DEVICE_DEPLOY_SKIPPED`，后续手动部署 |
| STOP-07 | SSH 连接中断 | 标记 `INTERRUPTED` 状态，手动核验服务器当前状态后决定回滚或继续 |
| STOP-08 | 回滚演练失败 | **禁止执行生产变更**，排查回滚路径问题后重新验证 |

### 2.3 执行人员要求

- **运维人员**：持有新密码、SSH 密钥访问权限、ADB 设备访问权限
- **PM**：审批执行授权、审批 GAP 关闭、审批生产发布（独立于运维执行）
- **Gate Reviewer**：独立审查 GAP 闭环证据，逐项核验真实性与完整性

---

## 3. Phase 0 — 前置检查（只读，无副作用）

### 3.1 目标

核验执行环境就绪，所有前置条件满足。**本阶段不修改任何配置**。

### 3.2 执行命令

```bash
# 0.1 确认工作目录
cd C:/Users/DELL/IDEProjects/pad2

# 0.2 确认 Node.js 版本
node --version
# 预期输出: v24.19.0

# 0.3 确认 AU-004 工具脚本存在
ls scripts/au004-rotate-cred.mjs scripts/au004-perm-tighten.mjs scripts/au004-gen-evidence.mjs scripts/au004-safety-verify.mjs
# 预期: 4 个文件全部存在

# 0.4 确认共享模块存在
ls scripts/au004-lib/*.mjs
# 预期: 10 个文件全部存在

# 0.5 SSH 连接验证
ssh -i ~/.ssh/pad2_cred_closure -o ConnectTimeout=10 debian@192.168.2.3 'echo SSH_OK'
# 预期输出: SSH_OK

# 0.6 SMB 服务状态验证
ssh -i ~/.ssh/pad2_cred_closure debian@192.168.2.3 'systemctl is-active smbd'
# 预期输出: active

# 0.7 当前 SMB 配置确认
ssh -i ~/.ssh/pad2_cred_closure debian@192.168.2.3 'sudo testparm -s --section-name=share 2>/dev/null'
# 预期: 含 "read only = No"（确认当前权限过宽，须收紧）

# 0.8 SMB 账户列表确认
ssh -i ~/.ssh/pad2_cred_closure debian@192.168.2.3 'sudo pdbedit -L'
# 预期: 含 debian:1000:debian

# 0.9 ADB 设备连接验证
ADB="C:/Users/DELL/IDEProjects/pad2/local-sdk/platform-tools/adb.exe"
"$ADB" devices
# 预期: AJ7XJV6904H00320 device

# 0.10 设备端凭据文件确认
MSYS_NO_PATHCONV=1 "$ADB" -s AJ7XJV6904H00320 shell cat /sdcard/Android/data/com.pad2.filemanager/files/update_cred.json
# 预期: JSON 含 "password":"9090"（确认旧密码待轮换）

# 0.11 工具只读审计（凭据轮换工具 dry-run）
node scripts/au004-rotate-cred.mjs --dry-run
# 预期: 输出当前指纹 + 历史泄露扫描 + 差异预览，不修改任何配置

# 0.12 工具只读审计（权限收紧工具 dry-run）
node scripts/au004-perm-tighten.mjs --dry-run
# 预期: 输出当前权限 + 目标权限 + 差异预览，不修改任何配置

# 0.13 回滚演练（不实际执行生产变更）
node scripts/au004-safety-verify.mjs --dry-run --drill
# 预期: 输出回滚演练计划，验证回滚路径可行
```

### 3.3 前置检查通过标准

| 检查项 | 通过标准 |
|--------|---------|
| 0.1~0.4 工具就绪 | 全部文件存在 |
| 0.5 SSH 连接 | 输出 SSH_OK |
| 0.6 smbd 服务 | active |
| 0.7 SMB 配置 | 含 `read only = No`（确认须收紧） |
| 0.8 SMB 账户 | 含 debian 账户 |
| 0.9 ADB 设备 | AJ7XJV6904H00320 device（非 offline） |
| 0.10 设备凭据 | JSON 含 password 字段 |
| 0.11 轮换工具 dry-run | 输出指纹 + 差异预览，无错误 |
| 0.12 权限工具 dry-run | 输出权限差异预览，无错误 |
| 0.13 回滚演练 dry-run | 输出回滚计划，无错误 |

**任一项 FAIL → 停止执行（STOP-01），修复后重新从 Phase 0 开始。**

---

## 4. Phase 1 — 凭据轮换（GAP-01）

### 4.1 目标

在远程 SMB 服务器轮换 `debian` 账户密码，使旧密码 `9090` 失效，新密码生效。

### 4.2 前置条件

- Phase 0 全部通过
- 运维人员已获 PM 执行授权
- 新密码已通过安全渠道生成（≥ 16 位，含大小写字母 + 数字 + 特殊字符）
- 新密码不含 Shell 特殊字符（`$`、`` ` ``、`\`、`"`、`'`、`!`）或已正确转义

### 4.3 执行命令

```bash
# 1.1 设置环境变量（在受控终端执行，禁止在聊天/日志中明文传递）
export HISTFILE=/dev/null
export PAD2_SMB_NEW_PASSWORD='<新密码>'
export PAD2_SMB_OLD_PASSWORD='9090'

# 1.2 验证环境变量已设置（不输出明文，仅确认非空）
[ -n "$PAD2_SMB_NEW_PASSWORD" ] && echo "NEW_PASSWORD_SET" || echo "NEW_PASSWORD_MISSING"
[ -n "$PAD2_SMB_OLD_PASSWORD" ] && echo "OLD_PASSWORD_SET" || echo "OLD_PASSWORD_MISSING"
# 预期: 两行均输出 *_SET

# 1.3 执行凭据轮换（--execute 模式）
node scripts/au004-rotate-cred.mjs --execute --verbose
```

### 4.4 预期输出

工具将依次执行以下步骤并输出进度：

1. **读取环境变量** — 确认 `PAD2_SMB_NEW_PASSWORD` 和 `PAD2_SMB_OLD_PASSWORD` 非空
2. **计算指纹** — 输出旧/新凭据的 SHA-256 指纹（脱敏，不含明文）
3. **历史泄露扫描** — 扫描 Git 历史中的明文凭据（commit `dfd43cf`）
4. **记录回滚基线** — 保存旧凭据指纹用于回滚
5. **SSH 远程密码轮换** — 通过 SSH 执行 `smbpasswd -s -a debian` 更新密码
6. **新凭据 SMB 连接验证** — 使用新密码通过 `smbclient` 实际连接 SMB 共享
7. **旧凭据 SMB 连接验证** — 使用旧密码 `9090` 尝试连接，预期失败（证明旧密码已失效）
8. **设备端 ADB 部署** — 生成新 `update_cred.json` 并通过 ADB push 到设备
9. **脱敏归档** — 将轮换记录写入 `docs/au004/gap-01-rotation-evidence.json`

### 4.5 通过标准

| 检查项 | 通过标准 | 对应需求 |
|--------|---------|---------|
| SSH 轮换命令成功 | smbpasswd 返回 0 | REQ-AU004-WPA-R01 |
| 新凭据 SMB 连接成功 | smbclient 连接返回成功 | REQ-AU004-WPA-R05 |
| 旧凭据 SMB 连接失败 | smbclient 连接返回失败（预期） | REQ-AU004-WPA-R06 |
| 设备端凭据部署成功 | ADB push + 内容校验通过 | REQ-AU004-WPA-R08 |
| 证据文件生成 | `docs/au004/gap-01-rotation-evidence.json` 存在且含指纹 | REQ-AU004-WPA-R09 |
| 日志无明文凭据 | 所有输出仅含 SHA-256 指纹 | REQ-AU004-WPA-R11 |

**新凭据连接失败 → 停止执行（STOP-02），执行回滚（§8.1）。**
**旧凭据仍可用 → 停止执行（STOP-03），执行回滚（§8.1）。**

### 4.6 产出文件

- `docs/au004/gap-01-rotation-evidence.json` — 轮换证据（含时间戳、操作者、旧/新指纹、验证日志）

---

## 5. Phase 2 — 旧凭据撤销验证（GAP-02）

### 5.1 目标

独立验证旧密码 `9090` 已完全失效，不能用于 SMB 连接。

### 5.2 前置条件

- Phase 1 全部通过（凭据轮换成功）

### 5.3 执行命令

```bash
# 2.1 使用旧密码尝试 SMB 连接（预期失败）
ssh -i ~/.ssh/pad2_cred_closure debian@192.168.2.3 \
  "smbclient '//localhost/share' -U 'debian%9090' -c 'ls' 2>&1; echo EXIT_CODE=\$?"
# 预期: 输出错误信息（如 NT_STATUS_LOGON_FAILURE）+ EXIT_CODE=1

# 2.2 使用新密码尝试 SMB 连接（预期成功）
ssh -i ~/.ssh/pad2_cred_closure debian@192.168.2.3 \
  "smbclient '//localhost/share' -U 'debian%${PAD2_SMB_NEW_PASSWORD}' -c 'ls' 2>&1; echo EXIT_CODE=\$?"
# 预期: 输出目录列表 + EXIT_CODE=0

# 2.3 确认 smbpasswd 中旧密码已替换
ssh -i ~/.ssh/pad2_cred_closure debian@192.168.2.3 'sudo pdbedit -L -v -u debian 2>/dev/null | grep -i "account flags"'
# 预期: 账户存在且活跃（密码已更新）
```

### 5.4 通过标准

| 检查项 | 通过标准 | 对应需求 |
|--------|---------|---------|
| 旧密码连接失败 | `NT_STATUS_LOGON_FAILURE` 或类似错误 | REQ-AU004-WPA-R06 |
| 新密码连接成功 | 目录列表输出 + EXIT_CODE=0 | REQ-AU004-WPA-R05 |
| 证据记录 | Phase 1 的证据文件含旧凭据连接失败日志 | REQ-AU004-WPA-R12 |

**旧凭据仍可连接 → 停止执行（STOP-03），执行回滚（§8.1），排查 smbpasswd 是否实际生效。**

### 5.5 产出文件

- `docs/au004/gap-02-revocation-evidence.json` — 旧凭据撤销证据（含旧凭据连接失败日志）

---

## 6. Phase 3 — SMB 权限收紧（GAP-03）

### 6.1 目标

将 SMB 共享 `[share]` 的权限从 `read only = No`（可读写）收紧为 `read only = Yes`（只读），同时保留归档子目录 `/mnt/share/apk/dazongli/` 的 READ 权限。

### 6.2 前置条件

- Phase 1 + Phase 2 全部通过（凭据轮换成功 + 旧凭据已失效）
- 新凭据可用于 SMB 连接

### 6.3 执行命令

```bash
# 3.1 设置新密码环境变量（权限收紧工具须用新密码验证）
export PAD2_SMB_OLD_PASSWORD="$PAD2_SMB_NEW_PASSWORD"

# 3.2 执行权限收紧（--execute 模式）
node scripts/au004-perm-tighten.mjs --execute --verbose
```

### 6.4 预期输出

工具将依次执行以下步骤：

1. **只读权限检测** — 读取当前 `smb.conf` 配置 + 实际 SMB 操作测试
2. **差异预览** — 显示当前权限 vs 目标权限
3. **记录回滚基线** — 保存当前 `smb.conf` 配置用于回滚
4. **SSH 远程应用最小权限** — 修改 `smb.conf`：`read only = No` → `read only = Yes`
5. **SMB 配置重载** — `smbcontrol all reload-config`（平滑重载，不中断连接）
6. **服务器侧权限验证** — 尝试越权写入（预期失败）+ 尝试读取（预期成功）
7. **归档目录权限保留验证** — 确认 `/mnt/share/apk/dazongli/` 仍可 READ
8. **主链路回归冒烟** — SMB 文件浏览主链路读取功能验证
9. **脱敏归档** — 将权限差异报告写入 `docs/au004/gap-03-permission-evidence.json`

### 6.5 通过标准

| 检查项 | 通过标准 | 对应需求 |
|--------|---------|---------|
| 权限配置已变更 | `testparm` 输出 `read only = Yes` | REQ-AU004-WPB-R04 |
| 越权写入失败 | SMB 写入操作返回 `NT_STATUS_ACCESS_DENIED` | REQ-AU004-WPB-R05 |
| 读取成功 | SMB 读取操作返回目录列表 | REQ-AU004-WPB-R05 |
| 归档目录可读 | `/mnt/share/apk/dazongli/` 文件可读 | REQ-AU004-WPB-R09 |
| 主链路回归通过 | SMB 文件浏览读取功能正常 | REQ-AU004-WPB-R11 |
| 证据文件生成 | `docs/au004/gap-03-permission-evidence.json` 存在 | REQ-AU004-WPB-R06 |

**读取功能失效 → 停止执行（STOP-04），执行回滚（§8.2）。**
**归档目录不可访问 → 停止执行（STOP-05），执行回滚（§8.2）。**

### 6.6 产出文件

- `docs/au004/gap-03-permission-evidence.json` — 权限收紧证据（含前后配置差异 + 验证日志）

---

## 7. Phase 4 — 权限收紧验证证据（GAP-04）

### 7.1 目标

独立验证权限收紧已在服务器侧实际生效，生成可审计的验证证据。

### 7.2 前置条件

- Phase 3 全部通过（权限收紧成功）

### 7.3 执行命令

```bash
# 4.1 服务器侧越权写入测试（预期失败）
ssh -i ~/.ssh/pad2_cred_closure debian@192.168.2.3 \
  "smbclient '//localhost/share' -U 'debian%${PAD2_SMB_NEW_PASSWORD}' -c 'put /etc/hostname /mnt/share/apk/test-write-probe.txt' 2>&1; echo EXIT_CODE=\$?"
# 预期: 输出 NT_STATUS_ACCESS_DENIED + EXIT_CODE=1

# 4.2 服务器侧读取测试（预期成功）
ssh -i ~/.ssh/pad2_cred_closure debian@192.168.2.3 \
  "smbclient '//localhost/share' -U 'debian%${PAD2_SMB_NEW_PASSWORD}' -c 'ls apk/' 2>&1; echo EXIT_CODE=\$?"
# 预期: 输出 APK 目录列表 + EXIT_CODE=0

# 4.3 归档目录读取测试（预期成功）
ssh -i ~/.ssh/pad2_cred_closure debian@192.168.2.3 \
  "smbclient '//localhost/share' -U 'debian%${PAD2_SMB_NEW_PASSWORD}' -c 'ls apk/dazongli/' 2>&1; echo EXIT_CODE=\$?"
# 预期: 输出归档目录文件列表 + EXIT_CODE=0

# 4.4 确认 smb.conf 配置已收紧
ssh -i ~/.ssh/pad2_cred_closure debian@192.168.2.3 'sudo testparm -s --section-name=share 2>/dev/null | grep "read only"'
# 预期: read only = Yes
```

### 7.4 通过标准

| 检查项 | 通过标准 | 对应需求 |
|--------|---------|---------|
| 越权写入失败 | `NT_STATUS_ACCESS_DENIED` | REQ-AU004-WPB-R05 |
| 读取成功 | 目录列表输出 | REQ-AU004-WPB-R05 |
| 归档目录可读 | 归档文件列表输出 | REQ-AU004-WPB-R09 |
| 配置确认 | `read only = Yes` | REQ-AU004-WPB-R03 |
| 非脚本成功依据 | 实际 SMB 操作验证日志（非工具自报） | REQ-AU004-WPB-R10 |

### 7.5 产出文件

- `docs/au004/gap-04-permission-verify-evidence.json` — 权限验证证据（含实际 SMB 操作日志）

---

## 8. Phase 5 — 证据生成与汇总

### 8.1 目标

收集 Phase 1~4 的操作记录与验证结果，生成 GAP-01~04 闭环证据包。

### 8.2 前置条件

- Phase 1~4 全部通过

### 8.3 执行命令

```bash
# 5.1 生成证据汇总
node scripts/au004-gen-evidence.mjs --execute --verbose
# 预期: 收集 WP-A 轮换记录 + WP-B 权限差异 + 验证结果，生成 gap-closure-summary.json
```

### 8.4 预期输出

工具将依次执行以下步骤：

1. **收集 WP-A 轮换记录** — 读取 `gap-01-rotation-evidence.json` + `gap-02-revocation-evidence.json`
2. **收集 WP-B 权限差异** — 读取 `gap-03-permission-evidence.json` + `gap-04-permission-verify-evidence.json`
3. **收集验证结果** — 汇总新凭据可用 + 旧凭据失效 + 权限收紧三项测试结果
4. **脱敏处理** — 确保证据中不含明文凭据
5. **按 GAP 编号归档** — 生成各 GAP 的独立证据文件
6. **生成闭环证据包** — `docs/au004/gap-closure-summary.json`（含闭环结论建议，非自动关闭）

### 8.5 通过标准

| 检查项 | 通过标准 | 对应需求 |
|--------|---------|---------|
| 证据包生成 | `docs/au004/gap-closure-summary.json` 存在 | REQ-AU004-WPC-R09 |
| GAP-01 证据完整 | 含轮换记录 + 新凭据验证日志 | REQ-AU004-WPC-R02 |
| GAP-02 证据完整 | 含旧凭据连接失败日志 | REQ-AU004-WPC-R04 |
| GAP-03 证据完整 | 含权限差异报告 + 收紧后审计 | REQ-AU004-WPC-R03 |
| GAP-04 证据完整 | 含越权写入失败 + 读取成功日志 | REQ-AU004-WPC-R04 |
| 闭环结论建议 | 每项标注 `READY_FOR_REVIEW`（非"已关闭"） | REQ-AU004-WPC-R10 |
| 脱敏完整 | 证据中不含明文凭据 | REQ-AU004-WPC-R06 |

### 8.6 产出文件

- `docs/au004/gap-closure-summary.json` — GAP 闭环证据包（含 GAP-01~04 各项证据 + 闭环结论建议）

---

## 9. Phase 6 — 安全与回滚验证

### 9.1 目标

验证工具的幂等性、权限不足处理、网络中断处理、部分失败处理、重复执行识别，以及回滚路径可行。

### 9.2 前置条件

- Phase 1~5 全部通过

### 9.3 执行命令

```bash
# 6.1 安全验证（含幂等性 + 权限不足 + 网络中断 + 部分失败 + 重复执行）
node scripts/au004-safety-verify.mjs --execute --verbose
# 预期: 全部验证通过

# 6.2 回滚演练（不实际执行回滚，仅验证回滚路径可行）
node scripts/au004-safety-verify.mjs --execute --drill --verbose
# 预期: 回滚演练成功，回滚后状态验证通过
```

### 9.4 通过标准

| 检查项 | 通过标准 | 对应需求 |
|--------|---------|---------|
| 幂等性 | 重复执行工具提示"已完成"，不重复操作 | REQ-AU004-WPA-R10 / REQ-AU004-WPB-R07 |
| 权限不足处理 | 非授权用户执行被拒绝 | REQ-AU004-WPB-R08 |
| 网络中断处理 | 中断后状态标记为 INTERRUPTED | REQ-AU004-WPD-R03 |
| 部分失败处理 | 部分失败标记为可疑状态 | REQ-AU004-WPD-R04 |
| 重复执行识别 | 已完成操作识别并提示 | REQ-AU004-WPD-R05 |
| 回滚演练成功 | 回滚后状态恢复至基线 | REQ-AU004-WPD-R06 |

**回滚演练失败 → 停止执行（STOP-08），禁止继续，排查回滚路径问题。**

### 9.5 产出文件

- `docs/au004/safety-verify-result.json` — 安全验证结果
- `docs/au004/rollback-drill-evidence.json` — 回滚演练证据

---

## 10. Phase 7 — PM 最终 Gate Review

### 10.1 目标

PM 与 Gate Reviewer 独立审查 GAP-01~04 闭环证据，逐项裁定是否关闭。

### 10.2 前置条件

- Phase 1~6 全部通过
- 证据文件已生成且脱敏完整

### 10.3 审查清单

#### GAP-01 凭据轮换

| 检查项编号 | 检查项 | 核验方法 | 通过标准 |
|-----------|--------|---------|---------|
| G01-CHK-01 | 轮换工具可用 | 查阅 `gap-01-rotation-evidence.json` | 含工具执行记录 |
| G01-CHK-02 | SSH 远程执行 | 查阅轮换证据 | 含 SSH 命令执行日志 |
| G01-CHK-03 | 新凭据设置 | 查阅轮换证据 | 含新凭据指纹（SHA-256） |
| G01-CHK-04 | 新凭据可用性验证 | 查阅轮换证据 | 含新凭据 SMB 连接成功日志 |
| G01-CHK-05 | 设备端凭据更新 | 查阅轮换证据 | 含 ADB push + 内容校验 |
| G01-CHK-06 | 服务器侧验证 | 查阅轮换证据 | 含实际连接验证日志（非脚本成功） |

#### GAP-02 旧凭据撤销

| 检查项编号 | 检查项 | 核验方法 | 通过标准 |
|-----------|--------|---------|---------|
| G02-CHK-01 | 旧凭据撤销验证 | 查阅 `gap-02-revocation-evidence.json` | 含旧凭据连接失败日志 |
| G02-CHK-02 | 服务器侧验证 | 查阅撤销证据 | 含旧凭据实际连接失败日志 |

#### GAP-03 SMB 权限收紧

| 检查项编号 | 检查项 | 核验方法 | 通过标准 |
|-----------|--------|---------|---------|
| G03-CHK-01 | 权限检测工具可用 | 查阅 `gap-03-permission-evidence.json` | 含只读审计记录 |
| G03-CHK-02 | 当前权限确认 | 查阅权限证据 | 含收紧前权限记录 |
| G03-CHK-03 | 最小权限目标 | 查阅权限证据 | 仅 `/mnt/share/apk/` READ |
| G03-CHK-04 | 权限收紧执行 | 查阅权限证据 | SSH 应用 + 配置已变更 |
| G03-CHK-05 | 配置重载 | 查阅权限证据 | `smbcontrol all reload-config` 成功 |

#### GAP-04 权限收紧验证证据

| 检查项编号 | 检查项 | 核验方法 | 通过标准 |
|-----------|--------|---------|---------|
| G04-CHK-01 | 服务器侧权限验证 | 查阅 `gap-04-permission-verify-evidence.json` | 越权写入失败 + 读取成功 |
| G04-CHK-02 | 非脚本成功依据 | 审查验证证据 | 含实际 SMB 操作验证日志 |
| G04-CHK-03 | 归档目录权限保留 | 查阅验证证据 | `/mnt/share/apk/dazongli/` READ 可访问 |
| G04-CHK-04 | 主链路回归 | 查阅验证证据 | SMB 文件浏览读取功能正常 |

### 10.4 裁定规则

- 每个 GAP 独立验收，不得以总体通过掩盖单项失败
- 任一 GAP 内任一检查项 FAIL → 该 GAP 标记 `VERIFICATION_FAILED`
- 全部检查项 PASS → 该 GAP 标记 `READY_FOR_CLOSURE`
- **GAP 关闭须 PM 与 Gate Reviewer 狙立确认**（证据包 `READY_FOR_REVIEW` ≠ GAP 已关闭）
- **生产发布授权须 PM 单独审批**（GAP 全部关闭 ≠ 发布自动解阻）

### 10.5 裁定产出

PM 生成 `docs/au004/au004-gap-closure-review.md`，含：

- GAP-01~04 各项审查结果（PASS/FAIL）
- GAP 关闭裁定（CLOSED / NOT CLOSED）
- 生产发布授权裁定（AUTHORIZED / NOT AUTHORIZED）
- 审查人签字 + 日期

---

## 11. 回滚方案

### 11.1 凭据轮换回滚（Phase 1 失败时）

**触发条件**：新凭据 SMB 连接失败（STOP-02）或旧凭据仍可用（STOP-03）

**回滚步骤**：

```bash
# R-1.1 使用工具内置回滚（推荐）
node scripts/au004-rotate-cred.mjs --execute --drill
# 工具将从回滚基线恢复旧凭据

# R-1.2 手动回滚（工具不可用时）
ssh -i ~/.ssh/pad2_cred_closure debian@192.168.2.3 \
  "echo '9090\n9090' | sudo smbpasswd -s -a debian"
# 恢复旧密码 9090

# R-1.3 验证回滚成功
ssh -i ~/.ssh/pad2_cred_closure debian@192.168.2.3 \
  "smbclient '//localhost/share' -U 'debian%9090' -c 'ls' 2>&1; echo EXIT_CODE=\$?"
# 预期: 目录列表 + EXIT_CODE=0

# R-1.4 恢复设备端凭据
ADB="C:/Users/DELL/IDEProjects/pad2/local-sdk/platform-tools/adb.exe"
echo '{"host":"192.168.2.3","share":"share","path":"apk","username":"debian","password":"9090","domain":""}' > /tmp/update_cred_rollback.json
MSYS_NO_PATHCONV=1 "$ADB" -s AJ7XJV6904H00320 push /tmp/update_cred_rollback.json /sdcard/Android/data/com.pad2.filemanager/files/update_cred.json
```

### 11.2 权限收紧回滚（Phase 3 失败时）

**触发条件**：权限收紧后 SMB 读取功能失效（STOP-04）或归档目录不可访问（STOP-05）

**回滚步骤**：

```bash
# R-2.1 使用工具内置回滚（推荐）
node scripts/au004-perm-tighten.mjs --execute --drill
# 工具将从回滚基线恢复 smb.conf 配置

# R-2.2 手动回滚（工具不可用时）
ssh -i ~/.ssh/pad2_cred_closure debian@192.168.2.3 \
  "sudo sed -i 's/read only = Yes/read only = No/' /etc/samba/smb.conf && sudo smbcontrol all reload-config"
# 恢复 read only = No

# R-2.3 验证回滚成功
ssh -i ~/.ssh/pad2_cred_closure debian@192.168.2.3 'sudo testparm -s --section-name=share 2>/dev/null | grep "read only"'
# 预期: read only = No

# R-2.4 SMB 读取功能恢复验证
ssh -i ~/.ssh/pad2_cred_closure debian@192.168.2.3 \
  "smbclient '//localhost/share' -U 'debian%${PAD2_SMB_NEW_PASSWORD}' -c 'ls apk/' 2>&1; echo EXIT_CODE=\$?"
# 预期: 目录列表 + EXIT_CODE=0
```

### 11.3 全量回滚（重大故障时）

**触发条件**：凭据轮换 + 权限收紧均失败，SMB 服务完全不可用

**回滚步骤**：

```bash
# R-3.1 恢复 smb.conf（权限回滚）
ssh -i ~/.ssh/pad2_cred_closure debian@192.168.2.3 \
  "sudo sed -i 's/read only = Yes/read only = No/' /etc/samba/smb.conf && sudo smbcontrol all reload-config"

# R-3.2 恢复旧密码（凭据回滚）
ssh -i ~/.ssh/pad2_cred_closure debian@192.168.2.3 \
  "echo '9090\n9090' | sudo smbpasswd -s -a debian"

# R-3.3 重启 smbd 服务（如配置重载不足）
ssh -i ~/.ssh/pad2_cred_closure debian@192.168.2.3 'sudo systemctl restart smbd'

# R-3.4 恢复设备端凭据
ADB="C:/Users/DELL/IDEProjects/pad2/local-sdk/platform-tools/adb.exe"
echo '{"host":"192.168.2.3","share":"share","path":"apk","username":"debian","password":"9090","domain":""}' > /tmp/update_cred_rollback.json
MSYS_NO_PATHCONV=1 "$ADB" -s AJ7XJV6904H00320 push /tmp/update_cred_rollback.json /sdcard/Android/data/com.pad2.filemanager/files/update_cred.json

# R-3.5 全量验证
ssh -i ~/.ssh/pad2_cred_closure debian@192.168.2.3 \
  "smbclient '//localhost/share' -U 'debian%9090' -c 'ls apk/' 2>&1; echo EXIT_CODE=\$?"
# 预期: 目录列表 + EXIT_CODE=0
```

---

## 12. GAP 闭环证据清单

运维执行完成后，以下文件须全部存在且内容完整：

| 文件路径 | 对应 GAP | 内容要求 |
|---------|---------|---------|
| `docs/au004/gap-01-rotation-evidence.json` | GAP-01 | 时间戳 + 操作者 + 旧/新指纹 + 新凭据连接成功日志 |
| `docs/au004/gap-02-revocation-evidence.json` | GAP-02 | 旧凭据连接失败日志 + 时间戳 |
| `docs/au004/gap-03-permission-evidence.json` | GAP-03 | 权限前后差异 + 收紧后配置 + 重载日志 |
| `docs/au004/gap-04-permission-verify-evidence.json` | GAP-04 | 越权写入失败 + 读取成功 + 归档目录可读 |
| `docs/au004/gap-closure-summary.json` | 全部 | GAP-01~04 证据汇总 + 闭环结论建议 |
| `docs/au004/safety-verify-result.json` | 安全 | 幂等性 + 权限不足 + 网络中断 + 部分失败 + 重复执行 |
| `docs/au004/rollback-drill-evidence.json` | 安全 | 回滚演练成功 + 回滚后状态验证 |

### 证据审查要点

1. **脱敏完整性** — 所有文件不含明文凭据（仅含 SHA-256 指纹）
2. **时间戳一致性** — 各证据文件时间戳在合理范围内（同一次执行会话）
3. **服务器侧验证** — 含实际 SMB 操作日志（非脚本自报成功）
4. **闭环结论建议** — 标注 `READY_FOR_REVIEW`（非"已关闭"）
5. **独立审查** — Gate Reviewer 逐项核验，不得自审自批

---

## 13. 执行后状态矩阵

运维执行完成后的预期状态：

| 项目 | 执行前 | 执行后 |
|------|--------|--------|
| SMB `debian` 密码 | `9090`（已泄露） | 新密码（已轮换） |
| 旧密码 `9090` | 可用 | **失效** |
| SMB `[share]` 权限 | `read only = No`（可读写） | `read only = Yes`（只读） |
| `/mnt/share/apk/` 写入 | 可写 | **不可写**（NT_STATUS_ACCESS_DENIED） |
| `/mnt/share/apk/` 读取 | 可读 | 可读（保留） |
| `/mnt/share/apk/dazongli/` 读取 | 可读 | 可读（保留） |
| 设备端 `update_cred.json` | password=9090 | password=新密码 |
| GAP-01 | 工具就绪，运维未执行 | **READY_FOR_REVIEW** |
| GAP-02 | 未验证完成 | **READY_FOR_REVIEW** |
| GAP-03 | 工具就绪，运维未执行 | **READY_FOR_REVIEW** |
| GAP-04 | 尚未完成闭环 | **READY_FOR_REVIEW** |
| Production Release | BLOCKED | BLOCKED（须 PM 独立审批解阻） |

---

## 14. 附录

### 14.1 工具脚本接口

| 脚本 | 参数 | 说明 |
|------|------|------|
| `au004-rotate-cred.mjs` | `--help` / `--dry-run` / `--execute` / `--verbose` / `--drill` | 凭据轮换与旧凭据撤销 |
| `au004-perm-tighten.mjs` | `--help` / `--dry-run` / `--execute` / `--verbose` / `--drill` | SMB 最小权限整改 |
| `au004-gen-evidence.mjs` | `--help` / `--dry-run` / `--execute` / `--verbose` / `--drill` | 证据自动生成 |
| `au004-safety-verify.mjs` | `--help` / `--dry-run` / `--execute` / `--verbose` / `--drill` | 安全与回滚验证 |

### 14.2 环境变量

| 变量名 | 用途 | 注入方式 |
|--------|------|---------|
| `PAD2_SMB_NEW_PASSWORD` | 新 SMB 密码 | 环境变量（禁止命令行参数） |
| `PAD2_SMB_OLD_PASSWORD` | 旧 SMB 密码 | 环境变量（Phase 1 用 9090，Phase 3 用新密码） |
| `HISTFILE` | Shell 历史文件 | 执行前设为 `/dev/null` 防止密码进入历史 |

### 14.3 SSH 连接模板

```bash
ssh -i ~/.ssh/pad2_cred_closure -o ConnectTimeout=15 debian@192.168.2.3 '<命令>'
```

### 14.4 ADB 命令模板

```bash
ADB="C:/Users/DELL/IDEProjects/pad2/local-sdk/platform-tools/adb.exe"
MSYS_NO_PATHCONV=1 "$ADB" -s AJ7XJV6904H00320 shell '<命令>'
```

### 14.5 SMB 客户端命令模板

```bash
# 通过 SSH 在服务器本地执行 smbclient
ssh -i ~/.ssh/pad2_cred_closure debian@192.168.2.3 \
  "smbclient '//localhost/share' -U 'debian%<密码>' -c '<操作>' 2>&1; echo EXIT_CODE=\$?"
```

### 14.6 相关文档

| 文档 | 路径 | 说明 |
|------|------|------|
| AU-004 需求规格 | `.codeartsdoer/specs/au_004/spec.md` | 45 需求，4 GAP 定义 |
| AU-004 实现方案 | `.codeartsdoer/specs/au_004/design.md` | 4 工具 + 10 模块设计 |
| AU-004 任务清单 | `.codeartsdoer/specs/au_004/tasks.md` | 52 任务（全部完成） |
| AU-004 Gate Review | `docs/au004/au004-gate-review.md` | 工具能力审查报告（52/52 PASS） |
| AU-003 Gate Review | `docs/p003-ui/shots/s6/au003/au003-gate-review.md` | AU-003 审查报告（31/31 PASS） |

---

## 15. 变更日志

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| 1.0 | 2026-10-27 | 初始版本生成 |

---

> **最终原则**: 工具能力完成 ≠ GAP 关闭 ≠ 发布解阻。凭据轮换工具可用 ≠ 凭据已轮换。权限收紧工具可用 ≠ 权限已收紧。本手册执行成功后，GAP 标记为 `READY_FOR_REVIEW`，须 PM 与 Gate Reviewer 独立确认后方可关闭。生产发布授权须 PM 单独审批。
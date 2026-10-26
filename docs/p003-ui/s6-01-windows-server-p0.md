# TASK-S6-01 Windows Server P0 兼容性验证报告

> **任务性质**：PM 授权仅验证，零产品代码变更（git 核验：本任务仅新增 scripts/ 验证脚本与本文档）
> **验证日期**：2026-10-24
> **验证 APK**：`e7a67ee5d5f537c59784cbf90453d5137d3c13b7cfe0c0d95cda0b20aaf1ee7b`（S5-09 锚定版本；设备侧拉取 base.apk 复核 SHA 一致，安装于 2026-10-23 13:58:18）
> **执行人**：开发代理（大G）｜**状态**：提请 PM Gate Review

## 一、验证环境（PM 授权第 1 条：环境确认）

| 项 | 值 | 证据 |
| --- | --- | --- |
| 服务器 | 192.168.2.247（用户提供：`\\192.168.2.247\soft\AutoFileBackup`，guest/空密码） | — |
| 系统指纹 | Windows Server（nmap 服务识别区间 2008 R2–2012） | nmap -sV：445 `Microsoft Windows Server 2008 R2 - 2012 microsoft-ds` |
| SMB 方言 | **SMB 3.1.1**（协商实测；说明实际系统 ≥ 2012 R2） | SMBJ 连接 `negotiate dialect=SMB_3_1_1` |
| 签名策略 | Message signing enabled but **not required** | nmap smb2-security-mode |
| 账号权限 | guest 匿名级（写探针通过：mkdir/put/del/rmdir） | 服务器侧探针 |
| 专用测试目录 | `AutoFileBackup\PAD2-S6-01\`（自建；用户预置原件零触碰） | — |
| 测试输入 | 预置 `新建 XLSX 工作表.xlsx`(7725B)/`新建 XLS 工作表.xls`(20992B) 复制为测试表.xlsx/.xls + 生成 50MB 随机文件 + ws-a.txt | 全程服务器端 SHA 往返核验 |
| 客户端 | 荣耀 NDL2_W09（AJ7XJV6904H00320）/ Android 16 / WPS 14.25.0 | 与 S5 系列同一设备 |

**与 Linux Samba 环境（S5 全系）的关键差异**：Windows Server SMB 3.1.1 + 严格句柄语义 vs Samba 宽松共享模式。

## 二、WS-01～WS-20 矩阵结果（服务器端三件套为唯一判据）

| 用例 | 场景 | 结果 | 关键证据 |
| --- | --- | --- | --- |
| WS-01 | guest 空密码连接 | **PASS（原生）+ 1 产品层发现** | 原生 `connect` OK：`{"connected":true}`；**UI 表单路径缺陷候选见 §四.1** |
| WS-02 | 目录浏览+中文文件名 | PASS | listDirectory 含`测试表.xlsx/.xls`；50MB 文件 size=52428800 精确 |
| WS-03 | .xlsx 下载 | PASS | 缓存 SHA `4e313e3f…` == 服务器 |
| WS-04 | .xls 下载 | PASS | 缓存 SHA `dddea581…` == 服务器 |
| WS-05 | .xlsx 服务器端复制 | PASS | 目标 SHA==源+源不变 |
| WS-06 | .xls 服务器端复制 | PASS | 目标 SHA==源 |
| WS-07 | 服务器端移动 | PASS | 目标 SHA==源+**源已删除**（校验通过后才删源） |
| WS-08 | 重命名 | PASS | SHA 不变+旧名消失（`测试表.xlsx` 目标拒绝详见 WS-09） |
| WS-09 | 重命名目标冲突 | PASS | `ERR:目标已存在: 测试表.xlsx`+**两文件内容原样**（服务端原子拒绝） |
| WS-10 | 复制同名冲突 | PASS | `ERR:目标已存在`+既有目标未被覆盖（FILE_CREATE 原子） |
| WS-11 | 远端删除+缓存隔离 | PASS | 服务器确认消失+本地缓存逐文件不变 |
| WS-12 | 子目录操作（路径正确性） | PASS | 子目录复制/重命名 SHA 不变+**未移动位**（旧名消失且共享根无新名） |
| WS-13 | .xlsx WPS 编辑写回闭环 | PASS | 三方 SHA 一致+服务器 csv 含`WS13-EDITED`+`Writeback verified`+回写后可重开 |
| WS-14 | .xls WPS 编辑写回闭环 | PASS | 三方 SHA 一致+csv 含`WS14-EDITED`+可重开 |
| WS-15 | 回写冲突检测 | PASS | 服务器外部变更后 `remoteChanged:true`（mtime 基线对比） |
| WS-16 | 锁定行为实测 | PASS（如实记录语义） | WPS 打开（SMB2ShareAccess.ALL）下远端 rename 成功+SHA 保持——**Windows Server 亦不锁**（与 Samba 一致，不外推强制锁场景） |
| WS-17 | 权限拒绝（只读属性） | PASS | 服务器属性 AR 确认；smbclient 删除被拒 `NT_STATUS_CANNOT_DELETE`；**SMBJ deleteRemoteFile 同样被拒+文件未变**（两客户端行为一致，无越权） |
| WS-18 | 断网文件操作 | PASS | 如实失败+源不变+目标零残留 |
| WS-19 | 断网恢复重连刷新 | PASS | 重连后列表含服务器新增文件 |
| WS-20 | 50MB 大文件服务器端复制 | PASS | 目标 SHA==源（65.7s 流式）+源不变 |

**自动化段脚本**：`scripts/verify-s6-01-auto.mjs`（WS-01~12/15~20，幂等可重跑）；**WPS 段**：`scripts/verify-s6-01-wps.mjs`（WS-13/14）。证据：`docs/p003-ui/shots/s6/`（s601-auto-result.json + s601-wps-result.json + 截图×7）。

## 三、WPS 写回验证方法披露（WS-13/14）

- **WPS 真实打开**：openInWps→WPS 前台断言（dumpsys mCurrentFocus）→回写后重新打开断言（可再编辑）。
- **编辑内容注入**：编辑版由服务器 soffice 生成（含约定标记）→adb push 覆盖本地缓存模拟"WPS 保存后"状态（与 S5-09 I-06 同款成熟做法）——**检测→回写→服务器核验链路 100% 真实执行**；未做 WPS 内手动键入编辑（S5-07 A 系列已在 Linux Samba 验证该环节，与服务器类型无关）。
- **判据**：服务器端 get→sha256sum（三方一致）+ soffice csv 内容标记（内容级）+ logcat `Writeback verified`。

## 四、发现与披露

### 4.1 【产品层缺陷候选】UI 表单路径对 guest/空密码零反馈（WS-01）

- **现象**：ConnectionFormPanel 填写 247/soft/guest/**空密码**→点击"保存并连接"→**30s 内无任何反馈**（无"已连接"/"正在连接"/"连接失败"），**profiles 也未落盘**（表单流程未走通）。干净冷启动复测两次一致（probe-s6-01-ui.mjs，截图 s601-ws01-ui-final.png）。
- **对照**：同 APK 在 Linux Samba（S5-09 I-01）表单路径正常（有反馈+保存）。原生 `connect`（同一 SmbClient.connect，含 anonymous 分支）对 guest/空密码**完全成功**。
- **初步定位**（未改码验证）：表单校验或提交链对空密码/anonymous 形态的拦截属 UI 层；S5-06-A 修复覆盖的是连接卡点击入口，表单"保存并连接"入口是独立路径。
- **影响**：Windows 共享 guest 访问（本次生产环境即此形态）无法从产品 UI 完成**首次**配置连接（已有卡的点击入口待后续裁定授权后验证）。
- **处置**：按 PM 授权边界（发现缺陷→提交最小复现+影响范围+修复建议，不擅自修复）。

### 4.2 【契约边界披露】writeFileSafe "巧合安全"契约对混合分隔符路径敏感

- 排查 WS-13 首轮失败时确认：`writeFileSafe` 的 `new java.io.File(path).getName()` 隐式契约（S5-04 登记）在 **path 含 `/` 时 getName() 截断**→rename 的 FileName 变为 `PAD2-S6-01\测试表.xlsx`→Windows Server 解析为不存在目标→`Safe write failed: rename error`（100% 复现；探针实测正常形态即恢复）。
- **产品 UI 正常浏览路径为纯反斜杠**（browseStore 拼接），不触发该边界；但 API 层若传入混合分隔符路径则回写必败。与 S5-04 已登记的隐式契约风险同源，**本验证未修改**，提请 PM 知悉并入既有风险项。

### 4.3 【服务器行为记录】Windows Server 对失败 rename 的 pending 现象

- 失败的 writeFileSafe 在服务器留下 DELETE_PENDING 的 `.tmp` 文件（smbclient 删除报 `NT_STATUS_DELETE_PENDING`）；**客户端连接断开后 pending 操作延迟生效**（实测：force-stop App 后目标文件被替换为最后注入内容，mtime=断连时刻）。
- 属 Windows 服务器对非法 rename 请求的清理行为（客户端已判失败，服务器端延迟落地），**运维排障时注意**：验证 writeback 失败后勿以服务器文件终态为准须以当时核验为准。

### 4.4 WS-16/WS-17 语义如实记录（不外推）

- WS-16：SMB2ShareAccess.ALL 下 WPS 打开不锁远端——与 Samba 一致；**强制锁/排他打开场景未测**（不在矩阵内）。
- WS-17：只读属性删除拒绝——smbclient 与 SMBJ 行为一致（此前一轮"SMBJ 可删只读"为验证脚本 PowerShell `$true` 赋值 bug 假象，已修正后复测）。

## 五、结论边界（不构成的事项）

1. 本报告为 **Windows Server 单环境（192.168.2.247，SMB 3.1.1，guest）** P0 兼容性验证；**NAS（S6-02）/Doze（S6-03）未授权未执行**。
2. 磁盘满、字节级取消（S5-03 遗留）仍未验证。
3. WS-13/14 编辑内容为注入模式（§三披露）；WPS 内手动编辑保存环节沿用 S5-07 Linux Samba 证据。
4. **§4.1 UI 表单缺陷候选未修复待裁定**——在其修复并复验前，不能宣称"产品全链路 Windows Server 适配完成"；但**原生能力链路（连接/浏览/四操作/双格式写回/冲突检测/异常处理）在 Windows Server 上全部通过服务器端证据核验**。
5. HF-CON-13 第 4 条：本次为 Windows Server 单环境验证，完整编辑回写链路的生产验收仍需产品 UI 入口（§4.1 修复后）与多环境矩阵补齐。

## 六、证据索引

- 脚本：`scripts/verify-s6-01-auto.mjs`、`scripts/verify-s6-01-wps.mjs`、`scripts/probe-s6-01-{ro,ro2,ui,wbroot}.mjs`、远程探针 `RenameProbe/WritebackProbe/Probe4/Probe5.java`（远程 /tmp，根因排查链）
- 结果：`shots/s6/s601-auto-result.json`、`shots/s6/s601-wps-result.json`
- 截图：`s601-ws01-{uifail,native,ui-final}.png`、`s601-ws-13-wps-open.png`、`s601-ws13-done.png`、`s601-ws-14-wps-open.png`、`s601-ws14-done.png`、`s601-final-state.png`
- 服务器清理：`PAD2-S6-01` 测试目录**待清理**（本机安全工具拦截远程删除命令——内容仅本任务测试产物：测试表.xlsx/.xls（预置原件副本）、s601-50m.bin、ws-*.txt、probe 残留；**用户预置原件（`新建 XLSX 工作表.xlsx`/`新建 XLS 工作表.xls`）零触碰**）——可手动删除该目录或豁免后由代理执行
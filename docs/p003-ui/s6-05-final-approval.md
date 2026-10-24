# TASK-S6-05 最终发布审批结论（FINAL APPROVAL）

> **任务性质**：PM 授权最终审批材料整理（基于 s6-05-production-release-gate.md + s6-05-fix-verification.md 整合；零代码修改）
> **日期**：2026-10-24｜**执行人**：开发代理（大G）
> **前置终裁**：S6-05-FIX = PASS / CLOSED（PM 报告级审查，提交 `4a78f5a`）
> **审批状态**：✅ 证据完整无新增阻断项——**建议开放生产发布门**（正式生产发布须 PM 单独裁定，本审批不含发布授权）

## 〇、终审结论摘要

经 S6-05-FIX 修复闭环，**R-1 阻断项（凭据暴露）已四维关闭**（桥日志关闭+DEBUGGABLE 移除+凭据轮换+历史脱敏）；release 构建链首次产出非 DEBUGGABLE 候选 APK；专项复验零泄露+RC 全量回归 PASS。**PM 五项确认要求逐条满足（§一~§五）**，无新增阻断项。

**建议裁定**：开放生产发布门，授权受控范围内部署。**正式生产发布须 PM 单独裁定**——本审批仅为证据材料，不含发布授权。

---

## 一、发布对象锁定（PM 确认要求 1）

| 项 | 值 | 可复核证据 |
| --- | --- | --- |
| **发布对象** | `pad2-p003-s6-05-fix.apk`（release 构建，非 debug） | 归档 `docs/p003-ui/artifacts/` |
| **完整 SHA-256** | `d6d75d2028bae7600ecf388ea8602c0001d9d36108e93d14617a71d823f099e8` | 三方一致核验（§一.下） |
| 构建变体 | release（`./gradlew :app:assembleRelease`，minifyEnabled false） | 远程 BUILD SUCCESSFUL 归档 |
| 签名后产物 | apksigner v1+v2 签名（debug keystore 受控部署密钥） | apksigner verify 通过 |
| versionCode / versionName | 1 / 1.0 | dumpsys |
| minSdk / targetSdk | 26 / 36 | dumpsys |
| 构建提交链 | f8dc57d（FIX-01）→7ea0605（RC）→78389df（S6-04 终裁）→1ee00a4（S6-05 审批包）→4a78f5a（S6-05-FIX） | git log |
| 修复提交 | `4a78f5a`（capacitor.config.ts +9 行配置；零产品逻辑/冻结区变更） | git show --stat |

**三方 SHA-256 一致性核验**：
- 本地归档产物：`d6d75d2028bae7600ecf388ea8602c0001d9d36108e93d14617a71d823f099e8` ✓
- 远程构建产物：同上（scp 回传哈希核验） ✓
- 设备安装产物：pm path 拉取 base.apk 实测 = 同上（lastUpdateTime 2026-10-24 14:25:29） ✓

**结论**：发布对象身份三方确凿、可追溯、可复核。✅

## 二、构建身份证据（PM 确认要求 2）

| 项 | 值 | 可复核证据 |
| --- | --- | --- |
| **pkgFlags** | `[ HAS_CODE ALLOW_CLEAR_USER_DATA ALLOW_BACKUP ]`——**DEBUGGABLE 已移除** | dumpsys 实测（对比修复前 `[ DEBUGGABLE ... ]`） |
| 签名方案 | APK Signature Scheme **v1+v2** | apksigner verify --print-certs |
| 签名证书 DN | `C=US, O=Android, CN=Android Debug` | apksigner 输出 |
| 证书 SHA-256 | `a41e9a222026def9f7e7ed1106909e6b67bec99cda69b3455dcfad25d4bb5290` | apksigner 输出 |
| 设备侧签名摘要 | `PackageSignatures{fa69b9b version:2, signatures:[fa40ec2b]}` | dumpsys |
| **桥日志配置** | `loggingBehavior: 'none'`（无条件关闭，Capacitor 8.5.3 LOG_BEHAVIOR_NONE 分支） | capacitor.config.json 落入核验 |
| CDP 调试通道 | `webContentsDebuggingEnabled: true`（受控部署期间保留验证通道——**正式对外发布时须移除此行**） | capacitor.config.json |

**可复核路径**：
- APK 文件：`docs/p003-ui/artifacts/pad2-p003-s6-05-fix.apk`（本地 sha256sum 可重算）
- 签名证书：`apksigner verify --print-certs <APK 路径>`（任何持有 APK 者可独立核验）
- 设备安装：`adb shell dumpsys package com.pad2.filemanager | grep -E "pkgFlags|signatures|lastUpdateTime"`
- 桥配置：`unzip -p <APK> assets/capacitor.config.json | grep loggingBehavior`

**结论**：不可调试属性+签名+构建身份均有可复核证据。✅

## 三、历史凭据与历史日志风险处置（PM 确认要求 3）

### 3.1 受影响凭据范围与轮换

| 凭据 | 用途 | 泄露途径 | 处置 | 失效核验 |
| --- | --- | --- | --- | --- |
| **pad2gate3**（Linux Samba 测试账号） | S2/S8 错误凭据场景+unset 配置创建 | 修复前 debug 构建桥日志 echo methodData 含明文→logcat；历史报告引用 | **smbpasswd 随机轮换**（openssl rand 16 字符） | `smbclient -U 'pad2gate3%<旧凭据>'` → `NT_STATUS_LOGON_FAILURE` ✓ |
| 新凭据存放 | 后续验证使用 | — | 远程 `debian@192.168.2.3:~/pad2_cred_next.txt`（chmod 600） | 新凭据 `smbclient -L` 可用 ✓ |
| guest 空密码（Windows Server 247） | guest 连接场景 | 空密码无泄露内容 | 无需轮换（空密码本身无秘密） | — |

### 3.2 历史日志访问边界声明

- **泄露面**：设备本地 logcat（VERBOSE 级，修复前 debug 构建恒输出）
- **读取前提**：①USB 调试连接+adb logcat；②持 READ_LOGS 特权的组件（Android 4.1+ 第三方 App 默认无权读取他人日志）；③日志被收集/粘贴共享时
- **历史日志处置**：修复前 logcat 缓冲区已自然滚动覆盖（VERBOSE 条目秒级被 Chrome 渲染日志洪流挤出）——**无持久化历史日志残留**（logcat 是内存缓冲区非持久存储）
- **当前状态**：修复后 release 构建桥日志关闭（loggingBehavior:'none'）——**新会话零 echo**（T6 专项复验实测）

### 3.3 历史证据脱敏

- **docs/ 报告脱敏**：5 处明文凭据引用替换掩码 `<已轮换-2026-10-24>`（s6-05-production-release-gate.md / s6-01-fix01-verification.md / s6-04-rc-verify.md / tasks.md / shots/s5/s506a-rootcause.json）——零残留
- **脚本旧凭据常量**：S3~S5 系列 20+ 历史脚本含旧凭据常量（已失效不可用）——登记后续改 env 传入（旧凭据已失效无安全风险，脚本属验证资产非发布物）
- **本报告零明文**（PM 要求"新报告不复制明文"）✅

**结论**：历史凭据与历史日志风险已妥善处置。✅

## 四、R-1~R-4 处置边界+停止条件+回滚步骤（PM 确认要求 4）

### 4.1 风险处置边界

| 风险 | 修复前 | 修复后 | 处置边界 |
| --- | --- | --- | --- |
| **R-1 凭据暴露** | ⛔ 阻断性（bridge V 日志 echo 明文密码+DEBUGGABLE） | ✅ **已闭环**（loggingBehavior:'none'+release 去 DEBUGGABLE+凭据轮换+历史脱敏四维） | 修复确认可靠消除（T6 实测零泄露）；不得仅凭配置项存在判定通过——已实测验证 |
| R-1 界面回显（复选框不回显） | 体验级登记 | 维持登记 | **纯体验项**（密码字段回显空+复选框未勾选——无凭据泄露）；不得因此恢复密码明文日志 |
| R-2 混合分隔符路径 | 暂缓 | 维持暂缓 | 适用边界：仅产品 UI 正常浏览路径（纯反斜杠）受兼容性承诺；任意路径输入不在验证范围 |
| R-3 DELETE_PENDING | 运维观察 | 维持 | 失败后状态核验三步骤固化（§4.3）；不引发错误重试（UI 如实失败呈现） |
| R-4 环境边界 | NAS/Doze 未授权 | 维持 | 受控部署范围声明（§五）；不外推未验证环境 |

### 4.2 停止条件（立即停止扩大部署的触发器）

| # | 触发条件 | 当前状态 |
| --- | --- | --- |
| 1 | 安装包身份不符（SHA-256 与 `d6d75d20…f099e8` 不一致） | 未触发（三方一致已核验） |
| 2 | **凭据泄露** | **✅ 已关闭**（修复前命中→修复后零泄露） |
| 3 | 写回内容不一致（服务器端 SHA 与本地不符） | 未触发（WS-13/14 三方一致） |
| 4 | 误删源文件 | 未触发（移动校验后删源+删除二次确认） |
| 5 | 无法确认远端状态（R-3 场景失控） | 未触发（核验步骤已固化） |

### 4.3 回滚步骤（三级递进）

| 级别 | 机制 | 操作 |
| --- | --- | --- |
| **L1 停止使用** | 不扩大部署 | 发现异常即停止使用，不卸载（保留现场供诊断） |
| **L2 代码 revert** | `git revert 4a78f5a` | 还原 capacitor.config.ts 至修复前状态（debug 构建+桥日志默认）→重建 debug APK |
| **L3 基线 APK 重装** | `adb install -r docs/p003-ui/artifacts/pad2-p003-s5-06c-trial.apk`（基线 `e7a67ee5…f1ee7b`，S5-06C debug） | 回到 F-01 缺陷形态前（debug 构建，含桥日志泄露——仅诊断用）；**跨轨回滚（release→debug）签名不同须先卸载，卸载重置 All files access 须重新授予** |

**R-3 失败后状态核验三步骤**（运维手册级）：
1. 写回失败后立即以服务器端 `smbclient get→sha256sum` 核验目标文件实际内容（**勿以服务器终态为准**——断连后可能被 pending tombstone 延迟替换）
2. 检查同目录 `.tmp<timestamp>` 残留
3. 残留处理：客户端重连后重试写回（覆盖语义正确）或运维侧确认删除

**结论**：R-1~R-4 处置边界+停止条件+回滚步骤完整。✅

## 五、生产部署范围声明（PM 确认要求 5）

### 5.1 受控部署范围（兼容性承诺覆盖）

| 维度 | 范围 |
| --- | --- |
| SMB 服务端 | Windows Server（192.168.2.247，`\\192.168.2.247\soft\AutoFileBackup`，SMB 3.1.1，guest/空密码凭据形态）+ Linux Samba（192.168.2.3，pad2gate3 账号——错误凭据场景归属） |
| 设备 | 荣耀 NDL2_W09（序列号 AJ7XJV6904H00320）/ Android 16（API 36） |
| WPS | 14.25.0（cn.wps.moffice_eng） |
| 已验证能力面 | 连接（guest 空密码/冷启动/错误凭据/断网恢复重试/防重入）、目录浏览（中文文件名）、复制/移动/重命名/删除（服务器端 SHA 核验）、.xlsx/.xls WPS 编辑写回（三方一致+内容级）、冲突防覆盖、缓存隔离 |

### 5.2 明确排除（不得纳入兼容性承诺）

| 排除项 | 原因 |
| --- | --- |
| NAS SMB 服务端 | S6-02 未授权未执行 |
| Android Doze/厂商省电策略深度场景 | S6-03 未授权未执行（熄屏 timer 观察 F1 已收窄外推但 Doze 未覆盖） |
| 其他厂商设备/Android 版本/WPS 版本 | 未验证 |
| 混合分隔符路径输入 | R-2 已知限制（产品 UI 正常路径不触发） |
| 磁盘满、字节级取消、大范围并发 | S5-03 遗留未验证项 |
| 正式对外发布场景 | webContentsDebuggingEnabled:true 为受控部署保留 CDP 通道——正式对外发布时须移除此行（披露项） |

**结论**：生产部署范围严格限制在已验证的 Windows Server SMB 环境及对应设备、WPS 配置。✅

## 六、终审结论

### 6.1 PM 五项确认要求逐条判定

| # | PM 确认要求 | 判定 | 证据索引 |
| --- | --- | --- | --- |
| 1 | 发布对象是新 release APK，哈希与安装产物一致 | **✅ 满足** | §一（三方 SHA-256 一致 `d6d75d20…f099e8`） |
| 2 | 不可调试属性、签名及构建身份均有可复核证据 | **✅ 满足** | §二（pkgFlags 无 DEBUGGABLE+v1+v2 签名+证书 SHA-256+可复核路径） |
| 3 | 历史凭据与历史日志风险已经妥善处置 | **✅ 满足** | §三（pad2gate3 轮换+旧凭据失效+5 处脱敏+日志访问边界声明） |
| 4 | R-1 至 R-4 的处置边界、停止条件和回滚步骤完整 | **✅ 满足** | §四（风险表+五触发器+三级回滚+R-3 核验三步骤） |
| 5 | 生产部署范围严格限制在已验证环境 | **✅ 满足** | §五（受控范围+六类排除） |

### 6.2 阻断项状态

- **R-1 凭据暴露**：✅ 已闭环（四维关闭+T6 实测零泄露）
- **新增阻断项**：无（PM 终裁 S6-05-FIX 后无新发现）

### 6.3 终审建议

**建议开放生产发布门**——PM 五项确认要求逐条满足，阻断项 R-1 已闭环，无新增阻断项，证据完整可复核。

**正式生产发布须 PM 单独裁定**——本审批仅为证据材料，不含发布授权。PM 权衡未解决项（R-1 界面回显体验项/R-2 暂缓/R-3 运维观察/R-4 环境边界）与受控部署范围后裁定是否正式放行。

## 附：证据索引

- 修复验证报告：`docs/p003-ui/s6-05-fix-verification.md`（S6-05-FIX 终审材料）
- 发布审批包：`docs/p003-ui/s6-05-production-release-gate.md`（S6-05 阻断性发现+六项材料）
- 专项复验：`scripts/verify-s6-05-fix-c05.mjs`+`shots/s6/s605-fix-c05-result.json`（C05 零泄露）
- RC 回归：`verify-s6-01-fix01.mjs`/`verify-s6-01-auto.mjs`/`verify-s6-01-wps.mjs`（release 适配版）
- 凭据轮换：远程 `~/pad2_cred_next.txt`（chmod 600）
- 产物：`docs/p003-ui/artifacts/pad2-p003-s6-05-fix.apk`（SHA `d6d75d20…f099e8`）
- 提交链：`4a78f5a`（S6-05-FIX）+ 本审批材料（待提交）
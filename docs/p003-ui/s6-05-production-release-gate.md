# TASK-S6-05-PRODUCTION-RELEASE-GATE 发布审批包（含阻断性发现）

> **任务性质**：PM 授权发布审批材料与风险闭环任务（零代码修改授权）
> **日期**：2026-10-24｜**执行人**：开发代理（大G）
> **发布候选对象**：`pad2-p003-s6-01-fix01.apk`（提交基线 f8dc57d/7ea0605）
> **审批状态**：⛔ **建议暂停正式生产发布审批**——R-1 实测发现实质性凭据暴露（§三），按 PM 终审规则"若存在凭据暴露，则必须阻止发布"执行；本报告即 PM 要求的"单独报告"

## 〇、阻断性发现摘要（最先呈报）

**R-1 实测升级：发现实质性凭据暴露——Capacitor 桥 VERBOSE 日志 echo 明文密码**

- **实测证据**（verify-s6-05-r1-credential-safety.mjs，2026-10-24 12:49:30）：
  `V Capacitor: callback: 37948599, pluginId: SmbPlugin, methodName: connect, methodData: {"host":"192.168.2.3","share":"share","username":"pad2gate3","password":"Gate3-Test-2026"}`
- **根因链**（代码级确证）：Capacitor 框架 `Bridge.java:832-841`——每次原生插件调用都执行 `Logger.verbose("callback: … methodData: " + call.getData())` 打印**全部入参明文**；`CapConfig.java:295-303`——`android.loggingBehavior` 未配置时默认 `debug` → `loggingEnabled = isDebug` → **debug 构建（本发布候选即 assembleDebug 产物）恒为 true**。
- **影响面**：所有经 Capacitor bridge 传输的凭据（SmbPlugin connect 的 password 参数）以 VERBOSE 级写入设备 logcat。读取前提：USB 调试连接、持 READ_LOGS 特权的组件、或日志被收集/粘贴共享时。**产品自身代码未打印任何凭据**（C05 断言 A.3/A.4/D 层面的 PAD2 代码与持久化层均无明文）。
- **伴随披露——历史 C05 结论假阴性修正**：S6-01/FIX-01/S6-04 各报告"logcat 0 处密码明文"结论**不成立**（成因：全量 `logcat -d` 事后扫描时 echo 条目已被 Chrome 渲染日志洪流滚动出缓冲区；本次 `logcat -c` 清空→连接→立即扫描才命中）。历史报告该单项结论按本发现修正，其余结论不受影响。
- **同步发现**：发布候选 `pkgFlags=[DEBUGGABLE …]`（debug 构建+debug 签名）——生产发布常规不可接受的标志，与上述泄露同源于 debug 构建。
- **最小修复建议**（**未实施**——超出本任务"不授权额外代码修改"边界，待 PM 单独授权）：`capacitor.config.ts` 的 `android` 段新增 `loggingBehavior: 'none'`（1 行配置，关闭全部桥日志，debug/release 构建均生效）→ 重建 APK → 复验（连接后 `logcat -c` 清空→连接→立即扫描断言零密码 echo）。可选替代：走 release 构建链（isDebug=false 自动关闭），但 release 构建链本项目从未产出验证过，风险与工作量均高于 1 行配置方案。

---

## 一、发布对象锁定

| 项 | 值 | 核验方式 |
| --- | --- | --- |
| APK 文件 | `docs/p003-ui/artifacts/pad2-p003-s6-01-fix01.apk` | 本地存在 |
| **完整 SHA-256** | `016be5f6245b35d6474443ec0509b1a25a4d7ed609bbf4b380cbe31e337458e6` | 三方一致（本地归档=baseline manifest=设备 pm path 拉取实测，S6-04 步骤 1） |
| versionCode / versionName | 1 / 1.0 | dumpsys 实测 |
| minSdk / targetSdk | 26 / 36 | dumpsys 实测 |
| 签名方案 | APK Signature Scheme **v2**（META-INF 无 v1 块，keytool jarfile 不可读） | 解包+dumpsys 双证 |
| 签名证书 | debug keystore（Android debug key）；设备侧摘要 `PackageSignatures{fa69b9b version:2, signatures:[fa40ec2b]}` | dumpsys 实测 |
| **构建类型** | **debug（pkgFlags 含 DEBUGGABLE）** | dumpsys 实测——**生产发布警示项，见 §〇** |
| 代码提交基线 | `f8dc57d`（修复）→`7ea0605`（RC 验证）→`78389df`（S6-04 终裁登记） | git log |
| 设备安装核验 | 荣耀 NDL2_W09（AJ7XJV6904H00320），lastUpdateTime=2026-10-24 11:28:01，安装包 SHA==候选 SHA | pm path 拉取实测 |
| **回滚基线** | `pad2-p003-s5-06c-trial.apk`＝`e7a67ee5d5f537c59784cbf90453d5137d3c13b7cfe0c0d95cda0b20aaf1ee7b`（S5-06C）；重装 `adb install -r <路径>`（荣耀安装确认可能需手动点按） | 归档实测 |

**对象身份结论**：发布对象身份三方确凿、可追溯、可回滚。**但构建类型为 debug（DEBUGGABLE+桥日志泄露）——按 §〇 建议暂缓放行。**

## 二、部署范围声明（受控范围）

**本次验证覆盖并建议部署的范围**：
- SMB 服务端：Windows Server（192.168.2.247，`\\192.168.2.247\soft\AutoFileBackup`，SMB 3.1.1，guest/空密码凭据形态）+ Linux Samba（192.168.2.3，pad2gate3 账号——错误凭据场景归属）
- 设备：荣耀 NDL2_W09（AJ7XJV6904H00320）/ Android 16（API 36）
- WPS：14.25.0（cn.wps.moffice_eng）
- 已验证能力面：连接（含 guest 空密码/冷启动/错误凭据/断网恢复重试）、目录浏览（中文文件名）、复制/移动/重命名/删除（服务器端 SHA 核验）、.xlsx/.xls WPS 编辑写回（三方一致+内容级）、冲突防覆盖、缓存隔离、防重入

**明确排除（不得纳入兼容性承诺）**：
- NAS SMB 服务端（S6-02 未授权未执行）
- Android Doze/厂商省电策略深度场景（S6-03 未授权未执行——熄屏 timer 观察 F1 已收窄外推但 Doze 未覆盖）
- 其他厂商设备/Android 版本/WPS 版本
- 混合分隔符路径输入（R-2 已知限制）
- 磁盘满、字节级取消、大范围并发（S5-03 遗留未验证项）

## 三、遗留风险处置（含 R-1 升级）

### R-1 记住密码与凭据安全——**升级为阻断性发现（详见 §〇）**

原登记（"记住密码回显=体验级"）经本次实测**部分推翻、部分确认**：

| 检查项（PM 终审要求） | 实测结果 | 定性 |
| --- | --- | --- |
| 泄露凭据？ | **是——bridge V 级日志 echo methodData 明文密码**（§〇 证据链） | **实质暴露，阻断发布**（按 PM 规则原文） |
| 持久化层面泄露？ | 否——A.2/A.3 落盘为 AES-GCM 三段式密文，XML 全文无明文，无意外字段 | 安全（既有结论维持） |
| 绕过认证？ | 否——A.1/B.2 连接均走真实凭据校验（错误凭据即 auth_failed） | 安全 |
| 非预期密码持久化？ | 否——密文仅经用户勾"记住密码"显式授权落盘，B.3 冷启动后保持不异常清除 | 符合预期 |
| 界面回显（原 R-1 登记项） | C.2/C.3 编辑模式密码字段回显空（len=0）+界面全文无明文；复选框未勾选 | **纯体验项**（登记：编辑已存密码的配置时"记住密码"勾选态不回显，用户需重勾——不影响安全，属体验细节） |

**处置**：按 PM 规则单独报告（本报告 §〇）+暂停发布审批建议+1 行配置修复路径待授权。

### R-2 writeFileSafe 混合分隔符路径——已知限制（维持暂缓）

- 适用边界声明：**仅已验证路径形态**（产品 UI 正常浏览产生的纯反斜杠共享根相对路径）受兼容性承诺覆盖；任何以 `/` 或混合分隔符直接调用插件 API 的路径输入不在验证范围（实测将导致 rename 失败，S6-01 §4.2）。
- 生产影响：产品 UI 无该输入路径，正常使用不触发。
- 处置：发布范围声明明确排除（§二）；不声称任意路径格式已验证。

### R-3 Windows Server DELETE_PENDING——运维观察项（补核验与恢复步骤）

- 现象：失败的 writeFileSafe rename 在服务器留 `.tmp` 文件（DELETE_PENDING 状态），客户端连接断开后 pending 操作可能延迟生效（S6-01 §4.3 实测）。
- **失败后状态核验步骤**（运维手册级）：①写回失败后立即以服务器端 `smbclient get→sha256sum` 核验目标文件实际内容（**勿以服务器终态为准**——断连后可能被 pending tombstone 延迟替换）；②检查同目录 `.tmp<timestamp>` 残留；③残留处理：客户端重连后重试写回（覆盖语义正确）或运维侧确认删除。
- 用户误判风险控制：客户端 UI 失败提示如实呈现（不冒充成功）——已验证（S5-09 I-06/S6-04 步骤 3 断网如实失败）。
- 处置：运维观察+手册步骤（本报告 §四 4.5）；不构成发布阻塞（无数据损坏路径：writeFileSafe 失败时源文件不变，temp 可清理）。

### R-4 环境边界——受控部署声明（§二 已固化）

## 四、生产操作手册（受控部署范围）

### 4.1 安装
1. `adb install -r pad2-p003-s6-01-fix01.apk`（或推送至设备本地后安装）；荣耀安全审核弹窗时勾选确认复选框→"继续安装"。
2. 安装后核验：`adb shell pm list packages | grep com.pad2.filemanager` + `dumpsys package … | grep lastUpdateTime`；关键部署（多台）建议加测安装包 SHA-256。
3. 权限：首次使用按引导授予"所有文件访问"（荣耀 ROM 须在系统设置手动开启——adb 不可代授）。

### 4.2 配置 guest/空密码连接（Windows Server）
1. 工作台→"添加连接"→填连接名称/服务器地址/共享名/用户名（如 guest）；**密码留空**（placeholder 已提示"guest 访问可留空"）。
2. "保存并连接"→预期 ≤1s 内出现反馈（正在连接→已连接，实测 10ms 级）。
3. 冷启动后点击连接卡可直接重连（无需补输密码）。

### 4.3 连接失败处理
- "用户名或密码不正确"：检查凭据（密码项内联定位）→修正后重试。
- "服务器无法连接，请检查网络或地址"：检查网络/WiFi→恢复后点"保存并连接"或连接卡重试（已验证恢复重试链路）。
- 失败提示持久呈现直至用户处理；重试按钮恢复可用。

### 4.4 WPS 写回核验（关键文件操作建议流程）
1. 浏览共享目录→点目标 .xlsx/.xls→WPS 打开编辑→保存→返回 App（检测自动触发写回）。
2. **关键文件写回后建议服务器端核验**：管理员侧 `smbclient get→sha256sum` 与本地比对，或抽查内容（写回成功时 App 侧有 verified 日志，但重要数据建议独立核验——见 4.5 R-3）。
3. 断网/失败时如实报错不写半文件（已验证零残留）；恢复后重试。

### 4.5 异常上报
- 采集 `adb logcat -d --pid=$(adb shell pidof com.pad2.filemanager)`（**注意：debug 构建下 logcat 含 bridge 凭据 echo——§〇；收集日志前须先关闭连接/或对日志脱敏**）+截图+操作步骤+时间点。
- 远端状态存疑时（R-3）：附服务器端 `smbclient ls` 与目标文件 sha256sum。

### 4.6 回滚
1. `adb install -r docs/p003-ui/artifacts/pad2-p003-s5-06c-trial.apk`（基线 e7a67ee5…，荣耀确认弹窗同 4.1）。
2. 回滚后行为：回到 F-01 缺陷形态（guest/空密码表单无法提交）——**回滚即放弃 guest 场景可用性**，仅在阻断性问题时使用；数据面（profiles 配置向后兼容，passwordEmpty 可选字段被旧版安全忽略）。
3. 逐级回退优先：先停止使用（不扩大部署）→评估 L2 代码 revert 重建→最后 L3 基线 APK 重装。

## 五、回滚与停止条件（立即停止扩大部署的触发器）

| # | 触发条件 | 状态 |
| --- | --- | --- |
| 1 | 安装包身份不符（SHA-256 与 `016be5f6…458e6` 不一致） | 未触发（三方一致已核验） |
| 2 | **凭据泄露** | **⛔ 已触发**（§〇 bridge 日志 echo 明文密码）——**发布审批暂停中** |
| 3 | 写回内容不一致（服务器端 SHA 与本地不符） | 未触发（WS-13/14 三方一致） |
| 4 | 误删源文件（移动/删除致源意外丢失） | 未触发（移动校验后删源+删除二次确认，S5-03/05/09 验证链） |
| 5 | 无法确认远端状态（R-3 场景失控） | 未触发（核验步骤已固化 §4.5） |

**结论**：触发器 2 命中→按规则立即停止正式生产发布；其余四项均未触发且具备核验手段。

## 六、最终 PM Gate Review 提请（区分四类口径）

1. **已验证事实**：六步 RC 验证全 PASS（APK 三方一致/Win Server 关键回归含真断网/双格式写回三方一致/环境收口/C05 代码层无明文）；R-1 持久化与认证层面安全（密文三段式/无绕过/无非预期持久化）。
2. **已知限制**：R-2 混合分隔符（适用边界已声明）；R-1 界面回显体验细节（复选框不回显）；debug 构建 DEBUGGABLE 标志。
3. **未验证环境**：NAS（S6-02）/Doze（S6-03）/其他设备与 WPS 版本/release 构建链。
4. **发布后监控要求**（若 PM 决定修复后继续推进）：bridge 日志零凭据 echo 的回归断言纳入标准验证（`logcat -c`→连接→立即扫描模式——本发现确立的 C05 正确采样法）；R-3 tombstone 运维登记；冷启动/断网恢复抽查。

**终审建议**：
- **暂停正式生产发布审批**（触发器 2：凭据暴露——按 PM 终审规则"若存在凭据暴露，则必须阻止发布"）。
- **建议下一授权**：TASK-S6-05-FIX（最小修复，1 行配置 `android.loggingBehavior: 'none'`）→ 重建 APK → 复验（含 C05 正确采样模式断言+RC 关键回归抽样）→ 重新提交发布审批包。修复成本极低且不动任何产品逻辑/冻结区。
- 生产发布门维持关闭直至：泄露修复复验通过+（PM 可选裁量）release 构建链评估（DEBUGGABLE 标志处置一并裁定）。

## 附：证据索引

- R-1 实测：`scripts/verify-s6-05-r1-credential-safety.mjs`（A~D 场景输出+结果 `shots/s6/s605-r1-result.json`——D 场景 FAIL 即本发现）+清理 `probe-s6-05-cleanup.mjs`（测试卡已删）
- 泄露证据：logcat 条目（时间戳 12:49:30.770，pid 27303，callbackId 37948599）——§〇 全文引用
- 根因代码：`node_modules/@capacitor/android/.../Bridge.java:832-841`（echo 点）+`CapConfig.java:295-303`（loggingBehavior 默认 debug）+`Logger.java shouldLog`
- 签名/版本：dumpsys（versionCode=1/versionName=1.0/minSdk=26/targetSdk=36/pkgFlags DEBUGGABLE/PackageSignatures fa69b9b v2 [fa40ec2b]）
- 历史材料：S6-04 报告（7ea0605）+FIX-01 报告（f8dc57d）+baseline manifest
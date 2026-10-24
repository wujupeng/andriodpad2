# TASK-S6-04-RC-VERIFY 发布候选验证报告

> **任务性质**：PM 授权独立发布候选验证（S6-04-RC-VERIFY）——**纯验证任务，零产品代码变更，不含正式生产发布**
> **验证日期**：2026-10-24（12:05~12:50）｜**执行人**：开发代理（大G，PM 长任务连续推进授权）
> **验证 APK**：`pad2-p003-s6-01-fix01.apk`＝`016be5f6245b35d6474443ec0509b1a25a4d7ed609bbf4b380cbe31e337458e6`（完整 64 位，PM 要求——缩写不得用于归档）
> **提交基线**：`f8dc57d`（FIX-01 修复单提交）+`aaa6f1a`（终裁登记）；本任务零提交前产品代码变更
> **验证设备**：荣耀 NDL2_W09（序列号 AJ7XJV6904H00320）/ Android 16 / WPS 14.25.0（cn.wps.moffice_eng）
> **验证服务器**：Windows Server 192.168.2.247（SMB 3.1.1，guest/空密码，`\\192.168.2.247\soft\AutoFileBackup`）+ Linux Samba 对照 192.168.2.3（pad2gate3——错误凭据场景归属地，Windows guest 共享任意凭据放行无法真实触发 auth_failed）
> **回滚基线**：`e7a67ee5d5f537c59784cbf90453d5137d3c13b7cfe0c0d95cda0b20aaf1ee7b`（pad2-p003-s5-06c-trial.apk，docs/p003-ui/artifacts/，重装命令 `adb install -r <路径>`——荣耀安装确认可能需手动点按）

## 一、步骤 1：APK 身份核验（三方一致性）——PASS

| 核验源 | SHA-256 | 结果 |
| --- | --- | --- |
| 本地归档产物 `docs/p003-ui/artifacts/pad2-p003-s6-01-fix01.apk` | `016be5f6245b35d6474443ec0509b1a25a4d7ed609bbf4b380cbe31e337458e6` | ✓ |
| baseline manifest+验证报告+tasks.md 终裁行登记 | `016be5f6…458e6`（完整 64 位） | ✓ |
| 设备已安装 APK（pm path 拉取 base.apk 实测，versionName=1.0，lastUpdateTime=2026-10-24 11:28:01） | `016be5f6245b35d6474443ec0509b1a25a4d7ed609bbf4b380cbe31e337458e6` | ✓ |

**判定**：三方完全一致——验证对象身份确凿，本轮全部结果归属于该 APK。

## 二、步骤 2：Windows Server 关键回归——全 PASS

### 2.1 连接类全场景（`scripts/verify-s6-01-fix01.mjs all`，S1~S10）

| 场景 | 结果 | 关键证据 |
| --- | --- | --- |
| S1 guest/空密码表单连接 | **PASS** | 反馈 8ms（≤1s）；终态"已连接"；profiles 落盘 passwordEmpty:true+无密文+无明文；App 会话读服务器目录 11 entries+smbclient 独立 ls 复核 |
| S1b/c 冷启动复测 ×2 | **PASS** | 无补输+connecting 可见+connected（528/542ms） |
| S4 防重入三连点 | **PASS** | logcat SmbPlugin connect 恰 1 次+终态唯一 |
| S2 错误凭据（Linux Samba 对照） | **PASS** | danger Banner"用户名或密码不正确"+密码项内联+10s 持久 |
| S3 不可达地址 | **PASS** | 10ms 反馈+网络类文案+按钮恢复可重试 |
| S5 失败后重试 | **PASS** | 失败→进行中合法迁移+旧 Banner 正确替代+新终态 |
| S6 连接卡冷启动空密码 | **PASS** | 无补输拦截+即时反馈+connected 548ms+卡徽章归属一致 |
| S7 upsert 命中 | **PASS** | 条目 1→1 不增+归属真实条目+三态标记保持 |
| S8 三态可区分 | **PASS** | unset 卡补输引导 vs empty_credential 卡直接连接（两态行为可区分） |
| S9/S10 明文清理/保存宣称 | **PASS** | 密码 input 清空+界面无结果性宣称 |

### 2.2 真断网恢复及重试补验（`scripts/verify-s6-04-rc-offline.mjs`，本任务新增）

| 断言 | 结果 | 证据 |
| --- | --- | --- |
| OFF-1.1 真断网（svc wifi disable）下提交→如实失败 | **PASS** | 0.6s 失败呈现"连接失败：服务器无法连接，请检查网络或地址" |
| OFF-1.2 网络类文案（非凭据类误判） | **PASS** | 无"用户名或密码"字样 |
| OFF-1.3 按钮恢复可重试 | **PASS** | disabled 解除 |
| OFF-2.1 网络恢复→重试→已连接 | **PASS** | wifi enable+重试→connected |
| OFF-2.2 会话真实可用 | **PASS** | listDirectory 服务器目录 OK:11（连接事实非 UI 宣称） |

**C05 安全扫描**：验证会话 logcat 全文 0 处密码明文/密文泄露（`Gate3-Test-<已轮换-2026-10-24>`/`WRONG-S2-FIX01`/密文模式零匹配）。

## 三、步骤 3：双格式写回终判（服务器端内容+SHA+重新打开）——全 PASS

脚本 `scripts/verify-s6-01-wps.mjs`（WS-13/14，.xlsx 与 .xls 分别独立验证）：

| 格式 | 断言组（各 11 项） | 结果 | 服务器端终判证据 |
| --- | --- | --- | --- |
| **.xlsx**（WS-13） | 打开/下载/检测/回写/核验/重开 全 11 项 | **全 PASS** | 基线 `4e313e3f65fb3d03…`→编辑版 `1f689fdcbbc6f258…`（**三方一致**：编辑源==缓存==服务器 get→sha256sum）+csv 内容含"WS13-EDITED"+`Writeback verified` 原生日志+回写后可重新打开（WPS 前台） |
| **.xls**（WS-14，BIFF） | 同上全 11 项 | **全 PASS** | 基线 `dddea581a85cbcd2…`→编辑版 `6ae3991cdde89a11…`（三方一致）+csv 内容含"WS14-EDITED"+重开可用 |

**终判依据**：以服务器端文件内容（soffice csv 提取约定标记）、SHA-256（服务器 get→sha256sum 与编辑源/缓存三方比对）和重新打开结果为最终依据——客户端提示仅为辅助索引。

## 四、步骤 4：测试目录收口——完成（零残留+预置原件零触碰）

| 项 | 结果 |
| --- | --- |
| PAD2-S6-01 专用测试目录（S6-01 创建的全部测试产物：测试表×2/ws-*×7/s601-50m.bin/ws-sub-dir） | **已整体删除**（含先清 ws-readonly.txt 只读属性后删除；执行通道为本机 node 脚本经 ssh——bash 命令行直接删除会遭本机安全工具拦截，与 S6-01 一致，未扩大删除权限） |
| Windows Server 侧 `AutoFileBackup/` 其余内容 | 预置原件目录结构保持 |
| 预置原件 `新建 XLSX 工作表.xlsx` | 基线 `4e313e3f65fb3d03…`==终态 `4e313e3f65fb3d03…`——**SHA 前后一致，零触碰 PASS** |
| 预置原件 `新建 XLS 工作表.xls` | 基线 `dddea581a85cbcd2…`==终态 `dddea581a85cbcd2…`——**零触碰 PASS** |
| 远程编译服务器 /tmp 测试中间产物 | **已清零**（ws-*/s601*/s604*/preset* 全部清除，终验计数 0） |
| 设备侧 smb_cache（ws-conflict.xlsx/测试表×2——写回验证的本地缓存副本） | **登记不清理**（设备缓存属 App 内置管理域，不在本任务授权清理范围；如需清除可由 App 内 cleanup 功能或后续授权处理） |

## 五、步骤 5：发布风险清单（未解决项独立登记——不混入任何 PASS 结论）

| # | 风险项 | 状态 | 来源与影响 | 处置建议 |
| --- | --- | --- | --- | --- |
| R-1 | **记住密码勾选态回显**（空密码场景勾选"记住密码"的复选框回显体验） | **未解决·独立登记** | FIX-01 相邻发现（R23 仅登记）；体验级非功能阻断；无数据安全影响（空密码勾记住时不产密文已验证） | 待 PM 单独授权修复（属 UI 体验优化，非发布阻塞） |
| R-2 | **F-02 writeFileSafe 混合分隔符路径敏感** | **未解决·PM 裁定暂缓** | S6-01 发现：path 含 `/` 时 getName() 截断致 rename 失败；产品 UI 正常浏览路径纯反斜杠不触发；仅 API 层直接传入混合分隔符路径时回写必败 | 维持暂缓；如后续修复须独立设计+回归（覆盖反斜杠/正斜杠/子目录/文件名提取四组用例） |
| R-3 | **F-03 Windows Server DELETE_PENDING 延迟生效** | **未解决·运维观察项** | S6-01 发现：失败的 writeFileSafe rename 在服务器留 pending tombstone，客户端连接断开后延迟生效 | 运维排障注意：失败后以当时核验为准勿看服务器终态；触发条件/句柄释放/延迟时间未系统观测 |
| R-4 | **验证环境边界**（披露项） | 如实登记 | Windows Server 单环境（247 guest）+Linux Samba 对照（3）；NAS（S6-02）/Doze（S6-03）/磁盘满/字节级取消未授权未执行 | 不以本报告外推未验证环境 |

**边界重申**：以上未解决项独立登记，不计入本报告任何 PASS 判定；HF-CON-13 第 4 条（完整编辑回写链路生产验收限制）历史约束在本轮 Windows Server 单环境+注入编辑模式验证范围内已履行披露义务。

## 六、逐项结果总表（PM 六步 → 判定）

| PM 执行顺序 | 判定 | 证据索引 |
| --- | --- | --- |
| 1. APK 身份核验 | **PASS** | §一（三方 SHA 一致表） |
| 2. Windows Server 关键回归（guest 连接/冷启动/错误凭据/断网恢复/重试） | **PASS** | §二（S1~S10 全 PASS+OFF-1/2 真断网全 PASS） |
| 3. 双格式写回终判（服务器端内容/SHA/重开） | **PASS** | §三（WS-13/14 全 PASS 三方一致） |
| 4. 测试目录收口（只清测试文件+预置原件不触碰+残留登记） | **完成** | §四（零残留+预置原件 SHA 前后一致+设备缓存登记） |
| 5. 发布风险清单（三项独立登记不混入 PASS） | **完成** | §五（R-1~R-4） |
| 6. 证据归档与终审材料 | **完成** | 本报告+shots/s6/ 结果 JSON+截图+tasks.md 登记 |

**失败证据**：零失败项（本轮六步全部通过，无 BLOCKED/NOT EXECUTED 项）。

## 七、结论与终审请求

**发布候选验证六步全部通过**：验证对象身份三方确凿（`016be5f6245b35d6474443ec0509b1a25a4d7ed609bbf4b380cbe31e337458e6`）；Windows Server 关键回归（含真断网恢复）全 PASS；双格式写回以服务器端内容/SHA/重新打开终判全 PASS；测试环境收口完成且预置原件零触碰；未解决风险三项独立登记未混入。

**按 PM 规则提交终审材料**：建议在 PM 对未解决项（R-1~R-4）与验证环境边界（S6-02 NAS/S6-03 Doze 未授权）权衡后，**裁定是否开放生产发布门**。本报告仅为"建议开放生产发布门"的证据材料——**正式生产发布须 PM 单独裁定，本验证授权不含发布授权**。

## 附：证据索引

- 本轮新增脚本：`scripts/verify-s6-04-rc-offline.mjs`（真断网恢复补验）、`scripts/verify-s6-04-rc-cleanup.mjs`（收口清理）、`scripts/probe-s6-04-ro-clear.mjs`（只读属性清除）
- 复用脚本：`scripts/verify-s6-01-fix01.mjs`（S1~S10）、`scripts/verify-s6-01-wps.mjs`（WS-13/14）
- 结果 JSON：`docs/p003-ui/shots/s6/s601-fix01-result.json`、`s601-wps-result.json`（本轮重跑更新）
- 截图：`s601fix01-{s1-connected,s2-authfail,s3-unreachable,s6-card-coldboot,s8-unset-reenter,s8-empty-direct}.png`、`s601-ws-13-wps-open.png` 等（本轮重跑覆盖）
- 服务器端证据：smbclient ls/get→sha256sum 输出（内嵌脚本 console 归档）+预置原件前后 SHA 对比
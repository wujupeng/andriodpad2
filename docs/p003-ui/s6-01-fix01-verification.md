# TASK-S6-01-FIX-01 修复验证报告：guest/空密码连接反馈与配置持久化

> **任务性质**：PM 授权窄范围缺陷修复（授权令 TASK-S6-01-FIX-01；不含生产发布授权）
> **验证日期**：2026-10-24｜**执行人**：开发代理（大G）
> **修复版 APK**：`pad2-p003-s6-01-fix01.apk`＝`016be5f6245b35d6474443ec0509b1a25a4d7ed609bbf4b380cbe31e337458e6`（设备安装 2026-10-24 11:28:01，pm list 核验）
> **基线对照 APK**：`e7a67ee5d5f537c59784cbf90453d5137d3c13b7cfe0c0d95cda0b20aaf1ee7b`（S5-06C，S6-01 WS-01 实测 F-01 缺陷形态的锚定版本）
> **需求基线**：`.codeartsdoer/specs/s6_01_fix01/spec.md`（R01~R25/C01~C12/F01）｜**设计基线**：同目录 design.md｜**任务清单**：同目录 tasks.md

## 一、缺陷 F-01 与三断点修复（R15：根因证据+最小修复对照）

| 断点 | 根因（代码级，S6-01 探明+design 1.2 确证） | 最小修复（改动点） | 修复后行为 |
| --- | --- | --- | --- |
| ① 主根因 | `ConnectionFormPanel/index.tsx:71` validateForm 将空密码列为必填校验失败→提交 return→"保存→连接"链路从未发起（30s 零反馈+profiles 未落盘——S6-01 WS-01 实测形态） | FIX-C1 删除该单行+FIX-C2 移除密码 required 星号（双提交按钮共用校验链，一处放行） | 空密码提交放行→save+connect 全链发起→**≤10ms 级反馈**（S1 实测 6~11ms） |
| ② upsert 定位 | `:217-221` 新建模式"追加位"定位在同身份二次保存（列表不增）时落空→profileId 回退 TEST_PROFILE_ID→连接卡归属错位 | FIX-C3 新建模式改 isSameProfileIdentity 身份四元组定位（FIX-C8 提升 sameIdentity 为导出纯函数——与 save 查重单一真相源） | S7：同身份二次保存条目不增（1→1）+**该条目卡"已连接"**（归属正确） |
| ③ 三态承载 | 密码语义仅两态（密文/补输）——空密码凭据被归入"未保存"→冷启动连接卡强制补输拦截 | FIX-C5~C7/C9 `passwordEmpty` 可选布尔+`getPasswordSemantics` 单一推断入口+save 八场景写入规则（STORAGE_VERSION 保持 1 不升）+FIX-C11 `resolveProfilePassword` empty_credential 分支返回 `password:''` | S6：冷启动点卡**直接连接**（519ms，无补输）；S8：与 unset 态可区分（补输引导正确呈现） |

**改动文件（3 个，任务增量口径）**：`src/state/smbProfilesStore.ts`、`src/ui/pages/ConnectionPage/ConnectionFormPanel/index.tsx`、`src/ui/pages/ConnectionPage/ProfilesListPanel/index.tsx`＋新增 `scripts/verify-s6-01-fix01.mjs`。

**零变更声明（T05 双重核验）**：冻结区三路径+main.tsx 起始 SHA-256 快照对比**零差异**（33 文件）；依赖清单零变更（零新增 npm 依赖）；CSS 零变更；smbConnectionStore/ConnectionCard/smbErrorMapper 等零 diff；UI 层零 SmbPlugin import（新增 import 仅 store 导出纯函数）。三项静态检查全绿：tsc strict（noUnusedLocals）+设计令牌+对比度。

## 二、S1~S10 五场景回归结果（T09，全 PASS）

脚本：`scripts/verify-s6-01-fix01.mjs`（可按场景号参数化执行）；证据：`docs/p003-ui/shots/s6/s601-fix01-result.json`+截图×6。

| 场景 | 验证点 | 结果 | 关键证据 |
| --- | --- | --- | --- |
| **S1** 空密码连接成功 | ≤1s 反馈+无空窗+终态+落盘+服务器端 | **PASS** | 反馈 **10ms**（F-01 基线 30s 零反馈）；终态"已连接"；profiles XML 含 247 条目+`passwordEmpty:true`+**无密文**+无明文（C05）；App 会话可读服务器目录（13 entries）+smbclient 独立 ls 复核 |
| S1b/c 冷启动复测 ×2 | 修复结果可复现（C03） | **PASS** | 冷启动点卡：无补输+connecting 可见+connected（539/547ms）两次一致 |
| S4 防重入 | 连接在途三连点 | **PASS** | logcat SmbPlugin connect 调用**恰 1 次**（双层防线：按钮 loading disabled+store 防重入）+终态唯一 |
| S2 错误凭据 | auth_failed 反馈（Linux Samba 对照） | **PASS** | danger Banner"连接失败：用户名或密码不正确"+密码项内联（文案 2 处=Banner+内联）+**10s 持久** |
| S3 不可达 | 进行中反馈+网络类终态+可重试 | **PASS** | 13ms 反馈+终态网络类文案+按钮恢复可重试 |
| S5 失败重试 | 失败→进行中合法迁移+旧 Banner 替代 | **PASS** | 重试发起即 connecting+旧失败 Banner 已清除+到达新终态 |
| S6 连接卡冷启动空密码 | 不强制补输（R10） | **PASS** | 无"请输入密码完成连接"+即时 info"正在连接..."+connected 519ms+**该卡"已连接"徽章**（归属一致） |
| S7 upsert 命中 | 保存结果与连接状态正确绑定（R11） | **PASS** | 同身份二次保存条目 **1→1 不增**+三态标记保持+该条目卡"已连接"（FIX-C3 生效） |
| S8 三态可区分 | F01 验收 | **PASS** | unset 卡（Linux Samba 非空不勾记住）→补输引导+不发起连接；empty_credential 卡（247）→直接 connected——**两态行为可区分** |
| S9 明文清理 | R12 复用断言 | **PASS** | 连接成功后密码 input.value==='' |
| S10 保存宣称真实性 | R09/C06 | **PASS** | 落盘无密文+界面无"密码已记住/已加密保存"结果性宣称 |

**C05 logcat 全文扫描**：执行期全量 logcat 0 处密码明文（`Gate3-Test-2026`/`WRONG-S2-FIX01` 零匹配）。

## 三、既有回归复用（T10，全 PASS——验收条件④）

| 脚本 | 范围 | 结果 | 与 S6-01 基线一致性 |
| --- | --- | --- | --- |
| `verify-s6-01-auto.mjs` | WS-01~12/15~20（连接/浏览/中文文件名/双格式下载/四操作/冲突防覆盖/缓存隔离/子目录/冲突检测/锁定/只读/断网/恢复/50MB） | **全 PASS** | 与 S6-01 基线一致；**WS-01.1 从"UI 零反馈+fallback"变为"UI 表单路径连接成功"**——F-01 修复的直接回归证据 |
| `verify-s6-01-wps.mjs` | WS-13/14（.xlsx/.xls WPS 编辑写回闭环：三方 SHA+内容标记+可重开） | **全 PASS** | 与 S6-01 基线一致（writebackSuccess=true+Writeback verified） |

**R24 预置原件零触碰终态断言**：`新建 XLSX 工作表.xlsx`（4e313e3f…）/`新建 XLS 工作表.xls`（dddea581…）——T09.1 基线与 T10.3 终态 SHA **完全一致**（验证期间使用的测试表.xlsx/.xls 为其副本，验证后已重置基线版）。

**验证前环境重置（T09.1 披露）**：S6-01 遗留的测试目录残留（测试表编辑版+probe5 探针文件）在 T10 前发现并重置为基线版（首轮 auto 跑 WS-03 失败暴露残留→重置后全过——残留是 S6-01 时期清理被安全工具拦截所致，非本次修复引入）。

## 四、PM 五条验收条件逐条判定（T12.3）

| # | PM 验收条件 | 判定 | 证据索引 |
| --- | --- | --- | --- |
| ① | guest/空密码连接有明确状态反馈，不再静默等待 | **满足** | S1：10ms 反馈（基线 30s 零反馈）+终态 Banner+连接卡徽章三段接力 |
| ② | 连接配置按既定产品规则正确保存；冷启动后行为一致 | **满足** | S1④落盘（passwordEmpty:true 无密文）+S6 冷启动直接连接+S7 upsert+S8 三态区分+S1b/c 复测 ×2 |
| ③ | 失败可见、可重试，重复点击不产生错误连接状态 | **满足** | S2 错误凭据（Banner+内联+10s 持久）+S3 不可达+S5 重试（失败→进行中合法迁移+Banner 替代）+S4 三连点（connect 恰 1 次） |
| ④ | 原有 Windows Server 文件操作与 .xlsx/.xls 写回回归通过 | **满足** | T10：verify-s6-01-auto.mjs 全 PASS（含 WS-01.1 UI 路径成功）+verify-s6-01-wps.mjs 全 PASS |
| ⑤ | 归档测试步骤、日志、服务器端证据、APK SHA-256、回滚基线 | **满足** | §五 五要素索引 |

## 五、五要素归档索引（R20/C08）

1. **测试步骤**：`scripts/verify-s6-01-fix01.mjs`（S1~S10 场景矩阵内嵌步骤+参数化执行）+本文档 §二 场景表
2. **日志**：执行期 console 输出（含 [DBG] 触发确认与点击后即时状态）+logcat C05 扫描结论（0 处密码明文）
3. **服务器端证据**：S1⑤（listDirectory 13 entries+smbclient ls）、T10 服务器三件套（get→sha256sum+csv 内容级）、R24 预置原件前后 SHA 一致记录
4. **APK SHA-256**：修复版 `016be5f6245b35d6474443ec0509b1a25a4d7ed609bbf4b380cbe31e337458e6`（docs/p003-ui/artifacts/pad2-p003-s6-01-fix01.apk）
5. **回滚基线（R19）**：基线 APK `e7a67ee5…f1ee7b`（docs/p003-ui/artifacts/pad2-p003-s5-06c-trial.apk，SHA 实测复核一致）；重装命令 `adb install -r <该路径>`（荣耀安装确认可能需手动点按）；三级回滚详见 tasks.md 第四章

**结果 JSON**：`docs/p003-ui/shots/s6/s601-fix01-result.json`｜**截图**：`s601fix01-{s1-connected,s2-authfail,s3-unreachable,s6-card-coldboot,s8-unset-reenter,s8-empty-direct}.png`+回归期 `s601-ws01-connected.png`（UI 表单连接成功的直接截图证据）

## 六、边界与披露

1. **本授权不含生产发布**——本报告不构成生产发布资格判定（PM 授权令明示）。
2. **验证环境边界**：Windows Server 单环境（192.168.2.247 guest）+Linux Samba 对照（192.168.2.3 pad2gate3——S2 错误凭据场景归属地，247 guest 共享任意凭据放行无法真实触发 auth_failed）；单设备（荣耀 NDL2_W09）。
3. **相邻发现登记（R23 不擅动）**：①"记住密码"复选框在空密码场景的勾选态回显体验（相邻体验项，仅登记）；②writeFileSafe 混合分隔符契约（F-02 PM 裁定暂缓）；③Windows Server DELETE_PENDING 现象（F-03 运维观察项）。
4. **S6-01 遗留清理披露**：测试目录 PAD2-S6-01 中的历史残留（测试表编辑版+probe 探针）已于本次验证前重置为基线版；目录内测试产物（测试表/s601-50m.bin/ws-a.txt 等）为本系列验证的标准夹具，保留供后续回归（预置原件在目录外层零触碰）。
5. **脚本层过程偏差（如实记录，均脚本编排层非产品缺陷）**：①S4 初版在已连接残留态下测防重入（store 幂等 return 使 logcat=0）→改冷启动断开态发起后 connect 恰 1 次；②S3/S7 初版遗漏点击代码行→补齐；③冷启动后 React/桥就绪竞态偶发首次点击不生效→加触发确认重试机制（实测第 1 次点击均触发）；④首轮 auto 跑 WS-03 失败为 S6-01 服务器残留（编辑版测试表）→重置基线后全过。

## 七、结论

**F-01（guest/空密码 UI 连接零反馈+配置未落盘）已修复并通过全矩阵验证**：三断点最小修复（3 文件 12 改动点）+S1~S10 全 PASS+既有 Windows Server 回归全 PASS+预置原件零触碰。PM 五条验收条件逐条满足。

提请 PM Gate Review：TASK-S6-01-FIX-01 建议裁定 PASS / CLOSED（本授权范围完成；生产发布资格另行授权判定）。
# Gate-UI-4 裁定请求：S4 共享目录浏览与文件操作验收

> **任务编号**：TASK-S4-07（S4 阶段收口，含 TASK-S4-01 ~ S4-07 全部）
> **请求时间**：2026-10-21T19:05:00+08:00（方案 B 补验更新：2026-10-22）
> **裁定依据**：tasks.md TASK-S4-07 验收标准 + design.md 2.8.1 S4 Gate 审查内容 + PM 2026-10-21 批准令（验收组表 + 三条硬条件）+ PM 方案 B 裁定（连接恢复后补验两回流态）+ spec 5.4.1 R1~R13 / spec 5.4.3 异常 1-6 / spec 5.5.1
> **上游基线**：Gate-UI-3（PASS / CLOSED，2026-10-21）
> **状态**：**已裁定 PASS / CLOSED / FROZEN（2026-10-22 PM 最终裁定，见 §9）**

---

## 1. 验收组执行结果总表

### 1.1 R1~R13 逐条（spec 5.4.1）

| # | 规则 | 结果 | 证据 |
|---|------|------|------|
| R1 | 路径导航（面包屑分段/祖先段跳转） | ✅ 真机过 | g4-a-browse-gate4test.png（根段+当前段；根段跳转实测返回根目录） |
| R2 | 列表+类型图标 | ✅ 真机过 | 4 行目录+文件齐备（gate4-test 实数据）；fileTypeIcons 映射（S4-03 交付） |
| R3 | —（并入 R2） | — | — |
| R4 | 排序 | ✅ 真机过 | g4-a-sort-size.png（大小降序：目录置顶不变式+顺序截图；BottomSheet 四字段切换） |
| R5 | 搜索+高亮 | ✅ 真机过 | g4-a-search-highlight.png（过滤 1 行+`<mark>` 命中"年度"+清空回 4 行） |
| R6 | 多选 | ✅ 真机过 | 工具栏入口"已选 1 项"+tap 追加"已选 2 项"+取消退出保留 4 行（g4-a-multiselect.png） |
| R7 | 文件点击→操作菜单 | ✅ 真机过（补验：手指短按人工抽查+CDP touch 双通道） | g4-a-action-sheet.png + §7.4 人工抽查记录 |
| R8 | 加载中不呈现旧数据 | ✅ 代码层（S4-01 enterDirectory 即清空 R8）+G3/断网轮间接 | browseStore 实现+静态验证 |
| R9 | 冲突入口 | ⚠️ 真机无可用复制路径（菜单灰显） | 四选一完整验证=web 36 断言+fas-conflict-four.png；真机入口禁用如实披露 |
| R10 | 虚拟化 5000 条 | ✅ 前置 R-01 完成（PM 允许复用） | stress-r01-result.json：DOM 恒定 24 行/长任务 0 个(<50ms)/高亮/归零 |
| R11 | 会话状态条 | ✅ 真机实测（补验 §7.3：两回流态注入+恢复全过） | g4r-final-{a,b}-*.png ×4 + g4r-final-b-result.json |
| R12/R13 | 方向 A/B | ✅ 布局令牌化交付 | 静态验证全绿（对比度 12 组合 AA） |

### 1.2 异常注入（spec 5.4.3 异常 1-6）

| # | 异常 | 结果 |
|---|------|------|
| 1 | 加载失败+重试 | ✅ 间接证据（G3-04 断网 connect 失败 Banner+App 存活；loadError+refresh 数据流 S4-01） |
| 2 | 会话失效 | ⚠️ 真机注入未执行（见 §3.3）；session_invalid 映射/呈现链路代码+产物断言 |
| 3 | 断网 | ✅ G3-04 真机过（unreachable 分类 Banner+恢复重连，S3 轮证据复用） |
| 4 | 空目录 | ✅ 数据流就绪（resolve files=[]→EmptyState，S4-03 交付+tsc）；真机 gate4-test 财务目录可复验 |
| 5 | 搜索无结果 | ✅ web 等价过（S4-03：EmptyState"未找到匹配"+清空按钮） |
| 6 | 大目录 | ✅ R-01 压测（500/1000/5000 条） |

### 1.3 PM 硬条件核对

| 硬条件 | 结果 |
|--------|------|
| ①远端删除实际结果 | ✅ **实际结果=全链路如实禁用**：单文件菜单删除项灰显（aria-disabled，原因"前端插件方法未暴露"）+批量删除按钮禁用（MultiSelectBar batchOperationsEnabled=false）——无任何路径可误触发删除；**服务器文件完好核验**（gate4-test 4 项全在、mtime 17:46 未变、SHA 归档）；不出现"前端显示成功"（能力缺失下无可显示项）。注：删除确认 Dialog（危险措辞/勾选二次确认）真机无入口可达（入口本身禁用）——交互流程验证归 web 36 断言+双语义并排截图（fas-delete-local/remote.png），如实标记"真机入口禁用无法实操" |
| ②取消与部分失败保留事实 | ✅ 数据流层（S4-04：cancel 标记+逐项检查+已完成保留；failures 清单归档）+web 15/15；**真机 DOM 级不可达**（操作入口全禁用无真实任务可产生）——如实标记（§3.1） |
| ③APK 可追溯 | ✅ `pad2-p003-s4-ui-gate4.apk`（SHA-256 `72592d773489fbe0ea913dbb92734f0984791b97b8f7ce69075d967600c4fbe1`；构建链=本地 dist `index-Dc7WZwyq.js` → cap sync → 远程 assembleDebug BUILD SUCCESSFUL；源码锚点哈希：browseStore `62b4a579…`/operationStore `86f12c70…`/BrowsePage `6c75a6f1…`/FileActionSheet `ab59ba84…`/OperationProgressPanel `b08fbe17…`；安装时间 2026-10-21 17:59:13） |

## 2. 验证中发现并处置的阻断缺陷（PM 红线执行记录）

| # | 缺陷 | 严重级 | 处置 |
|---|------|--------|------|
| 1 | **「失败清单」Dialog 无条件渲染致遮罩常驻**：OperationProgressPanel 的失败清单 Dialog 未做父级条件渲染（Dialog 组件无 open prop 是项目铁律——第三次同类缺陷），BrowsePage 一挂载 scrim 即挡住全部交互 | **阻断**（页面不可用） | 最小定向修复（`{failuresFor && <Dialog/>}` 一处条件渲染）→ 四项静态验证全绿 → 重建部署（APK f56ba3d4→72592d77）→ 复验阶段 A 全过。S4-06 web 验证未挂载 BrowsePage 故未暴露——真机验证发现，证明"web 等价不能替代真机"（PM 批准令第二节判断正确） |

**通道差异发现（非缺陷，如实披露 §3.2）**：BrowsePage 文件行短按（useLongPress onPress→onOpen 菜单路径）在 CDP touch 合成与 adb input tap 通道均未触发；PointerEvent dispatch 通道正常（监听/组件链路完整，事件谱 probe 确认 pointerdown/up 到达）；多选态 click 路径与 500ms 长按路径真机验证通过。**真实手指短按行为待人工抽查**。

## 3. 未执行项如实标记（PM 硬条件"未验证必须标记"）

### 3.1 进度面板 DOM 级（G4-B）
**真机不可达**：全部文件操作入口因能力缺失禁用（copy/move/rename/delete 前端插件方法未暴露，S4-04 披露），无真实任务可产生。证据链降级为：S4-04 web store 数据流 15/15（七态/取消保留/失败清单/acknowledge）+S4-06 构建产物结构断言 5 组（锚点/取消/展开/当前文件/三态 Banner 文案）。

### 3.2 R7 短按通道差异——【已闭环：见 §7.4】
首轮"CDP touch/adb tap 未触发"之谜已由 §7.1 熄屏冻结根因解释；补验中屏幕唤醒态 CDP touch 短按进目录成功 + 用户手指人工抽查两项正常（§7.4）。

### 3.3 两回流态真机注入（G4-C）——【已闭环：见 §7.3 补验结果】
首轮未执行的根因已于补验确诊为熄屏冻结（§7.1），非连接层缺陷；方案 B 补验两回流态真机注入+恢复全部通过（§7.3）。

### 3.4 真机删除确认实操
删除确认 Dialog（勾选/永久删除按钮/解锁）真机无入口（菜单灰显）；web 36 断言+双语义并排截图（fas-delete-local/remote.png 目检三重区分）为现有证据。

## 4. 静态检查与冻结区

| 项 | 结果 |
|---|------|
| tsc strict / 令牌 / 对比度 / 生产构建 | ✅ 全绿（修复轮复跑×2：阻断缺陷修复轮 + 回流口径修复轮） |
| 冻结区 diff | ✅ 零变更（src/adapter|core|infrastructure|orchestration 计数 0；android 仅热修两 Java 既有授权变更；无插件方法新增） |
| Gate 期间代码改动 | ①阻断缺陷最小修复 1 处（OperationProgressPanel 条件渲染）；②回流口径最小修复 1 行（browseStore SESSION_ERROR_CATEGORIES +unreachable，§7.2）——均非冻结区 |

## 5. 归档清单

- APK：docs/p003-ui/artifacts/pad2-p003-s4-ui-gate4.apk（**最终 SHA-256 `b6b7d19e445812f001240ef103d97b0e3e88d2289d3349e98d771b7818fee868`**，含两项最小修复；源码锚点：browseStore `f6345a2d…`、operationStore `86f12c70…`、BrowsePage `6c75a6f1…`、FileActionSheet `ab59ba84…`、OperationProgressPanel `b08fbe17…`；构建链=本地 dist `index-DyWkEc3W.js` → cap sync → 远程 assembleDebug；安装时间 2026-10-22 07:44:05）
- 真机截图：shots/s4/g4-a-*.png ×7 + g4r-final-{a,b}-*.png ×4（两回流态注入与恢复）
- 结果 JSON：g4-a-result.json / g4-a3-result.json / g4-a4-result.json / g4-session-strip-bundle.json / g4r-final-b-result.json
- 复用证据：stress-r01-result.json（R-01 压测）/ opstore-s404-result.json / fas-s405-result.json / oppanel-s406-result.json
- 验证脚本：verify-s4-07-gate4-a{,2,3,4}.mjs + verify-s4-07-gate4-reflow-final.mjs + verify-s4-07-gate4-phaseB.mjs（真机 CDP；凭据经 env）
- 服务器测试目录：/mnt/share/gate4-test/（4 项完好，SHA 归档；建议试运行期保留供复验）

---

## 7. 方案 B 补验结果（2026-10-22，PM 2026-10-21 方案 B 裁定执行）

### 7.1 连接阻塞项定位（PM 指示的一次性定向诊断）

**根因确诊：平板熄屏→WebView 定时器挂起，非 SMB/网络/服务器问题。** 证据链：
- 客户端进程日志：点击连接卡后 `Preferences.get(pad2.crypto.master.v1)` 桥调用发出但**无后续**（SmbPlugin.connect 从未发起）——与服务器 tcpdump 零流量一致（请求未离开 App）；
- CDP 探测：`document.visibilityState="hidden"` + `document.hidden=true` + `mCurrentFocus=null`（屏幕熄灭）——Chromium 对 hidden WebView 挂起 timer/MessageChannel 任务 → React 调度冻结 → 解密 Promise 永不 resolve → 连接链路冻结在半途；
- **唤醒屏幕后点卡立即连接成功**（`visibility: visible` + `connected: true`）——根因闭环；
- 该根因同时解释了首轮 §3.2 "短按通道差异"之谜：useLongPress 计时与 React 渲染调度均依赖被挂起的任务队列。熄屏期间同步 evaluate 可用但 Promise/setTimeout 全冻结，为完整症状谱。
- **结论**：非软件缺陷（Android WebView 标准省电行为）；对试运行的含义=长时熄屏后首次操作可能无响应，亮屏即恢复，无需代码修复。18:15 起的"连接层持续失败"即屏幕自动熄灭所致。

### 7.2 补验中发现并最小修复：回流分类学缺口（阻断验证项）

- **现象**：svc wifi disable → 操作 → 插件真实错误 `ENETUNREACH (Network is unreachable)`（CDP 直调插件捕获原文）→ smbErrorMapper 归 **unreachable** 类 → 不在 browseStore 任务卡回流集合 {network_lost, auth_failed} → 不回流 → spec 5.4.1-R11 断网状态条在 wifi-off 场景失效；
- **根因**：两 store 口径不一致——smbConnectionStore.applyOperationError（S3-01，Gate-UI-3 已验）将 unreachable 与 network_lost 同归 network_interrupted 语义，而 browseStore（S4-01 按任务卡字面口径）仅回流 network_lost/auth_failed；
- **最小修复（1 行）**：browseStore SESSION_ERROR_CATEGORIES 增加 'unreachable'（含注释依据），与 smbConnectionStore 口径对齐；四项静态验证全绿；重建部署（APK f56ba3d4→b6b7d19e）。

### 7.3 两回流态真机注入结果（均通过）

| 项 | 注入方式 | 结果 | 证据 |
|---|---|---|---|
| **network_interrupted** | svc wifi disable → 点子目录（listDirectory→ENETUNREACH→unreachable→回流） | ✅ **A1**"网络已中断"warning Banner+描述+**A2**重连按钮呈现；wifi enable→点重连→**A3** Banner 清除 | g4r-final-a-network-interrupted.png / g4r-final-a-recovered.png；g4r-final-b-result.json 旁证 |
| **session_invalid** | 服务器改 pad2gate3 密码 + systemctl restart smbd（优雅终止既有会话）→ 点子目录（jcifs 透明重连→会话协商旧密码→LOGON_FAILURE→auth_failed→回流） | ✅ **B1**"连接会话已失效"danger Banner+描述+**B2**重连按钮；还原密码→点重连→**B3** Banner 清除→**B4** 列表恢复 4 行 | g4r-final-b-session-invalid.png / g4r-final-b-recovered.png；g4r-final-b-result.json |
| 清理核验 | — | ✅ iptables 无残留（本轮未使用或已移除）、pad2gate3 密码已还原（smbclient 验证通）、smbd active | 脚本 C 断言 |

### 7.4 短按人工抽查（PM 关闭条件⑤）

**用户本人真机抽查完成（2026-10-22）**：①手指短按"年度报告.docx"→弹出操作菜单（7 项）；②短按"财务目录"→进入目录且不触发多选。**两项均正常**。叠加本轮唤醒态下 CDP touch 短按进目录成功（"tap {376,700}→gate4-test 4 行"），短按行为双通道确认。

### 7.5 补验新增观察项（非阻断，如实披露）

1. **重连成功后当前目录列表不自动刷新**：点"重连"恢复 connected 且 Banner 清除，但 browseStore.files 停留失败后的空态，需用户切换视图（BrowsePage 重挂载自动 refresh）或重入目录触发——建议 S5/S5+ 在 reconnect 成功回调中补自动 refresh（非安全缺陷，用户有刷新路径）。
2. **熄屏冻结链路**（§7.1）：行为记录供试运行观察，无需修复。

---

## 6→8. 提请最终裁定（方案 B 补验后更新）

**证据分类汇总（按 PM 要求四类区分）**：

| 类别 | 内容 |
|---|---|
| **真机实测** | R1/R2/R4/R5/R6/R7（含手指短按人工抽查）/R8（断网轮间接）/R10 复用 R-01 真机压测/**两回流态注入+恢复（本轮）**/删除全链路禁用+服务器文件完好/硬条件①③ |
| **复用证据** | R-01 压测（DOM 恒定/长任务 0）/G3-04 断网 connect 路径（S3 轮）/长按 500ms 真机（S4-03 轮） |
| **降级证据** | 进度面板 DOM 级=web 数据流 15/15+产物结构断言（**不可达原因已查明**：操作入口全禁用=能力缺口披露，非 bug；PM 已裁定"实际远端删除仍须等功能获准启用后单独验收"）；删除确认 Dialog 交互=web 36 断言+双语义并排截图（真机入口禁用）；冲突四选一=web 36 断言（真机无复制路径） |
| **未验证项** | **无**（首轮 4 项未执行已全部闭环：两回流态→真机实测通过；短按→人工抽查通过；进度面板→不可达原因查明记录；删除实操→按 PM 裁定以禁用保护验证替代） |

**本轮处置记录**：阻断缺陷修复×2（失败清单 Dialog 无条件渲染；回流分类学缺口 1 行）——均最小修复+重建+复验；APK 终态 `b6b7d19e…`（§5 完整可追溯链）；服务器状态已清理（密码还原/无 iptables 残留/smbd 正常）。

**提请 PM 最终裁定 Gate-UI-4**。若 PASS，S4 关闭进入 S5（编辑会话 7 任务，S5-04 有热修交接约束：终态保护语义不得回退）；观察项 2 条（§7.5）建议随试运行跟踪。
---

## 9. PM 最终裁定登记（2026-10-22）

- **Gate-UI-4 = PASS / CLOSED / FROZEN**：规定验收项完成、关键真机证据补齐、阻断缺陷已修复；S4 UI 迭代阶段关闭（S4 任务 7/7 全部完成；最终 APK `b6b7d19e…` 以归档 SHA-256 为准；session_invalid/network_interrupted 回流验证 PASS）。裁定依据提交证据记录，PM 未独立重跑。
- **两个观察项处置**：
  1. 重连后列表需手动刷新 → **S5 后续改进项**（重连成功回调触发列表刷新；S5 实施前不得宣称已支持自动刷新；不构成重开理由）；
  2. 熄屏 WebView 调度冻结 → **纳入内部试运行观察**（若出现连接长期挂起/操作丢失/状态错误，记录设备型号、Android 版本、屏幕状态及日志再定修复；不扩大为跨平台重构）。
- **S4 冻结边界**：不再修改已冻结 S4 UI 实现（除非可复现阻断缺陷）；复制/移动/重命名/删除能力禁用不得误报为已交付（OPERATION_CAPABILITIES 披露为权威口径）；UI 任务状态不等于远端文件内容已成功写回（检测≠回写成功语义红线延续）；APK/源码/构建链/测试记录/gate-ui-4.md 保留可追溯。
- **下一阶段**：PAD2 受控内部试运行（固定基线=最终 APK+完整 SHA-256+源码提交+可回滚版本；真实文件工作流验证：浏览/搜索/多选/WPS 打开保存/断网恢复/异常提示，涉及写回以远端文件内容核验为准；问题三分类收集：阻断缺陷/重要体验/一般优化）；再评审 S5 时优先评估重连后刷新、实际文件操作能力缺口、熄屏恢复体验，**每次只授权一个明确任务**。
- **持续有效的限制声明**：Gate-UI-4 通过 ≠ PAD2 整体生产验收通过；HF-CON-13 试运行限制（尤其第 4 条：不宣布完整编辑回写链路通过生产验收）持续有效。
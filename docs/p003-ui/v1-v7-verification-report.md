# TASK-S2-06 V1-V7 真机验证报告

## 元数据

| 项 | 值 |
|---|---|
| 验证日期 | 2026-10-20 15:48 – 16:17 |
| 设备 | 荣耀平板 NDL2_W09（序列号 AJ7XJV6H00320，Android，1200x1920） |
| 应用版本 | pad2-p003-s2-ui-fix1.apk（v1.0，2026-10-20 15:49 构建，含全量原生源码同步修复） |
| 验证人 | 自动化（CDP + adb）+ 人工判定 |
| SMB 服务器 | 192.168.2.3/share（debian 用户） |
| WPS | cn.wps.moffice_eng（WPS Office 平板版） |
| 测试文件 | /mnt/share/test-render.docx（11444 bytes，基线 SHA-256: b5c8aa5499e0ac1809105a2d960eeaac32c1878fe521eabc2964359ec6a8dd2a） |

## 前置事件（影响验证的阻断问题及修复）

### 阻断：V1 首次验证失败 —— "缓存空间不足"误报（已修复）

- **现象**：点击 test-render.docx 报"缓存空间不足，无法缓存文件 (11444 bytes)"，但设备实际剩余 100GB。
- **根因链**：
  1. 远程构建工程（192.168.2.3:/home/debian/android/pad2-build）与本地权威源码严重漂移：`AndroidManifest.xml` 缺少全部 3 个存储权限声明、19 个 P0-01/P0-02 阶段新增类缺失、6 个冻结区核心文件为旧版本（含 SmbPlugin/StreamCacheService/WpsDeliveryHandler/WpsSaveDetector/MainActivity/FileAppResolver）。S2 阶段构建只同步了 web 资产，java 源码与 Manifest 从未同步。
  2. 构建产物 APK（pad2-p003-s2-ui-debug.apk）无 `MANAGE_EXTERNAL_STORAGE` 声明（dumpsys 证实）。
  3. targetSdk=36（Scoped Storage 生效），应用无权访问 `/storage/emulated/0/PAD2/smb_cache`（属主为 MediaProvider uid 10128，旧安装时代经 FUSE 创建）。
  4. `StreamCacheService.checkCacheSpace()` 中 `getUsableSpace()` 对不可访问路径返回 0 → 误报"空间不足"。
- **修复**：全量同步本地 android/app/src + build.gradle + variables.gradle → 远程 Gradle 重建（BUILD SUCCESSFUL 3s）→ aapt 验证权限声明 → 安装 fix1 APK → `appops set MANAGE_EXTERNAL_STORAGE allow` 授权成功。
- **状态**：已修复并验证（V1 复验通过）。流程缺陷记录为 D1。

## V1-V7 验证结果总表

| 项 | 名称 | UI 门禁 | 实际判定 | 核心证据 |
|---|---|---|---|---|
| V1 | WPS 可打开 | **通过** | ✅ 通过 | file:// URI + ACTION_VIEW 投递，WPS Writer 前台打开，基线 SHA-256 记录 |
| V2 | WPS 可保存 | 待验证 | ⚠️ **业务链路通过 / 检测组件缺陷** | WPS 实际写回缓存（mtime 15:54:50→16:09:09，11444→9143 bytes），但检测组件报"未变更"（缺陷 D2） |
| V3 | 保存行为识别 | 待验证 | ⚠️ **检测组件缺陷** | SAVE_AS 误判短路 + 另存为发现盲区（缺陷 D2/D3） |
| V4 | 回写成功 | 通过→被覆盖 | ✅ **通过**（16:11:22） | 三方 SHA-256 一致：App 本地 = App 远程校验 = 服务器实测 = df4b123bde512ded...（缺陷 D4：UI 状态被后续 V5 场景的预期失败覆盖） |
| V5 | 回写失败不破坏 | 待验证 | ✅ **通过**（人工判定） | 只读共享下回写被 SMB 层拒绝（STATUS_ACCESS_DENIED 0xc0000022），远程文件 SHA/本地缓存/无 tmp 残留三重完好 |
| V6 | 并发冲突 | **通过** | ✅ 通过 | 服务器侧独立修改（追加 CONFLICT-SIM）被检测：remote mtime=1792483938866 ≠ 基线=1792146025640 |
| V7 | 断网恢复 | 待验证 | ✅ **通过**（人工判定） | 断网：ENETUNREACH 错误正确报告、App 不崩溃；WiFi 恢复后重连成功、目录浏览正常 |

**结论：7 项中 5 项完全通过（V1/V4/V5/V6/V7），2 项（V2/V3）业务链路实际可用但检测组件存在缺陷。核心业务闭环（浏览→打开→编辑→保存→回写→校验→失败保护→冲突检测→断网恢复）端到端验证有效。**

## 各项详细记录

### V1 — WPS 可打开 ✅
- **复现步骤**：M2 页连接 SMB → 浏览根目录 → 点击 test-render.docx
- **现象**：WPS Writer 前台打开文档（舍弗勒 CSP_Line Setup 内容），无错误弹窗
- **证据**：URI file:///storage/emulated/0/PAD2/smb_cache/test-render.docx；基线 SHA-256 b5c8aa5499e0ac18...；缓存 11444 bytes
- **截图**：10-fix1-m2-connected.png、11-fix1-v1-result.png

### V2 — WPS 可保存 ⚠️ 业务通过/检测缺陷
- **复现步骤**：WPS 中点编辑铅笔进入编辑模式 → 点击文档 → input text "V2TEST-20261020" → 返回键 → 对话框点"保存"
- **现象**：文档字数 385→400；保存后缓存文件 mtime 16:09:09、大小 9143 bytes（内容确已被 WPS 写回）
- **检测组件表现**：App 内"检查本地变更"两次（16:00:47、16:09:37）均报"文件未变更"——与文件系统事实矛盾
- **根因**（缺陷 D2）：WPS 保存时先写随机命名中间文件（实测名 `1963289719.-1908999883-1548918099`），WpsSaveDetector 的 FileObserver 将其误判为 SAVE_AS_DETECTED 且 verdict 粘住，短路了 mtime/hash 对比分支（logcat: `Save-as detected` ×4 + `DirObserver: CLOSE_WRITE path: test-render.docx` 原地写回事件被忽略）
- **备注**：第一次点工具栏"保存按钮"（视觉坐标 163,80）未生效（文档仍有未保存修改，返回键时弹出保存确认框），疑与横竖屏坐标切换有关（屏幕实际 1920x1200 横屏），需人工复测排除（缺陷 D6）
- **截图**：13-wps-edit-mode.png、14-wps-text-input.png、16-wps-after-save.png、18-wps-back.png

### V3 — 保存行为识别 ⚠️ 检测缺陷
- **复现步骤**：App 内点"另存为检测"（两次：16:02:45、16:11:01）
- **现象**：均返回"未发现另存为候选文件（安全回退）"
- **根因**（缺陷 D2/D3）：① SAVE_AS 误判后 SaveAsDiscoveryService 按基名"test-render"扫描根目录/Documents/Download，随机命名中间文件不匹配；② 扫描逻辑仅收"扩展名变更"文件（`nameMatch && extensionChanged`），docx→docx 同名另存为是盲区
- **截图**：无（UI 显示安全回退提示）

### V4 — 回写成功 ✅（三方证据）
- **复现步骤**：App 内点"执行回写"（16:11:22）
- **现象**：回写成功，SHA-256 校验通过
- **证据链（三方一致）**：
  - App 本地 hash：df4b123bde512ded7fc44f11045b48e947176bce9ec8e35bdb7b2460ade8f670
  - App 远程校验 hash：df4b123bde512ded7fc44f11045b48e947176bce9ec8e35bdb7b2460ade8f670
  - 服务器实测（SSH）：/mnt/share/test-render.docx 9143 bytes @ 16:11:24，sha256 = df4b123b...（完全一致）
- **注意**：16:13:53 的第二次回写（旧 SMB 树连接保留写权限）也成功并覆盖远程文件；16:14:41 第三次回写在只读场景失败并把 UI 的 V4 状态覆盖为"失败"（缺陷 D4）——V4 的通过证据以 16:11:22 记录 + 服务器实测为准
- **截图**：20-v1-v7-final-status.png

### V5 — 回写失败不破坏 ✅（人工判定）
- **复现步骤**：服务器 smb.conf 改 `read only = yes` + reload → App 断开重连（新 SMB 树连接获得只读权限）→ 点"执行回写"
- **现象**：回写被 SMB 层拒绝：`STATUS_ACCESS_DENIED (0xc0000022): Create failed for \\192.168.2.3\share\test-render.docx.tmp...`
- **保护验证（三重）**：
  - 远程文件完好：sha256 仍为 df4b123b...（与失败前一致）
  - 本地缓存完好：mtime 16:09:09/9143 未动
  - 服务器无 .tmp 残留文件
- **机制说明**：回写采用"写临时文件→替换"策略，失败时不触碰原文件——保护机制有效
- **附带发现**：SMB reload-config 对已建立的树连接不生效（旧连接保留写权限），断开重连后才生效——符合 SMB 协议预期，但对"运维中途切只读"场景有安全提示意义（操作者须知：切只读后已连接客户端仍可写，直至重连）
- **备注**：M2 页无 V5 自动判定逻辑，UI 恒"待验证"，实际通过由人工依据上述证据判定

### V6 — 并发冲突 ✅
- **复现步骤**：服务器侧 `echo -n 'CONFLICT-SIM' >> /mnt/share/test-render.docx`（模拟第三方并发修改）→ App 点"检查远程变更"
- **现象**：正确检测到远程变更（16:12:34）
- **证据**：remote mtime=1792483938866（16:12:18 服务器修改）≠ 基线=1792146025640
- **截图**：20-v1-v7-final-status.png

### V7 — 断网恢复 ✅（人工判定）
- **复现步骤**：`adb shell svc wifi disable` → 点"检查远程变更" → `svc wifi enable` → 断开重连 SMB → 浏览目录
- **现象**：
  - 断网：错误正确报告 `ENETUNREACH (Network is unreachable)`（连接 192.168.2.3:445 超时 5s），App 不崩溃
  - 恢复：WiFi 重连后 SMB 重连成功（16:16:13-14），目录浏览正常
- **备注**：M2 页无 V7 自动判定逻辑，实际通过由人工判定

## 缺陷清单（P0/P1/P2 分级）

| ID | 级别 | 类别 | 描述 | 影响 | 状态 |
|---|---|---|---|---|---|
| D1 | **P0** | 构建流程 | 远程构建工程与本地权威源码漂移（Manifest 缺 3 个存储权限、19 个类缺失、6 个核心文件旧版）；S2 构建仅同步 web 资产未同步 java/Manifest | 产出 APK 无存储权限 → V1 全链路阻断；且旧版原生代码带着已知旧缺陷上线 | **已修复**（全量同步+重建 fix1），需固化流程：构建前强制 diff 校验 |
| D2 | **P1** | 原生检测 | WpsSaveDetector 将 WPS 保存时的随机命名中间文件误判为 SAVE_AS_DETECTED，verdict 粘住，短路 V2 原地保存检测（logcat 证实 CLOSE_WRITE 原文件事件被忽略） | 用户保存后 App 报"未变更"，误导用户；V2/V3 门禁无法自动通过 | 待修复（WpsSaveDetector.java 属冻结区，需 PM 裁定解冻或列入 S5） |
| D3 | **P1** | 原生检测 | SaveAsDiscoveryService 仅匹配"扩展名变更"文件且只扫根目录/Documents/Download；docx→docx 同名另存、WPS 私有目录保存均不可见 | 真实另存为场景无法自动发现，恒走"安全回退"手动选择 | 待修复（同 D2 冻结区约束） |
| D4 | **P2** | M2 页 UI | V4 状态被后续操作覆盖：16:11 通过 → 16:14（V5 只读场景预期失败）覆盖为"失败"，历史证据丢失 | 验证记录失真（本次以日志+服务器实测补救）；同类问题影响所有步骤状态 | 待修复（S5 任务范畴） |
| D5 | **P2** | 原生权限 | 卸载重装后 MANAGE_EXTERNAL_STORAGE 授权重置（uid 变更 + All files access 清零），App 无运行时检测与授权引导页 | 每次重装后 V1 报"缓存空间不足"误报，用户无从排查（本次人工 appops 授权恢复） | 待修复（需 UI 引导 + isExternalStorageManager() 检测） |
| D6 | **P2** | 待复测 | WPS 工具栏"保存按钮"第一次点击未生效（视觉坐标估算受横竖屏切换影响），返回键对话框保存才真正写回；不排除 WPS 对 ACTION_VIEW 文档的工具栏保存行为差异 | 可能影响真实用户"点保存"的体验（需人工复测确认是坐标问题还是产品行为） | 待人工复测 |
| D7 | **P2** | 原生错误处理 | checkCacheSpace 将"目录不可访问（getUsableSpace()=0）"误报为"缓存空间不足" | 排障误导（本次真实根因是权限缺失，报错信息完全不相关） | 待修复（区分 errno/权限场景报错） |

## 投用建议

### 两档验收标准对照

| 档次 | 内容 | 状态 |
|---|---|---|
| **核心路径可用** | SMB 浏览/打开文件（V1）、WPS 编辑后回写 SMB 且 SHA 校验（V4）、回写失败不破坏数据（V5）、并发变更检测（V6）、断网恢复（V7） | **达标** —— 可投用试运行 |
| **全功能** | 以上 + 保存行为自动识别（V2）、另存为自动发现引导（V3）、重装后权限自引导（D5） | **未达标** —— 依赖 D2/D3/D5 修复 |

### 投用前置条件（核心路径档）
1. D1 修复产物（fix1 APK）作为基线版本，**构建流程固化**：远程构建前强制全量 diff 本地 android/ 与远程工程，不一致即阻断
2. 明确重装场景的操作手册（D5 修复前）：重装后需在系统设置授予"所有文件访问权限"（本次验证荣耀路径：设置 → 所有文件访问权限 → PAD2，或 adb appops）

### 缺陷修复排期建议
- **D2/D3**（P1，冻结区）：建议 PM 裁定解冻热修或列入 S5 任务；修复后 V2/V3 可自动通过门禁，M2 页验证链路完整
- **D4**（P2）：随 S5 UI 任务一并处理（状态历史保留）
- **D5**（P2）：建议列入 S5（权限引导页 + 启动检测）
- **D6**（P2）：1 次人工复测即可定性（10 分钟）
- **D7**（P2）：随 D2/D3 解冻窗口一并小改（错误信息分流）

## 证据索引

- 截图目录：`docs/p003-ui/shots/s2/v1-v7/`（00-20 共 21 张：05-09 权限排查、10-11 V1、12-16 WPS 编辑保存、17-19 对话框保存、20 最终状态）
- App 导出日志（含完整 V1-V7 门禁状态+操作日志+详细结果）：`docs/p003-ui/shots/s2/v1-v7/m2a-exported-log.txt`（原始文件在 SMB 共享 apk/log/m2a-log-2026-10-20T08-17-00.txt）
- 服务器侧证据：/mnt/share/test-render.docx 三次 hash 变化（b5c8aa54 原始 → a7850356 冲突模拟 → df4b123b 编辑回写版本，现保持 df4b123b）
- logcat 关键证据：WpsSaveDetector SAVE_AS 误判序列（16:09:34）、DirObserver CLOSE_WRITE 原文件事件
- 构建修复证据：远程 diff（7 文件哈希不一致+19 缺失+1 多余）、aapt 权限验证、fix1 APK sha256（本地 pad2-p003-s2-ui-fix1.apk）

## 遗留事项

1. test-render.docx 内容已含测试编辑（"V2TEST-20261020" 前缀 + 9143 bytes 版本）——该文件为指定测试文件，保留现状作为验证痕迹；如需还原需从源头重新生成
2. /storage/emulated/0/PAD2/smb_cache/ 内有历史测试残留（p0-02-*.txt/docx、aaaa.rar 1.6GB）——不影响功能，建议后续加缓存清理策略
3. 服务器 /etc/samba/smb.conf 的 immutable 属性已恢复（+i），临时修改已回滚（read only = no）
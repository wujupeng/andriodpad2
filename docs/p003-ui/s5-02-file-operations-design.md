# TASK-S5-02：SMB 文件操作能力补齐设计与契约审查

> **任务性质**：纯设计任务（PM 2026-10-22 授权："仅授权设计与评审，不授权立即修改底层插件或开始实现"）
> **基线**：S5-01 试运行终态 APK `5d4fc4ed…`（源自 S4 冻结版 `b6b7d19e…` + 2 项阻断缺陷最小修复）
> **输入**：s5-01-realuse-acceptance.md 能力清单（复制/移动/重命名/删除禁用）+ OPERATION_CAPABILITIES 披露 + 本轮接口盘点
> **交付**：本文档（S5-02-A~G 七节 + 状态标注 + 实现顺序/测试矩阵/工作量）——供 PM Design Gate Review
> **硬约束**：不修改冻结 SMB Core（本任务零代码变更）；不新增未获授权的插件接口（仅设计）；不把 cleanup 挪用为删除（§E-4 明确拒绝）

---

## S5-02-A 现有接口盘点（Ground Truth）

### A-1 前端插件接口（src/adapter/smb/SmbPlugin.ts，17 方法）

| # | 方法 | 语义 | 与文件操作四能力关系 |
|---|------|------|---------------------|
| 1 | `connect` / 2 `disconnect` / 3 `isConnected` | 连接生命周期 | 前置 |
| 4 | `listDirectory({path?})` | 目录列举 | 前置（目标选择） |
| 5 | `openInWps({path})` | 缓存投递+唤起 WPS | 编辑链路 |
| 6-8 | `checkLocalFileChanged` / `foregroundCheck` / `resolveSaveAs` | 保存检测 | 编辑链路 |
| 9 | `writeback()` | 回写共享 | 编辑链路 |
| 10 | `checkRemoteChanged` | 远端变更 | 冲突检测 |
| 11 | `getFileAttributes({path})` | 大小/mtime | **信息展示已用** |
| 12 | `cleanup()` | **全量清缓存**（非单文件删除——PM 条件④：不得挪用） |
| 13 | `writeTextFile({path,content})` | 远端写文本 | 导出日志用 |
| 14 | `ensureDirectory({path})` | 建目录 | **新建文件夹已用**（createDirectory=true 披露属实） |
| 15 | `exportLog` / 16 `getSessionInfo` / 17 `isWpsInstalled` | 辅助 | — |

**结论**：17 方法中**无一**是 copy/move/rename/delete 入口——S4-04 `OPERATION_CAPABILITIES` 全 false 披露**与实况一致**（UI 菜单灰显原因即此）。

### A-2 原生底层能力（SmbClient.java，SMBJ 0.12.1，冻结区但只读盘点）

| 原生方法 | 底层语义 | 插件层暴露 | 四能力用途 |
|----------|---------|-----------|-----------|
| `readFile(path)` / `readFileStream(path)` | 远端读（全量/流式 InputStream） | ❌ | **copy 的读取半边** |
| `writeFile(path,data)` | 覆盖写（FILE_OVERWRITE_IF） | ❌（仅 writeTextFile 暴露文本变体） | copy 的写入半边 |
| **`writeFileSafe(path,data)`** | **临时文件→`File.rename(name,true)` 原子替换**（失败自动清临时） | ❌ | **copy 覆盖落位的安全模式（已有代码先例）**；证明 SMBJ rename API 在本项目可用 |
| **`deleteFile(path)`** | `diskShare.rm()`（含 reconnectIfNeeded） | ❌ | **远端删除原语已存在** |
| `createDirectory` / `directoryExists` | mkdir / folderExists | ✅（ensureDirectory） | 目录操作 |
| `getFileAttributes` | size/mtime | ✅ | 校验/预检 |
| —（无 rename 封装） | SMBJ `File.rename(newFileName, replaceIfExist)` 为**文件名级**（不跨目录） | ❌ | 同目录重命名需新增封装 |

### A-3 状态判定（按 PM 词表）

| 能力 | 状态 | 依据 |
|------|------|------|
| 新建目录 | **SUPPORTED** | ensureDirectory 插件方法真实存在（S5-01 已验） |
| 复制（远端→远端） | **NEEDS_IMPLEMENTATION（插件层桥接）** | 底层 readFileStream+writeFileSafe 原语齐备，仅缺 @PluginMethod 桥接与流式进度 |
| 移动（远端→远端） | **NEEDS_IMPLEMENTATION（组合）** | copy→SHA 校验→deleteFile 组合（§C）；SMBJ rename 不跨目录 |
| 重命名（同目录） | **NEEDS_IMPLEMENTATION（插件层桥接）** | SMBJ File.rename 可用（writeFileSafe 先例）；SmbClient 缺封装+插件缺方法 |
| 远端删除 | **NEEDS_IMPLEMENTATION（插件层桥接）** | **SmbClient.deleteFile 原生已存在**，仅缺 @PluginMethod |
| 本地删除（用户文件语义） | **OUT_OF_SCOPE** | 本地文件浏览（browse-local 视图）本身未实现（EmptyState 占位）；"本地"现仅有 smb_cache 缓存——单文件缓存清理归缓存管理（非用户文件操作），S5 不做 |
| 本地删除（缓存副本语义） | **OUT_OF_SCOPE** | 同上；全量 cleanup() 语义保留不动（§E-4） |
| 平板↔共享互传（上传/下载） | **OUT_OF_SCOPE** | PM S5-02 表格未列；产品范围 REQ-04 跨端操作归后续任务 |

**"仅存在于 UI"清单**：ConflictDialog 四选一/RenameDialog 校验/DeleteConfirmDialog 双语义/operationStore 七态/进度面板——交互壳已交付（S4-04/05/06），等待底层接线（这正是 S5-03 的范围）。

---

## S5-02-B 复制设计

### B-1 接口契约（拟新增 @PluginMethod，待授权）

```
copyFile(options: { sourcePath: string; destinationPath: string;
                    overwrite: boolean }): Promise<CopyResult>
// CopyResult = { success: boolean; bytesCopied: number; sha256?: string;
//                error?: string; conflict?: boolean }
// 进度经既有 Capacitor 事件或轮询（见 B-4）
```

### B-2 传输流程（复用 writeFileSafe 原子模式）

1. **预检**：源存在（getFileAttributes）+ 目标父目录存在（directoryExists）+ 目标重名检测（复用 A-2 attributes 探测，避免 mkdir 型冲突）；
2. **流式传输**：`readFileStream(source)` → 逐块写**远端临时文件** `dest + ".pad2tmp.<ts>"`（不在目标名上直写——失败绝不污染/半写既有文件）；
3. **原子落位**：临时文件 `File.rename(目标名, replaceIfExist=overwrite)`（writeFileSafe 同模式）；
4. **校验**：落位后对目标 `readFileStream` 计算 SHA-256 与源对比（传输完整性，REQ-04）；
5. **失败清理**：任一步失败 → 删除临时文件 → 原目标不受影响（原子性保证）。

### B-3 覆盖策略（三级，对齐既有 ConflictDialog）

| 用户决策 | overwrite 参数 | 服务端行为 |
|----------|---------------|-----------|
| 跳过 skip | —（前端不入队） | 无请求 |
| 覆盖 overwrite | `true` | rename replaceIfExist=true（原子替换旧文件） |
| 保留两者 keep-both | `false` + 前端已改为"名称 (2)"目标 | rename replace 无冲突发生 |

`overwrite=false` 且目标已存在 → 插件层返回 `conflict: true`（不覆写、不删除目标——**禁静默覆盖**，spec 5.5.1-R10）。

### B-4 进度与取消

- **进度**：流式循环内累计字节数 → 两种通道（择一，S5-03 评审定）：a) Capacitor `App.addListener('copyProgress')` 事件推送（原生→web 回调，低频 250ms 节流）；b) 前端轮询 `getOperationStatus`。**倾向 a**（复用 operationStore 现行 in_progress 语义，无新状态机）；
- **取消**：插件方法 `cancelOperation()` 置原生 volatile 标志 → 流循环逐块检查 → 当前块写完即停 → **删除临时文件**（半成品不残留）→ 返回 `{ success:false, cancelled:true, bytesCopied }`；已完成的其他批次文件保留（operationStore R8 语义已就绪，仅接线）。

### B-5 失败恢复

- 网络中断（mid-stream）：SMBJ 抛 IOException → 临时文件删除 → 前端分类 network_lost/unreachable → **回流 network_interrupted**（browseStore/SessionStatusStrip 既有链路）→ 用户重试=全新 copy（幂等，源/目标状态未破坏）；
- 断电/进程死亡极端窗口：可能残留 `.pad2tmp.*` 临时文件 → 启动时/操作前清扫（复用 SaveAsDiscoveryService EXCLUDED_TEMP 排除模式——临时后缀天然不会被误认为用户文件）；**无数据损失路径**（源不动、目标只在 rename 原子步变更）。

---

## S5-02-C 移动设计

### C-1 跨目录支持判定

**支持跨目录**，但实现为 **copy→verify→delete 组合**而非 SMB rename 直移：SMBJ `File.rename` 仅文件名级（writeFileSafe 先例证实），SMB2 FileRenameInformation 跨目录语义在 smbj 0.12.1 无可靠封装——不引入未验证 API 路径。

### C-2 防丢失顺序（核心安全设计）

```
1. copy 阶段（B-2 全流程，含 SHA-256 校验目标==源）
2. 校验通过 → 才执行 deleteFile(source)   ← 绝不先删源
3. 校验失败/中断 → 源文件完好保留（移动失败=复制失败，零损失）
```

**窗口分析**：copy 成功后、delete 源前的中断（断网/断电）→ 结果=**源与目标并存**（重复文件）——安全侧失败（用户重跑即完成移动，ConflictDialog 处理目标已存在）；**不存在"文件消失"窗口**。此语义写入 UI 文案（移动失败提示："源文件未受影响"）。

### C-3 同名/批量

- 目标同名走 ConflictDialog 三决策（skip 时源保留不删——**跳过即完整不动**）；
- 批量：operationStore 逐目标顺序执行（串行防带宽争抢）+ partial_failed 聚合 + 失败清单（已交付，S4-04）。

---

## S5-02-D 重命名设计

### D-1 接口契约（拟新增）

```
renameFile(options: { path: string; newName: string }): Promise<{ success: boolean; error?: string }>
```

### D-2 流程与校验（三层）

1. **前端校验**（RenameDialog 已交付）：非法字符 `\/:*?"<>|` / 长度>255 / 与同目录列表重名（忽略自身原名）——确认禁用至合法；
2. **服务端预检**（新增）：`getFileAttributes(目标完整路径)` 探测——目标已存在 → 返回 `conflict`（前端呈现"同名项目已存在"内联）；目录不存在/网络不可达 → 分类错误；
3. **原子执行**：`File.rename(newName, replaceIfExist=false)`（open with GENERIC_WRITE+DELETE access，writeFileSafe 同模式；**replaceIfExist 恒 false**——重命名语义绝不覆盖）。

### D-3 异常处理

| 异常 | 服务端现象 | 前端分类（smbErrorMapper） | 用户呈现 |
|------|-----------|--------------------------|---------|
| 网络中断 | IOException mid-rename | network_lost/unreachable | danger Banner"操作失败"+ **源文件名不变**（rename 原子性——要么成功要么原样）；回流 network_interrupted |
| 权限不足 | SMBApiException ACCESS_DENIED | permission_denied | "没有访问该位置的权限" |
| 目标已存在（竞态窗口） | rename replace=false 失败 | conflict（新增映射，§F-2） | 内联"同名项目已存在" |
| 认证失效 | LOGON_FAILURE | auth_failed | 回流 session_invalid（danger Banner+重连） |

---

## S5-02-E 删除设计（安全关键：双语义严格隔离）

### E-1 语义定义

| 语义 | 对象 | 机制 | 可恢复性 |
|------|------|------|---------|
| **远端永久删除** | 共享上的用户文件 | `SmbClient.deleteFile`（diskShare.rm）——**原生已存在**，仅缺插件桥接 | **不可恢复**（服务器无回收站） |
| **本地缓存清理** | smb_cache 内 PAD2 自建缓存副本 | 既有 `cleanup()`（全量） | 可恢复（重新打开重新缓存） |

### E-2 隔离机制（四层防线）

1. **UI 层三重区分**（已交付 S4-05，Gate-UI-4 验证）：文案（"删除共享文件/此操作不可恢复/永久删除" vs "删除到回收站"类）、警示元素（红图标+红文案+勾选框仅远端）、按钮（danger 禁用至勾选 vs secondary 直点）；
2. **入口层**：远端删除仅两条入口（单文件菜单项/批量按钮）且均经 DeleteConfirmDialog；**无任何代码路径可绕过确认直调**（operationStore.executeDelete 唯一入口）；
3. **插件层**：`deleteRemoteFile({path})` 独立方法——与 `cleanup()` **零代码共享**（不同方法、不同目标集：rm(路径) vs 缓存目录遍历）；**cleanup 永不挪用为单文件删除**（PM 条件④，语义不同：缓存清理≠用户文件删除）；
4. **执行层安全**：删除前 `getFileAttributes(path)` 预检（目标存在且为文件——**目录删除 S5 不做**，rm 对目录行为不确定且批量目录递归删除风险高，标注 OUT_OF_SCOPE 递归删除）；删除后服务器端核验（§G）；失败如实报告（不删也报告成功=最严重红线）。

### E-3 本地删除 = OUT_OF_SCOPE（正式声明）

本地文件浏览（browse-local）未实现；"本地删除用户文件"无对象。缓存管理保留全量 cleanup 语义（设置页/工具入口，非文件菜单）。**S5-05 实现时只交付远端删除**；UI 的"本地删除"分支保留双语义设计（为将来本地浏览预留）但菜单入口对远端浏览态只出远端语义。

---

## S5-02-F 统一错误契约

### F-1 分类框架（复用 smbErrorMapper 七类，零新类别）

| 类别 | 服务端信号（SMBJ/SMB2） | 现有映射 | 操作语义 |
|------|------------------------|---------|---------|
| auth_failed | SMBApiException STATUS_LOGON_FAILURE | ✅ 已有 | 会话失效，重连 |
| permission_denied | STATUS_ACCESS_DENIED / SHARING_VIOLATION | ✅（access_denied 模式） | 单项失败，不中断批次 |
| network_lost / unreachable | IOException（ENETUNREACH/EOF/reset） | ✅ 已有 | 回流 network_interrupted |
| timeout | 既有超时模式 | ✅ | 操作级失败 |
| disk_full | STATUS_DISK_FULL / 存储配额 | ✅ 已有 | 操作级失败 |
| **conflict（新映射模式）** | rename replace=false 失败 / 目标已存在预检 | ❌ **需扩 smbErrorMapper 正则**（`exists|already|conflict|已存在`——UI 层已用，插件层错误串需补） | 冲突决策入口 |
| unknown | 兜底 | ✅ | 如实失败 |

### F-2 部分失败与重复操作

- **部分失败**：operationStore runBatch 已交付——逐目标 catch→failures 清单→partial_failed 聚合（文件名+原因）；S5-03 仅替换 executor 为真实插件调用；
- **重复操作幂等性**：
  - 同 (kind, source, destination) 存在 pending/in_progress 任务 → 入队拒绝（operationStore 防重入，已有 connect 同模式）；
  - 已完成任务重复发起 → 走目标存在检测→ConflictDialog（用户显式决策，无静默重复覆盖）；
  - copy 中断重试 → 全新任务（临时文件已清理，无残留态）。

---

## S5-02-G 测试与兼容性（服务器端实际结果验证矩阵）

### G-1 验证总则

**每操作断言三件套**：操作前服务器基线（ls+sha256sum）→ App 内操作（UI 真实点击）→ 操作后服务器核验（ls+sha256sum+内容 diff）——**绝不以 UI 任务状态/Toast 为通过依据**（PM 评审条件②，S5-01 三方 SHA 方法论延续）。

### G-2 测试矩阵（操作 × 场景）

| 场景 | 复制 | 移动 | 重命名 | 远端删除 |
|------|------|------|--------|---------|
| 正常（单文件） | 目标出现+SHA==源 | 源消失+目标 SHA==源 | 旧名消失+新名存在+SHA 不变 | 文件消失（ls 核验） |
| 目标同名 | skip=零变化/overwrite=新内容/keep-both=(2) 并存 | 同左（skip=源保留） | conflict 内联提示 | — |
| 目录内多文件批量 | partial（第 2 项预置失败）→ 失败清单+第 1/3 项成功 | 同左 | — | 批量删除+服务器逐一核验 |
| 权限不足（服务器 chmod 000 预置） | permission_denied+源/目标零变化 | 同左+**源保留** | 同左 | 失败+文件仍在 |
| 断网 mid-op（svc wifi disable） | network_interrupted 回流+临时文件无残留（服务器 ls 核验） | **源保留**（未到删除步）+目标无半文件 | 源名不变 | 失败+文件仍在 |
| 取消 mid-op | 已完成项保留+当前项临时清理（服务器核验） | 同左+**源全部保留** | — | — |
| 会话失效（改密码+restart smbd） | session_invalid 回流+重连后可重试 | 同左 | 同左 | 同左 |
| 熄屏/后台窗口 | 操作不启动（冻结）或如实失败——不出现虚假成功 | 同左 | 同左 | 同左 |
| 重复点击连点 ×5 | 单任务防重入（无重复目标） | 同左 | 同左 | 单次确认后单次执行 |
| 大文件（≥50MB）流式 | 进度推进+完成 SHA 一致+无 OOM | 同左 | — | — |
| 空间不足（服务器 quota 预置） | disk_full+目标零变化+临时清理 | 同左+源保留 | — | — |

### G-3 兼容性

- 环境：既有真机三件套（NDL2_W09/Android 16/WPS 14.25.0）+ pad2gate3 + gate4-test 专用目录（**测试目录隔离，绝不触真实用户文件**——PM 条件②）；
- SMBJ 0.12.1 rename/rm API 已在 writeFileSafe/cleanup 生产路径验证——无新库版本引入（零依赖变更）；
- 服务器预置工具：chmod 权限、setquota 配额、iptables 网络注入（Gate-UI-4 方法论复用）。

---

## PM 评审条件逐条对照（§四 六条件）

| # | 条件 | 满足情况 |
|---|------|---------|
| 1 | 每项能力对应真实接口或明确待实现接口 | ✅ A-1/A-2 双层盘点：SUPPORTED（ensureDirectory 真实存在）/NEEDS_IMPLEMENTATION（B-1/D-1 契约拟定的 4 个插件方法+1 个 SmbClient.rename 封装）/OUT_OF_SCOPE（本地删除/递归删除/跨端互传）——无一项凭 UI 存在标 SUPPORTED |
| 2 | 数据损失操作有明确安全策略 | ✅ 覆盖=writeFileSafe 原子替换（失败原文件不变）；移动=copy→SHA 校验→delete 源（校验不过不删，**无文件消失窗口**）；删除=E-2 四层防线+前后服务器核验+失败如实 |
| 3 | 取消/部分失败/重复操作语义明确 | ✅ F-2+B-4：取消=块边界停止+临时清理+已完成保留；部分失败=partial_failed+失败清单（已交付接线）；重复=防重入+目标存在走 ConflictDialog |
| 4 | 不把清缓存挪用为删除 | ✅ E-1/E-4：deleteRemoteFile 与 cleanup 零代码共享、语义声明隔离、单文件删除绝不调 cleanup |
| 5 | 冻结 SMB Core 不因设计被直接修改 | ✅ 本任务零代码变更（纯文档）；拟新增改动均属"待 S5-03 授权后实施"（插件桥接层+SmbClient 补 rename 封装——后者属原生层新增方法而非修改既有逻辑，最小侵入） |
| 6 | 附最小实现顺序/测试矩阵/工作量 | ✅ 见下 §六 |

## 六、最小实现顺序与工作量（S5-03 输入，待授权）

| 阶段 | 内容 | 预估 |
|------|------|------|
| ①插件桥接 | SmbPlugin.java 新增 4 @PluginMethod（copyFile/moveFile/renameFile/deleteRemoteFile）+ SmbClient 补 renameFile 封装 + smbErrorMapper 补 conflict 模式 + OPERATION_CAPABILITIES 翻真 | 1-1.5 日 |
| ②store 接线 | operationStore executor 替换（missingCapabilityExecutor→真实桥接）+ 进度事件接线 + BrowsePage 能力表自动启用 | 0.5 日 |
| ③真机验收 | G-2 矩阵执行（四操作×正常/同名/批量/权限/断网/取消/失效/取消连点/大文件）+ 服务器三件套核验 + 证据归档 | 1-1.5 日 |
| **合计** | | **3-3.5 日**（对应 PM 规划的 S5-03~S5-05，建议按 PM 节奏拆三任务分别授权验收） |

**实现顺序依据**：先桥接（能力可用）→ 再接线（UI 启用）→ 后验收（安全证据）；每步可独立回滚（capabilities 表回 false 即恢复禁用态——天然回滚开关）。

## 七、风险清单

| 风险 | 等级 | 缓解 |
|------|------|------|
| SMBJ rename 在真实 Windows/Samba 服务器的行为差异（本项目仅 Debian Samba 验证） | 中 | G-2 矩阵覆盖+writeFileSafe 已在生产路径使用同 API；S6-01 兼容性矩阵补 Windows 目标 |
| 大文件流式传输内存（readFile 全量加载陷阱） | 中 | 实现强制走 readFileStream（禁用 readFile 于 copy 路径）+50MB 用例把关 |
| copy 进度事件通道选型（a/b）实现复杂度 | 低 | S5-03 评审一次定夺（倾向事件推送） |
| 移动 copy-verify-delete 在超慢网络的长窗口（源目标并存态） | 低 | UI 文案已含"源文件未受影响"；重试幂等 |
| smbErrorMapper 正则对 SMBJ 错误串的覆盖盲区 | 中 | G-2 权限/冲突用例真实采集错误串回填模式表（R-03 既有缓解机制） |
| 与体验问题 1/2/3（首点静默/重复卡/重连刷新）的耦合 | 无 | PM 已裁定独立任务，S5-02/S5-03 不触碰 |

---

## 八、提请 Design Gate Review

本设计满足 PM 六项评审条件；四能力状态判定基于双层接口实证盘点（非 UI 推断）；数据安全策略覆盖全部损失路径（原子替换/copy-verify-delete/四层删除防线）；测试矩阵以服务器端实际结果为唯一通过依据。

**提请 PM Design Gate Review**：通过后授权 S5-03（建议按 §六 ①②③ 三步分别授权验收；或按 PM 已有规划 S5-03 复制移动→S5-04 重命名目录→S5-05 删除拆分，本设计的 B/C/D/E 节可直接作为各任务输入）。
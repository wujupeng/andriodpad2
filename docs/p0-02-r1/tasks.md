# P0-02-R1 编码任务规划：WPS Save Detection & MIME Compatibility

> 本文档为 P0-02-R1 修复任务的编码任务规划，基于 `docs/p0-02-r1/spec.md`（R1-01 ~ R1-05 EARS 需求与 23 条验收标准）与 `docs/p0-02-r1/design.md`（增量设计方案、架构变更汇总、PM 约束遵从说明）生成。任务按修复优先级排列：先修复 .docx MIME 交付（R1-03），再修复保存检测（R1-01），然后另存为发现（R1-02），最后回归验证（R1-04）和证据归档（R1-05）。
>
> **PM 三项关键技术约束**（所有任务须遵从）：
> 1. 不得直接把监控范围扩展到整个 `/storage/emulated/0/` 作为最终方案
> 2. 不得只靠文件扩展名解决 .docx 问题，须评估受控的 `content://` 交付方案
> 3. 保存检测不等于回写成功，最终须核验 SMB 远端文件内容与预期一致
>
> **代码基线**：commit 792a9e0（诊断性改进），PM Gate Review 裁定 HOLD / FIX REQUIRED
> **目标设备**：HONOR NDL2_W09, Android 16, API 36, WPS cn.wps.moffice_eng
> **源码包路径**：`android/app/src/main/java/com/pad2/filemanager/smb/`

---

## 0. 文件变更清单总览

### 0.1 新增文件（8 个）

| 文件路径 | 类名 | 对应子项 | 职责 |
|---------|------|---------|------|
| `smb/SaveDetectionVerdict.java` | SaveDetectionVerdict | R1-01 | 保存检测判定结果枚举（六态） |
| `smb/SaveDetectionResult.java` | SaveDetectionResult | R1-01 | 结构化判定结果对象 |
| `smb/SaveAsDiscoveryService.java` | SaveAsDiscoveryService | R1-02 | 另存为结果发现服务（有限扫描 + SAF 回退） |
| `smb/SaveAsResolutionPrompt.java` | SaveAsResolutionPrompt | R1-02 | 另存为关联决策交互 |
| `smb/DocxContentSniffer.java` | DocxContentSniffer | R1-03 | .docx 内容嗅探组件 |
| `smb/DeliveryStrategySelector.java` | DeliveryStrategySelector | R1-03 | 交付策略选择器 |
| `smb/R1RegressionTestSuite.java` | R1RegressionTestSuite | R1-04 | R1 回归测试套件 |
| `smb/EvidenceArchiver.java` | EvidenceArchiver | R1-05 | 证据归档器 |

### 0.2 修改文件（3 个）

| 文件路径 | 修改类型 | 修改内容 | 对应子项 |
|---------|---------|---------|---------|
| `smb/WpsSaveDetector.java` | 扩展 | checkChange() 返回 SaveDetectionResult；isTempFile() 新增数字命名正则；foregroundCheck() 扩展另存为扫描触发 | R1-01, R1-02 |
| `smb/WpsDeliveryHandler.java` | 扩展 + 修复 | openFileInWps() 对 .docx 采用 content:// 首选；writeback() 修复远端 SHA-256 核验；checkLocalFileChanged() 适配 SaveDetectionResult | R1-01, R1-03 |
| `smb/FileAppResolver.java` | 扩展 | 新增 getMimeTypeWithSniff() 方法 | R1-03 |

### 0.3 不修改的配置文件

| 配置文件 | 原因 |
|---------|------|
| `AndroidManifest.xml` | 已有 MANAGE_EXTERNAL_STORAGE 权限、`<queries>` 声明、FileProvider 配置，无需修改 |
| `res/xml/file_paths.xml` | `external-path path="."` 已覆盖外部存储根目录，可为 smb_cache 文件生成 content:// URI，无需修改 |
| `app/build.gradle` | 无新增依赖需求，现有 SMBJ 0.12.1 + Room 2.6.1 满足要求 |

---

## 1. .docx MIME 兼容交付修复（R1-03）

> **修复优先级**：最高 — .docx 渲染失效导致核心功能不可用，须首先修复
> **关联需求**：R1-03 .docx MIME 兼容交付（验收标准 R1-03-AC-01 ~ R1-03-AC-05）
> **修复缺陷**：D-06（file:// URI 对 .docx 交付失效）、D-07（content:// 回退条件不足）、D-09（MIME type 仅凭扩展名）、D-10（MIME type 缺少内容嗅探）
> **PM 约束遵从**：约束 2 — 综合核查 URI 方案、MIME type、文件实际内容与访问授权，不仅凭扩展名

### 1.1 P0-02-R1-T01：新增 DocxContentSniffer 内容嗅探组件

- [ ] **T01 实现 DocxContentSniffer.sniff() 内容嗅探方法**，验证 .docx 文件为有效 Word 2007+ 文档（ZIP 格式 + `[Content_Types].xml` 存在），返回 SniffResult（VALID / INVALID / CORRUPTED）
  - **关联需求**：R1-03（R1-03-AC-02 MIME type 与文件实际内容一致）
  - **涉及文件**：新增 `smb/DocxContentSniffer.java`、新增 `smb/SniffResult.java`（含 SniffStatus 枚举）
  - **任务描述**：
    1. 创建 `SniffStatus` 枚举（VALID / INVALID / CORRUPTED）
    2. 创建 `SniffResult` 类（含 status 字段与 detail 描述字段）
    3. 创建 `DocxContentSniffer` 类，实现 `sniff(File file)` 方法
    4. `sniff()` 核心逻辑：读取文件前 4 字节检查 ZIP magic number `PK\x03\x04`；ZIP 有效时用 `java.util.zip.ZipFile` 检查是否含 `[Content_Types].xml` 条目；两项均满足 → VALID，ZIP 有效但缺 OOXML 结构 → INVALID，ZIP 无效 → CORRUPTED
    5. 嗅探仅检查 magic number + 条目存在性，不解压全部内容，控制性能开销
  - **验收标准**：[传入有效 .docx 文件] → [sniff() 返回 VALID]；[传入扩展名为 .docx 但内容非 ZIP 的文件] → [返回 CORRUPTED]；[传入有效 ZIP 但缺 Content_Types.xml 的文件] → [返回 INVALID]
  - **依赖关系**：无前置依赖
  - **预估复杂度**：低

### 1.2 P0-02-R1-T02：新增 DeliveryStrategySelector 交付策略选择器

- [ ] **T02 实现 DeliveryStrategySelector.selectStrategy() 交付策略选择方法**，根据文件类型与内容嗅探结果选择 URI 交付方案（CONTENT_URI_FIRST / FILE_URI_FIRST / REJECT_DELIVERY）
  - **关联需求**：R1-03（R1-03-AC-03 URI 方案经设备实测验证）
  - **涉及文件**：新增 `smb/DeliveryStrategySelector.java`、新增 `smb/DeliveryStrategy.java`（含 UriScheme 枚举）
  - **任务描述**：
    1. 创建 `UriScheme` 枚举（FILE_URI_FIRST / CONTENT_URI_FIRST / REJECT_DELIVERY）
    2. 创建 `DeliveryStrategy` 类（含 uriScheme、mimeType、intentAction 字段）
    3. 创建 `DeliveryStrategySelector` 类，实现 `selectStrategy(String fileType, SniffResult sniffResult)` 方法
    4. 核心逻辑：fileType == "docx" 且 sniffResult == VALID → CONTENT_URI_FIRST（content:// 首选，file:// 回退）；fileType == "docx" 且 sniffResult != VALID → REJECT_DELIVERY（拒绝交付，提示文件损坏）；其他文件类型 → FILE_URI_FIRST（file:// 首选，content:// 回退，保持现有行为）
  - **验收标准**：[传入 fileType="docx" 且 sniffResult=VALID] → [返回 CONTENT_URI_FIRST]；[传入 fileType="docx" 且 sniffResult=CORRUPTED] → [返回 REJECT_DELIVERY]；[传入 fileType="txt"] → [返回 FILE_URI_FIRST]
  - **依赖关系**：依赖 T01（DocxContentSniffer + SniffResult）
  - **预估复杂度**：低

### 1.3 P0-02-R1-T03：扩展 FileAppResolver 新增带嗅探的 MIME type 方法

- [ ] **T03 实现 FileAppResolver.getMimeTypeWithSniff() 方法**，基于扩展名映射 MIME type 并通过内容嗅探验证一致性
  - **关联需求**：R1-03（R1-03-AC-02、R1-03-AC-05 须补充核查综合兼容性）
  - **涉及文件**：修改 `smb/FileAppResolver.java`（现有 165 行，在 getMimeType() 之后新增方法）
  - **任务描述**：
    1. 新增静态方法 `getMimeTypeWithSniff(String fileName, File file)`
    2. 调用现有 `getMimeType(fileName)` 获取扩展名映射的 MIME type
    3. 若 MIME type 为 .docx 类型（`application/vnd.openxmlformats-officedocument.wordprocessingml.document`），调用 `DocxContentSniffer.sniff(file)` 验证文件实际内容
    4. 嗅探结果为 VALID → 返回映射的 MIME type；嗅探结果为 INVALID/CORRUPTED → 返回 null 并记录警告日志
    5. 非 .docx 文件直接返回扩展名映射的 MIME type（保持现有行为）
  - **验收标准**：[传入有效 .docx 文件名与文件] → [返回正确 MIME type]；[传入损坏 .docx 文件] → [返回 null 并记录警告日志]；[传入 .txt 文件] → [返回 text/plain，不触发嗅探]
  - **依赖关系**：依赖 T01（DocxContentSniffer）
  - **预估复杂度**：低

### 1.4 P0-02-R1-T04：修改 WpsDeliveryHandler 对 .docx 采用 content:// 首选交付

- [ ] **T04 重构 WpsDeliveryHandler.openFileInWps() 交付逻辑**，对 .docx 文件采用 content:// URI（FileProvider）首选方案，修复 file:// URI 对 .docx 在目标 WPS 版本失效问题
  - **关联需求**：R1-03（R1-03-AC-01 WPS 渲染为 Word 文档界面、R1-03-AC-03 URI 方案经实测验证、R1-03-AC-04 渲染异常检测）
  - **涉及文件**：修改 `smb/WpsDeliveryHandler.java`（现有 296 行，重构 openFileInWps() 方法第 43-177 行）
  - **任务描述**：
    1. 在 openFileInWps() 中，缓存文件后提取文件扩展名
    2. 对 .docx 文件：先调用 `DocxContentSniffer.sniff(localFile)` 进行内容嗅探；嗅探结果为 VALID 时，调用 `DeliveryStrategySelector.selectStrategy("docx", sniffResult)` 获取 CONTENT_URI_FIRST 策略；使用 `FileProvider.getUriForFile()` 生成 content:// URI 作为首选，设置 `FLAG_GRANT_READ_URI_PERMISSION | FLAG_GRANT_WRITE_URI_PERMISSION | FLAG_GRANT_PERSISTABLE_URI_PERMISSION`；content:// 启动失败时回退到 file:// URI
    3. 嗅探结果为 INVALID/CORRUPTED 时，不交付 WPS，返回错误提示"文件可能已损坏，无法作为 Word 文档打开"
    4. 对非 .docx 文件：保持现有 file:// URI 首选 + content:// 回退行为不变
    5. 使用 `FileAppResolver.getMimeTypeWithSniff(localFileName, localFile)` 替代 `FileAppResolver.getMimeType(localFileName)` 设置 MIME type
    6. 记录交付策略选择日志（文件类型、嗅探结果、URI 方案、MIME type）
  - **验收标准**：[用户点击有效 .docx 文件] → [WPS 通过 content:// URI 渲染为 Word 文档界面，不显示 XML/ZIP 文本]；[用户点击损坏 .docx 文件] → [提示文件损坏，不交付 WPS]；[用户点击 .txt 文件] → [保持现有 file:// 交付行为不变]；[content:// 启动失败] → [回退到 file:// 并记录日志]
  - **依赖关系**：依赖 T01、T02、T03
  - **预估复杂度**：中

---

## 2. 保存检测关联判定修复（R1-01）

> **修复优先级**：高 — 保存成功误判导致回写逻辑被错误触发
> **关联需求**：R1-01 保存检测关联判定（验收标准 R1-01-AC-01 ~ R1-01-AC-05）
> **修复缺陷**：D-01（数字命名临时文件未过滤）、D-02（保存检测缺少明确判定枚举）、D-03（dirObserver 另存为结果未计算 SHA-256）、D-08（回写校验计算错误）
> **PM 约束遵从**：约束 3 — 保存检测不等于回写成功，修复回写核验为远端 SHA-256

### 2.1 P0-02-R1-T05：新增 SaveDetectionVerdict 枚举与 SaveDetectionResult 结构

- [ ] **T05 实现 SaveDetectionVerdict 枚举与 SaveDetectionResult 结构化判定结果对象**，替代现有 contentChanged/mtimeChanged 布尔标志
  - **关联需求**：R1-01（R1-01-AC-01 三要素关联、R1-01-AC-02 临时文件不得作为保存成功依据、R1-01-AC-03 mtime 误报判定）
  - **涉及文件**：新增 `smb/SaveDetectionVerdict.java`、新增 `smb/SaveDetectionResult.java`
  - **任务描述**：
    1. 创建 `SaveDetectionVerdict` 枚举，含六态：SAVE_SUCCESS、SAVE_FAILED、SAVE_AS_DETECTED、TEMP_FILE_FILTERED、DETECTION_UNCERTAIN、MTIME_FALSE_POSITIVE
    2. 创建 `SaveDetectionResult` 类，含字段：verdict（SaveDetectionVerdict）、originalFilePath（String）、resultFilePath（String）、baselineSha256（String）、finalSha256（String）、baselineMtime（long）、finalMtime（long）、evidence（String，判定依据描述）、timestamp（long）
    3. 实现 `toMap()` 方法，将 SaveDetectionResult 转换为 `Map<String, Object>`，保持与现有 checkChange() 返回类型兼容（含 changed/contentChanged/mtimeChanged/saveAsDetected 等兼容字段，供 WpsDeliveryHandler.checkLocalFileChanged() 适配）
  - **验收标准**：[创建 SaveDetectionResult 并设置 verdict=SAVE_SUCCESS] → [toMap() 含 verdict="SAVE_SUCCESS" 及全部关联字段]；[toMap() 兼容字段] → [changed/contentChanged/mtimeChanged/saveAsDetected 字段存在且值正确]
  - **依赖关系**：无前置依赖
  - **预估复杂度**：低

### 2.2 P0-02-R1-T06：扩展 WpsSaveDetector.isTempFile() 新增数字命名临时文件正则

- [ ] **T06 扩展 WpsSaveDetector.isTempFile() 方法**，新增正则匹配数字命名临时文件模式（如 `-486781428.-1908999883225750862`），修复 D-01 缺陷
  - **关联需求**：R1-01（R1-01-AC-02 临时文件不得作为保存成功依据）
  - **涉及文件**：修改 `smb/WpsSaveDetector.java`（现有 281 行，修改 isTempFile() 方法第 235-243 行）
  - **任务描述**：
    1. 在现有 `isTempFile(String fileName)` 方法中，保留 5 种现有模式匹配（`~$` 前缀、`.tmp` 后缀、`.temp` 后缀、`.moffice_wr_check` 前缀、`.~lock` 前缀）
    2. 新增正则匹配 `^-?\d+\.-?\d+$`（数字命名临时文件，如 `-486781428.-1908999883225750862`），使用 `java.util.regex.Pattern` 预编译正则避免重复编译开销
    3. 正则严格匹配纯数字与点号组合的文件名，合法文档文件名不会仅含数字与点，避免误过滤
  - **验收标准**：[传入 "-486781428.-1908999883225750862"] → [返回 true]；[传入 "报告.docx"] → [返回 false]；[传入 "~$temp.docx"] → [返回 true（现有模式）]；[传入 "123"] → [返回 false（不含点号）]
  - **依赖关系**：无前置依赖
  - **预估复杂度**：低

### 2.3 P0-02-R1-T07：重构 WpsSaveDetector.checkChange() 返回 SaveDetectionResult

- [ ] **T07 重构 WpsSaveDetector.checkChange() 方法**，返回结构化判定结果 SaveDetectionResult，实现六态判定逻辑，修复 D-02、D-03 缺陷
  - **关联需求**：R1-01（R1-01-AC-01 三要素关联、R1-01-AC-02 临时文件、R1-01-AC-03 mtime 误报、R1-01-AC-05 禁止仅凭单一信号判定）
  - **涉及文件**：修改 `smb/WpsSaveDetector.java`（重构 checkChange() 方法第 168-210 行）
  - **任务描述**：
    1. 将 `checkChange()` 返回类型从 `Map<String, Object>` 改为 `SaveDetectionResult`
    2. 判定逻辑：比对 `monitoredFile.lastModified()` 与 baselineMtime
    3. mtime 未变更 → verdict = DETECTION_UNCERTAIN（无最终结果文件变更）
    4. mtime 变更 → 计算 SHA-256；SHA-256 == baselineSha256 → verdict = MTIME_FALSE_POSITIVE（mtime 误报）；SHA-256 != baselineSha256 → verdict = SAVE_SUCCESS（三要素关联满足，含原文件路径、结果文件路径、基线/最终 SHA-256 与 mtime）
    5. saveAsDetected == true → verdict = SAVE_AS_DETECTED（另存为已发现）
    6. SHA-256 计算失败 → verdict = DETECTION_UNCERTAIN，evidence 含异常信息
    7. dirObserver 检测到文件名不同的非临时文件时，对新文件计算 SHA-256 并记录到 SaveDetectionResult（修复 D-03）
    8. 填充 SaveDetectionResult 全部字段（originalFilePath、resultFilePath、baselineSha256、finalSha256、baselineMtime、finalMtime、evidence、timestamp）
    9. 保留 `toMap()` 兼容性，调用方可通过 toMap() 获取 Map 格式结果
  - **验收标准**：[WPS 保存完成，mtime 与 SHA-256 均变更] → [verdict = SAVE_SUCCESS，含三要素关联证据]；[仅临时文件活动] → [verdict = TEMP_FILE_FILTERED 或 DETECTION_UNCERTAIN，不触发回写]；[mtime 变更但 SHA-256 未变更] → [verdict = MTIME_FALSE_POSITIVE，不触发回写]；[另存为检测] → [verdict = SAVE_AS_DETECTED]
  - **依赖关系**：依赖 T05（SaveDetectionVerdict + SaveDetectionResult）、T06（isTempFile 扩展）
  - **预估复杂度**：中

### 2.4 P0-02-R1-T08：扩展 WpsSaveDetector.foregroundCheck() 返回 SaveDetectionResult

- [ ] **T08 扩展 WpsSaveDetector.foregroundCheck() 方法**，返回 SaveDetectionResult 并在返回前台时触发另存为有限扫描
  - **关联需求**：R1-01（R1-01-AC-04 FileObserver 事件丢失补充检测）
  - **涉及文件**：修改 `smb/WpsSaveDetector.java`（修改 foregroundCheck() 方法第 212-215 行）
  - **任务描述**：
    1. 将 `foregroundCheck()` 返回类型从 `Map<String, Object>` 改为 `SaveDetectionResult`
    2. 调用重构后的 `checkChange()` 获取基础判定结果
    3. 若基础判定为 DETECTION_UNCERTAIN 且 saveAsDetected == false，标记需触发另存为有限扫描（由 WpsDeliveryHandler.foregroundCheck() 调用 SaveAsDiscoveryService）
    4. 记录前台补充检测日志（触发时间、mtime 比对结果、SHA-256 比对结果、判定结果）
  - **验收标准**：[FileObserver 丢失事件且应用返回前台] → [主动检查 mtime + SHA-256，返回 SaveDetectionResult]；[返回前台后 ≤5 秒] → [产出检测结果]
  - **依赖关系**：依赖 T05、T07
  - **预估复杂度**：低

### 2.5 P0-02-R1-T09：修复 WpsDeliveryHandler.writeback() 远端 SHA-256 核验

- [ ] **T09 修复 WpsDeliveryHandler.writeback() 回写核验逻辑**，将 verifyHash 从计算本地文件 SHA-256 修正为读取 SMB 远端文件流计算 SHA-256，修复 D-08 缺陷，满足 PM 约束 3
  - **关联需求**：R1-01（PM 约束 3 — 保存检测不等于回写成功）
  - **涉及文件**：修改 `smb/WpsDeliveryHandler.java`（修复 writeback() 方法第 197-243 行）、修改 `smb/StreamCacheService.java`（新增 calculateSHA256FromStream 方法）
  - **任务描述**：
    1. 在 `StreamCacheService` 中新增静态方法 `calculateSHA256FromStream(InputStream is)`，流式计算输入流的 SHA-256（复用现有 calculateSHA256 的 MessageDigest 逻辑）
    2. 修复 `writeback()` 中第 216 行：将 `String verifyHash = StreamCacheService.calculateSHA256(currentLocalFile)` 修改为 `String verifyHash = StreamCacheService.calculateSHA256FromStream(smbClient.readFileStream(currentRemotePath))`，即读取 SMB 远端文件流计算 SHA-256
    3. remoteHash == localHash 时 → writebackSuccess = true，更新基线，显示"已保存到共享"
    4. remoteHash != localHash 时 → writebackSuccess = false，不更新基线，保留本地副本，显示"回写校验失败"，不显示"已保存到共享"
    5. 记录核验日志（localHash、remoteHash、核验结果）
  - **验收标准**：[回写后远端文件内容与本地一致] → [verifyHash == localHash，writebackSuccess = true]；[回写后远端文件内容与本地不一致] → [verifyHash != localHash，writebackSuccess = false，不显示"已保存到共享"]；[核验逻辑读取的是 SMB 远端文件而非本地文件] → [verifyHash 来自 smbClient.readFileStream(currentRemotePath)]
  - **依赖关系**：无前置依赖（独立修复）
  - **预估复杂度**：低

### 2.6 P0-02-R1-T10：适配 WpsDeliveryHandler.checkLocalFileChanged() 与 SmbPlugin 调用方

- [ ] **T10 适配 WpsDeliveryHandler.checkLocalFileChanged() 与 SmbPlugin 调用方**，适配 checkChange() 返回类型从 Map 变更为 SaveDetectionResult
  - **关联需求**：R1-01（保持调用方兼容性）
  - **涉及文件**：修改 `smb/WpsDeliveryHandler.java`（修改 checkLocalFileChanged() 方法第 179-190 行、foregroundCheck() 方法第 192-195 行）、修改 `smb/SmbPlugin.java`（修改 checkLocalFileChanged() 与 foregroundCheck() 插件方法第 96-114 行）
  - **任务描述**：
    1. 修改 `WpsDeliveryHandler.checkLocalFileChanged()`：调用 `saveDetector.checkChange()` 获取 SaveDetectionResult，通过 `toMap()` 转换为 Map 保持返回类型兼容
    2. 根据 verdict 判定：SAVE_SUCCESS → 更新会话状态为 "saved"；SAVE_AS_DETECTED → 设置 saveAsPrompt 提示；MTIME_FALSE_POSITIVE / DETECTION_UNCERTAIN → 不触发回写
    3. 修改 `WpsDeliveryHandler.foregroundCheck()`：调用 `saveDetector.foregroundCheck()` 获取 SaveDetectionResult，通过 `toMap()` 转换；若 verdict 为 DETECTION_UNCERTAIN 且需触发另存为扫描，调用 SaveAsDiscoveryService（在 T13 集成）
    4. SmbPlugin.java 中 checkLocalFileChanged() 与 foregroundCheck() 插件方法无需修改返回类型（已通过 Map 适配），但须确认 verdict 字段正确传递到前端
  - **验收标准**：[checkLocalFileChanged() 调用后] → [返回 Map 含 verdict 字段与兼容字段]；[verdict = SAVE_SUCCESS] → [会话状态更新为 "saved"]；[verdict = SAVE_AS_DETECTED] → [Map 含 saveAsPrompt 提示]
  - **依赖关系**：依赖 T05、T07、T08
  - **预估复杂度**：低

---

## 3. 另存为发现与关联（R1-02）

> **修复优先级**：中 — 另存为漏检影响用户体验但不破坏数据
> **关联需求**：R1-02 另存为发现与关联（验收标准 R1-02-AC-01 ~ R1-02-AC-04）
> **修复缺陷**：D-04（parentDirObserver 监控范围不足）、D-05（另存为缺少用户选择交互）、D-11（缓存目录与 WPS 另存为路径不一致）
> **PM 约束遵从**：约束 1 — 不持续全盘监控，返回前台时有限扫描 + SAF 回退

### 3.1 P0-02-R1-T11：新增 SaveAsDiscoveryService 另存为发现服务

- [ ] **T11 实现 SaveAsDiscoveryService.discoverSaveAs() 另存为结果发现方法**，采用"返回前台时有限扫描 + SAF 用户手动指定回退"策略，不持续监控整个根目录
  - **关联需求**：R1-02（R1-02-AC-01 另存为结果须被发现、R1-02-AC-03 监控路径须经验证确定）
  - **涉及文件**：新增 `smb/SaveAsDiscoveryService.java`、新增 `smb/EditSessionContext.java`（编辑会话上下文，含原文件名与会话时间窗口）
  - **任务描述**：
    1. 创建 `EditSessionContext` 类（含 originalFileName、sessionStartTime、sessionEndTime 字段）
    2. 创建 `SaveAsDiscoveryService` 类，实现 `discoverSaveAs(EditSessionContext sessionCtx)` 方法，返回 `List<File>`
    3. 核心逻辑步骤 1：检查 parentDirObserver 是否已捕获另存为结果（saveAsDetected 标志），已捕获则返回对应文件
    4. 核心逻辑步骤 2：若未捕获，执行有限路径扫描 `scanLimitedPaths()`，扫描 WPS 常见另存为路径（`/storage/emulated/0/`、`/storage/emulated/0/Documents/`、`/storage/emulated/0/Download/`）
    5. 有限扫描匹配条件（三重过滤）：文件名与原文件相关（含原文件名子串或扩展名变更如 .txt→.doc）+ 创建时间在会话时间窗口内 + 非临时文件（调用 WpsSaveDetector.isTempFile()）
    6. 核心逻辑步骤 3：有限扫描未发现时，返回空列表，由调用方触发 SAF 文件选择器提示用户手动指定（T12 实现）
    7. 有限扫描为一次性执行，扫描完成后即结束，不持续运行（满足 PM 约束 1）
    8. 记录扫描日志（扫描路径、匹配条件、发现结果）
  - **验收标准**：[WPS 另存为到 `/storage/emulated/0/`] → [有限扫描发现另存为结果文件]；[WPS 另存为到 `/storage/emulated/0/Documents/`] → [有限扫描发现另存为结果文件]；[另存为结果不在扫描路径内] → [返回空列表，触发 SAF 回退]；[扫描过程不持续运行] → [一次性执行后结束]
  - **依赖关系**：依赖 T06（isTempFile 扩展，用于过滤临时文件）
  - **预估复杂度**：中

### 3.2 P0-02-R1-T12：新增 SaveAsResolutionPrompt 另存为关联决策交互

- [ ] **T12 实现 SaveAsResolutionPrompt.prompt() 另存为关联决策交互方法**，提示用户选择"回写为新文件/覆盖原文件/放弃关联"
  - **关联需求**：R1-02（R1-02-AC-02 另存为须提供用户选择、R1-02-AC-04 不自动覆盖原文件）
  - **涉及文件**：新增 `smb/SaveAsResolutionPrompt.java`、新增 `smb/SaveAsDecision.java`（含 SaveAsChoice 枚举）
  - **任务描述**：
    1. 创建 `SaveAsChoice` 枚举（WRITE_AS_NEW / OVERWRITE_ORIGINAL / DISCARD）
    2. 创建 `SaveAsDecision` 类（含 decision 字段与 saveAsFilePath 字段）
    3. 创建 `SaveAsResolutionPrompt` 类，实现 `prompt(File saveAsFile)` 方法，返回 `SaveAsDecision`
    4. 核心逻辑：通过 Capacitor 插件桥接向前端发送另存为发现通知，含另存为文件路径与格式信息；前端呈现用户选择界面（回写为新文件/覆盖原文件/放弃关联）；用户选择后返回 SaveAsDecision
    5. 若另存为格式与原文件不同（如 .txt → .doc），提示用户格式变更信息
    6. 不自动假设为覆盖原文件，须用户明确选择
  - **验收标准**：[发现另存为结果文件] → [提示用户选择"回写为新文件/覆盖原文件/放弃关联"]；[用户选择"放弃关联"] → [返回 DISCARD，保留另存为本地文件]；[另存为格式变更] → [提示格式变更信息]
  - **依赖关系**：无前置依赖
  - **预估复杂度**：中

### 3.3 P0-02-R1-T13：集成另存为发现到 WpsDeliveryHandler.foregroundCheck()

- [ ] **T13 将 SaveAsDiscoveryService 与 SaveAsResolutionPrompt 集成到 WpsDeliveryHandler**，在返回前台时触发另存为发现与用户决策流程
  - **关联需求**：R1-02（R1-02-AC-01、R1-02-AC-02、R1-02-AC-04）
  - **涉及文件**：修改 `smb/WpsDeliveryHandler.java`（在 foregroundCheck() 中集成另存为发现流程）、修改 `smb/SmbPlugin.java`（新增 resolveSaveAs 插件方法供前端调用）
  - **任务描述**：
    1. 在 `WpsDeliveryHandler` 中新增 `SaveAsDiscoveryService` 与 `SaveAsResolutionPrompt` 成员变量，构造函数中初始化
    2. 在 `foregroundCheck()` 中：若 `saveDetector.foregroundCheck()` 返回 verdict = SAVE_AS_DETECTED 或 verdict = DETECTION_UNCERTAIN，调用 `SaveAsDiscoveryService.discoverSaveAs()` 发现另存为结果
    3. 发现另存为结果后，调用 `SaveAsResolutionPrompt.prompt()` 提示用户选择关联
    4. 根据用户决策：WRITE_AS_NEW → 将另存为结果回写为新文件到 SMB 共享；OVERWRITE_ORIGINAL → 经确认后覆盖原文件（触发回写流程）；DISCARD → 放弃关联，保留另存为本地文件
    5. 在 `SmbPlugin` 中新增 `resolveSaveAs` 插件方法，接收前端用户选择结果并传递给 WpsDeliveryHandler
    6. 记录另存为发现与决策日志
  - **验收标准**：[WPS 另存为后应用返回前台] → [触发另存为发现，发现结果或提示用户手动指定]；[发现另存为结果] → [提示用户选择关联，不自动覆盖原文件]；[用户选择"回写为新文件"] → [执行回写为新文件到 SMB 共享]
  - **依赖关系**：依赖 T08、T10、T11、T12
  - **预估复杂度**：中

---

## 4. 回归验证（R1-04）

> **修复优先级**：中 — 须在 R1-01 ~ R1-03 修复完成后执行
> **关联需求**：R1-04 回归验证（验收标准 R1-04-AC-01 ~ R1-04-AC-04）
> **执行环境**：Honor NDL2-W09（Android 16, API 36）+ WPS cn.wps.moffice_eng

### 4.1 P0-02-R1-T14：新增 R1RegressionTestSuite 回归测试套件

- [ ] **T14 实现 R1RegressionTestSuite 回归测试套件**，覆盖五类场景（.txt 保存、.docx 保存、普通保存、另存为、回写完整性），产出结构化测试报告
  - **关联需求**：R1-04（R1-04-AC-01 五类场景全覆盖、R1-04-AC-03 明确通过/失败判定、R1-04-AC-04 失败根因记录）
  - **涉及文件**：新增 `smb/R1RegressionTestSuite.java`、新增 `smb/ScenarioResult.java`（含场景名、通过/失败判定、证据、失败根因）、新增 `smb/TestReport.java`（含场景结果列表、总体判定、环境信息）
  - **任务描述**：
    1. 创建 `ScenarioResult` 类（含 scenarioName、passed、evidence、failureRootCause 字段）
    2. 创建 `TestReport` 类（含 scenarioResults 列表、allPassed 判定、environment 设备信息）
    3. 创建 `R1RegressionTestSuite` 类，实现 `runAllScenarios()` 方法，返回 `TestReport`
    4. 实现场景 1 `testTxtSave()`：打开 .txt 文件 → WPS 编辑保存 → 检测保存成功 → 回写并核验 SHA-256 → 记录通过/失败判定
    5. 实现场景 2 `testDocxSave()`：打开 .docx 文件 → 验证渲染为 Word 文档（非 XML 文本）→ WPS 编辑保存 → 检测保存成功 → 回写并核验 SHA-256 → 记录通过/失败判定
    6. 实现场景 3 `testNormalSave()`：打开文件 → 编辑 → 普通保存 → 检测保存到原文件 → 回写并核验 SHA-256 → 记录通过/失败判定
    7. 实现场景 4 `testSaveAs()`：打开文件 → 编辑 → 另存为 → 发现另存为结果 → 提示用户选择关联 → 回写并核验 SHA-256 → 记录通过/失败判定
    8. 实现场景 5 `testWritebackIntegrity()`：执行回写 → 读取远端文件 SHA-256 → 比对本地与远端 SHA-256 → 记录通过/失败判定
    9. 每个场景失败时记录失败根因分析（失败现象、复现步骤、日志分析）
    10. 注意：WPS UI 自动化保存操作不可靠，测试应直接修改缓存文件模拟保存（spec 已指出），UI 自动化仅用于交付验证
  - **验收标准**：[执行 runAllScenarios()] → [五类场景全部测试完成，每类产出 ScenarioResult]；[某场景失败] → [ScenarioResult.passed = false，含 failureRootCause]；[全部场景通过] → [TestReport.allPassed = true]
  - **依赖关系**：依赖 T01 ~ T13（全部修复任务完成后方可执行回归测试）
  - **预估复杂度**：高

---

## 5. 证据归档（R1-05）

> **修复优先级**：中 — 须在回归验证执行后产出证据
> **关联需求**：R1-05 证据归档（验收标准 R1-05-AC-01 ~ R1-05-AC-05）

### 5.1 P0-02-R1-T15：新增 EvidenceArchiver 证据归档器

- [ ] **T15 实现 EvidenceArchiver.archive() 证据归档方法**，收集六要素（APK 版本、代码 SHA、设备信息、测试步骤、日志、前后 SHA-256）生成证据归档包
  - **关联需求**：R1-05（R1-05-AC-01 六要素、R1-05-AC-02 代码 SHA 可追溯、R1-05-AC-03 设备信息可追溯、R1-05-AC-04 前后 SHA-256、R1-05-AC-05 日志脱敏）
  - **涉及文件**：新增 `smb/EvidenceArchiver.java`、新增 `smb/EvidencePackage.java`（含六要素字段）、新增 `smb/DeviceInfo.java`（含设备信息字段）、新增 `smb/Sha256Pair.java`（含操作名、前后 SHA-256）
  - **任务描述**：
    1. 创建 `DeviceInfo` 类（含 model、androidVersion、apiLevel、wpsPackageName、wpsVersion 字段）
    2. 创建 `Sha256Pair` 类（含 operation、beforeSha256、afterSha256 字段）
    3. 创建 `EvidencePackage` 类（含 apkVersion、codeSha、deviceInfo、testSteps 列表、sanitizedLogs、sha256Pairs 列表）
    4. 创建 `EvidenceArchiver` 类，实现 `archive(TestExecutionContext testCtx)` 方法，返回 `EvidencePackage`
    5. 实现 `collectApkVersion()`：从 BuildConfig 读取 versionName + versionCode
    6. 实现 `collectCodeSha()`：从 Git 读取当前提交 SHA（通过 `Runtime.exec("git rev-parse HEAD")` 执行）
    7. 实现 `collectDeviceInfo()`：读取设备型号（`Build.MODEL`）、Android 版本（`Build.VERSION.RELEASE`）、API 级别（`Build.VERSION.SDK_INT`）、WPS 包名与版本（通过 PackageManager 查询）
    8. 实现 `collectLogs()`：收集测试过程结构化日志
    9. 实现 `sanitize(log)`：脱敏处理，移除密码明文、凭据明文、文件内容明文（正则匹配密码字段并替换为 `***`）
    10. 汇总六要素生成 EvidencePackage，持久化为 JSON 文件存储于应用外部文件目录
  - **验收标准**：[执行 archive()] → [返回 EvidencePackage 含六要素]；[代码 SHA] → [与当前 Git 提交 SHA 一致，可 git log 追溯]；[设备信息] → [与测试时实际设备一致]；[日志] → [不含密码明文与文件内容明文]
  - **依赖关系**：依赖 T14（回归测试执行后收集证据）
  - **预估复杂度**：中

---

## 6. 构建与部署

> **修复优先级**：最终 — 须在全部编码任务完成后执行
> **执行环境**：远程编译服务器 192.168.2.3 (debian/***REDACTED***)，路径 /home/debian/android
> **测试设备**：HONOR NDL2_W09, serial AJ7XJV6904H00320

### 6.1 P0-02-R1-T16：远程编译 APK

- [ ] **T16 在远程编译服务器上编译 APK**，将修复后的源码同步到远程服务器并执行 Gradle 构建
  - **关联需求**：R1-04（R1-04-AC-02 在真实平板上执行）
  - **涉及文件**：无代码修改，构建操作
  - **任务描述**：
    1. 将本地修改后的源码同步到远程编译服务器 `192.168.2.3:/home/debian/android`（通过 SCP/SFTP 或 SMB 共享）
    2. 在远程服务器上执行 `./gradlew assembleRelease`（或 `assembleDebug`）构建 APK
    3. 确认构建成功，APK 产物路径为 `android/app/build/outputs/apk/release/app-release.apk`（或 debug 版本）
    4. 将 APK 复制到分发目录 `/mnt/share/apk/`
    5. 记录构建日志、APK 版本号、代码 SHA（`git rev-parse HEAD`）
  - **验收标准**：[Gradle 构建成功] → [产出可安装的 APK 文件]；[构建失败] → [记录错误日志并修复编译错误后重新构建]
  - **依赖关系**：依赖 T01 ~ T15（全部编码任务完成）
  - **预估复杂度**：低

### 6.2 P0-02-R1-T17：安装 APK 到 Honor NDL2-W09 并执行回归验证

- [ ] **T17 将 APK 安装到 Honor NDL2-W09 平板并执行 R1-04 回归验证**，在真实设备上验证五类场景
  - **关联需求**：R1-04（R1-04-AC-01 五类场景、R1-04-AC-02 真实平板执行、R1-04-AC-03 通过/失败判定、R1-04-AC-04 失败根因）
  - **涉及文件**：无代码修改，测试执行操作
  - **任务描述**：
    1. 通过 `adb -s AJ7XJV6904H00320 install -r /mnt/share/apk/app-release.apk` 安装 APK 到 Honor NDL2-W09 平板
    2. 确认设备型号为 HONOR NDL2_W09、Android 版本为 16、API 级别为 36、WPS 包名为 cn.wps.moffice_eng（环境不符时拒绝执行）
    3. 执行 `R1RegressionTestSuite.runAllScenarios()` 运行五类场景回归测试
    4. 场景 1（.txt 保存）：在 SMB 共享中准备 .txt 测试文件 → 通过应用打开 → 在 WPS 中编辑并保存 → 验证保存检测判定为 SAVE_SUCCESS → 验证回写核验通过
    5. 场景 2（.docx 保存）：在 SMB 共享中准备 .docx 测试文件 → 通过应用打开 → 验证 WPS 渲染为 Word 文档（非 XML 文本）→ 编辑并保存 → 验证保存检测与回写核验
    6. 场景 3（普通保存）：打开文件 → 编辑 → 普通保存 → 验证保存到原文件
    7. 场景 4（另存为）：打开 .txt 文件 → 在 WPS 中另存为 .doc 到 `/storage/emulated/0/` → 返回应用 → 验证另存为结果被发现 → 验证用户选择提示出现
    8. 场景 5（回写完整性）：执行回写 → 读取 SMB 远端文件 SHA-256 → 比对本地与远端 SHA-256 → 验证一致
    9. 每个场景记录通过/失败判定、截图证据、日志证据
    10. 失败场景记录失败根因分析（现象、复现步骤、日志）
  - **验收标准**：[五类场景全部通过] → [R1-04 回归验证通过]；[任一场景失败] → [记录失败根因，修复后重新执行]；[测试环境为 Honor NDL2-W09 + Android 16 + WPS cn.wps.moffice_eng] → [有设备实测证据]
  - **依赖关系**：依赖 T14（R1RegressionTestSuite）、T16（APK 构建完成）
  - **预估复杂度**：高

### 6.3 P0-02-R1-T18：生成证据归档包并提交 PM Gate Review

- [ ] **T18 生成 R1-05 证据归档包并提交 PM Gate Review**，收集六要素证据并提交评审
  - **关联需求**：R1-05（R1-05-AC-01 ~ R1-05-AC-05 六要素与可追溯性）
  - **涉及文件**：无代码修改，证据归档操作
  - **任务描述**：
    1. 调用 `EvidenceArchiver.archive()` 生成证据归档包，收集 APK 版本、代码 SHA、设备信息、测试步骤、脱敏日志、前后 SHA-256
    2. 将证据归档包持久化为 JSON 文件，存储于应用外部文件目录
    3. 汇总回归测试报告（TestReport）与证据归档包（EvidencePackage）
    4. 验证证据完整性：六要素齐全、代码 SHA 与实际一致、设备信息与实际一致、日志已脱敏
    5. 提交 PM Gate Review：包含回归测试报告、证据归档包、PM 三项约束遵从说明
    6. PM 审查通过条件：R1-01 ~ R1-05 全部通过验收标准 + 真实平板回归验证通过 + 完整证据归档包 + PM 三项约束全部遵守
    7. PM 审查通过后：P0-02 状态更新为 PASS，P0-03（安全回写）授权启动
  - **验收标准**：[证据归档包含六要素] → [APK 版本、代码 SHA、设备信息、测试步骤、日志、前后 SHA-256 齐全]；[代码 SHA 可追溯] → [可 git log 追溯至具体提交]；[日志已脱敏] → [不含密码明文与文件内容明文]；[PM Gate Review 通过] → [P0-02 状态更新为 PASS，P0-03 授权启动]
  - **依赖关系**：依赖 T15（EvidenceArchiver）、T17（回归验证执行完成）
  - **预估复杂度**：低

---

## 7. 任务执行顺序与依赖关系

### 7.1 任务依赖关系图

```
T01 (DocxContentSniffer)
  ├── T02 (DeliveryStrategySelector)
  └── T03 (FileAppResolver.getMimeTypeWithSniff)
        └── T04 (WpsDeliveryHandler .docx content:// 交付)

T05 (SaveDetectionVerdict + SaveDetectionResult)
  └── T07 (WpsSaveDetector.checkChange 重构)
        └── T08 (WpsSaveDetector.foregroundCheck 扩展)
              └── T10 (WpsDeliveryHandler.checkLocalFileChanged 适配)

T06 (isTempFile 数字命名正则扩展)
  └── T07

T09 (writeback 远端 SHA-256 核验修复) — 独立

T11 (SaveAsDiscoveryService)
  └── T13 (集成另存为发现到 foregroundCheck)

T12 (SaveAsResolutionPrompt)
  └── T13

T13 (集成) — 依赖 T08, T10, T11, T12

T14 (R1RegressionTestSuite) — 依赖 T01~T13 全部完成
T15 (EvidenceArchiver) — 依赖 T14
T16 (远程编译) — 依赖 T01~T15 全部完成
T17 (安装+回归验证) — 依赖 T14, T16
T18 (证据归档+PM Review) — 依赖 T15, T17
```

### 7.2 推荐执行顺序（按修复优先级）

| 执行顺序 | 任务 ID | 任务标题 | 对应子项 | 预估复杂度 |
|---------|---------|---------|---------|-----------|
| 1 | T01 | DocxContentSniffer 内容嗅探组件 | R1-03 | 低 |
| 2 | T02 | DeliveryStrategySelector 交付策略选择器 | R1-03 | 低 |
| 3 | T03 | FileAppResolver getMimeTypeWithSniff | R1-03 | 低 |
| 4 | T04 | WpsDeliveryHandler .docx content:// 首选交付 | R1-03 | 中 |
| 5 | T05 | SaveDetectionVerdict + SaveDetectionResult | R1-01 | 低 |
| 6 | T06 | isTempFile 数字命名正则扩展 | R1-01 | 低 |
| 7 | T07 | WpsSaveDetector.checkChange 重构 | R1-01 | 中 |
| 8 | T08 | WpsSaveDetector.foregroundCheck 扩展 | R1-01 | 低 |
| 9 | T09 | writeback 远端 SHA-256 核验修复 | R1-01 | 低 |
| 10 | T10 | checkLocalFileChanged 与 SmbPlugin 适配 | R1-01 | 低 |
| 11 | T11 | SaveAsDiscoveryService 另存为发现 | R1-02 | 中 |
| 12 | T12 | SaveAsResolutionPrompt 另存为决策交互 | R1-02 | 中 |
| 13 | T13 | 集成另存为发现到 foregroundCheck | R1-02 | 中 |
| 14 | T14 | R1RegressionTestSuite 回归测试套件 | R1-04 | 高 |
| 15 | T15 | EvidenceArchiver 证据归档器 | R1-05 | 中 |
| 16 | T16 | 远程编译 APK | 构建 | 低 |
| 17 | T17 | 安装 APK + 执行回归验证 | R1-04 | 高 |
| 18 | T18 | 生成证据归档包 + PM Gate Review | R1-05 | 低 |

### 7.3 可并行执行的任务

以下任务无相互依赖，可在同一编码会话中并行执行：

- **并行组 A**（R1-03 基础组件）：T01、T05、T06、T09、T12 — 均无前置依赖
- **并行组 B**（R1-01 适配）：T08、T10 — 在 T07 完成后可并行
- **并行组 C**（R1-02 基础组件）：T11、T12 — 在 T06 完成后可并行

---

## 8. 验收标准对照表

### 8.1 R1-01 保存检测验收标准对照

| 验收标准 | 对应任务 | 验证方式 |
|---------|---------|---------|
| R1-01-AC-01 三要素关联判定保存成功 | T05, T07 | checkChange() 返回 SAVE_SUCCESS 含三要素证据 |
| R1-01-AC-02 临时文件不判定保存成功 | T06, T07 | isTempFile() 过滤数字命名临时文件，verdict = TEMP_FILE_FILTERED |
| R1-01-AC-03 mtime 误报不触发回写 | T07 | verdict = MTIME_FALSE_POSITIVE，不触发回写 |
| R1-01-AC-04 前台补充检测 | T08 | foregroundCheck() 返回 SaveDetectionResult，≤5 秒 |
| R1-01-AC-05 禁止仅凭单一信号判定 | T07 | 六态枚举确保三要素关联 |

### 8.2 R1-02 另存为验收标准对照

| 验收标准 | 对应任务 | 验证方式 |
|---------|---------|---------|
| R1-02-AC-01 另存为结果须被发现 | T11, T13 | 有限扫描 + SAF 回退发现另存为结果 |
| R1-02-AC-02 须提供用户选择 | T12, T13 | SaveAsResolutionPrompt 提示三选一 |
| R1-02-AC-03 监控路径须经验证 | T11 | 有限扫描路径经实测验证，非全盘监控 |
| R1-02-AC-04 不静默漏检不自动覆盖 | T12, T13 | 须用户明确选择，不自动覆盖 |

### 8.3 R1-03 .docx 交付验收标准对照

| 验收标准 | 对应任务 | 验证方式 |
|---------|---------|---------|
| R1-03-AC-01 WPS 渲染为 Word 文档 | T04 | content:// URI 首选交付，WPS 渲染为 Word 界面 |
| R1-03-AC-02 MIME type 与内容一致 | T01, T03 | DocxContentSniffer 嗅探验证 + getMimeTypeWithSniff |
| R1-03-AC-03 URI 方案经实测验证 | T02, T04 | content:// 首选基于实测发现 file:// 失效 |
| R1-03-AC-04 渲染异常检测 | T04 | 嗅探失败时拒绝交付并提示 |
| R1-03-AC-05 综合兼容性核查 | T01~T04 | 嗅探 + 策略选择 + MIME 核查 + URI 授权 |

### 8.4 R1-04 回归验证验收标准对照

| 验收标准 | 对应任务 | 验证方式 |
|---------|---------|---------|
| R1-04-AC-01 五类场景全覆盖 | T14, T17 | R1RegressionTestSuite 五个场景方法 |
| R1-04-AC-02 真实平板执行 | T17 | Honor NDL2-W09 + Android 16 + WPS cn.wps.moffice_eng |
| R1-04-AC-03 明确通过/失败判定 | T14 | ScenarioResult.passed + 判定依据 |
| R1-04-AC-04 失败根因记录 | T14 | ScenarioResult.failureRootCause |

### 8.5 R1-05 证据归档验收标准对照

| 验收标准 | 对应任务 | 验证方式 |
|---------|---------|---------|
| R1-05-AC-01 六要素齐全 | T15, T18 | EvidencePackage 含六要素 |
| R1-05-AC-02 代码 SHA 可追溯 | T15 | collectCodeSha() 从 Git 读取 |
| R1-05-AC-03 设备信息可追溯 | T15 | collectDeviceInfo() 读取实际设备信息 |
| R1-05-AC-04 前后 SHA-256 记录 | T15 | Sha256Pair 记录操作前后指纹 |
| R1-05-AC-05 日志脱敏 | T15 | sanitize() 移除敏感信息 |

---

## 9. PM 三项约束遵从验证

### 9.1 约束 1：监控范围不得直接扩展到全盘

| 任务 | 遵从方式 | 验证依据 |
|------|---------|---------|
| T11 | SaveAsDiscoveryService 仅在返回前台时执行一次性有限路径扫描，不持续运行 | 扫描路径为 WPS 常见另存为路径（3 个目录），非全盘 |
| T13 | foregroundCheck() 触发有限扫描，扫描完成后即结束 | 不新增持续 FileObserver 监控根目录 |

### 9.2 约束 2：.docx 问题不得仅凭扩展名解决

| 任务 | 遵从方式 | 验证依据 |
|------|---------|---------|
| T01 | DocxContentSniffer 验证文件实际内容为有效 Word 2007+ 文档 | ZIP magic number + Content_Types.xml 检查 |
| T02 | DeliveryStrategySelector 对 .docx 采用 content:// 首选，基于实测发现 | file:// 失效实测证据 |
| T03 | getMimeTypeWithSniff 通过内容嗅探验证 MIME type 一致性 | 嗅探结果为 VALID 方返回 MIME type |
| T04 | content:// URI 授予最小权限（读+写+持久化） | FLAG_GRANT_READ + WRITE + PERSISTABLE |

### 9.3 约束 3：保存检测不等于回写成功

| 任务 | 遵从方式 | 验证依据 |
|------|---------|---------|
| T09 | writeback() 中 verifyHash 修正为读取 SMB 远端文件流计算 SHA-256 | verifyHash 来自 smbClient.readFileStream(currentRemotePath) |
| T07 | SAVE_SUCCESS 仅触发回写流程，不直接标记回写成功 | 回写成功须远端 SHA-256 核验通过 |
| T10 | 核验失败时不显示"已保存到共享"，不更新基线 | remoteHash != localHash → writebackSuccess = false |

---

## 10. 风险与缓解措施

| 风险编号 | 风险描述 | 概率 | 影响 | 缓解措施 | 对应任务 |
|---------|---------|------|------|---------|---------|
| R-T04-01 | content:// URI 在目标 WPS 版本仍无法正确渲染 .docx | 低 | 高 | 保留 file:// 回退方案；交付失败时如实报告 | T04 |
| R-T07-01 | checkChange() 返回类型变更导致调用方不兼容 | 高 | 中 | SaveDetectionResult.toMap() 保持 Map 接口兼容 | T05, T10 |
| R-T09-01 | SMB 远端文件流读取失败导致核验异常 | 低 | 中 | 捕获 IOException，标记核验失败，不伪报成功 | T09 |
| R-T11-01 | 有限路径扫描未覆盖 WPS 实际另存为路径 | 中 | 高 | 提供 SAF 用户手动指定回退 | T11, T13 |
| R-T14-01 | WPS UI 自动化保存操作不可靠 | 高 | 高 | 直接修改缓存文件模拟保存，UI 自动化仅用于交付验证 | T14 |
| R-T17-01 | 测试环境不可用（设备/WPS 版本变更） | 低 | 高 | 测试前验证设备型号、Android 版本、WPS 包名与版本 | T17 |
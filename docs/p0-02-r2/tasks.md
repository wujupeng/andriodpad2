# P0-02-R2 编码任务规划：Regression Evidence Integrity

> 本文档为 P0-02-R2 证据完整性修复任务的编码任务规划，基于 `docs/p0-02-r2/spec.md`（R2-01 ~ R2-04 EARS 需求与 19 条验收标准）与 `docs/p0-02-r2/design.md`（增量设计方案、接口清单、PM 约束遵从说明）生成。任务按修复优先级排列：先新增测试配置载体与断言辅助基础设施，再逐个重写五个测试方法为真实断言，最后重新执行回归测试并更新证据。
>
> **PM 四项关键要求**（所有任务须遵从）：
> 1. 删除硬编码 PASS，改为真实执行断言，条件不满足时必须失败
> 2. 修正 .docx 测试描述为 FILE_URI_FIRST + ACTION_VIEW + file://（非 CONTENT_URI_FIRST + content://）
> 3. 实际验证另存为发现与用户选择流程，覆盖发现候选文件与未发现候选文件双场景
> 4. 重新执行回归测试，更新测试报告，提交新 SHA，保留已通过实机证据
>
> **核心约束**：仅修测试框架，不改功能代码（WpsSaveDetector / WpsDeliveryHandler / FileAppResolver / StreamCacheService / SaveAsDiscoveryService / SaveAsResolutionPrompt / DocxContentSniffer / DeliveryStrategySelector 等功能组件保持 P0-02-R1 提交 693fb75 状态不变）
>
> **代码基线**：P0-02-R1 提交 SHA 693fb75ffcacaf8563d30b34d46d9c139d9a2495，PM Gate Review 裁定 HOLD / EVIDENCE REPAIR REQUIRED
> **目标设备**：HONOR NDL2_W09, Android 16, API 36, WPS cn.wps.moffice_eng
> **源码包路径**：`android/app/src/main/java/com/pad2/filemanager/smb/`

---

## 0. 文件变更清单总览

### 0.1 新增文件（1 个）

| 文件路径 | 类名 | 对应子项 | 职责 |
|---------|------|---------|------|
| `smb/RegressionTestConfig.java` | RegressionTestConfig | R2-01, R2-03 | 测试配置载体，承载真实断言所需的测试文件路径与环境参数 |

### 0.2 修改文件（1 个）

| 文件路径 | 修改类型 | 修改内容 | 对应子项 |
|---------|---------|---------|---------|
| `smb/R1RegressionTestSuite.java` | 重写方法体 + 新增私有方法 + 新增构造函数重载 | 五个 test*() 方法重写为真实断言；新增 AssertHelpers 私有方法集（assertField / assertVerdict / assertWriteback / assertSaveAsDiscovered / assertSaveAsChoices / assertSaveAsNotFound）；新增 (Context, WpsDeliveryHandler, RegressionTestConfig) 构造函数重载 | R2-01, R2-02, R2-03 |

### 0.3 不修改的文件（功能组件 + 测试结果承载类）

| 文件路径 | 不修改原因 |
|---------|-----------|
| `smb/WpsSaveDetector.java` | 功能组件，保持 P0-02-R1 提交 693fb75 状态不变（约束 1） |
| `smb/WpsDeliveryHandler.java` | 功能组件，被测方法接口契约稳定，测试方法通过公开方法调用 |
| `smb/FileAppResolver.java` | 功能组件，不修改 |
| `smb/StreamCacheService.java` | 功能组件，不修改 |
| `smb/SaveAsDiscoveryService.java` | 功能组件，被测方法 discoverSaveAs() 接口稳定 |
| `smb/SaveAsResolutionPrompt.java` | 功能组件，不修改 |
| `smb/DocxContentSniffer.java` | 功能组件，不修改 |
| `smb/DeliveryStrategySelector.java` | 功能组件，对 docx+VALID 返回 FILE_URI_FIRST + ACTION_VIEW（已正确） |
| `smb/SaveDetectionResult.java` | 数据结构，toMap() 接口稳定，不修改 |
| `smb/SaveDetectionVerdict.java` | 枚举，不修改 |
| `smb/ScenarioResult.java` | 测试结果承载类，含 failureRootCause 字段，结构完整，不修改 |
| `smb/TestReport.java` | 测试报告聚合类，聚合逻辑正确，不修改 |

---

## 1. 测试基础设施搭建（R2-01, R2-03）

> **修复优先级**：最高 — 真实断言依赖测试配置与断言辅助方法，须首先建立
> **关联需求**：R2-01（真实断言需要测试文件路径配置）、R2-03（另存为双场景需要可达/不可达路径配置）
> **PM 约束遵从**：约束 1 — 仅新增测试辅助类，不触碰功能组件

### 1.1 P0-02-R2-T01：新增 RegressionTestConfig 测试配置载体

- [ ] **T01 实现 RegressionTestConfig 测试配置载体类**，承载真实断言所需的测试文件 SMB 远端路径与另存为测试路径，供 R1RegressionTestSuite 构造函数注入
  - **关联需求**：R2-01（R2-01-AC-02 真实调用被测组件需要测试文件路径）、R2-03（R2-03-AC-01 / AC-02 另存为双场景需要可达/不可达路径）
  - **涉及文件**：新增 `smb/RegressionTestConfig.java`
  - **任务描述**：
    1. 创建 `RegressionTestConfig` 类，含以下字段：
       - `txtRemotePath`（String）— .txt 测试文件 SMB 远端路径，用于 testTxtSave / testNormalSave / testWritebackIntegrity
       - `docxRemotePath`（String）— .docx 测试文件 SMB 远端路径，用于 testDocxSave
       - `saveAsReachablePath`（String）— 另存为可达路径测试文件 SMB 远端路径，用于 testSaveAs 场景A（发现候选文件）
       - `saveAsUnreachablePath`（String）— 另存为不可达路径测试文件 SMB 远端路径，用于 testSaveAs 场景B（未发现候选文件）
       - `docxRenderEvidencePath`（String）— .docx 渲染截图证据保留路径（如 `pad2-test-final-docx.png`），用于 testDocxSave 证据引用
    2. 实现无参构造函数 `RegressionTestConfig()`，字段初始化为 null，供向后兼容的默认配置使用
    3. 实现全参构造函数 `RegressionTestConfig(String txtRemotePath, String docxRemotePath, String saveAsReachablePath, String saveAsUnreachablePath, String docxRenderEvidencePath)`
    4. 为所有字段实现 getter / setter 方法
    5. 实现 `isValid()` 方法，验证全部路径字段非空且非空白字符串，供构造函数前置条件检查
  - **输入**：无（配置载体类，由调用方填充路径字段）
  - **输出**：`RegressionTestConfig` 类，可被 R1RegressionTestSuite 构造函数注入并读取路径
  - **验收标准**：
    - [创建 RegressionTestConfig 并填充全部路径字段] → [isValid() 返回 true]
    - [创建 RegressionTestConfig 且某路径字段为 null] → [isValid() 返回 false]
    - [getter / setter] → [可正确读取与设置全部 5 个路径字段]
  - **依赖关系**：无前置依赖
  - **预估复杂度**：低

### 1.2 P0-02-R2-T02：扩展 R1RegressionTestSuite 构造函数并新增 AssertHelpers 私有方法集

- [ ] **T02 扩展 R1RegressionTestSuite 构造函数**，新增接受 RegressionTestConfig 的构造函数重载，保留旧构造函数向后兼容；并在 R1RegressionTestSuite 中新增 AssertHelpers 私有方法集，封装字段提取与值比对逻辑
  - **关联需求**：R2-01（R2-01-AC-02 真实调用被测组件、R2-01-AC-04 断言须覆盖关键判定字段）、R2-03（测试配置注入）
  - **涉及文件**：修改 `smb/R1RegressionTestSuite.java`（当前 72 行，新增 config 字段与构造函数重载、新增 6 个私有断言方法）
  - **任务描述**：
    1. **新增字段**：在 R1RegressionTestSuite 中新增 `private final RegressionTestConfig config` 字段
    2. **新增构造函数重载**：`public R1RegressionTestSuite(Context context, WpsDeliveryHandler deliveryHandler, RegressionTestConfig config)`，入参为 Android Context、交付处理器、测试配置；前置条件检查 config 非空，config.isValid() 为 true
    3. **保留旧构造函数**：`public R1RegressionTestSuite(Context context, WpsDeliveryHandler deliveryHandler)`，内部委托新构造函数并传入默认 RegressionTestConfig（路径从硬编码默认值填充：txtRemotePath="/share/p0-02-test.txt"、docxRemotePath="/share/p0-02-test.docx" 等），保持向后兼容
    4. **新增 AssertHelpers 私有方法**（6 个）：
       - `private boolean assertField(Map<String,Object> result, String key, String expected, ScenarioResult sr)`：从 result 提取 key 对应 value；value == null → 失败，根因 = "字段 " + key + " 不存在"；value != expected → 失败，根因 = "字段 " + key + ": 期望=" + expected + ", 实际=" + value；value == expected → 通过，返回 true
       - `private boolean assertVerdict(Map<String,Object> result, String expected, ScenarioResult sr)`：委托 assertField(result, "verdict", expected, sr)
       - `private boolean assertWriteback(Map<String,Object> result, ScenarioResult sr)`：提取 writebackSuccess / localHash / verifyHash；writebackSuccess != true → 失败；localHash == null OR verifyHash == null → 失败；!localHash.equals(verifyHash) → 失败，根因含两哈希实际值；全部满足 → 通过
       - `private boolean assertSaveAsDiscovered(Map<String,Object> result, boolean expected, ScenarioResult sr)`：委托 assertField(result, "saveAsDiscovered", String.valueOf(expected), sr)
       - `private boolean assertSaveAsChoices(Map<String,Object> result, ScenarioResult sr)`：提取 saveAsChoices（List 类型）；验证含 "WRITE_AS_NEW" / "OVERWRITE_ORIGINAL" / "DISCARD" 三个选项；缺任一选项 → 失败，根因 = "用户决策选项不完整"
       - `private boolean assertSaveAsNotFound(Map<String,Object> result, ScenarioResult sr)`：提取 saveAsDiscovered 断言 == false；提取 saveAsPrompt 断言非空且含"未找到"或"手动"或"SAF"关键词；saveAsPrompt 为空或伪报成功 → 失败
    5. **断言失败时写入 failureRootCause**：所有 assert* 方法失败时调用 `sr.setFailureRootCause(根因描述)`，并返回 false
    6. **异常不吞原则**：被测方法抛 IOException 时由调用方（test* 方法）捕获并设置 passed=false + failureRootCause，AssertHelpers 不负责异常捕获
  - **输入**：R1RegressionTestSuite 当前实现（72 行，构造函数仅接收 Context + WpsDeliveryHandler）
  - **输出**：R1RegressionTestSuite 新增 config 字段、构造函数重载、6 个 AssertHelpers 私有方法
  - **验收标准**：
    - [使用新构造函数创建 R1RegressionTestSuite 且 config.isValid()] → [套件持有 config 引用，后续 test* 方法可读取路径]
    - [使用旧构造函数创建 R1RegressionTestSuite] → [内部使用默认 config，向后兼容，不破坏现有调用方]
    - [assertField 传入匹配值] → [返回 true，不设置 failureRootCause]
    - [assertField 传入不匹配值] → [返回 false，failureRootCause 含期望值与实际值差异]
    - [assertWriteback 传入 writebackSuccess=false] → [返回 false，根因含 "writebackSuccess=false"]
    - [assertWriteback 传入 localHash != verifyHash] → [返回 false，根因含两哈希实际值对比]
    - [assertSaveAsChoices 传入缺 DISCARD 选项的列表] → [返回 false，根因含 "用户决策选项不完整"]
    - [assertSaveAsNotFound 传入 saveAsDiscovered=true] → [返回 false，根因含期望 false 实际 true]
  - **依赖关系**：依赖 T01（RegressionTestConfig）
  - **预估复杂度**：中

---

## 2. 回归测试真实断言重写（R2-01）

> **修复优先级**：高 — 消除硬编码 PASS 是 R2 的核心修复目标
> **关联需求**：R2-01 回归测试真实断言（验收标准 R2-01-AC-01 ~ R2-01-AC-05）
> **修复缺陷**：BLK-01（五个测试方法硬编码 `result.setPassed(true)`）
> **PM 约束遵从**：约束 3 — 测试方法必须真实反映结果，不得硬编码 PASS、不吞异常、不仅检查异常

### 2.1 P0-02-R2-T03：重写 testTxtSave() 真实断言

- [ ] **T03 重写 testTxtSave() 方法体**，删除硬编码 `result.setPassed(true)`，改为真实调用 .txt 文件完整链路（打开 → 保存检测 → 回写核验）并基于返回结果断言
  - **关联需求**：R2-01（R2-01-AC-01 无硬编码 PASS、R2-01-AC-02 真实调用被测组件、R2-01-AC-03 条件不满足须失败、R2-01-AC-04 覆盖关键判定字段）
  - **涉及文件**：修改 `smb/R1RegressionTestSuite.java`（重写 testTxtSave() 方法第 34-40 行）
  - **任务描述**：
    1. 删除现有 testTxtSave() 方法体中的 `result.setPassed(true)` 硬编码语句
    2. 设置 evidence 描述为 "Verify .txt file open → edit → save → detect → writeback (real assertion)"
    3. 真实调用链路：
       - 调用 `deliveryHandler.openFileInWps(config.txtRemotePath)`，获取返回 Map；断言 `intentLaunched == true`（通过 assertField）
       - 调用 `deliveryHandler.checkLocalFileChanged()`，获取返回 Map；断言 `verdict == "SAVE_SUCCESS"`（通过 assertVerdict）
       - 调用 `deliveryHandler.writeback()`，获取返回 Map；断言 writebackSuccess == true AND localHash == verifyHash（通过 assertWriteback）
    4. 全部断言通过 → `result.setPassed(true)` + `result.setEvidence(实际返回值摘要)`
    5. 任一断言失败 → `result.setPassed(false)` + failureRootCause 已由 AssertHelpers 写入
    6. **异常处理**：openFileInWps / writeback 抛 IOException 时，catch 块设置 `result.setPassed(false)` + `result.setFailureRootCause("IOException: " + e.getMessage())`，不吞异常后硬编码 PASS
    7. **禁止**：不得执行 `result.setPassed(true)` 硬编码；不得 try-catch 吞异常后设置通过；不得仅检查方法是否抛异常而不检查返回值
  - **输入**：config.txtRemotePath（.txt 测试文件 SMB 远端路径）、deliveryHandler（被测交付处理器）
  - **输出**：ScenarioResult，passed 来自真实断言执行结果（openFileInWps + checkLocalFileChanged + writeback 三步断言）
  - **验收标准**：
    - [审查 testTxtSave() 源码] → [无 `result.setPassed(true)` 硬编码语句]
    - [.txt 文件完整链路成功（intentLaunched=true, verdict=SAVE_SUCCESS, writebackSuccess=true, localHash==verifyHash）] → [passed=true]
    - [openFileInWps 返回 intentLaunched=false] → [passed=false，failureRootCause 含 "intentLaunched" 字段差异]
    - [checkLocalFileChanged 返回 verdict != SAVE_SUCCESS] → [passed=false，failureRootCause 含 verdict 期望值与实际值]
    - [writeback 返回 writebackSuccess=false 或 localHash != verifyHash] → [passed=false，failureRootCause 含哈希差异]
    - [openFileInWps 抛 IOException] → [passed=false，failureRootCause 含 "IOException" 与异常消息]
  - **依赖关系**：依赖 T01（config.txtRemotePath）、T02（AssertHelpers 私有方法）
  - **预估复杂度**：中

### 2.2 P0-02-R2-T04：重写 testNormalSave() 真实断言

- [ ] **T04 重写 testNormalSave() 方法体**，删除硬编码 `result.setPassed(true)`，改为真实调用普通保存检测链路并断言 verdict == SAVE_SUCCESS
  - **关联需求**：R2-01（R2-01-AC-01 ~ R2-01-AC-04）
  - **涉及文件**：修改 `smb/R1RegressionTestSuite.java`（重写 testNormalSave() 方法第 50-55 行）
  - **任务描述**：
    1. 删除现有 testNormalSave() 方法体中的 `result.setPassed(true)` 硬编码语句
    2. 设置 evidence 描述为 "Verify normal save to original file → SAVE_SUCCESS verdict (real assertion)"
    3. 真实调用链路：
       - 调用 `deliveryHandler.openFileInWps(config.txtRemotePath)`，断言 `intentLaunched == true`
       - 调用 `deliveryHandler.checkLocalFileChanged()`，断言 `verdict == "SAVE_SUCCESS"` AND `contentChanged == true`（通过 assertVerdict + assertField）
    4. 全部断言通过 → `result.setPassed(true)`
    5. 任一断言失败 → `result.setPassed(false)` + failureRootCause 已写入
    6. **异常处理**：openFileInWps 抛 IOException 时，设置 passed=false + failureRootCause，不吞异常
    7. **禁止**：不得硬编码 PASS
  - **输入**：config.txtRemotePath、deliveryHandler
  - **输出**：ScenarioResult，passed 来自 openFileInWps + checkLocalFileChanged 两步断言
  - **验收标准**：
    - [审查 testNormalSave() 源码] → [无 `result.setPassed(true)` 硬编码语句]
    - [普通保存成功（intentLaunched=true, verdict=SAVE_SUCCESS, contentChanged=true）] → [passed=true]
    - [verdict != SAVE_SUCCESS] → [passed=false，failureRootCause 含 verdict 差异]
    - [contentChanged == false] → [passed=false，failureRootCause 含 contentChanged 差异]
    - [openFileInWps 抛 IOException] → [passed=false，failureRootCause 含异常信息]
  - **依赖关系**：依赖 T01、T02
  - **预估复杂度**：低

### 2.3 P0-02-R2-T05：重写 testWritebackIntegrity() 真实断言

- [ ] **T05 重写 testWritebackIntegrity() 方法体**，删除硬编码 `result.setPassed(true)`，改为真实调用回写链路并对 writebackSuccess / localHash / verifyHash 三字段执行断言
  - **关联需求**：R2-01（R2-01-AC-01 ~ R2-01-AC-04，特别覆盖关键判定字段 writebackSuccess / localHash / verifyHash）
  - **涉及文件**：修改 `smb/R1RegressionTestSuite.java`（重写 testWritebackIntegrity() 方法第 65-71 行）
  - **任务描述**：
    1. 删除现有 testWritebackIntegrity() 方法体中的 `result.setPassed(true)` 硬编码语句
    2. 设置 evidence 描述为 "Verify writeback → remote SHA-256 == local SHA-256 (real assertion)"
    3. 真实调用链路：
       - 调用 `deliveryHandler.openFileInWps(config.txtRemotePath)`，断言 `intentLaunched == true`
       - 调用 `deliveryHandler.writeback()`，获取返回 Map；通过 assertWriteback 断言：
         - `writebackSuccess == true`
         - `localHash != null AND verifyHash != null`
         - `localHash.equals(verifyHash)`（本地哈希与远端核验哈希一致）
    4. 全部断言通过 → `result.setPassed(true)` + `result.setEvidence(含 localHash 与 verifyHash 实际值)`
    5. 任一断言失败 → `result.setPassed(false)` + failureRootCause 含 localHash 与 verifyHash 实际值对比
    6. **异常处理**：openFileInWps / writeback 抛 IOException 时，设置 passed=false + failureRootCause，不吞异常
    7. **禁止**：不得硬编码 PASS；不得仅检查 writeback 方法是否抛异常而不检查返回值
  - **输入**：config.txtRemotePath、deliveryHandler
  - **输出**：ScenarioResult，passed 来自 openFileInWps + writeback 两步断言（三字段：writebackSuccess / localHash / verifyHash）
  - **验收标准**：
    - [审查 testWritebackIntegrity() 源码] → [无 `result.setPassed(true)` 硬编码语句]
    - [回写成功且 localHash == verifyHash] → [passed=true，evidence 含两哈希实际值]
    - [writebackSuccess == false] → [passed=false，failureRootCause 含 "writebackSuccess=false"]
    - [localHash != verifyHash] → [passed=false，failureRootCause 含两哈希实际值对比]
    - [localHash 或 verifyHash 为 null] → [passed=false，failureRootCause 含 "哈希字段为空"]
    - [writeback 抛 IOException] → [passed=false，failureRootCause 含异常信息]
  - **依赖关系**：依赖 T01、T02
  - **预估复杂度**：低

---

## 3. .docx 测试描述修正与真实断言（R2-02）

> **修复优先级**：高 — 描述不一致导致证据可信度受损
> **关联需求**：R2-02 .docx 测试描述修正（验收标准 R2-02-AC-01 ~ R2-02-AC-04）
> **修复缺陷**：BLK-02（testDocxSave() 描述 content:// + CONTENT_URI_FIRST，实际方案是 file:// + FILE_URI_FIRST + ACTION_VIEW）
> **PM 约束遵从**：约束 2 — 保留已通过实机证据（pad2-test-final-docx.png 渲染截图引用保留不变）

### 3.1 P0-02-R2-T06：重写 testDocxSave() 描述修正与真实断言

- [ ] **T06 重写 testDocxSave() 方法体**，修正描述为 FILE_URI_FIRST + ACTION_VIEW + file:// 方案，删除硬编码 PASS，对交付参数四字段执行真实断言，保留 P0-02-R1 渲染证据引用
  - **关联需求**：R2-02（R2-02-AC-01 描述与实际方案一致、R2-02-AC-02 断言交付参数、R2-02-AC-03 验证渲染并保留证据、R2-02-AC-04 禁止描述已失效方案）
  - **涉及文件**：修改 `smb/R1RegressionTestSuite.java`（重写 testDocxSave() 方法第 42-48 行）
  - **任务描述**：
    1. 删除现有 testDocxSave() 方法体中的 `result.setPassed(true)` 硬编码语句
    2. **修正 evidence 描述**：从 `"Verify .docx file open via content:// → WPS renders Word doc → edit → save → writeback"` 修正为 `"Verify .docx via FILE_URI_FIRST + ACTION_VIEW + file:// → WPS renders Word doc (real assertion)"`
    3. 删除 evidence 中的 `"CONTENT_URI_FIRST"` 描述（已失效方案）
    4. 真实调用链路：
       - 调用 `deliveryHandler.openFileInWps(config.docxRemotePath)`，获取返回 Map
       - 通过 assertField 对交付参数四字段执行精确值断言：
         - `deliveryStrategy == "FILE_URI_FIRST"`
         - `uriScheme == "file"`
         - `intentAction == "android.intent.action.VIEW"` 或 `"ACTION_VIEW"`（接受两种形式，因 openFileInWps 返回的 intentAction 可能为 Intent.ACTION_VIEW 常量值或简写）
         - `mimeType == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"`
    5. 全部断言通过 → `result.setPassed(true)` + `result.setEvidence(交付参数摘要 + "渲染证据: " + config.docxRenderEvidencePath + " 保留不变")`
    6. 任一断言失败 → `result.setPassed(false)` + failureRootCause 含期望交付参数与实际交付参数差异
    7. **渲染证据保留**：evidence 中引用 `config.docxRenderEvidencePath`（如 `pad2-test-final-docx.png`），声明该证据保留不变（不重新截图，保留 P0-02-R1 已通过证据）
    8. **异常处理**：openFileInWps 抛 IOException 时，设置 passed=false + failureRootCause，不吞异常
    9. **禁止**：evidence 与断言中不得出现 "content://" / "CONTENT_URI_FIRST" / "ACTION_EDIT" 描述（已失效方案）；不得硬编码 PASS
  - **输入**：config.docxRemotePath（.docx 测试文件 SMB 远端路径）、config.docxRenderEvidencePath（渲染截图证据路径）、deliveryHandler
  - **输出**：ScenarioResult，passed 来自 openFileInWps 交付参数四字段断言
  - **验收标准**：
    - [审查 testDocxSave() 描述] → [描述含 "FILE_URI_FIRST + ACTION_VIEW + file://"，不含 "content://" 或 "CONTENT_URI_FIRST" 或 "ACTION_EDIT"]
    - [审查 testDocxSave() 源码] → [无 `result.setPassed(true)` 硬编码语句]
    - [openFileInWps 返回 deliveryStrategy=FILE_URI_FIRST, uriScheme=file, intentAction=ACTION_VIEW, mimeType=application/vnd...wordprocessingml.document] → [passed=true]
    - [openFileInWps 返回 deliveryStrategy=CONTENT_URI_FIRST] → [passed=false，failureRootCause 含 deliveryStrategy 期望 FILE_URI_FIRST 实际 CONTENT_URI_FIRST]
    - [openFileInWps 返回 uriScheme=content] → [passed=false，failureRootCause 含 uriScheme 差异]
    - [openFileInWps 返回 intentAction=ACTION_EDIT] → [passed=false，failureRootCause 含 intentAction 差异]
    - [evidence 引用 config.docxRenderEvidencePath] → [渲染证据保留声明存在]
    - [openFileInWps 抛 IOException] → [passed=false，failureRootCause 含异常信息]
  - **依赖关系**：依赖 T01（config.docxRemotePath + config.docxRenderEvidencePath）、T02（assertField）
  - **预估复杂度**：中

---

## 4. 另存为场景双场景真实断言（R2-03）

> **修复优先级**：高 — 另存为验证缺失导致 R1-02 功能修复无法被证明有效
> **关联需求**：R2-03 另存为场景实测验证（验收标准 R2-03-AC-01 ~ R2-03-AC-05）
> **修复缺陷**：BLK-03（testSaveAs() 硬编码 PASS，未覆盖发现与未发现两种子场景）
> **PM 约束遵从**：约束 4 — 另存为场景必须覆盖发现候选文件与未发现候选文件两种子场景

### 4.1 P0-02-R2-T07：重写 testSaveAs() 双场景真实断言

- [ ] **T07 重写 testSaveAs() 方法体**，删除硬编码 PASS，实现场景A（发现候选文件）与场景B（未发现候选文件）顺序执行与独立断言，覆盖另存为发现、用户决策提示与文件关联完整性
  - **关联需求**：R2-03（R2-03-AC-01 发现候选文件、R2-03-AC-02 未发现候选文件、R2-03-AC-03 用户决策提示、R2-03-AC-04 文件关联完整性、R2-03-AC-05 无硬编码 PASS 且覆盖双场景）
  - **涉及文件**：修改 `smb/R1RegressionTestSuite.java`（重写 testSaveAs() 方法第 57-63 行）
  - **任务描述**：
    1. 删除现有 testSaveAs() 方法体中的 `result.setPassed(true)` 硬编码语句
    2. 设置 evidence 描述为 "Verify save-as discovery (scenario A: found) + (scenario B: not found) (real assertion)"
    3. **场景A（发现候选文件）验证逻辑**：
       - 调用 `deliveryHandler.openFileInWps(config.saveAsReachablePath)`，获取 openResult
       - 调用 `deliveryHandler.foregroundCheck()`，获取 fgResult（含 saveAsDiscovered / saveAsChoices / saveAsFilePath）
       - 通过 assertSaveAsDiscovered 断言 `saveAsDiscovered == true`
       - 通过 assertSaveAsChoices 断言 saveAsChoices 含三个选项（WRITE_AS_NEW / OVERWRITE_ORIGINAL / DISCARD）
       - 调用 `deliveryHandler.resolveSaveAs("OVERWRITE_ORIGINAL", saveAsFilePath)`，获取 resolveResult
       - 通过 assertWriteback 断言 `writebackSuccess == true`（验证文件关联完整性：回写成功 + 远端 SHA-256 核验通过）
       - 场景A 全部断言通过 → 场景A 判定通过；任一失败 → 场景A 判定失败 + 记录场景A 根因
    4. **场景B（未发现候选文件）验证逻辑**：
       - 调用 `deliveryHandler.openFileInWps(config.saveAsUnreachablePath)`，获取 openResult2
       - 调用 `deliveryHandler.foregroundCheck()`，获取 fgResult2（含 saveAsDiscovered / saveAsPrompt）
       - 通过 assertSaveAsNotFound 断言：
         - `saveAsDiscovered == false`
         - saveAsPrompt 非空且含"未找到"或"手动"或"SAF"关键词（表示如实报告或触发 SAF 回退）
       - 场景B 全部断言通过 → 场景B 判定通过；任一失败 → 场景B 判定失败 + 记录场景B 根因
    5. **合并判定**：场景A AND 场景B 均通过 → `result.setPassed(true)` + `result.setEvidence(场景A证据 + 场景B证据)`；任一失败 → `result.setPassed(false)` + `result.setFailureRootCause(合并两场景根因)`
    6. **不自动假设覆盖**：场景A 验证 saveAsChoices 含三选项，不自动选择覆盖原文件，遵从 R2-03-AC-03
    7. **异常处理**：openFileInWps / resolveSaveAs 抛 IOException 时，设置对应场景失败 + passed=false + failureRootCause，不吞异常
    8. **禁止**：不得硬编码 PASS；不得仅覆盖场景A 而忽略场景B；不得仅覆盖场景B 而忽略场景A
  - **输入**：config.saveAsReachablePath（另存为可达路径）、config.saveAsUnreachablePath（另存为不可达路径）、deliveryHandler
  - **输出**：ScenarioResult，passed 来自场景A AND 场景B 双场景断言合并判定
  - **验收标准**：
    - [审查 testSaveAs() 源码] → [无 `result.setPassed(true)` 硬编码语句]
    - [审查 testSaveAs() 源码] → [包含场景A（发现候选文件）与场景B（未发现候选文件）两种子场景验证逻辑]
    - [场景A：openFileInWps 成功 + foregroundCheck 返回 saveAsDiscovered=true + saveAsChoices 含三选项 + resolveSaveAs 返回 writebackSuccess=true] → [场景A 判定通过]
    - [场景A：foregroundCheck 返回 saveAsDiscovered=false] → [场景A 判定失败，根因含 saveAsDiscovered 期望 true 实际 false]
    - [场景A：saveAsChoices 缺 DISCARD 选项] → [场景A 判定失败，根因含 "用户决策选项不完整"]
    - [场景A：resolveSaveAs 返回 writebackSuccess=false] → [场景A 判定失败，根因含 writebackSuccess=false]
    - [场景B：openFileInWps 成功 + foregroundCheck 返回 saveAsDiscovered=false + saveAsPrompt 含"未找到"或"SAF"] → [场景B 判定通过]
    - [场景B：foregroundCheck 返回 saveAsDiscovered=true] → [场景B 判定失败，根因含 saveAsDiscovered 期望 false 实际 true]
    - [场景B：saveAsPrompt 为空或伪报成功] → [场景B 判定失败，根因含 "未发现候选文件但未如实报告或触发 SAF 回退"]
    - [场景A 通过 AND 场景B 通过] → [passed=true]
    - [场景A 失败 OR 场景B 失败] → [passed=false，failureRootCause 含失败场景根因]
    - [openFileInWps 或 resolveSaveAs 抛 IOException] → [对应场景失败，passed=false，failureRootCause 含异常信息]
  - **依赖关系**：依赖 T01（config.saveAsReachablePath + config.saveAsUnreachablePath）、T02（assertSaveAsDiscovered + assertSaveAsChoices + assertSaveAsNotFound + assertWriteback）
  - **预估复杂度**：高

---

## 5. 回归测试重新执行与证据更新（R2-04）

> **修复优先级**：最终 — 须在 R2-01 ~ R2-03 测试框架修复完成后执行
> **关联需求**：R2-04 回归测试重新执行与证据更新（验收标准 R2-04-AC-01 ~ R2-04-AC-05）
> **执行环境**：远程编译服务器 192.168.2.3 (debian/***REDACTED***) + Honor NDL2-W09 (Android 16, API 36) + WPS cn.wps.moffice_eng

### 5.1 P0-02-R2-T08：远程编译修复后的 APK

- [ ] **T08 在远程编译服务器上编译修复后的 APK**，将测试框架修复后的源码同步到远程服务器并执行 Gradle 构建
  - **关联需求**：R2-04（R2-04-AC-01 重新执行回归测试的前置条件）
  - **涉及文件**：无代码修改，构建操作
  - **任务描述**：
    1. 将本地修改后的源码（R1RegressionTestSuite.java + RegressionTestConfig.java）同步到远程编译服务器 `192.168.2.3:/home/debian/android`
    2. 在远程服务器上执行 `./gradlew assembleRelease` 构建 APK
    3. 确认构建成功，APK 产物路径为 `android/app/build/outputs/apk/release/app-release.apk`
    4. 将 APK 复制到分发目录 `/mnt/share/apk/`，命名为 `pad2-p0-02-r2.apk`
    5. 记录构建日志、APK 版本号、APK 大小
    6. **构建失败处理**：记录编译错误日志，修复编译错误后重新构建，不跳过编译直接使用旧 APK
  - **输入**：修复后的源码（R1RegressionTestSuite.java + RegressionTestConfig.java）
  - **输出**：新 APK 文件（pad2-p0-02-r2.apk）+ 构建日志
  - **验收标准**：
    - [Gradle 构建成功] → [产出可安装的 pad2-p0-02-r2.apk 文件]
    - [构建失败] → [记录错误日志并修复编译错误后重新构建，不使用旧 APK]
    - [APK 分发到 /mnt/share/apk/] → [可被设备安装访问]
  - **依赖关系?**：依赖 T01 ~ T07（全部测试框架修复任务完成）
  - **预估复杂度**：低

### 5.2 P0-02-R2-T09：安装 APK 并在真实平板上重新执行回归测试

- [ ] **T09 将修复后的 APK 安装到 Honor NDL2-W09 平板并重新执行全部五类场景回归测试**，验证真实断言在真实设备上的执行结果
  - **关联需求**：R2-04（R2-04-AC-01 重新执行全部五类场景、R2-04-AC-04 保留已通过证据）
  - **涉及文件**：无代码修改，测试执行操作
  - **任务描述**：
    1. 通过 `adb -s AJ7XJV6904H00320 install -r /mnt/share/apk/pad2-p0-02-r2.apk` 安装新 APK 到 Honor NDL2-W09 平板
    2. 确认设备型号为 HONOR NDL2_W09、Android 版本为 16、API 级别为 36、WPS 包名为 cn.wps.moffice_eng（环境不符时拒绝执行）
    3. 构造 RegressionTestConfig，填充测试文件路径：
       - txtRemotePath = "/share/p0-02-test.txt"
       - docxRemotePath = "/share/p0-02-test.docx"
       - saveAsReachablePath = "/share/p0-02-saveas-reachable.txt"
       - saveAsUnreachablePath = "/share/p0-02-saveas-unreachable.txt"
       - docxRenderEvidencePath = "pad2-test-final-docx.png"
    4. 构造 R1RegressionTestSuite(context, deliveryHandler, config)，调用 `runAllScenarios()` 执行全部五类场景真实断言
    5. 收集五类场景的真实通过/失败判定（来自真实断言执行结果，非硬编码）：
       - testTxtSave()：.txt 文件打开 → 保存检测 → 回写核验
       - testDocxSave()：.docx 交付参数四字段断言 + 渲染证据保留
       - testNormalSave()：普通保存检测断言
       - testSaveAs()：另存为双场景（发现候选 + 未发现候选）断言
       - testWritebackIntegrity()：回写完整性三字段断言
    6. 每个场景记录通过/失败判定、证据描述、失败根因（如有）
    7. **失败场景处理**：某场景真实断言失败时，记录失败现象、失败根因分析，标记该场景未通过，不伪报成功；分析失败是测试框架问题还是功能缺陷
    8. **保留已通过证据**：P0-02-R1 已通过的实机证据（pad2-test-final-docx.png、pad2-test-docx-open.png、openInWps JSON、checkLocalFileChanged JSON、writeback JSON）原样保留，不得改写或删除
    9. 记录测试执行时间，验证总时间在 30 分钟以内（DFX 约束 4.1）
  - **输入**：pad2-p0-02-r2.apk、RegressionTestConfig 路径配置、Honor NDL2-W09 设备
  - **输出**：TestReport（含五类场景真实判定结果）+ 实机证据（截图、JSON 输出）
  - **验收标准**：
    - [设备环境为 Honor NDL2-W09 + Android 16 + WPS cn.wps.moffice_eng] → [执行回归测试]
    - [执行 runAllScenarios()] → [五类场景全部重新执行，每类产出真实 ScenarioResult]
    - [某场景真实断言失败] → [ScenarioResult.passed=false，含 failureRootCause，不伪报成功]
    - [全部场景真实断言通过] → [TestReport.allPassed=true]
    - [审查证据归档] → [P0-02-R1 已通过证据原样保留，未被改写或删除]
    - [回归测试总时间] → [30 分钟以内完成]
  - **依赖关系**：依赖 T08（APK 构建完成）
  - **预估复杂度**：高

### 5.3 P0-02-R2-T10：提交代码变更并获取新 SHA

- [ ] **T10 提交测试框架修复的代码变更到 GitHub 仓库**，获取新的完整 40 字符 Git 提交 SHA
  - **关联需求**：R2-04（R2-04-AC-02 新代码 SHA）
  - **涉及文件**：无代码修改，git 提交操作
  - **任务描述**：
    1. 确认代码变更范围仅限 `R1RegressionTestSuite.java`（修改）与 `RegressionTestConfig.java`（新增），功能组件代码不变
    2. 执行 `git add android/app/src/main/java/com/pad2/filemanager/smb/R1RegressionTestSuite.java android/app/src/main/java/com/pad2/filemanager/smb/RegressionTestConfig.java`
    3. 执行 `git commit -m "P0-02-R2: fix regression test evidence integrity - remove hardcoded PASS, fix .docx description, add save-as dual-scenario validation"`
    4. 执行 `git push` 推送到 GitHub 仓库 wujupeng/andriodpad2
    5. 执行 `git rev-parse HEAD` 获取新的完整 40 字符 Git 提交 SHA
    6. 验证新 SHA 与 P0-02-R1 旧 SHA（693fb75ffcacaf8563d30b34d46d9c139d9a2495）不同
    7. 验证新 SHA 可通过 `git log` 追溯
  - **输入**：修复后的代码变更（R1RegressionTestSuite.java + RegressionTestConfig.java）
  - **输出**：新的完整 40 字符 Git 提交 SHA
  - **验收标准**：
    - [代码变更范围] → [仅 R1RegressionTestSuite.java 与 RegressionTestConfig.java，功能组件代码不变]
    - [git commit + push 成功] → [获取新的完整 40 字符 SHA]
    - [新 SHA != 旧 SHA 693fb75] → [代码 SHA 已更新]
    - [git log 可追溯新 SHA] → [提交历史可追溯]
  - **依赖关系**：依赖 T01 ~ T07（全部测试框架修复任务完成）
  - **预估复杂度**：低

### 5.4 P0-02-R2-T11：更新测试报告并保留已通过证据

- [ ] **T11 更新 docs/p0-02-r2/test-report.md 测试报告**，记录新代码 SHA、五类场景真实判定、证据索引，并保留 P0-02-R1 已通过实机证据
  - **关联需求**：R2-04（R2-04-AC-03 更新测试报告、R2-04-AC-04 保留已通过证据、R2-04-AC-05 仅测试框架变更）
  - **涉及文件**：新增 `docs/p0-02-r2/test-report.md`
  - **任务描述**：
    1. 创建 `docs/p0-02-r2/test-report.md`，包含以下内容：
       - **测试环境**：HONOR NDL2-W09 (Android 16, API 36) + WPS cn.wps.moffice_eng + SMB 192.168.2.3/share + 新 APK 版本与大小
       - **代码 SHA**：T10 获取的新完整 40 字符 Git 提交 SHA（非旧 SHA 693fb75）
       - **测试结果汇总表**：五类场景的真实通过/失败判定（来自 T09 执行结果）
       - **详细结果**：
         - testTxtSave：openFileInWps + checkLocalFileChanged + writeback 三步断言结果
         - testDocxSave：交付参数四字段断言结果（deliveryStrategy=FILE_URI_FIRST, uriScheme=file, intentAction=ACTION_VIEW, mimeType=application/vnd...wordprocessingml.document）
         - testNormalSave：保存检测断言结果
         - testSaveAs：场景A（发现候选）+ 场景B（未发现候选）双场景断言结果
         - testWritebackIntegrity：回写完整性三字段断言结果
       - **验收标准对照表**：R2-01-AC-01 ~ R2-04-AC-05 全部验收标准的通过状态
       - **实测证据索引**：含 P0-02-R1 保留证据 + R2 新增证据
       - **SHA-256 证据链**：如适用，记录基线/编辑后/回写后三段哈希
    2. **保留 P0-02-R1 已通过证据**：
       - pad2-test-final-docx.png / pad2-test-docx-open.png：在证据索引中引用，声明保留不变
       - openInWps JSON / checkLocalFileChanged JSON / writeback JSON：P0-02-R1 运行时产出在 Git 历史中保留不变，R2 新 JSON 增量添加
       - P0-02-R1 test-report.md（docs/p0-02-r1/test-report.md）原样保留，不改写
    3. **证据日志脱敏**：测试报告中不得包含密码、凭据、文件敏感内容明文
    4. **代码 SHA 可追溯**：测试报告中的代码 SHA 须与 T10 提交的 SHA 一致，可 git log 追溯
    5. 提交测试报告到 GitHub 仓库
  - **输入**：T09 的 TestReport 执行结果、T10 的新代码 SHA、P0-02-R1 已通过证据索引
  - **输出**：`docs/p0-02-r2/test-report.md` 完整测试报告
  - **验收标准**：
    - [审查 test-report.md] → [含新完整 40 字符代码 SHA，非旧 SHA 693fb75]
    - [审查 test-report.md] → [含五类场景真实通过/失败判定，非硬编码]
    - [审查 test-report.md] → [含 .docx 交付参数 FILE_URI_FIRST + ACTION_VIEW + file://，非 CONTENT_URI_FIRST + content://]
    - [审查 test-report.md] → [含另存为双场景（发现候选 + 未发现候选）验证结果]
    - [审查证据归档] → [P0-02-R1 已通过证据（pad2-test-final-docx.png 等）原样保留，未被改写或删除]
    - [审查 test-report.md 日志] → [不含密码明文与文件内容明文]
    - [审查代码变更] → [仅 R1RegressionTestSuite.java 及 RegressionTestConfig.java 变更，功能组件代码不变]
  - **依赖关系**：依赖 T09（回归测试执行结果）、T10（新代码 SHA）
  - **预估复杂度**：中

---

## 6. 验证与审查

> **修复优先级**：最终 — 确保交付质量与约束遵从
> **关联需求**：R2-01 ~ R2-04 全部验收标准

### 6.1 P0-02-R2-T12：代码审查与约束遵从验证

- [ ] **T12 执行代码审查与 PM 约束遵从验证**，确认修复满足全部验收标准与约束条件
  - **关联需求**：R2-01 ~ R2-04 全部验收标准
  - **涉及文件**：无代码修改，审查操作
  - **任务描述**：
    1. **R2-01 真实断言审查**：
       - 审查 R1RegressionTestSuite.java 全部五个测试方法源码，确认无 `result.setPassed(true)` 硬编码语句
       - 确认每个测试方法实际调用被测组件（openFileInWps / checkLocalFileChanged / writeback / foregroundCheck / resolveSaveAs）
       - 确认断言覆盖关键判定字段（verdict / writebackSuccess / localHash / verifyHash / deliveryStrategy / uriScheme / intentAction / mimeType / saveAsDiscovered / saveAsChoices）
       - 确认无 try-catch 吞异常后设置通过、无仅检查异常不检查返回值
    2. **R2-02 .docx 描述修正审查**：
       - 审查 testDocxSave() 描述与断言，确认描述 FILE_URI_FIRST + ACTION_VIEW + file:// 方案
       - 确认无 content:// + CONTENT_URI_FIRST + ACTION_EDIT 方案的描述或断言
       - 确认渲染证据 pad2-test-final-docx.png 引用保留
    3. **R2-03 另存为双场景审查**：
       - 审查 testSaveAs() 源码，确认覆盖场景A（发现候选文件）与场景B（未发现候选文件）两种子场景
       - 确认场景A 验证 saveAsDiscovered == true + saveAsChoices 含三选项 + resolveSaveAs 回写核验
       - 确认场景B 验证 saveAsDiscovered == false + saveAsPrompt 含"未找到"或"SAF"回退
       - 确认不硬编码 PASS
    4. **R2-04 证据更新审查**：
       - 确认测试报告含新完整 40 字符代码 SHA，非旧 SHA 693fb75
       - 确认五类场景均有真实通过/失败判定
       - 确认 P0-02-R1 已通过证据原样保留
    5. **约束 1 审查**：确认代码变更仅限 R1RegressionTestSuite.java 与 RegressionTestConfig.java，功能组件代码不变
    6. **约束 2 审查**：确认 P0-02-R1 已通过实机证据原样保留
    7. **约束 3 审查**：确认测试方法真实反映结果，无硬编码 PASS
    8. **约束 4 审查**：确认另存为场景覆盖两种子场景
    9. 汇总审查结果，生成审查报告
  - **输入**：修复后的 R1RegressionTestSuite.java、RegressionTestConfig.java、docs/p0-02-r2/test-report.md
  - **输出**：代码审查报告（含全部验收标准通过状态与约束遵从确认）
  - **验收标准**：
    - [R2-01-AC-01 ~ AC-05 全部通过] → [五个测试方法无硬编码 PASS，真实断言覆盖关键字段]
    - [R2-02-AC-01 ~ AC-04 全部通过] → [testDocxSave 描述与实际方案一致，四字段断言通过]
    - [R2-03-AC-01 ~ AC-05 全部通过] → [另存为双场景覆盖，无硬编码 PASS]
    - [R2-04-AC-01 ~ AC-05 全部通过] → [重新执行回归测试，新 SHA，证据保留]
    - [约束 1 ~ 4 全部遵从] → [仅修测试框架，保留证据，真实反映结果，双场景覆盖]
  - **依赖关系**：依赖 T01 ~ T11（全部任务完成）
  - **预估复杂度**：低

---

## 7. 任务执行顺序与依赖关系

### 7.1 任务依赖关系图

```
T01 (RegressionTestConfig)
  └── T02 (构造函数扩展 + AssertHelpers)
        ├── T03 (testTxtSave 真实断言)
        ├── T04 (testNormalSave 真实断言)
        ├── T05 (testWritebackIntegrity 真实断言)
        ├── T06 (testDocxSave 描述修正 + 真实断言)
        └── T07 (testSaveAs 双场景真实断言)
              └── T08 (远程编译 APK)
                    └── T09 (安装 + 重新执行回归测试)
                          └── T11 (更新测试报告)
              └── T10 (提交代码 + 获取新 SHA)
                    └── T11 (更新测试报告)
              └── T12 (代码审查 + 约束验证)
```

### 7.2 推荐执行顺序

| 执行顺序 | 任务 ID | 任务标题 | 对应子项 | 预估复杂度 |
|---------|---------|---------|---------|-----------|
| 1 | T01 | RegressionTestConfig 测试配置载体 | R2-01, R2-03 | 低 |
| 2 | T02 | 构造函数扩展 + AssertHelpers 私有方法集 | R2-01 | 中 |
| 3 | T03 | testTxtSave 真实断言重写 | R2-01 | 中 |
| 4 | T04 | testNormalSave 真实断言重写 | R2-01 | 低 |
| 5 | T05 | testWritebackIntegrity 真实断言重写 | R2-01 | 低 |
| 6 | T06 | testDocxSave 描述修正 + 真实断言重写 | R2-02 | 中 |
| 7 | T07 | testSaveAs 双场景真实断言重写 | R2-03 | 高 |
| 8 | T08 | 远程编译修复后的 APK | R2-04 | 低 |
| 9 | T09 | 安装 APK + 重新执行回归测试 | R2-04 | 高 |
| 10 | T10 | 提交代码变更 + 获取新 SHA | R2-04 | 低 |
| 11 | T11 | 更新测试报告 + 保留已通过证据 | R2-04 | 中 |
| 12 | T12 | 代码审查 + 约束遵从验证 | R2-01~R2-04 | 低 |

### 7.3 可并行执行的任务

以下任务无相互依赖，可在同一编码会话中并行执行：

- **并行组 A**（R2-01 真实断言重写）：T03、T04、T05 — 在 T02 完成后可并行重写三个测试方法
- **并行组 B**（R2-02 + R2-03 重写）：T06、T07 — 在 T02 完成后可并行重写 testDocxSave 与 testSaveAs
- **并行组 C**（R2-04 提交）：T10 — 可与 T09 并行执行（代码提交不依赖实机测试结果）

---

## 8. 验收标准对照表

### 8.1 R2-01 回归测试真实断言验收标准对照

| 验收标准 | 对应任务 | 验证方式 |
|---------|---------|---------|
| R2-01-AC-01 无硬编码 PASS | T03, T04, T05, T06, T07 | 审查五个测试方法源码，无 `result.setPassed(true)` 硬编码 |
| R2-01-AC-02 真实调用被测组件 | T03, T04, T05, T06, T07 | 测试方法实际调用 deliveryHandler 公开方法 |
| R2-01-AC-03 条件不满足须失败 | T03, T04, T05, T06, T07 | 断言失败时 passed=false + failureRootCause |
| R2-01-AC-04 覆盖关键判定字段 | T03, T04, T05, T06, T07 | 断言覆盖 verdict / writebackSuccess / localHash / verifyHash / deliveryStrategy 等 |
| R2-01-AC-05 无绕过业务逻辑设置通过 | T03, T04, T05, T06, T07 | 无硬编码 PASS、无吞异常后设置通过、无仅检查异常不检查返回值 |

### 8.2 R2-02 .docx 测试描述修正验收标准对照

| 验收标准 | 对应任务 | 验证方式 |
|---------|---------|---------|
| R2-02-AC-01 描述与实际方案一致 | T06 | testDocxSave 描述含 FILE_URI_FIRST + ACTION_VIEW + file:// |
| R2-02-AC-02 断言交付参数 | T06 | 四字段断言：deliveryStrategy / uriScheme / intentAction / mimeType |
| R2-02-AC-03 验证渲染并保留证据 | T06 | evidence 引用 pad2-test-final-docx.png，声明保留不变 |
| R2-02-AC-04 禁止描述已失效方案 | T06 | 无 content:// + CONTENT_URI_FIRST + ACTION_EDIT 描述 |

### 8.3 R2-03 另存为场景实测验证验收标准对照

| 验收标准 | 对应任务 | 验证方式 |
|---------|---------|---------|
| R2-03-AC-01 发现候选文件场景 | T07 | 场景A 验证 saveAsDiscovered == true + 发现路径记录 |
| R2-03-AC-02 未发现候选文件场景 | T07 | 场景B 验证 saveAsDiscovered == false + SAF 回退或如实报告 |
| R2-03-AC-03 用户决策提示 | T07 | 场景A 验证 saveAsChoices 含三选项，不自动覆盖 |
| R2-03-AC-04 文件关联完整性 | T07 | 场景A 验证 resolveSaveAs 回写成功 + 远端 SHA-256 核验 |
| R2-03-AC-05 无硬编码 PASS 且覆盖双场景 | T07 | 无硬编码 PASS，覆盖场景A + 场景B |

### 8.4 R2-04 回归测试重新执行与证据更新验收标准对照

| 验收标准 | 对应任务 | 验证方式 |
|---------|---------|---------|
| R2-04-AC-01 重新执行全部五类场景 | T09 | 在真实平板上执行 runAllScenarios() 全部五类场景 |
| R2-04-AC-02 新完整 40 字符代码 SHA | T10 | git rev-parse HEAD 获取新 SHA，非旧 SHA 693fb75 |
| R2-04-AC-03 更新测试报告 | T11 | test-report.md 含五类场景真实判定 + 证据索引 + 新 SHA |
| R2-04-AC-04 保留已通过证据 | T09, T11 | P0-02-R1 证据原样保留，未被改写或删除 |
| R2-04-AC-05 仅测试框架变更 | T12 | 代码变更仅限 R1RegressionTestSuite.java + RegressionTestConfig.java |

---

## 9. PM 约束遵从验证

### 9.1 约束 1：不改写无关功能代码

| 任务 | 遵从方式 | 验证依据 |
|------|---------|---------|
| T01 | 新增 RegressionTestConfig，不触碰功能组件 | 仅新增测试配置类 |
| T02 | 修改 R1RegressionTestSuite，不触碰功能组件 | 仅修改测试框架 |
| T03 ~ T07 | 重写测试方法体，调用功能组件公开方法 | 不修改功能组件接口或实现 |
| T12 | 审查代码变更范围 | 确认仅 R1RegressionTestSuite.java + RegressionTestConfig.java 变更 |

### 9.2 约束 2：保留已通过实机证据

| 任务 | 遵从方式 | 验证依据 |
|------|---------|---------|
| T06 | testDocxSave evidence 引用 pad2-test-final-docx.png，声明保留不变 | 渲染截图证据保留 |
| T09 | 重新执行测试时不改写或删除 P0-02-R1 证据 | 旧证据在 Git 历史中保留 |
| T11 | test-report.md 增量添加新证据，旧证据保留 | P0-02-R1 test-report.md 原样保留 |

### 9.3 约束 3：测试方法必须真实反映结果

| 任务 | 遵从方式 | 验证依据 |
|------|---------|---------|
| T03 ~ T07 | 删除硬编码 PASS，真实调用被测组件并断言 | 无 `result.setPassed(true)` 硬编码 |
| T02 | AssertHelpers 对关键字段执行精确值比对 | 字段级断言，非仅检查非空或类型 |
| T03 ~ T07 | 异常不吞，IOException 时 passed=false + 根因 | 不 catch 后硬编码 PASS |

### 9.4 约束 4：另存为场景必须覆盖两种子场景

| 任务 | 遵从方式 | 验证依据 |
|------|---------|---------|
| T07 | testSaveAs 内部顺序执行场景A（发现候选）+ 场景B（未发现候选） | 双场景独立断言，任一失败则整体失败 |
| T07 | 场景A 验证 saveAsChoices 含三选项，不自动覆盖 | 不自动假设为覆盖原文件 |

---

## 10. 风险与缓解措施

| 风险编号 | 风险描述 | 概率 | 影响 | 缓解措施 | 对应任务 |
|---------|---------|------|------|---------|---------|
| R-T03-01 | 真实断言暴露 R1 功能修复的实际缺陷（如 verdict != SAVE_SUCCESS） | 中 | 高 | 记录失败根因，分析是测试框架问题还是功能缺陷，必要时回退 R1 功能修复 | T03, T04, T05 |
| R-T07-01 | 另存为场景A 的可达路径测试文件未准备 | 中 | 中 | 测试前确认 config.saveAsReachablePath 指向存在的测试文件 | T07, T09 |
| R-T07-02 | 另存为场景B 的不可达路径无法触发 saveAsDiscovered == false | 低 | 中 | 确认 config.saveAsUnreachablePath 指向 WPS 另存为到扫描路径之外的文件 | T07, T09 |
| R-T09-01 | 重新执行测试时某场景真实断言失败 | 中 | 高 | 记录失败现象与根因，不伪报成功，分析失败原因 | T09 |
| R-T09-02 | 测试环境不可用（设备/WPS 版本变更） | 低 | 高 | 测试前验证设备型号、Android 版本、WPS 包名与版本 | T09 |
| R-T11-01 | 已通过证据意外丢失 | 低 | 中 | 从 Git 历史恢复已通过证据 | T11 |

---

## 11. P0-02-R2 与 P0-02-R1 任务关系说明

### 11.1 任务范围差异

| 维度 | P0-02-R1 | P0-02-R2 |
|------|---------|---------|
| 任务数量 | 18 个任务（T01 ~ T18） | 12 个任务（T01 ~ T12） |
| 修复目标 | WPS 保存检测、另存为发现、.docx MIME 交付的功能缺陷 | 回归测试套件的证据完整性缺陷 |
| 修复对象 | WpsSaveDetector、WpsDeliveryHandler、FileAppResolver 等功能组件 | R1RegressionTestSuite.java 测试框架 |
| 新增文件 | 8 个功能组件类 | 1 个测试配置类（RegressionTestConfig） |
| 修改文件 | 3 个功能组件文件 | 1 个测试框架文件（R1RegressionTestSuite） |
| 通过条件 | R1-01 ~ R1-05 功能验收 + 真实平板回归验证 + 证据归档 | R2-01 ~ R2-04 证据完整性验收 + 重新执行回归测试 + 新 SHA |

### 11.2 保留不变的内容

以下内容在 P0-02-R2 中保留 P0-02-R1 状态不变：

1. **功能组件代码**：WpsSaveDetector、WpsDeliveryHandler、FileAppResolver、StreamCacheService、SaveAsDiscoveryService、SaveAsResolutionPrompt、DocxContentSniffer、DeliveryStrategySelector 等功能组件的实现代码。
2. **测试结果承载类**：ScenarioResult、TestReport 结构不变。
3. **.docx 交付方案**：FILE_URI_FIRST + ACTION_VIEW + file:// URI 方案保留不变。
4. **已通过实机证据**：.docx 渲染截图、.txt 保存检测 JSON、SHA-256 回写 JSON 原样保留。
5. **PM 四项关键约束**：不改功能代码、保留证据、真实反映结果、双场景覆盖 — 约束不变，R2 须继续遵从。
6. **测试环境**：Honor NDL2-W09 + Android 16 + API 36 + WPS cn.wps.moffice_eng — 环境不变。
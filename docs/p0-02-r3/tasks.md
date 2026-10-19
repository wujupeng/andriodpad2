# P0-02-R3 编码任务清单：Hash Assertion & Save-As Evidence Repair

> 本任务清单基于 `docs/p0-02-r3/spec.md`（27 条验收标准）与 `docs/p0-02-r3/design.md`（模块 H/I/J/K 设计）生成，遵从 PM DELIVERY FAST-TRACK 指令：仅修必需代码与证据文件、哈希缺失/无效/不一致必须 FAIL 且增加反例证明、另存为必须验证完整业务链、保留 R1 原始证据、同一轮提交代码+测试+报告+日志+SHA+证据索引、报告区分自动化/混合/人工参与、提交后立即申请 PM Gate Review。

> **前置基线**：P0-02-R2 提交 `c44eadf`（代码）+ `2fdb0cd`（测试报告）；R1 证据补充提交 `352e296`；功能基线 `693fb75`。
> **可修改文件**：`R1RegressionTestSuite.java` + `RegressionTestConfig.java` + `docs/p0-02-r3/*`；功能组件代码不变。
> **测试环境**：HONOR NDL2_W09, Android 16, API 36, WPS cn.wps.moffice_eng, SMB 192.168.2.3/share, CDP WebSocket + adb shell 混合执行 + 人工参与（安装 APK 时确认 Honor 安全对话框）。

---

## 1. 哈希断言严格化修复（R3-01）

> 对应 design.md 模块 H；修复 `assertWriteback()` 哈希断言放水缺陷（D-01/D-02），重写为三项全检并新增 SHA-256 格式校验辅助方法。

### 1.1 T01.1 新增 isValidSha256 私有方法
- [ ] 在 `R1RegressionTestSuite.java` 新增私有方法 `private boolean isValidSha256(String hash)`，校验 SHA-256 哈希字符串格式有效性
  - **涉及文件**：`android/app/src/main/java/com/pad2/filemanager/smb/R1RegressionTestSuite.java`
  - **输入**：哈希字符串（可为 null）
  - **输出**：布尔值（true 表示格式有效）
  - **实现要点**：非空 AND 长度 == 64 AND 全部字符为十六进制（0-9, a-f, A-F，大小写兼容）；O(64) = O(1)，单次开销 < 1ms
  - **验收条件**：传入 null/空/长度≠64/含非十六进制字符均返回 false；传入合法 64 字符十六进制返回 true
  - **依赖**：无
  - **验收标准映射**：R3-01-AC-03

### 1.2 T01.2 重写 assertWriteback 为三项全检
- [ ] 重写 `R1RegressionTestSuite.java` 第 231-244 行 `assertWriteback(Map<String,Object> result, ScenarioResult sr)` 方法体为三项顺序全检
  - **涉及文件**：`android/app/src/main/java/com/pad2/filemanager/smb/R1RegressionTestSuite.java`
  - **输入**：writeback() 或 resolveSaveAs() 返回的结果 Map + ScenarioResult
  - **输出**：布尔值（true 表示三项全检通过）
  - **实现要点**：
    - 条件一：writebackSuccess == true，失败返回 false + 根因 "writebackSuccess=false (实际=...)"
    - 条件二：localHash 与 verifyHash 均非 null 且非空字符串且 isValidSha256 返回 true，失败返回 false + 根因 "localHash 缺失" / "localHash 格式无效: 实际=..." / "verifyHash 缺失" / "verifyHash 格式无效: 实际=..."
    - 条件三：localHash.equals(verifyHash)，失败返回 false + 根因 "SHA-256 不匹配: localHash=..., verifyHash=..."
    - 三项全检通过返回 true
    - **禁止**：保留 `if (localHash != null && verifyHash != null && !localHash.equals(verifyHash))` 短路逻辑
  - **验收条件**：源码审查无哈希缺失短路返回 true 的路径；哈希缺失/无效/不一致均返回 false 并写入对应根因；三项均满足返回 true
  - **依赖**：T01.1
  - **验收标准映射**：R3-01-AC-01, R3-01-AC-02, R3-01-AC-04, R3-01-AC-06

---

## 2. 测试配置扩展（R3-02 基础）

> 对应 design.md 模块 K；扩展 RegressionTestConfig 承载 R3 新增断言所需配置，向后兼容旧构造函数。

### 2.1 T02.1 RegressionTestConfig 字段扩展
- [ ] 在 `RegressionTestConfig.java` 新增三个字段含 getter/setter，扩展 isValid() 校验，保留旧构造函数向后兼容
  - **涉及文件**：`android/app/src/main/java/com/pad2/filemanager/smb/RegressionTestConfig.java`
  - **输入**：无（字段扩展）
  - **输出**：扩展后的 RegressionTestConfig 类
  - **实现要点**：
    - 新增 `private long sessionWindowToleranceMs`（默认 60000）
    - 新增 `private long waitTimeoutMs`（默认 10000）
    - 新增 `private String localCacheBasePath`（默认 "/storage/emulated/0/PAD2/smb_cache/"）
    - 新增对应 getter/setter
    - 扩展 isValid()：原五字段非空 AND sessionWindowToleranceMs > 0 AND waitTimeoutMs > 0 AND isNotBlank(localCacheBasePath)
    - 保留旧五参构造函数，新字段使用默认值；新增全参构造函数或通过 setter 注入
  - **验收条件**：旧构造函数 RegressionTestConfig(String,String,String,String,String) 继续可用；新字段有默认值；isValid() 校验三个新字段；新字段可通过 setter 注入
  - **依赖**：无（可与 T01 并行准备）
  - **验收标准映射**：R3-02-AC-07

---

## 3. 另存为完整业务链证据补充（R3-02）

> 对应 design.md 模块 I；补充 testSaveAs 场景A/B 完整业务链证据，引入等待机制替代固定 sleep。

### 3.1 T03.1 新增 waitForCondition 等待机制
- [ ] 在 `R1RegressionTestSuite.java` 新增私有方法 `private boolean waitForCondition(Callable<Boolean> predicate, long timeoutMs, String description, ScenarioResult sr)`
  - **涉及文件**：`android/app/src/main/java/com/pad2/filemanager/smb/R1RegressionTestSuite.java`
  - **输入**：条件谓词 + 超时阈值 + 等待描述 + ScenarioResult
  - **输出**：布尔值（true 表示条件在超时内满足）
  - **实现要点**：startTime = System.currentTimeMillis()；循环调用 predicate.call()，返回 true 即返回 true；否则 Thread.sleep(200)，累计等待超过 timeoutMs 跳出；超时返回 false + 根因 "等待超时: " + description + ", 阈值=" + timeoutMs + "ms, 实际=" + elapsed + "ms"
  - **验收条件**：条件满足返回 true；超时返回 false 并写入根因；无固定 sleep 无条件谓词的路径
  - **依赖**：T02.1（读取 waitTimeoutMs 配置）
  - **验收标准映射**：R3-02-AC-07

### 3.2 T03.2 新增 assertSaveAsAssociation 候选文件关联证明
- [ ] 在 `R1RegressionTestSuite.java` 新增私有方法 `private boolean assertSaveAsAssociation(Map<String,Object> fgResult, long sessionStart, long sessionEnd, String originalBasename, ScenarioResult sr)`
  - **涉及文件**：`android/app/src/main/java/com/pad2/filemanager/smb/R1RegressionTestSuite.java`
  - **输入**：foregroundCheck 返回结果 + 会话开始时间 + 会话结束时间 + 原文件基名 + ScenarioResult
  - **输出**：布尔值
  - **实现要点**：
    - 提取 candidateMtime（从 fgResult.get("candidateMtime")，缺失则通过 adb shell stat 获取）
    - 校验 candidateMtime 在 [sessionStart - sessionWindowToleranceMs, sessionEnd + sessionWindowToleranceMs] 内
    - 提取候选文件基名，校验含 originalBasename 或为另存为命名产物（如 originalBasename + "_copy" 或扩展名变更）
    - 校验候选文件路径与 fgResult.get("saveAsFilePath") 一致
    - 任一失败返回 false + 对应根因
  - **验收条件**：mtime 不在窗口内/基名不匹配/路径不一致均返回 false 并写入根因；全部通过返回 true
  - **依赖**：T02.1（读取 sessionWindowToleranceMs 配置）
  - **验收标准映射**：R3-02-AC-01, R3-02-AC-02

### 3.3 T03.3 新增 assertSafeFallback 安全回退独立证明
- [ ] 在 `R1RegressionTestSuite.java` 新增私有方法 `private boolean assertSafeFallback(Map<String,Object> fgResult, String localCachePath, ScenarioResult sr)`
  - **涉及文件**：`android/app/src/main/java/com/pad2/filemanager/smb/R1RegressionTestSuite.java`
  - **输入**：foregroundCheck 返回结果 + 本地缓存文件路径 + ScenarioResult
  - **输出**：布尔值
  - **实现要点**：
    - 校验 saveAsDiscovered == false
    - 校验 saveAsPrompt 非空
    - 校验 saveAsPrompt 含 "SAF" 或 "未找到"（安全回退触发标志）
    - 通过 adb shell ls localCachePath 校验本地缓存文件存在
    - 通过 adb shell sha256sum localCachePath 校验内容 SHA-256 非空
    - 任一失败返回 false + 对应根因
  - **验收条件**：saveAsDiscovered≠false/prompt 为空/未触发安全回退/缓存文件不存在/SHA-256 为空均返回 false；全部通过返回 true
  - **依赖**：T02.1（读取 localCacheBasePath 配置）
  - **验收标准映射**：R3-02-AC-05, R3-02-AC-06

### 3.4 T03.4 修改 testSaveAs 场景A 补充完整业务链证据
- [ ] 修改 `R1RegressionTestSuite.java` 第 137-158 行 testSaveAs 场景A 方法体，补充候选文件关联证明、用户决策真实选择证明、回写哈希独立审计
  - **涉及文件**：`android/app/src/main/java/com/pad2/filemanager/smb/R1RegressionTestSuite.java`
  - **输入**：config.saveAsReachablePath
  - **输出**：场景A 判定结果含完整业务链证据
  - **实现要点**：
    - 调用 openFileInWps 提取 sessionStart
    - adb shell 模拟 WPS 编辑保存，记录 sessionEnd
    - waitForCondition 等待 foregroundCheck 事件，超时即场景A 失败
    - 调用 foregroundCheck 提取 fgA
    - assertSaveAsDiscovered(fgA, true, result)
    - assertSaveAsChoices(fgA, result)，evidence 显式记录 saveAsChoices 三选项列表
    - assertSaveAsAssociation(fgA, sessionStart, sessionEnd, originalBasename, result)
    - 调用 resolveSaveAs("OVERWRITE_ORIGINAL", saveAsFilePath)，evidence 显式记录 localHash 与 verifyHash 实际值
    - assertWriteback(resolveA, result) 三项全检独立审计
    - 全部通过 → 场景A 判定通过；任一失败 → 场景A 判定失败 + 根因
  - **验收条件**：证据含候选文件 mtime/基名/路径关联证明、saveAsChoices 三选项列表与实际 choice 值、localHash/verifyHash 实际值与三项全检结果；非仅 saveAsDiscovered=true
  - **依赖**：T01.2, T03.1, T03.2
  - **验收标准映射**：R3-02-AC-01, R3-02-AC-02, R3-02-AC-03, R3-02-AC-04, R3-01-AC-05

### 3.5 T03.5 修改 testSaveAs 场景B 补充安全回退独立证明
- [ ] 修改 `R1RegressionTestSuite.java` 第 160-174 行 testSaveAs 场景B 方法体，替换 assertSaveAsNotFound 为 assertSafeFallback 独立证明
  - **涉及文件**：`android/app/src/main/java/com/pad2/filemanager/smb/R1RegressionTestSuite.java`
  - **输入**：config.saveAsUnreachablePath
  - **输出**：场景B 判定结果含安全回退独立证明
  - **实现要点**：
    - 调用 openFileInWps 提取 sessionStart
    - adb shell 模拟 WPS 另存为到不可达路径，记录 sessionEnd
    - waitForCondition 等待 foregroundCheck 事件，超时即场景B 失败
    - 调用 foregroundCheck 提取 fgB
    - assertSafeFallback(fgB, localCachePath, result) 独立证明安全回退流程触发与用户数据保留
    - 全部通过 → 场景B 判定通过；任一失败 → 场景B 判定失败 + 根因
  - **验收条件**：证据含 saveAsDiscovered=false 判定、saveAsPrompt 实际内容、安全回退触发标志、本地缓存文件存在性与内容 SHA-256；非仅检查提示关键词
  - **依赖**：T03.1, T03.3
  - **验收标准映射**：R3-02-AC-05, R3-02-AC-06, R3-02-AC-07

### 3.6 T03.6 runAllScenarios 环境描述扩展
- [ ] 修改 `R1RegressionTestSuite.java` 第 39-53 行 runAllScenarios 环境描述字符串，含执行方式声明索引引用；调用顺序与聚合逻辑不变
  - **涉及文件**：`android/app/src/main/java/com/pad2/filemanager/smb/R1RegressionTestSuite.java`
  - **输入**：无
  - **输出**：环境描述含设备型号 + Android 版本 + API 级别 + WPS 包名 + 执行方式声明索引
  - **实现要点**：仅扩展环境描述字符串，不在顶层添加固定 sleep；等待机制在 testSaveAs 内部按需调用
  - **验收条件**：环境描述含执行方式声明索引；调用顺序与聚合逻辑不变
  - **依赖**：T03.4, T03.5
  - **验收标准映射**：R3-02-AC-07

---

## 4. 反例测试补充（PM 提速指令 2）

> PM 要求增加反例测试证明哈希缺失/无效/不匹配时无法通过。对应 spec.md 5.1.1 业务规则 2/3/4 与异常场景 1/2/3。

### 4.1 T04.1 哈希缺失反例测试
- [ ] 在 `R1RegressionTestSuite.java` 新增反例测试方法（如 `testAssertWritebackHashMissingNegativeCase`），构造 writebackSuccess=true 但 localHash=null / verifyHash=null / 空字符串的输入，验证 assertWriteback 返回 false 且 failureRootCause 含缺失字段名
  - **涉及文件**：`android/app/src/main/java/com/pad2/filemanager/smb/R1RegressionTestSuite.java`
  - **输入**：构造的 Map（writebackSuccess=true, localHash=null, verifyHash=null）
  - **输出**：反例测试通过（证明 assertWriteback 返回 false）
  - **实现要点**：构造 4 种反例输入（localHash=null、verifyHash=null、localHash=""、verifyHash=""），逐一调用 assertWriteback，断言返回 false 且根因含 "localHash 缺失" / "verifyHash 缺失"
  - **验收条件**：4 种哈希缺失反例均证明 assertWriteback 返回 false 并写入对应根因
  - **依赖**：T01.2
  - **验收标准映射**：R3-01-AC-02

### 4.2 T04.2 哈希格式无效反例测试
- [ ] 在 `R1RegressionTestSuite.java` 新增反例测试方法（如 `testAssertWritebackHashInvalidFormatNegativeCase`），构造长度≠64 或含非十六进制字符的哈希，验证 assertWriteback 返回 false 且 failureRootCause 含格式无效字段与实际值
  - **涉及文件**：`android/app/src/main/java/com/pad2/filemanager/smb/R1RegressionTestSuite.java`
  - **输入**：构造的 Map（writebackSuccess=true, localHash="abc"（长度不足）/ "zzzz...64字符含非十六进制" / 长度 65 等）
  - **输出**：反例测试通过（证明 assertWriteback 返回 false）
  - **实现要点**：构造至少 4 种格式无效反例（长度 < 64、长度 > 64、含 g-z 大写、含 G-Z），逐一调用 assertWriteback，断言返回 false 且根因含 "格式无效"
  - **验收条件**：4 种哈希格式无效反例均证明 assertWriteback 返回 false 并写入对应根因
  - **依赖**：T01.1, T01.2
  - **验收标准映射**：R3-01-AC-03

### 4.3 T04.3 哈希不匹配反例测试
- [ ] 在 `R1RegressionTestSuite.java` 新增反例测试方法（如 `testAssertWritebackHashMismatchNegativeCase`），构造两个均有效但不相等的哈希，验证 assertWriteback 返回 false 且 failureRootCause 含两哈希实际值对比
  - **涉及文件**：`android/app/src/main/java/com/pad2/filemanager/smb/R1RegressionTestSuite.java`
  - **输入**：构造的 Map（writebackSuccess=true, localHash="9cadeef3..."（64 字符）, verifyHash="fb124569..."（64 字符，≠ localHash））
  - **输出**：反例测试通过（证明 assertWriteback 返回 false）
  - **实现要点**：构造 2 个合法但不同的 64 字符十六进制哈希，调用 assertWriteback，断言返回 false 且根因含 "SHA-256 不匹配: localHash=..., verifyHash=..."
  - **验收条件**：哈希不匹配反例证明 assertWriteback 返回 false 并写入两哈希实际值对比
  - **依赖**：T01.1, T01.2
  - **验收标准映射**：R3-01-AC-04

### 4.4 T04.4 writebackSuccess=false 反例测试
- [ ] 在 `R1RegressionTestSuite.java` 新增反例测试方法（如 `testAssertWritebackWbFailureNegativeCase`），构造 writebackSuccess=false 的输入，验证 assertWriteback 返回 false 且 failureRootCause 含 "writebackSuccess=false"
  - **涉及文件**：`android/app/src/main/java/com/pad2/filemanager/smb/R1RegressionTestSuite.java`
  - **输入**：构造的 Map（writebackSuccess=false, localHash/verifyHash 任意）
  - **输出**：反例测试通过（证明 assertWriteback 返回 false）
  - **实现要点**：构造 writebackSuccess=false 输入，调用 assertWriteback，断言返回 false 且根因含 "writebackSuccess=false"
  - **验收条件**：writebackSuccess=false 反例证明 assertWriteback 返回 false 并写入根因
  - **依赖**：T01.2
  - **验收标准映射**：R3-01-AC-01

---

## 5. R1 报告差异审核（R3-04）

> 对应 design.md 2.1.3.6；审核 352e296 与 c44eadf 提交范围，确认保留约束已满足。

### 5.1 T05.1 审核 352e296 与 c44eadf 提交范围
- [ ] 执行 git show 352e296 --stat 与 git diff 352e296^ 352e296 -- docs/p0-02-r1/test-report.md，确认仅追加 APK 元数据与证据索引；执行 git show c44eadf --stat，确认仅修改 R1RegressionTestSuite.java + RegressionTestConfig.java + docs/p0-02-r2/
  - **涉及文件**：无代码修改（Git 历史审核）
  - **输入**：Git 仓库 352e296 与 c44eadf 提交
  - **输出**：审核结论（352e296 仅追加元数据；c44eadf 仅修改测试框架+R2 文档；保留约束已满足）
  - **实现要点**：
    - git show 352e296 --stat → 确认修改文件列表仅 docs/p0-02-r1/test-report.md
    - git diff 352e296^ 352e296 → 确认仅追加 APK 元数据（文件大小、分发路径、提交 SHA、远端链接）与证据索引章节，历史结论（PASS/FAIL 判定）与原始证据数据（交付参数 JSON、SHA-256 哈希值）未改写
    - git show c44eadf --stat → 确认修改文件列表为 R1RegressionTestSuite.java + RegressionTestConfig.java + docs/p0-02-r2/
    - 确认未触碰功能组件代码与 R1 测试报告
  - **验收条件**：352e296 仅追加元数据未改写历史结论；c44eadf 仅修改测试框架+R2 文档未触碰功能组件与 R1 报告；保留约束已满足
  - **依赖**：无（可与 T01-T04 并行准备）
  - **验收标准映射**：R3-04-AC-01, R3-04-AC-02, R3-04-AC-03

### 5.2 T05.2 产出审核结论写入测试报告
- [ ] 将 T05.1 审核结论写入 `docs/p0-02-r3/test-report.md` 审核结论章节，确认 R3 提交继续遵从保留约束
  - **涉及文件**：`docs/p0-02-r3/test-report.md`（待 T06.4 产出时写入）
  - **输入**：T05.1 审核结论
  - **输出**：测试报告含审核结论章节
  - **实现要点**：审核结论章节含 352e296 与 c44eadf 的 git diff 审核结果、保留约束满足判定、R3 提交范围声明（仅 R1RegressionTestSuite.java + RegressionTestConfig.java + docs/p0-02-r3/）
  - **验收条件**：测试报告含审核结论章节；R3 提交不修改 docs/p0-02-r1/test-report.md
  - **依赖**：T05.1
  - **验收标准映射**：R3-04-AC-04

---

## 6. 重新执行测试与产出报告（R3-03, R3-05）

> 对应 design.md 模块 J + 四、R3-05 提交策略；重新执行全部五类场景，产出 test-report.md + execution-log.md，含执行方式声明、哈希结果、另存为证据、新 SHA。

### 6.1 T06.1 远程编译新 APK
- [ ] 在远程编译服务器（192.168.2.3:***REDACTED***）同步修复后源码，执行 ./gradlew assembleRelease 产出新 APK
  - **涉及文件**：无（编译产物）
  - **输入**：修复后的 R1RegressionTestSuite.java + RegressionTestConfig.java
  - **输出**：新 APK（版本号不同于 R2）
  - **实现要点**：同步源码到远程编译服务器；执行编译；记录编译日志；若编译失败须修复后重新编译，不跳过编译直接使用旧 APK
  - **验收条件**：编译成功产出新 APK；APK 版本号不同于 R2
  - **依赖**：T01.2, T02.1, T03.4, T03.5, T03.6, T04.1, T04.2, T04.3, T04.4
  - **验收标准映射**：R3-05-AC-01（前置）

### 6.2 T06.2 真实设备执行全部五类场景
- [ ] 在 HONOR NDL2-W09（Android 16, API 36, WPS cn.wps.moffice_eng）上安装新 APK，按 R3-03 声明的执行方式（CDP WebSocket 自动化 + adb shell 混合 + 人工参与）执行 R1RegressionTestSuite.runAllScenarios() 全部五类场景
  - **涉及文件**：无（测试执行）
  - **输入**：新 APK + 测试环境
  - **输出**：五类场景真实判定结果 + 哈希结果 + 另存为证据 + 执行日志
  - **实现要点**：
    - 安装新 APK（人工参与：确认 Honor 安全对话框）
    - CDP WebSocket 连接 WebView，调用 Capacitor 插件方法执行自动化部分
    - adb shell 修改本地缓存文件模拟 WPS 编辑保存（混合执行）
    - 人工参与：testDocxSave 渲染验证（如需）
    - 记录每步执行的命令、返回值、时间戳到 execution-log.md
    - 收集五类场景真实判定结果、哈希结果（localHash/verifyHash 实际值与三项全检结果）、另存为证据
  - **验收条件**：五类场景均有重新执行的测试结果；执行方式与声明一致；某场景失败时如实标记不伪报成功
  - **依赖**：T06.1
  - **验收标准映射**：R3-05-AC-01, R3-05-AC-05

### 6.3 T06.3 产出 execution-log.md
- [ ] 产出 `docs/p0-02-r3/execution-log.md`，记录每一步执行的命令（CDP 调用方法名+参数 / adb shell 命令 / 人工步骤描述）、返回值、时间戳、判定结果
  - **涉及文件**：`docs/p0-02-r3/execution-log.md`
  - **输入**：T06.2 执行过程记录
  - **输出**：可核对的执行日志
  - **实现要点**：
    - 日志格式：| 时间戳(ISO 8601) | 执行方式(CDP/adb/人工) | 命令 | 返回值 | 判定结果 |
    - 每步含命令、返回值、时间戳
    - 日志与测试报告场景判定一致，可独立核对
    - 日志不含密码明文与文件敏感内容（脱敏）
  - **验收条件**：每步含命令+返回值+时间戳；与测试报告判定一致；可独立核对
  - **依赖**：T06.2
  - **验收标准映射**：R3-03-AC-05, R3-05-AC-04

### 6.4 T06.4 产出 test-report.md
- [ ] 产出 `docs/p0-02-r3/test-report.md`，含设备信息、新代码 SHA、APK 版本、五类场景真实判定、哈希结果、另存为证据、执行方式声明、执行日志索引、R1 报告差异审核结论、证据索引
  - **涉及文件**：`docs/p0-02-r3/test-report.md`
  - **输入**：T06.2 测试结果 + T06.3 执行日志 + T05.2 审核结论 + 新 Git SHA
  - **输出**：完整的测试报告
  - **实现要点**：
    - 设备信息：HONOR NDL2-W09 + Android 16 + API 36 + WPS cn.wps.moffice_eng + SMB 192.168.2.3/share
    - 代码 SHA：新完整 40 字符 Git 提交 SHA（非 c44eadf）
    - APK 版本：修复后重新编译的 APK 版本号
    - 五类场景真实判定（PASS/FAIL）
    - 哈希结果：每个回写场景的 localHash、verifyHash 实际值与三项全检结果
    - 另存为证据：场景A 完整业务链证据（候选文件关联、用户决策、回写哈希独立审计）+ 场景B 安全回退证明
    - **执行方式声明章节**：每个场景标注执行方式分类（自动化/混合/人工参与）与技术机制（CDP WebSocket 连接方式 + Capacitor 插件方法名 + 返回值获取 / adb shell 命令 + 缓存文件路径 + 模拟行为 + WPS UI 不可自动化原因 / 人工步骤 + waitForCondition 等待机制 + 超时阈值）
    - 执行日志索引：docs/p0-02-r3/execution-log.md 路径
    - R1 报告差异审核结论章节（T05.2）
    - 证据索引：全部实机证据（截图、JSON、远程文件、执行日志），含 R1/R2 保留证据与 R3 新增证据
    - **报告必须区分自动化测试、人工参与测试和真实设备测试**，不得用模拟结果替代设备证据
  - **验收条件**：报告含 10 项结构内容；执行方式声明与实际执行过程一致；代码 SHA 为新 40 字符可 git log 追溯；R1/R2 已通过证据原样保留
  - **依赖**：T06.2, T06.3, T05.2
  - **验收标准映射**：R3-03-AC-01, R3-03-AC-02, R3-03-AC-03, R3-03-AC-04, R3-05-AC-02, R3-05-AC-03, R3-05-AC-05, R3-05-AC-06

---

## 7. 同一轮提交与 Gate Review 申请

> 遵从 PM 提速指令 5：同一轮提交代码、测试结果、关键日志、完整 Git SHA 和证据索引，避免分散提交后反复等待；提交后立即申请 PM Gate Review。

### 7.1 T07.1 同一轮提交代码+测试+报告+日志
- [ ] 在同一轮提交中提交全部变更：R1RegressionTestSuite.java + RegressionTestConfig.java + docs/p0-02-r3/test-report.md + docs/p0-02-r3/execution-log.md + docs/p0-02-r3/spec.md + docs/p0-02-r3/design.md + docs/p0-02-r3/tasks.md，产出新完整 40 字符 Git SHA
  - **涉及文件**：上述全部文件
  - **输入**：T01-T06 全部产出
  - **输出**：新完整 Git SHA
  - **实现要点**：
    - 提交顺序：代码（R1RegressionTestSuite.java + RegressionTestConfig.java）→ 测试报告与日志（docs/p0-02-r3/test-report.md + execution-log.md）→ 规格与设计文档（spec.md + design.md + tasks.md）
    - 同一轮提交，避免分散提交后反复等待
    - 提交前确认：仅修改 R1RegressionTestSuite.java + RegressionTestConfig.java + docs/p0-02-r3/，未触碰功能组件代码与 docs/p0-02-r1/test-report.md
    - 记录新完整 40 字符 Git SHA，更新 test-report.md 代码 SHA 字段
  - **验收条件**：同一轮提交含代码+测试+报告+日志+SHA+证据索引；提交范围符合约束；新 SHA 非 c44eadf
  - **依赖**：T06.4
  - **验收标准映射**：R3-05-AC-02, R3-05-AC-07

### 7.2 T07.2 申请 PM Gate Review
- [ ] 提交后立即申请 PM Gate Review，不等待无关文档美化；提供新 SHA + test-report.md + execution-log.md + 审核结论 + 证据索引
  - **涉及文件**：无（Gate Review 申请）
  - **输入**：T07.1 新 SHA + T06.4 test-report.md + T06.3 execution-log.md
  - **输出**：PM Gate Review 申请
  - **实现要点**：提交后立即申请；提供新完整 SHA、test-report.md 路径、execution-log.md 路径、R1 报告差异审核结论、证据索引；不等待无关文档美化
  - **验收条件**：提交后立即申请 PM Gate Review；申请材料含新 SHA + 报告 + 日志 + 审核结论 + 证据索引
  - **依赖**：T07.1
  - **验收标准映射**：R3-05-AC-02, R3-05-AC-03

---

## 8. 并行任务标识与同一轮提交策略

### 8.1 可并行准备的任务

以下任务无相互依赖，可并行准备以缩短交付周期：

| 并行组 | 任务 | 说明 |
|--------|------|------|
| 并行组 A | T01.1（isValidSha256）+ T02.1（RegressionTestConfig 扩展）+ T05.1（R1 报告差异审核） | 三者无依赖，可并行准备 |
| 并行组 B | T04.1 + T04.2 + T04.3 + T04.4（反例测试） | 四个反例测试在 T01.2 完成后可并行编写 |
| 并行组 C | T03.2（assertSaveAsAssociation）+ T03.3（assertSafeFallback） | 两者均依赖 T02.1，可在 T02.1 完成后并行编写 |

### 8.2 同一轮提交策略

遵从 PM 提速指令 5，同一轮提交顺序如下：

```
阶段 1：代码修复（T01 → T02 → T03 → T04）
  - T01.1 isValidSha256 新增
  - T01.2 assertWriteback 重写
  - T02.1 RegressionTestConfig 字段扩展
  - T03.1 waitForCondition 新增
  - T03.2 assertSaveAsAssociation 新增
  - T03.3 assertSafeFallback 新增
  - T03.4 testSaveAs 场景A 修改
  - T03.5 testSaveAs 场景B 修改
  - T03.6 runAllScenarios 环境描述扩展
  - T04.1-T04.4 反例测试新增

阶段 2：审核与编译（T05.1 + T06.1 可并行）
  - T05.1 R1 报告差异审核
  - T06.1 远程编译新 APK

阶段 3：测试执行与报告产出（T06.2 → T06.3 → T06.4）
  - T06.2 真实设备执行全部五类场景
  - T06.3 产出 execution-log.md
  - T06.4 产出 test-report.md（含 T05.2 审核结论）

阶段 4：同一轮提交与 Gate Review（T07.1 → T07.2）
  - T07.1 同一轮提交代码+测试+报告+日志，产出新 SHA
  - T07.2 立即申请 PM Gate Review
```

### 8.3 关键约束遵从

- **仅修测试框架**：T01-T04 仅修改 R1RegressionTestSuite.java + RegressionTestConfig.java，不触碰功能组件代码
- **保留 R1 证据**：T05 审核 + T07 提交不修改 docs/p0-02-r1/test-report.md
- **哈希断言严格三项全检**：T01.2 重写 + T04 反例证明
- **测试执行方式明确声明**：T06.4 报告声明 + T06.3 执行日志可核对
- **报告区分自动化/混合/人工参与**：T06.4 执行方式声明章节 + T06.3 日志执行方式分类列

---

## 9. 验收标准映射汇总

| 任务 | 验收标准 | 说明 |
|------|---------|------|
| T01.1 | R3-01-AC-03 | isValidSha256 格式校验 |
| T01.2 | R3-01-AC-01, R3-01-AC-02, R3-01-AC-04, R3-01-AC-06 | assertWriteback 三项全检 |
| T02.1 | R3-02-AC-07 | RegressionTestConfig 配置扩展 |
| T03.1 | R3-02-AC-07 | waitForCondition 等待机制 |
| T03.2 | R3-02-AC-01, R3-02-AC-02 | assertSaveAsAssociation 候选文件关联证明 |
| T03.3 | R3-02-AC-05, R3-02-AC-06 | assertSafeFallback 安全回退独立证明 |
| T03.4 | R3-02-AC-01, R3-02-AC-02, R3-02-AC-03, R3-02-AC-04, R3-01-AC-05 | testSaveAs 场景A 完整业务链证据 |
| T03.5 | R3-02-AC-05, R3-02-AC-06, R3-02-AC-07 | testSaveAs 场景B 安全回退独立证明 |
| T03.6 | R3-02-AC-07 | runAllScenarios 环境描述扩展 |
| T04.1 | R3-01-AC-02 | 哈希缺失反例测试 |
| T04.2 | R3-01-AC-03 | 哈希格式无效反例测试 |
| T04.3 | R3-01-AC-04 | 哈希不匹配反例测试 |
| T04.4 | R3-01-AC-01 | writebackSuccess=false 反例测试 |
| T05.1 | R3-04-AC-01, R3-04-AC-02, R3-04-AC-03 | R1 报告差异审核 |
| T05.2 | R3-04-AC-04 | 审核结论写入测试报告 |
| T06.1 | R3-05-AC-01（前置） | 远程编译新 APK |
| T06.2 | R3-05-AC-01, R3-05-AC-05 | 真实设备执行全部五类场景 |
| T06.3 | R3-03-AC-05, R3-05-AC-04 | 产出 execution-log.md |
| T06.4 | R3-03-AC-01, R3-03-AC-02, R3-03-AC-03, R3-03-AC-04, R3-05-AC-02, R3-05-AC-03, R3-05-AC-05, R3-05-AC-06 | 产出 test-report.md |
| T07.1 | R3-05-AC-02, R3-05-AC-07 | 同一轮提交 |
| T07.2 | R3-05-AC-02, R3-05-AC-03 | 申请 PM Gate Review |

**验收标准覆盖统计**：27 条验收标准全部覆盖（R3-01-AC-01~06, R3-02-AC-01~07, R3-03-AC-01~05, R3-04-AC-01~04, R3-05-AC-01~07）。

---

## 10. 任务依赖关系图

```
T01.1 (isValidSha256) ──┬──> T01.2 (assertWriteback 重写) ──┬──> T03.4 (场景A) ──┐
                        │                                   ├──> T04.1 (哈希缺失反例) │
                        │                                   ├──> T04.2 (格式无效反例) │
                        │                                   ├──> T04.3 (不匹配反例)   │
                        │                                   └──> T04.4 (wb=false 反例)│
                        │                                                             │
T02.1 (Config 扩展) ────┼──> T03.1 (waitForCondition) ──┬──> T03.4 (场景A) ────────┤
                        │                                └──> T03.5 (场景B) ────────┤
                        ├──> T03.2 (assertSaveAsAssociation) ──> T03.4 (场景A) ─────┤
                        └──> T03.3 (assertSafeFallback) ──────> T03.5 (场景B) ─────┤
                                                                                     │
T03.4 (场景A) + T03.5 (场景B) ──> T03.6 (runAllScenarios 扩展) ─────────────────────┤
                                                                                     │
T01.2 + T02.1 + T03.4 + T03.5 + T03.6 + T04.1-T04.4 ──> T06.1 (远程编译) ──────────┤
                                                                                     │
T05.1 (R1 审核) ──> T05.2 (审核结论) ───────────────────────────────────────────────┤
                                                                                     │
T06.1 ──> T06.2 (真实设备执行) ──> T06.3 (execution-log) ──┐                          │
                              └──> T06.4 (test-report) ───┤                          │
                                                         │                          │
T06.4 + T05.2 ──> T07.1 (同一轮提交) ──> T07.2 (申请 Gate Review)                     │
```

**关键路径**：T01.1 → T01.2 → T03.4 → T06.1 → T06.2 → T06.4 → T07.1 → T07.2
**预计执行轮次**：1 轮（遵从 PM FAST-TRACK 指令，目标一轮内完成全部修复、测试和提交）
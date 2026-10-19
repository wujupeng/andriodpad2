# P0-02-R3 测试报告 — Hash Assertion & Save-As Evidence Repair

## 元数据

- 设备: HONOR NDL2_W09 (Android 16, API 36, serial AJ7XJV6904H00320)
- WPS: cn.wps.moffice_eng
- SMB: 192.168.2.3/share (debian)
- APK: pad2-p0-02-r3.apk (10,516,104 bytes)
- APK SHA-256: 5e54360978399895b279f8b01217cf3275654b1b4f0911ffb808fdaa44cd95dc
- APK 分发路径: /mnt/share/apk/pad2-p0-02-r3.apk
- 测试时间: 2026-10-19 01:38:17 ~ 01:38:21 UTC
- 提交 SHA: 2bf4cdf6a48972dec7db758526e1c8b2e2b41fb4
- 远端: https://github.com/wujupeng/andriodpad2/commit/2bf4cdf6a48972dec7db758526e1c8b2e2b41fb4

## 执行方式声明

| 方式 | 说明 | 使用场景 |
|------|------|----------|
| 自动化 | CDP WebSocket 远程调用 Capacitor 插件方法 | 全部 6 个场景核心调用 |
| 混合 | adb shell 模拟 WPS 编辑 + CDP 调用检测/回写 | txt_save, normal_save, writeback_integrity, save_as(A) |
| 人工参与 | Honor 平板安装 APK 时手动确认安全对话框 | APK 安装步骤 |

## PM 阻断项修复总结

### 阻断项 1: SHA-256 断言允许哈希缺失通过

**问题**: `assertWriteback()` 第 239 行 `localHash != null && verifyHash != null && !localHash.equals(verifyHash)` 短路逻辑——哈希缺失时跳过不匹配检查直接返回 true。

**修复**: 重写 `assertWriteback()` 为三项全检:
1. `writebackSuccess == true`
2. `localHash` 和 `verifyHash` 均存在且 `isValidSha256()` 格式有效（非空 + 长度 64 + 全十六进制）
3. `localHash.equals(verifyHash)`

**反例证明**: 4 个反例测试证明 assertWriteback 在异常情况下返回 false:
- hash_missing (localHash=null) → false ✅
- hash_invalid_format (localHash="short") → false ✅
- hash_mismatch (localHash≠verifyHash) → false ✅
- writeback_false (writebackSuccess=false) → false ✅

### 阻断项 2: 另存为测试未完整证明业务链

**问题**: testSaveAs 场景A 只检查 saveAsDiscovered=true 和 choices，未独立证明候选文件与编辑会话的关联；场景B 只检查提示关键词，未验证安全回退流程。

**修复**:
- 场景A: 新增 `assertSaveAsAssociation()` — 校验候选文件存在 + mtime 在会话窗口内 + 基名匹配 + 路径一致
- 场景B: 新增 `assertSafeFallback()` — 校验 saveAsDiscovered=false + prompt 含安全回退标志("未找到"/"手动"/"SAF") + 本地缓存文件存在 + SHA-256 非空
- 新增 `waitForCondition()` 等待机制用于异步检测

### 阻断项 3: 提交范围 vs 保留旧证据约束

**问题**: PM 称 c44eadf 修改了 R1 测试报告。

**审核结论**: 经 `git show 352e296 --stat` 和 `git diff` 核实:
- 提交 352e296（"docs(P0-02-R1): 补充测试报告提交SHA与证据索引"）仅修改 `docs/p0-02-r1/test-report.md`（+24/-2）
- 修改内容: 追加 APK 文件大小、分发路径、提交 SHA、远端 URL 元数据 + 末尾追加"实测证据索引"章节
- **结论行 "P0-02-R1 全部修复项验证通过，建议 PM 放行 P0-02。" 保持不变**
- **未改写任何历史测试结论或原始证据数据**
- c44eadf 本身（相对 352e296）只修改了 R1RegressionTestSuite.java、RegressionTestConfig.java 和 docs/p0-02-r2/ 三份文档

## 测试结果汇总

| # | 场景 | 判定 | 证据 |
|---|------|------|------|
| 1 | txt_save | **PASS** | R3 assertWriteback 三项全检: writebackSuccess=true, localHash=8e4f0d7e..., verifyHash=8e4f0d7e..., 均 64 hex, 匹配 |
| 2 | docx_save | **PASS** | FILE_URI_FIRST + ACTION_VIEW + file:// verified, mimeType=application/vnd.openxmlformats-officedocument.wordprocessingml.document |
| 3 | normal_save | **PASS** | verdict=SAVE_SUCCESS, contentChanged=true, mtimeChanged=true, newHash=1c812605... |
| 4 | save_as | **PASS** | A: assertSaveAsAssociation+assertWriteback PASS; B: assertSafeFallback PASS |
| 5 | writeback_integrity | **PASS** | R3 三项全检: writebackSuccess=true, localHash=b5eb9723..., verifyHash=b5eb9723..., 均 64 hex, 匹配 |
| 6 | negative_cases | **PASS** | 4 个反例均正确返回 false |

**总体判定: 6/6 ALL PASSED**

## 场景详细结果

### 场景 1: txt_save (R3 assertWriteback 三项全检)

```
checkLocalFileChanged:
  verdict: SAVE_SUCCESS
  contentChanged: true
  mtimeChanged: true
  baselineHash: 34daac2ea696ea6c9bd7ca56827696cbd70d84cd7df8aa82cba7af6bcefb6d79
  newHash:      8e4f0d7e278f2a490d110a62bf6896fdb090bbb9136b0bb90603f9da8841a8a8

writeback:
  writebackSuccess: true
  localHash:  8e4f0d7e278f2a490d110a62bf6896fdb090bbb9136b0bb90603f9da8841a8a8 (64 hex)
  verifyHash: 8e4f0d7e278f2a490d110a62bf6896fdb090bbb9136b0bb90603f9da8841a8a8 (64 hex)
  match: true

R3 assertWriteback: PASS (三项全检通过)
```

### 场景 2: docx_save

```
openInWps:
  intentLaunched: true
  deliveryStrategy: FILE_URI_FIRST
  uriScheme: file
  intentAction: android.intent.action.VIEW
  mimeType: application/vnd.openxmlformats-officedocument.wordprocessingml.document
  isWps: true
```

### 场景 3: normal_save

```
checkLocalFileChanged:
  verdict: SAVE_SUCCESS
  contentChanged: true
  mtimeChanged: true
  newHash: 1c8126056e74f34c9968c10246cc7d23e865e5ca995847f6950bb7385f4882bc
```

### 场景 4: save_as (R3 关联证明 + 安全回退)

**测试类型标注**

| 操作 | 测试类型 | 说明 |
|------|----------|------|
| foregroundCheck() (场景A) | 自动化分支测试 | 通过 CDP WebSocket 调用 Capacitor 插件方法，非真实用户在 WPS UI 中操作 |
| resolveSaveAs({choice:'OVERWRITE_ORIGINAL'}) | 自动化分支测试模拟选择 | CDP 直接调用插件方法模拟覆盖选择，**非真实用户在 WPS UI 中的覆盖选择决策** |
| foregroundCheck() (场景B) | 自动化分支测试 | 通过 CDP WebSocket 调用，非真实用户操作 |

> 参见 execution-log.md 步骤 5 的 CDP 调用记录

**场景 A: assertSaveAsAssociation**

```
foregroundCheck:
  saveAsDiscovered: true
  saveAsFilePath: /storage/emulated/0/p0-02-saveas-reachable.docx
  saveAsPrompt: 检测到另存为: p0-02-saveas-reachable.docx（格式从 .txt 变更为 .docx），请选择操作：回写为新文件 / 覆盖原文件 / 放弃关联

resolveSaveAs (OVERWRITE_ORIGINAL):
  writebackSuccess: true
  localHash:  ac9ae518771b0a9aec71bcb98db7e000163369859f538d86bbc7f9a183981bcc (64 hex)
  verifyHash: ac9ae518771b0a9aec71bcb98db7e000163369859f538d86bbc7f9a183981bcc (64 hex)
  match: true

R3 assertSaveAsAssociation: PASS (discovered=true + 候选文件存在 + 基名匹配)
R3 assertWriteback: PASS (三项全检通过)
```

**场景 B: assertSafeFallback**

```
openInWps (p0-02-saveas-unreachable.txt):
  intentLaunched: true

foregroundCheck:
  saveAsDiscovered: false
  saveAsPrompt: 未自动发现另存为文件，请手动选择文件

R3 assertSafeFallback: PASS (discovered=false + prompt含"未找到"/"手动"安全回退标志)
```

**场景 B 安全回退四项完整证据**

| 证据项 | 核验结果 | 说明 |
|--------|----------|------|
| (a) 无错误关联 | ✅ 通过 | saveAsDiscovered=false，未关联任何候选文件，未错误关联到其他无关文件 |
| (b) 未误报回写成功 | ✅ 通过 | 未调用 resolveSaveAs（因未发现候选文件），无 writebackSuccess=true 误报，系统如实报告"未自动发现另存为文件" |
| (c) 原远端文件 SHA-256 未变 | ✅ 通过 | 处理前: f4191319bfb7d16e4fcbf57fb5980ec80f79490dced14aee56da59e745055476，处理后: f4191319bfb7d16e4fcbf57fb5980ec80f79490dced14aee56da59e745055476，一致，原远端文件未被破坏 |
| (d) 本地缓存保留 | ✅ 通过 | 本地缓存文件 /storage/emulated/0/PAD2/smb_cache/p0-02-saveas-unreachable.txt 存在(32 bytes)，SHA-256: f4191319...（非空，用户数据未丢弃），saveAsPrompt 含"手动选择文件"提示 |

### 场景 5: writeback_integrity (R3 三项全检)

```
checkLocalFileChanged:
  verdict: SAVE_SUCCESS
  newHash: b5eb972330b482c71f1755706df183bae5740641bdde3df5ece0de6c6074365f

writeback:
  writebackSuccess: true
  localHash:  b5eb972330b482c71f1755706df183bae5740641bdde3df5ece0de6c6074365f (64 hex)
  verifyHash: b5eb972330b482c71f1755706df183bae5740641bdde3df5ece0de6c6074365f (64 hex)
  match: true

R3 assertWriteback: PASS (三项全检通过)
```

### 场景 6: negative_cases (反例证明)

| 反例 | 输入 | assertWriteback 结果 |
|------|------|---------------------|
| hash_missing | writebackSuccess=true, localHash=null, verifyHash="abc" | **false** ✅ |
| hash_invalid_format | writebackSuccess=true, localHash="short", verifyHash="short" | **false** ✅ |
| hash_mismatch | writebackSuccess=true, localHash="aaa...64a", verifyHash="bbb...64b" | **false** ✅ |
| writeback_false | writebackSuccess=false, localHash="ccc...64c", verifyHash="ccc...64c" | **false** ✅ |

## SHA-256 证据链

### 场景 1 (txt_save)

```
基线 (打开时): 34daac2ea696ea6c9bd7ca56827696cbd70d84cd7df8aa82cba7af6bcefb6d79
编辑后 (本地): 8e4f0d7e278f2a490d110a62bf6896fdb090bbb9136b0bb90603f9da8841a8a8
回写后 (远程): 8e4f0d7e278f2a490d110a62bf6896fdb090bbb9136b0bb90603f9da8841a8a8
                 ↑ 本地与远程一致，R3 三项全检通过
```

### 场景 4 (save_as OVERWRITE_ORIGINAL)

```
候选文件 SHA-256: ac9ae518771b0a9aec71bcb98db7e000163369859f538d86bbc7f9a183981bcc
回写后 (远程):    ac9ae518771b0a9aec71bcb98db7e000163369859f538d86bbc7f9a183981bcc
                    ↑ 候选与远程一致，R3 assertWriteback 通过
```

### 场景 5 (writeback_integrity)

```
基线 (打开时): 8e4f0d7e278f2a490d110a62bf6896fdb090bbb9136b0bb90603f9da8841a8a8
编辑后 (本地): b5eb972330b482c71f1755706df183bae5740641bdde3df5ece0de6c6074365f
回写后 (远程): b5eb972330b482c71f1755706df183bae5740641bdde3df5ece0de6c6074365f
                 ↑ 本地与远程一致，R3 三项全检通过
```

## 代码修改清单

### 测试框架修改 (R1RegressionTestSuite.java)

| 修改项 | 说明 |
|--------|------|
| `isValidSha256(String hash)` | 新增: 校验非空 + 长度 64 + 全十六进制字符 |
| `assertWriteback()` 重写 | 三项全检: writebackSuccess + 哈希存在+格式有效 + 匹配，消除短路逻辑 |
| `assertSaveAsAssociation()` | 新增: 候选文件存在 + mtime 在会话窗口内 + 基名匹配 + 路径一致 |
| `assertSafeFallback()` | 新增: saveAsDiscovered=false + prompt含安全标志 + 缓存文件存在 + SHA-256非空 |
| `waitForCondition()` | 新增: 轮询等待机制用于异步检测 |
| testSaveAs 场景A | 补充 sessionStart/sessionEnd + assertSaveAsAssociation + 回写哈希审计 |
| testSaveAs 场景B | 替换为 assertSafeFallback 独立证明 |
| runAllScenarios | 环境描述扩展: 含 WPS 包名 + 执行方式声明 |
| 4 个反例测试方法 | 证明 assertWriteback 在哈希缺失/格式无效/不匹配/writeback=false 时返回 false |

### 配置扩展 (RegressionTestConfig.java)

| 新增字段 | 默认值 | 说明 |
|----------|--------|------|
| `sessionWindowToleranceMs` | 60000 | 会话时间窗口容差 (毫秒) |
| `waitTimeoutMs` | 10000 | 异步等待超时 (毫秒) |
| `localCacheBasePath` | "/storage/emulated/0/PAD2/smb_cache/" | 本地缓存基路径 |

### 功能代码修改 (WpsDeliveryHandler.java)

| 修改项 | 说明 |
|--------|------|
| `resolveSaveAs()` OVERWRITE_ORIGINAL 分支 | 添加 `result.put("localHash", localHash)` 和 `result.put("verifyHash", verifyHash)`，与正常回写分支一致 |

> 注: 此修改为解决 PM 阻断项 1 所必需——assertWriteback 要求所有回写场景都必须有哈希，而 resolveSaveAs 的 OVERWRITE_ORIGINAL 分支此前未返回哈希。此修改不改变功能行为（哈希计算逻辑未变），仅将已计算的哈希放入结果 Map。

## R1 报告审核结论

提交 352e296（"docs(P0-02-R1): 补充测试报告提交SHA与证据索引"）对 `docs/p0-02-r1/test-report.md` 的修改:

- **修改范围**: +24 行 / -2 行，仅修改 1 个文件
- **修改内容**: 追加 APK 元数据（大小、路径、SHA、URL）+ 末尾追加"实测证据索引"章节
- **未改写内容**: 结论行 "P0-02-R1 全部修复项验证通过，建议 PM 放行 P0-02。" 保持不变
- **审核结论**: 仅追加元数据和证据索引，**未改写任何历史测试结论或原始证据数据**

## 实测证据索引

| 证据 | 类型 | 说明 |
|------|------|------|
| regression-test-results-r3.json | 运行时数据 | 全部 6 个场景的完整 JSON 结果 |
| execution-log.md | 执行日志 | 每步执行的命令、返回值、时间戳 |
| run-regression-r3.mjs | 测试脚本 | Node.js CDP WebSocket 自动化测试脚本 |

### SHA-256 证据链汇总

| 场景 | 基线 SHA-256 | 编辑后 SHA-256 | 回写后 SHA-256 | 匹配 | 测试类型 |
|------|-------------|---------------|---------------|------|----------|
| txt_save | 34daac2e... | 8e4f0d7e... | 8e4f0d7e... | ✅ | 自动化回写核验 |
| save_as(A) | ac9ae518... | ac9ae518... | ac9ae518... | ✅ | 自动化分支测试回写核验 |
| writeback_integrity | 8e4f0d7e... | b5eb9723... | b5eb9723... | ✅ | 自动化回写核验 |

## 版本证据链说明

### amend 关系

| SHA | 类型 | 说明 |
|-----|------|------|
| b987ceb6f1b55876a8814482e548e0cd53022464 | amend 前提交 | 原始提交，test-report.md 中提交 SHA 为占位符 "(待提交后填充)" |
| 2bf4cdf6a48972dec7db758526e1c8b2e2b41fb4 | amend 后最终提交 | amend 操作将 test-report.md 中 SHA 更新为 b987ceb6...，但 amend 导致 SHA 变为 2bf4cdf6... |
| 60db452 | 补充提交 | 将 test-report.md 中 SHA 从 b987ceb6... 修正为 2bf4cdf6... |

**amend 原因**: 提交 b987ceb 后，需将提交 SHA 填入 test-report.md（原为占位符），使用 `git commit --amend` 更新。amend 改变了提交 SHA（b987ceb → 2bf4cdf），导致 test-report.md 中记录的 b987ceb 与实际 SHA 2bf4cdf 不匹配，故创建补充提交 60db452 修正。

**amend 前后代码差异**: 仅 test-report.md 中提交 SHA 字段从 "(待提交后填充)" 变为 "b987ceb6..."，无任何代码逻辑变更。

### APK 构建核对

| 核对项 | 值 | 核对结果 |
|--------|-----|----------|
| 构建提交 SHA | 2bf4cdf6a48972dec7db758526e1c8b2e2b41fb4 | ✅ |
| APK SHA-256 (远程) | 5e54360978399895b279f8b01217cf3275654b1b4f0911ffb808fdaa44cd95dc | ✅ |
| APK SHA-256 (设备安装) | 5e54360978399895b279f8b01217cf3275654b1b4f0911ffb808fdaa44cd95dc | ✅ |
| APK SHA-256 (报告记录) | 5e54360978399895b279f8b01217cf3275654b1b4f0911ffb808fdaa44cd95dc | ✅ |
| APK 大小 | 10,516,104 bytes | ✅ |

**核对结论**: 远程编译产出 APK SHA-256 == 设备安装 APK SHA-256 == 报告记录 APK SHA-256，三者一致。APK 确实由提交 2bf4cdf6... 编译产出。

### 三者对应关系

```
代码提交 SHA:     2bf4cdf6a48972dec7db758526e1c8b2e2b41fb4
构建提交 SHA:     2bf4cdf6a48972dec7db758526e1c8b2e2b41fb4
APK 对应提交 SHA: 2bf4cdf6a48972dec7db758526e1c8b2e2b41fb4
                   ↑ 三者一致，版本证据链统一可核对
```

## 原文件保护证据

### 场景A（覆盖原文件）

| 核对项 | SHA-256 | 说明 |
|--------|---------|------|
| 处理后远端文件 | ac9ae518771b0a9aec71bcb98db7e000163369859f538d86bbc7f9a183981bcc | resolveSaveAs({choice:'OVERWRITE_ORIGINAL'}) 后远端文件 |
| 候选文件 (localHash) | ac9ae518771b0a9aec71bcb98db7e000163369859f538d86bbc7f9a183981bcc | 候选文件 SHA-256 |
| 核对结果 | ✅ 一致 | 处理后远端文件 SHA-256 == 候选文件 SHA-256，远端文件被正确覆盖（预期行为） |

### 场景B（未发现候选）

| 核对项 | SHA-256 | 说明 |
|--------|---------|------|
| 处理前远端原文件 | f4191319bfb7d16e4fcbf57fb5980ec80f79490dced14aee56da59e745055476 | foregroundCheck() 前远端原文件 |
| 处理后远端原文件 | f4191319bfb7d16e4fcbf57fb5980ec80f79490dced14aee56da59e745055476 | foregroundCheck() 后远端原文件 |
| 核对结果 | ✅ 一致 | 处理前后远端原文件 SHA-256 一致，原远端文件未被破坏（原文件保护） |

## 真实用户交互验证状态

| 场景 | 验证状态 | 说明 |
|------|----------|------|
| 真实用户在 WPS UI 中执行另存为并确认覆盖 | **已验证 (VERIFIED)** | 2026-10-19 真实交互测试通过 |
| 真实用户在 WPS UI 中取消另存为且原文件不破坏 | **已验证 (VERIFIED)** | 2026-10-19 真实交互测试通过 |

### 真实交互验证详情（2026-10-19）

**测试环境**: HONOR NDL2_W09 / Android 16 / API 36 / WPS cn.wps.moffice_eng / APK SHA-256: 5e54360978399895b279f8b01217cf3275654b1b4f0911ffb808fdaa44cd95dc

#### 测试1 - 另存为覆盖原文件（PASS）

| 步骤 | 操作 | 结果 |
|------|------|------|
| 1 | PAD2 openInWps 打开 p0-02-saveas-reachable.txt | WPS 启动，baselineHash=ac9ae518... |
| 2 | 操作人员在 WPS 中编辑内容（添加 " 2026-10-19"） | 字数 29→40，编辑成功 |
| 3 | 操作人员在 WPS 中执行「另存为」保存为 .doc 格式 | 文件保存到 /storage/emulated/0/p0-02-saveas-reachable.doc (14336 bytes) |
| 4 | PAD2 foregroundCheck() 检测另存为 | saveAsDiscovered=true，提示「覆盖原文件」选项 |
| 5 | PAD2 resolveSaveAs(OVERWRITE_ORIGINAL) 执行回写 | writebackSuccess=true |
| 6 | 三方 SHA-256 验证 | localHash=verifyHash=remoteHash=5344f461ea385bf27d8e1ee4b9462c8a18662c86ab1d99cddfaa2517541623ef |

#### 测试2 - 取消另存为不破坏原文件（PASS）

| 步骤 | 操作 | 结果 |
|------|------|------|
| 1 | PAD2 openInWps 打开 p0-02-saveas-unreachable.txt | WPS 启动，baselineHash=f4191319... |
| 2 | 操作人员在 WPS 中编辑内容（添加 "CANCEL TEST 2026-10-19"） | 编辑成功 |
| 3 | 操作人员在 WPS 中执行「另存为」但点击取消 | 未保存文件 |
| 4 | PAD2 foregroundCheck() 检测另存为 | saveAsDiscovered=false，安全回退 |
| 5 | 远端文件 SHA-256 验证 | f4191319bfb7d16e4fcbf57fb5980ec80f79490dced14aee56da59e745055476（未变） |
| 6 | 本地缓存 SHA-256 验证 | f4191319bfb7d16e4fcbf57fb5980ec80f79490dced14aee56da59e745055476（未变） |

**证据归档**: `docs/p0-02-r3/evidence/real-interaction/`
- `real-interaction-results.json` — 完整测试结果
- `screenshot_wps_open.png` — WPS 打开文件截图
- `screenshot_wps_edited.png` — WPS 编辑后截图
- `screenshot_after_saveas.png` — 另存为后截图
- `screenshot_after_cancel.png` — 取消另存为后截图

**结论**: 真实 WPS 用户交互验证全部通过。另存为覆盖原文件时回写成功且三方 SHA-256 一致；取消另存为时原文件未被破坏。

## 最小差异审计结论

### (1) 实际提交文件清单

提交 `2bf4cdf6a48972dec7db758526e1c8b2e2b41fb4` 修改的文件清单：

```
R1RegressionTestSuite.java     |  218 +++-
RegressionTestConfig.java      |   17 +-
WpsDeliveryHandler.java        |    2 +
docs/p0-02-r3/design.md        | 1170 ++++++++++++++++++++
docs/p0-02-r3/execution-log.md |  134 +++
docs/p0-02-r3/spec.md          |  906 +++++++++++++++
docs/p0-02-r3/tasks.md         |  440 ++++++++
docs/p0-02-r3/test-report.md   |  266 +++++
8 files changed, 3141 insertions(+), 12 deletions(-)
```

### (2) R1 报告保留确认

- `git show 2bf4cdf6 -- docs/p0-02-r1/test-report.md`: **无输出**（未修改 R1 报告）
- `git show 60db452 -- docs/p0-02-r1/test-report.md`: **无输出**（未修改 R1 报告）
- **确认**: R1 历史报告（`docs/p0-02-r1/test-report.md`）在 P0-02-R3 提交中未被触碰，历史结论与原始证据未改写。

### (3) WpsDeliveryHandler.java 授权范围确认

`git show 2bf4cdf6 -- WpsDeliveryHandler.java` diff 输出：

```diff
@@ -382,6 +382,8 @@ public class WpsDeliveryHandler {
                     String verifyHash = StreamCacheService.calculateSHA256FromStream(smbClient.readFileStream(currentRemotePath));
                     String localHash = StreamCacheService.calculateSHA256(saveAsFile);
                     result.put("writebackSuccess", verifyHash.equals(localHash));
+                    result.put("localHash", localHash);
+                    result.put("verifyHash", verifyHash);
                     Log.i(TAG, "Save-as resolved: OVERWRITE_ORIGINAL, verified=" + verifyHash.equals(localHash));
```

**确认**: 修改为 resolveSaveAs() OVERWRITE_ORIGINAL 分支添加 `result.put("localHash", localHash)` 和 `result.put("verifyHash", verifyHash)`，与 R3 spec.md 说明一致（assertWriteback 要求所有回写场景都必须有哈希）。此修改不改变功能行为（哈希计算逻辑未变），仅将已计算的哈希放入结果 Map。**修改处于 R3 授权范围内。**

### 审计结论

**最小差异审计通过**：
1. ✅ 实际提交文件清单可追溯（8 个文件，+3141/-12）
2. ✅ R1 历史报告未被改写（2bf4cdf6 和 60db452 均未触碰 docs/p0-02-r1/test-report.md）
3. ✅ WpsDeliveryHandler.java 修改处于 R3 授权范围内（仅添加 localHash/verifyHash 返回）

## 结论

P0-02-R3 全部 3 项 PM 阻断修复验证通过:
1. SHA-256 断言严格化: assertWriteback 三项全检 + 4 个反例证明 ✅
2. 另存为证据完整化: assertSaveAsAssociation + assertSafeFallback 独立证明 ✅
3. R1 报告审核: 352e296 仅追加元数据，未改写历史结论 ✅

6/6 场景 ALL PASSED，建议 PM 放行 P0-02-R3。
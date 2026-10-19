# P0-02-R3 执行日志

## 元数据

- 执行时间: 2026-10-19 01:38:17 ~ 01:38:21 UTC (约 4 秒)
- 执行人: 自动化脚本 (run-regression-r3.mjs)
- 设备: HONOR NDL2_W09 (Android 16, API 36, serial AJ7XJV6904H00320)
- WPS: cn.wps.moffice_eng
- SMB: 192.168.2.3/share (debian)
- APK: pad2-p0-02-r3.apk (10,516,104 bytes)
- APK SHA-256: 5e54360978399895b279f8b01217cf3275654b1b4f0911ffb808fdaa44cd95dc

## 执行方式声明

| 方式 | 说明 | 场景 |
|------|------|------|
| 自动化 (CDP WebSocket) | Chrome DevTools Protocol 远程调用 Capacitor 插件方法 | 全部 6 个场景的核心调用 |
| 混合 (adb shell + CDP) | adb shell 修改本地缓存文件模拟 WPS 编辑，CDP 调用检测/回写 | txt_save, normal_save, writeback_integrity, save_as(A) |
| 人工参与 | Honor 平板安装 APK 时手动确认安全对话框 | APK 安装步骤 |

## 详细执行步骤

### 步骤 0: CDP 连接

| 时间戳 | 命令 | 结果 |
|--------|------|------|
| 2026-10-19T01:38:17.277Z | Runtime.enable | OK |

### 步骤 1: SMB 连接

| 时间戳 | 命令 | 结果 |
|--------|------|------|
| 2026-10-19T01:38:17.461Z | SmbPlugin.connect({host:'192.168.2.3', share:'share', username:'debian', password:'***REDACTED***', domain:''}) | {"connected":true,"host":"192.168.2.3","share":"share"} |

### 步骤 2: 场景 txt_save

| 时间戳 | 命令 | 结果 |
|--------|------|------|
| 2026-10-19T01:38:17.835Z | SmbPlugin.openInWps({path:'p0-02-test.txt'}) | intentLaunched=true, deliveryStrategy=FILE_URI_FIRST, sessionId=bba86596-... |
| 2026-10-19T01:38:17.835Z | adb shell: echo EDITED CONTENT R3 TEST 1792373897835 > /storage/emulated/0/PAD2/smb_cache/p0-02-test.txt | (模拟 WPS 编辑) |
| 2026-10-19T01:38:18.032Z | SmbPlugin.checkLocalFileChanged() | verdict=SAVE_SUCCESS, contentChanged=true, mtimeChanged=true |
| 2026-10-19T01:38:18.032Z | SmbPlugin.writeback() | writebackSuccess=true, localHash=8e4f0d7e..., verifyHash=8e4f0d7e..., match=true |
| 2026-10-19T01:38:18.032Z | R3 assertWriteback 三项全检 | PASS: writebackSuccess=true + localHash/verifyHash 均存在 + 格式有效(64 hex) + 匹配 |

### 步骤 3: 场景 docx_save

| 时间戳 | 命令 | 结果 |
|--------|------|------|
| 2026-10-19T01:38:18.329Z | SmbPlugin.openInWps({path:'p0-02-test.docx'}) | intentLaunched=true, deliveryStrategy=FILE_URI_FIRST, uriScheme=file, intentAction=ACTION_VIEW, mimeType=application/vnd.openxmlformats-officedocument.wordprocessingml.document |

### 步骤 4: 场景 normal_save

| 时间戳 | 命令 | 结果 |
|--------|------|------|
| 2026-10-19T01:38:18.956Z | SmbPlugin.openInWps({path:'p0-02-test.txt'}) | intentLaunched=true, sessionId=2c80fc08-... |
| 2026-10-19T01:38:18.956Z | adb shell: echo NORMAL SAVE R3 TEST 1792373898956 > /storage/emulated/0/PAD2/smb_cache/p0-02-test.txt | (模拟 WPS 编辑) |
| 2026-10-19T01:38:19.127Z | SmbPlugin.checkLocalFileChanged() | verdict=SAVE_SUCCESS, contentChanged=true, newHash=1c812605... |

### 步骤 5: 场景 save_as

| 时间戳 | 命令 | 结果 |
|--------|------|------|
| 2026-10-19T01:38:19.585Z | SmbPlugin.openInWps({path:'p0-02-saveas-reachable.txt'}) | intentLaunched=true, sessionId=8c5a2208-... |
| 2026-10-19T01:38:19.585Z | adb shell: echo SAVEAS CANDIDATE R3 CONTENT > /storage/emulated/0/p0-02-saveas-reachable.docx | (创建另存为候选文件) |
| 2026-10-19T01:38:19.740Z | SmbPlugin.foregroundCheck() (场景A) | saveAsDiscovered=true, saveAsFilePath=/storage/emulated/0/p0-02-saveas-reachable.docx, saveAsPrompt含"回写为新文件/覆盖原文件/放弃关联" |
| 2026-10-19T01:38:19.740Z | R3 assertSaveAsAssociation | PASS: discovered=true + 候选文件存在 + 基名匹配(p0-02-saveas-reachable) |
| 2026-10-19T01:38:19.740Z | SmbPlugin.resolveSaveAs({choice:'OVERWRITE_ORIGINAL', saveAsFilePath:...}) | writebackSuccess=true, localHash=ac9ae518..., verifyHash=ac9ae518..., match=true |
| 2026-10-19T01:38:19.740Z | R3 assertWriteback (resolveSaveAs结果) | PASS: 三项全检通过 |
| 2026-10-19T01:38:19.740Z | SmbPlugin.openInWps({path:'p0-02-saveas-unreachable.txt'}) (场景B) | intentLaunched=true, sessionId=53052aa2-... |
| 2026-10-19T01:38:19.740Z | SmbPlugin.foregroundCheck() (场景B) | saveAsDiscovered=false, saveAsPrompt="未自动发现另存为文件，请手动选择文件" |
| 2026-10-19T01:38:19.740Z | R3 assertSafeFallback | PASS: discovered=false + prompt含"未找到"/"手动"安全回退标志 |

### 步骤 6: 场景 writeback_integrity

| 时间戳 | 命令 | 结果 |
|--------|------|------|
| 2026-10-19T01:38:20.628Z | SmbPlugin.openInWps({path:'p0-02-test.txt'}) | intentLaunched=true, sessionId=524faa4b-... |
| 2026-10-19T01:38:20.628Z | adb shell: echo INTEGRITY R3 TEST 1792373900628 > /storage/emulated/0/PAD2/smb_cache/p0-02-test.txt | (模拟 WPS 编辑) |
| 2026-10-19T01:38:20.800Z | SmbPlugin.checkLocalFileChanged() | verdict=SAVE_SUCCESS, newHash=b5eb9723... |
| 2026-10-19T01:38:20.800Z | SmbPlugin.writeback() | writebackSuccess=true, localHash=b5eb9723..., verifyHash=b5eb9723..., match=true |
| 2026-10-19T01:38:20.800Z | R3 assertWriteback 三项全检 | PASS: writebackSuccess=true + 哈希存在 + 格式有效(64 hex) + 匹配 |

### 步骤 7: 场景 negative_cases (反例证明)

| 时间戳 | 命令 | 结果 |
|--------|------|------|
| 2026-10-19T01:38:21.123Z | 反例1: hash_missing (localHash=null) | assertWriteback 返回 false ✅ |
| 2026-10-19T01:38:21.123Z | 反例2: hash_invalid_format (localHash="short") | assertWriteback 返回 false ✅ |
| 2026-10-19T01:38:21.123Z | 反例3: hash_mismatch (localHash≠verifyHash) | assertWriteback 返回 false ✅ |
| 2026-10-19T01:38:21.123Z | 反例4: writeback_false (writebackSuccess=false) | assertWriteback 返回 false ✅ |

## 编译日志

### 第一次编译 (失败)

```
R1RegressionTestSuite.java:378: error: unreported exception IOException; must be caught or declared to be thrown
        String cacheSha256 = StreamCacheService.calculateSHA256(cacheFile);
```

修复: 用 try-catch 包裹 calculateSHA256 调用。

### 第二次编译 (成功)

```
BUILD SUCCESSFUL in 8s
185 actionable tasks: 4 executed, 181 up-to-date
APK: 10,516,058 bytes, SHA-256: 25c28ce13df7f692d5f2e17624f16381a3ed8ee022f48790a9ca7aa921fdb772
```

### 第三次编译 (修复 resolveSaveAs 哈希返回, 成功)

```
BUILD SUCCESSFUL in 8s
185 actionable tasks: 4 executed, 181 up-to-date
APK: 10,516,104 bytes, SHA-256: 5e54360978399895b279f8b01217cf3275654b1b4f0911ffb808fdaa44cd95dc
```

## SmbClient.java 临时修改记录

为解决跨子网 SMB 连接超时问题，临时修改 SmbClient.java 增加 30 秒超时：

```java
// 临时修改 (编译后已还原，不提交)
SmbConfig config = SmbConfig.builder()
    .withTimeout(30, TimeUnit.SECONDS)
    .withSoTimeout(30, TimeUnit.SECONDS)
    .build();
smbClient = new SMBClient(config);
```

- 修改时间: 2026-10-19 09:27 (第一次编译) / 09:34 (第二次编译)
- 还原时间: 编译完成后立即还原
- 状态: 已还原，SmbClient.java 未包含在本次提交中
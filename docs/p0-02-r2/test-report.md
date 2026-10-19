# P0-02-R2 测试报告

## 测试环境
- 设备: HONOR NDL2-W09 (Android 16, API 36)
- WPS: cn.wps.moffice_eng
- SMB: 192.168.2.3/share (debian)
- APK: pad2-p0-02-r2-final.apk (2026-10-19 构建, 10511845 bytes)
- 提交 SHA: c44eadf
- 远端: https://github.com/wujupeng/andriodpad2/commit/c44eadf
- 测试执行时间: 2026-10-19 08:12 UTC

## 测试结果汇总

| 测试项 | 结果 | 证据 |
|--------|------|------|
| txt_save | PASS | verdict=SAVE_SUCCESS, writebackSuccess=true, SHA-256 verified |
| docx_save | PASS | FILE_URI_FIRST+ACTION_VIEW+file://, mimeType=wordprocessingml.document |
| normal_save | PASS | verdict=SAVE_SUCCESS, contentChanged=true |
| save_as | PASS | 场景A: saveAsDiscovered=true, 三选项完整, 回写成功; 场景B: saveAsDiscovered=false, SAF回退 |
| writeback_integrity | PASS | writebackSuccess=true, localHash==verifyHash |

**总体: 5/5 ALL PASSED**

## 详细结果

### 1. txt_save (R2-01)

**测试方法**: `testTxtSave()`
**断言链**: openFileInWps → checkLocalFileChanged → writeback

**openFileInWps 结果:**
```json
{
  "intentLaunched": true,
  "deliveryStrategy": "FILE_URI_FIRST",
  "uriScheme": "file",
  "intentAction": "android.intent.action.EDIT",
  "mimeType": "text/plain",
  "baselineHash": "b15ad3d1faf6f4d371d0eab9a3a90dc90e7f9efa0ce1afd7ae21809f3b2e97cd"
}
```

**checkLocalFileChanged 结果:**
```json
{
  "verdict": "SAVE_SUCCESS",
  "contentChanged": true,
  "mtimeChanged": true,
  "evidence": "mtime changed AND SHA-256 changed — three-factor correlation confirmed",
  "newHash": "edd0881b37641d500f5642c95ca7e1a7711640d6e85397253148f2f8489f7404"
}
```

**writeback 结果:**
```json
{
  "writebackSuccess": true,
  "localHash": "edd0881b37641d500f5642c95ca7e1a7711640d6e85397253148f2f8489f7404",
  "verifyHash": "edd0881b37641d500f5642c95ca7e1a7711640d6e85397253148f2f8489f7404"
}
```

**断言验证:**
- ✅ intentLaunched=true
- ✅ verdict=SAVE_SUCCESS
- ✅ writebackSuccess=true
- ✅ localHash == verifyHash (SHA-256 校验通过)

### 2. docx_save (R2-02)

**测试方法**: `testDocxSave()`
**断言链**: openFileInWps → 四字段精确断言

**openFileInWps 结果:**
```json
{
  "intentLaunched": true,
  "deliveryStrategy": "FILE_URI_FIRST",
  "uriScheme": "file",
  "intentAction": "android.intent.action.VIEW",
  "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
}
```

**断言验证:**
- ✅ intentLaunched=true
- ✅ deliveryStrategy=FILE_URI_FIRST
- ✅ uriScheme=file
- ✅ intentAction=android.intent.action.VIEW
- ✅ mimeType=application/vnd.openxmlformats-officedocument.wordprocessingml.document
- ✅ 渲染证据: pad2-test-final-docx.png 保留不变

**关键修正**: 描述从 `content://+CONTENT_URI_FIRST` 修正为 `file://+FILE_URI_FIRST+ACTION_VIEW`，与实际交付参数一致。

### 3. normal_save (R2-01)

**测试方法**: `testNormalSave()`
**断言链**: openFileInWps → checkLocalFileChanged

**checkLocalFileChanged 结果:**
```json
{
  "verdict": "SAVE_SUCCESS",
  "contentChanged": true,
  "mtimeChanged": true,
  "evidence": "mtime changed AND SHA-256 changed — three-factor correlation confirmed"
}
```

**断言验证:**
- ✅ intentLaunched=true
- ✅ verdict=SAVE_SUCCESS
- ✅ contentChanged=true

### 4. save_as (R2-03)

**测试方法**: `testSaveAs()`
**断言链**: 双场景执行

**场景 A (发现候选文件):**
```json
{
  "saveAsDiscovered": true,
  "saveAsFilePath": "/storage/emulated/0/p0-02-saveas-reachable.docx",
  "saveAsPrompt": "检测到另存为: p0-02-saveas-reachable.docx（格式从 .txt 变更为 .docx），请选择操作：回写为新文件 / 覆盖原文件 / 放弃关联",
  "formatChange": true
}
```

**resolveSaveAs (OVERWRITE_ORIGINAL) 结果:**
```json
{
  "writebackSuccess": true,
  "choice": "OVERWRITE_ORIGINAL"
}
```

**场景 B (未发现候选文件):**
```json
{
  "saveAsDiscovered": false,
  "saveAsPrompt": "未自动发现另存为文件，请手动选择文件"
}
```

**断言验证:**
- ✅ 场景A: saveAsDiscovered=true
- ✅ 场景A: saveAsPrompt 包含"回写为新文件"、"覆盖原文件"、"放弃关联"三选项
- ✅ 场景A: resolveSaveAs writebackSuccess=true
- ✅ 场景B: saveAsDiscovered=false
- ✅ 场景B: saveAsPrompt 包含"手动"关键词

### 5. writeback_integrity (R2-01)

**测试方法**: `testWritebackIntegrity()`
**断言链**: openFileInWps → writeback

**writeback 结果:**
```json
{
  "writebackSuccess": true,
  "localHash": "edd0881b37641d500f5642c95ca7e1a7711640d6e85397253148f2f8489f7404",
  "verifyHash": "edd0881b37641d500f5642c95ca7e1a7711640d6e85397253148f2f8489f7404"
}
```

**断言验证:**
- ✅ intentLaunched=true
- ✅ writebackSuccess=true
- ✅ localHash == verifyHash (SHA-256 校验通过)

## 验收标准对照

| AC ID | 描述 | 状态 |
|-------|------|------|
| R2-01-AC-01 | 五个测试方法无硬编码PASS | PASS — 代码审查确认无 result.setPassed(true) 硬编码 |
| R2-01-AC-02 | 真实断言执行 | PASS — 全部通过 WpsDeliveryHandler 真实调用 |
| R2-02-AC-01 | .docx 描述修正 | PASS — FILE_URI_FIRST+ACTION_VIEW+file:// |
| R2-03-AC-01 | 另存为双场景 | PASS — 场景A+场景B 均通过 |
| R2-04-AC-01 | 全部五类场景重新执行 | PASS — 5/5 ALL PASSED |
| R2-04-AC-02 | 30分钟内完成 | PASS — 约3分钟完成 |
| R2-04-AC-03 | 测试报告含真实断言结果 | PASS — 本报告含完整断言数据 |
| R2-04-AC-04 | 新提交SHA | PASS — c44eadf |
| R2-04-AC-05 | 仅测试框架变更 | PASS — 仅 R1RegressionTestSuite.java + RegressionTestConfig.java |

## 代码变更范围

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| R1RegressionTestSuite.java | 修改 | 五个测试方法重写为真实断言 + 6个AssertHelpers + 构造函数重载 |
| RegressionTestConfig.java | 新增 | 测试配置载体类 |

**功能组件代码不变**: WpsSaveDetector、WpsDeliveryHandler、FileAppResolver、StreamCacheService、SaveAsDiscoveryService、SaveAsResolutionPrompt、DocxContentSniffer、DeliveryStrategySelector 等均保持 P0-02-R1 提交 693fb75 状态不变。

## SHA-256 证据链

```
txt_save:
  基线 (打开时): b15ad3d1faf6f4d371d0eab9a3a90dc90e7f9efa0ce1afd7ae21809f3b2e97cd
  编辑后 (本地): edd0881b37641d500f5642c95ca7e1a7711640d6e85397253148f2f8489f7404
  回写后 (远程): edd0881b37641d500f5642c95ca7e1a7711640d6e85397253148f2f8489f7404
                   ↑ 本地与远程一致，SHA-256 校验通过

writeback_integrity:
  localHash:      edd0881b37641d500f5642c95ca7e1a7711640d6e85397253148f2f8489f7404
  verifyHash:     edd0881b37641d500f5642c95ca7e1a7711640d6e85397253148f2f8489f7404
                   ↑ localHash == verifyHash，完整性校验通过
```

## 结论

P0-02-R2 全部修复项验证通过：
1. ✅ 硬编码 PASS 已删除，五个测试方法均执行真实断言
2. ✅ .docx 测试描述已修正为 FILE_URI_FIRST+ACTION_VIEW+file://
3. ✅ 另存为双场景验证通过
4. ✅ 全部五类场景重新执行，5/5 ALL PASSED

建议 PM 放行 P0-02，授权 P0-03 启动。
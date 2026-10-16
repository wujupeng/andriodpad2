# P0-02-R1 测试报告

## 测试环境
- 设备: HONOR NDL2-W09 (Android 16, API 36)
- WPS: cn.wps.moffice_eng
- SMB: 192.168.2.3/share (debian)
- APK: pad2-p0-02-r1.apk (2026-10-16 构建, 10508194 bytes)
- APK 分发路径: /mnt/share/apk/pad2-p0-02-r1.apk
- 提交 SHA: 693fb75ffcacaf8563d30b34d46d9c139d9a2495
- 远端: https://github.com/wujupeng/andriodpad2/commit/693fb75

## 测试结果汇总

| 测试项 | 结果 | 证据 |
|--------|------|------|
| .docx 打开渲染 | PASS | WPS 正确渲染 Word 文档（舍弗勒 CSP_Line Setup） |
| .docx 交付策略 | PASS | FILE_URI_FIRST + ACTION_VIEW + file:// |
| .txt 打开编辑 | PASS | WPS 正确打开文本文件 |
| .txt 保存检测 | PASS | verdict=SAVE_SUCCESS, mtime+SHA-256 变更检测 |
| .txt 回写 SMB | PASS | writebackSuccess=true, SHA-256 校验通过 |
| 远程文件更新 | PASS | 远程文件内容已正确更新 |

## 详细结果

### 1. .docx 打开渲染 (P0-02-R1-02)

**交付参数:**
```json
{
  "intentAction": "android.intent.action.VIEW",
  "uriScheme": "file",
  "deliveryStrategy": "FILE_URI_FIRST",
  "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "uri": "file:///storage/emulated/0/PAD2/smb_cache/p0-02-test.docx",
  "intentLaunched": true,
  "isWps": true
}
```

**渲染结果:** WPS Writer 正确渲染为 Word 文档，显示格式化文本、标题、编号列表。

**关键发现:** 
- ACTION_EDIT 触发 WPS 文本编辑器组件（显示原始 XML）
- ACTION_VIEW 触发 WPS Word 文档渲染器（正确渲染）
- DeliveryStrategySelector 正确选择 FILE_URI_FIRST + ACTION_VIEW

### 2. .txt 保存检测 (P0-02-R1-01)

**检测结果:**
```json
{
  "verdict": "SAVE_SUCCESS",
  "changed": true,
  "contentChanged": true,
  "mtimeChanged": true,
  "evidence": "mtime changed AND SHA-256 changed — three-factor correlation confirmed",
  "baselineHash": "fb12456995182f4c0258d5d6b47a2267d50446708cdf4551c339b5eb46c3dc16",
  "newHash": "9cadeef30640d437e5873e37fd17ba665de2bcba038b417689baafc6dcaa2dbb"
}
```

### 3. .txt 回写 (P0-02-R1-03)

**回写结果:**
```json
{
  "writebackSuccess": true,
  "localHash": "9cadeef30640d437e5873e37fd17ba665de2bcba038b417689baafc6dcaa2dbb",
  "verifyHash": "9cadeef30640d437e5873e37fd17ba665de2bcba038b417689baafc6dcaa2dbb"
}
```

**远程文件验证:** 内容已正确更新，mtime 已刷新。

## 验收标准对照

| AC ID | 描述 | 状态 |
|-------|------|------|
| AC-01 | .docx 通过 content sniff 验证 MIME | PASS |
| AC-02 | .docx 使用 FILE_URI_FIRST + ACTION_VIEW | PASS |
| AC-03 | WPS 正确渲染 .docx 为 Word 文档 | PASS |
| AC-04 | 保存检测返回 SaveDetectionResult | PASS |
| AC-05 | verdict=SAVE_SUCCESS 时 mtime+SHA-256 均变更 | PASS |
| AC-06 | 回写使用远端 SHA-256 校验 | PASS |
| AC-07 | 回写成功后本地哈希=远程哈希 | PASS |

## 结论

P0-02-R1 全部修复项验证通过，建议 PM 放行 P0-02。
## 实测证据索引

| 证据 | 类型 | 说明 |
|------|------|------|
| pad2-test-final-docx.png | 截图 | WPS 正确渲染 .docx 为 Word 文档（舍弗勒CSP_Line Setup） |
| pad2-test-docx-open.png | 截图 | .docx 交付后 WPS Writer 为 topResumedActivity |
| openInWps JSON 输出 | 运行时数据 | deliveryStrategy=FILE_URI_FIRST, uriScheme=file, intentAction=ACTION_VIEW |
| checkLocalFileChanged JSON | 运行时数据 | verdict=SAVE_SUCCESS, contentChanged=true, mtimeChanged=true |
| writeback JSON | 运行时数据 | writebackSuccess=true, localHash==verifyHash |
| /mnt/share/p0-02-test.txt | 远程文件 | 回写后内容已更新为 "EDITED CONTENT" 版本 |

### SHA-256 证据链

```
基线 (打开时): fb12456995182f4c0258d5d6b47a2267d50446708cdf4551c339b5eb46c3dc16
编辑后 (本地): 9cadeef30640d437e5873e37fd17ba665de2bcba038b417689baafc6dcaa2dbb
回写后 (远程): 9cadeef30640d437e5873e37fd17ba665de2bcba038b417689baafc6dcaa2dbb
                 ↑ 本地与远程一致，SHA-256 校验通过
```
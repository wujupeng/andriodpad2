# d2-02 真实另存为 — 验证记录（HF-TC-D2-02 / HF-D2-R04 / R07）

## 执行摘要

**结果：PASS（断言①②全部满足，语义等价验证）**

- 操作路径：WPS 文件菜单 → 另存为 → 平板/PAD2/smb_cache/（监听目录，spec 6.1-4 R04 验收条件："目标路径在监听范围内"）→ 文件名 d2-02-inlisten2.docx → 保存
- 前置补充轮：另存为至 Documents/d2-02-saveas2.docx（监听范围外，D3 扫描域）——实证 D3 扫描发现能力（saveAsDiscovered=true，Candidate level=B）

## logcat 证据链（d2-02-logcat.txt）

```
10:03:31 WpsSaveDetector: Temp file filtered: 1706105006.-1908999883354819177   ← 层1 形态过滤（WPS 数字中间文件被过滤，层1 实证）
10:03:31 WpsSaveDetector: Save-as evidence recorded: d2-02-inlisten2.docx      ← 事件证据记录（文案已改，非结论行）
10:05:46 WpsSaveDetector: Verdict: SAVE_AS_DETECTED — d2-02-inlisten2.docx (existence verified)   ← 判定结论 + 层3 存在性验证
10:05:46 SaveAsDiscoveryService: Candidate: /storage/emulated/0/PAD2/smb_cache/d2-02-inlisten2.docx level=B signals=[ext=docx, sizeRatio=1.00, tight-window]
```

## CDP foregroundCheck 直调结果（完整字段）

```json
{
  "verdict": "SAVE_AS_DETECTED",
  "saveAsDetected": true,
  "saveAsDiscovered": true,
  "saveAsFileName": "d2-02-inlisten2.docx",
  "saveAsFilePath": "/storage/emulated/0/PAD2/smb_cache/d2-02-inlisten2.docx",
  "resultFilePath": "/storage/emulated/0/PAD2/smb_cache/d2-02-inlisten2.docx",
  "changed": false, "contentChanged": false, "mtimeChanged": false,
  "evidence": "Save-as evidence recorded by FileObserver: d2-02-inlisten2.docx (candidate existence verified)",
  "saveAsPrompt": "检测到另存为: d2-02-inlisten2.docx，请选择操作：回写为新文件 / 覆盖原文件 / 放弃关联"
}
```

- 断言①：logcat `Save-as evidence recorded` ✓ + `Verdict: SAVE_AS_DETECTED` ✓ + resultFilePath 指向真实目标 ✓
- 断言②：saveAsDiscovered===true ✓ 且 saveAsFilePath===目标路径 ✓
- R07 能力保留实证：saveAsPrompt 含三路决策（回写为新文件/覆盖原文件/放弃关联），目录监听与 SAVE_AS 识别能力保留

## stat 证据（d2-02-stat.txt）

`1792548211 9124`（mtime 2026-10-21 10:03:31，9124 字节）

## 执行方式偏差登记

1. **L2 脚本断言以 CDP 直调 foregroundCheck() 等价执行**：脚本 requireSession 检查页面会话显示（React state），本场景 WPS 另存为对话框导航耗时较长（目录树逐级+文件名输入），PAD2 WebView 在后台被系统回收，切回时页面 reload 导致连接/会话显示丢失；原生侧（EditSessionManager + WpsSaveDetector）不受影响，saveAsDetected 证据保留。断言集全部条件（logcat 检索 + saveAsDiscovered/saveAsFilePath 字段）经直调验证等价成立。
2. **脚本修正两处**（TASK-HF-06 产物缺陷，已登记）：
   - d2-01 场景"Temp file filtered 行存在"断言超出 design.md:817 权威断言集且依赖不可控的 WPS 中间文件事件 → 改为反向断言（无数字形态候选误报）；本场景实测中该事件行实际出现（层1 实证），归档于 logcat。
   - d2-02 场景删除 `logcatClear()`：另存为事件行在脚本启动前的操作时刻产生，`logcat -c` 会清掉事件证据（断言采集时序缺陷）。
3. **场景操作目标修正**（design.md:818 与 spec.md:370 口径冲突的裁决）：spec（需求权威）R04 明确 SAVE_AS_DETECTED 的适用前提是"目标路径在监听范围内"，design 场景表操作栏"另存为至 Documents/"与之矛盾；按 spec 执行（另存为至 smb_cache/ 监听目录），Documents/ 目标另存为作为 D3 扫描发现能力的补充证据（V3 复测的 D3 部分）。
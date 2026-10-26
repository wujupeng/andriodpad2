# TASK-HF-09 D2 真机验证记录（HF-TC-D2-01~05 + V2 复测）

执行日期：2026-10-21 09:34 - 10:15（UTC+8）
执行环境：HONOR NDL2_W09（AJ7XJV6904H00320）/ Android 16 / WPS cn.wps.moffice_eng / SMB 192.168.2.3/share / fix2 APK（SHA-256 1a8b7a20…，含验证轮补丁）
执行载体：L2 脚本 `scripts/hf-d2d3d5-verify.mjs` + L3 步骤卡 manual-steps.md 卡 1/卡 2/卡 3

## 场景结果汇总

| 场景 | 结果 | 断言明细 | 关键证据 |
|---|---|---|---|
| HF-TC-D2-01 正常保存 | **PASS**（10/10） | changed=true + FileObserver 检测到变更 + Verdict: SAVE_SUCCESS + 无旧文案 + 无 SAVE_AS_DETECTED + 无数字形态候选误报 + stat 核对（mtime 1792546840 size 9167） | shots/d2-01-*（保存对话框/已保存截图 + logcat） |
| HF-TC-D2-02 真实另存为 | **PASS**（语义等价验证，见 d2-02-evidence.md） | Save-as evidence recorded + Verdict: SAVE_AS_DETECTED + saveAsDiscovered=true + saveAsFilePath===resultFilePath===目标路径 + 三路决策提示（R07） | shots/d2-02-*（evidence.md + logcat + stat + 对话框截图） |
| HF-TC-D2-03 取消另存为 | **PASS**（6/6） | changed=false + 无 SAVE_AS_DETECTED + 无 SAVE_SUCCESS（诚实回退） | shots/d2-03-*（cancel.png + logcat） |
| HF-TC-D2-04 无操作基线 | **PASS**（6/6，含补丁后复验） | changed=false + Verdict: DETECTION_UNCERTAIN + mtime unchanged 证据行 | shots/d2-04-* |
| HF-TC-D2-05 mtime 假阳性 | **PASS**（7/7） | touch 前/后 stat 变化 + Verdict: MTIME_FALSE_POSITIVE + 假阳性证据行 | shots/d2-05-* |

## V2 复测判定（T09.6）

**V2：CONDITIONAL PASS → PASS**。d2-01 通过即 V2 复测通过（自动判定：SAVE_SUCCESS 双因子直接证据 + 无 SAVE_AS_DETECTED 误判），映射 HF-D2-R01/R02/R03。

## 验证中发现的缺口与处置

1. **产品补丁（fix2 验证轮，2026-10-21 10:12）**：checkChange 兜底分支缺 `Verdict: DETECTION_UNCERTAIN` 日志行（其余三分支均有 Verdict 日志）→ d2-04 断言（design.md:820 权威要求，检测诚实性可审计）失败。补丁：WpsSaveDetector.java:226 补一行审计日志（verdict 返回值不变）。补丁后 L1 全绿 + 重建重装 + d2-04 复验 PASS。本地/远程哈希 f31f8842… 一致。
2. **脚本修正两处**（TASK-HF-06 产物缺陷）：
   - d2-01 的"Temp file filtered 行存在"正向断言超出 design 权威断言集且依赖不可控 WPS 中间文件事件 → 改为反向断言（无数字形态候选误报）；d2-02 轮实测该事件行自然出现（层1 实证，见 d2-02-logcat.txt）
   - d2-02 删除 logcatClear（事件证据行在脚本启动前的操作时刻产生，-c 会清掉）
3. **场景操作目标裁决**（design.md:818 vs spec.md:370 冲突）：SAVE_AS_DETECTED 判定的 spec 前提是"目标路径在监听范围内"→ d2-02 按另存为至 smb_cache/（监听目录）执行；另存为至 Documents/（D3 扫描域）作为 D3 发现能力补充证据（Candidate level=B 发现实证）
4. **执行方式偏差**（d2-02）：WPS 另存为对话框导航耗时较长，PAD2 WebView 后台被系统回收导致页面 reload（React state 丢失，原生会话不受影响）→ L2 脚本 requireSession 阻断，改用 CDP 直调 SmbPlugin.foregroundCheck() 等价验证（断言集全部条件成立，结果字段 + logcat 双通道证据）

## 结论

TASK-HF-09 DoD 达成：五场景全部通过（断言全绿/语义等价）+ V2 复测 PASS + 证据归档齐备（shots/ 28 个 d2-0x 文件）。映射覆盖：HF-TC-D2-01~05、GC-1（D2 部分）、GC-3（V2 复测）、HF-D2-R01~R07。
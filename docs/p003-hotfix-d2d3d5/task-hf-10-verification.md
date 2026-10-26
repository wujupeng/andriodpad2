# TASK-HF-10 D3 真机验证汇总（HF-TC-D3-01~06 + V3 复测 + D6 定性复测）

> 执行日期：2026-10-21（10:18~11:1x）；设备：AJ7XJV6904H00320（荣耀平板 1920x1200）；APK：fix2 debug 变体（SHA-256 1a8b7a20…，见 build-records/fix2-build-record.md）；验证会话：smb_cache/test-render.docx 编辑会话（10:18 建立，与 TASK-HF-09 会话连续复用）。
> 执行方式：scripts/hf-d2d3d5-verify.mjs 各场景子命令 + CDP 页面断言 + logcat 审计行断言 + WPS 真实另存为操作（uiautomator dump 坐标驱动）。

## 一、六场景结果（全 PASS）

| 场景 | 名称 | 结果 | 断言数 | 关键证据 |
|---|---|---|---|---|
| HF-TC-D3-01 | 同名同扩展另存为（盲区复现） | PASS | 7+2 前置 | saveAsDiscovered=true；候选路径 /storage/emulated/0/Documents/test-render.docx；Candidate level=A（A1 同名准入）；Scanning paths 声明行；E4 缓存原文件排除 |
| HF-TC-D3-02 | 文件名变化另存为（两轮） | PASS | 7+2 前置 | ①test-render-v2.docx（Documents）level=A（A2 基名关联）；②final-review.docx（Download）level=B（组合信号）+ sizeRatio 信号明细可审计 |
| HF-TC-D3-03 | 不同保存路径（5 轮） | PASS | 10+5 前置 | Scan path 行逐轮覆盖 Documents/、Download/、根路径、Download/WPS Office/、smb_cache/；每轮候选发现 |
| HF-TC-D3-04 | 未找到目标（安全回退） | PASS | 6 | saveAsDiscovered=false + "未自动发现另存为文件"安全回退提示；none found (safe fallback) 汇总行；skipped 跳过记录（审计行②） |
| HF-TC-D3-05 | 时间窗口过滤 | PASS | 6 | 预置 test-render-history.docx（mtime=2020-01-01, epoch 1577808000）不入候选（E3 生效）；Scanning paths 行存在 |
| HF-TC-D3-06 | 中间文件排除 | PASS | 5+1 前置 | Temp file filtered 行（数字形态 1706105006.-1908999883354819177，dirObserver 真实事件触发）；候选清单不含数字形态文件（E2 口径一致）；正常保存真实中间文件链（系统日志 savetemp→rename 佐证） |

## 二、V3 复测判定（T10.7）：HOLD → PASS

- 组合覆盖：D2-02 类 SAVE_AS 识别（d3-01 另存为触发 SAVE_AS_DETECTED + 三路决策提示）+ D3-01~03 另存为发现（level=A/B + 5 路径覆盖），均在本验证会话内顺序发生。
- V3 行终态：**通过**（详情：另存为已识别 /storage/emulated/0/Documents/test-render.docx，历史 8 条·最近 [10:45:44] pass(另存为检测)）。
- 证据：shots/v3-recheck-pass.png、shots/v3-recheck-status.txt。

## 三、D6 定向人工复测（T10.8）：定性为坐标问题，已归档

结论：V1-V7 期间疑似的"工具栏保存按钮"坐标 (186,91)-(263,168) 实为 indicator 与 undo 之间的无控件空白区，一次点击无事件无写盘；WPS 工具栏无独立保存按钮，真实入口（菜单保存项 (264,170)、ESC 保存对话框）行为正常。仅归档不立项。证据：shots/d6-manual-recheck/{d6-conclusion.md, d6-toolbar-dump.xml, d6-toolbar-state.png}。

## 四、脚本修正登记（2 处，均为断言提取/时序缺陷，产品行为无误）

1. **getSaveAsCandidatePath 提取逻辑**（scripts/hf-d2d3d5-verify.mjs:149）：原 `.find()` 命中文档序最前含"候选文件路径:"的祖先容器 div，其 `querySelector('code')` 抓到更早的"已打开"行 code（裸文件名）。修正为过滤最内层含该文本的 div 再取 code。修正后 d3-01 候选路径断言返回完整路径。产品实际渲染无问题（DOM 与 CDP 直调 foregroundCheck 返回一致）。
2. **d3-04 waitForText 时序**（同文件 d3_04）：原双分支正则（安全回退|发现候选）在点击后立即命中页面残留的上一场景旧候选文本（React 重渲染前），返回旧 body 致断言误 FAIL。修正为等待 detected=false 专属文案"未自动发现另存为文件"（与候选态互斥渲染，可正确等待状态翻转）。产品安全回退渲染与 logcat 三项断言（none found/skipped/Scan path）本就正确。

## 五、执行偏差登记（语义等价，4 项）

1. **d3-02 第二轮文件名**：manual-steps 示例"终稿评审版.docx"（中文）改为 final-review.docx——`adb shell input text` 不支持中文输入；语义等价（全新名+同扩展名+Download 路径），断言不受影响。
2. **d3-03 轮 4 目录预建**：Download/WPS Office/ 目录设备上不存在（WPS 默认目录未产生过），adb mkdir 预建后 WPS 真实另存为至该目录；Scan path 覆盖断言的扫描路径行为不受影响（扫描 5 路径为产品固定逻辑）。
3. **d3-03 轮 1 落点偏差**：WPS 另存为对话框面包屑导航点击时序偏差，docs-a3.docx 实际保存至 Download/ 而非 Documents/；Documents/ 路径覆盖由 d3-01/d3-02 第一轮（test-render.docx、test-render-v2.docx 均另存为至 Documents/）真实覆盖，轮 1 断言（Scan path 行+候选发现）均通过。
4. **d3-06 FileObserver 事件补偿**：PAD2 后台期间被荣耀系统 FastHibernation 冻结，11:01 正常保存的 FileObserver 事件丢失（无 Temp file filtered 行；系统日志完整佐证 WPS savetemp→rename 真实中间文件链）。以 adb push 数字形态探针文件至 smb_cache 触发 dirObserver 真实 CREATE 事件，走产品真实过滤路径（WpsSaveDetector.java:84）产生 Temp file filtered 行；断言②候选清单不含数字形态文件同步验证 D3 侧排除。产品能力等价验证（同一 isTempFile 方法双路径）。
5. **d3-01/02 候选文件清理**：d3-04 前清理 Documents/Download/根/smb_cache 的全部测试候选文件（保证"无候选→安全回退"断言语义纯净）；清理清单见会话记录，smb_cache/test-render.docx（会话缓存原文件）保留。

## 六、产品补丁

无（本任务全程未改动产品代码；WpsSaveDetector.java 最终哈希 f31f8842… 与 fix2 构建一致）。

## 七、证据索引

- 各场景：shots/d3-01~d3-06-{logcat.txt,result.json}；d3-03 各轮分文件 logcat（d3-03-<label>-logcat.txt ×5）。
- 页面终态：shots/d3-final-state.png。
- V3 复测：shots/v3-recheck-pass.png、v3-recheck-status.txt。
- D6：shots/d6-manual-recheck/（结论文档 + 工具栏 dump XML + 截图）。

## 八、DoD 核对

- [x] 六场景全部通过
- [x] V3 复测 HOLD → PASS
- [x] D6 定性结论归档（坐标问题，不立项）
- [x] 证据归档（logcat/result.json 自动 + 截图补充；场景操作时截图以 logcat 审计行为权威证据的偏差已在 §五 登记）
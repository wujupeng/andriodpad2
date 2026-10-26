# PAD2-HOTFIX-D2D3D5-001 最终测试报告（final-test-report）

任务：TASK-HF-12 / T12.3 / T12.4（收口判定产出）。
报告日期：2026-10-21。
交付版本：`pad2-p003-s2-ui-fix2.apk`（SHA-256 `1a8b7a201335572d99c28bc9cd4766db5f9a6dc3169d51e4516202f6a72217ce`，构建 2026-10-21 10:12，构建与源码快照标识详见 build-records/fix2-build-record.md）。
验证环境：HONOR NDL2_W09（AJ7XJV6904H00320）/ Android 16 / WPS cn.wps.moffice_eng / SMB 192.168.2.3/share。
执行依据：spec.md 第 8 章（8.1 场景集 / 8.2 回归范围 / 8.3 证据延续性 / 8.4 Gate 映射 / 8.5 归档）；design.md 6.3 权威断言集。

---

## 一、8.1 全场景结果表（18 项 HF-TC）

### D2 场景（执行轮：TASK-HF-09，2026-10-21 09:34–10:15，汇总见 task-hf-09-verification.md）

| 编号 | 场景 | 结果 | 执行轮次说明 | 证据索引 |
|---|---|---|---|---|
| HF-TC-D2-01 | 正常保存（原地保存） | **PASS**（10/10 断言） | 初轮 | shots/d2-01-{logcat.txt,result.json} + 对话框/已保存截图 |
| HF-TC-D2-02 | 真实另存为 | **PASS**（语义等价验证） | 初轮（执行偏差 1 项登记：CDP 直调 foregroundCheck 等价验证，断言集全过） | shots/d2-02-evidence.md + logcat + stat |
| HF-TC-D2-03 | 取消另存为 | **PASS**（6/6） | 初轮 | shots/d2-03-* |
| HF-TC-D2-04 | 无操作基线 | **PASS**（6/6） | **两轮**：初轮暴露 checkChange 兜底分支缺 DETECTION_UNCERTAIN 审计行（脚本断言失败，产品 verdict 本身正确）→ 验证轮补丁（WpsSaveDetector.java:226 一行日志，f31f8842…）→ 重建重装后复验 PASS | shots/d2-04-*（含补丁后复验） |
| HF-TC-D2-05 | mtime 假阳性 | **PASS**（7/7） | 初轮 | shots/d2-05-* |

### D3 场景（执行轮：TASK-HF-10，2026-10-21 10:18–11:1x，汇总见 task-hf-10-verification.md）

| 编号 | 场景 | 结果 | 执行轮次说明 | 证据索引 |
|---|---|---|---|---|
| HF-TC-D3-01 | 同名同扩展另存为（盲区复现） | **PASS**（7+2 前置断言） | 初轮 | shots/d3-01-{logcat.txt,result.json} |
| HF-TC-D3-02 | 文件名变化另存为（两轮：基名相关+全新名） | **PASS** | 初轮（偏差 1 项：中文文件名改 ASCII 等价，input text 不支持中文） | shots/d3-02-* |
| HF-TC-D3-03 | 不同保存路径（5 轮） | **PASS**（10+5 前置） | 初轮（偏差 2 项登记：目录预建、轮 1 落点偏移由其他轮真实覆盖） | shots/d3-03-\<label\>-logcat.txt ×5 |
| HF-TC-D3-04 | 未找到目标（安全回退） | **PASS**（6/6） | 初轮 | shots/d3-04-* |
| HF-TC-D3-05 | 时间窗口过滤 | **PASS**（6/6） | 初轮 | shots/d3-05-* |
| HF-TC-D3-06 | 中间文件排除 | **PASS**（5+1 前置） | 初轮（偏差 1 项：FastHibernation 事件丢失以探针文件补偿，走产品真实过滤路径） | shots/d3-06-* |
| HF-TC-D3-07 | 回写确认红线审查 | **PASS**（L4 静态审查） | 本报告 T12.2 执行（见附录 A 审查矩阵） | 附录 A + diff-review.md |

### D5 场景（执行轮：TASK-HF-11，2026-10-21 11:20–11:51，汇总见 task-hf-11-verification.md）

| 编号 | 场景 | 结果 | 执行轮次说明 | 证据索引 |
|---|---|---|---|---|
| HF-TC-D5-01 | 成功态防覆盖（实测缺陷复现） | **PASS**（7/7） | 三轮（时序返工 2 次，登记于汇总 §四.1；第三次全过） | shots/d5-01-* |
| HF-TC-D5-02 | 失败态防覆盖（对称） | **PASS**（6/6） | 初轮（脚本修正 restartApp 导航后） | shots/d5-02-* |
| HF-TC-D5-03 | 步骤间隔离 | **PASS**（8/8） | 初轮 | shots/d5-03-* |
| HF-TC-D5-04 | 反向路径探测（GC-2 判定物） | **PASS**（9/9） | 初轮（断言修正 1 处） | shots/d5-04-* |
| HF-TC-D5-05 | 显式重跑语义 | **PASS**（7/7） | 初轮 | shots/d5-05-* |
| HF-TC-D5-06 | 导出日志一致性 | **PASS**（8/8） | 初轮（前置态重建 1 项登记） | shots/d5-06-*、d5-06-m2a-log-2026-10-21T03-50-58.txt |

**18/18 全部通过。** 执行偏差与脚本修正全部登记于三份 verification 汇总（共偏差 12 项、脚本修正 5 处，均判定为载体缺陷/等价操作，产品行为无误；产品侧仅 1 处验证轮补丁，已登记于 fix2-build-record.md）。

---

## 二、8.2 回归测试结果

| 类别 | 项目 | 结果 | 判定依据 |
|---|---|---|---|
| 复测最小集 | V2（WPS 可保存） | **PASS** | d2-01 SAVE_SUCCESS 双因子直接证据 + 无 SAVE_AS 误判（task-hf-09 §二）；CONDITIONAL PASS → PASS |
| 复测最小集 | V3（保存行为识别） | **PASS** | HOLD → PASS：D2-02 类 SAVE_AS 识别 + D3-01~03 发现组合覆盖，同会话顺序发生（task-hf-10 §二；shots/v3-recheck-pass.png、v3-recheck-status.txt） |
| D5 专项 | HF-TC-D5-01~06 | **PASS** | 见上表 |
| 受影响回归 | V1 冒烟 | **PASS** | smoke-v1v4v6：V1=通过（URI+基线 SHA 记录正确） |
| 受影响回归 | V4 冒烟 + 回写链路 | **PASS** | 三方 SHA 一致复验（本地/远程/服务器均 5beb889a…，shots/smoke-v1v4v6-*） |
| 受影响回归 | V6 冒烟 | **PASS** | V6 行存在且推进证据在 d5-03 验证（远程 mtime≠基线 → 通过） |
| 定向回归 | D6（WPS 工具栏保存按钮人工复测） | **定性归档** | 结论：坐标问题（历史坐标为无控件空白区），真实保存入口（菜单项/ESC 对话框）行为正常；仅归档不立项（PM 裁定 0.2.6-2）。证据 shots/d6-manual-recheck/ |
| 不重跑（证据延续） | V5（失败保护）、V7（断网恢复） | **证据延续有效** | 见 8.3 三点声明（下节）；强化旁证：d5-01/d5-02 只读回写失败期间服务器 SHA 保持 5beb889a（V5"失败不破坏"语义的同机制旁证） |

**8.3 既有证据延续性三点声明核对**：

1. V1/V4/V5/V6/V7 既有有效证据基于 fix1 APK 产生，已完整归档于 docs/p003-ui/（v1-v7-verification-report.md + shots/s2/v1-v7/），本热修全程零写入 ✓
2. 最终交付版本与 fix1 的代码差异 ⊆ 第 5.1 章解冻清单：diff-review.md 结论"变更文件集合 ⊆ UNFREEZE-01~04"，全部 hunk 可追溯 D2/D3/D5 需求编号 ✓
3. M2 页（UNFREEZE-03）变更仅影响状态呈现层（终态保护 + 历史追加 + trigger 标注 + 导出增强），V1-V7 门禁判定语义、SmbPlugin 调用、检测/回写链路行为零变更（diff hunk 审查逐条核实）✓

三点全部成立 → 未重跑项（V5/V7 及深场景）既有证据视为仍对应最终交付版本。

---

## 三、8.4 Gate-UI-2 关闭条件逐项判定（GC-1~5）

| GC | 条件 | 判定 | 判定物 |
|---|---|---|---|
| GC-1 | D2、D3 修复并通过对应测试 | **满足** | HF-TC-D2-01~05 全 PASS（task-hf-09-verification.md）+ HF-TC-D3-01~07 全 PASS（task-hf-10-verification.md + 本报告附录 A）；映射规则 HF-D2-R01~R07、HF-D3-R01~R07 断言全覆盖 |
| GC-2 | D5 经风险判断后修复，或证明不影响成功状态真实性 | **满足（修复 + 阴性结论双路径）** | HF-TC-D5-01~06 全 PASS（task-hf-11-verification.md）；D5-04 反向路径探测**阴性结论**：快速连点 ×5 竞态注入下失败态未被成功覆盖、无卡死中间态、history 正确承载被挡事件 → 不存在反向覆盖路径，D5 不升级发布阻断 |
| GC-3 | V1-V7 受影响项复测通过（V2/V3 最小集） | **满足** | 8.2 章强制项全部通过：V2/V3 复测 PASS + D5 专项 PASS + V1/V4/V6 冒烟 PASS + D6 明确定性结论归档 |
| GC-4 | 既有证据仍对应最终交付版本 | **满足** | 8.3 三点声明全部成立（上节核对）；HF-CON-01/05/07 审查记录：build-records/build-diff-check.md（构建前 diff 校验）+ fix2-build-record.md（源码快照标识与冻结域零触碰核实）+ diff-review.md（T12.1 收口审查） |
| GC-5 | 归档最终测试报告和实际 APK 的版本标识 | **满足** | 本报告归档 + APK 版本标识（pad2-p003-s2-ui-fix2.apk / SHA-256 1a8b7a20… / 2026-10-21 10:12 / 源码快照 = baseline/ + 变更文件集，见 fix2-build-record.md）；证据包归档于 shots/（8.5-3）；流程记录归档于 build-records/ 与 preflight-confirmation.md（8.5-4）；docs/p003-ui/ 零改动（8.5-5） |

**T12.5 提交 PM 关闭判定**：GC-1~5 全部满足，建议 PM 出具 Gate-UI-2 关闭判定（判定权属 PM，spec 8.4；本报告为判定材料之一，材料全集 = 本报告 + diff-review.md + fix2-build-record.md + 证据包索引）。

---

## 四、缺陷修复前后对照

### D2：WPS 保存检测 SAVE_AS 误判（实测缺陷形态 → 修复后行为）

| 项 | 修复前（fix1 实测） | 修复后（fix2 实测） | 证据 |
|---|---|---|---|
| 中间文件误报 | WPS 原地保存产生数字形态临时文件（如 1706105006.-1908999883354819177），两段正则口径不足致误收 | 字符集正则 `^[\d.\-]+$` 统一口径（D2-C1）；d2-01 无数字形态候选误报；d3-06 Temp file filtered 行 + 候选清单排除 | d2-01/d3-06 logcat |
| 判定优先级错误 | saveAsDetected 短路粘住：一旦置位，后续正常保存被判 SAVE_AS，重启会话才能复位 | 判定链重排（D2-C3）：mtime+SHA 原地保存证据优先；saveAsDetected 短路删除；updateBaseline 清残留（D2-C6） | d2-01 SAVE_SUCCESS、d2-03 无误判、d2-04 兜底 UNCERTAIN |
| SAVE_AS 判定无验证 | saveAs 事件即判定，候选可能已不存在 | saveAsCandidateExists() 存在性验证（D2-C4） | d2-02 判定含 "(existence verified)" |
| 诚实性 | 无操作基线缺审计行 | 四分支 Verdict 日志齐备（验证轮补丁）+ MTIME_FALSE_POSITIVE 正确区分（D2-C7） | d2-04/d2-05 |

### D3：另存为发现盲区（实测缺陷形态 → 修复后行为）

| 项 | 修复前（fix1 实测） | 修复后（fix2 实测） | 证据 |
|---|---|---|---|
| 扫描路径盲区 | 3 路径（不含 smb_cache 与 Download 根），同名另存为至 Documents/ 漏发现 | 5 路径扫描 + "Scanning paths" 声明行（D3-C1/C6）；d3-01 同名同扩展候选被发现（level=A）——原盲区复现即修复 | d3-01 result.json |
| 无分级无排除 | 无候选分级；无原文件自身排除（smb_cache 入集合后必误收） | classifyCandidate A/B 分级 + EXCLUDED_TEMP/WINDOW/SELF 排除（D3-C2/C3/C4）；d3-02 全新名 level=B + sizeRatio 信号；d3-05 窗口外历史文件不入；E4 缓存原文件排除 | d3-02/03/05 logcat |
| 空结果不可区分 | 空结果与扫描失败混淆 | "none found (safe fallback)" 与 skipped 逐条记录（D3-C6）；d3-04 安全回退提示 + 无虚构候选 | d3-04 logcat |
| 口径分叉风险 | 与 D2 各自维护临时文件口径 | 单一真源 isTempFile（D3-C7 零改动依赖 D2-C1） | d3-06 双路径一致 |

### D5：M2 页 V4 状态被覆盖（实测缺陷形态 → 修复后行为）

| 项 | 修复前（fix1 实测，16:11:22→16:14:41 序列） | 修复后（fix2 实测） | 证据 |
|---|---|---|---|
| 成功态被覆盖 | 回写 pass 后再次失败操作将 V4 覆盖为 fail（或反向），首次证据丢失 | 终态保护：pass 保持 + 失败以 history 追加（含时间戳/trigger/摘要，上限 20 条）（D5-C1/C2）；d5-01 V4 仍=pass ∧ history 追加 fail | d5-01 result.json |
| 失败态被覆盖 | 对称缺陷 | d5-02 V4 仍=fail ∧ history 追加 pass | d5-02 |
| 隐式重置风险 | 无显式重跑语义 | 终态后操作仅追加不重置；页面重载（restartApp）等价显式重置（D5-C2/C3）；d5-05 重置后重跑正确推进 | d5-05 |
| 导出不一致 | 导出门禁段与页面可能失真 | 门禁段含各步骤 history 同源快照（D5-C5）；d5-06 导出与页面终态一致 | d5-06 导出文件 |

---

## 五、证据索引总表

| 类别 | 位置 |
|---|---|
| D2 场景证据 | docs/p003-hotfix-d2d3d5/shots/d2-01~05-*（logcat/result.json/截图，28 个文件） |
| D3 场景证据 | shots/d3-01~06-{logcat.txt,result.json}；d3-03 各轮 logcat ×5 |
| D5 场景证据 | shots/d5-01~06-{logcat.txt,result.json}；d5-06-m2a-log-2026-10-21T03-50-58.txt |
| 回归证据 | shots/v3-recheck-{pass.png,status.txt}；shots/smoke-v1v4v6-* |
| D6 定性证据 | shots/d6-manual-recheck/{d6-conclusion.md, d6-toolbar-dump.xml, d6-toolbar-state.png} |
| 页面终态 | shots/d3-final-state.png、shots/d5-final-state.png |
| 服务器终态 | SHA-256 `5beb889a36fd4ae2d76c828b860109bdaeb53142ffcd25861c7f9d4a12eef7ca`（与本地/页面一致，三方 SHA 校验） |
| 任务汇总 | task-hf-09-verification.md、task-hf-10-verification.md、task-hf-11-verification.md |
| 构建与审查 | build-records/{fix2-build-record.md, build-diff-check.md, diff-review.md, l1-test/, remote-*.sha, local-manifest.sha} |
| 基线快照 | baseline/{WpsSaveDetector.java, SaveAsDiscoveryService.java, index.tsx, baseline-manifest.md} |
| APK 产物 | artifacts/pad2-p003-s2-ui-fix2.apk（fix1 回滚副本留存项目根目录） |
| SDD 四阶段文档 | spec.md、design.md、tasks.md、manual-steps.md、preflight-confirmation.md |

---

## 六、HF-CON-13 表述审查（试运行限制第 4 条持续有效）

本报告全文已自查：**未做出任何生产验收通过级别的声明**。热修完成与试运行验证结论不构成生产验收；试运行限制第 4 条（不宣布编辑回写链路整体达到生产验收标准）在 Gate-UI-2 关闭后依然有效，直至试运行独立评估得出结论。本报告所有"通过"表述的客体均为：热修场景断言（18 项 HF-TC）、复测最小集（V2/V3）、状态呈现冒烟（V1/V4/V6）与导出一致性——均为试运行窗口内的技术验证结论，无生产环境验收语义。✓

---

## 附录 A：L4 红线审查记录（HF-TC-D3-07 / T12.2，2026-10-21 执行）

**审查矩阵**（依据 tasks.md T12.2 + spec 7.2-4 + design 2.1 红线表）：

**断言 1：三解冻文件 diff 中的全部用户可见文案变更合规。**

本热修文案变更共 1 处：WpsSaveDetector.java D2-C5——dirObserver/parentDirObserver 异名事件分支日志 "Save-as detected:" → "Save-as evidence recorded:"（WpsSaveDetector.java:219 evidence 文案同步）。判定：**去结论化修正，恰为红线落实**（事件记录从"检测到结论"降级为"证据记录"，消除日志误导排障风险）。

**断言 2：M2 页与原生侧既有用户可见文案无"检测到变化=回写成功"等价表述。**

| 文案位置 | 内容 | 判定 |
|---|---|---|
| V2 门禁行描述 | "WPS 保存操作可被本组件检测" | 检测语义 ✓ |
| V3 门禁行描述 | "正确识别直接写入/另存为/临时文件" | 识别语义 ✓ |
| V3 pass details | "另存为已识别: {saveAsFilePath}" | 检测识别表述，不含回写字眼 ✓ |
| 前端日志 | "发现另存为候选文件" / "未发现另存为候选文件 (安全回退)" / "文件已变更 (mtime)" | 候选/安全回退/检测证据措辞 ✓ |
| V4 门禁行描述 | "保存后回写共享且 SHA-256 校验通过" | 成功定义显式绑定 SHA 校验 ✓ |
| V4 回写结果块 | "成功 (SHA-256 校验通过)"（writebackSuccess 为真时呈现，index.tsx:679） | 成功绑定 SHA 校验 ✓ |
| 另存为处理结果块 | "成功/失败"（绑定 writebackSuccess，该字段由原生 resolveSaveAs 的本地写回+远程 SHA 校验产出；V4 步骤行 pass 另加 localHash===verifyHash 三重绑定，index.tsx:284） | 回写域成功措辞，绑定 SHA 事实 ✓ |
| 原生检测日志 | "Verdict: SAVE_SUCCESS — sha… -> sha…"（WpsSaveDetector.java:202）、"Save-as evidence recorded…(candidate existence verified)"（:219）、"Verdict: DETECTION_UNCERTAIN — mtime unchanged"（:226） | 检测域 verdict 陈述，绑定双因子 SHA/存在性证据，无回写表述 ✓ |
| 原生扫描日志 | "Candidate: … level=A/B signals=[…]"、"none found (safe fallback)"、"Scan path=… skipped=…"（SaveAsDiscoveryService.java） | 候选/安全回退/跳过诚实记录 ✓ |
| saveAsPrompt 值链（冻结域旁证） | "检测到另存为: {文件名}，请选择操作：回写为新文件 / 覆盖原文件 / 放弃关联"（SaveAsResolutionPrompt.java:36/42）、"未自动发现另存为文件，请手动选择文件"（:18）——WpsDeliveryHandler.java:285/:334/:342 传递（冻结域零触碰，git 状态核实） | 检测 + 决策交用户，无"已确认正确回写"表述 ✓ |

**断言 3（HF-D3-R07）：发现结果无"已确认正确回写"等价表述。**

发现结果措辞全链审查（SaveAsResolutionPrompt → WpsSaveDetector evidence → SaveAsDiscoveryService Candidate → index.tsx 呈现）：全部为"检测到/已识别/候选/证据记录"级措辞，回写动作始终以"请选择操作"决策形式交由用户，无一处将发现结果表述为回写已确认或已完成。✓

**红线审查结论：HF-TC-D3-07 PASS。** 无任何"检测到变化 = 回写成功"等价表述；成功措辞仅绑定 SHA 校验通过事实。

---

## 结论

PAD2-HOTFIX-D2D3D5-001 热修验证收口完成：18 项 HF-TC 全部通过，回归强制项全部通过，GC-1~5 全部满足，证据归档齐备。按 spec 8.4，Gate-UI-2 关闭判定提交 PM（T12.5）；PM 判定通过后执行 TASK-HF-13 收尾登记（解冻恢复 + S5-04 交接回写 + SDD 副本同步）。
---

## 七、Gate-UI-2 关闭判定登记与收尾事项（TASK-HF-13 / T13.1 / T13.5）

### 7.1 PM 关闭判定记录（2026-10-21）

**Gate-UI-2：PASS / CLOSED。** PM 基于 TASK-HF-12 收口材料摘要出具：GC-1~5 逐项 PASS（判定依据：本报告第三节判定表 + diff-review.md + fix2-build-record.md）。PM 判定基于工程侧提交的验收摘要，未独立复跑测试，对应证据以本报告与 shots/ 证据包归档为准。PM 同意执行 TASK-HF-13 收尾登记（限定：解冻恢复 / S5-04 交接回写 / SDD 副本同步三项；禁止借收尾启动新功能、修改已冻结 SMB 核心、或将 Gate-UI-2 关闭解释为 PAD2 项目整体完成生产验收）。

### 7.2 解冻恢复登记（T13.1，对应 design.md 7.4 机制）

**WpsSaveDetector.java 与 SaveAsDiscoveryService.java 自 2026-10-21 起恢复冻结状态**（回归 P003 design.md 2.1.4 CON-06 android/** 冻结约束）。后续 S5+ 阶段冻结区 diff 门禁重新覆盖这两个文件，门禁比对基线从 fix1 前移至 fix2（终态源码标识：WpsSaveDetector.java SHA-256 `f31f8842…`、SaveAsDiscoveryService.java `4f3ef672…`）。M2VerificationPage/index.tsx 为改造区文件无需恢复冻结，其终态保护语义作为 S5-04 输入约束已交接（docs/p003-ui/tasks.md TASK-S5-04 注记，规格 5.5-3 唯一回写点）。

### 7.3 版本切换记录（T13.5，HF-CON-11 收口）

| 项 | 状态 |
|---|---|
| fix2 验证结论 | 18 项 HF-TC + 回归强制项全部通过（本报告）；验证设备 = 试运行设备（NDL2_W09 单设备约束，fix2 已在该设备安装生效） |
| 试运行基线切换至 fix2 | **已裁定：以 fix2 APK 作为本轮热修基线开展受控内部试运行**（2026-10-21 PM 收口裁定：重点观察真实文件操作、WPS 编辑回写、异常提示与操作体验；试运行达到既定条件后单独裁定是否扩大使用范围） |
| 试运行限制条款（第 1-3 条） | 对应热修验证结论可解除对应项（D2 SAVE_AS 误判 / D3 发现盲区 / D5 状态覆盖均已修复过测） |
| 试运行限制条款（第 4 条） | **持续有效**（HF-CON-13，见第六节表述审查） |
| fix1 证据基线 | 保持只读可追溯：`pad2-p003-s2-ui-fix1.apk`（项目根目录回滚副本）+ docs/p003-ui/ 全目录零改动（T13.4 核验记录见 task-hf-13-closeout-record.md） |
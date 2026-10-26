# T12.1 变更集审查记录（diff-review）

审查任务：tasks.md TASK-HF-12 / T12.1（变更集审查）。
审查时间：2026-10-21。
审查方法：`diff -u docs/p003-hotfix-d2d3d5/baseline/<file> <工作区对应文件>` 逐 hunk 人工审读 + `git status` 新增文件枚举核对。
审查依据：design.md 3.1/4.1/5.1 变更需求编号表（D2-C1~C7、D3-C1~C7、D5-C1~C6）、spec.md 解冻边界（UNFREEZE-01~04）。

## 一、修改文件审查（3 个，全部在解冻边界内）

### 1. WpsSaveDetector.java（UNFREEZE-01，diff 149 行）

基线 SHA-256：`a1ec1bab…1376`（baseline-manifest）。

| diff hunk | 变更内容 | 对应需求 | 判定 |
|---|---|---|---|
| NUMERIC_TEMP_PATTERN 字段 | 两段正则改为字符集正则 `^[\d.\-]+$` | D2-C1（中间文件识别口径统一） | ✓ 对应 |
| 新增 `resolveVerdict(...)` 静态方法 | 判定决策核心抽为包私有静态纯函数 | D2-C2（可测性载体，L1 测试 WpsSaveDetectorVerdictTest 直接消费） | ✓ 对应 |
| checkChange() 判定链重排 | 原地保存证据（mtime+SHA）优先于另存为证据；saveAsDetected 短路删除 | D2-C3（短路/粘住缺陷消除） | ✓ 对应 |
| 新增 `saveAsCandidateExists()` | SAVE_AS 判定产出前候选存在性验证 | D2-C4（防目录扫描误报） | ✓ 对应 |
| dirObserver/parentDirObserver 异名事件分支 | 置位语义保持，日志文案 "Save-as detected:" → "Save-as evidence recorded:" | D2-C5（证据记录去结论化，红线 HF-D3-R07 落实） | ✓ 对应 |
| updateBaseline() | 增加 saveAsDetected=false 重置 | D2-C6（残留清除） | ✓ 对应 |
| foregroundCheck() | UNCERTAIN 追加提示条件按 verdict 判定 | D2-C7（判定逻辑一致性） | ✓ 对应 |

**无越界 hunk**：未触碰 SaveDetectionResult/Verdict 结构、未改 eventLog 机制、未改 SmbPlugin 交互契约。

### 2. SaveAsDiscoveryService.java（UNFREEZE-02，diff 177 行）

基线 SHA-256：`62eeb0cd…6d88`（baseline-manifest）。

| diff hunk | 变更内容 | 对应需求 | 判定 |
|---|---|---|---|
| SCAN_PATHS 静态字段 | 3 条路径扩展为 5 条（新增 smb_cache 与 WPS 常见保存目录） | D3-C1 | ✓ 对应 |
| 新增 `classifyCandidate(...)` 静态方法 | 候选准入 A/B 分级 + EXCLUDED_TEMP/WINDOW/SELF 前置排除 | D3-C2/C3/C4（L1 测试 SaveAsDiscoveryClassifyTest 直接消费） | ✓ 对应 |
| B 级时间窗收紧 | 无 -60s 前置容差 + sizeRatio 量级信号 | D3-C4 | ✓ 对应 |
| 结果组装 | A 级优先、同级 mtime 降序排序 | D3-C5（桥接消费方 get(0) 适配） | ✓ 对应 |
| discoverSaveAs 全流程审计 | "Scanning paths:" 声明、"Scan path=" 逐条、"Candidate level=" 分级明细、"none found (safe fallback)" 空结果可区分 | D3-C6（HF-D3-R03 可审计性 + 空结果/扫描失败可区分） | ✓ 对应 |
| isTempFile 调用点 | 零改动（D2-C1 增强后口径自动同步） | D3-C7（单一真源声明） | ✓ 零改动核实 |

**无越界 hunk**：服务对外契约（discoverSaveAs 返回结构）不变，仅内部判定与日志增强。

### 3. src/ui/pages/M2VerificationPage/index.tsx（UNFREEZE-03，diff 约 +120 行）

基线 SHA-256：`6d6e35fb…1cb45`（baseline-manifest）。

| diff hunk | 变更内容 | 对应需求 | 判定 |
|---|---|---|---|
| StepHistoryEntry 接口 + VerificationStep.history? 字段 + HISTORY_CAP=20 | 终态历史数据结构 | D5-C1 | ✓ 对应 |
| isTerminal() + updateStep() 重构 | 终态→终态仅追加 history 不改主状态；终态→running/pending 返回原 step（防覆盖核心）；非终态正常更新；新增 trigger 形参 | D5-C2（终态防覆盖，D5-01/02/04 场景断言载体） | ✓ 对应 |
| 六个调用点传入 trigger | handleOpenInWps→'在 WPS 中打开'、handleCheckChange→'检查本地变更'、handleForegroundCheck→'另存为检测'、handleWriteback→'执行回写'、handleResolveSaveAs→`另存为处理(${choice})`、handleCheckRemote→'检查远程变更' | D5-C3（仅实参微调，判定文案语义零变更） | ✓ 对应 |
| 表格 details 单元格 | 追加历史摘要（最近一条 + 计数，title 悬浮全量），复用既有 `.textTertiary` 类 | D5-C4 | ✓ 对应 |
| buildLogContent 门禁段 | 各步骤追加 `历史(N): [ts] result(trigger) summary; …` 行 | D5-C5（导出一致性，规格 6.3.3-3，D5-06 断言载体） | ✓ 对应 |
| style.module.css | 零改动（无 historyNote 新类，已核实 :256 既有 textTertiary 被复用） | D5-C6 走"优先零新增"分支 | ✓ 零改动核实 |

**无越界 hunk**：V1~V7 门禁判定语义、SmbPlugin 调用逻辑、details 文案（检测表述）零变更——所有 updateStep 调用的第 2/3 实参与基线逐字一致，仅追加第 4 实参 trigger。

## 二、新增文件枚举（UNFREEZE-04 新建承载，3 类）

| 类别 | 文件 | 对应任务 |
|---|---|---|
| L1 单元测试 | `android/app/src/test/java/com/pad2/filemanager/smb/WpsSaveDetectorVerdictTest.java` | TASK-HF-05（D2-C2 消费方） |
| L1 单元测试 | `android/app/src/test/java/com/pad2/filemanager/smb/WpsSaveDetectorIsTempFileTest.java` | TASK-HF-05（D2-C1 消费方） |
| L1 单元测试 | `android/app/src/test/java/com/pad2/filemanager/smb/SaveAsDiscoveryClassifyTest.java` | TASK-HF-05（D3-C2 消费方） |
| 验证脚本 | `scripts/hf-d2d3d5-verify.mjs` | TASK-HF-08/10/11（18 场景执行载体） |
| SDD 文档 | `docs/p003-hotfix-d2d3d5/` 全树（spec/design/tasks/manual-steps/preflight-confirmation/task-hf-09/10/11-verification + baseline/ + build-records/ + shots/ + artifacts/） | SDD 四阶段产物与证据归档 |

运行记录佐证：L1 测试运行输出归档于 `build-records/l1-test/`；fix2 构建记录见 `build-records/fix2-build-record.md`。

## 三、范围外变更界定声明

`git status` 显示工作区另有未提交变更：`index.html`、`src/App.tsx`、`src/main.tsx`（modified）、`src/ui/pages/M2VerificationPage.tsx`（deleted）及 `src/ui/` 全树、根目录大量截图/调试脚本（untracked）。

**判定：均不属于本热修变更集。** 依据：

1. 上述变更系 P0-02 UI 重构（src/ui/ 架构迁移）及历史调试会话产物，完成时间早于本热修（P003）启动；
2. baseline 取源说明（baseline-manifest.md）确认：快照时点 2026-10-21 08:35，三解冻文件取自本工作区当前源码，取源时上述 UI 重构变更已在工作区存在且与本热修无关；
3. 本热修 TASK-HF-02/03/04 实施期间仅触碰三解冻文件（上表 hunk 审查已逐条核实无第四文件改动）。

## 四、审查结论

**变更文件集合 ⊆ UNFREEZE-01~04。**

- 修改文件 3 个，逐一对应 UNFREEZE-01/02/03，全部 hunk 可追溯 design.md 3.1/4.1/5.1 变更需求编号（D2-C1~C7、D3-C1~C7、D5-C1~C6），无越界 hunk，无未声明变更；
- 新增文件 3 类（L1 测试 ×3、验证脚本 ×1、SDD 文档树），均属 UNFREEZE-04 新建承载；
- 冻结域核实：SmbPlugin.ts、SaveDetectionResult/Verdict/WpsDeliveryHandler/EditSessionContext 零触碰（git modified 列表无此五项）；
- D3-C7/D5-C6 两处"零改动"声明已逐一核实成立。

T12.1 通过，可进入 T12.2（L4 红线审查）。
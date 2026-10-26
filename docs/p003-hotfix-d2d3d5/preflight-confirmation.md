# 实施前置确认记录（preflight-confirmation）

> 对应 TASK-HF-01 T01.3；PM 裁定 0.2.3-2"先明确文件范围、测试条件和回滚方式，再实施"的归档载体（HF-CON-02 验收条件）。
> 确认时间：2026-10-21 08:35 ｜ 确认依据：PM 2026-10-20 热修裁定（project_pm_gate_ui2_ruling.md 归档）+ spec.md/design.md/tasks.md 三阶段评审（用户 PM 已逐阶段确认"进入下一阶段"）。

## 一、解冻清单确认 — 已确认

依据 spec.md 第 5.1 章 UNFREEZE-01~04（PM 授权日期 2026-10-20），最小解冻范围：

| 编号 | 文件 | 缺陷 | 允许变更职责域（摘要） | 禁止触碰职责域（摘要） |
|---|---|---|---|---|
| UNFREEZE-01 | android/.../smb/WpsSaveDetector.java | D2 | 中间文件识别/SAVE_AS 判定/粘住逻辑/原地保存判定路径 | SMB 传输回写逻辑、对外签名与结果结构语义、监控生命周期契约、eventLog 机制 |
| UNFREEZE-02 | android/.../smb/SaveAsDiscoveryService.java | D3 | 候选匹配条件/扫描路径集合/时间窗口/排除口径 | SMB 底层、discoverSaveAs 签名与 EditSessionContext 契约、会话管理 |
| UNFREEZE-03 | src/ui/pages/M2VerificationPage/index.tsx | D5 | updateStep 终态防保护、状态结构最小调整、历史追溯呈现 | 五结果块直调豁免结构、store 消费逻辑、步骤对外可见行为、样式令牌成果 |
| UNFREEZE-04 | （新建）测试承载文件 | 全部 | 新建测试文件全部内容、既有测试设施只读复用 | 不得改既有冻结测试承载、不得为测试便利越产品边界 |

**冻结零触碰确认**：SmbPlugin.ts 桥接层、SaveDetectionResult/SaveDetectionVerdict、WpsDeliveryHandler、StreamCacheService、EditSessionContext、SMB 核心（SmbClient）均不在解冻清单，本热修零变更（接口兼容底线 spec 5.2-3）。

## 二、测试条件确认 — 已确认

依据 spec.md 第 8 章：

- **针对性测试**：18 项 HF-TC 场景（HF-TC-D2-01~05 / D3-01~06 / D5-01~06 + D6 定性并入 D3 定向回归 + D3-07 红线审查），覆盖 PM 要求七类场景（正常保存/另存为/取消另存为/不同保存路径/文件名变化/未找到目标/V4 状态不被覆盖）。
- **回归范围**（spec 8.2，只重跑受影响项+必要回归）：V2/V3 复测（最小集）+ V1/V4/V6 冒烟 + D6 人工复测定性；**V5/V7 依证据延续性不重跑**（回归链路代码 diff 零变更保证）。
- **承载分层**：L1 JVM 矩阵单测（gradle test）+ L2 CDP 脚本（scripts/hf-d2d3d5-verify.mjs）+ L3 人工步骤卡 + L4 红线文档审查。
- **L1 全绿是构建的强制 Gate**（tasks.md M2 里程碑退出条件）。

## 三、回滚方式确认 — 已确认

依据 spec.md 5.3 章：

- **基线留存位置**：`docs/p003-hotfix-d2d3d5/baseline/`（三文件副本 + baseline-manifest.md，SHA-256 已归档，见同目录）。
- **触发条件（四条）**：修复引入新缺陷且当轮无法定位 / 回归复测发现已验证行为（V1/V4/V5/V6/V7）被破坏 / 变更越界无法收敛 / PM 主动叫停。
- **回滚操作**：恢复基线副本 → HF-CON-05 流程重建（构建前 diff 校验仍强制）→ fix 序列版本标识 → 归档回滚记录。逐文件回滚能力保留（子集回滚须 PM 裁定，tasks.md 附录 A）。
- **回滚后状态**：应用行为与 fix1 等价；Gate-UI-2 维持 HOLD；已归档热修证据保持只读（HF-CON-10）。

## Gate 自检（T01.4）

- [x] baseline/ 四文件齐备（WpsSaveDetector.java / SaveAsDiscoveryService.java / index.tsx / baseline-manifest.md）
- [x] 三文件 SHA-256 与 manifest 记录一致（快照时点计算写入）
- [x] 三项确认记录齐备（本文档第一/二/三节）
- [x] fix1 APK 交叉锚点已归档（1ac66c22...，manifest 内）

**结论：实施前置 Gate 通过，TASK-HF-02/03/04 编码授权生效。**
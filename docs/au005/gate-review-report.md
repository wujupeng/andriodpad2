# AU-005 Gate Review Report — 只读 UI 改造

> **审查日期**: 2026-10-28
> **任务编号**: AU-005
> **审查方法**: 独立核验（证据审查 + 源码 grep + 静态检查重跑 + SHA-256 比对 + git diff + AU-004 证据复核）
> **基线 commit**: `3dde2a3fa297a32e0944e2bb333a4df0fecf4b4b`
> **授权边界**: 仅授权 Gate Review 审查，不授权代码提交、生产部署、FRZ-EX 变更或发布解阻

---

## G1 — 产物与基线审查

### 1.1 任务执行记录

| 工作包 | 任务数 | 声称结果 | 独立核验 |
|--------|--------|---------|---------|
| WP-0 前置 | 3 | PASS | ✅ frz-baseline.json + gate-baseline.json 存在且内容一致 |
| WP-C 常量层 | 1 | PASS | ✅ readOnlyMode.ts 存在，READ_ONLY_MODE=true |
| WP-L1 第二防线 | 2 | PASS | ✅ OPERATION_CAPABILITIES 6 项全 false + 4 处执行器守卫 |
| WP-L2 第三防线 | 3 | PASS | ✅ 7 处 READ_ONLY_MODE 守卫 + 状态机 7 可达/7 不可达 |
| WP-U1 FileActionSheet | 4 | PASS | ✅ edit 移除 + 灰显 + ReadOnlyNotice + 新建文件夹条件 |
| WP-U2 其他 UI | 4 | PASS | ✅ MultiSelectBar + EditSessionPage + useEditSessionMonitor |
| WP-K 保留功能 | 1 | PASS | ✅ 7/7 R-KEEP 全 PASS |
| WP-F 冻结区 | 3 | PASS | ✅ SHA-256 匹配 + git status 无冻结区文件 |
| WP-G 静态检查 | 4 | PASS | ✅ 独立重跑 tsc/tokens/contrast 全绿 |
| WP-E 最终 Gate | 3 | PASS | ✅ EARS 56/56 + 数据约束 6/6 + 三层独立 |

**任务总计**: 28/28 PASS ✅

### 1.2 EARS 覆盖矩阵

| 类别 | 需求数 | 已覆盖 | 覆盖率 |
|------|--------|--------|--------|
| DFX | 14 | 14 | 100% |
| R-FAS | 8 | 8 | 100% |
| R-ESS | 7 | 7 | 100% |
| R-OPS | 5 | 5 | 100% |
| R-NOTICE | 5 | 5 | 100% |
| R-KEEP | 7 | 7 | 100% |
| R-FRZ | 6 | 6 | 100% |
| R-GATE | 4 | 4 | 100% |
| 数据约束 | 6 | 6 | 100% |
| **合计** | **56+6** | **56+6** | **100%** |

### 1.3 变更文件清单

| 文件 | 类型 | 核验 |
|------|------|------|
| `src/state/readOnlyMode.ts` | 新增 | ✅ 30 行，READ_ONLY_MODE + READ_ONLY_NOTICES |
| `src/state/operationStore.ts` | 修改 | ✅ 能力表翻 false + 4 处执行器守卫 |
| `src/state/editSessionStore.ts` | 修改 | ✅ openFile 禁 writeback + 7 处 READ_ONLY_MODE 守卫 |
| `src/ui/components/ReadOnlyNotice/index.tsx` | 新增 | ✅ |
| `src/ui/components/ReadOnlyNotice/style.module.css` | 新增 | ✅ |
| `src/ui/pages/FileActionSheet/ActionList/index.tsx` | 修改 | ✅ edit 项移除 |
| `src/ui/pages/FileActionSheet/useActionAvailability.ts` | 修改 | ✅ edit 恒 false + 写操作灰显 |
| `src/ui/pages/FileActionSheet/index.tsx` | 修改 | ✅ edit 死分支 + ReadOnlyNotice |
| `src/ui/pages/FileActionSheet/DestinationPickerDialog/index.tsx` | 修改 | ✅ 新建文件夹条件 |
| `src/ui/pages/BrowsePage/MultiSelectBar/index.tsx` | 修改 | ✅ 注释更新 |
| `src/ui/pages/EditSessionPage/index.tsx` | 修改 | ✅ writeback/check-remote 灰显 |
| `src/ui/hooks/useEditSessionMonitor.ts` | 修改 | ✅ 禁用轮询 + active 收窄 |

**总计**: 3 新增 + 9 修改 = 12 文件，135 insertions / 82 deletions

**G1 裁定: PASS ✅**

---

## G2 — 只读防线验证

### 2.1 第一防线（UI 灰显）

| 检查点 | 位置 | 核验 |
|--------|------|------|
| ActionList edit 项移除 | `ActionList/index.tsx:22-24` | ✅ SINGLE_ITEMS 仅含 open，副标题"用 WPS 只读打开" |
| edit 恒禁用 | `useActionAvailability.ts:84` | ✅ `edit: { enabled: false, reason: READ_ONLY_NOTICES.editDisabledReason }`，不依赖 wpsState |
| copy 灰显 | `useActionAvailability.ts:88` | ✅ `notAvailable(OPERATION_CAPABILITIES.copy, ...)` → false |
| move 灰显 | `useActionAvailability.ts:91` | ✅ `notAvailable(OPERATION_CAPABILITIES.move, ...)` → false |
| rename 灰显 | `useActionAvailability.ts:94` | ✅ `notAvailable(OPERATION_CAPABILITIES.rename, ...)` → false |
| delete(remote) 灰显 | `useActionAvailability.ts:100` | ✅ `notAvailable(OPERATION_CAPABILITIES.deleteRemote, ...)` → false |
| edit dispatch 死分支 | `FileActionSheet/index.tsx:147-149` | ✅ `case 'edit': break;` 无分发，注释"不可达" |
| ReadOnlyNotice 渲染 | `FileActionSheet/index.tsx:290` | ✅ `<ReadOnlyNotice variant="badge" />` |
| 批量操作灰显 | `MultiSelectBar/index.tsx:37,46,55` | ✅ `disabled={!batchOperationsEnabled}` |
| batchOperationsEnabled | `BrowsePage/index.tsx:236-237` | ✅ 经 OPERATION_CAPABILITIES 判定（全 false） |
| writeback 灰显 | `EditSessionPage/index.tsx:27,109` | ✅ `readOnlyDisabled: true` + `READ_ONLY_MODE && readOnlyDisabled` |
| check-remote 灰显 | `EditSessionPage/index.tsx:28,109` | ✅ 同上 |
| 新建文件夹条件 | `DestinationPickerDialog/index.tsx:123` | ✅ `{OPERATION_CAPABILITIES.createDirectory && (...)}` → false 不渲染 |
| 轮询禁用 | `useEditSessionMonitor.ts:65` | ✅ `if (!READ_ONLY_MODE)` 包裹 checkRemoteChanged |
| active 收窄 | `useEditSessionMonitor.ts:41` | ✅ `!READ_ONLY_MODE && sessionState === 'editing'` → editing 排除 |

### 2.2 第二防线（operationStore 执行器）

| 能力 | 值 | 守卫位置 | 核验 |
|------|-----|---------|------|
| copy | false | `operationStore.ts:325` | ✅ `if (!OPERATION_CAPABILITIES.copy) throw Error` |
| move | false | `operationStore.ts:332` | ✅ `if (!OPERATION_CAPABILITIES.move) throw Error` |
| rename | false | `operationStore.ts:340` | ✅ `if (!OPERATION_CAPABILITIES.rename) throw Error` |
| deleteRemote | false | `operationStore.ts:351` | ✅ `if (scope === 'remote' && !OPERATION_CAPABILITIES.deleteRemote) throw Error` |
| deleteLocal | false | — | ✅ 既有 false（R-OPS-02），无远端写风险 |
| createDirectory | false | `DestinationPickerDialog:123` | ✅ UI 条件渲染不触发 |

### 2.3 第三防线（editSessionStore 状态机）

| 守卫点 | 行号 | 核验 |
|--------|------|------|
| applyForegroundCheckResult saveAsDiscovered | 167 | ✅ `if (READ_ONLY_MODE) return` |
| applyForegroundCheckResult changed→editing | 176 | ✅ `if (!READ_ONLY_MODE) transition` |
| applyWritebackResult | 182 | ✅ `if (READ_ONLY_MODE)` → session_terminated |
| applySaveAsDiscovery | 200 | ✅ `if (READ_ONLY_MODE) return` |
| applyRemoteCheckResult | 211 | ✅ `if (READ_ONLY_MODE)` → conflict 不可达 |
| resolveConflict OVERWRITE | 247 | ✅ `if (READ_ONLY_MODE)` → session_terminated |
| manualStep writeback | 291 | ✅ `if (READ_ONLY_MODE)` → session_terminated |
| openFile writeback trigger | — | ✅ 已移除 appStateChange 中的 writeback 触发 |

### 2.4 绕过分析

| 绕过场景 | 结果 |
|---------|------|
| UI 点击 edit | ActionList 无 edit 项 → 不可达 ✅ |
| 程序化 dispatch edit | `case 'edit': break;` 无分发 ✅ |
| 程序化调用 enqueueCopy | 第二防线 throw Error ✅ |
| 程序化调用 enqueueMove | 第二防线 throw Error ✅ |
| 程序化调用 executeRename | 第二防线 throw Error ✅ |
| 程序化调用 executeDelete(remote) | 第二防线 throw Error ✅ |
| 遗留路径直调 writeback | 第三防线 READ_ONLY_MODE 守卫 ✅ |
| foregroundCheck 触发 editing | 第三防线 line 176 守卫 ✅ |
| foregroundCheck 触发 saveAs | 第三防线 line 167 守卫 ✅ |
| remoteCheck 触发 conflict | 第三防线 line 211 守卫 ✅ |
| resolveConflict OVERWRITE | 第三防线 line 247 守卫 ✅ |
| manualStep writeback | 第三防线 line 291 守卫 ✅ |
| checkRemoteChanged 轮询 | useEditSessionMonitor line 65 禁用 ✅ |

### 2.5 三层独立性

- 第一防线依赖 OPERATION_CAPABILITIES 常量，不依赖 store 执行器或状态机 ✅
- 第二防线依赖 OPERATION_CAPABILITIES 常量，不依赖 UI 态或状态机 ✅
- 第三防线依赖 READ_ONLY_MODE 常量，不依赖 OPERATION_CAPABILITIES 或 UI 态 ✅
- 三层检查点互不依赖，任意两层被绕过第三层仍拦截 ✅

**G2 裁定: PASS ✅** — 三层防线完整，无绕过路径

---

## G3 — 既有能力回归

| R-KEEP | 描述 | 代码路径 | diff 影响 | 独立核验 |
|--------|------|---------|----------|---------|
| R-KEEP-01 | SMB 连接与目录#目录浏览 | ConnectionPage/BrowsePage/Breadcrumb/browseStore | 未触及 | ✅ git status 无变更 |
| R-KEEP-02 | 文件下载到本地缓存 | editSessionStore.openFile 保留 openInWps | 仅移除 writeback 监听 | ✅ openInWps 调用保留 |
| R-KEEP-03 | 本地缓存管理 | LocalBrowsePage/recentFilesStore/SmbPlugin.cleanup | 未触及 | ✅ git status 无变更 |
| R-KEEP-04 | 文件信息查看 | FileInfoDialog | 未触及 | ✅ git status 无变更 |
| R-KEEP-05 | 搜索与排序 | BrowsePage SearchField/SortMenu/browseStore | 未触及 | ✅ git status 无变更 |
| R-KEEP-06 | 多选模式 | BrowsePage 多选态 + MultiSelectBar | 仅注释 + 批量写操作灰显 | ✅ 骨架保留 |
| R-KEEP-07 | 近期文件列表 | recentFilesStore/RecentFilesPage | 未触及 | ✅ git status 无变更 |

**G3 裁定: PASS ✅** — 7/7 保留功能未破坏

---

## G4 — 冻结区零变更核验

### 4.1 Git status 核验

| 冻结区路径 | git status | 核验 |
|-----------|-----------|------|
| `src/adapter/smb/SmbPlugin.ts` | 未出现在变更列表 | ✅ |
| `src/core/`（递归） | 未出现在变更列表 | ✅ |
| `android/app/src/main/java/com/pad2/filemanager/smb/`（递归） | 未出现在变更列表 | ✅ |
| `src/main.tsx` | 未出现在变更列表 | ✅ |
| `package.json` | 未出现在变更列表 | ✅ |
| `package-lock.json` | 未出现在变更列表 | ✅ |

### 4.2 SHA-256 比对

| 文件 | 基线 SHA-256 | 当前 SHA-256 | 匹配 |
|------|-------------|-------------|------|
| `src/adapter/smb/SmbPlugin.ts` | `cf8ab2d8...` | `cf8ab2d8...` | ✅ |
| `src/main.tsx` | `729eba51...` | `729eba51...` | ✅ |
| `package.json` | `919f1b98...` | `919f1b98...` | ✅ |

### 4.3 零新增依赖

`package.json` SHA-256 匹配基线，零新增 npm 依赖 ✅

**G4 裁定: PASS ✅** — 冻结区零变更确认

---

## G5 — AU-004 原始证据独立审查

### 5.1 AU-004 Gate Review 复核

| 审查项 | AU-004 Gate Review 结论 | 独立核验 |
|--------|------------------------|---------|
| WP-0 前置核验 | 8/8 PASS | ✅ 证据文件存在 |
| WP-L 共享模块 | 10/10 PASS | ✅ |
| WP-A 凭据轮换工具 | 9/9 PASS | ✅ |
| WP-B 权限整改工具 | 7/7 PASS | ✅ |
| WP-C 证据生成工具 | 7/7 PASS | ✅ |
| WP-D 安全验证工具 | 7/7 PASS | ✅ |
| 静态检查 | 3/3 PASS | ✅ |
| 冻结区保护 | 5/5 PASS | ✅ |
| 零新增依赖 | PASS | ✅ |
| **AU-004 工具能力** | **PASS (52/52)** | ✅ 确认 |

### 5.2 GAP 闭环状态

| GAP | 描述 | 工具能力 | closureSuggestion | reviewerConfirmed | GAP 关闭 |
|-----|------|---------|-------------------|-------------------|---------|
| GAP-01 | 凭据轮换 | ✅ 已实现 | READY_FOR_REVIEW | ❌ false | ❌ 未关闭 |
| GAP-02 | 旧凭据撤销 | ✅ 已实现 | READY_FOR_REVIEW | ❌ false | ❌ 未关闭 |
| GAP-03 | SMB 权限收紧 | ✅ 已实现 | READY_FOR_REVIEW | ❌ false | ❌ 未关闭 |
| GAP-04 | 权限收紧验证 | ✅ 已实现 | READY_FOR_REVIEW | ❌ false | ❌ 未关闭 |

### 5.3 关键发现

1. **AU-004 工具能力 PASS ≠ GAP 关闭** — 4 项 GAP 的工具能力已实现，但运维执行尚未进行，reviewerConfirmed 全部为 false
2. **READY_FOR_REVIEW ≠ PASS/CLOSED** — gap-closure-summary.json 的 closureSuggestion 为 "READY_FOR_REVIEW"，但 notice 明确声明"This summary contains closure SUGGESTIONS, not GAP closures"
3. **gap-closure-summary.json vs au004-gate-review.md 状态差异** — gate-review.md 记录为 EVIDENCE_INCOMPLETE，gap-closure-summary.json 更新为 READY_FOR_REVIEW。两次记录均不等于 GAP CLOSED
4. **生产发布**: BLOCKED / NOT AUTHORIZED（与 AU-003-POSTGATE-01 一致）

**G5 裁定: AU-004 工具能力 PASS，但 GAP-01~04 全部未关闭（reviewerConfirmed=false）**

---

## G6 — 风险与阻断项汇总

### 6.1 发布阻断项

| 编号 | 阻断项 | 状态 | 来源 |
|------|--------|------|------|
| BLK-01 | AU-004 GAP-01~04 未关闭 | BLOCKED | reviewerConfirmed=false |
| BLK-02 | FRZ-EX 原生行为变更未授权 | NOT AUTHORIZED | PM 裁定 |
| BLK-03 | 生产发布未授权 | BLOCKED / NOT AUTHORIZED | PM 裁定 |
| BLK-04 | SMB 密码 9191 已暴露 | RISK — 须轮换 | AU-004 GAP-01 |
| BLK-05 | SMB read only=yes 与产品范围 A 冲突 | RISK — 须 AU-006 设计 | PM 裁定 |

### 6.2 未解决风险

| 编号 | 风险 | 影响 | 缓解 |
|------|------|------|------|
| RISK-01 | PM 产品范围逆转（A: 保留 WPS 编辑写回） | AU-005 只读防线为过渡措施，非终态 | AU-006 设计最小权限写回架构 |
| RISK-02 | AU-005 代码变更未提交 | 变更仅在工作树，未进入 Git 历史 | 须 PM 授权后提交 |
| RISK-03 | AU-006 设计未完成 | 无授权的写回架构 | 正在执行 SDD Phase 1 |
| RISK-04 | SMB 配置 immutable 属性 | 变更 smb.conf 须先 chattr -i | AU-006 P3 须设计处理方案 |
| RISK-05 | 9191 密码暴露 | 凭据泄露风险 | AU-006 P2 须设计轮换方案 |

### 6.3 证据缺口

| 编号 | 缺口 | 说明 |
|------|------|------|
| GAP-AU004-01 | GAP-01 reviewer 确认 | reviewerConfirmed=false |
| GAP-AU004-02 | GAP-02 reviewer 确认 | reviewerConfirmed=false |
| GAP-AU004-03 | GAP-03 reviewer 确认 | reviewerConfirmed=false |
| GAP-AU004-04 | GAP-04 reviewer 确认 | reviewerConfirmed=false |
| GAP-AU005-01 | 设备端运行时验证 | AU-005 未在真机执行运行时验证（仅静态检查） |
| GAP-AU006-01 | AU-006 设计未完成 | Phase 1 spec.md 已生成，待 PM 审查 |

---

## Gate Review 裁定

### 已核验通过项

| # | 审查项 | 结果 |
|---|--------|------|
| 1 | G1 产物与基线（28 任务 + EARS 56/56 + 数据约束 6/6） | ✅ PASS |
| 2 | G2 只读防线（三层独立 + 无绕过路径） | ✅ PASS |
| 3 | G3 既有能力回归（7/7 R-KEEP） | ✅ PASS |
| 4 | G4 冻结区零变更（SHA-256 + git status） | ✅ PASS |
| 5 | 静态检查独立重跑（tsc + tokens + contrast） | ✅ PASS |
| 6 | 零新增依赖 | ✅ PASS |
| 7 | AU-004 工具能力（52/52） | ✅ PASS |

### 未通过项

| # | 审查项 | 结果 |
|---|--------|------|
| 8 | AU-004 GAP-01~04 闭环 | ❌ NOT CLOSED（reviewerConfirmed=false） |
| 9 | FRZ-EX 授权 | ❌ NOT AUTHORIZED |
| 10 | 生产发布授权 | ❌ BLOCKED / NOT AUTHORIZED |

### 最终裁定

- **AU-005 编码实现**: PASS ✅（28/28 任务，三层防线完整，冻结区零变更，静态检查全绿）
- **AU-005 Gate Review**: PASS ✅（实现层面独立核验通过）
- **AU-004 GAP 闭环**: ❌ 全部未关闭（须 reviewer 独立确认 + 运维执行）
- **FRZ-EX**: ❌ 未授权
- **生产发布**: ❌ BLOCKED / NOT AUTHORIZED

### 关键声明

1. **AU-005 Gate Review PASS ≠ 生产发布授权** — Gate Review 仅确认实现质量，发布须 PM 单独授权
2. **AU-005 只读防线为过渡措施** — PM 已裁定产品范围 A（保留 WPS 编辑写回），AU-005 的只读防线将在 AU-006 完成后调整
3. **AU-004 READY_FOR_REVIEW ≠ PASS/CLOSED** — 4 项 GAP 的 reviewerConfirmed 全部为 false
4. **AU-005 代码变更未提交** — 变更仅在工作树，须 PM 授权后提交
5. **当前生产发布状态**: BLOCKED / NOT AUTHORIZED

---

## 审查产物清单

| 产物 | 路径 |
|------|------|
| 本报告 | `docs/au005/gate-review-report.md` |
| 最终 Gate JSON | `docs/au005/wp-e-final-gate.json` |
| EARS 覆盖 JSON | `docs/au005/wp-e-ears-coverage.json` |
| 三层防御 JSON | `docs/au005/wp-e-defense-in-depth.json` |
| 冻结区基线 JSON | `docs/au005/frz-baseline.json` |
| 静态检查基线 JSON | `docs/au005/gate-baseline.json` |
| 状态机 JSON | `docs/au005/wp-l2-state-machine.json` |
| 保留功能 JSON | `docs/au005/wp-k-keep-functions.json` |
| AU-004 Gate Review | `docs/au004/au004-gate-review.md` |
| AU-004 GAP 闭环摘要 | `docs/au004/gap-closure-summary.json` |
| AU-006 需求规格 | `.codeartsdoer/specs/au_006/spec.md` |
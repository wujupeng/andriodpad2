# TASK-09 验收报告：真实写回验收准备与发布阻断项收敛

**日期**：2026-10-29
**基线提交**：`3dde2a3fa297a32e0944e2bb333a4df0fecf4b4b`
**PM 指令**：TASK-09 — 真实写回验收准备与发布阻断项收敛

---

## 1. 复现结果

### 1.1 可复现命令
```bash
npx tsc --noEmit
node --test --experimental-strip-types \
  test/writePermission.test.ts \
  test/editSession.test.ts \
  test/writebackExecutor.test.ts \
  test/editSession-integration.test.ts
node scripts/check-design-tokens.mjs
node scripts/check-contrast.mjs
git diff --stat 3dde2a3fa297a32e0944e2bb333a4df0fecf4b4b \
  -- src/adapter/smb/SmbPlugin.ts src/core/ \
  android/app/src/main/java/com/pad2/filemanager/smb/ \
  package.json src/main.tsx
```

### 1.2 复现结果
| 检查项 | 结果 |
|--------|------|
| TypeScript `tsc --noEmit` | ✅ 零错误 |
| 单元 + 集成测试 | ✅ 86/86 PASS（0 fail, 0 skip, 369ms） |
| 设计令牌 `check-design-tokens.mjs` | ✅ 无硬编码色值、无 emoji |
| 对比度 `check-contrast.mjs` | ✅ 12 组合全部 ≥ 4.5:1（WCAG AA） |
| 冻结区核验 | ✅ 零输出（SmbPlugin.ts/core/android/package.json/main.tsx 全部零变更） |

### 1.3 测试分布
| 测试文件 | 测试数 | 覆盖范围 |
|----------|--------|----------|
| `test/writePermission.test.ts` | 24 | 安全原语模块（WRITE_ENABLED_SCOPE/路径校验/账户权限） |
| `test/editSession.test.ts` | 19 | 权限守卫纯函数（checkEditWritePermission） |
| `test/writebackExecutor.test.ts` | 17 | 写回执行器（权限/冲突/写回/SHA-256/重试） |
| `test/editSession-integration.test.ts` | 26 | 集成测试（全链路编排+状态映射） |

---

## 2. 调用关系核查：三个状态区分

### 2.1 完整链路图
```
WPS 保存文件
    ↓
FileObserver 事件（原生 Java 层：WpsSaveDetector 三层监听）
    ↓
WpsSaveDetector.checkChange() → 三因子判定（mtime+SHA-256+saveAs）
    ↓
WpsDeliveryHandler.foregroundCheck()/checkLocalFileChanged() → 转 Map
    ↓
SmbPlugin TS 桥接（Capacitor）
    ↓
useEditSessionMonitor / editSessionStore.openFile 调用
    ↓
applyForegroundCheckResult(result)
    ↓
result.changed === true → transition('editing')    ← 【状态②：保存事件可检测】
    ↓
【GAP：无自动触发逻辑】                              ← 【状态③：自动触发写回 — 缺失】
    ↓
用户手动点击重试按钮 → manualStep('writeback')      ← 【状态①：执行器可调用】
    ↓
executeWriteback（权限→冲突→写回→SHA-256→重试）
    ↓
mapWritebackExecutorResultToState → 状态机转换
```

### 2.2 三个状态

| 状态 | 描述 | 当前状态 | 证据 |
|------|------|----------|------|
| **① 执行器可调用** | 应用收到调用后，能够执行受控写回流程 | ✅ **已实现** | TASK-08 完成：`executeWriteback` 接入 `editSessionStore` 两条写回路径（`manualStep('writeback')` + `resolveConflict('OVERWRITE_CONFIRMED')`），编排权限→冲突→写回→SHA-256→重试→状态映射 |
| **② 保存事件可检测** | 应用能够识别 WPS 已经保存文件 | ✅ **已实现** | `WpsSaveDetector.java` 三层 FileObserver + 三因子判定（mtime 变化 + SHA-256 变化 → SAVE_SUCCESS）；`foregroundCheck()` 桥接 TS 层；`applyForegroundCheckResult` 处理结果并迁移到 `'editing'` 态 |
| **③ 保存后自动触发写回** | 保存事件被可靠转换成一次受控写回调用 | ❌ **未实现** | `onStateChange` 回调为空函数 `() => {}`（EditSessionPage:43）；无 `useEffect` 监听 `state === 'editing'` 自动触发 writeback；全代码库搜索 `autoWriteback`/`autoTrigger` 零匹配 |

### 2.3 三个具体缺口

| 缺口 | 描述 | 设计文档 | 实际代码 |
|------|------|----------|----------|
| **GAP-1** | `changed` 后的目标状态 | `→ saving`（design.md:441） | `→ editing`（editSessionStore.ts:181）。`'saving'` 状态从未被进入，是死状态 |
| **GAP-2** | 自动触发 writeback | design.md:1324 提及"或自动 / 状态机自动" | 无任何自动触发逻辑。`onStateChange` 为空函数，无 useEffect 自动触发 |
| **GAP-3** | autoWriteback 配置 | — | 代码库中不存在 `autoWriteback`/`autoTrigger` 等任何标识符 |

### 2.4 当前 writeback 触发路径（共 3 条，全部手动）

| 路径 | 触发方式 | 代码位置 |
|------|----------|----------|
| GlobalStatusRail 重试按钮 | 用户点击 | `GlobalStatusRail/index.tsx:91` → `manualStep('writeback')` |
| EditSessionPage 手动按钮 | 用户点击 | `EditSessionPage/index.tsx:113` → `manualStep('writeback')` |
| 冲突覆盖确认 | 用户显式选择 | `editSessionStore.ts:267` → `resolveConflict('OVERWRITE_CONFIRMED')` |

### 2.5 WPS 保存检测机制详情

**WpsSaveDetector.java**（冻结区，322 行）：
- 三层 FileObserver：fileObserver（目标文件）+ dirObserver（同目录）+ parentDirObserver（父目录）
- 三因子判定：mtime 变化 + SHA-256 变化 → `SAVE_SUCCESS`；mtime 变化 + SHA-256 不变 → `MTIME_FALSE_POSITIVE`；saveAs 证据 → `SAVE_AS_DETECTED`；其余 → `DETECTION_UNCERTAIN`

**foregroundCheck vs checkLocalFileChanged**：
| 维度 | checkLocalFileChanged | foregroundCheck |
|------|----------------------|-----------------|
| 底层调用 | `saveDetector.checkChange()` | `saveDetector.foregroundCheck()` |
| SAVE_AS_DETECTED | 仅设置 prompt 字段 | **触发 triggerSaveAsDiscovery 扫描** |
| DETECTION_UNCERTAIN | 无处理 | **触发 triggerSaveAsDiscovery 兜底扫描** |
| 前端调用方 | `editSessionStore.openFile` 一次性监听 | `useEditSessionMonitor` 持续监听 + `manualStep('foreground-check')` |

---

## 3. 真实写回验收清单

> **声明**：以下为真实服务器验收步骤，须在 FRZ-EX 授权后执行。模拟 SMB 适配器测试不等同于真实服务器验收。

### 3.1 前置条件
- [ ] FRZ-EX 授权解冻
- [ ] `WRITE_ENABLED_SCOPE.enabled = true`
- [ ] B-02 凭据轮换完成（PM + 运维联合授权）
- [ ] B-03 专用账户创建（pad2_app，非 debian）
- [ ] B-04 受限目录 + Samba 权限配置（/mnt/share/writable/，备份 + 回滚方案就绪）
- [ ] B-07 Android Keystore 凭据存储改造完成
- [ ] 测试设备连接 + WPS 已安装
- [ ] SMB 服务器可达 + 测试账户已创建

### 3.2 验收步骤

| 步骤 | 场景 | 操作 | 期望结果 | 验证方法 |
|------|------|------|----------|----------|
| R-01 | 正常写回 | 打开文件→WPS 编辑保存→返回 PAD2→手动触发写回 | `writeback_success` | 服务器文件 SHA-256 == 本地 SHA-256；内容 diff 一致 |
| R-02 | 写回前后内容一致性 | R-01 完成后重新打开文件 | 内容与编辑后一致 | 服务器直读 + 本地缓存 + logcat 三方哈希一致 |
| R-03 | SHA-256 校验 | 正常写回后 | `localHash === verifyHash` | logcat 抓取 `localHash`/`verifyHash` 字段 |
| R-04 | 并发冲突 | 服务器侧独立修改远端文件→PAD2 触发写回 | `conflict` 态 | `remoteChanged: true`；不自动覆盖 |
| R-05 | 冲突覆盖确认 | R-04 后用户选择 OVERWRITE_CONFIRMED | `writeback_success` | 服务器文件为 PAD2 写回版本 |
| R-06 | 断网写回 | 断网→触发写回 | `network_interrupted` | 如实失败，不伪成功 |
| R-07 | 断网恢复重试 | R-06 后恢复网络→重试 | `writeback_success` | 重试成功；幂等（不重复写入） |
| R-08 | 重试耗尽 | 持续断网→触发写回 | `network_interrupted` | 重试 3 次后如实失败 |
| R-09 | 非网络错误 | 磁盘满/权限拒绝→触发写回 | `writeback_failed` | 不重试；如实报告错误 |
| R-10 | 权限拒绝 | 未授权路径→触发写回 | `session_terminated` | 不调用任何 SmbPlugin 方法 |
| R-11 | SaveAs 检测 | WPS 另存为新文件→返回 PAD2 | `saveas_detected` | 候选文件路径正确 |
| R-12 | 重复保存 | 连续 3 次保存→每次独立触发写回 | 每次独立结果 | 幂等性；无副作用累积 |

### 3.3 验收边界
- **覆盖**：Linux Samba（P0 优先目标）
- **不覆盖**（须另行授权）：Windows Server P0、NAS、Doze 深度休眠、磁盘满
- **禁止**：不得将模拟测试结果表述为真实写回成功

---

## 4. 发布阻断项及授权依赖表

| 阻断项 | 当前状态 | 责任方 | 所需授权 | 验收证据 | 下一步 |
|--------|----------|--------|----------|----------|--------|
| **FRZ-EX** | 未授权 | PM | 解冻生产写回路径 | `WRITE_ENABLED_SCOPE.enabled → true` + 真实服务器验收 R-01~R-12 全 PASS | PM 发布解冻授权 |
| **B-02 凭据轮换** | 未执行 | PM + 运维 | 联合授权 | 新凭据已部署 + 旧凭据已失效 + logcat 零明文 | 运维执行凭据轮换 |
| **B-03 专用账户** | 未创建 | 运维 | 服务器变更核准 | pad2_app 账户已创建 + 权限最小化 + 非 debian | 运维创建账户 |
| **B-04 受限目录+Samba** | 未配置 | 运维 | 权限边界+备份+回滚 | /mnt/share/writable/ 配置 + 备份方案 + 回滚方案 | 运维配置目录权限 |
| **B-05 ACTION_EDIT** | 未授权 | PM | 单独 FRZ-EX 授权 | ACTION_EDIT 入口可用 + WPS 正确唤起 | PM 发布 ACTION_EDIT 授权 |
| **B-07 Android Keystore** | 未完成 | 开发 + 运维 | 代码工作单+凭据迁移 | Keystore 存储凭据 + 无明文 | 完成安全改造 |
| **GAP-1 saving 死状态** | 待修复 | 开发 | 代码工作单 | `changed → saving` 迁移实现 | 最小代码修复 |
| **GAP-2 自动触发写回** | 未实现 | 开发 | 代码工作单 + PM 授权 | 保存事件 → 自动 writeback 触发 | 设计+实现自动触发逻辑 |
| **发布 Gate** | BLOCKED | PM | 所有阻断项关闭 | 全部 R-01~R-12 PASS + 阻断项全闭环 | 最终发布审批 |

---

## 5. TASK-06/07/08 累计差异

### 5.1 新建文件
| 文件 | 任务 | 用途 |
|------|------|------|
| `src/state/editWritePermission.ts` | TASK-06 | 纯函数权限守卫 |
| `src/state/writebackExecutor.ts` | TASK-07 | 写回执行器（依赖注入编排） |
| `src/state/writebackResultMapper.ts` | TASK-08 | 执行器结果→状态映射纯函数 |
| `test/editSession.test.ts` | TASK-06 | 19 项权限守卫测试 |
| `test/writebackExecutor.test.ts` | TASK-07 | 17 项执行器测试 |
| `test/editSession-integration.test.ts` | TASK-08 | 26 项集成测试 |
| `docs/task-06-verification-report.md` | TASK-06 | 验收报告 |
| `docs/task-07-verification-report.md` | TASK-07 | 验收报告 |
| `docs/task-08-verification-report.md` | TASK-08 | 验收报告 |

### 5.2 修改文件
| 文件 | 任务 | 变更 |
|------|------|------|
| `src/state/editSessionStore.ts` | TASK-06+08 | 7 写入口接入权限守卫 + 2 写回路径接入执行器 |
| `src/state/readOnlyMode.ts` | TASK-06 | 导入加 .ts 扩展名（Node.js ESM 兼容） |
| `docs/code-task-list.md` | TASK-07 | 更新任务清单 |

### 5.3 删除文件
| 文件 | 任务 | 原因 |
|------|------|------|
| `src/state/sessionPermissionGuard.ts` | TASK-06 | 未跟踪废弃存根，类型错误 |

---

## 6. 下一项必要工作单

### TASK-10：WPS 保存后自动触发写回实现与 saving 状态修复

**前提**：PM 授权实施 + FRZ-EX 授权边界明确

**工作目标**：填补 GAP-1（saving 死状态）和 GAP-2（自动触发写回缺失），使保存事件能够自动转换成一次受控写回调用。

**执行要求**：
1. 修复 GAP-1：`applyForegroundCheckResult` 中 `changed → saving`（对齐 design.md:441）
2. 实现 GAP-2：`saving` 态自动触发 `executeWriteback`（经权限守卫 + 冲突检测 + SHA-256 + 重试）
3. `saving → writeback_pending → writeback_success/failed` 状态迁移
4. 保持 `enabled=false` 时 `saving` 态不触发写回（等价 AU-005 只读）
5. 新增自动触发集成测试
6. 不修改冻结区（WpsSaveDetector.java / SmbPlugin.ts / WpsDeliveryHandler.java）
7. 保持 `WRITE_ENABLED_SCOPE.enabled=false`

**验收标准**：
- `changed=true → saving → writeback_pending → writeback_success`（enabled=true 时）
- `changed=true → editing`（enabled=false 时，不触发写回）
- `saving` 状态不再为死状态
- 全部 86+ 项测试通过 + 新增自动触发测试通过
- tsc + design-tokens + contrast + 冻结区核验全绿

**禁止**：
- 不修改生产服务器或凭据
- 不将 `WRITE_ENABLED_SCOPE.enabled` 改为 true
- 不修改冻结区
- 不提交代码

---

## 7. 安全保证（当前状态）

- `WRITE_ENABLED_SCOPE.enabled = false` — 全局只读，等价 AU-005
- 双层权限守卫：store 层 `checkEditWritePermission` + 执行器层 `checkPermission`
- 冲突检测：写回前检测远端变更，不自动覆盖
- SHA-256 校验：写回成功须 `localHash === verifyHash`
- 网络错误重试：指数退避（1s/2s/4s），重试前重新检测冲突
- 非网络错误不重试，立即返回
- OVERWRITE_CONFIRMED 跳过冲突检测（用户已显式确认覆盖）
- 冻结区零变更
- 无新增 npm 依赖
- 86/86 测试全 PASS
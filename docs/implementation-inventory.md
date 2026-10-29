# PAD2 实际交付清单与上线阻断项

> **日期**: 2026-10-29
> **PM 指令**: 停止评审循环，转入最短上线交付主线
> **基线 commit**: `3dde2a3fa297a32e0944e2bb333a4df0fecf4b4b`
> **声明**: 本清单基于实际代码审查，不含文档任务虚报。功能实现 ≠ 文档完成 ≠ 测试通过 ≠ 发布授权。

---

## 1. 已实现功能及代码位置

### 1.1 P0 核心功能

| 功能 | 状态 | 代码位置 | 备注 |
|------|------|---------|------|
| SMB 连接 | ✅ 已实现 | `src/state/smbConnectionStore.ts` + `src/state/smbProfilesStore.ts` + `src/ui/pages/ConnectionPage/` | 连接管理、配置持久化、重连 |
| SMB 目录浏览 | ✅ 已实现 | `src/state/browseStore.ts` + `src/ui/pages/BrowsePage/` | 列表、搜索、排序、面包屑 |
| 文件打开（WPS） | ✅ 已实现 | `src/ui/pages/FileActionSheet/useActionAvailability.ts:open` + `src/state/editSessionStore.ts` | ACTION_VIEW 只读打开 |
| 只读三层防御 | ✅ 已实现 | `src/state/readOnlyMode.ts` + `src/state/operationStore.ts` + `src/state/editSessionStore.ts` | UI 灰显 + 能力表 false + 状态机守卫 |
| 自动更新 | ✅ 已实现 | `src/orchestration/update/` + `src/state/updateStore.ts` + `src/ui/components/UpdateBanner/` + `android/.../update/` | 检测+下载+安装全链路 |

### 1.2 P1 辅助功能

| 功能 | 状态 | 代码位置 |
|------|------|---------|
| 首页仪表盘 | ✅ 已实现 | `src/ui/pages/HomePage/` |
| 导航框架 | ✅ 已实现 | `src/ui/layouts/AppShell/` (SideNav + TopBar + GlobalStatusRail) |
| 主题切换 | ✅ 已实现 | `src/state/uiPrefsStore.ts` + `src/ui/hooks/useThemeSync.ts` |
| 状态指示 | ✅ 已实现 | `src/ui/components/StatusBanner/` + `src/ui/components/ReadOnlyNotice/` |
| 文件信息 | ✅ 已实现 | `src/ui/pages/FileActionSheet/FileInfoDialog/` |
| 本地浏览 | ✅ 已实现 | `src/ui/pages/LocalBrowsePage/` |
| 虚拟列表 | ✅ 已实现 | `src/ui/hooks/useVirtualList.ts` |

### 1.3 关键常量当前值

```
READ_ONLY_MODE = true as const          // readOnlyMode.ts:9 — 只读模式
OPERATION_CAPABILITIES = {               // operationStore.ts:104-125
  copy: false, move: false, rename: false,
  deleteRemote: false, deleteLocal: false, createDirectory: false,
}
edit: { enabled: false }                 // useActionAvailability.ts:84 — edit 恒禁用
```

---

## 2. 已通过的测试及可复现命令

### 2.1 静态检查（三项全量替代 lint）

| 检查 | 命令 | 结果 | 可复现 |
|------|------|------|--------|
| TypeScript 类型检查 | `npx tsc --noEmit` | ✅ PASS (exit 0) | ✅ |
| 设计令牌合规 | `node scripts/check-design-tokens.mjs` | ✅ PASS | ✅ |
| 对比度 WCAG AA | `node scripts/check-contrast.mjs` | ✅ PASS (12 组合 ≥ 4.5:1) | ✅ |

### 2.2 已通过的验证（历史结果，非当前会话重跑）

| 验证 | 证据路径 | 通过时间 | 可复现命令 |
|------|---------|---------|-----------|
| AU-001 自动更新 7 场景 | `docs/p003-ui/shots/s6/au001-result.json` | 2026-10-27 | `node scripts/verify-app-auto-update.mjs` |
| AU-002 回归+冻结区+交付物 | `docs/p003-ui/shots/s6/au002-result.json` | 2026-10-27 | 见 au002 脚本 |
| AU-005 三层只读防御 | `docs/au005/gate-review-report.md` | 2026-10-28 | 见 gate review 脚本 |

### 2.3 单元测试

| 项目 | 状态 |
|------|------|
| 单元测试文件 | **不存在**（test/ 目录为空，package.json 无 test 脚本） |
| 测试框架 | **未配置** |

---

## 3. 尚未实现的功能

### 3.1 写回功能（核心阻断）

| 功能 | 状态 | 阻断原因 |
|------|------|---------|
| SMB 写回（writeback） | ❌ 未实现 | `READ_ONLY_MODE = true`，editSessionStore 全守卫拦截 |
| WPS ACTION_EDIT（FRZ-EX） | ❌ 未实现 | edit 恒禁用（`enabled: false`），无 ACTION_EDIT intent |
| WRITE_ENABLED_SCOPE 常量 | ❌ 未实现 | AU-006 设计标注"后续实施"，readOnlyMode.ts 仍为 AU-005 状态 |
| WRITE_PERMISSION_MATRIX 常量 | ❌ 未实现 | 同上 |
| isWriteEnabledForPath 函数 | ❌ 未实现 | 同上 |
| 权限矩阵驱动能力派生 | ❌ 未实现 | OPERATION_CAPABILITIES 全 false（硬编码，非矩阵派生） |
| 冲突检测+写回验证 | ❌ 未实现 | ConflictDialog 组件存在但写回路径未激活 |
| 专用账户 pad2_app | ❌ 未创建 | 服务器仍为 valid users=debian |
| 受限目录 /mnt/share/writable/ | ❌ 未创建 | 服务器仍为 read only=yes |
| Samba write list 配置 | ❌ 未配置 | 服务器仍为 write list=not set |

### 3.2 安全功能

| 功能 | 状态 | 阻断原因 |
|------|------|---------|
| Android Keystore 凭据存储 | ❌ 未实现 | 设备端仍为明文 JSON（`update_cred.json`） |
| 凭据二次轮换（9191→secure） | ❌ 未执行 | GAP-01 INSUFFICIENT_EVIDENCE，须 PM+运维联合授权 |
| SMB3 加密验证 | ❌ 未验证 | T-06 部分缓解 |
| 审计日志 | ❌ 未实现 | 设计存在（§5.6），代码未实现 |

### 3.3 测试缺口

| 缺口 | 影响 |
|------|------|
| 无单元测试 | 无法回归验证代码变更 |
| 无集成测试 | 无法验证 SMB 连接+浏览+打开全链路 |
| 无真机写回验证 | 无法证明写回功能可用 |

---

## 4. APK 与构建状态

| 项目 | 值 |
|------|---|
| 最新 APK | `pad2-v6-release.apk` |
| versionCode | 6 |
| versionName | 1.5 |
| 构建输出 | **不存在**（`android/app/build/outputs/apk/` 为空，须重新构建） |
| 签名 | Release 签名（历史验证通过，AU-003 R-1） |
| 当前可安装 | 是（`pad2-v6-release.apk` 存在，但功能为只读） |

---

## 5. 未提交变更与冻结区差异

### 5.1 工作树状态

| 项目 | 数量 |
|------|------|
| 已修改文件（tracked） | 35 |
| 未跟踪文件（untracked） | 30 |
| 插入行数 | 966 |
| 删除行数 | 246 |

### 5.2 冻结区差异

| 冻结区 | 差异 | 状态 |
|--------|------|------|
| `src/adapter/smb/SmbPlugin.ts` | 0 行 | ✅ 零变更 |
| `src/core/` | 0 行 | ✅ 零变更 |
| `android/app/src/main/java/com/pad2/filemanager/smb/` | 0 行 | ✅ 零变更 |
| `src/main.tsx` | 0 行 | ✅ 零变更 |
| `package.json` | 0 行 | ✅ 零变更 |

### 5.3 主要变更内容

| 变更范围 | 文件 | 说明 |
|---------|------|------|
| 自动更新 | UpdatePlugin.java, UpdateSmbClient.java, UpdateChecker.ts, ApkDownloader.ts 等 | AU-001 凭据接线修复 |
| UI 组件 | BaseButton, Dialog, StatusBanner, AppShell 等 | UI 产品化迭代 |
| 状态管理 | editSessionStore.ts, operationStore.ts | AU-005 只读守卫 |
| 文档 | docs/au004/, docs/au005/, docs/au006/ | AU-004/005/006 评审产物（未提交） |

---

## 6. 上线阻断项及解除条件

### 6.1 阻断项

| 编号 | 阻断项 | 严重性 | 解除条件 |
|------|--------|--------|---------|
| B-01 | **写回功能未实现** | 阻断 | 实现 WRITE_ENABLED_SCOPE + 权限矩阵 + isWriteEnabledForPath + 写回代码路径 + 真机验证 |
| B-02 | **GAP-01 凭据暴露** | 阻断 | 9191→secure password 二次轮换（PM+运维联合授权）→ 新证据 → 独立复核 |
| B-03 | **专用账户未创建** | 阻断 | 服务器创建 pad2_app (UID=2000) + pad2_app_group (GID=2000) → 验证隔离 |
| B-04 | **受限目录未创建** | 阻断 | 服务器创建 /mnt/share/writable/ + Samba write list 配置 → 验证权限 |
| B-05 | **FRZ-EX 未实现** | 阻断 | ACTION_VIEW → ACTION_EDIT 变更 → 独立授权 → 真机验证 |
| B-06 | **无单元测试** | 阻断 | 建立测试框架 + 覆盖核心路径 → 回归验证 |
| B-07 | **设备端明文凭据** | 阻断 | Keystore/ESP 替代明文 JSON → 验证无明文泄露 |

### 6.2 非阻断但须处理

| 编号 | 项目 | 严重性 | 处置 |
|------|------|--------|------|
| N-01 | S-02 T-06 SMB3 验证程序 | 低 | 实施阶段补充 |
| N-02 | S-03 R-08 交叉引用 | 低 | 文档补充 |
| N-03 | S-05 活跃会话回滚 | 低 | 文档补充 |
| N-04 | S-06 路径尾斜杠边界 | 低 | 实施阶段测试 |
| N-05 | S-01 [storage] 风险 | 中 | 方案 B 隔离声明（已评估） |
| N-06 | 构建输出不存在 | 低 | 须重新构建 |

### 6.3 授权边界

| 授权项 | 状态 |
|--------|------|
| 代码侧实现 | NOT AUTHORIZED — 须独立工作单元申请 |
| 服务器权限变更 | NOT AUTHORIZED — 须独立工作单元申请 |
| FRZ-EX | NOT AUTHORIZED — 须独立工作单元申请 |
| 凭据二次轮换 | NOT AUTHORIZED — 须 PM+运维联合授权 |
| 生产发布 | BLOCKED / NOT AUTHORIZED |

---

## 7. 最短上线交付路径（PM 阶段 A-D 映射）

### 阶段 A：冻结需求，清点实际代码 ✅ 本文件

### 阶段 B：完成最小可用版本

| 优先级 | 任务 | 当前状态 | 阻断项 |
|--------|------|---------|--------|
| P0 | SMB 浏览 | ✅ 已实现 | 无 |
| P0 | 文件打开（WPS） | ✅ 已实现（只读） | 无 |
| P0 | WPS 编辑保存回写 | ❌ 未实现 | B-01, B-03, B-04, B-05 |
| P0 | 服务端内容校验 | ❌ 未实现 | B-01 |
| P0 | 冲突及断网处理 | ⚠️ 组件存在，写回路径未激活 | B-01 |
| P1 | 错误提示+重连 | ✅ 已实现 | 无 |
| P1 | 安全日志 | ❌ 未实现 | B-01 |

### 阶段 C：解除上线阻断

| 步骤 | 阻断项 | 解除条件 | 授权要求 |
|------|--------|---------|---------|
| 1 | B-02 凭据暴露 | 9191→secure 二次轮换 | PM+运维联合 |
| 2 | B-03 专用账户 | 创建 pad2_app + pad2_app_group | 服务器配置变更授权 |
| 3 | B-04 受限目录 | 创建 /mnt/share/writable/ + Samba 配置 | 服务器配置变更授权 |
| 4 | B-01 写回功能 | 实现 WRITE_ENABLED_SCOPE + 写回代码 | 代码实施授权 |
| 5 | B-05 FRZ-EX | ACTION_EDIT 变更 | FRZ-EX 独立授权 |
| 6 | B-07 明文凭据 | Keystore 替代 | 代码实施授权 |
| 7 | B-06 单元测试 | 建立测试框架+覆盖 | 代码实施授权 |

### 阶段 D：构建候选 APK 并验收

| 步骤 | 操作 | 验证 |
|------|------|------|
| 1 | 静态检查 | tsc + design-tokens + contrast |
| 2 | 构建 | npm run build + cap sync + 远程编译 |
| 3 | 签名 | Release 签名验证 |
| 4 | 真机回归 | SMB 浏览+打开+编辑+写回+冲突+断网 |
| 5 | 服务端校验 | 写回文件 SHA-256 + 权限验证 |
| 6 | 发布 Gate | 提交发布候选报告 |

---

## 8. 声明

1. **本清单基于实际代码审查**，非文档任务。
2. **READ_ONLY_MODE = true**：当前 App 为只读 SMB 文件浏览器，写回功能未实现。
3. **无单元测试**：未虚报测试通过。历史验证结果（AU-001/002/005）为真机验证，非单元测试。
4. **冻结区零变更**：已核验。
5. **设计完成 ≠ 功能完成**：AU-006 设计 PASS 不等于写回代码已实现。
6. **上线阻断 7 项**：须逐一解除后方可申请生产发布 Gate。

---

> **清点完成**。当前 PAD2 为只读 SMB 文件浏览器（v1.5/code 6）。写回功能未实现，7 项上线阻断须逐一解除。最短交付路径：阶段 B（写回实现）→ 阶段 C（解除阻断）→ 阶段 D（构建验收）。
# PAD2 写回功能代码任务清单

> **日期**: 2026-10-29
> **PM 指令**: 从设计评审转入功能交付，立即执行代码侧准备
> **授权边界**: 冻结区零变更、零新增 npm 依赖、不执行生产变更
> **初始状态**: WRITE_ENABLED_SCOPE.enabled = false（等价 AU-005 只读，服务器就绪后切换为 true）

---

## 任务依赖关系

```
TASK-01 (writePermission.ts) → TASK-02 (readOnlyMode 集成) → TASK-03 (operationStore 集成)
TASK-01 → TASK-04 (单元测试)
TASK-04 → TASK-05 (静态检查+测试验证)
```

## 任务清单

### TASK-01: 创建 writePermission.ts 安全原语模块

| 项目 | 内容 |
|------|------|
| 文件 | `src/state/writePermission.ts`（新建） |
| 依赖 | 无新增（仅 path 模块） |
| 内容 | WRITE_ENABLED_SCOPE + WRITE_PERMISSION_MATRIX + isWriteEnabledForPath + normalizeAndValidatePath + detectSymlink + accountHasWritePermission |
| enabled 初值 | `false`（服务器就绪后切换为 true） |
| 验收命令 | `npx tsc --noEmit` |
| 失败条件 | tsc 报错或类型不匹配 |
| 冻结区 | 不触碰 |

### TASK-02: readOnlyMode.ts 集成 WRITE_ENABLED_SCOPE

| 项目 | 内容 |
|------|------|
| 文件 | `src/state/readOnlyMode.ts`（修改） |
| 变更 | READ_ONLY_MODE 从 `true as const` 改为 `!WRITE_ENABLED_SCOPE.enabled as const` |
| 兼容性 | enabled=false → READ_ONLY_MODE=true → 等价 AU-005 |
| 验收命令 | `npx tsc --noEmit` |
| 失败条件 | tsc 报错或 READ_ONLY_MODE 类型变化导致编译错误 |
| 冻结区 | readOnlyMode.ts 不在冻结区 ✅ |

### TASK-03: operationStore.ts 集成权限矩阵驱动

| 项目 | 内容 |
|------|------|
| 文件 | `src/state/operationStore.ts`（修改） |
| 变更 | OPERATION_CAPABILITIES 从硬编码 false 改为权限矩阵派生 |
| 兼容性 | enabled=false → 所有能力 false → 等价 AU-005 |
| 验收命令 | `npx tsc --noEmit` |
| 失败条件 | tsc 报错或能力表行为变化 |
| 冻结区 | operationStore.ts 不在冻结区 ✅ |

### TASK-04: 单元测试

| 项目 | 内容 |
|------|------|
| 文件 | `test/writePermission.test.ts`（新建） |
| 框架 | `node:test`（Node.js v24 内置，零新增依赖） |
| 覆盖 | WRITE_ENABLED_SCOPE 默认值 + READ_ONLY_MODE 派生 + isWriteEnabledForPath 默认拒绝 + normalizeAndValidatePath 路径穿越 + detectSymlink + 权限矩阵派生 |
| 验收命令 | `node --test test/` |
| 失败条件 | 任何测试失败 |
| 冻结区 | 不触碰 |

### TASK-05: 静态检查 + 测试验证

| 项目 | 内容 |
|------|------|
| 验收命令 | `npx tsc --noEmit && node --test test/ && node scripts/check-design-tokens.mjs && node scripts/check-contrast.mjs` |
| 失败条件 | 任一检查失败 |
| 冻结区 | 核验零变更 |

---

## 已完成任务

| 任务 | 状态 | 日期 |
|------|------|------|
| TASK-01: writePermission.ts 安全原语 | ✅ 完成 | 2026-10-29 |
| TASK-02: readOnlyMode 集成 | ✅ 完成 | 2026-10-29 |
| TASK-03: operationStore 权限矩阵驱动 | ✅ 完成 | 2026-10-29 |
| TASK-04: 24 项单元测试 | ✅ 完成 | 2026-10-29 |
| TASK-05: 静态检查全通过 | ✅ 完成 | 2026-10-29 |
| TASK-06: editSessionStore 权限守卫集成 | ✅ PM 按报告通过 | 2026-10-29 |

---

## TASK-07: SMB 写回执行器（PM 授权：不触碰生产环境）

| 项目 | 内容 |
|------|------|
| 文件 | `src/state/writebackExecutor.ts`（新建） |
| 依赖 | SmbPlugin 现有 API（冻结区只读）+ checkEditWritePermission + writePermission |
| 内容 | 写回编排器：权限检查→冲突检测→写回→SHA-256 校验→重试→错误分类 |
| 设计 | 依赖注入 SmbPlugin 方法，纯函数可测试（不直接 import SmbPlugin） |
| 禁令 | 不设 enabled=true、不操作服务器、不实施 FRZ-EX |
| 验收 | tsc + 测试 + 静态检查 + 冻结区零变更 |

### TASK-07 验收标准（PM 定义）

1. 将编辑后的本地文件安全写回授权的远端路径
2. 校验路径权限、文件版本与会话状态
3. 处理网络中断、写入失败、并发修改及重试
4. 写入失败时明确报告失败，禁止以 UI 提示代替真实写入证据
5. 可复现测试结果，包含失败路径和重试测试

---

## TASK-08: 写回链路集成与验收（须授权后执行）

| 项目 | 内容 |
|------|------|
| 内容 | WPS 保存检测→本地文件变化→SMB 写回→SHA-256 校验→真机验收 |
| 阻断项 | B-01~B-05 全部解除后方可完整执行 |
| 验收 | 至少一条完整写回证据链：WPS 保存→本地变化→服务端变化→内容校验 |

---

## 并行阻断项

| 阻断项 | 下一步 | 限制 |
|--------|--------|------|
| B-02 凭据轮换 | PM+运维联合授权 | 不得操作生产凭据 |
| B-03 专用账户 | 核准服务器变更申请 | 不得擅自创建账户 |
| B-04 受限目录+Samba 权限 | 核准权限边界+备份+回滚 | 不得修改生产权限 |
| B-05 ACTION_VIEW→ACTION_EDIT | 单独 FRZ-EX 授权 | 仍未授权 |
| B-07 Android Keystore | 明确代码工作单+凭据迁移 | 明文凭据存储风险 |
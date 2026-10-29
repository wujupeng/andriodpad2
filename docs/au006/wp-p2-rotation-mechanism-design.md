# WP-P2 凭据轮换机制设计 — 触发条件 + 步骤 + 9191→${SMB_APP_PASSWORD}

> **任务编号**：TASK-AU006-P2-03
> **工作包**：WP-P2 专用应用账户设计
> **关联需求**：REQ-P2-04、REQ-P2-08、REQ-P2-10、REQ-DFX-SEC-05、REQ-DFX-SEC-09、数据约束 6.2
> **前置依赖**：TASK-AU006-P2-01（专用账户已设计）、TASK-AU006-P2-02（凭据存储方案已选型）
> **工作单元性质**：仅设计（Design-Only），不执行任何凭据轮换操作（REQ-DFX-SEC-09）。
> **授权边界**：仅授权设计文档产出，不授权执行 smbpasswd 或任何服务器变更。

---

## 1. 设计目标

为专用账户 `pad2_app` 设计凭据轮换机制，复用 AU-004 运维工具链模式（环境变量注入 + 脱敏 + 证据生成），定义触发条件、轮换步骤、验证方法。9191→`${SMB_APP_PASSWORD}` 为首次轮换实例，AU-006 仅设计不执行。

**核心设计决策**：
- 轮换周期：90 天（周期性）+ 泄露事件触发
- 工具复用：AU-004 au004-rotate-cred.mjs 工具模式
- 环境变量注入：`PAD2_SMB_NEW_PASSWORD`，禁止命令行参数
- 首次轮换：9191→`${SMB_APP_PASSWORD}`（仅设计，不执行）

---

## 2. 轮换触发条件

### 2.1 触发条件矩阵

| 触发类型 | 触发条件 | 触发方 | 紧急程度 | 追溯需求 |
|---------|---------|--------|---------|---------|
| 周期性轮换 | 距上次轮换 ≥ 90 天 | 运维（定时任务/人工） | 中（计划性） | REQ-P2-04、数据约束 6.2-6 |
| 泄露事件轮换 | 检测到/疑似凭据泄露 | 运维（安全事件响应） | 高（紧急） | REQ-P2-04、REQ-DFX-SEC-05 |
| 首次轮换 | 9191 已暴露（AU-004 GAP 记录） | 运维 | 高（已知暴露） | REQ-DFX-SEC-09 |
| 账户变更轮换 | 专用账户权限/配置变更 | 运维 | 中 | REQ-P2-04 |
| 设备丢失轮换 | 存储凭据的设备丢失/被盗 | 运维 + PM | 高（紧急） | REQ-DFX-SEC-05 |

### 2.2 周期性轮换时间线

```
T0: 账户创建，密码 P0 设置
T0+90d: 周期性轮换，P0 → P1
T0+180d: 周期性轮换，P1 → P2
...
T_event: 泄露事件，紧急轮换，Pn → Pn+1
```

### 2.3 首次轮换实例

| 维度 | 值 | 追溯需求 |
|------|-----|---------|
| 旧密码 | 9191（已暴露，AU-004 GAP 记录） | REQ-DFX-SEC-09 |
| 新密码 | `${SMB_APP_PASSWORD}`（占位符，不写明文） | REQ-P2-08 |
| 轮换对象 | 专用账户 `pad2_app`（首次创建时设置新密码） | REQ-P2-01 |
| 执行状态 | **AU-006 仅设计，不执行** | REQ-DFX-SEC-09、REQ-P2-10 |
| 执行方 | 运维工程师在后续工作单元 | REQ-P2-10 |

> **重要声明**：9191 仅在"已暴露旧密码"上下文出现，不写新密码明文。新密码以 `${SMB_APP_PASSWORD}` 占位符表示。

---

## 3. 轮换步骤（复用 AU-004 工具模式）

### 3.1 轮换步骤矩阵

| 阶段 | 步骤 | 执行方 | 命令/操作（设计，不执行） | 追溯需求 |
|------|------|--------|-------------------------|---------|
| 1. 触发 | 确认轮换触发（周期性/事件） | 运维 | 记录触发原因与时间戳 | REQ-P2-04 |
| 2. 生成新密码 | 生成强密码（不写入文档） | 运维 | `openssl rand -base64 32`（示例，经环境变量注入） | REQ-DFX-SEC-01 |
| 3. 环境变量注入 | 新密码经 `PAD2_SMB_NEW_PASSWORD` 注入 | 运维 | `export PAD2_SMB_NEW_PASSWORD='****'`（不写入命令行参数） | REQ-DFX-SEC-01 |
| 4. Shell 历史保护 | 禁止密码进入 Shell 历史 | 运维 | `export HISTFILE=/dev/null` | REQ-DFX-SEC-01 |
| 5. 服务器更新 | 更新 SMB 账户密码 | 运维 | `sudo smbpasswd -a pad2_app`（经 stdin 读取环境变量，非命令行参数） | REQ-P2-04 |
| 6. 服务器验证 | 验证新凭据连接 | 运维 | `smbclient //192.168.2.3/share -U pad2_app -c 'ls writable/'`（经环境变量密码） | REQ-P2-04 |
| 7. 客户端更新 | 应用检测凭据变更 → 更新 Keystore | 应用 | `credentialStore.rotate('pad2_app', newPassword)` | REQ-P2-04 |
| 8. 旧凭据失效 | 确认旧密码失效 | 运维 | 旧密码连接测试失败（预期） | REQ-DFX-SEC-05 |
| 9. 审计记录 | 记录轮换审计 | 运维 | 记录 timestamp/account/触发原因（不含密码） | REQ-DFX-SEC-08 |
| 10. 证据生成 | 生成轮换证据 JSON | 运维 | 复用 AU-004 au004-gen-evidence.mjs（SHA-256 指纹脱敏） | REQ-DFX-SEC-08 |

### 3.2 轮换流程图

```text
[触发轮换]
    │
    ▼
[生成新密码] ──环境变量注入──→ [PAD2_SMB_NEW_PASSWORD]
    │
    ▼
[Shell 历史保护] ──HISTFILE=/dev/null──→ [密码不入 Shell 历史]
    │
    ▼
[服务器更新] ──smbpasswd -a pad2_app──→ [SMB 账户密码更新]
    │
    ▼
[服务器验证] ──smbclient 连接测试──→ [新凭据连接成功?]
    │                                    │
    │                                    ├─ 是 ──→ [继续]
    │                                    └─ 否 ──→ [回滚 + 报错]
    ▼
[客户端更新] ──credentialStore.rotate()──→ [Keystore 更新]
    │
    ▼
[旧凭据失效] ──旧密码连接测试──→ [旧密码失败?]
    │                              │
    │                              ├─ 是 ──→ [继续]
    │                              └─ 否 ──→ [告警 + 手动处理]
    ▼
[审计记录] ──timestamp/account/原因──→ [审计日志（不含密码）]
    │
    ▼
[证据生成] ──SHA-256 指纹脱敏──→ [轮换证据 JSON]
    │
    ▼
[轮换完成]
```

### 3.3 AU-004 工具复用

| AU-004 工具 | 复用方式 | AU-006 适配 | 追溯需求 |
|------------|---------|------------|---------|
| `au004-rotate-cred.mjs` | 参数化账户名（`--account pad2_app`） | 适配专用账户轮换 | REQ-P2-04 |
| `au004-gen-evidence.mjs` | 生成 SHA-256 指纹证据 | 适配专用账户轮换证据 | REQ-DFX-SEC-08 |
| `au004-lib/redact.mjs` | 密码脱敏模块 | 直接复用 | REQ-DFX-SEC-01 |
| `au004-lib/sha256.mjs` | SHA-256 计算 | 直接复用 | REQ-DFX-SEC-08 |

---

## 4. 轮换验证

### 4.1 验证项矩阵

| 验证项 | 验证方法 | 预期结果 | 追溯需求 |
|--------|---------|---------|---------|
| 新凭据连接 | `smbclient //192.168.2.3/share -U pad2_app` | 连接成功 | REQ-P2-04 |
| 新凭据写入 | `smbclient ... -c 'put testfile /writable/testfile'` | 写入成功 | REQ-P2-04 |
| 旧凭据失效 | 旧密码连接测试 | 连接失败（认证错误） | REQ-DFX-SEC-05 |
| Keystore 更新 | `credentialStore.get('pad2_app')` 返回新密码 | 新密码可读取 | REQ-P2-04 |
| 审计记录 | 检查审计日志含轮换记录 | 含 timestamp/account/原因 | REQ-DFX-SEC-08 |
| 证据生成 | 检查轮换证据 JSON 存在 | 含 SHA-256 指纹，不含明文 | REQ-DFX-SEC-08 |

### 4.2 验证命令（设计，不执行）

```bash
# 1. 新凭据连接测试
smbclient //192.168.2.3/share -U pad2_app -c 'ls'

# 2. 新凭据写入测试（受限目录内）
smbclient //192.168.2.3/share -U pad2_app -c 'put /tmp/testfile writable/testfile'

# 3. 新凭据越界写入测试（受限目录外，须失败）
smbclient //192.168.2.3/share -U pad2_app -c 'put /tmp/testfile testfile'
# 预期：NT_STATUS_ACCESS_DENIED

# 4. 旧凭据失效测试（9191 旧密码，须失败）
smbclient //192.168.2.3/share -U pad2_app%9191 -c 'ls'
# 预期：NT_STATUS_LOGON_FAILURE
```

---

## 5. Shell 历史保护

### 5.1 保护措施

| 措施 | 命令 | 目的 | 追溯需求 |
|------|------|------|---------|
| 禁用 Shell 历史 | `export HISTFILE=/dev/null` | 防止密码进入 Shell 历史 | REQ-DFX-SEC-01 |
| 环境变量注入 | `export PAD2_SMB_NEW_PASSWORD='****'` | 密码不经命令行参数 | REQ-DFX-SEC-01 |
| smbpasswd stdin | `sudo smbpasswd -a pad2_app`（经 stdin） | 密码不经命令行参数 | REQ-DFX-SEC-01 |
| 脱敏日志 | `redact.mjs` 模块脱敏 | 日志不含明文密码 | REQ-DFX-SEC-01 |
| 证据指纹 | SHA-256 指纹替代明文 | 证据不含明文密码 | REQ-DFX-SEC-08 |

### 5.2 禁止操作

| 禁止操作 | 禁止原因 | 追溯需求 |
|---------|---------|---------|
| `smbpasswd -a pad2_app 9191`（命令行参数） | 密码进入 Shell 历史/进程列表 | REQ-DFX-SEC-01 |
| `echo 9191 > /tmp/password`（写入文件） | 密码落盘明文 | REQ-DFX-SEC-01 |
| `log.d("password", password)`（日志输出） | 密码进入 Logcat | REQ-DFX-SEC-01 |
| `git commit -m "rotate to 9191"`（Git 提交） | 密码进入 Git 历史 | REQ-DFX-SEC-01 |

---

## 6. 轮换审计

### 6.1 审计日志结构

```typescript
interface RotationAuditEntry {
  timestamp: number;           // 轮换时间戳
  account: string;             // 账户名（如 'pad2_app'）
  triggerReason: 'periodic' | 'leak_event' | 'first_rotation' | 'account_change' | 'device_lost';
  triggerDescription: string;  // 触发原因描述（不含密码）
  rotationResult: 'success' | 'failed';
  failureReason?: string;      // 失败原因（不含密码）
  operator: string;            // 执行人
  // 不含 oldPassword、newPassword、passwordHash
}
```

### 6.2 审计保证

| 审计项 | 保证 | 追溯需求 |
|--------|------|---------|
| 记录内容 | timestamp/account/triggerReason/result | REQ-DFX-SEC-08 |
| 禁止记录密码 | 不含 oldPassword/newPassword | REQ-DFX-SEC-01、REQ-DFX-SEC-08 |
| 禁止记录密码哈希 | 不含 passwordHash（避免离线破解） | REQ-DFX-SEC-01 |
| 持久化 | 经 SmbPlugin.exportLog 或本地审计文件 | REQ-DFX-SEC-08 |

---

## 7. 异常场景

### 7.1 轮换过程中应用仍使用旧凭据

| 维度 | 说明 | 追溯需求 |
|------|------|---------|
| 触发条件 | 服务器侧已轮换但客户端尚未更新 Keystore | REQ-P2-04 异常 2 |
| 系统行为 | 应用连接收到认证失败（≤3s，非超时） | REQ-DFX-REL-04 |
| 用户感知 | 提示"凭据已变更，请更新" | REQ-P2-04 异常 2 |
| 恢复 | 应用检测认证失败 → 触发凭据更新流程 → 更新 Keystore | REQ-P2-04 |

### 7.2 轮换失败

| 失败原因 | 处理 | 追溯需求 |
|---------|------|---------|
| smbpasswd 失败（权限不足） | 记录失败，不更新客户端，旧凭据仍可用 | REQ-P2-04 |
| smbclient 验证失败 | 回滚服务器密码至旧值，记录失败 | REQ-DFX-SEC-05 |
| Keystore 更新失败 | 服务器已更新但客户端未更新，触发 7.1 异常 | REQ-P2-04 异常 2 |

---

## 8. 约束与禁止项

### 8.1 不执行轮换（REQ-DFX-SEC-09）

AU-006 **不执行**以下操作：
- 不执行 `smbpasswd -a pad2_app`（不设置新密码）
- 不执行 `smbpasswd -x pad2_app`（不禁用账户）
- 不生成新密码
- 不更新 Keystore

全部为设计文档产出，实施由运维在后续工作单元执行。

### 8.2 零明文密码（REQ-P2-08）

- 新密码以 `${SMB_APP_PASSWORD}` 占位符表示。
- 9191 仅在"已暴露旧密码"上下文出现。
- `grep -ri "9191" docs/au006/wp-p2-rotation-mechanism-design.md` 仅在"首次轮换实例"上下文出现，无明文新密码。

### 8.3 实施由后续工作单元执行（REQ-P2-10）

本设计文档标注：**实施由运维在后续工作单元执行，AU-006 仅设计不执行。**

---

## 9. 追溯矩阵

| 需求编号 | 设计章节 | 覆盖状态 |
|---------|---------|---------|
| REQ-P2-04 | §2 触发条件 + §3 轮换步骤 + §4 验证 | ✅ 触发+步骤+验证 |
| REQ-P2-08 | §8.2 零明文密码 | ✅ 占位符脱敏 |
| REQ-P2-10 | §8.3 实施标注 | ✅ 后续工作单元执行 |
| REQ-DFX-SEC-01 | §5 Shell 历史保护 + §6 审计 | ✅ 零明文 |
| REQ-DFX-SEC-05 | §3 步骤 8 旧凭据失效 | ✅ 旧凭据即时失效 |
| REQ-DFX-SEC-08 | §6 轮换审计 | ✅ 审计不含密码 |
| REQ-DFX-SEC-09 | §2.3 首次轮换 + §8.1 不执行 | ✅ 9191 轮换设计不执行 |
| 数据约束 6.2 | 全文 | ✅ 轮换触发/能力 |

---

> **文档结束**。本文档为 WP-P2 凭据轮换机制设计的设计文档产出，仅设计不执行。9191→`${SMB_APP_PASSWORD}` 为首次轮换实例，AU-006 不执行 smbpasswd。
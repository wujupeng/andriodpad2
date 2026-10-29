# AU006-SEC-S01：[storage] 共享风险评估报告

> **工作单**: AU006-SEC-S01
> **日期**: 2026-10-29
> **PM 下达**: 2026-10-29 PM 裁定后续流程时下达
> **授权边界**: 仅评估和建议，不修改生产共享配置
> **关联问题**: S-01（AU-006 安全设计复核中风险项）、P-05（AU-004 独立复核中风险项）

---

## 1. 评估范围

| 项目 | 内容 |
|------|------|
| 评估对象 | SMB 共享 `[storage]`（path=/mnt/storage, writable=yes） |
| 评估目的 | 明确 [storage] 用途、授权账户及写入需求；检查是否存在绕过 /mnt/share/writable/ 设计边界的访问路径 |
| 基线来源 | `docs/au006/wp-p1-baseline/smb-config-baseline.json`（2026-10-28） |
| 关联设计 | AU-006 WRITE_ENABLED_SCOPE.writablePaths = ['/mnt/share/writable/'] |

---

## 2. [storage] 共享现状

### 2.1 配置基线

| 配置项 | [share] | [storage] |
|--------|---------|-----------|
| path | /mnt/share | /mnt/storage |
| writable | no | **yes** |
| read_only | yes | **no** |
| valid_users | debian | **debian** |
| force_user | debian | not set |
| browseable | yes | not set（默认 yes） |
| guest_ok | no | not set（默认 no） |

### 2.2 关键发现

1. **[storage] 是独立共享**：path=/mnt/storage，与 [share]（path=/mnt/share）是不同的文件系统路径
2. **[storage] 可写**：writable=yes, read_only=no — 允许写入
3. **[storage] 仅 debian 可访问**：valid_users=debian，pad2_app 不在 valid_users 中
4. **[storage] 无 force_user**：不像 [share] 那样强制 debian 身份
5. **[storage] 不在 AU-006 设计范围内**：writablePaths=['/mnt/share/writable/']，不含 /mnt/storage/

---

## 3. 访问边界矩阵

### 3.1 当前状态（AU-005 只读架构）

| 账户 | [share] /mnt/share | [storage] /mnt/storage | /mnt/share/writable/（设计目标） |
|------|-------------------|----------------------|-------------------------------|
| debian | 读（valid_users + force_user） | **读写**（valid_users + writable=yes） | 读（目录不存在） |
| pad2_app | 无访问（不在 valid_users） | 无访问（不在 valid_users） | 无访问（账户不存在） |
| winuser | 无访问 | 无访问 | 无访问 |
| pad2gate3 | 无访问 | 无访问 | 无访问 |

### 3.2 AU-006 实施后目标状态

| 账户 | [share] /mnt/share | [storage] /mnt/storage | /mnt/share/writable/ |
|------|-------------------|----------------------|---------------------|
| debian | 读（valid_users + force_user） | **读写**（valid_users + writable=yes） | 读（如目录存在） |
| pad2_app | 读+受限写（write list） | **无访问**（不在 valid_users） | **读写**（write list + force user） |
| winuser | 无访问 | 无访问 | 无访问 |
| pad2gate3 | 无访问 | 无访问 | 无访问 |

### 3.3 边界分析

| 边界 | 是否有效 | 依据 |
|------|---------|------|
| pad2_app 不能访问 [storage] | ✅ | pad2_app 不在 [storage] valid_users=debian 中 |
| isWriteEnabledForPath 对 /mnt/storage/ 返回 false | ✅ | /mnt/storage/ 不在 writablePaths=['/mnt/share/writable/'] |
| [storage] 不绕过 /mnt/share/writable/ 边界 | ✅ | /mnt/storage 与 /mnt/share 是独立路径，无包含关系 |
| debian 可写 [storage] 是既有状态 | ✅ | 非 AU-006 引入，属系统管理员范畴 |

---

## 4. 风险评估

### 4.1 对 AU-006 安全目标的影响

| 风险项 | 影响 | 评估 |
|--------|------|------|
| pad2_app 通过 [storage] 绕过受限目录 | 无 | pad2_app 不在 [storage] valid_users |
| PAD2 应用通过 [storage] 写入 | 无 | PAD2 使用 pad2_app 账户，无 [storage] 访问权 |
| isWriteEnabledForPath 对 [storage] 路径放行 | 无 | /mnt/storage/ 不在 writablePaths |
| AU-006 三层防御被 [storage] 绕过 | 无 | 三层防御基于 pad2_app + /mnt/share/writable/，[storage] 使用不同账户+路径 |

**结论：[storage] 可写不对 AU-006 安全目标构成直接威胁**。AU-006 的安全边界（pad2_app + /mnt/share/writable/）与 [storage]（debian + /mnt/storage）是隔离的。

### 4.2 对系统整体安全的影响（AU-006 范围外）

| 风险项 | 影响 | 严重性 | 范围 |
|--------|------|--------|------|
| debian 凭据泄露 → [storage] 可写 | 攻击者可写入 /mnt/storage | 中 | 系统级（非 AU-006） |
| [storage] 无审计日志 | 写操作不可追溯 | 中 | 系统级（非 AU-006） |
| [storage] 无 immutable 保护 | 配置可被修改 | 低 | 系统级（非 AU-006） |
| [storage] 用途不明 | 不清楚是否有业务依赖 | 中 | 须确认 |

---

## 5. 整改建议

### 5.1 方案对比

| 方案 | 描述 | 优点 | 缺点 | 风险 |
|------|------|------|------|------|
| **A. 收紧** | [storage] read_only=yes 或移除 valid_users 中 debian | 消除可写面 | 可能破坏现有业务工作流 | 须先确认 [storage] 写入需求 |
| **B. 隔离声明** | 保持 [storage] 现状，在威胁模型中声明为 AU-006 范围外，确保 pad2_app 永不加入 valid_users | 零生产变更，AU-006 边界清晰 | [storage] 可写风险持续 | 须定期核验 pad2_app 不在 valid_users |
| **C. 风险接受** | 接受为既有风险，记录并监控 | 零变更 | 风险持续且无主动控制 | 须监控 debian 凭据安全 |

### 5.2 推荐方案：B. 隔离声明

**推荐理由**：
1. [storage] 可写不对 AU-006 安全目标构成直接威胁（pad2_app 隔离）
2. 零生产变更，不违反 PM 授权边界
3. 明确 AU-006 设计边界，补充威胁模型覆盖范围声明

**实施要求**：
1. 在 AU-006 design.md §8 威胁模型中增加声明：
   > `[storage] 共享（/mnt/storage, writable=yes, valid_users=debian）为既有系统配置，不在 AU-006 设计范围内。AU-006 安全边界基于 pad2_app 账户 + /mnt/share/writable/ 受限目录。pad2_app 不在 [storage] valid_users 中，isWriteEnabledForPath 对 /mnt/storage/ 路径恒返回 false。`
2. 在 design.md §8.4 风险清单中增加 R-11：
   > `R-11: [storage] 共享可写（既有状态，非 AU-006 引入），严重性=中，可能性=中，缓解状态=已声明为范围外（pad2_app 隔离），追溯=系统级风险`
3. 实施阶段核验：pad2_app 不在 [storage] valid_users（部署后验证）

### 5.3 备选方案：A. 收紧（如 [storage] 无写入需求）

如果评估确认 [storage] 无业务写入需求，则建议收紧为 read_only=yes。此方案须：
1. 确认无业务流程依赖 [storage] 写入
2. 提交独立服务器配置变更工作单元（须 PM 授权）
3. 变更后验证 [storage] read_only=yes 生效

---

## 6. 验证计划

| 验证项 | 方法 | 预期结果 | 时机 |
|--------|------|---------|------|
| pad2_app 不在 [storage] valid_users | `testparm -s` 检查 [storage] valid_users | 不含 pad2_app | 实施前+实施后 |
| isWriteEnabledForPath('/mnt/storage/file') | 代码审查 | 返回 false | 实施阶段 |
| pad2_app SMB 连接 [storage] 失败 | `smbclient //192.168.2.3/storage -U pad2_app` | NT_STATUS_ACCESS_DENIED | 实施后 |
| [storage] writable 状态 | `testparm -s` | 方案 B: 保持 yes；方案 A: no | 变更后 |

---

## 7. 交付物清单

| 交付物 | 状态 |
|--------|------|
| 风险评估报告 | ✅ 本文件 |
| 访问边界矩阵 | ✅ §3 |
| 整改建议 | ✅ §5（推荐方案 B 隔离声明） |
| 验证计划 | ✅ §6 |

---

## 8. 声明

1. 本评估仅提交评估和建议，**未修改生产共享配置**。
2. [storage] 可写是既有状态（AU-005 基线确认），非 AU-006 引入。
3. 推荐方案 B（隔离声明）不涉及任何生产变更，仅补充设计文档声明。
4. 如选择方案 A（收紧），须提交独立服务器配置变更工作单元并获 PM 授权。
5. 本评估不授权实施 AU-006 代码、FRZ-EX 或生产发布。

---

> **评估完成**。[storage] 可写不对 AU-006 安全目标构成直接威胁（pad2_app 隔离）。推荐方案 B（隔离声明），在威胁模型中声明 [storage] 为 AU-006 范围外，确保 pad2_app 永不加入 [storage] valid_users。
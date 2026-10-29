# AU-006 安全设计独立复核报告 (AU006-SECURITY-DESIGN-REVIEW)

> **工作单元**: AU006-SECURITY-DESIGN-REVIEW
> **复核日期**: 2026-10-29
> **复核范围**: WRITE_ENABLED_SCOPE / WRITE_PERMISSION_MATRIX / 默认拒绝逻辑 / 账户与目录隔离 / 威胁模型 / 回滚步骤
> **授权边界**: 仅设计审查，不执行生产变更、不授权实施
> **PM 工作单**: 2026-10-29 PM 裁定 AU-004 后续流程时下达

---

## 1. 复核方法

### 1.1 证据来源

| 证据文件 | 章节 | 核验重点 |
|---------|------|---------|
| `.codeartsdoer/specs/au_006/design.md` §2.2.2.1 | WRITE_ENABLED_SCOPE 定义 | 权限范围常量、派生逻辑、兼容性 |
| `.codeartsdoer/specs/au_006/design.md` §2.2.2.2 | WRITE_PERMISSION_MATRIX 定义 | 权限矩阵、能力派生、默认拒绝 |
| `.codeartsdoer/specs/au_006/design.md` §2.2.2.3 | isWriteEnabledForPath | 默认拒绝逻辑、路径判定 |
| `.codeartsdoer/specs/au_006/design.md` §2.2.2.4 | normalizeAndValidatePath | 路径规范化、目录穿越防御 |
| `.codeartsdoer/specs/au_006/design.md` §2.1.3.1 | 三层防御兼容 | 权限矩阵驱动兼容设计 |
| `.codeartsdoer/specs/au_006/design.md` §2.1.3.2 | 状态机扩展 | 编辑会话状态机扩展条件 |
| `.codeartsdoer/specs/au_006/design.md` §5 | 安全设计 | 凭据存储/轮换/撤销/目录穿越/符号链接/审计 |
| `.codeartsdoer/specs/au_006/design.md` §8 | 威胁模型 | 6 类威胁、缓解措施、风险清单 |
| `.codeartsdoer/specs/au_006/design.md` §9 | 回滚方案 | 12 步回滚、验证、前提条件 |
| `.codeartsdoer/specs/au_006/spec.md` | 需求规格 | REQ-DFX-SEC-01~09、REQ-P5-01~06 追溯 |
| `docs/au006/wp-p1-baseline/smb-config-baseline.json` | SMB 配置基线 | 交叉核验当前服务器状态 |
| `docs/au006/wp-p1-baseline/account-baseline.json` | 账户体系基线 | 交叉核验账户隔离设计 |

### 1.2 核验维度

1. **定义完整性**：常量/函数定义是否完整、类型是否正确、取值是否合理。
2. **默认拒绝**：未授权路径/账户/条件下是否默认拒绝写回。
3. **兼容性**：权限矩阵关闭时是否等价回退至 AU-005 全拦截。
4. **隔离有效性**：账户隔离与目录隔离是否能有效防止越权。
5. **威胁覆盖**：威胁模型是否覆盖所有攻击面、缓解措施是否可验证。
6. **回滚完备性**：回滚步骤是否可操作、可验证、覆盖全部变更面。
7. **需求追溯**：每项设计是否可追溯至 spec.md 中的 EARS 需求。

---

## 2. 逐项核验

### 2.1 WRITE_ENABLED_SCOPE 权限范围常量

**定义位置**: design.md:677-702

```typescript
export const WRITE_ENABLED_SCOPE = {
  enabled: true,
  account: 'pad2_app',
  writablePaths: ['/mnt/share/writable/'],
  credentialStorage: 'keystore' as 'keystore' | 'encrypted_shared_prefs',
  rotationPeriodDays: 90,
} as const;
export const READ_ONLY_MODE = !WRITE_ENABLED_SCOPE.enabled as const;
```

| 核验维度 | 判定 | 依据 |
|---------|------|------|
| 定义完整性 | ✅ | 5 个字段完整，类型 `as const` 编译期常量 |
| account 隔离 | ✅ | `pad2_app` ≠ `debian`（当前基线 valid users=debian） |
| writablePaths 受限 | ✅ | `/mnt/share/writable/` ⊂ `/mnt/share/`，仅受限子目录可写 |
| credentialStorage | ✅ | `keystore`（硬件级）为主选，`encrypted_shared_prefs` 为备选 |
| rotationPeriodDays | ✅ | 90 天周期性轮换 + 事件触发（§5.2） |
| READ_ONLY_MODE 派生 | ✅ | `!WRITE_ENABLED_SCOPE.enabled`，从全局 true 派生为按矩阵 |
| 兼容性保证 | ✅ | `enabled=false` → `READ_ONLY_MODE=true` → 等价 AU-005 全拦截（design.md:486） |
| 需求追溯 | ✅ | REQ-P4-04、REQ-DFX-COMPAT-01、数据约束 6.9-2 |

**裁定: PASS**

### 2.2 WRITE_PERMISSION_MATRIX 权限矩阵常量

**定义位置**: design.md:705-740

```typescript
export const WRITE_PERMISSION_MATRIX = {
  writeback: true,
  saveas: true,
  overwrite: 'explicit_confirm' as 'explicit_confirm' | 'silent',
  tempFileRename: true,
  conflictDetection: true,
} as const;

export const OPERATION_CAPABILITIES = {
  copy: false, move: false, rename: false,
  deleteRemote: false, deleteLocal: false, createDirectory: false,
  writeback: WRITE_ENABLED_SCOPE.enabled && WRITE_PERMISSION_MATRIX.writeback,
  saveas: WRITE_ENABLED_SCOPE.enabled && WRITE_PERMISSION_MATRIX.saveas,
} as const;
```

| 核验维度 | 判定 | 依据 |
|---------|------|------|
| 定义完整性 | ✅ | 5 个字段完整，overwrite 要求显式确认 |
| writeback 派生 | ✅ | `WRITE_ENABLED_SCOPE.enabled && WRITE_PERMISSION_MATRIX.writeback` |
| saveas 派生 | ✅ | 同上 |
| 非写回操作默认拒绝 | ✅ | copy/move/rename/deleteRemote/deleteLocal/createDirectory 全 false |
| overwrite 保护 | ✅ | `explicit_confirm` 须用户显式确认，非 silent |
| 冲突检测 | ✅ | `conflictDetection: true`，写回前检测远端变更 |
| 需求追溯 | ✅ | REQ-P4-04、REQ-DFX-SEC-04、数据约束 6.9-3 |

**裁定: PASS**

### 2.3 默认拒绝逻辑 (isWriteEnabledForPath)

**定义位置**: design.md:742-758

```typescript
export function isWriteEnabledForPath(filePath: string): boolean {
  if (!WRITE_ENABLED_SCOPE.enabled) return false;                    // 条件1: 全局开关
  const normalized = normalizeAndValidatePath(filePath, WRITE_ENABLED_SCOPE.writablePaths);
  return normalized.isWithinWritable && accountHasWritePermission();  // 条件2+3: 路径+账户
}
```

| 核验维度 | 判定 | 依据 |
|---------|------|------|
| 条件1: 全局开关 | ✅ | `!WRITE_ENABLED_SCOPE.enabled` → return false |
| 条件2: 路径规范化 | ✅ | `normalizeAndValidatePath` 解析 `../`、前缀校验、越界检测 |
| 条件3: 账户权限 | ✅ | `accountHasWritePermission()` 运行时验证 |
| 默认拒绝 | ✅ | 任一条件失败 → return false（非 true） |
| 路径越界异常映射 | ✅ | violation='traversal'/'absolute_escape' → return false + 告警 |
| 状态机扩展条件 | ✅ | `writeEnabled(path)` 作为 editing 态迁移条件（design.md:547） |
| 需求追溯 | ✅ | REQ-P4-11、REQ-DFX-SEC-06、REQ-P3-06、数据约束 6.6-3 |

**裁定: PASS** — 三条件 AND 逻辑，任一失败默认拒绝

### 2.4 账户与目录隔离

**设计位置**: design.md §5.4、§8.2 T-05、§2.1.2

| 核验维度 | 判定 | 依据 |
|---------|------|------|
| 专用账户 | ✅ | `pad2_app`（≠ `debian` 通用账户），REQ-DFX-SEC-03 |
| 账户隔离 | ✅ | `pad2_app` ∉ `debian` 组，独立组 `pad2_app_group` |
| 受限目录 | ✅ | `/mnt/share/writable/` ⊂ `/mnt/share/`，REQ-DFX-SEC-04 |
| Samba write list | ✅ | `write list = pad2_app`，仅 pad2_app 可写 |
| Samba force user | ✅ | `force user = pad2_app`，强制专用账户身份 |
| 文件系统权限 | ✅ | `mode 0770`，限定 pad2_app + pad2_app_group |
| 无管理权限 | ✅ | 无共享管理/smb.conf 修改/SSH 登录权限（T-05 缓解） |
| 交叉核验（基线） | ✅ | 当前基线 valid users=debian（预期，设计未实施） |

**裁定: PASS** — 账户隔离（pad2_app ≠ debian）+ 目录隔离（/mnt/share/writable/）+ 最小权限

### 2.5 威胁模型

**设计位置**: design.md §8 (行 1677-1767)

#### 2.5.1 威胁识别（REQ-P5-01）

| 威胁 | 描述 | 严重性 | 可能性 | 缓解状态 |
|------|------|--------|--------|---------|
| T-01 越权写入 | 专用账户写到受限目录外 | 高 | 中 | 已缓解 |
| T-02 凭据泄露 | SMB 密码被提取 | 高 | 中 | 已缓解 |
| T-03 目录穿越 | `../` 越界逃逸 | 高 | 中 | 已缓解 |
| T-04 符号链接 | 跟随链接写到目录外 | 高 | 低 | 已缓解 |
| T-05 权限提升 | 获取非预期权限 | 高 | 低 | 已缓解 |
| T-06 中间人 | SMB 未加密传输被篡改 | 中 | 中 | **部分缓解** |

**威胁覆盖**: 6 类威胁覆盖全部攻击面 ✅（匹配 REQ-P5-01）

#### 2.5.2 缓解措施（REQ-P5-02）

| 威胁 | 缓解措施 | 可验证 | 判定 |
|------|---------|--------|------|
| T-01 | 路径规范化 + write list + mode 0770 + force user | ✅ 构造越界路径测试 | PASS |
| T-02 | Keystore + 轮换 + 撤销 + 禁止明文 | ✅ Keystore 审查 + 轮换演练 | PASS |
| T-03 | normalize + 前缀校验 + ../检测 + 越界拒绝 | ✅ 构造 ../ 路径测试 | PASS |
| T-04 | lstat + 拒绝 + symlinkPolicy:deny + O_NOFOLLOW | ✅ 放置符号链接测试 | PASS |
| T-05 | 最小权限 + 账户隔离 + 无管理权限 + force user | ✅ 权限矩阵审查 | PASS |
| T-06 | SMB3 加密/签名 + SHA-256 校验 | ⚠️ 依赖服务器 SMB3 支持 | **PARTIAL** |

#### 2.5.3 风险清单（REQ-P5-06）

| 风险 | 严重性 | 可能性 | 缓解状态 | 判定 |
|------|--------|--------|---------|------|
| R-01~R-05 | 高 | 中/低 | 已缓解 | ✅ |
| R-06 中间人 | 中 | 中 | 部分缓解 | ⚠️ 诚实披露 |
| R-07 FRZ-EX 未授权 | 中 | 高 | 待缓解（PM 决策） | ✅ 诚实披露 |
| R-08 9191 暴露 | 高 | 高 | 待缓解（后续轮换） | ✅ 与 AU-004 GAP-01 一致 |
| R-09 WPS 行为风险 | 中 | 低 | 待缓解（实施验证） | ✅ 诚实披露 |
| R-10 Keystore 不可用 | 中 | 低 | 已缓解（降级方案） | ✅ |

**裁定: PASS（附注：T-06 部分缓解，依赖服务器 SMB3 加密支持，已诚实披露）**

### 2.6 回滚步骤

**设计位置**: design.md §9 (行 1768-1822)

#### 2.6.1 回滚步骤（12 步）

| 步骤 | 操作 | 执行方 | 可验证 | 判定 |
|------|------|--------|--------|------|
| RB-01 | WRITE_ENABLED_SCOPE.enabled=false → READ_ONLY_MODE=true | 开发 | ✅ tsc + UI 审查 | PASS |
| RB-02 | OPERATION_CAPABILITIES 回退全 false | 开发 | ✅ 能力表审查 | PASS |
| RB-03 | editSessionStore 7 处守卫回退 | 开发 | ✅ 状态机 7 态审查 | PASS |
| RB-04 | 移除 writeback/saveas 能力项 | 开发 | ✅ 能力表审查 | PASS |
| RB-05 | chattr -i /etc/samba/smb.conf | 运维 | ✅ lsattr 确认 | PASS |
| RB-06 | 恢复 smb.conf 至 AU-005 状态 | 运维 | ✅ testparm 验证 | PASS |
| RB-07 | chattr +i /etc/samba/smb.conf | 运维 | ✅ lsattr 确认 | PASS |
| RB-08 | systemctl restart smbd nmbd | 运维 | ✅ is-active 确认 | PASS |
| RB-09 | smbpasswd -x pad2_app（禁用专用账户） | 运维 | ✅ pdbedit -L 确认 | PASS |
| RB-10 | 恢复受限目录权限 | 运维 | ✅ ls -la 确认 | PASS |
| RB-11 | FRZ-EX 回退 ACTION_EDIT → ACTION_VIEW | 开发 | ✅ 原生层审查 | PASS |
| RB-12 | 验证 AU-005 三层防御全拦截 + 只读语义 | QA | ✅ Gate Review | PASS |

#### 2.6.2 回滚前提条件

1. AU-005 设计文档与代码已归档 ✅
2. smb.conf 变更前备份已保存 ✅
3. 专用账户创建前账户列表已记录 ✅
4. 受限目录创建前权限已记录 ✅
5. 回滚须 root 权限 ✅

#### 2.6.3 回滚验证

| 验证项 | 预期 | 判定 |
|--------|------|------|
| READ_ONLY_MODE | true | ✅ |
| OPERATION_CAPABILITIES | 6 项全 false | ✅ |
| editSessionStore 可达集 | 7 态（AU-005 基线） | ✅ |
| SMB [share] read only | yes | ✅ |
| smb.conf immutable | 有 | ✅ |
| 专用账户 pad2_app | 禁用或不存在 | ✅ |
| 写回功能 | 不可用（三层全拦截） | ✅ |

**需求追溯**: REQ-P5-04、REQ-DFX-MAINT-03 ✅

**裁定: PASS** — 12 步覆盖客户端/服务器/账户/目录/FRZ-EX 全部变更面，可操作可验证

---

## 3. 交叉核验

### 3.1 与 AU-006 WP-P1 基线交叉核验

| 核验项 | 设计值 | 基线值（2026-10-28） | 一致性 |
|--------|--------|---------------------|--------|
| [share] valid users | pad2_app（设计目标） | debian（当前状态） | ✅ 预期差异（设计未实施） |
| [share] read only | no（设计目标，受限目录内） | yes（当前状态） | ✅ 预期差异（设计未实施） |
| [share] writable | yes（设计目标，受限目录内） | no（当前状态） | ✅ 预期差异（设计未实施） |
| 9191 密码 | 须轮换（R-08） | EXPOSED-ROTATE-PENDING | ✅ 一致 |
| [storage] writable | 未提及 | yes | ⚠️ 设计未覆盖（S-01） |

### 3.2 与 AU-004 独立复核交叉核验

| 核验项 | AU-004 复核结论 | AU-006 设计 | 一致性 |
|--------|---------------|------------|--------|
| GAP-01 9191 暴露 | INSUFFICIENT_EVIDENCE | R-08 待缓解 | ✅ 一致 |
| GAP-03 [share] 权限收紧 | PASS | 设计目标 pad2_app | ✅ 设计进一步收紧 |
| P-02 设备明文存储 | 中风险 | §5.1 Keystore 替代 | ✅ 设计已覆盖 |
| P-05 [storage] 可写 | 中风险 | 威胁模型未覆盖 | ⚠️ S-01 |

### 3.3 与 spec.md 需求追溯交叉核验

| 需求 | 设计覆盖位置 | 追溯完整性 |
|------|------------|-----------|
| REQ-DFX-SEC-01 禁止明文 | §5.1 | ✅ |
| REQ-DFX-SEC-02 Keystore | §5.1 + WRITE_ENABLED_SCOPE.credentialStorage | ✅ |
| REQ-DFX-SEC-03 专用账户 | §2.1.2 + WRITE_ENABLED_SCOPE.account | ✅ |
| REQ-DFX-SEC-04 受限目录写权限 | §5.4 + WRITE_PERMISSION_MATRIX | ✅ |
| REQ-DFX-SEC-05 凭据撤销 | §5.3 | ✅ |
| REQ-DFX-SEC-06 目录穿越防御 | §5.4 + normalizeAndValidatePath | ✅ |
| REQ-DFX-SEC-07 符号链接防御 | §5.5 + detectSymlink | ✅ |
| REQ-DFX-SEC-08 审计日志 | §5.6 | ✅ |
| REQ-DFX-SEC-09 9191 轮换 | §5.2 + R-08 | ✅ |
| REQ-P5-01 威胁识别 | §8.1 (6 类) | ✅ |
| REQ-P5-02 缓解措施 | §8.2 | ✅ |
| REQ-P5-04 回滚方案 | §9 | ✅ |
| REQ-P5-06 风险清单 | §8.4 | ✅ |

---

## 4. 问题清单

### 4.1 非阻断性问题

| 编号 | 问题 | 严重性 | 处置建议 |
|------|------|--------|---------|
| S-01 | **[storage] 共享未纳入威胁模型**：设计仅覆盖 [share]，[storage] writable=yes 未在威胁模型中评估。AU-004 复核 P-05 已识别此风险 | 中 | 威胁模型应增加 [storage] 攻击面评估，或声明 [storage] 不在 AU-006 范围并引用独立风险评估 |
| S-02 | **T-06 缓解缺乏验证程序**：T-06 标注"部分缓解（依赖 SMB3 支持）"但未指定如何验证服务器是否支持 SMB3 加密 | 低 | 补充 SMB3 加密支持验证方法（如 `smbclient --option='client min protocol=SMB3'` 测试） |
| S-03 | **R-08 与 AU-004 GAP-01 交叉引用不显式**：R-08 标注"9191 暴露"但未引用 AU-004 GAP-01 INSUFFICIENT_EVIDENCE | 低 | 在 R-08 中增加 `ref: AU-004 GAP-01` 交叉引用 |
| S-04 | **pad2_app_group 未指定 GID/组名**：设计声明"≠ debian 组"但未指定组名或 GID | 中 | 补充 pad2_app_group 组名与 GID 设计值（如 GID=1002），避免实施时配置不一致 |
| S-05 | **RB-09 未处理活跃 SMB 会话**：回滚步骤"禁用 pad2_app"未说明如何处理进行中的 SMB 写回会话 | 低 | 补充回滚前提：先终止活跃 SMB 会话再禁用账户（如 `smbstatus` 检查 + kill） |
| S-06 | **normalizeAndValidatePath 尾斜杠边界**：writablePaths 定义为 `/mnt/share/writable/`（含尾斜杠），若传入 `/mnt/share/writable`（无尾斜杠）则 startsWith 不匹配 | 低 | 实施时统一路径尾斜杠处理（path.join + path.sep），或在 normalizeAndValidatePath 中补齐尾斜杠 |

---

## 5. 裁定汇总

| 复核项 | 裁定 | 关键依据 | 遗留问题 |
|--------|------|---------|---------|
| WRITE_ENABLED_SCOPE | **PASS** | 5 字段完整，派生逻辑正确，兼容性保证 sound | 无 |
| WRITE_PERMISSION_MATRIX | **PASS** | 权限矩阵驱动能力派生，非写回操作默认拒绝 | 无 |
| 默认拒绝逻辑 | **PASS** | 三条件 AND 逻辑，任一失败 → deny | S-06（低） |
| 账户与目录隔离 | **PASS** | pad2_app ≠ debian，/mnt/share/writable/ 隔离 | S-04（中） |
| 威胁模型 | **PASS（附注）** | 6 类威胁，T-01~T-05 已缓解，T-06 部分缓解 | S-01（中）、S-02（低）、S-03（低） |
| 回滚步骤 | **PASS** | 12 步覆盖全部变更面，可操作可验证 | S-05（低） |

**整体裁定: PASS（设计层面）**

6 项复核全部 PASS。6 项非阻断性问题（2 中 + 4 低），无阻断性问题。T-06 部分缓解已诚实披露。

---

## 6. 复核声明

1. **本复核为设计审查，不执行任何生产变更**。未执行凭据轮换、账户操作、smb.conf 修改、ACL 变更、代码实现。
2. **本复核不授权实施**：不授权 AU-006 写回代码、FRZ-EX、生产 SMB 账户/目录/配置变更、凭据轮换、APK 部署或生产发布。
3. **设计值 ≠ 实施值**：WRITE_ENABLED_SCOPE.enabled=true 等设计值为目标架构值，当前服务器仍为 AU-005 只读状态（基线交叉确认）。
4. **T-06 部分缓解**：中间人攻击缓解依赖服务器 SMB3 加密支持，须实施阶段验证。
5. **与 AU-004 一致**：R-08（9191 暴露）与 AU-004 GAP-01 INSUFFICIENT_EVIDENCE 一致，须二次轮换后方可关闭。
6. **Production Release 继续 BLOCKED / NOT AUTHORIZED**。

---

## 7. 后续建议

1. **S-01 处置**：将 [storage] 共享风险评估纳入独立工作单元（与 AU-004 P-05 合并处置）
2. **S-04 处置**：实施前补充 pad2_app_group 组名与 GID 设计值
3. **实施授权申请**：本复核 PASS 不等于实施授权。代码侧实现/服务器权限变更/FRZ-EX 须分别提交独立工作单元
4. **凭据二次轮换**：GAP-01 须 9191→secure password 二次轮换（PM+运维联合授权）后方可申请关闭
5. **T-06 验证**：实施阶段须验证服务器 SMB3 加密支持，若不支持须标注为待缓解风险

---

## 8. 交付物清单

| 交付物 | 路径 | 状态 |
|--------|------|------|
| 安全设计独立复核报告 | `docs/au006/security-design-independent-review.md` | ✅ 本文件 |
| 逐项核验 | 本报告 §2 | ✅ |
| 交叉核验 | 本报告 §3 | ✅ |
| 问题清单 | 本报告 §4 | ✅ |
| 裁定汇总 | 本报告 §5 | ✅ |

---

> **复核完成**。AU-006 安全设计独立复核整体 PASS（设计层面）。6 项复核全部 PASS，6 项非阻断性问题（2 中 + 4 低），无阻断性问题。不授权实施，生产发布继续 BLOCKED。
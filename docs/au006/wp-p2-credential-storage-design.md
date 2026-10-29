# WP-P2 凭据安全存储方案选型 — Keystore 主选 + ESP 备选 + 降级方案 + 禁止项

> **任务编号**：TASK-AU006-P2-02
> **工作包**：WP-P2 专用应用账户设计
> **关联需求**：REQ-P2-03、REQ-P2-08、REQ-DFX-SEC-01、REQ-DFX-SEC-02、数据约束 6.5
> **前置依赖**：TASK-AU006-P2-01（专用账户命名已设计）
> **工作单元性质**：仅设计（Design-Only），不实施任何代码变更。
> **授权边界**：仅授权设计文档产出，不授权代码修改或凭据存储实施。

---

## 1. 设计目标

为专用 SMB 应用账户 `pad2_app` 的密码 `${SMB_APP_PASSWORD}` 设计客户端安全存储方案，基于 Android 平台安全设施，禁止明文落盘/硬编码/BuildConfig 明文/日志明文/Git 明文。

**核心设计决策**：
- 主选：Android Keystore（硬件级 TEE/StrongBox）
- 备选：EncryptedSharedPreferences（软件级 AES-256）
- 降级：两者均不可用时禁用写回 + 提示

---

## 2. 存储设施选型矩阵

| 设施 | 安全级别 | 加密机制 | 可用性 | 决策 | 追溯需求 |
|------|---------|---------|--------|------|---------|
| Android Keystore | 硬件级（TEE/StrongBox） | 硬件密钥隔离，非软件可提取 | Android 16+ 支持 | **主选** | REQ-DFX-SEC-02 |
| EncryptedSharedPreferences | 软件级（AES-256-GCM） | AES-256-GCM + Keystore 密钥包装 | Android 16+ 支持（Jetpack Security） | **备选** | REQ-DFX-SEC-02 |
| 明文 SharedPreferences | 无安全 | 无加密 | — | **禁止** | REQ-DFX-SEC-02 |
| 硬编码 | 无安全 | 密码写入源码 | — | **禁止** | 数据约束 6.5-2 |
| Gradle BuildConfig 明文 | 无安全 | 密码写入 BuildConfig | — | **禁止** | 数据约束 6.5-3 |
| 明文文件（update_cred.json） | 无安全 | 无加密 | 当前存量为明文 JSON | **禁止** | REQ-DFX-SEC-02 |

### 2.1 主选理由：Android Keystore

1. **硬件级安全**：密钥存储在 TEE（Trusted Execution Environment）或 StrongBox，非软件可提取。
2. **Android 16 支持**：目标设备荣耀 NDL2_W09 / Android 16 支持 Android Keystore。
3. **密钥不可导出**：`setUserAuthenticationRequired` 可要求用户认证后才可使用密钥。
4. **防 root 提取**：即使设备 root，Keystore 密钥仍受硬件保护。

### 2.2 备选理由：EncryptedSharedPreferences

1. **软件级安全**：AES-256-GCM 加密，密钥经 Keystore 包装。
2. **降级方案**：Keystore 不可用时（如设备损坏/TEE 不可用），降级至 ESP。
3. **Android 16 支持**：Jetpack Security 库支持。
4. **优于明文**：虽非硬件级，但远优于明文 SharedPreferences。

---

## 3. CredentialStore 接口契约（后续实施标注）

```typescript
/**
 * 凭据安全存储接口（AU-006 设计，后续实施）
 * 基于 Android Keystore（主选）或 EncryptedSharedPreferences（备选）
 */
export interface CredentialStore {
  /**
   * 获取 SMB 密码（从 Keystore/ESP 解密读取）
   * @param account SMB 账户名（如 'pad2_app'）
   * @returns 解密后的密码，或 null（未存储/已撤销）
   */
  get(account: string): Promise<string | null>;

  /**
   * 存储 SMB 密码（加密存储到 Keystore/ESP）
   * @param account SMB 账户名
   * @param password 明文密码（运行时传入，不落盘明文）
   */
  set(account: string, password: string): Promise<void>;

  /**
   * 轮换凭据（旧密码→新密码）
   * @param account SMB 账户名
   * @param newPassword 新密码（运行时传入）
   */
  rotate(account: string, newPassword: string): Promise<void>;

  /**
   * 撤销凭据（删除存储）
   * @param account SMB 账户名
   */
  revoke(account: string): Promise<void>;

  /**
   * 检查存储设施可用性
   * @returns true=Keystore/ESP 可用，false=均不可用
   */
  isAvailable(): Promise<boolean>;

  /**
   * 获取当前存储设施类型
   * @returns 'keystore' | 'encrypted_shared_prefs' | 'unavailable'
   */
  getStorageType(): Promise<'keystore' | 'encrypted_shared_prefs' | 'unavailable'>;
}
```

### 3.1 方法语义

| 方法 | 前置条件 | 后置条件 | 异常映射 | 追溯需求 |
|------|---------|---------|---------|---------|
| `get(account)` | 存储设施可用 | 返回解密密码或 null | 设施不可用 → 抛 `StorageUnavailableError` | REQ-DFX-SEC-02 |
| `set(account, password)` | 存储设施可用 | 密码加密存储 | 设施不可用 → 抛 `StorageUnavailableError` | REQ-DFX-SEC-02 |
| `rotate(account, newPassword)` | 存储设施可用 | 旧密码被新密码替换 | 设施不可用 → 抛 `StorageUnavailableError` | REQ-P2-04 |
| `revoke(account)` | 存储设施可用 | 密码从存储删除 | 设施不可用 → 静默成功（撤销尽力而为） | REQ-P2-05 |
| `isAvailable()` | 无 | 返回设施可用性 | 无（不抛异常） | REQ-P2-03 异常 1 |
| `getStorageType()` | 无 | 返回当前设施类型 | 无 | REQ-DFX-SEC-02 |

### 3.2 调用示例

```typescript
// 初始化
const credentialStore: CredentialStore = createCredentialStore();

// 检查可用性
if (!await credentialStore.isAvailable()) {
  // 降级：禁用写回 + 提示
  disableWriteback('设备安全存储不可用');
  return;
}

// 存储密码（首次或轮换）
await credentialStore.set('pad2_app', newPassword);

// 读取密码（连接 SMB 时）
const password = await credentialStore.get('pad2_app');
if (password === null) {
  // 凭据未存储或已撤销
  disableWriteback('凭据未配置或已撤销');
  return;
}
await SmbPlugin.connect({ host, share, username: 'pad2_app', password });

// 轮换凭据
await credentialStore.rotate('pad2_app', newPassword);

// 撤销凭据
await credentialStore.revoke('pad2_app');
```

---

## 4. 降级方案

### 4.1 降级链

```
Android Keystore（主选，硬件级）
    ↓ Keystore 不可用
EncryptedSharedPreferences（备选，软件级）
    ↓ ESP 不可用
禁用写回 + 提示"设备安全存储不可用"（最终降级）
```

### 4.2 降级触发条件

| 降级步骤 | 触发条件 | 检测方法 | 追溯需求 |
|---------|---------|---------|---------|
| Keystore → ESP | Keystore 不可用（TEE 损坏/设备不支持） | `KeyStore.getInstance('AndroidKeyStore').containsAlias(alias)` 失败 | REQ-P2-03 异常 1 |
| ESP → 禁用写回 | ESP 不可用（Jetpack Security 库缺失/初始化失败） | `EncryptedSharedPreferences.createContext(...)` 失败 | REQ-P2-03 异常 1 |

### 4.3 降级后应用行为

| 降级级别 | 写回功能 | UI 提示 | 用户感知 | 追溯需求 |
|---------|---------|---------|---------|---------|
| Keystore 可用 | 全功能可用 | 无提示 | 正常写回 | — |
| 降级至 ESP | 全功能可用（软件级安全） | 可选提示"使用软件级加密存储" | 正常写回（安全级别降低） | REQ-P2-03 异常 1 |
| 禁用写回 | 写回不可用 | "设备安全存储不可用，写回功能已禁用" | 只读模式（AU-005 语义） | REQ-P2-03 异常 1 |

### 4.4 降级安全性保证

1. **降级至 ESP 不降低功能**：写回仍可用，仅安全级别从硬件级降为软件级。
2. **禁用写回保持 AU-005 语义**：三层防御全拦截，非授权路径只读，满足回滚兼容（数据约束 6.9-5）。
3. **降级不写入明文**：即使降级至 ESP，密码仍经 AES-256-GCM 加密，不落盘明文。

---

## 5. 禁止项清单

| 禁止项 | 禁止原因 | 追溯需求 | 验证方法 |
|--------|---------|---------|---------|
| 明文 SharedPreferences | 无加密，root 可读 | REQ-DFX-SEC-02、数据约束 6.5-1 | 代码审查无 `SharedPreferences.getString("password")` |
| 硬编码密码 | 密码写入源码，Git 可见 | 数据约束 6.5-2 | `grep -r "password.*=.*\"[0-9]" src/` 无结果 |
| Gradle BuildConfig 明文 | 密码写入 BuildConfig，反编译可见 | 数据约束 6.5-3 | `build.gradle` 无 `buildConfigField "String", "SMB_PASSWORD"` |
| Logcat 日志明文 | 日志可被其他应用读取 | REQ-DFX-SEC-01、数据约束 6.5-4 | 代码审查无 `Log.d("password", password)` |
| Git 提交明文 | 密码进入版本控制 | REQ-DFX-SEC-01、数据约束 6.5-5 | `git log -p` 无明文密码 |
| 明文文件（update_cred.json） | 无加密，文件可读 | REQ-DFX-SEC-02 | 设备无 `/sdcard/Android/data/.../update_cred.json` 含明文 |
| 命令行参数传密码 | 密码进入 Shell 历史/进程列表 | REQ-DFX-SEC-01 | 密码经环境变量 `PAD2_SMB_NEW_PASSWORD` 注入 |

---

## 6. 与现有存量对比

### 6.1 现有存量（AU-004 运维手册 tvf-06 记录）

| 维度 | 现有存量 | AU-006 设计 | 改进 |
|------|---------|------------|------|
| 存储方式 | 明文 JSON（`update_cred.json`） | Android Keystore/ESP | 明文 → 加密 |
| 存储位置 | `/sdcard/Android/data/com.pad2.filemanager/files/` | Android Keystore 系统区 / ESP 加密文件 | 可读目录 → 受保护存储 |
| 加密 | 无 | AES-256-GCM（ESP）或硬件密钥（Keystore） | 无 → 硬件/软件加密 |
| 提取难度 | `cat update_cred.json` 即可 | 须破解 TEE 或 Keystore | 低 → 高 |

### 6.2 迁移路径（设计，不实施）

1. 首次使用：用户配置 SMB 连接 → 密码经 `CredentialStore.set()` 加密存储。
2. 存量迁移：检测到 `update_cred.json` 存在 → 读取明文密码 → `CredentialStore.set()` 加密存储 → 删除明文文件。
3. 迁移后：`update_cred.json` 不再存在，密码仅存于 Keystore/ESP。

---

## 7. 安全保证

### 7.1 凭据读取安全

| 安全环节 | 措施 | 追溯需求 |
|---------|------|---------|
| 存储加密 | Keystore 硬件密钥 或 ESP AES-256-GCM | REQ-DFX-SEC-02 |
| 运行时解密 | 解密仅在内存，不落盘明文 | REQ-DFX-SEC-01 |
| 传输至 SmbPlugin | 内存传递，不经过日志/文件 | REQ-DFX-SEC-01 |
| SmbPlugin 使用 | `connect({ password })` 内存使用，不持久化 | 冻结区行为 |

### 7.2 凭据存储安全

| 安全环节 | 措施 | 追溯需求 |
|---------|------|---------|
| 加密算法 | AES-256-GCM（ESP）或硬件密钥（Keystore） | REQ-DFX-SEC-02 |
| 密钥保护 | Keystore 密钥不可导出 | REQ-DFX-SEC-02 |
| 访问控制 | 仅 PAD2 应用可访问（Android 沙箱） | Android 平台保证 |
| 完整性 | GCM 模式含认证标签，防篡改 | REQ-DFX-SEC-02 |

---

## 8. 约束与禁止项

### 8.1 零代码变更

AU-006 **不实施** CredentialStore 接口，仅设计接口契约。实施由后续工作单元执行。

### 8.2 零明文密码（REQ-P2-08）

- 密码以 `${SMB_APP_PASSWORD}` 占位符表示。
- `grep -ri "9191" docs/au006/wp-p2-credential-storage-design.md` 无结果。

### 8.3 实施由后续工作单元执行（REQ-P2-10）

本设计文档标注：**实施由开发在后续工作单元执行，AU-006 仅设计。**

---

## 9. 追溯矩阵

| 需求编号 | 设计章节 | 覆盖状态 |
|---------|---------|---------|
| REQ-P2-03 | §2 选型矩阵 + §4 降级方案 | ✅ Keystore/ESP + 降级 |
| REQ-P2-08 | §8.2 零明文密码 | ✅ 占位符脱敏 |
| REQ-DFX-SEC-01 | §5 禁止项 + §7 安全保证 | ✅ 零明文 |
| REQ-DFX-SEC-02 | §2 选型矩阵 | ✅ Keystore/ESP |
| 数据约束 6.5 | §5 禁止项清单 | ✅ 5 项禁止 |

---

> **文档结束**。本文档为 WP-P2 凭据安全存储方案选型的设计文档产出，仅设计不实施。密码以 `${SMB_APP_PASSWORD}` 占位符表示，零明文。
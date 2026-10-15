# PAD2 完整功能型 Android 文件管理器 编码任务规划

> 本文档基于 `pad2_product_scope/spec.md` 产品范围规格与 `pad2_product_scope/design.md` 技术设计文档生成，将完整功能型 Android 文件管理器的产品蓝图（A/B/C/D 四大类）、五阶段实施路线（P0-P4）、首期交付清单（FD-01~FD-17）、五项产品架构原则拆解为可执行的开发任务。任务按业务功能垂直切割，遵循依赖关系排序，覆盖从项目初始化、M2 技术验证、P0+P1 首期实现到 P2-P4 扩展的完整路径。

> **文档定位**：本文档为现有 `android_smb_explorer/tasks.md`（SMB 核心实现任务基线）的扩展框架，不替代现有文档。现有 `android_smb_explorer/spec.md`/`design.md`/`tasks.md` 是 SMB 核心和 P0 技术验证的需求与架构基线，保持不变。本文档重点规划完整功能型文件管理器相对 SMB 核心的增量任务：统一文件操作接口、协议能力声明、统一传输任务引擎扩展、本地文件管理（P1）、网络协议扩展（P2）、云盘与工具（P3）、安全与高级能力（P4）。

> **PAD2-M1-G4-FAST-DECISION-01 多设备兼容策略**：PAD2 不绑定单一平板型号、Android 版本或 WPS 版本。兼容性通过三层兼容性模型（通用架构兼容 / 代表性环境验证 / 兼容性证据管理）管理。minSdkVersion = API 26（已冻结），targetSdkVersion = API 36（候选值待 M2-B 评估）。所有涉及设备/版本假设的任务均标注"不绑定单一设备/版本，按三层兼容性模型管理"。

> **任务门禁依赖说明（五阶段顺序门禁）**：
> - 第 1-2 节（项目初始化 + M1 冻结）为基础前置任务，不依赖 WPS 门禁。
> - **第 3 节为 M2-A WPS 技术验证门禁（主要门禁），前置到所有 P0 完整实现任务之前**。WPS"打开—编辑—保存回写—冲突—断网恢复"关键路径须在代表性设备真实环境中验证通过（V1-V7）后，方可进入 P0 完整实现。
> - 第 4 节为 M2-B API 36 兼容性评估（独立评估），与 M2-A 分开执行与记录，不阻塞 M2-A。
> - 第 5-15 节为 P0 完整实现任务组（FD-01~FD-08, FD-17），**均标注"依赖：M2-A WPS 门禁通过（第 3 节）"**。若 M2-A 门禁未通过，不批准进入这些任务的实现。
> - 第 16-23 节为 P1 文件管理核心任务组（FD-09~FD-16），**依赖：P0 门禁通过（第 15 节）**。
> - 第 24-30 节为横切关注点（安全审计、对外接口、UI、测试、验收、发布），部分依赖 P0/P1 门禁通过。
> - 第 31-33 节为 P2-P4 扩展任务组，**依赖：前一阶段验收通过 + 独立需求规格与架构设计**。

> **M1 冻结参数上下文**：minSdkVersion = API 26（已冻结）；targetSdkVersion = API 36（候选值待 M2-B 兼容性评估）；并发会话上限 = 5、并发任务上限 = 3、分块大小 = 8MB、重试上限 = 5 次（均为 M2 待验证初始基线）。

> **技术栈**：Capacitor 8 + React + TypeScript + Android Java/Kotlin + SMBJ + Room/SQLite + Android Keystore。命名约定：camelCase（如 SmbUploader、readFileBytes、smbProfiles）；文件/目录名 snake_case；TypeScript 前端 + Java Android 原生插件。

> **远程编译环境**：服务器 192.168.2.3，用户名 debian，密码 ***REDACTED***，路径 /home/debian/android。新仓库：https://github.com/wujupeng/andriodpad2。PowerShell 脚本进行部署和运维操作。

---

## 1. 项目初始化与工程基线

> **阶段**：P0 前置 | **优先级**：Must | **依赖**：无

### 1.1 初始化新仓库与分支策略
- [ ] 在 GitHub 创建新仓库 `wujupeng/andriodpad2`，初始化 `main`、`develop` 分支及 `pad2-p0` ~ `pad2-p4` 阶段分支
- [ ] 将旧仓库 `wujupeng/andriodpad` 标记为只读技术资产参考，不预设代码复用
- [ ] 配置 `.gitignore`，排除 `node_modules/`、`android/app/build/`、`android/.gradle/`、本地凭据文件等

### 1.2 搭建项目脚手架（Capacitor 8 + React + TypeScript + Android Java）
- [ ] 初始化 Capacitor 8 项目骨架，包含 `package.json`、`capacitor.config.ts`、`tsconfig.json`
- [ ] 初始化 React + TypeScript 前端工程，配置 Vite 构建链
- [ ] 初始化 Android 原生工程 `android/`，配置 `build.gradle`、`app/build.gradle`，minSdkVersion = API 26（已冻结），targetSdkVersion 候选值 API 36（待 M2-B 兼容性评估后冻结），不绑定单一版本，按三层兼容性模型管理
- [ ] 配置 AndroidManifest.xml 最小权限集（按 Android API 级别收敛，SAF 优先，MANAGE_EXTERNAL_STORAGE 为最后手段）

> **Android 最小权限集收敛策略**：
> - **targetSdkVersion < 29**：`INTERNET`、`ACCESS_NETWORK_STATE`、`ACCESS_WIFI_STATE`、`READ_EXTERNAL_STORAGE`、`WRITE_EXTERNAL_STORAGE`、`FOREGROUND_SERVICE`
> - **targetSdkVersion >= 29**：`INTERNET`、`ACCESS_NETWORK_STATE`、`ACCESS_WIFI_STATE`、`FOREGROUND_SERVICE`；本地缓存通过应用私有目录或 SAF，不申请 `READ/WRITE_EXTERNAL_STORAGE`
> - **targetSdkVersion >= 30**：同上，`MANAGE_EXTERNAL_STORAGE` 为最后手段，须证明无替代方案后才考虑申请
> - 所有版本均须：`FOREGROUND_SERVICE`（传输队列后台服务）、网络权限

### 1.3 配置远程编译服务器环境（代表性环境配置，不绑定唯一编译环境）
- [ ] 验证远程编译服务器 `192.168.2.3` 可达性，确认 SMB 共享 `\\192.168.2.3\home\debian` 可从本地 Windows 挂载
- [ ] 在远程服务器 `/home/debian/android` 预装 JDK、Android SDK、Gradle 编译环境
- [ ] 编写远程编译脚本（PowerShell），实现源码同步→远程 Gradle 编译→APK 产物回传→adb install 部署的自动化流程
- [ ] 验证远程编译流程可成功产出空壳 APK 并安装到代表性设备

### 1.4 搭建分层架构骨架（四层架构 + 协议适配层 + 工具模块）
- [ ] 在 Android 原生层创建五层包结构：`ui`（表现层）、`orchestration`（业务编排层）、`core`（核心能力层）、`adapter`（协议适配层）、`infrastructure`（基础设施层）
- [ ] 在前端层创建对应目录结构：`src/ui/`、`src/orchestration/`、`src/core/`、`src/adapter/`、`src/infrastructure/`
- [ ] 预留工具模块目录 `android/tool-modules/`（P3-P4 独立 Gradle feature module）
- [ ] 定义层间依赖规则：上层依赖下层，禁止反向依赖，配置 lint 规则校验依赖方向

### 1.5 建立兼容性证据管理框架
- [ ] 创建"已验证环境清单"活文档模板，含字段：设备型号、系统版本、WPS 版本、协议版本、测试用例、结果、已知限制、验证日期
- [ ] 建立三层兼容性模型文档框架：通用架构兼容层、代表性环境验证层、兼容性证据管理层
- [ ] 初始化代表性设备清单框架：初始基线设备（荣耀 9X）+ 待扩展组合占位
- [ ] 定义"未验证"标记规则：未实测组合一律标记"未验证"，"未验证"不等于"不兼容"，允许尝试运行但不得宣称兼容

---

## 2. PAD2-M1 需求与架构冻结

> **阶段**：P0 前置 | **优先级**：Must | **依赖**：第 1 节

### 2.1 冻结兼容性与协议要求
- [x] 确定 minSdkVersion：API 26 / Android 8.0（已冻结，PM 批准），支持多版本，不绑定单一版本 — **已冻结**
- [x] 确定 targetSdkVersion 候选值：API 36（Android 16），待 M2-B 兼容性评估后冻结 — **候选值待兼容性评估**
- [x] 建立代表性设备清单首批组合：荣耀 9X + Android 版本 + WPS 版本（当前 + 最新稳定版） — **有条件批准**
- [ ] 冻结支持 SMB 协议版本（建议 SMB2/3，不支持 SMB1），评估 SMB3 端到端加密支持
- [ ] 冻结认证策略（NTLMv2 或 Kerberos，禁用 NTLMv1）
- [ ] 将三层兼容性模型写入 spec.md 与 design.md，确认参数状态分类清晰

### 2.2 冻结性能与并发指标（初始值待 M2 验证）
- [ ] 冻结并发会话上限（初始值 5）与并发任务上限（初始值 3） — **初始值待 M2 验证**
- [ ] 冻结流式分块大小（初始值 8MB） — **初始值待 M2 验证**
- [ ] 冻结目录枚举响应上限（建议首屏 2s，分页加载） — **待实测确定**
- [ ] 冻结重试退避上限（指数退避，上限 5 次，仅对可重试故障） — **初始值待 M2 验证**
- [ ] 冻结核心操作成功率下限（初始值 ≥99.5%）与故障恢复时间上限（初始值 ≤30s） — **初始值待 M2 验证**
- [ ] 冻结传输超时阈值（初始值 300s） — **初始值待 M2 验证**
- [ ] 确认目标并发用户数（须与客户端并发会话上限 5、并发任务上限 3 严格区分） — **待业务确认**

---

## 3. M2-A WPS 技术验证门禁（主要门禁，FD-03/FD-04/FD-05）

> **阶段**：P0 门禁 | **优先级**：Must | **依赖**：第 1-2 节 | **门禁作用**：M2-A 通过 → P0 门禁通过 → 批准进入 P0 完整实现（第 5-15 节）

> **门禁前置说明**：本节为 M2-A 关键技术门禁，**前置到所有 P0 完整实现任务之前**。WPS"打开—编辑—保存回写—冲突—断网恢复"关键路径须在代表性设备、实际 WPS 版本与真实 SMB 服务器上验证通过（V1-V7）后，方可进入第 5-15 节 P0 完整实现。**当前门禁状态：未执行**（PM 已批准 M2 开始但尚未执行，不宣称 WPS 门禁通过）。不绑定单一设备/WPS 版本，按三层兼容性模型管理。

### 3.1 搭建 M2-A 验证环境
- [ ] 准备代表性设备（荣耀 9X）、真实 Windows SMB 服务器、实际 WPS 版本环境（当前安装版本 + 最新稳定版）
- [ ] 搭建 M2-A 最小验证工程，含 SMB 连接、文件读取、WPS 交付、保存检测、回写的最小闭环

### 3.2 验证 V1 WPS 可打开
- [ ] 验证通过 ContentProvider + URI 方式交付文件，WPS 可正常打开编辑
- [ ] 若 ContentProvider 方式不通过，验证临时文件 + Intent 回退方式
- [ ] 记录验证结果与最终选型决策

### 3.3 验证 V2 WPS 可保存
- [ ] 验证 WPS 保存操作可被本组件检测（FileObserver + ContentProvider 回调）
- [ ] 验证保存事件含目标 URI、变更时间、内容指纹

### 3.4 验证 V3 保存行为识别
- [ ] 验证正确识别 WPS 直接写入原文件行为
- [ ] 验证正确识别 WPS 另存为新文件行为
- [ ] 验证正确识别 WPS 生成临时文件行为（`~$` 前缀或 `.tmp` 后缀），过滤临时文件识别最终结果

### 3.5 验证 V4 回写成功
- [ ] 验证保存后回写共享原位置，SHA-256 校验通过
- [ ] 验证共享文件内容确实发生预期变化（不能仅凭 WPS 启动成功判定）

### 3.6 验证 V5 回写失败不破坏原文件
- [ ] 验证回写失败时原文件内容与基线一致，未被破坏
- [ ] 验证安全写入事务在失败时正确回滚

### 3.7 验证 V6 并发冲突
- [ ] 验证两台设备同时编辑同一文件并保存，不静默丢失任一方更新
- [ ] 验证冲突提示正确出现，提供"保存为副本/重新加载/经明确确认后覆盖/放弃"选项（合并为未来扩展，首期不承诺语义合并）

### 3.8 验证 V7 断网恢复
- [ ] 验证编辑期间断网后恢复，回写可完成且校验通过
- [ ] 验证断网期间显示等待状态，不显示成功

### 3.9 验证 SMB 安全写入与断点续传协议级可行性
- [ ] 在真实 SMB 服务器上验证"临时文件→校验→原子重命名→替换"操作序列的可行性
- [ ] 验证 SMB 服务器端文件占用（oplock/lease）行为对原子替换的影响
- [ ] 验证断点续传的 SMB 协议级可行性（SMB 是否支持随机写入已存在临时文件）
- [ ] 验证每步操作的失败回滚策略有效性
- [ ] 记录验证结果，标注哪些设计目标经真实环境验证后成立，哪些需调整实现方案

### 3.10 逐设备/逐版本记录兼容性证据
- [ ] 对代表性设备清单中每个设备，逐设备记录 V1-V7 验证结果
- [ ] 对计划测试 WPS 版本清单中每个版本，逐版本记录 V1-V7 验证结果
- [ ] 将通过验证的组合写入已验证版本清单，未测试组合标记为"未验证"
- [ ] 更新已验证环境清单（活文档），确保持续更新

### 3.11 M2-A 门禁评审
- [ ] 汇总 V1-V7 及协议级可行性验证报告，全部通过方可批准进入第 5-15 节 P0 完整实现
- [ ] 冻结 WPS 文件交付方式（M2-A 验证通过后的最终方式）
- [ ] 写入 WPS 已验证版本清单，未测试组合标注"未验证"
- [ ] 未通过项记录差距与整改计划，不批准进入完整实现

---

## 4. M2-B API 36 兼容性评估（独立评估，不阻塞 M2-A）

> **阶段**：P0 独立评估 | **优先级**：Must | **依赖**：第 1-2 节 | **门禁作用**：M2-B 评估完成 → PM 正式裁定 targetSdkVersion

> **M2-B 与 M2-A 关系**：两个子任务独立执行与记录；M2-A 为主要门禁，M2-B 为独立评估；不得以 M2-B 的静态审查代替 M2-A 的真实测试。API 36 保持候选状态直到 M2-B 评估完成并由 PM 正式裁定。

### 4.1 搭建 M2-B 评估环境
- [ ] 准备 API 36 模拟器或真机环境
- [ ] 确认评估范围：Capacitor 8 及插件、SAF、前台服务类型声明、SMBJ 在 API 36 上的行为

### 4.2 执行 API 36 兼容性评估
- [ ] 评估 Capacitor 8 在 API 36 上的兼容性（实测或混合方法）
- [ ] 评估 Android 原生插件在 API 36 上的兼容性
- [ ] 评估 SAF 持久化授权在 API 36 上的有效性（须实测）
- [ ] 评估前台服务类型声明在 API 36 上的行为（Android 14+ 须声明 foregroundServiceType，须实测）
- [ ] 评估 SMBJ 在 API 36 上的兼容性
- [ ] 评估 ContentProvider/URI 文件访问在 API 36 上的行为
- [ ] 评估后台传输任务在 API 36 上的限制

### 4.3 M2-B 评估结论与 PM 裁定
- [ ] 汇总评估结果，对于无法实测的项目记录限制、风险和待验证项，不得直接标记为兼容
- [ ] 提交 M2-B 评估结论（独立记录，与 M2-A 分开）
- [ ] PM 根据证据正式裁定 targetSdkVersion（API 36 仍保持候选状态直至正式裁定，不自动冻结）

---

## 5. 统一文件操作接口与协议能力声明（模块 G，P0 架构基础）

> **阶段**：P0 | **优先级**：Must | **依赖**：M2-A WPS 门禁通过（第 3 节）

> **架构意义**：统一文件操作接口是完整功能型文件管理器相对 SMB 核心的最关键增量架构。所有文件系统（本地/SMB/FTP/SFTP/WebDAV/云盘）须实现统一接口，并声明各自支持的能力集合。

### 5.1 定义统一文件操作接口（UnifiedFileOperations）
- [ ] 定义 `UnifiedFileOperations` 接口：list、readFile、writeFile、deleteFile、renameFile、copyFile、moveFile、statFile、getCapabilities（`core/UnifiedFileOperations.java` + `src/core/UnifiedFileOperations.ts`）
- [ ] 定义统一文件路径方案：`protocol://server/share/path`（如 `smb://192.168.1.1/share/file.docx`、`local:///storage/file.docx`）
- [ ] 定义统一返回类型：FileEntry、WriteResult、DeleteResult、RenameResult、CopyResult、MoveResult、FileStat
- [ ] 定义统一异常分类：INVALID_PATH、PERMISSION_DENIED、NETWORK_UNREACHABLE、CAPABILITY_NOT_SUPPORTED、NOT_FOUND、VERSION_CONFLICT

### 5.2 定义协议能力声明接口（ProtocolCapability）
- [ ] 定义 `ProtocolCapability` 接口：supportsAtomicReplace、supportsRandomRead、supportsRandomWrite、supportsRename、supportsSymLink、supportsResumeTransfer、supportsVersionQuery、getProtocolName、getProtocolVersion（`core/ProtocolCapability.java`）
- [ ] 定义协议能力矩阵文档，记录各协议能力声明（SMB/本地/FTP/SFTP/WebDAV/云盘）

### 5.3 实现 SMB 适配器（SmbAdapter）
- [ ] 实现 `SmbAdapter` 类，实现 `UnifiedFileOperations` 接口（`adapter/SmbAdapter.java`）
- [ ] 声明 SMB 协议能力：原子替换✓、随机读写✓、重命名✓、续传✓、版本查询✓（基于 M2-A 实测证据更新）
- [ ] 将 SMBJ 封装层操作映射为统一接口方法

### 5.4 实现能力降级策略（CapabilityDegradation）
- [ ] 实现 `CapabilityDegradation` 工具类：依据能力声明决定操作策略（`core/CapabilityDegradation.java`）
- [ ] 实现回写降级：不支持原子替换时降级为"写临时文件→校验→删除原文件→重命名临时文件"
- [ ] 实现续传降级：不支持续传时中断后从头传输
- [ ] 实现重命名降级：不支持重命名时降级为"复制到新名称→删除原文件"
- [ ] 实现版本查询降级：不支持版本查询时提示用户风险

### 5.5 实现协议适配器工厂（FileOperationFactory）
- [ ] 实现 `FileOperationFactory`：根据统一文件路径解析协议类型并返回对应适配器（`core/FileOperationFactory.java`）
- [ ] 实现适配器注册与缓存机制
- [ ] 实现适配器生命周期管理（连接建立/断开/重建）

---

## 6. 基础设施层实现（扩展多协议）

> **阶段**：P0 | **优先级**：Must | **依赖**：M2-A WPS 门禁通过（第 3 节）

### 6.1 实现 SMBJ 封装层
- [ ] 封装 SMBJ 会话建立、认证（NTLMv2/SPNEGO）、断开操作，提供线程安全会话池化管理（`infrastructure/smb/SmbJWrapper.java`）
- [ ] 封装 SMBJ 目录枚举、文件读写、重命名、删除、属性查询操作（`infrastructure/smb/SmbJOperations.java`）
- [ ] 实现 SMB 协议版本适配，支持 SMB2/3，拒绝 SMB1（`infrastructure/smb/SmbProtocolAdapter.java`）
- [ ] 定义 SMB 异常分类：网络不可达、认证失败、协议不支持、连接超时、权限不足（`infrastructure/smb/SmbExceptions.java`）

### 6.2 实现 Room/SQLite 持久化层
- [ ] 配置 Room 数据库初始化与 schema 版本迁移机制（`infrastructure/db/AppDatabase.java`）
- [ ] 定义 `ConnectionConfig` 实体与 DAO（多协议通用，不含凭据明文）（`infrastructure/db/entity/ConnectionConfigEntity.java`）
- [ ] 定义 `TransferTask` 实体与 DAO，支持状态机驱动与断点偏移查询（`infrastructure/db/entity/TransferTaskEntity.java`）
- [ ] 定义 `EditSession` 实体与 DAO，支持活跃会话查询与归档（`infrastructure/db/entity/EditSessionEntity.java`）
- [ ] 定义 `FileCacheEntry` 实体与 DAO，支持 LRU 清理查询（`infrastructure/db/entity/FileCacheEntryEntity.java`）
- [ ] 定义 `AuditLogEntry` 实体与 DAO，支持定期轮转与导出（`infrastructure/db/entity/AuditLogEntryEntity.java`）
- [ ] 定义 `RecycleBinEntry` 实体与 DAO，支持过期清理查询（`infrastructure/db/entity/RecycleBinEntryEntity.java`）
- [ ] 定义 `ProtocolCapabilityInfo` 实体与 DAO，支持协议能力持久化（`infrastructure/db/entity/ProtocolCapabilityInfoEntity.java`）

### 6.3 实现 Keystore 凭据加密层
- [ ] 实现 `CredentialVault` 接口：检查 Keystore 可用性、生成/获取 AES-256 密钥、加密存储、解密读取、删除凭据（`infrastructure/security/CredentialVaultImpl.java`）
- [ ] 采用 AES-GCM 认证加密，密钥由设备锁屏保护
- [ ] 实现 Keystore 不可用时的异常处理与用户提示（提示启用设备锁屏）
- [ ] 确保解密后明文仅在内存临时存在，使用后立即清除，任何位置不落盘明文

### 6.4 实现日志与脱敏层
- [ ] 实现结构化日志框架，含错误分类码、操作上下文、时间戳（`infrastructure/logging/StructuredLogger.java`）
- [ ] 实现日志脱敏规则：密码、完整凭据、文件敏感内容、OAuth 令牌替换为 `***`（`infrastructure/logging/LogSanitizer.java`）
- [ ] 实现错误分类体系：输入校验失败、业务规则冲突、外部系统失败、并发竞争、超时重试（`infrastructure/logging/ErrorClassifier.java`）

### 6.5 实现文件缓存管理
- [ ] 实现本地缓存副本管理：创建、查询、更新、删除（`infrastructure/cache/FileCacheManager.java`）
- [ ] 实现缓存空间检查与 LRU + 空间上限清理策略
- [ ] 实现缓存元数据与 Room/SQLite 持久化联动

### 6.6 实现 SAF/URI 文件访问封装
- [ ] 封装 Android SAF 权限申请、URI 授权、持久化授权管理（`infrastructure/saf/SafAccessHelper.java`）
- [ ] 封装 ContentProvider 文件访问操作（openFile、query、cursor）（`infrastructure/saf/ContentProviderHelper.java`）
- [ ] 适配不同 Android 版本 SAF 行为差异（在最低支持版本以上按三层兼容性模型逐版本验证）

---

## 7. SMB 连接与目录浏览（FD-01, FD-02）

> **阶段**：P0 | **优先级**：Must | **依赖**：M2-A 门禁通过 + 第 5-6 节

### 7.1 实现 SMB 连接管理
- [ ] 实现 `SmbConnectionManager` 接口：connect、testConnection、disconnect、reconnect、getActiveSession（`core/smb/SmbConnectionManagerImpl.java`）
- [ ] 实现会话池化与并发会话上限控制（初始值 5，M2 待验证）
- [ ] 实现会话失效检测与自动重建触发机制
- [ ] 实现连接测试不持久化无效会话，分类返回错误原因

### 7.2 实现共享配置管理
- [ ] 实现多协议共享配置增删改查编排逻辑，凭据通过 `CredentialVault` 加密存储（`orchestration/ConnectionOrchestrator.java`）
- [ ] 实现存量凭据从明文迁移为 Keystore 加密的迁移脚本与流程
- [ ] 实现多共享入口管理与切换浏览状态独立维护
- [ ] 实现连接配置数据校验：服务器地址格式、共享名非空、端口范围、协议版本范围

### 7.3 实现目录分页枚举
- [ ] 实现 `SmbDirectoryEnumerator` 接口：分页 enumerate、search、sort（`core/smb/SmbDirectoryEnumeratorImpl.java`）
- [ ] 实现首屏优先策略，首屏在响应上限内返回，剩余分页延迟加载
- [ ] 实现目录枚举在后台线程执行，避免阻塞 UI
- [ ] 实现枚举超时重试与超限失败提示

### 7.4 实现搜索与排序
- [ ] 实现共享范围内按名称搜索，异步搜索与结果分页
- [ ] 实现按名称、大小、修改时间排序，支持升序/降序

### 7.5 实现文件属性与收藏
- [ ] 实现文件属性展示：大小、修改时间、类型等（`core/smb/FileAttributeService.java`）
- [ ] 实现文件/目录收藏列表管理与快速访问（`core/favorite/FavoriteService.java`）
- [ ] 收藏数据持久化至 Room/SQLite

---

## 8. 统一传输任务引擎（模块 H，FD-06, FD-07）

> **阶段**：P0 | **优先级**：Must | **依赖**：M2-A 门禁通过 + 第 5 节

> **架构意义**：统一传输任务引擎将 SMB 核心的传输队列引擎抽象为协议无关的统一引擎，所有协议的大文件传输共享流式传输、进度记录、完整性校验与可验证恢复机制。

### 8.1 实现协议无关传输引擎（UnifiedTransferEngine）
- [ ] 实现 `UnifiedTransferEngine` 接口：submitTask、pauseTask、resumeTask、cancelTask、retryTask、getTaskProgress、getTaskStatus、listTasks、onProgressUpdate（`core/transfer/UnifiedTransferEngineImpl.java`）
- [ ] 实现通过统一文件操作接口委托具体协议执行流式读写，不直接依赖任何协议库
- [ ] 实现传输任务状态机：排队→进行中→暂停→已完成/失败/已取消，每次状态迁移持久化
- [ ] 实现并发任务上限控制（初始值 3，M2 待验证）

### 8.2 实现流式读写引擎
- [ ] 实现 `StreamTransferEngine`：流式 copy、move、resume（`core/transfer/StreamTransferEngineImpl.java`）
- [ ] 实现分块读写（初始值 8MB），禁止一次性 `byte[]` 读取整体文件
- [ ] 实现进度回调机制，实时上报已传输字节数与总字节数
- [ ] 实现断点续传：续传优先针对独立临时文件（`.transfer-tmp-<taskId>-<UUID>`），不在正式目标文件上直接续传

### 8.3 实现跨存储传输编排（CrossStorageTransfer）
- [ ] 实现本地↔SMB、SMB↔SMB、本地↔本地跨存储传输编排（`core/transfer/CrossStorageTransferImpl.java`）
- [ ] 实现源读取流→目标写入流→校验的统一编排逻辑
- [ ] 实现跨存储复制 SHA-256 校验，校验不通过不标记成功

### 8.4 实现安全写入事务（SafeWriteTransaction）
- [ ] 实现"临时文件→校验→版本复核→原子替换→失败回滚"安全写入策略（`core/transfer/SafeWriteTransaction.java`），基于 M2-A 验证的 SMB 操作序列
- [ ] 实现临时文件确定性命名与隔离（目标文件名+任务ID+时间戳），并发回写同一目录时各任务临时文件命名唯一
- [ ] 实现写入中途失败时回滚：删除临时文件，原文件不被破坏
- [ ] 实现校验失败时回滚：保留临时文件供重试，原文件不被破坏
- [ ] 实现替换前版本复核：再次检查目标文件 mtime+SHA-256，与编辑开始时基线比较，不一致则中止替换并提示冲突
- [ ] 实现 SMB 原子重命名操作完成最终替换，处理 oplock/lease 文件占用场景
- [ ] 实现每步操作的失败回滚策略（基于 M2-A 协议级验证结果）
- [ ] 实现最终校验与提交后方可标记成功
- [ ] 实现残留临时文件处理：应用启动时扫描清理超期残留临时文件，清理操作记录审计日志

### 8.5 实现完整性校验引擎
- [ ] 实现 `IntegrityChecker` 接口：流式 computeSha256、computeMd5、verify（`core/checksum/IntegrityCheckerImpl.java`）
- [ ] 实现流式 SHA-256 计算，不将文件整体载入内存
- [ ] 实现传输/回写前后 SHA-256 比对，校验通过方可标记成功
- [ ] 实现 MD5 快速校验选项（非安全用途，完整性验收以 SHA-256 为准）

### 8.6 实现断点续传安全恢复验证
- [ ] 实现续传恢复时验证三要素：任务身份匹配、源文件未变更（SHA-256）、目标临时文件状态一致
- [ ] 实现三要素任一不匹配时从头传输，不冒险续传
- [ ] 持久化任务上下文信息：任务标识、临时文件标识、源文件版本信息、已确认偏移及完整性校验信息

---

## 9. 持久化传输队列与文件操作（FD-06）

> **阶段**：P0 | **优先级**：Must | **依赖**：M2-A 门禁通过 + 第 8 节

### 9.1 实现持久化传输队列引擎
- [ ] 实现 `TransferQueueManager` 接口：enqueue、pause、resume、cancel、retry、getQueueStatus、restorePendingTasks（`core/transfer/TransferQueueManagerImpl.java`）
- [ ] 实现应用重启后恢复未完成任务队列（`restorePendingTasks`）
- [ ] 实现重复操作防护：入队前检查相同源→目标任务是否正在进行

### 9.2 实现文件操作编排
- [ ] 实现复制/移动/重命名/删除操作编排，入传输队列执行（`orchestration/FileOperationOrchestrator.java`）
- [ ] 实现本地↔共享互操作与共享间互操作
- [ ] 实现重命名/删除操作审计日志记录（删除为不可逆操作）
- [ ] 实现文件被占用时提示而非静默失败

### 9.3 实现同名冲突检测与处理
- [ ] 实现目标同名文件冲突检测，提示覆盖/跳过/重命名选项
- [ ] 实现禁止静默覆盖，用户决策后方可执行
- [ ] 实现冲突决策记忆（批量操作中"全部覆盖/全部跳过"选项）

---

## 10. 网络恢复与重试退避（FD-08）

> **阶段**：P0 | **优先级**：Must | **依赖**：M2-A 门禁通过 + 第 8-9 节

### 10.1 实现网络状态监听
- [ ] 实现 `NetworkRecoveryService` 接口：startMonitoring、stopMonitoring、registerRecoverable（`core/network/NetworkRecoveryServiceImpl.java`）
- [ ] 实现网络状态广播接收：Wi-Fi 连接/断开、网络切换、连接超时
- [ ] 实现 SMB 会话失效检测与自动重建触发
- [ ] 实现网络不可用时暂停所有进行中任务（持久化状态）并显示等待

### 10.2 实现自动会话重建与续传
- [ ] 实现网络恢复后自动重建 SMB 会话（如已失效）
- [ ] 实现网络恢复后自动续传挂起的可恢复任务
- [ ] 实现续传完成后 SHA-256 校验，确认数据完整

### 10.3 实现重试退避框架
- [ ] 实现指数退避重试策略，上限 5 次（M1 冻结值）（`core/retry/RetryBackoffFramework.java`）
- [ ] 实现重试次数耗尽后标记任务失败，保留任务供用户手动重试
- [ ] 实现连接超时与会话失效的退避重试调度
- [ ] 实现网络不可用时明确显示等待或失败状态，禁止伪报成功

---

## 11. WPS 编辑会话与可靠回写（FD-03, FD-04, FD-05）

> **阶段**：P0 | **优先级**：Must | **依赖**：M2-A 门禁通过 + 第 5-8 节 | **项目成败点**

> WPS 文件交付方式须使用 M2-A 门禁冻结的最终方式。

### 11.1 实现编辑会话管理
- [ ] 实现 `EditSessionManager` 接口：createSession、getSession、detectSave、writeBack、abandonSession、checkConflict（`core/edit/EditSessionManagerImpl.java`）
- [ ] 实现编辑会话状态机：已打开→编辑中→已保存待回写→回写中→回写成功/失败/冲突/已放弃
- [ ] 实现会话状态迁移持久化与单会话串行执行
- [ ] 实现编辑会话缓存副本管理与空间检查

### 11.2 实现版本基线与冲突检测
- [ ] 实现编辑会话开始时计算共享文件 SHA-256 与修改时间作为版本基线（`core/edit/VersionBaselineService.java`）
- [ ] 实现 `ConflictDetector` 接口：回写前查询共享当前版本（mtime + SHA-256）与基线比对（`core/edit/ConflictDetectorImpl.java`）
- [ ] 实现冲突判定同时比较修改时间与内容指纹，任一变化即判定为冲突
- [ ] 实现冲突时禁止静默覆盖，提示用户选择"保存为副本/重新加载/经明确确认后覆盖/放弃"
- [ ] 实现覆盖前再次确认目标文件版本（mtime+SHA-256），避免二次竞争

### 11.3 实现 WPS 文件交付
- [ ] 实现 `WpsDeliveryHandler` 接口：deliver、resolveResultFile（`core/wps/WpsDeliveryHandlerImpl.java`）
- [ ] 实现优先 ContentProvider/URI 交付，回退临时文件交付（M2-A 冻结方式）
- [ ] 实现文件类型→应用选择调度，优先 WPS，回退系统选择

### 11.4 实现 WPS 保存变更检测
- [ ] 实现文件变更监听（FileObserver）+ ContentProvider 回调 + 指纹比对综合判定
- [ ] 实现本地副本变更检测，未变更时不触发回写
- [ ] 实现暂停/恢复变更监听时机控制（回写期间暂停监听）

### 11.5 实现可靠回写引擎
- [ ] 实现 `WriteBackEngine` 接口：writeBack（`core/edit/WriteBackEngineImpl.java`）
- [ ] 实现回写流程：版本基线冲突检测→流式回写（安全写入事务）→SHA-256 校验→状态更新
- [ ] 实现回写成功且校验通过方显示"已保存到共享"
- [ ] 实现回写失败或校验不通过时显示保存失败，保留本地副本供重试，原文件未被破坏

### 11.6 实现 WPS 另存为与临时文件识别
- [ ] 实现 WPS 另存为新文件识别，提示用户选择回写为新文件或覆盖原文件
- [ ] 实现临时文件识别（`~$` 前缀、`.tmp` 后缀），过滤临时文件识别最终结果文件
- [ ] 实现文件名/路径模式匹配规则配置

### 11.7 实现编辑会话编排
- [ ] 实现打开→交付→保存检测→回写全流程编排（`orchestration/EditSessionOrchestrator.java`）
- [ ] 实现回写完成后更新目录列表状态与修改时间
- [ ] 实现编辑会话异常场景处理：目标文件被占用、回写过程网络中断、回写校验不通过

---

## 12. 无感打开（FD-03）

> **阶段**：P0 | **优先级**：Must | **依赖**：M2-A 门禁通过 + 第 11 节

### 12.1 实现直接打开调度
- [ ] 实现用户点击共享文件后自动选择合适应用（优先 WPS）打开（`orchestration/OpenOrchestrator.java`）
- [ ] 实现文件类型识别与应用选择策略（`core/wps/FileAppResolver.java`）
- [ ] 实现打开失败时如实显示失败及原因，不隐藏为成功
- [ ] 实现无合适应用时提示用户并建议安装

### 12.2 实现大文件流式缓存
- [ ] 实现大文件打开时流式/分块缓存，避免整体载入内存（`core/edit/StreamCacheService.java`）
- [ ] 实现本地缓存空间不足时提示，不开始下载
- [ ] 实现打开过程中网络中断时暂停下载，恢复后续传或提示重试

### 12.3 实现状态及时更新
- [ ] 实现编辑保存返回资源管理器后文件状态与修改时间及时更新
- [ ] 实现目录列表状态刷新机制

---

## 13. 基础安全事件日志（FD-17）

> **阶段**：P0+P1 | **优先级**：Should | **依赖**：M2-A 门禁通过 + 第 6 节

> FD-17 仅覆盖基础安全事件记录与脱敏，不包含审计日志查询界面、导出、长期留存、防篡改增强、合规报告等高级能力（归入 P4）。

### 13.1 实现审计日志记录
- [ ] 实现关键操作审计记录：连接建立、文件写入、删除、重命名、回写（`infrastructure/audit/AuditLogService.java`）
- [ ] 实现审计日志含操作类型、目标、时间、结果，且脱敏
- [ ] 实现审计日志定期轮转与导出
- [ ] 实现日志写入失败不阻塞主操作，但须告警

### 13.2 实现诊断信息导出
- [ ] 实现用户触发导出脱敏诊断包（操作日志 + 错误分类 + 环境信息）（`infrastructure/audit/DiagnosticExporter.java`）
- [ ] 确保导出信息不含密码、凭据、文件敏感内容

### 13.3 验证安全默认开启
- [ ] 验证应用首次启动时密码加密存储、日志脱敏、敏感操作确认均已默认启用
- [ ] 验证安全策略不依赖用户主动开启

---

## 14. 对外接口（第三方应用访问）

> **阶段**：P0 | **优先级**：Must | **依赖**：M2-A 门禁通过 + 第 5-7 节

### 14.1 实现 ContentProvider 共享文件访问
- [ ] 实现 `SmbFileContentProvider`，URI 格式 `content://com.pad2.v1/shared/<configId>/<path>`（`infrastructure/provider/SmbFileContentProvider.java`）
- [ ] 实现 openFile、query、cursor 等标准 ContentProvider 操作
- [ ] 实现第三方应用 URI 授权（grantUriPermission）与权限校验，未授权拒绝访问

### 14.2 实现 Intent 接口
- [ ] 实现响应第三方应用打开共享文件的 Intent（`infrastructure/provider/FileOpenIntentReceiver.java`）
- [ ] 实现接口变更兼容策略：版本化 URI，变更时提供迁移说明

---

## 15. P0 门禁评审

> **阶段**：P0 门禁 | **优先级**：Must | **依赖**：第 5-14 节全部完成

### 15.1 P0 门禁评审
- [ ] 验证 FD-01~FD-08、FD-17 所有首期 P0 交付项实现完成
- [ ] 验证统一文件操作接口与协议能力声明机制正确实现
- [ ] 验证统一传输任务引擎协议无关性
- [ ] 验证 WPS 编辑保存回写闭环在代表性设备上端到端通过
- [ ] 验证冲突保护与断网恢复有实测证据
- [ ] 验证基础安全事件日志记录与脱敏正确
- [ ] 通过代表性编译环境产出可测试 APK 并安装到代表性设备
- [ ] P0 门禁通过后方可批准进入 P1（第 16-23 节）

---

## 16. 本地适配器与本地存储浏览（FD-09，模块 I1）

> **阶段**：P1 | **优先级**：Should | **依赖**：P0 门禁通过（第 15 节）+ 第 5 节

### 16.1 实现本地适配器（LocalAdapter）
- [ ] 实现 `LocalAdapter` 类，实现 `UnifiedFileOperations` 接口，基于 SAF/DocumentFile（`adapter/LocalAdapter.java`）
- [ ] 声明本地协议能力：原子替换✓、随机读写✓、重命名✓、续传✓、版本查询✓
- [ ] 将 SAF/DocumentFile 操作映射为统一接口方法

### 16.2 实现本地存储浏览
- [ ] 实现通过 SAF 浏览本地存储与 SD 卡（`core/local/LocalExplorerImpl.java`）
- [ ] 实现 DocumentFile 遍历与 SAF 持久化授权管理
- [ ] 实现 SD 卡挂载/卸载检测与提示
- [ ] 实现权限不足时提示用户授权

### 16.3 验证本地适配器能力
- [ ] 验证 SAF 持久化授权在目标设备上的行为
- [ ] 验证本地适配器通过统一文件操作接口正确执行所有操作
- [ ] 在最低支持版本以上按三层兼容性模型逐版本验证 SAF 行为

---

## 17. 本地文件操作（FD-10, FD-11，模块 I2）

> **阶段**：P1 | **优先级**：Should | **依赖**：P0 门禁通过 + 第 5、16 节

### 17.1 实现本地文件操作
- [ ] 实现本地复制/移动/重命名/删除通过统一文件操作接口（`core/local/LocalFileOperationsImpl.java`）
- [ ] 实现本地↔本地、本地↔SMB 跨存储复制/移动，通过统一传输任务引擎执行
- [ ] 实现操作失败时不破坏原文件

### 17.2 实现重命名能力降级
- [ ] 实现通过协议能力声明检查重命名支持，不支持时降级为"复制到新名称→删除原文件"
- [ ] 实现降级时提示用户操作策略

### 17.3 实现文件操作审计
- [ ] 实现复制/移动/重命名操作审计日志记录
- [ ] 实现删除操作审计日志记录（删除为不可逆操作）

---

## 18. 回收站与远程删除行为（FD-12，模块 I3, I4）

> **阶段**：P1 | **优先级**：Should | **依赖**：P0 门禁通过 + 第 5-6 节

### 18.1 实现回收站管理（RecycleBin）
- [ ] 实现 `RecycleBinManager` 接口：moveToRecycleBin、restoreFromRecycleBin、purgeFromRecycleBin、listRecycleBinEntries、clearExpiredEntries（`core/recycle/RecycleBinManagerImpl.java`）
- [ ] 实现本地删除文件移入应用私有目录暂存，记录元数据
- [ ] 实现回收站恢复：文件内容与删除前逐字节一致
- [ ] 实现回收站彻底清除：清除后不可恢复
- [ ] 实现回收站容量与保留期限管理，自动清理超期记录

### 18.2 实现远程删除行为（RemoteDeleteBehavior）
- [ ] 实现远程删除明确区分是否可恢复（`core/recycle/RemoteDeleteBehaviorImpl.java`）
- [ ] 实现远程删除无可恢复暂存机制时显示"此操作不可恢复"警告并要求二次确认
- [ ] 实现远程删除准确报告操作结果，禁止伪报成功
- [ ] 实现不得使用与本地删除相同的"移入回收站"措辞误导用户

### 18.3 验证回收站可靠性
- [ ] 验证本地删除文件后从回收站恢复，文件内容与删除前逐字节一致
- [ ] 验证彻底清除后不可恢复
- [ ] 验证远程删除显示不可恢复警告并要求二次确认

---

## 19. 完整性校验用户接口（FD-13，模块 I5）

> **阶段**：P1 | **优先级**：Should | **依赖**：P0 门禁通过 + 第 8.5 节

### 19.1 实现校验用户接口
- [ ] 实现 MD5/SHA-256 校验用户交互界面（`src/ui/ChecksumTool.tsx`）
- [ ] 实现文件选择→流式哈希计算→结果展示
- [ ] 实现 SHA-256 为完整性验收判据，MD5 仅作为快速校验选项
- [ ] 实现校验结果可导出，不泄露文件内容

### 19.2 集成校验到传输与回写
- [ ] 验证所有传输/回写 SHA-256 校验通过方可标记成功
- [ ] 验证校验不通过时显示失败，不标记成功

---

## 20. ZIP 压缩解压（FD-14，模块 I6）

> **阶段**：P1 | **优先级**：Should | **依赖**：P0 门禁通过 + 第 8 节

### 20.1 实现 ZIP 压缩解压
- [ ] 实现 `ArchiveManager` 接口：compress、extract、listEntries（`core/archive/ArchiveManagerImpl.java`）
- [ ] 实现 ZIP 压缩与解压，基于 Apache Commons Compress / zip4j 流式处理（`infrastructure/archive/ZipArchiveLib.java`）
- [ ] 实现流式解压，不将整个压缩包加载到内存
- [ ] 实现解压产物完整性校验

### 20.2 实现压缩解压编排
- [ ] 实现压缩/解压任务编排，通过统一传输任务引擎流式处理（`orchestration/ArchiveOrchestrator.java`）
- [ ] 实现压缩/解压操作审计日志记录
- [ ] 实现解压失败不破坏原压缩包

### 20.3 验证 ZIP 性能
- [ ] 验证大压缩包流式解压，内存占用不超限
- [ ] 验证解压产物完整性可校验

---

## 21. 批量操作与多选（FD-15，模块 I8, H3）

> **阶段**：P1 | **优先级**：Should | **依赖**：P0 门禁通过 + 第 8-9 节

### 21.1 实现批量子任务编排（BatchTransferOrchestration）
- [ ] 实现批量操作拆分为子任务粒度，逐文件进度与校验（`core/transfer/BatchTransferOrchestratorImpl.java`）
- [ ] 实现已校验文件清单持久化，恢复时不重复传输已校验文件
- [ ] 实现批量操作部分失败时显示成功与失败清单，失败项可重试
- [ ] 实现并行/串行调度策略

### 21.2 实现多选与批量操作交互（MultiSelectBatch）
- [ ] 实现 UI 层多选状态管理（`src/ui/MultiSelectManager.ts`）
- [ ] 实现多选文件集合 + 操作类型→批量任务触发
- [ ] 实现批量操作整体进度与单文件结果展示
- [ ] 实现冲突决策记忆（"全部覆盖/全部跳过"选项）

### 21.3 验证批量操作可靠性
- [ ] 验证批量复制 100 文件，10 个失败时失败文件可重试，成功文件不重复
- [ ] 验证批量操作过程中内存占用不超限

---

## 22. 隐藏文件管理（FD-16，模块 I7）

> **阶段**：P1 | **优先级**：Should | **依赖**：P0 门禁通过 + 第 5 节

### 22.1 实现隐藏文件管理
- [ ] 实现隐藏文件显示/隐藏切换（`core/local/HiddenFileManagementImpl.java`）
- [ ] 实现文件名点前缀（`.filename`）/属性标记识别隐藏文件
- [ ] 实现目录浏览时隐藏文件过滤/展示策略
- [ ] 实现隐藏/显示操作审计日志记录

### 22.2 验证隐藏文件管理
- [ ] 验证切换隐藏文件可见性，隐藏文件正确显示/隐藏
- [ ] 验证切换失败不影响文件本身

---

## 23. P1 门禁评审

> **阶段**：P1 门禁 | **优先级**：Must | **依赖**：第 16-22 节全部完成

### 23.1 P1 门禁评审
- [ ] 验证 FD-09~FD-16 所有首期 P1 交付项实现完成
- [ ] 验证本地/SD 卡文件操作正确，失败时原文件不被破坏
- [ ] 验证回收站与校验可用
- [ ] 验证本地适配器通过统一文件操作接口正确实现
- [ ] 验证 ZIP 压缩解压产物完整性校验
- [ ] 验证批量操作部分失败可恢复
- [ ] 验证隐藏文件显示/隐藏切换正确
- [ ] P1 门禁通过后方可批准进入 P2（第 31 节）

---

## 24. 安全与审计完善

> **阶段**：P0+P1 横切 | **优先级**：Must | **依赖**：第 6、13 节

### 24.1 完善凭据安全存储
- [ ] 验证所有远程存储（SMB/FTP/SFTP/WebDAV/云盘）账号密码全部通过 `CredentialVault` 加密存储，无明文落盘
- [ ] 验证日志、界面、SharedPreferences 中均不出现密码明文
- [ ] 实现凭据存储不可用时拒绝存储并提示启用设备安全

### 24.2 验证最小权限
- [ ] 审查 AndroidManifest.xml 权限清单，每项权限均有对应功能用途且无可裁剪冗余权限
- [ ] 按 M1 确定的 minSdkVersion/targetSdkVersion 确定最终权限集
- [ ] targetSdkVersion >= 29 采用分区存储/SAF 适配，不申请不必要的传统存储权限
- [ ] 验证前台服务类型声明与行为（Android 14+ 须声明 foregroundServiceType）
- [ ] 验证 MANAGE_EXTERNAL_STORAGE 为最后手段：优先验证应用私有缓存与 SAF 持久化授权能否满足需求

---

## 25. 表现层 UI 实现

> **阶段**：P0+P1 横切 | **优先级**：Must | **依赖**：第 5-22 节

### 25.1 实现多协议文件管理器 UI
- [ ] 实现多协议连接配置增删改查界面与连接测试交互（`src/ui/ConnectionManagement.tsx`）
- [ ] 实现凭据输入界面，密码不明文显示
- [ ] 实现多共享入口列表与切换浏览

### 25.2 实现资源管理器 UI
- [ ] 实现目录浏览界面，分页加载与首屏优先渲染（`src/ui/Explorer.tsx`）
- [ ] 实现搜索栏与排序选项（名称/大小/修改时间，升序/降序）
- [ ] 实现文件属性展示面板
- [ ] 实现收藏列表与快速访问入口
- [ ] 实现文件操作菜单（复制/移动/重命名/删除/打开/收藏/校验/压缩）

### 25.3 实现传输队列 UI
- [ ] 实现传输进度显示（整体进度与单文件进度）（`src/ui/TransferQueue.tsx`）
- [ ] 实现暂停/取消/重试交互
- [ ] 实现失败原因显示与重试入口
- [ ] 实现批量操作部分成功与失败清单展示

### 25.4 实现编辑会话 UI
- [ ] 实现编辑状态展示（已打开/编辑中/回写中/回写成功/失败/冲突）（`src/ui/EditSession.tsx`）
- [ ] 实现冲突提示与用户决策交互（保存为副本/重新加载/经明确确认后覆盖/放弃）
- [ ] 实现另存为提示与处理方式选择
- [ ] 实现回写结果通知（成功/失败）

### 25.5 实现回收站 UI
- [ ] 实现回收站浏览、恢复、彻底清除界面（`src/ui/RecycleBin.tsx`）
- [ ] 实现远程删除不可恢复警告与二次确认

### 25.6 实现校验/压缩 UI
- [ ] 实现 MD5/SHA-256 校验交互界面（`src/ui/ChecksumTool.tsx`）
- [ ] 实现 ZIP 压缩/解压交互界面（`src/ui/ArchiveTool.tsx`）

### 25.7 实现设置与诊断 UI
- [ ] 实现设置界面（`src/ui/Settings.tsx`）
- [ ] 实现诊断信息导出入口
- [ ] 实现网络状态显示（可用/不可用/等待恢复）
- [ ] 实现隐藏文件显示/隐藏切换开关

### 25.8 实现 Capacitor 插件桥接
- [ ] 实现 `Pad2Plugin` Capacitor 插件桥接 TS↔Java（`src/plugins/Pad2Plugin.ts` + `android/.../Pad2Plugin.java`）
- [ ] 实现桥接接口方法签名版本化，新增参数使用可选默认值

---

## 26. 集成测试与门禁

> **阶段**：P0+P1 横切 | **优先级**：Must | **依赖**：第 5-25 节

### 26.1 单元测试
- [ ] 编写统一文件操作接口单元测试，覆盖所有协议适配器
- [ ] 编写协议能力声明单元测试，覆盖能力检查与降级策略
- [ ] 编写 SMBJ 封装层单元测试，覆盖会话建立/枚举/读写/异常分类
- [ ] 编写统一传输任务引擎单元测试，覆盖流式读写/断点续传/进度上报/跨存储传输
- [ ] 编写完整性校验引擎单元测试，覆盖流式 SHA-256/MD5 计算与比对
- [ ] 编写安全写入事务单元测试，覆盖成功/写入失败/校验失败/原子替换失败回滚
- [ ] 编写传输队列状态机单元测试，覆盖所有状态迁移与持久化恢复
- [ ] 编写编辑会话状态机单元测试，覆盖所有状态迁移与冲突检测
- [ ] 编写 Keystore 凭据加密单元测试，覆盖加密存储/解密读取/Keystore 不可用
- [ ] 编写日志脱敏单元测试，覆盖密码/凭据/文件内容脱敏
- [ ] 编写回收站单元测试，覆盖移入/恢复/清除/过期清理

### 26.2 集成测试
- [ ] 编写 SMB 连接→目录浏览→文件操作端到端集成测试
- [ ] 编写统一传输任务引擎→流式传输→完整性校验→断点续传集成测试
- [ ] 编写编辑会话→WPS 交付→保存检测→回写校验集成测试
- [ ] 编写网络中断→自动恢复→续传集成测试
- [ ] 编写冲突检测→用户决策→保存为副本/重新加载/覆盖/放弃集成测试
- [ ] 编写本地适配器→文件操作→回收站集成测试
- [ ] 编写 ZIP 压缩解压→产物校验集成测试
- [ ] 编写批量操作→子任务编排→部分失败恢复集成测试

### 26.3 门禁评审
- [ ] 验证共享目录浏览、文件操作、传输队列、缓存、重试、冲突处理、安全凭据管理全部实现
- [ ] 验证统一文件操作接口与协议能力声明机制正确
- [ ] 验证单元/集成测试全部通过
- [ ] 通过代表性编译环境产出可测试 APK 并安装到代表性设备

---

## 27. 规模与可靠性验收

> **阶段**：P0+P1 验收 | **优先级**：Must | **依赖**：第 26 节

### 27.1 功能测试
- [ ] 在代表性设备、真实 Windows 共享、目标无线网络中执行全功能测试
- [ ] 验证 FD-01~FD-17 所有首期交付项验收条件达标

### 27.2 压力测试
- [ ] 执行大文件基线测试：传输 1 GiB 文件，内存不超限，SHA-256 校验通过
- [ ] 执行批量文件基线测试：批量复制 10,000 个混合大小文件，全部完成且逐个校验通过
- [ ] 执行目标并发用户数下成功率测试（目标并发用户数待业务确认）

### 27.3 断网恢复测试
- [ ] 验证 Wi-Fi 切换时会话重建且可恢复任务继续
- [ ] 验证短暂断网后恢复，可恢复任务自动继续且数据完整
- [ ] 验证 SMB 会话失效后自动重建且任务继续
- [ ] 验证应用重启后任务队列恢复且可续传

### 27.4 数据完整性测试
- [ ] 验证所有传输/回写 SHA-256 校验通过方可标记成功
- [ ] 验证覆盖写入中途失败时原文件不被破坏
- [ ] 验证两台设备同时编辑不静默丢失更新

### 27.5 安全测试
- [ ] 验证凭据加密存储，检查本地存储与日志无密码明文
- [ ] 验证日志脱敏，抓取任意日志条目不含密码明文与文件内容明文
- [ ] 验证最小权限，审查权限清单每项均有对应功能用途
- [ ] 验证关键操作审计日志可追溯

### 27.6 多设备兼容性矩阵测试
- [ ] 在已验证环境清单中所有设备/Android 版本/WPS 版本组合上执行兼容性矩阵测试
- [ ] 对每个组合验证 FD-01~FD-17 核心功能
- [ ] 记录每个组合的测试结果：设备型号、系统版本、WPS 版本、测试用例、结果、已知限制
- [ ] 未测试组合标注"未验证"，不得宣称兼容
- [ ] 更新已验证环境清单（活文档），确保持续更新

### 27.7 客户端与服务端承载能力分开验证
- [ ] 出具客户端承载能力报告（单台及多台平板并发吞吐与成功率）
- [ ] 出具服务端承载能力报告（服务器性能、SMB 配置、无线网络、认证体系承载上限）
- [ ] 明确区分瓶颈来源（客户端/服务端/网络），不混淆

### 27.8 验收门禁评审
- [ ] 汇总功能/压力/断网恢复/数据完整性/安全测试报告
- [ ] 汇总多设备兼容性矩阵测试报告，确认已验证环境清单完整
- [ ] 全部达标方可发布，未达标项记录整改计划
- [ ] 通过代表性编译环境产出发布 APK

---

## 28. 部署与发布

> **阶段**：P0+P1 发布 | **优先级**：Must | **依赖**：第 27 节

### 28.1 远程编译流程固化
- [ ] 固化远程编译脚本（PowerShell）：源码同步→远程 Gradle 编译→APK 产物回传→adb install
- [ ] 验证远程编译流程可重复执行且稳定产出 APK

### 28.2 版本管理与发布
- [ ] 在新仓库 `wujupeng/andriodpad2` 打发布版本标签
- [ ] 更新 `main` 分支为稳定发布版本
- [ ] 编写发布说明，包含最低 Android 支持版本、WPS 已验证版本清单、已验证环境清单、SMB 协议要求、未验证组合标注

### 28.3 兼容性测试
- [ ] 在最低支持版本以上按三层兼容性模型执行 Android 版本兼容性测试
- [ ] 在 WPS 已验证版本清单范围内执行兼容性测试
- [ ] 超出已验证环境清单范围标注"未验证"，不得宣称兼容
- [ ] 更新已验证环境清单，确保持续更新

### 28.4 文档更新
- [ ] 更新接口文档（ContentProvider/Intent/Capacitor 插件桥接/统一文件操作接口）
- [ ] 编写运维手册（远程编译服务器使用、凭据迁移、诊断导出）
- [ ] 编写用户使用手册（共享配置、文件浏览、编辑保存、传输管理、回收站、校验、压缩）

---

## 29. 评审与验证

> **阶段**：P0+P1 最终验证 | **优先级**：Must | **依赖**：第 28 节

### 29.1 代码审查
- [ ] 对关键模块（统一文件操作接口、安全写入事务、回写引擎、冲突检测、凭据加密、回收站）进行代码审查
- [ ] 审查分层架构依赖方向是否合规
- [ ] 审查所有禁止项是否落实（禁止静默覆盖、禁止伪报成功、禁止明文存储、禁止整体载入内存、禁止远程删除承诺无法实现的恢复能力）

### 29.2 设计回顾
- [ ] 核对 spec.md 需求规格与实现的一致性，所有 FD-01~FD-17 验收条件覆盖
- [ ] 核对 design.md 技术设计与实现的一致性，所有接口与数据模型落实
- [ ] 核对五项产品架构原则（统一文件操作接口、统一传输任务引擎、工具模块化、安全默认开启、兼容性按证据管理）全部落实
- [ ] 核对三层兼容性模型与多设备兼容策略在 spec.md/design.md/tasks.md 中一致表述

### 29.3 变更确认
- [ ] 确认变更范围与 spec.md/design.md 冻结项一致
- [ ] 确认阶段门禁逐级通过（M0→M1→M2-A→P0→P1），无跳级
- [ ] 确认客户端与服务端承载能力分开出具报告
- [ ] 确认首期范围（P0+P1）独立控制，不含 P2-P4 扩展功能

---

## 30. 首期交付总结

> **阶段**：P0+P1 完成 | **优先级**：Must | **依赖**：第 29 节

### 30.1 首期交付确认
- [ ] 确认 FD-01~FD-17 全部首期交付项实现完成且验收通过
- [ ] 确认 P0 门禁（M2-A WPS 技术验证）通过
- [ ] 确认 P1 验收（文件操作正确，失败不破坏原文件）通过
- [ ] 确认首期范围独立控制，未因 P2-P4 扩展清单膨胀而延期
- [ ] 确认已验证环境清单完整，未测试组合标注"未验证"
- [ ] 确认 M2-B API 36 兼容性评估完成，targetSdkVersion 已由 PM 正式裁定

---

## 31. P2 网络协议扩展

> **阶段**：P2 | **优先级**：Could | **依赖**：P1 验收通过（第 23 节）+ 独立需求规格与架构设计

> **前置条件**：P1 验收通过。须新增独立需求规格与架构设计，不能仅凭产品范围蓝图直接启动。

### 31.1 P2 独立规格与设计
- [ ] 新增 P2 网络扩展独立需求规格（FTP/SFTP/WebDAV/蓝牙/RAR/7Z）
- [ ] 新增 P2 协议适配层架构设计
- [ ] PM 阶段审批批准 P2 启动

### 31.2 实现 FTP 适配器（模块 J1）
- [ ] 实现 `FtpAdapter` 类，实现 `UnifiedFileOperations` 接口，基于 Apache Commons Net FTPClient（`adapter/FtpAdapter.java` + `infrastructure/ftp/FtpClientWrapper.java`）
- [ ] 声明 FTP 协议能力：原子替换✗、重命名✓（RNFR/RNTO）、续传✓（REST 命令）
- [ ] 实现 FTP over TLS 优先，禁止未加密 FTP 作为默认连接
- [ ] 独立验证 FTP 认证/传输/错误恢复

### 31.3 实现 SFTP 适配器（模块 J2）
- [ ] 实现 `SftpAdapter` 类，实现 `UnifiedFileOperations` 接口，基于 JSch/sshj（`adapter/SftpAdapter.java` + `infrastructure/sftp/SftpClientWrapper.java`）
- [ ] 声明 SFTP 协议能力：原子替换✓、重命名✓、续传✓、SSH 加密全链路
- [ ] 实现密钥指纹验证
- [ ] 独立验证 SFTP 认证/传输/错误恢复

### 31.4 实现 WebDAV 适配器（模块 J3）
- [ ] 实现 `WebDavAdapter` 类，实现 `UnifiedFileOperations` 接口，基于 sardine/OkHttp（`adapter/WebDavAdapter.java` + `infrastructure/webdav/WebDavClientWrapper.java`）
- [ ] 声明 WebDAV 协议能力：原子替换依赖服务器、重命名✓（MOVE）、续传依赖 Range 支持
- [ ] 实现 HTTPS 优先
- [ ] 独立验证 WebDAV 认证/传输/错误恢复

### 31.5 实现蓝牙传输（模块 J4）
- [ ] 实现蓝牙文件传输，基于 Android Bluetooth API（`core/bluetooth/BluetoothTransferImpl.java`）
- [ ] 实现设备配对确认与文件传输
- [ ] 独立验证蓝牙传输

### 31.6 验证 RAR/7Z 依赖并实现（模块 J5）
- [ ] 验证 junrar 库许可与维护状态（格式支持范围、许可证、最新提交与 issue 状态）
- [ ] 验证 SevenZipJ 库许可与维护状态
- [ ] 实现 RAR 压缩解压，基于 junrar / Apache Commons Compress 流式处理（`infrastructure/archive/RarArchiveLib.java`）
- [ ] 实现 7Z 压缩解压，基于 SevenZipJ / Apache Commons Compress 流式处理（`infrastructure/archive/SevenZipArchiveLib.java`）
- [ ] 实现解压产物完整性校验

### 31.7 P2 门禁评审
- [ ] 验证 FTP/SFTP/WebDAV/蓝牙各自独立验证认证、传输、错误恢复
- [ ] 验证 RAR/7Z 库许可与维护状态已验证并记录
- [ ] 验证所有协议适配器通过统一文件操作接口正确实现
- [ ] P2 门禁通过后方可批准进入 P3

---

## 32. P3 云盘与工具

> **阶段**：P3 | **优先级**：Later | **依赖**：P2 验收通过（第 31.7 节）+ 独立需求规格与架构设计

> **前置条件**：P2 验收通过。须新增独立需求规格与架构设计。云盘须逐个服务商定义独立规格。

### 32.1 P3 独立规格与设计
- [ ] 新增 P3 云盘与工具独立需求规格
- [ ] 新增 P3 工具模块架构设计（独立 Gradle feature module）
- [ ] PM 阶段审批批准 P3 启动

### 32.2 实现云盘适配器框架（模块 K1）
- [ ] 实现 `CloudAdapterFramework` 云盘统一适配框架（`adapter/cloud/CloudAdapterFramework.java`）
- [ ] 逐个服务商定义独立规格：OneDrive、Google Drive、Dropbox（各须 OAuth 授权、令牌撤销、API 限制定义）
- [ ] 实现 OAuth 2.0 授权→令牌加密存储→API 调用
- [ ] 声明云盘协议能力（依赖 API）

### 32.3 实现多媒体播放器（模块 K2，独立 feature module）
- [ ] 创建多媒体播放器独立 Gradle feature module（`android/tool-modules/media-player/`）
- [ ] 实现音视频播放、倍速、小窗，基于 ExoPlayer（`tool-modules/media-player/MediaPlayerImpl.java`）
- [ ] 验证工具模块独立依赖管理，失败不影响文件管理主功能

### 32.4 实现 PDF 查看与编辑（模块 K3，独立 feature module）
- [ ] 创建 PDF 编辑器独立 Gradle feature module（`android/tool-modules/pdf-editor/`）
- [ ] 实现 PDF 查看与编辑回写，基于 PdfBox-Android / MuPDF（`tool-modules/pdf-editor/PdfEditorImpl.java`）
- [ ] 实现编辑回写经统一文件操作接口
- [ ] 验证工具模块独立依赖管理

### 32.5 实现阅读器与代码编辑器（模块 K4，独立 feature module）
- [ ] 创建阅读器/代码编辑器独立 Gradle feature module（`android/tool-modules/reader-code-editor/`）
- [ ] 实现小说阅读，基于 epublib（`tool-modules/reader-code-editor/EpubReaderImpl.java`）
- [ ] 实现代码编辑，基于 Monaco Editor / CodeMirror (WebView)（`tool-modules/reader-code-editor/CodeEditorImpl.java`）
- [ ] 实现编辑回写经统一文件操作接口

### 32.6 实现 APK 安装包管理（模块 K5，独立 feature module）
- [ ] 创建 APK 管理器独立 Gradle feature module（`android/tool-modules/apk-manager/`）
- [ ] 实现 APK 安装、备份、提取，基于 PackageInstaller API（`tool-modules/apk-manager/ApkManagerImpl.java`）
- [ ] 实现 APK 来源确认与安装审计

### 32.7 实现存储占用分析（模块 K6，独立 feature module）
- [ ] 创建存储分析独立 Gradle feature module（`android/tool-modules/storage-analyzer/`）
- [ ] 实现存储占用统计与分析，基于 StorageStatsManager / SAF 遍历（`tool-modules/storage-analyzer/StorageAnalyzerImpl.java`）

### 32.8 P3 门禁评审
- [ ] 验证云盘与工具独立模块交付，不阻塞基础文件管理
- [ ] 验证工具模块化隔离：某扩展工具组件崩溃时文件管理主功能仍可正常使用
- [ ] 验证云盘逐个服务商独立规格已定义
- [ ] P3 门禁通过后方可批准进入 P4

---

## 33. P4 安全与高级能力

> **阶段**：P4 | **优先级**：Later | **依赖**：P3 验收通过（第 32.8 节）+ 独立需求规格与架构设计

> **前置条件**：P3 验收通过。须新增独立需求规格与架构设计。

### 33.1 P4 独立规格与设计
- [ ] 新增 P4 安全与高级能力独立需求规格
- [ ] 新增 P4 安全模块架构设计（独立 Gradle feature module）
- [ ] PM 阶段审批批准 P4 启动

### 33.2 实现应用锁（模块 L1，独立 feature module）
- [ ] 创建应用锁独立 Gradle feature module（`android/tool-modules/app-lock/`）
- [ ] 实现应用入口访问控制，生物识别解锁，基于 Android Keystore + BiometricPrompt（`tool-modules/app-lock/AppLockImpl.java`）
- [ ] 验证应用锁不替代文件本身的加密

### 33.3 实现加密保险箱（模块 L2，独立 feature module）
- [ ] 创建加密保险箱独立 Gradle feature module（`android/tool-modules/encrypted-vault/`）
- [ ] 实现文件级加密存储，基于 Android Keystore + AES + 本地持久化（`tool-modules/encrypted-vault/EncryptedVaultImpl.java`）
- [ ] 实现密钥 Keystore 保护，审计加密/解密操作

### 33.4 实现高级审计能力（模块 L3，独立 feature module）
- [ ] 创建高级审计独立 Gradle feature module（`android/tool-modules/advanced-audit/`）
- [ ] 实现审计日志查询界面、导出、长期留存、防篡改、合规报告（`tool-modules/advanced-audit/AdvancedAuditImpl.java`）
- [ ] 基于 FD-17 基础审计扩展

### 33.5 实现 Root 工具（模块 L4，独立 feature module，条件性启用）
- [ ] 创建 Root 工具独立 Gradle feature module（`android/tool-modules/root-tools/`）
- [ ] 实现条件性 Root 能力：Root 检测 + su 执行（`tool-modules/root-tools/RootToolsImpl.java`）
- [ ] 实现仅已 Root 设备启用，普通平板不可用或灰显，不提示强制 Root
- [ ] 实现系统级修改审计

### 33.6 P4 门禁评审
- [ ] 验证权限、数据保护及设备兼容性验证通过
- [ ] 验证 Root 功能条件性启用，普通平板不保证
- [ ] 验证应用锁与文件加密区分明确
- [ ] 验证所有工具模块独立 feature module，失败不影响文件管理主功能
- [ ] P4 门禁通过，产品蓝图全部交付完成

---

## 34. 产品蓝图交付总结

> **阶段**：P0-P4 完成 | **优先级**：Must | **依赖**：第 30、31.7、32.8、33.6 节

### 34.1 五阶段门禁确认
- [ ] 确认 P0 门禁（M2-A WPS 技术验证）通过
- [ ] 确认 P1 验收（文件操作正确，失败不破坏原文件）通过
- [ ] 确认 P2 验收（每协议独立验证认证/传输/错误恢复）通过
- [ ] 确认 P3 验收（独立模块交付，不阻塞基础文件管理）通过
- [ ] 确认 P4 验收（权限/数据保护/设备兼容性验证）通过
- [ ] 确认阶段顺序门禁逐级通过（P0→P1→P2→P3→P4），无跳级

### 34.2 产品架构原则确认
- [ ] 确认统一文件操作接口 + 协议能力声明机制全部实现
- [ ] 确认统一传输任务引擎协议无关性
- [ ] 确认工具模块化隔离（独立 Gradle feature module）
- [ ] 确认安全默认开启（密码加密存储、日志脱敏、敏感操作确认）
- [ ] 确认兼容性按证据管理（三层兼容性模型，已验证环境清单完整）

### 34.3 产品蓝图完整性确认
- [ ] 确认 A 基础文件管理类功能全部交付
- [ ] 确认 B 网络与远程访问类功能全部交付
- [ ] 确认 C 多媒体与内置工具类功能全部交付
- [ ] 确认 D 系统与安全类功能全部交付
- [ ] 确认所有功能项有 MoSCoW 优先级标注和 P0-P4 阶段标注
- [ ] 确认所有功能项有技术依赖、权限要求、安全边界标注

---

# 附录 A：首期交付清单与门禁映射

## A.1 首期交付清单（FD-01~FD-17）

| ID | 功能 | 阶段 | 优先级 | 任务节 | 依赖 | 验收标准 |
|----|------|------|--------|--------|------|---------|
| FD-01 | SMB 连接配置管理 | P0 | Must | 第 7 节 | Keystore 加密存储 | 真实 SMB 服务器连接测试通过 |
| FD-02 | SMB 目录浏览与文件属性 | P0 | Must | 第 7 节 | SMBJ | 打开共享根目录展示文件列表 |
| FD-03 | WPS 无感打开共享文件 | P0 | Must | 第 12 节 | Android SAF/ContentProvider | 点击文件 WPS 打开编辑 |
| FD-04 | WPS 编辑保存可靠回写 | P0 | Must | 第 11 节 | 版本基线 SHA-256+mtime | 编辑保存后回写校验通过 |
| FD-05 | 编辑冲突保护 | P0 | Must | 第 11 节 | 版本基线对比 | 两台设备同时编辑，提示冲突 |
| FD-06 | 文件上传下载 | P0 | Must | 第 8-9 节 | 统一传输任务引擎 | 复制文件到共享并校验 |
| FD-07 | 断点续传 | P0 | Must | 第 8 节 | 持久化任务队列 | 传输中断后恢复续传 |
| FD-08 | Wi-Fi 网络恢复 | P0 | Must | 第 10 节 | 网络状态监听 | 断网恢复后自动续传 |
| FD-09 | 本地存储浏览 | P1 | Should | 第 16 节 | Android SAF | 浏览本地目录，权限不足提示授权 |
| FD-10 | 复制/移动 | P1 | Should | 第 17 节 | 统一文件操作接口 | 复制/移动文件并校验，失败不破坏原文件 |
| FD-11 | 重命名 | P1 | Should | 第 17 节 | 协议能力声明 | 重命名文件内容不变，不支持时降级提示 |
| FD-12 | 删除（本地回收站/远程警告） | P1 | Should | 第 18 节 | 统一文件操作接口+回收站 | 本地可恢复/远程不可恢复警告 |
| FD-13 | SHA-256 完整性校验 | P1 | Should | 第 19 节 | 流式哈希计算 | 传输前后 SHA-256 一致 |
| FD-14 | ZIP 压缩/解压 | P1 | Should | 第 20 节 | Apache Commons Compress/zip4j | 解压产物完整性校验 |
| FD-15 | 批量操作 | P1 | Should | 第 21 节 | 统一传输任务引擎 | 批量复制并逐文件校验，部分失败可恢复 |
| FD-16 | 隐藏文件显示/隐藏切换 | P1 | Should | 第 22 节 | 文件名点前缀/属性标记 | 切换隐藏文件可见性 |
| FD-17 | 基础安全事件日志 | P0+P1 | Should | 第 13 节 | Room/SQLite+日志脱敏 | 关键操作可追溯且脱敏 |

## A.2 五阶段门禁与验收条件

| 阶段 | 门禁 | 通过标准 | 任务节 |
|------|------|---------|--------|
| P0 | M2-A WPS 技术验证 | 真实设备 SMB+WPS 闭环成功，冲突保护与断网恢复有验证证据 | 第 3、15 节 |
| P1 | P1 验收 | 本地/SD 卡文件操作正确，失败时原文件不被破坏，回收站与校验可用 | 第 23 节 |
| P2 | P2 验收 | FTP/SFTP/WebDAV/蓝牙各自独立验证认证、传输、错误恢复 | 第 31.7 节 |
| P3 | P3 验收 | 云盘与工具独立模块交付，不阻塞基础文件管理 | 第 32.8 节 |
| P4 | P4 验收 | 权限/数据保护/设备兼容性验证通过，Root 功能条件性启用 | 第 33.6 节 |

## A.3 M2 子任务门禁映射

| 子任务 | 性质 | 范围 | 门禁作用 | 任务节 |
|--------|------|------|---------|--------|
| M2-A | 主要门禁 | SMB/WPS 打开/编辑/保存/回写/冲突/断网恢复 | M2-A 通过 → P0 门禁通过 → 批准进入 P0 完整实现 | 第 3 节 |
| M2-B | 独立评估 | Capacitor 8/插件/SAF/前台服务/SMBJ 在 API 36 上行为 | M2-B 评估完成 → PM 正式裁定 targetSdkVersion | 第 4 节 |

## A.4 产品架构原则任务映射

| 架构原则 | 实现模块 | 任务节 | 验收标准 |
|---------|---------|--------|---------|
| 统一文件操作接口 + 协议能力声明 | 模块 G（G1-G4） | 第 5 节 | 所有协议适配器实现统一接口并声明能力集合 |
| 统一传输任务引擎 | 模块 H（H1-H4） | 第 8 节 | 协议无关，流式传输，不整体载入内存 |
| 工具模块化 | 模块 K/L 独立 feature module | 第 32-33 节 | 某扩展工具组件失败时文件管理主功能不受影响 |
| 安全默认开启 | 模块 D1-D2 + 安全默认配置 | 第 6、13、24 节 | 应用首次启动时安全策略默认开启 |
| 兼容性按证据管理 | 三层兼容性模型 | 第 1.5、3.10、27.6 节 | 每个宣称支持的组合有对应验证记录 |

## A.5 远程编译与新仓库配置任务映射

| 任务 | 配置 | 任务节 |
|------|------|--------|
| 新仓库初始化 | https://github.com/wujupeng/andriodpad2 | 第 1.1 节 |
| 远程编译服务器配置 | 192.168.2.3, debian/***REDACTED***, /home/debian/android | 第 1.3 节 |
| 远程编译流程固化 | PowerShell 脚本自动化 | 第 28.1 节 |
| 版本管理与发布 | main/develop 分支 + 阶段分支 | 第 28.2 节 |
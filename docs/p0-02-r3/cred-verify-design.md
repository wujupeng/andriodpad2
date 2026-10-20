# P0-02 凭证安全闭环补充核验实现方案（技术设计）

> 本文档为 P0-02 Final Gate **第八次** PM 复审裁定 **HOLD** 的四项阻断项（SEC-01～SEC-04）的技术设计（实现方案）。基于 `.codeartsdoer/specs/p002_cred_verify/spec.md` 需求规格（48 条 EARS 规则 + 22 异常场景），将 PM 四项最小补充核验要求转化为可落地的执行方案。
>
> **文档定位**：本设计针对四项补充核验措施——私钥状态核验、SMB 凭证范围核验、SHA 引用影响清单、远端验证记录、补充证据包归档。不涉及代码功能修改，不重做 WPS/SMB 功能测试，不修改 SmbPlugin.ts 与 M2VerificationPage.tsx，不重做五项补验。核验完成后进入 P0-02 Final Gate **第九次**复审。
>
> **设计依据**：`.codeartsdoer/specs/p002_cred_verify/spec.md`（本轮需求规格，48 条 EARS 规则 + 22 异常场景）
>
> **前置基线**：
> - 上一轮闭环整改规格：`.codeartsdoer/specs/p002_cred_closure/spec.md`（36 条 EARS 规则 + 19 异常场景）
> - 上一轮闭环实现方案：`docs/p0-02-r3/cred-closure-design.md`
> - 上一轮闭环任务规划：`docs/p0-02-r3/cred-closure-tasks.md`
> - 上一轮闭环整改报告：`docs/p0-02-r3/evidence/cred-closure-evidence.md`
> - 上一轮整改提交 SHA：`ade386d`（已推送至 GitHub main 分支）
> - 上一轮成果：SSH 密钥认证已切换（旧密码失效）、git filter-repo 已重写全分支历史（11 个暴露提交覆盖）、M2VerificationPage.tsx 拗留值定性完成（低风险）、整改报告已归档
> - 上一轮遗留问题（PM 第八次复审四项阻断项）：
>   - SEC-01：报告记录的 ssh-keygen 命令含 `-f ~/.ssh/pad2_cred_closure`（指定磁盘路径）与 `-N ""`（无口令），却声明"私钥不落盘"，表述矛盾
>   - SEC-02：仅证明 SSH 密码认证被拒，未证明 SMB 凭证已失效；若旧密码复用于 SMB，SSH 禁用不等于旧凭证全面失效
>   - SEC-03：530 处旧 SHA 引用仅登记风险（RISK-01）未处置，需至少完成 P0-02 关键证据链引用修复或可追溯映射
>   - SEC-04：历史重写后远端分支扫描与副本处置责任未独立确认
> - GitHub 仓库：`https://github.com/wujupeng/andriodpad2.git`，分支 main + develop + pad2-p0~p4，公开仓库
> - 远程编译服务器：192.168.2.3，用户名 debian，SSH 密码认证已禁用（PasswordAuthentication no），仅允许密钥认证
> - SSH 密钥路径：`~/.ssh/pad2_cred_closure`（ed25519，OpenSSH 格式，passphrase 为空）
> - SSH hostkey：`SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY`
> - SMB 共享挂载路径：`/mnt/share`（samba 服务运行在 192.168.2.3 上）
> - M2VerificationPage.tsx:33 含 `useState('***REDACTED***')`（git filter-repo 已将历史明文替换）
> - SmbPlugin.ts 使用密码参数连接 SMB（本轮不修改）
> - 仓库中有多处旧 SHA 引用（7e81fa9, dfbb5f2, 81d8293, 5cd4da7, 17fac76, c6bd202, dac77fe, d720262, 72a603a, fb989dd, 110cb03, 693fb75, c44eadf, 2bf4cdf, a5c5364 等），重写后失效
> - PM 第八次复审裁定：**HOLD**，阻断项 SEC-01～SEC-04
> - 代码探查事实（本轮新增）：
>   - `src/adapter/smb/SmbPlugin.ts:3-9` 定义 `SmbConnectOptions` 接口，含 `host`、`share`、`username`、`password`、`domain` 字段，`password` 为 SMB 认证密码参数
>   - `src/ui/pages/M2VerificationPage.tsx:30-33` 定义 `useState('192.168.2.3')`（host）、`useState('share')`（share）、`useState('debian')`（username）、`useState('***REDACTED***')`（password），password 传递给 SmbPlugin.connect() 用于 SMB 认证
>   - git filter-repo commit map 未在 `.git/filter-repo/` 找到，需通过内容比对重建旧 SHA → 新 SHA 映射
>
> **脱敏说明**：本文档中计划命令与旧密码统一用 `***REDACTED***` 脱敏表示。文档本身不含明文凭证，不含 SSH 私钥内容。
>
> **设计产物归档路径**：`docs/p0-02-r3/cred-verify-design.md`

---

# 一、需求与存量功能关系分析

## 1.1 需求功能与存量功能对比

### 1.1.1 已实现功能

本轮为纯核验/文档任务，不涉及代码功能实现。存量中与本轮相关的已实现功能为上一轮闭环整改产出的运维配置、文档资产、证据归档基础设施与代码凭证使用结构，本轮可直接复用或在此基础上核验。

| 需求功能 | 存量功能 | 代码位置 | 匹配度 |
|---------|---------|---------|--------|
| 私钥存储位置核验 | 上一轮 ssh-keygen 已生成密钥对，`-f ~/.ssh/pad2_cred_closure` 指定磁盘路径，私钥实际落盘至执行者本地 | `docs/p0-02-r3/evidence/cred-closure-evidence.md:20`（ssh-keygen 命令记录） | 100% |
| SSH 密钥认证配置核验 | 上一轮已配置 PasswordAuthentication no + PubkeyAuthentication yes，旧密码已失效，密钥登录已验证 | `docs/p0-02-r3/evidence/cred-closure-evidence.md:22-27` | 100% |
| SMB 凭证参数结构 | SmbPlugin.ts 已定义 SmbConnectOptions 接口，含 password 字段用于 SMB 认证 | `src/adapter/smb/SmbPlugin.ts:3-9` | 100% |
| SMB 凭证默认值来源 | M2VerificationPage.tsx:33 已含 `useState('***REDACTED***')`，作为 SMB 连接密码默认值传递给 SmbPlugin.connect() | `src/ui/pages/M2VerificationPage.tsx:30-33` | 100% |
| git 历史重写结果 | 上一轮已执行 git filter-repo，11 个暴露提交已覆盖，`git log --all -S "***REDACTED***"` 零匹配 | `docs/p0-02-r3/evidence/cred-closure-evidence.md:46-56` | 100% |
| 暴露提交清单 | 上一轮已识别 11 个暴露提交（c6bd202 至 81d8293），含提交信息 | `docs/p0-02-r3/evidence/cred-closure-evidence.md:60-74` | 100% |
| 已知风险记录 | 上一轮已记录 RISK-01（530 处 SHA 引用失效）+ RISK-02（远端副本风险） | `docs/p0-02-r3/evidence/cred-closure-evidence.md:78-81` | 100% |
| 证据归档目录 | `docs/p0-02-r3/evidence/` 目录已存在，已归档上一轮证据文件 | `docs/p0-02-r3/evidence/` | 100% |
| GitHub 远程仓库可达 | git 仓库已配置 remote origin，main + develop + pad2-p0~p4 分支已推送 | `.git/config`（origin → `https://github.com/wujupeng/andriodpad2.git`） | 100% |
| 远程服务器 SSH 密钥认证可达 | 192.168.2.3 SSH 服务可用，密钥认证已配置，hostkey 已知 | 运维环境（非代码仓库） | 100% |

### 1.1.2 需要扩展的功能

以下功能在存量中部分存在或以不同方式实现，本轮需在现有基础上改造或补充。

| 需求功能 | 存量功能 | 差异说明 | 扩展方向 |
|---------|---------|---------|---------|
| 私钥状态准确表述 | 上一轮报告声明"SSH 私钥不落盘"（`cred-closure-evidence.md:34`），但 ssh-keygen 命令含 `-f ~/.ssh/pad2_cred_closure` 指定磁盘路径，表述与命令参数矛盾 | 上一轮"不落盘"语义实际为"未写入仓库/归档文档/日志/提交信息"，但字面声明"不落盘"与 `-f` 指定磁盘路径矛盾；本轮须核验实际存储位置、权限、保护方式，修正表述 | 实际执行 `ls -l ~/.ssh/pad2_cred_closure` 核验文件存在性与权限，核验 passphrase 为空，修正报告表述为"私钥落盘至执行者本地 ~/.ssh/pad2_cred_closure，权限 600，无 passphrase，未写入仓库/归档文档/日志/提交信息" |
| SMB 凭证范围核验 | 上一轮仅证明 SSH 密码认证被拒（`cred-closure-evidence.md:24`），未核验旧密码是否复用于 SMB；报告将残留值定性为"用于 SMB 认证的连接密码"（`cred-closure-evidence.md:143`）但未在 SMB 服务端核验 | 上一轮 SSH PasswordAuthentication no 仅使旧密码在 SSH 通道失效，SMB 通道是否复用旧密码未核验；代码探查显示 M2VerificationPage.tsx:33 的 password 传递给 SmbPlugin.connect() 用于 SMB 认证，提示旧密码可能复用于 SMB；本轮须实际审查 samba 配置确认复用关系，若复用则在 SMB 侧撤销/轮换 | 审查 192.168.2.3 samba 配置（smb.conf 用户与密码映射）+ SmbPlugin.ts 密码参数来源 + M2VerificationPage.tsx 拗留值用途，确认复用后执行 smbpasswd 撤销/轮换 + 验证旧密码被 SMB 拒绝 + 验证新凭证连通性 |
| SHA 引用清单与分类 | 上一轮仅记录 RISK-01"530 处文档引用旧 SHA"（`cred-closure-evidence.md:80`），明确"本轮不更新引用"，未提供引用清单、分类、映射 | 上一轮登记风险不等于处置风险；530 处引用中影响 P0-02 验收可复核性的"真实证据引用"须修复或建立替代映射，"普通历史说明"可保留但须说明不影响验收；本轮须实际扫描引用、逐条分类、建立旧 SHA → 新 SHA 映射 | 执行 grep 扫描全仓库文档旧 SHA 引用，逐条分析用途分类，通过内容比对重建旧 SHA → 新 SHA 映射（commit map 未找到），修复关键证据链引用或建立可复核替代映射 |
| 远端独立扫描 | 上一轮验证远程 main 与全分支零匹配（`cred-closure-evidence.md:55-56`），但未独立列出分支清单、扫描范围与结果，未记录副本处置责任 | 上一轮验证结果已存在但未结构化记录远端分支清单、每分支扫描命令与结果；副本处置责任（RISK-02）仅声明"由仓库所有者通知协作者"未明确归属与通知状态；本轮须独立执行远端扫描并结构化记录 | 执行 `git ls-remote --heads origin` 获取远端分支清单，对每分支独立执行 `git log origin/<branch> -S/-G` 扫描，记录副本处置责任归属（仓库所有者）与通知状态 |
| 旧 SHA → 新 SHA 映射表 | 上一轮未建立映射表，git filter-repo commit map 未在 `.git/filter-repo/` 找到 | 上一轮 git filter-repo 执行后 commit map 可能已丢失或未保留；本轮须通过提交信息、作者、时间、内容比对重建映射，覆盖 11 个暴露提交及关键证据提交 | 通过 `git log --all --format` 提取重写后提交信息，与上一轮记录的旧 SHA 提交信息比对，重建旧 SHA → 新 SHA 映射表，对无法唯一对应的标注"映射待定" |

### 1.1.3 需要新增的功能或接口

本轮新增的"功能"为核验操作、仓库审计操作与文档产物，不涉及代码接口新增。按业务模块分组如下：

**模块A：私钥状态核验（SEC-01，运维核验操作）**

对应 spec.md 5.1 节（9 条 EARS 规则 + 4 异常场景）。

- **输入**：上一轮 ssh-keygen 命令记录（`-f ~/.ssh/pad2_cred_closure -N ""`）、本地私钥文件路径、git 仓库、归档文档目录
- **输出**：私钥实际存储位置（绝对路径）、文件权限（预期 600）、保护方式（passphrase 为空 + 文件权限 600）、私钥未进入仓库/归档文档/日志的搜索结果、修正后的准确表述
- **核心逻辑**：核验私钥文件存在性与路径 → 核验文件权限 → 核验保护方式（passphrase 与文件权限）→ 核验私钥未进入仓库（当前版本 + 全分支历史）→ 核验私钥未进入归档文档与日志 → 修正上一轮报告"不落盘"表述为准确描述
- **依赖**：本地私钥文件存在、git 仓库可搜索、归档文档目录可访问

**模块B：SMB 凭证范围核验（SEC-02，运维核验操作）**

对应 spec.md 5.2 节（9 条 EARS 规则 + 5 异常场景）。

- **输入**：SmbPlugin.ts 密码参数来源（`SmbConnectOptions.password`）、M2VerificationPage.tsx 拗留值用途（第 33 行 password 传递给 SmbPlugin.connect()）、192.168.2.3 samba 配置（smb.conf 用户与密码映射）、旧密码 `***REDACTED***`
- **输出**：旧密码是否复用于 SMB 的判定（复用/未复用/待定）+ 判定依据；若复用，含 SMB 侧撤销/轮换命令、旧密码被 SMB 拒绝验证、新凭证连通性核验结果；若未复用，含凭证分离证据
- **核心逻辑**：审查 SmbPlugin.ts 密码参数来源（只读）→ 审查 M2VerificationPage.tsx 拗留值用途（只读）→ 审查 samba 配置（smb.conf 用户与密码映射）→ 判定复用关系 → 若复用：smbpasswd 撤销/轮换 + 重启 samba + 验证旧密码被拒 + 验证新凭证连通性；若未复用：提供凭证分离证据
- **依赖**：SmbPlugin.ts 与 M2VerificationPage.tsx 可读（只读）、192.168.2.3 samba 服务可达、核验执行者有 sudo 权限修改 samba 配置（若复用需轮换）

**模块C：SHA 引用影响清单（SEC-03，仓库审计操作）**

对应 spec.md 5.3 节（9 条 EARS 规则 + 4 异常场景）。

- **输入**：待扫描旧 SHA 列表（7e81fa9, dfbb5f2, 81d8293, 5cd4da7, 17fac76, c6bd202, dac77fe, d720262, 72a603a, fb989dd, 110cb03, 693fb75, c44eadf, 2bf4cdf, a5c5364 等）、上一轮 RISK-01 计数（530 处）、git 仓库历史（重写后提交）
- **输出**：引用扫描清单（文件路径 + 行号 + 旧 SHA + 上下文片段 + 分类 + 分类依据 + 处置方式）、旧 SHA → 新 SHA 映射表（覆盖 11 个暴露提交及关键证据提交）、引用清单统计（总数/真实证据引用数/普通历史说明数/已修复数/已建立映射数）
- **核心逻辑**：执行 grep 扫描全仓库文档旧 SHA 引用 → 逐条分析引用用途分类（真实证据引用 vs 普通历史说明）→ 通过内容比对重建旧 SHA → 新 SHA 映射（commit map 丢失）→ 对真实证据引用修复引用或建立替代映射 → 对普通历史说明记录保留原样决定 + 不影响验收理由 → 汇总统计
- **依赖**：git 仓库可搜索、重写后提交历史可访问（`git log --all`）、上一轮暴露提交清单可参考

**模块D：远端验证记录（SEC-04，仓库审计操作）**

对应 spec.md 5.4 节（9 条 EARS 规则 + 4 异常场景）。

- **输入**：GitHub 远程仓库地址、预期远端分支清单（main + develop + pad2-p0~p4）、旧密码 `***REDACTED***`、上一轮旧密码失效证据、本轮 SEC-02 凭证范围核验结论
- **输出**：远端分支清单（实际）、每分支扫描命令与结果（零匹配确认）、副本处置责任归属（仓库所有者）与通知状态、历史明文不可利用依据
- **核心逻辑**：执行 `git ls-remote --heads origin` 获取远端分支清单 → 对每分支独立执行 `git log origin/<branch> -S/-G "***REDACTED***"` 扫描 → 汇总扫描范围与结果 → 确认副本处置责任归属 → 确认旧密码已失效使历史明文不可利用（依赖 SEC-02 结论）
- **依赖**：GitHub 远程仓库可达、git 仓库已配置 remote origin、SEC-02 凭证范围核验已完成（用于确认历史明文不可利用）

**模块E：补充证据包归档与提交（文档产物）**

对应 spec.md 5.5 节（12 条 EARS 规则 + 5 异常场景）。

- **输入**：前四项核验结论（SEC-01 私钥状态 + SEC-02 凭证范围 + SEC-03 SHA 引用 + SEC-04 远端验证）、上一轮报告修正记录
- **输出**：`docs/p0-02-r3/evidence/cred-verify-evidence.md`，含 SEC-01～SEC-04 四项核验结论 + 上一轮报告修正记录 + 补充证据包提交 SHA
- **核心逻辑**：汇总四项核验结论 → 编写补充证据包文档 → 修正上一轮报告"不落盘"表述 → 验证报告不含敏感信息 → git add + commit + push → 记录新提交 SHA → 推送后验证
- **依赖**：前四项核验已完成、证据归档目录存在、GitHub 远程仓库可推送

## 1.2 存量功能详细分析

### 1.2.1 上一轮闭环整改报告（`docs/p0-02-r3/evidence/cred-closure-evidence.md`）

- **接口契约**：Markdown 文档，198 行，含 8 个章节（旧凭证失效证明、历史暴露处置结论、当前版本扫描结果、访问控制验证、拗留值定性结论、整改提交 SHA、约束遵守确认、声明）
- **业务规则**：记录四项必备内容 + 拗留值定性结论 + 整改提交 SHA，含时间戳（ISO8601）、命令、预期/实际结果、退出码
- **扩展点**：可被本轮补充证据包引用作为前置基线；本轮须修正其中"SSH 私钥不落盘"表述（第 34 行）
- **约束**：文档已脱敏，不含明文密码；本轮修正表述时须保持文档结构完整性，不得引入新的不准确内容

### 1.2.2 上一轮 SSH 密钥认证配置（192.168.2.3）

- **接口契约**：sshd_config 已配置 `PasswordAuthentication no` + `PubkeyAuthentication yes`，公钥已部署至 `~/.ssh/authorized_keys`，sshd 已重启
- **业务规则**：仅允许密钥认证，旧密码 `***REDACTED***` 在 SSH 通道已失效；hostkey 保持 `SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY` 不变
- **扩展点**：认证方式已切换，本轮不再修改 sshd_config；本轮须核验私钥存储状态（SEC-01）
- **约束**：本轮核验须使用密钥认证连接（`ssh -i ~/.ssh/pad2_cred_closure -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null debian@192.168.2.3`），不得使用旧密码 `-pw` 参数

### 1.2.3 上一轮 git filter-repo 历史重写结果

- **接口契约**：所有提交中明文密码 `***REDACTED***` 已替换为脱敏标注 `***REDACTED***`，提交 SHA 已变更，远程仓库全分支已 force push 更新
- **业务规则**：`git log --all -S "***REDACTED***"` 零匹配，`git log --all -G "***REDACTED***"` 零匹配；11 个暴露提交（c6bd202 至 81d8293）已覆盖
- **扩展点**：本轮须在此基础上建立旧 SHA → 新 SHA 映射表（SEC-03），并对影响验收的引用完成修复或替代映射
- **约束**：git filter-repo commit map 未在 `.git/filter-repo/` 找到，须通过内容比对重建映射；重写后旧 SHA 引用失效（530 处），本轮须实际扫描确认引用数量与分类

### 1.2.4 SmbPlugin.ts 凭证参数结构（`src/adapter/smb/SmbPlugin.ts:3-9`）

- **接口契约**：`SmbConnectOptions` 接口定义 SMB 连接参数，含 `host`、`share`、`username`、`password`、`domain` 字段，`password` 为 SMB 认证密码参数
- **业务规则**：`password` 字段传递给底层 SMB 客户端用于 samba 服务认证；本轮只读审查，不修改接口
- **扩展点**：无（本轮不修改）
- **约束**：PM 约束禁止修改 SmbPlugin.ts；本轮仅审查 password 参数来源以判定凭证复用关系

### 1.2.5 M2VerificationPage.tsx 拗留值（`src/ui/pages/M2VerificationPage.tsx:30-33`）

- **接口契约**：第 30-33 行定义 SMB 连接参数 useState 初始值：`useState('192.168.2.3')`（host）、`useState('share')`（share）、`useState('debian')`（username）、`useState('***REDACTED***')`（password）
- **业务规则**：password 值传递给 SmbPlugin.connect() 用于 SMB 认证；M2VerificationPage 为 M2 阶段验证测试页面，非生产页面；git filter-repo 已将历史明文替换为 `***REDACTED***` 脱敏标注
- **扩展点**：无（本轮不修改）
- **约束**：PM 约束禁止修改 M2VerificationPage.tsx 代码；本轮仅审查拗留值用途以判定旧密码是否复用于 SMB 认证

### 1.2.6 证据归档目录（`docs/p0-02-r3/evidence/`）

- **接口契约**：目录路径固定，已归档上一轮证据文件 `cred-closure-evidence.md` 与 `cred-remediation-evidence.md`
- **业务规则**：证据文件须可被 PM 独立核对，须包含可审计的事实（时间戳 ISO8601、SHA、退出码、实际命令与结果）
- **扩展点**：可新增任意 `.md` 证据文件；本轮新增 `cred-verify-evidence.md` 与上一轮 `cred-closure-evidence.md` 并存
- **约束**：证据文件不得包含明文凭证（`***REDACTED***` 脱敏标注除外）、SSH 私钥内容、新密码、任何可利用的凭据值

### 1.2.7 上一轮已知风险记录（RISK-01 + RISK-02）

- **接口契约**：RISK-01（530 处文档引用旧 SHA，已记录未处置）+ RISK-02（远端副本可能已存在，旧密码已失效故不可利用）
- **业务规则**：上一轮明确"本轮不更新引用，由仓库所有者决定后续处置"；本轮须实际处置 RISK-01（提供引用清单 + 分类 + 映射 + 修复关键引用），并结构化记录 RISK-02 副本处置责任
- **扩展点**：本轮须将 RISK-01 从"仅登记"升级为"已处置"（至少关键证据引用已修复或建立映射）
- **约束**：引用修复须保持文档可读性与结构完整性；映射表仅含提交标识，不含明文凭证

---
# 二、增量设计方案

## 2.1 实现模型

### 2.1.1 上下文视图

```plantuml
@startuml
!theme plain
title P0-02 凭证安全闭环补充核验 - 上下文视图

actor "核验执行者" as Verifier
actor "PM / 评审者" as PM
actor "独立核验员" as Auditor
actor "仓库所有者" as Owner

node "远程编译服务器\n192.168.2.3\nSSH(仅密钥) + samba(SMB)" as BuildServer
file "本地私钥\n~/.ssh/pad2_cred_closure\n(权限600, 无passphrase)" as PrivateKey
database "本地 Git 仓库\n(pad2)" as LocalRepo
database "GitHub 远程仓库\nandriodpad2.git (公开)\n分支 main+develop+pad2-p0~p4" as GitHub
file "上一轮整改报告\ncred-closure-evidence.md\n(含\"不落盘\"待修正表述)" as PrevReport
file "SmbPlugin.ts\nSmbConnectOptions.password" as SmbPlugin
file "M2VerificationPage.tsx:33\nuseState('***REDACTED***')" as Residual
database "仓库文档\n(530处旧SHA引用待扫描分类)" as DocRefs

package "凭证安全闭环补充核验\n(P0-02 第八次复审 SEC-01~SEC-04)" as Verify {
    component "模块A\n私钥状态核验" as ModA
    component "模块B\nSMB凭证范围核验" as ModB
    component "模块C\nSHA引用影响清单" as ModC
    component "模块D\n远端验证记录" as ModD
    component "模块E\n补充证据包归档" as ModE
}

PM --> Verify : 第八次复审 HOLD\n提出 SEC-01~SEC-04 四项阻断项

Verifier --> ModA : SEC-01 核验私钥状态
ModA --> PrivateKey : ls -l 核验文件存在性/权限
ModA --> LocalRepo : git log 搜索私钥未进入仓库
ModA --> PrevReport : 修正"不落盘"表述

Verifier --> ModB : SEC-02 核验凭证范围
ModB --> SmbPlugin : 审查 password 参数来源（只读）
ModB --> Residual : 审查拗留值用途（只读）
ModB --> BuildServer : 审查 samba 配置\n若复用则撤销/轮换+验证

Verifier --> ModC : SEC-03 扫描SHA引用
ModC --> DocRefs : grep 扫描旧SHA引用
ModC --> LocalRepo : 内容比对重建旧SHA→新SHA映射
ModC --> DocRefs : 修复关键证据引用

Verifier --> ModD : SEC-04 独立扫描远端
ModD --> GitHub : git ls-remote 获取分支清单
ModD --> GitHub : 每分支 git log -S/-G 独立扫描
ModD --> Owner : 确认副本处置责任

Verifier --> ModE : 汇总四项结论归档
ModE --> LocalRepo : 写入 cred-verify-evidence.md
ModE --> GitHub : git push origin main

Verify --> PM : 补充核验闭环，请求第九次复审
Auditor --> Verify : 独立审核四项核验结论
Auditor --> GitHub : 核查远端扫描结果
Auditor --> DocRefs : 核查SHA引用清单与映射
Owner --> Verify : 承担旧克隆/副本处置责任

@enduml
```

**上下文交互说明**：

| 交互编号 | 来源 → 目标 | 交互内容 | 协议/方式 | 频率 |
|---------|-----------|---------|----------|------|
| 1 | PM → 核验方案 | 第八次复审 HOLD，提出 SEC-01～SEC-04 四项阻断项 | 文档评审 | 1 次 |
| 2 | 核验执行者 → 模块A | 发起私钥状态核验 | 函数调用 | 1 次 |
| 3 | 模块A → 本地私钥 | `ls -l ~/.ssh/pad2_cred_closure` 核验文件存在性与权限 | 本地文件系统 | 1 次 |
| 4 | 模块A → 本地仓库 | `git log --all` 搜索私钥未进入仓库 | git CLI | 1 次 |
| 5 | 模块A → 上一轮报告 | 修正"不落盘"表述为准确描述 | 文件编辑 | 1 次 |
| 6 | 核验执行者 → 模块B | 发起 SMB 凭证范围核验 | 函数调用 | 1 次 |
| 7 | 模块B → SmbPlugin.ts | 审查 password 参数来源（只读） | 文件读取 | 1 次 |
| 8 | 模块B → M2VerificationPage.tsx | 审查拗留值用途（只读） | 文件读取 | 1 次 |
| 9 | 模块B → 192.168.2.3 | 审查 samba 配置；若复用则撤销/轮换 + 验证 | SSH（密钥认证）+ SMB | 1-3 次 |
| 10 | 核验执行者 → 模块C | 发起 SHA 引用影响清单 | 函数调用 | 1 次 |
| 11 | 模块C → 仓库文档 | grep 扫描旧 SHA 引用 | grep CLI | 1 次 |
| 12 | 模块C → 本地仓库 | 内容比对重建旧 SHA → 新 SHA 映射 | git CLI | 1 次 |
| 13 | 模块C → 仓库文档 | 修复关键证据引用 | 文件编辑 | N 次 |
| 14 | 核验执行者 → 模块D | 发起远端验证记录 | 函数调用 | 1 次 |
| 15 | 模块D → GitHub | `git ls-remote --heads origin` 获取分支清单 | git CLI over HTTPS | 1 次 |
| 16 | 模块D → GitHub | 每分支 `git log -S/-G` 独立扫描 | git CLI over HTTPS | 7 次（每分支一次） |
| 17 | 核验执行者 → 模块E | 汇总四项结论归档 | 函数调用 | 1 次 |
| 18 | 模块E → 本地仓库 | 写入 `cred-verify-evidence.md` | 文件写入 | 1 次 |
| 19 | 模块E → GitHub | `git push origin main` 提交补充证据包 | git CLI over HTTPS | 1 次 |

### 2.1.2 服务/组件总体架构

```plantuml
@startuml
!theme plain
title P0-02 凭证安全闭环补充核验 - 组件架构

package "凭证安全闭环补充核验方案" as Solution {

    package "模块A: 私钥状态核验" as ModA {
        component "私钥文件核验器\nPrivateKeyFileVerifier" as PKFV [
            + verifyFileExists(path)
            + verifyFilePermission(path)
            + verifyProtectionMethod(path)
        ]
        component "仓库搜索核验器\nRepoSearchVerifier" as RSV [
            + searchPrivateKeyInCurrentVersion()
            + searchPrivateKeyInHistory()
            + searchPrivateKeyInArchiveDocs()
        ]
        component "表述修正器\nStatementCorrector" as SC [
            + identifyInaccurateStatement()
            + correctToAccurateDescription()
            + verifyCorrectionIntegrity()
        ]
    }

    package "模块B: SMB凭证范围核验" as ModB {
        component "凭证来源审查器\nCredentialSourceAuditor" as CSA [
            + auditSmbPluginPasswordParam()
            + auditM2PageResidualValue()
            + auditSambaConfig()
        ]
        component "复用判定器\nReuseDeterminer" as RD [
            + determineReuseRelation()
            + provideSeparationEvidence()
        ]
        component "SMB凭证处置器\nSmbCredentialHandler" as SCH [
            + revokeOrRotateSmbPassword()
            + restartSambaService()
            + verifyOldPasswordRejected()
            + verifyNewCredentialConnectivity()
        ]
    }

    package "模块C: SHA引用影响清单" as ModC {
        component "引用扫描器\nReferenceScanner" as RS [
            + scanShaReferences(shaList)
            + extractContextSnippet()
            + countTotalReferences()
        ]
        component "引用分类器\nReferenceClassifier" as RC [
            + classifyReference()
            + judgeEvidenceReference()
            + judgeHistoricalNote()
        ]
        component "映射重建器\nMappingRebuilder" as MR [
            + rebuildShaMapping()
            + compareCommitContent()
            + handleAmbiguousMapping()
        ]
        component "引用修复器\nReferenceRepairer" as RR [
            + repairEvidenceReference()
            + establishAlternativeMapping()
            + preserveHistoricalNote()
        ]
    }

    package "模块D: 远端验证记录" as ModD {
        component "远端分支列举器\nRemoteBranchLister" as RBL [
            + listRemoteBranches()
            + compareWithExpected()
        ]
        component "远端历史扫描器\nRemoteHistoryScanner" as RHS [
            + scanBranchHistory(branch)
            + verifyZeroMatch(branch)
        ]
        component "副本处置记录器\nCloneDisposalRecorder" as CDR [
            + recordDisposalResponsibility()
            + recordNotificationStatus()
            + confirmHistoryNotExploitable()
        ]
    }

    package "模块E: 补充证据包归档" as ModE {
        component "证据收集器\nEvidenceCollector" as EC [
            + collectSec01Conclusion()
            + collectSec02Conclusion()
            + collectSec03Conclusion()
            + collectSec04Conclusion()
            + collectReportCorrectionRecord()
        ]
        component "报告编写器\nReportWriter" as RW [
            + writeVerifyEvidenceDoc()
            + verifyNoSensitiveInfo()
            + correctPrevReportStatement()
        ]
        component "提交推送器\nCommitPusher" as CP [
            + gitAdd()
            + gitCommit()
            + gitPush()
            + recordCommitSha()
        ]
    }
}

component "上一轮整改报告\ncred-closure-evidence.md" as PrevReport
component "SSH密钥认证连接\nssh -i ~/.ssh/pad2_cred_closure" as SshConn
component "旧SHA列表\n15个暴露提交SHA" as ShaList
component "GitHub远程仓库\norigin" as GitHub

PrevReport <-- SC : 读取待修正表述
PrevReport <-- RW : 修正"不落盘"表述
SshConn <-- SCH : SMB轮换通过SSH密钥认证执行
ShaList <-- RS : 读取待扫描SHA列表
GitHub <-- RBL : 获取远端分支清单
GitHub <-- RHS : 每分支独立扫描
GitHub <-- CP : 提交补充证据包

PKFV --> RSV : 文件核验完成
RSV --> SC : 仓库搜索完成
CSA --> RD : 凭证来源审查完成
RD --> SCH : 复用判定完成
RS --> RC : 引用扫描完成
RC --> MR : 分类完成
MR --> RR : 映射重建完成
RBL --> RHS : 分支清单获取完成
RHS --> CDR : 扫描结果汇总
EC --> RW : 四项结论收集完成
RW --> CP : 报告写入完成

@enduml
```

**模块职责说明**：

| 模块 | 职责 | 对应 spec.md 章节 | EARS 规则数 | 异常场景数 |
|------|------|------------------|-----------|-----------|
| 模块A：私钥状态核验 | 核验私钥文件存在性/权限/保护方式，核验私钥未进入仓库/归档文档/日志，修正上一轮报告"不落盘"表述 | 5.1（5.1.1-5.1.3） | 9 条 | 4 个 |
| 模块B：SMB 凭证范围核验 | 审查凭证来源（SmbPlugin.ts + M2VerificationPage.tsx + samba 配置），判定复用关系，若复用则撤销/轮换 + 验证 | 5.2（5.2.1-5.2.3） | 9 条 | 5 个 |
| 模块C：SHA 引用影响清单 | 扫描旧 SHA 引用，逐条分类，重建旧 SHA → 新 SHA 映射，修复关键证据引用或建立替代映射 | 5.3（5.3.1-5.3.3） | 9 条 | 4 个 |
| 模块D：远端验证记录 | 获取远端分支清单，每分支独立扫描历史明文，记录副本处置责任与通知状态 | 5.4（5.4.1-5.4.3） | 9 条 | 4 个 |
| 模块E：补充证据包归档 | 汇总四项核验结论，编写补充证据包文档，修正上一轮报告，提交推送，记录 SHA | 5.5（5.5.1-5.5.3） | 12 条 | 5 个 |

**合计**：48 条 EARS 规则 + 22 异常场景，与 spec.md 一致。
### 2.1.3 实现设计文档

#### 2.1.3.1 核验执行顺序状态机

五项模块存在时序约束（spec.md 4.1 节）：**SEC-01（私钥状态核验）与 SEC-04（远端验证记录）可并行执行**；**SEC-02（凭证范围核验）须在确认旧密码是否复用于 SMB 后决定后续操作**；**SEC-03（SHA 引用清单）可独立执行**；**四项核验结论须在补充证据包提交前全部完成**。但考虑到 SEC-04 确认"历史明文不可利用"依赖 SEC-02 结论（spec.md 5.4.1 规则 6），实际执行采用：模块A → 模块B → 模块C ∥ 模块D → 模块E（模块C 与模块D 可并行，但模块D 的"历史明文不可利用"确认须在模块B 完成后）。

```plantuml
@startuml
!theme plain
title P0-02 凭证安全闭环补充核验 - 执行顺序状态图

[*] --> 待开始

待开始 --> 模块A执行中 : 开始私钥状态核验（SEC-01）
模块A执行中 --> 模块A完成 : 文件存在性+权限+保护方式核验+仓库搜索+表述修正
模块A执行中 --> 模块A失败 : 私钥文件不存在/权限不符/私钥意外进入仓库
模块A失败 --> 模块A执行中 : 排除故障后重试（或修正权限后重试）

模块A完成 --> 模块B执行中 : 开始SMB凭证范围核验（SEC-02）
模块B执行中 --> 模块B完成 : 凭证来源审查+复用判定+（若复用）撤销/轮换+验证
模块B执行中 --> 模块B失败 : samba配置无法访问/轮换后编译流程中断/连通性核验失败
模块B失败 --> 模块B执行中 : 排除故障后重试（或联系管理员后重试）

模块B完成 --> 模块C执行中 : 开始SHA引用影响清单（SEC-03）
模块B完成 --> 模块D执行中 : 开始远端验证记录（SEC-04）\n（模块C与模块D可并行）

模块C执行中 --> 模块C完成 : 引用扫描+分类+映射重建+关键引用修复
模块C执行中 --> 模块C失败 : 引用数量过大/映射无法建立/分类困难
模块C失败 --> 模块C执行中 : 按保守原则处置后继续

模块D执行中 --> 模块D完成 : 分支清单+每分支扫描+副本处置责任记录
模块D执行中 --> 模块D失败 : 远端扫描失败/分支仍有明文/所有者未响应
模块D失败 --> 模块D执行中 : 重试扫描（或标注待办后继续）

模块C完成 --> 模块E待命 : 等待模块D完成
模块D完成 --> 模块E待命 : 等待模块C完成
模块E待命 --> 模块E执行中 : 模块C与模块D均完成\n开始补充证据包归档

模块E执行中 --> 模块E完成 : 报告写入+git commit+push+SHA记录
模块E执行中 --> 模块E失败 : push失败/报告缺失内容/包含敏感信息
模块E失败 --> 模块E执行中 : 补充内容/删除敏感信息后重试

模块E完成 --> 核验完成 : 通知PM第九次复审
核验完成 --> [*]

@enduml
```

**关键时序约束说明**：

| 约束编号 | 约束内容 | 依据 | 理由 |
|---------|---------|------|------|
| TO-1 | 模块A（私钥状态核验）可最先执行 | spec.md 4.1 节性能约束 1 | 私钥状态核验为本地只读操作，不依赖其他模块 |
| TO-2 | 模块B（凭证范围核验）须在模块A 后执行 | 实践考量 | 私钥状态核验确认密钥认证可用后，模块B 的 samba 配置审查与轮换通过密钥认证连接执行 |
| TO-3 | 模块C（SHA 引用清单）与模块D（远端验证）可并行执行 | spec.md 4.1 节性能约束 1 | 两者均为独立审计操作，无数据依赖 |
| TO-4 | 模块D 的"历史明文不可利用"确认须在模块B 完成后 | spec.md 5.4.1 规则 6 | 须依赖 SEC-02 凭证范围核验结论确认旧密码在所有认证通道失效 |
| TO-5 | 模块E（证据包归档）须在模块A-D 全部完成后执行 | spec.md 4.1 节性能约束 2 | 证据包须汇总四项核验结论 |
| TO-6 | 模块E 须最后执行 | spec.md 5.5 节 | 须汇总前四项任务结论 |

**执行顺序**：模块A → 模块B →（模块C ∥ 模块D）→ 模块E（模块C 与模块D 可并行，模块E 严格最后）

#### 2.1.3.2 私钥状态核验流程设计（模块A）

```plantuml
@startuml
!theme plain
title 模块A: 私钥状态核验（SEC-01）- 活动图

start

:前置确认;
:1. 确认本地私钥路径 ~/.ssh/pad2_cred_closure;
:2. 确认git仓库可搜索;
:3. 确认归档文档目录可访问;

:步骤1: 核验私钥文件存在性与路径;
:ls -l ~/.ssh/pad2_cred_closure;
if (文件存在?) then (是)
    :记录绝对路径与文件存在性证据;
else (否)
    :标注"私钥文件不存在";
    :核查上一轮生成与部署记录;
    :评估是否需重新生成密钥对;
endif

:步骤2: 核验私钥文件权限;
:检查权限是否为600（rw-------）;
if (权限?) then (600)
    :权限符合要求 ✓;
else (非600)
    :修正权限为600（chmod 600）;
    :记录修正前后权限;
    :重新核验;
endif

:步骤3: 核验私钥保护方式;
:核验passphrase（上一轮-N ""表示为空）;
:核验文件权限保护（600）;
:确认保护方式：passphrase为空+依赖文件权限600保护;

:步骤4: 核验私钥未进入git仓库;
:git log --all 搜索私钥指纹特征;
:当前版本全文搜索私钥指纹特征;
if (搜索结果?) then (零匹配)
    :私钥未进入仓库 ✓;
else (有匹配)
    :立即评估泄露影响;
    :考虑轮换密钥对;
    :从仓库中清除私钥内容;
endif

:步骤5: 核验私钥未进入归档文档与日志;
:对docs/p0-02-r3/evidence/目录全文搜索私钥指纹特征;
:对日志文件搜索私钥指纹特征;
if (搜索结果?) then (零匹配)
    :私钥未进入归档文档与日志 ✓;
else (有匹配)
    :清除私钥内容;
    :评估泄露影响;
endif

:步骤6: 修正上一轮报告"不落盘"表述;
:识别cred-closure-evidence.md中"SSH私钥不落盘"表述;
:替换为准确描述;
note right
  修正后表述：
  私钥落盘至执行者本地
  ~/.ssh/pad2_cred_closure
  权限600，无passphrase
  未写入仓库/归档文档/日志/提交信息
end note
:验证修正后表述准确完整;

:模块A完成;
:私钥状态核验结论记录至模块E;
stop

@enduml
```

#### 2.1.3.3 SMB 凭证范围核验流程设计（模块B）

```plantuml
@startuml
!theme plain
title 模块B: SMB凭证范围核验（SEC-02）- 活动图

start

:前置确认;
:1. 确认SmbPlugin.ts可读（只读）;
:2. 确认M2VerificationPage.tsx可读（只读）;
:3. 确认192.168.2.3 samba服务可达（通过SSH密钥认证）;

:步骤1: 审查SmbPlugin.ts密码参数来源;
:读取src/adapter/smb/SmbPlugin.ts;
:确认SmbConnectOptions.password为SMB认证密码参数;
:记录password参数用途（传递给SMB客户端用于samba认证）;

:步骤2: 审查M2VerificationPage.tsx拗留值用途;
:读取src/ui/pages/M2VerificationPage.tsx第30-33行;
:确认useState('***REDACTED***')为SMB连接密码默认值;
:确认password传递给SmbPlugin.connect()用于SMB认证;
:确认M2VerificationPage为M2阶段验证测试页面;

:步骤3: 审查samba配置;
:通过SSH密钥认证连接192.168.2.3;
:读取smb.conf配置（sudo cat /etc/samba/smb.conf）;
:查看samba用户与密码映射（sudo pdbedit -L -v）;
:确认SMB共享/mnt/share的认证配置;

:步骤4: 判定旧密码是否复用于SMB;
if (旧密码***REDACTED***用于SMB认证?) then (复用）
    :判定结论：旧密码复用于SMB;
    :记录判定依据（samba用户密码与SSH密码相同）;

    :步骤5a: 在SMB服务端撤销或轮换旧密码;
    :sudo smbpasswd -x debian（撤销）;
    或 :sudo smbpasswd -a debian（轮换为新密码）;
    :重启samba服务（sudo systemctl restart smbd）;
    :记录操作命令与结果;

    :步骤5b: 验证旧密码无法用于SMB认证;
    :使用旧密码***REDACTED***尝试SMB连接/mnt/share;
    if (连接结果?) then (认证失败）
        :旧密码已被SMB拒绝 ✓;
    else (连接成功）
        :samba配置未生效;
        :排查samba服务状态;
        :修复后重新验证;
    endif

    :步骤5c: 验证替代认证有效性（连通性核验）;
    :使用新凭证尝试SMB连接/mnt/share;
    if (连接结果?) then (连接成功）
        :替代认证有效 ✓;
    else (连接失败）
        :排查samba配置/新凭证/服务状态;
        :修复后重新核验;
    endif

else (未复用）
    :判定结论：旧密码未复用于SMB;
    :步骤5d: 提供凭证分离证据;
    :记录samba配置中SMB密码与SSH密码不同的证据;
    或 :记录SMB使用其它认证方式的证据（guest/kerberos/不同用户）;
endif

:步骤6: 记录凭证范围核验结论;
:记录是否复用判定+判定依据+处置措施+验证结果;

:模块B完成;
:凭证范围核验结论记录至模块E;
stop

@enduml
```

#### 2.1.3.4 SHA 引用影响清单流程设计（模块C）

```plantuml
@startuml
!theme plain
title 模块C: SHA引用影响清单（SEC-03）- 活动图

start

:前置确认;
:1. 确认git仓库可搜索;
:2. 确认重写后提交历史可访问（git log --all）;
:3. 确认上一轮暴露提交清单可参考;

:步骤1: 扫描全仓库文档旧SHA引用;
:grep -rn "7e81fa9|dfbb5f2|81d8293|..." --include="*.md" --include="*.txt" .;
:产出引用清单（文件路径+行号+旧SHA+上下文片段）;
:记录扫描命令与总引用数;
:与上一轮RISK-01计数（530处）对照;

:步骤2: 逐条分类引用;
repeat :对每条引用
    :分析引用用途;
    if (引用作为P0-02验收证据可复核依据?) then (是）
        :分类为"真实证据引用";
        :附分类依据（影响验收可复核性）;
    else (否）
        :分类为"普通历史说明";
        :附分类依据（不影响验收）;
    endif
repeat while (还有引用?) is (是）
->否;

:步骤3: 重建旧SHA到新SHA映射;
:检查.git/filter-repo/是否存在commit map;
if (commit map存在?) then (是）
    :读取commit map建立映射;
else (否）
    :通过内容比对重建映射;
    :git log --all --format提取重写后提交信息;
    :与上一轮记录的旧SHA提交信息比对;
    :对无法唯一对应的标注"映射待定";
endif
:产出旧SHA→新SHA映射表（覆盖11个暴露提交及关键证据提交）;

:步骤4: 处置真实证据引用;
repeat :对每条真实证据引用
    if (可直接修复?) then (是）
        :更新引用为新SHA;
        :验证文档结构完整性;
    else (否）
        :建立可复核替代映射（旧SHA→新SHA）;
    endif
repeat while (还有真实证据引用?) is (是）
->否;

:步骤5: 处置普通历史说明;
:对每条普通历史说明记录保留原样决定;
:说明不影响P0-02验收可复核性的理由;

:步骤6: 汇总引用清单统计;
:记录总数+真实证据引用数+普通历史说明数+已修复数+已建立映射数;

:模块C完成;
:SHA引用影响清单记录至模块E;
stop

@enduml
```

#### 2.1.3.5 远端验证记录流程设计（模块D）

```plantuml
@startuml
!theme plain
title 模块D: 远端验证记录（SEC-04）- 活动图

start

:前置确认;
:1. 确认GitHub远程仓库可达;
:2. 确认git仓库已配置remote origin;
:3. 确认模块B已完成（用于确认历史明文不可利用）;

:步骤1: 获取远端分支清单;
:git ls-remote --heads origin;
:产出远端分支清单（实际）;
:与预期清单（main+develop+pad2-p0~p4）对照;
if (分支清单一致?) then (一致）
    :记录分支清单;
else (不一致）
    :以远端实际分支为准;
    :记录差异（新增或删除分支）;
endif

:步骤2: 对每个远端分支独立扫描历史明文;
repeat :对每个远端分支
    :git log origin/<branch> -S "***REDACTED***" --oneline;
    :git log origin/<branch> -G "***REDACTED***" --oneline;
    if (扫描结果?) then (零匹配）
        :该分支历史无明文 ✓;
    else (有匹配）
        :该分支仍有明文残留;
        :确认是否未force push重写;
        :重新执行force push;
        :重新扫描确认;
    endif
    :记录该分支扫描命令与结果;
repeat while (还有分支?) is (是）
->否;

:步骤3: 汇总扫描范围与结果;
:记录扫描的分支范围+扫描命令+每分支扫描结果（零匹配确认）;

:步骤4: 记录旧克隆及副本处置责任;
:确认处置责任归属（仓库所有者）;
:记录通知状态（已通知/待通知/无已知协作者）;
if (能联系仓库所有者?) then (能）
    :确认处置责任归属与通知状态;
else (不能）
    :记录"处置责任归属仓库所有者，通知状态待确认";
    :标注为待办项;
    :不阻断本轮核验（旧密码已失效）;
endif

:步骤5: 确认旧密码已失效使历史明文不可利用;
:审查上一轮旧密码失效证据（SSH密码认证禁用）;
:审查本轮SEC-02凭证范围核验结论（SMB若复用已撤销/轮换）;
:确认旧密码在所有认证通道已失效;
:确认历史明文不可利用;

:模块D完成;
:远端验证记录结论记录至模块E;
stop

@enduml
```

#### 2.1.3.6 补充证据包归档流程设计（模块E）

```plantuml
@startuml
!theme plain
title 模块E: 补充证据包归档与提交 - 活动图

start

:前置确认;
:1. 模块A已完成（私钥状态核验结论已收集）;
:2. 模块B已完成（凭证范围核验结论已收集）;
:3. 模块C已完成（SHA引用影响清单已收集）;
:4. 模块D已完成（远端验证记录结论已收集）;

:步骤1: 汇总四项核验结论;
:SEC-01 私钥状态核验（存储位置+权限+保护方式+仓库搜索+修正后表述）;
:SEC-02 凭证范围核验（复用判定+处置措施+验证结果）;
:SEC-03 SHA引用影响清单（引用清单+分类+映射表+统计）;
:SEC-04 远端验证记录（分支清单+扫描结果+副本处置责任）;
:上一轮报告修正记录（修正位置+修正前后表述）;

:步骤2: 编写补充证据包文档;
:写入docs/p0-02-r3/evidence/cred-verify-evidence.md;
:按SEC-01~SEC-04四项结构化编写;
:包含时间戳(ISO8601)+命令+预期+实际结果+退出码;

:步骤3: 修正上一轮报告"不落盘"表述;
:编辑docs/p0-02-r3/evidence/cred-closure-evidence.md;
:将"SSH私钥不落盘"替换为准确描述;
note right
  修正后表述：
  私钥落盘至执行者本地
  ~/.ssh/pad2_cred_closure
  权限600，无passphrase
  未写入仓库/归档文档/日志/提交信息
end note
:记录修正位置与修正前后表述;

:步骤4: 验证报告不含敏感信息;
:全文搜索补充证据包文档;
:确认不含SSH私钥内容/新密码/可利用凭据值;
:确认旧密码统一用***REDACTED***脱敏;
if (发现敏感信息?) then (是）
    :删除敏感信息;
    :重新编写;
else (否）
    :报告安全 ✓;
endif

:步骤5: git提交推送;
:git add docs/p0-02-r3/evidence/cred-verify-evidence.md;
:git add docs/p0-02-r3/evidence/cred-closure-evidence.md（修正）;
:git add docs/p0-02-r3/cred-verify-design.md;
:git add 必要的SHA引用修复文件;
:git commit -m "fix(P0-02-SEC): 凭证安全闭环补充核验 - 私钥状态+凭证范围+SHA引用+远端验证";
:git push origin main;

:步骤6: 记录新提交SHA;
:git log -1 --format=%H;
:记录完整SHA供PM第九次复审核对;

:步骤7: 推送后验证;
:全文搜索确认仓库当前版本零明文凭证;
:确认远程仓库已包含补充证据包;
:确认SmbPlugin.ts与M2VerificationPage.tsx无变更;

:模块E完成;
:通知PM执行第九次复审;
stop

@enduml
```
---
## 2.2 接口设计

### 2.2.1 总体设计

本核验任务不涉及代码接口，"接口"表现为核验操作命令序列、git 命令序列、SSH 命令序列与文档产物结构。所有接口均为一次性执行，执行后归档证据供 PM 第九次复审独立核对。

| 接口分类 | 接口名称 | 所属模块 | 稳定性等级 | 说明 |
|---------|---------|---------|-----------|------|
| 本地核验 | 私钥文件存在性核验命令 | 模块A | 一次性 | `ls -l ~/.ssh/pad2_cred_closure` 核验文件存在性与权限 |
| 本地核验 | 私钥保护方式核验 | 模块A | 一次性 | 核验 passphrase 为空 + 文件权限 600 |
| 仓库搜索 | 私钥未进入仓库搜索命令 | 模块A | 一次性 | `git log --all` 搜索 + 当前版本全文搜索私钥指纹 |
| 仓库搜索 | 私钥未进入归档文档搜索命令 | 模块A | 一次性 | 对 `docs/p0-02-r3/evidence/` 全文搜索私钥指纹 |
| 文档修正 | 上一轮报告表述修正 | 模块A | 一次性 | 修正 `cred-closure-evidence.md` 中"不落盘"表述 |
| 代码审计 | SmbPlugin.ts 密码参数审查 | 模块B | 一次性 | 只读审查 `SmbConnectOptions.password` 参数来源 |
| 代码审计 | M2VerificationPage.tsx 拗留值审查 | 模块B | 一次性 | 只读审查第 33 行 `useState('***REDACTED***')` 用途 |
| 运维操作 | samba 配置审查命令 | 模块B | 一次性 | 通过 SSH 密钥认证读取 `smb.conf` 与 `pdbedit` |
| 运维操作 | SMB 凭证撤销/轮换命令 | 模块B | 一次性 | `smbpasswd -x`（撤销）或 `smbpasswd -a`（轮换）+ 重启 smbd |
| 运维操作 | 旧密码 SMB 连接被拒验证命令 | 模块B | 一次性 | 使用旧密码尝试 SMB 连接 `/mnt/share`，预期认证失败 |
| 运维操作 | 新凭证 SMB 连通性核验命令 | 模块B | 一次性 | 使用新凭证尝试 SMB 连接 `/mnt/share`，预期连接成功 |
| 仓库审计 | 旧 SHA 引用扫描命令 | 模块C | 一次性 | grep 搜索全仓库文档旧 SHA 引用 |
| 仓库审计 | 旧 SHA → 新 SHA 映射重建 | 模块C | 一次性 | 通过内容比对重建映射（commit map 丢失） |
| 仓库审计 | 真实证据引用修复 | 模块C | 一次性 | 更新引用为新 SHA 或建立替代映射 |
| 仓库审计 | 远端分支清单获取命令 | 模块D | 一次性 | `git ls-remote --heads origin` |
| 仓库审计 | 远端分支历史扫描命令 | 模块D | 一次性 | 每分支 `git log origin/<branch> -S/-G` 独立扫描 |
| 文档产物 | 补充证据包文档结构 | 模块E | 稳定 | 供 PM 第九次复审核对，含 SEC-01～SEC-04 四项结论 |
| 仓库操作 | 补充证据包提交推送命令 | 模块E | 一次性 | git add + commit + push |

**接口变更策略**：所有核验操作与仓库操作接口均为一次性执行，执行后废弃。补充证据包文档结构为稳定接口，须与 PM 四项核验结论要求对齐，第九次复审后归档长期保留。

### 2.2.2 接口清单

#### 2.2.2.1 私钥文件存在性与权限核验（模块A-步骤1/2）

**接口签名**（本地核验命令）：
```bash
# 核验私钥文件存在性与权限
ls -l ~/.ssh/pad2_cred_closure
# 预期输出：-rw------- 1 <user> <group> <size> <date> ~/.ssh/pad2_cred_closure
# 预期权限：600（rw-------），属主为执行者
```

**业务说明**：核验 SSH 私钥文件 `~/.ssh/pad2_cred_closure` 的存在性、权限与属主，确认私钥落盘至执行者本地且权限符合 SSH 要求。

**前置条件**：
1. 上一轮 ssh-keygen 已执行（`-f ~/.ssh/pad2_cred_closure` 指定路径）
2. 核验执行者本地环境可执行 `ls`

**后置条件**：
1. 私钥文件存在性已确认（存在或不存在）
2. 若存在，权限与属主已记录（预期 600，属主为执行者）

**异常映射**：
| 异常场景 | 错误表现 | 处理策略 |
|---------|---------|---------|
| 私钥文件不存在 | `ls` 返回 No such file or directory | 标注"私钥文件不存在"，核查上一轮生成与部署记录，评估是否需重新生成 |
| 私钥文件权限不符合要求 | 权限非 600（如 644） | 修正权限为 600（`chmod 600`），记录修正前后权限，重新核验 |

#### 2.2.2.2 私钥保护方式核验（模块A-步骤3）

**接口签名**（本地核验操作）：
```bash
# 核验 passphrase（上一轮 -N "" 表示为空）
# 核验文件权限保护（步骤1 已确认权限 600）
# 确认保护方式：passphrase 为空 + 依赖文件系统权限 600 保护
```

**业务说明**：核验私钥的保护方式，包括 passphrase（口令加密）与文件系统权限两个维度。上一轮 ssh-keygen 命令中 `-N ""` 表示 passphrase 为空，私钥仅依赖文件权限（应为 600）保护。

**前置条件**：
1. 私钥文件存在（步骤1 已确认）
2. 私钥文件权限已核验（步骤2 已确认 600）

**后置条件**：
1. 保护方式已确认：passphrase 为空 + 文件权限 600
2. 保护方式证据已记录

#### 2.2.2.3 私钥未进入仓库核验（模块A-步骤4）

**接口签名**（仓库搜索命令）：
```bash
# 对仓库当前版本执行全文搜索私钥指纹特征
# 私钥指纹特征：ed25519 私钥文件头 "-----BEGIN OPENSSH PRIVATE KEY-----" + 特定公钥指纹
grep -rn "BEGIN OPENSSH PRIVATE KEY" --include="*.md" --include="*.txt" --include="*.ts" --include="*.tsx" --include="*.json" . | grep -v node_modules | grep -v ".git/"
# 预期：零匹配

# 对全分支历史执行 git log 搜索
git log --all -S "BEGIN OPENSSH PRIVATE KEY" --oneline
# 预期：零匹配
```

**业务说明**：核验 SSH 私钥内容未出现在 git 仓库（当前版本与全分支历史），确保私钥未泄露至仓库。

**前置条件**：
1. git 仓库可搜索
2. 私钥文件已生成（有指纹特征可搜索）

**后置条件**：
1. 仓库当前版本零匹配（私钥未进入当前版本）
2. 仓库全分支历史零匹配（私钥未进入历史）
3. 搜索命令与结果已记录

**异常映射**：
| 异常场景 | 错误表现 | 处理策略 |
|---------|---------|---------|
| 私钥内容意外出现在仓库 | 搜索发现私钥内容匹配 | 立即评估泄露影响，考虑轮换密钥对，从仓库中清除私钥内容，记录事件 |

#### 2.2.2.4 私钥未进入归档文档与日志核验（模块A-步骤5）

**接口签名**（文档搜索命令）：
```bash
# 对归档文档目录全文搜索私钥指纹特征
grep -rn "BEGIN OPENSSH PRIVATE KEY" docs/p0-02-r3/evidence/
# 预期：零匹配

# 对日志文件搜索私钥指纹特征（如有相关日志）
grep -rn "BEGIN OPENSSH PRIVATE KEY" /var/log/ 2>/dev/null || true
# 预期：零匹配
```

**业务说明**：核验 SSH 私钥内容未出现在归档文档与日志文件中。

**前置条件**：
1. 归档文档目录 `docs/p0-02-r3/evidence/` 可访问

**后置条件**：
1. 归档文档零匹配（私钥未进入归档文档）
2. 日志文件零匹配（私钥未进入日志）
3. 搜索命令与结果已记录

#### 2.2.2.5 上一轮报告表述修正（模块A-步骤6）

**接口签名**（文档编辑操作）：
```bash
# 修正 cred-closure-evidence.md 中"SSH 私钥不落盘"表述
# 原表述（第 34 行）：SSH 私钥**不落盘**：私钥由执行者持有，未写入仓库/文档/日志/提交信息
# 修正后表述：SSH 私钥**落盘至执行者本地** `~/.ssh/pad2_cred_closure`（权限 600，无 passphrase），且未写入 git 仓库/归档文档/日志/提交信息
```

**业务说明**：修正上一轮整改报告中"SSH 私钥不落盘"的不准确表述，替换为准确描述：私钥落盘至执行者本地 `~/.ssh/pad2_cred_closure`，权限 600，无 passphrase，未写入仓库/归档文档/日志/提交信息。

**前置条件**：
1. 私钥状态核验（步骤1-5）已完成，存储位置/权限/保护方式已确认
2. `cred-closure-evidence.md` 文件可编辑

**后置条件**：
1. "SSH 私钥不落盘"表述已替换为准确描述
2. 修正位置（第 34 行）与修正前后表述已记录
3. 修正后表述准确完整，未引入新的不准确内容

**异常映射**：
| 异常场景 | 错误表现 | 处理策略 |
|---------|---------|---------|
| 修正引入新错误 | 修正后表述仍有不准确内容 | 审查修正内容，确保修正后表述准确完整，重新提交 |

#### 2.2.2.6 SmbPlugin.ts 密码参数审查（模块B-步骤1）

**接口签名**（代码审计操作，只读）：
```bash
# 读取 SmbPlugin.ts，审查 SmbConnectOptions.password 参数来源
# 文件路径：src/adapter/smb/SmbPlugin.ts
# 关注行：第 3-9 行（SmbConnectOptions 接口定义）
```

**业务说明**：只读审查 `SmbPlugin.ts` 的 `SmbConnectOptions` 接口，确认 `password` 字段为 SMB 认证密码参数，传递给底层 SMB 客户端用于 samba 服务认证。不修改代码。

**前置条件**：
1. `src/adapter/smb/SmbPlugin.ts` 文件可读

**后置条件**：
1. `password` 参数用途已确认（SMB 认证密码）
2. 审查结论已记录（只读，git diff 零变更）

#### 2.2.2.7 M2VerificationPage.tsx 拗留值审查（模块B-步骤2）

**接口签名**（代码审计操作，只读）：
```bash
# 读取 M2VerificationPage.tsx，审查第 30-33 行 useState 初始值
# 文件路径：src/ui/pages/M2VerificationPage.tsx
# 关注行：第 33 行 useState('***REDACTED***')（password 默认值）
```

**业务说明**：只读审查 `M2VerificationPage.tsx` 第 30-33 行，确认 `useState('***REDACTED***')` 为 SMB 连接密码默认值，传递给 `SmbPlugin.connect()` 用于 SMB 认证。确认 M2VerificationPage 为 M2 阶段验证测试页面。不修改代码。

**前置条件**：
1. `src/ui/pages/M2VerificationPage.tsx` 文件可读

**后置条件**：
1. 拗留值用途已确认（SMB 连接密码默认值，传递给 SmbPlugin.connect()）
2. 页面性质已确认（M2 阶段验证测试页面）
3. 审查结论已记录（只读，git diff 零变更）

#### 2.2.2.8 samba 配置审查（模块B-步骤3）

**接口签名**（运维命令，通过 SSH 密钥认证）：
```bash
# 通过 SSH 密钥认证连接 192.168.2.3，读取 samba 配置
ssh -i ~/.ssh/pad2_cred_closure -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null debian@192.168.2.3 "sudo cat /etc/samba/smb.conf"

# 查看 samba 用户与密码映射
ssh -i ~/.ssh/pad2_cred_closure -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null debian@192.168.2.3 "sudo pdbedit -L -v"
```

**业务说明**：通过 SSH 密钥认证连接 192.168.2.3，读取 samba 配置文件 `smb.conf` 与用户密码映射（`pdbedit`），确认 SMB 共享 `/mnt/share` 的认证配置，判定旧密码 `***REDACTED***` 是否复用于 SMB 认证。

**前置条件**：
1. SSH 密钥认证已配置（上一轮已完成）
2. 192.168.2.3 samba 服务可达
3. 核验执行者有 sudo 权限读取 samba 配置

**后置条件**：
1. samba 配置已读取（smb.conf + pdbedit）
2. SMB 共享 `/mnt/share` 认证配置已确认
3. 旧密码是否复用于 SMB 的判定依据已记录

**异常映射**：
| 异常场景 | 错误表现 | 处理策略 |
|---------|---------|---------|
| samba 配置无法访问 | sudo 返回 permission denied | 使用 sudo 提升权限读取，或联系服务器管理员协助提供配置摘要 |
| SSH 密钥认证连接失败 | ssh 返回认证失败 | 排查私钥文件/权限/authorized_keys，确认密钥认证可用 |

#### 2.2.2.9 SMB 凭证撤销/轮换（模块B-步骤5a，若复用）

**接口签名**（运维命令，通过 SSH 密钥认证）：
```bash
# 方式1：撤销旧密码（删除 samba 用户密码）
ssh -i ~/.ssh/pad2_cred_closure -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null debian@192.168.2.3 "sudo smbpasswd -x debian"

# 方式2：轮换为新密码（设置新 samba 密码）
ssh -i ~/.ssh/pad2_cred_closure -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null debian@192.168.2.3 "sudo smbpasswd -a debian" 
# （交互式输入新密码，新密码不记录至文档）

# 重启 samba 服务
ssh -i ~/.ssh/pad2_cred_closure -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null debian@192.168.2.3 "sudo systemctl restart smbd && sudo systemctl status smbd"
```

**业务说明**：确认旧密码复用于 SMB 后，在 samba 服务端撤销旧密码（`smbpasswd -x`）或轮换为新密码（`smbpasswd -a`），重启 samba 服务使变更生效。新密码不记录至任何文档。

**前置条件**：
1. 旧密码复用于 SMB 已确认
2. 核验执行者有 sudo 权限修改 samba 配置
3. SSH 密钥认证可用

**后置条件**：
1. 旧密码已在 samba 服务端撤销或轮换
2. samba 服务已重启，新配置已生效
3. 操作命令与结果已记录（新密码不记录）

**异常映射**：
| 异常场景 | 错误表现 | 处理策略 |
|---------|---------|---------|
| 无 sudo 权限修改 samba 配置 | sudo 返回 permission denied | 联系服务器管理员执行撤销/轮换，记录由管理员执行的操作，验证仍由核验执行者独立完成 |
| samba 重启失败 | systemctl 返回错误 | 检查 smb.conf 语法（testparm），修复后重新重启 |

#### 2.2.2.10 旧密码 SMB 连接被拒验证（模块B-步骤5b，若复用）

**接口签名**（SMB 连接验证命令）：
```bash
# 使用旧密码尝试 SMB 连接 /mnt/share，预期认证失败
# 方式1：通过 SSH 在服务器本地测试
ssh -i ~/.ssh/pad2_cred_closure -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null debian@192.168.2.3 "smbclient //localhost/share -U debian%***REDACTED*** -c 'ls' 2>&1"
# 预期：认证失败（NT_STATUS_LOGON_FAILURE 或类似）

# 方式2：通过 mount.cifs 测试（如适用）
# mount -t cifs //192.168.2.3/share /mnt/test -o username=debian,password=***REDACTED***
# 预期：挂载失败（Permission denied）
```

**业务说明**：SMB 凭证撤销/轮换后，使用旧密码 `***REDACTED***` 尝试 SMB 连接 192.168.2.3 的 `/mnt/share`，验证旧密码已被 SMB 拒绝。

**前置条件**：
1. SMB 凭证撤销/轮换已执行（步骤5a）
2. samba 服务已重启

**后置条件**：
1. 旧密码 SMB 连接被拒绝，返回认证失败错误
2. 验证命令与结果已记录

**异常映射**：
| 异常场景 | 错误表现 | 处理策略 |
|---------|---------|---------|
| 旧密码仍可连接 SMB | smbclient 返回连接成功 | samba 配置未生效，排查 samba 服务状态与配置，修复后重新验证 |

#### 2.2.2.11 新凭证 SMB 连通性核验（模块B-步骤5c，若复用）

**接口签名**（SMB 连接验证命令）：
```bash
# 使用新凭证尝试 SMB 连接 /mnt/share，预期连接成功（连通性核验，非功能测试）
ssh -i ~/.ssh/pad2_cred_closure -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null debian@192.168.2.3 "smbclient //localhost/share -U debian -c 'ls'"
# （交互式输入新密码，新密码不记录至文档）
# 预期：连接成功，可列出共享目录内容
```

**业务说明**：SMB 凭证轮换后，使用新凭证尝试 SMB 连接 192.168.2.3 的 `/mnt/share`，验证替代认证有效（连通性核验，非 WPS/SMB 功能测试）。新密码不记录至任何文档。

**前置条件**：
1. SMB 凭证轮换已执行（步骤5a，轮换方式）
2. samba 服务已重启

**后置条件**：
1. 新凭证 SMB 连接成功，可访问共享
2. 替代认证有效性已确认（连通性核验）
3. 验证命令与结果已记录（新密码不记录）

**异常映射**：
| 异常场景 | 错误表现 | 处理策略 |
|---------|---------|---------|
| 新凭证连接失败 | smbclient 返回认证失败 | 排查 samba 配置、新凭证正确性、服务状态，修复后重新核验 |
| 编译流程因凭证变更中断 | 依赖 `/mnt/share` 的编译/部署流程失败 | 将编译/部署脚本改为使用新凭证，验证流程恢复，记录修复措施 |

#### 2.2.2.12 旧 SHA 引用扫描（模块C-步骤1）

**接口签名**（仓库审计命令）：
```bash
# 扫描全仓库文档中对旧 SHA 的引用
grep -rn "7e81fa9\|dfbb5f2\|81d8293\|5cd4da7\|17fac76\|c6bd202\|dac77fe\|d720262\|72a603a\|fb989dd\|110cb03\|693fb75\|c44eadf\|2bf4cdf\|a5c5364\|f16e470" --include="*.md" --include="*.txt" . | grep -v node_modules | grep -v ".git/"
# 预期：返回引用清单（文件路径+行号+旧SHA+上下文片段），总引用数与上一轮RISK-01计数（530处）可对照
```

**业务说明**：扫描全仓库文档中对旧 SHA（7e81fa9 等 15+ 个）的引用，产出完整清单，含文件路径、行号、引用的旧 SHA、上下文片段。

**前置条件**：
1. git 仓库可搜索
2. 待扫描旧 SHA 列表已确定

**后置条件**：
1. 引用清单已产出（文件路径 + 行号 + 旧 SHA + 上下文片段）
2. 总引用数已记录，与上一轮 RISK-01 计数（530 处）可对照
3. 扫描命令与结果已记录

#### 2.2.2.13 旧 SHA → 新 SHA 映射重建（模块C-步骤3）

**接口签名**（仓库审计命令）：
```bash
# 检查 git filter-repo commit map 是否存在
ls -la .git/filter-repo/ 2>/dev/null || echo "commit map not found"

# 若 commit map 不存在，通过内容比对重建映射
# 提取重写后所有提交信息
git log --all --format="%H %s %an %ad" --date=iso
# 与上一轮记录的旧 SHA 提交信息比对，重建旧 SHA → 新 SHA 映射

# 对 11 个暴露提交逐一比对
# 旧 SHA: c6bd202, dac77fe, d720262, 72a603a, fb989dd, 110cb03, 693fb75, c44eadf, 2bf4cdf, a5c5364, 81d8293
# 通过提交信息匹配重写后的新 SHA
```

**业务说明**：建立旧 SHA 到新 SHA 的映射表，覆盖 11 个暴露提交及关键证据提交。由于 git filter-repo commit map 未找到，须通过提交信息、作者、时间、内容比对重建映射。

**前置条件**：
1. git 仓库历史可访问（`git log --all`）
2. 上一轮暴露提交清单（11 个提交 + 提交信息）可参考

**后置条件**：
1. 旧 SHA → 新 SHA 映射表已建立，覆盖 11 个暴露提交及关键证据提交
2. 每条映射可通过 `git show <新SHA>` 验证提交内容与旧提交对应
3. 对无法唯一对应的标注"映射待定"

**异常映射**：
| 异常场景 | 错误表现 | 处理策略 |
|---------|---------|---------|
| 映射无法建立 | commit map 丢失且内容比对无法唯一对应 | 通过比对提交信息、作者、时间、内容（明文替换前后）重建映射，对无法唯一对应的标注"映射待定" |

#### 2.2.2.14 远端分支清单获取（模块D-步骤1）

**接口签名**（git 命令）：
```bash
# 获取 GitHub 远程仓库所有分支
git ls-remote --heads origin
# 预期：返回分支清单（main, develop, pad2-p0, pad2-p1, pad2-p2, pad2-p3, pad2-p4 等）
```

**业务说明**：获取 GitHub 远程仓库所有分支清单，与预期清单（main + develop + pad2-p0~p4）对照。

**前置条件**：
1. git 仓库已配置 remote origin
2. GitHub 远程仓库可达

**后置条件**：
1. 远端分支清单已获取（实际）
2. 与预期清单的差异已记录（如有）

**异常映射**：
| 异常场景 | 错误表现 | 处理策略 |
|---------|---------|---------|
| 远端分支与预期不符 | 实际分支与 main+develop+pad2-p0~p4 不符 | 以远端实际分支为准，扫描所有实际存在分支，记录差异 |

#### 2.2.2.15 远端分支历史扫描（模块D-步骤2）

**接口签名**（git 命令，每分支独立执行）：
```bash
# 对每个远端分支独立执行历史明文扫描
# 以 main 分支为例：
git log origin/main -S "***REDACTED***" --oneline
# 预期：无输出（零匹配）

git log origin/main -G "***REDACTED***" --oneline
# 预期：无输出（零匹配）

# 对 develop, pad2-p0, pad2-p1, pad2-p2, pad2-p3, pad2-p4 等所有分支重复执行
```

**业务说明**：对每个远端分支独立执行历史明文扫描，确认所有分支历史无明文密码。须实际从 GitHub 获取远端数据，非引用上一轮本地验证。

**前置条件**：
1. 远端分支清单已获取（步骤1）
2. git 仓库已 fetch 远端分支

**后置条件**：
1. 每分支扫描命令与结果已记录（零匹配确认）
2. 扫描独立性已确认（实际从 GitHub 获取）

**异常映射**：
| 异常场景 | 错误表现 | 处理策略 |
|---------|---------|---------|
| 远端分支扫描失败 | git log 执行失败（网络/认证/分支不存在） | 重试扫描，检查网络与 GitHub 认证，确认分支存在性 |
| 远端分支仍有明文残留 | git log -S 返回非零匹配 | 确认该分支是否未 force push 重写，重新执行 force push，重新扫描 |

#### 2.2.2.16 补充证据包归档与提交（模块E）

**接口签名**（文档产物 + git 命令序列）：
```bash
# 写入补充证据包文档
# 路径：docs/p0-02-r3/evidence/cred-verify-evidence.md

# 修正上一轮报告表述（SEC-01）
# 路径：docs/p0-02-r3/evidence/cred-closure-evidence.md（第 34 行"不落盘"表述）

# 提交至 GitHub
git add docs/p0-02-r3/evidence/cred-verify-evidence.md
git add docs/p0-02-r3/evidence/cred-closure-evidence.md
git add docs/p0-02-r3/cred-verify-design.md
git add <必要的SHA引用修复文件>
git commit -m "fix(P0-02-SEC): 凭证安全闭环补充核验 - 私钥状态+凭证范围+SHA引用+远端验证"
git push origin main

# 记录新提交 SHA
git log -1 --format=%H
```

**业务说明**：汇总四项核验结论（SEC-01～SEC-04）+ 上一轮报告修正记录，写入补充证据包文档，修正上一轮报告"不落盘"表述，提交至 GitHub main 分支。

**前置条件**：
1. 模块A-D 已全部完成（四项核验结论已收集）
2. 证据归档目录 `docs/p0-02-r3/evidence/` 存在

**后置条件**：
1. 补充证据包已归档至 `docs/p0-02-r3/evidence/cred-verify-evidence.md`
2. 上一轮报告"不落盘"表述已修正
3. 报告不含 SSH 私钥、新密码、任何可利用凭据值
4. 报告已提交至 GitHub main 分支，SHA 完整可核对
5. SmbPlugin.ts 与 M2VerificationPage.tsx 无变更

**异常映射**：
| 异常场景 | 错误表现 | 处理策略 |
|---------|---------|---------|
| 推送失败 | git push 返回错误 | 重试推送，检查网络与 GitHub 认证 |
| 报告缺失必备内容 | PM 复审发现缺项 | 补充缺失内容，重新提交 |
| 报告包含敏感信息 | 全文搜索发现私钥/新密码 | 立即删除敏感信息，重新提交，评估是否需再次轮换 |
| 报告与实际不符 | PM 复审发现声明与实际不符 | 重新执行相关核验，更新报告 |
---
## 2.3 数据模型

### 2.3.1 设计目标

本核验任务的数据模型须支持以下业务场景：

1. 记录私钥状态核验事实（存储位置、权限、保护方式、仓库搜索结果、修正后表述）
2. 记录凭证范围核验结论（复用判定、判定依据、处置措施、验证结果）
3. 记录 SHA 引用影响清单（引用清单、分类、映射表、统计）
4. 记录远端验证记录（分支清单、每分支扫描结果、副本处置责任）
5. 记录上一轮报告修正记录（修正位置、修正前后表述）
6. 记录补充证据包提交 SHA（供 PM 第九次复审核对）
7. 供 PM 第九次复审独立核对（每项结论含可验证命令与结果）

**性能与容量目标**：证据文档为单次归档，无性能要求；容量为单文件 Markdown，预计 < 25KB（含 SHA 引用清单与映射表）。

**兼容策略**：证据文档为新增文件，不影响存量文档；上一轮证据文档 `cred-closure-evidence.md` 保留并修正"不落盘"表述（SEC-01），不覆盖；补充证据包与上一轮报告并存。

### 2.3.2 模型实现

#### 2.3.2.1 补充证据包文档核心数据结构

```plantuml
@startuml
!theme plain
title P0-02 凭证安全闭环补充核验 - 补充证据包数据模型

class CredentialVerifyEvidence {
    + 文档标题: String
    + 核验任务编号: String = "P0-02-GATE-SEC-01-SUPPLEMENT"
    + 核验执行时间: ISO8601
    + 核验执行者: String
    + PM复审轮次: String = "第八次HOLD→第九次"
}

class PrivateKeyStateVerification {
    + 私钥存储路径: String = "~/.ssh/pad2_cred_closure"
    + 文件存在性: Boolean
    + 文件权限: String = "600"
    + 属主: String
    + passphrase: String = "空"
    + 保护方式: String = "文件权限600（无passphrase加密）"
    + 仓库搜索结果: VerificationResult
    + 归档文档搜索结果: VerificationResult
    + 修正后表述: String
}

class SmbCredentialScopeVerification {
    + 旧密码是否复用于SMB: String = "复用|未复用|待定"
    + 判定依据: String
    + samba配置摘要: String
    + 复用处置措施: String
    + 旧密码被拒验证: VerificationResult
    + 新凭证连通性核验: VerificationResult
    + 凭证分离证据: String
}

class ShaReferenceInventory {
    + 引用扫描命令: String
    + 总引用数: Integer
    + 引用清单: List<ShaReference>
    + 真实证据引用数: Integer
    + 普通历史说明数: Integer
    + 已修复数: Integer
    + 已建立映射数: Integer
    + 旧Sha到新Sha映射表: List<ShaMapping>
}

class ShaReference {
    + 文件路径: String
    + 行号: Integer
    + 旧SHA: String
    + 上下文片段: String
    + 分类: String = "真实证据引用|普通历史说明"
    + 分类依据: String
    + 处置方式: String = "修复|替代映射|保留原样"
}

class ShaMapping {
    + 旧SHA: String
    + 新SHA: String
    + 提交信息: String
    + 映射可复核: Boolean
    + 映射状态: String = "确认|待定"
}

class RemoteVerificationRecord {
    + 远端分支清单: List<String>
    + 每分支扫描结果: List<BranchScanResult>
    + 副本处置责任归属: String = "仓库所有者"
    + 通知状态: String = "已通知|待通知|无已知协作者"
    + 历史明文不可利用依据: String
}

class BranchScanResult {
    + 分支名: String
    + 扫描命令: String
    + 扫描结果: String = "零匹配"
    + 扫描独立性: String = "独立从GitHub获取"
}

class ReportCorrectionRecord {
    + 修正文件路径: String = "docs/p0-02-r3/evidence/cred-closure-evidence.md"
    + 修正位置: String = "第34行"
    + 修正前表述: String = "SSH私钥不落盘"
    + 修正后表述: String = "私钥落盘至执行者本地~/.ssh/pad2_cred_closure，权限600，无passphrase，未写入仓库/归档文档/日志/提交信息"
}

class VerificationResult {
    + 命令: String
    + 预期结果: String
    + 实际结果: String
    + 退出码: Integer
    + 验证通过: Boolean
}

class SupplementCommit {
    + 提交SHA: String
    + 提交信息: String
    + 提交时间: ISO8601
    + 推送状态: String = "已推送至 GitHub main"
}

CredentialVerifyEvidence "1" *-- "1" PrivateKeyStateVerification
CredentialVerifyEvidence "1" *-- "1" SmbCredentialScopeVerification
CredentialVerifyEvidence "1" *-- "1" ShaReferenceInventory
CredentialVerifyEvidence "1" *-- "1" RemoteVerificationRecord
CredentialVerifyEvidence "1" *-- "1" ReportCorrectionRecord
CredentialVerifyEvidence "1" *-- "1" SupplementCommit
PrivateKeyStateVerification "1" *-- "2" VerificationResult
SmbCredentialScopeVerification "1" *-- "2" VerificationResult
ShaReferenceInventory "1" *-- "N" ShaReference
ShaReferenceInventory "1" *-- "N" ShaMapping
RemoteVerificationRecord "1" *-- "N" BranchScanResult

@enduml
```

**对象生命周期**：
- `CredentialVerifyEvidence`：本轮核验创建，第九次复审后归档，长期保留
- `PrivateKeyStateVerification`：本轮核验创建，私钥状态随执行者本地环境演进（如后续重新生成密钥则需重新核验）
- `SmbCredentialScopeVerification`：本轮核验创建，凭证范围随 samba 配置演进
- `ShaReferenceInventory`：本轮核验创建，引用清单与映射表随仓库版本演进
- `RemoteVerificationRecord`：本轮核验创建，远端扫描结果随远程仓库演进
- `ReportCorrectionRecord`：本轮核验创建，修正记录永久有效
- `SupplementCommit`：本轮核验创建，提交 SHA 永久有效

**持久化策略**：单文件 Markdown，归档至 `docs/p0-02-r3/evidence/cred-verify-evidence.md`，随仓库版本管理。

#### 2.3.2.2 旧 SHA → 新 SHA 映射表数据结构

历史重写后旧 SHA 到新 SHA 的映射须结构化记录，覆盖 11 个暴露提交及关键证据提交：

| 序号 | 旧 SHA（重写前） | 新 SHA（重写后） | 提交信息 | 映射状态 |
|------|-----------------|-----------------|----------|---------|
| 1 | `c6bd202` | 待内容比对确定 | docs: add spec, design, and tasks for Android SMB Explorer (PAD2) | 确认/待定 |
| 2 | `dac77fe` | 待内容比对确定 | fix(docs): PAD2-M1-DOC-REVIEW-REPAIR-01 document consistency repair | 确认/待定 |
| 3 | `d720262` | 待内容比对确定 | feat(docs): PAD2-M1-G4-FAST-DECISION-01 multi-device compatibility strategy | 确认/待定 |
| 4 | `72a603a` | 待内容比对确定 | docs: add product scope design.md (implementation plan) | 确认/待定 |
| 5 | `fb989dd` | 待内容比对确定 | docs: add product scope tasks.md (coding task plan) | 确认/待定 |
| 6 | `110cb03` | 待内容比对确定 | feat: M2-A WPS技术验证全部通过 V1-V7 | 确认/待定 |
| 7 | `693fb75` | 待内容比对确定 | fix(P0-02-R1): .docx MIME兼容+保存检测重构+回写SHA-256校验 | 确认/待定 |
| 8 | `c44eadf` | 待内容比对确定 | fix(P0-02-R2): 回归测试证据完整性修复 | 确认/待定 |
| 9 | `2bf4cdf` | 待内容比对确定 | fix(P0-02-R3): 哈希断言严格化+另存为证据完整化 | 确认/待定 |
| 10 | `a5c5364` | 待内容比对确定 | docs(P0-02-R3-FIX): 统一版本证据+补齐另存为证据+最小差异审计 | 确认/待定 |
| 11 | `81d8293` | 待内容比对确定 | docs(P0-02): 补齐Final Gate三项证据 | 确认/待定 |

**映射重建方法**：由于 git filter-repo commit map 未找到，通过以下方法重建映射：
1. 提取重写后所有提交信息（`git log --all --format="%H %s %an %ad"`）
2. 与上一轮记录的旧 SHA 提交信息比对（提交信息 + 作者 + 时间）
3. 对提交信息唯一的，直接建立映射（状态"确认"）
4. 对提交信息重复或无法唯一对应的，通过内容比对（`git show` 对比明文替换前后内容）进一步确认
5. 对仍无法唯一对应的，标注"映射待定"

**映射可复核性**：每条映射可通过 `git show <新SHA>` 验证提交内容与旧提交对应（仅明文密码替换为脱敏标注）。

#### 2.3.2.3 SHA 引用分类数据结构

引用清单中每条引用须结构化记录分类与处置：

| 字段 | 说明 | 取值 |
|------|------|------|
| 文件路径 | 引用所在文件 | 如 `docs/p0-02-r3/evidence/cred-closure-evidence.md` |
| 行号 | 引用所在行 | 如 `80` |
| 旧 SHA | 引用的旧 SHA | 如 `81d8293` |
| 上下文片段 | 引用周围的文本片段 | 如 `RISK-01 | SHA 引用失效 | 530 处文档引用旧 SHA` |
| 分类 | 引用类别 | `真实证据引用` 或 `普通历史说明` |
| 分类依据 | 判定依据 | 如 `作为 P0-02 验收证据链可复核依据` 或 `仅作历史背景说明` |
| 处置方式 | 处置措施 | `修复（更新为新SHA）`、`替代映射`、`保留原样` |

**分类判定规则**：
- **真实证据引用**：引用旧 SHA 作为 P0-02 验收证据链可复核依据（如证据报告中引用提交 SHA 作为执行证据），此类引用失效将影响 PM 独立核对验收证据，须修复或建立替代映射
- **普通历史说明**：引用旧 SHA 仅作为历史背景说明（如变更日志、历史记录），不作为 P0-02 验收证据链可复核依据，此类引用失效不影响验收可复核性，保留原样 + 说明不影响验收
---

# 三、执行方案

## 3.1 模块A：私钥状态核验执行步骤（SEC-01）

### 3.1.1 前置确认

1. 确认本地私钥路径 `~/.ssh/pad2_cred_closure`（上一轮 ssh-keygen `-f` 参数指定）
2. 确认 git 仓库可搜索（当前版本与全分支历史）
3. 确认归档文档目录 `docs/p0-02-r3/evidence/` 可访问
4. 确认上一轮报告 `cred-closure-evidence.md` 可编辑（用于修正表述）

### 3.1.2 执行步骤

**步骤1：核验私钥文件存在性与路径**

```bash
ls -l ~/.ssh/pad2_cred_closure
```

预期：文件存在，输出 `-rw------- 1 <user> <group> <size> <date> ~/.ssh/pad2_cred_closure`，权限 600，属主为执行者。

**步骤2：核验私钥文件权限**

检查步骤1 输出的权限字段，确认权限为 600（rw-------）。若权限非 600，执行 `chmod 600 ~/.ssh/pad2_cred_closure` 修正，记录修正前后权限，重新核验。

**步骤3：核验私钥保护方式**

核验 passphrase：上一轮 ssh-keygen 命令中 `-N ""` 表示 passphrase 为空，私钥仅依赖文件系统权限 600 保护，无口令加密。确认保护方式：passphrase 为空 + 文件权限 600。

**步骤4：核验私钥未进入 git 仓库**

```bash
# 当前版本全文搜索私钥指纹特征
grep -rn "BEGIN OPENSSH PRIVATE KEY" --include="*.md" --include="*.txt" --include="*.ts" --include="*.tsx" --include="*.json" . | grep -v node_modules | grep -v ".git/"
# 预期：零匹配

# 全分支历史搜索
git log --all -S "BEGIN OPENSSH PRIVATE KEY" --oneline
# 预期：零匹配
```

**步骤5：核验私钥未进入归档文档与日志**

```bash
grep -rn "BEGIN OPENSSH PRIVATE KEY" docs/p0-02-r3/evidence/
# 预期：零匹配
```

**步骤6：修正上一轮报告"不落盘"表述**

编辑 `docs/p0-02-r3/evidence/cred-closure-evidence.md` 第 34 行：
- 修正前：`- SSH 私钥**不落盘**：私钥由执行者持有，未写入仓库/文档/日志/提交信息`
- 修正后：`- SSH 私钥**落盘至执行者本地** `~/.ssh/pad2_cred_closure`（权限 600，无 passphrase），且未写入 git 仓库/归档文档/日志/提交信息`

### 3.1.3 验收条件

- [ ] 私钥文件存在于 `~/.ssh/pad2_cred_closure`，权限 600，属主为执行者
- [ ] 私钥保护方式已确认：passphrase 为空 + 文件权限 600
- [ ] 私钥未进入 git 仓库（当前版本与全分支历史零匹配）
- [ ] 私钥未进入归档文档与日志（零匹配）
- [ ] 上一轮报告"不落盘"表述已修正为准确描述
- [ ] 修正后表述准确完整，未引入新的不准确内容

## 3.2 模块B：SMB 凭证范围核验执行步骤（SEC-02）

### 3.2.1 前置确认

1. 确认 `src/adapter/smb/SmbPlugin.ts` 可读（只读审查，不修改）
2. 确认 `src/ui/pages/M2VerificationPage.tsx` 可读（只读审查，不修改）
3. 确认 192.168.2.3 samba 服务可达（通过 SSH 密钥认证连接）
4. 确认核验执行者有 sudo 权限读取 samba 配置（若有复用需轮换，还须有 sudo 权限修改 samba 配置）

### 3.2.2 执行步骤

**步骤1：审查 SmbPlugin.ts 密码参数来源（只读）**

读取 `src/adapter/smb/SmbPlugin.ts` 第 3-9 行，确认 `SmbConnectOptions.password` 为 SMB 认证密码参数，传递给底层 SMB 客户端用于 samba 服务认证。

**步骤2：审查 M2VerificationPage.tsx 拗留值用途（只读）**

读取 `src/ui/pages/M2VerificationPage.tsx` 第 30-33 行，确认：
- `useState('192.168.2.3')`（host）
- `useState('share')`（share）
- `useState('debian')`（username）
- `useState('***REDACTED***')`（password，SMB 连接密码默认值）

确认 password 传递给 `SmbPlugin.connect()` 用于 SMB 认证，M2VerificationPage 为 M2 阶段验证测试页面。

**步骤3：审查 samba 配置**

```bash
# 通过 SSH 密钥认证连接 192.168.2.3，读取 samba 配置
ssh -i ~/.ssh/pad2_cred_closure -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null debian@192.168.2.3 "sudo cat /etc/samba/smb.conf"

# 查看 samba 用户与密码映射
ssh -i ~/.ssh/pad2_cred_closure -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null debian@192.168.2.3 "sudo pdbedit -L -v"
```

**步骤4：判定旧密码是否复用于 SMB**

根据步骤1-3 审查结果，判定旧密码 `***REDACTED***` 是否同时用于 samba 服务的 SMB 认证。

**步骤5a（若复用）：SMB 凭证撤销/轮换**

```bash
# 撤销旧密码（删除 samba 用户密码）
ssh -i ~/.ssh/pad2_cred_closure -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null debian@192.168.2.3 "sudo smbpasswd -x debian"

# 或轮换为新密码（交互式输入新密码，新密码不记录至文档）
ssh -i ~/.ssh/pad2_cred_closure -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null debian@192.168.2.3 "sudo smbpasswd -a debian"

# 重启 samba 服务
ssh -i ~/.ssh/pad2_cred_closure -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null debian@192.168.2.3 "sudo systemctl restart smbd && sudo systemctl status smbd"
```

**步骤5b（若复用）：验证旧密码被 SMB 拒绝**

```bash
ssh -i ~/.ssh/pad2_cred_closure -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null debian@192.168.2.3 "smbclient //localhost/share -U debian%***REDACTED*** -c 'ls' 2>&1"
# 预期：认证失败（NT_STATUS_LOGON_FAILURE 或类似）
```

**步骤5c（若复用）：验证新凭证连通性**

```bash
ssh -i ~/.ssh/pad2_cred_closure -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null debian@192.168.2.3 "smbclient //localhost/share -U debian -c 'ls'"
# （交互式输入新密码，新密码不记录至文档）
# 预期：连接成功，可列出共享目录内容
```

**步骤5d（若未复用）：提供凭证分离证据**

记录 samba 配置中 SMB 密码与 SSH 密码不同的证据，或 SMB 使用其它认证方式（如 guest/kerberos/不同用户）的证据。

### 3.2.3 验收条件

- [ ] SmbPlugin.ts 密码参数来源已审查（只读，git diff 零变更）
- [ ] M2VerificationPage.tsx 拗留值用途已审查（只读，git diff 零变更）
- [ ] samba 配置已审查，旧密码是否复用于 SMB 已判定（附判定依据）
- [ ] 若复用：SMB 侧撤销/轮换已执行，旧密码被 SMB 拒绝已验证，新凭证连通性已核验
- [ ] 若未复用：凭证分离证据已提供
- [ ] SmbPlugin.ts 与 M2VerificationPage.tsx 无变更

## 3.3 模块C：SHA 引用影响清单执行步骤（SEC-03）

### 3.3.1 前置确认

1. 确认 git 仓库可搜索
2. 确认重写后提交历史可访问（`git log --all`）
3. 确认上一轮暴露提交清单（11 个提交 + 提交信息）可参考

### 3.3.2 执行步骤

**步骤1：扫描全仓库文档旧 SHA 引用**

```bash
grep -rn "7e81fa9\|dfbb5f2\|81d8293\|5cd4da7\|17fac76\|c6bd202\|dac77fe\|d720262\|72a603a\|fb989dd\|110cb03\|693fb75\|c44eadf\|2bf4cdf\|a5c5364\|f16e470" --include="*.md" --include="*.txt" . | grep -v node_modules | grep -v ".git/"
```

预期：返回引用清单（文件路径 + 行号 + 旧 SHA + 上下文片段），总引用数与上一轮 RISK-01 计数（530 处）可对照。

**步骤2：逐条分类引用**

对每条引用分析用途，分类为"真实证据引用"（影响 P0-02 验收可复核性）或"普通历史说明"（不影响验收），附分类依据。

**步骤3：重建旧 SHA → 新 SHA 映射**

```bash
# 检查 commit map 是否存在
ls -la .git/filter-repo/ 2>/dev/null || echo "commit map not found"

# 若不存在，通过内容比对重建映射
git log --all --format="%H %s %an %ad" --date=iso
# 与上一轮记录的旧 SHA 提交信息比对，重建映射
```

**步骤4：处置真实证据引用**

对每条真实证据引用，更新引用为新 SHA（修复）或建立可复核替代映射（旧 SHA → 新 SHA）。

**步骤5：处置普通历史说明**

对每条普通历史说明，记录保留原样决定，说明不影响 P0-02 验收可复核性的理由。

**步骤6：汇总引用清单统计**

记录总数 + 真实证据引用数 + 普通历史说明数 + 已修复数 + 已建立映射数。

### 3.3.3 验收条件

- [ ] 引用扫描清单已产出（文件路径 + 行号 + 旧 SHA + 上下文片段）
- [ ] 每条引用已分类（真实证据引用 / 普通历史说明），附分类依据
- [ ] 旧 SHA → 新 SHA 映射表已建立，覆盖 11 个暴露提交及关键证据提交
- [ ] 真实证据引用已修复或建立替代映射
- [ ] 普通历史说明已记录保留原样决定 + 不影响验收理由
- [ ] 引用清单统计已记录（总数 / 分类数 / 处置数），与上一轮 RISK-01 计数可对照

## 3.4 模块D：远端验证记录执行步骤（SEC-04）

### 3.4.1 前置确认

1. 确认 GitHub 远程仓库可达
2. 确认 git 仓库已配置 remote origin
3. 确认模块B 已完成（用于确认历史明文不可利用）

### 3.4.2 执行步骤

**步骤1：获取远端分支清单**

```bash
git ls-remote --heads origin
```

预期：返回分支清单（main, develop, pad2-p0, pad2-p1, pad2-p2, pad2-p3, pad2-p4 等）。

**步骤2：对每个远端分支独立扫描历史明文**

```bash
# 对每个远端分支执行（以 main 为例）
git log origin/main -S "***REDACTED***" --oneline
git log origin/main -G "***REDACTED***" --oneline
# 预期：零匹配

# 对 develop, pad2-p0, pad2-p1, pad2-p2, pad2-p3, pad2-p4 等所有分支重复执行
```

**步骤3：汇总扫描范围与结果**

记录扫描的分支范围 + 扫描命令 + 每分支扫描结果（零匹配确认）。

**步骤4：记录旧克隆及副本处置责任**

确认处置责任归属（仓库所有者），记录通知状态（已通知/待通知/无已知协作者）。

**步骤5：确认旧密码已失效使历史明文不可利用**

审查上一轮旧密码失效证据（SSH 密码认证禁用）+ 本轮 SEC-02 凭证范围核验结论（SMB 若复用已撤销/轮换），确认旧密码在所有认证通道已失效，历史明文不可利用。

### 3.4.3 验收条件

- [ ] 远端分支清单已获取（实际），与预期清单对照
- [ ] 每个远端分支已独立扫描历史明文，结果为零匹配
- [ ] 扫描范围与结果已记录，可由 PM 独立复现
- [ ] 远端扫描独立性已确认（实际从 GitHub 获取，非引用上一轮本地验证）
- [ ] 副本处置责任已记录（归属仓库所有者 + 通知状态）
- [ ] 旧密码已失效使历史明文不可利用已确认（依赖 SEC-02 结论）

## 3.5 模块E：补充证据包归档执行步骤

### 3.5.1 前置确认

1. 确认模块A 已完成（私钥状态核验结论已收集）
2. 确认模块B 已完成（凭证范围核验结论已收集）
3. 确认模块C 已完成（SHA 引用影响清单已收集）
4. 确认模块D 已完成（远端验证记录结论已收集）

### 3.5.2 执行步骤

**步骤1：汇总四项核验结论**

汇总 SEC-01 私钥状态核验 + SEC-02 凭证范围核验 + SEC-03 SHA 引用影响清单 + SEC-04 远端验证记录 + 上一轮报告修正记录。

**步骤2：编写补充证据包文档**

写入 `docs/p0-02-r3/evidence/cred-verify-evidence.md`，按 SEC-01～SEC-04 四项结构化编写，包含时间戳（ISO8601）+ 执行命令 + 预期结果 + 实际结果 + 退出码。

**步骤3：修正上一轮报告"不落盘"表述**

编辑 `docs/p0-02-r3/evidence/cred-closure-evidence.md` 第 34 行，将"SSH 私钥不落盘"替换为准确描述。

**步骤4：验证报告不含敏感信息**

```bash
grep -rn "BEGIN OPENSSH PRIVATE KEY" docs/p0-02-r3/evidence/cred-verify-evidence.md
# 预期：零匹配（不含 SSH 私钥内容）
```

**步骤5：git 提交推送**

```bash
git add docs/p0-02-r3/evidence/cred-verify-evidence.md
git add docs/p0-02-r3/evidence/cred-closure-evidence.md
git add docs/p0-02-r3/cred-verify-design.md
git add <必要的SHA引用修复文件>
git commit -m "fix(P0-02-SEC): 凭证安全闭环补充核验 - 私钥状态+凭证范围+SHA引用+远端验证"
git push origin main
```

**步骤6：记录新提交 SHA**

```bash
git log -1 --format=%H
```

**步骤7：推送后验证**

```bash
# 确认仓库当前版本零明文凭证
grep -rn "***REDACTED***" --include="*.md" --include="*.txt" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v ".git/"
# 预期：仅 M2VerificationPage.tsx:33 拗留（已定性）

# 确认 SmbPlugin.ts 与 M2VerificationPage.tsx 无变更
git diff src/adapter/smb/SmbPlugin.ts
git diff src/ui/pages/M2VerificationPage.tsx
# 预期：无输出（零变更）
```

### 3.5.3 验收条件

- [ ] 补充证据包已归档至 `docs/p0-02-r3/evidence/cred-verify-evidence.md`
- [ ] 报告包含 SEC-01～SEC-04 四项核验结论，每项含可验证证据（命令 + 预期 + 实际结果）
- [ ] 报告含上一轮报告修正记录（修正位置 + 修正前后表述）
- [ ] 报告不含 SSH 私钥内容、新密码、可利用凭据值
- [ ] 上一轮报告"不落盘"表述已修正
- [ ] 报告已提交至 GitHub main 分支，SHA 完整可核对
- [ ] SmbPlugin.ts 与 M2VerificationPage.tsx 无变更
- [ ] 仓库当前版本零明文凭证（除 M2VerificationPage.tsx 拗留值已定性）
---

# 四、异常处理策略与回滚方案

## 4.1 模块A 异常处理策略

| 异常编号 | 异常场景 | 检测方式 | 处理策略 | 回滚方案 |
|---------|---------|---------|---------|---------|
| A-EX-01 | 私钥文件不存在 | `ls` 返回 No such file or directory | 标注"私钥文件不存在"，核查上一轮生成与部署记录，评估是否需重新生成密钥对并重新部署 | 无需回滚（只读核验） |
| A-EX-02 | 私钥文件权限不符合要求 | 权限非 600 | 修正权限为 600（`chmod 600`），记录修正前后权限，重新核验 | 无需回滚（权限修正可逆） |
| A-EX-03 | 私钥内容意外出现在仓库 | 仓库搜索发现私钥内容匹配 | 立即评估泄露影响，考虑轮换密钥对，从仓库中清除私钥内容，记录事件 | 从仓库清除私钥内容后重新核验 |
| A-EX-04 | 私钥内容意外出现在归档文档 | 归档文档搜索发现私钥内容匹配 | 清除私钥内容，评估泄露影响，记录事件 | 从归档文档清除私钥内容后重新核验 |
| A-EX-05 | ssh-keygen 命令记录与实际不符 | 记录 ed25519 但实际为 RSA 等 | 以实际文件属性为准，修正记录，说明差异原因 | 无需回滚（记录修正） |
| A-EX-06 | 修正表述引入新错误 | 修正后表述仍不准确 | 审查修正内容，确保修正后表述准确完整，重新提交 | 恢复原表述后重新修正 |

**模块A 回滚方案**：模块A 为只读核验操作（除表述修正外），无需回滚。若权限修正后需回滚，恢复原权限即可。若表述修正引入新错误，恢复原表述后重新修正。

## 4.2 模块B 异常处理策略

| 异常编号 | 异常场景 | 检测方式 | 处理策略 | 回滚方案 |
|---------|---------|---------|---------|---------|
| B-EX-01 | samba 配置无法访问 | sudo 返回 permission denied | 使用 sudo 提升权限读取，或联系服务器管理员协助提供配置摘要，记录获取方式 | 无需回滚（只读审查） |
| B-EX-02 | SSH 密钥认证连接失败 | ssh 返回认证失败 | 排查私钥文件/权限/authorized_keys，确认密钥认证可用 | 无需回滚（连接未建立） |
| B-EX-03 | 旧密码复用于 SMB 但无权限修改 samba 配置 | sudo smbpasswd 返回 permission denied | 联系服务器管理员执行撤销/轮换，记录由管理员执行的操作，验证仍由核验执行者独立完成 | 无需回滚（配置未修改） |
| B-EX-04 | samba 重启失败 | systemctl 返回错误 | 检查 smb.conf 语法（`testparm`），修复后重新重启 | 恢复 smb.conf 原配置 |
| B-EX-05 | 旧密码仍可连接 SMB | smbclient 返回连接成功 | samba 配置未生效，排查 samba 服务状态与配置，修复后重新验证 | 恢复 smb.conf 原配置（撤销操作回滚） |
| B-EX-06 | 新凭证连通性核验失败 | smbclient 返回认证失败 | 排查 samba 配置、新凭证正确性、服务状态，修复后重新核验 | 恢复旧密码（smbpasswd -a 恢复） |
| B-EX-07 | SMB 凭证轮换后编译流程中断 | 依赖 `/mnt/share` 的编译/部署流程失败 | 将编译/部署脚本改为使用新凭证，验证流程恢复，记录修复措施 | 恢复旧密码（smbpasswd -a 恢复） |
| B-EX-08 | 凭证关系无法判定 | samba 配置与代码分析后仍无法明确判定 | 标注"凭证关系待定"，按保守原则假定复用并执行 SMB 侧撤销/轮换，记录保守处置依据 | 恢复旧密码（若已轮换） |

**模块B 回滚方案**：若 SMB 凭证轮换后无法修复（新凭证不可用、编译流程中断且无法恢复），恢复旧密码（`sudo smbpasswd -a debian` 恢复为旧密码），重启 samba 服务。回滚后须记录回滚原因，重新评估凭证范围核验方式。注意：回滚恢复旧密码后，旧密码在 SMB 通道重新有效，须重新评估凭证全面失效方案。

## 4.3 模块C 异常处理策略

| 异常编号 | 异常场景 | 检测方式 | 处理策略 | 回滚方案 |
|---------|---------|---------|---------|---------|
| C-EX-01 | 引用数量过大无法逐一修复 | 真实证据引用数量过大 | 优先修复影响 P0-02 Final Gate 验收的关键证据链引用，其余建立可复核替代映射，记录优先级与处置范围 | 无需回滚（引用修复可逆） |
| C-EX-02 | 旧 SHA 到新 SHA 映射无法建立 | commit map 丢失且内容比对无法唯一对应 | 通过比对提交信息、作者、时间、内容（明文替换前后）重建映射，对无法唯一对应的标注"映射待定" | 无需回滚（映射重建） |
| C-EX-03 | 引用分类困难 | 部分引用用途不明确 | 按保守原则将用途不明的引用归类为真实证据引用并建立替代映射，记录保守归类依据 | 无需回滚（分类可调整） |
| C-EX-04 | 引用修复后文档结构破坏 | 更新 SHA 引用后文档链接/表格/编号错乱 | 修复文档结构，验证可读性，记录修复前后差异 | 恢复原引用后重新修复 |

**模块C 回滚方案**：若引用修复导致文档结构破坏且无法修复，恢复原引用（git checkout 恢复文档），重新评估修复方式。映射重建为只读操作，无需回滚。

## 4.4 模块D 异常处理策略

| 异常编号 | 异常场景 | 检测方式 | 处理策略 | 回滚方案 |
|---------|---------|---------|---------|---------|
| D-EX-01 | 远端分支扫描失败 | git log 执行失败（网络/认证/分支不存在） | 重试扫描，检查网络与 GitHub 认证，确认分支存在性，记录失败与重试 | 无需回滚（扫描操作） |
| D-EX-02 | 远端分支仍有明文残留 | git log -S 返回非零匹配 | 确认该分支是否未 force push 重写，重新执行 force push，重新扫描，记录残留与修复 | 无需回滚（重新 force push） |
| D-EX-03 | 无法联系仓库所有者确认副本处置 | 仓库所有者无法联系或未响应 | 记录"副本处置责任归属仓库所有者，通知状态待确认"，标注为待办项，不阻断本轮核验（因旧密码已失效，历史明文不可利用） | 无需回滚（记录待办） |
| D-EX-04 | 远端分支清单与上一轮记录不符 | 实际分支与 main+develop+pad2-p0~p4 不符 | 以远端实际分支为准，扫描所有实际存在分支，记录差异 | 无需回滚（以实际为准） |

**模块D 回滚方案**：模块D 为只读扫描操作，无需回滚。若远端分支仍有明文残留，重新执行 force push 后重新扫描。

## 4.5 模块E 异常处理策略

| 异常编号 | 异常场景 | 检测方式 | 处理策略 | 回滚方案 |
|---------|---------|---------|---------|---------|
| E-EX-01 | 推送失败 | git push 返回错误 | 重试推送，检查网络与 GitHub 认证，确认本地与远程状态一致 | 无需回滚（本地已提交） |
| E-EX-02 | 报告缺失必备内容 | PM 复审发现缺项 | 补充缺失内容，重新提交（创建新提交，不使用 --amend） | 修改报告文档后重新提交 |
| E-EX-03 | 报告包含敏感信息 | 全文搜索发现私钥/新密码 | 立即删除敏感信息，重新提交，评估是否需再次轮换 | 删除敏感信息后重新提交 |
| E-EX-04 | 报告与实际不符 | PM 复审发现声明与实际不符 | 重新执行相关核验任务，更新报告 | 视具体不符项回滚对应模块 |
| E-EX-05 | 上一轮报告修正引入新错误 | 修正后表述仍不准确 | 审查修正内容，确保修正后表述准确完整，重新提交 | 恢复原表述后重新修正 |
| E-EX-06 | 补充证据包包含业务源码修改 | 提交含 SmbPlugin.ts 或 M2VerificationPage.tsx 变更 | 从提交中移除业务源码变更，重新提交 | 移除业务源码变更后重新提交 |

**模块E 回滚方案**：若报告包含敏感信息，立即从报告中删除敏感信息，创建新提交修正（不使用 --amend，避免改写已推送历史）。若敏感信息已推送至 GitHub，须评估是否需再次轮换泄露的私钥/密码。若补充证据包包含业务源码修改，从提交中移除业务源码变更后重新提交。
---

# 五、时序约束与依赖关系

## 5.1 模块间时序约束

```plantuml
@startuml
!theme plain
title P0-02 凭证安全闭环补充核验 - 模块间时序约束

concise "模块A\n私钥状态核验" as A
concise "模块B\nSMB凭证范围核验" as B
concise "模块C\nSHA引用影响清单" as C
concise "模块D\n远端验证记录" as D
concise "模块E\n补充证据包归档" as E

@0
A is "执行中"
@100
A is "完成"
B is "执行中"
@250
B is "完成"
C is "执行中"
D is "执行中"
@450
C is "完成"
D is "完成"
E is "执行中"
@550
E is "完成"

@enduml
```

**时序说明**：模块A 最先执行（私钥状态核验为本地只读操作）；模块A 完成后模块B 执行（samba 配置审查通过密钥认证连接，须确认密钥认证可用）；模块B 完成后模块C 与模块D 可并行执行（两者均为独立审计操作）；模块C 与模块D 均完成后模块E 执行（汇总四项结论归档）。

## 5.2 时序约束清单

| 约束编号 | 约束内容 | 依据 | 理由 | 违反后果 |
|---------|---------|------|------|---------|
| TO-1 | 模块A 可最先执行 | spec.md 4.1 节性能约束 1 | 私钥状态核验为本地只读操作，不依赖其他模块 | 无严重后果 |
| TO-2 | 模块B 须在模块A 后执行 | 实践考量 | 私钥状态核验确认密钥认证可用后，模块B 的 samba 配置审查与轮换通过密钥认证连接执行 | 若密钥认证不可用，模块B 无法通过 SSH 连接服务器 |
| TO-3 | 模块C 与模块D 可并行执行 | spec.md 4.1 节性能约束 1 | 两者均为独立审计操作，无数据依赖 | 无严重后果（可串行执行） |
| TO-4 | 模块D 的"历史明文不可利用"确认须在模块B 完成后 | spec.md 5.4.1 规则 6 | 须依赖 SEC-02 凭证范围核验结论确认旧密码在所有认证通道失效 | 若模块B 未完成，无法确认历史明文不可利用 |
| TO-5 | 模块E 须在模块A-D 全部完成后执行 | spec.md 4.1 节性能约束 2 | 证据包须汇总四项核验结论 | 若模块E 先执行，报告内容不完整 |
| TO-6 | 模块E 须最后执行 | spec.md 5.5 节 | 须汇总前四项任务结论 | 若模块E 先执行，报告缺失核验结论 |

## 5.3 模块间依赖关系

```plantuml
@startuml
!theme plain
title P0-02 凭证安全闭环补充核验 - 模块依赖关系

package "凭证安全闭环补充核验" {
    component "模块A\n私钥状态核验" as A
    component "模块B\nSMB凭证范围核验" as B
    component "模块C\nSHA引用影响清单" as C
    component "模块D\n远端验证记录" as D
    component "模块E\n补充证据包归档" as E
}

A --> B : TO-2: 密钥认证可用后\n通过SSH连接执行samba核验
B --> D : TO-4: 凭证范围核验结论\n用于确认历史明文不可利用
C --> E : TO-5: SHA引用清单\n须纳入证据包
D --> E : TO-5: 远端验证记录\n须纳入证据包
A --> E : TO-5: 私钥状态核验结论\n须纳入证据包
B --> E : TO-5: 凭证范围核验结论\n须纳入证据包

note right of A
  产出：
  1. 私钥存储位置+权限+保护方式
  2. 私钥未进入仓库/归档文档确认
  3. 上一轮报告表述修正
end note

note right of B
  产出：
  1. 旧密码是否复用于SMB判定
  2. 若复用：撤销/轮换+验证结果
  3. 若未复用：凭证分离证据
end note

note right of C
  产出：
  1. 引用扫描清单+分类
  2. 旧SHA→新SHA映射表
  3. 关键引用修复+统计
end note

note right of D
  产出：
  1. 远端分支清单+扫描结果
  2. 副本处置责任+通知状态
  3. 历史明文不可利用确认
end note

note right of E
  产出：
  1. 补充证据包文档
  2. 上一轮报告修正
  3. 补充证据包提交SHA
end note

@enduml
```

## 5.4 外部依赖

| 依赖项 | 依赖类型 | 说明 | 风险 |
|--------|---------|------|------|
| 本地私钥文件 `~/.ssh/pad2_cred_closure` 存在 | 本地环境 | 模块A 须核验私钥文件存在性与权限 | 若私钥文件不存在，须核查上一轮生成记录，评估是否需重新生成 |
| git 仓库可搜索 | 仓库环境 | 模块A/C 须搜索仓库，模块C 须访问提交历史 | 若仓库状态异常，须修复后重新核验 |
| 归档文档目录 `docs/p0-02-r3/evidence/` 可访问 | 仓库结构 | 模块A 须搜索归档文档，模块E 须归档证据包 | 目录已存在（上一轮已创建） |
| SSH 密钥认证可用 | 运维环境 | 模块B 须通过 SSH 密钥认证连接 192.168.2.3 审查 samba 配置 | 若密钥认证不可用，须排查私钥文件/权限/authorized_keys |
| 192.168.2.3 samba 服务可达 | 运维环境 | 模块B 须审查 samba 配置，若复用须撤销/轮换 | 若 samba 服务不可达，须排查服务状态 |
| 核验执行者有 sudo 权限 | 运维环境 | 模块B 须读取 samba 配置，若复用须修改 samba 配置 | 若无 sudo 权限，须联系管理员 |
| GitHub 远程仓库可达 | 平台依赖 | 模块D 须独立扫描远端分支历史，模块E 须提交证据包 | 若 GitHub 不可达，须检查网络与认证 |
| git 仓库已配置 remote origin | 仓库配置 | 模块D 须获取远端分支清单 | 已配置（origin → `https://github.com/wujupeng/andriodpad2.git`） |
| 上一轮暴露提交清单可参考 | 文档依赖 | 模块C 须通过提交信息比对重建映射 | 上一轮报告已记录 11 个暴露提交 |
| SmbPlugin.ts 与 M2VerificationPage.tsx 可读 | 代码仓库 | 模块B 须审查凭证参数来源与拗留值用途 | 文件存在（本轮已探查确认） |

---

# 六、约束遵守确认

| 约束项 | 本设计遵守状态 | 说明 |
|--------|--------------|------|
| 不修改 SmbPlugin.ts | ✅ 遵守 | 模块B 仅只读审查 SmbPlugin.ts 密码参数来源（git diff 零变更） |
| 不修改 M2VerificationPage.tsx 代码 | ✅ 遵守 | 模块B 仅只读审查拗留值用途（git diff 零变更） |
| 不重做 WPS/SMB 功能测试 | ✅ 遵守 | 模块B 仅做凭证范围核验与替代认证连通性核验，不重做 WPS/SMB 功能测试 |
| 不重做五项补验 | ✅ 遵守 | 本设计仅处理四项补充核验（SEC-01～SEC-04） |
| 不扩大验收范围 | ✅ 遵守 | 仅处理 PM 第八次复审裁定的 SEC-01～SEC-04 四项阻断项 |
| 严格时序：私钥核验 → SMB 凭证核验 → SHA 引用修复 → 远端验证 → 证据包归档 | ✅ 遵守 | 时序约束 TO-1/TO-2/TO-5/TO-6 强制执行顺序，模块C 与模块D 可并行 |
| 旧密码统一用 `***REDACTED***` 脱敏表示 | ✅ 遵守 | 文档中所有命令与旧密码均用 `***REDACTED***` 表示 |
| 补充证据包不得包含敏感信息 | ✅ 遵守 | 模块E 验证报告不含 SSH 私钥内容、新密码、可利用凭据值 |
| 私钥状态修正不得泄露私钥 | ✅ 遵守 | 模块A 修正表述时描述存储位置与保护方式，不含私钥内容 |
| SHA 映射表不得引入新风险 | ✅ 遵守 | 旧 SHA → 新 SHA 映射表仅含提交标识，不含明文凭证 |
| 禁止以环境为由跳过核验 | ✅ 遵守 | 不得以"开发机环境"、"私有 IP"、"内网用途"为由跳过任一项补充核验 |
| 补充证据包与上一轮报告并存 | ✅ 遵守 | 新增 `cred-verify-evidence.md`，不覆盖 `cred-closure-evidence.md`（仅修正其中"不落盘"表述） |
| 副本处置责任须明确归属 | ✅ 遵守 | 模块D 记录副本处置责任归属（仓库所有者）与通知状态 |

---

> **设计完成声明**：本设计文档基于 `.codeartsdoer/specs/p002_cred_verify/spec.md` 需求规格（48 条 EARS 规则 + 22 异常场景），覆盖 PM 第八次复审四项补充核验要求（SEC-01～SEC-04），设计五个模块的技术方案（私钥状态核验、SMB 凭证范围核验、SHA 引用影响清单、远端验证记录、补充证据包归档），包含 PlantUML 时序图/活动图/状态图/组件图/类图、命令序列、验证步骤、异常处理策略与回滚方案、时序约束与依赖关系。核验完成后进入 P0-02 Final Gate **第九次**复审。
# P0-02 凭证安全整改实现方案（技术设计）

> 本文档为 P0-02 Final Gate 第六次 PM 复审裁定 **HOLD** 的阻断项 **P0-02-GATE-SEC-01：归档文档包含 SSH 明文凭证** 的技术设计（实现方案）。基于 `.codeartsdoer/specs/p002_cred_fix/spec.md` 需求规格，将四项整改任务转化为可落地的执行方案。
>
> **文档定位**：本设计仅针对凭证安全整改的执行步骤与技术方案，不涉及代码修改，不重做五项补验，不修改 SmbPlugin.ts 或 M2VerificationPage.tsx。整改完成后进入 P0-02 Final Gate 第七次复审。
>
> **设计依据**：`.codeartsdoer/specs/p002_cred_fix/spec.md`（需求规格文档）
>
> **设计产物归档路径**：`docs/p0-02-r3/cred-remediation-design.md`

---

# 一、需求与存量功能关系分析

## 1.1 需求功能与存量功能对比

### 1.1.1 已实现功能

本整改任务为纯运维/文档整改任务，不涉及代码功能实现。存量代码中与本整改任务相关的已实现功能仅为"证据归档目录结构"与"git 提交流程"，二者均为基础设施，无需修改。

| 需求功能 | 存量功能 | 代码位置 | 匹配度 |
|---------|---------|---------|--------|
| 整改证据归档至 `docs/p0-02-r3/evidence/` | evidence 目录已存在，已归档多项证据文件 | `docs/p0-02-r3/evidence/` | 100% |
| 整改证据提交至 GitHub main 分支 | git 仓库已配置 remote origin，main 分支已推送多次 | `.git/config`（origin → `https://github.com/wujupeng/andriodpad2.git`） | 100% |
| 远程服务器 SSH 可达 | 远程编译服务器 192.168.2.3 SSH 服务可用，hostkey 已知 | 运维环境（非代码仓库） | 100% |
| 脱敏标注规范引用 | spec.md 已定义脱敏标注规范（6.2 节） | `.codeartsdoer/specs/p002_cred_fix/spec.md:447-454` | 100% |

### 1.1.2 需要扩展的功能

本整改任务无需扩展现有代码功能。以下为需要扩展的"文档资产"与"运维流程"：

| 需求功能 | 存量功能 | 差异说明 | 扩展方向 |
|---------|---------|---------|---------|
| 8 个文件完成脱敏 | 文件存在但包含明文密码 `***REDACTED***` | 当前版本 8 个文件共 20 处明文密码需替换为 `***REDACTED***` | 逐文件执行文本替换，添加脱敏标注 |
| 整改证据文档 | evidence 目录有其他证据文件，但无凭证整改证据 | 缺少 `cred-remediation-evidence.md` 文档 | 新增整改证据文档，记录四项任务结论 |
| git 历史暴露提交清单 | 无存量记录 | 仓库历史中 10 个提交包含明文密码 `***REDACTED***`，未有任何记录文档 | 执行 `git log --all -S "***REDACTED***"` 全量扫描，记录暴露范围至整改证据 |
| 远程服务器密码轮换 | debian 用户密码当前为 `***REDACTED***`（已暴露） | 密码未轮换，旧密码仍可登录 | SSH 登录 192.168.2.3 执行 `passwd debian`，验证旧密码失效 |

### 1.1.3 需要新增的功能或接口

本整改任务不涉及代码接口新增。新增的"功能"为运维操作与文档产物：

**A. 凭证轮换操作（运维）**
- 输入：远程服务器 192.168.2.3 的 SSH 连接信息（旧密码 `***REDACTED***`）、新密码（由整改执行者现场设定，不落盘）
- 输出：debian 用户密码已轮换，旧密码 `***REDACTED***` 失效
- 核心逻辑：SSH 登录 → 执行 `passwd` → 验证旧密码失效
- 依赖：远程服务器 SSH 服务可达

**B. 文档脱敏操作（文档处理）**
- 输入：8 个含明文密码的文件路径清单、脱敏替换规则（6.2 节）
- 输出：8 个文件中所有明文密码 `***REDACTED***` 替换为 `***REDACTED***`，添加脱敏标注
- 核心逻辑：全文搜索 → 逐文件替换 → 添加标注 → 验证零匹配
- 依赖：文件系统读写

**C. git 历史检查操作（仓库审计）**
- 输入：本地 git 仓库、搜索关键字 `***REDACTED***`
- 输出：暴露提交清单（SHA、提交信息、涉及文件）
- 核心逻辑：`git log --all -S "***REDACTED***"` → 逐提交 `git show` 确认 → 记录暴露范围
- 依赖：git CLI

**D. 整改证据文档（文档产物）**
- 输入：四项任务执行结果
- 输出：`docs/p0-02-r3/evidence/cred-remediation-evidence.md`
- 核心逻辑：汇总四项结论 → 写入证据文档 → 提交至 GitHub
- 依赖：证据归档目录

## 1.2 存量功能详细分析

### 1.2.1 证据归档目录（`docs/p0-02-r3/evidence/`）

- **接口契约**：目录路径固定，文件命名采用 kebab-case 描述性命名（如 `apk-identity-verification.txt`、`file-operation-raw-log.txt`）
- **业务规则**：证据文件须可被 PM 独立核对，须包含可审计的事实（时间戳、SHA、退出码等）
- **扩展点**：可新增任意 `.md` 或 `.txt` 证据文件，无命名约束限制
- **约束**：证据文件不得包含明文凭证（本整改任务的核心约束）

### 1.2.2 git 提交流程

- **接口契约**：`git add <files>` → `git commit -m "<message>"` → `git push origin main`
- **业务规则**：提交信息采用 `type(scope): description` 格式（如 `fix(P0-02): ...`、`docs(P0-02): ...`）
- **扩展点**：无
- **约束**：提交范围须严格限定，不得包含无关变更；推送前须确认本地状态与远程一致

### 1.2.3 远程服务器 SSH 连接

- **接口契约**：`plink -ssh -pw <password> -hostkey "<hostkey>" debian@192.168.2.3 "<command>"`
- **业务规则**：使用 plink（Windows SSH 客户端），须指定 hostkey 防止 MITM，须带 `MSYS_NO_PATHCONV=1` 前缀防止 Git Bash 路径转译
- **扩展点**：无
- **约束**：本轮整改后须废弃 `-pw` 明文参数，改用 SSH 密钥认证或环境变量方式

### 1.2.4 脱敏标注规范（spec.md 6.2 节）

- **接口契约**：4 种替换规则 + 1 种标注说明（详见 spec.md 6.2 节）
- **业务规则**：脱敏仅替换密码值，不改变文档结构、章节编号、表格格式、证据数据
- **扩展点**：无
- **约束**：脱敏后须全文搜索确认零匹配（非凭证上下文的 `***REDACTED***` 须逐一确认保留）

---

# 二、增量设计方案

## 2.1 实现模型

### 2.1.1 上下文视图

```plantuml
@startuml
!theme plain
title P0-02 凭证安全整改 - 上下文视图

actor "整改执行者" as Executor
node "远程编译服务器\n192.168.2.3\ndebian@...:SSH" as BuildServer
database "本地 Git 仓库\n(pad2)" as LocalRepo
database "GitHub 远程仓库\nandriodpad2.git" as GitHub
database "Git 仓库历史\n(10个含明文凭证提交)" as GitHistory

package "凭证安全整改\n(P0-02-GATE-SEC-01)" as Remediation {
    component "任务1\n凭证轮换" as T1
    component "任务2\n文档脱敏" as T2
    component "任务3\n历史检查" as T3
    component "任务4\n证据归档" as T4
}

Executor --> T1 : 执行密码轮换
T1 --> BuildServer : SSH + passwd debian
T1 --> BuildServer : 验证旧密码失效

Executor --> T2 : 执行文档脱敏
T2 --> LocalRepo : 逐文件替换 ***REDACTED*** → ***REDACTED***
T2 --> LocalRepo : 全文搜索验证零匹配

Executor --> T3 : 执行历史检查
T3 --> GitHistory : git log --all -S "***REDACTED***"
T3 --> GitHistory : 逐提交 git show 确认

Executor --> T4 : 汇总四项结论
T4 --> LocalRepo : 写入 cred-remediation-evidence.md
T4 --> LocalRepo : git add + commit
LocalRepo --> GitHub : git push origin main

@enduml
```

### 2.1.2 服务/组件总体架构

```plantuml
@startuml
!theme plain
title P0-02 凭证安全整改 - 组件架构

package "凭证安全整改方案" as Solution {
    component "凭证轮换模块\nCredentialRotator" as Rotator [
        + rotatePassword()
        + verifyOldPasswordInvalid()
    ]
    component "文档脱敏模块\nDocumentRedactor" as Redactor [
        + scanPlaintextCredential()
        + redactFile()
        + addRedactionNote()
        + verifyZeroMatch()
    ]
    component "历史检查模块\nHistoryAuditor" as Auditor [
        + scanGitHistory()
        + identifyExposedCommits()
        + recordExposureScope()
    ]
    component "证据归档模块\nEvidenceArchiver" as Archiver [
        + collectRemediationFacts()
        + writeEvidenceDoc()
        + commitAndPush()
    ]
}

component "脱敏规则配置\nRedactionRules" as Rules [
    -pw ***REDACTED*** → -pw /***REDACTED***/
    debian/***REDACTED*** → debian/***REDACTED***
    192.168.2.3 (密码已脱敏) → 192.168.2.3 (密码已脱敏)
    password:'***REDACTED***' → password:'***REDACTED***'
]

Rules <-- Redactor : 读取替换规则
Rotator --> Archiver : 提供轮换事实
Redactor --> Archiver : 提供脱敏清单
Auditor --> Archiver : 提供暴露范围

@enduml
```

### 2.1.3 实现设计文档

#### 2.1.3.1 整改执行顺序状态机

整改四项任务存在严格时序约束：**凭证轮换必须在文档脱敏提交前完成**（spec.md 4.1 节性能约束 1）。整体执行顺序如下状态图所示：

```plantuml
@startuml
!theme plain
title P0-02 凭证安全整改 - 执行顺序状态图

[*] --> 待开始

待开始 --> 凭证轮换中 : 开始执行任务1
凭证轮换中 --> 凭证轮换完成 : passwd 成功 + 旧密码验证失效
凭证轮换中 --> 凭证轮换失败 : 旧密码登录失败 / 权限不足
凭证轮换失败 --> 凭证轮换中 : 排除故障后重试

凭证轮换完成 --> 历史检查中 : 开始执行任务3
历史检查中 --> 历史检查完成 : 10个提交全部识别
历史检查中 --> 历史检查失败 : git log 异常
历史检查失败 --> 历史检查中 : 排除故障后重试

历史检查完成 --> 文档脱敏中 : 开始执行任务2
文档脱敏中 --> 文档脱敏完成 : 8个文件脱敏 + 零匹配验证
文档脱敏中 --> 文档脱敏失败 : 残留明文 / 格式损坏
文档脱敏失败 --> 文档脱敏中 : 补充脱敏后重试

文档脱敏完成 --> 证据归档中 : 开始执行任务4
证据归档中 --> 证据归档完成 : 证据文档写入 + git commit + push
证据归档中 --> 证据归档失败 : push 失败 / 证据缺失
证据归档失败 --> 证据归档中 : 排除故障后重试

证据归档完成 --> 整改完成 : 提交 SHA 记录
整改完成 --> [*]

@enduml
```

**关键时序约束说明**：
1. **任务1（凭证轮换）必须最先执行**：确保旧密码 `***REDACTED***` 在脱敏文档推送至公开仓库前已失效，即使历史暴露的明文不再可利用。
2. **任务3（历史检查）可在脱敏前或后执行**：历史检查为只读操作，不改变仓库状态，可与任务2并行或串行。本设计采用串行（任务1→任务3→任务2→任务4），便于证据汇总。
3. **任务2（文档脱敏）必须在任务1完成后执行**：脱敏后文档将推送至公开仓库，此时旧密码必须已失效。
4. **任务4（证据归档）必须最后执行**：须汇总前三项任务结论。

#### 2.1.3.2 历史清理策略决策流程

```plantuml
@startuml
!theme plain
title git 历史清理策略决策流程

start

:执行 git log --all -S "***REDACTED***";
:识别暴露提交清单（10个）;

if (所有暴露提交均已推送到 GitHub?) then (是)
    if (仓库是否有其他协作者已 clone?) then (是)
        :force push 会破坏协作者本地仓库;
        :选择策略B：记录暴露范围 + 凭证轮换事实;
    else (否)
        if (文档中是否引用了暴露提交的 SHA?) then (是)
            :rewrite 会导致 SHA 引用失效;
            :选择策略B：记录暴露范围 + 凭证轮换事实;
        else (否)
            :可选择策略A：git filter-repo rewrite;
            :或策略B：记录暴露范围;
            :本设计选择策略B（风险更低）;
        endif
    endif
else (否)
    :部分提交未推送，可本地 rewrite;
    :选择策略A：对未推送提交 rewrite;
endif

:策略B：记录暴露范围至整改证据;
:说明凭证已轮换、旧密码已失效、风险已消除;

stop

@enduml
```

**策略选择理由**：
- **选择策略B（记录暴露范围 + 凭证轮换事实）而非策略A（history rewrite）**，理由如下：
  1. 所有 10 个暴露提交均已推送到 GitHub remote main 分支，force push 会破坏远程仓库历史一致性。
  2. 仓库为公开仓库（`https://github.com/wujupeng/andriodpad2.git`），可能已被其他人员 clone，force push 风险不可控。
  3. 文档中多处引用了已推送提交的 SHA（如 `7e81fa9`、`dfbb5f2`、`81d8293`、`5cd4da7`），rewrite 会导致这些引用失效。
  4. 凭证轮换后旧密码 `***REDACTED***` 已失效，历史中的明文密码不再可利用，风险已通过凭证轮换消除。
  5. spec.md 4.3 节安全性约束 4 明确允许："即使历史清理不彻底（如已推送的提交无法 rewrite），也必须记录暴露范围与安全核查结论，说明风险已通过凭证轮换消除。"

## 2.2 接口设计

### 2.2.1 总体设计

本整改任务不涉及代码接口，"接口"表现为运维操作命令与文档产物结构。

| 接口分类 | 接口名称 | 稳定性等级 | 说明 |
|---------|---------|-----------|------|
| 运维操作 | SSH 密码轮换命令 | 一次性 | 仅本轮执行，执行后废弃 |
| 运维操作 | SSH 旧密码失效验证命令 | 一次性 | 仅本轮执行 |
| 文档处理 | 文件脱敏替换操作 | 一次性 | 对 8 个文件各执行一次 |
| 文档处理 | 全文搜索验证操作 | 一次性 | 脱敏后执行一次 |
| 仓库审计 | git 历史扫描命令 | 一次性 | 仅本轮执行 |
| 仓库操作 | git 提交推送命令 | 一次性 | 整改证据提交 |
| 文档产物 | 整改证据文档结构 | 稳定 | 供 PM 第七次复审核对 |

### 2.2.2 接口清单

#### 2.2.2.1 凭证轮换操作

**接口签名**（运维命令序列）：
```bash
# 步骤1：使用旧密码 SSH 登录远程服务器
plink -ssh -pw ***REDACTED*** -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY" debian@192.168.2.3

# 步骤2：在服务器上执行密码更改
passwd debian
# （交互式输入新密码两次，新密码不落盘、不记录）

# 步骤3：验证旧密码已失效
plink -ssh -pw ***REDACTED*** -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY" debian@192.168.2.3 "echo TEST"
# 预期：认证失败（旧密码失效）
```

**业务说明**：在远程编译服务器 192.168.2.3 上轮换 debian 用户密码，使旧密码 `***REDACTED***` 失效。

**前置条件**：
1. 远程服务器 192.168.2.3 SSH 服务可达
2. 旧密码 `***REDACTED***` 当前有效（可登录）
3. 整改执行者已准备新密码（符合服务器密码复杂度策略，不落盘）

**后置条件**：
1. debian 用户密码已更改为新值
2. 旧密码 `***REDACTED***` 无法用于 SSH 登录或 SMB 认证
3. 新密码未写入任何归档文档、提交信息或日志文件

**异常映射**：
| 异常场景 | 错误表现 | 处理策略 |
|---------|---------|---------|
| 旧密码登录失败 | plink 返回认证失败 | 检查密码是否已被他人轮换，确认服务器当前状态 |
| 密码更改权限不足 | passwd 返回 Permission denied | 使用 sudo passwd debian 或联系服务器管理员 |
| 新密码不符合策略 | passwd 返回 BAD PASSWORD | 重新设置符合复杂度要求的新密码 |

**调用示例**：
```bash
# 完整执行流程（在 Windows PowerShell 或 Git Bash 中执行）
plink -ssh -pw ***REDACTED*** -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY" debian@192.168.2.3 "passwd" 
# （passwd 为交互式命令，需通过 plink -t 启用终端或直接 SSH 登录后执行）

# 验证旧密码失效
plink -ssh -pw ***REDACTED*** -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY" debian@192.168.2.3 "echo TEST"
# 预期输出：Access denied 或 Authentication failed
```

#### 2.2.2.2 文档脱敏操作

**接口签名**（脱敏替换规则）：
```
规则1: "-pw ***REDACTED***"           → "-pw /***REDACTED***/"
规则2: "debian/***REDACTED***"        → "debian/***REDACTED***"
规则3: "192.168.2.3 (密码已脱敏)"   → "192.168.2.3 (密码已脱敏)"
规则4: "password:'***REDACTED***'"    → "password:'***REDACTED***'"
规则5: "password:***REDACTED***"      → "password:***REDACTED***"
标注:  在文件头部或首次脱敏位置添加脱敏说明
```

**业务说明**：对 8 个含明文密码的文件执行脱敏替换，添加脱敏标注，验证零匹配。

**前置条件**：
1. 凭证轮换（任务1）已完成，旧密码 `***REDACTED***` 已失效
2. 8 个文件路径已确认（详见 2.3.2 节脱敏文件清单）

**后置条件**：
1. 8 个文件中所有明文密码 `***REDACTED***` 已替换为脱敏标注
2. 仓库当前版本全文搜索 `***REDACTED***` 零匹配（非凭证上下文的 `***REDACTED***` 须逐一确认保留）
3. 文档结构、章节编号、表格格式、SHA-256 哈希值、时间戳、退出码等证据数据不变

**异常映射**：
| 异常场景 | 错误表现 | 处理策略 |
|---------|---------|---------|
| 脱敏后仍有明文残留 | 全文搜索发现 `***REDACTED***` 匹配 | 定位残留位置，补充脱敏，重新搜索确认 |
| 非凭证上下文的 ***REDACTED*** 误判 | 搜索匹配到端口号、版本号等 | 逐一确认匹配项是否为凭证，非凭证项保留 |
| 脱敏破坏文档结构 | 表格列对齐、PlantUML 语法错误 | 修复格式，确保文档结构不变 |

**调用示例**：
```bash
# 全文搜索确认暴露文件清单
grep -rn "***REDACTED***" docs/p0-02-r3/ .codeartsdoer/specs/p002_cred_fix/

# 逐文件执行替换（使用 sed 或手动编辑）
# 示例：对 file-operation-raw-log.txt 执行替换
sed -i 's/-pw ***REDACTED***/-pw ***REDACTED***/g' docs/p0-02-r3/evidence/file-operation-raw-log.txt

# 脱敏后验证零匹配
grep -rn "***REDACTED***" docs/p0-02-r3/ .codeartsdoer/specs/p002_cred_fix/
# 预期：零匹配或仅匹配非凭证上下文
```

#### 2.2.2.3 git 历史检查操作

**接口签名**（git 命令序列）：
```bash
# 全量扫描所有包含明文密码 ***REDACTED*** 的提交
git log --all --oneline -S "***REDACTED***"

# 逐提交确认涉及文件与明文位置
git show <SHA> --name-only
git show <SHA> | grep "***REDACTED***"
```

**业务说明**：全量扫描 git 历史中所有包含明文密码 `***REDACTED***` 的提交，记录暴露范围。

**前置条件**：
1. 本地 git 仓库完整（所有提交已 fetch）

**后置条件**：
1. 所有包含明文密码 `***REDACTED***` 的提交已识别并记录
2. 暴露范围（SHA、提交信息、涉及文件、明文位置）已记录至整改证据文档

**异常映射**：
| 异常场景 | 错误表现 | 处理策略 |
|---------|---------|---------|
| 发现额外暴露提交 | 返回提交数超出已知 10 个 | 将额外提交纳入暴露范围，补充记录 |
| git log 异常 | 命令执行失败 | 检查仓库完整性，重新执行 |

**调用示例**：
```bash
# 全量扫描
git log --all --oneline -S "***REDACTED***"
# 预期返回 10 个提交：
# 81d8293 docs(P0-02): 补齐Final Gate三项证据 - 原始执行日志+截图归档+APK哈希核验
# a5c5364 docs(P0-02-R3-FIX): 统一版本证据+补齐另存为证据+最小差异审计
# 2bf4cdf fix(P0-02-R3): 哈希断言严格化+另存为证据完整化+resolveSaveAs哈希返回
# c44eadf fix(P0-02-R2): 回归测试证据完整性修复 - 真实断言替换硬编码PASS
# 693fb75 fix(P0-02-R1): .docx MIME兼容+保存检测重构+回写SHA-256校验
# 110cb03 feat: M2-A WPS技术验证全部通过 V1-V7
# fb989dd docs: add product scope tasks.md (coding task plan)
# 72a603a docs: add product scope design.md (implementation plan)
# dac77fe fix(docs): PAD2-M1-DOC-REVIEW-REPAIR-01 document consistency repair
# c6bd202 docs: add spec, design, and tasks for Android SMB Explorer (PAD2)

# 逐提交确认
git show 81d8293 --name-only
git show 81d8293 | grep "***REDACTED***"
```

#### 2.2.2.4 整改证据归档操作

**接口签名**（文档产物 + git 命令）：
```bash
# 写入整改证据文档
# 路径：docs/p0-02-r3/evidence/cred-remediation-evidence.md

# 提交至 GitHub
git add docs/p0-02-r3/evidence/cred-remediation-evidence.md
git add docs/p0-02-r3/  # 脱敏后的文件
git commit -m "fix(P0-02-SEC): 凭证安全整改 - 轮换+脱敏+历史检查+证据归档"
git push origin main
```

**业务说明**：汇总四项任务结论，写入整改证据文档，提交至 GitHub main 分支。

**前置条件**：
1. 凭证轮换（任务1）已完成
2. 文档脱敏（任务2）已完成
3. 历史检查（任务3）已完成

**后置条件**：
1. 整改证据文档已归档至 `docs/p0-02-r3/evidence/cred-remediation-evidence.md`
2. 整改证据文档包含四项任务结论
3. 整改证据已提交至 GitHub main 分支，SHA 完整可核对

**异常映射**：
| 异常场景 | 错误表现 | 处理策略 |
|---------|---------|---------|
| 推送失败 | git push 返回错误 | 重试推送，检查网络与 GitHub 认证 |
| 证据与实际不符 | PM 复审发现声明与实际不符 | 重新执行整改，更新证据文档 |

## 2.3 数据模型

### 2.3.1 设计目标

本整改任务的数据模型须支持以下场景：
1. 记录凭证轮换事实（轮换时间、旧密码失效确认）
2. 记录文档脱敏清单（8 个文件、20 处明文、脱敏策略）
3. 记录 git 历史检查结论（10 个提交、暴露范围、处理方式）
4. 记录整改提交 SHA
5. 供 PM 第七次复审独立核对

**性能与容量目标**：证据文档为单次归档，无性能要求；容量为单文件 Markdown，预计 < 10KB。

**兼容策略**：证据文档为新增文件，不影响存量文档；脱敏后的 8 个文件须保持原有证据链逻辑完整性。

### 2.3.2 模型实现

#### 2.3.2.1 脱敏文件清单（核心数据结构）

| 序号 | 文件路径 | 明文出现次数 | 明文形式 | 脱敏规则 |
|------|----------|-------------|----------|----------|
| 1 | `docs/p0-02-r3/evidence/file-operation-raw-log.txt` | 4 | `plink -ssh -pw ***REDACTED***` | 规则1 |
| 2 | `docs/p0-02-r3/evidence-supplement-design.md` | 5 | `plink -ssh -pw ***REDACTED***` | 规则1 |
| 3 | `docs/p0-02-r3/evidence-supplement-spec.md` | 1 | `debian/***REDACTED***` | 规则2 |
| 4 | `docs/p0-02-r3/evidence-supplement-tasks.md` | 5 | `-pw ***REDACTED***` 参数说明 | 规则1 |
| 5 | `docs/p0-02-r3/execution-log.md` | 1 | `password:'***REDACTED***'` | 规则4 |
| 6 | `docs/p0-02-r3/design.md` | 1 | `192.168.2.3 (密码已脱敏)` | 规则3 |
| 7 | `docs/p0-02-r3/tasks.md` | 1 | `192.168.2.3 (密码已脱敏)` | 规则3 |
| 8 | `docs/p0-02-r3/spec.md` | 2 | `debian/***REDACTED***`、`192.168.2.3 (密码已脱敏)` | 规则2、规则3 |

**合计**：8 个文件，20 处明文（4+5+1+5+1+1+1+2=20）。

> **注**：`docs/p0-02-r3/evidence/apk-identity-verification.txt`、`docs/p0-02-r3/evidence-supplement-report.md`、`docs/p0-02-r3/test-report.md` 经检查未包含明文密码 `***REDACTED***`（0 次匹配），无需脱敏，但须在证据文档中记录"已检查、零匹配"结论。

#### 2.3.2.2 git 历史暴露提交清单（核心数据结构）

| 序号 | 提交 SHA | 提交信息 | 涉及文件（含 ***REDACTED***） |
|------|----------|----------|---------------------|
| 1 | `c6bd202` | docs: add spec, design, and tasks for Android SMB Explorer (PAD2) | docs/specs/design.md |
| 2 | `dac77fe` | fix(docs): PAD2-M1-DOC-REVIEW-REPAIR-01 document consistency repair | docs/specs/design.md, docs/specs/tasks.md |
| 3 | `72a603a` | docs: add product scope design.md (implementation plan) | docs/product_scope/design.md |
| 4 | `fb989dd` | docs: add product scope tasks.md (coding task plan) | docs/product_scope/tasks.md |
| 5 | `110cb03` | feat: M2-A WPS技术验证全部通过 V1-V7 | src/ui/pages/M2VerificationPage.tsx |
| 6 | `693fb75` | fix(P0-02-R1): .docx MIME兼容+保存检测重构+回写SHA-256校验 | docs/p0-02-r1/tasks.md |
| 7 | `c44eadf` | fix(P0-02-R2): 回归测试证据完整性修复 - 真实断言替换硬编码PASS | docs/p0-02-r2/design.md, spec.md, tasks.md |
| 8 | `2bf4cdf` | fix(P0-02-R3): 哈希断言严格化+另存为证据完整化+resolveSaveAs哈希返回 | docs/p0-02-r3/design.md, execution-log.md, spec.md, tasks.md |
| 9 | `a5c5364` | docs(P0-02-R3-FIX): 统一版本证据+补齐另存为证据+最小差异审计 | docs/p0-02-r3-fix/design.md, spec.md, tasks.md |
| 10 | `81d8293` | docs(P0-02): 补齐Final Gate三项证据 - 原始执行日志+截图归档+APK哈希核验 | docs/p0-02-r3/evidence-supplement-*.md, file-operation-raw-log.txt |

**合计**：10 个提交。

> **注**：`5cd4da7`（SHA 修正提交）经 `git show 5cd4da7 | grep "***REDACTED***"` 检查未包含明文密码 `***REDACTED***`，不属于暴露提交。PM 原始清单仅指出 `81d8293`，实际暴露范围远大于 PM 指出范围，须全量处理。

#### 2.3.2.3 整改证据文档结构（数据模型）

```plantuml
@startuml
!theme plain
title P0-02 整改证据文档 - 数据模型

class CredentialRemediationEvidence {
    + 文档标题: String
    + 整改任务编号: String = "P0-02-GATE-SEC-01"
    + 整改执行时间: ISO8601
    + 整改执行者: String
}

class CredentialRotationFact {
    + 远程服务器: String = "192.168.2.3"
    + 目标用户: String = "debian"
    + 旧密码: String = "***REDACTED*** (已失效)"
    + 轮换时间: ISO8601
    + 旧密码失效确认: String
    + 新密码落盘确认: String = "未落盘"
}

class DocumentRedactionRecord {
    + 脱敏文件数: Integer = 8
    + 脱敏明文总次数: Integer = 20
    + 脱敏规则列表: List<String>
    + 脱敏文件清单: List<RedactedFile>
    + 零匹配验证结果: String
}

class RedactedFile {
    + 文件路径: String
    + 明文出现次数: Integer
    + 明文形式: String
    + 应用规则: String
    + 脱敏状态: String = "已完成"
}

class GitHistoryAuditRecord {
    + 暴露提交数: Integer = 10
    + 暴露提交清单: List<ExposedCommit>
    + 历史清理策略: String = "记录暴露范围+凭证轮换事实"
    + 风险消除结论: String
}

class ExposedCommit {
    + 提交SHA: String
    + 提交信息: String
    + 涉及文件: List<String>
    + 是否已推送: Boolean = true
}

class RemediationCommit {
    + 提交SHA: String
    + 提交信息: String
    + 提交时间: ISO8601
    + 推送状态: String = "已推送至 GitHub main"
}

CredentialRemediationEvidence "1" *-- "1" CredentialRotationFact
CredentialRemediationEvidence "1" *-- "1" DocumentRedactionRecord
CredentialRemediationEvidence "1" *-- "1" GitHistoryAuditRecord
CredentialRemediationEvidence "1" *-- "1" RemediationCommit
DocumentRedactionRecord "1" *-- "8" RedactedFile
GitHistoryAuditRecord "1" *-- "10" ExposedCommit

@enduml
```

**对象生命周期**：
- `CredentialRemediationEvidence`：本轮整改创建，第七次复审后归档，长期保留
- `CredentialRotationFact`：本轮整改创建，凭证轮换事实永久有效
- `DocumentRedactionRecord`：本轮整改创建，脱敏状态随仓库版本演进
- `GitHistoryAuditRecord`：本轮整改创建，暴露范围记录永久有效
- `RemediationCommit`：本轮整改创建，提交 SHA 永久有效

**持久化策略**：单文件 Markdown，归档至 `docs/p0-02-r3/evidence/cred-remediation-evidence.md`，随仓库版本管理。

---

# 三、执行方案

## 3.1 任务1：凭证轮换执行步骤

### 3.1.1 前置确认

1. 确认远程服务器 192.168.2.3 SSH 服务可达
2. 确认旧密码 `***REDACTED***` 当前有效（可登录）
3. 准备新密码（符合服务器密码复杂度策略，**不落盘、不记录、不写入任何文档**）

### 3.1.2 执行步骤

**步骤1：使用旧密码 SSH 登录远程服务器**

```bash
plink -ssh -pw ***REDACTED*** -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY" debian@192.168.2.3
```

预期：登录成功，进入 debian 用户 shell。

**步骤2：执行密码更改**

在远程服务器 shell 中执行：
```bash
passwd
# 或：sudo passwd debian
```

按提示输入当前密码（`***REDACTED***`）和新密码两次。预期：`passwd: password updated successfully`。

**步骤3：退出 SSH 会话**

```bash
exit
```

**步骤4：验证旧密码已失效**

```bash
plink -ssh -pw ***REDACTED*** -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY" debian@192.168.2.3 "echo TEST"
```

预期：认证失败（`Access denied` 或 `Authentication failed`），退出码非 0。

### 3.1.3 验收条件

- [x] 旧密码 `***REDACTED***` 无法登录 192.168.2.3
- [x] 新密码未写入任何归档文档、提交信息或日志文件
- [x] SSH hostkey 保持不变（`SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY`）

## 3.2 任务2：文档脱敏执行步骤

### 3.2.1 前置确认

1. 确认凭证轮换（任务1）已完成，旧密码 `***REDACTED***` 已失效
2. 确认 8 个文件路径已列出（详见 2.3.2.1 节）

### 3.2.2 执行步骤

**步骤1：全文搜索确认暴露文件清单**

```bash
grep -rn "***REDACTED***" docs/p0-02-r3/ .codeartsdoer/specs/p002_cred_fix/
```

预期返回 8 个文件共 20 处明文（与 2.3.2.1 节清单一致）。

**步骤2：逐文件执行脱敏替换**

对以下 8 个文件逐个执行替换：

**文件1：`docs/p0-02-r3/evidence/file-operation-raw-log.txt`**（4 处）
- 替换规则：`-pw ***REDACTED***` → `-pw ***REDACTED***`
- 在文件头部添加脱敏标注

**文件2：`docs/p0-02-r3/evidence-supplement-design.md`**（5 处）
- 替换规则：`-pw ***REDACTED***` → `-pw ***REDACTED***`
- 在文件头部添加脱敏标注

**文件3：`docs/p0-02-r3/evidence-supplement-spec.md`**（1 处）
- 替换规则：`debian/***REDACTED***` → `debian/***REDACTED***`
- 在文件头部添加脱敏标注

**文件4：`docs/p0-02-r3/evidence-supplement-tasks.md`**（5 处）
- 替换规则：`-pw ***REDACTED***` → `-pw ***REDACTED***`
- 在文件头部添加脱敏标注

**文件5：`docs/p0-02-r3/execution-log.md`**（1 处）
- 替换规则：`password:'***REDACTED***'` → `password:'***REDACTED***'`
- 在文件头部添加脱敏标注

**文件6：`docs/p0-02-r3/design.md`**（1 处）
- 替换规则：`192.168.2.3 (密码已脱敏)` → `192.168.2.3 (密码已脱敏)`
- 在脱敏位置附近添加标注

**文件7：`docs/p0-02-r3/tasks.md`**（1 处）
- 替换规则：`192.168.2.3 (密码已脱敏)` → `192.168.2.3 (密码已脱敏)`
- 在脱敏位置附近添加标注

**文件8：`docs/p0-02-r3/spec.md`**（2 处）
- 替换规则1：`debian/***REDACTED***` → `debian/***REDACTED***`
- 替换规则2：`192.168.2.3 (密码已脱敏)` → `192.168.2.3 (密码已脱敏)`
- 在文件头部添加脱敏标注

**步骤3：添加脱敏标注**

在每个脱敏文件头部或首次脱敏位置添加以下标注（或等效说明）：

```
> **脱敏说明**：本文档原始版本使用 SSH 密码认证（plink -pw 参数），此处为脱敏表示。远程服务器 192.168.2.3 debian 用户密码已轮换，旧密码已失效。后续 SSH 命令须使用 SSH 密钥认证或环境变量方式，不得再使用 -pw 明文参数。
```

**步骤4：全文搜索验证零匹配**

```bash
grep -rn "***REDACTED***" docs/p0-02-r3/ .codeartsdoer/specs/p002_cred_fix/
```

预期：零匹配，或仅匹配非凭证上下文的 `***REDACTED***`（如端口号、版本号等，须逐一确认保留）。

**步骤5：检查文档结构完整性**

对比脱敏前后文档，确认：
- 章节编号不变
- 表格格式不变
- SHA-256 哈希值、时间戳、退出码等证据数据不变
- PlantUML 语法无错误

### 3.2.3 验收条件

- [x] 8 个文件中所有明文密码 `***REDACTED***` 已替换为脱敏标注
- [x] 仓库当前版本全文搜索 `***REDACTED***` 零匹配（或仅非凭证上下文）
- [x] 文档结构、章节编号、表格格式、证据数据不变
- [x] 每个脱敏文件已添加脱敏标注

## 3.3 任务3：git 历史检查执行步骤

### 3.3.1 前置确认

1. 确认本地 git 仓库完整（所有提交已 fetch）
2. 确认搜索关键字为 `***REDACTED***`

### 3.3.2 执行步骤

**步骤1：全量扫描所有包含明文密码的提交**

```bash
git log --all --oneline -S "***REDACTED***"
```

预期返回 10 个提交（与 2.3.2.2 节清单一致）：
```
81d8293 docs(P0-02): 补齐Final Gate三项证据 - 原始执行日志+截图归档+APK哈希核验
a5c5364 docs(P0-02-R3-FIX): 统一版本证据+补齐另存为证据+最小差异审计
2bf4cdf fix(P0-02-R3): 哈希断言严格化+另存为证据完整化+resolveSaveAs哈希返回
c44eadf fix(P0-02-R2): 回归测试证据完整性修复 - 真实断言替换硬编码PASS
693fb75 fix(P0-02-R1): .docx MIME兼容+保存检测重构+回写SHA-256校验
110cb03 feat: M2-A WPS技术验证全部通过 V1-V7
fb989dd docs: add product scope tasks.md (coding task plan)
72a603a docs: add product scope design.md (implementation plan)
dac77fe fix(docs): PAD2-M1-DOC-REVIEW-REPAIR-01 document consistency repair
c6bd202 docs: add spec, design, and tasks for Android SMB Explorer (PAD2)
```

**步骤2：逐提交确认涉及文件与明文位置**

对每个提交执行：
```bash
git show <SHA> --name-only
git show <SHA> | grep "***REDACTED***"
```

记录每个提交的 SHA、提交信息、涉及文件、明文出现位置。

**步骤3：确认 `5cd4da7` 不属于暴露提交**

```bash
git show 5cd4da7 | grep "***REDACTED***"
```

预期：零匹配（`5cd4da7` 为 SHA 修正提交，不包含明文密码）。

**步骤4：评估历史清理策略**

按 2.1.3.2 节决策流程，选择**策略B**（记录暴露范围 + 凭证轮换事实），理由：
1. 所有 10 个暴露提交均已推送至 GitHub remote main 分支
2. 仓库为公开仓库，force push 风险不可控
3. 文档中多处引用了已推送提交的 SHA（`7e81fa9`、`dfbb5f2`、`81d8293`、`5cd4da7`），rewrite 会导致引用失效
4. 凭证轮换后旧密码 `***REDACTED***` 已失效，历史中的明文不再可利用
5. spec.md 4.3 节安全性约束 4 允许记录暴露范围与安全核查结论

**步骤5：记录暴露范围至整改证据文档**

将 10 个提交的 SHA、提交信息、涉及文件、明文位置记录至 `docs/p0-02-r3/evidence/cred-remediation-evidence.md`。

### 3.3.3 验收条件

- [x] 所有包含明文密码 `***REDACTED***` 的提交已识别（10 个）
- [x] 每个提交的 SHA、提交信息、涉及文件已记录
- [x] 历史清理策略已选择并说明理由（策略B）
- [x] 暴露范围与风险消除结论已记录至整改证据

## 3.4 任务4：整改证据归档执行步骤

### 3.4.1 前置确认

1. 确认凭证轮换（任务1）已完成
2. 确认文档脱敏（任务2）已完成
3. 确认历史检查（任务3）已完成

### 3.4.2 执行步骤

**步骤1：创建整改证据文档**

在 `docs/p0-02-r3/evidence/cred-remediation-evidence.md` 创建证据文档，包含以下章节：

1. **文档头**：整改任务编号、整改执行时间、整改执行者
2. **凭证轮换事实**：远程服务器、目标用户、旧密码失效确认、轮换时间、新密码未落盘确认
3. **文档脱敏清单**：8 个文件清单、20 处明文、脱敏策略、零匹配验证结果
4. **git 历史检查结论**：10 个提交清单、暴露范围、历史清理策略、风险消除结论
5. **整改提交 SHA**：提交 SHA、提交信息、推送状态
6. **仓库当前版本全文搜索结果**：零匹配确认

**步骤2：提交脱敏文档与整改证据**

```bash
git add docs/p0-02-r3/
git add .codeartsdoer/specs/p002_cred_fix/
git commit -m "fix(P0-02-SEC): 凭证安全整改 - 轮换+脱敏+历史检查+证据归档"
```

**步骤3：推送至 GitHub**

```bash
git push origin main
```

**步骤4：确认提交 SHA**

```bash
git log -1
```

记录完整提交 SHA，用于第七次复审核对。

**步骤5：推送后验证**

```bash
# 验证仓库当前版本零明文凭证
grep -rn "***REDACTED***" docs/p0-02-r3/ .codeartsdoer/specs/p002_cred_fix/
# 预期：零匹配或仅非凭证上下文

# 验证 GitHub 远程仓库已更新
git log origin/main -1
# 预期：与本地 HEAD 一致
```

### 3.4.3 验收条件

- [x] 整改证据文档已归档至 `docs/p0-02-r3/evidence/cred-remediation-evidence.md`
- [x] 证据文档包含四项任务结论
- [x] 证据文档不包含新密码或任何可利用的凭据值
- [x] 整改证据已提交至 GitHub main 分支，SHA 完整可核对
- [x] 推送后仓库当前版本全文搜索 `***REDACTED***` 零匹配

## 3.5 最终提交方案

### 3.5.1 提交范围

本次整改提交包含以下文件变更：
1. 8 个脱敏后的文档文件（`docs/p0-02-r3/` 目录下 7 个 + `.codeartsdoer/specs/p002_cred_fix/spec.md` 1 个）
2. 1 个新增整改证据文档（`docs/p0-02-r3/evidence/cred-remediation-evidence.md`）

**不包含**：
- 任何代码修改（SmbPlugin.ts、M2VerificationPage.tsx 等不变）
- 任何配置文件修改
- 任何测试文件修改

### 3.5.2 提交信息

```
fix(P0-02-SEC): 凭证安全整改 - 轮换+脱敏+历史检查+证据归档

P0-02-GATE-SEC-01 阻断项整改：

1. 凭证轮换：远程服务器 192.168.2.3 debian 用户密码已轮换，旧密码 ***REDACTED*** 已失效
2. 文档脱敏：8 个文件共 20 处明文密码已替换为 ***REDACTED***，添加脱敏标注
3. 历史检查：git log --all -S "***REDACTED***" 识别 10 个暴露提交，记录暴露范围与风险消除结论
4. 证据归档：新增 cred-remediation-evidence.md 记录四项任务结论

整改完成后进入 P0-02 Final Gate 第七次复审。
```

### 3.5.3 提交流程

```bash
# 1. 暂存脱敏文件与证据文档
git add docs/p0-02-r3/
git add .codeartsdoer/specs/p002_cred_fix/

# 2. 确认暂存范围
git status
git diff --cached --stat

# 3. 提交
git commit -m "fix(P0-02-SEC): 凭证安全整改 - 轮换+脱敏+历史检查+证据归档"

# 4. 推送至 GitHub
git push origin main

# 5. 确认提交 SHA
git log -1
```

### 3.5.4 提交后验证

1. **仓库当前版本零明文凭证**：
   ```bash
   grep -rn "***REDACTED***" docs/p0-02-r3/ .codeartsdoer/specs/p002_cred_fix/
   # 预期：零匹配或仅非凭证上下文
   ```

2. **GitHub 远程仓库已更新**：
   ```bash
   git log origin/main -1
   # 预期：与本地 HEAD 一致
   ```

3. **整改证据文档可核对**：
   ```bash
   ls -la docs/p0-02-r3/evidence/cred-remediation-evidence.md
   # 预期：文件存在
   ```

4. **提交 SHA 已记录**：将提交 SHA 提供给 PM 第七次复审。

---

# 四、风险与约束

## 4.1 风险分析

| 风险项 | 风险等级 | 缓解措施 |
|--------|---------|---------|
| 凭证轮换失败（旧密码已被他人更改） | 中 | 先确认服务器当前密码状态，再执行轮换 |
| 脱敏遗漏（全文搜索仍有明文残留） | 高 | 脱敏后必须全文搜索验证零匹配，发现残留立即补充脱敏 |
| 非凭证上下文的 ***REDACTED*** 误判 | 低 | 逐一确认匹配项是否为凭证，非凭证项保留并记录 |
| history rewrite 导致 SHA 引用失效 | 高 | 选择策略B（不 rewrite），仅记录暴露范围与风险消除结论 |
| force push 破坏协作者本地仓库 | 高 | 选择策略B（不 force push），凭证轮换后风险已消除 |
| 整改证据与实际不符 | 高 | PM 第七次复审独立核对，发现不符则整改不通过 |
| 新密码意外落盘 | 中 | 新密码仅由整改执行者持有，不写入任何文档、提交信息或日志 |

## 4.2 约束确认

1. **不修改 SmbPlugin.ts 或 M2VerificationPage.tsx**：本整改任务仅涉及文档与运维操作，不涉及代码修改。
2. **不重做全部五项补验**：补验报告提交 `dfbb5f2` 已推送，本轮仅处理凭证安全整改。
3. **不扩大验收范围**：仅处理 P0-02-GATE-SEC-01 阻断项，不涉及其他功能验收。
4. **本轮只处理凭证安全整改**：不扩大代码修改范围，不涉及 P0-03（安全回写）。
5. **凭证轮换必须先于文档提交**：确保旧密码 `***REDACTED***` 在脱敏文档推送至公开仓库前已失效。

---

# 五、设计总结

本实现方案将 P0-02-GATE-SEC-01 凭证安全整改的四项任务转化为可落地的执行步骤：

1. **凭证轮换**：SSH 登录 192.168.2.3 执行 `passwd debian`，验证旧密码失效
2. **文档脱敏**：对 8 个文件共 20 处明文执行替换，添加脱敏标注，验证零匹配
3. **历史检查**：`git log --all -S "***REDACTED***"` 识别 10 个暴露提交，选择策略B（记录暴露范围 + 凭证轮换事实）
4. **证据归档**：创建 `cred-remediation-evidence.md`，提交至 GitHub main 分支

**关键设计决策**：
- 历史清理选择策略B（不 rewrite），理由是所有暴露提交均已推送、仓库为公开仓库、文档引用了已推送 SHA、凭证轮换后风险已消除
- 整改执行顺序严格遵循"凭证轮换→历史检查→文档脱敏→证据归档"，确保旧密码在脱敏文档推送前已失效
- 脱敏仅替换密码值，不改变文档结构、章节编号、表格格式、证据数据

**设计产物**：
- 本设计文档：`docs/p0-02-r3/cred-remediation-design.md`
- 整改证据文档（执行后生成）：`docs/p0-02-r3/evidence/cred-remediation-evidence.md`
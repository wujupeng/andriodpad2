# P0-02 凭证安全整改编码任务规划

> 本文档为 P0-02 Final Gate 第六次 PM 复审裁定 **HOLD** 的阻断项 **P0-02-GATE-SEC-01：归档文档包含 SSH 明文凭证** 的编码任务规划。基于 `.codeartsdoer/specs/p002_cred_fix/spec.md` 需求规格与 `docs/p0-02-r3/cred-remediation-design.md` 实现方案，将四项整改任务分解为可执行的步骤级任务。
>
> **文档定位**：本任务规划仅针对凭证安全整改的执行步骤，不涉及代码修改，不重做五项补验，不修改 SmbPlugin.ts 或 M2VerificationPage.tsx。整改完成后进入 P0-02 Final Gate 第七次复审。
>
> **任务规划依据**：
> - 需求规格：`.codeartsdoer/specs/p002_cred_fix/spec.md`
> - 实现方案：`docs/p0-02-r3/cred-remediation-design.md`
>
> **任务规划产物归档路径**：`docs/p0-02-r3/cred-remediation-tasks.md`
>
> **执行顺序**：凭证轮换（任务1）→ git 历史检查（任务2）→ 文档脱敏（任务3）→ 证据归档与提交推送（任务4）→ 最终验证（任务5）
>
> **关键时序约束**：凭证轮换必须在文档脱敏提交前完成，确保旧密码 `***REDACTED***` 在脱敏文档推送至公开仓库前已失效。

---

## 1. 凭证轮换与撤销

> 对应 spec.md 5.1 节、design.md 3.1 节。
> 业务目标：在远程编译服务器 192.168.2.3 上轮换 debian 用户密码，使已暴露的旧密码 `***REDACTED***` 失效。
> 前置依赖：无（本任务为整改流程起点）。
> 后置条件：旧密码 `***REDACTED***` 无法用于 SSH 登录或 SMB 认证；新密码不落盘。

### 1.1 确认远程服务器 SSH 可达与旧密码有效

- [ ] 在 Windows PowerShell 或 Git Bash 中执行 SSH 连接测试，确认远程服务器 192.168.2.3 SSH 服务可达：
  ```bash
  MSYS_NO_PATHCONV=1 plink -ssh -pw ***REDACTED*** -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY" debian@192.168.2.3 "echo CONNECTIVITY_OK"
  ```
  预期输出：`CONNECTIVITY_OK`，退出码 0。
- [ ] 若返回 `Access denied` 或 `Authentication failed`，执行异常处理：检查密码是否已被他人轮换，确认服务器当前密码状态后再继续。记录异常情况至执行日志。

### 1.2 执行 debian 用户密码更改

- [ ] 使用旧密码 SSH 登录远程服务器并进入交互式 shell：
  ```bash
  MSYS_NO_PATHCONV=1 plink -ssh -pw ***REDACTED*** -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY" debian@192.168.2.3
  ```
  预期：登录成功，进入 debian 用户 shell 提示符。
- [ ] 在远程服务器 shell 中执行密码更改命令：
  ```bash
  passwd
  ```
  按提示输入当前密码（`***REDACTED***`）和新密码两次。预期输出：`passwd: password updated successfully`。
- [ ] 若 `passwd` 返回 `Permission denied`，执行异常处理：使用 `sudo passwd debian` 提升权限，或联系服务器管理员执行密码更改。
- [ ] 若 `passwd` 返回 `BAD PASSWORD`，执行异常处理：重新设置符合服务器密码复杂度策略的新密码。
- [ ] 确认新密码**不落盘、不记录、不写入任何归档文档、提交信息或日志文件**。新密码仅由整改执行者持有。
- [ ] 退出 SSH 会话：
  ```bash
  exit
  ```

### 1.3 验证旧密码已失效

- [ ] 使用旧密码 `***REDACTED***` 尝试 SSH 登录远程服务器，确认认证被拒绝：
  ```bash
  MSYS_NO_PATHCONV=1 plink -ssh -pw ***REDACTED*** -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY" debian@192.168.2.3 "echo TEST"
  ```
  预期输出：`Access denied` 或 `Authentication failed`，退出码非 0。
- [ ] 若旧密码仍可登录，执行异常处理：重新执行 1.2 步骤确认密码更改成功，或检查是否修改了正确的用户/服务器。

### 1.4 凭证轮换验收

- [ ] 确认旧密码 `***REDACTED***` 无法登录 192.168.2.3（1.3 步骤已验证）
- [ ] 确认新密码未写入任何归档文档、提交信息或日志文件
- [ ] 确认 SSH hostkey 保持不变（`SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY`）
- [ ] 记录凭证轮换事实：轮换时间（ISO8601 格式）、旧密码失效确认、新密码未落盘确认，供任务4 证据归档使用

---

## 2. git 历史检查与暴露范围记录

> 对应 spec.md 5.3 节、design.md 3.3 节。
> 业务目标：全量扫描 git 历史中所有包含明文密码 `***REDACTED***` 的提交，记录暴露范围，评估历史清理策略。
> 前置依赖：无（历史检查为只读操作，可与任务1 并行，但本规划按串行执行便于证据汇总）。
> 后置条件：所有包含明文密码 `***REDACTED***` 的提交已识别并记录；历史清理策略已选择并说明理由。

### 2.1 全量扫描暴露提交

- [ ] 在本地仓库根目录执行全量扫描，获取所有包含明文密码 `***REDACTED***` 的提交列表：
  ```bash
  git log --all --oneline -S "***REDACTED***"
  ```
  预期返回 10 个提交（按时间倒序）：
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
- [ ] 若返回提交数超出 10 个，执行异常处理：将额外提交纳入暴露范围，补充记录。
- [ ] 若 `git log` 命令执行失败，执行异常处理：检查仓库完整性，重新执行。

### 2.2 逐提交确认涉及文件与明文位置

- [ ] 对以下 10 个暴露提交逐个执行 `git show <SHA> --name-only` 与 `git show <SHA> | grep "***REDACTED***"`，记录每个提交的 SHA、提交信息、涉及文件、明文出现位置：
  ```bash
  git show c6bd202 --name-only
  git show c6bd202 | grep "***REDACTED***"
  
  git show dac77fe --name-only
  git show dac77fe | grep "***REDACTED***"
  
  git show 72a603a --name-only
  git show 72a603a | grep "***REDACTED***"
  
  git show fb989dd --name-only
  git show fb989dd | grep "***REDACTED***"
  
  git show 110cb03 --name-only
  git show 110cb03 | grep "***REDACTED***"
  
  git show 693fb75 --name-only
  git show 693fb75 | grep "***REDACTED***"
  
  git show c44eadf --name-only
  git show c44eadf | grep "***REDACTED***"
  
  git show 2bf4cdf --name-only
  git show 2bf4cdf | grep "***REDACTED***"
  
  git show a5c5364 --name-only
  git show a5c5364 | grep "***REDACTED***"
  
  git show 81d8293 --name-only
  git show 81d8293 | grep "***REDACTED***"
  ```
  预期：每个提交均返回涉及文件列表与含 `***REDACTED***` 的行，与 design.md 2.3.2.2 节清单一致。

### 2.3 确认 5cd4da7 不属于暴露提交

- [ ] 执行 `git show` 检查 SHA 修正提交 `5cd4da7` 是否包含明文密码：
  ```bash
  git show 5cd4da7 | grep "***REDACTED***"
  ```
  预期：零匹配（`5cd4da7` 为 SHA 修正提交，不包含明文密码 `***REDACTED***`）。
- [ ] 在暴露范围记录中明确说明 `5cd4da7` 经检查不属于暴露提交，避免 PM 复审时误判。

### 2.4 评估并选择历史清理策略

- [ ] 按 design.md 2.1.3.2 节决策流程评估历史清理策略，确认以下事实：
  - 所有 10 个暴露提交均已推送到 GitHub remote main 分支
  - 仓库为公开仓库（`https://github.com/wujupeng/andriodpad2.git`），可能已被其他人员 clone
  - 文档中多处引用了已推送提交的 SHA（`7e81fa9`、`dfbb5f2`、`81d8293`、`5cd4da7`），rewrite 会导致引用失效
  - 凭证轮换后旧密码 `***REDACTED***` 已失效，历史中的明文不再可利用
- [ ] 选择**策略B**（记录暴露范围 + 凭证轮换事实，不 rewrite history），记录选择理由：
  1. force push 会破坏远程仓库历史一致性，风险不可控
  2. rewrite 会导致文档中 SHA 引用失效
  3. 凭证轮换后风险已消除，符合 spec.md 4.3 节安全性约束 4
- [ ] 确认不执行 `git filter-repo` 或 `git filter-branch`，不执行 `git push --force`。

### 2.5 git 历史检查验收

- [ ] 确认所有包含明文密码 `***REDACTED***` 的提交已识别（10 个）
- [ ] 确认每个提交的 SHA、提交信息、涉及文件已记录
- [ ] 确认 `5cd4da7` 已检查并确认不属于暴露提交
- [ ] 确认历史清理策略已选择并说明理由（策略B）
- [ ] 确认暴露范围与风险消除结论已整理，供任务4 证据归档使用

---

## 3. 文档脱敏

> 对应 spec.md 5.2 节、design.md 3.2 节。
> 业务目标：对当前版本中 8 个包含明文密码 `***REDACTED***` 的文件执行脱敏替换，添加脱敏标注，验证零匹配。
> 前置依赖：任务1（凭证轮换）已完成，旧密码 `***REDACTED***` 已失效。
> 后置条件：8 个文件中所有明文密码已替换为脱敏标注；仓库当前版本全文搜索 `***REDACTED***` 零匹配（或仅非凭证上下文）；文档结构不变。

### 3.1 全文搜索确认暴露文件清单

- [ ] 在本地仓库根目录执行全文搜索，确认当前版本包含明文密码 `***REDACTED***` 的文件清单：
  ```bash
  grep -rn "***REDACTED***" docs/p0-02-r3/ .codeartsdoer/specs/p002_cred_fix/
  ```
  预期返回 8 个文件共 20 处明文，与 design.md 2.3.2.1 节清单一致：
  - `docs/p0-02-r3/evidence/file-operation-raw-log.txt`（4 处）
  - `docs/p0-02-r3/evidence-supplement-design.md`（5 处）
  - `docs/p0-02-r3/evidence-supplement-spec.md`（1 处）
  - `docs/p0-02-r3/evidence-supplement-tasks.md`（5 处）
  - `docs/p0-02-r3/execution-log.md`（1 处）
  - `docs/p0-02-r3/design.md`（1 处）
  - `docs/p0-02-r3/tasks.md`（1 处）
  - `docs/p0-02-r3/spec.md`（2 处）
- [ ] 若返回文件数或明文数与预期不符，执行异常处理：定位差异原因，补充或修正清单后再继续。

### 3.2 脱敏文件1：file-operation-raw-log.txt

- [ ] 对 `docs/p0-02-r3/evidence/file-operation-raw-log.txt` 执行脱敏替换（4 处明文，形式 `plink -ssh -pw ***REDACTED***`）：
  ```bash
  sed -i 's/-pw ***REDACTED***/-pw ***REDACTED***/g' docs/p0-02-r3/evidence/file-operation-raw-log.txt
  ```
  预期：文件中 4 处 `-pw ***REDACTED***` 替换为 `-pw ***REDACTED***`。
- [ ] 在文件头部添加脱敏标注：
  ```
  > **脱敏说明**：本文档原始版本使用 SSH 密码认证（plink -pw 参数），此处为脱敏表示。远程服务器 192.168.2.3 debian 用户密码已轮换，旧密码已失效。后续 SSH 命令须使用 SSH 密钥认证或环境变量方式，不得再使用 -pw 明文参数。
  ```
- [ ] 验证该文件不再包含明文密码 `***REDACTED***`：
  ```bash
  grep -n "***REDACTED***" docs/p0-02-r3/evidence/file-operation-raw-log.txt
  ```
  预期：零匹配，或仅匹配非凭证上下文的 `***REDACTED***`（逐一确认保留）。

### 3.3 脱敏文件2：evidence-supplement-design.md

- [ ] 对 `docs/p0-02-r3/evidence-supplement-design.md` 执行脱敏替换（5 处明文，形式 `plink -ssh -pw ***REDACTED***`）：
  ```bash
  sed -i 's/-pw ***REDACTED***/-pw ***REDACTED***/g' docs/p0-02-r3/evidence-supplement-design.md
  ```
  预期：文件中 5 处 `-pw ***REDACTED***` 替换为 `-pw ***REDACTED***`。
- [ ] 在文件头部添加脱敏标注（同 3.2 步骤的标注文本）。
- [ ] 验证该文件不再包含明文密码 `***REDACTED***`：
  ```bash
  grep -n "***REDACTED***" docs/p0-02-r3/evidence-supplement-design.md
  ```
  预期：零匹配，或仅匹配非凭证上下文。

### 3.4 脱敏文件3：evidence-supplement-spec.md

- [ ] 对 `docs/p0-02-r3/evidence-supplement-spec.md` 执行脱敏替换（1 处明文，形式 `debian/***REDACTED***`）：
  ```bash
  sed -i 's|debian/***REDACTED***|debian/***REDACTED***|g' docs/p0-02-r3/evidence-supplement-spec.md
  ```
  预期：文件中 1 处 `debian/***REDACTED***` 替换为 `debian/***REDACTED***`。
- [ ] 在文件头部添加脱敏标注（同 3.2 步骤的标注文本）。
- [ ] 验证该文件不再包含明文密码 `***REDACTED***`：
  ```bash
  grep -n "***REDACTED***" docs/p0-02-r3/evidence-supplement-spec.md
  ```
  预期：零匹配，或仅匹配非凭证上下文。

### 3.5 脱敏文件4：evidence-supplement-tasks.md

- [ ] 对 `docs/p0-02-r3/evidence-supplement-tasks.md` 执行脱敏替换（5 处明文，形式 `-pw ***REDACTED***` 参数说明）：
  ```bash
  sed -i 's/-pw ***REDACTED***/-pw ***REDACTED***/g' docs/p0-02-r3/evidence-supplement-tasks.md
  ```
  预期：文件中 5 处 `-pw ***REDACTED***` 替换为 `-pw ***REDACTED***`。
- [ ] 在文件头部添加脱敏标注（同 3.2 步骤的标注文本）。
- [ ] 验证该文件不再包含明文密码 `***REDACTED***`：
  ```bash
  grep -n "***REDACTED***" docs/p0-02-r3/evidence-supplement-tasks.md
  ```
  预期：零匹配，或仅匹配非凭证上下文。

### 3.6 脱敏文件5：execution-log.md

- [ ] 对 `docs/p0-02-r3/execution-log.md` 执行脱敏替换（1 处明文，形式 `password:'***REDACTED***'`）：
  ```bash
  sed -i "s|password:'***REDACTED***'|password:'***REDACTED***'|g" docs/p0-02-r3/execution-log.md
  ```
  预期：文件中 1 处 `password:'***REDACTED***'` 替换为 `password:'***REDACTED***'`。
- [ ] 在文件头部添加脱敏标注（同 3.2 步骤的标注文本）。
- [ ] 验证该文件不再包含明文密码 `***REDACTED***`：
  ```bash
  grep -n "***REDACTED***" docs/p0-02-r3/execution-log.md
  ```
  预期：零匹配，或仅匹配非凭证上下文。

### 3.7 脱敏文件6：design.md

- [ ] 对 `docs/p0-02-r3/design.md` 执行脱敏替换（1 处明文，形式 `192.168.2.3 (密码已脱敏)`）：
  ```bash
  sed -i 's|192.168.2.3 (密码已脱敏)|192.168.2.3 (密码已脱敏)|g' docs/p0-02-r3/design.md
  ```
  预期：文件中 1 处 `192.168.2.3 (密码已脱敏)` 替换为 `192.168.2.3 (密码已脱敏)`。
- [ ] 在脱敏位置附近添加标注说明（或文件头部添加脱敏标注）。
- [ ] 验证该文件不再包含明文密码 `***REDACTED***`：
  ```bash
  grep -n "***REDACTED***" docs/p0-02-r3/design.md
  ```
  预期：零匹配，或仅匹配非凭证上下文。

### 3.8 脱敏文件7：tasks.md

- [ ] 对 `docs/p0-02-r3/tasks.md` 执行脱敏替换（1 处明文，形式 `192.168.2.3 (密码已脱敏)`）：
  ```bash
  sed -i 's|192.168.2.3 (密码已脱敏)|192.168.2.3 (密码已脱敏)|g' docs/p0-02-r3/tasks.md
  ```
  预期：文件中 1 处 `192.168.2.3 (密码已脱敏)` 替换为 `192.168.2.3 (密码已脱敏)`。
- [ ] 在脱敏位置附近添加标注说明（或文件头部添加脱敏标注）。
- [ ] 验证该文件不再包含明文密码 `***REDACTED***`：
  ```bash
  grep -n "***REDACTED***" docs/p0-02-r3/tasks.md
  ```
  预期：零匹配，或仅匹配非凭证上下文。

### 3.9 脱敏文件8：spec.md

- [ ] 对 `docs/p0-02-r3/spec.md` 执行脱敏替换（2 处明文，形式 `debian/***REDACTED***` 与 `192.168.2.3 (密码已脱敏)`）：
  ```bash
  sed -i 's|debian/***REDACTED***|debian/***REDACTED***|g' docs/p0-02-r3/spec.md
  sed -i 's|192.168.2.3 (密码已脱敏)|192.168.2.3 (密码已脱敏)|g' docs/p0-02-r3/spec.md
  ```
  预期：文件中 1 处 `debian/***REDACTED***` 替换为 `debian/***REDACTED***`，1 处 `192.168.2.3 (密码已脱敏)` 替换为 `192.168.2.3 (密码已脱敏)`。
- [ ] 在文件头部添加脱敏标注（同 3.2 步骤的标注文本）。
- [ ] 验证该文件不再包含明文密码 `***REDACTED***`：
  ```bash
  grep -n "***REDACTED***" docs/p0-02-r3/spec.md
  ```
  预期：零匹配，或仅匹配非凭证上下文。

### 3.10 脱敏文件9：.codeartsdoer/specs/p002_cred_fix/spec.md

- [ ] 对 `.codeartsdoer/specs/p002_cred_fix/spec.md` 执行脱敏替换（2 处明文，形式 `debian/***REDACTED***` 与 `192.168.2.3 (密码已脱敏)`）：
  ```bash
  sed -i 's|debian/***REDACTED***|debian/***REDACTED***|g' .codeartsdoer/specs/p002_cred_fix/spec.md
  sed -i 's|192.168.2.3 (密码已脱敏)|192.168.2.3 (密码已脱敏)|g' .codeartsdoer/specs/p002_cred_fix/spec.md
  ```
  预期：文件中明文密码替换为脱敏标注。
- [ ] 在文件头部添加脱敏标注（同 3.2 步骤的标注文本）。
- [ ] 验证该文件不再包含明文密码 `***REDACTED***`：
  ```bash
  grep -n "***REDACTED***" .codeartsdoer/specs/p002_cred_fix/spec.md
  ```
  预期：零匹配，或仅匹配非凭证上下文。

### 3.11 全文搜索验证零匹配

- [ ] 对整个仓库当前版本执行全文搜索，验证脱敏后零明文凭证：
  ```bash
  grep -rn "***REDACTED***" docs/p0-02-r3/ .codeartsdoer/specs/p002_cred_fix/
  ```
  预期：零匹配，或仅匹配非凭证上下文的 `***REDACTED***`（如端口号、版本号等，须逐一确认保留）。
- [ ] 若发现明文残留，执行异常处理：定位残留位置，补充脱敏，重新搜索确认。
- [ ] 若匹配到非凭证上下文的 `***REDACTED***`（如端口号、版本号），逐一确认匹配项是否为凭证，非凭证项保留并记录确认结论。

### 3.12 检查文档结构完整性

- [ ] 对比脱敏前后文档，确认以下不变项：
  - 章节编号不变
  - 表格格式不变（列对齐、表头一致）
  - SHA-256 哈希值、时间戳、退出码等证据数据不变
  - PlantUML 语法无错误
- [ ] 若脱敏替换导致文档格式损坏（如表格列对齐、PlantUML 语法错误），执行异常处理：修复格式，确保文档结构不变。

### 3.13 文档脱敏验收

- [ ] 确认 8 个文件中所有明文密码 `***REDACTED***` 已替换为脱敏标注
- [ ] 确认仓库当前版本全文搜索 `***REDACTED***` 零匹配（或仅非凭证上下文，已逐一确认）
- [ ] 确认文档结构、章节编号、表格格式、证据数据不变
- [ ] 确认每个脱敏文件已添加脱敏标注
- [ ] 整理脱敏文件清单（8 个文件、20 处明文、脱敏规则、零匹配验证结果），供任务4 证据归档使用

---

## 4. 整改证据归档与提交推送

> 对应 spec.md 5.4 节、design.md 3.4 节。
> 业务目标：汇总四项任务结论，创建整改证据文档，提交脱敏文档与证据至 GitHub main 分支。
> 前置依赖：任务1（凭证轮换）已完成、任务2（历史检查）已完成、任务3（文档脱敏）已完成。
> 后置条件：整改证据文档已归档至 `docs/p0-02-r3/evidence/cred-remediation-evidence.md`；证据已提交至 GitHub main 分支，SHA 完整可核对。

### 4.1 创建整改证据文档

- [ ] 在 `docs/p0-02-r3/evidence/cred-remediation-evidence.md` 创建整改证据文档，包含以下章节：
  1. **文档头**：整改任务编号（P0-02-GATE-SEC-01）、整改执行时间（ISO8601 格式）、整改执行者
  2. **凭证轮换事实**：远程服务器（192.168.2.3）、目标用户（debian）、旧密码失效确认、轮换时间、新密码未落盘确认
  3. **文档脱敏清单**：8 个文件清单、20 处明文、脱敏策略（4 种替换规则）、零匹配验证结果
  4. **git 历史检查结论**：10 个提交清单（SHA、提交信息、涉及文件）、暴露范围、历史清理策略（策略B）、风险消除结论
  5. **整改提交 SHA**：提交 SHA、提交信息、推送状态
  6. **仓库当前版本全文搜索结果**：零匹配确认
- [ ] 确认证据文档**不包含**新密码或任何可利用的凭据值。
- [ ] 确认证据文档中明确包含以下声明：
  - "远程服务器 192.168.2.3 debian 用户密码已轮换，旧密码 ***REDACTED*** 已失效"
  - "8 个文件已完成脱敏，仓库当前版本全文搜索 ***REDACTED*** 零匹配"
  - "10 个暴露提交已识别，选择策略B（记录暴露范围 + 凭证轮换事实），风险已消除"

### 4.2 暂存脱敏文件与证据文档

- [ ] 暂存 `docs/p0-02-r3/` 目录下所有脱敏后的文件与新增证据文档：
  ```bash
  git add docs/p0-02-r3/
  ```
- [ ] 暂存 `.codeartsdoer/specs/p002_cred_fix/` 目录下脱敏后的文件：
  ```bash
  git add .codeartsdoer/specs/p002_cred_fix/
  ```
- [ ] 确认暂存范围，确保仅包含脱敏文档与整改证据，不包含代码修改：
  ```bash
  git status
  git diff --cached --stat
  ```
  预期：暂存文件清单仅含 8 个脱敏文件 + 1 个新增证据文档，不包含 `SmbPlugin.ts`、`M2VerificationPage.tsx` 等代码文件。
- [ ] 若暂存范围包含无关变更，执行异常处理：`git reset HEAD <file>` 移除无关文件后重新确认。

### 4.3 提交脱敏文档与整改证据

- [ ] 执行 git commit，提交信息采用规范格式：
  ```bash
  git commit -m "fix(P0-02-SEC): 凭证安全整改 - 轮换+脱敏+历史检查+证据归档"
  ```
  或使用完整提交信息：
  ```bash
  git commit -m "fix(P0-02-SEC): 凭证安全整改 - 轮换+脱敏+历史检查+证据归档" -m "P0-02-GATE-SEC-01 阻断项整改：" -m "1. 凭证轮换：远程服务器 192.168.2.3 debian 用户密码已轮换，旧密码 ***REDACTED*** 已失效" -m "2. 文档脱敏：8 个文件共 20 处明文密码已替换为 ***REDACTED***，添加脱敏标注" -m "3. 历史检查：git log --all -S \"***REDACTED***\" 识别 10 个暴露提交，记录暴露范围与风险消除结论" -m "4. 证据归档：新增 cred-remediation-evidence.md 记录四项任务结论" -m "整改完成后进入 P0-02 Final Gate 第七次复审。"
  ```
  预期：提交成功，返回提交 SHA。
- [ ] 确认提交信息**不包含**新密码或任何可利用的凭据值。

### 4.4 推送至 GitHub main 分支

- [ ] 执行 git push 推送至 GitHub 远程仓库 main 分支：
  ```bash
  git push origin main
  ```
  预期：推送成功，返回成功信息。
- [ ] 若推送失败（网络问题、认证失败），执行异常处理：重试推送（最多 3 次），检查网络与 GitHub 认证后重试。

### 4.5 确认提交 SHA 并记录

- [ ] 执行 `git log -1` 获取完整提交 SHA：
  ```bash
  git log -1
  ```
  预期：返回最新提交的完整 SHA、提交信息、提交时间。
- [ ] 将提交 SHA 记录至整改证据文档（若证据文档中提交 SHA 占位符需更新，执行补充提交或 amend，但需注意 amend 限制）。
- [ ] 将提交 SHA 提供给 PM 第七次复审核对。

### 4.6 整改证据归档验收

- [ ] 确认整改证据文档已归档至 `docs/p0-02-r3/evidence/cred-remediation-evidence.md`
- [ ] 确认证据文档包含四项任务结论（凭证轮换、文档脱敏、历史检查、提交 SHA）
- [ ] 确认证据文档不包含新密码或任何可利用的凭据值
- [ ] 确认整改证据已提交至 GitHub main 分支，SHA 完整可核对
- [ ] 确认提交范围仅含脱敏文档与证据文档，不包含代码修改

---

## 5. 最终验证与交付

> 对应 design.md 3.5 节。
> 业务目标：推送后验证仓库当前版本零明文凭证、GitHub 远程仓库已更新、整改证据可核对，完成交付。
> 前置依赖：任务4（证据归档与提交推送）已完成。
> 后置条件：所有验证通过，整改完成，进入 P0-02 Final Gate 第七次复审。

### 5.1 仓库当前版本零明文凭证验证

- [ ] 推送后再次执行全文搜索，确认仓库当前版本零明文凭证：
  ```bash
  grep -rn "***REDACTED***" docs/p0-02-r3/ .codeartsdoer/specs/p002_cred_fix/
  ```
  预期：零匹配，或仅匹配非凭证上下文的 `***REDACTED***`（已逐一确认保留）。
- [ ] 若发现明文残留，执行异常处理：定位残留位置，补充脱敏，执行补充提交并重新推送。

### 5.2 GitHub 远程仓库更新验证

- [ ] 验证 GitHub 远程仓库 main 分支已更新：
  ```bash
  git log origin/main -1
  ```
  预期：远程 main 分支最新提交与本地 HEAD 一致。
- [ ] 若远程与本地不一致，执行异常处理：检查推送是否成功，重新执行 `git push origin main`。

### 5.3 整改证据文档可核对验证

- [ ] 确认整改证据文档存在且可读：
  ```bash
  ls -la docs/p0-02-r3/evidence/cred-remediation-evidence.md
  ```
  预期：文件存在，大小 > 0。
- [ ] 审查整改证据文档内容，确认四项任务结论完整、声明明确、不包含可利用凭据值。

### 5.4 提交 SHA 与交付物确认

- [ ] 确认整改提交 SHA 已记录，用于 PM 第七次复审核对。
- [ ] 确认交付物清单完整：
  - 8 个脱敏后的文档文件（`docs/p0-02-r3/` 目录下 7 个 + `.codeartsdoer/specs/p002_cred_fix/spec.md` 1 个）
  - 1 个新增整改证据文档（`docs/p0-02-r3/evidence/cred-remediation-evidence.md`）
  - 1 个整改提交（SHA 已记录）
- [ ] 确认不包含以下变更：
  - 任何代码修改（`SmbPlugin.ts`、`M2VerificationPage.tsx` 等不变）
  - 任何配置文件修改
  - 任何测试文件修改

### 5.5 约束遵守确认

- [ ] 确认未修改 `SmbPlugin.ts` 或 `M2VerificationPage.tsx`
- [ ] 确认未重做全部五项补验
- [ ] 确认未扩大验收范围（仅处理 P0-02-GATE-SEC-01 阻断项）
- [ ] 确认本轮只处理凭证安全整改，未扩大代码修改范围
- [ ] 确认 plink/pscp 命令在执行时带完整参数（文档中已脱敏）
- [ ] 确认 Git bash 路径转译使用了 `MSYS_NO_PATHCONV=1` 环境变量

### 5.6 最终验证验收

- [ ] 仓库当前版本全文搜索 `***REDACTED***` 零匹配（或仅非凭证上下文，已逐一确认）
- [ ] GitHub 远程仓库 main 分支已更新，与本地 HEAD 一致
- [ ] 整改证据文档可核对，四项任务结论完整
- [ ] 提交 SHA 已记录，交付物清单完整
- [ ] 所有约束已遵守（不修改代码、不重做补验、不扩大范围）
- [ ] 整改完成，请求 P0-02 Final Gate 第七次复审

---

## 任务依赖关系

```
任务1（凭证轮换）
  └──→ 任务3（文档脱敏）  [依赖：旧密码须在脱敏文档推送前失效]
         └──→ 任务4（证据归档与提交推送）  [依赖：前三项任务结论须汇总]
                └──→ 任务5（最终验证与交付）  [依赖：推送后验证]

任务2（git 历史检查）  [无依赖，可与任务1 并行，本规划按串行执行]
  └──→ 任务4（证据归档与提交推送）  [依赖：暴露范围须记录至证据]
```

**执行顺序**：任务1 → 任务2 → 任务3 → 任务4 → 任务5

**关键时序约束**：
1. 任务1（凭证轮换）必须最先执行，确保旧密码在脱敏文档推送前已失效
2. 任务2（历史检查）为只读操作，可在任务1 后、任务3 前执行
3. 任务3（文档脱敏）必须在任务1 完成后执行
4. 任务4（证据归档）必须最后执行，须汇总前三项任务结论
5. 任务5（最终验证）必须在任务4 推送后执行

---

## 验收标准汇总

| 验收项 | 验收条件 | 对应任务 |
|--------|----------|----------|
| 旧密码失效 | 使用旧密码 `***REDACTED***` SSH 登录 192.168.2.3 被拒绝 | 1.3、1.4 |
| 新密码不落盘 | 全文搜索仓库当前版本不包含新密码 | 1.4、5.1 |
| 脱敏完整性 | 仓库当前版本全文搜索 `***REDACTED***` 零匹配（或仅非凭证上下文） | 3.11、5.1 |
| 文档结构不变 | 章节编号、表格格式、证据数据不变 | 3.12 |
| 暴露提交全识别 | 10 个暴露提交已识别并记录 | 2.1、2.2、2.5 |
| 历史清理策略 | 策略B 已选择并说明理由 | 2.4、2.5 |
| 证据文档完整 | 包含四项任务结论，不包含可利用凭据 | 4.1、4.6、5.3 |
| 提交范围正确 | 仅含脱敏文档与证据，不含代码修改 | 4.2、5.4 |
| GitHub 已更新 | 远程 main 与本地 HEAD 一致 | 4.4、5.2 |
| 约束已遵守 | 不修改代码、不重做补验、不扩大范围 | 5.5、5.6 |

---

## 风险与异常处理汇总

| 风险项 | 风险等级 | 异常表现 | 处理策略 | 对应任务 |
|--------|---------|---------|---------|---------|
| 旧密码已被他人更改 | 中 | 1.1 步骤 SSH 登录失败 | 确认服务器当前密码状态后再执行轮换 | 1.1 |
| 密码更改权限不足 | 中 | 1.2 步骤 passwd 返回 Permission denied | 使用 sudo passwd debian 或联系管理员 | 1.2 |
| 新密码不符合策略 | 低 | 1.2 步骤 passwd 返回 BAD PASSWORD | 重新设置符合复杂度要求的新密码 | 1.2 |
| 脱敏遗漏 | 高 | 3.11 步骤全文搜索仍发现明文 | 定位残留位置，补充脱敏，重新搜索确认 | 3.11 |
| 非凭证上下文误判 | 低 | 3.11 步骤匹配到端口号、版本号 | 逐一确认匹配项，非凭证项保留并记录 | 3.11 |
| 脱敏破坏文档结构 | 中 | 3.12 步骤发现格式损坏 | 修复格式，确保文档结构不变 | 3.12 |
| 发现额外暴露提交 | 中 | 2.1 步骤返回提交数超出 10 个 | 将额外提交纳入暴露范围，补充记录 | 2.1 |
| 推送失败 | 中 | 4.4 步骤 git push 返回错误 | 重试推送（最多 3 次），检查网络与认证 | 4.4 |
| 暂存范围含无关变更 | 中 | 4.2 步骤 git status 含代码文件 | git reset HEAD 移除无关文件后重新确认 | 4.2 |
| 整改证据与实际不符 | 高 | 5.3 步骤审查发现声明与实际不符 | 重新执行整改，更新证据文档 | 5.3 |
| 新密码意外落盘 | 中 | 5.1 步骤全文搜索发现新密码 | 移除新密码记录，确认新密码仅由执行者持有 | 5.1 |

---

## 交付物清单

| 序号 | 交付物 | 路径 | 说明 |
|------|--------|------|------|
| 1 | 脱敏文件1 | `docs/p0-02-r3/evidence/file-operation-raw-log.txt` | 4 处明文已脱敏 |
| 2 | 脱敏文件2 | `docs/p0-02-r3/evidence-supplement-design.md` | 5 处明文已脱敏 |
| 3 | 脱敏文件3 | `docs/p0-02-r3/evidence-supplement-spec.md` | 1 处明文已脱敏 |
| 4 | 脱敏文件4 | `docs/p0-02-r3/evidence-supplement-tasks.md` | 5 处明文已脱敏 |
| 5 | 脱敏文件5 | `docs/p0-02-r3/execution-log.md` | 1 处明文已脱敏 |
| 6 | 脱敏文件6 | `docs/p0-02-r3/design.md` | 1 处明文已脱敏 |
| 7 | 脱敏文件7 | `docs/p0-02-r3/tasks.md` | 1 处明文已脱敏 |
| 8 | 脱敏文件8 | `docs/p0-02-r3/spec.md` | 2 处明文已脱敏 |
| 9 | 脱敏文件9 | `.codeartsdoer/specs/p002_cred_fix/spec.md` | 明文已脱敏 |
| 10 | 整改证据文档 | `docs/p0-02-r3/evidence/cred-remediation-evidence.md` | 新增，记录四项任务结论 |
| 11 | 整改提交 | GitHub main 分支 | 提交 SHA 记录至证据文档 |

> **注**：脱敏文件清单中序号 1-9 对应 design.md 2.3.2.1 节的 8 个文件（`docs/p0-02-r3/spec.md` 与 `.codeartsdoer/specs/p002_cred_fix/spec.md` 为同一规格文档的两个副本，均需脱敏，故实际脱敏 9 个文件路径）。`docs/p0-02-r3/evidence/apk-identity-verification.txt`、`docs/p0-02-r3/evidence-supplement-report.md`、`docs/p0-02-r3/test-report.md` 经检查未包含明文密码 `***REDACTED***`，无需脱敏，但须在证据文档中记录"已检查、零匹配"结论。
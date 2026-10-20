# P0-02 凭证安全闭环编码任务规划

> 本文档为 P0-02 Final Gate **第七次** PM 复审裁定 **HOLD** 的阻断项 **P0-02-GATE-SEC-01：凭证安全整改尚未闭环** 的编码任务规划。基于 `.codeartsdoer/specs/p002_cred_closure/spec.md` 需求规格（36 条 EARS 规则 + 19 异常场景）与 `docs/p0-02-r3/cred-closure-design.md` 实现方案（10 个 PlantUML 图、四模块技术方案），将四模块技术方案分解为可执行的步骤级任务。
>
> **文档定位**：本任务规划仅针对凭证安全闭环的四项措施——SSH 密钥认证切换、git filter-repo 历史重写、残留值安全定性、整改报告归档。不涉及代码功能修改，不重做五项补验，不修改 SmbPlugin.ts，M2VerificationPage.tsx 仅安全定性不修改代码（git diff 零变更）。整改完成后进入 P0-02 Final Gate **第八次**复审。
>
> **任务规划依据**：
> - 需求规格：`.codeartsdoer/specs/p002_cred_closure/spec.md`（36 条 EARS 规则 + 19 异常场景）
> - 实现方案：`docs/p0-02-r3/cred-closure-design.md`（1585 行，10 个 PlantUML 图，四模块技术方案）
> - 上一轮整改证据：`docs/p0-02-r3/evidence/cred-remediation-evidence.md`（29 文件脱敏 + 11 暴露提交识别）
>
> **任务规划产物归档路径**：`docs/p0-02-r3/cred-closure-tasks.md`
>
> **执行顺序**：模块A SSH 密钥认证切换（任务1）→ 模块B git 历史重写（任务2）→ 模块C 残留值安全定性（任务3）→ 模块D 整改报告归档（任务4）→ 集成验证（任务5）→ 风险处置确认（任务6）→ PM 第八次复审核对（任务7）
>
> **关键时序约束**：
> - TO-1：模块A（SSH 密钥认证切换）必须最先执行，确保旧密码 `***REDACTED***` 在远程历史被 force push 重写前已失效
> - TO-2：模块B（历史重写）必须在模块D（报告归档）前完成，报告须记录历史重写结果
> - TO-3：模块C（残留值定性）可在任一阶段执行（只读操作）
> - TO-4：模块C 定性结论须在模块D 报告提交前完成
> - TO-5：模块D 必须最后执行，须汇总前三项任务结论
>
> **脱敏说明**：本文档中所有命令与旧密码统一用 `***REDACTED***` 脱敏表示（实际执行时使用真实密码）。文档本身不含明文凭证，不含 SSH 私钥。

---

## 1. SSH 密钥认证切换（使旧密码失效）

> 对应 spec.md 5.1 节（9 条 EARS 规则 + 6 异常场景）、design.md 3.1 节（模块A）。
> 业务目标：在远程编译服务器 192.168.2.3 上配置 SSH 密钥认证并禁用密码登录，使已暴露的旧密码 `***REDACTED***` 自动失效，并验证密钥认证可正常使用。
> 前置依赖：无（本任务为整改流程起点，时序约束 TO-1 要求最先执行）。
> 后置条件：旧密码 `***REDACTED***` 无法用于 SSH 登录 192.168.2.3；SSH 私钥可正常登录；SSH hostkey 保持不变；私钥不落盘。

### 1.1 前置确认：服务器可达性与旧密码有效性

- [ ] 确认远程服务器 192.168.2.3 SSH 服务可达，旧密码 `***REDACTED***` 当前有效：
  ```bash
  MSYS_NO_PATHCONV=1 plink -ssh -pw ***REDACTED*** -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY" debian@192.168.2.3 "echo CONNECTIVITY_OK"
  ```
  预期输出：`CONNECTIVITY_OK`，退出码 0。
- [ ] 确认整改执行者在 192.168.2.3 上有 sudo 权限（修改 sshd_config 与重启 sshd 所需）：
  ```bash
  MSYS_NO_PATHCONV=1 plink -ssh -pw ***REDACTED*** -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY" debian@192.168.2.3 "sudo -n true && echo SUDO_OK"
  ```
  预期输出：`SUDO_OK`，退出码 0。
- [ ] 异常处理：若返回 `Access denied`，检查旧密码是否已被他人轮换，确认服务器当前密码状态后再继续；若 `sudo -n true` 失败，联系服务器管理员协助执行 sshd_config 修改。记录异常至执行日志。

### 1.2 生成 SSH 密钥对

- [ ] 在本地执行 ssh-keygen 生成 ed25519 类型 SSH 密钥对：
  ```bash
  ssh-keygen -t ed25519 -f <key_path> -N "" -C "pad2-cred-closure-20261020"
  ```
  预期输出：密钥对已生成（公钥 `<key_path>.pub` + 私钥 `<key_path>`），退出码 0。
- [ ] 确认私钥**不落盘、不写入仓库、不写入归档文档、不写入提交信息、不写入日志文件**。私钥仅由整改执行者持有。
- [ ] 异常处理（A-EX-01）：若 ssh-keygen 返回 `No space left`，清理磁盘空间后重新生成；若返回 `Permission denied`，更改密钥保存路径或修复权限；若提示密钥已存在，确认是否覆盖或使用新路径。

### 1.3 使用旧密码登录部署公钥至 authorized_keys

- [ ] 读取生成的公钥内容，使用旧密码 SSH 登录 192.168.2.3 将公钥追加至 debian 用户的 `~/.ssh/authorized_keys`：
  ```bash
  MSYS_NO_PATHCONV=1 plink -ssh -pw ***REDACTED*** -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY" debian@192.168.2.3 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '<public_key_content>' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo DEPLOY_OK"
  ```
  预期输出：`DEPLOY_OK`，退出码 0。
- [ ] 确认 `~/.ssh` 目录权限为 700，`authorized_keys` 权限为 600。
- [ ] 异常处理（A-EX-02）：若返回 `Access denied`，检查旧密码是否仍有效；若返回 `Permission denied`，使用 sudo 提升权限或检查目录所有权；若公钥格式错误导致 sshd 拒绝，确认公钥内容完整、格式正确。

### 1.4 修改 sshd_config 禁用密码登录、启用密钥认证

- [ ] 使用旧密码 SSH 登录 192.168.2.3 修改 `/etc/ssh/sshd_config`：
  ```bash
  MSYS_NO_PATHCONV=1 plink -ssh -pw ***REDACTED*** -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY" debian@192.168.2.3 "sudo sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config && sudo sed -i 's/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config && echo CONFIG_OK"
  ```
  预期输出：`CONFIG_OK`，退出码 0。
- [ ] 确认 sshd_config 中 `PasswordAuthentication no` 与 `PubkeyAuthentication yes` 已设置。
- [ ] 异常处理（A-EX-03）：若 sudo 返回 `permission denied`，联系服务器管理员执行配置修改。

### 1.5 重启 sshd 服务使配置生效

- [ ] 使用旧密码 SSH 登录 192.168.2.3 重启 sshd 服务：
  ```bash
  MSYS_NO_PATHCONV=1 plink -ssh -pw ***REDACTED*** -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY" debian@192.168.2.3 "sudo systemctl restart sshd && sudo systemctl status sshd | head -5"
  ```
  预期输出：sshd 状态为 `active (running)`，退出码 0。
- [ ] 异常处理（A-EX-04）：若 systemctl 返回错误，先执行 `sshd -t` 检查 sshd_config 语法，修复后重新重启；回滚方案：恢复 sshd_config 原配置（`PasswordAuthentication yes`）。

### 1.6 验证旧密码已失效

- [ ] 使用旧密码 `***REDACTED***` 尝试 SSH 登录 192.168.2.3，确认认证被拒绝：
  ```bash
  MSYS_NO_PATHCONV=1 plink -ssh -pw ***REDACTED*** -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY" debian@192.168.2.3 "echo TEST"
  ```
  预期输出：`Access denied` 或 `Authentication failed`，退出码非 0。
- [ ] 记录旧密码失效验证结果（命令 + 预期 + 实际结果 + 退出码），供任务4 证据归档使用。
- [ ] 异常处理（A-EX-05）：若旧密码仍可登录（配置未生效），排查 sshd 状态、PAM 认证覆盖、是否存在多个 sshd 实例，修复后重新验证；回滚方案：恢复 sshd_config 原配置。

### 1.7 验证密钥登录成功

- [ ] 使用生成的 SSH 私钥尝试登录 192.168.2.3，确认密钥认证可用：
  ```bash
  MSYS_NO_PATHCONV=1 plink -ssh -i <private_key_path> -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY" debian@192.168.2.3 "echo KEY_LOGIN_OK"
  ```
  预期输出：`KEY_LOGIN_OK`，退出码 0。
- [ ] 记录密钥认证可用性验证结果（命令 + 预期 + 实际结果 + 退出码），供任务4 证据归档使用。
- [ ] 异常处理（A-EX-06）：若密钥登录失败，排查 authorized_keys 内容、文件权限、sshd_config 生效状态；若私钥文件权限问题（`UNPROTECTED PRIVATE KEY`），设置私钥文件权限 600。

### 1.8 验证 hostkey 保持不变

- [ ] 确认认证方式切换后 SSH hostkey 仍为指定值：
  ```bash
  MSYS_NO_PATHCONV=1 plink -ssh -i <private_key_path> -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY" debian@192.168.2.3 "echo HOSTKEY_OK"
  ```
  预期输出：`HOSTKEY_OK`（hostkey 匹配成功，未变更），退出码 0。
- [ ] 记录 hostkey 不变验证结果，供任务4 证据归档使用。

### 1.9 验证编译流程兼容性

- [ ] 确认依赖 192.168.2.3 的编译/部署流程在密钥认证模式下可正常工作（使用密钥认证替代密码认证执行一次编译/部署连通性测试）。
- [ ] 异常处理（A-EX-07）：若编译/部署脚本因密码认证被禁用而失败，将相关脚本改为使用密钥认证（`plink -ssh -i <private_key>` 替代 `-pw ***REDACTED***`），验证流程恢复。

### 1.10 模块A 验收

- [ ] 旧密码 `***REDACTED***` 无法登录 192.168.2.3（退出码非 0）
- [ ] SSH 私钥可正常登录 192.168.2.3（退出码 0）
- [ ] SSH hostkey 保持不变（`SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY`）
- [ ] SSH 私钥未写入任何归档文档、提交信息、日志文件或仓库
- [ ] 依赖 192.168.2.3 的编译/部署流程可通过密钥认证正常工作
- [ ] 后续 SSH 命令使用密钥认证，不再使用 `-pw` 明文参数

---

## 2. git filter-repo 历史重写（清除历史明文）

> 对应 spec.md 5.2 节（9 条 EARS 规则 + 6 异常场景）、design.md 3.2 节（模块B）。
> 业务目标：使用 git filter-repo 清除所有提交历史中的明文密码 `***REDACTED***`，force push 重写 GitHub 远程仓库 main 分支历史，并记录已知风险。
> 前置依赖：任务1（模块A）已完成，旧密码 `***REDACTED***` 已失效（时序约束 TO-1）。
> 后置条件：所有提交中明文密码已替换为 `***REDACTED***`；GitHub 远程历史已更新；11 个暴露提交全部覆盖；已知风险已记录。

### 2.1 前置确认：git filter-repo 安装与仓库完整性

- [ ] 确认 git filter-repo 已安装：
  ```bash
  git filter-repo --version
  ```
  预期输出：版本号，退出码 0。若未安装，执行 `pip install git-filter-repo` 安装后重试。
- [ ] 确认本地仓库完整（所有提交已 fetch）：
  ```bash
  git fetch --all && git log --oneline | head -5
  ```
  预期输出：最新提交列表，退出码 0。
- [ ] 确认任务1（模块A）已完成：旧密码 `***REDACTED***` 已失效（1.6 步骤验证通过）。
- [ ] 确认 GitHub 远程仓库可 force push（检查分支保护规则，必要时临时放行）。

### 2.2 创建本地仓库备份

- [ ] 使用 tar 打包 .git 目录创建本地仓库备份（推荐，不依赖网络）：
  ```bash
  tar -czf repo-backup-before-rewrite.tar.gz .git
  ```
  预期输出：备份文件 `repo-backup-before-rewrite.tar.gz` 已创建，退出码 0。
- [ ] 验证备份完整性：
  ```bash
  tar -tzf repo-backup-before-rewrite.tar.gz | head -5
  ```
  预期输出：备份内容可列出，退出码 0。
- [ ] 异常处理（B-EX-03 备份失败）：若磁盘空间不足，清理磁盘或选择其他备份路径；若 tar 失败，改用 `git clone --mirror https://github.com/wujupeng/andriodpad2.git backup-before-rewrite.git` 方式备份。

### 2.3 准备替换规则文件

- [ ] 创建替换规则文件 `replace-rules.txt`，内容为明文密码到脱敏标注的替换规则：
  ```
  ***REDACTED***==>***REDACTED***
  ```
  预期：规则文件已就绪，格式为 `原值==>新值`。
- [ ] 异常处理（B-EX-02）：若规则文件格式错误导致 filter-repo 返回解析错误，修正格式后重新执行。

### 2.4 执行 git filter-repo 历史重写

- [ ] 执行 git filter-repo 替换所有提交历史中的明文密码：
  ```bash
  git filter-repo --replace-text replace-rules.txt --force
  ```
  预期输出：所有提交中的明文密码 `***REDACTED***` 已替换为 `***REDACTED***`，提交 SHA 已变更，退出码 0。
- [ ] 异常处理（B-EX-01/03）：若 filter-repo 未安装，执行 `pip install git-filter-repo` 后重试；若仓库状态异常导致拒绝执行，从 2.2 步骤备份恢复仓库后重新执行；若提示需 --force，确认已添加 --force 参数。

### 2.5 验证历史明文已清除

- [ ] 使用 `-S` 模式验证历史中明文密码已清除（零匹配）：
  ```bash
  git log --all -S "***REDACTED***" --oneline
  ```
  预期输出：无输出（零匹配），退出码 0。
- [ ] 使用 `-G` 模式验证（比 `-S` 更全面，记录所有包含目标字符串的行变更）：
  ```bash
  git log --all -G "***REDACTED***" --oneline
  ```
  预期输出：无输出（零匹配），退出码 0。
- [ ] 记录历史明文清除验证结果（命令 + 预期 + 实际结果），供任务4 证据归档使用。
- [ ] 异常处理（B-EX-04）：若仍有明文残留（返回 N 个匹配提交），补充替换规则（可能存在其他形式的明文），从 2.2 步骤备份恢复后重新执行 filter-repo。

### 2.6 识别文档中旧 SHA 引用

- [ ] 搜索文档中引用的旧 SHA（重写后将失效的引用位置）：
  ```bash
  grep -rn "7e81fa9\|dfbb5f2\|81d8293\|5cd4da7\|17fac76\|c6bd202\|dac77fe\|d720262\|72a603a\|fb989dd\|110cb03\|693fb75\|c44eadf\|2bf4cdf\|a5c5364" --include="*.md" --include="*.txt" . | grep -v node_modules | grep -v ".git/"
  ```
  预期输出：返回受影响的引用位置列表（文件路径:行号:匹配内容）。
- [ ] 将受影响引用位置列表记录为已知风险 RISK-01（SHA 引用失效），供任务4 证据归档使用。
- [ ] 异常处理：本步骤为只读操作，无需回滚；识别结果记录至整改报告，本轮不更新引用（由仓库所有者决定后续处置）。

### 2.7 force push 重写远程历史

- [ ] 检查 GitHub 分支保护状态，若 main 分支有保护规则，临时关闭保护或联系仓库管理员放行。
- [ ] 执行 force push 将重写后的本地历史强制推送至 GitHub 远程仓库 main 分支：
  ```bash
  git push --force origin main
  ```
  预期输出：远程仓库 main 分支历史已更新，退出码 0。
- [ ] 若曾临时关闭分支保护，force push 后恢复保护规则。
- [ ] 异常处理（B-EX-05/06）：若 force push 被分支保护拒绝，临时关闭分支保护或联系管理员放行后重试；若网络问题，重试推送；若非快进错误，确认使用 --force 参数。

### 2.8 验证远程历史已更新

- [ ] 验证远程仓库 main 分支历史中明文密码已清除：
  ```bash
  git log origin/main -S "***REDACTED***" --oneline
  ```
  预期输出：无输出（零匹配），退出码 0。
- [ ] 记录远程历史验证结果，供任务4 证据归档使用。

### 2.9 记录已知风险

- [ ] 记录 RISK-01（SHA 引用失效）：列出 2.6 步骤识别的受影响引用位置，说明重写后这些旧 SHA 不再存在，本轮不更新引用，由仓库所有者决定后续处置。
- [ ] 记录 RISK-02（远端副本可能已存在）：说明其他人员可能已 clone 旧历史，force push 无法撤回其本地副本；但旧密码 `***REDACTED***` 已通过任务1 SSH 密钥认证切换失效，历史中的明文不可利用；由仓库所有者决定后续通知协作者。
- [ ] 确认 11 个暴露提交全部覆盖（`c6bd202`、`dac77fe`、`d720262`、`72a603a`、`fb989dd`、`110cb03`、`693fb75`、`c44eadf`、`2bf4cdf`、`a5c5364`、`81d8293`），重写后明文已全部替换为 `***REDACTED***`。

### 2.10 模块B 验收

- [ ] `git log --all -S "***REDACTED***"` 零匹配
- [ ] `git log --all -G "***REDACTED***"` 零匹配
- [ ] GitHub 远程仓库 main 分支历史已更新（force push 成功）
- [ ] 11 个暴露提交中明文已全部替换为 `***REDACTED***`
- [ ] 已知风险 RISK-01（SHA 引用失效）与 RISK-02（远端副本风险）已记录
- [ ] 仓库备份已创建（可用于回滚）

---

## 3. 拋留值安全定性（不修改代码）

> 对应 spec.md 5.3 节（7 条 EARS 规则 + 3 异常场景）、design.md 3.3 节（模块C）。
> 业务目标：对 `src/ui/pages/M2VerificationPage.tsx:33` 的 `useState('***REDACTED***')` 进行六维度安全定性判定，产出定性结论，不修改代码（git diff 零变更）。
> 前置依赖：无严格前置（只读操作，时序约束 TO-3 允许任一阶段执行），但定性结论须在任务4 报告提交前完成（TO-4）。本规划按串行执行便于证据汇总。
> 后置条件：安全定性结论已产出（含六维度判定 + 风险等级 + 处理建议）；M2VerificationPage.tsx 文件内容不变。

### 3.1 前置确认：文件可读与 PM 约束

- [ ] 确认 `src/ui/pages/M2VerificationPage.tsx` 文件存在且可读：
  ```bash
  test -f src/ui/pages/M2VerificationPage.tsx && echo FILE_OK
  ```
  预期输出：`FILE_OK`，退出码 0。
- [ ] 确认 PM 约束：不修改 M2VerificationPage.tsx 代码（本轮仅安全定性，git diff 零变更）。
- [ ] 异常处理（C-EX-01）：若文件不可读，检查文件路径与权限，确认文件存在；若文件不存在，标注"文件不存在"并记录至整改报告。

### 3.2 读取 M2VerificationPage.tsx 第 33 行及上下文

- [ ] 读取 `src/ui/pages/M2VerificationPage.tsx` 第 33 行，提取 `useState('***REDACTED***')`：
  ```bash
  sed -n '25,45p' src/ui/pages/M2VerificationPage.tsx
  ```
  预期输出：第 25-45 行内容（含第 33 行 `useState('***REDACTED***')` 及上下文）。
- [ ] 分析上下文：
  - 页面用途（M2VerificationPage 是否为测试验证页面）
  - 组件结构（useState 的初始值用途）
  - 是否参与实际认证流程（是否传递给 SSH/SMB 认证组件）
  - 是否为默认输入值（是否为表单初始值或测试占位符）
- [ ] 异常处理（C-EX-02）：若上下文不足以判定性质（页面用途不明、认证流程不清），标注"性质待定"，建议后续由开发人员进一步分析。

### 3.3 六维度安全定性判定

- [ ] 维度1 — 是否属于凭证：判定 `useState('***REDACTED***')` 的值是否用于 SSH/SMB/数据库等认证。判定依据：分析该值是否传递给认证组件或认证 API。
- [ ] 维度2 — 是否属于敏感配置：判定该值是否为生产环境配置项。判定依据：分析该值是否通过环境变量、配置文件注入生产环境。
- [ ] 维度3 — 是否为测试用值：判定 M2VerificationPage 是否为测试页面、该值是否为测试默认输入。判定依据：分析页面命名（Verification）、组件用途、是否仅在测试环境使用。
- [ ] 维度4 — 是否为生产凭据：判定该值是否参与生产环境实际认证。判定依据：分析该值是否在生产构建中参与真实认证流程。
- [ ] 维度5 — 风险等级评估：
  - 高：属于凭证 且 为生产凭据
  - 中：属于敏感配置 但 非生产凭据
  - 低：为测试用值 且 非生产凭据
- [ ] 维度6 — 处理建议：
  - 高风险 → 建议后续在 PM 授权后修改代码移除凭证，本轮不修改（遵守 PM 约束）
  - 中/低风险 → 建议后续可考虑替换为非真实值，本轮不修改
- [ ] 异常处理（C-EX-03）：若判定为生产凭证（高风险），标注高风险，建议后续在 PM 授权后修改代码移除凭证，本轮不修改（遵守 PM 约束）。

### 3.4 确认代码不变更

- [ ] 确认 M2VerificationPage.tsx 文件内容未发生变更：
  ```bash
  git diff src/ui/pages/M2VerificationPage.tsx
  ```
  预期输出：无输出（零变更），退出码 0。
- [ ] 确认 git diff 零变更，未违反 PM 约束。

### 3.5 定性结论记录

- [ ] 将定性结论（六维度判定 + 风险等级 + 处理建议 + 定性依据 + 代码变更确认）整理为结构化记录，传递给任务4（模块D）整改报告归档。
- [ ] 定性结论须包含：文件路径、定性行号、定性目标、六维度判定结果、风险等级、处理建议、定性依据、代码变更确认（git diff 零变更）。

### 3.6 模块C 验收

- [ ] 安全定性结论已产出，包含六维度判定（是否凭证、是否敏感配置、是否测试用值、是否生产凭据、风险等级、处理建议）
- [ ] M2VerificationPage.tsx 文件内容不变（`git diff` 零变更）
- [ ] 定性结论已结构化记录，可供任务4 整改报告归档使用
- [ ] 定性基于代码上下文分析（非主观声明，含分析依据）

---

## 4. 整改报告归档与提交

> 对应 spec.md 5.4 节（11 条 EARS 规则 + 4 异常场景）、design.md 3.4 节（模块D）。
> 业务目标：汇总四项整改结论（旧凭证失效证明、历史暴露处置结论、当前版本扫描结果、访问控制验证）+ 拋留值定性结论，编写可复核的整改报告，提交至 GitHub main 分支。
> 前置依赖：任务1（模块A）已完成（时序约束 TO-1）、任务2（模块B）已完成（时序约束 TO-2）、任务3（模块C）已完成（时序约束 TO-4）。
> 后置条件：整改报告已归档至 `docs/p0-02-r3/evidence/cred-closure-evidence.md`；报告含四项必备内容 + 残留值定性结论 + 整改提交 SHA；报告不含敏感信息；报告已提交至 GitHub main 分支。

### 4.1 前置确认：前三项任务完成状态

- [ ] 确认任务1（模块A）已完成：旧凭证失效证明已收集（1.6 步骤旧密码失效验证 + 1.7 步骤密钥可用验证 + 1.8 步骤 hostkey 不变验证）。
- [ ] 确认任务2（模块B）已完成：历史重写结果已收集（2.5 步骤历史明文清除验证 + 2.7 步骤 force push 结果 + 2.9 步骤已知风险记录）。
- [ ] 确认任务3（模块C）已完成：残留值定性结论已收集（3.3 步骤六维度判定 + 3.5 步骤定性结论记录）。

### 4.2 汇总四项整改结论

- [ ] 汇总旧凭证失效证明：SSH 密码登录被拒的命令 + 预期结果 + 实际结果 + 退出码（来自 1.6 步骤）。
- [ ] 汇总历史暴露处置结论：git filter-repo 执行结果 + force push 结果 + 11 个暴露提交覆盖确认 + 已知风险记录（来自 2.4/2.7/2.9 步骤）。
- [ ] 汇总当前版本扫描结果：grep + git log 命令 + 扫描范围（当前版本 + 历史全提交）+ 零匹配确认（来自 2.5 步骤 + 4.7 步骤推送后验证）。
- [ ] 汇总访问控制验证：密钥登录成功（退出码 0）+ 密码登录被拒（退出码非 0）的实际结果（来自 1.6/1.7 步骤）。
- [ ] 汇总残留值定性结论：六维度判定 + 风险等级 + 处理建议（来自 3.3/3.5 步骤）。

### 4.3 编写整改报告文档

- [ ] 编写整改报告文档至 `docs/p0-02-r3/evidence/cred-closure-evidence.md`，按 PM 四项必备内容结构化编写：
  - 文档头：整改任务编号（P0-02-GATE-SEC-01）、整改执行时间（ISO8601）、整改执行者、PM 复审轮次（第七次 HOLD → 第八次）
  - 章节1：旧凭证失效证明（SSH 密码登录被拒的命令与实际结果）
  - 章节2：历史暴露处置结论（git filter-repo 执行结果、force push 结果、11 个暴露提交覆盖确认、已知风险记录）
  - 章节3：当前版本扫描结果（全文搜索命令与零匹配确认）
  - 章节4：访问控制验证（SSH 密钥登录成功 + 密码登录被拒的实际结果）
  - 章节5：M2VerificationPage.tsx 拋留值安全定性结论（性质判定、风险等级、处理建议）
  - 章节6：整改提交 SHA
  - 章节7：约束遵守确认
- [ ] 确认报告格式为 Markdown，含时间戳（ISO8601）、执行命令、预期结果、实际结果、退出码。
- [ ] 确认报告声明后续 SSH 命令使用密钥认证，不再使用 `-pw` 明文参数。

### 4.4 验证报告不含敏感信息

- [ ] 全文搜索报告文档，确认不含 SSH 私钥、新密码、任何可利用凭据值：
  ```bash
  grep -rn "BEGIN.*PRIVATE KEY\|END.*PRIVATE KEY" docs/p0-02-r3/evidence/cred-closure-evidence.md
  ```
  预期输出：无输出（不含私钥内容），退出码 1。
- [ ] 确认报告中旧密码仅以 `***REDACTED***` 脱敏标注形式出现，不含明文密码。
- [ ] 异常处理（D-EX-03）：若发现敏感信息，立即从报告中删除敏感信息，重新编写，评估是否需再次轮换泄露的私钥/密码。

### 4.5 git 提交推送

- [ ] 将整改报告文档与实现方案文档提交至 git：
  ```bash
  git add docs/p0-02-r3/evidence/cred-closure-evidence.md
  git add docs/p0-02-r3/cred-closure-design.md
  git add docs/p0-02-r3/cred-closure-tasks.md
  git commit -m "fix(P0-02-SEC): 凭证安全闭环 - SSH密钥认证+历史重写+残留定性+报告归档"
  git push origin main
  ```
  预期输出：提交与推送成功，退出码 0。
- [ ] 确认提交范围仅包含整改报告文档 + 实现方案文档 + 任务规划文档，不包含 SmbPlugin.ts 和 M2VerificationPage.tsx 修改。
- [ ] 异常处理（D-EX-01）：若推送失败，重试推送，检查网络与 GitHub 认证，确认本地与远程状态一致。

### 4.6 记录新提交 SHA

- [ ] 记录整改提交的完整 SHA 供 PM 第八次复审核对：
  ```bash
  git log -1 --format=%H
  ```
  预期输出：完整 SHA（40 字符十六进制字符串）。
- [ ] 将完整 SHA 记录至整改报告文档（若报告已提交，创建补充提交更新 SHA 引用，不使用 --amend 避免改写已推送历史）。

### 4.7 推送后验证

- [ ] 确认仓库当前版本零明文凭证（除 M2VerificationPage.tsx 拦留值已定性）：
  ```bash
  grep -rn "***REDACTED***" --include="*.md" --include="*.txt" --include="*.ts" --include="*.tsx" --include="*.json" . | grep -v node_modules | grep -v ".git/"
  ```
  预期输出：仅 `src/ui/pages/M2VerificationPage.tsx:33` 拦留（已定性），无其他明文匹配。
- [ ] 确认远程仓库已包含整改报告：
  ```bash
  git log origin/main --oneline | head -3
  ```
  预期输出：最新提交为整改报告提交。

### 4.8 模块D 验收

- [ ] 整改报告已归档至 `docs/p0-02-r3/evidence/cred-closure-evidence.md`
- [ ] 报告包含四项必备内容（旧凭证失效证明 + 历史处置结论 + 当前版本扫描 + 访问控制验证）
- [ ] 报告包含残留值定性结论（六维度判定 + 风险等级 + 处理建议）
- [ ] 报告包含整改提交 SHA
- [ ] 报告不含 SSH 私钥、新密码、可利用凭据值
- [ ] 报告已提交至 GitHub main 分支，SHA 完整可核对
- [ ] 仓库当前版本零明文凭证（除 M2VerificationPage.tsx 拦留值已定性）

---

## 5. 集成验证与最终核对

> 对应 spec.md 4.2 节可靠性约束、4.3 节安全性约束。
> 业务目标：跨模块集成验证，确认四项整改措施整体闭环，所有验收条件满足。
> 前置依赖：任务1-4 全部完成。
> 后置条件：集成验证全部通过，可进入任务7 PM 第八次复审核对。

### 5.1 当前版本全文扫描零明文验证

- [ ] 执行当前版本全文扫描，确认除 M2VerificationPage.tsx 拦留值外零明文匹配：
  ```bash
  grep -rn "***REDACTED***" --include="*.md" --include="*.txt" --include="*.ts" --include="*.tsx" --include="*.json" . | grep -v node_modules | grep -v ".git/"
  ```
  预期输出：仅 `src/ui/pages/M2VerificationPage.tsx:33` 拦留（已定性）。

### 5.2 历史全提交扫描零明文验证

- [ ] 验证本地历史全提交零明文匹配：
  ```bash
  git log --all -S "***REDACTED***" --oneline
  git log --all -G "***REDACTED***" --oneline
  ```
  预期输出：两条命令均无输出（零匹配）。

### 5.3 远程仓库历史验证

- [ ] 验证远程仓库 main 分支历史零明文匹配：
  ```bash
  git log origin/main -S "***REDACTED***" --oneline
  ```
  预期输出：无输出（零匹配）。

### 5.4 整改报告完整性核对

- [ ] 核对整改报告包含 PM 四项必备内容：旧凭证失效证明、历史暴露处置结论、当前版本扫描结果、访问控制验证。
- [ ] 核对整改报告包含残留值定性结论（六维度判定 + 风险等级 + 处理建议）。
- [ ] 核对整改报告包含整改提交 SHA。
- [ ] 核对整改报告包含已知风险记录（RISK-01 + RISK-02）。
- [ ] 核对每项结论含可验证证据（命令 + 预期结果 + 实际结果 + 退出码）。

### 5.5 约束遵守确认

- [ ] 确认未修改 SmbPlugin.ts（`git diff src/main/java/.../SmbPlugin.ts` 无输出，路径按实际位置调整）
- [ ] 确认未修改 M2VerificationPage.tsx（`git diff src/ui/pages/M2VerificationPage.tsx` 无输出）
- [ ] 确认未重做五项补验
- [ ] 确认未扩大验收范围（仅处理 P0-02-GATE-SEC-01 阻断项）
- [ ] 确认严格时序：SSH 密钥认证切换 → 历史重写 force push → 拋留值定性 → 整改报告提交（串行执行）

---

## 6. 风险处置与回滚预案确认

> 对应 design.md 第四章异常处理策略与回滚方案、spec.md 4.3 节安全性约束 5。
> 业务目标：确认已知风险已记录、回滚预案已就绪，确保整改过程可控、可回滚。
> 前置依赖：任务1-5 完成。
> 后置条件：已知风险记录确认、回滚预案确认。

### 6.1 已知风险记录确认

- [ ] 确认 RISK-01（SHA 引用失效）已记录至整改报告：列出受影响的引用位置（来自 2.6 步骤），说明重写后旧 SHA 不再存在，本轮不更新引用，由仓库所有者决定后续处置。
- [ ] 确认 RISK-02（远端副本可能已存在）已记录至整改报告：说明他人可能已 clone 旧历史，force push 无法撤回其本地副本；旧密码已失效故历史明文不可利用；由仓库所有者决定后续通知协作者。
- [ ] 确认已知风险标注影响范围与处置方式。

### 6.2 回滚预案确认

- [ ] 确认模块A 回滚预案：若密钥认证配置后无法登录且无法修复，恢复 sshd_config 原配置（`PasswordAuthentication yes`），重启 sshd，使旧密码认证恢复可用。
- [ ] 确认模块B 回滚预案：若 git filter-repo 执行失败或重写后仓库状态异常，从 2.2 步骤创建的备份恢复仓库（`rm -rf .git && tar -xzf repo-backup-before-rewrite.tar.gz`）。
- [ ] 确认模块C 无需回滚（只读操作，不修改代码）。
- [ ] 确认模块D 回滚预案：若报告包含敏感信息，立即删除敏感信息，创建新提交修正（不使用 --amend，避免改写已推送历史）。

---

## 7. PM 第八次复审核对清单

> 对应 spec.md 1.3 节核心输出、6.6 节整改提交约束。
> 业务目标：整理 PM 第八次复审所需核对清单与交付物，通知 PM 执行复审。
> 前置依赖：任务1-6 全部完成。
> 后置条件：PM 第八次复审核对清单就绪，交付物清单确认。

### 7.1 PM 四项最小整改要求核对清单

- [ ] 整改要求1（撤销或轮换已暴露凭证）：核对旧密码 `***REDACTED***` 失效证明（1.6 步骤）+ 密钥认证可用证明（1.7 步骤）。
- [ ] 整改要求2（完成历史风险处置）：核对历史重写结果（2.5 步骤零匹配）+ force push 结果（2.7 步骤）+ 已知风险记录（2.9 步骤）。
- [ ] 整改要求3（复核当前代码中的残留值）：核对 M2VerificationPage.tsx:33 安全定性结论（3.3 步骤六维度判定 + 风险等级 + 处理建议）。
- [ ] 整改要求4（提交可复核的整改报告）：核对整改报告四项必备内容（4.3 步骤）+ 报告不含敏感信息（4.4 步骤）+ 报告已提交至 GitHub（4.5 步骤）+ 整改提交 SHA（4.6 步骤）。

### 7.2 交付物清单确认

- [ ] 交付物1：SSH 密钥认证配置（192.168.2.3 已配置为仅允许密钥认证，旧密码已失效）
- [ ] 交付物2：SSH 密钥对（公钥已部署至服务器，私钥由执行者持有不落盘）
- [ ] 交付物3：重写后的 git 历史（所有提交中明文密码已清除，远程仓库历史已更新）
- [ ] 交付物4：历史重写已知风险记录（RISK-01 SHA 引用失效 + RISK-02 远端副本风险）
- [ ] 交付物5：M2VerificationPage.tsx 拋留值安全定性结论（六维度判定 + 风险等级 + 处理建议）
- [ ] 交付物6：整改报告文档（`docs/p0-02-r3/evidence/cred-closure-evidence.md`）
- [ ] 交付物7：整改提交 SHA（完整 SHA 供 PM 第八次复审核对）

### 7.3 通知 PM 执行第八次复审

- [ ] 确认所有任务（1-6）已完成，所有验收条件已满足。
- [ ] 通知 PM 执行 P0-02 Final Gate 第八次复审，提供整改报告路径与提交 SHA。

---

## 验收标准汇总表

| 验收编号 | 所属模块 | 验收条件 | 验证方式 | 对应 EARS 规则 |
|---------|---------|---------|---------|--------------|
| AC-A-01 | 模块A | 旧密码 `***REDACTED***` 无法登录 192.168.2.3 | plink -pw 登录返回认证失败，退出码非 0 | spec 5.1.1 规则3 |
| AC-A-02 | 模块A | SSH 私钥可正常登录 192.168.2.3 | plink -i 登录成功，退出码 0 | spec 5.1.1 规则4 |
| AC-A-03 | 模块A | SSH hostkey 保持不变 | hostkey 仍为 `SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY` | spec 5.1.1 规则6 |
| AC-A-04 | 模块A | SSH 私钥未落盘 | 全文搜索仓库不含私钥内容 | spec 5.1.1 规则5 |
| AC-A-05 | 模块A | 编译流程密钥认证可用 | 编译/部署连通性测试通过 | spec 4.5 兼容性1 |
| AC-B-01 | 模块B | `git log --all -S "***REDACTED***"` 零匹配 | 命令无输出 | spec 5.2.1 规则1 |
| AC-B-02 | 模块B | `git log --all -G "***REDACTED***"` 零匹配 | 命令无输出 | spec 5.2.1 规则1 |
| AC-B-03 | 模块B | GitHub 远程 main 分支历史已更新 | force push 成功，远程零明文 | spec 5.2.1 规则2 |
| AC-B-04 | 模块B | 11 个暴露提交全部覆盖 | 每个提交明文已替换 | spec 5.2.1 规则3 |
| AC-B-05 | 模块B | 已知风险已记录 | 报告含 RISK-01 + RISK-02 | spec 5.2.1 规则4 |
| AC-B-06 | 模块B | 仓库备份已创建 | 备份文件存在且完整 | spec 5.2.1 规则6 |
| AC-C-01 | 模块C | 安全定性结论含六维度判定 | 报告含六维度判定结果 | spec 5.3.1 规则2 |
| AC-C-02 | 模块C | M2VerificationPage.tsx 不变 | git diff 零变更 | spec 5.3.1 规则3 |
| AC-C-03 | 模块C | 定性结论已记录至报告 | 报告含定性结论 | spec 5.3.1 规则4 |
| AC-C-04 | 模块C | 定性基于代码上下文 | 结论含分析依据 | spec 5.3.1 规则5 |
| AC-D-01 | 模块D | 报告归档至指定路径 | `docs/p0-02-r3/evidence/cred-closure-evidence.md` 存在 | spec 5.4.1 规则7 |
| AC-D-02 | 模块D | 报告含四项必备内容 | 旧凭证失效+历史处置+当前扫描+访问控制 | spec 5.4.1 规则1 |
| AC-D-03 | 模块D | 报告含残留值定性结论 | 报告含定性结论章节 | spec 5.4.1 规则6 |
| AC-D-04 | 模块D | 报告不含敏感信息 | 全文搜索无私钥/新密码 | spec 5.4.1 规则9 |
| AC-D-05 | 模块D | 报告已提交至 GitHub | main 分支含报告提交，SHA 完整 | spec 5.4.1 规则8 |
| AC-D-06 | 模块D | 仓库当前版本零明文 | 全文扫描仅 M2VerificationPage.tsx 拦留 | spec 4.3 安全性4 |

---

## 风险与异常处理汇总表

| 风险/异常编号 | 所属模块 | 类型 | 触发条件 | 处理策略 | 回滚方案 |
|--------------|---------|------|---------|---------|---------|
| A-EX-01 | 模块A | 异常 | ssh-keygen 失败（磁盘/权限） | 排查磁盘空间/权限，重新生成 | 无需回滚（密钥未生成） |
| A-EX-02 | 模块A | 异常 | 公钥部署失败（旧密码登录失败/权限不足） | 检查旧密码有效性、authorized_keys 权限 | 无需回滚（公钥未部署） |
| A-EX-03 | 模块A | 异常 | sshd_config 修改权限不足 | 联系服务器管理员执行 | 无需回滚（配置未修改） |
| A-EX-04 | 模块A | 异常 | sshd 重启失败 | 检查 sshd_config 语法（sshd -t），修复后重启 | 恢复 sshd_config 原配置 |
| A-EX-05 | 模块A | 异常 | 旧密码仍可登录（配置未生效） | 排查 sshd 状态、PAM 认证覆盖、多 sshd 实例 | 恢复 sshd_config 原配置 |
| A-EX-06 | 模块A | 异常 | 密钥登录失败 | 排查 authorized_keys/权限/sshd_config | 恢复 sshd_config 原配置 |
| A-EX-07 | 模块A | 异常 | 编译流程因认证变更中断 | 将脚本改为密钥认证，验证恢复 | 恢复 sshd_config 原配置 |
| B-EX-01 | 模块B | 异常 | git filter-repo 未安装 | 执行 pip install git-filter-repo | 无需回滚 |
| B-EX-02 | 模块B | 异常 | 替换规则文件格式错误 | 修正规则文件格式 | 从备份恢复仓库 |
| B-EX-03 | 模块B | 异常 | 仓库状态异常 | 从备份恢复仓库后重新执行 | 从备份恢复仓库 |
| B-EX-04 | 模块B | 异常 | 重写后仍有明文残留 | 补充替换规则，从备份恢复后重新执行 | 从备份恢复仓库 |
| B-EX-05 | 模块B | 异常 | force push 被分支保护拒绝 | 临时关闭分支保护或联系管理员放行 | 无需回滚（本地已重写） |
| B-EX-06 | 模块B | 异常 | force push 后仓库状态异常 | 从备份恢复仓库，重新执行 | 从备份恢复仓库 |
| C-EX-01 | 模块C | 异常 | 文件不可读 | 检查文件路径与权限 | 无需回滚（只读操作） |
| C-EX-02 | 模块C | 异常 | 上下文不足以判定性质 | 标注"性质待定"，建议后续分析 | 无需回滚 |
| C-EX-03 | 模块C | 异常 | 判定为生产凭证 | 标注高风险，建议后续 PM 授权后修改 | 无需回滚（不修改代码） |
| D-EX-01 | 模块D | 异常 | 推送失败 | 重试推送，检查网络与认证 | 无需回滚（本地已提交） |
| D-EX-02 | 模块D | 异常 | 报告缺失必备内容 | 补充缺失内容，重新提交 | 修改报告后重新提交 |
| D-EX-03 | 模块D | 异常 | 报告包含敏感信息 | 删除敏感信息，重新提交，评估是否需再次轮换 | 删除敏感信息后重新提交 |
| D-EX-04 | 模块D | 异常 | 报告与实际不符 | 重新执行相关整改任务，更新报告 | 视具体不符项回滚对应模块 |
| RISK-01 | 模块B | 已知风险 | SHA 引用失效 | 识别受影响引用位置，记录至报告，本轮不更新引用 | 不回滚（由仓库所有者决定后续处置） |
| RISK-02 | 模块B | 已知风险 | 远端副本可能已存在 | 记录至报告，旧密码已失效故历史明文不可利用 | 不回滚（force push 无法撤回他人副本） |

---

## 交付物清单

| 交付物编号 | 交付物名称 | 归档路径/位置 | 说明 |
|-----------|-----------|-------------|------|
| DEL-01 | SSH 密钥认证配置 | 远程服务器 192.168.2.3 sshd_config | PasswordAuthentication no, PubkeyAuthentication yes |
| DEL-02 | SSH 密钥对（公钥） | 192.168.2.3:~/.ssh/authorized_keys | 公钥已部署，权限 600 |
| DEL-03 | SSH 密钥对（私钥） | 整改执行者持有（不落盘） | 私钥不写入仓库/文档/日志 |
| DEL-04 | 重写后的 git 历史 | GitHub 远程仓库 main 分支 | 所有提交明文已清除 |
| DEL-05 | 仓库备份 | repo-backup-before-rewrite.tar.gz | 重写前备份，可用于回滚 |
| DEL-06 | 已知风险记录 | 整改报告 RISK-01 + RISK-02 | SHA 引用失效 + 远端副本风险 |
| DEL-07 | 拋留值安全定性结论 | 整改报告章节5 | 六维度判定 + 风险等级 + 处理建议 |
| DEL-08 | 整改报告文档 | `docs/p0-02-r3/evidence/cred-closure-evidence.md` | PM 四项必备内容 + 定性结论 + SHA |
| DEL-09 | 整改提交 SHA | GitHub main 分支最新提交 | 完整 SHA 供 PM 第八次复审核对 |
| DEL-10 | 实现方案文档 | `docs/p0-02-r3/cred-closure-design.md` | 已存在，随报告一并提交 |
| DEL-11 | 任务规划文档 | `docs/p0-02-r3/cred-closure-tasks.md` | 本文档，随报告一并提交 |

---

## 任务依赖关系与执行顺序

```
任务1（模块A：SSH 密钥认证切换）
  │
  ├── 1.1 前置确认
  ├── 1.2 生成密钥对
  ├── 1.3 部署公钥
  ├── 1.4 修改 sshd_config
  ├── 1.5 重启 sshd
  ├── 1.6 验证旧密码失效 ← 产出旧凭证失效证明
  ├── 1.7 验证密钥登录 ← 产出访问控制验证
  ├── 1.8 验证 hostkey 不变
  ├── 1.9 验证编译流程兼容
  └── 1.10 模块A 验收
  │
  ▼ （时序约束 TO-1：旧密码失效后才可 force push）
任务2（模块B：git filter-repo 历史重写）
  │
  ├── 2.1 前置确认（依赖 1.6 完成）
  ├── 2.2 创建仓库备份
  ├── 2.3 准备替换规则
  ├── 2.4 执行 filter-repo
  ├── 2.5 验证历史明文清除 ← 产出当前版本扫描结果
  ├── 2.6 识别旧 SHA 引用
  ├── 2.7 force push ← 产出历史暴露处置结论
  ├── 2.8 验证远程历史
  ├── 2.9 记录已知风险 ← 产出 RISK-01 + RISK-02
  └── 2.10 模块B 验收
  │
  ▼ （时序约束 TO-3：只读操作，可在任一阶段执行）
任务3（模块C：残留值安全定性）
  │
  ├── 3.1 前置确认
  ├── 3.2 读取代码上下文
  ├── 3.3 六维度判定 ← 产出残留值定性结论
  ├── 3.4 确认代码不变更
  ├── 3.5 定性结论记录
  └── 3.6 模块C 验收
  │
  ▼ （时序约束 TO-2/TO-4：报告须含历史重写结果与定性结论）
任务4（模块D：整改报告归档）
  │
  ├── 4.1 前置确认（依赖 1.10 + 2.10 + 3.6 完成）
  ├── 4.2 汇总四项结论
  ├── 4.3 编写报告文档
  ├── 4.4 验证不含敏感信息
  ├── 4.5 git 提交推送
  ├── 4.6 记录提交 SHA
  ├── 4.7 推送后验证
  └── 4.8 模块D 验收
  │
  ▼
任务5（集成验证）→ 任务6（风险处置确认）→ 任务7（PM 第八次复审核对）
```

**执行顺序**：任务1 → 任务2 → 任务3 → 任务4 → 任务5 → 任务6 → 任务7（严格串行）

---

## 约束遵守确认

| 约束项 | 本任务规划遵守状态 | 说明 |
|--------|------------------|------|
| 不修改 SmbPlugin.ts | ✅ 遵守 | 本任务规划不涉及 SmbPlugin.ts 修改 |
| 不修改 M2VerificationPage.tsx 代码 | ✅ 遵守 | 任务3 仅安全定性（git diff 零变更），不修改代码 |
| 不重做五项补验 | ✅ 遵守 | 本任务规划仅处理凭证安全闭环四项最小整改 |
| 不扩大验收范围 | ✅ 遵守 | 仅处理 P0-02-GATE-SEC-01 阻断项 |
| 严格时序：SSH 密钥认证 → 历史重写 → 报告提交 | ✅ 遵守 | 时序约束 TO-1/TO-2/TO-5 强制串行执行 |
| 旧密码统一用 `***REDACTED***` 脱敏表示 | ✅ 遵守 | 所有命令与旧密码均用 `***REDACTED***` 表示 |
| SSH 私钥不落盘 | ✅ 遵守 | 私钥由执行者持有，不写入仓库/文档/日志/提交信息 |
| 整改报告含四项必备内容 | ✅ 遵守 | 任务4 报告结构按 PM 四项要求设计 |
| 已知风险必须记录 | ✅ 遵守 | RISK-01（SHA 引用失效）+ RISK-02（远端副本风险）记录至报告 |

---

> **任务规划完成声明**：本任务规划基于 `.codeartsdoer/specs/p002_cred_closure/spec.md` 需求规格（36 条 EARS 规则 + 19 异常场景）与 `docs/p0-02-r3/cred-closure-design.md` 实现方案（10 个 PlantUML 图、四模块技术方案），覆盖 PM 第七次复审四项最小整改要求，分解为 7 个任务组、40 个步骤级子任务，包含验收标准汇总表（21 条验收条件）、风险与异常处理汇总表（21 项）、交付物清单（11 项）、任务依赖关系图与约束遵守确认。整改完成后进入 P0-02 Final Gate 第八次复审。
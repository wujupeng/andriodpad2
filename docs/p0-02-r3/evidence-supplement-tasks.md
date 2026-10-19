# P0-02 Final Gate 证据补齐任务清单

> 本任务清单基于 `docs/p0-02-r3/evidence-supplement-spec.md`（10 条 EARS 验收标准 EV-01～EV-10）与 `docs/p0-02-r3/evidence-supplement-design.md`（任务1～任务4 执行步骤详述）生成。
>
> **任务性质**：证据收集与归档（非代码开发），不修改任何 `.ts` / `.tsx` / `.java` 源文件。
> **基线提交**：`7e81fa9`（代码修复）+ `dfbb5f2`（补验报告）。
> **执行环境**：Windows + Git Bash + plink + adb.exe + sha256sum + git。
> **远程服务器**：192.168.2.3（debian/***REDACTED***），SSH hostkey `SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY`，SMB 共享 `/mnt/share`。
> **测试设备**：HONOR NDL2_W09，serial `AJ7XJV6904H00320`，Android 16，API 36。
> **ADB 路径**：`C:\Program Files (x86)\Android\android-sdk\platform-tools\adb.exe`。
> **期望 APK SHA-256**：`eed3bf2cbf1b182b4dca93bd188d8d10a65eee5daf0ce0f248fd29cb7dad3a61`。
> **证据归档目录**：`docs/p0-02-r3/evidence/`。
> **公共参数约束**：所有 plink 命令必须带 `-pw ***REDACTED*** -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY"`；Git Bash 下涉及远端路径的命令必须带 `MSYS_NO_PATHCONV=1` 前缀防止路径转译。

---

## 1. 验证执行环境就绪

> 对应 design.md 2.4 前置条件；确认远程服务器、测试设备、本机截图文件、证据目录均可用，避免后续步骤中途失败。

### 1.1 验证远程服务器 SSH 可达
- [ ] 执行 `plink -ssh -pw ***REDACTED*** -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY" debian@192.168.2.3 "echo SSH_OK && date -Iseconds"`，确认输出包含 `SSH_OK` 且返回 ISO8601 时间戳，退出码=0
  - **预期输出**：`SSH_OK` + 远端时间戳，退出码 0
  - **验收条件**：退出码=0 且输出含 `SSH_OK`；若退出码=255 记录 SSH 连接失败并排查网络/hostkey
  - **依赖**：无
  - **验收标准映射**：前置条件

### 1.2 验证测试设备 ADB 连接
- [ ] 执行 `adb -s AJ7XJV6904H00320 shell getprop ro.product.model`，确认输出为 `NDL2_W09`，退出码=0
  - **预期输出**：`NDL2_W09`，退出码 0
  - **验收条件**：退出码=0 且输出含 `NDL2_W09`；若返回 `device not found` 记录设备未连接并检查 USB
  - **依赖**：无
  - **验收标准映射**：前置条件

### 1.3 验证本机根目录截图文件存在
- [ ] 执行 `ls -l verify-autotest-before-saveas.png verify-autotest-saveas-detected.png verify-autotest-after-overwrite.png verify-autotest-after-discard.png`，确认 4 个文件均存在且非空
  - **预期输出**：4 行文件清单，字节数 > 0
  - **验收条件**：4 个 PNG 文件均存在且字节数 > 0；缺失文件需重新执行对应测试场景截图
  - **依赖**：无
  - **验收标准映射**：前置条件

### 1.4 验证证据归档目录存在
- [ ] 执行 `ls -d docs/p0-02-r3/evidence/`，确认目录存在；若不存在则执行 `mkdir -p docs/p0-02-r3/evidence/` 创建
  - **预期输出**：目录路径回显或创建成功
  - **验收条件**：`docs/p0-02-r3/evidence/` 目录存在且可写
  - **依赖**：无
  - **验收标准映射**：前置条件

---

## 2. 收集远端与设备文件操作原始执行证据

> 对应 spec.md 5.1（EV-01～EV-04）与 design.md 2.4.1（步骤1.0～1.7）；通过 plink 和 adb shell 执行真实文件操作命令，捕获命令全文、退出码、时间戳、操作前后 SHA-256，写入 `file-operation-raw-log.txt`。

### 2.1 初始化原始执行日志文件
- [ ] 创建 `docs/p0-02-r3/evidence/file-operation-raw-log.txt`，写入头部元信息（任务名、执行者、执行环境、规格引用、创建时间 ISO8601+08:00）和远端段落标题
  - **涉及文件**：`docs/p0-02-r3/evidence/file-operation-raw-log.txt`
  - **验收条件**：文件存在且头部包含任务名、执行环境、创建时间戳、规格引用 `evidence-supplement-spec.md 5.1`
  - **依赖**：1.4
  - **验收标准映射**：EV-01

### 2.2 执行远端操作前 SHA-256 查询
- [ ] 执行 `MSYS_NO_PATHCONV=1 plink -ssh -pw ***REDACTED*** -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY" debian@192.168.2.3 "sha256sum /mnt/share/p0-02-saveas-reachable.txt"`，记录时间戳 T0、命令全文、退出码、标准输出+标准错误到 `file-operation-raw-log.txt`，提取 `SHA_BEFORE_REMOTE`
  - **涉及文件**：`docs/p0-02-r3/evidence/file-operation-raw-log.txt`
  - **预期输出**：`<64位hex>  /mnt/share/p0-02-saveas-reachable.txt` 或 `sha256sum: ...: No such file`（退出码=1）
  - **验收条件**：日志包含命令全文 + 退出码 + ISO8601 时间戳 T0 + 输出；文件不存在时记录 `SHA_BEFORE_REMOTE=NOT_EXIST` 并继续
  - **依赖**：2.1
  - **验收标准映射**：EV-01, EV-03

### 2.3 执行远端文件写入命令
- [ ] 执行 `MSYS_NO_PATHCONV=1 plink -ssh -pw ***REDACTED*** -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY" debian@192.168.2.3 "printf '%s' 'SAVEAS CANDIDATE R3 CONTENT' > /mnt/share/p0-02-saveas-reachable.txt"`，记录时间戳 T1、命令全文、退出码、输出到日志
  - **涉及文件**：`docs/p0-02-r3/evidence/file-operation-raw-log.txt`
  - **预期输出**：空输出，退出码 0
  - **验收条件**：退出码=0；命令记录中重定向符 `>` 必须在 SSH 双引号内部（禁止 `plink ... echo '...' > /remote/path` 形式）
  - **依赖**：2.2
  - **验收标准映射**：EV-01, EV-04

### 2.4 执行远端操作后 SHA-256 查询并比对
- [ ] 再次执行步骤 2.2 的 sha256sum 命令，记录时间戳 T2、输出，提取 `SHA_AFTER_REMOTE`；在日志中写入比对结论 `REMOTE_FILE_CHANGED=<PASS|FAIL>`（`SHA_BEFORE_REMOTE != SHA_AFTER_REMOTE` 为 PASS）
  - **涉及文件**：`docs/p0-02-r3/evidence/file-operation-raw-log.txt`
  - **预期输出**：`<64位hex>  /mnt/share/p0-02-saveas-reachable.txt`，退出码 0
  - **验收条件**：`SHA_AFTER_REMOTE` 为完整 64 位十六进制；`SHA_BEFORE_REMOTE != SHA_AFTER_REMOTE` 时 `REMOTE_FILE_CHANGED=PASS`
  - **依赖**：2.3
  - **验收标准映射**：EV-03

### 2.5 执行设备端操作前 SHA-256 查询
- [ ] 在日志中写入设备端段落标题；执行 `MSYS_NO_PATHCONV=1 adb -s AJ7XJV6904H00320 shell "sha256sum /storage/emulated/0/p0-02-saveas-reachable.docx"`，记录时间戳 T3、命令全文、退出码、输出，提取 `SHA_BEFORE_DEVICE`
  - **涉及文件**：`docs/p0-02-r3/evidence/file-operation-raw-log.txt`
  - **预期输出**：`<64位hex>  /storage/emulated/0/p0-02-saveas-reachable.docx` 或文件不存在错误
  - **验收条件**：日志包含命令全文 + 退出码 + 时间戳 T3 + 输出；文件不存在时记录 `SHA_BEFORE_DEVICE=NOT_EXIST`
  - **依赖**：2.4
  - **验收标准映射**：EV-02, EV-03

### 2.6 执行设备端文件写入命令
- [ ] 执行 `MSYS_NO_PATHCONV=1 adb -s AJ7XJV6904H00320 shell "printf '%s' 'DISCARD TEST CONTENT' > /storage/emulated/0/p0-02-saveas-reachable.docx"`，记录时间戳 T4、命令全文、退出码、输出到日志
  - **涉及文件**：`docs/p0-02-r3/evidence/file-operation-raw-log.txt`
  - **预期输出**：空输出，退出码 0
  - **验收条件**：退出码=0；命令记录中重定向符 `>` 必须在 ADB 双引号内部（禁止 `adb shell echo '...' > /device/path` 形式）
  - **依赖**：2.5
  - **验收标准映射**：EV-02, EV-04

### 2.7 执行设备端操作后 SHA-256 查询并比对
- [ ] 再次执行步骤 2.5 的 sha256sum 命令，记录时间戳 T5、输出，提取 `SHA_AFTER_DEVICE`；在日志中写入比对结论 `DEVICE_FILE_CHANGED=<PASS|FAIL>`
  - **涉及文件**：`docs/p0-02-r3/evidence/file-operation-raw-log.txt`
  - **预期输出**：`<64位hex>  /storage/emulated/0/p0-02-saveas-reachable.docx`，退出码 0
  - **验收条件**：`SHA_AFTER_DEVICE` 为完整 64 位十六进制；`SHA_BEFORE_DEVICE != SHA_AFTER_DEVICE` 时 `DEVICE_FILE_CHANGED=PASS`
  - **依赖**：2.6
  - **验收标准映射**：EV-03

### 2.8 写入日志尾部汇总
- [ ] 在 `file-operation-raw-log.txt` 末尾写入汇总段落，包含远端文件变化结论、设备文件变化结论、重定向位置核验结论（所有 `>` 均在 SSH/ADB 引号内部 ✓）、任务1 总体结论
  - **涉及文件**：`docs/p0-02-r3/evidence/file-operation-raw-log.txt`
  - **验收条件**：汇总段含 `REMOTE_FILE_CHANGED`、`DEVICE_FILE_CHANGED`、重定向核验 ✓、任务1结论；任务1结论=PASS 当且仅当远端和设备文件变化均为 PASS 且重定向核验通过
  - **依赖**：2.7
  - **验收标准映射**：EV-01, EV-02, EV-03, EV-04

---

## 3. 归档截图证据

> 对应 spec.md 5.2（EV-05～EV-07）与 design.md 2.4.2（步骤2.1～2.3）；将本机根目录 4 个 `verify-autotest-*.png` 复制到 `evidence/` 目录，处理 `panel-visible` 缺失替代。

### 3.1 复制 verify-autotest 系列截图到 evidence 目录
- [ ] 执行 `cp verify-autotest-before-saveas.png docs/p0-02-r3/evidence/`、`cp verify-autotest-saveas-detected.png docs/p0-02-r3/evidence/`、`cp verify-autotest-after-overwrite.png docs/p0-02-r3/evidence/`、`cp verify-autotest-after-discard.png docs/p0-02-r3/evidence/`，确认 4 个文件复制成功
  - **涉及文件**：`docs/p0-02-r3/evidence/verify-autotest-before-saveas.png`、`verify-autotest-saveas-detected.png`、`verify-autotest-after-overwrite.png`、`verify-autotest-after-discard.png`
  - **验收条件**：`evidence/` 目录下出现 4 个同名 PNG 文件，字节数与本机根目录源文件一致
  - **依赖**：1.3, 1.4
  - **验收标准映射**：EV-05, EV-06

### 3.2 处理 panel-visible 截图缺失替代
- [ ] 执行 `cp verify-autotest-saveas-detected.png docs/p0-02-r3/evidence/verify-autotest-panel-visible.png`，在后续汇总报告中标注 `verify-autotest-panel-visible.png` 由 `verify-autotest-saveas-detected.png` 替代（saveas 检测面板出现即按钮可见状态）
  - **涉及文件**：`docs/p0-02-r3/evidence/verify-autotest-panel-visible.png`
  - **验收条件**：`evidence/verify-autotest-panel-visible.png` 存在；汇总报告中标注替代关系
  - **依赖**：3.1
  - **验收标准映射**：EV-07

### 3.3 验证截图文件名与报告引用一致
- [ ] 遍历 `docs/p0-02-r3/test-report.md` 中所有 `.png` 引用（共 8 处），逐一确认 `docs/p0-02-r3/evidence/` 或 `evidence/real-interaction/` 中存在同名文件
  - **验收条件**：8 处引用全部可解析；`screenshot_*` 系列 4 个在 `real-interaction/` 已存在，`verify-autotest_*` 系列 4 个在 `evidence/` 已存在（含 panel-visible 替代）
  - **依赖**：3.2
  - **验收标准映射**：EV-06

---

## 4. 核验 APK 身份

> 对应 spec.md 5.3（EV-08～EV-10）与 design.md 2.4.3（步骤3.0～3.5）；从设备提取已安装 APK，计算 SHA-256，与期望值 `eed3bf2c...dad3a61` 逐字符比对。

### 4.1 初始化 APK 核验记录文件
- [ ] 创建 `docs/p0-02-r3/evidence/apk-identity-verification.txt`，写入头部元信息（任务名、执行环境、期望 APK SHA-256、规格引用、创建时间 ISO8601+08:00）
  - **涉及文件**：`docs/p0-02-r3/evidence/apk-identity-verification.txt`
  - **验收条件**：文件存在且头部包含期望哈希值 `eed3bf2cbf1b182b4dca93bd188d8d10a65eee5daf0ce0f248fd29cb7dad3a61`、创建时间戳、规格引用 `evidence-supplement-spec.md 5.3`
  - **依赖**：1.4
  - **验收标准映射**：EV-08

### 4.2 获取设备已安装 APK 路径
- [ ] 执行 `MSYS_NO_PATHCONV=1 adb -s AJ7XJV6904H00320 shell pm path com.pad2.filemanager`，记录时间戳 T6、命令、退出码、输出到 `apk-identity-verification.txt`，从输出 `package:/data/app/.../base.apk` 中提取 `APK_PATH`
  - **涉及文件**：`docs/p0-02-r3/evidence/apk-identity-verification.txt`
  - **预期输出**：`package:/data/app/.../base.apk`，退出码 0
  - **验收条件**：输出含 `package:` 前缀且提取到 APK_PATH；输出为空时标注"应用未安装"并终止任务3
  - **依赖**：4.1
  - **验收标准映射**：EV-08

### 4.3 拉取 APK 到本机并计算 SHA-256
- [ ] 执行 `MSYS_NO_PATHCONV=1 adb -s AJ7XJV6904H00320 pull <APK_PATH> ./device-installed.apk`，记录拉取结果；若成功执行 `sha256sum ./device-installed.apk` 计算 `DEVICE_APK_SHA256`；若 pull 失败（权限不足）改用备选 `MSYS_NO_PATHCONV=1 adb -s AJ7XJV6904H00320 shell sha256sum <APK_PATH>` 在设备端直接计算
  - **涉及文件**：`docs/p0-02-r3/evidence/apk-identity-verification.txt`
  - **预期输出**：拉取成功 + `sha256sum` 输出 `<64位hex>  ./device-installed.apk`
  - **验收条件**：`DEVICE_APK_SHA256` 为完整 64 位十六进制小写字符串；备选方案在日志中标注"adb pull 失败，改用设备端 sha256sum"
  - **依赖**：4.2
  - **验收标准映射**：EV-08

### 4.4 比对设备 APK 哈希与期望值
- [ ] 在 `apk-identity-verification.txt` 中写入比对段落，记录时间戳 T8、`DEVICE_APK_SHA256`、期望值 `eed3bf2cbf1b182b4dca93bd188d8d10a65eee5daf0ce0f248fd29cb7dad3a61`、逐字符比对结论 `VERDICT=<PASS|MISMATCH>`
  - **涉及文件**：`docs/p0-02-r3/evidence/apk-identity-verification.txt`
  - **验收条件**：两值完全匹配时 `VERDICT=PASS`；不匹配时 `VERDICT=MISMATCH` 并记录两个完整哈希值；比对结论禁止留空
  - **依赖**：4.3
  - **验收标准映射**：EV-09, EV-10

### 4.5 清理临时文件
- [ ] 执行 `rm -f ./device-installed.apk` 删除本机临时 APK 文件
  - **验收条件**：`./device-installed.apk` 不存在；核验记录文件保留完整
  - **依赖**：4.4
  - **验收标准映射**：无（清理操作）

---

## 5. 汇总证据并提交 Git 仓库

> 对应 design.md 2.4.4（步骤4.1～4.6）；生成汇总报告，将全部证据文件提交到 Git 仓库 main 分支。

### 5.1 生成证据补齐汇总报告
- [ ] 创建 `docs/p0-02-r3/evidence-supplement-report.md`，包含三项任务结论汇总表（任务1/2/3 结论 + 证据项清单）、证据项对照表（E1-E20 逐项标注 PASS/FAIL）、Git 提交 SHA 占位符（提交后回填）、Git 提交变更清单占位符、panel-visible 替代说明
  - **涉及文件**：`docs/p0-02-r3/evidence-supplement-report.md`
  - **验收条件**：报告含三项任务结论表、E1-E20 证据项对照表、panel-visible 替代说明；Git 提交 SHA 占位待回填
  - **依赖**：2.8, 3.3, 4.5
  - **验收标准映射**：E19, E20

### 5.2 添加证据文件到 Git 暂存区
- [ ] 执行 `git add docs/p0-02-r3/evidence/file-operation-raw-log.txt docs/p0-02-r3/evidence/apk-identity-verification.txt docs/p0-02-r3/evidence/verify-autotest-before-saveas.png docs/p0-02-r3/evidence/verify-autotest-saveas-detected.png docs/p0-02-r3/evidence/verify-autotest-after-overwrite.png docs/p0-02-r3/evidence/verify-autotest-after-discard.png docs/p0-02-r3/evidence/verify-autotest-panel-visible.png docs/p0-02-r3/evidence-supplement-spec.md docs/p0-02-r3/evidence-supplement-design.md docs/p0-02-r3/evidence-supplement-tasks.md docs/p0-02-r3/evidence-supplement-report.md`
  - **验收条件**：`git status` 显示上述文件均已暂存；无未暂存的证据 PNG 文件
  - **依赖**：5.1
  - **验收标准映射**：EV-05

### 5.3 创建 Git 提交
- [ ] 执行 `git commit -m "docs(P0-02): 补齐Final Gate三项证据 - 原始执行日志+截图归档+APK哈希核验"`，记录提交 SHA
  - **验收条件**：提交成功，`git log -1` 显示提交消息完整；提交 SHA 为 40 位十六进制
  - **依赖**：5.2
  - **验收标准映射**：E19

### 5.4 回填提交 SHA 到汇总报告
- [ ] 执行 `COMMIT_SHA=$(git rev-parse HEAD)` 获取提交 SHA，将 `COMMIT_SHA` 和 `git show --stat HEAD` 变更清单写入 `evidence-supplement-report.md` 对应占位符，执行 `git add docs/p0-02-r3/evidence-supplement-report.md && git commit --amend --no-edit` 补充提交
  - **涉及文件**：`docs/p0-02-r3/evidence-supplement-report.md`
  - **验收条件**：汇总报告含实际提交 SHA（40 位 hex）和完整变更清单；amend 提交成功
  - **依赖**：5.3
  - **验收标准映射**：E19, E20

### 5.5 推送到远程仓库
- [ ] 执行 `git push origin main`，将证据补齐提交推送到 `https://github.com/wujupeng/andriodpad2.git` main 分支
  - **验收条件**：push 退出码=0；`git log origin/main -1` 与本地 HEAD 一致；push 失败时记录错误并提示检查网络/权限（证据已本地提交）
  - **依赖**：5.4
  - **验收标准映射**：E19

---

## 6. 验证证据闭环

> 对应 design.md 2.7 验收对照；最终验证确保三项证据全部闭环且可被 PM 审查。

### 6.1 验证 Git 提交变更清单包含所有证据文件
- [ ] 执行 `git show --stat HEAD`，确认变更清单包含 `file-operation-raw-log.txt`、`apk-identity-verification.txt`、5 个 `verify-autotest-*.png`、`evidence-supplement-report.md`、`evidence-supplement-design.md`、`evidence-supplement-spec.md`、`evidence-supplement-tasks.md`
  - **验收条件**：变更清单包含全部预期新增文件；无遗漏
  - **依赖**：5.5
  - **验收标准映射**：EV-05, E20

### 6.2 验证测试报告截图引用全部可解析
- [ ] 遍历 `docs/p0-02-r3/test-report.md` 中 8 处 `.png` 引用，逐一确认仓库中存在对应文件（`screenshot_*` 在 `evidence/real-interaction/`，`verify-autotest_*` 在 `evidence/`）
  - **验收条件**：8 处引用全部可解析，无悬空引用
  - **依赖**：6.1
  - **验收标准映射**：EV-06

### 6.3 验证三项证据结论均为 PASS
- [ ] 检查 `file-operation-raw-log.txt` 中 `REMOTE_FILE_CHANGED=PASS` 且 `DEVICE_FILE_CHANGED=PASS` 且重定向核验 ✓；检查 `apk-identity-verification.txt` 中 `VERDICT=PASS`；检查 `evidence-supplement-report.md` 中任务1/2/3 结论均为 PASS
  - **验收条件**：三项证据结论均为 PASS；任一为 FAIL 或 MISMATCH 时标注对应缺口并通知 PM
  - **依赖**：6.2
  - **验收标准映射**：EV-03, EV-09

### 6.4 验证重定向符均在 SSH/ADB 引号内
- [ ] 审查 `file-operation-raw-log.txt` 中所有远端和设备端写入命令记录，确认重定向符 `>` 均在 SSH/ADB 双引号内部，无本机 shell 重定向形式
  - **验收条件**：所有写入命令的 `>` 在引号内；无 `plink ... echo '...' > /remote/path` 或 `adb shell echo '...' > /device/path` 形式
  - **依赖**：6.3
  - **验收标准映射**：EV-04

### 6.5 验证 SHA-256 值完整性与时间戳格式
- [ ] 检查 `file-operation-raw-log.txt` 和 `apk-identity-verification.txt` 中所有 SHA-256 值均为完整 64 位十六进制小写字符串（无截断），所有时间戳均为 ISO8601 格式且标注时区（+08:00）
  - **验收条件**：所有 SHA-256 值长度=64 且仅含 0-9/a-f；所有时间戳匹配 `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$`
  - **依赖**：6.4
  - **验收标准映射**：EV-03, EV-10

---

## 7. 交付确认

> 确认证据补齐交付物完整，可提交 PM Gate Review。

### 7.1 确认交付物清单完整
- [ ] 确认以下交付物均存在且已提交到 Git 仓库 main 分支：`evidence/file-operation-raw-log.txt`、`evidence/apk-identity-verification.txt`、`evidence/verify-autotest-*.png`（5 个）、`evidence-supplement-report.md`、`evidence-supplement-spec.md`、`evidence-supplement-design.md`、`evidence-supplement-tasks.md`
  - **验收条件**：交付物清单全部存在且已推送；`git status` 无未提交的证据文件
  - **依赖**：6.5
  - **验收标准映射**：全部

### 7.2 确认未修改源代码
- [ ] 执行 `git diff --stat 7e81fa9 HEAD -- android/ src/` 确认无源代码变更（仅 `docs/p0-02-r3/` 下文件变更）
  - **验收条件**：源代码目录无变更；变更仅限于 `docs/p0-02-r3/` 下的证据文件
  - **依赖**：7.1
  - **验收标准映射**：约束 9.1

### 7.3 申请 PM Gate Review
- [ ] 向 PM 提交证据补齐完成通知，附提交 SHA、变更清单链接、三项证据结论汇总，申请 P0-02 Final Gate 第六次复审
  - **验收条件**：PM 收到通知并确认收到全部证据材料；Gate Review 流程启动
  - **依赖**：7.2
  - **验收标准映射**：流程闭环
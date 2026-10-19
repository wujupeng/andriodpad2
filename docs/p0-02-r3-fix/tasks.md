# P0-02-R3-FIX 编码任务清单：Hash Assertion & Save-As Evidence Repair — 定向修复

> 本任务清单基于 `docs/p0-02-r3-fix/spec.md`（17 条验收标准）与 `docs/p0-02-r3-fix/design.md`（模块 L/M/N/O 设计）生成，遵从 PM Gate Review 裁定：P0-02-R3 = HOLD / TARGETED REPAIR，授权 P0-02-R3-FIX 定向修复。本修复为**文档与证据链定向修复**，不涉及任何 .java 代码修改。

> **前置基线**：
> - P0-02-R3 主体提交 SHA `2bf4cdf6a48972dec7db758526e1c8b2e2b41fb4`（已推送 GitHub，amend 后最终提交）。
> - P0-02-R3 补充提交 `60db452`（test-report.md SHA 更新，已推送）。
> - 报告中错误记录的 SHA `b987ceb6f1b55876a8814482e548e0cd53022464`（amend 前旧 SHA）。
> - APK SHA-256 `5e54360978399895b279f8b01217cf3275654b1b4f0911ffb808fdaa44cd95dc`（10,516,104 bytes）。
> - R3 测试结果 6/6 ALL PASSED（已有可靠证据支持的回归场景不重做）。
> - PM 裁定 P0-02-R3 = **HOLD / TARGETED REPAIR**，授权 P0-02-R3-FIX。

> **可修改文件**：`docs/p0-02-r3/test-report.md` + `docs/p0-02-r3/execution-log.md` + `docs/p0-02-r3-fix/*`；**不修改**任何 .java 代码文件与 `docs/p0-02-r1/test-report.md`。

> **修复对象性质声明**：本修复任务为**文档与证据链定向修复**，不涉及任何 .java 代码修改。R1RegressionTestSuite.java、RegressionTestConfig.java、WpsDeliveryHandler.java 等代码文件均不修改（R3 已授权的 WpsDeliveryHandler.java 哈希字段返回修改已在 R3 提交中完成，本次仅在审计结论中确认该修改处于授权范围内）。

> **远程编译环境**：编译服务器 192.168.2.3，用户名 debian，密码 ***REDACTED***，SSH hostkey `SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY`，项目路径 `/home/debian/android/android`，APK 分发目录 `/mnt/share/apk/`。plink/pscp 命令需带 `-pw ***REDACTED*** -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY"` 参数。

> **测试设备**：HONOR NDL2_W09, Android 16, API 36, serial AJ7XJV6904H00320；ADB 路径 `C:\Program Files (x86)\Android\android-sdk\platform-tools\adb.exe`；WPS 包名 `cn.wps.moffice_eng`；PAD2 UI 为 Capacitor WebView，通过 CDP WebSocket 执行 JavaScript 调用 Capacitor 插件方法。

> **GitHub 仓库**：https://github.com/wujupeng/andriodpad2

---

## 1. R3-FIX-01 统一版本证据

> 对应 design.md 模块 L（L1 + L2）；修复阻断项 A：报告 SHA 与申请验收的提交 SHA 不一致。明确 amend 前 SHA `b987ceb6...` 与 amend 后 SHA `2bf4cdf6...` 的对应关系，核对 APK SHA-256 `5e543609...` 确实由 `2bf4cdf6...` 编译产出，更新报告与日志记录真实构建提交 SHA、APK SHA-256、测试执行版本，附可核对构建与测试证据，不得只做字符串替换。

### 1.1 T01.1 核对 Git amend 关系与提交历史
- [ ] 执行 Git 命令核对 `b987ceb6...`（amend 前）、`2bf4cdf6...`（amend 后）、`60db452`（补充提交）三者的 amend 关系与提交历史
  - **涉及文件**：Git 仓库（https://github.com/wujupeng/andriodpad2）
  - **输入**：三个 SHA（`b987ceb6f1b55876a8814482e548e0cd53022464`、`2bf4cdf6a48972dec7db758526e1c8b2e2b41fb4`、`60db452`）
  - **输出**：amend 关系确认结论，含 amend 原因与 amend 前后代码差异说明
  - **实现要点**：
    - 执行 `git log --all --oneline -20` 查看提交历史，确认 amend 关系
    - 执行 `git show 2bf4cdf6 --stat` 获取实际修改文件清单
    - 执行 `git diff b987ceb6 2bf4cdf6` 获取 amend 前后代码差异
    - 记录 amend 原因（如修正提交信息或补充文件）
  - **验收条件**：明确 b987ceb6 为 amend 前 SHA、2bf4cdf6 为 amend 后最终提交，含 amend 原因与 amend 前后代码差异说明
  - **依赖**：无
  - **验收标准映射**：R3-FIX-01-AC-01

### 1.2 T01.2 核对 APK 构建过程
- [ ] 通过远程编译服务器编译日志与测试设备 adb 核对，确认 APK SHA-256 `5e543609...` 确实由提交 `2bf4cdf6...` 的源码编译产出
  - **涉及文件**：远程编译服务器（192.168.2.3）编译日志 + 测试设备（HONOR NDL2_W09）
  - **输入**：APK SHA-256 `5e54360978399895b279f8b01217cf3275654b1b4f0911ffb808fdaa44cd95dc`、构建提交 SHA `2bf4cdf6...`
  - **输出**：APK 构建核对结论，含构建提交 SHA、构建时间、APK SHA-256 核对结果
  - **实现要点**：
    - 通过 plink 连接远程编译服务器查询编译日志：`plink -pw ***REDACTED*** -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY" debian@192.168.2.3 "cat /home/debian/android/android/app/build/outputs/apk/release/output-metadata.json"`
    - 确认编译产出 APK SHA-256 == `5e543609...`
    - 通过 adb 核对安装 APK SHA-256：`"C:\Program Files (x86)\Android\android-sdk\platform-tools\adb.exe" -s AJ7XJV6904H00320 shell sha256sum /data/app/cn.wps.moffice_eng*/base.apk`
    - 确认安装 APK SHA-256 == 编译产出 APK SHA-256 == 报告记录 APK SHA-256
  - **验收条件**：APK SHA-256 5e543609... 由提交 2bf4cdf6... 的源码编译产出，构建日志可追溯；安装 APK SHA-256 与编译产出一致
  - **依赖**：T01.1
  - **验收标准映射**：R3-FIX-01-AC-02

### 1.3 T01.3 在 test-report.md 新增"版本证据链说明"章节
- [ ] 在 `docs/p0-02-r3/test-report.md` 新增"版本证据链说明"章节，明确 amend 关系、APK 构建核对、三者对应关系
  - **涉及文件**：`docs/p0-02-r3/test-report.md`
  - **输入**：T01.1 amend 关系核对结论 + T01.2 APK 构建核对结论
  - **输出**：test-report.md 含"版本证据链说明"章节
  - **实现要点**：
    - 新增章节"## 版本证据链说明"，含三个子节：
    - "### amend 关系"：记录 amend 前 SHA `b987ceb6...`、amend 后最终提交 SHA `2bf4cdf6...`、补充提交 SHA `60db452`、amend 原因、amend 前后代码差异说明
    - "### APK 构建核对"：记录 APK SHA-256 `5e543609...`、构建提交 SHA `2bf4cdf6...`、构建时间、核对结论（APK 确实由 2bf4cdf6... 编译产出）
    - "### 三者对应关系"：明确代码 SHA == 构建提交 SHA == APK 对应提交 SHA，核对结果为一致
    - 章节追加到已有章节之后，不修改已有章节内容
  - **验收条件**：test-report.md 含版本证据链说明章节，章节内容与实际 Git 历史、构建过程、测试执行过程相符；非仅字符串替换，含构建过程核对、APK SHA-256 核对、测试执行版本核对的完整证据
  - **依赖**：T01.1, T01.2
  - **验收标准映射**：R3-FIX-01-AC-01, R3-FIX-01-AC-03, R3-FIX-01-AC-05, R3-FIX-01-AC-06

### 1.4 T01.4 在 execution-log.md 新增"构建过程核对"章节
- [ ] 在 `docs/p0-02-r3/execution-log.md` 新增"构建过程核对"章节，记录真实构建提交 SHA、构建时间、APK SHA-256 核对结果
  - **涉及文件**：`docs/p0-02-r3/execution-log.md`
  - **输入**：T01.2 APK 构建核对结论
  - **输出**：execution-log.md 含"构建过程核对"章节
  - **实现要点**：
    - 新增章节"## 构建过程核对"，记录：
    - 真实构建提交 SHA：`2bf4cdf6a48972dec7db758526e1c8b2e2b41fb4`
    - 构建时间：[具体构建时间，从编译日志获取]
    - 编译命令：`./gradlew assembleRelease`
    - 编译产出 APK SHA-256：`5e54360978399895b279f8b01217cf3275654b1b4f0911ffb808fdaa44cd95dc`
    - 编译产出 APK 大小：10,516,104 bytes
    - 安装 APK SHA-256：`5e543609...`（通过 adb shell sha256sum 核对）
    - 编译日志路径：[编译日志可追溯路径]
    - 核对结论：编译产出 APK SHA-256 == 安装 APK SHA-256 == 报告记录 APK SHA-256，APK 确实由 2bf4cdf6... 编译产出
    - 章节追加到已有章节之后，不修改已有章节内容
  - **验收条件**：execution-log.md 含构建过程核对章节，章节内容与实际构建过程相符，与 test-report.md 版本证据链说明章节一致
  - **依赖**：T01.2
  - **验收标准映射**：R3-FIX-01-AC-04

### 1.5 T01.5 核对三者对应关系一致性
- [ ] 核对 test-report.md 代码 SHA == 实际提交 SHA == 构建提交 SHA == APK 对应提交 SHA，四者一致且可核对
  - **涉及文件**：`docs/p0-02-r3/test-report.md` + `docs/p0-02-r3/execution-log.md`
  - **输入**：T01.3 + T01.4 更新后的文档
  - **输出**：三者对应关系核对结论
  - **实现要点**：
    - 核对 test-report.md 代码 SHA（第 12 行）== `2bf4cdf6a48972dec7db758526e1c8b2e2b41fb4`
    - 核对实际提交 SHA（git log）== `2bf4cdf6a48972dec7db758526e1c8b2e2b41fb4`
    - 核对构建提交 SHA（execution-log.md 构建过程核对章节）== `2bf4cdf6a48972dec7db758526e1c8b2e2b41fb4`
    - 核对 APK 对应提交 SHA == `2bf4cdf6a48972dec7db758526e1c8b2e2b41fb4`
    - 确认四者一致，版本证据链统一可核对
  - **验收条件**：代码 SHA == 构建提交 SHA == APK 对应提交 SHA，三者一致且可核对；版本证据链统一可核对
  - **依赖**：T01.3, T01.4
  - **验收标准映射**：R3-FIX-01-AC-06

---

## 2. R3-FIX-02 补齐另存为决策与安全回退证据

> 对应 design.md 模块 M（M1 + M2 + M3 + M4 + M5）；修复阻断项 B：另存为测试证明了处理分支，不等于证明了完整真实业务链。明确区分自动化分支测试与真实用户交互，补齐安全回退四项完整证据，补充原文件保护证据，若无法完成真实 UI 操作如实标记为 UNVERIFIED，禁止把插件直接调用写成真实用户决策。

### 2.1 T02.1 在 test-report.md 场景 4 新增测试类型标注
- [ ] 在 `docs/p0-02-r3/test-report.md` 场景 4 save_as 证据中新增测试类型标注子章节，明确区分自动化分支测试与真实用户交互
  - **涉及文件**：`docs/p0-02-r3/test-report.md`（场景 4 证据部分）
  - **输入**：execution-log.md 步骤 5 的 CDP 调用记录
  - **输出**：场景 4 证据含测试类型标注
  - **实现要点**：
    - 在场景 4 证据中新增"**测试类型标注**"子章节：
    - 场景A 标注为"自动化分支测试"，说明 foregroundCheck() 通过 CDP WebSocket 调用属于自动化分支测试
    - resolveSaveAs({choice:'OVERWRITE_ORIGINAL'}) 标注为"CDP 自动化分支测试模拟选择，非真实用户在 WPS UI 中的覆盖选择决策"，含 CDP 调用记录引用（execution-log.md 步骤 5）
    - 场景B 标注为"自动化分支测试"，说明未发现候选文件的安全回退通过 CDP 调用验证，非真实用户操作
    - 保留场景 4 已有回写哈希三项全检证据，仅增量追加标注
  - **验收条件**：自动化分支测试与真实用户交互有明确区分标注，CDP 直接调用 resolveSaveAs 标注为自动化分支测试；标注为自动化分支测试模拟选择，非真实用户决策，含 CDP 调用记录；无把插件直接调用写成真实用户决策的描述
  - **依赖**：无
  - **验收标准映射**：R3-FIX-02-AC-01, R3-FIX-02-AC-02, R3-FIX-02-AC-07

### 2.2 T02.2 核验远端原文件 SHA-256（场景A + 场景B 处理前后）
- [ ] 通过 SMB 服务器核验另存为场景A（覆盖原文件）与场景B（未发现候选）处理前后远端原文件 SHA-256，为原文件保护证据与安全回退证据提供可核对数据
  - **涉及文件**：SMB 服务器（192.168.2.3/share）
  - **输入**：另存为测试文件路径（p0-02-saveas-reachable.txt、p0-02-saveas-unreachable.txt）
  - **输出**：远端原文件 SHA-256 处理前后对比数据
  - **实现要点**：
    - 通过 plink 连接 SMB 服务器读取远端原文件 SHA-256：
      `plink -pw ***REDACTED*** -hostkey "SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY" debian@192.168.2.3 "sha256sum /home/debian/share/p0-02-saveas-reachable.txt"`
    - 场景A：记录处理前远端原文件 SHA-256、处理后远端文件 SHA-256、候选文件 SHA-256
    - 场景B：记录处理前远端原文件 SHA-256、处理后远端原文件 SHA-256
    - 确认场景A 处理后远端文件 SHA-256 == 候选文件 SHA-256（远端文件被正确覆盖，预期行为）
    - 确认场景B 处理前后远端原文件 SHA-256 一致（原文件未被破坏）
  - **验收条件**：含远端文件 SHA-256 实际值与本地候选文件哈希比对结果；含另存为处理前后远端原文件 SHA-256 对比，确认未被破坏
  - **依赖**：无
  - **验收标准映射**：R3-FIX-02-AC-03, R3-FIX-02-AC-05

### 2.3 T02.3 核验场景B 本地缓存文件存在性与 SHA-256
- [ ] 通过 adb shell 核验场景B 本地缓存文件存在性与内容 SHA-256 非空，为安全回退证据(d)提供可核对数据
  - **涉及文件**：测试设备（HONOR NDL2_W09）本地缓存路径 `/storage/emulated/0/PAD2/smb_cache/`
  - **输入**：场景B 本地缓存文件路径
  - **输出**：本地缓存文件存在性与 SHA-256 核验结论
  - **实现要点**：
    - 通过 adb shell 核验本地缓存文件存在性：
      `"C:\Program Files (x86)\Android\android-sdk\platform-tools\adb.exe" -s AJ7XJV6904H00320 shell ls /storage/emulated/0/PAD2/smb_cache/p0-02-saveas-unreachable.txt`
    - 通过 adb shell 核验本地缓存文件 SHA-256 非空：
      `"C:\Program Files (x86)\Android\android-sdk\platform-tools\adb.exe" -s AJ7XJV6904H00320 shell sha256sum /storage/emulated/0/PAD2/smb_cache/p0-02-saveas-unreachable.txt`
    - 确认本地缓存文件存在且 SHA-256 非空（用户数据未丢弃）
  - **验收条件**：本地缓存文件存在且 SHA-256 非空，用户数据未丢弃
  - **依赖**：无
  - **验收标准映射**：R3-FIX-02-AC-04

### 2.4 T02.4 在 test-report.md 场景B 补齐安全回退四项完整证据
- [ ] 在 `docs/p0-02-r3/test-report.md` 场景 4 场景B 证据中补齐四项完整安全回退证据
  - **涉及文件**：`docs/p0-02-r3/test-report.md`（场景 4 场景B 证据部分）
  - **输入**：T02.2 远端原文件 SHA-256 核验数据 + T02.3 本地缓存文件核验数据
  - **输出**：场景B 证据含四项完整安全回退证据
  - **实现要点**：
    - 在场景B 证据中补齐四项完整证据：
    - (a) 无错误关联：saveAsDiscovered=false，未关联任何候选文件，未错误关联到其他无关文件
    - (b) 未误报回写成功：未调用 resolveSaveAs（因未发现候选文件），无 writebackSuccess=true 误报，系统如实报告"未自动发现另存为文件"
    - (c) 原远端文件 SHA-256 未变（原文件保护）：记录处理前远端原文件 SHA-256、处理后远端原文件 SHA-256、核对结果（一致，原远端文件未被破坏）
    - (d) 本地缓存保留或手动选择流程触发：记录本地缓存文件路径与存在性、本地缓存文件 SHA-256（非空，用户数据未丢弃）、saveAsPrompt 含"手动选择文件"提示
    - 保留场景B 已有 saveAsDiscovered=false 与 saveAsPrompt 证据，仅增量追加四项完整证据
  - **验收条件**：含(a)无错误关联、(b)未误报回写成功、(c)原远端文件 SHA-256 未变、(d)本地缓存保留或手动选择流程触发 四项完整证据
  - **依赖**：T02.2, T02.3
  - **验收标准映射**：R3-FIX-02-AC-04

### 2.5 T02.5 在 test-report.md 新增"原文件保护证据"章节
- [ ] 在 `docs/p0-02-r3/test-report.md` 新增"原文件保护证据"章节，记录另存为处理前后远端原文件 SHA-256 对比
  - **涉及文件**：`docs/p0-02-r3/test-report.md`
  - **输入**：T02.2 远端原文件 SHA-256 核验数据
  - **输出**：test-report.md 含"原文件保护证据"章节
  - **实现要点**：
    - 新增章节"## 原文件保护证据"，含两个子节：
    - "### 场景A（覆盖原文件）"：记录操作（resolveSaveAs({choice:'OVERWRITE_ORIGINAL'})）、处理前远端原文件 SHA-256、处理后远端文件 SHA-256（被正确覆盖为候选文件内容）、候选文件 SHA-256、核对结果（处理后远端文件 SHA-256 == 候选文件 SHA-256，远端文件被正确覆盖，预期行为）
    - "### 场景B（未发现候选）"：记录操作（foregroundCheck()，未调用 resolveSaveAs）、处理前远端原文件 SHA-256、处理后远端原文件 SHA-256、核对结果（一致，原远端文件未被破坏，原文件保护）
    - 章节追加到已有章节之后，不修改已有章节内容
  - **验收条件**：含另存为处理前后远端原文件 SHA-256 对比，确认未被破坏
  - **依赖**：T02.2
  - **验收标准映射**：R3-FIX-02-AC-05

### 2.6 T02.6 在 test-report.md 新增"真实用户交互验证状态"章节
- [ ] 在 `docs/p0-02-r3/test-report.md` 新增"真实用户交互验证状态"章节，标注真实 WPS UI 另存为操作场景为"未验证(UNVERIFIED)"
  - **涉及文件**：`docs/p0-02-r3/test-report.md`
  - **输入**：场景 4 自动化分支测试已有验证结果
  - **输出**：test-report.md 含"真实用户交互验证状态"章节
  - **实现要点**：
    - 新增章节"## 真实用户交互验证状态"，记录：
    - 场景：真实用户在 WPS UI 中执行另存为并确认覆盖
    - 验证状态：未验证(UNVERIFIED)
    - 未验证原因：WPS UI 无法可靠自动化，本次测试通过 CDP 直接调用插件方法（SmbPlugin.resolveSaveAs）验证处理分支逻辑，未通过真实 WPS UI 操作验证真实用户决策行为
    - 已验证的自动化分支测试结果：场景A 自动化分支测试通过（见场景 4 证据），证明候选发现与回写处理分支逻辑正确
    - 说明：自动化分支测试证明了插件方法的处理分支逻辑，但不能直接等同于真实 WPS 用户在交互界面中的决策行为
    - 章节追加到已有章节之后，不修改已有章节内容
  - **验收条件**：标记为未验证(UNVERIFIED)，含未验证原因与已验证的自动化分支测试结果
  - **依赖**：T02.1
  - **验收标准映射**：R3-FIX-02-AC-06

### 2.7 T02.7 更新 test-report.md SHA-256 证据链汇总表标注
- [ ] 在 `docs/p0-02-r3/test-report.md` SHA-256 证据链汇总表中为 save_as(A) 行新增"测试类型"列，标注为"自动化分支测试回写核验"
  - **涉及文件**：`docs/p0-02-r3/test-report.md`（SHA-256 证据链汇总表部分）
  - **输入**：无
  - **输出**：SHA-256 证据链汇总表含测试类型标注
  - **实现要点**：
    - 在 SHA-256 证据链汇总表（"### SHA-256 证据链汇总"）中为 save_as(A) 行新增"测试类型"列
    - 标注为"自动化分支测试回写核验"
    - 保留已有证据数据，仅新增测试类型列
  - **验收条件**：SHA-256 证据链汇总表 save_as(A) 行标注为"自动化分支测试回写核验"
  - **依赖**：无
  - **验收标准映射**：R3-FIX-02-AC-03

---

## 3. R3-FIX-03 完成最小差异审计

> 对应 design.md 模块 N（N1）；修复阻断项 C：R1 历史证据保护与提交范围审计未独立完成。核对 2bf4cdf6 实际提交文件清单，确认 R1 历史报告未被改写，确认 WpsDeliveryHandler.java 哈希字段返回修改处于 R3 授权范围内，产出基于 git show/diff 可追溯的审计结论。

### 3.1 T03.1 执行 git show 2bf4cdf6 --stat 获取实际提交文件清单
- [ ] 执行 `git show 2bf4cdf6 --stat` 获取提交 `2bf4cdf6...` 的完整修改文件清单，含每个文件的增删行数
  - **涉及文件**：Git 仓库
  - **输入**：提交 SHA `2bf4cdf6a48972dec7db758526e1c8b2e2b41fb4`
  - **输出**：完整修改文件清单（含每个文件增删行数）
  - **实现要点**：
    - 执行 `git show 2bf4cdf6a48972dec7db758526e1c8b2e2b41fb4 --stat`
    - 记录完整输出，含每个文件的增删行数
    - 确认文件清单可追溯至具体提交与具体文件变更
  - **验收条件**：产出完整修改文件清单，含每个文件的增删行数，可追溯
  - **依赖**：无
  - **验收标准映射**：R3-FIX-03-AC-01

### 3.2 T03.2 确认 R1 历史报告未被改写
- [ ] 执行 `git show 2bf4cdf6 -- docs/p0-02-r1/test-report.md` 与 `git show 60db452 -- docs/p0-02-r1/test-report.md` 核对，确认 R1 历史报告未被改写
  - **涉及文件**：Git 仓库 + `docs/p0-02-r1/test-report.md`
  - **输入**：提交 SHA `2bf4cdf6...` 与 `60db452`、R1 报告路径
  - **输出**：R1 报告保留确认结论
  - **实现要点**：
    - 执行 `git show 2bf4cdf6a48972dec7db758526e1c8b2e2b41fb4 -- docs/p0-02-r1/test-report.md`
    - 执行 `git show 60db452 -- docs/p0-02-r1/test-report.md`
    - 若有修改，对比历史结论与原始证据，确认仅增量追加 or 无改写
    - 若无修改，确认 R1 报告未被触碰
    - 确认历史结论（PASS/FAIL 判定）与原始证据数据未改写
  - **验收条件**：无改写历史结论或原始证据的变更，仅允许增量追加或无修改
  - **依赖**：无
  - **验收标准映射**：R3-FIX-03-AC-02

### 3.3 T03.3 确认 WpsDeliveryHandler.java 修改处于授权范围内
- [ ] 执行 `git show 2bf4cdf6 -- WpsDeliveryHandler.java` 核对修改内容，确认修改为 resolveSaveAs OVERWRITE_ORIGINAL 分支添加 localHash/verifyHash 返回，与 R3 spec.md 说明一致
  - **涉及文件**：Git 仓库 + `WpsDeliveryHandler.java`
  - **输入**：提交 SHA `2bf4cdf6...`、WpsDeliveryHandler.java 路径
  - **输出**：WpsDeliveryHandler.java 授权范围确认结论
  - **实现要点**：
    - 执行 `git show 2bf4cdf6a48972dec7db758526e1c8b2e2b41fb4 -- "**/WpsDeliveryHandler.java"` 获取修改 diff
    - 核对修改内容是否为 resolveSaveAs() OVERWRITE_ORIGINAL 分支添加 `result.put("localHash", localHash)` 和 `result.put("verifyHash", verifyHash)`
    - 核对与 R3 spec.md 说明一致性：R3 spec.md 已说明此修改为解决 PM 阻断项 1 所必需（assertWriteback 要求所有回写场景都必须有哈希）
    - 核对不改变功能行为（哈希计算逻辑未变），仅将已计算的哈希放入结果 Map
    - 确认修改处于 R3 授权范围内
  - **验收条件**：修改为 resolveSaveAs OVERWRITE_ORIGINAL 分支添加 localHash/verifyHash 返回，与 R3 spec.md 说明一致，处于授权范围内
  - **依赖**：无
  - **验收标准映射**：R3-FIX-03-AC-03

### 3.4 T03.4 在 test-report.md 新增"最小差异审计结论"章节
- [ ] 在 `docs/p0-02-r3/test-report.md` 新增"最小差异审计结论"章节，含实际提交文件清单、R1 报告保留确认、WpsDeliveryHandler.java 授权范围确认
  - **涉及文件**：`docs/p0-02-r3/test-report.md`
  - **输入**：T03.1 文件清单 + T03.2 R1 报告保留确认 + T03.3 WpsDeliveryHandler.java 授权范围确认
  - **输出**：test-report.md 含"最小差异审计结论"章节
  - **实现要点**：
    - 新增章节"## 最小差异审计结论"，含三个子节：
    - "### (1) 实际提交文件清单"：记录 `git show 2bf4cdf6 --stat` 完整输出，含每个文件增删行数
    - "### (2) R1 报告保留确认"：记录 `git show 2bf4cdf6 -- docs/p0-02-r1/test-report.md` 与 `git show 60db452 -- docs/p0-02-r1/test-report.md` 核对结果，确认历史结论与原始证据未改写
    - "### (3) WpsDeliveryHandler.java 授权范围确认"：记录 `git show 2bf4cdf6 -- WpsDeliveryHandler.java` diff 输出，确认修改为 resolveSaveAs OVERWRITE_ORIGINAL 分支添加 localHash/verifyHash 返回，与 R3 spec.md 说明一致，处于授权范围内
    - "### 审计结论"：产出"最小差异审计通过"或"最小差异审计失败（含具体失败项与根因）"，基于 git show/diff 输出可追溯
    - 章节追加到已有章节之后，不修改已有章节内容
  - **验收条件**：含文件清单、R1 保留确认、授权范围确认，基于 git show/diff 输出可追溯
  - **依赖**：T03.1, T03.2, T03.3
  - **验收标准映射**：R3-FIX-03-AC-04

---

## 4. 文档提交与归档

> 对应 design.md 模块 O（O1 + O2）与提交策略；在同一轮提交中提交全部文档变更，产出新完整 40 字符 Git SHA，归档修复文档到 `docs/p0-02-r3-fix/` 目录。

### 4.1 T04.1 提交文档变更并产出新完整 SHA
- [ ] 在同一轮 Git 提交中提交 `docs/p0-02-r3/test-report.md` 与 `docs/p0-02-r3/execution-log.md` 的全部文档变更，产出新完整 40 字符 Git SHA
  - **涉及文件**：`docs/p0-02-r3/test-report.md` + `docs/p0-02-r3/execution-log.md` + `docs/p0-02-r3-fix/*`
  - **输入**：T01.3 + T01.4 + T02.1 + T02.4 + T02.5 + T02.6 + T02.7 + T03.4 更新后的文档
  - **输出**：新完整 40 字符 Git SHA
  - **实现要点**：
    - 执行 `git add docs/p0-02-r3/test-report.md docs/p0-02-r3/execution-log.md docs/p0-02-r3-fix/`
    - 执行 `git commit -m "docs(P0-02-R3-FIX): 统一版本证据+补齐另存为证据+最小差异审计"`
    - 执行 `git push origin main` 推送到 GitHub
    - 记录新完整 40 字符 Git SHA
    - 执行提交范围审计：确认提交仅修改 `docs/p0-02-r3/test-report.md` + `docs/p0-02-r3/execution-log.md` + `docs/p0-02-r3-fix/` 下文档，未触碰任何 .java 代码文件与 `docs/p0-02-r1/test-report.md`
  - **验收条件**：新完整 40 字符 Git SHA 可 git log 追溯；提交仅修改授权范围内的文档，未触碰 .java 代码与 R1 报告
  - **依赖**：T01.5, T02.7, T03.4
  - **验收标准映射**：约束 2（不扩展到无关重构）、约束 5（保留 R1 与 R3 已有可靠证据）

### 4.2 T04.2 归档修复文档到 docs/p0-02-r3-fix/ 目录
- [ ] 确认 `docs/p0-02-r3-fix/` 目录下已归档 spec.md、design.md、tasks.md 修复文档
  - **涉及文件**：`docs/p0-02-r3-fix/spec.md` + `docs/p0-02-r3-fix/design.md` + `docs/p0-02-r3-fix/tasks.md`
  - **输入**：修复文档
  - **输出**：修复文档归档完成
  - **实现要点**：
    - 确认 `docs/p0-02-r3-fix/spec.md` 已归档（需求规格）
    - 确认 `docs/p0-02-r3-fix/design.md` 已归档（技术设计文档）
    - 确认 `docs/p0-02-r3-fix/tasks.md` 已归档（本任务清单）
    - 可选产出 `docs/p0-02-r3-fix/test-report.md`（R3-FIX 修复完成后的修复验证报告）
  - **验收条件**：docs/p0-02-r3-fix/ 目录下含 spec.md、design.md、tasks.md 修复文档
  - **依赖**：T04.1
  - **验收标准映射**：无

---

## 5. 验证与 PM Gate Review 申请

> 对应 design.md 4.3 验证方法；验证 R3-FIX-01/02/03 全部 17 条验收标准，提交后立即申请 PM Gate Review。

### 5.1 T05.1 验证 R3-FIX-01 验收标准（6 条）
- [ ] 验证 R3-FIX-01 全部 6 条验收标准（R3-FIX-01-AC-01 ~ R3-FIX-01-AC-06）
  - **涉及文件**：`docs/p0-02-r3/test-report.md` + `docs/p0-02-r3/execution-log.md`
  - **输入**：T01.1 ~ T01.5 产出
  - **输出**：R3-FIX-01 验收标准验证结论
  - **实现要点**：
    - R3-FIX-01-AC-01：审查版本证据说明，确认 amend 关系明确可核对
    - R3-FIX-01-AC-02：核对 APK 构建过程，确认 APK 与验收提交对应关系
    - R3-FIX-01-AC-03：审查更新后的测试报告，确认报告版本证据真实完整
    - R3-FIX-01-AC-04：审查更新后的执行日志，确认执行日志版本证据真实完整
    - R3-FIX-01-AC-05：审查版本证据更新过程，确认非仅字符串替换，含完整核对证据
    - R3-FIX-01-AC-06：核对三者对应关系，确认版本证据链统一可核对
  - **验收条件**：6 条验收标准全部通过
  - **依赖**：T01.5
  - **验收标准映射**：R3-FIX-01-AC-01 ~ R3-FIX-01-AC-06

### 5.2 T05.2 验证 R3-FIX-02 验收标准（7 条）
- [ ] 验证 R3-FIX-02 全部 7 条验收标准（R3-FIX-02-AC-01 ~ R3-FIX-02-AC-07）
  - **涉及文件**：`docs/p0-02-r3/test-report.md`
  - **输入**：T02.1 ~ T02.7 产出
  - **输出**：R3-FIX-02 验收标准验证结论
  - **实现要点**：
    - R3-FIX-02-AC-01：审查另存为场景证据标注，确认测试类型区分明确
    - R3-FIX-02-AC-02：审查覆盖选择决策证据，确认决策类型标注如实
    - R3-FIX-02-AC-03：审查远端哈希核验证据，确认远端哈希核验证据完整
    - R3-FIX-02-AC-04：审查场景B 安全回退证据，确认安全回退完整证据补齐
    - R3-FIX-02-AC-05：审查原文件保护证据，确认原文件保护证据完整
    - R3-FIX-02-AC-06：审查真实用户交互场景标注，确认真实用户交互如实标记
    - R3-FIX-02-AC-07：审查另存为决策证据描述，确认无模拟操作误认为真实用户操作
  - **验收条件**：7 条验收标准全部通过
  - **依赖**：T02.7
  - **验收标准映射**：R3-FIX-02-AC-01 ~ R3-FIX-02-AC-07

### 5.3 T05.3 验证 R3-FIX-03 验收标准（4 条）
- [ ] 验证 R3-FIX-03 全部 4 条验收标准（R3-FIX-03-AC-01 ~ R3-FIX-03-AC-04）
  - **涉及文件**：`docs/p0-02-r3/test-report.md`
  - **输入**：T03.1 ~ T03.4 产出
  - **输出**：R3-FIX-03 验收标准验证结论
  - **实现要点**：
    - R3-FIX-03-AC-01：执行 git show 2bf4cdf6 --stat，确认实际提交文件清单可核对
    - R3-FIX-03-AC-02：审查 2bf4cdf6 与 60db452 对 R1 报告的修改，确认 R1 历史报告保留
    - R3-FIX-03-AC-03：审查 WpsDeliveryHandler.java 修改内容，确认修改在授权范围内
    - R3-FIX-03-AC-04：审查最小差异审计结论，确认审计结论完整可追溯
  - **验收条件**：4 条验收标准全部通过
  - **依赖**：T03.4
  - **验收标准映射**：R3-FIX-03-AC-01 ~ R3-FIX-03-AC-04

### 5.4 T05.4 申请 PM Gate Review
- [ ] 提交后立即申请 PM Gate Review，提供新 SHA + 更新后的 test-report.md + execution-log.md + 最小差异审计结论 + 版本证据链说明
  - **涉及文件**：PM Gate Review 申请材料
  - **输入**：T04.1 新完整 SHA + T05.1 + T05.2 + T05.3 验收标准验证结论
  - **输出**：PM Gate Review 申请
  - **实现要点**：
    - 整理 PM Gate Review 申请材料：新 SHA + 更新后的 test-report.md + execution-log.md + 最小差异审计结论 + 版本证据链说明
    - 确认材料齐备：R3-FIX-01/02/03 全部 17 条验收标准验证通过
    - 确认约束遵从：不重做已通过场景、不扩展到无关重构、不把模拟操作认定为真实 WPS 用户操作、不把尚未核实的 APK 版本当作已验收版本、保留 R1 与 R3 已有可靠证据
    - 申请 PM Gate Review
  - **验收条件**：PM Gate Review 申请材料齐备，17 条验收标准全部通过，5 项约束全部遵从
  - **依赖**：T04.1, T04.2, T05.1, T05.2, T05.3
  - **验收标准映射**：P0-02-R3-FIX 通过条件（spec.md 10.3）

---

## 任务依赖关系汇总

```
T01.1 (核对 amend 关系) → T01.2 (核对 APK 构建) → T01.3 (test-report 版本证据章节)
                                                → T01.4 (execution-log 构建过程章节)
T01.3 + T01.4 → T01.5 (三者对应关系核对)

T02.1 (场景4 测试类型标注) → T02.6 (真实用户交互未验证标记)
T02.2 (远端原文件 SHA-256 核验) → T02.4 (场景B 安全回退四项证据)
                                → T02.5 (原文件保护证据章节)
T02.3 (本地缓存文件核验) → T02.4
T02.7 (SHA-256 证据链标注更新)

T03.1 (git show --stat) → T03.4 (最小差异审计结论章节)
T03.2 (R1 报告保留确认) → T03.4
T03.3 (WpsDeliveryHandler 授权范围确认) → T03.4

T01.5 + T02.7 + T03.4 → T04.1 (提交文档变更) → T04.2 (归档修复文档)
T01.5 → T05.1 (验证 R3-FIX-01)
T02.7 → T05.2 (验证 R3-FIX-02)
T03.4 → T05.3 (验证 R3-FIX-03)
T04.1 + T04.2 + T05.1 + T05.2 + T05.3 → T05.4 (申请 PM Gate Review)
```

---

## 约束遵从声明

| 约束 | 遵从证明 |
|------|---------|
| 约束 1：不重做已通过场景 | T01 ~ T04 仅新增章节与标注，不修改场景 1/2/3/5/6 的已有证据，不重做回归测试 |
| 约束 2：不扩展到无关重构 | T01 ~ T04 仅修改 `docs/p0-02-r3/test-report.md` + `docs/p0-02-r3/execution-log.md` + `docs/p0-02-r3-fix/*`，不修改任何 .java 代码文件 |
| 约束 3：不把模拟操作认定为真实 WPS 用户操作 | T02.1 标注 CDP 直接调用 resolveSaveAs 为自动化分支测试模拟选择；T02.6 标注真实用户交互为未验证(UNVERIFIED) |
| 约束 4：不把尚未核实的 APK 版本当作已验收版本 | T01.2 通过编译日志与 adb shell sha256sum 核对 APK 确实由 2bf4cdf6... 编译产出 |
| 约束 5：保留 R1 与 R3 已有可靠证据 | T01 ~ T04 不修改 `docs/p0-02-r1/test-report.md`，仅在 T03.2 审计结论中确认未改写；test-report.md 已有证据原样保留，新证据增量追加 |

---

## 验收标准覆盖汇总

| 验收标准 | 对应任务 | 状态 |
|---------|---------|------|
| R3-FIX-01-AC-01 amend 关系明确 | T01.1, T01.3 | 已覆盖 |
| R3-FIX-01-AC-02 APK 构建过程核对 | T01.2 | 已覆盖 |
| R3-FIX-01-AC-03 测试报告版本证据完整 | T01.3 | 已覆盖 |
| R3-FIX-01-AC-04 执行日志版本证据完整 | T01.4 | 已覆盖 |
| R3-FIX-01-AC-05 非仅字符串替换 | T01.3 | 已覆盖 |
| R3-FIX-01-AC-06 三者对应关系一致 | T01.3, T01.5 | 已覆盖 |
| R3-FIX-02-AC-01 测试类型区分 | T02.1 | 已覆盖 |
| R3-FIX-02-AC-02 覆盖选择决策标注 | T02.1 | 已覆盖 |
| R3-FIX-02-AC-03 远端哈希核验证据 | T02.2, T02.7 | 已覆盖 |
| R3-FIX-02-AC-04 安全回退四项完整证据 | T02.3, T02.4 | 已覆盖 |
| R3-FIX-02-AC-05 原文件保护证据 | T02.2, T02.5 | 已覆盖 |
| R3-FIX-02-AC-06 真实用户交互未验证标记 | T02.6 | 已覆盖 |
| R3-FIX-02-AC-07 无模拟操作误认为真实用户操作 | T02.1 | 已覆盖 |
| R3-FIX-03-AC-01 实际提交文件清单 | T03.1 | 已覆盖 |
| R3-FIX-03-AC-02 R1 报告保留确认 | T03.2 | 已覆盖 |
| R3-FIX-03-AC-03 WpsDeliveryHandler 授权范围确认 | T03.3 | 已覆盖 |
| R3-FIX-03-AC-04 审计结论可追溯 | T03.4 | 已覆盖 |

**总计**：5 个主任务组，17 个子任务，17 条验收标准全部覆盖。
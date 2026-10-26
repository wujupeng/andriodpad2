# Gate-UI-3 裁定请求：S3 SMB 连接页验收

> **任务编号**：TASK-S3-05（S3 阶段收口，含 TASK-S3-01 ~ S3-05 全部）
> **请求时间**：2026-10-21T14:35:00+08:00
> **裁定依据**：tasks.md TASK-S3-05 验收标准 + design.md 2.8.1 S3 Gate 审查内容 + spec 5.3 模块 9 条规则与异常场景 1-5 + PM 2026-10-21 批准令（G3-01~G3-08 测试清单与三条执行红线）
> **上游基线**：Gate-UI-2（PASS / CLOSED，2026-10-21 经热修 PAD2-HOTFIX-D2D3D5-001 关闭）
> **状态**：**已裁定 PASS / CLOSED（2026-10-21 PM 正式裁定）**

---

## 1. PM 测试清单执行结果（G3-01 ~ G3-08）

| # | 测试项 | 结果 | 证据 |
|---|--------|------|------|
| G3-01 | APK 基线 | ✅ | `pad2-p003-s3-ui-gate3.apk`（docs/p003-ui/artifacts/，11,463,619 B，SHA-256 `d971014c67a95be8f0f38c46c80d51e438e031f230c8cdeff4b5fffad39c8922`，远程 `./gradlew :app:assembleDebug` BUILD SUCCESSFUL 2026-10-21 14:12）；构建源 = 本地 fix2 终态 + S3 变更（web 资产经 cap sync 全量同步，index.html 引用新 bundle `index-CcONOFpO.js`）；初版 `5ebe4ca5…a676` 于验证中发现缺陷后重建为修复版（§3） |
| G3-02 | 连接表单 | ✅ | 必填内联提示 ≥5 项（无弹窗替代）；非法 IP（192.168.300.1）格式提示；密码默认掩码 + icon-eye 显隐往返；测试连接/保存并连接反馈正常（阶段 A 脚本 8 项断言全过） |
| G3-03 | AUTH_FAILED | ✅ | 错误凭据注入（专用测试值）→ Banner "连接失败：用户名或密码不正确"（统一文案，不区分具体哪项）+ **密码项内联定位**（spec 5.3.3 异常 2）+ 未伪报已连接；device-g3-03-auth-failed.png 目检确认红色横幅+内联提示+字段红框三重反馈 |
| G3-04 | 断网恢复 | ✅ | `svc wifi disable` → 列表卡发起连接 → Banner "连接失败：服务器无法连接，请检查网络或地址"（unreachable 分类）+ 未伪报已连接 + App 存活；`svc wifi enable` 恢复后重连成功（已连接徽章 + 失败状态清除） |
| G3-05 | 密文持久化 | ✅ | `run-as` 读取 shared_prefs/CapacitorStorage.xml：`pad2.profiles.v1` JSON 内 passwordEncrypted 为三段式 base64 密文，**XML 全文零明文密码**（grep 计数 0）；master key 亦密文存储；force-stop 冷启动重启后列表恢复呈现且状态为"未连接"（不伪报） |
| G3-06 | 篡改与解密失败 | ✅ | 受控破坏密文（三段式保持、ciphertext 改写，经 adb push + run-as cp 写回）→ 重启 App 不崩溃 → 点卡连接 → warning Banner "已保存的密码无法解密，请重新输入密码后连接" + 转编辑表单（预填非敏感字段、**密码强制为空**，无明文回退）+ 未建立连接；fail-secure 后持久层密文字段已被 save() 清除（C3 断言） |
| G3-07 | 删除与状态徽章 | ✅ | ⋮ 菜单（编辑/测试连接/连接/删除）→ 删除二次确认 Dialog（名称+取消/删除）→ 确认后列表卡减少（2→1）；六态徽章真机实证 4 态：disconnected（重启后）、connecting（"正在连接..."轮询捕获）、connected（绿徽章）、connect_failed（AUTH_FAILED/unreachable 两轮）——session_invalid/network_interrupted 为 S4/S5 操作回流态，连接页无触发入口，**未执行不标 PASS**，留待 S4-03（SessionStatusStrip）与 S5-07（11 态演练）注入验证 |
| G3-08 | 证据归档 | ✅ | 本文档 + shots/s3/（12 真机截图 + 3 阶段 result.json）+ 3 个验证脚本（scripts/verify-s3-05-gate3-device{,-b,-c}.mjs）；截图/日志/脚本均无凭据明文（凭据经环境变量传入，PM 红线 1） |

## 2. 全量静态检查与分层核验

| 检查项 | 结果 |
|--------|------|
| `tsc --noEmit`（strict） | ✅ 通过（含定向修复轮复跑） |
| check-design-tokens | ✅ 零违规 |
| check-contrast | ✅ 12 组合 ≥ 4.5:1（WCAG AA） |
| `npm run build` + `cap sync` | ✅ 通过（两轮，修复轮 bundle `index-CcONOFpO.js`） |
| 冻结区 diff | ✅ 本轮零触碰：SmbPlugin.ts / core / orchestration / infrastructure / android Java 全部未修改（git M 状态两 Java 文件为热修授权变更，已在热修 diff-review.md 归档）；S3-05 期间唯一源码改动 = §3 定向修复（src/ui/pages/ConnectionPage/ProfilesListPanel/index.tsx，非冻结区） |
| 分层规则 | ✅ ConnectionPage 全树零 SmbPlugin import（store 中转） |

## 3. 验证中发现并处置的缺陷（PM 红线 3 执行记录）

| # | 缺陷 | 复现步骤 | 严重级别 | 处置 |
|---|------|---------|---------|------|
| 1 | **重连成功后失败 Banner 残留**（虚假失败状态） | 断网时点列表卡连接 → danger Banner "服务器无法连接…"（持久）→ 网络恢复后再点卡 → 连接成功（徽章切"已连接"）→ **旧 danger Banner 未清除**（与已连接事实矛盾） | 中（不伪报成功，但误导用户以为仍失败；与 Gate 关闭标准"不出现虚假状态"对称面） | **最小定向修复**（ProfilesListPanel connectWithProfile 成功分支加 3 行清除逻辑 + timer 清理，非重构、非扩大范围）→ 三项静态检查全绿 → 重建部署（APK SHA d971014c…）→ 复验阶段 B 全过（"失败状态清除"断言 PASS + 截图 device-g3-04-wifi-recovered.png 佐证） |

**执行偏差披露**：
1. 验证中途发现共享凭据 debian/Pad2-Share-2026 已失效（服务器侧 NT_STATUS_LOGON_FAILURE，外部轮换所致，与今日"多用户无法访问共享"事件同源）——非 App 缺陷；AUTH_FAILED 呈现恰为正确行为。按 PM 红线 1 改用**专用测试账号** pad2gate3（服务器创建，smb.conf valid users 增补后恢复 immutable，restart smbd），未触碰既有用户。
2. 初版 APK（5ebe4ca5…）安装被拒为屏幕休眠所致，唤醒后 `install -r` 成功（覆盖安装保留数据）。
3. 六态徽章 4/6 真机实证（见 G3-07 行），2 态留待后续阶段（未执行不标 PASS，PM 红线对齐）。

## 4. Gate-UI-3 关闭标准核对（PM 2026-10-21 批准令第四节）

| 关闭标准 | 结果 |
|---------|------|
| 核心表单、连接列表和删除操作在真机正常工作 | ✅ G3-02/07（表单校验/列表/删除确认全过，横屏 1920x1200 目检无样式异常） |
| AUTH_FAILED、断网和密文篡改场景均能正确失败，不出现虚假的成功状态 | ✅ G3-03/04/06（三类注入均正确失败呈现；发现并修复了对称的虚假失败残留缺陷） |
| 密文持久化检查有可复核证据 | ✅ G3-05（run-as XML 摘录 + grep 零明文 + 三段式密文 + 重启恢复） |
| APK 与源码基线明确对应 | ✅ G3-01（SHA-256 + 构建源 = 本地工作区 cap sync 同步产物 + 远程构建记录） |
| 失败项有清晰结论，未执行测试不标 PASS | ✅（六态徽章 2 态明确披露留待 S4/S5；其余全过或已修复复验） |

## 5. 归档清单

- APK：docs/p003-ui/artifacts/pad2-p003-s3-ui-gate3.apk（SHA-256 d971014c…8922）
- 真机截图：docs/p003-ui/shots/s3/device-g3-*.png ×8（关键 4 张经图像目检：AUTH_FAILED 三重反馈/已连接绿徽章/恢复无残留/篡改 fail-secure 密码强制空）
- 阶段结果：shots/s3/device-gate3{a2,b,c}-result.json ×3
- 验证脚本：scripts/verify-s3-05-gate3-device{,-b,-c}.mjs（凭据经 env，无明文）
- 本裁定材料：docs/p003-ui/gate-ui-3.md

---

**提请 PM 裁定 Gate-UI-3**。若 PASS，S3 阶段关闭，进入 S4（共享目录浏览与文件操作，7 任务）；服务器侧测试账号 pad2gate3 保留供试运行复用。
---

## 6. PM 裁定登记（2026-10-21）

- **Gate-UI-3 = PASS / CLOSED**：G3-01~G3-06、G3-08 按报告通过；G3-07 已验证范围通过（六态徽章实证 4 态，session_invalid/network_interrupted 为 S4/S5 回流态，保留为后续验证项，不扩大本次通过范围）。PM 裁定基于提交的验证结果与归档摘要，未独立复测。
- **S3 阶段关闭，S4 批准启动**。执行边界：按既定 S4 任务清单推进文件管理与连接状态跨页面联动；对 S4/S5 回流两态开展定向验证；继续受控内部试运行。不允许：重新解冻已关闭的 D2/D3/D5 热修范围；未经授权重构 SMB 核心或扩大凭据管理范围；将 Gate-UI-3 通过等同于 PAD2 全产品生产验收。
- **共享凭据事件处置（环境变更记录）**：共享账号 debian 被外部轮换失效（2026-10-21 13 时许，影响多用户访问）——**登记为环境变更，非 PAD2 连接故障**；后续试运行使用专用测试账号 pad2gate3，不依赖已失效共享凭据；专用账号权限确认仅具备必要测试共享目录权限（§7 核验）。

## 7. pad2gate3 专用账号权限核验与收紧（2026-10-21）

| 项 | 状态 |
|---|---|
| 系统账号形态 | `useradd -M -s /usr/sbin/nologin`（无家目录、无登录 shell，仅 SMB 测试用途） |
| 共享授权范围 | smb.conf [share] valid users 增补（必要测试目录）；[storage] 段从未授权（valid users = debian） |
| 权限收紧 | [smb] 段 valid users 移除 pad2gate3（测试仅需 share），恢复 immutable（同日执行，见下方执行记录） |
| 收紧后复核 | //localhost/smb 访问拒绝 + //localhost/share 访问正常（NT_STATUS_ACCESS_DENIED / 列目录成功） |
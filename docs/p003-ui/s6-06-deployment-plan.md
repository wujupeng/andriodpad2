# TASK-S6-06 受控生产部署执行方案（待 PM 审批部署执行授权）

> **任务性质**：PM 授权受控生产部署授权与验证——**准许提交执行方案；部署执行待单独授权**（本方案仅为执行计划，不含部署执行授权）
> **日期**：2026-10-24｜**执行人**：开发代理（大G）
> **前置终裁**：S6-05-FINAL-APPROVAL = PASS/CLOSED；**生产发布门 OPEN**（PM 批准）；正式生产放行待裁定
> **发布对象**：`pad2-p003-s6-01-fix.apk`＝`d6d75d2028bae7600ecf388ea8602c0001d9d36108e93d14617a71d823f099e8`（release 构建，SHA-256 冻结，禁止未经审批替换）

## 〇、执行方案状态与待确认项

**本方案为准许提交的执行计划**——PM 已授权编制，但**部署执行待 PM 单独授权**。下列待确认项须在部署执行授权前由 PM 明确：

| 待确认项 | 当前已知/建议 | 须 PM 明确 |
| --- | --- | --- |
| 部署责任人 | 待指定 | 责任人姓名/角色 |
| 目标设备数量 | 当前已验证 1 台（荣耀 NDL2_W09 AJ7XJV6904H00320） | 受控部署设备数量（建议小范围=1~3 台） |
| 现场回滚责任 | 待指定 | 回滚执行责任人+回滚决策权限 |
| 授权范围 | 受控范围=已验证环境（§一） | 部署执行授权边界（设备清单+时间窗口+停止条件触发时的处置权限） |
| 风险接受责任人 | webContentsDebuggingEnabled:true 受控部署风险接受人 | PM 指定 |

---

## 一、部署对象锁定（SHA-256 冻结，禁止未经审批替换）

| 项 | 值 | 冻结状态 |
| --- | --- | --- |
| APK 文件 | `docs/p003-ui/artifacts/pad2-p003-s6-05-fix.apk` | ✅ 归档冻结 |
| **完整 SHA-256** | `d6d75d2028bae7600ecf388ea8602c0001d9d36108e93d14617a71d823f099e8` | ✅ 三方一致核验（本地归档=远程构建=设备 pm path 实测） |
| 构建变体 | release（非 DEBUGGABLE） | ✅ pkgFlags 核验 |
| 签名 | v1+v2，证书 SHA-256 `a41e9a222026def9f7e7ed1106909e6b67bec99cda69b3455dcfad25d4bb5290` | ✅ apksigner verify |
| versionCode/versionName | 1 / 1.0 | ✅ |
| 桥日志配置 | loggingBehavior:'none'（关闭）+ webContentsDebuggingEnabled:true（受控部署保留 CDP——**正式对外发布须移除**） | ✅ capacitor.config.json 核验 |
| 回滚基线 | `pad2-p003-s5-06c-trial.apk`＝`e7a67ee5d5f537c59784cbf90453d5137d3c13b7cfe0c0d95cda0b20aaf1ee7b`（debug，跨轨回滚须卸载重装+重授 All files access） | ✅ 归档可用 |

**冻结约束**：部署执行期间禁止替换 APK；任何 SHA-256 不一致即触发停止条件 ①。

## 二、受控部署范围声明（严格限制，不扩大）

### 2.1 受控部署范围（兼容性承诺覆盖）

| 维度 | 范围 |
| --- | --- |
| SMB 服务端 | Windows Server（192.168.2.247，`\\192.168.2.247\soft\AutoFileBackup`，SMB 3.1.1，guest/空密码）+ Linux Samba（192.168.2.3，pad2gate3 账号——错误凭据场景归属） |
| 设备 | 荣耀 NDL2_W09（序列号 AJ7XJV6904H00320）/ Android 16（API 36） |
| WPS | 14.25.0（cn.wps.moffice_eng） |
| 已验证能力面 | 连接（guest 空密码/冷启动/错误凭据/断网恢复重试/防重入）、目录浏览（中文文件名）、复制/移动/重命名/删除（服务器端 SHA 核验）、.xlsx/.xls WPS 编辑写回（三方一致+内容级）、冲突防覆盖、缓存隔离 |

### 2.2 明确排除（不得纳入部署——PM 禁止事项）

| 排除项 | 原因 |
| --- | --- |
| NAS SMB 服务端 | S6-02 未授权未执行 |
| Android Doze/厂商省电策略深度场景 | S6-03 未授权未执行 |
| 其他厂商设备/Android 版本/WPS 版本 | 未验证 |
| 混合分隔符路径输入 | R-2 已知限制 |
| 磁盘满、字节级取消、大范围并发 | S5-03 遗留未验证项 |
| 正式对外发布场景 | webContentsDebuggingEnabled:true 须移除+重新构建核验 |
| 全面推广/对外发布 | PM 禁止——仅受控小范围部署 |

## 三、安装前检查清单

部署执行前逐项核验（任一不通过即停止部署）：

| # | 检查项 | 核验方式 | 通过标准 |
| --- | --- | --- | --- |
| 1 | APK SHA-256 一致 | `sha256sum <APK 路径>` | = `d6d75d2028bae7600ecf388ea8602c0001d9d36108e93d14617a71d823f099e8` |
| 2 | APK 签名核验 | `apksigner verify --print-certs <APK>` | v1+v2 通过+证书 SHA-256 = `a41e9a22…5290` |
| 3 | 设备环境核验 | `adb shell getprop ro.build.version.release` + `dumpsys package com.pad2.filemanager`（若已装） | Android 16 + 设备序列号 AJ7XJV6904H00320 |
| 4 | WPS 版本核验 | `adb shell pm list packages \| grep wps` | cn.wps.moffice_eng 已装 |
| 5 | SMB 服务端可达 | `smbclient -L //192.168.2.247 -U guest%` + `smbclient -L //192.168.2.3 -U pad2gate3%<新凭据>` | Sharename 列表正常 |
| 6 | 回滚基线可用 | `ls docs/p003-ui/artifacts/pad2-p003-s5-06c-trial.apk` + sha256sum | = `e7a67ee5…f1ee7b` |
| 7 | 设备 USB 调试+安装权限 | `adb devices` + 荣耀 USB 安装开关 | 设备在线+安装开关开启（荣耀安装确认可能需手动点按） |
| 8 | All files access 状态 | `adb shell appops get com.pad2.filemanager MANAGE_EXTERNAL_STORAGE`（若已装） | 已授予（卸载重装会重置须重新授予——记忆教训） |

## 四、部署执行步骤（待 PM 授权后执行）

### 4.1 安装
1. `adb install -r docs/p003-ui/artifacts/pad2-p003-s6-05-fix.apk`（荣耀安全审核弹窗时勾选确认复选框→"继续安装"——记忆：所有自动绕过无效，须用户手动操作）
2. 安装后核验：`adb shell pm list packages | grep com.pad2.filemanager` + `dumpsys package … | grep -E "lastUpdateTime|pkgFlags|signatures"`
3. **关键核验**：pkgFlags 不含 DEBUGGABLE + 安装包 SHA-256 = `d6d75d20…f099e8`（pm path 拉取实测）
4. 若卸载重装（跨轨回滚后）：须重新授予 All files access（荣耀 ROM 限制 adb 不可代授——adb 打开系统设置页请用户手动开启）

### 4.2 配置 guest/空密码连接（Windows Server）
1. 工作台→"添加连接"→填连接名称/服务器地址 192.168.2.247/共享名 soft/用户名 guest；**密码留空**
2. "保存并连接"→预期 ≤1s 内反馈（正在连接→已连接，实测 10ms 级）
3. 冷启动后点击连接卡可直接重连（无需补输密码）

### 4.3 凭据管理
| 凭据 | 用途 | 管理方式 |
| --- | --- | --- |
| guest 空密码（247） | Windows Server guest 连接 | 空密码无秘密，无需特殊管理 |
| pad2gate3 新凭据（3） | Linux Samba 错误凭据场景 | 远程 `debian@192.168.2.3:~/pad2_cred_next.txt`（chmod 600），用户 ssh 获取；**不得写入任何文档/日志/报告** |
| 旧凭据（Gate3-Test-<已轮换>） | 已失效 | 已脱敏归档，不可用 |

### 4.4 日志留存策略
- **采集**：`adb logcat -d --pid=$(adb shell pidof com.pad2.filemanager)` + 截图 + 操作步骤 + 时间点
- **脱敏警示**：release 构建桥日志已关闭（loggingBehavior:'none'）——logcat 不含 methodData echo；但采集日志前仍建议先关闭连接/对日志脱敏（防御性实践）
- **留存**：部署验收日志归档 `docs/p003-ui/shots/s6-06/`（部署执行后创建）
- **访问边界**：logcat 是设备本地内存缓冲区非持久存储；读取前提 USB 调试/READ_LOGS 特权

### 4.5 异常上报流程
1. 发现异常即停止使用（L1 回滚）——不卸载（保留现场供诊断）
2. 采集 logcat + 截图 + 操作步骤 + 时间点 + 服务器端状态（smbclient ls + get→sha256sum）
3. 触发停止条件（§六）即停止扩展部署+执行既定处置流程
4. 上报 PM 裁定是否继续/回滚

## 五、部署后验收清单（PM 五项验收要求）

部署执行后逐项验收（PM 终审材料要求）：

| # | 验收项 | 验收方式 | 通过标准 |
| --- | --- | --- | --- |
| 1 | 实际安装 APK 与批准哈希/签名/包属性一致 | `adb shell pm path` 拉取 base.apk + sha256sum + dumpsys pkgFlags/signatures | SHA-256 = `d6d75d20…f099e8` + pkgFlags 无 DEBUGGABLE + 签名摘要 fa69b9b[fa40ec2b] |
| 2 | 清空 logcat 后重新执行凭据操作，验证无明文密码泄露 | `adb logcat -c` → 表单填真实凭据（pad2gate3 新凭据）→"保存并连接" → 立即 `adb logcat -d --pid=$PID` 全文扫描 | 零 methodData echo + 零 "password" 字段 + 零明文 + 零部分匹配（C05 正确采样模式） |
| 3 | SMB 连接+文件操作+.xlsx/.xls 编辑与服务器端回写验证 | 复用 verify-s6-01-fix01.mjs（连接域 S1~S10）+ verify-s6-01-auto.mjs（WS 文件操作）+ verify-s6-01-wps.mjs（双格式写回） | 全 PASS（与 S6-05-FIX T7 回归基线一致） |
| 4 | 异常处置（认证失败/网络中断/回写异常/删除状态异常） | fix01 S2（错误凭据）+ S3（不可达）+ S5（重试）+ auto WS-18（断网）+ WS-15（回写冲突）+ WS-17（只读拒绝） | 如实失败呈现+可重试+无伪成功+源不变+零残留 |
| 5 | 输出逐项结果+日志证据+实际部署范围+回滚可用性 | 验收报告 docs/p003-ui/s6-06-deployment-verification.md + shots/s6-06/ | 五项全 PASS+回滚基线 APK 可用+实际部署范围登记 |

## 六、停止条件（立即停止扩展部署的触发器）

| # | 触发条件 | 当前状态 | 处置 |
| --- | --- | --- | --- |
| 1 | 安装包身份不符（SHA-256 与 `d6d75d20…f099e8` 不一致） | 未触发 | 停止部署+核验 APK 来源 |
| 2 | 凭据泄露（logcat 含明文密码） | ✅ 已关闭（修复后零泄露） | 若触发→停止部署+L2/L3 回滚+PM 上报 |
| 3 | 写回内容不一致（服务器端 SHA 与本地不符） | 未触发 | 停止部署+R-3 核验三步骤+PM 上报 |
| 4 | 误删源文件 | 未触发 | 停止部署+L1 停止使用+PM 上报 |
| 5 | 无法确认远端状态（R-3 场景失控） | 未触发 | 停止部署+R-3 核验三步骤+PM 上报 |

## 七、三级回滚步骤

| 级别 | 机制 | 操作 | 责任 |
| --- | --- | --- | --- |
| **L1 停止使用** | 不扩大部署 | 发现异常即停止使用，不卸载（保留现场供诊断） | 部署执行人（待 PM 指定） |
| **L2 代码 revert** | `git revert 4a78f5a` | 还原 capacitor.config.ts 至修复前状态→重建 debug APK | 开发代理 |
| **L3 基线 APK 重装** | `adb install -r docs/p003-ui/artifacts/pad2-p003-s5-06c-trial.apk`（基线 `e7a67ee5…f1ee7b`） | 回到 F-01 缺陷形态前（debug 构建，含桥日志泄露——仅诊断用）；**跨轨回滚（release→debug）签名不同须先卸载，卸载重置 All files access 须重新授予** | 部署执行人+现场回滚责任人（待 PM 指定） |

**R-3 失败后状态核验三步骤**（运维手册级）：
1. 写回失败后立即以服务器端 `smbclient get→sha256sum` 核验目标文件实际内容（**勿以服务器终态为准**——断连后可能被 pending tombstone 延迟替换）
2. 检查同目录 `.tmp<timestamp>` 残留
3. 残留处理：客户端重连后重试写回（覆盖语义正确）或运维侧确认删除

## 八、未解决风险维持独立登记（不因部署门开放而自动关闭）

| 风险 | 状态 | 部署期间处置 |
| --- | --- | --- |
| R-1 凭据暴露 | ✅ 已闭环（修复后零泄露） | 部署验收 ② 复验零泄露；若触发停止条件 ② |
| R-1 界面回显（复选框不回显） | 体验级登记 | 按登记状态管理；不得与日志无泄露混为一谈；不得因此恢复明文日志 |
| R-2 混合分隔符路径 | 暂缓 | 继续暂缓；产品 UI 正常路径不触发；任意路径输入不在验证范围 |
| R-3 DELETE_PENDING | 运维观察 | 保留核验三步骤+停止条件 ⑤；不引发错误重试 |
| R-4 环境边界 | NAS/Doze/未验证设备 | 严格限制部署范围（§二）；不外推未验证环境 |

## 九、提请 PM 审批部署执行授权

**本执行方案已编制完成**（PM 准许提交范围）。**部署执行待 PM 单独授权**——请 PM 明确：

1. **部署责任人**（姓名/角色）
2. **目标设备数量**（建议小范围 1~3 台，当前已验证 1 台 AJ7XJV6904H00320）
3. **现场回滚责任**（回滚执行责任人+回滚决策权限）
4. **授权范围**（部署执行边界：设备清单+时间窗口+停止条件触发时的处置权限）
5. **风险接受责任人**（webContentsDebuggingEnabled:true 受控部署风险接受人）

PM 明确上述五项后即授权部署执行；部署执行完成后按 §五 验收清单逐项核验，输出验收报告 `docs/p003-ui/s6-06-deployment-verification.md` 提请 PM 最终部署裁定。

**禁止事项重申**（PM 原文）：
- 不扩大到未经验证的设备和环境
- 不以测试通过替代发布授权
- 不自动启动全面推广或对外发布

## 附：证据索引

- 发布审批结论：`docs/p003-ui/s6-05-final-approval.md`
- 修复验证报告：`docs/p003-ui/s6-05-fix-verification.md`
- 发布审批包：`docs/p003-ui/s6-05-production-release-gate.md`
- 产物：`docs/p003-ui/artifacts/pad2-p003-s6-05-fix.apk`（SHA `d6d75d20…f099e8`）
- 回滚基线：`docs/p003-ui/artifacts/pad2-p003-s5-06c-trial.apk`（SHA `e7a67ee5…f1ee7b`）
- 验证脚本（部署后验收复用）：`verify-s6-01-fix01.mjs`/`verify-s6-01-auto.mjs`/`verify-s6-01-wps.mjs`/`verify-s6-05-fix-c05.mjs`
- 凭据：远程 `~/pad2_cred_next.txt`（chmod 600，用户 ssh 获取）
# TASK-11：真实写回验收准备与授权闭环申请（R1 修订版）

**任务编号**：TASK-11（R1 修订）
**日期**：2026-10-29
**前置完成**：TASK-10（提交 `4493314b`）+ TASK-10-R1（提交 `2a1c20c`）
**当前状态**：`WRITE_ENABLED_SCOPE.enabled = false`（安全初始状态，等价 AU-005 只读）
**申请目标**：获得**隔离验收环境的受限写回路径**授权（FRZ-EX），在真机 + 真实 SMB 服务器环境中验证写回链路
**修订说明**：本版针对 PM 终审 HOLD 裁定的 6 个缺口（GAP-11-01 ~ GAP-11-06）进行全面修订，R-01~R-12 补齐 precondition / steps / expected_result / evidence_path / rollback_result / verdict 六字段

---

## 一、三个核心问题

### 问题 1：代码是否真正接通？

**回答：是，由以下证据支持**

| 证据 | 来源 | 提交 |
|------|------|------|
| 真实 store action 集成测试（8 项） | `test/editSession-real-store-integration.test.ts` | `2a1c20c` |
| 直接调用 `applyForegroundCheckResult` 断言执行器调用 | AC-1.1~1.5 | `2a1c20c` |
| `resolveConflict('OVERWRITE_CONFIRMED')` 真实远端复查 | AC-3.1~3.5 | `2a1c20c` |
| 状态机迁移链 `opened→saving→writeback_pending→writeback_success→opened` | TASK-10 GAP-1/2/3 | `4493314b` |
| 129/129 测试 PASS | tsc + node:test 全量 | `2a1c20c` |

**触发链路**（前台检测后触发，非 WPS 保存时即时触发）：
```
FileObserver(Java) → WpsSaveDetector.foregroundCheck() → SmbPlugin.foregroundCheck()(TS)
  → useEditSessionMonitor: appStateChange(isActive=true) → store.applyForegroundCheckResult({changed:true})
  → saving → writeback_pending → executeWriteback → writeback_success → opened
```

### 问题 2：服务器是否允许安全写回？

**回答：尚未授权，需以下服务器端准备**

| 准备项 | 当前状态 | 需要授权 |
|--------|---------|---------|
| 专用账户 `pad2_app` | 未创建 | PM + 运维联合授权创建 |
| 独立验收共享 `pad2_verify$`（受限可写） | 不存在 | 运维创建独立共享 + 设置权限 |
| 现有只读共享 | `read only = yes`（AU-005 只读） | **保持不变**，不修改父共享写权限 |
| 凭据存储（Android Keystore） | 未配置 | 明确代码工作单 + 凭据迁移 |
| 凭据轮换 | 新密码 9191 已暴露须再次轮换 | 运维执行受控轮换 + 撤销旧凭据 |
| 备份与回滚方案 | 未编制 | 运维编制可执行步骤 |
| 隔离边界验证 | 未执行 | 运维验证账户无法写入受限目录以外位置 |

### 问题 3：WPS 保存后服务器文件是否真实更新？

**回答：尚未验证，需真机验收**

须在 FRZ-EX 授权后，按以下证据链执行真机验收：

```
① WPS 保存文件
② PAD2 检测到有效文件变化（前台检测后触发）
③ 编辑会话进入正确状态并触发写回执行器
④ 执行器通过授权路径、会话和冲突检查
⑤ SMB 服务端目标文件实际发生预期变化
⑥ 服务端内容校验通过（SHA-256 一致），记录写回结果
⑦ 断网、权限拒绝、冲突等异常均不会导致未经授权的覆盖
```

---

## 二、保持安全状态

| 安全项 | 当前值 | 保持条件 |
|--------|--------|---------|
| `WRITE_ENABLED_SCOPE.enabled` | `false` | 验收前不开启；验收时仅在隔离环境对指定测试文件开启 |
| 冻结区（SmbPlugin.ts/core/android/smb） | 零变更 | 不修改 |
| `src/main.tsx` | 零变更 | 不修改 |
| `package.json` | 零新增依赖 | 不新增 |
| 生产发布 | BLOCKED | 须 PM 单独授权 |
| 生产环境/数据/共享 | 不触碰 | FRZ-EX 仅授权隔离验收环境 |
| `ACTION_VIEW → ACTION_EDIT` 变更 | 不自动包含 | 须单独 FRZ-EX 授权 |

### FRZ-EX 授权范围明确（GAP-11-01 修订）

**FRZ-EX 授权对象**：仅授权**隔离验收环境的受限写回路径**。

- **授权范围**：
  - 验收开关 `WRITE_ENABLED_SCOPE.enabled = true` **仅在隔离验收环境**开启
  - 写回目标**仅限独立验收共享 `pad2_verify$` 内的指定测试文件**
  - 验收账户**仅限 `pad2_app`**，不授予任何其他账户写权限
- **不授权范围**（明确排除）：
  - ❌ 不授权生产环境写回
  - ❌ 不授权生产数据修改
  - ❌ 不授权生产发布
  - ❌ 不授权修改现有只读共享
  - ❌ 不授权 `ACTION_VIEW → ACTION_EDIT` 变更（须单独审批）
- **验收结束后**：`WRITE_ENABLED_SCOPE.enabled` 恢复 `false`，验收共享可撤销或保留为只读

---

## 三、服务器端授权准备

### 3.1 专用账户创建

- 账户名：`pad2_app`（≠ debian）
- 用户组：`pad2_app_group`（GID=2000）
- Shell：`nologin`（系统层 -M -s nologin）
- **授权依赖**：PM + 运维联合授权

### 3.2 受限可写目录与隔离边界（GAP-11-02 修订）

#### 3.2.1 独立验收共享方案

**优先方案：创建独立验收共享 `pad2_verify$`**（隐藏共享，`$` 后缀）

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 共享名 | `pad2_verify$` | 隐藏共享，不在网络浏览中可见 |
| 物理路径 | `/mnt/verify_share/` | 独立目录，不在现有共享路径下 |
| 属主 | `pad2_app:pad2_app_group` | 专用账户属主 |
| 权限 | `drwxrws---` | 仅属主和组可读写执行 |
| `read only` | `no` | 该共享允许写 |
| `write list` | `pad2_app` | 仅专用账户可写 |
| `valid users` | `pad2_app` | 仅专用账户可访问 |
| `browseable` | `no` | 隐藏共享 |

**现有只读共享保持不变**：不通过修改父共享写权限实现验收。

#### 3.2.2 隔离边界验证要求

运维须执行以下验证并提供证据：

| 验证项 | 方法 | 预期结果 | 证据 |
|--------|------|---------|------|
| 父目录权限 | `ls -la /mnt/` | `verify_share` 目录属主 `pad2_app`，其他账户无写权限 | 截图/命令输出 |
| 路径穿越检查 | `smbclient //srv/pad2_verify$ -U pad2_app` 尝试 `cd ..` | 无法逃逸到父目录 | 命令输出 |
| 符号链接检查 | `find /mnt/verify_share/ -type l` | 无符号链接或仅限预期链接 | 命令输出 |
| 其他账户写入 | 以 `debian` 账户尝试写入 `pad2_verify$` | 拒绝写入 | 命令输出 |
| 现有共享不变 | `testparm -s` 对比现有共享配置 | 现有共享 `read only = yes` 不变 | 配置 diff |
| 网络隔离 | 验收共享仅对验收网段开放（`hosts allow`） | 非验收网段不可访问 | 配置 + 连通性测试 |

#### 3.2.3 不接受的隔离方案

- ❌ 不接受修改现有只读共享为可写
- ❌ 不接受在现有共享路径下创建子目录作为可写区
- ❌ 不接受使用 `debian` 账户或已暴露凭据的账户
- ❌ 不接受仅以文档声明隔离而不实际验证

### 3.3 Samba 权限配置

- 独立共享 `pad2_verify$` 的 `read only = no`（仅此共享）
- `write list = pad2_app`（仅专用账户）
- `valid users = pad2_app`（仅专用账户可访问此共享）
- 现有共享保持 `read only = yes` 不变
- **授权依赖**：运维配置 + 备份 smb.conf + 回滚方案（见第五节）

### 3.4 凭据存储、轮换与保护闭环（GAP-11-03 修订）

#### 3.4.1 凭据轮换流程

| 步骤 | 执行方 | 操作 | 验证 |
|------|--------|------|------|
| 1 | 运维 | 通过受控渠道（非聊天/非代码库）生成新密码 | 密码强度符合策略 |
| 2 | 运维 | 在 Samba 服务端设置 `pad2_app` 账户密码 | `smbpasswd -a pad2_app` |
| 3 | 运维 | **撤销旧凭据**（9191 及任何已暴露凭据） | 旧密码无法认证 |
| 4 | 运维 | 通过受控渠道将新凭据传递给验收执行人 | 渠道记录留档 |
| 5 | 开发 | 将新凭据存入 Android Keystore（不写入代码/配置文件） | Keystore 存储验证 |
| 6 | 开发 | 验证凭据不泄露（见 3.4.2） | 无泄露验证通过 |

**轮换周期**：90 天，服从组织安全策略。若组织策略要求更短周期，以组织策略为准。

#### 3.4.2 凭据不泄露验证

开发须验证以下位置**不包含明文密码**：

| 检查位置 | 检查方法 | 预期 |
|----------|---------|------|
| 应用日志 | `grep -r "密码\|password\|passwd" logcat输出` | 无明文密码 |
| SharedPreferences / Preferences | 检查偏好存储内容 | 无明文密码 |
| 调试报告 / crash dump | 检查调试输出 | 无明文密码 |
| 备份文件 | 检查 `adb backup` 内容 | 无明文密码 |
| 代码仓库 | `git log --all -p` 搜索密码 | 无明文密码 |
| 网络抓包（非 TLS） | Wireshark 过滤 SMB 认证 | 仅 NTLMv2 响应，无明文 |

#### 3.4.3 Keystore 迁移工作单

- **当前状态**：凭据未存入 Android Keystore
- **迁移工作**：开发另行完成（独立于本授权申请）
- **验收前置**：Keystore 迁移完成 + 凭据不泄露验证通过
- **不接受的方案**：❌ 不接受硬编码凭据；❌ 不接受明文存储于偏好/配置文件

---

## 四、冲突覆盖安全语义（GAP-11-04 新增）

### 4.1 冲突覆盖完整流程

冲突覆盖（`OVERWRITE_CONFIRMED`）须遵循以下安全语义：

```
① 检测到远端已变化 → 进入 conflict 态
② 用户看到冲突提示，选择"确认覆盖"
③ 【确认前】记录远端文件版本或哈希（remote_version_at_confirm）
④ 执行覆盖前 → 再次检查远端（getSmbMethods().checkRemoteChanged）
⑤ 判断远端是否在确认后又变化：
   ├─ 远端未变化 → 执行写回 → 记录写回结果
   ├─ 远端又变化 → 拒绝写入 → 再次进入 conflict 态（回到①）
   └─ 远端复查失败（网络错误等）→ 拒绝写入 → 报告错误
⑥ 写回完成后 → 校验服务端文件 SHA-256 → 记录最终结果
```

### 4.2 安全保证

| 保证项 | 实现方式 | 代码位置 |
|--------|---------|---------|
| 确认前记录远端版本 | `checkRemoteChanged` 返回远端元数据 | `editSessionStore.ts: resolveConflict` |
| 执行前再次复查 | `getSmbMethods().checkRemoteChanged()` 调用 | `editSessionStore.ts: resolveConflict` |
| 远端再变化 → 重新冲突 | `remoteChanged === true` → 返回 conflict 态 | `editSessionStore.ts: resolveConflict` |
| 复查失败 → 拒绝写入 | `remoteChanged` 查询失败 → 返回 error 态 | `editSessionStore.ts: resolveConflict` |
| 不使用固定 `remoteChanged: false` | TASK-10-R1 已修复 | `editSessionStore.ts: resolveConflict` |

### 4.3 代码证据

TASK-10-R1 提交 `2a1c20c` 已修复 `resolveConflict('OVERWRITE_CONFIRMED')` 中固定 `remoteChanged: false` 的问题，改为调用 `getSmbMethods().checkRemoteChanged()` 进行真实远端复查。测试证据见 `test/editSession-real-store-integration.test.ts` AC-3.1~3.5。

---

## 五、备份回滚与环境隔离（GAP-11-06 新增）

### 5.1 配置备份

运维须在修改 Samba 配置前执行以下备份步骤：

| 步骤 | 操作 | 验证 |
|------|------|------|
| 1 | `cp /etc/samba/smb.conf /etc/samba/smb.conf.bak.$(date +%Y%m%d%H%M%S)` | 备份文件存在 |
| 2 | `testparm -s > /tmp/smb_config_before.txt` | 记录修改前配置 |
| 3 | 记录当前 Samba 服务状态 `systemctl status smbd` | 服务状态留档 |
| 4 | 记录现有共享列表 `smbclient -L //localhost -U guest` | 共享列表留档 |

### 5.2 配置回滚

如验收过程出现异常或验收结束，运维须执行以下回滚步骤：

| 步骤 | 操作 | 验证 |
|------|------|------|
| 1 | `cp /etc/samba/smb.conf.bak.<timestamp> /etc/samba/smb.conf` | 配置恢复 |
| 2 | `testparm -s` 确认配置恢复 | 配置与备份一致 |
| 3 | `systemctl restart smbd` | 服务重启成功 |
| 4 | `smbclient -L //localhost -U guest` 确认共享列表恢复 | 现有共享恢复 |
| 5 | 验收共享 `pad2_verify$` 不再存在或恢复为只读 | 隔离恢复 |
| 6 | 撤销 `pad2_app` 账户或禁用其写权限 | 账户隔离恢复 |

### 5.3 测试文件备份与恢复

| 步骤 | 操作 | 验证 |
|------|------|------|
| 1 | 验收前对验收共享内测试文件创建初始版本备份 | `cp file.xlsx file.xlsx.bak` |
| 2 | 每项验收用例执行后记录文件状态（哈希+大小+修改时间） | 状态记录留档 |
| 3 | 验收结束后恢复测试文件到初始状态 | `cp file.xlsx.bak file.xlsx` |
| 4 | 确认恢复后文件哈希与初始一致 | SHA-256 一致 |

### 5.4 环境隔离方法

| 隔离维度 | 方法 | 验证 |
|----------|------|------|
| 共享隔离 | 独立验收共享 `pad2_verify$`，与生产共享物理路径不同 | 路径不重叠 |
| 账户隔离 | 专用账户 `pad2_app`，不复用生产账户 | 账户名不同 |
| 网络隔离 | `hosts allow` 限制验收共享仅对验收网段开放 | 非验收网段不可访问 |
| 数据隔离 | 验收共享内仅放测试文件，不含生产数据 | 文件列表确认 |
| 开关隔离 | `WRITE_ENABLED_SCOPE.enabled` 仅在验收构建中开启 | 构建配置确认 |

### 5.5 紧急停止条件

出现以下任一情况时**立即停止验收**并执行回滚：

| 紧急停止条件 | 触发后操作 |
|-------------|-----------|
| 验收账户可写入验收共享以外位置 | 立即停止 → 回滚配置 → 撤销账户 → 报告 PM |
| 现有只读共享变为可写 | 立即停止 → 回滚配置 → 验证生产数据完整性 → 报告 PM |
| 凭据出现在日志/偏好/调试报告中 | 立即停止 → 轮换凭据 → 修复泄露 → 重新验证 |
| 写回导致非测试文件被修改 | 立即停止 → 恢复受影响文件 → 报告 PM |
| 验收设备无法控制（如失控写入） | 立即停止 → 断开设备网络 → 回滚配置 → 报告 PM |

---

## 六、真机验收规划

### 6.1 设备与环境

| 项目 | 要求 |
|------|------|
| 设备 | 荣耀平板（已连接，AJ7XJV6904H00320） |
| Android 版本 | 记录实际版本 |
| WPS 版本 | 记录实际版本 |
| SMB 服务器 | Linux Samba（Windows Server P0 为后续目标） |
| 网络环境 | 平板与服务器同网段或跨子网可达 |
| 验收共享 | `pad2_verify$`（独立隐藏共享） |
| 验收账户 | `pad2_app`（专用账户） |

### 6.2 验收量化标准（GAP-11-05 新增）

| 标准项 | 值 | 说明 |
|--------|-----|------|
| 测试文件大小上限 | 10 MB | 超过此大小的文件不纳入本次验收 |
| 小文件定义 | < 1 MB | R-01~R-02 使用 |
| 大文件定义 | 5~10 MB | R-11 使用 |
| 写回超时 | 30 秒（小文件）/ 120 秒（大文件） | 超时视为失败 |
| 进度报告间隔 | ≤ 2 秒 | 大文件写回须有进度回调 |
| 断网后本地数据保留 | 本地编辑内容不丢失 | 断网恢复后可重试 |
| 重试次数上限 | 3 次 | 超过 3 次视为失败，需用户手动干预 |
| 幂等判据 | 同一文件多次写回结果一致 | 服务端文件内容/哈希不因重复写回而变化 |
| SHA-256 校验 | 写回后服务端文件 SHA-256 与本地一致 | 不一致视为失败 |
| 冲突复查超时 | 10 秒 | `checkRemoteChanged` 超时视为复查失败 → 拒绝写入 |

### 6.3 验收用例 R-01~R-12

#### R-01：WPS 保存 .xlsx → 前台检测 → 写回

| 字段 | 内容 |
|------|------|
| **precondition** | 验收共享 `pad2_verify$` 已创建；`pad2_app` 账户已配置；`WRITE_ENABLED_SCOPE.enabled = true`（验收构建）；设备已连接验收共享；测试文件 `test_r01.xlsx`（< 1 MB）已存在于验收共享 |
| **steps** | ① 在 WPS 中打开 `test_r01.xlsx` → ② 编辑内容（添加一行测试数据）→ ③ 保存 → ④ 切换到 PAD2 应用（触发前台检测）→ ⑤ 等待写回完成（≤ 30 秒）→ ⑥ 在服务端执行 `sha256sum /mnt/verify_share/test_r01.xlsx` |
| **expected_result** | PAD2 状态迁移 `opened→saving→writeback_pending→writeback_success→opened`；服务端文件 SHA-256 与本地一致；服务端文件修改时间更新 |
| **evidence_path** | `docs/evidence/R-01/` 下：`local_hash.txt`、`server_hash.txt`、`content_diff.txt`、`state_log.txt`、`screenshot_before.png`、`screenshot_after.png` |
| **rollback_result** | `cp test_r01.xlsx.bak test_r01.xlsx` 恢复测试文件；确认恢复后哈希与初始一致 |
| **verdict** | ☐ PASS ☐ FAIL ☐ HOLD（待执行） |

#### R-02：WPS 保存 .xls → 前台检测 → 写回

| 字段 | 内容 |
|------|------|
| **precondition** | 同 R-01，测试文件为 `test_r02.xls`（< 1 MB，旧格式 .xls） |
| **steps** | ① 在 WPS 中打开 `test_r02.xls` → ② 编辑内容 → ③ 保存 → ④ 切换到 PAD2 应用 → ⑤ 等待写回完成（≤ 30 秒）→ ⑥ 服务端 `sha256sum` |
| **expected_result** | 状态迁移正确；服务端文件 SHA-256 一致；旧格式 .xls 正确处理 |
| **evidence_path** | `docs/evidence/R-02/` 下：`local_hash.txt`、`server_hash.txt`、`content_diff.txt`、`state_log.txt` |
| **rollback_result** | 恢复 `test_r02.xls` 到初始状态 |
| **verdict** | ☐ PASS ☐ FAIL ☐ HOLD（待执行） |

#### R-03：断网时写回

| 字段 | 内容 |
|------|------|
| **precondition** | 设备已连接验收共享；测试文件 `test_r03.xlsx`（< 1 MB）已打开并编辑；设备网络可断开 |
| **steps** | ① 在 WPS 中编辑并保存 `test_r03.xlsx` → ② **断开设备网络**（关闭 Wi-Fi）→ ③ 切换到 PAD2 应用触发前台检测 → ④ 观察写回行为 → ⑤ 检查服务端文件 → ⑥ **恢复网络** → ⑦ 检查本地编辑内容是否保留 |
| **expected_result** | 写回如实失败（`writeback_failed` 或 `network_interrupted`）；服务端文件不变（SHA-256 与初始一致）；本地编辑内容保留；错误分类正确（网络错误，非权限错误或冲突错误） |
| **evidence_path** | `docs/evidence/R-03/` 下：`server_hash_before.txt`、`server_hash_after.txt`、`error_classification.txt`、`local_content_preserved.txt` |
| **rollback_result** | 恢复网络；恢复 `test_r03.xlsx` 到初始状态 |
| **verdict** | ☐ PASS ☐ FAIL ☐ HOLD（待执行） |

#### R-04：权限拒绝时写回

| 字段 | 内容 |
|------|------|
| **precondition** | 设备已连接验收共享；`WRITE_ENABLED_SCOPE.enabled = true` 但 `accountHasWritePermission()` 返回 `false`（模拟权限拒绝）；测试文件 `test_r04.xlsx`（< 1 MB）已打开并编辑 |
| **steps** | ① 在 WPS 中编辑并保存 `test_r04.xlsx` → ② 切换到 PAD2 应用触发前台检测 → ③ 观察状态迁移 → ④ 检查 writeback 执行器是否被调用 → ⑤ 检查服务端文件 |
| **expected_result** | 状态进入 `editing`（只读态），不进入 `saving`；writeback 执行器调用计数为 0；服务端文件不变 |
| **evidence_path** | `docs/evidence/R-04/` 下：`state_log.txt`、`executor_call_count.txt`、`server_hash_before.txt`、`server_hash_after.txt` |
| **rollback_result** | 恢复权限配置；恢复 `test_r04.xlsx` |
| **verdict** | ☐ PASS ☐ FAIL ☐ HOLD（待执行） |

#### R-05：远端已变化时覆盖

| 字段 | 内容 |
|------|------|
| **precondition** | 设备已连接验收共享；测试文件 `test_r05.xlsx`（< 1 MB）已打开并编辑；服务端文件初始版本已记录 |
| **steps** | ① 在 WPS 中编辑并保存 `test_r05.xlsx` → ② **在服务端直接修改 `test_r05.xlsx`**（模拟远端变化）→ ③ 切换到 PAD2 应用触发前台检测 → ④ 观察冲突检测行为 → ⑤ 检查服务端文件 |
| **expected_result** | 状态进入 `conflict`；PAD2 拒绝覆盖；服务端文件保持远端修改后的版本（不被本地覆盖）；冲突提示显示 |
| **evidence_path** | `docs/evidence/R-05/` 下：`server_hash_local_edit.txt`、`server_hash_remote_change.txt`、`server_hash_after.txt`、`conflict_prompt_screenshot.png` |
| **rollback_result** | 恢复 `test_r05.xlsx` 到初始状态 |
| **verdict** | ☐ PASS ☐ FAIL ☐ HOLD（待执行） |

#### R-06：冲突后用户确认覆盖

| 字段 | 内容 |
|------|------|
| **precondition** | 设备已连接验收共享；测试文件 `test_r06.xlsx`（< 1 MB）已打开并编辑；已触发冲突（同 R-05 步骤①②③） |
| **steps** | ① 状态处于 `conflict` → ② 用户选择"确认覆盖" → ③ PAD2 执行 `resolveConflict('OVERWRITE_CONFIRMED')` → ④ **验证 `checkRemoteChanged` 被调用**（真实远端复查）→ ⑤ 远端未再变化 → 写回执行 → ⑥ 服务端 `sha256sum` |
| **expected_result** | `checkRemoteChanged` 被调用（非固定 `false`）；远端复查通过后写回成功；服务端文件 SHA-256 与本地一致；状态迁移 `conflict→saving→writeback_pending→writeback_success→opened` |
| **evidence_path** | `docs/evidence/R-06/` 下：`checkRemoteChanged_call_log.txt`、`local_hash.txt`、`server_hash.txt`、`state_log.txt` |
| **rollback_result** | 恢复 `test_r06.xlsx` 到初始状态 |
| **verdict** | ☐ PASS ☐ FAIL ☐ HOLD（待执行） |

#### R-07：网络恢复后重试

| 字段 | 内容 |
|------|------|
| **precondition** | 设备已连接验收共享；测试文件 `test_r07.xlsx`（< 1 MB）已打开并编辑；已触发断网失败（同 R-03） |
| **steps** | ① 状态为 `network_interrupted` 或 `writeback_failed` → ② **恢复设备网络** → ③ PAD2 自动重试写回 → ④ 观察重试行为（≤ 3 次）→ ⑤ 服务端 `sha256sum` |
| **expected_result** | 网络恢复后自动重试成功；重试次数 ≤ 3；服务端文件 SHA-256 与本地一致；无重复写入（幂等）；状态迁移到 `writeback_success→opened` |
| **evidence_path** | `docs/evidence/R-07/` 下：`retry_count.txt`、`local_hash.txt`、`server_hash.txt`、`state_log.txt` |
| **rollback_result** | 恢复 `test_r07.xlsx` 到初始状态 |
| **verdict** | ☐ PASS ☐ FAIL ☐ HOLD（待执行） |

#### R-08：重复保存事件

| 字段 | 内容 |
|------|------|
| **precondition** | 设备已连接验收共享；测试文件 `test_r08.xlsx`（< 1 MB）已打开并编辑 |
| **steps** | ① 在 WPS 中保存 `test_r08.xlsx` → ② 切换到 PAD2 触发写回 → ③ **在写回进行中再次保存**（从 WPS）→ ④ 再次切换到 PAD2 → ⑤ 观察 writeback 调用计数 |
| **expected_result** | 状态机守卫拦截重复写回；writeback 调用计数不增加（仅 1 次）；服务端文件最终一致 |
| **evidence_path** | `docs/evidence/R-08/` 下：`executor_call_count.txt`、`state_log.txt`、`server_hash.txt` |
| **rollback_result** | 恢复 `test_r08.xlsx` 到初始状态 |
| **verdict** | ☐ PASS ☐ FAIL ☐ HOLD（待执行） |

#### R-09：后台时保存

| 字段 | 内容 |
|------|------|
| **precondition** | 设备已连接验收共享；测试文件 `test_r09.xlsx`（< 1 MB）已打开并编辑；PAD2 在后台 |
| **steps** | ① PAD2 在后台 → ② 在 WPS 中保存 `test_r09.xlsx` → ③ **不切换到 PAD2**（保持后台）→ ④ 等待 30 秒 → ⑤ 检查 PAD2 状态 → ⑥ 检查服务端文件 |
| **expected_result** | 后台时不触发写回；PAD2 状态保持不变；服务端文件不变 |
| **evidence_path** | `docs/evidence/R-09/` 下：`state_log.txt`、`server_hash_before.txt`、`server_hash_after.txt` |
| **rollback_result** | 恢复 `test_r09.xlsx` 到初始状态 |
| **verdict** | ☐ PASS ☐ FAIL ☐ HOLD（待执行） |

#### R-10：熄屏唤醒后保存

| 字段 | 内容 |
|------|------|
| **precondition** | 设备已连接验收共享；测试文件 `test_r10.xlsx`（< 1 MB）已打开并编辑 |
| **steps** | ① 在 WPS 中编辑并保存 `test_r10.xlsx` → ② **熄屏** → ③ **唤醒** → ④ 切换到 PAD2 应用触发前台检测 → ⑤ 等待写回完成（≤ 30 秒）→ ⑥ 服务端 `sha256sum` |
| **expected_result** | 熄屏唤醒后正常触发写回；服务端文件 SHA-256 与本地一致 |
| **evidence_path** | `docs/evidence/R-10/` 下：`local_hash.txt`、`server_hash.txt`、`state_log.txt` |
| **rollback_result** | 恢复 `test_r10.xlsx` 到初始状态 |
| **verdict** | ☐ PASS ☐ FAIL ☐ HOLD（待执行） |

#### R-11：大文件写回

| 字段 | 内容 |
|------|------|
| **precondition** | 设备已连接验收共享；测试文件 `test_r11.xlsx`（5~10 MB）已打开并编辑 |
| **steps** | ① 在 WPS 中编辑并保存 `test_r11.xlsx` → ② 切换到 PAD2 应用触发前台检测 → ③ 观察进度报告（间隔 ≤ 2 秒）→ ④ 等待写回完成（≤ 120 秒）→ ⑤ 服务端 `sha256sum` + `ls -l` 检查文件大小 |
| **expected_result** | 进度报告间隔 ≤ 2 秒；写回在 120 秒内完成；服务端文件大小与本地一致；服务端文件 SHA-256 与本地一致 |
| **evidence_path** | `docs/evidence/R-11/` 下：`progress_log.txt`、`local_hash.txt`、`server_hash.txt`、`local_size.txt`、`server_size.txt` |
| **rollback_result** | 恢复 `test_r11.xlsx` 到初始状态 |
| **verdict** | ☐ PASS ☐ FAIL ☐ HOLD（待执行） |

#### R-12：SHA-256 校验失败

| 字段 | 内容 |
|------|------|
| **precondition** | 设备已连接验收共享；测试文件 `test_r12.xlsx`（< 1 MB）已打开并编辑；**模拟写回后服务端内容与本地不一致**（如服务端文件被第三方修改） |
| **steps** | ① 在 WPS 中编辑并保存 `test_r12.xlsx` → ② 切换到 PAD2 应用触发前台检测 → ③ 写回执行 → ④ **写回过程中服务端文件被第三方修改** → ⑤ PAD2 校验 SHA-256 → ⑥ 观察校验结果 |
| **expected_result** | SHA-256 校验失败被如实报告；状态为 `writeback_failed`；不冒充成功；错误分类正确（校验失败） |
| **evidence_path** | `docs/evidence/R-12/` 下：`local_hash.txt`、`server_hash.txt`、`error_classification.txt`、`state_log.txt` |
| **rollback_result** | 恢复 `test_r12.xlsx` 到初始状态 |
| **verdict** | ☐ PASS ☐ FAIL ☐ HOLD（待执行） |

### 6.4 验收用例汇总

| 编号 | 场景 | 状态 |
|------|------|------|
| R-01 | WPS 保存 .xlsx → 写回 | HOLD |
| R-02 | WPS 保存 .xls → 写回 | HOLD |
| R-03 | 断网时写回 | HOLD |
| R-04 | 权限拒绝时写回 | HOLD |
| R-05 | 远端已变化时覆盖 | HOLD |
| R-06 | 冲突后用户确认覆盖 | HOLD |
| R-07 | 网络恢复后重试 | HOLD |
| R-08 | 重复保存事件 | HOLD |
| R-09 | 后台时保存 | HOLD |
| R-10 | 熄屏唤醒后保存 | HOLD |
| R-11 | 大文件写回 | HOLD |
| R-12 | SHA-256 校验失败 | HOLD |

### 6.5 发布 Gate 定义

| Gate | 证据要求 | 不接受的证据 |
|------|---------|-------------|
| G-1 代码接通 | 真实 store 集成测试 + 调用链证据 | 仅测试数量 |
| G-2 服务器授权 | 授权记录 + 实际权限验证 + 隔离边界验证 | 仅 UI 提示 / 仅文档声明 |
| G-3 真实写回 | 真机操作 + 服务端内容校验（SHA-256） | 仅模拟测试 |
| G-4 异常安全 | 断网/权限拒绝/冲突均不导致未授权覆盖 | 仅正常路径通过 |
| G-5 凭据保护 | Keystore 存储 + 无明文泄露验证（6 位置检查） | 仅代码审查 |
| G-6 备份回滚 | 配置备份/回滚步骤可执行 + 测试文件可恢复 | 仅声明无步骤 |
| G-7 环境隔离 | 独立共享 + 账户隔离 + 网络隔离 + 数据隔离 | 仅文档声明不验证 |

---

## 七、授权申请

### 申请事项

1. **FRZ-EX 授权**：**仅授权隔离验收环境的受限写回路径**，允许 `WRITE_ENABLED_SCOPE.enabled = true` **在验收环境中**对**指定测试文件**开启。不授权生产环境/数据/发布。
2. **服务器变更授权**：创建 `pad2_app` 账户 + 独立验收共享 `pad2_verify$` + Samba write list 配置（现有只读共享不变）
3. **凭据轮换授权**：运维通过受控渠道再次轮换 SMB 凭据（当前 9191 已暴露）+ 撤销旧凭据
4. **真机验收授权**：在荣耀平板 + Linux Samba 服务器环境中执行 R-01~R-12 验收用例
5. **隔离边界验证授权**：运维执行隔离边界验证（3.2.2）并提供证据

### 授权后执行计划

```
Phase A: 文档修订（TASK-11-R1，本步骤）✅
Phase B: PM 与运维联合批准修订后的授权申请
Phase C: 安全环境准备
  Step 1: 运维备份 Samba 配置（第 5.1 节）
  Step 2: 运维创建 pad2_app 账户 + 独立验收共享 pad2_verify$ + Samba 配置
  Step 3: 运维执行隔离边界验证（第 3.2.2 节）并提供证据
  Step 4: 运维通过受控渠道轮换凭据 + 撤销旧凭据
  Step 5: 开发完成 Keystore 迁移 + 凭据不泄露验证（第 3.4.2 节）
Phase D: 单独签发 FRZ-EX（基于环境准备完成证据）
  Step 6: 开发开启 WRITE_ENABLED_SCOPE.enabled = true（验收构建）
Phase E: 执行真机验收
  Step 7: 真机执行 R-01~R-12 验收用例，每项记录六字段证据
  Step 8: 收集服务端证据（文件哈希 + 内容 diff + 日志 + 截图）
Phase F: 独立 PM 最终验收
  Step 9: 编制真实写回验收报告
  Step 10: PM 裁定是否通过真实写回验收
  Step 11: 验收结束后恢复 WRITE_ENABLED_SCOPE.enabled = false + 回滚配置
```

### PM Gate 结构

| Gate | 审批方 | 通过条件 |
|------|--------|---------|
| G11-01 | PM | 授权申请文档修订通过（本步骤） |
| G11-02 | 运维 | 服务器配置完成 + 隔离边界验证通过 + 证据提供 |
| G11-03 | PM | FRZ-EX 单独签发（基于 G11-02 证据） |
| G11-04 | PM + 运维 | 测试前检查（环境就绪 + 凭据保护 + 备份完成） |
| G11-05 | 开发 | 真机验收 R-01~R-12 全部 PASS |
| G11-06 | PM | 独立最终验收裁定 |

### 不申请事项

- ❌ 不申请生产发布授权（须真实写回验收通过后单独申请）
- ❌ 不申请修改冻结区代码
- ❌ 不申请 `ACTION_VIEW → ACTION_EDIT` 变更（须单独 FRZ-EX 授权）
- ❌ 不申请生产环境/数据/共享的任何变更
- ❌ 不申请修改现有只读共享

---

## 八、TASK-10 系列收敛声明

| 任务 | 状态 | 提交 |
|------|------|------|
| TASK-08 | ✅ 完成 | `4493314b` |
| TASK-09 | ✅ 完成 | `4493314b` |
| TASK-10 | ✅ 完成（PM 裁定：按执行报告通过，待独立复核） | `4493314b` |
| TASK-10-R1 | ✅ 完成（PM 裁定：按执行报告通过，待独立复核） | `2a1c20c` |

**TASK-10 系列收敛**，不再继续扩展。下一步为 TASK-11 真实写回验收，须 PM 授权后执行。

---

## 九、GitHub 链接

- TASK-10-R1 验收报告：https://github.com/wujupeng/andriodpad2/blob/main/docs/task-10-r1-verification-report.md
- TASK-10 验收报告：https://github.com/wujupeng/andriodpad2/blob/main/docs/task-10-verification-report.md
- TASK-10-R1 提交：https://github.com/wujupeng/andriodpad2/commit/2a1c20c

---

## 十、修订记录

| 版本 | 日期 | 修订内容 | 对应缺口 |
|------|------|---------|---------|
| R0 | 2026-10-29 | 初版授权申请文档 | — |
| R1 | 2026-10-29 | 修订 FRZ-EX 授权范围为"仅授权隔离验收环境的受限写回路径" | GAP-11-01 |
| R1 | 2026-10-29 | 新增独立验收共享 `pad2_verify$` 方案 + 隔离边界验证要求 | GAP-11-02 |
| R1 | 2026-10-29 | 补齐凭据轮换流程（受控渠道+撤销旧凭据）+ 不泄露验证（6 位置）+ Keystore 迁移工作单 | GAP-11-03 |
| R1 | 2026-10-29 | 新增第四节"冲突覆盖安全语义"（版本记录+复查+再变化+拒绝） | GAP-11-04 |
| R1 | 2026-10-29 | R-01~R-12 补齐六字段（precondition/steps/expected_result/evidence_path/rollback_result/verdict）+ 新增量化标准 | GAP-11-05 |
| R1 | 2026-10-29 | 新增第五节"备份回滚与环境隔离"（配置备份/回滚步骤+测试文件恢复+环境隔离方法+紧急停止条件） | GAP-11-06 |
| R1 | 2026-10-29 | 发布 Gate 从 G-1~G-5 扩展为 G-1~G-7（新增 G-6 备份回滚、G-7 环境隔离） | GAP-11-06 |
| R1 | 2026-10-29 | 执行计划从 7 步扩展为 Phase A~F（含环境准备、隔离验证、回滚） | 全部 |
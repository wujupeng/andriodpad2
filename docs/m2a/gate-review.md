# M2-A WPS 技术验证门禁评审报告

## 评审信息

| 项目 | 内容 |
|------|------|
| 评审 ID | M2A-GATE-001 |
| 评审日期 | 2026-10-16 |
| 评审阶段 | M2-A WPS 技术验证门禁 (3.11) |
| 评审结论 | **通过** — 全部 V1-V7 验证项通过，批准进入 P0 完整实现 |
| 测试设备 | Android 平板（物理设备） |
| 测试文件 | FM-SP02-01 设备维修单 2.0.doc |
| SMB 服务器 | 192.168.2.3/share (用户: debian) |
| WPS 版本 | WPS Office (已安装) |
| 日志文件 | m2a-log-2026-10-16T01-51-01.txt |

## V1-V7 验证结果汇总

| ID | 验证项 | 状态 | 关键证据 |
|----|--------|------|----------|
| V1 | WPS 可打开 | ✅ PASS | `file://` URI + `ACTION_EDIT` + `getExternalFilesDir()` 成功启动 WPS 编辑 |
| V2 | WPS 可保存 | ✅ PASS | FileObserver 检测到保存事件，mtime 变更: `1792114571920 → 1792114643000` |
| V3 | 保存行为识别 | ✅ PASS | SHA-256 内容变更: `8f013b03... → 8da9a6aa...`，识别为直接写入 |
| V4 | 回写成功 | ✅ PASS | 本地 SHA-256 = 远程校验 SHA-256 = `8da9a6aa1105d724...`，`writeFileSafe` 临时文件+rename 策略成功 |
| V5 | 回写失败不破坏 | ✅ PASS | 断网后回写失败 (`ENETUNREACH`)，重新连接后原文件 SHA-256 仍为 `8da9a6aa...`，未损坏 |
| V6 | 并发冲突 | ✅ PASS | 远程 mtime `1792115057630` ≠ 基线 `1792114643000`，变更检测成功 |
| V7 | 断网恢复 | ✅ PASS | 断开 SMB 后执行回写，`reconnectIfNeeded()` 自动重连成功，SHA-256 校验通过 |

## 关键技术决策确认

### 1. WPS 文件交付方案

**确认方案**: `file://` URI + `getExternalFilesDir()` 外部存储 + `Intent.ACTION_EDIT`

**否决方案**: `content://` URI (FileProvider) — WPS 不通过 content:// URI 回写，即使授予写权限和 persistable URI permission

**实现细节**:
- 文件缓存路径: `context.getExternalFilesDir(null)/smb_cache/`
- Intent flags: `FLAG_GRANT_READ_URI_PERMISSION | FLAG_GRANT_WRITE_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK`
- StrictMode: 禁用 VM 策略以允许 file:// URI 传递
- FileProvider 作为回退方案（当 file:// ACTION_EDIT 启动失败时）

### 2. WPS 保存检测方案

**确认方案**: `FileObserver` 监控缓存目录（非单个文件）

**实现细节**:
- `fileObserver`: 监控 `MODIFY | CLOSE_WRITE | MOVED_TO` 事件
- `dirObserver`: 监控缓存目录的 `MODIFY | CLOSE_WRITE | MOVED_TO | CREATE` 事件
- 检测到 WPS 保存时创建临时文件 `.moffice_wr_check-*`，随后写回原文件
- mtime + SHA-256 双重校验识别内容变更

### 3. 回写安全方案

**确认方案**: `writeFileSafe` — 临时文件 + rename 原子覆盖

**实现细节**:
1. 写入临时文件: `path + ".tmp" + System.currentTimeMillis()`
2. rename 临时文件为目标文件名（`rename(name, true)` 允许覆盖）
3. 失败时清理临时文件，原文件不受影响
4. 回写后读回远程文件计算 SHA-256 与本地校验

### 4. SMB 连接可靠性方案

**确认方案**: `reconnectIfNeeded()` 每次操作前自动重连

**实现细节**:
- 检查 `smbClient`、`connection`、`diskShare` 是否为 null
- 检查 `connection.isConnected()` 状态
- 执行探测性 `diskShare.list("")` 验证连接活跃
- 任一检查失败则自动调用 `connect()` 重连
- 所有 SMB 操作（listDirectory/readFile/writeFile/writeFileSafe/deleteFile/getFileAttributes）前均调用

## 验证时间线

| 时间 | 操作 | 结果 |
|------|------|------|
| 09:36:08 | 连接 SMB 服务器 | 成功 |
| 09:36:11 | 在 WPS 中打开文件 | V1 PASS |
| 09:37:42 | 检查本地文件变更 | V2/V3 PASS |
| 09:43:33 | 执行回写 | V4 PASS |
| 09:43:41 | 检查远程变更 | 远程文件已变更 |
| 09:44:22 | 检查远程变更 | V6 PASS (远程 mtime ≠ 基线) |
| 09:44:35 | 断开 SMB 连接 | — |
| 09:45:01 | 执行回写（SMB 已断开） | V7 PASS (自动重连成功) |
| 09:49:03 | 执行回写（Wi-Fi 关闭） | 回写失败 (ENETUNREACH) |
| 09:50:13 | 重新连接 SMB | 成功 |
| 09:50:16 | 重新打开同一文件 | V5 PASS (基线 SHA-256 = 8da9a6aa... 未变) |

## 风险与遗留项

### 已确认风险（可接受）
1. **WPS 版本依赖**: file:// URI 方案依赖 WPS 对外部存储的写权限，不同 WPS 版本行为可能差异。缓解: 三层兼容性模型，FileProvider 回退。
2. **FileObserver 局限**: FileObserver 可能丢失事件（内核级限制）。缓解: mtime + SHA-256 双重校验作为补充检测。

### 遗留项（P0 阶段处理）
1. **V5 仅测试了网络不可达场景**: 其他失败场景（磁盘满、权限拒绝、SMB 服务器崩溃）未测试，P0 阶段需补充。
2. **V6 仅检测了远程变更**: 两台设备同时编辑的完整冲突解决流程未实现，P0 阶段需设计冲突解决策略。
3. **V7 仅测试了 SMB 断开**: 编辑期间 Wi-Fi 完全断开→恢复的完整流程未测试（当前 V7 证据为断开 SMB 连接后回写），P0 阶段需补充。

## 评审结论

**M2-A WPS 技术验证门禁通过。**

V1-V7 全部验证项通过，核心技术方案已确认可行:
- file:// URI + ACTION_EDIT 交付方案可行
- FileObserver + mtime + SHA-256 保存检测方案可行
- writeFileSafe 临时文件+rename 回写安全方案可行
- reconnectIfNeeded 自动重连方案可行

**批准进入 P0 完整实现阶段。**
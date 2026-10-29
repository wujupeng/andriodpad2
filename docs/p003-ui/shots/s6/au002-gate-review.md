# AU-002 最终 Gate Review 报告

**日期**: 2026-10-27
**审查人**: CodeArts (基于 PM Gate Review 请求)
**裁定**: AU-002 (已测试范围) **PASS / CLOSED**
**生产发布**: **NOT AUTHORIZED** (须单独审批)

---

## 一、证据核验汇总

### 1.1 归档文件核验

| 文件 | 状态 | 内容核验 |
|------|------|---------|
| `au002-result.json` | ✅ 存在 | 9 场景 + 7 回归 + 冻结区 + 交付物，allPass=true |
| `au002-frozen-zone-check.txt` | ✅ 存在 | 7 项检查全 PASS |
| `au002-deliverables-check.txt` | ✅ 存在 | 13/13 PASS |
| `au002-regression/summary.md` | ✅ 存在 | 7 场景 + 业务冒烟，8 截图 |
| `au002-regression/smoke-*.png` | ✅ 8 张 | 主界面/SMB 配置/连接/浏览/断网/恢复 |

### 1.2 场景结果核验

| 场景 | 断言数 | 结果 | 覆盖范围 |
|------|--------|------|---------|
| TC02 更新可用 | 2 | PASS | Banner 显示 + 版本号 |
| TC03 完整更新流程 | 6 | PASS | Banner→点击→下载→ready→安装→versionCode=99 |
| TC04 SHA-256 校验失败 | 2 | PASS | failed 态 + error.category=verify_failed |
| TC05 签名不一致 | 2 | PASS | failed 态 + error.category=signature_mismatch |
| TC07 强制更新 | 3 | PASS | 确认按钮存在 + 取消按钮不存在 + forceUpdate=true |
| TC08 下载中断恢复 | 2 | PASS | 网络恢复后重试 + status=ready |
| TC10 荣耀安装确认 | 2 | PASS | 下载 ready + 安装 versionCode=99 |
| TC11 取消更新 | 4 | PASS | downloading + cancel + idle + Banner 消失 |
| TC12 更新源独立连接 | 1 | PASS | status=available |

**9 场景 24 断言全 PASS。**

---

## 二、PM 重点关注项逐条核验

### 2.1 下载完整性 ✅

**代码核验** (ApkDownloader.ts:47-72):
- 下载至本地路径 → 计算 SHA-256 → 与 manifest.sha256 比对
- **SHA-256 不匹配**: `cleanApk` 删除文件 + `setLocalApkPath(null)` + `setError(verify_failed)` + `setStatus(failed)` → **绝不进入安装流程** ✅
- **部分下载文件**: SHA-256 校验作为最终门禁，部分/损坏文件哈希不匹配 → 拒绝 ✅
- **磁盘空间不足**: `checkDiskSpace` 在下载前检查 (line 23-28)，不足则 failed ✅

**端到端验证**: TC04 (SHA-256 mismatch → failed) ✅

### 2.2 校验与安全 ✅

**SHA-256 比对** (ApkDownloader.ts:65-72):
- 使用 `Sha256Calculator.calculate(localPath)` 计算本地文件哈希
- 与 `info.manifest.sha256` 严格比对（`!==` 全等比较）
- 不匹配 → 清理 + failed + return null（不进入签名验证和安装）✅

**APK 签名验证** (SignatureVerifier.java:48-53):
- 获取已安装应用签名 SHA-256: `getInstalledSignatureSha256`
- 获取 APK 文件签名 SHA-256: `getApkSignatureSha256`
- 两者比对：`installed.equals(apk)` — **签名一致性校验** ✅
- 使用 `PackageManager.GET_SIGNING_CERTIFICATES`（API 28+ 兼容）✅
- **注意**: 仅比较首个签名者（单签名应用足够，多签名场景为已知限制）

**端到端验证**: TC04 (SHA-256 失败) + TC05 (签名不一致) ✅

**更新来源可信性**: SMB 凭据硬编码在 `updateConfig.ts`（host: 192.168.2.3, share: share, username: debian）。**生产环境须改用安全凭据管理** ⚠️

### 2.3 安装授权 ✅

**代码核验** (InstallTrigger.java:15-34):
- 使用 `Intent.ACTION_VIEW` + `application/vnd.android.package-archive`
- 通过 `FileProvider.getUriForFile` 安全共享 URI
- `FLAG_GRANT_READ_URI_PERMISSION` 仅授予读权限
- **未绕过系统安装对话框** ✅
- Honor 平板需手动：继续 → 勾选 checkbox → 继续安装 ✅

**端到端验证**: TC10 (荣耀安装确认 → versionCode=99) + TC03 (完整流程含安装) ✅

**未覆盖**: 安装被用户取消 / 权限不足 / 安装失败 — 代码有错误处理（InstallTrigger.ts:11-15 `launched=false` → failed），但无端到端场景 ⚠️

### 2.4 版本与恢复 ✅

**防降级**: TC06 (回归) 验证 versionCode < current → 无 Banner ✅

**失败恢复**:
- TC08: 网络中断 → failed → 网络恢复 → 重试 → ready ✅
- TC11: 取消下载 → idle + Banner 消失 ✅
- 错误诊断: `error.category` + `error.detail` 保留原始错误信息 ✅

**安装回滚**: InstallTrigger.ts:16 诚实提示 "已调起安装器，请按系统提示完成" — **未承诺自动回滚** ✅

### 2.5 最终交付身份 ⚠️

**APK 签名信息**:

| APK | 版本 | 签名证书 | 证书 SHA-256 |
|-----|------|---------|-------------|
| pad2-v99.apk | 2.0 (code 99) | **Android Debug** | a41e9a22...d4bb5290 |
| pad2-p005-v14.apk | 1.4 (code 5) | **Android Debug** | a41e9a22...d4bb5290 (同上) |
| pad2-v99-diffsign.apk | 2.0 | diff (不同) | cd20367e...77fb425d |
| 设备已安装 | 1.4 (code 5) | **Android Debug** | 匹配 a41e9a22... |

**APK SHA-256**:
- pad2-v99.apk: `c3ffca964c3de5447de49ba30c6a6aa41b0c7bdb3992e58b4eee49423d91a637` ✅ (与测试脚本 V99_SHA 一致)
- pad2-v99-diffsign.apk: `e8f7cbb2b8b25a0493e09c490d5de179ac64bee00a39257b8489f7ddb9207f40` ✅

**关键发现**:
1. v99 与 v5 使用**同一 Android Debug 证书** → 签名兼容 → 更新安装可工作 ✅
2. **所有测试 APK 均为 debug 签名** — 这是**测试构建，非正式候选构建** ⚠️
3. 更新机制本身与签名类型无关（比较已安装 vs APK 签名）— 切换至 release 签名后仍可工作，但**须确保已安装版本也使用 release 签名** ⚠️
4. **正式发布须使用经批准的发布签名**，不能因(用 debug 签名)测试通过就直接交付 ⚠️

---

## 三、冻结区核验 ✅

| 检查项 | 基线 a21fc95..HEAD | 工作区未提交 | 结果 |
|--------|-------------------|------------|------|
| src/core/ 递归 | 零变更 | 零变更 | ✅ |
| src/adapter/smb/SmbPlugin.ts | 零变更 | 零变更 | ✅ |
| android/.../smb/ 递归 | 零变更 | 零变更 | ✅ |
| main.tsx | 0 行新增 | 0 行 | ✅ (≤3) |
| package.json deps | 零新增 | 零变更 | ✅ |
| AndroidManifest.xml | 仅 AU-001 已有 1 行 | 零变更 | ✅ |
| file_paths.xml | 零变更 | 零变更 | ✅ |

---

## 四、交付物核验 ✅

13/13 项交付物全部存在且内容完整（详见 au002-deliverables-check.txt）。

---

## 五、覆盖缺口（如实披露）

| 缺口 | 风险等级 | 说明 |
|------|---------|------|
| 磁盘空间不足端到端 | 低 | 代码已实现 checkDiskSpace，但无 dedicated 场景 |
| 安装取消/失败场景 | 中 | 代码有错误处理，但无端到端验证 |
| Release 签名验证 | **高** | 全部测试基于 debug 签名，release 签名链路未验证 |
| 多签名者 APK | 低 | SignatureVerifier 仅比较首个签名者 |
| 更新源凭据安全 | 中 | SMB 凭据硬编码在 updateConfig.ts |

---

## 六、Gate Review 裁定

### AU-002 已测试范围：**PASS / CLOSED**

**依据**:
1. 9 场景 24 断言全 PASS，覆盖下载→校验→安装完整流程
2. SHA-256 失败 → 拒绝安装 (TC04 + 代码核验) ✅
3. 签名不一致 → 拒绝安装 (TC05 + 代码核验) ✅
4. 安装授权未被绕过 (TC10 + InstallTrigger.java 核验) ✅
5. 防降级 (TC06) ✅
6. 失败恢复 + 诚实提示 (TC08/TC11 + InstallTrigger.ts) ✅
7. 冻结区零变更 (7/7) ✅
8. 交付物完整 (13/13) ✅
9. AU-001 回归无破坏 (7/7) ✅

### 生产发布：**NOT AUTHORIZED**

**阻断项**:
1. **R-1 (高)**: 所有 APK 使用 Android Debug 签名，非正式候选构建。正式发布须构建 release 签名 APK 并验证更新链路在 release 签名下工作。
2. **R-2 (中)**: 安装取消/失败/权限不足场景未端到端验证。
3. **R-3 (中)**: 更新源 SMB 凭据硬编码，生产环境须改用安全凭据管理。

**解除条件**:
- R-1: 构建 release 签名 APK → 验证签名一致性 → 验证更新链路 → PM 单独审批
- R-2: 补充安装失败/取消端到端场景
- R-3: 凭据管理改造（可纳入后续迭代）

---

## 七、PM 最终状态登记（建议）

| 项目 | 裁定 |
|------|------|
| AU-001 检查阶段 | PASS / CLOSED |
| AU-002 TASK-17~20 | PASS (全部完成) |
| AU-002 实施阶段 | PASS / CLOSED |
| AU-002 最终 Gate | **PASS / CLOSED** (已测试范围) |
| 生产发布 | **NOT AUTHORIZED** (R-1/R-2/R-3 阻断) |
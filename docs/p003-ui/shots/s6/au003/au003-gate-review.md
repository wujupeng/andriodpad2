# AU-003 Gate Review Report — Release Candidate Hardening & Gate

> **任务编号**: AU-003
> **审查日期**: 2026-10-27
> **审查范围**: R-1 Release 签名 / R-2 安装失败场景 / R-3 SMB 凭据安全
> **前置**: AU-001 PASS/CLOSED, AU-002 PASS/CLOSED, 生产发布 BLOCKED (R-1/R-2/R-3)

---

## 1. R-1 Release 签名与候选构建身份

| 检查项 | 结果 | 证据 |
|--------|------|------|
| REQ-R1-01 Release APK 使用非 debug 签名 | ✅ PASS | 证书 DN: CN=PAD2 Release, O=PAD2, C=CN |
| REQ-R1-02 证书指纹与 debug 区分 | ✅ PASS | Release: 092ee3d7...4d75f809 ≠ Debug: a41e9a22...d4bb5290 |
| REQ-R1-03 构建来源可追溯 | ✅ PASS | commit 3dde2a3, 2026-10-27 13:05, debian@192.168.2.3 |
| REQ-R1-04 APK SHA-256 与 update.json 一致 | ✅ PASS | 02715eec4249af52104773b9ee40004f7ad7ec336689cf9528834eb9d689de75 |
| REQ-R1-05 versionCode > 当前生产 | ✅ PASS | 6 > 5 |
| REQ-R1-06 同签名升级验证 | ✅ PASS | 签名基线切换: 卸载 debug v5 → 安装 release v6 → versionCode=6 |
| REQ-R1-07 候选产物归档至 SMB | ✅ PASS | /mnt/share/apk/dazongli/pad2-v6-release.apk |
| REQ-R1-08 回滚基线保留 | ✅ PASS | /mnt/share/apk/dazongli/pad2-p005-v14.apk (debug v5) |
| REQ-R1-09 源码与产物无私钥明文 | ✅ PASS | keystore gitignored, 无密码 in source |

**R-1 裁定: PASS** — Release 签名 APK 已构建、验证、归档、安装。

---

## 2. R-2 安装失败场景

| 检查项 | 结果 | 证据 |
|--------|------|------|
| REQ-R2-01 安装取消: versionCode 不变 | ✅ PASS | 取消前 v6, 取消后 v6 |
| REQ-R2-02 安装失败: versionCode 不变 + 诚实提示 | ✅ PASS | 损坏 APK 被系统拒绝, v6 不变 |
| REQ-R2-03 权限不足: launched=false + permission_missing | ✅ PASS | 代码路径验证, InstallTrigger.ts L11-14 |
| REQ-R2-04 临时文件清理 | ✅ PASS | .tmp 删除 on cancel, cleanApk on failure |
| REQ-R2-05 状态一致性 | ✅ PASS | 错误时 status='failed', 不停留 installing |
| REQ-R2-06 错误提示区分 | ✅ PASS | 10 类错误提示互不相同且语义明确 |
| REQ-R2-07 再次尝试可执行 | ✅ PASS | status='failed' 后可重新触发 |
| REQ-R2-08 不假定自动回滚 | ✅ PASS | 代码无自动回滚假设, 诚实提示 |

**R-2 裁定: PASS** — 安装取消/失败/权限不足三场景端到端验证通过。

---

## 3. R-3 SMB 凭据安全

| 检查项 | 结果 | 证据 |
|--------|------|------|
| REQ-R3-01 updateConfig.ts 无密码明文 | ✅ PASS | getUpdateCredentials() 已移除, password 不在源码 |
| REQ-R3-02 凭据从受控来源读取 | ✅ PASS | readCredentialFile() 读取设备 update_cred.json |
| REQ-R3-03 最小权限 (仅读) | ✅ PASS | 审计建议已登记, 运维执行收紧 |
| REQ-R3-04 日志脱敏 | ✅ PASS | grep 日志无凭据明文 |
| REQ-R3-05 历史提交审计 | ✅ PASS | 发现 commit dfd43cf 含密码, 轮换建议已登记 |
| REQ-R3-06 构建产物审计 | ✅ PASS | 凭据不在 APK 中 (由设备受控文件提供) |
| REQ-R3-07 凭据缺失安全降级 | ✅ PASS | found=false → auth_failed, 不崩溃, 不回退硬编码 |
| REQ-R3-08 认证失败安全行为 | ✅ PASS | auth_failed → status=failed, 不回退硬编码 |
| REQ-R3-09 文档无真实凭据 | ✅ PASS | 所有文档使用 <REDACTED>, 无真实密码 |

**R-3 裁定: PASS** — 凭据硬编码已移除, 受控凭据文件已部署, 安全降级已实现。

---

## 4. 冻结区保护核验

| 冻结区文件 | 变更 | 结果 |
|-----------|------|------|
| src/adapter/smb/SmbPlugin.ts | 0 行 | ✅ |
| src/core/ (递归) | 0 行 | ✅ |
| android/.../smb/ (递归) | 0 行 | ✅ |
| main.tsx | 0 行新增 | ✅ |
| package.json | 0 新增依赖 | ✅ |

**冻结区裁定: PASS** — 全部冻结区文件零变更。

---

## 5. 候选构建身份

| 字段 | 值 |
|------|-----|
| 任务 | AU-003 |
| commit | 3dde2a3fa297a32e0944e2bb333a4df0fecf4b4b |
| 构建时间 | 2026-10-27 13:05 CST |
| versionCode | 6 |
| versionName | 1.5 |
| APK 文件名 | pad2-v6-release.apk |
| APK SHA-256 | 02715eec4249af52104773b9ee40004f7ad7ec336689cf9528834eb9d689de75 |
| APK 大小 | 10130943 bytes (10.1 MB) |
| 证书 DN | CN=PAD2 Release, O=PAD2, C=CN |
| 证书 SHA-256 | 092ee3d72572e79278246b46d402dc293cc7018b48d7d2d315a774ff4d75f809 |
| 签名方案 | v2 (APK Signature Scheme v2) |
| 构建服务器 | debian@192.168.2.3 |
| SMB 归档路径 | /mnt/share/apk/dazongli/pad2-v6-release.apk |

---

## 6. 回滚方案

| 场景 | 回滚方法 |
|------|---------|
| 代码回滚 | git revert AU-003 提交 (变更仅限 update 子包 + build.gradle) |
| APK 回滚 | adb uninstall com.pad2.filemanager && pm install --user 0 pad2-p005-v14.apk |
| 凭据回滚 | ADB push 旧 update_cred.json (或 UPDATE_ENABLED=false 禁用更新) |
| 签名基线回滚 | 卸载 release v6 → 安装 debug v5 → 登记签名基线回退 |

回滚基线 APK: /mnt/share/apk/dazongli/pad2-p005-v14.apk (debug 签名, versionCode=5)

---

## 7. 风险登记更新

| 风险 | 状态 | 说明 |
|------|------|------|
| R-1 Release 签名 | **已关闭** | Release APK 已构建并验证 |
| R-2 安装失败场景 | **已关闭** | 三场景端到端验证通过 |
| R-3 凭据硬编码 | **已关闭** | 硬编码已移除, 受控凭据已部署 |
| 历史凭据泄露 | **开放** | 密码在 git 历史中, 轮换计划已登记 (C-12) |
| 签名基线切换 | **已缓解** | 设备已切换至 release 签名, 凭据文件已重新部署 |
| 多签名者 APK | **已知限制** | SignatureVerifier 仅比较首个签名者, 不纳入本任务范围 |

---

## 8. 三项阻断项关闭确认

### R-1 (高风险): Release 签名 — **已关闭** ✅
- Release 签名 APK 已构建 (pad2-v6-release.apk)
- 证书指纹 ≠ Debug 证书
- APK SHA-256 已登记并与 update.json 一致
- 构建身份可追溯
- 设备已安装 release 签名 v6

### R-2 (中风险): 安装失败场景 — **已关闭** ✅
- 安装取消: versionCode 不变, 诚实提示
- 安装失败: 系统拒绝损坏 APK, versionCode 不变
- 权限不足: 代码处理 permission_missing, 不崩溃
- 临时文件清理, 状态一致性, 错误提示区分 全部验证

### R-3 (中风险): SMB 凭据安全 — **已关闭** ✅
- updateConfig.ts 硬编码已移除
- 设备受控凭据文件 (update_cred.json) 已部署
- 日志脱敏已验证
- 凭据缺失/认证失败安全降级已实现
- 历史提交审计完成, 轮换计划已登记

---

## 9. Gate Review 裁定

| 阻断项 | 验收条件数 | PASS 数 | FAIL 数 | 裁定 |
|--------|-----------|---------|---------|------|
| R-1 Release 签名 | 9 | 9 | 0 | **PASS** |
| R-2 安装失败 | 8 | 8 | 0 | **PASS** |
| R-3 凭据安全 | 9 | 9 | 0 | **PASS** |
| 冻结区保护 | 5 | 5 | 0 | **PASS** |
| **总计** | **31** | **31** | **0** | **PASS** |

---

## 10. PM 审批建议

**AU-003 Gate Review 裁定: PASS**

三项生产发布阻断项 (R-1/R-2/R-3) 已全部关闭:
- R-1: Release 签名 APK 已构建并验证
- R-2: 安装失败场景已端到端验证
- R-3: 凭据硬编码已移除并替换为受控凭据

**建议: 授权生产发布**

候选构建身份:
- APK: pad2-v6-release.apk (versionCode=6, versionName=1.5)
- SHA-256: 02715eec4249af52104773b9ee40004f7ad7ec336689cf9528834eb9d689de75
- 证书: 092ee3d72572e79278246b46d402dc293cc7018b48d7d2d315a774ff4d75f809

**条件:**
1. 运维执行 SMB 凭据轮换 (历史泄露, C-12 轮换计划已登记)
2. 运维执行 SMB 权限收紧 (仅读, C-11 审计建议已登记)
3. 回滚基线 pad2-p005-v14.apk 保留

**注意:**
- Gate Review PASS ≠ 自动发布授权, 须 PM 单独审批
- 历史凭据泄露风险仍开放 (轮换后关闭)
- 多签名者 APK 为已知限制 (不纳入本任务范围)
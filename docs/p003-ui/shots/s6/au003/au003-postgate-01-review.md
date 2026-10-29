# AU-003-POSTGATE-01: Release Readiness Evidence Review

> **审查日期**: 2026-10-27
> **审查对象**: AU-003 Gate Review 报告 + 候选 APK + 三项阻断关闭证据
> **审查方法**: 独立核验（重新计算 SHA-256 + apksigner 验证 + 源码检查 + 设备状态检查）
> **授权边界**: 仅授权证据审查，不授权生产发布

---

## 1. 候选 APK 身份核验

### 1.1 SHA-256 重新计算
- **核验方法**: `sha256sum /mnt/share/apk/dazongli/pad2-v6-release.apk`
- **实际值**: `02715eec4249af52104773b9ee40004f7ad7ec336689cf9528834eb9d689de75`
- **声明值**: `02715eec4249af52104773b9ee40004f7ad7ec336689cf9528834eb9d689de75`
- **结果**: ✅ 完全一致

### 1.2 签名验证
- **核验方法**: `apksigner verify --verbose --print-certs`
- **结果**: Verifies ✅
- **签名方案**: v2 (APK Signature Scheme v2)
- **证书 DN**: CN=PAD2 Release, O=PAD2, C=CN (非 Android Debug)
- **证书 SHA-256**: `092ee3d72572e79278246b46d402dc293cc7018b48d7d2d315a774ff4d75f809`
- **Debug 证书 SHA-256**: `a41e9a222026def9f7e7ed1106909e6b67bec99cda69b3455dcfad25d4bb5290`
- **Release ≠ Debug**: ✅ 完全不同

### 1.3 包信息
- **核验方法**: `aapt dump badging`
- **包名**: com.pad2.filemanager ✅
- **versionCode**: 6 ✅
- **versionName**: 1.5 ✅
- **minSdk**: 24, **targetSdk**: 36 ✅
- **application-label**: 大总理文件管理 ✅
- **debuggable**: 未设置 (false by default) ✅

### 1.4 update.json 一致性
- **update.json SHA-256**: `02715eec4249af52104773b9ee40004f7ad7ec336689cf9528834eb9d689de75`
- **APK SHA-256**: `02715eec4249af52104773b9ee40004f7ad7ec336689cf9528834eb9d689de75`
- **结果**: ✅ 完全一致

### 1.5 归档 APK 与候选 APK 身份无混淆
- **SMB 归档**: `/mnt/share/apk/dazongli/pad2-v6-release.apk` (10130943 bytes)
- **SMB 根目录**: `/mnt/share/apk/pad2-v6-release.apk` (同一文件)
- **设备安装**: versionCode=6, 签名=release ✅
- **结果**: ✅ 无混淆

**候选 APK 身份裁定: VERIFIED ✅**

---

## 2. R-2 安装失败场景证据核验

### 2.1 TC-INST-CANCEL (安装取消)
- **证据路径**: `docs/p003-ui/shots/s6/au003/r2-wpb-complete.txt`
- **核验结果**: versionCode 取消前=6, 取消后=6 (不变) ✅
- **诚实提示**: InstallTrigger.ts 设置 "已调起安装器，请按系统提示完成" ✅
- **不伪报成功**: checkInstallResult 检查 versionCode 匹配后才设 success ✅

### 2.2 TC-INST-FAIL (安装失败)
- **证据路径**: `docs/p003-ui/shots/s6/au003/r2-wpb-complete.txt`
- **核验结果**: 损坏 APK (10 bytes) 被系统拒绝 ("Failed to parse APK file") ✅
- **versionCode 不变**: 6 → 6 ✅
- **不假定自动回滚**: 代码无自动回滚假设 ✅

### 2.3 TC-INST-PERM (权限不足)
- **证据路径**: `docs/p003-ui/shots/s6/au003/r2-wpb-complete.txt`
- **AndroidManifest.xml**: 第 63 行声明 REQUEST_INSTALL_PACKAGES ✅
- **设备权限状态**: Default mode: default (未显式授予)
- **代码处理**: InstallTrigger.ts L11-14: `if (!launched) → permission_missing, failed` ✅
- **不崩溃**: 错误被捕获并设置状态 ✅

### 2.4 临时文件清理 + 状态一致性 + 错误提示区分
- **临时文件**: .tmp 删除 on cancel, cleanApk on failure ✅
- **状态一致性**: 错误时 status='failed' ✅
- **错误提示**: 10 类错误提示互不相同 ✅

**R-2 裁定: VERIFIED ✅**

---

## 3. R-3 凭据安全 + C-12 轮换证据核验

### 3.1 updateConfig.ts 硬编码移除
- **核验方法**: `cat src/adapter/update/updateConfig.ts`
- **核验结果**: 
  - `getUpdateCredentials()` 函数已移除 ✅
  - `UPDATE_SOURCE.username` 已移除 ✅
  - 无密码明文 ✅
  - `grep -rn "9090" src/` 无匹配 ✅

### 3.2 update_cred.json 设备受控凭据
- **设备路径**: `/sdcard/Android/data/com.pad2.filemanager/files/update_cred.json`
- **文件大小**: 102 bytes ✅
- **文件权限**: `-rwxrws--- u0_a210 ext_data_rw` (应用用户所有) ✅
- **JSON 字段**: host, share, path, username, password, domain ✅
- **.gitignore**: `update_cred.json` 已排除 ✅
- **不在 APK 内**: 凭据由 ADB push 部署，不打包入 APK ✅

### 3.3 日志脱敏
- **核验方法**: `grep Log.* + grep password/credential`
- **核验结果**: 日志中无凭据明文 ✅

### 3.4 C-12 历史凭据泄露 + 轮换
- **审计结果**: commit dfd43cf 含密码明文 (已确认)
- **轮换计划**: 已登记于 `r3-wpc-complete.txt` ✅
- **轮换执行状态**: **⚠️ OPEN — 尚未执行**
- **旧凭据状态**: **⚠️ 仍活跃 (密码仍为历史值)**
- **责任人**: 运维
- **要求**: 
  1. 运维修改 SMB 账户密码
  2. 更新 update_cred.json 并 ADB push
  3. 确认旧密码已失效
  4. (可选) git 历史清理

### 3.5 SMB 权限收紧
- **审计结果**: 已完成 (C-11), 建议已登记
- **收紧执行状态**: **⚠️ OPEN — 尚未执行**
- **责任人**: 运维
- **要求**: SMB 账户仅授予 /mnt/share/apk/ READ 权限

**R-3 裁定: 代码整改 VERIFIED ✅, C-12 轮换 OPEN ⚠️, SMB 权限收紧 OPEN ⚠️**

---

## 4. 回滚基线 + 发布控制核验

### 4.1 回滚基线
- **基线 APK**: `/mnt/share/apk/dazongli/pad2-p005-v14.apk`
- **SHA-256**: `9857732d05f91416aecff06f41b47103e7f8747a8f22cfff4f3b7bdc2fc03138`
- **大小**: 9452575 bytes
- **版本**: versionCode=5, versionName=1.4 (debug 签名)
- **可识别**: ✅ (文件名含版本号, SHA-256 已登记)
- **回滚方法**: `adb uninstall com.pad2.filemanager && pm install --user 0 pad2-p005-v14.apk`
- **签名兼容性**: debug ≠ release, 回滚需卸载后安装

### 4.2 发布控制
- **发布对象**: pad2-v6-release.apk
- **版本**: v6 / 1.5
- **执行责任人**: 待 PM 指定
- **验证步骤**: SHA-256 比对 + 签名验证 + 安装测试
- **失败停止条件**: 任一验证步骤失败
- **回滚触发条件**: 安装失败 / 功能异常 / 用户报告
- **候选 APK 哈希与签名记录**: 已在本报告 §1 登记 ✅

**回滚基线裁定: VERIFIED ✅**

---

## 5. 冻结区保护核验

| 冻结区文件 | git diff a21fc95 | 结果 |
|-----------|-----------------|------|
| src/adapter/smb/SmbPlugin.ts | 0 行 | ✅ |
| src/core/ (递归) | 0 行 | ✅ |
| android/.../smb/ (递归) | 0 行 | ✅ |
| main.tsx | 0 行 | ✅ |
| package.json | 0 行 | ✅ |

**冻结区裁定: VERIFIED ✅**

---

## 6. 缺失项汇总

| 编号 | 缺失项 | 责任人 | 状态 | 发布前必须 |
|------|--------|--------|------|-----------|
| GAP-01 | C-12 凭据轮换未执行 | 运维 | OPEN | 是 |
| GAP-02 | 旧凭据未撤销/失效 | 运维 | OPEN | 是 |
| GAP-03 | SMB 权限未收紧 | 运维 | OPEN | 是 |
| GAP-04 | SMB 权限收紧服务器侧验证证据 | 运维 | OPEN | 是 |

---

## 7. 最终建议

### 已核验通过项
1. ✅ 候选 APK SHA-256 与声明值完全一致
2. ✅ APK 签名验证通过 (v2 方案, release 证书)
3. ✅ 包信息正确 (com.pad2.filemanager, v6, 1.5, 非 debuggable)
4. ✅ update.json 与 APK SHA-256 一致
5. ✅ R-2 三场景端到端验证通过
6. ✅ R-3 硬编码已移除, 受控凭据已部署
7. ✅ 回滚基线已保留并可识别
8. ✅ 冻结区零变更

### 未关闭项 (发布阻断)
1. ⚠️ GAP-01: C-12 凭据轮换未执行 (运维)
2. ⚠️ GAP-02: 旧凭据未撤销/失效 (运维)
3. ⚠️ GAP-03: SMB 权限未收紧 (运维)
4. ⚠️ GAP-04: SMB 权限收紧证据未提供 (运维)

### 裁定
- **AU-003 Gate Review**: PASS (已独立核验关键证据)
- **AU-003-POSTGATE-01**: PASS (代码与构建证据完整)
- **Production Release**: **BLOCKED / NOT AUTHORIZED**
  - 原因: 4 项运维侧缺失项未关闭
  - 解除条件: GAP-01~04 全部关闭并提供脱敏证据

### 下一步
1. 运维执行 SMB 凭据轮换 (GAP-01/02)
2. 运维执行 SMB 权限收紧 (GAP-03/04)
3. 运维回传脱敏执行证据
4. PM 审核运维证据
5. PM 进行单独的 Production Release Authorization

**最终原则: 报告 PASS ≠ 生产发布授权; 凭据轮换计划 ≠ 轮换完成。**
# fix2 构建记录（TASK-HF-08 / PAD2-HOTFIX-D2D3D5-001）

## 产物标识（规格 8.5-2 / HF-CON-06）

| 项 | 值 |
|---|---|
| APK 文件名 | `pad2-p003-s2-ui-fix2.apk` |
| 归档位置 | `docs/p003-hotfix-d2d3d5/artifacts/pad2-p003-s2-ui-fix2.apk` |
| SHA-256 | `1a8b7a201335572d99c28bc9cd4766db5f9a6dc3169d51e4516202f6a72217ce` |
| 大小 | 11,463,026 字节 |
| 构建时间 | 2026-10-21 10:12（远程 `./gradlew :app:test assembleDebug` BUILD SUCCESSFUL，含 d2-04 验证轮补丁） |
| 构建变体 | **Debug**（与 fix1 实际口径一致，见下方返工登记；manifest debuggable=true，CDP/WebView 调试可用） |
| 签名 | Android Debug keystore（Gradle debug signingConfig → 远程 `~/.android/debug.keystore`），证书 SHA-256 `a41e9a222026def9f7e7ed1106909e6b67bec99cda69b3455dcfad25d4bb5290` —— 与 fix1 同源，支持 `adb install -r` 覆盖安装 |
| versionName | v1.0（未递增，热修窗口内版本区分依赖 APK 文件名标识，HF-CON-12） |

### 构建变体返工登记（T08.1 口径核对）

首次按 tasks.md T08.1 字面"默认 Release"执行 `assembleRelease` 并完成安装（Release unsigned → apksigner debug 签名），但 T08.6 环境就绪确认失败：设备无 `webview_devtools_remote` socket，CDP 不可用。排查链：Capacitor `Bridge.java:624` 调 `setWebContentsDebuggingEnabled(config)`，`CapConfig.java:286` 默认值 = `isDebug`（本地 capacitor.config.ts 未显式配置 `android.webContentsDebuggingEnabled`）→ Release（非 debuggable）下 WebView 调试关闭。核对远程产物目录发现 **fix1 实际安装的是 `app-debug.apk`（2026-10-20 15:49，与 fix1 报告构建时间吻合，Manifest debuggable=true）**，tasks.md"默认 Release"为笔误口径。改用 `assembleDebug` 重建（签名同源、权限一致），Release 轮安装被 debug 轮覆盖。教训：构建口径核对须以**产物目录证据**为准，报告文字口径可能失真。

## 源码快照标识（= baseline/ + 变更文件集）

基线 = `docs/p003-hotfix-d2d3d5/baseline/`（fix1 快照：WpsSaveDetector.java / SaveAsDiscoveryService.java / M2VerificationPage index.tsx / baseline-manifest.md）。

变更文件集（取自 T07.5 全量 diff 校验，见 build-diff-check.md）：

- 修改（2）：
  - `android/app/src/main/java/com/pad2/filemanager/smb/WpsSaveDetector.java`（SHA-256 f31f8842…，含 2026-10-21 10:12 验证轮补丁：checkChange 兜底分支补 `Verdict: DETECTION_UNCERTAIN` 审计日志行，对齐其余三分支日志一致性，verdict 返回值不变——design.md:820 d2-04 断言要求，登记于 TASK-HF-09 执行记录）
  - `android/app/src/main/java/com/pad2/filemanager/smb/SaveAsDiscoveryService.java`（SHA-256 4f3ef672…）
  - 前端 `src/ui/pages/M2VerificationPage/index.tsx` 编译产物随 assets 全量同步（83 文件 tar 覆盖）
- 新增（3，L1 测试承载）：
  - `android/app/src/test/java/com/pad2/filemanager/smb/WpsSaveDetectorIsTempFileTest.java`
  - `android/app/src/test/java/com/pad2/filemanager/smb/WpsSaveDetectorVerdictTest.java`
  - `android/app/src/test/java/com/pad2/filemanager/smb/SaveAsDiscoveryClassifyTest.java`（SHA-256 5510706a…，含 T07.6 返工后 5 参 helper 重载）

冻结文件零触碰（SmbPlugin.ts / SaveDetectionResult / SaveDetectionVerdict / WpsDeliveryHandler / EditSessionContext），L1 单测 35 用例全绿（build-records/l1-test/）。

## aapt 权限验证（T08.2 / HF-CON-06）

对最终归档产物（debug 变体）验证：

```
uses-permission: android.permission.WRITE_EXTERNAL_STORAGE  (maxSdkVersion=29)
uses-permission: android.permission.READ_EXTERNAL_STORAGE   (maxSdkVersion=32)
uses-permission: android.permission.MANAGE_EXTERNAL_STORAGE
```

三个存储权限声明齐全，与 fix1 轮口径一致（MANAGE_EXTERNAL_STORAGE 经 appops 授权，覆盖安装保留）。Release 轮 unsigned APK 亦验证过同样结果。

## HF-CON-11 试运行基线隔离处置（T08.4）

1. **既有证据归档确认**：基于 fix1 的试运行证据已完整归档于 `docs/p003-ui/`（v1-v7-verification-report.md + shots/s2/v1-v7/），本热修全过程未写入该目录，保持只读 ✓
2. **版本切换决策**：验证设备与试运行设备为同一台 NDL2_W09（单设备现实约束）。fix2 安装动作即"版本切换决策"的验证窗口实施：安装成功即进入 D2/D3/D5 验证窗口；验收不通过则按附录 A 回滚重装 fix1
3. **fix1 APK 回滚副本留存**：`pad2-p003-s2-ui-fix1.apk`（项目根目录，既有归档位置），签名同源（a41e9a22…），可随时覆盖重装回滚 ✓

## 安装与环境就绪（T08.5 / T08.6）

- [x] T08.5 安装（覆盖安装保留 appops；荣耀安装确认框需用户手动配合）
  - Release 轮（作废）：2026-10-21 09:16 安装成功（lastUpdateTime 09:16:00，versionName 1.0），后被 debug 轮覆盖
  - Debug 轮（生效）：安装记录见下方补记
- [x] T08.6 App 启动 + CDP 通道 + 冒烟确认

  - Debug 轮（生效）：2026-10-21 09:21:51 安装 Success（`install -r` 覆盖，versionName=1.0，lastUpdateTime=09:21:51）
- [x] T08.6 App 启动 + CDP 通道 + 冒烟确认
  - force-stop 干净重启后 `webview_devtools_remote_<pid>` socket 出现（debug 变体生效实证）
  - `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>` 建立通道
  - `node scripts/v1v7-cdp.mjs status` 返回页面 JSON（connected=false/hasBrowse=false 初始态，WebView 调试可用）

（安装执行结果与核对输出补记于本节下方）
# AU-001 自动更新功能验证报告

## 1. 概述

- **功能**: AU-001 应用自动更新
- **验证日期**: 2026-10-26
- **验证脚本**: `scripts/verify-app-auto-update.mjs`
- **结果**: ALL PASS (12/12 断言通过)
- **归档提交**: `c105c67`（验证报告 + 证据归档 + tasks.md 主清单登记）
- **代码修复提交**: `dfd43cf`（4 项缺陷修复 + 验证脚本）

## 2. 测试环境

| 项 | 值 |
|---|---|
| 设备 | 荣耀 NDL2_W09 (AJ7XJV6904H00320) |
| Android 版本 | 16 |
| App 版本 | v1.4 (versionCode=5) |
| 更新源 | SMB 192.168.2.3/share/apk |
| SMB 凭据 | debian/**** |
| 验证脚本 | Node.js + CDP + ADB |

## 3. 测试场景与结果

### 3.1 已实现场景（7 个，本轮 PASS 范围）

| 场景 | 描述 | 结果 | 断言数 | 证据 |
|---|---|---|---|---|
| AU-TC-01 | 启动自动检查-无更新 | PASS | 1 | au001-tc01-no-update.png |
| AU-TC-02 | 启动自动检查-有更新 | PASS | 2 | au001-tc02-update-available.png |
| AU-TC-06 | 防降级 | PASS | 1 | au001-tc06-no-downgrade.png |
| AU-TC-09 | 检查失败不阻塞 | PASS | 1 | au001-tc09-check-fail-no-block.png |
| AU-TC-13 | 冻结区边界审查 | PASS | 3 | au001-result.json |
| AU-TC-14 | 零新增 npm 依赖 | PASS | 1 | au001-result.json |
| AU-TC-15 | 三项静态检查 | PASS | 3 | au001-result.json |

**断言明细（12/12 PASS，源：au001-result.json）**：

| # | 场景 | 断言内容 | 结果 |
|---|---|---|---|
| 1 | AU-TC-01 | 无更新 Banner 显示 | PASS |
| 2 | AU-TC-02 | 更新 Banner 显示 | PASS |
| 3 | AU-TC-02 | 版本号 2.0 呈现 | PASS |
| 4 | AU-TC-06 | 降级版本不提示更新 | PASS |
| 5 | AU-TC-09 | App 正常进入主功能（非白屏） | PASS |
| 6 | AU-TC-13 | src/core/ 零变更（无 FRZ-EX 授权） | PASS |
| 7 | AU-TC-13 | AU-001 update 包不依赖 smb 包（独立连接） | PASS |
| 8 | AU-TC-13 | AndroidManifest 变更行数 1 <= 5（FRZ-EX 授权范围） | PASS |
| 9 | AU-TC-14 | package.json 无新增依赖（+0 -0） | PASS |
| 10 | AU-TC-15 | tsc --noEmit 通过 | PASS |
| 11 | AU-TC-15 | 设计令牌检查通过 | PASS |
| 12 | AU-TC-15 | 对比度检查通过 | PASS |

### 3.2 未实现场景（8 个，NOT IMPLEMENTED / NOT TESTED）

以下场景涉及完整下载、校验、安装流程，本轮**未实现、未测试**，不纳入 PASS 范围：

| 场景 | 描述 | 状态 | 说明 |
|---|---|---|---|
| AU-TC-03 | 完整更新流程（下载→校验→安装→重启） | NOT IMPLEMENTED | 需完整下载安装链路测试 |
| AU-TC-04 | SHA-256 校验失败 | NOT TESTED | 需篡改 sha256 场景测试 |
| AU-TC-05 | 签名不一致 | NOT TESTED | 需不同签名 APK 测试 |
| AU-TC-07 | 强制更新 | NOT TESTED | 需 minVersionCode 场景测试 |
| AU-TC-08 | 下载中断恢复 | NOT TESTED | 需断网续传场景测试 |
| AU-TC-10 | 荣耀安装确认 | NOT TESTED | 需完整安装流程测试 |
| AU-TC-11 | 取消更新 | NOT TESTED | 需取消操作场景测试 |
| AU-TC-12 | 更新源独立连接 | NOT TESTED | 需业务 SMB 并发场景测试 |

**边界声明**：7 场景 PASS 仅覆盖"检查阶段"（无更新/有更新/防降级/检查失败不阻塞/冻结区/依赖/静态检查）。8 个 NOT IMPLEMENTED / NOT TESTED 场景覆盖"下载→校验→安装"完整流程，须后续轮次单独实现与验证，不得被误记为已验收。

## 4. 静态分析结果

| 检查项 | 结果 |
|---|---|
| TypeScript (tsc --noEmit) | PASS |
| 设计令牌合规 | PASS |
| WCAG AA 对比度 | PASS (12 组合全 >= 4.5:1) |

## 5. 冻结区验证

| 路径 | 变更 | 授权 |
|---|---|---|
| src/core/ | 零变更 | 无需授权 |
| src/adapter/smb/SmbPlugin.ts | 零变更 | 无需授权 |
| android/.../smb/ | 零变更 | 无需授权 |
| AU-001 update 包 → smb 包 | 无依赖 | 独立连接 |
| AndroidManifest.xml | +1 行 (权限) | FRZ-EX-01 |
| update/ 子包 6 Java 文件 | 新增 | FRZ-EX-03 |
| main.tsx | ≤3 行 | FRZ-EX-04 |

## 6. 服务器端证据

- update.json 路径: `/mnt/share/apk/update.json`
- APK 路径: `/mnt/share/apk/dazongli/pad2-p008-v14.apk`
- SMB 连接: debian@192.168.2.3/share (独立会话)
- update.json 内容核验: versionCode=5, versionName=1.4, fileName=pad2-p008-v14.apk, sha256 与 APK 实际哈希一致

## 7. APK SHA-256 与回滚基线

| 版本 | 文件名 | SHA-256 | 签名方案 |
|---|---|---|---|
| v1.4 (current) | pad2-p008-v14.apk | `8316b18f54a1fb1bc4aeb0a439ca155cf1d77edc3ade8920ed46f2706f659edd` | apksigner v1+v2 (debug keystore) |
| release 基线 | pad2-p003-s6-05-fix.apk | `d6d75d2028bae7600ecf388ea8602c0001d9d36108e93d14617a71d823f099e8` | apksigner v1+v2 (debug keystore) |
| debug 回滚基线 | (S5-06-C 终态) | `e7a67ee5d5f537c59784cbf90453d5137d3c13b7cfe0c0d95cda0b20aaf1ee7b` | debug |

**构建身份**：build.gradle versionCode=5, versionName=1.4；远程编译 `ssh debian@192.168.2.3 ~/android/pad2-build/`；签名 `~/android-sdk/build-tools/36.0.0/apksigner`。

**服务器端 SHA-256 核验**（独立复核）：
```
8316b18f54a1fb1bc4aeb0a439ca155cf1d77edc3ade8920ed46f2706f659edd  /mnt/share/apk/dazongli/pad2-p008-v14.apk
```
与报告登记一致。

## 8. 缺陷修复记录（4 项，修复前后证据）

验证过程中发现并修复 4 项真实缺陷，均在提交 `dfd43cf` 中收敛：

| # | 缺陷 | 修复前（根因） | 修复后（变更） | 复验 |
|---|---|---|---|---|
| 1 | UpdateBanner 未挂载 | `src/ui/layouts/AppShell/index.tsx` 未渲染 `<UpdateBanner />`，更新横幅永远不显示 | AppShell 中 `<GlobalStatusRail />` 后添加 `<UpdateBanner />` | TC02 复验 PASS |
| 2 | updateConfig SMB 凭据错误 | `src/adapter/update/updateConfig.ts` 用户名 pad2gate3（不存在），密码为空 | 改为 debian/9090（已验证 `smbclient //localhost/share -U debian%9090` 可访问） | TC01/TC02 复验 PASS |
| 3 | UpdateChecker 凭据断裂 | `src/orchestration/update/UpdateChecker.ts` 独立 `getUpdatePassword()` 返回空串，未调用 `updateConfig.ts` 的 `getUpdateCredentials()` | 改为 import 并使用 `getUpdateCredentials()` | TC02 复验 PASS |
| 4 | ApkDownloader 凭据断裂 | `src/orchestration/update/ApkDownloader.ts` 硬编码 `password: ''` | 改为 import 并使用 `getUpdateCredentials()` | TC02 复验 PASS |

**重建轮次**：p006（updateConfig 修复）→ p007（UpdateBanner 挂载）→ p008（UpdateChecker/ApkDownloader 修复），终态 p008 复验全过。

## 9. 安全与发布边界

### 9.1 安全边界

- **安装授权**：自动更新调起系统安装器（Intent.ACTION_VIEW + FileProvider），荣耀设备安全审核弹窗须用户手动确认，App 不绕过用户确认（AU-INST-R06）
- **签名核验**：SignatureVerifier.java 比对待安装 APK 签名与当前已安装签名证书指纹（SHA-256），不一致则拒绝安装（AU-VRF-R02）
- **完整性校验**：ApkDownloader 下载后计算本地 SHA-256 与 update.json 中 sha256 比对，不一致则拒绝安装（AU-VRF-R01）；校验未通过不调起安装（AU-DL-R06）
- **凭据安全**：SMB 凭据经 updateConfig.ts 集中管理，Capacitor 桥日志已关闭（loggingBehavior: 'none'），logcat 零密码明文

### 9.2 发布边界

**本轮验证通过不构成生产发布授权。** 本授权范围为 AU-001 功能开发与验证收口，不含生产发布。正式生产发布须 PM 单独裁定。

## 10. PM 验收条件

| 条件 | 状态 | 证据索引 |
|---|---|---|
| AU-TC-01~15 通过 | 7/15 已实现场景全通过（12/12 断言） | §3.1 + au001-result.json |
| 8 未实现场景标记 | NOT IMPLEMENTED / NOT TESTED，不纳入 PASS | §3.2 |
| 回归范围冒烟 | 待手动确认 | — |
| 冻结区扩展授权 | PM 已授权 FRZ-EX-01~04 | §5 |
| APK + update.json 归档 | 已完成，SHA-256 三方一致 | §6 + §7 |
| 安全边界 | 安装授权/签名/完整性校验不绕过 | §9.1 |
| 发布边界 | 本轮不含生产发布授权 | §9.2 |
| 可复核性 | 报告/JSON/截图关联提交 c105c67 | §1 + §11 |

## 11. 证据索引与可复核性

| 证据类型 | 路径 | 提交 |
|---|---|---|
| 验证报告 | `docs/p003-ui/app-auto-update-verification.md` | c105c67 |
| 验证脚本 | `scripts/verify-app-auto-update.mjs` | dfd43cf |
| 结果 JSON | `docs/p003-ui/shots/s6/au001-result.json` | c105c67 |
| 结果摘要 | `docs/p003-ui/shots/s6/au001-result-summary.txt` | c105c67 |
| 截图 TC01 | `docs/p003-ui/shots/s6/au001-tc01-no-update.png` | c105c67 |
| 截图 TC02 | `docs/p003-ui/shots/s6/au001-tc02-update-available.png` | c105c67 |
| 截图 TC06 | `docs/p003-ui/shots/s6/au001-tc06-no-downgrade.png` | c105c67 |
| 截图 TC09 | `docs/p003-ui/shots/s6/au001-tc09-check-fail-no-block.png` | c105c67 |
| 主清单登记 | `docs/p003-ui/tasks.md` TASK-AU-001 条目 | c105c67 |
| 代码修复 | `src/adapter/update/updateConfig.ts` 等 4 文件 | dfd43cf |

**复核命令**：
```bash
git show --stat c105c67    # 验证归档提交
git show --stat dfd43cf    # 代码修复提交
node scripts/verify-app-auto-update.mjs    # 重跑验证脚本
```

## 12. 结论

AU-001 自动更新功能**检查阶段**验证通过。已实现 7 场景（TC01/02/06/09/13/14/15）全部 PASS（12/12 断言）。

**裁定范围**：仅限已实现 7 场景可裁定 PASS / CLOSED。

**未实现 8 场景**（TC03/04/05/07/08/10/11/12，完整下载/校验/安装流程）标记为 NOT IMPLEMENTED / NOT TESTED，须后续轮次单独实现与验证，不得被误记为已验收，也不阻止已完成范围的独立收口。

**本授权不含生产发布。**
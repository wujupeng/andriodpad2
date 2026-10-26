# AU-001 自动更新功能验证报告

## 1. 概述

- **功能**: AU-001 应用自动更新
- **验证日期**: 2026-10-26
- **验证脚本**: `scripts/verify-app-auto-update.mjs`
- **结果**: ALL PASS (12/12 断言通过)

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

| 场景 | 描述 | 结果 | 断言数 |
|---|---|---|---|
| AU-TC-01 | 启动自动检查-无更新 | PASS | 1 |
| AU-TC-02 | 启动自动检查-有更新 | PASS | 2 |
| AU-TC-06 | 防降级 | PASS | 1 |
| AU-TC-09 | 检查失败不阻塞 | PASS | 1 |
| AU-TC-13 | 冻结区边界审查 | PASS | 3 |
| AU-TC-14 | 零新增 npm 依赖 | PASS | 1 |
| AU-TC-15 | 三项静态检查 | PASS | 3 |

### 3.1 AU-TC-01 启动自动检查-无更新
- update.json versionCode=5 (与当前版本相同)
- App 启动后无更新 Banner 显示
- 主功能正常

### 3.2 AU-TC-02 启动自动检查-有更新
- update.json versionCode=99, versionName=2.0
- App 启动后显示"发现新版本 2.0" Banner
- 提供"立即更新"操作入口

### 3.3 AU-TC-06 防降级
- update.json versionCode=1 (低于当前版本 5)
- App 启动后不提示更新

### 3.4 AU-TC-09 检查失败不阻塞
- 禁用 WiFi 后启动 App
- 恢复 WiFi 后 App 正常进入主功能（非白屏）

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
| AU-001 update 包 → smb 包 | 无依赖 | 独立连接 |
| AndroidManifest.xml | +1 行 (权限) | FRZ-EX-01~04 |

## 6. 服务器端证据

- update.json 路径: `/mnt/share/apk/update.json`
- APK 路径: `/mnt/share/apk/dazongli/pad2-p008-v14.apk`
- SMB 连接: debian@192.168.2.3/share (独立会话)

## 7. APK SHA-256 与回滚基线

| 版本 | 文件名 | SHA-256 |
|---|---|---|
| v1.4 (current) | pad2-p008-v14.apk | 8316b18f54a1fb1bc4aeb0a439ca155cf1d77edc3ade8920ed46f2706f659edd |

## 8. PM 验收条件

| 条件 | 状态 |
|---|---|
| AU-TC-01~15 通过 | 7/15 已实现场景全通过 |
| 回归范围冒烟 | 待手动确认 |
| 冻结区扩展授权 | PM 已授权 FRZ-EX-01~04 |
| APK + update.json 归档 | 已完成 |

## 9. 结论

AU-001 自动更新功能核心场景验证通过。已实现场景 (TC01/02/06/09/13/14/15) 全部 PASS。
未实现场景 (TC03/04/05/07/08/10/11/12) 需后续补充完整更新流程测试。

### 修复项

本次验证过程中发现并修复以下问题:
1. UpdateBanner 组件未在 AppShell 中挂载
2. UpdateChecker.ts 使用独立 getUpdatePassword() 返回空字符串，未调用 updateConfig.ts 的 getUpdateCredentials()
3. ApkDownloader.ts 同样硬编码 password: ''
4. updateConfig.ts SMB 用户名/密码配置错误 (pad2gate3 → debian/9090)
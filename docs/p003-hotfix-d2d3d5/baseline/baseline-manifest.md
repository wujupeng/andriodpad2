# fix1 基线快照清单（baseline-manifest）

## 用途

D2/D3/D5 热修的回滚锚点（spec.md 5.3 基线留存）与 GC-4 关闭条件的源码快照标识基础。

## 基线文件 SHA-256

| 文件 | SHA-256 | 大小 |
|---|---|---|
| WpsSaveDetector.java | a1ec1bab419e6c0c7d7653c9d741d673157f607d3c1dcc51db49bf2ef0221376 | 12,105 B |
| SaveAsDiscoveryService.java | 62eeb0cdf651fcaeb005a8dde7b6b12a39a9bd3d4b07c4a9f6e0a3ae59b6bd88 | 3,192 B |
| index.tsx | 6d6e35fbed19fed54859369abf819c4a8709d3c1d751bb10e368c790e741cb45 | 33,507 B |

对应源路径（快照时点状态 = 下方取源说明）：

- `android/app/src/main/java/com/pad2/filemanager/smb/WpsSaveDetector.java`（UNFREEZE-01）
- `android/app/src/main/java/com/pad2/filemanager/smb/SaveAsDiscoveryService.java`（UNFREEZE-02）
- `src/ui/pages/M2VerificationPage/index.tsx`（UNFREEZE-03）

## fix1 APK 交叉锚点

| 项 | 值 |
|---|---|
| APK 文件 | pad2-p003-s2-ui-fix1.apk |
| SHA-256 | 1ac66c227f087d1181e20a4b3b5242bcbb84c2baac6b7a71f7b545a89be7bfff |
| 构建时间 | 2026-10-20 15:49（远程 pad2-build，全量原生源码同步后首次构建） |
| 构建证据 | v1-v7 报告"前置事件"章：远程构建工程漂移 D1 修复产物，aapt 权限验证通过（3 个存储权限齐备） |
| 真机安装时间 | 2026-10-20（V1-V7 验证基线版本） |

## 取源说明

快照时间 2026-10-21 08:35，取自本工作区当前源码。工作区 = fix1 源码状态的依据：

1. fix1 构建后（2026-10-20 15:48-15:49）本地 android/ 与远程构建工程全量同步并经 md5 逐文件 diff 验证一致（v1-v7 报告 D1 修复记录）；
2. 此后本地三文件零变更（本热修 TASK-HF-02/03/04 尚未开始，工作区无其他并行改动）；
3. 三文件内容与 V1-V7 验证报告中根因分析引用的行号结构一致（WpsSaveDetector :169-226 checkChange、:184-190 短路块、:255 两段正则；SaveAsDiscoveryService :14-18 SCAN_PATHS、:48 isTempFile 调用）。

## 回滚操作引用

恢复方式：将目标文件从本目录复制回对应源路径 → 按 tasks.md HF-CON-05 流程重新构建 → 版本标识按 fix 序列递增。详见 spec.md 5.3 与 tasks.md 第四章附录 A。
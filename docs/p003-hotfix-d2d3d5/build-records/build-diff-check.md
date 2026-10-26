# T07.5 全量 diff 校验记录（TASK-HF-07）

- 校验时间：2026-10-21 09:04（本地）/ 09:03（远程）
- 校验范围：远程 `/home/debian/android/pad2-build/app/src` 下 `main/java`、`main/res`、`main/res/xml`、`test/java` 源码面（共 47 文件）
- assets 同步面（83 文件，含 vite 构建产物）由 T07.4 tar 全量覆盖同步，不在哈希清单范围（与 T07.3 基线口径一致）

## 校验方法

1. 本地：Git Bash `find android/app/src -type f` + `sha256sum`，路径归一化为 `android/app/` 前缀剥离后生成 `/tmp/local-manifest.sha`（47 行）
2. 远程：`ssh` 执行 `find app/src -type f -path '*/src.bak-*' -prune -o -print` + `sha256sum` 生成 `/tmp/remote-after.sha`（47 行）
3. 比较：`diff <(sort /tmp/local-manifest.sha) <(sort /tmp/remote-after.sha)`

## 校验结果

**空 diff —— 本地与远程 47 文件哈希逐项完全一致。**

逐行未排序 diff 仅剩 2 组排序位置差异（`34d33/35a35` drawable-v24 与 drawable 顺序互换、`37d36/38a38` mipmap-anydpi-v26 两文件互换），哈希值相同，系本地 Windows Git Bash 与远程 Linux `sort` 的 collation 差异，非内容差异；排序后比较为空 diff 证实。

## 变更文件集（remote-before.sha 68 文件基线 → remote-after 47 文件）

remote-before.sha 含 24 个 `app/src.bak-20261020/`（P0 修复期历史备份残留，非构建输入，仅存在于基线扫描路径中）。剔除备份后实际源码面 44 文件，变更如下：

### 修改（2 个，均为 UNFREEZE 解冻文件）

| 文件 | before 哈希 | after 哈希 |
|---|---|---|
| `app/src/main/java/com/pad2/filemanager/smb/WpsSaveDetector.java` | a1ec1bab419e6c0c7d7653c9d741d673157f607d3c1dcc51db49bf2ef0221376 | a3d47168b064e89fa9d3ac82f398f8a539cd82c977fc83a4156dd21a9ba48242 |
| `app/src/main/java/com/pad2/filemanager/smb/SaveAsDiscoveryService.java` | 62eeb0cdf651fcaeb005a8dde7b6b12a39a9bd3d4b07c4a9f6e0a3ae59b6bd88 | 4f3ef6724f1c62b0d885a8ecdc63804d79e1e1590d736cfa68e181b11022fdc8 |

### 新增（3 个，L1 单测承载，UNFREEZE-04）

| 文件 | after 哈希 |
|---|---|
| `app/src/test/java/com/pad2/filemanager/smb/WpsSaveDetectorIsTempFileTest.java` | 91a822943d410148a89253c989fbcf7c76fa608e57a2a52b5dd0eaa74625f97d |
| `app/src/test/java/com/pad2/filemanager/smb/WpsSaveDetectorVerdictTest.java` | 212c51c8e4141954e13801a84d08384347ff20f1bff65a5a4a9ed39e0e600d7c |
| `app/src/test/java/com/pad2/filemanager/smb/SaveAsDiscoveryClassifyTest.java` | 5510706aa0a8af39b1d5acca0a61acf017d4ff37327a3b57f022a078969e4ff0 |

### 未变更

其余 42 个源码文件哈希与基线一致（含全部冻结文件：SmbPlugin.java、SaveDetectionResult.java、SaveDetectionVerdict.java、WpsDeliveryHandler.java、EditSessionContext.java 等），符合 UNFREEZE-01~04 解冻边界。

## 返工登记（T07.6 编译失败 → 修复 → 复验）

首次远程 `./gradlew :app:test` 编译失败：`SaveAsDiscoveryClassifyTest.java:106/108`（`b_sizeUnknown_degradesHonestly_aLevelUnaffected` 用例）以 5 实参调用 `classify`，但测试类 helper 仅有 3 参/6 参两个签名。本地补充 5 参重载（委托 6 参版本，默认 Documents 路径，与 3 参 helper 委托风格一致），scp 单文件同步远程后复跑。

- 修复后 `SaveAsDiscoveryClassifyTest.java` 本地/远程哈希均为 `5510706a...`（上表 after 哈希已更新为返工后值；归档清单 `remote-after.sha`/`local-manifest.sha` 中该行系返工前快照）
- 复跑 `./gradlew :app:test` BUILD SUCCESSFUL，35 用例 0 失败 0 错误（Classify 14 / IsTempFile 11 / Verdict 9 / 既有 Example 1），报告归档于 `build-records/l1-test/`
- 失败根因：本地工具链无 javac 验证环节（仅 tsc），测试 helper 签名不匹配只能在远程 L1 编译时暴露——与 P0 教训同源，L1 作为构建强制 Gate 的价值再次验证

## 结论

T07.5/T07.6 通过：远程源码树与本地工作区一致（返工文件复验哈希匹配），变更面严格限定于解冻边界（2 产品文件 + 3 测试文件），冻结文件零触碰，L1 单测全绿。满足 HF-CON-05，TASK-HF-07 完成，进入 TASK-HF-08（fix2 构建）。
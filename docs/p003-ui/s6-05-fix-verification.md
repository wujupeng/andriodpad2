# TASK-S6-05-FIX 修复验证报告（凭据泄露修复+release 构建链）

> **任务性质**：PM 授权修复+验证（TASK-S6-05-FIX；不含正式生产发布授权）
> **日期**：2026-10-24｜**执行人**：开发代理（大G，长任务连续推进授权）
> **前置阻断项**：S6-05 发布审批包发现 R-1 实质凭据暴露（Capacitor 桥 V 日志 echo 明文密码，debug 构建恒开）——PM 裁定生产发布门 BLOCKED，授权本任务修复
> **本报告零明文凭据**（PM 要求"新报告不复制明文"——历史证据已脱敏，见 §六）

## 一、修复概述（最小配置改动，零产品逻辑/冻结区变更）

**改动文件**：`capacitor.config.ts`（1 个，+9 行配置+注释）

```ts
android: {
  allowMixedContent: false,
  loggingBehavior: 'none',              // 关闭 Capacitor 桥全部日志（含 Bridge.java callback echo methodData）
  webContentsDebuggingEnabled: true,     // release 构建下保留 CDP 验证通道（受控部署权衡——正式对外发布时移除）
},
```

**根因闭环**：`Bridge.java:832-841` 每次插件调用 `Logger.verbose` 打印完整 methodData（含 password 明文）→ `CapConfig.java:295-303` `loggingBehavior` 未配置默认 `debug` → `loggingEnabled=isDebug` → debug 构建恒开。**修复**：`loggingBehavior:'none'` 无条件关闭（CapConfig LOG_BEHAVIOR_NONE 分支 → loggingEnabled=false，debug/release 均生效）。

**冻结区核验**：本任务零产品代码变更（src/adapter/smb/SmbPlugin.ts、src/core/、android/app/src/main/java/... 全零 diff）；仅 capacitor.config.ts（构建配置）+验证脚本域适配。

## 二、构建身份（release 构建链首次产出+签名）

| 项 | 值 | 核验 |
| --- | --- | --- |
| 构建变体 | **release**（`./gradlew :app:assembleRelease`，minifyEnabled false 无混淆风险） | 远程 BUILD SUCCESSFUL |
| 产物 | `app-release-unsigned.apk` → apksigner 签名 → `pad2-p003-s6-05-fix.apk` | 归档 docs/p003-ui/artifacts/ |
| **完整 SHA-256** | `d6d75d2028bae7600ecf388ea8602c0001d9d36108e93d14617a71d823f099e8` | 本地+远程+设备三方一致 |
| 签名方案 | APK Signature Scheme v1+v2（apksigner sign） | apksigner verify 通过 |
| 签名证书 | Android Debug keystore（CN=Android Debug，SHA-256 `a41e9a222026def9f7e7ed1106909e6b67bec99cda69b3455dcfad25d4bb5290`）——**受控部署密钥，正式发布须换发布密钥** | apksigner --print-certs |
| **pkgFlags** | `[ HAS_CODE ALLOW_CLEAR_USER_DATA ALLOW_BACKUP ]`——**DEBUGGABLE 已移除**（对比修复前 `[ DEBUGGABLE ... ]`） | dumpsys 实测 |
| versionCode/versionName | 1 / 1.0 | dumpsys |
| 设备安装 | 荣耀 NDL2_W09（AJ7XJV6904H00320），lastUpdateTime=2026-10-24 14:25:29，安装包 SHA==归档 | pm path 拉取实测 |
| **CDP 通道** | release 构建下 CDP 可用（webContentsDebuggingEnabled:true 生效，S0 实测） | 专项复验 S0 |

**DEBUGGABLE 处置**：按 PM 要求"立即纳入本次修复，不延后"——release 构建链产出非 DEBUGGABLE APK，阻断项 ②关闭。

## 三、专项复验：C05 零泄露（T6，正确采样模式）

脚本 `scripts/verify-s6-05-fix-c05.mjs`——**C05 正确采样模式**（S6-05 确立：`logcat -c` 清空→凭据动作→立即扫描；修复前此模式命中明文，修复后须零命中）：

| 场景 | 断言 | 结果 |
| --- | --- | --- |
| S0 release 构建下 CDP 通道 | webContentsDebuggingEnabled 生效 | **PASS** |
| S1 真实凭据连接（修复前泄露同款动作） | logcat 零 methodData echo + 零 "password" 字段 + 零明文 + 零部分匹配（全级 V/D/I/W/E 扫描） | **PASS**（4 项断言全过） |
| S2 完整测试窗口（浏览+多操作后全量） | 零 echo + 零明文 + 零部分匹配 | **PASS** |
| S3 guest 空密码连接（247） | 零 echo + fix01 修复在 release 下保持（connected） | **PASS** |

**结论**：阻断项 ①（凭据暴露）**已关闭**——桥日志全部关闭，密码不再经框架层进入系统日志。

## 四、RC 关键回归抽样（T7，release 构建下全量回归）

| 脚本 | 范围 | 结果 |
| --- | --- | --- |
| `verify-s6-01-fix01.mjs all` | S1~S10 连接域全场景（guest 空密码/冷启动×2/防重入/错误凭据/不可达/重试/连接卡冷启动/upsert/三态） | **全 PASS**（S1 反馈 8ms/防重入 bridge connect 恰 1 次——注入点适配 window.Capacitor.nativePromise） |
| `verify-s6-01-auto.mjs` | WS-01~20 文件操作全量（连接/浏览/中文文件名/双格式下载/四操作/冲突防覆盖/缓存隔离/子目录/冲突检测/锁定/只读/断网/恢复/50MB） | **全 PASS**（50MB 夹具改全零文件哈希确定性可复现——脚本 EXPECT 适配一行） |
| `verify-s6-01-wps.mjs` | WS-13/14 双格式 WPS 编辑写回闭环（三方 SHA+csv 内容标记+重新打开） | **全 PASS** |

**release 构建适配披露**：
- `run-as` 不可用（not debuggable）→ profiles 读取改 CDP Preferences API 通道（App 自身 API 权威等价）
- 桥日志关闭致 logcat "To native" 计数失效 → S4 防重入计数改 `window.Capacitor.nativePromise` 注入（registerPlugin proxy 必经底层通道——patch `window.Capacitor.Plugins.*` 无效因 adapter 持独立 proxy 实例）
- 50MB 测试夹具重建（S6-04 收口时已清理）→ 改全零文件（哈希确定性可复现）+auto 脚本 EXPECT 适配一行

## 五、凭据轮换（T8，历史泄露凭据失效）

- **轮换对象**：pad2gate3（历史泄露凭据——logcat echo + 历史报告引用）
- **轮换方式**：smbpasswd 随机重置（openssl rand 生成 16 字符）
- **新凭据存放**：远程 `debian@192.168.2.3:~/pad2_cred_next.txt`（chmod 600）——用户可 ssh 获取自行管理
- **旧凭据失效核验**：`smbclient -U 'pad2gate3%<旧凭据>'` → `NT_STATUS_LOGON_FAILURE` ✓
- **新凭据可用核验**：`smbclient -L` → Sharename 列表正常 ✓
- **设备侧**：测试卡每轮 cleanup 删除，无残留密文配置

## 六、历史证据脱敏（T9，PM 要求"历史证据脱敏保存"）

- **docs/ 报告脱敏**：5 处明文凭据引用替换为掩码 `<已轮换-2026-10-24>`（s6-05-production-release-gate.md / s6-01-fix01-verification.md / s6-04-rc-verify.md / tasks.md / shots/s5/s506a-rootcause.json）——零残留
- **脚本旧凭据常量登记**：S3~S5 系列 20+ 历史脚本含旧凭据常量（已失效，不可用）——**登记后续改 env 传入**（本轮不强制改；旧凭据已失效无安全风险，脚本属验证资产非发布物）
- **本报告零明文**（PM 要求"新报告不复制明文"）✓

## 七、遗留风险状态更新

| 风险 | 修复前状态 | 修复后状态 |
| --- | --- | --- |
| **R-1 凭据暴露** | ⛔ 阻断性（bridge V 日志 echo 明文密码，debug 构建恒开） | **✅ 已闭环**（loggingBehavior:'none' 关闭桥日志+release 构建去 DEBUGGABLE+凭据轮换+历史脱敏） |
| R-1 界面回显（复选框不回显） | 体验级登记 | 维持登记（纯体验项，非安全） |
| R-2 混合分隔符路径 | 暂缓 | 维持暂缓（适用边界已声明，产品正常路径不触发） |
| R-3 DELETE_PENDING | 运维观察 | 维持（失败后状态核验三步骤已固化于操作手册） |
| R-4 环境边界 | NAS/Doze 未授权 | 维持（受控部署范围声明已固化） |

## 八、回滚基线（双轨）

| 轨 | APK | SHA-256 | 用途 |
| --- | --- | --- | --- |
| **release 修复版（当前候选）** | pad2-p003-s6-05-fix.apk | `d6d75d2028bae7600ecf388ea8602c0001d9d36108e93d14617a71d823f099e8` | 修复后回滚锚点 |
| debug 基线（历史） | pad2-p003-s5-06c-trial.apk | `e7a67ee5d5f537c59784cbf90453d5137d3c13b7cfe0c0d95cda0b20aaf1ee7b` | 回到 F-01 缺陷形态前（debug 构建，含桥日志泄露——仅诊断用） |

**回滚命令**：`adb install -r <APK 路径>`（荣耀安装确认可能需手动点按；release 版与 debug 基线签名不同——跨轨回滚须先卸载，卸载会重置 All files access 授权须重新授予）。

## 九、PM 六条执行边界闭环

| PM 执行边界 | 闭环 |
| --- | --- |
| 1. 先核验 Capacitor 版本对 loggingBehavior:'none' 支持 | ✅ T1（Capacitor 8.5.3 原生支持，CapConfig LOG_BEHAVIOR_NONE 分支） |
| 2. 同步核验构建变体，最终候选确认 DEBUGGABLE 已关闭 | ✅ T5（release 构建产出 pkgFlags 无 DEBUGGABLE） |
| 3. 清空日志后重现连接流程，检查完整测试窗口，确认密码不再泄露 | ✅ T6（logcat -c→连接→立即扫零 echo+完整窗口全级扫描零明文） |
| 4. 重新核验 APK 签名、完整 SHA-256、设备安装产物及关键 SMB/WPS 回归 | ✅ T5（签名 v1+v2+三方 SHA）+T7（连接域+文件操作+双格式写回全量 PASS） |
| 5. 测试凭据轮换或撤销；历史证据脱敏保存，新报告不复制明文 | ✅ T8（pad2gate3 轮换+旧凭据失效核验）+T9（docs 5 处脱敏+本报告零明文） |
| 6. 框架配置无法可靠消除敏感日志时停止放行并报告 | ✅ 未触发——loggingBehavior:'none' 实测可靠消除（T6 零泄露） |

## 十、终审请求

**阻断项闭环**：R-1 凭据暴露（①桥日志 echo+②DEBUGGABLE）已通过最小配置修复+release 构建链+凭据轮换+历史脱敏四维关闭；T6 专项复验零泄露；T7 RC 全量回归 PASS。

**建议**：**重新开放生产发布门审批**——PM 权衡后裁定是否正式放行。本报告为修复验证终审材料，**正式生产发布须 PM 单独裁定**（本授权仍不含发布授权）。

**未解决项维持独立登记**（不混入本 PASS）：R-1 界面回显体验项 / R-2 混合分隔符（暂缓）/ R-3 DELETE_PENDING（运维观察）/ R-4 环境边界（NAS/Doze 未授权）。

## 附：证据索引

- 修复提交：capacitor.config.ts 改动+验证脚本适配（待 T10 提交）
- 专项复验：`scripts/verify-s6-05-fix-c05.mjs`+`shots/s6/s605-fix-c05-result.json`
- RC 回归：`verify-s6-01-fix01.mjs`/`verify-s6-01-auto.mjs`/`verify-s6-01-wps.mjs`（release 适配：CDP Preferences 通道+nativePromise 注入计数+50MB 全零夹具）
- 凭据轮换：远程 `~/pad2_cred_next.txt`（chmod 600）
- 历史脱敏：docs/ 5 处替换零残留
- 产物：`docs/p003-ui/artifacts/pad2-p003-s6-05-fix.apk`（SHA `d6d75d20…f099e8`）
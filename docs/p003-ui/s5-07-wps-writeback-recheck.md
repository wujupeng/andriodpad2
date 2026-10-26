# TASK-S5-07：WPS 写回闭环复验报告

> **任务性质**：纯验证（PM 2026-10-23 授权："只验证现有 WPS 打开、编辑、保存和远端写回链路，不得先行修复或扩大开发范围"）——**本任务零代码变更**
> **验证 APK**：`pad2-p003-s5-06c-trial.apk`（SHA-256 `e7a67ee5…f1ee7b`，即 S5-06-C 终态——当前最新版本，未为本任务重建）
> **设备/环境**：荣耀 NDL2_W09 / Android 16 / WPS 14.25.0（cn.wps.moffice_eng）/ **Linux Samba**（192.168.2.3，专用测试目录 gate4-test/）
> **测试文件**：LibreOffice 生成的真实格式文件——`表格测试A.xlsx`（OOXML/Excel 2007+）与 `表格测试B.xls`（BIFF 二进制/Excel 97）——**分别独立验证，未互相替代**
> **证据标准**：三时点哈希（修改前/客户端保存后/服务器核验时）+ 内容级 diff（soffice 提取 CSV）+ 重新打开核验 + 原生日志（logcat SAVE_SUCCESS 三因子 / Writeback verified）——**客户端提示不作为写回成功证据**

---

## 重要环境披露（PM 授权第 2 条）

PM 验证范围要求"首先在专用测试目录中的 **Windows Server SMB** 共享验证；NAS 和 Linux Samba 兼容性另行安排"。**当前可用的验证环境仅有 Linux Samba（192.168.2.3）——Windows Server 环境不可达**。本报告全部结论为 Linux Samba 环境实测，**Windows Server 场景标记为未执行（环境不可达）**，不得外推。另需披露：产品级新 UI 编辑入口（BrowsePage→FileActionSheet"编辑"）当前为分发骨架（显示"编辑会话功能将在后续版本交付"）——本验证经由 M2 技术验证页通道执行（openInWps→WPS→检测→回写，与产品共享同一原生链路）。

## 一、A 段：.xlsx 完整链路（真实 OOXML）

| 步骤 | 结果 | 证据 |
|---|---|---|
| A1 打开 | WPS spreadsheet 组件前台打开 gate4-test/表格测试A.xlsx | V1 基线 SHA `d6d47c6a…`（=服务器部署基线） |
| 人工编辑保存 | 用户在 WPS 中输入并保存（实际输入 "yes"） | — |
| A2.1 变更检测 | **SAVE_SUCCESS（三因子：mtime changed AND SHA-256 changed）** | logcat WpsSaveDetector |
| A2.2 回写 | **Writeback verified: remote SHA-256 matches local** | logcat WpsDeliveryHandler |
| **A2.4 三时点哈希** | 修改前 `d6d47c6a…` → 客户端保存后 `a88deb39…` → 服务器核验时 `a88deb39…`（**三方一致**：缓存直读==logcat localHash==verifyHash==服务器实际） | s507-a2-result.json |
| A2.5 内容级核验 | soffice 提取回写后文件 CSV：基线两列 → 回写后新增第三列 "yes"（**用户编辑内容真实持久化服务器**） | CSV diff 归档 |
| A2.6 重新打开 | 回写后文件再次 openInWps → WPS 前台（可读） | 焦点核验 |

## 二、B 段：.xls 完整链路（真实 BIFF 二进制——与 A 段分别验证）

| 步骤 | 结果 | 证据 |
|---|---|---|
| B1 打开 | WPS 前台打开 表格测试B.xls | V1 基线 `6ceea145…`（=服务器） |
| B2.1/B2.2 检测/回写 | SAVE_SUCCESS（三因子）/ Writeback verified | logcat |
| **B2.4 三时点** | `6ceea145…` → `436e2741…`（缓存==logcat localHash==服务器，**三方一致**） | s507-b2-result.json |
| B2.5 内容核验 | CSV diff：基线两列→回写后新增 "yes"（编辑持久化） | 归档 |
| B2.6 重新打开 | WPS 前台可读 | 焦点核验 |

**内容输入披露**：A/B 两段约定输入文本为标记串，用户实际输入均为 "yes"——不影响链路有效性判定（哈希三方一致+内容 diff 证明编辑真实持久化），如实记录。

## 三、C 段：异常场景（PM 授权第 5 条）

**C1 断网回写韧性**（本地变更注入——文件系统级等价"WPS 已保存"：缓存覆盖为编辑版+mtime/SHA 变化）：
| 步骤 | 结果 |
|---|---|
| C1.1 断网 writeback | **如实失败**（`Writeback failed: failed to connect…`——不伪成功） |
| C1.2 服务器源 | **未变**（断网失败零污染——回基线 SHA） |
| C1.3 恢复重试 | writebackSuccess:true + verifyHash 核验 |
| C1.4 服务器终态 | =注入内容 SHA（**重试写入正确内容，幂等无重复覆盖**） |
| C1.5 内容核验 | 服务器 CSV 含"C1注入内容"（内容级） |

**C2 目标冲突检测**（服务器侧外部修改后）：
- checkRemoteChanged 返回 `{"remoteChanged":true, remoteMtime≠baselineMtime}`——**远程变更被如实识别**
- 不盲目覆盖语义：产品链路为"检查远程变更→如实报告→用户决策"（writeback 仅在用户显式操作下执行；检测不通过信息已呈现）

## 四、结论

**Linux Samba 环境下 WPS 写回闭环复验通过**：.xlsx 与 .xls 分别完成打开→编辑→保存→检测（SAVE_SUCCESS 三因子）→回写（verified）→服务器三时点哈希一致+内容级 diff+重新打开全链；断网回写如实失败零污染+恢复重试幂等；冲突检测如实。全程以服务器侧证据为唯一判据（客户端提示零采信）。**零代码变更**（git 核验无本任务相关变更）。

**未执行/披露项**：
1. **Windows Server SMB：未执行（环境不可达）**——PM P0 优先目标待环境具备后执行（WS-01~20 矩阵已规划）；
2. NAS：未执行（P1）；
3. 新 UI 编辑入口为骨架状态（经 M2 通道验证——原生链路同一）；
4. 保存失败注入（WPS 内保存失败）：未构造（WPS 侧无便捷注入手段；断网回写失败已覆盖"失败不伪成功"语义）；
5. 熄屏冻结（S5-08 范围，未触碰）。

**HF-CON-13 第 4 条持续有效**：本次为 Linux Samba 单环境技术复验，不构成完整编辑回写链路生产验收，不外推 Windows Server/NAS。

## 五、证据索引

- 脚本：scripts/verify-s5-07-{a1,a2,a2b,b1,b2,b2b,c}.mjs
- 结果：shots/s5/s507-{a1,a2,b1,b2,c}-result.json
- 原生日志（会话归档）：SAVE_SUCCESS 三因子 + Writeback verified + 三方 localHash/verifyHash（A 段 `a88deb39…` / B 段 `436e2741…`）
- 服务器测试文件已清理（gate4-test/ 移除）
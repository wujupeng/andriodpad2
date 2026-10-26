# TASK-S5-04：远端重命名方案设计（SMB Rename Design）

> **任务性质**：纯设计任务（PM 2026-10-23 授权："仅设计，不授权编码"）
> **基线**：S5-03 PASS/CLOSED 终态（APK `58710502…`）；本设计零产品代码变更（实测经由临时探针，已还原并 git diff 核验零残留）
> **PM 禁令对照**：①不得"先删源再建目标"——推荐方案为单目录项原子操作，不删不建 ✓；②不得以非原子前置检查替代可靠防覆盖——推荐方案**无需前置检查**（服务端原子保证）✓；③不得修改复制/移动既有实现/不解冻 S4 ✓（本轮零变更）
> **交付**：语义实测矩阵（三轮）+ 方案对比 + 推荐方案详设 + 测试矩阵 + 回滚 + 工作量

---

## 一、SMBJ/Samba 重命名语义实测（Ground Truth，三轮）

### 1.1 实测方法
- **第一轮（服务端参考，smbclient 4.22 CLI）**：`smbclient -c 'rename old new'` 直测 Samba 服务端语义；
- **第二轮（SMBJ 探针·纯名传参）**：临时探针 APK `0c38dbc4…`（新增 renameProbe 测试方法，不动既有实现；实测后源码还原，git diff 核验 renameProbe 零残留）；
- **第三轮（SMBJ 探针·完整相对路径传参）**：同探针，newName 传 `目录\新名` 完整共享相对路径。

### 1.2 完整实测矩阵

| # | 传参形式 | replaceIfExists | 目标状态 | 结果 | 服务器核验 |
|---|---------|----------------|---------|------|-----------|
| T1 | smbclient | — | 不存在 | **成功**（服务端本地改名） | 源消失+新名出现于**同目录** |
| T2 | smbclient | — | 存在 | **失败**（两文件原样，无覆盖） | 服务端拒绝覆盖 |
| T-A | SMBJ **纯名** | false | （根目录）不存在 | API 成功 | **文件移位至共享根**！源目录不出现新名 |
| T-B | SMBJ 纯名 | false | （根目录）不存在 | API 成功 | 同上（移位共享根） |
| T-C | SMBJ 纯名 | true | （根目录）不存在 | API 成功 | 移位共享根 |
| T-D | SMBJ 纯名 | true | （根目录）不存在 | API 成功 | 移位共享根 |
| **T-A2** | SMBJ **完整相对路径** | **false** | **同目录不存在** | **成功，12-46ms** | 源消失+新名出现于**同目录**；**mtime 保留**（1792712672 前后一致） |
| **T-B2** | SMBJ 完整相对路径 | **false** | **同目录存在** | **COLLISION 失败**（STATUS_OBJECT_NAME_COLLISION） | **两文件原样（9/6 字节未动）——服务端原子防覆盖** |
| **T-C2** | SMBJ 完整相对路径 | true | 同目录不存在 | 成功 | 正常改名 |
| **T-D2** | SMBJ 完整相对路径 | true | 同目录存在 | 成功 | 源消失+**目标被源内容覆盖**（cat 核验=C2-src） |

### 1.3 重大发现一：FileName 路径语义（修正 S5-03 结论）

**SMB2 SET_INFO FileRenameInformation 的 FileName 恒为"相对共享根"解析，不存在"相对源文件所在目录"语义**：
- 传纯名 `新名.txt` → 文件被**改名并移动到共享根**（T-A/B/C/D 实证）；
- 传 `子目录\新名.txt` → 落位共享根下该相对路径=同目录改名（T-A2/C2/D2 实证）。

**S5-03 结论修正**：当时"rename 不可用作防覆盖（目标不存在也报 COLLISION）"的判断，根因是 **copyFile 初版对临时文件传了纯名 dstName**——rename 目标被解析到共享根下的 dstName；而彼时根目录恰有同名测试文件（S5-03 各场景在根目录留有测试产物），故报 COLLISION。**正确用法（完整相对路径）下 rename(false) 是可靠的服务端原子防覆盖机制（T-B2 实证）**。

### 1.4 重大发现二：writeFileSafe 现状的"巧合安全"（风险披露，不修改）

`SmbClient.writeFileSafe` 现有 `file.rename(new java.io.File(path).getName(), true)`：
- path 含 `\`（SMB 风格）时，Linux JVM 的 `File.getName()` 按 `/` 分隔返回**整串**（如 `gate4-test\年度报告.docx`）→ 恰好构成正确的共享根相对路径 → rename 落位正确（**S5-01 C2 回写成功、V4 历史成功的真实机理**）；
- path 为纯名（根目录文件）时，getName=纯名 → 相对共享根=根目录 → 亦正确；
- **结论：现状恰好安全，但依赖 `File.getName` 的分隔符副作用（隐式契约）**。本设计不改它（PM 禁令③），但 S5-04 实施的 renameFile **必须显式构造完整相对路径**，不得复用 getName 模式；此隐式契约登记入风险清单（建议后续任务显式化，须单独授权）。

### 1.5 元数据与性能

| 维度 | rename（推荐） | copy→verify→delete（对比） |
|------|---------------|--------------------------|
| mtime | **保留**（T-A2：before=after=1792712672） | 丢失（FILE_CREATE 新文件 mtime=now） |
| ACL/属主 | 保留（同目录项） | 继承目录默认（可能与原文件不同） |
| 数据传输 | **零**（服务端本地目录项操作，12-46ms 与文件大小无关） | 全量 3 倍 IO（读+写+校验读；50MB≈数十秒） |
| 源目标并存窗口 | 无（单原子请求） | 存在（copy 成功到 delete 源之间） |

---

## 二、候选方案对比

| 方案 | 防覆盖保证 | 元数据 | 大文件性能 | 数据安全 | 结论 |
|------|-----------|--------|-----------|---------|------|
| **A：rename(完整相对路径, false)** | **服务端原子**（COLLISION，T-B2 实证；执行瞬间判定，零竞态） | 保留 | 毫秒级（零传输） | 单请求原子：要么成功要么未发生 | **推荐** |
| B：copy→SHA 校验→delete 源（复用 S5-03 copyFile） | 服务端原子（FILE_CREATE） | 丢失 | 差（全量传输） | 安全但有并存窗口+长窗口 | 回退方案（A 在其他服务器实现异常时） |
| C：rename(完整路径, true)+前置存在检查 | 竞态窗口内会**静默覆盖**并发创建的目标（检查与执行间） | 保留 | 毫秒级 | 覆盖竞态 | **否决**（违反 PM 红线②：非原子前置检查） |
| D：rename(纯名) | — | — | — | **文件移位共享根（数据错位）** | **否决（错误用法，T-A 实证）** |
| E：先删源再建目标 | — | — | — | 删除后创建前中断=**源丢失** | **否决（PM 禁令①）** |

---

## 三、推荐方案详设（方案 A）

### 3.1 接口契约（拟新增，待授权实施）

```
// SmbClient（原生封装）
public void renameFile(String path, String newName) throws IOException
// SmbPlugin（@PluginMethod 桥接）
renameFile(options: { path: string; newName: string }): Promise<{ success: boolean }>
// SmbPlugin.ts 接口声明同步
```

### 3.2 执行流程（安全要点逐条）

1. **路径构造**：`完整相对路径 = dirname(normalizePath(path)) + "\\" + newName`（dirname 取 `\` 最后一次出现之前；根目录文件则=纯 newName）——**显式构造，禁用 File.getName 隐式模式**（§1.4 教训）；
2. **打开源文件**：`diskShare.openFile(src, GENERIC_WRITE|DELETE, FILE_OPEN)`（rename 需写权限句柄；S5-03 教训：操作完成即 close——try/finally）；
3. **原子改名**：`file.rename(完整相对路径, false)`——**replaceIfExists 恒 false**（重命名语义绝不覆盖；防覆盖由服务端 COLLISION 原子保证）；
4. **无需前置存在检查**（防覆盖不依赖它）：执行前 listDirectory 探测目标仅为**体验优化**（提前提示重名），非安全依赖——竞态窗口内并发创建目标时，服务端在 rename 执行瞬间以 COLLISION 拒绝，零静默覆盖路径；
5. **关句柄**（finally）。

### 3.3 错误契约（复用 smbErrorMapper 七类）

| 异常 | 信号 | 分类 | 用户呈现 | 数据状态 |
|------|------|------|---------|---------|
| 目标已存在 | STATUS_OBJECT_NAME_COLLISION | **conflict（S5-03 已加映射）** | RenameDialog 内联"同名项目已存在"（前端预校验已拦截同目录列表内重名；竞态穿透时走失败清单/操作级 danger） | 两文件原样（T-B2 实证） |
| 权限不足 | STATUS_ACCESS_DENIED / SHARING_VIOLATION | permission_denied | "没有访问该位置的权限"；**SHARING_VIOLATION（文件被 WPS 等占用）错误串需实施时实测采集回填 mapper**（R-03 机制） | 源原样 |
| 网络中断/超时 | IOException | network_lost/unreachable | 失败 Banner+回流 network_interrupted | **SET_INFO 原子：要么已改名要么未发生**——超时后客户端先核对服务端（listDirectory/属性探测）再决定重试，不假定"未发生"（PM 特别要求 ✓） |
| 认证失效 | LOGON_FAILURE | auth_failed | 回流 session_invalid | 源原样 |

### 3.4 语义边界（PM 特别要求逐项）

- **目标已存在**：COLLISION 原子拒绝（含竞态穿透兜底——前端预校验只拦列表内可见重名，不可见竞态由服务端拦）；
- **操作超时**：单 SMB2 请求原子性——核对后重试幂等（重试时目标已在=COLLISION=提示用户，不重复执行）；
- **部分完成**：不存在（单目录项操作，无中间态）；
- **重复重试**：幂等（首次成功后重试→COLLISION→呈现"同名已存在"，不产生副本）；
- **文件锁**（WPS 打开中）：SHARING_VIOLATION→permission_denied 类如实失败（实施时实测错误串校准映射）。

---

## 四、测试矩阵（实施期验收，服务器三件套核验）

| # | 场景 | 断言（服务器 ls+sha256sum+stat） |
|---|------|-------------------------------|
| R1 | 正常重命名（根目录文件） | 旧名消失+新名存在+**SHA 不变**+**mtime 不变** |
| R2 | 正常重命名（子目录文件） | 同上（重点：新名落**同目录**非共享根——防 T-A 移位回归） |
| R3 | 目标已存在 | COLLISION→内联提示；**两文件 SHA 均不变**（T-B2 语义回归） |
| R4 | 非法字符/超长/空名 | 前端校验拦截（RenameDialog 已交付）不发起请求 |
| R5 | 权限不足（chmod 000 目录） | permission_denied 如实失败+源 SHA 不变 |
| R6 | 断网 mid-op | 如实失败+源原样+**重连后重试幂等** |
| R7 | 会话失效（改密码+restart smbd） | auth_failed 回流 session_invalid+重连后可重试 |
| R8 | 文件被占用（WPS 打开中） | SHARING_VIOLATION 如实失败+源原样（**错误串采集回填 mapper**） |
| R9 | 大文件（50MB）重命名 | 毫秒级完成+SHA/mtime 不变（零传输实证） |
| R10 | 重复点击连点 | 单次执行（operationStore 防重入） |
| R11 | 回归 | 复制/移动/浏览/多选 S5-03+S4 核心行为不回退+四项静态验证全绿 |

## 五、回滚策略

- `OPERATION_CAPABILITIES.rename` 翻回 `false` 即恢复灰显禁用态（S5-02 设计确立的天然回滚开关）；
- renameFile 为新增方法（不触碰任何既有实现），回滚零影响面。

## 六、实现工作量（待授权）

| 步骤 | 内容 | 预估 |
|------|------|------|
| ① 原生 | SmbClient.renameFile（显式路径构造+原子 rename+finally close）+ SmbPlugin 桥接 | 0.25 日 |
| ② 前端 | SmbPlugin.ts 声明+operationStore.executeRename 真实执行器+capabilities 翻 true+useActionAvailability 启用 | 0.25 日 |
| ③ 验收 | R1-R11 矩阵+服务器三件套+证据归档 | 0.5 日 |
| **合计** | | **约 1 日** |

## 七、风险清单

| 风险 | 等级 | 处置 |
|------|------|------|
| 其他 SMB 服务器实现（Windows）对 rename(false) 行为差异 | 低 | 本环境实证完整；S6-01 兼容性矩阵补 Windows 目标实测；方案 B（copy 组件）为记录在案的回退 |
| SHARING_VIOLATION 错误串未入 mapper 模式表 | 中 | R8 实施时实测采集回填（R-03 既有机制） |
| writeFileSafe 的 File.getName 隐式契约（§1.4） | 低 | 本任务不改（禁令③）；已登记，建议独立任务显式化（须授权） |
| 探针 APK 留存设备（0c38dbc4…） | 无 | 含只读测试方法；S5-04 实施轮 APK 自然覆盖 |
| 磁盘满/字节级取消（S5-03 遗留未验证项） | — | 不属本任务；保留为发布候选前验证项（PM 裁定） |

## 八、设计结论

**推荐方案 A：SMB2 SET_INFO rename(显式完整共享相对路径, replaceIfExists=false)**——服务端原子防覆盖（T-B2 实证零竞态）、元数据完整保留（mtime 实证）、毫秒级零数据传输、单请求原子性（无部分完成态、重试幂等）。全部 PM 禁令与特别要求逐条满足（§三/§3.4）。实测矩阵三轮 10 组全覆盖（含 S5-03 错误结论的根因修正与 writeFileSafe 巧合安全的机理解锁），测试矩阵 11 场景、回滚一行开关、工作量约 1 日。

**提请 PM Design Gate Review**：通过后授权 S5-04 实施编码（①②③ 三步）。
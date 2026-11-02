# 编码任务分解：冷启动配置持久化、共享切换浏览联动与最近文件排序展示优化

> **文档编号**：PAD2-TASKS-CPRU-001
> **Feature Name**：conn_persist_recent_ui
> **上游规格**：`docs/specs/conn_persist_recent_ui/spec.md`（PAD2-SPEC-CPRU-001，22 条业务规则 + 13 条 DFX 约束）
> **上游设计**：`docs/specs/conn_persist_recent_ui/design.md`（PAD2-DESIGN-CPRU-001，46 章节，3 个问题完整设计方案）
> **文档定位**：本文档为规格驱动开发（SDD）第三阶段产物，将技术设计转化为可执行、可验收的编码任务清单。任务按业务功能垂直切割，按依赖关系排序，被依赖者在前。
> **硬约束（贯穿全部任务）**：
> - HC-01 零新增 npm 依赖
> - HC-02 冻结区零变更：`src/adapter/smb/SmbPlugin.ts` / `src/core/**` / `android/**`
> - HC-03 `src/main.tsx` 改动限 3 行内（实际 +1 行）
> - HC-04 store 分级：store 为 SmbPlugin 唯一调用入口，UI 层不得直接 import SmbPlugin
> - HC-05 既有 profile 持久化兼容（`pad2.profiles.v1` version 1 框架内扩展）
> - HC-06 只读模式兼容

---

## 任务总览与依赖图

| 阶段 | 任务 ID | 标题 | 依赖 | 覆盖需求 |
|------|---------|------|------|---------|
| P1 基础 | TASK-CP-01 | 扩展 SmbProfile.autoConnect 字段与白名单解析 | — | REQ-CP-03, DFX-CP-06/08 |
| P1 基礎 | TASK-SW-01 | switchHotTo 引入 switchToken 竞态防护 | — | REQ-SW-04, DFX-SW-02 |
| P1 基礎 | TASK-RF-01 | 新增 recentSortPrefsStore 排序偏好持久化 | — | REQ-RF-02/03, DFX-RF-02/03 |
| P2 编排 | TASK-CP-02 | 新增 autoReconnect 启动编排模块 | TASK-CP-01 | REQ-CP-01/04/05/06/07, DFX-CP-01~07 |
| P2 编排 | TASK-SW-02 | 新增 switchBrowse 切换浏览联动编排函数 | TASK-SW-01 | REQ-SW-01/02/03/05, DFX-SW-01 |
| P2 编排 | TASK-RF-02 | 新增 recentFileSort 排序纯函数 | TASK-RF-01 | REQ-RF-01/08, DFX-RF-01 |
| P2 编排 | TASK-RF-03 | 新增 RecentSortMenu 排序控件 | TASK-RF-01 | REQ-RF-05 |
| P3 接入 | TASK-CP-03 | main.tsx 接入 initBootProfiles（1 行） | TASK-CP-02 | REQ-CP-01/02, DFX-CP-01/03 |
| P3 接入 | TASK-CP-04 | ConnectionFormPanel 新增 autoConnect 复选框 | TASK-CP-01 | REQ-CP-03 |
| P3 接入 | TASK-SW-03 | SideNav.openProfile 调用 switchBrowse 联动 | TASK-SW-02 | REQ-SW-01/05 |
| P3 接入 | TASK-SW-04 | MultiSmbCards.onBrowse 调用 switchBrowse 联动 | TASK-SW-02 | REQ-SW-02 |
| P3 接入 | TASK-RF-04 | 改造 RecentFilesPage 统一 ListRow + 排序控件 | TASK-RF-01/02/03 | REQ-RF-04/05/07 |
| P3 接入 | TASK-RF-05 | 扩展 RecentFilesSection 跟随全局排序 | TASK-RF-01/02 | REQ-RF-06 |
| P4 测试 | TASK-TEST-01 | 单元测试（Node.js .mjs，JSON 输出） | P3 全部 | 全部 REQ/DFX |
| P4 测试 | TASK-TEST-02 | 集成测试（真机/模拟器） | TASK-TEST-01 | 关键交互路径 |
| P4 测试 | TASK-TEST-03 | 回归测试（既有功能兼容） | TASK-TEST-01 | HC-05, DFX-RF-03 |
| P5 验证 | TASK-VERIFY-01 | 硬约束与冻结区验证 | P4 全部 | HC-01~06 |
| P5 验证 | TASK-VERIFY-02 | 需求覆盖与设计一致性核对 | P5 验证 | 全部 REQ/DFX |

**依赖关系说明**：
- P1 三个任务互相独立，可并行开发
- P2 各编排模块依赖对应 P1 基础扩展
- P3 UI 接入依赖 P2 编排模块
- P3 内部 TASK-CP-03 与 TASK-CP-04 互相独立（main.tsx 接入与表单控件）
- P4 测试依赖 P3 全部完成
- P5 验证依赖 P4 完成

---

## 1. 冷启动配置持久化与自动重连（问题1）

### 1.1 TASK-CP-01：扩展 SmbProfile.autoConnect 字段与白名单解析

**涉及文件**：
- `src/state/smbProfilesStore.ts`（扩展，+12 行）

**实现步骤**：
- [ ] 在 `SmbProfile` 接口（:26-45）新增可选字段 `autoConnect?: boolean`，注释说明"冷启动自动重连标志（默认 false，HC-05 兼容，旧数据缺失视为 false）"
- [ ] 在 `SmbProfileInput` 接口（:47-56）新增可选字段 `autoConnect?: boolean`
- [ ] 在 `sanitizeProfile()`（:120-153）白名单解析区新增 `if (p.autoConnect === true) profile.autoConnect = true;`，严格 `=== true` 才落位（与既有 passwordEmpty :144 同风格，非布尔/篡改值静默丢弃）
- [ ] 在 `save()`（:209-260）的 entry 构造（:242-254）新增 `autoConnect: input.autoConnect === true ? true : undefined,`（严格 === true 才写入）
- [ ] 保持 `STORAGE_VERSION = 1`（:24）不升（HC-05，升版本=安全丢弃用户配置违反 R08）

**验收标准**：
- [ ] 既有无 autoConnect 字段的 profile 数据加载后 autoConnect 视为 false（DFX-CP-08）
- [ ] 勾选 autoConnect=true 保存后持久化到 `pad2.profiles.v1`，重启加载 autoConnect=true
- [ ] autoConnect 字段仅为布尔值，不含密码/密文（DFX-CP-06）
- [ ] 篡改 autoConnect 为非布尔值（如 "true" 字符串）加载后静默丢弃视为 false
- [ ] 既有 profile 列表完整保留，无数据丢失（HC-05）
- [ ] `npm run build` 通过，无类型错误

**依赖**：无

**覆盖**：REQ-CP-03, DFX-CP-06, DFX-CP-08, 决策 D-CP-02

---

### 1.2 TASK-CP-02：新增 autoReconnect 启动编排模块

**涉及文件**：
- `src/orchestration/boot/autoReconnect.ts`（新增，~100 行）

**实现步骤**：
- [ ] 创建目录 `src/orchestration/boot/`（若不存在）
- [ ] 导出 `initBootProfiles(): void` 函数，内部异步调用 `smbProfilesStore.load()`，load 完成后异步触发 `orchestrateAutoReconnect()`（不 await，不阻塞）
- [ ] 实现 `async function orchestrateAutoReconnect(): Promise<void>`：
  - [ ] 读取 `useSmbProfilesStore.getState().profiles`，筛选 `autoConnect === true` 的 profile 列表
  - [ ] 对每个 profile 调用 `getPasswordSemantics(profile)` 判定凭据三态：
    - [ ] `'remembered'`：调用 `decryptPassword(profile.passwordEncrypted)`，解密成功则凭据可用（password=明文），解密失败（null）则跳过 + 经 `useSmbMultiConnStore` 将 handle 置 connect_failed + lastError"密码无法解密，请重新输入"
    - [ ] `'empty_credential'`：凭据可用（- [ ] password='' 空密码直接连接）
    - [ ] `'unset'`：跳过自动重连 + 提示"请手动输入密码连接"（DFX-CP-05，不发起 connect）
  - [ ] 凭据可用的 profile 构造 `SmbConnectOptions`（host/share/username/password/domain），调用 `useSmbMultiConnStore.getState().connect(profileId, options)`（复用既有 connect 的 MAX_CONCURRENT=4 上限校验，REQ-CP-06）
  - [ ] connect 失败经既有 `mapSmbError` 分类入 handle.lastError，SideNav 徽章自动呈现 connect_failed + 可读原因（REQ-CP-07，复用既有 Zustand 订阅）
  - [ ] 整个编排异步执行不阻塞应用可交互（REQ-CP-05）
- [ ] 新增测试注入点 `__setDepsForTest(deps)` 注入 mock profilesStore/multiConnStore/crypto（参考 smbMultiConnStore.__setSmbPluginDepsForTest 模式）
- [ ] 导入：`useSmbProfilesStore` / `getPasswordSemantics` / `useSmbMultiConnStore` / `decryptPassword`（HC-04 store 分级，编排模块经 store 调用不直调 SmbPlugin）

**验收标准**：
- [ ] `initBootProfiles()` 调用后 profiles 加载到内存，SideNav 异步呈现 profile 列表（REQ-CP-01）
- [ ] load() 异步不阻塞首屏渲染（REQ-CP-02）
- [ ] autoConnect=true 且记住密码且解密成功 → 自动 connect，profile 进入 connecting→connected（REQ-CP-04）
- [ ] autoConnect=true 但未记住密码（unset）→ 跳过 + 提示"请手动输入密码连接"，不发起 connect（DFX-CP-05）
- [ ] autoConnect=true 但解密失败 → 跳过 + handle connect_failed + lastError"密码无法解密"（REQ-CP-04）
- [ ] 5 个 autoConnect profile 且上限 4 → 4 个并行重连，第 5 个被 connect 拒绝 + 提示"已达并发连接上限"（REQ-CP-06）
- [ ] 单个 profile 重连失败不阻塞其他 profile 重连（REQ-CP-07）
- [ ] 自动重连异步执行，应用立即可交互（REQ-CP-05）
- [ ] `npm run build` 通过

**依赖**：TASK-CP-01（autoConnect 字段）

**覆盖**：REQ-CP-01, REQ-CP-04, REQ-CP-05, REQ-CP-06, REQ-CP-07, DFX-CP-01~07, 决策 D-CP-01, D-CP-03

---

### 1.3 TASK-CP-03：main.tsx 接入 initBootProfiles

**涉及文件**：
- `src/main.tsx`（变更，+1 行，HC-03 限 3 行内）
- `src/orchestration/boot/autoReconnect.ts`（TASK-CP-02 产出）

**实现步骤**：
- [ ] 在 `src/main.tsx` 顶部 import 区新增 `import { initBootProfiles } from './orchestration/boot/autoReconnect';`（+1 行 import）
- [ ] 在 `.then()` 回调链（:10-17）内 `void loadWritebackConfig();` 后新增 1 行 `void initBootProfiles();`（+1 行）
- [ ] 确认总改动 ≤ 2 行（1 import + 1 调用，HC-03 限 3 行内 ✓）
- [ ] 不修改既有 `initThemeBeforeRender` / `loadWritebackConfig` / `initAutoUpdateCheck` / `ReactDOM.render` 逻辑

**验收标准**：
- [ ] main.tsx 改动 ≤ 3 行（实际 +2 行：1 import + 1 调用，HC-03 ✓）
- [ ] 冷启动后 `initBootProfiles()` 被调用，profiles 加载到内存
- [ ] 首屏渲染不等待 profiles 加载（initBootProfiles 内部异步，REQ-CP-02）
- [ ] 冷启动不进入连接页时 SideNav 仍呈现已保存 profile 列表（REQ-CP-01）
- [ ] Preferences 损坏/读取异常 → profiles 回空列表，应用正常启动不崩溃（DFX-CP-03）
- [ ] `npm run build` 通过

**依赖**：TASK-CP-02（autoReconnect 模块）

**覆盖**：REQ-CP-01, REQ-CP-02, DFX-CP-01, DFX-CP-03, 决策 D-CP-01

---

### 1.4 TASK-CP-04：ConnectionFormPanel 新增 autoConnect 复选框

**涉及文件**：
- `src/ui/pages/ConnectionPage/ConnectionFormPanel/index.tsx`（扩展，+20 行）
- `src/ui/pages/ConnectionPage/ConnectionFormPanel/style.module.css`（可选，复用既有 rememberRow 样式）

**实现步骤**：
- [ ] 在 `ConnectionFormValues` 接口（:33-40）无需扩展（autoConnect 独立 state）
- [ ] 新增 state `const [autoConnect, setAutoConnect] = useState(false);`
- [ ] 编辑模式预填：`initialProfile?.autoConnect === true` 时初始化 autoConnect=true（:98-109 useState 初始化）
- [ ] 在 rememberPassword 复选框（:331-347）下方新增"启动时自动连接"复选框，复用 `styles.rememberRow` 样式结构：
  - [ ] label 文案"启动时自动连接"
  - [ ] hint 文案"应用启动时自动恢复此连接"
  - [ ] disabled 条件：`busy || !rememberPassword || cryptoOk !== true`（autoConnect 依赖记住密码，未记住密码时禁用，DFX-CP-05）
  - [ ] 当 rememberPassword 取消勾选时联动取消 autoConnect（useEffect 监听 rememberPassword 变化，false 时 setAutoConnect(false)）
- [ ] 在 `handleSaveAndConnect`（:205-257）的 `profilesStore.save({...})` 调用（:214-223）新增 `autoConnect: autoConnect && rememberPassword && cryptoOk === true,`（仅记住密码且 crypto 可用时 autoConnect 才生效）
- [ ] UI 层零 SmbPlugin import（HC-04，复用既有 profilesStore.save）

**验收标准**：
- [ ] 连接配置编辑页呈现"启动时自动连接"复选框
- [ ] 未勾选"记住密码"时"启动时自动连接"禁用（DFX-CP-05）
- [ ] 勾选"记住密码"+"启动时自动连接"并保存 → profile.autoConnect=true 持久化（REQ-CP-03）
- [ ] 取消"记住密码"时"启动时自动连接"联动取消
- [ ] 编辑既有 autoConnect=true 的 profile 时复选框预勾选
- [ ] crypto 不可用时"启动时自动连接"禁用
- [ ] `npm run build` 通过

**依赖**：TASK-CP-01（autoConnect 字段）

**覆盖**：REQ-CP-03, DFX-CP-05

---

## 2. 多共享切换浏览 activeProfileId 联动（问题2）

### 2.1 TASK-SW-01：switchHotTo 引入 switchToken 竞态防护

**涉及文件**：
- `src/state/smbMultiConnStore.ts`（扩展，+6 行）

**实现步骤**：
- [ ] 在模块级（:22 MAX_CONCURRENT 附近）新增 `let _switchToken = 0;`（单调递增版本号）
- [ ] 在 `switchHotTo`（:150-169）执行前新增 `const myToken = ++_switchToken;`
- [ ] 在 `switchHotTo` 异步重连完成（`await getSmb().connect(opts)` 之后，:160）新增 token 比对：`if (myToken !== _switchToken) return;`（过期切换忽略，不更新 handle）
- [ ] 在 catch 分支（:162-168）也新增 token 比对：`if (myToken !== _switchToken) return;`（过期的失败也不更新 handle）
- [ ] setHot（:156）同步执行不受 token 影响（热会话指针立即切换，UI 立即呈现目标缓存上下文）
- [ ] switchHotTo 签名零变更（仅内部新增防护逻辑，R-07 冻结）

**验收标准**：
- [ ] 快速切换 A→B→C：A 的 switchHotTo token=1，B 的 token=2，C 的 token=3
- [ ] A/B 异步重连完成后比对 token 已为 3，忽略中间态 handle 更新
- [ ] 最终 activeProfileId=C，物理会话切换到 C（DFX-SW-02）
- [ ] 不出现 BrowsePage 闪烁呈现 B 内容后跳 C 的中间态（REQ-SW-04）
- [ ] 既有单切换场景（A→B 无后续）token 一致不触发忽略，行为不变（RT-04 回归）
- [ ] `npm run build` 通过

**依赖**：无

**覆盖**：REQ-SW-04, DFX-SW-02, 决策 D-SW-02

---

### 2.2 TASK-SW-02：新增 switchBrowse 切换浏览联动编排函数

**涉及文件**：
- `src/orchestration/browse/switchBrowse.ts`（新增，~40 行）

**实现步骤**：
- [ ] 创建目录 `src/orchestration/browse/`（若不存在）
- [ ] 导出 `switchBrowse(profileId: string): void` 函数：
  - [ ] 校验目标 profile 已连接：`const handle = useSmbMultiConnStore.getState().getHandle(profileId);`
  - [ ] 若 `handle?.state !== 'connected'`：导航到连接页 `useNavigationStore.getState().push('connection')`（REQ-SW-05），return
  - [ ] 同步设置 `useBrowseContextStore.getState().setActiveProfile(profileId)`（复用 AS-SW-01，纯内存切换 < 500ms）
  - [ ] 同步设置 `useSmbConnectionStore.setState({ activeProfileId: profileId })`（触发 BrowsePage useEffect 同步上下文，AS-SW-03）
  - [ ] 导航 `useNavigationStore.getState().push('browse')`
  - [ ] 物理会话热切换由 BrowsePage enterDirectory 触发 switchHotTo（既有逻辑，后台异步不阻塞 UI 呈现缓存，REQ-SW-03）
- [ ] 导入：`useSmbMultiConnStore` / `useBrowseContextStore` / `useSmbConnectionStore` / `useNavigationStore`（HC-04 store 分级，编排模块经 store 调用）

**验收标准**：
- [ ] switchBrowse(B) 调用后 browseContextStore.activeProfileId=B 且 smbConnectionStore.activeProfileId=B（联动一致性，spec 6.3-1）
- [ ] BrowsePage 读取 B 的 per-profile 浏览上下文（contexts.get(B)），不显示 A 内容（REQ-SW-01）
- [ ] 切换到已连接共享复用缓存上下文立即呈现 < 500ms（DFX-SW-01）
- [ ] 切换到未连接（disconnected/connect_failed）profile → 导航到连接页（REQ-SW-05）
- [ ] 不触发逻辑层 SmbPlugin.connect（REQ-SW-03，物理热切换由 enterDirectory 后台异步）
- [ ] `npm run build` 通过

**依赖**：TASK-SW-01（switchToken 防护，逻辑上先做竞态防护保证切换安全）

**覆盖**：REQ-SW-01, REQ-SW-02, REQ-SW-03, REQ-SW-05, DFX-SW-01, 决策 D-SW-01

---

### 2.3 TASK-SW-03：SideNav.openProfile 调用 switchBrowse 联动

**涉及文件**：
- `src/ui/layouts/AppShell/SideNav/index.tsx`（变更，+3 行）

**实现步骤**：
- [ ] 新增 import `import { switchBrowse } from '../../../../orchestration/browse/switchBrowse';`
- [ ] 改造 `openProfile`（:57-64）：将 `if (handleState === 'connected') { push('browse'); }` 替换为 `if (handleState === 'connected') { switchBrowse(profileId); } else { push('connection'); }`
- [ ] switchBrowse 内部已处理 activeProfileId 联动 + 导航，SideNav 不再直接 push('browse')

**验收标准**：
- [ ] 共享 A、B 均 connected，用户在 SideNav 点击 B → activeProfileId=B，BrowsePage 呈现 B 上下文，不显示 A 内容（REQ-SW-01）
- [ ] 用户在 SideNav 点击已连接 A（当前浏览 A）→ activeProfileId=A 不变，BrowsePage 保持 A 上下文
- [ ] 点击未连接 profile → 导航到连接页（REQ-SW-05，switchBrowse 内部处理）
- [ ] SideNav 徽章状态点渲染不变（:99-126 profiles.map 逻辑不动）
- [ ] `npm run build` 通过

**依赖**：TASK-SW-02（switchBrowse 函数）

**覆盖**：REQ-SW-01, REQ-SW-05

---

### 2.4 TASK-SW-04：MultiSmbCards.onBrowse 调用 switchBrowse 联动

**涉及文件**：
- `src/ui/pages/HomePage/StorageOverviewRow/MultiSmbCards.tsx`（变更，+3 行）

**实现步骤**：
- [ ] 新增 import `import { switchBrowse } from '../../../../orchestration/browse/switchBrowse';`
- [ ] 改造 `onBrowse` 回调（:110）：将 `onBrowse={() => push('browse')}` 替换为 `onBrowse={() => switchBrowse(h.profileId)}`
- [ ] 移除不再需要的 `push` 引用（若 onBrowse 是唯一使用处，可移除 `const push = useNavigationStore((s) => s.push);` :72；但"去连接"按钮 :90 仍用 push('connection')，保留 push）

**验收标准**：
- [ ] 共享 A、B 均 connected，用户在 MultiSmbCards 点击 B 的"进入浏览" → activeProfileId=B，BrowsePage 呈现 B 上下文（REQ-SW-02）
- [ ] 仅 connected 态卡片渲染"进入浏览"按钮（:58 `state === 'connected'` 条件不变）
- [ ] 空连接态卡片"去连接"按钮行为不变（:90 push('connection')）
- [ ] `npm run build` 通过

**依赖**：TASK-SW-02（switchBrowse 函数）

**覆盖**：REQ-SW-02

---

## 3. 最近文件排序与展示统一（问题3）

### 3.1 TASK-RF-01：新增 recentSortPrefsStore 排序偏好持久化

**涉及文件**：
- `src/state/recentSortPrefsStore.ts`（新增，~80 行）

**实现步骤**：
- [ ] 定义类型 `export type RecentSortField = 'accessedAt' | 'name' | 'fileType' | 'source';`
- [ ] 定义接口 `export interface RecentSortPrefs { field: RecentSortField; ascending: boolean; }`
- [ ] 定义默认值 `const DEFAULT_SORT: RecentSortPrefs = { field: 'accessedAt', ascending: false };`（按时间降序，等价 LRU，REQ-RF-03）
- [ ] 定义持久化键 `const PREF_KEY = 'pad2.recent.prefs.v1';`（独立键，与 `pad2.recent.v1` 不冲突，DFX-RF-03）
- [ ] 定义合法字段枚举 `const VALID_FIELDS: RecentSortField[] = ['accessedAt', 'name', 'fileType', 'source'];`
- [ ] 用 zustand create store，状态 `sort: RecentSortPrefs`，方法 `loadSortPrefs(): Promise<void>` 与 `setSort(sort: RecentSortPrefs): void`
- [ ] `loadSortPrefs`：从 Preferences 读取，JSON.parse，校验 field 在 VALID_FIELDS 内 + ascending 为 boolean，非法值降级为 DEFAULT_SORT（异常场景3），不崩溃；参考 `writebackConfig.ts:39-57` 模式
- [ ] `setSort`：内存 set + Preferences.set 持久化（持久化失败静默降级，本次会话生效，异常场景1）
- [ ] 新增测试注入点 `__setSortPrefsForTest(sort)` 注入 mock 排序偏好
- [ ] 导入 `Preferences` from `@capacitor/preferences`（HC-01 零新增依赖）

**验收标准**：
- [ ] 首次使用/无持久化排序偏好 → 默认 `{ field: 'accessedAt', ascending: false }`（按时间降序，等价 LRU，REQ-RF-03）
- [ ] setSort({ field: 'name', ascending: false }) 后持久化到 `pad2.recent.prefs.v1`
- [ ] 重启应用后 loadSortPrefs 读取保留"按名称降序"（REQ-RF-02, DFX-RF-02）
- [ ] 持久化的 field 值不在枚举内（数据篡改）→ 降级为默认排序，不崩溃（异常场景3）
- [ ] Preferences.set 失败 → 本次会话排序生效，不崩溃（异常场景1）
- [ ] 独立键不破坏既有 `pad2.recent.v1` 最近文件数据（DFX-RF-03）
- [ ] `npm run build` 通过

**依赖**：无

**覆盖**：REQ-RF-02, REQ-RF-03, DFX-RF-02, DFX-RF-03, 决策 D-RF-01

---

### 3.2 TASK-RF-02：新增 recentFileSort 排序纯函数

**涉及文件**：
- `src/utils/recentFileSort.ts`（新增，~50 行）

**实现步骤**：
- [ ] 导出 `sortRecentFiles(entries: readonly RecentFileEntry[], sort: RecentSortPrefs): RecentFileEntry[]`
- [ ] 实现按字段排序：
  - [ ] `field: 'accessedAt'`：按 accessedAt 数值排序（降序=新到旧=LRU 顺序）
  - [ ] `field: 'name'`：按 name 字典序排序（localeCompare，同名称保持原 LRU 顺序）
  - [ ] `field: 'fileType'`：按 fileType 字符串排序，同类型内保持原 LRU 顺序
  - [ ] `field: 'source'`：按 source 字符串排序，同来源内保持原 LRU 顺序
- [ ] ascending=true 升序，ascending=false 降序
- [ ] 使用稳定排序（Array.prototype.sort 在现代 JS 引擎为稳定排序，同字段同值保持原 LRU 顺序）
- [ ] 返回新数组（不改原 entries，不改 LRU 记录顺序，REQ-RF-08）
- [ ] 纯函数，无副作用，无 IO
- [ ] 导入 `RecentFileEntry` from `../state/recentFilesStore`，`RecentSortPrefs` from `../state/recentSortPrefsStore`

**验收标准**：
- [ ] 选择"按名称升序" → 列表按 name 字典序升序呈现（REQ-RF-01）
- [ ] 选择"按时间降序" → 列表按 accessedAt 降序呈现（等价 LRU 前插顺序，REQ-RF-01）
- [ ] 选择"按类型升序" → 列表按 fileType 升序，同类型内保持原 LRU 顺序（REQ-RF-01）
- [ ] 选择"按来源升序" → 列表按 source 升序，同来源内保持原 LRU 顺序（REQ-RF-01）
- [ ] 排序不改原 entries 数组（返回新数组，REQ-RF-08）
- [ ] 记录新文件后切换排序 → LRU 记录顺序不变（新文件仍置顶于 LRU），仅呈现顺序按排序变化（REQ-RF-08）
- [ ] 纯内存排序 < 100ms（DFX-RF-01）
- [ ] 空数组输入返回空数组
- [ ] `npm run build` 通过

**依赖**：TASK-RF-01（RecentSortPrefs 类型）

**覆盖**：REQ-RF-01, REQ-RF-08, DFX-RF-01, 决策 D-RF-02

---

### 3.3 TASK-RF-03：新增 RecentSortMenu 排序控件

**涉及文件**：
- `src/ui/pages/RecentFilesPage/RecentSortMenu/index.tsx`（新增，~70 行）
- `src/ui/pages/RecentFilesPage/RecentSortMenu/style.module.css`（新增，复用 BrowsePage/SortMenu 样式模式）

**实现步骤**：
- [ ] 创建目录 `src/ui/pages/RecentFilesPage/RecentSortMenu/`
- [ ] 参考 `src/ui/pages/BrowsePage/SortMenu/index.tsx`（:1-88）模式实现，字段集改为最近文件四字段：
  - [ ] `const SORT_FIELDS = [{ field: 'accessedAt', label: '时间', abbr: '时' }, { field: 'name', label: '名称', abbr: '名' }, { field: 'fileType', label: '类型', abbr: '类' }, { field: 'source', label: '来源', abbr: '源' }];`
- [ ] 导出 `RecentSortMenu({ sort, onChange }: { sort: RecentSortPrefs; onChange(sort: RecentSortPrefs): void })`
- [ ] TopBar 入口：icon-sort + 当前排序字段缩写徽章 + 升降序指示（↑/↓）
- [ ] BottomSheet：四字段 ListRow 选择 + 升降序切换 BaseButton
- [ ] 选择即生效（onChange），不设确认步骤
- [ ] 导入 `BaseButton` / `BottomSheet` / `ListRow` / `Icon` / `RecentSortPrefs` 类型

**验收标准**：
- [ ] 排序控件呈现 icon-sort + 当前字段缩写徽章 + 升降序指示
- [ ] 点击触发 BottomSheet 呈现四字段（时间/名称/类型/来源）+ 升降序切换
- [ ] 选择字段即 onChange 生效，BottomSheet 关闭
- [ ] 切换升降序即 onChange 生效
- [ ] 当前选中字段呈 icon-check-circle trailing 标识
- [ ] `npm run build` 通过

**依赖**：TASK-RF-01（RecentSortPrefs 类型）

**覆盖**：REQ-RF-05

---

### 3.4 TASK-RF-04：改造 RecentFilesPage 统一 ListRow + 排序控件

**涉及文件**：
- `src/ui/pages/RecentFilesPage/index.tsx`（改造，+40 行）

**实现步骤**：
- [ ] 新增 import：`ListRow` / `Icon` / `fileKindIcon` / `useRecentSortPrefsStore` / `sortRecentFiles` / `RecentSortMenu` / `Card`（参考 RecentFilesSection :6-15）
- [ ] 在组件内消费排序偏好：`const sort = useRecentSortPrefsStore((s) => s.sort);` + `const loadSortPrefs = useRecentSortPrefsStore((s) => s.loadSortPrefs);` + `const setSort = useRecentSortPrefsStore((s) => s.setSort);`
- [ ] useEffect 内新增 `void loadSortPrefs();`（与既有 `void load();` :10 并行）
- [ ] 空列表保持既有 EmptyState（:12-20 不变，REQ-RF-07），空态不呈现排序控件
- [ ] 非空列表时：
  - [ ] 顶部新增排序控件 `<RecentSortMenu sort={sort} onChange={setSort} />`（REQ-RF-05）
  - [ ] 将裸 div + 内联 style（:23-31）替换为 ListRow + fileKindIcon + 来源/时间副标题：
    - [ ] `const sorted = sortRecentFiles(entries, sort);`
    - [ ] `sorted.map((entry) => <ListRow key={entry.path} icon={<Icon name={fileKindIcon(entry.fileType)} size={32} />} title={entry.name} subtitle={`${entry.source} · ${formatTimestamp(entry.accessedAt)}`} trailing={<Icon name="icon-chevron-right" size={20} />} />)`
  - [ ] 消除所有内联 style（padding/borderBottom/fontWeight），改用 CSS module 或复用 RecentFilesSection 的 styles
- [ ] 移除不再需要的内联 style 导入

**验收标准**：
- [ ] 独立最近文件页每条用 ListRow + fileKindIcon 类型图标 + 来源/时间副标题（REQ-RF-04）
- [ ] 与首页 RecentFilesSection 视觉一致（无裸 div + 内联 style 视觉差异，REQ-RF-04）
- [ ] 页面提供排序字段选择（时间/名称/类型/来源）+ 升降序切换控件（REQ-RF-05）
- [ ] 选择排序后列表按新排序呈现 < 100ms（DFX-RF-01）
- [ ] 空列表呈现 EmptyState"还没有访问过文件"引导，不呈现排序控件（REQ-RF-07）
- [ ] 排序不改 LRU 记录顺序（REQ-RF-08）
- [ ] `npm run build` 通过

**依赖**：TASK-RF-01（recentSortPrefsStore）, TASK-RF-02（sortRecentFiles）, TASK-RF-03（RecentSortMenu）

**覆盖**：REQ-RF-04, REQ-RF-05, REQ-RF-07, 决策 D-RF-02

---

### 3.5 TASK-RF-05：扩展 RecentFilesSection 跟随全局排序

**涉及文件**：
- `src/ui/pages/HomePage/RecentFilesSection/index.tsx`（扩展，+8 行）

**实现步骤**：
- [ ] 新增 import：`useRecentSortPrefsStore` / `sortRecentFiles`
- [ ] 消费全局排序偏好：`const sort = useRecentSortPrefsStore((s) => s.sort);` + `const loadSortPrefs = useRecentSortPrefsStore((s) => s.loadSortPrefs);`
- [ ] useEffect 新增 `void loadSortPrefs();`（首次加载排序偏好）
- [ ] 改造 `visible` 计算（:22）：`const sorted = sortRecentFiles(entries, sort); const visible = sorted.slice(0, 8);`
- [ ] 首页不单独提供排序控件（排序在独立页设置，REQ-RF-06）
- [ ] 既有 ListRow + fileKindIcon 渲染（:50-63）不变，仅数据源改为 sorted

**验收标准**：
- [ ] 独立页设置"按名称降序"后返回首页 → 首页最近文件区按"按名称降序"呈现前 8 条（REQ-RF-06）
- [ ] 首页不呈现排序控件（REQ-RF-06）
- [ ] 首页 ListRow + fileKindIcon 渲染不变（:50-63 视觉标准保持）
- [ ] 空列表 EmptyState 行为不变（:39-48）
- [ ] 排序偏好未加载时默认按时间降序（等价 LRU，REQ-RF-03）
- [ ] `npm run build` 通过

**依赖**：TASK-RF-01（recentSortPrefsStore）, TASK-RF-02（sortRecentFiles）

**覆盖**：REQ-RF-06

---

## 4. 测试验证

### 4.1 TASK-TEST-01：单元测试（Node.js .mjs，JSON 输出）

**涉及文件**：
- `tests/verify-cp-01.mjs` ~ `verify-cp-07.mjs`（7 个，问题1）
- `tests/verify-sw-01.mjs` ~ `verify-sw-05.mjs`（5 个，问题2）
- `tests/verify-rf-01.mjs` ~ `verify-rf-08.mjs`（7 个，问题3，含 rf-04/06/08）
- 对应 `tests/cp01-result.json` ~ `rf08-result.json`（JSON 输出）

**实现步骤**：
- [ ] **T-CP-01** `verify-cp-01.mjs`：mock Preferences 注入 profile 数据，调用 initBootProfiles，断言 profiles 加载到内存（覆盖 REQ-CP-01）
- [ ] **T-CP-02** `verify-cp-02.mjs`：断言 initBootProfiles 异步不阻塞（load 返回 Promise 未 resolve 时应用已可交互，覆盖 REQ-CP-02）
- [ ] **T-CP-03** `verify-cp-03.mjs`：mock 旧数据（无 autoConnect）加载后 autoConnect=false；保存 autoConnect=true 后持久化含字段（覆盖 REQ-CP-03/DFX-CP-08）
- [ ] **T-CP-04** `verify-cp-04.mjs`：mock remembered+解密成功 → connect 发起；mock unset → 跳过+提示；mock 解密失败 → connect_failed（覆盖 REQ-CP-04/DFX-CP-05）
- [ ] **T-CP-05** `verify-cp-05.mjs`：断言 orchestrateAutoReconnect 异步执行不阻塞（覆盖 REQ-CP-05）
- [ ] **T-CP-06** `verify-cp-06.mjs`：mock 5 个 autoConnect profile，断言 4 个 connect 第 5 个拒绝（覆盖 REQ-CP-06）
- [ ] **T-CP-07** `verify-cp-07.mjs`：mock connect reject，断言 handle connect_failed + lastError 可读（覆盖 REQ-CP-07）
- [ ] **T-SW-01** `verify-sw-01.mjs`：mock A/B connected，switchBrowse(B) 后 browseContextStore.activeProfileId=B（覆盖 REQ-SW-01）
- [ ] **T-SW-02** `verify-sw-02.mjs`：同 T-SW-01 经 MultiSmbCards 路径（覆盖 REQ-SW-02）
- [ ] **T-SW-03** `verify-sw-03.mjs`：断言 switchBrowse 不调 SmbPlugin.connect（覆盖 REQ-SW-03）
- [ ] **T-SW-04** `verify-sw-04.mjs`：mock 快速 A→B→C，断言最终 activeProfileId=C + B 中间态忽略（覆盖 REQ-SW-04/DFX-SW-02）
- [ ] **T-SW-05** `verify-sw-05.mjs`：mock disconnected profile，switchBrowse 导航到 connection（覆盖 REQ-SW-05）
- [ ] **T-RF-01** `verify-rf-01.mjs`：四字段×升降序断言（覆盖 REQ-RF-01）
- [ ] **T-RF-02** `verify-rf-02.mjs`：setSort 后重启 loadSortPrefs 保留（覆盖 REQ-RF-02/DFX-RF-02）
- [ ] **T-RF-03** `verify-rf-03.mjs`：无持久化时默认时间降序（覆盖 REQ-RF-03）
- [ ] **T-RF-04** `verify-rf-04.mjs`：断言 RecentFilesPage 用 ListRow 无裸 div（覆盖 REQ-RF-04）
- [ ] **T-RF-06** `verify-rf-06.mjs`：独立页 setSort 后首页跟随（覆盖 REQ-RF-06）
- [ ] **T-RF-08** `verify-rf-08.mjs`：record 后 sortRecentFiles 不改原 entries LRU 顺序（覆盖 REQ-RF-08）
- [ ] 测试注入点：`smbMultiConnStore.__setSmbPluginDepsForTest` / `recentSortPrefsStore.__setSortPrefsForTest` / `autoReconnect.__setDepsForTest`
- [ ] 每个脚本输出 JSON 结果文件（如 `cp01-result.json`），含 passed/failed/coverage 字段

**验收标准**：
- [ ] 19 个验证脚本全部执行，JSON 输出 passed=true
- [ ] 覆盖 spec.md 全部 22 条业务规则 + 13 条 DFX 约束
- [ ] 测试脚本为 Node.js ES Module（.mjs），无新增 npm 依赖（HC-01）
- [ ] JSON 输出格式统一：`{ testId, passed, coverage, durationMs, assertions }`

**依赖**：TASK-CP-01~04, TASK-SW-01~04, TASK-RF-01~05（P3 全部完成）

**覆盖**：全部 REQ/DFX

---

### 4.2 TASK-TEST-02：集成测试（真机/模拟器）

**涉及文件**：
- 集成测试用例文档（手动执行清单）

**实现步骤**：
- [ ] **IT-CP-01**：冷启动有 2 个 autoConnect profile（凭据可用）→ SideNav 呈现 profile 列表，2 个异步重连成功
- [ ] **IT-CP-02**：冷启动有 autoConnect profile 但未记住密码 → 跳过自动重连 + 提示"请手动输入密码连接"
- [ ] **IT-CP-03**：冷启动有 5 个 autoConnect profile → 4 个并行重连，第 5 个排队/拒绝 + 提示
- [ ] **IT-CP-04**：冷启动 autoConnect profile 网络不可达 → 徽章呈现 connect_failed + "网络不可达"，不阻塞应用
- [ ] **IT-SW-01**：共享 A、B 均 connected，SideNav 点击 B → activeProfileId=B，BrowsePage 呈现 B 上下文
- [ ] **IT-SW-02**：共享 A、B 均 connected，MultiSmbCards 点击 B → activeProfileId=B，BrowsePage 呈现 B 上下文
- [ ] **IT-SW-03**：快速切换 A→B→C → 最终 activeProfileId=C，不闪烁残留 B
- [ ] **IT-SW-04**：点击未连接 profile → 导航到连接页，不进入浏览页
- [ ] **IT-RF-01**：独立页选择"按名称降序"后重启 → 排序选项保留为"按名称降序"
- [ ] **IT-RF-02**：独立页与首页视觉对比 → 均用 ListRow + 类型图标，无裸 div 视觉差异
- [ ] **IT-RF-03**：独立页设置排序后返回首页 → 首页最近文件区跟随全局排序呈现前 8 条

**验收标准**：
- [ ] 11 个集成测试场景全部通过
- [ ] 真机/模拟器执行，覆盖关键用户操作路径
- [ ] 每个 IT 记录执行结果与截图证据

**依赖**：TASK-TEST-01

**覆盖**：关键交互路径（冷启动/切换浏览/排序）

---

### 4.3 TASK-TEST-03：回归测试（既有功能兼容）

**涉及文件**：
- 回归测试用例文档

**实现步骤**：
- [ ] **RT-01**：既有 profile 持久化兼容（HC-05）→ 升级后既有 profile 列表保留，autoConnect 视为 false
- [ ] **RT-02**：既有最近文件数据兼容（DFX-RF-03）→ 升级后既有最近文件条目保留，排序默认"按时间降序"（LRU 等价）
- [ ] **RT-03**：既有 smbConnectionStore 调用方不受影响 → BrowsePage 消费 activeProfileId 正常
- [ ] **RT-04**：既有 smbMultiConnStore.connect 路径不变 → 手动连接/断开/重连正常，switchToken 不影响单切换
- [ ] **RT-05**：既有 recentFilesStore.record LRU 顺序不变 → 记录新文件后 LRU 前插，排序仅影响呈现
- [ ] **RT-06**：main.tsx HC-03 行数约束 → main.tsx 改动 ≤ 3 行（实际 +2 行）
- [ ] **RT-07**：冻结区零变更 → `git diff src/adapter/smb/SmbPlugin.ts src/core/** android/**` 无变更

**验收标准**：
- [ ] 7 个回归测试全部通过
- [ ] 既有功能无退化
- [ ] 冻结区 git diff 为空（HC-02）

**依赖**：TASK-TEST-01

**覆盖**：HC-05, DFX-RF-03, HC-02, HC-03

---

## 5. 硬约束与需求覆盖验证

### 5.1 TASK-VERIFY-01：硬约束与冻结区验证

**涉及文件**：
- 验证脚本 + git diff 检查

**实现步骤**：
- [ ] **HC-01 零新增 npm 依赖**：检查 `package.json` / `package-lock.json` 无新增 dependencies，`git diff package.json` 仅可能无变更
- [ ] **HC-02 冻结区零变更**：`git diff --stat src/adapter/smb/SmbPlugin.ts src/core/ android/` 输出为空
- [ ] **HC-03 main.tsx 改动限 3 行内**：`git diff src/main.tsx` 统计 +/- 行数 ≤ 3（实际 +2 行：1 import + 1 调用）
- [ ] **HC-04 store 分级**：grep 检查 UI 层文件（`src/ui/**`) 无 `import SmbPlugin`（编排模块 `src/orchestration/**` 经 store 调用）
- [ ] **HC-05 既有 profile 持久化兼容**：STORAGE_VERSION 保持 1，旧数据加载 autoConnect 视为 false（RT-01）
- [ ] **HC-06 只读模式兼容**：writebackConfig enabled=false 场景下本特性功能正常（自动重连/切换浏览/排序均不依赖写回）

**验收标准**：
- [ ] HC-01~06 全部验证通过，记录证据
- [ ] 冻结区 git diff 为空
- [ ] main.tsx 改动 ≤ 3 行
- [ ] UI 层无 SmbPlugin import
- [ ] 验证结果记录到 `verify-hc-result.json`

**依赖**：TASK-TEST-01, TASK-TEST-03

**覆盖**：HC-01~06

---

### 5.2 TASK-VERIFY-02：需求覆盖与设计一致性核对

**涉及文件**：
- 覆盖矩阵文档

**实现步骤**：
- [ ] 核对 spec.md 22 条业务规则（REQ-CP-01~08, REQ-SW-01~06, REQ-RF-01~08）每条均有任务覆盖
- [ ] 核对 spec.md 13 条 DFX 约束（DFX-CP-01~08, DFX-SW-01/02, DFX-RF-01~03）每条均有任务覆盖
- [ ] 核对 design.md 6 个关键决策（D-CP-01/02/03, D-SW-01/02, D-RF-01/02）均已落地
- [ ] 核对 design.md 新增文件清单（5 个）全部创建：`autoReconnect.ts` / `switchBrowse.ts` / `recentSortPrefsStore.ts` / `recentFileSort.ts` / `RecentSortMenu/index.tsx`
- [ ] 核对 design.md 变更文件清单（8 个）均已按预期变更：`main.tsx` / `smbProfilesStore.ts` / `smbMultiConnStore.ts` / `SideNav/index.tsx` / `MultiSmbCards.tsx` / `RecentFilesPage/index.tsx` / `RecentFilesSection/index.tsx` / `ConnectionFormPanel/index.tsx`
- [ ] 核对 design.md 保留兼容文件（6 个）零变更：`smbConnectionStore.ts` / `browseContextStore.ts` / `recentFilesStore.ts` / `connectionHandle.ts` / `crypto.ts` / `BrowsePage/index.tsx`
- [ ] 生成需求覆盖矩阵表（REQ/DFX → TASK 映射）

**验收标准**：
- [ ] 22 条业务规则 + 13 条 DFX 约束 + 6 个决策全部覆盖，无遗漏
- [ ] 新增/变更/保留文件清单与 design.md 2.4 节完全一致
- [ ] 覆盖矩阵文档归档到 `docs/specs/conn_persist_recent_ui/coverage-matrix.md`
- [ ] 验证结果记录到 `verify-coverage-result.json`

**依赖**：TASK-VERIFY-01

**覆盖**：全部 REQ/DFX/决策

---

## 任务执行顺序建议

```
P1（可并行）:
  TASK-CP-01 ─┐
  TASK-SW-01 ─┼─→ P2
  TASK-RF-01 ─┘

P2（依赖 P1）:
  TASK-CP-02 (← CP-01)
  TASK-SW-02 (← SW-01)
  TASK-RF-02 (← RF-01)
  TASK-RF-03 (← RF-01)

P3（依赖 P2，内部可并行）:
  TASK-CP-03 (← CP-02)
  TASK-CP-04 (← CP-01)
  TASK-SW-03 (← SW-02)
  TASK-SW-04 (← SW-02)
  TASK-RF-04 (← RF-01/02/03)
  TASK-RF-05 (← RF-01/02)

P4（依赖 P3 全部）:
  TASK-TEST-01 → TASK-TEST-02 / TASK-TEST-03

P5（依赖 P4）:
  TASK-VERIFY-01 → TASK-VERIFY-02
```

---

## 风险关注点（执行时持续监控）

| 风险编号 | 风险 | 关联任务 | 监控措施 |
|---------|------|---------|---------|
| R-01 | autoConnect 字段旧数据兼容 | TASK-CP-01 | RT-01 回归：旧数据加载 autoConnect=false |
| R-03 | switchToken 改变既有 switchHotTo 行为 | TASK-SW-01 | RT-04 回归：单切换 token 一致不触发忽略 |
| R-04 | 自动重连并发网络压力 | TASK-CP-02 | T-CP-06：MAX_CONCURRENT=4 上限验证 |
| R-06 | 快速切换重连风暴 | TASK-SW-01 | T-SW-04：switchToken 过期忽略 |
| R-09 | 自动重连失败静默无反馈 | TASK-CP-02 | T-CP-07：handle.lastError + 徽章验证 |
| R-11 | 排序字段值非法 | TASK-RF-01 | T-RF-02：非法 field 降级默认 |

---

> 本任务分解文档基于 spec.md（PAD2-SPEC-CPRU-001）的 22 条业务规则 + 13 条 DFX 约束与 design.md（PAD2-DESIGN-CPRU-001）的 6 个关键决策、5 个新增文件、8 个变更文件，分解为 5 个阶段 18 个任务（13 个实现 + 3 个测试 + 2 个验证）。任务按业务功能垂直切割（问题1/问题2/问题3），按依赖关系排序（P1 基础 → P2 编排 → P3 接入 → P4 测试 → P5 验证），被依赖者在前。所有任务遵守 HC-01~06 硬约束，覆盖全部 REQ/DFX 与设计决策。下一步由编码执行 agent 按任务顺序实现。
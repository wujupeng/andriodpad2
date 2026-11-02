# SMB 连接根路径（rootPath）编码任务规划

> 文档版本：v1.0
> 生成日期：2026-11-02
> 特性编号：ROOT-PATH
> 追溯规格：`docs/specs/root_path/spec.md` v1.0
> 追溯设计：`docs/specs/root_path/design.md` v1.0
> 任务编号规范：TASK-RP-xx（主任务组）/ TASK-RP-xx-Y（子任务，Y 为大写字母序）
> 验证脚本规范：Node.js ES Module（.mjs），结果以 JSON 输出（PREFERENCE_10）

---

## 任务总览

| 任务组 | 名称 | 依赖 | 覆盖需求 |
|--------|------|------|----------|
| TASK-RP-01 | 路径规范化工具模块 | 无 | REQ-RP-10、REQ-RP-11、REQ-RP-12 |
| TASK-RP-02 | 连接配置数据模型扩展 | TASK-RP-01 | REQ-RP-01、REQ-RP-02、REQ-RP-14、REQ-RP-15、REQ-RP-16、REQ-RP-18 |
| TASK-RP-03 | 浏览上下文逻辑根扩展 | TASK-RP-01、TASK-RP-02 | REQ-RP-03、REQ-RP-04、REQ-RP-06 |
| TASK-RP-04 | 面包屑根段扩展 | TASK-RP-03 | REQ-RP-05、REQ-RP-06、REQ-RP-07 |
| TASK-RP-05 | 连接表单 rootPath 输入项 | TASK-RP-01、TASK-RP-02 | REQ-RP-08、REQ-RP-09、REQ-RP-11 |
| TASK-RP-06 | 集成验证与回归测试 | TASK-RP-01 ~ TASK-RP-05 | REQ-RP-02、REQ-RP-03、REQ-RP-04、REQ-RP-13、REQ-RP-17 |
| TASK-RP-07 | 硬约束遵守验证 | TASK-RP-01 ~ TASK-RP-05 | HC-01、HC-02、HC-05、CON-RP-01、CON-RP-02、CON-RP-03 |
| TASK-RP-08 | 评审与最终验证 | TASK-RP-01 ~ TASK-RP-07 | 全量交付质量 |

**依赖关系图**：
```
TASK-RP-01 (规范化工具)
  ├──> TASK-RP-02 (数据模型) ──┬──> TASK-RP-03 (浏览上下文) ──> TASK-RP-04 (面包屑)
  │                            └──> TASK-RP-05 (连接表单)
  └──> TASK-RP-05
TASK-RP-06 (集成验证) ← TASK-RP-01~05
TASK-RP-07 (硬约束验证) ← TASK-RP-01~05
TASK-RP-08 (评审) ← TASK-RP-01~07
```

---

## TASK-RP-01 路径规范化工具模块

> 业务功能：提供 rootPath 输入规范化与越界校验的单一真相源（纯函数，HC-01 零依赖）。
> 依赖：无（基础模块，被 TASK-RP-02 与 TASK-RP-05 共消费）。
> 覆盖需求：REQ-RP-10（输入规范化）、REQ-RP-11（越界片段拒绝）、REQ-RP-12（多级路径允许）。

### TASK-RP-01-A 新建 normalizeRootPath 纯函数

- [ ] 新建文件 `src/utils/rootPathNormalize.ts`，导出 `NormalizeRootPathResult` 判别联合类型与 `normalizeRootPath` 纯函数，签名：`function normalizeRootPath(raw: unknown): NormalizeRootPathResult`，其中 `NormalizeRootPathResult = | { ok: true; value: string } | { ok: false; reason: 'empty' | 'parent_ref' | 'invalid_type' }`
- [ ] 实现 S1 类型校验：`typeof raw !== 'string'` → 返回 `{ ok: false, reason: 'invalid_type' }`（覆盖 REQ-RP-14/18 的数字、null 等非法类型）
- [ ] 实现 S2 trim 去首尾空白；S3 循环去除前导/尾随 `/` 与 `\`；S4 规范化后空串 → 返回 `{ ok: false, reason: 'empty' }`（覆盖 REQ-RP-10 的 `"   "` / `"/"` / `"\\"` → 未配置）
- [ ] 实现 S5 分段：合并 `split('/')` 与 `split('\\')` 兼容两种分隔符输入；S6 任一段 === `'..'` → 返回 `{ ok: false, reason: 'parent_ref' }`（覆盖 REQ-RP-11 越界拒绝）；S7 以 `\\` 统一分隔符 join 重组，返回 `{ ok: true, value }`（覆盖 REQ-RP-12 多级路径如 `"AutoFileBackup/2026"` → `"AutoFileBackup\\2026"`）
- [ ] 确保纯函数无副作用、不抛异常、无外部 import（HC-01 零新增 npm 依赖），仅用 TypeScript 内置字符串操作
- [ ] 添加 JSDoc 注明判别联合设计决策（D-RP-N01）：sanitize 静默丢弃与表单提示用户两消费方按场景选择处理策略

### TASK-RP-01-B normalizeRootPath 单元测试

- [ ] 新建验证脚本 `verify-rp-normalize.mjs`（Node.js ES Module），从源码 import `normalizeRootPath`，结果输出到 `rp-normalize-result.json`
- [ ] 覆盖合法单级：`normalizeRootPath('AutoFileBackup')` → `{ ok: true, value: 'AutoFileBackup' }`
- [ ] 覆盖合法多级：`normalizeRootPath('AutoFileBackup/2026')` → `{ ok: true, value: 'AutoFileBackup\\2026' }`；`normalizeRootPath('a\\b\\c')` → `{ ok: true, value: 'a\\b\\c' }`
- [ ] 覆盖首尾分隔符与空白：`normalizeRootPath(' /AutoFileBackup/ ')` → `{ ok: true, value: 'AutoFileBackup' }`；`normalizeRootPath('\\Auto\\')` → `{ ok: true, value: 'Auto' }`
- [ ] 覆盖空串类：`normalizeRootPath('  ')` / `normalizeRootPath('/')` / `normalizeRootPath('\\')` / `normalizeRootPath('')` → `{ ok: false, reason: 'empty' }`
- [ ] 覆盖父级引用：`normalizeRootPath('../other')` / `normalizeRootPath('a/../b')` → `{ ok: false, reason: 'parent_ref' }`
- [ ] 覆盖非法类型：`normalizeRootPath(123)` / `normalizeRootPath(null)` / `normalizeRootPath(undefined)` / `normalizeRootPath({})` → `{ ok: false, reason: 'invalid_type' }`
- [ ] 判别联合返回值精确比对（含 ok 与 value/reason 字段），全部断言通过且 JSON 结果标记 PASS

**验证方式**：`node verify-rp-normalize.mjs` → 检查 `rp-normalize-result.json` 全部 PASS；`npx tsc --noEmit` 对 `src/utils/rootPathNormalize.ts` 类型检查通过。

---

## TASK-RP-02 连接配置数据模型扩展

> 业务功能：SmbProfile 持久化 rootPath 字段，遵循既有 sanitize 白名单范式，旧数据零迁移兼容。
> 依赖：TASK-RP-01（sanitize 消费 normalizeRootPath）。
> 覆盖需求：REQ-RP-01（字段可选性）、REQ-RP-02（字段语义）、REQ-RP-14（持久化清洗）、REQ-RP-15（旧数据零迁移）、REQ-RP-16（版本号不变）、REQ-RP-18（非法值容错）。

### TASK-RP-02-A SmbProfile / SmbProfileInput 新增 rootPath 字段

- [ ] 在 `src/state/smbProfilesStore.ts` 的 `SmbProfile` 接口（L26-55）新增可选字段 `rootPath?: string`，添加 JSDoc 注明：share 内子目录相对路径（规范化后，`\\` 分隔，无首尾分隔符，无 `..`），unset 时浏览逻辑根=share 根
- [ ] 在 `SmbProfileInput` 接口（L57-67）新增可选字段 `rootPath?: string`，注明：表单提交的规范化后 rootPath（undefined=未配置）
- [ ] 确认 `STORAGE_VERSION`（L24）保持 `1` 不升（REQ-RP-16、HC-05），rootPath 作为 version 1 框架内可选字段向后兼容扩展
- [ ] 确认 `isSameProfileIdentity`（L102-113）零变更，rootPath 不参与身份判定（CON-RP-01）

### TASK-RP-02-B sanitizeProfile 新增 rootPath 白名单分支

- [ ] 在 `src/state/smbProfilesStore.ts` 的 `sanitizeProfile`（L132-167）新增 rootPath 解析分支，位置置于可选字段解析区（domain 之后、passwordEmpty 之前或之后，与既有可选字段同风格）
- [ ] 落位规则：`typeof p.rootPath === 'string' && p.rootPath` 时调用 `normalizeRootPath(p.rootPath)`，仅当 `result.ok === true && result.value` 非空才 `profile.rootPath = result.value`；`ok === false`（含 `invalid_type` / `parent_ref` / `empty`）静默丢弃该字段（REQ-RP-14、REQ-RP-18，不拒整个 profile）
- [ ] 从 `../utils/rootPathNormalize` import `normalizeRootPath`（模块顶部 import 区）
- [ ] 确保非字符串类型（数字、null、对象）经 normalizeRootPath 的 `invalid_type` 分支静默丢弃，其余字段不受影响（fail-secure，与 passwordEncrypted 格式非法同策略）

### TASK-RP-02-C save 新增 rootPath 落位

- [ ] 在 `src/state/smbProfilesStore.ts` 的 `save`（L223-275）构造 `entry`（L256-269）处新增 rootPath 赋值：`if (input.rootPath) entry.rootPath = input.rootPath`（input.rootPath 已由 UI 层 TASK-RP-05 规范化，此处仅透传非空值）
- [ ] 确认 undefined 不写入 entry（与 domain/passwordEmpty 等可选字段同策略，JSON 序列化时不出现该字段，旧数据兼容）

### TASK-RP-02-D sanitize rootPath 单元测试

- [ ] 新建验证脚本 `verify-rp-sanitize.mjs`（Node.js ES Module），结果输出到 `rp-sanitize-result.json`
- [ ] 覆盖旧数据无 rootPath 字段：`sanitizeProfile({ id, name, host, share, username, createdAt })` → `profile.rootPath === undefined`（REQ-RP-15）
- [ ] 覆盖非法类型：`sanitizeProfile({ ..., rootPath: 123 })` / `rootPath: null` → `profile.rootPath === undefined`，其余字段正常（REQ-RP-14、REQ-RP-18）
- [ ] 覆盖含 `..` 越界：`sanitizeProfile({ ..., rootPath: '../x' })` → `profile.rootPath === undefined`（REQ-RP-18）
- [ ] 覆盖含首尾分隔符：`sanitizeProfile({ ..., rootPath: '/Auto/' })` → `profile.rootPath === 'Auto'`（REQ-RP-10）
- [ ] 覆盖合法多级：`sanitizeProfile({ ..., rootPath: 'AutoFileBackup/2026' })` → `profile.rootPath === 'AutoFileBackup\\2026'`（REQ-RP-12）
- [ ] 覆盖空串：`sanitizeProfile({ ..., rootPath: '' })` / `rootPath: '   '` → `profile.rootPath === undefined`（REQ-RP-01）
- [ ] 覆盖必填字段缺失仍整体丢弃：`sanitizeProfile({ rootPath: 'Auto' })`（缺 id 等）→ 返回 `null`，rootPath 不影响整体丢弃逻辑
- [ ] 全部断言通过且 JSON 结果标记 PASS

**验证方式**：`node verify-rp-sanitize.mjs` → 检查 `rp-sanitize-result.json` 全部 PASS；`npx tsc --noEmit` 对 `src/state/smbProfilesStore.ts` 类型检查通过。

---

## TASK-RP-03 浏览上下文逻辑根扩展

> 业务功能：浏览上下文以 rootPath 为逻辑根确定初始路径，并在导航入口钳制越界。
> 依赖：TASK-RP-01（clampToLogicalRoot 不依赖 normalize 但同模块语义）、TASK-RP-02（需查 profile.rootPath）。
> 覆盖需求：REQ-RP-03（初始路径）、REQ-RP-04（切换复用上下文）、REQ-RP-06（向上越界禁止）。

### TASK-RP-03-A 新增 resolveInitialPath 纯函数

- [ ] 在 `src/state/browseContextStore.ts` 新增导出纯函数 `function resolveInitialPath(rootPath: string | undefined): string`
- [ ] 实现：`rootPath` 非空（非 undefined、非空串）→ 返回 `rootPath`；`rootPath` 为 undefined 或空串 → 返回 `'/'`（share 根，与 createEntry 现状一致，REQ-RP-03 第二验收条件）
- [ ] 添加 JSDoc 注明前置条件（rootPath 已规范化或 undefined）、后置条件（返回 share 内相对路径）

### TASK-RP-03-B 新增 clampToLogicalRoot 纯函数

- [ ] 在 `src/state/browseContextStore.ts` 新增导出纯函数 `function clampToLogicalRoot(path: string, rootPath: string | undefined): string`
- [ ] 实现：`rootPath` 为 undefined 或空串 → 原样返回 `path`（无约束，现状）；`rootPath` 非空且 `path` 不以 `rootPath` 开头（即 `path !== rootPath && !path.startsWith(rootPath + '\\')`）→ 返回 `rootPath`（钳制到浏览逻辑根）；否则原样返回 `path`（在逻辑根之内）
- [ ] 添加 JSDoc 注明 CON-RP-03 浏览逻辑根不可越界上界约束

### TASK-RP-03-C createEntry 增加 rootPath 参数

- [ ] 在 `src/state/browseContextStore.ts` 的 `createEntry`（L33-42）签名增加可选参数 `rootPath?: string`
- [ ] 将 `currentPath: '/'` 硬编码改为 `currentPath: resolveInitialPath(rootPath)`，使初始 currentPath 感知 rootPath（REQ-RP-03 第一验收条件）

### TASK-RP-03-D setActiveProfile 查 profile.rootPath 计算初始路径

- [ ] 在 `src/state/browseContextStore.ts` 的 `setActiveProfile`（L70-80）创建空条目分支（L73-76），通过 `useSmbProfilesStore.getState().profiles.find(p => p.id === profileId)` 查找 profile 获取 rootPath（store 间只读查询，无循环依赖：ProfileStore 不反向依赖 BrowseStore）
- [ ] 将 `createEntry()` 调用改为 `createEntry(profile?.rootPath)`，使首次创建上下文时初始 currentPath 为 rootPath
- [ ] 确认复用分支（L77-79，`contexts.has(profileId)` 为 true）仅切换 activeProfileId 不重置 currentPath，天然满足 REQ-RP-04（切换复用上下文不重置）
- [ ] import `useSmbProfilesStore` from `./smbProfilesStore`（模块顶部 import 区）

### TASK-RP-03-E enterDirectory 入口越界钳制

- [ ] 在 `src/state/browseContextStore.ts` 的 `enterDirectory`（L82-109）入口处（确保上下文存在之后、switchHotTo 之前或之后、设置 currentPath 之前），查找 profile.rootPath 并对入参 path 执行 `clampToLogicalRoot(path, rootPath)` 钳制
- [ ] 钳制后的 path 用于后续 `updateContext` 设置 currentPath 与 `SmbPlugin.listDirectory({ path })` 透传，防御任何调用方传入越界路径（CON-RP-03、REQ-RP-06 防御层 1）
- [ ] 确认 SmbPlugin.listDirectory 调用（L101）签名与参数语义不变（HC-02 冻结区零变更），rootPath 拼接在应用层完成

### TASK-RP-03-F 浏览上下文单元测试

- [ ] 新建验证脚本 `verify-rp-initial-path.mjs`，覆盖 `resolveInitialPath('AutoFileBackup')` → `'AutoFileBackup'`；`resolveInitialPath(undefined)` → `'/'`；`resolveInitialPath('')` → `'/'`，结果输出到 `rp-initial-path-result.json`
- [ ] 新建验证脚本 `verify-rp-clamp.mjs`，覆盖：无 rootPath → 原样返回；path 在 rootPath 内（`'AutoFileBackup\\sub'`, `'AutoFileBackup'`）→ 原样；path 越出（`'OtherDir'`, `'AutoFileBackup'`）→ 返回 `'AutoFileBackup'`；边界 path===rootPath → 原样；path 为 share 根 `'/'` 且 rootPath 非空 → 钳制到 rootPath，结果输出到 `rp-clamp-result.json`
- [ ] 全部断言通过且 JSON 结果标记 PASS

**验证方式**：`node verify-rp-initial-path.mjs && node verify-rp-clamp.mjs` → 检查两个 JSON 结果全部 PASS；`npx tsc --noEmit` 对 `src/state/browseContextStore.ts` 类型检查通过。

---

## TASK-RP-04 面包屑根段扩展

> 业务功能：面包屑以 rootPath 为根段显示，剥离 rootPath 前缀后拆分子段，越界时仅显示根段。
> 依赖：TASK-RP-03（BrowsePage 消费 browseContextStore，rootPath 来自 profile）。
> 覆盖需求：REQ-RP-05（根段显示）、REQ-RP-06（向上越界禁止，显示层防御层 2）、REQ-RP-07（未配置时面包屑不变）。

### TASK-RP-04-A buildSegments 增加 rootPath 参数

- [ ] 在 `src/ui/pages/BrowsePage/index.tsx` 的 `buildSegments`（L40-51）签名增加第三参数 `rootPath?: string`
- [ ] 修改根段：`{ name: rootName, path: rootPath || '' }`（rootPath 非空时根段 path 为 rootPath，点击回到浏览逻辑根；未配置时 path 为 `''`，与现状一致 REQ-RP-07）
- [ ] 修改子段拆分逻辑：rootPath 非空时，先判断 currentPath 是否以 rootPath 开头（`currentPath === rootPath || currentPath.startsWith(rootPath + '\\')`）；是 → 剥离 rootPath 前缀后对剩余部分按 `\\` split 拆分子段，子段 path 累加时以 `rootPath` 为 acc 起点；否 → 仅显示根段（防御层 2，不显示越界段 REQ-RP-06）
- [ ] rootPath 未提供（undefined）时回退现状逻辑：根段 path=`''`，currentPath 全量按 `\\` split 拆分子段（REQ-RP-07 行为等价）
- [ ] 确认 currentPath 为 `'/'`（share 根，未配置 rootPath 时初始值）且 rootPath 未配置时，`'/'.split('\\')` 后 filter(Boolean) 为空，仅显示根段（现状）

### TASK-RP-04-B BrowsePage 传入 rootPath

- [ ] 在 `src/ui/pages/BrowsePage/index.tsx` 的 `rootName` useMemo（L152-155）同位置或新增 useMemo 查找 profile 并提取 rootPath：`const rootPath = useMemo(() => profiles.find(p => p.id === activeProfileId)?.rootPath, [profiles, activeProfileId])`
- [ ] 将 `segments` useMemo（L157-160）的 `buildSegments(currentPath, rootName)` 调用改为 `buildSegments(currentPath, rootName, rootPath)`
- [ ] 确认 Breadcrumb 组件（`src/ui/components/Breadcrumb/index.tsx`）数据契约不变，仅根段 path 值由调用方决定（design.md 2.1.2 Breadcrumb 不变）

### TASK-RP-04-C buildSegments 单元测试

- [ ] 新建验证脚本 `verify-rp-segments.mjs`，结果输出到 `rp-segments-result.json`
- [ ] 覆盖 rootPath 未传（现状）：`buildSegments('\\sub', 'soft')` → 根段 path=`''` + 子段全量拆分（REQ-RP-07）
- [ ] 覆盖 currentPath===rootPath：`buildSegments('AutoFileBackup', 'AutoFileBackup', 'AutoFileBackup')` → 仅根段 `[{name:'AutoFileBackup', path:'AutoFileBackup'}]`（REQ-RP-06）
- [ ] 覆盖 currentPath 在 rootPath 内：`buildSegments('AutoFileBackup\\sub', 'AutoFileBackup', 'AutoFileBackup')` → `[{name:'AutoFileBackup', path:'AutoFileBackup'}, {name:'sub', path:'AutoFileBackup\\sub'}]`（REQ-RP-05，剥离前缀后拆分）
- [ ] 覆盖 currentPath 越出 rootPath：`buildSegments('OtherDir', 'AutoFileBackup', 'AutoFileBackup')` → 仅根段（防御层 2，REQ-RP-06）
- [ ] 覆盖多级 rootPath：`buildSegments('AutoFileBackup\\2026\\sub', '工作目录', 'AutoFileBackup\\2026')` → 根段 + sub 子段（REQ-RP-12）
- [ ] 覆盖未配置 rootPath 且 currentPath='/'：`buildSegments('/', 'soft')` → 仅根段 `[{name:'soft', path:''}]`（现状）
- [ ] 全部断言通过且 JSON 结果标记 PASS

**验证方式**：`node verify-rp-segments.mjs` → 检查 `rp-segments-result.json` 全部 PASS；`npx tsc --noEmit` 对 `src/ui/pages/BrowsePage/index.tsx` 类型检查通过。

---

## TASK-RP-05 连接表单 rootPath 输入项

> 业务功能：连接表单提供 rootPath 可选输入项，编辑回填，保存时经 normalizeRootPath 校验透传。
> 依赖：TASK-RP-01（消费 normalizeRootPath）、TASK-RP-02（save 落位 rootPath）。
> 覆盖需求：REQ-RP-08（表单字段）、REQ-RP-09（编辑回填）、REQ-RP-11（越界片段拒绝，表单层提示）。

### TASK-RP-05-A ConnectionFormValues 新增 rootPath 字段

- [ ] 在 `src/ui/pages/ConnectionPage/ConnectionFormPanel/index.tsx` 的 `ConnectionFormValues` 接口（L33-40）新增字段 `rootPath: string`
- [ ] 在 `EMPTY_FORM`（L42-49）新增 `rootPath: ''`

### TASK-RP-05-B 新增 rootPath FormField 输入项

- [ ] 在 `ConnectionFormPanel` 的 JSX 表单区（域字段 FormField 之后、记住密码 checkbox 之前，L332 行附近）新增 `<FormField label="根路径（选填）" value={form.rootPath} onChange={setField('rootPath')} placeholder="如 AutoFileBackup" hint="留空使用共享根；填入则将该子目录作为浏览根" error={fieldErrors.rootPath} />`
- [ ] 确认 FormField 为既有组件（`../FormField`），零新增依赖（HC-01）

### TASK-RP-05-C validateForm 增加 .. 越界拒绝

- [ ] 在 `src/ui/pages/ConnectionPage/ConnectionFormPanel/index.tsx` 的 `validateForm`（L67-80）新增 rootPath 校验分支：当 `form.rootPath.trim()` 非空时调用 `normalizeRootPath(form.rootPath)`，若 `result.ok === false && result.reason === 'parent_ref'` → `errors.rootPath = '根路径不得越出共享范围'`（REQ-RP-11 表单层提示用户，拒保存）
- [ ] `reason === 'empty'` / `'invalid_type'` 不设错误（视为未配置，保存时 unset，REQ-RP-01）
- [ ] import `normalizeRootPath` from `../../../../utils/rootPathNormalize`

### TASK-RP-05-D 编辑模式 rootPath 回填

- [ ] 在 `src/ui/pages/ConnectionPage/ConnectionFormPanel/index.tsx` 的 `form` useState 初始化（L98-109）预填对象新增 `rootPath: initialProfile.rootPath ?? ''`（REQ-RP-09：既有值回填，无值回填空）

### TASK-RP-05-E handleSaveAndConnect 透传 normalizeRootPath 结果

- [ ] 在 `src/ui/pages/ConnectionPage/ConnectionFormPanel/index.tsx` 的 `handleSaveAndConnect`（L206-259）`profilesStore.save` 调用（L215-225）前，对 `form.rootPath` 执行 `normalizeRootPath`：`ok === true` → `rootPath: result.value`；`ok === false` → `rootPath: undefined`（含 empty/invalid_type/parent_ref，parent_ref 已被 validateForm 拦截，此处防御性兜底）
- [ ] 将计算后的 rootPath 传入 `profilesStore.save({ ..., rootPath })`，由 TASK-RP-02-C save 落位
- [ ] 确认 `connectOptions`（L170-179）零变更，rootPath 不参与 SMB 物理连接（CON-RP-02）

**验证方式**：`npx tsc --noEmit` 对 `src/ui/pages/ConnectionPage/ConnectionFormPanel/index.tsx` 类型检查通过；手动验证表单渲染 rootPath 输入项、留空保存 unset、填入合法值保存落位、填入 `..` 拒绝提示。

---

## TASK-RP-06 集成验证与回归测试

> 业务功能：跨模块集成测试与兼容性回归，确保 rootPath 端到端生效且未配置时行为等价。
> 依赖：TASK-RP-01 ~ TASK-RP-05 全部完成。
> 覆盖需求：REQ-RP-02、REQ-RP-03、REQ-RP-04、REQ-RP-13、REQ-RP-17。

### TASK-RP-06-A TypeScript 全量编译验证

- [ ] 执行 `npx tsc --noEmit` 全量类型检查通过，无新增类型错误
- [ ] 确认所有变更文件（`rootPathNormalize.ts`、`smbProfilesStore.ts`、`browseContextStore.ts`、`BrowsePage/index.tsx`、`ConnectionFormPanel/index.tsx`）类型安全

### TASK-RP-06-B 集成测试：配置 rootPath 首次进入浏览页

- [ ] 验证场景：profile 配置 rootPath=`'AutoFileBackup'` → setActiveProfile → createEntry(rootPath) → currentPath=`'AutoFileBackup'` → listDirectory({ path: 'AutoFileBackup' }) 列出该子目录内容（REQ-RP-02、REQ-RP-03）
- [ ] 验证 listDirectory 调用次数=1（与未配置 rootPath 时一致，DFX 性能约束）

### TASK-RP-06-C 集成测试：rootPath 子目录不存在 fail-visible

- [ ] 验证场景：rootPath=`'NotExists'`，share 中无此目录 → enterDirectory → listDirectory 失败 → loadError 非空 → BrowsePage StatusBanner 呈现"目录加载失败"与重试入口，不显示 share 根内容冒充（REQ-RP-13）
- [ ] 确认既有 fail-visible 机制（enterDirectory catch → mapSmbError → loadError，BrowsePage L252-261 StatusBanner）零变更，rootPath 仅改变初始 path

### TASK-RP-06-D 集成测试：越界路径请求钳制

- [ ] 验证场景：profile rootPath=`'AutoFileBackup'`，调用 enterDirectory(profileId, 'OtherDir') → clampToLogicalRoot 钳制为 `'AutoFileBackup'` → listDirectory({ path: 'AutoFileBackup' })（CON-RP-03、REQ-RP-06 防御层 1）
- [ ] 验证 buildSegments 对越界 currentPath 仅显示根段（防御层 2）

### TASK-RP-06-E 集成测试：切换 profile 复用上下文

- [ ] 验证场景：profile A（rootPath=`'AutoFileBackup'`）浏览至 `'AutoFileBackup\\sub'` → 切换到 profile B → 切回 A → currentPath 仍为 `'AutoFileBackup\\sub'`，不重置为 `'AutoFileBackup'`（REQ-RP-04）
- [ ] 验证编辑 profile 改了 rootPath 后切回，旧上下文 currentPath 越出新 rootPath 时 clampToLogicalRoot 钳制到新 rootPath（R-RP-02 缓解）

### TASK-RP-06-F 兼容性回归测试

- [ ] 新建验证脚本 `verify-rp-identity.mjs`，覆盖 `isSameProfileIdentity` 对仅 rootPath 不同的两 profile 返回 true（CON-RP-01，rootPath 不参与身份判定），结果输出到 `rp-identity-result.json`
- [ ] 回归场景：旧 profile（无 rootPath 字段）加载成功 → rootPath=undefined → 首次进入浏览页 currentPath=`'/'` 列 share 根 → 面包屑根段 path=`''` + 子段全量拆分 → 与基线逐一致（REQ-RP-15、REQ-RP-17）
- [ ] 回归场景：未配置 rootPath 的 profile 切换复用上下文、向上导航至 share 根行为与基线一致（REQ-RP-07、REQ-RP-17）
- [ ] 全部断言通过且 JSON 结果标记 PASS

**验证方式**：`node verify-rp-identity.mjs` → 检查 `rp-identity-result.json` PASS；`npx tsc --noEmit` 全量通过；集成场景手动或脚本验证。

---

## TASK-RP-07 硬约束遵守验证

> 业务功能：验证 HC-01/HC-02/HC-05 与 CON-RP-01/02/03 硬约束零违反。
> 依赖：TASK-RP-01 ~ TASK-RP-05 全部完成。
> 覆盖需求：HC-01、HC-02、HC-05、CON-RP-01、CON-RP-02、CON-RP-03。

### TASK-RP-07-A HC-01 零新增 npm 依赖验证

- [ ] 执行 `git diff package.json package-lock.json` 确认 diff 为空（零新增依赖）
- [ ] 确认 `src/utils/rootPathNormalize.ts` 无 import 新包，仅用 TypeScript 内置字符串操作

### TASK-RP-07-B HC-02 冻结区零变更验证

- [ ] 执行 `git diff src/adapter/smb/SmbPlugin.ts` 确认 diff 为空
- [ ] 执行 `git diff src/core/` 确认 diff 为空
- [ ] 执行 `git diff android/` 确认 diff 为空
- [ ] 确认 rootPath 拼接仅在 `browseContextStore.ts` 应用层完成，透传给既有 `listDirectory({ path })`

### TASK-RP-07-C HC-05 既有持久化兼容验证

- [ ] 确认 `STORAGE_VERSION` 保持 `1`（`src/state/smbProfilesStore.ts` L24）
- [ ] 确认 rootPath 为可选字段，旧数据缺失=unset 回退现状（TASK-RP-02-D 测试覆盖）
- [ ] 验证保存含 rootPath 的 profile → 持久化 JSON `version` 字段仍为 1（REQ-RP-16）

### TASK-RP-07-D CON-RP-01/02/03 设计约束验证

- [ ] CON-RP-01：确认 `isSameProfileIdentity` 零变更，rootPath 不参与身份判定（TASK-RP-06-F 测试覆盖）
- [ ] CON-RP-02：确认 `connectOptions`（ConnectionFormPanel L170-179）零变更，rootPath 不参与 SMB 物理连接
- [ ] CON-RP-03：确认 enterDirectory 入口 clampToLogicalRoot + buildSegments 显示截断双层防御（TASK-RP-06-D 测试覆盖）

**验证方式**：`git diff` 冻结区路径为空；`git diff package.json` 为空；`STORAGE_VERSION` grep 确认仍为 1。

---

## TASK-RP-08 评审与最终验证

> 业务功能：代码审查、设计回顾、变更范围最终确认，确保交付质量。
> 依赖：TASK-RP-01 ~ TASK-RP-07 全部完成。
> 覆盖需求：全量交付质量 gate。

### TASK-RP-08-A 代码审查

- [ ] 审查 `src/utils/rootPathNormalize.ts`：纯函数、判别联合、无副作用、S1-S7 步骤顺序正确
- [ ] 审查 `src/state/smbProfilesStore.ts`：sanitize rootPath 分支与 domain/passwordEmpty 同风格（白名单、严格校验），save rootPath 落位仅透传非空值
- [ ] 审查 `src/state/browseContextStore.ts`：resolveInitialPath/clampToLogicalRoot 纯函数、createEntry/setActiveProfile/enterDirectory rootPath 感知正确、无循环依赖
- [ ] 审查 `src/ui/pages/BrowsePage/index.tsx`：buildSegments rootPath 参数回退现状逻辑正确、越界截断防御
- [ ] 审查 `src/ui/pages/ConnectionPage/ConnectionFormPanel/index.tsx`：rootPath 输入项选填、回填、`..` 拒绝、normalizeRootPath 透传

### TASK-RP-08-B 设计回顾

- [ ] 核对 design.md 2.8 实现变更清单与实际变更文件一致（5 个文件变更 + 1 个文件新建，冻结区 3 个零变更）
- [ ] 核对 design.md 2.2.2 接口清单签名与实现一致（normalizeRootPath/resolveInitialPath/clampToLogicalRoot/buildSegments/SmbProfile.rootPath/SmbProfileInput.rootPath）
- [ ] 核对 design.md 2.4 路径规范化规则 S1-S7 与 normalizeRootPath 实现一致
- [ ] 核对 design.md 2.5 兼容性设计：旧数据零迁移、未配置行为等价、字段清洗兼容三类场景覆盖

### TASK-RP-08-C 变更范围最终确认

- [ ] 确认变更文件清单：`src/utils/rootPathNormalize.ts`（新增）、`src/state/smbProfilesStore.ts`（扩展）、`src/state/browseContextStore.ts`（扩展）、`src/ui/pages/BrowsePage/index.tsx`（扩展）、`src/ui/pages/ConnectionPage/ConnectionFormPanel/index.tsx`（扩展）
- [ ] 确认冻结区零变更：`src/adapter/smb/SmbPlugin.ts`、`src/core/**`、`android/**`
- [ ] 确认验证脚本清单：`verify-rp-normalize.mjs`、`verify-rp-sanitize.mjs`、`verify-rp-initial-path.mjs`、`verify-rp-clamp.mjs`、`verify-rp-segments.mjs`、`verify-rp-identity.mjs` 及对应 JSON 结果文件
- [ ] 确认全部 18 个 REQ-RP-xx 需求均有任务覆盖与验证追溯

**验证方式**：全部验证脚本 PASS；`npx tsc --noEmit` 全量通过；`git diff` 冻结区与 package.json 为空；需求覆盖矩阵完整。

---

## 需求覆盖追溯矩阵

| 需求 | 覆盖任务 | 验证脚本 |
|------|----------|----------|
| REQ-RP-01 字段可选性 | TASK-RP-02-A、TASK-RP-03-A | verify-rp-sanitize.mjs |
| REQ-RP-02 字段语义 | TASK-RP-02-A、TASK-RP-03-B、TASK-RP-06-B | verify-rp-sanitize.mjs |
| REQ-RP-03 初始路径 | TASK-RP-03-A、TASK-RP-03-C、TASK-RP-03-D、TASK-RP-06-B | verify-rp-initial-path.mjs |
| REQ-RP-04 切换复用上下文 | TASK-RP-03-D、TASK-RP-06-E | — |
| REQ-RP-05 面包屑根段 | TASK-RP-04-A、TASK-RP-04-B | verify-rp-segments.mjs |
| REQ-RP-06 向上越界禁止 | TASK-RP-03-B、TASK-RP-03-E、TASK-RP-04-A、TASK-RP-06-D | verify-rp-clamp.mjs、verify-rp-segments.mjs |
| REQ-RP-07 未配置时面包屑不变 | TASK-RP-04-A、TASK-RP-06-F | verify-rp-segments.mjs |
| REQ-RP-08 表单字段 | TASK-RP-05-A、TASK-RP-05-B | — |
| REQ-RP-09 编辑回填 | TASK-RP-05-D | — |
| REQ-RP-10 输入规范化 | TASK-RP-01-A | verify-rp-normalize.mjs |
| REQ-RP-11 越界片段拒绝 | TASK-RP-01-A、TASK-RP-05-C | verify-rp-normalize.mjs |
| REQ-RP-12 多级路径允许 | TASK-RP-01-A | verify-rp-normalize.mjs |
| REQ-RP-13 子目录不存在 | TASK-RP-06-C | — |
| REQ-RP-14 持久化清洗 | TASK-RP-02-B | verify-rp-sanitize.mjs |
| REQ-RP-15 旧数据零迁移 | TASK-RP-02-B、TASK-RP-07-C、TASK-RP-06-F | verify-rp-sanitize.mjs |
| REQ-RP-16 版本号不变 | TASK-RP-02-A、TASK-RP-07-C | — |
| REQ-RP-17 未配置行为等价 | TASK-RP-06-F | verify-rp-identity.mjs |
| REQ-RP-18 非法值容错 | TASK-RP-02-B | verify-rp-sanitize.mjs |

---

> 本文档为编码任务规划，不含代码实现。实现由下游编码 agent 按 TASK-RP-01 ~ TASK-RP-08 顺序执行。
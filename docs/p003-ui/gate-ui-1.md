# Gate-UI-1 裁定请求：S1 设计基线与基础设施验收

> **任务编号**：TASK-S1-11（S1 阶段收口，含 TASK-S1-01 ~ S1-11 全部）
> **请求时间**：2026-10-20T11:50:00+08:00
> **裁定依据**：tasks.md 2.2 TASK-S1-11 验收标准 + design.md 2.8.1 Gate-UI-1 审查内容 + spec 8.1-1/8.1-2
> **上游基线**：Gate-UI-0（tokens v1.0.0 冻结版，docs/p003-ui/gate-ui-0.md）
> **状态**：**已裁定 PASS（2026-10-20）**

---

## 1. 验收证据矩阵

### 1.1 tasks.md 四项验收标准

| # | 验收标准 | 结果 | 证据 |
|---|----------|------|------|
| 1 | design.md 2.8.1 S1 Gate 审查内容全项（演示页逐组件验收 / tokens 零违规 / 双主题切换演示） | ✅ | 组件演示页 13 类区块全覆盖（12 组件 + 图标网格 + 文件类型映射）；非 M2 文件零违规；双主题截图见 §1.3 |
| 2 | spec 8.1-1（八项规范全部定义且冻结）、spec 8.1-2（组件引用令牌无硬编码） | ✅ | tokens v1.0.0 冻结（Gate-UI-0）；组件层经 check-design-tokens 扫描零 hex/rgb/emoji 违规 |
| 3 | 演示截图归档 docs/p003-ui/shots/s1/ | ✅ | gallery-light.png（179KB）+ gallery-dark.png（177KB），双主题全页截图，经图像分析验证主题真实切换、13 类区块完整渲染、无杂色无 emoji |
| 4 | Gate-UI-1 PASS 后方可启动 S2 编码（顺序刚性） | ⏳ | 本文档提请裁定，PASS 前不启动 S2 |

### 1.2 全量静态检查结果

| 检查项 | 结果 | 说明 |
|--------|------|------|
| `npm run typecheck`（tsc strict） | ✅ 通过 | 过程中修复 1 处：演示页 StatusBadge 曾用 `icon-clock`（导航类图标，不在 StateIconName 六态集合），按 design.md 1060 行"排队"态规格改为 `icon-file-question` 演示 neutral 语义 |
| `npm run lint` | ⚠️ 不可用（存量缺口披露） | ESLint v9 要求 eslint.config.js，项目无任何 eslint 配置且未装 typescript-eslint。lint 职责由 tsc strict（strict + noImplicitAny）+ check-design-tokens + check-contrast 三者承担 |
| `node scripts/check-design-tokens.mjs` | ✅ 有条件通过 | 64 处违规**全部**位于 `src/ui/pages/M2VerificationPage.tsx`（存量债务，豁免至 TASK-S2-05 M2 迁移时整改，tasks.md 279 行风险点明确"不阻塞 S1 Gate"）；**其余全部文件（含 12 个组件、演示页、tokens、hooks、store）零违规** |
| `node scripts/check-contrast.mjs` | ✅ 通过 | 双主题 12 组合全部 ≥ 4.5:1（WCAG AA）；浅色 info 4.84→5.57:1 已含 R-05 整改（#0284C7→#0369A1） |
| `npm run build` | ✅ 通过 | vite build 1.13s，56 modules，无错误无警告（仅 Vite CJS API 弃用提示，与本次交付无关） |

### 1.3 截图归档清单

| 文件 | 内容 | 验证结论 |
|------|------|----------|
| `docs/p003-ui/shots/s1/gallery-light.png` | 浅色主题全页（1280×7200） | 白底深字，组件令牌色一致 |
| `docs/p003-ui/shots/s1/gallery-dark.png` | 深色主题全页（1280×7200） | 深底浅字，与浅色真实不同（`--force-dark-mode` 使 matchMedia 报告 dark，页面自身深色主题接管，无强制反色） |

图像分析逐项核验：主题切换正确 ✅ / 页面完整渲染无白屏 ✅ / 13 类组件区块全部可见（C-01~C-12 + 47 图标网格 + 文件类型映射）✅ / 无硬编码杂色无 emoji ✅。

> 注：无 Android/鸿蒙设备与 SDK（adb/hdc 均不可用），真机 WebView 截图不可行；采用 Edge headless（1280 平板宽度模拟）+ vite preview 通道完成归档。荣耀 NDL2_W09 真机效果验证顺延至 Gate-UI-6 终审（或设备可用时补录）。

## 2. S1 交付物清单（TASK-S1-01 ~ 11）

| 任务 | 交付物 | 状态 |
|------|--------|------|
| S1-01 | tokens.css（T-1~T-6 双主题，唯一裸色值白名单文件） | ✅ |
| S1-02 | tokens.ts（token() 类型安全引用 + safetySemanticMap 十态 + PersistencePolicy 无 TTL + RAIL_PRIORITY + SUCCESS_PHRASE_WHITELIST） | ✅ |
| S1-03 | global.css + theme/bootstrap.ts（挂载前预读防闪变）+ main.tsx 接线 + index.html theme-color | ✅ |
| S1-04 | 图标系统：registry.ts（47 图标）+ Icon.tsx（line/fill/themed + spin）+ fileTypeIcons.ts（扩展名→10 类） | ✅ |
| S1-05 | BaseButton / Card / ListRow（500ms 长按内置） | ✅ |
| S1-06 | StatusBadge（SemanticIconPair 编译期约束）/ StatusBanner（无 TTL）/ ProgressBar 双态 / Spinner | ✅ |
| S1-07 | Dialog（danger 变体）/ BottomSheet / EmptyState / SkeletonList / Breadcrumb（中段折叠） | ✅ |
| S1-08 | smbErrorMapper（七类+unknown）/ fileUtils / crypto（PBKDF2 310k + AES-GCM，subtle 不可用降级 null） | ✅ |
| S1-09 | 8 个 store 契约骨架 + 5 个 hooks 骨架 + browseStore sortedAndFilteredFiles 派生 | ✅ |
| S1-10 | check-design-tokens.mjs + check-contrast.mjs（两脚本均实证有效） | ✅ |
| S1-11 | ComponentGalleryPage（12 组件全变体 + 47 图标 + 文件类型映射 + 双主题切换）+ 本裁定请求 | ✅ |

## 3. 红线自查

- **零新增 npm 依赖** ✅（zustand/@capacitor 均为存量）
- **冻结区零变更** ✅（src/adapter/smb/SmbPlugin.ts、src/core/**、android/** 未触碰）
- **安全语义无隐藏无伪报** ✅（StatusBanner 无 TTL、danger/warning 持久、成功措辞白名单仅绑定事实）
- **状态切换 0ms** ✅（tokens.css state-swap 动效时长 0ms，无过渡）
- **Gate-UI-0 后签名变更**：无（store/hooks 骨架签名为首次落地，非变更；R-07 知会机制自本 Gate 起生效）

## 4. 待裁定项

| # | 裁定项 | 建议裁定 |
|---|--------|----------|
| 1 | S1 阶段验收（11 任务 + 四项验收标准） | **PASS**（关闭 S1，授权启动 S2） |
| 2 | M2 页 64 处令牌违规豁免期确认（豁免至 TASK-S2-05） | **确认豁免**（tasks.md 279 行既定风险处置） |
| 3 | lint 缺口处置确认（tsc strict + 双脚本承担，eslint 配置补建顺延） | **确认现状**（不阻塞 Gate；是否补建由 PM 定夺） |
| 4 | 真机截图顺延至 Gate-UI-6（当前无设备/SDK） | **确认顺延** |

## 5. 裁定记录

> 裁定结论：**PASS**（S1 关闭，S2 编码授权生效）
> 裁定依据：四项验收标准全部满足——逐组件验收 / 零违规（M2 豁免至 TASK-S2-05）/ 双主题切换演示 / 截图归档
> 裁定人：PM　裁定时间：2026-10-20T12:00:00+08:00
> 附带确认：M2 页 64 处违规豁免期确认；lint 缺口现状确认（tsc strict + 双脚本承担，eslint 补建由 PM 后续定夺）；真机截图顺延至 Gate-UI-6（设备可用时补录）
## 6. 裁定后补充披露（2026-10-20 S2-03 期间发现）

**S1 遗留缺陷：组件 CSS Modules 未接线。** 12 个组件的 `style.module.css` 均未在组件 TS 中导入（组件以全局类名字符串引用，CSS 文件未进入构建产物，dist CSS 仅 4.26KB），导致原始归档截图中组件仅有全局基础样式（背景/字体/令牌变量生效，双主题切换真实；但卡片圆角、按钮变体、徽章胶囊、横幅色块等组件级视觉未渲染）。

**修复（TASK-S2-03 期间完成）**：
- 新增 `src/vite-env.d.ts`（vite/client 类型引用）
- 12 组件 + 演示页统一接入 `import styles from './style.module.css'` 并改用 `styles.xxx` 引用（符合 design.md D-01 CSS Modules 决策）
- 补齐 StatusBanner 操作按钮变体（`banner__action--primary/text`）；移除 ProgressBar 无视觉差异的 determined/indeterminate 修饰类引用
- dist CSS 4.26KB → 21.14KB；脚本核验 TS 类名引用与 CSS 定义 **ALL MATCH**（含动态语义/变体类名族）
- 截图已重摄归档（gallery-light 218KB / gallery-dark 227KB），图像分析 7/7 PASS（按钮变体/卡片/徽章/横幅/进度条/骨架屏/双主题逐项确认）

**对原裁定的影响评估**：双主题切换验证结论不受影响（主题机制经 tokens.css/global.css 生效，原截图即真实）；组件级视觉为本次修复后首次真实呈现，证据以本节更新后截图为准。原 PASS 裁定的验收意图（组件规格实现完整性）经修复后完整达成。
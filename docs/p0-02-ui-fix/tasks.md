# P0-02 UI-FIX 编码任务清单 — 另存为处理正式 UI 接入

> 本文档将 `docs/p0-02-ui-fix/design.md` 中的实现方案分解为可执行、可验收的编码任务。
> 任务依赖链：模块 A（接口声明）→ 模块 B（状态管理）→ 模块 C（事件处理）→ 模块 D（UI 组件）→ 日志导出扩展 → 编译验证。
> 修改范围约束：仅修改 `src/adapter/smb/SmbPlugin.ts` 和 `src/ui/pages/M2VerificationPage.tsx` 两个文件，不修改 Java 端、测试脚本、测试报告。

---

## 1. SmbPlugin.ts 接口扩展（模块 A：类型依赖基础）

**写作指导**：本任务组为后续所有任务提供 TypeScript 类型基础，必须最先完成。所有新增字段均为可选字段（`?:`），保证现有 `checkLocalFileChanged()` 调用向后兼容。

### 1.1 扩展 FileChangeResult 接口，追加另存为相关三个可选字段

- [ ] 在 `src/adapter/smb/SmbPlugin.ts` 第 51-61 行的 `FileChangeResult` 接口内，追加三个可选字段 `saveAsDiscovered?: boolean`、`saveAsFilePath?: string`、`saveAsPrompt?: string`，使 `foregroundCheck()` 返回值可携带另存为检测结果。修改后接口如下：
  ```typescript
  export interface FileChangeResult {
    changed: boolean;
    currentMtime: number;
    baselineMtime: number;
    newHash?: string;
    baselineHash?: string;
    contentChanged?: boolean;
    observerDetectedChange?: boolean;
    observerEventLog?: string;
    error?: string;
    // 新增：另存为检测相关字段（foregroundCheck 返回）
    saveAsDiscovered?: boolean;
    saveAsFilePath?: string;
    saveAsPrompt?: string;
  }
  ```
- **验证方式**：现有 `checkLocalFileChanged()` 调用（`M2VerificationPage.tsx:131`）不返回这三个字段，TypeScript 编译通过；`changeResult` state 类型仍为 `FileChangeResult | null`，无类型错误。
- **依赖关系**：无前置依赖。

### 1.2 新增 SaveAsResolveOptions 接口

- [ ] 在 `src/adapter/smb/SmbPlugin.ts` 中 `FileChangeResult` 接口之后（约第 62 行位置）新增 `SaveAsResolveOptions` 接口，定义 `choice` 字段为字符串字面量联合类型（不使用 TypeScript enum，与现有代码风格一致）。代码如下：
  ```typescript
  export interface SaveAsResolveOptions {
    choice: 'OVERWRITE_ORIGINAL' | 'WRITE_AS_NEW' | 'DISCARD';
  }
  ```
- **验证方式**：TypeScript 编译通过；`SaveAsResolveOptions` 可被 `resolveSaveAs` 方法签名引用。
- **依赖关系**：无前置依赖。

### 1.3 新增 SaveAsResolveResult 接口

- [ ] 在 `src/adapter/smb/SmbPlugin.ts` 中 `SaveAsResolveOptions` 接口之后新增 `SaveAsResolveResult` 接口，包含回写成功标志、SHA-256 双哈希（可选）、远端 mtime 处理前后值、回传 choice 和错误信息。代码如下：
  ```typescript
  export interface SaveAsResolveResult {
    writebackSuccess: boolean;
    localHash?: string;
    verifyHash?: string;
    remoteMtimeBefore: number;
    remoteMtimeAfter: number;
    choice: 'OVERWRITE_ORIGINAL' | 'WRITE_AS_NEW' | 'DISCARD';
    error?: string;
  }
  ```
- **验证方式**：TypeScript 编译通过；`SaveAsResolveResult` 可被 `resolveSaveAs` 方法签名引用；`localHash` / `verifyHash` 设为可选以兼容 DISCARD 分支（DISCARD 时不涉及哈希）。
- **依赖关系**：无前置依赖。

### 1.4 SmbPluginInterface 追加 resolveSaveAs 方法签名

- [ ] 在 `src/adapter/smb/SmbPlugin.ts` 第 96-113 行的 `SmbPluginInterface` 接口内，于 `foregroundCheck()` 声明（第 103 行）之后追加 `resolveSaveAs` 方法签名，方法名与 Java 端 `WpsDeliveryHandler.resolveSaveAs` 的 `@CapacitorMethod` name 严格对齐（camelCase）。追加行如下：
  ```typescript
  resolveSaveAs(options: SaveAsResolveOptions): Promise<SaveAsResolveResult>;
  ```
- **验证方式**：`SmbPlugin.resolveSaveAs({choice: 'OVERWRITE_ORIGINAL'})` 调用在 TypeScript 层通过类型检查；现有 11 个方法签名不变；`registerPlugin<SmbPluginInterface>('SmbPlugin')` 注册调用不变。
- **依赖关系**：依赖 1.2（`SaveAsResolveOptions`）和 1.3（`SaveAsResolveResult`）。

---

## 2. M2VerificationPage.tsx 状态管理新增（模块 B：数据驱动基础）

**写作指导**：本任务组为模块 C（事件处理）和模块 D（UI 组件）提供 React state 数据基础。新增 state 采用与现有 state 相同的 `useState` 声明模式，命名空间与现有 state 无冲突。

### 2.1 新增 4 个 useState 状态变量

- [ ] 在 `src/ui/pages/M2VerificationPage.tsx` 第 44 行（`remoteChangeResult` state 之后）追加 4 个 `useState` 声明，分别存储另存为检测结果、另存为处理结果、检测 loading 标志、处理 loading 标志。追加代码如下：
  ```typescript
  const [saveAsResult, setSaveAsResult] = useState<FileChangeResult | null>(null);
  const [resolveAsResult, setResolveAsResult] = useState<SaveAsResolveResult | null>(null);
  const [saveAsChecking, setSaveAsChecking] = useState(false);
  const [resolveAsLoading, setResolveAsLoading] = useState(false);
  ```
- [ ] 在 `src/ui/pages/M2VerificationPage.tsx` 第 2-8 行的 import 语句中追加 `SaveAsResolveResult` 类型导入（`SaveAsResolveOptions` 不需要直接导入，因为 `handleResolveSaveAs` 入参使用字符串字面量联合类型）。修改后 import 如下：
  ```typescript
  import SmbPlugin, {
    SmbFileEntry,
    WpsOpenResult,
    FileChangeResult,
    WritebackResult,
    RemoteChangeResult,
    SaveAsResolveResult,
  } from '../../adapter/smb/SmbPlugin';
  ```
- **验证方式**：TypeScript 编译通过；4 个 state 初始值分别为 `null` / `null` / `false` / `false`；组件首次渲染时 `saveAsResult` / `resolveAsResult` 为 null，对应 UI 子区块不渲染。
- **依赖关系**：依赖 1.1（`FileChangeResult` 扩展字段）和 1.3（`SaveAsResolveResult` 接口）。

---

## 3. M2VerificationPage.tsx 事件处理新增（模块 C：行为依赖）

**写作指导**：本任务组新增两个 `useCallback` handler，复用现有 `handleWriteback` / `handleCheckChange` 的 try/catch + addLog + updateStep 三段式异常处理模式。

### 3.1 新增 handleForegroundCheck useCallback handler

- [ ] 在 `src/ui/pages/M2VerificationPage.tsx` 第 148 行（`handleCheckChange` 之后）追加 `handleForegroundCheck` handler，调用 `SmbPlugin.foregroundCheck()`，更新 `saveAsResult` / `saveAsChecking`，记录日志，按 `saveAsDiscovered` 更新 V3 门禁。`saveAsDiscovered` 为 undefined/null 时视为 false（走安全回退路径）。代码如下：
  ```typescript
  const handleForegroundCheck = useCallback(async () => {
    addLog('执行另存为检测 foregroundCheck()...');
    setSaveAsChecking(true);
    try {
      const result = await SmbPlugin.foregroundCheck();
      setSaveAsResult(result);
      if (result.saveAsDiscovered) {
        updateStep('V3', 'pass', `另存为已识别: ${result.saveAsFilePath}`);
        addLog(`✅ 发现另存为候选文件: ${result.saveAsFilePath}`);
        addLog(`提示: ${result.saveAsPrompt}`);
      } else {
        addLog(`未发现另存为候选文件 (安全回退)`);
        if (result.saveAsPrompt) {
          addLog(`提示: ${result.saveAsPrompt}`);
        }
      }
    } catch (e: any) {
      addLog(`另存为检测失败: ${e.message || e}`);
    } finally {
      setSaveAsChecking(false);
    }
  }, []);
  ```
- **验证方式**：点击"另存为检测"按钮后，操作日志区新增"执行另存为检测 foregroundCheck()..."记录；`saveAsChecking` 在调用期间为 true（按钮显示"检测中..."），完成后恢复 false；`saveAsResult` 更新为 foregroundCheck 返回值；发现候选时 V3 门禁更新为 pass。
- **依赖关系**：依赖 2.1（`saveAsResult` / `saveAsChecking` state）。

### 3.2 新增 handleResolveSaveAs useCallback handler

- [ ] 在 `src/ui/pages/M2VerificationPage.tsx` 第 169 行（`handleWriteback` 之后）追加 `handleResolveSaveAs` handler，接收 `choice` 入参，调用 `SmbPlugin.resolveSaveAs({choice})`，更新 `resolveAsResult` / `resolveAsLoading`，记录日志，按 `writebackSuccess && localHash===verifyHash && choice!=='DISCARD'` 更新 V4 门禁。代码如下：
  ```typescript
  const handleResolveSaveAs = useCallback(async (
    choice: 'OVERWRITE_ORIGINAL' | 'WRITE_AS_NEW' | 'DISCARD'
  ) => {
    addLog(`执行另存为处理 resolveSaveAs({choice: '${choice}'})...`);
    setResolveAsLoading(true);
    if (choice === 'OVERWRITE_ORIGINAL' || choice === 'WRITE_AS_NEW') {
      updateStep('V4', 'running');
    }
    try {
      const result = await SmbPlugin.resolveSaveAs({ choice });
      setResolveAsResult(result);
      addLog(`处理结果: success=${result.writebackSuccess}, choice=${result.choice}`);
      if (choice === 'DISCARD') {
        if (result.writebackSuccess) {
          addLog(`✅ 已放弃关联, 远端原文件 mtime: ${result.remoteMtimeBefore} → ${result.remoteMtimeAfter} (一致)`);
        } else {
          addLog(`❌ 放弃关联失败: ${result.error || '未知错误'}`);
        }
      } else {
        if (result.writebackSuccess && result.localHash && result.verifyHash && result.localHash === result.verifyHash) {
          updateStep('V4', 'pass', `本地SHA-256=${result.localHash?.substring(0, 16)}..., 远程校验SHA-256=${result.verifyHash?.substring(0, 16)}...`);
          addLog(`✅ 回写成功! SHA-256 校验通过`);
          addLog(`本地: ${result.localHash}`);
          addLog(`远程: ${result.verifyHash}`);
        } else {
          updateStep('V4', 'fail', `SHA-256 不匹配或回写失败: 本地=${result.localHash?.substring(0, 16)}..., 远程=${result.verifyHash?.substring(0, 16)}...`);
          addLog(`❌ 回写失败! SHA-256 不匹配或回写失败`);
          if (result.localHash) addLog(`本地: ${result.localHash}`);
          if (result.verifyHash) addLog(`远程: ${result.verifyHash}`);
          if (result.error) addLog(`错误: ${result.error}`);
        }
      }
    } catch (e: any) {
      addLog(`另存为处理失败: ${e.message || e}`);
      if (choice !== 'DISCARD') {
        updateStep('V4', 'fail', e.message || String(e));
      }
    } finally {
      setResolveAsLoading(false);
    }
  }, []);
  ```
- **验证方式**：点击三选项按钮后，操作日志区新增"执行另存为处理 resolveSaveAs({choice: 'XXX'})..."记录；`resolveAsLoading` 在调用期间为 true（三选项按钮 disabled），完成后恢复 false；`resolveAsResult` 更新为 resolveSaveAs 返回值；覆盖/回写新文件成功且哈希一致时 V4 门禁更新为 pass；DISCARD 时不更新 V4 门禁为 pass。
- **依赖关系**：依赖 1.4（`resolveSaveAs` 方法声明）和 2.1（`resolveAsResult` / `resolveAsLoading` state）。

---

## 4. M2VerificationPage.tsx UI 组件新增（模块 D：用户交互界面）

**写作指导**：本任务组在现有"WPS 编辑回写验证区"（`openResult` 守卫的 div，第 387-440 行）内部追加另存为相关 UI 子区块，复用现有 `btnStyle` / inline 样式 / `addLog` / `updateStep` 模式。所有新增 UI 子区块采用与现有 `changeResult` / `writebackResult` 展示区相同的 inline 样式（`marginTop: 12, padding: 8, background, borderRadius: 4, fontSize: 13`）。

### 4.1 新增"另存为检测"按钮

- [ ] 在 `src/ui/pages/M2VerificationPage.tsx` 第 403 行（现有 4 个按钮所在的 `<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>` 内，"清理"按钮之后）追加"另存为检测"按钮，使用 `btnStyle('#1976d2')`（蓝色，与"连接"按钮配色一致，表示主动检测操作），`disabled` 绑定 `saveAsChecking`，loading 时显示"检测中..."。追加代码如下：
  ```tsx
  <button onClick={handleForegroundCheck} disabled={saveAsChecking} style={btnStyle('#1976d2')}>
    {saveAsChecking ? '检测中...' : '另存为检测'}
  </button>
  ```
- **验证方式**：WPS 打开文件成功后（`openResult` 存在），"WPS 编辑回写验证区"内显示"另存为检测"按钮；按钮可点击；点击后按钮文案变为"检测中..."且 disabled；检测完成后恢复。
- **依赖关系**：依赖 3.1（`handleForegroundCheck`）和 2.1（`saveAsChecking` state）。

### 4.2 新增候选文件提示区和安全回退提示区

- [ ] 在 `src/ui/pages/M2VerificationPage.tsx` 第 405 行（4 个按钮所在的 div 之后，`changeResult` 展示区之前）追加候选文件提示区和安全回退提示区，根据 `saveAsResult` 状态分支渲染。`saveAsResult.saveAsDiscovered===true` 时展示候选文件提示区（含 `saveAsFilePath` 和 `saveAsPrompt`）；`saveAsResult` 存在且 `saveAsDiscovered!==true` 时展示安全回退提示区（含 `saveAsPrompt` 和本地缓存 SHA-256 `openResult.baselineHash`）。追加代码如下：
  ```tsx
  {saveAsResult && saveAsResult.saveAsDiscovered && (
    <div style={{ marginTop: 12, padding: 8, background: '#fff3e0', borderRadius: 4, fontSize: 13 }}>
      <strong>⚠️ 另存为候选文件已发现:</strong>
      <div style={{ marginTop: 4 }}>候选文件路径: <code style={{ fontSize: 11 }}>{saveAsResult.saveAsFilePath}</code></div>
      <div style={{ marginTop: 4 }}>{saveAsResult.saveAsPrompt}</div>
      <div style={{ marginTop: 4, color: '#666' }}>请选择下方操作:</div>
    </div>
  )}
  {saveAsResult && !saveAsResult.saveAsDiscovered && (
    <div style={{ marginTop: 12, padding: 8, background: '#e3f2fd', borderRadius: 4, fontSize: 13 }}>
      <strong>ℹ️ 另存为检测安全回退:</strong>
      <div style={{ marginTop: 4 }}>{saveAsResult.saveAsPrompt || '未自动发现另存为文件,请手动选择文件'}</div>
      <div style={{ marginTop: 4 }}>本地缓存 SHA-256 (原文件保护证据): <code style={{ fontSize: 11 }}>{openResult?.baselineHash}</code></div>
    </div>
  )}
  ```
- **验证方式**：`foregroundCheck` 返回 `saveAsDiscovered=true` 时，UI 展示橙色背景（`#fff3e0`）的候选文件提示区，含候选文件路径和提示文案；返回 `saveAsDiscovered=false` 或 undefined 时，UI 展示蓝色背景（`#e3f2fd`）的安全回退提示区，含本地缓存 SHA-256；`saveAsResult` 为 null 时两个提示区均不渲染。
- **依赖关系**：依赖 2.1（`saveAsResult` state）和 3.1（`handleForegroundCheck` 触发后才有 `saveAsResult`）。

### 4.3 新增三选项操作按钮（覆盖原文件/回写为新文件/放弃关联）

- [ ] 在 `src/ui/pages/M2VerificationPage.tsx` 第 405 行（候选文件提示区之后）追加三选项按钮组，仅当 `saveAsResult.saveAsDiscovered===true` 时渲染。三个按钮分别使用 `btnStyle('#f44336')`（红，警示）、`btnStyle('#4caf50')`（绿，安全）、`btnStyle('#666')`（灰，中性），与现有"断开连接/执行回写/清理"配色语义对齐。`disabled` 绑定 `resolveAsLoading`，loading 时三个按钮均 disabled。追加代码如下：
  ```tsx
  {saveAsResult && saveAsResult.saveAsDiscovered && (
    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button
        onClick={() => handleResolveSaveAs('OVERWRITE_ORIGINAL')}
        disabled={resolveAsLoading}
        style={btnStyle('#f44336')}
      >
        覆盖原文件
      </button>
      <button
        onClick={() => handleResolveSaveAs('WRITE_AS_NEW')}
        disabled={resolveAsLoading}
        style={btnStyle('#4caf50')}
      >
        回写为新文件
      </button>
      <button
        onClick={() => handleResolveSaveAs('DISCARD')}
        disabled={resolveAsLoading}
        style={btnStyle('#666')}
      >
        放弃关联
      </button>
    </div>
  )}
  ```
- **验证方式**：`saveAsResult.saveAsDiscovered===true` 时三选项按钮可见可点击；`saveAsResult.saveAsDiscovered!==true` 时三选项按钮不渲染；点击"覆盖原文件"触发 `handleResolveSaveAs('OVERWRITE_ORIGINAL')`；点击"回写为新文件"触发 `handleResolveSaveAs('WRITE_AS_NEW')`；点击"放弃关联"触发 `handleResolveSaveAs('DISCARD')`；`resolveAsLoading` 为 true 时三个按钮均 disabled。
- **依赖关系**：依赖 3.2（`handleResolveSaveAs`）、2.1（`saveAsResult` / `resolveAsLoading` state）和 4.2（候选文件提示区先展示）。

### 4.4 新增另存为回写结果展示区

- [ ] 在 `src/ui/pages/M2VerificationPage.tsx` 第 439 行（`remoteChangeResult` 展示区之后，WPS 编辑回写验证区 div 闭合标签之前）追加另存为回写结果展示区，根据 `resolveAsResult` 状态渲染。复用现有 `writebackResult` 展示区（第 427-433 行）的样式和结构，并追加哈希一致性显式标注和 DISCARD 分支处理。追加代码如下：
  ```tsx
  {resolveAsResult && (
    <div style={{
      marginTop: 12,
      padding: 8,
      background: resolveAsResult.choice === 'DISCARD'
        ? (resolveAsResult.writebackSuccess ? '#f5f5f5' : '#ffebee')
        : (resolveAsResult.writebackSuccess ? '#e8f5e9' : '#ffebee'),
      borderRadius: 4,
      fontSize: 13
    }}>
      <strong>另存为处理结果:</strong>{' '}
      {resolveAsResult.choice === 'DISCARD'
        ? (resolveAsResult.writebackSuccess ? '✅ 已放弃关联' : '❌ 放弃关联失败')
        : (resolveAsResult.writebackSuccess ? '✅ 成功' : '❌ 失败')}
      <div style={{ marginTop: 4 }}>决策: <code>{resolveAsResult.choice}</code></div>
      <div>远端 mtime: {resolveAsResult.remoteMtimeBefore} → {resolveAsResult.remoteMtimeAfter}
        {resolveAsResult.remoteMtimeBefore === resolveAsResult.remoteMtimeAfter
          ? ' (一致, 原文件未变)'
          : ' (已变更)'}
      </div>
      {resolveAsResult.localHash && (
        <div style={{ marginTop: 4 }}>本地 SHA-256: <code style={{ fontSize: 11 }}>{resolveAsResult.localHash}</code></div>
      )}
      {resolveAsResult.verifyHash && (
        <div>远程 SHA-256: <code style={{ fontSize: 11 }}>{resolveAsResult.verifyHash}</code></div>
      )}
      {resolveAsResult.localHash && resolveAsResult.verifyHash && (
        <div style={{ marginTop: 4 }}>
          哈希一致性:{' '}
          <strong style={{ color: resolveAsResult.localHash === resolveAsResult.verifyHash ? 'green' : 'red' }}>
            {resolveAsResult.localHash === resolveAsResult.verifyHash ? '✅ 一致' : '❌ 不一致'}
          </strong>
        </div>
      )}
      {resolveAsResult.error && (
        <div style={{ marginTop: 4, color: 'red' }}>错误: {resolveAsResult.error}</div>
      )}
    </div>
  )}
  ```
- **验证方式**：`resolveAsResult` 为 null 时不渲染；`resolveSaveAs` 返回后展示结果区，含决策选项、远端 mtime 处理前后值、本地/远程 SHA-256（完整 64 位）、哈希一致性标注；OVERWRITE_ORIGINAL/WRITE_AS_NEW 成功时背景为绿色（`#e8f5e9`），失败时背景为红色（`#ffebee`）；DISCARD 成功时背景为灰色（`#f5f5f5`），展示"已放弃关联"和 mtime 一致证据；哈希值完整展示不截断。
- **依赖关系**：依赖 3.2（`handleResolveSaveAs` 触发后才有 `resolveAsResult`）和 2.1（`resolveAsResult` state）。

---

## 5. M2VerificationPage.tsx 日志导出扩展

**写作指导**：本任务组在现有 `buildLogContent` 函数（第 208-247 行）的"详细结果"段末尾追加两个 `if` 守卫块，不修改现有四个 `if` 块（`openResult` / `changeResult` / `writebackResult` / `remoteChangeResult`）。

### 5.1 buildLogContent 追加 saveAsResult 导出条目

- [ ] 在 `src/ui/pages/M2VerificationPage.tsx` 第 242 行（`remoteChangeResult` 的 `if` 块之后，`error` 的 `if` 块之前）追加 `saveAsResult` 导出 `if` 守卫块，导出另存为检测结果（含 `saveAsDiscovered` / `saveAsFilePath` / `saveAsPrompt`）。追加代码如下：
  ```typescript
  if (saveAsResult) {
    lines.push(`另存为检测: saveAsDiscovered=${saveAsResult.saveAsDiscovered}`);
    lines.push(`  saveAsFilePath=${saveAsResult.saveAsFilePath || '(无)'}`);
    lines.push(`  saveAsPrompt=${saveAsResult.saveAsPrompt || '(无)'}`);
  }
  ```
- **验证方式**：执行"另存为检测"后点击"导出日志到共享"，导出的日志文件"=== 详细结果 ==="段含"另存为检测: saveAsDiscovered=..."条目，含候选文件路径和提示文案；未执行检测时该条目不出现。
- **依赖关系**：依赖 2.1（`saveAsResult` state）和 3.1（`handleForegroundCheck` 触发后才有 `saveAsResult`）。

### 5.2 buildLogContent 追加 resolveAsResult 导出条目

- [ ] 在 `src/ui/pages/M2VerificationPage.tsx` 第 242 行（`saveAsResult` 的 `if` 块之后）追加 `resolveAsResult` 导出 `if` 守卫块，导出另存为处理结果（含 `writebackSuccess` / `choice` / `localHash` / `verifyHash` / `remoteMtimeBefore` / `remoteMtimeAfter` / `error`）。追加代码如下：
  ```typescript
  if (resolveAsResult) {
    lines.push(`另存为处理: success=${resolveAsResult.writebackSuccess}, choice=${resolveAsResult.choice}`);
    lines.push(`  localHash=${resolveAsResult.localHash || '(无)'}`);
    lines.push(`  verifyHash=${resolveAsResult.verifyHash || '(无)'}`);
    lines.push(`  remoteMtimeBefore=${resolveAsResult.remoteMtimeBefore}, remoteMtimeAfter=${resolveAsResult.remoteMtimeAfter}`);
    if (resolveAsResult.error) {
      lines.push(`  error=${resolveAsResult.error}`);
    }
  }
  ```
- **验证方式**：执行三选项之一后点击"导出日志到共享"，导出的日志文件"=== 详细结果 ==="段含"另存为处理: success=..., choice=..."条目，含完整 localHash 和 verifyHash（64 位十六进制）；未执行处理时该条目不出现。
- **依赖关系**：依赖 2.1（`resolveAsResult` state）、3.2（`handleResolveSaveAs` 触发后才有 `resolveAsResult`）和 5.1（`saveAsResult` 导出块在前）。

---

## 6. 编译验证与最小差异审查

**写作指导**：本任务组确保代码修改后 TypeScript 编译通过、APK 构建成功、现有功能不回归，并产出最小差异审查记录，对应 spec.md AC-04 验收标准。

### 6.1 TypeScript 编译验证

- [ ] 在项目根目录执行 TypeScript 编译命令（`npx tsc --noEmit` 或 `npm run build`），验证 `src/adapter/smb/SmbPlugin.ts` 和 `src/ui/pages/M2VerificationPage.tsx` 修改后无类型错误。重点检查：
  - `FileChangeResult` 扩展字段为可选，现有 `checkLocalFileChanged()` 调用返回值通过类型检查
  - `SaveAsResolveResult` 的 `localHash` / `verifyHash` 为可选，`handleResolveSaveAs` 中访问时使用可选链或显式判断
  - `handleResolveSaveAs` 的 `choice` 入参类型与 `SaveAsResolveOptions.choice` 严格一致
  - import 语句追加 `SaveAsResolveResult` 后无未使用导入警告
- **验证方式**：`npx tsc --noEmit` 退出码为 0，无任何错误和警告输出。
- **依赖关系**：依赖 1.1-1.4、2.1、3.1、3.2、4.1-4.4、5.1、5.2 全部完成。

### 6.2 远程编译 APK

- [ ] 使用 Capacitor 构建流程重新编译 APK，验证 UI 代码修改后 APK 构建成功。构建命令序列：
  1. `npm run build`（构建 React 前端资源到 `dist/` 目录）
  2. `npx cap sync android`（同步 Web 资源到 Android 项目）
  3. `cd android && ./gradlew assembleDebug`（构建 Debug APK，或使用 `assembleRelease` 构建 Release APK）
- [ ] 验证新 APK 可在安卓平板安装启动，`M2VerificationPage` 页面正常渲染，现有 SMB 连接、文件浏览、WPS 打开、检查本地变更、执行回写、检查远程变更、清理、日志导出等全部功能不回归。
- **验证方式**：Gradle 构建退出码为 0，产出 `android/app/build/outputs/apk/debug/app-debug.apk`（或 release APK）；APK 安装后启动 PAD2，进入 M2 验证页面，现有 6 个场景测试 6/6 ALL PASSED（对应 spec.md 8.3 节"重新编译 APK"约束）。
- **依赖关系**：依赖 6.1（TypeScript 编译通过）。

### 6.3 最小差异审查

- [ ] 对代码修改进行最小差异审查，确认修改范围仅限 `src/adapter/smb/SmbPlugin.ts` 和 `src/ui/pages/M2VerificationPage.tsx` 两个文件，未修改 Java 端、测试脚本、测试报告、R3-FIX 文档。审查清单（对应 design.md 3.2 节）：
  - 文件范围：`git diff --name-only` 输出仅含两个目标文件
  - 现有功能不回归：现有 handler（`handleConnect` / `handleListDir` / `handleOpenInWps` / `handleCheckChange` / `handleWriteback` / `handleCheckRemote` / `handleCleanup` / `handleExportLog`）逻辑不变
  - 现有证据保留：`docs/p0-02-r3/test-report.md` 等现有测试报告内容不变
  - 接口向后兼容：`FileChangeResult` 新增字段均为可选（`?:`）
  - 现有调用不破坏：`checkLocalFileChanged` 调用仍通过编译
  - UI 风格一致：新增 UI 复用 `btnStyle` / inline 样式
  - 代码风格一致：新增 handler 使用 `useCallback` + try/catch + `addLog` + `updateStep` 模式
  - 门禁更新一致：V3/V4 门禁更新复用 `updateStep`
  - 日志导出兼容：`buildLogContent` 仅追加不修改现有段
- [ ] 产出最小差异审查记录文档（可追加到 `docs/p0-02-ui-fix/` 目录下，如 `min-diff-review.md`），记录审查结果和三项 Final Gate 证据清单（EV-01 正式 UI 接入证据、EV-02 三方 SHA-256 一致回写证据、EV-03 取消操作原文件不变证据）。
- **验证方式**：`git diff --name-only` 输出仅含 `src/adapter/smb/SmbPlugin.ts` 和 `src/ui/pages/M2VerificationPage.tsx`；审查记录文档存在且所有审查项标注"通过"；现有 `docs/p0-02-r3/test-report.md` 文件内容哈希与修改前一致。
- **依赖关系**：依赖 6.2（APK 构建成功）。

---

## 任务依赖关系图

```
1.1 (FileChangeResult 扩展) ─┐
1.2 (SaveAsResolveOptions)  ─┤
1.3 (SaveAsResolveResult)   ─┼─→ 1.4 (resolveSaveAs 声明) ─┐
                             └─→ 2.1 (4 个 useState) ────────┤
                                                             ├─→ 3.1 (handleForegroundCheck) ─┐
                                                             │                                 ├─→ 4.1 (另存为检测按钮)
                                                             │                                 ├─→ 4.2 (候选文件提示区)
                                                             │                                 └─→ 5.1 (saveAsResult 导出)
                                                             │
1.4 (resolveSaveAs 声明) ────┤
2.1 (4 个 useState) ─────────┴─→ 3.2 (handleResolveSaveAs) ──┐
                                                              ├─→ 4.3 (三选项按钮)
                                                              ├─→ 4.4 (结果展示区)
                                                              └─→ 5.2 (resolveAsResult 导出)

4.1 + 4.2 + 4.3 + 4.4 + 5.1 + 5.2 ──→ 6.1 (tsc 编译) ──→ 6.2 (APK 构建) ──→ 6.3 (最小差异审查)
```

---

## 验收标准映射

| 任务组 | 对应 spec.md 验收标准 | 对应 design.md 模块 |
|--------|----------------------|---------------------|
| 1. SmbPlugin.ts 接口扩展 | AC-01（接口基础）、4.5 节（兼容性） | 模块 A |
| 2. 状态管理新增 | 6.4 节（UI 状态约束） | 模块 B |
| 3. 事件处理新增 | AC-01、AC-02、5.1/5.2 节（核心能力） | 模块 C |
| 4. UI 组件新增 | AC-01、AC-02、AC-03、5.1/5.2 节（核心能力） | 模块 D |
| 5. 日志导出扩展 | AC-03（SHA-256 证据保留）、4.4 节（日志可导出） | buildLogContent 扩展 |
| 6. 编译验证与审查 | AC-04（最小差异审查 + Final Gate）、8.3 节（交付约束） | 验证方案 |

---

> **文档状态**：本编码任务清单已生成，位于 `docs/p0-02-ui-fix/tasks.md`。
> **任务统计**：共 6 个主任务组，17 个子任务，覆盖 spec.md 全部 4 项 PM 验收标准（AC-01 ~ AC-04）。
> **修改量预估**：约 +140 行，涉及 2 个文件，不删除任何现有代码。
> **下一步**：等待用户审查确认后，由编码实现 agent 按任务依赖顺序执行编码任务。本 agent 不负责代码实现。
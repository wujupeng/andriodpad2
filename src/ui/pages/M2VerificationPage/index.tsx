/**
 * M2 技术验证页（TASK-S2-05 迁移第一阶段）
 * 连接逻辑迁 smbConnectionStore、浏览逻辑迁 browseStore（本页为 store 消费方，
 * design.md 1.2.2 迁移表）；编辑回写五结果块保持直调插件（过渡期豁免，
 * S5 TASK-S5-04 收口）。
 * 迁移策略"只迁不改"：按钮与结果呈现对外可见行为不变（R-04 缓解，V1-V7 门禁可用）。
 * 连接为应用级全局状态（SideNav 联动），故移除存量"卸载即断开"逻辑。
 */
import { useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import SmbPlugin, {
  WpsOpenResult,
  FileChangeResult,
  WritebackResult,
  RemoteChangeResult,
  SaveAsResolveResult,
} from '../../../adapter/smb/SmbPlugin';
import { useSmbConnectionStore } from '../../../state/smbConnectionStore';
import { useBrowseStore } from '../../../state/browseStore';
import { BaseButton } from '../../components/BaseButton';
import { Card } from '../../components/Card';
import { Icon } from '../../icons/Icon';
import { fileIcon } from '../../icons/fileTypeIcons';
import styles from './style.module.css';

interface StepHistoryEntry {
  timestamp: string;
  result: 'pass' | 'fail';
  summary: string;
  trigger: string;
}

interface VerificationStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'pass' | 'fail' | 'running';
  details?: string;
  history?: StepHistoryEntry[];
}

const HISTORY_CAP = 20;

const initialSteps: VerificationStep[] = [
  { id: 'V1', name: 'WPS 可打开', description: '通过 FileProvider+URI 交付文件，WPS 可正常打开编辑', status: 'pending' },
  { id: 'V2', name: 'WPS 可保存', description: 'WPS 保存操作可被本组件检测', status: 'pending' },
  { id: 'V3', name: '保存行为识别', description: '正确识别直接写入/另存为/临时文件', status: 'pending' },
  { id: 'V4', name: '回写成功', description: '保存后回写共享且 SHA-256 校验通过', status: 'pending' },
  { id: 'V5', name: '回写失败不破坏', description: '回写失败时原文件未被破坏', status: 'pending' },
  { id: 'V6', name: '并发冲突', description: '两台设备同时编辑不静默覆盖', status: 'pending' },
  { id: 'V7', name: '断网恢复', description: '编辑期间断网后恢复，回写可完成', status: 'pending' },
];

/** M2 页直连凭据对应的活动档案标识（不写入 smbProfilesStore） */
const M2_PROFILE_ID = 'm2-manual';

type StepStatus = VerificationStep['status'];

/** 状态文本（Icon + 文案，替代存量 emoji；切换零过渡） */
function StatusText({ status, children }: { status: StepStatus; children: ReactNode }) {
  const iconName =
    status === 'pass'
      ? 'icon-check-circle'
      : status === 'fail'
        ? 'icon-x-circle'
        : status === 'running'
          ? 'icon-loader'
          : 'icon-clock';
  return (
    <span className={`${styles.status} ${styles[`status--${status}`]}`}>
      <Icon name={iconName} size={16} />
      {children}
    </span>
  );
}

export default function M2VerificationPage() {
  const [host, setHost] = useState('192.168.2.3');
  const [share, setShare] = useState('share');
  const [username, setUsername] = useState('debian');
  const [password, setPassword] = useState('***REDACTED***');
  const [domain] = useState('');

  // 连接状态：smbConnectionStore（TASK-S2-05 迁移）
  const connState = useSmbConnectionStore((s) => s.state);
  const connLastError = useSmbConnectionStore((s) => s.lastError);
  const connect = useSmbConnectionStore((s) => s.connect);
  const disconnect = useSmbConnectionStore((s) => s.disconnect);
  const connected = connState === 'connected';
  const connecting = connState === 'connecting';

  // 浏览状态：browseStore（TASK-S2-05 迁移）
  const currentPath = useBrowseStore((s) => s.currentPath);
  const files = useBrowseStore((s) => s.files);
  const browsing = useBrowseStore((s) => s.loading);
  const browseLoadError = useBrowseStore((s) => s.loadError);
  const enterDirectory = useBrowseStore((s) => s.enterDirectory);

  const error = connLastError?.userMessage ?? browseLoadError?.userMessage ?? null;

  // 编辑回写结果（过渡期豁免：直调插件，S5 收口）
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [openResult, setOpenResult] = useState<WpsOpenResult | null>(null);
  const [changeResult, setChangeResult] = useState<FileChangeResult | null>(null);
  const [writebackResult, setWritebackResult] = useState<WritebackResult | null>(null);
  const [remoteChangeResult, setRemoteChangeResult] = useState<RemoteChangeResult | null>(null);
  const [saveAsResult, setSaveAsResult] = useState<FileChangeResult | null>(null);
  const [resolveAsResult, setResolveAsResult] = useState<SaveAsResolveResult | null>(null);
  const [saveAsChecking, setSaveAsChecking] = useState(false);
  const [resolveAsLoading, setResolveAsLoading] = useState(false);
  const [steps, setSteps] = useState<VerificationStep[]>(initialSteps);
  const [log, setLog] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<string | null>(null);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLog((prev) => [...prev, `[${timestamp}] ${msg}`]);
  };

  const isTerminal = (s: StepStatus) => s === 'pass' || s === 'fail';

  const updateStep = (id: string, newStatus: StepStatus, details?: string, trigger?: string) => {
    setSteps((prev) =>
      prev.map((step) => {
        if (step.id !== id) return step;
        if (isTerminal(step.status)) {
          if (isTerminal(newStatus)) {
            return {
              ...step,
              history: [
                ...(step.history ?? []),
                {
                  timestamp: new Date().toLocaleTimeString(),
                  result: newStatus,
                  summary: (details ?? '').slice(0, 120),
                  trigger: trigger ?? '未标注操作',
                },
              ].slice(-HISTORY_CAP),
            };
          }
          return step;
        }
        return { ...step, status: newStatus, details };
      })
    );
  };

  const handleListDir = useCallback(
    async (path: string) => {
      addLog(`浏览目录: ${path || '(root)'}`);
      await enterDirectory(path);
      const loadError = useBrowseStore.getState().loadError;
      if (loadError) {
        addLog(`浏览失败: ${loadError.userMessage}`);
      }
    },
    [enterDirectory]
  );

  const handleConnect = useCallback(async () => {
    addLog(`连接 SMB 服务器: ${host}/${share}`);
    await connect(M2_PROFILE_ID, { host, share, username, password, domain });
    const snapshot = useSmbConnectionStore.getState();
    if (snapshot.state === 'connected') {
      addLog('SMB 连接成功');
      await handleListDir('');
    } else {
      addLog(`连接失败: ${snapshot.lastError?.userMessage ?? '未知错误'}`);
    }
  }, [host, share, username, password, domain, connect, handleListDir]);

  const handleDisconnect = useCallback(async () => {
    await disconnect();
    addLog('已断开连接');
  }, [disconnect]);

  const handleOpenInWps = useCallback(async (filePath: string) => {
    setSelectedFile(filePath);
    addLog(`在 WPS 中打开: ${filePath}`);
    updateStep('V1', 'running', undefined, '在 WPS 中打开');
    try {
      const result = await SmbPlugin.openInWps({ path: filePath });
      setOpenResult(result);
      if (result.intentLaunched) {
        updateStep('V1', 'pass', `URI: ${result.uri}, 基线SHA-256: ${result.baselineHash?.substring(0, 16)}...`, '在 WPS 中打开');
        addLog(`WPS 打开成功, URI: ${result.uri}`);
        addLog(`基线 SHA-256: ${result.baselineHash}`);
      } else {
        updateStep('V1', 'fail', result.error || 'Intent 启动失败', '在 WPS 中打开');
        addLog(`WPS 打开失败: ${result.error}`);
      }
    } catch (e: any) {
      updateStep('V1', 'fail', e.message || String(e), '在 WPS 中打开');
      addLog(`打开失败: ${e.message || e}`);
    }
  }, []);

  const handleCheckChange = useCallback(async () => {
    addLog('检查本地文件变更...');
    try {
      const result = await SmbPlugin.checkLocalFileChanged();
      setChangeResult(result);
      if (result.changed) {
        updateStep('V2', 'pass', `mtime 变更: ${result.baselineMtime} → ${result.currentMtime}`, '检查本地变更');
        addLog(`文件已变更 (mtime: ${result.currentMtime})`);
        if (result.contentChanged) {
          updateStep('V3', 'pass', `内容SHA-256变更: ${result.baselineHash?.substring(0, 16)}... → ${result.newHash?.substring(0, 16)}...`, '检查本地变更');
          addLog(`内容已变更 (新SHA-256: ${result.newHash})`);
        } else {
          addLog('文件 mtime 变更但内容未变');
        }
      } else {
        addLog('文件未变更');
      }
    } catch (e: any) {
      addLog(`检查失败: ${e.message || e}`);
    }
  }, []);

  const handleForegroundCheck = useCallback(async () => {
    addLog('执行另存为检测 foregroundCheck()...');
    setSaveAsChecking(true);
    try {
      const result = await SmbPlugin.foregroundCheck();
      setSaveAsResult(result);
      if (result.saveAsDiscovered) {
        updateStep('V3', 'pass', `另存为已识别: ${result.saveAsFilePath}`, '另存为检测');
        addLog(`发现另存为候选文件: ${result.saveAsFilePath}`);
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

  const handleWriteback = useCallback(async () => {
    addLog('执行回写...');
    updateStep('V4', 'running', undefined, '执行回写');
    try {
      const result = await SmbPlugin.writeback();
      setWritebackResult(result);
      if (result.writebackSuccess) {
        updateStep('V4', 'pass', `本地SHA-256=${result.localHash?.substring(0, 16)}..., 远程校验SHA-256=${result.verifyHash?.substring(0, 16)}...`, '执行回写');
        addLog(`回写成功! SHA-256 校验通过`);
        addLog(`本地: ${result.localHash}`);
        addLog(`远程: ${result.verifyHash}`);
      } else {
        updateStep('V4', 'fail', `SHA-256 不匹配: 本地=${result.localHash?.substring(0, 16)}..., 远程=${result.verifyHash?.substring(0, 16)}...`, '执行回写');
        addLog(`回写失败! SHA-256 不匹配`);
      }
    } catch (e: any) {
      updateStep('V4', 'fail', e.message || String(e), '执行回写');
      addLog(`回写失败: ${e.message || e}`);
    }
  }, []);

  const handleResolveSaveAs = useCallback(async (
    choice: 'OVERWRITE_ORIGINAL' | 'WRITE_AS_NEW' | 'DISCARD'
  ) => {
    addLog(`执行另存为处理 resolveSaveAs({choice: '${choice}'})...`);
    setResolveAsLoading(true);
    if (choice === 'OVERWRITE_ORIGINAL' || choice === 'WRITE_AS_NEW') {
      updateStep('V4', 'running', undefined, `另存为处理(${choice})`);
    }
    try {
      const result = await SmbPlugin.resolveSaveAs({ choice, saveAsFilePath: saveAsResult?.saveAsFilePath });
      setResolveAsResult(result);
      addLog(`处理结果: success=${result.writebackSuccess}, choice=${result.choice}`);
      if (choice === 'DISCARD') {
        if (result.writebackSuccess) {
          addLog(`已放弃关联, 远端原文件 mtime: ${result.remoteMtimeBefore} → ${result.remoteMtimeAfter} (一致)`);
        } else {
          addLog(`放弃关联失败: ${result.error || '未知错误'}`);
        }
      } else {
        if (result.writebackSuccess && result.localHash && result.verifyHash && result.localHash === result.verifyHash) {
          updateStep('V4', 'pass', `本地SHA-256=${result.localHash?.substring(0, 16)}..., 远程校验SHA-256=${result.verifyHash?.substring(0, 16)}...`, `另存为处理(${choice})`);
          addLog(`回写成功! SHA-256 校验通过`);
          addLog(`本地: ${result.localHash}`);
          addLog(`远程: ${result.verifyHash}`);
        } else {
          updateStep('V4', 'fail', `SHA-256 不匹配或回写失败: 本地=${result.localHash?.substring(0, 16)}..., 远程=${result.verifyHash?.substring(0, 16)}...`, `另存为处理(${choice})`);
          addLog(`回写失败! SHA-256 不匹配或回写失败`);
          if (result.localHash) addLog(`本地: ${result.localHash}`);
          if (result.verifyHash) addLog(`远程: ${result.verifyHash}`);
          if (result.error) addLog(`错误: ${result.error}`);
        }
      }
    } catch (e: any) {
      addLog(`另存为处理失败: ${e.message || e}`);
      if (choice !== 'DISCARD') {
        updateStep('V4', 'fail', e.message || String(e), `另存为处理(${choice})`);
      }
    } finally {
      setResolveAsLoading(false);
    }
  }, [saveAsResult]);

  const handleCheckRemote = useCallback(async () => {
    addLog('检查远程文件变更...');
    try {
      const result = await SmbPlugin.checkRemoteChanged();
      setRemoteChangeResult(result);
      if (result.remoteChanged) {
        addLog(`远程文件已变更 (mtime: ${result.remoteMtime})`);
        updateStep('V6', 'pass', `远程 mtime=${result.remoteMtime} ≠ 基线=${result.baselineMtime}`, '检查远程变更');
      } else {
        addLog('远程文件未变更');
      }
    } catch (e: any) {
      addLog(`检查失败: ${e.message || e}`);
    }
  }, []);

  const handleBack = useCallback(async () => {
    const parent = currentPath.includes('\\')
      ? currentPath.substring(0, currentPath.lastIndexOf('\\'))
      : '';
    await handleListDir(parent);
  }, [currentPath, handleListDir]);

  const handleCleanup = useCallback(async () => {
    try {
      await SmbPlugin.cleanup();
      setOpenResult(null);
      setChangeResult(null);
      setWritebackResult(null);
      setRemoteChangeResult(null);
      setSelectedFile(null);
      addLog('已清理缓存');
    } catch (e: any) {
      addLog(`清理失败: ${e.message || e}`);
    }
  }, []);

  const buildLogContent = () => {
    const lines: string[] = [];
    lines.push('=== PAD2 M2-A 技术验证日志 ===');
    lines.push(`导出时间: ${new Date().toLocaleString()}`);
    lines.push(`SMB 服务器: ${host}/${share} (用户: ${username})`);
    lines.push(`当前路径: ${currentPath}`);
    lines.push(`选中文件: ${selectedFile || '(无)'}`);
    lines.push('');
    lines.push('=== V1-V7 验证门禁状态 ===');
    steps.forEach((s) => {
      lines.push(`${s.id} ${s.name}: ${s.status} ${s.details || ''}`);
      if (s.history && s.history.length > 0) {
        lines.push(
          `  历史(${s.history.length}): ${s.history
            .map((h) => `[${h.timestamp}] ${h.result}(${h.trigger}) ${h.summary}`)
            .join('; ')}`
        );
      }
    });
    lines.push('');
    lines.push('=== 操作日志 ===');
    log.forEach((l) => lines.push(l));
    lines.push('');
    lines.push('=== 详细结果 ===');
    if (openResult) {
      lines.push(`WPS 打开结果: intentLaunched=${openResult.intentLaunched}, intentAction=${(openResult as any).intentAction || 'N/A'}, uriScheme=${(openResult as any).uriScheme || 'N/A'}, uri=${openResult.uri}`);
      lines.push(`  baselineHash=${openResult.baselineHash}, baselineMtime=${openResult.baselineMtime}`);
    }
    if (changeResult) {
      lines.push(`本地变更: changed=${changeResult.changed}, contentChanged=${changeResult.contentChanged}`);
      lines.push(`  newHash=${changeResult.newHash}, baselineHash=${changeResult.baselineHash}`);
      lines.push(`  observerDetectedChange=${(changeResult as any).observerDetectedChange}, observerEventLog=${(changeResult as any).observerEventLog || '(无)'}`);
    }
    if (writebackResult) {
      lines.push(`回写结果: success=${writebackResult.writebackSuccess}`);
      lines.push(`  localHash=${writebackResult.localHash}`);
      lines.push(`  verifyHash=${writebackResult.verifyHash}`);
    }
    if (remoteChangeResult) {
      lines.push(`远程变更: remoteChanged=${remoteChangeResult.remoteChanged}`);
      lines.push(`  remoteMtime=${remoteChangeResult.remoteMtime}, baselineMtime=${remoteChangeResult.baselineMtime}`);
    }
    if (saveAsResult) {
      lines.push(`另存为检测: saveAsDiscovered=${saveAsResult.saveAsDiscovered}`);
      lines.push(`  saveAsFilePath=${saveAsResult.saveAsFilePath || '(无)'}`);
      lines.push(`  saveAsPrompt=${saveAsResult.saveAsPrompt || '(无)'}`);
    }
    if (resolveAsResult) {
      lines.push(`另存为处理: success=${resolveAsResult.writebackSuccess}, choice=${resolveAsResult.choice}`);
      lines.push(`  localHash=${resolveAsResult.localHash || '(无)'}`);
      lines.push(`  verifyHash=${resolveAsResult.verifyHash || '(无)'}`);
      lines.push(`  remoteMtimeBefore=${resolveAsResult.remoteMtimeBefore}, remoteMtimeAfter=${resolveAsResult.remoteMtimeAfter}`);
      if (resolveAsResult.error) {
        lines.push(`  error=${resolveAsResult.error}`);
      }
    }
    if (error) {
      lines.push(`错误: ${error}`);
    }
    return lines.join('\n');
  };

  const handleExportLog = async () => {
    if (!connected) {
      addLog('未连接 SMB，无法导出日志');
      return;
    }
    setExporting(true);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const fileName = `m2a-log-${timestamp}.txt`;
    addLog(`导出日志到共享: apk/log/${fileName}`);
    try {
      const content = buildLogContent();
      const result = await SmbPlugin.exportLog({
        logDir: 'apk/log',
        content,
        fileName,
      });
      setExportResult(`已导出到 ${result.path}`);
      addLog(`日志导出成功: ${result.path}`);
    } catch (e: any) {
      setExportResult(`导出失败: ${e.message || e}`);
      addLog(`日志导出失败: ${e.message || e}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.page__header}>
        <h1 className={styles.page__title}>大总理文件管理</h1>
        <p className={styles.page__subtitle}>
          SMB 文件访问与 WPS 编辑回写核心 — M2-A 技术验证
        </p>
      </header>

      {/* Connection Section */}
      <Card title="SMB 连接">
        <div className={styles.stack}>
          <div className={styles.formGrid}>
            <input
              className={styles.input}
              placeholder="主机地址"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              disabled={connected}
            />
            <input
              className={styles.input}
              placeholder="共享名"
              value={share}
              onChange={(e) => setShare(e.target.value)}
              disabled={connected}
            />
            <input
              className={styles.input}
              placeholder="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={connected}
            />
            <input
              className={styles.input}
              placeholder="密码"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={connected}
            />
          </div>
          <div className={styles.actions}>
            {connected ? (
              <BaseButton variant="danger" onPress={() => void handleDisconnect()}>
                断开连接
              </BaseButton>
            ) : (
              <BaseButton
                variant="primary"
                disabled={connecting}
                onPress={() => void handleConnect()}
              >
                {connecting ? '连接中...' : '连接'}
              </BaseButton>
            )}
            {connected && (
              <span className={styles.connectedBadge}>
                <span className={styles.dot} aria-hidden />
                已连接
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* File Browser */}
      {connected && (
        <Card
          title="文件浏览"
          actions={<span className={styles.pathText}>路径: {currentPath || '(root)'}</span>}
        >
          <div className={styles.stack}>
            {currentPath && (
              <BaseButton variant="secondary" onPress={() => void handleBack()}>
                ↑ 上级目录
              </BaseButton>
            )}
            {browsing ? (
              <p className={styles.loadingText}>加载中...</p>
            ) : (
              <div className={styles.fileList}>
                {files.length === 0 ? (
                  <p className={styles.emptyText}>空目录</p>
                ) : (
                  files.map((file) => (
                    <div
                      key={file.path}
                      className={
                        selectedFile === file.path
                          ? `${styles.fileRow} ${styles['fileRow--selected']}`
                          : styles.fileRow
                      }
                      onClick={() => {
                        if (file.isDirectory) {
                          void handleListDir(file.path);
                        } else {
                          void handleOpenInWps(file.path);
                        }
                      }}
                    >
                      <span className={styles.fileRow__name}>
                        <Icon
                          name={
                            file.isDirectory
                              ? 'icon-folder'
                              : fileIcon(file.name.split('.').pop() ?? '')
                          }
                          size={18}
                        />
                        {file.name}
                      </span>
                      {!file.isDirectory && (
                        <span className={styles.fileRow__size}>
                          {(file.size / 1024).toFixed(1)} KB
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* WPS Verification Controls */}
      {openResult && (
        <Card title="WPS 编辑回写验证">
          <div className={styles.stack}>
            <p className={styles.infoLine}>
              已打开: <code className={styles.hash}>{selectedFile}</code>
            </p>
            <p className={styles.infoLine}>
              本地缓存: <code className={styles.hash}>{openResult.localPath}</code>
            </p>
            <p className={styles.infoLine}>
              基线 SHA-256: <code className={styles.hash}>{openResult.baselineHash}</code>
            </p>
            <div className={styles.actions}>
              <BaseButton variant="secondary" onPress={() => void handleCheckChange()}>
                检查本地变更
              </BaseButton>
              <BaseButton variant="primary" onPress={() => void handleWriteback()}>
                执行回写
              </BaseButton>
              <BaseButton variant="secondary" onPress={() => void handleCheckRemote()}>
                检查远程变更
              </BaseButton>
              <BaseButton variant="secondary" onPress={() => void handleCleanup()}>
                清理
              </BaseButton>
              <BaseButton
                variant="primary"
                disabled={saveAsChecking}
                onPress={() => void handleForegroundCheck()}
              >
                {saveAsChecking ? '检测中...' : '另存为检测'}
              </BaseButton>
            </div>

            {saveAsResult && saveAsResult.saveAsDiscovered && (
              <div className={`${styles.result} ${styles['result--warning']}`}>
                <strong className={styles.result__title}>
                  <Icon name="icon-alert-triangle" size={16} />
                  另存为候选文件已发现:
                </strong>
                <div>
                  候选文件路径: <code className={styles.hash}>{saveAsResult.saveAsFilePath}</code>
                </div>
                <div>{saveAsResult.saveAsPrompt}</div>
                <div className={styles.textSecondary}>请选择下方操作:</div>
              </div>
            )}
            {saveAsResult && !saveAsResult.saveAsDiscovered && (
              <div className={`${styles.result} ${styles['result--info']}`}>
                <strong className={styles.result__title}>
                  <Icon name="icon-info-circle" size={16} />
                  另存为检测安全回退:
                </strong>
                <div>{saveAsResult.saveAsPrompt || '未自动发现另存为文件,请手动选择文件'}</div>
                <div>
                  本地缓存 SHA-256 (原文件保护证据):{' '}
                  <code className={styles.hash}>{openResult?.baselineHash}</code>
                </div>
              </div>
            )}

            {saveAsResult && saveAsResult.saveAsDiscovered && (
              <div className={styles.actions}>
                <BaseButton
                  variant="danger"
                  disabled={resolveAsLoading}
                  onPress={() => void handleResolveSaveAs('OVERWRITE_ORIGINAL')}
                >
                  覆盖原文件
                </BaseButton>
                <BaseButton
                  variant="primary"
                  disabled={resolveAsLoading}
                  onPress={() => void handleResolveSaveAs('WRITE_AS_NEW')}
                >
                  回写为新文件
                </BaseButton>
                <BaseButton
                  variant="secondary"
                  disabled={resolveAsLoading}
                  onPress={() => void handleResolveSaveAs('DISCARD')}
                >
                  放弃关联
                </BaseButton>
              </div>
            )}

            {changeResult && (
              <div className={`${styles.result} ${styles['result--neutral']}`}>
                <strong>本地变更检查:</strong> {changeResult.changed ? '已变更' : '未变更'}
                <div>
                  FileObserver 检测:{' '}
                  <StatusText status={(changeResult as any).observerDetectedChange ? 'pass' : 'fail'}>
                    {(changeResult as any).observerDetectedChange ? '检测到变更' : '未检测到变更'}
                  </StatusText>
                </div>
                {(changeResult as any).observerEventLog && (
                  <div className={styles.textTertiary}>
                    事件: {(changeResult as any).observerEventLog}
                  </div>
                )}
                {changeResult.newHash && (
                  <div>
                    新 SHA-256: <code className={styles.hash}>{changeResult.newHash}</code>
                  </div>
                )}
              </div>
            )}

            {writebackResult && (
              <div
                className={`${styles.result} ${
                  writebackResult.writebackSuccess
                    ? styles['result--success']
                    : styles['result--danger']
                }`}
              >
                <strong>回写结果:</strong>{' '}
                {writebackResult.writebackSuccess ? (
                  <StatusText status="pass">成功 (SHA-256 校验通过)</StatusText>
                ) : (
                  <StatusText status="fail">失败</StatusText>
                )}
                <div>
                  本地: <code className={styles.hash}>{writebackResult.localHash}</code>
                </div>
                <div>
                  远程: <code className={styles.hash}>{writebackResult.verifyHash}</code>
                </div>
              </div>
            )}

            {remoteChangeResult && (
              <div
                className={`${styles.result} ${
                  remoteChangeResult.remoteChanged
                    ? styles['result--warning']
                    : styles['result--neutral']
                }`}
              >
                <strong>远程变更检查:</strong>{' '}
                {remoteChangeResult.remoteChanged ? (
                  <span className={`${styles.status} ${styles.textWarning}`}>
                    <Icon name="icon-alert-triangle" size={16} />
                    远程已变更 (可能冲突)
                  </span>
                ) : (
                  '远程未变更'
                )}
              </div>
            )}

            {resolveAsResult && (
              <div
                className={`${styles.result} ${
                  resolveAsResult.choice === 'DISCARD'
                    ? resolveAsResult.writebackSuccess
                      ? styles['result--neutral']
                      : styles['result--danger']
                    : resolveAsResult.writebackSuccess
                      ? styles['result--success']
                      : styles['result--danger']
                }`}
              >
                <strong>另存为处理结果:</strong>{' '}
                {resolveAsResult.choice === 'DISCARD' ? (
                  resolveAsResult.writebackSuccess ? (
                    <StatusText status="pass">已放弃关联</StatusText>
                  ) : (
                    <StatusText status="fail">放弃关联失败</StatusText>
                  )
                ) : resolveAsResult.writebackSuccess ? (
                  <StatusText status="pass">成功</StatusText>
                ) : (
                  <StatusText status="fail">失败</StatusText>
                )}
                <div>
                  决策: <code className={styles.hash}>{resolveAsResult.choice}</code>
                </div>
                <div>
                  远端 mtime: {resolveAsResult.remoteMtimeBefore} → {resolveAsResult.remoteMtimeAfter}
                  {resolveAsResult.remoteMtimeBefore === resolveAsResult.remoteMtimeAfter
                    ? ' (一致, 原文件未变)'
                    : ' (已变更)'}
                </div>
                {resolveAsResult.localHash && (
                  <div>
                    本地 SHA-256: <code className={styles.hash}>{resolveAsResult.localHash}</code>
                  </div>
                )}
                {resolveAsResult.verifyHash && (
                  <div>
                    远程 SHA-256: <code className={styles.hash}>{resolveAsResult.verifyHash}</code>
                  </div>
                )}
                {resolveAsResult.localHash && resolveAsResult.verifyHash && (
                  <div>
                    哈希一致性:{' '}
                    <StatusText
                      status={resolveAsResult.localHash === resolveAsResult.verifyHash ? 'pass' : 'fail'}
                    >
                      {resolveAsResult.localHash === resolveAsResult.verifyHash ? '一致' : '不一致'}
                    </StatusText>
                  </div>
                )}
                {resolveAsResult.error && (
                  <div className={styles.textDanger}>错误: {resolveAsResult.error}</div>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Verification Steps */}
      <Card title="V1-V7 验证门禁">
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID</th>
              <th>验证项</th>
              <th>状态</th>
              <th>详情</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step) => (
              <tr key={step.id}>
                <td className={styles.table__id}>{step.id}</td>
                <td>{step.name}</td>
                <td>
                  {step.status === 'pass' && <StatusText status="pass">通过</StatusText>}
                  {step.status === 'fail' && <StatusText status="fail">失败</StatusText>}
                  {step.status === 'running' && <StatusText status="running">验证中</StatusText>}
                  {step.status === 'pending' && <StatusText status="pending">待验证</StatusText>}
                </td>
                <td className={styles.table__details}>
                  {step.details || '-'}
                  {step.history && step.history.length > 0 && (
                    <span
                      className={styles.textTertiary}
                      title={step.history
                        .map((h) => `[${h.timestamp}] ${h.result}(${h.trigger}) ${h.summary}`)
                        .join('\n')}
                    >
                      {` 历史 ${step.history.length} 条·最近 [${step.history[step.history.length - 1].timestamp}] ${step.history[step.history.length - 1].result}(${step.history[step.history.length - 1].trigger}) ${step.history[step.history.length - 1].summary}`}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Error */}
      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      {/* Log */}
      <Card
        title="操作日志"
        actions={
          connected ? (
            <BaseButton
              variant="secondary"
              disabled={exporting}
              onPress={() => void handleExportLog()}
            >
              {exporting ? '导出中...' : '导出日志到共享'}
            </BaseButton>
          ) : undefined
        }
      >
        <div className={styles.stack}>
          {exportResult && (
            <div
              className={`${styles.result} ${
                exportResult.includes('失败')
                  ? styles['result--danger']
                  : styles['result--success']
              }`}
            >
              {exportResult}
            </div>
          )}
          <div className={styles.logBox}>
            {log.length === 0 ? (
              <span className={styles.textTertiary}>暂无日志</span>
            ) : (
              log.map((line, i) => (
                <div key={i} className={styles.logLine}>
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
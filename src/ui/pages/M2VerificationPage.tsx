import { useState, useCallback, useEffect } from 'react';
import SmbPlugin, {
  SmbFileEntry,
  WpsOpenResult,
  FileChangeResult,
  WritebackResult,
  RemoteChangeResult,
} from '../../adapter/smb/SmbPlugin';

interface VerificationStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'pass' | 'fail' | 'running';
  details?: string;
}

const initialSteps: VerificationStep[] = [
  { id: 'V1', name: 'WPS 可打开', description: '通过 FileProvider+URI 交付文件，WPS 可正常打开编辑', status: 'pending' },
  { id: 'V2', name: 'WPS 可保存', description: 'WPS 保存操作可被本组件检测', status: 'pending' },
  { id: 'V3', name: '保存行为识别', description: '正确识别直接写入/另存为/临时文件', status: 'pending' },
  { id: 'V4', name: '回写成功', description: '保存后回写共享且 SHA-256 校验通过', status: 'pending' },
  { id: 'V5', name: '回写失败不破坏', description: '回写失败时原文件未被破坏', status: 'pending' },
  { id: 'V6', name: '并发冲突', description: '两台设备同时编辑不静默覆盖', status: 'pending' },
  { id: 'V7', name: '断网恢复', description: '编辑期间断网后恢复，回写可完成', status: 'pending' },
];

export default function M2VerificationPage() {
  const [host, setHost] = useState('192.168.2.3');
  const [share, setShare] = useState('share');
  const [username, setUsername] = useState('debian');
  const [password, setPassword] = useState('9090');
  const [domain] = useState('');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [files, setFiles] = useState<SmbFileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [openResult, setOpenResult] = useState<WpsOpenResult | null>(null);
  const [changeResult, setChangeResult] = useState<FileChangeResult | null>(null);
  const [writebackResult, setWritebackResult] = useState<WritebackResult | null>(null);
  const [remoteChangeResult, setRemoteChangeResult] = useState<RemoteChangeResult | null>(null);
  const [steps, setSteps] = useState<VerificationStep[]>(initialSteps);
  const [log, setLog] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<string | null>(null);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLog((prev) => [...prev, `[${timestamp}] ${msg}`]);
  };

  const updateStep = (id: string, status: VerificationStep['status'], details?: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status, details } : s))
    );
  };

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    addLog(`连接 SMB 服务器: ${host}/${share}`);
    try {
      await SmbPlugin.connect({ host, share, username, password, domain });
      setConnected(true);
      addLog('SMB 连接成功');
      await handleListDir('');
    } catch (e: any) {
      setError(e.message || String(e));
      addLog(`连接失败: ${e.message || e}`);
    } finally {
      setConnecting(false);
    }
  }, [host, share, username, password, domain]);

  const handleDisconnect = useCallback(async () => {
    try {
      await SmbPlugin.disconnect();
      setConnected(false);
      setFiles([]);
      setCurrentPath('');
      addLog('已断开连接');
    } catch (e: any) {
      addLog(`断开失败: ${e.message || e}`);
    }
  }, []);

  const handleListDir = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    addLog(`浏览目录: ${path || '(root)'}`);
    try {
      const result = await SmbPlugin.listDirectory({ path });
      setFiles(result.files);
      setCurrentPath(path);
    } catch (e: any) {
      setError(e.message || String(e));
      addLog(`浏览失败: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpenInWps = useCallback(async (filePath: string) => {
    setError(null);
    setSelectedFile(filePath);
    addLog(`在 WPS 中打开: ${filePath}`);
    updateStep('V1', 'running');
    try {
      const result = await SmbPlugin.openInWps({ path: filePath });
      setOpenResult(result);
      if (result.intentLaunched) {
        updateStep('V1', 'pass', `URI: ${result.uri}, 基线SHA-256: ${result.baselineHash?.substring(0, 16)}...`);
        addLog(`WPS 打开成功, URI: ${result.uri}`);
        addLog(`基线 SHA-256: ${result.baselineHash}`);
      } else {
        updateStep('V1', 'fail', result.error || 'Intent 启动失败');
        addLog(`WPS 打开失败: ${result.error}`);
      }
    } catch (e: any) {
      updateStep('V1', 'fail', e.message || String(e));
      addLog(`打开失败: ${e.message || e}`);
    }
  }, []);

  const handleCheckChange = useCallback(async () => {
    addLog('检查本地文件变更...');
    try {
      const result = await SmbPlugin.checkLocalFileChanged();
      setChangeResult(result);
      if (result.changed) {
        updateStep('V2', 'pass', `mtime 变更: ${result.baselineMtime} → ${result.currentMtime}`);
        addLog(`文件已变更 (mtime: ${result.currentMtime})`);
        if (result.contentChanged) {
          updateStep('V3', 'pass', `内容SHA-256变更: ${result.baselineHash?.substring(0, 16)}... → ${result.newHash?.substring(0, 16)}...`);
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

  const handleWriteback = useCallback(async () => {
    addLog('执行回写...');
    updateStep('V4', 'running');
    try {
      const result = await SmbPlugin.writeback();
      setWritebackResult(result);
      if (result.writebackSuccess) {
        updateStep('V4', 'pass', `本地SHA-256=${result.localHash?.substring(0, 16)}..., 远程校验SHA-256=${result.verifyHash?.substring(0, 16)}...`);
        addLog(`回写成功! SHA-256 校验通过`);
        addLog(`本地: ${result.localHash}`);
        addLog(`远程: ${result.verifyHash}`);
      } else {
        updateStep('V4', 'fail', `SHA-256 不匹配: 本地=${result.localHash?.substring(0, 16)}..., 远程=${result.verifyHash?.substring(0, 16)}...`);
        addLog(`回写失败! SHA-256 不匹配`);
      }
    } catch (e: any) {
      updateStep('V4', 'fail', e.message || String(e));
      addLog(`回写失败: ${e.message || e}`);
    }
  }, []);

  const handleCheckRemote = useCallback(async () => {
    addLog('检查远程文件变更...');
    try {
      const result = await SmbPlugin.checkRemoteChanged();
      setRemoteChangeResult(result);
      if (result.remoteChanged) {
        addLog(`远程文件已变更 (mtime: ${result.remoteMtime})`);
        updateStep('V6', 'pass', `远程 mtime=${result.remoteMtime} ≠ 基线=${result.baselineMtime}`);
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

  useEffect(() => {
    return () => {
      SmbPlugin.disconnect().catch(() => {});
    };
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 4 }}>大总理文件管理</h1>
      <p style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
        SMB 文件访问与 WPS 编辑回写核心 — M2-A 技术验证
      </p>

      {/* Connection Section */}
      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>SMB 连接</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <input
            placeholder="主机地址"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            disabled={connected}
            style={inputStyle}
          />
          <input
            placeholder="共享名"
            value={share}
            onChange={(e) => setShare(e.target.value)}
            disabled={connected}
            style={inputStyle}
          />
          <input
            placeholder="用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={connected}
            style={inputStyle}
          />
          <input
            placeholder="密码"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={connected}
            style={inputStyle}
          />
        </div>
        {connected ? (
          <button onClick={handleDisconnect} style={btnStyle('#f44336')}>断开连接</button>
        ) : (
          <button onClick={handleConnect} disabled={connecting} style={btnStyle('#1976d2')}>
            {connecting ? '连接中...' : '连接'}
          </button>
        )}
        {connected && <span style={{ marginLeft: 8, color: 'green', fontSize: 14 }}>● 已连接</span>}
      </div>

      {/* File Browser */}
      {connected && (
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h2 style={{ fontSize: 16, fontWeight: 'bold' }}>文件浏览</h2>
            <span style={{ fontSize: 12, color: '#888' }}>路径: {currentPath || '(root)'}</span>
          </div>
          {currentPath && (
            <button onClick={handleBack} style={{ ...btnStyle('#666'), marginBottom: 8 }}>↑ 上级目录</button>
          )}
          {loading ? (
            <p style={{ color: '#888' }}>加载中...</p>
          ) : (
            <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #eee', borderRadius: 4 }}>
              {files.length === 0 ? (
                <p style={{ padding: 8, color: '#888' }}>空目录</p>
              ) : (
                files.map((file) => (
                  <div
                    key={file.path}
                    onClick={() => {
                      if (file.isDirectory) {
                        handleListDir(file.path);
                      } else {
                        handleOpenInWps(file.path);
                      }
                    }}
                    style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid #eee',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: selectedFile === file.path ? '#e3f2fd' : 'transparent',
                    }}
                  >
                    <span>
                      {file.isDirectory ? '📁 ' : '📄 '}
                      {file.name}
                    </span>
                    {!file.isDirectory && (
                      <span style={{ fontSize: 12, color: '#888' }}>
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* WPS Verification Controls */}
      {openResult && (
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>WPS 编辑回写验证</h2>
          <p style={{ fontSize: 13, marginBottom: 8 }}>
            已打开: <code>{selectedFile}</code>
          </p>
          <p style={{ fontSize: 13, marginBottom: 8 }}>
            本地缓存: <code>{openResult.localPath}</code>
          </p>
          <p style={{ fontSize: 13, marginBottom: 12 }}>
            基线 SHA-256: <code style={{ fontSize: 11 }}>{openResult.baselineHash}</code>
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={handleCheckChange} style={btnStyle('#ff9800')}>检查本地变更</button>
            <button onClick={handleWriteback} style={btnStyle('#4caf50')}>执行回写</button>
            <button onClick={handleCheckRemote} style={btnStyle('#9c27b0')}>检查远程变更</button>
            <button onClick={handleCleanup} style={btnStyle('#666')}>清理</button>
          </div>

          {changeResult && (
            <div style={{ marginTop: 12, padding: 8, background: '#f5f5f5', borderRadius: 4, fontSize: 13 }}>
              <strong>本地变更检查:</strong> {changeResult.changed ? '已变更' : '未变更'}
              <div style={{ marginTop: 4 }}>
                FileObserver 检测: <strong style={{ color: (changeResult as any).observerDetectedChange ? 'green' : 'red' }}>
                  {(changeResult as any).observerDetectedChange ? '✅ 检测到变更' : '❌ 未检测到变更'}
                </strong>
              </div>
              {(changeResult as any).observerEventLog && (
                <div style={{ marginTop: 2, fontSize: 11, color: '#666' }}>
                  事件: {(changeResult as any).observerEventLog}
                </div>
              )}
              {changeResult.newHash && (
                <div style={{ marginTop: 4 }}>
                  新 SHA-256: <code style={{ fontSize: 11 }}>{changeResult.newHash}</code>
                </div>
              )}
            </div>
          )}

          {writebackResult && (
            <div style={{ marginTop: 12, padding: 8, background: writebackResult.writebackSuccess ? '#e8f5e9' : '#ffebee', borderRadius: 4, fontSize: 13 }}>
              <strong>回写结果:</strong> {writebackResult.writebackSuccess ? '✅ 成功 (SHA-256 校验通过)' : '❌ 失败'}
              <div style={{ marginTop: 4 }}>本地: <code style={{ fontSize: 11 }}>{writebackResult.localHash}</code></div>
              <div>远程: <code style={{ fontSize: 11 }}>{writebackResult.verifyHash}</code></div>
            </div>
          )}

          {remoteChangeResult && (
            <div style={{ marginTop: 12, padding: 8, background: '#f5f5f5', borderRadius: 4, fontSize: 13 }}>
              <strong>远程变更检查:</strong> {remoteChangeResult.remoteChanged ? '⚠️ 远程已变更 (可能冲突)' : '远程未变更'}
            </div>
          )}
        </div>
      )}

      {/* Verification Steps */}
      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>V1-V7 验证门禁</h2>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd' }}>
              <th style={{ textAlign: 'left', padding: 4 }}>ID</th>
              <th style={{ textAlign: 'left', padding: 4 }}>验证项</th>
              <th style={{ textAlign: 'left', padding: 4 }}>状态</th>
              <th style={{ textAlign: 'left', padding: 4 }}>详情</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step) => (
              <tr key={step.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 4, fontWeight: 'bold' }}>{step.id}</td>
                <td style={{ padding: 4 }}>{step.name}</td>
                <td style={{ padding: 4 }}>
                  {step.status === 'pass' && <span style={{ color: 'green' }}>✅ 通过</span>}
                  {step.status === 'fail' && <span style={{ color: 'red' }}>❌ 失败</span>}
                  {step.status === 'running' && <span style={{ color: 'orange' }}>⏳ 验证中</span>}
                  {step.status === 'pending' && <span style={{ color: '#888' }}>⬚ 待验证</span>}
                </td>
                <td style={{ padding: 4, fontSize: 11, color: '#666' }}>{step.details || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: 12, background: '#ffebee', borderRadius: 8, marginBottom: 12, color: 'red', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Log */}
      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 'bold', margin: 0 }}>操作日志</h2>
          {connected && (
            <button onClick={handleExportLog} disabled={exporting} style={btnStyle('#009688')}>
              {exporting ? '导出中...' : '导出日志到共享'}
            </button>
          )}
        </div>
        {exportResult && (
          <div style={{ marginBottom: 8, padding: '4px 8px', background: exportResult.includes('失败') ? '#ffebee' : '#e8f5e9', borderRadius: 4, fontSize: 12 }}>
            {exportResult}
          </div>
        )}
        <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 12, fontFamily: 'monospace', background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
          {log.length === 0 ? (
            <span style={{ color: '#888' }}>暂无日志</span>
          ) : (
            log.map((line, i) => (
              <div key={i} style={{ marginBottom: 2 }}>{line}</div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '6px 8px',
  border: '1px solid #ddd',
  borderRadius: 4,
  fontSize: 14,
};

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: '6px 16px',
    backgroundColor: color,
    color: 'white',
    border: 'none',
    borderRadius: 4,
    fontSize: 14,
    cursor: 'pointer',
  };
}
import { useEditSessionStore } from '../../../state/editSessionStore';
import type { ManualStepAction } from '../../../state/editSessionStore';
import { useEditSessionMonitor } from '../../hooks/useEditSessionMonitor';
import { EmptyState } from '../../components/EmptyState';
import { READ_ONLY_MODE, READ_ONLY_NOTICES } from '../../../state/readOnlyMode';

const STATE_LABELS: Record<string, string> = {
  idle: '空闲',
  opening: '正在打开',
  open_failed: '打开失败',
  opened: '已打开',
  editing: '编辑中',
  saving: '正在保存',
  writeback_pending: '等待写回',
  writeback_success: '写回成功',
  writeback_failed: '写回失败',
  saveas_detected: '发现另存为',
  conflict: '检测到冲突',
  network_interrupted: '网络中断',
  session_invalid: '会话无效',
  session_terminated: '会话已终止',
};

// AU-005 只读模式：writeback/check-remote 灰显（R-ESS-06）；check-change/foreground-check 保留只读语义
const MANUAL_ACTIONS: { action: ManualStepAction; label: string; readOnlyDisabled?: boolean }[] = [
  { action: 'check-change', label: '检查本地变更' },
  { action: 'writeback', label: '执行写回', readOnlyDisabled: true },
  { action: 'check-remote', label: '检查远程变更', readOnlyDisabled: true },
  { action: 'foreground-check', label: '前台检查' },
];

export function EditSessionPage() {
  const state = useEditSessionStore((s) => s.state);
  const baseline = useEditSessionStore((s) => s.baseline);
  const timeline = useEditSessionStore((s) => s.timeline);
  const lastError = useEditSessionStore((s) => s.lastError);
  const conflictInfo = useEditSessionStore((s) => s.conflictInfo);
  const pendingSaveAs = useEditSessionStore((s) => s.pendingSaveAs);
  const manualStep = useEditSessionStore((s) => s.manualStep);
  const closeSession = useEditSessionStore((s) => s.closeSession);

  const { monitoring } = useEditSessionMonitor({
    onStateChange: () => {},
  });

  if (state === 'idle') {
    return (
      <EmptyState
        icon="icon-edit"
        title="没有活跃的编辑会话"
        description="从共享目录打开文件后，编辑会话状态将显示在这里"
      />
    );
  }

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontWeight: 500 }}>当前状态：</span>
          <span>{STATE_LABELS[state] ?? state}</span>
        </div>
        <span style={{ fontSize: '12px', color: monitoring ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>
          {monitoring ? '监控中' : '未监控'}
        </span>
      </div>

      {baseline && (
        <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div>文件：{baseline.fileName}</div>
          <div>远程路径：{baseline.remotePath}</div>
          <div>基线 mtime：{new Date(baseline.baselineMtime).toLocaleString()}</div>
          <div>基线 SHA-256：{baseline.baselineSha256.slice(0, 16)}…</div>
        </div>
      )}

      {conflictInfo && (
        <div style={{ padding: '8px 12px', background: 'var(--color-warning-bg)', borderRadius: '8px', fontSize: '13px' }}>
          [冲突] 远程文件已变更（远程 mtime: {new Date(conflictInfo.remoteMtime).toLocaleString()}）
        </div>
      )}

      {pendingSaveAs && (
        <div style={{ padding: '8px 12px', background: 'var(--color-info-bg)', borderRadius: '8px', fontSize: '13px' }}>
          另存为候选：{pendingSaveAs.candidatePath}
        </div>
      )}

      {lastError && (
        <div style={{ color: 'var(--color-danger)', fontSize: '13px' }}>
          {lastError.userMessage}
        </div>
      )}

      {timeline.length > 0 && (
        <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
          <div style={{ marginBottom: '4px', fontWeight: 500 }}>时间线</div>
          {timeline.slice(-8).map((entry, i) => (
            <div key={i}>
              {new Date(entry.timestamp).toLocaleTimeString()} — {STATE_LABELS[entry.state] ?? entry.state}
              {entry.detail ? ` (${entry.detail})` : ''}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
        {MANUAL_ACTIONS.map(({ action, label, readOnlyDisabled }) => {
          const disabled = READ_ONLY_MODE && readOnlyDisabled;
          return (
            <button
              key={action}
              onClick={disabled ? undefined : () => void manualStep(action)}
              disabled={disabled}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                background: 'var(--color-surface)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                color: disabled ? 'var(--color-text-tertiary)' : 'inherit',
              }}
              title={disabled ? READ_ONLY_NOTICES.greyedReason : undefined}
            >
              {label}
            </button>
          );
        })}
        <button
          onClick={closeSession}
          style={{
            padding: '6px 12px',
            fontSize: '13px',
            border: '1px solid var(--color-danger)',
            borderRadius: '6px',
            background: 'var(--color-surface)',
            color: 'var(--color-danger)',
            cursor: 'pointer',
          }}
        >
          关闭会话
        </button>
      </div>
    </div>
  );
}
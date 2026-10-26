import { useEditSessionStore } from '../../../state/editSessionStore';
import { EmptyState } from '../../components/EmptyState';

const STATE_LABELS: Record<string, string> = {
  idle: '空闲',
  opening: '正在打开',
  open_failed: '打开失败',
  opened: '已打开',
  save_detected: '检测到保存',
  writeback_pending: '等待写回',
  writeback_in_progress: '正在写回',
  writeback_success: '写回成功',
  writeback_failed: '写回失败',
  save_as_discovered: '发现另存为',
  conflict_detected: '检测到冲突',
  session_terminated: '会话已终止',
};

export function EditSessionPage() {
  const state = useEditSessionStore((s) => s.state);
  const lastError = useEditSessionStore((s) => s.lastError);

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
    <div style={{ padding: '16px' }}>
      <div style={{ marginBottom: '16px' }}>
        <span style={{ fontWeight: 500 }}>当前状态：</span>
        <span>{STATE_LABELS[state] ?? state}</span>
      </div>
      {lastError && (
        <div style={{ color: 'var(--color-danger)' }}>
          {lastError.userMessage}
        </div>
      )}
    </div>
  );
}
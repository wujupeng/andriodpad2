/**
 * GlobalStatusRail 全局状态栏（design.md 2.4.1、2.5.2、TASK-S5-05）
 * 渲染于 Shell 层 TopBar 之上、z-rail 最高层级——任何遮罩不可覆盖（安全语义
 * 不丢失的结构性保证，spec 4.2.2）。
 * 多源仲裁（design.md 2.5.2）：收集 editSessionStore/smbConnectionStore/operationStore
 * 活跃安全语义，按 RAIL_PRIORITY 优先级呈现最高 1 条。
 */
import { useEditSessionStore } from '../../../../state/editSessionStore';
import type { EditSessionState } from '../../../../state/editSessionStore';
import { useSmbConnectionStore } from '../../../../state/smbConnectionStore';
import type { SmbConnectionState } from '../../../../state/smbConnectionStore';
import { useOperationStore } from '../../../../state/operationStore';
import type { OperationStatus } from '../../../../state/operationStore';
import { StatusBanner } from '../../../components/StatusBanner';
import type { BannerAction } from '../../../components/StatusBanner';
import {
  safetySemanticMap,
  RAIL_PRIORITY,
  formatSafetyMessage,
} from '../../../tokens/tokens';
import type { SafetySemanticKey, SafetyActionId } from '../../../tokens/tokens';
import styles from './style.module.css';

const SESSION_MAP: Partial<Record<EditSessionState, SafetySemanticKey>> = {
  saving: 'saving',
  writeback_pending: 'writeback_in_progress',
  writeback_success: 'writeback_success',
  writeback_failed: 'writeback_failed',
  conflict: 'conflict',
  saveas_detected: 'saveas_detected',
  network_interrupted: 'network_interrupted',
  session_invalid: 'session_invalid',
};

const CONNECTION_MAP: Partial<Record<SmbConnectionState, SafetySemanticKey>> = {
  session_invalid: 'session_invalid',
  network_interrupted: 'network_interrupted',
};

function operationKey(status: OperationStatus | undefined): SafetySemanticKey | null {
  if (!status) return null;
  if (status === 'in_progress') return 'operation_in_progress';
  if (status === 'failed' || status === 'partial_failed') return 'operation_failed';
  return null;
}

function pickHighest(keys: (SafetySemanticKey | null)[]): SafetySemanticKey | null {
  const active = keys.filter((k): k is SafetySemanticKey => k !== null);
  if (active.length === 0) return null;
  for (const prio of RAIL_PRIORITY) {
    if (active.includes(prio)) return prio;
  }
  return active[0];
}

export function GlobalStatusRail() {
  const sessionState = useEditSessionStore((s) => s.state);
  const sessionError = useEditSessionStore((s) => s.lastError);
  const closeSession = useEditSessionStore((s) => s.closeSession);
  const manualStep = useEditSessionStore((s) => s.manualStep);
  const pendingSaveAs = useEditSessionStore((s) => s.pendingSaveAs);

  const connectionState = useSmbConnectionStore((s) => s.state);
  const reconnect = useSmbConnectionStore((s) => s.reconnect);

  const activeTask = useOperationStore((s) => s.activeTask);

  const topKey = pickHighest([
    SESSION_MAP[sessionState] ?? null,
    CONNECTION_MAP[connectionState] ?? null,
    operationKey(activeTask?.status),
  ]);

  if (!topKey) {
    return <div className={styles.rail} role="region" aria-label="全局状态" />;
  }

  const spec = safetySemanticMap[topKey];
  const params: Record<string, string> = {};
  if (topKey === 'writeback_failed' && sessionError) params['可读原因'] = sessionError.userMessage;
  if (topKey === 'saveas_detected' && pendingSaveAs) params['文件名'] = pendingSaveAs.candidatePath;
  if (topKey === 'operation_in_progress' && activeTask) params['操作名'] = activeTask.kind;
  if (topKey === 'operation_failed' && activeTask) {
    params['操作名'] = activeTask.kind;
    params['可读原因'] = activeTask.failures?.[0]?.reason ?? '未知错误';
  }

  const message = formatSafetyMessage(topKey, params);

  const actionMap: Partial<Record<SafetyActionId, BannerAction>> = {
    retry: { label: '重试', onPress: () => void manualStep('writeback'), variant: 'primary' },
    close_session: { label: '关闭会话', onPress: closeSession },
    reconnect: { label: '重连', onPress: () => void reconnect(), variant: 'primary' },
    retry_connection: { label: '重连', onPress: () => void reconnect(), variant: 'primary' },
    discard: { label: '放弃', onPress: closeSession },
    view_details: { label: '详情', onPress: () => {} },
  };

  const actions = spec.actions
    .filter((a) => a !== 'none')
    .map((a) => actionMap[a])
    .filter((a): a is BannerAction => a !== undefined)
    .slice(0, 2);

  return (
    <div className={styles.rail} role="region" aria-label="全局状态">
      <StatusBanner
        semantic={spec.semantic}
        icon={spec.icon}
        title={message}
        actions={actions.length > 0 ? actions : undefined}
      />
    </div>
  );
}
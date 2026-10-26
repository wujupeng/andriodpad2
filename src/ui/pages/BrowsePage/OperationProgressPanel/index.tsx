/**
 * OperationProgressPanel —— 操作进度与结果呈现（design.md 2.4.5，TASK-S4-06）
 * 活跃任务：底部固定条（ProgressBar 整体进度 + 当前文件名 + 取消按钮[R8 取消
 * 保留已完成部分] + 展开显示单文件进度列表）。
 * 结果呈现（spec 5.5.1-R6/R7，从 recentTasks 消费最近完成任务）：
 *   成功 → success Banner 4s 自动消失（非失败态允许自动消失）；
 *   失败 → danger Banner 持久 + 可读原因 + 重试入口；
 *   部分失败 → warning Banner + "查看失败清单"（Dialog：文件名+原因）；
 *   冲突 → warning Banner + 冲突提示（四选一决策归 FileActionSheet ConflictDialog）。
 * 取消 → cancelled 状态呈现（已完成部分保留说明，spec 5.5.1-R8）。
 * 重试语义：operationStore 任务不可原样重放（失败清单保留上下文），重试 =
 * 以同 targets/destination 重新入队（能力缺失路径下重试结果仍如实失败，
 * 不伪报成功——安全约束：重试不吞失败）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ProgressBar } from '../../../components/ProgressBar';
import { StatusBanner } from '../../../components/StatusBanner';
import { BaseButton } from '../../../components/BaseButton';
import { Dialog } from '../../../components/Dialog';
import { Icon } from '../../../icons/Icon';
import { useOperationStore } from '../../../../state/operationStore';
import type { OperationTask } from '../../../../state/operationStore';
import styles from './style.module.css';

const SUCCESS_AUTO_DISMISS_MS = 4000;

/** 任务动作标签（进度条主文案） */
const KIND_LABEL: Record<OperationTask['kind'], string> = {
  copy: '复制',
  move: '移动',
  rename: '重命名',
  delete: '删除',
  batch: '批量操作',
};

export interface OperationProgressPanelProps {
  /** 重试回调（同 targets/destination 重新入队，BrowsePage 提供） */
  onRetry(task: OperationTask): void;
}

export function OperationProgressPanel({ onRetry }: OperationProgressPanelProps) {
  const activeTask = useOperationStore((s) => s.activeTask);
  const recentTasks = useOperationStore((s) => s.recentTasks);
  const acknowledge = useOperationStore((s) => s.acknowledge);

  const [expanded, setExpanded] = useState(false);
  const [failuresFor, setFailuresFor] = useState<OperationTask | null>(null);
  /** 最近一条已完成任务的结果呈现（acknowledge 后清除） */
  const [lastDone, setLastDone] = useState<OperationTask | null>(null);
  const successTimer = useRef<number | null>(null);

  // 归档新完成任务 → 结果呈现槽
  useEffect(() => {
    const latest = recentTasks[0];
    if (!latest) return;
    setLastDone((prev) => (prev?.id === latest.id ? prev : latest));
  }, [recentTasks]);

  // 成功 4s 自动消失（仅非失败态；失败/部分失败/冲突/取消持久至用户确认）
  useEffect(() => {
    if (successTimer.current !== null) {
      window.clearTimeout(successTimer.current);
      successTimer.current = null;
    }
    if (lastDone?.status === 'success') {
      const taskId = lastDone.id;
      successTimer.current = window.setTimeout(() => {
        useOperationStore.getState().acknowledge(taskId);
        setLastDone(null);
        successTimer.current = null;
      }, SUCCESS_AUTO_DISMISS_MS);
    }
    return () => {
      if (successTimer.current !== null) {
        window.clearTimeout(successTimer.current);
        successTimer.current = null;
      }
    };
  }, [lastDone]);

  const handleCancel = useCallback(() => {
    if (!activeTask) return;
    void useOperationStore.getState().cancel(activeTask.id);
  }, [activeTask]);

  const handleAcknowledge = useCallback(() => {
    if (!lastDone) return;
    acknowledge(lastDone.id);
    setLastDone(null);
  }, [lastDone, acknowledge]);

  const handleRetry = useCallback(() => {
    if (!lastDone) return;
    onRetry(lastDone);
    acknowledge(lastDone.id);
    setLastDone(null);
  }, [lastDone, onRetry, acknowledge]);

  // ===== 活跃任务进度条（R6：全程有反馈） =====
  const renderActive = () => {
    if (!activeTask) return null;
    const { progress, kind, status } = activeTask;
    const cancelling = status === 'cancelled';
    const label = `${KIND_LABEL[kind]}中…（${progress.completed}/${progress.total}）`;
    return (
      <footer className={styles.panel} data-op-progress="" role="status">
        <div className={styles.panelMain}>
          <ProgressBar
            value={progress.percentage}
            semantic={cancelling ? 'warning' : 'brand'}
            label={cancelling ? `正在取消（已完成 ${progress.completed} 项将保留）` : label}
            sublabel={progress.currentFile ? `当前：${progress.currentFile}` : undefined}
          />
          <div className={styles.panelActions}>
            <BaseButton
              variant="text"
              size="sm"
              onPress={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
            >
              {expanded ? '收起' : '展开'}
            </BaseButton>
            <BaseButton
              variant="secondary"
              size="sm"
              disabled={cancelling}
              icon={<Icon name="icon-close" size={14} />}
              onPress={handleCancel}
            >
              取消
            </BaseButton>
          </div>
        </div>
        {expanded && (
          <ul className={styles.targetList}>
            {activeTask.targets.map((target) => {
              const index = activeTask.targets.indexOf(target);
              const done = index < progress.completed;
              const current = progress.currentFile === target.name;
              const failed = activeTask.failures?.some((f) => f.path === target.path);
              return (
                <li
                  key={target.path}
                  className={`${styles.targetItem} ${current ? styles.targetItemCurrent : ''}`}
                >
                  <Icon
                    name={done ? 'icon-check-circle' : failed ? 'icon-x-circle' : 'icon-file-unknown'}
                    size={16}
                  />
                  <span className={styles.targetName}>{target.name}</span>
                  <span className={styles.targetState}>
                    {failed ? '失败' : done ? '完成' : current ? '进行中' : '等待'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </footer>
    );
  };

  // ===== 结果呈现（R7：一眼可辨 + 持久策略差异） =====
  const renderResult = () => {
    if (!lastDone || activeTask) return null;
    const { status, kind, failures } = lastDone;
    const kindLabel = KIND_LABEL[kind];
    switch (status) {
      case 'success':
        return (
          <StatusBanner
            semantic="success"
            icon="icon-check-circle"
            title={`${kindLabel}完成（${lastDone.progress.total} 项）`}
            actions={[{ label: '知道了', onPress: handleAcknowledge, variant: 'text' }]}
          />
        );
      case 'failed':
        return (
          <StatusBanner
            semantic="danger"
            icon="icon-x-circle"
            title={`${kindLabel}失败：${failures?.[0]?.reason ?? '未知原因'}`}
            description={failures && failures.length > 1 ? `共 ${failures.length} 项失败` : undefined}
            actions={[
              { label: '重试', onPress: handleRetry, variant: 'primary' },
              { label: '知道了', onPress: handleAcknowledge, variant: 'text' },
            ]}
          />
        );
      case 'partial_failed':
        return (
          <StatusBanner
            semantic="warning"
            icon="icon-conflict"
            title={`${kindLabel}部分完成：${failures?.length ?? 0} 项失败（成功 ${lastDone.progress.completed} 项）`}
            actions={[
              { label: '查看失败清单', onPress: () => setFailuresFor(lastDone), variant: 'primary' },
              { label: '知道了', onPress: handleAcknowledge, variant: 'text' },
            ]}
          />
        );
      case 'cancelled':
        return (
          <StatusBanner
            semantic="warning"
            icon="icon-cloud-off"
            title={`已取消${kindLabel}（已完成 ${lastDone.progress.completed} 项保留）`}
            actions={[{ label: '知道了', onPress: handleAcknowledge, variant: 'text' }]}
          />
        );
      case 'conflict':
        return (
          <StatusBanner
            semantic="warning"
            icon="icon-conflict"
            title={`${kindLabel}遇到同名冲突，已停止（冲突处理入口见操作菜单）`}
            description="部分文件未处理，冲突决策后续跑由文件操作菜单承载"
            actions={[{ label: '知道了', onPress: handleAcknowledge, variant: 'text' }]}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      {renderResult()}
      {renderActive()}
      {failuresFor && (
        <Dialog
          title="失败清单"
          confirmLabel="关闭"
          onConfirm={() => setFailuresFor(null)}
          onDismiss={() => setFailuresFor(null)}
        >
          <ul className={styles.failureList}>
            {failuresFor.failures?.map((failure) => (
              <li key={failure.path} className={styles.failureItem}>
                <span className={styles.failureName}>{failure.name}</span>
                <span className={styles.failureReason}>{failure.reason}</span>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
    </>
  );
}
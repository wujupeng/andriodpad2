/**
 * DeleteConfirmDialog —— 删除二次确认（design.md 2.4.5，TASK-S4-05，spec 5.5.1-R5、
 * spec 4.3-2，安全关键）
 * 删除双语义三重区分（文案/图标/按钮类型，禁止共用措辞）：
 *   · 本地删除 → secondary Dialog"移入回收站，可恢复"（icon-delete 普通灰）；
 *   · 远程 SMB 删除 → danger Dialog"此操作不可恢复"措辞 +
 *     勾选"我了解此操作不可恢复"复选框二次确认（红色 icon-delete + danger 按钮）。
 */
import { useEffect, useState } from 'react';
import { Dialog } from '../../../components/Dialog';
import { Icon } from '../../../icons/Icon';
import styles from '../style.module.css';

export interface DeleteConfirmDialogProps {
  /** 文件来源（双语义判定：local 回收站 / remote 不可恢复） */
  source: 'local' | 'remote';
  /** 删除目标名称（单个）或数量（批量） */
  names: string[];
  /** 目标所在共享路径（TASK-S5-05 PM 要求：确认框须清楚显示文件名+所在共享路径） */
  sharePath?: string;
  open: boolean;
  onConfirm(): void;
  onDismiss(): void;
}

export function DeleteConfirmDialog({
  source,
  names,
  sharePath,
  open,
  onConfirm,
  onDismiss,
}: DeleteConfirmDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (open) setAcknowledged(false);
  }, [open]);

  if (!open) return null;

  const batch = names.length > 1;
  const targetLabel = batch ? `${names.length} 个项目` : `"${names[0] ?? ''}"`;
  // 共享路径行（远端删除必显示——用户须明确知道删的是哪个共享的什么位置）
  const pathLine = sharePath ? `（位于共享：${sharePath || '根目录'}）` : '';

  if (source === 'local') {
    // 本地删除：回收站语义（可恢复，secondary 措辞与按钮）
    return (
      <Dialog
        title="删除到回收站"
        confirmLabel="删除"
        confirmVariant="primary"
        onConfirm={onConfirm}
        onDismiss={onDismiss}
      >
        <p className={styles.deleteBody}>
          {targetLabel}将移入回收站，您可以在回收站中恢复它。确定删除吗？
        </p>
      </Dialog>
    );
  }

  // 远程 SMB 删除：不可恢复语义（danger 措辞 + 勾选二次确认 + danger 按钮）
  return (
    <Dialog
      title="删除共享文件"
      danger
      confirmLabel="永久删除"
      confirmVariant="danger"
      onConfirm={acknowledged ? onConfirm : undefined}
      onDismiss={onDismiss}
    >
      <div className={styles.deleteBodyDanger}>
        <p className={styles.deleteDangerText}>
          <span className={styles.dangerIcon}>
            <Icon name="icon-delete" size={18} />
          </span>
          此操作不可恢复：{targetLabel}{pathLine}将从共享目录中永久删除，无法通过回收站找回。
        </p>
        <label className={styles.ackRow}>
          <input
            type="checkbox"
            className={styles.ackCheckbox}
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>我了解此操作不可恢复</span>
        </label>
      </div>
    </Dialog>
  );
}
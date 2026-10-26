/**
 * C-08 Dialog（design.md 2.3.2）
 * 居中模态、max-width 560px、radius-xl、shadow-lg、scrim 遮罩。
 * 明确不用于安全语义状态呈现（仅确认决策）；遮罩 z-index 低于 z-rail。
 * 危险操作变体：标题区前置 danger 警告图标；出入场 200ms 淡入缩放。
 */
import type { ReactNode } from 'react';
import { Icon } from '../../icons/Icon';
import { BaseButton } from '../BaseButton';
import styles from './style.module.css';

export interface DialogProps {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  onConfirm?: () => void;
  onDismiss?: () => void;
  danger?: boolean;
  /** 危险确认的确认按钮文案（默认"确认"） */
  confirmVariant?: 'primary' | 'danger';
}

export function Dialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onDismiss,
  danger = false,
  confirmVariant,
}: DialogProps) {
  const variant = confirmVariant ?? (danger ? 'danger' : 'primary');
  return (
    <div className={styles['dialog-scrim']} onClick={onDismiss}>
      <div
        className={`${styles.dialog} ${danger ? styles['dialog--danger'] : ''}`}
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles['dialog__title-row']}>
          {danger && <Icon name="icon-x-circle" size={20} />}
          <span className={styles.dialog__title}>{title}</span>
        </div>
        <div className={styles.dialog__content}>{children}</div>
        <div className={styles.dialog__actions}>
          {onDismiss && (
            <BaseButton variant="text" size="md" onPress={onDismiss}>
              取消
            </BaseButton>
          )}
          {onConfirm && confirmLabel && (
            <BaseButton variant={variant} size="md" onPress={onConfirm}>
              {confirmLabel}
            </BaseButton>
          )}
        </div>
      </div>
    </div>
  );
}
/**
 * C-09 BottomSheet（design.md 2.3.2）
 * 底部弹出、顶部圆角 radius-xl、shadow-lg、4×32px 拖拽条、max-height 60vh；
 * 入场 300ms decelerate 上滑、退场 200ms 下滑；供 FileActionSheet 与窄幅菜单。
 */
import type { ReactNode } from 'react';
import styles from './style.module.css';

export interface BottomSheetProps {
  title?: string;
  open: boolean;
  onDismiss: () => void;
  children: ReactNode;
}

export function BottomSheet({ title, open, onDismiss, children }: BottomSheetProps) {
  if (!open) return null;
  return (
    <div className={styles['sheet-scrim']} onClick={onDismiss}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.sheet__grabber} aria-hidden />
        {title && <div className={styles.sheet__title}>{title}</div>}
        <div className={styles.sheet__content}>{children}</div>
      </div>
    </div>
  );
}
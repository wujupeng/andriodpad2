/**
 * C-02 Card（design.md 2.3.2）
 * radius-lg 14px、bg-surface、shadow-sm、内边距 space-4；
 * interactive 可选按压反馈（bg-hover + 120ms）。
 */
import type { ReactNode } from 'react';
import styles from './style.module.css';

export interface CardProps {
  interactive?: boolean;
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  onPress?: () => void;
}

export function Card({
  interactive = false,
  title,
  actions,
  children,
  onPress,
}: CardProps) {
  const cls =
    interactive || onPress
      ? `${styles.card} ${styles['card--interactive']}`
      : styles.card;
  return (
    <section
      className={cls}
      onClick={onPress}
      role={onPress ? 'button' : undefined}
    >
      {(title || actions) && (
        <header className={styles.card__header}>
          {title && <div className={styles.card__title}>{title}</div>}
          {actions && <div className={styles.card__actions}>{actions}</div>}
        </header>
      )}
      <div className={styles.card__content}>{children}</div>
    </section>
  );
}
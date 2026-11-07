/**
 * C-02 Card（design.md 2.3.2，v2.0.0 iOS 风升级）
 * radius-lg 16px、bg-surface、多层柔和阴影、内边距 space-4；
 * interactive 按压缩放反馈（scale 0.98 + 120ms）；
 * insetDivider 注入子 ListRow 左缩进分隔线 + 末行隐藏。
 */
import type { ReactNode } from 'react';
import { Children, isValidElement, cloneElement } from 'react';
import styles from './style.module.css';
import { ListRow } from '../ListRow';

export interface CardProps {
  interactive?: boolean;
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  onPress?: () => void;
  insetDivider?: boolean;
}

export function Card({
  interactive = false,
  title,
  actions,
  children,
  onPress,
  insetDivider = false,
}: CardProps) {
  const cls =
    interactive || onPress
      ? `${styles.card} ${styles['card--interactive']}`
      : styles.card;

  const processedChildren = insetDivider
    ? Children.map(children, (child, index) => {
        if (!isValidElement(child)) return child;
        const isLast = index === Children.count(children) - 1;
        if (child.type === ListRow) {
          return cloneElement(child, {
            dividerInset: true,
            hideDivider: isLast,
          });
        }
        return child;
      })
    : children;

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
      <div className={styles.card__content}>{processedChildren}</div>
    </section>
  );
}
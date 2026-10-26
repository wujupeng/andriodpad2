/**
 * C-03 ListRow（design.md 2.3.2）
 * 三段布局（40×40 图标区 + title/subtitle 两行 + trailing 辅助区）；
 * 选中态：brand-50 背景 + 左缘 3px brand-500 条；多选态：图标区换 24px 复选框。
 * 行高基准 64px（虚拟化固定行高依据），字体缩放防破版用 min-height。
 */
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import styles from './style.module.css';

export interface ListRowProps {
  icon?: ReactNode;
  /** 字符串或富内容（如搜索高亮 <mark>，TASK-S4-03 FileRow） */
  title: ReactNode;
  subtitle?: string;
  trailing?: ReactNode;
  selected?: boolean;
  selectionMode?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}

export function ListRow({
  icon,
  title,
  subtitle,
  trailing,
  selected = false,
  selectionMode = false,
  onPress,
  onLongPress,
}: ListRowProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !onLongPress) return;
    let timer: number | undefined;
    const start = () => {
      timer = window.setTimeout(() => {
        timer = undefined;
        onLongPress();
      }, 500);
    };
    const cancel = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('pointermove', cancel, { passive: true });
    return () => {
      cancel();
      el.removeEventListener('pointerdown', start);
      el.removeEventListener('pointerup', cancel);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('pointermove', cancel);
    };
  }, [onLongPress]);

  const cls = [
    styles.row,
    selected ? styles['row--selected'] : '',
    onPress ? styles['row--pressable'] : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={rootRef}
      className={cls}
      onClick={onPress}
      role={onPress ? 'button' : undefined}
    >
      <div className={styles.row__icon}>
        {selectionMode ? (
          <span
            className={`${styles.row__check} ${selected ? styles['row__check--on'] : ''}`}
            aria-hidden
          />
        ) : (
          icon
        )}
      </div>
      <div className={styles.row__texts}>
        <span className={styles.row__title}>{title}</span>
        {subtitle && <span className={styles.row__subtitle}>{subtitle}</span>}
      </div>
      {trailing && <div className={styles.row__trailing}>{trailing}</div>}
    </div>
  );
}

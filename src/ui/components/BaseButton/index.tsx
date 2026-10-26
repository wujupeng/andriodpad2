/**
 * C-01 BaseButton（design.md 2.3.2）
 * 4 变体 × 3 尺寸 × 4 状态；全部满足 48px 触控目标（sm 仅行内次要操作）。
 * loading 态：Spinner 替换图标位 + 禁点 + 保留文案。
 */
import type { ReactNode } from 'react';
import { Spinner } from '../../components/Spinner';
import styles from './style.module.css';

export interface BaseButtonProps {
  variant?: 'primary' | 'secondary' | 'text' | 'danger';
  size?: 'lg' | 'md' | 'sm';
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  onPress?: () => void;
}

export function BaseButton({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  children,
  onPress,
}: BaseButtonProps) {
  const cls = [
    styles.button,
    styles[`button--${variant}`],
    styles[`button--${size}`],
    loading ? styles['button--loading'] : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={cls}
      disabled={disabled || loading}
      onClick={onPress}
    >
      <span className={styles.button__icon}>
        {loading ? <Spinner size={size === 'sm' ? 18 : 20} /> : icon}
      </span>
      <span className={styles.button__label}>{children}</span>
    </button>
  );
}
/**
 * C-04 StatusBadge（design.md 2.3.2 + 2.5.1）
 * 高 28px、radius-full、语义浅底 + 深语义字 + 16px 填充状态图标 + caption semibold。
 * 安全约束：只接受 semantic + IconName，不接受裸色值/裸 SVG；
 * Spinner（loading 图标）与 success/danger 语义组合经类型联合约束为非法（编译期拦截）。
 * 状态指示器切换 0ms——DOM 无 transition（spec 4.1-3）。
 */
import { Icon } from '../../icons/Icon';
import type { SemanticIconPair } from '../../tokens/tokens';
import styles from './style.module.css';

export type StatusBadgeProps = SemanticIconPair & {
  label: string;
};

export function StatusBadge({ semantic, icon, label }: StatusBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[`badge--${semantic}`]}`}>
      <Icon name={icon} size={16} />
      <span className={styles.badge__label}>{label}</span>
    </span>
  );
}
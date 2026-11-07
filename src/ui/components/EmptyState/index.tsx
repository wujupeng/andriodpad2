/**
 * C-10 EmptyState（design.md 2.3.2，v2.0.0 iOS 风升级）
 * 垂直居中：图标（默认 80px）+ 标题 + 描述 + 可选操作按钮；上下留白 space-8。
 * v2.0.0 新增 iconSize prop（默认 80px），消费方可覆盖。
 */
import { Icon } from '../../icons/Icon';
import type { IconName } from '../../icons/registry';
import { BaseButton } from '../BaseButton';
import styles from './style.module.css';

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void };
  iconSize?: number;
}

export function EmptyState({ icon, title, description, action, iconSize = 80 }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <div className={styles.empty__icon}>
        <Icon name={icon} size={iconSize} />
      </div>
      <div className={styles.empty__title}>{title}</div>
      {description && (
        <div className={styles.empty__description}>{description}</div>
      )}
      {action && (
        <div className={styles.empty__action}>
          <BaseButton variant="secondary" size="md" onPress={action.onPress}>
            {action.label}
          </BaseButton>
        </div>
      )}
    </div>
  );
}
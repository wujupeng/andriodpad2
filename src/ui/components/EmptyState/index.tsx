/**
 * C-10 EmptyState（design.md 2.3.2）
 * 垂直居中：64px 线性图标 + 标题 + 描述 + 可选操作按钮；上下留白 space-8。
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
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <Icon name={icon} size={64} />
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
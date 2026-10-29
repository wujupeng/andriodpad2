/**
 * C-05 StatusBanner（design.md 2.3.2 + 2.5.2）
 * 全宽横幅、min-height 48px、左缘 4px 语义色条 + 20px 填充图标 + 标题 + 描述 + 操作按钮区。
 * 安全约束（spec 5.7.1-R5、spec 5.7.3 异常 2）：
 * danger/warning 类不提供任何自动消失行为——组件无 setTimeout/TTL，
 * 移除条件由父级 store 持久性策略控制。
 * 状态指示器（色块+图标）切换 0ms；仅入场动画允许 200ms（不阻塞首帧内容）。
 */
import { Icon } from '../../icons/Icon';
import type { IconName } from '../../icons/registry';
import type { Semantic } from '../../tokens/tokens';
import styles from './style.module.css';

export interface BannerAction {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'text';
  dataAttrs?: Record<string, string | boolean>;
}

export interface StatusBannerProps {
  semantic: Semantic;
  icon: IconName;
  title: string;
  description?: string;
  actions?: BannerAction[];
  rootDataAttrs?: Record<string, string | boolean>;
}

export function StatusBanner({
  semantic,
  icon,
  title,
  description,
  actions,
  rootDataAttrs,
}: StatusBannerProps) {
  const visibleActions = actions?.slice(0, 2) ?? [];
  return (
    <section
      className={`${styles.banner} ${styles[`banner--${semantic}`]}`}
      role="status"
      {...(rootDataAttrs ?? {})}
    >
      <span className={styles.banner__bar} aria-hidden />
      <Icon name={icon} size={20} />
      <div className={styles.banner__texts}>
        <span className={styles.banner__title}>{title}</span>
        {description && (
          <span className={styles.banner__description}>{description}</span>
        )}
      </div>
      {visibleActions.length > 0 && (
        <div className={styles.banner__actions}>
          {visibleActions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={`${styles.banner__action} ${styles[`banner__action--${action.variant ?? 'text'}`]}`}
              onClick={action.onPress}
              {...(action.dataAttrs ?? {})}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
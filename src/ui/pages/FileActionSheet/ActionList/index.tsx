/**
 * ActionList —— FileActionSheet 操作项列表（design.md 2.4.5，TASK-S4-05）
 * 单文件：打开/编辑/复制/移动/重命名/删除/属性；
 * 批量模式：批量复制/批量移动/批量删除（打开/编辑/重命名/属性隐藏）。
 * 可用性由 useActionAvailability 计算（灰显 + 禁用原因副标题）；
 * danger 项（删除）独立红色呈现（与普通项视觉区分，design.md 2.4.5）。
 */
import { ListRow } from '../../../components/ListRow';
import { Icon } from '../../../icons/Icon';
import type { IconName } from '../../../icons/registry';
import type { ActionAvailabilityMap, FileActionId } from '../useActionAvailability';
import styles from '../style.module.css';

interface MenuItem {
  id: FileActionId;
  icon: IconName;
  title: string;
  subtitle: string;
  danger?: boolean;
}

const SINGLE_ITEMS: MenuItem[] = [
  { id: 'open', icon: 'icon-open', title: '打开', subtitle: '用 WPS/预览打开' },
  { id: 'edit', icon: 'icon-edit', title: '编辑', subtitle: '用 WPS 编辑并回写' },
  { id: 'copy', icon: 'icon-copy', title: '复制', subtitle: '复制到…' },
  { id: 'move', icon: 'icon-move', title: '移动', subtitle: '移动到…' },
  { id: 'rename', icon: 'icon-rename', title: '重命名', subtitle: '重命名' },
  { id: 'delete', icon: 'icon-delete', title: '删除', subtitle: '删除（不可恢复）', danger: true },
  { id: 'info', icon: 'icon-info', title: '属性', subtitle: '大小/时间/路径' },
];

const BATCH_ITEMS: MenuItem[] = [
  { id: 'copy', icon: 'icon-copy', title: '批量复制', subtitle: '复制到…' },
  { id: 'move', icon: 'icon-move', title: '批量移动', subtitle: '移动到…' },
  { id: 'delete', icon: 'icon-delete', title: '批量删除', subtitle: '删除（不可恢复）', danger: true },
];

export interface ActionListProps {
  batch: boolean;
  availability: ActionAvailabilityMap;
  onAction(action: FileActionId): void;
}

export function ActionList({ batch, availability, onAction }: ActionListProps) {
  const items = batch ? BATCH_ITEMS : SINGLE_ITEMS;
  return (
    <div className={styles.actionList} role="menu" aria-label="文件操作">
      {items.map((item) => {
        const state = availability[item.id];
        const disabled = !state.enabled;
        const subtitle = disabled ? (state.reason ?? '暂不可用') : item.subtitle;
        return (
          <div
            key={`${item.id}-${item.title}`}
            className={disabled ? styles.menuItemDisabled : styles.menuItem}
            onClick={disabled ? undefined : () => onAction(item.id)}
            role="menuitem"
            aria-disabled={disabled || undefined}
            aria-label={`${item.title}${disabled ? `（${subtitle}）` : ''}`}
          >
            <ListRow
              icon={
                <span className={item.danger ? styles.dangerIcon : undefined}>
                  <Icon name={item.icon} size={22} />
                </span>
              }
              title={<span className={item.danger ? styles.dangerText : undefined}>{item.title}</span>}
              subtitle={subtitle}
            />
          </div>
        );
      })}
    </div>
  );
}
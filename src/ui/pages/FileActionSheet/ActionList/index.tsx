/**
 * ActionList —— FileActionSheet 操作项列表（design.md 2.4.5，TASK-S4-05，v2.0.0 iOS 风分组）
 * 单文件：打开/复制/移动/重命名/属性 + 删除（危险隔离）；
 * 批量模式：批量复制/批量移动 + 批量删除（危险隔离）。
 * v2.0.0：普通动作组与危险动作组分别 Card 包裹 + insetDivider，iOS 风动作菜单。
 * 可用性由 useActionAvailability 计算（灰显 + 禁用原因副标题）；
 * danger 项独立红色呈现 + 独立 Card 分组（与普通项视觉隔离，design.md 2.4.5）。
 */
import { ListRow } from '../../../components/ListRow';
import { Card } from '../../../components/Card';
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
  { id: 'open', icon: 'icon-open', title: '打开', subtitle: '用 WPS 只读打开' },
  { id: 'copy', icon: 'icon-copy', title: '复制', subtitle: '复制到…' },
  { id: 'move', icon: 'icon-move', title: '移动', subtitle: '移动到…' },
  { id: 'rename', icon: 'icon-rename', title: '重命名', subtitle: '重命名' },
  { id: 'addToDesktop', icon: 'icon-shortcut', title: '添加到桌面', subtitle: '创建桌面快捷方式' },
  { id: 'favorite', icon: 'icon-star', title: '添加为收藏', subtitle: '加入收藏夹' },
  { id: 'info', icon: 'icon-info', title: '属性', subtitle: '大小/时间/路径' },
];

const SINGLE_DANGER_ITEMS: MenuItem[] = [
  { id: 'delete', icon: 'icon-delete', title: '删除', subtitle: '删除（不可恢复）', danger: true },
];

const BATCH_ITEMS: MenuItem[] = [
  { id: 'copy', icon: 'icon-copy', title: '批量复制', subtitle: '复制到…' },
  { id: 'move', icon: 'icon-move', title: '批量移动', subtitle: '移动到…' },
];

const BATCH_DANGER_ITEMS: MenuItem[] = [
  { id: 'delete', icon: 'icon-delete', title: '批量删除', subtitle: '删除（不可恢复）', danger: true },
];

export interface ActionListProps {
  batch: boolean;
  availability: ActionAvailabilityMap;
  onAction(action: FileActionId): void;
}

function ActionGroup({ items, availability, onAction }: {
  items: MenuItem[];
  availability: ActionAvailabilityMap;
  onAction(action: FileActionId): void;
}) {
  return (
    <Card insetDivider>
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
    </Card>
  );
}

export function ActionList({ batch, availability, onAction }: ActionListProps) {
  const normalItems = batch ? BATCH_ITEMS : SINGLE_ITEMS;
  const dangerItems = batch ? BATCH_DANGER_ITEMS : SINGLE_DANGER_ITEMS;
  return (
    <div className={styles.actionList} role="menu" aria-label="文件操作">
      <ActionGroup items={normalItems} availability={availability} onAction={onAction} />
      <ActionGroup items={dangerItems} availability={availability} onAction={onAction} />
    </div>
  );
}
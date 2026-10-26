/**
 * SortMenu —— 排序菜单（design.md 2.4.4，TASK-S4-03）
 * TopBar 入口：icon-sort + 当前排序字段缩写徽章（持久可见，spec 5.4.1-R4）；
 * BottomSheet：四字段（名称/大小/修改时间/类型）+ 升降序切换；
 * 选择即生效（browseStore.setSort），不设确认步骤。
 */
import { useState } from 'react';
import { BaseButton } from '../../../components/BaseButton';
import { BottomSheet } from '../../../components/BottomSheet';
import { ListRow } from '../../../components/ListRow';
import { Icon } from '../../../icons/Icon';
import type { BrowseSort } from '../../../../state/browseStore';
import styles from './style.module.css';

const SORT_FIELDS: Array<{
  field: BrowseSort['field'];
  label: string;
  abbr: string;
}> = [
  { field: 'name', label: '名称', abbr: '名' },
  { field: 'size', label: '大小', abbr: '大' },
  { field: 'lastModified', label: '修改时间', abbr: '时' },
  { field: 'type', label: '类型', abbr: '类' },
];

export interface SortMenuProps {
  sort: BrowseSort;
  onChange(sort: BrowseSort): void;
}

export function SortMenu({ sort, onChange }: SortMenuProps) {
  const [open, setOpen] = useState(false);
  const current = SORT_FIELDS.find((f) => f.field === sort.field) ?? SORT_FIELDS[0];

  const applyField = (field: BrowseSort['field']) => {
    onChange({ field, ascending: sort.ascending });
    setOpen(false);
  };

  const toggleDirection = () => {
    onChange({ ...sort, ascending: !sort.ascending });
  };

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label={`排序：按${current.label}${sort.ascending ? '升序' : '降序'}`}
        onClick={() => setOpen(true)}
      >
        <Icon name="icon-sort" size={20} />
        <span className={styles.abbrBadge}>{current.abbr}</span>
        <span className={styles.directionIndicator} aria-hidden>
          {sort.ascending ? '↑' : '↓'}
        </span>
      </button>
      <BottomSheet title="排序" open={open} onDismiss={() => setOpen(false)}>
        <div className={styles.menuList}>
          {SORT_FIELDS.map((item) => (
            <ListRow
              key={item.field}
              icon={<Icon name="icon-sort" size={22} />}
              title={item.label}
              trailing={
                sort.field === item.field ? (
                  <Icon name="icon-check-circle" size={20} />
                ) : undefined
              }
              selected={sort.field === item.field}
              onPress={() => applyField(item.field)}
            />
          ))}
          <div className={styles.directionRow}>
            <BaseButton
              variant="secondary"
              size="sm"
              onPress={toggleDirection}
              icon={<Icon name="icon-sort" size={16} />}
            >
              {sort.ascending ? '升序 ↑' : '降序 ↓'}
            </BaseButton>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
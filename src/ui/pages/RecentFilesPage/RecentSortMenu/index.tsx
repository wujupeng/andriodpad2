/**
 * RecentSortMenu —— 最近文件排序菜单（TASK-RF-03）。
 * 入口：icon-sort + 当前排序字段缩写徽章 + 升降序指示；
 * BottomSheet：四字段（时间/名称/类型/来源）+ 升降序切换；
 * 选择即生效（onChange），不设确认步骤。
 * 参考 BrowsePage/SortMenu 模式，字段映射 RecentSortField。
 *
 * 追溯：REQ-RF-02/04, DFX-RF-01, 决策 D-RF-02
 */
import { useState } from 'react';
import { BaseButton } from '../../../components/BaseButton';
import { BottomSheet } from '../../../components/BottomSheet';
import { ListRow } from '../../../components/ListRow';
import { Icon } from '../../../icons/Icon';
import type { RecentSortField, RecentSortPrefs } from '../../../../state/recentSortPrefsStore';
import styles from './style.module.css';

const SORT_FIELDS: Array<{
  field: RecentSortField;
  label: string;
  abbr: string;
}> = [
  { field: 'accessedAt', label: '访问时间', abbr: '时' },
  { field: 'name', label: '名称', abbr: '名' },
  { field: 'fileType', label: '类型', abbr: '类' },
  { field: 'source', label: '来源', abbr: '源' },
];

export interface RecentSortMenuProps {
  sort: RecentSortPrefs;
  onChange(sort: RecentSortPrefs): void;
}

export function RecentSortMenu({ sort, onChange }: RecentSortMenuProps) {
  const [open, setOpen] = useState(false);
  const current = SORT_FIELDS.find((f) => f.field === sort.field) ?? SORT_FIELDS[0];

  const applyField = (field: RecentSortField) => {
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
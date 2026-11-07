import styles from './style.module.css';

export type SortField = 'name' | 'size' | 'lastModified' | 'type';

export interface BrowseSort {
  field: SortField;
  ascending: boolean;
}

export interface ColumnHeaderProps {
  sort: BrowseSort;
  onSortChange: (sort: BrowseSort) => void;
}

const COLUMNS: Array<{ field: SortField; label: string; align: 'left' | 'right' }> = [
  { field: 'name', label: '名称', align: 'left' },
  { field: 'lastModified', label: '修改日期', align: 'right' },
  { field: 'size', label: '大小', align: 'right' },
  { field: 'type', label: '种类', align: 'right' },
];

export function ColumnHeader({ sort, onSortChange }: ColumnHeaderProps) {
  return (
    <div className={styles.header} role="row">
      {COLUMNS.map((col) => {
        const isActive = sort.field === col.field;
        const ariaSort = isActive
          ? sort.ascending
            ? 'ascending'
            : 'descending'
          : 'none';
        return (
          <button
            key={col.field}
            type="button"
            role="columnheader"
            aria-sort={ariaSort}
            className={`${styles.cell} ${col.align === 'right' ? styles.cellRight : styles.cellLeft}`}
            onClick={() => {
              if (isActive) {
                onSortChange({ field: sort.field, ascending: !sort.ascending });
              } else {
                onSortChange({ field: col.field, ascending: sort.ascending });
              }
            }}
          >
            <span className={styles.label}>{col.label}</span>
            {isActive && (
              <span className={styles.sortIndicator}>
                {sort.ascending ? '↑' : '↓'}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
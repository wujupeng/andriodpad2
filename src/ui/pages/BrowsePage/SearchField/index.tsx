/**
 * SearchField —— 搜索输入（design.md 2.4.4，TASK-S4-03）
 * icon-search + 圆角输入框；输入即过滤当前目录（browseStore.setSearchQuery，
 * spec 5.4.1-R5）；清空按钮（icon-close，有内容时呈现）。
 */
import { Icon } from '../../../icons/Icon';
import styles from './style.module.css';

export interface SearchFieldProps {
  value: string;
  onChange(query: string): void;
}

export function SearchField({ value, onChange }: SearchFieldProps) {
  return (
    <div className={styles.search}>
      <span className={styles.searchIcon}>
        <Icon name="icon-search" size={18} />
      </span>
      <input
        className={styles.input}
        type="text"
        value={value}
        placeholder="搜索当前目录"
        aria-label="搜索当前目录"
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button
          type="button"
          className={styles.clearButton}
          aria-label="清空搜索"
          onClick={() => onChange('')}
        >
          <Icon name="icon-close" size={16} />
        </button>
      )}
    </div>
  );
}
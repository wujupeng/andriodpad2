/**
 * ViewModeMenu —— 视图模式切换入口（TASK-VM-06）。
 * 参考 SortMenu 模式，BottomSheet 五选项，选择即生效。
 *
 * 追溯：REQ-VM-01/13, 决策 D-VM-05
 */
import { useState } from 'react';
import { BottomSheet } from '../../../components/BottomSheet';
import { ListRow } from '../../../components/ListRow';
import { Icon } from '../../../icons/Icon';
import type { ViewMode } from '../../../../state/uiPrefsStore';
import { VIEW_MODE_OPTIONS, VIEW_MODE_CONFIG } from '../viewModeConfig';
import styles from './style.module.css';

export interface ViewModeMenuProps {
  viewMode: ViewMode;
  onChange(mode: ViewMode): void;
}

export function ViewModeMenu({ viewMode, onChange }: ViewModeMenuProps) {
  const [open, setOpen] = useState(false);
  const current = VIEW_MODE_CONFIG[viewMode];

  const applyMode = (mode: ViewMode) => {
    onChange(mode);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label={`视图：${current.label}`}
        onClick={() => setOpen(true)}
      >
        <Icon name="icon-eye" size={20} />
        <span className={styles.abbrBadge}>{current.abbr}</span>
      </button>
      <BottomSheet title="查看方式" open={open} onDismiss={() => setOpen(false)}>
        <div className={styles.menuList}>
          {VIEW_MODE_OPTIONS.map((item) => (
            <ListRow
              key={item.mode}
              icon={<Icon name="icon-eye" size={22} />}
              title={item.label}
              trailing={
                viewMode === item.mode ? <Icon name="icon-check-circle" size={20} /> : undefined
              }
              selected={viewMode === item.mode}
              onPress={() => applyMode(item.mode)}
            />
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
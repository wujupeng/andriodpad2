/**
 * viewModeConfig —— 视图模式配置常量（TASK-VM-02）。
 * 五种模式：大图标/中图标/小图标/平铺/详细信息。
 * 图标尺寸 64>48>32 严格递减（6.2-1）；列数 4<6<8 严格递增（6.2-2）；行布局图标 24px（6.2-3）。
 *
 * 追溯：REQ-VM-06, 6.2-1/2/3, 决策 D-VM-04
 */
import type { ViewMode } from '../../../state/uiPrefsStore';

export type ViewLayout = 'grid' | 'row';

export interface ViewModeConfigEntry {
  layout: ViewLayout;
  iconSize: number;
  columns: number;
  rowHeight: number;
  abbr: string;
  label: string;
}

export const VIEW_MODE_CONFIG: Readonly<Record<ViewMode, ViewModeConfigEntry>> = {
  largeIcon: { layout: 'grid', iconSize: 64, columns: 4, rowHeight: 112, abbr: '大', label: '大图标' },
  mediumIcon: { layout: 'grid', iconSize: 48, columns: 6, rowHeight: 96, abbr: '中', label: '中图标' },
  smallIcon: { layout: 'grid', iconSize: 32, columns: 8, rowHeight: 80, abbr: '小', label: '小图标' },
  tile: { layout: 'row', iconSize: 24, columns: 0, rowHeight: 64, abbr: '平', label: '平铺' },
  detail: { layout: 'row', iconSize: 24, columns: 0, rowHeight: 64, abbr: '详', label: '详细信息' },
};

export const VIEW_MODE_OPTIONS: ReadonlyArray<{ mode: ViewMode; label: string; abbr: string }> = [
  { mode: 'largeIcon', label: '大图标', abbr: '大' },
  { mode: 'mediumIcon', label: '中图标', abbr: '中' },
  { mode: 'smallIcon', label: '小图标', abbr: '小' },
  { mode: 'tile', label: '平铺', abbr: '平' },
  { mode: 'detail', label: '详细信息', abbr: '详' },
];
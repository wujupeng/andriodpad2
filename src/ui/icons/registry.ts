/**
 * PAD2 图标注册表（design.md 2.3.4）
 * 风格：24×24 viewBox；操作/导航图标线性（stroke 1.5px、round 线帽拐角、currentColor）；
 *       状态图标全部填充型（实心），与线性图标视觉分层，强化"一眼可辨"。
 * 禁止 emoji 图标（spec 5.1.1-R4/R12）。
 */

export type IconName =
  /* 操作（21） */
  | 'icon-open'
  | 'icon-edit'
  | 'icon-copy'
  | 'icon-move'
  | 'icon-rename'
  | 'icon-delete'
  | 'icon-info'
  | 'icon-sort'
  | 'icon-search'
  | 'icon-multiselect'
  | 'icon-select-all'
  | 'icon-upload'
  | 'icon-download'
  | 'icon-settings'
  | 'icon-plus'
  | 'icon-chevron-right'
  | 'icon-arrow-left'
  | 'icon-close'
  | 'icon-eye'
  | 'icon-eye-off'
  | 'icon-more'
  /* 状态（8，填充型） */
  | 'icon-check-circle'
  | 'icon-alert-triangle'
  | 'icon-x-circle'
  | 'icon-info-circle'
  | 'icon-loader'
  | 'icon-cloud-off'
  | 'icon-conflict'
  | 'icon-file-question'
  /* 导航/信息（8） */
  | 'icon-server'
  | 'icon-hard-drive'
  | 'icon-sd-card'
  | 'icon-clock'
  | 'icon-wifi'
  | 'icon-user'
  | 'icon-shield'
  | 'icon-share-smb'
  /* 文件类型（10） */
  | 'icon-folder'
  | 'icon-file-doc'
  | 'icon-file-sheet'
  | 'icon-file-slides'
  | 'icon-file-image'
  | 'icon-file-video'
  | 'icon-file-audio'
  | 'icon-file-archive'
  | 'icon-file-apk'
  | 'icon-file-unknown';

export interface StrokeCircle {
  cx: number;
  cy: number;
  r: number;
}

export interface IconDef {
  /**
   * line：线性（stroke currentColor 1.5px round）
   * fill：填充型（主体 fill currentColor；contrast 描边用 bg-surface 保证双主题可见）
   * themed：主题色特例（folder：brand-50 底 + brand-500 描边）
   */
  variant: 'line' | 'fill' | 'themed';
  /** 主体路径（line: stroke；fill/themed: fill） */
  path?: string;
  /** 线性附加描边路径 */
  strokes?: string[];
  /** 线性附加描边圆 */
  strokeCircles?: StrokeCircle[];
  /** 填充型内部对比色路径（stroke var(--pad2-color-bg-surface)） */
  contrastPaths?: string[];
  /** 填充型内部对比色圆点（stroke round 短点） */
  contrastDots?: { cx: number; cy: number }[];
  /** 填充型附加路径（额外 fill currentColor 主体，如 conflict 的第二个箭头） */
  extraFills?: string[];
  /** 旋转动画标记（仅进行中语义：icon-loader） */
  spin?: boolean;
}

const FILE_OUTLINE = 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z';
const FILE_FOLD = 'M14 2v6h6';

export const iconRegistry: Readonly<Record<IconName, IconDef>> = {
  /* ===== 操作图标（线性）===== */
  'icon-open': {
    variant: 'line',
    path: 'M13 4h6a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6',
    strokes: ['M13 4l7 7', 'M20 4l-8 8', 'M12 12v8'],
  },
  'icon-edit': {
    variant: 'line',
    path: 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z',
  },
  'icon-copy': {
    variant: 'line',
    path: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z',
    strokes: ['M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1'],
  },
  'icon-move': {
    variant: 'line',
    strokes: ['M8 7l-4 5 4 5', 'M4 12h16', 'M16 7l4 5-4 5'],
  },
  'icon-rename': {
    variant: 'line',
    strokes: ['M4 7V5h16v2', 'M12 5v14', 'M9 19h6'],
  },
  'icon-delete': {
    variant: 'line',
    strokes: [
      'M4 7h16',
      'M10 11v6',
      'M14 11v6',
      'M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13',
      'M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3',
    ],
  },
  'icon-info': {
    variant: 'line',
    strokeCircles: [{ cx: 12, cy: 12, r: 9 }],
    strokes: ['M12 11v5', 'M12 8h.01'],
  },
  'icon-sort': {
    variant: 'line',
    strokes: ['M7 4v13', 'M4 14l3 3 3-3', 'M13 6h7', 'M13 12h5', 'M13 18h3'],
  },
  'icon-search': {
    variant: 'line',
    strokeCircles: [{ cx: 11, cy: 11, r: 7 }],
    strokes: ['M21 21l-4.35-4.35'],
  },
  'icon-multiselect': {
    variant: 'line',
    strokes: [
      'M3 5h4v4H3z',
      'M3 15h4v4H3z',
      'M11 7h10',
      'M11 17h10',
      'M4.4 6.2l1.1 1.1 1.9-1.9',
    ],
  },
  'icon-select-all': {
    variant: 'line',
    path: 'M4 4h16v16H4z',
    strokes: ['M8 12l3 3 5-6'],
  },
  'icon-upload': {
    variant: 'line',
    strokes: ['M12 16V4', 'M7 9l5-5 5 5', 'M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3'],
  },
  'icon-download': {
    variant: 'line',
    strokes: ['M12 4v12', 'M7 11l5 5 5-5', 'M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3'],
  },
  'icon-settings': {
    variant: 'line',
    strokeCircles: [{ cx: 12, cy: 12, r: 3 }],
    path: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1',
  },
  'icon-plus': {
    variant: 'line',
    strokes: ['M12 5v14', 'M5 12h14'],
  },
  'icon-chevron-right': {
    variant: 'line',
    strokes: ['M9 6l6 6-6 6'],
  },
  'icon-arrow-left': {
    variant: 'line',
    strokes: ['M19 12H5', 'M12 19l-7-7 7-7'],
  },
  'icon-close': {
    variant: 'line',
    strokes: ['M6 6l12 12', 'M18 6L6 18'],
  },
  'icon-eye': {
    variant: 'line',
    path: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z',
    strokeCircles: [{ cx: 12, cy: 12, r: 3 }],
  },
  'icon-eye-off': {
    variant: 'line',
    strokes: [
      'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94',
      'M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19',
      'M14.12 14.12a3 3 0 1 1-4.24-4.24',
      'M1 1l22 22',
    ],
  },
  'icon-more': {
    variant: 'line',
    strokes: ['M12 6h.01', 'M12 12h.01', 'M12 18h.01'],
  },

  /* ===== 状态图标（填充型；对比色描边用 bg-surface 保证双主题可见）===== */
  'icon-check-circle': {
    variant: 'fill',
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
    contrastPaths: ['M8 12.5l2.5 2.5L16 9.5'],
  },
  'icon-alert-triangle': {
    variant: 'fill',
    path: 'M12 3L1.5 20.25a1 1 0 0 0 .86 1.5h19.28a1 1 0 0 0 .86-1.5L12 3z',
    contrastPaths: ['M12 10v4', 'M12 17.2v.01'],
  },
  'icon-x-circle': {
    variant: 'fill',
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
    contrastPaths: ['M9 9l6 6', 'M15 9l-6 6'],
  },
  'icon-info-circle': {
    variant: 'fill',
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
    contrastPaths: ['M12 11v5', 'M12 8v.01'],
  },
  'icon-loader': {
    variant: 'line',
    strokeCircles: [{ cx: 12, cy: 12, r: 9 }],
    spin: true,
  },
  'icon-cloud-off': {
    variant: 'fill',
    path: 'M6.5 18a4 4 0 0 1-.36-7.98A6 6 0 0 1 17.7 8.6 3.5 3.5 0 0 1 17.5 18h-11z',
    contrastPaths: ['M3 3l18 18'],
  },
  'icon-conflict': {
    variant: 'fill',
    path: 'M2 12l5-4v3h6v2H7v3l-5-4z',
    extraFills: ['M22 12l-5-4v3h-6v2h6v3l5-4z'],
  },
  'icon-file-question': {
    variant: 'fill',
    path: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z',
    contrastPaths: ['M11.5 13.8a2.5 2.5 0 1 1 5 0c0 1.5-2.5 1.8-2.5 3.4', 'M14 20.4v.01'],
  },

  /* ===== 导航/信息图标（线性）===== */
  'icon-server': {
    variant: 'line',
    path: 'M3 4h18v6H3z',
    strokes: ['M3 14h18v6H3z', 'M7 7h.01', 'M7 17h.01'],
  },
  'icon-hard-drive': {
    variant: 'line',
    strokes: [
      'M2 14h20',
      'M4.5 7.5h15a2.5 2.5 0 0 1 2.5 2.5v4H2v-4a2.5 2.5 0 0 1 2.5-2.5z',
      'M6 17h.01',
      'M10 17h.01',
    ],
  },
  'icon-sd-card': {
    variant: 'line',
    path: 'M9 21H6a2 2 0 0 1-2-2V9l5-6h9a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2',
    strokes: ['M12 3v4', 'M15 3v4', 'M12 10v3', 'M12 16v2'],
  },
  'icon-clock': {
    variant: 'line',
    strokeCircles: [{ cx: 12, cy: 12, r: 9 }],
    strokes: ['M12 7v5l3 3'],
  },
  'icon-wifi': {
    variant: 'line',
    strokes: [
      'M2.5 9a15 15 0 0 1 19 0',
      'M5.5 12.5a10.5 10.5 0 0 1 13 0',
      'M8.5 16a6 6 0 0 1 7 0',
      'M12 19.5h.01',
    ],
  },
  'icon-user': {
    variant: 'line',
    strokeCircles: [{ cx: 12, cy: 8, r: 4 }],
    strokes: ['M4 21a8 8 0 0 1 16 0'],
  },
  'icon-shield': {
    variant: 'line',
    path: 'M12 2l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5l8-3z',
    strokes: ['M9 12l2 2 4-4'],
  },
  'icon-share-smb': {
    variant: 'line',
    strokeCircles: [
      { cx: 18, cy: 5, r: 2.5 },
      { cx: 6, cy: 12, r: 2.5 },
      { cx: 18, cy: 19, r: 2.5 },
    ],
    strokes: ['M8.2 10.8l7.6-4.6', 'M8.2 13.2l7.6 4.6'],
  },

  /* ===== 文件类型图标 ===== */
  'icon-folder': {
    variant: 'themed',
    path: 'M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z',
  },
  'icon-file-doc': {
    variant: 'line',
    path: FILE_OUTLINE,
    strokes: [FILE_FOLD, 'M9 13h6', 'M9 17h6', 'M9 9.5h2'],
  },
  'icon-file-sheet': {
    variant: 'line',
    path: FILE_OUTLINE,
    strokes: [FILE_FOLD, 'M8 11.5h8v6H8z', 'M12 11.5v6', 'M8 14.5h8'],
  },
  'icon-file-slides': {
    variant: 'line',
    path: FILE_OUTLINE,
    strokes: [FILE_FOLD, 'M10 12l4.5 2.5-4.5 2.5v-5z', 'M9 19h6'],
  },
  'icon-file-image': {
    variant: 'line',
    path: FILE_OUTLINE,
    strokes: [FILE_FOLD, 'M8.5 17l2.8-3.5 2 2.4 1.7-2.1 2 3.2H8.5z', 'M14.5 9.5h.01'],
  },
  'icon-file-video': {
    variant: 'line',
    path: FILE_OUTLINE,
    strokes: [FILE_FOLD, 'M10 11.5l4.5 2.5-4.5 2.5v-5z'],
  },
  'icon-file-audio': {
    variant: 'line',
    strokeCircles: [{ cx: 10.5, cy: 16.5, r: 2 }],
    strokes: [FILE_FOLD, 'M12.5 16.5V8l5 1.2v3.3', 'M17.5 12.5c1 .8 1 2.4 0 3.2'],
  },
  'icon-file-archive': {
    variant: 'line',
    path: FILE_OUTLINE,
    strokes: [FILE_FOLD, 'M10.5 7h3', 'M10.5 10.5h3', 'M10.5 14h3', 'M10.5 17.5h3'],
  },
  'icon-file-apk': {
    variant: 'line',
    path: FILE_OUTLINE,
    strokes: [
      FILE_FOLD,
      'M9.5 14.5a2.5 3 0 0 1 5 0v2.5h-5v-2.5z',
      'M10 12.5l-1-1.5',
      'M14 12.5l1-1.5',
      'M10.8 15.8h.01',
      'M13.2 15.8h.01',
    ],
  },
  'icon-file-unknown': {
    variant: 'line',
    path: FILE_OUTLINE,
    strokes: [FILE_FOLD, 'M11.5 14a2.5 2.5 0 1 1 5 0c0 1.5-2.5 1.8-2.5 3.4', 'M14 20.4h.01'],
  },
};

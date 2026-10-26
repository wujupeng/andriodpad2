/**
 * C-12 Breadcrumb（design.md 2.3.2）
 * 根段（共享名+服务器图标）+ 子段（chevron 分隔）+ 当前段（semibold）；
 * 每段 48px 触控目标；超长中段折叠为"…"（点击展开）；点击祖先段跳转。
 */
import { useState } from 'react';
import { Icon } from '../../icons/Icon';
import styles from './style.module.css';

export interface BreadcrumbSegment {
  name: string;
  path: string;
}

export interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
  onNavigate: (path: string) => void;
}

/** 折叠阈值：中段超过该数量时折叠为"…" */
const COLLAPSE_THRESHOLD = 4;

export function Breadcrumb({ segments, onNavigate }: BreadcrumbProps) {
  const [expanded, setExpanded] = useState(false);
  if (segments.length === 0) return null;

  const middle = segments.slice(1, -1);
  const shouldCollapse = !expanded && middle.length > COLLAPSE_THRESHOLD;
  const visibleMiddle = shouldCollapse ? [middle[0], middle[middle.length - 1]] : middle;
  const collapsedCount = middle.length - visibleMiddle.length;

  return (
    <nav className={styles.breadcrumb} aria-label="路径导航">
      <button
        type="button"
        className={`${styles.breadcrumb__segment} ${styles.breadcrumb__root}`}
        onClick={() => onNavigate(segments[0].path)}
      >
        <Icon name="icon-server" size={16} />
        <span className={styles['breadcrumb__segment-name']}>
          {segments[0].name}
        </span>
      </button>
      {visibleMiddle.map((segment, index) => (
        <span className={styles.breadcrumb__group} key={segment.path}>
          {index === 0 && collapsedCount > 0 ? (
            <>
              <Icon name="icon-chevron-right" size={14} className={styles.breadcrumb__sep} />
              <button
                type="button"
                className={`${styles.breadcrumb__segment} ${styles.breadcrumb__ellipsis}`}
                onClick={() => setExpanded(true)}
                title="展开完整路径"
              >
                …
              </button>
            </>
          ) : null}
          <Icon name="icon-chevron-right" size={14} className={styles.breadcrumb__sep} />
          <button
            type="button"
            className={styles.breadcrumb__segment}
            onClick={() => onNavigate(segment.path)}
          >
            <span className={styles['breadcrumb__segment-name']}>
              {segment.name}
            </span>
          </button>
        </span>
      ))}
      {segments.length > 1 && (
        <span className={styles.breadcrumb__group}>
          <Icon name="icon-chevron-right" size={14} className={styles.breadcrumb__sep} />
          <span className={styles.breadcrumb__current}>
            <span className={styles['breadcrumb__segment-name']}>
              {segments[segments.length - 1].name}
            </span>
          </span>
        </span>
      )}
    </nav>
  );
}
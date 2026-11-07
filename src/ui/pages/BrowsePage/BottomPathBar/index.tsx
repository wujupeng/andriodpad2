import { useState } from 'react';
import { Icon } from '../../../icons/Icon';
import type { BreadcrumbSegment } from '../../../components/Breadcrumb';
import styles from './style.module.css';

export interface BottomPathBarProps {
  segments: BreadcrumbSegment[];
  onNavigate: (path: string) => void;
}

const COLLAPSE_THRESHOLD = 4;

export function BottomPathBar({ segments, onNavigate }: BottomPathBarProps) {
  const [expanded, setExpanded] = useState(false);
  if (segments.length === 0) return null;

  const middle = segments.slice(1, -1);
  const shouldCollapse = !expanded && middle.length > COLLAPSE_THRESHOLD;
  const visibleMiddle = shouldCollapse ? [middle[0], middle[middle.length - 1]] : middle;
  const collapsedCount = middle.length - visibleMiddle.length;

  return (
    <nav className={styles.bar} aria-label="当前路径">
      <button
        type="button"
        className={styles.segment}
        onClick={() => onNavigate(segments[0].path)}
      >
        <Icon name="icon-server" size={14} />
        <span className={styles.segmentName}>{segments[0].name}</span>
      </button>
      {visibleMiddle.map((segment, index) => (
        <span className={styles.group} key={segment.path}>
          {index === 0 && collapsedCount > 0 ? (
            <>
              <Icon name="icon-chevron-right" size={12} className={styles.sep} />
              <button
                type="button"
                className={`${styles.segment} ${styles.ellipsis}`}
                onClick={() => setExpanded(true)}
                title="展开完整路径"
              >
                …
              </button>
            </>
          ) : null}
          <Icon name="icon-chevron-right" size={12} className={styles.sep} />
          <button
            type="button"
            className={styles.segment}
            onClick={() => onNavigate(segment.path)}
          >
            <span className={styles.segmentName}>{segment.name}</span>
          </button>
        </span>
      ))}
      {segments.length > 1 && (
        <span className={styles.group}>
          <Icon name="icon-chevron-right" size={12} className={styles.sep} />
          <span className={styles.current}>
            <span className={styles.segmentName}>
              {segments[segments.length - 1].name}
            </span>
          </span>
        </span>
      )}
    </nav>
  );
}
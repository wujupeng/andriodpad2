/**
 * C-11 SkeletonList（design.md 2.3.2）
 * N 行 64px 灰块 + 1.2s shimmer；目录加载中呈现，替代空白与旧数据（spec 5.4.1-R8）。
 */
import styles from './style.module.css';

export interface SkeletonListProps {
  rows?: number;
}

export function SkeletonList({ rows = 8 }: SkeletonListProps) {
  return (
    <div className={styles.skeleton} aria-busy="true" aria-label="加载中">
      {Array.from({ length: rows }, (_, i) => (
        <div className={styles.skeleton__row} key={i}>
          <div className={styles.skeleton__icon} />
          <div className={styles.skeleton__lines}>
            <div className={`${styles.skeleton__line} ${styles['skeleton__line--title']}`} />
            <div className={`${styles.skeleton__line} ${styles['skeleton__line--subtitle']}`} />
          </div>
        </div>
      ))}
    </div>
  );
}
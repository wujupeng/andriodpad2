/**
 * C-06 ProgressBar（design.md 2.3.2）
 * 确定态：8px 轨道 + 填充 + 百分比文案；不确定态：1.2s 动画条纹 + "处理中"。
 * 安全约束（design.md 2.5.3）：进度推进 width 120ms；
 * 进度回退（重试场景）立即跳变，不做回退动画。
 * 批量场景支持整体/单文件双行展示。
 */
import styles from './style.module.css';
export interface ProgressBarProps {
  /** 0-100；缺省为不确定态 */
  value?: number;
  semantic?: 'brand' | 'success' | 'warning' | 'danger';
  /** 整体标题（批量场景第一行） */
  label?: string;
  /** 单文件/副标题（批量场景第二行） */
  sublabel?: string;
}

export function ProgressBar({
  value,
  semantic = 'brand',
  label,
  sublabel,
}: ProgressBarProps) {
  const determined = typeof value === 'number' && Number.isFinite(value);
  const clamped = determined ? Math.min(100, Math.max(0, value!)) : 0;

  return (
    <div className={styles.progress}>
      {(label || determined) && (
        <div className={styles.progress__labels}>
          {label && <span className={styles.progress__label}>{label}</span>}
          {determined && (
            <span className={styles.progress__percent}>{Math.round(clamped)}%</span>
          )}
          {!determined && label && (
            <span className={styles.progress__percent}>处理中</span>
          )}
        </div>
      )}
      <div
        className={[styles.progress__track, styles[`progress__track--${semantic}`]]
          .filter(Boolean)
          .join(' ')}
        role="progressbar"
        aria-valuenow={determined ? Math.round(clamped) : undefined}
        aria-valuemin={determined ? 0 : undefined}
        aria-valuemax={determined ? 100 : undefined}
      >
        {determined ? (
          <div className={styles.progress__fill} style={{ width: `${clamped}%` }} />
        ) : (
          <div className={styles.progress__stripes} />
        )}
      </div>
      {sublabel && <div className={styles.progress__sublabel}>{sublabel}</div>}
    </div>
  );
}
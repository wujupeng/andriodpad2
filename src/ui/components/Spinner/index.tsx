/**
 * C-07 Spinner（v2.0.0 CSS 细线旋转）
 * 2px 线宽圆环旋转 1000ms/圈，颜色 currentColor 继承；
 * 仅用于"进行中"语义，禁止与 success/danger 图标混用位置（spec 5.7.1-R7）。
 */
import styles from './style.module.css';

export interface SpinnerProps {
  size?: number;
}

export function Spinner({ size = 24 }: SpinnerProps) {
  return (
    <span
      className={styles.spinner}
      style={{ width: size, height: size }}
      aria-label="加载中"
      role="status"
    />
  );
}
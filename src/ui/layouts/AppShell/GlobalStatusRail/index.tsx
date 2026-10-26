/**
 * GlobalStatusRail 全局状态栏容器占位（design.md 2.4.1、TASK-S2-03）
 * 渲染于 Shell 层 TopBar 之上、z-rail 最高层级——任何遮罩不可覆盖（安全语义
 * 不丢失的结构性保证，spec 4.2.2）。
 * 本任务仅建容器：位置 + 层级 + 常驻挂载（页面切换不清空重挂）；
 * 安全语义内容与多源仲裁逻辑填充于 TASK-S5-05。
 */
import styles from './style.module.css';

export function GlobalStatusRail() {
  return <div className={styles.rail} role="region" aria-label="全局状态" />;
}
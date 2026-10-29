/**
 * ReadOnlyNotice —— 只读模式标注组件（AU-005，R-NOTICE-01、R-FAS-06）。
 * badge 形态：小徽章（复用 StatusBadge warning 语义）；
 * banner 形态：横幅提示（复用设计令牌 warning 色）。
 * 零新增 npm 依赖（仅用既有 React + StatusBadge + tokens）。
 */
import { StatusBadge } from '../StatusBadge';
import { READ_ONLY_NOTICES } from '../../../state/readOnlyMode';
import styles from './style.module.css';

export interface ReadOnlyNoticeProps {
  variant?: 'badge' | 'banner';
}

export function ReadOnlyNotice({ variant = 'badge' }: ReadOnlyNoticeProps) {
  const label = READ_ONLY_NOTICES.menuBadge;
  if (variant === 'banner') {
    return (
      <div className={styles.banner} role="status" aria-label={label}>
        {label}：{READ_ONLY_NOTICES.editReturnNotice}
      </div>
    );
  }
  return <StatusBadge semantic="warning" icon="icon-conflict" label={label} />;
}
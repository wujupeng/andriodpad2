/**
 * QuickActionsRow 快速操作行（design.md 2.4.2、TASK-S2-04）
 * 三入口：添加 SMB 连接 / 打开本地存储 / 最近文件（spec 5.2.1-R6）。
 */
import { BaseButton } from '../../../components/BaseButton';
import { Icon } from '../../../icons/Icon';
import { useNavigationStore } from '../../../../state/navigationStore';
import styles from './style.module.css';

export function QuickActionsRow() {
  const push = useNavigationStore((s) => s.push);

  return (
    <section className={styles.row} aria-label="快速操作">
      <BaseButton
        variant="secondary"
        size="md"
        icon={<Icon name="icon-plus" size={20} />}
        onPress={() => push('connection')}
      >
        添加 SMB 连接
      </BaseButton>
      <BaseButton
        variant="secondary"
        size="md"
        icon={<Icon name="icon-hard-drive" size={20} />}
        onPress={() => push('browse-local')}
      >
        打开本地存储
      </BaseButton>
      <BaseButton
        variant="secondary"
        size="md"
        icon={<Icon name="icon-clock" size={20} />}
        onPress={() => push('recent')}
      >
        最近文件
      </BaseButton>
    </section>
  );
}
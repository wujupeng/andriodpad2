/**
 * 设置页（TASK-S2-05 最小形态）
 * 当前承载"开发者选项"分区：M2 技术验证入口——产品界面不暴露验证工具
 * （tasks.md TASK-S2-05 验收 4：M2 页入口仅存在于开发者选项）。
 * 其余设置项在后续阶段按需扩展。
 */
import { Card } from '../../components/Card';
import { ListRow } from '../../components/ListRow';
import { Icon } from '../../icons/Icon';
import { useNavigationStore } from '../../../state/navigationStore';
import styles from './style.module.css';

export function SettingsPage() {
  const push = useNavigationStore((s) => s.push);

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h2 className={styles.section__title}>开发者选项</h2>
        <Card>
          <ListRow
            icon={<Icon name="icon-shield" size={24} />}
            title="M2 技术验证"
            subtitle="SMB 连接 / 浏览 / WPS 编辑回写 V1-V7 门禁验证（开发者工具）"
            trailing={<Icon name="icon-chevron-right" size={20} />}
            onPress={() => push('m2-verification')}
          />
        </Card>
      </section>
    </div>
  );
}
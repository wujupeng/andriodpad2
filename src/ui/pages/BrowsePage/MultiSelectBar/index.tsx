/**
 * MultiSelectBar —— 多选模式条（design.md 2.4.4，TASK-S4-03）
 * 多选态底部固定条：已选数量 + 批量操作（复制/移动/删除 → FileActionSheet
 * 批量模式）+ 取消（退出多选保留列表与滚动位置，spec 5.4.1-R6）。
 * AU-005 只读模式：batchOperationsEnabled 经 OPERATION_CAPABILITIES 判定（已 false→灰显）；
 * 多选模式本身保留（R-KEEP-06）；取消按钮始终可用。非多选态不渲染。
 */
import { BaseButton } from '../../../components/BaseButton';
import { Icon } from '../../../icons/Icon';
import styles from './style.module.css';

export interface MultiSelectBarProps {
  selectedCount: number;
  /** 批量操作接线就绪（S4-04 operationStore + S4-05 FileActionSheet）前禁用 */
  batchOperationsEnabled: boolean;
  onCancel(): void;
  onBatchAction(action: 'copy' | 'move' | 'delete'): void;
}

export function MultiSelectBar({
  selectedCount,
  batchOperationsEnabled,
  onCancel,
  onBatchAction,
}: MultiSelectBarProps) {

  return (
    <footer className={styles.bar} role="toolbar" aria-label="批量操作">
      <span className={styles.count}>
        <Icon name="icon-multiselect" size={18} />
        已选 {selectedCount} 项
      </span>
      <div className={styles.actions}>
        <BaseButton
          variant="secondary"
          size="sm"
          disabled={!batchOperationsEnabled}
          icon={<Icon name="icon-copy" size={16} />}
          onPress={() => onBatchAction('copy')}
        >
          复制
        </BaseButton>
        <BaseButton
          variant="secondary"
          size="sm"
          disabled={!batchOperationsEnabled}
          icon={<Icon name="icon-move" size={16} />}
          onPress={() => onBatchAction('move')}
        >
          移动
        </BaseButton>
        <BaseButton
          variant="danger"
          size="sm"
          disabled={!batchOperationsEnabled}
          icon={<Icon name="icon-delete" size={16} />}
          onPress={() => onBatchAction('delete')}
        >
          删除
        </BaseButton>
        <BaseButton variant="text" size="sm" onPress={onCancel}>
          取消
        </BaseButton>
      </div>
    </footer>
  );
}
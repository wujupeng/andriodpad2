/**
 * 写回不可用告知 Banner（TASK-WB-04）。
 *
 * 消费 editSessionStore 的 writeback_unavailable 态，
 * 呈现"本地修改不会写回服务器（原因：{lastError.userMessage}）"明确告知。
 * 不显示任何成功语义（DFX-WB-04）。
 */
import { BaseButton } from '../BaseButton';
import { Icon } from '../../icons/Icon';
import { useEditSessionStore } from '../../../state/editSessionStore';
import styles from './style.module.css';

export function WritebackUnavailableBanner() {
  const sessionState = useEditSessionStore((s) => s.state);
  const lastError = useEditSessionStore((s) => s.lastError);

  if (sessionState !== 'writeback_unavailable') return null;

  const reason = lastError?.userMessage ?? '写回功能未启用';

  return (
    <div className={styles.banner} role="alert" aria-label="写回不可用告知">
      <span className={styles.icon}>
        <Icon name="icon-conflict" size={20} />
      </span>
      <div className={styles.content}>
        <p className={styles.title}>本地修改不会写回服务器</p>
        <p className={styles.reason}>原因：{reason}</p>
      </div>
      <BaseButton
        variant="text"
        size="sm"
        onPress={() => {
          // 用户确认后回到 editing 态等待后续操作
          useEditSessionStore.setState({ state: 'editing' });
        }}
      >
        知道了
      </BaseButton>
    </div>
  );
}
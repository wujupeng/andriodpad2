/**
 * disconnectAndUnpin 编排函数（persistent_connection TASK-PC-02-02）。
 *
 * 用户主动离线编排：物理断开 + 解除固定持久化。
 * - 物理断开失败不阻塞本地状态清理与 pinned 解除（DFX-PC-04）
 * - autoConnect 字段零变更（REQ-CO-02）
 * - UI 层经本函数中转，不直接 import SmbPlugin（HC-04）
 *
 * 追溯：REQ-PN-04, DFX-PC-03/04, REQ-CO-02, D-PC-03
 */
import { useSmbMultiConnStore } from '../../state/smbMultiConnStore';
import { useSmbProfilesStore } from '../../state/smbProfilesStore';

export async function disconnectAndUnpin(profileId: string): Promise<void> {
  try {
    await useSmbMultiConnStore.getState().disconnect(profileId);
  } catch {
    // 物理断开失败不阻塞本地状态清理与 pinned 解除（DFX-PC-04）
  }
  await useSmbProfilesStore.getState().markPinned(profileId, false);
}
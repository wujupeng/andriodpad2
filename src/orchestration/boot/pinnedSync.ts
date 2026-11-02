/**
 * pinnedSync 订阅模块（persistent_connection TASK-PC-02-01）。
 *
 * 订阅 smbMultiConnStore.handles 变化，连接成功时异步标记 pinned=true。
 * - 不阻塞连接成功的 UI 反馈（DFX-PC-01）
 * - 幂等：pinned 已为 true 时跳过（D-PC-06）
 * - smbMultiConnStore 零变更（D-PC-02）
 *
 * 追溯：REQ-PN-01, DFX-PC-01/06, D-PC-02/06
 */
import { useSmbMultiConnStore } from '../../state/smbMultiConnStore';
import { useSmbProfilesStore } from '../../state/smbProfilesStore';

export function startPinnedSync(): () => void {
  const prevConnected = new Set<string>();

  const unsubscribe = useSmbMultiConnStore.subscribe((state) => {
    for (const handle of state.handles.values()) {
      if (handle.state === 'connected' && !prevConnected.has(handle.profileId)) {
        prevConnected.add(handle.profileId);
        const profile = useSmbProfilesStore.getState().profiles.find((p) => p.id === handle.profileId);
        if (!profile) continue;
        if (profile.pinned === true) continue;
        void useSmbProfilesStore.getState().markPinned(handle.profileId, true);
      }
      if (handle.state !== 'connected') {
        prevConnected.delete(handle.profileId);
      }
    }
  });

  return unsubscribe;
}
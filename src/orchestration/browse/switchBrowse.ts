/**
 * 切换浏览编排：联动 activeProfileId + 导航（TASK-SW-02）。
 *
 * switchBrowse(profileId) 由 SideNav.openProfile 和 MultiSmbCards.onBrowse 调用：
 * - 同步设置 browseContextStore.activeProfileId + smbConnectionStore.activeProfileId
 * - 复用缓存上下文立即呈现（<500ms，DFX-SW-01）
 * - 物理会话热切换由 BrowsePage enterDirectory 触发 switchHotTo（后台异步）
 *
 * 追溯：REQ-SW-01/02/03/05, DFX-SW-01, 决策 D-SW-01
 */
import { useSmbMultiConnStore } from '../../state/smbMultiConnStore';
import { useBrowseContextStore } from '../../state/browseContextStore';
import { useSmbConnectionStore } from '../../state/smbConnectionStore';
import { useNavigationStore } from '../../state/navigationStore';

/**
 * 切换浏览到指定 profile。
 * - 已连接：联动 activeProfileId + 导航到 browse
 * - 未连接：导航到 connection 页（REQ-SW-05）
 */
export function switchBrowse(profileId: string): void {
  const handle = useSmbMultiConnStore.getState().getHandle(profileId);

  if (!handle || handle.state !== 'connected') {
    useNavigationStore.getState().push('connection');
    return;
  }

  // 同步设置双 store activeProfileId + 连接状态（联动一致性）
  // smbConnectionStore.state 须与 smbMultiConnStore handle 同步，
  // 否则 BrowsePage 挂载 effect 不触发 refresh() → 目录空态
  useBrowseContextStore.getState().setActiveProfile(profileId);
  useSmbConnectionStore.setState({ activeProfileId: profileId, state: 'connected', lastError: null });

  // 导航到浏览页
  useNavigationStore.getState().push('browse');
}
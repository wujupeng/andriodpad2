/**
 * 启动编排：冷加载 profiles + 自动重连（TASK-CP-02）。
 *
 * initBootProfiles() 由 main.tsx 调用（HC-03 限 3 行内）：
 * - 异步加载持久化 profiles 到内存（REQ-CP-01）
 * - 加载完成后异步触发自动重连编排（不阻塞，REQ-CP-05）
 *
 * 追溯：REQ-CP-01/04/05/06/07, DFX-CP-01~07, 决策 D-CP-01/D-CP-03
 */
import { useSmbProfilesStore, getPasswordSemantics } from '../../state/smbProfilesStore';
import { useSmbMultiConnStore } from '../../state/smbMultiConnStore';
import { decryptPassword } from '../../utils/crypto';
import type { SmbConnectOptions } from '../../adapter/smb/SmbPlugin';
import { startPinnedSync } from './pinnedSync';

/**
 * 启动入口：加载 profiles + 触发自动重连（不阻塞，REQ-CP-02/05）。
 * 由 main.tsx 以 `void initBootProfiles()` 调用。
 */
export function initBootProfiles(): void {
  void (async () => {
    try {
      await useSmbProfilesStore.getState().load();
    } catch {
      // 加载失败不崩溃（DFX-CP-03），profiles 保持空列表
    }
    startPinnedSync();
    void orchestrateAutoReconnect();
  })();
}

/**
 * 自动重连编排：筛选 autoConnect=true 的 profile，按凭据三态处理。
 */
async function orchestrateAutoReconnect(): Promise<void> {
  const profiles = useSmbProfilesStore.getState().profiles;
  const autoConnectProfiles = profiles.filter((p) => p.pinned === true || p.autoConnect === true);

  for (const profile of autoConnectProfiles) {
    const semantics = getPasswordSemantics(profile);

    let password: string | undefined;

    if (semantics === 'remembered') {
      if (profile.passwordEncrypted) {
        const decrypted = await decryptPassword(profile.passwordEncrypted);
        if (decrypted === null) {
          // 解密失败：跳过，handle 标记 connect_failed（REQ-CP-04）
          useSmbMultiConnStore.setState((s) => {
            const next = new Map(s.handles);
            next.set(profile.id, {
              ...next.get(profile.id)!,
              profileId: profile.id,
              state: 'connect_failed',
              lastError: { category: 'unknown', userMessage: '密码无法解密，请重新输入' },
            });
            return { handles: next };
          });
          continue;
        }
        password = decrypted;
      }
    } else if (semantics === 'empty_credential') {
      password = '';
    } else {
      // unset：跳过，不发起 connect（DFX-CP-05）
      continue;
    }

    const options: SmbConnectOptions = {
      host: profile.host,
      share: profile.share,
      username: profile.username,
      password,
      domain: profile.domain,
    };

    // 复用既有 connect（含 MAX_CONCURRENT 上限校验，REQ-CP-06）
    // 单个失败不阻塞其他（REQ-CP-07）
    void useSmbMultiConnStore.getState().connect(profile.id, options).catch(() => {});
  }
}

/**
 * @internal 仅供测试注入依赖，生产代码禁止调用
 */
export function __setDepsForTest(_deps: unknown): void {
  // 测试注入点占位
}
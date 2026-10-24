/**
 * 连接列表面板（design.md 2.4.3，TASK-S3-04）
 * 连接列表（ConnectionCard × profiles）+ ⋮ 菜单（BottomSheet：编辑/测试/连接/删除）
 * + 删除二次确认（Dialog；hasActiveOperations 为真时 danger 变体并警告
 * "该连接有正在进行的操作"，spec 5.3.1-R7、spec 5.3.3 异常 5）
 * + 空态"添加第一个连接"引导（spec 5.3.1-R3）。
 * 密码解析（TASK-S6-01-FIX-01 三态语义，FIX-C11）：remembered（密文存在经
 * AES-GCM 解密取回）/ empty_credential（无密文且 passwordEmpty===true——空密码
 * 凭据，直接以空密码连接，R10）/ unset（未保存密码转编辑表单补输）；
 * 解密失败 fail-secure 清除密文并转编辑表单要求重输（S3-02 使用方职责）。
 * 测试/连接结果一律取 smbConnectionStore 事实状态（禁乐观更新）。
 * 插件调用经 store 中转，本组件零 SmbPlugin import。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '../../../components/Card';
import { ListRow } from '../../../components/ListRow';
import { BottomSheet } from '../../../components/BottomSheet';
import { Dialog } from '../../../components/Dialog';
import { EmptyState } from '../../../components/EmptyState';
import { StatusBanner } from '../../../components/StatusBanner';
import { Icon } from '../../../icons/Icon';
import { useSmbConnectionStore } from '../../../../state/smbConnectionStore';
import { useSmbProfilesStore } from '../../../../state/smbProfilesStore';
import { getPasswordSemantics } from '../../../../state/smbProfilesStore';
import type { SmbProfile } from '../../../../state/smbProfilesStore';
import { decryptPassword } from '../../../../utils/crypto';
import { ConnectionCard } from '../ConnectionCard';
import styles from './style.module.css';

interface BannerState {
  semantic: 'success' | 'danger' | 'warning' | 'info';
  title: string;
}

type MenuAction = 'edit' | 'test' | 'connect' | 'remove';

interface PasswordResolution {
  password: string | null;
  /** 密文解密失败（fail-secure 已清除，须重新输入） */
  needReenter: boolean;
}

/** 解析 profile 密码（三态语义，F01）：密文解密取回 / 空密码凭据直接连接 / 未保存转补输；
 * 解密失败时清除密文（fail-secure）并标记重输 */
async function resolveProfilePassword(profile: SmbProfile): Promise<PasswordResolution> {
  if (!profile.passwordEncrypted) {
    // TASK-S6-01-FIX-01（FIX-C11，R10）：无密文时按三态分流——
    // empty_credential（保存时密码为空字符串的合法完整凭据，如 Windows guest 共享）
    // → 返回空字符串（非 null）：下方 `password === null` 补输判定不触发，
    // 直接以空密码发起连接并走完整反馈链；unset（未保存密码）→ 维持既有 null
    // 返回（转编辑表单补输，行为零变更，C04）。
    if (getPasswordSemantics(profile) === 'empty_credential') {
      return { password: '', needReenter: false };
    }
    return { password: null, needReenter: false };
  }
  const decrypted = await decryptPassword(profile.passwordEncrypted);
  if (decrypted === null) {
    await useSmbProfilesStore.getState().save({
      id: profile.id,
      name: profile.name,
      host: profile.host,
      share: profile.share,
      username: profile.username,
      domain: profile.domain,
      rememberPassword: false,
    });
    return { password: null, needReenter: true };
  }
  return { password: decrypted, needReenter: false };
}

export interface ProfilesListPanelProps {
  /** 编辑请求 → 页面级切换表单为编辑模式（预填） */
  onEdit(profile: SmbProfile): void;
}

export function ProfilesListPanel({ onEdit }: ProfilesListPanelProps) {
  const profiles = useSmbProfilesStore((s) => s.profiles);
  const connectionState = useSmbConnectionStore((s) => s.state);
  const activeProfileId = useSmbConnectionStore((s) => s.activeProfileId);

  const [menuFor, setMenuFor] = useState<SmbProfile | null>(null);
  const [deleteFor, setDeleteFor] = useState<SmbProfile | null>(null);
  const [removing, setRemoving] = useState(false);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const bannerTimer = useRef<number | null>(null);

  useEffect(() => {
    void useSmbProfilesStore.getState().load();
  }, []);

  useEffect(
    () => () => {
      if (bannerTimer.current !== null) window.clearTimeout(bannerTimer.current);
    },
    [],
  );

  const showBanner = useCallback((next: BannerState, autoDismissMs?: number) => {
    if (bannerTimer.current !== null) {
      window.clearTimeout(bannerTimer.current);
      bannerTimer.current = null;
    }
    setBanner(next);
    if (autoDismissMs !== undefined) {
      bannerTimer.current = window.setTimeout(() => {
        setBanner(null);
        bannerTimer.current = null;
      }, autoDismissMs);
    }
  }, []);

  /** 以存储凭据连接 profile；未存密码/解密失败 → 转编辑表单
 * TASK-S5-06-A（PM 授权）：首点静默失败防御性修复——
 * 历史证据：冷启动首点偶发解密链挂起（logcat 停在 Preferences.get(master.v1)
 * 无后续 SmbPlugin.connect），全链无 catch/超时 → 无任何反馈。
 * 修复策略（不扩大范围）：①点击立即"正在连接…"info 反馈（发起前准备可见）；
 * ②解密阶段 8s 超时（桥挂起可恢复——重试时桥已就绪）；③全链 try/catch——
 * 任何异常/超时 → danger Banner"连接失败：凭据读取失败，请重试"（结构性消除静默）。 */
const CREDENTIAL_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label}（超时 ${ms}ms）`)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

const connectWithProfile = useCallback(
  async (profile: SmbProfile, testOnly: boolean) => {
    showBanner({ semantic: 'info', title: '正在连接...' });
    let password: string | null;
    let needReenter: boolean;
    try {
      ({ password, needReenter } = await withTimeout(
        resolveProfilePassword(profile),
        CREDENTIAL_TIMEOUT_MS,
        '凭据读取失败',
      ));
    } catch (error) {
      // 解密链异常/超时（含桥挂起）：如实失败可重试（重试时桥已就绪），不静默
      showBanner({
        semantic: 'danger',
        title: `连接失败：${error instanceof Error ? error.message : '凭据读取失败'}，请重试`,
      });
      return;
    }
    if (needReenter) {
      showBanner(
        {
          semantic: 'warning',
          title: '已保存的密码无法解密，请重新输入密码后连接',
        },
      );
      onEdit(profile);
      return;
    }
    if (password === null) {
      // 未记住密码：转编辑表单补输（连接动作由表单"保存并连接"完成）
      showBanner({ semantic: 'warning', title: '请输入密码完成连接' });
      onEdit(profile);
      return;
    }
      const store = useSmbConnectionStore.getState();
      await store.connect(profile.id, {
        host: profile.host,
        share: profile.share,
        username: profile.username,
        password,
        domain: profile.domain,
      });
      const after = useSmbConnectionStore.getState();
      if (testOnly) {
        if (after.state === 'connected') {
          await store.disconnect();
          showBanner({ semantic: 'success', title: '连接成功' }, 4000);
        } else {
          showBanner({
            semantic: 'danger',
            title: `连接失败：${after.lastError?.userMessage ?? '操作失败，请重试'}`,
          });
        }
      } else if (after.state !== 'connected') {
        showBanner({
          semantic: 'danger',
          title: `连接失败：${after.lastError?.userMessage ?? '操作失败，请重试'}`,
        });
      } else {
        // 连接成功：清除既有失败 Banner（防虚假失败状态残留——徽章已切已连接，
        // 持久 danger Banner 与事实不符；Gate-UI-3 真机验证发现的定向修复）
        if (bannerTimer.current !== null) {
          window.clearTimeout(bannerTimer.current);
          bannerTimer.current = null;
        }
        setBanner(null);
      }
    },
    [onEdit, showBanner],
  );

  const handleMenuAction = useCallback(
    (action: MenuAction) => {
      const profile = menuFor;
      setMenuFor(null);
      if (!profile) return;
      switch (action) {
        case 'edit':
          onEdit(profile);
          break;
        case 'test':
          void connectWithProfile(profile, true);
          break;
        case 'connect':
          void connectWithProfile(profile, false);
          break;
        case 'remove':
          setDeleteFor(profile);
          break;
      }
    },
    [menuFor, onEdit, connectWithProfile],
  );

  /** 删除确认（spec 5.3.1-R7 / 5.3.3 异常 5）：hasActiveOperations → danger 升级 */
  const confirmRemove = useCallback(async () => {
    const profile = deleteFor;
    if (!profile || removing) return;
    setRemoving(true);
    const profilesStore = useSmbProfilesStore.getState();
    await profilesStore.remove(profile.id);
    // 删除活动连接 → 同步断开（连接上下文已无对应配置）
    const conn = useSmbConnectionStore.getState();
    if (conn.activeProfileId === profile.id) {
      await conn.disconnect();
    }
    setRemoving(false);
    setDeleteFor(null);
    showBanner({ semantic: 'success', title: `已删除"${profile.name}"` }, 4000);
  }, [deleteFor, removing, showBanner]);

  const deleteHasActiveOps = deleteFor
    ? useSmbProfilesStore.getState().hasActiveOperations(deleteFor.id)
    : false;

  const menuItems: Array<{
    action: MenuAction;
    icon: 'icon-edit' | 'icon-wifi' | 'icon-server' | 'icon-delete';
    label: string;
  }> = [
    { action: 'edit', icon: 'icon-edit', label: '编辑' },
    { action: 'test', icon: 'icon-wifi', label: '测试连接' },
    { action: 'connect', icon: 'icon-server', label: '连接' },
    { action: 'remove', icon: 'icon-delete', label: '删除' },
  ];

  return (
    <div className={styles.panel}>
      {banner && (
        <StatusBanner
          semantic={banner.semantic}
          icon={
            banner.semantic === 'success'
              ? 'icon-check-circle'
              : banner.semantic === 'warning'
                ? 'icon-conflict'
                : banner.semantic === 'info'
                  ? 'icon-loader'
                  : 'icon-x-circle'
          }
          title={banner.title}
        />
      )}
      {profiles.length === 0 ? (
        <Card>
          <EmptyState
            icon="icon-server"
            title="还没有保存的连接"
            description="在连接表单中填写服务器信息，保存后即可在此快速连接"
          />
        </Card>
      ) : (
        <Card title={<span className={styles.listTitle}>已保存的连接</span>}>
          <div className={styles.list}>
            {profiles.map((profile) => (
              <ConnectionCard
                key={profile.id}
                profile={profile}
                connectionState={
                  profile.id === activeProfileId ? connectionState : 'disconnected'
                }
                onPress={() => void connectWithProfile(profile, false)}
                onMenu={() => setMenuFor(profile)}
              />
            ))}
          </div>
        </Card>
      )}
      <BottomSheet
        title={menuFor?.name}
        open={menuFor !== null}
        onDismiss={() => setMenuFor(null)}
      >
        <div className={styles.menuList}>
          {menuItems.map((item) => (
            <ListRow
              key={item.action}
              icon={<Icon name={item.icon} size={22} />}
              title={item.label}
              onPress={() => handleMenuAction(item.action)}
            />
          ))}
        </div>
      </BottomSheet>
      {deleteFor && (
        <Dialog
          title="删除连接"
          danger={deleteHasActiveOps}
          confirmLabel="删除"
          confirmVariant="danger"
          onConfirm={() => void confirmRemove()}
          onDismiss={() => setDeleteFor(null)}
        >
          <p className={styles.deleteText}>
            {deleteHasActiveOps
              ? `该连接有正在进行的操作。删除后进行中的操作可能无法完成，确定删除"${deleteFor.name}"？`
              : `确定删除连接"${deleteFor.name}"？删除后需要重新添加才能连接。`}
          </p>
        </Dialog>
      )}
      {removing && <span className={styles.srOnly}>正在删除…</span>}
    </div>
  );
}
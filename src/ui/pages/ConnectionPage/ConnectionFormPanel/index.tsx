/**
 * 连接表单面板（design.md 2.4.3，TASK-S3-03）
 * 六字段表单（连接名称/服务器地址/共享名/用户名/密码/域可选）；
 * 表单校验：必填 + 地址格式（IPv4/主机名），失败内联 danger caption（spec 5.3.1-R8）；
 * 测试连接（spec 5.3.1-R4）：connect() → 成功立即 disconnect()，
 *   连接中 StatusBadge（info + icon-loader）→ 结果 Banner
 *   （success "连接成功" 4s 自动消失 / danger "连接失败：{可读原因}" 持久）；
 * 保存并连接（primary loading 态）：profilesStore.save + connect；
 * 凭据错误定位（spec 5.3.3 异常 2）：AUTH_FAILED 分类时错误呈现于密码项内联位置，
 *   文案统一"用户名或密码不正确"（不区分具体哪项，避免泄露可探测性）；
 * 记住密码：勾选时 AES-GCM 加密落盘（S3-02），crypto 不可用时禁用选项（R-06）；
 * 状态真实呈现：连接结果一律取自 smbConnectionStore 事实状态（禁乐观更新，2.1.3 原则 5）。
 * 插件调用经 store 中转，本组件零 SmbPlugin import（design.md 2.2.2 分层规则）。
 * TASK-S6-01-FIX-01（FIX-C1~C4）：密码非必填——guest/空密码为合法完整凭据形态
 * （R01，Windows Server guest 共享生产场景）；用户名必填保持（纯匿名不放行）；
 * 新建模式保存后条目定位按身份四元组（isSameProfileIdentity，R11）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { BaseButton } from '../../../components/BaseButton';
import { Card } from '../../../components/Card';
import { StatusBadge } from '../../../components/StatusBadge';
import { StatusBanner } from '../../../components/StatusBanner';
import { Icon } from '../../../icons/Icon';
import { useSmbConnectionStore } from '../../../../state/smbConnectionStore';
import { useSmbProfilesStore } from '../../../../state/smbProfilesStore';
import { isSameProfileIdentity } from '../../../../state/smbProfilesStore';
import type { SmbProfile } from '../../../../state/smbProfilesStore';
import { isCryptoAvailable } from '../../../../utils/crypto';
import { FormField } from '../FormField';
import styles from './style.module.css';

/** 表单字段值集合 */
interface ConnectionFormValues {
  name: string;
  host: string;
  share: string;
  username: string;
  password: string;
  domain: string;
}

const EMPTY_FORM: ConnectionFormValues = {
  name: '',
  host: '',
  share: '',
  username: '',
  password: '',
  domain: '',
};

type FormErrors = Partial<Record<keyof ConnectionFormValues, string>>;

/** IPv4（段值 0-255）或主机名（字母数字与连字符段，点分） */
function isValidHost(host: string): boolean {
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    return ipv4.slice(1).every((seg) => {
      const n = Number(seg);
      return n >= 0 && n <= 255;
    });
  }
  return /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(
    host,
  );
}

function validateForm(form: ConnectionFormValues): FormErrors {
  const errors: FormErrors = {};
  if (!form.name.trim()) errors.name = '请填写连接名称';
  if (!form.host.trim()) errors.host = '请填写服务器地址';
  else if (!isValidHost(form.host.trim()))
    errors.host = '地址格式不正确，应为 IP 或主机名（如 192.168.1.1）';
  if (!form.share.trim()) errors.share = '请填写共享名';
  if (!form.username.trim()) errors.username = '请填写用户名';
  // TASK-S6-01-FIX-01（FIX-C1，R01）：密码非必填——guest/空密码为合法完整凭据形态
  // （Windows Server guest 共享场景，S6-01 WS-01 实测根因：此处拦截导致提交静默 return，
  // "保存→连接"链路从未发起）。用户名必填保持（纯匿名形态不放行，spec 5.1.3 异常 1）；
  // 密码含空格等非空字符仍按非空凭据处理（不 trim，既有语义）。
  return errors;
}

interface BannerState {
  semantic: 'success' | 'danger';
  title: string;
}

/** 测试连接使用的临时 profile 标识（不落 profiles 列表） */
const TEST_PROFILE_ID = 'profile-test';

export interface ConnectionFormPanelProps {
  /** 编辑模式预填（TASK-S3-04 列表面板接线） */
  initialProfile?: SmbProfile;
  /** 保存完成回调（编辑模式退出，页面回新建表单） */
  onSaved?: () => void;
}

export function ConnectionFormPanel({ initialProfile, onSaved }: ConnectionFormPanelProps) {
  const [form, setForm] = useState<ConnectionFormValues>(() =>
    initialProfile
      ? {
          name: initialProfile.name,
          host: initialProfile.host,
          share: initialProfile.share,
          username: initialProfile.username,
          password: '',
          domain: initialProfile.domain ?? '',
        }
      : EMPTY_FORM,
  );
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [rememberPassword, setRememberPassword] = useState(false);
  const [cryptoOk, setCryptoOk] = useState<boolean | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const bannerTimer = useRef<number | null>(null);

  const connectingState = useSmbConnectionStore((s) => s.state);

  /** crypto 可用性检测（R-06：不可用时禁用记住密码选项） */
  useEffect(() => {
    let disposed = false;
    void isCryptoAvailable().then((available) => {
      if (disposed) return;
      setCryptoOk(available);
      if (!available) setRememberPassword(false);
    });
    return () => {
      disposed = true;
    };
  }, []);

  /** success Banner 4s 自动消失（danger 持久，spec 5.3.1-R4；卸载清 timer） */
  const showBanner = useCallback((next: BannerState) => {
    if (bannerTimer.current !== null) {
      window.clearTimeout(bannerTimer.current);
      bannerTimer.current = null;
    }
    setBanner(next);
    if (next.semantic === 'success') {
      bannerTimer.current = window.setTimeout(() => {
        setBanner(null);
        bannerTimer.current = null;
      }, 4000);
    }
  }, []);

  useEffect(
    () => () => {
      if (bannerTimer.current !== null) window.clearTimeout(bannerTimer.current);
    },
    [],
  );

  const setField = useCallback(
    (key: keyof ConnectionFormValues) => (value: string) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      // 用户修改即清除该字段错误（含 AUTH_FAILED 定位的密码项）
      setFieldErrors((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [],
  );

  const connectOptions = useCallback(() => {
    const domain = form.domain.trim();
    return {
      host: form.host.trim(),
      share: form.share.trim(),
      username: form.username.trim(),
      password: form.password,
      domain: domain || undefined,
    };
  }, [form]);

  /** 测试连接（spec 5.3.1-R4）：connect → 成功立即 disconnect；失败 Banner 持久 */
  const handleTestConnection = useCallback(async () => {
    const errors = validateForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setTesting(true);
    setBanner(null);
    const store = useSmbConnectionStore.getState();
    await store.connect(TEST_PROFILE_ID, connectOptions());
    const after = useSmbConnectionStore.getState();
    if (after.state === 'connected') {
      await store.disconnect();
      showBanner({ semantic: 'success', title: '连接成功' });
    } else {
      const reason = after.lastError?.userMessage ?? '操作失败，请重试';
      showBanner({ semantic: 'danger', title: `连接失败：${reason}` });
      // 凭据错误定位密码项（spec 5.3.3 异常 2，统一文案）
      if (after.lastError?.category === 'auth_failed') {
        setFieldErrors((prev) => ({ ...prev, password: '用户名或密码不正确' }));
      }
    }
    setTesting(false);
  }, [form, connectOptions, showBanner]);

  /** 保存并连接：profilesStore.save → connect；结果取事实状态 */
  const handleSaveAndConnect = useCallback(async () => {
    const errors = validateForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    setBanner(null);
    const profilesStore = useSmbProfilesStore.getState();

    const isEdit = !!initialProfile?.id;
    await profilesStore.save({
      id: initialProfile?.id,
      name: form.name.trim(),
      host: form.host.trim(),
      share: form.share.trim(),
      username: form.username.trim(),
      domain: form.domain.trim() || undefined,
      password: form.password,
      rememberPassword: rememberPassword && cryptoOk === true,
    });
    const profilesAfter = useSmbProfilesStore.getState().profiles;
    // TASK-S6-01-FIX-01（FIX-C3，R11）：新建模式条目定位改身份四元组判定——
    // 同身份第二次"保存并连接"（upsert 命中更新，列表长度不变）时，
    // "追加位"定位（profilesAfter[profilesBefore.length]）必然落空 → profileId
    // 回退 TEST_PROFILE_ID → 连接成功后 activeProfileId 归属错位（该配置连接卡
    // 不呈"已连接"）。消费 store 导出 isSameProfileIdentity（与 save 查重单一真相源）。
    const saved = isEdit
      ? profilesAfter.find((p) => p.id === initialProfile.id)
      : profilesAfter.find((p) =>
          isSameProfileIdentity(p, {
            host: form.host,
            share: form.share,
            username: form.username,
            domain: form.domain,
          }),
        );
    const profileId = saved?.id ?? TEST_PROFILE_ID;
    const connectionStore = useSmbConnectionStore.getState();
    await connectionStore.connect(profileId, connectOptions());
    const after = useSmbConnectionStore.getState();
    if (after.state === 'connected') {
      showBanner({ semantic: 'success', title: '已连接' });
      // 密码仅会话内存：连接成功后清空明文输入（记住密码时密文已落盘）
      setForm((prev) => ({ ...prev, password: '' }));
    } else {
      const reason = after.lastError?.userMessage ?? '操作失败，请重试';
      showBanner({ semantic: 'danger', title: `连接失败：${reason}` });
      if (after.lastError?.category === 'auth_failed') {
        setFieldErrors((prev) => ({ ...prev, password: '用户名或密码不正确' }));
      }
    }
    setSaving(false);
    onSaved?.();
  }, [form, rememberPassword, cryptoOk, initialProfile, connectOptions, showBanner, onSaved]);

  const busy = testing || saving;
  const showConnectingBadge =
    connectingState === 'connecting' && (testing || saving);

  return (
    <Card title={<span className={styles.panelTitle}>新建 SMB 连接</span>}>
      <div className={styles.form}>
        {showConnectingBadge && (
          <div className={styles.statusRow}>
            <StatusBadge semantic="info" icon="icon-loader" label="正在连接..." />
          </div>
        )}
        {banner && (
          <div className={styles.statusRow}>
            <StatusBanner
              semantic={banner.semantic}
              icon={banner.semantic === 'success' ? 'icon-check-circle' : 'icon-x-circle'}
              title={banner.title}
            />
          </div>
        )}
        <FormField
          label="连接名称"
          required
          value={form.name}
          onChange={setField('name')}
          placeholder="如：办公室文件服务器"
          error={fieldErrors.name}
        />
        <FormField
          label="服务器地址"
          required
          value={form.host}
          onChange={setField('host')}
          placeholder="192.168.1.1 或 server.local"
          error={fieldErrors.host}
          inputMode="text"
        />
        <FormField
          label="共享名"
          required
          value={form.share}
          onChange={setField('share')}
          placeholder="如 share"
          error={fieldErrors.share}
        />
        <FormField
          label="用户名"
          required
          value={form.username}
          onChange={setField('username')}
          placeholder="SMB 用户名"
          error={fieldErrors.username}
          autoComplete="username"
        />
        <FormField
          label="密码"
          type="password"
          value={form.password}
          onChange={setField('password')}
          placeholder="SMB 密码（guest 访问可留空）"
          error={fieldErrors.password}
          autoComplete="current-password"
        />
        <FormField
          label="域（选填）"
          value={form.domain}
          onChange={setField('domain')}
          placeholder="通常留空"
          hint="仅域环境下填写工作组或域名"
          error={fieldErrors.domain}
        />
        <label className={styles.rememberRow}>
          <input
            type="checkbox"
            className={styles.rememberCheckbox}
            checked={rememberPassword && cryptoOk === true}
            disabled={busy || cryptoOk !== true}
            onChange={(event) => setRememberPassword(event.target.checked)}
          />
          <span className={styles.rememberText}>
            <span className={styles.rememberLabel}>记住密码</span>
            <span className={styles.rememberHint}>
              {cryptoOk === false
                ? '当前环境不支持加密存储，密码仅本次连接使用'
                : '密码将以加密方式保存在本设备'}
            </span>
          </span>
        </label>
        <div className={styles.actions}>
          <BaseButton
            variant="secondary"
            loading={testing}
            disabled={saving}
            onPress={() => void handleTestConnection()}
          >
            测试连接
          </BaseButton>
          <BaseButton
            variant="primary"
            loading={saving}
            disabled={testing}
            icon={<Icon name="icon-server" size={20} />}
            onPress={() => void handleSaveAndConnect()}
          >
            保存并连接
          </BaseButton>
        </div>
      </div>
    </Card>
  );
}
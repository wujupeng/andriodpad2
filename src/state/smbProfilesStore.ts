/**
 * SMB 连接配置（profiles）store（design.md 2.6.2-B、2.4.3/2.7.2，TASK-S3-02 实现）
 * Preferences `pad2.profiles.v1` 版本化持久化：
 * - 读取校验版本号与结构，不匹配/损坏安全丢弃（回空列表，不崩溃）
 * 密码安全（spec 4.3-1/6.3-2、design.md 2.4.3、D-07）：
 * - 明文密码仅会话内存（本 store 与持久化均不持有明文）
 * - "记住密码"勾选时经 utils/crypto AES-GCM 加密落盘（passwordEncrypted）
 * - crypto 不可用降级：不落密文（记住密码选项由 UI 层禁用，R-06；此处防御性兜底）
 * fail-secure：passwordEncrypted 格式非法（篡改）时 load 静默清除并回写；
 *   解密级失败由使用方（连接页解密返回 null）经 save() 更新路径清除并要求重输
 * 日志与错误信息永不输出密码（异常路径仅输出 id/name 类标识与存储层错误）
 * 接口签名冻结于 S1-09（R-07），本任务零接口变更（仅填充实现）。
 * TASK-S6-01-FIX-01：SmbProfile 新增可选 passwordEmpty（空密码凭据语义标记，
 * F01 三态承载）；STORAGE_VERSION 保持 1 不升（升版本=安全丢弃用户配置，违反
 * R08）——可选字段在 version 1 框架内向后兼容（旧数据缺失字段=unset 回退现状）。
 */
import { create } from 'zustand';
import { Preferences } from '@capacitor/preferences';
import { encryptPassword, isCryptoAvailable } from '../utils/crypto';
import { useOperationStore } from './operationStore';
import { useEditSessionStore } from './editSessionStore';

const PROFILES_PREF_KEY = 'pad2.profiles.v1';
const STORAGE_VERSION = 1;

export interface SmbProfile {
  id: string;
  name: string;
  host: string;
  share: string;
  username: string;
  domain?: string;
  /** 仅勾选记住密码时存在（AES-GCM 密文，"salt.iv.ciphertext" base64 三段式） */
  passwordEncrypted?: string;
  /**
   * 空密码凭据语义标记（TASK-S6-01-FIX-01，F01 三态承载）：
   * true = 保存时密码为空字符串的合法完整凭据（如 Windows guest 共享）。
   * - 与 passwordEncrypted 互斥（密文存在时读取侧忽略此字段）
   * - 纯语义标记，不含任何密码内容（C05）
   * - 可选字段：version 1 框架内向后兼容扩展（旧数据缺失=unset 语义，回退现状两态行为）
   */
  passwordEmpty?: boolean;
  createdAt: number;
  lastConnectedAt?: number;
}

export interface SmbProfileInput {
  id?: string;
  name: string;
  host: string;
  share: string;
  username: string;
  domain?: string;
  password?: string;
  rememberPassword?: boolean;
}

export interface SmbProfilesState {
  profiles: SmbProfile[];
  load(): Promise<void>;
  save(profile: SmbProfileInput): Promise<void>;
  remove(id: string): Promise<void>;
  hasActiveOperations(id: string): boolean;
}

interface ProfilesPersistShape {
  version?: number;
  profiles?: unknown[];
}

/** profile id 生成：randomUUID 优先（安全上下文），退化时间戳+随机数 */
function generateProfileId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `profile-${crypto.randomUUID()}`;
  }
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 密文格式轻量校验（无 PBKDF2 成本）："salt.iv.ciphertext" base64 三段且非空 */
function isEncryptedFormatValid(enc: string): boolean {
  const parts = enc.split('.');
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

/**
 * 连接配置身份判定（host + share + username + domain 四元组，归一化比对，name 不参与）。
 * TASK-S6-01-FIX-01 提升为导出纯函数（FIX-C8）：save 查重与 UI 层条目定位消费同一
 * 真相源，消除保存/定位双源漂移（R11）。判定逻辑与 S5-06-B 逐字一致（行为等价重构）。
 */
export function isSameProfileIdentity(
  a: { host: string; share: string; username: string; domain?: string },
  b: { host: string; share: string; username: string; domain?: string },
): boolean {
  const normalizeDomain = (d?: string) => (d && d.trim() ? d.trim() : undefined);
  return (
    a.host.trim().toLowerCase() === b.host.trim().toLowerCase() &&
    a.share.trim().toLowerCase() === b.share.trim().toLowerCase() &&
    a.username.trim() === b.username.trim() &&
    normalizeDomain(a.domain) === normalizeDomain(b.domain)
  );
}

/** 密码语义三态（TASK-S6-01-FIX-01，F01）：禁止混同为两态 */
export type SmbPasswordSemantics = 'remembered' | 'empty_credential' | 'unset';

/**
 * 密码语义三态单一推断入口（F01）：
 * - 'remembered'：密文存在（记住密码已加密落盘，解密取回使用）
 * - 'empty_credential'：无密文且 passwordEmpty === true（保存时密码为空的合法凭据，直接连接）
 * - 'unset'：其余（未保存密码，连接时补输）
 * passwordEmpty 读取一律经本函数或严格 === true 比较（禁 truthy 判定）
 */
export function getPasswordSemantics(profile: SmbProfile): SmbPasswordSemantics {
  if (profile.passwordEncrypted) return 'remembered';
  if (profile.passwordEmpty === true) return 'empty_credential';
  return 'unset';
}

/** 条目结构校验 + fail-secure 清洗：格式非法密文静默清除（要求重新输入） */
function sanitizeProfile(raw: unknown): SmbProfile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const p = raw as Record<string, unknown>;
  if (
    typeof p.id !== 'string' ||
    typeof p.name !== 'string' ||
    typeof p.host !== 'string' ||
    typeof p.share !== 'string' ||
    typeof p.username !== 'string' ||
    typeof p.createdAt !== 'number'
  ) {
    return null;
  }
  const profile: SmbProfile = {
    id: p.id,
    name: p.name,
    host: p.host,
    share: p.share,
    username: p.username,
    createdAt: p.createdAt,
  };
  if (typeof p.domain === 'string' && p.domain) profile.domain = p.domain;
  // TASK-S6-01-FIX-01（FIX-C6）：空密码凭据语义标记白名单解析——严格 === true 才落位
  // （非布尔/篡改值静默丢弃，与密文 fail-secure 同风格，防三态误判）
  if (p.passwordEmpty === true) profile.passwordEmpty = true;
  if (typeof p.passwordEncrypted === 'string' && p.passwordEncrypted) {
    if (isEncryptedFormatValid(p.passwordEncrypted)) {
      profile.passwordEncrypted = p.passwordEncrypted;
    }
    // 格式非法（篡改/损坏）：静默清除该字段，密码要求重新输入
  }
  if (typeof p.lastConnectedAt === 'number') profile.lastConnectedAt = p.lastConnectedAt;
  return profile;
}

/** 持久化（错误信息不含任何凭据内容） */
async function persist(profiles: SmbProfile[]): Promise<void> {
  try {
    await Preferences.set({
      key: PROFILES_PREF_KEY,
      value: JSON.stringify({ version: STORAGE_VERSION, profiles }),
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[smbProfilesStore] 持久化失败（内存态不受影响）');
    }
    void error;
  }
}

export const useSmbProfilesStore = create<SmbProfilesState>()((set, get) => ({
  profiles: [],

  load: async () => {
    try {
      const { value } = await Preferences.get({ key: PROFILES_PREF_KEY });
      if (!value) return;
      let parsed: ProfilesPersistShape;
      try {
        parsed = JSON.parse(value) as ProfilesPersistShape;
      } catch {
        // JSON 损坏：安全丢弃（回空列表，不崩溃）
        set({ profiles: [] });
        return;
      }
      if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.profiles)) {
        // 版本不匹配/结构异常：安全丢弃（用户重录，不做升级迁移）
        set({ profiles: [] });
        return;
      }
      const sanitized = parsed.profiles
        .map(sanitizeProfile)
        .filter((p): p is SmbProfile => p !== null);
      set({ profiles: sanitized });
      // fail-secure 清洗发生时回写持久层（清除非法密文，幂等）
      const hadInvalidEncrypted = parsed.profiles.some((raw) => {
        if (typeof raw !== 'object' || raw === null) return false;
        const enc = (raw as Record<string, unknown>).passwordEncrypted;
        return typeof enc === 'string' && !!enc && !isEncryptedFormatValid(enc);
      });
      if (hadInvalidEncrypted) await persist(sanitized);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[smbProfilesStore] 读取失败（保持内存态）');
      }
      void error;
    }
  },

  save: async (input) => {
    const { profiles } = get();
    let passwordEncrypted: string | undefined;
    if (input.rememberPassword && input.password) {
      if (await isCryptoAvailable()) {
        const enc = await encryptPassword(input.password);
        if (enc) passwordEncrypted = enc;
        // 加密失败（null）：不落密文，密码仅本次连接会话使用（不视为保存失败）
      }
      // crypto 不可用（R-06 降级）：不落密文（UI 层已禁用记住密码，防御性兜底）
    }
    // TASK-S5-06-B（重复卡片根因修复）：
    // 连接配置唯一性判定 = host + share + username + domain 四元组（归一化比对，
    // domain 空串/undefined 等同）；name 为用户显示标签，不参与判重（避免用
    // 模糊显示名误合并不同共享配置，PM 授权边界）。
    // 原缺陷：新建路径（input.id 为空）不做身份查重直接追加 → 同配置保存
    // 第二次即产生持久化重复卡（S5-01 fallback 表单路径实测触发）。
    // 修复：新建时按身份键查重命中 → 复用既有条目 id（upsert 更新，不新增）；
    // 显式 id 编辑路径行为不变。存量重复数据不在 load 层静默合并（合并取哪条
    // 密文不可判——留给用户经 UI 删除，不以隐藏代替数据修复）。
    // TASK-S6-01-FIX-01（FIX-C8）：查重消费导出 isSameProfileIdentity（单一真相源）
    const existing = input.id
      ? profiles.find((p) => p.id === input.id)
      : profiles.find((p) => isSameProfileIdentity(p, input));
    // TASK-S6-01-FIX-01（FIX-C7，R08）：空密码凭据语义标记写入规则——
    // input.password === ''（空字符串提交）且（新建身份 或 既有条目本身为空密码凭据）
    // → 置 passwordEmpty=true。八场景穷举（design 2.2.3 规则表）：
    // ①新建空密码→置；②upsert 既有 empty 再次空密码→保持置；③编辑仅改名（既有 empty）→保持置；
    // ④编辑密文配置不重输（password 未提供=undefined）→不置（走既有清密文语义，回到补输）；
    // ⑤非空+勾记住→密文落盘（passwordEncrypted 优先，本字段不置）；
    // ⑥非空+不勾→不置（unset）；⑦fail-secure 清密文路径（无 password）→不置；
    // ⑧空密码+勾记住→置（rememberPassword && password 短路天然不产密文，R09）
    const isEmptyCredential = input.password === '' && (!existing || existing.passwordEmpty === true);
    const entry: SmbProfile = {
      id: existing?.id ?? generateProfileId(),
      name: input.name,
      host: input.host,
      share: input.share,
      username: input.username,
      domain: input.domain,
      // rememberPassword=false 或未提供密码：清除既有密文（密码回到仅会话内存）
      passwordEncrypted,
      passwordEmpty: isEmptyCredential ? true : undefined,
      createdAt: existing?.createdAt ?? Date.now(),
      lastConnectedAt: existing?.lastConnectedAt,
    };
    const next = existing
      ? profiles.map((p) => (p.id === existing.id ? entry : p))
      : [...profiles, entry];
    set({ profiles: next });
    await persist(next);
  },

  remove: async (id) => {
    const next = get().profiles.filter((p) => p.id !== id);
    set({ profiles: next });
    await persist(next);
  },

  hasActiveOperations: (id) => {
    // 精确归属（S4-04 交付）：任务携带 profileId（operationStore enqueue 注入）——
    // 仅该连接的活跃任务触发警告；任务侧 profileId 缺失（防御性发起）时保守计为活跃
    const operation = useOperationStore.getState().activeTask;
    if (
      operation &&
      (operation.status === 'pending' || operation.status === 'in_progress') &&
      (operation.profileId === id || operation.profileId === undefined)
    ) {
      return true;
    }
    // 编辑会话归属待 S5-01（会话携带 profileId）——保守全量判断（宁误报不漏报）
    const session = useEditSessionStore.getState();
    if (session.state !== 'idle' && session.state !== 'session_terminated') {
      return true;
    }
    return false;
  },
}));
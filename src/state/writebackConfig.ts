/**
 * 写回配置驱动模块（TASK-WB-01）。
 *
 * 从 Capacitor Preferences `pad2.writeback.v1` 读取写回启用配置。
 * 默认 enabled=false（HC-06 只读模式兼容）。
 * 不引入新 npm 依赖（HC-01），复用既有 @capacitor/preferences。
 *
 * 追溯：REQ-WB-01（写回功能启用）、DFX-WB-07（只读模式兼容）
 */
import { Preferences } from '@capacitor/preferences';

/** 持久化键名（与 pad2.profiles.v1 不冲突，HC-05） */
const PREF_KEY = 'pad2.writeback.v1';

/** 写回配置 */
export interface WritebackConfig {
  /** 写回功能全局启用 */
  enabled: boolean;
  /** 受限可写目录路径集合 */
  writablePaths: readonly string[];
  /** 专用写回账户名 */
  account: string;
}

/** 默认配置（enabled=false，HC-06 只读兼容） */
const DEFAULT_CONFIG: WritebackConfig = {
  enabled: false,
  writablePaths: ['/mnt/share/writable/'],
  account: 'pad2_app',
};

/** 内存缓存（避免每次调用都读 Preferences） */
let _cachedConfig: WritebackConfig | null = null;

/**
 * 从 Preferences 加载写回配置。
 * 缺失时返回默认配置（enabled=false）。
 */
export async function loadWritebackConfig(): Promise<WritebackConfig> {
  try {
    const { value } = await Preferences.get({ key: PREF_KEY });
    if (!value) {
      _cachedConfig = { ...DEFAULT_CONFIG };
      return _cachedConfig;
    }
    const parsed = JSON.parse(value) as Partial<WritebackConfig>;
    _cachedConfig = {
      enabled: parsed.enabled ?? false,
      writablePaths: parsed.writablePaths ?? DEFAULT_CONFIG.writablePaths,
      account: parsed.account ?? DEFAULT_CONFIG.account,
    };
    return _cachedConfig;
  } catch {
    _cachedConfig = { ...DEFAULT_CONFIG };
    return _cachedConfig;
  }
}

/**
 * 获取当前写回是否全局启用（同步，使用内存缓存）。
 * 若缓存未加载则返回 false（安全默认）。
 */
export function isWritebackGloballyEnabled(): boolean {
  return _cachedConfig?.enabled ?? false;
}

/**
 * 获取当前写回配置（同步，使用内存缓存）。
 * 若缓存未加载则返回默认配置。
 */
export function getWritebackConfig(): WritebackConfig {
  return _cachedConfig ?? { ...DEFAULT_CONFIG };
}

/**
 * 设置写回启用状态并持久化。
 * 写入 Preferences 并刷新内存缓存。
 */
export async function setWritebackEnabled(enabled: boolean): Promise<void> {
  const config = _cachedConfig ?? { ...DEFAULT_CONFIG };
  const newConfig: WritebackConfig = { ...config, enabled };
  await Preferences.set({ key: PREF_KEY, value: JSON.stringify(newConfig) });
  _cachedConfig = newConfig;
}

/**
 * @internal 仅供测试注入配置，生产代码禁止调用
 */
export function __setWritebackConfigForTest(config: WritebackConfig | null): void {
  _cachedConfig = config;
}
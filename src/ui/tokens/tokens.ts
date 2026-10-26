/**
 * PAD2 设计令牌 TS 侧类型安全引用 + 安全语义呈现单一来源
 * 依据：docs/p003-ui/design.md 2.3.1 TS 契约、2.5.1 safetySemanticMap 十态总表、2.5.2 代码级防线
 * 约束：CON-07（令牌单一真源）、CON-03（安全语义优先于视觉美化）
 */

/* ===== 令牌名联合类型（拼写错误编译期暴露）===== */

export type ColorToken = `--pad2-color-${string}`;
export type FontToken =
  | `--pad2-font-family`
  | `--pad2-font-size-${'display' | 'title-lg' | 'title' | 'body' | 'caption' | 'micro'}`
  | `--pad2-font-weight-${'regular' | 'medium' | 'semibold'}`
  | `--pad2-line-height-${'tight' | 'normal' | 'relaxed'}`;
export type SpaceToken = `--pad2-space-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;
export type RadiusToken = `--pad2-radius-${'sm' | 'md' | 'lg' | 'xl' | 'full'}`;
export type ShadowToken = `--pad2-shadow-${'sm' | 'md' | 'lg'}`;
export type DurationToken =
  | `--pad2-duration-${'fast' | 'base' | 'slow'}`
  | '--pad2-duration-state-swap';
export type EasingToken = `--pad2-easing-${'standard' | 'decelerate'}`;
export type SizeToken =
  | `--pad2-size-${'touch-min' | 'sidenav' | 'sidenav-collapsed' | 'list-row'}`
  | `--pad2-z-${'nav' | 'sheet' | 'dialog' | 'rail'}`;

export type DesignToken =
  | ColorToken
  | FontToken
  | SpaceToken
  | RadiusToken
  | ShadowToken
  | DurationToken
  | EasingToken
  | SizeToken;

/** 按名返回 var() 引用，不复制色值（D-09 单一真源：值仅存在于 tokens.css） */
export function token(name: DesignToken): string {
  return `var(${name})`;
}

/* ===== 安全语义呈现规格（safetySemanticMap，单一来源）===== */

/** 语义类别（五类，与 StatusBadge/StatusBanner props 对齐） */
export type Semantic = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

/** 安全语义状态标识（spec 5.7 规则 1 的 10 态集合） */
export type SafetySemanticKey =
  | 'saving'
  | 'writeback_in_progress'
  | 'writeback_success'
  | 'writeback_failed'
  | 'conflict'
  | 'network_interrupted'
  | 'saveas_detected'
  | 'session_invalid'
  | 'operation_failed'
  | 'operation_in_progress';

/**
 * 持续性策略。
 * 代码级预防（spec 5.7.3 异常 2）：类型上不提供 TTL 参数——
 * 失败/冲突/断网类状态的移除条件仅为用户显式操作或状态源自然变迁，
 * 不存在超时自动移除路径。
 */
export type PersistencePolicy =
  | { kind: 'until_state_change' }
  | { kind: 'persistent_until_ack' }
  | { kind: 'persistent_until_resolved' }
  | { kind: 'modal_decision' }
  | { kind: 'session_scoped' }
  | { kind: 'toast_auto'; durationMs: 4000 };

/** 状态图标名（与 src/ui/icons/registry.ts 注册名对齐；Spinner 类与成败类互斥由 IconRole 约束） */
export type StateIconName =
  | 'icon-loader'
  | 'icon-check-circle'
  | 'icon-x-circle'
  | 'icon-conflict'
  | 'icon-cloud-off'
  | 'icon-file-question';

/** 图标角色：loading 类与 成败类互斥（design.md 2.5.2 Spinner 组合约束的基础） */
export type IconRole = 'loading' | 'outcome' | 'indicative';

/** Spinner（loading 类图标）与 success/danger 语义的组合为非法——编译期拦截 */
export type SemanticIconPair =
  | { semantic: 'info' | 'warning' | 'neutral'; icon: StateIconName }
  | { semantic: 'success'; icon: 'icon-check-circle' }
  | { semantic: 'danger'; icon: 'icon-x-circle' };

/** 安全语义操作入口标识（呈现层映射为具体按钮） */
export type SafetyActionId =
  | 'none'
  | 'cancel_writeback'
  | 'close_session'
  | 'retry'
  | 'view_details'
  | 'save_as_copy'
  | 'reload_file'
  | 'overwrite_confirm'
  | 'discard'
  | 'retry_connection'
  | 'overwrite_original'
  | 'writeback_as_new'
  | 'disassociate'
  | 'reconnect';

export interface SafetySemanticSpec {
  /** 状态标识 */
  key: SafetySemanticKey;
  /** 语义色类别（大面积色块判据之一） */
  semantic: SemanticIconPair['semantic'];
  /** 填充型状态图标（判据之二） */
  icon: StateIconName;
  /** 图标角色（loading 旋转仅限进行中） */
  iconRole: IconRole;
  /** 文案模板（用户语言，无技术细节；{percent}/{fileName}/{可读原因}/{操作名} 为占位符） */
  messageTemplate: string;
  /** 持续性策略（失败类无 TTL） */
  persistence: PersistencePolicy;
  /** 必备操作入口 */
  actions: SafetyActionId[];
}

/**
 * 安全语义状态呈现规格总表（design.md 2.5.1 十行逐行实现）。
 * 全部页面（StatusBadge/StatusBanner/SessionCard/GlobalStatusRail）消费此表，禁止绕过。
 */
export const safetySemanticMap: Readonly<
  Record<SafetySemanticKey, SafetySemanticSpec>
> = {
  saving: {
    key: 'saving',
    semantic: 'info',
    icon: 'icon-loader',
    iconRole: 'loading',
    messageTemplate: '正在保存…',
    persistence: { kind: 'until_state_change' },
    actions: ['none'],
  },
  writeback_in_progress: {
    key: 'writeback_in_progress',
    semantic: 'info',
    icon: 'icon-loader',
    iconRole: 'loading',
    messageTemplate: '正在回写…（{percent}%）',
    persistence: { kind: 'until_state_change' },
    actions: ['cancel_writeback'],
  },
  writeback_success: {
    key: 'writeback_success',
    semantic: 'success',
    icon: 'icon-check-circle',
    iconRole: 'outcome',
    messageTemplate: '回写成功，校验通过',
    persistence: { kind: 'session_scoped' },
    actions: ['close_session'],
  },
  writeback_failed: {
    key: 'writeback_failed',
    semantic: 'danger',
    icon: 'icon-x-circle',
    iconRole: 'outcome',
    messageTemplate: '回写失败：{可读原因}（原文件未被修改）',
    persistence: { kind: 'persistent_until_ack' },
    actions: ['retry', 'view_details'],
  },
  conflict: {
    key: 'conflict',
    semantic: 'warning',
    icon: 'icon-conflict',
    iconRole: 'indicative',
    messageTemplate: '文件已被他人修改，存在冲突',
    persistence: { kind: 'modal_decision' },
    actions: ['save_as_copy', 'reload_file', 'overwrite_confirm', 'discard'],
  },
  network_interrupted: {
    key: 'network_interrupted',
    semantic: 'warning',
    icon: 'icon-cloud-off',
    iconRole: 'indicative',
    messageTemplate: '网络连接中断，恢复后可继续',
    persistence: { kind: 'persistent_until_resolved' },
    actions: ['retry_connection', 'view_details'],
  },
  saveas_detected: {
    key: 'saveas_detected',
    semantic: 'warning',
    icon: 'icon-file-question',
    iconRole: 'indicative',
    messageTemplate: '检测到另存为文件：{文件名}',
    persistence: { kind: 'persistent_until_resolved' },
    actions: ['overwrite_original', 'writeback_as_new', 'disassociate'],
  },
  session_invalid: {
    key: 'session_invalid',
    semantic: 'danger',
    icon: 'icon-x-circle',
    iconRole: 'outcome',
    messageTemplate: '连接会话已失效，请重新连接',
    persistence: { kind: 'persistent_until_resolved' },
    actions: ['reconnect'],
  },
  operation_failed: {
    key: 'operation_failed',
    semantic: 'danger',
    icon: 'icon-x-circle',
    iconRole: 'outcome',
    messageTemplate: '{操作名}失败：{可读原因}',
    persistence: { kind: 'persistent_until_ack' },
    actions: ['retry', 'view_details'],
  },
  operation_in_progress: {
    key: 'operation_in_progress',
    semantic: 'info',
    icon: 'icon-loader',
    iconRole: 'loading',
    messageTemplate: '{操作名}进行中…',
    persistence: { kind: 'until_state_change' },
    actions: ['cancel_writeback'],
  },
};

/** 回写成功 Toast 持续策略（唯一允许自动消失的非失败态路径） */
export const WRITEBACK_SUCCESS_TOAST: PersistencePolicy = {
  kind: 'toast_auto',
  durationMs: 4000,
};

/* ===== 成功措辞白名单（spec 5.7 规则 6/7、design.md 2.5.2）===== */

/**
 * success semantic 的文案仅允许绑定校验通过事实。
 * "已提交/进行中"类语义禁止复用 success 措辞。
 */
export const SUCCESS_PHRASE_WHITELIST: readonly string[] = [
  '回写成功，校验通过',
  '连接成功',
  '{操作名}成功',
];

/* ===== 状态文案格式化 ===== */

/** 文案模板占位符替换（{percent}/{fileName}/{可读原因}/{操作名}） */
export function formatSafetyMessage(
  key: SafetySemanticKey,
  params: Record<string, string> = {},
): string {
  const template = safetySemanticMap[key].messageTemplate;
  return template.replace(/\{([^}]+)\}/g, (match, name: string) =>
    params[name] !== undefined ? params[name] : match,
  );
}

/* ===== Rail 多状态仲裁优先级（design.md 2.5.2）===== */

/** Rail 呈现优先级（高→低）；仲裁只影响展示顺序，绝不丢弃任何状态 */
export const RAIL_PRIORITY: readonly SafetySemanticKey[] = [
  'writeback_failed',
  'session_invalid',
  'operation_failed',
  'conflict',
  'network_interrupted',
  'saveas_detected',
  'operation_in_progress',
  'writeback_in_progress',
  'saving',
  'writeback_success',
];
/**
 * SMB 错误分类器（design.md 1.1.3-D、2.6.2-F、1.2.1 约束 2）
 * 分类基于插件 reject 消息字符串匹配；unknown 兜底类始终可用；
 * 映射表为集中可配置常量（不修改插件前提下应对原生侧消息变化，R-03 缓解）。
 * 输出用户可读文案，不暴露技术细节（spec 5.7.1-R8）。
 */

export type SmbErrorCategory =
  | 'auth_failed'
  | 'timeout'
  | 'unreachable'
  | 'network_lost'
  | 'permission_denied'
  | 'disk_full'
  | 'conflict'
  | 'unknown';

export interface SmbErrorMapping {
  category: SmbErrorCategory;
  userMessage: string;
}

/** 正则匹配表（顺序即优先级：具体的在前，兜底在后） */
const ERROR_PATTERNS: ReadonlyArray<{ pattern: RegExp; category: SmbErrorCategory }> = [
  {
    pattern: /logon[_ ]failure|auth(?:entication|orization)?[_ ](?:failed|error)|credential|用户名或密码|password.*(incorrect|invalid|wrong)/i,
    category: 'auth_failed',
  },
  {
    pattern: /permission|access[_ ]denied|拒绝访问|forbidden/i,
    category: 'permission_denied',
  },
  {
    // TASK-S5-03：目标已存在/同名冲突（SmbClient.copyFile "目标已存在" 拒绝路径；
    // 顺序在 permission_denied 之后——两者模式互斥，先具体后兜底原则不破坏）
    pattern: /目标已存在|already[_ ]exist|file[_ ]exists|name[_ ]collision|conflict|冲突/i,
    category: 'conflict',
  },
  {
    pattern: /disk[_ ]full|no[_ ]space|space.*(full|不足)|磁盘(满|空间不足)|insufficient storage/i,
    category: 'disk_full',
  },
  {
    pattern: /timeout|timed?[ _]out|超时/i,
    category: 'timeout',
  },
  {
    pattern: /unreachable|unknown[_ ]host|connection[_ ]refused|no[_ ]route|name[_ ]or[_ ]service|bad[_ ]address|无法连接|不可达/i,
    category: 'unreachable',
  },
  {
    pattern: /network|network[_ ]name|reset|aborted|broken[_ ]pipe|断网|网络(中断|错误)/i,
    category: 'network_lost',
  },
];

/** 用户可读文案（集中配置；auth_failed 呈现统一文案避免可探测性，design.md 2.4.3） */
const CATEGORY_MESSAGES: Readonly<Record<SmbErrorCategory, string>> = {
  auth_failed: '用户名或密码不正确',
  timeout: '连接超时，请检查网络后重试',
  unreachable: '服务器无法连接，请检查网络或地址',
  network_lost: '网络连接中断，恢复后可继续',
  permission_denied: '没有访问该位置的权限',
  disk_full: '存储空间不足',
  conflict: '目标位置已存在同名文件',
  unknown: '操作失败，请重试',
};

/** 插件错误 → 结构化分类 + 用户可读文案；未识别消息兜底 unknown（始终可用） */
export function mapSmbError(error: unknown): SmbErrorMapping {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : error !== null && error !== undefined
          ? String(error)
          : '';

  for (const { pattern, category } of ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return { category, userMessage: CATEGORY_MESSAGES[category] };
    }
  }
  return { category: 'unknown', userMessage: CATEGORY_MESSAGES.unknown };
}

/** 分类 → 用户文案（供状态呈现层直接使用） */
export function categoryMessage(category: SmbErrorCategory): string {
  return CATEGORY_MESSAGES[category];
}
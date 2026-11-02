/**
 * rootPath 输入规范化与越界校验纯函数（TASK-RP-01）。
 *
 * 提供 rootPath 输入规范化的单一真相源，被 sanitizeProfile（持久层加载，静默丢弃）
 * 与 ConnectionFormPanel（表单提交，提示用户）共消费。
 *
 * 设计决策 D-RP-N01：规范化结果用判别联合（discriminated union）而非抛异常，
 * 使 sanitize（静默丢弃）与表单校验（提示用户）两个消费方能按场景选择处理策略，
 * 类型安全且无控制流跳变。
 *
 * 追溯：REQ-RP-10（输入规范化）、REQ-RP-11（越界片段拒绝）、REQ-RP-12（多级路径允许）、
 * REQ-RP-14/18（非法值容错），HC-01 零新增 npm 依赖。
 */

/**
 * normalizeRootPath 返回的判别联合类型。
 * - ok: true 时 value 为规范化后的非空字符串（不含首尾分隔符、不含 `..`、以 `\\` 分隔）
 * - ok: false 时 reason 标明失败类别：
 *   - 'empty'：规范化后为空串（如 `"   "` / `"/"` / `"\\"`）
 *   - 'parent_ref'：含 `..` 越界片段
 *   - 'invalid_type'：入参非字符串（如数字、null、对象）
 */
export type NormalizeRootPathResult =
  | { ok: true; value: string }
  | { ok: false; reason: 'empty' | 'parent_ref' | 'invalid_type' };

/**
 * 对 rootPath 原始输入进行规范化与校验，返回判别联合结果。
 *
 * 规范化步骤（顺序敏感，design.md 2.4.1）：
 * - S1 类型校验：`typeof raw !== 'string'` → `invalid_type`
 * - S2 trim 去首尾空白
 * - S3 循环去除前导/尾随 `/` 与 `\`
 * - S4 规范化后空串 → `empty`
 * - S5 分段：合并 `split('/')` 与 `split('\\')` 兼容两种分隔符输入
 * - S6 任一段 === `'..'` → `parent_ref`
 * - S7 以 `\\` 统一分隔符 join 重组
 *
 * @param raw 原始输入（表单提交值或持久层反序列化值，类型任意）
 * @returns 判别联合结果（不抛异常）
 */
export function normalizeRootPath(raw: unknown): NormalizeRootPathResult {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'invalid_type' };
  }

  let s = raw.trim();

  while (s.startsWith('/') || s.startsWith('\\')) {
    s = s.slice(1);
  }
  while (s.endsWith('/') || s.endsWith('\\')) {
    s = s.slice(0, -1);
  }

  if (s === '') {
    return { ok: false, reason: 'empty' };
  }

  const segments = s.split(/[\\/]/).filter((seg) => seg !== '');

  if (segments.some((seg) => seg === '..')) {
    return { ok: false, reason: 'parent_ref' };
  }

  return { ok: true, value: segments.join('\\') };
}
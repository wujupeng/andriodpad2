/**
 * 只读模式常量层（AU-005/AU-006，design.md 2.0 三层防御架构常量底座）。
 * 单一真相源：三层防线（UI 灰显 / operationStore 执行器守卫 / editSessionStore
 * 状态机收窄）均依赖此模块，不重复声明（REQ-MAINT-01）。
 *
 * AU-006: READ_ONLY_MODE 从全局 true 派生为 !WRITE_ENABLED_SCOPE.enabled。
 * 当前 enabled=false → READ_ONLY_MODE=true → 等价 AU-005 全拦截。
 * 服务器就绪后 enabled=true → READ_ONLY_MODE=false → 按权限矩阵选择性放行。
 */
import { WRITE_ENABLED_SCOPE } from './writePermission.ts';

/** 只读模式标志（从 WRITE_ENABLED_SCOPE 派生；REQ-REL-01、REQ-P4-04） */
export const READ_ONLY_MODE = !WRITE_ENABLED_SCOPE.enabled;

/**
 * 只读模式提示文案（R-NOTICE-01~05）。
 * 通用模板，零敏感字段——不含 SMB 凭据/服务器路径/文件内容（REQ-SEC-02、R-NOTICE-05）。
 */
export const READ_ONLY_NOTICES = {
  /** 菜单级只读标注徽章文案（R-NOTICE-01、R-FAS-06） */
  menuBadge: '只读模式',
  /** 操作被拦截时的提示文案（R-NOTICE-02） */
  operationBlock: '只读模式：该操作不可用',
  /** 用户返回 PAD2 时本地修改不写回的提示（R-NOTICE-03） */
  editReturnNotice: '只读模式：本地修改不会写回服务器',
  /** 灰显项副标题原因（R-FAS-03、R-FAS-08） */
  greyedReason: '只读模式：该操作不可用',
  /** edit 项禁用原因（R-FAS-07） */
  editDisabledReason: '只读模式：编辑不可用',
  /** writeback/saveas 路径禁用原因（R-ESS-02~04） */
  writebackDisabledReason: '只读模式：写回不可用',
  /** conflict OVERWRITE_CONFIRMED 禁用原因（R-ESS-04） */
  conflictOverwriteDisabledReason: '只读模式：覆盖写回不可用',
} as const;
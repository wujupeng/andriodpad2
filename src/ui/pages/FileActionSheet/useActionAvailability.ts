/**
 * useActionAvailability —— FileActionSheet 菜单项可用性计算（design.md 2.4.5 组件树、
 * TASK-S4-05）
 * 输入：entries（单文件 1 项 / 批量多项）、connectionState、capabilities；
 * 规则（design.md 2.4.5）：
 *   · isDirectory → 无"编辑/打开（WPS）"（目录点击本就直接进入）
 *   · connectionState ≠ connected → 远程操作全部禁用（灰显 + "未连接"提示）
 *   · isWpsInstalled() 预检失败 → "编辑"禁用（spec 5.6.3 异常 5 呈现原因）
 *   · 能力集不含对应能力 → 灰显（OPERATION_CAPABILITIES，S4-04 披露）
 * WPS 预检异步：挂载时一次性检测缓存（installed/unknown 三态——unknown 时不禁用，
 * 点击分发时兜底复核，避免网络/桥接抖动误伤）。
 */
import { useEffect, useMemo, useState } from 'react';
import type { SmbFileEntry } from '../../../adapter/smb/SmbPlugin';
import type { SmbConnectionState } from '../../../state/smbConnectionStore';
import { OPERATION_CAPABILITIES } from '../../../state/operationStore';
import { operationPluginBridge } from '../../../state/operationStore';
import { READ_ONLY_NOTICES } from '../../../state/readOnlyMode';

export type FileActionId = 'open' | 'edit' | 'copy' | 'move' | 'rename' | 'delete' | 'info';

export interface ActionAvailability {
  enabled: boolean;
  /** 禁用原因（灰显项悬浮/副标题呈现） */
  reason?: string;
}

export type ActionAvailabilityMap = Record<FileActionId, ActionAvailability>;

export interface UseActionAvailabilityInput {
  entries: SmbFileEntry[];
  connectionState: SmbConnectionState;
  /** 文件来源（远程 SMB / 本地——删除双语义判定） */
  source: 'remote' | 'local';
}

type WpsCheckState = 'checking' | 'installed' | 'not-installed' | 'unknown';

export function useActionAvailability({
  entries,
  connectionState,
  source,
}: UseActionAvailabilityInput): ActionAvailabilityMap {
  const [wpsState, setWpsState] = useState<WpsCheckState>('checking');

  useEffect(() => {
    let disposed = false;
    setWpsState('checking');
    operationPluginBridge
      .isWpsInstalled()
      .then((result) => {
        if (disposed) return;
        setWpsState(result.installed ? 'installed' : 'not-installed');
      })
      .catch(() => {
        if (disposed) return;
        // 预检桥接失败（web 环境无插件实现等）：unknown 不禁用，点击分发时兜底复核
        setWpsState('unknown');
      });
    return () => {
      disposed = true;
    };
  }, []);

  return useMemo(() => {
    const anyDirectory = entries.some((e) => e.isDirectory);
    const connected = connectionState === 'connected';

    const notAvailable = (cap: boolean, capReason: string): ActionAvailability =>
      connected ? { enabled: cap, reason: cap ? undefined : capReason } : { enabled: false, reason: '未连接' };

    // 打开/编辑：批量模式隐藏（ActionList 按批量分支渲染）；目录无此二项
    const wpsUnavailable: ActionAvailability =
      wpsState === 'not-installed'
        ? { enabled: false, reason: '设备上未安装 WPS Office' }
        : connected
          ? { enabled: true }
          : { enabled: false, reason: '未连接' };

    return {
      // 打开（预览）：目录无（目录点击本就直接进入，design.md 2.4.5）
      open: anyDirectory ? { enabled: false, reason: '目录无需打开' } : wpsUnavailable,
      // AU-005 只读模式：edit 恒禁用，不依赖 wpsState（R-FAS-07）
      edit: { enabled: false, reason: READ_ONLY_NOTICES.editDisabledReason },
      // AU-005 只读模式：写操作经能力表恒禁用（R-FAS-08）
      copy: anyDirectory
        ? { enabled: false, reason: '暂不支持文件夹操作' }
        : notAvailable(OPERATION_CAPABILITIES.copy, READ_ONLY_NOTICES.greyedReason),
      move: anyDirectory
        ? { enabled: false, reason: '暂不支持文件夹操作' }
        : notAvailable(OPERATION_CAPABILITIES.move, READ_ONLY_NOTICES.greyedReason),
      rename: anyDirectory
        ? { enabled: false, reason: '暂不支持文件夹操作' }
        : notAvailable(OPERATION_CAPABILITIES.rename, READ_ONLY_NOTICES.greyedReason),
      delete:
        source === 'local'
          ? { enabled: true }
          : anyDirectory
            ? { enabled: false, reason: '暂不支持删除文件夹' }
            : notAvailable(OPERATION_CAPABILITIES.deleteRemote, READ_ONLY_NOTICES.greyedReason),
      // 属性：目录与文件均可用（getFileAttributes 前端方法已暴露）
      info: connected ? { enabled: true } : { enabled: false, reason: '未连接' },
    };
  }, [entries, connectionState, source, wpsState]);
}
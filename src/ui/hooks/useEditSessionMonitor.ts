/**
 * useEditSessionMonitor —— 拉模式状态自动推进（design.md 2.6.2-E、1.2.1 约束 1）
 * 仅活跃会话轮询（默认 5000ms）。
 * - appStateChange：前台检测后触发——应用回到前台时经 foregroundCheck 检测变更，非 WPS 保存时即时触发
 * - 5s 轮询 checkRemoteChanged：冲突监控（仅 opened/editing 态生效）
 * - 应用在后台时不触发任何检测或写回
 */
import { useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { useEditSessionStore } from '../../state/editSessionStore';
import type { EditSessionState } from '../../state/editSessionStore';
import SmbPlugin from '../../adapter/smb/SmbPlugin';
import { READ_ONLY_MODE } from '../../state/readOnlyMode';

export interface EditSessionMonitorOptions {
  pollIntervalMs?: number;
  onStateChange?: (next: EditSessionState) => void;
}

export interface EditSessionMonitorResult {
  monitoring: boolean;
}

export function useEditSessionMonitor(
  options: EditSessionMonitorOptions = {},
): EditSessionMonitorResult {
  const { pollIntervalMs = 5000, onStateChange } = options;
  const [monitoring, setMonitoring] = useState(false);
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  const sessionState = useEditSessionStore((s) => s.state);

  useEffect(() => {
    const prev = sessionState;
    onStateChangeRef.current?.(sessionState);
    return () => { void prev; };
  }, [sessionState]);

  useEffect(() => {
    // AU-005 只读模式：active 条件收窄，去掉 'editing'（只读模式下不可达）（R-ESS-07）
    const active = sessionState === 'opened' || (!READ_ONLY_MODE && sessionState === 'editing');
    if (!active) {
      setMonitoring(false);
      return;
    }
    setMonitoring(true);

    let cancelled = false;
    let listener: { remove: () => Promise<void> } | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    (async () => {
      // 前台检测后触发：应用回到前台时经 SmbPlugin.foregroundCheck() 拉取 FileObserver 缓存的保存事件结果。
      // isActive=false（后台）时直接 return，不触发写回。
      listener = await App.addListener('appStateChange', async ({ isActive }) => {
        if (!isActive || cancelled) return;
        const store = useEditSessionStore.getState();
        store.notifyAppStateChange(true);
        try {
          const result = await SmbPlugin.foregroundCheck();
          if (!cancelled) store.applyForegroundCheckResult(result);
        } catch { /* 轮询失败不阻塞 */ }
      });
    })();

    // AU-005 只读模式：禁用 checkRemoteChanged 轮询（conflict 态不可达，轮询空耗无意义）（R-ESS-07）
    if (!READ_ONLY_MODE) {
      intervalId = setInterval(async () => {
        if (cancelled) return;
        const store = useEditSessionStore.getState();
        if (store.state !== 'opened' && store.state !== 'editing') return;
        try {
          const result = await SmbPlugin.checkRemoteChanged();
          if (!cancelled) store.applyRemoteCheckResult(result);
        } catch { /* 轮询失败不阻塞 */ }
      }, pollIntervalMs);
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (listener) void listener.remove();
      setMonitoring(false);
    };
  }, [sessionState, pollIntervalMs]);

  return { monitoring };
}
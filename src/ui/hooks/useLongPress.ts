/**
 * useLongPress —— 500ms 长按（多选入口，design.md 2.6.2-E、2.3.3-D，TASK-S4-02 实现）
 * pointerdown 启动 500ms 计时；pointerup 未满 → onPress（短按）；
 * pointermove 位移超过滑动阈值（10px）→ 取消长按且吞掉短按（滑动手势）；
 * cancelOnMove=false 时移动不取消（默认 true，design.md "移动取消"）。
 * handlers 经 ref 持有最新值，避免闭包过期。接口签名冻结于 S1-09（R-07）。
 */
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

const LONG_PRESS_MS = 500;
const MOVE_CANCEL_PX = 10;

export interface LongPressHandlers {
  onLongPress: () => void;
  onPress: () => void;
  cancelOnMove?: boolean;
}

export interface LongPressResult<T extends HTMLElement> {
  ref: RefObject<T>;
}

export function useLongPress<T extends HTMLElement>(
  handlers: LongPressHandlers,
): LongPressResult<T> {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const elementRef = useRef<T>(null);
  const timerRef = useRef<number | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const longPressFiredRef = useRef(false);
  const moveCancelledRef = useRef(false);

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      longPressFiredRef.current = false;
      moveCancelledRef.current = false;
      originRef.current = { x: event.clientX, y: event.clientY };
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        longPressFiredRef.current = true;
        handlersRef.current.onLongPress();
      }, LONG_PRESS_MS);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (timerRef.current === null) return;
      if (handlersRef.current.cancelOnMove === false) return;
      const origin = originRef.current;
      if (!origin) return;
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) {
        moveCancelledRef.current = true;
        clearTimer();
      }
    };

    const handlePointerUp = () => {
      clearTimer();
      originRef.current = null;
      if (longPressFiredRef.current) return; // 长按已触发，不再短按
      if (moveCancelledRef.current) return; // 滑动手势，吞掉短按
      handlersRef.current.onPress();
    };

    const handlePointerCancel = () => {
      clearTimer();
      originRef.current = null;
      moveCancelledRef.current = true;
    };

    /** 长按触发后的合成 click 拦截（capture）：
     *  pointerup 后浏览器仍派发 click——若放行会命中外层 onClick（如 ListRow
     *  多选切换）把长按刚选中的项又 toggle 掉（TASK-S4-03 真机验证发现的缺陷）。
     *  拦截一次后复位，不影响后续正常点击。 */
    const handleClickCapture = (event: Event) => {
      if (longPressFiredRef.current) {
        event.stopPropagation();
        event.preventDefault();
        longPressFiredRef.current = false;
      }
    };

    el.addEventListener('pointerdown', handlePointerDown);
    el.addEventListener('pointermove', handlePointerMove);
    el.addEventListener('pointerup', handlePointerUp);
    el.addEventListener('pointercancel', handlePointerCancel);
    el.addEventListener('click', handleClickCapture, true);
    return () => {
      clearTimer();
      el.removeEventListener('pointerdown', handlePointerDown);
      el.removeEventListener('pointermove', handlePointerMove);
      el.removeEventListener('pointerup', handlePointerUp);
      el.removeEventListener('pointercancel', handlePointerCancel);
      el.removeEventListener('click', handleClickCapture, true);
    };
  }, []);

  return { ref: elementRef };
}

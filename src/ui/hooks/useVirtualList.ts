/**
 * useVirtualList —— D-05 自研虚拟化（design.md 2.6.2-E、2.4.4，TASK-S4-02 实现）
 * 固定行高窗口化：可视区 ± overscan（默认 8）；scroll 事件 + rAF 节流更新；
 * totalHeight 撑高容器 + offsetY 首项偏移（消费方 absolute 定位 + translateY）；
 * scrollToTop 排序/搜索变更后归零（design.md 2.4.4：scrollTop 归零）。
 * 零新增依赖（D-05 选型理由③）；回退预案 R-01：滚动异常时改分页加载
 * （签名不变，FileList 内部替换实现）。
 * 视口高度来源：scroll 事件 currentTarget.clientHeight 实时记录；
 * 初始未滚动时以 window.innerHeight 近似（WebView 全屏列表场景），无 DOM 时为 0。
 * 接口签名冻结于 S1-09（R-07），本任务零接口变更（仅填充实现）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UIEventHandler } from 'react';

export interface VirtualListResult<T> {
  visibleItems: { item: T; index: number }[];
  totalHeight: number;
  offsetY: number;
  onScroll: UIEventHandler<HTMLElement>;
  scrollToTop(): void;
}

export interface VisibleRangeInput {
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  total: number;
  overscan: number;
}

export interface VisibleRange {
  startIndex: number;
  endIndex: number;
  offsetY: number;
}

/** 窗口计算纯函数（供单元等价验证与 hook 共用） */
export function computeVisibleRange({
  scrollTop,
  viewportHeight,
  rowHeight,
  total,
  overscan,
}: VisibleRangeInput): VisibleRange {
  if (total <= 0 || rowHeight <= 0) {
    return { startIndex: 0, endIndex: -1, offsetY: 0 };
  }
  const firstVisible = Math.floor(scrollTop / rowHeight);
  const visibleCount = Math.ceil(viewportHeight / rowHeight);
  // 钳制到 [0, total)，容负 scrollTop（iOS 回弹）
  const startIndex = Math.max(0, Math.min(total - 1, firstVisible - overscan));
  const lastVisible = firstVisible + Math.max(1, visibleCount);
  const endIndex = Math.min(total - 1, lastVisible + overscan);
  return { startIndex, endIndex, offsetY: startIndex * rowHeight };
}

const DEFAULT_OVERSCAN = 8;

export function useVirtualList<T>(
  items: T[],
  options: { rowHeight: number; overscan?: number },
): VirtualListResult<T> {
  const { rowHeight } = options;
  const overscan = options.overscan ?? DEFAULT_OVERSCAN;

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 0,
  );
  const containerRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef<number | null>(null);

  /** 滚动容器引用捕获 + rAF 节流 state 更新 */
  const onScroll = useCallback<UIEventHandler<HTMLElement>>((event) => {
    const el = event.currentTarget;
    containerRef.current = el;
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      setScrollTop(el.scrollTop);
      setViewportHeight(el.clientHeight || el.offsetHeight || 0);
    });
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const scrollToTop = useCallback(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTo({ top: 0 });
      if (el.clientHeight) setViewportHeight(el.clientHeight);
    }
    setScrollTop(0);
  }, []);

  const total = items.length;
  const { startIndex, endIndex, offsetY } = computeVisibleRange({
    scrollTop,
    viewportHeight,
    rowHeight,
    total,
    overscan,
  });

  const visibleItems: { item: T; index: number }[] = [];
  for (let i = startIndex; i <= endIndex; i += 1) {
    visibleItems.push({ item: items[i], index: i });
  }

  return {
    visibleItems,
    totalHeight: total * rowHeight,
    offsetY,
    onScroll,
    scrollToTop,
  };
}
import { useRef, useState, useEffect, useCallback } from 'react';

export interface BrowseHistory {
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
}

export function useBrowseHistory(
  currentPath: string,
  enterDirectory: (path: string) => void
): BrowseHistory {
  const backStackRef = useRef<string[]>([]);
  const forwardStackRef = useRef<string[]>([]);
  const prevPathRef = useRef(currentPath);
  const isNavigatingRef = useRef(false);
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (currentPath !== prevPathRef.current) {
      if (!isNavigatingRef.current) {
        backStackRef.current.push(prevPathRef.current);
        forwardStackRef.current = [];
      }
      prevPathRef.current = currentPath;
      isNavigatingRef.current = false;
      forceRender((n) => n + 1);
    }
  }, [currentPath]);

  const goBack = useCallback(() => {
    const back = backStackRef.current;
    if (back.length === 0) return;
    const prev = back.pop()!;
    forwardStackRef.current.push(prevPathRef.current);
    isNavigatingRef.current = true;
    enterDirectory(prev);
    forceRender((n) => n + 1);
  }, [enterDirectory]);

  const goForward = useCallback(() => {
    const fwd = forwardStackRef.current;
    if (fwd.length === 0) return;
    const next = fwd.pop()!;
    backStackRef.current.push(prevPathRef.current);
    isNavigatingRef.current = true;
    enterDirectory(next);
    forceRender((n) => n + 1);
  }, [enterDirectory]);

  return {
    canGoBack: backStackRef.current.length > 0,
    canGoForward: forwardStackRef.current.length > 0,
    goBack,
    goForward,
  };
}
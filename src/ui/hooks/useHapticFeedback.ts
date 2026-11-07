import { useCallback } from 'react';

export function useHapticFeedback(): { trigger: () => void } {
  const trigger = useCallback((): void => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10);
    }
  }, []);
  return { trigger };
}
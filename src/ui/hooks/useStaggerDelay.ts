export function useStaggerDelay(index: number, step: number = 40): string {
  if (index < 0) return '0ms';
  return `${index * step}ms`;
}
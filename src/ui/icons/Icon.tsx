/**
 * PAD2 通用图标组件（design.md 2.3.4）
 * 24×24 viewBox，线性 stroke 1.5px round / 状态图标填充型，currentColor 联动文字令牌。
 */
import type { CSSProperties } from 'react';
import { iconRegistry, type IconName } from './registry';

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 24, className, style }: IconProps) {
  const def = iconRegistry[name];
  if (!def) {
    return null;
  }

  const commonProps = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    className,
    style,
    'aria-hidden': true,
    focusable: false,
  } as const;

  const spinStyle: CSSProperties | undefined = def.spin
    ? { animation: 'pad2-spin 800ms linear infinite' }
    : undefined;
  const mergedStyle: CSSProperties | undefined = spinStyle
    ? { ...style, ...spinStyle }
    : style;

  return (
    <svg
      {...commonProps}
      style={mergedStyle}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {def.variant === 'themed' && def.path && (
        <path
          d={def.path}
          fill="var(--pad2-color-brand-50)"
          stroke="var(--pad2-color-brand-500)"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      )}

      {def.variant === 'fill' && (
        <>
          {def.path && <path d={def.path} fill="currentColor" />}
          {def.extraFills?.map((d) => (
            <path key={d} d={d} fill="currentColor" />
          ))}
          {def.contrastPaths?.map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke="var(--pad2-color-bg-surface)"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {def.contrastDots?.map(({ cx, cy }) => (
            <circle
              key={`${cx}-${cy}`}
              cx={cx}
              cy={cy}
              r={0.9}
              fill="var(--pad2-color-bg-surface)"
            />
          ))}
        </>
      )}

      {def.variant === 'line' && (
        <>
          {def.path && (
            <path
              d={def.path}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {def.strokes?.map((d) => (
            <path
              key={d}
              d={d}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {def.strokeCircles?.map(({ cx, cy, r }) => (
            <circle
              key={`${cx}-${cy}-${r}`}
              cx={cx}
              cy={cy}
              r={r}
              stroke="currentColor"
              strokeWidth={1.5}
            />
          ))}
        </>
      )}
    </svg>
  );
}

export type { IconName };
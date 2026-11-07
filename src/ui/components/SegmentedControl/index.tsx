import type { ReactNode } from 'react';
import styles from './style.module.css';

export interface SegmentedOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

export interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string | null;
  onChange: (value: string) => void;
  ariaLabel: string;
}

export function SegmentedControl({ options, value, onChange, ariaLabel }: SegmentedControlProps) {
  return (
    <div className={styles.container} role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={`${styles.segment} ${isActive ? styles.segmentActive : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            <span className={styles.segmentLabel}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
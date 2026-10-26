/**
 * 表单字段（design.md 2.4.3，TASK-S3-03）
 * label + 圆角输入框 + 内联校验提示位（danger caption，spec 5.3.1-R8，
 * 禁止仅弹窗）；密码变体内置 icon-eye/icon-eye-off 显隐切换
 * （spec 5.3.1-R2、spec 4.3-1 掩码）；输入高度 48px 触控目标、
 * 焦点反馈 brand 边框 + 浅色聚焦环（方向 B 轻盈，spec 5.3.1-R9）。
 */
import { useId, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Icon } from '../../../icons/Icon';
import styles from './style.module.css';

export interface FormFieldProps {
  label: string;
  value: string;
  onChange(value: string): void;
  type?: 'text' | 'password';
  placeholder?: string;
  /** 内联校验提示（danger caption；空值不呈现） */
  error?: string | null;
  /** 辅助说明（caption 三级色；error 存在时让位于 error） */
  hint?: string;
  required?: boolean;
  /** 密码显隐切换（仅 type=password 生效，默认开启） */
  passwordToggle?: boolean;
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
  autoComplete?: string;
}

export function FormField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  error,
  hint,
  required = false,
  passwordToggle = true,
  inputMode,
  autoComplete,
}: FormFieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const fieldId = useId();
  const errorId = useId();

  const isPassword = type === 'password';
  const effectiveType = isPassword && showPassword ? 'text' : type;

  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={fieldId}>
        {label}
        {required && (
          <span className={styles.fieldRequired} aria-hidden>
            *
          </span>
        )}
      </label>
      <div className={styles.inputWrap}>
        <input
          id={fieldId}
          className={`${styles.input} ${error ? styles['input--error'] : ''}`}
          type={effectiveType}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          inputMode={inputMode}
          autoComplete={autoComplete}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {isPassword && passwordToggle && (
          <button
            type="button"
            className={styles.toggleButton}
            aria-label={showPassword ? '隐藏密码' : '显示密码'}
            onClick={() => setShowPassword((prev) => !prev)}
          >
            <Icon name={showPassword ? 'icon-eye-off' : 'icon-eye'} size={20} />
          </button>
        )}
      </div>
      {error ? (
        <span id={errorId} className={styles.errorText} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className={styles.hintText}>{hint}</span>
      ) : null}
    </div>
  );
}
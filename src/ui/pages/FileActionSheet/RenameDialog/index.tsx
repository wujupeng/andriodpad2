/**
 * RenameDialog —— 重命名对话框（design.md 2.4.5，TASK-S4-05，spec 5.5.1-R4）
 * 行内输入 + 三类校验：非法字符（\/:*?"<>|）/ 超长（>255）/ 目标重名；
 * 失败内联 danger 提示；确认按钮禁用至合法。
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '../../../components/Dialog';
import { FormField } from '../../ConnectionPage/FormField';
import styles from '../style.module.css';

const ILLEGAL_CHARS = /[/\\:*?"<>|]/;
const MAX_NAME_LENGTH = 255;

export type RenameValidation =
  | { kind: 'ok' }
  | { kind: 'empty' }
  | { kind: 'illegal'; chars: string }
  | { kind: 'too-long'; length: number }
  | { kind: 'duplicate' };

/** 重命名合法性校验（纯函数，供测试与对话框共用） */
export function validateRename(
  newName: string,
  existingNames: string[],
  currentName: string,
): RenameValidation {
  const trimmed = newName.trim();
  if (!trimmed) return { kind: 'empty' };
  const illegalMatch = trimmed.match(ILLEGAL_CHARS);
  if (illegalMatch) return { kind: 'illegal', chars: illegalMatch.join(' ') };
  if (trimmed.length > MAX_NAME_LENGTH) return { kind: 'too-long', length: trimmed.length };
  // 目标重名：同目录既有名（忽略自身原名——原名输入等同未改）
  if (
    trimmed !== currentName &&
    existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())
  ) {
    return { kind: 'duplicate' };
  }
  return { kind: 'ok' };
}

function validationMessage(v: RenameValidation): string | null {
  switch (v.kind) {
    case 'empty':
      return '请输入名称';
    case 'illegal':
      return `名称不能包含以下字符：${v.chars}`;
    case 'too-long':
      return `名称过长（${v.length} 字符，上限 ${MAX_NAME_LENGTH}）`;
    case 'duplicate':
      return '同名项目已存在，请换一个名称';
    default:
      return null;
  }
}

export interface RenameDialogProps {
  currentName: string;
  /** 同目录既有名（重名校验输入） */
  existingNames: string[];
  open: boolean;
  onConfirm(newName: string): void;
  onDismiss(): void;
}

export function RenameDialog({
  currentName,
  existingNames,
  open,
  onConfirm,
  onDismiss,
}: RenameDialogProps) {
  const [value, setValue] = useState(currentName);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(currentName);
      setTouched(false);
    }
  }, [open, currentName]);

  const validation = useMemo(
    () => validateRename(value, existingNames, currentName),
    [value, existingNames, currentName],
  );
  const error = touched ? validationMessage(validation) : null;
  const legal = validation.kind === 'ok' && value.trim() !== '';

  if (!open) return null;

  return (
    <Dialog
      title="重命名"
      confirmLabel="重命名"
      onConfirm={legal ? () => onConfirm(value.trim()) : undefined}
      onDismiss={onDismiss}
    >
      <div className={styles.renameBody}>
        <FormField
          label="新名称"
          required
          value={value}
          onChange={(next) => {
            setValue(next);
            setTouched(true);
          }}
          placeholder={currentName}
          error={error}
        />
        <p className={styles.renameHint}>原名称：{currentName}</p>
      </div>
    </Dialog>
  );
}
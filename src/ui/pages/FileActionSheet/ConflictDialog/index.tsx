/**
 * ConflictDialog —— 冲突四选一（design.md 2.4.5，TASK-S4-05，spec 5.5.1-R9/R10）
 * 复制/移动目标存在同名时呈现：跳过 / 覆盖 / 保留两者（自动重命名
 * "文件名 (2)"）/ 重命名（行内输入）。任何路径不得静默覆盖——
 * 默认不选中任何选项，用户必须显式选择；"覆盖"为 danger 语义呈现。
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '../../../components/Dialog';
import { FormField } from '../../ConnectionPage/FormField';
import { validateRename } from '../RenameDialog';
import styles from '../style.module.css';

export type ConflictChoice =
  | { kind: 'skip' }
  | { kind: 'overwrite' }
  | { kind: 'keep-both' }
  | { kind: 'rename'; newName: string };

type OptionId = 'skip' | 'overwrite' | 'keep-both' | 'rename';

export interface ConflictDialogProps {
  /** 冲突文件名 */
  fileName: string;
  /** 目标目录既有名（重命名路径校验输入） */
  existingNames: string[];
  open: boolean;
  onResolve(choice: ConflictChoice): void;
  onDismiss(): void;
}

/** 保留两者：自动重命名建议（"名称 (2)"，扩展名保留） */
export function buildKeepBothName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return `${fileName} (2)`;
  return `${fileName.slice(0, dot)} (2)${fileName.slice(dot)}`;
}

export function ConflictDialog({
  fileName,
  existingNames,
  open,
  onResolve,
  onDismiss,
}: ConflictDialogProps) {
  const [selected, setSelected] = useState<OptionId | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(null);
      setRenameValue('');
      setTouched(false);
    }
  }, [open]);

  const keepBothName = useMemo(() => buildKeepBothName(fileName), [fileName]);

  const renameValidation = useMemo(
    () => (selected === 'rename' ? validateRename(renameValue, existingNames, '') : null),
    [selected, renameValue, existingNames],
  );
  const renameError =
    touched && renameValidation && renameValidation.kind !== 'ok'
      ? renameValidation.kind === 'empty'
        ? '请输入名称'
        : renameValidation.kind === 'illegal'
          ? '名称包含非法字符'
          : renameValidation.kind === 'too-long'
            ? '名称过长'
            : '同名项目已存在'
      : null;

  const options: Array<{
    id: OptionId;
    label: string;
    description: string;
    danger?: boolean;
  }> = [
    { id: 'skip', label: '跳过', description: '不处理此文件，保留目标目录原文件' },
    {
      id: 'overwrite',
      label: '覆盖',
      description: '覆盖目标目录同名文件（原文件将丢失）',
      danger: true,
    },
    { id: 'keep-both', label: '保留两者', description: `自动重命名为"${keepBothName}"` },
    { id: 'rename', label: '重命名', description: '为此文件输入新名称' },
  ];

  if (!open) return null;

  const canConfirm =
    selected === 'skip' ||
    selected === 'overwrite' ||
    selected === 'keep-both' ||
    (selected === 'rename' && renameValidation?.kind === 'ok');

  const handleConfirm = () => {
    switch (selected) {
      case 'skip':
        onResolve({ kind: 'skip' });
        break;
      case 'overwrite':
        onResolve({ kind: 'overwrite' });
        break;
      case 'keep-both':
        onResolve({ kind: 'keep-both' });
        break;
      case 'rename':
        if (renameValidation?.kind === 'ok') onResolve({ kind: 'rename', newName: renameValue.trim() });
        break;
    }
  };

  return (
    <Dialog
      title="目标已存在同名文件"
      confirmLabel="确定"
      onConfirm={canConfirm ? handleConfirm : undefined}
      onDismiss={onDismiss}
    >
      <div className={styles.conflictBody}>
        <p className={styles.conflictFile}>
          "{fileName}"在目标目录已存在，请选择处理方式：
        </p>
        <div className={styles.conflictOptions} role="radiogroup" aria-label="冲突处理方式">
          {options.map((option) => (
            <label
              key={option.id}
              className={`${styles.conflictOption} ${selected === option.id ? styles.conflictOptionSelected : ''} ${option.danger ? styles.conflictOptionDanger : ''}`}
            >
              <input
                type="radio"
                name="conflict-choice"
                checked={selected === option.id}
                onChange={() => setSelected(option.id)}
              />
              <span className={styles.conflictOptionTexts}>
                <span
                  className={`${styles.conflictOptionLabel} ${option.danger ? styles.dangerText : ''}`}
                >
                  {option.label}
                </span>
                <span className={styles.conflictOptionDesc}>{option.description}</span>
              </span>
            </label>
          ))}
        </div>
        {selected === 'rename' && (
          <FormField
            label="新名称"
            required
            value={renameValue}
            onChange={(next) => {
              setRenameValue(next);
              setTouched(true);
            }}
            placeholder={keepBothName}
            error={renameError}
          />
        )}
      </div>
    </Dialog>
  );
}
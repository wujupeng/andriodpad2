/**
 * DestinationPickerDialog —— 目标目录选择（design.md 2.4.5，TASK-S4-05）
 * 起点为当前浏览目录；子目录列表点选进入（ListRow）+ 返回上级；
 * "新建文件夹"（ensureDirectory 前端方法已暴露，OPERATION_CAPABILITIES.createDirectory）；
 * 目录数据经 operationPluginBridge.listDirectory（store 桥接，分层规则）。
 * 确认后回调目标路径（消费方入队 operationStore.enqueueCopy/Move）。
 */
import { useCallback, useEffect, useState } from 'react';
import { Dialog } from '../../../components/Dialog';
import { ListRow } from '../../../components/ListRow';
import { BaseButton } from '../../../components/BaseButton';
import { Icon } from '../../../icons/Icon';
import { operationPluginBridge } from '../../../../state/operationStore';
import type { SmbFileEntry } from '../../../../adapter/smb/SmbPlugin';
import styles from '../style.module.css';

export interface DestinationPickerDialogProps {
  open: boolean;
  /** 起始目录（当前浏览目录） */
  initialDirectory: string;
  /** 供冲突预判的目标目录既有名（进入目录时刷新） */
  onConfirm(destination: string): void;
  onDismiss(): void;
}

function parentOf(path: string): string {
  if (!path.includes('\\')) return '';
  return path.substring(0, path.lastIndexOf('\\'));
}

export function DestinationPickerDialog({
  open,
  initialDirectory,
  onConfirm,
  onDismiss,
}: DestinationPickerDialogProps) {
  const [current, setCurrent] = useState(initialDirectory);
  const [directories, setDirectories] = useState<SmbFileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      setCurrent(initialDirectory);
      setNewFolderName('');
      setError(null);
    }
  }, [open, initialDirectory]);

  const loadDir = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await operationPluginBridge.listDirectory({ path: path || undefined });
      setDirectories(result.files.filter((f) => f.isDirectory));
    } catch (e) {
      setError(e instanceof Error ? e.message : '目录读取失败');
      setDirectories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadDir(current);
  }, [open, current, loadDir]);

  if (!open) return null;

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const target = current ? `${current}\\${name}` : name;
      await operationPluginBridge.ensureDirectory({ path: target });
      setNewFolderName('');
      await loadDir(current);
    } catch (e) {
      setError(e instanceof Error ? e.message : '新建文件夹失败');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog
      title="选择目标目录"
      confirmLabel="选此处"
      onConfirm={() => onConfirm(current)}
      onDismiss={onDismiss}
    >
      <div className={styles.pickerBody}>
        <p className={styles.pickerPath}>当前：{current || '（共享根目录）'}</p>
        {error && <p className={styles.pickerError}>{error}</p>}
        {loading && <p className={styles.pickerHint}>加载中…</p>}
        <div className={styles.pickerList}>
          {current && (
            <ListRow
              icon={<Icon name="icon-arrow-left" size={22} />}
              title="返回上级"
              subtitle={parentOf(current) || '（共享根目录）'}
              onPress={() => setCurrent(parentOf(current))}
            />
          )}
          {directories.map((dir) => (
            <ListRow
              key={dir.path}
              icon={<Icon name="icon-folder" size={22} />}
              title={dir.name}
              subtitle="文件夹"
              onPress={() => setCurrent(dir.path)}
            />
          ))}
          {!loading && directories.length === 0 && !error && (
            <p className={styles.pickerHint}>此目录没有子文件夹</p>
          )}
        </div>
        <div className={styles.pickerNewFolder}>
          <input
            type="text"
            className={styles.pickerInput}
            value={newFolderName}
            placeholder="新建文件夹名称"
            aria-label="新建文件夹名称"
            onChange={(event) => setNewFolderName(event.target.value)}
          />
          <BaseButton
            variant="secondary"
            size="sm"
            disabled={!newFolderName.trim() || creating}
            onPress={() => void handleCreateFolder()}
          >
            新建文件夹
          </BaseButton>
        </div>
      </div>
    </Dialog>
  );
}
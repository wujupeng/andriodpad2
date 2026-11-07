/**
 * DestinationPickerDialog —— 目标目录选择（design.md 2.4.5，TASK-S4-05）
 * TASK-LSO-22：增加「本地存储」目标分区，可浏览本地目录选为目标。
 * TASK-LSO-23：SMB 离线连接标注不可选。
 * onConfirm 扩展第二参数 type（向后兼容，缺省 'smb'）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from '../../../components/Dialog';
import { ListRow } from '../../../components/ListRow';
import { BaseButton } from '../../../components/BaseButton';
import { Icon } from '../../../icons/Icon';
import { operationPluginBridge, OPERATION_CAPABILITIES, LOCAL_CAPABILITIES } from '../../../../state/operationStore';
import { useSmbMultiConnStore } from '../../../../state/smbMultiConnStore';
import { useSmbProfilesStore } from '../../../../state/smbProfilesStore';
import { resolveInitialPath } from '../../../../state/browseContextStore';
import { LocalFsAdapter } from '../../../../adapter/local/LocalFsAdapter';
import type { SmbFileEntry } from '../../../../adapter/smb/SmbPlugin';
import styles from '../style.module.css';

export interface DestinationPickerDialogProps {
  open: boolean;
  /** 起始目录（当前浏览目录） */
  initialDirectory: string;
  /** 源类型（决定默认目标分区：local 源默认显示 SMB+本地，smb 源默认显示 SMB） */
  sourceType?: 'local' | 'smb';
  /** 确认回调，type 标识目标类型（向后兼容，缺省 'smb'） */
  onConfirm(destination: string, type?: 'local' | 'smb'): void;
  onDismiss(): void;
}

function parentOfSmb(path: string): string {
  if (!path.includes('\\')) return '';
  return path.substring(0, path.lastIndexOf('\\'));
}

function parentOfLocal(path: string): string {
  if (!path.includes('/')) return '';
  return path.substring(0, path.lastIndexOf('/'));
}

export function DestinationPickerDialog({
  open,
  initialDirectory,
  sourceType = 'smb',
  onConfirm,
  onDismiss,
}: DestinationPickerDialogProps) {
  const [targetMode, setTargetMode] = useState<'smb' | 'local'>(sourceType === 'local' ? 'smb' : 'smb');
  const [current, setCurrent] = useState(initialDirectory);
  const [directories, setDirectories] = useState<SmbFileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const localLoadTokenRef = useRef(0);

  const activeHandles = useSmbMultiConnStore((s) => s.activeHandles());
  const smbConnected = activeHandles.length > 0;
  const shareSelectorVisible = targetMode === 'smb' && activeHandles.length >= 2;

  useEffect(() => {
    if (open) {
      setTargetMode(sourceType === 'local' ? 'smb' : 'smb');
      const hotId = useSmbMultiConnStore.getState().hotProfileId;
      setSelectedProfileId(hotId);
      const profile = hotId ? useSmbProfilesStore.getState().profiles.find((p) => p.id === hotId) : undefined;
      setCurrent(resolveInitialPath(profile?.rootPath));
      setNewFolderName('');
      setError(null);
    }
  }, [open, sourceType]);

  const loadDir = useCallback(async (path: string, mode: 'smb' | 'local') => {
    const myToken = ++localLoadTokenRef.current;
    setLoading(true);
    setError(null);
    try {
      if (mode === 'local') {
        const result = await LocalFsAdapter.listDirectory(path);
        if (myToken !== localLoadTokenRef.current) return;
        setDirectories(result.files.filter((f) => f.isDirectory) as SmbFileEntry[]);
      } else {
        const multiConn = useSmbMultiConnStore.getState();
        const handle = selectedProfileId ? multiConn.getHandle(selectedProfileId) : undefined;
        if (handle && !handle.isHot && handle.state === 'connected') {
          await multiConn.switchHotTo(selectedProfileId!);
        }
        if (myToken !== localLoadTokenRef.current) return;
        const result = await operationPluginBridge.listDirectory({ path: path || undefined });
        if (myToken !== localLoadTokenRef.current) return;
        setDirectories(result.files.filter((f) => f.isDirectory));
      }
    } catch (e) {
      if (myToken !== localLoadTokenRef.current) return;
      setError(e instanceof Error ? e.message : '目录读取失败');
      setDirectories([]);
    } finally {
      if (myToken === localLoadTokenRef.current) {
        setLoading(false);
      }
    }
  }, [selectedProfileId]);

  const handleSelectShare = useCallback(async (profileId: string) => {
    const multiConn = useSmbMultiConnStore.getState();
    const handle = multiConn.getHandle(profileId);
    if (!handle || handle.state !== 'connected') return;
    if (profileId === selectedProfileId) return;
    if (!handle.isHot) {
      await multiConn.switchHotTo(profileId);
    }
    setSelectedProfileId(profileId);
    const profile = useSmbProfilesStore.getState().profiles.find((p) => p.id === profileId);
    setCurrent(resolveInitialPath(profile?.rootPath));
  }, [selectedProfileId]);

  useEffect(() => {
    if (open) void loadDir(current, targetMode);
  }, [open, current, targetMode, loadDir]);

  if (!open) return null;

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      if (targetMode === 'local') {

        await LocalFsAdapter.createDirectory(current, name);
        setNewFolderName('');
        await loadDir(current, 'local');
      } else {
        const target = current ? `${current}\\${name}` : name;
        await operationPluginBridge.ensureDirectory({ path: target });
        setNewFolderName('');
        await loadDir(current, 'smb');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '新建文件夹失败');
    } finally {
      setCreating(false);
    }
  };

  const parentOf = targetMode === 'local' ? parentOfLocal : parentOfSmb;
  const rootLabel = targetMode === 'local' ? '（本地存储根目录）' : '（共享根目录）';
  const canCreate = targetMode === 'local' ? LOCAL_CAPABILITIES.createDirectory : OPERATION_CAPABILITIES.createDirectory;

  return (
    <Dialog
      title="选择目标目录"
      confirmLabel="选此处"
      onConfirm={() => onConfirm(current, targetMode)}
      onDismiss={onDismiss}
    >
      <div className={styles.pickerBody}>
        {/* TASK-LSO-22：目标分区切换 */}
        <div className={styles.pickerModeSwitch}>
          <BaseButton
            variant={targetMode === 'smb' ? 'primary' : 'secondary'}
            size="sm"
            disabled={!smbConnected}
            onPress={() => {
              setTargetMode('smb');
              const profile = selectedProfileId ? useSmbProfilesStore.getState().profiles.find((p) => p.id === selectedProfileId) : undefined;
              setCurrent(resolveInitialPath(profile?.rootPath));
            }}
          >
            SMB 共享
          </BaseButton>
          <BaseButton
            variant={targetMode === 'local' ? 'primary' : 'secondary'}
            size="sm"
            onPress={() => {
              setTargetMode('local');
              setCurrent('');
            }}
          >
            本地存储
          </BaseButton>
        </div>
        {shareSelectorVisible && (
          <div className={styles.shareSelector}>
            {activeHandles.map((h) => {
              const profile = useSmbProfilesStore.getState().profiles.find((p) => p.id === h.profileId);
              const isActive = h.profileId === selectedProfileId;
              const isDisabled = h.state !== 'connected';
              const itemClass = [styles.shareSelectorItem, isActive ? styles['shareSelectorItem-active'] : '', isDisabled ? styles['shareSelectorItem-disabled'] : ''].join(' ').trim();
              return (
                <button
                  key={h.profileId}
                  className={itemClass}
                  aria-current={isActive ? 'true' : undefined}
                  disabled={isDisabled}
                  onClick={() => void handleSelectShare(h.profileId)}
                >
                  <span className={styles.shareSelectorItemName}>{profile?.name ?? h.profileId}</span>
                  {isDisabled && <span className={styles.shareSelectorItemStatus}>网络中断</span>}
                </button>
              );
            })}
          </div>
        )}
        {/* TASK-LSO-23：SMB 离线标注 */}
        {targetMode === 'smb' && !smbConnected && (
          <p className={styles.pickerError}>SMB 连接离线，无法选择为目标。请先连接或切换到本地存储。</p>
        )}
        <p className={styles.pickerPath}>当前：{current || rootLabel}</p>
        {error && <p className={styles.pickerError}>{error}</p>}
        {loading && <p className={styles.pickerHint}>加载中…</p>}
        <div className={styles.pickerList}>
          {current && (
            <ListRow
              icon={<Icon name="icon-arrow-left" size={22} />}
              title="返回上级"
              subtitle={parentOf(current) || rootLabel}
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
        {canCreate && (
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
        )}
      </div>
    </Dialog>
  );
}
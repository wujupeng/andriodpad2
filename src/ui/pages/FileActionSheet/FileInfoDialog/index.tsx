/**
 * FileInfoDialog —— 文件属性（design.md 2.4.5，TASK-S4-05）
 * getFileAttributes（经 operationPluginBridge 桥接，分层规则）呈现
 * 大小/修改时间/路径/类型；加载中与失败态如实呈现。
 */
import { useEffect, useState } from 'react';
import { Dialog } from '../../../components/Dialog';
import { formatFileSize, formatTimestamp } from '../../../../utils/fileUtils';

import { operationPluginBridge } from '../../../../state/operationStore';
import type { SmbFileEntry } from '../../../../adapter/smb/SmbPlugin';
import styles from '../style.module.css';

interface AttributesState {
  loading: boolean;
  size?: number;
  lastWriteTime?: number;
  error?: string;
}

export interface FileInfoDialogProps {
  entry: SmbFileEntry | null;
  open: boolean;
  onDismiss(): void;
}

export function FileInfoDialog({ entry, open, onDismiss }: FileInfoDialogProps) {
  const [state, setState] = useState<AttributesState>({ loading: false });

  useEffect(() => {
    if (!open || !entry || entry.isDirectory) {
      setState({ loading: false });
      return;
    }
    let disposed = false;
    setState({ loading: true });
    operationPluginBridge
      .getFileAttributes({ path: entry.path })
      .then((attrs) => {
        if (disposed) return;
        setState({ loading: false, size: attrs.size, lastWriteTime: attrs.lastWriteTime });
      })
      .catch((e) => {
        if (disposed) return;
        setState({ loading: false, error: e instanceof Error ? e.message : '属性读取失败' });
      });
    return () => {
      disposed = true;
    };
  }, [open, entry]);

  if (!entry || !open) return null;

  const ext = entry.name.split('.').pop() ?? '';
  const kind = entry.isDirectory ? '文件夹' : `文件（${ext ? `.${ext}` : '无扩展名'}）`;

  return (
    <Dialog title="属性" confirmLabel="关闭" onConfirm={onDismiss} onDismiss={onDismiss}>
      <dl className={styles.infoGrid}>
        <dt>名称</dt>
        <dd>{entry.name}</dd>
        <dt>类型</dt>
        <dd>{kind}</dd>
        <dt>路径</dt>
        <dd className={styles.infoPath}>{entry.path || '（共享根目录）'}</dd>
        <dt>大小</dt>
        <dd>
          {entry.isDirectory
            ? '—'
            : state.loading
              ? '读取中…'
              : state.error
                ? `读取失败：${state.error}`
                : state.size !== undefined
                  ? `${formatFileSize(state.size)}（${state.size} 字节）`
                  : formatFileSize(entry.size)}
        </dd>
        <dt>修改时间</dt>
        <dd>
          {state.loading
            ? '读取中…'
            : state.error
              ? '—'
              : state.lastWriteTime !== undefined
                ? formatTimestamp(state.lastWriteTime)
                : formatTimestamp(entry.lastModified)}
        </dd>
      </dl>
    </Dialog>
  );
}
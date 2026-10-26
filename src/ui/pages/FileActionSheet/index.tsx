/**
 * FileActionSheet —— 文件操作菜单与对话框组（design.md 2.4.5，TASK-S4-05，安全关键）
 * BottomSheet：ContextHeader + ActionList（useActionAvailability 可用性驱动）；
 * 分发状态机：copy/move → DestinationPickerDialog → 冲突预判（listDirectory 目标目录）
 * → 同名弹 ConflictDialog 四选一（TASK-S5-03 真实接线：跳过/覆盖授权/保留两者/重命名）
 * → operationStore 入队（真实传输入队执行器）；rename → RenameDialog；delete →
 * DeleteConfirmDialog（双语义，spec 5.5.1-R5）；info → FileInfoDialog；open/edit →
 * isWpsInstalled 兜底复核 + editSessionStore.openFile 分发（S5 前骨架）。
 * 竞态兜底：入队后 executor 遇"目标已存在"reject → conflict 分类 → conflict 态停止。
 * 插件调用经 store/bridge 中转，本组件零 SmbPlugin import（分层规则）。
 */
import { useCallback, useEffect, useState } from 'react';
import { BottomSheet } from '../../components/BottomSheet';
import { StatusBanner } from '../../components/StatusBanner';
import { useActionAvailability } from './useActionAvailability';
import type { FileActionId } from './useActionAvailability';
import { ContextHeader } from './ContextHeader';
import { ActionList } from './ActionList';
import { RenameDialog } from './RenameDialog';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { ConflictDialog } from './ConflictDialog';
import type { ConflictChoice } from './ConflictDialog';
import { DestinationPickerDialog } from './DestinationPickerDialog';
import { FileInfoDialog } from './FileInfoDialog';
import { useOperationStore, operationPluginBridge } from '../../../state/operationStore';
import type { TransferOptions } from '../../../state/operationStore';
import { useSmbConnectionStore } from '../../../state/smbConnectionStore';
import { useEditSessionStore } from '../../../state/editSessionStore';
import { useBrowseStore } from '../../../state/browseStore';
import type { SmbFileEntry } from '../../../adapter/smb/SmbPlugin';
import styles from './style.module.css';

type SheetView = 'menu' | 'rename' | 'delete' | 'picker' | 'info' | 'conflict';

/** 保留两者：目标名探测"名称 (N).ext"（N 从 2 起，直至与目标目录既有名不冲突） */
function uniqueDestName(original: string, taken: ReadonlySet<string>): string {
  const dot = original.lastIndexOf('.');
  const base = dot > 0 ? original.slice(0, dot) : original;
  const ext = dot > 0 ? original.slice(dot) : '';
  let n = 2;
  let candidate = `${base} (${n})${ext}`;
  while (taken.has(candidate.toLowerCase())) {
    n += 1;
    candidate = `${base} (${n})${ext}`;
  }
  return candidate;
}

export interface FileActionSheetProps {
  /** 操作目标（单文件 1 项 / 批量多项） */
  entries: SmbFileEntry[];
  /** 文件来源（删除双语义判定） */
  source: 'local' | 'remote';
  /** 同目录既有名（重命名重名校验输入） */
  siblingNames: string[];
  open: boolean;
  onDismiss(): void;
}

export function FileActionSheet({
  entries,
  source,
  siblingNames,
  open,
  onDismiss,
}: FileActionSheetProps) {
  const [view, setView] = useState<SheetView>('menu');
  const [pendingTransfer, setPendingTransfer] = useState<'copy' | 'move' | null>(null);
  /** 冲突预判结果（TASK-S5-03）：DestinationPicker 确认后目标目录存在同名 → 四选一 */
  const [pendingConflict, setPendingConflict] = useState<{
    destination: string;
    conflictPaths: string[];
    targetNames: Set<string>;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    semantic: 'info' | 'success' | 'danger' | 'warning';
    text: string;
  } | null>(null);

  const connectionState = useSmbConnectionStore((s) => s.state);
  const activeProfileId = useSmbConnectionStore((s) => s.activeProfileId);
  const currentPath = useBrowseStore((s) => s.currentPath);
  const availability = useActionAvailability({ entries, connectionState, source });

  useEffect(() => {
    if (open) {
      setView('menu');
      setStatusMessage(null);
      setPendingTransfer(null);
      setPendingConflict(null);
    }
  }, [open]);

  const closeAll = useCallback(() => {
    setView('menu');
    onDismiss();
  }, [onDismiss]);

  /** 传输入队（copy/move 按 pendingTransfer 分发；options=冲突决策产物） */
  const enqueueTransfer = useCallback(
    (paths: string[], destination: string, options?: TransferOptions) => {
      const store = useOperationStore.getState();
      if (pendingTransfer === 'copy') void store.enqueueCopy(paths, destination, options);
      else void store.enqueueMove(paths, destination, options);
      setPendingTransfer(null);
      setPendingConflict(null);
      closeAll();
    },
    [pendingTransfer, closeAll],
  );

  /** 打开/编辑分发：isWpsInstalled 兜底复核 → editSessionStore.openFile（S5 前骨架） */
  const handleOpenOrEdit = useCallback(
    async (_action: 'open' | 'edit') => {
      try {
        const check = await operationPluginBridge.isWpsInstalled();
        if (!check.installed) {
          // spec 5.6.3 异常 5：无法打开 + 原因
          setStatusMessage({ semantic: 'danger', text: '无法打开：设备上未安装 WPS Office' });
          return;
        }
      } catch (e) {
        setStatusMessage({
          semantic: 'danger',
          text: `无法打开：WPS 安装检测失败（${e instanceof Error ? e.message : '未知错误'}）`,
        });
        return;
      }
      if (!activeProfileId || entries.length !== 1) return;
      const target = entries[0];
      await useEditSessionStore.getState().openFile(activeProfileId, target.path);
      onDismiss();
    },
    [activeProfileId, entries],
  );

  const handleAction = useCallback(
    (action: FileActionId) => {
      const state = availability[action];
      if (!state.enabled) return;
      switch (action) {
        case 'open':
        case 'edit':
          void handleOpenOrEdit(action);
          break;
        case 'copy':
        case 'move':
          setPendingTransfer(action);
          setView('picker');
          break;
        case 'rename':
          setView('rename');
          break;
        case 'delete':
          setView('delete');
          break;
        case 'info':
          setView('info');
          break;
      }
    },
    [availability, handleOpenOrEdit],
  );

  /** 目标目录确认 → 冲突预判（入队前 listDirectory 目标目录）→ 入队/弹 ConflictDialog。
   * TASK-S5-03（s5-02 设计 §B-3/PM 红线①）：目标同名且未经 ConflictDialog 显式
   * 授权绝不覆盖；预判失败（网络抖动）不阻塞入队——竞态兜底在 executor 层
   * （插件"目标已存在"reject → conflict 分类 → conflict 态停止）。 */
  const handleDestinationConfirm = useCallback(
    (destination: string) => {
      const paths = entries.map((e) => e.path);
      if (paths.length === 0 || !pendingTransfer) return;
      void (async () => {
        let targetNames: Set<string> | null = null;
        try {
          const listing = await operationPluginBridge.listDirectory({
            path: destination || undefined,
          });
          targetNames = new Set(listing.files.map((f) => f.name.toLowerCase()));
        } catch {
          targetNames = null; // 预判通道失败 → 不阻塞（executor 兜底）
        }
        if (targetNames) {
          const conflictPaths = entries
            .filter((e) => !e.isDirectory && targetNames!.has(e.name.toLowerCase()))
            .map((e) => e.path);
          if (conflictPaths.length > 0) {
            setPendingConflict({ destination, conflictPaths, targetNames });
            setView('conflict');
            return;
          }
        }
        enqueueTransfer(paths, destination);
      })();
    },
    [entries, pendingTransfer, enqueueTransfer],
  );

  /** 冲突四选一决策（spec 5.5.1-R9/R10：任何路径不得静默覆盖；TASK-S5-03 真实接线）
   * - 跳过：仅入队非冲突项（全部冲突→提示后不执行）；
   * - 覆盖：整批 overwrite=true（用户显式授权，插件 rename replace=true 原子替换）；
   * - 保留两者：冲突项目标名自动"名称 (N)"（N 从 2 起探测至不冲突）；
   * - 重命名：单文件=用户输入新名；批量=按保留两者处理（对话框行内输入为单数语义）。 */
  const handleConflictResolve = useCallback(
    (choice: ConflictChoice) => {
      if (!pendingConflict) return;
      const { destination, conflictPaths, targetNames } = pendingConflict;
      const conflictSet = new Set(conflictPaths);
      const allPaths = entries.filter((e) => !e.isDirectory).map((e) => e.path);
      switch (choice.kind) {
        case 'skip': {
          const remaining = allPaths.filter((p) => !conflictSet.has(p));
          if (remaining.length === 0) {
            setPendingConflict(null);
            setView('menu');
            setStatusMessage({
              semantic: 'info',
              text: `已跳过 ${conflictSet.size} 个同名文件（未执行任何操作）`,
            });
            return;
          }
          enqueueTransfer(remaining, destination);
          return;
        }
        case 'overwrite': {
          enqueueTransfer(allPaths, destination, { overwrite: true });
          return;
        }
        case 'keep-both': {
          const destNames: Record<string, string> = {};
          for (const path of conflictPaths) {
            const original = entries.find((e) => e.path === path)?.name ?? path;
            destNames[path] = uniqueDestName(original, targetNames);
          }
          enqueueTransfer(allPaths, destination, { destNames });
          return;
        }
        case 'rename': {
          if (choice.newName && allPaths.length === 1) {
            // 单文件重命名：用户输入的新目标名（ConflictDialog 已按 existingNames 校验）
            enqueueTransfer(allPaths, destination, { destNames: { [allPaths[0]]: choice.newName } });
            return;
          }
          // 批量场景：重命名输入为单数语义——按保留两者处理（description 已注明）
          const destNames: Record<string, string> = {};
          for (const path of conflictPaths) {
            const original = entries.find((e) => e.path === path)?.name ?? path;
            destNames[path] = uniqueDestName(original, targetNames);
          }
          enqueueTransfer(allPaths, destination, { destNames });
          return;
        }
      }
    },
    [pendingConflict, entries, enqueueTransfer],
  );

  const handleRenameConfirm = useCallback(
    (newName: string) => {
      const target = entries[0];
      if (!target) return;
      void useOperationStore.getState().executeRename(target.path, newName);
      closeAll();
    },
    [entries, closeAll],
  );

  const handleDeleteConfirm = useCallback(() => {
    const paths = entries.map((e) => e.path);
    void useOperationStore.getState().executeDelete(paths, source);
    closeAll();
  }, [entries, source, closeAll]);

  const batch = entries.length > 1;

  return (
    <>
      <BottomSheet
        title={batch ? `已选 ${entries.length} 个项目` : entries[0]?.name}
        open={open && view === 'menu'}
        onDismiss={closeAll}
      >
        <div className={styles.sheetBody}>
          <ContextHeader entries={entries} />
          {statusMessage && (
            <StatusBanner
              semantic={statusMessage.semantic}
              icon={
                statusMessage.semantic === 'success'
                  ? 'icon-check-circle'
                  : statusMessage.semantic === 'info'
                    ? 'icon-info-circle'
                    : 'icon-x-circle'
              }
              title={statusMessage.text}
            />
          )}
          <ActionList batch={batch} availability={availability} onAction={handleAction} />
        </div>
      </BottomSheet>

      {entries.length === 1 && (
        <RenameDialog
          currentName={entries[0].name}
          existingNames={siblingNames}
          open={open && view === 'rename'}
          onConfirm={handleRenameConfirm}
          onDismiss={() => setView('menu')}
        />
      )}

      <DeleteConfirmDialog
        source={source}
        names={entries.map((e) => e.name)}
        sharePath={source === 'remote' ? currentPath : undefined}
        open={open && view === 'delete'}
        onConfirm={handleDeleteConfirm}
        onDismiss={() => setView('menu')}
      />

      <DestinationPickerDialog
        open={open && view === 'picker'}
        initialDirectory={currentPath}
        onConfirm={handleDestinationConfirm}
        onDismiss={() => setView('menu')}
      />

      <FileInfoDialog
        entry={entries[0] ?? null}
        open={open && view === 'info' && !batch}
        onDismiss={() => setView('menu')}
      />

      {pendingConflict && (
        <ConflictDialog
          fileName={
            (() => {
              const first = entries.find((e) => e.path === pendingConflict.conflictPaths[0])?.name ?? '';
              return pendingConflict.conflictPaths.length > 1
                ? `${first} 等 ${pendingConflict.conflictPaths.length} 个文件`
                : first;
            })()
          }
          existingNames={[...pendingConflict.targetNames]}
          open={open && view === 'conflict'}
          onResolve={handleConflictResolve}
          onDismiss={() => setView('menu')}
        />
      )}
    </>
  );
}
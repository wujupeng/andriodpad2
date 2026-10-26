/**
 * 组件演示页（TASK-S1-11 / Gate-UI-1 验收载体）
 * 12 个基础组件全部变体 + 全量图标 + 深浅主题切换。
 * 临时演示路由：验收后去留由 Gate-UI-6 裁定。
 */
import { useCallback, useMemo, useState } from 'react';
import { BaseButton } from '../../components/BaseButton';
import { Card } from '../../components/Card';
import { ListRow } from '../../components/ListRow';
import { StatusBadge } from '../../components/StatusBadge';
import { StatusBanner } from '../../components/StatusBanner';
import { ProgressBar } from '../../components/ProgressBar';
import { Spinner } from '../../components/Spinner';
import { Dialog } from '../../components/Dialog';
import { BottomSheet } from '../../components/BottomSheet';
import { EmptyState } from '../../components/EmptyState';
import { SkeletonList } from '../../components/SkeletonList';
import { Breadcrumb } from '../../components/Breadcrumb';
import { Icon } from '../../icons/Icon';
import { iconRegistry, type IconName } from '../../icons/registry';
import { fileIcon } from '../../icons/fileTypeIcons';
import { FileList } from '../BrowsePage/FileList';
import {
  useOperationStore,
  OPERATION_CAPABILITIES,
  fromTransferStatus,
} from '../../../state/operationStore';
import type { OperationTask } from '../../../state/operationStore';
import { useActionAvailability } from '../FileActionSheet/useActionAvailability';
import { ContextHeader } from '../FileActionSheet/ContextHeader';
import { ActionList } from '../FileActionSheet/ActionList';
import { DeleteConfirmDialog } from '../FileActionSheet/DeleteConfirmDialog';
import { RenameDialog } from '../FileActionSheet/RenameDialog';
import { ConflictDialog } from '../FileActionSheet/ConflictDialog';
import { TransferStatus } from '../../../core/transfer/TransferEngine';
import type { SmbFileEntry } from '../../../adapter/smb/SmbPlugin';
import styles from './style.module.css';

/** S4-05 验收载体 mock 文件（单文件+目录+批量） */
const S405_FILES: SmbFileEntry[] = [
  { name: '年度报告.docx', isDirectory: false, size: 250_000, lastModified: 1790000000000, path: 'mock\\年度报告.docx' },
  { name: '财务目录', isDirectory: true, size: 0, lastModified: 1790000000000, path: 'mock\\财务目录' },
  { name: '预算.xlsx', isDirectory: false, size: 1_200_000, lastModified: 1790000100000, path: 'mock\\预算.xlsx' },
];

/** FileActionSheet 演示区块（TASK-S4-05 验收载体：菜单/双语义/校验/冲突四选一） */
function FileActionSheetDemo() {
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [dialog, setDialog] = useState<'none' | 'delete-local' | 'delete-remote' | 'rename' | 'conflict'>('none');
  const entries = mode === 'single' ? [S405_FILES[0]] : S405_FILES;
  // 演示态连接固定 connected（真实态消费见 BrowsePage 接线）
  const availability = useActionAvailability({ entries, connectionState: 'connected', source: 'remote' });

  return (
    <div data-fas-demo="">
      <div className={styles['gallery__row']} style={{ marginBottom: 12 }}>
        <BaseButton variant={mode === 'single' ? 'primary' : 'secondary'} size="sm" onPress={() => setMode('single')}>
          单文件菜单
        </BaseButton>
        <BaseButton variant={mode === 'batch' ? 'primary' : 'secondary'} size="sm" onPress={() => setMode('batch')}>
          批量菜单
        </BaseButton>
        <BaseButton variant="secondary" size="sm" onPress={() => setDialog('delete-local')}>
          删除确认（本地）
        </BaseButton>
        <BaseButton variant="danger" size="sm" onPress={() => setDialog('delete-remote')}>
          删除确认（远程）
        </BaseButton>
        <BaseButton variant="secondary" size="sm" onPress={() => setDialog('rename')}>
          重命名校验
        </BaseButton>
        <BaseButton variant="secondary" size="sm" onPress={() => setDialog('conflict')}>
          冲突四选一
        </BaseButton>
      </div>
      <ContextHeader entries={entries} />
      <ActionList
        batch={mode === 'batch'}
        availability={availability}
        onAction={() => undefined}
      />
      <DeleteConfirmDialog
        source="local"
        names={[S405_FILES[0].name]}
        open={dialog === 'delete-local'}
        onConfirm={() => setDialog('none')}
        onDismiss={() => setDialog('none')}
      />
      <DeleteConfirmDialog
        source="remote"
        names={[S405_FILES[0].name]}
        open={dialog === 'delete-remote'}
        onConfirm={() => setDialog('none')}
        onDismiss={() => setDialog('none')}
      />
      <RenameDialog
        currentName={S405_FILES[0].name}
        existingNames={S405_FILES.map((f) => f.name)}
        open={dialog === 'rename'}
        onConfirm={() => setDialog('none')}
        onDismiss={() => setDialog('none')}
      />
      <ConflictDialog
        fileName={S405_FILES[0].name}
        existingNames={['预算.xlsx']}
        open={dialog === 'conflict'}
        onResolve={() => setDialog('none')}
        onDismiss={() => setDialog('none')}
      />
    </div>
  );
}

/** 虚拟化压测 mock 数据（R-01：500/1000/5000 条，TASK-S4-02 压测载体） */
function buildMockFiles(count: number): SmbFileEntry[] {
  const exts = ['docx', 'xlsx', 'pptx', 'png', 'mp4', 'zip', 'pdf', 'txt'];
  return Array.from({ length: count }, (_, i) => {
    const isDirectory = i % 10 === 0;
    const ext = exts[i % exts.length];
    return {
      name: isDirectory
        ? `归档目录-${i}`
        : `测试文件-${String(i).padStart(5, '0')}.${ext}`,
      isDirectory,
      size: ((i * 3571) % 100_000_000) + 1024,
      lastModified: 1790000000000 + i * 60_000,
      path: `mock\\${i}`,
    };
  });
}

export function ComponentGalleryPage() {
  const [dark, setDark] = useState(
    () => document.documentElement.dataset.theme === 'dark',
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dangerDialogOpen, setDangerDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [stressCount, setStressCount] = useState(500);
  const [stressSearch, setStressSearch] = useState('');
  const mockFiles = useMemo(() => buildMockFiles(stressCount), [stressCount]);
  const [stressSelection] = useState<Set<string>>(new Set());
  const [opResult, setOpResult] = useState<string>('');

  /** S4-04 operationStore 状态机自检（结果写入容器供 CDP 断言） */
  const runOperationSelfTest = useCallback(async () => {
    const store = useOperationStore.getState();
    const results: Array<[string, boolean]> = [];
    const check = (label: string, ok: boolean) => results.push([label, ok]);
    // zustand state 是不可变快照：每次断言须重新 getState() 取最新引用
    const latest = () => useOperationStore.getState();

    await store.enqueueCopy(['share\\a.docx', 'share\\b.xlsx', 'share\\c.png'], 'share\\dest');
    const copyTask: OperationTask | undefined = latest().recentTasks[0];
    check('copy 终态 failed', copyTask?.status === 'failed');
    check('copy 失败清单 3 条', copyTask?.failures?.length === 3);
    check('copy 原因如实（能力缺失）', !!copyTask?.failures?.[0]?.reason?.includes('前端插件方法未暴露'));

    await store.executeDelete(['share\\x.txt'], 'remote');
    const delTask = latest().recentTasks[0];
    check('delete 终态 failed', delTask?.status === 'failed');
    check('delete kind', delTask?.kind === 'delete');
    check('profileId 字段存在', 'profileId' in (delTask ?? {}));

    await store.executeRename('share\\old.docx', 'new-name.docx');
    const rnTask = latest().recentTasks[0];
    check('rename 终态 failed', rnTask?.status === 'failed');
    check('rename 目标名', rnTask?.targets?.[0]?.name === 'new-name.docx');

    const before = latest().recentTasks.length;
    latest().recentTasks.forEach((t) => useOperationStore.getState().acknowledge(t.id));
    check('acknowledge 清空', before > 0 && latest().recentTasks.length === 0);

    check(
      '能力表全披露（copy/move/rename/deleteR/deleteL 缺失）',
      !OPERATION_CAPABILITIES.copy && !OPERATION_CAPABILITIES.move && !OPERATION_CAPABILITIES.rename && !OPERATION_CAPABILITIES.deleteRemote && !OPERATION_CAPABILITIES.deleteLocal,
    );
    check('createDirectory 能力=true', OPERATION_CAPABILITIES.createDirectory === true);
    check('映射 PENDING', fromTransferStatus(TransferStatus.PENDING) === 'pending');
    check('映射 SUCCESS', fromTransferStatus(TransferStatus.SUCCESS) === 'success');
    check('映射 WAITING_NETWORK→in_progress', fromTransferStatus(TransferStatus.WAITING_NETWORK) === 'in_progress');
    check('映射 PAUSED→cancelled', fromTransferStatus(TransferStatus.PAUSED) === 'cancelled');

    const passCount = results.filter(([, ok]) => ok).length;
    setOpResult(
      JSON.stringify({ pass: passCount, total: results.length, items: results.map(([l, ok]) => `${ok ? 'PASS' : 'FAIL'} ${l}`) }),
    );
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.dataset.theme = 'dark';
    } else {
      delete document.documentElement.dataset.theme;
    }
  };

  const allIcons = Object.keys(iconRegistry) as IconName[];
  const fileExts = ['docx', 'xlsx', 'pptx', 'jpg', 'mp4', 'mp3', 'zip', 'apk', 'xyz', ''];

  return (
    <div className={styles['gallery']}>
      <header className={styles['gallery__header']}>
        <h1 className={styles['gallery__title']}>组件演示 · Gate-UI-1</h1>
        <BaseButton variant="secondary" size="sm" onPress={toggleTheme}>
          {dark ? '切换浅色' : '切换深色'}
        </BaseButton>
      </header>

      <Card title="C-01 BaseButton">
        <div className={styles['gallery__row']}>
          {(['primary', 'secondary', 'text', 'danger'] as const).map((v) => (
            <BaseButton key={v} variant={v} size="md">
              {v}
            </BaseButton>
          ))}
        </div>
        <div className={styles['gallery__row']}>
          <BaseButton size="lg">lg 48</BaseButton>
          <BaseButton size="md">md 44</BaseButton>
          <BaseButton size="sm">sm 36</BaseButton>
          <BaseButton loading>loading</BaseButton>
          <BaseButton disabled>disabled</BaseButton>
        </div>
      </Card>

      <Card title="C-02 Card" actions={<span className={styles['gallery__hint']}>actions 插槽</span>}>
        <p>默认卡片：radius-lg / bg-surface / shadow-sm / space-4。</p>
        <Card interactive>
          <p>interactive 卡片（按压 bg-hover 反馈）。</p>
        </Card>
      </Card>

      <Card title="C-03 ListRow">
        <ListRow
          icon={<Icon name="icon-file-doc" size={32} />}
          title="季度报告.docx"
          subtitle="2.4 MB · 昨天 14:30"
          trailing={<Icon name="icon-chevron-right" size={20} />}
          onPress={() => undefined}
        />
        <ListRow
          icon={<Icon name="icon-folder" size={32} />}
          title="财务目录（选中态）"
          subtitle="12 项"
          selected
          onPress={() => undefined}
        />
        <ListRow
          icon={<Icon name="icon-file-image" size={32} />}
          title="截图.png（多选态）"
          subtitle="1.1 MB"
          selectionMode
          selected
          onPress={() => undefined}
        />
      </Card>

      <Card title="C-04 StatusBadge（五类语义）">
        <div className={styles['gallery__row']}>
          <StatusBadge semantic="success" icon="icon-check-circle" label="回写成功" />
          <StatusBadge semantic="warning" icon="icon-cloud-off" label="网络中断" />
          <StatusBadge semantic="danger" icon="icon-x-circle" label="回写失败" />
          <StatusBadge semantic="info" icon="icon-loader" label="正在保存" />
          <StatusBadge semantic="neutral" icon="icon-file-question" label="文件类型未知" />
        </div>
      </Card>

      <Card title="C-05 StatusBanner（danger/warning 持久，无自动消失）">
        <div className={styles['gallery__stack']}>
          <StatusBanner
            semantic="danger"
            icon="icon-x-circle"
            title="回写失败：网络连接中断（原文件未被修改）"
            actions={[
              { label: '重试', onPress: () => undefined, variant: 'primary' },
              { label: '查看详情', onPress: () => undefined },
            ]}
          />
          <StatusBanner
            semantic="warning"
            icon="icon-conflict"
            title="文件已被他人修改，存在冲突"
            description="需要决策：保存为副本 / 重新加载 / 覆盖 / 放弃"
          />
          <StatusBanner
            semantic="success"
            icon="icon-check-circle"
            title="回写成功，校验通过"
          />
          <StatusBanner
            semantic="info"
            icon="icon-loader"
            title="正在回写…（64%）"
          />
        </div>
      </Card>

      <Card title="C-06 ProgressBar">
        <div className={styles['gallery__stack']}>
          <ProgressBar value={64} label="复制 3/5 个文件" sublabel="季度报告.docx" />
          <ProgressBar label="移动文件" />
          <ProgressBar value={100} semantic="success" label="完成" />
        </div>
      </Card>

      <Card title="C-07 Spinner">
        <div className={styles['gallery__row']}>
          <Spinner size={16} />
          <Spinner size={24} />
          <Spinner size={32} />
          <span className={styles['gallery__hint']}>仅用于"进行中"语义</span>
        </div>
      </Card>

      <Card title="C-08 Dialog / C-09 BottomSheet">
        <div className={styles['gallery__row']}>
          <BaseButton variant="secondary" onPress={() => setDialogOpen(true)}>
            打开对话框
          </BaseButton>
          <BaseButton variant="danger" onPress={() => setDangerDialogOpen(true)}>
            危险确认
          </BaseButton>
          <BaseButton variant="secondary" onPress={() => setSheetOpen(true)}>
            打开底部菜单
          </BaseButton>
        </div>
      </Card>

      <Card title="C-10 EmptyState / C-11 SkeletonList">
        <EmptyState
          icon="icon-folder"
          title="目录为空"
          description="此共享目录中还没有文件"
          action={{ label: '刷新', onPress: () => undefined }}
        />
        <SkeletonList rows={4} />
      </Card>

      <Card title="C-12 Breadcrumb">
        <Breadcrumb
          segments={[
            { name: '共享', path: '\\\\server\\share' },
            { name: '部门文件', path: '\\\\server\\share\\dept' },
            { name: '2026', path: '\\\\server\\share\\dept\\2026' },
            { name: '季度', path: '\\\\server\\share\\dept\\2026\\q' },
            { name: '报告', path: '\\\\server\\share\\dept\\2026\\q\\report' },
          ]}
          onNavigate={(p) => console.info('navigate', p)}
        />
      </Card>

      <Card title="D-05 虚拟化列表压测（TASK-S4-02 R-01 载体）">
        <div className={styles['gallery__row']} style={{ marginBottom: 12 }}>
          {[500, 1000, 5000].map((count) => (
            <BaseButton
              key={count}
              variant={stressCount === count ? 'primary' : 'secondary'}
              size="sm"
              onPress={() => setStressCount(count)}
            >
              {count} 条
            </BaseButton>
          ))}
          <input
            type="text"
            value={stressSearch}
            placeholder="搜索过滤压测"
            aria-label="搜索过滤压测"
            onChange={(event) => setStressSearch(event.target.value)}
            style={{
              minHeight: 32,
              padding: '0 12px',
              borderRadius: 999,
              border: '1px solid var(--pad2-color-border)',
              background: 'var(--pad2-color-bg-surface)',
              color: 'var(--pad2-color-text-primary)',
            }}
          />
        </div>
        <div style={{ height: 480, display: 'flex', flexDirection: 'column' }}>
          <FileList
            files={mockFiles}
            loading={false}
            sort={{ field: 'name', ascending: true }}
            searchQuery={stressSearch}
            selection={stressSelection}
            selectionMode={false}
            onOpen={() => undefined}
            onEnterDirectory={() => undefined}
            onRowActivate={() => undefined}
            onClearSearch={() => setStressSearch('')}
          />
        </div>
      </Card>

      <Card title="operationStore 状态机自检（TASK-S4-04 验收载体）">
        <div className={styles['gallery__row']}>
          <BaseButton variant="secondary" size="sm" onPress={() => void runOperationSelfTest()}>
            运行状态机自检
          </BaseButton>
        </div>
        <pre
          data-opstore-result=""
          style={{
            margin: 0,
            marginTop: 12,
            fontSize: 13,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            color: 'var(--pad2-color-text-secondary)',
          }}
        >
          {opResult || '点击运行：copy/delete/rename 状态机 + 能力表 + TransferStatus 映射断言'}
        </pre>
      </Card>

      <Card title="FileActionSheet 操作菜单与对话框组（TASK-S4-05 验收载体）">
        <FileActionSheetDemo />
      </Card>

      <Card title={`图标系统（${allIcons.length} 个全部渲染）`}>
        <div className={styles['gallery__icon-grid']}>
          {allIcons.map((name) => (
            <div className={styles['gallery__icon-cell']} key={name}>
              <Icon name={name} size={24} />
              <span className={styles['gallery__icon-name']}>{name.replace('icon-', '')}</span>
            </div>
          ))}
        </div>
        <div className={styles['gallery__icon-grid']}>
          {fileExts.map((ext) => (
            <div className={styles['gallery__icon-cell']} key={ext || 'dir'}>
              <Icon name={ext ? fileIcon(ext) : 'icon-folder'} size={32} />
              <span className={styles['gallery__icon-name']}>{ext || '目录'}</span>
            </div>
          ))}
        </div>
      </Card>

      {dialogOpen && (
        <Dialog
          title="测试连接"
          onDismiss={() => setDialogOpen(false)}
          onConfirm={() => setDialogOpen(false)}
          confirmLabel="确定"
        >
          已成功连接到共享目录，可以开始浏览文件。
        </Dialog>
      )}
      {dangerDialogOpen && (
        <Dialog
          title="删除文件"
          danger
          onDismiss={() => setDangerDialogOpen(false)}
          onConfirm={() => setDangerDialogOpen(false)}
          confirmLabel="删除"
        >
          删除后不可恢复，确定要删除选中的 2 个文件吗？
        </Dialog>
      )}
      <BottomSheet
        title="文件操作"
        open={sheetOpen}
        onDismiss={() => setSheetOpen(false)}
      >
        <ListRow icon={<Icon name="icon-open" />} title="打开" onPress={() => undefined} />
        <ListRow icon={<Icon name="icon-edit" />} title="编辑" onPress={() => undefined} />
        <ListRow icon={<Icon name="icon-copy" />} title="复制" onPress={() => undefined} />
        <ListRow icon={<Icon name="icon-move" />} title="移动" onPress={() => undefined} />
        <ListRow icon={<Icon name="icon-delete" />} title="删除" onPress={() => undefined} />
      </BottomSheet>
    </div>
  );
}
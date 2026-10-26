/**
 * 文件操作任务 store（design.md 2.6.2-D、2.7.2，TASK-S4-04 完整实现）
 * 七态任务（spec 6.4-1）：pending/in_progress/success/failed/partial_failed/
 * cancelled/conflict——partial_failed 为 UI 层叠加聚合态（批量完成时存在失败
 * 子任务，design.md 152 行决策），前六态与 core TransferStatus 十态子集对齐，
 * 经 fromTransferStatus 只读映射（SUCCESS→success 等，不修改 core 文件）。
 * 进度：整体（completed/total/percentage）+ 单文件（currentFile，spec 6.4-2）。
 * 失败清单：{path, name, reason}（spec 6.4-3，文件名+失败原因）。
 * 取消保留已完成部分（spec 5.5.1-R8）：cancel 置取消标记，执行循环逐项
 * 检查标记，当前项完成即停止，已完成项保留在任务记录，终态 cancelled。
 * acknowledge：确认后从 recentTasks 移除（持久性移除条件①）。
 * 冲突处理约定（design.md 2.7.2）：单目标命中"已存在/冲突"类错误时任务进入
 * conflict 态并停止后续目标——决策后续跑由 S4-05 ConflictDialog 承载。
 *
 * 能力缺口披露（design.md 1.2.3 决策、任务卡⑤）：
 * 前端 SmbPlugin 接口当前仅暴露 writeTextFile/ensureDirectory——
 * 复制/移动/重命名/删除（远程与本地）的前端插件方法未暴露；cleanup() 为
 * 全量清缓存语义（非按路径单文件删除），不得挪用。
 * 处置：OPERATION_CAPABILITIES 全量披露（S4-05 FileActionSheet 对应菜单项
 * 灰显判定依据）；store 层防御性兜底——能力缺失的操作入队即逐目标失败
 * （失败原因如实呈现"前端插件方法未暴露"），不新增插件方法。
 *
 * 插件调用收敛于 store，页面禁直调（design.md 2.2.2 分层规则）。
 * 接口签名冻结于 S1-09（R-07），本任务零接口变更（仅填充实现）。
 */
import { create } from 'zustand';
import { TransferStatus } from '../core/transfer/TransferEngine';
import SmbPlugin from '../adapter/smb/SmbPlugin';
import { mapSmbError } from '../utils/smbErrorMapper';
import { useSmbConnectionStore } from './smbConnectionStore';

export type OperationStatus =
  | 'pending'
  | 'in_progress'
  | 'success'
  | 'failed'
  | 'partial_failed'
  | 'cancelled'
  | 'conflict';

export type OperationKind = 'copy' | 'move' | 'rename' | 'delete' | 'batch';

export interface OperationTarget {
  path: string;
  name: string;
  /** 目标文件名（保留两者/重命名决策时与源名不同；TASK-S5-03 冲突决策接线） */
  destName?: string;
  /** 覆盖授权（仅用户在 ConflictDialog 显式选择"覆盖"后为 true；默认 false 禁静默覆盖） */
  overwrite?: boolean;
}

export interface OperationProgress {
  completed: number;
  total: number;
  currentFile?: string;
  percentage: number;
}

export interface OperationFailure {
  path: string;
  name: string;
  reason: string;
}

export interface OperationTask {
  id: string;
  kind: OperationKind;
  targets: OperationTarget[];
  destination?: string;
  status: OperationStatus;
  progress: OperationProgress;
  failures?: OperationFailure[];
  createdAt: number;
  /** 发起任务时的活动连接（smbProfilesStore.hasActiveOperations 精确归属，S3-02 登记的 S4-04 交付项） */
  profileId?: string;
}

export interface OperationStoreState {
  activeTask: OperationTask | null;
  recentTasks: OperationTask[];
  enqueueCopy(paths: string[], destination: string, options?: TransferOptions): Promise<void>;
  enqueueMove(paths: string[], destination: string, options?: TransferOptions): Promise<void>;
  executeRename(path: string, newName: string): Promise<void>;
  executeDelete(paths: string[], scope: 'local' | 'remote'): Promise<void>;
  cancel(taskId: string): Promise<void>;
  acknowledge(taskId: string): void;
}

/**
 * 传输入队选项（TASK-S5-03 冲突决策接线；可选参数向后兼容既有调用）：
 * - overwrite：用户在 ConflictDialog 显式选择"覆盖"后整批授权；
 * - destNames：源路径→目标文件名映射（"保留两者/重命名"决策产物）。
 */
export interface TransferOptions {
  overwrite?: boolean;
  destNames?: Record<string, string>;
}

/**
 * 操作能力表（S4-05 FileActionSheet 灰显判定依据）。
 * TASK-S5-03：copy/move 前端插件方法已桥接（PM 授权实施）——翻 true；
 * rename/deleteRemote 待 S5-04/S5-05 单独授权，保持 false 如实披露。
 */
export const OPERATION_CAPABILITIES: Readonly<{
  copy: boolean;
  move: boolean;
  rename: boolean;
  deleteRemote: boolean;
  deleteLocal: boolean;
  /** DestinationPicker"新建文件夹"（ensureDirectory 前端方法已暴露） */
  createDirectory: boolean;
}> = {
  // TASK-S5-03 已实施：SmbClient.copyFile（流式+临时+原子落位+SHA 校验）+ 插件桥接
  copy: true,
  // TASK-S5-03 已实施：SmbClient.moveFile（copy+校验成功后才删源）
  move: true,
  // TASK-S5-04-R 已实施：SmbClient.renameFile（完整相对路径+replace=false 服务端原子防覆盖）
  rename: true,
  // TASK-S5-05 已实施：SmbClient.deleteRemoteFile（目录拒绝+存在性预检+删除后核验）
  deleteRemote: true,
  // 本地单文件删除：cleanup() 为全量清缓存语义（非按路径删除）不得挪用，无单文件删除方法
  deleteLocal: false,
  createDirectory: true,
};

/** core TransferStatus 十态 → UI 七态只读映射（design.md 152 行决策，不修改 core 文件） */
export function fromTransferStatus(status: TransferStatus): OperationStatus {
  switch (status) {
    case TransferStatus.PENDING:
      return 'pending';
    case TransferStatus.IN_PROGRESS:
    case TransferStatus.WAITING_NETWORK:
    case TransferStatus.RETRYING:
    case TransferStatus.VERIFYING:
      return 'in_progress';
    case TransferStatus.SUCCESS:
      return 'success';
    case TransferStatus.FAILED:
      return 'failed';
    case TransferStatus.CONFLICT:
      return 'conflict';
    case TransferStatus.CANCELLED:
    case TransferStatus.PAUSED:
      return 'cancelled';
    default:
      return 'failed';
  }
}

const CAPABILITY_REASON = '该操作暂不可用：前端插件方法未暴露（原生能力已实现，待前端接口补齐）';

let taskSeq = 0;

function newTaskId(): string {
  taskSeq += 1;
  return `op-${Date.now()}-${taskSeq}`;
}

function toTargets(paths: string[], options?: TransferOptions): OperationTarget[] {
  return paths.map((path) => ({
    path,
    name: path.split('\\').pop() ?? path.split('/').pop() ?? path,
    // TASK-S5-03 冲突决策接线：保留两者/重命名 → per-file 目标名；覆盖 → 显式授权标志
    destName: options?.destNames?.[path],
    overwrite: options?.overwrite,
  }));
}

function initialProgress(targets: OperationTarget[]): OperationProgress {
  return { completed: 0, total: targets.length, percentage: 0 };
}

/**
 * 单目标执行器（按操作类型注入；插件方法补齐后替换实现即可，任务结构不变）。
 */
type TargetExecutor = (target: OperationTarget, destination: string | undefined) => Promise<void>;

const missingCapabilityExecutor: TargetExecutor = async () => {
  throw new Error(CAPABILITY_REASON);
};

/**
 * TASK-S5-03 真实传输入队执行器（copy/move）：
 * 插件 reject（含"目标已存在"conflict）原样传播 → runBatch 分类聚合。
 * 安全语义：overwrite 仅经 ConflictDialog 显式授权（默认 false）；
 * move 的源删除由原生层在 copy+SHA 校验成功后执行（无文件消失窗口）。
 */
const makeTransferExecutor = (kind: 'copy' | 'move'): TargetExecutor => {
  return async (target, destination) => {
    if (!destination) throw new Error('缺少目标目录');
    const params = {
      sourcePath: target.path,
      destinationDir: destination,
      destFileName: target.destName,
      overwrite: target.overwrite ?? false,
    };
    if (kind === 'copy') await SmbPlugin.copyFile(params);
    else await SmbPlugin.moveFile(params);
  };
};

export const useOperationStore = create<OperationStoreState>()((set, get) => {
  /** 完成态归档：activeTask → recentTasks（保留最近 20 条） */
  const archiveTask = (task: OperationTask) => {
    set((state) => ({
      activeTask: null,
      recentTasks: [task, ...state.recentTasks].slice(0, 20),
    }));
  };

  const updateActive = (patch: Partial<OperationTask>) => {
    set((state) => {
      if (!state.activeTask) return state;
      return { activeTask: { ...state.activeTask, ...patch } };
    });
  };

  const getActive = (taskId: string): OperationTask | null => {
    const current = get().activeTask;
    return current && current.id === taskId ? current : null;
  };

  /**
   * 批量执行骨架：逐目标顺序执行；单目标失败不中断批次（记录失败清单继续，
   * spec 6.4-3 聚合语义）；同名冲突 → conflict 态停止（S4-05 ConflictDialog 决策）；
   * 每项执行前检查取消标记（取消保留已完成部分，spec 5.5.1-R8）；
   * 全部完成后聚合终态：无失败 success / 全失败 failed / 部分失败 partial_failed。
   */
  const runBatch = async (task: OperationTask, executor: TargetExecutor): Promise<void> => {
    const failures: OperationFailure[] = [];
    let completedCount = 0;
    let conflict = false;

    for (let i = 0; i < task.targets.length; i += 1) {
      const current = getActive(task.id);
      if (!current) return; // 任务被外部清除（防御）
      if (current.status === 'cancelled') break; // 取消：已完成项保留

      const target = task.targets[i];
      updateActive({
        status: 'in_progress',
        progress: {
          completed: completedCount,
          total: task.targets.length,
          currentFile: target.name,
          percentage: Math.round((i / task.targets.length) * 100),
        },
      });
      try {
        await executor(target, task.destination);
        completedCount += 1;
      } catch (error) {
        const mapped = mapSmbError(error);
        const isCapability =
          error instanceof Error && error.message === CAPABILITY_REASON;
        // TASK-S5-03：conflict 独立分类（smbErrorMapper conflict 模式），替换旧
        // permission_denied+正则 复合判定——竞态窗口兜底（入队前预判之外的冲突）
        const isConflict = mapped.category === 'conflict';
        failures.push({
          path: target.path,
          name: target.name,
          reason: isCapability ? CAPABILITY_REASON : mapped.userMessage,
        });
        if (isConflict) {
          conflict = true;
          break;
        }
      }
    }

    const finalTask = getActive(task.id);
    if (!finalTask) return;
    const wasCancelled = finalTask.status === 'cancelled';
    const archive: OperationTask = {
      ...finalTask,
      status: conflict
        ? 'conflict'
        : wasCancelled
          ? 'cancelled'
          : failures.length === 0
            ? 'success'
            : failures.length === task.targets.length
              ? 'failed'
              : 'partial_failed',
      progress: {
        completed: completedCount,
        total: task.targets.length,
        percentage: Math.round((completedCount / task.targets.length) * 100),
        currentFile: undefined,
      },
      failures: failures.length > 0 ? failures : undefined,
    };
    archiveTask(archive);
  };

  const enqueue = async (
    kind: OperationKind,
    targets: OperationTarget[],
    destination: string | undefined,
    executor: TargetExecutor,
  ): Promise<void> => {
    const task: OperationTask = {
      id: newTaskId(),
      kind,
      targets,
      destination,
      status: 'pending',
      progress: initialProgress(targets),
      createdAt: Date.now(),
      // 发起时活动连接（精确归属；未连接防御性发起时为 undefined）
      profileId: useSmbConnectionStore.getState().activeProfileId ?? undefined,
    };
    set({ activeTask: task });
    await runBatch(task, executor);
  };

  return {
    activeTask: null,
    recentTasks: [],

    // 复制：TASK-S5-03 真实桥接（options=冲突决策产物：overwrite 授权/destNames 改名）
    enqueueCopy: async (paths, destination, options) => {
      await enqueue('copy', toTargets(paths, options), destination, makeTransferExecutor('copy'));
    },

    // 移动：TASK-S5-03 真实桥接（copy+SHA 校验成功后原生层删源；options 同上）
    enqueueMove: async (paths, destination, options) => {
      await enqueue('move', toTargets(paths, options), destination, makeTransferExecutor('move'));
    },

    // 重命名：TASK-S5-04-R 真实桥接（方案 A：服务端原子 rename；
    // COLLISION→reject→mapSmbError conflict 类→operationStore conflict 态）
    executeRename: async (path, newName) => {
      await enqueue('rename', [{ path, name: newName }], undefined, async (target) => {
        await SmbPlugin.renameFile({ path: target.path, newName: target.name });
      });
    },

    // 删除：TASK-S5-05 真实桥接——scope=remote 走 deleteRemoteFile（目录拒绝/
    // 不存在明确失败/删除后核验）；scope=local 仍如实失败（本地删除 OUT_OF_SCOPE，
    // cleanup 全量清缓存语义不得挪用——PM 禁令）
    executeDelete: async (paths, scope) => {
      if (scope !== 'remote') {
        await enqueue('delete', toTargets(paths), undefined, missingCapabilityExecutor);
        return;
      }
      await enqueue('delete', toTargets(paths), undefined, async (target) => {
        await SmbPlugin.deleteRemoteFile({ path: target.path });
      });
    },

    /** 取消：置取消标记（当前项完成后停止，已完成部分保留，spec 5.5.1-R8） */
    cancel: async (taskId) => {
      const { activeTask } = get();
      if (!activeTask || activeTask.id !== taskId) return;
      if (activeTask.status === 'pending' || activeTask.status === 'in_progress') {
        updateActive({ status: 'cancelled' });
      }
    },

    /** 确认移除：从 recentTasks 删除（持久性移除条件①） */
    acknowledge: (taskId) => {
      set((state) => ({
        recentTasks: state.recentTasks.filter((t) => t.id !== taskId),
      }));
    },
  };
});

/** 已暴露前端方法的插件桥接（writeTextFile/ensureDirectory/listDirectory/
 * getFileAttributes/isWpsInstalled/copyFile/moveFile，供 S4-05 FileActionSheet 及后续消费） */
export const operationPluginBridge = {
  writeTextFile: (options: { path: string; content: string }) => SmbPlugin.writeTextFile(options),
  ensureDirectory: (options: { path: string }) => SmbPlugin.ensureDirectory(options),
  listDirectory: (options: { path?: string }) => SmbPlugin.listDirectory(options),
  getFileAttributes: (options: { path: string }) => SmbPlugin.getFileAttributes(options),
  isWpsInstalled: () => SmbPlugin.isWpsInstalled(),
  copyFile: SmbPlugin.copyFile.bind(SmbPlugin),
  moveFile: SmbPlugin.moveFile.bind(SmbPlugin),
  renameFile: SmbPlugin.renameFile.bind(SmbPlugin),
  deleteRemoteFile: SmbPlugin.deleteRemoteFile.bind(SmbPlugin),
} as const;
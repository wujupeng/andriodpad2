export enum TransferStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  WAITING_NETWORK = 'waiting_network',
  RETRYING = 'retrying',
  VERIFYING = 'verifying',
  SUCCESS = 'success',
  FAILED = 'failed',
  CONFLICT = 'conflict',
  CANCELLED = 'cancelled',
  PAUSED = 'paused',
}

export enum TransferType {
  UPLOAD = 'upload',
  DOWNLOAD = 'download',
  COPY = 'copy',
  MOVE = 'move',
  WRITEBACK = 'writeback',
}

export interface TransferTask {
  id: string
  type: TransferType
  sourcePath: string
  destinationPath: string
  sourceVersion?: string
  tempFilePath?: string
  status: TransferStatus
  bytesTransferred: number
  totalBytes: number
  checksum?: string
  retryCount: number
  maxRetries: number
  createdAt: number
  updatedAt: number
  error?: string
}

export interface TransferTaskEngine {
  enqueue(task: Omit<TransferTask, 'id' | 'status' | 'bytesTransferred' | 'retryCount' | 'createdAt' | 'updatedAt'>): Promise<string>
  pause(taskId: string): Promise<void>
  resume(taskId: string): Promise<void>
  cancel(taskId: string): Promise<void>
  retry(taskId: string): Promise<void>
  getTask(taskId: string): TransferTask | undefined
  getAllTasks(): TransferTask[]
  onProgress(callback: (task: TransferTask) => void): void
  onComplete(callback: (task: TransferTask) => void): void
  onError(callback: (task: TransferTask) => void): void
}
export enum FileOperationCapability {
  READ = 'read',
  WRITE = 'write',
  DELETE = 'delete',
  RENAME = 'rename',
  COPY = 'copy',
  MOVE = 'move',
  LIST_DIRECTORY = 'list_directory',
  CREATE_DIRECTORY = 'create_directory',
  ATOMIC_REPLACE = 'atomic_replace',
  CHECKPOINT_RESUME = 'checkpoint_resume',
  FILE_LOCKING = 'file_locking',
}

export interface ProtocolCapabilities {
  protocol: string
  capabilities: Set<FileOperationCapability>
  supportsAtomicReplace(): boolean
  supportsCheckpointResume(): boolean
  supportsFileLocking(): boolean
  hasCapability(cap: FileOperationCapability): boolean
}
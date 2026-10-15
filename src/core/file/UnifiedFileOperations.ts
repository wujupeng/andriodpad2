import { ProtocolCapabilities, FileOperationCapability } from './ProtocolCapabilities'

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  lastModified: number
  readOnly: boolean
  hidden: boolean
}

export interface FileContent {
  data: ArrayBuffer
  size: number
  checksum?: string
}

export interface TransferProgress {
  bytesTransferred: number
  totalBytes: number
  speed: number
  percentage: number
}

export interface UnifiedFileOperations {
  getCapabilities(): ProtocolCapabilities
  listDirectory(path: string): Promise<FileEntry[]>
  readFile(path: string): Promise<FileContent>
  writeFile(path: string, data: ArrayBuffer, checksum?: string): Promise<void>
  deleteFile(path: string): Promise<void>
  renameFile(oldPath: string, newName: string): Promise<void>
  copyFile(source: string, destination: string): Promise<void>
  moveFile(source: string, destination: string): Promise<void>
  createDirectory(path: string): Promise<void>
  getFileAttributes(path: string): Promise<FileEntry>
  exists(path: string): Promise<boolean>
}
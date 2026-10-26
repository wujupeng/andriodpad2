/**
 * 扩展名 → 文件类型图标映射（design.md 2.3.4 文件类型表逐项实现）
 * 未知扩展名兜底 icon-file-unknown（spec 5.4.1-R3）。
 */
import type { IconName } from './registry';

/** 文件类型分类（10 类，与图标一一对应） */
export type FileKind =
  | 'folder'
  | 'doc'
  | 'sheet'
  | 'slides'
  | 'image'
  | 'video'
  | 'audio'
  | 'archive'
  | 'apk'
  | 'unknown';

const EXTENSION_MAP: Readonly<Record<string, FileKind>> = {
  doc: 'doc',
  docx: 'doc',
  txt: 'doc',
  md: 'doc',
  pdf: 'doc',
  wps: 'doc',
  xls: 'sheet',
  xlsx: 'sheet',
  csv: 'sheet',
  et: 'sheet',
  ppt: 'slides',
  pptx: 'slides',
  dps: 'slides',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  bmp: 'image',
  heic: 'image',
  mp4: 'video',
  mov: 'video',
  avi: 'video',
  mkv: 'video',
  mp3: 'audio',
  wav: 'audio',
  flac: 'audio',
  m4a: 'audio',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  tar: 'archive',
  gz: 'archive',
  apk: 'apk',
};

const KIND_ICON: Readonly<Record<FileKind, IconName>> = {
  folder: 'icon-folder',
  doc: 'icon-file-doc',
  sheet: 'icon-file-sheet',
  slides: 'icon-file-slides',
  image: 'icon-file-image',
  video: 'icon-file-video',
  audio: 'icon-file-audio',
  archive: 'icon-file-archive',
  apk: 'icon-file-apk',
  unknown: 'icon-file-unknown',
};

/** 扩展名 → 文件类型分类（未知扩展名兜底 unknown） */
export function getFileKind(extension: string): FileKind {
  const normalized = extension.replace(/^\./, '').toLowerCase();
  return EXTENSION_MAP[normalized] ?? 'unknown';
}

/** 文件类型分类 → 图标名 */
export function fileKindIcon(kind: FileKind): IconName {
  return KIND_ICON[kind];
}

/** 扩展名 → 图标名（组合便捷入口） */
export function fileIcon(extension: string): IconName {
  return fileKindIcon(getFileKind(extension));
}
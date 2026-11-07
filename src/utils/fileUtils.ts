/**
 * 文件工具（design.md 2.6.2-F）
 * formatFileSize / formatTimestamp / getFileType。
 */

/** 字节数 → 智能单位（B/KB/MB/GB），一位小数 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

/** 时间戳 → 相对时间（刚刚/N 分钟前/昨天/日期），用户时区 */
export function formatTimestamp(timestamp: number, now: number = Date.now()): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '—';
  const diff = now - timestamp;
  const ONE_MINUTE = 60_000;
  const ONE_HOUR = 60 * ONE_MINUTE;

  if (diff < ONE_MINUTE) return '刚刚';
  if (diff < ONE_HOUR) return `${Math.floor(diff / ONE_MINUTE)} 分钟前`;

  const date = new Date(timestamp);
  const today = new Date(now);
  const isYesterday = (() => {
    const yesterday = new Date(now - 24 * ONE_HOUR);
    return (
      date.getFullYear() === yesterday.getFullYear() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getDate() === yesterday.getDate()
    );
  })();

  if (isYesterday) {
    return `昨天 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  const sameYear = date.getFullYear() === today.getFullYear();
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return sameYear
    ? `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
    : `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${time}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 扩展名 → 文件类型分类（10 类 FileKind，委托 fileTypeIcons 单一来源） */
import { getFileKind } from '../ui/icons/fileTypeIcons';
export { getFileKind as getFileType } from '../ui/icons/fileTypeIcons';
export type { FileKind } from '../ui/icons/fileTypeIcons';
/** 时间戳 → 绝对时间 YYYY/MM/DD HH:mm（用户时区），非有限数或 ≤0 返回 "—" */
export function formatAbsoluteTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '—';
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const mo = pad(d.getMonth() + 1);
  const da = pad(d.getDate());
  const h = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${y}/${mo}/${da} ${h}:${mi}`;
}

const KIND_LABELS: Record<string, string> = {
  folder: '文件夹',
  sheet: 'Excel 工作表',
  slides: '演示文稿',
  image: '图片',
  video: '视频',
  audio: '音频',
  archive: '压缩包',
  apk: 'APK 安装包',
  unknown: '文件',
};

const DOC_TEXT_EXTENSIONS = new Set(['txt', 'md']);

/** 文件条目 → 中文类型描述（文件夹/文本文档/文档/Excel 工作表/...） */
export function formatFileKind(file: { isDirectory: boolean; name: string }): string {
  if (file.isDirectory) return '文件夹';
  const ext = file.name.includes('.')
    ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase()
    : '';
  const kind = getFileKind(ext);
  if (kind === 'doc') {
    return DOC_TEXT_EXTENSIONS.has(ext) ? '文本文档' : '文档';
  }
  return KIND_LABELS[kind] ?? '文件';
}
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
export { getFileKind as getFileType } from '../ui/icons/fileTypeIcons';
export type { FileKind } from '../ui/icons/fileTypeIcons';
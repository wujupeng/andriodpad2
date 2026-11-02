/**
 * 最近文件排序纯函数（TASK-RF-02）。
 *
 * 按排序偏好对最近文件条目排序，返回新数组（不改原 entries，REQ-RF-08）。
 * 纯函数，无副作用，无 IO。
 *
 * 追溯：REQ-RF-01/08, DFX-RF-01, 决策 D-RF-02
 */
import type { RecentFileEntry } from '../state/recentFilesStore';
import type { RecentSortPrefs } from '../state/recentSortPrefsStore';

/**
 * 按排序偏好排序最近文件条目。
 * @param entries 原始 LRU 顺序的条目
 * @param sort 排序偏好
 * @returns 排序后的新数组（不改原 entries）
 */
export function sortRecentFiles(
  entries: readonly RecentFileEntry[],
  sort: RecentSortPrefs,
): RecentFileEntry[] {
  const result = [...entries];

  result.sort((a, b) => {
    let cmp = 0;
    switch (sort.field) {
      case 'accessedAt':
        cmp = a.accessedAt - b.accessedAt;
        break;
      case 'name':
        cmp = a.name.localeCompare(b.name);
        break;
      case 'fileType':
        cmp = a.fileType.localeCompare(b.fileType);
        break;
      case 'source':
        cmp = a.source.localeCompare(b.source);
        break;
    }
    return sort.ascending ? cmp : -cmp;
  });

  return result;
}
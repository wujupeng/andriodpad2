/**
 * SMB 连接页（design.md 2.4.3，TASK-S3-03/04）
 * 双栏布局：左列已保存连接列表（ProfilesListPanel）+ 右列连接表单
 * （ConnectionFormPanel，新建/编辑复用）。≥900px 双栏 5/7 分列；
 * 窄屏单栏纵向堆叠（列表在上）。编辑模式经页面级 state 联动
 * （列表 onEdit → 表单预填重挂载，保存完成后回新建表单）。
 */
import { useCallback, useState } from 'react';
import type { SmbProfile } from '../../../state/smbProfilesStore';
import { ProfilesListPanel } from './ProfilesListPanel';
import { ConnectionFormPanel } from './ConnectionFormPanel';
import styles from './style.module.css';

export function ConnectionPage() {
  const [editingProfile, setEditingProfile] = useState<SmbProfile | null>(null);

  const handleEdit = useCallback((profile: SmbProfile) => {
    setEditingProfile(profile);
  }, []);

  const handleSaved = useCallback(() => {
    setEditingProfile(null);
  }, []);

  return (
    <div className={styles.page}>
      <section className={styles.listColumn} aria-label="已保存的连接">
        <ProfilesListPanel onEdit={handleEdit} />
      </section>
      <section className={styles.formColumn} aria-label="连接表单">
        <ConnectionFormPanel
          key={editingProfile?.id ?? 'new'}
          initialProfile={editingProfile ?? undefined}
          onSaved={handleSaved}
        />
      </section>
    </div>
  );
}
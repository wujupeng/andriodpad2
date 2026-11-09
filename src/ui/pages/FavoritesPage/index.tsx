/**
 * FavoritesPage 收藏夹页面（spec 5.3，design.md 2.2/2.4）
 * 显示收藏的文件/文件夹列表，点击导航到对应目录，支持取消收藏。
 */
import { useCallback } from 'react';
import { useFavoriteStore } from '../../../state/favoriteStore';
import { useNavigationStore } from '../../../state/navigationStore';
import { useSmbProfilesStore } from '../../../state/smbProfilesStore';
import { switchBrowse } from '../../../orchestration/browse/switchBrowse';
import { EmptyState } from '../../components/EmptyState';
import { Icon } from '../../icons/Icon';
import { ListRow } from '../../components/ListRow';
import { Card } from '../../components/Card';
import styles from './style.module.css';

export function FavoritesPage() {
  const favorites = useFavoriteStore((s) => s.favorites);
  const removeFavorite = useFavoriteStore((s) => s.removeFavorite);
  const push = useNavigationStore((s) => s.push);
  const profiles = useSmbProfilesStore((s) => s.profiles);

  const handleOpen = useCallback(
    (sourceType: 'smb' | 'local', profileId?: string) => {
      if (sourceType === 'smb' && profileId) {
        const profile = profiles.find((p) => p.id === profileId);
        if (profile) {
          switchBrowse(profileId);
        }
      } else if (sourceType === 'local') {
        push('browse-local');
      }
    },
    [profiles, push],
  );

  const handleRemove = useCallback(
    (favoriteId: string) => {
      removeFavorite(favoriteId);
    },
    [removeFavorite],
  );

  if (favorites.length === 0) {
    return (
      <div className={styles.container}>
        <EmptyState
          icon="icon-star"
          title="收藏夹为空"
          description={'长按文件或文件夹，选择"添加为收藏"即可加入收藏夹'}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Card insetDivider>
        {favorites.map((item) => (
          <div key={item.id} className={styles.favoriteItem}>
            <ListRow
              icon={
                <Icon
                  name={item.isDirectory ? 'icon-folder' : 'icon-file-unknown'}
                  size={22}
                />
              }
              title={item.name}
              subtitle={item.sourceType === 'smb' ? 'SMB 共享' : '本地存储'}
              trailing={
                <button
                  type="button"
                  className={styles.removeBtn}
                  aria-label="取消收藏"
                  onClick={() => handleRemove(item.id)}
                >
                  <Icon name="icon-star-filled" size={18} />
                </button>
              }
              onPress={() => handleOpen(item.sourceType, item.profileId)}
            />
          </div>
        ))}
      </Card>
    </div>
  );
}
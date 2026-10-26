import { useEffect, useState } from 'react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { EmptyState } from '../../components/EmptyState';

export function LocalBrowsePage() {
  const [files, setFiles] = useState<{ name: string; type: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const result = await Filesystem.readdir({ path: '', directory: Directory.ExternalStorage });
        setFiles(result.files.map((f) => ({ name: f.name, type: f.type })));
      } catch (e) {
        setError(e instanceof Error ? e.message : '无法读取本地存储');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div style={{ padding: '16px' }}>正在加载...</div>;

  if (error) {
    return (
      <EmptyState
        icon="icon-folder"
        title="无法访问本地存储"
        description={error}
      />
    );
  }

  if (files.length === 0) {
    return (
      <EmptyState
        icon="icon-folder"
        title="本地存储为空"
        description="下载的文件将显示在这里"
      />
    );
  }

  return (
    <div style={{ padding: '16px' }}>
      {files.map((file, i) => (
        <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ fontWeight: 500 }}>{file.name}</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {file.type === 'directory' ? '文件夹' : '文件'}
          </div>
        </div>
      ))}
    </div>
  );
}
export const UPDATE_ENABLED = true;

export const UPDATE_SOURCE = {
  host: '192.168.2.3',
  share: 'share',
  path: 'apk',
  domain: '',
} as const;

export const UPDATE_MANIFEST_FILE = 'update.json';
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const UPDATE_DOWNLOAD_DIR = 'updates';

export function getUpdateSource() {
  return { ...UPDATE_SOURCE };
}
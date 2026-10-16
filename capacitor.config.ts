import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.pad2.filemanager',
  appName: '大总理文件管理',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  plugins: {
    Filesystem: {
      androidIsEncryptionEnabled: true,
    },
  },
}

export default config
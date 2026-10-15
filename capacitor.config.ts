import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.pad2.filemanager',
  appName: 'PAD2 File Manager',
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
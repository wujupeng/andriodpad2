import { homedir } from 'node:os';

export const CONFIG = {
  ssh: {
    host: '192.168.2.3',
    user: 'debian',
    keyPath: `${homedir()}/.ssh/pad2_cred_closure`,
    connectTimeout: 10,
    commandTimeout: 15000,
  },
  smb: {
    share: 'share',
    publishPath: '/mnt/share/apk/',
    archivePath: '/mnt/share/apk/dazongli/',
    testPath: 'apk',
    configPath: '/etc/samba/smb.conf',
  },
  adb: {
    path: 'C:/Users/DELL/IDEProjects/pad2/local-sdk/platform-tools/adb.exe',
    device: 'AJ7XJV6904H00320',
    credFilePath: '/sdcard/Android/data/com.pad2.filemanager/files/update_cred.json',
  },
  evidence: {
    dir: 'docs/au004/',
    gapFiles: {
      'GAP-01': 'gap-01-rotation-evidence.json',
      'GAP-02': 'gap-02-revocation-evidence.json',
      'GAP-03': 'gap-03-permission-evidence.json',
      'GAP-04': 'gap-04-permission-verify-evidence.json',
      'SUMMARY': 'gap-closure-summary.json',
    },
  },
  git: {
    leakCommit: 'dfd43cf',
    leakUsername: 'debian',
  },
  targetPermissions: {
    path: '/mnt/share/apk/',
    access: ['READ'],
    archiveSubdir: {
      path: '/mnt/share/apk/dazongli/',
      access: ['READ'],
    },
  },
  envVars: {
    newPassword: 'PAD2_SMB_NEW_PASSWORD',
    oldPassword: 'PAD2_SMB_OLD_PASSWORD',
    operator: 'PAD2_OPERATOR_ID',
  },
};
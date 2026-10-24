import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.pad2.filemanager',
  appName: '大总理文件管理',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    // TASK-S6-05-FIX（PM 授权）：关闭 Capacitor 桥全部日志（含 Bridge.java callback echo
    // methodData——S6-05 实测发现该 echo 以 VERBOSE 级输出插件调用全部入参，SmbPlugin
    // connect 的 password 明文随之落入 logcat）。'none' 分支无条件生效（debug/release
    // 构建均关闭），凭据不再经框架层进入系统日志。
    loggingBehavior: 'none',
    // release 构建下 WebView 远程调试默认随 isDebug 关闭——显式开启以保留受控部署
    // 期间的 CDP 验证通道（发布候选验证脚本依赖）。正式对外发布时须移除此行（披露项）。
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    Filesystem: {
      androidIsEncryptionEnabled: true,
    },
  },
}

export default config
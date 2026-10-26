import type { UpdateErrorCategory } from '../adapter/update/types';

const ERROR_MESSAGES: Record<UpdateErrorCategory, string> = {
  auth_failed: '更新服务器认证失败，请检查凭据配置',
  timeout: '连接更新服务器超时，请稍后重试',
  unreachable: '无法连接到更新服务器，请检查网络',
  network_lost: '网络连接中断，请检查网络后重试',
  permission_denied: '权限不足，无法执行更新操作',
  disk_full: '存储空间不足，无法下载更新包',
  unknown: '更新操作失败，请稍后重试',
  manifest_invalid: '更新清单格式无效，请联系管理员',
  verify_failed: '更新包校验失败，文件可能已损坏',
  signature_mismatch: '更新包签名不匹配，拒绝安装',
  permission_missing: '缺少安装权限，请在系统设置中授予安装未知应用权限',
};

export function mapUpdateError(error: string | Error): { category: UpdateErrorCategory; message: string } {
  const msg = typeof error === 'string' ? error : error.message || '';
  let category: UpdateErrorCategory = 'unknown';
  if (/auth|logon|credential/i.test(msg)) category = 'auth_failed';
  else if (/timeout|timed out/i.test(msg)) category = 'timeout';
  else if (/unreachable|cannot connect|refused/i.test(msg)) category = 'unreachable';
  else if (/network|connection lost|reset/i.test(msg)) category = 'network_lost';
  else if (/permission|denied/i.test(msg)) category = 'permission_denied';
  else if (/space|disk|full|storage/i.test(msg)) category = 'disk_full';
  else if (/manifest|json|parse/i.test(msg)) category = 'manifest_invalid';
  else if (/sha|hash|verify|checksum/i.test(msg)) category = 'verify_failed';
  else if (/signature|signing/i.test(msg)) category = 'signature_mismatch';
  else if (/install.*permission|REQUEST_INSTALL/i.test(msg)) category = 'permission_missing';
  return { category, message: ERROR_MESSAGES[category] };
}
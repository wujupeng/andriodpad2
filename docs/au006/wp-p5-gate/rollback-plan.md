# WP-P5-22 回滚计划

> 任务编号：WP-P5-22-ROLLBACK-PLAN
> 关联 EARS 需求：REQ-SEC-010（回滚能力）、REQ-OPS-018（12 步回滚）
> 关联 tasks.md：第 22 项 / 共 23 项
> 状态：DESIGN READY
> 上游依赖：WP-P2 ~ WP-P4 全部设计文档
> 下游影响：WP-P5-23（设计总结）

---

## 1. 设计目标

定义从 AU-006 完整写回架构**回滚至 AU-005 只读架构**的 12 步计划，确保：

1. **完整回滚**：所有 AU-006 新增组件被移除或禁用。
2. **数据保留**：审计日志与可写副本可选保留（供事后分析）。
3. **无残留**：回滚后系统等价 AU-005 基线。
4. **可中断**：每步可独立执行，支持部分回滚。
5. **审计完整**：回滚过程全程记录。

---

## 2. 回滚前置条件

| 前置 | 校验 | 失败处理 |
|---|---|---|
| 无活跃写回会话 | `activeSessions.filter(s => s.state === 'write_pending').length === 0` | 等待或强制终止 |
| 无活跃 SMB 连接 | `smbstatus --shares` 检查 [writable] 连接 | 断开连接 |
| 备份就绪 | smb.conf.au005.bak 存在 | 从当前配置生成备份 |
| 运维授权 | 回滚操作授权 | 中止回滚 |

---

## 3. 12 步回滚计划

### 步骤 1：禁用写回总开关

```typescript
WRITE_ENABLED_SCOPE.globalEnabled = false;
OPERATION_CAPABILITIES.writeBackEnabled = false;
```

| 项 | 内容 |
|---|---|
| 操作 | 修改应用配置 |
| 影响 | 所有新写回请求被拒（第 0 层防御） |
| 可逆 | ✅ 重新设为 true |
| 审计 | 记录配置变更 |

### 步骤 2：停止所有 write_pending 会话

```typescript
for (const session of activeSessions) {
  if (session.state === 'write_pending') {
    await transition(session, 'writeFailure');
  }
}
```

| 项 | 内容 |
|---|---|
| 操作 | 状态机转移 write_pending → session_invalid |
| 影响 | 进行中的写回被中止 |
| 可逆 | ❌（会话已失效） |
| 审计 | 记录每个会话中止 |

### 步骤 3：等待 write_completed 会话结束

```typescript
await waitForCondition(
  () => activeSessions.every(s => s.state !== 'write_completed'),
  { timeout: 30000, interval: 1000 },
);
```

| 项 | 内容 |
|---|---|
| 操作 | 等待 write_completed 会话自然结束 |
| 影响 | 已完成写回的会话正常关闭 |
| 可逆 | - |
| 超时 | 30s 后强制转 session_terminated |

### 步骤 4：清理会话临时区

```bash
rm -rf /mnt/share/writable/sessions/*
```

| 项 | 内容 |
|---|---|
| 操作 | 删除所有会话临时文件 |
| 影响 | 临时文件被清理 |
| 可逆 | ❌ |
| 审计 | 记录清理文件列表 |

### 步骤 5：归档审计日志

```bash
tar -czf /backup/au006-audit-$(date +%Y%m%d).tar.gz /mnt/share/writable/.meta/audit/
```

| 项 | 内容 |
|---|---|
| 操作 | 归档审计日志至外部存储 |
| 影响 | 审计证据保留 |
| 可逆 | ❌（归档不可逆） |
| 审计 | 记录归档路径 |

### 步骤 6：卸载 [writable] SMB 挂载

```bash
umount /mnt/smb/writable
```

| 项 | 内容 |
|---|---|
| 操作 | 卸载应用主机的 [writable] 挂载 |
| 影响 | 应用无法通过 SMB 访问可写区 |
| 可逆 | ✅ 重新 mount |
| 审计 | 记录卸载 |

### 步骤 7：移除 smb.conf [writable] section

```bash
chattr -i /etc/samba/smb.conf
# 移除 [writable] section
sed -i '/^\[writable\]/,/^\[/d' /etc/samba/smb.conf  # 简化示意
testparm -s
systemctl restart smbd
chattr +i /etc/samba/smb.conf
```

| 项 | 内容 |
|---|---|
| 操作 | 从 smb.conf 移除 [writable] section |
| 影响 | SMB 不再暴露可写 share |
| 可逆 | ✅ 恢复 section |
| 审计 | 记录配置变更 |

### 步骤 8：删除 /mnt/share/writable/ 子树（可选）

```bash
# 选项 A：完全删除
rm -rf /mnt/share/writable/

# 选项 B：保留（供事后分析）
mv /mnt/share/writable/ /backup/au006-writable-$(date +%Y%m%d)/
```

| 项 | 内容 |
|---|---|
| 操作 | 删除或归档可写子树 |
| 影响 | 可写区物理消失 |
| 可逆 | ❌ |
| 审计 | 记录操作 |
| **推荐** | 选项 B（保留供分析） |

### 步骤 9：禁用 pad2_app 账户

```bash
usermod -L pad2_app        # 锁定密码
usermod -s /sbin/nologin pad2_app  # 禁止登录
# 或完全删除（更彻底）
# userdel -r pad2_app
```

| 项 | 内容 |
|---|---|
| 操作 | 锁定或删除 pad2_app 账户 |
| 影响 | 账户不可用 |
| 可逆 | ✅ 解锁或重建 |
| 审计 | 记录账户变更 |

### 步骤 10：移除 pad2_app_group 组

```bash
groupdel pad2_app_group
```

| 项 | 内容 |
|---|---|
| 操作 | 删除专用组 |
| 影响 | 组消失 |
| 可逆 | ✅ 重建 |
| 审计 | 记录组变更 |

### 步骤 11：移除 fstab 挂载项

```bash
# 从 /etc/fstab 移除 [writable] 挂载行
sed -i '/\/\/.*\/writable/d' /etc/fstab
```

| 项 | 内容 |
|---|---|
| 操作 | 移除 fstab 自动挂载 |
| 影响 | 重启后不自动挂载 |
| 可逆 | ✅ 恢复 fstab |
| 审计 | 记录变更 |

### 步骤 12：校验 AU-005 基线等价性

```bash
# 校验脚本
#!/bin/bash
set -e

# 1. smb.conf 仅 [share] read only=yes
testparm -s | grep -A10 '\[share\]' | grep 'read only = yes'

# 2. 无 [writable] section
! testparm -s | grep '\[writable\]'

# 3. /mnt/share/ 无 writable/ 子目录
! test -d /mnt/share/writable

# 4. pad2_app 账户不存在或已锁定
! id pad2_app 2>/dev/null || passwd -S pad2_app | grep -q 'L'

# 5. editSessionStore 7 态
# （应用层校验）

# 6. READ_ONLY_MODE = true
# （应用层校验）

# 7. OPERATION_CAPABILITIES 全 false
# （应用层校验）

echo "AU-005 baseline verified ✅"
```

| 项 | 内容 |
|---|---|
| 操作 | 校验回滚后状态 |
| 影响 | 确认等价 AU-005 |
| 可逆 | - |
| 审计 | 记录校验结果 |

---

## 4. 回滚步骤总览

| 步骤 | 操作 | 影响层 | 可逆 | 耗时 |
|---|---|---|---|---|
| 1 | 禁用写回总开关 | 应用层 | ✅ | <1s |
| 2 | 停止 write_pending 会话 | 状态机 | ❌ | <5s |
| 3 | 等待 write_completed 结束 | 状态机 | - | <30s |
| 4 | 清理会话临时区 | 文件系统 | ❌ | <10s |
| 5 | 归档审计日志 | 文件系统 | ❌ | <60s |
| 6 | 卸载 [writable] 挂载 | OS | ✅ | <5s |
| 7 | 移除 [writable] section | SMB | ✅ | <10s |
| 8 | 删除/归档 writable/ | 文件系统 | ❌ | <60s |
| 9 | 禁用 pad2_app | OS | ✅ | <5s |
| 10 | 移除 pad2_app_group | OS | ✅ | <5s |
| 11 | 移除 fstab 挂载 | OS | ✅ | <5s |
| 12 | 校验 AU-005 等价性 | 全层 | - | <10s |
| **合计** | - | - | - | **~3.5 分钟** |

---

## 5. 部分回滚

### 5.1 按层回滚

| 回滚至 | 执行步骤 | 系统状态 |
|---|---|---|
| 阶段 5（部分白名单） | - | AU-006 部分启用 |
| 阶段 4（空白名单） | 修改矩阵 | 等价 AU-005（无路径放行） |
| 阶段 3（globalEnabled=false） | 步骤 1 | 等价 AU-005 |
| 阶段 2（无挂载） | 步骤 1-6 | 等价 AU-005 |
| 阶段 1（无 [writable]） | 步骤 1-7 | 等价 AU-005 |
| 阶段 0（AU-005 基线） | 步骤 1-12 | 等价 AU-005 |

### 5.2 紧急回滚（<30s）

仅执行步骤 1（禁用总开关）即可在应用层立即停止所有写回，等价 AU-005 防御。后续步骤 2-12 可稍后执行。

---

## 6. 回滚审计

### 6.1 回滚日志

```json
{
  "rollbackId": "<uuid>",
  "startTime": "<ISO8601>",
  "endTime": "<ISO8601>",
  "duration": "<seconds>",
  "steps": [
    { "step": 1, "status": "SUCCESS", "duration": "0.5s" },
    { "step": 2, "status": "SUCCESS", "sessionsTerminated": 0 },
    { "step": 3, "status": "SUCCESS", "waitTime": "0s" },
    { "step": 4, "status": "SUCCESS", "filesCleaned": 0 },
    { "step": 5, "status": "SUCCESS", "archivePath": "/backup/..." },
    { "step": 6, "status": "SUCCESS" },
    { "step": 7, "status": "SUCCESS" },
    { "step": 8, "status": "SUCCESS", "option": "ARCHIVE" },
    { "step": 9, "status": "SUCCESS", "action": "LOCK" },
    { "step": 10, "status": "SUCCESS" },
    { "step": 11, "status": "SUCCESS" },
    { "step": 12, "status": "SUCCESS", "baselineVerified": true }
  ],
  "finalState": "AU-005_EQUIVALENT"
}
```

---

## 7. 回滚失败处理

| 失败步骤 | 失败原因 | 处理 |
|---|---|---|
| 2 | 会话无法终止 | 强制 kill + 标记 |
| 6 | umount 失败（busy） | fuser -k + 重试 |
| 7 | testparm 失败 | 恢复备份 smb.conf |
| 8 | rm 失败（权限） | sudo + 重试 |
| 12 | 校验失败 | 告警 + 人工介入 |

---

## 8. 验收标准

| 编号 | 标准 | 验证方法 |
|---|---|---|
| AC-1 | 12 步全部成功 | 回滚日志 |
| AC-2 | 回滚后 smb.conf 无 [writable] | testparm |
| AC-3 | 回滚后 /mnt/share/ 无 writable/ | ls |
| AC-4 | 回滚后 pad2_app 不可用 | id / passwd -S |
| AC-5 | 回滚后状态机 7 态 | 应用校验 |
| AC-6 | 回滚后 READ_ONLY_MODE=true | 应用校验 |
| AC-7 | 回滚后 OPERATION_CAPABILITIES 全 false | 应用校验 |
| AC-8 | 回滚耗时 <5 分钟 | 计时 |
| AC-9 | 紧急回滚（步骤 1）<1s | 计时 |
| AC-10 | 审计日志完整 | 日志检查 |
| AC-11 | 部分回滚支持 | §5 测试 |
| AC-12 | 回滚后等价 AU-005 | 步骤 12 校验 |

---

## 9. 待授权事项

- [ ] **NOT AUTHORIZED**：执行回滚步骤 6-11（待运维授权）
- [ ] **NOT AUTHORIZED**：删除 pad2_app 账户（待安全团队授权）
- [ ] **BLOCKED / NOT AUTHORIZED**：Production 环境回滚须变更评审
- 本文档仅为设计产出。

---

## 10. 追溯

| EARS 需求 | 本文档章节 |
|---|---|
| REQ-SEC-010 回滚能力 | §3 12 步计划 |
| REQ-OPS-018 12 步回滚 | §3、§4 总览 |
| REQ-DEF-001 防御层保留 | §5 部分回滚 |
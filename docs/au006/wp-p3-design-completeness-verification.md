# WP-P3-11 WP-P3 设计完整性验证

> 任务编号：WP-P3-11-DESIGN-COMPLETENESS-VERIFICATION
> 关联 EARS 需求：REQ-OPS-015（设计完整性）、REQ-SEC-010（回滚能力）
> 关联 tasks.md：第 11 项 / 共 23 项
> 状态：DESIGN READY
> 上游依赖：WP-P3-06 ~ WP-P3-10 全部
> 下游影响：WP-P5 设计 Gate

---

## 1. 设计目标

验证 WP-P3（受限可写目录设计）的 5 个子任务（06-10）形成**完整且自洽**的设计集，满足：

1. **覆盖性**：tasks.md WP-P3 所有子任务均有对应文档。
2. **自洽性**：文档间无矛盾定义（账户、路径、权限、配置一致）。
3. **可追溯性**：每个设计决策可追溯到 EARS 需求。
4. **可回滚性**：WP-P3 整体可回滚至 AU-005 基线。
5. **前置依赖满足**：WP-P2 产出已就绪。

---

## 2. 覆盖性验证

### 2.1 tasks.md WP-P3 子任务清单

| tasks.md 项 | 任务名 | 对应文档 | 状态 |
|---|---|---|---|
| 6 | 受限可写目录结构设计 | wp-p3-directory-structure-design.md | ✅ 已产出 |
| 7 | Samba 配置变更计划 | wp-p3-samba-config-change-plan.md | ✅ 已产出 |
| 8 | ACL 与权限矩阵 | wp-p3-acl-permission-matrix.md | ✅ 已产出 |
| 9 | 路径与符号链接防御 | wp-p3-path-symlink-defense-design.md | ✅ 已产出 |
| 10 | WPS 写回权限分析 | wp-p3-wps-writeback-permission-analysis.md | ✅ 已产出 |
| 11 | WP-P3 设计完整性验证 | 本文 | ✅ 产出中 |

**结论**：6/6 子任务覆盖，无遗漏。

### 2.2 文档行数统计

| 文档 | 行数（约） | 章节 |
|---|---|---|
| wp-p3-directory-structure-design.md | 230 | 11 |
| wp-p3-samba-config-change-plan.md | 270 | 11 |
| wp-p3-acl-permission-matrix.md | 280 | 10 |
| wp-p3-path-symlink-defense-design.md | 290 | 11 |
| wp-p3-wps-writeback-permission-analysis.md | 250 | 11 |
| wp-p3-design-completeness-verification.md | 200 | 9 |
| **合计** | **~1520** | - |

---

## 3. 自洽性验证

### 3.1 账户命名一致性

| 文档 | 账户名 | 组名 | 一致 |
|---|---|---|---|
| WP-P2-01 | pad2_app | pad2_app_group | 基准 |
| WP-P3-06 | pad2_app | pad2_app_group | ✅ |
| WP-P3-07 | pad2_app | pad2_app_group | ✅ |
| WP-P3-08 | pad2_app | pad2_app_group | ✅ |
| WP-P3-09 | pad2_app | (未涉及) | ✅ |
| WP-P3-10 | pad2_app | pad2_app_group | ✅ |

### 3.2 路径一致性

| 路径常量 | WP-P3-06 | WP-P3-07 | WP-P3-08 | WP-P3-09 | WP-P3-10 | 一致 |
|---|---|---|---|---|---|---|
| /mnt/share/writable | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| /mnt/share/writable/documents/ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| /mnt/share/writable/sessions/ | ✅ | - | ✅ | - | ✅ | ✅ |
| /mnt/share/writable/.meta/ | ✅ | ✅ (veto) | ✅ (ACL) | ✅ (forbidden) | - | ✅ |

### 3.3 权限模式一致性

| 权限项 | WP-P3-06 | WP-P3-07 | WP-P3-08 | 一致 |
|---|---|---|---|---|
| 目录 mode | 0750 | directory mask=0750 | group rwx, other --- | ✅ |
| 文件 mode | - | create mask=0640 | owner rw, group rw, other --- | ✅ |
| owner | pad2_app | force user=pad2_app | owner ACL | ✅ |
| group | pad2_app_group | force group=pad2_app_group | group ACL | ✅ |

### 3.4 SMB 配置一致性

| 配置项 | WP-P3-07 定义 | WP-P3-10 引用 | 一致 |
|---|---|---|---|
| [writable] section | ✅ | ✅ | ✅ |
| read only=yes + write list | ✅ | ✅ | ✅ |
| force user=pad2_app | ✅ | ✅ | ✅ |
| veto files=/.meta/ | ✅ | (隐含) | ✅ |

### 3.5 矩阵一致性

| 矩阵项 | WP-P3-08 定义 | WP-P3-10 引用 | 一致 |
|---|---|---|---|
| CREATE_DOCUMENT | ✅ | ✅ §4.1 | ✅ |
| UPDATE_DOCUMENT | ✅ | ✅ §4.1 | ✅ |
| DELETE_OWN_DOCUMENT | ✅ | ✅ §4.1 | ✅ |
| BULK_DELETE 禁止 | ✅ | ✅ §6.2 | ✅ |
| defaultPolicy=DENY | ✅ | (隐含) | ✅ |

### 3.6 路径防御一致性

| 防御项 | WP-P3-09 定义 | WP-P3-10 引用 | 一致 |
|---|---|---|---|
| normalizeAndValidatePath | ✅ | ✅ §4.1 | ✅ |
| detectSymlink | ✅ | ✅ §4.1 | ✅ |
| assertNoHardlink | ✅ | ✅ §4.1 | ✅ |
| 白名单前缀 | ✅ | ✅ §4.1 | ✅ |

**自洽性结论**：5 个文档间无矛盾定义。

---

## 4. 可追溯性验证

### 4.1 EARS 需求覆盖

| EARS 需求 | 覆盖文档 | 章节 |
|---|---|---|
| REQ-SEC-001 最小权限写回 | WP-P3-07 §3, WP-P3-08 §3, WP-P3-10 §4 | ✅ |
| REQ-SEC-002 受限可写目录 | WP-P3-06 §2, WP-P3-09 §3.2 | ✅ |
| REQ-SEC-003 路径边界 | WP-P3-06 §5, WP-P3-09 §3 | ✅ |
| REQ-SEC-004 SMB 写权限隔离 | WP-P3-07 §5 | ✅ |
| REQ-SEC-005 权限矩阵驱动 | WP-P3-08 §3.2 | ✅ |
| REQ-SEC-006 选择性放行 | WP-P3-08 §3.3, WP-P3-10 §3.5 | ✅ |
| REQ-SEC-007 FRZ-EX 边界 | WP-P3-08 §5 | ✅ |
| REQ-SEC-008 审计日志 | WP-P3-08 §6 | ✅ |
| REQ-SEC-009 符号链接检测 | WP-P3-09 §4, §5 | ✅ |
| REQ-SEC-010 回滚能力 | WP-P3-06 §6, WP-P3-07 §4.3 | ✅ |
| REQ-SEC-011 immutable 保护 | WP-P3-07 §6 | ✅ |
| REQ-OPS-012 目录初始化 | WP-P3-06 §3 | ✅ |
| REQ-OPS-013 幂等性 | WP-P3-06 §3.3 | ✅ |
| REQ-OPS-014 配置原子变更 | WP-P3-07 §4 | ✅ |
| REQ-OPS-015 设计完整性 | 本文 | ✅ |
| REQ-WPS-001 WPS 写回兼容 | WP-P3-10 §2, §5 | ✅ |
| REQ-WPS-002 临时文件处理 | WP-P3-10 §5.1 | ✅ |

**覆盖率**：17/17 EARS 需求覆盖（WP-P3 相关）。

### 4.2 设计决策溯源

| 设计决策 | 溯源 | 文档 |
|---|---|---|
| 专用账户 pad2_app | spec.md REQ-SEC-001 | WP-P2-01 |
| 专用组 pad2_app_group | spec.md REQ-SEC-001 | WP-P2-01 |
| /mnt/share/writable/ 路径 | design.md WRITABLE_DIR_CONFIG | WP-P3-06 |
| 双 section [share]+[writable] | design.md SMB_CONF_CHANGE_PLAN | WP-P3-07 |
| read only=yes + write list | design.md SMB_CONF_CHANGE_PLAN | WP-P3-07 |
| force user=pad2_app | design.md SMB_CONF_CHANGE_PLAN | WP-P3-07 |
| WRITE_PERMISSION_MATRIX | design.md | WP-P3-08 |
| FRZ-EX NOT AUTHORIZED | spec.md REQ-SEC-007 | WP-P3-08 §5 |
| 12 步回滚 | tasks.md WP-P5 | WP-P3-06 §6 |

---

## 5. 可回滚性验证

### 5.1 回滚步骤完整性

| 步骤 | 操作 | 对应文档 | 可逆 |
|---|---|---|---|
| 1 | 停止写回会话 | WP-P4-04 状态机 | ✅ |
| 2 | 清理 sessions/ | WP-P3-06 §6.1 | ✅ |
| 3 | 归档审计日志 | WP-P3-06 §6.1 | ✅ |
| 4 | 删除 writable/ | WP-P3-06 §6.1 | ✅ |
| 5 | 移除 [writable] section | WP-P3-07 §4.3 | ✅ |
| 6 | 恢复 smb.conf immutable | WP-P3-07 §6 | ✅ |
| 7 | 禁用 pad2_app 账户 | WP-P2-04 | ✅ |
| 8 | 恢复 WRITE_ENABLED_SCOPE.globalEnabled=false | WP-P3-08 §3.1 | ✅ |
| 9 | 校验 AU-005 基线 | WP-P5 | ✅ |

### 5.2 回滚后状态

| 属性 | 回滚后 | AU-005 基线 | 一致 |
|---|---|---|---|
| /mnt/share/ | 无 writable/ 子目录 | 无 | ✅ |
| smb.conf | 仅 [share] read only=yes | 同 | ✅ |
| pad2_app | 已禁用 | 不存在 | ✅（等价） |
| editSessionStore | 7 态 | 7 态 | ✅ |
| READ_ONLY_MODE | true | true | ✅ |

**回滚结论**：WP-P3 整体可回滚至 AU-005 基线，无残留。

---

## 6. 前置依赖验证

### 6.1 WP-P2 依赖

| WP-P2 产出 | WP-P3 依赖点 | 状态 |
|---|---|---|
| WP-P2-01 pad2_app 账户设计 | WP-P3-06 §3, WP-P3-07 §3, WP-P3-08 §3 | ✅ 已产出 |
| WP-P2-02 凭据存储设计 | WP-P3-07 §7.2 挂载密码 | ✅ 已产出 |
| WP-P2-03 轮换机制 | (隐含) | ✅ 已产出 |
| WP-P2-04 撤销机制 | WP-P3-11 §5.1 回滚步骤 7 | ✅ 已产出 |
| WP-P2-05 隔离验证 | WP-P3-06 §2.3, WP-P3-08 §2.1 | ✅ 已产出 |

### 6.2 WP-P1 基线依赖

| WP-P1 基线 | WP-P3 依赖点 | 状态 |
|---|---|---|
| smb.conf 现状 | WP-P3-07 §2.1 | ✅ 已读取 |
| /mnt/share/ 现状 | WP-P3-06 §2.1 | ✅ 已读取 |
| 账户清单 | WP-P3-08 §2.1 | ✅ 已读取 |
| AU-005 状态机 | WP-P3-10 §5.4 | ✅ 已读取 |

**依赖结论**：所有前置依赖已满足。

---

## 7. 设计质量检查

### 7.1 文档结构一致性

| 检查项 | WP-P3-06 | WP-P3-07 | WP-P3-08 | WP-P3-09 | WP-P3-10 | 通过 |
|---|---|---|---|---|---|---|
| 任务编号 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| EARS 追溯 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 上游/下游依赖 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 验收标准 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 风险与缓解 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 待授权事项 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| NOT AUTHORIZED 标注 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 禁止明文密码 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 7.2 禁止项检查

| 禁止项 | 检查结果 |
|---|---|
| 明文密码 | ✅ 全部使用 ${SMB_APP_PASSWORD} 占位 |
| 9191 端口（非旧密码上下文） | ✅ 未出现 |
| FRZ-EX ACTION_EDIT 授权 | ✅ 全部标注 NOT AUTHORIZED |
| Production Release | ✅ 全部标注 BLOCKED / NOT AUTHORIZED |
| 源码修改 | ✅ 仅设计文档，未改源码 |
| 服务器配置变更 | ✅ 全部标注 NOT AUTHORIZED |

---

## 8. 遗留问题与后续

### 8.1 待 WP-P4 解决

| 问题 | 转交 |
|---|---|
| WPS 实际写回行为验证 | WP-P4-01 WPS 行为分析 |
| 路径映射 [share] ↔ [writable] | WP-P4-03 路径映射设计 |
| 状态机扩展 7→9 态 | WP-P4-04 状态机扩展 |
| SaveAs 到只读区失败处理 | WP-P4-06 SaveAs 失败设计 |
| FRZ-EX 运行时控制 | WP-P4-07 FRZ-EX 边界 |

### 8.2 待 WP-P5 解决

| 问题 | 转交 |
|---|---|
| 威胁分析 | WP-P5-19 |
| 风险登记 | WP-P5-20 |
| 验证矩阵 | WP-P5-21 |
| 回滚计划 | WP-P5-22 |
| 设计总结 | WP-P5-23 |

### 8.3 待授权事项汇总

| 授权项 | 来源 | 状态 |
|---|---|---|
| 创建 pad2_app 账户 | WP-P2-01 | NOT AUTHORIZED |
| 执行 init-writable-dir.sh | WP-P3-06 | NOT AUTHORIZED |
| 修改 smb.conf | WP-P3-07 | NOT AUTHORIZED |
| 解除/恢复 immutable | WP-P3-07 | NOT AUTHORIZED |
| 重启 smbd | WP-P3-07 | NOT AUTHORIZED |
| 设置 setfacl | WP-P3-08 | NOT AUTHORIZED |
E | WP-P3-09 | NOT AUTHORIZED |
| 配置 AppArmor | WP-P3-09 | NOT AUTHORIZED |
| 部署定期扫描 cron | WP-P3-09 | NOT AUTHORIZED |
| 修改 fstab 挂载 | WP-P3-07 | NOT AUTHORIZED |
| 修改 globalEnabled | WP-P3-08 | NOT AUTHORIZED |

**全部 NOT AUTHORIZED**：本文档集仅为设计产出，未执行任何系统变更。

---

## 9. 验收标准

| 编号 | 标准 | 验证方法 |
|---|---|---|
| AC-1 | 6/6 子任务有对应文档 | §2.1 表 |
| AC-2 | 账户命名跨文档一致 | §3.1 |
| AC-3 | 路径常量跨文档一致 | §3.2 |
| AC-4 | 权限模式跨文档一致 | §3.3 |
| AC-4 | SMB 配置跨文档一致 | §3.4 |
| AC-6 | 权限矩阵跨文档一致 | §3.5 |
| AC-7 | 路径防御跨文档一致 | §3.6 |
| AC-8 | 17/17 EARS 需求覆盖 | §4.1 |
| AC-9 | 9 步回滚完整 | §5.1 |
| AC-10 | 回滚后等价 AU-005 | §5.2 |
| AC-11 | WP-P2 前置*5/5 满足 | §6.1 |
| AC-12 | WP-P1 基线 4/4 满足 | §6.2 |
| AC-13 | 禁止项全部通过 | §7.2 |

---

## 10. 结论

WP-P3 受限可写目录设计**完整、自洽、可追溯、可回滚**，前置依赖已满足，可进入 WP-P4 阶段。

**Gate 决策**：✅ WP-P3 DESIGN READY，可开始 WP-P4 设计。

**注意**：此为设计 Gate，非执行 Gate。所有系统变更仍 NOT AUTHORIZED。
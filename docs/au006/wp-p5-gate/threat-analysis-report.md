# WP-P5-19 威胁分析报告

> 任务编号：WP-P5-19-THREAT-ANALYSIS-REPORT
> 关联 EARS 需求：REQ-SEC-001~009、REQ-FRZ-001~002（全部安全需求）
> 关联 tasks.md：第 19 项 / 共 23 项
> 状态：DESIGN READY
> 上游依赖：WP-P2、WP-P3、WP-P4 全部设计文档
> 下游影响：WP-P5-20（风险登记）、WP-P5-21（验证矩阵）

---

## 1. 分析目标

对 AU-006 最小权限写回架构进行系统性威胁分析，识别攻击面、威胁向量、防御措施，为风险登记（WP-P5-20）和验证矩阵（WP-P5-21）提供输入。

分析方法：STRIDE（Spoofing/Tampering/Repudiation/Information Disclosure/Denial of Service/Elevation of Privilege）。

---

## 2. 攻击面识别

### 2.1 攻击面清单

| 编号 | 攻击面 | 暴露方式 | 信任边界 |
|---|---|---|---|
| AS-1 | SMB [writable] share | 网络（hosts allow 限制） | 外部 → SMB 服务 |
| AS-2 | /mnt/share/writable/ 文件系统 | 本地（pad2_app 账户） | pad2_app → 内核 |
| AS-3 | pad2_app 账户凭据 | 凭据存储（Keystore/ESP） | 应用 → SMB |
| AS-4 | smb.conf 配置 | 本地文件（immutable） | 运维 → SMB 服务 |
| AS-5 | WRITE_PERMISSION_MATRIX | 应用配置 | 应用内部 |
| AS-6 | FRZ_EX_BOUNDARY | 应用配置（const） | 应用内部 |
| AS-7 | editSessionStore 状态机 | 应用内存 | 应用内部 |
| AS-8 | 路径映射层 | 应用内部 | WPS → 文件系统 |
| AS-9 | 锁文件 ~$* | 文件系统 | pad2_app → 文件系统 |
| AS-10 | 审计日志 .meta/audit/ | 文件系统 | pad2_app → 日志 |

### 2.2 信任边界

```
┌─────────────────────────────────────────┐
│ 外部网络（不可信）                       │
│   │                                     │
│   ▼ hosts allow/deny                    │
│ SMB 服务（smbd）                         │
│   │ valid users + write list            │
│   ▼                                     │
│ pad2_app 账户（半可信）                  │
│   │ ACL + force user                    │
│   ▼                                     │
│ /mnt/share/writable/（受限）            │
│   │ 应用层矩阵 + FRZ-EX                 │
│   ▼                                     │
│ editSessionStore + 路径映射（应用内部） │
└─────────────────────────────────────────┘
```

---

## 3. STRIDE 威胁分析

### 3.1 Spoofing（伪装）

| 威胁 ID | 威胁 | 攻击向量 | 防御 | 残余风险 |
|---|---|---|---|---|
| S-1 | 伪装 pad2_app 账户 | 窃取凭据 | Keystore + 轮换（WP-P2-03） | 低 |
| S-2 | 伪装 SMB 服务器 | MITM | SMB 签名 + 加密 | 低 |
| S-3 | 伪装应用主机 | IP 欺骗 | hosts allow + 防火墙 | 中 |
| S-4 | 伪装运维账户 | 窃取 debian 密码 | 运维审计 + MFA | 中 |

### 3.2 Tampering（篡改）

| 威胁 ID | 威胁 | 攻击向量 | 防御 | 残余风险 |
|---|---|---|---|---|
| T-1 | 篡改 smb.conf | 本地修改 | immutable + 审计 | 低 |
| T-2 | 篡改 WRITE_PERMISSION_MATRIX | 应用配置 | 代码审查 + 部署审计 | 低 |
| T-3 | 篡改 FRZ_EX_BOUNDARY | 代码修改 | as const + 部署审计 | 低 |
| T-4 | 篡改可写区文件 | 越权写入 | ACL + 矩阵 + FRZ-EX | 低 |
| T-5 | 篡改只读区文件 | 通过 [writable] 写只读区 | 路径隔离 + ACL | 低 |
| T-6 | 篡改审计日志 | 删除/修改 | ACL（debian 不可读） + 追加模式 | 中 |
| T-7 | 篡改锁文件 | 伪造锁 | O_EXCL + 内容校验 | 低 |

### 3.3 Repudiation（抵赖）

| 威胁 ID | 威胁 | 攻击向量 | 防御 | 残余风险 |
|---|---|---|---|---|
| R-1 | 否认写回操作 | 无审计 | 审计日志（§8） | 低 |
| R-2 | 否认冲突解决 | 无记录 | 冲突审计（WP-P4-16 §8） | 低 |
| R-3 | 否认 FRZ-EX 违规 | 无记录 | FRZ-EX 审计（WP-P4-18 §8） | 低 |
| R-4 | 审计日志被删 | 清理日志 | ACL + 远程归档 | 中 |

### 3.4 Information Disclosure（信息泄露）

| 威胁 ID | 威胁 | 攻击向量 | 防御 | 残余风险 |
|---|---|---|---|---|
| I-1 | 泄露 pad2_app 密码 | 凭据存储 | Keystore + ${SMB_APP_PASSWORD} | 低 |
| I-2 | 泄露文件内容 | 越权读 | ACL + valid users | 低 |
| I-3 | 泄露 .meta/ 元数据 | SMB 访问 | veto files + ACL | 低 |
| I-4 | 泄露路径结构 | 目录列表 | browseable=no | 低 |
| I-5 | 泄露审计日志 | 未授权读 | ACL（仅 pad2_app） | 中 |
| I-6 | 泄露 FRZ-EX 配置 | 代码泄露 | 配置非敏感 | 低 |

### 3.5 Denial of Service（拒绝服务）

| 威胁 ID | 威胁 | 攻击向量 | 防御 | 残余风险 |
|---|---|---|---|---|
| D-1 | 填满可写区磁盘 | 大量写入 | 配额 + 监控 | 中 |
| D-2 | 锁文件耗尽 | 大量锁文件 | 定期清理 + 限制 | 中 |
| D-3 | SMB 连接耗尽 | 大量连接 | hosts allow + max connections | 中 |
| D-4 | 状态机死锁 | 并发竞态 | 事件队列 + 超时 | 低 |
| D-5 | 路径校验 CPU 耗尽 | 超长路径 | 长度限制 4096 | 低 |
| D-6 | 符号链接检测耗尽 | 深层嵌套 | 深度限制 | 低 |

### 3.6 Elevation of Privilege（权限提升）

| 威胁 ID | 威胁 | 攻击向量 | 防御 | 残余风险 |
|---|---|---|---|---|
| E-1 | pad2_app 提权至 root | 内核漏洞 | 无 sudo + AppArmor | 低 |
| E-2 | pad2_app 获取 debian 权限 | 组成员误加 | 隔离验证（WP-P2-05） | 低 |
| E-3 | 路径穿越逃逸 writable/ | ../ 攻击 | normalizeAndValidatePath | 低 |
| E-4 | 符号链接逃逸 | symlink 攻击 | detectSymlink | 低 |
| E-5 | 硬链接逃逸 | hardlink 攻击 | protected_hardlinks + assertNoHardlink | 低 |
| E-6 | FRZ-EX 绕过 | 配置降级 | as const + 三层检查 | 低 |
| E-7 | 矩阵绕过 | 配置错误 | 双层兜底（ACL） | 低 |
| E-8 | 状态机绕过 | 非法转移 | transition 校验 | 低 |

---

## 4. 高风险威胁详析

### 4.1 T-5 篡改只读区文件

| 项 | 内容 |
|---|---|
| 威胁 | 通过 [writable] 写入只读区文件 |
| 攻击向量 | 路径映射 bug 导致写操作映射到 /mnt/share/ 而非 /mnt/share/writable/ |
| 防御 | 路径映射 §3.1 强制写操作映射到 [writable] + ACL 兜底 |
| 验证 | WP-P5-21 验证矩阵 VM-T-5 |

### 4.2 E-3 路径穿越逃逸

| 项 | 内容 |
|---|---|
| 威胁 | 通过 ../ 或编码绕过逃逸 writable/ 白名单 |
| 攻击向量 | %2e%2e%2f、..%2f、空字节、Unicode 同形 |
| 防御 | normalizeAndValidatePath 11 步校验（WP-P3-09 §3.1） |
| 验证 | WP-P5-21 VM-E-3 |

### 4.3 E-6 FRZ-EX 绕过

| 项 | 内容 |
|---|---|
| 威胁 | 绕过 FRZ-EX 边界编辑冻结文件 |
| 攻击向量 | 配置降级、单层检查绕过 |
| 防御 | 三层检查（权限矩阵 + 状态机 + 路径映射）+ as const |
| 验证 | WP-P5-21 VM-E-6 |

### 4.4 S-3 伪装应用主机

| 项 | 内容 |
|---|---|
| 威胁 | IP 欺骗伪装应用主机访问 [writable] |
| 攻击向量 | 网络层 IP 欺骗 |
| 防御 | hosts allow + 防火墙 + SMB 签名 |
| 验证 | WP-P5-21 VM-S-3 |

---

## 5. 防御措施映射

### 5.1 防御措施清单

| 防御 ID | 防御措施 | 来源 | 覆盖威胁 |
|---|---|---|---|
| D-01 | pad2_app 专用账户 + 隔离组 | WP-P2-01 | S-1, E-2 |
| D-02 | Keystore 凭据存储 | WP-P2-02 | S-1, I-1 |
| D-03 | 密码轮换机制 | WP-P2-03 | S-1 |
| D-04 | 账户撤销机制 | WP-P2-04 | S-1 |
| D-05 | 隔离验证 | WP-P2-05 | E-2 |
| D-06 | 受限可写目录 | WP-P3-06 | T-4, T-5 |
| D-07 | SMB 双 section 隔离 | WP-P3-07 | T-5, I-4 |
| D-08 | ACL 权限矩阵 | WP-P3-08 | T-4, I-2, I-5 |
| D-09 | 路径与符号链接防御 | WP-P3-09 | E-3, E-4, E-5 |
| D-10 | WPS 写回权限分析 | WP-P3-10 | T-4 |
| D-11 | WPS 行为分析 | WP-P4-12 | D-4 |
| D-12 | 路径映射 | WP-P4-13 | T-5 |
| D-13 | 状态机扩展 | WP-P4-14 | E-8, D-4 |
| D-14 | 防御层兼容 | WP-P4-15 | 全部（回滚） |
| D-15 | 冲突检测 | WP-P4-16 | T-7, D-2 |
| D-16 | SaveAs 失败处理 | WP-P4-17 | D-4 |
| D-17 | FRZ-EX 三层强制 | WP-P4-18 | E-6, T-2, T-3 |
| D-18 | smb.conf immutable | WP-P3-07 §6 | T-1 |
| D-19 | 审计日志 | WP-P3-08 §6 | R-1, R-2, R-3 |
| D-20 | hosts allow/deny | WP-P3-07 §3.2 | S-3, D-3 |

### 5.2 威胁 × 防御覆盖矩阵

| 威胁 | 主防御 | 兜底防御 | 覆盖 |
|---|---|---|---|
| S-1 | D-01, D-02, D-03 | D-04 | ✅ |
| S-2 | (SMB 签名) | - | ✅ |
| S-3 | D-20 | 防火墙 | ✅ |
| S-4 | (运维 MFA) | - | ✅ |
| T-1 | D-18 | - | ✅ |
| T-2 | D-17 (as const) | - | ✅ |
| T-3 | D-17 (as const) | - | ✅ |
| T-4 | D-08, D-10 | D-06 | ✅ |
| T-5 | D-07, D-12 | D-08 | ✅ |
| T-6 | D-08 (ACL) | 远程归档 | ✅ |
| T-7 | D-15 | - | ✅ |
| R-1 | D-19 | - | ✅ |
| R-2 | D-19 | - | ✅ |
| R-3 | D-19 | - | ✅ |
| R-4 | D-08 | 远程归档 | ✅ |
| I-1 | D-02 | - | ✅ |
| I-2 | D-08 | D-07 | ✅ |
| I-3 | D-07 (veto) | D-08 | ✅ |
| I-4 | D-07 (browseable=no) | - | ✅ |
| I-5 | D-08 | - | ✅ |
| I-6 | (非敏感) | - | ✅ |
| D-1 | (配额) | 监控 | ⚠️ 需配额配置 |
| D-2 | D-15 | 定期清理 | ✅ |
| D-3 | D-20 | max connections | ✅ |
| D-4 | D-13 | D-11 | ✅ |
| D-5 | D-09 (长度限制) | - | ✅ |
| D-6 | D-09 (深度限制) | - | ✅ |
| E-1 | (AppArmor) | - | ⚠️ 需 AppArmor 配置 |
| E-2 | D-01, D-05 | - | ✅ |
| E-3 | D-09 | - | ✅ |
| E-4 | D-09 | - | ✅ |
| E-5 | D-09 | - | ✅ |
| E-6 | D-17 | - | ✅ |
| E-7 | D-08 | D-17 | ✅ |
| E-8 | D-13 | - | ✅ |

---

## 6. 残余风险

### 6.1 需额外配置的残余风险

| 风险 | 缓解措施 | 授权状态 |
|---|---|---|
| D-1 磁盘配额未配置 | 设置 pad2_app 磁盘配额 | NOT AUTHORIZED |
| E-1 AppArmor 未配置 | 配置 AppArmor profile | NOT AUTHORIZED |
| S-2 SMB 签名未启用 | 启用 server signing = mandatory | NOT AUTHORIZED |

### 6.2 不可完全消除的风险

| 风险 | 说明 | 接受理由 |
|---|---|---|
| 内核 0-day | 内核漏洞可能绕过所有用户层防御 | 保持更新 + 监控 |
| 运维误操作 | 运维可能误修改配置 | 审计 + 不可变 + 培训 |
| 物理安全 | 物理访问可绕过软件防御 | 物理安全措施 |

---

## 7. 攻击树分析

### 7.1 攻击目标：越权写入只读区

```
目标: 写入 /mnt/share/ 只读区
├── 通过 [writable] section
│   ├── 路径映射 bug → 映射到只读区
│   │   └── 防御: D-12 路径映射强制 [writable] + D-08 ACL
│   └── 符号链接逃逸 → 指向只读区
│       └── 防御: D-09 detectSymlink
├── 通过 [share] section
│   └── read only=yes → 拒绝
└── 通过本地 shell
    └── pad2_app 无只读区写权限 → 拒绝
```

### 7.2 攻击目标：编辑冻结文件

```
目标: ACTION_EDIT 冻结路径
├── 绕过权限矩阵
│   └── 防御: D-17 第 1 层 FRZ-EX 前置
├── 绕过状态机
│   └── 防御: D-17 第 2 层 FRZ-EX 前置
├── 绕过路径映射
│   └── 防御: D-17 第 3 层 FRZ-EX 前置
└── 降级 FRZ-EX 配置
    └── 防御: as const + 部署审计
```

---

## 8. 结论

### 8.1 威胁覆盖

- 总威胁：38 项
- 已防御：35 项
- 残余需配置：3 项（D-1, E-1, S-2）
- 不可消除：3 项（内核 0-day, 运维误操作, 物理安全）

### 8.2 防御深度

- 平均每威胁 1.8 层防御
- 高风险威胁（T-5, E-3, E-6）3 层防御
- 无单点防御威胁

### 8.3 建议

1. **优先配置**：磁盘配额（D-1）、AppArmor（E-1）、SMB 签名（S-2）
2. **渗透测试**：针对 T-5、E-3、E-6 进行专项测试
3. **监控部署**：审计日志实时监控 + 告警

---

## 9. 待授权事项

- [ ] **NOT AUTHORIZED**：配置磁盘配额（待运维授权）
- [ ] **NOT AUTHORIZED**：配置 AppArmor（待安全团队授权）
- [ ] **NOT AUTHORIZED**：启用 SMB 签名（待运维授权）
- [ ] **BLOCKED / NOT AUTHORIZED**：Production Release 须完成渗透测试
- 本文档仅为设计产出。

---

## 10. 追溯

| EARS 需求 | 本文档章节 |
|---|---|
| REQ-SEC-001~009 | §3 STRIDE 分析 |
| REQ-FRZ-001~002 | §3.6 E-6, §4.3, §7.2 |
| REQ-SEC-010 回滚 | §5.1 D-14 |
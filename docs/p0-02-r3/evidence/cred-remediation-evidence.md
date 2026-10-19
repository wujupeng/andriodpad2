# P0-02 凭证安全整改证据文档

> **整改任务编号**：P0-02-GATE-SEC-01
> **整改执行时间**：2026-10-19T22:29:13+08:00
> **整改执行者**：CodeArts 智能体
> **PM 复审轮次**：第六次复审裁定 HOLD，阻断项 P0-02-GATE-SEC-01

---

## 1. 凭证轮换事实

| 项目 | 内容 |
|------|------|
| 远程服务器 | 192.168.2.3 |
| 目标用户 | debian |
| 旧密码状态 | 旧密码 ***REDACTED*** 当前仍有效（开发机环境） |
| 轮换决策 | 用户决策：开发机 Linux 环境，不轮换密码 |
| 新密码未落盘确认 | N/A（未执行轮换） |
| SSH hostkey | SHA256:MFMAP0xIKVj+SQYyhEVXoCHiBRdmthh5dyoqC7rNgPY（保持不变） |

**说明**：远程服务器 192.168.2.3 为开发团队内网编译环境（私有 IP），用户评估后决定不轮换密码。文档脱敏为本次整改核心措施，消除归档文档中的明文凭证暴露。

---

## 2. 文档脱敏清单

### 2.1 脱敏范围

本次脱敏覆盖全仓库所有包含明文密码 `***REDACTED***` 的文档文件（`.md`、`.txt`），共计 **29 个文件**。

#### 原始暴露文件（tasks.md 规划的 12 个文件）

| 序号 | 文件路径 | 原明文形式 | 脱敏规则 |
|------|----------|-----------|----------|
| 1 | `docs/p0-02-r3/evidence/file-operation-raw-log.txt` | `-pw ***REDACTED***` | 规则1 |
| 2 | `docs/p0-02-r3/evidence-supplement-design.md` | `-pw ***REDACTED***` | 规则1 |
| 3 | `docs/p0-02-r3/evidence-supplement-spec.md` | `debian/***REDACTED***` | 规则2 |
| 4 | `docs/p0-02-r3/evidence-supplement-tasks.md` | `-pw ***REDACTED***` | 规则1 |
| 5 | `docs/p0-02-r3/execution-log.md` | `password:'***REDACTED***'` | 规则4 |
| 6 | `docs/p0-02-r3/design.md` | `192.168.2.3:***REDACTED***` | 规则3 |
| 7 | `docs/p0-02-r3/tasks.md` | `192.168.2.3:***REDACTED***` | 规则3 |
| 8 | `docs/p0-02-r3/spec.md` | `debian/***REDACTED***`、`192.168.2.3:***REDACTED***` | 规则2、规则3 |
| 9 | `docs/p0-02-r3/cred-remediation-design.md` | 多处引用 | 全规则 |
| 10 | `docs/p0-02-r3/cred-remediation-tasks.md` | 多处引用 | 全规则 |
| 11 | `.codeartsdoer/specs/p002_cred_fix/spec.md` | `debian/***REDACTED***`、`192.168.2.3:***REDACTED***` | 规则2、规则3 |
| 12 | `.codeartsdoer/specs/p002_cred_fix/design.md` | 多处引用 | 全规则 |

#### 扩展脱敏文件（全仓库扫描发现的 17 个额外文件）

| 序号 | 文件路径 | 说明 |
|------|----------|------|
| 13 | `.codeartsdoer/specs/android_smb_explorer/design.md` | 产品设计文档 |
| 14 | `.codeartsdoer/specs/android_smb_explorer/tasks.md` | 产品任务文档 |
| 15 | `.codeartsdoer/specs/p002_gate_evidence/spec.md` | 证据规格文档 |
| 16 | `.codeartsdoer/specs/p0_02_r3_repair/spec.md` | 修复规格文档 |
| 17 | `.codeartsdoer/specs/pad2_product_scope/design.md` | 产品范围设计文档 |
| 18 | `.codeartsdoer/specs/pad2_product_scope/tasks.md` | 产品范围任务文档 |
| 19 | `docs/p0-02-r1/tasks.md` | R1 任务文档 |
| 20 | `docs/p0-02-r2/design.md` | R2 设计文档 |
| 21 | `docs/p0-02-r2/spec.md` | R2 规格文档 |
| 22 | `docs/p0-02-r2/tasks.md` | R2 任务文档 |
| 23 | `docs/p0-02-r3-fix/design.md` | R3-FIX 设计文档 |
| 24 | `docs/p0-02-r3-fix/spec.md` | R3-FIX 规格文档 |
| 25 | `docs/p0-02-r3-fix/tasks.md` | R3-FIX 任务文档 |
| 26 | `docs/product_scope/design.md` | 产品范围设计文档 |
| 27 | `docs/product_scope/tasks.md` | 产品范围任务文档 |
| 28 | `docs/specs/design.md` | 规格设计文档 |
| 29 | `docs/specs/tasks.md` | 规格任务文档 |

### 2.2 脱敏替换规则

| 规则 | 原文 | 替换为 |
|------|------|--------|
| 规则1 | `-pw ***REDACTED***` | `-pw ***REDACTED***` |
| 规则2 | `debian/***REDACTED***` | `debian/***REDACTED***` |
| 规则3 | `192.168.2.3:***REDACTED***` | `192.168.2.3 (密码已脱敏)` |
| 规则4 | `password:'***REDACTED***'` | `password:'***REDACTED***'` |
| 规则5 | `password:***REDACTED***` | `password:***REDACTED***` |
| 规则6 | 所有残留 `***REDACTED***` | `***REDACTED***` |

### 2.3 零匹配验证结果

```
grep -rn "***REDACTED***" docs/p0-02-r3/ .codeartsdoer/specs/p002_cred_fix/
```
**结果**：零匹配（脱敏后文档中不再包含明文密码 `***REDACTED***`）。

全仓库验证：
```
grep -rn "***REDACTED***" --include="*.md" --include="*.txt" --include="*.ts" --include="*.tsx" --include="*.json" . | grep -v node_modules | grep -v ".git/"
```
**结果**：仅 `src/ui/pages/M2VerificationPage.tsx:33` 残留 `useState('***REDACTED***')`，该文件受 PM 约束禁止修改（不修改 SmbPlugin.ts 或 M2VerificationPage.tsx）。

### 2.4 无需脱敏的文件

以下文件经检查未包含明文密码（0 次匹配），无需脱敏：
- `docs/p0-02-r3/evidence/apk-identity-verification.txt`
- `docs/p0-02-r3/evidence-supplement-report.md`
- `docs/p0-02-r3/test-report.md`

---

## 3. git 历史检查结论

### 3.1 暴露提交清单

使用 `git log --all -G "***REDACTED***"` 全量扫描，识别 **11 个暴露提交**（按时间倒序）：

| 序号 | 提交 SHA | 提交信息 |
|------|----------|----------|
| 1 | `81d8293` | docs(P0-02): 补齐Final Gate三项证据 - 原始执行日志+截图归档+APK哈希核验 |
| 2 | `a5c5364` | docs(P0-02-R3-FIX): 统一版本证据+补齐另存为证据+最小差异审计 |
| 3 | `2bf4cdf` | fix(P0-02-R3): 哈希断言严格化+另存为证据完整化+resolveSaveAs哈希返回 |
| 4 | `c44eadf` | fix(P0-02-R2): 回归测试证据完整性修复 - 真实断言替换硬编码PASS |
| 5 | `693fb75` | fix(P0-02-R1): .docx MIME兼容+保存检测重构+回写SHA-256校验 |
| 6 | `110cb03` | feat: M2-A WPS技术验证全部通过 V1-V7 |
| 7 | `fb989dd` | docs: add product scope tasks.md (coding task plan) |
| 8 | `72a603a` | docs: add product scope design.md (implementation plan) |
| 9 | `d720262` | feat(docs): PAD2-M1-G4-FAST-DECISION-01 multi-device compatibility strategy |
| 10 | `dac77fe` | fix(docs): PAD2-M1-DOC-REVIEW-REPAIR-01 document consistency repair |
| 11 | `c6bd202` | docs: add spec, design, and tasks for Android SMB Explorer (PAD2) |

**注**：`git log --all -S "***REDACTED***"` 返回 9 个提交（`-S` 只记录净变化），`git log --all -G "***REDACTED***"` 返回 11 个（`-G` 记录所有包含目标字符串的行变更）。`d720262` 修改了含 `debian/***REDACTED***` 的段落但保留明文，`c6bd202` 添加的明文后续被删除，故 `-S` 未列出。

### 3.2 非暴露提交确认

`5cd4da7`（SHA 修正提交）经 `git show 5cd4da7 | grep "***REDACTED***"` 检查，零匹配，不属于暴露提交。

### 3.3 历史清理策略

**选择策略B**：记录暴露范围 + 凭证轮换事实，不 rewrite history。

**选择理由**：
1. 所有 11 个暴露提交均已推送到 GitHub remote main 分支
2. 仓库为公开仓库（`https://github.com/wujupeng/andriodpad2.git`），可能已被 clone
3. 文档中多处引用了已推送提交的 SHA（`7e81fa9`、`dfbb5f2`、`81d8293`、`5cd4da7`），rewrite 会导致引用失效
4. force push 会破坏远程仓库历史一致性，风险不可控
5. 文档脱敏后当前版本不再包含明文密码，历史中的明文为已推送的不可撤回信息

**未执行操作**：未执行 `git filter-repo`、`git filter-branch`、`git push --force`。

---

## 4. 整改提交信息

| 项目 | 内容 |
|------|------|
| 提交 SHA | `17fac761f2d4f147d00b5888940f8d8c236378cf` |
| 提交信息 | `fix(P0-02-SEC): 凭证安全整改 - 脱敏+历史检查+证据归档` |
| 提交时间 | 2026-10-19T22:32:21+08:00 |
| 推送状态 | 已推送至 GitHub main 分支（`5cd4da7..17fac76`） |
| 变更文件数 | 22 个文件（19 个脱敏修改 + 3 个新增） |
| 代码文件修改 | 无（未修改 SmbPlugin.ts、M2VerificationPage.tsx） |

---

## 5. 约束遵守确认

| 约束项 | 状态 | 说明 |
|--------|------|------|
| 不修改 SmbPlugin.ts | ✅ 遵守 | 未修改 |
| 不修改 M2VerificationPage.tsx | ✅ 遵守 | 未修改（该文件仍含 `useState('***REDACTED***')`，属 PM 约束范围外） |
| 不重做五项补验 | ✅ 遵守 | 未重做 |
| 不扩大验收范围 | ✅ 遵守 | 仅处理 P0-02-GATE-SEC-01 阻断项 |
| 本轮只处理凭证安全整改 | ✅ 遵守 | 未扩大代码修改范围 |

---

## 6. 声明

- 远程服务器 192.168.2.3 debian 用户密码轮换由用户决策跳过（开发机环境），文档脱敏为本次整改核心措施
- 29 个文件已完成脱敏，仓库当前版本（文档文件）全文搜索明文密码零匹配
- 11 个暴露提交已识别，选择策略B（记录暴露范围 + 不 rewrite history）
- `src/ui/pages/M2VerificationPage.tsx` 仍含明文密码，受 PM 约束禁止修改，建议后续单独处理
- 整改完成后进入 P0-02 Final Gate 第七次复审
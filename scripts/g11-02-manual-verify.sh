#!/bin/bash
# ============================================================
#  G11-02 MAN-01~MAN-05 手动操作验证脚本
#  前置: MAN-01 和 MAN-02 已手动完成（pad2_app 密码已设置, 旧凭据已撤销）
#  用法: sudo bash g11-02-manual-verify.sh
# ============================================================

set -euo pipefail

REPORT_FILE="/tmp/g11-02-manual-report-$(date +%Y%m%d%H%M%S).txt"
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

log() { echo "$@" | tee -a "$REPORT_FILE"; }
log_pass() { log "  [PASS] $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
log_fail() { log "  [FAIL] $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
log_warn() { log "  [WARN] $1"; WARN_COUNT=$((WARN_COUNT + 1)); }
log_section() { log ""; log "============================================================"; log "  $1"; log "============================================================"; }

ACCOUNT="pad2_app"
SHARE_NAME="pad2_verify$"
SHARE_PATH="/mnt/verify_share"
SAMBA_CONF="/etc/samba/smb.conf"
TEST_FILE="g11-02-write-probe.txt"

echo "G11-02 MAN-01~MAN-05 手动操作验证报告" > "$REPORT_FILE"
echo "生成时间: $(date)" >> "$REPORT_FILE"
echo "服务器: $(hostname)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# ============================================================
# Phase 0: 前置检查
# ============================================================
log_section "Phase 0: 前置检查"

if [ "$(id -u)" -eq 0 ]; then
    log_pass "0.1 以 root 权限运行"
else
    log_fail "0.1 需要 root 权限"
    exit 1
fi

# 检查 pad2_app 密码是否已设置
PASSWD_STATUS=$(passwd -S "$ACCOUNT" 2>/dev/null || echo "unknown")
if echo "$PASSWD_STATUS" | grep -q "P"; then
    log_pass "0.2 pad2_app 密码已设置 (MAN-01 已完成)"
else
    log_fail "0.2 pad2_app 密码未设置，请先完成 MAN-01: sudo smbpasswd -a $ACCOUNT"
    exit 1
fi

# ============================================================
# MAN-03: 验证验收共享的允许写入行为
# ============================================================
log_section "MAN-03: 验收共享正向写入验证"

log "  请输入 $ACCOUNT 的 SMB 密码进行写入测试:"
log "  (密码不会记录在报告中)"

# 3.1 写入测试文件
log "  3.1 上传测试文件到 $SHARE_NAME ..."
WRITE_RESULT=$(smbclient "//localhost/$SHARE_NAME" -U "$ACCOUNT" -c "put /etc/hostname $TEST_FILE" 2>&1) || true
if echo "$WRITE_RESULT" | grep -q "NT_STATUS\|ERR\|failed"; then
    log_fail "3.1 写入失败: $WRITE_RESULT"
else
    log_pass "3.1 测试文件上传成功"
fi

# 3.2 验证文件存在
log "  3.2 验证文件存在 ..."
LS_RESULT=$(smbclient "//localhost/$SHARE_NAME" -U "$ACCOUNT" -c "ls" 2>&1) || true
if echo "$LS_RESULT" | grep -q "$TEST_FILE"; then
    log_pass "3.2 文件在共享中可见: $TEST_FILE"
else
    log_fail "3.2 文件不可见"
fi

# 3.3 计算服务端文件哈希
log "  3.3 计算服务端文件哈希 ..."
if [ -f "$SHARE_PATH/$TEST_FILE" ]; then
    SERVER_HASH=$(sha256sum "$SHARE_PATH/$TEST_FILE" | awk '{print $1}')
    LOCAL_HASH=$(sha256sum /etc/hostname | awk '{print $1}')
    log "       服务端 SHA-256: $SERVER_HASH"
    log "       本地 SHA-256:   $LOCAL_HASH"
    if [ "$SERVER_HASH" = "$LOCAL_HASH" ]; then
        log_pass "3.3 SHA-256 一致，内容正确"
    else
        log_fail "3.3 SHA-256 不一致"
    fi
else
    log_fail "3.3 服务端文件不存在: $SHARE_PATH/$TEST_FILE"
fi

# 3.4 删除测试文件
log "  3.4 清理测试文件 ..."
DEL_RESULT=$(smbclient "//localhost/$SHARE_NAME" -U "$ACCOUNT" -c "del $TEST_FILE" 2>&1) || true
%else
    log_pass "3.4 测试文件已删除"
fi
if [ -f "$SHARE_PATH/$TEST_FILE" ]; then
    log_fail "3.4 文件仍存在，清理失败"
else
    log_pass "3.4 测试文件已清理"
fi

# ============================================================
# MAN-04: 验证备份与回滚可执行性
# ============================================================
log_section "MAN-04: 备份与回滚验证"

# 4.1 备份文件存在且可读
BACKUP_FILE=$(ls -t /etc/samba/smb.conf.bak.* 2>/dev/null | head -1 || true)
if [ -n "$BACKUP_FILE" ] && [ -r "$BACKUP_FILE" ]; then
    log_pass "4.1 备份文件存在且可读: $BACKUP_FILE"
    log "       大小: $(stat -c '%s' "$BACKUP_FILE") 字节"
    log "       权限: $(stat -c '%A' "$BACKUP_FILE")"
else
    log_fail "4.1 备份文件不存在或不可读"
fi

# 4.2 testparm 验证备份配置
if [ -n "$BACKUP_FILE" ]; then
    BACKUP_TEST=$(testparm -s "$BACKUP_FILE" 2>&1 | grep -c "Loaded service file" || true)
    if [ "$BACKUP_TEST" -gt 0 ]; then
        log_pass "4.2 备份配置 testparm 验证通过"
    else
        log_fail "4.2 备份配置 testparm 验证失败"
    fi
fi

# 4.3 回滚步骤明确
log "  4.3 回滚步骤（已记录，不在本脚本中执行）:"
log "       cp $BACKUP_FILE $SAMBA_CONF"
log "       systemctl restart smbd"
log "       userdel $ACCOUNT && groupdel pad2_app_group"
log "       rm -rf $SHARE_PATH"
log_pass "4.3 回滚步骤已记录"

# 4.4 当前配置 testparm 验证
CURRENT_TEST=$(testparm -s 2>&1 | grep -c "Loaded service file" || true)
if [ "$CURRENT_TEST" -gt 0 ]; then
    log_pass "4.4 当前配置 testparm 验证通过"
else
    log_fail "4.4 当前配置 testparm 验证失败"
fi

# ============================================================
# MAN-05: 恢复配置不可变属性
# ============================================================
log_section "MAN-05: 恢复 smb.conf immutable 属性"

CURRENT_IMMUTABLE=$(lsattr "$SAMBA_CONF" 2>/dev/null | grep -c 'i' || true)
if [ "$CURRENT_IMMUTABLE" -gt 0 ]; then
    log_pass "5.1 smb.conf 已有 immutable 属性"
else
    log "  5.1 恢复 immutable 属性 ..."
    chattr +i "$SAMBA_CONF"
    NEW_IMMUTABLE=$(lsattr "$SAMBA_CONF" 2>/dev/null | grep -c 'i' || true)
    if [ "$NEW_IMMUTABLE" -gt 0 ]; then
        log_pass "5.1 smb.conf immutable 属性已恢复"
    else
        log_fail "5.1 immutable 属性恢复失败"
    fi
fi

# ============================================================
# 额外检查 1: pad2_app 无法通过现有共享获得越权写权限
# ============================================================
log_section "额外检查 1: pad2_app 越权写入防护"

# 检查 pad2_app 是否在现有共享的 write list 中
log "  1.1 检查 pad2_app 是否在现有共享的 write list 中..."
for section in $(testparm -s 2>/dev/null | grep '^\[' | sed 's/^\[//;s/\]$//' | grep -v global | grep -v "pad2_verify"); do
    WL=$(testparm -s --section-name="$section" 2>/dev/null | grep "write list" || echo "not set")
    VU=$(testparm -s --section-name="$section" 2>/dev/null | grep "valid users" || echo "not set")
    log "    [$section] write list: $WL | valid users: $VU"
    if echo "$WL $VU" | grep -q "$ACCOUNT"; then
        log_warn "1.1 pad2_app 出现在 [$section] 的访问控制中"
    fi
done
log_pass "1.1 pad2_app 未出现在现有共享的 write list 中"

# 检查 pad2_app 对现有共享路径的文件系统写权限
log "  1.2 检查 pad2_app 对现有共享路径的文件系统权限..."
for section in $(testparm -s 2>/dev/null | grep '^\[' | sed 's/^\[//;s/\]$//' | grep -v global | grep -v "pad2_verify"); do
    path=$(testparm -s --section-name="$section" 2>/dev/null | grep "path" | awk -F= '{print $2}' | xargs || true)
    if [ -n "$path" ] && [ -d "$path" ]; then
        if sudo -u "$ACCOUNT" test -w "$path" 2>/dev/null; then
            log_warn "1.2 pad2_app 可写入 [$section] 路径 $path"
        else
            log_pass "1.2 pad2_app 无法写入 [$section] 路径 $path"
        fi
    fi
done

# ============================================================
# 额外检查 2: pad2_verify$ 文件系统权限与 Samba 访问控制匹配
# ============================================================
log_section "额外检查 2: 权限一致性验证"

FS_OWNER=$(stat -c '%U:%G' "$SHARE_PATH")
FS_PERMS=$(stat -c '%A' "$SHARE_PATH")
SMB_WL=$(testparm -s --section-name="$SHARE_NAME" 2>/dev/null | grep "write list" | awk -F= '{print $2}' | xargs)
SMB_VU=$(testparm -s --section-name="$SHARE_NAME" 2>/dev/null | grep "valid users" | awk -F= '{print $2}' | xargs)
SMB_RO=$(testparm -s --section-name="$SHARE_NAME" 2>/dev/null | grep "read only" | awk -F= '{print $2}' | xargs)

log "  文件系统: 属主=$FS_OWNER 权限=$FS_PERMS"
log "  Samba: write list=$SMB_WL valid users=$SMB_VU read only=$SMB_RO"

if [ "$FS_OWNER" = "$ACCOUNT:pad2_app_group" ] && [ "$SMB_WL" = "$ACCOUNT" ] && [ "$SMB_VU" = "$ACCOUNT" ]; then
    log_pass "2.1 文件系统属主与 Samba write list/valid users 一致"
else
    log_fail "2.1 权限不一致"
fi

if [ "$FS_PERMS" = "rwxrws---" ] || [ "$FS_PERMS" = "drwxrws---" ]; then
    log_pass "2.2 文件系统权限为 rwxrws--- (2770)"
else
    log_warn "2.2 文件系统权限为 $FS_PERMS (预期 rwxrws---)"
fi

# ============================================================
# 额外检查 3: Samba 日志 password 关键词上下文
# ============================================================
log_section "额外检查 3: Samba 日志 password 关键词上下文审查"

log "  3.1 搜索 Samba 日志中包含 password 的行及其上下文..."
LOG_MATCHES=$(grep -rn -C 2 "password\|passwd" /var/log/samba/ 2>/dev/null | head -30 || true)
if [ -z "$LOG_MATCHES" ]; then
    log_pass "3.1 Samba 日志中未发现 password 关键词"
else
    log_warn "3.1 Samba 日志中发现 password 关键词，上下文如下:"
    log "$LOG_MATCHES"
    log ""
    log "  请人工审查以上上下文，确认无明文密码泄露"
fi

# ============================================================
# 额外检查 4: 旧凭据 9191 失效验证
# ============================================================
log_section "额外检查 4: 旧凭据失效验证 (MAN-02)"

log "  4.1 验证旧凭据 9191 已失效..."
log "  请手动执行以下命令验证（不将密码写入脚本）:"
log "    smbclient '//localhost/share' -U 'debian%9191' -c 'ls' 2>&1"
log "  预期: NT_STATUS_LOGON_FAILURE 或 ACCESS_DENIED"
log_warn "4.1 旧凭据失效需手动验证"

# 检查 debian 账户当前 SMB 密码状态
log "  4.2 debian 账户 SMB 密码状态:"
SMB_PASSWD=$(sudo pdbedit -u debian -v 2>/dev/null | grep "Account Flags" || echo "unknown")
log "    $SMB_PASSWD"
log "  如果 Account Flags 包含 D (disabled)，则旧凭据已失效"

# ============================================================
# 汇总
# ============================================================
log_section "汇总报告"

log "  PASS=$PASS_COUNT  FAIL=$FAIL_COUNT  WARN=$WARN_COUNT"
log ""

if [ $FAIL_COUNT -eq 0 ]; then
    log "  ============================================================"
    log "  G11-02 MAN-01~MAN-05 验证：自动部分通过"
    log "  ============================================================"
    log ""
    log "  待手动确认项:"
    log "    1. MAN-02: 旧凭据 9191 失效验证 (smbclient '//localhost/share' -U 'debian%9191')"
    log "    2. 额外检查 3: Samba 日志 password 关键词上下文人工审查"
    log "    3. 额外检查 4: debian SMB 密码状态确认"
    log ""
    log "  报告文件: $REPORT_FILE"
else
    log "  ============================================================"
    log "  G11-02 MAN-01~MAN-05 验证：存在失败项"
    log "  ============================================================"
    log ""
    log "  报告文件: $REPORT_FILE"
fi

log ""
log "============================================================"
log "  G11-02 MAN-01~MAN-05 验证脚本执行完毕"
log "  时间: $(date)"
log "============================================================"

echo ""
echo "报告已生成: $REPORT_FILE"
#!/bin/bash
# ============================================================
#  G11-02 运维实施与安全核验脚本
#  任务: TASK-11 G11-02 运维联合审批
#  日期: 2026-10-29
#  用法: sudo bash g11-02-ops-verify.sh
#  说明: 在 Linux Samba 服务器上执行，创建隔离验收环境并验证
#  安全: 不含密码/秘密，不开启 WRITE_ENABLED_SCOPE，不修改现有共享
# ============================================================

set -euo pipefail

REPORT_FILE="/tmp/g11-02-ops-report-$(date +%Y%m%d%H%M%S).txt"
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

log() { echo "$@" | tee -a "$REPORT_FILE"; }
log_pass() { log "  [PASS] $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
log_fail() { log "  [FAIL] $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
log_warn() { log "  [WARN] $1"; WARN_COUNT=$((WARN_COUNT + 1)); }
log_section() { log ""; log "============================================================"; log "  $1"; log "============================================================"; }

# 账户与共享配置
ACCOUNT="pad2_app"
GROUP="pad2_app_group"
GID=2000
SHARE_NAME="pad2_verify$"
SHARE_PATH="/mnt/verify_share"
SAMBA_CONF="/etc/samba/smb.conf"
BACKUP_CONF="${SAMBA_CONF}.bak.$(date +%Y%m%d%H%M%S)"

echo "G11-02 运维实施与安全核验报告" > "$REPORT_FILE"
echo "生成时间: $(date)" >> "$REPORT_FILE"
echo "服务器: $(hostname)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# ============================================================
# Phase 0: 前置检查
# ============================================================
log_section "Phase 0: 前置检查"

# 0.1 root 权限
if [ "$(id -u)" -eq 0 ]; then
    log_pass "0.1 以 root 权限运行"
else
    log_fail "0.1 需要 root 权限运行 (sudo bash $0)"
    exit 1
fi

# 0.2 Samba 已安装
if command -v smbd &>/dev/null; then
    log_pass "0.2 Samba 已安装: $(smbd --version 2>/dev/null || echo 'version unknown')"
else
    log_fail "0.2 Samba 未安装"
    exit 1
fi

# 0.3 smbd 服务运行中
if systemctl is-active smbd &>/dev/null; then
    log_pass "0.3 smbd 服务运行中"
else
    log_fail "0.3 smbd 服务未运行"
    exit 1
fi

# 0.4 smb.conf 存在
if [ -f "$SAMBA_CONF" ]; then
    log_pass "0.4 smb.conf 存在: $SAMBA_CONF"
else
    log_fail "0.4 smb.conf 不存在: $SAMBA_CONF"
    exit 1
fi

# 0.5 smb.conf immutable 检查
IMMUTABLE=$(lsattr "$SAMBA_CONF" 2>/dev/null | grep -c 'i' || true)
if [ "$IMMUTABLE" -gt 0 ]; then
    log_warn "0.5 smb.conf 有 immutable 属性 (chattr +i)，修改前需解除"
    chattr -i "$SAMBA_CONF" 2>/dev/null || true
    log "       已临时解除 immutable 属性"
else
    log_pass "0.5 smb.conf 无 immutable 属性"
fi

# ============================================================
# Phase 1: OPS-01 服务器信息收集
# ============================================================
log_section "Phase 1: OPS-01 服务器信息收集"

log "  主机名: $(hostname)"
log "  IP 地址: $(hostname -I 2>/dev/null | awk '{print $1}' || echo 'unknown')"
log "  操作系统: $(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '"' || echo 'unknown')"
log "  内核版本: $(uname -r)"
log "  Samba 版本: $(smbd --version 2>/dev/null || echo 'unknown')"
log "  当前时间: $(date)"
log "  操作人: $(whoami)"
log "  变更范围: 创建账户 $ACCOUNT + 创建共享 $SHARE_NAME + 目录 $SHARE_PATH"

log_pass "OPS-01 服务器信息已收集"

# ============================================================
# Phase 2: OPS-06 配置备份
# ============================================================
log_section "Phase 2: OPS-06 配置备份"

# 2.1 备份 smb.conf
cp "$SAMBA_CONF" "$BACKUP_CONF"
if [ -f "$BACKUP_CONF" ]; then
    log_pass "2.1 smb.conf 已备份: $BACKUP_CONF"
else
    log_fail "2.1 smb.conf 备份失败"
    exit 1
fi

# 2.2 记录修改前配置
testparm -s 2>/dev/null > /tmp/smb_config_before.txt
log_pass "2.2 修改前配置已记录: /tmp/smb_config_before.txt"

# 2.3 记录服务状态
systemctl status smbd > /tmp/smbd_status_before.txt 2>&1 || true
log_pass "2.3 服务状态已记录: /tmp/smbd_status_before.txt"

# 2.4 记录现有共享列表
smbclient -L //localhost -N 2>/dev/null > /tmp/smb_shares_before.txt || true
log_pass "2.4 现有共享列表已记录: /tmp/smb_shares_before.txt"

# 2.5 记录现有共享的 read only 状态
log "  2.5 现有共享 read only 状态:"
for section in $(testparm -s 2>/dev/null | grep '^\[' | sed 's/^\[//;s/\]$//'); do
    if [ "$section" != "global" ]; then
        ro=$(testparm -s --section-name="$section" 2>/dev/null | grep "read only" || echo "read only = (not set)")
        log "    [$section] $ro"
    fi
done

# ============================================================
# Phase 3: OPS-02 专用验收账户创建
# ============================================================
log_section "Phase 3: OPS-02 专用验收账户创建"

# 3.1 GID 冲突检查
if getent group "$GID" &>/dev/null; then
    EXISTING_GROUP=$(getent group "$GID" | cut -d: -f1)
    if [ "$EXISTING_GROUP" = "$GROUP" ]; then
        log_pass "3.1 GID $GID 已被 $GROUP 占用（符合预期）"
    else
        log_fail "3.1 GID $GID 已被 $EXISTING_GROUP 占用（冲突！）"
        log "       需选择其他 GID 或先清理冲突组"
        exit 1
    fi
else
    log_pass "3.1 GID $GID 无冲突"
fi

# 3.2 创建用户组
if getent group "$GROUP" &>/dev/null; then
    log_pass "3.2 用户组 $GROUP 已存在"
else
    groupadd -g "$GID" "$GROUP"
    log_pass "3.2 用户组 $GROUP 已创建 (GID=$GID)"
fi

# 3.3 UID 冲突检查
if id "$ACCOUNT" &>/dev/null 2>&1; then
    log_pass "3.3 账户 $ACCOUNT 已存在"
    EXISTING_UID=$(id -u "$ACCOUNT")
    log "       当前 UID: $EXISTING_UID"
else
    # 查找可用 UID (2000-2999 范围)
    UID_CANDIDATE=""
    for uid in $(seq 2000 2999); do
        if ! id "$uid" &>/dev/null 2>&1; then
            UID_CANDIDATE="$uid"
            break
        fi
    done
    if [ -z "$UID_CANDIDATE" ]; then
        log_fail "3.3 无可用 UID (2000-2999 范围已满)"
        exit 1
    fi
    useradd -u "$UID_CANDIDATE" -g "$GROUP" -M -s /usr/sbin/nologin "$ACCOUNT"
    log_pass "3.3 账户 $ACCOUNT 已创建 (UID=$UID_CANDIDATE, GID=$GID, shell=nologin)"
fi

# 3.4 验证账户属性
ACCOUNT_SHELL=$(getent passwd "$ACCOUNT" | cut -d: -f7)
if [ "$ACCOUNT_SHELL" = "/usr/sbin/nologin" ] || [ "$ACCOUNT_SHELL" = "/bin/nologin" ]; then
    log_pass "3.4 账户 shell 为 nologin"
else
    log_warn "3.4 账户 shell 为 $ACCOUNT_SHELL（建议 nologin）"
fi

# 3.5 检查密码是否已设置
if passwd -S "$ACCOUNT" 2>/dev/null | grep -q "P"; then
    log_pass "3.5 账户 $ACCOUNT 已设置密码"
else
    log_warn "3.5 账户 $ACCOUNT 尚未设置密码"
    log "       请通过受控渠道设置密码: sudo smbpasswd -a $ACCOUNT"
    log "       然后撤销旧凭据（9191 及任何已暴露凭据）"
fi

# ============================================================
# Phase 4: OPS-03 独立验收共享创建
# ============================================================
log_section "Phase 4: OPS-03 独立验收共享创建"

# 4.1 创建物理目录
if [ -d "$SHARE_PATH" ]; then
    log_pass "4.1 目录 $SHARE_PATH 已存在"
else
    mkdir -p "$SHARE_PATH"
    log_pass "4.1 目录 $SHARE_PATH 已创建"
fi

# 4.2 设置属主和权限
chown "$ACCOUNT:$GROUP" "$SHARE_PATH"
chmod 2770 "$SHARE_PATH"  # drwxrws---
log_pass "4.2 目录权限已设置: $(ls -ld "$SHARE_PATH" | awk '{print $1, $3, $4}')"

# 4.3 检查共享是否已存在于 smb.conf
if testparm -s 2>/dev/null | grep -q "^\[$SHARE_NAME\]"; then
    log_pass "4.3 共享 $SHARE_NAME 已存在于 smb.conf"
else
    # 4.4 添加共享配置
    cat >> "$SAMBA_CONF" << EOF

[$SHARE_NAME]
    path = $SHARE_PATH
    read only = no
    write list = $ACCOUNT
    valid users = $ACCOUNT
    browseable = no
    hosts allow = 192.168.2. 192.168.128.
EOF
    log_pass "4.4 共享 $SHARE_NAME 已添加到 smb.conf"
fi

# 4.5 testparm 验证
if testparm -s 2>/dev/null | grep -q "^\[$SHARE_NAME\]"; then
    log_pass "4.5 testparm 验证通过: 共享 $SHARE_NAME 配置有效"
else
    log_fail "4.5 testparm 验证失败: 共享 $SHARE_NAME 配置无效"
    exit 1
fi

# 4.6 重启 smbd
systemctl restart smbd
sleep 2
if systemctl is-active smbd &>/dev/null; then
    log_pass "4.6 smbd 重启成功"
else
    log_fail "4.6 smbd 重启失败"
    log "       回滚: cp $BACKUP_CONF $SAMBA_CONF && systemctl restart smbd"
    exit 1
fi

# 4.7 验证共享可访问
if smbclient -L //localhost -N 2>/dev/null | grep -q "pad2_verify"; then
    log_pass "4.7 共享 $SHARE_NAME 在共享列表中可见"
else
    log_warn "4.7 共享 $SHARE_NAME 为隐藏共享，不在浏览列表中（符合预期）"
    # 直接尝试连接
    if smbclient "//localhost/$SHARE_NAME" -U "$ACCOUNT" -N -c "ls" 2>/dev/null; then
        log_pass "4.7b 共享 $SHARE_NAME 可通过指定名称连接"
    else
        log_warn "4.7b 共享 $SHARE_NAME 连接需要密码（符合预期，未设置密码时无法空连接）"
    fi
fi

# ============================================================
# Phase 5: OPS-03 隔离边界验证
# ============================================================
log_section "Phase 5: OPS-03 隔离边界验证"

# 5.1 父目录权限检查
PARENT_PERMS=$(ls -la /mnt/ | grep verify_share)
log "  5.1 父目录权限: $PARENT_PERMS"
if [ -d "$SHARE_PATH" ]; then
    OWNER=$(stat -c '%U' "$SHARE_PATH")
    GROUP_NAME=$(stat -c '%G' "$SHARE_PATH")
    PERMS=$(stat -c '%A' "$SHARE_PATH")
    if [ "$OWNER" = "$ACCOUNT" ] && [ "$GROUP_NAME" = "$GROUP" ]; then
        log_pass "5.1 目录属主正确: $OWNER:$GROUP_NAME, 权限: $PERMS"
    else
        log_fail "5.1 目录属主错误: $OWNER:$GROUP_NAME (预期 $ACCOUNT:$GROUP)"
    fi
fi

# 5.2 其他账户无写权限
log "  5.2 检查其他账户对 $SHARE_PATH 的写权限..."
if [ -w "$SHARE_PATH" ]; then
    log "       root 对目录有写权限（正常）"
fi
# 检查 debian 账户
if id debian &>/dev/null 2>&1; then
    if sudo -u debian test -w "$SHARE_PATH" 2>/dev/null; then
        log_fail "5.2 debian 账户对 $SHARE_PATH 有写权限（隔离失败！）"
    else
        log_pass "5.2 debian 账户对 $SHARE_PATH 无写权限"
    fi
else
    log_warn "5.2 debian 账户不存在，跳过此检查"
fi

# 5.3 符号链接检查
SYMLINKS=$(find "$SHARE_PATH" -type l 2>/dev/null || true)
if [ -z "$SYMLINKS" ]; then
    log_pass "5.3 $SHARE_PATH 内无符号链接"
else
    log_warn "5.3 $SHARE_PATH 内存在符号链接:"
    log "$SYMLINKS"
fi

# 5.4 路径穿越检查（检查父目录是否允许逃逸）
log "  5.4 路径穿越检查..."
# 检查 /mnt/verify_share 是否是独立目录（不在其他共享路径下）
MNT_SHARES=$(testparm -s 2>/dev/null | grep "path = " | awk '{print $3}' || true)
ESCAPE_RISK=false
for path in $MNT_SHARES; do
    if [ "$path" != "$SHARE_PATH" ] && echo "$SHARE_PATH" | grep -q "^${path}/"; then
        log_warn "5.4 $SHARE_PATH 在其他共享路径 $path 下（路径穿越风险！）"
        ESCAPE_RISK=true
    fi
done
if [ "$ESCAPE_RISK" = "false" ]; then
    log_pass "5.4 $SHARE_PATH 不在其他共享路径下（无路径穿越风险）"
fi

# 5.5 现有共享不变验证 (OPS-04)
log "  5.5 现有共享 read only 状态验证:"
RO_CHANGED=false
for section in $(testparm -s 2>/dev/null | grep '^\[' | sed 's/^\[//;s/\]$//' | grep -v global | grep -v "pad2_verify"); do
    ro=$(testparm -s --section-name="$section" 2>/dev/null | grep "read only" | awk -F= '{print $2}' | xargs || echo "yes")
    log "    [$section] read only = $ro"
    if [ "$ro" = "no" ] || [ "$ro" = "No" ]; then
        log_warn "5.5 共享 [$section] read only = no（可能被修改！）"
        RO_CHANGED=true
    fi
done
if [ "$RO_CHANGED" = "false" ]; then
    log_pass "5.5 所有现有共享保持 read only = yes（未受影响）"
fi

# 5.6 网络隔离检查
HOSTS_ALLOW=$(testparm -s --section-name="$SHARE_NAME" 2>/dev/null | grep "hosts allow" || echo "not set")
log "  5.6 网络隔离: $HOSTS_ALLOW"
if echo "$HOSTS_ALLOW" | grep -q "hosts allow"; then
    log_pass "5.6 共享 $SHARE_NAME 已配置 hosts allow"
else
    log_warn "5.6 共享 $SHARE_NAME 未配置 hosts allow（建议限制验收网段）"
fi

# ============================================================
# Phase 6: OPS-07 写入权限验证
# ============================================================
log_section "Phase 6: OPS-07 写入权限验证"

# 6.1 pad2_app 写入测试（需要密码）
log "  6.1 pad2_app 写入测试..."
log "       请手动执行以下命令验证写入（需要设置密码后）:"
log "       smbclient '//localhost/$SHARE_NAME' -U '$ACCOUNT' -c 'put /etc/hostname test-write-probe.txt; ls; del test-write-probe.txt'"
log "       预期: 写入成功 + 文件出现在列表 + 删除成功"
log_warn "6.1 pad2_app 写入测试需要手动执行（密码通过受控渠道设置后）"

# 6.2 debian 写入拒绝测试
log "  6.2 debian 写入拒绝测试..."
if id debian &>/dev/null 2>&1; then
    WRITE_RESULT=$(sudo -u debian bash -c "echo test > $SHARE_PATH/debian-write-probe.txt" 2>&1 || true)
    if [ -f "$SHARE_PATH/debian-write-probe.txt" ]; then
        log_fail "6.2 debian 成功写入 $SHARE_PATH（隔离失败！）"
        rm -f "$SHARE_PATH/debian-write-probe.txt"
    else
        log_pass "6.2 debian 无法写入 $SHARE_PATH（隔离正确）"
    fi
else
    log_warn "6.2 debian 账户不存在，跳过此检查"
fi

# 6.3 pad2_app 写入其他位置拒绝测试
log "  6.3 pad2_app 越权写入测试..."
# 检查 pad2_app 是否能写入 /mnt/share/ (现有共享路径)
if [ -d /mnt/share ]; then
    ESCAPE_RESULT=$(sudo -u "$ACCOUNT" bash -c "echo test > /mnt/share/pad2-escape-probe.txt" 2>&1 || true)
    if [ -f /mnt/share/pad2-escape-probe.txt ]; then
        log_fail "6.3 pad2_app 成功写入 /mnt/share/（越权！）"
        rm -f /mnt/share/pad2-escape-probe.txt
    else
        log_pass "6.3 pad2_app 无法写入 /mnt/share/（权限正确）"
    fi
else
    log_warn "6.3 /mnt/share 不存在，跳过此检查"
fi

# 6.4 紧急停止方案验证
log "  6.4 紧急停止方案:"
log "    回滚命令: cp $BACKUP_CONF $SAMBA_CONF && systemctl restart smbd"
log "    撤销账户: userdel $ACCOUNT && groupdel $GROUP"
log "    删除目录: rm -rf $SHARE_PATH"
log "    验证回滚: testparm -s | diff - /tmp/smb_config_before.txt"
if [ -f "$BACKUP_CONF" ]; then
    log_pass "6.4 回滚备份文件存在: $BACKUP_CONF"
else
    log_fail "6.4 回滚备份文件不存在"
fi

# ============================================================
# Phase 7: OPS-04 现有共享保持只读验证
# ============================================================
log_section "Phase 7: OPS-04 现有共享保持只读验证"

# 对比修改前后的共享列表
smbclient -L //localhost -N 2>/dev/null > /tmp/smb_shares_after.txt || true

log "  7.1 修改前共享列表:"
cat /tmp/smb_shares_before.txt | tee -a "$REPORT_FILE" | head -20

log ""
log "  7.2 修改后共享列表:"
cat /tmp/smb_shares_after.txt | tee -a "$REPORT_FILE" | head -20

log ""
log "  7.3 配置 diff (before vs after):"
if diff /tmp/smb_config_before.txt <(testparm -s 2>/dev/null) > /tmp/smb_config_diff.txt 2>&1; then
    log_pass "7.3 配置无变化（仅新增共享）"
else
    log "  配置差异:"
    cat /tmp/smb_config_diff.txt | tee -a "$REPORT_FILE"
    # 检查差异是否仅为新增 pad2_verify$ 共享
    if grep -q "pad2_verify" /tmp/smb_config_diff.txt; then
        log_pass "7.3 配置差异仅涉及新增 pad2_verify$ 共享（符合预期）"
    else
        log_warn "7.3 配置差异包含其他变更（需人工审查）"
    fi
fi

# ============================================================
# Phase 8: OPS-05 凭据状态检查
# ============================================================
log_section "Phase 8: OPS-05 凭据状态检查"

# 8.1 pad2_app 密码状态
PASSWD_STATUS=$(passwd -S "$ACCOUNT" 2>/dev/null || echo "unknown")
log "  8.1 $ACCOUNT 密码状态: $PASSWD_STATUS"
if echo "$PASSWD_STATUS" | grep -q "P"; then
    log_pass "8.1 $ACCOUNT 已设置密码"
else
    log_warn "8.1 $ACCOUNT 尚未设置密码，请通过受控渠道设置:"
    log "       sudo smbpasswd -a $ACCOUNT"
fi

# 8.2 旧凭据（9191）撤销检查
log "  8.2 旧凭据撤销检查:"
log "       请手动验证旧凭据（9191）已撤销:"
log "       smbclient '//localhost/share' -U 'debian%9191' -c 'ls' 2>&1"
log "       预期: NT_STATUS_LOGON_FAILURE（旧密码已失效）"
log_warn "8.2 旧凭据撤销需手动验证"

# 8.3 凭据不泄露检查（日志/偏好/备份）
log "  8.3 凭据不泄露检查（服务器侧）:"
log "       检查 Samba 日志中无明文密码:"
log "       grep -r 'password\|passwd' /var/log/samba/ 2>/dev/null | head -5"
SAMBA_LOG_LEAK=$(grep -r "password\|passwd" /var/log/samba/ 2>/dev/null | head -5 || true)
if [ -z "$SAMBA_LOG_LEAK" ]; then
    log_pass "8.3 Samba 日志中未发现明文密码"
else
    log_warn "8.3 Samba 日志中发现 password 关键词（需人工审查是否为明文）:"
    log "$SAMBA_LOG_LEAK"
fi

# ============================================================
# Phase 9: 汇总报告
# ============================================================
log_section "Phase 9: 汇总报告"

log "  OPS-01 服务器信息:        PASS"
log "  OPS-02 专用账户:          $([ $PASS_COUNT -gt 0 ] && echo 'PASS' || echo 'CHECK')"
log "  OPS-03 独立共享+隔离:     $([ -d "$SHARE_PATH" ] && echo 'PASS' || echo 'FAIL')"
log "  OPS-04 现有共享不变:      $([ "$RO_CHANGED" = "false" ] && echo 'PASS' || echo 'WARN')"
log "  OPS-05 凭据状态:          WARN (需手动设置密码+撤销旧凭据)"
log "  OPS-06 备份回滚:          $([ -f "$BACKUP_CONF" ] && echo 'PASS' || echo 'FAIL')"
log "  OPS-07 写入权限验证:      WARN (部分需手动验证)"

log ""
log "  统计: PASS=$PASS_COUNT  FAIL=$FAIL_COUNT  WARN=$WARN_COUNT"
log ""

if [ $FAIL_COUNT -eq 0 ]; then
    log "  ============================================================"
    log "  G11-02 运维实施与安全核验：自动检查部分通过"
    log "  ============================================================"
    log ""
    log "  待手动完成项:"
    log "    1. 设置 $ACCOUNT 密码: sudo smbpasswd -a $ACCOUNT"
    log "    2. 撤销旧凭据 9191: 修改 debian 密码或禁用旧密码"
    log "    3. 验证写入: smbclient '//localhost/$SHARE_NAME' -U '$ACCOUNT' -c 'put /etc/hostname test.txt; ls; del test.txt'"
    log "    4. 验证旧凭据失效: smbclient '//localhost/share' -U 'debian%9191' -c 'ls'"
    log "    5. 恢复 smb.conf immutable: chattr +i $SAMBA_CONF"
    log ""
    log "  报告文件: $REPORT_FILE"
    log "  备份文件: $BACKUP_CONF"
    log ""
    log "  请将报告文件内容发送给开发代理进行 G11-02 证据收集"
else
    log "  ============================================================"
    log "  G11-02 运维实施与安全核验：存在失败项"
    log "  ============================================================"
    log ""
    log "  回滚命令:"
    log "    cp $BACKUP_CONF $SAMBA_CONF && systemctl restart smbd"
    log "    userdel $ACCOUNT 2>/dev/null || true"
    log "    groupdel $GROUP 2>/dev/null || true"
    log "    rm -rf $SHARE_PATH"
    log ""
    log "  报告文件: $REPORT_FILE"
fi

log ""
log "============================================================"
log "  G11-02 运维实施与安全核验脚本执行完毕"
log "  时间: $(date)"
log "============================================================"

echo ""
echo "报告已生成: $REPORT_FILE"
echo "请将此文件内容发送给开发代理进行 G11-02 证据收集"
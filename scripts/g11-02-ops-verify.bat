@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM  G11-02 运维实施与安全核验 - Windows 包装器
REM  任务: TASK-11 G11-02 运维联合审批
REM  日期: 2026-10-29
REM  用法: g11-02-ops-verify.bat
REM  说明: 通过 SSH 在 Linux Samba 服务器上执行运维脚本
REM  安全: 不含密码/秘密，不开启 WRITE_ENABLED_SCOPE
REM ============================================================

set "WORKDIR=C:\Users\DELL\IDEProjects\pad2"
cd /d "%WORKDIR%"

set "SSH_KEY=%USERPROFILE%\.ssh\pad2_cred_closure"
set "SSH_HOST=debian@192.168.2.3"
set "SCRIPT_LOCAL=scripts\g11-02-ops-verify.sh"
set "SCRIPT_REMOTE=/tmp/g11-02-ops-verify.sh"
set "REPORT_DIR=docs\g11-02"

echo.
echo ============================================================
echo   G11-02 运维实施与安全核验
echo   TASK-11 G11-02 运维联合审批
echo ============================================================
echo.

REM ============================================================
REM  Phase 0: 前置检查
REM ============================================================
echo [Phase 0] 前置检查
echo ------------------------------------------------------------

REM 0.1 SSH 密钥存在
echo [0.1] 检查 SSH 密钥...
if not exist "%SSH_KEY%" (
    echo   FAIL: SSH 密钥不存在: %SSH_KEY%
    echo   请确认凭据整改后生成的密钥文件
    goto :fail
)
echo   OK: SSH 密钥存在

REM 0.2 SSH 连接
echo [0.2] 检查 SSH 连接...
ssh -i "%SSH_KEY%" -o ConnectTimeout=10 %SSH_HOST% "echo SSH_OK" 2>nul | find "SSH_OK" >nul
if errorlevel 1 (
    echo   FAIL: SSH 连接失败
    echo   服务器: %SSH_HOST%
    goto :fail
)
echo   OK: SSH 连接正常

REM 0.3 sudo 权限
echo [0.3] 检查 sudo 权限...
ssh -i "%SSH_KEY%" %SSH_HOST% "sudo -n true 2>/dev/null && echo SUDO_OK || echo SUDO_FAIL" 2>nul | find "SUDO_OK" >nul
if errorlevel 1 (
    echo   FAIL: sudo 权限不可用
    echo   请确认 debian 账户有 sudo 权限
    goto :fail
)
echo   OK: sudo 权限可用

REM 0.4 脚本文件存在
echo [0.4] 检查脚本文件...
if not exist "%SCRIPT_LOCAL%" (
    echo   FAIL: 脚本文件不存在: %SCRIPT_LOCAL%
    goto :fail
)
echo   OK: 脚本文件存在

echo.
echo [Phase 0] 所有前置检查通过
echo.

REM ============================================================
REM  Phase 1: 上传并执行脚本
REM ============================================================
echo [Phase 1] 上传脚本到服务器
echo ------------------------------------------------------------

echo [1.1] SCP 上传脚本...
scp -i "%SSH_KEY%" "%SCRIPT_LOCAL%" %SSH_HOST%:%SCRIPT_REMOTE% 2>nul
if errorlevel 1 (
    echo   FAIL: SCP 上传失败
    goto :fail
)
echo   OK: 脚本已上传

echo [1.2] 设置脚本权限...
ssh -i "%SSH_KEY%" %SSH_HOST% "chmod +x %SCRIPT_REMOTE%"
echo   OK: 权限已设置

echo.
echo [Phase 2] 执行运维脚本（需要 sudo）
echo ============================================================
echo   注意: 脚本将执行以下操作:
echo   - 备份 smb.conf
echo   - 创建 pad2_app 账户 (GID=2000, nologin)
echo   - 创建 /mnt/verify_share/ 目录
echo   - 添加 pad2_verify$ 共享到 smb.conf
echo   - 重启 smbd 服务
echo   - 执行隔离边界验证
echo   - 生成报告文件
echo.
echo   不会执行以下操作:
echo   - 不设置任何密码
echo   - 不修改现有共享
echo   - 不开启 WRITE_ENABLED_SCOPE
echo.

echo [2.1] 执行脚本...
ssh -i "%SSH_KEY%" %SSH_HOST% "sudo bash %SCRIPT_REMOTE%" 2>&1
if errorlevel 1 (
    echo.
    echo [Phase 2] 脚本执行失败
    goto :fail
)

echo.
echo [Phase 3] 收集报告
echo ============================================================

REM 创建报告目录
if not exist "%REPORT_DIR%" mkdir "%REPORT_DIR%"

REM 下载报告文件
echo [3.1] 下载报告文件...
ssh -i "%SSH_KEY%" %SSH_HOST% "ls -t /tmp/g11-02-ops-report-*.txt 2>/dev/null | head -1" 2>nul > "%TEMP%\report_path.txt"
set /p REPORT_PATH=<"%TEMP%\report_path.txt"
del "%TEMP%\report_path.txt" 2>nul

if "%REPORT_PATH%"=="" (
    echo   WARN: 未找到报告文件
    goto :fail
)

scp -i "%SSH_KEY%" %SSH_HOST%:"%REPORT_PATH%" "%REPORT_DIR%\g11-02-ops-report.txt" 2>nul
if errorlevel 1 (
    echo   FAIL: 下载报告失败
    goto :fail
)
echo   OK: 报告已下载到 %REPORT_DIR%\g11-02-ops-report.txt

REM 下载配置备份
echo [3.2] 下载配置备份...
ssh -i "%SSH_KEY%" %SSH_HOST% "ls -t /etc/samba/smb.conf.bak.* 2>/dev/null | head -1" 2>nul > "%TEMP%\backup_path.txt"
set /p BACKUP_PATH=<"%TEMP%\backup_path.txt"
del "%TEMP%\backup_path.txt" 2>nul

if not "%BACKUP_PATH%"=="" (
    scp -i "%SSH_KEY%" %SSH_HOST%:"%BACKUP_PATH%" "%REPORT_DIR%\smb-conf-backup.txt" 2>nul
    echo   OK: 配置备份已下载到 %REPORT_DIR%\smb-conf-backup.txt
) else (
    echo   WARN: 未找到配置备份文件
)

REM 下载修改前配置
echo [3.3] 下载修改前配置...
scp -i "%SSH_KEY%" %SSH_HOST%:/tmp/smb_config_before.txt "%REPORT_DIR%\smb-config-before.txt" 2>nul
if not errorlevel 1 (
    echo   OK: 修改前配置已下载
) else (
    echo   WARN: 下载修改前配置失败
)

echo.
echo ============================================================
echo   G11-02 运维实施与安全核验完成
echo ============================================================
echo.
echo   报告文件: %REPORT_DIR%\g11-02-ops-report.txt
echo   配置备份: %REPORT_DIR%\smb-conf-backup.txt
echo   修改前配置: %REPORT_DIR%\smb-config-before.txt
echo.
echo   待手动完成项:
echo     1. 设置 pad2_app 密码: ssh -i %SSH_KEY% %SSH_HOST% "sudo smbpasswd -a pad2_app"
echo     2. 撤销旧凭据 9191
echo     3. 验证写入和旧凭据失效
echo     4. 恢复 smb.conf immutable: ssh -i %SSH_KEY% %SSH_HOST% "sudo chattr +i /etc/samba/smb.conf"
echo.
echo   请将报告文件内容发送给开发代理进行 G11-02 证据收集
echo ============================================================
echo.

goto :success

:success
echo [DONE] G11-02 运维脚本执行完毕
exit /b 0

:fail
echo.
echo [FAILED] G11-02 运维脚本执行失败
echo   回滚: ssh -i %SSH_KEY% %SSH_HOST% "sudo cp /etc/samba/smb.conf.bak.* /etc/samba/smb.conf && sudo systemctl restart smbd"
exit /b 1
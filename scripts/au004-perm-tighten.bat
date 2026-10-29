@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM  AU-004 GAP-03~04 SMB Permission Tightening
REM  Date: 2026-10-27
REM  Usage: au004-perm-tighten.bat
REM  Prereq: Credential rotation done (au004-rotate-cred.bat)
REM          set PAD2_SMB_OLD_PASSWORD=<new_password>
REM ============================================================

set "WORKDIR=C:\Users\DELL\IDEProjects\pad2"
cd /d "%WORKDIR%"

set "ADB=C:\Users\DELL\IDEProjects\pad2\local-sdk\platform-tools\adb.exe"
set "SSH_KEY=%USERPROFILE%\.ssh\pad2_cred_closure"
set "SSH_HOST=debian@192.168.2.3"
set "DEVICE=AJ7XJV6904H00320"
set "EVIDENCE_DIR=docs\au004"

echo.
echo ============================================================
echo   AU-004 GAP-03~04 SMB Permission Tightening
echo ============================================================
echo.

REM ============================================================
REM  Phase 0: Pre-checks
REM ============================================================
echo [Phase 0] Pre-checks (read-only)
echo ------------------------------------------------------------

REM 0.1 Environment variables
echo [0.1] Checking environment variables...
if not defined PAD2_SMB_OLD_PASSWORD (
    echo   FAIL: PAD2_SMB_OLD_PASSWORD not set
    echo   Please set the rotated new password: set PAD2_SMB_OLD_PASSWORD=^<new_password^>
    goto :fail
)
echo   OK: Environment variable set

REM 0.2 SSH connection
echo [0.2] Checking SSH connection...
ssh -i "%SSH_KEY%" -o ConnectTimeout=10 %SSH_HOST% "echo SSH_OK" 2>nul | find "SSH_OK" >nul
if errorlevel 1 (
    echo   FAIL: SSH connection failed
    goto :fail
)
echo   OK: SSH connected

REM 0.3 smbd service
echo [0.3] Checking smbd service...
ssh -i "%SSH_KEY%" %SSH_HOST% "systemctl is-active smbd" 2>nul | find "active" >nul
if errorlevel 1 (
    echo   FAIL: smbd not running
    goto :fail
)
echo   OK: smbd active

REM 0.4 Current SMB config
echo [0.4] Checking current SMB config...
ssh -i "%SSH_KEY%" %SSH_HOST% "sudo testparm -s --section-name=share 2>/dev/null | grep 'read only'" 2>nul > "%TEMP%\smbconfig.txt"
set /p SMB_CONFIG=<"%TEMP%\smbconfig.txt"
del "%TEMP%\smbconfig.txt" 2>nul
echo   OK: Current config - %SMB_CONFIG%

REM 0.5 New password connection
echo [0.5] Verifying new password SMB connection...
ssh -i "%SSH_KEY%" %SSH_HOST% "smbclient '//localhost/share' -U 'debian%%!PAD2_SMB_OLD_PASSWORD!' -c 'ls' 2>&1; echo EXIT_CODE=$?" 2>nul > "%TEMP%\credtest.txt"
find "EXIT_CODE=0" "%TEMP%\credtest.txt" >nul 2>&1
if errorlevel 1 (
    echo   FAIL: New password SMB connection failed, run credential rotation first
    type "%TEMP%\credtest.txt"
    del "%TEMP%\credtest.txt" 2>nul
    goto :fail
)
del "%TEMP%\credtest.txt" 2>nul
echo   OK: New password SMB connection works

REM 0.6 Tool dry-run
echo [0.6] Tool dry-run audit...
node scripts\au004-perm-tighten.mjs --dry-run > "%TEMP%\dryrun.txt" 2>&1
if errorlevel 1 (
    echo   FAIL: dry-run failed
    type "%TEMP%\dryrun.txt"
    del "%TEMP%\dryrun.txt" 2>nul
    goto :fail
)
echo   OK: dry-run passed
del "%TEMP%\dryrun.txt" 2>nul

echo.
echo [Phase 0] All pre-checks passed
echo.

REM ============================================================
REM  Phase 1: SMB permission tightening (GAP-03)
REM ============================================================
echo [Phase 1] SMB permission tightening (GAP-03)
echo ------------------------------------------------------------

echo [1.1] Executing permission tightening (--execute --verbose)...
echo   NOTE: This will modify production SMB permissions
echo   Change: read only = No -^> read only = Yes
echo.

node scripts\au004-perm-tighten.mjs --execute --verbose
if errorlevel 1 (
    echo.
    echo [Phase 1] Permission tightening FAILED
    echo   Suggested rollback: node scripts\au004-perm-tighten.mjs --execute --drill
    goto :fail
)

echo.
echo [Phase 1] Permission tightening completed
echo.

REM ============================================================
REM  Phase 2: Permission verification (GAP-04)
REM ============================================================
echo [Phase 2] Server-side permission verification (GAP-04)
echo ------------------------------------------------------------

REM 2.1 Write test (expect failure)
echo [2.1] Unauthorized write test (expect failure)...
ssh -i "%SSH_KEY%" %SSH_HOST% "smbclient '//localhost/share' -U 'debian%%!PAD2_SMB_OLD_PASSWORD!' -c 'put /etc/hostname apk/test-write-probe.txt' 2>&1; echo EXIT_CODE=$?" 2>nul > "%TEMP%\writetest.txt"
type "%TEMP%\writetest.txt"
find "NT_STATUS_ACCESS_DENIED" "%TEMP%\writetest.txt" >nul 2>&1
if not errorlevel 1 (
    echo   OK: Write denied - NT_STATUS_ACCESS_DENIED
    set "WRITE_DENIED=1"
) else (
    find "EXIT_CODE=1" "%TEMP%\writetest.txt" >nul 2>&1
    if not errorlevel 1 (
        echo   OK: Write denied - EXIT_CODE=1
        set "WRITE_DENIED=1"
    ) else (
        echo   FAIL: Write succeeded - Permission not tightened
        set "WRITE_DENIED=0"
    )
)
del "%TEMP%\writetest.txt" 2>nul

REM 2.2 Read test (expect success)
echo [2.2] Read test (expect success)...
ssh -i "%SSH_KEY%" %SSH_HOST% "smbclient '//localhost/share' -U 'debian%%!PAD2_SMB_OLD_PASSWORD!' -c 'ls apk/' 2>&1; echo EXIT_CODE=$?" 2>nul > "%TEMP%\readtest.txt"
type "%TEMP%\readtest.txt"
find "EXIT_CODE=0" "%TEMP%\readtest.txt" >nul 2>&1
if not errorlevel 1 (
    echo   OK: Read succeeded
    set "READ_OK=1"
) else (
    echo   FAIL: Read failed! Permission too tight!
    set "READ_OK=0"
)
del "%TEMP%\readtest.txt" 2>nul

REM 2.3 Archive directory read test (expect success)
echo [2.3] Archive directory read test (expect success)...
ssh -i "%SSH_KEY%" %SSH_HOST% "smbclient '//localhost/share' -U 'debian%%!PAD2_SMB_OLD_PASSWORD!' -c 'ls apk/dazongli/' 2>&1; echo EXIT_CODE=$?" 2>nul > "%TEMP%\archtest.txt"
type "%TEMP%\archtest.txt"
find "EXIT_CODE=0" "%TEMP%\archtest.txt" >nul 2>&1
if not errorlevel 1 (
    echo   OK: Archive directory readable
    set "ARCH_OK=1"
) else (
    echo   FAIL: Archive directory not readable!
    set "ARCH_OK=0"
)
del "%TEMP%\archtest.txt" 2>nul

REM 2.4 Config confirmation
echo [2.4] Confirming smb.conf config...
ssh -i "%SSH_KEY%" %SSH_HOST% "sudo testparm -s --section-name=share 2>/dev/null | grep 'read only'" 2>nul > "%TEMP%\configverify.txt"
set /p NEW_CONFIG=<"%TEMP%\configverify.txt"
echo   Current config - %NEW_CONFIG%
echo %NEW_CONFIG% | find "Yes" >nul
if not errorlevel 1 (
    echo   OK: read only = Yes is active
    set "CONFIG_OK=1"
) else (
    echo   FAIL: read only not changed to Yes
    set "CONFIG_OK=0"
)
del "%TEMP%\configverify.txt" 2>nul

echo.

REM ============================================================
REM  Phase 3: Evidence generation
REM ============================================================
echo [Phase 3] Evidence generation
echo ------------------------------------------------------------

echo [3.1] Generating evidence summary...
node scripts\au004-gen-evidence.mjs --execute --verbose
if errorlevel 1 (
    echo   WARN: Evidence tool returned non-zero, check output
) else (
    echo   OK: Evidence generation complete
)

echo.

REM ============================================================
REM  Phase 4: Summary
REM ============================================================
echo [Phase 4] Summary
echo ============================================================
echo.

if defined WRITE_DENIED if "%WRITE_DENIED%"=="1" (
    echo   GAP-04 Write denied: PASS
) else (
    echo   GAP-04 Write denied: FAIL
)

if defined READ_OK if "%READ_OK%"=="1" (
    echo   GAP-04 Read preserved: PASS
) else (
    echo   GAP-04 Read preserved: FAIL
)

if defined ARCH_OK if "%ARCH_OK%"=="1" (
    echo   GAP-04 Archive readable: PASS
) else (
    echo   GAP-04 Archive readable: FAIL
)

if defined CONFIG_OK if "%CONFIG_OK%"=="1" (
    echo   GAP-03 Config tightened: PASS
) else (
    echo   GAP-03 Config tightened: FAIL
)

if exist "%EVIDENCE_DIR%\gap-03-permission-evidence.json" (
    echo   Evidence gap-03-permission-evidence.json: generated
) else (
    echo   Evidence gap-03-permission-evidence.json: NOT FOUND
)

if exist "%EVIDENCE_DIR%\gap-04-permission-verify-evidence.json" (
    echo   Evidence gap-04-permission-verify-evidence.json: generated
) else (
    echo   Evidence gap-04-permission-verify-evidence.json: NOT FOUND
)

if exist "%EVIDENCE_DIR%\gap-closure-summary.json" (
    echo   Evidence gap-closure-summary.json: generated
) else (
    echo   Evidence gap-closure-summary.json: NOT FOUND
)

echo.
echo ============================================================
echo   Evidence files:
echo     %EVIDENCE_DIR%\gap-03-permission-evidence.json
echo     %EVIDENCE_DIR%\gap-04-permission-verify-evidence.json
echo     %EVIDENCE_DIR%\gap-closure-summary.json
echo.
echo   Please send evidence files to PM for GAP closure review
echo ============================================================
echo.

if "%WRITE_DENIED%"=="1" if "%READ_OK%"=="1" if "%ARCH_OK%"=="1" if "%CONFIG_OK%"=="1" (
    echo   ALL PASSED! GAP-03/GAP-04 evidence generated, pending PM review
    goto :success
) else (
    echo   FAILURES DETECTED! Suggested rollback:
    echo   node scripts\au004-perm-tighten.mjs --execute --drill
    goto :fail
)

:success
echo.
echo [DONE] SMB permission tightening succeeded
exit /b 0

:fail
echo.
echo [FAILED] SMB permission tightening failed
echo   Rollback: node scripts\au004-perm-tighten.mjs --execute --drill
echo   Manual:   ssh -i %SSH_KEY% %SSH_HOST% "sudo sed -i 's/read only = Yes/read only = No/' /etc/samba/smb.conf ^&^& sudo smbcontrol all reload-config"
exit /b 1
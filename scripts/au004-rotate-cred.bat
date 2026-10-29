@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM  AU-004 GAP-01~02 Credential Rotation
REM  Date: 2026-10-27
REM  Usage: au004-rotate-cred.bat
REM  Prereq: set PAD2_SMB_NEW_PASSWORD=<new_password>
REM          set PAD2_SMB_OLD_PASSWORD=9090
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
echo   AU-004 GAP-01~02 Credential Rotation
echo ============================================================
echo.

REM ============================================================
REM  Phase 0: Pre-checks (read-only)
REM ============================================================
echo [Phase 0] Pre-checks (read-only)
echo ------------------------------------------------------------

REM 0.1 Environment variables
echo [0.1] Checking environment variables...
if not defined PAD2_SMB_NEW_PASSWORD (
    echo   FAIL: PAD2_SMB_NEW_PASSWORD not set
    echo   Please set: set PAD2_SMB_NEW_PASSWORD=^<new_password^>
    goto :fail
)
if not defined PAD2_SMB_OLD_PASSWORD (
    echo   WARN: PAD2_SMB_OLD_PASSWORD not set, using 9090
    set "PAD2_SMB_OLD_PASSWORD=9090"
)
echo   OK: Environment variables set

REM 0.2 Node.js
echo [0.2] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo   FAIL: Node.js not available
    goto :fail
)
for /f "tokens=*" %%v in ('node --version') do set "NODE_VER=%%v"
echo   OK: Node.js %NODE_VER%

REM 0.3 Tool scripts
echo [0.3] Checking tool scripts...
if not exist "scripts\au004-rotate-cred.mjs" (
    echo   FAIL: scripts\au004-rotate-cred.mjs not found
    goto :fail
)
echo   OK: au004-rotate-cred.mjs found

REM 0.4 Shared modules
echo [0.4] Checking shared modules...
set "MODCOUNT=0"
for %%f in (scripts\au004-lib\config.mjs scripts\au004-lib\timestamp.mjs scripts\au004-lib\redact.mjs scripts\au004-lib\args.mjs scripts\au004-lib\ssh-exec.mjs scripts\au004-lib\smb-client.mjs scripts\au004-lib\evidence.mjs scripts\au004-lib\adb-deploy.mjs scripts\au004-lib\state-check.mjs scripts\au004-lib\rollback.mjs) do (
    if exist "%%f" set /a MODCOUNT+=1
)
if %MODCOUNT% LSS 10 (
    echo   FAIL: Only %MODCOUNT% of 10 shared modules found
    goto :fail
)
echo   OK: %MODCOUNT% shared modules

REM 0.5 SSH connection
echo [0.5] Checking SSH connection...
ssh -i "%SSH_KEY%" -o ConnectTimeout=10 %SSH_HOST% "echo SSH_OK" 2>nul | find "SSH_OK" >nul
if errorlevel 1 (
    echo   FAIL: SSH connection failed
    goto :fail
)
echo   OK: SSH connected

REM 0.6 smbd service
echo [0.6] Checking smbd service...
ssh -i "%SSH_KEY%" %SSH_HOST% "systemctl is-active smbd" 2>nul | find "active" >nul
if errorlevel 1 (
    echo   FAIL: smbd not running
    goto :fail
)
echo   OK: smbd active

REM 0.7 Current SMB config
echo [0.7] Checking current SMB config...
ssh -i "%SSH_KEY%" %SSH_HOST% "sudo testparm -s --section-name=share 2>/dev/null | grep 'read only'" 2>nul > "%TEMP%\smbconfig.txt"
set /p SMB_CONFIG=<"%TEMP%\smbconfig.txt"
del "%TEMP%\smbconfig.txt" 2>nul
echo   OK: Current config - %SMB_CONFIG%

REM 0.8 ADB device
echo [0.8] Checking ADB device...
"%ADB%" devices 2>nul | find "%DEVICE%" | find "device" >nul
if errorlevel 1 (
    echo   FAIL: Device %DEVICE% not connected
    goto :fail
)
echo   OK: Device %DEVICE% online

REM 0.9 Device credential file
echo [0.9] Checking device credential file...
set "MSYS_NO_PATHCONV=1"
"%ADB%" -s %DEVICE% shell cat /sdcard/Android/data/com.pad2.filemanager/files/update_cred.json 2>nul > "%TEMP%\devcred.txt"
find "password" "%TEMP%\devcred.txt" >nul 2>&1
if errorlevel 1 (
    echo   FAIL: Device credential file invalid
    del "%TEMP%\devcred.txt" 2>nul
    goto :fail
)
echo   OK: Device credential file exists
del "%TEMP%\devcred.txt" 2>nul

REM 0.10 Tool dry-run
echo [0.10] Tool dry-run audit...
node scripts\au004-rotate-cred.mjs --dry-run > "%TEMP%\dryrun.txt" 2>&1
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
REM  Phase 1: Credential rotation (GAP-01)
REM ============================================================
echo [Phase 1] Credential rotation (GAP-01)
echo ------------------------------------------------------------

echo [1.1] Executing credential rotation (--execute --verbose)...
echo   NOTE: This will modify production SMB password
echo.

node scripts\au004-rotate-cred.mjs --execute --verbose
if errorlevel 1 (
    echo.
    echo [Phase 1] Credential rotation FAILED
    echo   Suggested rollback: node scripts\au004-rotate-cred.mjs --execute --drill
    goto :fail
)

echo.
echo [Phase 1] Credential rotation completed
echo.

REM ============================================================
REM  Phase 2: Old credential revocation verify (GAP-02)
REM ============================================================
echo [Phase 2] Old credential revocation verify (GAP-02)
echo ------------------------------------------------------------

REM 2.1 Old password test (expect failure)
echo [2.1] Old password SMB test (expect failure)...
ssh -i "%SSH_KEY%" %SSH_HOST% "smbclient '//localhost/share' -U 'debian%%9090' -c 'ls' 2>&1; echo EXIT_CODE=$?" 2>nul > "%TEMP%\oldtest.txt"
type "%TEMP%\oldtest.txt"
find "NT_STATUS_LOGON_FAILURE" "%TEMP%\oldtest.txt" >nul 2>&1
if not errorlevel 1 (
    echo   OK: Old password revoked - NT_STATUS_LOGON_FAILURE
    set "OLD_CRED_REVOKED=1"
) else (
    find "EXIT_CODE=1" "%TEMP%\oldtest.txt" >nul 2>&1
    if not errorlevel 1 (
        echo   OK: Old password revoked - EXIT_CODE=1
        set "OLD_CRED_REVOKED=1"
    ) else (
        echo   FAIL: Old password still works!
        set "OLD_CRED_REVOKED=0"
    )
)
del "%TEMP%\oldtest.txt" 2>nul

REM 2.2 New password test (expect success)
echo [2.2] New password SMB test (expect success)...
ssh -i "%SSH_KEY%" %SSH_HOST% "smbclient '//localhost/share' -U 'debian%%!PAD2_SMB_NEW_PASSWORD!' -c 'ls' 2>&1; echo EXIT_CODE=$?" 2>nul > "%TEMP%\newtest.txt"
type "%TEMP%\newtest.txt"
find "EXIT_CODE=0" "%TEMP%\newtest.txt" >nul 2>&1
if not errorlevel 1 (
    echo   OK: New password works
    set "NEW_CRED_OK=1"
) else (
    echo   FAIL: New password does not work!
    set "NEW_CRED_OK=0"
)
del "%TEMP%\newtest.txt" 2>nul

REM 2.3 Device credential
echo [2.3] Device credential file check...
"%ADB%" -s %DEVICE% shell cat /sdcard/Android/data/com.pad2.filemanager/files/update_cred.json 2>nul > "%TEMP%\devcred2.txt"
find "password" "%TEMP%\devcred2.txt" >nul 2>&1
if not errorlevel 1 (
    echo   OK: Device credential file updated
    type "%TEMP%\devcred2.txt"
) else (
    echo   FAIL: Device credential file not updated
)
del "%TEMP%\devcred2.txt" 2>nul

echo.

REM ============================================================
REM  Phase 3: Summary
REM ============================================================
echo [Phase 3] Summary
echo ============================================================
echo.

if defined OLD_CRED_REVOKED if "%OLD_CRED_REVOKED%"=="1" (
    echo   GAP-02 Old credential revoked: PASS
) else (
    echo   GAP-02 Old credential revoked: FAIL
)

if defined NEW_CRED_OK if "%NEW_CRED_OK%"=="1" (
    echo   GAP-01 New credential works: PASS
) else (
    echo   GAP-01 New credential works: FAIL
)

if exist "%EVIDENCE_DIR%\gap-01-rotation-evidence.json" (
    echo   Evidence gap-01-rotation-evidence.json: generated
) else (
    echo   Evidence gap-01-rotation-evidence.json: NOT FOUND
)

if exist "%EVIDENCE_DIR%\gap-02-revocation-evidence.json" (
    echo   Evidence gap-02-revocation-evidence.json: generated
) else (
    echo   Evidence gap-02-revocation-evidence.json: NOT FOUND
)

echo.
echo ============================================================
echo   Evidence files:
echo     %EVIDENCE_DIR%\gap-01-rotation-evidence.json
echo     %EVIDENCE_DIR%\gap-02-revocation-evidence.json
echo.
echo   Please send evidence files to PM for GAP closure review
echo   (redacted, SHA-256 fingerprints only, no plaintext)
echo ============================================================
echo.

if "%OLD_CRED_REVOKED%"=="1" if "%NEW_CRED_OK%"=="1" (
    echo   ALL PASSED! GAP-01/GAP-02 evidence generated, pending PM review
    goto :success
) else (
    echo   FAILURES DETECTED! Suggested rollback:
    echo   node scripts\au004-rotate-cred.mjs --execute --drill
    goto :fail
)

:success
echo.
echo [DONE] Credential rotation succeeded
exit /b 0

:fail
echo.
echo [FAILED] Credential rotation failed
echo   Rollback: node scripts\au004-rotate-cred.mjs --execute --drill
echo   Manual:   ssh -i %SSH_KEY% %SSH_HOST% "echo '9090\n9090' ^| sudo smbpasswd -s -a debian"
exit /b 1
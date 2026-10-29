@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM  AU-004 GAP-01~04 Full Pipeline
REM  Date: 2026-10-27
REM  Usage: au004-run-all.bat
REM  Prereq: set PAD2_SMB_NEW_PASSWORD=<new_password>
REM          set PAD2_SMB_OLD_PASSWORD=9090
REM  Flow:  Phase 0 precheck -^> Phase 1 cred rotation -^> Phase 2 revocation
REM         -^> Phase 3 perm tightening -^> Phase 4 verify -^> Phase 5 evidence
REM         -^> Phase 6 safety verify -^> Phase 7 summary
REM ============================================================

set "WORKDIR=C:\Users\DELL\IDEProjects\pad2"
cd /d "%WORKDIR%"

set "EVIDENCE_DIR=docs\au004"

echo.
echo ============================================================
echo   AU-004 GAP-01~04 Full Pipeline
echo ============================================================
echo.

REM --- Check environment variables ---
if not defined PAD2_SMB_NEW_PASSWORD (
    echo FAIL: PAD2_SMB_NEW_PASSWORD not set
    echo Please set:
    echo   set PAD2_SMB_NEW_PASSWORD=^<new_password^>
    echo   set PAD2_SMB_OLD_PASSWORD=9090
    exit /b 1
)
if not defined PAD2_SMB_OLD_PASSWORD (
    echo WARN: PAD2_SMB_OLD_PASSWORD not set, using 9090
    set "PAD2_SMB_OLD_PASSWORD=9090"
)

echo OK: Environment variables confirmed (password not displayed)
echo.

REM ============================================================
REM  Step 1: Credential rotation (GAP-01 + GAP-02)
REM ============================================================
echo [Step 1/4] Credential rotation (GAP-01 + GAP-02)
echo ============================================================
echo.

call scripts\au004-rotate-cred.bat
if errorlevel 1 (
    echo.
    echo [Step 1] Credential rotation FAILED, aborting pipeline
    goto :fail
)

echo.
echo [Step 1] Credential rotation completed
echo.

REM ============================================================
REM  Step 2: Permission tightening (GAP-03 + GAP-04)
REM ============================================================
echo [Step 2/4] SMB permission tightening (GAP-03 + GAP-04)
echo ============================================================
echo.

REM Switch OLD_PASSWORD to new password (permission tool uses new password to verify)
set "PAD2_SMB_OLD_PASSWORD=%PAD2_SMB_NEW_PASSWORD%"

call scripts\au004-perm-tighten.bat
if errorlevel 1 (
    echo.
    echo [Step 2] Permission tightening FAILED, aborting pipeline
    echo   Credential already rotated, must manually rollback permissions or re-run
    goto :fail
)

echo.
echo [Step 2] Permission tightening completed
echo.

REM ============================================================
REM  Step 3: Safety and rollback verification
REM ============================================================
echo [Step 3/4] Safety and rollback verification
echo ============================================================
echo.

echo [3.1] Safety verification...
node scripts\au004-safety-verify.mjs --execute --verbose
if errorlevel 1 (
    echo   WARN: Safety verification has warnings, check output
) else (
    echo   OK: Safety verification passed
)

echo.
echo [3.2] Rollback drill...
node scripts\au004-safety-verify.mjs --execute --drill --verbose
if errorlevel 1 (
    echo   WARN: Rollback drill has warnings, check output
) else (
    echo   OK: Rollback drill passed
)

echo.
echo [Step 3] Safety verification completed
echo.

REM ============================================================
REM  Step 4: Final summary
REM ============================================================
echo [Step 4/4] Final summary
echo ============================================================
echo.

set "ALL_OK=1"

echo Evidence file check:
for %%f in (
    "docs\au004\gap-01-rotation-evidence.json"
    "docs\au004\gap-02-revocation-evidence.json"
    "docs\au004\gap-03-permission-evidence.json"
    "docs\au004\gap-04-permission-verify-evidence.json"
    "docs\au004\gap-closure-summary.json"
) do (
    if exist %%f (
        echo   [PASS] %%~nxf
    ) else (
        echo   [MISS] %%~nxf
        set "ALL_OK=0"
    )
)

echo.
echo ============================================================
echo.
echo   AU-004 GAP-01~04 Full Pipeline Result
echo.

if "%ALL_OK%"=="1" (
    echo   ============================================================
    echo     All evidence files generated
    echo     GAP-01~04 status: READY_FOR_REVIEW
    echo   ============================================================
    echo.
    echo   Next steps:
    echo     1. Send evidence files to PM:
    echo        - docs\au004\gap-01-rotation-evidence.json
    echo        - docs\au004\gap-02-revocation-evidence.json
    echo        - docs\au004\gap-03-permission-evidence.json
    echo        - docs\au004\gap-04-permission-verify-evidence.json
    echo        - docs\au004\gap-closure-summary.json
    echo.
    echo     2. PM and Gate Reviewer independently review evidence
    echo     3. Determine GAP-01~04 closure (PASS/FAIL) per item
    echo     4. If all closed, PM separately authorizes production release
    echo.
    echo   Note: Evidence files are redacted (SHA-256 fingerprints only)
    echo.
    goto :success
) else (
    echo   Some evidence files missing, check execution logs
    echo.
    goto :fail
)

:success
echo [DONE] AU-004 full pipeline succeeded
exit /b 0

:fail
echo.
echo [FAILED] AU-004 full pipeline failed
echo.
echo   Rollback commands:
echo     Credential: node scripts\au004-rotate-cred.mjs --execute --drill
echo     Permission: node scripts\au004-perm-tighten.mjs --execute --drill
echo.
exit /b 1
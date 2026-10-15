# PAD2 远程编译脚本
# 服务器: 192.168.2.3, 用户: debian, 路径: /home/debian/android
# 用途: 源码同步 -> 远程 Gradle 编译 -> APK 产物回传 -> adb install 部署

param(
    [string]$RemoteHost = "192.168.2.3",
    [string]$RemoteUser = "debian",
    [string]$RemotePath = "/home/debian/android",
    [string]$LocalAndroidDir = ".\android",
    [string]$ApkOutputDir = ".\android\app\build\outputs\apk\debug",
    [string]$DeviceSerial = ""
)

$ErrorActionPreference = "Stop"

Write-Host "=== PAD2 远程编译流程 ===" -ForegroundColor Cyan

# Step 1: 本地构建前端资源
Write-Host "[1/5] 构建前端资源..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { throw "前端构建失败" }

# Step 2: Capacitor 同步
Write-Host "[2/5] Capacitor 同步..." -ForegroundColor Yellow
npx cap sync android
if ($LASTEXITCODE -ne 0) { throw "Capacitor 同步失败" }

# Step 3: 同步源码到远程服务器
Write-Host "[3/5] 同步源码到远程服务器 $RemoteHost..." -ForegroundColor Yellow
$remoteDest = "${RemoteUser}@${RemoteHost}:${RemotePath}"
scp -r -q "$LocalAndroidDir\*" $remoteDest
if ($LASTEXITCODE -ne 0) { throw "源码同步失败" }

# Step 4: 远程 Gradle 编译
Write-Host "[4/5] 远程 Gradle 编译..." -ForegroundColor Yellow
$gradleCmd = "cd $RemotePath && ./gradlew assembleDebug"
ssh "${RemoteUser}@${RemoteHost}" $gradleCmd
if ($LASTEXITCODE -ne 0) { throw "远程编译失败" }

# Step 5: 回传 APK 并部署
Write-Host "[5/5] 回传 APK 并部署..." -ForegroundColor Yellow
$remoteApk = "${RemotePath}/app/build/outputs/apk/debug/app-debug.apk"
$localApk = "$ApkOutputDir\app-debug.apk"
New-Item -ItemType Directory -Force -Path $ApkOutputDir | Out-Null
scp -q "$remoteApk" "$localApk"
if ($LASTEXITCODE -ne 0) { throw "APK 回传失败" }

if ($DeviceSerial) {
    adb -s $DeviceSerial install -r "$localApk"
} else {
    adb install -r "$localApk"
}
if ($LASTEXITCODE -ne 0) { throw "APK 安装失败" }

Write-Host "=== 编译部署完成 ===" -ForegroundColor Green
Write-Host "APK: $localApk" -ForegroundColor Green
@echo off
chcp 65001 >nul
title BWCut Studio — Installer & System Setup (fasterpsu)
mode con: cols=100 lines=38 >nul 2>&1
set "BWCUT_LAUNCH_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText('%~f0',[Text.Encoding]::UTF8);$m='#'+'BWCUT_PS1';$i=$s.LastIndexOf($m);$p=Join-Path $env:TEMP 'BWCut-install.ps1';[IO.File]::WriteAllText($p,$s.Substring($i+$m.Length),(New-Object Text.UTF8Encoding $true));& $p"
echo.
pause
exit /b
#BWCUT_PS1
# ==============================================================================
#   BWCut Studio by fasterpsu (BW OS)
#   100% Free & Open-Source AI Video Editor Workstation
#   ตัวติดตั้ง / ตรวจสอบระบบอัตโนมัติ สำหรับ Windows 10 / 11
# ==============================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
$OutputEncoding           = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "BWCut Studio — Pro AI Video Workstation (by fasterpsu · BW OS)"

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# ───────── Setup Virtual Terminal (ANSI Colors) ─────────
try {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class ConsoleHelper {
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr GetStdHandle(int nStdHandle);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint lpMode);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint dwMode);

    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(int wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);

    public static void EnableVT() {
        try {
            IntPtr hOut = GetStdHandle(-11);
            uint mode;
            if (GetConsoleMode(hOut, out mode)) {
                // Enable PROCESSED_OUTPUT (0x1), WRAP_AT_EOL (0x2), VIRTUAL_TERMINAL_PROCESSING (0x4)
                // NEVER set DISABLE_NEWLINE_AUTO_RETURN (0x8) - explicitly mask it out
                mode = (mode | 0x0001 | 0x0002 | 0x0004) & ~0x0008u;
                SetConsoleMode(hOut, mode);
            }
        } catch {}
    }

    public static void RefreshIcons() {
        try {
            SHChangeNotify(0x08000000, 0, IntPtr.Zero, IntPtr.Zero);
        } catch {}
    }
}
"@
    [ConsoleHelper]::EnableVT()
} catch {}

# ───────── BWCut Studio Color Palette (ANSI 24-bit TrueColor) ─────────
$esc = [string][char]27
$cPrimary = "$esc`[38;2;255;107;0m"     # Flame Amber
$cOrange  = "$esc`[38;2;233;84;32m"     # Ubuntu Flame
$cGold    = "$esc`[38;2;250;204;21m"     # Headline Gold
$cCyan    = "$esc`[38;2;0;240;255m"      # Laser Cyan
$cPurple  = "$esc`[38;2;168;85;247m"     # Cyber Aubergine
$cGreen   = "$esc`[38;2;16;185;129m"     # Emerald Green
$cWhite   = "$esc`[38;2;255;255;255m"     # Pure White
$cSilver  = "$esc`[38;2;203;213;225m"     # Crisp Silver
$cDim     = "$esc`[38;2;100;116;139m"     # Muted Slate
$cRed     = "$esc`[38;2;239;68;68m"      # Error Red
$cReset   = "$esc`[0m"

function Step($n, $title) {
    Write-Host ""
    Write-Host "  ${cPrimary}━━━ [ $n ] $title ━━━━━━━━━━━━━━━━━━━━━━━━━${cReset}"
}
function Ok($m) {
    Write-Host "    ${cGreen}✓${cReset}  ${cWhite}$m${cReset}"
}
function Info($label, $val, $extra = "") {
    Write-Host "    ${cDim}•${cReset}  ${cSilver}$($label.PadRight(12))${cReset} : ${cWhite}$val${cReset} ${cGold}$extra${cReset}"
}
function Warn($m) {
    Write-Host "    ${cGold}▲${cReset}  ${cGold}$m${cReset}"
}
function Fail($m) {
    Write-Host ""
    Write-Host "    ${cRed}✖ [ERROR] $m${cReset}"
    exit 1
}

function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [Environment]::GetEnvironmentVariable("Path", "User") + ";" +
                (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links") + ";" +
                (Join-Path $env:ProgramFiles "nodejs")
}

function Winget-Install($id, $extra) {
    $wargs = @("install", "--id", $id, "-e", "--silent", "--accept-package-agreements", "--accept-source-agreements") + $extra
    & winget @wargs
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) {
        Warn "winget $id เสร็จสิ้นด้วยรหัส $LASTEXITCODE"
    }
    Refresh-Path
}

# ───────── BWCUT STUDIO BIG ASCII ART LOGO ─────────
Clear-Host
Write-Host ""
Write-Host "${cPrimary}  ════════════════════════════════════════════════════════════════════════${cReset}"
Write-Host "${cGold}       ██████╗  ██╗    ██╗   ██████╗ ██╗   ██╗ ████████╗${cReset}"
Write-Host "${cGold}       ██╔══██╗ ██║    ██║  ██╔════╝ ██║   ██║ ╚══██╔══╝${cReset}"
Write-Host "${cPrimary}       ██████╔╝ ██║ █╗ ██║  ██║      ██║   ██║    ██║   ${cReset}"
Write-Host "${cPrimary}       ██╔══██╗ ██║███╗██║  ██║      ██║   ██║    ██║   ${cReset}"
Write-Host "${cOrange}       ██████╔╝ ╚███╔███╔╝  ╚██████╗ ╚██████╔╝    ██║   ${cReset}"
Write-Host "${cOrange}       ╚═════╝   ╚══╝╚══╝    ╚═════╝  ╚═════╝     ╚═╝   ${cReset}"
Write-Host ""
Write-Host "       ${cCyan}✂  BWCut Studio  —  Pro AI Video Workstation${cReset}"
Write-Host "       ${cSilver}✦ fasterpsu (${cPurple}BW OS${cSilver})  ·  100% Free & Open-Source Video Editor ✦${cReset}"
Write-Host "${cPrimary}  ════════════════════════════════════════════════════════════════════════${cReset}"

# ตรวจสอบตำแหน่งโฟลเดอร์ของโปรแกรม
$Repo   = "https://github.com/fasterpsu/bwcut.git"
$Branch = "stable"

$LaunchDir = $env:BWCUT_LAUNCH_DIR
if ($LaunchDir -and $LaunchDir.EndsWith("\")) { $LaunchDir = $LaunchDir.TrimEnd("\") }

$IsLocalSource = $false
if ($LaunchDir -and (Test-Path (Join-Path $LaunchDir "package.json"))) {
    $Dest = $LaunchDir
    $IsLocalSource = $true
} else {
    $Dest = Join-Path $env:USERPROFILE "BWCut"
}
if ($env:BWCUT_DEST) { $Dest = $env:BWCUT_DEST }

# ───────── 1) วิเคราะห์สเปกเครื่อง ─────────
Step "1/6" "วิเคราะห์สเปกเครื่องคอมพิวเตอร์"
$os   = Get-CimInstance Win32_OperatingSystem
$cpu  = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
$ram  = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
$gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name })
$free = [math]::Round((Get-PSDrive ($env:USERPROFILE.Substring(0,1))).Free / 1GB, 0)

Info "Windows" "$($os.Caption) ($($os.Version))"
Info "CPU" "$cpu"
Info "RAM" "$ram GB"
Info "การ์ดจอ" "$($gpus -join ' / ')"
Info "พื้นที่ว่าง" "$free GB"

$gpuKind = "CPU เท่านั้น (ใช้ libx264)"
if ($gpus -match "NVIDIA")         { $gpuKind = "NVIDIA — เร่งความเร็วด้วยฮาร์ดแวร์ nvenc เร็วสูงมาก" }
elseif ($gpus -match "Radeon|AMD") { $gpuKind = "AMD Radeon — เร่งความเร็วด้วยฮาร์ดแวร์ amf" }
elseif ($gpus -match "Intel")      { $gpuKind = "Intel QuickSync — เร่งความเร็วด้วย qsv" }
Info "ตัวเข้ารหัส" "$gpuKind"

if ($ram -lt 8)   { Warn "RAM น้อยกว่า 8 GB — หากตัดคลิปยาวมากอาจใช้เวลาเพิ่มขึ้น" }
if ($free -lt 10) { Warn "พื้นที่ว่างน้อยกว่า 10 GB — ควรเคลียร์พื้นที่ดิสก์สำหรับเรนเดอร์วิดีโอ" }

# ───────── 2) ตรวจสอบและติดตั้งเครื่องมือหลัก ─────────
Step "2/6" "ตรวจสอบเครื่องมือระบบ (Git / Node.js / FFmpeg)"
Refresh-Path

$git = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not $git -and -not $IsLocalSource) {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "    ${cGold}กำลังติดตั้ง Git ผ่าน winget...${cReset}"
        Winget-Install "Git.Git" @()
        $git = (Get-Command git -ErrorAction SilentlyContinue).Source
    }
}
if (-not $git -and (Test-Path "C:\Program Files\Git\cmd\git.exe")) { $git = "C:\Program Files\Git\cmd\git.exe" }
if ($git) { Ok "Git: $git" }

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
    Write-Host "    ${cGold}กำลังติดตั้ง Node.js LTS ผ่าน winget...${cReset}"
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Winget-Install "OpenJS.NodeJS.LTS" @()
        $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    }
}
if (-not $node -and (Test-Path "C:\Program Files\nodejs\node.exe")) { $node = "C:\Program Files\nodejs\node.exe" }
if (-not $node) { Fail "ติดตั้ง Node.js ไม่สำเร็จ กรุณาติดตั้ง Node.js จาก nodejs.org แล้วรันใหม่อีกครั้ง" }
Ok "Node.js: $node"

$ff = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
if (-not $ff) {
    $localFf = Join-Path $Dest "bin\ffmpeg.exe"
    if (Test-Path $localFf) {
        $ff = $localFf
    } else {
        Write-Host "    ${cGold}กำลังติดตั้ง FFmpeg ผ่าน winget...${cReset}"
        if (Get-Command winget -ErrorAction SilentlyContinue) {
            Winget-Install "Gyan.FFmpeg" @()
            $ff = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
        }
    }
}
if (-not $ff) { Fail "ติดตั้ง FFmpeg ไม่สำเร็จ กรุณารันใหม่อีกครั้ง" }
Ok "FFmpeg: $ff"

# ───────── 3) ดึงหรือตรวจโปรแกรม BWCut ─────────
Step "3/6" "ตรวจสอบไฟล์โปรแกรม BWCut"
if ($IsLocalSource) {
    Ok "ตรวจพบโปรแกรมในตำแหน่งปัจจุบัน: $Dest"
} else {
    Write-Host "    ${cCyan}กำลังเชื่อมต่อ GitHub ($Repo)...${cReset}"
    if (-not $git) { Fail "ไม่พบ Git ในเครื่อง กรุณาติดตั้ง Git ก่อนดาวน์โหลดจาก GitHub" }
    if (Test-Path (Join-Path $Dest ".git")) {
        & $git -C $Dest fetch origin $Branch
        & $git -C $Dest checkout -B $Branch "origin/$Branch"
        & $git -C $Dest reset --hard "origin/$Branch"
    } else {
        if (Test-Path $Dest) {
            $oldBak = "BWCut_old_" + (Get-Date -Format "yyyyMMdd_HHmmss")
            Rename-Item $Dest $oldBak -ErrorAction SilentlyContinue
        }
        & $git clone --branch $Branch $Repo $Dest
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $Dest "package.json"))) {
            Fail "ดาวน์โหลด BWCut จาก GitHub ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตหรือ GitHub URL ($Repo)"
        }
    }
    Ok "โปรแกรมอยู่ที่ $Dest"
}

# ───────── 4) ติดตั้งโมดูล Node.js ─────────
Step "4/6" "ติดตั้งโมดูลและส่วนเสริม (Node.js)"
Push-Location $Dest
& npm install --no-audit --no-fund
Pop-Location
Ok "โมดูลพร้อมใช้งานครบถ้วน 100%"

# ───────── 5) สร้างไอคอนบน Desktop ─────────
Step "5/6" "สร้างไอคอนทางลัดบน Desktop"
$desk = [Environment]::GetFolderPath("Desktop")
$runBat = Join-Path $Dest "run.bat"
try {
    $ws = New-Object -ComObject WScript.Shell
    $lnk = $ws.CreateShortcut((Join-Path $desk "BWCut Studio.lnk"))
    $lnk.TargetPath = $runBat
    $customIcon = Join-Path $Dest "assets\icon.ico"
    if (Test-Path $customIcon) {
        $lnk.IconLocation = "$customIcon,0"
    } else {
        $lnk.IconLocation = "$env:SystemRoot\System32\shell32.dll,115"
    }
    $lnk.Description = "BWCut Studio by fasterpsu (BW OS)"
    $lnk.Save()
    try { [ConsoleHelper]::RefreshIcons() } catch {}
    Ok "สร้างไอคอน 'BWCut Studio' บน Desktop สำเร็จ"
} catch {
    Warn "ไม่สามารถสร้างไอคอนบน Desktop ได้ (สามารถเปิดผ่าน $runBat)"
}

# ───────── 6) เริ่มต้นใช้งาน ─────────
Step "6/6" "เปิดใช้งาน BWCut Studio"
Start-Process -FilePath $runBat -WorkingDirectory $Dest
Write-Host ""
Write-Host "${cGreen}  ════════════════════════════════════════════════════════════════════════${cReset}"
Write-Host "${cGreen}    🎉 ติดตั้งเสร็จสมบูรณ์! หน้าโปรแกรมเปิดที่ ${cGold}http://127.0.0.1:3110${cReset}"
Write-Host "${cGreen}    ครั้งต่อไปสามารถเปิดใช้งานได้จากไอคอน ${cWhite}'BWCut Studio'${cGreen} บนหน้าจอ Desktop ครับ${cReset}"
Write-Host "${cGreen}  ════════════════════════════════════════════════════════════════════════${cReset}"
Write-Host ""

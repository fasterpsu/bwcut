@echo off
chcp 65001 >nul
title BWCut Studio — Uninstaller (fasterpsu)
mode con: cols=85 lines=30 >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText('%~f0',[Text.Encoding]::UTF8);$m='#'+'BWCUT_UNINSTALL_PS1';$i=$s.LastIndexOf($m);$p=Join-Path $env:TEMP 'BWCut-uninstall.ps1';[IO.File]::WriteAllText($p,$s.Substring($i+$m.Length),(New-Object Text.UTF8Encoding $true));& $p"
echo.
pause
exit /b
#BWCUT_UNINSTALL_PS1
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
$OutputEncoding           = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "BWCut Studio — ถอนการติดตั้ง (Uninstaller)"

$esc = [string][char]27
$cPrimary = "$esc`[38;2;255;107;0m"
$cGold    = "$esc`[38;2;250;204;21m"
$cRed     = "$esc`[38;2;239;68;68m"
$cGreen   = "$esc`[38;2;16;185;129m"
$cWhite   = "$esc`[38;2;255;255;255m"
$cDim     = "$esc`[38;2;100;116;139m"
$cReset   = "$esc`[0m"

Clear-Host
Write-Host ""
Write-Host "${cRed}  ════════════════════════════════════════════════════════════════════════${cReset}"
Write-Host "${cGold}       ✂️  BWCut Studio — ระบบถอนการติดตั้ง (Uninstaller)${cReset}"
Write-Host "${cDim}       fasterpsu (BW OS)  ·  100% Free & Clean Removal${cReset}"
Write-Host "${cRed}  ════════════════════════════════════════════════════════════════════════${cReset}"
Write-Host ""

Write-Host "  ${cWhite}ระบบจะดำเนินการดังนี้:${cReset}"
Write-Host "    ${cDim}1.${cReset} ปิดเซิร์ฟเวอร์ BWCut Studio ที่กำลังทำงานอยู่ทั้งหมด"
Write-Host "    ${cDim}2.${cReset} ลบไอคอนทางลัด 'BWCut Studio' บนหน้าจอ Desktop"
Write-Host "    ${cDim}3.${cReset} ล้างไฟล์แคชและโฟลเดอร์ชั่วคราว (temp)"
Write-Host ""
Write-Host "  ${cGold}หมายเหตุ:${cReset} โฟลเดอร์ผลลัพธ์วิดีโอที่คุณเคยเรนเดอร์ไว้ (${cGreen}rendered/${cReset}) จะไม่ถูกลบ"
Write-Host ""

$confirm = Read-Host "  คุณแน่ใจหรือไม่ว่าต้องการถอนการติดตั้ง BWCut Studio? (กด Y เพื่อยืนยัน / N เพื่อยกเลิก)"
if ($confirm -notmatch '^[Yy]$') {
    Write-Host ""
    Write-Host "  ${cGold}ยกเลิกการถอนการติดตั้งแล้ว ขอบคุณที่ใช้งาน BWCut Studio ครับ${cReset}"
    exit 0
}

Write-Host ""
Write-Host "  ${cPrimary}━━━ กำลังถอนการติดตั้ง... ━━━━━━━━━━━━━━━━━━━━━━━━━${cReset}"

# 1. Kill running processes
Write-Host "    ${cDim}•${cReset}  กำลังปิดการทำงานของ BWCut Studio..."
try {
    $conns = Get-NetTCPConnection -LocalPort 3110 -ErrorAction SilentlyContinue
    if ($conns) {
        $conns | ForEach-Object {
            Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
} catch {}
Get-Process | Where-Object { $_.MainWindowTitle -like "*BWCut Studio*" } | Stop-Process -Force -ErrorAction SilentlyContinue

# 2. Remove desktop shortcut
Write-Host "    ${cDim}•${cReset}  กำลังลบไอคอนทางลัดบน Desktop..."
$deskLnk = Join-Path ([Environment]::GetFolderPath("Desktop")) "BWCut Studio.lnk"
if (Test-Path $deskLnk) {
    Remove-Item -Force $deskLnk -ErrorAction SilentlyContinue
    Write-Host "      ${cGreen}✓${cReset} ลบไอคอนทางลัดบน Desktop เรียบร้อย"
} else {
    Write-Host "      ${cDim}- ไม่พบไอคอนทางลัดบน Desktop${cReset}"
}

# 3. Clean temporary files
Write-Host "    ${cDim}•${cReset}  กำลังล้างไฟล์แคชชั่วคราว..."
$appDir = $PSScriptRoot
if (-not $appDir) { $appDir = (Get-Item $MyInvocation.MyCommand.Path).DirectoryName }
$tempDir = Join-Path $appDir "temp"
if (Test-Path $tempDir) {
    Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
    Write-Host "      ${cGreen}✓${cReset} ล้างโฟลเดอร์แคชเรียบร้อย"
}

# 4. Optional delete whole folder prompt
Write-Host ""
Write-Host "  ${cWhite}คุณต้องการลบโฟลเดอร์โปรแกรม BWCut ทั้งหมดออกจากเครื่องด้วยหรือไม่?${cReset}"
Write-Host "  ${cDim}ตำแหน่ง: $appDir${cReset}"
$delFolder = Read-Host "  (กด Y เพื่อลบโฟลเดอร์ทั้งหมด / N เพื่อเก็บบันทึกงานและไฟล์วิดีโอไว้)"

if ($delFolder -match '^[Yy]$') {
    Write-Host ""
    Write-Host "    ${cGold}กำลังเตรียมลบโฟลเดอร์โปรแกรมหลังปิดหน้าต่างนี้...${cReset}"
    $cmd = "timeout /t 2 /nobreak >nul && rd /s /q `"$appDir`""
    Start-Process -WindowStyle Hidden -FilePath "cmd.exe" -ArgumentList "/c $cmd"
}

Write-Host ""
Write-Host "${cGreen}  ════════════════════════════════════════════════════════════════════════${cReset}"
Write-Host "${cGreen}    🎉 ถอนการติดตั้ง BWCut Studio เรียบร้อยแล้วครับ!${cReset}"
Write-Host "${cGreen}  ════════════════════════════════════════════════════════════════════════${cReset}"
Write-Host ""

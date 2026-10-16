@echo off
chcp 65001 > nul
cd /d "%~dp0"

REM ───────── Auto-Update from GitHub ─────────
git status >nul 2>&1
if not errorlevel 1 (
    git fetch origin stable --quiet >nul 2>&1
    for /f %%i in ('git rev-parse HEAD 2^>nul') do set "LOCAL_HASH=%%i"
    for /f %%i in ('git rev-parse origin/stable 2^>nul') do set "REMOTE_HASH=%%i"
    if defined REMOTE_HASH (
        if not "%LOCAL_HASH%"=="%REMOTE_HASH%" (
            echo.
            echo  ==============================================================
            echo   [BWCut Studio] ตรวจพบเวอร์ชันใหม่บน GitHub!
            echo   กำลังดาวน์โหลดและติดตั้งอัปเดตอัตโนมัติ กรุณารอสักครู่...
            echo  ==============================================================
            git checkout -B stable origin/stable >nul 2>&1
            git pull origin stable --quiet >nul 2>&1
            call npm install --no-audit --no-fund >nul 2>&1
            echo   อัปเดตเป็นเวอร์ชันล่าสุดเรียบร้อยแล้ว!
            echo.
        )
    )
)

REM เคลียร์โปรเซสเดิมที่ค้างอยู่บนพอร์ต 3110 (ถ้ามี)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3110 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

REM Start BWCut Server
start "BWCut Studio" cmd /k "chcp 65001 > nul && title BWCut Studio (port 3110) && cls && cd /d ""%~dp0"" && npx tsx watch src/server.ts"

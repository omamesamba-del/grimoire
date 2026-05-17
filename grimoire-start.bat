@echo off
cd /d "%~dp0"

if not exist "dist\index.html" (
    echo [Building grimoire...]
    call npm run build
    if %errorlevel% neq 0 (
        echo [ERROR] Build failed!
        pause
        exit /b
    )
)

start "" /B npx electron .
exit

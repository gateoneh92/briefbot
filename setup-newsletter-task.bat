@echo off
schtasks /Create /TN "Daily Newsletter" /SC DAILY /ST 07:00 /TR "cmd /c %~dp0run-newsletter.bat" /RL HIGHEST /F

if %ERRORLEVEL% == 0 (
    echo [OK] Task created - runs daily at 07:00
) else (
    echo [ERROR] Failed. Right-click and run as Administrator.
)
echo.
pause

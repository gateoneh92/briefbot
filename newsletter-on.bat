@echo off
schtasks /Change /TN "Daily Newsletter" /ENABLE

if %ERRORLEVEL% == 0 (
    echo [ON] Daily newsletter enabled - runs at 07:00
) else (
    echo [ERROR] Task not found. Run setup-newsletter-task.bat first.
)
echo.
pause

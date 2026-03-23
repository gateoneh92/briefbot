@echo off
schtasks /Change /TN "Daily Newsletter" /DISABLE

if %ERRORLEVEL% == 0 (
    echo [OFF] Daily newsletter disabled
    echo Use run-newsletter.bat for manual send.
) else (
    echo [ERROR] Task not found. Run setup-newsletter-task.bat first.
)
echo.
pause

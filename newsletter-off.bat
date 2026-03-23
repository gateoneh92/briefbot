@echo off
%SystemRoot%\System32\schtasks.exe /Change /TN "Daily Newsletter" /DISABLE
echo.
echo [뉴스레터] 자동 발송 OFF
echo 수동 실행은 run-newsletter.bat 을 사용하세요.
echo.
pause

@echo off
%SystemRoot%\System32\schtasks.exe /Change /TN "Daily Newsletter" /ENABLE
echo.
echo [뉴스레터] 자동 발송 ON
echo 매일 오전 7시에 실행됩니다.
echo.
pause

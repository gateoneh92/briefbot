@echo off
cd /d "%~dp0"
"C:\Program Files\nodejs\node.exe" --env-file=.env src/cli.js run

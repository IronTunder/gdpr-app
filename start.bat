@echo off
setlocal

cd /d "%~dp0"

start "GDPR Chat - Server" cmd /k "npm.cmd --prefix server run dev"
start "GDPR Chat - Client" cmd /k "npm.cmd --prefix client run dev -- --host 0.0.0.0"

echo Server e client avviati in due terminali separati.
echo Apri http://localhost:5173 nel browser.

endlocal

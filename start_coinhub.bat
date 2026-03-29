@echo off
cd /d "%~dp0"
start "" /min cmd /c "python auth_server.py >> coinhub.log 2>&1"
start "" /min cmd /c "C:\Users\ian\cloudflared.exe tunnel run coinhub >> coinhub-tunnel.log 2>&1"

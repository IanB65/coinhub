@echo off
cd /d "%~dp0"
start "" /min cmd /c "python auth_server.py >> coinhub.log 2>&1"

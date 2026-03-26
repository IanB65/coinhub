@echo off
cd /d "%~dp0"
echo.
echo  CoinHub — Save Version
echo  ========================
echo.
set /p MSG=  Describe this version (e.g. "added coin sorting"):
if "%MSG%"=="" set MSG=Manual save
git add -u
git commit -m "%MSG%"
git push
echo.
echo  Done! Version saved to GitHub.
echo.
pause

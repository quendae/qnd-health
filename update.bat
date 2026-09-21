@echo off
setlocal EnableExtensions

set "REMOTE=%~1"
if "%REMOTE%"=="" set "REMOTE=%QND_HEALTH_HOST%"

set "REMOTE_DIR=%~2"
if "%REMOTE_DIR%"=="" set "REMOTE_DIR=/opt/qnd-health"

if "%REMOTE%"=="" (
  echo QND Health updater
  echo.
  echo Usage:
  echo   update.bat root@192.168.1.50
  echo   update.bat root@192.168.1.50 /opt/qnd-health
  echo.
  echo Or set QND_HEALTH_HOST once and then run update.bat without arguments:
  echo   setx QND_HEALTH_HOST root@192.168.1.50
  exit /b 2
)

where ssh >nul 2>nul
if errorlevel 1 (
  echo ERROR: ssh.exe was not found. Install Windows OpenSSH Client first.
  exit /b 1
)

echo Updating QND Health on %REMOTE%:%REMOTE_DIR%
echo.
ssh "%REMOTE%" "cd %REMOTE_DIR% && chmod +x update.sh && ./update.sh"
set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (
  echo.
  echo ERROR: remote update failed with exit code %RC%.
  exit /b %RC%
)

echo.
echo QND Health update completed successfully.
exit /b 0

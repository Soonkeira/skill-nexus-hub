@echo off
setlocal

echo ========================================
echo  Skill Nexus Hub CLI Installer
echo ========================================
echo.

set "SERVER_URL=http://localhost:8000"
if defined SKILL_HUB_SERVER set "SERVER_URL=%SKILL_HUB_SERVER%"

set "INSTALL_DIR=%USERPROFILE%\bin"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

echo Downloading snh.exe from %SERVER_URL%...
powershell -Command "Invoke-WebRequest -Uri '%SERVER_URL%/api/cli/download/windows' -OutFile '%INSTALL_DIR%\snh.exe'" 2>nul
if errorlevel 1 (
    echo.
    echo [ERROR] Download failed. Make sure the server is running at %SERVER_URL%
    echo You can set SKILL_HUB_SERVER environment variable to change the server URL.
    pause
    exit /b 1
)

echo.
echo ========================================
echo  Installed to %INSTALL_DIR%\snh.exe
echo ========================================
echo.
echo Make sure %INSTALL_DIR% is in your PATH.
echo Then run: snh init -s %SERVER_URL%
echo.
pause

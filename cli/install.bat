@echo off
setlocal

rem ========================================
rem  Skill Nexus Hub CLI Installer (Windows)
rem ========================================
rem  Downloads a ZIP payload from the hub's /api/cli/download/windows endpoint
rem  (contains snh.exe plus a preconfigured snh.conf) and extracts both into
rem  the install directory. The CLI reads snh.conf from the directory next to
rem  its executable (see cli/snh/config.py).
rem
rem  Environment variables:
rem    SKILL_HUB_SERVER  Base URL of the hub to download from.
rem                      Default: http://localhost:9527 (the port exposed by
rem                      the Docker Compose quick start).

echo ========================================
echo  Skill Nexus Hub CLI Installer
echo ========================================
echo.

set "SERVER_URL=http://localhost:9527"
if defined SKILL_HUB_SERVER set "SERVER_URL=%SKILL_HUB_SERVER%"

set "INSTALL_DIR=%USERPROFILE%\bin"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

set "ZIP_PATH=%INSTALL_DIR%\snh-install.zip"

echo Downloading snh.exe from %SERVER_URL%...
powershell -NoProfile -Command "Invoke-WebRequest -Uri '%SERVER_URL%/api/cli/download/windows' -OutFile '%ZIP_PATH%'" 2>nul
if errorlevel 1 (
    echo.
    echo [ERROR] Download failed. Make sure the server is running at %SERVER_URL%
    echo You can set SKILL_HUB_SERVER environment variable to change the server URL.
    pause
    exit /b 1
)

echo Extracting into %INSTALL_DIR%...
powershell -NoProfile -Command "Expand-Archive -Force -Path '%ZIP_PATH%' -DestinationPath '%INSTALL_DIR%'"
if errorlevel 1 (
    echo.
    echo [ERROR] Extraction failed.
    del "%ZIP_PATH%" 2>nul
    pause
    exit /b 1
)
del "%ZIP_PATH%" 2>nul

echo.
echo ========================================
echo  Installed to %INSTALL_DIR%\snh.exe
echo ========================================
echo.
echo A preconfigured snh.conf was installed next to the binary.
echo Make sure %INSTALL_DIR% is in your PATH.
echo Then run: snh init -s %SERVER_URL%   (only if you need a different server)
echo.
pause

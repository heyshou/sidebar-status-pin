@echo off
set "TARGET=%USERPROFILE%\.gemini\config\plugins\sidebar-status-pin"
if exist "%TARGET%" (
    rmdir /s /q "%TARGET%"
    echo [OK] Uninstalled sidebar-status-pin from %TARGET%
) else (
    echo [INFO] Plugin directory not found: %TARGET%
)
pause

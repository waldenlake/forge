@echo off
REM Install Forge skills for OpenCode (Windows)
REM This copies skill files to %USERPROFILE%\.config\opencode\skills\

set "SCRIPT_DIR=%~dp0"
set "FORGE_ROOT=%SCRIPT_DIR%.."
set "SKILLS_SOURCE=%FORGE_ROOT%\skills"
set "TARGET_DIR=%USERPROFILE%\.config\opencode\skills"

echo Installing Forge skills to: %TARGET_DIR%
echo.

if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

for %%s in (using-forge start next resume done bugfix scenarios progress-tracking session-handoff) do (
    if exist "%TARGET_DIR%\%%s" (
        echo   Updating: %%s
        rmdir /s /q "%TARGET_DIR%\%%s"
    ) else (
        echo   Installing: %%s
    )
    xcopy /e /i /q "%SKILLS_SOURCE%\%%s" "%TARGET_DIR%\%%s" >nul
)

echo.
echo Done! Forge skills installed.
echo.
echo Verify in OpenCode: use skill tool to list skills

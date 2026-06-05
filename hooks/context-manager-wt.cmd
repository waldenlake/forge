@echo off
REM Forge context-manager hook for Claude Code + Windows Terminal (Chain A, new-window fallback).
REM
REM Windows Terminal does not support send-input (microsoft/terminal#9368).
REM This script opens a new tab instead of clearing in-place.
REM
REM Triggered by Claude Code's Stop hook when handoff-signal.json exists.
REM
REM Usage in .claude/settings.json:
REM   "Stop": [{ "matcher": "", "hooks": [{ "type": "command", "command": ".forge\\hooks\\context-manager-wt.cmd" }] }]
REM
REM Prerequisites:
REM   - Running inside Windows Terminal ($WT_SESSION set)
REM   - wt.exe on PATH
REM   - .forge/handoff-signal.json with action: "handoff-session"
REM
REM Failure: exits silently. Degrades to Chain B (manual compact).

setlocal

set "SIGNAL_FILE=.forge\handoff-signal.json"

if not exist "%SIGNAL_FILE%" exit /b 0

REM Simple check for action field (no jq on Windows by default)
findstr /C:"handoff-session" "%SIGNAL_FILE%" >nul 2>nul
if %ERRORLEVEL% NEQ 0 exit /b 0

REM Clear signal
del /f "%SIGNAL_FILE%" >nul 2>nul

REM Open new Windows Terminal tab at current directory with /resume
start "" wt new-tab -d "%CD%" cmd /c "claude --resume"

exit /b 0

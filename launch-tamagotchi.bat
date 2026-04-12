@echo off
cd /d "%~dp0"
if exist .venv\Scripts\python.exe (
  .venv\Scripts\python.exe launch_desktop.py
) else (
  python launch_desktop.py
)
if errorlevel 1 pause

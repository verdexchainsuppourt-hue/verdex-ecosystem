@echo off
title Verdex Miner — Build EXE
echo.
echo  ^⚡^  VERDEX MINER — BUILD EXE
echo  =============================================
echo.
cd /d "%~dp0"
python build_exe.py
if %errorlevel% equ 0 (
    echo.
    echo  ^✓^  Build complete! Look for VerdexMiner.exe in this folder.
    pause
) else (
    echo.
    echo  ^✗^  Build failed. Check errors above.
    pause
)

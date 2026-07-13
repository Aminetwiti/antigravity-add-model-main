@echo off
taskkill /F /T /PID 32568
echo DONE > "%TEMP%\kill-done.txt"

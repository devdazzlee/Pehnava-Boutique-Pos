@echo off
setlocal
cd /d "%~dp0"
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
if not exist "%CSC%" (
  echo [ERROR] .NET Framework csc.exe not found. Install .NET Framework 4.x.
  exit /b 1
)
"%CSC%" /nologo /target:exe /out:"%~dp0..\daemon\rawprint.exe" "%~dp0raw-print.cs"
if errorlevel 1 exit /b 1
echo Built: %~dp0..\daemon\rawprint.exe
exit /b 0

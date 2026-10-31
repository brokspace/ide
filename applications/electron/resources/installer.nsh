; Brokspace IDE installer additions (electron-builder NSIS include).
; Adds the bundled brok (resources\bin) to the current user's PATH on
; install and removes it on uninstall, so `brok` works in any terminal.
; PowerShell edits the user PATH registry value and broadcasts the change.

!macro customInstall
  nsExec::ExecToLog `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$bin = '$INSTDIR\resources\bin'; $$path = [Environment]::GetEnvironmentVariable('Path', 'User'); if (-not $$path) { $$path = '' }; if (($$path -split ';') -notcontains $$bin) { [Environment]::SetEnvironmentVariable('Path', ($$path.TrimEnd(';') + ';' + $$bin).TrimStart(';'), 'User') }"`
!macroend

!macro customUnInstall
  nsExec::ExecToLog `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$bin = '$INSTDIR\resources\bin'; $$path = [Environment]::GetEnvironmentVariable('Path', 'User'); if ($$path) { [Environment]::SetEnvironmentVariable('Path', (($$path -split ';') | Where-Object { $$_ -and $$_ -ne $$bin }) -join ';', 'User') }"`
!macroend

# smooth.ps1 - quick D-pad smoothness check of the Offshore page (same key pattern as measure.ps1).
param([string]$Ip = $(throw "Pass -Ip <your TV's address>:5555"))
$adb = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "platform-tools\adb.exe"
function S([string]$c) { & "$adb" -s "$Ip" shell $c }
S "am start -n app.offshore/.Entry" | Out-Null; Start-Sleep 8
S "dumpsys gfxinfo app.offshore reset" | Out-Null
$seq = @('RIGHT') * 4 + @('LEFT') * 4 + 'DOWN', 'RIGHT', 'RIGHT', 'RIGHT', 'LEFT', 'LEFT', 'LEFT', 'UP', 'RIGHT', 'RIGHT', 'LEFT', 'LEFT'
foreach ($k in $seq) { S "input keyevent KEYCODE_DPAD_$k" | Out-Null; Start-Sleep -Milliseconds 700 }
S "dumpsys gfxinfo app.offshore" | Select-String -Pattern 'Total frames|Janky|50th|90th|99th' | ForEach-Object { "  " + $_.Line.Trim() }

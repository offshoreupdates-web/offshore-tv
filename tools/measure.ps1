# measure.ps1 - performance of the Offshore home screen, measured the same way as before\BASELINE.md.
#   powershell -ExecutionPolicy Bypass -File ".\tools\measure.ps1" [-Label name]     writes after\measure-<label>.txt
param([string]$Ip = $(throw "Pass -Ip <your TV's address>:5555"), [string]$Label = "latest")

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$adb = Join-Path "$root" "tools\platform-tools\adb.exe"
& "$adb" connect "$Ip" | Out-Null
function S([string]$c) { & "$adb" -s "$Ip" shell $c }
$out = @("# Offshore measurements ($Label), $(Get-Date -Format s)")

S "am start -n app.offshore/.Entry" | Out-Null; Start-Sleep 30     # settle, like the baseline

function Stat { $l = (S "head -1 /proc/stat") -split '\s+' | Select-Object -Skip 1 | ForEach-Object { [long]$_ }; @{ idle = $l[3] + $l[4]; total = ($l | Measure-Object -Sum).Sum } }
$a = Stat; Start-Sleep 30; $b = Stat; Start-Sleep 30; $c = Stat
$cpu30 = [math]::Round(100 * (1 - ($b.idle - $a.idle) / ($b.total - $a.total)), 1)
$cpu60 = [math]::Round(100 * (1 - ($c.idle - $a.idle) / ($c.total - $a.total)), 1)
$avail = [math]::Round([long]((S "grep MemAvailable /proc/meminfo") -replace '\D', '') / 1024)
$pss = S "dumpsys meminfo app.offshore | grep -E 'TOTAL'" | Select-Object -First 1
$out += "Idle CPU (8 cores): $cpu30 % over 30 s, $cpu60 % over 60 s (60 s includes a photo crossfade)"
$out += "RAM available: $avail MB"
$out += "Offshore memory: $(($pss -split '\s+' | Where-Object { $_ })[1]) KB PSS"

S "dumpsys gfxinfo app.offshore reset" | Out-Null
$seq = @('RIGHT') * 4 + @('LEFT') * 4 + 'DOWN', 'RIGHT', 'RIGHT', 'RIGHT', 'LEFT', 'LEFT', 'LEFT', 'UP', 'RIGHT', 'RIGHT', 'LEFT', 'LEFT'
foreach ($k in $seq) { S "input keyevent KEYCODE_DPAD_$k" | Out-Null; Start-Sleep -Milliseconds 700 }
$g = S "dumpsys gfxinfo app.offshore"
$out += "D-pad smoothness ($($seq.Count) presses):"
$out += ($g | Select-String -Pattern 'Total frames|Janky|50th|90th|99th' | ForEach-Object { "  " + $_.Line.Trim() })

$apps = [ordered]@{ 'Netflix' = 'com.netflix.ninja/.MainActivity'; 'Prime Video' = 'com.amazon.firebat/com.amazon.pyrocore.IgnitionActivity' }
foreach ($n in $apps.Keys) {
    $cmp = $apps[$n]; $pkg = $cmp.Split('/')[0]; $t = @()
    for ($i = 0; $i -lt 3; $i++) {
        S "am force-stop $pkg"; S "am start -n app.offshore/.Entry" | Out-Null; Start-Sleep 5
        $r = S "am start -W -n $cmp"; $t += [int](($r | Select-String 'TotalTime').ToString().Split(':')[1].Trim()); Start-Sleep 6
    }
    S "am force-stop $pkg"
    $out += "$n cold start: avg $([int](($t | Measure-Object -Average).Average)) ms ($($t -join ' / '))"
}
S "am start -n app.offshore/.Entry" | Out-Null

New-Item -ItemType Directory -Force (Join-Path "$root" "after") | Out-Null
$out | Out-File -Encoding utf8 (Join-Path "$root" "after\measure-$Label.txt")
$out

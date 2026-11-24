# audit.ps1 - drive the TV with remote key presses over ADB and check every path returns to Offshore.
#   powershell -ExecutionPolicy Bypass -File ".\tools\audit.ps1"                               this folder's TV, results in after\audit.txt
#   powershell -ExecutionPolicy Bypass -File ".\tools\audit.ps1" -TvFolder "..\my tv"  tiles from that folder's tv.json
# Never run it while someone is using that TV: it presses real remote keys.
# Apps in -Skip are only checked to have a tile (not opened).
param([string]$TvFolder = "", [string]$Ip = "", [string[]]$Skip = @())

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$adb = Join-Path "$root" "tools\platform-tools\adb.exe"
if (-not $TvFolder) { $TvFolder = $root }
if (-not $Ip) {
    $ipFile = Join-Path "$TvFolder" "ip.txt"
    if (Test-Path "$ipFile") { $Ip = (Get-Content "$ipFile").Trim() } else { throw "Put your TV's address (like 192.168.1.20:5555) in $TvFolder\ip.txt, or pass -Ip" }
}
& "$adb" connect "$Ip" | Out-Null
function S([string]$c) { & "$adb" -s "$Ip" shell $c }
function Key([string]$k) { S "input keyevent KEYCODE_$k" | Out-Null; Start-Sleep -Milliseconds 350 }
function Top { ((S "dumpsys activity activities | grep mResumedActivity") -join '') -replace '.*u0 ([^ ]+) .*', '$1' }
function WaitTop([string]$like, [int]$sec) {
    for ($i = 0; $i -lt $sec * 2; $i++) { $t = Top; if ($t -like $like) { return $t }; Start-Sleep -Milliseconds 500 }
    return Top
}
$OURS = "app.offshore/*"
$results = @()
function Check([string]$name, [bool]$ok, [string]$detail) {
    $line = "{0}  {1,-34} {2}" -f $(if ($ok) { "PASS" } else { "FAIL" }), $name, $detail
    Write-Host $line
    $script:results += $line
}
# Tiles as the home screen shows them: tv.json's apps that are installed, in one scrolling row.
$cfg = Join-Path "$TvFolder" "tv.json"
$apps = if (Test-Path "$cfg") { @((Get-Content -Raw "$cfg" | ConvertFrom-Json).apps) } else {
    @("com.plexapp.android", "com.amazon.firebat", "com.netflix.ninja", "org.xbmc.kodi", "com.nordvpn.android") }
$apps = @($apps | Where-Object { (S "pm list packages $_") -match "package:$([regex]::Escape($_))$" })
# One row of tiles (2.11+): left/right scrolls through all of them.
$cols = [math]::Max(1, $apps.Count)
$rows = 1

function GoHome {
    S "am start -n app.offshore/.Entry" | Out-Null
    WaitTop $OURS 10 | Out-Null
    Start-Sleep 2
    foreach ($i in 0..$rows) { Key "DPAD_UP" }; foreach ($i in 1..$cols) { Key "DPAD_LEFT" }   # focus: first tile
}

# 1. Every tile opens its app, and Home comes back to Offshore. The screen order (A-Z, most-used first) changes, so
#    the page saves it to order.txt next to tv.json; skipped apps' tiles are only checked to be there.
function Order { @(((S "cat /sdcard/Android/data/app.offshore/files/order.txt") -join '').Split(',') | Where-Object { $_ }) }
GoHome
$order = Order
$missing = @($apps | Where-Object { $order -notcontains $_ })
Check "Every app has a tile" ($missing.Count -eq 0 -and $order.Count -eq $apps.Count) ("order: " + ($order -join ', '))
foreach ($pkg in $order) {
    if ($Skip -contains $pkg) { Write-Host "SKIP  $pkg"; continue }
    GoHome
    $i = [array]::IndexOf((Order), $pkg)            # each launch counts as use, so the order can change between tiles
    for ($r = 0; $r -lt [math]::Floor($i / $cols); $r++) { Key "DPAD_DOWN" }
    for ($r = 0; $r -lt $i % $cols; $r++) { Key "DPAD_RIGHT" }
    Key "DPAD_CENTER"
    $want = "$pkg/*"
    $opened = WaitTop $want 12
    Check "Tile $($i + 1) opens $pkg" ($opened -like $want) $opened
    Start-Sleep 3
    $t0 = Get-Date; Key "HOME"
    $back = WaitTop $OURS 12
    Check "  Home returns to Offshore" ($back -like $OURS) ("{0} after {1:N1}s" -f $back, ((Get-Date) - $t0).TotalSeconds)
}

# 2. Settings pill opens Fire TV settings; Back returns to Offshore.
function ToPills { foreach ($i in 1..$rows) { Key "DPAD_DOWN" }; foreach ($i in 1..4) { Key "DPAD_LEFT" } }
GoHome; ToPills; Key "DPAD_CENTER"
$t = WaitTop "com.amazon.tv.launcher/.ui.*Settings*" 8
Check "Settings pill" ($t -like "*Settings*") $t
Key "BACK"; $t = WaitTop $OURS 12
Check "  Back returns to Offshore" ($t -like $OURS) $t

# 3. Fire TV Home pill is an escape hatch: Amazon home opens and STAYS.
GoHome; ToPills; Key "DPAD_RIGHT"; Key "DPAD_CENTER"
Start-Sleep 9; $t = Top
Check "Fire TV Home pill (stays 9s)" ($t -like "com.amazon.tv.launcher/.ui.HomeActivity*") $t
GoHome

# 4. Alexa, voice, TV control, remote: services present and enabled (speaking to Alexa must be tested by a person).
foreach ($p in @("com.amazon.whad", "com.amazon.vizzini", "com.amazon.tv.devicecontrol", "com.amazon.tv.ime")) {
    $en = [bool]((S "pm list packages -e $p") -match "package:$p$"); $run = [bool](S "pidof $p")
    Check "Enabled+running $p" ($en -and $run) "enabled=$en running=$run"
}
# Started on demand (no persistent service), so only check it's enabled.
$p = "com.amazon.tv.keypolicymanager"; $en = [bool]((S "pm list packages -e $p") -match "package:$p$")
Check "Enabled $p" $en "enabled=$en"
$hdmi = (S "settings get global hdmi_control_enabled").Trim()
Check "HDMI-CEC on" ($hdmi -eq "1") "hdmi_control_enabled=$hdmi"
$remote = [bool]((S "dumpsys input") -match "Amazon Fire TV Remote")
Check "Remote connected" $remote ""
$a11y = (S "settings get secure enabled_accessibility_services").Trim()
Check "Home-button service enabled" ($a11y -like "*app.offshore*") $a11y

$out = Join-Path "$TvFolder" "after"; New-Item -ItemType Directory -Force "$out" | Out-Null
(@("# Offshore audit $(Get-Date -Format s)") + $results) | Out-File -Encoding utf8 (Join-Path "$out" "audit.txt")
$fails = @($results | Where-Object { $_ -like "FAIL*" }).Count
Write-Host "`n$($results.Count - $fails) passed, $fails failed"

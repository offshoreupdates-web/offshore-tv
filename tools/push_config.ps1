# push_config.ps1 - send a TV folder's tv.json (app tiles, weather place) to that TV and refresh the home screen.
#   powershell -ExecutionPolicy Bypass -File ".\tools\push_config.ps1"                              the TV whose tv.json and ip.txt are in this folder
#   powershell -ExecutionPolicy Bypass -File ".\tools\push_config.ps1" -TvFolder "..\my tv"
#   Linux: pwsh -File ./tools/push_config.ps1 [-TvFolder "../my tv"] [-Ip <TV address>:5555]
# The TV's IP comes from <TvFolder>\ip.txt (like 192.168.1.20:5555). Every TV runs the same APK; only tv.json differs.
# How it gets there: through the app's ConfigDrop (Offshore 0.11 and later; works on Fire OS 7 and 8, and is the only
# way on 8, where adb can't write into /sdcard/Android/data); else, for older versions, copied straight into the app's
# folder (Fire OS 7). Either
# way the copy on the TV is read back and compared with this one before the script says it worked.
param([string]$TvFolder = "", [string]$Ip = "")

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
# adb: tools\platform-tools on Windows; on Linux the toolchain's copy (setup_toolchain.ps1), else the system's adb.
if (($PSVersionTable.PSEdition -ne "Core") -or $IsWindows) { $adb = Join-Path "$root" "tools\platform-tools\adb.exe" } else {
    $tc = if ($env:OFFSHORE_TOOLS) { $env:OFFSHORE_TOOLS } else { Join-Path $HOME ".local/share/offshore-tools" }
    $adb = Join-Path $tc "platform-tools/adb"
    if (-not (Test-Path $adb)) { $adb = (Get-Command adb -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source }
}
if (-not $TvFolder) { $TvFolder = $root }
$cfg = Join-Path "$TvFolder" "tv.json"
if (-not (Test-Path "$cfg")) { Write-Error "No tv.json in $TvFolder"; exit 1 }
try { $null = Get-Content -Raw "$cfg" | ConvertFrom-Json } catch { Write-Error "tv.json is not valid JSON: $_"; exit 1 }
if (-not $Ip) {
    $ipFile = Join-Path "$TvFolder" "ip.txt"
    if (Test-Path "$ipFile") { $Ip = (Get-Content "$ipFile").Trim() } else { throw "Put your TV's address (like 192.168.1.20:5555) in $(Join-Path $TvFolder 'ip.txt'), or pass -Ip" }
}

& "$adb" connect "$Ip" | Out-Null
if ((& "$adb" -s "$Ip" get-state 2>$null) -ne "device") { Write-Error "TV $Ip not reachable or not authorized"; exit 1 }
$sh = { param($c) ((& "$adb" -s "$Ip" shell $c) -join "`n").Trim() }
if (-not (& $sh "pm path app.offshore")) { Write-Error "Offshore isn't installed on $Ip"; exit 1 }

$want = (Get-FileHash "$cfg" -Algorithm SHA256).Hash.ToLower()
$uri = "content://app.offshore.config/tv.json"
$dir = "/sdcard/Android/data/app.offshore/files"
function TvHash([string]$readCmd) { $h = & $sh "$readCmd 2>/dev/null | sha256sum"; if ($h -match '^([0-9a-f]{64})') { $Matches[1] } else { "" } }

# 1. ConfigDrop: the file goes to adb's own temp folder, then the app's provider writes it into the app's folder.
$tmp = "/data/local/tmp/offshore-tv.json"
& "$adb" -s "$Ip" push "$cfg" $tmp 2>&1 | Out-Null
$how = $null
if (-not $LASTEXITCODE) {
    $null = & $sh "content write --uri $uri < $tmp"
    if ((TvHash "content read --uri $uri") -eq $want) { $how = "ConfigDrop" }
}
$null = & $sh "rm -f $tmp"

# 2. Older Offshore (before 0.11) or no 'content write': straight into the app's folder (works on Fire OS 7, not 8).
if (-not $how) {
    $null = & $sh "mkdir -p $dir"
    & "$adb" -s "$Ip" push "$cfg" "$dir/tv.json" 2>$null | Out-Null
    if ((TvHash "cat $dir/tv.json") -eq $want) { $how = "direct copy" }
}
if (-not $how) {
    Write-Error ("tv.json didn't arrive on $Ip. On Fire OS 8 the TV needs Offshore 0.11 or later (ConfigDrop); " +
                 "check the version in Settings > Updates & about.")
    exit 1
}

# If the home screen is open, reload it so the new tiles show (does not open it otherwise). If it isn't, Offshore
# notices the new file within a minute, or when it next comes back.
$top = & $sh "dumpsys activity activities | grep -E 'mResumedActivity|ResumedActivity:'"
if ($top -match "app.offshore/") {
    $null = & $sh "am start -n app.offshore/.Entry --ez reload true"
}
Write-Host "Pushed $cfg to $Ip ($how; checked: the TV's copy matches, sha256 $($want.Substring(0, 16))...)"

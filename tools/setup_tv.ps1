# setup_tv.ps1 - turn on Offshore's optional permissions on a TV, then check each one.
#   powershell -ExecutionPolicy Bypass -File ".\tools\setup_tv.ps1" -Ip <TV address>:5555
#   Linux: pwsh -File ./tools/setup_tv.ps1 -Ip <TV address>:5555
#   Several TVs: -Ip 192.168.1.20:5555,192.168.1.21:5555
#   Add -Undo to turn them all off again (and switch back on what Tidy up switched off).
#   Add -NoTidy to leave Tidy up alone.
# Home button (accessibility service), music controls (notification listener), Task manager's app list (usage access)
# and the developer access switch (WRITE_SECURE_SETTINGS). These are security settings on the TV, so the user runs
# this. Fire OS has no screen for them and doesn't let apps reach its developer connection, hence a computer.
# Needs ADB debugging on (Fire TV Settings > My Fire TV > Developer options). Customize > Security & privacy >
# Permissions & setup on the TV shows the result.
# Tidy up Fire TV: the user picks Amazon extras to switch off on the TV (Settings > Fire TV > Tidy up Fire TV; the app
# saves tidy.json), and this applies it, because Fire OS lets no app switch other apps off. Only packages listed in
# launcher\web\debloat.json are ever touched, never one matching its "never" list, and only with pm disable-user / pm
# enable (nothing is uninstalled). What this switched off is kept on the TV in tidy_done.json, so -Undo from any
# computer switches exactly those back on.
param([Parameter(Mandatory = $true)][string[]]$Ip, [switch]$Undo, [switch]$NoTidy)

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
# adb: tools\platform-tools on Windows; on Linux the toolchain's copy (setup_toolchain.ps1), else the system's adb.
if (($PSVersionTable.PSEdition -ne "Core") -or $IsWindows) { $adb = Join-Path "$root" "tools\platform-tools\adb.exe" } else {
    $tc = if ($env:OFFSHORE_TOOLS) { $env:OFFSHORE_TOOLS } else { Join-Path $HOME ".local/share/offshore-tools" }
    $adb = Join-Path $tc "platform-tools/adb"
    if (-not (Test-Path $adb)) { $adb = (Get-Command adb -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source }
}
$pkg = "app.offshore"
$svc = "$pkg/$pkg.GuestService"
$catalog = Get-Content -Raw -Encoding UTF8 (Join-Path $root "launcher/web/debloat.json") | ConvertFrom-Json
$known = @($catalog.items | ForEach-Object { $_.pkg })
function Allowed([string]$p) {                     # in the catalog, and not protected by its "never" list
    if ($known -notcontains $p) { return $false }
    foreach ($n in $catalog.never) { if ($p -eq $n -or $p.StartsWith($n)) { return $false } }
    return $true
}
function NameOf([string]$p) { $i = $catalog.items | Where-Object { $_.pkg -eq $p } | Select-Object -First 1; if ($i) { $i.name } else { $p } }

foreach ($tv in $Ip) {
    & "$adb" connect "$tv" | Out-Null
    if ((& "$adb" -s "$tv" get-state 2>$null) -ne "device") { Write-Warning "$tv not reachable or not authorized (accept the prompt on the TV)"; continue }
    $sh = { param($c) (& "$adb" -s "$tv" shell $c) -join "`n" }
    if (-not (& $sh "pm path $pkg")) { Write-Warning "$tv doesn't have Offshore installed"; continue }

    # Accessibility services are one list shared with any others on the TV: add or remove only ours.
    $list = (& $sh "settings get secure enabled_accessibility_services").Trim()
    $items = @($list -split ":" | Where-Object { $_ -and $_ -ne "null" -and $_ -ne $svc })
    if (-not $Undo) { $items += $svc }
    $joined = if ($items.Count) { $items -join ":" } else { "" }
    if ($Undo) {
        & $sh "appops set $pkg GET_USAGE_STATS default; appops set $pkg REQUEST_INSTALL_PACKAGES default; cmd notification disallow_listener $pkg/$pkg.MediaListener; pm revoke $pkg android.permission.WRITE_SECURE_SETTINGS" | Out-Null
        if ($joined) { & $sh "settings put secure enabled_accessibility_services $joined" | Out-Null } else { & $sh "settings delete secure enabled_accessibility_services" | Out-Null }
    } else {
        & $sh "appops set $pkg GET_USAGE_STATS allow; appops set $pkg REQUEST_INSTALL_PACKAGES allow; cmd notification allow_listener $pkg/$pkg.MediaListener; pm grant $pkg android.permission.WRITE_SECURE_SETTINGS" | Out-Null
        & $sh "settings put secure enabled_accessibility_services $joined; settings put secure accessibility_enabled 1" | Out-Null
    }

    $state = [ordered]@{
        "Home button"       = (& $sh "settings get secure enabled_accessibility_services") -match [regex]::Escape($svc)
        "Music controls"    = (& $sh "settings get secure enabled_notification_listeners") -match [regex]::Escape("$pkg/")
        "Task manager list" = (& $sh "appops get $pkg GET_USAGE_STATS") -match "allow"
        "Developer switch"  = (& $sh "dumpsys package $pkg | grep 'WRITE_SECURE_SETTINGS: granted=true'") -ne ""
        "Install updates"   = (& $sh "appops get $pkg REQUEST_INSTALL_PACKAGES") -match "allow"
    }
    Write-Host "$tv"
    foreach ($k in $state.Keys) { Write-Host ("  {0,-18} {1}" -f $k, $(if ($state[$k]) { "on" } else { "off" })) }

    if ($NoTidy) { continue }
    # ---- Tidy up Fire TV -------------------------------------------------------------------------------------------
    $readTv = { param($name)                         # a file from the app's folder: ConfigDrop (Fire OS 8), else directly (7)
        $t = (& $sh "content read --uri content://$pkg.config/$name 2>/dev/null").Trim()
        if (-not $t.StartsWith("{")) { $t = (& $sh "cat /sdcard/Android/data/$pkg/files/$name 2>/dev/null").Trim() }
        if ($t.StartsWith("{")) { try { return ($t | ConvertFrom-Json) } catch { } }
        return $null }
    $disabled = @((& $sh "pm list packages -d") -split "`n" | ForEach-Object { $_.Trim() -replace '^package:', '' } | Where-Object { $_ })
    $installed = @((& $sh "pm list packages") -split "`n" | ForEach-Object { $_.Trim() -replace '^package:', '' } | Where-Object { $_ })
    $doneFile = & $readTv "tidy_done.json"
    $done = [System.Collections.Generic.List[string]]::new()
    if ($doneFile -and $doneFile.off) { foreach ($p in $doneFile.off) { if (Allowed $p) { $done.Add($p) } } }
    $changed = $false
    if ($Undo) {
        foreach ($p in @($done)) {
            if ($disabled -contains $p) { & $sh "pm enable $p" | Out-Null; Write-Host "  Tidy up: switched $(NameOf $p) back on" }
            $done.Remove($p) | Out-Null; $changed = $true
        }
    } else {
        $choice = & $readTv "tidy.json"
        if (-not $choice) { Write-Host "  Tidy up: nothing chosen on the TV (Settings > Fire TV > Tidy up Fire TV)" }
        else {
            foreach ($p in @($choice.off)) {
                if (-not (Allowed $p)) { Write-Warning "  Tidy up: $p isn't on Offshore's list, left alone"; continue }
                if ($installed -notcontains $p -or $disabled -contains $p) { continue }
                $r = & $sh "pm disable-user --user 0 $p 2>&1"
                if ($r -match "disabled-user") { $done.Add($p); $changed = $true; Write-Host "  Tidy up: switched off $(NameOf $p)" }
                else { Write-Warning "  Tidy up: Fire TV wouldn't switch off $(NameOf $p): $($r.Trim())" }
            }
            foreach ($p in @($choice.on)) {
                if (-not (Allowed $p)) { Write-Warning "  Tidy up: $p isn't on Offshore's list, left alone"; continue }
                if ($disabled -notcontains $p) { continue }
                $r = & $sh "pm enable $p 2>&1"
                if ($r -match "enabled") { $done.Remove($p) | Out-Null; $changed = $true; Write-Host "  Tidy up: switched $(NameOf $p) back on" }
                else { Write-Warning "  Tidy up: couldn't switch $(NameOf $p) back on: $($r.Trim())" }
            }
            if (-not $changed) { Write-Host "  Tidy up: already as chosen" }
        }
    }
    if ($changed) {                                  # the record on the TV, for -Undo from any computer
        $rec = ConvertTo-Json -Compress -InputObject ([ordered]@{ v = 1; off = @($done | Select-Object -Unique); at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() })
        $tmpFile = Join-Path ([IO.Path]::GetTempPath()) "offshore-tidy-done.json"
        [IO.File]::WriteAllText($tmpFile, $rec, (New-Object Text.UTF8Encoding $false))
        & "$adb" -s "$tv" push $tmpFile /data/local/tmp/offshore-tidy-done.json 2>&1 | Out-Null
        $null = & $sh "content write --uri content://$pkg.config/tidy_done.json < /data/local/tmp/offshore-tidy-done.json 2>/dev/null || cp /data/local/tmp/offshore-tidy-done.json /sdcard/Android/data/$pkg/files/tidy_done.json; rm -f /data/local/tmp/offshore-tidy-done.json"
        Remove-Item $tmpFile -ErrorAction SilentlyContinue
        $check = & $readTv "tidy_done.json"
        if (-not $check) { Write-Warning "  Tidy up: couldn't keep the record on the TV. Switched off by this run: $(@($done) -join ', ')" }
    }
}

# publish_release.ps1 - make a public Offshore release: built from this folder, signed with the release key, with its
# latest.json (version, notes, download address, SHA-256), and optionally uploaded to the update site on GitHub Pages.
#   Windows: powershell -ExecutionPolicy Bypass -File ".\tools\publish_release.ps1" -Version 0.14 -Code 14
#   Linux:   pwsh -File ./tools/publish_release.ps1 -Version 0.14 -Code 14
#   ... -Upload    also push both files to github.com/offshoreupdates-web/offshoreupdates-web.github.io
#                  (local copy in %USERPROFILE%\offshore-site, or ~/offshore-site on Linux; the first push asks you to
#                  sign in to GitHub)
#   ... -KeyDir "E:\Offshore signing key"   where the release key is (default: "Offshore signing key" next to this
#                  "Public build" folder, i.e. on the same thumb drive)
# First time on a computer: tools\setup_toolchain.ps1 (JDK + Android build tools), and Git for -Upload (Git for Windows
# on Windows; on Linux the system's git plus a way to sign in to GitHub, see HANDOFF.md).
# Version must be higher than the one live at https://offshoreupdates-web.github.io/offshore/latest.json, and the
# CHANGELOG in launcher\web\src (the first entry) should describe it: those lines become the notes TVs show.
param([Parameter(Mandatory = $true)][string]$Version, [Parameter(Mandatory = $true)][int]$Code, [switch]$Upload, [string]$KeyDir = "")

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$onWin = ($PSVersionTable.PSEdition -ne "Core") -or $IsWindows
$exe = if ($onWin) { ".exe" } else { "" }
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$tools = if ($onWin) { Join-Path "$root" "tools" } elseif ($env:OFFSHORE_TOOLS) { $env:OFFSHORE_TOOLS } else { Join-Path $HOME ".local/share/offshore-tools" }
$site = "https://offshoreupdates-web.github.io/offshore"
if ($Version -notmatch '^\d+\.\d+(\.\d+)?$') { throw "Version like 0.14" }
if (-not $KeyDir) { $KeyDir = Join-Path (Split-Path -Parent $root) "Offshore signing key" }
$jks = Join-Path $KeyDir "offshore-release.jks"; $passFile = Join-Path $KeyDir "pass.txt"
if (-not (Test-Path $jks)) { throw "Release key not found in $KeyDir (plug in the thumb drive, or pass -KeyDir)" }
if (-not (Test-Path (Join-Path "$tools" "jdk"))) { throw "Run tools\setup_toolchain.ps1 first (downloads the JDK and Android build tools)" }

# Build, signed with the release key (its password is read from pass.txt by the signer and never printed).
$env:OFFSHORE_KEYSTORE = $jks; $env:OFFSHORE_KEYSTORE_PASS_FILE = $passFile; $env:OFFSHORE_KEY_ALIAS = "offshore"
try { & (Join-Path $root "launcher/android/build.ps1") -VersionCode $Code -VersionName $Version -Tools $tools | Select-String "Built|release key|error" }
finally { Remove-Item Env:OFFSHORE_KEYSTORE, Env:OFFSHORE_KEYSTORE_PASS_FILE, Env:OFFSHORE_KEY_ALIAS -ErrorAction SilentlyContinue }
$apk = Join-Path $root "apks/offshore-$Version.apk"
if (-not (Test-Path "$apk")) { throw "Build didn't produce $apk" }

# It must carry the release key: TVs refuse an update signed with anything else.
$jdk = (Get-ChildItem (Join-Path "$tools" "jdk") -Directory | Select-Object -First 1).FullName
$bt = (Get-ChildItem (Join-Path "$tools" "android-sdk/build-tools") -Directory | Select-Object -First 1).FullName
$keytool = Join-Path $jdk "bin/keytool$exe"; $java = Join-Path $jdk "bin/java$exe"; $signer = Join-Path $bt "lib/apksigner.jar"
$want = ((& $keytool -list -v -keystore $jks -storepass:file $passFile 2>$null | Select-String "SHA256:" | Select-Object -First 1).ToString() -replace '.*SHA256:\s*', '' -replace ':', '').ToLower()
$got = ((& $java -jar $signer verify --print-certs "$apk" | Select-String "SHA-256 digest" | Select-Object -First 1).ToString() -replace '.*digest:\s*', '').ToLower()
if (-not $want -or $want -ne $got) { throw "The APK isn't signed with the release key (got $got)" }

# Notes: this version's entry in the app's own changelog.
$page = [IO.File]::ReadAllText((Join-Path $root "launcher/web/index.html"))
$m = [regex]::Match($page, '\["' + [regex]::Escape($Version) + '", "[^"]*", (\[.*?\])\]\]?,?\r?\n', 'Singleline')
[string[]]$notes = if ($m.Success) { $m.Groups[1].Value | ConvertFrom-Json } else { @() }
if (-not $notes.Count) { Write-Warning "No CHANGELOG entry for ${Version}: latest.json has no notes" }

$out = Join-Path "$root" "release/$Version"; New-Item -ItemType Directory -Force "$out" | Out-Null
$relApk = Join-Path $out "offshore-$Version.apk"; $relJson = Join-Path $out "latest.json"
[IO.File]::WriteAllBytes($relApk, [IO.File]::ReadAllBytes("$apk"))   # plain copy (a network share refuses Copy-Item's attributes)
$sha = (Get-FileHash $relApk -Algorithm SHA256).Hash.ToLower()
$json = ConvertTo-Json -Depth 4 -InputObject ([ordered]@{ version = $Version; notes = $notes; apk = "$site/offshore-$Version.apk"; sha256 = $sha })
[IO.File]::WriteAllText($relJson, $json, (New-Object Text.UTF8Encoding $false))
"Release $Version ready in $out (sha256 $sha)"
if (-not $Upload) { "Upload offshore-$Version.apk and latest.json into the repository's offshore folder, or run again with -Upload."; return }

# ---- Upload to GitHub Pages: only release files, never a key or password ----
if ($onWin) {
    $git = "$env:ProgramFiles\Git\cmd\git.exe"
    if (-not (Test-Path "$git")) { throw "Install Git for Windows first (git-scm.com)" }
    $repo = "$env:USERPROFILE\offshore-site"
} else {
    $g = Get-Command git -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $g) { throw "Install git first (your system's package manager)" }
    $git = $g.Source
    $repo = Join-Path $HOME "offshore-site"
}
if (-not (Test-Path (Join-Path $repo ".git"))) {
    & "$git" clone "https://github.com/offshoreupdates-web/offshoreupdates-web.github.io.git" "$repo"
    if ($LASTEXITCODE) { throw "Couldn't reach the GitHub repository" }
    & "$git" -C "$repo" config user.name "offshoreupdates-web"
    & "$git" -C "$repo" config user.email "offshoreupdates-web@users.noreply.github.com"
}
& "$git" -C "$repo" pull --ff-only | Out-Null
if ($LASTEXITCODE) { throw "Couldn't update $repo from GitHub (git pull failed)" }
New-Item -ItemType Directory -Force (Join-Path $repo "offshore") | Out-Null
Copy-Item $relApk, $relJson (Join-Path $repo "offshore") -Force
# Every file in the site folder must be one of these (paths compared with "/" on every system).
$repoFull = (Get-Item $repo).FullName.TrimEnd('\', '/')
$bad = Get-ChildItem -Recurse -Force -File "$repo" | ForEach-Object { $_.FullName.Substring($repoFull.Length + 1).Replace('\', '/') } |
    Where-Object { $_ -notmatch '^\.git/' } |
    Where-Object { $_ -notmatch '^(offshore/offshore-\d+\.\d+(\.\d+)?\.apk|offshore/latest\.json|offshore/index\.html|index\.html|\.nojekyll|README\.md)$' }
if ($bad) { throw "Not uploading: unexpected files in the site folder: $($bad -join ', ')" }
$z = [IO.Compression.ZipFile]::OpenRead($relApk)
try { $inner = $z.Entries | Where-Object { $_.FullName -match '\.(jks|keystore|p12|pem|pk8)$|pass\.txt|tv\.json$' } | ForEach-Object { $_.FullName } } finally { $z.Dispose() }
if ($inner) { throw "Not uploading: the APK contains $($inner -join ', ')" }
& "$git" -C "$repo" add -A
& "$git" -C "$repo" commit -m "Offshore $Version" | Out-Null
& "$git" -C "$repo" push
if ($LASTEXITCODE) { throw "Upload failed (sign in to GitHub when asked, then run again)" }
"Uploaded. Live in a few minutes at $site/latest.json (GitHub caches it up to 10 minutes)."

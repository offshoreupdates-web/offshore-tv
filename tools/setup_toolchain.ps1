# setup_toolchain.ps1 - download everything needed to build Offshore, from official sources only, checking each file.
#   Windows: powershell -ExecutionPolicy Bypass -File ".\tools\setup_toolchain.ps1"
#   Linux:   pwsh -File ./tools/setup_toolchain.ps1        (PowerShell 7 LTS from github.com/PowerShell/PowerShell)
# Installs into the toolchain folder: tools\ on Windows (ignored by git); on Linux ~/.local/share/offshore-tools
# (or $OFFSHORE_TOOLS), on the computer's own disk, because a thumb drive's exFAT can't hold the symlinks the Linux
# JDK and SDK contain. build.ps1 and publish_release.ps1 look in the same place.
#   jdk\            Eclipse Temurin 17 (Adoptium), checked against Adoptium's SHA-256
#   android-sdk\    Google's command-line tools (checked against Google's repository index), then build-tools 34,
#                   the Android 9 platform and platform-tools through sdkmanager (you accept Google's licences)
#   platform-tools\ a copy of adb for the other scripts
#   libs\           the libraries in tools\libs\README.txt: from Maven Central, checked against its SHA-1, and NewPipe
#                   Extractor and nanojson from JitPack (built from the projects' own release tags), checked against
#                   the SHA-256 written below
#   desugar\        R8 and Java library desugaring from Google's Maven repository, checked against its SHA-1 (lets
#                   NewPipe Extractor's newer Java run on Fire OS)
# Safe to run again: anything already there is skipped.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # the progress bar slows downloads a lot and can stall a terminal that isn't shown
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$onWin = ($PSVersionTable.PSEdition -ne "Core") -or $IsWindows
$exe = if ($onWin) { ".exe" } else { "" }
$tools = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $onWin) { $tools = if ($env:OFFSHORE_TOOLS) { $env:OFFSHORE_TOOLS } else { Join-Path $HOME ".local/share/offshore-tools" } }
New-Item -ItemType Directory -Force $tools | Out-Null
$tmpRoot = if ($env:TEMP) { $env:TEMP } else { [IO.Path]::GetTempPath() }
$dl = Join-Path $tmpRoot "offshore-downloads"; New-Item -ItemType Directory -Force $dl | Out-Null
Write-Host "Toolchain folder: $tools"

function Fetch([string]$url, [string]$file) { Write-Host "  downloading $url"; Invoke-WebRequest -UseBasicParsing $url -OutFile $file }
function Check([string]$file, [string]$algo, [string]$want) {
    $got = (Get-FileHash $file -Algorithm $algo).Hash.ToLower()
    if ($got -ne $want.ToLower()) { Remove-Item $file; throw "$([IO.Path]::GetFileName($file)): $algo mismatch (got $got, expected $want). Stopped." }
}

# 1. JDK 17
if (-not (Test-Path (Join-Path $tools "jdk"))) {
    Write-Host "[1/4] JDK 17 (Eclipse Temurin)"
    $os = if ($onWin) { "windows" } else { "linux" }
    $a = (Invoke-RestMethod "https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jdk&os=$os&vendor=eclipse")[0].binary.package
    $arc = Join-Path $dl $a.name; Fetch $a.link $arc; Check $arc SHA256 $a.checksum
    if ($onWin) { Expand-Archive $arc (Join-Path $tools "jdk") }
    else {
        New-Item -ItemType Directory -Force (Join-Path $tools "jdk") | Out-Null
        & tar -xzf $arc -C (Join-Path $tools "jdk"); if ($LASTEXITCODE) { throw "tar failed on $($a.name)" }
    }
} else { Write-Host "[1/4] JDK already there" }
$env:JAVA_HOME = (Get-ChildItem (Join-Path $tools "jdk") -Directory | Select-Object -First 1).FullName
$java = Join-Path $env:JAVA_HOME "bin/java$exe"

# 2. Android command-line tools
$sdk = Join-Path $tools "android-sdk"; $cl = Join-Path $sdk "cmdline-tools/latest"
if (-not (Test-Path $cl)) {
    Write-Host "[2/4] Android command-line tools"
    $hostOs = if ($onWin) { "windows" } else { "linux" }
    $repo = [xml](Invoke-WebRequest -UseBasicParsing "https://dl.google.com/android/repository/repository2-3.xml").Content
    $pkg = $repo.SelectNodes("//remotePackage") | Where-Object { $_.path -eq "cmdline-tools;latest" } | Select-Object -First 1
    $arc = $pkg.archives.archive | Where-Object { $_.'host-os' -eq $hostOs } | Select-Object -First 1
    $zip = Join-Path $dl $arc.complete.url; Fetch ("https://dl.google.com/android/repository/" + $arc.complete.url) $zip
    Check $zip SHA1 $arc.complete.checksum.'#text'
    $tmp = Join-Path $dl "cmdline"; if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
    Expand-Archive $zip $tmp
    New-Item -ItemType Directory -Force (Split-Path $cl) | Out-Null
    Move-Item (Join-Path $tmp "cmdline-tools") $cl
} else { Write-Host "[2/4] command-line tools already there" }

# 3. Build tools, platform, adb (sdkmanager verifies each package itself). Run through java directly: the .bat
#    launchers break on folder names with spaces.
Write-Host "[3/4] Android build tools, platform and adb (accept Google's licences when asked)"
#    The jars are listed one by one: PowerShell on Linux would expand a "lib/*" wildcard itself before java sees it.
$cp = (Get-ChildItem (Join-Path $cl "lib") -Filter *.jar | ForEach-Object { $_.FullName }) -join [IO.Path]::PathSeparator
$sm = @("-cp", $cp, "com.android.sdklib.tool.sdkmanager.SdkManagerCli", "--sdk_root=$sdk")
& $java @sm --licenses
if ($LASTEXITCODE) { throw "sdkmanager --licenses failed ($LASTEXITCODE)" }
& $java @sm "build-tools;34.0.0" "platforms;android-28" "platform-tools"
if ($LASTEXITCODE) { throw "sdkmanager failed ($LASTEXITCODE)" }
if (-not (Test-Path (Join-Path $tools "platform-tools"))) {
    if ($onWin) { Copy-Item -Recurse (Join-Path $sdk "platform-tools") (Join-Path $tools "platform-tools") }
    else { & cp -a (Join-Path $sdk "platform-tools") (Join-Path $tools "platform-tools") }   # keeps adb executable
}

# 4. Libraries
Write-Host "[4/4] Libraries (Maven Central, JitPack) and desugaring (Google Maven)"
$libs = Join-Path $tools "libs"; New-Item -ItemType Directory -Force $libs | Out-Null
$jars = @("com/hierynomus/smbj/0.14.0/smbj-0.14.0.jar", "com/hierynomus/asn-one/0.6.0/asn-one-0.6.0.jar",
          "net/engio/mbassador/1.3.2/mbassador-1.3.2.jar", "org/bouncycastle/bcprov-jdk18on/1.80/bcprov-jdk18on-1.80.jar",
          "com/emc/ecs/nfs-client/1.1.0/nfs-client-1.1.0.jar", "io/netty/netty/3.10.6.Final/netty-3.10.6.Final.jar",
          "org/apache/commons/commons-lang3/3.12.0/commons-lang3-3.12.0.jar", "org/slf4j/slf4j-api/1.7.36/slf4j-api-1.7.36.jar",
          # YouTube backgrounds: what NewPipe Extractor uses
          "org/mozilla/rhino/1.8.1/rhino-1.8.1.jar", "org/jsoup/jsoup/1.24.1/jsoup-1.24.1.jar",
          "com/google/protobuf/protobuf-javalite/4.36.2/protobuf-javalite-4.36.2.jar", "com/google/code/findbugs/jsr305/3.0.2/jsr305-3.0.2.jar")
function MavenJar([string]$repo, [string]$j, [string]$dir) {
    $file = Join-Path $dir (Split-Path $j -Leaf)
    if (Test-Path $file) { return }
    $base = "$repo/$j"
    Fetch $base $file
    $c = (Invoke-WebRequest -UseBasicParsing "$base.sha1").Content
    if ($c -is [byte[]]) { $c = [Text.Encoding]::ASCII.GetString($c) }           # Google's server sends it as binary
    Check $file SHA1 ([string]$c).Trim().Split(' ')[0]
}
foreach ($j in $jars) { MavenJar "https://repo1.maven.org/maven2" $j $libs }
# NewPipe Extractor is published on JitPack, which builds it from the release tag on github.com/TeamNewPipe (v0.27.1 =
# commit 6ce85c1). JitPack gives no hash for the jar, so its SHA-256 is written here; a different file stops the setup.
$pinned = @{
    "com/github/TeamNewPipe/NewPipeExtractor/v0.27.1/NewPipeExtractor-v0.27.1.jar" = "154fd5efc333d8fdc9cc60abac12d42cd6bf49c8df2f93c5a850fd60c8d7534a"
    "com/github/TeamNewPipe/nanojson/e9d656ddb49a412a5a0a5d5ef20ca7ef09549996/nanojson-e9d656ddb49a412a5a0a5d5ef20ca7ef09549996.jar" = "d495881a322b3c72e5d43284afd7d7021520028ca8b7c6ba861e3fd8d90614d5"
}
foreach ($j in $pinned.Keys) {
    $file = Join-Path $libs (Split-Path $j -Leaf)
    if (Test-Path $file) { continue }
    Fetch "https://jitpack.io/$j" $file
    Check $file SHA256 $pinned[$j]
}
# R8 and the desugared Java library (Google's Maven repository): NewPipe Extractor is written for Java 17, and Fire OS's
# Android 9 and 11 lack some of that; these add the missing parts at build time, the way Android Studio does.
Write-Host "      R8 and Java library desugaring from Google's Maven repository"
$desugar = Join-Path $tools "desugar"; New-Item -ItemType Directory -Force $desugar | Out-Null
foreach ($j in @("com/android/tools/r8/9.5.33/r8-9.5.33.jar", "com/android/tools/desugar_jdk_libs_nio/2.1.5/desugar_jdk_libs_nio-2.1.5.jar",
                 "com/android/tools/desugar_jdk_libs_configuration_nio/2.1.5/desugar_jdk_libs_configuration_nio-2.1.5.jar")) {
    MavenJar "https://dl.google.com/dl/android/maven2" $j $desugar
}
if ($onWin) { Write-Host "`nDone. Build with:  powershell -ExecutionPolicy Bypass -File "".\launcher\android\build.ps1"" -VersionCode 1 -VersionName 0.1" }
else { Write-Host "`nDone. Build with:  pwsh -File ./launcher/android/build.ps1 -VersionCode 1 -VersionName 0.1" }

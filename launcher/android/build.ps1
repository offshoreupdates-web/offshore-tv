# build.ps1 - build the Offshore APK with the portable tools from setup_toolchain.ps1 (no Gradle, no Android Studio).
#   Windows: powershell -ExecutionPolicy Bypass -File ".\launcher\android\build.ps1" -VersionCode 1 -VersionName 0.1
#   Linux:   pwsh -File ./launcher/android/build.ps1 -VersionCode 1 -VersionName 0.1
# First time: tools\setup_toolchain.ps1 downloads the JDK, the Android build tools and the libraries (into tools\ on
# Windows, ~/.local/share/offshore-tools or $OFFSHORE_TOOLS on Linux; -Tools overrides both).
# Output: apks\offshore-<version>.apk (intermediate files go to %LOCALAPPDATA%\offshore-build, or
# ~/.cache/offshore-build on Linux)
# Signing: set OFFSHORE_KEYSTORE / OFFSHORE_KEYSTORE_PASS_FILE (or _PASS) / OFFSHORE_KEY_ALIAS for a release build. Without them
# a throwaway test key (launcher\android\test.keystore, never commit it) is made, fine for your own TV only:
# Android only installs updates signed with the same key, so releases must always use the one release key.
param([int]$VersionCode = 1, [string]$VersionName = "0.1", [string]$Tools = "")

$ErrorActionPreference = "Stop"
$onWin = ($PSVersionTable.PSEdition -ne "Core") -or $IsWindows
$exe = if ($onWin) { ".exe" } else { "" }
$sep = [IO.Path]::PathSeparator                    # between classpath entries: ";" on Windows, ":" on Linux
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent (Split-Path -Parent $here)
$tools = if ($Tools) { $Tools } elseif ($onWin) { Join-Path "$root" "tools" }
         elseif ($env:OFFSHORE_TOOLS) { $env:OFFSHORE_TOOLS } else { Join-Path $HOME ".local/share/offshore-tools" }
if (-not (Test-Path (Join-Path "$tools" "jdk"))) { throw "No toolchain in $tools. Run tools/setup_toolchain.ps1 first." }
$env:JAVA_HOME = (Get-ChildItem (Join-Path "$tools" "jdk") -Directory | Select-Object -First 1).FullName
$env:PATH = (Join-Path $env:JAVA_HOME "bin") + $sep + $env:PATH
$bt = (Get-ChildItem (Join-Path "$tools" "android-sdk/build-tools") -Directory | Select-Object -First 1).FullName
$androidJar = Join-Path (Get-ChildItem (Join-Path "$tools" "android-sdk/platforms") -Directory | Select-Object -First 1).FullName "android.jar"
$aapt2 = Join-Path $bt "aapt2$exe"; $zipalign = Join-Path $bt "zipalign$exe"
$signer = Join-Path $bt "lib/apksigner.jar"
# R8 and the desugared Java library come from Google's Maven repository (setup_toolchain.ps1, step 4): the build-tools
# copy of R8 is too old for NewPipe Extractor's Java 17 code.
$desugar = Join-Path "$tools" "desugar"
$r8jar = Join-Path $desugar "r8-9.5.33.jar"
$dlib = Join-Path $desugar "desugar_jdk_libs_nio-2.1.5.jar"; $dconf = Join-Path $desugar "desugar_jdk_libs_configuration_nio-2.1.5.jar"
if (-not (Test-Path $r8jar) -or -not (Test-Path $dlib) -or -not (Test-Path $dconf)) { throw "R8 or desugaring missing in $desugar. Run tools/setup_toolchain.ps1 again." }
$web = Join-Path "$root" "launcher/web"
$res = Join-Path $here "res"; $manifest = Join-Path $here "AndroidManifest.xml"; $pg = Join-Path $here "proguard.pro"
# Build outside OneDrive (and off the thumb drive): OneDrive locks freshly written files while syncing, which breaks
# clean rebuilds.
$out = if ($onWin) { Join-Path "$env:LOCALAPPDATA" "offshore-build" }
       else { Join-Path $(if ($env:XDG_CACHE_HOME) { $env:XDG_CACHE_HOME } else { Join-Path $HOME ".cache" }) "offshore-build" }
$gen = Join-Path $out "gen"; $classesDir = Join-Path $out "classes"; $dexDir = Join-Path $out "dex"; $assets = Join-Path $out "assets"
$libDexDir = Join-Path $out "libdex"
$outLibs = Join-Path $out "libs"; $unsigned = Join-Path $out "unsigned.apk"; $aligned = Join-Path $out "aligned.apk"
$signed = Join-Path $out "offshore.apk"

function Run($exe, [string[]]$argv) {
    & "$exe" @argv
    if ($LASTEXITCODE -ne 0) { throw "$([IO.Path]::GetFileName($exe)) failed ($LASTEXITCODE)" }
}

Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
if (Test-Path "$out") { Remove-Item -Recurse -Force "$out" }
New-Item -ItemType Directory -Force $gen, $classesDir, $dexDir, $libDexDir, $assets | Out-Null

# Web assets: the page is joined from its parts (launcher\web\src) first; the parts themselves aren't shipped.
$assemble = Join-Path "$root" "tools/assemble_web.ps1"
if ($onWin) { & powershell -ExecutionPolicy Bypass -File $assemble } else { & pwsh -NoProfile -File $assemble }
if ($LASTEXITCODE) { throw "assemble_web.ps1 failed" }
Get-ChildItem "$web" | Where-Object { $_.Name -ne "src" } | ForEach-Object { Copy-Item -Recurse $_.FullName $assets }

Write-Host "[1/6] resources"
Run $aapt2 @("compile", "--dir", $res, "-o", (Join-Path $out "res.zip"))
Run $aapt2 @("link", "-o", $unsigned, "-I", "$androidJar", "--manifest", $manifest,
    "--java", $gen, "--min-sdk-version", "22", "--target-sdk-version", "28",
    "--version-code", "$VersionCode", "--version-name", "$VersionName", (Join-Path $out "res.zip"))

Write-Host "[2/6] compile java"
# Libraries (checked by setup_toolchain.ps1; see tools\libs\README.txt): SMB (smbj), NFS (nfs-client) and encryption
# (Bouncy Castle) for network folders and LocalSend, NewPipe Extractor and what it uses for YouTube backgrounds. Copied
# without META-INF (multi-release duplicates, signatures), which R8 can't take. Rhino's message texts, the only
# resources any of them read, go into the APK as they are.
$libs = Join-Path "$tools" "libs"
New-Item -ItemType Directory -Force $outLibs | Out-Null
$libJars = @(Get-ChildItem (Join-Path $libs "*.jar") | Sort-Object Name | ForEach-Object {
    $dst = Join-Path $outLibs $_.Name
    $src = [IO.Compression.ZipFile]::OpenRead($_.FullName)
    $new = [IO.Compression.ZipFile]::Open($dst, "Create")
    foreach ($e in $src.Entries) {
        if ($e.FullName -notlike "*.class" -or $e.FullName -like "META-INF/*" -or $e.FullName -like "*module-info.class") { continue }
        $w = $new.CreateEntry($e.FullName); $o = $w.Open(); $i = $e.Open(); $i.CopyTo($o); $i.Dispose(); $o.Dispose()
    }
    $new.Dispose(); $src.Dispose()
    $dst
})
$javaRes = @{}
foreach ($j in (Get-ChildItem (Join-Path $libs "rhino-*.jar"))) {
    $z = [IO.Compression.ZipFile]::OpenRead($j.FullName)
    foreach ($e in $z.Entries) {
        if ($e.FullName -like "org/mozilla/javascript/resources/*.properties") {
            $m = New-Object IO.MemoryStream; $i = $e.Open(); $i.CopyTo($m); $i.Dispose(); $javaRes[$e.FullName] = $m.ToArray()
        }
    }
    $z.Dispose()
}
$sources = @(Get-ChildItem -Recurse (Join-Path $here "src"), $gen -Filter *.java | ForEach-Object { $_.FullName })
Run "javac" (@("-nowarn", "-source", "8", "-target", "8", "-bootclasspath", "$androidJar", "-cp", ($libJars -join $sep), "-d", $classesDir, "-encoding", "UTF-8") + $sources)

Write-Host "[3/6] dex (R8: keeps only the library code the app uses, see proguard.pro; L8: the Java library parts Fire OS lacks)"
$classes = @(Get-ChildItem -Recurse $classesDir -Filter *.class | ForEach-Object { $_.FullName })
$dz = [IO.Compression.ZipFile]::OpenRead($dconf)
$djson = Join-Path $out "desugar.json"
$de = $dz.GetEntry("META-INF/desugar/d8/desugar.json"); $ds = $de.Open(); $fs = [IO.File]::Create($djson); $ds.CopyTo($fs); $fs.Dispose(); $ds.Dispose(); $dz.Dispose()
# The class list goes in an argument file: with the libraries it's longer than Windows allows on a command line.
$argFile = Join-Path $out "r8-inputs.txt"
[IO.File]::WriteAllLines($argFile, [string[]]($classes + $libJars))
Run "java" @("-cp", $r8jar, "com.android.tools.r8.R8", "--release", "--min-api", "22", "--lib", "$androidJar", "--pg-conf", $pg,
    "--desugared-lib", $djson, "--output", $dexDir, "@$argFile")
if (-not (Test-Path (Join-Path $dexDir "classes.dex"))) { throw "r8 produced no classes.dex" }
Run "java" @("-cp", $r8jar, "com.android.tools.r8.L8", "--release", "--min-api", "22", "--lib", "$androidJar",
    "--desugared-lib", $djson, "--output", $libDexDir, $dlib, $dconf)

Write-Host "[4/6] package"
$zip = [IO.Compression.ZipFile]::Open($unsigned, "Update")
# The app's dex files (classes.dex, classes2.dex, ...), then the desugared Java library as the next one.
$dexFiles = @(Get-ChildItem $dexDir -Filter "classes*.dex" | Sort-Object { [int]("0" + ($_.BaseName -replace "\D", "")) })
$n = 0
foreach ($d in $dexFiles) { $n++; $name = if ($n -eq 1) { "classes.dex" } else { "classes$n.dex" }; [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $d.FullName, $name) | Out-Null }
$n++; [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $libDexDir "classes.dex"), "classes$n.dex") | Out-Null
foreach ($k in ($javaRes.Keys | Sort-Object)) { $w = $zip.CreateEntry($k).Open(); $w.Write($javaRes[$k], 0, $javaRes[$k].Length); $w.Dispose() }
# Assets are added here, not with aapt2 -A: on Windows aapt2 stores subfolders with backslashes
# ("assets/img\plex.jpg"), so the page can't find img/plex.jpg. Sorted so every computer packs them in the same order.
$assetsFull = (Get-Item $assets).FullName.TrimEnd('\', '/')
Get-ChildItem -Recurse -File $assets | Sort-Object { $_.FullName.Substring($assetsFull.Length + 1).Replace('\', '/') } -CaseSensitive:$false | ForEach-Object {
    $name = "assets/" + $_.FullName.Substring($assetsFull.Length + 1).Replace('\', '/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $name) | Out-Null
}
$zip.Dispose()
Run $zipalign @("-p", "-f", "4", $unsigned, $aligned)

Write-Host "[5/6] sign"
$passArg = $null
if ($env:OFFSHORE_KEYSTORE) {                     # release: your own key, kept outside the project (and in CI secrets)
    $ks = $env:OFFSHORE_KEYSTORE; $pass = $env:OFFSHORE_KEYSTORE_PASS
    $alias = if ($env:OFFSHORE_KEY_ALIAS) { $env:OFFSHORE_KEY_ALIAS } else { "offshore" }
    # OFFSHORE_KEYSTORE_PASS_FILE: a file holding only the password, read by apksigner itself (never on a command line).
    if ($env:OFFSHORE_KEYSTORE_PASS_FILE) { $passArg = "file:" + $env:OFFSHORE_KEYSTORE_PASS_FILE }
    elseif (-not $pass) { throw "Set OFFSHORE_KEYSTORE_PASS_FILE (or OFFSHORE_KEYSTORE_PASS) for the release key" }
    Write-Host "Signed with the release key ($ks)."
} else {                                           # test key: made once, for your own TV only
    $ks = Join-Path "$here" "test.keystore"; $pass = "test-only-key"; $alias = "test"
    if (-not (Test-Path "$ks")) {
        Run "keytool" @("-genkeypair", "-keystore", "$ks", "-storepass", $pass, "-keypass", $pass, "-alias", $alias,
            "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000", "-dname", "CN=Offshore test build")
    }
    Write-Host "Signed with the TEST key (launcher\android\test.keystore). Use a release key for anything you share."
}
# apksigner.bat breaks on paths with spaces (and still exits 0), so run the jar directly.
if (-not $passArg) { $passArg = "pass:$pass" }
# One password for the store and the key: given once (a file is read line by line, so a second read would hit its end).
Run "java" @("-jar", $signer, "sign", "--ks", "$ks", "--ks-pass", $passArg, "--ks-key-alias", $alias,
    "--out", $signed, $aligned)
Run "java" @("-jar", $signer, "verify", "--print-certs", $signed)

Write-Host "[6/6] copy to apks\"
New-Item -ItemType Directory -Force (Join-Path "$root" "apks") | Out-Null
$dest = Join-Path "$root" "apks/offshore-$VersionName.apk"
# A plain byte copy: Copy-Item also copies file attributes, which a network share (SMB through gvfs) refuses.
[IO.File]::WriteAllBytes("$dest", [IO.File]::ReadAllBytes("$signed"))
Write-Host ("Built {0} ({1} KB)" -f "$dest", [int]((Get-Item "$dest").Length / 1KB))

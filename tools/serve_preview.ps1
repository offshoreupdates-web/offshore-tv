# serve_preview.ps1 - preview the home screen in a browser on this computer: http://localhost:8765/
#   Windows: powershell -ExecutionPolicy Bypass -File ".\tools\serve_preview.ps1"    Linux: pwsh -File ./tools/serve_preview.ps1
# Joins the page from its parts first (tools\assemble_web.ps1; run this again after editing a part).
# ?tv=example loads config\example.json; ?music=demo, ?alerts=demo, ?zip=10001 and ?photo=N help test.
param([int]$Port = 8765)

$root = [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)) "launcher\web"))
$configs = Join-Path (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)) "config"
$assemble = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "assemble_web.ps1"
if (($PSVersionTable.PSEdition -ne "Core") -or $IsWindows) { & powershell -ExecutionPolicy Bypass -File $assemble } else { & pwsh -NoProfile -File $assemble }
$inside = $root.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar   # a file must be under launcher\web, not just share its name
$types = @{ ".json" = "application/json"; ".html" = "text/html; charset=utf-8"; ".js" = "text/javascript"; ".css" = "text/css"; ".jpg" = "image/jpeg"; ".png" = "image/png"; ".svg" = "image/svg+xml"; ".txt" = "text/plain" }
$http = New-Object System.Net.HttpListener
$http.Prefixes.Add("http://localhost:$Port/")
$http.Start()
Write-Host "Serving $root on http://localhost:$Port/"
while ($http.IsListening) {
    $ctx = $http.GetContext()
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ($rel -eq "") { $rel = "index.html" }
    $path = [IO.Path]::GetFullPath((Join-Path "$root" $rel))
    $ok = $path.StartsWith($inside)
    # tv/<name>.json -> config\<name>.json (a TV's settings, for ?tv=<name>)
    if ($rel -match '^tv/([^/\\]+)\.json$' -and $Matches[1] -notmatch '\.\.') {
        $path = Join-Path $configs ($Matches[1] + ".json"); $ok = $true
    }
    # proxy?u=<url>: stands in for the app's fetchUrl (sites a page can't read directly), same host list as Home.java.
    if ($rel -eq "proxy") {
        $u = $ctx.Request.QueryString["u"]
        $hosts = "api.exchange.coinbase.com", "api.nasdaq.com", "feeds.npr.org", "feeds.bbci.co.uk", "news.google.com", "www.ndbc.noaa.gov", "data.epa.gov", "api-web.nhle.com", "site.api.espn.com", "itunes.apple.com",
                 "www.pbs.org", "www.whitehouse.gov", "www.war.gov", "www.fbi.gov", "www.justice.gov", "www.cisa.gov", "krebsonsecurity.com", "www.bleepingcomputer.com",
                 "feeds.feedburner.com", "therecord.media", "www.securityweek.com", "feeds.arstechnica.com", "www.theverge.com", "www.wired.com", "www.nasa.gov",
                 "files.airnowtech.org", "transition.fcc.gov"
        try {
            $uri = [Uri]$u
            if ($uri.Scheme -ne "https" -or $hosts -notcontains $uri.Host) { throw "not allowed" }
            $hdr = @{ Accept = "application/json, application/rss+xml, text/xml, */*" }
            if ($uri.Host -eq "transition.fcc.gov") { $hdr["Accept-Encoding"] = "identity" }   # the FCC refuses requests that ask for compression
            $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 20 -UserAgent "Offshore" -Headers $hdr $u
            $bytes = if ($r.Content -is [byte[]]) { $r.Content } else { [Text.Encoding]::UTF8.GetBytes($r.Content) }   # data files come as bytes
            $ctx.Response.ContentType = "text/plain; charset=utf-8"
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } catch { $ctx.Response.StatusCode = 502 }
        $ctx.Response.Close(); continue
    }
    if ($ok -and (Test-Path -LiteralPath "$path" -PathType Leaf)) {
        $bytes = [IO.File]::ReadAllBytes("$path")
        $ct = $types[[IO.Path]::GetExtension("$path").ToLower()]
        if ($ct) { $ctx.Response.ContentType = $ct }
        $ctx.Response.Headers.Add("Cache-Control", "no-store")
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $ctx.Response.StatusCode = 404 }
    $ctx.Response.Close()
}

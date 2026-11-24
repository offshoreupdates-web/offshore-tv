# assemble_web.ps1 - join the interface's parts into the one page the TV loads.
#   powershell -ExecutionPolicy Bypass -File ".\tools\assemble_web.ps1"     (Linux: pwsh -File ./tools/assemble_web.ps1)
# Source: launcher\web\src\shell.html (the page's markup) with @@CSS@@ and @@JS@@ where the parts go, css\*.css and
# js\*.js (joined in file-name order: the numbers set the order). Output: launcher\web\index.html (generated: edit the
# parts, not this file). build.ps1 and serve_preview.ps1 run this first.
# The scripts share one scope on purpose (as one <script>), so a part may use functions defined in a later part.
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$src = Join-Path "$root" "launcher\web\src"
function Parts([string]$dir, [string]$filter) {
    # Each part ends with one line break of its own; blank lines before it belong to the page and stay.
    # Sorted with hyphens ignored, as Windows does, on every system (Linux would otherwise put 24- before 24a).
    (Get-ChildItem (Join-Path $src $dir) -Filter $filter | Sort-Object { $_.Name.Replace("-", "") } | ForEach-Object {
        $s = [IO.File]::ReadAllText($_.FullName, [Text.Encoding]::UTF8).Replace("`r`n", "`n")
        if ($s.EndsWith("`n")) { $s.Substring(0, $s.Length - 1) } else { $s }
    }) -join "`n"
}
$shell = [IO.File]::ReadAllText((Join-Path $src "shell.html"), [Text.Encoding]::UTF8)
$page = $shell.Replace("@@CSS@@", (Parts "css" "*.css")).Replace("@@JS@@", (Parts "js" "*.js"))
[IO.File]::WriteAllText((Join-Path "$root" "launcher\web\index.html"), $page, (New-Object Text.UTF8Encoding $false))
Write-Host ("Assembled launcher\web\index.html ({0} KB)" -f [int]($page.Length / 1KB))

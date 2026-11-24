# make_backgrounds.ps1 - turn source photos into Offshore backgrounds: 1920x1080 crop, readability shading baked in, compressed JPEG.
# The shading used to be a live full-screen CSS layer; baking it into the photos removed every missed frame on the Cube.
#   powershell -ExecutionPolicy Bypass -File ".\tools\make_backgrounds.ps1" [-Source ".\launcher\backgrounds\ocean"] [-Quality 82]
# Every .jpg/.png in -Source becomes launcher\web\img\<same name>.jpg. The page cycles through the files listed in launcher\web\src\js\05-photos.js.
# 1920x1080 is exact: Fire TVs draw apps at 1920x1080 even on 4K TVs (the TV/HDMI upscales the whole UI).
# Quality 82: lower values band visibly in sunset skies.
param(
    [string]$Source = (Join-Path (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)) "launcher\backgrounds\ocean"),
    [int]$Quality = 82
)
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$out = Join-Path "$root" "launcher\web\img"
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$Quality)

# Same gradients the page used (".scrim"): bottom, left, right edges and top.
function Shade($g, [int]$x1, [int]$y1, [int]$x2, [int]$y2, [double[]]$stops, [double[]]$alphas) {
    $b = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point $x1, $y1), (New-Object System.Drawing.Point $x2, $y2), ([System.Drawing.Color]::Black), ([System.Drawing.Color]::Black)
    $cb = New-Object System.Drawing.Drawing2D.ColorBlend $stops.Count
    $cb.Positions = [single[]]$stops
    $cb.Colors = [System.Drawing.Color[]]($alphas | ForEach-Object { [System.Drawing.Color]::FromArgb([int](255 * $_), 0, 0, 0) })
    $b.InterpolationColors = $cb
    $g.FillRectangle($b, 0, 0, 1920, 1080)
    $b.Dispose()
}

Get-ChildItem "$Source\*" -Include *.jpg, *.jpeg, *.png | ForEach-Object {
    $im = [System.Drawing.Image]::FromFile($_.FullName)
    $s = [math]::Max(1920 / $im.Width, 1080 / $im.Height); $w = [int][math]::Ceiling($im.Width * $s); $h = [int][math]::Ceiling($im.Height * $s)
    $bmp = New-Object System.Drawing.Bitmap 1920, 1080
    $g = [System.Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode = 'HighQualityBicubic'
    $g.DrawImage($im, [int]((1920 - $w) / 2), [int]((1080 - $h) / 2), $w, $h)
    # Lighter than the first set so the water shows; still enough behind the title, tiles and clock.
    Shade $g 0 1081 0 -1 @(0, .22, .45, .62, 1) @(.66, .38, .10, 0, 0)     # from the bottom (buttons and hints)
    Shade $g -1 0 1921 0 @(0, .40, .70, 1) @(.42, .20, 0, 0)               # from the left (behind the title)
    Shade $g 1921 0 -1 0 @(0, .28, 1) @(.30, 0, 0)                          # from the right (behind the clock)
    Shade $g 0 -1 0 1081 @(0, .20, 1) @(.22, 0, 0)                          # from the top
    $dest = Join-Path "$out" ($_.BaseName + ".jpg")
    $bmp.Save($dest, $enc, $ep); $g.Dispose(); $bmp.Dispose(); $im.Dispose()
    "{0,-14} {1,4} KB" -f ($_.BaseName + ".jpg"), [int]((Get-Item $dest).Length / 1KB)
}

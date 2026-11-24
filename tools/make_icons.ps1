# make_icons.ps1 - draw the app's Fire TV banner (320x180) and icon (192x192): a dusk sea, a low sun resting on a calm
# horizon with long smooth swells below it (what an offshore wind does to the sea), and the wordmark.
# Writes launcher\android\res\drawable-xhdpi\banner.png and icon.png.
#   powershell -ExecutionPolicy Bypass -File ".\tools\make_icons.ps1"
param([string]$Root = (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)))
Add-Type -AssemblyName System.Drawing
$out = Join-Path "$Root" "launcher\android\res\drawable-xhdpi"

function Rgb([int]$a, [int]$r, [int]$g, [int]$b) { [System.Drawing.Color]::FromArgb($a, $r, $g, $b) }
function NewCanvas([int]$w, [int]$h) {
    $bmp = New-Object System.Drawing.Bitmap $w, $h; $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = "AntiAlias"; $g.TextRenderingHint = "AntiAliasGridFit"; $g.InterpolationMode = "HighQualityBicubic"
    $g.PixelOffsetMode = "HighQuality"
    return $bmp, $g
}

# Sky above the horizon (deep blue into a warm haze), sea below it (dark teal), the sun half set, its glow and a soft
# path of light on the water, then a few thin swell lines that get shorter and fainter towards the viewer.
function Scene($g, [int]$w, [int]$h, [float]$hy, [float]$sx, [float]$sr) {
    $sky = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.PointF 0, 0), (New-Object System.Drawing.PointF 0, ($hy + 1)), (Rgb 255 14 30 54), (Rgb 255 196 120 98)
    $blend = New-Object System.Drawing.Drawing2D.ColorBlend 3
    $blend.Colors = @((Rgb 255 12 26 48), (Rgb 255 52 62 96), (Rgb 255 214 134 104)); $blend.Positions = @(0.0, 0.55, 1.0)
    $sky.InterpolationColors = $blend
    $g.FillRectangle($sky, 0, 0, $w, $hy); $sky.Dispose()
    $sea = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.PointF 0, $hy), (New-Object System.Drawing.PointF 0, $h), (Rgb 255 26 70 88), (Rgb 255 8 22 36)
    $g.FillRectangle($sea, 0, $hy, $w, $h - $hy); $sea.Dispose()

    $glow = New-Object System.Drawing.Drawing2D.GraphicsPath; $gr = $sr * 3.2
    $glow.AddEllipse($sx - $gr, $hy - $gr, $gr * 2, $gr * 2)
    $pb = New-Object System.Drawing.Drawing2D.PathGradientBrush $glow
    $pb.CenterColor = Rgb 120 255 200 140; $pb.SurroundColors = @((Rgb 0 255 200 140))
    $st = $g.Save(); $g.IntersectClip((New-Object System.Drawing.RectangleF 0, 0, $w, $hy)); $g.FillPath($pb, $glow); $g.Restore($st)
    $pb.Dispose(); $glow.Dispose()

    $sun = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.PointF 0, ($hy - $sr)), (New-Object System.Drawing.PointF 0, $hy), (Rgb 255 255 236 196), (Rgb 255 255 178 112)
    $st = $g.Save(); $g.IntersectClip((New-Object System.Drawing.RectangleF 0, 0, $w, $hy)); $g.FillEllipse($sun, $sx - $sr, $hy - $sr, $sr * 2, $sr * 2); $g.Restore($st)
    $sun.Dispose()

    # Light on the water: narrow at the horizon, widening and fading towards the viewer.
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddPolygon(@((New-Object System.Drawing.PointF ($sx - $sr * 0.9), $hy), (New-Object System.Drawing.PointF ($sx + $sr * 0.9), $hy),
                       (New-Object System.Drawing.PointF ($sx + $sr * 1.6), $h), (New-Object System.Drawing.PointF ($sx - $sr * 1.6), $h)))
    $lb = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.PointF 0, $hy), (New-Object System.Drawing.PointF 0, $h), (Rgb 90 255 196 140), (Rgb 0 255 196 140)
    $g.FillPath($lb, $path); $lb.Dispose(); $path.Dispose()

    # Horizon, then the swells.
    $hp = New-Object System.Drawing.Pen (Rgb 150 255 226 190), ([float]([Math]::Max(1.0, $h / 160.0)))
    $g.DrawLine($hp, 0, $hy, $w, $hy); $hp.Dispose()
    $gap = ($h - $hy) / 4.2
    for ($i = 1; $i -le 3; $i++) {
        $y = $hy + $gap * $i; $half = $w * (0.36 - 0.07 * $i); $alpha = 120 - 28 * $i
        $p = New-Object System.Drawing.Pen (Rgb $alpha 230 240 245), ([float]([Math]::Max(1.0, $h / 120.0)))
        $p.StartCap = "Round"; $p.EndCap = "Round"
        $g.DrawLine($p, $sx - $half, $y, $sx + $half, $y); $p.Dispose()
    }
}

# Banner: the scene with the sun off to the right, the wordmark on the left over the sky.
$bmp, $g = NewCanvas 320 180
Scene $g 320 180 112 240 26
$font = New-Object System.Drawing.Font "Segoe UI Semibold", 38, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$tf = [System.Drawing.StringFormat]::GenericTypographic
$h = $font.GetHeight($g)
$shadow = New-Object System.Drawing.SolidBrush (Rgb 70 0 0 0)
$g.DrawString("offshore", $font, $shadow, (New-Object System.Drawing.PointF 23, (112 - $h - 3 + 1.5)), $tf); $shadow.Dispose()
$g.DrawString("offshore", $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.PointF 22, (112 - $h - 3)), $tf)
$bmp.Save((Join-Path $out "banner.png"), [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()

# Icon: rounded square, the scene alone with the sun centred.
$bmp, $g = NewCanvas 192 192
$g.Clear([System.Drawing.Color]::Transparent)
$path = New-Object System.Drawing.Drawing2D.GraphicsPath; $rr = 44
$path.AddArc(0, 0, $rr, $rr, 180, 90); $path.AddArc(192 - $rr, 0, $rr, $rr, 270, 90); $path.AddArc(192 - $rr, 192 - $rr, $rr, $rr, 0, 90); $path.AddArc(0, 192 - $rr, $rr, $rr, 90, 90); $path.CloseFigure()
$g.SetClip($path); Scene $g 192 192 108 96 40; $g.ResetClip()
$bmp.Save((Join-Path $out "icon.png"), [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
"banner.png and icon.png written to $out"

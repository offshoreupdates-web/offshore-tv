# make_sounds.ps1 - synthesize the built-in sound sets and notification sounds (made for this app: no samples, no
# licences). Writes 16-bit mono 44.1 kHz WAVs to launcher\android\res\raw\.
#   powershell -ExecutionPolicy Bypass -File ".\tools\make_sounds.ps1"
# Sets: crisp_*, glass_*, wood_* (move / select / back). "Soft" is the original ui_*.wav set.
# Notifications: notif_chime, notif_glass, notif_bell.
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$out = Join-Path "$root" "launcher\android\res\raw"
$rate = 44100

# A partial: frequency (Hz), level, decay time constant (s), start (s).
function Render([object[]]$partials, [double]$seconds, [double]$noise = 0, [double]$noiseDecay = 0.01) {
    $n = [int]($seconds * $rate); $buf = New-Object double[] $n; $rnd = New-Object System.Random 7
    foreach ($p in $partials) {
        $f = $p[0]; $a = $p[1]; $tau = $p[2]; $t0 = [int]($p[3] * $rate)
        for ($i = $t0; $i -lt $n; $i++) {
            $t = ($i - $t0) / $rate
            $env = [Math]::Exp(-$t / $tau) * [Math]::Min(1, $t / 0.0015)          # 1.5 ms attack: no click
            $buf[$i] += $a * $env * [Math]::Sin(2 * [Math]::PI * $f * $t)
        }
    }
    if ($noise -gt 0) { for ($i = 0; $i -lt $n; $i++) { $t = $i / $rate; $buf[$i] += $noise * [Math]::Exp(-$t / $noiseDecay) * ($rnd.NextDouble() * 2 - 1) } }
    $peak = ($buf | Measure-Object -Maximum -Minimum); $m = [Math]::Max([Math]::Abs($peak.Maximum), [Math]::Abs($peak.Minimum))
    if ($m -gt 0) { for ($i = 0; $i -lt $n; $i++) { $buf[$i] = $buf[$i] / $m * 0.5 } }   # same loudness for every sound
    $fade = [int](0.01 * $rate); for ($i = 0; $i -lt $fade; $i++) { $buf[$n - 1 - $i] *= $i / $fade }
    return ,$buf
}
function Save([string]$name, [double[]]$buf) {
    $path = Join-Path $out "$name.wav"; $data = New-Object byte[] ($buf.Length * 2)
    for ($i = 0; $i -lt $buf.Length; $i++) { $s = [int16][Math]::Max(-32767, [Math]::Min(32767, [Math]::Round($buf[$i] * 32767))); $b = [BitConverter]::GetBytes($s); $data[2 * $i] = $b[0]; $data[2 * $i + 1] = $b[1] }
    $fs = [IO.File]::Create($path); $w = New-Object IO.BinaryWriter $fs
    $w.Write([Text.Encoding]::ASCII.GetBytes("RIFF")); $w.Write([int](36 + $data.Length)); $w.Write([Text.Encoding]::ASCII.GetBytes("WAVEfmt "))
    $w.Write([int]16); $w.Write([int16]1); $w.Write([int16]1); $w.Write([int]$rate); $w.Write([int]($rate * 2)); $w.Write([int16]2); $w.Write([int16]16)
    $w.Write([Text.Encoding]::ASCII.GetBytes("data")); $w.Write([int]$data.Length); $w.Write($data); $w.Close()
    "{0,-16} {1,5} ms" -f "$name.wav", [int]($buf.Length * 1000 / $rate)
}
# Glass: inharmonic partials (1, 2.76, 5.40), like a struck glass.
function Glass([double]$f, [double]$tau, [double]$t0 = 0) { @(@($f, 1.0, $tau, $t0), @(($f * 2.76), 0.45, ($tau * 0.6), $t0), @(($f * 5.40), 0.2, ($tau * 0.35), $t0)) }
# Bell: partials of a small bell (0.5 hum, 1, 1.2 minor third, 1.5, 2, 2.6).
function Bell([double]$f, [double]$tau, [double]$t0 = 0) { @(@(($f * 0.5), 0.35, ($tau * 1.4), $t0), @($f, 1.0, $tau, $t0), @(($f * 1.2), 0.5, ($tau * 0.8), $t0), @(($f * 1.5), 0.35, ($tau * 0.6), $t0), @(($f * 2.0), 0.3, ($tau * 0.5), $t0), @(($f * 2.6), 0.15, ($tau * 0.3), $t0)) }

# Crisp: short, bright sine ticks and a two-note select.
Save "crisp_move"   (Render @(,@(3200, 1, 0.006, 0)) 0.05)
Save "crisp_select" (Render @(@(1568, 1, 0.05, 0), @(2093, 1, 0.07, 0.05)) 0.3)
Save "crisp_back"   (Render @(@(2093, 1, 0.05, 0), @(1568, 1, 0.07, 0.05)) 0.3)
# Glass: soft glassy taps.
Save "glass_move"   (Render (Glass 2400 0.02) 0.09)
Save "glass_select" (Render ((Glass 1760 0.12) + (Glass 2637 0.15 0.06)) 0.5)
Save "glass_back"   (Render ((Glass 2637 0.10) + (Glass 1760 0.13 0.06)) 0.45)
# Wood: woodblock knocks (damped tone + a little noise).
Save "wood_move"    (Render @(@(1100, 1, 0.012, 0), @(2300, 0.3, 0.006, 0)) 0.06 0.25 0.003)
Save "wood_select"  (Render @(@(740, 1, 0.03, 0), @(1480, 0.25, 0.012, 0), @(1100, 1, 0.035, 0.07), @(2200, 0.25, 0.012, 0.07)) 0.25 0.2 0.003)
Save "wood_back"    (Render @(@(1100, 1, 0.03, 0), @(2200, 0.25, 0.012, 0), @(740, 1, 0.035, 0.07), @(1480, 0.25, 0.012, 0.07)) 0.25 0.2 0.003)
# Notifications.
Save "notif_chime"  (Render @(@(1047, 1, 0.35, 0), @(1319, 0.9, 0.4, 0.11), @(1568, 0.85, 0.6, 0.22), @(2093, 0.3, 0.5, 0.22)) 1.4)
Save "notif_glass"  (Render ((Glass 1976 0.35) + (Glass 2960 0.45 0.16)) 1.3)
Save "notif_bell"   (Render (Bell 880 0.7) 2.0)

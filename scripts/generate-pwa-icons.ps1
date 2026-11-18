# Generates PWA icons for BitVault: an MP3 player.
# Run from the repository root:  powershell -ExecutionPolicy Bypass -File scripts\generate-pwa-icons.ps1
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$iconsDir = Join-Path $root 'public\icons'
New-Item -ItemType Directory -Force $iconsDir | Out-Null

$bg = [System.Drawing.ColorTranslator]::FromHtml('#0A0A0D')
$door = [System.Drawing.ColorTranslator]::FromHtml('#17171E')
$accent = [System.Drawing.ColorTranslator]::FromHtml('#C8863A')
$accentDim = [System.Drawing.ColorTranslator]::FromHtml('#C97712')

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

# MP3-player icon: gradient body with a screen (track info + progress), click wheel and button.
# $s = canvas size, $f = device height as a fraction of the canvas (smaller for maskable).
function Draw-Vault($g, [float]$s, [float]$f) {
  $B = $s * $f
  $cx = $s / 2
  $cy = $s / 2

  $w = $B * 0.62
  $x0 = $cx - $w / 2
  $y0 = $cy - $B / 2

  # Body with a soft vertical gradient.
  $top = [System.Drawing.ColorTranslator]::FromHtml('#D9A05A')
  $bottom = [System.Drawing.ColorTranslator]::FromHtml('#B97A34')
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.PointF($cx, $y0)), (New-Object System.Drawing.PointF($cx, ($y0 + $B))), $top, $bottom)
  $bp = New-RoundedPath $x0 $y0 $w $B ($B * 0.12)
  $g.FillPath($grad, $bp)
  $bp.Dispose()
  $grad.Dispose()

  # Screen.
  $cut = New-Object System.Drawing.SolidBrush($bg)
  $sx = $x0 + $w * 0.11
  $sy = $y0 + $B * 0.08
  $sW = $w * 0.78
  $sH = $B * 0.30
  $sp = New-RoundedPath $sx $sy $sW $sH ($B * 0.03)
  $g.FillPath($cut, $sp)
  $sp.Dispose()

  # Screen content: title, subtitle, progress bar with a head.
  $pad = $sW * 0.12
  $lineH = $B * 0.022
  $titleBrush = New-Object System.Drawing.SolidBrush($accent)
  $dimBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#5E4426'))
  $lp = New-RoundedPath ($sx + $pad) ($sy + $sH * 0.22) ($sW * 0.56) $lineH ($lineH / 2)
  $g.FillPath($titleBrush, $lp); $lp.Dispose()
  $lp = New-RoundedPath ($sx + $pad) ($sy + $sH * 0.40) ($sW * 0.36) $lineH ($lineH / 2)
  $g.FillPath($dimBrush, $lp); $lp.Dispose()
  $trackW = $sW - 2 * $pad
  $ty = $sy + $sH * 0.74
  $lp = New-RoundedPath ($sx + $pad) $ty $trackW $lineH ($lineH / 2)
  $g.FillPath($dimBrush, $lp); $lp.Dispose()
  $lp = New-RoundedPath ($sx + $pad) $ty ($trackW * 0.45) $lineH ($lineH / 2)
  $g.FillPath($titleBrush, $lp); $lp.Dispose()
  $hr = $lineH * 1.1
  $g.FillEllipse($titleBrush, $sx + $pad + $trackW * 0.45 - $hr, $ty + $lineH / 2 - $hr, 2 * $hr, 2 * $hr)
  $titleBrush.Dispose()
  $dimBrush.Dispose()

  # Click wheel ring and four tiny buttons: menu, previous, next, play/pause.
  $wy = $y0 + $B * 0.69
  $wr = $B * 0.20
  $pen = New-Object System.Drawing.Pen($bg, [float]($B * 0.02))
  $g.DrawEllipse($pen, $cx - $wr, $wy - $wr, 2 * $wr, 2 * $wr)
  $pen.Dispose()
  $mo = $B * 0.142
  $u = $B * 0.022
  function Poly($pts) {
    $arr = New-Object 'System.Drawing.PointF[]' $pts.Count
    for ($i = 0; $i -lt $pts.Count; $i++) { $arr[$i] = New-Object System.Drawing.PointF([float]$pts[$i][0], [float]$pts[$i][1]) }
    $g.FillPolygon($cut, $arr)
  }
  # Menu (top): two bars.
  $px = $cx; $py = $wy - $mo
  $g.FillRectangle($cut, $px - $u, $py - 0.75 * $u, 2 * $u, 0.4 * $u)
  $g.FillRectangle($cut, $px - $u, $py + 0.35 * $u, 2 * $u, 0.4 * $u)
  # Previous (left): bar + triangle.
  $px = $cx - $mo; $py = $wy
  $g.FillRectangle($cut, $px - $u, $py - $u, 0.35 * $u, 2 * $u)
  Poly @(@(($px + $u), ($py - $u)), @(($px + $u), ($py + $u)), @(($px - 0.55 * $u), $py))
  # Next (right): triangle + bar.
  $px = $cx + $mo; $py = $wy
  $g.FillRectangle($cut, $px + 0.65 * $u, $py - $u, 0.35 * $u, 2 * $u)
  Poly @(@(($px - $u), ($py - $u)), @(($px - $u), ($py + $u)), @(($px + 0.55 * $u), $py))
  # Play/pause (bottom): triangle + two bars.
  $px = $cx; $py = $wy + $mo
  Poly @(@(($px - 1.3 * $u), ($py - 0.9 * $u)), @(($px - 1.3 * $u), ($py + 0.9 * $u)), @(($px - 0.1 * $u), $py))
  $g.FillRectangle($cut, $px + 0.35 * $u, $py - 0.9 * $u, 0.4 * $u, 1.8 * $u)
  $g.FillRectangle($cut, $px + 1.0 * $u, $py - 0.9 * $u, 0.4 * $u, 1.8 * $u)
  $br = $B * 0.07
  $g.FillEllipse($cut, $cx - $br, $wy - $br, 2 * $br, 2 * $br)
  $cut.Dispose()
}

function New-Icon([int]$size, [float]$frac, [string]$file, [float]$round = 0) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  if ($round -gt 0) {
    # Rounded tile with transparent corners (regular icons only).
    $g.Clear([System.Drawing.Color]::Transparent)
    $tile = New-RoundedPath 0 0 $size $size ($size * $round)
    $tileBrush = New-Object System.Drawing.SolidBrush($bg)
    $g.FillPath($tileBrush, $tile)
    $tileBrush.Dispose()
    $tile.Dispose()
  } else {
    $g.Clear($bg)
  }
  Draw-Vault $g $size $frac
  $g.Dispose()
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

# Regular icons: vault takes ~78% of the canvas.
New-Icon 192 0.72 (Join-Path $iconsDir 'icon-192.png') 0.28
New-Icon 512 0.72 (Join-Path $iconsDir 'icon-512.png') 0.28

# Maskable icons: content stays inside the 80% safe circle.
New-Icon 192 0.56 (Join-Path $iconsDir 'maskable-192.png')
New-Icon 512 0.56 (Join-Path $iconsDir 'maskable-512.png')

# Apple touch icon: 180x180, opaque square (iOS applies its own rounding).
New-Icon 180 0.70 (Join-Path $root 'public\apple-touch-icon.png')

Write-Output 'Icons generated:'
Get-ChildItem $iconsDir | ForEach-Object { "  icons/$($_.Name) $($_.Length) bytes" }
Get-ChildItem (Join-Path $root 'public\apple-touch-icon.png') | ForEach-Object { "  $($_.Name) $($_.Length) bytes" }

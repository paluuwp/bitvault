# Generates PWA icons for BitVault: dark background with orange equalizer bars.
# Run once from the repository root:  powershell -ExecutionPolicy Bypass -File scripts\generate-pwa-icons.ps1
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$iconsDir = Join-Path $root 'public\icons'
New-Item -ItemType Directory -Force $iconsDir | Out-Null

$bg = [System.Drawing.ColorTranslator]::FromHtml('#0A0A0D')
$accent = [System.Drawing.ColorTranslator]::FromHtml('#F7931E')
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

function New-Icon([int]$size, [float]$markWidth, [string]$file) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear($bg)

  # Four bars, heights tuned to read as an equalizer.
  $barWidth = $markWidth * 0.17
  $gap = $markWidth * 0.11
  $heights = @(0.62, 0.94, 0.76, 0.48)
  $colors = @($accent, $accent, $accentDim, $accent)
  $total = 4 * $barWidth + 3 * $gap
  $startX = ($size - $total) / 2
  $centerY = $size / 2

  for ($i = 0; $i -lt 4; $i++) {
    $h = $markWidth * $heights[$i]
    $x = $startX + $i * ($barWidth + $gap)
    $y = $centerY - $h / 2
    $brush = New-Object System.Drawing.SolidBrush($colors[$i])
    $path = New-RoundedPath $x $y $barWidth $h ($barWidth / 2)
    $g.FillPath($brush, $path)
    $path.Dispose()
    $brush.Dispose()
  }

  $g.Dispose()
  $bmp.Save((Join-Path $iconsDir $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

# Regular icons: mark takes ~58% of the canvas.
New-Icon 192 111 'icon-192.png'
New-Icon 512 296 'icon-512.png'

# Maskable icons: content stays inside the 80% safe circle.
New-Icon 192 95 'maskable-192.png'
New-Icon 512 260 'maskable-512.png'

# Apple touch icon: 180x180, opaque square (iOS applies its own rounding).
$apple = New-Object System.Drawing.Bitmap(180, 180)
$appleGraphics = [System.Drawing.Graphics]::FromImage($apple)
$appleGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$appleGraphics.Clear($bg)
$markWidth = 104
$barWidth = $markWidth * 0.17
$gap = $markWidth * 0.11
$heights = @(0.62, 0.94, 0.76, 0.48)
$colors = @($accent, $accent, $accentDim, $accent)
$total = 4 * $barWidth + 3 * $gap
$startX = (180 - $total) / 2
$centerY = 90
for ($i = 0; $i -lt 4; $i++) {
  $h = $markWidth * $heights[$i]
  $x = $startX + $i * ($barWidth + $gap)
  $y = $centerY - $h / 2
  $brush = New-Object System.Drawing.SolidBrush($colors[$i])
  $path = New-RoundedPath $x $y $barWidth $h ($barWidth / 2)
  $appleGraphics.FillPath($brush, $path)
  $path.Dispose()
  $brush.Dispose()
}
$appleGraphics.Dispose()
$apple.Save((Join-Path $root 'public\apple-touch-icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$apple.Dispose()

Write-Output 'Icons generated:'
Get-ChildItem $iconsDir | ForEach-Object { "  icons/$($_.Name) $($_.Length) bytes" }
Get-ChildItem (Join-Path $root 'public\apple-touch-icon.png') | ForEach-Object { "  $($_.Name) $($_.Length) bytes" }

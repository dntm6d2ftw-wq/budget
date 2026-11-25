# Rendert die PNG-App-Icons aus derselben Geometrie wie icon.svg (512er-Raster).
# Aufruf:  powershell -ExecutionPolicy Bypass -File .\tools\render-icons.ps1
# Erzeugt im Projektordner: icon-180.png, icon-192.png, icon-512.png, icon-maskable-512.png

Add-Type -AssemblyName System.Drawing
$out = Split-Path $PSScriptRoot -Parent

function New-RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}
function Get-Color([string]$hex, [int]$alpha = 255) {
  $c = [System.Drawing.ColorTranslator]::FromHtml($hex)
  return [System.Drawing.Color]::FromArgb($alpha, $c.R, $c.G, $c.B)
}

function Save-Icon([int]$size, [string]$file, [float]$contentScale = 1.0) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.PixelOffsetMode = 'HighQuality'
  $g.ScaleTransform($size / 512, $size / 512)

  # Hintergrund-Verlauf (vollflächig, ohne Transparenz – Pflicht für iOS)
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.PointF(0, 0)), (New-Object System.Drawing.PointF(360, 660)),
    (Get-Color '#4C9DFF'), (Get-Color '#0A57D6'))
  $g.FillRectangle($bg, 0, 0, 512, 512)

  # Inhalt ggf. verkleinern (maskable: Motiv in der sicheren Zone halten)
  $g.TranslateTransform(256, 260)
  $g.ScaleTransform($contentScale, $contentScale)
  $g.TranslateTransform(-256, -260)

  $white = Get-Color '#FFFFFF'
  $g.FillPath((New-Object System.Drawing.SolidBrush (Get-Color '#FFFFFF' 115)), (New-RoundRect 140 112 232 150 24))
  $g.FillPath((New-Object System.Drawing.SolidBrush (Get-Color '#FFFFFF' 184)), (New-RoundRect 118 146 276 150 26))
  $g.FillPath((New-Object System.Drawing.SolidBrush $white), (New-RoundRect 92 194 328 214 44))
  $g.FillPath((New-Object System.Drawing.SolidBrush (Get-Color '#DDE9FF')), (New-RoundRect 300 262 120 80 40))
  $g.FillEllipse((New-Object System.Drawing.SolidBrush (Get-Color '#1A6CF0')), 327, 287, 30, 30)

  $bmp.Save((Join-Path $out $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "  $file ($size x $size)"
}

Write-Host "Rendere Icons nach $out"
Save-Icon 180 'icon-180.png'
Save-Icon 192 'icon-192.png'
Save-Icon 512 'icon-512.png'
Save-Icon 512 'icon-maskable-512.png' 0.78

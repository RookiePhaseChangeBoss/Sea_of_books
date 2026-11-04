Add-Type -AssemblyName System.Drawing

function Save-Mark([int]$Size, [string]$File) {
  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::FromArgb(255, 20, 17, 15))
  $penWidth = [Math]::Max(1.0, $Size / 28.0)
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 224, 163, 106)), $penWidth
  $inset = [single]($Size * 0.18)
  $graphics.DrawRectangle($pen, $inset, $inset, ($Size - 2 * $inset), ($Size - 2 * $inset))
  $font = New-Object System.Drawing.Font('Georgia', [single]($Size * 0.46), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 224, 163, 106))
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $bounds = New-Object System.Drawing.RectangleF 0, 0, $Size, $Size
  $graphics.DrawString('C', $font, $brush, $bounds, $format)
  $directory = Split-Path -Parent $File
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
  $bitmap.Save($File, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

$build = Join-Path (Split-Path -Parent $PSScriptRoot) 'build'
Save-Mark 16 (Join-Path $build 'icon-16.png')
Save-Mark 32 (Join-Path $build 'icon-32.png')
Save-Mark 48 (Join-Path $build 'icon-48.png')
Save-Mark 256 (Join-Path $build 'icon-256.png')
Copy-Item (Join-Path $build 'icon-256.png') (Join-Path $build 'icon.png') -Force

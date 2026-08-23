param()

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$androidRes = Join-Path $projectRoot 'android\app\src\main\res'

function New-RoundedPath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $diameter = $radius * 2
    $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
    $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
    $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

function Draw-Ledger([System.Drawing.Graphics]$graphics, [float]$x, [float]$y, [float]$size) {
    $dark = [System.Drawing.ColorTranslator]::FromHtml('#2F3542')
    $white = [System.Drawing.Color]::White
    $yellow = [System.Drawing.ColorTranslator]::FromHtml('#FFD24A')

    $book = New-RoundedPath ($x + $size * .19) ($y + $size * .12) ($size * .62) ($size * .76) ($size * .09)
    $darkBrush = [System.Drawing.SolidBrush]::new($dark)
    $graphics.FillPath($darkBrush, $book)

    $page = New-RoundedPath ($x + $size * .31) ($y + $size * .21) ($size * .39) ($size * .56) ($size * .045)
    $whiteBrush = [System.Drawing.SolidBrush]::new($white)
    $graphics.FillPath($whiteBrush, $page)

    $bindingBrush = [System.Drawing.SolidBrush]::new($yellow)
    $binding = New-RoundedPath ($x + $size * .22) ($y + $size * .2) ($size * .07) ($size * .58) ($size * .025)
    $graphics.FillPath($bindingBrush, $binding)

    $pen = [System.Drawing.Pen]::new($dark, [Math]::Max(2, $size * .045))
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawLine($pen, $x + $size * .39, $y + $size * .38, $x + $size * .62, $y + $size * .38)
    $graphics.DrawLine($pen, $x + $size * .39, $y + $size * .5, $x + $size * .62, $y + $size * .5)
    $graphics.DrawLine($pen, $x + $size * .39, $y + $size * .62, $x + $size * .56, $y + $size * .62)

    $pen.Dispose()
    $binding.Dispose()
    $bindingBrush.Dispose()
    $page.Dispose()
    $whiteBrush.Dispose()
    $book.Dispose()
    $darkBrush.Dispose()
}

function Save-Icon([string]$path, [int]$width, [int]$height, [ValidateSet('full','foreground','splash')]$kind) {
    $bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    if ($kind -eq 'splash') {
        $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#F4F5F8'))
        $logoSize = [Math]::Min($width, $height) * .24
        $logoX = ($width - $logoSize) / 2
        $logoY = ($height - $logoSize) / 2
        $tile = New-RoundedPath $logoX $logoY $logoSize $logoSize ($logoSize * .22)
        $tileBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#FFD24A'))
        $graphics.FillPath($tileBrush, $tile)
        Draw-Ledger $graphics $logoX $logoY $logoSize
        $tileBrush.Dispose()
        $tile.Dispose()
    } elseif ($kind -eq 'foreground') {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $logoSize = [Math]::Min($width, $height) * .70
        Draw-Ledger $graphics (($width - $logoSize) / 2) (($height - $logoSize) / 2) $logoSize
    } else {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $size = [Math]::Min($width, $height)
        $tile = New-RoundedPath 0 0 $width $height ($size * .22)
        $tileBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#FFD24A'))
        $graphics.FillPath($tileBrush, $tile)
        Draw-Ledger $graphics 0 0 $size
        $tileBrush.Dispose()
        $tile.Dispose()
    }

    $directory = Split-Path $path -Parent
    if (-not (Test-Path $directory)) { New-Item -ItemType Directory -Path $directory | Out-Null }
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
}

Save-Icon (Join-Path $projectRoot 'icons\icon-512.png') 512 512 full
Save-Icon (Join-Path $projectRoot 'icons\icon-192.png') 192 192 full
Save-Icon (Join-Path $projectRoot 'icons\apple-touch-icon.png') 180 180 full

$densities = @{
    'mdpi' = @{ Legacy = 48; Foreground = 108 }
    'hdpi' = @{ Legacy = 72; Foreground = 162 }
    'xhdpi' = @{ Legacy = 96; Foreground = 216 }
    'xxhdpi' = @{ Legacy = 144; Foreground = 324 }
    'xxxhdpi' = @{ Legacy = 192; Foreground = 432 }
}

foreach ($density in $densities.Keys) {
    $folder = Join-Path $androidRes "mipmap-$density"
    $legacy = $densities[$density].Legacy
    $foreground = $densities[$density].Foreground
    Save-Icon (Join-Path $folder 'ic_launcher.png') $legacy $legacy full
    Save-Icon (Join-Path $folder 'ic_launcher_round.png') $legacy $legacy full
    Save-Icon (Join-Path $folder 'ic_launcher_foreground.png') $foreground $foreground foreground
}

Get-ChildItem $androidRes -Recurse -File -Filter 'splash.png' | ForEach-Object {
    $image = [System.Drawing.Image]::FromFile($_.FullName)
    $width = $image.Width
    $height = $image.Height
    $image.Dispose()
    Save-Icon $_.FullName $width $height splash
}

Write-Output 'Generated matching PWA, Android launcher and splash icons.'

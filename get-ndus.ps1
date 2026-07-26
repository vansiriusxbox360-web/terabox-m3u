# get-ndus.ps1 - Extrae el cookie ndus de Firefox y lo copia al portapapeles
# Uso: .\get-ndus.ps1

$ErrorActionPreference = "Stop"

# Buscar la base de datos de cookies de Firefox
$firefoxProfiles = Join-Path $env:APPDATA "Mozilla\Firefox\Profiles"
$cookiesDb = $null

if (Test-Path $firefoxProfiles) {
    $profiles = Get-ChildItem $firefoxProfiles -Directory
    foreach ($profile in $profiles) {
        $dbPath = Join-Path $profile.FullName "cookies.sqlite"
        if (Test-Path $dbPath) {
            $cookiesDb = $dbPath
            break
        }
    }
}

if (-not $cookiesDb) {
    Write-Host "❌ No se encontro la base de datos de cookies de Firefox" -ForegroundColor Red
    Write-Host "   Asegurate de tener Firefox instalado y haber iniciado sesion en Terabox" -ForegroundColor Yellow
    exit 1
}

# Copiar a temporal para evitar bloqueos si Firefox esta abierto
$tempDb = Join-Path $env:TEMP "cookies_terabox.sqlite"
Copy-Item $cookiesDb $tempDb -Force

# Descargar sqlite3 si no existe
$sqliteExe = Join-Path $env:TEMP "sqlite3.exe"
if (-not (Test-Path $sqliteExe)) {
    Write-Host "Descargando sqlite3..." -ForegroundColor Cyan
    $url = "https://www.sqlite.org/2024/sqlite-tools-win-x64-3450100.zip"
    $zip = Join-Path $env:TEMP "sqlite3.zip"
    try {
        Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
        Expand-Archive -Path $zip -DestinationPath $env:TEMP -Force
        $sqliteExe = Join-Path $env:TEMP "sqlite3.exe"
        if (-not (Test-Path $sqliteExe)) {
            # Buscar en subcarpetas
            $found = Get-ChildItem $env:TEMP -Filter "sqlite3.exe" -Recurse | Select-Object -First 1
            if ($found) {
                $sqliteExe = $found.FullName
            }
        }
    } catch {
        Write-Host "❌ Error descargando sqlite3: $_" -ForegroundColor Red
        Write-Host "   Descarga manualmente desde: https://www.sqlite.org/download.html" -ForegroundColor Yellow
        exit 1
    }
}

if (-not (Test-Path $sqliteExe)) {
    Write-Host "❌ No se pudo encontrar sqlite3.exe" -ForegroundColor Red
    exit 1
}

# Consultar el cookie ndus para terabox
$query = "SELECT value FROM moz_cookies WHERE name='ndus' AND baseDomain LIKE '%terabox%';"
$result = & $sqliteExe $tempDb $query 2>$null

# Limpiar resultado
$value = $result.Trim().Trim('"').Trim("'").Trim()

if ($value -and $value.Length -gt 10) {
    $value | Set-Clipboard
    Write-Host "✅ ndus copiado al portapapeles!" -ForegroundColor Green
    Write-Host "   Valor: $($value.Substring(0, [Math]::Min(20, $value.Length)))..." -ForegroundColor Gray
    Write-Host ""
    Write-Host "Pega el token en GitHub:" -ForegroundColor Cyan
    Write-Host "   1. Ve a tu repositorio en GitHub" -ForegroundColor White
    Write-Host "   2. Settings > Secrets and variables > Actions" -ForegroundColor White
    Write-Host "   3. Edita TERABOX_NDUS > pega el valor" -ForegroundColor White
} else {
    Write-Host "❌ No se encontro el cookie ndus para Terabox" -ForegroundColor Red
    Write-Host "   Verifica que hayas iniciado sesion en terabox.com" -ForegroundColor Yellow
}

# Limpiar
Remove-Item $tempDb -Force -ErrorAction SilentlyContinue

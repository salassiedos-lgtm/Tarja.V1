# Backup de la base de datos tarja_dev (PostgreSQL) — ejecutar con PowerShell.
# Uso:  ./scripts/backup.ps1 [-OutDir ..\backups]
# Requiere pg_dump (incluido con PostgreSQL). Ajusta la ruta/credenciales segun el entorno.
param(
  [string]$OutDir = "$PSScriptRoot\..\..\backups\database",
  [string]$PgBin = "C:\Program Files\PostgreSQL\18\bin",
  [string]$Db = "tarja_dev",
  [string]$User = "tarja"
)

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$out = Join-Path $OutDir "tarja_${stamp}.dump"

# La contrasena se toma de la variable de entorno PGPASSWORD (no la escribas aqui).
& "$PgBin\pg_dump.exe" -U $User -h localhost -Fc $Db -f $out
if ($LASTEXITCODE -eq 0) {
  Write-Output "Backup OK: $out"
} else {
  Write-Output "Backup FALLO (exit $LASTEXITCODE). Verifica PGPASSWORD y la ruta de pg_dump."
}

# Retencion sugerida: conservar 7 diarios / 4 semanales / 6 mensuales (limpieza via tarea programada).

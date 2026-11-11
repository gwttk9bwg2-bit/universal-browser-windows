param(
  [string]$OutputDirectory = "outputs",
  [switch]$SkipChecks
)
$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$OutputRoot = Join-Path $ProjectRoot $OutputDirectory
$StagingRoot = Join-Path $ProjectRoot "work\release\universal-browser-windows-portable"
$Package = Get-Content -Raw (Join-Path $ProjectRoot "package.json") | ConvertFrom-Json
$ZipPath = Join-Path $OutputRoot "universal-browser-windows-$($Package.version)-portable.zip"

Push-Location $ProjectRoot
try {
  if (-not $SkipChecks) { npm run check; if ($LASTEXITCODE -ne 0) { throw "Project checks failed." } }
  $ReleaseWork = Join-Path $ProjectRoot "work\release"
  if (Test-Path -LiteralPath $ReleaseWork) { Remove-Item -LiteralPath $ReleaseWork -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $StagingRoot, $OutputRoot | Out-Null

  foreach ($Directory in @("dist", "public", "extension", "scripts", "skill", "docs")) {
    Copy-Item -LiteralPath (Join-Path $ProjectRoot $Directory) -Destination $StagingRoot -Recurse
  }
  foreach ($File in @("package.json", "package-lock.json", "README.md", "CHANGELOG.md", "SECURITY.md", "SUPPORT.md", "install.cmd", "setup.cmd", "start.cmd", "connect-existing-browser.cmd", "update.cmd", "uninstall.cmd", "LICENSE")) {
    $Source = Join-Path $ProjectRoot $File
    if (Test-Path -LiteralPath $Source) { Copy-Item -LiteralPath $Source -Destination $StagingRoot }
  }
  Compress-Archive -Path (Join-Path $StagingRoot "*") -DestinationPath $ZipPath -CompressionLevel Optimal -Force
  $Hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ZipPath).Hash
  Write-Host "Created: $ZipPath"
  Write-Host "SHA256: $Hash"
} finally { Pop-Location }

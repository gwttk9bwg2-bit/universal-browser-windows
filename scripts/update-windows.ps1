param(
  [string]$InstallDirectory = "",
  [switch]$SkipDependencies,
  [switch]$SkipRegistration,
  [switch]$SkipSkillInstall,
  [switch]$SkipCodexConfig
)
$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$InstallDir = if ($InstallDirectory) { [IO.Path]::GetFullPath($InstallDirectory) } else { Join-Path $env:LOCALAPPDATA "UniversalBrowser" }
$ExistingConfig = Join-Path $InstallDir "config.json"
$ExtensionId = ""
if (Test-Path -LiteralPath $ExistingConfig) {
  try { $ExtensionId = [string]((Get-Content -Raw -LiteralPath $ExistingConfig | ConvertFrom-Json).chromiumExtensionId) } catch { Write-Warning "Existing configuration could not be read; browser extension registration will be left unchanged." }
}
$Installer = Join-Path $ProjectRoot "scripts\install-windows.ps1"
$Arguments = @{ InstallDirectory = $InstallDir; SkipExtensionPrompt = $true }
if ($ExtensionId) { $Arguments.ChromiumExtensionId = $ExtensionId }
if ($SkipDependencies) { $Arguments.SkipDependencies = $true }
if ($SkipRegistration) { $Arguments.SkipRegistration = $true }
if ($SkipSkillInstall) { $Arguments.SkipSkillInstall = $true }
if ($SkipCodexConfig) { $Arguments.SkipCodexConfig = $true }
& $Installer @Arguments
if ($LASTEXITCODE -ne 0) { throw "Universal Browser update failed." }
Write-Host "Universal Browser was updated from this release package. Restart Codex and the browser once."

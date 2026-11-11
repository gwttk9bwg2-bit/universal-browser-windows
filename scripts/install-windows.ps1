param(
  [string]$ChromiumExtensionId = "",
  [string]$InstallDirectory = "",
  [switch]$SkipExtensionPrompt,
  [switch]$SkipDependencies,
  [switch]$SkipRegistration,
  [switch]$SkipSkillInstall,
  [switch]$SkipCodexConfig,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$InstallDir = if ($InstallDirectory) { [IO.Path]::GetFullPath($InstallDirectory) } else { Join-Path $env:LOCALAPPDATA "UniversalBrowser" }
$HostName = "com.universal_browser.bridge"

function Write-Step([string]$Message) { Write-Host "`n[Universal Browser] $Message" -ForegroundColor Cyan }
function Write-JsonFile([string]$Path, [object]$Value, [int]$Depth = 8) {
  $Json = $Value | ConvertTo-Json -Depth $Depth
  [IO.File]::WriteAllText($Path, $Json, (New-Object Text.UTF8Encoding($false)))
}
function Copy-Directory([string]$Name) {
  $Source = Join-Path $ProjectRoot $Name
  $Destination = Join-Path $InstallDir $Name
  if (-not (Test-Path -LiteralPath $Source)) { throw "Required directory is missing: $Source" }
  if (Test-Path -LiteralPath $Destination) { Remove-Item -LiteralPath $Destination -Recurse -Force }
  Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
}
function ConvertTo-TomlString([string]$Value) { return '"' + $Value.Replace('\', '\\').Replace('"', '\"') + '"' }
function Install-CodexMcpConfig([string]$CodexRoot, [string]$NodePath, [string]$EntryPath, [string]$Token) {
  $ConfigPath = Join-Path $CodexRoot "config.toml"
  $Begin = "# BEGIN UNIVERSAL BROWSER"
  $End = "# END UNIVERSAL BROWSER"
  $Existing = if (Test-Path -LiteralPath $ConfigPath) { [IO.File]::ReadAllText($ConfigPath) } else { "" }
  $Block = @"
$Begin
[mcp_servers.universal-browser]
command = $(ConvertTo-TomlString $NodePath)
args = [$(ConvertTo-TomlString $EntryPath)]

[mcp_servers.universal-browser.env]
UB_AGENT_ID = "default-agent"
UB_TOKEN = $(ConvertTo-TomlString $Token)
UB_DATA_DIR = $(ConvertTo-TomlString (Join-Path $InstallDir "data"))
$End
"@
  if ($Existing.Contains($Begin) -and $Existing.Contains($End)) {
    $Pattern = [regex]::Escape($Begin) + "(?s).*?" + [regex]::Escape($End)
    $Updated = [regex]::Replace($Existing, $Pattern, $Block.Trim())
  } elseif ($Existing -match '(?m)^\[mcp_servers\.universal-browser\]') {
    Write-Warning "Codex already has a manually managed universal-browser MCP entry. It was left unchanged. Use $McpConfigPath if an update is needed."
    return
  } else {
    $Updated = $Existing.TrimEnd() + $(if ($Existing.Trim()) { "`r`n`r`n" } else { "" }) + $Block.Trim() + "`r`n"
  }
  if (Test-Path -LiteralPath $ConfigPath) { Copy-Item -LiteralPath $ConfigPath -Destination "$ConfigPath.universal-browser.bak" -Force }
  [IO.File]::WriteAllText($ConfigPath, $Updated, (New-Object Text.UTF8Encoding($false)))
  Write-Host "Codex MCP configured: $ConfigPath"
}

Write-Step "Checking requirements"
$Node = Get-Command node -ErrorAction SilentlyContinue
$Npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $Node -or -not $Npm) { throw "Node.js 22 or newer is required. Download it from https://nodejs.org/" }
$NodeVersion = [version]((& node --version).Trim().TrimStart("v"))
if ($NodeVersion.Major -lt 22) { throw "Node.js 22 or newer is required. Installed: $NodeVersion" }
if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "dist\stdio.js"))) {
  throw "The release is missing its production build (dist\stdio.js). Download the packaged Release instead of the source archive."
}

if ($DryRun) {
  Write-Host "Dry run passed."
  Write-Host "Source: $ProjectRoot"
  Write-Host "Install target: $InstallDir"
  exit 0
}

Write-Step "Installing plugin files for the current user"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
foreach ($Directory in @("dist", "public", "extension", "skill", "scripts")) { Copy-Directory $Directory }
foreach ($File in @("package.json", "package-lock.json", "README.md", "SECURITY.md", "LICENSE")) {
  $Source = Join-Path $ProjectRoot $File
  if (Test-Path -LiteralPath $Source) { Copy-Item -LiteralPath $Source -Destination $InstallDir -Force }
}

if (-not $SkipDependencies) {
  Write-Step "Installing production dependencies"
  Push-Location $InstallDir
  try {
    & $Npm.Source ci --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm dependency installation failed." }
  } finally { Pop-Location }
}

$TokenBytes = New-Object byte[] 32
$TokenGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $TokenGenerator.GetBytes($TokenBytes) } finally { $TokenGenerator.Dispose() }
$Token = [Convert]::ToBase64String($TokenBytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
$NodePath = $Node.Source
$NativeHostScript = Join-Path $InstallDir "native-host.cmd"
$NativeHostEntry = Join-Path $InstallDir "dist\native-host.js"
@"
@echo off
set "UB_NATIVE_TOKEN=$Token"
"$NodePath" "$NativeHostEntry" %*
"@ | Set-Content -LiteralPath $NativeHostScript -Encoding Ascii

$StartScript = Join-Path $InstallDir "start.cmd"
$CliEntry = Join-Path $InstallDir "dist\cli.js"
@"
@echo off
set "UB_TOKEN=$Token"
start "" "http://127.0.0.1:3210"
"$NodePath" "$CliEntry" serve
"@ | Set-Content -LiteralPath $StartScript -Encoding Ascii

$McpConfig = @{
  mcpServers = @{
    "universal-browser" = @{
      command = $NodePath
      args = @((Join-Path $InstallDir "dist\stdio.js"))
      env = @{ UB_AGENT_ID = "default-agent"; UB_TOKEN = $Token; UB_DATA_DIR = (Join-Path $InstallDir "data") }
    }
  }
}
$McpConfigPath = Join-Path $InstallDir "mcp-config.json"
Write-JsonFile $McpConfigPath $McpConfig
$PackageVersion = (Get-Content -Raw (Join-Path $ProjectRoot "package.json") | ConvertFrom-Json).version

$CodexRoot = Join-Path $env:USERPROFILE ".codex"
if ((Test-Path -LiteralPath $CodexRoot) -and -not $SkipSkillInstall) {
  Write-Step "Installing the Universal Browser Skill for Codex"
  $SkillTarget = Join-Path $CodexRoot "skills\universal-browser"
  if (Test-Path -LiteralPath $SkillTarget) { Remove-Item -LiteralPath $SkillTarget -Recurse -Force }
  New-Item -ItemType Directory -Force -Path (Split-Path $SkillTarget) | Out-Null
  Copy-Item -LiteralPath (Join-Path $InstallDir "skill\universal-browser") -Destination $SkillTarget -Recurse -Force
}
if ((Test-Path -LiteralPath $CodexRoot) -and -not $SkipCodexConfig) {
  Write-Step "Connecting Universal Browser to Codex"
  Install-CodexMcpConfig $CodexRoot $NodePath (Join-Path $InstallDir "dist\stdio.js") $Token
}

if (-not $ChromiumExtensionId -and -not $SkipExtensionPrompt) {
  Write-Step "Connecting the browser extension"
  Write-Host "1. Edge will open its extensions page. Enable Developer mode."
  Write-Host "2. Choose Load unpacked and select: $InstallDir\extension"
  Write-Host "3. Copy the extension ID and paste it below. Press Enter to skip for now."
  $Edge = @("C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", "C:\Program Files\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if ($Edge) { Start-Process -FilePath $Edge -ArgumentList "edge://extensions" }
  Start-Process explorer.exe -ArgumentList "`"$(Join-Path $InstallDir 'extension')`""
  $ChromiumExtensionId = (Read-Host "Extension ID").Trim()
}

if ($ChromiumExtensionId) {
  if ($ChromiumExtensionId -notmatch "^[a-p]{32}$") { throw "The extension ID must contain 32 letters from a to p." }
  $ChromiumManifest = Join-Path $InstallDir "$HostName.chromium.json"
  $ChromiumHost = @{
    name = $HostName; description = "Universal Browser native messaging bridge"; path = $NativeHostScript; type = "stdio"
    allowed_origins = @("chrome-extension://$ChromiumExtensionId/")
  }
  Write-JsonFile $ChromiumManifest $ChromiumHost 4
  if (-not $SkipRegistration) {
    foreach ($Key in @("HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName", "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName")) {
      New-Item -Force -Path $Key | Out-Null
      Set-Item -LiteralPath $Key -Value $ChromiumManifest
    }
  }
}

$FirefoxManifest = Join-Path $InstallDir "$HostName.firefox.json"
$FirefoxHost = @{
  name = $HostName; description = "Universal Browser native messaging bridge"; path = $NativeHostScript; type = "stdio"
  allowed_extensions = @("universal-browser@local")
}
Write-JsonFile $FirefoxManifest $FirefoxHost 4
if (-not $SkipRegistration) {
  $FirefoxKey = "HKCU:\Software\Mozilla\NativeMessagingHosts\$HostName"
  New-Item -Force -Path $FirefoxKey | Out-Null
  Set-Item -LiteralPath $FirefoxKey -Value $FirefoxManifest
}

Write-JsonFile (Join-Path $InstallDir "config.json") @{ version = $PackageVersion; installedAt = [DateTime]::UtcNow.ToString("o"); token = $Token; chromiumExtensionId = $ChromiumExtensionId }

Write-Step "Installation complete"
Write-Host "Installed at: $InstallDir"
Write-Host "MCP configuration: $McpConfigPath"
Write-Host "The MCP process starts the local service automatically. Dashboard use is optional."
if (-not $ChromiumExtensionId) { Write-Host "Existing signed-in browser support is optional. Run connect-existing-browser.cmd later if needed." }

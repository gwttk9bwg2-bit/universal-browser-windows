$ErrorActionPreference = "Continue"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Checks = @()
function Add-Check([string]$Name, [bool]$Ok, [string]$Details) {
  $script:Checks += [pscustomobject]@{ Check = $Name; Status = $(if ($Ok) { "PASS" } else { "FAIL" }); Details = $Details }
}

$NodeVersion = & node --version 2>$null
Add-Check "Node.js" ($LASTEXITCODE -eq 0) ([string]$NodeVersion)
Add-Check "Production build" (Test-Path -LiteralPath (Join-Path $ProjectRoot "dist\cli.js")) (Join-Path $ProjectRoot "dist\cli.js")

$Browsers = @(
  @{ Name = "Microsoft Edge"; Path = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" },
  @{ Name = "Microsoft Edge (64-bit)"; Path = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" },
  @{ Name = "Google Chrome"; Path = "C:\Program Files\Google\Chrome\Application\chrome.exe" },
  @{ Name = "Mozilla Firefox"; Path = "C:\Program Files\Mozilla Firefox\firefox.exe" }
)
foreach ($Browser in $Browsers) { if (Test-Path -LiteralPath $Browser.Path) { Add-Check $Browser.Name $true $Browser.Path } }

$HostName = "com.universal_browser.bridge"
$RegistryKeys = @(
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName",
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName",
  "HKCU:\Software\Mozilla\NativeMessagingHosts\$HostName"
)
$Registered = $RegistryKeys | Where-Object { Test-Path -LiteralPath $_ }
Add-Check "Native messaging" ($Registered.Count -gt 0) $(if ($Registered) { $Registered -join ", " } else { "Not registered; run install-windows.ps1 after loading the extension." })

try {
  $Health = Invoke-RestMethod -Uri "http://127.0.0.1:3210/api/health" -TimeoutSec 2
  Add-Check "Local service" ($Health.ok -eq $true) "http://127.0.0.1:3210"
} catch { Add-Check "Local service" $false "Not running; use npm start." }

$Checks | Format-Table -AutoSize
if ($Checks.Status -contains "FAIL") { exit 1 }

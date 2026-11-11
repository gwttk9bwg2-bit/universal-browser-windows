param([string]$InstallDirectory = "", [switch]$KeepSkill, [switch]$KeepCodexConfig, [switch]$SkipRegistration)
$ErrorActionPreference = "Stop"
$HostName = "com.universal_browser.bridge"
$Keys = @(
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName",
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName",
  "HKCU:\Software\Mozilla\NativeMessagingHosts\$HostName"
)
if (-not $SkipRegistration) { foreach ($Key in $Keys) { if (Test-Path -LiteralPath $Key) { Remove-Item -LiteralPath $Key -Force } } }
$InstallDir = if ($InstallDirectory) { [IO.Path]::GetFullPath($InstallDirectory) } else { Join-Path $env:LOCALAPPDATA "UniversalBrowser" }
$SkillDir = Join-Path $env:USERPROFILE ".codex\skills\universal-browser"
if (Test-Path -LiteralPath $InstallDir) { Remove-Item -LiteralPath $InstallDir -Recurse -Force }
if (-not $KeepSkill -and (Test-Path -LiteralPath $SkillDir)) { Remove-Item -LiteralPath $SkillDir -Recurse -Force }
if (-not $KeepCodexConfig) {
  $CodexConfig = Join-Path $env:USERPROFILE ".codex\config.toml"
  if (Test-Path -LiteralPath $CodexConfig) {
    $Begin = "# BEGIN UNIVERSAL BROWSER"; $End = "# END UNIVERSAL BROWSER"
    $Content = [IO.File]::ReadAllText($CodexConfig)
    if ($Content.Contains($Begin) -and $Content.Contains($End)) {
      Copy-Item -LiteralPath $CodexConfig -Destination "$CodexConfig.universal-browser-uninstall.bak" -Force
      $Pattern = "(?ms)^" + [regex]::Escape($Begin) + ".*?" + [regex]::Escape($End) + "\s*"
      $Updated = [regex]::Replace($Content, $Pattern, "").TrimEnd() + "`r`n"
      [IO.File]::WriteAllText($CodexConfig, $Updated, (New-Object Text.UTF8Encoding($false)))
    }
  }
}
Write-Host "Universal Browser was removed for the current user."

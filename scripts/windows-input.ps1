param([Parameter(Mandatory = $true)][string]$Payload)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

if (-not ([System.Management.Automation.PSTypeName]"UniversalBrowser.Win32").Type) {
  Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

namespace UniversalBrowser {
  public class WindowInfo {
    public long handle { get; set; }
    public string title { get; set; }
    public bool visible { get; set; }
  }

  public static class Win32 {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extraInfo);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);

    public static List<WindowInfo> ListWindows() {
      var result = new List<WindowInfo>();
      EnumWindows((handle, _) => {
        int length = GetWindowTextLength(handle);
        if (length > 0) {
          var title = new StringBuilder(length + 1);
          GetWindowText(handle, title, title.Capacity);
          result.Add(new WindowInfo { handle = handle.ToInt64(), title = title.ToString(), visible = IsWindowVisible(handle) });
        }
        return true;
      }, IntPtr.Zero);
      return result;
    }
  }
}
"@
}

function Decode-Payload([string]$Encoded) {
  $Bytes = [Convert]::FromBase64String($Encoded)
  $Json = [Text.Encoding]::UTF8.GetString($Bytes)
  return $Json | ConvertFrom-Json
}

function Invoke-MouseButton([string]$Button, [bool]$Down) {
  $Flags = @{
    left = @(0x0002, 0x0004)
    right = @(0x0008, 0x0010)
    middle = @(0x0020, 0x0040)
  }
  if (-not $Flags.ContainsKey($Button)) { throw "Unsupported mouse button: $Button" }
  $Flag = $Flags[$Button][$(if ($Down) { 0 } else { 1 })]
  [UniversalBrowser.Win32]::mouse_event($Flag, 0, 0, 0, [UIntPtr]::Zero)
}

function Set-ClipboardTextWithRetry([string]$Text) {
  for ($Attempt = 0; $Attempt -lt 5; $Attempt++) {
    try { [Windows.Forms.Clipboard]::SetText($Text); return } catch { Start-Sleep -Milliseconds 80 }
  }
  throw "Clipboard is busy."
}

function Get-AutomationRoot($Request) {
  if ($Request.handle) { return [Windows.Automation.AutomationElement]::FromHandle([IntPtr]([long]$Request.handle)) }
  if ($Request.title) {
    $Needle = [string]$Request.title
    $Window = [UniversalBrowser.Win32]::ListWindows() | Where-Object { $_.visible -and $_.title.IndexOf($Needle, [StringComparison]::OrdinalIgnoreCase) -ge 0 } | Select-Object -First 1
    if (-not $Window) { throw "Window not found for UI Automation: $Needle" }
    return [Windows.Automation.AutomationElement]::FromHandle([IntPtr]$Window.handle)
  }
  return [Windows.Automation.AutomationElement]::RootElement
}

function Convert-AutomationElement($Element, [int]$Depth, [int]$MaxDepth, [int]$MaxNodes) {
  if (-not $Element -or $script:UiaNodeCount -ge $MaxNodes) { return $null }
  $script:UiaNodeCount++
  try {
    $Current = $Element.Current
    $Bounds = $Current.BoundingRectangle
    $Node = [ordered]@{
      name = $Current.Name
      automationId = $Current.AutomationId
      controlType = $Current.ControlType.ProgrammaticName.Replace("ControlType.", "")
      enabled = $Current.IsEnabled
      offscreen = $Current.IsOffscreen
      focusable = $Current.IsKeyboardFocusable
      handle = [long]$Current.NativeWindowHandle
      bounds = @{ x = [int]$Bounds.X; y = [int]$Bounds.Y; width = [int]$Bounds.Width; height = [int]$Bounds.Height }
      children = @()
    }
    if ($Depth -lt $MaxDepth -and $script:UiaNodeCount -lt $MaxNodes) {
      $Children = $Element.FindAll([Windows.Automation.TreeScope]::Children, [Windows.Automation.Condition]::TrueCondition)
      foreach ($Child in $Children) {
        $Converted = Convert-AutomationElement $Child ($Depth + 1) $MaxDepth $MaxNodes
        if ($Converted) { $Node.children += $Converted }
        if ($script:UiaNodeCount -ge $MaxNodes) { break }
      }
    }
    return [pscustomobject]$Node
  } catch { return $null }
}

function Find-AutomationElement($Root, $Request) {
  $Elements = $Root.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)
  foreach ($Element in $Elements) {
    try {
      $Current = $Element.Current
      if ($Request.name -and $Current.Name -ne [string]$Request.name) { continue }
      if ($Request.nameContains -and $Current.Name.IndexOf([string]$Request.nameContains, [StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
      if ($Request.automationId -and $Current.AutomationId -ne [string]$Request.automationId) { continue }
      if ($Request.controlType -and $Current.ControlType.ProgrammaticName.Replace("ControlType.", "") -ne [string]$Request.controlType) { continue }
      return $Element
    } catch { continue }
  }
  return $null
}

$Request = Decode-Payload $Payload
$Action = [string]$Request.type
$Result = $null

switch ($Action) {
  "cursor" {
    $Point = New-Object UniversalBrowser.Win32+POINT
    [void][UniversalBrowser.Win32]::GetCursorPos([ref]$Point)
    $Result = @{ x = $Point.X; y = $Point.Y }
  }
  "list_windows" {
    $Result = @([UniversalBrowser.Win32]::ListWindows() | Where-Object visible | Select-Object handle, title)
  }
  "focus_window" {
    $Windows = [UniversalBrowser.Win32]::ListWindows()
    $Target = if ($Request.handle) {
      $Windows | Where-Object handle -eq ([long]$Request.handle) | Select-Object -First 1
    } else {
      $Needle = [string]$Request.title
      $Windows | Where-Object { $_.visible -and $_.title.IndexOf($Needle, [StringComparison]::OrdinalIgnoreCase) -ge 0 } | Select-Object -First 1
    }
    if (-not $Target) { throw "Window not found." }
    [void][UniversalBrowser.Win32]::ShowWindow([IntPtr]$Target.handle, 9)
    [void][UniversalBrowser.Win32]::SetForegroundWindow([IntPtr]$Target.handle)
    $Result = @{ handle = $Target.handle; title = $Target.title }
  }
  "move" {
    if (-not [UniversalBrowser.Win32]::SetCursorPos([int]$Request.x, [int]$Request.y)) { throw "Unable to move the cursor." }
    $Result = @{ x = [int]$Request.x; y = [int]$Request.y }
  }
  "click" {
    if ($null -ne $Request.x -and $null -ne $Request.y) { [void][UniversalBrowser.Win32]::SetCursorPos([int]$Request.x, [int]$Request.y) }
    $Button = if ($Request.button) { [string]$Request.button } else { "left" }
    $Clicks = if ($Request.clicks) { [Math]::Max(1, [Math]::Min(3, [int]$Request.clicks)) } else { 1 }
    for ($Index = 0; $Index -lt $Clicks; $Index++) {
      Invoke-MouseButton $Button $true; Start-Sleep -Milliseconds 35; Invoke-MouseButton $Button $false
      if ($Index + 1 -lt $Clicks) { Start-Sleep -Milliseconds 90 }
    }
    $Result = @{ button = $Button; clicks = $Clicks }
  }
  "scroll" {
    if ($null -ne $Request.x -and $null -ne $Request.y) { [void][UniversalBrowser.Win32]::SetCursorPos([int]$Request.x, [int]$Request.y) }
    [UniversalBrowser.Win32]::mouse_event(0x0800, 0, 0, [int]$Request.delta, [UIntPtr]::Zero)
    $Result = @{ delta = [int]$Request.delta }
  }
  "drag" {
    [void][UniversalBrowser.Win32]::SetCursorPos([int]$Request.fromX, [int]$Request.fromY)
    Invoke-MouseButton "left" $true
    $Steps = 20
    $Duration = if ($Request.durationMs) { [Math]::Max(100, [int]$Request.durationMs) } else { 500 }
    for ($Index = 1; $Index -le $Steps; $Index++) {
      $X = [int]([double]$Request.fromX + (([double]$Request.toX - [double]$Request.fromX) * $Index / $Steps))
      $Y = [int]([double]$Request.fromY + (([double]$Request.toY - [double]$Request.fromY) * $Index / $Steps))
      [void][UniversalBrowser.Win32]::SetCursorPos($X, $Y)
      Start-Sleep -Milliseconds ([int]($Duration / $Steps))
    }
    Invoke-MouseButton "left" $false
    $Result = @{ x = [int]$Request.toX; y = [int]$Request.toY }
  }
  "hotkey" {
    [Windows.Forms.SendKeys]::SendWait([string]$Request.keys)
    $Result = @{ keys = [string]$Request.keys }
  }
  "type_text" {
    $Previous = if ([Windows.Forms.Clipboard]::ContainsText()) { [Windows.Forms.Clipboard]::GetText() } else { $null }
    Set-ClipboardTextWithRetry ([string]$Request.text)
    [Windows.Forms.SendKeys]::SendWait("^v")
    Start-Sleep -Milliseconds 80
    if ($null -ne $Previous) { Set-ClipboardTextWithRetry $Previous }
    $Result = @{ length = ([string]$Request.text).Length }
  }
  "screenshot" {
    $Path = [IO.Path]::GetFullPath([string]$Request.path)
    $Directory = Split-Path $Path
    if ($Directory) { New-Item -ItemType Directory -Force -Path $Directory | Out-Null }
    $Bounds = [Windows.Forms.SystemInformation]::VirtualScreen
    $Bitmap = New-Object Drawing.Bitmap $Bounds.Width, $Bounds.Height
    $Graphics = [Drawing.Graphics]::FromImage($Bitmap)
    try {
      $Graphics.CopyFromScreen($Bounds.Left, $Bounds.Top, 0, 0, $Bounds.Size)
      $Bitmap.Save($Path, [Drawing.Imaging.ImageFormat]::Png)
    } finally { $Graphics.Dispose(); $Bitmap.Dispose() }
    $Result = @{ path = $Path; coordinateSpace = "screen"; width = $Bounds.Width; height = $Bounds.Height; left = $Bounds.Left; top = $Bounds.Top }
  }
  "uia_snapshot" {
    $Root = Get-AutomationRoot $Request
    $MaxDepth = if ($Request.maxDepth) { [Math]::Max(1, [Math]::Min(8, [int]$Request.maxDepth)) } else { 4 }
    $MaxNodes = if ($Request.maxNodes) { [Math]::Max(10, [Math]::Min(1000, [int]$Request.maxNodes)) } else { 300 }
    $script:UiaNodeCount = 0
    $Tree = Convert-AutomationElement $Root 0 $MaxDepth $MaxNodes
    $Result = @{ nodes = $script:UiaNodeCount; tree = $Tree }
  }
  "uia_invoke" {
    $Root = Get-AutomationRoot $Request
    $Element = Find-AutomationElement $Root $Request
    if (-not $Element) { throw "UI Automation element not found." }
    $Pattern = $null
    $Method = "click"
    if ($Element.TryGetCurrentPattern([Windows.Automation.InvokePattern]::Pattern, [ref]$Pattern)) {
      ([Windows.Automation.InvokePattern]$Pattern).Invoke(); $Method = "invoke"
    } elseif ($Element.TryGetCurrentPattern([Windows.Automation.SelectionItemPattern]::Pattern, [ref]$Pattern)) {
      ([Windows.Automation.SelectionItemPattern]$Pattern).Select(); $Method = "select"
    } elseif ($Element.TryGetCurrentPattern([Windows.Automation.TogglePattern]::Pattern, [ref]$Pattern)) {
      ([Windows.Automation.TogglePattern]$Pattern).Toggle(); $Method = "toggle"
    } elseif ($Element.TryGetCurrentPattern([Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$Pattern)) {
      ([Windows.Automation.ExpandCollapsePattern]$Pattern).Expand(); $Method = "expand"
    } else {
      $Bounds = $Element.Current.BoundingRectangle
      [void][UniversalBrowser.Win32]::SetCursorPos([int]($Bounds.X + $Bounds.Width / 2), [int]($Bounds.Y + $Bounds.Height / 2))
      Invoke-MouseButton "left" $true; Start-Sleep -Milliseconds 35; Invoke-MouseButton "left" $false
    }
    $Result = @{ method = $Method; name = $Element.Current.Name; automationId = $Element.Current.AutomationId }
  }
  "uia_set_value" {
    $Root = Get-AutomationRoot $Request
    $Element = Find-AutomationElement $Root $Request
    if (-not $Element) { throw "UI Automation element not found." }
    $Pattern = $null
    if ($Element.TryGetCurrentPattern([Windows.Automation.ValuePattern]::Pattern, [ref]$Pattern) -and -not ([Windows.Automation.ValuePattern]$Pattern).Current.IsReadOnly) {
      ([Windows.Automation.ValuePattern]$Pattern).SetValue([string]$Request.value)
      $Method = "value"
    } else {
      [void]$Element.SetFocus()
      Set-ClipboardTextWithRetry ([string]$Request.value)
      [Windows.Forms.SendKeys]::SendWait("^a^v")
      $Method = "keyboard"
    }
    $Result = @{ method = $Method; name = $Element.Current.Name; length = ([string]$Request.value).Length }
  }
  default { throw "Unsupported Windows action: $Action" }
}

@{ ok = $true; result = $Result } | ConvertTo-Json -Depth 8 -Compress

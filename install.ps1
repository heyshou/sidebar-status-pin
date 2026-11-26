$ErrorActionPreference = 'Stop'

$sourceDir = $PSScriptRoot
$targetDir = Join-Path $env:USERPROFILE '.gemini\config\plugins\sidebar-status-pin'

New-Item -ItemType Directory -Path (Join-Path $targetDir 'sidecars\sidebar_status') -Force | Out-Null

Copy-Item -Path (Join-Path $sourceDir 'plugin.json') -Destination (Join-Path $targetDir 'plugin.json') -Force
Copy-Item -Path (Join-Path $sourceDir 'sidecars\sidebar_status\sidecar.json') -Destination (Join-Path $targetDir 'sidecars\sidebar_status\sidecar.json') -Force
Copy-Item -Path (Join-Path $sourceDir 'sidecars\sidebar_status\main.mjs') -Destination (Join-Path $targetDir 'sidecars\sidebar_status\main.mjs') -Force

Write-Host "[OK] Installed sidebar-status-pin to: $targetDir" -ForegroundColor Green
Write-Host "Make sure Antigravity is launched with --remote-debugging-port=0, then restart Antigravity and enable 'Sidebar Status Pin' in Plugins."

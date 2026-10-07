param(
  [Parameter(Mandatory)][ValidateSet('cues','robots','balls','tables','environments')][string]$Family,
  [string]$ProjectRoot = 'C:\Users\28219\Desktop\ball',
  [string[]]$AssetIds = @()
)
$ErrorActionPreference = 'Stop'
$python = 'D:\DevTools\BreakBuilderNative\mcp-runtime\Scripts\python.exe'
$client = Join-Path $ProjectRoot 'scripts/art/blender-mcp-client.py'
$inventoryPath = Join-Path $ProjectRoot ".tmp/legacy-art-export/inventory-$Family.json"
$inventory = Get-Content -LiteralPath $inventoryPath -Raw | ConvertFrom-Json
$scriptNames = @{cues='refine-cues.py'; robots='refine-compact-assets.py'; balls='refine-compact-assets.py'; tables='refine-tables.py'; environments='refine-environments.py'}
$script = Join-Path $ProjectRoot ('scripts/art/' + $scriptNames[$Family])
$receiptRoot = Join-Path $ProjectRoot 'docs/qa/2026-10-05-blender-mcp'
foreach ($asset in $inventory.assets) {
  if ($AssetIds.Count -gt 0 -and $asset.id -notin $AssetIds) { continue }
  if ($Family -eq 'robots' -and $asset.category -ne 'robot-prototype') { continue }
  $id = $asset.id
  $variables = @{INPUT_FILE=(Join-Path $ProjectRoot ('.tmp/legacy-art-export/' + $asset.file)); OUTPUT_ROOT=$ProjectRoot.Replace('\','/'); ASSET_ID=$id} | ConvertTo-Json -Compress
  & $python $client execute_blender_code --code $script --vars $variables --output (Join-Path $receiptRoot "$id-refine.json") | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "MCP refinement failed for $id; see saved receipt" }
  $look = @{mode='angles';views=@('front','right','back','three_quarter');shading='material';max_size=1000}
  if ($Family -eq 'environments') {
    # Leave runtime sky proxies out of the framing; exported shader metadata
    # remains available to the game loader.
    $look.target=@($id.Replace('environment-','') + '-architecture')
  }
  & $python $client look --args ($look | ConvertTo-Json -Compress) --output (Join-Path $receiptRoot "$id-angles.json") | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "MCP visual capture failed for $id" }
  Write-Output "Authored and captured $id (awaiting visual review)"
}

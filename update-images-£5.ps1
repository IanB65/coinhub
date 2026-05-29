# Update £5 coin image URLs
# Run from your Windows machine.

$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3Nzg4NjI5MTMsImV4cCI6MTc4MTQ1NDkxM30.qzYE8MF7tDhY4DKsmpaKbQgzsDuI4S2FqOrIYnUeOOY"
$apiBase = "https://coins.ghghome.co.uk/api/variants-write"

$numistaMap = [ordered]@{
    'UK-D-£5-2007-DIAM-'  = 'https://en.numista.com/catalogue/pieces14304.html'
    'UK-D-£5-2022-JUBI-'  = 'https://en.numista.com/catalogue/pieces317421.html'
    'UK-D-£5-2023-KC75-'  = 'https://en.numista.com/catalogue/pieces351375.html'
    'UK-D-£5-2026-PNYD-'  = 'https://en.numista.com/556720'
}

# 2026 coins not yet on Numista — sourced from onlinecoin.club
$onlineCoinMap = [ordered]@{
    'UK-D-£5-2026-ANGL-'  = 'https://onlinecoin.club/Coins/Country/United_Kingdom/Five_Pounds_2026_The_Angel/'
    'UK-D-£5-2026-LYHR-'  = 'https://onlinecoin.club/Coins/Country/United_Kingdom/Five_Pounds_2026_Year_of_the_Horse/'
}

$pageCache = @{}

function Get-NumistaImage($pageUrl) {
    if ($pageCache.ContainsKey($pageUrl)) { return $pageCache[$pageUrl] }
    try {
        $r = Invoke-WebRequest -Uri $pageUrl -UseBasicParsing -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        $matches = [regex]::Matches($r.Content, 'https://en\.numista\.com/catalogue/photos/[^/]+/[^"''<>\s]+-original\.jpg')
        $img = if ($matches.Count -ge 2) { $matches[1].Value } elseif ($matches.Count -eq 1) { $matches[0].Value } else { $null }
        if ($img) { $pageCache[$pageUrl] = $img; return $img }
        Write-Host "  WARNING: no image on $pageUrl" -ForegroundColor Yellow
        return $null
    } catch {
        Write-Host "  ERROR fetching ${pageUrl}: $_" -ForegroundColor Red
        return $null
    }
}

function Get-OnlineCoinClubImage($pageUrl) {
    if ($pageCache.ContainsKey($pageUrl)) { return $pageCache[$pageUrl] }
    try {
        $r = Invoke-WebRequest -Uri $pageUrl -UseBasicParsing -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        # Try og:image meta tag first
        $m = [regex]::Match($r.Content, '<meta[^>]+property="og:image"[^>]+content="([^"]+)"')
        if (-not $m.Success) {
            $m = [regex]::Match($r.Content, '<meta[^>]+content="([^"]+)"[^>]+property="og:image"')
        }
        $img = if ($m.Success) { $m.Groups[1].Value } else { $null }
        if ($img) { $pageCache[$pageUrl] = $img; return $img }
        Write-Host "  WARNING: no image on $pageUrl" -ForegroundColor Yellow
        return $null
    } catch {
        Write-Host "  ERROR fetching ${pageUrl}: $_" -ForegroundColor Red
        return $null
    }
}

function Send-ImageUpdate($vc, $imgUrl) {
    $body = @{ variantCode = $vc; imgUrl = $imgUrl } | ConvertTo-Json -Compress
    try {
        $resp = Invoke-WebRequest -Uri $apiBase -Method POST -UseBasicParsing `
            -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
            -Body $body
        if ($resp.StatusCode -in 200,201) { Write-Host "  OK" -ForegroundColor Green; return $true }
        else { Write-Host "  HTTP $($resp.StatusCode)" -ForegroundColor Yellow; return $false }
    } catch {
        Write-Host "  API error: $_" -ForegroundColor Red; return $false
    }
}

$updated = 0; $failed = 0

Write-Host "--- Numista sources ---" -ForegroundColor Magenta
foreach ($vc in $numistaMap.Keys) {
    Write-Host "[$vc]" -NoNewline
    $imgUrl = Get-NumistaImage $numistaMap[$vc]
    if (-not $imgUrl) { $failed++; continue }
    Write-Host " -> $imgUrl" -ForegroundColor Cyan
    if (Send-ImageUpdate $vc $imgUrl) { $updated++ } else { $failed++ }
    Start-Sleep -Milliseconds 400
}

Write-Host ""
Write-Host "--- onlinecoin.club sources ---" -ForegroundColor Magenta
foreach ($vc in $onlineCoinMap.Keys) {
    Write-Host "[$vc]" -NoNewline
    $imgUrl = Get-OnlineCoinClubImage $onlineCoinMap[$vc]
    if (-not $imgUrl) { $failed++; continue }
    Write-Host " -> $imgUrl" -ForegroundColor Cyan
    if (Send-ImageUpdate $vc $imgUrl) { $updated++ } else { $failed++ }
    Start-Sleep -Milliseconds 400
}

Write-Host ""
Write-Host "Done. Updated: $updated  Failed/skipped: $failed" -ForegroundColor White

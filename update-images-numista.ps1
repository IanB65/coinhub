# Update £2 coin image URLs from en.numista.com
# Run from your Windows machine. Fetches Numista pages, extracts image URLs, updates the sheet.

$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3Nzg4NjI5MTMsImV4cCI6MTc4MTQ1NDkxM30.qzYE8MF7tDhY4DKsmpaKbQgzsDuI4S2FqOrIYnUeOOY"
$apiBase = "https://coins.ghghome.co.uk/api/variants-write"

# variantCode -> Numista catalog page URL
# Coins sharing the same design type use the same Numista page (image is fetched once and cached)
$coinMap = [ordered]@{
    # Technology Advances — 3rd portrait (1997 only)
    'UK-D-£2-1997-TECH-'  = 'https://en.numista.com/catalogue/pieces10574.html'

    # Technology Advances — 4th portrait (1998–2015)
    'UK-D-£2-1998-TECH-'  = 'https://en.numista.com/catalogue/pieces1324.html'
    'UK-D-£2-1999-TECH-'  = 'https://en.numista.com/catalogue/pieces1324.html'
    'UK-D-£2-2000-TECH-'  = 'https://en.numista.com/catalogue/pieces1324.html'
    'UK-D-£2-2001-TECH-'  = 'https://en.numista.com/catalogue/pieces1324.html'
    'UK-D-£2-2002-TECH-'  = 'https://en.numista.com/catalogue/pieces1324.html'
    'UK-D-£2-2003-TECH-'  = 'https://en.numista.com/catalogue/pieces1324.html'
    'UK-D-£2-2004-TECH-'  = 'https://en.numista.com/catalogue/pieces1324.html'
    'UK-D-£2-2006-TECH-'  = 'https://en.numista.com/catalogue/pieces1324.html'
    'UK-D-£2-2007-TECH-'  = 'https://en.numista.com/catalogue/pieces1324.html'
    'UK-D-£2-2008-TECH-'  = 'https://en.numista.com/catalogue/pieces1324.html'
    'UK-D-£2-2011-TECH-'  = 'https://en.numista.com/catalogue/pieces1324.html'

    # Britannia (Elizabeth II 5th portrait, 2015–2022)
    'UK-D-£2-2018-BRIT-'  = 'https://en.numista.com/catalogue/pieces70398.html'
    'UK-D-£2-2019-BRIT-'  = 'https://en.numista.com/catalogue/pieces70398.html'
    'UK-D-£2-2022-BRIT-'  = 'https://en.numista.com/catalogue/pieces70398.html'

    # Commemoratives — Elizabeth II
    'UK-D-£2-2007-ASTA-'  = 'https://en.numista.com/catalogue/pieces10600.html'
    'UK-D-£2-2007-AofU-'  = 'https://en.numista.com/catalogue/pieces8658.html'
    'UK-D-£2-2020-MAYF-'  = 'https://en.numista.com/catalogue/pieces191968.html'
    'UK-D-£2-2022-25YR-'  = 'https://en.numista.com/catalogue/pieces347218.html'
    'UK-D-£2-2022-BELL-'  = 'https://en.numista.com/catalogue/pieces316863.html'
    'UK-D-£2-2022-FACP-'  = 'https://en.numista.com/catalogue/pieces320564.html'

    # Commemoratives — Charles III
    'UK-D-£2-2023-FSM-'   = 'https://en.numista.com/catalogue/pieces351434.html'
    'UK-D-£2-2023-JRRT-'  = 'https://en.numista.com/catalogue/pieces351621.html'
    'UK-D-£2-2025-ORWL-'  = 'https://en.numista.com/catalogue/pieces451055.html'
    'UK-D-£2-2026-BEAG-'  = 'https://en.numista.com/catalogue/pieces554119.html'

    # Floral definitive (Charles III, 2023–2026)
    'UK-D-£2-2023-FLOR-'  = 'https://en.numista.com/catalogue/pieces381573.html'
    'UK-D-£2-2023-FLORP-' = 'https://en.numista.com/catalogue/pieces381573.html'
    'UK-D-£2-2024-FLOR-'  = 'https://en.numista.com/catalogue/pieces381573.html'
    'UK-D-£2-2025-FLOR-'  = 'https://en.numista.com/catalogue/pieces381573.html'
    'UK-D-£2-2026-FLOR-'  = 'https://en.numista.com/catalogue/pieces381573.html'
}

# Coins without a Numista page found (will be skipped):
#   UK-D-£2-2020-VEDA-  (VE Day 75th — BU not indexed on Numista)
#   UK-D-£2-2024-NTLG-  (National Gallery 200th — not yet on Numista)
#   UK-D-£2-2026-ZSLL-  (ZSL London Zoo 200th — not yet on Numista)

$pageCache = @{}

function Get-NumistaImage($pageUrl) {
    if ($pageCache.ContainsKey($pageUrl)) { return $pageCache[$pageUrl] }
    try {
        $r = Invoke-WebRequest -Uri $pageUrl -UseBasicParsing -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        $m = [regex]::Match($r.Content, 'https://en\.numista\.com/catalogue/photos/[^/]+/[^"''<>\s]+-original\.jpg')
        if ($m.Success) {
            $pageCache[$pageUrl] = $m.Value
            return $m.Value
        }
        Write-Host "  WARNING: no image found on $pageUrl" -ForegroundColor Yellow
        return $null
    } catch {
        Write-Host "  ERROR fetching ${pageUrl}: $_" -ForegroundColor Red
        return $null
    }
}

$updated = 0
$failed  = 0

foreach ($vc in $coinMap.Keys) {
    $numPage = $coinMap[$vc]
    Write-Host "[$vc]" -NoNewline
    $imgUrl = Get-NumistaImage $numPage
    if (-not $imgUrl) { $failed++; continue }

    Write-Host " -> $imgUrl" -ForegroundColor Cyan
    $body = @{ variantCode = $vc; imgUrl = $imgUrl } | ConvertTo-Json -Compress
    try {
        $resp = Invoke-WebRequest -Uri $apiBase -Method POST -UseBasicParsing `
            -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
            -Body $body
        if ($resp.StatusCode -eq 200 -or $resp.StatusCode -eq 201) {
            Write-Host "  OK" -ForegroundColor Green
            $updated++
        } else {
            Write-Host "  HTTP $($resp.StatusCode)" -ForegroundColor Yellow
            $failed++
        }
    } catch {
        Write-Host "  API error: $_" -ForegroundColor Red
        $failed++
    }
    Start-Sleep -Milliseconds 400
}

Write-Host ""
Write-Host "Done. Updated: $updated  Failed/skipped: $failed" -ForegroundColor White

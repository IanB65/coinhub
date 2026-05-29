# Update £2 coin image URLs from en.numista.com — full run (all remaining coins)
# Run from your Windows machine.

$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3Nzg4NjI5MTMsImV4cCI6MTc4MTQ1NDkxM30.qzYE8MF7tDhY4DKsmpaKbQgzsDuI4S2FqOrIYnUeOOY"
$apiBase = "https://coins.ghghome.co.uk/api/variants-write"

$coinMap = [ordered]@{
    # ── Technology Advances 4th portrait (all same Numista page) ────────────
    'UK-D-£2-2005-TECH-'  = 'https://en.numista.com/catalogue/pieces1324.html'
    'UK-D-£2-2009-TECH-'  = 'https://en.numista.com/catalogue/pieces1324.html'
    'UK-D-£2-2010-TECH-'  = 'https://en.numista.com/catalogue/pieces1324.html'
    'UK-D-£2-2012-TECH-'  = 'https://en.numista.com/catalogue/pieces1324.html'
    'UK-D-£2-2013-TECH-'  = 'https://en.numista.com/catalogue/pieces1324.html'
    'UK-D-£2-2014-TECH-'  = 'https://en.numista.com/catalogue/pieces1324.html'
    'UK-D-£2-2015-TECH-'  = 'https://en.numista.com/catalogue/pieces1324.html'

    # ── Britannia (5th portrait, all same page) ─────────────────────────────
    'UK-D-£2-2015-BRIT-'  = 'https://en.numista.com/catalogue/pieces70398.html'
    'UK-D-£2-2016-BRIT-'  = 'https://en.numista.com/catalogue/pieces70398.html'
    'UK-D-£2-2017-BRIT-'  = 'https://en.numista.com/catalogue/pieces70398.html'
    'UK-D-£2-2020-BRIT-'  = 'https://en.numista.com/catalogue/pieces70398.html'
    'UK-D-£2-2021-BRIT-'  = 'https://en.numista.com/catalogue/pieces70398.html'

    # ── Pre-1997 commemoratives ─────────────────────────────────────────────
    'UK-D-£2-1986-CG86-'  = 'https://en.numista.com/catalogue/pieces4410.html'
    'UK-D-£2-1989-BLRT-'  = 'https://en.numista.com/catalogue/pieces21883.html'
    'UK-D-£2-1989-CLRT-'  = 'https://en.numista.com/catalogue/pieces19473.html'
    'UK-D-£2-1994-BKOE-'  = 'https://en.numista.com/catalogue/pieces13387.html'
    'UK-D-£2-1995-WW50-'  = 'https://en.numista.com/catalogue/pieces13389.html'
    'UK-D-£2-1995-UN50-'  = 'https://en.numista.com/catalogue/pieces13390.html'
    'UK-D-£2-1996-EUR6-'  = 'https://en.numista.com/catalogue/pieces13391.html'

    # ── 1999–2011 commemoratives ────────────────────────────────────────────
    'UK-D-£2-1999-RWCU-'  = 'https://en.numista.com/catalogue/pieces10596.html'
    'UK-D-£2-2001-MARC-'  = 'https://en.numista.com/catalogue/pieces7525.html'
    'UK-D-£2-2002-CGME-'  = 'https://en.numista.com/catalogue/pieces10597.html'
    'UK-D-£2-2002-CGMW-'  = 'https://en.numista.com/catalogue/pieces10598.html'
    'UK-D-£2-2002-CGMS-'  = 'https://en.numista.com/catalogue/pieces10599.html'
    'UK-D-£2-2002-CGMN-'  = 'https://en.numista.com/catalogue/pieces12350.html'
    'UK-D-£2-2003-DNA1-'  = 'https://en.numista.com/catalogue/pieces8661.html'
    'UK-D-£2-2004-TREV-'  = 'https://en.numista.com/catalogue/pieces10631.html'
    'UK-D-£2-2005-WW60-'  = 'https://en.numista.com/catalogue/pieces8660.html'
    'UK-D-£2-2005-GUNP-'  = 'https://en.numista.com/catalogue/pieces13420.html'
    'UK-D-£2-2006-BRNP-'  = 'https://en.numista.com/catalogue/pieces6849.html'
    'UK-D-£2-2006-BRNS-'  = 'https://en.numista.com/catalogue/pieces8659.html'
    'UK-D-£2-2008-OLHN-'  = 'https://en.numista.com/catalogue/pieces10626.html'
    'UK-D-£2-2009-BURN-'  = 'https://en.numista.com/catalogue/pieces16526.html'
    'UK-D-£2-2009-DARW-'  = 'https://en.numista.com/catalogue/pieces16206.html'
    'UK-D-£2-2010-NGHT-'  = 'https://en.numista.com/catalogue/pieces16549.html'
    'UK-D-£2-2011-KJBI-'  = 'https://en.numista.com/catalogue/pieces17099.html'
    'UK-D-£2-2011-MARY-'  = 'https://en.numista.com/catalogue/pieces17100.html'

    # ── 2012–2015 commemoratives ────────────────────────────────────────────
    'UK-D-£2-2012-DICK-'  = 'https://en.numista.com/catalogue/pieces27379.html'
    'UK-D-£2-2012-OLHR-'  = 'https://en.numista.com/catalogue/pieces36876.html'
    'UK-D-£2-2013-UGTK-'  = 'https://en.numista.com/catalogue/pieces41257.html'
    'UK-D-£2-2013-UGRD-'  = 'https://en.numista.com/catalogue/pieces41258.html'
    'UK-D-£2-2013-GUIN-'  = 'https://en.numista.com/catalogue/pieces41285.html'
    'UK-D-£2-2014-WWIO-'  = 'https://en.numista.com/catalogue/pieces53078.html'
    'UK-D-£2-2014-TRHS-'  = 'https://en.numista.com/catalogue/pieces53079.html'
    'UK-D-£2-2015-MAGN-'  = 'https://en.numista.com/catalogue/pieces68047.html'
    'UK-D-£2-2015-RNVY-'  = 'https://en.numista.com/catalogue/pieces68048.html'

    # ── 2016–2019 commemoratives ────────────────────────────────────────────
    'UK-D-£2-2016-SHKT-'  = 'https://en.numista.com/catalogue/pieces79007.html'
    'UK-D-£2-2016-SHKC-'  = 'https://en.numista.com/catalogue/pieces79005.html'
    'UK-D-£2-2016-SHKH-'  = 'https://en.numista.com/catalogue/pieces79006.html'
    'UK-D-£2-2016-ARMY-'  = 'https://en.numista.com/catalogue/pieces79000.html'
    'UK-D-£2-2016-GFIR-'  = 'https://en.numista.com/catalogue/pieces78999.html'
    'UK-D-£2-2017-AUST-'  = 'https://en.numista.com/catalogue/pieces100954.html'
    'UK-D-£2-2017-WAVI-'  = 'https://en.numista.com/catalogue/pieces100950.html'
    'UK-D-£2-2018-RAF1-'  = 'https://en.numista.com/catalogue/pieces135814.html'
    'UK-D-£2-2018-MSFR-'  = 'https://en.numista.com/catalogue/pieces132552.html'
    'UK-D-£2-2019-DDAY-'  = 'https://en.numista.com/catalogue/pieces158004.html'
    'UK-D-£2-2019-WEDG-'  = 'https://en.numista.com/catalogue/pieces158003.html'
    'UK-D-£2-2019-PEPY-'  = 'https://en.numista.com/catalogue/pieces158005.html'

    # ── 2020–2026 commemoratives ────────────────────────────────────────────
    'UK-D-£2-2020-AGAT-'  = 'https://en.numista.com/catalogue/pieces191962.html'
    'UK-D-£2-2021-HGWL-'  = 'https://en.numista.com/catalogue/pieces266333.html'
    'UK-D-£2-2021-WSCO-'  = 'https://en.numista.com/catalogue/pieces266324.html'
    'UK-D-£2-2022-VERL-'  = 'https://en.numista.com/catalogue/pieces317480.html'
    'UK-D-£2-2024-CHRC-'  = 'https://en.numista.com/catalogue/pieces393556.html'
    'UK-D-£2-2025-MDRW-'  = 'https://en.numista.com/catalogue/pieces449107.html'
}

# ── Coins not on Numista — sourced from coinhunter.co.uk ────────────────────
Write-Host ""
Write-Host "--- coinhunter.co.uk sources ---" -ForegroundColor Magenta

foreach ($vc in $coinhunterMap.Keys) {
    Write-Host "[$vc]" -NoNewline
    $imgUrl = Get-CoinhunterImage $coinhunterMap[$vc]
    if (-not $imgUrl) { $failed++; continue }
    Write-Host " -> $imgUrl" -ForegroundColor Cyan
    $body = @{ variantCode = $vc; imgUrl = $imgUrl } | ConvertTo-Json -Compress
    try {
        $resp = Invoke-WebRequest -Uri $apiBase -Method POST -UseBasicParsing `
            -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
            -Body $body
        if ($resp.StatusCode -in 200,201) { Write-Host "  OK" -ForegroundColor Green; $updated++ }
        else { Write-Host "  HTTP $($resp.StatusCode)" -ForegroundColor Yellow; $failed++ }
    } catch {
        Write-Host "  API error: $_" -ForegroundColor Red; $failed++
    }
    Start-Sleep -Milliseconds 400
}

$coinhunterMap = [ordered]@{
    'UK-D-£2-2018-ARMI-'  = 'https://coinhunter.co.uk/2-pound/2018/fww-armistice/'
    'UK-D-£2-2020-VEDA-'  = 'https://coinhunter.co.uk/2-pound/2020/ve-day/'
    'UK-D-£2-2024-NTLG-'  = 'https://coinhunter.co.uk/2-pound/2024/national-gallery/'
    'UK-D-£2-2025-ROBS-'  = 'https://coinhunter.co.uk/2-pound/2025/royal-observatory/'
}

$pageCache = @{}

function Get-NumistaImage($pageUrl) {
    if ($pageCache.ContainsKey($pageUrl)) { return $pageCache[$pageUrl] }
    try {
        $r = Invoke-WebRequest -Uri $pageUrl -UseBasicParsing -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        $matches = [regex]::Matches($r.Content, 'https://en\.numista\.com/catalogue/photos/[^/]+/[^"''<>\s]+-original\.jpg')
        $img = if ($matches.Count -ge 2) { $matches[1].Value } elseif ($matches.Count -eq 1) { $matches[0].Value } else { $null }
        if ($img) {
            $pageCache[$pageUrl] = $img
            return $img
        }
        Write-Host "  WARNING: no image on $pageUrl" -ForegroundColor Yellow
        return $null
    } catch {
        Write-Host "  ERROR fetching ${pageUrl}: $_" -ForegroundColor Red
        return $null
    }
}

function Get-CoinhunterImage($pageUrl) {
    if ($pageCache.ContainsKey($pageUrl)) { return $pageCache[$pageUrl] }
    try {
        $r = Invoke-WebRequest -Uri $pageUrl -UseBasicParsing -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        $matches = [regex]::Matches($r.Content, 'https://coinhunter\.co\.uk/app/_images/[^"''<>\s]+\.(jpg|png)')
        $img = if ($matches.Count -ge 2) { $matches[1].Value } elseif ($matches.Count -eq 1) { $matches[0].Value } else { $null }
        if ($img) {
            $pageCache[$pageUrl] = $img
            return $img
        }
        Write-Host "  WARNING: no image on $pageUrl" -ForegroundColor Yellow
        return $null
    } catch {
        Write-Host "  ERROR fetching ${pageUrl}: $_" -ForegroundColor Red
        return $null
    }
}

$updated = 0; $failed = 0

foreach ($vc in $coinMap.Keys) {
    Write-Host "[$vc]" -NoNewline
    $imgUrl = Get-NumistaImage $coinMap[$vc]
    if (-not $imgUrl) { $failed++; continue }
    Write-Host " -> $imgUrl" -ForegroundColor Cyan
    $body = @{ variantCode = $vc; imgUrl = $imgUrl } | ConvertTo-Json -Compress
    try {
        $resp = Invoke-WebRequest -Uri $apiBase -Method POST -UseBasicParsing `
            -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
            -Body $body
        if ($resp.StatusCode -in 200,201) { Write-Host "  OK" -ForegroundColor Green; $updated++ }
        else { Write-Host "  HTTP $($resp.StatusCode)" -ForegroundColor Yellow; $failed++ }
    } catch {
        Write-Host "  API error: $_" -ForegroundColor Red; $failed++
    }
    Start-Sleep -Milliseconds 400
}

Write-Host ""
Write-Host "Done. Updated: $updated  Failed/skipped: $failed" -ForegroundColor White

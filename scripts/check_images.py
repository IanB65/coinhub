#!/usr/bin/env python3
"""
CoinHub image checker — finds broken URLs and coins with no image.

Run:
  python scripts/check_images.py

Reads sheet data from: C:/Users/ian/Downloads/coinhub_sheet_data.json
(downloaded from coins.ghghome.co.uk via the browser)
"""
import json, sys, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT      = Path(__file__).parent.parent
DATA_FILE = Path('C:/Users/ian/Downloads/coinhub_sheet_data.json')

# ── Check a single image URL ──────────────────────────────────────────────────
HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible; CoinHubChecker/1.0)'}

def check_url(url):
    for method in ('HEAD', 'GET'):
        try:
            req = urllib.request.Request(url, method=method, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status
        except urllib.error.HTTPError as e:
            if method == 'GET' or e.code not in (405, 403):
                return e.code
        except Exception:
            return 0
    return 0

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    if not DATA_FILE.exists():
        print(f'ERROR: {DATA_FILE} not found.')
        sys.exit(1)

    print(f'Loading sheet data from {DATA_FILE}…')
    data = json.loads(DATA_FILE.read_text(encoding='utf-8'))
    variant_rows = data.get('variants', [])
    image_rows   = data.get('images', [])

    # Build image map: variant_code -> url
    image_map = {}
    for row in image_rows[1:]:
        if len(row) >= 2 and row[0].strip() and row[1].strip():
            image_map[row[0].strip()] = row[1].strip()

    # Build variant list
    variants = []
    for row in variant_rows[1:]:
        if not row or not row[0].strip():
            continue
        def col(i, r=row): return r[i].strip() if len(r) > i else ''
        variants.append({
            'code':       col(0),
            'name':       col(1),
            'denom':      col(2),
            'collection': col(3),
            'year':       col(5),
        })

    variant_lookup = {v['code']: v for v in variants}
    missing = [v for v in variants if v['code'] not in image_map]

    # Check existing URLs concurrently
    print(f'Checking {len(image_map)} image URLs (may take a minute)…')
    broken = []
    with ThreadPoolExecutor(max_workers=25) as pool:
        futures = {pool.submit(check_url, url): code for code, url in image_map.items()}
        done = 0
        for fut in as_completed(futures):
            done += 1
            if done % 100 == 0 or done == len(image_map):
                print(f'  {done}/{len(image_map)} checked…', end='\r')
            code   = futures[fut]
            status = fut.result()
            if status not in (200, 206, 301, 302, 304):
                broken.append({
                    'code':   code,
                    'url':    image_map[code],
                    'status': status,
                    **{k: variant_lookup.get(code, {}).get(k, '') for k in ('name','year','denom','collection')},
                })
    print()

    SEP = '-' * 70
    print(f'\n{SEP}')
    print(f'BROKEN / UNREACHABLE  ({len(broken)})')
    print(SEP)
    for b in sorted(broken, key=lambda x: x['code']):
        print(f"  [{b['status'] or 'ERR'}]  {b['code']}")
        print(f"         {b['name']}  |  {b['year']} {b['denom']}  |  {b['collection']}")
        print(f"         {b['url']}")

    print(f'\n{SEP}')
    print(f'MISSING (no image entry)  ({len(missing)})')
    print(SEP)
    for v in sorted(missing, key=lambda x: (x['collection'], x['year'], x['code'])):
        print(f"  {v['code']}  |  {v['name']}  |  {v['year']} {v['denom']}  |  {v['collection']}")

    report = {
        'broken':  broken,
        'missing': [{'code': v['code'], 'name': v['name'], 'year': v['year'],
                     'denom': v['denom'], 'collection': v['collection']} for v in missing],
    }
    report_path = ROOT / 'image_check_report.json'
    report_path.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f'\nReport saved → image_check_report.json')
    print(f'Summary: {len(broken)} broken, {len(missing)} missing out of {len(variants)} total.\n')

if __name__ == '__main__':
    main()

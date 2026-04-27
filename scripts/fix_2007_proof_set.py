#!/usr/bin/env python3
"""
Fix wrong image URLs for the 2007 Proof Set coins.

Run:
  python scripts/fix_2007_proof_set.py

You will be prompted to paste your JWT token (from browser console:
  localStorage.getItem('coinhub_token')
)
"""
import json, sys, urllib.request, urllib.error

BASE  = 'https://coins.ghghome.co.uk'
COTUK = 'https://www.coins-of-the-uk.co.uk/pics/'

UPDATES = [
    # Small definitives — pre-2008 reverse designs
    {'code': 'UK-D-1P-2007-PORT-',  'url': COTUK + 'dec/01/1_96o.jpg'},
    {'code': 'UK-D-2P-2007-PofW-',  'url': COTUK + 'dec/02/2_92.jpg'},
    {'code': 'UK-D-5P-2007-BofS-',  'url': COTUK + 'dec/05/5_96.jpg'},
    {'code': 'UK-D-10P-2007-CofE-', 'url': COTUK + 'dec/10/10_92r.jpg'},
    {'code': 'UK-D-20P-2007-BofE-', 'url': COTUK + 'dec/20/20_01.jpg'},
    # £1 — Gateshead Millennium Bridge (2007 English design)
    {'code': 'UK-D-\xa31-2007-TGMB-', 'url': COTUK + 'dec/100/1pd07.jpg'},
    # £2 — commemoratives and standard
    {'code': 'UK-D-\xa32-2007-ASTA-', 'url': COTUK + 'dec/200/2p07sp.jpg'},
    {'code': 'UK-D-\xa32-2007-AofU-', 'url': COTUK + 'dec/200/2p07up.jpg'},
    {'code': 'UK-D-\xa32-2007-TECH-', 'url': COTUK + 'dec/200/2pd97r.jpg'},
    # £5 — Diamond Wedding Crown (proof)
    {'code': 'UK-D-\xa35-2007-DIAM-', 'url': COTUK + 'dec/500/5pd07p.jpg'},
]


def main():
    print('CoinHub 2007 Proof Set Image Fix')
    print('=' * 50)
    print()
    print('Open your browser console on coins.ghghome.co.uk and run:')
    print('  localStorage.getItem("coinhub_token")')
    print()
    token = input('Paste your JWT token here: ').strip()
    if not token:
        print('ERROR: No token provided.')
        sys.exit(1)

    payload = json.dumps({'updates': UPDATES}).encode('utf-8')
    req = urllib.request.Request(
        BASE + '/api/images-update',
        data=payload,
        headers={
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            result = json.loads(r.read())
            print(f'\nDone! Updated: {result.get("updated", 0)}, Appended: {result.get("appended", 0)}')
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        print(f'\nERROR {e.code}: {body}')
        sys.exit(1)
    except Exception as e:
        print(f'\nERROR: {e}')
        sys.exit(1)


if __name__ == '__main__':
    main()

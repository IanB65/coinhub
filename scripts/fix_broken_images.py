#!/usr/bin/env python3
"""
Fix broken image URLs in the CoinHub Google Sheet.

Run:
  python scripts/fix_broken_images.py

You will be prompted to paste your JWT token (from browser console:
  localStorage.getItem('coinhub_token')
)
"""
import json, sys, urllib.request, urllib.error

BASE     = 'https://coins.ghghome.co.uk'
COTUK    = 'https://www.coins-of-the-uk.co.uk/pics/dec/50/'
FIFTY_P  = 'https://fiftypence.co.uk/wp-content/uploads/'
CHECKER  = 'https://www.coinchecker.co.uk/wp-content/'

UPDATES = [
    # --- London 2012 Olympics 50p (filenames renamed on coins-of-the-uk.co.uk) ---
    {'code': 'UK-D-50P-2011-ARCH-', 'url': COTUK + 'archery.jpg'},
    {'code': 'UK-D-50P-2011-ATHL-', 'url': COTUK + '50_09o.jpg'},
    {'code': 'UK-D-50P-2011-AQUA-', 'url': COTUK + 'aq2.jpg'},
    {'code': 'UK-D-50P-2011-BADM-', 'url': COTUK + 'badminton.jpg'},
    {'code': 'UK-D-50P-2011-BASK-', 'url': COTUK + 'basketball.jpg'},
    {'code': 'UK-D-50P-2011-BOCC-', 'url': COTUK + 'boccia.jpg'},
    {'code': 'UK-D-50P-2011-BOXI-', 'url': COTUK + 'boxing.jpg'},
    {'code': 'UK-D-50P-2011-CANO-', 'url': COTUK + '50can.jpg'},
    {'code': 'UK-D-50P-2011-CYCL-', 'url': COTUK + '50cyc.jpg'},
    {'code': 'UK-D-50P-2011-EQUE-', 'url': COTUK + 'jump.jpg'},
    {'code': 'UK-D-50P-2011-FENC-', 'url': COTUK + 'fencing.jpg'},
    {'code': 'UK-D-50P-2011-FOOT-', 'url': COTUK + 'football.jpg'},
    {'code': 'UK-D-50P-2011-GOAL-', 'url': COTUK + 'goalball.jpg'},
    {'code': 'UK-D-50P-2011-GYMN-', 'url': COTUK + '50gym.jpg'},
    {'code': 'UK-D-50P-2011-HAND-', 'url': COTUK + 'handball.jpg'},
    {'code': 'UK-D-50P-2011-HOCK-', 'url': COTUK + 'hockey.jpg'},
    {'code': 'UK-D-50P-2011-JUDO-', 'url': COTUK + 'judo.jpg'},
    {'code': 'UK-D-50P-2011-PENT-', 'url': COTUK + 'pent.jpg'},
    {'code': 'UK-D-50P-2011-ROWI-', 'url': COTUK + 'rowing.jpg'},
    {'code': 'UK-D-50P-2011-SAIL-', 'url': COTUK + 'yacht.jpg'},
    {'code': 'UK-D-50P-2011-SHOO-', 'url': COTUK + 'shooting.jpg'},
    {'code': 'UK-D-50P-2011-TAEK-', 'url': COTUK + 'taekwondo.jpg'},
    {'code': 'UK-D-50P-2011-TENN-', 'url': COTUK + 'tennis.jpg'},
    {'code': 'UK-D-50P-2011-TTEN-', 'url': COTUK + '50tt.jpg'},
    {'code': 'UK-D-50P-2011-TRIA-', 'url': COTUK + '50tri.jpg'},
    {'code': 'UK-D-50P-2011-VOLL-', 'url': COTUK + '50vol.jpg'},
    {'code': 'UK-D-50P-2011-WCRU-', 'url': COTUK + 'wcrugby.jpg'},
    {'code': 'UK-D-50P-2011-WEIG-', 'url': COTUK + 'weight.jpg'},
    {'code': 'UK-D-50P-2011-WRES-', 'url': COTUK + 'wrestle.jpg'},

    # --- Other 50p coins (filenames renamed on coins-of-the-uk.co.uk) ---
    {'code': 'UK-D-50P-2017-PR-',   'url': COTUK + '50_17ttopr.jpg'},
    {'code': 'UK-D-50P-2018-GLOU-', 'url': COTUK + '50_18ttog.jpg'},
    {'code': 'UK-D-50P-2018-MOUS-', 'url': COTUK + '50_18mtm.jpg'},
    {'code': 'UK-D-50P-2018-PADP-', 'url': COTUK + '50_18pbbp.jpg'},
    {'code': 'UK-D-50P-2018-PADS-', 'url': COTUK + '50_18pbs.jpg'},
    {'code': 'UK-D-50P-2021-BAIR-', 'url': COTUK + '50_21jlb.jpg'},
    {'code': 'UK-D-50P-2022-JUBI-', 'url': COTUK + '50_22j.jpg'},

    # --- Coins not on coins-of-the-uk; sourced from fiftypence.co.uk ---
    {'code': 'UK-D-50P-2016-GB',    'url': FIFTY_P + '2018/02/team-gb-50p-600x600.jpg'},
    {'code': 'UK-D-50P-2019-PADL-', 'url': FIFTY_P + '2019/12/paddington-at-the-tower-50p-600x600.jpg'},
    {'code': 'UK-D-50P-2020-EUEX-', 'url': FIFTY_P + '2020/03/brexit-50p-600x600.jpg'},
    {'code': 'UK-D-50P-2020-DIVE-', 'url': FIFTY_P + '2021/04/diversity-built-britain-50p-600x600.jpg'},

    # --- Gruffalo from coinchecker.co.uk ---
    {'code': 'UK-D-50P-2019-GRUF-', 'url': CHECKER + 'uploads/2020/04/2019-The-Gruffalo-50p.jpg'},
]


def main():
    print('CoinHub Image Fix Script')
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

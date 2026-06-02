#!/usr/bin/env node
/**
 * stage-lotr-50p.js
 *
 * Stages the 2026 Lord of the Rings 50p coin variants (The One Ring) to
 * NewCoinsInbox for Ian's review. Three variants:
 *   1. Brilliant Uncirculated (standard)
 *   2. Brilliant Uncirculated Colour (mintage: 20,000)
 *   3. Silver Proof Colour (mintage: 7,500)
 *
 * The inbox-stage API auto-deduplicates, so safe to re-run.
 *
 * Usage:
 *   node scripts/stage-lotr-50p.js [--dry-run]
 *
 * Env vars required:
 *   COINHUB_SERVICE_KEY  – shared secret for /api/inbox-stage
 */

const API_BASE = process.env.API_BASE || 'https://coins.ghghome.co.uk';
const SERVICE_KEY = process.env.COINHUB_SERVICE_KEY || '';
const DRY_RUN = process.argv.includes('--dry-run');

const KC3 = 'King Charles III';
const COMM = 'Commemorative';

const COINS = [
  {
    variantCode: 'UK-COMM-50P-2026-LOTB-',
    name: 'Lord of the Rings: The One Ring — BU',
    denomination: '50p',
    collection: COMM,
    monarch: KC3,
    year: '2026',
    imageUrl: '',
    sourceUrl: 'https://www.royalmint.com/shop/limited-editions/the-lord-of-the-rings/the-one-ring/the-lord-of-the-rings-2026-50p-brilliant-uncirculated-coin/',
    price: '15.00',
  },
  {
    variantCode: 'UK-COMM-50P-2026-LOTC-',
    name: 'Lord of the Rings: The One Ring — Colour BU (20,000)',
    denomination: '50p',
    collection: COMM,
    monarch: KC3,
    year: '2026',
    imageUrl: '',
    sourceUrl: 'https://www.royalmint.com/shop/limited-editions/the-lord-of-the-rings/the-one-ring/the-lord-of-the-rings-2026-50p-brilliant-uncirculated-colour-coin/',
    price: '',
  },
  {
    variantCode: 'UK-COMM-50P-2026-LOTS-',
    name: 'Lord of the Rings: The One Ring — Silver Proof (7,500)',
    denomination: '50p',
    collection: COMM,
    monarch: KC3,
    year: '2026',
    imageUrl: '',
    sourceUrl: 'https://www.royalmint.com/shop/limited-editions/the-lord-of-the-rings/the-one-ring/the-lord-of-the-rings-2026-50p-silver-proof-colour-coin/',
    price: '',
  },
];

async function main() {
  if (!SERVICE_KEY && !DRY_RUN) {
    console.error('COINHUB_SERVICE_KEY env var is required (or use --dry-run)');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('Dry run — coins that would be staged:');
    COINS.forEach(c => console.log(`  ${c.variantCode}  ${c.name}`));
    return;
  }

  const resp = await fetch(`${API_BASE}/api/inbox-stage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-service-key': SERVICE_KEY,
    },
    body: JSON.stringify({ coins: COINS }),
  });

  if (!resp.ok) {
    console.error(`Failed (${resp.status}): ${await resp.text()}`);
    process.exit(1);
  }

  const { staged, skipped } = await resp.json();
  console.log(`Done. Staged ${staged}, skipped ${skipped} (already in sheet/inbox).`);
  if (staged > 0) {
    console.log('Review staged coins in the NewCoinsInbox tab of the Google Sheet.');
    console.log('Image URLs need adding — visit each sourceUrl to grab them from the Royal Mint product pages.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });

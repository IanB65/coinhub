#!/usr/bin/env node
// Run once: node scripts/gen-totp-secret.js
// Copy the output values into your Vercel environment variables.
const crypto = require('crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, val = 0, out = '';
  for (const byte of buf) {
    val = (val << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}

const totpSecret  = base32Encode(crypto.randomBytes(20));
const jwtSecret   = crypto.randomBytes(32).toString('hex');
const otpauthUri  = `otpauth://totp/CoinHub?secret=${totpSecret}&issuer=CoinHub&algorithm=SHA1&digits=6&period=30`;

console.log('\n=== CoinHub Auth Setup ===\n');
console.log('Add these to your Vercel project environment variables:\n');
console.log(`  COINHUB_PASSWORD      = <choose a strong password>`);
console.log(`  COINHUB_JWT_SECRET    = ${jwtSecret}`);
console.log(`  COINHUB_TOTP_SECRET   = ${totpSecret}  (omit this line to disable 2FA)\n`);
console.log('To set up 2FA, scan this URI with Google Authenticator / Authy:');
console.log(`\n  ${otpauthUri}\n`);
console.log('Or search for a QR-code generator and paste the URI above into it.\n');

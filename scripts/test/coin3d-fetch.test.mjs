// Offline unit tests for coin3d-fetch.mjs:  node --test scripts/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseCsv, filterRows, sniffImage, obverseKeyForYear, auditAndDownload, buildSummary } from '../coin3d-fetch.mjs';

const FIXTURE = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/variants-sample.csv'), 'utf8');

test('parseCsv handles gviz-style quoting, commas, embedded quotes, £', () => {
  const rows = parseCsv(FIXTURE);
  assert.equal(rows.length, 8); // header + 7 data rows
  assert.equal(rows[0][0], 'variantCode');
  assert.equal(rows[3][1], 'Judo, the gentle way');          // comma inside quotes
  assert.equal(rows[4][1], 'Completer "Medallion"');         // doubled quotes
  assert.equal(rows[6][0], 'UK-COMM-£2-2026-ZSLL-');         // £ survives
  assert.equal(rows[2][7], '');                              // empty column H
});

test('filterRows: collection + denomination, case-insensitive', () => {
  const rows = parseCsv(FIXTURE);
  const oly = filterRows(rows, 'london 2012 olympics', '50p');
  assert.equal(oly.length, 4);
  assert.equal(oly[0].row[0], 'UK-D-50P-2011-ARCH-');
  assert.equal(oly[0].sheetRow, 2); // first data row = sheet row 2
  const zsl = filterRows(rows, 'Commemorative', '£2');
  assert.equal(zsl.length, 1);
});

test('filterRows: sweep mode (no collection) takes all of the denomination', () => {
  const all50p = filterRows(parseCsv(FIXTURE), '', '50p');
  assert.equal(all50p.length, 6); // everything except the £2 row
});

test('filterRows: rejects unexpected header', () => {
  assert.throws(() => filterRows(parseCsv('"a","b"\n"1","2"\n'), '', '50p'), /Unexpected header/);
});

test('sniffImage: magic bytes, rejects HTML', () => {
  assert.equal(sniffImage(Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')), 'png');
  assert.equal(sniffImage(Buffer.concat([Buffer.from('ffd8ffe0', 'hex'), Buffer.alloc(12)])), 'jpg');
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8L')]);
  assert.equal(sniffImage(webp), 'webp');
  assert.equal(sniffImage(Buffer.from('<!DOCTYPE html><html>....')), null);
});

test('obverseKeyForYear: monarch era split at 2023', () => {
  assert.equal(obverseKeyForYear('2011'), 'qe2-obv');
  assert.equal(obverseKeyForYear('2022'), 'qe2-obv');
  assert.equal(obverseKeyForYear('2023'), 'kc3-obv');
  assert.equal(obverseKeyForYear('2026'), 'kc3-obv');
});

test('auditAndDownload dry run classifies without network', async () => {
  const entries = filterRows(parseCsv(FIXTURE), 'London 2012 Olympics', '50p');
  const results = await auditAndDownload(entries, { dryRun: true });
  const by = vc => results.find(r => r.vc === vc);
  assert.equal(by('UK-D-50P-2011-ARCH-').outcome, 'has-url');
  assert.equal(by('UK-D-50P-2011-ATHL-').outcome, 'no-url');
  assert.equal(by('UK-D-50P-2011-ARCH-').host, 'example.com');
});

test('auditAndDownload skips variants with existing textures', async () => {
  const entries = filterRows(parseCsv(FIXTURE), 'Lord of the Rings', '50p');
  const results = await auditAndDownload(entries, { dryRun: true });
  assert.equal(results[0].vc, 'UK-D-50P-2026-LOTS-');
  assert.equal(results[0].outcome, 'skipped-existing'); // texture committed in repo
});

test('buildSummary includes host table and fix list with sheet rows', async () => {
  const entries = filterRows(parseCsv(FIXTURE), 'London 2012 Olympics', '50p');
  const results = await auditAndDownload(entries, { dryRun: true });
  const md = buildSummary({ collection: 'London 2012 Olympics', denomination: '50p', dryRun: true }, results, ['test warning']);
  assert.match(md, /\| example\.com \|/);
  assert.match(md, /Row 3.*Athletics.*no imageUrl/);
  assert.match(md, /⚠️ test warning/);
});

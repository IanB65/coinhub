#!/usr/bin/env node
// Fetches a full backup from /api/backup and saves dated JSON files to backups/.
// Prunes backups older than KEEP_WEEKS weeks.
// Run via Claude Code routine: node scripts/backup.js

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const API_URL = 'https://coins.ghghome.co.uk/api/backup';
const KEEP_WEEKS = 8;
const BACKUPS_DIR = path.join(__dirname, '..', 'backups');

function get(url, serviceKey) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { headers: { 'x-service-key': serviceKey } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        if (res.statusCode !== 200) reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        else resolve(JSON.parse(body));
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function pruneOldBackups() {
  if (!fs.existsSync(BACKUPS_DIR)) return;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - KEEP_WEEKS * 7);

  const dirs = fs.readdirSync(BACKUPS_DIR).filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name));
  for (const dir of dirs) {
    const dirDate = new Date(dir);
    if (!isNaN(dirDate) && dirDate < cutoff) {
      fs.rmSync(path.join(BACKUPS_DIR, dir), { recursive: true, force: true });
      console.log(`Pruned old backup: ${dir}`);
    }
  }
}

async function main() {
  const serviceKey = process.env.COINHUB_SERVICE_KEY;
  if (!serviceKey) {
    console.error('COINHUB_SERVICE_KEY env var not set');
    process.exit(1);
  }

  console.log('Fetching backup from API...');
  const data = await get(API_URL, serviceKey);

  const dateStr = isoDate(new Date(data.timestamp || Date.now()));
  const outDir = path.join(BACKUPS_DIR, dateStr);
  fs.mkdirSync(outDir, { recursive: true });

  const sheetsFile = path.join(outDir, 'sheets-data.json');
  const configFile = path.join(outDir, 'config.json');

  fs.writeFileSync(sheetsFile, JSON.stringify({ timestamp: data.timestamp, data: data.sheetsData }, null, 2));
  fs.writeFileSync(configFile, JSON.stringify({ timestamp: data.timestamp, data: data.configData }, null, 2));

  console.log(`Saved: backups/${dateStr}/sheets-data.json`);
  console.log(`Saved: backups/${dateStr}/config.json`);

  pruneOldBackups();

  const repoRoot = path.join(__dirname, '..');
  execSync('git add backups/', { cwd: repoRoot, stdio: 'inherit' });
  execSync(`git commit -m "chore: weekly backup ${dateStr}"`, { cwd: repoRoot, stdio: 'inherit' });
  execSync('git push -u origin HEAD', { cwd: repoRoot, stdio: 'inherit' });

  console.log(`Backup complete: ${dateStr}`);
}

main().catch(err => {
  console.error('Backup failed:', err.message);
  process.exit(1);
});

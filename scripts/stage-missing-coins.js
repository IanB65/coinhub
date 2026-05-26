#!/usr/bin/env node
/**
 * stage-missing-coins.js
 *
 * Stages all known UK £2, 50p, and £1 coin variants to NewCoinsInbox.
 * The inbox-stage API deduplicates against existing Variants + inbox rows,
 * so only genuinely missing variants will be added for Ian's review.
 *
 * Usage:
 *   node scripts/stage-missing-coins.js [--dry-run] [--denom £2|50p|£1]
 *
 * Env vars required:
 *   COINHUB_SERVICE_KEY  – shared secret for /api/inbox-stage
 */

const API_BASE = process.env.API_BASE || 'https://coins.ghghome.co.uk';
const SERVICE_KEY = process.env.COINHUB_SERVICE_KEY || '';
const DRY_RUN = process.argv.includes('--dry-run');
const DENOM_FILTER = (() => { const i = process.argv.indexOf('--denom'); return i >= 0 ? process.argv[i + 1] : null; })();

const QE2 = 'Queen Elizabeth II';
const KC3 = 'King Charles III';
const COMM = 'Commemorative';
const DEFS = 'Definitives';
const SRC_50P = 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/fifty-pence-coin/';
const SRC_£2  = 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/';
const SRC_£1  = 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/one-pound-coin/';

// ── UK £2 COINS ──────────────────────────────────────────────────────────────

const COINS_£2 = [
  // Pre-1997 single-metal commemoratives
  { variantCode: 'UK-COMM-£2-1986-CG86-', name: 'XIII Commonwealth Games Edinburgh',           denomination: '£2', collection: COMM, monarch: QE2, year: '1986', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-1989-BLRT-', name: 'Bill of Rights 300th Anniversary',             denomination: '£2', collection: COMM, monarch: QE2, year: '1989', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-1989-CLRT-', name: 'Claim of Right 300th Anniversary',             denomination: '£2', collection: COMM, monarch: QE2, year: '1989', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-1994-BKOE-', name: 'Bank of England 300th Anniversary',            denomination: '£2', collection: COMM, monarch: QE2, year: '1994', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-1995-WW50-', name: 'WWII 50th Anniversary',                        denomination: '£2', collection: COMM, monarch: QE2, year: '1995', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-1995-UN50-', name: 'United Nations 50th Anniversary',              denomination: '£2', collection: COMM, monarch: QE2, year: '1995', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-1996-EUR6-', name: 'European Football Championship Euro 96',       denomination: '£2', collection: COMM, monarch: QE2, year: '1996', imageUrl: '', sourceUrl: SRC_£2 },

  // Bimetallic definitives: Technology design (1997–2015)
  ...['1997','1998','1999','2000','2001','2002','2003','2004','2005','2006','2007','2008','2009','2010','2011','2012','2013','2014','2015']
    .map(y => ({ variantCode: `UK-D-£2-${y}-TECH-`, name: 'Technology Advances', denomination: '£2', collection: DEFS, monarch: QE2, year: y, imageUrl: '', sourceUrl: SRC_£2 })),

  // Bimetallic definitives: Britannia design (2015–2022)
  ...['2015','2016','2017','2018','2019','2020','2021','2022']
    .map(y => ({ variantCode: `UK-D-£2-${y}-BRIT-`, name: 'Britannia', denomination: '£2', collection: DEFS, monarch: QE2, year: y, imageUrl: '', sourceUrl: SRC_£2 })),

  // Bimetallic definitives: National Flowers design (2023+, Charles III)
  ...['2023','2024','2025','2026']
    .map(y => ({ variantCode: `UK-D-£2-${y}-FLOR-`, name: 'National Flowers', denomination: '£2', collection: DEFS, monarch: KC3, year: y, imageUrl: '', sourceUrl: SRC_£2 })),

  // Bimetallic commemoratives
  { variantCode: 'UK-COMM-£2-1999-RWCU-', name: 'Rugby World Cup',                              denomination: '£2', collection: COMM, monarch: QE2, year: '1999', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2001-MARC-', name: 'Marconi Transatlantic Wireless 100th Anniversary', denomination: '£2', collection: COMM, monarch: QE2, year: '2001', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2002-CGME-', name: 'Commonwealth Games Manchester — England',      denomination: '£2', collection: COMM, monarch: QE2, year: '2002', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2002-CGMW-', name: 'Commonwealth Games Manchester — Wales',        denomination: '£2', collection: COMM, monarch: QE2, year: '2002', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2002-CGMS-', name: 'Commonwealth Games Manchester — Scotland',     denomination: '£2', collection: COMM, monarch: QE2, year: '2002', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2002-CGMN-', name: 'Commonwealth Games Manchester — Northern Ireland', denomination: '£2', collection: COMM, monarch: QE2, year: '2002', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2003-DNA1-', name: 'Discovery of DNA 50th Anniversary',            denomination: '£2', collection: COMM, monarch: QE2, year: '2003', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2004-TREV-', name: "Trevithick's Steam Locomotive 200th Anniversary", denomination: '£2', collection: COMM, monarch: QE2, year: '2004', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2005-WW60-', name: 'WWII 60th Anniversary',                        denomination: '£2', collection: COMM, monarch: QE2, year: '2005', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2005-GUNP-', name: 'Gunpowder Plot 400th Anniversary',             denomination: '£2', collection: COMM, monarch: QE2, year: '2005', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2006-BRNP-', name: 'Isambard Kingdom Brunel — Portrait',           denomination: '£2', collection: COMM, monarch: QE2, year: '2006', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2006-BRNS-', name: 'Isambard Kingdom Brunel — Paddington Station', denomination: '£2', collection: COMM, monarch: QE2, year: '2006', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2007-ACTU-', name: 'Act of Union 300th Anniversary',               denomination: '£2', collection: COMM, monarch: QE2, year: '2007', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2007-ABST-', name: 'Abolition of the Slave Trade 200th Anniversary', denomination: '£2', collection: COMM, monarch: QE2, year: '2007', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2008-OLHN-', name: 'Olympic Games Handover Beijing to London',     denomination: '£2', collection: COMM, monarch: QE2, year: '2008', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2009-BURN-', name: 'Robert Burns 250th Anniversary',               denomination: '£2', collection: COMM, monarch: QE2, year: '2009', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2009-DARW-', name: 'Charles Darwin 200th Anniversary',             denomination: '£2', collection: COMM, monarch: QE2, year: '2009', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2010-NGHT-', name: 'Florence Nightingale 100th Death Anniversary', denomination: '£2', collection: COMM, monarch: QE2, year: '2010', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2011-KJBI-', name: 'King James Bible 400th Anniversary',           denomination: '£2', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2011-MARY-', name: 'Mary Rose 500th Anniversary',                  denomination: '£2', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2012-DICK-', name: 'Charles Dickens 200th Birth Anniversary',      denomination: '£2', collection: COMM, monarch: QE2, year: '2012', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2012-OLHR-', name: 'Olympic Games Handover London to Rio',         denomination: '£2', collection: COMM, monarch: QE2, year: '2012', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2013-UGTK-', name: 'London Underground 150th Anniversary — Train', denomination: '£2', collection: COMM, monarch: QE2, year: '2013', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2013-UGRD-', name: 'London Underground 150th Anniversary — Roundel', denomination: '£2', collection: COMM, monarch: QE2, year: '2013', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2013-GUIN-', name: 'Guinea 350th Anniversary',                     denomination: '£2', collection: COMM, monarch: QE2, year: '2013', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2014-WWIO-', name: 'First World War Outbreak 100th Anniversary',   denomination: '£2', collection: COMM, monarch: QE2, year: '2014', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2014-TRHS-', name: 'Trinity House 500th Anniversary',              denomination: '£2', collection: COMM, monarch: QE2, year: '2014', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2015-MAGN-', name: 'Magna Carta 800th Anniversary',                denomination: '£2', collection: COMM, monarch: QE2, year: '2015', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2015-RNVY-', name: 'WWI Centenary — Royal Navy',                   denomination: '£2', collection: COMM, monarch: QE2, year: '2015', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2016-SHKT-', name: 'Shakespeare 400th Anniversary — Tragedies',    denomination: '£2', collection: COMM, monarch: QE2, year: '2016', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2016-SHKC-', name: 'Shakespeare 400th Anniversary — Comedies',     denomination: '£2', collection: COMM, monarch: QE2, year: '2016', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2016-SHKH-', name: 'Shakespeare 400th Anniversary — Histories',    denomination: '£2', collection: COMM, monarch: QE2, year: '2016', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2016-ARMY-', name: 'WWI Centenary — The Army',                     denomination: '£2', collection: COMM, monarch: QE2, year: '2016', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2016-GFIR-', name: 'Great Fire of London 350th Anniversary',       denomination: '£2', collection: COMM, monarch: QE2, year: '2016', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2017-AUST-', name: 'Jane Austen 200th Death Anniversary',          denomination: '£2', collection: COMM, monarch: QE2, year: '2017', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2017-WAVI-', name: 'WWI Centenary — Aviation',                     denomination: '£2', collection: COMM, monarch: QE2, year: '2017', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2018-RAF1-', name: 'Royal Air Force 100th Anniversary',            denomination: '£2', collection: COMM, monarch: QE2, year: '2018', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2018-ARMI-', name: 'WWI Armistice 100th Anniversary',              denomination: '£2', collection: COMM, monarch: QE2, year: '2018', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2018-MSFR-', name: "Mary Shelley's Frankenstein 200th Anniversary", denomination: '£2', collection: COMM, monarch: QE2, year: '2018', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2019-DDAY-', name: 'D-Day 75th Anniversary',                       denomination: '£2', collection: COMM, monarch: QE2, year: '2019', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2019-WEDG-', name: 'Josiah Wedgwood 260th Anniversary',            denomination: '£2', collection: COMM, monarch: QE2, year: '2019', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2019-PEPY-', name: 'Samuel Pepys Diary 350th Anniversary',         denomination: '£2', collection: COMM, monarch: QE2, year: '2019', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2020-AGAT-', name: 'Agatha Christie 100 Years of Mystery',         denomination: '£2', collection: COMM, monarch: QE2, year: '2020', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2020-VEDA-', name: 'VE Day 75th Anniversary',                      denomination: '£2', collection: COMM, monarch: QE2, year: '2020', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2020-MAYF-', name: 'Mayflower 400th Anniversary',                  denomination: '£2', collection: COMM, monarch: QE2, year: '2020', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2021-HGWL-', name: 'H.G. Wells 75th Death Anniversary',            denomination: '£2', collection: COMM, monarch: QE2, year: '2021', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2021-WSCO-', name: 'Sir Walter Scott 250th Birth Anniversary',     denomination: '£2', collection: COMM, monarch: QE2, year: '2021', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2022-VERL-', name: 'Dame Vera Lynn',                               denomination: '£2', collection: COMM, monarch: QE2, year: '2022', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2022-BELL-', name: 'Alexander Graham Bell',                        denomination: '£2', collection: COMM, monarch: QE2, year: '2022', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2022-25YR-', name: '25th Anniversary of the £2 Coin',              denomination: '£2', collection: COMM, monarch: QE2, year: '2022', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2022-FACP-', name: 'FA Cup 150th Anniversary',                     denomination: '£2', collection: COMM, monarch: QE2, year: '2022', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2023-FSCO-', name: 'Flying Scotsman Centenary',                    denomination: '£2', collection: COMM, monarch: KC3, year: '2023', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2023-TOLK-', name: 'JRR Tolkien — Writer, Poet, Scholar',          denomination: '£2', collection: COMM, monarch: KC3, year: '2023', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2024-CHRC-', name: 'Winston Churchill 150th Birth Anniversary',    denomination: '£2', collection: COMM, monarch: KC3, year: '2024', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2024-NTLG-', name: 'National Gallery 200th Anniversary',           denomination: '£2', collection: COMM, monarch: KC3, year: '2024', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2025-ORWL-', name: 'George Orwell 75th Death Anniversary',         denomination: '£2', collection: COMM, monarch: KC3, year: '2025', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2025-MDRW-', name: '200 Years of the Modern Railway',              denomination: '£2', collection: COMM, monarch: KC3, year: '2025', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2025-ROBS-', name: 'Royal Observatory Greenwich 350th Anniversary', denomination: '£2', collection: COMM, monarch: KC3, year: '2025', imageUrl: '', sourceUrl: SRC_£2 },
  { variantCode: 'UK-COMM-£2-2026-ZSLL-', name: '200 Years of ZSL — Zoological Society of London', denomination: '£2', collection: COMM, monarch: KC3, year: '2026', imageUrl: '', sourceUrl: SRC_£2 },
];

// ── UK 50p COINS ─────────────────────────────────────────────────────────────

const COINS_50P = [
  // ── Definitives ───────────────────────────────────────────────────────────
  // Britannia reverse (Christopher Ironside design, major design eras)
  ...['2008','2009','2010','2011','2012','2013','2014','2015','2016','2017','2018','2019','2020','2021','2022']
    .map(y => ({ variantCode: `UK-D-50P-${y}-BRIT-`, name: 'Britannia', denomination: '50p', collection: DEFS, monarch: QE2, year: y, imageUrl: '', sourceUrl: SRC_50P })),
  ...['2023','2024','2025','2026']
    .map(y => ({ variantCode: `UK-D-50P-${y}-BRIT-`, name: 'Britannia', denomination: '50p', collection: DEFS, monarch: KC3, year: y, imageUrl: '', sourceUrl: SRC_50P })),

  // ── Commemoratives ────────────────────────────────────────────────────────
  { variantCode: 'UK-COMM-50P-1992-ECPR-', name: 'EC Presidency',                                 denomination: '50p', collection: COMM, monarch: QE2, year: '1992', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-1994-DDAY-', name: 'D-Day 50th Anniversary',                        denomination: '50p', collection: COMM, monarch: QE2, year: '1994', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-1998-NHSA-', name: 'National Health Service 50th Anniversary',      denomination: '50p', collection: COMM, monarch: QE2, year: '1998', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2000-PLIB-', name: 'Public Libraries 150th Anniversary',            denomination: '50p', collection: COMM, monarch: QE2, year: '2000', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2003-SUFR-', name: 'Suffragette',                                   denomination: '50p', collection: COMM, monarch: QE2, year: '2003', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2004-RBAN-', name: 'Roger Bannister Four-Minute Mile 50th Anniversary', denomination: '50p', collection: COMM, monarch: QE2, year: '2004', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2005-SJOH-', name: 'Samuel Johnson Dictionary 250th Anniversary',  denomination: '50p', collection: COMM, monarch: QE2, year: '2005', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2006-VCHA-', name: 'Victoria Cross — Heroic Acts',                  denomination: '50p', collection: COMM, monarch: QE2, year: '2006', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2006-VCAV-', name: 'Victoria Cross — Awarded for Valour',           denomination: '50p', collection: COMM, monarch: QE2, year: '2006', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2007-SCOU-', name: 'Scouting Centenary',                            denomination: '50p', collection: COMM, monarch: QE2, year: '2007', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2009-KGDN-', name: 'Kew Gardens',                                   denomination: '50p', collection: COMM, monarch: QE2, year: '2009', imageUrl: '', sourceUrl: SRC_50P },

  // 2012 London Olympics set — 29 sport designs, dated 2011 on coin
  { variantCode: 'UK-COMM-50P-2011-OAQU-', name: 'London 2012 Olympics — Aquatics',               denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OARC-', name: 'London 2012 Olympics — Archery',                denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OATH-', name: 'London 2012 Olympics — Athletics',              denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OBAD-', name: 'London 2012 Olympics — Badminton',              denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OBSK-', name: 'London 2012 Olympics — Basketball',             denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OBOC-', name: 'London 2012 Olympics — Boccia',                 denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OBOX-', name: 'London 2012 Olympics — Boxing',                 denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OCAN-', name: 'London 2012 Olympics — Canoeing',               denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OCYC-', name: 'London 2012 Olympics — Cycling',                denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OEQU-', name: 'London 2012 Olympics — Equestrian',             denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OFEN-', name: 'London 2012 Olympics — Fencing',                denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OFOO-', name: 'London 2012 Olympics — Football',               denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OGYM-', name: 'London 2012 Olympics — Gymnastics',             denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OHAN-', name: 'London 2012 Olympics — Handball',               denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OHOC-', name: 'London 2012 Olympics — Hockey',                 denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OJUD-', name: 'London 2012 Olympics — Judo',                   denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OMPE-', name: 'London 2012 Olympics — Modern Pentathlon',      denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OROW-', name: 'London 2012 Olympics — Rowing',                 denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OSAI-', name: 'London 2012 Olympics — Sailing',                denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OSHO-', name: 'London 2012 Olympics — Shooting',               denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OTTA-', name: 'London 2012 Olympics — Table Tennis',           denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OTAE-', name: 'London 2012 Olympics — Taekwondo',              denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OTEN-', name: 'London 2012 Olympics — Tennis',                 denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OTRI-', name: 'London 2012 Olympics — Triathlon',              denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OVOL-', name: 'London 2012 Olympics — Volleyball',             denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OWLI-', name: 'London 2012 Olympics — Weightlifting',          denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OWRE-', name: 'London 2012 Olympics — Wrestling',              denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OGBL-', name: 'London 2012 Paralympics — Goalball',            denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2011-OWRU-', name: 'London 2012 Paralympics — Wheelchair Rugby',   denomination: '50p', collection: COMM, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_50P },

  { variantCode: 'UK-COMM-50P-2013-IRON-', name: 'Christopher Ironside 50p Design',              denomination: '50p', collection: COMM, monarch: QE2, year: '2013', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2013-BRIT-', name: 'Benjamin Britten Centenary',                    denomination: '50p', collection: COMM, monarch: QE2, year: '2013', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2014-GCWG-', name: 'Glasgow Commonwealth Games',                    denomination: '50p', collection: COMM, monarch: QE2, year: '2014', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2015-MAGN-', name: 'Magna Carta 800th Anniversary',                 denomination: '50p', collection: COMM, monarch: QE2, year: '2015', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2016-TGBR-', name: 'Team GB — Rio 2016',                            denomination: '50p', collection: COMM, monarch: QE2, year: '2016', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2016-PRAB-', name: 'Peter Rabbit 150th Anniversary of Beatrix Potter', denomination: '50p', collection: COMM, monarch: QE2, year: '2016', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2017-NEWT-', name: 'Sir Isaac Newton',                              denomination: '50p', collection: COMM, monarch: QE2, year: '2017', imageUrl: '', sourceUrl: SRC_50P },

  // Beatrix Potter series
  { variantCode: 'UK-COMM-50P-2017-JPUD-', name: 'Jemima Puddle-Duck',                            denomination: '50p', collection: COMM, monarch: QE2, year: '2017', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2017-BBNM-', name: 'Benjamin Bunny',                                denomination: '50p', collection: COMM, monarch: QE2, year: '2017', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2017-MTWK-', name: 'Mrs Tiggy-Winkle',                              denomination: '50p', collection: COMM, monarch: QE2, year: '2017', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2017-PRAB-', name: 'Peter Rabbit',                                  denomination: '50p', collection: COMM, monarch: QE2, year: '2017', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2018-PRAB-', name: 'Peter Rabbit — Running',                        denomination: '50p', collection: COMM, monarch: QE2, year: '2018', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2018-FLBN-', name: 'Flopsy Bunny',                                  denomination: '50p', collection: COMM, monarch: QE2, year: '2018', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2018-JFSH-', name: 'Mr Jeremy Fisher',                              denomination: '50p', collection: COMM, monarch: QE2, year: '2018', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2018-MTWK-', name: 'Mrs Tiggy-Winkle — Washing',                    denomination: '50p', collection: COMM, monarch: QE2, year: '2018', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2019-TOLG-', name: 'The Tailor of Gloucester',                      denomination: '50p', collection: COMM, monarch: QE2, year: '2019', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2019-SQNK-', name: 'Squirrel Nutkin',                               denomination: '50p', collection: COMM, monarch: QE2, year: '2019', imageUrl: '', sourceUrl: SRC_50P },

  { variantCode: 'UK-COMM-50P-2018-ROPA-', name: 'Representation of the People Act Centenary',   denomination: '50p', collection: COMM, monarch: QE2, year: '2018', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2019-HAWK-', name: 'Stephen Hawking',                               denomination: '50p', collection: COMM, monarch: QE2, year: '2019', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2019-PDST-', name: 'Paddington at the Station',                     denomination: '50p', collection: COMM, monarch: QE2, year: '2019', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2019-PDPL-', name: 'Paddington at the Palace',                      denomination: '50p', collection: COMM, monarch: QE2, year: '2019', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2020-DVBT-', name: 'Diversity Built Britain',                       denomination: '50p', collection: COMM, monarch: QE2, year: '2020', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2020-QCKT-', name: 'Quick Cricket',                                 denomination: '50p', collection: COMM, monarch: QE2, year: '2020', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2021-GRUF-', name: 'The Gruffalo',                                  denomination: '50p', collection: COMM, monarch: QE2, year: '2021', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2021-WNPH-', name: 'Winnie the Pooh',                               denomination: '50p', collection: COMM, monarch: QE2, year: '2021', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2022-EEC5-', name: 'EEC 50th Anniversary',                          denomination: '50p', collection: COMM, monarch: QE2, year: '2022', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2022-PDTW-', name: 'Paddington at the Tower',                       denomination: '50p', collection: COMM, monarch: QE2, year: '2022', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2022-PDSP-', name: 'Paddington at St Pauls',                        denomination: '50p', collection: COMM, monarch: QE2, year: '2022', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2022-PTJB-', name: "Queen's Platinum Jubilee",                      denomination: '50p', collection: COMM, monarch: QE2, year: '2022', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2023-ATWR-', name: 'Dame Alice Wheeler',                            denomination: '50p', collection: COMM, monarch: KC3, year: '2023', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2023-PDLM-', name: 'Paddington in Lima',                            denomination: '50p', collection: COMM, monarch: KC3, year: '2023', imageUrl: '', sourceUrl: SRC_50P },
  { variantCode: 'UK-COMM-50P-2024-NFST-', name: 'Nurse Florence Nightingale',                    denomination: '50p', collection: COMM, monarch: KC3, year: '2024', imageUrl: '', sourceUrl: SRC_50P },
];

// ── UK £1 COINS ──────────────────────────────────────────────────────────────

const COINS_£1 = [
  // ── Old round £1 definitives (1983–2016) ─────────────────────────────────
  // Each year had a distinctive reverse design
  { variantCode: 'UK-D-£1-1983-RYAM-', name: 'Royal Arms',                    denomination: '£1', collection: DEFS, monarch: QE2, year: '1983', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-1984-SCTS-', name: 'Scottish Thistle',              denomination: '£1', collection: DEFS, monarch: QE2, year: '1984', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-1985-WLLK-', name: 'Welsh Leek',                    denomination: '£1', collection: DEFS, monarch: QE2, year: '1985', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-1986-NIFX-', name: 'Northern Irish Flax',           denomination: '£1', collection: DEFS, monarch: QE2, year: '1986', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-1987-ENOK-', name: 'English Oak',                   denomination: '£1', collection: DEFS, monarch: QE2, year: '1987', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-1988-RYAM-', name: 'Royal Arms',                    denomination: '£1', collection: DEFS, monarch: QE2, year: '1988', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-1989-ECAS-', name: 'Edinburgh Castle',              denomination: '£1', collection: DEFS, monarch: QE2, year: '1989', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-1990-WLDG-', name: 'Welsh Dragon',                  denomination: '£1', collection: DEFS, monarch: QE2, year: '1990', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-1991-NIHP-', name: 'Northern Irish Crowned Harp',   denomination: '£1', collection: DEFS, monarch: QE2, year: '1991', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-1992-ENTL-', name: 'English Three Lions',           denomination: '£1', collection: DEFS, monarch: QE2, year: '1992', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-1993-RYAM-', name: 'Royal Arms',                    denomination: '£1', collection: DEFS, monarch: QE2, year: '1993', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-1994-SCLR-', name: 'Scottish Lion Rampant',         denomination: '£1', collection: DEFS, monarch: QE2, year: '1994', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-1995-WLDG-', name: 'Welsh Dragon',                  denomination: '£1', collection: DEFS, monarch: QE2, year: '1995', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-1996-NICC-', name: 'Northern Irish Celtic Cross',   denomination: '£1', collection: DEFS, monarch: QE2, year: '1996', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-1997-ENTL-', name: 'English Three Lions',           denomination: '£1', collection: DEFS, monarch: QE2, year: '1997', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-1998-RYAM-', name: 'Royal Arms',                    denomination: '£1', collection: DEFS, monarch: QE2, year: '1998', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-1999-ECAS-', name: 'Scottish Parliament — Edinburgh', denomination: '£1', collection: DEFS, monarch: QE2, year: '1999', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-2000-WLDG-', name: 'Welsh Dragon',                  denomination: '£1', collection: DEFS, monarch: QE2, year: '2000', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-2001-NIHP-', name: 'Northern Irish Crowned Harp',   denomination: '£1', collection: DEFS, monarch: QE2, year: '2001', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-2002-ENTL-', name: 'English Three Lions',           denomination: '£1', collection: DEFS, monarch: QE2, year: '2002', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-2003-RYAM-', name: 'Royal Arms',                    denomination: '£1', collection: DEFS, monarch: QE2, year: '2003', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-2004-FORE-', name: 'Forth Railway Bridge',          denomination: '£1', collection: DEFS, monarch: QE2, year: '2004', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-2005-MENA-', name: 'Menai Suspension Bridge',       denomination: '£1', collection: DEFS, monarch: QE2, year: '2005', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-2006-EGYP-', name: 'Egyptian Arch Railway Bridge',  denomination: '£1', collection: DEFS, monarch: QE2, year: '2006', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-2007-GATE-', name: 'Gateshead Millennium Bridge',   denomination: '£1', collection: DEFS, monarch: QE2, year: '2007', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-2008-RYAM-', name: 'Royal Arms',                    denomination: '£1', collection: DEFS, monarch: QE2, year: '2008', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-2009-SCTS-', name: 'Scottish Thistle and Bluebell', denomination: '£1', collection: DEFS, monarch: QE2, year: '2009', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-2010-LOND-', name: 'London',                        denomination: '£1', collection: DEFS, monarch: QE2, year: '2010', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-2011-EDIN-', name: 'Edinburgh',                     denomination: '£1', collection: DEFS, monarch: QE2, year: '2011', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-2012-CARD-', name: 'Cardiff',                       denomination: '£1', collection: DEFS, monarch: QE2, year: '2012', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-2013-BELF-', name: 'Belfast',                       denomination: '£1', collection: DEFS, monarch: QE2, year: '2013', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-2014-FLHE-', name: 'Floral Heraldry — England',     denomination: '£1', collection: DEFS, monarch: QE2, year: '2014', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-2015-RYAM-', name: 'Royal Arms',                    denomination: '£1', collection: DEFS, monarch: QE2, year: '2015', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-2016-LAST-', name: 'Last Round Pound — Royal Arms', denomination: '£1', collection: DEFS, monarch: QE2, year: '2016', imageUrl: '', sourceUrl: SRC_£1 },

  // ── New 12-sided bimetallic £1 (2017+) ────────────────────────────────────
  { variantCode: 'UK-D-£1-2017-NTCR-', name: 'Nations of the Crown',          denomination: '£1', collection: DEFS, monarch: QE2, year: '2017', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-2023-NTCR-', name: 'Nations of the Crown',          denomination: '£1', collection: DEFS, monarch: KC3, year: '2023', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-2024-NTCR-', name: 'Nations of the Crown',          denomination: '£1', collection: DEFS, monarch: KC3, year: '2024', imageUrl: '', sourceUrl: SRC_£1 },
  { variantCode: 'UK-D-£1-2025-NTCR-', name: 'Nations of the Crown',          denomination: '£1', collection: DEFS, monarch: KC3, year: '2025', imageUrl: '', sourceUrl: SRC_£1 },

  // ── £1 Commemoratives ─────────────────────────────────────────────────────
  { variantCode: 'UK-COMM-£1-2017-BLRD-', name: 'Sir Isaac Newton — Royal Mint 1,100th Anniversary', denomination: '£1', collection: COMM, monarch: QE2, year: '2017', imageUrl: '', sourceUrl: SRC_£1 },
];

// ── COMBINED MASTER LIST ──────────────────────────────────────────────────────

let MASTER_LIST = [...COINS_£2, ...COINS_50P, ...COINS_£1];

if (DENOM_FILTER) {
  MASTER_LIST = MASTER_LIST.filter(c => c.denomination === DENOM_FILTER);
  console.log(`Filtered to denomination: ${DENOM_FILTER}`);
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`UK coin variant checker — ${MASTER_LIST.length} coins in master list (£2: ${COINS_£2.length}, 50p: ${COINS_50P.length}, £1: ${COINS_£1.length})`);
  if (DRY_RUN) console.log('DRY RUN — will not stage anything\n');

  if (!DRY_RUN && !SERVICE_KEY) {
    console.error('ERROR: COINHUB_SERVICE_KEY env var is required (or use --dry-run)');
    process.exit(1);
  }

  if (DRY_RUN) {
    for (const coin of MASTER_LIST) {
      console.log(`  ${coin.denomination} | ${coin.year} | ${coin.collection} | ${coin.name} | ${coin.variantCode}`);
    }
    console.log(`\nTotal: ${MASTER_LIST.length} coins`);
    return;
  }

  const BATCH = 50;
  let totalStaged = 0;
  let totalSkipped = 0;

  for (let i = 0; i < MASTER_LIST.length; i += BATCH) {
    const batch = MASTER_LIST.slice(i, i + BATCH);
    const resp = await fetch(`${API_BASE}/api/inbox-stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-key': SERVICE_KEY },
      body: JSON.stringify({ coins: batch }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`Batch ${i}–${i + BATCH - 1} failed (${resp.status}): ${text}`);
      process.exit(1);
    }

    const { staged, skipped } = await resp.json();
    totalStaged += staged;
    totalSkipped += skipped;
    console.log(`Batch ${Math.floor(i / BATCH) + 1}: staged ${staged}, skipped ${skipped}`);
  }

  console.log(`\nDone. Staged ${totalStaged} new variants, skipped ${totalSkipped} already present.`);
  if (totalStaged > 0) console.log('Review staged coins in Admin → New Coins Inbox.');
}

main().catch(err => { console.error(err); process.exit(1); });

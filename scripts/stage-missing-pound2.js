#!/usr/bin/env node
/**
 * stage-missing-pound2.js
 *
 * Stages all known UK £2 coin variants to NewCoinsInbox.
 * The inbox-stage API auto-deduplicates against existing Variants + inbox rows,
 * so only genuinely missing variants will be added for Ian's review.
 *
 * Usage:
 *   node scripts/stage-missing-pound2.js [--dry-run]
 *
 * Env vars required:
 *   COINHUB_SERVICE_KEY  – shared secret for /api/inbox-stage
 *
 * By default hits the live API. Set API_BASE to override.
 */

const API_BASE = process.env.API_BASE || 'https://coins.ghghome.co.uk';
const SERVICE_KEY = process.env.COINHUB_SERVICE_KEY || '';
const DRY_RUN = process.argv.includes('--dry-run');

// ──────────────────────────────────────────────────────────────────────────────
// Master list of all known UK £2 coin variants
// ──────────────────────────────────────────────────────────────────────────────

const QE2 = 'Queen Elizabeth II';
const KC3 = 'King Charles III';
const COMM = 'Commemorative';
const DEFS = 'Definitives';

/** @type {Array<{variantCode:string, name:string, denomination:string, collection:string, monarch:string, year:string, imageUrl:string, sourceUrl:string}>} */
const MASTER_LIST = [

  // ── Pre-1997 single-metal commemoratives ─────────────────────────────────
  {
    variantCode: 'UK-COMM-£2-1986-CG86-',
    name: 'XIII Commonwealth Games Edinburgh',
    denomination: '£2', collection: COMM, monarch: QE2, year: '1986',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-1989-BLRT-',
    name: 'Bill of Rights 300th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '1989',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-1989-CLRT-',
    name: 'Claim of Right 300th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '1989',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-1994-BKOE-',
    name: 'Bank of England 300th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '1994',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-1995-WW50-',
    name: 'WWII 50th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '1995',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-1995-UN50-',
    name: 'United Nations 50th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '1995',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-1996-EUR6-',
    name: 'European Football Championship Euro 96',
    denomination: '£2', collection: COMM, monarch: QE2, year: '1996',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },

  // ── Bimetallic definitives: Technology design (1997–2015) ────────────────
  ...['1997','1998','1999','2000','2001','2002','2003','2004','2005',
      '2006','2007','2008','2009','2010','2011','2012','2013','2014','2015']
    .map(year => ({
      variantCode: `UK-D-£2-${year}-TECH-`,
      name: 'Technology Advances',
      denomination: '£2', collection: DEFS, monarch: QE2, year,
      imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
    })),

  // ── Bimetallic definitives: Britannia design (2015–2022) ─────────────────
  ...['2015','2016','2017','2018','2019','2020','2021','2022']
    .map(year => ({
      variantCode: `UK-D-£2-${year}-BRIT-`,
      name: 'Britannia',
      denomination: '£2', collection: DEFS, monarch: QE2, year,
      imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
    })),

  // ── Bimetallic definitives: Heraldic Flowers design (2023+, Charles III) ──
  ...['2023','2024','2025','2026']
    .map(year => ({
      variantCode: `UK-D-£2-${year}-FLOR-`,
      name: 'National Flowers',
      denomination: '£2', collection: DEFS, monarch: KC3, year,
      imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
    })),

  // ── Bimetallic commemoratives ─────────────────────────────────────────────
  {
    variantCode: 'UK-COMM-£2-1999-RWCU-',
    name: 'Rugby World Cup',
    denomination: '£2', collection: COMM, monarch: QE2, year: '1999',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2001-MARC-',
    name: 'Marconi Transatlantic Wireless 100th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2001',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  // 2002 Commonwealth Games Manchester — four nation coins
  {
    variantCode: 'UK-COMM-£2-2002-CGME-',
    name: 'Commonwealth Games Manchester — England',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2002',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2002-CGMW-',
    name: 'Commonwealth Games Manchester — Wales',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2002',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2002-CGMS-',
    name: 'Commonwealth Games Manchester — Scotland',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2002',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2002-CGMN-',
    name: 'Commonwealth Games Manchester — Northern Ireland',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2002',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2003-DNA1-',
    name: 'Discovery of DNA 50th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2003',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2004-TREV-',
    name: "Trevithick's Steam Locomotive 200th Anniversary",
    denomination: '£2', collection: COMM, monarch: QE2, year: '2004',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2005-WW60-',
    name: 'WWII 60th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2005',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2005-GUNP-',
    name: 'Gunpowder Plot 400th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2005',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2006-BRNP-',
    name: 'Isambard Kingdom Brunel — Portrait',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2006',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2006-BRNS-',
    name: 'Isambard Kingdom Brunel — Paddington Station',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2006',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2007-ACTU-',
    name: 'Act of Union 300th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2007',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2007-ABST-',
    name: 'Abolition of the Slave Trade 200th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2007',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2008-OLHN-',
    name: 'Olympic Games Handover Beijing to London',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2008',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2009-BURN-',
    name: 'Robert Burns 250th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2009',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2009-DARW-',
    name: 'Charles Darwin 200th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2009',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2010-NGHT-',
    name: 'Florence Nightingale 100th Death Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2010',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2011-KJBI-',
    name: 'King James Bible 400th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2011',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2011-MARY-',
    name: 'Mary Rose 500th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2011',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2012-DICK-',
    name: 'Charles Dickens 200th Birth Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2012',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2012-OLHR-',
    name: 'Olympic Games Handover London to Rio',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2012',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  // 2013 London Underground — two designs
  {
    variantCode: 'UK-COMM-£2-2013-UGTK-',
    name: 'London Underground 150th Anniversary — Train',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2013',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2013-UGRD-',
    name: 'London Underground 150th Anniversary — Roundel',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2013',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2013-GUIN-',
    name: 'Guinea 350th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2013',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2014-WWIO-',
    name: 'First World War Outbreak 100th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2014',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2014-TRHS-',
    name: 'Trinity House 500th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2014',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2015-MAGN-',
    name: 'Magna Carta 800th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2015',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2015-RNVY-',
    name: 'WWI Centenary — Royal Navy',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2015',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  // 2016 Shakespeare trilogy
  {
    variantCode: 'UK-COMM-£2-2016-SHKT-',
    name: 'Shakespeare 400th Anniversary — Tragedies',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2016',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2016-SHKC-',
    name: 'Shakespeare 400th Anniversary — Comedies',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2016',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2016-SHKH-',
    name: 'Shakespeare 400th Anniversary — Histories',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2016',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2016-ARMY-',
    name: 'WWI Centenary — The Army',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2016',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2016-GFIR-',
    name: 'Great Fire of London 350th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2016',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2017-AUST-',
    name: 'Jane Austen 200th Death Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2017',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2017-WAVI-',
    name: 'WWI Centenary — Aviation',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2017',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2018-RAF1-',
    name: 'Royal Air Force 100th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2018',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2018-ARMI-',
    name: 'WWI Armistice 100th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2018',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2018-MSFR-',
    name: "Mary Shelley's Frankenstein 200th Anniversary",
    denomination: '£2', collection: COMM, monarch: QE2, year: '2018',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2019-DDAY-',
    name: 'D-Day 75th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2019',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2019-WEDG-',
    name: 'Josiah Wedgwood 260th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2019',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2019-PEPY-',
    name: 'Samuel Pepys Diary 350th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2019',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2020-AGAT-',
    name: 'Agatha Christie 100 Years of Mystery',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2020',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/collect/archive/2020/agatha-2020-brilliant-uncirculated-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2020-VEDA-',
    name: 'VE Day 75th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2020',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2020-MAYF-',
    name: 'Mayflower 400th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2020',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/our-coins/events/mayflower/400th-anniversary-of-the-voyage-of-the-mayflower-2020-2-brilliant-uncirculated-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2021-HGWL-',
    name: 'H.G. Wells 75th Death Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2021',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/collect/archive/2021/hg-wells-2-pound-brilliant-uncirculated-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2021-WSCO-',
    name: 'Sir Walter Scott 250th Birth Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2021',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2022-VERL-',
    name: 'Dame Vera Lynn',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2022',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/collect/archive/2022/celebrating-the-life-and-legacy-of-dame-vera-lynn-2022-2-gold-proof-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2022-BELL-',
    name: 'Alexander Graham Bell',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2022',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2022-25YR-',
    name: '25th Anniversary of the £2 Coin',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2022',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2022-FACP-',
    name: 'FA Cup 150th Anniversary',
    denomination: '£2', collection: COMM, monarch: QE2, year: '2022',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2023-FSCO-',
    name: 'Flying Scotsman Centenary',
    denomination: '£2', collection: COMM, monarch: KC3, year: '2023',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/aboutus/press-centre/all-aboard-the-royal-mint-celebrates-the-centenary-of-flying-scotsman-with-a-collectable-2-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2023-TOLK-',
    name: 'JRR Tolkien — Writer, Poet, Scholar',
    denomination: '£2', collection: COMM, monarch: KC3, year: '2023',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/collect/archive/2023-uk-coins/celebrating-the-life-and-work-of-jrr-tolkien-2023-2-pound-brilliant-uncirculated-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2024-CHRC-',
    name: 'Winston Churchill 150th Birth Anniversary',
    denomination: '£2', collection: COMM, monarch: KC3, year: '2024',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/aboutus/press-centre/the-royal-mint-reveals-2024-coins--celebrating-key-events-and-anniversaries-of-the-upcoming-year/',
  },
  {
    variantCode: 'UK-COMM-£2-2024-NTLG-',
    name: 'National Gallery 200th Anniversary',
    denomination: '£2', collection: COMM, monarch: KC3, year: '2024',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/shop/limited-editions/national-gallery/national-gallery-2024-2-pound-brilliant-uncirculated-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2025-ORWL-',
    name: 'George Orwell 75th Death Anniversary',
    denomination: '£2', collection: COMM, monarch: KC3, year: '2025',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/shop/limited-editions/george-orwell/george-orwell-2025-2-pound-brilliant-uncirculated-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2025-MDRW-',
    name: '200 Years of the Modern Railway',
    denomination: '£2', collection: COMM, monarch: KC3, year: '2025',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2025-ROBS-',
    name: 'Royal Observatory Greenwich 350th Anniversary',
    denomination: '£2', collection: COMM, monarch: KC3, year: '2025',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/',
  },
  {
    variantCode: 'UK-COMM-£2-2026-ZSLL-',
    name: '200 Years of ZSL — Zoological Society of London',
    denomination: '£2', collection: COMM, monarch: KC3, year: '2026',
    imageUrl: '', sourceUrl: 'https://www.royalmint.com/shop/limited-editions/200-years-of-zsl/200-years-of-zsl-2026-brilliant-uncirculated-coin/',
  },
];

// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`UK £2 variant checker — ${MASTER_LIST.length} coins in master list`);
  if (DRY_RUN) console.log('DRY RUN — will not stage anything\n');

  if (!DRY_RUN && !SERVICE_KEY) {
    console.error('ERROR: COINHUB_SERVICE_KEY env var is required (or use --dry-run)');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('Master list (would be staged, subject to deduplication):');
    for (const coin of MASTER_LIST) {
      console.log(`  ${coin.year} | ${coin.collection} | ${coin.name} | ${coin.variantCode}`);
    }
    console.log(`\nTotal: ${MASTER_LIST.length} coins`);
    return;
  }

  // Stage in batches of 50
  const BATCH = 50;
  let totalStaged = 0;
  let totalSkipped = 0;

  for (let i = 0; i < MASTER_LIST.length; i += BATCH) {
    const batch = MASTER_LIST.slice(i, i + BATCH);
    const resp = await fetch(`${API_BASE}/api/inbox-stage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-service-key': SERVICE_KEY,
      },
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
    console.log(`Batch ${Math.floor(i / BATCH) + 1}: staged ${staged}, skipped ${skipped} (already in sheet/inbox)`);
  }

  console.log(`\nDone. Staged ${totalStaged} new variants, skipped ${totalSkipped} existing.`);
  if (totalStaged > 0) {
    console.log('Review staged coins in the NewCoinsInbox tab of the Google Sheet.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });

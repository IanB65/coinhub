// One-time endpoint: populates empty notes (col I) in the Variants sheet.
// Call with: curl -X POST -H "x-service-key: YOUR_KEY" https://coins.ghghome.co.uk/api/add-notes
// Delete this file after running.

const crypto = require('crypto');

function verifyServiceKey(req) {
  const key = req.headers['x-service-key'] || '';
  const expected = process.env.COINHUB_SERVICE_KEY || '';
  if (!key || !expected || key.length !== expected.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected)); }
  catch { return false; }
}

async function getAccessToken() {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!resp.ok) throw new Error('Token refresh failed: ' + await resp.text());
  return (await resp.json()).access_token;
}

// Columns: A=variantCode B=name C=denom D=collection E=monarch F=year G=status H=imageUrl I=notes J=dateAdded K=lastModified
const NOTES = {
  // ── £1 ──────────────────────────────────────────────────────────────────
  'UK-D-£1-2007-TGMB-':    "Marks the iconic tilting footbridge spanning the River Tyne between Gateshead and Newcastle, designed by Wilkinson Eyre and opened in 2002. Nicknamed 'the blinking eye' for its rotating mechanism.",
  'UK-D-£1-2023-BBEE-':    "Part of the new Wildlife series introduced under King Charles III. The bumblebee is vital to British agriculture as a pollinator, with several species now listed as endangered.",
  'UK-D-£1-2023-BBEEP-':   "Same Wildlife series bumblebee design as the standard issue, with a Royal Mint privy mark identifying it as from an official collector set.",
  'UK-D-£1-2024-BBEE-':    "2024 annual continuation of the Wildlife series bumblebee definitive, carrying the same reverse design first introduced in 2023.",
  'UK-D-£1-2025-BBEE-':    "2025 annual continuation of the Wildlife series bumblebee definitive.",

  // ── £2 commemorative ────────────────────────────────────────────────────
  'UK-D-£2-2007-ASTA-':    "Marks the 200th anniversary of the Abolition of the Slave Trade Act 1807, a landmark law spearheaded by William Wilberforce that banned British ships from the transatlantic slave trade.",
  'UK-D-£2-2007-AofU-':    "Commemorates the 300th anniversary of the Acts of Union 1707, which united the Kingdom of England and the Kingdom of Scotland into the Kingdom of Great Britain.",
  'UK-D-£2-2007-TECH-':    "2007 proof-set version of the standing Technology Advances reverse; the concentric rings represent human progress from the Iron Age through the Industrial Revolution to the digital era.",
  'UK-D-£2-2020-MAYF-':    "Marks the 400th anniversary of the Mayflower's 1620 voyage, which carried the Pilgrim Fathers from Plymouth, England to Plymouth Rock, laying the foundations of New England.",
  'UK-D-£2-2020-VEDA-':    "Commemorates the 75th anniversary of VE Day, 8 May 1945, marking the formal end of World War II in Europe following Germany's unconditional surrender.",
  'UK-D-£2-2022-25YR-':    "Celebrates 25 years of the bimetallic £2 coin, which entered general circulation in June 1998, replacing the older large single-metal version issued from 1986.",
  'UK-D-£2-2022-BELL-':    "Commemorates Alexander Graham Bell (1847–1922) on the centenary of his death; the Scottish-American inventor received the first patent for a practical telephone in 1876.",
  'UK-D-£2-2022-FACP-':    "Marks 150 years of the FA Cup, first contested in 1871–72; the world's oldest national association football knockout competition, still played at Wembley Stadium today.",
  'UK-D-£2-2023-FSM-':     "Celebrates LNER Class A1 locomotive No. 4472 Flying Scotsman, the first steam locomotive officially verified to reach 100 mph; it is now preserved at the National Railway Museum in York.",
  'UK-D-£2-2023-JRRT-':    "Celebrates J.R.R. Tolkien (1892–1973), Professor of Anglo-Saxon at Oxford and creator of Middle-earth, whose works The Hobbit and The Lord of the Rings defined modern fantasy literature.",
  'UK-D-£2-2024-NTLG-':    "Marks the 200th anniversary of the National Gallery, founded in London in 1824; it houses over 2,300 paintings spanning seven centuries and is free to enter.",
  'UK-D-£2-2025-ORWL-':    "Honours George Orwell (1903–1950), pen name of Eric Arthur Blair; his novels Animal Farm (1945) and Nineteen Eighty-Four (1949) remain definitive works of political satire.",
  'UK-D-£2-2026-ZSLL-':    "Marks 200 years since ZSL London Zoo opened in Regent's Park in 1828, making it the world's oldest scientific zoo and a leading institution in global wildlife conservation.",
  'UK-D-£2-2026-BEAG-':    "Commemorates 200 years since HMS Beagle launched in 1820; the ship is famous for carrying Charles Darwin on the 1831–36 voyage that shaped his theory of evolution by natural selection.",

  // ── £2 Technology Advances definitives ──────────────────────────────────
  'UK-D-£2-1997-TECH-':    "Standard circulation reverse designed by Bruce Rushin; the concentric rings represent the Iron Age, the Industrial Revolution and the Information Age, reflecting two millennia of human progress.",
  'UK-D-£2-1998-TECH-':    "Standard circulation reverse designed by Bruce Rushin; the concentric rings represent the Iron Age, the Industrial Revolution and the Information Age, reflecting two millennia of human progress.",
  'UK-D-£2-1999-TECH-':    "Standard circulation reverse designed by Bruce Rushin; the concentric rings represent the Iron Age, the Industrial Revolution and the Information Age, reflecting two millennia of human progress.",
  'UK-D-£2-2000-TECH-':    "Standard circulation reverse designed by Bruce Rushin; the concentric rings represent the Iron Age, the Industrial Revolution and the Information Age, reflecting two millennia of human progress.",
  'UK-D-£2-2001-TECH-':    "Standard circulation reverse designed by Bruce Rushin; the concentric rings represent the Iron Age, the Industrial Revolution and the Information Age, reflecting two millennia of human progress.",
  'UK-D-£2-2002-TECH-':    "Standard circulation reverse designed by Bruce Rushin; the concentric rings represent the Iron Age, the Industrial Revolution and the Information Age, reflecting two millennia of human progress.",
  'UK-D-£2-2003-TECH-':    "Standard circulation reverse designed by Bruce Rushin; the concentric rings represent the Iron Age, the Industrial Revolution and the Information Age, reflecting two millennia of human progress.",
  'UK-D-£2-2004-TECH-':    "Standard circulation reverse designed by Bruce Rushin; the concentric rings represent the Iron Age, the Industrial Revolution and the Information Age, reflecting two millennia of human progress.",
  'UK-D-£2-2006-TECH-':    "Standard circulation reverse designed by Bruce Rushin; the concentric rings represent the Iron Age, the Industrial Revolution and the Information Age, reflecting two millennia of human progress.",
  'UK-D-£2-2008-TECH-':    "Standard circulation reverse designed by Bruce Rushin; the concentric rings represent the Iron Age, the Industrial Revolution and the Information Age, reflecting two millennia of human progress.",
  'UK-D-£2-2011-TECH-':    "Standard circulation reverse designed by Bruce Rushin; the concentric rings represent the Iron Age, the Industrial Revolution and the Information Age, reflecting two millennia of human progress.",

  // ── £2 Britannia definitives ─────────────────────────────────────────────
  'UK-D-£2-2018-BRIT-':    "Features the Britannia definitive reverse that replaced the Technology Advances design; Britannia, the female personification of Britain, has appeared on British coinage since the reign of Charles II.",
  'UK-D-£2-2019-BRIT-':    "Features the Britannia definitive reverse that replaced the Technology Advances design; Britannia, the female personification of Britain, has appeared on British coinage since the reign of Charles II.",
  'UK-D-£2-2022-BRIT-':    "Features the Britannia definitive reverse that replaced the Technology Advances design; Britannia, the female personification of Britain, has appeared on British coinage since the reign of Charles II.",

  // ── £2 Floral definitives ────────────────────────────────────────────────
  'UK-D-£2-2023-FLOR-':    "First new definitive series under King Charles III; the reverse features intertwined roses, thistles, daffodils and shamrocks representing the four nations of the United Kingdom.",
  'UK-D-£2-2023-FLORP-':   "Same Floral definitive reverse as the standard 2023 issue, but bearing the Royal Mint privy mark and issued only in official annual collector sets.",
  'UK-D-£2-2024-FLOR-':    "2024 continuation of the Floral definitive series, first introduced in 2023 as part of the new coinage under King Charles III.",
  'UK-D-£2-2025-FLOR-':    "2025 continuation of the Floral definitive series, representing all four nations of the United Kingdom.",
  'UK-D-£2-2026-FLOR-':    "2026 continuation of the Floral definitive series, representing all four nations of the United Kingdom.",

  // ── £5 ──────────────────────────────────────────────────────────────────
  'UK-D-£5-2007-DIAM-':    "Marks the Diamond Wedding Anniversary of Queen Elizabeth II and Prince Philip, married at Westminster Abbey on 20 November 1947; their 60-year marriage was the longest of any British sovereign.",
  'UK-D-£5-2023-KC75-':    "Celebrates King Charles III's 75th birthday on 14 November 2023; issued in his first regnal year, he was the oldest person ever to accede to the British throne.",
  'UK-D-£5-2026-QEII-':    "Marks the centenary of the birth of Queen Elizabeth II on 21 April 1926; issued as a posthumous tribute to the longest-reigning British monarch, who died on 8 September 2022.",
  'UK-D-£5-2026-ANGL-':    "Features an angelic reverse design; the angel has been a recurring motif in Royal Mint coinage since the medieval gold Angel coin, first struck in 1465.",
  'UK-D-£5-2026-LYHR-':    "Part of the Royal Mint's Lunar Year series; 2026 is the Year of the Horse in the Chinese zodiac, associated with energy, freedom and intelligence.",
  'UK-D-£5-2026-PNYD-':    "Celebrates Britain's decimalisation; 'The Penny Drops' alludes to 15 February 1971 (Decimal Day) when the UK switched from the £sd system to the decimal pound.",
  'UK-D-£5-2022-JUBI-':    "Marks Queen Elizabeth II's Platinum Jubilee, celebrating 70 years on the throne after her accession on 6 February 1952, making her the first British monarch to reach this milestone.",

  // ── 10p Alphabet 2018 ────────────────────────────────────────────────────
  'UK-D-10P-2018-A-':   "Features the Angel of the North, Anthony Gormley's monumental steel sculpture near Gateshead; standing 20 metres tall with a 54-metre wingspan, it was completed in 1998.",
  'UK-D-10P-2018-B-':   "Celebrates James Bond, the fictional MI6 agent created by Ian Fleming in 1953; the Bond film franchise is the most financially successful British film series in history.",
  'UK-D-10P-2018-C-':   "Honours cricket, England's national summer sport; the Ashes rivalry with Australia, contested since 1882, is one of sport's most storied international competitions.",
  'UK-D-10P-2018-D-':   "Features the iconic red double-decker Routemaster bus, which served London from 1956 to 2005 and remains the most recognised symbol of the British capital.",
  'UK-D-10P-2018-E-':   "Celebrates the full English breakfast, a beloved national tradition typically comprising bacon, eggs, sausages, baked beans, toast, mushrooms and black pudding.",
  'UK-D-10P-2018-F-':   "Fish and chips have been a British staple since the 1860s; around 10,500 fish and chip shops operate in the UK today, selling an estimated 382 million portions a year.",
  'UK-D-10P-2018-G-':   "Greenwich Mean Time has been the world's standard time reference since 1884, when the Prime Meridian was set through the Royal Observatory in Greenwich, London.",
  'UK-D-10P-2018-H-':   "The Palace of Westminster, seat of the UK Parliament since the 11th century, houses the House of Commons and Lords and the Elizabeth Tower (Big Ben); a UNESCO World Heritage Site.",
  'UK-D-10P-2018-I-':   "The ice-cream cone is a quintessential British seaside treat; the Mr Whippy soft-serve van became a cultural institution from the 1950s and is still a staple at the British coast.",
  'UK-D-10P-2018-J-':   "Celebrates the British tradition of royal jubilees, milestones marking significant years of a monarch's reign, from Victoria's Diamond Jubilee to Elizabeth II's Platinum Jubilee.",
  'UK-D-10P-2018-K-':   "King Arthur, the legendary 5th–6th century British king of Camelot and the Round Table, is celebrated in medieval literature from Geoffrey of Monmouth to Malory's Le Morte d'Arthur.",
  'UK-D-10P-2018-L-':   "Nessie, the Loch Ness Monster, is Scotland's most famous legendary creature; modern sightings date from 1933, though an account by St Columba mentions a river monster as far back as 565 AD.",
  'UK-D-10P-2018-M-':   "Charles Rennie Mackintosh (1868–1928) is Scotland's most celebrated designer; his distinctive style, blending Art Nouveau with Scottish tradition, is epitomised by the Glasgow School of Art.",
  'UK-D-10P-2018-N-':   "The NHS was founded on 5 July 1948 under Health Secretary Aneurin Bevan, providing universal healthcare free at the point of use; it is now one of the world's largest employers.",
  'UK-D-10P-2018-O-':   "The English oak (Quercus robur) is the national tree of England; for centuries it provided timber for the Royal Navy, and it features throughout British heraldry and folklore.",
  'UK-D-10P-2018-P-':   "The red pillar post box, conceived by Anthony Trollope and first introduced in 1852, has been an iconic fixture of British streets for over 170 years.",
  'UK-D-10P-2018-Q-':   "Britain's love of queuing is a celebrated national trait, regarded as a mark of fairness and civic courtesy; orderly queuing is widely cited as a defining feature of British culture.",
  'UK-D-10P-2018-R-':   "The European robin (Erithacus rubecula) is widely regarded as Britain's unofficial national bird, beloved for its cheerful song and fearless garden presence, especially in winter.",
  'UK-D-10P-2018-S-':   "Stonehenge on Salisbury Plain was begun around 3000 BC; its precise alignment with the summer solstice sunrise continues to attract scholars and over one million visitors a year.",
  'UK-D-10P-2018-T-':   "Tea has been central to British life since the 17th century; the UK consumes approximately 100 million cups daily, and the teapot remains an enduring symbol of British hospitality.",
  'UK-D-10P-2018-U-':   "The Union Flag combines the crosses of St George (England), St Andrew (Scotland) and St Patrick (Ireland), and has been the UK's national flag in its current form since 1801.",
  'UK-D-10P-2018-V-':   "The English village, with its green, parish church and local pub, represents an idyllic vision of rural Britain celebrated in landscape painting, literature and the national identity for centuries.",
  'UK-D-10P-2018-W-':   "The World Wide Web was invented by Sir Tim Berners-Lee at CERN in 1989–91; Berners-Lee chose not to patent the technology, making it freely available to the world.",
  'UK-D-10P-2018-X-':   "X marks the spot celebrates Britain's great tradition of exploration and cartography; from Drake's circumnavigation to Cook's Pacific voyages, British navigators charted the world.",
  'UK-D-10P-2018-Y-':   "The Yeoman Warders, or Beefeaters, have guarded the Tower of London since the reign of Edward VI; all 37 are retired senior armed forces veterans who live within the Tower's walls.",
  'UK-D-10P-2018-Z-':   "The zebra crossing, with its bold black-and-white stripes, was introduced in the UK in 1949 and is named for its resemblance to a zebra's markings; it was codified in the Highway Code in 1951.",

  // ── 10p Alphabet 2019 ────────────────────────────────────────────────────
  'UK-D-10P-2019-A-':   "Features the Angel of the North, Anthony Gormley's monumental steel sculpture near Gateshead; standing 20 metres tall with a 54-metre wingspan, it was completed in 1998.",
  'UK-D-10P-2019-B-':   "Celebrates James Bond, the fictional MI6 agent created by Ian Fleming in 1953; the Bond film franchise is the most financially successful British film series in history.",
  'UK-D-10P-2019-C-':   "Honours cricket, England's national summer sport; the Ashes rivalry with Australia, contested since 1882, is one of sport's most storied international competitions.",
  'UK-D-10P-2019-D-':   "Features the iconic red double-decker Routemaster bus, which served London from 1956 to 2005 and remains the most recognised symbol of the British capital.",
  'UK-D-10P-2019-E-':   "Celebrates the full English breakfast, a beloved national tradition typically comprising bacon, eggs, sausages, baked beans, toast, mushrooms and black pudding.",
  'UK-D-10P-2019-F-':   "Fish and chips have been a British staple since the 1860s; around 10,500 fish and chip shops operate in the UK today, selling an estimated 382 million portions a year.",
  'UK-D-10P-2019-G-':   "Greenwich Mean Time has been the world's standard time reference since 1884, when the Prime Meridian was set through the Royal Observatory in Greenwich, London.",
  'UK-D-10P-2019-H-':   "The Palace of Westminster, seat of the UK Parliament since the 11th century, houses the House of Commons and Lords and the Elizabeth Tower (Big Ben); a UNESCO World Heritage Site.",
  'UK-D-10P-2019-I-':   "The ice-cream cone is a quintessential British seaside treat; the Mr Whippy soft-serve van became a cultural institution from the 1950s and is still a staple at the British coast.",
  'UK-D-10P-2019-J-':   "Celebrates the British tradition of royal jubilees, milestones marking significant years of a monarch's reign, from Victoria's Diamond Jubilee to Elizabeth II's Platinum Jubilee.",
  'UK-D-10P-2019-K-':   "King Arthur, the legendary 5th–6th century British king of Camelot and the Round Table, is celebrated in medieval literature from Geoffrey of Monmouth to Malory's Le Morte d'Arthur.",
  'UK-D-10P-2019-L-':   "Nessie, the Loch Ness Monster, is Scotland's most famous legendary creature; modern sightings date from 1933, though an account by St Columba mentions a river monster as far back as 565 AD.",
  'UK-D-10P-2019-M-':   "Charles Rennie Mackintosh (1868–1928) is Scotland's most celebrated designer; his distinctive style, blending Art Nouveau with Scottish tradition, is epitomised by the Glasgow School of Art.",
  'UK-D-10P-2019-N-':   "The NHS was founded on 5 July 1948 under Health Secretary Aneurin Bevan, providing universal healthcare free at the point of use; it is now one of the world's largest employers.",
  'UK-D-10P-2019-O-':   "The English oak (Quercus robur) is the national tree of England; for centuries it provided timber for the Royal Navy, and it features throughout British heraldry and folklore.",
  'UK-D-10P-2019-P-':   "The red pillar post box, conceived by Anthony Trollope and first introduced in 1852, has been an iconic fixture of British streets for over 170 years.",
  'UK-D-10P-2019-Q-':   "Britain's love of queuing is a celebrated national trait, regarded as a mark of fairness and civic courtesy; orderly queuing is widely cited as a defining feature of British culture.",
  'UK-D-10P-2019-R-':   "The European robin (Erithacus rubecula) is widely regarded as Britain's unofficial national bird, beloved for its cheerful song and fearless garden presence, especially in winter.",
  'UK-D-10P-2019-S-':   "Stonehenge on Salisbury Plain was begun around 3000 BC; its precise alignment with the summer solstice sunrise continues to attract scholars and over one million visitors a year.",
  'UK-D-10P-2019-T-':   "Tea has been central to British life since the 17th century; the UK consumes approximately 100 million cups daily, and the teapot remains an enduring symbol of British hospitality.",
  'UK-D-10P-2019-U-':   "The Union Flag combines the crosses of St George (England), St Andrew (Scotland) and St Patrick (Ireland), and has been the UK's national flag in its current form since 1801.",
  'UK-D-10P-2019-V-':   "The English village, with its green, parish church and local pub, represents an idyllic vision of rural Britain celebrated in landscape painting, literature and the national identity for centuries.",
  'UK-D-10P-2019-W-':   "The World Wide Web was invented by Sir Tim Berners-Lee at CERN in 1989–91; Berners-Lee chose not to patent the technology, making it freely available to the world.",
  'UK-D-10P-2019-X-':   "X marks the spot celebrates Britain's great tradition of exploration and cartography; from Drake's circumnavigation to Cook's Pacific voyages, British navigators charted the world.",
  'UK-D-10P-2019-Y-':   "The Yeoman Warders, or Beefeaters, have guarded the Tower of London since the reign of Edward VI; all 37 are retired senior armed forces veterans who live within the Tower's walls.",
  'UK-D-10P-2019-Z-':   "The zebra crossing, with its bold black-and-white stripes, was introduced in the UK in 1949 and is named for its resemblance to a zebra's markings; it was codified in the Highway Code in 1951.",

  // ── 10p other ────────────────────────────────────────────────────────────
  'UK-D-10P-2007-CofE-':  "Features the heraldic crest of England — a lion passant guardant from the Royal Arms — from the 2007 proof set; the lion has represented England in heraldry since the reign of Henry II.",
  'UK-D-10P-2023-GROU-':  "Part of the new Wildlife series under King Charles III, featuring the red grouse (Lagopus lagopus scotica), a gamebird endemic to the British Isles found on upland heather moorland.",
  'UK-D-10P-2023-GROUP-': "Same Wildlife series red grouse design as the standard 2023 issue, but with a Royal Mint privy mark, issued in official annual collector sets.",
  'UK-D-10P-2024-GROU-':  "2024 annual continuation of the Wildlife series red grouse definitive.",
  'UK-D-10P-2025-GROU-':  "2025 annual continuation of the Wildlife series red grouse definitive.",

  // ── 1p ──────────────────────────────────────────────────────────────────
  'UK-D-1P-2007-PORT-':   "Features a portcullis with chains royally crowned, the heraldic badge of the Houses of Parliament and an ancient symbol of royal authority; this has been the reverse of the 1p since 1971.",
  'UK-D-1P-2023-DORM-':   "Part of the new Wildlife series under King Charles III, featuring the hazel dormouse (Muscardinus avellanarius), a legally protected species in serious decline across UK hedgerows and woodland.",
  'UK-D-1P-2023-DORMP-':  "Same Wildlife series hazel dormouse design as the standard 2023 issue, but with a Royal Mint privy mark, issued in official annual collector sets.",
  'UK-D-1P-2024-DORM-':   "2024 annual continuation of the Wildlife series hazel dormouse definitive.",
  'UK-D-1P-2025-DORM-':   "2025 annual continuation of the Wildlife series hazel dormouse definitive.",

  // ── 20p ─────────────────────────────────────────────────────────────────
  'UK-D-20P-2007-BofE-':  "Features the Tudor rose, the heraldic badge of England and symbol of the Tudor dynasty, from the 2007 proof set; Henry VII adopted it to represent the union of the Houses of York and Lancaster.",
  'UK-D-20P-2023-PUFF-':  "Part of the new Wildlife series under King Charles III, featuring the Atlantic puffin (Fratercula arctica), Britain's most distinctive seabird; a conservation priority species that nests on coastal cliffs.",
  'UK-D-20P-2023-PUFFP-': "Same Wildlife series puffin design as the standard 2023 issue, but with a Royal Mint privy mark, issued in official annual collector sets.",
  'UK-D-20P-2024-PUFF-':  "2024 annual continuation of the Wildlife series Atlantic puffin definitive.",
  'UK-D-20P-2025-PUFF-':  "2025 annual continuation of the Wildlife series Atlantic puffin definitive.",

  // ── 2p ──────────────────────────────────────────────────────────────────
  'UK-D-2P-2007-PofW-':   "Features the three golden feathers badge of the Prince of Wales, from the 2007 proof set; the badge has identified the heir apparent since Edward of Woodstock (the Black Prince) in the 14th century.",
  'UK-D-2P-2023-SQUI-':   "Part of the new Wildlife series under King Charles III, featuring the red squirrel (Sciurus vulgaris), a native species now largely confined to Scotland and northern England after displacement by the introduced grey squirrel.",
  'UK-D-2P-2023-SQUIP-':  "Same Wildlife series red squirrel design as the standard 2023 issue, but with a Royal Mint privy mark, issued in official annual collector sets.",
  'UK-D-2P-2024-SQUI-':   "2024 annual continuation of the Wildlife series red squirrel definitive.",
  'UK-D-2P-2025-SQUI-':   "2025 annual continuation of the Wildlife series red squirrel definitive.",

  // ── 50p Britannia original (1969–1981) ───────────────────────────────────
  'UK-D-50P-1969-BRIT-':  "Part of the original Britannia series introduced in 1969 when the seven-sided 50p replaced the ten shilling note; Christopher Ironside's seated Britannia was one of the first truly modern British coin designs.",
  'UK-D-50P-1970-BRIT-':  "Part of the original Britannia series; the 50p was Britain's first seven-sided coin, its equilateral curve heptagon shape chosen to make it distinguishable by touch from other denominations.",
  'UK-D-50P-1971-BRIT-':  "1971 Britannia 50p from the year of decimalisation, when the UK switched from £sd to the decimal pound on 15 February 1971.",
  'UK-D-50P-1972-BRIT-':  "Part of the original Britannia series; the seated Britannia design by Christopher Ironside continued unchanged from the coin's introduction in 1969.",
  'UK-D-50P-1973-BRIT-':  "Part of the original Britannia series. Note: a separate commemorative 50p was also issued in 1973 to mark UK accession to the EEC.",
  'UK-D-50P-1974-BRIT-':  "Part of the original Christopher Ironside Britannia series that ran from 1969 to 1981, unchanged except for the obverse portrait of Queen Elizabeth II.",
  'UK-D-50P-1975-BRIT-':  "Part of the original Christopher Ironside Britannia series that ran from 1969 to 1981.",
  'UK-D-50P-1976-BRIT-':  "Part of the original Christopher Ironside Britannia series that ran from 1969 to 1981.",
  'UK-D-50P-1977-BRIT-':  "Part of the original Christopher Ironside Britannia series, struck in the year of Queen Elizabeth II's Silver Jubilee.",
  'UK-D-50P-1978-BRIT-':  "Part of the original Christopher Ironside Britannia series that ran from 1969 to 1981.",
  'UK-D-50P-1979-BRIT-':  "Part of the original Christopher Ironside Britannia series that ran from 1969 to 1981.",
  'UK-D-50P-1980-BRIT-':  "Part of the original Christopher Ironside Britannia series; the 1980 coin is one of the lower-mintage years of the original design.",
  'UK-D-50P-1981-BRIT-':  "Final year of the original 'NEW PENCE' Britannia inscription before the reverse was updated in 1982 to read 'FIFTY PENCE'. The 1981 coin is scarce in circulated grades.",

  // ── 50p Britannia revised inscription (1982–2008, 2019) ─────────────────
  'UK-D-50P-1982-BRIT2-': "In 1982 the inscription was changed from 'NEW PENCE' to 'FIFTY PENCE', ending the transitional new-pence era; the 1982 coin exists in both the old and new inscription types.",
  'UK-D-50P-1983-BRIT2-': "Revised Britannia 50p with the 'FIFTY PENCE' inscription introduced in 1982; the Christopher Ironside seated Britannia design continued with this change.",
  'UK-D-50P-1984-BRIT2-': "Revised Britannia 50p; the 1984 coin is a scarcer date in the series as mintage figures were lower than other years in the 1980s.",
  'UK-D-50P-1985-BRIT2-': "Revised Britannia 50p; from 1985 the obverse changed to the third portrait of Queen Elizabeth II by Raphael Maklouf.",
  'UK-D-50P-1986-BRIT2-': "Revised Britannia 50p with the Maklouf obverse portrait of Queen Elizabeth II introduced in 1985.",
  'UK-D-50P-1987-BRIT2-': "Revised Britannia 50p; the coin was reduced in size in 1997, making pre-1997 issues the older large-format 50p.",
  'UK-D-50P-1988-BRIT2-': "Revised Britannia 50p; the large-format coin continued until 1997 when it was replaced by a smaller version.",
  'UK-D-50P-1989-BRIT2-': "Revised Britannia 50p in the large-format design; from 1998 the smaller 50p superseded this issue in circulation.",
  'UK-D-50P-1990-BRIT2-': "Revised Britannia 50p; the large-format 50p was legal tender alongside the smaller version for a period after the size change in 1997.",
  'UK-D-50P-1991-BRIT2-': "Revised Britannia 50p in the original large format, with the fourth obverse portrait of Queen Elizabeth II by Raphael Maklouf.",
  'UK-D-50P-1992-BRIT2-': "Revised Britannia 50p; a separate EU Presidency commemorative 50p was also issued bearing the 1992 date.",
  'UK-D-50P-1993-BRIT2-': "Revised Britannia 50p; a separate EU Single Market commemorative was also issued in 1993.",
  'UK-D-50P-1994-BRIT2-': "Revised Britannia 50p in the large format; the coin continued alongside the new smaller 50p after 1997.",
  'UK-D-50P-1995-BRIT2-': "Revised Britannia 50p; the obverse changed to the fourth portrait of Queen Elizabeth II by Ian Rank-Broadley from 1998.",
  'UK-D-50P-1996-BRIT2-': "Revised Britannia 50p; one of the final large-format 50ps before the size reduction in September 1997.",
  'UK-D-50P-1997-BRIT2-': "One of the final large-format Britannia 50ps before the coin was reduced in size in September 1997; scarcer than later small-format issues.",
  'UK-D-50P-1998-BRIT2-': "First small-format revised Britannia 50p, following the size reduction of September 1997; the smaller coin is still the format used today.",
  'UK-D-50P-1999-BRIT2-': "Small-format revised Britannia 50p; 1999 saw the 30th anniversary of the 50p's introduction.",
  'UK-D-50P-2000-BRIT2-': "Small-format revised Britannia 50p struck in the millennium year.",
  'UK-D-50P-2001-BRIT2-': "Small-format revised Britannia 50p with the Ian Rank-Broadley obverse portrait of Queen Elizabeth II.",
  'UK-D-50P-2002-BRIT2-': "Small-format revised Britannia 50p, struck in the year of Queen Elizabeth II's Golden Jubilee.",
  'UK-D-50P-2003-BRIT2-': "Small-format revised Britannia 50p.",
  'UK-D-50P-2004-BRIT2-': "Small-format revised Britannia 50p.",
  'UK-D-50P-2005-BRIT2-': "Small-format revised Britannia 50p.",
  'UK-D-50P-2006-BRIT2-': "Small-format revised Britannia 50p.",
  'UK-D-50P-2007-BRIT2-': "Small-format revised Britannia 50p; a proof version was also included in the 2007 proof set.",
  'UK-D-50P-2008-BRIT2-': "Final year of the seated Britannia 50p reverse before the Royal Mint revamped all circulating coin designs in 2008.",
  'UK-D-50P-2019-BRIT2-': "Special reissue of the revised Britannia 50p in 2019; this reissue commemorated the 50th anniversary of the 50p coin's introduction in 1969.",

  // ── 50p Proof Set 2007 ───────────────────────────────────────────────────
  'UK-D-50P-2007-BRIT2-PROOF-': "Proof version of the revised Britannia 50p included in the 2007 proof set; struck to a higher standard than circulation coins with a mirror-like finish.",
  'UK-D-50P-2007-SCOU-PROOF-':  "Marks the centenary of the Scouting movement, founded by Robert Baden-Powell following his experimental camp on Brownsea Island in 1907; Scouts is today active in 172 countries worldwide.",

  // ── 50p Beatrix Potter ───────────────────────────────────────────────────
  'UK-D-50P-2016-BP-':    "Marks the 150th anniversary of the birth of Beatrix Potter (1866–1943), whose tales of Peter Rabbit and friends have sold over 100 million copies and been translated into 35 languages.",
  'UK-D-50P-2016-JPD-':   "Features Jemima Puddle-Duck from 'The Tale of Jemima Puddle-Duck' (1908), the naive duck who is nearly tricked by a fox posing as a gentleman; one of Potter's most enduringly popular characters.",
  'UK-D-50P-2016-NUT-':   "Features Squirrel Nutkin from 'The Tale of Squirrel Nutkin' (1903), the impertinent red squirrel whose persistent riddling finally provokes Old Brown the owl to tear off his tail.",
  'UK-D-50P-2016-PR-':    "Peter Rabbit first appeared in 'The Tale of Peter Rabbit' (1902), originally self-published by Potter; it became one of the best-selling children's books of all time with over 45 million copies sold.",
  'UK-D-50P-2016-WINK-':  "Features Mrs Tiggy-Winkle, the kindly hedgehog washerwoman from 'The Tale of Mrs Tiggy-Winkle' (1905); the character was based on Potter's own pet hedgehog, named Tiggy.",
  'UK-D-50P-2017-BUN-':   "Features Benjamin Bunny, Peter Rabbit's cousin from 'The Tale of Benjamin Bunny' (1904), who bravely leads Peter back into Mr McGregor's garden to retrieve his lost clothes.",
  'UK-D-50P-2017-FISH-':  "Features Mr Jeremy Fisher, the philosophical frog from 'The Tale of Mr Jeremy Fisher' (1906), who goes fishing and very nearly becomes a large trout's dinner instead.",
  'UK-D-50P-2017-KIT-':   "Features Tom Kitten from 'The Tale of Tom Kitten' (1907), the mischievous kitten who loses his smart clothes to the Puddle-Ducks in his mother's garden.",
  'UK-D-50P-2017-PR-':    "A second annual Peter Rabbit 50p for 2017; the coin series reflects the enduring popularity of Beatrix Potter's most famous character, who has become a global icon of children's literature.",
  'UK-D-50P-2018-BUN-':   "Features Flopsy Bunny from 'The Tale of the Flopsy Bunnies' (1909), in which Peter Rabbit's relatives fall asleep after eating too many over-ripe lettuces from Mr McGregor's rubbish heap.",
  'UK-D-50P-2018-GLOU-':  "Features the Tailor of Gloucester from 'The Tailor of Gloucester' (1903); set in Georgian Gloucester, Beatrix Potter considered it her own favourite and privately printed it as a Christmas gift in 1902.",
  'UK-D-50P-2018-MOUS-':  "Features Mrs Tittlemouse from 'The Tale of Mrs Tittlemouse' (1910), the fastidious wood mouse who keeps an immaculate underground home but is constantly troubled by uninvited visitors.",
  'UK-D-50P-2018-PR-':    "Third annual re-issue of the Peter Rabbit 50p; the continuation of the series each year underscores Peter Rabbit's status as the most collected character in the Royal Mint's modern commemorative range.",
  'UK-D-50P-2019-PR-':    "Fourth annual Peter Rabbit 50p; by 2019 the full Beatrix Potter series had grown to include over 16 different character designs, making it one of the most extensive 50p collector series.",
  'UK-D-50P-2020-PR-':    "Fifth annual Peter Rabbit 50p for 2020; the series had by this point also attracted attention as a mainstream circulation coin sought by non-specialist coin hunters.",

  // ── 50p Characters ───────────────────────────────────────────────────────
  'UK-D-50P-2019-GRUF-':  "Features the Gruffalo from Julia Donaldson and Axel Scheffler's picture book (1999), one of the best-selling children's books in UK history with over 13 million copies sold worldwide.",
  'UK-D-50P-2019-GRUM-':  "Features the Gruffalo and Mouse together; in the story, a clever mouse invents a fictional monster to outwit predators — only to then meet the real Gruffalo who turns out to fear the mouse.",
  'UK-D-50P-2019-HOLM-':  "Features Sherlock Holmes, the fictional detective created by Arthur Conan Doyle in 1887 in 'A Study in Scarlet'; Holmes is the most adapted literary human character in film and television history.",
  'UK-D-50P-2023-LWW-':   "Marks 70 years since C.S. Lewis published 'The Lion, the Witch and the Wardrobe' (1950), first in the Chronicles of Narnia; over 100 million copies have been sold in more than 47 languages.",
  'UK-D-50P-2024-GRUC-':  "Features the Gruffalo's daughter from Julia Donaldson and Axel Scheffler's sequel 'The Gruffalo's Child' (2004), who ventures into the dark wood through snow to search for the Big Bad Mouse.",
  'UK-D-50P-2025-ZOG1-':  "Features Zog from Julia Donaldson and Axel Scheffler's 'Zog' (2010), about the most eager young dragon at dragon school who tries hardest in every lesson despite constant mishaps.",
  'UK-D-50P-2026-DENN-':  "Dennis the Menace first appeared in the Beano on 17 March 1951 and has been published continuously ever since, making him one of Britain's longest-running comic strip characters.",

  // ── 50p Commemorative 2026 ───────────────────────────────────────────────
  'UK-D-50P-2026-CONC-':  "Marks 50 years since Concorde entered commercial service on 21 January 1976, operated by British Airways and Air France; the supersonic airliner crossed the Atlantic in under 3.5 hours before retirement in 2003.",
  'UK-D-50P-2026-BRGP-':  "Marks 100 years since the first British Grand Prix, held at Brooklands in 1926; now contested at Silverstone, it is one of the oldest and most prestigious events on the Formula One calendar.",
  'UK-D-50P-2026-KTRU-':  "Marks 50 years since Prince Charles (now King Charles III) founded The Prince's Trust in 1976 to help disadvantaged young people into work and education; now called The King's Trust, it has assisted over one million people.",

  // ── 50p Atlantic Salmon definitives ─────────────────────────────────────
  'UK-D-50P-2023-SALM-':  "Part of the new Wildlife series under King Charles III, featuring the Atlantic salmon (Salmo salar), an iconic migratory fish that returns to spawn in British rivers; populations have declined sharply in recent decades.",
  'UK-D-50P-2023-SALMP-': "Same Wildlife series Atlantic salmon design as the standard 2023 issue, but with a Royal Mint privy mark, issued in official annual collector sets.",
  'UK-D-50P-2024-SALM-':  "2024 annual continuation of the Wildlife series Atlantic salmon definitive.",
  'UK-D-50P-2025-SALM-':  "2025 annual continuation of the Wildlife series Atlantic salmon definitive.",
  'UK-D-50P-2026-SALM-':  "2026 annual continuation of the Wildlife series Atlantic salmon definitive.",

  // ── 50p Dinosaurs & prehistoric ─────────────────────────────────────────
  'UK-D-50P-2020-HYLA-':  "Features Hylaeosaurus, one of the three original dinosaurs that Richard Owen grouped together when he coined the term 'Dinosauria' in 1842; known from fossils found in the Weald of West Sussex.",
  'UK-D-50P-2020-IGUA-':  "Features Iguanodon, one of the first dinosaurs to be scientifically described (1825) by Gideon Mantell from bones found in Sussex; it was among Owen's three founding Dinosauria.",
  'UK-D-50P-2020-MEGA-':  "Features Megalosaurus, the first dinosaur to receive a formal scientific name (1824), described by William Buckland from bones found near Oxford; it was one of Owen's original three Dinosauria.",
  'UK-D-50P-2021-DIMO-':  "Features Dimorphodon, a pterosaur discovered on the Dorset coast by Mary Anning in 1828 and named by Richard Owen; with a large head relative to its body, it lived around 200 million years ago.",
  'UK-D-50P-2021-ODON-':  "Features Temnodontosaurus, a large ichthyosaur whose specimens were found by Mary Anning on the Dorset coast; it grew up to 9 metres long and had the largest eyes of any known vertebrate.",
  'UK-D-50P-2021-PLES-':  "Features Plesiosaurus, the long-necked marine reptile first discovered by Mary Anning near Lyme Regis in 1823; its elongated neck supposedly inspired early descriptions of the Loch Ness Monster.",
  'UK-D-50P-2024-DEER-':  "Features the Giant Deer (Megaloceros giganteus), the largest deer that ever lived, with antlers spanning up to 3.7 metres; remains have been found across the British Isles and Ireland.",
  'UK-D-50P-2024-DIPL-':  "Features Diplodocus, one of the longest dinosaurs on record; 'Dippy', the cast donated to the Natural History Museum London in 1905 by Andrew Carnegie, became one of Britain's most iconic fossil specimens.",
  'UK-D-50P-2024-MAMM-':  "Features the Steppe Mammoth (Mammuthus trogontherii), ancestor of the woolly mammoth; remains have been found across Britain and it stood up to 4.5 metres tall at the shoulder.",
  'UK-D-50P-2024-STEG-':  "Features Stegosaurus, the plated dinosaur of the Late Jurassic; fine specimens are held at the Natural History Museum, London, and the plates are now thought to have aided thermoregulation.",
  'UK-D-50P-2024-TREX-':  "Features Tyrannosaurus rex, the most famous of all predatory dinosaurs; partial British specimens have been found on the Isle of Wight, a site rich in Cretaceous dinosaur fossils.",
  'UK-D-50P-2024-WOOL-':  "Features the Woolly Rhinoceros (Coelodonta antiquitatis), which roamed Britain during the last Ice Age; preserved specimens complete with fur and skin have been found in frozen Siberian permafrost.",

  // ── 50p Disney ───────────────────────────────────────────────────────────
  'UK-D-50P-2025-MARY-':  "Features Mary Poppins, the magical nanny created by Australian-born author P.L. Travers in her 1934 novel, made world-famous by the 1964 Disney film with Julie Andrews set in Edwardian London.",

  // ── 50p EU ───────────────────────────────────────────────────────────────
  'UK-D-50P-1973-EU-':    "Marks the UK's accession to the European Economic Community on 1 January 1973; this was the very first commemorative 50p ever issued and is notably scarce in circulated condition.",
  'UK-D-50P-1992-EU-':    "Marks the UK's Presidency of the Council of Ministers and the completion of the Single European Market; the reverse by Mary Milner Dickens features 12 stars and hands joined in unity.",
  'UK-D-50P-1993-EU-':    "A second minting of the EU Presidency design for 1993, when the Single Market formally took effect on 1 January; both dates were struck, making the 1992 version rarer than the 1993.",
  'UK-D-50P-1998-EU-':    "Marks both the UK's EU Presidency and the 25th anniversary of EEC accession; the Mary Milner Dickens design of outstretched hand and stars makes this one of the most sought-after modern 50p types.",
  'UK-D-50P-2020-EUEX-':  "Marks the UK's formal departure from the European Union on 31 January 2020 (Brexit Day); the reverse is inscribed 'Peace, prosperity and friendship with all nations', echoing Benjamin Franklin.",

  // ── 50p Harry Potter ─────────────────────────────────────────────────────
  'UK-D-50P-2022-HP-':    "First in the Royal Mint's Harry Potter series, celebrating J.K. Rowling's boy wizard whose debut novel 'Harry Potter and the Philosopher's Stone' was published in 1997.",
  'UK-D-50P-2022-HPHE':   "Features the Hogwarts Express, the scarlet steam locomotive that carries young witches and wizards to school each year; departures are from the fictional Platform 9¾ at King's Cross station, London.",
  'UK-D-50P-2023-HPDU-':  "Features Professor Albus Dumbledore, headmaster of Hogwarts and mentor to Harry Potter throughout J.K. Rowling's series; widely considered the greatest wizard of his age.",
  'UK-D-50P-2023-HPHW-':  "Features Hogwarts Castle, the fictional school of witchcraft and wizardry that is the heart of J.K. Rowling's seven-book series; its gothic design was partly inspired by Edinburgh's Old Town.",
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!verifyServiceKey(req)) return res.status(401).json({ error: 'Unauthorised' });

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN || !sheetId) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  try {
    const token = await getAccessToken();
    const today = new Date().toISOString().slice(0, 10);

    // Read all Variants rows
    const readResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants?majorDimension=ROWS`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!readResp.ok) throw new Error('Sheet fetch failed: ' + readResp.status);
    const { values } = await readResp.json();
    const rows = values || [];

    // Build batch update: for each data row where notes col is empty and we have a note
    const data = [];
    let updated = 0;
    let skipped = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const code = (row[0] || '').trim();
      const currentNote = (row[8] || '').trim();
      const note = NOTES[code];

      if (!note) { skipped++; continue; }
      if (currentNote) { skipped++; continue; } // already has a note

      const sheetRow = i + 1; // 1-based
      data.push({ range: `Variants!I${sheetRow}`, values: [[note]] });
      data.push({ range: `Variants!K${sheetRow}`, values: [[today]] });
      updated++;
    }

    if (data.length === 0) {
      return res.status(200).json({ ok: true, message: 'Nothing to update', updated: 0, skipped });
    }

    const batchResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
      }
    );
    if (!batchResp.ok) throw new Error('Batch update failed: ' + await batchResp.text());

    return res.status(200).json({ ok: true, updated, skipped, message: `Updated ${updated} variants` });
  } catch (e) {
    console.error('add-notes error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};

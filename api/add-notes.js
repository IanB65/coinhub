// One-time endpoint: populates empty notes (col I) in the Variants sheet.
// DELETE this file after running.

const crypto = require('crypto');

function verifyServiceKey(req) {
  const key = req.headers['x-service-key'] || '';
  const expected = process.env.COINHUB_SERVICE_KEY || '';
  if (!key || !expected || key.length !== expected.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected)); }
  catch { return false; }
}

function verifyOwnerToken(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  const secret = process.env.COINHUB_JWT_SECRET;
  if (!secret) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [h, p, sig] = parts;
    const expected = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
    if (sig.length !== expected.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (payload.role === 'guest') return false;
    return payload.exp > Math.floor(Date.now() / 1000);
  } catch { return false; }
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

// ── Explicit notes for modern coins ─────────────────────────────────────────
const EXPLICIT = {
  // ── 50p Britannia (missed from first run) ────────────────────────────────
  'UK-D-50P-1982-BRIT-': "The 1982 coin exists in two types: the original 'NEW PENCE' inscription (this coin) and the updated 'FIFTY PENCE' version. It is the final year of the NEW PENCE wording, making it a key transitional issue in the Britannia series.",

  // ── 50p Harry Potter 2024 ────────────────────────────────────────────────
  'UK-D-50P-2024-HPBL-': "Features the Black Lake at Hogwarts, where the second task of the Triwizard Tournament takes place in 'Harry Potter and the Goblet of Fire'; Harry must rescue a hostage from its cold, creature-filled depths.",
  'UK-D-50P-2024-HPWK-': "Features the Winged Keys, enchanted flying keys that guard the Philosopher's Stone in the first book; Harry catches the correct key on a broomstick to unlock the door to the next chamber.",

  // ── 50p Harry Potter 2025 ────────────────────────────────────────────────
  'UK-D-50P-2025-HPFC-': "Features the enchanted Ford Anglia from 'Harry Potter and the Chamber of Secrets'; Harry and Ron fly it to Hogwarts after missing the train, and it later lives wild in the Forbidden Forest.",
  'UK-D-50P-2025-HPPA-': "Features the Patronus Charm, a powerful spell used to repel Dementors; Harry's Patronus takes the form of a stag, mirroring his father James's Animagus form and providing a key link to his parents.",

  // ── 50p King Charles III ─────────────────────────────────────────────────
  'UK-D-50P-2023-KC3-': "Marks the Coronation of King Charles III on 6 May 2023 at Westminster Abbey — the first coronation in 70 years. Charles III is the oldest person to accede to the British throne.",

  // ── 50p London 2012 Olympics ─────────────────────────────────────────────
  'UK-D-50P-2011-AQUA-': "Aquatics at the London 2012 Olympics was held at the Aquatics Centre designed by Zaha Hadid; Team GB won gold in the 10m synchronised platform diving.",
  'UK-D-50P-2011-ARCH-': "Archery at London 2012 was held at Lord's Cricket Ground; the target archery events saw competitors shoot at 70 metres.",
  'UK-D-50P-2011-ATHL-': "Athletics at London 2012 was held at the Olympic Stadium; Team GB's Mo Farah won double gold in the 5,000m and 10,000m in iconic fashion.",
  'UK-D-50P-2011-BADM-': "Badminton at London 2012 was held at Wembley Arena; the sport is one of the fastest racket sports in the world, with shuttle speeds exceeding 200 mph.",
  'UK-D-50P-2011-BASK-': "Basketball at London 2012 was held at the North Greenwich Arena; the USA's men's and women's teams both claimed gold medals.",
  'UK-D-50P-2011-BOCC-': "Boccia is a precision ball sport for Paralympic athletes with severe physical impairment; Team GB's Nigel Murray won gold in the BC2 individual event at London 2012.",
  'UK-D-50P-2011-BOXI-': "Boxing at London 2012 was held at ExCeL London; Team GB won three medals including gold for Anthony Joshua in super heavyweight.",
  'UK-D-50P-2011-CANO-': "Canoeing at London 2012 was held at Lee Valley White Water Centre and Eton Dorney; Team GB's Tim Baillie and Etienne Stott won gold in canoe slalom C-2.",
  'UK-D-50P-2011-CYCL-': "Cycling at London 2012 was held at the Olympic Velodrome and on road circuits; Team GB dominated the velodrome, winning seven gold medals in track cycling.",
  'UK-D-50P-2011-EQUE-': "Equestrian events at London 2012 were held at Greenwich Park; Team GB won gold in the team eventing competition.",
  'UK-D-50P-2011-FENC-': "Fencing at London 2012 was held at ExCeL London; the sport encompasses foil, épée and sabre disciplines, with origins in classical European swordsmanship.",
  'UK-D-50P-2011-FOOT-': "Football at London 2012 was held across six UK venues; the coin's reverse was famously designed by a schoolboy, Ella Smales, aged 11.",
  'UK-D-50P-2011-GOAL-': "Goalball is a Paralympic team sport for visually impaired athletes; players listen for a bell inside the ball and use their bodies to block it from entering the goal.",
  'UK-D-50P-2011-GYMN-': "Gymnastics at London 2012 was held at the North Greenwich Arena; Beth Tweddle won Team GB's first Olympic gymnastics gold in the uneven bars.",
  'UK-D-50P-2011-HAND-': "Handball at London 2012 was held at the Copper Box Arena; the sport involves teams of seven throwing a ball into the opponent's goal.",
  'UK-D-50P-2011-HOCK-': "Hockey at London 2012 was held at the Riverbank Arena in the Olympic Park; the women's Team GB squad reached the bronze medal match.",
  'UK-D-50P-2011-JUDO-': "Judo at London 2012 was held at ExCeL London; the sport was developed in Japan by Jigoro Kano in 1882 and became an Olympic event in 1964.",
  'UK-D-50P-2011-PENT-': "Modern Pentathlon at London 2012 consisted of fencing, swimming, equestrian show jumping, shooting and running; the coin's design is one of the most distinctive in the series.",
  'UK-D-50P-2011-ROWI-': "Rowing at London 2012 was held at Eton Dorney; Team GB won four gold medals, including the men's coxless four with a world record time.",
  'UK-D-50P-2011-SAIL-': "Sailing at London 2012 was held at Weymouth and Portland; Ben Ainslie won his fourth consecutive Olympic gold, becoming the most decorated Olympic sailor in history.",
  'UK-D-50P-2011-SHOO-': "Shooting at London 2012 was held at the Royal Artillery Barracks, Woolwich; events included rifle and pistol disciplines across multiple distances.",
  'UK-D-50P-2011-TAEK-': "Taekwondo at London 2012 was held at ExCeL London; Jade Jones won Team GB's first Olympic taekwondo gold in the women's under-57kg category.",
  'UK-D-50P-2011-TENN-': "Tennis at London 2012 was held at Wimbledon; Andy Murray won the men's singles gold, defeating Roger Federer in straight sets.",
  'UK-D-50P-2011-TRIA-': "Triathlon at London 2012 was held in Hyde Park; the event combines swimming, cycling and running; Alistair Brownlee won gold and Jonathan Brownlee bronze for Team GB.",
  'UK-D-50P-2011-TTEN-': "Table Tennis at London 2012 was held at ExCeL London; China dominated the event, winning all four gold medals across men's and women's singles and team events.",
  'UK-D-50P-2011-VOLL-': "Volleyball at London 2012 was held at Earls Court; beach volleyball was also contested at Horse Guards Parade.",
  'UK-D-50P-2011-WCRU-': "Wheelchair Rugby is a full-contact Paralympic sport for athletes with impairment in all four limbs; it was informally known as 'Murderball' for its physicality.",
  'UK-D-50P-2011-WEIG-': "Weightlifting at London 2012 was held at ExCeL London; competitors in the snatch and clean & jerk disciplines compete across multiple weight categories.",
  'UK-D-50P-2011-WRES-': "Wrestling at London 2012 was held at ExCeL London; the sport encompasses freestyle and Greco-Roman disciplines, and is one of the oldest competitive sports in the world.",
  'UK-M-50P-2011-COMP-': "The London 2012 Olympic 50p Completer Medallion was issued to complete the 29-coin Olympic sports set; it features the Olympic rings and is technically a medal rather than legal tender.",

  // ── 50p Military ─────────────────────────────────────────────────────────
  'UK-D-50P-1994-DDAY-': "Marks the 50th anniversary of the D-Day landings of 6 June 1944, when Allied forces landed on the beaches of Normandy in the largest seaborne invasion in history.",
  'UK-D-50P-2006-VC1':   "Marks the 150th anniversary of the Victoria Cross, the UK's highest military decoration; this coin features a cluster of Victoria Cross medals.",
  'UK-D-50P-2006-VC2-':  "Companion coin to the VC Medals 50p, this reverse depicts acts of bravery; the Victoria Cross was instituted by Queen Victoria in 1856 following the Crimean War.",
  'UK-D-50P-2015-BOFB-': "Marks the 75th anniversary of the Battle of Britain (July–October 1940), the first major campaign fought entirely by air forces; RAF Fighter Command's victory prevented a German invasion.",
  'UK-D-50P-2016-HAST-': "Marks 950 years since the Battle of Hastings on 14 October 1066, when William the Conqueror defeated Harold II; one of the most significant battles in English history.",
  'UK-D-50P-2019-BOFB-': "Reissue of the Battle of Britain 50p, part of the 2019 re-strike programme that brought classic commemorative designs back into circulation.",
  'UK-D-50P-2019-DDAY-': "Marks the 75th anniversary of the D-Day landings on 6 June 1944; this 2019 issue was released to coincide with the major international commemorations held in Normandy.",
  'UK-D-50P-2019-HAST-': "Reissue of the Battle of Hastings 50p, part of the 2019 re-strike programme; the original 2016 coin had a circulation mintage of 6.7 million.",
  'UK-D-50P-2019-VC1-':  "Reissue of the Victoria Cross Medals 50p as part of the 2019 re-strike programme; the Victoria Cross has been awarded 1,358 times since its institution in 1856.",
  'UK-D-50P-2019-VC2-':  "Reissue of the Victoria Cross Heroic Acts 50p as part of the 2019 re-strike programme.",
  'UK-D-50P-2024-DDAY-': "Marks the 80th anniversary of D-Day, 6 June 1944; over 156,000 Allied troops crossed the English Channel to land on five Normandy beaches, turning the tide of World War II in Western Europe.",
  'UK-D-50P-2025-REDA-': "Celebrates the RAF Red Arrows, the Royal Air Force Aerobatic Team formed in 1964; the nine Hawks fly in precise formation and are renowned for their red, white and blue smoke trails.",
  'UK-D-50P-2025-VE80-': "Marks the 80th anniversary of VE Day on 8 May 1945; celebrations across the UK marked the end of the war in Europe with street parties, services of thanksgiving and national rejoicing.",
  'UK-D-50P-2025-WW2S-': "Celebrates personal stories from World War II, honouring the millions of men and women whose individual acts of courage, service and sacrifice shaped the outcome of the conflict.",

  // ── 50p Monopoly ─────────────────────────────────────────────────────────
  'UK-D-50P-2025-MONO':  "Marks 90 years since Monopoly was first published in the UK by Waddingtons in 1935; the British edition replaced the American street names with London locations, led by Mayfair and Park Lane.",

  // ── 50p Old Size ─────────────────────────────────────────────────────────
  'UK-D-50P-1994-':      "The D-Day 50th anniversary coin in the original large-format 50p; the coin was struck before the 50p was reduced in size in 1997 and is consequently larger than the current version.",

  // ── 50p Paddington Bear ──────────────────────────────────────────────────
  'UK-D-50P-2018-PADP-': "Features Paddington Bear at Buckingham Palace; the lovable bear from Darkest Peru was created by Michael Bond in 1958, and the coin was inspired by the famous sketch of Paddington sharing tea with Queen Elizabeth II.",
  'UK-D-50P-2018-PADS-': "Features Paddington Bear at Paddington Station, where he was found by the Brown family with a label reading 'Please look after this bear'; the station in west London gave the character his name.",
  'UK-D-50P-2019-PADC-': "Features Paddington Bear at St Paul's Cathedral, Sir Christopher Wren's masterpiece completed in 1710; Paddington's tourist adventures across London landmarks continued with this second series.",
  'UK-D-50P-2019-PADL-': "Features Paddington Bear at the Tower of London, the historic castle on the Thames that has served as a royal palace, prison and treasury; Paddington is famously fond of marmalade sandwiches.",

  // ── 50p Peter Pan (Isle of Man) ──────────────────────────────────────────
  'IOM-D-50P-2019-CROC-': "Features the crocodile that swallowed Captain Hook's hand (and a ticking clock) in J.M. Barrie's Peter Pan; this Isle of Man coin is part of a six-coin set celebrating the story.",
  'IOM-D-50P-2019-FLYI-': "Features Peter Pan, Wendy, John and Michael flying over the London rooftops towards Neverland; J.M. Barrie's play Peter Pan premiered at the Duke of York's Theatre in 1904.",
  'IOM-D-50P-2019-HOOK-': "Features Captain James Hook, the swaggering pirate villain of Peter Pan; in the story he hunts Peter Pan across Neverland and lives in terror of the crocodile that ticks.",
  'IOM-D-50P-2019-PPAN-': "Features Peter Pan, the boy who never grows up, created by J.M. Barrie; the character first appeared in the novel 'The Little White Bird' (1902) before his famous stage play in 1904.",
  'IOM-D-50P-2019-TINK-': "Features Tinkerbell, Peter Pan's loyal fairy companion; a tiny but fierce character, Tinkerbell communicates through the sound of bells and can only feel one emotion at a time.",
  'IOM-D-50P-2019-WEND-': "Features Wendy Darling and Nana the Newfoundland dog; Wendy is the girl who travels to Neverland with Peter Pan, and Nana is the Darling children's devoted nursemaid.",

  // ── 50p Science ──────────────────────────────────────────────────────────
  'UK-D-50P-2017-NEWT-': "Honours Sir Isaac Newton (1643–1727), who described the laws of motion and universal gravitation, developed calculus and optics, and is widely regarded as one of the greatest scientists in history.",
  'UK-D-50P-2019-HAWK-': "Honours Professor Stephen Hawking (1942–2018), who made landmark contributions to the theory of black holes and cosmology, authored 'A Brief History of Time' and inspired millions despite his MND diagnosis.",
  'UK-D-50P-2020-FRAN-': "Honours Rosalind Franklin (1920–1958), whose X-ray crystallography images of DNA — particularly Photo 51 — were crucial to Watson and Crick's discovery of the double helix structure in 1953.",
  'UK-D-50P-2021-BABB-': "Honours Charles Babbage (1791–1871), who conceived the Difference Engine and Analytical Engine — mechanical computers that anticipated modern computing by over a century.",
  'UK-D-50P-2021-BAIR-': "Honours John Logie Baird (1888–1946), the Scottish inventor who gave the first public demonstration of a working television system on 26 January 1926 in a London attic.",
  'UK-D-50P-2022-TURI-': "Honours Alan Turing (1912–1954), the mathematician and computer scientist who cracked the Enigma cipher at Bletchley Park and laid the theoretical foundations of modern computing.",

  // ── 50p Shield series ────────────────────────────────────────────────────
  'UK-D-50P-2008-SHIE-': "Part of the Royal Shield of Arms series designed by Matthew Dent in 2008; each denomination shows a segment of the Royal Arms, which together form a complete shield. The 50p carries the bottom-left quarter.",
  'UK-D-50P-2009-SHIE-': "Part of the Royal Shield series introduced in 2008; the design replaced the previous Britannia and regional emblems reverses across all circulating denominations.",
  'UK-D-50P-2010-SHIE-': "Part of the Royal Shield series; the Royal Arms on the reverse combines the three lions of England, the lion rampant of Scotland and the harp of Ireland.",
  'UK-D-50P-2011-SHIE-': "Part of the Royal Shield series; 2011 also saw the London 2012 Olympic sports 50p series in circulation alongside this standard reverse.",
  'UK-D-50P-2012-SHIE-': "Part of the Royal Shield series; 2012 saw both the London Olympics and Queen Elizabeth II's Diamond Jubilee, making it a notable year for UK commemorative coinage.",
  'UK-D-50P-2013-SHIE-': "Part of the Royal Shield series; the fifth portrait of Queen Elizabeth II by Ian Rank-Broadley continued on the obverse of circulating coins throughout this period.",
  'UK-D-50P-2014-SHIE-': "Part of the Royal Shield series; from 2015 the obverse would change to the sixth portrait of Queen Elizabeth II by Jody Clark.",
  'UK-D-50P-2015-SHIE-': "Part of the Royal Shield series; from 2015 the new Jody Clark obverse portrait of Queen Elizabeth II appeared on coins.",
  'UK-D-50P-2016-SHIE-': "Part of the Royal Shield series; 2016 also saw the launch of the Beatrix Potter 50p series, making it a bumper year for 50p collectors.",
  'UK-D-50P-2017-SHIE-': "Part of the Royal Shield series.",
  'UK-D-50P-2018-SHIE-': "Part of the Royal Shield series.",
  'UK-D-50P-2019-SHIE-': "Part of the Royal Shield series; 2019 marked 50 years of the 50p coin, celebrated with a special Fifty Years of Fifty Pence commemorative.",
  'UK-D-50P-2020-SHIE-': "Part of the Royal Shield series.",
  'UK-D-50P-2021-SHIE-': "Part of the Royal Shield series.",
  'UK-D-50P-2022-SHIE-': "Part of the Royal Shield series; the final year of the series under Queen Elizabeth II, who passed away on 8 September 2022.",
  'UK-D-50P-2023-SHIE-': "Part of the Royal Shield series, transitioning to the new King Charles III obverse; the Royal Shield reverse remained unchanged as a new reign began.",

  // ── 50p Snowman ──────────────────────────────────────────────────────────
  'UK-D-50P-2018-SNOW-': "Features the Snowman from Raymond Briggs' 1978 picture book and the beloved 1982 animated film; an annual collector's coin issued each Christmas season, not generally found in circulation.",
  'UK-D-50P-2019-SNOW-': "Second annual Snowman 50p, continuing the tradition of a Christmas collector's coin featuring the magical snowman who takes a boy on a flying adventure over the British countryside.",
  'UK-D-50P-2020-SNOW-': "Third annual Snowman 50p; 2020 was also the year Raymond Briggs' story turned 42, and the animated film remained a fixture of British Christmas television.",
  'UK-D-50P-2021-SNOW-': "Fourth annual Snowman 50p; the coin's seasonal release makes it popular as a Christmas gift, building year-on-year into a series.",
  'UK-D-50P-2022-SNOW-': "Features the Snowman and the Snowdog, inspired by the 2012 sequel animated film 'The Snowman and the Snowdog', a companion to Raymond Briggs' original story.",
  'UK-D-50P-2023-SNOW-': "Sixth annual Snowman 50p; the annual release of a Snowman coin has made this one of the most consistently collected seasonal coin series in the UK.",
  'UK-D-50P-2024-SNOW-': "Seventh annual Snowman 50p; these annual issues are eagerly anticipated by collectors each autumn.",
  'UK-D-50P-2025-SNOW-': "Eighth annual Snowman 50p, maintaining the Royal Mint's tradition of releasing a festive Snowman coin to mark the Christmas season each year.",

  // ── 50p Sports ───────────────────────────────────────────────────────────
  'UK-D-50P-2004-BAN-':  "Marks the 50th anniversary of Roger Bannister breaking the four-minute mile on 6 May 1954 at Oxford's Iffley Road track; his time of 3:59.4 was one of sport's most celebrated achievements.",
  'UK-D-50P-2014-GLAS-': "Marks the XX Commonwealth Games held in Glasgow in July–August 2014; Scotland hosted the games and Team England topped the medal table.",
  'UK-D-50P-2016-GB -':  "Celebrates Team GB at the Rio 2016 Summer Olympics, where Great Britain finished second in the gold medal table with 27 golds — the country's best Olympic performance since 1908.",
  'UK-D-50P-2019-BAN-':  "Reissue marking Roger Bannister's four-minute mile; Bannister (1929–2018) became a distinguished neurologist after his athletic career, and this coin was issued shortly after his death.",
  'UK-D-50P-2020-GB -':  "Celebrates Team GB at the Tokyo 2020 Summer Olympics (held in 2021 due to the COVID-19 pandemic); Great Britain won 22 gold, 21 silver and 22 bronze medals.",
  'UK-D-50P-2021-GB -':  "Celebrates Team GB at the Tokyo 2020 Paralympics; ParalympicsGB finished second in the medal table with 41 gold medals, their best performance since Seoul 1988.",
  'UK-D-50P-2022-BIRM-': "Marks the XXII Commonwealth Games held in Birmingham in July–August 2022; England hosted and finished second in the gold medal table behind Australia.",
  'UK-D-50P-2024-GB -':  "Celebrates Team GB and ParalympicsGB at the Paris 2024 Summer Olympics and Paralympics; a joint issue celebrating both the Olympic and Paralympic achievements.",

  // ── 50p Star Wars ────────────────────────────────────────────────────────
  'UK-D-50P-2023-SWDV-': "Features Darth Vader and Emperor Palpatine, the Sith Lords who rule the Galactic Empire; the Star Wars saga, created by George Lucas, began with 'A New Hope' in 1977.",
  'UK-D-50P-2023-SWLS-': "Features Luke Skywalker and Princess Leia, the twin siblings and central heroes of the original Star Wars trilogy (1977–1983).",
  'UK-D-50P-2023-SWR2-': "Features R2-D2 and C-3PO, the iconic droid duo who appear in all nine main Star Wars films; C-3PO is fluent in over six million forms of communication.",
  'UK-D-50P-2024-SWDS-': "Features the Death Star II, the larger and more powerful second superweapon destroyed during the Battle of Endor in 'Return of the Jedi' (1983).",
  'UK-D-50P-2024-SWHS-': "Features Han Solo and Chewbacca, the smuggler and Wookiee co-pilots of the Millennium Falcon; Han Solo was portrayed by Harrison Ford across the original and sequel trilogies.",
  'UK-D-50P-2024-SWMF-': "Features the Millennium Falcon, Han Solo's iconic freighter described as 'the fastest hunk of junk in the galaxy'; it made the Kessel Run in less than twelve parsecs.",
  'UK-D-50P-2024-SWTF-': "Features the TIE Fighter, the standard starfighter of the Galactic Empire; the Twin Ion Engine design produces its distinctive screeching sound in the films.",
  'UK-D-50P-2024-SWXW-': "Features the X-Wing starfighter, the Rebel Alliance's primary fighter; Luke Skywalker uses an X-Wing to destroy the first Death Star in 'A New Hope' (1977).",

  // ── 50p UK Anniversary ───────────────────────────────────────────────────
  'UK-D-50P-1998-NHS-':  "Marks the 50th anniversary of the National Health Service, founded on 5 July 1948; the coin features a nurse and patient, symbolising the NHS's founding principle of free healthcare for all.",
  'UK-D-50P-2000-LIB-':  "Marks the 150th anniversary of the Public Libraries Act 1850, which enabled local councils to establish public libraries funded by local taxation — a landmark in public education and access to knowledge.",
  'UK-D-50P-2003-WSPU-': "Marks the 100th anniversary of the Women's Social and Political Union, founded by Emmeline Pankhurst in 1903; the WSPU led the militant suffragette campaign for women's right to vote.",
  'UK-D-50P-2005-JOHN-': "Marks the 250th anniversary of Samuel Johnson's 'A Dictionary of the English Language' (1755), the most influential English dictionary before the Oxford English Dictionary and a landmark in scholarship.",
  'UK-D-50P-2007-SCOU-': "Marks the centenary of the Scouting movement, founded by Robert Baden-Powell following his experimental camp on Brownsea Island in 1907; this is the circulation version, struck alongside the proof set coin.",
  'UK-D-50P-2009-KEW-':  "Marks the 250th anniversary of the Royal Botanic Gardens at Kew, founded in 1759; with a mintage of just 210,000 this is the rarest UK circulating 50p and the most sought-after in the series.",
  'UK-D-50P-2010-GG-':   "Marks the 100th anniversary of Girlguiding UK, founded by Robert Baden-Powell and his sister Agnes in 1910; with around 500,000 members it is one of the UK's largest youth organisations.",
  'UK-D-50P-2011-WWF-':  "Marks the 50th anniversary of the WWF (World Wide Fund for Nature), founded in 1961; the coin features the famous panda logo and the organisation's conservation work.",
  'UK-D-50P-2013-BENB-': "Marks the 100th anniversary of the birth of Benjamin Britten (1913–1976), one of the greatest British composers, known for 'Peter Grimes', 'The Young Person's Guide to the Orchestra' and 'War Requiem'.",
  'UK-D-50P-2013-CHRI-': "Marks the 100th anniversary of the birth of Christopher Ironside (1913–1992), the designer of the original decimal coin reverses, including the Britannia 50p that circulated from 1969 to 2008.",
  'UK-D-50P-2018-PEOP-': "Marks the 100th anniversary of the Representation of the People Act 1918, which gave women over 30 the right to vote for the first time; full equal suffrage followed in 1928.",
  'UK-D-50P-2019-FIFT-': "Marks the 50th anniversary of the 50p coin, introduced on 14 October 1969 to replace the ten-shilling note; the seven-sided equilateral curve heptagon shape was chosen for its ease of identification by touch.",
  'UK-D-50P-2019-GG-':   "Reissue of the Girlguiding 50p celebrating the centenary of the organisation; this 2019 version joined a series of re-strikes bringing classic commemorative designs back into circulation.",
  'UK-D-50P-2019-KEW-':  "Reissue of the sought-after Kew Gardens 50p; the original 2009 coin remains significantly rarer than this 2019 re-strike, making it one of the most valuable UK circulation coins.",
  'UK-D-50P-2019-SCOU':  "Reissue of the Scouting centenary 50p as part of the 2019 re-strike programme; Scouting now has over 50 million members in 172 countries worldwide.",
  'UK-D-50P-2020-DIVE-': "Celebrates the diverse communities who have contributed to British life and history; the 'Diversity Built Britain' coin was controversial on release but celebrated as recognition of multicultural Britain.",
  'UK-D-50P-2021-DECD-': "Marks the 50th anniversary of Decimal Day, 15 February 1971, when the UK switched from the £sd system to the decimal pound; the changeover had been planned since the 1960s.",
  'UK-D-50P-2021-INSU-': "Marks 100 years since the discovery of insulin by Frederick Banting and Charles Best in 1921 at the University of Toronto; the discovery transformed the treatment of diabetes worldwide.",
  'UK-D-50P-2022-BBC-':  "Marks the 100th anniversary of the BBC, founded on 18 October 1922; the world's oldest national broadcasting organisation, the BBC introduced the first regular TV service in 1936.",
  'UK-D-50P-2022-JUBI-': "Marks Queen Elizabeth II's Platinum Jubilee in her 70th year on the throne; this 50p was issued alongside the larger £5 crown as part of the extensive Jubilee commemorative programme.",
  'UK-D-50P-2022-PRID-': "Marks 50 years of Pride in the UK; the first Pride march was held in London on 1 July 1972, inspired by the 1969 Stonewall Uprising in New York.",
  'UK-D-50P-2022-QEII-': "A memorial coin for Queen Elizabeth II following her death on 8 September 2022; the first UK coin issued under King Charles III carrying a tribute to his late mother.",
  'UK-D-50P-2023-NHS-':  "Marks 75 years of the National Health Service, founded on 5 July 1948; the NHS remains one of the world's largest publicly funded health services, free at the point of use.",
  'UK-D-50P-2023-WIND-': "Marks 75 years since the arrival of HMT Empire Windrush on 22 June 1948, which brought around 500 Caribbean migrants to the UK; Windrush Day is now celebrated annually on that date.",
  'UK-D-50P-2024-RNLI-': "Marks the 200th anniversary of the Royal National Lifeboat Institution, founded on 4 March 1824; the RNLI is a charity that operates lifeboats around the UK and Irish coasts and has saved over 140,000 lives.",

  // ── 50p Winnie the Pooh ──────────────────────────────────────────────────
  'UK-D-50P-2020-CR-':    "Features Christopher Robin, the boy who owned Winnie the Pooh, based on A.A. Milne's son Christopher Robin Milne; the stories were set in Ashdown Forest in East Sussex, known as the Hundred Acre Wood.",
  'UK-D-50P-2020-PIGL-':  "Features Piglet, Pooh's small, timid but loyal best friend; in A.A. Milne's stories, Piglet lives in a large beech tree in the Hundred Acre Wood and is often frightened but always tries to be brave.",
  'UK-D-50P-2020-WP-':    "Features Winnie the Pooh, the bear of very little brain created by A.A. Milne in 1926; the character was inspired by his son's stuffed bear, itself named after a real Canadian black bear at London Zoo.",
  'UK-D-50P-2021-OWL-':   "Features Owl, the pompous but well-meaning owl who lives in a large tree in the Hundred Acre Wood; Owl considers himself very wise and is consulted by the other animals on important matters.",
  'UK-D-50P-2021-TIGG-':  "Features Tigger, the boisterous and bouncy tiger who is 'the only one'; Tigger was introduced in Milne's 1928 sequel 'The House at Pooh Corner' and is famous for his springy tail.",
  'UK-D-50P-2021-WP&F1-': "Features Winnie the Pooh and friends in a group portrait; the first Winnie the Pooh book was published on 14 October 1926, almost exactly 100 years before the 2026 centenary.",
  'UK-D-50P-2022-EEYO-':  "Features Eeyore, the gloomy but lovable donkey who lives in the 'gloomy place' of the Hundred Acre Wood; despite his pessimistic outlook Eeyore is a much-loved character in Milne's stories.",
  'UK-D-50P-2022-KANG-':  "Features Kanga and her joey Roo; Kanga is the only female main character in Milne's stories, a kindly and practical mother who carries Roo in her pouch.",
  'UK-D-50P-2022-WP&F2-': "Features Winnie the Pooh and friends together; the series captured the affection with which the Hundred Acre Wood characters are held in British culture.",
  'UK-D-50P-2026-WPKD-':  "Marks 100 years since A.A. Milne published 'Winnie the Pooh' on 14 October 1926; this centenary coin celebrates the theme of kindness at the heart of Milne's stories.",

  // ── 5p ───────────────────────────────────────────────────────────────────
  'UK-D-5P-2007-BofS-':  "Features the Badge of Scotland — a thistle royally crowned — from the 2007 proof set; the thistle has been Scotland's national emblem since the 15th century.",
  'UK-D-5P-2023-OAK-':   "Part of the new Wildlife series under King Charles III, featuring the oak leaf; the English oak is the national tree of England and one of the most ecologically important trees in Britain.",
  'UK-D-5P-2023-OAKP-':  "Same Wildlife series oak leaf design as the standard 2023 issue, but with a Royal Mint privy mark, issued in official annual collector sets.",
  'UK-D-5P-2024-OAK-':   "2024 annual continuation of the Wildlife series oak leaf 5p definitive.",
  'UK-D-5P-2025-OAK-':   "2025 annual continuation of the Wildlife series oak leaf 5p definitive.",

  // ── Medals ───────────────────────────────────────────────────────────────
  'UK-M-CORO-1911-':     "An official Coronation medal issued on 22 June 1911 for the Coronation of King George V at Westminster Abbey; such medals were distributed to schoolchildren and civic dignitaries across the Empire.",
};

// ── Template notes for pre-decimal coins ─────────────────────────────────────
function preDecimalNote(code, name, denom, year, monarch) {
  const y = parseInt(year, 10);

  if (denom === 'Farthing') {
    const silverNote = y < 1860 ? '' : '';
    let base = `The farthing (¼d) was the smallest denomination of pre-decimal British coinage, struck in bronze from 1860; it was demonetised on 31 December 1960.`;
    if (monarch === 'Queen Victoria') base += ` The 1860 date saw Matthew Boulton's bronze replace the earlier copper farthing. Struck during the reign of Queen Victoria (1837–1901).`;
    else if (monarch === 'King Edward VII') base += ` Struck during the brief reign of King Edward VII (1901–1910).`;
    else if (monarch === 'King George V') base += ` Struck during the reign of King George V (1910–1936).`;
    else if (monarch === 'King George Vi') base += ` Struck during the reign of King George VI (1936–1952).`;
    else if (monarch === 'Queen Elizabeth II') base += ` Struck during the early reign of Queen Elizabeth II; farthings were demonetised in 1960 due to their diminishing purchasing power.`;
    if (y === 1897) base += ` The 1897 date is known in two types: a darker finish (blackened) and the normal bronze, making it a popular variety for collectors.`;
    return base;
  }

  if (denom === 'Florin') {
    let base = `The florin (2/-, or two shillings) was introduced in 1849 as Britain's first decimal coin, worth one-tenth of a pound.`;
    if (y < 1920) base += ` Pre-1920 florins were struck in sterling silver (92.5%). Struck during the reign of ${monarch.replace('King George Vi', 'King George VI')}.`;
    else if (y < 1947) base += ` From 1920 the silver content was reduced to 50%; post-1946 florins were struck in cupro-nickel. Struck during the reign of ${monarch.replace('King George Vi', 'King George VI')}.`;
    else base += ` Struck in cupro-nickel after the silver content was removed in 1947. The florin continued in circulation as the 10p after decimalisation until 1993.`;
    return base;
  }

  if (denom === 'Half Crown') {
    let base = `The half crown (2/6, two shillings and sixpence) was one of the most circulated pre-decimal coins, struck in silver until 1947 and cupro-nickel thereafter.`;
    if (y < 1947) base += ` This ${year} example was struck in ${y < 1920 ? 'sterling silver (92.5%)' : '50% silver'}. The half crown was demonetised on 31 December 1969.`;
    else base += ` This ${year} example was struck in cupro-nickel after silver was removed from British coinage in 1947. The half crown was demonetised in 1969.`;
    return base;
  }

  if (denom === 'Half Penny') {
    if (y === 1797) return `The 1797 'Cartwheel' halfpenny is one of the most distinctive coins in British numismatic history; struck by Matthew Boulton's steam-powered Soho Mint in Birmingham, its enormous weight (approx. 10.7g) was designed to equal its intrinsic copper value.`;
    let base = `The halfpenny (½d) was a small bronze coin worth half a penny.`;
    if (y < 1902) base += ` Struck during the reign of Queen Victoria (1837–1901).`;
    else if (y < 1911) base += ` Struck during the reign of King Edward VII (1901–1910).`;
    else if (y < 1937) base += ` Struck during the reign of King George V (1910–1936).`;
    else if (y < 1953) base += ` Struck during the reign of King George VI (1936–1952).`;
    else base += ` Struck during the reign of Queen Elizabeth II; the halfpenny was demonetised in August 1969 ahead of decimalisation.`;
    return base;
  }

  if (denom === 'Penny') {
    let base = `The penny (1d) is one of Britain's oldest denominations.`;
    const scottishH = code.includes('-H-') || code.includes('H-');
    const kn = code.includes('KN');
    if (kn) base += ` The 'KN' mintmark denotes striking at the Kings Norton Metal Co. mint in Birmingham, used during World War I to supplement Royal Mint output.`;
    else if (code.match(/\d{4}H-?$/) || code.match(/\d{4}-H-/)) base += ` The 'H' mintmark denotes striking at the Heaton Mint in Birmingham, used periodically when the Royal Mint needed additional capacity.`;
    if (y < 1902) base += ` This Victorian bronze penny features the laureate or veiled bust of Queen Victoria.`;
    else if (y < 1911) base += ` Struck during the reign of King Edward VII (1901–1910); the obverse bears the bare-headed portrait of Edward VII.`;
    else if (y < 1937) base += ` Struck during the reign of King George V (1910–1936). Pre-decimal pennies of this era were struck in bronze.`;
    else if (y < 1953) base += ` Struck during the reign of King George VI (1936–1952). The penny was demonetised on 31 August 1971 with decimalisation.`;
    else base += ` Struck during the reign of Queen Elizabeth II; the pre-decimal penny was demonetised on 31 August 1971 when the new 'new penny' replaced it.`;
    return base;
  }

  if (denom === 'Shilling') {
    const isScot = code.includes('-SCOT');
    let base = isScot
      ? `The Scottish shilling features a lion rampant (from the Royal Arms of Scotland) on the reverse.`
      : `The English shilling features three lions passant guardant (from the Arms of England) on the reverse.`;
    base += ` The shilling (1/-, twelve pence) was struck in silver until 1946, then cupro-nickel; it became the 5p on decimalisation in 1971.`;
    if (y < 1920) base += ` Pre-1920 shillings were sterling silver (92.5%).`;
    else if (y < 1947) base += ` From 1920 silver was reduced to 50%; from 1947 shillings were struck in cupro-nickel.`;
    if (code.includes('TYPE1')) base += ` The 1927 shilling was struck in two types with slightly different reverse designs, making this year particularly sought-after by collectors.`;
    if (code.includes('TYPE2')) base += ` The second of two reverse types struck in 1927; both types are collected alongside each other by specialist collectors.`;
    return base;
  }

  // Generic fallback for any other pre-decimal
  return `A pre-decimal ${denom.toLowerCase()} from ${year}, struck during the reign of ${monarch.replace('King George Vi', 'King George VI')}.`;
}

// ── Medal note ────────────────────────────────────────────────────────────────
function medalNote(code, name, collection, year) {
  return `An official commemorative medal (not legal tender) issued in ${year}.`;
}

function getNote(code, name, collection, denom, year, monarch) {
  if (EXPLICIT[code]) return EXPLICIT[code];
  if (code.startsWith('UK-PD-') || code.startsWith('IRL-PD-')) return preDecimalNote(code, name, denom, year, monarch);
  if (denom === 'Medal') return medalNote(code, name, collection, year);
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!verifyServiceKey(req) && !verifyOwnerToken(req)) return res.status(401).json({ error: 'Unauthorised' });

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN || !sheetId) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  try {
    const token = await getAccessToken();
    const today = new Date().toISOString().slice(0, 10);

    const readResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants?majorDimension=ROWS`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!readResp.ok) throw new Error('Sheet fetch failed: ' + readResp.status);
    const { values } = await readResp.json();
    const rows = values || [];

    const data = [];
    let updated = 0, skipped = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const code       = (row[0] || '').trim();
      const name       = (row[1] || '').trim();
      const denom      = (row[2] || '').trim();
      const collection = (row[3] || '').trim();
      const monarch    = (row[4] || '').trim();
      const year       = (row[5] || '').trim();
      const currentNote = (row[8] || '').trim();

      if (currentNote) { skipped++; continue; }

      const note = getNote(code, name, collection, denom, year, monarch);
      if (!note) { skipped++; continue; }

      const sheetRow = i + 1;
      data.push({ range: `Variants!I${sheetRow}`, values: [[note]] });
      data.push({ range: `Variants!K${sheetRow}`, values: [[today]] });
      updated++;
    }

    if (data.length === 0) {
      return res.status(200).json({ ok: true, message: 'Nothing to update', updated: 0, skipped });
    }

    // Batch in chunks of 500 ranges to stay within API limits
    const CHUNK = 500;
    for (let i = 0; i < data.length; i += CHUNK) {
      const chunk = data.slice(i, i + CHUNK);
      const batchResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: chunk }),
        }
      );
      if (!batchResp.ok) throw new Error('Batch update failed: ' + await batchResp.text());
    }

    return res.status(200).json({ ok: true, updated, skipped, message: `Updated ${updated} variants` });
  } catch (e) {
    console.error('add-notes error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};

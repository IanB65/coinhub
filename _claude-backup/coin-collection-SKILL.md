---
name: coin-collection
description: >
  UK coin collection assistant for Ian. Use this skill whenever the user mentions coins,
  their coin collection, the Royal Mint, UK coinage, or asks to find coin images. Triggers
  include: "what new coins has the Royal Mint released", "do I have this coin", "find me
  an image of [coin]", "what's this coin worth", "show me the [year] [denomination] coin",
  "check my collection", or any mention of collecting, numismatics, or specific UK coin
  series (e.g. 50p, £2, commemorative, proof, BU). Always use this skill when the user
  asks about coins — even casually — don't wait for an explicit "use my coin skill".
---

# UK Coin Collection Skill

Helps Ian manage and research his UK coin collection. Covers four main tasks:

1. Finding new/upcoming Royal Mint coins
2. Looking up coin images
3. Checking his Notion collection database
4. Getting coin values and details

---

## 1. Finding New Royal Mint Coins

**Primary source**: https://www.royalmint.com/new-coins/

Use `web_fetch` on this URL to get the latest releases. Also check:
- https://www.royalmint.com/shop/c/commemorative-coins/ for commemorative ranges
- https://www.royalmint.com/shop/c/british-coins/ for circulation coins

When presenting new coins, include:
- Coin name / series
- Denomination and finish (e.g. BU, Proof, Silver Proof)
- Issue date or release window
- Price if shown
- Whether it's limited edition or part of a series

Always check Ian's Notion collection (see §3) after fetching new coins, so you can flag which ones he already has.

---

## 2. Finding Coin Images

Use this priority order:

### Step 1 — Royal Mint Denomination Pages (check first for common denominations)
For the following denominations, fetch the dedicated Royal Mint specification page **before** doing any web search. These pages list all designs for that denomination and often include gallery images:

| Denomination | URL |
|---|---|
| 50p | https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/fifty-pence-coin/ |
| £1 | https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/one-pound-coin/ |
| £2 | https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/two-pound-coin/ |
| £5 | https://www.royalmint.com/discover/uk-coins/coin-design-and-specifications/five-pound-coin/ |

Use `web_fetch` on the relevant URL and look for the coin's design image within the page content.

### Step 2 — Royal Mint Product Search
If the denomination page doesn't have a clear image for the specific coin, search `https://www.royalmint.com` via `web_search` with the coin name + year, then fetch the product page. Royal Mint product pages usually have high-quality obverse and reverse images.

### Step 3 — Coins of the UK
If not found on Royal Mint, try: `https://www.coins-of-the-uk.co.uk/`
Good for: circulation coins, older issues, full date runs of a denomination.
Search query example: `site:coins-of-the-uk.co.uk [year] [denomination]`

### Step 4 — UK Coin Hunt
If still not found: `https://ukcoinhunt.com/`
Good for: 50p and £2 coin designs, hunt checklists, mintage figures.
Search query example: `site:ukcoinhunt.com [coin name]`

### Step 5 — Coin Checker
If still not found: `https://www.coinchecker.co.uk/`
Good for: UK coin identification, values, and general coin information.
Search query example: `site:coinchecker.co.uk [year] [denomination]`

### Step 6 — Fifty Pence
If still not found (especially for 50p coins): `https://www.fiftypence.co.uk/`
Good for: comprehensive 50p coin checklists, mintage figures, rarity rankings, and designs.
Search query example: `site:fiftypence.co.uk [coin name or year]`

When displaying images, use the `image_search` tool with a specific query like:
`"Royal Mint [year] [coin name] coin"` or `"UK [denomination] [design name] coin"`

Always show both obverse and reverse if available. Cite the source URL beneath each image.

---

## 3. Checking Ian's Notion Collection

Ian's collection is tracked in Notion. Use the Notion MCP to search his collection.

### Finding the collection database
First call `notion-search` with query `"coin collection"` or `"coins"` to locate the database.

### Checking for a specific coin
Once you have the database, use `notion-search` or fetch the page to look for:
- Coin name / design name
- Year
- Denomination
- Finish (circulation, BU, proof, silver, gold)

### What to do based on results

**Coin has instances in Notion (one or more matching entries found):**
- Report the status of each instance (e.g. owned, wanted, condition, grade)
- ✅ **In collection** — include any notes Ian has recorded

**Coin has NO instances in Notion — and it was NOT just fetched as a new Royal Mint release in this session:**
- Automatically create a new Notion entry using `notion-create-pages` (see fields below)
- Inform Ian: "I've added [coin name] to your Notion collection."

**Coin has NO instances in Notion — and it WAS just fetched as a new/upcoming Royal Mint release in this session:**
- Do NOT auto-create a Notion entry
- Leave it in the list of new releases as presented
- ❌ **Not in collection** — Ian can decide whether to add/buy it

### Adding a coin entry
Use `notion-create-pages` to add a new entry. Standard fields to populate:
- Name (coin title)
- Year
- Denomination
- Finish / grade
- Source (where purchased)
- Date acquired
- Notes

---

## 4. Coin Values and Details

For values and mintage figures:

- **Mintage / issue info**: Check Royal Mint product page first, then ukcoinhunt.com
- **Secondary market values**: Use `web_search` for `"[coin name] [year] value eBay sold"` or `"[coin] rare value UK"`
- **Circulation 50p/£2 rarity**: ukcoinhunt.com has rarity rankings and mintage tables — fetch `https://ukcoinhunt.com/50p-coins/` or `https://ukcoinhunt.com/2-pound-coins/`; also check `https://www.fiftypence.co.uk/` for 50p-specific rarity and mintage data
- **General coin values/ID**: coinchecker.co.uk is useful for identification and value lookups — search `site:coinchecker.co.uk [coin]`

When giving values, always clarify:
- Circulated vs uncirculated condition
- Whether it's a collector edition (BU/Proof) vs circulation strike
- That values fluctuate and eBay sold listings are the most reliable real-world guide

---

## General Tips

- When Ian mentions a specific coin without full details, ask for: year, denomination, and whether it's a collector edition or circulation coin — these affect image sources and values significantly.
- Always cross-reference new Royal Mint releases against his Notion collection unprompted — he'll want to know what he's missing.
- If a coin image can't be found on any of the six approved sources (Royal Mint denomination pages, Royal Mint product search, Coins of the UK, UK Coin Hunt, Coin Checker, Fifty Pence), say so clearly and suggest he check the Royal Mint catalogue directly.
- Mintage figures matter to collectors — always include them when available.

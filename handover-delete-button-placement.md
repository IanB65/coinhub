# Handover: Move Delete Buttons to Bottom of Lightbox

## What was done in this session

The **instance-level delete button** was moved from the top of each instance card to the bottom. This change is on branch `claude/coin-delete-button-placement-WbiT9` and is awaiting merge.

**File:** `CoinHub_v2.html`  
**Function:** `buildInstItemHTML()` (~line 1815)

Before — delete `×` was in `.inst-header` alongside Edit:
```js
`<button class="btn-sm" onclick="toggleInstEdit(...)">Edit</button>
 <button class="btn-sm btn-danger" onclick="removeInstance(...)">×</button>`
```

After — delete sits at the bottom of the card, right-aligned, labelled "Delete":
```js
// inst-header now only has Edit
${GUEST_MODE?'':`<div style="text-align:right;margin-top:4px">
  <button class="btn-sm btn-danger" onclick="removeInstance(...)">Delete</button>
</div>`}
```

---

## What still needs doing

The **variant-level delete button** has the same problem. It sits in `.lb-img-actions` directly below the coin image — the very top of the lightbox — alongside "Edit Variant".

**File:** `CoinHub_v2.html`  
**Function:** `renderLightboxContent()` (~line 1770)

Current code — both buttons built as variables, then dropped into `lb-img-actions`:
```js
// line 1777
const editVariantBtn   = GUEST_MODE ? '' : `<button class="btn-sm" onclick="openEditVariant('${esc(vc)}')">Edit Variant</button>`;
const deleteVariantBtn = GUEST_MODE ? '' : `<button class="btn-sm btn-danger" onclick="confirmDeleteVariant('${esc(vc)}')">Delete Variant</button>`;

// line 1782 — both rendered here, top of lightbox
<div class="lb-img-actions">${editVariantBtn}${deleteVariantBtn}</div>
```

### Required change

1. Remove `deleteVariantBtn` from the `lb-img-actions` div so only Edit Variant stays there:
   ```html
   <div class="lb-img-actions">${editVariantBtn}</div>
   ```

2. Place it at the very bottom of `lb-meta-panel`, after `${addForm}` and before the closing `</div>` of the modal innerHTML (line 1802):
   ```html
   ${addForm}
   ${GUEST_MODE?'':`<div style="text-align:right;margin-top:8px">
     <button class="btn-sm btn-danger" onclick="confirmDeleteVariant('${esc(vc)}')">Delete Variant</button>
   </div>`}
   ```
   The slightly larger `margin-top:8px` (vs `4px` for instances) gives visual separation from the Add Instance form above.

No CSS changes needed — `btn-sm btn-danger` is already defined.

---

## Verification

1. Open the lightbox for any coin — "Edit Variant" should remain under the image; "Delete Variant" should be gone from there.
2. Scroll to the bottom of the right-hand panel — "Delete Variant" should appear right-aligned, below the instances list and Add Instance form.
3. Click "Delete Variant" — the `confirmDeleteVariant()` confirm dialog should still fire and deletion should complete normally.
4. Confirm guest mode hides both buttons (neither Edit Variant at top nor Delete Variant at bottom should appear).

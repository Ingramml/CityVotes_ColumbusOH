# Plan: Add Non-Voted Agenda Items + Deploy to Vercel

## Context

The website currently processes only `Voted-Items.csv` files (14,034 items). There are also `Votes.csv` files containing ALL agenda items (~25,419 total). The ~11,385 non-voted items include first readings, communications, committee headers, roll calls, adjournments, etc. The user wants to display meaningful non-voted items and determine their importance. Additionally, the site needs to be deployed to Vercel.

---

## Part 1: Non-Voted Item Importance Classification

Not all 11,385 non-voted items are worth displaying. Classification by importance:

### HIGH — Display in meeting agendas AND searchable (~4,350 items)
- **First Readings** (~4,151): Legislation introduced for first time — citizens want to track upcoming bills
- **Read and Filed** (~141): Department communications filed into record
- **Adopted/Approved without vote** (~8): Ceremonial resolutions adopted without roll call
- **Other legislative actions** (~54): Waived readings, amendments

### MEDIUM — Display as section headers in meeting agendas only (~2,470 items)
- Committee headers (e.g., "FINANCE: BANKSTON, CHR. ALL MEMBERS")
- Section markers ("EMERGENCY, POSTPONED AND 2ND READING...")
- "CONSENT ACTIONS", "APPOINTMENTS", "VARIANCES" headers

### LOW — Show as minimal procedural markers in meeting agendas (~590 items)
- "ADDITIONS OR CORRECTIONS TO THE JOURNAL/AGENDA"
- "COMMUNICATIONS AND REPORTS RECEIVED BY CITY CLERK'S OFFICE"

### NOISE — Exclude entirely (~335 items)
- Roll calls, adjournments, recess/reconvene timestamps
- "FROM THE FLOOR", "EXECUTIVE SESSION", next-meeting announcements

---

## Part 2: Implementation Steps

### Step 1: Add Votes CSV reading to `build-data.js`

**File:** `build-data.js`

- Add `discoverVotesCSVFiles()` — same pattern as existing discovery, but matches `*-Votes.csv` (excluding `Voted-Items`)
- Add `classifyNonVotedItem(row)` function that returns `{ category, importance, display_type }` based on title, action, and matter_file fields
- After existing Voted-Items loop, add new loop to read Votes CSVs
- Skip items already seen (by `event_item_id`) — these are the voted items
- Skip items classified as "noise"
- Collect remaining items into `allNonVotedItems` array
- Update meeting `agenda_item_count` to reflect full agenda

### Step 2: Generate `meetings/{id}.json` files (NEW — ~164 files)

**File:** `build-data.js` (new output step)

Pre-built per-meeting JSON containing the FULL agenda (voted + non-voted), sorted by `agenda_sequence`. Structure:

```json
{
  "meeting": {
    "id": 164, "event_id": "6137", "meeting_date": "2025-12-15",
    "vote_count": 195, "non_voted_count": 78, "agenda_item_count": 273,
    "agenda_items": [
      { "agenda_sequence": 2, "item_type": "non_voted", "category": "committee_header",
        "importance": "medium", "display_type": "section_header", "title": "FINANCE..." },
      { "agenda_sequence": 3, "item_type": "voted", "title": "To authorize...",
        "item_number": "CA-1", "vote": { "id": 13500, "outcome": "PASS", "ayes": 9, ... } },
      { "agenda_sequence": 17, "item_type": "non_voted", "category": "first_reading",
        "importance": "high", "title": "To authorize...", "matter_file": "2552-2025",
        "action": "Read for the First Time", "topics": ["Contracts"] }
    ]
  }
}
```

Key decision: **No individual JSON files for non-voted items** — they're embedded in meeting files. This adds only ~165 files instead of ~11,385, staying well within Vercel limits.

### Step 3: Generate `agenda-items.json` (NEW — 1 file)

**File:** `build-data.js` (new output step)

Single file with all HIGH-importance non-voted items (~4,350) for the agenda search page. Each item gets topic classification via existing `assignTopics()`.

### Step 4: Update `stats.json` and `meetings.json`

- `stats.json`: Add `total_agenda_items`, `total_non_voted_items`, `first_readings` fields
- `meetings.json`: Add `non_voted_count`, `first_reading_count` per meeting; `agenda_item_count` now reflects full agenda

### Step 5: Update `Frontend/js/api.js`

- Modify `getMeeting()` to load pre-built `meetings/{id}.json` instead of assembling at runtime
- Add `getAgendaItems()` method for search page

### Step 6: Update `meeting-detail.html`

- Section headers -> dark background bar with bold uppercase text
- HIGH non-voted items -> similar to voted items but with action badges ("First Reading" blue, "Read & Filed" gray, "Adopted" teal) instead of vote outcome badges; no "Details" link
- LOW items -> single muted line
- Stats cards: add "First Readings" card, update "Agenda Items" to show full count

### Step 7: Update `agenda-search.html`

- Load both `votes.json` and `agenda-items.json`
- Add "Item Type" filter dropdown: All / Voted Only / First Readings / All Non-Voted
- Non-voted results show action badges instead of pass/fail
- Non-voted results link to meeting-detail page (not vote-detail)
- KPI "Total in Database" shows combined count

### Step 8: Update `index.html` and `meetings.html`

- `index.html`: Add total agenda items context to stats dashboard
- `meetings.html`: Show "195 votes / 273 total items" format

### What does NOT change
- `votes.html` — voting behavior page, only voted items
- `vote-detail.html` — roll-call details, only voted items
- `council.html` / `council-member.html` — member voting stats, only voted items
- `votes/{id}.json`, `council/{id}.json`, `alignment.json` — unchanged
- All existing vote calculations (pass rate, alignment, etc.)

---

## Part 3: Deploy to Vercel

### Step 9: Initialize git and push to GitHub

```bash
cd /Users/michaelingram/Documents/GitHub/ColumbusCityVotes
git init
git add Frontend/ build-data.js package.json .gitignore
git commit -m "Initial commit: Columbus City Votes website"
git remote add origin <github-repo-url>
git push -u origin main
```

Note: `.gitignore` already excludes `.claude/`, `master-files/`, and `*.csv`

### Step 10: Deploy Frontend/ to Vercel

Per `template/BUILD_GUIDE.md`:
1. Connect GitHub repo to Vercel
2. Framework Preset: "Other" (static site)
3. Root Directory: `Frontend`
4. Build Command: empty (no build step)
5. `vercel.json` already configured with clean URLs, cache headers for JSON/HTML/CSS/JS

---

## Verification

1. Run `node build-data.js` — verify new console output for Votes CSV processing and file counts
2. Check `stats.json` has `total_agenda_items: 25419`
3. Spot-check a `meetings/{id}.json` — items sorted by sequence, both types present
4. Check `agenda-items.json` — only HIGH-importance, has topics
5. Browse `meeting-detail.html` — section headers, first reading badges, voted items unchanged
6. Browse `agenda-search.html` — item type filter works, mixed results render correctly
7. Verify `votes.html`, `council.html` unchanged
8. After deploy: verify all pages load on Vercel with clean URLs

## Files Modified

| File | Change |
|------|--------|
| `build-data.js` | Add Votes CSV reading, classification, meetings/{id}.json, agenda-items.json, updated stats |
| `Frontend/js/api.js` | New getMeeting() using pre-built files, new getAgendaItems() |
| `Frontend/meeting-detail.html` | Render section headers, first readings, action badges |
| `Frontend/agenda-search.html` | Dual data source, item type filter, mixed results |
| `Frontend/index.html` | Enhanced stats with total agenda items |
| `Frontend/meetings.html` | Show vote count + total items |

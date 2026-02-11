# Lessons Learned: General (Applicable to Any City Deployment)

## JavaScript Date Handling

### UTC Date Parsing Bug
- `new Date("2025-12-15")` parses ISO date-only strings as **UTC midnight**. In US timezones (UTC-5 to UTC-8), this displays as the **previous day** (e.g., December 14 instead of December 15).
- **Fix**: Always append `T00:00:00` to force local timezone interpretation: `new Date("2025-12-15T00:00:00")`.
- This bug affects every `formatDate()` function across all HTML pages. Must fix in every file — there is no shared utility file in the template.
- The bug is invisible during development if the developer's machine is set to UTC, and only appears in US timezones.

## Clean URLs and Navigation

### Query Parameter Stripping
- When using `cleanUrls: true` (Vercel) or similar clean URL features in static servers, links like `council-member.html?id=1` may have the `?id=1` query parameter stripped.
- **Fix**: Use clean URL format for all internal links: `council-member?id=1` (no `.html` extension).
- This must be applied consistently across ALL HTML files — both `href` attributes and any JavaScript that constructs URLs.

### Local Development Server
- `npx serve` supports clean URLs but behaves slightly differently than Vercel. Always test with the same clean URL format you'll use in production.

## CSV Data Pipeline

### Dynamic Column Discovery
- Council member vote columns appear after a fixed set of base columns (34 in this case). The column names ARE the member names.
- Different quarters may have different members. Discover columns dynamically rather than hardcoding names.
- Member names in column headers must be trimmed — whitespace issues are common in CSV exports.

### CSV Parsing
- Standard CSV libraries work, but for zero-dependency pipelines, RFC 4180 parsing must handle: quoted fields, escaped quotes (`""`), multiline values within quotes, and mixed line endings (`\r\n` vs `\n`).
- The `Agenda_item_fulltext` field frequently contains newlines, HTML fragments, and special characters within quoted CSV fields.

### Name Disambiguation
- When generating short names (last names only), check for:
  - **Suffixes**: III, II, IV, Jr., Sr. — these should NOT be the short name. "Otto Beatty III" → "Beatty III" not "III".
  - **Duplicate last names**: When two members share a last name, use first-initial disambiguation ("E. Brown", "M. Brown").
- Build a short name map after discovering all members, not during member discovery.

### Outcome Classification
- Do NOT rely solely on a single `passed` boolean field. Cross-reference with:
  - `matter_status_name` (e.g., "Defeated", "Passed", "Enacted")
  - `action` (e.g., "Read for the First Time", "Tabled", "Withdrawn")
  - `action_text` (e.g., "motion carried")
- Procedural actions (first readings, filings) may have `passed=0` but are not failures.
- Build a classification function with explicit checks for each outcome type: PASS, FAIL, CONTINUED, TABLED, WITHDRAWN, REMOVED.

## Frontend Architecture

### Repeated Code Across Pages
- Each HTML page has its own inline `<script>` with duplicated helper functions (`formatDate`, `escapeHtml`, etc.). A bug in one function must be fixed in ALL pages (7+ files).
- Consider extracting shared utilities into a common JS file for future deployments.

### Filter UI Pattern
- The Current/Former council member filter is a reusable pattern:
  1. Add `data-*` attributes to card container elements during rendering.
  2. Use a `btn-group` with toggle buttons.
  3. Filter function: toggle `display: none` on containers based on `dataset` values.
  4. Update active button styling by toggling `btn-primary`/`btn-outline-primary` classes.
- This pattern can be applied to any categorical filter (year, topic, outcome, etc.).

### Expandable Text
- Long text fields (agenda full text, descriptions) should be truncated with a "Read more" / "Show less" toggle.
- 300 characters is a reasonable truncation threshold for legislative text.
- Use two elements (preview + full) and toggle visibility, rather than manipulating innerHTML on each click.

### Vote Tally Display
- Always show all 4 tally numbers: Ayes-Noes-Abstain-Absent.
- Use consistent color coding: green (ayes), red (noes), yellow (abstain), gray (absent).
- Even if a city has zero noes/abstains, display the zeros — users expect to see the full breakdown.

### Outcome Badge Handling
- **Never use binary outcome logic** (`outcome === 'PASS' ? green : red`). There are at least 6 possible outcomes: PASS, FAIL, CONTINUED, TABLED, WITHDRAWN, REMOVED.
- Non-PASS votes are NOT always failures. A "Continued" or "Tabled" item should show a yellow/info badge, not red "Failed".
- Create a reusable `getOutcomeBadge(outcome)` function that maps all outcomes to badge classes and labels. Copy it to every page that displays outcomes, or better yet, extract to a shared JS file.
- This bug was found on 3 separate pages (council-member, meeting-detail, agenda-search) — each had its own incomplete implementation.

### Progress Bar Calculations
- Never derive progress bar segment widths from percentages of other percentages. Use raw counts divided by total: `(aye_count / total_votes) * 100`.
- The formula `100 - aye_percentage - (100 - participation_rate)` simplifies to `participation_rate - aye_percentage`, which can produce **negative widths** and is conceptually wrong.
- Each progress bar segment should map to one data field: aye, nay, abstain, absent. Four segments that sum to 100%.

### Division by Zero Protection
- Vote tallies can sum to zero (procedural items with no recorded votes). Always guard: `const total = (ayes + noes + abstain + absent) || 1`.
- Without this, progress bars get `NaN%` widths and disappear entirely.

### Null Safety in Template Literals
- When rendering tally numbers in template literals, use `${value || 0}` to prevent `undefined` or `null` from appearing as text.

### Rounding Precision for Percentages
- 1-decimal rounding (`Math.round(n * 10) / 10`) can round 99.978% up to 100.0%, which is misleading when the rate is NOT actually 100%.
- Use 2-decimal rounding (`Math.round(n * 100) / 100`) for all percentage calculations. This gives 99.98% — clearly not 100%.
- This applies to pass rate, unanimous rate, aye percentage, participation rate, dissent rate, and alignment rate.

### Hardcoded Filter Options
- **Never hardcode dropdown options** (topics, categories) that should come from the data. If new topics appear in a data refresh, the filter won't show them.
- Always extract filter options dynamically: `const topics = new Set(); votes.forEach(v => v.topics.forEach(t => topics.add(t)));`
- This was found on 2 pages (votes.html, agenda-search.html) where topic lists were hardcoded arrays of 16 items.

### Vote Choice Filters
- Include ALL possible vote choices in filter dropdowns: AYE, NAY, ABSTAIN, ABSENT, and **RECUSAL**. Recusal is rare but important — users specifically look for conflicts of interest.

### Case Sensitivity in Filters
- Data values and filter option values must match case. If data has `"regular"` but the filter sends `"Regular"`, no results appear.
- Use case-insensitive comparison: `value.toLowerCase() !== filter.toLowerCase()`.

## External Service Integration

### Legistar URLs
- Legistar meeting detail URLs vary by city and use different parameter schemes:
  - `LEGID` + `GID` + `G` (newer pattern)
  - `ID` + `GUID` + `Options` (older pattern)
- The `event_id` from Legistar API exports does NOT always map to the `ID` parameter — it may map to `LEGID`. Test the URL before deploying.
- The `GID` and `G` parameters are constants per legislative body (e.g., city council) but differ between cities.
- Always verify Legistar URLs by testing with actual data before building URL templates.

## Testing

### Timezone-Sensitive Bugs
- Date display bugs may not be caught in automated tests if the test environment uses UTC or a different timezone than end users. Consider testing with explicit timezone settings.

### Hidden Elements in DOM
- When testing page content with `page.textContent()`, hidden error state elements may appear in the text even though they're invisible to users. Check `:visible` elements or use `isVisible()` assertions.

### Data Validation Scripts
- Create standalone data-checking scripts (e.g., `check-tally.js`, `check-fails.js`) during development. These are invaluable for understanding edge cases in the source data and can be rerun after pipeline changes.

### Data Refresh Testing
- After any data refresh, re-run a full audit of all pages. Initial data may lack certain vote types (NAY, ABSTAIN, RECUSAL) that appear later, exposing bugs in:
  - Binary outcome logic (assumes only PASS/FAIL)
  - Progress bar formulas (assumes no NAY segment)
  - Rounding (99.978% rounds to 100% but shouldn't)
  - Filter dropdowns (hardcoded options miss new categories)
- **Best practice**: Test with synthetic edge-case data during development (votes with all outcome types, zero-total votes, members with every vote choice type) — don't rely on production data to cover all cases.

## Deployment

### Vercel Configuration
- `vercel.json` with `cleanUrls: true` is essential for the clean URL routing.
- Set appropriate cache headers for JSON data files to balance freshness and performance.
- The deploy root should be the `Frontend/` subdirectory, not the project root.

### File Volume
- The pipeline generates 14,000+ individual vote JSON files. Verify that the hosting platform handles this volume (Vercel has file count limits on some plans).
- Consider whether individual vote files could be consolidated into fewer files for cities with very high vote counts.

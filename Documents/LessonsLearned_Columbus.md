# Lessons Learned: Columbus, OH City Council

## Data Characteristics

### Voting Patterns
- Columbus City Council votes are overwhelmingly unanimous: 95.45% have zero NAY and zero ABSTAIN votes.
- 30 votes have NAY votes, 612 have ABSTAIN votes across 14,034 total votes (2021-2025).
- The pass rate is 99.98%. Only 2 items out of 14,034 were truly "Defeated" (0-6 votes).
- Alignment scores between member pairs are still very high (~99-100%), so the "Least Aligned" section has limited differentiation.
- Dissent rates are very low but non-zero: highest is Shayla Favor at 0.16%, lowest are several members at 0%.

### Council Composition
- 13 unique members across 2021-2025, but only 7-9 serve at any given time.
- 9 current members, 4 former members.
- Two members share the last name "Brown" (Elizabeth Brown and Mitchell Brown) — requires first-initial disambiguation in short names ("E. Brown", "M. Brown").
- Otto Beatty III requires suffix-aware short name parsing ("Beatty III" not "III").

### Vote Tallies
- Votes commonly show 7-0 with 9 members on council. The remaining 2 are marked ABSENT — this is normal, not a data error. Columbus regularly has 2 members absent on any given vote.
- 8 votes have 0 total tally (no member votes recorded). These correspond to procedural items where the CSV had empty member vote columns. This is a source data quality issue, not a pipeline bug.

### Outcome Classification (passed=0 Edge Cases)
- The `passed` field in the CSV is unreliable for determining true outcomes. 8 items had `passed=0`, but only 2 were actual defeats.
- Items with `passed=0` that are NOT defeats:
  - "Read for the First Time" (2 items) — procedural first reading, effectively passed
  - "Read and Filed" (2 items) — procedural filing, effectively passed
  - "motion carried" in action_text (1 item) — passed despite passed=0
  - "Amended to 30 day" (1 item) — continued/deferred, not defeated
- Must check `matter_status_name`, `action`, and `action_text` fields to correctly classify outcomes.
- Only `matter_status_name === "Defeated"` or `action.includes("defeat")` should be classified as FAIL.

### Legistar Integration
- Columbus uses Legistar (columbus.legistar.com) for official meeting records.
- Meeting detail URL pattern: `https://columbus.legistar.com/MeetingDetail.aspx?LEGID={event_id}&GID=139&G=4F637594-17B0-4E92-8196-37F14328D337`
- The `GID=139` and `G=4F637594-17B0-4E92-8196-37F14328D337` are constants specific to Columbus City Council.
- The `event_id` from the CSV maps to `LEGID` in the Legistar URL (NOT `ID` — using `ID` returns a 410 error).
- Agenda/minutes PDFs are hosted on `legistar3.granicus.com/Columbus/` with the event_id embedded in the filename.

### CSV Data Structure
- 20 quarterly CSV files covering 2021-Q1 through 2025-Q4.
- Two naming conventions: `Columbus-OH-2023-Q2-Voted-Items.csv` (newer) and `Columbus-OH-Q1-2023-Voted-Items.csv` (older).
- 34 fixed base columns + dynamic member vote columns (one per council member active that quarter).
- Member vote values: "Yes", "No", "Absent", "Abstain", "Recuse". After data refresh, all five values appear in the data.
- The `Agenda_item_fulltext` column contains lengthy legislative text useful for search but needs truncation for display.

### Branding
- Columbus brand colors: Navy #0f2441, Red #e31c23.
- No official city seal/logo was integrated — uses Font Awesome landmark icon instead.

### Data Refresh Surprises
- The initial CSV export had zero NAY and zero ABSTAIN votes. A subsequent data refresh from the same source introduced 30 NAY and 612 ABSTAIN votes. This revealed multiple bugs in the frontend that assumed unanimous voting.
- **Lesson**: Never assume voting patterns are stable. Data refreshes can introduce entirely new vote types (NAY, ABSTAIN, RECUSAL) that weren't present in the initial dataset.
- The pass rate rounding bug (99.978% → 100%) was invisible with the original data because the true rate was exactly 100%. It only surfaced after the data refresh introduced 2 FAIL votes.

### Failed Vote Details
- Only 2 truly defeated items in the dataset:
  - Vote 6785 (2023-06-05): Non-profit grant agreements for Recreation and Parks — 0 ayes, 6 noes
  - Vote 1644 (2021-07-26): Designated outdoor refreshment area application — 0 ayes, 6 noes
- Both were unanimous rejections (0-6) rather than close votes. The 7th member was absent in both cases.
- On the votes page, failed votes only appear when viewing "All Years" since each failed vote is in a different year (2021, 2023). Users filtering by a single year may not see them.

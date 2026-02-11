# Plan: Add All High/Medium Value Fields to Columbus Extraction

## Context
Expand `extract_q1_2023.py` with all recommended data points from EventItems, Matters, Events, Persons, and Attachments endpoints. Currently 14 fields + member columns. Adds 22 new columns plus a separate Persons CSV.

## File to Modify
`municipalities/Columbus-OH/extract_q1_2023.py`

## New Fields Summary

| # | CSV Column | API Source | Extra API Call? |
|---|-----------|-----------|-----------------|
| 1 | `agenda_sequence` | EventItemAgendaSequence | No |
| 2 | `consent` | EventItemConsent | No |
| 3 | `mover` | EventItemMover | No |
| 4 | `seconder` | EventItemSeconder | No |
| 5 | `tally` | EventItemTally | No |
| 6 | `action_text` | EventItemActionText | No |
| 7 | `matter_type` | EventItemMatterType | No |
| 8 | `matter_status` | EventItemMatterStatus | No |
| 9 | `event_location` | EventLocation | No |
| 10 | `event_time` | EventTime | No |
| 11 | `matter_type_name` | MatterTypeName | Yes - `/matters/{id}` |
| 12 | `matter_status_name` | MatterStatusName | Yes - same call |
| 13 | `matter_intro_date` | MatterIntroDate | Yes - same call |
| 14 | `matter_passed_date` | MatterPassedDate | Yes - same call |
| 15 | `matter_enactment_date` | MatterEnactmentDate | Yes - same call |
| 16 | `matter_enactment_number` | MatterEnactmentNumber | Yes - same call |
| 17 | `matter_requester` | MatterRequester | Yes - same call |
| 18 | `matter_body_name` | MatterBodyName | Yes - same call |
| 19 | `matter_title` | MatterTitle | Yes - same call |
| 20 | `attachment_links` | MatterAttachmentHyperlink (pipe-delimited) | Yes - `/matters/{id}/attachments` |
| 21-22 | Persons CSV | PersonEmail, PersonActiveFlag | Yes - 1 bulk `/persons` call |

## Implementation Steps

### 1. Add 3 new API functions (after `get_roll_calls` ~line 66)
- `get_matter_details(matter_id)` -> `/matters/{matter_id}`
- `get_matter_attachments(matter_id)` -> `/matters/{matter_id}/attachments`
- `get_persons()` -> `/persons`

### 2. Fetch persons at start of main() (~line 132)
One bulk call, build lookup dicts keyed by `PersonFullName`.

### 3. Add event-level fields to meeting_links dict (~line 149)
Add `event_location` and `event_time` from the meeting object already fetched.

### 4. Add 8 EventItem fields + 2 Event fields to item_data dict (~line 183)
All from data already in memory. Also capture `matter_id` (EventItemMatterId) for Phase 1.5 lookups. Initialize matter/attachment placeholders as empty strings.

### 5. New Phase 1.5: Fetch Matter details + Attachments (between Phase 1 and Phase 2)
- Collect unique non-null `matter_id` values from all_items
- For each, call `get_matter_details()` and `get_matter_attachments()` (cache by matter_id)
- Build `attachment_links` as pipe-delimited `MatterAttachmentHyperlink` values
- Populate 9 matter fields + attachment_links on each matching item

### 6. Update CSV fieldnames for both CSVs (~lines 262, 319)
New column order:
```
event_id, event_date, event_time, event_location,
event_item_id, agenda_number, agenda_sequence,
matter_file, matter_name, matter_title, matter_type, matter_type_name,
matter_status, matter_status_name,
matter_intro_date, matter_passed_date, matter_enactment_date, matter_enactment_number,
matter_requester, matter_body_name,
title, action, action_text, passed, consent, tally, mover, seconder,
roll_call_flag, agenda_link, minutes_link, video_link, attachment_links,
Agenda_item_fulltext, [member columns]
```
Update row dicts in both CSV write blocks to include all new fields.

### 7. Update docstring
Add mention of new fields and Matter/Attachment API calls.

### 8. Document council member change strategy
Write to `municipalities/Columbus-OH/Council-Member-Changes-Plan.md` describing the normalized votes table approach for handling member turnover across time periods.

## Reference: Council Member Changes Across Time Periods

**Problem:** The current script creates dynamic columns per council member found in that quarter's roll calls. If you extract Q1 2021 and Q1 2026, you get different column sets — members who left or joined won't align across CSVs.

**Recommended SQL approach — Normalized votes table:**
Instead of member-name columns, create a separate `votes` table with one row per member per agenda item:

```
agenda_items table:     event_item_id, event_date, matter_file, ... (no member columns)
votes table:            event_item_id, person_name, person_id, vote_value
persons table:          person_id, full_name, first_name, last_name, email, active_flag, term_start, term_end
```

This handles any number of members across any time period. Queries like "how did member X vote in 2021-2026?" become simple JOINs.

**Implementation plan for later:**
1. Add a `--normalized` flag to the extraction script
2. When set, output 3 CSVs: `agenda-items.csv` (no member columns), `votes.csv` (one row per member per item), `persons.csv`
3. The current wide-format CSVs (member columns) can remain as the default for quick spreadsheet viewing
4. Both formats draw from the same data — just different output shapes

## Verification
1. `source /tmp/cityvotes_venv/bin/activate && python3 municipalities/Columbus-OH/extract_q1_2023.py`
2. Check both main CSVs have all 34+ columns (14 existing + 20 new + member columns)
3. Verify `attachment_links` has pipe-delimited URLs where attachments exist
4. Verify matter fields populated (matter_intro_date, matter_passed_date, etc.)
5. Verify `Columbus-OH-Q1-2023-Persons.csv` exists with member contact data

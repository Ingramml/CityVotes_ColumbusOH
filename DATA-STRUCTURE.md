# CityVotes Columbus OH — Data Structure Reference

**Purpose**: Complete reference for the data pipeline, CSV inputs, JSON outputs, field definitions, relationships, and classification logic used by this CityVotes site. Written for both human developers and LLMs working on the codebase.

---

## Table of Contents

1. [Data Flow Overview](#data-flow-overview)
2. [Project File Layout](#project-file-layout)
3. [CSV Input Files](#csv-input-files)
4. [CSV Column Definitions (34 Base Columns)](#csv-column-definitions-34-base-columns)
5. [Dynamic Member Vote Columns](#dynamic-member-vote-columns)
6. [Vote Value Mapping](#vote-value-mapping)
7. [Classification Logic](#classification-logic)
8. [Topic Classification Keywords](#topic-classification-keywords)
9. [JSON Output Files](#json-output-files)
10. [Relationships Between Files](#relationships-between-files)
11. [Build Pipeline Steps](#build-pipeline-steps)
12. [Year Filter Configuration](#year-filter-configuration)

---

## Data Flow Overview

```
Columbus-OH/*.csv  →  build-data.js  →  Frontend/data/*.json  →  Frontend HTML/JS
     (input)           (pipeline)           (output)              (renders data)
```

- **Input**: Quarterly CSV files extracted from the Columbus Legistar API
- **Pipeline**: `node build-data.js` — zero external dependencies, Node.js built-ins only
- **Output**: Static JSON files consumed by `Frontend/js/api.js`
- **Frontend**: Fully data-driven — loads whatever JSON exists in `Frontend/data/`

---

## Project File Layout

```
project-root/
  build-data.js                        # Build pipeline (CSV → JSON)
  Columbus-OH/                         # Source CSV data folder
    Columbus-OH-{YEAR}-Q{N}-Voted-Items.csv
    Columbus-OH-{YEAR}-Q{N}-Votes.csv
    Columbus-OH-{YEAR}-Q{N}-Persons.csv
    extract_columbus.py                # Legistar API extraction script
  Frontend/
    data/                              # Generated JSON files (output)
      stats.json
      council.json
      council/{id}.json
      meetings.json
      meetings/{id}.json
      votes.json
      votes-{year}.json
      votes-index.json
      votes/{id}.json
      alignment.json
      agenda-items.json
    js/api.js                          # Frontend data-fetching layer
    *.html                             # Static HTML pages
    css/                               # Stylesheets
```

---

## CSV Input Files

### File Naming Convention

Two formats are supported (the build script handles both):

| Format | Pattern | Example |
|--------|---------|---------|
| **Standard** | `Columbus-OH-{YEAR}-Q{QUARTER}-{Type}.csv` | `Columbus-OH-2023-Q1-Voted-Items.csv` |
| **Legacy** | `Columbus-OH-Q{QUARTER}-{YEAR}-{Type}.csv` | `Columbus-OH-Q1-2023-Voted-Items.csv` |

### CSV File Types

| Type | Filename Contains | Purpose |
|------|-------------------|---------|
| **Voted-Items** | `-Voted-Items.csv` | Agenda items that received roll call votes. Contains base columns + member vote columns. |
| **Votes** | `-Votes.csv` (not `Voted-Items`) | All agenda items including non-voted items. Used to extract first readings, adopted items, procedural items, etc. |
| **Persons** | `-Persons.csv` | Council member roster data. Not currently used by `build-data.js` (members are discovered from Voted-Items column headers). |

### Discovery Logic in build-data.js

```javascript
// Voted-Items: files containing 'Voted-Items.csv'
// Regex: /Columbus-OH-(\d{4})-Q(\d)/ or /Columbus-OH-Q(\d)-(\d{4})/
discoverCSVFiles()

// Votes (non-voted items): files ending with '-Votes.csv', excluding 'Voted-Items'
// Same regex patterns
discoverVotesCSVFiles()
```

Both functions extract `year` and `quarter` from the filename and apply the `YEAR_RANGE` filter.

---

## CSV Column Definitions (34 Base Columns)

Columns 0–33 are fixed across all CSV files. Column numbering is 0-based.

### Event-Level Fields (Columns 0–3)

| # | Column | Source | Description |
|---|--------|--------|-------------|
| 0 | `event_id` | Legistar `EventId` | Unique meeting identifier |
| 1 | `event_date` | Legistar `EventDate` | Meeting date (`YYYY-MM-DD` or `M/D/YYYY`) |
| 2 | `event_time` | Legistar `EventTime` | Meeting time (e.g., `5:00 PM`) |
| 3 | `event_location` | Legistar `EventLocation` | Location (e.g., `City Council Chambers, Rm 231`) |

### Agenda Item Fields (Columns 4–14)

| # | Column | Source | Description |
|---|--------|--------|-------------|
| 4 | `event_item_id` | Legistar `EventItemId` | Unique agenda item identifier |
| 5 | `agenda_number` | Legistar `EventItemAgendaNumber` | Agenda reference number |
| 6 | `agenda_sequence` | Legistar `EventItemAgendaSequence` | Numeric sort order within meeting |
| 7 | `title` | Legistar `EventItemTitle` | Agenda item title |
| 8 | `action` | Legistar `EventItemActionName` | Action taken (e.g., `Passed`, `Approved`, `Read for the First Time`) |
| 9 | `action_text` | Legistar `EventItemActionText` | Detailed action description |
| 10 | `passed` | Legistar `EventItemPassedFlag` | `1` = passed, `0` = failed, empty = no vote |
| 11 | `consent` | Legistar `EventItemConsent` | `1` = consent agenda item |
| 12 | `tally` | Legistar `EventItemTally` | Vote tally string (often empty for unanimous) |
| 13 | `mover` | Legistar `EventItemMover` | Member who moved the item |
| 14 | `seconder` | Legistar `EventItemSeconder` | Member who seconded |

### Matter Fields from EventItem (Columns 15–18)

| # | Column | Source | Description |
|---|--------|--------|-------------|
| 15 | `matter_file` | Legistar `EventItemMatterFile` | File number (e.g., `PN0059-2026`) |
| 16 | `matter_name` | Legistar `EventItemMatterName` | Short matter name |
| 17 | `matter_type` | Legistar `EventItemMatterType` | Numeric matter type ID |
| 18 | `matter_status` | Legistar `EventItemMatterStatus` | Numeric matter status ID |

### Matter Fields from /matters/{id} API (Columns 19–27)

| # | Column | Source | Description |
|---|--------|--------|-------------|
| 19 | `matter_title` | Legistar `MatterTitle` | Full matter title/description |
| 20 | `matter_type_name` | Legistar `MatterTypeName` | Type name (e.g., `Ordinance`, `Resolution`) |
| 21 | `matter_status_name` | Legistar `MatterStatusName` | Status name (e.g., `Passed`, `First Reading`) |
| 22 | `matter_intro_date` | Legistar `MatterIntroDate` | Date matter was introduced |
| 23 | `matter_passed_date` | Legistar `MatterPassedDate` | Date matter passed |
| 24 | `matter_enactment_date` | Legistar `MatterEnactmentDate` | Date enacted into law |
| 25 | `matter_enactment_number` | Legistar `MatterEnactmentNumber` | Ordinance/resolution number |
| 26 | `matter_requester` | Legistar `MatterRequester` | Requesting person/department |
| 27 | `matter_body_name` | Legistar `MatterBodyName` | Originating body (e.g., `Columbus City Council`) |

### Links and Text (Columns 28–33)

| # | Column | Source | Description |
|---|--------|--------|-------------|
| 28 | `roll_call_flag` | Legistar `EventItemRollCallFlag` | `1` = roll call recorded |
| 29 | `agenda_link` | Legistar `EventAgendaFile` | URL to meeting agenda PDF |
| 30 | `minutes_link` | Legistar `EventMinutesFile` | URL to meeting minutes PDF |
| 31 | `video_link` | Legistar `EventVideoPath` | URL to video recording |
| 32 | `attachment_links` | Legistar `/matters/{id}/attachments` | Pipe-delimited URLs to supporting documents |
| 33 | `Agenda_item_fulltext` | Web scraping (`FullText=1`) | Complete legislative text from web portal |

---

## Dynamic Member Vote Columns

Columns 34+ are one column per council member. The column header is the member's full name.

```
BASE_COL_COUNT = 34  // columns 0-33 are fixed
memberColumns = headers.slice(34)  // everything after is member names
```

**Member count varies by time period:**
- Q1 2023: 7 members
- 2025–2026: 9 members

**Example member names**: `Emmanuel V. Remy`, `Lourdes Barroso De Padilla`, `Shannon G. Hardin`

**Cell values**: `Yes`, `No`, `Absent`, `Abstain`, `Recuse`, `Recused`, `Recusal`, or empty

---

## Vote Value Mapping

CSV cell values are mapped to standardized JSON values:

| CSV Value | JSON Value |
|-----------|------------|
| `Yes` | `AYE` |
| `No` | `NAY` |
| `Absent` | `ABSENT` |
| `Abstain` | `ABSTAIN` |
| `Recuse` / `Recused` / `Recusal` | `RECUSAL` |
| Empty or unrecognized | `null` (excluded from memberVotes) |

Matching is **case-sensitive** and values are trimmed of whitespace.

### Outcome Determination

| `passed` Column | Outcome |
|-----------------|---------|
| `1` | `PASS` |
| `0` | `FAIL` |
| Empty/null | `PASS` (default) |

### Section Classification

Evaluated in order:

| Condition | Section |
|-----------|---------|
| `consent` field = `1` | `CONSENT` |
| Title contains `PUBLIC HEARING` or `ZONING` | `PUBLIC_HEARING` |
| Everything else | `GENERAL` |

---

## Classification Logic

### Non-Voted Item Classification

Items from `-Votes.csv` that don't appear in `-Voted-Items.csv` are classified by importance:

#### HIGH Importance (Substantive Legislative Items)

| Category | Trigger | Display Type |
|----------|---------|--------------|
| `first_reading` | action = `Read for the First Time` | `legislation` |
| `read_and_filed` | action = `Read and Filed` | `communication` |
| `adopted_no_vote` | action = `Adopted` or `Approved` | `legislation` |
| `legislative_action` | action = `Waive the 2nd Reading` or `Amended as submitted to the Clerk` | `legislation` |
| `matter_no_action` | `matter_file` exists AND no `action` | `legislation` |

#### MEDIUM Importance (Section Headers)

| Category | Trigger | Display Type |
|----------|---------|--------------|
| `consent_header` | Title contains `CONSENT ACTIONS` or `CONSENT AGENDA` | `section_header` |
| `resolutions_header` | Title = `RESOLUTIONS OF EXPRESSION` | `section_header` |
| `appointments_header` | Title = `APPOINTMENTS` | `section_header` |
| `emergency_section` | Title has `EMERGENCY` + (`POSTPONED` or `2ND READING` or `30-DAY`) | `section_header` |
| `variances_header` | Title = `VARIANCES` | `section_header` |
| `public_hearing_header` | Title has `PUBLIC HEARING` and no `matter_file` | `section_header` |
| `zoning_header` | Title has `ZONING` and no `matter_file` | `section_header` |
| `first_reading_header` | Title contains `FIRST READING OF 30-DAY` | `section_header` |
| `committee_header` | Title contains `CHR.` | `section_header` |

#### LOW Importance (Minor Procedural)

| Category | Trigger | Display Type |
|----------|---------|--------------|
| `corrections` | Title contains `ADDITIONS OR CORRECTIONS` | `procedural` |
| `clerk_communications` | Title has `COMMUNICATIONS` and `CLERK` | `procedural` |

#### NOISE (Excluded Entirely)

These items are skipped during processing and never appear in JSON output:

| Category | Trigger |
|----------|---------|
| `roll_call` | Title contains `ROLL CALL` or `roll_call_flag` = `1` |
| `adjournment` | Title contains `ADJOURNMENT` or `ADJOURNED` |
| `recess` | Title starts with `RECESS` or `RECONVENE` |
| `announcement` | Title starts with `THE NEXT REGULAR` |
| `from_the_floor` | Title contains `FROM THE FLOOR` |
| `executive_session` | Title contains `EXECUTIVE SESSION` |
| `consent_removal` | Title contains `REMOVED FROM THE CONSENT` |
| `journal` | Title contains `READING AND DISPOSAL` |

**Default** (no match): `{ category: 'other', importance: 'medium', display_type: 'procedural' }`

---

## Topic Classification Keywords

Topics are assigned by substring matching against title + matter_title + matter_type_name + first 500 chars of fulltext (all lowercased). Maximum 3 topics per item. Defaults to `General` if none match.

| Topic | Keywords |
|-------|----------|
| **Appointments** | `appoint`, `nomination`, `designat`, `commission member` |
| **Budget & Finance** | `budget`, `appropriat`, `revenue`, `fiscal`, `auditor`, `tax`, `levy`, `fund`, `financial`, `expenditure`, `bond`, `debt`, `transfer funds` |
| **Community Services** | `library`, `social service`, `community center`, `nonprofit`, `non-profit`, `senior`, `youth program`, `human services` |
| **Contracts & Agreements** | `contract`, `agreement`, `vendor`, `procurement`, `bid`, `purchase order`, `professional services`, `service agreement`, `memorandum of understanding` |
| **Economic Development** | `economic development`, `incentive`, `tax abatement`, `enterprise zone`, `community reinvestment`, `tif`, `tax increment` |
| **Emergency Services** | `police`, `fire`, `ems`, `emergency`, `public safety`, `division of police`, `division of fire`, `911`, `safety director` |
| **Grants** | `grant`, `cdbg`, `subrecipient` |
| **Health & Safety** | `health`, `code enforcement`, `regulation`, `sanitary`, `environmental`, `pollution` |
| **Housing** | `housing`, `affordable`, `tenant`, `residential`, `homeless`, `shelter`, `hud`, `rent` |
| **Infrastructure** | `infrastructure`, `water`, `sewer`, `stormwater`, `utility`, `utilities`, `waterline` |
| **Ordinances & Resolutions** | `ceremonial resolution`, `honoring`, `declaring`, `recogni`, `celebrating`, `proclamation` |
| **Parks & Recreation** | `park`, `recreation`, `trail`, `greenway`, `playground`, `pool` |
| **Planning & Development** | `zoning`, `land use`, `planning`, `variance`, `permit`, `development plan`, `subdivision`, `plat`, `rezoning` |
| **Property & Real Estate** | `property`, `real estate`, `easement`, `lease`, `acquisition`, `right-of-way`, `deed`, `parcel`, `convey` |
| **Public Works** | `public service`, `street maintenance`, `waste`, `refuse`, `recycling`, `facilities`, `fleet`, `public works` |
| **Transportation** | `transportation`, `transit`, `bike`, `traffic`, `parking`, `sidewalk`, `road`, `highway`, `paving` |

---

## JSON Output Files

All files are written to `Frontend/data/`. Every file has `{ "success": true, ... }` as the top-level wrapper.

### stats.json

Site-wide statistics.

```json
{
  "success": true,
  "stats": {
    "total_meetings": 164,
    "total_votes": 14034,
    "total_council_members": 13,
    "pass_rate": 99.94,
    "unanimous_rate": 95.45,
    "total_agenda_items": 25419,
    "total_non_voted_items": 11385,
    "first_readings": 4076,
    "date_range": {
      "start": "2021-01-25",
      "end": "2025-12-15"
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `total_meetings` | number | Count of unique meetings |
| `total_votes` | number | Count of voted items |
| `total_council_members` | number | Count of unique members across all data |
| `pass_rate` | number | Percentage of votes with outcome PASS (2 decimals) |
| `unanimous_rate` | number | Percentage of votes with 0 noes and 0 abstains (2 decimals) |
| `total_agenda_items` | number | voted + non-voted + noise items |
| `total_non_voted_items` | number | non-voted + noise items |
| `first_readings` | number | Items classified as `first_reading` |
| `date_range.start` | string | Earliest meeting date (YYYY-MM-DD) |
| `date_range.end` | string | Latest meeting date (YYYY-MM-DD) |

---

### council.json

All council members with stats.

```json
{
  "success": true,
  "members": [
    {
      "id": 1,
      "full_name": "Emmanuel V. Remy",
      "short_name": "Remy",
      "position": "Council Member",
      "start_date": "2021-01-25",
      "end_date": null,
      "is_current": true,
      "stats": {
        "total_votes": 12500,
        "aye_count": 12000,
        "nay_count": 50,
        "abstain_count": 10,
        "absent_count": 440,
        "recusal_count": 0,
        "aye_percentage": 96.0,
        "participation_rate": 96.4,
        "dissent_rate": 0.42,
        "votes_on_losing_side": 5,
        "votes_on_winning_side": 11995,
        "close_vote_dissents": 2
      }
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Sequential ID (alphabetical by full_name) |
| `full_name` | string | Full name as it appears in CSV column headers |
| `short_name` | string | Last name (disambiguated with first initial if duplicates exist) |
| `position` | string | Always `Council Member` |
| `start_date` | string | Earliest meeting date where member voted |
| `end_date` | string/null | Latest vote date if not current; `null` if current |
| `is_current` | boolean | `true` if member's last vote date = latest meeting date overall |
| `stats.aye_percentage` | number | `(aye_count / total_votes) * 100` |
| `stats.participation_rate` | number | `((total - absent - abstain) / total) * 100` |
| `stats.dissent_rate` | number | `(votes_on_losing_side / valid_votes) * 100` |
| `stats.close_vote_dissents` | number | Losing-side votes where `abs(ayes - noes) <= 2` |

---

### council/{id}.json

Individual member detail with full vote history.

Same fields as council.json member object, plus:

```json
{
  "success": true,
  "member": {
    "...same fields as council.json...",
    "recent_votes": [
      {
        "vote_id": 14034,
        "meeting_date": "2025-12-15",
        "item_number": "42",
        "title": "To authorize...",
        "vote_choice": "AYE",
        "outcome": "PASS",
        "topics": ["Budget & Finance"]
      }
    ]
  }
}
```

`recent_votes` is sorted by `meeting_date` descending (most recent first).

---

### meetings.json

All meetings, sorted by date descending.

```json
{
  "success": true,
  "meetings": [
    {
      "id": 164,
      "event_id": "12345",
      "meeting_date": "2025-12-15",
      "meeting_type": "regular",
      "legistar_url": "https://columbus.legistar.com/MeetingDetail.aspx?LEGID=...",
      "agenda_url": "https://...",
      "minutes_url": "https://...",
      "video_url": "https://...",
      "agenda_item_count": 150,
      "vote_count": 85,
      "non_voted_count": 65,
      "first_reading_count": 20
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Sequential ID (chronological order) |
| `event_id` | string | Legistar event ID |
| `legistar_url` | string | Constructed URL to Columbus Legistar meeting detail page |
| `agenda_url` | string/null | Direct link to agenda PDF |
| `minutes_url` | string/null | Direct link to minutes PDF |
| `video_url` | string/null | Direct link to video recording |
| `vote_count` | number | Items from Voted-Items CSV for this meeting |
| `non_voted_count` | number | Non-noise items from Votes CSV not in Voted-Items |
| `first_reading_count` | number | Items with action `Read for the First Time` |

---

### meetings/{id}.json

Full meeting detail with agenda items.

```json
{
  "success": true,
  "meeting": {
    "...same fields as meetings.json...",
    "agenda_items": [
      {
        "agenda_sequence": 1,
        "item_type": "voted",
        "item_number": "1",
        "title": "To authorize...",
        "section": "CONSENT",
        "matter_file": "ORD-2023-001",
        "matter_type": "Ordinance",
        "topics": ["Budget & Finance"],
        "vote": {
          "id": 100,
          "outcome": "PASS",
          "ayes": 7,
          "noes": 0,
          "abstain": 0,
          "absent": 0
        }
      },
      {
        "agenda_sequence": 50,
        "item_type": "non_voted",
        "category": "first_reading",
        "importance": "high",
        "display_type": "legislation",
        "title": "To authorize...",
        "matter_file": "ORD-2023-050",
        "matter_type": "Ordinance",
        "action": "Read for the First Time",
        "description": "First 300 chars of fulltext...",
        "topics": ["Infrastructure"],
        "vote": null
      }
    ]
  }
}
```

`agenda_items` are sorted by `agenda_sequence` ascending. Mixed voted and non-voted items.

---

### votes.json

All votes, sorted by date descending. Titles truncated to 200 characters.

```json
{
  "success": true,
  "votes": [
    {
      "id": 14034,
      "outcome": "PASS",
      "ayes": 7,
      "noes": 0,
      "abstain": 0,
      "absent": 0,
      "item_number": "42",
      "section": "CONSENT",
      "title": "To authorize...",
      "meeting_date": "2025-12-15",
      "meeting_type": "regular",
      "topics": ["Budget & Finance"]
    }
  ]
}
```

---

### votes-index.json

Available years for the year-filter dropdown.

```json
{
  "success": true,
  "available_years": [2025, 2024, 2023, 2022, 2021]
}
```

Years are sorted descending. Only years with actual vote data are included.

---

### votes-{year}.json

Same schema as `votes.json` but filtered to a single year. One file per year (e.g., `votes-2023.json`).

---

### votes/{id}.json

Full vote detail with individual member votes.

```json
{
  "success": true,
  "vote": {
    "id": 100,
    "item_number": "42",
    "title": "Full untruncated title...",
    "description": "Full text or action text...",
    "outcome": "PASS",
    "ayes": 7,
    "noes": 0,
    "abstain": 0,
    "absent": 0,
    "meeting_id": 50,
    "meeting_date": "2023-06-05",
    "meeting_type": "regular",
    "member_votes": [
      {
        "member_id": 1,
        "full_name": "Emmanuel V. Remy",
        "vote_choice": "AYE"
      }
    ],
    "topics": ["Budget & Finance"]
  }
}
```

`member_votes` sorted by `member_id` ascending.

---

### alignment.json

Pairwise voting agreement between all council members.

```json
{
  "success": true,
  "members": ["Bankston", "Barroso De Padilla", "Remy"],
  "alignment_pairs": [
    {
      "member1": "Bankston",
      "member2": "Dorans",
      "member1_id": 1,
      "member2_id": 5,
      "shared_votes": 5000,
      "agreements": 4950,
      "agreement_rate": 99.0
    }
  ],
  "most_aligned": [],
  "least_aligned": []
}
```

| Field | Type | Description |
|-------|------|-------------|
| `members` | string[] | Short names in alphabetical order by full name |
| `shared_votes` | number | Votes where both members voted AYE or NAY (excludes absent/abstain/recusal) |
| `agreements` | number | Shared votes where both voted the same way |
| `agreement_rate` | number | `(agreements / shared_votes) * 100` |
| `most_aligned` | array | Top 3 pairs by agreement_rate |
| `least_aligned` | array | Bottom 3 pairs (reversed) |

---

### agenda-items.json

High-importance non-voted items for search/browse.

```json
{
  "success": true,
  "agenda_items": [
    {
      "event_item_id": "98765",
      "meeting_date": "2023-06-05",
      "meeting_id": 50,
      "agenda_sequence": 75,
      "title": "To authorize...",
      "matter_file": "ORD-2023-100",
      "matter_type": "Ordinance",
      "action": "Read for the First Time",
      "category": "first_reading",
      "topics": ["Infrastructure"],
      "description_preview": "First 200 chars..."
    }
  ]
}
```

Only includes items with `importance === 'high'`.

---

## Relationships Between Files

```
council.json                votes.json               meetings.json
  members[].id ──────────┐    votes[].id ──────────┐    meetings[].id
                         │                         │        │
council/{id}.json        │  votes/{id}.json        │  meetings/{id}.json
  member.recent_votes[]  │    vote.meeting_id ─────┼───→ meeting.id
    .vote_id ───────────→│    vote.member_votes[]  │    meeting.agenda_items[]
                         │      .member_id ────────┘      .vote.id ──→ votes/{id}
                         │
votes-index.json         │
  available_years[] ─────┼──→ votes-{year}.json
                         │
alignment.json           │
  .member1_id ───────────┘
  .member2_id ───────────┘
```

**Key relationships:**
- `vote.meeting_id` references `meeting.id`
- `vote.member_votes[].member_id` references `council member.id`
- `council/{id}.json recent_votes[].vote_id` references `vote.id`
- `meetings/{id}.json agenda_items[].vote.id` references `vote.id`
- `alignment.json member1_id/member2_id` reference `council member.id`
- `votes-index.json available_years` determines which `votes-{year}.json` files exist

---

## Build Pipeline Steps

The `main()` function in `build-data.js` follows this sequence:

1. **Discover CSV files** — find all Voted-Items and Votes CSVs, apply year filter
2. **Parse Voted-Items CSVs** — extract meetings, members (from column headers), and vote rows with deduplication by `event_item_id`
3. **Parse Votes CSVs** — extract non-voted items, classify by importance, skip noise
4. **Assign sequential IDs** — members (alphabetical), meetings (chronological), votes (chronological + agenda sequence)
5. **Determine member status** — `is_current` = member's last vote date equals the latest meeting date
6. **Compute vote metadata** — outcome, section, topics, tally counts for each vote
7. **Compute member stats** — aye %, participation rate, dissent rate, losing-side counts
8. **Compute pairwise alignment** — agreement rate between all member pairs
9. **Write all JSON files** — stats, council, meetings, votes, alignment, agenda-items, plus all detail files

**Deduplication**: The same `event_item_id` appearing in multiple quarterly CSVs is processed only once.

**ID assignment**: All IDs are renumbered from 1 on every build. They are not stable across rebuilds with different year ranges.

---

## Year Filter Configuration

Located at the top of `build-data.js`:

```javascript
const YEAR_RANGE = [2022, 2023];
```

| Value | Effect |
|-------|--------|
| `[2022, 2023]` | Process only 2022 and 2023 CSVs |
| `[2023, 2024]` | Process only 2023 and 2024 CSVs |
| `null` | Process ALL available CSVs (no filter) |

The filter operates on the year extracted from the CSV filename. No CSV files are deleted — only the JSON output changes.

**After changing the year range**, you must:
1. Delete all files in `Frontend/data/` (except README files)
2. Re-run `node build-data.js`
3. Verify `votes-index.json` shows only the expected years

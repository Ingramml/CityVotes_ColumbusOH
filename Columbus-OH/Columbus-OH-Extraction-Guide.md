# Columbus, OH - Legislative Data Extraction Guide

**Last Updated:** 2026-02-09
**API Status:** ✅ Fully Working
**Vote Data:** ✅ Available via RollCalls

---

## Quick Start

```bash
# Test API access
curl "https://webapi.legistar.com/v1/columbus/bodies"
```

If you get JSON data back, you're ready to go. No authentication required.

---

## CLI Extraction Tool

The parameterized extraction script `extract_columbus.py` supports extracting any quarter/year combination.

### Basic Usage

```bash
# Extract Q2 2023
python extract_columbus.py --year 2023 --quarter 2

# Fast mode (skip full text scraping, ~7 min vs ~25 min)
python extract_columbus.py --year 2023 --quarter 2 --skip-text

# Voted items only
python extract_columbus.py --year 2023 --quarter 1 --votes-only
```

### CLI Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--year` | Yes | Year to extract (e.g., 2023) |
| `--quarter` | Yes | Quarter 1-4 |
| `--skip-text` | No | Skip Playwright web scraping (faster) |
| `--votes-only` | No | Only output items with votes |
| `--output-dir` | No | Override default output directory |

### Parallel Extraction

Run multiple quarters simultaneously using agents:

```bash
# Extract all of 2023 in parallel (4 agents)
/use-agent columbus-extraction-agent --year 2023 --quarter 1
/use-agent columbus-extraction-agent --year 2023 --quarter 2
/use-agent columbus-extraction-agent --year 2023 --quarter 3
/use-agent columbus-extraction-agent --year 2023 --quarter 4
```

### Output Files

```
Columbus-OH-{YEAR}-Q{QUARTER}-Votes.csv         # All agenda items
Columbus-OH-{YEAR}-Q{QUARTER}-Voted-Items.csv   # Items with votes only
Columbus-OH-{YEAR}-Q{QUARTER}-Persons.csv       # Council member data
```

---

## Platform Overview

| Property | Value |
|----------|-------|
| **Platform** | Legistar by Granicus |
| **Client ID** | `columbus` |
| **Web Portal** | https://columbus.legistar.com/ |
| **API Base URL** | `https://webapi.legistar.com/v1/columbus/` |
| **Authentication** | None required |
| **Data Currency** | Current (updated daily) |

---

## What Data Can Be Extracted

### ✅ Available Data

| Data Type | Endpoint | Quality |
|-----------|----------|---------|
| Council bodies & committees | `/bodies` | Excellent (61 bodies) |
| Meeting events | `/events` | Excellent |
| Legislation (ordinances, resolutions) | `/matters` | Excellent |
| **Matter details** | `/matters/{id}` | **Excellent** (type, status, dates, enactment info) |
| **Matter attachments** | `/matters/{id}/attachments` | **Excellent** (PDFs, supporting docs) |
| Council members & staff | `/persons` | Good (995 total, ~573 active) |
| **Roll call votes** | `/EventItems/{id}/RollCalls` | **Excellent** |
| Vote types | `/VoteTypes` | Excellent |
| Matter types | `/MatterTypes` | Excellent |
| Matter statuses | `/MatterStatuses` | Excellent |
| Actions | `/actions` | Excellent |
| Agenda PDFs | Via `/events` | Good |
| Minutes PDFs | Via `/events` | Limited |

### ❌ Not Available or Limited

| Data Type | Status | Workaround |
|-----------|--------|------------|
| `/votes` endpoint | 404 Error | Use `/EventItems/{id}/RollCalls` instead |
| `/matters/{id}/texts` | 405 Error | Web scrape with `FullText=1` parameter |
| `/matters/{id}/sponsors` | Empty | Use `MatterRequester` from `/matters/{id}` |
| `/matters/{id}/histories` | Empty | Use event items for history |

---

## Council Structure

**Columbus City Council** - 9 members

### Current Council Members (2026, from RollCalls)

| PersonId | Name |
|----------|------|
| 1172 | Nicholas Bankston |
| 1437 | Lourdes Barroso De Padilla |
| 1686 | Otto Beatty III |
| 1603 | Nancy Day-Achauer |
| 1312 | Rob Dorans |
| 1604 | Melissa Green |
| 1265 | Emmanuel V. Remy |
| 1605 | Christopher Wyche |
| 1075 | Shannon G. Hardin |

### Q1 2023 Council Members (from RollCalls)

| Name |
|------|
| Emmanuel V. Remy |
| Lourdes Barroso De Padilla |
| Mitchell Brown |
| Nicholas Bankston |
| Rob Dorans |
| Shannon G. Hardin |
| Shayla Favor |

**Note:** Council membership changes over time. The extraction script dynamically discovers members from attendance roll calls for each time period. See `Council-Member-Changes-Plan.md` for handling member turnover across extractions.

### Key Bodies

| BodyId | Name |
|--------|------|
| 27 | Columbus City Council |
| 19 | Zoning Committee |
| 233 | City Bulletin |

---

## API Endpoints Reference

### 1. Bodies (Committees & Councils)

```bash
# Get all bodies
curl "https://webapi.legistar.com/v1/columbus/bodies"

# Get specific body
curl "https://webapi.legistar.com/v1/columbus/bodies/27"
```

**Response fields:**
- `BodyId` - Unique identifier
- `BodyName` - Name of body
- `BodyTypeName` - Type (Committee, Council, etc.)
- `BodyActiveFlag` - 1 if active, 0 if inactive

---

### 2. Events (Meetings)

```bash
# Get recent meetings
curl "https://webapi.legistar.com/v1/columbus/events?\$top=20&\$orderby=EventDate%20desc"

# Get City Council meetings only
curl "https://webapi.legistar.com/v1/columbus/events?\$filter=EventBodyId%20eq%2027&\$orderby=EventDate%20desc"

# Get meetings in date range
curl "https://webapi.legistar.com/v1/columbus/events?\$filter=EventDate%20ge%20datetime'2025-01-01'%20and%20EventDate%20lt%20datetime'2026-01-01'"
```

**Response fields:**
- `EventId` - Unique identifier (use for EventItems)
- `EventDate` - Meeting date
- `EventTime` - Meeting time
- `EventBodyName` - Body holding the meeting
- `EventAgendaFile` - URL to agenda PDF
- `EventMinutesFile` - URL to minutes PDF
- `EventVideoPath` - URL to video recording
- `EventLocation` - Meeting location

---

### 3. Event Items (Agenda Items)

```bash
# Get agenda items for a specific meeting
curl "https://webapi.legistar.com/v1/columbus/events/6149/EventItems"
```

**Response fields:**
- `EventItemId` - Unique identifier (use for RollCalls)
- `EventItemTitle` - Agenda item title
- `EventItemActionName` - Action taken (Passed, Approved, etc.)
- `EventItemPassedFlag` - 1 if passed, 0 if not, null if no vote
- `EventItemRollCallFlag` - 1 if roll call recorded
- `EventItemMatterId` - Link to legislation
- `EventItemMatterFile` - Legislation file number

---

### 4. Roll Calls (Individual Votes) ⭐

This is the key endpoint for vote data.

```bash
# Get roll call votes for an agenda item
curl "https://webapi.legistar.com/v1/columbus/EventItems/625879/RollCalls"
```

**Response fields:**
- `RollCallId` - Unique identifier
- `RollCallPersonId` - Council member ID
- `RollCallPersonName` - Council member name
- `RollCallValueId` - Vote type ID
- `RollCallValueName` - Vote value (Present, Affirmative, Negative, etc.)
- `RollCallResult` - Result code
- `RollCallEventItemId` - Link back to agenda item

**Sample Response:**
```json
{
  "RollCallId": 13647,
  "RollCallPersonId": 1172,
  "RollCallPersonName": "Nicholas Bankston",
  "RollCallValueId": 4,
  "RollCallValueName": "Present",
  "RollCallSort": 1,
  "RollCallResult": 0,
  "RollCallEventItemId": 625879
}
```

---

### 5. Vote Types

```bash
curl "https://webapi.legistar.com/v1/columbus/VoteTypes"
```

| VoteTypeId | Name | Meaning |
|------------|------|---------|
| 1 | Affirmative | Yes vote |
| 2 | Negative | No vote |
| 3 | Abstained | Abstention |
| 4 | Present | Present (attendance) |
| 6 | Absent@vote | Absent during vote |
| 7 | Absent | Absent from meeting |

---

### 6. Matters (Legislation)

```bash
# Get recent legislation
curl "https://webapi.legistar.com/v1/columbus/matters?\$top=50&\$orderby=MatterIntroDate%20desc"

# Get ordinances only (MatterTypeId=1)
curl "https://webapi.legistar.com/v1/columbus/matters?\$filter=MatterTypeId%20eq%201"

# Get resolutions only (MatterTypeId=2)
curl "https://webapi.legistar.com/v1/columbus/matters?\$filter=MatterTypeId%20eq%202"

# Get by date range
curl "https://webapi.legistar.com/v1/columbus/matters?\$filter=MatterIntroDate%20ge%20datetime'2025-01-01'%20and%20MatterIntroDate%20lt%20datetime'2026-01-01'"

# Get passed legislation
curl "https://webapi.legistar.com/v1/columbus/matters?\$filter=MatterStatusId%20eq%2010"
```

**Response fields:**
- `MatterId` - Unique identifier
- `MatterFile` - File number (e.g., "PN0059-2026")
- `MatterName` - Short name
- `MatterTitle` - Full title/description
- `MatterTypeId` / `MatterTypeName` - Type of legislation
- `MatterStatusId` / `MatterStatusName` - Current status
- `MatterIntroDate` - Introduction date
- `MatterPassedDate` - Date passed (if applicable)
- `MatterBodyName` - Originating body

---

### 7. Matter Types

```bash
curl "https://webapi.legistar.com/v1/columbus/MatterTypes"
```

| MatterTypeId | Name |
|--------------|------|
| 1 | Ordinance |
| 2 | Resolution |
| 12 | Appointment |
| 13 | Communication |
| 22 | Ceremonial Resolution |
| 23 | Public Notice |

---

### 8. Matter Statuses

```bash
curl "https://webapi.legistar.com/v1/columbus/MatterStatuses"
```

| MatterStatusId | Name |
|----------------|------|
| 4 | Consent |
| 10 | Passed |
| 11 | Defeated |
| 30 | Second Reading |
| 33 | First Reading |

---

### 9. Persons (Council Members & Staff)

```bash
# Get all persons
curl "https://webapi.legistar.com/v1/columbus/persons"

# Get active persons only
curl "https://webapi.legistar.com/v1/columbus/persons?\$filter=PersonActiveFlag%20eq%201"
```

**Response fields:**
- `PersonId` - Unique identifier
- `PersonFullName` - Full name
- `PersonFirstName` / `PersonLastName`
- `PersonActiveFlag` - 1 if active
- `PersonEmail` - Email address (often empty)
- `PersonPhone` - Phone number (often empty)

---

## Complete Extraction Workflow (Three-Phase)

### Phase 1: Collect All API Data

**Step 1: Fetch Persons (one bulk call)**
```bash
curl "https://webapi.legistar.com/v1/columbus/persons"
```
Returns ~995 persons. Build lookup dict keyed by `PersonFullName`.

**Step 2: Get City Council Meetings**
```bash
curl "https://webapi.legistar.com/v1/columbus/events?\$filter=EventBodyId%20eq%2027&\$orderby=EventDate%20desc&\$top=100"
```
Capture `EventLocation` and `EventTime` alongside meeting links.

**Step 3: For Each Meeting, Get Agenda Items**
```bash
curl "https://webapi.legistar.com/v1/columbus/events/{EventId}/EventItems"
```
Capture all EventItem fields: `AgendaSequence`, `Consent`, `Mover`, `Seconder`, `Tally`, `ActionText`, `MatterType`, `MatterStatus`, plus `EventItemMatterId` for Phase 1.5.

**Step 4: For Items with Votes, Get Roll Calls**
```bash
curl "https://webapi.legistar.com/v1/columbus/EventItems/{EventItemId}/RollCalls"
```

### Phase 1.5: Fetch Matter Details + Attachments

Collect unique `EventItemMatterId` values from all items, then for each:

```bash
# Matter details (type name, status name, dates, enactment info, requester, body)
curl "https://webapi.legistar.com/v1/columbus/matters/{MatterId}"

# Attachments (PDFs, supporting documents)
curl "https://webapi.legistar.com/v1/columbus/matters/{MatterId}/attachments"
```

Cache results by `matter_id` to avoid duplicate calls (many items share the same matter). Build `attachment_links` as pipe-delimited `MatterAttachmentHyperlink` values.

**Q1 2023 stats:** 632 unique matters, ~5 minutes with 0.25s rate limiting.

### Phase 2: Scrape Full Text via Playwright

The API's `/texts` endpoint returns 405, so full text must be extracted from the web portal.

See **[Extracting Agenda Item Full Text](#extracting-agenda-item-full-text-agenda_item_fulltext)** section below.

---

## Extracting Agenda Item Full Text (`Agenda_item_fulltext`)

Since the API `/matters/{id}/texts` endpoint returns 405 (Method Not Allowed), full legislative text must be extracted via web scraping from the Legistar portal.

### Critical: Web IDs vs API IDs

**The Legistar web portal uses different internal IDs than the API.** The `MatterId` and `MatterGuid` from the API **cannot** be used directly to construct web URLs.

| Source | ID Field | Example Value |
|--------|----------|---------------|
| API `/matters` | `MatterId` | `136237` |
| Web Portal URL | `ID` parameter | `7871398` |

**Solution:** Scrape the meeting detail page to collect `LegislationDetail` URLs keyed by file number (`MatterFile`), then use those URLs for full text extraction.

### Two-Phase Extraction Approach

**Phase 1 - Collect URLs:** For each meeting, navigate to its web detail page (`EventInSiteURL` from API) and scrape all `<a href*="LegislationDetail">` links. The link text is the file number.

**Phase 2 - Extract Text:** For each URL, append `&Options=ID|Text|&FullText=1` to load the page with full text expanded, then extract from the text container div.

### URL Pattern

The `FullText=1` parameter bypasses the need to click "Click here for full text":

```
{LegislationDetailURL}&Options=ID|Text|&FullText=1
```

**Example (from scraped meeting page):**
```
https://columbus.legistar.com/LegislationDetail.aspx?ID=7869739&GUID=40B9CDD0-9A2E-4EBF-A523-349F8E712F05&Options=ID|Text|&Search=&FullText=1
```

### Page Structure

1. **Legislation Detail Page** - Main page with metadata (Details/Reports tabs)
2. **History Tab** - Shows action history for the legislation
3. **Text Tab** - Shows truncated text with "Click here for full text" link
4. **Full Text (FullText=1)** - All text sections displayed: Explanation, Title, Body

### Verified CSS Selector

The full text container has a reliable, consistent ID:

```
#ctl00_ContentPlaceHolder1_divText
```

### Web Scraping with Playwright (Implemented)

```python
from playwright.sync_api import sync_playwright
import time

def scrape_legislation_urls(page, meeting_insite_url):
    """
    Scrape the meeting detail web page to build a mapping of
    matter file numbers to their LegislationDetail web URLs.
    """
    file_to_url = {}
    page.goto(meeting_insite_url, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    time.sleep(1)

    links = page.eval_on_selector_all(
        'a[href*="LegislationDetail"]',
        '''els => els.map(el => ({
            fileNumber: el.textContent.trim(),
            href: el.href
        }))'''
    )
    for link in links:
        if link['fileNumber']:
            file_to_url[link['fileNumber']] = link['href']

    return file_to_url

def extract_full_text(page, legislation_url):
    """
    Navigate to a LegislationDetail page with FullText=1 and extract
    the full legislative text from the Text tab.
    """
    if "FullText=1" not in legislation_url:
        separator = "&" if "?" in legislation_url else "?"
        if "Options=" in legislation_url:
            legislation_url = legislation_url.replace("Options=", "Options=ID|Text|")
        else:
            legislation_url += f"{separator}Options=ID|Text|"
        legislation_url += "&FullText=1"

    page.goto(legislation_url, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)

    text_div = page.query_selector('#ctl00_ContentPlaceHolder1_divText')
    if text_div:
        text = text_div.inner_text().strip()
        return text if text else None
    return None
```

### Rate Limiting Considerations

- API calls: 0.25s delay between requests
- Playwright page loads: 0.5s delay between pages
- Meeting page scraping: ~1-2s per meeting
- Full text extraction: ~1-2s per item

**Q1 2023 timing breakdown (8 meetings, 1,115 agenda items, 632 unique matters):**

| Phase | What | Time |
|-------|------|------|
| Phase 1 | Events + EventItems + RollCalls | ~2 min |
| Phase 1.5 | 632 matter details + 632 attachment calls | ~5 min |
| Phase 2 | 8 meeting page scrapes + 759 full text extractions | ~15-20 min |
| **Total** | | **~25 min**

### CSV Output Columns (41 total for Q1 2023)

**Event-level (4 columns)**

| Column | Source |
|--------|--------|
| `event_id` | API `EventId` |
| `event_date` | API `EventDate` |
| `event_time` | API `EventTime` |
| `event_location` | API `EventLocation` |

**Agenda Item / EventItem-level (11 columns)**

| Column | Source |
|--------|--------|
| `event_item_id` | API `EventItemId` |
| `agenda_number` | API `EventItemAgendaNumber` |
| `agenda_sequence` | API `EventItemAgendaSequence` |
| `title` | API `EventItemTitle` |
| `action` | API `EventItemActionName` |
| `action_text` | API `EventItemActionText` |
| `passed` | API `EventItemPassedFlag` |
| `consent` | API `EventItemConsent` |
| `tally` | API `EventItemTally` |
| `mover` | API `EventItemMover` |
| `seconder` | API `EventItemSeconder` |

**Matter-level from EventItem (4 columns)**

| Column | Source |
|--------|--------|
| `matter_file` | API `EventItemMatterFile` |
| `matter_name` | API `EventItemMatterName` |
| `matter_type` | API `EventItemMatterType` (numeric ID) |
| `matter_status` | API `EventItemMatterStatus` (numeric ID) |

**Matter-level from `/matters/{id}` (9 columns)**

| Column | Source |
|--------|--------|
| `matter_title` | API `MatterTitle` |
| `matter_type_name` | API `MatterTypeName` |
| `matter_status_name` | API `MatterStatusName` |
| `matter_intro_date` | API `MatterIntroDate` |
| `matter_passed_date` | API `MatterPassedDate` |
| `matter_enactment_date` | API `MatterEnactmentDate` |
| `matter_enactment_number` | API `MatterEnactmentNumber` |
| `matter_requester` | API `MatterRequester` |
| `matter_body_name` | API `MatterBodyName` |

**Links & Text (6 columns)**

| Column | Source |
|--------|--------|
| `roll_call_flag` | API `EventItemRollCallFlag` |
| `agenda_link` | API `EventAgendaFile` |
| `minutes_link` | API `EventMinutesFile` |
| `video_link` | API `EventVideoPath` |
| `attachment_links` | API `/matters/{id}/attachments` (pipe-delimited URLs) |
| `Agenda_item_fulltext` | Web scraping with `FullText=1` |

**Member Columns (dynamic)**

7 columns for Q1 2023: one per council member found in attendance roll calls.

### Persons CSV Output (separate file)

| Column | Source |
|--------|--------|
| `PersonId` | API `PersonId` |
| `PersonFullName` | API `PersonFullName` |
| `PersonFirstName` | API `PersonFirstName` |
| `PersonLastName` | API `PersonLastName` |
| `PersonEmail` | API `PersonEmail` |
| `PersonActiveFlag` | API `PersonActiveFlag` |
| `PersonPhone` | API `PersonPhone` |
| `PersonWWW` | API `PersonWWW` |

### Dependencies

```bash
pip install playwright requests
playwright install chromium
```

---

## OData Query Options

The API supports OData query parameters:

| Parameter | Example | Description |
|-----------|---------|-------------|
| `$top` | `$top=50` | Limit results |
| `$skip` | `$skip=100` | Pagination offset |
| `$orderby` | `$orderby=EventDate desc` | Sort results |
| `$filter` | `$filter=MatterTypeId eq 1` | Filter results |
| `$select` | `$select=MatterId,MatterTitle` | Select specific fields |

### Filter Examples

```bash
# Date range
$filter=MatterIntroDate ge datetime'2025-01-01' and MatterIntroDate lt datetime'2026-01-01'

# Specific type
$filter=MatterTypeId eq 1

# Multiple conditions
$filter=MatterTypeId eq 1 and MatterStatusId eq 10

# Contains (limited support)
$filter=substringof('budget', MatterTitle)
```

---

## Sample Python Script

```python
import requests
import json

BASE_URL = "https://webapi.legistar.com/v1/columbus"

def get_council_meetings(limit=50):
    """Get recent City Council meetings"""
    url = f"{BASE_URL}/events"
    params = {
        "$filter": "EventBodyId eq 27",
        "$orderby": "EventDate desc",
        "$top": limit
    }
    response = requests.get(url, params=params)
    return response.json()

def get_event_items(event_id):
    """Get agenda items for a meeting"""
    url = f"{BASE_URL}/events/{event_id}/EventItems"
    response = requests.get(url)
    return response.json()

def get_roll_calls(event_item_id):
    """Get individual votes for an agenda item"""
    url = f"{BASE_URL}/EventItems/{event_item_id}/RollCalls"
    response = requests.get(url)
    return response.json()

def extract_all_votes():
    """Extract all votes from recent meetings"""
    meetings = get_council_meetings(limit=10)

    all_votes = []
    for meeting in meetings:
        event_id = meeting['EventId']
        event_date = meeting['EventDate']

        items = get_event_items(event_id)
        for item in items:
            if item.get('EventItemRollCallFlag') == 1:
                rolls = get_roll_calls(item['EventItemId'])
                for roll in rolls:
                    roll['EventDate'] = event_date
                    roll['EventItemTitle'] = item.get('EventItemTitle')
                    roll['MatterFile'] = item.get('EventItemMatterFile')
                    all_votes.append(roll)

    return all_votes

if __name__ == "__main__":
    votes = extract_all_votes()
    print(f"Extracted {len(votes)} individual votes")
    print(json.dumps(votes[:5], indent=2))
```

---

## Data Quality Notes

### Strengths
- Roll call votes are complete with member names
- Event data is current and well-structured
- Clear linking between events, items, and matters via `EventItemMatterId`
- VoteTypes provide clear vote value definitions
- `/matters/{id}` returns rich metadata (dates, type names, status names, requester, body)
- `/matters/{id}/attachments` provides direct download links to supporting documents
- `/persons` returns all 995 persons (staff + members) with contact data
- Attachment hyperlinks point to Granicus-hosted files (stable URLs)

### Limitations
- `/votes` endpoint returns 404 (use RollCalls instead)
- `/texts` endpoint returns 405 (must web scrape with `FullText=1` parameter)
- `/matters/{id}/sponsors` returns empty (use `MatterRequester` field instead)
- `/matters/{id}/histories` returns empty (use event items for legislative history)
- Video links often null for Columbus
- Columbus passes most items by consent/voice vote — individual roll call votes are only recorded for attendance, not per-legislation votes
- `EventItemMover` and `EventItemSeconder` are often empty for consent items
- `EventItemTally` is often empty (votes are unanimous)

### Columbus-Specific Voting Pattern
Columbus City Council uses unanimous consent for the vast majority of legislation. The only roll call votes captured are **attendance roll calls** at the start of each meeting. This means:
- For items with `passed=1`, all present members voted Yes (unanimous)
- The member columns in CSV reflect inferred votes based on attendance, not individual recorded votes
- True dissenting votes are extremely rare and would need manual verification

---

## Contact Information

| Role | Contact |
|------|---------|
| City Clerk | (614) 645-3111 |
| Address | 90 West Broad Street, Columbus, OH 43215 |
| Web Portal | https://columbus.legistar.com/ |

---

## Appendix: API Response Samples

### Event Sample
```json
{
  "EventId": 6149,
  "EventBodyId": 27,
  "EventBodyName": "Columbus City Council",
  "EventDate": "2026-02-09T00:00:00",
  "EventTime": "5:00 PM",
  "EventLocation": "City Council Chambers, Rm 231",
  "EventAgendaFile": "https://legistar3.granicus.com/Columbus/meetings/2026/2/6149_A_Columbus_City_Council_26-02-09_Agenda.pdf"
}
```

### Roll Call Sample
```json
{
  "RollCallId": 13647,
  "RollCallPersonId": 1172,
  "RollCallPersonName": "Nicholas Bankston",
  "RollCallValueId": 4,
  "RollCallValueName": "Present",
  "RollCallEventItemId": 625879
}
```

---

## Lessons Learned

### 1. Web IDs vs API IDs — The Critical Gotcha

**Problem:** Legistar's web portal uses completely different internal IDs than the API. You **cannot** construct web URLs from API `MatterId` or `MatterGuid` values.

| Source | ID Field | Example |
|--------|----------|---------|
| API `/matters` | `MatterId` | `136237` |
| Web Portal URL | `ID` parameter | `7871398` |

**Solution:** Scrape the meeting detail page (`EventInSiteURL` from events API) to collect `LegislationDetail` URLs keyed by file number. The link text on the meeting page matches `EventItemMatterFile` from the API.

### 2. Endpoints That Work vs Don't

| Endpoint | Status | Notes |
|----------|--------|-------|
| `/matters/{id}` | **Works** | Rich metadata: dates, type/status names, requester, body |
| `/matters/{id}/attachments` | **Works** | Direct download URLs to Granicus-hosted files |
| `/persons` | **Works** | 995 total persons (not just 573 active) |
| `/EventItems/{id}/RollCalls` | **Works** | Use instead of `/votes` (which 404s) |
| `/matters/{id}/texts` | **405** | Must web scrape with `FullText=1` parameter |
| `/matters/{id}/sponsors` | **Empty** | Use `MatterRequester` from `/matters/{id}` instead |
| `/matters/{id}/histories` | **Empty** | Use event items for legislative history |
| `/votes` | **404** | Endpoint does not exist; use RollCalls |

### 3. Full Text Extraction — The FullText=1 Trick

Appending `&Options=ID|Text|&FullText=1` to any `LegislationDetail` URL loads the page with full text already expanded. No need to click tabs or "Click here for full text" links.

**CSS Selector:** `#ctl00_ContentPlaceHolder1_divText` — consistent across all legislation pages.

**Success rate:** 759/759 items extracted for Q1 2023 (100% when URL exists).

### 4. Columbus Voting Pattern — Consent Is King

Columbus City Council passes nearly all legislation by unanimous consent/voice vote. The **only** roll call votes recorded are attendance roll calls at meeting start.

**Implications:**
- There are no per-item "Yea/Nay" roll call records for most legislation
- Member votes must be **inferred** from attendance: present = Yes, absent = Absent
- The `EventItemMover`, `EventItemSeconder`, and `EventItemTally` fields are usually empty for consent items
- `EventItemConsent` field value `0` appears on non-consent items; consent items have different values
- True dissenting votes are extremely rare

### 5. Matter Caching Saves API Calls

Many agenda items across different meetings reference the same matter (e.g., items that appear on first reading, second reading, and final passage). Caching matter details by `matter_id` avoids duplicate API calls.

**Q1 2023:** 759 items with matter files but only 632 unique matter IDs — caching saved ~17% of API calls.

### 6. Council Member Columns Don't Scale Across Time Periods

The extraction script creates dynamic columns per council member found in that quarter's roll calls. If you extract Q1 2021 and Q1 2026, the column sets differ because members leave and join.

**Future solution:** A normalized votes table with `(event_item_id, person_name, person_id, vote_value)` rows. See `Council-Member-Changes-Plan.md` for the full plan.

### 7. Persons Data Is Broader Than Expected

`/persons` returns 995 records — not just council members but all staff, committee members, and historical figures. Filter by `PersonActiveFlag=1` for current personnel only. The Persons CSV output captures all of them for reference.

### 8. Attachment Links Are Stable

`MatterAttachmentHyperlink` values point to `legistar3.granicus.com` — these are stable, direct-download URLs to `.doc`, `.pdf`, and other file types. Multiple attachments per matter are stored as pipe-delimited values in the `attachment_links` CSV column.

### 9. Retry Logic Is Essential

The Legistar API occasionally returns 429 (rate limit) and 5xx errors. Using `requests.Session` with `urllib3.util.retry.Retry` (5 retries, exponential backoff, on status codes 429/500/502/503/504) handles these reliably.

### 10. Q1 2023 Extraction Stats (Reference)

| Metric | Value |
|--------|-------|
| Meetings | 8 |
| Total agenda items | 1,115 |
| Items with matter files | 759 |
| Unique matters | 632 |
| Full texts extracted | 759 (100%) |
| Council members (Q1 2023) | 7 |
| Persons in system | 995 |
| CSV columns (base + members) | 34 + 7 = 41 |
| Total run time | ~25 minutes |

---

## Output Files Reference

| File | Description |
|------|-------------|
| `Columbus-OH-Q1-2023-Votes.csv` | All 1,115 agenda items with 41 columns + member votes |
| `Columbus-OH-Q1-2023-Voted-Items.csv` | 643 items where `passed` is not null |
| `Columbus-OH-Q1-2023-Persons.csv` | 995 persons with contact data |
| `extract_q1_2023.py` | Three-phase extraction script |
| `Council-Member-Changes-Plan.md` | Normalized votes table strategy for multi-period extraction |

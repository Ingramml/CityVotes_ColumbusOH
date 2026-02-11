#!/usr/bin/env python3
"""
Extract Columbus City Council voting data for a specified year and quarter.
Output: CSV with one row per agenda item, columns for each council member's vote.

This script captures:
- All agenda items with their outcomes (action, passed flag)
- Per-item roll call votes from /EventItems/{id}/Votes (Affirmative, Negative, Abstained)
- Council member attendance for each meeting (from attendance roll call)
- Consent/voice vote items use attendance as proxy (all present = Yes)
- Meeting-level links: agenda PDF, minutes PDF, video
- Full legislative text for each agenda item (via Playwright web scraping)
- EventItem fields: agenda_sequence, consent, mover, seconder, tally, action_text, matter_type, matter_status
- Event fields: event_location, event_time
- Matter details (via /matters/{id}): type_name, status_name, intro/passed/enactment dates, requester, body_name, title
- Attachment links (via /matters/{id}/attachments): pipe-delimited hyperlinks
- Persons CSV: contact data for all persons in the system

Usage:
    python extract_columbus.py --year 2023 --quarter 2
    python extract_columbus.py --year 2023 --quarter 1 --skip-text
    python extract_columbus.py --year 2024 --quarter 4 --votes-only

Requirements:
    pip install requests playwright
    playwright install chromium
"""

import argparse
import requests
import csv
import time
from pathlib import Path
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from playwright.sync_api import sync_playwright

BASE_URL = "https://webapi.legistar.com/v1/columbus"
LEGISTAR_WEB = "https://columbus.legistar.com"


def get_quarter_dates(year: int, quarter: int) -> tuple:
    """
    Return (start_date, end_date) for the given year/quarter.
    Format: 'YYYY-MM-DD' for OData datetime filter.
    """
    quarters = {
        1: ("01-01", "04-01"),
        2: ("04-01", "07-01"),
        3: ("07-01", "10-01"),
        4: ("10-01", "01-01"),
    }
    start = f"{year}-{quarters[quarter][0]}"
    end_year = year + 1 if quarter == 4 else year
    end = f"{end_year}-{quarters[quarter][1]}"
    return start, end


def get_output_paths(output_dir: Path, year: int, quarter: int) -> dict:
    """Generate standardized output file paths."""
    prefix = f"Columbus-OH-{year}-Q{quarter}"
    return {
        'votes': output_dir / f"{prefix}-Votes.csv",
        'voted_items': output_dir / f"{prefix}-Voted-Items.csv",
        'persons': output_dir / f"{prefix}-Persons.csv",
    }


class ColumbusExtractionWorkflow:
    """Complete Columbus City Council data extraction workflow."""

    def __init__(
        self,
        year: int,
        quarter: int,
        skip_text: bool = False,
        votes_only: bool = False,
        output_dir: Path = None
    ):
        self.year = year
        self.quarter = quarter
        self.skip_text = skip_text
        self.votes_only = votes_only

        # Calculate date range
        self.start_date, self.end_date = get_quarter_dates(year, quarter)

        # Set output directory
        self.output_dir = output_dir or Path(__file__).parent
        self.output_paths = get_output_paths(self.output_dir, year, quarter)

        # Initialize session with retry logic
        self.session = self._create_session()

        # Runtime state
        self.all_members = set()
        self.attendance_by_meeting = {}
        self.meeting_links = {}
        self.matter_cache = {}

    def _create_session(self) -> requests.Session:
        """Create requests session with retry logic."""
        session = requests.Session()
        retry = Retry(
            total=5,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504]
        )
        adapter = HTTPAdapter(max_retries=retry)
        session.mount('http://', adapter)
        session.mount('https://', adapter)
        return session

    def _api_get(self, url, params=None):
        """Make API request with rate limiting."""
        time.sleep(0.25)
        try:
            response = self.session.get(url, params=params, timeout=30)
            if response.status_code == 200:
                return response.json()
            return None
        except Exception as e:
            print(f"  Error fetching {url}: {e}")
            time.sleep(2)
            return None

    def fetch_persons(self) -> dict:
        """Get all persons (council members, staff) - one bulk call."""
        print("Fetching persons list...")
        url = f"{BASE_URL}/persons"
        persons_raw = self._api_get(url) or []
        persons_by_name = {}
        for p in persons_raw:
            name = p.get('PersonFullName', '')
            if name:
                persons_by_name[name] = p
        print(f"Found {len(persons_by_name)} persons")
        return persons_by_name

    def fetch_meetings(self) -> list:
        """Get City Council meetings for the configured date range."""
        print(f"\nFetching {self.year} Q{self.quarter} meetings...")
        url = f"{BASE_URL}/events"
        params = {
            "$filter": f"EventBodyId eq 27 and EventDate ge datetime'{self.start_date}' and EventDate lt datetime'{self.end_date}'",
            "$orderby": "EventDate asc"
        }
        meetings = self._api_get(url, params) or []
        print(f"Found {len(meetings)} meetings")
        return meetings

    def fetch_event_items(self, event_id: int) -> list:
        """Get agenda items for a meeting."""
        url = f"{BASE_URL}/events/{event_id}/EventItems"
        return self._api_get(url) or []

    def fetch_roll_calls(self, event_item_id: int) -> list:
        """Get roll call data for an agenda item (used for attendance)."""
        url = f"{BASE_URL}/EventItems/{event_item_id}/RollCalls"
        return self._api_get(url) or []

    def fetch_item_votes(self, event_item_id: int) -> list:
        """Get individual legislation votes for an agenda item."""
        url = f"{BASE_URL}/EventItems/{event_item_id}/Votes"
        return self._api_get(url) or []

    def fetch_matter_details(self, matter_id: int):
        """Get full matter details (type, status, dates, enactment info)."""
        url = f"{BASE_URL}/matters/{matter_id}"
        return self._api_get(url)

    def fetch_matter_attachments(self, matter_id: int) -> list:
        """Get attachments for a matter (PDFs, supporting docs)."""
        url = f"{BASE_URL}/matters/{matter_id}/attachments"
        return self._api_get(url) or []

    def collect_event_items(self, meetings: list) -> list:
        """Phase 1: Collect all API data from meetings."""
        print("\n=== Phase 1: Collecting API data ===")
        all_items = []

        for meeting in meetings:
            event_id = meeting['EventId']
            event_date = meeting['EventDate'][:10]
            print(f"\nProcessing meeting {event_date} (EventId: {event_id})...")

            # Store meeting-level links and event fields
            self.meeting_links[event_id] = {
                'agenda_link': meeting.get('EventAgendaFile') or '',
                'minutes_link': meeting.get('EventMinutesFile') or '',
                'video_link': meeting.get('EventVideoPath') or '',
                'insite_url': meeting.get('EventInSiteURL') or '',
                'event_location': meeting.get('EventLocation') or '',
                'event_time': meeting.get('EventTime') or '',
            }

            items = self.fetch_event_items(event_id)
            print(f"  Found {len(items)} agenda items")

            # First pass: find the attendance roll call
            for item in items:
                if 'ROLL CALL' in (item.get('EventItemTitle') or '').upper():
                    roll_calls = self.fetch_roll_calls(item['EventItemId'])
                    attendance = {}
                    for rc in roll_calls:
                        member_name = rc['RollCallPersonName']
                        vote_value = rc['RollCallValueName']
                        self.all_members.add(member_name)
                        attendance[member_name] = vote_value
                    self.attendance_by_meeting[event_id] = attendance
                    print(f"  Found attendance roll call: {len(attendance)} members")
                    break

            # Second pass: record all items with votes/actions
            for item in items:
                # Skip pure procedural headers
                title = item.get('EventItemTitle', '') or ''
                if title.startswith('REGULAR MEETING NO.') or not title.strip():
                    continue

                # Get member attendance for this meeting
                meeting_attendance = self.attendance_by_meeting.get(event_id, {})

                item_data = {
                    'event_id': event_id,
                    'event_date': event_date,
                    'event_time': self.meeting_links[event_id]['event_time'],
                    'event_location': self.meeting_links[event_id]['event_location'],
                    'event_item_id': item['EventItemId'],
                    'agenda_number': item.get('EventItemAgendaNumber', ''),
                    'agenda_sequence': item.get('EventItemAgendaSequence', ''),
                    'matter_file': item.get('EventItemMatterFile', ''),
                    'matter_name': item.get('EventItemMatterName', ''),
                    'matter_type': item.get('EventItemMatterType', ''),
                    'matter_status': item.get('EventItemMatterStatus', ''),
                    'title': title,
                    'action': item.get('EventItemActionName', ''),
                    'action_text': item.get('EventItemActionText', ''),
                    'passed': item.get('EventItemPassedFlag'),
                    'consent': item.get('EventItemConsent', ''),
                    'tally': item.get('EventItemTally', ''),
                    'mover': item.get('EventItemMover', ''),
                    'seconder': item.get('EventItemSeconder', ''),
                    'roll_call_flag': item.get('EventItemRollCallFlag', 0),
                    'matter_id': item.get('EventItemMatterId'),
                    # Matter detail fields - populated in Phase 1.5
                    'matter_title': '',
                    'matter_type_name': '',
                    'matter_status_name': '',
                    'matter_intro_date': '',
                    'matter_passed_date': '',
                    'matter_enactment_date': '',
                    'matter_enactment_number': '',
                    'matter_requester': '',
                    'matter_body_name': '',
                    'attachment_links': '',
                    'attendance': meeting_attendance,
                    'agenda_link': self.meeting_links[event_id]['agenda_link'],
                    'minutes_link': self.meeting_links[event_id]['minutes_link'],
                    'video_link': self.meeting_links[event_id]['video_link'],
                    'Agenda_item_fulltext': '',  # Will be filled in Phase 2
                }
                all_items.append(item_data)

        # Third pass: fetch per-item votes for items with vote outcomes
        voted = [i for i in all_items if i['passed'] is not None]
        print(f"\nFetching per-item votes for {len(voted)} voted items...")
        found_votes = 0
        for idx, item in enumerate(voted, 1):
            if idx % 100 == 0:
                print(f"  Progress: {idx}/{len(voted)} items checked...")
            votes = self.fetch_item_votes(item['event_item_id'])
            item_votes = {}
            for v in votes:
                name = v.get('VotePersonName', '')
                value = v.get('VoteValueName', '')
                if name:
                    self.all_members.add(name)
                    item_votes[name] = value
            item['item_votes'] = item_votes
            if item_votes:
                found_votes += 1

        for item in all_items:
            if 'item_votes' not in item:
                item['item_votes'] = {}

        print(f"Per-item votes found for {found_votes}/{len(voted)} voted items")

        return all_items

    def enrich_matter_data(self, all_items: list):
        """Phase 1.5: Fetch Matter details + Attachments."""
        print("\n=== Phase 1.5: Fetching matter details and attachments ===")
        unique_matter_ids = set()
        for item in all_items:
            mid = item.get('matter_id')
            if mid:
                unique_matter_ids.add(mid)
        print(f"Unique matters to fetch: {len(unique_matter_ids)}")

        for i, mid in enumerate(sorted(unique_matter_ids), 1):
            print(f"  [{i}/{len(unique_matter_ids)}] Fetching matter {mid}...")
            details = self.fetch_matter_details(mid)
            attachments = self.fetch_matter_attachments(mid)
            self.matter_cache[mid] = {
                'details': details,
                'attachments': attachments,
            }

        # Populate matter fields on each item
        for item in all_items:
            mid = item.get('matter_id')
            if mid and mid in self.matter_cache:
                details = self.matter_cache[mid].get('details')
                if details:
                    item['matter_title'] = details.get('MatterTitle', '') or ''
                    item['matter_type_name'] = details.get('MatterTypeName', '') or ''
                    item['matter_status_name'] = details.get('MatterStatusName', '') or ''
                    intro = details.get('MatterIntroDate', '') or ''
                    item['matter_intro_date'] = intro[:10] if intro else ''
                    passed_d = details.get('MatterPassedDate', '') or ''
                    item['matter_passed_date'] = passed_d[:10] if passed_d else ''
                    enact_d = details.get('MatterEnactmentDate', '') or ''
                    item['matter_enactment_date'] = enact_d[:10] if enact_d else ''
                    item['matter_enactment_number'] = details.get('MatterEnactmentNumber', '') or ''
                    item['matter_requester'] = details.get('MatterRequester', '') or ''
                    item['matter_body_name'] = details.get('MatterBodyName', '') or ''

                attachments = self.matter_cache[mid].get('attachments', [])
                if attachments:
                    links = [a.get('MatterAttachmentHyperlink', '') for a in attachments if a.get('MatterAttachmentHyperlink')]
                    item['attachment_links'] = '|'.join(links)

        print(f"Matter details populated for {sum(1 for i in all_items if i.get('matter_title'))} items")

    def scrape_legislation_urls(self, page, meeting_insite_url: str) -> dict:
        """
        Scrape the meeting detail web page to build a mapping of
        matter file numbers to their LegislationDetail web URLs.
        """
        file_to_url = {}
        try:
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

            print(f"  Scraped {len(file_to_url)} legislation URLs from meeting page")
        except Exception as e:
            print(f"  Error scraping meeting page: {e}")

        return file_to_url

    def extract_full_text(self, page, legislation_url: str) -> str:
        """
        Navigate to a LegislationDetail page with FullText=1 and extract
        the full legislative text from the Text tab.
        """
        # Append FullText=1 to get expanded text directly
        if "FullText=1" not in legislation_url:
            separator = "&" if "?" in legislation_url else "?"
            if "Options=" in legislation_url:
                legislation_url = legislation_url.replace("Options=", "Options=ID|Text|")
            else:
                legislation_url += f"{separator}Options=ID|Text|"
            legislation_url += "&FullText=1"

        try:
            page.goto(legislation_url, wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle")
            time.sleep(0.5)

            text_div = page.query_selector('#ctl00_ContentPlaceHolder1_divText')
            if text_div:
                text = text_div.inner_text().strip()
                return text if text else None

            return None
        except Exception as e:
            print(f"    Error extracting text: {e}")
            return None

    def scrape_full_text(self, all_items: list):
        """Phase 2: Scrape full text using Playwright."""
        print("\n=== Phase 2: Scraping full legislative text via Playwright ===")
        items_with_matter = [i for i in all_items if i['matter_file']]
        print(f"Items with matter files to scrape: {len(items_with_matter)}")

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            # For each meeting, scrape the meeting page to get file-number-to-URL mapping
            file_to_url_all = {}
            processed_meetings = set()

            for item in items_with_matter:
                event_id = item['event_id']
                if event_id not in processed_meetings:
                    insite_url = self.meeting_links[event_id]['insite_url']
                    if insite_url:
                        print(f"\nScraping meeting page for EventId {event_id}...")
                        file_to_url = self.scrape_legislation_urls(page, insite_url)
                        file_to_url_all.update(file_to_url)
                    processed_meetings.add(event_id)

            # Now extract full text for each agenda item
            total = len(items_with_matter)
            extracted = 0
            skipped = 0
            for i, item in enumerate(items_with_matter, 1):
                matter_file = item['matter_file']
                legislation_url = file_to_url_all.get(matter_file)

                if not legislation_url:
                    skipped += 1
                    continue

                print(f"  [{i}/{total}] Extracting text for {matter_file}...", end=" ")
                full_text = self.extract_full_text(page, legislation_url)

                if full_text:
                    item['Agenda_item_fulltext'] = full_text
                    extracted += 1
                    print(f"OK ({len(full_text)} chars)")
                else:
                    print("No text found")

                time.sleep(0.5)

            browser.close()

        print(f"\nFull text extraction complete: {extracted} extracted, {skipped} skipped (no URL)")

    VOTE_MAP = {
        'Affirmative': 'Yes',
        'Negative': 'No',
        'Abstained': 'Abstain',
        'Absent@vote': 'Absent',
        'Absent': 'Absent',
        'Present': 'Present',
    }

    def _assign_votes(self, item, members_list):
        """Assign vote values based on per-item votes or attendance fallback."""
        votes = {}
        item_votes = item.get('item_votes', {})
        if item_votes:
            # Use actual per-item roll call votes
            for member in members_list:
                if member in item_votes:
                    votes[member] = self.VOTE_MAP.get(item_votes[member], item_votes[member])
                else:
                    att = item['attendance'].get(member, '')
                    if att in ('Absent', 'Absent@vote'):
                        votes[member] = 'Absent'
                    else:
                        votes[member] = ''
        elif item.get('passed') == 1:
            # Consent/voice vote - infer from attendance
            for member in members_list:
                att = item['attendance'].get(member, '')
                if att in ('Absent', 'Absent@vote'):
                    votes[member] = 'Absent'
                else:
                    votes[member] = 'Yes'
        else:
            for member in members_list:
                votes[member] = ''
        return votes

    def load_existing_text(self) -> dict:
        """Load Agenda_item_fulltext from existing CSV for preservation."""
        text_map = {}
        csv_path = self.output_paths['votes']
        if csv_path.exists():
            try:
                with open(csv_path, 'r', encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        key = row.get('event_item_id', '')
                        text = row.get('Agenda_item_fulltext', '')
                        if key and text:
                            text_map[key] = text
                print(f"Loaded {len(text_map)} existing text entries for preservation")
            except Exception as e:
                print(f"Warning: could not load existing text: {e}")
        return text_map

    def write_output(self, all_items: list, persons_by_name: dict):
        """Write output CSV files."""
        members_list = sorted(list(self.all_members))
        print(f"\nFound {len(members_list)} council members: {members_list}")
        print(f"Total agenda items: {len(all_items)}")

        # Filter for votes-only mode
        if self.votes_only:
            all_items = [i for i in all_items if i['passed'] is not None]
            print(f"Filtered to {len(all_items)} voted items (--votes-only)")

        # Write CSV - all items
        output_file = self.output_paths['votes']
        fieldnames = [
            'event_id', 'event_date', 'event_time', 'event_location',
            'event_item_id', 'agenda_number', 'agenda_sequence',
            'matter_file', 'matter_name', 'matter_title', 'matter_type', 'matter_type_name',
            'matter_status', 'matter_status_name',
            'matter_intro_date', 'matter_passed_date', 'matter_enactment_date', 'matter_enactment_number',
            'matter_requester', 'matter_body_name',
            'title', 'action', 'action_text', 'passed', 'consent', 'tally', 'mover', 'seconder',
            'roll_call_flag', 'agenda_link', 'minutes_link', 'video_link', 'attachment_links',
            'Agenda_item_fulltext'
        ] + members_list

        with open(output_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()

            for item in all_items:
                row = {k: item.get(k, '') for k in fieldnames if k not in members_list}
                row.update(self._assign_votes(item, members_list))
                writer.writerow(row)

        print(f"\nCSV written to: {output_file}")

        # Also write a filtered version with only voted items (unless already in votes-only mode)
        if not self.votes_only:
            voted_items = [i for i in all_items if i['passed'] is not None]
            output_voted = self.output_paths['voted_items']

            with open(output_voted, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()

                for item in voted_items:
                    row = {k: item.get(k, '') for k in fieldnames if k not in members_list}
                    row.update(self._assign_votes(item, members_list))
                    writer.writerow(row)

            print(f"Voted items CSV: {output_voted}")
            print(f"Total voted items: {len(voted_items)}")

        # Write Persons CSV
        output_persons = self.output_paths['persons']
        with open(output_persons, 'w', newline='', encoding='utf-8') as f:
            person_fields = [
                'PersonId', 'PersonFullName', 'PersonFirstName', 'PersonLastName',
                'PersonEmail', 'PersonActiveFlag', 'PersonPhone', 'PersonWWW',
            ]
            writer = csv.DictWriter(f, fieldnames=person_fields)
            writer.writeheader()
            for name in sorted(persons_by_name.keys()):
                p = persons_by_name[name]
                writer.writerow({k: p.get(k, '') for k in person_fields})

        print(f"Persons CSV: {output_persons} ({len(persons_by_name)} persons)")

    def run(self):
        """Execute the complete extraction workflow."""
        print("=" * 70)
        print(f"Columbus City Council Data Extraction - {self.year} Q{self.quarter}")
        print(f"Date range: {self.start_date} to {self.end_date}")
        print("=" * 70)

        # Phase 1: Collect API data
        persons_by_name = self.fetch_persons()
        meetings = self.fetch_meetings()

        if not meetings:
            print(f"\nNo meetings found for {self.year} Q{self.quarter}")
            return

        all_items = self.collect_event_items(meetings)

        # Phase 1.5: Fetch matter details
        self.enrich_matter_data(all_items)

        # Phase 2: Web scraping (optional)
        if not self.skip_text:
            self.scrape_full_text(all_items)
        else:
            print("\n[Skipping Phase 2: Full text scraping (--skip-text)]")
            # Preserve existing text from previous extraction
            text_map = self.load_existing_text()
            if text_map:
                preserved = 0
                for item in all_items:
                    eid = str(item['event_item_id'])
                    if eid in text_map:
                        item['Agenda_item_fulltext'] = text_map[eid]
                        preserved += 1
                print(f"Preserved {preserved} text entries from existing CSV")

        # Phase 3: Write output files
        self.write_output(all_items, persons_by_name)

        print("\n" + "=" * 70)
        print("Extraction complete!")
        print("=" * 70)


def main():
    parser = argparse.ArgumentParser(
        description="Columbus City Council Data Extraction Workflow",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Extract Q2 2023 data
    python extract_columbus.py --year 2023 --quarter 2

    # Extract Q4 2024 without full text scraping (faster)
    python extract_columbus.py --year 2024 --quarter 4 --skip-text

    # Extract only voted items
    python extract_columbus.py --year 2023 --quarter 1 --votes-only
        """
    )
    parser.add_argument("--year", type=int, required=True,
                        help="Year to extract (e.g., 2023)")
    parser.add_argument("--quarter", type=int, required=True, choices=[1, 2, 3, 4],
                        help="Quarter to extract (1-4)")
    parser.add_argument("--skip-text", action="store_true",
                        help="Skip Playwright full text extraction (Phase 2)")
    parser.add_argument("--votes-only", action="store_true",
                        help="Only output items with votes")
    parser.add_argument("--output-dir", type=Path,
                        help="Override default output directory")

    args = parser.parse_args()

    workflow = ColumbusExtractionWorkflow(
        year=args.year,
        quarter=args.quarter,
        skip_text=args.skip_text,
        votes_only=args.votes_only,
        output_dir=args.output_dir
    )
    workflow.run()


if __name__ == "__main__":
    main()

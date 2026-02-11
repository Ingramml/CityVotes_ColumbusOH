#!/usr/bin/env python3
"""
Extract Columbus City Council voting data for Q1 2023.
Output: CSV with one row per agenda item, columns for each council member's vote.

NOTE: Columbus City Council passes most items by consent/voice vote.
Individual roll call votes are only recorded for attendance, not legislation.
This script captures:
- All agenda items with their outcomes (action, passed flag)
- Council member attendance for each meeting (from attendance roll call)
- Meeting-level links: agenda PDF, minutes PDF, video
- Full legislative text for each agenda item (via Playwright web scraping)
- EventItem fields: agenda_sequence, consent, mover, seconder, tally, action_text, matter_type, matter_status
- Event fields: event_location, event_time
- Matter details (via /matters/{id}): type_name, status_name, intro/passed/enactment dates, requester, body_name, title
- Attachment links (via /matters/{id}/attachments): pipe-delimited hyperlinks
- Persons CSV: contact data for all persons in the system

Requirements:
    pip install requests playwright
    playwright install chromium
"""

import requests
import csv
import time
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from playwright.sync_api import sync_playwright

BASE_URL = "https://webapi.legistar.com/v1/columbus"
LEGISTAR_WEB = "https://columbus.legistar.com"

# Create session with retry logic
session = requests.Session()
retry = Retry(total=5, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504])
adapter = HTTPAdapter(max_retries=retry)
session.mount('http://', adapter)
session.mount('https://', adapter)

def api_get(url, params=None):
    """Make API request with rate limiting"""
    time.sleep(0.25)
    try:
        response = session.get(url, params=params, timeout=30)
        if response.status_code == 200:
            return response.json()
        return None
    except Exception as e:
        print(f"  Error fetching {url}: {e}")
        time.sleep(2)
        return None

def get_q1_2023_meetings():
    """Get City Council meetings for Q1 2023"""
    url = f"{BASE_URL}/events"
    params = {
        "$filter": "EventBodyId eq 27 and EventDate ge datetime'2023-01-01' and EventDate lt datetime'2023-04-01'",
        "$orderby": "EventDate asc"
    }
    return api_get(url, params) or []

def get_event_items(event_id):
    """Get agenda items for a meeting"""
    url = f"{BASE_URL}/events/{event_id}/EventItems"
    return api_get(url) or []

def get_roll_calls(event_item_id):
    """Get individual votes for an agenda item"""
    url = f"{BASE_URL}/EventItems/{event_item_id}/RollCalls"
    return api_get(url) or []

def get_matter_details(matter_id):
    """Get full matter details (type, status, dates, enactment info)"""
    url = f"{BASE_URL}/matters/{matter_id}"
    return api_get(url)

def get_matter_attachments(matter_id):
    """Get attachments for a matter (PDFs, supporting docs)"""
    url = f"{BASE_URL}/matters/{matter_id}/attachments"
    return api_get(url) or []

def get_persons():
    """Get all persons (council members, staff) - one bulk call"""
    url = f"{BASE_URL}/persons"
    return api_get(url) or []

def scrape_legislation_urls(page, meeting_insite_url):
    """
    Scrape the meeting detail web page to build a mapping of
    matter file numbers to their LegislationDetail web URLs.

    The Legistar web UI uses different internal IDs than the API,
    so we must scrape the meeting page to get the correct URLs.
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

def extract_full_text(page, legislation_url):
    """
    Navigate to a LegislationDetail page with FullText=1 and extract
    the full legislative text from the Text tab.
    """
    # Append FullText=1 to get expanded text directly
    if "FullText=1" not in legislation_url:
        separator = "&" if "?" in legislation_url else "?"
        # Also set Options to show Text tab
        if "Options=" in legislation_url:
            legislation_url = legislation_url.replace("Options=", "Options=ID|Text|")
        else:
            legislation_url += f"{separator}Options=ID|Text|"
        legislation_url += "&FullText=1"

    try:
        page.goto(legislation_url, wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        time.sleep(0.5)

        # Extract text from the full text container div
        text_div = page.query_selector('#ctl00_ContentPlaceHolder1_divText')
        if text_div:
            text = text_div.inner_text().strip()
            return text if text else None

        return None
    except Exception as e:
        print(f"    Error extracting text: {e}")
        return None

def main():
    # Fetch persons (one bulk call for contact data)
    print("Fetching persons list...")
    persons_raw = get_persons()
    persons_by_name = {}
    for p in persons_raw:
        name = p.get('PersonFullName', '')
        if name:
            persons_by_name[name] = p
    print(f"Found {len(persons_by_name)} persons")

    print("\nFetching Q1 2023 meetings...")
    meetings = get_q1_2023_meetings()
    print(f"Found {len(meetings)} meetings")

    # Track attendance per meeting
    attendance_by_meeting = {}
    meeting_links = {}  # event_id -> {agenda_link, minutes_link, video_link, event_location, event_time}
    all_members = set()
    all_items = []

    # Phase 1: Collect all API data
    print("\n=== Phase 1: Collecting API data ===")
    for meeting in meetings:
        event_id = meeting['EventId']
        event_date = meeting['EventDate'][:10]
        print(f"\nProcessing meeting {event_date} (EventId: {event_id})...")

        # Store meeting-level links and event fields
        meeting_links[event_id] = {
            'agenda_link': meeting.get('EventAgendaFile') or '',
            'minutes_link': meeting.get('EventMinutesFile') or '',
            'video_link': meeting.get('EventVideoPath') or '',
            'insite_url': meeting.get('EventInSiteURL') or '',
            'event_location': meeting.get('EventLocation') or '',
            'event_time': meeting.get('EventTime') or '',
        }

        items = get_event_items(event_id)
        print(f"  Found {len(items)} agenda items")

        # First pass: find the attendance roll call
        for item in items:
            if 'ROLL CALL' in (item.get('EventItemTitle') or '').upper():
                roll_calls = get_roll_calls(item['EventItemId'])
                attendance = {}
                for rc in roll_calls:
                    member_name = rc['RollCallPersonName']
                    vote_value = rc['RollCallValueName']
                    all_members.add(member_name)
                    attendance[member_name] = vote_value
                attendance_by_meeting[event_id] = attendance
                print(f"  Found attendance roll call: {len(attendance)} members")
                break

        # Second pass: record all items with votes/actions
        for item in items:
            # Skip pure procedural headers
            title = item.get('EventItemTitle', '') or ''
            if title.startswith('REGULAR MEETING NO.') or not title.strip():
                continue

            # Get member attendance for this meeting
            meeting_attendance = attendance_by_meeting.get(event_id, {})

            item_data = {
                'event_id': event_id,
                'event_date': event_date,
                'event_time': meeting_links[event_id]['event_time'],
                'event_location': meeting_links[event_id]['event_location'],
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
                'agenda_link': meeting_links[event_id]['agenda_link'],
                'minutes_link': meeting_links[event_id]['minutes_link'],
                'video_link': meeting_links[event_id]['video_link'],
                'Agenda_item_fulltext': '',  # Will be filled in Phase 2
            }
            all_items.append(item_data)

    # Phase 1.5: Fetch Matter details + Attachments
    print("\n=== Phase 1.5: Fetching matter details and attachments ===")
    unique_matter_ids = set()
    for item in all_items:
        mid = item.get('matter_id')
        if mid:
            unique_matter_ids.add(mid)
    print(f"Unique matters to fetch: {len(unique_matter_ids)}")

    matter_cache = {}  # matter_id -> {details, attachments}
    for i, mid in enumerate(sorted(unique_matter_ids), 1):
        print(f"  [{i}/{len(unique_matter_ids)}] Fetching matter {mid}...")
        details = get_matter_details(mid)
        attachments = get_matter_attachments(mid)
        matter_cache[mid] = {
            'details': details,
            'attachments': attachments,
        }

    # Populate matter fields on each item
    for item in all_items:
        mid = item.get('matter_id')
        if mid and mid in matter_cache:
            details = matter_cache[mid].get('details')
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

            attachments = matter_cache[mid].get('attachments', [])
            if attachments:
                links = [a.get('MatterAttachmentHyperlink', '') for a in attachments if a.get('MatterAttachmentHyperlink')]
                item['attachment_links'] = '|'.join(links)

    print(f"Matter details populated for {sum(1 for i in all_items if i.get('matter_title'))} items")

    # Phase 2: Scrape full text using Playwright
    print("\n=== Phase 2: Scraping full legislative text via Playwright ===")
    items_with_matter = [i for i in all_items if i['matter_file']]
    print(f"Items with matter files to scrape: {len(items_with_matter)}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # For each meeting, scrape the meeting page to get file-number-to-URL mapping
        file_to_url_all = {}  # Global mapping across all meetings
        processed_meetings = set()

        for item in items_with_matter:
            event_id = item['event_id']
            if event_id not in processed_meetings:
                insite_url = meeting_links[event_id]['insite_url']
                if insite_url:
                    print(f"\nScraping meeting page for EventId {event_id}...")
                    file_to_url = scrape_legislation_urls(page, insite_url)
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
            full_text = extract_full_text(page, legislation_url)

            if full_text:
                item['Agenda_item_fulltext'] = full_text
                extracted += 1
                print(f"OK ({len(full_text)} chars)")
            else:
                print("No text found")

            time.sleep(0.5)  # Rate limit between page loads

        browser.close()

    print(f"\nFull text extraction complete: {extracted} extracted, {skipped} skipped (no URL)")

    # Sort members for consistent column order
    members_list = sorted(list(all_members))
    print(f"\nFound {len(members_list)} council members: {members_list}")
    print(f"Total agenda items: {len(all_items)}")

    # Write CSV - all items
    output_file = '/Users/michaelingram/Documents/GitHub/CityVotes_Research/municipalities/Columbus-OH/Columbus-OH-Q1-2023-Votes.csv'

    with open(output_file, 'w', newline='', encoding='utf-8') as f:
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

        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for item in all_items:
            row = {k: item.get(k, '') for k in fieldnames if k not in members_list}

            # For items that passed, record as unanimous affirmative vote
            if item['passed'] == 1:
                for member in members_list:
                    attendance_status = item['attendance'].get(member, '')
                    if attendance_status == 'Present':
                        row[member] = 'Yes'
                    elif attendance_status in ['Absent', 'Absent@vote']:
                        row[member] = 'Absent'
                    else:
                        row[member] = 'Yes'  # Default to affirmative for unanimous
            elif item['passed'] == 0:
                # Item failed - rare, would need specific vote data
                for member in members_list:
                    row[member] = ''
            else:
                # No vote taken
                for member in members_list:
                    row[member] = ''

            writer.writerow(row)

    print(f"\nCSV written to: {output_file}")

    # Also write a filtered version with only voted items
    voted_items = [i for i in all_items if i['passed'] is not None]
    output_voted = '/Users/michaelingram/Documents/GitHub/CityVotes_Research/municipalities/Columbus-OH/Columbus-OH-Q1-2023-Voted-Items.csv'

    with open(output_voted, 'w', newline='', encoding='utf-8') as f:
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

        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for item in voted_items:
            row = {k: item.get(k, '') for k in fieldnames if k not in members_list}

            if item['passed'] == 1:
                for member in members_list:
                    attendance_status = item['attendance'].get(member, '')
                    if attendance_status == 'Present':
                        row[member] = 'Yes'
                    elif attendance_status in ['Absent', 'Absent@vote']:
                        row[member] = 'Absent'
                    else:
                        row[member] = 'Yes'  # Default to affirmative for unanimous
            else:
                for member in members_list:
                    row[member] = ''

            writer.writerow(row)

    print(f"Voted items CSV: {output_voted}")
    print(f"Total voted items: {len(voted_items)}")

    # Write Persons CSV
    output_persons = '/Users/michaelingram/Documents/GitHub/CityVotes_Research/municipalities/Columbus-OH/Columbus-OH-Q1-2023-Persons.csv'
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

if __name__ == "__main__":
    main()

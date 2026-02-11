#!/usr/bin/env node
/**
 * build-data.js — Columbus City Council Votes CSV-to-JSON Pipeline
 *
 * Reads Voted-Items CSV files from Columbus-OH/ and generates
 * all JSON data files needed by the Frontend/ website.
 *
 * Usage: node build-data.js
 *
 * Zero external dependencies — uses only Node.js built-ins.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'Columbus-OH');
const OUT_DIR = path.join(__dirname, 'Frontend', 'data');
const BASE_COL_COUNT = 34; // columns 0-33 are fixed base columns

// ============================================================
// CSV Parser (RFC 4180 compliant)
// ============================================================

function parseCSV(text) {
    const rows = [];
    let i = 0;
    const len = text.length;

    while (i < len) {
        const row = [];
        while (i < len) {
            if (text[i] === '"') {
                // Quoted field
                i++;
                let field = '';
                while (i < len) {
                    if (text[i] === '"') {
                        if (i + 1 < len && text[i + 1] === '"') {
                            field += '"';
                            i += 2;
                        } else {
                            i++;
                            break;
                        }
                    } else {
                        field += text[i];
                        i++;
                    }
                }
                row.push(field);
            } else {
                // Unquoted field
                let field = '';
                while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
                    field += text[i];
                    i++;
                }
                row.push(field);
            }
            if (i < len && text[i] === ',') {
                i++;
            } else {
                break;
            }
        }
        // Skip line ending
        if (i < len && text[i] === '\r') i++;
        if (i < len && text[i] === '\n') i++;
        if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
            rows.push(row);
        }
    }
    return rows;
}

function csvToObjects(text) {
    const rows = parseCSV(text);
    if (rows.length === 0) return { headers: [], data: [] };
    const headers = rows[0];
    const data = [];
    for (let r = 1; r < rows.length; r++) {
        const obj = {};
        for (let c = 0; c < headers.length; c++) {
            obj[headers[c]] = rows[r][c] !== undefined ? rows[r][c] : '';
        }
        data.push(obj);
    }
    return { headers, data };
}

// ============================================================
// File Discovery
// ============================================================

function discoverCSVFiles() {
    const files = fs.readdirSync(DATA_DIR)
        .filter(f => f.includes('Voted-Items.csv'))
        .sort();

    return files.map(f => {
        let year, quarter;
        const stdMatch = f.match(/Columbus-OH-(\d{4})-Q(\d)/);
        const legacyMatch = f.match(/Columbus-OH-Q(\d)-(\d{4})/);
        if (stdMatch) {
            year = parseInt(stdMatch[1]);
            quarter = parseInt(stdMatch[2]);
        } else if (legacyMatch) {
            quarter = parseInt(legacyMatch[1]);
            year = parseInt(legacyMatch[2]);
        }
        return { path: path.join(DATA_DIR, f), filename: f, year, quarter };
    });
}

function discoverVotesCSVFiles() {
    const files = fs.readdirSync(DATA_DIR)
        .filter(f => f.endsWith('-Votes.csv') && !f.includes('Voted-Items'))
        .sort();

    return files.map(f => {
        let year, quarter;
        const stdMatch = f.match(/Columbus-OH-(\d{4})-Q(\d)/);
        const legacyMatch = f.match(/Columbus-OH-Q(\d)-(\d{4})/);
        if (stdMatch) {
            year = parseInt(stdMatch[1]);
            quarter = parseInt(stdMatch[2]);
        } else if (legacyMatch) {
            quarter = parseInt(legacyMatch[1]);
            year = parseInt(legacyMatch[2]);
        }
        return { path: path.join(DATA_DIR, f), filename: f, year, quarter };
    });
}

// ============================================================
// Vote Value Mapping
// ============================================================

function mapVoteValue(csvValue) {
    const v = (csvValue || '').trim();
    if (v === 'Yes') return 'AYE';
    if (v === 'No') return 'NAY';
    if (v === 'Absent') return 'ABSENT';
    if (v === 'Abstain') return 'ABSTAIN';
    if (v === 'Recuse' || v === 'Recused' || v === 'Recusal') return 'RECUSAL';
    return null;
}

// ============================================================
// Outcome Determination
// ============================================================

function determineOutcome(row) {
    const passed = (row.passed || '').trim();
    if (passed === '1') return 'PASS';
    if (passed === '0') return 'FAIL';
    return 'PASS';
}

// ============================================================
// Section Classification
// ============================================================

function determineSection(row) {
    if ((row.consent || '').trim() === '1') return 'CONSENT';
    const title = (row.title || '').toUpperCase();
    if (title.includes('PUBLIC HEARING') || title.includes('ZONING')) return 'PUBLIC_HEARING';
    return 'GENERAL';
}

// ============================================================
// Non-Voted Item Classification
// ============================================================

function classifyNonVotedItem(row) {
    const title = (row.title || '').trim();
    const titleUpper = title.toUpperCase();
    const action = (row.action || '').trim();
    const matterFile = (row.matter_file || '').trim();

    // HIGH importance: substantive legislative items
    if (action === 'Read for the First Time') return { category: 'first_reading', importance: 'high', display_type: 'legislation' };
    if (action === 'Read and Filed') return { category: 'read_and_filed', importance: 'high', display_type: 'communication' };
    if (action === 'Adopted' || action === 'Approved') return { category: 'adopted_no_vote', importance: 'high', display_type: 'legislation' };
    if (action === 'Waive the 2nd Reading' || action === 'Amended as submitted to the Clerk') return { category: 'legislative_action', importance: 'high', display_type: 'legislation' };
    if (matterFile && !action) return { category: 'matter_no_action', importance: 'high', display_type: 'legislation' };

    // NOISE: exclude entirely
    if (titleUpper.includes('ROLL CALL') || (row.roll_call_flag || '').trim() === '1') return { category: 'roll_call', importance: 'noise', display_type: 'procedural' };
    if (titleUpper.includes('ADJOURNMENT') || titleUpper.includes('ADJOURNED')) return { category: 'adjournment', importance: 'noise', display_type: 'procedural' };
    if (/^RECESS/i.test(title) || /^RECONVENE/i.test(title)) return { category: 'recess', importance: 'noise', display_type: 'procedural' };
    if (titleUpper.startsWith('THE NEXT REGULAR')) return { category: 'announcement', importance: 'noise', display_type: 'procedural' };
    if (titleUpper.includes('FROM THE FLOOR')) return { category: 'from_the_floor', importance: 'noise', display_type: 'procedural' };
    if (titleUpper.includes('EXECUTIVE SESSION')) return { category: 'executive_session', importance: 'noise', display_type: 'procedural' };
    if (titleUpper.includes('REMOVED FROM THE CONSENT')) return { category: 'consent_removal', importance: 'noise', display_type: 'procedural' };
    if (titleUpper.includes('READING AND DISPOSAL')) return { category: 'journal', importance: 'noise', display_type: 'procedural' };

    // MEDIUM importance: structural headers
    if (titleUpper.includes('CONSENT ACTIONS') || titleUpper.includes('CONSENT AGENDA')) return { category: 'consent_header', importance: 'medium', display_type: 'section_header' };
    if (titleUpper === 'RESOLUTIONS OF EXPRESSION' || titleUpper === 'RESOLUTIONS OF EXPRESSION:') return { category: 'resolutions_header', importance: 'medium', display_type: 'section_header' };
    if (titleUpper === 'APPOINTMENTS' || titleUpper === 'APPOINTMENTS:') return { category: 'appointments_header', importance: 'medium', display_type: 'section_header' };
    if (titleUpper.includes('EMERGENCY') && (titleUpper.includes('POSTPONED') || titleUpper.includes('2ND READING') || titleUpper.includes('30-DAY'))) return { category: 'emergency_section', importance: 'medium', display_type: 'section_header' };
    if (titleUpper === 'VARIANCES' || titleUpper === 'VARIANCES:') return { category: 'variances_header', importance: 'medium', display_type: 'section_header' };
    if (titleUpper.includes('PUBLIC HEARING') && !matterFile) return { category: 'public_hearing_header', importance: 'medium', display_type: 'section_header' };
    if (titleUpper.includes('ZONING') && !matterFile) return { category: 'zoning_header', importance: 'medium', display_type: 'section_header' };
    if (titleUpper.includes('FIRST READING OF 30-DAY')) return { category: 'first_reading_header', importance: 'medium', display_type: 'section_header' };
    // Committee headers: "FINANCE: BANKSTON, CHR. ..."
    if (titleUpper.includes('CHR.')) return { category: 'committee_header', importance: 'medium', display_type: 'section_header' };

    // LOW importance: procedural
    if (titleUpper.includes('ADDITIONS OR CORRECTIONS')) return { category: 'corrections', importance: 'low', display_type: 'procedural' };
    if (titleUpper.includes('COMMUNICATIONS') && titleUpper.includes('CLERK')) return { category: 'clerk_communications', importance: 'low', display_type: 'procedural' };

    // Default: medium
    return { category: 'other', importance: 'medium', display_type: 'procedural' };
}

// ============================================================
// Topic Classification
// ============================================================

const TOPIC_KEYWORDS = {
    'Appointments': ['appoint', 'nomination', 'designat', 'commission member'],
    'Budget & Finance': ['budget', 'appropriat', 'revenue', 'fiscal', 'auditor', 'tax', 'levy', 'fund', 'financial', 'expenditure', 'bond', 'debt', 'transfer funds'],
    'Community Services': ['library', 'social service', 'community center', 'nonprofit', 'non-profit', 'senior', 'youth program', 'human services'],
    'Contracts & Agreements': ['contract', 'agreement', 'vendor', 'procurement', 'bid', 'purchase order', 'professional services', 'service agreement', 'memorandum of understanding'],
    'Economic Development': ['economic development', 'incentive', 'tax abatement', 'enterprise zone', 'community reinvestment', 'tif', 'tax increment'],
    'Emergency Services': ['police', 'fire', 'ems', 'emergency', 'public safety', 'division of police', 'division of fire', '911', 'safety director'],
    'Grants': ['grant', 'cdbg', 'subrecipient'],
    'Health & Safety': ['health', 'code enforcement', 'regulation', 'sanitary', 'environmental', 'pollution'],
    'Housing': ['housing', 'affordable', 'tenant', 'residential', 'homeless', 'shelter', 'hud', 'rent'],
    'Infrastructure': ['infrastructure', 'water', 'sewer', 'stormwater', 'utility', 'utilities', 'waterline'],
    'Ordinances & Resolutions': ['ceremonial resolution', 'honoring', 'declaring', 'recogni', 'celebrating', 'proclamation'],
    'Parks & Recreation': ['park', 'recreation', 'trail', 'greenway', 'playground', 'pool'],
    'Planning & Development': ['zoning', 'land use', 'planning', 'variance', 'permit', 'development plan', 'subdivision', 'plat', 'rezoning'],
    'Property & Real Estate': ['property', 'real estate', 'easement', 'lease', 'acquisition', 'right-of-way', 'deed', 'parcel', 'convey'],
    'Public Works': ['public service', 'street maintenance', 'waste', 'refuse', 'recycling', 'facilities', 'fleet', 'public works'],
    'Transportation': ['transportation', 'transit', 'bike', 'traffic', 'parking', 'sidewalk', 'road', 'highway', 'paving']
};

function assignTopics(row) {
    const searchText = [
        row.title || '',
        row.matter_title || '',
        row.matter_type_name || '',
        (row.Agenda_item_fulltext || '').substring(0, 500)
    ].join(' ').toLowerCase();

    const matched = [];
    for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
        for (const kw of keywords) {
            if (searchText.includes(kw)) {
                matched.push(topic);
                break;
            }
        }
    }

    if (matched.length > 3) matched.length = 3;
    if (matched.length === 0) matched.push('General');
    return matched;
}

// ============================================================
// Helpers
// ============================================================

function round2(n) {
    return Math.round(n * 100) / 100;
}

function getShortName(fullName) {
    // Handle special suffixes like "III", "Jr.", "Sr."
    const suffixes = ['III', 'II', 'IV', 'Jr.', 'Jr', 'Sr.', 'Sr'];
    const parts = fullName.split(' ');
    let lastName = parts[parts.length - 1];
    if (suffixes.includes(lastName) && parts.length > 2) {
        lastName = parts[parts.length - 2] + ' ' + lastName;
    }
    return lastName;
}

// Build short name map to disambiguate duplicates (e.g. two Browns)
function buildShortNameMap(memberNames) {
    const map = new Map();
    const shortCounts = {};

    // First pass: count short name collisions
    for (const name of memberNames) {
        const short = getShortName(name);
        shortCounts[short] = (shortCounts[short] || 0) + 1;
    }

    // Second pass: disambiguate
    for (const name of memberNames) {
        const short = getShortName(name);
        if (shortCounts[short] > 1) {
            // Use first name initial + last name
            const firstName = name.split(' ')[0];
            map.set(name, firstName[0] + '. ' + short);
        } else {
            map.set(name, short);
        }
    }
    return map;
}

function formatDate(dateStr) {
    // Input: "2025-10-06" or "10/6/2025" — normalize to YYYY-MM-DD
    if (!dateStr) return null;
    const str = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
        return `${slashMatch[3]}-${slashMatch[1].padStart(2, '0')}-${slashMatch[2].padStart(2, '0')}`;
    }
    return str;
}

function truncate(str, maxLen) {
    if (!str || str.length <= maxLen) return str || '';
    return str.substring(0, maxLen - 3) + '...';
}

function writeJSON(filePath, data) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ============================================================
// Main Pipeline
// ============================================================

function main() {
    console.log('=== Columbus City Votes — Data Build ===\n');

    // ---- Step 1: Discover CSV files ----
    const csvFiles = discoverCSVFiles();
    console.log(`Found ${csvFiles.length} Voted-Items CSV files`);

    // ---- Step 2: Read and parse all CSVs ----
    const allMembers = new Map();     // memberName -> { dates: Set, votes: [] }
    const allMeetings = new Map();    // event_id -> meeting object
    const allVoteRows = [];           // raw vote data with member votes
    const seenEventItemIds = new Set();

    for (const csvFile of csvFiles) {
        console.log(`  Reading ${csvFile.filename}...`);
        const text = fs.readFileSync(csvFile.path, 'utf-8');
        const { headers, data } = csvToObjects(text);

        // Discover member columns
        const memberColumns = headers.slice(BASE_COL_COUNT);

        // Register members
        for (const name of memberColumns) {
            if (!allMembers.has(name)) {
                allMembers.set(name, { dates: new Set() });
            }
        }

        for (const row of data) {
            const eventItemId = (row.event_item_id || '').trim();

            // Deduplicate across files
            if (seenEventItemIds.has(eventItemId)) continue;
            if (eventItemId) seenEventItemIds.add(eventItemId);

            const eventId = (row.event_id || '').trim();
            const eventDate = formatDate(row.event_date);

            // Build meeting entry
            if (eventId && !allMeetings.has(eventId)) {
                allMeetings.set(eventId, {
                    event_id: eventId,
                    meeting_date: eventDate,
                    event_time: (row.event_time || '').trim(),
                    event_location: (row.event_location || '').trim(),
                    agenda_url: (row.agenda_link || '').trim() || null,
                    minutes_url: (row.minutes_link || '').trim() || null,
                    video_url: (row.video_link || '').trim() || null,
                    vote_count: 0,
                    agenda_item_count: 0
                });
            }
            if (eventId && allMeetings.has(eventId)) {
                allMeetings.get(eventId).vote_count++;
                allMeetings.get(eventId).agenda_item_count++;
            }

            // Build member votes for this item
            const memberVotes = {};
            for (const memberName of memberColumns) {
                const mapped = mapVoteValue(row[memberName]);
                if (mapped) {
                    memberVotes[memberName] = mapped;
                    if (eventDate) {
                        allMembers.get(memberName).dates.add(eventDate);
                    }
                }
            }

            allVoteRows.push({
                event_item_id: eventItemId,
                event_id: eventId,
                event_date: eventDate,
                agenda_number: (row.agenda_number || '').trim(),
                agenda_sequence: parseInt(row.agenda_sequence) || 0,
                matter_file: (row.matter_file || '').trim(),
                matter_name: (row.matter_name || '').trim(),
                matter_title: (row.matter_title || '').trim(),
                matter_type_name: (row.matter_type_name || '').trim(),
                matter_status_name: (row.matter_status_name || '').trim(),
                title: (row.title || '').trim(),
                action: (row.action || '').trim(),
                action_text: (row.action_text || '').trim(),
                passed: (row.passed || '').trim(),
                consent: (row.consent || '').trim(),
                mover: (row.mover || '').trim(),
                seconder: (row.seconder || '').trim(),
                fulltext: (row.Agenda_item_fulltext || '').trim(),
                memberVotes
            });
        }
    }

    console.log(`\nTotal raw vote rows: ${allVoteRows.length}`);
    console.log(`Total unique meetings: ${allMeetings.size}`);
    console.log(`Total unique members: ${allMembers.size}`);

    // ---- Step 2b: Read Votes CSVs for non-voted items ----
    const votesCSVFiles = discoverVotesCSVFiles();
    console.log(`\nFound ${votesCSVFiles.length} Votes CSV files`);

    const allNonVotedItems = [];
    let noiseSkipped = 0;
    let totalVotesRows = 0;

    for (const csvFile of votesCSVFiles) {
        console.log(`  Reading ${csvFile.filename} for non-voted items...`);
        const text = fs.readFileSync(csvFile.path, 'utf-8');
        const { headers, data } = csvToObjects(text);
        totalVotesRows += data.length;

        for (const row of data) {
            const eventItemId = (row.event_item_id || '').trim();

            // Skip items already seen (voted items or duplicates)
            if (seenEventItemIds.has(eventItemId)) continue;
            if (eventItemId) seenEventItemIds.add(eventItemId);

            const classification = classifyNonVotedItem(row);

            // Skip noise items
            if (classification.importance === 'noise') {
                noiseSkipped++;
                continue;
            }

            const eventId = (row.event_id || '').trim();
            const eventDate = formatDate(row.event_date);

            allNonVotedItems.push({
                event_item_id: eventItemId,
                event_id: eventId,
                event_date: eventDate,
                agenda_sequence: parseInt(row.agenda_sequence) || 0,
                title: (row.title || '').trim(),
                matter_file: (row.matter_file || '').trim(),
                matter_type_name: (row.matter_type_name || '').trim(),
                matter_title: (row.matter_title || '').trim(),
                action: (row.action || '').trim(),
                action_text: (row.action_text || '').trim(),
                fulltext: (row.Agenda_item_fulltext || '').trim(),
                category: classification.category,
                importance: classification.importance,
                display_type: classification.display_type
            });

            // Update meeting agenda_item_count
            if (eventId && allMeetings.has(eventId)) {
                allMeetings.get(eventId).agenda_item_count++;
                if (!allMeetings.get(eventId).non_voted_count) allMeetings.get(eventId).non_voted_count = 0;
                allMeetings.get(eventId).non_voted_count++;
                if (classification.category === 'first_reading') {
                    if (!allMeetings.get(eventId).first_reading_count) allMeetings.get(eventId).first_reading_count = 0;
                    allMeetings.get(eventId).first_reading_count++;
                }
            }
        }
    }

    console.log(`Total rows in Votes CSVs: ${totalVotesRows}`);
    console.log(`Non-voted items (after filtering noise): ${allNonVotedItems.length}`);
    console.log(`Noise items skipped: ${noiseSkipped}`);
    console.log(`Total agenda items (voted + non-voted): ${allVoteRows.length + allNonVotedItems.length}`);

    // ---- Step 3: Assign sequential IDs ----

    // Members: alphabetical
    const memberNames = Array.from(allMembers.keys()).sort();
    const memberIdMap = new Map();
    memberNames.forEach((name, i) => memberIdMap.set(name, i + 1));

    // Meetings: chronological
    const meetingsList = Array.from(allMeetings.values())
        .sort((a, b) => a.meeting_date.localeCompare(b.meeting_date));
    const meetingIdMap = new Map();
    meetingsList.forEach((m, i) => {
        m.id = i + 1;
        meetingIdMap.set(m.event_id, i + 1);
    });

    // Votes: chronological then by agenda sequence
    allVoteRows.sort((a, b) => {
        const dc = a.event_date.localeCompare(b.event_date);
        if (dc !== 0) return dc;
        return a.agenda_sequence - b.agenda_sequence;
    });
    allVoteRows.forEach((v, i) => { v.id = i + 1; });

    // Determine member start/end dates and is_current
    const latestDateOverall = meetingsList[meetingsList.length - 1]?.meeting_date || '';
    const earliestDateOverall = meetingsList[0]?.meeting_date || '';

    const shortNameMap = buildShortNameMap(memberNames);

    const membersData = memberNames.map(name => {
        const info = allMembers.get(name);
        const dates = Array.from(info.dates).sort();
        const startDate = dates[0] || null;
        const endDate = dates[dates.length - 1] || null;
        const isCurrent = endDate === latestDateOverall;
        return {
            id: memberIdMap.get(name),
            full_name: name,
            short_name: shortNameMap.get(name),
            position: 'Council Member',
            start_date: startDate,
            end_date: isCurrent ? null : endDate,
            is_current: isCurrent
        };
    });

    // ---- Step 4: Compute vote metadata ----
    const processedVotes = allVoteRows.map(row => {
        const outcome = determineOutcome(row);
        const section = determineSection(row);
        const topics = assignTopics(row);

        let ayes = 0, noes = 0, abstain = 0, absent = 0;
        for (const choice of Object.values(row.memberVotes)) {
            if (choice === 'AYE') ayes++;
            else if (choice === 'NAY') noes++;
            else if (choice === 'ABSTAIN') abstain++;
            else if (choice === 'ABSENT') absent++;
        }

        return {
            id: row.id,
            event_item_id: row.event_item_id,
            event_id: row.event_id,
            meeting_id: meetingIdMap.get(row.event_id) || null,
            meeting_date: row.event_date,
            meeting_type: 'regular',
            outcome,
            ayes,
            noes,
            abstain,
            absent,
            item_number: row.agenda_number || String(row.agenda_sequence),
            section,
            title: row.title || row.matter_title || row.matter_name || 'Untitled',
            description: row.fulltext || row.action_text || row.matter_title || '',
            matter_file: row.matter_file,
            matter_type_name: row.matter_type_name,
            action: row.action,
            mover: row.mover,
            seconder: row.seconder,
            topics,
            memberVotes: row.memberVotes
        };
    });

    // ---- Step 5: Compute member stats ----
    console.log('\nComputing member statistics...');
    for (const member of membersData) {
        let total_votes = 0, aye_count = 0, nay_count = 0, abstain_count = 0;
        let absent_count = 0, recusal_count = 0;
        let votes_on_losing_side = 0, votes_on_winning_side = 0;
        let valid_votes = 0, close_vote_dissents = 0;

        for (const vote of processedVotes) {
            const choice = vote.memberVotes[member.full_name];
            if (!choice) continue;
            total_votes++;

            if (choice === 'AYE') aye_count++;
            else if (choice === 'NAY') nay_count++;
            else if (choice === 'ABSTAIN') abstain_count++;
            else if (choice === 'ABSENT') absent_count++;
            else if (choice === 'RECUSAL') recusal_count++;

            if ((vote.outcome === 'PASS' || vote.outcome === 'FAIL') &&
                (choice === 'AYE' || choice === 'NAY')) {
                valid_votes++;
                const onLosingSide =
                    (vote.outcome === 'PASS' && choice === 'NAY') ||
                    (vote.outcome === 'FAIL' && choice === 'AYE');
                if (onLosingSide) {
                    votes_on_losing_side++;
                    if (Math.abs(vote.ayes - vote.noes) <= 2) close_vote_dissents++;
                } else {
                    votes_on_winning_side++;
                }
            }
        }

        member.stats = {
            total_votes,
            aye_count,
            nay_count,
            abstain_count,
            absent_count,
            recusal_count,
            aye_percentage: total_votes > 0 ? round2((aye_count / total_votes) * 100) : 0,
            participation_rate: total_votes > 0 ? round2(((total_votes - absent_count - abstain_count) / total_votes) * 100) : 0,
            dissent_rate: valid_votes > 0 ? round2((votes_on_losing_side / valid_votes) * 100) : 0,
            votes_on_losing_side,
            votes_on_winning_side,
            close_vote_dissents
        };
    }

    // ---- Step 6: Compute alignment ----
    console.log('Computing pairwise alignment...');
    const alignmentPairs = [];
    for (let i = 0; i < memberNames.length; i++) {
        for (let j = i + 1; j < memberNames.length; j++) {
            const m1 = memberNames[i];
            const m2 = memberNames[j];
            let shared = 0, agreements = 0;

            for (const vote of processedVotes) {
                const v1 = vote.memberVotes[m1];
                const v2 = vote.memberVotes[m2];
                if (v1 && v2 &&
                    v1 !== 'ABSENT' && v2 !== 'ABSENT' &&
                    v1 !== 'ABSTAIN' && v2 !== 'ABSTAIN' &&
                    v1 !== 'RECUSAL' && v2 !== 'RECUSAL') {
                    shared++;
                    if (v1 === v2) agreements++;
                }
            }

            if (shared > 0) {
                alignmentPairs.push({
                    member1: shortNameMap.get(m1),
                    member2: shortNameMap.get(m2),
                    member1_id: memberIdMap.get(m1),
                    member2_id: memberIdMap.get(m2),
                    shared_votes: shared,
                    agreements,
                    agreement_rate: round2((agreements / shared) * 100)
                });
            }
        }
    }
    alignmentPairs.sort((a, b) => b.agreement_rate - a.agreement_rate || b.shared_votes - a.shared_votes);

    // ---- Step 7: Write JSON files ----
    console.log('\nWriting JSON files...');

    // -- stats.json --
    const passCount = processedVotes.filter(v => v.outcome === 'PASS').length;
    const unanimousCount = processedVotes.filter(v => v.noes === 0 && v.abstain === 0).length;
    const firstReadingCount = allNonVotedItems.filter(i => i.category === 'first_reading').length;
    writeJSON(path.join(OUT_DIR, 'stats.json'), {
        success: true,
        stats: {
            total_meetings: meetingsList.length,
            total_votes: processedVotes.length,
            total_council_members: membersData.length,
            pass_rate: round2((passCount / processedVotes.length) * 100),
            unanimous_rate: round2((unanimousCount / processedVotes.length) * 100),
            total_agenda_items: processedVotes.length + allNonVotedItems.length + noiseSkipped,
            total_non_voted_items: allNonVotedItems.length + noiseSkipped,
            first_readings: firstReadingCount,
            date_range: {
                start: earliestDateOverall,
                end: latestDateOverall
            }
        }
    });
    console.log('  stats.json');

    // -- council.json --
    writeJSON(path.join(OUT_DIR, 'council.json'), {
        success: true,
        members: membersData.map(m => ({
            id: m.id,
            full_name: m.full_name,
            short_name: m.short_name,
            position: m.position,
            start_date: m.start_date,
            end_date: m.end_date,
            is_current: m.is_current,
            stats: m.stats
        }))
    });
    console.log('  council.json');

    // -- council/{id}.json --
    for (const member of membersData) {
        const memberVotesList = processedVotes
            .filter(v => v.memberVotes[member.full_name])
            .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date))
            .map(v => ({
                vote_id: v.id,
                meeting_date: v.meeting_date,
                item_number: v.item_number,
                title: v.title,
                vote_choice: v.memberVotes[member.full_name],
                outcome: v.outcome,
                topics: v.topics
            }));

        writeJSON(path.join(OUT_DIR, 'council', `${member.id}.json`), {
            success: true,
            member: {
                id: member.id,
                full_name: member.full_name,
                short_name: member.short_name,
                position: member.position,
                start_date: member.start_date,
                end_date: member.end_date,
                is_current: member.is_current,
                stats: member.stats,
                recent_votes: memberVotesList
            }
        });
    }
    console.log(`  council/{id}.json (${membersData.length} files)`);

    // -- meetings.json --
    const meetingsOutput = meetingsList
        .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date))
        .map(m => ({
            id: m.id,
            event_id: m.event_id,
            meeting_date: m.meeting_date,
            meeting_type: 'regular',
            legistar_url: `https://columbus.legistar.com/MeetingDetail.aspx?LEGID=${m.event_id}&GID=139&G=4F637594-17B0-4E92-8196-37F14328D337`,
            agenda_url: m.agenda_url,
            minutes_url: m.minutes_url,
            video_url: m.video_url,
            agenda_item_count: m.agenda_item_count,
            vote_count: m.vote_count,
            non_voted_count: m.non_voted_count || 0,
            first_reading_count: m.first_reading_count || 0
        }));

    writeJSON(path.join(OUT_DIR, 'meetings.json'), {
        success: true,
        meetings: meetingsOutput
    });
    console.log('  meetings.json');

    // -- votes.json (summary, truncated titles) --
    const voteSummary = (vote) => ({
        id: vote.id,
        outcome: vote.outcome,
        ayes: vote.ayes,
        noes: vote.noes,
        abstain: vote.abstain,
        absent: vote.absent,
        item_number: vote.item_number,
        section: vote.section,
        title: truncate(vote.title, 200),
        meeting_date: vote.meeting_date,
        meeting_type: vote.meeting_type,
        topics: vote.topics
    });

    const allVotesSorted = [...processedVotes].sort((a, b) =>
        b.meeting_date.localeCompare(a.meeting_date) || b.id - a.id
    );

    writeJSON(path.join(OUT_DIR, 'votes.json'), {
        success: true,
        votes: allVotesSorted.map(voteSummary)
    });
    console.log('  votes.json');

    // -- votes-index.json --
    const years = [...new Set(processedVotes.map(v => parseInt(v.meeting_date.substring(0, 4))))].sort((a, b) => b - a);
    writeJSON(path.join(OUT_DIR, 'votes-index.json'), {
        success: true,
        available_years: years
    });
    console.log('  votes-index.json');

    // -- votes-{year}.json --
    for (const year of years) {
        const yearVotes = allVotesSorted.filter(v => v.meeting_date.startsWith(String(year)));
        writeJSON(path.join(OUT_DIR, `votes-${year}.json`), {
            success: true,
            votes: yearVotes.map(voteSummary)
        });
    }
    console.log(`  votes-{year}.json (${years.length} files)`);

    // -- votes/{id}.json --
    let voteDetailCount = 0;
    for (const vote of processedVotes) {
        const memberVotesList = [];
        for (const [memberName, choice] of Object.entries(vote.memberVotes)) {
            memberVotesList.push({
                member_id: memberIdMap.get(memberName),
                full_name: memberName,
                vote_choice: choice
            });
        }
        memberVotesList.sort((a, b) => a.member_id - b.member_id);

        writeJSON(path.join(OUT_DIR, 'votes', `${vote.id}.json`), {
            success: true,
            vote: {
                id: vote.id,
                item_number: vote.item_number,
                title: vote.title,
                description: vote.description,
                outcome: vote.outcome,
                ayes: vote.ayes,
                noes: vote.noes,
                abstain: vote.abstain,
                absent: vote.absent,
                meeting_id: vote.meeting_id,
                meeting_date: vote.meeting_date,
                meeting_type: vote.meeting_type,
                member_votes: memberVotesList,
                topics: vote.topics
            }
        });
        voteDetailCount++;
    }
    console.log(`  votes/{id}.json (${voteDetailCount} files)`);

    // -- alignment.json --
    writeJSON(path.join(OUT_DIR, 'alignment.json'), {
        success: true,
        members: memberNames.map(n => shortNameMap.get(n)),
        alignment_pairs: alignmentPairs,
        most_aligned: alignmentPairs.slice(0, 3),
        least_aligned: alignmentPairs.slice(-3).reverse()
    });
    console.log('  alignment.json');

    // -- meetings/{id}.json (pre-built with full agenda) --
    // Build a lookup of non-voted items by event_id
    const nonVotedByMeeting = new Map();
    for (const item of allNonVotedItems) {
        if (!nonVotedByMeeting.has(item.event_id)) nonVotedByMeeting.set(item.event_id, []);
        nonVotedByMeeting.get(item.event_id).push(item);
    }

    // Build a lookup of voted items by event_id
    const votedByMeeting = new Map();
    for (const vote of processedVotes) {
        if (!votedByMeeting.has(vote.event_id)) votedByMeeting.set(vote.event_id, []);
        votedByMeeting.get(vote.event_id).push(vote);
    }

    let meetingDetailCount = 0;
    for (const meeting of meetingsList) {
        const votedItems = (votedByMeeting.get(meeting.event_id) || []).map(v => ({
            agenda_sequence: parseInt(v.item_number) || v.id,
            item_type: 'voted',
            item_number: v.item_number,
            title: v.title,
            section: v.section,
            matter_file: v.matter_file,
            matter_type: v.matter_type_name,
            topics: v.topics,
            vote: {
                id: v.id,
                outcome: v.outcome,
                ayes: v.ayes,
                noes: v.noes,
                abstain: v.abstain,
                absent: v.absent
            }
        }));

        const nonVotedItems = (nonVotedByMeeting.get(meeting.event_id) || []).map(item => ({
            agenda_sequence: item.agenda_sequence,
            item_type: 'non_voted',
            category: item.category,
            importance: item.importance,
            display_type: item.display_type,
            title: item.title,
            matter_file: item.matter_file || null,
            matter_type: item.matter_type_name || null,
            action: item.action || null,
            description: item.importance === 'high' ? truncate(item.fulltext || item.action_text || item.matter_title, 300) : null,
            topics: item.importance === 'high' ? assignTopics(item) : null,
            vote: null
        }));

        const allAgendaItems = [...votedItems, ...nonVotedItems]
            .sort((a, b) => a.agenda_sequence - b.agenda_sequence);

        writeJSON(path.join(OUT_DIR, 'meetings', `${meeting.id}.json`), {
            success: true,
            meeting: {
                id: meeting.id,
                event_id: meeting.event_id,
                meeting_date: meeting.meeting_date,
                meeting_type: 'regular',
                legistar_url: `https://columbus.legistar.com/MeetingDetail.aspx?LEGID=${meeting.event_id}&GID=139&G=4F637594-17B0-4E92-8196-37F14328D337`,
                agenda_url: meeting.agenda_url,
                minutes_url: meeting.minutes_url,
                video_url: meeting.video_url,
                vote_count: meeting.vote_count,
                non_voted_count: meeting.non_voted_count || 0,
                first_reading_count: meeting.first_reading_count || 0,
                agenda_item_count: meeting.agenda_item_count,
                agenda_items: allAgendaItems
            }
        });
        meetingDetailCount++;
    }
    console.log(`  meetings/{id}.json (${meetingDetailCount} files)`);

    // -- agenda-items.json (high-importance non-voted items for search) --
    const highImportanceItems = allNonVotedItems
        .filter(item => item.importance === 'high')
        .map(item => ({
            event_item_id: item.event_item_id,
            meeting_date: item.event_date,
            meeting_id: meetingIdMap.get(item.event_id) || null,
            agenda_sequence: item.agenda_sequence,
            title: item.title || item.matter_title || 'Untitled',
            matter_file: item.matter_file || null,
            matter_type: item.matter_type_name || null,
            action: item.action,
            category: item.category,
            topics: assignTopics(item),
            description_preview: truncate(item.fulltext || item.action_text || '', 200)
        }));

    writeJSON(path.join(OUT_DIR, 'agenda-items.json'), {
        success: true,
        agenda_items: highImportanceItems
    });
    console.log(`  agenda-items.json (${highImportanceItems.length} items)`);

    // ---- Summary ----
    const totalFiles = 1 + 1 + membersData.length + 1 + 1 + 1 + years.length + voteDetailCount + 1 + meetingDetailCount + 1;
    console.log(`\n=== Done! Generated ${totalFiles} JSON files in Frontend/data/ ===`);
}

main();

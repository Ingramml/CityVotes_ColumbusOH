# Council Member Changes Across Time Periods

## Problem

The current extraction script creates dynamic columns per council member found in that quarter's roll calls. If you extract Q1 2021 and Q1 2026, you get different column sets — members who left or joined won't align across CSVs.

## Recommended SQL Approach — Normalized Votes Table

Instead of member-name columns, create a separate `votes` table with one row per member per agenda item:

```
agenda_items table:  event_item_id, event_date, matter_file, ... (no member columns)
votes table:         event_item_id, person_name, person_id, vote_value
persons table:       person_id, full_name, first_name, last_name, email, active_flag, term_start, term_end
```

This handles any number of members across any time period. Queries like "how did member X vote in 2021-2026?" become simple JOINs.

## Implementation Plan

1. Add a `--normalized` flag to the extraction script
2. When set, output 3 CSVs:
   - `agenda-items.csv` — no member columns, all item/matter/event fields
   - `votes.csv` — one row per member per item (`event_item_id, person_name, person_id, vote_value`)
   - `persons.csv` — contact data (already implemented)
3. The current wide-format CSVs (member columns) remain as the default for quick spreadsheet viewing
4. Both formats draw from the same data — just different output shapes

## Benefits

- **Cross-period consistency**: Every CSV has the same columns regardless of who serves
- **SQL-ready**: Direct import into PostgreSQL/BigQuery with proper foreign keys
- **Scalable**: Works for any city, any time period, any number of members
- **Query-friendly**: Aggregations, filters, and joins are straightforward

## Example Query

```sql
-- How did Shannon Hardin vote on all items in Q1 2023?
SELECT ai.event_date, ai.matter_file, ai.title, v.vote_value
FROM agenda_items ai
JOIN votes v ON ai.event_item_id = v.event_item_id
WHERE v.person_name = 'Shannon G. Hardin'
ORDER BY ai.event_date;
```

# Columbus OH — Frontend Implementation Plan

## Context

~200MB of quarterly CSV data (2021-2025) from Columbus OH City Council in `Columbus-OH/`. A complete static HTML template in `template/` that reads JSON from `data/`. Goal: build a data pipeline converting CSVs to JSON, customize the template for Columbus, and deploy to Vercel.

## Conventions

- All website files live in `Frontend/` (copied from `template/`)
- All project plans go in `Documents/`
- Build script lives in project root

---

## Step 1: Set up `Frontend/` folder

- Copy all files from `template/` into `Frontend/` (HTML, css/, js/, data/, vercel.json)
- `Frontend/` becomes the Vercel deploy root

## Step 2: Create `build-data.js` in project root

Zero-dependency Node.js script. Reads 20 `Voted-Items.csv` files from `Columbus-OH/`, outputs JSON to `Frontend/data/`.

### Pipeline:
1. Discover CSV files (handle `2023-Q2` and legacy `Q1-2023` naming)
2. Parse CSVs (built-in RFC 4180 parser)
3. Discover member vote columns dynamically (after column 33)
4. Build registries: 13 members, ~164 meetings, ~14,000 votes
5. Assign sequential IDs
6. Map values: `"Yes"` → AYE, `"Absent"` → ABSENT, `passed=1` → PASS
7. Classify topics via keyword matching (16 categories)
8. Compute member stats and pairwise alignment
9. Write all JSON to `Frontend/data/`

### Output:
```
Frontend/data/
├── stats.json, council.json, meetings.json, votes.json
├── votes-index.json, votes-{year}.json (5 files)
├── council/{id}.json (13 files)
├── votes/{id}.json (~14,000 files)
└── alignment.json
```

## Step 3: Run `node build-data.js`

## Step 4: Customize for Columbus
- Replace `{CityName}` → `Columbus` in all HTML files in `Frontend/`
- Set Columbus brand colors in `Frontend/css/theme.css` (navy #0f2441, red #e31c23)

## Step 5: Test locally — `npx serve Frontend/`

## Step 6: Deploy — Git push to GitHub, deploy `Frontend/` to Vercel

---

## Data Notes

- **13 council members** across all quarters (7 in 2021-2023, 9 in 2024-2025, 12 unique + overlap)
- Columbus council votes unanimously on virtually everything (only AYE and ABSENT in data)
- Dissent rates will be 0%, alignment rates ~100% — this is accurate
- Q1-2023 files use legacy naming (`Columbus-OH-Q1-2023-*`) — build script handles both patterns

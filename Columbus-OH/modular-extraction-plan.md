# Columbus-OH Modular Extraction System Plan

## Overview

Refactor the Columbus extraction script to be parameterized (year/quarter CLI args) and create an agent configuration for parallel execution across multiple time periods.

---

## Deliverables

1. **`extract_columbus.py`** - New parameterized extraction script
2. **`columbus-extraction-agent.md`** - Agent definition for parallel runs

---

## Part 1: Parameterized Extraction Script

### File: `/municipalities/Columbus-OH/extract_columbus.py`

### CLI Interface

```bash
python extract_columbus.py --year 2023 --quarter 2
python extract_columbus.py --year 2023 --quarter 1 --skip-text
python extract_columbus.py --year 2024 --quarter 4 --votes-only
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--year` | Yes | Year to extract (e.g., 2023) |
| `--quarter` | Yes | Quarter 1-4 |
| `--skip-text` | No | Skip Playwright web scraping (faster) |
| `--votes-only` | No | Only output items with votes |
| `--output-dir` | No | Override default output directory |

### Key Changes from `extract_q1_2023.py`

1. **Add argparse** - Following Dallas pattern
2. **Add `get_quarter_dates(year, quarter)`** - Calculate date range dynamically
3. **Add `get_output_paths(output_dir, year, quarter)`** - Generate filenames
4. **Parameterize API filter** - Replace hardcoded `datetime'2023-01-01'` with variables
5. **Class-based structure** - `ColumbusExtractionWorkflow` class (optional but cleaner)

### Date Range Calculation

```python
def get_quarter_dates(year: int, quarter: int) -> tuple[str, str]:
    quarters = {
        1: ("01-01", "04-01"),
        2: ("04-01", "07-01"),
        3: ("07-01", "10-01"),
        4: ("10-01", "01-01"),  # end is next year
    }
    start = f"{year}-{quarters[quarter][0]}"
    end_year = year + 1 if quarter == 4 else year
    end = f"{end_year}-{quarters[quarter][1]}"
    return start, end
```

### Output Naming

```
Columbus-OH-{YEAR}-Q{QUARTER}-Votes.csv
Columbus-OH-{YEAR}-Q{QUARTER}-Voted-Items.csv
Columbus-OH-{YEAR}-Q{QUARTER}-Persons.csv
```

---

## Part 2: Agent Configuration

### File: `/shared/agents/columbus-extraction-agent.md`

### Agent Purpose

Specialized agent for extracting Columbus, OH City Council voting data. Designed for parallel execution - multiple instances can run simultaneously for different time periods.

### Agent Usage

```bash
# Single quarter
/use-agent columbus-extraction-agent --year 2023 --quarter 2

# Parallel (4 agents for full year)
/use-agent columbus-extraction-agent --year 2023 --quarter 1
/use-agent columbus-extraction-agent --year 2023 --quarter 2
/use-agent columbus-extraction-agent --year 2023 --quarter 3
/use-agent columbus-extraction-agent --year 2023 --quarter 4
```

### Agent Execution Steps

1. Validate arguments (year 2015-2026, quarter 1-4)
2. Run: `python extract_columbus.py --year {YEAR} --quarter {QUARTER}`
3. Verify output files created
4. Report extraction statistics

---

## Implementation Steps

### Step 1: Create `extract_columbus.py`

- Copy structure from `extract_q1_2023.py`
- Add argparse at top
- Add helper functions for dates and paths
- Parameterize the API filter in `get_meetings()` function
- Update output file paths to use year/quarter variables
- Add `--skip-text` conditional around Phase 2
- Add `--votes-only` filter for output

### Step 2: Create agent definition

- Create `/shared/agents/columbus-extraction-agent.md`
- Follow structure of existing `agenda-management-researcher.md`
- Document purpose, usage, execution steps, output files

### Step 3: Update extraction guide

- Add CLI usage section to `Columbus-OH-Extraction-Guide.md`
- Document parallel execution examples

---

## Critical Files

| File | Action |
|------|--------|
| `/municipalities/Columbus-OH/extract_q1_2023.py` | Source to refactor |
| `/municipalities/Columbus-OH/extract_columbus.py` | Create new |
| `/shared/agents/columbus-extraction-agent.md` | Create new |
| `/municipalities/Columbus-OH/Columbus-OH-Extraction-Guide.md` | Update |

---

## Verification

1. **Equivalence test**: Run new script for Q1 2023, compare output to existing Q1 2023 CSV
2. **New quarter test**: Run Q2 2023, verify files created with correct names
3. **Skip-text test**: Run with `--skip-text`, verify Phase 2 skipped
4. **Parallel test**: Run Q1 and Q2 simultaneously, verify no conflicts

```bash
# Test commands
python extract_columbus.py --year 2023 --quarter 1
diff Columbus-OH-2023-Q1-Votes.csv Columbus-OH-Q1-2023-Votes.csv

python extract_columbus.py --year 2023 --quarter 2
ls -la Columbus-OH-2023-Q2-*.csv
```

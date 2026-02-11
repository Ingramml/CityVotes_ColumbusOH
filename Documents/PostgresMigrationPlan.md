# Plan: Migrate to PostgreSQL Database Backend

## Overview

Replace the current static JSON file architecture with a PostgreSQL database that serves as the backend for the Columbus City Votes website. The frontend will query an API layer instead of fetching local JSON files.

---

## 1. Free Tier Provider Comparison

### Supabase Free

| Resource | Limit |
|---|---|
| Storage | 500 MB |
| Compute | Shared CPU, 0.5 GB RAM |
| Direct connections | 60 |
| Pooled connections | 200 |
| Egress | 5 GB database + 2 GB storage |
| Edge function invocations | 500,000/month |
| Auth MAU | 50,000 |

**Pros:**
- Full backend-as-a-service: built-in auth, file storage, edge functions, realtime subscriptions
- Auto-generated REST and GraphQL APIs from your schema (no API code needed)
- Row-level security for fine-grained access control
- Dashboard UI for data management
- Strong documentation and community

**Cons:**
- Projects auto-pause after 7 days of inactivity (requires a scheduled ping workaround)
- Limited to 2 projects on free tier
- No daily backups on free tier
- 1-day log retention
- First paid tier is $25/month (jump from free)

**First paid tier:** Pro — $25/month (8 GB storage, daily backups, no pausing)

---

### Neon Free

| Resource | Limit |
|---|---|
| Storage | 0.5 GB per project |
| Compute | 100 CU-hours/month |
| Pooled connections | 10,000 |
| Egress | 5 GB/month |
| Projects | 100 |
| Branches | 10 per project |

**Pros:**
- True serverless PostgreSQL — scale-to-zero saves compute hours when idle
- 10,000 pooled connections (far more than Supabase free)
- Database branching (create instant copies for testing/development)
- No project limit (100 projects vs Supabase's 2)
- Pay-as-you-go paid tier (no monthly minimum)
- Point-in-time recovery (6 hours on free)

**Cons:**
- Scale-to-zero is mandatory on free (5-minute idle timeout)
- Cold start latency of 500ms-2s when waking from zero
- If you exhaust 100 CU-hours, compute suspends until next month
- No built-in API layer — you need to build or host your own API
- 0.5 GB storage per project (same as Supabase but stricter with branching overhead)

**First paid tier:** Launch — pay-as-you-go ($0.106/CU-hour, $0.35/GB-month, no minimum)

---

### Vercel + Neon Free (Integrated)

| Resource | Limit |
|---|---|
| Storage | 512 MB |
| Compute | 190 hours/month |
| Pooled connections | 10,000 |
| Databases | 10 |

**Pros:**
- Unified billing through Vercel (no separate Neon account needed)
- 190 compute hours/month (90 more than standalone Neon)
- Tight integration with Vercel serverless functions for the API layer
- Same deployment platform already in use for the frontend

**Cons:**
- Same 5-minute scale-to-zero and cold start as standalone Neon
- Advanced Neon features (branching, read replicas) require a separate Neon paid plan
- Vercel Pro ($20/month) does NOT include more database resources — Neon upgrade is separate

**First paid tier:** Neon Launch (pay-as-you-go) + optionally Vercel Pro ($20/month)

---

### Railway Free

| Resource | Limit |
|---|---|
| Trial credits | $5 one-time (30 days) |
| Post-trial credits | $1/month (non-rollover) |
| Persistent storage | 0.5 GB |
| RAM | 1 GB |

**Pros:**
- One-click PostgreSQL deployment
- Simple developer experience
- Good for prototyping

**Cons:**
- Not truly free — $1/month after 30-day trial barely covers anything
- Persistent volumes (database data) deleted if credits expire
- Data loss risk makes it unsuitable for production
- No connection pooling built-in

**First paid tier:** Hobby — $5/month ($5 usage credit included)

**Verdict:** Not recommended for this project. Data deletion risk and minimal free tier make it unsuitable.

---

### Recommendation

| Criteria | Winner |
|---|---|
| Best overall for this project | **Vercel + Neon** (already on Vercel, 190 compute hrs, unified billing) |
| Best full-stack BaaS | **Supabase** (auto API, auth, realtime — but 7-day pause is a drawback) |
| Best pure database | **Neon standalone** (branching, pay-as-you-go scaling) |
| Avoid | **Railway** (not a free database provider) |

For Columbus City Votes specifically, **Vercel + Neon** is the strongest choice because the frontend is already deployed on Vercel, the API layer can be Vercel serverless functions, and the integrated free tier is the most generous (190 compute hours).

---

## 2. Storage Estimates & Scaling Thresholds

### Current Columbus Data Size

| Table | Rows | Estimated Size |
|---|---|---|
| members | 13 | < 1 KB |
| meetings | 164 | ~50 KB |
| votes | 14,034 | ~8 MB (titles avg 184 chars) |
| vote_descriptions | 14,034 | ~55 MB (fulltext avg 4,145 chars) |
| member_votes | 109,290 | ~5 MB |
| topics (junction) | ~42,000 | ~1 MB |
| alignment_pairs | 78 | < 10 KB |
| **Total data** | | **~70 MB** |
| **With indexes** | | **~100-120 MB** |

The current JSON output is 201 MB, but that includes massive redundancy (14,034 individual vote files each repeating meeting data). A normalized database is significantly smaller.

### Scaling: When You Hit Free Tier Limits

**500 MB storage limit (Supabase/Neon):**

| Scenario | Votes | Member Votes | Est. DB Size | Fits in Free? |
|---|---|---|---|---|
| Columbus today | 14,034 | 109,290 | ~100 MB | Yes |
| Columbus 10 years (projected) | ~35,000 | ~270,000 | ~250 MB | Yes |
| 5 cities combined | ~70,000 | ~550,000 | ~400 MB | Tight |
| 10 cities combined | ~140,000 | ~1,100,000 | ~500+ MB | **No — paid tier** |
| Full-text descriptions for 10 cities | ~140,000 | ~1,100,000 | ~700 MB | **No** |

**Key insight:** The `vote_descriptions` table (fulltext legislative text) is by far the largest table. Without it, you could fit 15-20 cities. With it, you'll exceed 500 MB around 5-7 cities.

**Strategies to stay on free tier longer:**
- Store full legislative text in a separate table and lazy-load it only on vote detail pages
- Compress or truncate descriptions beyond a threshold (e.g., 2,000 chars)
- Archive old years to cold storage and keep only recent data in Postgres

### Scaling: When You Need Paid Tier

| Threshold | Trigger |
|---|---|
| ~5-7 cities with full text | 500 MB storage limit |
| ~50,000 monthly page views | 5 GB egress limit (Neon) |
| High traffic spikes (viral post) | 100 CU-hours compute (Neon) or connection limits |
| Production SLA needed | Supabase 7-day pause / Neon cold starts unacceptable |

**First paid tier costs:**
- Neon Launch: likely $2-5/month for a single city (pay-as-you-go)
- Supabase Pro: $25/month flat (includes 8 GB storage)

### Scaling: When BigQuery Becomes Relevant

BigQuery makes sense when:

| Scenario | Data Volume | Why BigQuery |
|---|---|---|
| National civic data platform (all US cities) | 500+ cities, millions of votes | TB-scale analytical queries |
| Historical archive (decades of data) | 10M+ rows | Cheap columnar storage at $0.02/GB |
| Cross-city analytics dashboard | Aggregating patterns across many jurisdictions | Fast full-table scans |
| Public data API (many concurrent analytical queries) | High query volume on large data | Serverless, no connection management |

**BigQuery free tier:** 10 GB storage + 1 TB queries/month — enough for ~50 cities of historical data for free.

**For Columbus alone or even 5-10 cities, PostgreSQL is the right choice.** BigQuery becomes relevant at ~100+ cities or when building analytical dashboards across a national dataset.

---

## 3. Suggested Database Schema

```sql
-- ============================================================
-- CORE TABLES
-- ============================================================

CREATE TABLE members (
    id              SERIAL PRIMARY KEY,
    full_name       VARCHAR(100) NOT NULL UNIQUE,
    short_name      VARCHAR(50) NOT NULL,
    position        VARCHAR(100) DEFAULT 'Council Member',
    start_date      DATE,
    end_date        DATE,                          -- NULL = current member
    is_current      BOOLEAN GENERATED ALWAYS AS (end_date IS NULL) STORED
);

CREATE TABLE meetings (
    id              SERIAL PRIMARY KEY,
    event_id        VARCHAR(20),                   -- Legistar event ID
    meeting_date    DATE NOT NULL,
    meeting_type    VARCHAR(50) DEFAULT 'regular',
    legistar_url    TEXT,
    agenda_url      TEXT,
    minutes_url     TEXT,
    video_url       TEXT
);

CREATE TABLE votes (
    id              SERIAL PRIMARY KEY,
    meeting_id      INTEGER NOT NULL REFERENCES meetings(id),
    item_number     VARCHAR(50),
    title           TEXT NOT NULL,
    outcome         VARCHAR(20) NOT NULL,          -- PASS, FAIL, CONTINUED, TABLED, WITHDRAWN, REMOVED
    ayes            SMALLINT NOT NULL DEFAULT 0,
    noes            SMALLINT NOT NULL DEFAULT 0,
    abstain         SMALLINT NOT NULL DEFAULT 0,
    absent          SMALLINT NOT NULL DEFAULT 0,
    section         VARCHAR(100),                  -- e.g., "Consent Agenda", "Regular Agenda"
    matter_file     VARCHAR(50),                   -- e.g., "0096-2024"
    matter_type     VARCHAR(100)                   -- e.g., "Ordinance", "Resolution"
);

-- Full legislative text stored separately (largest table by far, ~55 MB)
-- Lazy-loaded only on vote detail pages to minimize egress
CREATE TABLE vote_descriptions (
    vote_id         INTEGER PRIMARY KEY REFERENCES votes(id),
    description     TEXT
);

CREATE TABLE member_votes (
    id              SERIAL PRIMARY KEY,
    vote_id         INTEGER NOT NULL REFERENCES votes(id),
    member_id       INTEGER NOT NULL REFERENCES members(id),
    vote_choice     VARCHAR(20) NOT NULL,          -- AYE, NAY, ABSTAIN, ABSENT, RECUSAL
    UNIQUE(vote_id, member_id)
);

-- ============================================================
-- TOPIC CLASSIFICATION
-- ============================================================

CREATE TABLE topics (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(50) NOT NULL UNIQUE,   -- e.g., "Public Safety", "Infrastructure"
    slug            VARCHAR(50) NOT NULL UNIQUE     -- e.g., "public-safety", "infrastructure"
);

CREATE TABLE vote_topics (
    vote_id         INTEGER NOT NULL REFERENCES votes(id),
    topic_id        INTEGER NOT NULL REFERENCES topics(id),
    PRIMARY KEY (vote_id, topic_id)
);

-- ============================================================
-- PRECOMPUTED / MATERIALIZED VIEWS
-- ============================================================

-- Member statistics (refresh after data import)
CREATE MATERIALIZED VIEW member_stats AS
SELECT
    m.id AS member_id,
    COUNT(mv.id) AS total_votes,
    COUNT(mv.id) FILTER (WHERE mv.vote_choice = 'AYE') AS aye_count,
    COUNT(mv.id) FILTER (WHERE mv.vote_choice = 'NAY') AS nay_count,
    COUNT(mv.id) FILTER (WHERE mv.vote_choice = 'ABSTAIN') AS abstain_count,
    COUNT(mv.id) FILTER (WHERE mv.vote_choice = 'ABSENT') AS absent_count,
    COUNT(mv.id) FILTER (WHERE mv.vote_choice = 'RECUSAL') AS recusal_count,
    ROUND(
        100.0 * COUNT(mv.id) FILTER (WHERE mv.vote_choice = 'AYE') /
        NULLIF(COUNT(mv.id), 0), 1
    ) AS aye_percentage,
    ROUND(
        100.0 * COUNT(mv.id) FILTER (WHERE mv.vote_choice NOT IN ('ABSENT', 'ABSTAIN')) /
        NULLIF(COUNT(mv.id), 0), 1
    ) AS participation_rate
FROM members m
JOIN member_votes mv ON mv.member_id = m.id
GROUP BY m.id;

-- Pairwise alignment (refresh after data import)
CREATE MATERIALIZED VIEW alignment_pairs AS
SELECT
    m1.id AS member1_id,
    m2.id AS member2_id,
    m1.short_name AS member1_name,
    m2.short_name AS member2_name,
    COUNT(*) AS shared_votes,
    COUNT(*) FILTER (WHERE mv1.vote_choice = mv2.vote_choice) AS agreements,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE mv1.vote_choice = mv2.vote_choice) /
        NULLIF(COUNT(*), 0), 1
    ) AS agreement_rate
FROM member_votes mv1
JOIN member_votes mv2 ON mv1.vote_id = mv2.vote_id AND mv1.member_id < mv2.member_id
JOIN members m1 ON m1.id = mv1.member_id
JOIN members m2 ON m2.id = mv2.member_id
WHERE mv1.vote_choice NOT IN ('ABSENT', 'ABSTAIN', 'RECUSAL')
  AND mv2.vote_choice NOT IN ('ABSENT', 'ABSTAIN', 'RECUSAL')
GROUP BY m1.id, m2.id, m1.short_name, m2.short_name;

-- Global stats (refresh after data import)
CREATE MATERIALIZED VIEW global_stats AS
SELECT
    (SELECT COUNT(*) FROM meetings) AS total_meetings,
    (SELECT COUNT(*) FROM votes) AS total_votes,
    (SELECT COUNT(*) FROM members) AS total_council_members,
    ROUND(100.0 * (SELECT COUNT(*) FROM votes WHERE outcome = 'PASS') /
        NULLIF((SELECT COUNT(*) FROM votes), 0), 1) AS pass_rate,
    ROUND(100.0 * (SELECT COUNT(*) FROM votes WHERE noes = 0 AND abstain = 0) /
        NULLIF((SELECT COUNT(*) FROM votes), 0), 1) AS unanimous_rate,
    (SELECT MIN(meeting_date) FROM meetings) AS date_start,
    (SELECT MAX(meeting_date) FROM meetings) AS date_end;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_votes_meeting_id ON votes(meeting_id);
CREATE INDEX idx_votes_outcome ON votes(outcome);
CREATE INDEX idx_votes_item_number ON votes(item_number);
CREATE INDEX idx_member_votes_vote_id ON member_votes(vote_id);
CREATE INDEX idx_member_votes_member_id ON member_votes(member_id);
CREATE INDEX idx_member_votes_choice ON member_votes(vote_choice);
CREATE INDEX idx_vote_topics_topic_id ON vote_topics(topic_id);
CREATE INDEX idx_meetings_date ON meetings(meeting_date DESC);

-- Full-text search index on vote titles
CREATE INDEX idx_votes_title_search ON votes USING GIN(to_tsvector('english', title));
```

### Schema Diagram

```
members ──────────< member_votes >────────── votes
  │                                            │
  │                                            ├──── vote_descriptions (1:1)
  │                                            │
  │                                            └───< vote_topics >──── topics
  │
  └── member_stats (materialized view)

meetings ────────< votes

alignment_pairs (materialized view, from member_votes self-join)
global_stats (materialized view, aggregate)
```

### Key Design Decisions

1. **vote_descriptions separated from votes**: The full legislative text (~4 KB avg) is the largest data by far. Keeping it in a separate table means list queries (votes page, meeting detail) don't load it, saving egress and improving performance.

2. **Materialized views for stats**: Member stats, alignment, and global stats are expensive to compute live. Refresh them after each data import (weekly or quarterly).

3. **Topics as a junction table**: A vote can have multiple topics. Normalized many-to-many avoids the JSON array approach and enables efficient topic-based filtering with indexes.

4. **is_current as a generated column**: Automatically derived from `end_date IS NULL` — no need to manually maintain.

5. **Full-text search index**: Enables fast keyword search on vote titles using PostgreSQL's built-in `to_tsvector` — replaces the current client-side search.

---

## 4. Migration Steps

### Phase 1: Database Setup
1. Create Neon database via Vercel integration
2. Run schema creation SQL
3. Insert seed data for topics table (16 categories)

### Phase 2: Data Import Script
1. Modify `build-data.js` to output SQL INSERT statements (or use a new `import-data.js`)
2. Import members, meetings, votes, member_votes, vote_topics, vote_descriptions
3. Refresh materialized views

### Phase 3: API Layer
1. Create Vercel serverless functions (API routes) in `Frontend/api/`:
   - `GET /api/stats` — returns global_stats materialized view
   - `GET /api/council` — returns members + member_stats
   - `GET /api/council/[id]` — returns member detail + recent votes
   - `GET /api/meetings` — returns meetings list (paginated)
   - `GET /api/meetings/[id]` — returns meeting + agenda items + votes
   - `GET /api/votes` — returns votes list (paginated, filterable)
   - `GET /api/votes/[id]` — returns vote detail + member_votes + description
   - `GET /api/alignment` — returns alignment_pairs materialized view
   - `GET /api/search?q=` — full-text search on vote titles
2. Each endpoint queries Postgres via `@neondatabase/serverless` driver
3. Add caching headers (e.g., `Cache-Control: s-maxage=3600`)

### Phase 4: Frontend Migration
1. Update `Frontend/js/api.js` to call `/api/*` endpoints instead of loading JSON files
2. Remove static `Frontend/data/` directory (14,058 JSON files)
3. Update `vercel.json` to include API function configuration

### Phase 5: Ongoing Data Updates
1. Create an update script that reads new CSV data and upserts into Postgres
2. Refresh materialized views after each import
3. Optionally set up a GitHub Action to automate quarterly imports

---

## 5. Cost Projections

| Scenario | Provider | Monthly Cost |
|---|---|---|
| Columbus only, low traffic (<10K views) | Vercel + Neon Free | **$0** |
| Columbus only, moderate traffic (50K views) | Vercel + Neon Free | **$0** (may approach egress limit) |
| Columbus only, high traffic (100K+ views) | Neon Launch + Vercel | **$3-8** |
| 5 cities, moderate traffic | Neon Launch | **$5-15** |
| 10+ cities, high traffic | Supabase Pro or Neon Scale | **$25-50** |
| 100+ cities, analytics dashboard | BigQuery + PostgreSQL | **$25-100** |

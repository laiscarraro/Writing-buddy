# Writing Buddy — Development Plan

## Project Overview

A local web editor for Obsidian markdown files with scene awareness, story card management, writing session analytics, and optional LLM-assisted writing tools. Runs a small local server, accessed via Chrome, with direct read/write access to the user's actual Obsidian vault.

## Goals

- **Direct vault access** — no import/export, read and write real `.md` files in place
- **Scene awareness** — split on `---` delimiter, per-scene word counts and story cards
- **Story card system** — structured metadata per file and per scene (ficha de história)
- **Writing analytics** — session tracking, word progress over time, charts
- **Fast, minimal** — no auth, no cloud — everything runs locally
- **Familiar UX** — Obsidian-matching dark theme, Medium-style typography

---

## Tech Stack Decision

### Backend: **Python (FastAPI)**

**Why Python over Node:**
1. **No `npm install` friction** — user just runs `pip install fastapi uvicorn`
2. **File I/O is simpler** — Python's `pathlib` handles cross-platform paths cleanly
3. **SQLite built-in** — `sqlite3` is part of Python's standard library, zero extra deps
4. **LLM/ML ecosystem** — Phase 4 (LLM integration) has first-class Python support
5. **Smaller dependency tree** — FastAPI + Uvicorn is ~10 packages; Express tooling brings in hundreds

**Tradeoffs:**
- `watchfiles` is less granular than Node's `chokidar`, but sufficient for `.md` files
- Python string processing slightly more verbose than JS for markdown parsing

### Frontend: **Vanilla HTML/CSS/JS (no framework)**

**Why no React/Vue/Svelte:**
- File tree + editor + story card panels = manageable without a framework
- No build step — just serve static files
- Faster iteration during development

**Tradeoffs:**
- Story card UI (forms, dropdowns, drag-reorder) will need careful DOM management in vanilla JS
- Charts in Phase 3 will be handled via a CDN library (e.g. Chart.js), no bundler needed

### Database: **SQLite (standard library)**

**Why SQLite:**
- Zero configuration — single `.db` file in the project directory
- Needed from Phase 2 onward for story cards and session logs
- **We create the database schema and table in Phase 1 (empty)** so MVP architecture already supports it — no migration later
- `sqlite3` has no external dependencies in Python

**Tradeoffs:**
- Fine for a single-user local app; would need migration if the app ever went multi-user

### File Watching: **`watchfiles`** (Python library)

Monitors the Obsidian vault folder for external changes and pushes updates via WebSocket. Deferred to Phase 2.

### Editor: **CodeMirror 5 via CDN**

- Single UMD build loaded from CDN (`codemirror.min.js` + `markdown.js` + `overlay.js`)
- Custom markdown overlay renders `**bold**`, `_italic_`, `# Headings` inline while the underlying text remains editable — like Obsidian's Live Preview
- Scene delimiter lines (`---`, `--`, `----`, etc.) rendered as styled visual dividers via CM's line widget API — dashes hidden behind an `<hr>`-style element
- `getValue()` returns raw markdown for saving; `setValue()` loads it back
- No bundler or build step needed — just `<script>` tags in `index.html`

**Tradeoff:** CM5 is unmaintained, but stable, ~150KB compressed, and simpler than CM6's modular ES module ecosystem which requires a bundler.

### Scene Delimiter Normalization

- Detect any line matching regex `^-{2,}$` (2+ dashes alone on a line) as a scene break
- On save, **normalize all scene breaks to exactly `---`** so the file stays consistent over time
- When loading, the frontend CM5 overlay hides all matched delimiter lines behind a styled `<hr>` — user never sees raw dashes in the editor

---

## Full Project Structure (All Phases)

```
writing-buddy/
├── PLAN.md                            # This file
├── requirements.txt                   # Python dependencies (all phases)
├── README.md                          # Setup and usage instructions
├── writing_buddy.db                   # SQLite database (created at first run — not in git)
│
├── backend/
│   ├── __init__.py                    # Package marker
│   ├── main.py                        # FastAPI app, all routes, WebSocket
│   ├── file_ops.py                    # Read/write vault files, path traversal protection
│   ├── models.py                      # Pydantic request/response schemas (all phases)
│   ├── db.py                          # SQLite connection, schema creation, migrations
│   ├── utils.py                       # Word count, scene splitting, text utilities
│   ├── story_cards.py                 # Phase 2: CRUD for file/scene story cards
│   ├── sessions.py                    # Phase 3: Session logging, analytics queries
│   └── llm.py                         # Phase 4: LLM integration hooks
│
├── frontend/
│   ├── index.html                     # Single page app shell
│   ├── css/
│   │   ├── style.css                  # Dark theme, layout, typography (Phase 1)
│   │   ├── storycards.css             # Phase 2: Story card panel styles
│   │   └── analytics.css              # Phase 3: Analytics page styles
│   ├── js/
│   │   ├── app.js                     # App init, routing, global state, WebSocket
│   │   ├── sidebar.js                 # Folder tree, file click, folder word counts
│   │   ├── editor.js                  # Editor pane, scene tabs, Ctrl+S save
│   │   ├── utils.js                   # DOM helpers, word count display, formatters
│   │   ├── storycards.js              # Phase 2: Story card UI, character propagation
│   │   ├── sessions.js                # Phase 3: Timer UI, session controls
│   │   └── analytics.js               # Phase 3: Chart rendering, data fetching
│   └── pages/
│       ├── analytics.html             # Phase 3: Analytics dashboard page
│       └── settings.html              # Phase 2+: Vault path config, preferences
│
└── vault/                             # (not created — user configures path at first run)
```

---

## Development Phases

### Phase 1 — MVP (build first)

**Goal:** Open a vault, browse files, edit with scene awareness, save, word counts.

- FastAPI server with static file serving
- First-run vault path configuration (stored in SQLite)
- File tree sidebar (recursive `.md` discovery from vault root)
- Click file → load content into editor
- Scene splitting on `---` with visual dividers and scene selector
- Word count: per scene (at cursor), per file (in footer), per folder (in sidebar)
- Ctrl+S and save button → write full file content back to disk
- Dark theme matching Obsidian palette
- Medium-style typography in editor (serif body, clean sans-serif titles)
- **SQLite database created with empty schema** (ready for Phase 2)

### Phase 2 — Story Card (Ficha de História)

**Right panel** with structured writing metadata:

- **File-level story card:** theme, concept, genre, logline, protagonist, antagonist, three-act outline, summary with spoilers
- **Per-scene story card:** same fields scoped to the scene, plus assets (character names, locations)
- **Auto-propagation:** new characters in a scene automatically added to the master file card
- **Auto-summary:** scene summaries concatenate into a running master summary
- **Character inheritance:** dropdown to pull characters from master card into a scene

**Backend:** `story_cards.py` — CRUD endpoints, propagation logic, summary aggregation
**Frontend:** `storycards.js`, `storycards.css` — form panels, dropdowns, character tags
**Database:** `story_cards` and `story_card_assets` tables

### Phase 3 — Writing Sessions & Analytics

**Session tracking:**
- Start/stop timer in the UI
- Log saved per session: file, scene, word count at start/end, duration
- Sessions stored in SQLite

**Analytics page** (separate route, `analytics.html`):
- Words written per session (bar/line chart)
- Total writing time
- Progress per file over time
- Per-story analytics: character count, total words, total writing time

**Backend:** `sessions.py` — session CRUD, aggregated queries
**Frontend:** `sessions.js`, `analytics.js` — timer UI, Chart.js integration

### Phase 4 — LLM Integration (future, light planning)

- LLM-powered story analysis (structure, pacing, character consistency)
- Asset suggestions (character arcs, location details)
- Writing prompt generator based on story context
- Minimal gamification (writing streaks, word count milestones, levels)

**Backend:** `llm.py` — provider-agnostic (OpenAI API, Ollama local, or similar)
**Frontend:** minimal UI hooks, likely inline in editor or story card panels

---

## Architectural Decisions & Tradeoffs

### Direct File Access

- Server reads/writes files **synchronously** — text files are small enough
- `pathlib.Path` resolves the vault root; all paths are relative to it
- **Path traversal protection:** reject any `..` or absolute paths in API requests
- No sandbox or copies — always operates on real files in the vault

### Scene Splitting

- Detect any line matching regex `^-{2,}$` (2+ dashes alone on a line) as a scene break
- On load, split on all matched delimiters; preserve content between them as scenes
- On save, **normalize all scene breaks to exactly `---`** and join with `\n---\n`
- File with no matching delimiter = one scene (entire content)
- Scene indices: 0-based in backend, 1-based in UI
- CM5 overlay hides delimiter lines behind styled `<hr>` visuals in the editor

### Word Count

- Split by whitespace (`len(text.split())`) — standard word processor behavior
- **Backend:** computed for sidebar folder totals and API responses
- **Frontend:** live update as user types, per-scene based on cursor position

### Vault Path Configuration

- First-run flow: if no vault path is configured, show a simple setup screen
- Path stored in SQLite `settings` table
- Changeable later via settings page (Phase 2+)

### Story Card Storage: **SQLite, NOT in markdown files**

- Story cards live in the database, linked to file path + scene index
- This keeps Obsidian vault files clean and unmodified (except the user's own edits)
- **Tradeoff:** story cards are not portable if the user moves the vault without the `.db` file
- **Mitigation:** Phase 4 could add YAML frontmatter export as a backup/sync option

### Character Propagation Logic

- Each scene story card has an `assets` section with `characters` (list of strings)
- On save of a scene card:
  - Compare scene characters against file-level master card characters
  - New characters → added to master card automatically
  - Removed characters → NOT removed from master (preserve for reference)
- Master card character dropdown for scenes: pulls from the master list

### Summary Aggregation

- `master_summary` is computed as the concatenation of all scene summaries
- Stored redundantly on the file-level card for fast reads
- Recomputed when any scene summary changes

### Session Logging

- Each session: `{file_path, scene_index, words_start, words_end, duration_sec, timestamp}`
- Sessions are append-only; no edits (can be deleted if accidental)
- Analytics queries aggregate by day/week/file for chart rendering

### Save Behavior

- Ctrl+S (handled in JS, prevents browser default)
- Save button in editor toolbar
- Writes the **full file content** — all scenes joined back with `---`
- No auto-save in Phase 1; potential Phase 2 feature

### WebSocket

- Single endpoint for real-time file change notifications
- Phase 2: push "external file changed" events from `watchfiles`
- Deferred from MVP to keep Phase 1 lean

### Database Schema Outline (Phase 1: empty creation)

```sql
-- Phase 1: create tables, no data needed yet
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS story_cards (
    id INTEGER PRIMARY KEY,
    file_path TEXT NOT NULL,
    scene_index INTEGER DEFAULT -1,   -- -1 = file-level card
    field_name TEXT NOT NULL,
    field_value TEXT,
    UNIQUE(file_path, scene_index, field_name)
);
CREATE TABLE IF NOT EXISTS story_card_assets (
    id INTEGER PRIMARY KEY,
    story_card_id INTEGER REFERENCES story_cards(id),
    asset_type TEXT NOT NULL,         -- 'character', 'location', etc.
    asset_name TEXT NOT NULL,
    UNIQUE(story_card_id, asset_type, asset_name)
);
CREATE TABLE IF NOT EXISTS writing_sessions (
    id INTEGER PRIMARY KEY,
    file_path TEXT NOT NULL,
    scene_index INTEGER,
    words_start INTEGER DEFAULT 0,
    words_end INTEGER DEFAULT 0,
    duration_sec INTEGER DEFAULT 0,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## MVP-Specific UI Layout

```
┌──────────────────────┬──────────────────────────────────────┐
│  SIDEBAR             │  EDITOR                               │
│  ~280px              │  flex: 1                              │
│                      │                                       │
│  📁 Folder A (1423)  │  Scene 1 ── Scene 2 ── Scene 3       │
│    📄 file1.md (342) │  ──────────────────────────────────── │
│    📄 file2.md (189) │                                       │
│  📁 Folder B (876)   │  [serif body text, Medium-style]       │
│    📄 file3.md (876) │  Large clean title area               │
│                      │  Comfortable line-width max ~680px     │
│                      │  ~20px serif body, warm off-white      │
│  ──────────────────  │                                       │
│  Total: 2299 words   │  ──────────────────────────────────── │
│                      │  Footer: Scene 1/3 · 342 words        │
└──────────────────────┴──────────────────────────────────────┘
```

---

## Obsidian Color Palette (Dark Theme)

| Element           | Color      | Role                      |
|-------------------|------------|---------------------------|
| `--bg-app`        | `#1e1e1e`  | Main app background       |
| `--bg-sidebar`    | `#151515`  | Sidebar background        |
| `--bg-hover`      | `#2a2a2a`  | Sidebar item hover        |
| `--bg-input`      | `#262626`  | Story card form fields    |
| `--text-primary`  | `#dcddde`  | Main text                 |
| `--text-secondary`| `#747474`  | Labels, counts, muted     |
| `--accent`        | `#7c3aed`  | Links, buttons, highlights|
| `--accent-hover`  | `#6d28d9`  | Accent on hover           |
| `--border`        | `#333333`  | Dividers, borders         |
| `--scrollbar`     | `#444444`  | Scrollbar thumb           |
| `--scene-bg`      | `#1e1e1e`  | Scene editing area        |
| `--divider`       | `#555555`  | Scene `---` visual divider|

Font: `--font-serif` = `Georgia, 'Times New Roman', serif` for body; `--font-sans` = `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` for UI elements.

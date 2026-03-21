# Rebuild

Rebuild is a local-first Hebrew training intelligence web app.

## What is implemented

- Responsive Next.js app (RTL Hebrew UI)
- SQLite local storage (`data/rebuild.db`)
- Ingestion from local folder (`data/import/*.json`)
- Daily metrics: Fitness/Fatigue/Readiness
- Daily recommendation with explanation factors
- 7-day forecast
- Smart Nutrition V1.5: pantry + meal slots + macro totals + feedback learning
- Screens: Today, Log, Daily Check-in, Logic Studio, Import, Settings
- API routes:
  - `POST /api/ingest/rescan`
  - `GET /api/ingest/status`
  - `GET /api/dashboard/today`
  - `GET /api/dashboard/forecast?days=7`
  - `POST /api/checkin/daily`
  - `GET /api/recommendation/today`
  - `POST /api/logic/rules`
  - `GET /api/nutrition/pantry?date=YYYY-MM-DD`
  - `POST /api/nutrition/pantry`
  - `POST /api/nutrition/ingredient`
  - `POST /api/nutrition/meal-feedback`
  - `POST /api/nutrition/meal-edit`

## Local run

1. Install dependencies:

```bash
npm install
```

2. Start app:

```bash
npm run dev
```

3. Optional ingest watcher (10 minutes):

```bash
npm run watch:ingest
```

4. Open http://localhost:3000

## Vercel Postgres (Neon) setup

### 1) Create / attach the database in Vercel
1. Open your Vercel project dashboard.
2. Go to **Storage**.
3. Click **Create Database** → **Postgres**.
4. Attach it to this project.

Vercel will add environment variables like `POSTGRES_URL` to your project.

### 2) Pull env vars locally
From the project folder:

```bash
cd "/Users/Y.T.p/Claude code-chat/rebuild"
npx vercel link
npx vercel env pull .env.local
```

### 3) Verify the connection
Start the dev server:

```bash
npm run dev
```

Then open:
`http://localhost:3000/api/db/ping`

You should see `{"ok":true,...}`.

## Resetting history and rebaselining

If you want to drop every workout/metric and start from a new Smashrun TCX export:

1. Run `npm run reset:history` to delete `data/rebuild.db`, clear `data/import` and `data/smashrun-export`, and recreate the folders.
2. Copy your new Smashrun `*.tcx` files into `data/smashrun-export` (or another folder you point to with `REBUILD_SMASHRUN_DIR`).
3. Run `npm run reset:ingest` (which already clears workout tables and reingests) or start `npm run watch:ingest` to build the app from the fresh TCX set.
4. Keep only the new TCX files in that folder so future scans remain in sync with the reset baseline.

The Smashrun directory is considered the ground truth after the reset, so once new exports are copied in the app will treat them as the only history.

## HealthFit path

Default import directory is already set in code to:

`/Users/Y.T.p/Library/Mobile Documents/iCloud~com~altifondo~HealthFit/Documents`

You can override with env var:

```bash
REBUILD_IMPORT_DIR="/absolute/path/to/export/folder"
```

## Smart Coach (AI token)

To enable the smart coaching agent (training + nutrition suggestions), add to `.env.local`:

```bash
REBUILD_AI_API_KEY="YOUR_API_KEY"
REBUILD_AI_MODEL="gpt-4o-mini"
REBUILD_AI_BASE_URL="https://api.openai.com/v1"
REBUILD_AI_TIMEOUT_MS="15000"
```

Notes:

- If `REBUILD_AI_API_KEY` is missing or the API call fails, Rebuild automatically falls back to the local rules engine.
- Pantry input from the Today screen is sent to the smart coach and influences meal suggestions.
- AI nutrition output is validated. If slots/macros are invalid, Rebuild falls back to the local deterministic nutrition engine.
- If calories are not provided when adding a custom ingredient, Rebuild computes calories by `4/4/9` (protein/carbs/fat).

## Import format

Supported file types:

- `.fit` (HealthFit export)
- `.gpx` (HealthFit export)
- `.json` (custom payload)

Example:

```json
{
  "source": "strava",
  "sport": "run",
  "startAt": "2026-03-03T06:15:00.000Z",
  "durationSec": 2700,
  "distanceM": 8200,
  "avgHr": 148,
  "maxHr": 171,
  "elevationM": 61
}
```

## Notes

- V1 is single-user and local-only.
- Bavel is currently a complementary source via file import payloads (`source: "bavel"`).

# BillPath

Follow Every Bill's Journey From Introduction to Law.

## Stack
- Astro + TypeScript + Tailwind CSS
- Recharts visualizations
- Fuse.js fuzzy search
- Static JSON data (no backend)

## Run
```bash
npm install
npm run dev
```

## Build for GitHub Pages
```bash
npm run build
```

The scheduled data refresh fetches up to 250 bills per run. Set `BILLS_PER_RUN`
to a value from 1 to 250 when running the ingestion script manually.

## Data files
- `src/data/bills.json`
- `src/data/timelines.json`
- `src/data/committees.json`
- `src/data/legislators.json`
- `src/data/briefings.json`
- `src/data/activity.json`
- `src/data/votes.json`

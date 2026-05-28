# Medica App

React + Vite study platform for USMLE Step 1 preparation.

## Development

```bash
npm install
npm run dev -- --host 0.0.0.0 --port 5174
```

Open **http://localhost:5174**

## Build

```bash
npm run build
```

## Recovery — blank page / dev server crash

If the app shows a blank page or the dev server fails to start, clear the Vite
dependency cache and reinstall:

```bash
# Windows (PowerShell)
Remove-Item -Recurse -Force node_modules\.vite -ErrorAction SilentlyContinue
npm install
npm run dev -- --host 0.0.0.0 --port 5174

# Mac / Linux
rm -rf node_modules/.vite
npm install
npm run dev -- --host 0.0.0.0 --port 5174
```

## Dependency notes

See [`docs/DEPENDENCY_NOTES.md`](docs/DEPENDENCY_NOTES.md) for pinned packages
and known compatibility issues (notably: **do not upgrade recharts past 2.15.3**
until Vite compatibility is verified — v3 causes a runtime crash in dev mode).

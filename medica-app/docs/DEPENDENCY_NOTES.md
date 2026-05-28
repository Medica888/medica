# Dependency Notes

## recharts — pinned to 2.15.3

### Why it is pinned

`recharts` is pinned to exactly `2.15.3` (no `^` or `~`) in `package.json`.

Do **not** upgrade to recharts v3.x until Vite compatibility is verified.

### What breaks in recharts v3.8.1

recharts v3 introduced a dependency on `es-toolkit`. That package uses a mixed
CJS/ESM module format that Vite's pre-bundler (`node_modules/.vite`) cannot
resolve correctly at runtime.

The app loads, the HTML is served, but the React tree crashes immediately with:

```
[Unhandled error] TypeError: require_isUnsafeProperty is not a function
  > node_modules/es-toolkit/dist/compat/object/get.js
  > node_modules/.vite/deps/recharts.js
```

Result: white blank page on localhost.

The build (`npm run build`) still passes because Rolldown handles the module
differently than Vite's dev-mode pre-bundler. The crash only appears in dev mode.

### How to safely test a future upgrade

1. Create a separate git branch.
2. Change the version in `package.json` to the new version (e.g. `"recharts": "3.x.x"`).
3. Run `rm -rf node_modules/.vite && npm install`.
4. Run `npm run dev -- --port 5174`.
5. Open the browser and check the console for `TypeError` or blank page.
6. Also navigate to the Analytics page and confirm the Progress Trends chart renders.
7. If no errors, run `npm run build` to confirm production build passes.
8. Only merge after both dev and build are confirmed clean.

---

## Recovery command

If the app shows a blank page or the dev server crashes unexpectedly, run:

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

This clears Vite's pre-bundled dependency cache and restarts cleanly.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

World Info Book: a full-screen interactive world map (vanilla HTML/CSS/JS + D3) where clicking a country shows a popup with flag/capital/continent/population, plus a streaming AI chat panel. Deployed on Vercel (live at https://world-info-book.vercel.app). There is no `package.json`, build step, linter, or test suite: it's static files plus two Vercel serverless functions.

## Commands

- `vercel dev`: run locally at http://localhost:3000 (serves static files plus `api/*`). Needs `REST_COUNTRIES_KEY` and `GROQ_API_KEY` in `.env`.
- `vercel --prod`: deploy. Production env vars are set in the Vercel dashboard, not read from `.env`.
- Use `vercel dev`; don't open `index.html` directly. Over `file://`, the ES modules and GeoJSON fetch are blocked. A plain static server renders the map, but popups and chat fail because `/api/*` won't exist.

## Architecture

**Frontend: no bundler.** `index.html` holds markup only (no inline styles or app scripts). It loads `vendor/d3.min.js` (deferred, exposes the global `d3`), then two ES modules, `js/map.js` and `js/chat.js`, which don't share anything.

- `vendor/d3.min.js` is a **trimmed D3 bundle**: the official UMD builds of d3-array, geo, dispatch, selection, color, interpolate, ease, timer, transition, drag, and zoom, concatenated in dependency order. Only those namespaces exist on `d3`. To use another D3 module, append its `dist/*.min.js` in dependency order.
- `js/map.js` is mobile performance-critical, so keep these choices:
  - The map is drawn on a **`<canvas>`, not SVG**, with `d3.geoEqualEarth()`. Equal Earth was deliberately chosen over Leaflet/Mercator raster tiles, so don't reintroduce a tile basemap. Canvas replaced SVG because re-rasterizing ~260 paths on every pan/zoom frame was janky on phones.
  - `buildPaths()` projects every feature once into a cached `Path2D`, plus one combined `landPath`. It only reruns on resize. A frame (`draw()`, rAF-throttled via `scheduleDraw()`) sets the zoom transform on the context, then does one fill and one stroke. Stroke width is `1 / k` so borders stay 1px at any zoom. Pixel ratio is capped at 2.
  - Hit-testing (`countryAt`) inverts the zoom transform, then runs `ctx.isPointInPath` on a bbox-prefiltered candidate list, topmost first. Hover highlighting is mouse-only.
  - The popup (`#country-popup`) is anchored to the feature's **projected centroid**. Its size is measured only when its content changes. During zoom, `positionPopup()` is pure arithmetic plus a `transform`, with the `--arrow-x` CSS var for the arrow, so it never forces layout mid-gesture.
  - `resize()` refits the projection to `{type:'Sphere'}`, rebuilds paths, resets the zoom, and closes the popup.
  - `normalizeWinding()` rewrites polygon ring winding before rendering. d3-geo requires clockwise exteriors; mis-wound rings make d3's antimeridian clipping produce a huge invisible shape that steals clicks from other countries. Keep this step if you swap the data source.
  - Country lookups are cached in memory per session. A stale response (the user clicked another country first) is dropped via `popupRequestId`.
- Glassmorphism `backdrop-filter` is disabled on touch devices (`@media (hover: none)`), because re-blurring the map behind the badges every frame is expensive.
- Country outlines come from `data/countries.geojson`: a local copy of datasets/geo-countries (258 features), simplified with mapshaper, with coordinates rounded to 2 decimals. Tiny rings keep higher precision so micro-states don't collapse. Feature properties used: `name` and `ISO3166-1-Alpha-3`. `-99` means there's no ISO code, so the name is used for the lookup instead.
- Click handler overrides: Israel → Palestine (`PSE`) and Taiwan → China (`CHN`) are remapped before the data lookup. The chat system prompt in `api/chat.js` follows a matching policy. These are intentional product decisions.

**Serverless functions (`api/`, ESM default-export handlers):**
- `api/countries.js` is a proxy to REST Countries **v5** (`api.restcountries.com/countries/v5/...`) that adds the bearer key server-side. It looks up by ISO code (2- or 3-letter, chosen by length), or by `names.common` with `fullText=true` and a fallback to `names.official`. It returns 404 when nothing matches. Successful responses send `Cache-Control: s-maxage=86400` so Vercel's edge caches them. The frontend expects the v5 response shape `data.objects[0]` with `names.common`, `capitals[0].name`, `continents[0]`, `population`, and `flag.url_png`/`url_svg`.
- `api/chat.js` takes POST `{message}` (max 2000 chars) and sends a single-turn request (no conversation history) to Groq's OpenAI-compatible endpoint, model `openai/gpt-oss-120b`, with `stream: true`. It re-emits deltas to the client as SSE lines `data: {"text": ...}` and ends with `data: {"done": true}`. `js/chat.js` parses exactly this format, so change both together. The system prompt asks for plain text with no Markdown, because the client renders the reply as escaped text.

## Notes

- `.env`, `.env.local`, `.vercel`, and `about.txt` are gitignored.
- `image*.png` files are README screenshots. Update them if the UI changes noticeably.
- `index.html` also loads Vercel Speed Insights and Analytics scripts (`/_vercel/...`), which only resolve when deployed.

# Phase 1: MVP Skeleton

**Goal:** Working scroll-through site with map, flight cards, day cards. Functional, not pretty.

**Status: COMPLETE**

---

## Directory Structure

- [x] Create `data/` directory
- [x] Create `days/` directory
- [x] Create `js/` directory
- [x] Create `css/` directory
- [x] Create `docs/` directory

## Data Files

- [x] `data/trip.json` — title, subtitle, dates, origin (Klagenfurt), traveler count, dayFiles manifest
- [x] `data/flights.json` — 3 journeys, 7 legs (including drive legs KLU↔LJU), mapView overrides, all coordinates
- [x] `data/accommodations.json` — Robertson Quay (Singapore) + Myeongdong (Seoul) with coordinates

## Day Markdown Files

All with YAML frontmatter: date, city, status, title, coordinates, zoom.

- [x] `days/day-02-singapore-arrival.md` — Jul 11, status: planned
- [x] `days/day-03-singapore.md` — Jul 12, status: planned
- [x] `days/day-04-singapore.md` — Jul 13, status: open
- [x] `days/day-05-seoul-arrival.md` — Jul 14, status: planned
- [x] `days/day-06-seoul.md` — Jul 15, status: planned
- [x] `days/day-07-seoul.md` — Jul 16, status: open
- [x] `days/day-08-seoul.md` — Jul 17, status: open
- [x] `days/day-09-seoul.md` — Jul 18, status: open
- [x] `days/day-10-seoul.md` — Jul 19, status: open

## HTML Entry Point

- [x] `index.html` — loads Inter font, Mapbox GL JS CSS + JS, marked.js, own CSS + JS
- [x] CDN: Mapbox GL JS v3 via unpkg
- [x] CDN: marked.js UMD build via unpkg (`/lib/marked.umd.js`)
- [x] CDN: Inter font via Google Fonts
- [x] Contains `#map` and `#story` containers

## JavaScript: app.js

- [x] Mapbox token configured
- [x] `init()` — parallel fetch of trip.json, flights.json, accommodations.json
- [x] `init()` — fetch all day markdown files with error handling (skips failed fetches gracefully)
- [x] `parseFrontmatter()` — regex-based YAML frontmatter parser, handles arrays via JSON.parse
- [x] `buildChapters()` — merges flight journeys + days, sorts by date, flights before days on same date
- [x] `renderStory()` — builds hero section + chapter sections + footer into #story
- [x] `renderFlightCard()` — dark card with date, airline, flight number, aircraft, times, layovers, total duration
- [x] `renderFlightCard()` — drive legs rendered differently (dimmed, "Drive · duration")
- [x] `renderDayCard()` — light card with status badge, formatted date, title, markdown content via marked.parse()
- [x] `formatTime()` — extracts HH:MM from ISO string (no timezone parsing)
- [x] `formatDate()` — formats date string to "Wed, Jul 12" style
- [x] `startGlobeRotation()` / `stopGlobeRotation()` — requestAnimationFrame rotation loop
- [x] Scroll callback: hero → flyToGlobe then start rotation on moveend; chapters → stop rotation + flyToChapter

## JavaScript: map.js

- [x] `initMap()` — Mapbox GL JS with dark-v11 style, globe projection, fog/atmosphere, interactive: false
- [x] `addDrivingRoute()` — dashed line from origin to first airport
- [x] `addFlightRoutes()` — GeoJSON LineString per journey, teal color, 2.5px width
- [x] `addAirportMarkers()` — deduped markers for all 5 airports (LJU, IST, SIN, ICN, MUC)
- [x] `addAccommodationMarkers()` — styled red dots with white border (replaced house emoji)
- [x] `addOriginMarker()` — Klagenfurt marker with label
- [x] `flyToGlobe()` — globe view centered on Singapore/Seoul region [115, 20] zoom 3
- [x] `flyToChapter()` — dispatches to flyToFlight or flyToDay
- [x] `flyToFlight()` — uses journey.mapView override when present, fallback to auto-center/zoom
- [x] `flyToDay()` — flies to day coordinates/zoom from frontmatter, pitch 50, bearing -15
- [x] `highlightRoute()` / `resetRouteHighlights()` — dims inactive routes, brightens active one

## JavaScript: scroll.js

- [x] `initScroll()` — IntersectionObserver on hero + all chapters, threshold 0.4
- [x] Adds/removes `.active` class on chapter sections
- [x] Fires onChapterChange callback with chapter object

## CSS: style.css

- [x] CSS custom properties for theming (font, colors, blur, radius)
- [x] Map container: fixed, full viewport, z-index 0
- [x] Story container: relative, z-index 1
- [x] Hero section: full viewport height, centered content, glassmorphism card, fadeIn animation
- [x] Scroll hint: pulsing opacity animation
- [x] Chapter sections: min-height 100vh, flex center, 30vh margin-bottom between chapters
- [x] Card base: max-width 420px, backdrop-filter blur, opacity/transform transition
- [x] Active card: opacity 1, translateY(0), box-shadow
- [x] Flight card: dark background, teal border accent
- [x] Day card: light background
- [x] Drive leg: dimmed, smaller font, white arrow
- [x] Status badges: planned (teal), confirmed (green), open (yellow)
- [x] Flight leg layout: route, detail, times with tabular-nums
- [x] Layover: dashed left border, centered text
- [x] Day content: styled h2, h3, p, ul, li for markdown output
- [x] Airport markers: teal badge with code text
- [x] Accommodation markers: red dot with white border and glow
- [x] Origin marker: white dot with label
- [x] Footer: centered, muted text
- [x] Responsive: 768px breakpoint (smaller fonts, full-width cards, tighter padding)
- [x] Responsive: 480px breakpoint (further size reductions)

## Deployment

- [x] `.nojekyll` file added (GitHub Pages serves .md files)
- [ ] Mapbox token domain-restricted to `geoberle.github.io` (403 errors — needs correct URL restriction format)

## Verified (via Playwright MCP)

- [x] Site renders on localhost
- [x] Hero section: globe centered on Singapore/Seoul, title card, rotating globe
- [x] Scroll down: outbound flight card with KLU→LJU drive + LJU→IST→SIN flights, map zooms to Europe
- [x] Day cards render with parsed markdown (headings, bullets, paragraphs)
- [x] Scroll triggers map flyTo transitions between all chapters
- [x] Flight routes visible as arcs on globe
- [x] Airport markers visible at correct locations (LJU, IST, SIN, ICN, MUC)
- [x] Accommodation markers visible (Robertson Quay, Myeongdong) — styled red dots
- [x] Klagenfurt origin marker with label visible
- [x] Route highlighting works (active bright, others dimmed)
- [x] Status badges display correct colors (planned=teal, open=yellow)
- [x] Card fade-in animation triggers on scroll
- [x] Scroll back to hero returns to globe view, rotation restarts after flyTo completes
- [x] Dates displayed on flight cards ("✈ FLIGHT · FRI, JUL 10")
- [x] Return card shows Seoul → Klagenfurt with drive leg LJU → Klagenfurt
- [x] Mobile layout works at 375px (iPhone) — hero, flight cards, day cards all readable
- [x] Mapbox token authenticates on localhost
- [ ] Mapbox token authenticates on GitHub Pages (pending domain restriction fix)

## Resolved Issues

1. **Blank page on load.** Root cause: `marked.js` CDN URL `https://unpkg.com/marked/marked.min.js` returned 404. Package v18 moved UMD build to `/lib/marked.umd.js`. Fixed in `index.html`.

2. **GitHub Pages 404 on .md files.** Root cause: Jekyll (GitHub Pages default) ignores `.md` files. Fixed by adding `.nojekyll` to repo root.

3. **JS crash when day files fail to load.** Root cause: `d.meta.date` undefined when fetch returns non-OK response, causing `localeCompare` TypeError. Fixed with `.catch()` and `.filter(Boolean)` in day file loading.

4. **Accommodation markers ugly.** Replaced house emoji with styled CSS red dots with white border and glow.

5. **No dates on flight cards.** Added `formatDate(journey.date)` to flight card label.

6. **Trip starts from Klagenfurt, not LJU.** Added drive legs (KLU→LJU outbound, LJU→KLU return) to flights.json. Added origin marker on map. Drive legs render with distinct style in cards.

7. **Outbound flight view too zoomed out.** Added `mapView` overrides per journey in flights.json for curated camera positions.

8. **Globe rotation conflicts with flyTo.** Fixed by stopping rotation before flyTo, restarting via `map.once('moveend')`.

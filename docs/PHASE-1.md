# Phase 1: MVP Skeleton

**Goal:** Working scroll-through site with map, flight cards, day cards. Functional, not pretty.

---

## Directory Structure

- [x] Create `data/` directory
- [x] Create `days/` directory
- [x] Create `js/` directory
- [x] Create `css/` directory

## Data Files

- [x] `data/trip.json` — title, subtitle, dates, origin, traveler count, dayFiles manifest
- [x] `data/flights.json` — 3 journeys (outbound, singapore-seoul, return), 5 legs, all airport coordinates
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
- [x] CDN: marked.js via unpkg
- [x] CDN: Inter font via Google Fonts
- [x] Contains `#map` and `#story` containers

## JavaScript: app.js

- [x] Mapbox token configured (user's real token stored)
- [x] `init()` — parallel fetch of trip.json, flights.json, accommodations.json
- [x] `init()` — fetch all day markdown files listed in trip.dayFiles
- [x] `parseFrontmatter()` — regex-based YAML frontmatter parser, handles arrays via JSON.parse
- [x] `buildChapters()` — merges flight journeys + days, sorts by date, flights before days on same date
- [x] `renderStory()` — builds hero section + chapter sections + footer into #story
- [x] `renderFlightCard()` — dark card with airline, flight number, aircraft, times, layovers, total duration
- [x] `renderDayCard()` — light card with status badge, formatted date, title, markdown content via marked.parse()
- [x] `formatTime()` — extracts HH:MM from ISO string (no timezone parsing, avoids Date issues)
- [x] `formatDate()` — formats date string to "Wed, Jul 12" style
- [x] `startGlobeRotation()` / `stopGlobeRotation()` — requestAnimationFrame rotation loop
- [x] Scroll callback: hero → start rotation + flyToGlobe, chapters → stop rotation + flyToChapter

## JavaScript: map.js

- [x] `initMap()` — Mapbox GL JS with dark-v11 style, globe projection, fog/atmosphere effect, interactive: false
- [x] `addFlightRoutes()` — GeoJSON LineString per journey, teal color, 2.5px width
- [x] `addAirportMarkers()` — deduped markers for all 5 airports (LJU, IST, SIN, ICN, MUC)
- [x] `addAccommodationMarkers()` — house emoji markers at accommodation coordinates
- [x] `flyToGlobe()` — zoomed-out globe view, resets route highlights
- [x] `flyToChapter()` — dispatches to flyToFlight or flyToDay
- [x] `flyToFlight()` — centers between departure/arrival, auto-zoom based on distance, highlights active route
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
- [x] Status badges: planned (teal), confirmed (green), open (yellow)
- [x] Flight leg layout: route, detail, times with tabular-nums
- [x] Layover: dashed left border, centered text
- [x] Day content: styled h2, h3, p, ul, li for markdown output
- [x] Airport markers: teal badge with code text
- [x] Accommodation markers: house emoji with drop shadow
- [x] Footer: centered, muted text
- [x] Responsive: 768px breakpoint (smaller fonts, full-width cards, tighter padding)
- [x] Responsive: 480px breakpoint (further size reductions)

## Verified (via Playwright MCP)

- [x] Site renders (blank page was caused by wrong marked.js CDN path — fixed)
- [x] Hero section visible with title and rotating globe
- [x] Flight cards render with correct data (all 3 journeys, 5 legs)
- [x] Day cards render with parsed markdown (headings, bullets, paragraphs)
- [x] Scroll triggers map flyTo transitions
- [x] Flight routes visible as arcs on globe
- [x] Airport markers visible at correct locations (LJU, IST, SIN, ICN, MUC)
- [x] Accommodation markers visible (Robertson Quay, Myeongdong)
- [x] Route highlighting works on flight chapters (active bright, others dimmed)
- [x] Status badges display correct colors (planned=teal, open=yellow)
- [x] Card fade-in animation triggers on scroll
- [x] Mapbox token authenticates successfully
- [ ] Mobile layout works at 768px and 480px breakpoints (not yet tested)

## Resolved Issues

**Blank page on load.** Root cause: `marked.js` CDN URL `https://unpkg.com/marked/marked.min.js` returned 404. Package v18 moved UMD build to `/lib/marked.umd.js`. Fixed in `index.html`.

# Travel Website PRD

## Vision

A scroll-driven storytelling website for a family trip: Klagenfurt → Singapore → Seoul, July 10–20, 2026. The site serves two purposes: **planning tool** before the trip and **travel journal** after.

## Trip Summary

- 4 travelers (2 adults, 2 twelve-year-olds)
- 3 nights Singapore (Robertson Quay) → 6 nights Seoul (Myeongdong)
- 3 flight journeys: LJU→IST→SIN, SIN→ICN, ICN→MUC→LJU
- Turkish Airlines outbound, Singapore Airlines mid-leg, Lufthansa return

## Architecture

```
travel/
├── index.html              # Single page app entry
├── css/style.css            # Vanilla CSS, no framework
├── js/
│   ├── app.js               # Orchestrator: fetch data, render, init
│   ├── map.js               # Mapbox GL JS: globe, routes, markers
│   └── scroll.js            # IntersectionObserver scroll controller
├── data/
│   ├── trip.json            # Trip meta + day file manifest
│   ├── flights.json         # Flight journeys with coordinates
│   └── accommodations.json  # Lodging with coordinates
└── days/
    ├── day-02-singapore-arrival.md
    ├── ...
    └── day-10-seoul.md
```

### Key decisions

| Decision           | Choice                                         |
|--------------------|-------------------------------------------------|
| Hosting            | GitHub Pages (public repo)                      |
| Rendering          | Pure client-side, no build step                 |
| Maps               | Mapbox GL JS, globe projection                  |
| Data format        | JSON (structured) + Markdown per day (narrative)|
| UX model           | Scroll-driven storytelling                      |
| Visual design      | Dark/cinematic (flights) ↔ Light/editorial (days)|
| CSS                | Vanilla, CSS custom properties for theming      |
| Markdown parser    | marked.js (CDN)                                 |
| API key            | Domain-restricted in Mapbox dashboard            |
| Mobile             | Desktop-first, gracefully degraded mobile       |
| Browser testing    | Playwright MCP (screenshots + console errors)   |

### Data contract

**Day markdown frontmatter:**
```yaml
---
date: 2026-07-12
city: singapore
status: planned | confirmed | open
title: Gardens & Marina Bay
coordinates: [103.8636, 1.2816]
zoom: 14
---
```

**Chapter ordering:** App loads flights.json + day files, sorts by date. Flights come before days on same date. No explicit chapter manifest needed.

---

## Phase 1: MVP Skeleton ✅

**Goal:** Working scroll-through site with map, flight cards, day cards. Ugly is fine. Functional is required.

- [x] File structure: `data/`, `days/`, `js/`, `css/`
- [x] `flights.json` with all 5 legs across 3 journeys
- [x] `accommodations.json` with Robertson Quay + Myeongdong
- [x] 9 day markdown files with frontmatter
- [x] `index.html` loading Mapbox GL JS, marked.js from CDN
- [x] `app.js`: fetch data, parse frontmatter, build chapters, render DOM
- [x] `map.js`: globe projection, flight route lines, airport markers, accommodation markers, flyTo
- [x] `scroll.js`: IntersectionObserver triggers map transitions
- [x] Hero section with globe view + slow rotation
- [x] Flight chapters: dark translucent cards with flight details
- [x] Day chapters: light translucent cards with rendered markdown
- [x] Card fade-in on scroll (opacity transition)
- [ ] **Verify it actually works** (blank page bug — needs Playwright MCP)

---

## Phase 2: Debug & Stabilize

**Goal:** Fix blank page, verify all features work, establish dev feedback loop.

- [ ] Set up Playwright MCP for browser testing
- [ ] Start local HTTP server (`python3 -m http.server`)
- [ ] Debug blank page (likely JS error — check console via Playwright)
- [ ] Verify: hero renders, globe rotates, cards load
- [ ] Verify: scroll triggers map flyTo transitions
- [ ] Verify: flight routes render as arcs on globe
- [ ] Verify: markdown renders in day cards
- [ ] Verify: status badges display (planned/confirmed/open)
- [ ] Test on mobile viewport (responsive layout)
- [ ] Fix any issues found

---

## Phase 3: Visual Polish

**Goal:** Make it beautiful. Typography, spacing, transitions, dark/light mode contrast.

- [ ] Refine typography: font sizes, weights, line heights, letter spacing
- [ ] Hero section: bigger presence, animated subtitle, better scroll indicator
- [ ] Flight cards: tighter layout, airline-colored accents (TK red, SQ blue, LH yellow)
- [ ] Day cards: warmer background, better markdown heading styles
- [ ] Dark ↔ light map style transition between flight and day chapters
- [ ] Smooth card entrance animations (slide + fade, not just opacity)
- [ ] Better spacing rhythm between chapters (tune margin-bottom)
- [ ] Footer section: trip stats (3 countries, 5 flights, 10 days, X km total distance)
- [ ] Overview card after hero: quick stats, trip status summary, confirmed/open counts
- [ ] Glassmorphism refinement: border, shadow, blur tuning
- [ ] Color palette per city (Singapore: tropical greens, Seoul: neon pinks)

---

## Phase 4: Flight Animations

**Goal:** Animated flight arcs and plane icons. The cinematic centerpiece.

- [ ] Animated arc drawing: line progressively draws itself when flight chapter activates
- [ ] Plane icon: small aircraft marker traces the arc path using requestAnimationFrame
- [ ] Camera follows the plane during animation (subtle pan along route)
- [ ] Arc glow effect: subtle glow/bloom on the active flight line
- [ ] Departure/arrival pulse: pulsing dot at origin and destination airports
- [ ] Speed proportional to flight duration (short hops fast, long hauls slow)
- [ ] Animation replays when scrolling back to a flight chapter

---

## Phase 5: Content & Media

**Goal:** Add visual richness. Stock images now, own photos after the trip.

- [ ] Add `hero_image` field to day frontmatter (external URL)
- [ ] Render hero images as card backgrounds or header images
- [ ] Curate 1-2 stock images per city section (Unsplash, royalty-free)
- [ ] Image lazy loading (native `loading="lazy"`)
- [ ] Photo gallery component in day cards (scrollable image strip)
- [ ] Post-trip: swap stock images for personal photos
- [ ] Post-trip: add trip journal entries with narrative text + photos
- [ ] Image hosting strategy: external CDN or GitHub LFS to keep repo small

---

## Phase 6: Planning Features

**Goal:** Make the site useful as a pre-trip planning dashboard.

- [ ] Countdown timer on hero ("X days until departure")
- [ ] Logistics checklist in footer (visas, apps, packing, insurance)
- [ ] Checklist state stored in `data/checklist.json`
- [ ] Booking links: direct links to SG Arrival Card portal, K-ETA portal
- [ ] Weather widget or static weather expectations per city
- [ ] Day status progression: update markdown frontmatter as plans firm up
- [ ] POI markers: `data/pois.json` with named points of interest per city
- [ ] POI markers visible on map during day chapters

---

## Phase 7: Deployment & Sharing

**Goal:** Live on the internet. Shareable URL.

- [ ] GitHub repo init + first commit
- [ ] Enable GitHub Pages (from main branch)
- [ ] Domain-restrict Mapbox token to `username.github.io` + `localhost`
- [ ] Verify site works on GitHub Pages (relative paths, CORS)
- [ ] Share URL with family
- [ ] Optional: custom domain via CNAME

---

## Phase 8: Post-Trip Journal (Future)

**Goal:** Transform planning site into trip memoir.

- [ ] Replace stock images with personal photos
- [ ] Write narrative journal entries per day
- [ ] Add restaurant/cafe reviews and recommendations
- [ ] Add "highlights" or "best moments" section
- [ ] Photo gallery improvements: lightbox, captions
- [ ] Print-friendly CSS for physical memento

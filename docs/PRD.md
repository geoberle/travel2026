# Travel Website PRD

## Vision

A scroll-driven storytelling website for a family trip: Klagenfurt → Singapore → Seoul, July 10–20, 2026. The site serves two purposes: **planning tool** before the trip and **travel journal** after.

## Trip Summary

- 3 travelers (1 adult, 2 twelve-year-olds)
- 3 nights Singapore (Robertson Quay) → 6 nights Seoul (Myeongdong)
- 3 flight journeys: LJU→IST→SIN, SIN→ICN, ICN→MUC→LJU
- Turkish Airlines outbound, Singapore Airlines mid-leg, Lufthansa return

## Architecture

```
travel/
├── index.html              # Storytelling SPA (scroll-driven)
├── planning.html           # AI-powered planning tool
├── planning-server.js      # Express + Vertex AI agent backend
├── css/style.css            # Vanilla CSS, no framework
├── js/
│   ├── app.js               # Orchestrator: fetch data, render, init
│   ├── data.js              # TripStore: YAML data layer + API client
│   ├── map.js               # Mapbox GL JS: globe, routes, markers, POIs
│   ├── scroll.js            # IntersectionObserver scroll controller
│   └── timeline.js          # Timeline drawer navigation
├── data/
│   └── system-prompt.md     # AI agent system prompt template
└── trips/
    └── singapore-seoul-2026/
        ├── trip.yaml         # Trip meta, origin, transport/flights
        ├── travelers.md      # Traveler profiles & preferences
        └── locations/
            ├── singapore/
            │   └── location.yaml  # Accommodations, POIs, days
            └── seoul/
                └── location.yaml
```

### Key decisions

| Decision           | Choice                                         |
|--------------------|-------------------------------------------------|
| Hosting            | GitHub Pages (storytelling) + local server (planning) |
| Rendering          | Pure client-side, no build step                 |
| Maps               | Mapbox GL JS, globe projection                  |
| Data format        | YAML (trip + location data, parsed client-side via js-yaml) |
| UX model           | Scroll-driven storytelling                      |
| Visual design      | Dark/cinematic (flights) ↔ Light/editorial (days)|
| CSS                | Vanilla, CSS custom properties for theming      |
| Planning AI        | Vertex AI (Gemini) with tool-use agent loop     |
| API key            | Domain-restricted in Mapbox dashboard            |
| Mobile             | Desktop-first, gracefully degraded mobile       |
| Browser testing    | Playwright MCP (screenshots + console errors)   |

### Data contract

**Location YAML structure:**
```yaml
name: Singapore
coordinates: [103.8636, 1.2816]
dates:
  from: "2026-07-11"
  to: "2026-07-13"
accommodations:
  - id: singapore
    neighborhood: Robertson Quay
    type: Serviced Apartment
    coordinates: [103.8365, 1.2906]
pois:
  - id: gardens-by-the-bay
    name: Gardens by the Bay
    coordinates: [103.8636, 1.2816]
    description: ...
    category: attraction  # attraction|food|culture|shopping|nature|transport
    image: https://...
days:
  - date: "2026-07-12"
    title: Gardens & Marina Bay
    status: planned  # planned|confirmed|open
    activities:
      - poi: gardens-by-the-bay
        notes: Cloud Forest & Flower Dome
    notes: Optional day-level notes
```

**Chapter ordering:** App loads trip.yaml + location YAMLs, builds chapters from transport + days, sorts by date. Flights come before days on same date.

---

## Phase 1: MVP Skeleton ✅

**Goal:** Working scroll-through site with map, flight cards, day cards. Ugly is fine. Functional is required.

- [x] File structure: `trips/`, `js/`, `css/`
- [x] `trip.yaml` with transport (5 legs across 3 journeys)
- [x] Location YAMLs with accommodations, POIs, days
- [x] `index.html` loading Mapbox GL JS, js-yaml from CDN
- [x] `app.js`: fetch YAML data, build chapters, render DOM
- [x] `data.js`: TripStore data layer for static + API access
- [x] `map.js`: globe projection, flight route lines, airport markers, accommodation markers, flyTo
- [x] `scroll.js`: IntersectionObserver triggers map transitions
- [x] `timeline.js`: collapsible timeline drawer navigation
- [x] Hero section with globe view + slow rotation
- [x] Flight chapters: dark translucent cards with flight details
- [x] Day chapters: light translucent cards with activity lists
- [x] Card fade-in on scroll (opacity transition)
- [x] **Verify it actually works**

---

## Phase 2: Debug & Stabilize

**Goal:** Fix blank page, verify all features work, establish dev feedback loop.

- [x] Set up Playwright MCP for browser testing
- [x] Start local HTTP server (`python3 -m http.server`)
- [x] Debug blank page (fixed: marked.js UMD path)
- [x] Verify: hero renders, globe rotates, cards load
- [x] Verify: scroll triggers map flyTo transitions
- [x] Verify: flight routes render as arcs on globe
- [x] Verify: markdown renders in day cards
- [x] Verify: status badges display (planned/confirmed/open)
- [x] Test on mobile viewport (responsive layout)
- [x] Fix any issues found

---

## Phase 3: Visual Polish ✅

**Goal:** Make it beautiful. Typography, spacing, transitions, dark/light mode contrast.

- [x] Refine typography: Inter font, weights 200–700, letter spacing, line heights
- [x] Hero section: animated subtitle (fadeInUp), bouncing scroll indicator
- [x] Flight cards: airline-colored accents (TK red, SQ blue, LH yellow via data-airline)
- [x] Day cards: warm background (rgba(255, 252, 248, 0.93)), city-colored top borders
- [x] Dark ↔ light map style transition (dark-v11 for flights, standard for days)
- [x] Smooth card entrance animations (translateX + opacity with cubic-bezier)
- [x] Better spacing rhythm (35vh margin between chapters)
- [x] Footer section: countries, flights, days, total km (haversine calculation)
- [x] Overview card after hero: stats grid, status badges (confirmed/planned/open)
- [x] Glassmorphism: backdrop-filter blur, translucent backgrounds, subtle borders
- [x] Color palette per city (--city-singapore: #00b894, --city-seoul: #e84393)

---

## Phase 4: Flight Animations ✅

**Goal:** Animated flight arcs and plane icons. The cinematic centerpiece.

- [x] Scroll-driven arc drawing: line progressively draws as user scrolls through flight chapter
- [x] Plane icon: SVG aircraft marker traces interpolated route path
- [x] Camera follows plane (map.jumpTo tracks plane position)
- [x] Arc glow effect: separate glow layer with blur behind animated line
- [x] Departure/arrival pulse: pulsing dot markers at endpoints
- [x] Speed proportional to scroll position (natural pacing)
- [x] Animation replays when scrolling back (setupScrollDrivenFlight re-initializes)
- [x] Dashed preview line showing full route ahead of animation
- [x] Route highlight: active flight route brightens, others dim

---

## Phase 5: Content & Media

**Goal:** Add visual richness. Stock images now, own photos after the trip.

- [x] POI images used as day card header strips (grid of up to 4 images)
- [x] Flight card header images (Unsplash, per journey)
- [x] Curate stock images per POI (Unsplash URLs in location YAML)
- [x] Image lazy loading (native `loading="lazy"` + onerror fallback)
- [x] Image strip component in day cards (CSS grid, auto-columns)
- [ ] Post-trip: swap stock images for personal photos
- [ ] Post-trip: add trip journal entries with narrative text + photos
- [ ] Lightbox/gallery component for photo viewing
- [ ] Image hosting strategy: external CDN or GitHub LFS to keep repo small

---

## Phase 6: Planning Features

**Goal:** Make the site useful as a pre-trip planning dashboard.

- [ ] Countdown timer on hero ("X days until departure")
- [ ] Logistics checklist in footer (visas, apps, packing, insurance)
- [ ] Booking links: direct links to SG Arrival Card portal, K-ETA portal
- [ ] Weather widget or static weather expectations per city
- [x] Day status tracking (planned/confirmed/open in location YAML)
- [x] POI data: per-location YAML with id, name, coordinates, image, description, category
- [x] POI markers on map: symbol layer with category-colored pin images, shown per active day
- [x] Map auto-zoom: fitBounds to day's POIs + accommodation
- [x] Day→POI linking: activities array with poi references + notes
- [x] Inline POI rendering: category-colored pin icons next to POI names in day cards
- [x] POI click interaction: flyTo + rich popup with image, description, hours, cost, link
- [x] POI↔card hover cross-highlighting
- [x] AI planning tool (`planning.html` + `planning-server.js`):
  - [x] Vertex AI (Gemini) agent with tool-use loop
  - [x] Web search + YouTube transcript extraction
  - [x] Interactive POI proposal cards with select/skip
  - [x] Day schedule proposals
  - [x] Choice picker UI
  - [x] Drag-and-drop POI→day assignment
  - [x] Per-location chat history
  - [x] Traveler alignment scoring per POI
  - [x] Map integration: proposal pins with glow, popup previews

---

## Phase 7: Deployment & Sharing

**Goal:** Live on the internet. Shareable URL.

- [x] GitHub repo init + first commit
- [x] Enable GitHub Pages (from main branch)
- [x] `.nojekyll` added for raw file serving
- [ ] Domain-restrict Mapbox token to `geoberle.github.io` + `localhost`
- [ ] Verify site works on GitHub Pages end-to-end
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

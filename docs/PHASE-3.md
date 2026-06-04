# Phase 3: Visual Polish

## Context

Phase 1 (MVP) and Phase 2 (debug/stabilize) are complete. The site is functional but visually basic — uniform card styles, no airline branding, no city identity, no overview stats. This phase adds visual personality and polish without changing architecture.

---

## Sub-Phase 3A: Typography + Hero

**Files:** `css/style.css`, `index.html`

- `index.html`: Add wght 200 to Inter import
- Hero h1: `3.5rem`, wght 200, `letter-spacing: -0.03em`, `line-height: 1.1`
- Hero subtitle: uppercase, `letter-spacing: 0.04em`, wght 400, `font-size: 1.1rem`, staggered fadeInUp animation (0.3s delay)
- Hero content card: padding `3.5rem 5rem`, brighter border (0.12 opacity), add box-shadow
- Scroll hint: replace `pulse` with `bounce` (translateY 0→6px)
- Day content h3: uppercase, `0.8rem`, `letter-spacing: 0.06em`, wght 700 — becomes section labels
- Card h2: add `line-height: 1.25`

**Verify:** Screenshot hero at 1440x900. Larger title, uppercase subtitle, bouncing scroll hint.

---

## Sub-Phase 3B: Cards + Glassmorphism + Spacing

**Files:** `css/style.css`

- Card entrance: change from vertical slide to diagonal — `translateX(-20px) translateY(8px)` → `translateX(0) translateY(0)`. Use `cubic-bezier(0.16, 1, 0.3, 1)` easing (0.8s).
- Flight card glass: `rgba(12, 12, 24, 0.85)`, neutral white border, inset highlight `rgba(255,255,255,0.05)`
- Day card glass: warmer white `rgba(255, 252, 248, 0.93)`, inset highlight
- Day card h2 headings: subtle bottom border
- Chapter spacing: `margin-bottom: 35vh` (was 30vh), last child 50vh
- Card max-width: `400px` (was 420px) — more map visible
- Double-layer box-shadow on active cards

**Verify:** Scroll through a flight→day transition. Cards slide in from left, warmer day cards, more breathing room.

---

## Sub-Phase 3C: Airline Colors + City Palettes

**Files:** `css/style.css`, `js/app.js`

CSS vars:
```
--airline-tk: #e31837 (Turkish Airlines)
--airline-sq: #1a3c6e (Singapore Airlines)  
--airline-lh: #daad00 (Lufthansa)
--city-singapore: #00b894 (tropical green)
--city-seoul: #e84393 (neon pink)
```

- `renderFlightCard()`: add `data-airline` attr derived from first flight leg's flight number prefix (tk/sq/lh)
- `renderDayCard()`: add `data-city` attr from `day.meta.city`
- Flight cards: 3px left border in airline color, colored duration badges
- Day cards: 3px top border in city color, city-colored h3 headings, city-colored planned badges

**Verify:** Screenshot outbound (red border), SIN→ICN (blue border), return (gold border). Singapore day (green top), Seoul day (pink top).

---

## Sub-Phase 3D: Overview Card + Footer Stats

**Files:** `css/style.css`, `js/app.js`, `js/scroll.js`

**Overview card** (inserted after hero):
- Dark glassmorphic card, centered, max-width 480px
- Stats grid: 3 Countries · 3 Flights · 9 Days · 4 Travelers (large accent-colored numbers)
- Status summary: confirmed/planned/open counts as badges
- Date range as h2
- Add synthetic `{ type: 'overview', id: 'overview' }` to chapters array so scroll observer handles it → triggers flyToGlobe

**Footer stats:**
- Calculate total distance via haversine from all flight leg coordinates
- Format: "3 countries · 5 flights · 10 days · X,XXX km"
- Route line below: "Klagenfurt → Singapore → Seoul → Home" (muted)

**scroll.js change:** Handle `overview` id — if chapter not found in array and id is `overview`, call `onChapterChange({ type: 'overview' })`.

**Verify:** Scroll past hero → overview card with stats. Scroll to bottom → footer with km distance. Scroll back up → overview → hero, all transitions work.

---

## Implementation Order

| # | Sub-Phase | Risk | Files |
|---|-----------|------|-------|
| 1 | 3A: Typography + Hero | Low (CSS only) | style.css, index.html |
| 2 | 3B: Cards + Glass | Low (CSS only) | style.css |
| 3 | 3C: Airlines + Cities | Low (data attrs + CSS) | style.css, app.js |
| 4 | 3D: Overview + Footer | Medium (new DOM + scroll) | style.css, app.js, scroll.js |

Each sub-phase verified independently via Playwright screenshot + console check before proceeding.

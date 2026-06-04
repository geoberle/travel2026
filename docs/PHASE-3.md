# Phase 3: Visual Polish

**Status: COMPLETE**

---

## Sub-Phase 3A: Typography + Hero ✅

- [x] `index.html`: Added wght 200 to Inter import
- [x] Hero h1: `3.5rem`, wght 200, `letter-spacing: -0.03em`, `line-height: 1.1`
- [x] Hero subtitle: staggered fadeInUp animation (0.3s delay)
- [x] Hero content card: padding `3.5rem 5rem`, brighter border (0.12 opacity), box-shadow
- [x] Scroll hint: replaced `pulse` with `bounce` (translateY 0→6px)
- [x] Day content h3: uppercase, `0.8rem`, `letter-spacing: 0.06em`, wght 700
- [x] Card h2: added `line-height: 1.25`

---

## Sub-Phase 3B: Cards + Glassmorphism + Spacing ✅

- [x] Card entrance: diagonal slide `translateX(-20px) translateY(8px)` with `cubic-bezier(0.16, 1, 0.3, 1)` easing
- [x] Flight card glass: `rgba(12, 12, 24, 0.85)`, neutral white border, inset highlight
- [x] Day card glass: warmer white `rgba(255, 252, 248, 0.93)`, inset highlight
- [x] Day card h2: subtle bottom border
- [x] Chapter spacing: `margin-bottom: 35vh`, last child 50vh
- [x] Card max-width: `400px`
- [x] Double-layer box-shadow on active cards

---

## Sub-Phase 3C: Airline Colors + City Palettes ✅

- [x] CSS vars: `--airline-tk`, `--airline-sq`, `--airline-lh`, `--city-singapore`, `--city-seoul`
- [x] `renderFlightCard()`: `data-airline` attr from first flight leg prefix
- [x] `renderDayCard()`: `data-city` attr from `day.meta.city`
- [x] Flight cards: 3px left border in airline color, colored duration badges
- [x] Day cards: 3px top border in city color, city-colored h3 headings

---

## Sub-Phase 3D: Overview Card + Footer Stats ✅

- [x] Overview card after hero: dark glassmorphic, stats grid (Countries/Flights/Days/Travelers), status badges
- [x] `renderStory()` updated to accept `flightsData`, calculate stats
- [x] `scroll.js`: handles `overview` id → triggers flyToGlobe
- [x] `app.js`: overview chapter treated same as hero for map behavior
- [x] Footer stats: total distance via haversine, "3 countries · 3 flights · 9 days · X,XXX km"
- [x] Footer route line: "Klagenfurt → Singapore → Seoul → Home" (muted)
- [x] `calculateTotalDistance()` and `haversine()` functions added

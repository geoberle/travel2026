# Phase 5: Content & Media

**Goal:** Add visual richness. Stock images now, own photos after the trip.

---

## Sub-Phase 5A: POI Images in Day Cards

**Files:** `js/app.js`, `css/style.css`

POI data already has `image` URLs. Surface them when POIs are referenced inline.

- When `processPoiLinks()` matches a `[Name](poi:id)`, check if the POI has an `image` field
- Don't render images inline (too heavy for bullet lists). Instead, add a **hero image strip** at the top of each day card showing images from that day's POIs
- In `renderDayCard()`: resolve the day's `pois` array, collect image URLs, render a horizontal scrollable strip above the markdown content
- Strip: `<div class="day-images">` with `<img>` tags, `loading="lazy"`, `object-fit: cover`
- Strip scrolls horizontally on overflow, CSS `scroll-snap-type: x mandatory`
- Show max 4 images per day (first 4 POIs with valid image URLs)

**CSS:**
- `.day-images`: `display: flex`, `overflow-x: auto`, `gap: 0.5rem`, `margin: -2rem -2.25rem 1.25rem`, `scroll-snap-type: x mandatory`
- `.day-images img`: `min-width: 200px`, `height: 140px`, `object-fit: cover`, `border-radius: 8px`, `scroll-snap-align: start`, `flex-shrink: 0`
- First image full-width bleed if only 1 POI image
- Hide scrollbar: `-webkit-scrollbar: none`, `scrollbar-width: none`

---

## Sub-Phase 5B: Flight Card Hero Images

**Files:** `js/app.js`, `css/style.css`, `data/flights.json`

Add a destination image to flight cards.

- Add `image` field to each journey in `flights.json` (Unsplash URL of the destination city)
- `renderFlightCard()`: render image as a header background above the flight details
- Image has a gradient overlay fading to the card background color
- `height: 120px`, `object-fit: cover`, `border-radius: 16px 16px 0 0`

---

## Sub-Phase 5C: Hero Background Image

**Files:** `css/style.css`, `js/app.js` or `data/trip.json`

Add a subtle background image or gradient to the hero section.

- Option A: Use a Mapbox static image API snapshot as a blurred background behind the hero card
- Option B: Add an `image` field to `trip.json`, render as blurred full-viewport background behind the hero
- Option C: Skip — the globe map IS the hero background already. Adding an image might fight it.

**Recommendation:** Skip. The rotating globe with flight routes is already a strong hero visual. Adding an image risks clutter.

---

## Implementation Order

| # | Sub-Phase | Risk | Effort |
|---|-----------|------|--------|
| 1 | 5A: POI image strip | Low | ~30 lines JS + CSS |
| 2 | 5B: Flight card images | Low | ~15 lines JS + CSS, data edit |
| 3 | 5C: Hero image | Skip (globe is sufficient) | — |

## Notes

- All images external URLs (Unsplash). No files in repo.
- `loading="lazy"` on all `<img>` tags for performance.
- POI image URLs may be broken (Unsplash short-form IDs in some entries). Verify with `onerror` handler that hides broken images.
- Post-trip items (swap photos, journal entries) deferred to Phase 8.

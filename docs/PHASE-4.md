# Phase 4: Flight Animations

**Status: COMPLETE**

---

## Sub-Phase 4A: Animated Arc Drawing ✅

- [x] `animateFlightArc()` in map.js — progressively draws route line from departure to arrival
- [x] Interpolates coordinates (120 points) for smooth animation
- [x] Animated line is brighter (opacity 1) and thicker (3.5px) than static routes
- [x] Duration proportional to distance: `Math.min(4000, Math.max(2000, dist_km / 5))` ms
- [x] Cubic ease-out for natural deceleration
- [x] Animation cancels on chapter change via stored requestAnimationFrame ID

## Sub-Phase 4B: Plane Icon ✅

- [x] ✈ marker traces the arc path during animation
- [x] Rotates to face direction of travel (bearing from previous to current point)
- [x] Removed on chapter exit via `cancelFlightAnimation()`

## Sub-Phase 4C: Departure/Arrival Pulse ✅

- [x] Pulsing ring + dot at departure (appears at animation start)
- [x] Pulsing ring + dot at arrival (appears when animation completes)
- [x] CSS `@keyframes pulseRing` — ring expands from 8px to 32px, fades out, repeats
- [x] Cleaned up on chapter change

## Sub-Phase 4D: Glow Effect ✅

- [x] Duplicate route layer underneath animated line with `line-blur: 8`, `line-width: 10`, `line-opacity: 0.15`
- [x] Creates bloom/glow effect on the active flight arc
- [x] Same color (#4ecdc4) as main line

## Integration

- [x] `cancelFlightAnimation()` called on every chapter change (clears plane, pulse markers, animation frame)
- [x] Animation triggers on `map.once('moveend')` after flyTo — starts after camera settles
- [x] Replay works on scroll-back: animation resets and replays each time flight chapter enters viewport

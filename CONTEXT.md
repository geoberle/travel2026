# Domain Language

## Core Concepts

- **Trip** — A planned journey with ordered itinerary blocks (transits and stays), stored in `trip.yaml`.
- **Location** — A city or area visited during the trip. Has its own POI library in `locations/{name}/location.yaml`.
- **POI (Point of Interest)** — A place worth visiting at a location. Has coordinates, category, description, image, and optional metadata (duration, setting, reservation, neighborhood, tags). Defined in location YAML.
- **Traveler** — A person on the trip. Has a name, interests, age, color, and Google account. Defined in `travelers.yaml`.
- **Stay** — An itinerary block representing time spent at a location, with accommodation and day slots.
- **Day** — A topical slot within a stay. Ordered by position, date derived from check-in. Can be pinned to a specific date.
- **Activity** — A reference from a day to a POI, with optional notes.

## POI Metadata

- **Tags** — Interest labels on POIs drawn from a shared vocabulary with traveler interests. Enables interest matching on rating cards (matched tags highlighted subtly). Vocabulary is implicit — derived from existing POI tags and traveler interests, no separate definition file.
- **ClosedOn** — Weekday closures as array (e.g. `[monday]`). Holiday closures stay in `hours` free text.
- **Setting** — Whether a POI is `indoor`, `outdoor`, or `both`.
- **Reservation** — Whether booking is `required`, `recommended`, or `none`.
- **Duration** — Free-text time commitment (e.g. "2-3 hours", "half day").
- **Neighborhood** — Human-readable area label for spatial context (e.g. "Gangnam").

## Rating System

- **Rating** — A traveler's pre-trip interest vote on a POI. One of three tiers: `must_go`, `sure`, or `skip`.
- **Rating View** — A standalone SPA (`rating.html`) where travelers vote on POIs via a card deck interface. Uses Firebase Authentication (Google) and Firestore.
- **Card Deck** — The rating UX: one POI shown at a time with image, description, map flyTo, and three rating buttons. Continuous flow across all locations with section dividers.
- **Blind Voting** — Other travelers' ratings are hidden until you have rated the same POI yourself. Prevents groupthink.
- **Summary View** — A post-rating view showing family comparison: consensus, disagreements, and a color-coded map overlay. Accessible anytime via tab, scoped to POIs the viewer has rated.
- **Voter** — A traveler who has a Google account and is authorized to submit ratings. Voter list is derived from `travelers.yaml`.

## Views

- **Storytelling View** (`index.html`) — Scroll-driven travel narrative. Dark/cinematic for flights, light/editorial for days. Read-only, no Firebase dependency.
- **Planning View** (`planning.html` + `planning-server.js`) — AI-powered trip planning tool. Accesses ratings via Firebase Admin SDK on the server. Only accessible locally.
- **Rating View** (`rating.html`) — Family voting tool. Accessible via GitHub Pages. Uses Firebase client SDK for auth and Firestore.

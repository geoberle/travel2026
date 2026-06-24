# Trip Data Model

## Overview

A trip is an ordered sequence of **itinerary blocks** — flights and stays — stored in `trip.yaml`. Points of interest (POIs) live in separate **location files** that stays reference.

```
trips/singapore-seoul-2026/
├── trip.yaml                      # Trip metadata + itinerary (flights, stays, days)
├── travelers.yaml                   # Traveler profiles & preferences
└── locations/
    ├── singapore/location.yaml    # POI library for Singapore
    └── seoul/location.yaml        # POI library for Seoul
```

## trip.yaml

### Top-level fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Trip title |
| `subtitle` | string | Subtitle (date range, theme) |
| `travelers` | number | Headcount |
| `origin` | object | Home city: `{city, country, coordinates}` |
| `itinerary` | array | Ordered sequence of flight and stay blocks |

### Itinerary blocks

Every block has `type` (`transit` or `stay`) and a unique `id`.

#### Transit block

Represents any journey between locations — flights, trains, buses, drives.

```yaml
- type: transit
  id: outbound
  label: "Klagenfurt → Singapore"
  from: Klagenfurt
  to: Singapore
  date: "2026-07-10"
  image: "https://..."              # optional header image
  mapView:                          # optional camera position
    center: [21, 44]
    zoom: 4
    pitch: 20
  legs:                             # optional — filled when booking details known
    - mode: flight                  # explicit mode on every leg
      flight:                       # mode-specific fields nested under mode name
        number: TK1052
        airline: Turkish Airlines
        aircraft: Boeing 737-800
      departure:
        airport: LJU
        city: Ljubljana
        coordinates: [14.4576, 46.2237]
        time: "2026-07-10T13:50:00"
      arrival:
        airport: IST
        city: Istanbul
        coordinates: [28.7519, 41.2753]
        time: "2026-07-10T17:15:00"
      duration: "2h 25m"
      route: [[14.46, 46.22], ...]  # coordinate waypoints for map arc
    - mode: drive
      departure: { city: Klagenfurt, coordinates: [...], time: "..." }
      arrival: { airport: LJU, city: Ljubljana, coordinates: [...], time: "..." }
      duration: "1h 0m"
    - mode: train
      train:
        number: KTX 101
        operator: Korail
      departure: { city: Seoul, coordinates: [...], time: "..." }
      arrival: { city: Busan, coordinates: [...], time: "..." }
      duration: "2h 30m"
    - mode: bus
      bus:
        operator: Express Bus
      departure: { city: Busan, coordinates: [...], time: "..." }
      arrival: { city: Sokcho, coordinates: [...], time: "..." }
      duration: "4h 30m"
  layovers:
    - airport: IST
      city: Istanbul
      duration: "1h 55m"
  totalDuration: "15h 20m"
```

##### Leg modes

| Mode | Icon | Mode-specific fields |
|------|------|---------------------|
| `flight` | ✈ | `flight: { number, airline, aircraft }` |
| `train` | 🚄 | `train: { number, operator }` |
| `bus` | 🚌 | `bus: { operator }` |
| `drive` | 🚗 | (none) |

Every leg has `mode` set explicitly. Generic fields (`departure`, `arrival`, `duration`, `route`) are outer. Mode-specific fields nest under a subobject named after the mode.

The block's display icon is derived from the highest-priority mode in its legs: flight > train > bus > drive.

A transit block can start as a **minimal stub** (just `from` + `to`) with legs/layovers/times filled later from booking confirmations.

#### Stay block

```yaml
- type: stay
  id: singapore-stay
  location: singapore              # references locations/singapore/location.yaml
  accommodation:
    neighborhood: Robertson Quay
    type: Serviced Apartment
    config: 2-Bedroom
    coordinates: [103.8365, 1.2906]
    checkIn: "2026-07-11"
    checkOut: "2026-07-14"
    status: planned
  days:
    - title: Arrival in Singapore
      status: planned
      activities:
        - poi: changi-airport
          notes: Arrive ~11:10
        - poi: robertson-quay
          notes: Check in, settle in
      notes: Walk along Singapore River. Early night for jet lag.
    - title: Gardens & Marina Bay
      pinnedDate: "2026-07-12"     # optional — locks this day to a specific date
      status: planned
      activities:
        - poi: gardens-by-the-bay
          notes: Cloud Forest & Flower Dome
```

### Days

Days are **topical slots**, not calendar dates. Their actual date is derived from position:

```
day[0].date = accommodation.checkIn
day[1].date = accommodation.checkIn + 1 day
day[2].date = accommodation.checkIn + 2 days
...
```

This means days can be **reordered** (drag-and-drop) to rearrange the itinerary without editing dates.

#### Pinned dates

A day with `pinnedDate` is locked to that specific calendar date (e.g., a reservation, timed ticket). Pinned days:
- Cannot be reordered
- Show a lock indicator in the UI
- Must be at the position consistent with their pin (`pinnedDate - checkIn` = day index)
- Other (free) days flow around them

#### Day fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | yes | Topic/theme of the day |
| `status` | string | no | `open`, `planned`, or `confirmed` (default: `open`) |
| `pinnedDate` | string | no | ISO date that locks this day's position |
| `activities` | array | no | List of `{poi, notes}` referencing POIs from the location |
| `notes` | string | no | Free-text day notes |

### Duration rules

- **Accommodation drives duration**: `checkIn`/`checkOut` determines how many day slots exist
- **Adding a day** extends `checkOut` by 1 and appends an empty day slot
- **Removing a day** contracts `checkOut` by 1. If the day has activities, they return to the unassigned pool

## location.yaml (POI library)

Each location file is a POI collection. Stays reference locations by name to resolve POI data.

```yaml
name: Singapore
coordinates: [103.8636, 1.2816]
pois:
  - id: gardens-by-the-bay
    name: Gardens by the Bay
    coordinates: [103.8636, 1.2816]
    description: Futuristic nature park with Cloud Forest and Supertree Grove.
    category: attraction
    image: https://images.unsplash.com/photo-1506351421178-63b52a2d2562?w=800
    url: https://www.gardensbythebay.com.sg
    hours: "05:00–02:00 (outdoor), 09:00–21:00 (conservatories)"
    cost: "SGD 32/adult, SGD 18/child"
```

### POI fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Kebab-case unique identifier |
| `name` | string | yes | Display name |
| `coordinates` | [lon, lat] | yes | Map position |
| `description` | string | yes | Short description |
| `category` | string | yes | One of: `attraction`, `food`, `culture`, `shopping`, `nature`, `transport` |
| `image` | string | no | Image URL |
| `url` | string | no | Website |
| `hours` | string | no | Opening hours |
| `cost` | string | no | Pricing info |

### Category colors

| Category | Color |
|----------|-------|
| attraction | `#4ecdc4` |
| food | `#ff9f43` |
| culture | `#a55eea` |
| shopping | `#fd79a8` |
| nature | `#00b894` |
| transport | `#636e72` |

## travelers.yaml

Structured traveler profiles. Used by the AI planning agent to score POI alignment and by the rating view for voter identity.

```yaml
travelers:
  - name: Gerd
    initial: G
    color: "#4ecdc4"
    age: 45
    google_account: gerd@gmail.com
    interests: [tech, science, museums]
    notes: optional freeform notes
```

### Traveler fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Display name |
| `initial` | string | yes | Single letter for UI badges |
| `color` | string | yes | Hex color for UI |
| `age` | number | yes | Age at time of trip |
| `google_account` | string | yes | Google account email for Firebase Auth |
| `interests` | array | yes | List of interest keywords |
| `notes` | string | no | Freeform notes |

### Group fields

| Field | Type | Description |
|-------|------|-------------|
| `size` | number | Headcount |
| `composition` | string | Group makeup |
| `shared_passions` | array | Common interests |
| `travel_style` | string | Travel preferences |
| `pace` | string | Activity density preference |
| `food` | string | Food preferences |

## Relationships

```
trip.yaml
  itinerary[].type=stay
    .location ──references──> locations/{name}/location.yaml (for POIs)
    .days[].activities[].poi ──references──> location.yaml.pois[].id
```

- A stay's `location` field must match a directory under `locations/`
- Activity `poi` IDs must exist in the referenced location's POI list
- Deleting a POI cascades: removes it from all stay days that reference it
- Days are scoped to their stay — no cross-stay day moves

# manage-pois

Add, update, or remove Points of Interest and wire them into day plans.

## When to use

Trigger on: "add poi", "new poi", "add a place", "add stop", "remove poi", "update poi", "move poi to another day", or when user describes a place they want to visit.

## Context

POIs live in location YAML files, referenced by ID from trip.yaml day activities.

### File layout

```
trips/seoul-2026/
├── trip.yaml                      # Trip metadata + itinerary
├── travelers.yaml                 # Traveler profiles with interests
└── locations/
    ├── locations.yaml             # List of location directory names
    ├── seoul/location.yaml        # POI library for Seoul
    ├── busan/location.yaml
    └── fukuoka/location.yaml
```

### POI schema

```yaml
- id: gyeongbokgung                    # kebab-case, unique within location
  name: Gyeongbokgung Palace
  coordinates: [126.9771, 37.5782]      # [longitude, latitude] GeoJSON order
  description: Walk through the grand Joseon royal palace...
  category: culture                      # attraction|food|culture|shopping|nature|transport
  image: "https://images.unsplash.com/photo-...?w=800"
  url: https://example.com               # optional
  hours: "09:00–18:30, closed Tuesdays"  # optional
  cost: "3,000 KRW adult"               # optional
  closedOn: [tuesday]                    # optional — lowercase weekday names
  duration: "1.5-2 hours"               # optional — free text time commitment
  setting: outdoor                       # optional — indoor|outdoor|both
  reservation: none                      # optional — required|recommended|none
  neighborhood: Jongno                   # optional — area/district label
  tags: [history, palace, family-friendly] # optional — interest keywords
```

### Activity references in trip.yaml

```yaml
itinerary:
  - type: stay
    id: seoul-stay
    location: seoul                      # references locations/seoul/location.yaml
    days:
      - title: Palaces & Culture
        activities:
          - poi: gyeongbokgung           # references location.yaml pois[].id
            notes: Morning visit, catch guard ceremony at 10:00
```

## Rules

- `id` is kebab-case, unique within location file, auto-generated from name
- `coordinates` is `[longitude, latitude]` (GeoJSON order, NOT lat/lng)
- `image` should be an Unsplash URL with `?w=800` suffix
- `category` must be one of: `attraction`, `food`, `culture`, `shopping`, `nature`, `transport`
- `setting` must be one of: `indoor`, `outdoor`, `both`
- `reservation` must be one of: `required`, `recommended`, `none`
- `closedOn` values are lowercase full weekday names
- `tags` should be consistent with existing tags across all locations and traveler interests from `travelers.yaml`

## Procedure

### Adding a POI

1. Determine the location from user input or context
2. Read the location YAML to check for duplicate IDs
3. Ask the user for any missing fields. At minimum need: name, what it is. Look up coordinates via web search if not provided.
4. Find an Unsplash image: search `unsplash {poi name} {city}`, pick relevant photo, use `?w=800`
5. Read existing tags from all location YAMLs + traveler interests for vocabulary consistency
6. Generate the POI entry with all fields (core + metadata)
7. Append to the location's `pois` array
8. If a target day is specified: add activity reference to that day in trip.yaml
9. Show the user what was added

### Updating a POI

1. Read the location YAML
2. Find the POI by id or name (fuzzy match on name is fine)
3. Apply the requested changes
4. If `id` changes, update all activity references in trip.yaml

### Removing a POI

1. Remove from the location YAML
2. Remove from all day activities in trip.yaml that reference this POI
3. Warn the user about which days were affected

### Moving a POI between days

1. Remove the activity reference from the source day
2. Add the activity reference to the target day

## Validation

After any change, verify:
- Every POI id referenced in day activities exists in the location's YAML
- No duplicate ids within a location file
- Coordinates are valid `[lng, lat]` (lng: -180..180, lat: -90..90)
- Enum fields have valid values

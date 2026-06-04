# manage-pois

Add, update, or remove Points of Interest and wire them into day plans.

## When to use

Trigger on: "add poi", "new poi", "add a place", "add stop", "remove poi", "update poi", "move poi to another day", or when user describes a place they want to visit.

## Context

This is a travel planning app. POIs live in city JSON files, referenced by ID from day markdown files.

### File layout

```
data/pois/{city}.json    — POI definitions per city
days/day-{NN}-{slug}.md  — day plans with frontmatter + markdown
data/trip.json           — maps city names to POI files via poiFiles
```

### POI schema (in `data/pois/{city}.json`)

```json
{
  "id": "kebab-case-slug",
  "name": "Human Name",
  "coordinates": [lng, lat],
  "image": "https://images.unsplash.com/photo-...?w=800",
  "description": "One sentence. What it is, why visit.",
  "category": "attraction|food|culture|shopping|nature|transport"
}
```

Rules:
- `id` is kebab-case, unique within city file, used as reference key everywhere
- `coordinates` is `[longitude, latitude]` (GeoJSON order, NOT lat/lng)
- `image` must be an Unsplash URL with `?w=800` suffix
- `description` is one sentence, concise, may include practical tips
- `category` must be one of: `attraction`, `food`, `culture`, `shopping`, `nature`, `transport`

### Day frontmatter POI references

```yaml
pois: ["poi-id-1", "poi-id-2"]
```

Array of POI IDs from the city's POI file. Only POIs listed here get markers on the map for that day.

### Day markdown POI links

```md
[Display Name](poi:poi-id)
```

Inline links in the day content. The `poi:` prefix is a custom scheme resolved by the app.

## Procedure

### Adding a POI

1. Determine the city from user input or day file context
2. Look up the city's POI file via `data/trip.json` → `poiFiles`
3. Read the existing POI file to check for duplicates and understand naming conventions
4. **Ask the user** for any missing fields. At minimum need: name, what it is. Look up coordinates yourself via web search if not provided.
5. Find an appropriate Unsplash image URL via web search: search `unsplash {poi name} {city}`, pick a relevant landscape/exterior photo, use `?w=800`
6. Generate the POI entry with all fields
7. Append to the city's `pois` array (maintain alphabetical order by id)
8. If a target day is specified or obvious from context:
   - Add the POI id to that day's frontmatter `pois` array
   - Add a `[Name](poi:id)` link in the appropriate section of the day's markdown
9. Show the user what was added and where

### Updating a POI

1. Read the city POI file
2. Find the POI by id or name (fuzzy match on name is fine)
3. Apply the requested changes
4. If `id` changes, update all references in day files (frontmatter `pois` array + markdown links)

### Removing a POI

1. Remove from the city POI file
2. Remove from all day frontmatter `pois` arrays
3. Remove or replace `[...](poi:id)` links in day markdown — replace with plain text name
4. Warn the user about which days were affected

### Moving a POI to a different day

1. Remove the POI id from the source day's frontmatter `pois` array
2. Remove the `[...](poi:id)` link from the source day's markdown
3. Add the POI id to the target day's frontmatter `pois` array
4. Add a `[Name](poi:id)` link in the appropriate section of the target day's markdown

## Validation

After any change, verify:
- Every POI id referenced in day frontmatter exists in the city's POI file
- Every `poi:` link in day markdown has a matching frontmatter entry
- No duplicate ids in POI files
- Coordinates are valid `[lng, lat]` (lng: -180..180, lat: -90..90)

## Examples

User: "add Gwangjang Market to the Seoul trip, it's a traditional market with street food"
→ Create POI in `data/pois/seoul.json`, ask which day to add it to

User: "add a temple near Bukchon to day 6"
→ Ask for the temple name, look up coordinates, create POI, wire into day-06

User: "move Lotte World from day 8 to day 9"
→ Update both day files' frontmatter and markdown

User: "remove the zoo from Singapore"
→ Remove from `data/pois/singapore.json`, clean up any day references

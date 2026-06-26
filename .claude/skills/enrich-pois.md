# enrich-pois

Enrich POIs with metadata and better descriptions using web research.

## When to use

Trigger on: "enrich pois", "fill poi metadata", "enrich location", "enrich {city}"

## Context

POIs live in `trips/seoul-2026/locations/{city}/location.yaml`. Each POI has core fields (id, name, coordinates, description, category) and optional metadata fields that may be empty.

Traveler interests live in `trips/seoul-2026/travelers.yaml` under each traveler's `interests` array. Tags on POIs share vocabulary with these interests.

## POI fields to enrich

| Field | Type | Guidance |
|-------|------|----------|
| `description` | string | Rewrite to answer "what do you DO here". Action-oriented, 2-3 sentences max. |
| `duration` | string | Time commitment: "30 min", "1-2 hours", "half day" |
| `setting` | enum | `indoor`, `outdoor`, or `both` |
| `reservation` | enum | `required`, `recommended`, or `none` |
| `neighborhood` | string | Area/district label: "Gangnam", "Hakata", "Marina Bay" |
| `tags` | array | Interest keywords from shared vocabulary (see below) |
| `closedOn` | array | Lowercase weekday names: `[monday]`, `[sunday, monday]` |
| `hours` | string | Opening hours if missing |
| `cost` | string | Pricing info if missing |
| `url` | string | Official website if missing |

## Procedure

1. Read the target location YAML (or all locations under `trips/seoul-2026/locations/` if unspecified)
2. Read `trips/seoul-2026/travelers.yaml` to get traveler interest keywords
3. Collect existing tags from ALL location YAMLs to build current vocabulary
4. For each POI with missing metadata fields:
   a. Use web search to gather current info (hours, cost, closed days, booking requirements)
   b. Fill missing fields only — never overwrite existing values
   c. Rewrite `description` only if it's a single generic sentence that doesn't answer "what do you DO here"
   d. Assign tags from existing vocabulary + traveler interests. Add new tags sparingly and consistently.
5. Write updated YAML back to same file
6. Show summary: which POIs were enriched, which fields were filled

## Rules

- **Preserve existing values** — only fill fields that are missing or empty
- **Tags vocabulary**: collect from all existing POI tags + traveler interests. Stay consistent. Don't invent synonyms for existing tags.
- **Description rewrites**: keep concise. Focus on activities and sensory details, not Wikipedia summaries. "Walk through 900 traditional houses between two palaces, snap rooftop photos toward N Seoul Tower" beats "Traditional Korean village with historic houses."
- **Validate enums**: `setting` must be indoor/outdoor/both. `reservation` must be required/recommended/none.
- **closedOn**: lowercase full weekday names only (monday, tuesday, wednesday, thursday, friday, saturday, sunday). Extract from `hours` text or web research.
- **Process one location at a time** to keep web searches focused
- **Don't add `closedOn` if the POI is open every day** — omit the field or use empty array

## Example enriched POI

```yaml
- id: gyeongbokgung
  name: Gyeongbokgung Palace
  coordinates: [126.9771, 37.5782]
  description: Walk through the grand Joseon royal palace, watch the changing of the guard ceremony, and wear hanbok for free entry and photo ops.
  category: culture
  image: "https://images.unsplash.com/photo-1566800890932-e89159daf3dc?w=800"
  url: https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=87740
  hours: "09:00–18:30 (Jun–Aug), closed Tuesdays"
  cost: "3,000 KRW adult, free in hanbok or under 7"
  closedOn: [tuesday]
  duration: "1.5-2 hours"
  setting: outdoor
  reservation: none
  neighborhood: Jongno
  tags: [history, palace, hanbok, photography, family-friendly]
```

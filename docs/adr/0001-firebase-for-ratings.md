# ADR 0001: Firebase Firestore for Rating Storage

## Status

Accepted

## Context

The rating view needs a writable backend accessible from GitHub Pages (static hosting). Family members access the SPA from iPads — no server is available to them. The planning server runs locally on the developer's machine only.

## Decision

Use a dedicated Firebase project with:

- **Firebase Authentication** (Google provider) for voter identity
- **Firestore** for rating storage
- **Firestore security rules** as the authorization boundary (allowlisted Google accounts)
- **Firebase client SDK** in `rating.html` only
- **Firebase Admin SDK** in `planning-server.js` for server-side rating access

### Data model

Scoped by trip to prevent collisions across trips. One Firestore document per POI in a trip-scoped subcollection:

```
ratings/{tripId}/{poiId}
  location: "seoul"
  votes:
    gerd@gmail.com: "must_go"
    kid1@gmail.com: "sure"
    kid2@gmail.com: "skip"
  updatedAt: timestamp
```

`tripId` is derived from the trip directory name (e.g., `seoul-2026`). This ensures two trips visiting the same city with overlapping POI IDs don't collide.

### Security rules

```
match /ratings/{tripId}/pois/{poiId} {
  allow read: if request.auth != null;
  allow write: if request.auth.token.email in [<emails from travelers.yaml>];
}
```

A tooling script reads `travelers.yaml` and deploys security rules to keep the voter allowlist in sync.

## Consequences

- Firebase client config is committed to the public repo. This is safe — Firebase client keys are project identifiers, not secrets. Firestore rules are the security boundary.
- Firebase Admin SDK service account key stays local, never committed.
- YAML remains the source of truth for POI content. Firestore stores only votes. New POIs added to YAML appear as unrated on next page load.
- **Concurrency caveat**: The one-doc-per-POI model means concurrent writes to the same document require merge semantics. With 3 voters this is not a practical concern, but the model would not scale to many concurrent voters writing to the same POI document. If voter count grows significantly, switch to one-doc-per-vote (`{voterId}_{poiId}`) and aggregate client-side.

## Alternatives Considered

- **Realtime Database** — Simpler but weaker querying. Firestore's `where` clauses are cleaner for location-scoped queries.
- **One doc per vote** — More documents, more reads, but zero write contention. Rejected for current scale (3 voters, ~50 POIs) where contention is non-existent.
- **Cloud Functions for aggregation** — Unnecessary overhead. 3 voters, trivial client-side math.

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const tripName = process.argv[2] || 'singapore-seoul-2026';
const TRIP_DIR = path.join(__dirname, '..', 'trips', tripName);
const BACKUP_DIR = path.join(__dirname, '..', 'backups', 'pre-itinerary-migration');

const tripFile = path.join(TRIP_DIR, 'trip.yaml');
const trip = yaml.load(fs.readFileSync(tripFile, 'utf8'));

if (trip.itinerary) {
  console.log('Already migrated (trip.yaml has itinerary[]). Exiting.');
  process.exit(0);
}

const locationNames = trip.locations || [];
const locations = {};
locationNames.forEach(name => {
  const file = path.join(TRIP_DIR, 'locations', name, 'location.yaml');
  locations[name] = yaml.load(fs.readFileSync(file, 'utf8'));
});

// --- Build itinerary ---

const itinerary = [];
const transportByDate = new Map();
(trip.transport || []).forEach(t => {
  transportByDate.set(String(t.date), t);
});

const allBlocks = [];

(trip.transport || []).forEach(t => {
  allBlocks.push({
    sortDate: String(t.date),
    sortOrder: 0,
    block: {
      type: 'flight',
      id: t.id,
      label: t.label,
      from: t.legs[0]?.departure?.city || '',
      to: t.legs[t.legs.length - 1]?.arrival?.city || '',
      date: String(t.date),
      image: t.image || '',
      mapView: t.mapView || null,
      legs: t.legs,
      layovers: t.layovers || [],
      totalDuration: t.totalDuration || ''
    }
  });
});

locationNames.forEach(name => {
  const loc = locations[name];
  const acc = (loc.accommodations || [])[0];

  const days = (loc.days || []).map(day => {
    const d = { title: day.title || '' };
    if (day.status) d.status = day.status;
    if (day.activities && day.activities.length > 0) d.activities = day.activities;
    if (day.notes) d.notes = day.notes;
    return d;
  });

  const accommodation = acc
    ? {
        neighborhood: acc.neighborhood || '',
        type: acc.type || '',
        config: acc.config || '',
        coordinates: acc.coordinates || loc.coordinates,
        checkIn: String(acc.checkIn),
        checkOut: String(acc.checkOut),
        status: acc.status || 'planned'
      }
    : {
        neighborhood: '',
        type: '',
        config: '',
        coordinates: loc.coordinates,
        checkIn: String(loc.dates?.from || ''),
        checkOut: String(loc.dates?.to || ''),
        status: 'open'
      };

  allBlocks.push({
    sortDate: accommodation.checkIn,
    sortOrder: 1,
    block: {
      type: 'stay',
      id: `${name}-stay`,
      location: name,
      accommodation,
      days
    }
  });
});

allBlocks.sort((a, b) => {
  const cmp = a.sortDate.localeCompare(b.sortDate);
  return cmp !== 0 ? cmp : a.sortOrder - b.sortOrder;
});

allBlocks.forEach(b => itinerary.push(b.block));

// --- Build new trip.yaml ---

const newTrip = {
  title: trip.title,
  subtitle: trip.subtitle,
  origin: trip.origin,
  travelers: trip.travelers,
  itinerary
};

// --- Build new location.yaml files (POI-only) ---

const newLocations = {};
locationNames.forEach(name => {
  const loc = locations[name];
  newLocations[name] = {
    name: loc.name,
    coordinates: loc.coordinates,
    pois: loc.pois || []
  };
});

// --- Create backups ---

fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.copyFileSync(tripFile, path.join(BACKUP_DIR, 'trip.yaml'));
locationNames.forEach(name => {
  const src = path.join(TRIP_DIR, 'locations', name, 'location.yaml');
  const dest = path.join(BACKUP_DIR, `${name}-location.yaml`);
  fs.copyFileSync(src, dest);
});
console.log(`Backups saved to ${BACKUP_DIR}`);

// --- Write new files ---

const yamlOpts = { lineWidth: -1, noRefs: true, quotingType: '"' };

fs.writeFileSync(tripFile, yaml.dump(newTrip, yamlOpts));
console.log(`Wrote ${tripFile}`);

locationNames.forEach(name => {
  const file = path.join(TRIP_DIR, 'locations', name, 'location.yaml');
  fs.writeFileSync(file, yaml.dump(newLocations[name], yamlOpts));
  console.log(`Wrote ${file}`);
});

console.log('\nMigration complete.');
console.log(`Itinerary: ${itinerary.length} blocks (${itinerary.filter(b => b.type === 'flight').length} flights, ${itinerary.filter(b => b.type === 'stay').length} stays)`);

const TRIP_DIR = 'trips/singapore-seoul-2026';

const TripStore = {
  _trip: null,
  _locations: {},
  _allPois: {},

  get trip() { return this._trip; },
  get locations() { return this._locations; },
  get allPois() { return this._allPois; },

  async loadStatic() {
    const bust = Date.now();
    const tripYaml = await fetch(`${TRIP_DIR}/trip.yaml?v=${bust}`).then(r => r.text());
    this._trip = jsyaml.load(tripYaml);

    const locationNames = this._trip.locations || [];
    const locationResults = await Promise.all(
      locationNames.map(name =>
        fetch(`${TRIP_DIR}/locations/${name}/location.yaml?v=${bust}`)
          .then(r => r.text())
          .then(text => ({ name, data: jsyaml.load(text) }))
      )
    );

    this._locations = {};
    this._allPois = {};
    locationResults.forEach(({ name, data }) => {
      this._locations[name] = data;
      (data.pois || []).forEach(poi => {
        this._allPois[poi.id] = { ...poi, _location: name };
      });
    });
  },

  async loadApi() {
    const [trip, locations] = await Promise.all([
      fetch('/api/trip').then(r => r.json()),
      fetch('/api/locations').then(r => r.json())
    ]);

    this._trip = trip;
    this._locations = {};
    this._allPois = {};
    Object.entries(locations).forEach(([name, data]) => {
      this._locations[name] = data;
      (data.pois || []).forEach(poi => {
        this._allPois[poi.id] = { ...poi, _location: name };
      });
    });
  },

  getChapters() {
    const chapters = [];

    (this._trip.transport || []).forEach(j => {
      chapters.push({
        type: 'flight',
        date: String(j.date),
        journey: j,
        id: `flight-${j.id}`
      });
    });

    Object.entries(this._locations).forEach(([locName, loc]) => {
      (loc.days || []).forEach(day => {
        const poiIds = (day.activities || []).map(a => a.poi);
        const uniquePoiIds = [...new Set(poiIds)];
        chapters.push({
          type: 'day',
          date: String(day.date),
          day: {
            meta: {
              date: String(day.date),
              city: locName,
              title: day.title,
              status: day.status || 'open',
              pois: uniquePoiIds
            },
            activities: day.activities || [],
            notes: day.notes || ''
          },
          id: `day-${day.date}`
        });
      });
    });

    chapters.sort((a, b) => {
      if (a.date === b.date) return a.type === 'flight' ? -1 : 1;
      return a.date.localeCompare(b.date);
    });

    return chapters;
  },

  getAccommodations() {
    const all = [];
    Object.entries(this._locations).forEach(([locName, loc]) => {
      (loc.accommodations || []).forEach(acc => {
        all.push({ ...acc, city: loc.name || locName });
      });
    });
    return all;
  },

  getTransport() {
    return this._trip.transport || [];
  },

  resolvePois(poiIds) {
    if (!Array.isArray(poiIds)) return [];
    return poiIds.map(id => this._allPois[id]).filter(Boolean);
  },

  getDates() {
    const start = this._trip.transport?.[0]?.date;
    const last = this._trip.transport?.[this._trip.transport.length - 1];
    const end = last?.date;
    return { start: String(start), end: String(end) };
  },

  getLocationPois(locationName) {
    const loc = this._locations[locationName];
    return loc ? (loc.pois || []) : [];
  },

  getLocationDays(locationName) {
    const loc = this._locations[locationName];
    return loc ? (loc.days || []) : [];
  },

  async addPoi(locationName, poi) {
    poi.id = poi.id || poi.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
    if (this._allPois[poi.id]) return;

    const loc = this._locations[locationName];
    if (!loc) return;

    loc.pois.push(poi);
    this._allPois[poi.id] = { ...poi, _location: locationName };

    await fetch(`/api/locations/${locationName}/pois`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(poi)
    });
  },

  async deletePoi(locationName, poiId) {
    const loc = this._locations[locationName];
    if (!loc) return;

    loc.pois = loc.pois.filter(p => p.id !== poiId);
    loc.days.forEach(day => {
      day.activities = (day.activities || []).filter(a => a.poi !== poiId);
    });
    delete this._allPois[poiId];

    await fetch(`/api/locations/${locationName}/pois/${poiId}`, { method: 'DELETE' });
  },

  async updateDayActivities(locationName, date, activities) {
    const loc = this._locations[locationName];
    if (!loc) return;

    const day = loc.days.find(d => String(d.date) === String(date));
    if (!day) return;

    day.activities = activities;

    await fetch(`/api/locations/${locationName}/days/${date}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activities })
    });
  },

  async assignPoiToDay(locationName, date, poiId, notes) {
    const loc = this._locations[locationName];
    if (!loc) return;

    const day = loc.days.find(d => String(d.date) === String(date));
    if (!day) return;

    if (!day.activities) day.activities = [];
    day.activities.push({ poi: poiId, notes: notes || '' });

    await fetch(`/api/locations/${locationName}/days/${date}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activities: day.activities })
    });
  },

  async unassignPoiFromDay(locationName, date, poiId) {
    const loc = this._locations[locationName];
    if (!loc) return;

    const day = loc.days.find(d => String(d.date) === String(date));
    if (!day || !day.activities) return;

    day.activities = day.activities.filter(a => a.poi !== poiId);

    await fetch(`/api/locations/${locationName}/days/${date}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activities: day.activities })
    });
  },

  findLocationForPoi(poiId) {
    const poi = this._allPois[poiId];
    return poi ? poi._location : null;
  }
};

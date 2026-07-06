const TRIP_DIR = 'trips/seoul-2026';

const MODE_PRIORITY = { flight: 0, train: 1, bus: 2, drive: 3 };
const MODE_ICONS = { flight: '✈', train: '🚄', bus: '🚌', drive: '🚗' };

function getTransitMode(journey) {
  let best = 'drive';
  for (const leg of (journey.legs || [])) {
    const mode = leg.mode || 'drive';
    if ((MODE_PRIORITY[mode] ?? 99) < (MODE_PRIORITY[best] ?? 99)) best = mode;
  }
  return best;
}

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

    let allLocations;
    try {
      const resp = await fetch(`/api/locations?v=${bust}`);
      if (resp.ok) {
        allLocations = await resp.json();
      }
    } catch {}

    if (!allLocations) {
      const locationNames = this._uniqueLocationNames();
      allLocations = {};
      const results = await Promise.all(
        locationNames.map(name =>
          fetch(`${TRIP_DIR}/locations/${name}/location.yaml?v=${bust}`)
            .then(r => r.text())
            .then(text => ({ name, data: jsyaml.load(text) }))
        )
      );
      results.forEach(({ name, data }) => { allLocations[name] = data; });
    }

    this._locations = {};
    this._allPois = {};
    Object.entries(allLocations).forEach(([name, data]) => {
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

  _uniqueLocationNames() {
    return [...new Set(
      (this._trip.itinerary || [])
        .filter(b => b.type === 'stay')
        .map(b => b.location)
    )];
  },

  getChapters() {
    const chapters = [];

    (this._trip.itinerary || []).forEach(block => {
      if (block.type === 'transit') {
        chapters.push({
          type: 'transit',
          date: String(block.date),
          journey: block,
          id: `transit-${block.id}`
        });
      } else if (block.type === 'stay') {
        const checkIn = new Date(block.accommodation.checkIn + 'T00:00:00');
        const accCoords = block.accommodation?.coordinates;

        (block.days || []).forEach((day, idx) => {
          const dayDate = new Date(checkIn.getTime() + idx * 86400000);
          const dateStr = `${dayDate.getFullYear()}-${String(dayDate.getMonth()+1).padStart(2,'0')}-${String(dayDate.getDate()).padStart(2,'0')}`;

          const poiIds = (day.activities || []).map(a => a.poi);
          const uniquePoiIds = [...new Set(poiIds)];

          chapters.push({
            type: 'day',
            date: dateStr,
            day: {
              meta: {
                date: dateStr,
                city: block.location,
                title: day.title,
                status: day.status || 'open',
                pois: uniquePoiIds,
                coordinates: accCoords
              },
              activities: day.activities || [],
              notes: day.notes || ''
            },
            id: `day-${block.id}-${idx}`
          });
        });
      }
    });

    return chapters;
  },

  getAccommodations() {
    return (this._trip.itinerary || [])
      .filter(b => b.type === 'stay')
      .map(b => ({
        ...b.accommodation,
        city: this._locations[b.location]?.name || b.location
      }));
  },

  getTransport() {
    return (this._trip.itinerary || []).filter(b => b.type === 'transit');
  },

  getDates() {
    const flights = this.getTransport();
    return {
      start: String(flights[0]?.date),
      end: String(flights[flights.length - 1]?.date)
    };
  },

  resolvePois(poiIds) {
    if (!Array.isArray(poiIds)) return [];
    return poiIds.map(id => this._allPois[id]).filter(Boolean);
  },

  getItinerary() {
    return this._trip.itinerary || [];
  },

  getStay(stayId) {
    return (this._trip.itinerary || []).find(b => b.type === 'stay' && b.id === stayId);
  },

  getLocationForStay(stayId) {
    const stay = this.getStay(stayId);
    return stay ? stay.location : null;
  },

  getLocationPois(locationName) {
    const loc = this._locations[locationName];
    return loc ? (loc.pois || []) : [];
  },

  async addPoi(locationName, poi) {
    poi.id = poi.id || poi.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
    if (this._allPois[poi.id]) return;

    const loc = this._locations[locationName];
    if (!loc) return;

    if (!loc.pois) loc.pois = [];
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

    loc.pois = (loc.pois || []).filter(p => p.id !== poiId);
    delete this._allPois[poiId];

    (this._trip.itinerary || [])
      .filter(b => b.type === 'stay' && b.location === locationName)
      .forEach(stay => {
        (stay.days || []).forEach(day => {
          day.activities = (day.activities || []).filter(a => a.poi !== poiId);
        });
      });

    await fetch(`/api/locations/${locationName}/pois/${poiId}`, { method: 'DELETE' });
  },

  async assignPoiToDay(stayId, dayIndex, poiId, notes) {
    const stay = this.getStay(stayId);
    if (!stay || !stay.days[dayIndex]) return;

    const day = stay.days[dayIndex];
    if (!day.activities) day.activities = [];
    day.activities.push({ poi: poiId, notes: notes || '' });

    await fetch(`/api/itinerary/${stayId}/days/${dayIndex}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activities: day.activities })
    });
  },

  async unassignPoiFromDay(stayId, dayIndex, poiId) {
    const stay = this.getStay(stayId);
    if (!stay || !stay.days[dayIndex]) return;

    const day = stay.days[dayIndex];
    day.activities = (day.activities || []).filter(a => a.poi !== poiId);

    await fetch(`/api/itinerary/${stayId}/days/${dayIndex}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activities: day.activities })
    });
  },

  async updateDay(stayId, dayIndex, patch) {
    const stay = this.getStay(stayId);
    if (!stay || !stay.days[dayIndex]) return;

    Object.assign(stay.days[dayIndex], patch);

    await fetch(`/api/itinerary/${stayId}/days/${dayIndex}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
  },

  async addDayToStay(stayId) {
    const stay = this.getStay(stayId);
    if (!stay) return;

    const resp = await fetch(`/api/itinerary/${stayId}/days`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const result = await resp.json();
    if (result.ok) {
      stay.days.push({ title: '', status: 'open', activities: [] });
      stay.accommodation.checkOut = result.checkOut;
    }
  },

  async removeDayFromStay(stayId, dayIndex) {
    const stay = this.getStay(stayId);
    if (!stay || !stay.days[dayIndex]) return;

    const resp = await fetch(`/api/itinerary/${stayId}/days/${dayIndex}`, {
      method: 'DELETE'
    });
    const result = await resp.json();
    if (result.ok) {
      stay.days.splice(dayIndex, 1);
      stay.accommodation.checkOut = result.checkOut;
    }
  },

  async reorderDays(stayId, newOrder) {
    const stay = this.getStay(stayId);
    if (!stay) return;

    await fetch(`/api/itinerary/${stayId}/days/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: newOrder })
    });

    const reordered = newOrder.map(i => stay.days[i]);
    stay.days = reordered;
  },

  async addBlock(position, block) {
    const resp = await fetch('/api/itinerary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block, position })
    });
    const result = await resp.json();
    if (result.ok) {
      this._trip.itinerary.splice(position, 0, result.block);
    }
  },

  async updateBlock(blockId, patch) {
    await fetch(`/api/itinerary/${blockId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    const block = (this._trip.itinerary || []).find(b => b.id === blockId);
    if (block) Object.assign(block, patch);
  },

  async deleteBlock(blockId) {
    await fetch(`/api/itinerary/${blockId}`, { method: 'DELETE' });
    this._trip.itinerary = (this._trip.itinerary || []).filter(b => b.id !== blockId);
  },

  researchLocations() {
    const linked = new Set(this._uniqueLocationNames());
    return Object.entries(this._locations)
      .filter(([name]) => !linked.has(name))
      .map(([key, data]) => ({ _key: key, ...data }));
  },

  findLocationForPoi(poiId) {
    const poi = this._allPois[poiId];
    return poi ? poi._location : null;
  }
};

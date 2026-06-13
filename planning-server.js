const express = require('express');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { VertexAI } = require('@google-cloud/vertexai');

const app = express();
const PORT = 3001;
const TRIP_DIR = path.join(__dirname, 'trips', 'seoul-2026');

app.use(express.json());
app.use(express.static(__dirname, { etag: false, lastModified: false, setHeaders: (res) => res.setHeader('Cache-Control', 'no-store') }));

const VERTEX_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.CLOUD_ML_PROJECT_ID;
const VERTEX_REGION = process.env.GOOGLE_CLOUD_REGION || process.env.CLOUD_ML_REGION || 'us-central1';
const AI_MODEL = process.env.AI_MODEL || 'gemini-2.5-flash';

if (!VERTEX_PROJECT) {
  console.error('GOOGLE_CLOUD_PROJECT env var required');
  process.exit(1);
}

const vertexAI = new VertexAI({ project: VERTEX_PROJECT, location: VERTEX_REGION });

const YAML_OPTS = { lineWidth: -1, noRefs: true, quotingType: '"' };

// --- YAML I/O ---

function readTripYaml() {
  return yaml.load(fs.readFileSync(path.join(TRIP_DIR, 'trip.yaml'), 'utf8'));
}

function writeTripYaml(data) {
  fs.writeFileSync(path.join(TRIP_DIR, 'trip.yaml'), yaml.dump(data, YAML_OPTS));
}

function readLocationYaml(name) {
  const file = path.join(TRIP_DIR, 'locations', name, 'location.yaml');
  if (!fs.existsSync(file)) return null;
  return yaml.load(fs.readFileSync(file, 'utf8'));
}

function writeLocationYaml(name, data) {
  const dir = path.join(TRIP_DIR, 'locations', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'location.yaml'), yaml.dump(data, YAML_OPTS));
}

function findBlock(trip, blockId) {
  return (trip.itinerary || []).find(b => b.id === blockId);
}

function uniqueLocationNames(trip) {
  return [...new Set(
    (trip.itinerary || []).filter(b => b.type === 'stay').map(b => b.location)
  )];
}

function addOneDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function subtractOneDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// --- Trip endpoint ---

app.get('/api/trip', (req, res) => {
  res.json(readTripYaml());
});

// --- Locations endpoints (POI libraries) ---

app.get('/api/locations', (req, res) => {
  const trip = readTripYaml();
  const locations = {};
  uniqueLocationNames(trip).forEach(name => {
    const data = readLocationYaml(name);
    if (data) locations[name] = data;
  });
  res.json(locations);
});

app.get('/api/locations/:name', (req, res) => {
  const data = readLocationYaml(req.params.name);
  if (!data) return res.status(404).json({ error: 'Location not found' });
  res.json(data);
});

app.get('/api/locations/:name/pois', (req, res) => {
  const loc = readLocationYaml(req.params.name);
  if (!loc) return res.status(404).json({ error: 'Location not found' });
  res.json(loc.pois || []);
});

app.post('/api/locations/:name/pois', (req, res) => {
  const loc = readLocationYaml(req.params.name);
  if (!loc) return res.status(404).json({ error: 'Location not found' });

  const poi = req.body;
  if (!poi.id) poi.id = poi.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  if (!loc.pois) loc.pois = [];

  if (loc.pois.some(p => p.id === poi.id)) {
    return res.status(409).json({ error: 'POI already exists' });
  }

  loc.pois.push(poi);
  writeLocationYaml(req.params.name, loc);
  res.json({ ok: true, poi });
});

app.delete('/api/locations/:name/pois/:poiId', (req, res) => {
  const loc = readLocationYaml(req.params.name);
  if (!loc) return res.status(404).json({ error: 'Location not found' });

  loc.pois = (loc.pois || []).filter(p => p.id !== req.params.poiId);
  writeLocationYaml(req.params.name, loc);

  const trip = readTripYaml();
  let tripChanged = false;
  (trip.itinerary || [])
    .filter(b => b.type === 'stay' && b.location === req.params.name)
    .forEach(stay => {
      (stay.days || []).forEach(day => {
        const before = (day.activities || []).length;
        day.activities = (day.activities || []).filter(a => a.poi !== req.params.poiId);
        if (day.activities.length !== before) tripChanged = true;
      });
    });
  if (tripChanged) writeTripYaml(trip);

  res.json({ ok: true });
});

// --- Itinerary endpoints ---

app.get('/api/itinerary', (req, res) => {
  const trip = readTripYaml();
  res.json(trip.itinerary || []);
});

app.get('/api/itinerary/:blockId', (req, res) => {
  const trip = readTripYaml();
  const block = findBlock(trip, req.params.blockId);
  if (!block) return res.status(404).json({ error: 'Block not found' });
  res.json(block);
});

app.post('/api/itinerary', (req, res) => {
  const trip = readTripYaml();
  const { block, position } = req.body;

  if (!block || !block.type) return res.status(400).json({ error: 'block.type required' });
  if (!block.id) block.id = `${block.type}-${Date.now()}`;

  if (block.type === 'stay') {
    const checkIn = block.accommodation?.checkIn;
    const checkOut = block.accommodation?.checkOut;
    if (checkIn && checkOut && (!block.days || block.days.length === 0)) {
      const days = [];
      const start = new Date(checkIn + 'T00:00:00');
      const end = new Date(checkOut + 'T00:00:00');
      const count = Math.round((end - start) / 86400000);
      for (let i = 0; i < count; i++) {
        days.push({ title: '', status: 'open', activities: [] });
      }
      block.days = days;
    }

    if (block.location) {
      const loc = readLocationYaml(block.location);
      if (!loc) {
        writeLocationYaml(block.location, {
          name: block.location.charAt(0).toUpperCase() + block.location.slice(1),
          coordinates: block.accommodation?.coordinates || [0, 0],
          pois: []
        });
      }
    }
  }

  const idx = typeof position === 'number' ? position : trip.itinerary.length;
  trip.itinerary.splice(idx, 0, block);
  writeTripYaml(trip);
  res.json({ ok: true, block });
});

app.put('/api/itinerary/:blockId', (req, res) => {
  const trip = readTripYaml();
  const block = findBlock(trip, req.params.blockId);
  if (!block) return res.status(404).json({ error: 'Block not found' });

  Object.assign(block, req.body);
  writeTripYaml(trip);
  res.json({ ok: true });
});

app.delete('/api/itinerary/:blockId', (req, res) => {
  const trip = readTripYaml();
  const idx = (trip.itinerary || []).findIndex(b => b.id === req.params.blockId);
  if (idx === -1) return res.status(404).json({ error: 'Block not found' });

  trip.itinerary.splice(idx, 1);
  writeTripYaml(trip);
  res.json({ ok: true });
});

// --- Day endpoints (within stay blocks) ---

app.post('/api/itinerary/:stayId/days', (req, res) => {
  const trip = readTripYaml();
  const stay = findBlock(trip, req.params.stayId);
  if (!stay || stay.type !== 'stay') return res.status(404).json({ error: 'Stay not found' });

  if (!stay.days) stay.days = [];
  stay.days.push({ title: req.body.title || '', status: 'open', activities: [] });
  stay.accommodation.checkOut = addOneDay(stay.accommodation.checkOut);

  writeTripYaml(trip);
  res.json({ ok: true, checkOut: stay.accommodation.checkOut });
});

app.delete('/api/itinerary/:stayId/days/:dayIndex', (req, res) => {
  const trip = readTripYaml();
  const stay = findBlock(trip, req.params.stayId);
  if (!stay || stay.type !== 'stay') return res.status(404).json({ error: 'Stay not found' });

  const idx = parseInt(req.params.dayIndex);
  if (!stay.days || idx < 0 || idx >= stay.days.length) {
    return res.status(404).json({ error: 'Day not found' });
  }

  stay.days.splice(idx, 1);
  stay.accommodation.checkOut = subtractOneDay(stay.accommodation.checkOut);

  writeTripYaml(trip);
  res.json({ ok: true, checkOut: stay.accommodation.checkOut });
});

app.put('/api/itinerary/:stayId/days/:dayIndex', (req, res) => {
  const trip = readTripYaml();
  const stay = findBlock(trip, req.params.stayId);
  if (!stay || stay.type !== 'stay') return res.status(404).json({ error: 'Stay not found' });

  const idx = parseInt(req.params.dayIndex);
  if (!stay.days || idx < 0 || idx >= stay.days.length) {
    return res.status(404).json({ error: 'Day not found' });
  }

  const day = stay.days[idx];
  if (req.body.activities !== undefined) day.activities = req.body.activities;
  if (req.body.notes !== undefined) day.notes = req.body.notes;
  if (req.body.title !== undefined) day.title = req.body.title;
  if (req.body.status !== undefined) day.status = req.body.status;
  if (req.body.pinnedDate !== undefined) day.pinnedDate = req.body.pinnedDate;

  writeTripYaml(trip);
  res.json({ ok: true });
});

app.put('/api/itinerary/:stayId/days/reorder', (req, res) => {
  const trip = readTripYaml();
  const stay = findBlock(trip, req.params.stayId);
  if (!stay || stay.type !== 'stay') return res.status(404).json({ error: 'Stay not found' });

  const { order } = req.body;
  if (!Array.isArray(order) || order.length !== (stay.days || []).length) {
    return res.status(400).json({ error: 'order must be array of all day indexes' });
  }

  const checkIn = new Date(stay.accommodation.checkIn + 'T00:00:00');
  for (const newIdx of order) {
    const day = stay.days[newIdx];
    if (day?.pinnedDate) {
      const expectedIdx = order.indexOf(newIdx);
      const expectedDate = new Date(checkIn.getTime() + expectedIdx * 86400000);
      const expectedStr = expectedDate.toISOString().split('T')[0];
      if (day.pinnedDate !== expectedStr) {
        return res.status(400).json({
          error: `Pinned day "${day.title}" must stay at ${day.pinnedDate}`
        });
      }
    }
  }

  stay.days = order.map(i => stay.days[i]);
  writeTripYaml(trip);
  res.json({ ok: true });
});

// --- Agent: tool definitions ---

const TOOL_DECLARATIONS = [
  {
    name: 'get_trip',
    description: 'Get trip metadata including origin and travelers',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'get_itinerary',
    description: 'Get the full trip itinerary as ordered blocks (flights and stays)',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'get_stay',
    description: 'Get a stay block with accommodation details and day count',
    parameters: {
      type: 'object',
      properties: { stay_id: { type: 'string', description: 'Stay block ID (e.g. seoul-stay)' } },
      required: ['stay_id']
    }
  },
  {
    name: 'get_stay_days',
    description: 'Get all days for a stay with their activities',
    parameters: {
      type: 'object',
      properties: { stay_id: { type: 'string' } },
      required: ['stay_id']
    }
  },
  {
    name: 'get_pois',
    description: 'Get all saved POIs for a location',
    parameters: {
      type: 'object',
      properties: { location: { type: 'string', description: 'Location name (e.g. seoul)' } },
      required: ['location']
    }
  },
  {
    name: 'get_travelers',
    description: 'Get traveler profiles and group preferences',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'add_poi',
    description: 'Add a POI to a location. Only call after user confirmed via search_and_propose.',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string' },
        name: { type: 'string' },
        coordinates: { type: 'array', items: { type: 'number' }, description: '[longitude, latitude]' },
        description: { type: 'string' },
        category: { type: 'string', enum: ['attraction', 'food', 'culture', 'shopping', 'nature', 'transport'] },
        image: { type: 'string', description: 'Image URL or empty string' }
      },
      required: ['location', 'name', 'coordinates', 'description', 'category']
    }
  },
  {
    name: 'delete_poi',
    description: 'Delete a POI from a location',
    parameters: {
      type: 'object',
      properties: { location: { type: 'string' }, poi_id: { type: 'string' } },
      required: ['location', 'poi_id']
    }
  },
  {
    name: 'assign_poi_to_day',
    description: 'Schedule a POI into a specific day of a stay',
    parameters: {
      type: 'object',
      properties: {
        stay_id: { type: 'string' },
        day_index: { type: 'integer', description: '0-based day index within the stay' },
        poi_id: { type: 'string' },
        notes: { type: 'string' }
      },
      required: ['stay_id', 'day_index', 'poi_id']
    }
  },
  {
    name: 'unassign_poi_from_day',
    description: 'Remove a POI from a day schedule',
    parameters: {
      type: 'object',
      properties: {
        stay_id: { type: 'string' },
        day_index: { type: 'integer' },
        poi_id: { type: 'string' }
      },
      required: ['stay_id', 'day_index', 'poi_id']
    }
  },
  {
    name: 'update_day',
    description: 'Update a day title, notes, or status',
    parameters: {
      type: 'object',
      properties: {
        stay_id: { type: 'string' },
        day_index: { type: 'integer' },
        title: { type: 'string' },
        notes: { type: 'string' },
        status: { type: 'string', enum: ['open', 'planned', 'confirmed'] }
      },
      required: ['stay_id', 'day_index']
    }
  },
  {
    name: 'add_day_to_stay',
    description: 'Add a new day to a stay (extends checkout by 1 day)',
    parameters: {
      type: 'object',
      properties: {
        stay_id: { type: 'string' },
        title: { type: 'string', description: 'Optional day title' }
      },
      required: ['stay_id']
    }
  },
  {
    name: 'remove_day_from_stay',
    description: 'Remove a day from a stay (contracts checkout by 1 day)',
    parameters: {
      type: 'object',
      properties: {
        stay_id: { type: 'string' },
        day_index: { type: 'integer' }
      },
      required: ['stay_id', 'day_index']
    }
  },
  {
    name: 'search_and_propose',
    description: 'Search the web for places and show results as interactive POI cards. Use this whenever the user asks about restaurants, shops, activities, attractions, or any location-related query.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Web search query' },
        message: { type: 'string', description: 'Short message to show above the results' }
      },
      required: ['query', 'message']
    }
  },
  {
    name: 'extract_and_propose',
    description: 'Extract POIs from a URL or YouTube video and show as interactive cards.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        message: { type: 'string', description: 'Short message to show above results' }
      },
      required: ['url', 'message']
    }
  },
  {
    name: 'propose_schedule',
    description: 'Propose a day schedule for user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        stay_id: { type: 'string' },
        day_index: { type: 'integer' },
        activities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              poi_id: { type: 'string' },
              poi_name: { type: 'string' },
              notes: { type: 'string' }
            },
            required: ['poi_id', 'poi_name']
          }
        }
      },
      required: ['message', 'stay_id', 'day_index', 'activities']
    }
  },
  {
    name: 'ask_choice',
    description: 'Ask the user to choose from options.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' } },
        multi: { type: 'boolean', description: 'Allow multiple selections' }
      },
      required: ['question', 'options']
    }
  }
];

const PROPOSAL_TOOLS = new Set(['search_and_propose', 'extract_and_propose', 'propose_schedule', 'ask_choice']);

// --- POI extraction via structured output ---

async function extractPoisFromText(text, context) {
  let travelersProfile = '';
  const travelersFile = path.join(TRIP_DIR, 'travelers.md');
  if (fs.existsSync(travelersFile)) {
    travelersProfile = fs.readFileSync(travelersFile, 'utf8');
  }

  const extractModel = vertexAI.getGenerativeModel({
    model: AI_MODEL,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          pois: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                coordinates: { type: 'array', items: { type: 'number' } },
                description: { type: 'string' },
                category: { type: 'string', enum: ['attraction', 'food', 'culture', 'shopping', 'nature', 'transport'] },
                price_range: { type: 'string' },
                rating: { type: 'number' },
                alignment: {
                  type: 'object',
                  properties: { G: { type: 'number' }, C: { type: 'number' }, L: { type: 'number' } }
                }
              },
              required: ['name', 'coordinates', 'description', 'category', 'alignment']
            }
          }
        },
        required: ['pois']
      }
    }
  });

  const prompt = `Extract specific places/POIs from this text. For each place, provide:
- name: official name
- coordinates: [longitude, latitude] — MUST be accurate real-world coordinates
- description: 1-2 sentences
- category: attraction, food, culture, shopping, nature, or transport
- price_range: $, $$, $$$, or $$$$ (only for food/shopping, based on search data)
- rating: numeric rating out of 5 if mentioned in the text (e.g. 4.3)
- alignment: how well this matches each traveler's interests (0-100%)

Traveler profiles:
${travelersProfile}

Context: ${context}

Text to extract from:
${text}

Return only real, specific places with accurate coordinates. Skip vague mentions.`;

  const result = await extractModel.generateContent(prompt);
  const json = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!json) return [];

  try {
    const parsed = JSON.parse(json);
    const pois = (parsed.pois || []).filter(p => p.name && p.coordinates?.length === 2);
    await Promise.all(pois.map(poi => fillPoiImage(poi, context)));
    return pois;
  } catch {
    console.error('[extract] Failed to parse POI JSON:', json.substring(0, 200));
    return [];
  }
}

async function fillPoiImage(poi, context) {
  if (poi.image) return;
  try {
    const query = encodeURIComponent(`${poi.name} ${context || ''}`.trim().substring(0, 80));
    const res = await fetch(`https://unsplash.com/napi/search/photos?query=${query}&per_page=1`);
    const data = await res.json();
    const photo = data.results?.[0];
    if (photo) {
      poi.image = `${photo.urls?.raw || photo.urls?.regular}&w=800&h=400&fit=crop`;
    }
  } catch {}
}

function getAllPoiIds() {
  const trip = readTripYaml();
  const ids = new Set();
  uniqueLocationNames(trip).forEach(name => {
    const loc = readLocationYaml(name);
    if (loc) (loc.pois || []).forEach(p => ids.add(p.id));
  });
  return ids;
}

// --- Agent: tool execution ---

async function executeTool(name, args) {
  switch (name) {
    case 'get_trip': {
      const trip = readTripYaml();
      const { itinerary, ...meta } = trip;
      return JSON.stringify(meta);
    }
    case 'get_itinerary': {
      const trip = readTripYaml();
      const summary = (trip.itinerary || []).map(b => {
        if (b.type === 'transit') {
          return { type: 'transit', id: b.id, label: b.label, date: b.date };
        }
        return {
          type: 'stay', id: b.id, location: b.location,
          checkIn: b.accommodation?.checkIn, checkOut: b.accommodation?.checkOut,
          dayCount: (b.days || []).length
        };
      });
      return JSON.stringify(summary);
    }
    case 'get_stay': {
      const trip = readTripYaml();
      const stay = findBlock(trip, args.stay_id);
      if (!stay || stay.type !== 'stay') return JSON.stringify({ error: `Stay '${args.stay_id}' not found` });
      const { days, ...summary } = stay;
      summary.day_count = (days || []).length;
      return JSON.stringify(summary);
    }
    case 'get_stay_days': {
      const trip = readTripYaml();
      const stay = findBlock(trip, args.stay_id);
      if (!stay || stay.type !== 'stay') return JSON.stringify({ error: `Stay '${args.stay_id}' not found` });
      const checkIn = new Date(stay.accommodation.checkIn + 'T00:00:00');
      const daysWithDates = (stay.days || []).map((day, idx) => {
        const d = new Date(checkIn.getTime() + idx * 86400000);
        return { ...day, derivedDate: d.toISOString().split('T')[0], index: idx };
      });
      return JSON.stringify(daysWithDates);
    }
    case 'get_pois': {
      const loc = readLocationYaml(args.location);
      if (!loc) return JSON.stringify({ error: `Location '${args.location}' not found` });
      return JSON.stringify(loc.pois || []);
    }
    case 'get_travelers': {
      const file = path.join(TRIP_DIR, 'travelers.md');
      if (!fs.existsSync(file)) return 'No traveler profiles found.';
      return fs.readFileSync(file, 'utf8');
    }
    case 'add_poi': {
      const loc = readLocationYaml(args.location);
      if (!loc) return JSON.stringify({ error: `Location '${args.location}' not found` });
      const poi = {
        id: args.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, ''),
        name: args.name,
        coordinates: args.coordinates,
        description: args.description,
        category: args.category,
        image: args.image || ''
      };
      if (!loc.pois) loc.pois = [];
      if (loc.pois.some(p => p.id === poi.id)) return JSON.stringify({ error: 'POI already exists', id: poi.id });
      loc.pois.push(poi);
      writeLocationYaml(args.location, loc);
      return JSON.stringify({ ok: true, id: poi.id });
    }
    case 'delete_poi': {
      const loc = readLocationYaml(args.location);
      if (!loc) return JSON.stringify({ error: `Location '${args.location}' not found` });
      loc.pois = (loc.pois || []).filter(p => p.id !== args.poi_id);
      writeLocationYaml(args.location, loc);

      const trip = readTripYaml();
      let changed = false;
      (trip.itinerary || [])
        .filter(b => b.type === 'stay' && b.location === args.location)
        .forEach(stay => {
          (stay.days || []).forEach(day => {
            const before = (day.activities || []).length;
            day.activities = (day.activities || []).filter(a => a.poi !== args.poi_id);
            if (day.activities.length !== before) changed = true;
          });
        });
      if (changed) writeTripYaml(trip);
      return JSON.stringify({ ok: true });
    }
    case 'assign_poi_to_day': {
      const trip = readTripYaml();
      const stay = findBlock(trip, args.stay_id);
      if (!stay || stay.type !== 'stay') return JSON.stringify({ error: `Stay '${args.stay_id}' not found` });
      const day = (stay.days || [])[args.day_index];
      if (!day) return JSON.stringify({ error: `Day index ${args.day_index} not found` });
      if (!day.activities) day.activities = [];
      day.activities.push({ poi: args.poi_id, notes: args.notes || '' });
      writeTripYaml(trip);
      return JSON.stringify({ ok: true });
    }
    case 'unassign_poi_from_day': {
      const trip = readTripYaml();
      const stay = findBlock(trip, args.stay_id);
      if (!stay || stay.type !== 'stay') return JSON.stringify({ error: `Stay '${args.stay_id}' not found` });
      const day = (stay.days || [])[args.day_index];
      if (!day) return JSON.stringify({ error: `Day index ${args.day_index} not found` });
      day.activities = (day.activities || []).filter(a => a.poi !== args.poi_id);
      writeTripYaml(trip);
      return JSON.stringify({ ok: true });
    }
    case 'update_day': {
      const trip = readTripYaml();
      const stay = findBlock(trip, args.stay_id);
      if (!stay || stay.type !== 'stay') return JSON.stringify({ error: `Stay '${args.stay_id}' not found` });
      const day = (stay.days || [])[args.day_index];
      if (!day) return JSON.stringify({ error: `Day index ${args.day_index} not found` });
      if (args.title !== undefined) day.title = args.title;
      if (args.notes !== undefined) day.notes = args.notes;
      if (args.status !== undefined) day.status = args.status;
      writeTripYaml(trip);
      return JSON.stringify({ ok: true });
    }
    case 'add_day_to_stay': {
      const trip = readTripYaml();
      const stay = findBlock(trip, args.stay_id);
      if (!stay || stay.type !== 'stay') return JSON.stringify({ error: `Stay '${args.stay_id}' not found` });
      if (!stay.days) stay.days = [];
      stay.days.push({ title: args.title || '', status: 'open', activities: [] });
      stay.accommodation.checkOut = addOneDay(stay.accommodation.checkOut);
      writeTripYaml(trip);
      return JSON.stringify({ ok: true, checkOut: stay.accommodation.checkOut });
    }
    case 'remove_day_from_stay': {
      const trip = readTripYaml();
      const stay = findBlock(trip, args.stay_id);
      if (!stay || stay.type !== 'stay') return JSON.stringify({ error: `Stay '${args.stay_id}' not found` });
      if (!stay.days || args.day_index < 0 || args.day_index >= stay.days.length) {
        return JSON.stringify({ error: `Day index ${args.day_index} not found` });
      }
      stay.days.splice(args.day_index, 1);
      stay.accommodation.checkOut = subtractOneDay(stay.accommodation.checkOut);
      writeTripYaml(trip);
      return JSON.stringify({ ok: true, checkOut: stay.accommodation.checkOut });
    }
    case 'search_and_propose': {
      try {
        const searchModel = vertexAI.getGenerativeModel({
          model: AI_MODEL,
          tools: [{ googleSearch: {} }],
          generationConfig: { temperature: 0.3 }
        });
        const result = await searchModel.generateContent(args.query);
        const searchText = result.response.candidates?.[0]?.content?.parts
          ?.filter(p => p.text).map(p => p.text).join('\n') || '';

        if (!searchText) return JSON.stringify({ pois: [], message: 'No search results found.' });

        const pois = await extractPoisFromText(searchText, args.query);
        console.log(`[search_and_propose] query="${args.query}" → ${pois.length} POIs`);
        return JSON.stringify({ pois, message: args.message });
      } catch (e) {
        console.error('[search_and_propose] error:', e.message);
        return JSON.stringify({ pois: [], message: `Search failed: ${e.message}` });
      }
    }
    case 'extract_and_propose': {
      try {
        let text = '';
        const url = args.url;
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
          const { YoutubeTranscript } = require('youtube-transcript');
          const videoId = url.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1];
          if (!videoId) return JSON.stringify({ pois: [], message: 'Could not parse YouTube video ID' });
          const transcript = await YoutubeTranscript.fetchTranscript(videoId);
          text = transcript.map(t => t.text).join(' ').substring(0, 15000);
        } else {
          const resp = await fetch(url);
          const html = await resp.text();
          text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                      .replace(/<[^>]+>/g, ' ')
                      .replace(/\s+/g, ' ')
                      .trim()
                      .substring(0, 15000);
        }
        if (!text) return JSON.stringify({ pois: [], message: 'No content found at URL.' });

        const pois = await extractPoisFromText(text, `Extracted from ${url}`);
        console.log(`[extract_and_propose] url="${url}" → ${pois.length} POIs`);
        return JSON.stringify({ pois, message: args.message });
      } catch (e) {
        console.error('[extract_and_propose] error:', e.message);
        return JSON.stringify({ pois: [], message: `Extraction failed: ${e.message}` });
      }
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

const WRITE_TOOLS = new Set([
  'add_poi', 'delete_poi', 'assign_poi_to_day', 'unassign_poi_from_day',
  'update_day', 'add_day_to_stay', 'remove_day_from_stay'
]);

// --- Agent: system prompt ---

function buildSystemPrompt(activeStayId) {
  const trip = readTripYaml();

  const itinerarySummary = (trip.itinerary || []).map((b, i) => {
    if (b.type === 'transit') {
      return `${i + 1}. Transit: ${b.label || `${b.from} → ${b.to}`} (${b.date || 'date TBD'})`;
    }
    const loc = readLocationYaml(b.location);
    const locName = loc?.name || b.location;
    const accDesc = b.accommodation?.neighborhood ? `, ${b.accommodation.neighborhood}` : '';
    return `${i + 1}. Stay: ${locName}${accDesc} (${b.accommodation?.checkIn} to ${b.accommodation?.checkOut}, ${(b.days || []).length} days)`;
  }).join('\n');

  let travelersProfile = '';
  const travelersFile = path.join(TRIP_DIR, 'travelers.md');
  if (fs.existsSync(travelersFile)) {
    travelersProfile = fs.readFileSync(travelersFile, 'utf8');
  }

  const template = fs.readFileSync(path.join(__dirname, 'data', 'system-prompt.md'), 'utf8');
  const locationNames = uniqueLocationNames(trip);
  const base = template
    .replace('{{origin}}', `${trip.origin.city}, ${trip.origin.country}`)
    .replace('{{destinations}}', locationNames.join(' → '))
    .replace('{{locationSummaries}}', itinerarySummary)
    .replace('{{travelersProfile}}', travelersProfile);

  const activeStay = activeStayId ? findBlock(trip, activeStayId) : null;
  const activeLocation = activeStay?.location || locationNames[0] || 'unknown';

  return base + `\n\nThe user is currently viewing stay: ${activeStayId || 'none'} (location: ${activeLocation}).
Available stay blocks: ${(trip.itinerary || []).filter(b => b.type === 'stay').map(b => b.id).join(', ')}.

Itinerary:
${itinerarySummary}

## How you MUST behave

You are a tool-using agent. You MUST call tools to fulfill requests. NEVER just describe what you would do — do it.

When the user asks about places, food, shops, activities, or anything location-related:
→ Call search_and_propose with a good search query. This tool searches the web AND returns interactive POI cards automatically.

When the user pastes a URL or YouTube link:
→ Call extract_and_propose with the URL. This extracts content and returns POI cards automatically.

## Rules
- NEVER list places as plain text or markup. ALWAYS call search_and_propose.
- NEVER modify data without user confirmation. Use ask_choice first.
- After user confirms adding POIs, call add_poi for each one.
- Keep text responses concise. 1-2 sentences max.
- ALWAYS respond in the same language the user used in their last message.
- Days are addressed by stay_id + day_index (0-based). Use get_stay_days to see indexes.`;
}

// --- Agent: SSE loop ---

const MAX_TURNS = 10;

app.post('/api/ai/chat', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const { messages, activeLocation, activeStayId } = req.body;

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    let didWrite = false;
    let proposal = null;

    const model = vertexAI.getGenerativeModel({
      model: AI_MODEL,
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      systemInstruction: { parts: [{ text: buildSystemPrompt(activeStayId || activeLocation) }] },
      generationConfig: { temperature: 0.7 }
    });

    const history = messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const lastMessage = messages[messages.length - 1];
    const chat = model.startChat({ history });

    console.log(`[agent] user: "${lastMessage.content}" (stay: ${activeStayId || activeLocation})`);

    let response = await chat.sendMessage([{ text: lastMessage.content }]);
    let candidate = response.response.candidates?.[0];

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      if (!candidate) break;

      const parts = candidate.content?.parts || [];
      const functionCalls = parts.filter(p => p.functionCall);

      if (functionCalls.length === 0) break;

      const functionResponses = [];

      for (const part of functionCalls) {
        const { name, args } = part.functionCall;
        console.log(`[agent] tool: ${name}(${JSON.stringify(args)})`);

        if (PROPOSAL_TOOLS.has(name)) {
          if (name === 'search_and_propose' || name === 'extract_and_propose') {
            const stepLabel = name === 'search_and_propose'
              ? `Searching: ${args.query || ''}`
              : `Extracting from URL...`;
            send('step', { text: stepLabel });

            const result = await executeTool(name, args || {});
            const parsed = JSON.parse(result);
            const pois = parsed.pois || [];

            if (pois.length === 0) {
              send('step', { text: 'No results found' });
              functionResponses.push({
                functionResponse: { name, response: { result: 'No places found. Tell the user and suggest trying a different search query.' } }
              });
              continue;
            }

            const existingPois = getAllPoiIds();
            pois.forEach(poi => {
              const id = poi.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
              if (existingPois.has(id)) poi.existing = true;
            });

            proposal = { type: 'propose_pois', message: parsed.message || args.message, pois };
            send('step', { text: `Found ${pois.length} places` });
            functionResponses.push({
              functionResponse: { name, response: { result: `Found ${pois.length} places. Shown to user as interactive cards.` } }
            });
            break;
          }

          proposal = { type: name, ...args };
          send('step', { text: `Preparing suggestions...` });
          functionResponses.push({
            functionResponse: { name, response: { result: 'Proposal shown to user. Waiting for their selection.' } }
          });
          break;
        }

        const stepText = {
          get_pois: `Reading POIs for ${args.location || ''}`,
          get_stay_days: `Reading schedule for ${args.stay_id || ''}`,
          get_stay: `Reading ${args.stay_id || ''} details`,
          get_itinerary: 'Reading itinerary',
          get_trip: 'Reading trip info',
          get_travelers: 'Reading traveler profiles',
          add_poi: `Adding: ${args.name || ''}`,
          delete_poi: `Removing: ${args.poi_id || ''}`,
          assign_poi_to_day: `Scheduling ${args.poi_id} on day ${args.day_index}`,
          unassign_poi_from_day: `Unscheduling ${args.poi_id} from day ${args.day_index}`,
          update_day: `Updating day ${args.day_index}`,
          add_day_to_stay: `Adding day to ${args.stay_id}`,
          remove_day_from_stay: `Removing day ${args.day_index} from ${args.stay_id}`,
        }[name] || name;

        send('step', { text: stepText });

        const result = await executeTool(name, args || {});
        if (WRITE_TOOLS.has(name)) didWrite = true;

        functionResponses.push({
          functionResponse: { name, response: { result } }
        });
      }

      if (proposal) {
        response = await chat.sendMessage(functionResponses);
        candidate = response.response.candidates?.[0];
        break;
      }

      response = await chat.sendMessage(functionResponses);
      candidate = response.response.candidates?.[0];
    }

    const textParts = (candidate?.content?.parts || []).filter(p => p.text);
    const text = textParts.map(p => p.text).join('\n').trim();

    console.log(`[agent] done. proposal=${!!proposal} write=${didWrite} text=${text.substring(0, 80)}...`);

    send('done', { message: text, refresh: didWrite, proposal });
    res.end();
  } catch (err) {
    console.error('Agent error:', err.message, err.stack);
    send('agent_error', { error: err.message });
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Planning server: http://localhost:${PORT}/planning.html`);
  console.log(`AI: Vertex AI (${VERTEX_PROJECT} / ${VERTEX_REGION})`);
  console.log(`Model: ${AI_MODEL}`);
});

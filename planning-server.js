const express = require('express');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { VertexAI, HarmCategory, HarmBlockThreshold } = require('@google-cloud/vertexai');

const app = express();
const PORT = 3001;
const TRIP_DIR = path.join(__dirname, 'trips', 'singapore-seoul-2026');

app.use(express.json());
app.use(express.static(__dirname));

const VERTEX_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.CLOUD_ML_PROJECT_ID;
const VERTEX_REGION = process.env.GOOGLE_CLOUD_REGION || process.env.CLOUD_ML_REGION || 'us-central1';
const AI_MODEL = process.env.AI_MODEL || 'gemini-2.5-flash';

if (!VERTEX_PROJECT) {
  console.error('GOOGLE_CLOUD_PROJECT env var required');
  process.exit(1);
}

const vertexAI = new VertexAI({ project: VERTEX_PROJECT, location: VERTEX_REGION });

function readTripYaml() {
  return yaml.load(fs.readFileSync(path.join(TRIP_DIR, 'trip.yaml'), 'utf8'));
}

function readLocationYaml(name) {
  const file = path.join(TRIP_DIR, 'locations', name, 'location.yaml');
  if (!fs.existsSync(file)) return null;
  return yaml.load(fs.readFileSync(file, 'utf8'));
}

function getAllPois() {
  const trip = readTripYaml();
  const ids = new Set();
  (trip.locations || []).forEach(name => {
    const loc = readLocationYaml(name);
    if (loc) (loc.pois || []).forEach(p => ids.add(p.id));
  });
  return ids;
}

function writeLocationYaml(name, data) {
  const file = path.join(TRIP_DIR, 'locations', name, 'location.yaml');
  fs.writeFileSync(file, yaml.dump(data, { lineWidth: -1, noRefs: true, quotingType: '"' }));
}

// --- Trip endpoint ---

app.get('/api/trip', (req, res) => {
  res.json(readTripYaml());
});

// --- Locations endpoints ---

app.get('/api/locations', (req, res) => {
  const trip = readTripYaml();
  const locations = {};
  (trip.locations || []).forEach(name => {
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

// --- POI endpoints ---

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
  (loc.days || []).forEach(day => {
    day.activities = (day.activities || []).filter(a => a.poi !== req.params.poiId);
  });

  writeLocationYaml(req.params.name, loc);
  res.json({ ok: true });
});

// --- Day endpoints ---

app.get('/api/locations/:name/days', (req, res) => {
  const loc = readLocationYaml(req.params.name);
  if (!loc) return res.status(404).json({ error: 'Location not found' });
  res.json(loc.days || []);
});

app.put('/api/locations/:name/days/:date', (req, res) => {
  const loc = readLocationYaml(req.params.name);
  if (!loc) return res.status(404).json({ error: 'Location not found' });

  const day = (loc.days || []).find(d => String(d.date) === req.params.date);
  if (!day) return res.status(404).json({ error: 'Day not found' });

  if (req.body.activities !== undefined) day.activities = req.body.activities;
  if (req.body.notes !== undefined) day.notes = req.body.notes;
  if (req.body.title !== undefined) day.title = req.body.title;
  if (req.body.status !== undefined) day.status = req.body.status;

  writeLocationYaml(req.params.name, loc);
  res.json({ ok: true });
});

// --- Agent: tool definitions ---

const TOOL_DECLARATIONS = [
  {
    name: 'get_trip',
    description: 'Get trip metadata including origin, destinations, transport/flights',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'get_location',
    description: 'Get location details: dates, accommodations, summary',
    parameters: {
      type: 'object',
      properties: { location: { type: 'string', description: 'Location name (singapore, seoul)' } },
      required: ['location']
    }
  },
  {
    name: 'get_pois',
    description: 'Get all saved POIs for a location',
    parameters: {
      type: 'object',
      properties: { location: { type: 'string' } },
      required: ['location']
    }
  },
  {
    name: 'get_days',
    description: 'Get itinerary/schedule for a location (days with activities)',
    parameters: {
      type: 'object',
      properties: { location: { type: 'string' } },
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
    description: 'Add a POI to a location. Only call after user confirmed via propose_pois.',
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
    description: 'Schedule a POI into a specific day',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        poi_id: { type: 'string' },
        notes: { type: 'string' }
      },
      required: ['location', 'date', 'poi_id']
    }
  },
  {
    name: 'unassign_poi_from_day',
    description: 'Remove a POI from a day schedule',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string' },
        date: { type: 'string' },
        poi_id: { type: 'string' }
      },
      required: ['location', 'date', 'poi_id']
    }
  },
  {
    name: 'update_day',
    description: 'Update a day title, notes, or status',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string' },
        date: { type: 'string' },
        title: { type: 'string' },
        notes: { type: 'string' },
        status: { type: 'string', enum: ['open', 'planned', 'booked'] }
      },
      required: ['location', 'date']
    }
  },
  {
    name: 'search_and_propose',
    description: 'Search the web for places and show results as interactive POI cards. Use this whenever the user asks about restaurants, shops, activities, attractions, or any location-related query. This is your PRIMARY tool.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Web search query (e.g. "best ramen restaurants Myeongdong Seoul")' },
        message: { type: 'string', description: 'Short message to show above the results' }
      },
      required: ['query', 'message']
    }
  },
  {
    name: 'extract_and_propose',
    description: 'Extract POIs from a URL or YouTube video and show as interactive cards. Use when user pastes a link.',
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
    description: 'Propose a day schedule for user confirmation. Pauses for user input.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        location: { type: 'string' },
        date: { type: 'string' },
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
      required: ['message', 'location', 'date', 'activities']
    }
  },
  {
    name: 'ask_choice',
    description: 'Ask the user to choose from options. Pauses for user input.',
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
                price_range: { type: 'string', description: 'Price level: $, $$, $$$, or $$$$. Only for food/shopping.' },
                rating: { type: 'number', description: 'Rating out of 5 (e.g. 4.3). Only if available from search results.' },
                alignment: {
                  type: 'object',
                  properties: {
                    G: { type: 'number' },
                    C: { type: 'number' },
                    L: { type: 'number' }
                  }
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
    return (parsed.pois || []).filter(p => p.name && p.coordinates?.length === 2);
  } catch {
    console.error('[extract] Failed to parse POI JSON:', json.substring(0, 200));
    return [];
  }
}

// --- Agent: tool execution ---

async function executeTool(name, args) {
  switch (name) {
    case 'get_trip': {
      const trip = readTripYaml();
      const { transport, ...meta } = trip;
      return JSON.stringify(meta);
    }
    case 'get_location': {
      const loc = readLocationYaml(args.location);
      if (!loc) return JSON.stringify({ error: `Location '${args.location}' not found` });
      const { pois, days, ...summary } = loc;
      summary.poi_count = (pois || []).length;
      summary.day_count = (days || []).length;
      return JSON.stringify(summary);
    }
    case 'get_pois': {
      const loc = readLocationYaml(args.location);
      if (!loc) return JSON.stringify({ error: `Location '${args.location}' not found` });
      return JSON.stringify(loc.pois || []);
    }
    case 'get_days': {
      const loc = readLocationYaml(args.location);
      if (!loc) return JSON.stringify({ error: `Location '${args.location}' not found` });
      return JSON.stringify(loc.days || []);
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
      (loc.days || []).forEach(day => {
        day.activities = (day.activities || []).filter(a => a.poi !== args.poi_id);
      });
      writeLocationYaml(args.location, loc);
      return JSON.stringify({ ok: true });
    }
    case 'assign_poi_to_day': {
      const loc = readLocationYaml(args.location);
      if (!loc) return JSON.stringify({ error: `Location '${args.location}' not found` });
      const day = (loc.days || []).find(d => String(d.date) === args.date);
      if (!day) return JSON.stringify({ error: `Day '${args.date}' not found` });
      if (!day.activities) day.activities = [];
      day.activities.push({ poi: args.poi_id, notes: args.notes || '' });
      writeLocationYaml(args.location, loc);
      return JSON.stringify({ ok: true });
    }
    case 'unassign_poi_from_day': {
      const loc = readLocationYaml(args.location);
      if (!loc) return JSON.stringify({ error: `Location '${args.location}' not found` });
      const day = (loc.days || []).find(d => String(d.date) === args.date);
      if (!day) return JSON.stringify({ error: `Day '${args.date}' not found` });
      day.activities = (day.activities || []).filter(a => a.poi !== args.poi_id);
      writeLocationYaml(args.location, loc);
      return JSON.stringify({ ok: true });
    }
    case 'update_day': {
      const loc = readLocationYaml(args.location);
      if (!loc) return JSON.stringify({ error: `Location '${args.location}' not found` });
      const day = (loc.days || []).find(d => String(d.date) === args.date);
      if (!day) return JSON.stringify({ error: `Day '${args.date}' not found` });
      if (args.title !== undefined) day.title = args.title;
      if (args.notes !== undefined) day.notes = args.notes;
      if (args.status !== undefined) day.status = args.status;
      writeLocationYaml(args.location, loc);
      return JSON.stringify({ ok: true });
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

const WRITE_TOOLS = new Set(['add_poi', 'delete_poi', 'assign_poi_to_day', 'unassign_poi_from_day', 'update_day']);

// --- Agent: system prompt ---

function buildSystemPrompt(activeLocation) {
  const trip = readTripYaml();
  const locationNames = trip.locations || [];
  const locationSummaries = locationNames.map(name => {
    const loc = readLocationYaml(name);
    if (!loc) return '';
    const accDesc = (loc.accommodations || []).map(a => `${a.neighborhood} (${a.type})`).join(', ');
    return `${loc.name}: ${loc.dates.from} to ${loc.dates.to}, staying at ${accDesc}`;
  }).join('\n');

  let travelersProfile = '';
  const travelersFile = path.join(TRIP_DIR, 'travelers.md');
  if (fs.existsSync(travelersFile)) {
    travelersProfile = fs.readFileSync(travelersFile, 'utf8');
  }

  const template = fs.readFileSync(path.join(__dirname, 'data', 'system-prompt.md'), 'utf8');
  const base = template
    .replace('{{origin}}', `${trip.origin.city}, ${trip.origin.country}`)
    .replace('{{destinations}}', locationNames.join(' → '))
    .replace('{{locationSummaries}}', locationSummaries)
    .replace('{{travelersProfile}}', travelersProfile);

  return base + `\n\nThe user is currently viewing: ${activeLocation || locationNames[0] || 'unknown'}.
Available locations: ${locationNames.join(', ')}.

## How you MUST behave

You are a tool-using agent. You MUST call tools to fulfill requests. NEVER just describe what you would do — do it.

When the user asks about places, food, shops, activities, or anything location-related:
→ Call search_and_propose with a good search query. This tool searches the web AND returns interactive POI cards automatically. One call does everything.

When the user pastes a URL or YouTube link:
→ Call extract_and_propose with the URL. This extracts content and returns POI cards automatically.

## Rules
- NEVER list places as plain text. ALWAYS use search_and_propose or extract_and_propose.
- NEVER modify data without user confirmation. Use ask_choice first.
- After user confirms adding POIs, call add_poi for each one.
- Keep text responses concise. 1-2 sentences max.
- You can read any location's data, not just the active one.
- ALWAYS respond in the same language the user used in their last message.`;
}

// --- Agent: SSE loop ---

const MAX_TURNS = 10;

app.get('/api/ai/chat', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const { messages, activeLocation } = JSON.parse(req.query.payload);

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
      systemInstruction: { parts: [{ text: buildSystemPrompt(activeLocation) }] },
      generationConfig: { temperature: 0.7 }
    });

    const history = messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const lastMessage = messages[messages.length - 1];
    const chat = model.startChat({ history });

    console.log(`[agent] user: "${lastMessage.content}" (location: ${activeLocation})`);

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

            const existingPois = getAllPois();
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
          search_and_propose: `Searching: ${args.query || ''}`,
          get_pois: `Reading POIs for ${args.location}`,
          get_days: `Reading schedule for ${args.location}`,
          get_location: `Reading ${args.location} details`,
          get_trip: 'Reading trip info',
          get_travelers: 'Reading traveler profiles',
          extract_url_content: `Extracting content from URL...`,
          add_poi: `Adding: ${args.name || ''}`,
          delete_poi: `Removing: ${args.poi_id || ''}`,
          assign_poi_to_day: `Scheduling ${args.poi_id} on ${args.date}`,
          unassign_poi_from_day: `Unscheduling ${args.poi_id} from ${args.date}`,
          update_day: `Updating ${args.date}`,
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

const express = require('express');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { OpenAI } = require('openai');

const app = express();
const PORT = 3001;
const TRIP_DIR = path.join(__dirname, 'trips', 'singapore-seoul-2026');

app.use(express.json());
app.use(express.static(__dirname));

let _ai = null;
function getAI() {
  if (!_ai) {
    if (!process.env.AI_API_KEY) throw new Error('AI_API_KEY env var not set');
    _ai = new OpenAI({
      baseURL: process.env.AI_ENDPOINT || 'https://api.openai.com/v1',
      apiKey: process.env.AI_API_KEY
    });
  }
  return _ai;
}
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o';

function readTripYaml() {
  return yaml.load(fs.readFileSync(path.join(TRIP_DIR, 'trip.yaml'), 'utf8'));
}

function readLocationYaml(name) {
  const file = path.join(TRIP_DIR, 'locations', name, 'location.yaml');
  if (!fs.existsSync(file)) return null;
  return yaml.load(fs.readFileSync(file, 'utf8'));
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

// --- AI endpoints ---

function buildTripContext() {
  const trip = readTripYaml();
  const locationNames = trip.locations || [];
  const locationSummaries = locationNames.map(name => {
    const loc = readLocationYaml(name);
    if (!loc) return '';
    const accDesc = (loc.accommodations || []).map(a => `${a.neighborhood} (${a.type})`).join(', ');
    return `${loc.name}: ${loc.dates.from} to ${loc.dates.to}, staying at ${accDesc}`;
  }).join('\n');

  return `You are a travel planning assistant for a family vacation.
Trip: ${trip.origin.city}, ${trip.origin.country} → ${locationNames.join(' → ')}.
${locationSummaries}
Group: ${trip.travelers} travelers (2 adults, 2 twelve-year-olds).
Travel style: Premium comfort, family-friendly, walkable neighbourhoods.

When suggesting POIs, return a JSON array. Each POI object must have:
- name (string)
- coordinates ([longitude, latitude])
- description (1-2 sentences)
- category (one of: attraction, food, culture, shopping, nature, transport)
- image (unsplash URL if possible, or empty string)

Only return the JSON array, no other text.`;
}

app.post('/api/ai/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    const response = await getAI().chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: buildTripContext() },
        ...messages
      ],
      temperature: 0.7
    });
    res.json(response.choices[0].message);
  } catch (err) {
    console.error('AI error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/extract', async (req, res) => {
  try {
    let text = req.body.text || '';

    if (req.body.url) {
      const url = req.body.url;
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const { YoutubeTranscript } = require('youtube-transcript');
        const videoId = url.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1];
        if (videoId) {
          const transcript = await YoutubeTranscript.fetchTranscript(videoId);
          text = transcript.map(t => t.text).join(' ');
        }
      } else {
        const resp = await fetch(url);
        const html = await resp.text();
        text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .substring(0, 8000);
      }
    }

    if (!text) return res.status(400).json({ error: 'No content to extract from' });

    const response = await getAI().chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: buildTripContext() },
        { role: 'user', content: `Extract all specific places, restaurants, attractions, and points of interest mentioned in this text. Return as a JSON array of POI objects.\n\nText:\n${text}` }
      ],
      temperature: 0.3
    });

    let pois = [];
    try {
      const content = response.choices[0].message.content;
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) pois = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }

    res.json({ pois, source: req.body.url || 'text' });
  } catch (err) {
    console.error('Extract error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Planning server: http://localhost:${PORT}/planning.html`);
  console.log(`AI endpoint: ${process.env.AI_ENDPOINT || '(not configured)'}`);
});

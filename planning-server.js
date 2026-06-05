const express = require('express');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

const app = express();
const PORT = 3001;
const DATA_DIR = path.join(__dirname, 'data');
const DAYS_DIR = path.join(__dirname, 'days');

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

const TRIP_CONTEXT = `You are a travel planning assistant for a family vacation.
Trip: Klagenfurt, Austria → Singapore (3 nights) → Seoul (6 nights), July 10-20, 2026.
Group: 2 adults, 2 twelve-year-olds.
Travel style: Premium comfort, family-friendly, walkable neighbourhoods.
Singapore base: Robertson Quay. Seoul base: Myeongdong.

When suggesting POIs, return a JSON array. Each POI object must have:
- name (string)
- coordinates ([longitude, latitude])
- description (1-2 sentences)
- category (one of: attraction, food, culture, shopping, nature, transport)
- image (unsplash URL if possible, or empty string)

Only return the JSON array, no other text. If you can't determine exact coordinates, estimate based on the area.`;

// --- POI endpoints ---

app.get('/api/pois/:city', (req, res) => {
  const file = path.join(DATA_DIR, 'pois', `${req.params.city}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'City not found' });
  res.json(JSON.parse(fs.readFileSync(file, 'utf8')));
});

app.put('/api/pois/:city', (req, res) => {
  const file = path.join(DATA_DIR, 'pois', `${req.params.city}.json`);
  fs.writeFileSync(file, JSON.stringify(req.body, null, 2) + '\n');
  res.json({ ok: true });
});

// --- Day endpoints ---

app.get('/api/days', (req, res) => {
  const tripFile = path.join(DATA_DIR, 'trip.json');
  const trip = JSON.parse(fs.readFileSync(tripFile, 'utf8'));
  const days = trip.dayFiles.map(file => {
    const content = fs.readFileSync(path.join(DAYS_DIR, file), 'utf8');
    const meta = parseFrontmatter(content);
    return { file, meta };
  });
  res.json(days);
});

app.put('/api/days/:file', (req, res) => {
  const file = path.join(DAYS_DIR, req.params.file);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Day file not found' });

  const content = fs.readFileSync(file, 'utf8');
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return res.status(400).json({ error: 'Invalid frontmatter' });

  const newPois = req.body.pois;
  let frontmatter = match[1];
  const body = match[2];

  if (frontmatter.includes('pois:')) {
    frontmatter = frontmatter.replace(/pois:.*/, `pois: ${JSON.stringify(newPois)}`);
  } else {
    frontmatter += `\npois: ${JSON.stringify(newPois)}`;
  }

  fs.writeFileSync(file, `---\n${frontmatter}\n---\n${body}`);
  res.json({ ok: true });
});

// --- AI endpoints ---

app.post('/api/ai/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    const response = await getAI().chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: TRIP_CONTEXT },
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
        { role: 'system', content: TRIP_CONTEXT },
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

// --- Helpers ---

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const meta = {};
  match[1].split('\n').forEach(line => {
    const idx = line.indexOf(':');
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('[')) {
      try { value = JSON.parse(value); } catch (e) {}
    }
    meta[key] = value;
  });
  return meta;
}

app.listen(PORT, () => {
  console.log(`Planning server: http://localhost:${PORT}/planning.html`);
  console.log(`AI endpoint: ${process.env.AI_ENDPOINT || '(not configured)'}`);
});

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZ2VyZG9iZXJsZWNobmVyIiwiYSI6ImNtcHpwNjdzYjA2d3EycnBnZWJkZ2p5ODUifQ.vl5h0bVgSuSaW_ZPIH0CKA';

let rotationFrame = null;
let allPois = {};

const CATEGORY_COLORS = {
  attraction: '#4ecdc4',
  food: '#ff9f43',
  culture: '#a55eea',
  shopping: '#fd79a8',
  nature: '#00b894',
  transport: '#636e72'
};

async function init() {
  const bust = Date.now();
  const [trip, flightsData, accommodationsData] = await Promise.all([
    fetch(`data/trip.json?v=${bust}`).then(r => r.json()),
    fetch(`data/flights.json?v=${bust}`).then(r => r.json()),
    fetch(`data/accommodations.json?v=${bust}`).then(r => r.json())
  ]);

  const poiEntries = Object.entries(trip.poiFiles || {});
  const poiResults = await Promise.all(
    poiEntries.map(([city, path]) =>
      fetch(`data/${path}?v=${bust}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    )
  );
  poiEntries.forEach(([city], i) => {
    if (poiResults[i]) {
      poiResults[i].pois.forEach(poi => { allPois[poi.id] = poi; });
    }
  });

  const days = (await Promise.all(
    trip.dayFiles.map(file =>
      fetch(`days/${file}?v=${bust}`)
        .then(r => {
          if (!r.ok) throw new Error(`${file}: ${r.status}`);
          return r.text();
        })
        .then(text => ({ ...parseFrontmatter(text), file }))
        .catch(err => { console.warn('Skipping day file:', err.message); return null; })
    )
  )).filter(Boolean);

  const chapters = buildChapters(flightsData.journeys, days);
  renderStory(chapters, trip, flightsData);
  initTimeline(chapters);

  const map = initMap('map', MAPBOX_TOKEN);

  map.on('load', () => {
    addFlightRoutes(map, flightsData.journeys);
    addAirportMarkers(map, flightsData.journeys);
    addAccommodationMarkers(map, accommodationsData.accommodations);
    addOriginMarker(map, trip.origin);
    startGlobeRotation(map);

    initScroll(chapters, (chapter) => {
      stopGlobeRotation();
      clearPoiMarkers(map);
      updateTimelineActive(chapter.type === 'hero' ? 'hero' : chapter.type === 'overview' ? 'overview' : chapter.id);

      if (chapter.type === 'hero' || chapter.type === 'overview') {
        flyToGlobe(map);
        map.once('moveend', () => startGlobeRotation(map));
      } else {
        flyToChapter(map, chapter);
        if (chapter.type === 'day' && chapter.day.meta.pois) {
          const dayPois = resolvePois(chapter.day.meta.pois);
          const acc = accommodationsData.accommodations.find(
            a => a.city.toLowerCase() === chapter.day.meta.city
          );
          showPoiMarkers(map, dayPois, true);
          fitToPoiBounds(map, dayPois, acc);
        }
      }
    });
  });
}

function resolvePois(poiIds) {
  if (!Array.isArray(poiIds)) return [];
  return poiIds.map(id => allPois[id]).filter(Boolean);
}

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, content: text };

  const meta = {};
  match[1].split('\n').forEach(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if (value.startsWith('[')) {
      try { value = JSON.parse(value); } catch (e) { /* keep as string */ }
    }
    meta[key] = value;
  });

  return { meta, content: match[2].trim() };
}

function buildChapters(journeys, days) {
  const chapters = [];

  journeys.forEach(j => {
    chapters.push({
      type: 'flight',
      date: j.date,
      journey: j,
      id: `flight-${j.id}`
    });
  });

  days.forEach(d => {
    chapters.push({
      type: 'day',
      date: d.meta.date,
      day: d,
      id: `day-${d.meta.date}`
    });
  });

  chapters.sort((a, b) => {
    if (a.date === b.date) return a.type === 'flight' ? -1 : 1;
    return a.date.localeCompare(b.date);
  });

  return chapters;
}

function renderStory(chapters, trip, flightsData) {
  const story = document.getElementById('story');

  const dayChapters = chapters.filter(c => c.type === 'day');
  const flightCount = chapters.filter(c => c.type === 'flight').length;
  const confirmedCount = dayChapters.filter(c => c.day.meta.status === 'confirmed').length;
  const plannedCount = dayChapters.filter(c => c.day.meta.status === 'planned').length;
  const openCount = dayChapters.filter(c => c.day.meta.status === 'open').length;
  const totalKm = calculateTotalDistance(flightsData.journeys);

  let html = `
    <section class="hero" id="hero">
      <div class="hero-content">
        <h1>${trip.title}</h1>
        <p class="subtitle">${trip.subtitle}</p>
        <div class="scroll-hint">Scroll to explore ↓</div>
      </div>
    </section>

    <section class="chapter overview" id="overview">
      <div class="card overview-card">
        <div class="card-label">Trip Overview</div>
        <h2>${formatDate(trip.dates.start)} — ${formatDate(trip.dates.end)}</h2>
        <div class="overview-stats">
          <div class="stat"><span class="stat-value">3</span><span class="stat-label">Countries</span></div>
          <div class="stat"><span class="stat-value">${flightCount}</span><span class="stat-label">Flights</span></div>
          <div class="stat"><span class="stat-value">${dayChapters.length}</span><span class="stat-label">Days</span></div>
          <div class="stat"><span class="stat-value">${trip.travelers}</span><span class="stat-label">Travelers</span></div>
        </div>
        <div class="overview-status">
          ${confirmedCount ? `<span class="status confirmed">${confirmedCount} confirmed</span>` : ''}
          ${plannedCount ? `<span class="status planned">${plannedCount} planned</span>` : ''}
          ${openCount ? `<span class="status open">${openCount} open</span>` : ''}
        </div>
      </div>
    </section>
  `;

  chapters.forEach(ch => {
    const inner = ch.type === 'flight'
      ? renderFlightCard(ch.journey)
      : renderDayCard(ch.day);
    html += `<section class="chapter ${ch.type}" id="${ch.id}">${inner}</section>`;
  });

  html += `
    <div class="footer">
      <div class="footer-stats">3 countries · ${flightCount} flights · ${dayChapters.length} days · ${totalKm.toLocaleString()} km</div>
      <div class="footer-route">Klagenfurt → Singapore → Seoul → Home</div>
    </div>
  `;

  story.innerHTML = html;
}

function calculateTotalDistance(journeys) {
  let total = 0;
  journeys.forEach(j => {
    j.legs.forEach(leg => {
      const [lon1, lat1] = leg.departure.coordinates;
      const [lon2, lat2] = leg.arrival.coordinates;
      total += haversine(lat1, lon1, lat2, lon2);
    });
  });
  return Math.round(total);
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function renderFlightCard(journey) {
  const legs = journey.legs.map(leg => {
    if (leg.mode === 'drive') {
      return `
        <div class="flight-leg drive-leg">
          <div class="flight-route">
            <span class="airport">${leg.departure.city}</span>
            <span class="arrow">→</span>
            <span class="airport">${leg.arrival.airport || leg.arrival.city}</span>
          </div>
          <div class="flight-detail">Drive · ${leg.duration}</div>
          <div class="flight-times">
            <span>${formatTime(leg.departure.time)}</span>
            <span class="duration">${leg.duration}</span>
            <span>${formatTime(leg.arrival.time)}</span>
          </div>
        </div>
      `;
    }
    return `
      <div class="flight-leg">
        <div class="flight-route">
          <span class="airport">${leg.departure.airport}</span>
          <span class="arrow">→</span>
          <span class="airport">${leg.arrival.airport}</span>
        </div>
        <div class="flight-detail">${leg.airline} · ${leg.flightNumber}</div>
        <div class="flight-detail">${leg.aircraft}</div>
        <div class="flight-times">
          <span>${formatTime(leg.departure.time)}</span>
          <span class="duration">${leg.duration}</span>
          <span>${formatTime(leg.arrival.time)}</span>
        </div>
      </div>
    `;
  }).join('');

  const layovers = journey.layovers.map(l =>
    `<div class="layover">${l.duration} layover in ${l.city}</div>`
  ).join('');

  const mainLeg = journey.legs.find(l => l.mode !== 'drive');
  const airlineCode = mainLeg ? mainLeg.flightNumber.substring(0, 2).toLowerCase() : '';

  return `
    <div class="card flight-card" data-airline="${airlineCode}">
      <div class="card-label">✈ Flight · ${formatDate(journey.date)}</div>
      <h2>${journey.label}</h2>
      <div class="flight-legs">${legs}</div>
      ${layovers}
      <div class="total-duration">Total: ${journey.totalDuration}</div>
    </div>
  `;
}

function renderDayCard(day) {
  const status = day.meta.status || 'open';
  const preprocessed = processPoiLinks(day.content);
  const content = marked.parse(preprocessed);

  return `
    <div class="card day-card" data-city="${day.meta.city || ''}">
      <div class="card-label">
        <span class="status ${status}">${status}</span>
        ${formatDate(day.meta.date)}
      </div>
      <h2>${day.meta.title || day.meta.date}</h2>
      <div class="day-content">${content}</div>
    </div>
  `;
}

function processPoiLinks(markdown) {
  return markdown.replace(/\[([^\]]+)\]\(poi:([^)]+)\)/g, (match, text, poiId) => {
    const poi = allPois[poiId];
    if (!poi) return text;
    const color = CATEGORY_COLORS[poi.category] || '#4ecdc4';
    return `<span class="poi-link"><span class="poi-inline-pin"><span class="poi-inline-pin-body" style="background:${color}"></span><span class="poi-inline-pin-tail" style="border-top-color:${color}"></span><span class="poi-inline-pin-inner"></span></span>${text}</span>`;
  });
}

function formatTime(isoString) {
  return isoString.split('T')[1].substring(0, 5);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

function startGlobeRotation(map) {
  stopGlobeRotation();
  let bearing = map.getBearing();
  function rotate() {
    bearing += 0.04;
    map.setBearing(bearing);
    rotationFrame = requestAnimationFrame(rotate);
  }
  rotate();
}

function stopGlobeRotation() {
  if (rotationFrame) {
    cancelAnimationFrame(rotationFrame);
    rotationFrame = null;
  }
}

init();

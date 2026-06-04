const MAPBOX_TOKEN = 'pk.eyJ1IjoiZ2VyZG9iZXJsZWNobmVyIiwiYSI6ImNtcHpwNjdzYjA2d3EycnBnZWJkZ2p5ODUifQ.vl5h0bVgSuSaW_ZPIH0CKA';

let rotationFrame = null;

async function init() {
  const [trip, flightsData, accommodationsData] = await Promise.all([
    fetch('data/trip.json').then(r => r.json()),
    fetch('data/flights.json').then(r => r.json()),
    fetch('data/accommodations.json').then(r => r.json())
  ]);

  const days = await Promise.all(
    trip.dayFiles.map(file =>
      fetch(`days/${file}`)
        .then(r => r.text())
        .then(text => ({ ...parseFrontmatter(text), file }))
    )
  );

  const chapters = buildChapters(flightsData.journeys, days);
  renderStory(chapters, trip);

  const map = initMap('map', MAPBOX_TOKEN);

  map.on('load', () => {
    addFlightRoutes(map, flightsData.journeys);
    addAirportMarkers(map, flightsData.journeys);
    addAccommodationMarkers(map, accommodationsData.accommodations);
    addOriginMarker(map, trip.origin);
    startGlobeRotation(map);

    initScroll(chapters, (chapter) => {
      stopGlobeRotation();
      if (chapter.type === 'hero') {
        flyToGlobe(map);
        map.once('moveend', () => startGlobeRotation(map));
      } else {
        flyToChapter(map, chapter);
      }
    });
  });
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

function renderStory(chapters, trip) {
  const story = document.getElementById('story');

  let html = `
    <section class="hero" id="hero">
      <div class="hero-content">
        <h1>${trip.title}</h1>
        <p class="subtitle">${trip.subtitle}</p>
        <div class="scroll-hint">Scroll to explore ↓</div>
      </div>
    </section>
  `;

  chapters.forEach(ch => {
    const inner = ch.type === 'flight'
      ? renderFlightCard(ch.journey)
      : renderDayCard(ch.day);
    html += `<section class="chapter ${ch.type}" id="${ch.id}">${inner}</section>`;
  });

  html += `<div class="footer">Klagenfurt → Singapore → Seoul → Home</div>`;

  story.innerHTML = html;
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

  return `
    <div class="card flight-card">
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
  const content = marked.parse(day.content);

  return `
    <div class="card day-card">
      <div class="card-label">
        <span class="status ${status}">${status}</span>
        ${formatDate(day.meta.date)}
      </div>
      <h2>${day.meta.title || day.meta.date}</h2>
      <div class="day-content">${content}</div>
    </div>
  `;
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

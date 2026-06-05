const MAPBOX_TOKEN = 'pk.eyJ1IjoiZ2VyZG9iZXJsZWNobmVyIiwiYSI6ImNtcHpwNjdzYjA2d3EycnBnZWJkZ2p5ODUifQ.vl5h0bVgSuSaW_ZPIH0CKA';

let rotationFrame = null;

const CATEGORY_COLORS = {
  attraction: '#4ecdc4',
  food: '#ff9f43',
  culture: '#a55eea',
  shopping: '#fd79a8',
  nature: '#00b894',
  transport: '#636e72'
};

async function init() {
  await TripStore.loadStatic();

  const trip = TripStore.trip;
  const chapters = TripStore.getChapters();
  const accommodations = TripStore.getAccommodations();
  const transport = TripStore.getTransport();

  renderStory(chapters, trip);
  initTimeline(chapters);

  const map = initMap('map', MAPBOX_TOKEN);

  map.on('load', () => {
    addFlightRoutes(map, transport);
    addAirportMarkers(map, transport);
    addAccommodationMarkers(map, accommodations);
    addOriginMarker(map, trip.origin);
    startGlobeRotation(map);

    let pendingRotationStart = null;

    initScroll(chapters, (chapter) => {
      stopGlobeRotation();
      clearPoiMarkers(map);
      cancelFlightAnimation();
      if (pendingRotationStart) {
        map.off('moveend', pendingRotationStart);
        pendingRotationStart = null;
      }
      updateTimelineActive(chapter.type === 'hero' ? 'hero' : chapter.type === 'overview' ? 'overview' : chapter.id);

      if (chapter.type === 'hero' || chapter.type === 'overview') {
        map.dragPan.disable();
        flyToGlobe(map);
        pendingRotationStart = () => { startGlobeRotation(map); pendingRotationStart = null; };
        map.once('moveend', pendingRotationStart);
        stopScrollDrivenFlight();
      } else {
        if (chapter.type === 'flight') {
          map.dragPan.disable();
          setupScrollDrivenFlight(map, chapter);
        } else {
          map.dragPan.enable();
          stopScrollDrivenFlight();
          flyToChapter(map, chapter);
        }
        if (chapter.type === 'day' && chapter.day.meta.pois) {
          const dayPois = TripStore.resolvePois(chapter.day.meta.pois);
          const acc = accommodations.find(
            a => a.city.toLowerCase() === chapter.day.meta.city
          );
          showPoiMarkers(map, dayPois, true);
          fitToPoiBounds(map, dayPois, acc);
        }
      }

      const hashId = chapter.type === 'hero' ? '' : (chapter.id || '');
      if (hashId) {
        history.replaceState(null, '', `#${hashId}`);
      } else {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    });

    if (window.location.hash) {
      const target = document.getElementById(window.location.hash.slice(1));
      if (target) {
        setTimeout(() => target.scrollIntoView({ behavior: 'smooth' }), 500);
      }
    }
  });
}

function renderStory(chapters, trip) {
  const story = document.getElementById('story');
  const dates = TripStore.getDates();
  const transport = TripStore.getTransport();

  const dayChapters = chapters.filter(c => c.type === 'day');
  const flightCount = chapters.filter(c => c.type === 'flight').length;
  const confirmedCount = dayChapters.filter(c => c.day.meta.status === 'confirmed').length;
  const plannedCount = dayChapters.filter(c => c.day.meta.status === 'planned').length;
  const openCount = dayChapters.filter(c => c.day.meta.status === 'open').length;
  const totalKm = calculateTotalDistance(transport);

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
        <h2>${formatDate(dates.start)} — ${formatDate(dates.end)}</h2>
        <div class="overview-stats">
          <div class="stat"><span class="stat-value">${Object.keys(TripStore.locations).length + 1}</span><span class="stat-label">Countries</span></div>
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
      : renderDayCard(ch, dates.start);
    html += `<section class="chapter ${ch.type}" id="${ch.id}">${inner}</section>`;
  });

  html += `
    <div class="footer">
      <div class="footer-stats">${Object.keys(TripStore.locations).length + 1} countries · ${flightCount} flights · ${dayChapters.length} days · ${totalKm.toLocaleString()} km</div>
      <div class="footer-route">${trip.origin.city} → ${Object.values(TripStore.locations).map(l => l.name).join(' → ')} → Home</div>
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

  const flightImage = journey.image
    ? `<div class="flight-image"><img src="${journey.image}" alt="${journey.label}" loading="lazy" onerror="this.parentElement.remove()"></div>`
    : '';

  return `
    <div class="card flight-card" data-airline="${airlineCode}">
      ${flightImage}
      <div class="card-label">✈ Flight · ${formatDate(String(journey.date))}</div>
      <h2>${journey.label}</h2>
      <div class="flight-legs">${legs}</div>
      ${layovers}
      <div class="total-duration">Total: ${journey.totalDuration}</div>
    </div>
  `;
}

function renderDayCard(chapter, tripStart) {
  const day = chapter.day;
  const status = day.meta.status || 'open';

  const start = new Date(tripStart + 'T00:00:00');
  const current = new Date(day.meta.date + 'T00:00:00');
  const dayNum = Math.round((current - start) / 86400000) + 1;

  const dayPois = TripStore.resolvePois(day.meta.pois || []);
  const images = dayPois.filter(p => p.image).slice(0, 4);
  const imageStrip = images.length > 0
    ? `<div class="day-images">${images.map(p =>
        `<img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.remove()">`
      ).join('')}</div>`
    : '';

  let contentHtml = '<ul>';
  (day.activities || []).forEach(activity => {
    const poi = TripStore.allPois[activity.poi];
    if (poi) {
      const color = CATEGORY_COLORS[poi.category] || '#4ecdc4';
      const poiLink = `<span class="poi-link" data-poi="${poi.id}"><span class="poi-inline-pin"><span class="poi-inline-pin-body" style="background:${color}"></span><span class="poi-inline-pin-tail" style="border-top-color:${color}"></span><span class="poi-inline-pin-inner"></span></span>${poi.name}</span>`;
      const notes = activity.notes ? ` — ${activity.notes}` : '';
      contentHtml += `<li>${poiLink}${notes}</li>`;
    }
  });
  contentHtml += '</ul>';

  if (day.notes) {
    contentHtml += `<p class="day-notes">${day.notes}</p>`;
  }

  return `
    <div class="card day-card" data-city="${day.meta.city || ''}">
      ${imageStrip}
      <div class="day-header">
        <div class="day-number">Day ${dayNum}</div>
        <div class="card-label">
          <span class="status ${status}">${status}</span>
          ${formatDate(day.meta.date)}
        </div>
      </div>
      <h2>${day.meta.title || day.meta.date}</h2>
      <div class="day-content">${contentHtml}</div>
    </div>
  `;
}

function formatTime(isoString) {
  return String(isoString).split('T')[1].substring(0, 5);
}

function formatDate(dateStr) {
  const d = new Date(String(dateStr) + 'T12:00:00');
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

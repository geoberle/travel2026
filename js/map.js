const STYLE_DARK = 'mapbox://styles/mapbox/dark-v11';
const STYLE_STANDARD = 'mapbox://styles/mapbox/standard';

let _currentStyle = 'dark';
let _journeys = null;
let _pendingHighlight = null;

function initMap(containerId, token) {
  mapboxgl.accessToken = token;

  const map = new mapboxgl.Map({
    container: containerId,
    style: STYLE_DARK,
    center: [115, 20],
    zoom: 3,
    projection: 'globe',
    pitch: 20,
    interactive: false
  });

  map.on('style.load', () => {
    if (_currentStyle === 'dark') {
      map.setFog({
        color: 'rgb(15, 15, 25)',
        'high-color': 'rgb(30, 30, 60)',
        'horizon-blend': 0.06,
        'space-color': 'rgb(8, 8, 12)',
        'star-intensity': 0.5
      });
    } else {
      map.setConfigProperty('basemap', 'lightPreset', 'night');
    }

    if (_journeys) {
      _addRouteLayers(map, _journeys);
      if (_pendingHighlight) {
        highlightRoute(map, _pendingHighlight);
        _pendingHighlight = null;
      }
    }
  });

  return map;
}

function switchStyle(map, style) {
  if (style === _currentStyle) return false;
  _currentStyle = style;
  map.setStyle(style === 'dark' ? STYLE_DARK : STYLE_STANDARD);
  return true;
}

function _addRouteLayers(map, journeys) {
  journeys.forEach(journey => {
    const coords = [];
    journey.legs.forEach(leg => {
      if (coords.length === 0) coords.push(leg.departure.coordinates);
      coords.push(leg.arrival.coordinates);
    });

    map.addSource(`route-${journey.id}`, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords }
      }
    });

    map.addLayer({
      id: `route-${journey.id}`,
      type: 'line',
      source: `route-${journey.id}`,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#4ecdc4',
        'line-width': 2.5,
        'line-opacity': 0.6
      }
    });
  });
}

function addDrivingRoute(map, origin, firstAirportCoords) {
  map.addSource('drive-to-airport', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [origin.coordinates, firstAirportCoords]
      }
    }
  });

  map.addLayer({
    id: 'drive-to-airport',
    type: 'line',
    source: 'drive-to-airport',
    paint: {
      'line-color': '#e8e8f0',
      'line-width': 1.5,
      'line-opacity': 0.4,
      'line-dasharray': [3, 3]
    }
  });
}

function addFlightRoutes(map, journeys) {
  _journeys = journeys;
  _addRouteLayers(map, journeys);
}

function addAirportMarkers(map, journeys) {
  const airports = new Map();
  journeys.forEach(j => {
    j.legs.forEach(leg => {
      airports.set(leg.departure.airport, leg.departure);
      airports.set(leg.arrival.airport, leg.arrival);
    });
  });

  airports.forEach((info, code) => {
    const el = document.createElement('div');
    el.className = 'airport-marker';
    el.textContent = code;
    new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat(info.coordinates)
      .addTo(map);
  });
}

function addAccommodationMarkers(map, accommodations) {
  accommodations.forEach(acc => {
    const el = document.createElement('div');
    el.className = 'accommodation-marker';
    new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat(acc.coordinates)
      .addTo(map);
  });
}

function addOriginMarker(map, origin) {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'center';

  const dot = document.createElement('div');
  dot.className = 'origin-marker';
  wrapper.appendChild(dot);

  const label = document.createElement('div');
  label.className = 'origin-label';
  label.textContent = origin.city;
  wrapper.appendChild(label);

  new mapboxgl.Marker({ element: wrapper, anchor: 'top' })
    .setLngLat(origin.coordinates)
    .addTo(map);
}

function flyToGlobe(map) {
  switchStyle(map, 'dark');
  map.flyTo({
    center: [115, 20],
    zoom: 3,
    bearing: 0,
    pitch: 20,
    duration: 2000
  });
  resetRouteHighlights(map);
}

function flyToChapter(map, chapter) {
  if (chapter.type === 'flight') {
    flyToFlight(map, chapter.journey);
  } else if (chapter.type === 'day') {
    flyToDay(map, chapter.day);
  }
}

function flyToFlight(map, journey) {
  const changed = switchStyle(map, 'dark');
  if (changed) {
    _pendingHighlight = journey.id;
  } else {
    highlightRoute(map, journey.id);
  }

  if (journey.mapView) {
    map.flyTo({
      center: journey.mapView.center,
      zoom: journey.mapView.zoom,
      bearing: 0,
      pitch: journey.mapView.pitch || 25,
      duration: 2500
    });
    return;
  }

  const first = journey.legs[0].departure.coordinates;
  const last = journey.legs[journey.legs.length - 1].arrival.coordinates;
  const center = [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2];
  const dist = Math.sqrt(
    Math.pow(first[0] - last[0], 2) + Math.pow(first[1] - last[1], 2)
  );
  const zoom = dist > 80 ? 2.2 : dist > 40 ? 3 : 4;

  map.flyTo({
    center,
    zoom,
    bearing: 0,
    pitch: 25,
    duration: 2500
  });
}

function flyToDay(map, day) {
  switchStyle(map, 'standard');
  const coords = day.meta.coordinates;
  const zoom = parseFloat(day.meta.zoom) || 13;

  if (coords) {
    map.flyTo({
      center: coords,
      zoom,
      bearing: -15,
      pitch: 50,
      duration: 2000
    });
  }

  resetRouteHighlights(map);
}

function highlightRoute(map, journeyId) {
  ['outbound', 'singapore-seoul', 'return'].forEach(id => {
    const layerId = `route-${id}`;
    if (map.getLayer(layerId)) {
      const active = id === journeyId;
      map.setPaintProperty(layerId, 'line-opacity', active ? 1 : 0.12);
      map.setPaintProperty(layerId, 'line-width', active ? 4 : 1.5);
    }
  });
}

function resetRouteHighlights(map) {
  ['outbound', 'singapore-seoul', 'return'].forEach(id => {
    const layerId = `route-${id}`;
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'line-opacity', 0.6);
      map.setPaintProperty(layerId, 'line-width', 2.5);
    }
  });
}

let activePoiMarkers = [];
let activeFlightAnimation = null;
let activePulseMarkers = [];
let activePlaneMarker = null;

function interpolateCoords(coords, numPoints) {
  const result = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const [x1, y1] = coords[i];
    const [x2, y2] = coords[i + 1];
    const steps = Math.max(1, Math.round(numPoints / (coords.length - 1)));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      result.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
    }
  }
  result.push(coords[coords.length - 1]);
  return result;
}

function animateFlightArc(map, journey) {
  cancelFlightAnimation();

  const coords = [];
  journey.legs.forEach(leg => {
    if (coords.length === 0) coords.push(leg.departure.coordinates);
    coords.push(leg.arrival.coordinates);
  });

  const interpolated = interpolateCoords(coords, 120);
  const departure = coords[0];
  const arrival = coords[coords.length - 1];

  const dist = haversine(departure[1], departure[0], arrival[1], arrival[0]);
  const duration = Math.min(4000, Math.max(2000, dist / 5));

  const staticLayerId = `route-${journey.id}`;
  if (map.getLayer(staticLayerId)) {
    map.setPaintProperty(staticLayerId, 'line-opacity', 0);
  }

  const animSourceId = `anim-${journey.id}`;
  const animLayerId = `anim-line-${journey.id}`;
  const glowLayerId = `anim-glow-${journey.id}`;

  if (map.getSource(animSourceId)) {
    map.removeLayer(glowLayerId);
    map.removeLayer(animLayerId);
    map.removeSource(animSourceId);
  }

  map.addSource(animSourceId, {
    type: 'geojson',
    data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [interpolated[0]] } }
  });

  map.addLayer({
    id: glowLayerId,
    type: 'line',
    source: animSourceId,
    paint: {
      'line-color': '#4ecdc4',
      'line-width': 10,
      'line-opacity': 0.15,
      'line-blur': 8
    }
  });

  map.addLayer({
    id: animLayerId,
    type: 'line',
    source: animSourceId,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#4ecdc4',
      'line-width': 3.5,
      'line-opacity': 1
    }
  });

  addPulseMarker(map, departure);

  const planeEl = document.createElement('div');
  planeEl.className = 'plane-marker';
  planeEl.textContent = '✈';
  activePlaneMarker = new mapboxgl.Marker({ element: planeEl, anchor: 'center', rotationAlignment: 'map' })
    .setLngLat(interpolated[0])
    .addTo(map);

  let frame = 0;
  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);
    const eased = 1 - Math.pow(1 - progress, 3);

    const idx = Math.min(Math.floor(eased * (interpolated.length - 1)), interpolated.length - 1);
    const currentCoords = interpolated.slice(0, idx + 1);

    map.getSource(animSourceId).setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: currentCoords }
    });

    const pos = interpolated[idx];
    activePlaneMarker.setLngLat(pos);

    if (idx > 0) {
      const prev = interpolated[Math.max(0, idx - 3)];
      const bearing = Math.atan2(pos[0] - prev[0], pos[1] - prev[1]) * 180 / Math.PI;
      activePlaneMarker.setRotation(bearing);
    }

    if (progress < 1) {
      activeFlightAnimation = requestAnimationFrame(step);
    } else {
      addPulseMarker(map, arrival);
      activeFlightAnimation = null;
    }
  }

  activeFlightAnimation = requestAnimationFrame(step);
}

function cancelFlightAnimation() {
  if (activeFlightAnimation) {
    cancelAnimationFrame(activeFlightAnimation);
    activeFlightAnimation = null;
  }
  if (activePlaneMarker) {
    activePlaneMarker.remove();
    activePlaneMarker = null;
  }
  activePulseMarkers.forEach(m => m.remove());
  activePulseMarkers = [];
}

function addPulseMarker(map, coords) {
  const el = document.createElement('div');
  el.className = 'pulse-marker';
  el.innerHTML = '<div class="pulse-ring"></div><div class="pulse-dot"></div>';
  const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
    .setLngLat(coords)
    .addTo(map);
  activePulseMarkers.push(marker);
}

function showPoiMarkers(map, pois, showLabels) {
  pois.forEach(poi => {
    const color = CATEGORY_COLORS[poi.category] || '#4ecdc4';

    const wrapper = document.createElement('div');
    wrapper.className = 'poi-marker-wrapper';

    const pin = document.createElement('div');
    pin.className = 'poi-pin';

    const body = document.createElement('div');
    body.className = 'poi-pin-body';
    body.style.background = color;
    pin.appendChild(body);

    const tail = document.createElement('div');
    tail.className = 'poi-pin-tail';
    tail.style.borderTop = `14px solid ${color}`;
    pin.appendChild(tail);

    const inner = document.createElement('div');
    inner.className = 'poi-pin-inner';
    pin.appendChild(inner);

    wrapper.appendChild(pin);

    if (showLabels) {
      const label = document.createElement('div');
      label.className = 'poi-marker-label';
      label.textContent = poi.name;
      wrapper.appendChild(label);
    }

    const marker = new mapboxgl.Marker({ element: wrapper, anchor: 'bottom' })
      .setLngLat(poi.coordinates)
      .addTo(map);

    activePoiMarkers.push(marker);
  });
}

function clearPoiMarkers(map) {
  activePoiMarkers.forEach(m => m.remove());
  activePoiMarkers = [];
}

function fitToPoiBounds(map, pois, accommodation) {
  if (pois.length === 0) return;

  const bounds = new mapboxgl.LngLatBounds();
  pois.forEach(poi => bounds.extend(poi.coordinates));
  if (accommodation) bounds.extend(accommodation.coordinates);

  map.fitBounds(bounds, {
    padding: { top: 80, bottom: 80, left: 450, right: 80 },
    bearing: -15,
    pitch: 50,
    duration: 2000,
    maxZoom: 15
  });
}

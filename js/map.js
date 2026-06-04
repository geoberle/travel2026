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

const STYLE_DARK = 'mapbox://styles/mapbox/dark-v11';
const STYLE_STANDARD = 'mapbox://styles/mapbox/standard';

let _currentStyle = 'dark';
let _journeys = null;
let _pendingHighlight = null;
let _accommodations = null;

function initMap(containerId, token) {
  mapboxgl.accessToken = token;

  const map = new mapboxgl.Map({
    container: containerId,
    style: STYLE_DARK,
    center: [82, 28],
    zoom: 3,
    projection: 'globe',
    pitch: 20,
    interactive: true
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

    map.getStyle().layers.forEach(layer => {
      if (layer.id.includes('poi') && layer.type === 'symbol') {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      }
    });

    if (_journeys) {
      _addRouteLayers(map, _journeys);
      if (_pendingHighlight) {
        highlightRoute(map, _pendingHighlight);
        _pendingHighlight = null;
      }
    }

    if (_accommodations) {
      addAccommodationMarkers(map, _accommodations);
    }

    if (_activePois.length > 0) {
      showPoiMarkers(map, _activePois, true);
    }
  });

  map.scrollZoom.disable();
  map.doubleClickZoom.disable();

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
      if (leg.route) {
        if (coords.length === 0 || coords[coords.length - 1].toString() !== leg.route[0].toString()) {
          coords.push(...leg.route);
        } else {
          coords.push(...leg.route.slice(1));
        }
      } else {
        if (coords.length === 0) coords.push(leg.departure.coordinates);
        coords.push(leg.arrival.coordinates);
      }
    });

    if (map.getSource(`route-${journey.id}`)) return;

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

function addTransitRoutes(map, journeys) {
  _journeys = journeys;
  _addRouteLayers(map, journeys);
}

function addAirportMarkers(map, journeys) {
  const stops = new Map();
  journeys.forEach(j => {
    j.legs.forEach(leg => {
      const depKey = leg.departure.airport || leg.departure.city;
      const arrKey = leg.arrival.airport || leg.arrival.city;
      if (depKey && leg.departure.coordinates) stops.set(depKey, leg.departure);
      if (arrKey && leg.arrival.coordinates) stops.set(arrKey, leg.arrival);
    });
  });

  stops.forEach((info, code) => {
    const el = document.createElement('div');
    el.className = 'airport-marker';
    el.textContent = code;
    new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat(info.coordinates)
      .addTo(map);
  });
}

let _accommodationMarkers = [];

function addAccommodationMarkers(map, accommodations) {
  _accommodations = accommodations;
  _accommodationMarkers.forEach(m => m.remove());
  _accommodationMarkers = [];

  const stayColor = '#ff6b6b';

  accommodations.forEach(acc => {
    const el = document.createElement('div');
    el.className = 'poi-circle-marker no-img';
    el.textContent = '🏠';
    el.style.borderColor = stayColor;
    el.style.boxShadow = `0 0 12px ${stayColor}88, 0 0 4px rgba(255,255,255,0.3)`;
    el.style.fontSize = '1.2rem';

    const label = document.createElement('div');
    label.className = 'poi-marker-label';
    label.textContent = acc.neighborhood;

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (activePopup) activePopup.remove();
      activePopup = new mapboxgl.Popup({ offset: [0, -30], anchor: 'bottom', maxWidth: '320px', closeButton: true })
        .setLngLat(acc.coordinates)
        .setHTML(`<div class="poi-popup-body"><strong>${acc.neighborhood}</strong><div class="poi-popup-desc">${acc.type}${acc.config ? ' · ' + acc.config : ''}</div></div>`)
        .addTo(map);
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'poi-marker-wrap accommodation-wrap';
    wrapper.appendChild(el);
    wrapper.appendChild(label);

    const marker = new mapboxgl.Marker({ element: wrapper, anchor: 'center' })
      .setLngLat(acc.coordinates)
      .addTo(map);

    _accommodationMarkers.push(marker);
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
    center: [82, 28],
    zoom: 3,
    bearing: 0,
    pitch: 20,
    duration: 2000
  });
  resetRouteHighlights(map);
}

function flyToChapter(map, chapter) {
  if (chapter.type === 'transit') {
    flyToTransit(map, chapter.journey);
  } else if (chapter.type === 'day') {
    flyToDay(map, chapter.day);
  }
}

function flyToTransit(map, journey) {
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

  const bounds = new mapboxgl.LngLatBounds();
  journey.legs.forEach(leg => {
    bounds.extend(leg.departure.coordinates);
    bounds.extend(leg.arrival.coordinates);
  });

  map.fitBounds(bounds, {
    padding: { top: 80, bottom: 80, left: 80, right: 80 },
    bearing: 0,
    pitch: 25,
    duration: 2500,
    maxZoom: 10
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
  (_journeys || []).forEach(j => {
    const layerId = `route-${j.id}`;
    if (map.getLayer(layerId)) {
      const active = j.id === journeyId;
      map.setPaintProperty(layerId, 'line-opacity', active ? 1 : 0.12);
      map.setPaintProperty(layerId, 'line-width', active ? 4 : 1.5);
    }
  });
}

function resetRouteHighlights(map) {
  (_journeys || []).forEach(j => {
    const layerId = `route-${j.id}`;
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'line-opacity', 0.6);
      map.setPaintProperty(layerId, 'line-width', 2.5);
    }
  });
}

let activePoiMarkers = [];
let activeFlightAnimation = null;
let _lastMap = null;
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

let _scrollFlightState = null;

function setupScrollDrivenFlight(map, chapter) {
  stopScrollDrivenFlight();
  stopGlobeRotation();

  const journey = chapter.journey;
  const changed = switchStyle(map, 'dark');

  if (changed) {
    map.once('style.load', () => _initFlightLayers(map, chapter));
  } else {
    _initFlightLayers(map, chapter);
  }
}

function _initFlightLayers(map, chapter) {
  const journey = chapter.journey;
  const coords = [];
  journey.legs.forEach(leg => {
    if (leg.route) {
      if (coords.length === 0 || coords[coords.length - 1].toString() !== leg.route[0].toString()) {
        coords.push(...leg.route);
      } else {
        coords.push(...leg.route.slice(1));
      }
    } else {
      if (coords.length === 0) coords.push(leg.departure.coordinates);
      coords.push(leg.arrival.coordinates);
    }
  });

  const interpolated = interpolateCoords(coords, 200);
  const departure = coords[0];
  const arrival = coords[coords.length - 1];

  (_journeys || []).forEach(j => {
    const layerId = `route-${j.id}`;
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'line-opacity', 0);
    }
  });

  const fullRouteId = `full-${journey.id}`;
  const animSourceId = `anim-${journey.id}`;
  const animLayerId = `anim-line-${journey.id}`;
  const glowLayerId = `anim-glow-${journey.id}`;

  [glowLayerId, animLayerId, fullRouteId + '-line'].forEach(lid => {
    if (map.getLayer(lid)) map.removeLayer(lid);
  });
  [animSourceId, fullRouteId].forEach(sid => {
    if (map.getSource(sid)) map.removeSource(sid);
  });

  map.addSource(fullRouteId, {
    type: 'geojson',
    data: { type: 'Feature', geometry: { type: 'LineString', coordinates: interpolated } }
  });

  map.addLayer({
    id: fullRouteId + '-line',
    type: 'line',
    source: fullRouteId,
    paint: { 'line-color': '#4ecdc4', 'line-width': 2, 'line-opacity': 0.2, 'line-dasharray': [3, 3] }
  });

  map.addSource(animSourceId, {
    type: 'geojson',
    data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [interpolated[0]] } }
  });

  map.addLayer({
    id: glowLayerId,
    type: 'line',
    source: animSourceId,
    paint: { 'line-color': '#4ecdc4', 'line-width': 10, 'line-opacity': 0.15, 'line-blur': 8 }
  });

  map.addLayer({
    id: animLayerId,
    type: 'line',
    source: animSourceId,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#4ecdc4', 'line-width': 3.5, 'line-opacity': 1 }
  });

  const mode = getTransitMode(journey);

  if (mode === 'flight') {
    addPulseMarker(map, departure);
  }
  const markerEl = document.createElement('div');
  markerEl.className = 'plane-marker';
  if (mode === 'flight') {
    markerEl.innerHTML = '<svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L10 9H4l2 3.5L4 16h6l2 6 2-6h6l-2-3.5L20 9h-6L12 2z"/></svg>';
  } else {
    markerEl.textContent = MODE_ICONS[mode] || '●';
    markerEl.style.cssText = 'font-size:20px;text-align:center;line-height:32px;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.7));';
  }
  activePlaneMarker = new mapboxgl.Marker({ element: markerEl, anchor: 'center', rotationAlignment: mode === 'flight' ? 'map' : 'viewport' })
    .setLngLat(interpolated[0])
    .addTo(map);

  const sectionEl = document.getElementById(chapter.id);

  let depView;
  if (journey.mapView) {
    depView = journey.mapView;
  } else {
    const routeBounds = new mapboxgl.LngLatBounds();
    journey.legs.forEach(leg => { routeBounds.extend(leg.departure.coordinates); routeBounds.extend(leg.arrival.coordinates); });
    const center = routeBounds.getCenter().toArray();
    depView = { center, pitch: 25 };
  }

  map.setBearing(0);
  let scrollReady = true;

  if (depView.zoom) {
    map.jumpTo({ center: depView.center, zoom: depView.zoom, pitch: depView.pitch || 25, bearing: 0 });
  } else {
    const routeBounds = new mapboxgl.LngLatBounds();
    journey.legs.forEach(leg => { routeBounds.extend(leg.departure.coordinates); routeBounds.extend(leg.arrival.coordinates); });
    map.fitBounds(routeBounds, { padding: { top: 100, bottom: 100, left: 100, right: 100 }, pitch: depView.pitch || 25, bearing: 0, duration: 0, maxZoom: 10 });
  }

  let lastProgress = -1;

  function onScroll() {
    if (!sectionEl || !scrollReady) return;
    const rect = sectionEl.getBoundingClientRect();
    const vh = window.innerHeight;
    const rawProgress = (vh * 0.5 - rect.top) / rect.height;
    const progress = Math.max(0, Math.min(1, rawProgress));

    if (Math.abs(progress - lastProgress) < 0.002) return;
    lastProgress = progress;

    const idx = Math.min(Math.floor(progress * (interpolated.length - 1)), interpolated.length - 1);
    const currentCoords = interpolated.slice(0, idx + 1);

    if (map.getSource(animSourceId)) {
      map.getSource(animSourceId).setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: currentCoords }
      });
    }

    const pos = interpolated[idx];
    if (activePlaneMarker) {
      activePlaneMarker.setLngLat(pos);
      if (mode === 'flight' && idx > 0) {
        const prev = interpolated[Math.max(0, idx - 5)];
        const dLon = (pos[0] - prev[0]) * Math.PI / 180;
        const lat1 = prev[1] * Math.PI / 180;
        const lat2 = pos[1] * Math.PI / 180;
        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        const bearing = Math.atan2(y, x) * 180 / Math.PI;
        activePlaneMarker.setRotation(bearing);
      }
    }

    if (depView.zoom && depView.zoom < 5) {
      map.jumpTo({ center: pos, zoom: depView.zoom, bearing: 0, pitch: depView.pitch || 25 });
    }

    if (mode === 'flight' && progress >= 0.99 && !_scrollFlightState.arrivalPulsed) {
      addPulseMarker(map, arrival);
      _scrollFlightState.arrivalPulsed = true;
    }
  }

  _scrollFlightState = {
    animSourceId,
    animLayerId,
    glowLayerId,
    fullRouteId,
    journeyId: journey.id,
    onScroll,
    arrivalPulsed: false
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function stopScrollDrivenFlight() {
  if (!_scrollFlightState) return;
  window.removeEventListener('scroll', _scrollFlightState.onScroll);
  _scrollFlightState = null;

  if (activePlaneMarker) {
    activePlaneMarker.remove();
    activePlaneMarker = null;
  }
  activePulseMarkers.forEach(m => m.remove());
  activePulseMarkers = [];
}

function cancelFlightAnimation() {
  stopScrollDrivenFlight();
  if (activeFlightAnimation) {
    cancelAnimationFrame(activeFlightAnimation);
    activeFlightAnimation = null;
  }
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

function createPinImageData(color, size) {
  const w = size;
  const h = Math.round(size * 1.4);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  const cx = w / 2;
  const r = w / 2 - 2;
  const tipY = h - 2;

  ctx.beginPath();
  ctx.arc(cx, r + 2, r, Math.PI * 0.15, Math.PI * 0.85, true);
  ctx.lineTo(cx, tipY);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, r + 2, r * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();

  return ctx.getImageData(0, 0, w, h);
}

function ensurePinImages(map) {
  Object.entries(CATEGORY_COLORS).forEach(([cat, color]) => {
    const id = `pin-${cat}`;
    if (!map.hasImage(id)) {
      const imageData = createPinImageData(color, 32);
      map.addImage(id, { width: imageData.width, height: imageData.height, data: new Uint8Array(imageData.data.buffer) });
    }
  });
}

let _activePois = [];
let _poiEventsRegistered = false;

function showPoiMarkers(map, pois, showLabels) {
  _lastMap = map;
  _activePois = pois;

  clearPoiMarkers(map);

  pois.forEach(poi => {
    const color = getCategoryColor(poi.category);

    const el = document.createElement('div');
    el.className = 'poi-circle-marker';
    if (poi.image) {
      const img = document.createElement('img');
      img.src = poi.image;
      img.alt = poi.name;
      img.onerror = () => { el.classList.add('no-img'); img.remove(); el.textContent = poi.name.charAt(0); };
      el.appendChild(img);
    } else {
      el.classList.add('no-img');
      el.textContent = poi.name.charAt(0);
    }
    el.style.borderColor = color;
    el.style.boxShadow = `0 0 12px ${color}88, 0 0 4px rgba(255,255,255,0.3)`;
    el.dataset.poiId = poi.id;

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      map.flyTo({ center: poi.coordinates, zoom: 16, duration: 800 });
      map.once('moveend', () => showPoiPopup(map, poi));
    });
    el.addEventListener('mouseenter', () => {
      el.classList.add('active');
      highlightPoi(poi.id, true);
    });
    el.addEventListener('mouseleave', () => {
      el.classList.remove('active');
      highlightPoi(poi.id, false);
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'poi-marker-wrap';
    wrapper.appendChild(el);

    if (showLabels) {
      const label = document.createElement('div');
      label.className = 'poi-marker-label';
      label.textContent = poi.name;
      wrapper.appendChild(label);
    }

    const marker = new mapboxgl.Marker({ element: wrapper, anchor: 'center' })
      .setLngLat(poi.coordinates)
      .addTo(map);

    activePoiMarkers.push(marker);
  });

  setupInlinePoiHover();
}

let activePopup = null;

function showPoiPopup(map, poi) {
  activePopup = showPoiPopupOnMap(map, poi, { offset: [0, -60], removeExisting: activePopup });
}

function highlightPoi(poiId, active) {
  document.querySelectorAll(`.poi-link[data-poi="${poiId}"]`).forEach(el => {
    el.classList.toggle('poi-highlight', active);
  });
  document.querySelectorAll(`.poi-circle-marker[data-poi-id="${poiId}"]`).forEach(el => {
    el.classList.toggle('active', active);
  });
}

function setupInlinePoiHover() {
  document.querySelectorAll('.poi-link[data-poi]').forEach(el => {
    el.addEventListener('mouseenter', () => highlightPoi(el.dataset.poi, true));
    el.addEventListener('mouseleave', () => highlightPoi(el.dataset.poi, false));
    el.addEventListener('click', () => {
      const poi = TripStore.allPois[el.dataset.poi];
      if (poi && _lastMap) {
        _lastMap.flyTo({ center: poi.coordinates, zoom: 15, duration: 1000 });
        _lastMap.once('moveend', () => showPoiPopup(_lastMap, poi));
      }
    });
  });
}

function clearPoiMarkers(map) {
  activePoiMarkers.forEach(m => m.remove());
  activePoiMarkers = [];
  _activePois = [];
  if (activePopup) { activePopup.remove(); activePopup = null; }
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

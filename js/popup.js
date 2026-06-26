const CATEGORY_COLORS = {
  attraction: '#4ecdc4', food: '#ff9f43', culture: '#a55eea',
  shopping: '#fd79a8', nature: '#00b894', transport: '#636e72'
};

const TAG_SPECIAL = {
  'sini-recommended': { css: 'recommended', label: 'Sini ⭐' },
  'tourist-trap': { css: 'tourist-trap', label: '⚠️ tourist trap' }
};

function getCategoryColor(category) {
  return CATEGORY_COLORS[category] || '#4ecdc4';
}

function renderTagsHtml(tags, baseClass) {
  if (!tags || tags.length === 0) return '';
  return tags.map(t => {
    const s = TAG_SPECIAL[t];
    return `<span class="${baseClass}${s ? ' ' + s.css : ''}">${s ? s.label : t}</span>`;
  }).join('');
}

function buildPopupHtml(poi) {
  const color = getCategoryColor(poi.category);

  const imgHtml = poi.image
    ? `<img src="${poi.image}" alt="${poi.name}" onerror="this.remove()" class="poi-popup-img">`
    : '';

  const categoryLabel = poi.category
    ? `<span class="poi-popup-category" style="background:${color}20;color:${color}">${poi.category}</span>`
    : '';

  const linkHtml = poi.url
    ? `<a href="${poi.url}" target="_blank" rel="noopener" class="poi-popup-link">Visit website →</a>`
    : '';

  const tagsHtml = (poi.tags && poi.tags.length)
    ? `<div class="poi-popup-tags">${renderTagsHtml(poi.tags, 'poi-popup-tag')}</div>`
    : '';

  let metaHtml = '';
  if (poi.duration) {
    const s = poi.setting === 'indoor' ? ' · Indoor' : poi.setting === 'outdoor' ? ' · Outdoor' : poi.setting === 'both' ? ' · Indoor & Outdoor' : '';
    metaHtml += `<div class="poi-popup-meta">⏱ ${poi.duration}${s}</div>`;
  }
  if (poi.neighborhood) metaHtml += `<div class="poi-popup-meta">📍 ${poi.neighborhood}</div>`;
  if (poi.hours) metaHtml += `<div class="poi-popup-meta">🕐 ${poi.hours}</div>`;
  if (poi.cost) metaHtml += `<div class="poi-popup-meta">💰 ${poi.cost}</div>`;

  return `${imgHtml}<div class="poi-popup-body"><div class="poi-popup-header">${categoryLabel}<strong>${poi.name}</strong></div><p class="poi-popup-desc">${poi.description || ''}</p>${tagsHtml}${metaHtml}${linkHtml}</div>`;
}

const POPUP_HEIGHT_ESTIMATE = 380;

function showPoiPopupOnMap(map, poi, opts = {}) {
  const offset = opts.offset || [0, -30];
  if (opts.removeExisting) opts.removeExisting.remove();
  const popup = new mapboxgl.Popup({ offset, anchor: 'bottom', maxWidth: '320px', closeButton: true })
    .setLngLat(poi.coordinates)
    .setHTML(buildPopupHtml(poi))
    .addTo(map);
  return popup;
}

function popupFlyTo(map, coords, opts = {}) {
  const zoom = opts.zoom || 14;
  const duration = opts.duration || 800;
  map.flyTo({ center: coords, zoom, duration, offset: [0, POPUP_HEIGHT_ESTIMATE / 2] });
}

let _timelineNodes = [];
let _collapseTimer = null;

function initTimeline(chapters) {
  const timeline = document.createElement('div');
  timeline.id = 'timeline';
  timeline.className = 'timeline';

  const handle = document.createElement('div');
  handle.className = 'timeline-handle';
  handle.innerHTML = '&#x276F;';
  handle.addEventListener('click', () => {
    timeline.classList.toggle('expanded');
    handle.innerHTML = timeline.classList.contains('expanded') ? '&#x276E;' : '&#x276F;';
  });

  const content = document.createElement('div');
  content.className = 'timeline-content';

  const overviewNode = _createNode('overview', 'Overview', null, null);
  content.appendChild(overviewNode);

  chapters.forEach(ch => {
    let label, icon, city;
    if (ch.type === 'flight') {
      const legs = ch.journey.legs.filter(l => l.mode !== 'drive');
      const first = legs[0]?.departure.airport || '';
      const last = legs[legs.length - 1]?.arrival.airport || '';
      label = `${first} → ${last}`;
      icon = '✈';
      city = null;
    } else {
      const d = new Date(ch.day.meta.date + 'T12:00:00');
      const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      label = ch.day.meta.title || ch.day.meta.date;
      icon = dateStr;
      city = ch.day.meta.city || null;
    }

    const node = _createNode(ch.id, label, icon, city);
    content.appendChild(node);
  });

  timeline.appendChild(handle);
  timeline.appendChild(content);
  document.body.appendChild(timeline);
}

function _createNode(targetId, label, icon, city) {
  const node = document.createElement('div');
  node.className = 'timeline-node';
  node.dataset.target = targetId;
  if (city) node.dataset.city = city;

  const dot = document.createElement('div');
  dot.className = 'timeline-dot';

  const text = document.createElement('div');
  text.className = 'timeline-text';

  if (icon) {
    const iconEl = document.createElement('div');
    iconEl.className = 'timeline-icon';
    iconEl.textContent = icon;
    text.appendChild(iconEl);
  }

  const labelEl = document.createElement('div');
  labelEl.className = 'timeline-label';
  labelEl.textContent = label;
  text.appendChild(labelEl);

  node.appendChild(dot);
  node.appendChild(text);

  node.addEventListener('click', () => {
    const target = document.getElementById(targetId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
    clearTimeout(_collapseTimer);
    _collapseTimer = setTimeout(() => {
      const timeline = document.getElementById('timeline');
      timeline.classList.remove('expanded');
      timeline.querySelector('.timeline-handle').innerHTML = '&#x276F;';
    }, 600);
  });

  _timelineNodes.push(node);
  return node;
}

function updateTimelineActive(chapterId) {
  _timelineNodes.forEach(node => {
    node.classList.toggle('active', node.dataset.target === chapterId);
  });
}

// ===== World map: D3 Equal Earth projection drawn onto a <canvas> =====
// Equal Earth keeps country sizes proportionally accurate, unlike the Web Mercator
// projection used by raster tile basemaps, which inflates area near the poles.
//
// The map is drawn on a canvas rather than as SVG paths. With SVG, every pan/zoom
// frame made the browser re-rasterize ~260 vector paths (plus non-scaling strokes),
// which was very sluggish on phones. On canvas, each country's outline is projected
// once into a cached Path2D, and a frame is just "set transform, fill, stroke".

const GEOJSON_URL = 'data/countries.geojson';
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.6;
// 3x phone screens would triple the per-frame fill cost for no visible gain.
const MAX_PIXEL_RATIO = 2;
const POPUP_EDGE_MARGIN = 8;
const POPUP_ARROW_SIZE = 14;

const COLORS = {
  land: '#ecf0f1',
  landHover: '#cfd8dc',
  border: '#2c3e50',
};

// Countries whose lookups are intentionally redirected to another country's data.
const COUNTRY_OVERRIDES = {
  ISR: { name: 'Palestine', isoCode: 'PSE' },
  TWN: { name: 'China', isoCode: 'CHN' },
};

const container = document.getElementById('map');
const canvas = document.getElementById('map-canvas');
const ctx = canvas.getContext('2d');
const popupEl = document.getElementById('country-popup');

const projection = d3.geoEqualEarth();
const geoPath = d3.geoPath(projection);

let features = [];
let countries = []; // { feature, path: Path2D, bounds }, rebuilt whenever the projection is refit
let landPath = null; // every country in one Path2D, so the base map is a single fill + stroke
let transform = d3.zoomIdentity;
let hovered = null;
let width = 0;
let height = 0;
let pixelRatio = 1;
let drawScheduled = false;

// ===== Rendering =====

function scheduleDraw() {
  if (drawScheduled) return;
  drawScheduled = true;
  requestAnimationFrame(draw);
}

function draw() {
  drawScheduled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!landPath) return;

  const { k, x, y } = transform;
  ctx.setTransform(pixelRatio * k, 0, 0, pixelRatio * k, pixelRatio * x, pixelRatio * y);
  ctx.lineWidth = 1 / k; // keep borders 1px thick at every zoom level
  ctx.lineJoin = 'round';
  ctx.strokeStyle = COLORS.border;

  ctx.fillStyle = COLORS.land;
  ctx.fill(landPath);
  if (hovered) {
    ctx.fillStyle = COLORS.landHover;
    ctx.fill(hovered.path);
  }
  ctx.stroke(landPath);
}

function buildPaths() {
  countries = features.map((feature) => {
    const path = new Path2D();
    d3.geoPath(projection, path)(feature);
    return { feature, path, bounds: geoPath.bounds(feature) };
  });
  landPath = new Path2D();
  d3.geoPath(projection, landPath)({ type: 'FeatureCollection', features });
}

// Returns the topmost country under a point given in screen (CSS pixel) coordinates.
function countryAt([px, py]) {
  const [x, y] = transform.invert([px, py]);
  ctx.setTransform(1, 0, 0, 1, 0, 0); // isPointInPath tests in untransformed path space
  for (let i = countries.length - 1; i >= 0; i--) {
    const country = countries[i];
    const [[x0, y0], [x1, y1]] = country.bounds;
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    if (ctx.isPointInPath(country.path, x, y)) return country;
  }
  return null;
}

// ===== Zoom & resize =====

const zoom = d3.zoom()
  .scaleExtent([1, MAX_ZOOM])
  .on('zoom', (event) => {
    transform = event.transform;
    scheduleDraw();
    positionPopup();
  });

const canvasSelection = d3.select(canvas).call(zoom);

document.getElementById('zoom-in').addEventListener('click', () => {
  canvasSelection.transition().duration(200).call(zoom.scaleBy, ZOOM_STEP);
});
document.getElementById('zoom-out').addEventListener('click', () => {
  canvasSelection.transition().duration(200).call(zoom.scaleBy, 1 / ZOOM_STEP);
});

function resize() {
  const { clientWidth: w, clientHeight: h } = container;
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  if (w === width && h === height && ratio === pixelRatio) return;
  width = w;
  height = h;
  pixelRatio = ratio;

  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  projection.fitSize([w, h], { type: 'Sphere' });
  buildPaths();
  zoom.extent([[0, 0], [w, h]]);
  zoom.translateExtent([[-w * 0.5, -h * 0.5], [w * 1.5, h * 1.5]]);

  // Refitting the projection invalidates the popup's anchor and the current zoom
  // transform, so reset both. (The zoom reset also triggers a redraw.)
  hidePopup();
  canvasSelection.call(zoom.transform, d3.zoomIdentity);
}

let resizeScheduled = false;
window.addEventListener('resize', () => {
  if (resizeScheduled) return;
  resizeScheduled = true;
  requestAnimationFrame(() => {
    resizeScheduled = false;
    resize();
  });
});

// ===== Pointer interaction =====

// d3-zoom swallows the click that ends a drag, so this only fires for real clicks/taps.
canvas.addEventListener('click', (event) => {
  const country = countryAt(d3.pointer(event, canvas));
  if (country) {
    openCountry(country.feature);
  } else {
    hidePopup();
  }
});

// Hover highlight (mouse only: touch has no hover, and skipping it saves work on phones).
canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType !== 'mouse' || event.buttons) return;
  setHovered(countryAt(d3.pointer(event, canvas)));
});
canvas.addEventListener('pointerleave', () => setHovered(null));

function setHovered(country) {
  if (country === hovered) return;
  hovered = country;
  canvas.classList.toggle('over-country', Boolean(country));
  scheduleDraw();
}

// ===== Popup =====
// Anchored to the clicked country's projected centroid, so it tracks the country
// across pan/zoom. Its size is measured once per content change; positioning during
// zoom is pure arithmetic + a transform, so it never forces a layout mid-gesture.

let popupAnchor = null;
let popupWidth = 0;
let popupHeight = 0;
let popupRequestId = 0;

function positionPopup() {
  if (!popupAnchor) return;
  const [x, y] = transform.apply(popupAnchor);

  // Nudge the box horizontally to stay on-screen (important on narrow phones); the
  // arrow stays pointing at the true anchor.
  let left = x - popupWidth / 2;
  if (left < POPUP_EDGE_MARGIN) {
    left = POPUP_EDGE_MARGIN;
  } else if (left + popupWidth > width - POPUP_EDGE_MARGIN) {
    left = width - POPUP_EDGE_MARGIN - popupWidth;
  }

  popupEl.style.setProperty('--arrow-x', `${x - left}px`);
  popupEl.style.transform = `translate(${left}px, ${y - popupHeight - POPUP_ARROW_SIZE}px)`;
}

function setPopupContent(html) {
  popupEl.innerHTML = html;
  popupEl.classList.add('visible');
  popupWidth = popupEl.offsetWidth;
  popupHeight = popupEl.offsetHeight;
  positionPopup();
}

function hidePopup() {
  popupEl.classList.remove('visible');
  popupAnchor = null;
  popupRequestId++; // ignore any lookup still in flight
}

// Flag images load after the popup is first measured, which changes its height.
popupEl.addEventListener('load', () => {
  popupHeight = popupEl.offsetHeight;
  positionPopup();
}, true);

async function openCountry(feature) {
  const { name, 'ISO3166-1-Alpha-3': isoCode } = feature.properties;
  const lookup = COUNTRY_OVERRIDES[isoCode] ?? { name, isoCode };
  const requestId = ++popupRequestId;

  popupAnchor = geoPath.centroid(feature);
  setPopupContent(`<div class="popup-message">Loading ${escapeHtml(lookup.name)}...</div>`);

  let html;
  try {
    html = renderCountryInfo(await fetchCountry(lookup.name, lookup.isoCode), lookup.name);
  } catch (err) {
    console.error('Error fetching country:', err);
    html = `
      <div class="popup-message popup-error">
        Could not load data for <strong>${escapeHtml(lookup.name)}</strong>.<br>
        <small>${escapeHtml(err.message)}</small>
      </div>`;
  }
  if (requestId === popupRequestId) setPopupContent(html);
}

// ===== Country data =====

const countryCache = new Map();

// Fetches country data through our backend proxy (which holds the API key).
// Successful lookups are cached, so re-opening a country is instant.
function fetchCountry(name, isoCode) {
  const params = new URLSearchParams(
    isoCode && isoCode !== '-99' ? { isoCode } : { countryName: name },
  );
  const key = params.toString();
  if (!countryCache.has(key)) {
    const request = requestCountry(key, name);
    countryCache.set(key, request);
    request.catch(() => countryCache.delete(key));
  }
  return countryCache.get(key);
}

async function requestCountry(query, name) {
  const response = await fetch(`/api/countries?${query}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }
  const country = (await response.json()).data?.objects?.[0];
  if (!country) throw new Error(`No country data found for ${name}`);
  return country;
}

function renderCountryInfo(country, fallbackName) {
  const name = country.names?.common || fallbackName;
  const capital = country.capitals?.[0]?.name || 'N/A';
  const continent = country.continents?.[0] || country.region || 'N/A';
  const population = (country.population ?? 0).toLocaleString('en-US');
  const flagUrl = country.flag?.url_png || country.flag?.url_svg;

  return `
    <div class="country-info">
      ${flagUrl ? `<img class="country-flag" src="${escapeHtml(flagUrl)}" alt="Flag of ${escapeHtml(name)}" />` : ''}
      <h3>${escapeHtml(name)}</h3>
      <p><strong>Capital:</strong> ${escapeHtml(capital)}</p>
      <p><strong>Continent:</strong> ${escapeHtml(continent)}</p>
      <p><strong>Population:</strong> ${population}</p>
      <a href="https://www.britannica.com/search?query=${encodeURIComponent(name)}" target="_blank" rel="noopener">More info →</a>
    </div>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== GeoJSON winding =====
// d3-geo requires each polygon's exterior ring wound clockwise (negative planar
// signed area in lon/lat) and holes wound counter-clockwise. A ring that breaks this
// convention confuses d3's antimeridian clipping into stitching the entire map frame
// onto that feature's path — a huge invisible shape overlapping other countries.

function ringSignedArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function fixPolygonWinding(rings) {
  rings.forEach((ring, i) => {
    const area = ringSignedArea(ring);
    if (i === 0 ? area > 0 : area < 0) ring.reverse();
  });
}

function normalizeWinding(data) {
  for (const { geometry } of data.features) {
    if (geometry?.type === 'Polygon') {
      fixPolygonWinding(geometry.coordinates);
    } else if (geometry?.type === 'MultiPolygon') {
      geometry.coordinates.forEach(fixPolygonWinding);
    }
  }
  return data;
}

// ===== Boot =====

resize();

fetch(GEOJSON_URL)
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return response.json();
  })
  .then((data) => {
    features = normalizeWinding(data).features;
    buildPaths();
    scheduleDraw();
  })
  .catch((error) => console.error('Failed to load GeoJSON:', error));

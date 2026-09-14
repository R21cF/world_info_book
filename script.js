// ===== World map rendered with D3 + an Equal Earth (equal-area) projection =====
// Equal Earth keeps country sizes proportionally accurate, unlike the Web Mercator
// projection used by raster tile basemaps (OpenStreetMap, Google Maps, etc.), which
// inflates area near the poles. Raster tiles are locked to Mercator, so instead of a
// tile layer we render the country GeoJSON directly as SVG paths.

const mapContainer = document.getElementById('map');

const svg = d3.select(mapContainer).append('svg').attr('id', 'map-svg');
const g = svg.append('g');
const oceanPath = g.append('path').attr('class', 'ocean');
const countriesGroup = g.append('g').attr('class', 'countries');

const projection = d3.geoEqualEarth();
const geoPath = d3.geoPath(projection);

const zoom = d3.zoom()
  .scaleExtent([1, 8])
  .on('zoom', (event) => {
    g.attr('transform', event.transform);
    updatePopupPosition();
  });

svg.call(zoom);

// Close the popup when clicking the ocean/background instead of a country.
svg.on('click', (event) => {
  if (event.target === svg.node() || event.target === oceanPath.node()) {
    hidePopup();
  }
});

function sizeMap() {
  const width = mapContainer.clientWidth;
  const height = mapContainer.clientHeight;

  svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
  projection.fitSize([width, height], { type: 'Sphere' });
  oceanPath.datum({ type: 'Sphere' }).attr('d', geoPath);
  countriesGroup.selectAll('path').attr('d', geoPath);

  zoom.translateExtent([[-width * 0.5, -height * 0.5], [width * 1.5, height * 1.5]]);
  zoom.extent([[0, 0], [width, height]]);

  // Refitting the projection invalidates any open popup's centroid and the current
  // zoom transform's math, so reset both.
  hidePopup();
  svg.call(zoom.transform, d3.zoomIdentity);
}

// ===== Zoom controls (top-right, mirrors the old Leaflet zoom control) =====
const zoomControls = document.createElement('div');
zoomControls.id = 'map-zoom-controls';
zoomControls.innerHTML = `
  <button type="button" class="map-zoom-btn" id="zoom-in" aria-label="Zoom in">+</button>
  <button type="button" class="map-zoom-btn" id="zoom-out" aria-label="Zoom out">&minus;</button>
`;
mapContainer.appendChild(zoomControls);

document.getElementById('zoom-in').addEventListener('click', () => {
  svg.transition().duration(200).call(zoom.scaleBy, 1.6);
});
document.getElementById('zoom-out').addEventListener('click', () => {
  svg.transition().duration(200).call(zoom.scaleBy, 1 / 1.6);
});

// ===== Popup (replaces Leaflet's L.popup) =====
// Anchored to the clicked feature's projected centroid (not a fixed screen pixel), so it
// tracks the country correctly across zoom/pan just like Leaflet's lat/lng-anchored popup did.
const popupEl = document.createElement('div');
popupEl.id = 'country-popup';
mapContainer.appendChild(popupEl);

let activePopupCentroid = null;

// Keeps the popup box fully inside the map's viewport (important on narrow phone
// screens, where a country near the left/right edge would otherwise render partly
// off-screen) by nudging it horizontally while the CSS arrow stays pointing at the
// true anchor via the same --popup-offset custom property.
function clampPopupToContainer() {
  const margin = 8;
  popupEl.style.setProperty('--popup-offset', '0px');
  const popupRect = popupEl.getBoundingClientRect();
  const containerRect = mapContainer.getBoundingClientRect();
  let offset = 0;
  if (popupRect.left < containerRect.left + margin) {
    offset = (containerRect.left + margin) - popupRect.left;
  } else if (popupRect.right > containerRect.right - margin) {
    offset = (containerRect.right - margin) - popupRect.right;
  }
  if (offset !== 0) {
    popupEl.style.setProperty('--popup-offset', `${offset}px`);
  }
}

function updatePopupPosition() {
  if (!activePopupCentroid) return;
  const [x, y] = d3.zoomTransform(svg.node()).apply(activePopupCentroid);
  popupEl.style.left = `${x}px`;
  popupEl.style.top = `${y}px`;
  clampPopupToContainer();
}

function showPopup(centroid, loadingLabel) {
  activePopupCentroid = centroid;
  popupEl.innerHTML = `<div style="padding: 8px;">Loading ${escapeHtml(loadingLabel)}...</div>`;
  updatePopupPosition();
  popupEl.classList.add('visible');
}

function setPopupContent(html) {
  popupEl.innerHTML = html;
  clampPopupToContainer();
}

function hidePopup() {
  popupEl.classList.remove('visible');
  activePopupCentroid = null;
}

// GeoJSON source — a locally-hosted, simplified copy of datasets/geo-countries
// (Natural Earth derived), which unlike the previous johan/world.geo.json source
// includes every sovereign micro-state (Cape Verde, Vatican, Tuvalu, etc.) and
// carries real ISO 3166-1 codes per feature.
const geoJsonUrl = 'data/countries.geojson';

// Helper: format population with commas
function formatPopulation(pop) {
  return pop.toLocaleString('en-US');
}

// Helper: escape text before interpolating into innerHTML
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Helper: fetch country data via our secure backend proxy
async function fetchCountryData(countryName, isoCode) {
  const params = new URLSearchParams();
  if (isoCode && isoCode !== '-99') {
    params.append('isoCode', isoCode);
  } else {
    params.append('countryName', countryName);
  }

  const response = await fetch(`/api/countries?${params.toString()}`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  const rawData = await response.json();

  if (!rawData.data?.objects || rawData.data.objects.length === 0) {
    throw new Error('No country data found for ' + countryName);
  }

  const country = rawData.data.objects[0];

  const name = escapeHtml(country.names?.common || countryName);
  const capital = escapeHtml(country.capitals?.[0]?.name || 'N/A');
  const continent = escapeHtml(country.continents?.[0] || country.region || 'N/A');
  const population = country.population ?? 0;
  const flagUrl = country.flag?.url_png || country.flag?.url_svg || '';

  return `
    <div style="min-width: 150px; text-align: center;">
      ${flagUrl ? `<img src="${escapeHtml(flagUrl)}" alt="Flag" style="width: 80px; height: auto; margin-bottom: 8px; border: 1px solid #ccc;" />` : ''}
      <h3 style="margin: 4px 0;">${name}</h3>
      <p style="margin: 4px 0;"><strong>Capital:</strong> ${capital}</p>
      <p style="margin: 4px 0;"><strong>Continent:</strong> ${continent}</p>
      <p style="margin: 4px 0;"><strong>Population:</strong> ${formatPopulation(population)}</p>
      <a href="https://www.britannica.com/search?query=${encodeURIComponent(name)}" target="_blank" rel="noopener" style="display: inline-block; margin-top: 8px; font-size: 0.9em;">More info →</a>
    </div>
  `;
}

function renderCountries(data) {
  countriesGroup.selectAll('path')
    .data(data.features)
    .join('path')
    .attr('class', 'country')
    .attr('d', geoPath)
    .on('click', function (event, feature) {
      event.stopPropagation();

      const props = feature.properties;
      let countryName = props.name;
      let isoCode = props['ISO3166-1-Alpha-3'];

      // ---- Override for Israel → Palestine ----
      if (countryName === 'Israel' || isoCode === 'ISR') {
        countryName = 'Palestine';
        isoCode = 'PSE'; // correct alpha-3 for Palestine
      }

      // ---- Override for Taiwan → China ----
      if (countryName === 'Taiwan' || isoCode === 'TWN') {
        countryName = 'China';
        isoCode = 'CHN';
      }

      showPopup(geoPath.centroid(feature), countryName);

      fetchCountryData(countryName, isoCode)
        .then(html => setPopupContent(html))
        .catch(err => {
          console.error('Error fetching country:', err);
          setPopupContent(`
            <div style="padding: 8px; color: #c0392b;">
              Could not load data for <strong>${escapeHtml(countryName)}</strong>.<br>
              <small style="color: #555;">${escapeHtml(err.message)}</small>
            </div>
          `);
        });
    });
}

// d3-geo requires each polygon's exterior ring wound clockwise (negative planar
// signed area in lon/lat) and holes wound counter-clockwise. A ring that breaks this
// convention confuses d3's antimeridian-clipping stream into stitching the entire map
// frame onto that feature's path — a huge invisible shape overlapping other countries.
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
    const isExterior = i === 0;
    const area = ringSignedArea(ring);
    if (isExterior ? area > 0 : area < 0) {
      ring.reverse();
    }
  });
}

function normalizeWinding(data) {
  for (const feature of data.features) {
    const geom = feature.geometry;
    if (geom?.type === 'Polygon') {
      fixPolygonWinding(geom.coordinates);
    } else if (geom?.type === 'MultiPolygon') {
      geom.coordinates.forEach(fixPolygonWinding);
    }
  }
  return data;
}

// Fetch and display country outlines
fetch(geoJsonUrl)
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    normalizeWinding(data);
    sizeMap();
    renderCountries(data);
    window.addEventListener('resize', sizeMap);
  })
  .catch(error => {
    console.error('Failed to load GeoJSON:', error);
  });

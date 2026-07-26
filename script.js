// Initialize the map
const map = L.map('map', {
  center: [20, 0],
  zoom: 2,
  minZoom: 2,
  maxZoom: 8,
  scrollWheelZoom: true
});

// Add OpenStreetMap tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19
}).addTo(map);

// GeoJSON source
const geoJsonUrl = 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json';

// Helper: format population with commas
function formatPopulation(pop) {
  return pop.toLocaleString('en-US');
}

// Helper: fetch country data and return HTML string for popup
// Helper: fetch country data via our secure backend proxy
async function fetchCountryData(countryName, isoCode) {
  const params = new URLSearchParams();
  if (isoCode && isoCode !== '-99') {
    params.append('isoCode', isoCode);
  } else {
    params.append('countryName', countryName);
  }

  const response = await fetch(`/api/country?${params.toString()}`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  const rawData = await response.json();
  // v5 response: { data: { objects: [...] } }
  const country = rawData.data.objects[0];

  // Extract fields with safe fallbacks
  const name = country.names?.common || countryName;
  const capital = country.capitals?.[0]?.name || 'N/A';
  const continent = country.continents?.[0] || country.region || 'N/A';
  const population = country.population ?? 0;
  const flagUrl = country.flag?.url_png || country.flag?.url_svg || '';

  return `
    <div style="min-width: 150px; text-align: center;">
      ${flagUrl ? `<img src="${flagUrl}" alt="Flag" style="width: 80px; height: auto; margin-bottom: 8px; border: 1px solid #ccc;" />` : ''}
      <h3 style="margin: 4px 0;">${name}</h3>
      <p style="margin: 4px 0;"><strong>Capital:</strong> ${capital}</p>
      <p style="margin: 4px 0;"><strong>Continent:</strong> ${continent}</p>
      <p style="margin: 4px 0;"><strong>Population:</strong> ${formatPopulation(population)}</p>
      <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(name)}" target="_blank" rel="noopener" style="display: inline-block; margin-top: 8px; font-size: 0.9em;">More info →</a>
    </div>
  `;
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
    L.geoJSON(data, {
      style: function () {
        return {
          color: '#2c3e50',
          weight: 1,
          fillColor: '#ecf0f1',
          fillOpacity: 0.4
        };
      },
      onEachFeature: function (feature, layer) {
        layer.on('click', function () {
          const props = feature.properties;
          const countryName = props.name;
          const isoCode = props.iso_a3;

          // Immediately show loading state
          const popup = L.popup()
            .setLatLng(layer.getBounds().getCenter())
            .setContent('<div style="padding: 8px;">Loading...</div>')
            .openOn(map);

          // Fetch live data and update popup
          fetchCountryData(countryName, isoCode)
            .then(html => {
              popup.setContent(html);
            })
            .catch(err => {
              console.error('Error fetching country:', err);
              popup.setContent(`<div style="padding: 8px;">Could not load data for <strong>${countryName}</strong>.</div>`);
            });
        });
      }
    }).addTo(map);
  })
  .catch(error => {
    console.error('Failed to load GeoJSON:', error);
  });
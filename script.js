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
async function fetchCountryData(countryName, isoCode) {
  let url;
  if (isoCode && isoCode !== '-99') {
    url = `https://restcountries.com/v3.1/alpha/${isoCode}`;
  } else {
    url = `https://restcountries.com/v3.1/name/${encodeURIComponent(countryName)}?fullText=true`;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Country not found');
  }
  const data = await response.json();
  // The API returns an array; we take the first result
  const country = data[0];

  const name = country.name.common;
  const capital = country.capital ? country.capital[0] : 'N/A';
  const continent = country.region; // API doesn't have 'continent' directly; 'region' is broad (e.g., Europe, Asia)
  const population = country.population;
  const flagUrl = country.flags.png;

  return `
    <div style="min-width: 150px; text-align: center;">
      <img src="${flagUrl}" alt="Flag" style="width: 80px; height: auto; margin-bottom: 8px; border: 1px solid #ccc;" />
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
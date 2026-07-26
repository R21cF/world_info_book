// file: pages/api/country.js
export default async function handler(req, res) {
  // 1. Get parameters from the frontend
  const { isoCode, countryName } = req.query;

  // 2. Validate input
  if (!isoCode && !countryName) {
    return res.status(400).json({ error: 'Missing isoCode or countryName' });
  }

  // 3. Read the secret key from environment variables (Server-side only!)
  const API_KEY = process.env.REST_COUNTRIES_KEY;
  if (!API_KEY) {
    console.error('REST_COUNTRIES_KEY is not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // 4. Build the correct v5 URL
  let url;
  if (isoCode && isoCode !== '-99') {
    url = `https://api.restcountries.com/countries/v5/codes.alpha_3/${isoCode}`;
  } else {
    url = `https://api.restcountries.com/countries/v5/names.common/${encodeURIComponent(countryName)}?fullText=true`;
  }

  try {
    // 5. Fetch from the real API with the secret key (hidden from the browser)
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });

    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }

    const data = await response.json();

    // 6. Return the data to the frontend
    res.status(200).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch country data' });
  }
}
// file: api/countries.js
export default async function handler(req, res) {
  console.log('📥 Request received:', req.query);

  const { isoCode, countryName } = req.query;

  if (!isoCode && !countryName) {
    return res.status(400).json({ error: 'Missing isoCode or countryName' });
  }

  // Log the environment variable to see if it's loaded
  const API_KEY = process.env.REST_COUNTRIES_KEY;
  console.log('🔑 API_KEY present?', !!API_KEY);

  if (!API_KEY) {
    console.error('❌ REST_COUNTRIES_KEY is not set');
    return res.status(500).json({ error: 'Server configuration error: missing API key' });
  }

  async function fetchFromApi(url) {
    console.log('🌐 Fetching URL:', url);
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });
    console.log('📡 External API status:', response.status);
    return response;
  }

  try {
    let response;

    if (isoCode && isoCode !== '-99') {
      // codes.alpha_3 expects a 3-letter code, codes.alpha_2 expects a 2-letter code.
      const codeProperty = isoCode.length === 2 ? 'codes.alpha_2' : 'codes.alpha_3';
      response = await fetchFromApi(`https://api.restcountries.com/countries/v5/${codeProperty}/${isoCode}`);
    } else {
      response = await fetchFromApi(`https://api.restcountries.com/countries/v5/names.common/${encodeURIComponent(countryName)}?fullText=true`);

      // Some GeoJSON sources use a country's long/official name (e.g. "United States
      // of America"), which won't exact-match names.common ("United States"). Retry
      // against names.official before giving up.
      if (response.ok) {
        const commonData = await response.json();
        if (!commonData.data?.objects || commonData.data.objects.length === 0) {
          response = await fetchFromApi(`https://api.restcountries.com/countries/v5/names.official/${encodeURIComponent(countryName)}?fullText=true`);
        } else {
          return res.status(200).json(commonData);
        }
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ External API error:', response.status, errorText);
      return res.status(response.status).json({
        error: `External API error: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    console.log('✅ Data received, objects count:', data.data?.objects?.length || 0);

    res.status(200).json(data);
  } catch (error) {
    console.error('💥 Proxy error:', error.message);
    res.status(500).json({ error: `Failed to fetch country data: ${error.message}` });
  }
}
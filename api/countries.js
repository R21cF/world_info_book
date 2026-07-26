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
  console.log('🔑 API_KEY value (first 4 chars):', API_KEY ? API_KEY.slice(0, 4) : 'undefined');

  if (!API_KEY) {
    console.error('❌ REST_COUNTRIES_KEY is not set');
    return res.status(500).json({ error: 'Server configuration error: missing API key' });
  }

  let url;
  let codeToUse = isoCode;
  
  // Special case: USA alpha-3 doesn't work, use alpha-2 instead
  if (isoCode === 'USA') {
    codeToUse = 'US';
  }
  
  if (codeToUse && codeToUse !== '-99') {
    url = `https://api.restcountries.com/countries/v5/codes.alpha_3/${codeToUse}`;
  } else {
    url = `https://api.restcountries.com/countries/v5/names.common/${encodeURIComponent(countryName)}?fullText=true`;
  }
  console.log('🌐 Fetching URL:', url);

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });

    console.log('📡 External API status:', response.status);

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
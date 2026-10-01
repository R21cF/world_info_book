// Proxies REST Countries API v5 lookups, adding the API key server-side.
// Query: ?isoCode=<alpha-2|alpha-3>  or  ?countryName=<name>

import { handleCors } from './_cors.js';

const API_BASE = 'https://api.restcountries.com/countries/v5';

// Country facts rarely change, so let Vercel's edge cache serve repeat lookups.
const CACHE_CONTROL = 'public, s-maxage=86400, stale-while-revalidate=604800';

export default async function handler(req, res) {
  if (handleCors(req, res, 'GET')) return;

  const { isoCode, countryName } = req.query;
  if (!isoCode && !countryName) {
    return res.status(400).json({ error: 'Missing isoCode or countryName' });
  }

  const apiKey = process.env.REST_COUNTRIES_KEY;
  if (!apiKey) {
    console.error('REST_COUNTRIES_KEY is not set');
    return res.status(500).json({ error: 'Server configuration error: missing API key' });
  }

  try {
    let data;
    for (const path of lookupPaths(isoCode, countryName)) {
      const response = await fetch(`${API_BASE}/${path}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      // A 404 just means "no match here"; try the next lookup.
      if (response.status === 404) continue;
      if (!response.ok) {
        const details = await response.text();
        console.error('REST Countries error:', response.status, details);
        return res.status(response.status).json({ error: `External API error: ${response.status}`, details });
      }
      data = await response.json();
      if (data.data?.objects?.length) break;
    }

    if (!data?.data?.objects?.length) {
      return res.status(404).json({ error: `No country data found for ${countryName || isoCode}` });
    }
    res.setHeader('Cache-Control', CACHE_CONTROL);
    res.status(200).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: `Failed to fetch country data: ${error.message}` });
  }
}

// Lookups to try in order. Some GeoJSON features carry a long/official name (e.g.
// "United States of America") that won't exact-match names.common, so a name
// lookup falls back to names.official. '-99' is the GeoJSON's "no ISO code" marker.
function lookupPaths(isoCode, countryName) {
  if (isoCode && isoCode !== '-99') {
    const field = isoCode.length === 2 ? 'codes.alpha_2' : 'codes.alpha_3';
    return [`${field}/${encodeURIComponent(isoCode)}`];
  }
  const name = encodeURIComponent(countryName);
  return [`names.common/${name}?fullText=true`, `names.official/${name}?fullText=true`];
}

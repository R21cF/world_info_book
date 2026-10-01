// CORS for the native app. The website calls the API same-origin and needs none of
// this; the Capacitor app's pages are served from https://localhost (Android) or
// capacitor://localhost (iOS), so the browser engine requires these headers.
// (Files in api/ starting with "_" are helpers, not endpoints.)

const APP_ORIGINS = new Set(['https://localhost', 'capacitor://localhost']);

// Sets CORS headers for allowed origins. Returns true if the request was a preflight
// that has been answered, in which case the handler should stop.
export function handleCors(req, res, methods) {
  const origin = req.headers.origin;
  if (APP_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', `${methods}, OPTIONS`);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

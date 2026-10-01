// Inside the native app (Capacitor), the page is served from the device itself, so
// API calls must go to the deployed site. On the website they stay same-origin.
const IS_NATIVE_APP = Boolean(window.Capacitor?.isNativePlatform?.());

export const API_BASE = IS_NATIVE_APP ? 'https://world-info-book.vercel.app' : '';

/**
 * DAT RateView API Integration
 *
 * DAT uses OAuth 2.0 (client_credentials flow).
 * Steps:
 *   1. POST to DAT_TOKEN_URL with your client_id and client_secret to get a bearer token.
 *   2. POST to DAT_API_BASE_URL/spot-rates/summary with origin, destination, and equipment.
 *   3. Parse the response — we use rateUsd.average as the basis for the customer quote.
 *
 * Set DAT_USE_MOCK=true in .env to run without real credentials during development.
 * When you are ready to go live, fill in DAT_CLIENT_ID and DAT_CLIENT_SECRET in .env
 * and set DAT_USE_MOCK=false.
 *
 * DAT API docs: https://developer.dat.com/docs/rateview
 */

const axios = require('axios');

const DAT_TOKEN_URL = process.env.DAT_TOKEN_URL || 'https://identity.dat.com/access/oauth/token';
const DAT_API_BASE  = process.env.DAT_API_BASE_URL || 'https://api.dat.com/rate-view/v3';

// Equipment type labels used by the DAT API
const EQUIPMENT_MAP = {
  VAN:     'VAN',
  REEFER:  'REEFER',
  FLATBED: 'FLATBED',
};

// ─── Token cache ─────────────────────────────────────────────────────────────
// Tokens are valid for ~1 hour; cache to avoid fetching one per request.
let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const response = await axios.post(
    DAT_TOKEN_URL,
    new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     process.env.DAT_CLIENT_ID,
      client_secret: process.env.DAT_CLIENT_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  cachedToken    = response.data.access_token;
  // Subtract 60 s as a buffer so we never send an expired token
  tokenExpiresAt = Date.now() + (response.data.expires_in - 60) * 1000;
  return cachedToken;
}

// ─── Live DAT call ────────────────────────────────────────────────────────────
async function fetchLiveRate({ originZip, destinationZip, equipmentType }) {
  const token = await getAccessToken();

  // Build a 7-day date window starting today (DAT requires a date range)
  const today = new Date();
  const weekOut = new Date(today);
  weekOut.setDate(weekOut.getDate() + 7);
  const fmt = (d) => d.toISOString().split('T')[0];

  const payload = {
    origin:      { postalCode: originZip,      countryCode: 'US' },
    destination: { postalCode: destinationZip, countryCode: 'US' },
    equipmentType: EQUIPMENT_MAP[equipmentType],
    shipmentDates: { startDate: fmt(today), endDate: fmt(weekOut) },
  };

  const response = await axios.post(
    `${DAT_API_BASE}/spot-rates/summary`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept:         'application/json',
      },
      timeout: 10_000,
    }
  );

  const data = response.data;

  // Surface a structured 404 if DAT returns no rate reports for the lane
  if (!data.rateUsd || data.reports === 0) {
    const err = new Error('No rate data for lane');
    err.status = 404;
    throw err;
  }

  return {
    totalRateUsd: data.rateUsd.average,
    rateMileUsd:  data.rateMileUsd.average,
    miles:        data.miles,
    isMock:       false,
  };
}

// ─── Mock response (used when DAT_USE_MOCK=true) ──────────────────────────────
// Generates plausible spot-market rates so you can develop/demo without credentials.
function fetchMockRate({ originZip, destinationZip, equipmentType }) {
  // Derive a pseudo-distance from the ZIP codes so results feel consistent
  const zipDiff    = Math.abs(parseInt(originZip) - parseInt(destinationZip));
  const miles      = Math.min(2500, Math.max(150, Math.round((zipDiff % 2000) + 150)));

  const baseCpm = {           // $/mile baseline per equipment
    VAN:     2.20,
    REEFER:  2.65,
    FLATBED: 2.45,
  }[equipmentType] ?? 2.20;

  // Small random variance (±8 %) so repeated calls don't look robotic
  const variance      = 1 + (Math.random() * 0.16 - 0.08);
  const rateMileUsd   = +(baseCpm * variance).toFixed(2);
  const totalRateUsd  = Math.round(rateMileUsd * miles);

  return Promise.resolve({ totalRateUsd, rateMileUsd, miles, isMock: true });
}

// ─── Public export ─────────────────────────────────────────────────────────────
async function getSpotRate(params) {
  if (process.env.DAT_USE_MOCK === 'true') {
    return fetchMockRate(params);
  }
  return fetchLiveRate(params);
}

module.exports = { getSpotRate };

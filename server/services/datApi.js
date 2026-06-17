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
const ORS_API_BASE  = 'https://api.openrouteservice.org/v2';

// Equipment type labels used by the DAT API
const EQUIPMENT_MAP = {
  VAN: 'VAN',
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

// ─── ORS routing ─────────────────────────────────────────────────────────────
async function zipToCoords(zip) {
  try {
    const res   = await axios.get(`https://api.zippopotam.us/us/${zip}`, { timeout: 5_000 });
    const place = res.data.places[0];
    return [parseFloat(place.longitude), parseFloat(place.latitude)]; // [lng, lat] — ORS convention
  } catch (axiosErr) {
    if (axiosErr.response?.status === 404) {
      const err = new Error(`ZIP code ${zip} could not be located.`);
      err.status = 400;
      throw err;
    }
    throw axiosErr;
  }
}

async function getRoadMiles(originZip, destinationZip) {
  const [originCoords, destCoords] = await Promise.all([
    zipToCoords(originZip),
    zipToCoords(destinationZip),
  ]);

  const res = await axios.post(
    `${ORS_API_BASE}/directions/driving-car`,
    { coordinates: [originCoords, destCoords], units: 'mi' },
    {
      headers: {
        Authorization:  process.env.ORS_API_KEY,
        'Content-Type': 'application/json',
        Accept:         'application/json, application/geo+json',
      },
      timeout: 10_000,
    }
  );

  return Math.round(res.data.routes[0].summary.distance);
}

// ─── Mock response (used when DAT_USE_MOCK=true) ──────────────────────────────
async function fetchMockRate({ originZip, destinationZip }) {
  const miles        = await getRoadMiles(originZip, destinationZip);
  const baseCpm      = 2.20;
  const variance     = 1 + (Math.random() * 0.16 - 0.08);
  const rateMileUsd  = +(baseCpm * variance).toFixed(2);
  const totalRateUsd = Math.round(rateMileUsd * miles);

  return { totalRateUsd, rateMileUsd, miles, isMock: true };
}

// ─── Public export ─────────────────────────────────────────────────────────────
async function getSpotRate(params) {
  if (process.env.DAT_USE_MOCK === 'true') {
    return fetchMockRate(params);
  }
  return fetchLiveRate(params);
}

// Returns ORS road miles for a route — used by Straight Box Truck pricing.
async function getMilesForRoute({ originZip, destinationZip }) {
  return getRoadMiles(originZip, destinationZip);
}

module.exports = { getSpotRate, getMilesForRoute };

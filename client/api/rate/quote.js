const DAT_TOKEN_URL = process.env.DAT_TOKEN_URL   || 'https://identity.dat.com/access/oauth/token';
const DAT_API_BASE  = process.env.DAT_API_BASE_URL || 'https://api.dat.com/rate-view/v3';
const ORS_API_BASE  = 'https://api.openrouteservice.org/v2';

const MARKUP                    = 1.25;
const VALID_EQUIPMENT           = ['VAN', 'STRAIGHT_BOX_TRUCK'];
const ZIP_RE                    = /^\d{5}$/;

// Straight Box Truck mileage-based pricing tiers.
// Flat rates for short hauls; tapering per-mile rates as distance grows.
// Returns the final customer quote rounded to the nearest whole dollar.
function straightBoxQuote(miles) {
  if (miles <= 100) return { customerQuote: 400, ratePerMile: +(400 / miles).toFixed(2) };
  if (miles <= 200) return { customerQuote: 500, ratePerMile: +(500 / miles).toFixed(2) };

  let ratePerMile;
  if      (miles <= 550)  ratePerMile = 2.50;
  else if (miles <= 625)  ratePerMile = 2.40;
  else if (miles <= 750)  ratePerMile = 2.375;
  else if (miles <= 999)  ratePerMile = 2.30;
  else if (miles <= 1200) ratePerMile = 2.20;
  else if (miles <= 1300) ratePerMile = 2.10;
  else if (miles <= 1600) ratePerMile = 2.00;
  else if (miles <= 2000) ratePerMile = 1.90;
  else                    ratePerMile = 1.80;

  return { customerQuote: Math.round(miles * ratePerMile), ratePerMile };
}

// Token cache — persists within a warm serverless instance
let cachedToken    = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const res = await fetch(DAT_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     process.env.DAT_CLIENT_ID,
      client_secret: process.env.DAT_CLIENT_SECRET,
    }),
  });

  const data     = await res.json();
  cachedToken    = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

// ─── ORS routing ─────────────────────────────────────────────────────────────
async function zipToCoords(zip) {
  const res = await fetch(`https://api.zippopotam.us/us/${zip}`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) {
    const err = new Error(`ZIP code ${zip} could not be located.`);
    err.status = 400;
    throw err;
  }
  const data  = await res.json();
  const place = data.places[0];
  return [parseFloat(place.longitude), parseFloat(place.latitude)]; // [lng, lat] — ORS convention
}

async function getRoadMiles(originZip, destinationZip) {
  const [originCoords, destCoords] = await Promise.all([
    zipToCoords(originZip),
    zipToCoords(destinationZip),
  ]);

  const res = await fetch(`${ORS_API_BASE}/directions/driving-car`, {
    method:  'POST',
    headers: {
      Authorization:  process.env.ORS_API_KEY,
      'Content-Type': 'application/json',
      Accept:         'application/json, application/geo+json',
    },
    body: JSON.stringify({
      coordinates: [originCoords, destCoords],
      units:       'mi',
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const err = new Error('Routing service unavailable');
    err.status = 502;
    throw err;
  }

  const data = await res.json();
  return Math.round(data.routes[0].summary.distance);
}

async function fetchLiveRate(originZip, destinationZip, equipmentType) {
  const token = await getAccessToken();

  const today   = new Date();
  const weekOut = new Date(today);
  weekOut.setDate(weekOut.getDate() + 7);
  const fmt = (d) => d.toISOString().split('T')[0];

  const res = await fetch(`${DAT_API_BASE}/spot-rates/summary`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    body: JSON.stringify({
      origin:        { postalCode: originZip,      countryCode: 'US' },
      destination:   { postalCode: destinationZip, countryCode: 'US' },
      equipmentType,
      shipmentDates: { startDate: fmt(today), endDate: fmt(weekOut) },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const data = await res.json();

  if (!data.rateUsd || data.reports === 0) {
    const err = new Error('No rate data for lane');
    err.status = 404;
    throw err;
  }

  return {
    totalRateUsd: data.rateUsd.average,
    rateMileUsd:  data.rateMileUsd.average,
    miles:        data.miles,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { originZip, destinationZip, equipmentType } = req.body ?? {};

  if (!ZIP_RE.test(originZip) || !ZIP_RE.test(destinationZip)) {
    return res.status(400).json({ error: 'Origin and destination must be valid 5-digit ZIP codes.' });
  }

  if (!VALID_EQUIPMENT.includes(equipmentType)) {
    return res.status(400).json({ error: `Equipment type must be one of: ${VALID_EQUIPMENT.join(', ')}.` });
  }

  if (originZip === destinationZip) {
    return res.status(400).json({ error: 'Origin and destination ZIP codes cannot be the same.' });
  }

  const useMock = process.env.DAT_USE_MOCK === 'true';

  try {
    if (equipmentType === 'STRAIGHT_BOX_TRUCK') {
      const miles = await getRoadMiles(originZip, destinationZip);
      const { customerQuote, ratePerMile } = straightBoxQuote(miles);

      return res.json({
        customerQuote,
        ratePerMile,
        miles,
        currency:      'USD',
        equipmentType,
        originZip,
        destinationZip,
        isMock:        false,
      });
    }

    // VAN
    if (useMock) {
      const miles       = await getRoadMiles(originZip, destinationZip);
      const variance    = 1 + (Math.random() * 0.16 - 0.08);
      const rateMileUsd = +(2.20 * variance).toFixed(2);

      return res.json({
        customerQuote: Math.round(miles * rateMileUsd * MARKUP),
        ratePerMile:   +(rateMileUsd * MARKUP).toFixed(2),
        miles,
        currency:      'USD',
        equipmentType,
        originZip,
        destinationZip,
        isMock:        true,
      });
    }

    const datRate = await fetchLiveRate(originZip, destinationZip, equipmentType);

    return res.json({
      customerQuote: Math.round(datRate.totalRateUsd * MARKUP),
      ratePerMile:   +(datRate.rateMileUsd * MARKUP).toFixed(2),
      miles:         datRate.miles,
      currency:      'USD',
      equipmentType,
      originZip,
      destinationZip,
      isMock:        false,
    });
  } catch (err) {
    console.error('Rate fetch error:', err.message);

    if (err.status === 400) {
      return res.status(400).json({ error: err.message });
    }

    if (err.status === 404) {
      return res.status(404).json({ error: 'No rate data found for this lane. Try a different origin or destination.' });
    }

    return res.status(502).json({ error: 'Unable to calculate mileage for this route. Please try again.' });
  }
};

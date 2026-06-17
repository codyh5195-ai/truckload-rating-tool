const DAT_TOKEN_URL = process.env.DAT_TOKEN_URL   || 'https://identity.dat.com/access/oauth/token';
const DAT_API_BASE  = process.env.DAT_API_BASE_URL || 'https://api.dat.com/rate-view/v3';

const MARKUP                    = 1.25;
const STRAIGHT_BOX_RATE_PER_MILE = 2.50;
const VALID_EQUIPMENT           = ['VAN', 'STRAIGHT_BOX_TRUCK'];
const ZIP_RE                    = /^\d{5}$/;

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

function mockMiles(originZip, destinationZip) {
  const zipDiff = Math.abs(parseInt(originZip) - parseInt(destinationZip));
  return Math.min(2500, Math.max(150, Math.round((zipDiff % 2000) + 150)));
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
      const miles = useMock
        ? mockMiles(originZip, destinationZip)
        : (await fetchLiveRate(originZip, destinationZip, 'VAN')).miles;

      return res.json({
        customerQuote: Math.round(miles * STRAIGHT_BOX_RATE_PER_MILE),
        ratePerMile:   STRAIGHT_BOX_RATE_PER_MILE,
        miles,
        currency:      'USD',
        equipmentType,
        originZip,
        destinationZip,
        isMock:        useMock,
      });
    }

    // VAN
    if (useMock) {
      const miles        = mockMiles(originZip, destinationZip);
      const variance     = 1 + (Math.random() * 0.16 - 0.08);
      const rateMileUsd  = +(2.20 * variance).toFixed(2);
      const totalRateUsd = Math.round(rateMileUsd * miles);

      return res.json({
        customerQuote: Math.round(totalRateUsd * MARKUP),
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

    if (err.status === 404) {
      return res.status(404).json({ error: 'No rate data found for this lane. Try a different origin or destination.' });
    }

    return res.status(502).json({ error: 'Unable to retrieve rate at this time. Please try again shortly.' });
  }
};

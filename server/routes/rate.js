const express = require('express');
const router = express.Router();
const { getSpotRate, getMilesForRoute } = require('../services/datApi');

const MARKUP = 1.25; // 25% brokerage margin applied before customer sees the DAT-based quote

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

const VALID_EQUIPMENT = ['VAN', 'STRAIGHT_BOX_TRUCK'];

const ZIP_RE = /^\d{5}$/;

router.post('/quote', async (req, res) => {
  const { originZip, destinationZip, equipmentType } = req.body;

  if (!ZIP_RE.test(originZip) || !ZIP_RE.test(destinationZip)) {
    return res.status(400).json({ error: 'Origin and destination must be valid 5-digit ZIP codes.' });
  }

  if (!VALID_EQUIPMENT.includes(equipmentType)) {
    return res.status(400).json({ error: `Equipment type must be one of: ${VALID_EQUIPMENT.join(', ')}.` });
  }

  if (originZip === destinationZip) {
    return res.status(400).json({ error: 'Origin and destination ZIP codes cannot be the same.' });
  }

  try {
    if (equipmentType === 'STRAIGHT_BOX_TRUCK') {
      const miles = await getMilesForRoute({ originZip, destinationZip });
      const { customerQuote, ratePerMile } = straightBoxQuote(miles);

      return res.json({
        customerQuote,
        ratePerMile,
        miles,
        currency: 'USD',
        equipmentType,
        originZip,
        destinationZip,
        isMock: process.env.DAT_USE_MOCK === 'true',
      });
    }

    const datRate = await getSpotRate({ originZip, destinationZip, equipmentType });

    // Apply markup — the raw DAT rate is intentionally never returned to the client
    const customerQuote = Math.round(datRate.totalRateUsd * MARKUP);
    const ratePerMile = +(datRate.rateMileUsd * MARKUP).toFixed(2);

    return res.json({
      customerQuote,
      ratePerMile,
      miles: datRate.miles,
      currency: 'USD',
      equipmentType,
      originZip,
      destinationZip,
      isMock: datRate.isMock || false,
    });
  } catch (err) {
    console.error('Rate fetch error:', err.message);

    if (err.status === 404) {
      return res.status(404).json({ error: 'No rate data found for this lane. Try a different origin or destination.' });
    }

    return res.status(502).json({ error: 'Unable to retrieve rate at this time. Please try again shortly.' });
  }
});

module.exports = router;

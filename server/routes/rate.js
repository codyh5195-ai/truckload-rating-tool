const express = require('express');
const router = express.Router();
const { getSpotRate } = require('../services/datApi');

const MARKUP = 1.25; // 25% brokerage margin applied before customer sees the quote

const VALID_EQUIPMENT = ['VAN', 'REEFER', 'FLATBED'];

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

// server/routes/instruments.router.js - Search and Catalog of Financial Instruments
const express = require('express');
const { DEFAULT_INSTRUMENTS } = require('../config/instruments');
const { configManager } = require('../config/config.manager');
const { tinkoffService } = require('../services/tinkoff.service');

const router = express.Router();

// GET /api/instruments/search?query=SBER
router.get('/instruments/search', async (req, res) => {
  const query = (req.query.query || '').trim().toUpperCase();
  const currentConfig = configManager.getConfig();
  const token = currentConfig.tinkoffToken;

  if (!query) {
    return res.json({ instruments: DEFAULT_INSTRUMENTS });
  }

  // Attempt live search if token is provided
  if (token && token.length > 10) {
    const liveResults = await tinkoffService.searchInstruments(query, token);
    if (liveResults && liveResults.length > 0) {
      return res.json({ instruments: liveResults });
    }
  }

  // Fallback to searching our default catalog
  const filtered = DEFAULT_INSTRUMENTS.filter(
    inst => inst.ticker.includes(query) || inst.name.toUpperCase().includes(query)
  );

  return res.json({ instruments: filtered.length > 0 ? filtered : DEFAULT_INSTRUMENTS });
});

module.exports = router;

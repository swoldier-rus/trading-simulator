// server/routes/instruments.router.js - Search and Catalog of Financial Instruments
const express = require('express');
const { DEFAULT_INSTRUMENTS, findDefaultInstrument } = require('../config/instruments');
const { configManager } = require('../config/config.manager');
const { tinkoffService } = require('../services/tinkoff.service');
const { intervalToSeconds } = require('../services/simulation.service');

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

// GET /api/instruments/boundaries?ticker=SBER&figi=...&interval=1h
router.get('/instruments/boundaries', async (req, res) => {
  const currentConfig = configManager.getConfig();
  const ticker = (req.query.ticker || currentConfig.selectedSymbol || 'SBER').toUpperCase();
  const interval = (req.query.interval || currentConfig.selectedTimeframe || '1h').toLowerCase();
  let figi = req.query.figi;

  const matchInst = findDefaultInstrument(ticker);
  if (!figi && matchInst) {
    figi = matchInst.figi;
  }

  const token = currentConfig.tinkoffToken;
  const stepSec = intervalToSeconds(interval);
  const nowSec = Math.floor(Date.now() / 1000);
  const latestTimeSec = Math.floor(nowSec / stepSec) * stepSec;

  let earliestTimeSec = null;
  let source = 'demo';

  // 1. Attempt live T-Bank earliest dates if token is present
  if (token && token.length > 10 && figi) {
    try {
      const details = await tinkoffService.getInstrumentDetails(figi, token);
      if (details) {
        let firstIso = null;
        if (interval === '1d' || interval === '1w') {
          // Full daily/weekly history available in T-Bank (e.g. from 2000 for SBER)
          firstIso = details.first1DayCandleDate || details.ipoDate;
        } else {
          // Intraday (1m, 5m, 15m, 1h, 4h) full history available in T-Bank (from March 2018 for SBER)
          firstIso = details.first1MinCandleDate || details.first1DayCandleDate;
        }

        if (firstIso) {
          const t = Math.floor(new Date(firstIso).getTime() / 1000);
          if (!isNaN(t) && t > 0 && t < latestTimeSec - 50 * stepSec) {
            earliestTimeSec = Math.floor(t / stepSec) * stepSec;
            source = 'tinkoff';
          }
        }
      }
    } catch (err) {
      console.warn('[Boundaries] Error fetching T-Bank boundaries:', err.message);
    }
  }

  // 2. Demo fallback: 1 full year of continuous history
  if (!earliestTimeSec) {
    let daysDepth = 365; // 1 year agreed in grill-me
    if (interval === '1w') daysDepth = 730;
    else if (interval === '15m') daysDepth = 180;
    else if (interval === '5m') daysDepth = 60;
    else if (interval === '1m') daysDepth = 30;

    const targetEarliest = latestTimeSec - daysDepth * 86400;
    earliestTimeSec = Math.floor(targetEarliest / stepSec) * stepSec;
    source = 'demo';
  }

  return res.json({
    ok: true,
    ticker,
    figi,
    interval,
    earliestTimeSec,
    earliestDate: new Date(earliestTimeSec * 1000).toISOString(),
    latestTimeSec,
    latestDate: new Date(latestTimeSec * 1000).toISOString(),
    stepSec,
    source
  });
});

module.exports = router;

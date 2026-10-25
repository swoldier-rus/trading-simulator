// server/routes/instruments.router.js - Search and Catalog of Financial Instruments from T-Investments API
const express = require('express');
const { configManager } = require('../config/config.manager');
const { tinkoffService } = require('../services/tinkoff.service');
const { intervalToSeconds } = require('../services/simulation.service');

const router = express.Router();

// GET /api/instruments/search?query=SBER&type=all|shares|futures
router.get('/instruments/search', async (req, res) => {
  const query = (req.query.query || '').trim();
  const type = (req.query.type || 'all').trim();
  const currentConfig = configManager.getConfig();
  const token = currentConfig.tinkoffToken;

  if (!token || token.length < 10) {
    return res.status(401).json({
      ok: false,
      error: 'Токен Т-Инвестиций не настроен. Укажите токен в настройках.',
      instruments: []
    });
  }

  const results = await tinkoffService.searchInstruments(query, token, type);
  return res.json({ instruments: results || [] });
});

// GET /api/instruments/boundaries?ticker=SBER&figi=...&interval=1h
router.get('/instruments/boundaries', async (req, res) => {
  const currentConfig = configManager.getConfig();
  const ticker = (req.query.ticker || currentConfig.selectedSymbol || 'SBER').toUpperCase();
  const interval = (req.query.interval || currentConfig.selectedTimeframe || '1h').toLowerCase();
  let figi = req.query.figi;
  const token = currentConfig.tinkoffToken;

  if (!token || token.length < 10) {
    return res.status(401).json({
      ok: false,
      error: 'Токен Т-Инвестиций не настроен'
    });
  }

  const inst = (ticker ? await tinkoffService.findInstrumentByTickerOrFigi(ticker, token) : null)
    || (figi ? await tinkoffService.findInstrumentByTickerOrFigi(figi, token) : null);
  if (!inst) {
    return res.status(404).json({
      ok: false,
      error: `Инструмент ${ticker} не найден в каталоге Т-Инвестиций`
    });
  }

  figi = inst.figi;
  const stepSec = intervalToSeconds(interval);
  const nowSec = Math.floor(Date.now() / 1000);
  const latestTimeSec = Math.floor(nowSec / stepSec) * stepSec;

  let firstIso = null;
  if (interval === '1d' || interval === '1w') {
    // Daily/weekly history from T-Bank
    firstIso = inst.first1dayCandleDate || inst.ipoDate;
  } else {
    // Intraday history from T-Bank
    firstIso = inst.first1minCandleDate || inst.first1dayCandleDate || inst.ipoDate;
  }

  if (!firstIso) {
    return res.status(404).json({
      ok: false,
      error: `Границы истории для инструмента ${ticker} (${interval}) недоступны в T-Invest API`
    });
  }

  const t = Math.floor(new Date(firstIso).getTime() / 1000);
  const earliestTimeSec = Math.floor(t / stepSec) * stepSec;

  return res.json({
    ok: true,
    ticker: inst.ticker,
    name: inst.name,
    figi: inst.figi,
    lot: inst.lot,
    currency: inst.currency,
    type: inst.type || 'share',
    classCode: inst.classCode || 'TQBR',
    minPriceIncrement: inst.minPriceIncrement || 0.01,
    basicAsset: inst.basicAsset || '',
    expirationDate: inst.expirationDate || null,
    interval,
    earliestTimeSec,
    earliestDate: new Date(earliestTimeSec * 1000).toISOString(),
    latestTimeSec,
    latestDate: new Date(latestTimeSec * 1000).toISOString(),
    stepSec,
    source: 'tinkoff'
  });
});

// GET /api/instruments/quotes?tickers=SBER,GAZP,LKOH...
router.get('/instruments/quotes', async (req, res) => {
  const currentConfig = configManager.getConfig();
  const token = currentConfig.tinkoffToken;

  if (!token || token.length < 10) {
    return res.status(401).json({
      ok: false,
      error: 'Токен Т-Инвестиций не настроен',
      quotes: []
    });
  }

  const rawTickers = req.query.tickers || '';
  const tickers = rawTickers
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);

  if (tickers.length === 0) {
    return res.json({ ok: true, quotes: [] });
  }

  try {
    const quotes = await tinkoffService.getQuotesBatch(tickers, token);
    return res.json({ ok: true, quotes: quotes || [] });
  } catch (err) {
    console.error('[InstrumentsRouter] Error fetching quotes batch:', err.message);
    return res.status(500).json({ ok: false, error: err.message, quotes: [] });
  }
});

module.exports = router;

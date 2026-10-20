// server/routes/candles.router.js - Historical Candlestick Retrieval with Fallback & Caching
const express = require('express');
const { configManager } = require('../config/config.manager');
const { findDefaultInstrument } = require('../config/instruments');
const { candleCache } = require('../services/cache.service');
const { tinkoffService } = require('../services/tinkoff.service');
const { generateSimulatedCandles } = require('../services/simulation.service');

const router = express.Router();

// GET /api/candles?ticker=SBER&interval=1h&count=800&to=...&from=...
router.get('/candles', async (req, res) => {
  const currentConfig = configManager.getConfig();
  const ticker = (req.query.ticker || currentConfig.selectedSymbol || 'SBER').toUpperCase();
  let figi = req.query.figi;
  const interval = req.query.interval || currentConfig.selectedTimeframe || '1h';
  const count = Math.min(3000, Math.max(10, Number(req.query.count) || 800));
  const token = currentConfig.tinkoffToken;

  // Resolve figi and lot from default instruments if not provided
  const matchInst = findDefaultInstrument(ticker);
  if (!figi && matchInst) {
    figi = matchInst.figi;
  }
  const lot = matchInst ? matchInst.lot : 1;

  // Parse optional 'to' and 'from' parameters
  let toDate = new Date();
  let hasCustomTo = false;
  if (req.query.to) {
    const toNum = Number(req.query.to);
    if (!isNaN(toNum) && toNum > 0) {
      toDate = new Date(toNum > 10000000000 ? toNum : toNum * 1000);
      hasCustomTo = true;
    } else {
      const parsed = new Date(req.query.to);
      if (!isNaN(parsed.getTime())) {
        toDate = parsed;
        hasCustomTo = true;
      }
    }
  }

  let fromDate = null;
  if (req.query.from) {
    const fromNum = Number(req.query.from);
    if (!isNaN(fromNum) && fromNum > 0) {
      fromDate = new Date(fromNum > 10000000000 ? fromNum : fromNum * 1000);
    } else {
      const parsed = new Date(req.query.from);
      if (!isNaN(parsed.getTime())) {
        fromDate = parsed;
      }
    }
  }

  // Check cache
  const cacheKey = `${ticker}_${figi}_${interval}_${count}_${req.query.to || ''}_${req.query.from || ''}`;
  const cachedData = candleCache.get(cacheKey);
  if (cachedData) {
    return res.json(cachedData);
  }

  // Attempt live T-Bank data if token and figi available
  if (token && token.length > 10 && figi) {
    const candles = await tinkoffService.getCandles({
      figi,
      interval,
      count,
      toDate,
      fromDate,
      token
    });

    if (candles && candles.length > 0) {
      const result = {
        ok: true,
        source: 'tinkoff',
        ticker,
        figi,
        lot,
        interval,
        candles
      };
      candleCache.set(cacheKey, result);
      return res.json(result);
    }
  }

  // Fallback to high-fidelity simulated candles
  const basePrice = matchInst ? matchInst.basePrice : 250;
  const toSec = hasCustomTo ? Math.floor(toDate.getTime() / 1000) : null;
  const candles = generateSimulatedCandles(basePrice, interval, count, toSec);

  const result = {
    ok: true,
    source: 'simulation',
    note: token ? 'Свечи сгенерированы (инструмент временно недоступен в API)' : 'Демо-режим (введите токен Т-Инвестиций в настройках)',
    ticker,
    figi,
    lot,
    interval,
    candles
  };

  return res.json(result);
});

module.exports = router;

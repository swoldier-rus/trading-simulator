// server/routes/candles.router.js - Historical Candlestick Retrieval strictly from T-Investments API
const express = require('express');
const { configManager } = require('../config/config.manager');
const { candleCache } = require('../services/cache.service');
const { tinkoffService } = require('../services/tinkoff.service');

const router = express.Router();

// GET /api/candles?ticker=SBER&interval=1h&count=800&to=...&from=...
router.get('/candles', async (req, res) => {
  const currentConfig = configManager.getConfig();
  const ticker = (req.query.ticker || currentConfig.selectedSymbol || 'SBER').toUpperCase();
  let figi = req.query.figi;
  const interval = req.query.interval || currentConfig.selectedTimeframe || '1h';
  const count = Math.min(3000, Math.max(10, Number(req.query.count) || 800));
  const token = currentConfig.tinkoffToken;

  if (!token || token.length < 10) {
    return res.status(401).json({
      ok: false,
      error: 'Токен Т-Инвестиций не настроен. Укажите токен в настройках.',
      candles: []
    });
  }

  // Resolve instrument and lot strictly from T-Investments API (prioritize ticker to prevent stale figi mismatches)
  const inst = (ticker ? await tinkoffService.findInstrumentByTickerOrFigi(ticker, token) : null)
    || (figi ? await tinkoffService.findInstrumentByTickerOrFigi(figi, token) : null);
  if (!inst) {
    return res.status(404).json({
      ok: false,
      error: `Инструмент ${ticker} не найден в T-Investments API`,
      candles: []
    });
  }

  figi = inst.figi;
  const lot = inst.lot || 1;

  // Parse optional 'to' and 'from' parameters
  let toDate = new Date();
  if (req.query.to) {
    const toNum = Number(req.query.to);
    if (!isNaN(toNum) && toNum > 0) {
      toDate = new Date(toNum > 10000000000 ? toNum : toNum * 1000);
    } else {
      const parsed = new Date(req.query.to);
      if (!isNaN(parsed.getTime())) {
        toDate = parsed;
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

  const fromSec = fromDate ? Math.floor(fromDate.getTime() / 1000) : null;

  // Check cache
  const cacheKey = `${inst.ticker}_${figi}_${interval}_${count}_${req.query.to || ''}_${req.query.from || ''}`;
  const cachedData = candleCache.get(cacheKey);
  if (cachedData) {
    return res.json(cachedData);
  }

  // Fetch real candles from T-Bank API
  const candles = await tinkoffService.getCandles({
    figi,
    interval,
    count,
    toDate,
    fromDate,
    token
  });

  if (candles && candles.length > 0) {
    const validCandles = fromSec ? candles.filter(c => c.time >= fromSec) : candles;

    if (validCandles.length > 0) {
      const result = {
        ok: true,
        source: 'tinkoff',
        ticker: inst.ticker,
        name: inst.name,
        figi,
        lot,
        currency: inst.currency,
        type: inst.type || 'share',
        classCode: inst.classCode || 'TQBR',
        interval,
        candles: validCandles
      };
      candleCache.set(cacheKey, result);
      return res.json(result);
    }
  }

  // No synthetic / simulated fallback - only real data
  return res.status(404).json({
    ok: false,
    error: 'Биржевые данные недоступны в T-Investments API для указанного диапазона',
    ticker: inst.ticker,
    figi,
    lot,
    type: inst.type || 'share',
    classCode: inst.classCode || 'TQBR',
    interval,
    candles: []
  });
});

module.exports = router;

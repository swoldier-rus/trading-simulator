// Allow TLS connections with Russian Ministry of Digital Development (Минцифры) certs used by T-Bank
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const CONFIG_FILE = path.join(__dirname, 'config.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/openalgo-charts', express.static(path.join(__dirname, 'node_modules', 'openalgo-charts', 'dist')));

// Default configuration
const defaultConfig = {
  tinkoffToken: '',
  initialBalance: 100000,
  currency: 'RUB',
  commission: 0.05, // 0.05%
  selectedSymbol: 'SBER',
  selectedFigi: 'BBG004730N88',
  selectedTimeframe: '1h'
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return { ...defaultConfig, ...data };
    }
  } catch (err) {
    console.error('Error reading config.json:', err.message);
  }
  return { ...defaultConfig };
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving config.json:', err.message);
  }
}

let currentConfig = loadConfig();

// Popular default Russian Blue Chips for instant access
const DEFAULT_INSTRUMENTS = [
  { ticker: 'SBER', name: 'Сбер Банк', figi: 'BBG004730N88', basePrice: 280, currency: 'RUB', lot: 10 },
  { ticker: 'GAZP', name: 'Газпром', figi: 'BBG004730RP0', basePrice: 145, currency: 'RUB', lot: 10 },
  { ticker: 'LKOH', name: 'ЛУКОЙЛ', figi: 'BBG004731032', basePrice: 7200, currency: 'RUB', lot: 1 },
  { ticker: 'T', name: 'Т-Технологии (Т-Банк)', figi: 'TCS00A107UL4', basePrice: 2600, currency: 'RUB', lot: 1 },
  { ticker: 'YNDX', name: 'Яндекс (МКПАО)', figi: 'BBG006L8G4H1', basePrice: 4100, currency: 'RUB', lot: 1 },
  { ticker: 'ROSN', name: 'Роснефть', figi: 'BBG004731354', basePrice: 520, currency: 'RUB', lot: 1 },
  { ticker: 'GMKN', name: 'Норникель', figi: 'BBG004731489', basePrice: 130, currency: 'RUB', lot: 10 },
  { ticker: 'NVTK', name: 'НОВАТЭК', figi: 'BBG00475KKY8', basePrice: 980, currency: 'RUB', lot: 1 },
  { ticker: 'MGNT', name: 'Магнит', figi: 'BBG004RVFFC0', basePrice: 5600, currency: 'RUB', lot: 1 },
  { ticker: 'VTBR', name: 'Банк ВТБ', figi: 'BBG004730ZJ9', basePrice: 85, currency: 'RUB', lot: 100 },
  { ticker: 'PLZL', name: 'Полюс', figi: 'BBG000R607Y3', basePrice: 14500, currency: 'RUB', lot: 1 },
  { ticker: 'TATN', name: 'Татнефть', figi: 'BBG004RVFFD9', basePrice: 620, currency: 'RUB', lot: 1 },
  { ticker: 'ALRS', name: 'АЛРОСА', figi: 'BBG004S683W7', basePrice: 58, currency: 'RUB', lot: 10 },
  { ticker: 'MOEX', name: 'Московская Биржа', figi: 'BBG004730JJ5', basePrice: 220, currency: 'RUB', lot: 10 },
  { ticker: 'CHMF', name: 'Северсталь', figi: 'BBG00475K6C3', basePrice: 1250, currency: 'RUB', lot: 1 }
];

// Helper: Convert T-Investments quotation { units, nano } to float
function quotationToNumber(q) {
  if (!q) return 0;
  const units = Number(q.units || 0);
  const nano = Number(q.nano || 0);
  return +(units + nano / 1e9).toFixed(4);
}

// Helper: Interval to T-Investments enum
function mapIntervalToTinkoff(interval) {
  switch ((interval || '').toLowerCase()) {
    case '1m': return 'CANDLE_INTERVAL_1_MIN';
    case '5m': return 'CANDLE_INTERVAL_5_MIN';
    case '15m': return 'CANDLE_INTERVAL_15_MIN';
    case '1h': return 'CANDLE_INTERVAL_HOUR';
    case '4h': return 'CANDLE_INTERVAL_4_HOUR';
    case '1d': return 'CANDLE_INTERVAL_DAY';
    case '1w': return 'CANDLE_INTERVAL_WEEK';
    default: return 'CANDLE_INTERVAL_HOUR';
  }
}

// Helper: Interval to seconds
function intervalToSeconds(interval) {
  switch ((interval || '').toLowerCase()) {
    case '1m': return 60;
    case '5m': return 300;
    case '15m': return 900;
    case '1h': return 3600;
    case '4h': return 14400;
    case '1d': return 86400;
    case '1w': return 604800;
    default: return 3600;
  }
}

// Helper: Maximum allowed query window per T-Bank API v2 rules
function getMaxChunkMs(interval) {
  switch ((interval || '').toLowerCase()) {
    case '1m':
    case '5m':
    case '15m': return 24 * 3600 * 1000; // 1 day max per request
    case '1h':
    case '4h': return 7 * 24 * 3600 * 1000; // 7 days max per request
    case '1d': return 365 * 24 * 3600 * 1000; // 1 year max per request
    case '1w': return 2 * 365 * 24 * 3600 * 1000; // 2 years max per request
    default: return 7 * 24 * 3600 * 1000;
  }
}

// In-memory candle cache to avoid hitting rate limits
const candleCache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 1 minute

// Generate realistic simulated candles if token is absent
function generateSimulatedCandles(basePrice, interval, count = 400, toTimestampSec = null) {
  const stepSec = intervalToSeconds(interval);
  let endTime = toTimestampSec ? Number(toTimestampSec) : Math.floor(Date.now() / 1000);
  if (interval === '1d') {
    endTime = Math.floor(endTime / 86400) * 86400;
  }
  const startTime = endTime - (count - 1) * stepSec;
  
  const candles = [];
  let current = basePrice;
  const volatility = 0.007; // 0.7% standard volatility

  for (let i = 0; i < count; i++) {
    const time = startTime + i * stepSec;
    const open = current;
    const change = (Math.random() - 0.495) * 2 * volatility * open;
    const close = Math.max(open * 0.1, +(open + change).toFixed(2));
    const high = +(Math.max(open, close) + Math.random() * volatility * open * 0.8).toFixed(2);
    const low = +(Math.min(open, close) - Math.random() * volatility * open * 0.8).toFixed(2);
    const volume = Math.floor(Math.random() * 40000 + 5000);

    candles.push({
      time,
      open,
      high,
      low,
      close,
      volume
    });

    current = close;
  }

  return candles;
}

// API: Get current config & token status
app.get('/api/settings', (req, res) => {
  const token = currentConfig.tinkoffToken || '';
  const tokenPreview = token.length > 8 ? `${token.slice(0, 4)}...${token.slice(-4)}` : '';

  res.json({
    hasToken: Boolean(token && token.trim().length > 10),
    tokenPreview,
    initialBalance: currentConfig.initialBalance,
    currency: currentConfig.currency,
    commission: currentConfig.commission,
    selectedSymbol: currentConfig.selectedSymbol,
    selectedFigi: currentConfig.selectedFigi,
    selectedTimeframe: currentConfig.selectedTimeframe
  });
});

// API: Update settings & token
app.post('/api/settings', (req, res) => {
  const { tinkoffToken, initialBalance, commission, selectedSymbol, selectedFigi, selectedTimeframe } = req.body;

  if (tinkoffToken !== undefined) currentConfig.tinkoffToken = tinkoffToken.trim();
  if (initialBalance !== undefined) currentConfig.initialBalance = Number(initialBalance) || 100000;
  if (commission !== undefined) currentConfig.commission = Number(commission) || 0.05;
  if (selectedSymbol !== undefined) currentConfig.selectedSymbol = selectedSymbol;
  if (selectedFigi !== undefined) currentConfig.selectedFigi = selectedFigi;
  if (selectedTimeframe !== undefined) currentConfig.selectedTimeframe = selectedTimeframe;

  saveConfig(currentConfig);
  candleCache.clear();
  res.json({ ok: true, message: 'Настройки успешно сохранены' });
});

// API: Test T-Investments token
app.post('/api/test-token', async (req, res) => {
  const token = req.body.token || currentConfig.tinkoffToken;

  if (!token || token.trim().length < 10) {
    return res.status(400).json({ ok: false, error: 'Токен не указан или слишком короткий' });
  }

  try {
    const response = await fetch('https://invest-public-api.tinkoff.ru/rest/tinkoff.public.invest.api.contract.v1.UsersService/GetAccounts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-app-name': 'tradingview-simulator'
      },
      body: JSON.stringify({})
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: data.message || `Ошибка API T-Инвестиций: ${response.statusText}`
      });
    }

    res.json({
      ok: true,
      accounts: data.accounts || [],
      message: 'Токен успешно проверен! Подключение к T-Инвестициям активно.'
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: `Сетевая ошибка: ${err.message}` });
  }
});

// API: Search instruments
app.get('/api/instruments/search', async (req, res) => {
  const query = (req.query.query || '').trim().toUpperCase();
  const token = currentConfig.tinkoffToken;

  if (!query) {
    return res.json({ instruments: DEFAULT_INSTRUMENTS });
  }

  if (token && token.length > 10) {
    try {
      const response = await fetch('https://invest-public-api.tinkoff.ru/rest/tinkoff.public.invest.api.contract.v1.InstrumentsService/FindInstrument', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-app-name': 'tradingview-simulator'
        },
        body: JSON.stringify({
          query: query,
          instrumentKind: 'INSTRUMENT_TYPE_SHARE',
          apiTradeAvailableFlag: false
        })
      });

      if (response.ok) {
        const data = await response.json();
        const instruments = (data.instruments || []).slice(0, 25).map(inst => ({
          ticker: inst.ticker,
          name: inst.name,
          figi: inst.figi,
          classCode: inst.classCode,
          lot: inst.lot || 1,
          currency: (inst.currency || 'RUB').toUpperCase()
        }));

        if (instruments.length > 0) {
          return res.json({ instruments });
        }
      }
    } catch (err) {
      console.warn('T-Investments FindInstrument error:', err.message);
    }
  }

  // Filter default list if API not available or no match
  const filtered = DEFAULT_INSTRUMENTS.filter(
    inst => inst.ticker.includes(query) || inst.name.toUpperCase().includes(query)
  );

  res.json({ instruments: filtered.length > 0 ? filtered : DEFAULT_INSTRUMENTS });
});

// API: Get historical candles
app.get('/api/candles', async (req, res) => {
  const ticker = (req.query.ticker || currentConfig.selectedSymbol || 'SBER').toUpperCase();
  let figi = req.query.figi;
  const interval = req.query.interval || currentConfig.selectedTimeframe || '1h';
  const count = Math.min(3000, Math.max(10, Number(req.query.count) || 800));
  const token = currentConfig.tinkoffToken;

  // Resolve figi and lot from default instruments if not provided
  const matchInst = DEFAULT_INSTRUMENTS.find(i => i.ticker === ticker);
  if (!figi && matchInst) {
    figi = matchInst.figi;
  }
  const lot = matchInst ? matchInst.lot : 1;

  // Parse optional 'to' and 'from' parameters for pagination and historical navigation
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

  const cacheKey = `${ticker}_${figi}_${interval}_${count}_${req.query.to || ''}_${req.query.from || ''}`;
  const cached = candleCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return res.json(cached.data);
  }

  // If token is provided, attempt to fetch real data from T-Investments
  if (token && token.length > 10 && figi) {
    try {
      const chunkMs = getMaxChunkMs(interval);
      const stepSec = intervalToSeconds(interval);
      const barsPerChunk = Math.max(1, Math.floor(chunkMs / (stepSec * 1000)));
      const numChunks = Math.min(35, Math.max(3, Math.ceil(count / barsPerChunk) + 2));

      let chunkEnd = new Date(toDate.getTime());
      let rawCandles = [];

      for (let ch = 0; ch < numChunks; ch++) {
        let chunkStart = new Date(chunkEnd.getTime() - chunkMs);
        if (fromDate && chunkStart < fromDate) {
          chunkStart = new Date(fromDate.getTime());
        }

        const response = await fetch('https://invest-public-api.tinkoff.ru/rest/tinkoff.public.invest.api.contract.v1.MarketDataService/GetCandles', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'x-app-name': 'tradingview-simulator'
          },
          body: JSON.stringify({
            figi: figi,
            from: chunkStart.toISOString(),
            to: chunkEnd.toISOString(),
            interval: mapIntervalToTinkoff(interval),
            candleSourceType: 'CANDLE_SOURCE_UNSPECIFIED'
          })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.candles && data.candles.length > 0) {
            rawCandles.push(...data.candles);
          }
        } else {
          const errorText = await response.text();
          console.warn('Tinkoff GetCandles returned error:', response.status, errorText);
          break;
        }

        if (fromDate && chunkStart <= fromDate) break;
        chunkEnd = new Date(chunkStart.getTime() - 1000);
        if (rawCandles.length >= count * 1.5) break;
      }

      if (rawCandles.length > 0) {
        // Deduplicate and sort
        const seen = new Set();
        const candles = [];
        for (const c of rawCandles) {
          const t = Math.floor(new Date(c.time).getTime() / 1000);
          if (!seen.has(t)) {
            seen.add(t);
            candles.push({
              time: t,
              open: quotationToNumber(c.open),
              high: quotationToNumber(c.high),
              low: quotationToNumber(c.low),
              close: quotationToNumber(c.close),
              volume: Number(c.volume || 0)
            });
          }
        }
        candles.sort((a, b) => a.time - b.time);

        const finalCandles = count ? candles.slice(-count) : candles;
        const result = {
          ok: true,
          source: 'tinkoff',
          ticker,
          figi,
          lot,
          interval,
          candles: finalCandles
        };

        candleCache.set(cacheKey, { timestamp: Date.now(), data: result });
        return res.json(result);
      }
    } catch (err) {
      console.error('Error fetching candles from Tinkoff:', err.message);
    }
  }

  // Fallback to high-fidelity simulated candles
  const basePrice = matchInst ? matchInst.basePrice : 250;
  const toSec = hasCustomTo ? Math.floor(toDate.getTime() / 1000) : null;
  const candles = generateSimulatedCandles(basePrice, interval, count, toSec);

  const result = {
    ok: true,
    source: 'simulation',
    note: token ? 'Свечи сгенерированы (инструмент недоступен в API)' : 'Демо-режим (введите токен Т-Инвестиций в настройках)',
    ticker,
    figi,
    lot,
    interval,
    candles
  };

  res.json(result);
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` TradingView Market Simulator running on http://localhost:${PORT}`);
  console.log(` Data Source: T-Investments API (with Demo Fallback)`);
  console.log(` Powered by OpenAlgo Charts Engine`);
  console.log(`=======================================================`);
});

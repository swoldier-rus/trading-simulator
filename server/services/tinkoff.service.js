// server/services/tinkoff.service.js - T-Investments (T-Bank) REST API Client
const { rateLimiter } = require('./rate-limiter.service');
const { circuitBreaker } = require('./circuit-breaker.service');
const { intervalToSeconds } = require('./simulation.service');

const API_BASE = 'https://invest-public-api.tinkoff.ru/rest';

// Helper: Convert T-Investments quotation { units, nano } to float
function quotationToNumber(q) {
  if (!q) return 0;
  const units = Number(q.units || 0);
  const nano = Number(q.nano || 0);
  return +(units + nano / 1e9).toFixed(4);
}

// Helper: Map interval string to T-Investments protobuf enum
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

// Helper: Maximum allowed query chunk window per interval (T-Bank API rules)
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

class TinkoffService {
  constructor() {
    this.sharesCatalog = null;
    this.sharesCatalogTime = 0;
    this.sharesCatalogTtl = 60 * 60 * 1000; // 1 hour
    this.loadingCatalogPromise = null;
  }

  /**
   * Helper for authenticated POST requests to T-Bank Invest API
   */
  async post(endpoint, token, payload) {
    return rateLimiter.executeWithRetry(async () => {
      const url = `${API_BASE}/${endpoint}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-app-name': 'tradingview-simulator'
        },
        body: JSON.stringify(payload || {})
      });
      return res;
    });
  }

  /**
   * Validate token by requesting account list
   */
  async testToken(token) {
    if (!token || token.trim().length < 10) {
      return { ok: false, status: 400, error: 'Токен не указан или слишком короткий' };
    }

    try {
      const response = await this.post('tinkoff.public.invest.api.contract.v1.UsersService/GetAccounts', token, {});
      const data = await response.json();

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: data.message || `Ошибка API T-Инвестиций: ${response.statusText}`
        };
      }

      circuitBreaker.recordSuccess();
      return {
        ok: true,
        accounts: data.accounts || [],
        message: 'Токен успешно проверен! Подключение к T-Инвестициям активно.'
      };
    } catch (err) {
      circuitBreaker.recordFailure(err);
      return { ok: false, status: 500, error: `Сетевая ошибка: ${err.message}` };
    }
  }

  /**
   * Fetch complete shares catalog directly from T-Investments API
   */
  async getSharesCatalog(token) {
    if (!token || token.length < 10) return [];

    const now = Date.now();
    if (this.sharesCatalog && (now - this.sharesCatalogTime < this.sharesCatalogTtl)) {
      return this.sharesCatalog;
    }

    if (this.loadingCatalogPromise) {
      return await this.loadingCatalogPromise;
    }

    this.loadingCatalogPromise = (async () => {
      try {
        const response = await this.post('tinkoff.public.invest.api.contract.v1.InstrumentsService/Shares', token, {
          instrumentStatus: 'INSTRUMENT_STATUS_BASE'
        });

        if (!response.ok) {
          const errText = await response.text();
          console.warn('[TinkoffService] Shares catalog fetch error:', response.status, errText);
          return this.sharesCatalog || [];
        }

        const data = await response.json();
        const rawList = data.instruments || [];

        // Normalize and filter MOEX Russian shares
        const normalized = rawList
          .filter(inst => inst.currency === 'rub' || (inst.exchange && inst.exchange.toLowerCase().includes('moex')))
          .map(inst => ({
            ticker: (inst.ticker || '').toUpperCase(),
            name: inst.name || inst.ticker,
            figi: inst.figi,
            classCode: inst.classCode || 'TQBR',
            lot: Number(inst.lot) || 1,
            minPriceIncrement: quotationToNumber(inst.minPriceIncrement) || 0.01,
            currency: (inst.currency || 'RUB').toUpperCase(),
            exchange: inst.exchange || 'MOEX',
            uid: inst.uid,
            first1minCandleDate: inst.first1minCandleDate || null,
            first1dayCandleDate: inst.first1dayCandleDate || null,
            ipoDate: inst.ipoDate || null
          }));

        if (normalized.length > 0) {
          this.sharesCatalog = normalized;
          this.sharesCatalogTime = Date.now();
          console.log(`[TinkoffService] Cached ${normalized.length} MOEX shares from T-Invest API`);
        }

        return this.sharesCatalog || [];
      } catch (err) {
        console.warn('[TinkoffService] Error fetching shares catalog:', err.message);
        return this.sharesCatalog || [];
      } finally {
        this.loadingCatalogPromise = null;
      }
    })();

    return await this.loadingCatalogPromise;
  }

  /**
   * Search instruments strictly from T-Investments catalog
   */
  async searchInstruments(query, token) {
    if (!token || token.length < 10) return [];

    const catalog = await this.getSharesCatalog(token);
    const q = (query || '').trim().toUpperCase();

    if (!q) {
      // Return top priority MOEX blue chips from live catalog
      const priorityTickers = [
        'SBER', 'GAZP', 'LKOH', 'T', 'YNDX', 'ROSN', 'GMKN', 'NVTK', 'MGNT',
        'VTBR', 'PLZL', 'TATN', 'ALRS', 'MOEX', 'CHMF', 'OZON', 'SNGS', 'AFLT',
        'NLMK', 'IRAO', 'MTSS', 'MAGN', 'PHOR', 'POSI', 'CBOM', 'PIKK', 'SELG', 'TRNFP'
      ];

      const topShares = [];
      for (const ticker of priorityTickers) {
        const found = catalog.find(i => i.ticker === ticker);
        if (found) topShares.push(found);
      }

      // Add other shares from catalog to fill up to 30
      for (const inst of catalog) {
        if (!topShares.find(i => i.ticker === inst.ticker)) {
          topShares.push(inst);
          if (topShares.length >= 30) break;
        }
      }

      return topShares;
    }

    // Filter by query (exact ticker match first, then startsWith, then name match)
    const exact = [];
    const starts = [];
    const includes = [];

    for (const inst of catalog) {
      if (inst.ticker === q) {
        exact.push(inst);
      } else if (inst.ticker.startsWith(q)) {
        starts.push(inst);
      } else if (inst.ticker.includes(q) || (inst.name && inst.name.toUpperCase().includes(q))) {
        includes.push(inst);
      }
    }

    const results = [...exact, ...starts, ...includes];
    return results.slice(0, 30);
  }

  /**
   * Find a single instrument by ticker or FIGI strictly from T-Investments
   */
  async findInstrumentByTickerOrFigi(identifier, token) {
    if (!identifier) return null;
    const idUpper = identifier.trim().toUpperCase();

    // 1. Check in-memory catalog
    if (this.sharesCatalog) {
      const match = this.sharesCatalog.find(i => i.ticker === idUpper || i.figi === idUpper);
      if (match) return match;
    }

    // 2. Load catalog if not yet loaded
    if (token) {
      const catalog = await this.getSharesCatalog(token);
      const match = catalog.find(i => i.ticker === idUpper || i.figi === idUpper);
      if (match) return match;

      // 3. Fallback to live GetInstrumentBy
      try {
        const isFigi = idUpper.startsWith('BBG') || idUpper.startsWith('TCS') || idUpper.length >= 12;
        const res = await this.post('tinkoff.public.invest.api.contract.v1.InstrumentsService/GetInstrumentBy', token, {
          idType: isFigi ? 'INSTRUMENT_ID_TYPE_FIGI' : 'INSTRUMENT_ID_TYPE_TICKER',
          classCode: 'TQBR',
          id: idUpper
        });
        if (res.ok) {
          const d = await res.json();
          if (d.instrument) {
            const inst = d.instrument;
            return {
              ticker: (inst.ticker || '').toUpperCase(),
              name: inst.name || inst.ticker,
              figi: inst.figi,
              classCode: inst.classCode || 'TQBR',
              lot: Number(inst.lot) || 1,
              minPriceIncrement: quotationToNumber(inst.minPriceIncrement) || 0.01,
              currency: (inst.currency || 'RUB').toUpperCase(),
              exchange: inst.exchange || 'MOEX',
              uid: inst.uid,
              first1minCandleDate: inst.first1minCandleDate || null,
              first1dayCandleDate: inst.first1dayCandleDate || null,
              ipoDate: inst.ipoDate || null
            };
          }
        }
      } catch (e) {
        console.warn('[TinkoffService] GetInstrumentBy fallback error:', e.message);
      }
    }

    return null;
  }

  /**
   * Get instrument details including historical candle dates
   */
  async getInstrumentDetails(figi, token) {
    if (!token || token.length < 10 || !figi) {
      return null;
    }

    const inst = await this.findInstrumentByTickerOrFigi(figi, token);
    if (inst) {
      return {
        figi: inst.figi,
        ticker: inst.ticker,
        first1MinCandleDate: inst.first1minCandleDate,
        first1DayCandleDate: inst.first1dayCandleDate,
        ipoDate: inst.ipoDate,
        lot: inst.lot,
        name: inst.name,
        currency: inst.currency
      };
    }

    return null;
  }

  /**
   * Fetch historical candles in chunks with pagination
   */
  async getCandles({ figi, interval, count, toDate, fromDate, token }) {
    if (!token || token.length < 10 || !figi) {
      return null;
    }

    if (!circuitBreaker.canExecute()) {
      console.warn('[TinkoffService] Circuit breaker is OPEN. Skipping remote candle fetch.');
      return null;
    }

    try {
      const chunkMs = getMaxChunkMs(interval);
      const stepSec = intervalToSeconds(interval);
      // Account for MOEX trading hours density (trading is ~9-14h/day, weekends are closed)
      const barsPerChunk = Math.max(1, Math.floor((chunkMs / (stepSec * 1000)) * 0.45));
      const numChunks = Math.min(80, Math.max(6, Math.ceil(count / barsPerChunk) + 5));

      let chunkEnd = new Date(toDate.getTime());
      let rawCandles = [];

      for (let ch = 0; ch < numChunks; ch++) {
        let chunkStart = new Date(chunkEnd.getTime() - chunkMs);
        if (fromDate && chunkStart < fromDate) {
          chunkStart = new Date(fromDate.getTime());
        }

        const response = await this.post('tinkoff.public.invest.api.contract.v1.MarketDataService/GetCandles', token, {
          figi: figi,
          from: chunkStart.toISOString(),
          to: chunkEnd.toISOString(),
          interval: mapIntervalToTinkoff(interval),
          candleSourceType: 'CANDLE_SOURCE_UNSPECIFIED'
        });

        if (response.ok) {
          const data = await response.json();
          if (data.candles && data.candles.length > 0) {
            rawCandles.push(...data.candles);
          }
        } else {
          const errorText = await response.text();
          console.warn('[TinkoffService] GetCandles error:', response.status, errorText);
          if (response.status >= 500 || response.status === 429) {
            circuitBreaker.recordFailure(new Error(`GetCandles ${response.status}: ${errorText}`));
          }
          break;
        }

        if (fromDate && chunkStart <= fromDate) break;
        chunkEnd = new Date(chunkStart.getTime() - 1000);
        if (!fromDate && rawCandles.length >= count * 1.5) break;
      }

      if (rawCandles.length > 0) {
        circuitBreaker.recordSuccess();

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
        if (fromDate) {
          const fromSec = Math.floor(fromDate.getTime() / 1000);
          const fromFiltered = candles.filter(c => c.time >= fromSec);
          return count ? fromFiltered.slice(0, count) : fromFiltered;
        }
        return count ? candles.slice(-count) : candles;
      }

      return null;
    } catch (err) {
      console.error('[TinkoffService] Error fetching candles from Tinkoff:', err.message);
      circuitBreaker.recordFailure(err);
      return null;
    }
  }
}

const tinkoffService = new TinkoffService();
module.exports = {
  tinkoffService,
  quotationToNumber,
  mapIntervalToTinkoff,
  getMaxChunkMs
};

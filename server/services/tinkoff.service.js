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
   * Search instruments by ticker or name query
   */
  async searchInstruments(query, token) {
    if (!token || token.length < 10 || !query) {
      return null;
    }

    if (!circuitBreaker.canExecute()) {
      console.warn('[TinkoffService] Circuit breaker is OPEN. Skipping instrument search API call.');
      return null;
    }

    try {
      const response = await this.post('tinkoff.public.invest.api.contract.v1.InstrumentsService/FindInstrument', token, {
        query: query,
        instrumentKind: 'INSTRUMENT_TYPE_SHARE',
        apiTradeAvailableFlag: false
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn('[TinkoffService] FindInstrument error:', response.status, errText);
        if (response.status >= 500 || response.status === 429) {
          circuitBreaker.recordFailure(new Error(`FindInstrument ${response.status}`));
        }
        return null;
      }

      const data = await response.json();
      circuitBreaker.recordSuccess();

      const instruments = (data.instruments || []).slice(0, 25).map(inst => ({
        ticker: inst.ticker,
        name: inst.name,
        figi: inst.figi,
        classCode: inst.classCode,
        lot: inst.lot || 1,
        currency: (inst.currency || 'RUB').toUpperCase()
      }));

      return instruments.length > 0 ? instruments : null;
    } catch (err) {
      console.warn('[TinkoffService] Network error during FindInstrument:', err.message);
      circuitBreaker.recordFailure(err);
      return null;
    }
  }

  /**
   * Get instrument details including historical candle dates
   */
  async getInstrumentDetails(figi, token) {
    if (!token || token.length < 10 || !figi) {
      return null;
    }

    try {
      const response = await this.post('tinkoff.public.invest.api.contract.v1.InstrumentsService/GetInstrumentBy', token, {
        idType: 'INSTRUMENT_ID_TYPE_FIGI',
        id: figi
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const inst = data.instrument || {};
      return {
        figi: inst.figi,
        ticker: inst.ticker,
        first1MinCandleDate: inst.first1minCandleDate || inst.first1MinCandleDate,
        first1DayCandleDate: inst.first1dayCandleDate || inst.first1DayCandleDate,
        ipoDate: inst.ipoDate
      };
    } catch (err) {
      console.warn('[TinkoffService] Network error during GetInstrumentBy:', err.message);
      return null;
    }
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

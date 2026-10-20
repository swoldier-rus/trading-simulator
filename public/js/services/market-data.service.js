// services/market-data.service.js - Unified Market Data Service with IndexedDB caching
import { API } from '../api.js';
import { cacheService } from './cache.service.js';

class MarketDataService {
  constructor() {
    this.inFlightRequests = new Map();
  }

  // Smart candle loader: serves from local IndexedDB cache when possible, otherwise fetches & caches
  async getCandles(ticker, figi, timeframe, count = 1200, to = null, from = null, options = {}) {
    const { forceNetwork = false, backgroundSync = true, lastClose = null } = options;
    const cacheKey = `${(ticker || '').toUpperCase()}_${(timeframe || '').toLowerCase()}`;

    // 1. Try reading from local IndexedDB cache if not forcing network
    if (!forceNetwork) {
      try {
        let cached = [];
        if (from && to) {
          cached = await cacheService.getCachedCandles(ticker, timeframe, { fromTime: from, toTime: to });
        } else if (from) {
          cached = await cacheService.getCachedCandles(ticker, timeframe, { fromTime: from });
        } else if (to) {
          cached = await cacheService.getCachedCandles(ticker, timeframe, { toTime: to });
        } else {
          cached = await cacheService.getCachedCandles(ticker, timeframe);
        }

        // If from is requested, cache must contain bars >= from
        const minBarsRequired = from ? 1 : 100;
        if (cached && cached.length >= minBarsRequired) {
          const meta = await cacheService.getSeriesMeta(ticker, timeframe);
          const visibleSlice = count ? cached.slice(-count) : cached;

          // If background sync is enabled and not requesting a historical 'to'/'from' target, refresh delta in background
          if (backgroundSync && !to && !from) {
            this.syncLatestInBackground(ticker, figi, timeframe, count);
          }

          return {
            ok: true,
            source: 'cache',
            candles: visibleSlice,
            lot: meta ? meta.lot : 10,
            fromCache: true,
            totalCached: cached.length
          };
        }
      } catch (err) {
        console.warn('[MarketDataService] Cache lookup error, falling back to network:', err);
      }
    }

    // 2. Deduplicate simultaneous network requests for the same params
    const requestKey = `${cacheKey}_${count}_${to || ''}_${from || ''}_${lastClose || ''}`;
    if (this.inFlightRequests.has(requestKey)) {
      return await this.inFlightRequests.get(requestKey);
    }

    const fetchPromise = (async () => {
      try {
        const data = await API.getCandles(ticker, figi, timeframe, count, to, from, lastClose);

        if (data && data.candles && data.candles.length > 0) {
          // Asynchronously persist fetched candles into IndexedDB
          cacheService.saveCandles(ticker, timeframe, data.candles, {
            lot: data.lot,
            source: data.source
          }).catch(e => console.warn('[MarketDataService] Error saving to cache:', e));
        }

        return data;
      } finally {
        this.inFlightRequests.delete(requestKey);
      }
    })();

    this.inFlightRequests.set(requestKey, fetchPromise);
    return await fetchPromise;
  }

  // Asynchronously fetch latest bars to keep cache fresh without blocking the UI
  async syncLatestInBackground(ticker, figi, timeframe, count = 300) {
    try {
      const data = await API.getCandles(ticker, figi, timeframe, count);
      if (data && data.candles && data.candles.length > 0) {
        await cacheService.saveCandles(ticker, timeframe, data.candles, {
          lot: data.lot,
          source: data.source
        });
      }
    } catch (err) {
      // Background sync errors are non-critical
    }
  }

  async clearCache(ticker, timeframe) {
    return await cacheService.clearCache(ticker, timeframe);
  }

  async getCacheStats(ticker, timeframe) {
    return await cacheService.getSeriesMeta(ticker, timeframe);
  }
}

export const marketDataService = new MarketDataService();

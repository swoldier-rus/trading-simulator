// services/market-data.service.js - Unified Market Data Service with Shared In-Memory Cache and IndexedDB caching
import { API } from '../api.js';
import { cacheService } from './cache.service.js';
import { eventBus } from '../core/event-bus.js';
import { timeframeToSeconds } from '../core/utils.js';

/**
 * Resample / aggregate lower-timeframe OHLCV candles to higher timeframe
 * @param {Array<{time: number, open: number, high: number, low: number, close: number, volume?: number}>} baseCandles
 * @param {number} targetSec Timeframe step in seconds (e.g. 300 for 5m, 900 for 15m, 3600 for 1h)
 * @returns {Array<{time: number, open: number, high: number, low: number, close: number, volume: number}>}
 */
export function resampleOHLCV(baseCandles, targetSec) {
  if (!baseCandles || baseCandles.length === 0 || !targetSec || targetSec <= 0) return [];
  const aggregated = [];
  let currentBucket = null;

  for (let i = 0; i < baseCandles.length; i++) {
    const c = baseCandles[i];
    if (!c || typeof c.time !== 'number' || typeof c.close !== 'number') continue;
    const bucketTime = Math.floor(c.time / targetSec) * targetSec;

    if (!currentBucket || currentBucket.time !== bucketTime) {
      if (currentBucket) {
        aggregated.push(currentBucket);
      }
      currentBucket = {
        time: bucketTime,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0
      };
    } else {
      if (c.high > currentBucket.high) currentBucket.high = c.high;
      if (c.low < currentBucket.low) currentBucket.low = c.low;
      currentBucket.close = c.close;
      currentBucket.volume += (c.volume || 0);
    }
  }

  if (currentBucket) {
    aggregated.push(currentBucket);
  }

  return aggregated;
}

/**
 * Shared In-Memory Bar Cache:
 * Stores high-speed in-memory OHLCV series across all chart slots and enables
 * zero-network multi-timeframe aggregation from base bars.
 */
export class SharedBarCache {
  constructor(maxEntries = 50) {
    this.cache = new Map();
    this.maxEntries = maxEntries;
  }

  getKey(ticker, timeframe) {
    return `${(ticker || '').toUpperCase()}_${(timeframe || '').toLowerCase()}`;
  }

  get(ticker, timeframe) {
    const key = this.getKey(ticker, timeframe);
    const entry = this.cache.get(key);
    if (!entry) return null;
    // LRU refresh: re-insert at end
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry;
  }

  set(ticker, timeframe, data, replace = false) {
    const key = this.getKey(ticker, timeframe);
    const existing = this.cache.get(key);
    const incomingCandles = data.candles || [];

    let candles = incomingCandles;
    if (!replace && existing && existing.candles && existing.candles.length > 0 && incomingCandles.length > 0) {
      // Merge candles, deduplicate by timestamp, and sort ascending
      const map = new Map();
      for (const c of existing.candles) {
        if (c && typeof c.time === 'number') map.set(c.time, c);
      }
      for (const c of incomingCandles) {
        if (c && typeof c.time === 'number') map.set(c.time, c);
      }
      candles = Array.from(map.values()).sort((a, b) => a.time - b.time);
      if (candles.length > 10000) {
        candles = candles.slice(-10000);
      }
    }

    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      candles,
      lot: data.lot || (existing ? existing.lot : 10),
      source: data.source || (existing ? existing.source : 'cache'),
      minTime: candles.length > 0 ? candles[0].time : 0,
      maxTime: candles.length > 0 ? candles[candles.length - 1].time : 0,
      updatedAt: Date.now()
    });
  }

  has(ticker, timeframe) {
    return this.cache.has(this.getKey(ticker, timeframe));
  }

  clear(ticker = null, timeframe = null) {
    if (ticker && timeframe) {
      this.cache.delete(this.getKey(ticker, timeframe));
    } else if (ticker) {
      const t = (ticker || '').toUpperCase();
      for (const k of this.cache.keys()) {
        if (k.startsWith(`${t}_`)) this.cache.delete(k);
      }
    } else {
      this.cache.clear();
    }
  }

  deriveFromBaseTimeframe(ticker, targetTimeframe, count = 1200, to = null, from = null) {
    const targetSec = timeframeToSeconds(targetTimeframe);
    if (!targetSec || targetSec <= 60) return null;

    // Check lower base timeframes in ascending order
    const baseCandidates = ['1m', '5m', '15m', '1h', '4h'];
    for (const baseTf of baseCandidates) {
      const baseSec = timeframeToSeconds(baseTf);
      if (baseSec < targetSec && (targetSec % baseSec === 0)) {
        const baseEntry = this.get(ticker, baseTf);
        if (baseEntry && baseEntry.candles && baseEntry.candles.length >= 20) {
          const baseCandles = baseEntry.candles;
          const earliest = baseCandles[0].time;
          const latest = baseCandles[baseCandles.length - 1].time;

          // Check if base coverage is sufficient for requested window
          if (to && earliest > to) continue;
          if (to && latest < to - targetSec * 3) continue;
          if (from && earliest > from + targetSec * 3) continue;

          const resampled = resampleOHLCV(baseCandles, targetSec);
          if (resampled && resampled.length > 0) {
            let matching = resampled;
            if (to && from) matching = resampled.filter(c => c.time >= from && c.time <= to);
            else if (to) matching = resampled.filter(c => c.time <= to);
            else if (from) matching = resampled.filter(c => c.time >= from);

            const minBars = Math.min(count || 300, 50);
            if (matching.length >= minBars) {
              const visibleSlice = count ? (to && !from ? matching.slice(-count) : (from && !to ? matching.slice(0, count) : matching.slice(-count))) : matching;
              const derivedResult = {
                ok: true,
                source: 'shared_memory_cache',
                candles: visibleSlice,
                lot: baseEntry.lot || 10,
                fromCache: true,
                derivedFrom: baseTf,
                totalCached: resampled.length
              };
              // Cache the derived series in memory for subsequent instantaneous queries
              this.set(ticker, targetTimeframe, {
                candles: resampled,
                lot: baseEntry.lot || 10,
                source: 'shared_memory_cache'
              });
              return derivedResult;
            }
          }
        }
      }
    }
    return null;
  }
}

class MarketDataService {
  constructor() {
    this.inFlightRequests = new Map();
    this.sharedBarCache = new SharedBarCache(50);
  }

  _extractCandleSlice(cached, count, to, from) {
    if (!cached || cached.length === 0) return [];
    let slice = cached;
    if (to && from) {
      slice = cached.filter(c => c.time >= from && c.time <= to);
    } else if (to) {
      slice = cached.filter(c => c.time <= to);
    } else if (from) {
      slice = cached.filter(c => c.time >= from);
    }
    if (!count) return slice;
    if (to && !from) return slice.slice(-count);
    if (from && !to) return slice.slice(0, count);
    return slice.slice(-count);
  }

  _isCandleSliceSufficient(cached, count, to, from) {
    if (!cached || cached.length === 0) return false;

    // Case 1: Scrolling back in time (to is specified, from is null)
    if (to && !from) {
      const beforeTo = cached.filter(c => c.time <= to);
      const minRequired = Math.min(count || 300, 50);
      return beforeTo.length >= minRequired;
    }

    // Case 2: Explicit date window (both from and to are specified)
    if (from && to) {
      const earliestCached = cached[0]?.time;
      const latestCached = cached[cached.length - 1]?.time;
      if (!earliestCached || !latestCached) return false;
      return earliestCached <= from && latestCached >= to;
    }

    // Case 3: From specified, to is null
    if (from && !to) {
      const afterFrom = cached.filter(c => c.time >= from);
      const minRequired = Math.min(count || 300, 50);
      return afterFrom.length >= minRequired;
    }

    // Case 4: Default latest bars
    const minBarsRequired = Math.min(count || 1200, 100);
    return cached.length >= minBarsRequired;
  }

  // Smart candle loader: serves from shared in-memory cache, then IndexedDB cache, otherwise network
  async getCandles(ticker, figi, timeframe, count = 1200, to = null, from = null, options = {}) {
    const { forceNetwork = false, backgroundSync = true, lastClose = null } = options;
    const cacheKey = `${(ticker || '').toUpperCase()}_${(timeframe || '').toLowerCase()}`;

    // 1. Try reading from shared in-memory bar cache first (0ms latency, zero I/O)
    if (!forceNetwork) {
      const memEntry = this.sharedBarCache.get(ticker, timeframe);
      if (memEntry && memEntry.candles && memEntry.candles.length > 0) {
        if (this._isCandleSliceSufficient(memEntry.candles, count, to, from)) {
          const visibleSlice = this._extractCandleSlice(memEntry.candles, count, to, from);
          if (backgroundSync && !to && !from) {
            this.syncLatestInBackground(ticker, figi, timeframe, count);
          }
          return {
            ok: true,
            source: 'shared_memory_cache',
            candles: visibleSlice,
            lot: memEntry.lot || 10,
            fromCache: true,
            totalCached: memEntry.candles.length
          };
        }
      }

      // Try deriving higher timeframe candles from lower base bars in memory (e.g. 1m -> 5m, 15m)
      const derived = this.sharedBarCache.deriveFromBaseTimeframe(ticker, timeframe, count, to, from);
      if (derived) {
        if (backgroundSync && !to && !from) {
          this.syncLatestInBackground(ticker, figi, timeframe, count);
        }
        return derived;
      }

      // 2. Try reading from local IndexedDB cache if not found in memory
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

        if (this._isCandleSliceSufficient(cached, count, to, from)) {
          const meta = await cacheService.getSeriesMeta(ticker, timeframe);
          const visibleSlice = this._extractCandleSlice(cached, count, to, from);

          // Populate shared in-memory cache with IndexedDB dataset
          this.sharedBarCache.set(ticker, timeframe, {
            candles: cached,
            lot: meta ? meta.lot : 10,
            source: 'indexeddb_cache'
          });

          // If background sync is enabled and not requesting historical target, refresh delta
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

    // 3. Deduplicate simultaneous network requests for the same params
    const requestKey = `${cacheKey}_${count}_${to || ''}_${from || ''}_${lastClose || ''}`;
    if (this.inFlightRequests.has(requestKey)) {
      return await this.inFlightRequests.get(requestKey);
    }

    const fetchPromise = (async () => {
      if (!options.silent) {
        eventBus.emit('chart:loading', true, { fullReset: false });
      }
      try {
        const data = await API.getCandles(ticker, figi, timeframe, count, to, from, lastClose);

        if (data && data.candles && data.candles.length > 0) {
          // Populate shared in-memory cache
          this.sharedBarCache.set(ticker, timeframe, {
            candles: data.candles,
            lot: data.lot || 10,
            source: 'network'
          });

          // Asynchronously persist fetched candles into IndexedDB
          cacheService.saveCandles(ticker, timeframe, data.candles, {
            lot: data.lot,
            source: data.source
          }).catch(e => console.warn('[MarketDataService] Error saving to cache:', e));
        }

        return data;
      } finally {
        if (!options.silent) {
          eventBus.emit('chart:loading', false);
        }
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
        this.sharedBarCache.set(ticker, timeframe, {
          candles: data.candles,
          lot: data.lot || 10,
          source: 'network'
        });
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
    if (ticker && timeframe) {
      this.sharedBarCache.clear(ticker, timeframe);
    } else if (ticker) {
      this.sharedBarCache.clear(ticker);
    } else {
      this.sharedBarCache.clear();
    }
    return await cacheService.clearCache(ticker, timeframe);
  }

  async getCacheStats(ticker, timeframe) {
    return await cacheService.getSeriesMeta(ticker, timeframe);
  }

  // Get earliest and latest historical boundaries for instrument & timeframe
  async getBoundaries(ticker, figi, timeframe, forceRefresh = false) {
    const key = `${(ticker || '').toUpperCase()}_${(timeframe || '').toLowerCase()}`;
    if (!this.boundariesCache) this.boundariesCache = new Map();
    if (!forceRefresh && this.boundariesCache.has(key)) {
      return this.boundariesCache.get(key);
    }
    const data = await API.getInstrumentBoundaries(ticker, figi, timeframe);
    if (data && data.ok) {
      this.boundariesCache.set(key, data);
    }
    return data;
  }
}

export const marketDataService = new MarketDataService();

// services/cache.service.js - Client-Side IndexedDB Candle Caching Service
// Provides instantaneous offline/cached historical data loading and protects T-Bank API rate limits.

const DB_NAME = 'TradingSimulatorDB';
const DB_VERSION = 1;
const STORE_CANDLES = 'candles';
const STORE_META = 'series_meta';

class CacheService {
  constructor() {
    this.db = null;
    this.isSupported = typeof window !== 'undefined' && 'indexedDB' in window;
    this.initPromise = null;
  }

  async initDB() {
    if (!this.isSupported) return null;
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
          const db = e.target.result;

          // 1. Candles store: keyed by compound ID "${ticker}_${tf}_${time}"
          if (!db.objectStoreNames.contains(STORE_CANDLES)) {
            const candleStore = db.createObjectStore(STORE_CANDLES, { keyPath: 'id' });
            candleStore.createIndex('series_time', ['seriesKey', 'time'], { unique: true });
            candleStore.createIndex('seriesKey', 'seriesKey', { unique: false });
          }

          // 2. Metadata store: keyed by "seriesKey" ("${ticker}_${tf}")
          if (!db.objectStoreNames.contains(STORE_META)) {
            db.createObjectStore(STORE_META, { keyPath: 'seriesKey' });
          }
        };

        req.onsuccess = (e) => {
          this.db = e.target.result;
          resolve(this.db);
        };

        req.onerror = (e) => {
          console.warn('[CacheService] IndexedDB open error, proceeding with cache disabled:', e.target.error);
          resolve(null);
        };
      } catch (err) {
        console.warn('[CacheService] IndexedDB initialization failed:', err);
        resolve(null);
      }
    });

    return this.initPromise;
  }

  getSeriesKey(ticker, tf) {
    return `${(ticker || '').toUpperCase()}_${(tf || '').toLowerCase()}`;
  }

  // Save an array of candles into IndexedDB
  async saveCandles(ticker, tf, candles, extraMeta = {}) {
    if (!this.isSupported || !candles || candles.length === 0) return 0;
    const db = await this.initDB();
    if (!db) return 0;

    const seriesKey = this.getSeriesKey(ticker, tf);

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_CANDLES, STORE_META], 'readwrite');
        const candleStore = tx.objectStore(STORE_CANDLES);
        const metaStore = tx.objectStore(STORE_META);

        let savedCount = 0;
        let minTime = Infinity;
        let maxTime = -Infinity;

        for (const c of candles) {
          if (!c || !c.time) continue;
          if (c.time < minTime) minTime = c.time;
          if (c.time > maxTime) maxTime = c.time;

          const record = {
            id: `${seriesKey}_${c.time}`,
            seriesKey,
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume || 0
          };
          candleStore.put(record);
          savedCount++;
        }

        // Update metadata for this series
        const metaReq = metaStore.get(seriesKey);
        metaReq.onsuccess = () => {
          const prevMeta = metaReq.result || {};
          const updatedMeta = {
            seriesKey,
            ticker: ticker.toUpperCase(),
            tf: tf.toLowerCase(),
            earliestTime: Math.min(prevMeta.earliestTime || Infinity, minTime),
            latestTime: Math.max(prevMeta.latestTime || -Infinity, maxTime),
            totalCached: (prevMeta.totalCached || 0) + savedCount,
            lot: extraMeta.lot || prevMeta.lot || 10,
            source: extraMeta.source || prevMeta.source || 'cached',
            updatedAt: Date.now()
          };
          metaStore.put(updatedMeta);
        };

        tx.oncomplete = () => {
          resolve(savedCount);
        };

        tx.onerror = (err) => {
          console.warn('[CacheService] Transaction error saving candles:', err);
          resolve(0);
        };
      } catch (err) {
        console.warn('[CacheService] Error saving candles:', err);
        resolve(0);
      }
    });
  }

  // Get cached candles for a specific symbol and timeframe
  async getCachedCandles(ticker, tf, options = {}) {
    if (!this.isSupported) return [];
    const db = await this.initDB();
    if (!db) return [];

    const seriesKey = this.getSeriesKey(ticker, tf);
    const { fromTime = null, toTime = null, limit = null } = options;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_CANDLES], 'readonly');
        const candleStore = tx.objectStore(STORE_CANDLES);
        const index = candleStore.index('series_time');

        let keyRange = null;
        if (fromTime !== null && toTime !== null) {
          keyRange = IDBKeyRange.bound([seriesKey, fromTime], [seriesKey, toTime]);
        } else if (fromTime !== null) {
          keyRange = IDBKeyRange.lowerBound([seriesKey, fromTime]);
        } else if (toTime !== null) {
          keyRange = IDBKeyRange.bound([seriesKey, 0], [seriesKey, toTime]);
        } else {
          keyRange = IDBKeyRange.bound([seriesKey, 0], [seriesKey, Infinity]);
        }

        const results = [];
        const req = index.openCursor(keyRange, 'next');

        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const val = cursor.value;
            // Verify seriesKey match (compound range boundary check)
            if (val.seriesKey === seriesKey) {
              results.push({
                time: val.time,
                open: val.open,
                high: val.high,
                low: val.low,
                close: val.close,
                volume: val.volume
              });
              if (limit && results.length >= limit) {
                resolve(results);
                return;
              }
            }
            cursor.continue();
          } else {
            resolve(results);
          }
        };

        req.onerror = () => {
          resolve([]);
        };
      } catch (err) {
        console.warn('[CacheService] Error reading cached candles:', err);
        resolve([]);
      }
    });
  }

  // Get metadata (earliest, latest, count, lot) for a series
  async getSeriesMeta(ticker, tf) {
    if (!this.isSupported) return null;
    const db = await this.initDB();
    if (!db) return null;

    const seriesKey = this.getSeriesKey(ticker, tf);

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_META], 'readonly');
        const store = tx.objectStore(STORE_META);
        const req = store.get(seriesKey);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (err) {
        resolve(null);
      }
    });
  }

  // Clear cache for a specific series or all series
  async clearCache(ticker = null, tf = null) {
    if (!this.isSupported) return;
    const db = await this.initDB();
    if (!db) return;

    if (!ticker) {
      // Clear all
      const tx = db.transaction([STORE_CANDLES, STORE_META], 'readwrite');
      tx.objectStore(STORE_CANDLES).clear();
      tx.objectStore(STORE_META).clear();
      return new Promise(r => tx.oncomplete = r);
    }

    const seriesKey = this.getSeriesKey(ticker, tf);
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_CANDLES, STORE_META], 'readwrite');
      const candleStore = tx.objectStore(STORE_CANDLES);
      const index = candleStore.index('seriesKey');
      const req = index.openCursor(IDBKeyRange.only(seriesKey));

      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          tx.objectStore(STORE_META).delete(seriesKey);
          resolve();
        }
      };
      req.onerror = () => resolve();
    });
  }
}

export const cacheService = new CacheService();

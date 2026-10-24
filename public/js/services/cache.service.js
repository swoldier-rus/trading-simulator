// services/cache.service.js - Client-Side IndexedDB Candle Caching Service
// Provides instantaneous offline/cached historical data loading and protects T-Bank API rate limits.

const DB_NAME = 'TradingSimulatorDB';
const DB_VERSION = 2;
const STORE_CANDLES = 'candles';
const STORE_META = 'series_meta';
const STORE_SESSIONS = 'sessions';

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

          // 3. Sessions store: keyed by "id" (active_session or named saved sessions)
          if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
            const sessionStore = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
            sessionStore.createIndex('updatedAt', 'updatedAt', { unique: false });
            sessionStore.createIndex('symbol', 'symbol', { unique: false });
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

  // Save a simulation / trading session
  async saveSession(sessionData) {
    if (!this.isSupported || !sessionData) return null;
    const db = await this.initDB();
    if (!db) return null;

    const data = {
      ...sessionData,
      id: sessionData.id || 'active_session',
      updatedAt: Date.now()
    };

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_SESSIONS], 'readwrite');
        const store = tx.objectStore(STORE_SESSIONS);
        store.put(data);

        tx.oncomplete = () => resolve(data.id);
        tx.onerror = (err) => {
          console.warn('[CacheService] Error saving session to IndexedDB:', err);
          resolve(null);
        };
      } catch (err) {
        console.warn('[CacheService] Exception saving session to IndexedDB:', err);
        resolve(null);
      }
    });
  }

  // Get a simulation session by ID (default: 'active_session')
  async getSession(sessionId = 'active_session') {
    if (!this.isSupported) return null;
    const db = await this.initDB();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_SESSIONS], 'readonly');
        const store = tx.objectStore(STORE_SESSIONS);
        const req = store.get(sessionId);

        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (err) {
        console.warn('[CacheService] Error reading session from IndexedDB:', err);
        resolve(null);
      }
    });
  }

  // List all saved sessions (ordered by most recent)
  async listSessions() {
    if (!this.isSupported) return [];
    const db = await this.initDB();
    if (!db) return [];

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_SESSIONS], 'readonly');
        const store = tx.objectStore(STORE_SESSIONS);
        const req = store.getAll();

        req.onsuccess = () => {
          const list = req.result || [];
          const summaries = list.map(s => ({
            id: s.id,
            name: s.name || (s.id === 'active_session' ? 'Текущая сессия' : 'Сохраненная сессия'),
            symbol: s.symbol,
            timeframe: s.timeframe,
            chartType: s.chartType,
            updatedAt: s.updatedAt || s.savedAt,
            currentBarTime: s.replay?.currentBarTime,
            tradesCount: s.account?.tradeHistory?.length || s.tradesCount || 0,
            realizedPnL: s.account?.realizedPnL || s.realizedPnL || 0,
            initialDeposit: s.account?.initialDeposit || 100000,
            balance: s.account?.balance || 100000
          }));
          summaries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          resolve(summaries);
        };

        req.onerror = () => resolve([]);
      } catch (err) {
        resolve([]);
      }
    });
  }

  // Delete a saved session by ID
  async deleteSession(sessionId) {
    if (!this.isSupported || !sessionId) return false;
    const db = await this.initDB();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_SESSIONS], 'readwrite');
        const store = tx.objectStore(STORE_SESSIONS);
        store.delete(sessionId);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (err) {
        resolve(false);
      }
    });
  }

  // Get storage estimate (usage and quota)
  async getStorageEstimate() {
    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function') {
      try {
        const est = await navigator.storage.estimate();
        return {
          usageBytes: est.usage || 0,
          quotaBytes: est.quota || 0,
          usageMB: ((est.usage || 0) / (1024 * 1024)).toFixed(2),
          quotaMB: ((est.quota || 0) / (1024 * 1024)).toFixed(2),
          usagePercent: est.quota ? (((est.usage || 0) / est.quota) * 100).toFixed(2) : 0,
          isSupported: true
        };
      } catch (e) {
        return null;
      }
    }
    return null;
  }
}

export const cacheService = new CacheService();

// services/portfolio-data.service.js - Multi-Asset Market Data Service for Background Positions
import { marketDataService } from './market-data.service.js';
import { showToast, timeframeToSeconds } from '../core/utils.js';
import { API } from '../api.js';

export class PortfolioMarketDataService {
  constructor(store) {
    this.store = store;
    this.candlesBySymbol = new Map();
    this.instrumentsMap = new Map(); // symbol -> { figi, lot, name }
    this.inFlightRequests = new Map();
  }

  async init() {
    try {
      const res = await API.searchInstruments('');
      if (res && Array.isArray(res.instruments)) {
        res.instruments.forEach(inst => {
          this.instrumentsMap.set(inst.ticker, inst);
        });
      }
    } catch (e) {
      console.warn('[PortfolioMarketDataService] Could not pre-cache instruments:', e);
    }
  }

  getInstrumentInfo(symbol) {
    return this.instrumentsMap.get(symbol) || null;
  }

  // Ensure candles are in memory for a given background symbol
  async ensureSymbolData(symbol, timeframe = null, targetTimeSec = null) {
    if (!symbol) return null;
    const currentSymbol = this.store.get('currentSymbol');
    const tf = (timeframe || this.store.get('currentTimeframe') || '1h').toLowerCase();

    // If active symbol, use simulator candles if available
    if (symbol === currentSymbol && this.store.simulator && this.store.simulator.allCandles?.length > 0) {
      this.candlesBySymbol.set(symbol, this.store.simulator.allCandles);
      return this.store.simulator.allCandles;
    }

    const existing = this.candlesBySymbol.get(symbol);
    if (existing && existing.length > 0 && targetTimeSec) {
      const earliest = existing[0].time;
      const latest = existing[existing.length - 1].time;
      // If cached data covers targetTimeSec with buffer, reuse
      if (earliest <= targetTimeSec && latest >= targetTimeSec - 86400 * 2) {
        return existing;
      }
    }

    const reqKey = `${symbol}_${tf}_${targetTimeSec || ''}`;
    if (this.inFlightRequests.has(reqKey)) {
      return await this.inFlightRequests.get(reqKey);
    }

    const loadPromise = (async () => {
      try {
        const inst = this.getInstrumentInfo(symbol);
        const figi = inst ? inst.figi : '';
        const step = timeframeToSeconds(tf);
        const nowSec = Math.floor(Date.now() / 1000);
        let toSec = null;

        if (targetTimeSec) {
          const forwardSec = Math.max(350 * step, 7 * 86400);
          toSec = Math.min(nowSec, targetTimeSec + forwardSec);
        }

        const data = await marketDataService.getCandles(symbol, figi, tf, 1200, toSec);
        if (data && data.candles && data.candles.length > 0) {
          this.candlesBySymbol.set(symbol, data.candles);
          return data.candles;
        }
      } catch (err) {
        console.warn(`[PortfolioMarketDataService] Failed to load candles for ${symbol}:`, err);
      } finally {
        this.inFlightRequests.delete(reqKey);
      }
      return null;
    })();

    this.inFlightRequests.set(reqKey, loadPromise);
    return await loadPromise;
  }

  // Fast binary search to find the candle on or immediately before target timestamp
  getPriceAtTime(symbol, targetTimeSec) {
    if (!symbol || !targetTimeSec) return null;

    const currentSymbol = this.store.get('currentSymbol');
    if (symbol === currentSymbol) {
      const curBar = this.store.simulator ? this.store.simulator.getCurrentBar() : null;
      if (curBar) {
        return { price: curBar.close, time: curBar.time, candle: curBar };
      }
    }

    const candles = this.candlesBySymbol.get(symbol);
    if (!candles || candles.length === 0) {
      // Trigger background prefetch if not loaded yet
      this.ensureSymbolData(symbol, this.store.get('currentTimeframe'), targetTimeSec);
      return null;
    }

    let low = 0;
    let high = candles.length - 1;
    let best = null;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const c = candles[mid];
      if (c.time <= targetTimeSec) {
        best = c;
        low = mid + 1; // Try to find a later candle that is still <= targetTimeSec
      } else {
        high = mid - 1;
      }
    }

    if (!best) {
      // If targetTimeSec is before all candles, use the earliest candle
      best = candles[0];
    }

    return {
      price: best.close,
      time: best.time,
      candle: best
    };
  }

  // Preload candle data for all open positions and pending orders
  async preloadActiveSymbols(targetTimeSec = null) {
    const paper = this.store.paperAccount;
    if (!paper) return;

    const tf = this.store.get('currentTimeframe') || '1h';
    const symbols = new Set();

    for (const pos of paper.positions) {
      symbols.add(pos.symbol);
    }
    for (const ord of paper.orders) {
      symbols.add(ord.symbol);
    }

    const promises = [];
    for (const sym of symbols) {
      promises.push(this.ensureSymbolData(sym, tf, targetTimeSec));
    }
    await Promise.all(promises);
  }

  // Called on each simulation tick/bar step to synchronize all background positions
  updatePortfolio(currentTimeSec) {
    const paper = this.store.paperAccount;
    if (!paper || !currentTimeSec) return;

    const currentSymbol = this.store.get('currentSymbol');
    const bgSymbols = new Set();

    for (const pos of paper.positions) {
      if (pos.symbol !== currentSymbol) bgSymbols.add(pos.symbol);
    }
    for (const ord of paper.orders) {
      if (ord.symbol !== currentSymbol) bgSymbols.add(ord.symbol);
    }

    if (bgSymbols.size === 0) return;

    const tf = this.store.get('currentTimeframe') || '1h';

    for (const sym of bgSymbols) {
      if (!this.candlesBySymbol.has(sym)) {
        this.ensureSymbolData(sym, tf, currentTimeSec);
      }

      const tick = this.getPriceAtTime(sym, currentTimeSec);
      if (tick) {
        const events = paper.onPriceTick(tick.price, currentTimeSec, sym, tick.candle);
        if (events && events.length > 0) {
          events.forEach(ev => {
            showToast(ev.message, ev.type === 'ORDER_FILLED' ? 'info' : 'success');
          });
        }
      }
    }
  }
}

// core/store.js - Central Application State Store
import { eventBus } from './event-bus.js';

const PERSISTED_KEYS = [
  'currentSymbol',
  'currentFigi',
  'currentLotSize',
  'currentTimeframe',
  'currentChartType',
  'isMagnetActive',
  'showExecutionsOnChart'
];

const STORAGE_KEY = 'trading_simulator_saved_state';

class AppStore {
  constructor() {
    this.state = {
      currentSymbol: 'SBER',
      currentFigi: '',
      currentLotSize: 10,
      currentTimeframe: '1h',
      currentChartType: 'candlestick',
      isMagnetActive: false,
      showExecutionsOnChart: true,
      currentPrice: 0,
      currentSelectedSide: 'BUY',
      selectedOrderType: 'MARKET',
      menuTargetPrice: null,
      menuLots: 1,
      isSelectingJumpBar: false,
      isMenuOpen: false
    };

    this.loadPersistedState();

    // Shared Singletons / Controllers
    this.chart = null;
    this.mainSeries = null;
    this.volumeSeries = null;
    this.drawingController = null;
    this.paperAccount = null;
    this.simulator = null;
    this.indicatorManager = null;
  }

  loadPersistedState() {
    try {
      const savedRaw = localStorage.getItem(STORAGE_KEY);
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        for (const key of PERSISTED_KEYS) {
          if (saved[key] !== undefined && saved[key] !== null) {
            this.state[key] = saved[key];
          }
        }
      }
    } catch (e) {
      console.warn('[AppStore] Failed to load persisted state:', e);
    }
  }

  savePersistedState() {
    try {
      const toSave = {};
      for (const key of PERSISTED_KEYS) {
        toSave[key] = this.state[key];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.warn('[AppStore] Failed to save state:', e);
    }
  }

  get(key) {
    return this.state[key];
  }

  set(key, value) {
    const prev = this.state[key];
    if (prev !== value) {
      this.state[key] = value;
      if (PERSISTED_KEYS.includes(key)) {
        this.savePersistedState();
      }
      eventBus.emit(`state:${key}`, value, prev);
      eventBus.emit('state:change', key, value, prev);
    }
  }

  setMultiple(obj) {
    let shouldSave = false;
    for (const [k, v] of Object.entries(obj)) {
      const prev = this.state[k];
      if (prev !== v) {
        this.state[k] = v;
        if (PERSISTED_KEYS.includes(k)) {
          shouldSave = true;
        }
        eventBus.emit(`state:${k}`, v, prev);
        eventBus.emit('state:change', k, v, prev);
      }
    }
    if (shouldSave) {
      this.savePersistedState();
    }
  }
}

export const store = new AppStore();

// core/store.js - Central Application State Store
import { eventBus } from './event-bus.js';
import { appStateMachine } from './state-machine.js';

const PERSISTED_KEYS = [
  'currentSymbol',
  'currentFigi',
  'currentLotSize',
  'currentTimeframe',
  'currentChartType',
  'isMagnetActive',
  'showExecutionsOnChart',
  'showSessionBreaks',
  'sessionBreaksConfig',
  'chartAppearanceConfig'
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
      showSessionBreaks: true,
      sessionBreaksConfig: {
        enabled: true,
        color: 'rgba(255, 255, 255, 0.2)',
        width: 1,
        style: 'dashed'
      },
      chartAppearanceConfig: {
        background: {
          type: 'solid',
          color: '#131722',
          gradientColor1: '#1e222d',
          gradientColor2: '#131722'
        },
        grid: {
          vertLines: true,
          vertColor: '#1e222d',
          vertStyle: 'solid',
          horzLines: true,
          horzColor: '#1e222d',
          horzStyle: 'solid'
        }
      },
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
    this.sessionService = null;
    this.rightRail = null;
    this.fsm = appStateMachine;
    this.fsm.init(this);
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

      const dedicatedAppRaw = localStorage.getItem('trading_simulator_chart_appearance');
      if (dedicatedAppRaw) {
        try {
          const dedicatedApp = JSON.parse(dedicatedAppRaw);
          this.state.chartAppearanceConfig = {
            ...this.state.chartAppearanceConfig,
            ...dedicatedApp,
            background: { ...this.state.chartAppearanceConfig.background, ...(dedicatedApp.background || {}) },
            grid: { ...this.state.chartAppearanceConfig.grid, ...(dedicatedApp.grid || {}) }
          };
        } catch (e) {}
      } else if (this.state.chartAppearanceConfig) {
        this.state.chartAppearanceConfig = {
          background: {
            type: 'solid',
            color: '#131722',
            gradientColor1: '#1e222d',
            gradientColor2: '#131722',
            ...(this.state.chartAppearanceConfig.background || {})
          },
          grid: {
            vertLines: true,
            vertColor: '#1e222d',
            vertStyle: 'solid',
            horzLines: true,
            horzColor: '#1e222d',
            horzStyle: 'solid',
            ...(this.state.chartAppearanceConfig.grid || {})
          }
        };
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

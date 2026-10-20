// core/store.js - Central Application State Store
import { eventBus } from './event-bus.js';

class AppStore {
  constructor() {
    this.state = {
      currentSymbol: 'SBER',
      currentFigi: '',
      currentLotSize: 10,
      currentTimeframe: '1h',
      currentChartType: 'candlestick',
      currentPrice: 0,
      currentSelectedSide: 'BUY',
      selectedOrderType: 'MARKET',
      menuTargetPrice: null,
      menuLots: 1,
      isSelectingJumpBar: false,
      isMenuOpen: false
    };

    // Shared Singletons / Controllers
    this.chart = null;
    this.mainSeries = null;
    this.volumeSeries = null;
    this.drawingController = null;
    this.paperAccount = null;
    this.simulator = null;
    this.indicatorManager = null;
  }

  get(key) {
    return this.state[key];
  }

  set(key, value) {
    const prev = this.state[key];
    if (prev !== value) {
      this.state[key] = value;
      eventBus.emit(`state:${key}`, value, prev);
      eventBus.emit('state:change', key, value, prev);
    }
  }

  setMultiple(obj) {
    for (const [k, v] of Object.entries(obj)) {
      this.set(k, v);
    }
  }
}

export const store = new AppStore();

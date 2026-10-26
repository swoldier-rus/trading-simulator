// components/multi-chart.js - Multi-Chart Grid Layout & Slot Controller with Sync Engine
import { eventBus } from '../core/event-bus.js';
import { marketDataService } from '../services/market-data.service.js';

export class ChartSlot {
  constructor(options) {
    this.id = options.id; // 1, 2, 3
    this.manager = options.manager;
    this.store = options.store;
    this.symbol = options.symbol || this.store.get('currentSymbol') || 'SBER';
    this.figi = options.figi || this.store.get('currentFigi') || '';
    this.timeframe = options.timeframe || '1d';

    this.chart = null;
    this.mainSeries = null;
    this.slotEl = null;
    this.bodyEl = null;
    this.badgeEl = null;
    this.tfDropdownEl = null;
    this.resizeObserver = null;
    this.isMaximized = false;
    this.candlesCount = 0;

    this.createDom();
  }

  createDom() {
    const slot = document.createElement('div');
    slot.className = 'chart-slot';
    slot.id = `chartSlot${this.id}`;
    slot.setAttribute('data-slot-id', String(this.id));

    slot.innerHTML = `
      <div class="chart-slot-header">
        <div class="chart-slot-badge" title="Сменить таймфрейм для этого окна">
          <span class="badge-symbol">${this.symbol}</span>
          <span>•</span>
          <span class="badge-tf">${this.formatTfLabel(this.timeframe)}</span>
          <div class="slot-tf-dropdown">
            <div class="slot-tf-item ${this.timeframe === '1m' ? 'active' : ''}" data-tf="1m">1м</div>
            <div class="slot-tf-item ${this.timeframe === '5m' ? 'active' : ''}" data-tf="5m">5м</div>
            <div class="slot-tf-item ${this.timeframe === '15m' ? 'active' : ''}" data-tf="15m">15м</div>
            <div class="slot-tf-item ${this.timeframe === '1h' ? 'active' : ''}" data-tf="1h">1ч</div>
            <div class="slot-tf-item ${this.timeframe === '4h' ? 'active' : ''}" data-tf="4h">4ч</div>
            <div class="slot-tf-item ${this.timeframe === '1d' ? 'active' : ''}" data-tf="1d">1Д</div>
            <div class="slot-tf-item ${this.timeframe === '1w' ? 'active' : ''}" data-tf="1w">1Н</div>
          </div>
        </div>
        <button class="chart-slot-btn btn-slot-maximize" title="Развернуть/восстановить окно">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
          </svg>
        </button>
      </div>
      <div class="chart-slot-body" id="chartSlotBody${this.id}"></div>
    `;

    this.slotEl = slot;
    this.bodyEl = slot.querySelector(`#chartSlotBody${this.id}`);
    this.badgeEl = slot.querySelector('.chart-slot-badge');
    this.tfDropdownEl = slot.querySelector('.slot-tf-dropdown');

    // Click to focus slot
    slot.addEventListener('mousedown', () => {
      this.manager.setActiveSlot(this.id);
    });

    // Timeframe selector dropdown
    if (this.badgeEl && this.tfDropdownEl) {
      this.badgeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.manager.setActiveSlot(this.id);
        this.tfDropdownEl.classList.toggle('show');
      });

      this.tfDropdownEl.querySelectorAll('.slot-tf-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const newTf = item.getAttribute('data-tf');
          this.setTimeframe(newTf);
          this.tfDropdownEl.classList.remove('show');
        });
      });
    }

    // Maximize button
    const btnMax = slot.querySelector('.btn-slot-maximize');
    if (btnMax) {
      btnMax.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleMaximize();
      });
    }

    document.addEventListener('click', (e) => {
      if (this.tfDropdownEl && !this.badgeEl.contains(e.target)) {
        this.tfDropdownEl.classList.remove('show');
      }
    });
  }

  mount(containerEl) {
    if (!containerEl || !this.slotEl) return;
    containerEl.appendChild(this.slotEl);
    this.initChart();
    this.loadData();
  }

  initChart() {
    if (!window.OpenAlgoCharts || !this.bodyEl) return;

    const appearanceConfig = this.store.get('chartAppearanceConfig');
    let initialBg = appearanceConfig?.background?.color || '#131722';
    let initialGrid = appearanceConfig?.grid?.vertColor || '#1e222d';

    const chartTheme = {
      ...OpenAlgoCharts.darkTheme,
      background: initialBg,
      grid: initialGrid,
      axisText: '#787b86',
      axisLine: '#2a2e39',
      paneSeparator: '#2a2e39',
      crosshair: '#787b86',
      crosshairLabelBackground: '#2962ff',
      upColor: '#089981',
      downColor: '#f23645',
      wickUpColor: '#089981',
      wickDownColor: '#f23645',
      borderUpColor: '#089981',
      borderDownColor: '#f23645'
    };

    this.chart = OpenAlgoCharts.createChart(this.bodyEl, {
      theme: chartTheme,
      timezone: 'Europe/Moscow',
      watermark: false,
      branding: false,
      axisChrome: { sessionClock: false, barCountdown: false },
      doubleClick: 'none'
    });

    this.mainSeries = this.chart.addSeries('candlestick', {
      upColor: '#089981',
      downColor: '#f23645',
      borderUpColor: '#089981',
      borderDownColor: '#f23645',
      wickUpColor: '#089981',
      wickDownColor: '#f23645'
    });

    // Register with LinkGroup for crosshair & viewport synchronization
    if (this.manager.linkGroup && this.chart) {
      this.manager.linkGroup.add(this.chart);
    }

    // Auto-resize observer
    const handleResize = () => {
      if (this.chart && this.bodyEl) {
        const w = this.bodyEl.clientWidth;
        const h = this.bodyEl.clientHeight;
        if (w > 0 && h > 0) {
          this.chart.applySize(w, h);
        }
      }
    };

    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => handleResize());
      this.resizeObserver.observe(this.bodyEl);
    }

    setTimeout(() => {
      handleResize();
    }, 60);
  }

  async loadData() {
    if (!this.mainSeries) return;
    try {
      const res = await marketDataService.getCandles(this.symbol, this.figi, this.timeframe, 1200, null, null, { silent: true });
      if (res && res.candles && res.candles.length > 0) {
        this.candlesCount = res.candles.length;
        this.mainSeries.setData(res.candles);
        if (this.chart) {
          this.chart.fitContent();
        }
      }
    } catch (err) {
      console.warn(`[ChartSlot ${this.id}] Failed to load candles:`, err);
    }
  }

  setSymbol(symbol, figi = '') {
    this.symbol = symbol;
    this.figi = figi;
    this.updateBadge();
    this.loadData();
  }

  setTimeframe(newTf) {
    if (!newTf || newTf === this.timeframe) return;
    this.timeframe = newTf;
    this.updateBadge();
    this.loadData();
    if (this.manager.activeSlotId === this.id) {
      eventBus.emit('toolbar:sync_timeframe', newTf);
    }
  }

  updateBadge() {
    if (!this.badgeEl) return;
    const symEl = this.badgeEl.querySelector('.badge-symbol');
    const tfEl = this.badgeEl.querySelector('.badge-tf');
    if (symEl) symEl.textContent = this.symbol;
    if (tfEl) tfEl.textContent = this.formatTfLabel(this.timeframe);

    if (this.tfDropdownEl) {
      this.tfDropdownEl.querySelectorAll('.slot-tf-item').forEach(item => {
        const tf = item.getAttribute('data-tf');
        item.classList.toggle('active', tf === this.timeframe);
      });
    }
  }

  formatTfLabel(tf) {
    const map = {
      '1m': '1м',
      '5m': '5м',
      '15m': '15м',
      '1h': '1ч',
      '4h': '4ч',
      '1d': '1Д',
      '1w': '1Н'
    };
    return map[tf?.toLowerCase()] || (tf || '').toUpperCase();
  }

  toggleMaximize() {
    this.isMaximized = !this.isMaximized;
    this.slotEl.classList.toggle('maximized', this.isMaximized);
    if (this.chart && this.bodyEl) {
      setTimeout(() => {
        this.chart.applySize(this.bodyEl.clientWidth, this.bodyEl.clientHeight);
      }, 50);
    }
  }

  destroy() {
    if (this.manager.linkGroup && this.chart) {
      try {
        this.manager.linkGroup.remove(this.chart);
      } catch (e) {}
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.chart && typeof this.chart.destroy === 'function') {
      try {
        this.chart.destroy();
      } catch (e) {}
    }
    if (this.slotEl && this.slotEl.parentNode) {
      this.slotEl.parentNode.removeChild(this.slotEl);
    }
    this.chart = null;
    this.mainSeries = null;
  }
}

export class MultiChartLayoutManager {
  constructor(store) {
    this.store = store;
    this.currentLayout = '1x1';
    this.activeSlotId = 0;
    this.slots = new Map(); // id -> ChartSlot
    this.wrapperEl = null;

    // Layout dropdown elements
    this.btnLayoutPicker = null;
    this.dropdownEl = null;

    // Sync preferences (defaults: crosshair=true, symbol=true, time=false)
    this.syncCrosshair = localStorage.getItem('trading_simulator_sync_crosshair') !== 'false';
    this.syncSymbol = localStorage.getItem('trading_simulator_sync_symbol') !== 'false';
    this.syncTime = localStorage.getItem('trading_simulator_sync_time') === 'true';

    this.linkGroup = null;

    this.init();
  }

  init() {
    this.wrapperEl = document.getElementById('chartGridWrapper');
    this.btnLayoutPicker = document.getElementById('btnLayoutPicker');
    this.dropdownEl = document.getElementById('layoutPickerDropdown');

    // Initialize OpenAlgoCharts LinkGroup for cross-chart sync
    if (window.OpenAlgoCharts && typeof window.OpenAlgoCharts.createLinkGroup === 'function') {
      this.linkGroup = window.OpenAlgoCharts.createLinkGroup({
        crosshair: this.syncCrosshair,
        viewport: this.syncTime,
        whenMissing: 'nearest'
      });
      if (this.store.chart) {
        this.linkGroup.add(this.store.chart);
      }
    }

    this.initDropdown();
    this.bindEvents();

    // Check saved layout preset in localStorage
    const savedLayout = localStorage.getItem('trading_simulator_layout_preset');
    if (savedLayout && savedLayout !== '1x1') {
      setTimeout(() => {
        this.setLayout(savedLayout);
      }, 300);
    }
  }

  initDropdown() {
    if (!this.btnLayoutPicker || !this.dropdownEl) return;

    this.btnLayoutPicker.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = this.dropdownEl.style.display !== 'none';
      this.dropdownEl.style.display = isVisible ? 'none' : 'flex';
    });

    document.addEventListener('click', (e) => {
      if (this.dropdownEl && !this.btnLayoutPicker.contains(e.target) && !this.dropdownEl.contains(e.target)) {
        this.dropdownEl.style.display = 'none';
      }
    });

    // Layout preset tiles
    const tiles = this.dropdownEl.querySelectorAll('.layout-option-tile');
    tiles.forEach(tile => {
      tile.addEventListener('click', () => {
        const layout = tile.getAttribute('data-layout');
        this.setLayout(layout);
        this.dropdownEl.style.display = 'none';
      });
    });

    // Sync Toggles (Crosshair, Symbol, Time)
    const cbCrosshair = document.getElementById('syncCrosshairCheckbox');
    const cbSymbol = document.getElementById('syncSymbolCheckbox');
    const cbTime = document.getElementById('syncTimeCheckbox');

    if (cbCrosshair) {
      cbCrosshair.checked = this.syncCrosshair;
      cbCrosshair.addEventListener('change', () => {
        this.syncCrosshair = cbCrosshair.checked;
        localStorage.setItem('trading_simulator_sync_crosshair', String(this.syncCrosshair));
        if (this.linkGroup) {
          this.linkGroup.setOptions({ crosshair: this.syncCrosshair });
        }
      });
    }

    if (cbSymbol) {
      cbSymbol.checked = this.syncSymbol;
      cbSymbol.addEventListener('change', () => {
        this.syncSymbol = cbSymbol.checked;
        localStorage.setItem('trading_simulator_sync_symbol', String(this.syncSymbol));
      });
    }

    if (cbTime) {
      cbTime.checked = this.syncTime;
      cbTime.addEventListener('change', () => {
        this.syncTime = cbTime.checked;
        localStorage.setItem('trading_simulator_sync_time', String(this.syncTime));
        if (this.linkGroup) {
          this.linkGroup.setOptions({ viewport: this.syncTime });
        }
      });
    }
  }

  bindEvents() {
    // When slot 0 is clicked
    const slot0 = document.getElementById('chartSlot0');
    if (slot0) {
      slot0.addEventListener('mousedown', () => {
        this.setActiveSlot(0);
      });

      // Maximize button on slot 0
      const btnMax0 = slot0.querySelector('.btn-slot-maximize');
      if (btnMax0) {
        btnMax0.addEventListener('click', (e) => {
          e.stopPropagation();
          const isMax = slot0.classList.toggle('maximized');
          if (this.store.chart && this.store.chartController) {
            setTimeout(() => {
              const el = document.getElementById('chart');
              if (el) this.store.chart.applySize(el.clientWidth, el.clientHeight);
            }, 50);
          }
        });
      }
    }

    // When timeframe changes from top toolbar
    eventBus.on('timeframe:change', ({ newTf }) => {
      if (this.activeSlotId > 0) {
        const slot = this.slots.get(this.activeSlotId);
        if (slot) {
          slot.setTimeframe(newTf);
        }
      }
    });

    // When symbol changes
    eventBus.on('symbol:change', ({ ticker } = {}) => {
      if (!ticker) return;
      const figi = this.store.get('currentFigi') || '';
      if (this.syncSymbol) {
        // Sync symbol across ALL secondary slots (each keeping their own timeframe)
        for (const slot of this.slots.values()) {
          slot.setSymbol(ticker, figi);
        }
      } else {
        // Symbol sync disabled: only update the active secondary slot
        if (this.activeSlotId > 0) {
          const slot = this.slots.get(this.activeSlotId);
          if (slot) {
            slot.setSymbol(ticker, figi);
          }
        }
      }
    });
  }

  setLayout(layoutPreset) {
    if (!this.wrapperEl) return;
    this.currentLayout = layoutPreset;
    localStorage.setItem('trading_simulator_layout_preset', layoutPreset);

    // Update wrapper class
    this.wrapperEl.className = `chart-grid-wrapper layout-${layoutPreset}`;

    // Update active tile in dropdown
    if (this.dropdownEl) {
      this.dropdownEl.querySelectorAll('.layout-option-tile').forEach(tile => {
        const l = tile.getAttribute('data-layout');
        tile.classList.toggle('active', l === layoutPreset);
      });
    }

    // Ensure slot 0 is in linkGroup
    if (this.linkGroup && this.store.chart && !this.linkGroup.has(this.store.chart)) {
      this.linkGroup.add(this.store.chart);
    }

    const requiredSlots = this.getRequiredSlotCount(layoutPreset);
    this.syncSlots(requiredSlots);

    // If active slot was closed, switch focus to slot 0
    if (this.activeSlotId >= requiredSlots) {
      this.setActiveSlot(0);
    }

    // Trigger resize on all charts
    setTimeout(() => {
      const chartEl = document.getElementById('chart');
      if (chartEl && this.store.chart) {
        this.store.chart.applySize(chartEl.clientWidth, chartEl.clientHeight);
      }
      for (const slot of this.slots.values()) {
        if (slot.chart && slot.bodyEl) {
          slot.chart.applySize(slot.bodyEl.clientWidth, slot.bodyEl.clientHeight);
          slot.chart.fitContent();
        }
      }
    }, 80);
  }

  getRequiredSlotCount(preset) {
    switch (preset) {
      case '1x2':
      case '2x1':
        return 2;
      case '2x2':
        return 4;
      case '1x1':
      default:
        return 1;
    }
  }

  syncSlots(requiredCount) {
    // Current total slots count: 1 (Slot 0) + secondary slots
    const currentTf = this.store.get('currentTimeframe') || '1h';
    const currentSymbol = this.store.get('currentSymbol') || 'SBER';
    const currentFigi = this.store.get('currentFigi') || '';

    const defaultTfs = ['1h', '1d', '15m', '4h'];

    // Add missing slots
    for (let id = 1; id < requiredCount; id++) {
      if (!this.slots.has(id)) {
        const tf = defaultTfs[id % defaultTfs.length] !== currentTf
          ? defaultTfs[id % defaultTfs.length]
          : '1d';

        const slot = new ChartSlot({
          id,
          manager: this,
          store: this.store,
          symbol: currentSymbol,
          figi: currentFigi,
          timeframe: tf
        });

        this.slots.set(id, slot);
        slot.mount(this.wrapperEl);
      }
    }

    // Remove excess slots
    for (const [id, slot] of this.slots.entries()) {
      if (id >= requiredCount) {
        slot.destroy();
        this.slots.delete(id);
      }
    }
  }

  setActiveSlot(slotId) {
    this.activeSlotId = slotId;

    // Update active highlight classes
    const allSlotEls = this.wrapperEl.querySelectorAll('.chart-slot');
    allSlotEls.forEach(slotEl => {
      const id = Number(slotEl.getAttribute('data-slot-id'));
      slotEl.classList.toggle('active', id === slotId);
    });

    if (slotId === 0) {
      // Focus Slot 0 (primary chart)
      const primaryTf = this.store.get('currentTimeframe') || '1h';
      eventBus.emit('toolbar:sync_timeframe', primaryTf);
    } else {
      // Focus Secondary Slot
      const slot = this.slots.get(slotId);
      if (slot) {
        eventBus.emit('toolbar:sync_timeframe', slot.timeframe);
      }
    }
  }
}

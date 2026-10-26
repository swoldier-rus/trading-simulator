// components/multi-chart.js - Multi-Chart Grid Layout & Slot Controller with MTF Replay, Sync Engine & Drawings Sync
import { eventBus } from '../core/event-bus.js';
import { marketDataService } from '../services/market-data.service.js';
import { binarySearchCandleFloorIndex, timeframeToSeconds, showToast } from '../core/utils.js';

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
    this.drawingController = null;
    this.slotEl = null;
    this.bodyEl = null;
    this.badgeEl = null;
    this.tfDropdownEl = null;
    this.resizeObserver = null;
    this.isMaximized = false;
    this.candlesCount = 0;

    // MTF Replay Data Caches
    this.allCandles = [];
    this.currentVisibleCandles = [];

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
          <span class="badge-replay-tag">Replay</span>
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

    // Initialize DrawingController for secondary chart slot
    if (window.OpenAlgoCharts?.draw?.DrawingController) {
      this.drawingController = new window.OpenAlgoCharts.draw.DrawingController(this.chart, {
        tool: null,
        magnet: 'weak'
      });

      // Hook drawing finish
      const origFinish = this.drawingController.finish;
      const store = this.store;
      this.drawingController.finish = function(source = 'dblclick') {
        store._lastToolFinishTime = Date.now();
        const res = origFinish.call(this);
        if (store.fsm) {
          store.fsm.finishDrawing();
        }
        eventBus.emit('drawings:change');
        return res;
      };

      // Auto-save drawings on any change
      ['drawing:change', 'draw:add', 'draw:update', 'draw:remove'].forEach(evt => {
        if (typeof this.chart.on === 'function') {
          this.chart.on(evt, () => {
            eventBus.emit('drawings:change');
          });
        }
      });

      // Register with DrawingLinkGroup for drawings cross-chart synchronization
      if (this.manager.drawingLinkGroup) {
        this.manager.drawingLinkGroup.add(
          this.chart,
          this.drawingController,
          () => ({ symbol: this.symbol, exchange: 'MOEX' })
        );
        // Propagate existing drawings from primary chart to this new slot
        setTimeout(() => {
          this.manager.shareAllDrawings();
        }, 60);
      }
    }

    // Allow clicking on secondary charts to choose Jump to Bar start point
    this.chart.subscribeClick((param) => {
      const isSelecting = this.store.fsm ? this.store.fsm.isSelectingJumpBar() : this.store.get('isSelectingJumpBar');
      if (isSelecting) {
        let targetTime = null;
        if (param && typeof param.time === 'number') {
          targetTime = param.time;
        } else if (param?.point?.x !== undefined && typeof this.chart.coordinateToTime === 'function') {
          targetTime = this.chart.coordinateToTime(param.point.x);
        }
        if (targetTime) {
          if (this.store.fsm) {
            this.store.fsm.completeJumpSelection(targetTime);
          } else {
            this.store.set('isSelectingJumpBar', false);
            const btnReplayStartPoint = document.getElementById('btnReplayStartPoint');
            if (btnReplayStartPoint) btnReplayStartPoint.classList.remove('active');
          }
          const sim = this.store.simulator;
          if (sim) {
            sim.jumpToBar(targetTime);
            eventBus.emit('chart:reset_state_preserving_zoom', 12);
            eventBus.emit('replay:scrubbed');
            if (this.store.sessionService) {
              this.store.sessionService.resetSession({ newTime: targetTime });
            }
          }
          const cur = sim ? sim.getCurrentBar() : null;
          const timeFormatted = cur ? new Date(cur.time * 1000).toLocaleString('ru-RU') : '';
          showToast(`Точка симуляции установлена: ${timeFormatted}! Торговый счет сброшен.`, 'success');
        }
      }
    });

    // History loader for backwards infinite scrolling on secondary charts
    if (typeof this.chart.setHistoryLoader === 'function') {
      this.chart.setHistoryLoader(async () => {
        if (!this.allCandles || this.allCandles.length === 0) {
          this.chart.historyLoadComplete();
          return;
        }
        const oldest = this.allCandles[0];
        try {
          const res = await marketDataService.getCandles(
            this.symbol,
            this.figi,
            this.timeframe,
            300,
            oldest.time - 1,
            null,
            { silent: true }
          );
          if (res && res.candles && res.candles.length > 0) {
            const fresh = res.candles.filter(b => b.time < oldest.time);
            if (fresh.length > 0) {
              this.allCandles = [...fresh, ...this.allCandles];
              if (this.manager.isReplayActive()) {
                this.syncToReplayTime(this.manager.getCurrentSimulationTime(), null, false);
              } else {
                this.currentVisibleCandles = [...this.allCandles];
                this.mainSeries.setData(this.allCandles);
              }
            }
          }
        } catch (e) {
          console.warn(`[ChartSlot ${this.id}] History loader error:`, e);
        } finally {
          this.chart.historyLoadComplete();
        }
      });
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
        this.allCandles = res.candles;
        this.candlesCount = res.candles.length;

        // If Replay is currently active, slice immediately to simulation time without showing the future
        if (this.manager.isReplayActive()) {
          this.slotEl.classList.add('in-replay');
          const simTime = this.manager.getCurrentSimulationTime();
          if (simTime) {
            this.syncToReplayTime(simTime, null, false);
          } else {
            this.currentVisibleCandles = [...this.allCandles];
            this.mainSeries.setData(this.allCandles);
          }
        } else {
          this.slotEl.classList.remove('in-replay');
          this.currentVisibleCandles = [...this.allCandles];
          this.mainSeries.setData(this.allCandles);
          if (this.chart) {
            this.chart.fitContent();
          }
        }
      }
    } catch (err) {
      console.warn(`[ChartSlot ${this.id}] Failed to load candles:`, err);
    }
  }

  // MTF Replay Synchronizer: Slices history and synthesizes forming bar without lookahead bias
  syncToReplayTime(simTime, currentTickPrice = null, isIncremental = false) {
    if (!this.mainSeries || !this.allCandles || this.allCandles.length === 0) return;
    if (!simTime) return;

    this.slotEl.classList.add('in-replay');

    const tfSlot = (this.timeframe || '1d').toLowerCase();
    const tfSim = (this.store.get('currentTimeframe') || '1h').toLowerCase();
    const stepSlot = timeframeToSeconds(tfSlot);
    const stepSim = timeframeToSeconds(tfSim);

    // HIGHER TIMEFRAME (e.g. Slot is 1D / 4H, Sim is 15M / 1H)
    if (stepSlot > stepSim) {
      const floorIdx = binarySearchCandleFloorIndex(this.allCandles, simTime);
      if (floorIdx < 0) {
        this._applyVisibleCandles([], isIncremental);
        return;
      }

      const targetCandle = this.allCandles[floorIdx];
      const completedCandles = this.allCandles.slice(0, floorIdx);

      // Check if targetCandle is in-progress / forming at simTime
      const isForming = simTime >= targetCandle.time && simTime < targetCandle.time + stepSlot;

      let newVisible;
      if (isForming) {
        // Synthesize forming bar from fine-grained simulator candles without lookahead bias
        const isSameSymbol = (this.symbol || '').toUpperCase() === (this.store.get('currentSymbol') || '').toUpperCase();
        let formingBar;

        if (isSameSymbol && this.store.simulator) {
          const simCandles = this.store.simulator.getVisibleCandles();
          const subBars = simCandles.filter(b => b.time >= targetCandle.time && b.time <= simTime);

          if (subBars.length > 0) {
            const open = subBars[0].open;
            let high = subBars[0].high;
            let low = subBars[0].low;
            let volume = 0;
            for (let i = 0; i < subBars.length; i++) {
              const b = subBars[i];
              if (b.high > high) high = b.high;
              if (b.low < low) low = b.low;
              volume += (b.volume || 0);
            }
            let close = currentTickPrice !== null ? currentTickPrice : subBars[subBars.length - 1].close;
            if (close > high) high = close;
            if (close < low) low = close;

            formingBar = {
              time: targetCandle.time,
              open,
              high,
              low,
              close,
              volume
            };
          } else {
            const price = currentTickPrice !== null ? currentTickPrice : targetCandle.open;
            formingBar = {
              time: targetCandle.time,
              open: targetCandle.open,
              high: Math.max(targetCandle.open, price),
              low: Math.min(targetCandle.open, price),
              close: price,
              volume: 0
            };
          }
        } else {
          // Different symbol or independent ticker
          const price = currentTickPrice !== null ? currentTickPrice : targetCandle.open;
          formingBar = {
            time: targetCandle.time,
            open: targetCandle.open,
            high: Math.max(targetCandle.open, price),
            low: Math.min(targetCandle.open, price),
            close: price,
            volume: 0
          };
        }
        newVisible = [...completedCandles, formingBar];
      } else {
        // targetCandle is fully completed
        newVisible = this.allCandles.slice(0, floorIdx + 1);
      }

      this._applyVisibleCandles(newVisible, isIncremental);
    } else {
      // EQUAL OR LOWER TIMEFRAME (e.g. Slot is 15M / 1H, Sim is 1H / 1D)
      const floorIdx = binarySearchCandleFloorIndex(this.allCandles, simTime);
      if (floorIdx < 0) {
        this._applyVisibleCandles([], isIncremental);
        return;
      }

      const newVisible = this.allCandles.slice(0, floorIdx + 1);

      if (currentTickPrice !== null && newVisible.length > 0) {
        const last = newVisible[newVisible.length - 1];
        if (last.time === simTime) {
          const updatedLast = {
            ...last,
            close: currentTickPrice,
            high: Math.max(last.high, currentTickPrice),
            low: Math.min(last.low, currentTickPrice)
          };
          newVisible[newVisible.length - 1] = updatedLast;
        }
      }

      this._applyVisibleCandles(newVisible, isIncremental);
    }
  }

  // Optimized GPU series update for 60 FPS playback
  _applyVisibleCandles(newVisible, isIncremental) {
    if (!newVisible || newVisible.length === 0) {
      this.currentVisibleCandles = [];
      if (this.mainSeries) this.mainSeries.setData([]);
      return;
    }

    const prevLen = this.currentVisibleCandles.length;
    const newLen = newVisible.length;

    if (isIncremental && prevLen > 0) {
      const lastBar = newVisible[newLen - 1];
      if (newLen === prevLen) {
        // In-place update of current forming candle
        this.currentVisibleCandles[prevLen - 1] = lastBar;
        try {
          this.mainSeries.update(lastBar);
          return;
        } catch (e) {}
      } else if (newLen === prevLen + 1) {
        // Append newly opened bar
        this.currentVisibleCandles.push(lastBar);
        try {
          this.mainSeries.update(lastBar);
          return;
        } catch (e) {}
      }
    }

    // Full series replacement (jump, scrub, step backward, or initial cut)
    this.currentVisibleCandles = newVisible;
    if (this.mainSeries) {
      this.mainSeries.setData(newVisible);
    }
  }

  // Restore full dataset on replay exit
  restoreFullData() {
    this.slotEl.classList.remove('in-replay');
    if (this.mainSeries && this.allCandles && this.allCandles.length > 0) {
      this.currentVisibleCandles = [...this.allCandles];
      this.mainSeries.setData(this.allCandles);
    }
  }

  setSymbol(symbol, figi = '') {
    this.symbol = symbol;
    this.figi = figi;
    this.updateBadge();
    this.loadData();
    if (this.manager.drawingLinkGroup && this.chart) {
      this.manager.drawingLinkGroup.setContext(this.chart, { symbol: this.symbol, exchange: 'MOEX' });
    }
    this.manager.saveSlotsConfig();
  }

  setTimeframe(newTf) {
    if (!newTf || newTf === this.timeframe) return;
    this.timeframe = newTf;
    this.updateBadge();
    this.loadData();
    if (this.manager.activeSlotId === this.id) {
      eventBus.emit('toolbar:sync_timeframe', newTf);
    }
    this.manager.saveSlotsConfig();
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
    if (this.manager.drawingLinkGroup && this.chart) {
      try {
        this.manager.drawingLinkGroup.remove(this.chart);
      } catch (e) {}
    }
    if (this.drawingController && typeof this.drawingController.destroy === 'function') {
      try {
        this.drawingController.destroy();
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
    this.drawingController = null;
    this.allCandles = [];
    this.currentVisibleCandles = [];
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

    // Sync preferences (defaults: crosshair=true, symbol=true, time=false, drawings=true)
    this.syncCrosshair = localStorage.getItem('trading_simulator_sync_crosshair') !== 'false';
    this.syncSymbol = localStorage.getItem('trading_simulator_sync_symbol') !== 'false';
    this.syncTime = localStorage.getItem('trading_simulator_sync_time') === 'true';
    this.syncDrawings = localStorage.getItem('trading_simulator_sync_drawings') !== 'false';

    this.savedSlotsConfigKey = 'trading_simulator_multi_chart_slots';

    this.linkGroup = null;
    this.drawingLinkGroup = null;

    this.init();
  }

  init() {
    this.wrapperEl = document.getElementById('chartGridWrapper');
    this.btnLayoutPicker = document.getElementById('btnLayoutPicker');
    this.dropdownEl = document.getElementById('layoutPickerDropdown');

    // Initialize OpenAlgoCharts LinkGroup for crosshair & viewport sync
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

    // Initialize OpenAlgoCharts DrawingLinkGroup for drawings cross-chart synchronization
    if (window.OpenAlgoCharts?.draw?.createDrawingLinkGroup) {
      this.drawingLinkGroup = window.OpenAlgoCharts.draw.createDrawingLinkGroup({
        enabled: this.syncDrawings
      });
      if (this.store.chart && this.store.drawingController) {
        this.drawingLinkGroup.add(
          this.store.chart,
          this.store.drawingController,
          () => ({ symbol: this.store.get('currentSymbol') || 'SBER', exchange: 'MOEX' })
        );
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

    // Sync Toggles (Crosshair, Symbol, Time, Drawings)
    const cbCrosshair = document.getElementById('syncCrosshairCheckbox');
    const cbSymbol = document.getElementById('syncSymbolCheckbox');
    const cbTime = document.getElementById('syncTimeCheckbox');
    const cbDrawings = document.getElementById('syncDrawingsCheckbox');

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

    if (cbDrawings) {
      cbDrawings.checked = this.syncDrawings;
      cbDrawings.addEventListener('change', () => {
        this.syncDrawings = cbDrawings.checked;
        localStorage.setItem('trading_simulator_sync_drawings', String(this.syncDrawings));
        if (this.drawingLinkGroup) {
          this.drawingLinkGroup.setOptions({ enabled: this.syncDrawings });
          if (this.syncDrawings) {
            this.shareAllDrawings();
          }
        }
      });
    }
  }

  isReplayActive() {
    return !!(this.store.simulator && this.store.simulator.isReplayActive);
  }

  getCurrentSimulationTime() {
    const cur = this.store.simulator?.getCurrentBar();
    return cur ? cur.time : null;
  }

  syncAllSlotsToReplay(simTime, currentTickPrice = null, isIncremental = false) {
    if (!simTime) return;

    // Update Slot 0 replay indicator
    const slot0 = document.getElementById('chartSlot0');
    if (slot0) {
      slot0.classList.add('in-replay');
    }

    for (const slot of this.slots.values()) {
      slot.syncToReplayTime(simTime, currentTickPrice, isIncremental);
    }
  }

  restoreAllSlotsFullData() {
    const slot0 = document.getElementById('chartSlot0');
    if (slot0) {
      slot0.classList.remove('in-replay');
    }

    for (const slot of this.slots.values()) {
      slot.restoreFullData();
    }
  }

  // Set drawing tool across all chart slots so user can draw on any open window
  setDrawingTool(tool) {
    const t = tool === 'cursor' ? null : tool;

    // Slot 0
    if (this.store.drawingController) {
      if (this.store.floatingDrawingToolbar && t) {
        const def = this.store.floatingDrawingToolbar.getDefaultStyle(t);
        this.store.drawingController.setOptions({ defaultStyle: def });
      }
      if (this.store.drawingController.activeTool() !== t) {
        this.store.drawingController.setTool(t);
      }
    }

    // Secondary slots
    for (const slot of this.slots.values()) {
      if (slot.drawingController) {
        if (this.store.floatingDrawingToolbar && t) {
          const def = this.store.floatingDrawingToolbar.getDefaultStyle(t);
          slot.drawingController.setOptions({ defaultStyle: def });
        }
        if (slot.drawingController.activeTool() !== t) {
          slot.drawingController.setTool(t);
        }
      }
    }
  }

  // Propagate all drawings from primary chart to all secondary slots
  shareAllDrawings() {
    if (this.drawingLinkGroup && this.syncDrawings && this.store.chart && this.store.drawingController) {
      try {
        this.drawingLinkGroup.share(this.store.chart);
      } catch (e) {
        console.warn('[MultiChart] Error sharing drawings:', e);
      }
    }
  }

  // Clear drawings across all slots
  clearAllDrawings() {
    if (this.store.drawingController) {
      const all = this.store.drawingController.drawings();
      if (all && all.length > 0) {
        this.store.drawingController.removeMany(all.map(d => d.id));
      }
    }
    for (const slot of this.slots.values()) {
      if (slot.drawingController) {
        const all = slot.drawingController.drawings();
        if (all && all.length > 0) {
          slot.drawingController.removeMany(all.map(d => d.id));
        }
      }
    }
    eventBus.emit('drawings:change');
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

      // Update Slot 0 drawing link context
      if (this.drawingLinkGroup && this.store.chart) {
        this.drawingLinkGroup.setContext(this.store.chart, { symbol: ticker, exchange: 'MOEX' });
      }

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

    // MTF Replay Coordinator: synchronize all secondary slots on replay ui update
    eventBus.on('replay:ui-update', ({ time, isPlaying, subTickInfo }) => {
      if (!this.isReplayActive()) return;
      if (time) {
        const isIncremental = isPlaying || (subTickInfo?.isSubTick);
        const tickPrice = subTickInfo?.tickPrice ?? null;
        this.syncAllSlotsToReplay(time, tickPrice, isIncremental);
      }
    });

    // MTF Replay Coordinator: synchronize all secondary slots on bar tick
    eventBus.on('bar:tick', (candle) => {
      if (!this.isReplayActive()) return;
      if (candle && candle.time) {
        this.syncAllSlotsToReplay(candle.time, candle.close, true);
      }
    });

    // MTF Replay Coordinator: toggle full data vs sliced data on replay state change
    eventBus.on('replay:state-change', (isActive) => {
      if (isActive) {
        const simTime = this.getCurrentSimulationTime();
        if (simTime) {
          this.syncAllSlotsToReplay(simTime, null, false);
        }
      } else {
        this.restoreAllSlotsFullData();
      }
    });

    // MTF Replay Coordinator: on slider scrub or jump
    eventBus.on('replay:scrubbed', () => {
      if (this.isReplayActive()) {
        const simTime = this.getCurrentSimulationTime();
        if (simTime) {
          this.syncAllSlotsToReplay(simTime, null, false);
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

    // Ensure slot 0 is in drawingLinkGroup
    if (this.drawingLinkGroup && this.store.chart && this.store.drawingController) {
      this.drawingLinkGroup.add(
        this.store.chart,
        this.store.drawingController,
        () => ({ symbol: this.store.get('currentSymbol') || 'SBER', exchange: 'MOEX' })
      );
    }

    const requiredSlots = this.getRequiredSlotCount(layoutPreset);
    this.syncSlots(requiredSlots);

    // If active slot was closed, switch focus to slot 0
    if (this.activeSlotId >= requiredSlots) {
      this.setActiveSlot(0);
    }

    // If replay is active, ensure all slots are immediately synced to simulation time
    if (this.isReplayActive()) {
      const simTime = this.getCurrentSimulationTime();
      if (simTime) {
        this.syncAllSlotsToReplay(simTime, null, false);
      }
    }

    this.saveSlotsConfig();

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

  saveSlotsConfig() {
    try {
      const configs = {};
      for (const [id, slot] of this.slots.entries()) {
        configs[id] = {
          timeframe: slot.timeframe,
          symbol: slot.symbol
        };
      }
      localStorage.setItem(this.savedSlotsConfigKey, JSON.stringify(configs));
    } catch (e) {
      console.warn('[MultiChart] Failed to save slots config:', e);
    }
  }

  getSavedSlotConfig(id) {
    try {
      const raw = localStorage.getItem(this.savedSlotsConfigKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed[id] || null;
    } catch (e) {
      return null;
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
        const savedConfig = this.getSavedSlotConfig(id);
        const tf = savedConfig?.timeframe || (defaultTfs[id % defaultTfs.length] !== currentTf
          ? defaultTfs[id % defaultTfs.length]
          : '1d');
        const sym = savedConfig?.symbol || currentSymbol;

        const slot = new ChartSlot({
          id,
          manager: this,
          store: this.store,
          symbol: sym,
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

  // Export state for SessionService
  exportState() {
    const slots = [];
    for (const [id, slot] of this.slots.entries()) {
      slots.push({
        id,
        timeframe: slot.timeframe,
        symbol: slot.symbol
      });
    }

    return {
      layout: this.currentLayout,
      syncCrosshair: this.syncCrosshair,
      syncSymbol: this.syncSymbol,
      syncTime: this.syncTime,
      syncDrawings: this.syncDrawings,
      slots
    };
  }

  // Restore state from SessionService
  restoreState(state) {
    if (!state) return;

    if (state.syncCrosshair !== undefined) {
      this.syncCrosshair = !!state.syncCrosshair;
      const cb = document.getElementById('syncCrosshairCheckbox');
      if (cb) cb.checked = this.syncCrosshair;
      if (this.linkGroup) this.linkGroup.setOptions({ crosshair: this.syncCrosshair });
    }

    if (state.syncSymbol !== undefined) {
      this.syncSymbol = !!state.syncSymbol;
      const cb = document.getElementById('syncSymbolCheckbox');
      if (cb) cb.checked = this.syncSymbol;
    }

    if (state.syncTime !== undefined) {
      this.syncTime = !!state.syncTime;
      const cb = document.getElementById('syncTimeCheckbox');
      if (cb) cb.checked = this.syncTime;
      if (this.linkGroup) this.linkGroup.setOptions({ viewport: this.syncTime });
    }

    if (state.syncDrawings !== undefined) {
      this.syncDrawings = !!state.syncDrawings;
      const cb = document.getElementById('syncDrawingsCheckbox');
      if (cb) cb.checked = this.syncDrawings;
      if (this.drawingLinkGroup) this.drawingLinkGroup.setOptions({ enabled: this.syncDrawings });
    }

    if (state.layout && state.layout !== this.currentLayout) {
      this.setLayout(state.layout);
    }

    if (Array.isArray(state.slots)) {
      for (const slotData of state.slots) {
        const slot = this.slots.get(slotData.id);
        if (slot) {
          if (slotData.timeframe && slotData.timeframe !== slot.timeframe) {
            slot.setTimeframe(slotData.timeframe);
          }
          if (slotData.symbol && slotData.symbol !== slot.symbol) {
            slot.setSymbol(slotData.symbol);
          }
        }
      }
    }

    // Share restored drawings
    setTimeout(() => {
      this.shareAllDrawings();
    }, 150);
  }
}

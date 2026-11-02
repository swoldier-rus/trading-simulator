// components/multi-chart.js - Multi-Chart Grid Layout & Slot Controller with MTF Replay, Sync Engine & Drawings Sync
import { eventBus } from '../core/event-bus.js';
import { marketDataService } from '../services/market-data.service.js';
import { binarySearchCandleFloorIndex, binarySearchCandleExact, timeframeToSeconds, showToast } from '../core/utils.js';
import { TradeLinesOverlayComponent } from './trade-lines-overlay.js';
import { TradeExecutionsOverlayComponent } from './trade-executions-overlay.js';
import { SessionBreaksOverlayComponent } from './session-breaks-overlay.js';

export class ChartSlot {
  constructor(options) {
    this.id = options.id; // 1, 2, 3
    this.manager = options.manager;
    this.store = options.store;
    this.symbol = options.symbol || this.store.get('currentSymbol') || 'SBER';
    this.figi = options.figi || this.store.get('currentFigi') || '';
    this.timeframe = options.timeframe || '1d';
    this.chartType = options.chartType || this.store.get('currentChartType') || 'candlestick';

    this.chart = null;
    this.mainSeries = null;
    this.drawingController = null;
    this.tradeLinesOverlay = null;
    this.tradeExecutionsOverlay = null;
    this.sessionBreaksOverlay = null;
    this.slotEl = null;
    this.bodyEl = null;
    this.badgeEl = null;
    this.tfDropdownEl = null;
    this.resizeObserver = null;
    this.isMaximized = false;
    this.candlesCount = 0;
    this._isLoadingHistory = false;
    this.legendEl = null;
    this.legendSymbol = null;
    this.legendTf = null;
    this.legendCurrency = null;
    this.valOpen = null;
    this.valHigh = null;
    this.valLow = null;
    this.valClose = null;
    this.valChange = null;
    this.valVolume = null;
    this.loaderEl = null;
    this.loadingOverlayEl = null;
    this._loadingCount = 0;
    this._loaderShownTimestamp = 0;
    this._hideLoaderTimeout = null;
    this._lastLegendBar = null;
    this._lastLegendClose = null;
    this._lastLegendVol = null;

    // MTF Replay Data Caches
    this.allCandles = [];
    this.currentVisibleCandles = [];

    // Dirty-flag & Throttled Replay State
    this._isReplayDirty = false;
    this._pendingReplayState = null;
    this._replayRafId = null;
    this._lastReplayRenderTime = 0;

    this.createDom();
  }

  createDom() {
    const slot = document.createElement('div');
    slot.className = 'chart-slot';
    slot.id = `chartSlot${this.id}`;
    slot.setAttribute('data-slot-id', String(this.id));

    slot.innerHTML = `
      <div class="chart-slot-legend" id="chartSlotLegend${this.id}">
        <div class="legend-row">
          <div class="legend-title">
            <span class="legend-symbol" id="slotLegendSymbol${this.id}">${this.symbol}</span>
            <span class="legend-tf" id="slotLegendTf${this.id}">${this.formatTfLabel(this.timeframe)}</span>
            <span class="legend-currency" id="slotLegendCurrency${this.id}">RUB</span>
          </div>
          <div class="legend-values" id="slotLegendValues${this.id}">
            <div class="legend-val-item"><span>О:</span><span id="slotValOpen${this.id}">—</span></div>
            <div class="legend-val-item"><span>В:</span><span id="slotValHigh${this.id}">—</span></div>
            <div class="legend-val-item"><span>Н:</span><span id="slotValLow${this.id}">—</span></div>
            <div class="legend-val-item"><span>З:</span><span id="slotValClose${this.id}">—</span></div>
            <div class="legend-val-item"><span id="slotValChange${this.id}">—</span></div>
            <div class="legend-val-item"><span>Объем:</span><span id="slotValVolume${this.id}">—</span></div>
          </div>
          <div class="chart-data-loader" id="slotDataLoader${this.id}" style="display: none;" title="Загрузка котировок графика...">
            <span class="loader-dot"></span>
            <span class="loader-dot"></span>
            <span class="loader-dot"></span>
          </div>
        </div>
      </div>
      <div class="chart-slot-header">
        <div class="chart-slot-badge" title="Сменить таймфрейм для этого окна">
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
      <div class="chart-slot-loading-overlay" id="slotLoadingOverlay${this.id}"></div>
      <div class="chart-session-breaks-overlay" id="chartSessionBreaksOverlay${this.id}">
        <svg class="chart-session-breaks-svg" id="chartSessionBreaksSvg${this.id}"></svg>
      </div>
      <div class="chart-trade-overlay" id="chartTradeOverlay${this.id}"></div>
      <div class="chart-executions-overlay" id="chartExecutionsOverlay${this.id}">
        <svg class="chart-executions-svg" id="chartExecutionsSvg${this.id}"></svg>
        <div class="chart-executions-markers" id="chartExecutionsMarkers${this.id}"></div>
        <div class="chart-execution-tooltip" id="chartExecutionTooltip${this.id}" style="display: none;"></div>
      </div>
    `;

    this.slotEl = slot;
    this.bodyEl = slot.querySelector(`#chartSlotBody${this.id}`);
    this.badgeEl = slot.querySelector('.chart-slot-badge');
    this.tfDropdownEl = slot.querySelector('.slot-tf-dropdown');
    this.legendEl = slot.querySelector(`#chartSlotLegend${this.id}`);
    this.legendSymbol = slot.querySelector(`#slotLegendSymbol${this.id}`);
    this.legendTf = slot.querySelector(`#slotLegendTf${this.id}`);
    this.legendCurrency = slot.querySelector(`#slotLegendCurrency${this.id}`);
    this.valOpen = slot.querySelector(`#slotValOpen${this.id}`);
    this.valHigh = slot.querySelector(`#slotValHigh${this.id}`);
    this.valLow = slot.querySelector(`#slotValLow${this.id}`);
    this.valClose = slot.querySelector(`#slotValClose${this.id}`);
    this.valChange = slot.querySelector(`#slotValChange${this.id}`);
    this.valVolume = slot.querySelector(`#slotValVolume${this.id}`);
    this.loaderEl = slot.querySelector(`#slotDataLoader${this.id}`);
    this.loadingOverlayEl = slot.querySelector(`#slotLoadingOverlay${this.id}`);

    // Click to focus slot (pointerdown capture phase for instant responsiveness)
    slot.addEventListener('pointerdown', () => {
      this.manager.setActiveSlot(this.id);
    }, true);
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
      borderDownColor: '#f23645',
      lastPriceUp: '#089981',
      lastPriceDown: '#f23645',
      lastPriceText: '#ffffff',
      buy: '#089981',
      sell: '#f23645',
      profit: '#089981',
      loss: '#f23645'
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

    if (this.chartType !== 'candlestick' && typeof this.chart.setSeriesType === 'function') {
      try {
        this.chart.setSeriesType(this.mainSeries, this.chartType);
      } catch (e) {
        console.warn(`[ChartSlot ${this.id}] Failed to set series type:`, e);
      }
    }
    this.applySeriesStyle(this.chartType);

    // Apply appearance configuration (canvas background, grid lines)
    if (appearanceConfig) {
      this.applyAppearance(appearanceConfig);
    }

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

    // Initialize interactive Trade Lines Overlay for this slot
    const overlayTradeEl = this.slotEl.querySelector(`#chartTradeOverlay${this.id}`);
    if (overlayTradeEl) {
      this.tradeLinesOverlay = new TradeLinesOverlayComponent(this.store, {
        slotId: this.id,
        slotEl: this.slotEl,
        overlayEl: overlayTradeEl,
        getChart: () => this.chart,
        getSymbol: () => this.symbol
      });
    }

    // Initialize Trade Executions Overlay for this slot
    const overlayExecEl = this.slotEl.querySelector(`#chartExecutionsOverlay${this.id}`);
    if (overlayExecEl) {
      this.tradeExecutionsOverlay = new TradeExecutionsOverlayComponent(this.store, {
        slotId: this.id,
        slotEl: this.slotEl,
        overlayEl: overlayExecEl,
        svgEl: this.slotEl.querySelector(`#chartExecutionsSvg${this.id}`),
        markersEl: this.slotEl.querySelector(`#chartExecutionsMarkers${this.id}`),
        tooltipEl: this.slotEl.querySelector(`#chartExecutionTooltip${this.id}`),
        getChart: () => this.chart,
        getSymbol: () => this.symbol,
        getCandles: () => this.allCandles
      });
    }

    // Initialize Session Breaks Overlay for this slot
    const overlaySessionBreaksEl = this.slotEl.querySelector(`#chartSessionBreaksOverlay${this.id}`);
    if (overlaySessionBreaksEl) {
      this.sessionBreaksOverlay = new SessionBreaksOverlayComponent(this.store, {
        slotId: this.id,
        slotEl: this.slotEl,
        chartContainer: this.bodyEl,
        overlayEl: overlaySessionBreaksEl,
        svgEl: overlaySessionBreaksEl.querySelector('.chart-session-breaks-svg'),
        getChart: () => this.chart,
        getTimeframe: () => this.timeframe,
        getCandles: () => (this.currentVisibleCandles && this.currentVisibleCandles.length > 0 ? this.currentVisibleCandles : this.allCandles)
      });
    }

    // Crosshair move handler to update slot legend OHLCV
    if (typeof this.chart.subscribeCrosshairMove === 'function') {
      this.chart.subscribeCrosshairMove((param) => {
        if (!param || !param.time) {
          this.updateLegendToLatest();
        } else {
          const candles = this.manager.isReplayActive() ? this.currentVisibleCandles : this.allCandles;
          if (candles && candles.length > 0) {
            const bar = binarySearchCandleExact(candles, param.time);
            if (bar) {
              this.updateLegend(bar);
            }
          }
        }
      });
    }

    // Allow clicking on secondary charts to choose Jump to Bar start point or activate slot
    this.chart.subscribeClick((param) => {
      this.manager.setActiveSlot(this.id);
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
        this.setLoadingState(true, { fullReset: false });
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
              const before = typeof this.chart.getVisibleLogicalRange === 'function' ? this.chart.getVisibleLogicalRange() : null;
              this.allCandles = [...fresh, ...this.allCandles];
              if (this.manager.isReplayActive()) {
                this.syncToReplayTime(this.manager.getCurrentSimulationTime(), null, false);
              } else {
                this.currentVisibleCandles = [...this.allCandles];
                this.mainSeries.setData(this.allCandles);
                if (before && typeof this.chart.setVisibleLogicalRange === 'function') {
                  this.chart.setVisibleLogicalRange({
                    from: before.from + fresh.length,
                    to: before.to + fresh.length
                  });
                }
              }
              this.updateLegendToLatest();
            }
          }
        } catch (e) {
          console.warn(`[ChartSlot ${this.id}] History loader error:`, e);
        } finally {
          this.chart.historyLoadComplete();
          this.setLoadingState(false);
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

  async loadData(options = {}) {
    if (!this.mainSeries) return;
    const isFullReset = options.fullReset !== false;
    this.setLoadingState(true, { fullReset: isFullReset });
    try {
      let toSec = null;
      if (this.manager.isReplayActive()) {
        const simTime = this.manager.getCurrentSimulationTime();
        if (simTime) {
          const step = timeframeToSeconds(this.timeframe);
          const nowSec = Math.floor(Date.now() / 1000);
          const forwardSec = Math.max(350 * step, 7 * 86400);
          toSec = Math.min(nowSec, simTime + forwardSec);
        }
      }
      const res = await marketDataService.getCandles(this.symbol, this.figi, this.timeframe, 1200, toSec, null, { silent: true });
      if (res && res.candles && res.candles.length > 0) {
        this.allCandles = res.candles;
        this.candlesCount = res.candles.length;

        // If Replay is currently active, slice immediately to simulation time without showing the future
        if (this.manager.isReplayActive()) {
          this.slotEl.classList.add('in-replay');
          const simTime = this.manager.getCurrentSimulationTime();
          if (simTime) {
            this.syncToReplayTime(simTime, null, false);
            this.resetView();
          } else {
            this.currentVisibleCandles = [...this.allCandles];
            this.mainSeries.setData(this.allCandles);
          }
        } else {
          this.slotEl.classList.remove('in-replay');
          this.currentVisibleCandles = [...this.allCandles];
          this.mainSeries.setData(this.allCandles);
          this.resetView();
        }
        this.updateLegendToLatest();
      }
    } catch (err) {
      console.warn(`[ChartSlot ${this.id}] Failed to load candles:`, err);
    } finally {
      this.setLoadingState(false);
    }
  }

  async ensureHistoryAround(targetTime) {
    if (this._isLoadingHistory || !targetTime || this._lastAttemptedTargetTime === targetTime) return;
    this._isLoadingHistory = true;
    this._lastAttemptedTargetTime = targetTime;
    this.setLoadingState(true, { fullReset: false });
    try {
      const step = timeframeToSeconds(this.timeframe);
      const nowSec = Math.floor(Date.now() / 1000);
      const forwardSec = Math.max(350 * step, 7 * 86400);
      const toSec = Math.min(nowSec, targetTime + forwardSec);

      const res = await marketDataService.getCandles(
        this.symbol,
        this.figi,
        this.timeframe,
        1200,
        toSec,
        null,
        { silent: true }
      );

      if (res && res.candles && res.candles.length > 0) {
        this.allCandles = res.candles;
        this.candlesCount = res.candles.length;
        const currentSimTime = this.manager.getCurrentSimulationTime() || targetTime;
        this.syncToReplayTime(currentSimTime, null, false);
        this.resetView();
      }
    } catch (e) {
      console.warn(`[ChartSlot ${this.id}] ensureHistoryAround error:`, e);
    } finally {
      this._isLoadingHistory = false;
      this.setLoadingState(false);
    }
  }

  // Backward infinite scrolling loader (when user pans chart to the past)
  async ensureHistoryBefore(targetTime) {
    if (this._isLoadingHistory || !this.allCandles || this.allCandles.length === 0) return;
    this._isLoadingHistory = true;
    this.setLoadingState(true, { fullReset: false });
    try {
      let maxBatches = 5;
      while (maxBatches-- > 0 && this.allCandles.length > 0 && targetTime < this.allCandles[0].time) {
        const oldest = this.allCandles[0];
        const res = await marketDataService.getCandles(
          this.symbol,
          this.figi,
          this.timeframe,
          1200,
          oldest.time - 1,
          null,
          { silent: true }
        );
        if (res && res.candles && res.candles.length > 0) {
          const fresh = res.candles.filter(b => b.time < oldest.time);
          if (fresh.length === 0) break;
          this.allCandles = [...fresh, ...this.allCandles];
        } else {
          break;
        }
      }
      const simTime = this.manager.getCurrentSimulationTime();
      if (simTime) {
        this.syncToReplayTime(simTime, null, false);
      }
    } catch (e) {
      console.warn(`[ChartSlot ${this.id}] ensureHistoryBefore error:`, e);
    } finally {
      this._isLoadingHistory = false;
      this.setLoadingState(false);
    }
  }

  // MTF Replay Synchronizer: Slices history and synthesizes forming bar without lookahead bias
  syncToReplayTime(simTime, currentTickPrice = null, isIncremental = false) {
    if (!this.mainSeries) return;
    if (!simTime) return;

    this.slotEl.classList.add('in-replay');

    if (!this.allCandles || this.allCandles.length === 0) {
      this.ensureHistoryAround(simTime);
      return;
    }

    const oldestTime = this.allCandles[0].time;
    const newestTime = this.allCandles[this.allCandles.length - 1].time;
    if (simTime < oldestTime || simTime > newestTime) {
      this.ensureHistoryAround(simTime);
      return;
    }

    const tfSlot = (this.timeframe || '1d').toLowerCase();
    const tfSim = (this.store.get('currentTimeframe') || '1h').toLowerCase();
    const stepSlot = timeframeToSeconds(tfSlot);
    const stepSim = timeframeToSeconds(tfSim);

    // HIGHER TIMEFRAME (e.g. Slot is 1D / 4H, Sim is 15M / 1H)
    if (stepSlot > stepSim) {
      const floorIdx = binarySearchCandleFloorIndex(this.allCandles, simTime);
      if (floorIdx < 0) {
        this.ensureHistoryAround(simTime);
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
        this.ensureHistoryAround(simTime);
        return;
      }

      const newVisible = this.allCandles.slice(0, floorIdx + 1);

      if (currentTickPrice !== null && newVisible.length > 0) {
        const last = newVisible[newVisible.length - 1];
        if (last && last.time === simTime) {
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
        } catch (e) {
          if (this.mainSeries) this.mainSeries.setData(newVisible);
          return;
        }
      } else if (newLen === prevLen + 1) {
        // Append newly opened bar
        this.currentVisibleCandles.push(lastBar);
        try {
          this.mainSeries.update(lastBar);
          return;
        } catch (e) {
          if (this.mainSeries) this.mainSeries.setData(newVisible);
          return;
        }
      }
    }

    // Full series replacement (jump, scrub, step backward, or initial cut)
    this.currentVisibleCandles = newVisible;
    if (this.mainSeries) {
      this.mainSeries.setData(newVisible);
      if (prevLen === 0) {
        this.resetView();
      }
    }

    // If this slot is focused, keep Quick Trade widget price synced with visible candle
    if (this.manager && this.manager.activeSlotId === this.id && this.store.quickTradeWidget) {
      this.store.quickTradeWidget.refreshToCurrentBar();
    }
    this.updateLegendToLatest();
  }

  // Auto-scale price axis and scroll time scale to latest bar with TradingView 12-bar right offset
  resetView() {
    if (!this.chart) return;
    try {
      if (typeof this.chart.setAutoScale === 'function') {
        this.chart.setAutoScale(true);
      }
      if (typeof this.chart.fitContent === 'function') {
        this.chart.fitContent();
      }
      const ts = this.chart._timeScale || (typeof this.chart.timeScale === 'function' ? this.chart.timeScale() : this.chart.timeScale);
      if (ts) {
        if (typeof ts.setRightOffset === 'function') ts.setRightOffset(12);
        if (typeof ts.setBarSpacing === 'function') ts.setBarSpacing(7.5);
      }
      if (typeof this.chart.invalidate === 'function') {
        this.chart.invalidate(e => e.invalidateGlobal(3));
      }
      showToast('Состояние графика сброшено (Alt+R)', 'info');
    } catch (e) {}
  }

  isSlotVisible() {
    if (!this.slotEl || !this.bodyEl) return false;
    if (this.slotEl.classList.contains('hidden') || this.slotEl.style.display === 'none') return false;
    if (this.bodyEl.clientWidth === 0 || this.bodyEl.clientHeight === 0) return false;
    if (this.manager && typeof this.manager.hasOtherSlotMaximized === 'function' && this.manager.hasOtherSlotMaximized(this.id)) {
      return false;
    }
    return true;
  }

  queueReplayUpdate(simTime, currentTickPrice = null, isIncremental = false, isPlaying = false) {
    const isActive = this.manager && this.manager.activeSlotId === this.id;

    // Active slot or manual step/pause: always update synchronously for 60 FPS fluidity
    if (isActive || !isPlaying) {
      this._isReplayDirty = false;
      this._pendingReplayState = null;
      if (this._replayRafId) {
        cancelAnimationFrame(this._replayRafId);
        this._replayRafId = null;
      }
      this.syncToReplayTime(simTime, currentTickPrice, isIncremental);
      return;
    }

    // Obscured / hidden slot: mark dirty without scheduling RAF to save CPU/GPU cycles
    if (!this.isSlotVisible()) {
      this._isReplayDirty = true;
      this._pendingReplayState = { simTime, currentTickPrice, isIncremental };
      return;
    }

    // Secondary visible slot during continuous replay: throttle canvas updates to ~30 FPS via dirty-flag + RAF
    this._isReplayDirty = true;
    this._pendingReplayState = { simTime, currentTickPrice, isIncremental };

    if (!this._replayRafId) {
      this._replayRafId = requestAnimationFrame((timestamp) => {
        this._replayRafId = null;
        if (timestamp - this._lastReplayRenderTime < 33) {
          // Coalesce into next frame
          return;
        }
        this._lastReplayRenderTime = timestamp;
        this.flushPendingReplay();
      });
    }
  }

  flushPendingReplay() {
    if (this._replayRafId) {
      cancelAnimationFrame(this._replayRafId);
      this._replayRafId = null;
    }
    if (this._isReplayDirty && this._pendingReplayState) {
      const state = this._pendingReplayState;
      this._isReplayDirty = false;
      this._pendingReplayState = null;
      this.syncToReplayTime(state.simTime, state.currentTickPrice, state.isIncremental);
    }
  }

  getCurrentBar() {
    if (this.currentVisibleCandles && this.currentVisibleCandles.length > 0) {
      return this.currentVisibleCandles[this.currentVisibleCandles.length - 1];
    }
    return null;
  }

  resetTimeScale(rightOffset = 12, defaultBarSpacing = 7.5) {
    if (!this.chart) return;
    try {
      const ts = this.chart._timeScale || (typeof this.chart.timeScale === 'function' ? this.chart.timeScale() : this.chart.timeScale);
      if (ts) {
        if (typeof ts.setRightOffset === 'function') ts.setRightOffset(rightOffset);
        if (typeof ts.setBarSpacing === 'function') ts.setBarSpacing(defaultBarSpacing);
      }
      if (typeof this.chart.invalidate === 'function') {
        this.chart.invalidate(e => e.invalidateGlobal(3));
      }
      showToast('Масштаб временной шкалы сброшен', 'info');
    } catch (e) {}
  }

  resetPriceScale() {
    if (!this.chart) return;
    try {
      if (typeof this.chart.setAutoScale === 'function') this.chart.setAutoScale(true);
      if (typeof this.chart.resetScale === 'function') this.chart.resetScale();
      if (typeof this.chart.fitContent === 'function') this.chart.fitContent();
      const panes = typeof this.chart.panes === 'function' ? this.chart.panes() : (this.chart._panes || []);
      for (const p of panes) {
        if (typeof p.clearRatioLocks === 'function') p.clearRatioLocks();
        const scales = typeof p.scales === 'function' ? p.scales() : [];
        for (const s of scales) {
          if (typeof s.clearOwnedFixedRange === 'function') s.clearOwnedFixedRange();
          if (typeof s.setAutoScale === 'function') s.setAutoScale(true);
        }
      }
      if (typeof this.chart.invalidate === 'function') {
        this.chart.invalidate(e => e.invalidateGlobal(3));
      }
      showToast('Масштаб ценовой шкалы сброшен', 'info');
    } catch (e) {}
  }

  isPriceAutoScaleEnabled() {
    if (!this.chart) return true;
    try {
      const panes = typeof this.chart.panes === 'function' ? this.chart.panes() : (this.chart._panes || []);
      if (panes[0]) {
        const scales = typeof panes[0].scales === 'function' ? panes[0].scales() : [];
        if (scales[0] && typeof scales[0].autoScale === 'function') return scales[0].autoScale();
        if (scales[0] && scales[0]._autoScale !== undefined) return !!scales[0]._autoScale;
      }
    } catch (e) {}
    return true;
  }

  togglePriceAutoScale() {
    if (!this.chart) return true;
    const current = this.isPriceAutoScaleEnabled();
    const next = !current;
    try {
      const panes = typeof this.chart.panes === 'function' ? this.chart.panes() : (this.chart._panes || []);
      for (const p of panes) {
        if (next && typeof p.clearRatioLocks === 'function') p.clearRatioLocks();
        const scales = typeof p.scales === 'function' ? p.scales() : [];
        for (const s of scales) {
          if (typeof s.setAutoScale === 'function') s.setAutoScale(next);
        }
      }
      if (typeof this.chart.setAutoScale === 'function') this.chart.setAutoScale(next);
      if (typeof this.chart.invalidate === 'function') this.chart.invalidate(e => e.invalidateGlobal(3));
      showToast(next ? 'Автомасштаб цены включен' : 'Автомасштаб цены выключен', 'info');
    } catch (e) {}
    return next;
  }

  // Restore full dataset on replay exit
  restoreFullData() {
    this.slotEl.classList.remove('in-replay');
    this._lastAttemptedTargetTime = null;
    const nowSec = Math.floor(Date.now() / 1000);
    const lastTime = (this.allCandles && this.allCandles.length > 0) ? this.allCandles[this.allCandles.length - 1].time : 0;
    if (nowSec - lastTime > 7 * 86400) {
      this.loadData();
    } else if (this.mainSeries && this.allCandles && this.allCandles.length > 0) {
      this.currentVisibleCandles = [...this.allCandles];
      this.mainSeries.setData(this.allCandles);
      this.resetView();
    }
  }

  setSymbol(symbol, figi = '') {
    this.symbol = symbol;
    this.figi = figi;
    this._lastAttemptedTargetTime = null;
    this.updateBadge();
    this.loadData({ fullReset: true });
    if (this.manager.drawingLinkGroup && this.chart) {
      this.manager.drawingLinkGroup.setContext(this.chart, { symbol: this.symbol, exchange: 'MOEX' });
    }
    this.tradeLinesOverlay?.scheduleRender();
    this.tradeExecutionsOverlay?.scheduleRender();
    this.sessionBreaksOverlay?.render();
    this.manager.saveSlotsConfig();
  }

  setTimeframe(newTf) {
    if (!newTf || newTf === this.timeframe) return;
    this.timeframe = newTf;
    this._lastAttemptedTargetTime = null;
    this.updateBadge();
    this.loadData({ fullReset: true });
    if (this.manager.activeSlotId === this.id) {
      eventBus.emit('toolbar:sync_timeframe', newTf);
    }
    this.manager.saveSlotsConfig();
  }

  setChartType(newType) {
    if (!newType) return;
    this.chartType = newType;
    if (this.chart && this.mainSeries && typeof this.chart.setSeriesType === 'function') {
      try {
        this.chart.setSeriesType(this.mainSeries, newType);
      } catch (e) {
        console.warn(`[ChartSlot ${this.id}] Failed to setSeriesType:`, e);
      }
      this.applySeriesStyle(newType);
    }
    this.manager.saveSlotsConfig();
  }

  applyAppearance(config) {
    if (!config) return;
    if (config.background) {
      this.applyBackground(config.background);
    }
    if (config.grid) {
      this.applyGrid(config.grid);
    }
  }

  applyBackground(bgConfig) {
    if (!this.chart || !this.bodyEl) return;
    const cfg = bgConfig || {};
    const type = cfg.type || 'solid';
    const curTheme = this.chart._theme || (window.OpenAlgoCharts ? window.OpenAlgoCharts.darkTheme : {}) || {};

    if (type === 'gradient') {
      const g1 = cfg.gradientColor1 || '#1e222d';
      const g2 = cfg.gradientColor2 || '#131722';
      const gradCss = `linear-gradient(to bottom, ${g1}, ${g2})`;
      this.bodyEl.style.background = gradCss;
      if (this.slotEl) this.slotEl.style.background = gradCss;
      if (typeof this.chart.setTheme === 'function') {
        this.chart.setTheme({ ...curTheme, lastPriceText: '#ffffff', background: 'transparent' });
      }
      this.bodyEl.style.background = gradCss;
    } else {
      const color = cfg.color || '#131722';
      this.bodyEl.style.background = color;
      if (this.slotEl) this.slotEl.style.background = color;
      if (typeof this.chart.setTheme === 'function') {
        this.chart.setTheme({ ...curTheme, lastPriceText: '#ffffff', background: color });
      }
      this.bodyEl.style.background = color;
    }

    if (typeof this.chart.invalidate === 'function') {
      this.chart.invalidate(e => e.invalidateGlobal(3));
    }
  }

  applyGrid(gridConfig) {
    if (!this.chart) return;
    const cfg = gridConfig || {};
    if (typeof this.chart.setGridOptions === 'function') {
      this.chart.setGridOptions({
        vertLines: cfg.vertLines !== false,
        vertColor: cfg.vertColor || '#1e222d',
        vertStyle: cfg.vertStyle || 'solid',
        horzLines: cfg.horzLines !== false,
        horzColor: cfg.horzColor || '#1e222d',
        horzStyle: cfg.horzStyle || 'solid'
      });
    }
    if (typeof this.chart.invalidate === 'function') {
      this.chart.invalidate(e => e.invalidateGlobal(3));
    }
  }

  applySeriesStyle(type = this.chartType) {
    if (!this.mainSeries || typeof this.mainSeries.applyOptions !== 'function') return;
    try {
      const raw = localStorage.getItem('trading_simulator_chart_custom_styles');
      if (raw) {
        const allCustom = JSON.parse(raw);
        if (allCustom && allCustom[type]) {
          this.mainSeries.applyOptions(allCustom[type]);
        }
      }
    } catch (e) {
      console.warn(`[ChartSlot ${this.id}] Failed to apply saved series style:`, e);
    }
  }

  setLoadingState(isLoading, options = {}) {
    const fullReset = !!options.fullReset;
    if (isLoading) {
      this._loadingCount = (this._loadingCount || 0) + 1;
      this._loaderShownTimestamp = Date.now();
      if (this.loaderEl) {
        this.loaderEl.style.display = 'inline-flex';
      }
      if (fullReset) {
        if (this.loadingOverlayEl) {
          this.loadingOverlayEl.classList.add('active');
        }
        if (this.valOpen) this.valOpen.textContent = '—';
        if (this.valHigh) this.valHigh.textContent = '—';
        if (this.valLow) this.valLow.textContent = '—';
        if (this.valClose) this.valClose.textContent = '—';
        if (this.valChange) {
          this.valChange.textContent = '—';
          this.valChange.className = '';
        }
        if (this.valVolume) this.valVolume.textContent = '—';
      }
    } else {
      this._loadingCount = Math.max(0, (this._loadingCount || 1) - 1);
      if (this._loadingCount === 0) {
        const elapsed = Date.now() - (this._loaderShownTimestamp || 0);
        const minDuration = 250;
        const remaining = Math.max(0, minDuration - elapsed);

        if (this._hideLoaderTimeout) clearTimeout(this._hideLoaderTimeout);
        this._hideLoaderTimeout = setTimeout(() => {
          this._hideLoaderTimeout = null;
          if (this.loaderEl) {
            this.loaderEl.style.display = 'none';
          }
          if (this.loadingOverlayEl) {
            this.loadingOverlayEl.classList.remove('active');
          }
        }, remaining);
      }
    }
  }

  updateLegend(bar) {
    if (!bar) return;
    if (this._lastLegendBar === bar &&
        this._lastLegendClose === bar.close &&
        this._lastLegendVol === bar.volume) {
      return;
    }
    this._lastLegendBar = bar;
    this._lastLegendClose = bar.close;
    this._lastLegendVol = bar.volume;

    if (this.valOpen && typeof bar.open === 'number') this.valOpen.textContent = bar.open.toFixed(2);
    if (this.valHigh && typeof bar.high === 'number') this.valHigh.textContent = bar.high.toFixed(2);
    if (this.valLow && typeof bar.low === 'number') this.valLow.textContent = bar.low.toFixed(2);
    if (this.valClose && typeof bar.close === 'number') this.valClose.textContent = bar.close.toFixed(2);

    if (typeof bar.close === 'number' && typeof bar.open === 'number') {
      const change = bar.close - bar.open;
      const changePct = bar.open ? ((change / bar.open) * 100).toFixed(2) : '0.00';
      if (this.valChange) {
        this.valChange.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePct}%)`;
        this.valChange.className = change >= 0 ? 'text-positive' : 'text-negative';
      }
    }

    if (this.valVolume) {
      this.valVolume.textContent = Number(bar.volume || 0).toLocaleString('ru-RU');
    }
  }

  updateLegendToLatest() {
    let current = null;
    if (this.manager.isReplayActive()) {
      if (this.currentVisibleCandles && this.currentVisibleCandles.length > 0) {
        current = this.currentVisibleCandles[this.currentVisibleCandles.length - 1];
      }
    } else if (this.allCandles && this.allCandles.length > 0) {
      current = this.allCandles[this.allCandles.length - 1];
    }
    if (current) this.updateLegend(current);
  }

  updateBadge() {
    if (this.badgeEl) {
      const tfEl = this.badgeEl.querySelector('.badge-tf');
      if (tfEl) tfEl.textContent = this.formatTfLabel(this.timeframe);

      if (this.tfDropdownEl) {
        this.tfDropdownEl.querySelectorAll('.slot-tf-item').forEach(item => {
          const tf = item.getAttribute('data-tf');
          item.classList.toggle('active', tf === this.timeframe);
        });
      }
    }

    if (this.legendSymbol) this.legendSymbol.textContent = this.symbol;
    if (this.legendTf) this.legendTf.textContent = this.formatTfLabel(this.timeframe);
    if (this.legendCurrency) this.legendCurrency.textContent = 'RUB';
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
    if (this.manager && typeof this.manager.flushAllSlotsReplay === 'function') {
      this.manager.flushAllSlotsReplay();
    }
    if (this.chart && this.bodyEl) {
      setTimeout(() => {
        this.chart.applySize(this.bodyEl.clientWidth, this.bodyEl.clientHeight);
      }, 50);
    }
  }

  destroy() {
    if (this._replayRafId) {
      cancelAnimationFrame(this._replayRafId);
      this._replayRafId = null;
    }
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
    if (this.tradeLinesOverlay) {
      try { this.tradeLinesOverlay.destroy(); } catch (e) {}
      this.tradeLinesOverlay = null;
    }
    if (this.tradeExecutionsOverlay) {
      try { this.tradeExecutionsOverlay.destroy(); } catch (e) {}
      this.tradeExecutionsOverlay = null;
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
    // Rescue Quick Trade widget to Slot 0 if it was inside this slot being destroyed
    const quickWidgetEl = document.getElementById('chartQuickTradeWidget');
    if (quickWidgetEl && this.slotEl && this.slotEl.contains(quickWidgetEl)) {
      const targetParent = document.querySelector('#chartSlot0 .chart-legend') || document.getElementById('chartSlot0');
      if (targetParent) {
        targetParent.appendChild(quickWidgetEl);
      }
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
    this.syncChartType = localStorage.getItem('trading_simulator_sync_chart_type') !== 'false';

    this.savedSlotsConfigKey = 'trading_simulator_multi_chart_slots';
    this.proportions = this.loadProportions();
    this.splitterContainer = null;

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
    this.initSplitters();

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

    const cbChartType = document.getElementById('syncChartTypeCheckbox');
    if (cbChartType) {
      cbChartType.checked = this.syncChartType;
      cbChartType.addEventListener('change', () => {
        this.syncChartType = cbChartType.checked;
        localStorage.setItem('trading_simulator_sync_chart_type', String(this.syncChartType));
        if (this.syncChartType) {
          const activeType = this.getActiveChartType();
          this.setAllSlotsChartType(activeType);
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

  hasOtherSlotMaximized(slotId) {
    const slot0 = document.getElementById('chartSlot0');
    if (slotId !== 0 && slot0 && slot0.classList.contains('maximized')) {
      return true;
    }
    for (const [id, slot] of this.slots.entries()) {
      if (id !== slotId && slot.isMaximized) {
        return true;
      }
    }
    return false;
  }

  flushAllSlotsReplay() {
    for (const slot of this.slots.values()) {
      slot.flushPendingReplay();
    }
  }

  syncAllSlotsToReplay(simTime, currentTickPrice = null, isIncremental = false) {
    if (!simTime) return;

    // Update Slot 0 replay indicator
    const slot0 = document.getElementById('chartSlot0');
    if (slot0) {
      slot0.classList.add('in-replay');
    }

    const isPlaying = !!(this.store.simulator && this.store.simulator.isPlaying);

    for (const slot of this.slots.values()) {
      slot.queueReplayUpdate(simTime, currentTickPrice, isIncremental, isPlaying);
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
      slot0.addEventListener('pointerdown', () => {
        this.setActiveSlot(0);
      }, true);
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
      this.flushAllSlotsReplay();
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
      this.flushAllSlotsReplay();
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
    this.updateSplitters(layoutPreset);

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
    // If active slot will be closed, switch focus to slot 0 before unmounting
    if (this.activeSlotId >= requiredSlots) {
      this.setActiveSlot(0);
    }
    this.syncSlots(requiredSlots);

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
          symbol: slot.symbol,
          chartType: slot.chartType
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
        const sym = this.syncSymbol ? currentSymbol : (savedConfig?.symbol || currentSymbol);
        const fig = this.syncSymbol ? currentFigi : (savedConfig?.figi || currentFigi);
        const slotChartType = this.syncChartType
          ? (this.getActiveChartType() || 'candlestick')
          : (savedConfig?.chartType || this.getActiveChartType() || 'candlestick');

        const slot = new ChartSlot({
          id,
          manager: this,
          store: this.store,
          symbol: sym,
          figi: fig,
          timeframe: tf,
          chartType: slotChartType
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
    this.flushAllSlotsReplay();

    // Update active highlight classes
    const allSlotEls = this.wrapperEl.querySelectorAll('.chart-slot');
    allSlotEls.forEach(slotEl => {
      const id = Number(slotEl.getAttribute('data-slot-id'));
      slotEl.classList.toggle('active', id === slotId);
    });

    // Move Quick Trade Widget into active slot
    const targetSlotEl = slotId === 0
      ? (document.querySelector('#chartSlot0 .chart-legend') || document.getElementById('chartSlot0'))
      : this.slots.get(slotId)?.slotEl;
    const quickWidgetEl = document.getElementById('chartQuickTradeWidget');
    if (targetSlotEl && quickWidgetEl && quickWidgetEl.parentNode !== targetSlotEl) {
      targetSlotEl.appendChild(quickWidgetEl);
    }
    if (this.store.quickTradeWidget) {
      this.store.quickTradeWidget.refreshToCurrentBar();
    }
    if (this.store.chartController) {
      this.store.chartController.syncIndicatorLegendOffset();
    }
    if (this.store.orderPanel) {
      this.store.orderPanel.updateSubmitButtonDesc();
    }

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

    if (!this.syncChartType) {
      const slotChartType = slotId === 0 ? (this.store.get('currentChartType') || 'candlestick') : (this.slots.get(slotId)?.chartType || 'candlestick');
      if (slotChartType) {
        eventBus.emit('toolbar:sync_chart_type', slotChartType);
      }
    }
  }

  getActiveChartType() {
    if (this.activeSlotId === 0) {
      return this.store.get('currentChartType') || 'candlestick';
    }
    const slot = this.slots.get(this.activeSlotId);
    return slot?.chartType || this.store.get('currentChartType') || 'candlestick';
  }

  setAllSlotsChartType(type) {
    if (!type) return;
    this.store.set('currentChartType', type);
    if (this.store.chart && this.store.mainSeries && typeof this.store.chart.setSeriesType === 'function') {
      try {
        this.store.chart.setSeriesType(this.store.mainSeries, type);
      } catch (e) {
        console.warn('[MultiChart] Slot 0 setSeriesType error:', e);
      }
      this.store.chartController?.applySavedSeriesStyle(type);
    }

    for (const slot of this.slots.values()) {
      slot.setChartType(type);
    }

    eventBus.emit('toolbar:sync_chart_type', type);
    this.saveSlotsConfig();
  }

  setChartType(type, targetSlotId = this.activeSlotId) {
    if (!type) return;
    if (this.syncChartType) {
      this.setAllSlotsChartType(type);
    } else {
      if (targetSlotId === 0) {
        this.store.set('currentChartType', type);
        if (this.store.chart && this.store.mainSeries && typeof this.store.chart.setSeriesType === 'function') {
          try {
            this.store.chart.setSeriesType(this.store.mainSeries, type);
          } catch (e) {
            console.warn('[MultiChart] Slot 0 setSeriesType error:', e);
          }
          this.store.chartController?.applySavedSeriesStyle(type);
        }
      } else {
        const slot = this.slots.get(targetSlotId);
        if (slot) {
          slot.setChartType(type);
        }
      }
      eventBus.emit('toolbar:sync_chart_type', type);
      this.saveSlotsConfig();
    }
  }

  applyAllSlotsSeriesStyle(type, customStyle = null) {
    if (!type) return;
    if (this.store.get('currentChartType') === type) {
      if (customStyle && this.store.mainSeries?.applyOptions) {
        this.store.mainSeries.applyOptions(customStyle);
      } else {
        this.store.chartController?.applySavedSeriesStyle(type);
      }
    }

    for (const slot of this.slots.values()) {
      if (slot.chartType === type && slot.mainSeries) {
        if (customStyle && typeof slot.mainSeries.applyOptions === 'function') {
          slot.mainSeries.applyOptions(customStyle);
        } else {
          slot.applySeriesStyle(type);
        }
      }
    }
  }

  applyAllSlotsAppearance(config) {
    if (!config) return;
    if (this.store.chartController && typeof this.store.chartController.applyAppearance === 'function') {
      this.store.chartController.applyAppearance(config);
    }
    for (const slot of this.slots.values()) {
      slot.applyAppearance(config);
    }
  }

  applyAllSlotsBackground(bgConfig) {
    if (!bgConfig) return;
    if (this.store.chartController && typeof this.store.chartController.applyBackground === 'function') {
      this.store.chartController.applyBackground(bgConfig);
    }
    for (const slot of this.slots.values()) {
      slot.applyBackground(bgConfig);
    }
  }

  applyAllSlotsGrid(gridConfig) {
    if (!gridConfig) return;
    if (this.store.chartController && typeof this.store.chartController.applyGrid === 'function') {
      this.store.chartController.applyGrid(gridConfig);
    }
    for (const slot of this.slots.values()) {
      slot.applyGrid(gridConfig);
    }
  }

  initSplitters() {
    let container = document.getElementById('gridSplitterContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'gridSplitterContainer';
      container.className = 'grid-splitter-container';
      if (this.wrapperEl && this.wrapperEl.parentNode) {
        this.wrapperEl.parentNode.insertBefore(container, this.wrapperEl.nextSibling);
      }
    }
    this.splitterContainer = container;
  }

  loadProportions() {
    const defaults = {
      '1x2': { colRatio: 0.5 },
      '2x1': { rowRatio: 0.5 },
      '2x2': { colRatio: 0.5, rowRatio: 0.5 }
    };
    try {
      const saved = localStorage.getItem('trading_simulator_grid_proportions');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          '1x2': { ...defaults['1x2'], ...(parsed['1x2'] || {}) },
          '2x1': { ...defaults['2x1'], ...(parsed['2x1'] || {}) },
          '2x2': { ...defaults['2x2'], ...(parsed['2x2'] || {}) }
        };
      }
    } catch (e) {
      console.warn('[MultiChart] Failed to load grid proportions:', e);
    }
    return defaults;
  }

  saveProportions() {
    try {
      localStorage.setItem('trading_simulator_grid_proportions', JSON.stringify(this.proportions));
    } catch (e) {
      console.warn('[MultiChart] Failed to save grid proportions:', e);
    }
  }

  applyCurrentProportions() {
    this.updateSplitters(this.currentLayout);
  }

  forceResizeAllCharts() {
    const chartEl = document.getElementById('chart');
    if (chartEl && this.store.chart) {
      this.store.chart.applySize(chartEl.clientWidth, chartEl.clientHeight);
    }
    for (const slot of this.slots.values()) {
      if (slot.chart && slot.bodyEl) {
        slot.chart.applySize(slot.bodyEl.clientWidth, slot.bodyEl.clientHeight);
      }
    }
  }

  updateSplitters(layout = this.currentLayout) {
    if (!this.splitterContainer) {
      this.initSplitters();
    }
    if (!this.splitterContainer || !this.wrapperEl) return;

    this.splitterContainer.innerHTML = '';

    if (layout === '1x1') {
      this.wrapperEl.style.gridTemplateColumns = '';
      this.wrapperEl.style.gridTemplateRows = '';
      return;
    }

    if (layout === '1x2') {
      const prop = this.proportions['1x2'] || { colRatio: 0.5 };
      const colRatio = Math.max(0.15, Math.min(0.85, prop.colRatio ?? 0.5));
      this.proportions['1x2'].colRatio = colRatio;

      this.wrapperEl.style.gridTemplateColumns = `${colRatio}fr ${1 - colRatio}fr`;
      this.wrapperEl.style.gridTemplateRows = '1fr';

      const splitter = document.createElement('div');
      splitter.className = 'grid-splitter splitter-vertical';
      splitter.title = 'Перетащите для изменения пропорции (двойной клик — 50/50)';
      splitter.style.left = `${colRatio * 100}%`;
      splitter.innerHTML = '<div class="splitter-line"></div>';

      let isDragging = false;
      splitter.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        isDragging = true;
        splitter.setPointerCapture(e.pointerId);
        splitter.classList.add('active');
        document.body.classList.add('is-resizing-grid');
        document.body.style.cursor = 'col-resize';
      });

      splitter.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const rect = this.wrapperEl.getBoundingClientRect();
        if (rect.width <= 0) return;
        let ratio = (e.clientX - rect.left) / rect.width;
        const minRatio = Math.max(0.15, 120 / rect.width);
        const maxRatio = Math.min(0.85, 1 - (120 / rect.width));
        ratio = Math.max(minRatio, Math.min(maxRatio, ratio));

        this.proportions['1x2'].colRatio = ratio;
        this.wrapperEl.style.gridTemplateColumns = `${ratio}fr ${1 - ratio}fr`;
        splitter.style.left = `${ratio * 100}%`;
      });

      const onStopDrag = (e) => {
        if (!isDragging) return;
        isDragging = false;
        try { splitter.releasePointerCapture(e.pointerId); } catch (err) {}
        splitter.classList.remove('active');
        document.body.classList.remove('is-resizing-grid');
        document.body.style.cursor = '';
        this.saveProportions();
        this.forceResizeAllCharts();
      };

      splitter.addEventListener('pointerup', onStopDrag);
      splitter.addEventListener('pointercancel', onStopDrag);

      splitter.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.proportions['1x2'].colRatio = 0.5;
        this.wrapperEl.style.gridTemplateColumns = '1fr 1fr';
        splitter.style.left = '50%';
        this.saveProportions();
        this.forceResizeAllCharts();
      });

      this.splitterContainer.appendChild(splitter);
    } else if (layout === '2x1') {
      const prop = this.proportions['2x1'] || { rowRatio: 0.5 };
      const rowRatio = Math.max(0.15, Math.min(0.85, prop.rowRatio ?? 0.5));
      this.proportions['2x1'].rowRatio = rowRatio;

      this.wrapperEl.style.gridTemplateColumns = '1fr';
      this.wrapperEl.style.gridTemplateRows = `${rowRatio}fr ${1 - rowRatio}fr`;

      const splitter = document.createElement('div');
      splitter.className = 'grid-splitter splitter-horizontal';
      splitter.title = 'Перетащите для изменения пропорции (двойной клик — 50/50)';
      splitter.style.top = `${rowRatio * 100}%`;
      splitter.innerHTML = '<div class="splitter-line"></div>';

      let isDragging = false;
      splitter.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        isDragging = true;
        splitter.setPointerCapture(e.pointerId);
        splitter.classList.add('active');
        document.body.classList.add('is-resizing-grid');
        document.body.style.cursor = 'row-resize';
      });

      splitter.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const rect = this.wrapperEl.getBoundingClientRect();
        if (rect.height <= 0) return;
        let ratio = (e.clientY - rect.top) / rect.height;
        const minRatio = Math.max(0.15, 100 / rect.height);
        const maxRatio = Math.min(0.85, 1 - (100 / rect.height));
        ratio = Math.max(minRatio, Math.min(maxRatio, ratio));

        this.proportions['2x1'].rowRatio = ratio;
        this.wrapperEl.style.gridTemplateRows = `${ratio}fr ${1 - ratio}fr`;
        splitter.style.top = `${ratio * 100}%`;
      });

      const onStopDrag = (e) => {
        if (!isDragging) return;
        isDragging = false;
        try { splitter.releasePointerCapture(e.pointerId); } catch (err) {}
        splitter.classList.remove('active');
        document.body.classList.remove('is-resizing-grid');
        document.body.style.cursor = '';
        this.saveProportions();
        this.forceResizeAllCharts();
      };

      splitter.addEventListener('pointerup', onStopDrag);
      splitter.addEventListener('pointercancel', onStopDrag);

      splitter.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.proportions['2x1'].rowRatio = 0.5;
        this.wrapperEl.style.gridTemplateRows = '1fr 1fr';
        splitter.style.top = '50%';
        this.saveProportions();
        this.forceResizeAllCharts();
      });

      this.splitterContainer.appendChild(splitter);
    } else if (layout === '2x2') {
      const prop = this.proportions['2x2'] || { colRatio: 0.5, rowRatio: 0.5 };
      let colRatio = Math.max(0.15, Math.min(0.85, prop.colRatio ?? 0.5));
      let rowRatio = Math.max(0.15, Math.min(0.85, prop.rowRatio ?? 0.5));
      this.proportions['2x2'].colRatio = colRatio;
      this.proportions['2x2'].rowRatio = rowRatio;

      this.wrapperEl.style.gridTemplateColumns = `${colRatio}fr ${1 - colRatio}fr`;
      this.wrapperEl.style.gridTemplateRows = `${rowRatio}fr ${1 - rowRatio}fr`;

      // 1. Vertical splitter
      const splitterVert = document.createElement('div');
      splitterVert.className = 'grid-splitter splitter-vertical';
      splitterVert.title = 'Перетащите по горизонтали (двойной клик — 50/50)';
      splitterVert.style.left = `${colRatio * 100}%`;
      splitterVert.innerHTML = '<div class="splitter-line"></div>';

      // 2. Horizontal splitter
      const splitterHorz = document.createElement('div');
      splitterHorz.className = 'grid-splitter splitter-horizontal';
      splitterHorz.title = 'Перетащите по вертикали (двойной клик — 50/50)';
      splitterHorz.style.top = `${rowRatio * 100}%`;
      splitterHorz.innerHTML = '<div class="splitter-line"></div>';

      // 3. Central intersection handle
      const centerHandle = document.createElement('div');
      centerHandle.className = 'grid-splitter-center';
      centerHandle.title = 'Перетащите для изменения размеров по двум осям (двойной клик — 50/50)';
      centerHandle.style.left = `${colRatio * 100}%`;
      centerHandle.style.top = `${rowRatio * 100}%`;
      centerHandle.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="5 9 2 12 5 15"></polyline>
          <polyline points="9 5 12 2 15 5"></polyline>
          <polyline points="15 19 12 22 9 19"></polyline>
          <polyline points="19 9 22 12 19 15"></polyline>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <line x1="12" y1="2" x2="12" y2="22"></line>
        </svg>
      `;

      // Vertical splitter dragging
      let isDraggingVert = false;
      splitterVert.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        isDraggingVert = true;
        splitterVert.setPointerCapture(e.pointerId);
        splitterVert.classList.add('active');
        document.body.classList.add('is-resizing-grid');
        document.body.style.cursor = 'col-resize';
      });

      splitterVert.addEventListener('pointermove', (e) => {
        if (!isDraggingVert) return;
        const rect = this.wrapperEl.getBoundingClientRect();
        if (rect.width <= 0) return;
        let cRatio = (e.clientX - rect.left) / rect.width;
        const minRatio = Math.max(0.15, 120 / rect.width);
        const maxRatio = Math.min(0.85, 1 - (120 / rect.width));
        cRatio = Math.max(minRatio, Math.min(maxRatio, cRatio));

        this.proportions['2x2'].colRatio = cRatio;
        this.wrapperEl.style.gridTemplateColumns = `${cRatio}fr ${1 - cRatio}fr`;
        splitterVert.style.left = `${cRatio * 100}%`;
        centerHandle.style.left = `${cRatio * 100}%`;
      });

      const onStopDragVert = (e) => {
        if (!isDraggingVert) return;
        isDraggingVert = false;
        try { splitterVert.releasePointerCapture(e.pointerId); } catch (err) {}
        splitterVert.classList.remove('active');
        document.body.classList.remove('is-resizing-grid');
        document.body.style.cursor = '';
        this.saveProportions();
        this.forceResizeAllCharts();
      };
      splitterVert.addEventListener('pointerup', onStopDragVert);
      splitterVert.addEventListener('pointercancel', onStopDragVert);

      splitterVert.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.proportions['2x2'].colRatio = 0.5;
        this.wrapperEl.style.gridTemplateColumns = '1fr 1fr';
        splitterVert.style.left = '50%';
        centerHandle.style.left = '50%';
        this.saveProportions();
        this.forceResizeAllCharts();
      });

      // Horizontal splitter dragging
      let isDraggingHorz = false;
      splitterHorz.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        isDraggingHorz = true;
        splitterHorz.setPointerCapture(e.pointerId);
        splitterHorz.classList.add('active');
        document.body.classList.add('is-resizing-grid');
        document.body.style.cursor = 'row-resize';
      });

      splitterHorz.addEventListener('pointermove', (e) => {
        if (!isDraggingHorz) return;
        const rect = this.wrapperEl.getBoundingClientRect();
        if (rect.height <= 0) return;
        let rRatio = (e.clientY - rect.top) / rect.height;
        const minRatio = Math.max(0.15, 100 / rect.height);
        const maxRatio = Math.min(0.85, 1 - (100 / rect.height));
        rRatio = Math.max(minRatio, Math.min(maxRatio, rRatio));

        this.proportions['2x2'].rowRatio = rRatio;
        this.wrapperEl.style.gridTemplateRows = `${rRatio}fr ${1 - rRatio}fr`;
        splitterHorz.style.top = `${rRatio * 100}%`;
        centerHandle.style.top = `${rRatio * 100}%`;
      });

      const onStopDragHorz = (e) => {
        if (!isDraggingHorz) return;
        isDraggingHorz = false;
        try { splitterHorz.releasePointerCapture(e.pointerId); } catch (err) {}
        splitterHorz.classList.remove('active');
        document.body.classList.remove('is-resizing-grid');
        document.body.style.cursor = '';
        this.saveProportions();
        this.forceResizeAllCharts();
      };
      splitterHorz.addEventListener('pointerup', onStopDragHorz);
      splitterHorz.addEventListener('pointercancel', onStopDragHorz);

      splitterHorz.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.proportions['2x2'].rowRatio = 0.5;
        this.wrapperEl.style.gridTemplateRows = '1fr 1fr';
        splitterHorz.style.top = '50%';
        centerHandle.style.top = '50%';
        this.saveProportions();
        this.forceResizeAllCharts();
      });

      // Center handle dragging (2-axis simultaneous)
      let isDraggingCenter = false;
      centerHandle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        isDraggingCenter = true;
        centerHandle.setPointerCapture(e.pointerId);
        centerHandle.classList.add('active');
        splitterVert.classList.add('active');
        splitterHorz.classList.add('active');
        document.body.classList.add('is-resizing-grid');
        document.body.style.cursor = 'move';
      });

      centerHandle.addEventListener('pointermove', (e) => {
        if (!isDraggingCenter) return;
        const rect = this.wrapperEl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        let cRatio = (e.clientX - rect.left) / rect.width;
        const minCRatio = Math.max(0.15, 120 / rect.width);
        const maxCRatio = Math.min(0.85, 1 - (120 / rect.width));
        cRatio = Math.max(minCRatio, Math.min(maxCRatio, cRatio));

        let rRatio = (e.clientY - rect.top) / rect.height;
        const minRRatio = Math.max(0.15, 100 / rect.height);
        const maxRRatio = Math.min(0.85, 1 - (100 / rect.height));
        rRatio = Math.max(minRRatio, Math.min(maxRRatio, rRatio));

        this.proportions['2x2'].colRatio = cRatio;
        this.proportions['2x2'].rowRatio = rRatio;

        this.wrapperEl.style.gridTemplateColumns = `${cRatio}fr ${1 - cRatio}fr`;
        this.wrapperEl.style.gridTemplateRows = `${rRatio}fr ${1 - rRatio}fr`;

        splitterVert.style.left = `${cRatio * 100}%`;
        splitterHorz.style.top = `${rRatio * 100}%`;
        centerHandle.style.left = `${cRatio * 100}%`;
        centerHandle.style.top = `${rRatio * 100}%`;
      });

      const onStopDragCenter = (e) => {
        if (!isDraggingCenter) return;
        isDraggingCenter = false;
        try { centerHandle.releasePointerCapture(e.pointerId); } catch (err) {}
        centerHandle.classList.remove('active');
        splitterVert.classList.remove('active');
        splitterHorz.classList.remove('active');
        document.body.classList.remove('is-resizing-grid');
        document.body.style.cursor = '';
        this.saveProportions();
        this.forceResizeAllCharts();
      };
      centerHandle.addEventListener('pointerup', onStopDragCenter);
      centerHandle.addEventListener('pointercancel', onStopDragCenter);

      centerHandle.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.proportions['2x2'].colRatio = 0.5;
        this.proportions['2x2'].rowRatio = 0.5;
        this.wrapperEl.style.gridTemplateColumns = '1fr 1fr';
        this.wrapperEl.style.gridTemplateRows = '1fr 1fr';
        splitterVert.style.left = '50%';
        splitterHorz.style.top = '50%';
        centerHandle.style.left = '50%';
        centerHandle.style.top = '50%';
        this.saveProportions();
        this.forceResizeAllCharts();
      });

      this.splitterContainer.appendChild(splitterVert);
      this.splitterContainer.appendChild(splitterHorz);
      this.splitterContainer.appendChild(centerHandle);
    }
  }

  renderAllSessionBreaks() {
    if (this.store.sessionBreaksOverlay && typeof this.store.sessionBreaksOverlay.render === 'function') {
      this.store.sessionBreaksOverlay.render();
    }
    for (const slot of this.slots.values()) {
      if (slot.sessionBreaksOverlay && typeof slot.sessionBreaksOverlay.render === 'function') {
        slot.sessionBreaksOverlay.render();
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
        symbol: slot.symbol,
        chartType: slot.chartType
      });
    }

    return {
      layout: this.currentLayout,
      syncCrosshair: this.syncCrosshair,
      syncSymbol: this.syncSymbol,
      syncTime: this.syncTime,
      syncDrawings: this.syncDrawings,
      syncChartType: this.syncChartType,
      proportions: JSON.parse(JSON.stringify(this.proportions)),
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

    if (state.syncChartType !== undefined) {
      this.syncChartType = !!state.syncChartType;
      const cb = document.getElementById('syncChartTypeCheckbox');
      if (cb) cb.checked = this.syncChartType;
    }

    if (state.proportions) {
      this.proportions = { ...this.proportions, ...state.proportions };
      this.saveProportions();
    }

    if (state.layout && state.layout !== this.currentLayout) {
      this.setLayout(state.layout);
    } else if (state.layout) {
      this.updateSplitters(state.layout);
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
          if (slotData.chartType && slotData.chartType !== slot.chartType) {
            slot.setChartType(slotData.chartType);
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

// components/chart-controller.js - Chart Controller Component (OpenAlgo & Lightweight Charts)
import { eventBus } from '../core/event-bus.js';
import { API } from '../api.js';
import { marketDataService } from '../services/market-data.service.js';
import { showToast, formatTimestamp, binarySearchCandleExact } from '../core/utils.js';

export const DEFAULT_VOLUME_COLORS = {
  upColor: 'rgba(8, 153, 129, 0.45)',
  downColor: 'rgba(242, 54, 69, 0.45)'
};

export class ChartControllerComponent {
  constructor(store) {
    this.store = store;

    this.chartEl = document.getElementById('chart');
    this.chartContainer = this.chartEl ? this.chartEl.parentElement : null;

    // Legend DOM elements
    this.legendSymbol = document.getElementById('legendSymbol');
    this.legendTF = document.getElementById('legendTF');
    this.valOpen = document.getElementById('valOpen');
    this.valHigh = document.getElementById('valHigh');
    this.valLow = document.getElementById('valLow');
    this.valClose = document.getElementById('valClose');
    this.valChange = document.getElementById('valChange');
    this.valVolume = document.getElementById('valVolume');

    this.chart = null;
    this.mainSeries = null;
    this.drawingController = null;
    this.tradeController = null;
    this.markersLayer = null;

    this.init();
  }

  applySavedSeriesStyle(type) {
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
      console.warn('[ChartController] Failed to apply saved series style:', e);
    }
  }

  init() {
    if (!this.chartEl || !window.OpenAlgoCharts) return;

    try {
      const appearanceConfig = this.store.get('chartAppearanceConfig');
      let initialBg = '#131722';
      let initialGrid = '#1e222d';
      if (appearanceConfig?.background) {
        if (appearanceConfig.background.type === 'gradient') {
          initialBg = 'transparent';
          const g1 = appearanceConfig.background.gradientColor1 || '#1e222d';
          const g2 = appearanceConfig.background.gradientColor2 || '#131722';
          this.chartEl.style.background = `linear-gradient(to bottom, ${g1}, ${g2})`;
        } else {
          initialBg = appearanceConfig.background.color || '#131722';
          this.chartEl.style.background = initialBg;
        }
      }
      if (appearanceConfig?.grid?.vertColor) {
        initialGrid = appearanceConfig.grid.vertColor;
      }

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

      this.chart = OpenAlgoCharts.createChart(this.chartEl, {
        theme: chartTheme,
        timezone: 'Europe/Moscow',
        watermark: false,
        branding: false,
        axisChrome: { sessionClock: true, barCountdown: false },
        doubleClick: 'none',
        legendOffset: { top: 90, left: 18 }
      });

      this.chart._doubleClick = 'none';
      if (typeof this.chart.on === 'function') {
        this.chart.on('dblclick', (e) => {
          // Mark handled so native OpenAlgo resetScale() is never called on double-click
          const dc = this.store.drawingController;
          if (!dc || !dc.activeTool()) {
            if (e) e.handled = true;
          }
        });
      }

      this.store.chart = this.chart;

      // Apply appearance settings (grid lines, styles, background)
      if (appearanceConfig) {
        this.applyAppearance(appearanceConfig);
      }
      eventBus.on('state:chartAppearanceConfig', (cfg) => this.applyAppearance(cfg));

      // Instant point placement on pointerdown for multi-point path & polyline tools (TradingView style)
      if (this.chart._input && typeof this.chart._input._onPointerDown === 'function') {
        const origOnPointerDown = this.chart._input._onPointerDown;
        const self = this;
        this.chart._input._onPointerDown = function(e) {
          origOnPointerDown.call(this, e);
          const dc = self.drawingController || self.store.drawingController;
          if (dc && (dc.activeTool() === 'path' || dc.activeTool() === 'polyline') && ("mouse" !== e.pointerType && "pen" !== e.pointerType || 0 === e.button)) {
            const t = typeof this._localPoint === 'function' ? this._localPoint(e) : null;
            if (t && Number.isFinite(t.x) && Number.isFinite(t.localY)) {
              const price = typeof this._priceAt === 'function' ? this._priceAt(t.pane, t.localY) : null;
              const time = typeof this._host?._xToTime === 'function' ? this._host._xToTime(t.x) : null;
              if (Number.isFinite(price) && Number.isFinite(time)) {
                this._host._emit("click", {
                  id: null,
                  price,
                  time,
                  paneIndex: t.pane,
                  point: { x: t.x, y: t.localY },
                  fromPointerDown: true
                });
              }
            }
          }
        };
      }

      // Add primary candlestick series
      this.mainSeries = this.chart.addSeries('candlestick', {
        upColor: '#089981',
        downColor: '#f23645',
        wickUpColor: '#089981',
        wickDownColor: '#f23645',
        borderUpColor: '#089981',
        borderDownColor: '#f23645'
      });

      this.store.mainSeries = this.mainSeries;

      // Apply initial saved chart type if not default candlestick
      const initialChartType = this.store.get('currentChartType') || 'candlestick';
      if (initialChartType !== 'candlestick' && typeof this.chart.setSeriesType === 'function') {
        try {
          this.chart.setSeriesType(this.mainSeries, initialChartType);
        } catch (err) {
          console.warn('[ChartController] Failed to set initial series type:', err);
        }
      }
      this.applySavedSeriesStyle(initialChartType);

      // Markers layer for trade entry/exit arrows
      if (this.mainSeries && typeof this.mainSeries.createMarkers === 'function') {
        try {
          this.markersLayer = this.mainSeries.createMarkers();
        } catch (err) {
          console.warn('Could not initialize markersLayer:', err);
        }
      }

      // Initialize OpenAlgo DrawingController
      if (OpenAlgoCharts.draw && OpenAlgoCharts.draw.DrawingController) {
        const isMagnetActive = !!this.store.get('isMagnetActive');
        this.drawingController = new OpenAlgoCharts.draw.DrawingController(this.chart, {
          magnet: isMagnetActive ? 'weak' : 'off'
        });
        this.store.drawingController = this.drawingController;

        // Points for path & polyline are placed instantly on pointerdown (TradingView style);
        // ignore subsequent clicks originating from pointerup/drag-release
        const origOnClick = this.drawingController._onClick;
        if (typeof origOnClick === 'function') {
          this.drawingController._onClick = function(t) {
            if (this._tool === 'path' || this._tool === 'polyline') {
              if (!t || !t.fromPointerDown) {
                return;
              }
            }
            return origOnClick.call(this, t);
          };
        }

        // Auto-save drawings on any change
        ['drawing:change', 'draw:add', 'draw:update', 'draw:remove'].forEach(evt => {
          if (typeof this.drawingController.on === 'function') {
            this.drawingController.on(evt, () => {
              eventBus.emit('drawings:change');
            });
          }
        });
      }

      // Note: OpenAlgo TradeController canvas lines are replaced by the interactive HTML
      // drag-and-drop TradeLinesOverlayComponent which provides real-time dragging,
      // risk/reward calculation badges, and direct SL/TP manipulation.
      this.tradeController = null;

      // Crosshair move handler
      this.chart.subscribeCrosshairMove((param) => {
        if (!param || !param.time) {
          this.updateLegendToLatest();
        } else {
          const sim = this.store.simulator;
          if (sim && sim.allCandles) {
            const bar = binarySearchCandleExact(sim.allCandles, param.time);
            if (bar) {
              this.updateLegend(bar);
            }
          }
        }
      });

      // Chart click handler (jump bar selection & on-chart close actions)
      this.chart.subscribeClick((param) => {
        if (this.store.fsm && !this.store.fsm.canHandleChartClick()) return;
        if (this.handleJumpBarClick(param)) return;
        this.handleChartClickAction(param);
      });

      // Direct DOM click listener for jump bar selection to guarantee 100% responsiveness
      if (this.chartEl) {
        this.chartEl.addEventListener('click', (e) => {
          const isSelecting = this.store.fsm ? this.store.fsm.isSelectingJumpBar() : this.store.get('isSelectingJumpBar');
          if (isSelecting) {
            this.handleJumpBarClick(null, e);
          }
        }, true);
      }

      // Trading and viewport events on chart
      if (typeof this.chart.on === 'function') {
        this.chart.on('click', (param) => {
          if (this.store.fsm && !this.store.fsm.canHandleChartClick()) return;
          if (this.handleJumpBarClick(param)) return;
          this.handleChartClickAction(param);
        });
        this.chart.on('zoom', () => eventBus.emit('chart:zoom'));

        this.chart.on('trading:order_cancel', (e) => {
          if (e && e.orderId) {
            this.handleCancelOrder(e.orderId, 'С графика');
          }
        });

        this.chart.on('trading:order_modify', (e) => {
          if (e && e.orderId && e.price && this.store.paperAccount) {
            this.store.paperAccount.modifyOrder(e.orderId, e.price);
            showToast(`Заявка изменена: цена ${e.price.toFixed(2)} ₽`, 'info');
          }
        });

        this.chart.on('trading:position_close', (e) => {
          if (e && e.positionId) {
            this.handleClosePosition(e.positionId, 'С графика');
          }
        });
      }

      // Infinite History Loader
      this.chart.setHistoryLoader(async () => {
        eventBus.emit('chart:loading', true, { fullReset: false });
        try {
          const sim = this.store.simulator;
          const oldest = sim && sim.allCandles ? sim.allCandles[0]?.time : null;
          if (!oldest) {
            this.chart.historyLoadComplete();
            return;
          }

          const data = await marketDataService.getCandles(this.store.get('currentSymbol'), this.store.get('currentFigi'), this.store.get('currentTimeframe'), 500, oldest - 1);
          if (data && data.candles && data.candles.length > 0) {
            const before = this.chart.getVisibleLogicalRange();
            const inserted = sim.prependHistory(data.candles);

            if (inserted > 0 && this.mainSeries) {
              this.mainSeries.setData(sim.getVisibleCandles());
              if (before) {
                this.chart.setVisibleLogicalRange({
                  from: before.from + inserted,
                  to: before.to + inserted
                });
              }
            }
          }
        } catch (err) {
          console.error('History loader error:', err);
        } finally {
          this.chart.historyLoadComplete();
          eventBus.emit('chart:loading', false);
        }
      });

      // Auto-resize on window resize or panel layout changes
      const handleResize = () => {
        if (this.chart && this.chartEl) {
          const w = this.chartEl.clientWidth;
          const h = this.chartEl.clientHeight;
          if (w > 0 && h > 0) {
            this.chart.applySize(w, h);
          }
        }
        this.syncIndicatorLegendOffset();
      };

      window.addEventListener('resize', handleResize);

      if (window.ResizeObserver && this.chartEl) {
        this.resizeObserver = new ResizeObserver(() => handleResize());
        this.resizeObserver.observe(this.chartEl);
      }

      // Initial alignment of indicator legends below BUY/SELL quick trading widget
      setTimeout(() => this.syncIndicatorLegendOffset(), 100);

      // Configure OpenAlgo volume indicator to render on-chart at bottom (TradingView style)
      this.configureVolumeIndicatorDescriptor();
      const savedShowVolume = localStorage.getItem('trading_simulator_show_volume') === 'true';
      if (savedShowVolume) {
        setTimeout(() => this.enableOnChartVolume(), 200);
      }

      eventBus.on('bar:tick', (bar) => {
        this.updateLegend(bar);
        this.syncTradeOverlays(bar.close);
      });

      eventBus.on('account:update', () => {
        const sim = this.store.simulator;
        const cur = sim ? sim.getCurrentBar() : null;
        if (cur) this.syncTradeOverlays(cur.close);
      });

      eventBus.on('chart:reset_state_preserving_zoom', (offset = 12) => {
        this.resetStatePreservingZoom(offset);
      });

      eventBus.on('chart:reset_state_for_new_instrument', ({ rightOffset = 12, barSpacing = 7.5 } = {}) => {
        this.resetStateForNewInstrument(rightOffset, barSpacing);
      });

    } catch (err) {
      console.error('Failed to initialize OpenAlgo Charts:', err);
    }
  }

  /**
   * Reset chart vertical price scale state (autoscale on, ratio locks off)
   * while strictly preserving current horizontal zoom (barSpacing) and
   * aligning the selected candle with a standard TradingView right-edge offset.
   */
  resetStatePreservingZoom(rightOffset = 12) {
    if (!this.chart) return;
    const ts = this.chart._timeScale || (typeof this.chart.timeScale === 'function' ? this.chart.timeScale() : this.chart.timeScale);
    const preservedSpacing = ts ? ts.barSpacing : null;

    // 1. Reset vertical price scales to AutoScale and clear manual stretch/ratio locks
    if (Array.isArray(this.chart._panes)) {
      for (const pane of this.chart._panes) {
        if (typeof pane.clearRatioLocks === 'function') pane.clearRatioLocks();
        const scales = typeof pane.scales === 'function' ? pane.scales() : [];
        for (const scale of scales) {
          if (typeof scale.setAutoScale === 'function') scale.setAutoScale(true);
        }
      }
    }
    if (typeof this.chart.setAutoScale === 'function') {
      this.chart.setAutoScale(true);
    }

    // 2. Position selected candle at right with TradingView offset, preserving horizontal zoom
    if (ts) {
      if (typeof ts.setRightOffset === 'function') {
        ts.setRightOffset(rightOffset);
      }
      if (preservedSpacing && typeof ts.setBarSpacing === 'function') {
        ts.setBarSpacing(preservedSpacing);
      }
    }

    // 3. Invalidate and repaint canvas
    if (typeof this.chart.invalidate === 'function') {
      this.chart.invalidate(e => e.invalidateGlobal(3));
    }

    // 4. Synchronize trade markers and lines overlays
    if (this.store.tradeExecutionsOverlay) {
      this.store.tradeExecutionsOverlay.render();
    }
    if (this.store.tradeLinesOverlay) {
      this.store.tradeLinesOverlay.scheduleRender();
    }
  }

  /**
   * Reset chart vertical price scale state (autoscale on, ratio locks off)
   * and apply standard TradingView horizontal zoom (~7.5 px per bar)
   * with a 12-bar right-edge offset when switching instruments.
   */
  resetStateForNewInstrument(rightOffset = 12, defaultBarSpacing = 7.5) {
    if (!this.chart) return;
    const ts = this.chart._timeScale || (typeof this.chart.timeScale === 'function' ? this.chart.timeScale() : this.chart.timeScale);

    // 1. Reset vertical price scales to AutoScale and clear manual stretch/ratio locks
    if (Array.isArray(this.chart._panes)) {
      for (const pane of this.chart._panes) {
        if (typeof pane.clearRatioLocks === 'function') pane.clearRatioLocks();
        const scales = typeof pane.scales === 'function' ? pane.scales() : [];
        for (const scale of scales) {
          if (typeof scale.setAutoScale === 'function') scale.setAutoScale(true);
        }
      }
    }
    if (typeof this.chart.setAutoScale === 'function') {
      this.chart.setAutoScale(true);
    }

    // 2. Position latest candle at right with TradingView offset (12 bars) and standard zoom (~7.5 px)
    if (ts) {
      if (typeof ts.setRightOffset === 'function') {
        ts.setRightOffset(rightOffset);
      }
      if (typeof ts.setBarSpacing === 'function') {
        ts.setBarSpacing(defaultBarSpacing);
      }
    }

    // 3. Invalidate and repaint canvas
    if (typeof this.chart.invalidate === 'function') {
      this.chart.invalidate(e => e.invalidateGlobal(3));
    }

    // 4. Synchronize all on-chart overlays
    this.syncAllOverlays();
  }

  resetFullChartScale() {
    if (!this.chart) return;
    this.resetStateForNewInstrument(12, 7.5);
    showToast('Состояние графика сброшено (Alt+R)', 'info');
  }

  resetTimeScale(rightOffset = 12, defaultBarSpacing = 7.5) {
    if (!this.chart) return;
    const ts = this.chart._timeScale || (typeof this.chart.timeScale === 'function' ? this.chart.timeScale() : this.chart.timeScale);
    if (ts) {
      if (typeof ts.setRightOffset === 'function') ts.setRightOffset(rightOffset);
      if (typeof ts.setBarSpacing === 'function') ts.setBarSpacing(defaultBarSpacing);
    }
    if (typeof this.chart.invalidate === 'function') {
      this.chart.invalidate(e => e.invalidateGlobal(3));
    }
    this.syncAllOverlays();
    showToast('Масштаб временной шкалы сброшен', 'info');
  }

  resetPriceScale() {
    if (!this.chart) return;
    if (Array.isArray(this.chart._panes)) {
      for (const pane of this.chart._panes) {
        if (typeof pane.clearRatioLocks === 'function') pane.clearRatioLocks();
        const scales = typeof pane.scales === 'function' ? pane.scales() : [];
        for (const scale of scales) {
          if (typeof scale.setAutoScale === 'function') scale.setAutoScale(true);
        }
      }
    }
    if (typeof this.chart.setAutoScale === 'function') {
      this.chart.setAutoScale(true);
    }
    if (typeof this.chart.invalidate === 'function') {
      this.chart.invalidate(e => e.invalidateGlobal(3));
    }
    this.syncAllOverlays();
    showToast('Масштаб ценовой шкалы сброшен', 'info');
  }

  isPriceAutoScaleEnabled() {
    if (!this.chart) return true;
    if (Array.isArray(this.chart._panes) && this.chart._panes[0]) {
      const scales = typeof this.chart._panes[0].scales === 'function' ? this.chart._panes[0].scales() : [];
      if (scales[0] && typeof scales[0].autoScale === 'function') {
        return scales[0].autoScale();
      }
      if (scales[0] && scales[0]._autoScale !== undefined) {
        return !!scales[0]._autoScale;
      }
    }
    return true;
  }

  togglePriceAutoScale() {
    if (!this.chart) return true;
    const current = this.isPriceAutoScaleEnabled();
    const next = !current;
    if (Array.isArray(this.chart._panes)) {
      for (const pane of this.chart._panes) {
        if (next && typeof pane.clearRatioLocks === 'function') pane.clearRatioLocks();
        const scales = typeof pane.scales === 'function' ? pane.scales() : [];
        for (const scale of scales) {
          if (typeof scale.setAutoScale === 'function') scale.setAutoScale(next);
        }
      }
    }
    if (typeof this.chart.setAutoScale === 'function') {
      this.chart.setAutoScale(next);
    }
    if (typeof this.chart.invalidate === 'function') {
      this.chart.invalidate(e => e.invalidateGlobal(3));
    }
    this.syncAllOverlays();
    showToast(next ? 'Авто-масштаб ценовой шкалы включен' : 'Авто-масштаб ценовой шкалы выключен', 'info');
    return next;
  }

  syncAllOverlays() {
    if (this.store.tradeExecutionsOverlay) {
      this.store.tradeExecutionsOverlay.render();
    }
    if (this.store.tradeLinesOverlay) {
      this.store.tradeLinesOverlay.scheduleRender();
    }
    if (this.store.sessionBreaksOverlay) {
      this.store.sessionBreaksOverlay.scheduleRender();
    }
    this.applyVolumeScaleMargins();
  }

  getVolumeColors() {
    try {
      const raw = localStorage.getItem('trading_simulator_volume_colors');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return {
            upColor: parsed.upColor || DEFAULT_VOLUME_COLORS.upColor,
            downColor: parsed.downColor || DEFAULT_VOLUME_COLORS.downColor
          };
        }
      }
    } catch (e) {
      console.warn('[ChartController] Failed to parse volume colors:', e);
    }
    return { ...DEFAULT_VOLUME_COLORS };
  }

  saveVolumeColors(colors) {
    if (!colors || typeof colors !== 'object') return;
    const finalColors = {
      upColor: colors.upColor || DEFAULT_VOLUME_COLORS.upColor,
      downColor: colors.downColor || DEFAULT_VOLUME_COLORS.downColor
    };
    try {
      localStorage.setItem('trading_simulator_volume_colors', JSON.stringify(finalColors));
    } catch (e) {
      console.warn('[ChartController] Failed to save volume colors:', e);
    }
    this.applyVolumeColors(finalColors, false);
  }

  applyVolumeColors(colors, persist = false) {
    if (!colors) return;
    const finalColors = {
      upColor: colors.upColor || DEFAULT_VOLUME_COLORS.upColor,
      downColor: colors.downColor || DEFAULT_VOLUME_COLORS.downColor
    };

    if (persist) {
      this.saveVolumeColors(finalColors);
    }

    // 1. Update indicator descriptor defaults
    if (window.OpenAlgoCharts && typeof window.OpenAlgoCharts.registeredIndicators === 'function') {
      try {
        const registered = window.OpenAlgoCharts.registeredIndicators();
        const volDesc = registered.find(i => i.id === 'volume');
        if (volDesc && Array.isArray(volDesc.inputs)) {
          const upInp = volDesc.inputs.find(i => i.key === 'upColor');
          if (upInp) upInp.default = finalColors.upColor;
          const downInp = volDesc.inputs.find(i => i.key === 'downColor');
          if (downInp) downInp.default = finalColors.downColor;
        }
      } catch (err) {
        console.warn('[ChartController] Failed to update descriptor colors:', err);
      }
    }

    // 2. Apply to currently active indicator on chart
    const ind = this.getOnChartVolumeIndicator();
    if (ind) {
      try {
        const curSettings = typeof ind.settings === 'function' ? ind.settings() : {};
        if (typeof ind.setSettings === 'function') {
          ind.setSettings({
            ...curSettings,
            upColor: finalColors.upColor,
            downColor: finalColors.downColor
          });
        }
      } catch (err) {
        console.warn('[ChartController] Failed to apply colors to active volume indicator:', err);
      }
    }

    eventBus.emit('volume:colorsChanged', finalColors);
  }

  configureVolumeIndicatorDescriptor() {
    if (!window.OpenAlgoCharts || typeof window.OpenAlgoCharts.registeredIndicators !== 'function') return;
    try {
      const volColors = this.getVolumeColors();
      const registered = window.OpenAlgoCharts.registeredIndicators();
      const volDesc = registered.find(i => i.id === 'volume');
      if (volDesc) {
        volDesc.placement = 'onchart';
        if (Array.isArray(volDesc.plots) && volDesc.plots[0]) {
          volDesc.plots[0].priceScaleId = 'overlay:volume';
          volDesc.plots[0].overlay = true;
        }
        const colByDir = Array.isArray(volDesc.inputs) ? volDesc.inputs.find(i => i.key === 'colorByDirection') : null;
        if (colByDir) colByDir.default = true;
        const showMA = Array.isArray(volDesc.inputs) ? volDesc.inputs.find(i => i.key === 'showMA') : null;
        if (showMA) showMA.default = false;
        const upColor = Array.isArray(volDesc.inputs) ? volDesc.inputs.find(i => i.key === 'upColor') : null;
        if (upColor) upColor.default = volColors.upColor;
        const downColor = Array.isArray(volDesc.inputs) ? volDesc.inputs.find(i => i.key === 'downColor') : null;
        if (downColor) downColor.default = volColors.downColor;
      }
    } catch (e) {
      console.warn('[ChartController] Failed to configure volume descriptor:', e);
    }
  }

  getOnChartVolumeIndicator() {
    if (!this.chart || typeof this.chart.indicators !== 'function') return null;
    const inds = this.chart.indicators();
    return inds.find(i => i.id === 'volume' || (typeof i.id === 'string' && i.id.startsWith('volume-'))) || null;
  }

  isOnChartVolumeEnabled() {
    return !!this.getOnChartVolumeIndicator();
  }

  applyVolumeScaleMargins(ind) {
    const handle = ind || this.getOnChartVolumeIndicator();
    if (!handle || !handle._series) return;
    const volSeries = handle._series.get('volume');
    if (volSeries && typeof volSeries.priceScale === 'function') {
      const ps = volSeries.priceScale();
      if (ps && typeof ps.setOptions === 'function') {
        ps.setOptions({
          marginTop: 0.8,
          marginBottom: 0
        });
      }
    }
  }

  enableOnChartVolume() {
    if (!this.chart || typeof this.chart.addIndicator !== 'function') return null;
    this.configureVolumeIndicatorDescriptor();

    const existing = this.getOnChartVolumeIndicator();
    if (existing) {
      this.applyVolumeScaleMargins(existing);
      return existing;
    }

    try {
      const ind = this.chart.addIndicator('volume');
      setTimeout(() => {
        this.applyVolumeScaleMargins(ind);
        this.applyVolumeColors(this.getVolumeColors(), false);
        if (typeof this.chart.invalidate === 'function') {
          this.chart.invalidate(e => e.invalidateGlobal(3));
        }
      }, 50);

      this.store.set('showVolumeOnChart', true);
      localStorage.setItem('trading_simulator_show_volume', 'true');
      eventBus.emit('volume:toggle', true);
      this.syncIndicatorLegendOffset();
      return ind;
    } catch (err) {
      console.warn('[ChartController] Failed to add on-chart volume indicator:', err);
      return null;
    }
  }

  disableOnChartVolume() {
    if (!this.chart) return;
    const existing = this.getOnChartVolumeIndicator();
    if (existing) {
      try {
        if (typeof existing.remove === 'function') {
          existing.remove();
        } else if (typeof this.chart.removeIndicator === 'function') {
          this.chart.removeIndicator(existing.id || existing);
        }
      } catch (err) {
        console.warn('[ChartController] Failed to remove volume indicator:', err);
      }
    }
    this.store.set('showVolumeOnChart', false);
    localStorage.setItem('trading_simulator_show_volume', 'false');
    eventBus.emit('volume:toggle', false);
    this.syncIndicatorLegendOffset();
  }

  toggleOnChartVolume(forceState) {
    const next = forceState !== undefined ? !!forceState : !this.isOnChartVolumeEnabled();
    if (next) {
      this.enableOnChartVolume();
    } else {
      this.disableOnChartVolume();
    }
    return next;
  }

  /**
   * Keep technical indicators legend stack positioned below the BUY/SELL quick trading widget,
   * exactly mirroring TradingView's on-chart hierarchy.
   */
  syncIndicatorLegendOffset() {
    if (!this.chart || !this.chart._legendStack) return;
    const qtw = document.getElementById('chartQuickTradeWidget');
    let topOffset = 90;
    let leftOffset = 18;
    if (qtw && this.chartEl) {
      const qtwRect = qtw.getBoundingClientRect();
      const chartRect = this.chartEl.getBoundingClientRect();
      if (qtwRect.bottom > 0 && chartRect.top > 0) {
        topOffset = Math.round(qtwRect.bottom - chartRect.top + 8);
        leftOffset = Math.max(18, Math.round(qtwRect.left - chartRect.left));
      }
    }
    this.chart._legendStack._legendOffset = { top: topOffset, left: leftOffset };
    if (typeof this.chart._legendStack._syncLegendOffsets === 'function') {
      this.chart._legendStack._syncLegendOffsets();
    }
  }

  handleClosePosition(symbolOrId, source = 'Вручную') {
    const paperAccount = this.store.paperAccount;
    const simulator = this.store.simulator;
    if (!paperAccount) return false;

    const pos = paperAccount.positions.find(p => p.id === symbolOrId || p.symbol === symbolOrId);
    if (!pos) return false;

    const currentSymbol = this.store.get('currentSymbol');
    const bar = simulator ? simulator.getCurrentBar() : null;
    const price = (bar && pos.symbol === currentSymbol) ? bar.close : pos.currentPrice;
    const time = bar ? bar.time : Math.floor(Date.now() / 1000);
    const trade = paperAccount.closePosition(pos.id, price, time, source);
    if (trade) {
      showToast(`Позиция ${pos.symbol} (${pos.side === 'BUY' ? 'LONG' : 'SHORT'}) закрыта по ${price.toFixed(2)} ₽`, 'info');
      return true;
    }
    return false;
  }

  handleCancelOrder(orderId, source = 'Вручную') {
    const paperAccount = this.store.paperAccount;
    if (!paperAccount) return false;

    if (orderId && (orderId.endsWith('_sl') || orderId.endsWith('_tp'))) {
      const posId = orderId.replace(/_sl$|_tp$/, '');
      const pos = paperAccount.positions.find(p => p.id === posId || p.symbol === posId);
      if (pos) {
        if (orderId.endsWith('_sl')) {
          pos.sl = null;
          showToast(`Стоп-лосс для ${pos.symbol} отменен`, 'info');
        } else {
          pos.tp = null;
          showToast(`Тейк-профит для ${pos.symbol} отменен`, 'info');
        }
        paperAccount.notifyUpdate();
        return true;
      }
    }

    const order = paperAccount.orders.find(o => o.id === orderId);
    const ok = paperAccount.cancelOrder(orderId);
    if (ok) {
      const sideText = order ? (order.side === 'BUY' ? 'на покупку' : 'на продажу') : '';
      showToast(`Заявка ${sideText} отменена`, 'info');
      return true;
    }
    return false;
  }

  handleJumpBarClick(param, event = null) {
    const isSelecting = this.store.fsm ? this.store.fsm.isSelectingJumpBar() : this.store.get('isSelectingJumpBar');
    if (!isSelecting) return false;

    // Resolve time from param or event
    let targetTime = null;
    if (param && typeof param.time === 'number') {
      targetTime = param.time;
    } else if (param?.point?.x !== undefined) {
      if (typeof this.chart.coordinateToTime === 'function') {
        targetTime = this.chart.coordinateToTime(param.point.x);
      } else if (typeof this.chart._xToTime === 'function') {
        targetTime = this.chart._xToTime(param.point.x);
      }
    } else if (event && event.clientX !== undefined && this.chartEl) {
      const rect = this.chartEl.getBoundingClientRect();
      const x = event.clientX - rect.left;
      if (typeof this.chart.coordinateToTime === 'function') {
        targetTime = this.chart.coordinateToTime(x);
      } else if (typeof this.chart._xToTime === 'function') {
        targetTime = this.chart._xToTime(x);
      }
    }

    if (!targetTime) return false;

    // Turn off selection mode via FSM
    if (this.store.fsm) {
      this.store.fsm.completeJumpSelection(targetTime);
    } else {
      this.store.set('isSelectingJumpBar', false);
      if (this.chartEl) this.chartEl.style.cursor = 'default';
      const btnReplayStartPoint = document.getElementById('btnReplayStartPoint');
      if (btnReplayStartPoint) btnReplayStartPoint.classList.remove('active');
    }

    const sim = this.store.simulator;
    if (sim) {
      sim.jumpToBar(targetTime);
      this.resetStatePreservingZoom(12);
      eventBus.emit('replay:scrubbed');
      if (this.store.sessionService) {
        this.store.sessionService.resetSession({ newTime: targetTime });
      }
    }

    const cur = sim ? sim.getCurrentBar() : null;
    const timeFormatted = cur ? formatTimestamp(cur.time) : '';
    showToast(`Начальная точка симуляции установлена: ${timeFormatted}! Торговый счет сброшен.`, 'success');
    return true;
  }

  handleChartClickAction(param) {
    if (!param) return false;
    let id = '';
    if (typeof param === 'string') {
      id = param;
    } else if (typeof param === 'object') {
      id = param.externalId || param.id || '';
    }

    if (!id || typeof id !== 'string') return false;

    if (id.endsWith('::close') && (id.startsWith('order:') || id.startsWith('ord:'))) {
      const cleanId = id.split('::')[0].replace(/^order:|^ord:/, '');
      return this.handleCancelOrder(cleanId, 'С графика');
    }

    if (id.endsWith('::close') && (id.startsWith('position:') || id.startsWith('pos:'))) {
      const symbolOrId = id.split('::')[0].replace(/^position:|^pos:/, '');
      return this.handleClosePosition(symbolOrId, 'С графика');
    }

    if (id.endsWith('::close')) {
      const raw = id.split('::')[0];
      return this.handleClosePosition(raw, 'С графика') || this.handleCancelOrder(raw, 'С графика');
    }

    return false;
  }

  syncTradeOverlays(currentPrice) {
    const paperAccount = this.store.paperAccount;
    if (!paperAccount) return;

    if (this.tradeController) {
      const currentSymbol = this.store.get('currentSymbol');
      const tradeState = paperAccount.getOpenAlgoTradeState(currentSymbol);
      this.tradeController.reconcile(tradeState.orders, tradeState.positions);

      if (currentPrice) {
        this.tradeController.onLtp(currentSymbol, currentPrice);
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

    if (this.valOpen) this.valOpen.textContent = bar.open.toFixed(2);
    if (this.valHigh) this.valHigh.textContent = bar.high.toFixed(2);
    if (this.valLow) this.valLow.textContent = bar.low.toFixed(2);
    if (this.valClose) this.valClose.textContent = bar.close.toFixed(2);

    const change = bar.close - bar.open;
    const changePct = ((change / bar.open) * 100).toFixed(2);
    if (this.valChange) {
      this.valChange.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePct}%)`;
      this.valChange.className = change >= 0 ? 'text-positive' : 'text-negative';
    }

    if (this.valVolume) {
      this.valVolume.textContent = Number(bar.volume || 0).toLocaleString('ru-RU');
    }
  }

  updateLegendToLatest() {
    this._lastLegendBar = null;
    const sim = this.store.simulator;
    const current = sim ? sim.getCurrentBar() : null;
    if (current) this.updateLegend(current);
  }

  getLastChartBarInfo() {
    const simulator = this.store.simulator;
    if (!simulator) return { time: null, isReplay: false, isScrolled: false };

    if (simulator.isReplayActive) {
      const curBar = simulator.getCurrentBar();
      if (curBar && curBar.time) {
        return {
          time: curBar.time,
          isReplay: true,
          isScrolled: false
        };
      }
    }

    const visibleBars = simulator.getVisibleCandles();
    if (visibleBars && visibleBars.length > 0) {
      const logicalRange = this.chart ? this.chart.getVisibleLogicalRange() : null;
      if (logicalRange && typeof logicalRange.to === 'number' && logicalRange.to < visibleBars.length - 2) {
        const idx = Math.min(visibleBars.length - 1, Math.max(0, Math.floor(logicalRange.to)));
        return {
          time: visibleBars[idx].time,
          isReplay: false,
          isScrolled: true
        };
      }

      const lastBar = visibleBars[visibleBars.length - 1];
      return {
        time: lastBar.time,
        isReplay: false,
        isScrolled: false
      };
    }

    return { time: null, isReplay: false, isScrolled: false };
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
    if (!this.chart || !this.chartEl) return;
    const cfg = bgConfig || {};
    const type = cfg.type || 'solid';
    const curTheme = this.chart._theme || (window.OpenAlgoCharts ? window.OpenAlgoCharts.darkTheme : {}) || {};

    if (type === 'gradient') {
      const g1 = cfg.gradientColor1 || '#1e222d';
      const g2 = cfg.gradientColor2 || '#131722';
      this.chartEl.style.background = `linear-gradient(to bottom, ${g1}, ${g2})`;
      if (typeof this.chart.setTheme === 'function') {
        this.chart.setTheme({ ...curTheme, background: 'transparent' });
      }
      this.chartEl.style.background = `linear-gradient(to bottom, ${g1}, ${g2})`;
    } else {
      const color = cfg.color || '#131722';
      this.chartEl.style.background = color;
      if (typeof this.chart.setTheme === 'function') {
        this.chart.setTheme({ ...curTheme, background: color });
      }
      this.chartEl.style.background = color;
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
}

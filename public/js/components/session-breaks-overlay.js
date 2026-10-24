// components/session-breaks-overlay.js - TradingView-style Session Breaks Overlay
import { eventBus } from '../core/event-bus.js';

function getSessionDayKey(timeSec) {
  // MSK time = UTC + 3 hours
  const d = new Date((timeSec + 3 * 3600) * 1000);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

export class SessionBreaksOverlayComponent {
  constructor(store) {
    this.store = store;
    this.chartContainer = null;
    this.overlayEl = null;
    this.svgEl = null;
    this._renderPending = false;
    this._hasSubscribedRangeChange = false;

    this.init();
  }

  init() {
    const chartContainer = document.querySelector('.chart-container');
    if (!chartContainer) return;

    // Check or create overlay DOM element
    let overlay = document.getElementById('chartSessionBreaksOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'chartSessionBreaksOverlay';
      overlay.className = 'chart-session-breaks-overlay';
      overlay.innerHTML = `<svg class="chart-session-breaks-svg" id="chartSessionBreaksSvg"></svg>`;
      // Insert before chartExecutionsOverlay so it sits behind execution markers and lines
      const executionsOverlay = document.getElementById('chartExecutionsOverlay');
      if (executionsOverlay && executionsOverlay.parentNode) {
        executionsOverlay.parentNode.insertBefore(overlay, executionsOverlay);
      } else {
        chartContainer.appendChild(overlay);
      }
    }

    this.chartContainer = chartContainer;
    this.overlayEl = overlay;
    this.svgEl = overlay.querySelector('#chartSessionBreaksSvg');

    // Subscribe to events
    eventBus.on('state:showSessionBreaks', () => this.render());
    eventBus.on('state:sessionBreaksConfig', () => this.render());
    eventBus.on('timeframe:change', () => this.render());
    eventBus.on('symbol:change', () => this.scheduleRender());
    eventBus.on('bar:tick', () => this.scheduleRender());
    eventBus.on('replay:state-change', () => this.scheduleRender());
    eventBus.on('replay:ui-update', () => this.scheduleRender());
    eventBus.on('chart:reset_state_preserving_zoom', () => this.render());
    window.addEventListener('resize', () => this.scheduleRender());

    // User interaction events for 60 FPS responsive update
    this.chartContainer.addEventListener('wheel', () => this.scheduleRender(), { passive: true });
    this.chartContainer.addEventListener('mousemove', (e) => {
      if (e.buttons === 1) this.scheduleRender();
    });
    this.chartContainer.addEventListener('touchmove', () => this.scheduleRender(), { passive: true });

    this.bindChartEvents();
    this.scheduleRender();
  }

  bindChartEvents() {
    const chart = this.store.chart;
    if (!chart) return;

    // 1. Hook into OpenAlgoCharts 60 FPS animation/paint loop for lockstep sync with panning
    if (typeof chart._onFrame === 'function' && !chart._hasSessionBreaksFrameHook) {
      chart._hasSessionBreaksFrameHook = true;
      const origOnFrame = chart._onFrame;
      const self = this;
      chart._onFrame = function(...args) {
        const res = origOnFrame.apply(this, args);
        self.render();
        return res;
      };
    }

    if (this._hasSubscribedRangeChange) return;

    // 2. Hook into chart on('zoom'), on('pan'), on('drag'), on('scroll'), on('layout:change') (coalesced via rAF)
    if (typeof chart.on === 'function') {
      chart.on('zoom', () => this.scheduleRender());
      chart.on('pan', () => this.scheduleRender());
      chart.on('drag', () => this.scheduleRender());
      chart.on('scroll', () => this.scheduleRender());
      chart.on('resize', () => this.scheduleRender());
      chart.on('layout:change', () => this.scheduleRender());
    }

    // 3. Hook into timeScale change handler
    const timeScale = chart._timeScale || (typeof chart.timeScale === 'function' ? chart.timeScale() : chart.timeScale);
    if (timeScale) {
      if (typeof timeScale._onChange === 'function') {
        const origOnChange = timeScale._onChange;
        timeScale._onChange = (e) => {
          if (origOnChange) origOnChange(e);
          this.scheduleRender();
        };
      } else if (typeof timeScale.setChangeHandler === 'function') {
        timeScale.setChangeHandler(() => this.scheduleRender());
      }

      if (typeof timeScale.subscribeVisibleLogicalRangeChange === 'function') {
        try {
          timeScale.subscribeVisibleLogicalRangeChange(() => this.scheduleRender());
        } catch (e) {}
      }

      this._hasSubscribedRangeChange = true;
    }
  }

  scheduleRender() {
    if (this._renderPending) return;
    this._renderPending = true;
    requestAnimationFrame(() => {
      this._renderPending = false;
      this.render();
    });
  }

  render() {
    if (!this.overlayEl || !this.svgEl) return;

    const chart = this.store.chart;
    if (!chart) return;

    if (!this._hasSubscribedRangeChange) {
      this.bindChartEvents();
    }

    // Check if enabled
    const config = this.store.get('sessionBreaksConfig') || {
      enabled: this.store.get('showSessionBreaks') !== false,
      color: 'rgba(255, 255, 255, 0.2)',
      width: 1,
      style: 'dashed'
    };

    const isEnabled = config.enabled !== false && this.store.get('showSessionBreaks') !== false;
    const currentTf = (this.store.get('currentTimeframe') || '1h').toLowerCase();

    // Hide session breaks on daily (1D), weekly (1W) or when toggled off
    if (!isEnabled || currentTf === '1d' || currentTf === '1w') {
      this.svgEl.innerHTML = '';
      return;
    }

    const sim = this.store.simulator;
    if (!sim || !sim.allCandles || sim.allCandles.length < 2) {
      this.svgEl.innerHTML = '';
      return;
    }

    const candles = sim.getVisibleCandles();
    if (!candles || candles.length < 2) {
      this.svgEl.innerHTML = '';
      return;
    }

    const width = this.overlayEl.clientWidth || this.chartContainer.clientWidth || 1000;
    const height = this.overlayEl.clientHeight || this.chartContainer.clientHeight || 600;
    if (width <= 0 || height <= 0) return;

    const strokeColor = config.color || 'rgba(255, 255, 255, 0.2)';
    const strokeWidth = Number(config.width) || 1;
    let dashArray = 'none';
    if (config.style === 'dashed') {
      dashArray = `${Math.max(2, strokeWidth * 2)}, ${Math.max(2, strokeWidth * 2)}`;
    } else if (config.style === 'dotted') {
      dashArray = `${strokeWidth}, ${Math.max(2, strokeWidth * 2)}`;
    }

    const lines = [];

    // Optimize loop to only process candles within or immediately adjacent to the visible viewport
    let startIndex = 1;
    let endIndex = candles.length - 1;
    if (typeof chart.getVisibleLogicalRange === 'function') {
      const range = chart.getVisibleLogicalRange();
      if (range && typeof range.from === 'number' && typeof range.to === 'number') {
        startIndex = Math.max(1, Math.floor(range.from) - 2);
        endIndex = Math.min(candles.length - 1, Math.ceil(range.to) + 2);
      }
    }

    for (let i = startIndex; i <= endIndex; i++) {
      const prev = candles[i - 1];
      const curr = candles[i];

      if (getSessionDayKey(curr.time) !== getSessionDayKey(prev.time)) {
        // Start of a new trading session / day
        const currX = chart.timeToCoordinate(curr.time);
        if (currX === null || isNaN(currX)) continue;
        if (currX < -50 || currX > width + 50) continue;

        const prevX = chart.timeToCoordinate(prev.time);
        let x = currX;
        if (prevX !== null && !isNaN(prevX)) {
          x = Math.round((prevX + currX) / 2);
        } else {
          x = Math.round(currX);
        }

        // Draw classic TradingView vertical session line
        lines.push(
          `<line x1="${x}" y1="0" x2="${x}" y2="${height}" class="session-break-line" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-dasharray="${dashArray}" style="stroke: ${strokeColor} !important; stroke-width: ${strokeWidth}px !important; stroke-dasharray: ${dashArray} !important;" />`
        );
      }
    }

    this.svgEl.innerHTML = lines.join('');
  }
}

export default SessionBreaksOverlayComponent;

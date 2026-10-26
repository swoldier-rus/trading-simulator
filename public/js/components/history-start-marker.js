// components/history-start-marker.js - TradingView-style Dinosaur Marker at Start of Instrument History
import { eventBus } from '../core/event-bus.js';

const DINO_PIXEL_SVG = `
<svg class="dino-icon-svg" viewBox="0 0 24 24" width="20" height="20" fill="none">
  <path fill="currentColor" d="
    M14 2h6v2h-6z M13 4h8v4h-2V6h-6z M12 6h2v2h-2z M12 8h8v2h-1v2h-7z
    M11 10h2v4h-2z M10 12h2v4h-2z M9 13h2v3H9z M8 14h2v3H8z M7 15h2v3H7z
    M6 16h2v3H6z M5 17h2v2H5z M13 14h2v2h-2z M12 16h3v2h-3z
    M11 18h2v4h-2z M14 18h2v3h-2z M10 22h3v1h-3z M14 21h2v1h-2z
    M17 6h1v1h-1z
  "/>
</svg>
`;

export class HistoryStartMarkerComponent {
  constructor(store) {
    this.store = store;
    this.chartContainer = null;
    this.markerEl = null;
    this.dateEl = null;

    this.isReached = false;
    this.inceptionTime = null;
    this._renderPending = false;
    this._hasSubscribedRangeChange = false;

    this.init();
  }

  init() {
    const chartContainer = document.querySelector('.chart-container');
    if (!chartContainer) return;

    this.chartContainer = chartContainer;

    // Check or create marker DOM element
    let marker = document.getElementById('chartHistoryStartMarker');
    if (!marker) {
      marker = document.createElement('div');
      marker.id = 'chartHistoryStartMarker';
      marker.className = 'chart-history-start-marker';
      marker.innerHTML = `
        ${DINO_PIXEL_SVG}
        <div class="dino-tooltip">
          <div class="dino-tooltip-title">
            <span>🦕</span>
            <span>Начало истории данных</span>
          </div>
          <div class="dino-tooltip-date" id="dinoTooltipDate">—</div>
          <div class="dino-tooltip-subtitle">График загружен полностью</div>
        </div>
      `;
      chartContainer.appendChild(marker);
    }

    this.markerEl = marker;
    this.dateEl = marker.querySelector('#dinoTooltipDate');

    // Subscribe to events
    eventBus.on('chart:history_start_reached', (time) => this.setStartOfHistory(time));
    eventBus.on('symbol:change', () => this.reset());
    eventBus.on('timeframe:change', () => this.reset());
    eventBus.on('chart:reset_state_preserving_zoom', () => this.reset());
    window.addEventListener('resize', () => this.scheduleRender());

    // User interaction events for 60 FPS responsive update
    this.chartContainer.addEventListener('wheel', () => this.scheduleRender(), { passive: true });
    this.chartContainer.addEventListener('mousemove', (e) => {
      if (e.buttons === 1) this.scheduleRender();
    });
    this.chartContainer.addEventListener('touchmove', () => this.scheduleRender(), { passive: true });

    this.bindChartEvents();
  }

  bindChartEvents() {
    const chart = this.store.chart;
    if (!chart) return;

    // Hook into OpenAlgoCharts 60 FPS animation/paint loop for lockstep sync with panning
    if (typeof chart._onFrame === 'function' && !chart._hasHistoryDinoFrameHook) {
      chart._hasHistoryDinoFrameHook = true;
      const origOnFrame = chart._onFrame;
      const self = this;
      chart._onFrame = function(...args) {
        const res = origOnFrame.apply(this, args);
        self.render();
        return res;
      };
    }

    if (this._hasSubscribedRangeChange) return;

    if (typeof chart.on === 'function') {
      chart.on('zoom', () => this.scheduleRender());
      chart.on('pan', () => this.scheduleRender());
      chart.on('drag', () => this.scheduleRender());
      chart.on('scroll', () => this.scheduleRender());
      chart.on('resize', () => this.scheduleRender());
      chart.on('layout:change', () => this.scheduleRender());
    }

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

  setStartOfHistory(time) {
    if (!time) {
      const sim = this.store.simulator;
      time = sim?.allCandles?.[0]?.time || null;
    }
    if (!time) return;

    this.isReached = true;
    this.inceptionTime = time;

    // Update tooltip date
    if (this.dateEl) {
      this.dateEl.textContent = this.formatInceptionDate(time);
    }

    this.render();
  }

  reset() {
    this.isReached = false;
    this.inceptionTime = null;
    if (this.markerEl) {
      this.markerEl.style.display = 'none';
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
    if (!this.markerEl) return;
    if (!this.isReached || !this.inceptionTime) {
      this.markerEl.style.display = 'none';
      return;
    }

    const chart = this.store.chart;
    if (!chart || typeof chart.timeToCoordinate !== 'function') {
      this.markerEl.style.display = 'none';
      return;
    }

    if (!this._hasSubscribedRangeChange) {
      this.bindChartEvents();
    }

    const width = this.chartContainer.clientWidth || 1000;
    const x = chart.timeToCoordinate(this.inceptionTime);

    if (x === null || isNaN(x) || x < -30 || x > width + 30) {
      this.markerEl.style.display = 'none';
      return;
    }

    this.markerEl.style.display = 'flex';
    this.markerEl.style.left = `${Math.round(x)}px`;
  }

  formatInceptionDate(timeSec) {
    if (!timeSec) return '—';
    // MSK Time (UTC + 3)
    const d = new Date((timeSec + 3 * 3600) * 1000);
    const day = String(d.getUTCDate()).padStart(2, '0');
    const months = [
      'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
      'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'
    ];
    const month = months[d.getUTCMonth()];
    const year = d.getUTCFullYear();
    const hours = String(d.getUTCHours()).padStart(2, '0');
    const mins = String(d.getUTCMinutes()).padStart(2, '0');

    const tf = (this.store.get('currentTimeframe') || '').toLowerCase();
    if (tf === '1d' || tf === '1w') {
      return `${day} ${month} ${year}`;
    }
    return `${day} ${month} ${year}, ${hours}:${mins}`;
  }
}

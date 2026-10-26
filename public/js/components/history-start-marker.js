// components/history-start-marker.js - TradingView-style Dinosaur Marker at Start of Instrument History
import { eventBus } from '../core/event-bus.js';

const BRONTO_SVG = `
<svg class="dino-icon-svg" viewBox="0 0 767 1024" width="34" height="45" fill="#ffffff" fill-rule="evenodd">
  <path d="M 634 1 L 588 4 L 550 32 L 529 75 L 520 134 L 537 261 L 620 477 L 625 535 L 615 569 L 574 581 L 504 538 L 458 525 L 371 535 L 335 557 L 307 588 L 237 714 L 208 735 L 166 747 L 105 743 L 59 725 L 21 683 L 14 619 L 2 641 L 2 684 L 27 736 L 73 777 L 126 806 L 221 836 L 324 854 L 311 782 L 332 846 L 329 988 L 340 1007 L 364 1019 L 417 1022 L 452 1002 L 433 953 L 436 894 L 457 808 L 448 736 L 465 802 L 454 865 L 546 860 L 533 809 L 556 860 L 544 971 L 550 1003 L 573 1017 L 616 1022 L 646 1016 L 662 1001 L 642 944 L 652 831 L 648 775 L 658 801 L 686 772 L 713 721 L 734 647 L 736 571 L 704 455 L 602 261 L 589 199 L 602 148 L 569 110 L 611 147 L 653 149 L 719 171 L 741 160 L 704 152 L 682 121 L 709 150 L 748 153 L 762 133 L 766 99 L 750 71 L 680 37 L 662 14 Z M 736 75 L 739 75 L 742 76 L 744 77 L 748 81 L 748 89 L 747 92 L 744 95 L 740 95 L 738 94 L 737 93 L 737 92 L 735 90 L 734 88 L 733 85 L 733 79 L 734 77 Z M 737 80 L 736 83 L 737 89 L 741 93 L 744 92 L 745 90 L 745 83 L 743 81 L 741 80 Z M 656 64 L 657 66 L 651 69 Z M 643 49 L 646 49 L 648 51 L 648 55 L 646 57 L 643 57 L 641 55 L 641 51 Z M 636 33 L 647 33 L 651 35 L 658 42 L 660 46 L 661 53 L 659 60 L 658 51 L 657 47 L 656 45 L 652 41 L 647 39 L 645 39 L 642 40 L 639 43 L 638 45 L 637 48 L 636 55 L 637 63 L 639 68 L 641 70 L 652 70 L 650 72 L 647 73 L 637 73 L 632 71 L 624 63 L 622 58 L 622 47 L 624 42 L 631 35 Z" />
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
        ${BRONTO_SVG}
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
    eventBus.on('indicator:added', () => this.scheduleRender());
    eventBus.on('indicator:removed', () => this.scheduleRender());
    eventBus.on('indicator:toggle', () => this.scheduleRender());
    eventBus.on('layout:change', () => this.scheduleRender());
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
    const candleX = chart.timeToCoordinate(this.inceptionTime);

    if (candleX === null || isNaN(candleX)) {
      this.markerEl.style.display = 'none';
      return;
    }

    // Calculate vertical position: bottom of main candle window (pane 0)
    let bottomPx = 28;
    const p0 = chart._primaryPane;
    if (p0 && p0.element && this.chartContainer) {
      const cRect = this.chartContainer.getBoundingClientRect();
      const pRect = p0.element.getBoundingClientRect();
      const paneBottomOffset = Math.max(0, cRect.bottom - pRect.bottom);
      if (paneBottomOffset > 0) {
        // Sub-pane(s) (e.g. RSI/MACD) exist below pane 0: position at bottom edge of main window + 4px padding
        bottomPx = paneBottomOffset + 4;
      } else {
        // No sub-panes below pane 0: sits right above time scale line
        bottomPx = 28;
      }
    }
    this.markerEl.style.bottom = `${bottomPx}px`;

    // Offset to the left of the first candle so the dinosaur stands with a clear gap facing the candle
    const offsetLeft = 40;
    const x = candleX - offsetLeft;

    if (x < -80 || x > width + 50) {
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

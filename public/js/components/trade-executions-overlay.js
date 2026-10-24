// components/trade-executions-overlay.js - TradingView-Style Trade Executions Overlay (Markers on Candles, No Track Lines, Grouped Tooltips)
import { eventBus } from '../core/event-bus.js';
import { binarySearchCandleFloor } from '../core/utils.js';

export class TradeExecutionsOverlayComponent {
  constructor(store) {
    this.store = store;

    this.chartContainer = document.querySelector('.chart-container');
    this.overlayEl = document.getElementById('chartExecutionsOverlay');
    this.svgEl = document.getElementById('chartExecutionsSvg');
    this.markersEl = document.getElementById('chartExecutionsMarkers');
    this.tooltipEl = document.getElementById('chartExecutionTooltip');

    this._renderPending = false;
    this._hasSubscribedRangeChange = false;
    this.hoveredGroupId = null;
    this.groupsMap = new Map();

    this.init();
  }

  init() {
    if (!this.overlayEl || !this.chartContainer) return;

    // Listen to account and market events
    eventBus.on('account:update', () => this.scheduleRender());
    eventBus.on('bar:tick', () => this.scheduleRender());
    eventBus.on('symbol:change', () => this.scheduleRender());
    eventBus.on('executions:toggle', () => this.scheduleRender());

    // Re-render when chart pans or zooms
    this.chartContainer.addEventListener('wheel', () => {
      this.hideTooltip();
      this.scheduleRender();
    }, { passive: true });

    this.chartContainer.addEventListener('mousemove', (e) => {
      if (e.buttons === 1) {
        this.hideTooltip();
        this.scheduleRender();
      }
    });

    this.chartContainer.addEventListener('touchmove', () => {
      this.hideTooltip();
      this.scheduleRender();
    }, { passive: true });

    // Window resize
    window.addEventListener('resize', () => this.scheduleRender());

    // Subscribe to chart visible range changes and animation frame hooks
    this._subscribeChartRangeChange();

    // Event delegation for markers hover
    this.attachHoverListeners();

    // Initial render
    this.scheduleRender();
  }

  _subscribeChartRangeChange() {
    const chart = this.chart;
    if (!chart) return;

    // 1. Hook into OpenAlgoCharts animation/paint loop for immediate 60fps frame sync
    if (typeof chart._onFrame === 'function' && !chart._hasExecutionsFrameHook) {
      chart._hasExecutionsFrameHook = true;
      const origOnFrame = chart._onFrame;
      const self = this;
      chart._onFrame = function(...args) {
        const res = origOnFrame.apply(this, args);
        self.render();
        return res;
      };
    }

    if (this._hasSubscribedRangeChange) return;

    // 2. Subscribe to OpenAlgoCharts native events (coalesced via rAF)
    if (typeof chart.on === 'function') {
      chart.on('zoom', () => {
        this.hideTooltip();
        this.scheduleRender();
      });
      chart.on('pan', () => {
        this.hideTooltip();
        this.scheduleRender();
      });
      chart.on('drag', () => {
        this.hideTooltip();
        this.scheduleRender();
      });
      chart.on('resize', () => this.scheduleRender());
      chart.on('layout:change', () => this.scheduleRender());
    }

    // 3. Hook into timeScale (works for both getter/object and function)
    const timeScale = chart._timeScale || (typeof chart.timeScale === 'function' ? chart.timeScale() : chart.timeScale);
    if (timeScale) {
      if (typeof timeScale._onChange === 'function') {
        const origOnChange = timeScale._onChange;
        timeScale._onChange = (e) => {
          if (origOnChange) origOnChange(e);
          this.hideTooltip();
          this.scheduleRender();
        };
      } else if (typeof timeScale.setChangeHandler === 'function') {
        timeScale.setChangeHandler(() => {
          this.hideTooltip();
          this.scheduleRender();
        });
      }

      if (typeof timeScale.subscribeVisibleLogicalRangeChange === 'function') {
        try {
          timeScale.subscribeVisibleLogicalRangeChange(() => {
            this.hideTooltip();
            this.scheduleRender();
          });
        } catch (err) {
          console.warn('Failed to subscribe to visible logical range change:', err);
        }
      }

      this._hasSubscribedRangeChange = true;
    }
  }

  get chart() {
    return this.store.chart;
  }

  scheduleRender() {
    if (this._renderPending) return;
    this._renderPending = true;

    requestAnimationFrame(() => {
      this._renderPending = false;
      this.render();
    });
  }

  attachHoverListeners() {
    if (!this.overlayEl) return;

    this.overlayEl.addEventListener('mouseenter', (e) => {
      const target = e.target.closest('[data-group-id]');
      if (!target) return;
      this.handleElementHover(target, e);
    }, true);

    this.overlayEl.addEventListener('mousemove', (e) => {
      const target = e.target.closest('[data-group-id]');
      if (target) {
        this.handleElementHover(target, e);
      } else {
        this.hideTooltip();
      }
    });

    this.overlayEl.addEventListener('mouseleave', () => {
      this.hideTooltip();
    });
  }

  getTradeEntries(tradeOrPos) {
    if (Array.isArray(tradeOrPos.entries) && tradeOrPos.entries.length > 0) {
      return tradeOrPos.entries;
    }
    return [
      {
        id: 'entry_' + tradeOrPos.id + '_1',
        time: tradeOrPos.openTime,
        price: tradeOrPos.entryPrice,
        qty: tradeOrPos.qty,
        lots: tradeOrPos.lots,
        side: tradeOrPos.side,
        index: 1,
        cumulativeLots: tradeOrPos.lots,
        cumulativeQty: tradeOrPos.qty,
        avgPriceAtEntry: tradeOrPos.entryPrice
      }
    ];
  }

  findCandleForTime(time) {
    if (!time) return null;
    const sim = this.store.simulator;
    const candles = sim && Array.isArray(sim.allCandles) ? sim.allCandles : null;
    if (!candles || candles.length === 0) return null;

    // Binary search for exact or latest candle with time <= targetTime (O(log N))
    return binarySearchCandleFloor(candles, time) || candles[0];
  }

  formatTradeDate(timeSec) {
    if (!timeSec) return '—';
    const d = new Date(timeSec * 1000);
    return d.toLocaleString('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  handleElementHover(element, event) {
    const groupId = element.getAttribute('data-group-id');
    if (!groupId) return;

    if (this.hoveredGroupId && this.hoveredGroupId !== groupId) {
      const prevEl = this.overlayEl.querySelector(`[data-group-id="${this.hoveredGroupId}"]`);
      if (prevEl) prevEl.classList.remove('highlighted');
    }

    this.hoveredGroupId = groupId;
    element.classList.add('highlighted');

    const group = this.groupsMap.get(groupId);
    if (group) {
      this.showTooltip(group, element, event);
    }
  }

  hideTooltip() {
    if (this.hoveredGroupId) {
      const el = this.overlayEl?.querySelector(`[data-group-id="${this.hoveredGroupId}"]`);
      if (el) el.classList.remove('highlighted');
      this.hoveredGroupId = null;
    }
    if (this.tooltipEl) {
      this.tooltipEl.style.display = 'none';
      this.tooltipEl.classList.remove('visible', 'buy', 'sell');
    }
  }

  showTooltip(group, element, event) {
    if (!this.tooltipEl || !this.overlayEl) return;

    const isBuy = group.side === 'BUY';
    const count = group.trades.length;
    const counterClass = isBuy ? 'blueCounter' : 'redCounter';
    const descriptorText = isBuy ? 'Купить' : 'Продать';

    let contentHtml = '';

    if (count === 1) {
      // Single trade layout (TradingView style 1-in-bar)
      const t = group.trades[0];
      const units = t.lots || 1;
      const priceStr = Number(t.price).toFixed(2);
      const dateStr = this.formatTradeDate(t.time);

      contentHtml = `
        <div class="tv-exec-card">
          <div class="tv-exec-title title-IrTYfkDq">
            <span class="tv-exec-counter counter-IrTYfkDq ${counterClass} ${counterClass}-IrTYfkDq">1</span>
            <span class="tv-exec-descriptor descriptor-IrTYfkDq">${descriptorText}</span>
          </div>
          <div class="tv-exec-single-row singleTradeRow-IrTYfkDq">
            <span class="tv-exec-units-price unitsPrice-IrTYfkDq">${units} @ ${priceStr}</span>
            <span class="tv-exec-date date-IrTYfkDq">${dateStr}</span>
          </div>
        </div>
      `;
    } else {
      // Multiple trades layout (TradingView style 2+ in bar)
      const totalUnits = group.trades.reduce((sum, t) => sum + (t.lots || 1), 0);
      const weightedSum = group.trades.reduce((sum, t) => sum + (t.lots || 1) * t.price, 0);
      const avgPrice = totalUnits > 0 ? (weightedSum / totalUnits).toFixed(2) : (group.trades[0].price).toFixed(2);

      const tableRowsHtml = group.trades.map(t => {
        const units = t.lots || 1;
        const priceStr = Number(t.price).toFixed(2);
        const dateStr = this.formatTradeDate(t.time);
        return `
          <tr class="tv-exec-table-row tableRow-IrTYfkDq">
            <td class="tv-exec-units units-IrTYfkDq">${units}</td>
            <td class="tv-exec-at atDecoration-IrTYfkDq">@</td>
            <td class="tv-exec-price price-IrTYfkDq">${priceStr}</td>
            <td class="tv-exec-date date-IrTYfkDq">${dateStr}</td>
          </tr>
        `;
      }).join('');

      contentHtml = `
        <div class="tv-exec-card">
          <div class="tv-exec-title title-IrTYfkDq">
            <span class="tv-exec-counter counter-IrTYfkDq ${counterClass} ${counterClass}-IrTYfkDq">${count}</span>
            <span class="tv-exec-descriptor descriptor-IrTYfkDq">${descriptorText}</span>
          </div>
          <div class="tv-exec-subtitle subtitle-IrTYfkDq">
            <span>${totalUnits} @ ${avgPrice} avg price</span>
          </div>
          <div class="tv-exec-table-title tableTitle-IrTYfkDq">TRADES</div>
          <table class="tv-exec-table table-IrTYfkDq">
            <tbody>
              ${tableRowsHtml}
            </tbody>
          </table>
        </div>
      `;
    }

    this.tooltipEl.innerHTML = contentHtml;
    this.tooltipEl.className = `chart-execution-tooltip visible ${isBuy ? 'buy' : 'sell'}`;
    this.tooltipEl.style.display = 'block';

    // Position tooltip relative to marker
    const overlayRect = this.overlayEl.getBoundingClientRect();
    const targetRect = element.getBoundingClientRect();
    const ttRect = this.tooltipEl.getBoundingClientRect();

    const markerCenterX = targetRect.left - overlayRect.left + targetRect.width / 2;
    const markerCenterY = targetRect.top - overlayRect.top + targetRect.height / 2;

    let posX = markerCenterX + 16;
    if (posX + ttRect.width > overlayRect.width - 8) {
      posX = markerCenterX - ttRect.width - 16;
    }
    if (posX < 8) posX = 8;

    let posY = markerCenterY - ttRect.height / 2;
    if (posY < 8) posY = 8;
    if (posY + ttRect.height > overlayRect.height - 8) {
      posY = overlayRect.height - ttRect.height - 8;
    }

    this.tooltipEl.style.left = `${Math.round(posX)}px`;
    this.tooltipEl.style.top = `${Math.round(posY)}px`;
  }

  render() {
    if (!this.overlayEl || !this.markersEl || !this.chart) return;
    this._subscribeChartRangeChange();

    // Ensure svg lines are always empty (no dashed lines on chart!)
    if (this.svgEl) {
      this.svgEl.innerHTML = '';
    }

    // Check visibility toggle in store
    const isVisible = this.store.get('showExecutionsOnChart') !== false;
    if (!isVisible) {
      this.markersEl.innerHTML = '';
      this.groupsMap.clear();
      this.hideTooltip();
      return;
    }

    const paperAccount = this.store.paperAccount;
    if (!paperAccount) {
      this.markersEl.innerHTML = '';
      this.groupsMap.clear();
      return;
    }

    const currentSymbol = this.store.get('currentSymbol');
    const executions = [];

    // 1. Open active positions
    if (Array.isArray(paperAccount.positions)) {
      for (const pos of paperAccount.positions) {
        if (pos.symbol !== currentSymbol) continue;
        const entries = this.getTradeEntries(pos);
        for (const entry of entries) {
          if (!entry.time || entry.price === undefined) continue;
          executions.push({
            id: entry.id || `pos_${pos.id}_${entry.index || 1}`,
            tradeId: pos.id,
            side: entry.side || pos.side,
            time: entry.time,
            price: entry.price,
            lots: entry.lots || pos.lots || 1,
            qty: entry.qty || pos.qty || 1,
            isExit: false,
            isOpenPos: true
          });
        }
      }
    }

    // 2. Closed trades (Entries and Exits)
    if (Array.isArray(paperAccount.tradeHistory)) {
      for (const tr of paperAccount.tradeHistory) {
        if (tr.symbol !== currentSymbol) continue;
        const entries = this.getTradeEntries(tr);
        for (const entry of entries) {
          if (!entry.time || entry.price === undefined) continue;
          executions.push({
            id: entry.id || `trade_${tr.id}_${entry.index || 1}`,
            tradeId: tr.id,
            side: entry.side || tr.side,
            time: entry.time,
            price: entry.price,
            lots: entry.lots || tr.lots || 1,
            qty: entry.qty || tr.qty || 1,
            isExit: false,
            isOpenPos: false
          });
        }

        // Exit execution (closing Long is SELL, closing Short is BUY)
        if (tr.closeTime && tr.exitPrice !== undefined) {
          const exitSide = (tr.side === 'BUY') ? 'SELL' : 'BUY';
          executions.push({
            id: `exit_${tr.id}`,
            tradeId: tr.id,
            side: exitSide,
            time: tr.closeTime,
            price: tr.exitPrice,
            lots: tr.lots || 1,
            qty: tr.qty || 1,
            isExit: true,
            isOpenPos: false,
            pnl: tr.pnl,
            pnlPercent: tr.pnlPercent
          });
        }
      }
    }

    if (executions.length === 0) {
      this.markersEl.innerHTML = '';
      this.groupsMap.clear();
      this.hideTooltip();
      return;
    }

    // Sort executions chronologically
    executions.sort((a, b) => a.time - b.time);

    // Group executions by barTime and side
    const groups = new Map();
    for (const exec of executions) {
      const candle = this.findCandleForTime(exec.time);
      const barTime = candle ? candle.time : exec.time;
      const groupKey = `${barTime}_${exec.side}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          id: groupKey,
          barTime,
          candle,
          side: exec.side,
          trades: []
        });
      }
      groups.get(groupKey).trades.push(exec);
    }

    this.groupsMap = groups;

    const overlayWidth = this.overlayEl.clientWidth || this.chartContainer.clientWidth || 1000;
    const markers = [];

    for (const [groupId, group] of groups.entries()) {
      let x = this.chart.timeToCoordinate(group.barTime);
      if (x === null || isNaN(x)) continue;
      if (x < -40 || x > overlayWidth + 40) continue;

      const isBuy = group.side === 'BUY';
      let y = null;

      if (isBuy) {
        // Position below candle low
        const lowPrice = group.candle ? group.candle.low : Math.min(...group.trades.map(t => t.price));
        const yLow = this.chart.priceToCoordinate(lowPrice);
        if (yLow !== null && !isNaN(yLow)) {
          y = yLow + 16;
        }
      } else {
        // Position above candle high
        const highPrice = group.candle ? group.candle.high : Math.max(...group.trades.map(t => t.price));
        const yHigh = this.chart.priceToCoordinate(highPrice);
        if (yHigh !== null && !isNaN(yHigh)) {
          y = yHigh - 16;
        }
      }

      if (y === null) {
        const avgPrice = group.trades.reduce((s, t) => s + t.price, 0) / group.trades.length;
        const yAvg = this.chart.priceToCoordinate(avgPrice);
        y = isBuy ? (yAvg + 18) : (yAvg - 18);
      }

      const isHighlighted = this.hoveredGroupId === groupId;

      const arrowSvg = isBuy
        ? `<svg width="12" height="16" viewBox="0 0 12 16" fill="none">
             <path d="M6 1 L1.5 6.5 M6 1 L10.5 6.5 M6 1.5 L6 15" stroke="#2962ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
           </svg>`
        : `<svg width="12" height="16" viewBox="0 0 12 16" fill="none">
             <path d="M6 15 L1.5 9.5 M6 15 L10.5 9.5 M6 14.5 L6 1" stroke="#f23645" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
           </svg>`;

      markers.push(`
        <div class="tv-trade-marker ${isBuy ? 'buy' : 'sell'} ${isHighlighted ? 'highlighted' : ''}"
             data-group-id="${groupId}"
             data-side="${group.side}"
             style="left: ${Math.round(x)}px; top: ${Math.round(y)}px;">
          ${arrowSvg}
        </div>
      `);
    }

    this.markersEl.innerHTML = markers.join('');
  }
}

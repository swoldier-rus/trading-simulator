// components/trade-executions-overlay.js - TradingView-Style Trade Executions Overlay (Buy/Sell Points, Trade Lines & Hover Tooltips)
import { eventBus } from '../core/event-bus.js';
import { formatMoney } from '../core/utils.js';

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
    this.hoveredTradeId = null;

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
    this.chartContainer.addEventListener('wheel', () => this.scheduleRender(), { passive: true });

    this.chartContainer.addEventListener('mousemove', (e) => {
      if (e.buttons === 1) {
        this.scheduleRender();
      }
    });

    this.chartContainer.addEventListener('touchmove', () => this.scheduleRender(), { passive: true });

    // Window resize
    window.addEventListener('resize', () => this.scheduleRender());

    // Subscribe to chart visible range changes
    this._subscribeChartRangeChange();

    // Event delegation for markers & lines hover
    this.attachHoverListeners();

    // Initial render
    this.scheduleRender();
  }

  _subscribeChartRangeChange() {
    if (this._hasSubscribedRangeChange) return;
    const chart = this.chart;
    if (chart && typeof chart.timeScale === 'function') {
      try {
        const timeScale = chart.timeScale();
        if (timeScale && typeof timeScale.subscribeVisibleLogicalRangeChange === 'function') {
          timeScale.subscribeVisibleLogicalRangeChange(() => this.scheduleRender());
          this._hasSubscribedRangeChange = true;
        }
      } catch (err) {
        console.warn('Failed to subscribe to visible logical range change:', err);
      }
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
      const target = e.target.closest('[data-trade-id]');
      if (!target) return;
      this.handleElementHover(target, e);
    }, true);

    this.overlayEl.addEventListener('mousemove', (e) => {
      const target = e.target.closest('[data-trade-id]');
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

  handleElementHover(element, event) {
    const tradeId = element.getAttribute('data-trade-id');
    const markerType = element.getAttribute('data-marker-type') || 'line';
    if (!tradeId) return;

    this.hoveredTradeId = tradeId;
    this.highlightTrade(tradeId, true);

    const paperAccount = this.store.paperAccount;
    if (!paperAccount) return;

    // Search in tradeHistory first, then positions
    const trade = paperAccount.tradeHistory.find(t => t.id === tradeId) ||
                  paperAccount.positions.find(p => p.id === tradeId);
    if (trade) {
      this.showTooltip(trade, event, markerType);
    }
  }

  highlightTrade(tradeId, isHighlighted) {
    if (!this.overlayEl) return;
    const elements = this.overlayEl.querySelectorAll(`[data-trade-id="${tradeId}"]`);
    elements.forEach(el => {
      if (isHighlighted) el.classList.add('highlighted');
      else el.classList.remove('highlighted');
    });
  }

  hideTooltip() {
    if (this.hoveredTradeId) {
      this.highlightTrade(this.hoveredTradeId, false);
      this.hoveredTradeId = null;
    }
    if (this.tooltipEl) {
      this.tooltipEl.style.display = 'none';
      this.tooltipEl.classList.remove('visible');
    }
  }

  formatDate(timeSec) {
    if (!timeSec) return '—';
    const d = new Date(timeSec * 1000);
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  showTooltip(trade, event, markerType) {
    if (!this.tooltipEl || !this.overlayEl) return;

    const isClosed = trade.exitPrice !== undefined && trade.closeTime !== undefined;
    const isLong = trade.side === 'BUY';
    const currentSymbol = this.store.get('currentSymbol') || trade.symbol || 'SBER';
    const currentTF = this.store.get('currentTimeframe') || '1ч';

    const pnl = isClosed ? trade.pnl : (trade.unrealizedPnL || 0);
    const pnlPct = isClosed ? trade.pnlPercent : (trade.unrealizedPnLPercent || 0);
    const isProfit = pnl >= 0;
    const pnlFormatted = `${pnl >= 0 ? '+' : ''}${formatMoney(pnl)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)`;

    let badgeText = '';
    let badgeClass = '';
    if (markerType === 'exit') {
      badgeText = '● Закрытие сделки';
      badgeClass = 'exit';
    } else if (isLong) {
      badgeText = isClosed ? '▲ Покупка (BUY)' : '▲ Позиция LONG';
      badgeClass = 'buy';
    } else {
      badgeText = isClosed ? '▼ Продажа (SELL)' : '▼ Позиция SHORT';
      badgeClass = 'sell';
    }

    const dateStr = this.formatDate(markerType === 'exit' ? trade.closeTime : trade.openTime);
    const qtyText = `${trade.lots || 1} ${trade.lots === 1 ? 'лот' : 'лота'} (${trade.qty || ((trade.lots || 1) * (trade.lotSize || 10))} шт.)`;

    let rowsHtml = `
      <div class="exec-tt-row">
        <span class="exec-tt-label">Цена входа:</span>
        <span class="exec-tt-val">${trade.entryPrice.toFixed(2)} ₽</span>
      </div>
    `;

    if (isClosed) {
      rowsHtml += `
        <div class="exec-tt-row">
          <span class="exec-tt-label">Цена выхода:</span>
          <span class="exec-tt-val">${trade.exitPrice.toFixed(2)} ₽</span>
        </div>
      `;
    } else {
      rowsHtml += `
        <div class="exec-tt-row">
          <span class="exec-tt-label">Текущая цена:</span>
          <span class="exec-tt-val">${(trade.currentPrice || trade.entryPrice).toFixed(2)} ₽</span>
        </div>
      `;
    }

    rowsHtml += `
      <div class="exec-tt-row">
        <span class="exec-tt-label">Количество:</span>
        <span class="exec-tt-val">${qtyText}</span>
      </div>
      <div class="exec-tt-row">
        <span class="exec-tt-label">${isClosed ? 'Результат (PnL):' : 'Нереализ. PnL:'}</span>
        <span class="exec-tt-val ${isProfit ? 'profit' : 'loss'}">${pnlFormatted}</span>
      </div>
    `;

    if (isClosed && trade.reason) {
      rowsHtml += `
        <div class="exec-tt-row">
          <span class="exec-tt-label">Причина:</span>
          <span class="exec-tt-val">${trade.reason}</span>
        </div>
      `;
    } else if (!isClosed) {
      rowsHtml += `
        <div class="exec-tt-row">
          <span class="exec-tt-label">Статус:</span>
          <span class="exec-tt-val" style="color: #2962ff;">В рынке (Активная)</span>
        </div>
      `;
    }

    this.tooltipEl.innerHTML = `
      <div class="exec-tt-header">
        <span class="exec-tt-badge ${badgeClass}">${badgeText}</span>
        <span class="exec-tt-symbol">${currentSymbol} • ${currentTF}</span>
      </div>
      <div class="exec-tt-date">${dateStr}</div>
      <div class="exec-tt-divider"></div>
      <div class="exec-tt-grid">
        ${rowsHtml}
      </div>
    `;

    this.tooltipEl.style.display = 'block';
    this.tooltipEl.classList.add('visible');

    // Position tooltip relative to cursor / marker within overlay
    const overlayRect = this.overlayEl.getBoundingClientRect();
    const ttRect = this.tooltipEl.getBoundingClientRect();

    let targetX = event.clientX - overlayRect.left;
    let targetY = event.clientY - overlayRect.top;

    let posX = targetX - ttRect.width / 2;
    let posY = targetY - ttRect.height - 12;

    if (posX < 8) posX = 8;
    if (posX + ttRect.width > overlayRect.width - 8) {
      posX = overlayRect.width - ttRect.width - 8;
    }

    if (posY < 8) {
      posY = targetY + 20;
    }

    this.tooltipEl.style.left = `${Math.round(posX)}px`;
    this.tooltipEl.style.top = `${Math.round(posY)}px`;
  }

  render() {
    if (!this.overlayEl || !this.svgEl || !this.markersEl || !this.chart) return;
    this._subscribeChartRangeChange();

    // Check visibility toggle in store
    const isVisible = this.store.get('showExecutionsOnChart') !== false;
    if (!isVisible) {
      this.svgEl.innerHTML = '';
      this.markersEl.innerHTML = '';
      this.hideTooltip();
      return;
    }

    const paperAccount = this.store.paperAccount;
    if (!paperAccount) {
      this.svgEl.innerHTML = '';
      this.markersEl.innerHTML = '';
      return;
    }

    const currentSymbol = this.store.get('currentSymbol');
    const closedTrades = paperAccount.tradeHistory.filter(t => t.symbol === currentSymbol);
    const openPositions = paperAccount.positions.filter(p => p.symbol === currentSymbol);

    if (closedTrades.length === 0 && openPositions.length === 0) {
      this.svgEl.innerHTML = '';
      this.markersEl.innerHTML = '';
      this.hideTooltip();
      return;
    }

    const overlayWidth = this.overlayEl.clientWidth || this.chartContainer.clientWidth || 1000;
    const overlayHeight = this.overlayEl.clientHeight || this.chartContainer.clientHeight || 600;

    const lines = [];
    const markers = [];

    // 1. Render Completed Trades (Entry Marker, Exit Marker, Connecting Track Line)
    for (const t of closedTrades) {
      if (!t.openTime || !t.closeTime) continue;

      let x1 = this.chart.timeToCoordinate(t.openTime);
      let y1 = this.chart.priceToCoordinate(t.entryPrice);
      let x2 = this.chart.timeToCoordinate(t.closeTime);
      let y2 = this.chart.priceToCoordinate(t.exitPrice);

      if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
      if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) continue;

      // Skip trades that are completely off screen
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      if (maxX < -50 || minX > overlayWidth + 50) continue;

      const isProfit = t.pnl >= 0;
      const strokeClass = isProfit ? 'profit' : 'loss';
      const strokeColor = isProfit ? '#089981' : '#f23645';

      // Slight offset if open and close occurred on same bar / same coordinates
      let renderX2 = x2;
      let renderY2 = y2;
      if (Math.abs(x1 - x2) < 4 && Math.abs(y1 - y2) < 4) {
        renderX2 = x1 + 10;
        renderY2 = isProfit ? y1 - 8 : y1 + 8;
      }

      // Connecting Track Line
      lines.push(`
        <line x1="${x1}" y1="${y1}" x2="${renderX2}" y2="${renderY2}"
              class="trade-track-line ${strokeClass} ${this.hoveredTradeId === t.id ? 'highlighted' : ''}"
              stroke="${strokeColor}" stroke-width="1.5" stroke-dasharray="4,4"
              data-trade-id="${t.id}" data-marker-type="line" />
      `);

      // Entry Marker
      if (t.side === 'BUY') {
        markers.push(`
          <div class="trade-exec-marker entry-buy ${this.hoveredTradeId === t.id ? 'highlighted' : ''}"
               data-trade-id="${t.id}" data-marker-type="entry"
               style="left: ${Math.round(x1)}px; top: ${Math.round(y1)}px;" title="Покупка (BUY)">
            <svg width="18" height="20" viewBox="0 0 18 20">
              <path d="M9 1 L17 11 L11.5 11 L11.5 19 L6.5 19 L6.5 11 L1 11 Z" fill="#089981" stroke="#ffffff" stroke-width="1.2"/>
            </svg>
          </div>
        `);
      } else {
        markers.push(`
          <div class="trade-exec-marker entry-sell ${this.hoveredTradeId === t.id ? 'highlighted' : ''}"
               data-trade-id="${t.id}" data-marker-type="entry"
               style="left: ${Math.round(x1)}px; top: ${Math.round(y1)}px;" title="Продажа (SELL)">
            <svg width="18" height="20" viewBox="0 0 18 20">
              <path d="M9 19 L1 9 L6.5 9 L6.5 1 L11.5 1 L11.5 9 L17 9 Z" fill="#f23645" stroke="#ffffff" stroke-width="1.2"/>
            </svg>
          </div>
        `);
      }

      // Exit Marker
      markers.push(`
        <div class="trade-exec-marker ${isProfit ? 'exit-profit' : 'exit-loss'} ${this.hoveredTradeId === t.id ? 'highlighted' : ''}"
             data-trade-id="${t.id}" data-marker-type="exit"
             style="left: ${Math.round(renderX2)}px; top: ${Math.round(renderY2)}px;" title="Закрытие сделки">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="7" fill="${strokeColor}" stroke="#ffffff" stroke-width="1.5"/>
            <circle cx="8" cy="8" r="2.5" fill="#ffffff"/>
          </svg>
        </div>
      `);
    }

    // 2. Render Active Open Positions (Entry Marker and line to current bar)
    const currentBar = this.store.simulator ? this.store.simulator.getCurrentBar() : null;
    const curPrice = currentBar ? currentBar.close : (openPositions[0] ? openPositions[0].currentPrice : null);

    for (const p of openPositions) {
      if (!p.openTime || p.entryPrice === undefined) continue;

      const x1 = this.chart.timeToCoordinate(p.openTime);
      const y1 = this.chart.priceToCoordinate(p.entryPrice);

      if (x1 === null || y1 === null || isNaN(x1) || isNaN(y1)) continue;

      // Draw active line from entry to current price if bar is available
      if (currentBar && curPrice) {
        const x2 = this.chart.timeToCoordinate(currentBar.time);
        const y2 = this.chart.priceToCoordinate(curPrice);

        if (x2 !== null && y2 !== null && !isNaN(x2) && !isNaN(y2)) {
          lines.push(`
            <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
                  class="trade-track-line active ${this.hoveredTradeId === p.id ? 'highlighted' : ''}"
                  stroke="#2962ff" stroke-width="1.5" stroke-dasharray="3,3"
                  data-trade-id="${p.id}" data-marker-type="line" />
          `);
        }
      }

      // Entry Marker for active position
      if (p.side === 'BUY') {
        markers.push(`
          <div class="trade-exec-marker entry-buy active-pos ${this.hoveredTradeId === p.id ? 'highlighted' : ''}"
               data-trade-id="${p.id}" data-marker-type="entry"
               style="left: ${Math.round(x1)}px; top: ${Math.round(y1)}px;" title="Открытая позиция BUY (LONG)">
            <svg width="18" height="20" viewBox="0 0 18 20">
              <path d="M9 1 L17 11 L11.5 11 L11.5 19 L6.5 19 L6.5 11 L1 11 Z" fill="#089981" stroke="#ffffff" stroke-width="1.2"/>
            </svg>
          </div>
        `);
      } else {
        markers.push(`
          <div class="trade-exec-marker entry-sell active-pos ${this.hoveredTradeId === p.id ? 'highlighted' : ''}"
               data-trade-id="${p.id}" data-marker-type="entry"
               style="left: ${Math.round(x1)}px; top: ${Math.round(y1)}px;" title="Открытая позиция SELL (SHORT)">
            <svg width="18" height="20" viewBox="0 0 18 20">
              <path d="M9 19 L1 9 L6.5 9 L6.5 1 L11.5 1 L11.5 9 L17 9 Z" fill="#f23645" stroke="#ffffff" stroke-width="1.2"/>
            </svg>
          </div>
        `);
      }
    }

    this.svgEl.innerHTML = lines.join('');
    this.markersEl.innerHTML = markers.join('');
  }
}

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

  handleElementHover(element, event) {
    const tradeId = element.getAttribute('data-trade-id');
    const entryId = element.getAttribute('data-entry-id');
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
      const entries = this.getTradeEntries(trade);
      const entry = (entryId ? entries.find(e => e.id === entryId) : null) || entries[0];
      this.showTooltip(trade, event, markerType, entry, entries);
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

  showTooltip(trade, event, markerType, entry, entries = []) {
    if (!this.tooltipEl || !this.overlayEl) return;

    const isClosed = trade.exitPrice !== undefined && trade.closeTime !== undefined;
    const isLong = (entry ? entry.side : trade.side) === 'BUY';
    const currentSymbol = this.store.get('currentSymbol') || trade.symbol || 'SBER';
    const currentTF = this.store.get('currentTimeframe') || '1ч';

    const pnl = isClosed ? trade.pnl : (trade.unrealizedPnL || 0);
    const pnlPct = isClosed ? trade.pnlPercent : (trade.unrealizedPnLPercent || 0);
    const isProfit = pnl >= 0;
    const pnlFormatted = `${pnl >= 0 ? '+' : ''}${formatMoney(pnl)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)`;

    const totalEntries = entries.length;
    const entryIndex = entry ? entry.index : 1;

    let badgeText = '';
    let badgeClass = '';
    let dateStr = '';

    if (markerType === 'exit') {
      badgeText = '● Закрытие сделки';
      badgeClass = 'exit';
      dateStr = this.formatDate(trade.closeTime);
    } else if (markerType === 'entry') {
      if (totalEntries > 1) {
        badgeText = entryIndex === 1
          ? `▲ Вход #1 (${isLong ? 'BUY' : 'SELL'})`
          : `▲ Добор #${entryIndex} (${isLong ? 'BUY' : 'SELL'})`;
      } else {
        badgeText = isLong
          ? (isClosed ? '▲ Покупка (BUY)' : '▲ Позиция LONG')
          : (isClosed ? '▼ Продажа (SELL)' : '▼ Позиция SHORT');
      }
      badgeClass = isLong ? 'buy' : 'sell';
      dateStr = this.formatDate(entry ? entry.time : trade.openTime);
    } else {
      // Line hover
      if (totalEntries > 1 && entryIndex > 1) {
        badgeText = `▲ Трейд (Добор #${entryIndex})`;
      } else {
        badgeText = isLong ? '▲ Трейд LONG' : '▼ Трейд SHORT';
      }
      badgeClass = isLong ? 'buy' : 'sell';
      dateStr = this.formatDate(entry ? entry.time : trade.openTime);
    }

    let rowsHtml = '';

    if (markerType === 'entry' || markerType === 'line') {
      const thisLots = entry ? entry.lots : trade.lots;
      const thisQty = entry ? entry.qty : trade.qty;
      const thisPrice = entry ? entry.price : trade.entryPrice;

      rowsHtml += `
        <div class="exec-tt-row">
          <span class="exec-tt-label">${totalEntries > 1 ? `Цена входа #${entryIndex}:` : 'Цена входа:'}</span>
          <span class="exec-tt-val">${thisPrice.toFixed(2)} ₽</span>
        </div>
        <div class="exec-tt-row">
          <span class="exec-tt-label">${totalEntries > 1 ? `Объем входа #${entryIndex}:` : 'Объем сделки:'}</span>
          <span class="exec-tt-val">${thisLots} ${thisLots === 1 ? 'лот' : 'лота'} (${thisQty} шт.)</span>
        </div>
      `;

      if (totalEntries > 1) {
        const cumLots = entry && entry.cumulativeLots ? entry.cumulativeLots : trade.lots;
        const cumQty = entry && entry.cumulativeQty ? entry.cumulativeQty : trade.qty;
        const avgPrice = entry && entry.avgPriceAtEntry ? entry.avgPriceAtEntry : trade.entryPrice;
        rowsHtml += `
          <div class="exec-tt-divider" style="margin: 4px 0;"></div>
          <div class="exec-tt-row">
            <span class="exec-tt-label">Средняя цена позиции:</span>
            <span class="exec-tt-val" style="color: #f5a623;">${avgPrice.toFixed(2)} ₽</span>
          </div>
          <div class="exec-tt-row">
            <span class="exec-tt-label">Всего в позиции:</span>
            <span class="exec-tt-val">${cumLots} лот. (${cumQty} шт.)</span>
          </div>
        `;
      }

      if (isClosed) {
        rowsHtml += `
          <div class="exec-tt-divider" style="margin: 4px 0;"></div>
          <div class="exec-tt-row">
            <span class="exec-tt-label">Цена выхода:</span>
            <span class="exec-tt-val">${trade.exitPrice.toFixed(2)} ₽</span>
          </div>
          <div class="exec-tt-row">
            <span class="exec-tt-label">Общий PnL сделки:</span>
            <span class="exec-tt-val ${isProfit ? 'profit' : 'loss'}">${pnlFormatted}</span>
          </div>
        `;
        if (trade.reason) {
          rowsHtml += `
            <div class="exec-tt-row">
              <span class="exec-tt-label">Причина закрытия:</span>
              <span class="exec-tt-val">${trade.reason}</span>
            </div>
          `;
        }
      } else {
        rowsHtml += `
          <div class="exec-tt-divider" style="margin: 4px 0;"></div>
          <div class="exec-tt-row">
            <span class="exec-tt-label">Текущая цена:</span>
            <span class="exec-tt-val">${(trade.currentPrice || trade.entryPrice).toFixed(2)} ₽</span>
          </div>
          <div class="exec-tt-row">
            <span class="exec-tt-label">Нереализ. PnL:</span>
            <span class="exec-tt-val ${isProfit ? 'profit' : 'loss'}">${pnlFormatted}</span>
          </div>
          <div class="exec-tt-row">
            <span class="exec-tt-label">Статус:</span>
            <span class="exec-tt-val" style="color: #2962ff;">В рынке (Активная)</span>
          </div>
        `;
      }
    } else {
      // Exit marker hover
      rowsHtml += `
        <div class="exec-tt-row">
          <span class="exec-tt-label">${totalEntries > 1 ? `Средняя входа (${totalEntries} входа):` : 'Цена входа:'}</span>
          <span class="exec-tt-val">${trade.entryPrice.toFixed(2)} ₽</span>
        </div>
        <div class="exec-tt-row">
          <span class="exec-tt-label">Цена выхода:</span>
          <span class="exec-tt-val">${trade.exitPrice.toFixed(2)} ₽</span>
        </div>
        <div class="exec-tt-row">
          <span class="exec-tt-label">Общий объем:</span>
          <span class="exec-tt-val">${trade.lots} лот. (${trade.qty} шт.)</span>
        </div>
        <div class="exec-tt-row">
          <span class="exec-tt-label">Итоговый результат:</span>
          <span class="exec-tt-val ${isProfit ? 'profit' : 'loss'}">${pnlFormatted}</span>
        </div>
      `;
      if (trade.reason) {
        rowsHtml += `
          <div class="exec-tt-row">
            <span class="exec-tt-label">Причина:</span>
            <span class="exec-tt-val">${trade.reason}</span>
          </div>
        `;
      }
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

    // 1. Render Completed Closed Trades
    for (const t of closedTrades) {
      if (!t.closeTime || t.exitPrice === undefined) continue;

      let xExit = this.chart.timeToCoordinate(t.closeTime);
      let yExit = this.chart.priceToCoordinate(t.exitPrice);

      if (xExit === null || yExit === null || isNaN(xExit) || isNaN(yExit)) continue;

      const entries = this.getTradeEntries(t);
      const isProfit = t.pnl >= 0;
      const strokeClass = isProfit ? 'profit' : 'loss';
      const strokeColor = isProfit ? '#089981' : '#f23645';

      let hasRenderedAnyEntry = false;

      for (const entry of entries) {
        if (!entry.time || entry.price === undefined) continue;

        let x1 = this.chart.timeToCoordinate(entry.time);
        let y1 = this.chart.priceToCoordinate(entry.price);

        if (x1 === null || y1 === null || isNaN(x1) || isNaN(y1)) continue;

        // Skip entry if completely out of visible viewport
        const minX = Math.min(x1, xExit);
        const maxX = Math.max(x1, xExit);
        if (maxX < -50 || minX > overlayWidth + 50) continue;

        hasRenderedAnyEntry = true;

        // Offset slightly if entry and exit are virtually identical coordinates
        let renderXExit = xExit;
        let renderYExit = yExit;
        if (Math.abs(x1 - xExit) < 4 && Math.abs(y1 - yExit) < 4) {
          renderXExit = x1 + 10;
          renderYExit = isProfit ? y1 - 8 : y1 + 8;
        }

        // Connecting Track Line from this specific entry to exit
        lines.push(`
          <line x1="${x1}" y1="${y1}" x2="${renderXExit}" y2="${renderYExit}"
                class="trade-track-line ${strokeClass} ${this.hoveredTradeId === t.id ? 'highlighted' : ''}"
                stroke="${strokeColor}" stroke-width="1.5" stroke-dasharray="4,4"
                data-trade-id="${t.id}" data-entry-id="${entry.id}" data-marker-type="line" />
        `);

        // Entry Marker on the exact price and time of this entry
        const isLong = entry.side === 'BUY';
        if (isLong) {
          markers.push(`
            <div class="trade-exec-marker entry-buy ${this.hoveredTradeId === t.id ? 'highlighted' : ''}"
                 data-trade-id="${t.id}" data-entry-id="${entry.id}" data-marker-type="entry"
                 style="left: ${Math.round(x1)}px; top: ${Math.round(y1)}px;"
                 title="${entries.length > 1 ? `Вход #${entry.index} (BUY)` : 'Покупка (BUY)'}">
              <svg width="18" height="20" viewBox="0 0 18 20">
                <path d="M9 1 L17 11 L11.5 11 L11.5 19 L6.5 19 L6.5 11 L1 11 Z" fill="#089981" stroke="#ffffff" stroke-width="1.2"/>
              </svg>
            </div>
          `);
        } else {
          markers.push(`
            <div class="trade-exec-marker entry-sell ${this.hoveredTradeId === t.id ? 'highlighted' : ''}"
                 data-trade-id="${t.id}" data-entry-id="${entry.id}" data-marker-type="entry"
                 style="left: ${Math.round(x1)}px; top: ${Math.round(y1)}px;"
                 title="${entries.length > 1 ? `Вход #${entry.index} (SELL)` : 'Продажа (SELL)'}">
              <svg width="18" height="20" viewBox="0 0 18 20">
                <path d="M9 19 L1 9 L6.5 9 L6.5 1 L11.5 1 L11.5 9 L17 9 Z" fill="#f23645" stroke="#ffffff" stroke-width="1.2"/>
              </svg>
            </div>
          `);
        }
      }

      // Exit Marker on the exact exit point
      if (hasRenderedAnyEntry || (xExit >= -50 && xExit <= overlayWidth + 50)) {
        markers.push(`
          <div class="trade-exec-marker ${isProfit ? 'exit-profit' : 'exit-loss'} ${this.hoveredTradeId === t.id ? 'highlighted' : ''}"
               data-trade-id="${t.id}" data-marker-type="exit"
               style="left: ${Math.round(xExit)}px; top: ${Math.round(yExit)}px;" title="Закрытие сделки">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="7" fill="${strokeColor}" stroke="#ffffff" stroke-width="1.5"/>
              <circle cx="8" cy="8" r="2.5" fill="#ffffff"/>
            </svg>
          </div>
        `);
      }
    }

    // 2. Render Active Open Positions (Entries and lines to current bar)
    const currentBar = this.store.simulator ? this.store.simulator.getCurrentBar() : null;
    const curPrice = currentBar ? currentBar.close : (openPositions[0] ? openPositions[0].currentPrice : null);
    const curX = currentBar ? this.chart.timeToCoordinate(currentBar.time) : null;
    const curY = curPrice ? this.chart.priceToCoordinate(curPrice) : null;

    for (const p of openPositions) {
      const entries = this.getTradeEntries(p);

      for (const entry of entries) {
        if (!entry.time || entry.price === undefined) continue;

        let x1 = this.chart.timeToCoordinate(entry.time);
        let y1 = this.chart.priceToCoordinate(entry.price);

        if (x1 === null || y1 === null || isNaN(x1) || isNaN(y1)) continue;

        // Individual dashed line from every entry to the current candle
        if (curX !== null && curY !== null && !isNaN(curX) && !isNaN(curY)) {
          lines.push(`
            <line x1="${x1}" y1="${y1}" x2="${curX}" y2="${curY}"
                  class="trade-track-line active ${this.hoveredTradeId === p.id ? 'highlighted' : ''}"
                  stroke="#2962ff" stroke-width="1.5" stroke-dasharray="3,3"
                  data-trade-id="${p.id}" data-entry-id="${entry.id}" data-marker-type="line" />
          `);
        }

        // Entry Marker on exact entry price & time
        const isLong = entry.side === 'BUY';
        if (isLong) {
          markers.push(`
            <div class="trade-exec-marker entry-buy active-pos ${this.hoveredTradeId === p.id ? 'highlighted' : ''}"
                 data-trade-id="${p.id}" data-entry-id="${entry.id}" data-marker-type="entry"
                 style="left: ${Math.round(x1)}px; top: ${Math.round(y1)}px;"
                 title="${entries.length > 1 ? `Вход #${entry.index} (BUY)` : 'Позиция BUY'}">
              <svg width="18" height="20" viewBox="0 0 18 20">
                <path d="M9 1 L17 11 L11.5 11 L11.5 19 L6.5 19 L6.5 11 L1 11 Z" fill="#089981" stroke="#ffffff" stroke-width="1.2"/>
              </svg>
            </div>
          `);
        } else {
          markers.push(`
            <div class="trade-exec-marker entry-sell active-pos ${this.hoveredTradeId === p.id ? 'highlighted' : ''}"
                 data-trade-id="${p.id}" data-entry-id="${entry.id}" data-marker-type="entry"
                 style="left: ${Math.round(x1)}px; top: ${Math.round(y1)}px;"
                 title="${entries.length > 1 ? `Вход #${entry.index} (SELL)` : 'Позиция SELL'}">
              <svg width="18" height="20" viewBox="0 0 18 20">
                <path d="M9 19 L1 9 L6.5 9 L6.5 1 L11.5 1 L11.5 9 L17 9 Z" fill="#f23645" stroke="#ffffff" stroke-width="1.2"/>
              </svg>
            </div>
          `);
        }
      }
    }

    this.svgEl.innerHTML = lines.join('');
    this.markersEl.innerHTML = markers.join('');
  }
}

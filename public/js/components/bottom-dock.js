// components/bottom-dock.js - High-Performance Bottom Trading Dock Component
// Implements Keyed DOM Diff-updates and RequestAnimationFrame (RAF) Throttling for 60 FPS replay.

import { eventBus } from '../core/event-bus.js';
import { formatMoney, formatTimestamp, showToast } from '../core/utils.js';

export class BottomDockComponent {
  constructor(store) {
    this.store = store;

    // Tabs & views
    this.bottomTabs = document.querySelectorAll('.bottom-tab');
    this.positionsView = document.getElementById('positionsView');
    this.ordersView = document.getElementById('ordersView');
    this.tradesView = document.getElementById('tradesView');
    this.analyticsView = document.getElementById('analyticsView');
    this.activeTab = 'positions';

    // Badges
    this.badgePositions = document.getElementById('badgePositions');
    this.badgeOrders = document.getElementById('badgeOrders');
    this.badgeTrades = document.getElementById('badgeTrades');

    // Actions
    this.btnCloseAllPositions = document.getElementById('btnCloseAllPositions');
    this.btnCancelAllOrders = document.getElementById('btnCancelAllOrders');
    this.btnExportCsv = document.getElementById('btnExportCsv');
    this.btnResetAccount = document.getElementById('btnResetAccount');

    // Metrics Bar
    this.metricBalance = document.getElementById('metricBalance');
    this.metricEquity = document.getElementById('metricEquity');
    this.metricPnL = document.getElementById('metricPnL');
    this.metricWinrate = document.getElementById('metricWinrate');

    // Table bodies
    this.positionsTableBody = document.getElementById('positionsTableBody');
    this.ordersTableBody = document.getElementById('ordersTableBody');
    this.tradesTableBody = document.getElementById('tradesTableBody');

    // Analytics elements
    this.statTotalTrades = document.getElementById('statTotalTrades');
    this.statWinLossRatio = document.getElementById('statWinLossRatio');
    this.statWinRate = document.getElementById('statWinRate');
    this.statProfitFactor = document.getElementById('statProfitFactor');
    this.statGrossProfitLoss = document.getElementById('statGrossProfitLoss');
    this.statMaxDD = document.getElementById('statMaxDD');
    this.statAvgWin = document.getElementById('statAvgWin');
    this.statAvgLoss = document.getElementById('statAvgLoss');
    this.statReturnPct = document.getElementById('statReturnPct');
    this.statInitialCapital = document.getElementById('statInitialCapital');

    // Performance & Throttling state
    this.rafPending = false;
    this.pendingMetrics = null;
    this.renderedTradesSet = new Set();

    this.init();
  }

  init() {
    this.initTabs();
    this.initActionButtons();
    this.initTableDelegation();
    this.initResizer();

    eventBus.on('account:update', (metrics) => {
      this.update(metrics);
    });
  }

  initTabs() {
    this.bottomTabs.forEach(tab => {
      tab.onclick = () => {
        this.bottomTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // If dock is collapsed to the header line, auto-expand to show content
        if (this.bottomPanel && this.bottomPanel.offsetHeight <= this.minHeight + 2) {
          this.setHeight(Math.max(120, this.lastExpandedHeight || this.defaultHeight));
        }

        const target = tab.getAttribute('data-tab');
        this.activeTab = target;

        if (this.positionsView) this.positionsView.style.display = target === 'positions' ? 'block' : 'none';
        if (this.ordersView) this.ordersView.style.display = target === 'orders' ? 'block' : 'none';
        if (this.tradesView) this.tradesView.style.display = target === 'trades' ? 'block' : 'none';
        if (this.analyticsView) {
          this.analyticsView.style.display = target === 'analytics' ? 'block' : 'none';
          if (this.store.paperAccount) {
            this.renderAnalytics(this.store.paperAccount.getPerformanceMetrics());
          }
        }
      };
    });
  }

  initActionButtons() {
    if (this.btnCloseAllPositions) {
      this.btnCloseAllPositions.onclick = () => {
        const simulator = this.store.simulator;
        const paperAccount = this.store.paperAccount;
        if (!paperAccount) return;
        const currentBar = simulator ? simulator.getCurrentBar() : null;
        const count = paperAccount.closeAllPositions(currentBar ? currentBar.close : 0, currentBar ? currentBar.time : null);
        if (count && count.length > 0) {
          showToast(`Закрыто позиций: ${count.length}`, 'info');
        }
        this.flushUpdate(paperAccount.getPerformanceMetrics());
      };
    }

    if (this.btnCancelAllOrders) {
      this.btnCancelAllOrders.onclick = () => {
        const paperAccount = this.store.paperAccount;
        if (!paperAccount) return;
        const count = paperAccount.cancelAllOrders();
        if (count > 0) {
          showToast(`Отменено заявок: ${count}`, 'info');
        }
        this.flushUpdate(paperAccount.getPerformanceMetrics());
      };
    }

    if (this.btnResetAccount) {
      this.btnResetAccount.onclick = () => {
        const paperAccount = this.store.paperAccount;
        if (!paperAccount) return;
        if (confirm('Сбросить весь торговый счет, баланс и историю симуляции?')) {
          this.renderedTradesSet.clear();
          if (this.tradesTableBody) {
            this.tradesTableBody.innerHTML = '<tr class="empty-row"><td colspan="11" class="text-center">Нет совершенных сделок</td></tr>';
          }
          paperAccount.reset();
          if (this.store.sessionService) {
            this.store.sessionService.resetSession();
          }
          showToast('Счет симулятора сброшен к исходному состоянию', 'info');
          this.flushUpdate(paperAccount.getPerformanceMetrics());
        }
      };
    }

    if (this.btnExportCsv) {
      this.btnExportCsv.onclick = () => {
        const paperAccount = this.store.paperAccount;
        if (!paperAccount) return;
        const csv = paperAccount.exportCsv();
        if (!csv) {
          showToast('Нет совершенных сделок для экспорта', 'info');
          return;
        }
        const currentSymbol = this.store.get('currentSymbol');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `openalgo_trades_${currentSymbol}_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Файл истории сделок сохранен!', 'success');
      };
    }
  }

  initTableDelegation() {
    const handleSymbolClick = (e) => {
      const symbolLink = e.target.closest('[data-switch-symbol]');
      if (symbolLink) {
        e.stopPropagation();
        const ticker = symbolLink.getAttribute('data-switch-symbol');
        this.switchToSymbol(ticker);
        return true;
      }
      return false;
    };

    if (this.positionsTableBody) {
      this.positionsTableBody.addEventListener('click', (e) => {
        if (handleSymbolClick(e)) return;

        const closeBtn = e.target.closest('[data-close-pos]');
        if (closeBtn) {
          e.stopPropagation();
          const id = closeBtn.getAttribute('data-close-pos');
          this.handleClosePosition(id);
          return;
        }
        const revBtn = e.target.closest('[data-reverse-pos]');
        if (revBtn) {
          e.stopPropagation();
          const id = revBtn.getAttribute('data-reverse-pos');
          this.handleReversePosition(id);
          return;
        }
      });
    }

    if (this.ordersTableBody) {
      this.ordersTableBody.addEventListener('click', (e) => {
        if (handleSymbolClick(e)) return;

        const editBtn = e.target.closest('[data-edit-order]');
        if (editBtn) {
          e.stopPropagation();
          const id = editBtn.getAttribute('data-edit-order');
          if (this.store.editOrderModal) {
            this.store.editOrderModal.open(id);
          }
          return;
        }

        const cancelBtn = e.target.closest('[data-cancel-order]');
        if (cancelBtn) {
          e.stopPropagation();
          const id = cancelBtn.getAttribute('data-cancel-order');
          this.handleCancelOrder(id);
          return;
        }
      });
    }

    if (this.tradesTableBody) {
      this.tradesTableBody.addEventListener('click', (e) => {
        handleSymbolClick(e);
      });
    }

    eventBus.on('symbol:change', () => {
      this.updateActiveSymbolLinks();
    });
  }

  switchToSymbol(ticker) {
    if (!ticker) return;
    const currentSymbol = this.store.get('currentSymbol');
    if (ticker === currentSymbol) return;

    let figi = '';
    let lot = 10;
    if (this.store.portfolioDataService) {
      const inst = this.store.portfolioDataService.getInstrumentInfo(ticker);
      if (inst) {
        figi = inst.figi || '';
        lot = inst.lot || 10;
      }
    }

    this.store.set('currentSymbol', ticker);
    this.store.set('currentFigi', figi);
    this.store.set('currentLotSize', lot);

    eventBus.emit('symbol:change', { prevSymbol: currentSymbol, ticker, figi, lot });
    this.updateActiveSymbolLinks();
  }

  updateActiveSymbolLinks() {
    const currentSymbol = this.store.get('currentSymbol');
    const allLinks = document.querySelectorAll('.table-symbol-link');
    allLinks.forEach(link => {
      const sym = link.getAttribute('data-switch-symbol');
      const isActive = sym === currentSymbol;
      link.classList.toggle('active', isActive);
      link.title = isActive ? `Текущий график ${sym}` : `Открыть график ${sym}`;
    });
  }

  handleClosePosition(id) {
    const simulator = this.store.simulator;
    const paperAccount = this.store.paperAccount;
    if (!paperAccount) return;

    const pos = paperAccount.positions.find(p => p.id === id || p.symbol === id);
    if (!pos) return;

    const currentSymbol = this.store.get('currentSymbol');
    const currentBar = simulator ? simulator.getCurrentBar() : null;
    const execPrice = (currentBar && pos.symbol === currentSymbol) ? currentBar.close : pos.currentPrice;
    const execTime = currentBar ? currentBar.time : Math.floor(Date.now() / 1000);
    const res = paperAccount.closePosition(pos.id, execPrice, execTime, 'Вручную');
    if (res.ok) {
      const pnlSign = res.trade.pnl >= 0 ? '+' : '';
      showToast(`Позиция ${pos.symbol} закрыта: ${pnlSign}${formatMoney(res.trade.pnl)}`, res.trade.pnl >= 0 ? 'success' : 'info');
    }
    this.flushUpdate(paperAccount.getPerformanceMetrics());
  }

  handleReversePosition(id) {
    const simulator = this.store.simulator;
    const paperAccount = this.store.paperAccount;
    if (!paperAccount) return;

    const pos = paperAccount.positions.find(p => p.id === id || p.symbol === id);
    if (pos) {
      const currentSymbol = this.store.get('currentSymbol');
      const bar = simulator ? simulator.getCurrentBar() : null;
      const execPrice = (bar && pos.symbol === currentSymbol) ? bar.close : pos.currentPrice;
      const execTime = bar ? bar.time : Math.floor(Date.now() / 1000);
      paperAccount.reversePosition(pos.id, execPrice, execTime);
      showToast(`Позиция ${pos.symbol} перевернута!`, 'info');
    }
    this.flushUpdate(paperAccount.getPerformanceMetrics());
  }

  handleCancelOrder(id) {
    const paperAccount = this.store.paperAccount;
    if (!paperAccount) return;

    const res = paperAccount.cancelOrder(id);
    if (res.ok) {
      showToast('Заявка отменена', 'info');
    }
    this.flushUpdate(paperAccount.getPerformanceMetrics());
  }

  // RAF Throttled update entry point (guarantees at most 1 render per display refresh frame)
  update(metrics) {
    if (!metrics) return;
    this.pendingMetrics = metrics;

    if (!this.rafPending) {
      this.rafPending = true;
      requestAnimationFrame(() => {
        this.rafPending = false;
        if (this.pendingMetrics) {
          this.flushUpdate(this.pendingMetrics);
          this.pendingMetrics = null;
        }
      });
    }
  }

  // Immediate synchronous flush
  flushUpdate(metrics) {
    if (!metrics) return;

    // 1. Metrics Bar
    if (this.metricBalance) this.metricBalance.textContent = formatMoney(metrics.balance);
    if (this.metricEquity) this.metricEquity.textContent = formatMoney(metrics.equity);

    if (this.metricPnL) {
      this.metricPnL.textContent = `${metrics.unrealizedPnL >= 0 ? '+' : ''}${formatMoney(metrics.unrealizedPnL)}`;
      this.metricPnL.className = `metric-value ${metrics.unrealizedPnL >= 0 ? 'positive' : 'negative'}`;
    }

    if (this.metricWinrate) {
      this.metricWinrate.textContent = `${metrics.winRate}% (${metrics.winningTrades}/${metrics.totalTrades})`;
    }

    // 2. Badges
    if (this.badgePositions) this.badgePositions.textContent = metrics.openPositionsCount;
    if (this.badgeOrders) this.badgeOrders.textContent = metrics.workingOrdersCount;
    if (this.badgeTrades) this.badgeTrades.textContent = metrics.totalTrades;

    // 3. Keyed Diff Tables
    this.renderKeyedPositions();
    this.renderKeyedOrders();
    this.renderIncrementalTrades();

    if (this.activeTab === 'analytics') {
      this.renderAnalytics(metrics);
    }
  }

  // Keyed DOM diff-updates for positions: only changes cells without wiping DOM
  renderKeyedPositions() {
    if (!this.positionsTableBody) return;
    const paperAccount = this.store.paperAccount;
    if (!paperAccount || paperAccount.positions.length === 0) {
      if (!this.positionsTableBody.querySelector('.empty-row')) {
        this.positionsTableBody.innerHTML = '<tr class="empty-row"><td colspan="11">Нет открытых позиций</td></tr>';
      }
      return;
    }

    // Remove empty row if present
    const emptyRow = this.positionsTableBody.querySelector('.empty-row');
    if (emptyRow) emptyRow.remove();

    const activeIds = new Set();

    const currentSymbol = this.store.get('currentSymbol');

    for (const pos of paperAccount.positions) {
      activeIds.add(pos.id);
      const isLong = pos.side === 'BUY';
      const isActive = pos.symbol === currentSymbol;
      const pnlClass = pos.unrealizedPnL >= 0 ? 'text-positive' : 'text-negative';
      const pnlSign = pos.unrealizedPnL >= 0 ? '+' : '';
      const pnlText = `${pnlSign}${pos.unrealizedPnL.toFixed(2)} ₽`;
      const pnlPctText = `${pnlSign}${pos.unrealizedPnLPercent.toFixed(2)}%`;
      const curPriceText = `${pos.currentPrice.toFixed(2)} ₽`;
      const symbolHtml = `<span class="table-symbol-link ${isActive ? 'active' : ''}" data-switch-symbol="${pos.symbol}" title="${isActive ? 'Текущий график ' + pos.symbol : 'Открыть график ' + pos.symbol}">${pos.symbol}</span>`;

      let tr = this.positionsTableBody.querySelector(`tr[data-pos-id="${pos.id}"]`);

      if (tr) {
        // Row already exists: update ONLY dynamic fields in place!
        const elSym = tr.querySelector('[data-field="symbol"]');
        if (elSym && elSym.innerHTML !== symbolHtml) {
          elSym.innerHTML = symbolHtml;
        }

        const elPrice = tr.querySelector('[data-field="curPrice"]');
        if (elPrice && elPrice.textContent !== curPriceText) {
          elPrice.textContent = curPriceText;
        }

        const elPnL = tr.querySelector('[data-field="pnl"]');
        if (elPnL && elPnL.textContent !== pnlText) {
          elPnL.textContent = pnlText;
          elPnL.className = pnlClass;
        }

        const elPnLPct = tr.querySelector('[data-field="pnlPct"]');
        if (elPnLPct && elPnLPct.textContent !== pnlPctText) {
          elPnLPct.textContent = pnlPctText;
          elPnLPct.className = pnlClass;
        }

        const elLots = tr.querySelector('[data-field="lots"]');
        if (elLots && elLots.textContent !== String(pos.lots)) {
          elLots.textContent = pos.lots;
        }

        const elQty = tr.querySelector('[data-field="qty"]');
        if (elQty && elQty.textContent !== String(pos.qty)) {
          elQty.textContent = pos.qty;
        }
      } else {
        // New row: construct and append
        tr = document.createElement('tr');
        tr.setAttribute('data-pos-id', pos.id);
        tr.innerHTML = `
          <td data-field="symbol">${symbolHtml}</td>
          <td><span class="badge-side ${isLong ? 'long' : 'short'}">${isLong ? 'LONG' : 'SHORT'}</span></td>
          <td data-field="lots">${pos.lots}</td>
          <td data-field="qty">${pos.qty}</td>
          <td>${pos.entryPrice.toFixed(2)} ₽</td>
          <td data-field="curPrice">${curPriceText}</td>
          <td>${pos.sl ? pos.sl.toFixed(2) + ' ₽' : '—'}</td>
          <td>${pos.tp ? pos.tp.toFixed(2) + ' ₽' : '—'}</td>
          <td data-field="pnl" class="${pnlClass}"><strong>${pnlText}</strong></td>
          <td data-field="pnlPct" class="${pnlClass}">${pnlPctText}</td>
          <td>
            <div style="display: flex; gap: 4px;">
              <button class="table-action-btn btn-close-pos" data-close-pos="${pos.id}">✕ Закрыть</button>
              <button class="table-action-btn btn-reverse-pos" data-reverse-pos="${pos.id}">⇄ Перевернуть</button>
            </div>
          </td>
        `;
        this.positionsTableBody.appendChild(tr);
      }
    }

    // Remove closed position rows
    const allRows = this.positionsTableBody.querySelectorAll('tr[data-pos-id]');
    allRows.forEach(row => {
      const rowId = row.getAttribute('data-pos-id');
      if (!activeIds.has(rowId)) {
        row.remove();
      }
    });
  }

  // Keyed DOM diff-updates for working orders
  renderKeyedOrders() {
    if (!this.ordersTableBody) return;
    const paperAccount = this.store.paperAccount;
    if (!paperAccount || paperAccount.orders.length === 0) {
      if (!this.ordersTableBody.querySelector('.empty-row')) {
        this.ordersTableBody.innerHTML = '<tr class="empty-row"><td colspan="9">Нет активных заявок</td></tr>';
      }
      return;
    }

    const emptyRow = this.ordersTableBody.querySelector('.empty-row');
    if (emptyRow) emptyRow.remove();

    const activeIds = new Set();

    const currentSymbol = this.store.get('currentSymbol');

    for (const ord of paperAccount.orders) {
      activeIds.add(ord.id);
      const isLong = ord.side === 'BUY';
      const isActive = ord.symbol === currentSymbol;
      const symbolHtml = `<span class="table-symbol-link ${isActive ? 'active' : ''}" data-switch-symbol="${ord.symbol}" title="${isActive ? 'Текущий график ' + ord.symbol : 'Открыть график ' + ord.symbol}">${ord.symbol}</span>`;
      let tr = this.ordersTableBody.querySelector(`tr[data-order-id="${ord.id}"]`);

      if (tr) {
        // Update symbol if changed
        const elSym = tr.querySelector('[data-field="symbol"]');
        if (elSym && elSym.innerHTML !== symbolHtml) {
          elSym.innerHTML = symbolHtml;
        }

        // Update price or lots if changed
        const elPrice = tr.querySelector('[data-field="price"]');
        const expectedPrice = `${ord.price.toFixed(2)} ₽`;
        if (elPrice && elPrice.textContent !== expectedPrice) {
          elPrice.textContent = expectedPrice;
        }

        const elLots = tr.querySelector('[data-field="lots"]');
        if (elLots && elLots.getAttribute('data-lots-val') !== String(ord.lots)) {
          elLots.setAttribute('data-lots-val', String(ord.lots));
          elLots.innerHTML = `<strong>${ord.lots}</strong> (${ord.qty} шт.)`;
        }
      } else {
        tr = document.createElement('tr');
        tr.setAttribute('data-order-id', ord.id);
        tr.innerHTML = `
          <td><span style="font-family: monospace; font-size: 11px;">${ord.id.slice(-6)}</span></td>
          <td data-field="symbol">${symbolHtml}</td>
          <td><span style="font-weight: 600;">${ord.type}</span></td>
          <td><span class="badge-side ${isLong ? 'long' : 'short'}">${isLong ? 'BUY' : 'SELL'}</span></td>
          <td><span data-field="lots" data-lots-val="${ord.lots}"><strong>${ord.lots}</strong> (${ord.qty} шт.)</span></td>
          <td data-field="price"><strong>${ord.price.toFixed(2)} ₽</strong></td>
          <td>SL: ${ord.sl || '—'} / TP: ${ord.tp || '—'}</td>
          <td style="font-size: 11px; color: var(--tv-text-muted);">${formatTimestamp(ord.createdTime)}</td>
          <td>
            <button class="table-action-btn btn-edit-order" data-edit-order="${ord.id}" title="Изменить количество лотов">Изменить</button>
            <button class="table-action-btn" data-cancel-order="${ord.id}" style="color: #f23645;">✕ Отменить</button>
          </td>
        `;
        this.ordersTableBody.appendChild(tr);
      }
    }

    const allRows = this.ordersTableBody.querySelectorAll('tr[data-order-id]');
    allRows.forEach(row => {
      const rowId = row.getAttribute('data-order-id');
      if (!activeIds.has(rowId)) {
        row.remove();
      }
    });
  }

  // Incremental append for trade history (zero re-render of older trades)
  renderIncrementalTrades() {
    if (!this.tradesTableBody) return;
    const paperAccount = this.store.paperAccount;
    if (!paperAccount || paperAccount.tradeHistory.length === 0) {
      if (!this.tradesTableBody.querySelector('.empty-row')) {
        this.tradesTableBody.innerHTML = '<tr class="empty-row"><td colspan="11">История сделок пуста</td></tr>';
      }
      return;
    }

    const emptyRow = this.tradesTableBody.querySelector('.empty-row');
    if (emptyRow) emptyRow.remove();

    // Check for newly closed trades not yet in renderedTradesSet
    const currentSymbol = this.store.get('currentSymbol');
    for (const tr of paperAccount.tradeHistory) {
      if (this.renderedTradesSet.has(tr.id)) continue;
      this.renderedTradesSet.add(tr.id);

      const isLong = tr.side === 'BUY';
      const isActive = tr.symbol === currentSymbol;
      const pnlClass = tr.pnl >= 0 ? 'text-positive' : 'text-negative';
      const symbolHtml = `<span class="table-symbol-link ${isActive ? 'active' : ''}" data-switch-symbol="${tr.symbol}" title="${isActive ? 'Текущий график ' + tr.symbol : 'Открыть график ' + tr.symbol}">${tr.symbol}</span>`;
      const row = document.createElement('tr');
      row.setAttribute('data-trade-id', tr.id);
      row.innerHTML = `
        <td data-field="symbol">${symbolHtml}</td>
        <td><span class="badge-side ${isLong ? 'long' : 'short'}">${isLong ? 'LONG' : 'SHORT'}</span></td>
        <td>${tr.lots} (${tr.qty} шт.)</td>
        <td>${tr.entryPrice.toFixed(2)} ₽</td>
        <td>${tr.exitPrice.toFixed(2)} ₽</td>
        <td class="${pnlClass}"><strong>${tr.pnl >= 0 ? '+' : ''}${tr.pnl.toFixed(2)} ₽</strong></td>
        <td class="${pnlClass}">${tr.pnlPercent >= 0 ? '+' : ''}${tr.pnlPercent.toFixed(2)}%</td>
        <td><span style="font-size: 11px; font-weight: 600;">${tr.reason}</span></td>
        <td style="font-size: 11px; color: var(--tv-text-muted);">${tr.totalCommission} ₽</td>
        <td style="font-size: 11px; color: var(--tv-text-muted);">${formatTimestamp(tr.openTime)}</td>
        <td style="font-size: 11px; color: var(--tv-text-muted);">${formatTimestamp(tr.closeTime)}</td>
      `;
      // Prepend newest trade at top of table
      this.tradesTableBody.insertBefore(row, this.tradesTableBody.firstChild);
    }
  }

  renderAnalytics(m) {
    if (this.statTotalTrades) this.statTotalTrades.textContent = m.totalTrades;
    if (this.statWinLossRatio) this.statWinLossRatio.textContent = `${m.winningTrades} прибыльных / ${m.losingTrades} убыточных`;
    if (this.statWinRate) this.statWinRate.textContent = `${m.winRate}%`;
    if (this.statProfitFactor) this.statProfitFactor.textContent = m.profitFactor.toFixed(2);
    if (this.statGrossProfitLoss) this.statGrossProfitLoss.textContent = `Прибыль: +${m.grossProfit.toFixed(2)} ₽ / Убыток: -${m.grossLoss.toFixed(2)} ₽`;
    if (this.statMaxDD) this.statMaxDD.textContent = `-${m.maxDrawdownRub.toFixed(2)} ₽ (-${m.maxDrawdownPct}%)`;
    if (this.statAvgWin) this.statAvgWin.textContent = `+${m.avgWin.toFixed(2)} ₽`;
    if (this.statAvgLoss) this.statAvgLoss.textContent = `-${m.avgLoss.toFixed(2)} ₽`;
    if (this.statReturnPct) this.statReturnPct.textContent = `${m.returnPct >= 0 ? '+' : ''}${m.returnPct.toFixed(2)}%`;
    if (this.statInitialCapital) this.statInitialCapital.textContent = `Стартовый капитал: ${formatMoney(m.initialBalance)}`;
  }

  // --- TradingView-style Vertical Panel Resizer ---
  initResizer() {
    this.bottomPanel = document.getElementById('tvBottomPanel') || document.querySelector('.tv-bottom-panel');
    this.panelResizer = document.getElementById('bottomPanelResizer');
    this.bottomHeader = document.querySelector('.bottom-panel-header');

    if (!this.bottomPanel || !this.panelResizer) return;

    this.headerHeight = 36; // Exact height of the tab bar header & active blue line
    this.minHeight = this.headerHeight; // Cannot shrink smaller than this line
    this.defaultHeight = 210;
    this.lastExpandedHeight = 210;

    // Restore saved height and state from localStorage
    this.restoreSavedHeight();

    let isDragging = false;
    let startY = 0;
    let startHeight = 0;

    const onPointerDown = (e) => {
      if (e.button !== 0) return; // Only primary mouse button
      e.preventDefault();
      e.stopPropagation();

      isDragging = true;
      startY = e.clientY;
      startHeight = this.bottomPanel.offsetHeight;

      this.bottomPanel.classList.add('resizing');
      this.panelResizer.classList.add('active');
      document.body.classList.add('resizing-dock');

      try {
        if (this.panelResizer.setPointerCapture) {
          this.panelResizer.setPointerCapture(e.pointerId);
        }
      } catch (err) {}

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;

      const deltaY = startY - e.clientY; // Dragging UP increases height
      let newHeight = startHeight + deltaY;

      // Minimum constraint: "эта же линия ограничивает уменьшение" (cannot be smaller than 36px header)
      const maxHeight = Math.max(120, window.innerHeight - 120);
      newHeight = Math.max(this.minHeight, Math.min(maxHeight, newHeight));

      this.setHeight(newHeight, false);
    };

    const onPointerUp = (e) => {
      if (!isDragging) return;
      isDragging = false;

      this.bottomPanel.classList.remove('resizing');
      this.panelResizer.classList.remove('active');
      document.body.classList.remove('resizing-dock');

      try {
        if (this.panelResizer.releasePointerCapture && e.pointerId !== undefined) {
          this.panelResizer.releasePointerCapture(e.pointerId);
        }
      } catch (err) {}

      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      this.saveHeight();
    };

    this.panelResizer.addEventListener('pointerdown', onPointerDown);

    // Double-click on resizer line to toggle collapse / expand
    this.panelResizer.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.toggleCollapse();
    });

    // Double-click on header background (excluding buttons) to toggle collapse
    if (this.bottomHeader) {
      this.bottomHeader.addEventListener('dblclick', (e) => {
        if (e.target.closest('button, .metric-item, .dock-tab-badge')) return;
        this.toggleCollapse();
      });
    }
  }

  setHeight(height, save = true) {
    if (!this.bottomPanel) return;

    const maxHeight = Math.max(120, window.innerHeight - 120);
    const h = Math.max(this.minHeight, Math.min(maxHeight, Math.round(height)));
    this.bottomPanel.style.height = `${h}px`;

    const isCollapsed = h <= this.minHeight + 2;
    this.bottomPanel.classList.toggle('collapsed', isCollapsed);

    if (!isCollapsed) {
      this.lastExpandedHeight = h;
    }

    if (save) {
      this.saveHeight();
    }

    // Synchronize chart canvas size immediately
    const chartEl = document.getElementById('chart');
    if (this.store.chart && chartEl) {
      const w = chartEl.clientWidth;
      const ch = chartEl.clientHeight;
      if (w > 0 && ch > 0) {
        this.store.chart.applySize(w, ch);
      }
    }
  }

  toggleCollapse() {
    if (!this.bottomPanel) return;
    if (this.bottomPanel.offsetHeight <= this.minHeight + 2) {
      const targetH = Math.max(120, this.lastExpandedHeight || this.defaultHeight);
      this.setHeight(targetH);
      showToast('Панель развернута', 'info');
    } else {
      this.lastExpandedHeight = this.bottomPanel.offsetHeight;
      this.setHeight(this.minHeight);
      showToast('Панель свернута (нажмите на вкладку или потяните линию для раскрытия)', 'info');
    }
  }

  saveHeight() {
    if (!this.bottomPanel) return;
    try {
      const currentHeight = this.bottomPanel.offsetHeight;
      const isCollapsed = currentHeight <= this.minHeight + 2;
      localStorage.setItem('trading_simulator_dock_height', String(this.lastExpandedHeight || this.defaultHeight));
      localStorage.setItem('trading_simulator_dock_collapsed', isCollapsed ? '1' : '0');
    } catch (e) {}
  }

  restoreSavedHeight() {
    if (!this.bottomPanel) return;
    try {
      const savedHeight = localStorage.getItem('trading_simulator_dock_height');
      const isCollapsed = localStorage.getItem('trading_simulator_dock_collapsed') === '1';

      if (savedHeight) {
        const parsed = parseInt(savedHeight, 10);
        if (!isNaN(parsed) && parsed >= this.minHeight) {
          this.lastExpandedHeight = parsed;
        }
      }

      if (isCollapsed) {
        this.setHeight(this.minHeight, false);
      } else if (this.lastExpandedHeight) {
        this.setHeight(this.lastExpandedHeight, false);
      }
    } catch (e) {}
  }
}

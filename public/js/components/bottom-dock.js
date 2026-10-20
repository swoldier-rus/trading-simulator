// components/bottom-dock.js - Bottom Trading Dock Component (Positions, Orders, Trades, Stats)
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

    this.init();
  }

  init() {
    this.initTabs();
    this.initActionButtons();
    this.initTableDelegation();

    eventBus.on('account:update', (metrics) => {
      this.update(metrics);
    });
  }

  initTabs() {
    this.bottomTabs.forEach(tab => {
      tab.onclick = () => {
        this.bottomTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const target = tab.getAttribute('data-tab');
        if (this.positionsView) this.positionsView.style.display = target === 'positions' ? 'block' : 'none';
        if (this.ordersView) this.ordersView.style.display = target === 'orders' ? 'block' : 'none';
        if (this.tradesView) this.tradesView.style.display = target === 'trades' ? 'block' : 'none';
        if (this.analyticsView) this.analyticsView.style.display = target === 'analytics' ? 'block' : 'none';
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
      };
    }

    if (this.btnResetAccount) {
      this.btnResetAccount.onclick = () => {
        const paperAccount = this.store.paperAccount;
        if (!paperAccount) return;
        if (confirm('Сбросить весь торговый счет, баланс и историю симуляции?')) {
          paperAccount.reset();
          showToast('Счет симулятора сброшен к исходному состоянию', 'info');
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
    if (this.positionsTableBody) {
      this.positionsTableBody.addEventListener('click', (e) => {
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
        const cancelBtn = e.target.closest('[data-cancel-order]');
        if (cancelBtn) {
          e.stopPropagation();
          const id = cancelBtn.getAttribute('data-cancel-order');
          this.handleCancelOrder(id);
          return;
        }
      });
    }
  }

  handleClosePosition(id) {
    const simulator = this.store.simulator;
    const paperAccount = this.store.paperAccount;
    if (!paperAccount) return;

    const currentBar = simulator ? simulator.getCurrentBar() : null;
    const pos = paperAccount.positions.find(p => p.id === id || p.symbol === id);
    if (!pos) return;

    const execPrice = currentBar ? currentBar.close : pos.currentPrice;
    const res = paperAccount.closePosition(pos.id, execPrice, currentBar ? currentBar.time : null, 'Вручную');
    if (res.ok) {
      const pnlSign = res.trade.pnl >= 0 ? '+' : '';
      showToast(`Позиция закрыта: ${pnlSign}${formatMoney(res.trade.pnl)}`, res.trade.pnl >= 0 ? 'success' : 'info');
    }
  }

  handleReversePosition(id) {
    const simulator = this.store.simulator;
    const paperAccount = this.store.paperAccount;
    if (!paperAccount) return;

    const pos = paperAccount.positions.find(p => p.id === id || p.symbol === id);
    if (pos) {
      const bar = simulator ? simulator.getCurrentBar() : null;
      paperAccount.reversePosition(pos.id, bar ? bar.close : pos.currentPrice, bar ? bar.time : null);
      showToast(`Позиция ${pos.symbol} перевернута!`, 'info');
    }
  }

  handleCancelOrder(id) {
    const paperAccount = this.store.paperAccount;
    if (!paperAccount) return;

    const res = paperAccount.cancelOrder(id);
    if (res.ok) {
      showToast('Заявка отменена', 'info');
    }
  }

  update(metrics) {
    if (!metrics) return;

    // Metrics Bar
    if (this.metricBalance) this.metricBalance.textContent = formatMoney(metrics.balance);
    if (this.metricEquity) this.metricEquity.textContent = formatMoney(metrics.equity);

    if (this.metricPnL) {
      this.metricPnL.textContent = `${metrics.unrealizedPnL >= 0 ? '+' : ''}${formatMoney(metrics.unrealizedPnL)}`;
      this.metricPnL.className = `metric-value ${metrics.unrealizedPnL >= 0 ? 'positive' : 'negative'}`;
    }

    if (this.metricWinrate) {
      this.metricWinrate.textContent = `${metrics.winRate}% (${metrics.winningTrades}/${metrics.totalTrades})`;
    }

    // Badges
    if (this.badgePositions) this.badgePositions.textContent = metrics.openPositionsCount;
    if (this.badgeOrders) this.badgeOrders.textContent = metrics.workingOrdersCount;
    if (this.badgeTrades) this.badgeTrades.textContent = metrics.totalTrades;

    // Tables
    this.renderPositionsTable();
    this.renderOrdersTable();
    this.renderTradesTable();
    this.renderAnalytics(metrics);
  }

  renderPositionsTable() {
    if (!this.positionsTableBody) return;
    const paperAccount = this.store.paperAccount;
    if (!paperAccount || paperAccount.positions.length === 0) {
      this.positionsTableBody.innerHTML = '<tr class="empty-row"><td colspan="11">Нет открытых позиций</td></tr>';
      return;
    }

    this.positionsTableBody.innerHTML = paperAccount.positions.map(pos => {
      const isLong = pos.side === 'BUY';
      const pnlClass = pos.unrealizedPnL >= 0 ? 'text-positive' : 'text-negative';
      return `
        <tr>
          <td><strong>${pos.symbol}</strong></td>
          <td><span class="badge-side ${isLong ? 'long' : 'short'}">${isLong ? 'LONG' : 'SHORT'}</span></td>
          <td>${pos.lots}</td>
          <td>${pos.qty}</td>
          <td>${pos.entryPrice.toFixed(2)} ₽</td>
          <td>${pos.currentPrice.toFixed(2)} ₽</td>
          <td>${pos.sl ? pos.sl.toFixed(2) + ' ₽' : '—'}</td>
          <td>${pos.tp ? pos.tp.toFixed(2) + ' ₽' : '—'}</td>
          <td class="${pnlClass}"><strong>${pos.unrealizedPnL >= 0 ? '+' : ''}${pos.unrealizedPnL.toFixed(2)} ₽</strong></td>
          <td class="${pnlClass}">${pos.unrealizedPnLPercent >= 0 ? '+' : ''}${pos.unrealizedPnLPercent.toFixed(2)}%</td>
          <td>
            <div style="display: flex; gap: 4px;">
              <button class="table-action-btn btn-close-pos" data-close-pos="${pos.id}">✕ Закрыть</button>
              <button class="table-action-btn btn-reverse-pos" data-reverse-pos="${pos.id}">⇄ Перевернуть</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  renderOrdersTable() {
    if (!this.ordersTableBody) return;
    const paperAccount = this.store.paperAccount;
    if (!paperAccount || paperAccount.orders.length === 0) {
      this.ordersTableBody.innerHTML = '<tr class="empty-row"><td colspan="9">Нет активных заявок</td></tr>';
      return;
    }

    this.ordersTableBody.innerHTML = paperAccount.orders.map(ord => {
      const isLong = ord.side === 'BUY';
      return `
        <tr>
          <td><span style="font-family: monospace; font-size: 11px;">${ord.id.slice(-6)}</span></td>
          <td><strong>${ord.symbol}</strong></td>
          <td><span style="font-weight: 600;">${ord.type}</span></td>
          <td><span class="badge-side ${isLong ? 'long' : 'short'}">${isLong ? 'BUY' : 'SELL'}</span></td>
          <td>${ord.lots} (${ord.qty} шт.)</td>
          <td><strong>${ord.price.toFixed(2)} ₽</strong></td>
          <td>SL: ${ord.sl || '—'} / TP: ${ord.tp || '—'}</td>
          <td style="font-size: 11px; color: var(--tv-text-muted);">${formatTimestamp(ord.createdTime)}</td>
          <td>
            <button class="table-action-btn" data-cancel-order="${ord.id}" style="color: #f23645;">✕ Отменить</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  renderTradesTable() {
    if (!this.tradesTableBody) return;
    const paperAccount = this.store.paperAccount;
    if (!paperAccount || paperAccount.tradeHistory.length === 0) {
      this.tradesTableBody.innerHTML = '<tr class="empty-row"><td colspan="11">История сделок пуста</td></tr>';
      return;
    }

    this.tradesTableBody.innerHTML = paperAccount.tradeHistory.map(tr => {
      const isLong = tr.side === 'BUY';
      const pnlClass = tr.pnl >= 0 ? 'text-positive' : 'text-negative';
      return `
        <tr>
          <td><strong>${tr.symbol}</strong></td>
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
        </tr>
      `;
    }).join('');
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
}

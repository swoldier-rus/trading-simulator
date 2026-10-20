// components/quick-trade-widget.js - TradingView-style On-Chart Instant Buy/Sell Execution Widget
import { eventBus } from '../core/event-bus.js';
import { showToast } from '../core/utils.js';

export class QuickTradeWidgetComponent {
  constructor(store) {
    this.store = store;

    // DOM Elements
    this.widgetEl = document.getElementById('chartQuickTradeWidget');
    this.btnQuickSell = document.getElementById('btnQuickSell');
    this.btnQuickBuy = document.getElementById('btnQuickBuy');
    this.quickSellPrice = document.getElementById('quickSellPrice');
    this.quickBuyPrice = document.getElementById('quickBuyPrice');
    this.quickSpreadText = document.getElementById('quickSpreadText');
    this.inputQuickLots = document.getElementById('inputQuickLots');
    this.btnQuickQtyDec = document.getElementById('btnQuickQtyDec');
    this.btnQuickQtyInc = document.getElementById('btnQuickQtyInc');

    this.init();
  }

  init() {
    if (!this.widgetEl) return;

    this.initLotsControls();
    this.initButtons();

    // Event bus listeners
    eventBus.on('bar:tick', (bar) => {
      this.updatePrice(bar);
    });

    eventBus.on('symbol:change', () => {
      this.refreshToCurrentBar();
    });

    eventBus.on('replay:ui-update', () => {
      this.refreshToCurrentBar();
    });

    // Initial update if simulator has data
    this.refreshToCurrentBar();
  }

  initLotsControls() {
    if (this.btnQuickQtyDec) {
      this.btnQuickQtyDec.onclick = (e) => {
        e.stopPropagation();
        this.changeLots(-1);
      };
    }

    if (this.btnQuickQtyInc) {
      this.btnQuickQtyInc.onclick = (e) => {
        e.stopPropagation();
        this.changeLots(1);
      };
    }

    if (this.inputQuickLots) {
      this.inputQuickLots.oninput = () => {
        const val = Math.max(1, Math.min(10000, Number(this.inputQuickLots.value) || 1));
        this.syncLotsToPanel(val);
      };
    }
  }

  changeLots(delta) {
    const cur = Number(this.inputQuickLots ? this.inputQuickLots.value : 1) || 1;
    const next = Math.max(1, Math.min(10000, cur + delta));
    if (this.inputQuickLots) {
      this.inputQuickLots.value = next;
    }
    this.syncLotsToPanel(next);
  }

  syncLotsToPanel(lots) {
    // Sync with order panel input if present
    const panelInput = document.getElementById('inputLots');
    if (panelInput && Number(panelInput.value) !== lots) {
      panelInput.value = lots;
      panelInput.dispatchEvent(new Event('input'));
    }
  }

  initButtons() {
    if (this.btnQuickBuy) {
      this.btnQuickBuy.onclick = (e) => {
        e.stopPropagation();
        this.executeQuickOrder('BUY');
      };
    }

    if (this.btnQuickSell) {
      this.btnQuickSell.onclick = (e) => {
        e.stopPropagation();
        this.executeQuickOrder('SELL');
      };
    }
  }

  executeQuickOrder(side) {
    const simulator = this.store.simulator;
    const paperAccount = this.store.paperAccount;
    if (!simulator || !paperAccount) return;

    const currentBar = simulator.getCurrentBar();
    if (!currentBar) {
      showToast('Нет данных свечей для мгновенной сделки', 'error');
      return;
    }

    const lots = Number(this.inputQuickLots ? this.inputQuickLots.value : 1) || 1;
    const symbol = this.store.get('currentSymbol');
    const lotSize = this.store.get('currentLotSize') || 1;
    const price = currentBar.close;

    const res = paperAccount.placeOrder({
      symbol,
      side,
      type: 'MARKET',
      qty: lots,
      price,
      sl: null,
      tp: null,
      time: currentBar.time,
      lotSize
    });

    if (res.ok) {
      showToast(res.message, 'success');
      // Auto enable replay mode if not active so trading simulation starts
      if (!simulator.isReplayActive) {
        simulator.enableReplay();
      }
    } else {
      showToast(res.error, 'error');
    }
  }

  updatePrice(bar) {
    if (!bar) return;
    const formatted = bar.close.toFixed(2).replace('.', ',');
    if (this.quickSellPrice) this.quickSellPrice.textContent = formatted;
    if (this.quickBuyPrice) this.quickBuyPrice.textContent = formatted;
  }

  refreshToCurrentBar() {
    const sim = this.store.simulator;
    const current = sim ? sim.getCurrentBar() : null;
    if (current) {
      this.updatePrice(current);
    }
  }
}

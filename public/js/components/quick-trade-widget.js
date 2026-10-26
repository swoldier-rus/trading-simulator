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
      if (this.store.multiChart && this.store.multiChart.activeSlotId > 0) {
        this.refreshToCurrentBar();
      } else {
        this.updatePrice(bar);
      }
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

    // Bidirectional sync with order-panel lots input
    const panelInput = document.getElementById('inputLots');
    if (panelInput) {
      panelInput.addEventListener('input', () => {
        const val = Math.max(1, Math.min(10000, Number(panelInput.value) || 1));
        if (this.inputQuickLots && Number(this.inputQuickLots.value) !== val) {
          this.inputQuickLots.value = val;
        }
      });
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
    if (this.store.get('isSymbolLoading')) {
      showToast('Котировки инструмента загружаются, пожалуйста подождите...', 'warning');
      return;
    }

    const simulator = this.store.simulator;
    const paperAccount = this.store.paperAccount;
    if (!simulator || !paperAccount) return;

    const activeSlotId = this.store.multiChart ? this.store.multiChart.activeSlotId : 0;
    const activeSlot = (activeSlotId > 0 && this.store.multiChart) ? this.store.multiChart.slots.get(activeSlotId) : null;
    const symbol = activeSlot ? activeSlot.symbol : this.store.get('currentSymbol');

    let currentBar = null;
    if (activeSlot && activeSlot.currentVisibleCandles && activeSlot.currentVisibleCandles.length > 0) {
      currentBar = activeSlot.currentVisibleCandles[activeSlot.currentVisibleCandles.length - 1];
    } else {
      currentBar = simulator.getCurrentBar();
    }

    if (!currentBar) {
      showToast('Нет данных свечей для мгновенной сделки', 'error');
      return;
    }

    const lots = Number(this.inputQuickLots ? this.inputQuickLots.value : 1) || 1;
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
      lotSize,
      instrumentType: this.store.get('currentInstrumentType') || 'share'
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

  setLoading(isLoading) {
    if (this.btnQuickSell) {
      this.btnQuickSell.disabled = !!isLoading;
      this.btnQuickSell.classList.toggle('loading', !!isLoading);
    }
    if (this.btnQuickBuy) {
      this.btnQuickBuy.disabled = !!isLoading;
      this.btnQuickBuy.classList.toggle('loading', !!isLoading);
    }
    if (isLoading) {
      if (this.quickSellPrice) this.quickSellPrice.textContent = '—';
      if (this.quickBuyPrice) this.quickBuyPrice.textContent = '—';
    } else {
      this.refreshToCurrentBar();
    }
  }

  updatePrice(bar) {
    if (!bar || this.store.get('isSymbolLoading')) return;
    const formatted = bar.close.toFixed(2).replace('.', ',');
    if (this.quickSellPrice) this.quickSellPrice.textContent = formatted;
    if (this.quickBuyPrice) this.quickBuyPrice.textContent = formatted;
  }

  refreshToCurrentBar() {
    if (this.store.get('isSymbolLoading')) return;
    const activeSlotId = this.store.multiChart ? this.store.multiChart.activeSlotId : 0;
    const activeSlot = (activeSlotId > 0 && this.store.multiChart) ? this.store.multiChart.slots.get(activeSlotId) : null;
    let current = null;
    if (activeSlot && activeSlot.currentVisibleCandles && activeSlot.currentVisibleCandles.length > 0) {
      current = activeSlot.currentVisibleCandles[activeSlot.currentVisibleCandles.length - 1];
    } else {
      const sim = this.store.simulator;
      current = sim ? sim.getCurrentBar() : null;
    }
    if (current) {
      this.updatePrice(current);
    }
  }
}

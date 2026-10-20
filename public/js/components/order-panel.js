// components/order-panel.js - TradingView-style Right Side Order Ticket Panel Component
import { eventBus } from '../core/event-bus.js';
import { formatRussianPrice, formatMoney, showToast } from '../core/utils.js';

export class OrderPanelComponent {
  constructor(store) {
    this.store = store;

    // DOM Elements
    this.tvOrderPanel = document.getElementById('tvOrderPanel');
    this.btnToggleOrderPanel = document.getElementById('btnToggleOrderPanel');
    this.btnCloseOrderPanel = document.getElementById('btnCloseOrderPanel');
    this.tabNavOrder = document.getElementById('tabNavOrder');
    this.tabNavDOM = document.getElementById('tabNavDOM');

    // Direction buttons & price labels
    this.btnDirectionSell = document.getElementById('btnDirectionSell');
    this.btnDirectionBuy = document.getElementById('btnDirectionBuy');
    this.panelSellPrice = document.getElementById('panelSellPrice');
    this.panelBuyPrice = document.getElementById('panelBuyPrice');
    this.panelSpreadBadge = document.getElementById('panelSpreadBadge');

    // Order type tabs
    this.panelTypeBtns = document.querySelectorAll('.panel-type-btn');
    this.rowLimitPrice = document.getElementById('rowLimitPrice');
    this.inputLimitPrice = document.getElementById('inputLimitPrice');

    // Quantity / Lots
    this.inputLots = document.getElementById('inputLots');
    this.lotsInfoText = document.getElementById('lotsInfoText');
    this.panelLotEquivVal = document.getElementById('panelLotEquivVal');
    this.panelChips = document.querySelectorAll('.panel-chip[data-lots]');

    // Metrics summary
    this.rrNotional = document.getElementById('rrNotional');
    this.panelAvailMargin = document.getElementById('panelAvailMargin');
    this.panelTickValue = document.getElementById('panelTickValue');

    // Exit Levels (Take Profit / Stop Loss)
    this.btnToggleExitLevels = document.getElementById('btnToggleExitLevels');
    this.sectionExitLevels = document.getElementById('sectionExitLevels');
    this.toggleTP = document.getElementById('toggleTP');
    this.boxTP = document.getElementById('boxTP');
    this.inputTP = document.getElementById('inputTP');
    this.rrReward = document.getElementById('rrReward');

    this.toggleSL = document.getElementById('toggleSL');
    this.boxSL = document.getElementById('boxSL');
    this.inputSL = document.getElementById('inputSL');
    this.rrRisk = document.getElementById('rrRisk');
    this.rowRRRatio = document.getElementById('rowRRRatio');
    this.rrRatio = document.getElementById('rrRatio');

    // Extra Settings
    this.btnToggleExtraSettings = document.getElementById('btnToggleExtraSettings');
    this.sectionExtraSettings = document.getElementById('sectionExtraSettings');

    // Action Submit Button
    this.btnPanelSubmit = document.getElementById('btnPanelSubmit');
    this.submitActionWord = document.getElementById('submitActionWord');
    this.submitActionDesc = document.getElementById('submitActionDesc');

    this.init();
  }

  init() {
    this.initDirectionControls();
    this.initOrderTypeTabs();
    this.initQuantityInputs();
    this.initExitLevels();
    this.initCollapsibles();
    this.initSubmitButton();
    this.initVisibilityControls();

    // Event bus listeners
    eventBus.on('bar:tick', (bar) => {
      this.updateQuickPrices(bar.close);
    });

    eventBus.on('orderpanel:toggle', () => {
      if (!this.tvOrderPanel) return;
      const isCollapsed = this.tvOrderPanel.classList.contains('collapsed');
      this.setVisible(isCollapsed);
    });

    eventBus.on('symbol:change', () => {
      this.updateLotsDisplay();
      this.updateSubmitButtonDesc();
      this.updateRiskRewardPreview();
    });
  }

  initDirectionControls() {
    if (this.btnDirectionBuy) {
      this.btnDirectionBuy.onclick = () => this.setSelectedSide('BUY');
    }
    if (this.btnDirectionSell) {
      this.btnDirectionSell.onclick = () => this.setSelectedSide('SELL');
    }
  }

  setSelectedSide(side) {
    this.store.set('currentSelectedSide', side);

    if (this.btnDirectionBuy && this.btnDirectionSell) {
      this.btnDirectionBuy.classList.toggle('active', side === 'BUY');
      this.btnDirectionSell.classList.toggle('active', side === 'SELL');
    }
    if (this.btnPanelSubmit) {
      this.btnPanelSubmit.className = `btn-panel-submit ${side === 'BUY' ? 'buy' : 'sell'}`;
    }
    if (this.submitActionWord) {
      this.submitActionWord.textContent = side === 'BUY' ? 'Купить' : 'Продать';
    }

    this.updateSubmitButtonDesc();
    this.updateRiskRewardPreview();
  }

  initOrderTypeTabs() {
    this.panelTypeBtns.forEach(btn => {
      btn.onclick = () => {
        this.panelTypeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const orderType = btn.getAttribute('data-order-type');
        this.store.set('selectedOrderType', orderType);

        if (orderType === 'MARKET') {
          if (this.rowLimitPrice) this.rowLimitPrice.style.display = 'none';
        } else {
          if (this.rowLimitPrice) this.rowLimitPrice.style.display = 'flex';
          const simulator = this.store.simulator;
          const currentBar = simulator ? simulator.getCurrentBar() : null;
          if (currentBar && this.inputLimitPrice && (!this.inputLimitPrice.value || this.inputLimitPrice.value === '0')) {
            this.inputLimitPrice.value = currentBar.close.toFixed(2);
          }
        }
        this.updateSubmitButtonDesc();
        this.updateRiskRewardPreview();
      };
    });
  }

  initQuantityInputs() {
    if (this.inputLots) {
      this.inputLots.oninput = () => {
        this.updateLotsDisplay();
        this.updateRiskRewardPreview();
      };
    }

    if (this.inputLimitPrice) {
      this.inputLimitPrice.oninput = () => this.updateRiskRewardPreview();
    }

    this.panelChips.forEach(chip => {
      chip.onclick = () => {
        this.panelChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const lots = Number(chip.getAttribute('data-lots')) || 1;
        if (this.inputLots) this.inputLots.value = lots;
        this.updateLotsDisplay();
        this.updateRiskRewardPreview();
      };
    });
  }

  getBasePriceForExitLevels() {
    const selectedOrderType = this.store.get('selectedOrderType');
    if (selectedOrderType !== 'MARKET' && this.inputLimitPrice) {
      const limitVal = Number(this.inputLimitPrice.value);
      if (limitVal > 0) return limitVal;
    }
    const sim = this.store.simulator;
    return sim && sim.getCurrentBar() ? sim.getCurrentBar().close : 0;
  }

  initExitLevels() {
    if (this.toggleTP) {
      this.toggleTP.onchange = () => {
        const enabled = this.toggleTP.checked;
        if (this.boxTP) {
          this.boxTP.style.opacity = enabled ? '1' : '0.45';
          this.boxTP.style.pointerEvents = enabled ? 'auto' : 'none';
        }
        if (this.inputTP) {
          this.inputTP.disabled = !enabled;
          if (enabled) {
            const base = this.getBasePriceForExitLevels();
            if (base > 0) {
              const side = this.store.get('currentSelectedSide');
              const tpSuggest = side === 'BUY' ? base * 1.015 : base * 0.985;
              this.inputTP.value = tpSuggest.toFixed(2);
            }
          }
        }
        this.updateRiskRewardPreview();
      };
    }

    if (this.toggleSL) {
      this.toggleSL.onchange = () => {
        const enabled = this.toggleSL.checked;
        if (this.boxSL) {
          this.boxSL.style.opacity = enabled ? '1' : '0.45';
          this.boxSL.style.pointerEvents = enabled ? 'auto' : 'none';
        }
        if (this.inputSL) {
          this.inputSL.disabled = !enabled;
          if (enabled) {
            const base = this.getBasePriceForExitLevels();
            if (base > 0) {
              const side = this.store.get('currentSelectedSide');
              const slSuggest = side === 'BUY' ? base * 0.99 : base * 1.01;
              this.inputSL.value = slSuggest.toFixed(2);
            }
          }
        }
        this.updateRiskRewardPreview();
      };
    }

    if (this.inputSL) this.inputSL.oninput = () => this.updateRiskRewardPreview();
    if (this.inputTP) this.inputTP.oninput = () => this.updateRiskRewardPreview();
  }

  initCollapsibles() {
    if (this.btnToggleExitLevels && this.sectionExitLevels) {
      this.btnToggleExitLevels.onclick = () => {
        this.sectionExitLevels.classList.toggle('collapsed');
      };
    }
    if (this.btnToggleExtraSettings && this.sectionExtraSettings) {
      this.btnToggleExtraSettings.onclick = () => {
        this.sectionExtraSettings.classList.toggle('collapsed');
      };
    }
  }

  initSubmitButton() {
    if (this.btnPanelSubmit) {
      this.btnPanelSubmit.onclick = () => {
        const side = this.store.get('currentSelectedSide');
        this.executeTrade(side);
      };
    }
  }

  initVisibilityControls() {
    if (this.btnCloseOrderPanel) {
      this.btnCloseOrderPanel.onclick = () => this.setVisible(false);
    }
  }

  setVisible(visible) {
    if (!this.tvOrderPanel) return;
    if (visible) {
      this.tvOrderPanel.classList.remove('collapsed');
      if (this.btnToggleOrderPanel) this.btnToggleOrderPanel.classList.add('active');
    } else {
      this.tvOrderPanel.classList.add('collapsed');
      if (this.btnToggleOrderPanel) this.btnToggleOrderPanel.classList.remove('active');
    }
    window.dispatchEvent(new Event('resize'));
  }

  executeTrade(side) {
    const simulator = this.store.simulator;
    const paperAccount = this.store.paperAccount;

    if (!simulator || !paperAccount) return;
    const currentBar = simulator.getCurrentBar();
    if (!currentBar) {
      showToast('Нет данных свечей для выставления заявки', 'error');
      return;
    }

    const lots = Number(this.inputLots.value) || 1;
    const hasSL = this.toggleSL ? this.toggleSL.checked : !!(this.inputSL && this.inputSL.value);
    const hasTP = this.toggleTP ? this.toggleTP.checked : !!(this.inputTP && this.inputTP.value);

    const sl = (hasSL && this.inputSL && this.inputSL.value) ? Number(this.inputSL.value) : null;
    const tp = (hasTP && this.inputTP && this.inputTP.value) ? Number(this.inputTP.value) : null;
    let orderPrice = currentBar.close;

    const selectedOrderType = this.store.get('selectedOrderType');
    if (selectedOrderType !== 'MARKET') {
      orderPrice = Number(this.inputLimitPrice.value);
      if (!orderPrice || orderPrice <= 0) {
        showToast('Пожалуйста, укажите цену для лимитной/стоп заявки', 'error');
        return;
      }

      // Validate SL and TP relative to order entry price to prevent instant stop-out
      if (sl !== null && sl > 0) {
        if (side === 'BUY' && sl >= orderPrice) {
          showToast(`Для покупки (BUY) Stop Loss (${sl.toFixed(2)} ₽) должен быть ниже цены входа (${orderPrice.toFixed(2)} ₽)!`, 'error');
          return;
        }
        if (side === 'SELL' && sl <= orderPrice) {
          showToast(`Для продажи (SELL) Stop Loss (${sl.toFixed(2)} ₽) должен быть выше цены входа (${orderPrice.toFixed(2)} ₽)!`, 'error');
          return;
        }
      }

      if (tp !== null && tp > 0) {
        if (side === 'BUY' && tp <= orderPrice) {
          showToast(`Для покупки (BUY) Take Profit (${tp.toFixed(2)} ₽) должен быть выше цены входа (${orderPrice.toFixed(2)} ₽)!`, 'error');
          return;
        }
        if (side === 'SELL' && tp >= orderPrice) {
          showToast(`Для продажи (SELL) Take Profit (${tp.toFixed(2)} ₽) должен быть ниже цены входа (${orderPrice.toFixed(2)} ₽)!`, 'error');
          return;
        }
      }
    }

    const res = paperAccount.placeOrder({
      symbol: this.store.get('currentSymbol'),
      side,
      type: selectedOrderType,
      qty: lots,
      price: orderPrice,
      sl,
      tp,
      time: currentBar.time,
      lotSize: this.store.get('currentLotSize')
    });

    if (res.ok) {
      showToast(res.message, 'success');
      if (!simulator.isReplayActive && selectedOrderType === 'MARKET') {
        simulator.enableReplay();
      }
    } else {
      showToast(res.error, 'error');
    }
  }

  updateLotsDisplay() {
    const lots = Number(this.inputLots ? this.inputLots.value : 1) || 1;
    const lotSize = this.store.get('currentLotSize');
    if (this.lotsInfoText) this.lotsInfoText.textContent = `${lots * lotSize} шт.`;

    this.panelChips.forEach(c => {
      c.classList.toggle('active', Number(c.getAttribute('data-lots')) === lots);
    });
  }

  updateSubmitButtonDesc() {
    const lots = Number(this.inputLots ? this.inputLots.value : 1) || 1;
    const selectedOrderType = this.store.get('selectedOrderType');
    const currentSymbol = this.store.get('currentSymbol');

    let typeName = 'МАРКЕТНАЯ';
    if (selectedOrderType === 'LIMIT') {
      const pr = Number(this.inputLimitPrice ? this.inputLimitPrice.value : 0) || 0;
      typeName = pr > 0 ? `ЛИМИТ @ ${formatRussianPrice(pr)}` : 'ЛИМИТНАЯ';
    } else if (selectedOrderType === 'STOP') {
      const pr = Number(this.inputLimitPrice ? this.inputLimitPrice.value : 0) || 0;
      typeName = pr > 0 ? `СТОП @ ${formatRussianPrice(pr)}` : 'СТОП';
    }

    if (this.submitActionDesc) {
      this.submitActionDesc.textContent = `${lots} ${currentSymbol} ${typeName}`;
    }
  }

  updateRiskRewardPreview() {
    const lots = Number(this.inputLots ? this.inputLots.value : 1) || 1;
    const lotSize = this.store.get('currentLotSize');
    const totalShares = lots * lotSize;

    const simulator = this.store.simulator;
    const paperAccount = this.store.paperAccount;
    const currentBar = simulator ? simulator.getCurrentBar() : null;
    const currentPrice = currentBar ? currentBar.close : 0;

    const selectedOrderType = this.store.get('selectedOrderType');
    const entryPrice = selectedOrderType === 'MARKET' ? currentPrice : (Number(this.inputLimitPrice ? this.inputLimitPrice.value : 0) || currentPrice);

    const notional = totalShares * entryPrice;
    if (this.rrNotional) this.rrNotional.textContent = formatMoney(notional);
    if (this.panelLotEquivVal) this.panelLotEquivVal.textContent = formatMoney(notional);

    if (this.panelAvailMargin && paperAccount) {
      this.panelAvailMargin.textContent = formatMoney(paperAccount.balance);
    }

    const hasSL = this.toggleSL ? this.toggleSL.checked : !!(this.inputSL && this.inputSL.value);
    const hasTP = this.toggleTP ? this.toggleTP.checked : !!(this.inputTP && this.inputTP.value);

    const sl = hasSL ? Number(this.inputSL ? this.inputSL.value : 0) : 0;
    const tp = hasTP ? Number(this.inputTP ? this.inputTP.value : 0) : 0;

    if (sl && sl > 0) {
      const riskPerShare = Math.abs(entryPrice - sl);
      const totalRisk = riskPerShare * totalShares;
      const pct = entryPrice > 0 ? ((riskPerShare / entryPrice) * 100).toFixed(1) : '0';
      if (this.rrRisk) this.rrRisk.textContent = `-${formatMoney(totalRisk)} (-${pct}%)`;
    } else {
      if (this.rrRisk) this.rrRisk.textContent = '— ₽';
    }

    if (tp && tp > 0) {
      const rewardPerShare = Math.abs(tp - entryPrice);
      const totalReward = rewardPerShare * totalShares;
      const pct = entryPrice > 0 ? ((rewardPerShare / entryPrice) * 100).toFixed(1) : '0';
      if (this.rrReward) this.rrReward.textContent = `+${formatMoney(totalReward)} (+${pct}%)`;
    } else {
      if (this.rrReward) this.rrReward.textContent = '— ₽';
    }

    if (sl && tp && sl > 0 && tp > 0) {
      const riskPerShare = Math.abs(entryPrice - sl);
      const rewardPerShare = Math.abs(tp - entryPrice);
      if (riskPerShare > 0) {
        const ratio = (rewardPerShare / riskPerShare).toFixed(1);
        if (this.rrRatio) this.rrRatio.textContent = `1 : ${ratio}`;
        if (this.rowRRRatio) this.rowRRRatio.style.display = 'flex';
      } else {
        if (this.rowRRRatio) this.rowRRRatio.style.display = 'none';
      }
    } else {
      if (this.rowRRRatio) this.rowRRRatio.style.display = 'none';
    }

    this.updateSubmitButtonDesc();
  }

  updateQuickPrices(closePrice) {
    if (!closePrice) return;
    if (this.panelSellPrice) this.panelSellPrice.textContent = formatRussianPrice(closePrice);
    if (this.panelBuyPrice) this.panelBuyPrice.textContent = formatRussianPrice(closePrice);
    if (this.panelSpreadBadge) this.panelSpreadBadge.textContent = '0,00';
    this.updateRiskRewardPreview();
  }
}

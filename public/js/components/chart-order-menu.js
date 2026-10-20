// components/chart-order-menu.js - TradingView-style On-Chart Order Context Menu Component
import { eventBus } from '../core/event-bus.js';
import { formatRussianPrice, formatMoney, showToast } from '../core/utils.js';

export class ChartOrderMenuComponent {
  constructor(store) {
    this.store = store;

    this.chartEl = document.getElementById('chart');
    this.chartContainer = this.chartEl ? this.chartEl.parentElement : null;
    this.priceAxisPlusBtn = document.getElementById('priceAxisPlusBtn');
    this.chartOrderMenu = document.getElementById('chartOrderMenu');

    // Menu internal elements
    this.btnMenuQtyDec = document.getElementById('btnMenuQtyDec');
    this.inputMenuLots = document.getElementById('inputMenuLots');
    this.btnMenuQtyInc = document.getElementById('btnMenuQtyInc');
    this.menuOrderChips = document.querySelectorAll('.chart-order-chips .order-chip');
    this.menuSharesInfo = document.getElementById('menuSharesInfo');

    this.btnMenuActionPrimary = document.getElementById('btnMenuActionPrimary');
    this.menuIconPrimary = document.getElementById('menuIconPrimary');
    this.menuTextPrimary = document.getElementById('menuTextPrimary');

    this.btnMenuActionSecondary = document.getElementById('btnMenuActionSecondary');
    this.menuIconSecondary = document.getElementById('menuIconSecondary');
    this.menuTextSecondary = document.getElementById('menuTextSecondary');

    this.btnMenuActionCustom = document.getElementById('btnMenuActionCustom');
    this.btnMenuResetScale = document.getElementById('btnMenuResetScale');
    this.btnMenuToggleExecutions = document.getElementById('btnMenuToggleExecutions');
    this.menuExecutionsCheck = document.getElementById('menuExecutionsCheck');

    // State
    this.menuTargetPrice = null;
    this.menuLots = 1;
    this.hoveredPrice = null;
    this.hoveredY = null;
    this.isMenuOpen = false;

    this.init();
  }

  init() {
    this.initMouseTracking();
    this.initMenuControls();

    // Close menu on Escape or click outside
    document.addEventListener('pointerdown', (e) => {
      if (this.isMenuOpen && this.chartOrderMenu && !this.chartOrderMenu.contains(e.target) && e.target !== this.priceAxisPlusBtn) {
        this.close();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isMenuOpen) {
        this.close();
      }
    });
  }

  initMouseTracking() {
    if (!this.chartContainer) return;

    // Right-click on chart -> open chart order menu at cursor price
    this.chartEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const chart = this.store.chart;
      if (this.chartContainer && chart) {
        const containerRect = this.chartContainer.getBoundingClientRect();
        const localX = e.clientX - containerRect.left;
        const localY = e.clientY - containerRect.top;
        const price = typeof chart.coordinateToPrice === 'function' ? chart.coordinateToPrice(localY) : null;
        if (price && price > 0) {
          this.open(price, localX, localY);
        }
      }
    });

    this.chartContainer.addEventListener('mousemove', (e) => {
      const chart = this.store.chart;
      const rect = this.chartContainer.getBoundingClientRect();
      const localY = e.clientY - rect.top;
      if (chart && localY >= 0 && localY <= rect.height) {
        const price = typeof chart.coordinateToPrice === 'function' ? chart.coordinateToPrice(localY) : null;
        if (price && price > 0) {
          this.hoveredPrice = price;
          this.hoveredY = localY;
          if (this.priceAxisPlusBtn) {
            this.priceAxisPlusBtn.style.top = `${localY - 11}px`;
            this.priceAxisPlusBtn.style.display = 'flex';
          }
        }
      }
    });

    this.chartContainer.addEventListener('mouseleave', (e) => {
      if (e.relatedTarget === this.priceAxisPlusBtn || (this.priceAxisPlusBtn && this.priceAxisPlusBtn.contains(e.relatedTarget))) {
        return;
      }
      if (!this.isMenuOpen && this.priceAxisPlusBtn) {
        this.priceAxisPlusBtn.style.display = 'none';
      }
    });

    if (this.priceAxisPlusBtn) {
      this.priceAxisPlusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.hoveredPrice && this.chartContainer) {
          const containerRect = this.chartContainer.getBoundingClientRect();
          this.open(this.hoveredPrice, containerRect.width - 340, this.hoveredY - 30);
        }
      });
    }
  }

  initMenuControls() {
    if (this.btnMenuQtyDec) {
      this.btnMenuQtyDec.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.menuLots > 1) {
          this.menuLots--;
          this.updateDisplay();
        }
      });
    }

    if (this.btnMenuQtyInc) {
      this.btnMenuQtyInc.addEventListener('click', (e) => {
        e.stopPropagation();
        this.menuLots++;
        this.updateDisplay();
      });
    }

    if (this.inputMenuLots) {
      this.inputMenuLots.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val) && val >= 1) {
          this.menuLots = val;
        }
        this.updateDisplay();
      });
    }

    this.menuOrderChips.forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = parseInt(chip.getAttribute('data-lots'), 10);
        if (!isNaN(val) && val > 0) {
          this.menuLots = val;
          this.updateDisplay();
        }
      });
    });

    if (this.btnMenuActionPrimary) {
      this.btnMenuActionPrimary.addEventListener('click', () => {
        this.executeChartOrder(this.btnMenuActionPrimary.dataset.side, this.btnMenuActionPrimary.dataset.type);
      });
    }

    if (this.btnMenuActionSecondary) {
      this.btnMenuActionSecondary.addEventListener('click', () => {
        this.executeChartOrder(this.btnMenuActionSecondary.dataset.side, this.btnMenuActionSecondary.dataset.type);
      });
    }

    if (this.btnMenuActionCustom) {
      this.btnMenuActionCustom.addEventListener('click', () => {
        this.close();
        const simulator = this.store.simulator;
        const currentBar = simulator ? simulator.getCurrentBar() : null;
        const currentPrice = currentBar ? currentBar.close : this.menuTargetPrice;
        const isAbove = this.menuTargetPrice >= currentPrice;
        const type = isAbove ? 'LIMIT' : 'STOP';

        this.store.set('selectedOrderType', type);
        const inputLimitPrice = document.getElementById('inputLimitPrice');
        const rowLimitPrice = document.getElementById('rowLimitPrice');
        const inputLots = document.getElementById('inputLots');

        if (rowLimitPrice) rowLimitPrice.style.display = 'flex';
        if (inputLimitPrice) inputLimitPrice.value = this.menuTargetPrice.toFixed(2);
        if (inputLots) inputLots.value = this.menuLots;

        eventBus.emit('orderpanel:custom', { price: this.menuTargetPrice, lots: this.menuLots, type });
        showToast(`Заявка по ${this.menuTargetPrice.toFixed(2)} ₽ перенесена в панель ордеров`, 'info');
      });
    }

    if (this.btnMenuResetScale) {
      this.btnMenuResetScale.addEventListener('click', () => {
        this.close();
        const chart = this.store.chart;
        if (chart && typeof chart.resetScale === 'function') {
          chart.resetScale();
          showToast('Состояние графика сброшено', 'info');
        }
      });
    }

    if (this.btnMenuToggleExecutions) {
      this.btnMenuToggleExecutions.addEventListener('click', () => {
        const current = this.store.get('showExecutionsOnChart') !== false;
        const next = !current;
        this.store.set('showExecutionsOnChart', next);
        eventBus.emit('executions:toggle', next);
        showToast(next ? 'Отображение сделок на графике включено' : 'Отображение сделок на графике скрыто', 'info');
        this.close();
      });
    }

    if (this.chartOrderMenu) {
      this.chartOrderMenu.addEventListener('pointerdown', e => e.stopPropagation());
      this.chartOrderMenu.addEventListener('click', e => e.stopPropagation());
    }
  }

  open(price, clientX, clientY) {
    if (!price || isNaN(price)) return;
    this.menuTargetPrice = Number(price);
    this.isMenuOpen = true;

    const inputLots = document.getElementById('inputLots');
    const panelLots = inputLots ? Number(inputLots.value) : 1;
    if (panelLots && panelLots > 0) {
      this.menuLots = panelLots;
    }

    this.updateDisplay();

    if (this.menuExecutionsCheck) {
      const showExecs = this.store.get('showExecutionsOnChart') !== false;
      this.menuExecutionsCheck.textContent = showExecs ? '✓' : '';
      this.menuExecutionsCheck.style.color = showExecs ? 'var(--tv-blue, #2962ff)' : 'transparent';
    }

    if (!this.chartContainer || !this.chartOrderMenu) return;

    const containerRect = this.chartContainer.getBoundingClientRect();
    let left = clientX;
    let top = clientY;
    const menuWidth = 320;
    const menuHeight = 230;

    if (left + menuWidth > containerRect.width - 15) {
      left = containerRect.width - menuWidth - 65;
    }
    if (left < 10) left = 10;

    if (top + menuHeight > containerRect.height - 15) {
      top = containerRect.height - menuHeight - 15;
    }
    if (top < 10) top = 10;

    this.chartOrderMenu.style.left = `${left}px`;
    this.chartOrderMenu.style.top = `${top}px`;
    this.chartOrderMenu.style.display = 'block';
  }

  close() {
    this.isMenuOpen = false;
    if (this.chartOrderMenu) {
      this.chartOrderMenu.style.display = 'none';
    }
  }

  updateDisplay() {
    if (!this.menuTargetPrice || this.menuTargetPrice <= 0) return;

    if (this.inputMenuLots) {
      this.inputMenuLots.value = this.menuLots;
    }

    this.menuOrderChips.forEach(chip => {
      const chipLots = Number(chip.getAttribute('data-lots'));
      chip.classList.toggle('active', chipLots === this.menuLots);
    });

    const lotSize = this.store.get('currentLotSize');
    const totalShares = this.menuLots * lotSize;
    const notional = totalShares * this.menuTargetPrice;
    if (this.menuSharesInfo) {
      this.menuSharesInfo.textContent = `${totalShares.toLocaleString('ru-RU')} шт. • ${formatMoney(notional)}`;
    }

    const simulator = this.store.simulator;
    const currentBar = simulator ? simulator.getCurrentBar() : null;
    const currentPrice = currentBar ? currentBar.close : this.menuTargetPrice;
    const formattedPrice = formatRussianPrice(this.menuTargetPrice);
    const currentSymbol = this.store.get('currentSymbol');

    if (this.menuTargetPrice >= currentPrice) {
      if (this.menuIconPrimary) {
        this.menuIconPrimary.className = 'action-icon sell';
        this.menuIconPrimary.textContent = '∨';
      }
      if (this.menuTextPrimary) {
        this.menuTextPrimary.textContent = `Продать ${currentSymbol} Лимит ${this.menuLots} @ ${formattedPrice}`;
      }
      if (this.btnMenuActionPrimary) {
        this.btnMenuActionPrimary.dataset.side = 'SELL';
        this.btnMenuActionPrimary.dataset.type = 'LIMIT';
      }

      if (this.menuIconSecondary) {
        this.menuIconSecondary.className = 'action-icon buy';
        this.menuIconSecondary.textContent = '∧';
      }
      if (this.menuTextSecondary) {
        this.menuTextSecondary.textContent = `Купить ${currentSymbol} Стоп ${this.menuLots} @ ${formattedPrice}`;
      }
      if (this.btnMenuActionSecondary) {
        this.btnMenuActionSecondary.dataset.side = 'BUY';
        this.btnMenuActionSecondary.dataset.type = 'STOP';
      }
    } else {
      if (this.menuIconPrimary) {
        this.menuIconPrimary.className = 'action-icon buy';
        this.menuIconPrimary.textContent = '∧';
      }
      if (this.menuTextPrimary) {
        this.menuTextPrimary.textContent = `Купить ${currentSymbol} Лимит ${this.menuLots} @ ${formattedPrice}`;
      }
      if (this.btnMenuActionPrimary) {
        this.btnMenuActionPrimary.dataset.side = 'BUY';
        this.btnMenuActionPrimary.dataset.type = 'LIMIT';
      }

      if (this.menuIconSecondary) {
        this.menuIconSecondary.className = 'action-icon sell';
        this.menuIconSecondary.textContent = '∨';
      }
      if (this.menuTextSecondary) {
        this.menuTextSecondary.textContent = `Продать ${currentSymbol} Стоп ${this.menuLots} @ ${formattedPrice}`;
      }
      if (this.btnMenuActionSecondary) {
        this.btnMenuActionSecondary.dataset.side = 'SELL';
        this.btnMenuActionSecondary.dataset.type = 'STOP';
      }
    }
  }

  executeChartOrder(side, type) {
    if (!this.menuTargetPrice || !this.menuLots) return;
    const simulator = this.store.simulator;
    const paperAccount = this.store.paperAccount;
    if (!simulator || !paperAccount) return;

    const currentBar = simulator.getCurrentBar();
    if (!currentBar) {
      showToast('Нет данных свечей для выставления заявки', 'error');
      return;
    }

    const cleanPrice = this.menuTargetPrice >= 10 ? Number(this.menuTargetPrice.toFixed(2)) : Number(this.menuTargetPrice.toFixed(4));

    const res = paperAccount.placeOrder({
      symbol: this.store.get('currentSymbol'),
      side,
      type,
      qty: this.menuLots,
      price: cleanPrice,
      sl: null,
      tp: null,
      time: currentBar.time,
      lotSize: this.store.get('currentLotSize')
    });

    if (res.ok) {
      showToast(res.message, 'success');
      this.close();
    } else {
      showToast(res.error, 'error');
    }
  }
}

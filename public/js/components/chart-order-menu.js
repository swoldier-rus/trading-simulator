// components/chart-order-menu.js - TradingView-style On-Chart Order Context Menu Component
import { eventBus } from '../core/event-bus.js';
import { formatRussianPrice, formatMoney, showToast } from '../core/utils.js';

export class ChartOrderMenuComponent {
  constructor(store) {
    this.store = store;

    this.chartEl = document.getElementById('chart');
    this.chartContainer = this.chartEl ? this.chartEl.parentElement : null;
    this.gridWrapper = document.getElementById('chartGridWrapper') || this.chartContainer;
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

    // Time Scale Context Menu Elements
    this.timeScaleContextMenu = document.getElementById('timeScaleContextMenu');
    this.btnTimeScaleReset = document.getElementById('btnTimeScaleReset');
    this.btnTimeScaleOpenSettings = document.getElementById('btnTimeScaleOpenSettings');
    this.isTimeScaleMenuOpen = false;

    // Price Scale Context Menu Elements
    this.priceScaleContextMenu = document.getElementById('priceScaleContextMenu');
    this.btnPriceScaleReset = document.getElementById('btnPriceScaleReset');
    this.btnPriceScaleToggleAuto = document.getElementById('btnPriceScaleToggleAuto');
    this.iconPriceScaleAutoCheck = document.getElementById('iconPriceScaleAutoCheck');
    this.btnPriceScaleOpenSettings = document.getElementById('btnPriceScaleOpenSettings');
    this.isPriceScaleMenuOpen = false;

    // State
    this.targetSlotId = 0;
    this.targetSymbol = null;
    this.menuTargetPrice = null;
    this.menuLots = 1;
    this.hoveredPrice = null;
    this.hoveredY = null;
    this.isMenuOpen = false;

    this.init();
  }

  init() {
    // Relocate menus and plus button to document.body so they render above all app panels and cannot be clipped by container overflow
    if (this.chartOrderMenu && this.chartOrderMenu.parentElement !== document.body) {
      document.body.appendChild(this.chartOrderMenu);
    }
    if (this.timeScaleContextMenu && this.timeScaleContextMenu.parentElement !== document.body) {
      document.body.appendChild(this.timeScaleContextMenu);
    }
    if (this.priceScaleContextMenu && this.priceScaleContextMenu.parentElement !== document.body) {
      document.body.appendChild(this.priceScaleContextMenu);
    }
    if (this.priceAxisPlusBtn && this.priceAxisPlusBtn.parentElement !== document.body) {
      document.body.appendChild(this.priceAxisPlusBtn);
      this.priceAxisPlusBtn.style.position = 'fixed';
      this.priceAxisPlusBtn.style.zIndex = '1000';
    }

    this.initMouseTracking();
    this.initMenuControls();

    // Close menu on Escape or click outside
    document.addEventListener('pointerdown', (e) => {
      if (this.isMenuOpen && this.chartOrderMenu && !this.chartOrderMenu.contains(e.target) && e.target !== this.priceAxisPlusBtn) {
        this.close();
      }
      if (this.isTimeScaleMenuOpen && this.timeScaleContextMenu && !this.timeScaleContextMenu.contains(e.target)) {
        this.closeTimeScaleContextMenu();
      }
      if (this.isPriceScaleMenuOpen && this.priceScaleContextMenu && !this.priceScaleContextMenu.contains(e.target)) {
        this.closePriceScaleContextMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.isMenuOpen) this.close();
        if (this.isTimeScaleMenuOpen) this.closeTimeScaleContextMenu();
        if (this.isPriceScaleMenuOpen) this.closePriceScaleContextMenu();
      }
    });

    // Close immediately when symbol changes or loading begins
    eventBus.on('symbol:change', () => {
      this.close();
      this.closeTimeScaleContextMenu();
      this.closePriceScaleContextMenu();
    });
  }

  initMouseTracking() {
    const trackEl = this.gridWrapper || this.chartContainer;
    if (!trackEl) return;

    // Right-click on chart -> open chart order menu, time scale menu, or price scale menu
    trackEl.addEventListener('contextmenu', (e) => {
      const slotEl = e.target.closest('.chart-slot');
      if (!slotEl) return;

      e.preventDefault();
      const slotId = Number(slotEl.getAttribute('data-slot-id')) || 0;

      // Requirement: right click immediately sets focus / activates the clicked window
      if (this.store.multiChart && typeof this.store.multiChart.setActiveSlot === 'function') {
        this.store.multiChart.setActiveSlot(slotId);
      }

      const chart = slotId === 0 ? this.store.chart : this.store.multiChart?.slots?.get(slotId)?.chart;
      const symbol = slotId === 0 ? this.store.get('currentSymbol') : (this.store.multiChart?.slots?.get(slotId)?.symbol || this.store.get('currentSymbol'));

      if (chart) {
        const slotRect = slotEl.getBoundingClientRect();
        const localX = e.clientX - slotRect.left;
        const localY = e.clientY - slotRect.top;

        // 1. Check if right-click was on right price scale (rightmost ~65px)
        const priceScaleWidth = 65;
        if (localX >= slotRect.width - priceScaleWidth) {
          this.close();
          this.closeTimeScaleContextMenu();
          this.openPriceScaleContextMenu(e.clientX, e.clientY, slotId);
          return;
        }

        // 2. Check if right-click was on bottom time scale (bottom 28px of slot container)
        const timeScaleHeight = 28;
        if (localY >= slotRect.height - timeScaleHeight) {
          this.close();
          this.closePriceScaleContextMenu();
          this.openTimeScaleContextMenu(e.clientX, e.clientY, slotId);
          return;
        }

        // 3. Drawing tools interception: right click finishes or cancels drawing (TradingView standard)
        const dc = slotId === 0 ? this.store.drawingController : this.store.multiChart?.slots?.get(slotId)?.drawingController;
        if (dc) {
          const activeTool = typeof dc.activeTool === 'function' ? dc.activeTool() : dc._tool;
          const pendingCount = Array.isArray(dc._pending) ? dc._pending.length : 0;

          if (activeTool && activeTool !== 'cursor') {
            // Case 1: Multi-point path/polyline with 2 or more points placed -> finish drawing
            if ((activeTool === 'path' || activeTool === 'polyline') && pendingCount >= 2) {
              if (typeof dc.finish === 'function') {
                dc.finish('rightclick');
              }
            } else {
              // Case 2: Multi-point with < 2 points, or any other drawing tool -> cancel drawing
              if (typeof dc.cancel === 'function') {
                dc.cancel();
              } else if (typeof dc.setTool === 'function') {
                dc.setTool(null);
              }
            }

            eventBus.emit('tool:reset');
            this.close();
            this.closeTimeScaleContextMenu();
            this.closePriceScaleContextMenu();
            return;
          }
        }

        // 4. Regular chart canvas area (when no drawing tool is active)
        this.closeTimeScaleContextMenu();
        this.closePriceScaleContextMenu();
        let price = typeof chart.coordinateToPrice === 'function' ? chart.coordinateToPrice(localY) : null;
        let bar = null;
        if (slotId > 0) {
          const slot = this.store.multiChart?.slots?.get(slotId);
          bar = slot?.getCurrentBar ? slot.getCurrentBar() : (slot?.currentVisibleCandles?.[slot.currentVisibleCandles.length - 1]);
        } else {
          bar = this.store.simulator?.getCurrentBar();
        }
        const fallbackPrice = bar?.close || this.store.simulator?.getCurrentBar()?.close;
        if (fallbackPrice && fallbackPrice > 0) {
          if (!price || isNaN(price) || price <= 0 || (price / fallbackPrice > 2.5) || (price / fallbackPrice < 0.4)) {
            price = fallbackPrice;
          }
        }

        if (price && price > 0) {
          this.targetSlotId = slotId;
          this.targetSymbol = symbol;
          this.open(price, e.clientX, e.clientY, slotId, symbol);
        }
      }
    });

    trackEl.addEventListener('mousemove', (e) => {
      const slotEl = e.target.closest('.chart-slot');
      if (!slotEl) {
        if (!this.isMenuOpen && this.priceAxisPlusBtn) this.priceAxisPlusBtn.style.display = 'none';
        return;
      }
      const slotId = Number(slotEl.getAttribute('data-slot-id')) || 0;
      const chart = slotId === 0 ? this.store.chart : this.store.multiChart?.slots?.get(slotId)?.chart;
      const symbol = slotId === 0 ? this.store.get('currentSymbol') : (this.store.multiChart?.slots?.get(slotId)?.symbol || this.store.get('currentSymbol'));

      const rect = slotEl.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;

      // Only show + button if mouse is over or near the price scale (right edge)
      if (chart && localY >= 0 && localY <= rect.height - 28 && localX >= rect.width - 90) {
        let price = typeof chart.coordinateToPrice === 'function' ? chart.coordinateToPrice(localY) : null;
        let bar = null;
        if (slotId > 0) {
          const slot = this.store.multiChart?.slots?.get(slotId);
          bar = slot?.getCurrentBar ? slot.getCurrentBar() : (slot?.currentVisibleCandles?.[slot.currentVisibleCandles.length - 1]);
        } else {
          bar = this.store.simulator?.getCurrentBar();
        }
        const fallbackPrice = bar?.close || this.store.simulator?.getCurrentBar()?.close;
        if (fallbackPrice && fallbackPrice > 0) {
          if (!price || isNaN(price) || price <= 0 || (price / fallbackPrice > 2.5) || (price / fallbackPrice < 0.4)) {
            price = fallbackPrice;
          }
        }

        if (price && price > 0) {
          this.hoveredPrice = price;
          this.hoveredY = localY;
          this.targetSlotId = slotId;
          this.targetSymbol = symbol;
          if (this.priceAxisPlusBtn) {
            this.priceAxisPlusBtn.style.position = 'fixed';
            this.priceAxisPlusBtn.style.top = `${rect.top + localY - 11}px`;
            this.priceAxisPlusBtn.style.left = `${rect.right - 56}px`;
            this.priceAxisPlusBtn.style.display = 'flex';
            this.priceAxisPlusBtn.style.zIndex = '1000';
          }
          return;
        }
      }

      if (!this.isMenuOpen && this.priceAxisPlusBtn && e.target !== this.priceAxisPlusBtn && !this.priceAxisPlusBtn.contains(e.target)) {
        this.priceAxisPlusBtn.style.display = 'none';
      }
    });

    trackEl.addEventListener('mouseleave', (e) => {
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
        if (this.targetSlotId !== undefined && this.store.multiChart && typeof this.store.multiChart.setActiveSlot === 'function') {
          this.store.multiChart.setActiveSlot(this.targetSlotId);
        }
        if (this.hoveredPrice && this.priceAxisPlusBtn) {
          const btnRect = this.priceAxisPlusBtn.getBoundingClientRect();
          this.open(this.hoveredPrice, btnRect.left, btnRect.top, this.targetSlotId, this.targetSymbol);
        }
      });

      this.priceAxisPlusBtn.addEventListener('mouseleave', (e) => {
        const trackEl = this.gridWrapper || this.chartContainer;
        if (!this.isMenuOpen && e.relatedTarget && trackEl && !trackEl.contains(e.relatedTarget)) {
          this.priceAxisPlusBtn.style.display = 'none';
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
        let targetSymbol = this.targetSymbol || this.store.get('currentSymbol');
        let currentBar = null;
        if (this.targetSlotId > 0) {
          const slot = this.store.multiChart?.slots?.get(this.targetSlotId);
          if (slot) {
            targetSymbol = slot.symbol || targetSymbol;
            currentBar = slot.getCurrentBar ? slot.getCurrentBar() : (slot.currentVisibleCandles?.[slot.currentVisibleCandles.length - 1]);
          }
        }
        if (!currentBar) {
          const simulator = this.store.simulator;
          currentBar = simulator ? simulator.getCurrentBar() : null;
        }

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

        eventBus.emit('orderpanel:custom', { price: this.menuTargetPrice, lots: this.menuLots, type, symbol: targetSymbol });
        showToast(`Заявка по ${this.menuTargetPrice.toFixed(2)} ₽ перенесена в панель ордеров`, 'info');
      });
    }

    if (this.btnMenuResetScale) {
      this.btnMenuResetScale.addEventListener('click', () => {
        this.close();
        if (this.targetSlotId > 0) {
          const slot = this.store.multiChart?.slots?.get(this.targetSlotId);
          if (slot) slot.resetView();
        } else if (this.store.chartController) {
          this.store.chartController.resetFullChartScale();
        }
      });
    }

    if (this.btnTimeScaleReset) {
      this.btnTimeScaleReset.addEventListener('click', () => {
        this.closeTimeScaleContextMenu();
        if (this.targetSlotId > 0) {
          const slot = this.store.multiChart?.slots?.get(this.targetSlotId);
          if (slot) slot.resetTimeScale();
        } else if (this.store.chartController) {
          this.store.chartController.resetTimeScale();
        }
      });
    }

    if (this.btnTimeScaleOpenSettings) {
      this.btnTimeScaleOpenSettings.addEventListener('click', () => {
        this.closeTimeScaleContextMenu();
        if (this.store.chartStyleModal) {
          this.store.chartStyleModal.open('chart');
        }
      });
    }

    if (this.btnPriceScaleReset) {
      this.btnPriceScaleReset.addEventListener('click', () => {
        this.closePriceScaleContextMenu();
        if (this.targetSlotId > 0) {
          const slot = this.store.multiChart?.slots?.get(this.targetSlotId);
          if (slot) slot.resetPriceScale();
        } else if (this.store.chartController) {
          this.store.chartController.resetPriceScale();
        }
      });
    }

    if (this.btnPriceScaleToggleAuto) {
      this.btnPriceScaleToggleAuto.addEventListener('click', () => {
        let next = true;
        if (this.targetSlotId > 0) {
          const slot = this.store.multiChart?.slots?.get(this.targetSlotId);
          if (slot) next = slot.togglePriceAutoScale();
        } else if (this.store.chartController) {
          next = this.store.chartController.togglePriceAutoScale();
        }
        this.updatePriceScaleAutoCheck(next);
        this.closePriceScaleContextMenu();
      });
    }

    if (this.btnPriceScaleOpenSettings) {
      this.btnPriceScaleOpenSettings.addEventListener('click', () => {
        this.closePriceScaleContextMenu();
        if (this.store.chartStyleModal) {
          this.store.chartStyleModal.open('chart');
        }
      });
    }

    if (this.timeScaleContextMenu) {
      this.timeScaleContextMenu.addEventListener('pointerdown', e => e.stopPropagation());
      this.timeScaleContextMenu.addEventListener('click', e => e.stopPropagation());
    }

    if (this.priceScaleContextMenu) {
      this.priceScaleContextMenu.addEventListener('pointerdown', e => e.stopPropagation());
      this.priceScaleContextMenu.addEventListener('click', e => e.stopPropagation());
    }

    if (this.chartOrderMenu) {
      this.chartOrderMenu.addEventListener('pointerdown', e => e.stopPropagation());
      this.chartOrderMenu.addEventListener('click', e => e.stopPropagation());
    }
  }

  openPriceScaleContextMenu(clientX, clientY, slotId = 0) {
    if (this.store.get('isSymbolLoading')) return;
    if (!this.priceScaleContextMenu) return;
    this.targetSlotId = slotId;

    this.updatePriceScaleAutoCheck();

    this.priceScaleContextMenu.style.visibility = 'hidden';
    this.priceScaleContextMenu.style.display = 'block';

    const menuRect = this.priceScaleContextMenu.getBoundingClientRect();
    const menuWidth = menuRect.width || 250;
    const menuHeight = menuRect.height || 120;
    const margin = 8;

    let left = clientX;
    let top = clientY;

    if (left + menuWidth > window.innerWidth - margin) {
      left = clientX - menuWidth;
    }
    if (left + menuWidth > window.innerWidth - margin) {
      left = window.innerWidth - menuWidth - margin;
    }
    if (left < margin) {
      left = margin;
    }

    if (top + menuHeight > window.innerHeight - margin) {
      top = clientY - menuHeight;
    }
    if (top + menuHeight > window.innerHeight - margin) {
      top = window.innerHeight - menuHeight - margin;
    }
    if (top < margin) {
      top = margin;
    }

    this.priceScaleContextMenu.style.left = `${Math.round(left)}px`;
    this.priceScaleContextMenu.style.top = `${Math.round(top)}px`;
    this.priceScaleContextMenu.style.visibility = 'visible';
    this.isPriceScaleMenuOpen = true;
  }

  closePriceScaleContextMenu() {
    if (!this.priceScaleContextMenu) return;
    this.priceScaleContextMenu.style.display = 'none';
    this.priceScaleContextMenu.style.visibility = 'visible';
    this.isPriceScaleMenuOpen = false;
  }

  updatePriceScaleAutoCheck(forcedVal) {
    if (!this.iconPriceScaleAutoCheck) return;
    let isAuto = true;
    if (forcedVal !== undefined) {
      isAuto = forcedVal;
    } else if (this.targetSlotId > 0) {
      const slot = this.store.multiChart?.slots?.get(this.targetSlotId);
      isAuto = slot ? slot.isPriceAutoScaleEnabled() : true;
    } else {
      isAuto = this.store.chartController ? this.store.chartController.isPriceAutoScaleEnabled() : true;
    }

    if (isAuto) {
      this.iconPriceScaleAutoCheck.classList.remove('hidden');
    } else {
      this.iconPriceScaleAutoCheck.classList.add('hidden');
    }
  }

  openTimeScaleContextMenu(clientX, clientY, slotId = 0) {
    if (this.store.get('isSymbolLoading')) return;
    if (!this.timeScaleContextMenu) return;
    this.targetSlotId = slotId;

    this.timeScaleContextMenu.style.visibility = 'hidden';
    this.timeScaleContextMenu.style.display = 'block';

    const menuRect = this.timeScaleContextMenu.getBoundingClientRect();
    const menuWidth = menuRect.width || 250;
    const menuHeight = menuRect.height || 80;
    const margin = 8;

    let left = clientX;
    // Prefer opening above the bottom time scale click point
    let top = clientY - menuHeight - 4;

    if (top < margin) {
      top = clientY + 4;
    }
    if (top + menuHeight > window.innerHeight - margin) {
      top = window.innerHeight - menuHeight - margin;
    }
    if (top < margin) {
      top = margin;
    }

    if (left + menuWidth > window.innerWidth - margin) {
      left = clientX - menuWidth;
    }
    if (left + menuWidth > window.innerWidth - margin) {
      left = window.innerWidth - menuWidth - margin;
    }
    if (left < margin) {
      left = margin;
    }

    this.timeScaleContextMenu.style.left = `${Math.round(left)}px`;
    this.timeScaleContextMenu.style.top = `${Math.round(top)}px`;
    this.timeScaleContextMenu.style.visibility = 'visible';
    this.isTimeScaleMenuOpen = true;
  }

  closeTimeScaleContextMenu() {
    if (!this.timeScaleContextMenu) return;
    this.timeScaleContextMenu.style.display = 'none';
    this.timeScaleContextMenu.style.visibility = 'visible';
    this.isTimeScaleMenuOpen = false;
  }

  open(price, clientX, clientY, slotId = this.targetSlotId, symbol = this.targetSymbol) {
    if (this.store.get('isSymbolLoading')) return;
    if (!price || isNaN(price)) return;
    this.targetSlotId = slotId !== undefined ? slotId : 0;
    this.targetSymbol = symbol || (this.targetSlotId === 0 ? this.store.get('currentSymbol') : (this.store.multiChart?.slots?.get(this.targetSlotId)?.symbol || this.store.get('currentSymbol')));
    this.menuTargetPrice = Number(price);
    this.isMenuOpen = true;

    const inputLots = document.getElementById('inputLots');
    const panelLots = inputLots ? Number(inputLots.value) : 1;
    if (panelLots && panelLots > 0) {
      this.menuLots = panelLots;
    }

    this.updateDisplay();

    if (!this.chartOrderMenu) return;

    // Make visible briefly hidden to measure actual DOM dimensions
    this.chartOrderMenu.style.visibility = 'hidden';
    this.chartOrderMenu.style.display = 'block';

    const menuRect = this.chartOrderMenu.getBoundingClientRect();
    const menuWidth = menuRect.width || 330;
    const menuHeight = menuRect.height || 230;

    const margin = 8;
    let left = clientX;
    let top = clientY;

    // Smart horizontal positioning (TradingView standard):
    // If not enough room to the right of cursor: open to the left of cursor
    if (left + menuWidth > window.innerWidth - margin) {
      left = clientX - menuWidth;
    }
    // Strict clamp within window viewport
    if (left + menuWidth > window.innerWidth - margin) {
      left = window.innerWidth - menuWidth - margin;
    }
    if (left < margin) {
      left = margin;
    }

    // Smart vertical positioning (TradingView standard):
    // If not enough room below cursor: open above cursor
    if (top + menuHeight > window.innerHeight - margin) {
      top = clientY - menuHeight;
    }
    // Strict clamp within window viewport
    if (top + menuHeight > window.innerHeight - margin) {
      top = window.innerHeight - menuHeight - margin;
    }
    if (top < margin) {
      top = margin;
    }

    this.chartOrderMenu.style.left = `${Math.round(left)}px`;
    this.chartOrderMenu.style.top = `${Math.round(top)}px`;
    this.chartOrderMenu.style.visibility = 'visible';
  }

  close() {
    this.isMenuOpen = false;
    this.menuTargetPrice = null;
    if (this.chartOrderMenu) {
      this.chartOrderMenu.style.display = 'none';
      this.chartOrderMenu.style.visibility = 'visible';
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

    const targetSymbol = this.targetSymbol || this.store.get('currentSymbol');
    let lotSize = this.store.get('currentLotSize') || 1;
    let isFuture = this.store.get('currentInstrumentType') === 'future';

    if (this.targetSlotId > 0 && this.store.portfolioDataService) {
      const info = this.store.portfolioDataService.getInstrumentInfo(targetSymbol);
      if (info) {
        if (info.lot) lotSize = info.lot;
        if (info.type === 'future') isFuture = true;
      }
    }

    const totalShares = this.menuLots * lotSize;
    const notional = totalShares * this.menuTargetPrice;
    const unit = isFuture ? 'контр.' : 'шт.';
    if (this.menuSharesInfo) {
      this.menuSharesInfo.textContent = `${totalShares.toLocaleString('ru-RU')} ${unit} • ${formatMoney(notional)}`;
    }

    let currentPrice = this.menuTargetPrice;
    if (this.targetSlotId > 0) {
      const slot = this.store.multiChart?.slots?.get(this.targetSlotId);
      const slotBar = slot?.getCurrentBar ? slot.getCurrentBar() : (slot?.currentVisibleCandles?.[slot.currentVisibleCandles.length - 1]);
      if (slotBar && slotBar.close) currentPrice = slotBar.close;
    } else {
      const simulator = this.store.simulator;
      const currentBar = simulator ? simulator.getCurrentBar() : null;
      if (currentBar && currentBar.close) currentPrice = currentBar.close;
    }
    const formattedPrice = formatRussianPrice(this.menuTargetPrice);

    if (this.menuTargetPrice >= currentPrice) {
      if (this.menuIconPrimary) {
        this.menuIconPrimary.className = 'action-icon sell';
        this.menuIconPrimary.textContent = '∨';
      }
      if (this.menuTextPrimary) {
        this.menuTextPrimary.textContent = `Продать ${targetSymbol} Лимит ${this.menuLots} @ ${formattedPrice}`;
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
        this.menuTextSecondary.textContent = `Купить ${targetSymbol} Стоп ${this.menuLots} @ ${formattedPrice}`;
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
        this.menuTextPrimary.textContent = `Купить ${targetSymbol} Лимит ${this.menuLots} @ ${formattedPrice}`;
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
        this.menuTextSecondary.textContent = `Продать ${targetSymbol} Стоп ${this.menuLots} @ ${formattedPrice}`;
      }
      if (this.btnMenuActionSecondary) {
        this.btnMenuActionSecondary.dataset.side = 'SELL';
        this.btnMenuActionSecondary.dataset.type = 'STOP';
      }
    }
  }

  executeChartOrder(side, type) {
    if (this.store.get('isSymbolLoading')) {
      showToast('Котировки инструмента загружаются, пожалуйста подождите...', 'warning');
      return;
    }
    if (!this.menuTargetPrice || !this.menuLots) return;
    const simulator = this.store.simulator;
    const paperAccount = this.store.paperAccount;
    if (!simulator || !paperAccount) return;

    let targetSymbol = this.targetSymbol || this.store.get('currentSymbol');
    let currentBar = null;

    if (this.targetSlotId > 0) {
      const slot = this.store.multiChart?.slots?.get(this.targetSlotId);
      if (slot) {
        targetSymbol = slot.symbol || targetSymbol;
        currentBar = slot.getCurrentBar ? slot.getCurrentBar() : (slot.currentVisibleCandles?.[slot.currentVisibleCandles.length - 1]);
      }
    }
    if (!currentBar) {
      currentBar = simulator.getCurrentBar();
    }

    if (!currentBar) {
      showToast('Нет данных свечей для выставления заявки', 'error');
      return;
    }

    const cleanPrice = this.menuTargetPrice >= 10 ? Number(this.menuTargetPrice.toFixed(2)) : Number(this.menuTargetPrice.toFixed(4));

    // Guard against executing order with price from a different ticker/scale
    const curClose = currentBar.close;
    if (curClose > 0) {
      const ratio = cleanPrice / curClose;
      if (ratio > 1.8 || ratio < 0.55) {
        showToast(`Цена заявки (${cleanPrice} ₽) сильно отличается от цены инструмента (${curClose} ₽)`, 'error');
        this.close();
        return;
      }
    }

    let lotSize = this.store.get('currentLotSize') || 1;
    let instrumentType = this.store.get('currentInstrumentType') || 'share';
    if (this.targetSlotId > 0 && this.store.portfolioDataService) {
      const info = this.store.portfolioDataService.getInstrumentInfo(targetSymbol);
      if (info) {
        if (info.lot) lotSize = info.lot;
        if (info.type) instrumentType = info.type;
      }
    }

    const res = paperAccount.placeOrder({
      symbol: targetSymbol,
      side,
      type,
      qty: this.menuLots,
      price: cleanPrice,
      sl: null,
      tp: null,
      time: currentBar ? currentBar.time : null,
      lotSize,
      instrumentType
    });

    if (res.ok) {
      showToast(res.message, 'success');
      this.close();
    } else {
      showToast(res.error, 'error');
    }
  }
}

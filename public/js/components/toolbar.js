// components/toolbar.js - Top Toolbar Component (Symbol, Timeframe, Chart Type, Fullscreen)
import { eventBus } from '../core/event-bus.js';
import { API } from '../api.js';

export class ToolbarComponent {
  constructor(store) {
    this.store = store;

    // DOM Elements
    this.symbolTrigger = document.getElementById('symbolTrigger');
    this.symbolTickerText = document.getElementById('symbolTickerText');
    this.symbolDropdown = document.getElementById('symbolDropdown');
    this.symbolSearchInput = document.getElementById('symbolSearchInput');
    this.symbolList = document.getElementById('symbolList');
    this.timeframeButtons = document.querySelectorAll('.tf-btn');

    this.btnChartTypeTrigger = document.getElementById('btnChartTypeTrigger');
    this.chartTypeDropdown = document.getElementById('chartTypeDropdown');
    this.chartTypeIcon = document.getElementById('chartTypeIcon');
    this.chartTypeText = document.getElementById('chartTypeText');
    this.chartTypeItems = document.querySelectorAll('.chart-type-item');

    this.btnFullscreen = document.getElementById('btnFullscreen');
    this.btnToggleOrderPanel = document.getElementById('btnToggleOrderPanel');

    this.init();
  }

  init() {
    this.initSymbolSelector();
    this.initTimeframeButtons();
    this.initChartTypeSelector();
    this.initFullscreen();
    this.initOrderPanelToggle();

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
      if (this.symbolDropdown && !this.symbolDropdown.contains(e.target) && !this.symbolTrigger.contains(e.target)) {
        this.symbolDropdown.classList.remove('open');
      }
      if (this.chartTypeDropdown && !this.chartTypeDropdown.contains(e.target) && !this.btnChartTypeTrigger.contains(e.target)) {
        this.chartTypeDropdown.style.display = 'none';
      }
    });

    eventBus.on('symbol:updated', (symbol) => {
      if (this.symbolTickerText) {
        this.symbolTickerText.textContent = symbol;
      }
    });
  }

  initSymbolSelector() {
    if (!this.symbolTrigger || !this.symbolDropdown) return;

    if (this.symbolTickerText) {
      this.symbolTickerText.textContent = this.store.get('currentSymbol') || 'SBER';
    }

    this.symbolTrigger.onclick = (e) => {
      e.stopPropagation();
      this.symbolDropdown.classList.toggle('open');
      if (this.symbolDropdown.classList.contains('open')) {
        if (this.symbolSearchInput) {
          this.symbolSearchInput.focus();
        }
        this.populateSymbolList('');
      }
    };

    if (this.symbolSearchInput) {
      this.symbolSearchInput.oninput = (e) => {
        this.populateSymbolList(e.target.value);
      };
    }
  }

  async populateSymbolList(query) {
    if (!this.symbolList) return;
    try {
      const res = await API.searchInstruments(query);
      const instruments = res.instruments || [];
      const currentSym = this.store.get('currentSymbol');

      this.symbolList.innerHTML = instruments.map(inst => `
        <div class="symbol-item ${inst.ticker === currentSym ? 'active' : ''}" data-ticker="${inst.ticker}" data-figi="${inst.figi || ''}" data-lot="${inst.lot || 1}">
          <div class="symbol-item-top">
            <span class="symbol-item-ticker">${inst.ticker}</span>
            <span class="symbol-item-badge">${inst.currency || 'RUB'} • 1 лот = ${inst.lot || 1} шт.</span>
          </div>
          <div class="symbol-item-name">${inst.name}</div>
        </div>
      `).join('');

      this.symbolList.querySelectorAll('.symbol-item').forEach(item => {
        item.onclick = () => {
          const ticker = item.getAttribute('data-ticker');
          const figi = item.getAttribute('data-figi');
          const lot = Number(item.getAttribute('data-lot')) || 10;

          this.store.set('currentSymbol', ticker);
          this.store.set('currentFigi', figi);
          this.store.set('currentLotSize', lot);

          if (this.symbolTickerText) this.symbolTickerText.textContent = ticker;
          if (this.symbolDropdown) this.symbolDropdown.classList.remove('open');

          eventBus.emit('symbol:change', { ticker, figi, lot });
        };
      });
    } catch (err) {
      console.error('Error populating symbol list:', err);
    }
  }

  initTimeframeButtons() {
    const currentTf = this.store.get('currentTimeframe') || '1h';
    this.timeframeButtons.forEach(btn => {
      const tf = btn.getAttribute('data-tf');
      if (tf === currentTf) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }

      btn.onclick = () => {
        const newTf = btn.getAttribute('data-tf');
        const activeTf = this.store.get('currentTimeframe');
        if (newTf === activeTf) return;

        this.timeframeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        this.store.set('currentTimeframe', newTf);
        eventBus.emit('timeframe:change', { newTf, prevTf: activeTf });
      };
    });
  }

  initChartTypeSelector() {
    if (!this.btnChartTypeTrigger || !this.chartTypeDropdown) return;

    this.btnChartTypeTrigger.onclick = (e) => {
      e.stopPropagation();
      this.chartTypeDropdown.style.display = this.chartTypeDropdown.style.display === 'none' ? 'block' : 'none';
    };

    this.chartTypeItems = this.chartTypeDropdown.querySelectorAll('.chart-type-item:not(.chart-type-settings-item)');

    this.chartTypeItems.forEach(item => {
      item.onclick = () => {
        const type = item.getAttribute('data-type');
        const shortText = item.getAttribute('data-short') || item.querySelector('.chart-type-label')?.textContent.trim() || type;
        const iconSpan = item.querySelector('.chart-type-icon');

        this.chartTypeItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        this.store.set('currentChartType', type);

        if (this.chartTypeIcon && iconSpan) {
          this.chartTypeIcon.innerHTML = iconSpan.innerHTML;
        }
        if (this.chartTypeText) {
          this.chartTypeText.textContent = shortText;
        }
        this.chartTypeDropdown.style.display = 'none';

        const chart = this.store.chart;
        const mainSeries = this.store.mainSeries;
        if (chart && mainSeries && typeof chart.setSeriesType === 'function') {
          chart.setSeriesType(mainSeries, type);
          if (this.store.chartController && typeof this.store.chartController.applySavedSeriesStyle === 'function') {
            this.store.chartController.applySavedSeriesStyle(type);
          }
        }
      };
    });

    // Chart Style Settings button
    const btnSettings = document.getElementById('btnOpenChartTypeSettings');
    if (btnSettings) {
      btnSettings.onclick = (e) => {
        e.stopPropagation();
        this.chartTypeDropdown.style.display = 'none';
        if (this.store.chartStyleModal) {
          this.store.chartStyleModal.open();
        }
      };
    }

    // Sync initial state from store if present
    const initialType = this.store.get('currentChartType') || 'candlestick';
    const activeItem = this.chartTypeDropdown.querySelector(`.chart-type-item[data-type="${initialType}"]`);
    if (activeItem) {
      this.chartTypeItems.forEach(i => i.classList.remove('active'));
      activeItem.classList.add('active');
      const iconSpan = activeItem.querySelector('.chart-type-icon');
      const shortText = activeItem.getAttribute('data-short') || activeItem.querySelector('.chart-type-label')?.textContent.trim();
      if (this.chartTypeIcon && iconSpan) {
        this.chartTypeIcon.innerHTML = iconSpan.innerHTML;
      }
      if (this.chartTypeText && shortText) {
        this.chartTypeText.textContent = shortText;
      }
    }
  }

  initFullscreen() {
    if (!this.btnFullscreen) return;
    this.btnFullscreen.onclick = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    };
  }

  initOrderPanelToggle() {
    if (!this.btnToggleOrderPanel) return;
    this.btnToggleOrderPanel.onclick = () => {
      eventBus.emit('orderpanel:toggle');
    };
  }
}

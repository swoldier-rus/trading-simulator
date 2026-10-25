// public/js/components/watchlist.js - TradingView Watchlist Component
import { eventBus } from '../core/event-bus.js';
import API from '../api.js';

const DEFAULT_WATCHLIST = ['SBER', 'GAZP', 'LKOH', 'IMOEXF', 'SiZ6', 'NGV6'];
const STORAGE_KEY = 'tv_watchlist';

export class WatchlistComponent {
  constructor(store) {
    this.store = store;
    this.watchlist = this.loadWatchlist();
    this.quotes = new Map();
    this.activeTicker = this.store ? this.store.get('currentSymbol') : 'SBER';

    this.modalCurrentType = 'all';
    this._searchDebounceTimer = null;
    this._latestSearchToken = 0;

    // DOM Elements - Panel
    this.panel = document.getElementById('tvWatchlistPanel');
    this.itemsContainer = document.getElementById('watchlistItemsList');
    this.countBadge = document.getElementById('watchlistCountBadge');
    this.emptyState = document.getElementById('watchlistEmptyState');
    this.btnAdd = document.getElementById('btnWatchlistAdd');
    this.btnClose = document.getElementById('btnWatchlistClose');
    this.btnEmptyAdd = document.getElementById('btnWatchlistEmptyAdd');

    // DOM Elements - Modal
    this.modalBackdrop = document.getElementById('watchlistModalBackdrop');
    this.modalClose = document.getElementById('btnCloseWatchlistModal');
    this.modalDone = document.getElementById('btnDoneWatchlistModal');
    this.modalInput = document.getElementById('inputWatchlistSearch');
    this.modalClear = document.getElementById('btnClearWatchlistSearch');
    this.modalTabs = document.getElementById('watchlistModalTabs');
    this.modalResults = document.getElementById('watchlistModalResults');

    this.initEventListeners();
    this.render();
    this.fetchQuotes();
  }

  loadWatchlist() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(s => String(s).toUpperCase().trim()).filter(Boolean);
        }
      }
    } catch (e) {
      console.warn('[Watchlist] Error loading from localStorage:', e);
    }
    this.saveWatchlist(DEFAULT_WATCHLIST);
    return [...DEFAULT_WATCHLIST];
  }

  saveWatchlist(list = this.watchlist) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('[Watchlist] Error saving to localStorage:', e);
    }
  }

  initEventListeners() {
    // Open modal from panel header
    if (this.btnAdd) {
      this.btnAdd.onclick = (e) => {
        e.stopPropagation();
        this.openModal();
      };
    }

    // Close panel
    if (this.btnClose) {
      this.btnClose.onclick = (e) => {
        e.stopPropagation();
        this.closePanel();
      };
    }

    // Empty state add button
    if (this.btnEmptyAdd) {
      this.btnEmptyAdd.onclick = (e) => {
        e.stopPropagation();
        this.openModal();
      };
    }

    // Modal controls
    if (this.modalClose) {
      this.modalClose.onclick = () => this.closeModal();
    }
    if (this.modalDone) {
      this.modalDone.onclick = () => this.closeModal();
    }

    // Close modal on backdrop click
    if (this.modalBackdrop) {
      this.modalBackdrop.onclick = (e) => {
        if (e.target === this.modalBackdrop) {
          this.closeModal();
        }
      };
    }

    // Search input debouncing
    if (this.modalInput) {
      this.modalInput.oninput = (e) => {
        const val = e.target.value;
        if (this.modalClear) {
          this.modalClear.style.display = val ? 'block' : 'none';
        }
        if (this._searchDebounceTimer) clearTimeout(this._searchDebounceTimer);
        this._searchDebounceTimer = setTimeout(() => {
          this._searchDebounceTimer = null;
          this.populateModalResults(val, this.modalCurrentType);
        }, 120);
      };
    }

    // Search clear button
    if (this.modalClear) {
      this.modalClear.onclick = () => {
        if (this.modalInput) {
          this.modalInput.value = '';
          this.modalClear.style.display = 'none';
          this.modalInput.focus();
          this.populateModalResults('', this.modalCurrentType);
        }
      };
    }

    // Modal category tabs
    if (this.modalTabs) {
      const tabs = this.modalTabs.querySelectorAll('.watchlist-modal-tab');
      tabs.forEach(tab => {
        tab.onclick = () => {
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          this.modalCurrentType = tab.getAttribute('data-type') || 'all';
          const query = this.modalInput ? this.modalInput.value : '';
          this.populateModalResults(query, this.modalCurrentType);
        };
      });
    }

    // Keyboard navigation (Esc to close modal)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isModalOpen()) {
        this.closeModal();
      }
    });

    // Watchlist toggle event from RightRail
    eventBus.on('watchlist:toggle', () => {
      this.togglePanel();
    });

    // Close watchlist if order panel is opened
    eventBus.on('orderpanel:toggled', (active) => {
      if (active && this.isPanelOpen()) {
        this.closePanel();
      }
    });

    // Active symbol tracking
    eventBus.on('state:currentSymbol', (sym) => {
      if (sym) {
        this.activeTicker = sym.toUpperCase();
        this.updateActiveRow();
      }
    });

    eventBus.on('symbol:change', (payload) => {
      const sym = typeof payload === 'string' ? payload : (payload?.ticker || '');
      if (sym) {
        this.activeTicker = sym.toUpperCase();
        this.updateActiveRow();
      }
    });

    // Simulation price synchronization
    eventBus.on('simulator:tick', (candle) => this.onLiveTick(candle));
    eventBus.on('candle:new', (candle) => this.onLiveTick(candle));
  }

  isPanelOpen() {
    return this.panel && !this.panel.classList.contains('collapsed');
  }

  openPanel() {
    if (!this.panel) return;
    this.panel.classList.remove('collapsed');
    eventBus.emit('watchlist:toggled', true);
    this.fetchQuotes();
  }

  closePanel() {
    if (!this.panel) return;
    this.panel.classList.add('collapsed');
    eventBus.emit('watchlist:toggled', false);
  }

  togglePanel() {
    if (this.isPanelOpen()) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }

  isModalOpen() {
    return this.modalBackdrop && this.modalBackdrop.style.display !== 'none';
  }

  openModal() {
    if (!this.modalBackdrop) return;
    this.modalBackdrop.style.display = 'flex';
    if (this.modalInput) {
      this.modalInput.value = '';
      if (this.modalClear) this.modalClear.style.display = 'none';
      setTimeout(() => this.modalInput.focus(), 50);
    }
    this.populateModalResults('', this.modalCurrentType);
  }

  closeModal() {
    if (!this.modalBackdrop) return;
    this.modalBackdrop.style.display = 'none';
    this.render();
    this.fetchQuotes();
  }

  async fetchQuotes() {
    if (!this.watchlist || this.watchlist.length === 0) return;
    try {
      const res = await API.getQuotes(this.watchlist);
      if (res && res.ok && Array.isArray(res.quotes)) {
        for (const q of res.quotes) {
          if (q.ticker) {
            this.quotes.set(q.ticker.toUpperCase(), q);
          }
        }
        this.renderRowsOnly();
      }
    } catch (err) {
      console.warn('[Watchlist] Error fetching quotes:', err.message);
    }
  }

  formatPrice(price, ticker) {
    if (price === undefined || price === null || isNaN(price)) return '—';
    const num = Number(price);
    const quote = this.quotes.get(ticker);
    const inc = quote?.minPriceIncrement;

    if (inc && inc < 0.01) {
      return num.toFixed(3);
    }
    if (num >= 1000) {
      return num.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
    }
    return num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  render() {
    if (this.countBadge) {
      this.countBadge.textContent = this.watchlist.length;
    }

    if (!this.itemsContainer) return;

    if (this.watchlist.length === 0) {
      this.itemsContainer.innerHTML = '';
      if (this.emptyState) this.emptyState.style.display = 'flex';
      return;
    }

    if (this.emptyState) this.emptyState.style.display = 'none';
    this.renderRowsOnly();
  }

  renderRowsOnly() {
    if (!this.itemsContainer) return;

    this.itemsContainer.innerHTML = this.watchlist.map(ticker => {
      const q = this.quotes.get(ticker) || {};
      const isActive = this.activeTicker && this.activeTicker.toUpperCase() === ticker;
      const type = (q.type || '').toLowerCase();
      const isFuture = type === 'future' || ticker.length === 4 && /\d$/.test(ticker);
      const tagClass = isFuture ? 'future' : 'share';
      const tagText = isFuture ? 'ФЬЮЧ' : 'АКЦИЯ';
      const name = q.name || ticker;
      const priceText = this.formatPrice(q.price, ticker);

      const chg = Number(q.changePercent || 0);
      let badgeClass = 'neutral';
      let chgSign = '';
      if (chg > 0) {
        badgeClass = 'positive';
        chgSign = '+';
      } else if (chg < 0) {
        badgeClass = 'negative';
      }
      const chgText = (q.changePercent !== undefined && q.changePercent !== null)
        ? `${chgSign}${chg.toFixed(2)}%`
        : '—';

      return `
        <div class="watchlist-row ${isActive ? 'active' : ''}" data-ticker="${ticker}">
          <div class="watchlist-row-info">
            <div class="watchlist-row-ticker">
              <span>${ticker}</span>
              <span class="watchlist-tag ${tagClass}">${tagText}</span>
            </div>
            <div class="watchlist-row-name" title="${name}">${name}</div>
          </div>
          <div class="watchlist-row-price" id="wlPrice_${ticker}">${priceText}</div>
          <div class="watchlist-row-change">
            <span class="watchlist-change-badge ${badgeClass}" id="wlBadge_${ticker}">${chgText}</span>
          </div>
          <button type="button" class="watchlist-row-delete" data-ticker="${ticker}" title="Удалить из списка (✕)">✕</button>
        </div>
      `;
    }).join('');

    // Attach row events
    this.itemsContainer.querySelectorAll('.watchlist-row').forEach(row => {
      const ticker = row.getAttribute('data-ticker');
      row.onclick = (e) => {
        if (e.target.closest('.watchlist-row-delete')) return;
        this.selectSymbol(ticker);
      };
    });

    // Attach delete button events
    this.itemsContainer.querySelectorAll('.watchlist-row-delete').forEach(btn => {
      const ticker = btn.getAttribute('data-ticker');
      btn.onclick = (e) => {
        e.stopPropagation();
        this.removeTicker(ticker);
      };
    });
  }

  async selectSymbol(ticker) {
    if (!ticker) return;
    const upper = ticker.toUpperCase();
    const prevSymbol = this.store ? this.store.get('currentSymbol') : null;
    if (prevSymbol === upper) return;

    this.activeTicker = upper;
    this.updateActiveRow();

    const quote = this.quotes.get(upper);
    const figi = quote?.figi || '';
    const lot = quote?.lot || 1;
    const instType = quote?.type || 'share';
    const minStep = quote?.minPriceIncrement || 0.01;

    if (this.store) {
      this.store.set('currentSymbol', upper);
      if (figi) this.store.set('currentFigi', figi);
      this.store.set('currentLotSize', lot);
      this.store.set('currentInstrumentType', instType);
      this.store.set('currentMinPriceIncrement', minStep);
    }

    const symbolTickerText = document.getElementById('symbolTickerText');
    if (symbolTickerText) {
      symbolTickerText.textContent = upper;
    }

    eventBus.emit('symbol:change', { prevSymbol, ticker: upper, figi, lot, instrumentType: instType });
  }

  updateActiveRow() {
    if (!this.itemsContainer) return;
    this.itemsContainer.querySelectorAll('.watchlist-row').forEach(row => {
      const ticker = row.getAttribute('data-ticker');
      const isActive = this.activeTicker && this.activeTicker.toUpperCase() === ticker;
      row.classList.toggle('active', !!isActive);
    });
  }

  onLiveTick(candle) {
    if (!candle || !this.activeTicker) return;
    const ticker = this.activeTicker.toUpperCase();
    const currentPrice = Number(candle.close);
    if (!currentPrice || isNaN(currentPrice)) return;

    const quote = this.quotes.get(ticker) || { ticker };
    const prevPrice = quote.price || currentPrice;
    quote.price = currentPrice;

    // Recalculate change percent if available
    const elPrice = document.getElementById(`wlPrice_${ticker}`);
    if (elPrice) {
      elPrice.textContent = this.formatPrice(currentPrice, ticker);
    }
  }

  toggleTicker(ticker, instData = null) {
    const upper = (ticker || '').toUpperCase().trim();
    if (!upper) return false;

    const idx = this.watchlist.indexOf(upper);
    if (idx >= 0) {
      // Remove
      this.watchlist.splice(idx, 1);
      this.saveWatchlist();
      this.render();
      return false; // Not in list anymore
    } else {
      // Add
      this.watchlist.push(upper);
      if (instData) {
        this.quotes.set(upper, {
          ticker: upper,
          name: instData.name || upper,
          type: instData.type || 'share',
          price: instData.price || 0,
          changePercent: instData.changePercent || 0
        });
      }
      this.saveWatchlist();
      this.render();
      // Fetch latest quote for new addition
      this.fetchQuotes();
      return true; // Added
    }
  }

  removeTicker(ticker) {
    const upper = (ticker || '').toUpperCase().trim();
    const idx = this.watchlist.indexOf(upper);
    if (idx >= 0) {
      this.watchlist.splice(idx, 1);
      this.saveWatchlist();
      this.render();
    }
  }

  async populateModalResults(query, type = 'all') {
    if (!this.modalResults) return;
    const searchToken = ++this._latestSearchToken;

    try {
      const res = await API.searchInstruments(query, type);
      if (searchToken !== this._latestSearchToken) return;

      const instruments = res.instruments || [];

      if (instruments.length === 0) {
        this.modalResults.innerHTML = `
          <div style="padding: 30px; text-align: center; color: #787b86; font-size: 13px;">
            Инструменты не найдены
          </div>
        `;
        return;
      }

      this.modalResults.innerHTML = instruments.map(inst => {
        const ticker = (inst.ticker || '').toUpperCase();
        const isInList = this.watchlist.includes(ticker);
        const isFuture = inst.type === 'future' || inst.classCode === 'SPBFUT';
        const badgeClass = isFuture ? 'future' : 'share';
        const badgeText = isFuture ? 'Фьючерс' : 'Акция';
        const name = inst.name || ticker;

        return `
          <div class="watchlist-modal-item" data-ticker="${ticker}">
            <div class="watchlist-modal-item-info">
              <div class="watchlist-modal-ticker">${ticker}</div>
              <div class="watchlist-modal-name" title="${name}">${name}</div>
              <div class="watchlist-modal-badge ${badgeClass}">${badgeText}</div>
            </div>
            <button type="button" 
                    class="watchlist-modal-toggle-btn ${isInList ? 'added' : ''}" 
                    data-ticker="${ticker}"
                    title="${isInList ? 'Удалить из списка котировок' : 'Добавить в список котировок'}">
              ${isInList ? '✓' : '+'}
            </button>
          </div>
        `;
      }).join('');

      // Attach toggle handlers
      this.modalResults.querySelectorAll('.watchlist-modal-toggle-btn').forEach(btn => {
        const ticker = btn.getAttribute('data-ticker');
        const inst = instruments.find(i => (i.ticker || '').toUpperCase() === ticker);

        btn.onclick = (e) => {
          e.stopPropagation();
          const isAdded = this.toggleTicker(ticker, inst);
          if (isAdded) {
            btn.classList.add('added');
            btn.textContent = '✓';
            btn.title = 'Удалить из списка котировок';
          } else {
            btn.classList.remove('added');
            btn.textContent = '+';
            btn.title = 'Добавить в список котировок';
          }
        };
      });

    } catch (err) {
      console.warn('[Watchlist] Search error in modal:', err);
    }
  }
}

export default WatchlistComponent;

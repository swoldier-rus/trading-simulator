// components/trade-lines-overlay.js - Interactive Drag & Drop Trade Lines Overlay on Chart (Positions, SL, TP, Orders)
import { eventBus } from '../core/event-bus.js';
import { formatMoney, showToast } from '../core/utils.js';

export class TradeLinesOverlayComponent {
  constructor(store) {
    this.store = store;

    this.chartContainer = document.querySelector('.chart-container');
    this.overlayEl = document.getElementById('chartTradeOverlay');
    this.chartEl = document.getElementById('chart');

    // Drag state
    this.dragState = null; // { type: 'sl'|'tp'|'order', id: string, initialPrice: number, pointerId: number }

    this._hasSubscribedRangeChange = false;
    this.init();
  }

  init() {
    if (!this.overlayEl || !this.chartContainer) return;

    // Listen to account and market events
    eventBus.on('account:update', () => this.scheduleRender());
    eventBus.on('bar:tick', (bar) => this.scheduleRender(bar));
    eventBus.on('symbol:change', () => this.scheduleRender());

    // Re-render overlay when chart pans or zooms
    this.chartContainer.addEventListener('wheel', () => this.scheduleRender(), { passive: true });

    // Only re-render on mousemove when user is actively panning chart canvas with mouse button held down
    this.chartContainer.addEventListener('mousemove', (e) => {
      if (e.buttons === 1 && !this.dragState && !e.target.closest('.chart-trade-overlay')) {
        this.scheduleRender();
      }
    });

    this.chartContainer.addEventListener('touchmove', () => {
      if (!this.dragState) this.scheduleRender();
    }, { passive: true });

    // Subscribe to chart logical range changes (pan/scroll/zoom)
    this._subscribeChartRangeChange();

    // Window resize
    window.addEventListener('resize', () => this.scheduleRender());

    // Delegated listeners attached ONCE to persistent overlay container
    this.attachOverlayListeners();

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

  scheduleRender(latestBar = null) {
    if (this.dragState) {
      // While dragging, don't update positions or DOM structure
      this.updatePnLOnly(latestBar);
      return;
    }

    if (this._renderPending) return;
    this._renderPending = true;

    requestAnimationFrame(() => {
      this._renderPending = false;
      this.render(latestBar);
    });
  }

  updatePnLOnly(latestBar) {
    const paperAccount = this.store.paperAccount;
    if (!paperAccount) return;
    const currentSymbol = this.store.get('currentSymbol');
    const pos = paperAccount.positions.find(p => p.symbol === currentSymbol);
    if (!pos || !this.overlayEl) return;

    const bar = latestBar || (this.store.simulator ? this.store.simulator.getCurrentBar() : null);
    const curPrice = bar ? bar.close : pos.currentPrice;
    const isLong = pos.side === 'BUY';
    const priceDiff = curPrice - pos.entryPrice;
    const pnl = priceDiff * pos.qty * (isLong ? 1 : -1);
    const pnlPct = (priceDiff / pos.entryPrice) * 100 * (isLong ? 1 : -1);

    const pnlEl = this.overlayEl.querySelector(`[data-pos-id="${pos.id}"] .badge-pnl`);
    if (pnlEl) {
      pnlEl.textContent = `${pnl >= 0 ? '+' : ''}${formatMoney(pnl)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)`;
      pnlEl.className = `badge-pnl ${pnl >= 0 ? 'text-positive' : 'text-negative'}`;
    }
  }

  _getOrCreateLine(key, htmlGenerator) {
    let lineEl = this.overlayEl.querySelector(`[data-line-key="${key}"]`);
    if (!lineEl) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = htmlGenerator().trim();
      lineEl = wrapper.firstElementChild;
      lineEl.setAttribute('data-line-key', key);
      this.overlayEl.appendChild(lineEl);
    }
    return lineEl;
  }

  render(latestBar = null) {
    if (!this.overlayEl || !this.chart) return;
    this._subscribeChartRangeChange();

    const paperAccount = this.store.paperAccount;
    if (!paperAccount) {
      this.overlayEl.innerHTML = '';
      return;
    }

    const currentSymbol = this.store.get('currentSymbol');
    const positions = paperAccount.positions.filter(p => p.symbol === currentSymbol);
    const orders = paperAccount.orders.filter(o => o.symbol === currentSymbol);

    if (positions.length === 0 && orders.length === 0) {
      this.overlayEl.innerHTML = '';
      return;
    }

    const bar = latestBar || (this.store.simulator ? this.store.simulator.getCurrentBar() : null);
    const curPrice = bar ? bar.close : (positions[0] ? positions[0].currentPrice : 0);
    const containerHeight = this.chartContainer.clientHeight;
    const activeKeys = new Set();

    // 1. Render Open Positions and SL/TP bracket lines
    for (const pos of positions) {
      const isLong = pos.side === 'BUY';
      const priceDiff = curPrice - pos.entryPrice;
      const pnl = priceDiff * pos.qty * (isLong ? 1 : -1);
      const pnlPct = pos.entryPrice > 0 ? (priceDiff / pos.entryPrice) * 100 * (isLong ? 1 : -1) : 0;
      const entryY = this.chart.priceToCoordinate(pos.entryPrice);

      // --- Position Entry Line ---
      const posKey = `pos_${pos.id}`;
      activeKeys.add(posKey);
      const posLine = this._getOrCreateLine(posKey, () => `
        <div class="trade-overlay-line position-line ${isLong ? 'long' : 'short'}" data-line-key="${posKey}" data-pos-id="${pos.id}">
          <div class="trade-line-rail"></div>
          <div class="trade-badge position-badge">
            <span class="badge-tag ${isLong ? 'long' : 'short'}">${isLong ? 'BUY' : 'SELL'} ${pos.lots}л</span>
            <span class="badge-price">${pos.entryPrice.toFixed(2)} ₽</span>
            <span class="badge-pnl ${pnl >= 0 ? 'text-positive' : 'text-negative'}">
              ${pnl >= 0 ? '+' : ''}${formatMoney(pnl)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)
            </span>
            <div class="badge-actions">
              ${!pos.sl ? `<button type="button" class="btn-line-add btn-add-sl" title="Создать Stop Loss" data-action="add-sl" data-pos-id="${pos.id}">+ SL</button>` : ''}
              ${!pos.tp ? `<button type="button" class="btn-line-add btn-add-tp" title="Создать Take Profit" data-action="add-tp" data-pos-id="${pos.id}">+ TP</button>` : ''}
              <button type="button" class="btn-line-icon btn-line-reverse" title="Перевернуть позицию" data-action="reverse-pos" data-pos-id="${pos.id}">⇄</button>
              <button type="button" class="btn-line-icon btn-line-close" title="Закрыть позицию по рынку" data-action="close-pos" data-pos-id="${pos.id}">✕</button>
            </div>
          </div>
        </div>
      `);

      if (entryY !== null && entryY >= -30 && entryY <= containerHeight + 30) {
        posLine.style.display = '';
        posLine.style.top = `${entryY}px`;
      } else {
        posLine.style.display = 'none';
      }

      posLine.className = `trade-overlay-line position-line ${isLong ? 'long' : 'short'}`;
      const tagEl = posLine.querySelector('.badge-tag');
      if (tagEl) {
        tagEl.className = `badge-tag ${isLong ? 'long' : 'short'}`;
        tagEl.textContent = `${isLong ? 'BUY' : 'SELL'} ${pos.lots}л`;
      }
      const priceEl = posLine.querySelector('.badge-price');
      if (priceEl) priceEl.textContent = `${pos.entryPrice.toFixed(2)} ₽`;

      const pnlEl = posLine.querySelector('.badge-pnl');
      if (pnlEl) {
        pnlEl.className = `badge-pnl ${pnl >= 0 ? 'text-positive' : 'text-negative'}`;
        pnlEl.textContent = `${pnl >= 0 ? '+' : ''}${formatMoney(pnl)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)`;
      }

      // Dynamic action buttons (+ SL, + TP)
      const actionsEl = posLine.querySelector('.badge-actions');
      if (actionsEl) {
        let btnSl = actionsEl.querySelector('.btn-add-sl');
        if (pos.sl && pos.sl > 0) {
          if (btnSl) btnSl.remove();
        } else if (!btnSl) {
          btnSl = document.createElement('button');
          btnSl.type = 'button';
          btnSl.className = 'btn-line-add btn-add-sl';
          btnSl.title = 'Создать Stop Loss';
          btnSl.setAttribute('data-action', 'add-sl');
          btnSl.setAttribute('data-pos-id', pos.id);
          btnSl.textContent = '+ SL';
          actionsEl.insertBefore(btnSl, actionsEl.firstChild);
        }

        let btnTp = actionsEl.querySelector('.btn-add-tp');
        if (pos.tp && pos.tp > 0) {
          if (btnTp) btnTp.remove();
        } else if (!btnTp) {
          btnTp = document.createElement('button');
          btnTp.type = 'button';
          btnTp.className = 'btn-line-add btn-add-tp';
          btnTp.title = 'Создать Take Profit';
          btnTp.setAttribute('data-action', 'add-tp');
          btnTp.setAttribute('data-pos-id', pos.id);
          btnTp.textContent = '+ TP';
          const reverseBtn = actionsEl.querySelector('.btn-line-reverse');
          actionsEl.insertBefore(btnTp, reverseBtn || null);
        }
      }

      // --- Position Stop Loss Line ---
      if (pos.sl && pos.sl > 0) {
        const slKey = `pos_sl_${pos.id}`;
        activeKeys.add(slKey);
        const lossDiff = Math.abs(pos.sl - pos.entryPrice);
        const lossMoney = -(lossDiff * pos.qty);
        const lossPct = -(pos.entryPrice > 0 ? (lossDiff / pos.entryPrice) * 100 : 0);
        const slY = this.chart.priceToCoordinate(pos.sl);

        const slLine = this._getOrCreateLine(slKey, () => `
          <div class="trade-overlay-line sl-line" data-line-key="${slKey}" data-line-type="sl" data-pos-id="${pos.id}">
            <div class="trade-line-rail dashed"></div>
            <div class="trade-badge sl-badge drag-handle" data-drag-type="sl" data-pos-id="${pos.id}" title="Зажмите и перетащите мышкой для изменения Stop Loss">
              <span class="drag-grip">⠿</span>
              <span class="badge-tag sl-tag">SL ${pos.lots}л</span>
              <span class="badge-price" data-field="price">${pos.sl.toFixed(2)} ₽</span>
              <span class="badge-calc text-negative" data-field="risk">${formatMoney(lossMoney)} (${lossPct.toFixed(2)}%)</span>
              <button type="button" class="btn-line-icon btn-line-close" title="Отменить Stop Loss" data-action="remove-sl" data-pos-id="${pos.id}">✕</button>
            </div>
          </div>
        `);

        if (this.dragState?.type !== 'sl' || this.dragState?.id !== pos.id) {
          if (slY !== null && slY >= -30 && slY <= containerHeight + 30) {
            slLine.style.display = '';
            slLine.style.top = `${slY}px`;
          } else {
            slLine.style.display = 'none';
          }
          const slTag = slLine.querySelector('.badge-tag');
          if (slTag) slTag.textContent = `SL ${pos.lots}л`;
          const slPrice = slLine.querySelector('[data-field="price"]');
          if (slPrice) slPrice.textContent = `${pos.sl.toFixed(2)} ₽`;
          const slRisk = slLine.querySelector('[data-field="risk"]');
          if (slRisk) slRisk.textContent = `${formatMoney(lossMoney)} (${lossPct.toFixed(2)}%)`;
        }
      }

      // --- Position Take Profit Line ---
      if (pos.tp && pos.tp > 0) {
        const tpKey = `pos_tp_${pos.id}`;
        activeKeys.add(tpKey);
        const gainDiff = Math.abs(pos.tp - pos.entryPrice);
        const gainMoney = +(gainDiff * pos.qty);
        const gainPct = +(pos.entryPrice > 0 ? (gainDiff / pos.entryPrice) * 100 : 0);
        const tpY = this.chart.priceToCoordinate(pos.tp);

        const tpLine = this._getOrCreateLine(tpKey, () => `
          <div class="trade-overlay-line tp-line" data-line-key="${tpKey}" data-line-type="tp" data-pos-id="${pos.id}">
            <div class="trade-line-rail dashed"></div>
            <div class="trade-badge tp-badge drag-handle" data-drag-type="tp" data-pos-id="${pos.id}" title="Зажмите и перетащите мышкой для изменения Take Profit">
              <span class="drag-grip">⠿</span>
              <span class="badge-tag tp-tag">TP ${pos.lots}л</span>
              <span class="badge-price" data-field="price">${pos.tp.toFixed(2)} ₽</span>
              <span class="badge-calc text-positive" data-field="reward">+${formatMoney(gainMoney)} (+${gainPct.toFixed(2)}%)</span>
              <button type="button" class="btn-line-icon btn-line-close" title="Отменить Take Profit" data-action="remove-tp" data-pos-id="${pos.id}">✕</button>
            </div>
          </div>
        `);

        if (this.dragState?.type !== 'tp' || this.dragState?.id !== pos.id) {
          if (tpY !== null && tpY >= -30 && tpY <= containerHeight + 30) {
            tpLine.style.display = '';
            tpLine.style.top = `${tpY}px`;
          } else {
            tpLine.style.display = 'none';
          }
          const tpTag = tpLine.querySelector('.badge-tag');
          if (tpTag) tpTag.textContent = `TP ${pos.lots}л`;
          const tpPrice = tpLine.querySelector('[data-field="price"]');
          if (tpPrice) tpPrice.textContent = `${pos.tp.toFixed(2)} ₽`;
          const tpReward = tpLine.querySelector('[data-field="reward"]');
          if (tpReward) tpReward.textContent = `+${formatMoney(gainMoney)} (+${gainPct.toFixed(2)}%)`;
        }
      }
    }

    // 2. Render Working / Pending Orders (LIMIT & STOP) and their attached SL/TP brackets
    for (const ord of orders) {
      const isLong = ord.side === 'BUY';
      const notional = ord.price * ord.qty;
      const ordY = this.chart.priceToCoordinate(ord.price);

      // --- Order Line ---
      const ordKey = `ord_${ord.id}`;
      activeKeys.add(ordKey);
      const ordLine = this._getOrCreateLine(ordKey, () => `
        <div class="trade-overlay-line order-line ${isLong ? 'buy' : 'sell'}" data-line-key="${ordKey}" data-line-type="order" data-order-id="${ord.id}">
          <div class="trade-line-rail dotted"></div>
          <div class="trade-badge order-badge drag-handle" data-drag-type="order" data-order-id="${ord.id}" title="Зажмите и перетащите мышкой для изменения цены заявки">
            <span class="drag-grip">⠿</span>
            <span class="badge-tag order-tag ${isLong ? 'buy' : 'sell'} clickable" data-action="edit-order-lots" data-order-id="${ord.id}" title="Кликните, чтобы изменить количество лотов">${ord.type} ${isLong ? 'BUY' : 'SELL'} <b class="tag-lots-val">${ord.lots}л</b></span>
            <span class="badge-price" data-field="price">${ord.price.toFixed(2)} ₽</span>
            <span class="badge-notional">${formatMoney(notional)}</span>
            <div class="badge-actions">
              ${!ord.sl ? `<button type="button" class="btn-line-add btn-add-sl" title="Прикрепить Stop Loss к заявке" data-action="add-order-sl" data-order-id="${ord.id}">+ SL</button>` : ''}
              ${!ord.tp ? `<button type="button" class="btn-line-add btn-add-tp" title="Прикрепить Take Profit к заявке" data-action="add-order-tp" data-order-id="${ord.id}">+ TP</button>` : ''}
              <button type="button" class="btn-line-icon btn-line-close" title="Отменить заявку" data-action="cancel-order" data-order-id="${ord.id}">✕</button>
            </div>
          </div>
        </div>
      `);

      if (this.dragState?.type !== 'order' || this.dragState?.id !== ord.id) {
        if (ordY !== null && ordY >= -30 && ordY <= containerHeight + 30) {
          ordLine.style.display = '';
          ordLine.style.top = `${ordY}px`;
        } else {
          ordLine.style.display = 'none';
        }
        ordLine.className = `trade-overlay-line order-line ${isLong ? 'buy' : 'sell'}`;
        const tagEl = ordLine.querySelector('.order-tag');
        if (tagEl) {
          tagEl.className = `badge-tag order-tag ${isLong ? 'buy' : 'sell'} clickable`;
          tagEl.innerHTML = `${ord.type} ${isLong ? 'BUY' : 'SELL'} <b class="tag-lots-val">${ord.lots}л</b>`;
        }
        const priceEl = ordLine.querySelector('[data-field="price"]');
        if (priceEl) priceEl.textContent = `${ord.price.toFixed(2)} ₽`;
        const notionalEl = ordLine.querySelector('.badge-notional');
        if (notionalEl) notionalEl.textContent = formatMoney(notional);
      }

      // Dynamic action buttons on order line (+ SL, + TP)
      const ordActionsEl = ordLine.querySelector('.badge-actions');
      if (ordActionsEl) {
        let btnSl = ordActionsEl.querySelector('.btn-add-sl');
        if (ord.sl && ord.sl > 0) {
          if (btnSl) btnSl.remove();
        } else if (!btnSl) {
          btnSl = document.createElement('button');
          btnSl.type = 'button';
          btnSl.className = 'btn-line-add btn-add-sl';
          btnSl.title = 'Прикрепить Stop Loss к заявке';
          btnSl.setAttribute('data-action', 'add-order-sl');
          btnSl.setAttribute('data-order-id', ord.id);
          btnSl.textContent = '+ SL';
          ordActionsEl.insertBefore(btnSl, ordActionsEl.firstChild);
        }

        let btnTp = ordActionsEl.querySelector('.btn-add-tp');
        if (ord.tp && ord.tp > 0) {
          if (btnTp) btnTp.remove();
        } else if (!btnTp) {
          btnTp = document.createElement('button');
          btnTp.type = 'button';
          btnTp.className = 'btn-line-add btn-add-tp';
          btnTp.title = 'Прикрепить Take Profit к заявке';
          btnTp.setAttribute('data-action', 'add-order-tp');
          btnTp.setAttribute('data-order-id', ord.id);
          btnTp.textContent = '+ TP';
          const cancelBtn = ordActionsEl.querySelector('.btn-line-close');
          ordActionsEl.insertBefore(btnTp, cancelBtn || null);
        }
      }

      // --- Order Attached Stop Loss Line ---
      if (ord.sl && ord.sl > 0) {
        const ordSlKey = `ord_sl_${ord.id}`;
        activeKeys.add(ordSlKey);
        const lossDiff = Math.abs(ord.sl - ord.price);
        const lossMoney = -(lossDiff * ord.qty);
        const lossPct = -(ord.price > 0 ? (lossDiff / ord.price) * 100 : 0);
        const slY = this.chart.priceToCoordinate(ord.sl);

        const slLine = this._getOrCreateLine(ordSlKey, () => `
          <div class="trade-overlay-line sl-line order-bracket" data-line-key="${ordSlKey}" data-line-type="order-sl" data-order-id="${ord.id}">
            <div class="trade-line-rail dashed"></div>
            <div class="trade-badge sl-badge drag-handle" data-drag-type="order-sl" data-order-id="${ord.id}" title="Зажмите и перетащите мышкой для изменения Stop Loss заявки">
              <span class="drag-grip">⠿</span>
              <span class="badge-tag sl-tag">SL (${ord.type}) ${ord.lots}л</span>
              <span class="badge-price" data-field="price">${ord.sl.toFixed(2)} ₽</span>
              <span class="badge-calc text-negative" data-field="risk">${formatMoney(lossMoney)} (${lossPct.toFixed(2)}%)</span>
              <button type="button" class="btn-line-icon btn-line-close" title="Отменить Stop Loss заявки" data-action="remove-order-sl" data-order-id="${ord.id}">✕</button>
            </div>
          </div>
        `);

        if (this.dragState?.type !== 'order-sl' || this.dragState?.id !== ord.id) {
          if (slY !== null && slY >= -30 && slY <= containerHeight + 30) {
            slLine.style.display = '';
            slLine.style.top = `${slY}px`;
          } else {
            slLine.style.display = 'none';
          }
          const slTag = slLine.querySelector('.badge-tag');
          if (slTag) slTag.textContent = `SL (${ord.type}) ${ord.lots}л`;
          const slPrice = slLine.querySelector('[data-field="price"]');
          if (slPrice) slPrice.textContent = `${ord.sl.toFixed(2)} ₽`;
          const slRisk = slLine.querySelector('[data-field="risk"]');
          if (slRisk) slRisk.textContent = `${formatMoney(lossMoney)} (${lossPct.toFixed(2)}%)`;
        }
      }

      // --- Order Attached Take Profit Line ---
      if (ord.tp && ord.tp > 0) {
        const ordTpKey = `ord_tp_${ord.id}`;
        activeKeys.add(ordTpKey);
        const gainDiff = Math.abs(ord.tp - ord.price);
        const gainMoney = +(gainDiff * ord.qty);
        const gainPct = +(ord.price > 0 ? (gainDiff / ord.price) * 100 : 0);
        const tpY = this.chart.priceToCoordinate(ord.tp);

        const tpLine = this._getOrCreateLine(ordTpKey, () => `
          <div class="trade-overlay-line tp-line order-bracket" data-line-key="${ordTpKey}" data-line-type="order-tp" data-order-id="${ord.id}">
            <div class="trade-line-rail dashed"></div>
            <div class="trade-badge tp-badge drag-handle" data-drag-type="order-tp" data-order-id="${ord.id}" title="Зажмите и перетащите мышкой для изменения Take Profit заявки">
              <span class="drag-grip">⠿</span>
              <span class="badge-tag tp-tag">TP (${ord.type}) ${ord.lots}л</span>
              <span class="badge-price" data-field="price">${ord.tp.toFixed(2)} ₽</span>
              <span class="badge-calc text-positive" data-field="reward">+${formatMoney(gainMoney)} (+${gainPct.toFixed(2)}%)</span>
              <button type="button" class="btn-line-icon btn-line-close" title="Отменить Take Profit заявки" data-action="remove-order-tp" data-order-id="${ord.id}">✕</button>
            </div>
          </div>
        `);

        if (this.dragState?.type !== 'order-tp' || this.dragState?.id !== ord.id) {
          if (tpY !== null && tpY >= -30 && tpY <= containerHeight + 30) {
            tpLine.style.display = '';
            tpLine.style.top = `${tpY}px`;
          } else {
            tpLine.style.display = 'none';
          }
          const tpTag = tpLine.querySelector('.badge-tag');
          if (tpTag) tpTag.textContent = `TP (${ord.type}) ${ord.lots}л`;
          const tpPrice = tpLine.querySelector('[data-field="price"]');
          if (tpPrice) tpPrice.textContent = `${ord.tp.toFixed(2)} ₽`;
          const tpReward = tpLine.querySelector('[data-field="reward"]');
          if (tpReward) tpReward.textContent = `+${formatMoney(gainMoney)} (+${gainPct.toFixed(2)}%)`;
        }
      }
    }

    // 3. Remove stale lines not in activeKeys
    const allLines = Array.from(this.overlayEl.querySelectorAll('.trade-overlay-line'));
    for (const el of allLines) {
      const key = el.getAttribute('data-line-key');
      if (!key || !activeKeys.has(key)) {
        el.remove();
      }
    }
  }

  attachOverlayListeners() {
    if (!this.overlayEl) return;

    // 1. Delegated click handler for all buttons and interactive elements
    this.overlayEl.addEventListener('click', (e) => {
      const actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;
      e.stopPropagation();
      e.preventDefault();
      const action = actionEl.getAttribute('data-action');
      const posId = actionEl.getAttribute('data-pos-id');
      const orderId = actionEl.getAttribute('data-order-id');
      this.handleAction(action, posId || orderId);
    });

    // 2. Delegated pointerdown handler for drag-handles
    this.overlayEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; // Only primary button
      if (e.target.closest('button') || e.target.closest('[data-action]')) return; // Ignore clicks on action buttons/tags inside the badge
      const handle = e.target.closest('.drag-handle');
      if (!handle) return;
      this.handleDragStart(e, handle);
    });
  }

  handleAction(action, id) {
    const paperAccount = this.store.paperAccount;
    const simulator = this.store.simulator;
    if (!paperAccount) return;

    switch (action) {
      case 'close-pos': {
        const bar = simulator ? simulator.getCurrentBar() : null;
        const pos = paperAccount.positions.find(p => p.id === id);
        if (pos) {
          const price = bar ? bar.close : pos.currentPrice;
          paperAccount.closePosition(pos.id, price, bar ? bar.time : null, 'С графика (Drag-панель)');
          showToast(`Позиция ${pos.symbol} закрыта с графика`, 'info');
        }
        break;
      }
      case 'reverse-pos': {
        const bar = simulator ? simulator.getCurrentBar() : null;
        const pos = paperAccount.positions.find(p => p.id === id);
        if (pos) {
          const price = bar ? bar.close : pos.currentPrice;
          paperAccount.reversePosition(pos.id, price, bar ? bar.time : null);
          showToast(`Позиция ${pos.symbol} перевернута!`, 'info');
        }
        break;
      }
      case 'add-sl': {
        const pos = paperAccount.positions.find(p => p.id === id);
        if (pos) {
          const isLong = pos.side === 'BUY';
          const suggestedSL = +(pos.entryPrice * (isLong ? 0.99 : 1.01)).toFixed(2);
          paperAccount.updatePositionSL(pos.id, suggestedSL);
          showToast(`Stop Loss выставлен на ${suggestedSL.toFixed(2)} ₽. Перетащите для настройки!`, 'success');
        }
        break;
      }
      case 'add-tp': {
        const pos = paperAccount.positions.find(p => p.id === id);
        if (pos) {
          const isLong = pos.side === 'BUY';
          const suggestedTP = +(pos.entryPrice * (isLong ? 1.012 : 0.988)).toFixed(2);
          paperAccount.updatePositionTP(pos.id, suggestedTP);
          showToast(`Take Profit выставлен на ${suggestedTP.toFixed(2)} ₽. Перетащите для настройки!`, 'success');
        }
        break;
      }
      case 'remove-sl': {
        paperAccount.updatePositionSL(id, null);
        showToast('Stop Loss отменен', 'info');
        break;
      }
      case 'remove-tp': {
        paperAccount.updatePositionTP(id, null);
        showToast('Take Profit отменен', 'info');
        break;
      }
      case 'add-order-sl': {
        const ord = paperAccount.orders.find(o => o.id === id);
        if (ord) {
          const isLong = ord.side === 'BUY';
          const suggestedSL = +(ord.price * (isLong ? 0.99 : 1.01)).toFixed(2);
          paperAccount.updateOrderSL(ord.id, suggestedSL);
          showToast(`Stop Loss заявки выставлен на ${suggestedSL.toFixed(2)} ₽. Перетащите для настройки!`, 'success');
        }
        break;
      }
      case 'add-order-tp': {
        const ord = paperAccount.orders.find(o => o.id === id);
        if (ord) {
          const isLong = ord.side === 'BUY';
          const suggestedTP = +(ord.price * (isLong ? 1.015 : 0.985)).toFixed(2);
          paperAccount.updateOrderTP(ord.id, suggestedTP);
          showToast(`Take Profit заявки выставлен на ${suggestedTP.toFixed(2)} ₽. Перетащите для настройки!`, 'success');
        }
        break;
      }
      case 'remove-order-sl': {
        paperAccount.updateOrderSL(id, null);
        showToast('Stop Loss заявки отменен', 'info');
        break;
      }
      case 'remove-order-tp': {
        paperAccount.updateOrderTP(id, null);
        showToast('Take Profit заявки отменен', 'info');
        break;
      }
      case 'cancel-order': {
        const ok = paperAccount.cancelOrder(id);
        if (ok) showToast('Заявка отменена с графика', 'info');
        break;
      }
      case 'edit-order-lots': {
        if (this.store.editOrderModal) {
          this.store.editOrderModal.open(id);
        }
        break;
      }
    }
  }

  // --- Modern Drag & Drop via Pointer Events ---
  handleDragStart(e, handle) {
    if (e.button !== 0) return; // Only primary button
    if (e.target.closest('button') || e.target.closest('[data-action]')) return; // Ignore clicks on action buttons/tags inside the badge

    e.preventDefault();
    e.stopPropagation();

    const dragType = handle.getAttribute('data-drag-type');
    const posId = handle.getAttribute('data-pos-id');
    const orderId = handle.getAttribute('data-order-id');
    const lineEl = handle.closest('.trade-overlay-line');
    if (!lineEl) return;

    try {
      handle.setPointerCapture(e.pointerId);
    } catch (err) {
      // Safe fallback for synthetic/unsupported pointer capture
    }

    const chartRect = this.chartContainer.getBoundingClientRect();
    const currentPriceText = handle.querySelector('[data-field="price"]')?.textContent || '0';
    const initialPrice = parseFloat(currentPriceText.replace(/[^\d.]/g, '')) || 0;

    this.dragState = {
      type: dragType,
      id: posId || orderId,
      lineEl,
      handle,
      pointerId: e.pointerId,
      chartRect,
      initialPrice,
      currentPrice: initialPrice
    };

    lineEl.classList.add('dragging');
    handle.classList.add('dragging');

    // Attach move and up listeners to handle
    handle.onpointermove = (ev) => this.handleDragMove(ev);
    handle.onpointerup = (ev) => this.handleDragEnd(ev);
    handle.onpointercancel = (ev) => this.handleDragEnd(ev);
    handle.onlostpointercapture = (ev) => this.handleDragEnd(ev);
  }

  handleDragMove(e) {
    if (!this.dragState || !this.chart) return;
    e.preventDefault();

    const { lineEl, handle, chartRect, type, id } = this.dragState;
    const localY = Math.max(10, Math.min(chartRect.height - 30, e.clientY - chartRect.top));

    // Convert pixel Y coordinate to price
    const rawPrice = this.chart.coordinateToPrice(localY);
    if (!rawPrice || rawPrice <= 0) return;

    // Snap to 0.05 step
    const step = 0.05;
    const newPrice = +(Math.round(rawPrice / step) * step).toFixed(2);
    this.dragState.currentPrice = newPrice;

    // Update line position immediately for 60 FPS feedback
    lineEl.style.top = `${localY}px`;

    // Update badge price text
    const priceField = handle.querySelector('[data-field="price"]');
    if (priceField) {
      priceField.textContent = `${newPrice.toFixed(2)} ₽`;
    }

    // Update projected PnL readout while dragging SL or TP
    const paperAccount = this.store.paperAccount;
    if (paperAccount) {
      if (type === 'sl' || type === 'tp') {
        const pos = paperAccount.positions.find(p => p.id === id);
        if (pos) {
          const diff = Math.abs(newPrice - pos.entryPrice);
          const money = diff * pos.qty;
          const pct = pos.entryPrice > 0 ? (diff / pos.entryPrice) * 100 : 0;

          if (type === 'sl') {
            const riskField = handle.querySelector('[data-field="risk"]');
            if (riskField) {
              riskField.textContent = `-${formatMoney(money)} (-${pct.toFixed(2)}%)`;
            }
          } else if (type === 'tp') {
            const rewardField = handle.querySelector('[data-field="reward"]');
            if (rewardField) {
              rewardField.textContent = `+${formatMoney(money)} (+${pct.toFixed(2)}%)`;
            }
          }
        }
      } else if (type === 'order-sl' || type === 'order-tp') {
        const ord = paperAccount.orders.find(o => o.id === id);
        if (ord) {
          const diff = Math.abs(newPrice - ord.price);
          const money = diff * ord.qty;
          const pct = ord.price > 0 ? (diff / ord.price) * 100 : 0;

          if (type === 'order-sl') {
            const riskField = handle.querySelector('[data-field="risk"]');
            if (riskField) {
              riskField.textContent = `-${formatMoney(money)} (-${pct.toFixed(2)}%)`;
            }
          } else if (type === 'order-tp') {
            const rewardField = handle.querySelector('[data-field="reward"]');
            if (rewardField) {
              rewardField.textContent = `+${formatMoney(money)} (+${pct.toFixed(2)}%)`;
            }
          }
        }
      }
    }
  }

  handleDragEnd(e) {
    if (!this.dragState) return;

    const { type, id, lineEl, handle, initialPrice, currentPrice, pointerId } = this.dragState;
    lineEl.classList.remove('dragging');
    handle.classList.remove('dragging');

    try {
      if (handle.hasPointerCapture && handle.hasPointerCapture(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }
    } catch (err) {}

    handle.onpointermove = null;
    handle.onpointerup = null;
    handle.onpointercancel = null;
    handle.onlostpointercapture = null;

    this.dragState = null;

    if (Math.abs(currentPrice - initialPrice) >= 0.01) {
      this.commitPriceChange(type, id, currentPrice);
    } else {
      this.scheduleRender();
    }
  }

  commitPriceChange(type, id, newPrice) {
    const paperAccount = this.store.paperAccount;
    if (!paperAccount) return;

    switch (type) {
      case 'sl': {
        const pos = paperAccount.positions.find(p => p.id === id);
        if (pos) {
          paperAccount.updatePositionSL(pos.id, newPrice);
          showToast(`Stop Loss перемещен: ${newPrice.toFixed(2)} ₽`, 'info');
        }
        break;
      }
      case 'tp': {
        const pos = paperAccount.positions.find(p => p.id === id);
        if (pos) {
          paperAccount.updatePositionTP(pos.id, newPrice);
          showToast(`Take Profit перемещен: ${newPrice.toFixed(2)} ₽`, 'info');
        }
        break;
      }
      case 'order': {
        const ok = paperAccount.modifyOrder(id, newPrice, true);
        if (ok) {
          showToast(`Заявка перемещена: ${newPrice.toFixed(2)} ₽`, 'info');
        }
        break;
      }
      case 'order-sl': {
        const ok = paperAccount.updateOrderSL(id, newPrice);
        if (ok) {
          showToast(`Stop Loss заявки перемещен: ${newPrice.toFixed(2)} ₽`, 'info');
        }
        break;
      }
      case 'order-tp': {
        const ok = paperAccount.updateOrderTP(id, newPrice);
        if (ok) {
          showToast(`Take Profit заявки перемещен: ${newPrice.toFixed(2)} ₽`, 'info');
        }
        break;
      }
    }

    this.scheduleRender();
  }
}

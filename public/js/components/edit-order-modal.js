// components/edit-order-modal.js - Order Quantity / Lots Modification Modal Dialog
import { showToast, formatMoney } from '../core/utils.js';

export class EditOrderModalComponent {
  constructor(store) {
    this.store = store;

    this.modal = document.getElementById('editOrderModal');
    this.modalTitle = document.getElementById('editOrderModalTitle');
    this.btnClose = document.getElementById('btnCloseEditOrderModal');
    this.btnCancel = document.getElementById('btnCancelEditOrderModal');
    this.btnApply = document.getElementById('btnApplyEditOrderModal');

    // Summary badge elements
    this.badgeSide = document.getElementById('editOrderSideBadge');
    this.textType = document.getElementById('editOrderTypeText');
    this.textPrice = document.getElementById('editOrderPriceText');

    // Lots input & stepper
    this.inputLots = document.getElementById('inputEditOrderLots');
    this.btnDec = document.getElementById('btnEditOrderQtyDec');
    this.btnInc = document.getElementById('btnEditOrderQtyInc');
    this.sharesInfo = document.getElementById('editOrderSharesInfo');
    this.notionalVal = document.getElementById('editOrderNotionalVal');
    this.chipsRow = document.getElementById('editOrderChipsRow');

    this.activeOrderId = null;
    this.activeOrder = null;

    this.init();
  }

  init() {
    if (!this.modal) return;

    if (this.btnClose) this.btnClose.onclick = () => this.close();
    if (this.btnCancel) this.btnCancel.onclick = () => this.close();

    // Click outside backdrop to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    // Stepper buttons
    if (this.btnDec) {
      this.btnDec.onclick = () => {
        const val = Math.max(1, (parseInt(this.inputLots?.value, 10) || 1) - 1);
        this.setLots(val);
      };
    }

    if (this.btnInc) {
      this.btnInc.onclick = () => {
        const val = Math.max(1, (parseInt(this.inputLots?.value, 10) || 1) + 1);
        this.setLots(val);
      };
    }

    // Input changes
    if (this.inputLots) {
      this.inputLots.oninput = () => {
        const val = Math.max(1, parseInt(this.inputLots.value, 10) || 1);
        this.updateCalculations(val);
        this.updateActiveChip(val);
      };

      this.inputLots.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.applyChanges();
        }
      };
    }

    // Quick chips
    if (this.chipsRow) {
      const chips = this.chipsRow.querySelectorAll('.panel-chip');
      chips.forEach(chip => {
        chip.onclick = () => {
          const l = parseInt(chip.getAttribute('data-lots'), 10);
          if (l > 0) this.setLots(l);
        };
      });
    }

    // Apply button
    if (this.btnApply) {
      this.btnApply.onclick = () => this.applyChanges();
    }
  }

  open(orderId) {
    const paperAccount = this.store.paperAccount;
    if (!paperAccount) return;

    const order = paperAccount.orders.find(o => o.id === orderId);
    if (!order) {
      showToast('Заявка не найдена или уже исполнена', 'error');
      return;
    }

    this.activeOrderId = orderId;
    this.activeOrder = order;

    const isLong = order.side === 'BUY';
    if (this.badgeSide) {
      this.badgeSide.textContent = isLong ? 'BUY' : 'SELL';
      this.badgeSide.className = `badge-side ${isLong ? 'buy' : 'sell'}`;
    }

    if (this.textType) {
      this.textType.textContent = `${order.type} ${order.symbol}`;
    }

    if (this.textPrice) {
      this.textPrice.textContent = `@ ${order.price.toFixed(2)} ₽`;
    }

    this.setLots(order.lots || 1);
    this.modal.classList.add('open');

    setTimeout(() => {
      if (this.inputLots) {
        this.inputLots.focus();
        this.inputLots.select();
      }
    }, 50);
  }

  close() {
    if (this.modal) this.modal.classList.remove('open');
    this.activeOrderId = null;
    this.activeOrder = null;
  }

  setLots(lots) {
    if (this.inputLots) {
      this.inputLots.value = lots;
    }
    this.updateCalculations(lots);
    this.updateActiveChip(lots);
  }

  updateCalculations(lots) {
    if (!this.activeOrder) return;
    const lotSize = this.activeOrder.lotSize || 1;
    const shares = lots * lotSize;
    const notional = shares * (this.activeOrder.price || 0);

    if (this.sharesInfo) {
      this.sharesInfo.textContent = `${shares.toLocaleString('ru-RU')} шт.`;
    }

    if (this.notionalVal) {
      this.notionalVal.textContent = formatMoney(notional);
    }
  }

  updateActiveChip(lots) {
    if (!this.chipsRow) return;
    const chips = this.chipsRow.querySelectorAll('.panel-chip');
    chips.forEach(chip => {
      const l = parseInt(chip.getAttribute('data-lots'), 10);
      chip.classList.toggle('active', l === lots);
    });
  }

  applyChanges() {
    if (!this.activeOrderId) return;
    const paperAccount = this.store.paperAccount;
    if (!paperAccount) return;

    const newLots = Math.max(1, parseInt(this.inputLots?.value, 10) || 1);
    const order = paperAccount.orders.find(o => o.id === this.activeOrderId);
    if (!order) {
      showToast('Заявка не найдена', 'error');
      this.close();
      return;
    }

    const success = paperAccount.modifyOrder(this.activeOrderId, { lots: newLots });

    if (success) {
      const isLong = order.side === 'BUY';
      const actionName = `${order.type} ${isLong ? 'BUY' : 'SELL'} ${order.symbol}`;
      showToast(`Заявка ${actionName} изменена: ${newLots} лот. (${newLots * (order.lotSize || 1)} шт.)`, 'success');
    } else {
      showToast('Не удалось изменить заявку', 'error');
    }

    this.close();
  }
}

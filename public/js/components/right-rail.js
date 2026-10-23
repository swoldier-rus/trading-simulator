// components/right-rail.js - TradingView Right Action Rail Component
import { eventBus } from '../core/event-bus.js';
import { showToast } from '../core/utils.js';

export class RightRailComponent {
  constructor(store) {
    this.store = store;

    // DOM Elements
    this.btnRightWatchlist = document.getElementById('btnRightWatchlist');
    this.btnRightOrderPanel = document.getElementById('btnRightOrderPanel');
    this.btnRightObjectTree = document.getElementById('btnRightObjectTree');

    this.initEventListeners();
  }

  initEventListeners() {
    // Watchlist placeholder (favorite tickers)
    if (this.btnRightWatchlist) {
      this.btnRightWatchlist.onclick = () => {
        showToast('Панель избранных тикеров (Watchlist) — скоро появится!', 'info');
      };
    }

    // Order panel toggle
    if (this.btnRightOrderPanel) {
      this.btnRightOrderPanel.onclick = () => {
        eventBus.emit('orderpanel:toggle');
      };
    }

    // Object tree placeholder (indicators & drawn shapes)
    if (this.btnRightObjectTree) {
      this.btnRightObjectTree.onclick = () => {
        showToast('Дерево объектов (индикаторы и нарисованные инструменты) — скоро появится!', 'info');
      };
    }
  }

  setOrderPanelActive(active) {
    if (this.btnRightOrderPanel) {
      this.btnRightOrderPanel.classList.toggle('active', !!active);
    }
  }
}

export default RightRailComponent;

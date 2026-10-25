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
    // Watchlist toggle
    if (this.btnRightWatchlist) {
      this.btnRightWatchlist.onclick = () => {
        eventBus.emit('watchlist:toggle');
      };
    }

    // Order panel toggle
    if (this.btnRightOrderPanel) {
      this.btnRightOrderPanel.onclick = () => {
        eventBus.emit('orderpanel:toggle');
      };
    }

    // Listen to panel toggled states for mutual exclusivity & icon highlighting
    eventBus.on('watchlist:toggled', (active) => {
      this.setWatchlistActive(active);
      if (active) {
        // Automatically collapse order panel when watchlist opens
        this.setOrderPanelActive(false);
      }
    });

    eventBus.on('orderpanel:toggled', (active) => {
      this.setOrderPanelActive(active);
      if (active) {
        // Automatically collapse watchlist when order panel opens
        this.setWatchlistActive(false);
      }
    });

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

  setWatchlistActive(active) {
    if (this.btnRightWatchlist) {
      this.btnRightWatchlist.classList.toggle('active', !!active);
    }
  }
}

export default RightRailComponent;

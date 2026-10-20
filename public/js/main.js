// main.js - Application Bootstrap & Coordinator Module (ES Module)
import { eventBus } from './core/event-bus.js';
import { store } from './core/store.js';
import { API } from './api.js';
import { marketDataService } from './services/market-data.service.js';
import { PaperTradingAccount } from './paper-trading.js';
import { MarketSimulator } from './simulator.js';
import { IndicatorManager } from './indicators.js';
import { showToast, timeframeToSeconds } from './core/utils.js';

// Components
import { ChartControllerComponent } from './components/chart-controller.js';
import { DrawingRailComponent } from './components/drawing-rail.js';
import { ToolbarComponent } from './components/toolbar.js';
import { OrderPanelComponent } from './components/order-panel.js';
import { ChartOrderMenuComponent } from './components/chart-order-menu.js';
import { BottomDockComponent } from './components/bottom-dock.js';
import { ReplayBarComponent } from './components/replay-bar.js';
import { ModalsComponent } from './components/modals.js';
import { TradeLinesOverlayComponent } from './components/trade-lines-overlay.js';
import { QuickTradeWidgetComponent } from './components/quick-trade-widget.js';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize Core Engines
  const paperAccount = new PaperTradingAccount(100000, 0.0005);
  const simulator = new MarketSimulator();

  store.paperAccount = paperAccount;
  store.simulator = simulator;

  // 2. Instantiate Components
  const chartController = new ChartControllerComponent(store);
  const drawingRail = new DrawingRailComponent(store);
  const toolbar = new ToolbarComponent(store);
  const orderPanel = new OrderPanelComponent(store);
  const chartOrderMenu = new ChartOrderMenuComponent(store);
  const bottomDock = new BottomDockComponent(store);
  const replayBar = new ReplayBarComponent(store);
  const modals = new ModalsComponent(store);
  const tradeLinesOverlay = new TradeLinesOverlayComponent(store);
  const quickTradeWidget = new QuickTradeWidgetComponent(store);

  store.tradeLinesOverlay = tradeLinesOverlay;
  store.quickTradeWidget = quickTradeWidget;
  store.indicatorManager = new IndicatorManager(store.chart);

  // 3. Connect Paper Trading Account Listeners
  paperAccount.onAccountUpdate = (metrics) => {
    eventBus.emit('account:update', metrics);
  };

  // 4. Connect Market Simulator Callbacks
  simulator.onBarAdvance = (candle, index, total, isBackward = false, subTickInfo = null) => {
    if (!candle) return;

    // Fast 60 FPS update for sub-tick animations; fallback to setData on bar jump/backward
    if (subTickInfo?.isSubTick) {
      if (store.mainSeries) {
        try {
          store.mainSeries.update(candle);
        } catch (err) {
          store.mainSeries.setData(simulator.getVisibleCandles());
        }
      }
    } else {
      const visible = simulator.getVisibleCandles();
      if (store.mainSeries) {
        store.mainSeries.setData(visible);
      }
    }

    // Process orders & SL/TP triggers sequentially per tick
    if (!isBackward) {
      const currentSymbol = store.get('currentSymbol');
      const events = paperAccount.onPriceTick(candle.close, candle.time, currentSymbol, candle);
      if (events && events.length > 0) {
        events.forEach(ev => showToast(ev.message, ev.type === 'ORDER_FILLED' ? 'info' : 'success'));
      }
    } else {
      paperAccount.onCandle(candle, store.get('currentSymbol'));
    }

    if (store.quickTradeWidget) {
      store.quickTradeWidget.updatePrice(candle);
    }

    eventBus.emit('bar:tick', candle);
    eventBus.emit('replay:ui-update', {
      index,
      total,
      time: candle.time,
      isPlaying: simulator.isPlaying,
      subTickInfo
    });
  };

  simulator.onStateChange = (state) => {
    eventBus.emit('replay:state-change', state.isReplayActive);
    const cur = simulator.getCurrentBar();
    eventBus.emit('replay:ui-update', {
      index: state.currentIndex,
      total: state.totalBars,
      time: cur ? cur.time : null,
      isPlaying: state.isPlaying,
      subTickInfo: state.subTickInfo
    });
  };

  // 5. Subsequent Historical Bars Prefetcher (Ensures continuous, non-stopping simulation)
  let isPrefetchingFuture = false;
  let prefetchPromise = null;

  async function prefetchSubsequentBars() {
    if (isPrefetchingFuture) return prefetchPromise;

    const allCandles = simulator.allCandles;
    if (!allCandles || allCandles.length === 0) return null;

    const latestBar = allCandles[allCandles.length - 1];
    const tf = store.get('currentTimeframe');
    const step = timeframeToSeconds(tf);
    const batchCount = 300;
    const fromSec = latestBar.time + step;
    const toSec = fromSec + (batchCount - 1) * step;

    isPrefetchingFuture = true;
    prefetchPromise = (async () => {
      try {
        const data = await marketDataService.getCandles(
          store.get('currentSymbol'),
          store.get('currentFigi'),
          tf,
          batchCount,
          toSec,
          fromSec,
          { forceNetwork: true, lastClose: latestBar.close }
        );

        if (data && data.candles && data.candles.length > 0) {
          const added = simulator.appendHistory(data.candles);
          if (added > 0) return added;
        }

        // Seamless fallback: continue generating continuous forward bars if exchange data limit is reached
        const synthAdded = simulator.generateContinuousBars(batchCount);
        return synthAdded;
      } catch (err) {
        console.warn('[Prefetch] Fallback to synthetic continuation:', err);
        return simulator.generateContinuousBars(batchCount);
      } finally {
        isPrefetchingFuture = false;
        prefetchPromise = null;
      }
    })();

    return prefetchPromise;
  }

  simulator.onNeedMoreBars = async () => {
    await prefetchSubsequentBars();
  };

  eventBus.on('replay:scrubbed', () => {
    const remaining = simulator.allCandles.length - simulator.currentIndex;
    if (remaining <= simulator.prefetchThreshold) {
      prefetchSubsequentBars();
    }
  });

  // 6. Candle Pipeline Loader
  async function loadCandles(targetBarTime = null, preserveReplay = false) {
    const currentSymbol = store.get('currentSymbol');
    const currentFigi = store.get('currentFigi');
    const currentTimeframe = store.get('currentTimeframe');

    const legendSymbol = document.getElementById('legendSymbol');
    const legendTF = document.getElementById('legendTF');
    if (legendSymbol) legendSymbol.textContent = currentSymbol;
    if (legendTF) legendTF.textContent = currentTimeframe.toUpperCase();

    try {
      let data = null;
      const step = timeframeToSeconds(currentTimeframe);
      const nowSec = Math.floor(Date.now() / 1000);

      if (targetBarTime) {
        if (preserveReplay) {
          const forwardSec = Math.max(350 * step, 7 * 86400);
          const toSec = Math.min(nowSec, targetBarTime + forwardSec);
          data = await marketDataService.getCandles(currentSymbol, currentFigi, currentTimeframe, 1200, toSec);
        } else {
          data = await marketDataService.getCandles(currentSymbol, currentFigi, currentTimeframe, 1200, targetBarTime);
        }
      } else {
        data = await marketDataService.getCandles(currentSymbol, currentFigi, currentTimeframe, 1200);
      }

      if (data && data.candles && data.candles.length > 0) {
        store.set('currentLotSize', data.lot || 10);
        orderPanel.updateLotsDisplay();

        const tokenBadge = document.getElementById('tokenBadge');
        const tokenStatusText = document.getElementById('tokenStatusText');
        if (tokenBadge && tokenStatusText) {
          if (data.fromCache) {
            tokenBadge.className = 'token-badge active';
            tokenStatusText.textContent = `Кэш IndexedDB (${data.totalCached || data.candles.length} баров)`;
          } else if (data.source === 'tinkoff') {
            tokenBadge.className = 'token-badge active';
            tokenStatusText.textContent = 'Т-Инвестиции онлайн';
          } else {
            tokenBadge.className = 'token-badge demo';
            tokenStatusText.textContent = 'Демо-симулятор';
          }
        }

        isPrefetchingFuture = false;
        prefetchPromise = null;
        let visibleBars = simulator.loadData(data.candles);

        if (preserveReplay && targetBarTime) {
          simulator.jumpToBar(targetBarTime);
          visibleBars = simulator.getVisibleCandles();
          const remaining = simulator.allCandles.length - simulator.currentIndex;
          if (remaining <= simulator.prefetchThreshold) {
            prefetchSubsequentBars();
          }
        }

        if (store.mainSeries) {
          store.mainSeries.setData(visibleBars);
          if (store.chart) store.chart.fitContent();
        }

        const latest = visibleBars[visibleBars.length - 1];
        if (latest) {
          chartController.updateLegend(latest);
          orderPanel.updateQuickPrices(latest.close);
          if (store.quickTradeWidget) {
            store.quickTradeWidget.updatePrice(latest);
          }
          chartController.syncTradeOverlays(latest.close);
        }
      } else {
        showToast('Не удалось загрузить данные свечей', 'error');
      }
    } catch (err) {
      console.error('Error in loadCandles:', err);
      showToast('Ошибка загрузки данных котировок', 'error');
    }
  }

  // Event bus reactions
  eventBus.on('timeframe:change', async ({ newTf, prevTf }) => {
    const barInfo = chartController.getLastChartBarInfo();
    let targetSec = barInfo.time;
    if (targetSec && prevTf === '1d' && newTf !== '1d') {
      targetSec = targetSec + 86400 - 1;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const isHistorical = barInfo.isReplay || barInfo.isScrolled || (targetSec && (nowSec - targetSec > 86400 * 2));

    if (isHistorical && targetSec) {
      await loadCandles(targetSec, barInfo.isReplay);
    } else {
      await loadCandles(null, false);
    }
  });

  eventBus.on('symbol:change', async () => {
    await loadCandles();
  });

  eventBus.on('settings:saved', async () => {
    await loadCandles();
  });

  // 7. Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;

    if (e.code === 'Space') {
      e.preventDefault();
      simulator.togglePlay();
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      simulator.stepForward();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      simulator.stepBackward();
    } else if (e.code === 'Escape') {
      drawingRail.resetToCursor();
      store.set('isSelectingJumpBar', false);
      modals.closeAll();
      const datePickerModal = document.getElementById('datePickerModal');
      if (datePickerModal) datePickerModal.classList.remove('open');
      const startPointMenu = document.getElementById('startPointMenu');
      if (startPointMenu) startPointMenu.style.display = 'none';
    } else if (e.key === 'b' || e.key === 'B' || e.key === 'и' || e.key === 'И') {
      orderPanel.executeTrade('BUY');
    } else if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') {
      orderPanel.executeTrade('SELL');
    }
  });

  // 8. Expose for testing and external controllers
  window._app = {
    chart: store.chart,
    mainSeries: store.mainSeries,
    simulator,
    paperAccount,
    store,
    eventBus,
    components: {
      chartController,
      drawingRail,
      toolbar,
      orderPanel,
      chartOrderMenu,
      bottomDock,
      replayBar,
      modals
    },
    loadCandles,
    prefetchSubsequentBars
  };

  // 9. Startup Initial Data Load
  await loadCandles();
});

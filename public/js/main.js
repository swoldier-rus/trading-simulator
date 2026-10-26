// main.js - Application Bootstrap & Coordinator Module (ES Module)
import { eventBus } from './core/event-bus.js';
import { store } from './core/store.js';
import { API } from './api.js';
import { marketDataService } from './services/market-data.service.js';
import { PaperTradingAccount } from './paper-trading.js';
import { MarketSimulator } from './simulator.js';
import { IndicatorManager } from './indicators.js';
import { showToast, timeframeToSeconds } from './core/utils.js';
import { appStateMachine } from './core/state-machine.js';
import { SessionPersistenceService } from './services/session.service.js';
import { cacheService } from './services/cache.service.js';
import { PortfolioMarketDataService } from './services/portfolio-data.service.js';

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
import { TradeExecutionsOverlayComponent } from './components/trade-executions-overlay.js';
import { QuickTradeWidgetComponent } from './components/quick-trade-widget.js';
import { FloatingDrawingToolbarComponent } from './components/floating-drawing-toolbar.js';
import { DrawingSettingsModalComponent } from './components/drawing-settings-modal.js';
import { EditOrderModalComponent } from './components/edit-order-modal.js';
import { ChartStyleModalComponent } from './components/chart-style-modal.js';
import { ChartZoomController } from './components/chart-zoom-controller.js';
import { RightRailComponent } from './components/right-rail.js';
import { SessionBreaksOverlayComponent } from './components/session-breaks-overlay.js';
import { WatchlistComponent } from './components/watchlist.js';
import { IndicatorSettingsModalComponent } from './components/indicator-settings-modal.js';
import { HistoryStartMarkerComponent } from './components/history-start-marker.js';
import { MultiChartLayoutManager } from './components/multi-chart.js';

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
  const tradeExecutionsOverlay = new TradeExecutionsOverlayComponent(store);
  const quickTradeWidget = new QuickTradeWidgetComponent(store);
  const drawingSettingsModal = new DrawingSettingsModalComponent(store);
  const floatingDrawingToolbar = new FloatingDrawingToolbarComponent(store);
  const editOrderModal = new EditOrderModalComponent(store);
  const chartStyleModal = new ChartStyleModalComponent(store);
  const rightRail = new RightRailComponent(store);
  const sessionBreaksOverlay = new SessionBreaksOverlayComponent(store);
  const zoomController = new ChartZoomController(store);
  const watchlist = new WatchlistComponent(store);
  const indicatorSettingsModal = new IndicatorSettingsModalComponent(store);
  const historyStartMarker = new HistoryStartMarkerComponent(store);
  const multiChart = new MultiChartLayoutManager(store);

  store.chartController = chartController;
  store.replayBar = replayBar;
  store.tradeLinesOverlay = tradeLinesOverlay;
  store.tradeExecutionsOverlay = tradeExecutionsOverlay;
  store.sessionBreaksOverlay = sessionBreaksOverlay;
  store.quickTradeWidget = quickTradeWidget;
  store.drawingSettingsModal = drawingSettingsModal;
  store.floatingDrawingToolbar = floatingDrawingToolbar;
  store.editOrderModal = editOrderModal;
  store.chartStyleModal = chartStyleModal;
  store.rightRail = rightRail;
  store.watchlist = watchlist;
  store.chartOrderMenu = chartOrderMenu;
  store.drawingRail = drawingRail;
  store.zoomController = zoomController;
  store.indicatorSettingsModal = indicatorSettingsModal;
  store.historyStartMarker = historyStartMarker;
  store.multiChart = multiChart;
  store.indicatorManager = new IndicatorManager(store.chart);
  store.components = {
    chartController,
    tradeLinesOverlay,
    tradeExecutionsOverlay,
    sessionBreaksOverlay,
    drawingRail,
    toolbar,
    orderPanel,
    watchlist,
    chartOrderMenu,
    bottomDock,
    replayBar,
    modals,
    drawingSettingsModal,
    floatingDrawingToolbar,
    editOrderModal,
    chartStyleModal,
    rightRail,
    quickTradeWidget,
    zoomController,
    indicatorSettingsModal,
    historyStartMarker
  };

  const sessionService = new SessionPersistenceService(store);
  store.sessionService = sessionService;
  sessionService.init();

  const portfolioDataService = new PortfolioMarketDataService(store);
  await portfolioDataService.init();
  store.portfolioDataService = portfolioDataService;

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
    const currentSymbol = store.get('currentSymbol');
    if (!isBackward) {
      const events = paperAccount.onPriceTick(candle.close, candle.time, currentSymbol, candle);
      if (events && events.length > 0) {
        events.forEach(ev => showToast(ev.message, ev.type === 'ORDER_FILLED' ? 'info' : 'success'));
      }
    } else {
      paperAccount.onCandle(candle, currentSymbol);
    }

    // Synchronize all background portfolio positions and orders at current simulation time!
    portfolioDataService.updatePortfolio(candle.time);

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
    appStateMachine.syncWithSimulator(state);
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
    setChartLoadingState(true, { fullReset: false });

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
        setChartLoadingState(false);
      }
    })();

    return prefetchPromise;
  }

  simulator.onNeedMoreBars = async () => {
    await prefetchSubsequentBars();
  };

  eventBus.on('replay:scrubbed', () => {
    const curBar = simulator.getCurrentBar();
    if (curBar && curBar.time) {
      portfolioDataService.updatePortfolio(curBar.time);
    }
    const remaining = simulator.allCandles.length - simulator.currentIndex;
    if (remaining <= simulator.prefetchThreshold) {
      prefetchSubsequentBars();
    }
  });

  // 6. Candle Pipeline Loader & Unified Chart Loading State Controller
  let activeLoadingCount = 0;
  let hasFullResetInFlight = false;
  let loaderShownTimestamp = 0;
  let hideLoaderTimeout = null;
  const MIN_LOADER_DURATION = 200; // Hold at least 200ms to guarantee smooth animation without micro-jitter

  function setChartLoadingState(isLoading, options = {}) {
    const fullReset = options.fullReset === true;

    if (isLoading) {
      activeLoadingCount++;
      if (fullReset) {
        hasFullResetInFlight = true;
      }

      if (hideLoaderTimeout) {
        clearTimeout(hideLoaderTimeout);
        hideLoaderTimeout = null;
      }

      if (hasFullResetInFlight) {
        store.set('isSymbolLoading', true);

        if (store.chartOrderMenu && typeof store.chartOrderMenu.close === 'function') {
          store.chartOrderMenu.close();
          if (typeof store.chartOrderMenu.closeTimeScaleContextMenu === 'function') {
            store.chartOrderMenu.closeTimeScaleContextMenu();
          }
          if (typeof store.chartOrderMenu.closePriceScaleContextMenu === 'function') {
            store.chartOrderMenu.closePriceScaleContextMenu();
          }
        }

        const valOpen = document.getElementById('valOpen');
        const valHigh = document.getElementById('valHigh');
        const valLow = document.getElementById('valLow');
        const valClose = document.getElementById('valClose');
        const valChange = document.getElementById('valChange');
        const valVolume = document.getElementById('valVolume');
        if (valOpen) valOpen.textContent = '—';
        if (valHigh) valHigh.textContent = '—';
        if (valLow) valLow.textContent = '—';
        if (valClose) valClose.textContent = '—';
        if (valChange) {
          valChange.textContent = '—';
          valChange.className = '';
        }
        if (valVolume) valVolume.textContent = '—';

        if (orderPanel && typeof orderPanel.setLoading === 'function') {
          orderPanel.setLoading(true);
        }
        if (store.quickTradeWidget && typeof store.quickTradeWidget.setLoading === 'function') {
          store.quickTradeWidget.setLoading(true);
        }
      }

      const loader = document.getElementById('chartDataLoader');
      if (loader && loader.style.display !== 'inline-flex') {
        loader.style.display = 'inline-flex';
        loaderShownTimestamp = Date.now();
      }
    } else {
      activeLoadingCount = Math.max(0, activeLoadingCount - 1);
      if (activeLoadingCount === 0) {
        const elapsed = Date.now() - loaderShownTimestamp;
        const remaining = Math.max(0, MIN_LOADER_DURATION - elapsed);

        if (hideLoaderTimeout) clearTimeout(hideLoaderTimeout);
        hideLoaderTimeout = setTimeout(() => {
          hideLoaderTimeout = null;
          hasFullResetInFlight = false;
          store.set('isSymbolLoading', false);

          const loader = document.getElementById('chartDataLoader');
          if (loader) {
            loader.style.display = 'none';
          }

          if (orderPanel && typeof orderPanel.setLoading === 'function') {
            orderPanel.setLoading(false);
          }
          if (store.quickTradeWidget && typeof store.quickTradeWidget.setLoading === 'function') {
            store.quickTradeWidget.setLoading(false);
          }
        }, remaining);
      }
    }
  }

  function setSymbolLoadingState(isLoading) {
    setChartLoadingState(isLoading, { fullReset: true });
  }

  // React to global loading requests from services and controllers
  eventBus.on('chart:loading', (isLoading, options) => {
    setChartLoadingState(isLoading, options);
  });

  async function loadCandles(targetBarTime = null, preserveReplay = false, options = {}) {
    const isOptionsObject = typeof options === 'object' && options !== null;
    const isSymbolChange = isOptionsObject ? !!options.isSymbolChange : !!options;
    const showLoading = isOptionsObject ? (options.showLoading !== false) : !!options;
    const fullReset = isOptionsObject ? (options.fullReset !== false) : !!options;

    if (showLoading) {
      setChartLoadingState(true, { fullReset });
    }

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

      // Robust fallback: if querying targetBarTime returned 0 candles (e.g. instrument did not exist at targetBarTime),
      // gracefully fallback to loading the available history instead of aborting and leaving the chart frozen!
      if (targetBarTime && (!data || !data.candles || data.candles.length === 0)) {
        console.warn(`[Pipeline] No candles found at target time ${targetBarTime} for ${currentSymbol}, falling back to latest history...`);
        data = await marketDataService.getCandles(currentSymbol, currentFigi, currentTimeframe, 1200);
        preserveReplay = false;
        targetBarTime = null;
      }

      if (data && data.candles && data.candles.length > 0) {
        if (data.type) {
          store.set('currentInstrumentType', data.type);
        }
        store.set('currentLotSize', data.lot || 1);
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
          if (isSymbolChange) {
            chartController.resetStateForNewInstrument(12, 7.5);
          } else if (store.chart) {
            store.chart.fitContent();
          }
        }

        if (currentSymbol && data.candles) {
          portfolioDataService.candlesBySymbol.set(currentSymbol, data.candles);
        }

        const latest = visibleBars[visibleBars.length - 1];
        if (latest) {
          portfolioDataService.updatePortfolio(latest.time);
          chartController.updateLegend(latest);
          orderPanel.updateQuickPrices(latest.close);
          if (isSymbolChange && orderPanel && typeof orderPanel.resetPricesForNewSymbol === 'function') {
            orderPanel.resetPricesForNewSymbol(latest.close);
          }
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
    } finally {
      if (showLoading) {
        setChartLoadingState(false);
      }
    }
  }

  // Event bus reactions
  eventBus.on('timeframe:change', async ({ newTf, prevTf }) => {
    // Update Slot 0 badge
    const badgeTf = document.getElementById('slotBadgeTf0');
    if (badgeTf) {
      const map = { '1m': '1м', '5m': '5м', '15m': '15м', '1h': '1ч', '4h': '4ч', '1d': '1Д', '1w': '1Н' };
      badgeTf.textContent = map[newTf?.toLowerCase()] || newTf;
    }

    // If active slot is a secondary slot (> 0), it updates its own data; do not reload primary chart
    if (store.multiChart && store.multiChart.activeSlotId > 0) {
      return;
    }

    const barInfo = chartController.getLastChartBarInfo();
    let targetSec = barInfo.time;
    if (targetSec && prevTf === '1d' && newTf !== '1d') {
      targetSec = targetSec + 86400 - 1;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const isHistorical = barInfo.isReplay || barInfo.isScrolled || (targetSec && (nowSec - targetSec > 86400 * 2));

    if (isHistorical && targetSec) {
      await loadCandles(targetSec, barInfo.isReplay, { showLoading: true, fullReset: true });
    } else {
      await loadCandles(null, false, { showLoading: true, fullReset: true });
    }
  });

  eventBus.on('symbol:change', async ({ prevSymbol, ticker } = {}) => {
    const badgeSym = document.getElementById('slotBadgeSymbol0');
    if (badgeSym && ticker) {
      badgeSym.textContent = ticker;
    }
    setChartLoadingState(true, { fullReset: true });
    try {
      if (prevSymbol && simulator && simulator.allCandles && simulator.allCandles.length > 0) {
        portfolioDataService.candlesBySymbol.set(prevSymbol, simulator.allCandles);
      }
      const isReplay = simulator && simulator.isReplayActive;
      let simTime = null;

      if (isReplay) {
        simulator.pause();
        const currentBar = simulator.getCurrentBar();
        if (currentBar && currentBar.time) {
          simTime = currentBar.time;
        }
      }

      if (simTime) {
        // Check if new instrument has historical boundaries and if simTime is before its creation
        const figi = store.get('currentFigi');
        const tf = store.get('currentTimeframe');
        const boundaries = await marketDataService.getBoundaries(ticker, figi, tf);
        if (boundaries && boundaries.ok && boundaries.earliestTimeSec && simTime < boundaries.earliestTimeSec) {
          showToast(`Инструмент ${ticker} торгуется с ${new Date(boundaries.earliestTimeSec * 1000).toLocaleDateString('ru-RU')}. Переход к началу истории.`, 'info');
          simTime = boundaries.earliestTimeSec;
        }

        // Replay is active: preserve simulation time across ticker switch!
        await loadCandles(simTime, true, { showLoading: true, fullReset: true, isSymbolChange: true });
        eventBus.emit('replay:scrubbed');
      } else {
        // Replay was inactive: load candles up to latest
        await loadCandles(null, false, { showLoading: true, fullReset: true, isSymbolChange: true });
      }
    } finally {
      setChartLoadingState(false);
    }
  });

  eventBus.on('settings:saved', async () => {
    await loadCandles();
  });

  // 7. Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;

    if (store.get('isSymbolLoading')) {
      if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'ArrowLeft' ||
          e.key === 'b' || e.key === 'B' || e.key === 'и' || e.key === 'И' ||
          e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') {
        e.preventDefault();
        showToast('Котировки инструмента загружаются, пожалуйста подождите...', 'warning');
        return;
      }
    }

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
      appStateMachine.handleEscape();
      drawingRail.resetToCursor();
      modals.closeAll();
      if (store.drawingSettingsModal) {
        store.drawingSettingsModal.close();
      }
      if (store.floatingDrawingToolbar) {
        store.floatingDrawingToolbar.closeAllPopups();
      }
      if (store.editOrderModal) {
        store.editOrderModal.close();
      }
      if (store.chartStyleModal) {
        store.chartStyleModal.close();
      }
      const datePickerModal = document.getElementById('datePickerModal');
      if (datePickerModal) datePickerModal.classList.remove('open');
      const startPointMenu = document.getElementById('startPointMenu');
      if (startPointMenu) startPointMenu.style.display = 'none';
    } else if (e.key === 'b' || e.key === 'B' || e.key === 'и' || e.key === 'И') {
      orderPanel.executeTrade('BUY');
    } else if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') {
      orderPanel.executeTrade('SELL');
    } else if (e.altKey && (e.code === 'KeyR' || e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К')) {
      e.preventDefault();
      if (chartController) {
        chartController.resetFullChartScale();
      }
    }
  });

  // 8. Expose for testing and external controllers
  window._app = {
    chart: store.chart,
    mainSeries: store.mainSeries,
    simulator,
    paperAccount,
    portfolioDataService,
    sessionService,
    cacheService,
    fsm: appStateMachine,
    store,
    watchlist,
    eventBus,
    components: {
      chartController,
      tradeLinesOverlay,
      tradeExecutionsOverlay,
      sessionBreaksOverlay,
      drawingRail,
      toolbar,
      orderPanel,
      watchlist,
      chartOrderMenu,
      bottomDock,
      replayBar,
      modals,
      drawingSettingsModal,
      floatingDrawingToolbar,
      editOrderModal,
      chartStyleModal,
      rightRail,
      zoomController,
      indicatorSettingsModal,
      historyStartMarker,
      multiChart
    },
    loadCandles,
    prefetchSubsequentBars,
    setSymbolLoadingState
  };

  // 9. Startup Initial Data Load & Session Restoration (IndexedDB with localStorage fallback)
  const savedSession = await sessionService.getSavedSession();
  let targetBarTime = null;
  let preserveReplay = true; // Primary mode: Replay is active by default

  if (savedSession) {
    if (savedSession.symbol) store.set('currentSymbol', savedSession.symbol);
    if (savedSession.timeframe) store.set('currentTimeframe', savedSession.timeframe);
    if (savedSession.chartType) store.set('currentChartType', savedSession.chartType);

    if (savedSession.replay) {
      targetBarTime = savedSession.replay.currentBarTime || null;
      // If user explicitly turned replay off in previous session, respect that
      if (savedSession.replay.isActive === false) {
        preserveReplay = false;
      }
    }
  }

  await loadCandles(targetBarTime, preserveReplay);

  if (savedSession) {
    await sessionService.restoreSession(savedSession);
    await portfolioDataService.preloadActiveSymbols(targetBarTime);
    showToast('Торговая сессия восстановлена', 'info');
  } else {
    // Fresh session: start in Replay mode by default with standard zoom
    simulator.enableReplay();
    eventBus.emit('chart:reset_state_preserving_zoom', 12);
  }
});

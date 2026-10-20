// OpenAlgo Trading Simulator — Main Application
// Full integration of OpenAlgo Charts engine, historical replay simulation,
// and T-Investments (T-Bank Invest API v2) market data.

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const chartEl = document.getElementById('chart');
  const symbolTrigger = document.getElementById('symbolTrigger');
  const symbolTickerText = document.getElementById('symbolTickerText');
  const symbolDropdown = document.getElementById('symbolDropdown');
  const symbolSearchInput = document.getElementById('symbolSearchInput');
  const symbolList = document.getElementById('symbolList');
  const timeframeButtons = document.querySelectorAll('.tf-btn');
  
  // Chart Type Elements
  const btnChartTypeTrigger = document.getElementById('btnChartTypeTrigger');
  const chartTypeDropdown = document.getElementById('chartTypeDropdown');
  const chartTypeIcon = document.getElementById('chartTypeIcon');
  const chartTypeText = document.getElementById('chartTypeText');
  const chartTypeItems = document.querySelectorAll('.chart-type-item');

  // Replay & Transport Elements
  const btnToggleReplay = document.getElementById('btnToggleReplay');
  const btnToggleReplayMenu = document.getElementById('btnToggleReplayMenu');
  const btnReplayText = document.getElementById('btnReplayText');
  const floatingReplayBar = document.getElementById('floatingReplayBar');
  const btnReplayPlay = document.getElementById('btnReplayPlay');
  const btnReplayStep = document.getElementById('btnReplayStep');
  const btnReplayStepBack = document.getElementById('btnReplayStepBack');
  const btnReplayStartPoint = document.getElementById('btnReplayStartPoint');
  const replaySpeedSelect = document.getElementById('replaySpeedSelect');
  const replayScrubSlider = document.getElementById('replayScrubSlider');
  const replayInfoText = document.getElementById('replayInfoText');
  const replayTimeText = document.getElementById('replayTimeText');
  const btnExitReplay = document.getElementById('btnExitReplay');

  // Start Point Menu Elements
  const startPointMenu = document.getElementById('startPointMenu');
  const optStartBar = document.getElementById('optStartBar');
  const optStartDate = document.getElementById('optStartDate');
  const optStartFirstDate = document.getElementById('optStartFirstDate');
  const optStartRandomBar = document.getElementById('optStartRandomBar');

  // Date Picker Modal Elements
  const datePickerModal = document.getElementById('datePickerModal');
  const btnCloseDatePicker = document.getElementById('btnCloseDatePicker');
  const btnCancelDatePicker = document.getElementById('btnCancelDatePicker');
  const btnApplyDatePicker = document.getElementById('btnApplyDatePicker');
  const inputJumpDate = document.getElementById('inputJumpDate');
  const inputJumpTime = document.getElementById('inputJumpTime');
  const datePickerRangeInfo = document.getElementById('datePickerRangeInfo');
  const btnQuickEarliest = document.getElementById('btnQuickEarliest');
  const btnQuickMonthAgo = document.getElementById('btnQuickMonthAgo');
  const btnQuickWeekAgo = document.getElementById('btnQuickWeekAgo');
  const btnQuickLatest = document.getElementById('btnQuickLatest');

  // Settings Elements
  const btnOpenSettings = document.getElementById('btnOpenSettings');
  const settingsModal = document.getElementById('settingsModal');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const btnCloseSettingsBottom = document.getElementById('btnCloseSettingsBottom');
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  const btnTestToken = document.getElementById('btnTestToken');
  const inputTinkoffToken = document.getElementById('inputTinkoffToken');
  const inputInitialBalance = document.getElementById('inputInitialBalance');
  const inputCommission = document.getElementById('inputCommission');
  const tokenTestResult = document.getElementById('tokenTestResult');
  const tokenBadge = document.getElementById('tokenBadge');
  const tokenStatusText = document.getElementById('tokenStatusText');

  // Indicators Elements
  const btnOpenIndicators = document.getElementById('btnOpenIndicators');
  const indicatorsModal = document.getElementById('indicatorsModal');
  const btnCloseIndicators = document.getElementById('btnCloseIndicators');
  const btnDoneIndicators = document.getElementById('btnDoneIndicators');
  const inputSearchIndicator = document.getElementById('inputSearchIndicator');
  const indicatorListContainer = document.getElementById('indicatorListContainer');
  const activeIndicatorCount = document.getElementById('activeIndicatorCount');

  // Left Drawing Rail Buttons
  const leftToolButtons = document.querySelectorAll('.left-tool-btn[data-tool]');
  const toolMagnet = document.getElementById('toolMagnet');
  const toolClearDrawings = document.getElementById('toolClearDrawings');
  const btnFullscreen = document.getElementById('btnFullscreen');

  // Header Quick Trade Buttons
  const btnQuickSell = document.getElementById('btnQuickSell');
  const btnQuickBuy = document.getElementById('btnQuickBuy');
  const quickSellPrice = document.getElementById('quickSellPrice');
  const quickBuyPrice = document.getElementById('quickBuyPrice');

  // Bottom Trading Dock Elements
  const bottomTabs = document.querySelectorAll('.bottom-tab');
  const positionsView = document.getElementById('positionsView');
  const ordersView = document.getElementById('ordersView');
  const tradesView = document.getElementById('tradesView');
  const analyticsView = document.getElementById('analyticsView');
  const badgePositions = document.getElementById('badgePositions');
  const badgeOrders = document.getElementById('badgeOrders');
  const badgeTrades = document.getElementById('badgeTrades');
  const btnCloseAllPositions = document.getElementById('btnCloseAllPositions');
  const btnCancelAllOrders = document.getElementById('btnCancelAllOrders');
  const btnExportCsv = document.getElementById('btnExportCsv');
  const btnResetAccount = document.getElementById('btnResetAccount');

  // Metrics Elements
  const metricBalance = document.getElementById('metricBalance');
  const metricEquity = document.getElementById('metricEquity');
  const metricPnL = document.getElementById('metricPnL');
  const metricWinrate = document.getElementById('metricWinrate');

  // Order Entry Elements
  const orderTypeBtns = document.querySelectorAll('.order-type-btn');
  const rowLimitPrice = document.getElementById('rowLimitPrice');
  const inputLimitPrice = document.getElementById('inputLimitPrice');
  const inputLots = document.getElementById('inputLots');
  const lotsInfoText = document.getElementById('lotsInfoText');
  const inputSL = document.getElementById('inputSL');
  const inputTP = document.getElementById('inputTP');
  const rrNotional = document.getElementById('rrNotional');
  const rrRisk = document.getElementById('rrRisk');
  const rrReward = document.getElementById('rrReward');
  const rrRatio = document.getElementById('rrRatio');
  const btnPanelBuy = document.getElementById('btnPanelBuy');
  const btnPanelSell = document.getElementById('btnPanelSell');

  // Tables Bodies
  const positionsTableBody = document.getElementById('positionsTableBody');
  const ordersTableBody = document.getElementById('ordersTableBody');
  const tradesTableBody = document.getElementById('tradesTableBody');

  // Analytics Stats Elements
  const statTotalTrades = document.getElementById('statTotalTrades');
  const statWinLossRatio = document.getElementById('statWinLossRatio');
  const statWinRate = document.getElementById('statWinRate');
  const statProfitFactor = document.getElementById('statProfitFactor');
  const statGrossProfitLoss = document.getElementById('statGrossProfitLoss');
  const statMaxDD = document.getElementById('statMaxDD');
  const statAvgWin = document.getElementById('statAvgWin');
  const statAvgLoss = document.getElementById('statAvgLoss');
  const statReturnPct = document.getElementById('statReturnPct');
  const statInitialCapital = document.getElementById('statInitialCapital');

  // Chart Legend Elements
  const legendSymbol = document.getElementById('legendSymbol');
  const legendTF = document.getElementById('legendTF');
  const valOpen = document.getElementById('valOpen');
  const valHigh = document.getElementById('valHigh');
  const valLow = document.getElementById('valLow');
  const valClose = document.getElementById('valClose');
  const valChange = document.getElementById('valChange');
  const valVolume = document.getElementById('valVolume');

  // On-Chart Order Elements (TradingView-style)
  const chartContainer = chartEl.parentElement;
  const priceAxisPlusBtn = document.getElementById('priceAxisPlusBtn');
  const chartOrderMenu = document.getElementById('chartOrderMenu');
  const btnMenuQtyDec = document.getElementById('btnMenuQtyDec');
  const inputMenuLots = document.getElementById('inputMenuLots');
  const btnMenuQtyInc = document.getElementById('btnMenuQtyInc');
  const menuLotSuffix = document.getElementById('menuLotSuffix');
  const menuOrderChips = document.querySelectorAll('.chart-order-chips .order-chip');
  const menuSharesInfo = document.getElementById('menuSharesInfo');
  const btnMenuActionPrimary = document.getElementById('btnMenuActionPrimary');
  const menuIconPrimary = document.getElementById('menuIconPrimary');
  const menuTextPrimary = document.getElementById('menuTextPrimary');
  const btnMenuActionSecondary = document.getElementById('btnMenuActionSecondary');
  const menuIconSecondary = document.getElementById('menuIconSecondary');
  const menuTextSecondary = document.getElementById('menuTextSecondary');
  const btnMenuActionCustom = document.getElementById('btnMenuActionCustom');

  // App State
  let currentSymbol = 'SBER';
  let currentFigi = 'BBG004730N88';
  let currentTimeframe = '1h';
  let currentLotSize = 10;
  let currentChartType = 'candlestick';
  let isSelectingJumpBar = false;
  let isMagnetActive = false;
  let selectedOrderType = 'MARKET'; // 'MARKET' | 'LIMIT' | 'STOP'

  // On-Chart Order Context State
  let menuTargetPrice = null;
  let menuLots = 1;
  let hoveredPrice = null;
  let hoveredY = null;
  let isMenuOpen = false;

  // Engines
  const simulator = new MarketSimulator();
  const paperAccount = new PaperTradingAccount(100000, 0.0005);

  // Active Indicators State Map: id -> IndicatorApi handle
  const activeIndicators = new Map();

  // --------------------------------------------------------------------------
  // Initialize OpenAlgo Charts
  // --------------------------------------------------------------------------
  let chart = null;
  let mainSeries = null;
  let drawingController = null;
  let tradeController = null;
  let markersLayer = null;

  try {
    const chartTheme = {
      ...OpenAlgoCharts.darkTheme,
      background: '#131722',
      grid: '#1e222d',
      axisText: '#787b86',
      axisLine: '#2a2e39',
      paneSeparator: '#2a2e39',
      crosshair: '#787b86',
      crosshairLabelBackground: '#2962ff',
      upColor: '#089981',
      downColor: '#f23645',
      wickUpColor: '#089981',
      wickDownColor: '#f23645',
      borderUpColor: '#089981',
      borderDownColor: '#f23645',
      lastPriceUp: '#089981',
      lastPriceDown: '#f23645',
      lastPriceText: '#ffffff',
      buy: '#089981',
      sell: '#f23645',
      profit: '#089981',
      loss: '#f23645'
    };

    chart = OpenAlgoCharts.createChart(chartEl, {
      theme: chartTheme,
      timezone: 'Europe/Moscow',
      watermark: false,
      branding: false,
      axisChrome: { sessionClock: true, barCountdown: false }
    });

    // Add primary candlestick series
    mainSeries = chart.addSeries('candlestick', {
      upColor: '#089981',
      downColor: '#f23645',
      wickUpColor: '#089981',
      wickDownColor: '#f23645',
      borderUpColor: '#089981',
      borderDownColor: '#f23645'
    });

    // Markers layer for trade entry/exit arrows
    if (mainSeries && typeof mainSeries.createMarkers === 'function') {
      try {
        markersLayer = mainSeries.createMarkers();
      } catch (err) {
        console.warn('Could not initialize markersLayer:', err);
      }
    }

    // Initialize OpenAlgo DrawingController
    if (OpenAlgoCharts.draw && OpenAlgoCharts.draw.DrawingController) {
      drawingController = new OpenAlgoCharts.draw.DrawingController(chart, {
        magnet: 'off'
      });
    }

    // Initialize OpenAlgo TradeController (order and position lines)
    if (OpenAlgoCharts.trade && OpenAlgoCharts.trade.TradeController) {
      tradeController = new OpenAlgoCharts.trade.TradeController(chart);
    }

    window._app = { chart, mainSeries, simulator, paperAccount, tradeController, openChartOrderMenu, getLastChartBarInfo, loadCandles, prefetchSubsequentBars: () => prefetchSubsequentBars() };

    // Chart crosshair move listener for OHLCV legend and Plus button
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time) {
        updateLegendToLatest();
      } else {
        const bar = simulator.allCandles.find(c => c.time === param.time);
        if (bar) {
          updateLegend(bar);
        }
      }

      // Track crosshair price & position price axis plus button
      if (param && param.point && chart) {
        const y = param.point.y;
        const price = typeof chart.coordinateToPrice === 'function' ? chart.coordinateToPrice(y) : null;
        if (price && price > 0) {
          hoveredPrice = price;
          hoveredY = y;
          if (priceAxisPlusBtn) {
            priceAxisPlusBtn.style.top = `${y - 11}px`;
            priceAxisPlusBtn.style.display = 'flex';
          }
        }
      }
    });

    // Also track mouse movement across chart container to ensure seamless plus button hover
    if (chartContainer) {
      chartContainer.addEventListener('mousemove', (e) => {
        const rect = chartContainer.getBoundingClientRect();
        const localY = e.clientY - rect.top;
        if (chart && localY >= 0 && localY <= rect.height) {
          const price = typeof chart.coordinateToPrice === 'function' ? chart.coordinateToPrice(localY) : null;
          if (price && price > 0) {
            hoveredPrice = price;
            hoveredY = localY;
            if (priceAxisPlusBtn) {
              priceAxisPlusBtn.style.top = `${localY - 11}px`;
              priceAxisPlusBtn.style.display = 'flex';
            }
          }
        }
      });

      chartContainer.addEventListener('mouseleave', (e) => {
        if (e.relatedTarget === priceAxisPlusBtn || (priceAxisPlusBtn && priceAxisPlusBtn.contains(e.relatedTarget))) {
          return;
        }
        if (!isMenuOpen && priceAxisPlusBtn) {
          priceAxisPlusBtn.style.display = 'none';
        }
      });
    }

    // Plus button click -> open chart order menu
    if (priceAxisPlusBtn) {
      priceAxisPlusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (hoveredPrice && chartContainer) {
          const containerRect = chartContainer.getBoundingClientRect();
          openChartOrderMenu(hoveredPrice, containerRect.width - 340, hoveredY - 30);
        }
      });
    }

    // Right-click on chart -> open chart order menu at cursor price
    chartEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (chartContainer && chart) {
        const containerRect = chartContainer.getBoundingClientRect();
        const localX = e.clientX - containerRect.left;
        const localY = e.clientY - containerRect.top;
        const price = typeof chart.coordinateToPrice === 'function' ? chart.coordinateToPrice(localY) : null;
        if (price && price > 0) {
          openChartOrderMenu(price, localX, localY);
        }
      }
    });

    // Universal handler to close a position by symbol or ID
    function handleClosePosition(symbolOrId, source = 'Вручную') {
      const pos = paperAccount.positions.find(p => p.id === symbolOrId || p.symbol === symbolOrId);
      if (!pos) {
        console.warn('Position not found to close:', symbolOrId);
        return false;
      }
      const bar = simulator.getCurrentBar();
      const price = bar ? bar.close : pos.currentPrice;
      const time = bar ? bar.time : null;
      const trade = paperAccount.closePosition(pos.id, price, time, source);
      if (trade) {
        showToast(`Позиция ${pos.symbol} (${pos.side === 'BUY' ? 'LONG' : 'SHORT'}) закрыта по ${price.toFixed(2)} ₽`, 'info');
        return true;
      }
      return false;
    }

    // Universal handler to cancel an order by ID
    function handleCancelOrder(orderId, source = 'Вручную') {
      // Check if it's an SL or TP bracket attached to a position
      if (orderId && (orderId.endsWith('_sl') || orderId.endsWith('_tp'))) {
        const posId = orderId.replace(/_sl$|_tp$/, '');
        const pos = paperAccount.positions.find(p => p.id === posId || p.symbol === posId);
        if (pos) {
          if (orderId.endsWith('_sl')) {
            pos.sl = null;
            showToast(`Стоп-лосс для ${pos.symbol} отменен`, 'info');
          } else {
            pos.tp = null;
            showToast(`Тейк-профит для ${pos.symbol} отменен`, 'info');
          }
          paperAccount.notifyUpdate();
          return true;
        }
      }

      const order = paperAccount.orders.find(o => o.id === orderId);
      const ok = paperAccount.cancelOrder(orderId);
      if (ok) {
        const sideText = order ? (order.side === 'BUY' ? 'на покупку' : 'на продажу') : '';
        showToast(`Заявка ${sideText} отменена`, 'info');
        return true;
      }
      return false;
    }

    function handleChartClickAction(param) {
      if (!param) return false;

      let id = '';
      if (typeof param === 'string') {
        id = param;
      } else if (typeof param === 'object') {
        id = param.externalId || param.id || '';
      }

      if (!id || typeof id !== 'string') return false;

      // 1. Order cancel close button (e.g. 'order:ord_123::close' or 'ord:ord_123::close')
      if (id.endsWith('::close') && (id.startsWith('order:') || id.startsWith('ord:'))) {
        const cleanId = id.split('::')[0].replace(/^order:|^ord:/, '');
        return handleCancelOrder(cleanId, 'С графика');
      }

      // 2. Position close button (e.g. 'position:SBER::close' or 'pos:SBER::close')
      if (id.endsWith('::close') && (id.startsWith('position:') || id.startsWith('pos:'))) {
        const symbolOrId = id.split('::')[0].replace(/^position:|^pos:/, '');
        return handleClosePosition(symbolOrId, 'С графика');
      }

      // 3. Generic ::close
      if (id.endsWith('::close')) {
        const raw = id.split('::')[0];
        return handleClosePosition(raw, 'С графика') || handleCancelOrder(raw, 'С графика');
      }

      return false;
    }

    if (window._app) {
      Object.assign(window._app, { handleClosePosition, handleCancelOrder, handleChartClickAction });
    }

    // Chart click listener (for Bar Picking in Replay + On-chart interactive buttons)
    chart.subscribeClick((param) => {
      if (isSelectingJumpBar && param && param.time) {
        isSelectingJumpBar = false;
        chartEl.style.cursor = 'default';
        btnReplayStartPoint.classList.remove('active');

        simulator.jumpToBar(param.time);
        const remaining = simulator.allCandles.length - simulator.currentIndex;
        if (remaining <= simulator.prefetchThreshold) {
          prefetchSubsequentBars();
        }
        showToast('Точка симуляции выбрана! Запускайте воспроизведение или тестируйте сделки.', 'success');
        return;
      }

      // Handle click on on-chart order/position close buttons
      if (handleChartClickAction(param)) {
        return;
      }
    });

    // Handle on-chart order and position interaction events
    if (typeof chart.on === 'function') {
      chart.on('click', (e) => {
        handleChartClickAction(e);
      });

      chart.on('trading:order_cancel', (e) => {
        if (e && e.orderId) {
          handleCancelOrder(e.orderId, 'С графика');
        }
      });

      chart.on('trading:order_modify', (e) => {
        if (e && e.orderId && e.price) {
          paperAccount.modifyOrder(e.orderId, e.price);
          showToast(`Заявка изменена: цена ${e.price.toFixed(2)} ₽`, 'info');
        }
      });

      chart.on('trading:position_close', (e) => {
        if (e && e.positionId) {
          handleClosePosition(e.positionId, 'С графика');
        }
      });
    }

    // Infinite History Loader (when scrolling/panning left into past history)
    chart.setHistoryLoader(async () => {
      try {
        const oldest = simulator.allCandles[0]?.time;
        if (!oldest) {
          chart.historyLoadComplete();
          return;
        }

        const data = await API.getCandles(currentSymbol, currentFigi, currentTimeframe, 500, oldest - 1);
        if (data && data.candles && data.candles.length > 0) {
          const before = chart.getVisibleLogicalRange();
          const inserted = simulator.prependHistory(data.candles);

          if (inserted > 0 && mainSeries) {
            mainSeries.setData(simulator.getVisibleCandles());
            if (before) {
              chart.setVisibleLogicalRange({
                from: before.from + inserted,
                to: before.to + inserted
              });
            }
          }
        }
      } catch (err) {
        console.error('History loader error:', err);
      } finally {
        chart.historyLoadComplete();
      }
    });

    // Auto-resize on window resize
    window.addEventListener('resize', () => {
      if (chart && chartEl) {
        const w = chartEl.clientWidth;
        const h = chartEl.clientHeight;
        if (w > 0 && h > 0) {
          chart.applySize(w, h);
        }
      }
    });

  } catch (err) {
    console.error('Failed to initialize OpenAlgo Charts:', err);
    chartEl.innerHTML = `<div style="padding: 20px; color: #f23645;">Ошибка инициализации движка OpenAlgo Charts: ${err.message}</div>`;
  }

  // --------------------------------------------------------------------------
  // Simulator Callbacks (Bar-by-Bar Historical Execution)
  // --------------------------------------------------------------------------
  simulator.onBarAdvance = (candle, index, total, isBackward = false) => {
    if (!candle) return;

    // 1. Update chart series with current visible slice
    const visible = simulator.getVisibleCandles();
    if (mainSeries) {
      mainSeries.setData(visible);
    }

    // 2. Process historical orders and SL/TP triggers
    if (!isBackward) {
      const events = paperAccount.onCandle(candle, currentSymbol);
      if (events && events.length > 0) {
        events.forEach(ev => showToast(ev.message, ev.type === 'ORDER_FILLED' ? 'info' : 'success'));
      }
    } else {
      // Step backward: simply re-evaluate unrealized PnL at this bar
      paperAccount.onCandle(candle, currentSymbol);
    }

    // 3. Update legend and prices
    updateLegend(candle);
    updateQuickPrices(candle.close);

    // 4. Update on-chart primitives (lines, markers, P&L)
    syncTradeOverlays(candle.close);

    // 5. Update UI progress & timestamp
    updateReplayProgress(index, total, candle.time);
  };

  simulator.onStateChange = (state) => {
    // Sync buttons & UI state
    btnReplayPlay.textContent = state.isPlaying ? '⏸' : '▶';
    btnReplayPlay.title = state.isPlaying ? 'Пауза (Пробел)' : 'Старт (Пробел)';

    if (state.isReplayActive) {
      floatingReplayBar.style.display = 'flex';
      btnToggleReplay.classList.add('active');
      btnReplayText.textContent = 'Симулятор: Вкл';
    } else {
      floatingReplayBar.style.display = 'none';
      btnToggleReplay.classList.remove('active');
      btnReplayText.textContent = 'Симулятор (История)';
    }

    const currentBar = simulator.getCurrentBar();
    updateReplayProgress(state.currentIndex, state.totalBars, currentBar ? currentBar.time : null);
  };

  // --------------------------------------------------------------------------
  // Subsequent Historical Bars Prefetcher (Seamless Background Loader)
  // --------------------------------------------------------------------------
  let isPrefetchingFuture = false;
  let prefetchPromise = null;

  async function prefetchSubsequentBars() {
    if (isPrefetchingFuture) return prefetchPromise;
    if (!simulator.isReplayActive || !simulator.canLoadMoreBars) return null;

    const latestBar = simulator.allCandles[simulator.allCandles.length - 1];
    if (!latestBar) return null;

    const latestTime = latestBar.time;
    const nowSec = Math.floor(Date.now() / 1000);
    const step = timeframeToSeconds(currentTimeframe);

    // If latest loaded bar is already within 1-2 bars of live now, we reached real-time end of exchange data
    if (latestTime >= nowSec - Math.max(step * 2, 300)) {
      simulator.canLoadMoreBars = false;
      return null;
    }

    isPrefetchingFuture = true;
    const batchCount = 400; // Load 400 bars ahead
    const toSec = Math.min(nowSec, latestTime + batchCount * step);
    const fromSec = latestTime + 1;

    prefetchPromise = (async () => {
      try {
        const data = await API.getCandles(currentSymbol, currentFigi, currentTimeframe, batchCount, toSec, fromSec);
        if (data && data.candles && data.candles.length > 0) {
          const added = simulator.appendHistory(data.candles);
          if (added === 0) {
            // No new bars strictly beyond latestTime
            simulator.canLoadMoreBars = false;
          }
          return added;
        } else {
          simulator.canLoadMoreBars = false;
          return 0;
        }
      } catch (err) {
        console.warn('[Prefetch] Error loading subsequent bars:', err);
        return 0;
      } finally {
        isPrefetchingFuture = false;
        prefetchPromise = null;
      }
    })();

    return prefetchPromise;
  }

  simulator.onNeedMoreBars = async (remaining) => {
    await prefetchSubsequentBars();
  };

  // Sync on-chart trade lines and markers
  function syncTradeOverlays(currentPrice) {
    if (!tradeController || !paperAccount) return;

    // Update OpenAlgo TradeController with working orders & positions
    const tradeState = paperAccount.getOpenAlgoTradeState(currentSymbol);
    tradeController.reconcile(tradeState.orders, tradeState.positions);

    if (currentPrice) {
      tradeController.onLtp(currentSymbol, currentPrice);
    }

    // Update trade markers on chart
    if (markersLayer) {
      const markers = [];
      paperAccount.tradeHistory.forEach(t => {
        if (t.symbol === currentSymbol) {
          // Entry marker
          markers.push({
            time: t.openTime,
            position: t.side === 'BUY' ? 'belowBar' : 'aboveBar',
            color: t.side === 'BUY' ? '#089981' : '#f23645',
            shape: t.side === 'BUY' ? 'arrowUp' : 'arrowDown',
            text: `${t.side === 'BUY' ? 'BUY' : 'SELL'} ${t.lots}л @ ${t.entryPrice.toFixed(2)}`
          });
          // Exit marker
          markers.push({
            time: t.closeTime,
            position: t.side === 'BUY' ? 'aboveBar' : 'belowBar',
            color: t.pnl >= 0 ? '#089981' : '#f23645',
            shape: 'circle',
            text: `EXIT (${t.pnl >= 0 ? '+' : ''}${t.pnl} ₽)`
          });
        }
      });

      // Active position markers
      paperAccount.positions.forEach(p => {
        if (p.symbol === currentSymbol) {
          markers.push({
            time: p.openTime,
            position: p.side === 'BUY' ? 'belowBar' : 'aboveBar',
            color: p.side === 'BUY' ? '#089981' : '#f23645',
            shape: p.side === 'BUY' ? 'arrowUp' : 'arrowDown',
            text: `OPEN ${p.side === 'BUY' ? 'LONG' : 'SHORT'} ${p.lots}л @ ${p.entryPrice.toFixed(2)}`
          });
        }
      });

      // Sort markers by time
      markers.sort((a, b) => a.time - b.time);
      try {
        markersLayer.setMarkers(markers);
      } catch (err) {
        // Silent catch if timestamp is outside domain
      }
    }
  }

  // --------------------------------------------------------------------------
  // Paper Trading Account Listener (Updates UI Tables & Stats)
  // --------------------------------------------------------------------------
  paperAccount.onAccountUpdate = (metrics) => {
    // 1. Update Metrics Bar
    metricBalance.textContent = formatMoney(metrics.balance);
    metricEquity.textContent = formatMoney(metrics.equity);

    metricPnL.textContent = `${metrics.unrealizedPnL >= 0 ? '+' : ''}${formatMoney(metrics.unrealizedPnL)}`;
    metricPnL.className = `metric-value ${metrics.unrealizedPnL >= 0 ? 'positive' : 'negative'}`;

    metricWinrate.textContent = `${metrics.winRate}% (${metrics.winningTrades}/${metrics.totalTrades})`;

    // 2. Update Badges
    badgePositions.textContent = metrics.openPositionsCount;
    badgeOrders.textContent = metrics.workingOrdersCount;
    badgeTrades.textContent = metrics.totalTrades;

    // 3. Render Positions Table
    renderPositionsTable();

    // 4. Render Orders Table
    renderOrdersTable();

    // 5. Render Trade History Table
    renderTradesTable();

    // 6. Render Analytics
    renderAnalytics(metrics);

    // 7. Update on-chart primitives
    const currentBar = simulator.getCurrentBar();
    if (currentBar) {
      syncTradeOverlays(currentBar.close);
    }
  };

  // Render Positions Table
  function renderPositionsTable() {
    if (paperAccount.positions.length === 0) {
      positionsTableBody.innerHTML = '<tr class="empty-row"><td colspan="11">Нет открытых позиций</td></tr>';
      return;
    }

    positionsTableBody.innerHTML = paperAccount.positions.map(pos => {
      const isLong = pos.side === 'BUY';
      const pnlClass = pos.unrealizedPnL >= 0 ? 'text-positive' : 'text-negative';
      return `
        <tr>
          <td><strong>${pos.symbol}</strong></td>
          <td><span class="badge-side ${isLong ? 'long' : 'short'}">${isLong ? 'LONG' : 'SHORT'}</span></td>
          <td>${pos.lots}</td>
          <td>${pos.qty}</td>
          <td>${pos.entryPrice.toFixed(2)} ₽</td>
          <td>${pos.currentPrice.toFixed(2)} ₽</td>
          <td>${pos.sl ? pos.sl.toFixed(2) + ' ₽' : '—'}</td>
          <td>${pos.tp ? pos.tp.toFixed(2) + ' ₽' : '—'}</td>
          <td class="${pnlClass}"><strong>${pos.unrealizedPnL >= 0 ? '+' : ''}${pos.unrealizedPnL.toFixed(2)} ₽</strong></td>
          <td class="${pnlClass}">${pos.unrealizedPnLPercent >= 0 ? '+' : ''}${pos.unrealizedPnLPercent.toFixed(2)}%</td>
          <td>
            <div style="display: flex; gap: 4px;">
              <button class="table-action-btn btn-close-pos" data-close-pos="${pos.id}">✕ Закрыть</button>
              <button class="table-action-btn btn-reverse-pos" data-reverse-pos="${pos.id}">⇄ Перевернуть</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach row action listeners
    positionsTableBody.querySelectorAll('[data-close-pos]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-close-pos');
        handleClosePosition(id, 'Вручную');
      };
    });

    positionsTableBody.querySelectorAll('[data-reverse-pos]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-reverse-pos');
        const pos = paperAccount.positions.find(p => p.id === id || p.symbol === id);
        if (pos) {
          const bar = simulator.getCurrentBar();
          paperAccount.reversePosition(pos.id, bar ? bar.close : pos.currentPrice, bar ? bar.time : null);
          showToast(`Позиция ${pos.symbol} перевернута!`, 'info');
        }
      };
    });
  }

  // Render Orders Table
  function renderOrdersTable() {
    if (paperAccount.orders.length === 0) {
      ordersTableBody.innerHTML = '<tr class="empty-row"><td colspan="9">Нет активных заявок</td></tr>';
      return;
    }

    ordersTableBody.innerHTML = paperAccount.orders.map(ord => {
      const isLong = ord.side === 'BUY';
      return `
        <tr>
          <td><span style="font-family: monospace; font-size: 11px;">${ord.id.slice(-6)}</span></td>
          <td><strong>${ord.symbol}</strong></td>
          <td><span style="font-weight: 600;">${ord.type}</span></td>
          <td><span class="badge-side ${isLong ? 'long' : 'short'}">${isLong ? 'BUY' : 'SELL'}</span></td>
          <td>${ord.lots} (${ord.qty} шт.)</td>
          <td><strong>${ord.price.toFixed(2)} ₽</strong></td>
          <td>SL: ${ord.sl || '—'} / TP: ${ord.tp || '—'}</td>
          <td style="font-size: 11px; color: var(--tv-text-muted);">${formatTimestamp(ord.createdTime)}</td>
          <td>
            <button class="table-action-btn" data-cancel-order="${ord.id}" style="color: #f23645;">✕ Отменить</button>
          </td>
        </tr>
      `;
    }).join('');

    ordersTableBody.querySelectorAll('[data-cancel-order]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-cancel-order');
        handleCancelOrder(id, 'Вручную');
      };
    });
  }

  // Event delegation on table bodies as secondary safety layer
  if (positionsTableBody) {
    positionsTableBody.addEventListener('click', (e) => {
      const closeBtn = e.target.closest('[data-close-pos]');
      if (closeBtn) {
        e.stopPropagation();
        const id = closeBtn.getAttribute('data-close-pos');
        handleClosePosition(id, 'Вручную');
        return;
      }
      const revBtn = e.target.closest('[data-reverse-pos]');
      if (revBtn) {
        e.stopPropagation();
        const id = revBtn.getAttribute('data-reverse-pos');
        const pos = paperAccount.positions.find(p => p.id === id || p.symbol === id);
        if (pos) {
          const bar = simulator.getCurrentBar();
          paperAccount.reversePosition(pos.id, bar ? bar.close : pos.currentPrice, bar ? bar.time : null);
          showToast(`Позиция ${pos.symbol} перевернута!`, 'info');
        }
        return;
      }
    });
  }

  if (ordersTableBody) {
    ordersTableBody.addEventListener('click', (e) => {
      const cancelBtn = e.target.closest('[data-cancel-order]');
      if (cancelBtn) {
        e.stopPropagation();
        const id = cancelBtn.getAttribute('data-cancel-order');
        handleCancelOrder(id, 'Вручную');
        return;
      }
    });
  }

  // Render Trade History Table
  function renderTradesTable() {
    if (paperAccount.tradeHistory.length === 0) {
      tradesTableBody.innerHTML = '<tr class="empty-row"><td colspan="11">История сделок пуста</td></tr>';
      return;
    }

    tradesTableBody.innerHTML = paperAccount.tradeHistory.map(tr => {
      const isLong = tr.side === 'BUY';
      const pnlClass = tr.pnl >= 0 ? 'text-positive' : 'text-negative';
      return `
        <tr>
          <td><strong>${tr.symbol}</strong></td>
          <td><span class="badge-side ${isLong ? 'long' : 'short'}">${isLong ? 'LONG' : 'SHORT'}</span></td>
          <td>${tr.lots} (${tr.qty} шт.)</td>
          <td>${tr.entryPrice.toFixed(2)} ₽</td>
          <td>${tr.exitPrice.toFixed(2)} ₽</td>
          <td class="${pnlClass}"><strong>${tr.pnl >= 0 ? '+' : ''}${tr.pnl.toFixed(2)} ₽</strong></td>
          <td class="${pnlClass}">${tr.pnlPercent >= 0 ? '+' : ''}${tr.pnlPercent.toFixed(2)}%</td>
          <td><span style="font-size: 11px; font-weight: 600;">${tr.reason}</span></td>
          <td style="font-size: 11px; color: var(--tv-text-muted);">${tr.totalCommission} ₽</td>
          <td style="font-size: 11px; color: var(--tv-text-muted);">${formatTimestamp(tr.openTime)}</td>
          <td style="font-size: 11px; color: var(--tv-text-muted);">${formatTimestamp(tr.closeTime)}</td>
        </tr>
      `;
    }).join('');
  }

  // Render Performance Analytics
  function renderAnalytics(m) {
    statTotalTrades.textContent = m.totalTrades;
    statWinLossRatio.textContent = `${m.winningTrades} прибыльных / ${m.losingTrades} убыточных`;
    statWinRate.textContent = `${m.winRate}%`;
    statProfitFactor.textContent = m.profitFactor.toFixed(2);
    statGrossProfitLoss.textContent = `Прибыль: +${m.grossProfit.toFixed(2)} ₽ / Убыток: -${m.grossLoss.toFixed(2)} ₽`;
    statMaxDD.textContent = `-${m.maxDrawdownRub.toFixed(2)} ₽ (-${m.maxDrawdownPct}%)`;
    statAvgWin.textContent = `+${m.avgWin.toFixed(2)} ₽`;
    statAvgLoss.textContent = `-${m.avgLoss.toFixed(2)} ₽`;
    statReturnPct.textContent = `${m.returnPct >= 0 ? '+' : ''}${m.returnPct.toFixed(2)}%`;
    statInitialCapital.textContent = `Стартовый капитал: ${formatMoney(m.initialBalance)}`;
  }

  // Helper: Get information about the last bar currently visible on the chart
  function getLastChartBarInfo() {
    // 1. If Replay is currently active:
    if (simulator.isReplayActive) {
      const curBar = simulator.getCurrentBar();
      if (curBar && curBar.time) {
        return {
          time: curBar.time,
          isReplay: true,
          isScrolled: false
        };
      }
    }

    // 2. Visible bars currently loaded
    const visibleBars = simulator.getVisibleCandles();
    if (visibleBars && visibleBars.length > 0) {
      const logicalRange = chart ? chart.getVisibleLogicalRange() : null;
      // If user scrolled back into history:
      if (logicalRange && typeof logicalRange.to === 'number' && logicalRange.to < visibleBars.length - 2) {
        const idx = Math.min(visibleBars.length - 1, Math.max(0, Math.floor(logicalRange.to)));
        return {
          time: visibleBars[idx].time,
          isReplay: false,
          isScrolled: true
        };
      }

      // Latest loaded bar:
      const lastBar = visibleBars[visibleBars.length - 1];
      return {
        time: lastBar.time,
        isReplay: false,
        isScrolled: false
      };
    }

    return { time: null, isReplay: false, isScrolled: false };
  }

  // --------------------------------------------------------------------------
  // Data Loading & Candle Pipeline (T-Investments / Demo Fallback)
  // --------------------------------------------------------------------------
  async function loadCandles(targetBarTime = null, preserveReplay = false) {
    legendSymbol.textContent = currentSymbol;
    legendTF.textContent = currentTimeframe.toUpperCase();

    try {
      let data = null;
      const step = timeframeToSeconds(currentTimeframe);
      const nowSec = Math.floor(Date.now() / 1000);

      if (targetBarTime) {
        if (preserveReplay) {
          // Provide forward window of 350 bars after targetBarTime so replay can advance forward!
          const forwardSec = Math.max(350 * step, 7 * 86400);
          const toSec = Math.min(nowSec, targetBarTime + forwardSec);
          data = await API.getCandles(currentSymbol, currentFigi, currentTimeframe, 1200, toSec);
        } else {
          // Exactly up to targetBarTime
          data = await API.getCandles(currentSymbol, currentFigi, currentTimeframe, 1200, targetBarTime);
        }
      } else {
        // Default latest live candles
        data = await API.getCandles(currentSymbol, currentFigi, currentTimeframe, 1200);
      }

      if (data && data.candles && data.candles.length > 0) {
        currentLotSize = data.lot || 10;
        updateLotsDisplay();

        // Update token badge
        if (data.source === 'tinkoff') {
          tokenBadge.className = 'token-badge active';
          tokenStatusText.textContent = 'Т-Инвестиции онлайн';
        } else {
          tokenBadge.className = 'token-badge demo';
          tokenStatusText.textContent = 'Демо-симулятор';
        }

        // Load into simulator engine
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

        // Update chart series
        if (mainSeries) {
          mainSeries.setData(visibleBars);
          chart.fitContent();
        }

        // Update legend
        const latest = visibleBars[visibleBars.length - 1];
        if (latest) {
          updateLegend(latest);
          updateQuickPrices(latest.close);
        }

        // Sync overlays
        syncTradeOverlays(latest ? latest.close : 0);

      } else {
        showToast('Не удалось загрузить данные свечей', 'error');
      }
    } catch (err) {
      console.error('Error in loadCandles:', err);
      showToast('Ошибка загрузки данных котировок', 'error');
    }
  }

  // --------------------------------------------------------------------------
  // Technical Indicators Setup (OpenAlgo 112 Indicators)
  // --------------------------------------------------------------------------
  function initIndicatorsModal() {
    if (!OpenAlgoCharts.registeredIndicators) return;

    const indicators = OpenAlgoCharts.registeredIndicators();
    renderIndicatorList(indicators);

    inputSearchIndicator.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = indicators.filter(ind =>
        ind.id.toLowerCase().includes(q) ||
        (ind.name && ind.name.toLowerCase().includes(q)) ||
        (ind.category && ind.category.toLowerCase().includes(q))
      );
      renderIndicatorList(filtered);
    });
  }

  function renderIndicatorList(list) {
    indicatorListContainer.innerHTML = list.map(ind => {
      const isActive = activeIndicators.has(ind.id);
      return `
        <div class="indicator-item ${isActive ? 'active' : ''}" data-ind-id="${ind.id}">
          <div class="indicator-info">
            <span class="indicator-name">${ind.name || ind.id.toUpperCase()}</span>
            <span class="indicator-desc">${ind.category || 'Технический анализ'} (${ind.placement === 'pane' ? 'отдельное окно' : 'поверх цены'})</span>
          </div>
          <input type="checkbox" class="indicator-toggle" ${isActive ? 'checked' : ''}>
        </div>
      `;
    }).join('');

    // Toggle listener
    indicatorListContainer.querySelectorAll('.indicator-item').forEach(item => {
      item.onclick = (e) => {
        const id = item.getAttribute('data-ind-id');
        const checkbox = item.querySelector('.indicator-toggle');
        
        // Prevent double toggle if checkbox clicked directly
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
        }

        if (checkbox.checked) {
          try {
            const handle = chart.addIndicator(id);
            activeIndicators.set(id, handle);
            item.classList.add('active');
            showToast(`Индикатор ${id.toUpperCase()} добавлен`, 'info');
          } catch (err) {
            console.error('Error adding indicator:', err);
            checkbox.checked = false;
            showToast(`Ошибка добавления индикатора: ${err.message}`, 'error');
          }
        } else {
          try {
            const handle = activeIndicators.get(id);
            if (handle) {
              chart.removeIndicator(handle);
              activeIndicators.delete(id);
              item.classList.remove('active');
              showToast(`Индикатор ${id.toUpperCase()} удален`, 'info');
            }
          } catch (err) {
            console.error('Error removing indicator:', err);
          }
        }

        updateIndicatorBadge();
      };
    });
  }

  function updateIndicatorBadge() {
    const count = activeIndicators.size;
    if (count > 0) {
      activeIndicatorCount.textContent = count;
      activeIndicatorCount.style.display = 'inline-block';
    } else {
      activeIndicatorCount.style.display = 'none';
    }
  }

  // --------------------------------------------------------------------------
  // Drawing Tools Setup (OpenAlgo 87 Drawing Tools)
  // --------------------------------------------------------------------------
  function initDrawingTools() {
    leftToolButtons.forEach(btn => {
      btn.onclick = () => {
        const tool = btn.getAttribute('data-tool');

        leftToolButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (!drawingController) return;

        if (tool === 'cursor') {
          drawingController.setTool(null);
          chartEl.style.cursor = 'default';
        } else {
          drawingController.setTool(tool);
          chartEl.style.cursor = 'crosshair';
        }
      };
    });

    // Magnet Mode
    if (toolMagnet) {
      toolMagnet.onclick = () => {
        isMagnetActive = !isMagnetActive;
        toolMagnet.classList.toggle('active', isMagnetActive);
        if (drawingController) {
          drawingController.setOptions({ magnet: isMagnetActive ? 'weak' : 'off' });
        }
        showToast(`Магнит ${isMagnetActive ? 'включен' : 'выключен'}`, 'info');
      };
    }

    // Clear drawings
    if (toolClearDrawings) {
      toolClearDrawings.onclick = () => {
        if (drawingController) {
          const allDrawings = drawingController.drawings();
          if (allDrawings && allDrawings.length > 0) {
            drawingController.removeMany(allDrawings.map(d => d.id));
            showToast('Все графические элементы очищены', 'info');
          }
        }
      };
    }
  }

  // --------------------------------------------------------------------------
  // Replay & Historical Navigation Handlers
  // --------------------------------------------------------------------------
  btnToggleReplay.onclick = () => {
    if (simulator.isReplayActive) {
      simulator.disableReplay();
      if (mainSeries) mainSeries.setData(simulator.allCandles);
      chart.fitContent();
    } else {
      simulator.enableReplay();
    }
  };

  btnToggleReplayMenu.onclick = (e) => {
    e.stopPropagation();
    const rect = btnToggleReplayMenu.getBoundingClientRect();
    startPointMenu.style.top = `${rect.bottom + 6}px`;
    startPointMenu.style.left = `${rect.left - 100}px`;
    startPointMenu.style.display = startPointMenu.style.display === 'none' ? 'block' : 'none';
  };

  btnReplayStartPoint.onclick = (e) => {
    e.stopPropagation();
    const rect = btnReplayStartPoint.getBoundingClientRect();
    startPointMenu.style.top = `${rect.bottom + 6}px`;
    startPointMenu.style.left = `${rect.left}px`;
    startPointMenu.style.display = startPointMenu.style.display === 'none' ? 'block' : 'none';
  };

  // Option 1: Pick bar on chart
  optStartBar.onclick = () => {
    startPointMenu.style.display = 'none';
    isSelectingJumpBar = true;
    chartEl.style.cursor = 'crosshair';
    btnReplayStartPoint.classList.add('active');
    showToast('Кликните на любую свечу на графике, чтобы начать симуляцию с этого момента', 'info');
  };

  // Option 2: Date Picker Modal
  optStartDate.onclick = () => {
    startPointMenu.style.display = 'none';
    openDatePickerModal();
  };

  // Option 3: First Available Date
  optStartFirstDate.onclick = () => {
    startPointMenu.style.display = 'none';
    simulator.jumpToFirstBar();
    showToast('Симуляция начата с первой доступной даты истории', 'success');
  };

  // Option 4: Random Bar
  optStartRandomBar.onclick = () => {
    startPointMenu.style.display = 'none';
    simulator.jumpToRandomBar();
    showToast('Выбран случайный момент истории для слепого теста стратегии!', 'success');
  };

  // Transport Buttons
  btnReplayPlay.onclick = () => simulator.togglePlay();
  btnReplayStep.onclick = () => simulator.stepForward();
  btnReplayStepBack.onclick = () => simulator.stepBackward();
  btnExitReplay.onclick = () => {
    simulator.disableReplay();
    if (mainSeries) mainSeries.setData(simulator.allCandles);
    chart.fitContent();
  };

  replaySpeedSelect.onchange = (e) => {
    simulator.setSpeed(Number(e.target.value));
  };

  replayScrubSlider.oninput = (e) => {
    const val = Number(e.target.value);
    const targetIdx = Math.floor((val / 100) * simulator.allCandles.length);
    simulator.jumpToBar(targetIdx);
    const remaining = simulator.allCandles.length - simulator.currentIndex;
    if (remaining <= simulator.prefetchThreshold) {
      prefetchSubsequentBars();
    }
  };

  // --------------------------------------------------------------------------
  // Date Picker Modal Logic
  // --------------------------------------------------------------------------
  function timeframeToSeconds(tf) {
    switch ((tf || '').toLowerCase()) {
      case '1m': return 60;
      case '5m': return 300;
      case '15m': return 900;
      case '1h': return 3600;
      case '4h': return 14400;
      case '1d': return 86400;
      case '1w': return 604800;
      default: return 3600;
    }
  }

  function openDatePickerModal() {
    const earliest = simulator.getEarliestTime();
    const latest = simulator.getLatestTime();

    if (earliest && latest) {
      datePickerRangeInfo.innerHTML = `Загружено: <b>${formatTimestamp(earliest)}</b> — <b>${formatTimestamp(latest)}</b><br><span style="color: var(--tv-text-muted); font-size: 11px;">(Любая выбранная дата автоматически подгрузит историю с биржи)</span>`;
      const currentBar = simulator.getCurrentBar();
      const refTime = currentBar ? currentBar.time : latest;
      const d = new Date(refTime * 1000);
      inputJumpDate.value = d.toISOString().split('T')[0];
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      inputJumpTime.value = `${hh}:${mm}`;
    }

    datePickerModal.classList.add('open');
  }

  btnCloseDatePicker.onclick = () => datePickerModal.classList.remove('open');
  btnCancelDatePicker.onclick = () => datePickerModal.classList.remove('open');

  btnApplyDatePicker.onclick = async () => {
    const dateStr = inputJumpDate.value;
    const timeStr = inputJumpTime.value || '10:00';

    if (!dateStr) {
      showToast('Пожалуйста, выберите дату', 'error');
      return;
    }

    const [hours, minutes] = timeStr.split(':');
    const targetDate = new Date(dateStr);
    targetDate.setHours(Number(hours) || 10, Number(minutes) || 0, 0, 0);

    const targetSec = Math.floor(targetDate.getTime() / 1000);
    datePickerModal.classList.remove('open');

    // 1. If target is within currently loaded candles:
    const earliest = simulator.getEarliestTime();
    const latest = simulator.getLatestTime();

    if (earliest && latest && targetSec >= earliest && targetSec <= latest) {
      const res = simulator.jumpToBar(targetSec);
      if (res) {
        if (mainSeries) mainSeries.setData(simulator.getVisibleCandles());
        chart.fitContent();
        const remaining = simulator.allCandles.length - simulator.currentIndex;
        if (remaining <= simulator.prefetchThreshold) {
          prefetchSubsequentBars();
        }
        showToast(`Перешли к дате: ${formatTimestamp(targetSec)}`, 'success');
        return;
      }
    }

    // 2. Target date is outside current batch: fetch candles around that date
    showToast(`Загрузка котировок за ${formatTimestamp(targetSec)}...`, 'info');

    const step = timeframeToSeconds(currentTimeframe);
    // Provide forward window of 350 bars after targetSec so replay can run forward!
    const toSec = targetSec + Math.max(350 * step, 7 * 86400);

    try {
      const data = await API.getCandles(currentSymbol, currentFigi, currentTimeframe, 1000, toSec);
      if (data && data.candles && data.candles.length > 0) {
        const newEarliest = data.candles[0].time;
        const newLatest = data.candles[data.candles.length - 1].time;

        if (earliest && newLatest >= earliest && newEarliest < earliest) {
          simulator.prependHistory(data.candles);
        } else {
          simulator.loadData(data.candles);
        }

        const res = simulator.jumpToBar(targetSec);
        if (mainSeries) {
          mainSeries.setData(simulator.getVisibleCandles());
          chart.fitContent();
        }
        const remaining = simulator.allCandles.length - simulator.currentIndex;
        if (remaining <= simulator.prefetchThreshold) {
          prefetchSubsequentBars();
        }
        showToast(`История загружена! Перешли к дате: ${formatTimestamp(targetSec)}`, 'success');
      } else {
        showToast('По выбранной дате котировки не найдены на бирже', 'error');
      }
    } catch (err) {
      console.error('Error fetching date candles:', err);
      showToast('Ошибка загрузки данных за указанную дату', 'error');
    }
  };

  btnQuickEarliest.onclick = () => {
    const t = simulator.getEarliestTime();
    if (t) {
      const d = new Date(t * 1000);
      inputJumpDate.value = d.toISOString().split('T')[0];
    }
  };

  btnQuickLatest.onclick = () => {
    const t = simulator.getLatestTime();
    if (t) {
      const d = new Date(t * 1000);
      inputJumpDate.value = d.toISOString().split('T')[0];
    }
  };

  btnQuickWeekAgo.onclick = () => {
    const currentBar = simulator.getCurrentBar();
    const t = currentBar ? currentBar.time : simulator.getLatestTime();
    if (t) {
      const d = new Date((t - 7 * 86400) * 1000);
      inputJumpDate.value = d.toISOString().split('T')[0];
    }
  };

  btnQuickMonthAgo.onclick = () => {
    const currentBar = simulator.getCurrentBar();
    const t = currentBar ? currentBar.time : simulator.getLatestTime();
    if (t) {
      const d = new Date((t - 30 * 86400) * 1000);
      inputJumpDate.value = d.toISOString().split('T')[0];
    }
  };

  // --------------------------------------------------------------------------
  // Trading Execution Logic (Historical Simulator Mode)
  // --------------------------------------------------------------------------
  function executeTrade(side) {
    const currentBar = simulator.getCurrentBar();
    if (!currentBar) {
      showToast('Нет данных свечей для выставления заявки', 'error');
      return;
    }

    const lots = Number(inputLots.value) || 1;
    const sl = inputSL.value ? Number(inputSL.value) : null;
    const tp = inputTP.value ? Number(inputTP.value) : null;
    let orderPrice = currentBar.close;

    if (selectedOrderType !== 'MARKET') {
      orderPrice = Number(inputLimitPrice.value);
      if (!orderPrice || orderPrice <= 0) {
        showToast('Пожалуйста, укажите цену для лимитной/стоп заявки', 'error');
        return;
      }
    }

    const res = paperAccount.placeOrder({
      symbol: currentSymbol,
      side,
      type: selectedOrderType,
      qty: lots,
      price: orderPrice,
      sl,
      tp,
      time: currentBar.time,
      lotSize: currentLotSize
    });

    if (res.ok) {
      showToast(res.message, 'success');
      // If we placed a market order while replay was not yet active, activate replay
      if (!simulator.isReplayActive && selectedOrderType === 'MARKET') {
        simulator.enableReplay();
      }
    } else {
      showToast(res.error, 'error');
    }
  }

  // Quick trade buttons in header
  btnQuickBuy.onclick = () => executeTrade('BUY');
  btnQuickSell.onclick = () => executeTrade('SELL');

  // Bottom panel trade buttons
  btnPanelBuy.onclick = () => executeTrade('BUY');
  btnPanelSell.onclick = () => executeTrade('SELL');

  // Close all / Cancel all
  btnCloseAllPositions.onclick = () => {
    const currentBar = simulator.getCurrentBar();
    const count = paperAccount.closeAllPositions(currentBar ? currentBar.close : 0, currentBar ? currentBar.time : null);
    if (count && count.length > 0) {
      showToast(`Закрыто позиций: ${count.length}`, 'info');
    }
  };

  btnCancelAllOrders.onclick = () => {
    const count = paperAccount.cancelAllOrders();
    if (count > 0) {
      showToast(`Отменено заявок: ${count}`, 'info');
    }
  };

  // Reset account simulation
  btnResetAccount.onclick = () => {
    if (confirm('Сбросить весь торговый счет, баланс и историю симуляции?')) {
      paperAccount.reset();
      showToast('Счет симулятора сброшен к исходному состоянию', 'info');
    }
  };

  // Export CSV
  btnExportCsv.onclick = () => {
    const csv = paperAccount.exportCsv();
    if (!csv) {
      showToast('Нет совершенных сделок для экспорта', 'info');
      return;
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openalgo_trades_${currentSymbol}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Файл истории сделок сохранен!', 'success');
  };

  // Order type buttons (Market / Limit / Stop)
  orderTypeBtns.forEach(btn => {
    btn.onclick = () => {
      orderTypeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedOrderType = btn.getAttribute('data-order-type');

      if (selectedOrderType === 'MARKET') {
        rowLimitPrice.style.display = 'none';
      } else {
        rowLimitPrice.style.display = 'flex';
        const currentBar = simulator.getCurrentBar();
        if (currentBar && (!inputLimitPrice.value || inputLimitPrice.value === '0')) {
          inputLimitPrice.value = currentBar.close;
        }
      }
      updateRiskRewardPreview();
    };
  });

  // Calculate and preview Risk / Reward in real-time
  function updateRiskRewardPreview() {
    const lots = Number(inputLots.value) || 1;
    const totalShares = lots * currentLotSize;
    const currentBar = simulator.getCurrentBar();
    const currentPrice = currentBar ? currentBar.close : 0;
    const entryPrice = selectedOrderType === 'MARKET' ? currentPrice : (Number(inputLimitPrice.value) || currentPrice);

    const notional = totalShares * entryPrice;
    rrNotional.textContent = `${formatMoney(notional)}`;

    const sl = Number(inputSL.value);
    const tp = Number(inputTP.value);

    if (sl && sl > 0) {
      const riskPerShare = Math.abs(entryPrice - sl);
      const totalRisk = riskPerShare * totalShares;
      rrRisk.textContent = `-${formatMoney(totalRisk)}`;
    } else {
      rrRisk.textContent = '— ₽';
    }

    if (tp && tp > 0) {
      const rewardPerShare = Math.abs(tp - entryPrice);
      const totalReward = rewardPerShare * totalShares;
      rrReward.textContent = `+${formatMoney(totalReward)}`;
    } else {
      rrReward.textContent = '— ₽';
    }

    if (sl && tp && sl > 0 && tp > 0) {
      const riskPerShare = Math.abs(entryPrice - sl);
      const rewardPerShare = Math.abs(tp - entryPrice);
      if (riskPerShare > 0) {
        const ratio = (rewardPerShare / riskPerShare).toFixed(1);
        rrRatio.textContent = `1 : ${ratio}`;
      } else {
        rrRatio.textContent = '—';
      }
    } else {
      rrRatio.textContent = '—';
    }
  }

  inputLots.oninput = () => {
    updateLotsDisplay();
    updateRiskRewardPreview();
  };
  inputLimitPrice.oninput = updateRiskRewardPreview;
  inputSL.oninput = updateRiskRewardPreview;
  inputTP.oninput = updateRiskRewardPreview;

  function updateLotsDisplay() {
    const lots = Number(inputLots.value) || 1;
    lotsInfoText.textContent = `${lots * currentLotSize} шт.`;
  }

  // --------------------------------------------------------------------------
  // TradingView-style On-Chart Order Context Menu & Action Logic
  // --------------------------------------------------------------------------
  function formatRussianPrice(p) {
    if (p === null || p === undefined || isNaN(p)) return '0,00';
    if (p >= 10) return p.toFixed(2).replace('.', ',');
    if (p >= 1) return p.toFixed(3).replace('.', ',');
    return p.toFixed(4).replace('.', ',');
  }

  function updateMenuDisplay() {
    if (!menuTargetPrice || menuTargetPrice <= 0) return;

    if (inputMenuLots) {
      inputMenuLots.value = menuLots;
    }

    menuOrderChips.forEach(chip => {
      const chipLots = Number(chip.getAttribute('data-lots'));
      chip.classList.toggle('active', chipLots === menuLots);
    });

    if (inputLots) {
      inputLots.value = menuLots;
      updateLotsDisplay();
      updateRiskRewardPreview();
    }

    const totalShares = menuLots * currentLotSize;
    const notional = totalShares * menuTargetPrice;
    if (menuSharesInfo) {
      menuSharesInfo.textContent = `${totalShares.toLocaleString('ru-RU')} шт. • ${formatMoney(notional)}`;
    }

    const currentBar = simulator.getCurrentBar();
    const currentPrice = currentBar ? currentBar.close : menuTargetPrice;
    const formattedPrice = formatRussianPrice(menuTargetPrice);

    if (menuTargetPrice >= currentPrice) {
      if (menuIconPrimary) {
        menuIconPrimary.className = 'action-icon sell';
        menuIconPrimary.textContent = '∨';
      }
      if (menuTextPrimary) {
        menuTextPrimary.textContent = `Продать ${currentSymbol} Лимит ${menuLots} @ ${formattedPrice}`;
      }
      if (btnMenuActionPrimary) {
        btnMenuActionPrimary.dataset.side = 'SELL';
        btnMenuActionPrimary.dataset.type = 'LIMIT';
      }

      if (menuIconSecondary) {
        menuIconSecondary.className = 'action-icon buy';
        menuIconSecondary.textContent = '∧';
      }
      if (menuTextSecondary) {
        menuTextSecondary.textContent = `Купить ${currentSymbol} Стоп ${menuLots} @ ${formattedPrice}`;
      }
      if (btnMenuActionSecondary) {
        btnMenuActionSecondary.dataset.side = 'BUY';
        btnMenuActionSecondary.dataset.type = 'STOP';
      }
    } else {
      if (menuIconPrimary) {
        menuIconPrimary.className = 'action-icon buy';
        menuIconPrimary.textContent = '∧';
      }
      if (menuTextPrimary) {
        menuTextPrimary.textContent = `Купить ${currentSymbol} Лимит ${menuLots} @ ${formattedPrice}`;
      }
      if (btnMenuActionPrimary) {
        btnMenuActionPrimary.dataset.side = 'BUY';
        btnMenuActionPrimary.dataset.type = 'LIMIT';
      }

      if (menuIconSecondary) {
        menuIconSecondary.className = 'action-icon sell';
        menuIconSecondary.textContent = '∨';
      }
      if (menuTextSecondary) {
        menuTextSecondary.textContent = `Продать ${currentSymbol} Стоп ${menuLots} @ ${formattedPrice}`;
      }
      if (btnMenuActionSecondary) {
        btnMenuActionSecondary.dataset.side = 'SELL';
        btnMenuActionSecondary.dataset.type = 'STOP';
      }
    }
  }

  function openChartOrderMenu(price, clientX, clientY) {
    if (!price || isNaN(price)) return;
    menuTargetPrice = Number(price);
    isMenuOpen = true;

    const panelLots = Number(inputLots.value);
    if (panelLots && panelLots > 0) {
      menuLots = panelLots;
    }

    updateMenuDisplay();

    if (!chartContainer || !chartOrderMenu) return;

    const containerRect = chartContainer.getBoundingClientRect();
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

    chartOrderMenu.style.left = `${left}px`;
    chartOrderMenu.style.top = `${top}px`;
    chartOrderMenu.style.display = 'block';
  }

  function closeChartOrderMenu() {
    isMenuOpen = false;
    if (chartOrderMenu) {
      chartOrderMenu.style.display = 'none';
    }
  }

  function executeChartOrder(side, type) {
    if (!menuTargetPrice || !menuLots) return;
    const currentBar = simulator.getCurrentBar();
    if (!currentBar) {
      showToast('Нет данных свечей для выставления заявки', 'error');
      return;
    }

    const cleanPrice = menuTargetPrice >= 10 ? Number(menuTargetPrice.toFixed(2)) : Number(menuTargetPrice.toFixed(4));

    const res = paperAccount.placeOrder({
      symbol: currentSymbol,
      side,
      type,
      qty: menuLots,
      price: cleanPrice,
      sl: null,
      tp: null,
      time: currentBar.time,
      lotSize: currentLotSize
    });

    if (res.ok) {
      showToast(res.message, 'success');
      closeChartOrderMenu();
    } else {
      showToast(res.error, 'error');
    }
  }

  if (btnMenuQtyDec) {
    btnMenuQtyDec.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menuLots > 1) {
        menuLots--;
        updateMenuDisplay();
      }
    });
  }

  if (btnMenuQtyInc) {
    btnMenuQtyInc.addEventListener('click', (e) => {
      e.stopPropagation();
      menuLots++;
      updateMenuDisplay();
    });
  }

  if (inputMenuLots) {
    inputMenuLots.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      if (!isNaN(val) && val >= 1) {
        menuLots = val;
      }
      updateMenuDisplay();
    });
  }

  menuOrderChips.forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = parseInt(chip.getAttribute('data-lots'), 10);
      if (!isNaN(val) && val > 0) {
        menuLots = val;
        updateMenuDisplay();
      }
    });
  });

  if (btnMenuActionPrimary) {
    btnMenuActionPrimary.addEventListener('click', () => {
      executeChartOrder(btnMenuActionPrimary.dataset.side, btnMenuActionPrimary.dataset.type);
    });
  }

  if (btnMenuActionSecondary) {
    btnMenuActionSecondary.addEventListener('click', () => {
      executeChartOrder(btnMenuActionSecondary.dataset.side, btnMenuActionSecondary.dataset.type);
    });
  }

  if (btnMenuActionCustom) {
    btnMenuActionCustom.addEventListener('click', () => {
      closeChartOrderMenu();
      const currentBar = simulator.getCurrentBar();
      const currentPrice = currentBar ? currentBar.close : menuTargetPrice;
      const isAbove = menuTargetPrice >= currentPrice;
      selectedOrderType = isAbove ? 'LIMIT' : 'STOP';

      orderTypeBtns.forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-order-type') === selectedOrderType);
      });
      rowLimitPrice.style.display = 'flex';
      inputLimitPrice.value = menuTargetPrice.toFixed(2);
      inputLots.value = menuLots;
      updateLotsDisplay();
      updateRiskRewardPreview();
      showToast(`Заявка по ${menuTargetPrice.toFixed(2)} ₽ перенесена в панель ордеров`, 'info');
    });
  }

  if (chartOrderMenu) {
    chartOrderMenu.addEventListener('pointerdown', e => e.stopPropagation());
    chartOrderMenu.addEventListener('click', e => e.stopPropagation());
  }

  document.addEventListener('pointerdown', (e) => {
    if (isMenuOpen && chartOrderMenu && !chartOrderMenu.contains(e.target) && e.target !== priceAxisPlusBtn) {
      closeChartOrderMenu();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isMenuOpen) {
      closeChartOrderMenu();
    }
  });

  // --------------------------------------------------------------------------
  // Timeframe and Chart Type Selection
  // --------------------------------------------------------------------------
  timeframeButtons.forEach(btn => {
    btn.onclick = async () => {
      const newTf = btn.getAttribute('data-tf');
      if (newTf === currentTimeframe) return;

      const prevTf = currentTimeframe;
      const barInfo = getLastChartBarInfo();

      timeframeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTimeframe = newTf;

      // Adjust targetSec if transitioning between daily and intraday
      let targetSec = barInfo.time;
      if (targetSec) {
        if (prevTf === '1d' && newTf !== '1d') {
          // A 1d bar is timestamped at 00:00:00 UTC. To cover the full daily session in intraday, use day end:
          targetSec = targetSec + 86400 - 1;
        }
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const isHistorical = barInfo.isReplay || barInfo.isScrolled || (targetSec && (nowSec - targetSec > 86400 * 2));

      if (isHistorical && targetSec) {
        await loadCandles(targetSec, barInfo.isReplay);
      } else {
        await loadCandles(null, false);
      }
    };
  });

  // Chart type switcher
  btnChartTypeTrigger.onclick = (e) => {
    e.stopPropagation();
    chartTypeDropdown.style.display = chartTypeDropdown.style.display === 'none' ? 'block' : 'none';
  };

  chartTypeItems.forEach(item => {
    item.onclick = () => {
      const type = item.getAttribute('data-type');
      chartTypeItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      currentChartType = type;
      chartTypeText.textContent = item.textContent.replace(/[^\p{L}\s]/gu, '').trim();
      chartTypeDropdown.style.display = 'none';

      if (chart && mainSeries && typeof chart.setSeriesType === 'function') {
        chart.setSeriesType(mainSeries, type);
      }
    };
  });

  // --------------------------------------------------------------------------
  // Instrument Search & Selection
  // --------------------------------------------------------------------------
  symbolTrigger.onclick = async (e) => {
    e.stopPropagation();
    symbolDropdown.classList.toggle('open');
    if (symbolDropdown.classList.contains('open')) {
      symbolSearchInput.focus();
      populateSymbolList('');
    }
  };

  symbolSearchInput.oninput = (e) => {
    populateSymbolList(e.target.value);
  };

  async function populateSymbolList(query) {
    const res = await API.searchInstruments(query);
    const instruments = res.instruments || [];

    symbolList.innerHTML = instruments.map(inst => `
      <div class="symbol-item ${inst.ticker === currentSymbol ? 'active' : ''}" data-ticker="${inst.ticker}" data-figi="${inst.figi || ''}" data-lot="${inst.lot || 1}">
        <div class="symbol-item-top">
          <span class="symbol-item-ticker">${inst.ticker}</span>
          <span class="symbol-item-badge">${inst.currency || 'RUB'} • 1 лот = ${inst.lot || 1} шт.</span>
        </div>
        <div class="symbol-item-name">${inst.name}</div>
      </div>
    `).join('');

    symbolList.querySelectorAll('.symbol-item').forEach(item => {
      item.onclick = () => {
        currentSymbol = item.getAttribute('data-ticker');
        currentFigi = item.getAttribute('data-figi');
        currentLotSize = Number(item.getAttribute('data-lot')) || 10;

        symbolTickerText.textContent = currentSymbol;
        symbolDropdown.classList.remove('open');
        updateLotsDisplay();
        loadCandles();
      };
    });
  }

  // --------------------------------------------------------------------------
  // Bottom Dock Tabs Navigation
  // --------------------------------------------------------------------------
  bottomTabs.forEach(tab => {
    tab.onclick = () => {
      bottomTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const target = tab.getAttribute('data-tab');
      positionsView.style.display = target === 'positions' ? 'block' : 'none';
      ordersView.style.display = target === 'orders' ? 'block' : 'none';
      tradesView.style.display = target === 'trades' ? 'block' : 'none';
      analyticsView.style.display = target === 'analytics' ? 'block' : 'none';
    };
  });

  // --------------------------------------------------------------------------
  // Settings Modal Handlers
  // --------------------------------------------------------------------------
  btnOpenSettings.onclick = async () => {
    const cfg = await API.getSettings();
    if (cfg) {
      inputInitialBalance.value = cfg.initialBalance || 100000;
      inputCommission.value = cfg.commission || 0.05;
      if (cfg.tokenPreview) {
        inputTinkoffToken.placeholder = `Активен (${cfg.tokenPreview})`;
      }
    }
    settingsModal.classList.add('open');
  };

  btnCloseSettings.onclick = () => settingsModal.classList.remove('open');
  btnCloseSettingsBottom.onclick = () => settingsModal.classList.remove('open');

  btnTestToken.onclick = async () => {
    const token = inputTinkoffToken.value.trim();
    tokenTestResult.style.display = 'block';
    tokenTestResult.style.color = '#787b86';
    tokenTestResult.textContent = 'Проверка подключения к T-Invest API...';

    const res = await API.testToken(token);
    if (res.ok) {
      tokenTestResult.style.color = '#089981';
      tokenTestResult.textContent = '✓ ' + (res.message || 'Подключение успешно! Токен действителен.');
    } else {
      tokenTestResult.style.color = '#f23645';
      tokenTestResult.textContent = '✗ ' + (res.error || 'Ошибка проверки токена');
    }
  };

  btnSaveSettings.onclick = async () => {
    const payload = {
      initialBalance: Number(inputInitialBalance.value) || 100000,
      commission: Number(inputCommission.value) || 0.05
    };

    if (inputTinkoffToken.value.trim().length > 10) {
      payload.tinkoffToken = inputTinkoffToken.value.trim();
    }

    const res = await API.saveSettings(payload);
    if (res.ok) {
      paperAccount.commissionRate = payload.commission / 100;
      settingsModal.classList.remove('open');
      showToast('Настройки симулятора сохранены', 'success');
      loadCandles();
    } else {
      showToast(res.error || 'Ошибка сохранения настроек', 'error');
    }
  };

  // Indicators Modal Handlers
  btnOpenIndicators.onclick = () => {
    initIndicatorsModal();
    indicatorsModal.classList.add('open');
  };
  btnCloseIndicators.onclick = () => indicatorsModal.classList.remove('open');
  btnDoneIndicators.onclick = () => indicatorsModal.classList.remove('open');

  // Fullscreen toggle
  btnFullscreen.onclick = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Close menus on outside click
  window.addEventListener('click', (e) => {
    if (!symbolTrigger.contains(e.target) && !symbolDropdown.contains(e.target)) {
      symbolDropdown.classList.remove('open');
    }
    if (!btnChartTypeTrigger.contains(e.target) && !chartTypeDropdown.contains(e.target)) {
      chartTypeDropdown.style.display = 'none';
    }
    if (!btnToggleReplayMenu.contains(e.target) && !btnReplayStartPoint.contains(e.target) && !startPointMenu.contains(e.target)) {
      startPointMenu.style.display = 'none';
    }
  });

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    // Ignore keystrokes inside text inputs
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
      if (drawingController) drawingController.setTool(null);
      isSelectingJumpBar = false;
      chartEl.style.cursor = 'default';
      settingsModal.classList.remove('open');
      indicatorsModal.classList.remove('open');
      datePickerModal.classList.remove('open');
      startPointMenu.style.display = 'none';
    } else if (e.key === 'b' || e.key === 'B' || e.key === 'и' || e.key === 'И') {
      executeTrade('BUY');
    } else if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') {
      executeTrade('SELL');
    }
  });

  // --------------------------------------------------------------------------
  // Helper Functions
  // --------------------------------------------------------------------------
  function updateLegend(bar) {
    if (!bar) return;
    valOpen.textContent = bar.open.toFixed(2);
    valHigh.textContent = bar.high.toFixed(2);
    valLow.textContent = bar.low.toFixed(2);
    valClose.textContent = bar.close.toFixed(2);

    const change = bar.close - bar.open;
    const changePct = ((change / bar.open) * 100).toFixed(2);
    valChange.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePct}%)`;
    valChange.className = change >= 0 ? 'text-positive' : 'text-negative';

    valVolume.textContent = Number(bar.volume || 0).toLocaleString('ru-RU');
  }

  function updateLegendToLatest() {
    const current = simulator.getCurrentBar();
    if (current) updateLegend(current);
  }

  function updateQuickPrices(closePrice) {
    if (!closePrice) return;
    quickSellPrice.textContent = `${closePrice.toFixed(2)} ₽`;
    quickBuyPrice.textContent = `${closePrice.toFixed(2)} ₽`;
    updateRiskRewardPreview();
  }

  function updateReplayProgress(index, total, timestamp) {
    replayInfoText.textContent = `${index} / ${total}`;
    if (total > 0) {
      replayScrubSlider.value = Math.floor((index / total) * 100);
    }
    if (timestamp) {
      replayTimeText.textContent = formatTimestamp(timestamp);
    }
  }

  function formatMoney(val) {
    return Number(val || 0).toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + ' ₽';
  }

  function formatTimestamp(sec) {
    if (!sec) return '—';
    const d = new Date(sec * 1000);
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function showToast(message, type = 'info') {
    let toast = document.getElementById('appToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'appToast';
      toast.className = 'tv-toast';
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.className = `tv-toast ${type}`;
    toast.style.display = 'flex';

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.style.display = 'none';
    }, 3500);
  }

  // --------------------------------------------------------------------------
  // Startup
  // --------------------------------------------------------------------------
  initDrawingTools();
  await loadCandles();
  paperAccount.notifyUpdate();

  console.log('OpenAlgo Trading Simulator initialized successfully.');
});

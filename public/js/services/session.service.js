// services/session.service.js - Unified Simulation & Trading Session Persistence Service
import { eventBus } from '../core/event-bus.js';
import { cacheService } from './cache.service.js';

const STORAGE_KEY = 'trading_simulator_session_v1';
const ACTIVE_SESSION_ID = 'active_session';

class SessionPersistenceService {
  constructor(store) {
    this.store = store;
    this.saveTimeout = null;
    this.isRestoring = false;
    this._initialized = false;
    this.drawingsBySymbol = {};
  }

  init() {
    if (this._initialized) return;
    this._initialized = true;

    // Listen to all reactive state updates
    eventBus.on('account:update', () => this.scheduleSave());
    eventBus.on('bar:tick', () => this.scheduleSave());
    eventBus.on('drawings:change', () => this.scheduleSave());
    eventBus.on('indicators:change', () => this.scheduleSave());
    eventBus.on('chart:zoom', () => this.scheduleSave());
    eventBus.on('state:showExecutionsOnChart', () => this.scheduleSave());
    eventBus.on('state:showSessionBreaks', () => this.scheduleSave());
    eventBus.on('state:sessionBreaksConfig', () => this.scheduleSave());
    eventBus.on('state:chartAppearanceConfig', () => this.scheduleSave());
    eventBus.on('state:currentTimeframe', () => this.scheduleSave());
    eventBus.on('state:currentSymbol', () => this.scheduleSave());
    eventBus.on('state:currentChartType', () => this.scheduleSave());

    // Switch per-ticker drawings when instrument changes
    eventBus.on('symbol:change', ({ prevSymbol, ticker } = {}) => {
      if (prevSymbol && ticker && prevSymbol !== ticker) {
        this.switchSymbolDrawings(prevSymbol, ticker);
      }
    });

    // Flush immediately before window closes or refreshes
    window.addEventListener('beforeunload', () => {
      this.saveImmediate();
    });
  }

  scheduleSave(delay = 300) {
    if (this.isRestoring) return;
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      this.saveImmediate();
    }, delay);
  }

  buildSnapshot() {
    const symbol = this.store.get('currentSymbol') || 'SBER';
    const timeframe = this.store.get('currentTimeframe') || '1h';
    const chartType = this.store.get('currentChartType') || 'candlestick';
    const sim = this.store.simulator;
    const paper = this.store.paperAccount;
    const chart = this.store.chart;
    const dc = this.store.drawingController;

    const currentBar = sim ? sim.getCurrentBar() : null;
    const currentBarTime = currentBar ? currentBar.time : null;

    // Viewport zoom & offset
    let barSpacing = null;
    let rightOffset = null;
    if (chart) {
      const ts = chart._timeScale || (typeof chart.timeScale === 'function' ? chart.timeScale() : chart.timeScale);
      if (ts) {
        barSpacing = ts.barSpacing || null;
        rightOffset = ts.rightOffset !== undefined ? ts.rightOffset : null;
      }
    }

    // Active indicators (deduplicated)
    const indicators = (chart && Array.isArray(chart._indicators))
      ? Array.from(new Set(chart._indicators.map(ind => ind.indicatorId).filter(Boolean)))
      : [];

    // Drawings from DrawingController (per-symbol and active)
    let drawings = null;
    const drawingsBySymbol = { ...(this.drawingsBySymbol || {}) };
    if (dc && typeof dc.toJSON === 'function') {
      try {
        drawings = dc.toJSON();
        if (symbol) {
          drawingsBySymbol[symbol] = drawings;
        }
      } catch (e) {
        console.warn('[SessionService] Failed to serialize drawings:', e);
      }
    }

    // Paper trading state
    const accountState = paper && typeof paper.exportState === 'function'
      ? paper.exportState()
      : null;

    // Replay state
    const replayState = {
      isActive: sim ? !!sim.isReplayActive : false,
      currentBarTime: currentBarTime,
      speedMs: sim ? sim.speedMs : 1000
    };

    return {
      id: ACTIVE_SESSION_ID,
      version: 2,
      savedAt: Date.now(),
      symbol,
      timeframe,
      chartType,
      replay: replayState,
      account: accountState,
      indicators,
      chart: {
        barSpacing,
        rightOffset,
        drawings,
        drawingsBySymbol
      },
      multiChart: this.store.multiChart ? this.store.multiChart.exportState() : null,
      ui: {
        showExecutionsOnChart: this.store.get('showExecutionsOnChart') !== false,
        showSessionBreaks: this.store.get('showSessionBreaks') !== false,
        sessionBreaksConfig: this.store.get('sessionBreaksConfig') || null,
        chartAppearanceConfig: this.store.get('chartAppearanceConfig') || null
      }
    };
  }

  saveImmediate() {
    if (this.isRestoring) return;
    try {
      const snapshot = this.buildSnapshot();
      this._lastSnapshot = snapshot;

      // 1. Asynchronously persist full snapshot to IndexedDB (virtually unlimited capacity)
      cacheService.saveSession(snapshot).catch(err => {
        console.warn('[SessionService] Failed to persist session to IndexedDB:', err);
      });

      // 2. Synchronous lightweight copy in localStorage (for beforeunload protection)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      } catch (lsErr) {
        // If localStorage 5MB quota is exceeded due to heavy drawings or trade history,
        // safely fall back to metadata without heavy drawings
        console.warn('[SessionService] localStorage quota exceeded, saving lightweight metadata fallback:', lsErr);
        try {
          const lightweight = {
            ...snapshot,
            chart: {
              ...snapshot.chart,
              drawingsBySymbol: {}
            }
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(lightweight));
        } catch (e) {
          // IndexedDB already has the full snapshot
        }
      }
    } catch (e) {
      console.warn('[SessionService] Failed to save session:', e);
    }
  }

  async getSavedSession() {
    try {
      // 1. Check IndexedDB first (primary persistent storage)
      const idbSession = await cacheService.getSession(ACTIVE_SESSION_ID);
      if (idbSession && (idbSession.version === 1 || idbSession.version === 2)) {
        this._lastSnapshot = idbSession;
        return idbSession;
      }
    } catch (idbErr) {
      console.warn('[SessionService] Error loading from IndexedDB, falling back to localStorage:', idbErr);
    }

    // 2. Fallback to localStorage and automatically migrate to IndexedDB
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.version === 1 || parsed.version === 2)) {
          // Migrate to IndexedDB in background
          cacheService.saveSession({ ...parsed, id: ACTIVE_SESSION_ID, version: 2 }).catch(e => {
            console.warn('[SessionService] Background migration to IndexedDB failed:', e);
          });
          this._lastSnapshot = parsed;
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[SessionService] Failed to load session from localStorage:', e);
    }

    return null;
  }

  async restoreSession(saved) {
    if (!saved) return false;
    this.isRestoring = true;

    try {
      // 1. Symbol & Timeframe & Chart Type
      if (saved.symbol && saved.symbol !== this.store.get('currentSymbol')) {
        this.store.set('currentSymbol', saved.symbol);
      }
      if (saved.timeframe && saved.timeframe !== this.store.get('currentTimeframe')) {
        this.store.set('currentTimeframe', saved.timeframe);
      }
      if (saved.chartType && saved.chartType !== this.store.get('currentChartType')) {
        this.store.set('currentChartType', saved.chartType);
      }
      if (saved.ui && saved.ui.showExecutionsOnChart !== undefined) {
        this.store.set('showExecutionsOnChart', saved.ui.showExecutionsOnChart);
      }
      if (saved.ui && saved.ui.showSessionBreaks !== undefined) {
        this.store.set('showSessionBreaks', saved.ui.showSessionBreaks);
      }
      if (saved.ui && saved.ui.sessionBreaksConfig) {
        this.store.set('sessionBreaksConfig', saved.ui.sessionBreaksConfig);
      }
      if (saved.ui && saved.ui.chartAppearanceConfig) {
        this.store.set('chartAppearanceConfig', saved.ui.chartAppearanceConfig);
        if (this.store.chartController) {
          this.store.chartController.applyAppearance(saved.ui.chartAppearanceConfig);
        }
      }

      // 2. Paper trading account
      if (saved.account && this.store.paperAccount) {
        this.store.paperAccount.importState(saved.account);
      }

      // 3. Replay speed
      if (saved.replay && saved.replay.speedMs && this.store.simulator) {
        this.store.simulator.speedMs = saved.replay.speedMs;
        const speedSelect = document.getElementById('replaySpeedSelect');
        if (speedSelect) speedSelect.value = String(saved.replay.speedMs);
      }

      // 4. Indicators restoration
      if (Array.isArray(saved.indicators) && this.store.chart && typeof this.store.chart.addIndicator === 'function') {
        const existingInds = new Set((this.store.chart._indicators || []).map(i => i.indicatorId));
        for (const indId of saved.indicators) {
          if (!existingInds.has(indId)) {
            try {
              this.store.chart.addIndicator(indId);
            } catch (err) {
              console.warn('[SessionService] Could not restore indicator:', indId, err);
            }
          }
        }
        if (this.store.chartController && typeof this.store.chartController.syncIndicatorLegendOffset === 'function') {
          this.store.chartController.syncIndicatorLegendOffset();
        }
        if (this.store.components?.modals && typeof this.store.components.modals.populateIndicatorsList === 'function') {
          this.store.components.modals.populateIndicatorsList();
        }
      }

      // 5. Drawings restoration (per-symbol and backward compatible)
      this.drawingsBySymbol = saved.chart?.drawingsBySymbol || {};
      const currentSym = saved.symbol || this.store.get('currentSymbol') || 'SBER';
      const activeDrawings = this.drawingsBySymbol[currentSym] || saved.chart?.drawings;
      if (activeDrawings && this.store.drawingController && typeof this.store.drawingController.fromJSON === 'function') {
        try {
          this.store.drawingController.fromJSON(activeDrawings);
        } catch (err) {
          console.warn('[SessionService] Failed to restore drawings:', err);
        }
      }

      // 6. Viewport zoom & right offset
      if (saved.chart && this.store.chart) {
        const ts = this.store.chart._timeScale || (typeof this.store.chart.timeScale === 'function' ? this.store.chart.timeScale() : this.store.chart.timeScale);
        if (ts) {
          if (saved.chart.barSpacing && typeof ts.setBarSpacing === 'function') {
            ts.setBarSpacing(saved.chart.barSpacing);
          }
          if (saved.chart.rightOffset !== undefined && typeof ts.setRightOffset === 'function') {
            ts.setRightOffset(saved.chart.rightOffset);
          }
        }
      }

      // 7. Update UI components
      if (this.store.components?.bottomDock && this.store.paperAccount) {
        this.store.components.bottomDock.flushUpdate(this.store.paperAccount.getPerformanceMetrics());
      }
      if (this.store.tradeExecutionsOverlay) {
        this.store.tradeExecutionsOverlay.scheduleRender();
      }
      if (this.store.tradeLinesOverlay) {
        this.store.tradeLinesOverlay.scheduleRender();
      }

      // 8. Multi-chart layout and slots restoration
      if (saved.multiChart && this.store.multiChart) {
        this.store.multiChart.restoreState(saved.multiChart);
      }

      return true;
    } catch (err) {
      console.error('[SessionService] Error restoring session:', err);
      return false;
    } finally {
      this.isRestoring = false;
    }
  }

  // Reset session: triggers ONLY on clicking Reset button or selecting a new start point
  resetSession({ newTime = null } = {}) {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    // 1. Reset paper trading account
    if (this.store.paperAccount) {
      this.store.paperAccount.reset();
    }

    // 2. Clear bottom dock trades and update metrics
    if (this.store.components?.bottomDock) {
      const dock = this.store.components.bottomDock;
      if (dock.renderedTradesSet) {
        dock.renderedTradesSet.clear();
      }
      if (dock.tradesTableBody) {
        dock.tradesTableBody.innerHTML = '<tr class="empty-row"><td colspan="11" class="text-center">Нет совершенных сделок</td></tr>';
      }
      if (this.store.paperAccount) {
        dock.flushUpdate(this.store.paperAccount.getPerformanceMetrics());
      }
    }

    // 3. Re-render chart overlays
    if (this.store.tradeExecutionsOverlay) {
      this.store.tradeExecutionsOverlay.scheduleRender();
    }
    if (this.store.tradeLinesOverlay) {
      this.store.tradeLinesOverlay.scheduleRender();
    }

    // 4. Save clean snapshot with the updated point immediately
    this.saveImmediate();
  }

  switchSymbolDrawings(prevSymbol, newSymbol) {
    const dc = this.store.drawingController;
    if (!dc) return;

    this.drawingsBySymbol = this.drawingsBySymbol || {};

    // 1. Serialize and save drawings for previous ticker
    if (prevSymbol && typeof dc.toJSON === 'function') {
      try {
        this.drawingsBySymbol[prevSymbol] = dc.toJSON();
      } catch (e) {
        console.warn('[SessionService] Failed to serialize drawings for prevSymbol:', e);
      }
    }

    // 2. Clear current drawings from canvas
    if (typeof dc.drawings === 'function' && typeof dc.removeMany === 'function') {
      try {
        const all = dc.drawings();
        if (all && all.length > 0) {
          dc.removeMany(all.map(d => d.id));
        }
      } catch (e) {
        console.warn('[SessionService] Failed to clear canvas drawings:', e);
      }
    }

    // 3. Load drawings for new ticker if they were saved previously
    if (newSymbol && this.drawingsBySymbol[newSymbol] && typeof dc.fromJSON === 'function') {
      try {
        dc.fromJSON(this.drawingsBySymbol[newSymbol]);
      } catch (e) {
        console.warn('[SessionService] Failed to restore drawings for newSymbol:', e);
      }
    }

    // 4. Trigger reactive save and event
    eventBus.emit('drawings:change');
    this.scheduleSave();
  }

  // Save current simulation as a named session slot in IndexedDB
  async saveNamedSession(name) {
    const snapshot = this.buildSnapshot();
    const sessionId = `session_${Date.now()}`;
    const pnl = this.store.paperAccount ? this.store.paperAccount.realizedPnL : 0;
    const tradesCount = this.store.paperAccount ? (this.store.paperAccount.tradeHistory?.length || 0) : 0;
    
    const namedSession = {
      ...snapshot,
      id: sessionId,
      name: name || `Сессия ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`,
      tradesCount,
      realizedPnL: pnl
    };

    await cacheService.saveSession(namedSession);
    eventBus.emit('session:saved', namedSession);
    return namedSession;
  }

  // Get list of all saved sessions from IndexedDB
  async listSavedSessions() {
    return await cacheService.listSessions();
  }

  // Load and activate a named session from IndexedDB
  async loadNamedSession(sessionId) {
    const session = await cacheService.getSession(sessionId);
    if (!session) return false;

    // Overwrite active_session with selected session data
    await cacheService.saveSession({ ...session, id: ACTIVE_SESSION_ID });

    // Restore full state into current application
    await this.restoreSession(session);

    // If Replay was saved at a specific bar, jump to it
    if (session.replay?.currentBarTime && this.store.simulator) {
      this.store.simulator.jumpToBar(session.replay.currentBarTime);
    }

    eventBus.emit('session:loaded', session);
    return true;
  }

  // Delete a saved session from IndexedDB
  async deleteNamedSession(sessionId) {
    if (sessionId === ACTIVE_SESSION_ID) return false;
    const res = await cacheService.deleteSession(sessionId);
    eventBus.emit('session:deleted', { sessionId });
    return res;
  }

  // Clear current active session from both IndexedDB and localStorage
  clearSession() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      cacheService.deleteSession(ACTIVE_SESSION_ID).catch(() => {});
    } catch (e) {
      console.warn('[SessionService] Failed to clear session:', e);
    }
  }
}

export { SessionPersistenceService };
export default SessionPersistenceService;

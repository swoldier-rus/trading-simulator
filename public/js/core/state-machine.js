// core/state-machine.js - Finite State Machine (FSM) for Simulator & Interaction Modes
import { eventBus } from './event-bus.js';

export const AppStates = Object.freeze({
  REALTIME_IDLE: 'REALTIME_IDLE',           // Realtime / Live market mode (Replay off)
  REPLAY_PAUSED: 'REPLAY_PAUSED',           // Replay active, playback paused
  REPLAY_PLAYING: 'REPLAY_PLAYING',         // Replay actively advancing bars
  SELECTING_JUMP_BAR: 'SELECTING_JUMP_BAR', // User in scissors / jump bar selection mode
  DRAWING_ACTIVE: 'DRAWING_ACTIVE',         // Vector drawing tool placement mode
  DRAGGING_TRADE_LINE: 'DRAGGING_TRADE_LINE' // User dragging SL / TP / Order line on chart
});

export const AppEvents = Object.freeze({
  PLAY: 'PLAY',
  PAUSE: 'PAUSE',
  ENABLE_REPLAY: 'ENABLE_REPLAY',
  DISABLE_REPLAY: 'DISABLE_REPLAY',
  START_JUMP_SELECTION: 'START_JUMP_SELECTION',
  COMPLETE_JUMP_SELECTION: 'COMPLETE_JUMP_SELECTION',
  CANCEL_JUMP_SELECTION: 'CANCEL_JUMP_SELECTION',
  START_DRAWING: 'START_DRAWING',
  FINISH_DRAWING: 'FINISH_DRAWING',
  CANCEL_DRAWING: 'CANCEL_DRAWING',
  START_TRADE_DRAG: 'START_TRADE_DRAG',
  FINISH_TRADE_DRAG: 'FINISH_TRADE_DRAG',
  ESCAPE: 'ESCAPE'
});

export class AppStateMachine {
  constructor(store = null) {
    this.store = store;
    this.currentState = AppStates.REPLAY_PAUSED;
    this.previousState = AppStates.REALTIME_IDLE;
    this.baseState = AppStates.REPLAY_PAUSED; // Underlying mode (REPLAY_PAUSED or REALTIME_IDLE)
    this.activeDrawingTool = null;
    this.tradeDragData = null;
    this.listeners = new Set();
  }

  init(store) {
    this.store = store;
  }

  getState() {
    return this.currentState;
  }

  getPreviousState() {
    return this.previousState;
  }

  getBaseState() {
    return this.baseState;
  }

  isReplay() {
    return this.baseState !== AppStates.REALTIME_IDLE;
  }

  isPlaying() {
    return this.currentState === AppStates.REPLAY_PLAYING;
  }

  isPaused() {
    return this.currentState === AppStates.REPLAY_PAUSED;
  }

  isSelectingJumpBar() {
    return this.currentState === AppStates.SELECTING_JUMP_BAR;
  }

  isDrawing() {
    return this.currentState === AppStates.DRAWING_ACTIVE;
  }

  isDraggingTradeLine() {
    return this.currentState === AppStates.DRAGGING_TRADE_LINE;
  }

  canHandleChartClick() {
    return !this.isDrawing() && !this.isDraggingTradeLine();
  }

  canPlaceOrders() {
    return !this.isSelectingJumpBar() && !this.isDraggingTradeLine();
  }

  canStepReplay() {
    return this.isReplay() && !this.isPlaying() && !this.isSelectingJumpBar() && !this.isDraggingTradeLine();
  }

  _transition(nextState, payload = null) {
    if (this.currentState === nextState) return;
    const prev = this.currentState;
    this.previousState = prev;
    this.currentState = nextState;

    // Update store backwards compatibility flag
    if (this.store) {
      if (nextState === AppStates.SELECTING_JUMP_BAR) {
        this.store.set('isSelectingJumpBar', true);
      } else if (prev === AppStates.SELECTING_JUMP_BAR) {
        this.store.set('isSelectingJumpBar', false);
      }
    }

    eventBus.emit('fsm:state-change', {
      currentState: nextState,
      previousState: prev,
      baseState: this.baseState,
      payload
    });

    for (const listener of this.listeners) {
      try {
        listener(nextState, prev, payload);
      } catch (err) {
        console.error('[AppStateMachine] Listener error:', err);
      }
    }
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // --- Actions & Transitions ---

  startJumpSelection() {
    // If playing, pause playback
    if (this.currentState === AppStates.REPLAY_PLAYING) {
      if (this.store?.simulator) this.store.simulator.pause();
    }
    // If drawing, reset tool
    if (this.currentState === AppStates.DRAWING_ACTIVE) {
      this.cancelDrawing();
    }

    this._transition(AppStates.SELECTING_JUMP_BAR);

    // Update UI
    if (typeof document !== 'undefined') {
      const chartEl = document.getElementById('chart');
      if (chartEl) chartEl.style.cursor = 'crosshair';
      const btnReplayStartPoint = document.getElementById('btnReplayStartPoint');
      if (btnReplayStartPoint) btnReplayStartPoint.classList.add('active');
    }
  }

  completeJumpSelection(targetTime = null) {
    this.baseState = AppStates.REPLAY_PAUSED;
    this._transition(AppStates.REPLAY_PAUSED, { targetTime });

    // Restore UI
    if (typeof document !== 'undefined') {
      const chartEl = document.getElementById('chart');
      if (chartEl) chartEl.style.cursor = 'default';
      const btnReplayStartPoint = document.getElementById('btnReplayStartPoint');
      if (btnReplayStartPoint) btnReplayStartPoint.classList.remove('active');
    }
  }

  cancelJumpSelection() {
    this._transition(this.baseState);

    // Restore UI
    if (typeof document !== 'undefined') {
      const chartEl = document.getElementById('chart');
      if (chartEl) chartEl.style.cursor = 'default';
      const btnReplayStartPoint = document.getElementById('btnReplayStartPoint');
      if (btnReplayStartPoint) btnReplayStartPoint.classList.remove('active');
    }
  }

  startDrawing(tool) {
    if (this.currentState === AppStates.SELECTING_JUMP_BAR) {
      this.cancelJumpSelection();
    }
    if (this.currentState === AppStates.REPLAY_PLAYING) {
      if (this.store?.simulator) this.store.simulator.pause();
      this.baseState = AppStates.REPLAY_PAUSED;
    }

    this.activeDrawingTool = tool;
    this._transition(AppStates.DRAWING_ACTIVE, { tool });
  }

  finishDrawing() {
    this.activeDrawingTool = null;
    this._transition(this.baseState);
  }

  cancelDrawing() {
    this.activeDrawingTool = null;
    if (this.store?.drawingController) {
      this.store.drawingController.setTool(null);
    }
    eventBus.emit('tool:reset');
    this._transition(this.baseState);
  }

  startTradeDrag(dragInfo) {
    if (this.currentState === AppStates.SELECTING_JUMP_BAR) {
      this.cancelJumpSelection();
    }
    this.tradeDragData = dragInfo;
    this._transition(AppStates.DRAGGING_TRADE_LINE, dragInfo);
  }

  finishTradeDrag() {
    this.tradeDragData = null;
    this._transition(this.baseState);
  }

  playReplay() {
    if (this.currentState === AppStates.SELECTING_JUMP_BAR) {
      this.cancelJumpSelection();
    }
    if (this.currentState === AppStates.DRAWING_ACTIVE) {
      this.cancelDrawing();
    }
    this.baseState = AppStates.REPLAY_PAUSED;
    this._transition(AppStates.REPLAY_PLAYING);
  }

  pauseReplay() {
    this.baseState = AppStates.REPLAY_PAUSED;
    this._transition(AppStates.REPLAY_PAUSED);
  }

  enableReplay() {
    this.baseState = AppStates.REPLAY_PAUSED;
    if (this.currentState === AppStates.REALTIME_IDLE) {
      this._transition(AppStates.REPLAY_PAUSED);
    }
  }

  disableReplay() {
    this.baseState = AppStates.REALTIME_IDLE;
    if (this.currentState === AppStates.SELECTING_JUMP_BAR) {
      this.cancelJumpSelection();
    }
    this._transition(AppStates.REALTIME_IDLE);
  }

  // Synchronize with MarketSimulator events
  syncWithSimulator(simState) {
    if (!simState) return;

    if (!simState.isReplayActive) {
      this.baseState = AppStates.REALTIME_IDLE;
      if (this.currentState !== AppStates.SELECTING_JUMP_BAR &&
          this.currentState !== AppStates.DRAWING_ACTIVE &&
          this.currentState !== AppStates.DRAGGING_TRADE_LINE) {
        this._transition(AppStates.REALTIME_IDLE);
      }
    } else {
      this.baseState = AppStates.REPLAY_PAUSED;
      if (this.currentState !== AppStates.SELECTING_JUMP_BAR &&
          this.currentState !== AppStates.DRAWING_ACTIVE &&
          this.currentState !== AppStates.DRAGGING_TRADE_LINE) {
        if (simState.isPlaying) {
          this._transition(AppStates.REPLAY_PLAYING);
        } else {
          this._transition(AppStates.REPLAY_PAUSED);
        }
      }
    }
  }

  // Global Escape Key Coordinator
  handleEscape() {
    if (this.isSelectingJumpBar()) {
      this.cancelJumpSelection();
      return 'jump_cancelled';
    }
    if (this.isDrawing()) {
      this.cancelDrawing();
      return 'drawing_cancelled';
    }
    if (this.isDraggingTradeLine()) {
      this.finishTradeDrag();
      return 'drag_cancelled';
    }
    if (this.isPlaying()) {
      if (this.store?.simulator) this.store.simulator.pause();
      this.pauseReplay();
      return 'playback_paused';
    }
    return null;
  }
}

export const appStateMachine = new AppStateMachine();

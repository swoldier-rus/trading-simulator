// Market Simulator / Bar Replay Engine for Historical Trading
import { binarySearchCandleFloorIndex } from './core/utils.js';

class MarketSimulator {
  constructor() {
    this.allCandles = [];
    this.currentIndex = 0;
    this.isReplayActive = false;
    this.isPlaying = false;
    this.playbackInterval = null;
    this.speedMs = 1000; // 1 second per bar by default
    this.prefetchThreshold = 150; // Prefetch subsequent bars when within 150 bars of the end
    this.canLoadMoreBars = true;

    // Realistic intra-bar simulation (4 micro-tick phases per candle)
    this.isIntraBarEnabled = true;
    this.subTickIndex = -1; // -1 = idle / completed bar, 0 = open, 1 = wick, 2 = surge, 3 = close
    this.currentCandleTicks = null;
    this.currentFormingBar = null;

    // Listeners
    this.onBarAdvance = null;
    this.onStateChange = null;
    this.onNeedMoreBars = null;
  }

  // Notify listeners of simulator state changes
  _emitStateChange(extra = null) {
    if (this.onStateChange) {
      this.onStateChange({
        isReplayActive: this.isReplayActive,
        isPlaying: this.isPlaying,
        currentIndex: this.currentIndex,
        totalBars: this.allCandles.length,
        isIntraBarEnabled: this.isIntraBarEnabled,
        subTickIndex: this.subTickIndex,
        subTickInfo: extra
      });
    }
  }

  // Generate 4 realistic price phases for a historical candle:
  // Phase 0: Open
  // Phase 1: Initial Wick (Low if bullish, High if bearish)
  // Phase 2: Extreme Surge (High if bullish, Low if bearish)
  // Phase 3: Bar Close
  getIntraBarPhases(candle) {
    if (!candle) return [];
    const { open, high, low, close, time, volume = 0 } = candle;
    const isBullish = close >= open;

    return [
      {
        phase: 0,
        name: 'open',
        label: 'Открытие',
        price: open,
        isNewBar: true,
        bar: {
          time,
          open,
          high: open,
          low: open,
          close: open,
          volume: Math.round(volume * 0.1)
        }
      },
      {
        phase: 1,
        name: isBullish ? 'low' : 'high',
        label: isBullish ? 'Тень Low' : 'Тень High',
        price: isBullish ? low : high,
        isNewBar: false,
        bar: {
          time,
          open,
          high: isBullish ? open : high,
          low: isBullish ? low : open,
          close: isBullish ? low : high,
          volume: Math.round(volume * 0.35)
        }
      },
      {
        phase: 2,
        name: isBullish ? 'high' : 'low',
        label: isBullish ? 'Пик High' : 'Дно Low',
        price: isBullish ? high : low,
        isNewBar: false,
        bar: {
          time,
          open,
          high,
          low,
          close: isBullish ? high : low,
          volume: Math.round(volume * 0.75)
        }
      },
      {
        phase: 3,
        name: 'close',
        label: 'Закрытие',
        price: close,
        isNewBar: false,
        bar: {
          time,
          open,
          high,
          low,
          close,
          volume
        }
      }
    ];
  }

  // Toggle or set intra-bar simulation mode
  setIntraBarMode(enabled) {
    this.isIntraBarEnabled = !!enabled;
    if (!this.isIntraBarEnabled) {
      if (this.currentFormingBar && this.subTickIndex >= 0) {
        this.currentIndex++;
      }
      this.subTickIndex = -1;
      this.currentCandleTicks = null;
      this.currentFormingBar = null;
    }
    if (this.isPlaying) {
      this.pause();
      this.play();
    }
    this._emitStateChange();
  }

  // Load new dataset
  loadData(candles) {
    this.pause();
    this.allCandles = candles || [];
    this.currentIndex = this.allCandles.length;
    this.isReplayActive = false;
    this.canLoadMoreBars = true;
    this.subTickIndex = -1;
    this.currentCandleTicks = null;
    this.currentFormingBar = null;

    this._emitStateChange();

    return this.getVisibleCandles();
  }

  // Append newer historical candles (subsequent bars into the future)
  appendHistory(newerBars) {
    if (!newerBars || newerBars.length === 0) return 0;

    const latest = this.allCandles[this.allCandles.length - 1]?.time;
    const fresh = latest !== undefined
      ? newerBars.filter(b => b.time > latest)
      : newerBars;

    if (fresh.length === 0) return 0;

    // Append newer bars to the future end of history
    this.allCandles = [...this.allCandles, ...fresh];

    this._emitStateChange();

    return fresh.length;
  }

  // Prepend older historical candles (from infinite scroll or pagination)
  prependHistory(olderBars) {
    if (!olderBars || olderBars.length === 0) return 0;

    const oldest = this.allCandles[0]?.time;
    const fresh = oldest !== undefined
      ? olderBars.filter(b => b.time < oldest)
      : olderBars;

    if (fresh.length === 0) return 0;

    // Prepend older bars
    this.allCandles = [...fresh, ...this.allCandles];
    this.currentIndex += fresh.length;

    this._emitStateChange();

    return fresh.length;
  }

  // Activate Replay mode (cut candles at percentage or index)
  enableReplay(targetIndex = null) {
    if (this.allCandles.length === 0) return [];

    this.pause();
    this.isReplayActive = true;
    this.subTickIndex = -1;
    this.currentCandleTicks = null;
    this.currentFormingBar = null;

    if (targetIndex !== null && targetIndex >= 5 && targetIndex <= this.allCandles.length) {
      this.currentIndex = targetIndex;
    } else {
      // Default: cut back 35% so there's plenty of room to simulate forward
      this.currentIndex = Math.max(15, Math.floor(this.allCandles.length * 0.65));
    }

    this._emitStateChange();

    const currentBar = this.getCurrentBar();
    if (this.onBarAdvance && currentBar) {
      this.onBarAdvance(currentBar, this.currentIndex, this.allCandles.length, true, {
        isSubTick: false,
        phase: 3,
        phaseName: 'close',
        phaseLabel: 'Закрытие'
      });
    }

    // Check if subsequent bars should be prefetched in advance
    const remaining = this.allCandles.length - this.currentIndex;
    if (remaining <= this.prefetchThreshold && typeof this.onNeedMoreBars === 'function') {
      this.onNeedMoreBars(remaining);
    }

    return this.getVisibleCandles();
  }

  // Exit Replay mode and restore full historical chart
  disableReplay() {
    this.pause();
    this.isReplayActive = false;
    this.currentIndex = this.allCandles.length;
    this.subTickIndex = -1;
    this.currentCandleTicks = null;
    this.currentFormingBar = null;

    this._emitStateChange();

    const currentBar = this.getCurrentBar();
    if (this.onBarAdvance && currentBar) {
      this.onBarAdvance(currentBar, this.currentIndex, this.allCandles.length, true, {
        isSubTick: false,
        phase: 3,
        phaseName: 'close',
        phaseLabel: 'Закрытие'
      });
    }

    // Check if subsequent bars should be prefetched in advance
    const remaining = this.allCandles.length - this.currentIndex;
    if (remaining <= this.prefetchThreshold && typeof this.onNeedMoreBars === 'function') {
      this.onNeedMoreBars(remaining);
    }

    return this.getVisibleCandles();
  }

  // Jump to specific bar by time or index
  jumpToBar(timeOrIndex) {
    let index = -1;
    if (typeof timeOrIndex === 'number' && timeOrIndex > 1000000) {
      // It's a timestamp: find latest candle that opened at or before timeOrIndex (O(log N))
      index = binarySearchCandleFloorIndex(this.allCandles, timeOrIndex);
      if (index === -1 && this.allCandles.length > 0) {
        if (timeOrIndex <= this.allCandles[0].time) index = 0;
        else index = this.allCandles.length - 1;
      }
    } else if (typeof timeOrIndex === 'number') {
      index = timeOrIndex;
    }

    if (index >= 0 && index < this.allCandles.length) {
      this.pause();
      this.isReplayActive = true;
      this.currentIndex = Math.max(1, index + 1);
      this.subTickIndex = -1;
      this.currentCandleTicks = null;
      this.currentFormingBar = null;

      this._emitStateChange();

      const currentBar = this.getCurrentBar();
      if (this.onBarAdvance && currentBar) {
        this.onBarAdvance(currentBar, this.currentIndex, this.allCandles.length, true, {
          isSubTick: false,
          phase: 3,
          phaseName: 'close',
          phaseLabel: 'Закрытие'
        });
      }

      return this.getVisibleCandles();
    }
    return null;
  }

  // Jump to first available date/candle with pre-roll context
  jumpToFirstBar(contextBars = 25) {
    if (this.allCandles.length === 0) return null;
    const targetIdx = Math.min(Math.max(1, contextBars), this.allCandles.length - 1);
    return this.jumpToBar(targetIdx);
  }

  // Jump to a random historical bar for blind edge testing
  jumpToRandomBar(targetTimeOrIndex = null, contextBars = 25) {
    if (this.allCandles.length === 0) return null;
    if (typeof targetTimeOrIndex === 'number') {
      return this.jumpToBar(targetTimeOrIndex);
    }
    const min = Math.min(contextBars, Math.floor(this.allCandles.length * 0.1));
    const max = Math.max(min + 5, this.allCandles.length - 20);
    const randomIndex = Math.floor(Math.random() * (max - min)) + min;
    return this.jumpToBar(randomIndex);
  }

  // Time boundaries
  getEarliestTime() {
    return this.allCandles.length > 0 ? this.allCandles[0].time : null;
  }

  getLatestTime() {
    return this.allCandles.length > 0 ? this.allCandles[this.allCandles.length - 1].time : null;
  }

  // Generate seamless continuous forward bars if remote data limit is reached
  generateContinuousBars(count = 100) {
    if (this.allCandles.length === 0) return 0;
    const lastBar = this.allCandles[this.allCandles.length - 1];
    const prevBar = this.allCandles.length > 1 ? this.allCandles[this.allCandles.length - 2] : null;
    const stepSec = prevBar ? Math.max(60, lastBar.time - prevBar.time) : 3600;

    let current = lastBar.close;
    const volatility = 0.007;
    const newBars = [];

    for (let i = 1; i <= count; i++) {
      const time = lastBar.time + i * stepSec;
      const open = current;
      const change = (Math.random() - 0.495) * 2 * volatility * open;
      const close = Math.max(open * 0.1, +(open + change).toFixed(2));
      const high = +(Math.max(open, close) + Math.random() * volatility * open * 0.8).toFixed(2);
      const low = +(Math.min(open, close) - Math.random() * volatility * open * 0.8).toFixed(2);
      const volume = Math.floor(Math.random() * 40000 + 5000);

      newBars.push({ time, open, high, low, close, volume });
      current = close;
    }

    return this.appendHistory(newBars);
  }

  // Step 1 bar or sub-tick forward
  stepForward(forceFullBar = false) {
    // 1. Check if we need to prefetch subsequent bars ahead of time
    const remaining = this.allCandles.length - this.currentIndex;
    if (this.isReplayActive && remaining <= this.prefetchThreshold) {
      if (typeof this.onNeedMoreBars === 'function') {
        this.onNeedMoreBars(remaining);
      }
    }

    // 2. Reached the end of loaded buffer: fetch or continue seamlessly without pausing
    if (this.currentIndex >= this.allCandles.length) {
      if (typeof this.onNeedMoreBars === 'function') {
        this.onNeedMoreBars(0);
        return null;
      }
      this.generateContinuousBars(50);
      return null;
    }

    if (!this.isIntraBarEnabled || forceFullBar) {
      // Full bar mode
      this.subTickIndex = -1;
      this.currentFormingBar = null;
      this.currentCandleTicks = null;

      const nextBar = this.allCandles[this.currentIndex];
      this.currentIndex++;

      const subTickInfo = {
        isSubTick: false,
        phase: 3,
        phaseName: 'close',
        phaseLabel: 'Закрытие',
        isNewBar: true,
        tickPrice: nextBar.close
      };

      if (this.onBarAdvance) {
        this.onBarAdvance(nextBar, this.currentIndex, this.allCandles.length, false, subTickInfo);
      }

      this._emitStateChange(subTickInfo);

      if (this.currentIndex >= this.allCandles.length) {
        if (typeof this.onNeedMoreBars === 'function') {
          this.onNeedMoreBars(0);
        } else {
          this.generateContinuousBars(50);
        }
      }

      return nextBar;
    }

    // Intra-bar sub-tick mode
    const targetCandle = this.allCandles[this.currentIndex];
    if (!this.currentCandleTicks || this.subTickIndex === -1) {
      this.currentCandleTicks = this.getIntraBarPhases(targetCandle);
      this.subTickIndex = 0;
    } else {
      this.subTickIndex++;
    }

    const currentTick = this.currentCandleTicks[this.subTickIndex];
    this.currentFormingBar = currentTick.bar;

    const subTickInfo = {
      isSubTick: true,
      phase: currentTick.phase,
      phaseName: currentTick.name,
      phaseLabel: currentTick.label,
      isNewBar: currentTick.isNewBar,
      tickPrice: currentTick.price
    };

    if (this.onBarAdvance) {
      this.onBarAdvance(
        this.currentFormingBar,
        this.currentIndex + 1,
        this.allCandles.length,
        false,
        subTickInfo
      );
    }

    // If we just completed the 4th tick (phase 3: Close), commit the bar
    if (this.subTickIndex >= 3) {
      this.currentIndex++;
      this.subTickIndex = -1;
      this.currentFormingBar = null;
      this.currentCandleTicks = null;

      if (this.currentIndex >= this.allCandles.length) {
        if (typeof this.onNeedMoreBars === 'function') {
          this.onNeedMoreBars(0);
        } else {
          this.generateContinuousBars(50);
        }
      }
    }

    this._emitStateChange(subTickInfo);
    return currentTick.bar;
  }

  // Step 1 bar backward
  stepBackward() {
    this.pause();

    // If a sub-tick was in progress, cancel the forming candle and reset to current completed bar
    if (this.subTickIndex >= 0) {
      this.subTickIndex = -1;
      this.currentFormingBar = null;
      this.currentCandleTicks = null;
      const currentBar = this.getCurrentBar();
      if (this.onBarAdvance && currentBar) {
        this.onBarAdvance(currentBar, this.currentIndex, this.allCandles.length, true, {
          isSubTick: false,
          phase: 3,
          phaseName: 'close',
          phaseLabel: 'Закрытие'
        });
      }
      this._emitStateChange();
      return currentBar;
    }

    if (this.currentIndex <= 5) return null;
    this.currentIndex--;
    this.subTickIndex = -1;
    this.currentFormingBar = null;
    this.currentCandleTicks = null;
    const currentBar = this.getCurrentBar();

    if (this.onBarAdvance && currentBar) {
      this.onBarAdvance(currentBar, this.currentIndex, this.allCandles.length, true, {
        isSubTick: false,
        phase: 3,
        phaseName: 'close',
        phaseLabel: 'Закрытие'
      });
    }

    this._emitStateChange();
    return currentBar;
  }

  // Play / Pause toggle
  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    if (this.isPlaying) return;
    if (this.currentIndex >= this.allCandles.length) {
      if (typeof this.onNeedMoreBars === 'function') {
        this.onNeedMoreBars(0);
      } else {
        this.generateContinuousBars(50);
      }
    }

    this.isPlaying = true;
    const intervalMs = this.isIntraBarEnabled
      ? Math.max(50, Math.round(this.speedMs / 4))
      : this.speedMs;

    this.playbackInterval = setInterval(() => {
      this.stepForward();
    }, intervalMs);

    this._emitStateChange();
  }

  pause() {
    if (!this.isPlaying && !this.playbackInterval) return;

    this.isPlaying = false;
    if (this.playbackInterval) {
      clearInterval(this.playbackInterval);
      this.playbackInterval = null;
    }

    this._emitStateChange();
  }

  // Change playback speed (in ms)
  setSpeed(speedVal) {
    this.speedMs = Number(speedVal) || 1000;
    if (this.isPlaying) {
      this.pause();
      this.play();
    }
  }

  // Get currently visible candles slice
  getVisibleCandles() {
    const slice = this.allCandles.slice(0, this.currentIndex);
    if (this.currentFormingBar && this.subTickIndex >= 0) {
      return [...slice, this.currentFormingBar];
    }
    return slice;
  }

  // Current bar
  getCurrentBar() {
    if (this.currentFormingBar && this.subTickIndex >= 0) {
      return this.currentFormingBar;
    }
    if (this.currentIndex <= 0 || this.allCandles.length === 0) return null;
    return this.allCandles[this.currentIndex - 1];
  }
}

// Export for browser & ES modules
if (typeof window !== 'undefined') {
  window.MarketSimulator = MarketSimulator;
}

export default MarketSimulator;
export { MarketSimulator };

// Market Simulator / Bar Replay Engine for Historical Trading
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

    // Listeners
    this.onBarAdvance = null;
    this.onStateChange = null;
    this.onNeedMoreBars = null;
  }

  // Load new dataset
  loadData(candles) {
    this.pause();
    this.allCandles = candles || [];
    this.currentIndex = this.allCandles.length;
    this.isReplayActive = false;
    this.canLoadMoreBars = true;

    if (this.onStateChange) {
      this.onStateChange({
        isReplayActive: this.isReplayActive,
        isPlaying: this.isPlaying,
        currentIndex: this.currentIndex,
        totalBars: this.allCandles.length
      });
    }

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

    if (this.onStateChange) {
      this.onStateChange({
        isReplayActive: this.isReplayActive,
        isPlaying: this.isPlaying,
        currentIndex: this.currentIndex,
        totalBars: this.allCandles.length
      });
    }

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

    if (this.onStateChange) {
      this.onStateChange({
        isReplayActive: this.isReplayActive,
        isPlaying: this.isPlaying,
        currentIndex: this.currentIndex,
        totalBars: this.allCandles.length
      });
    }

    return fresh.length;
  }

  // Activate Replay mode (cut candles at percentage or index)
  enableReplay(targetIndex = null) {
    if (this.allCandles.length === 0) return [];

    this.pause();
    this.isReplayActive = true;

    if (targetIndex !== null && targetIndex >= 5 && targetIndex <= this.allCandles.length) {
      this.currentIndex = targetIndex;
    } else {
      // Default: cut back 35% so there's plenty of room to simulate forward
      this.currentIndex = Math.max(15, Math.floor(this.allCandles.length * 0.65));
    }

    if (this.onStateChange) {
      this.onStateChange({
        isReplayActive: this.isReplayActive,
        isPlaying: this.isPlaying,
        currentIndex: this.currentIndex,
        totalBars: this.allCandles.length
      });
    }

    const currentBar = this.getCurrentBar();
    if (this.onBarAdvance && currentBar) {
      this.onBarAdvance(currentBar, this.currentIndex, this.allCandles.length, true);
    }

    // Check if subsequent bars should be prefetched in advance
    const remaining = this.allCandles.length - this.currentIndex;
    if (this.canLoadMoreBars && remaining <= this.prefetchThreshold && typeof this.onNeedMoreBars === 'function') {
      this.onNeedMoreBars(remaining);
    }

    return this.getVisibleCandles();
  }

  // Exit Replay mode and restore full historical chart
  disableReplay() {
    this.pause();
    this.isReplayActive = false;
    this.currentIndex = this.allCandles.length;

    if (this.onStateChange) {
      this.onStateChange({
        isReplayActive: this.isReplayActive,
        isPlaying: this.isPlaying,
        currentIndex: this.currentIndex,
        totalBars: this.allCandles.length
      });
    }

    const currentBar = this.getCurrentBar();
    if (this.onBarAdvance && currentBar) {
      this.onBarAdvance(currentBar, this.currentIndex, this.allCandles.length, true);
    }

    // Check if subsequent bars should be prefetched in advance
    const remaining = this.allCandles.length - this.currentIndex;
    if (this.canLoadMoreBars && remaining <= this.prefetchThreshold && typeof this.onNeedMoreBars === 'function') {
      this.onNeedMoreBars(remaining);
    }

    return this.getVisibleCandles();
  }

  // Jump to specific bar by time or index
  jumpToBar(timeOrIndex) {
    let index = -1;
    if (typeof timeOrIndex === 'number' && timeOrIndex > 1000000) {
      // It's a timestamp: find latest candle that opened at or before timeOrIndex
      for (let i = this.allCandles.length - 1; i >= 0; i--) {
        if (this.allCandles[i].time <= timeOrIndex) {
          index = i;
          break;
        }
      }
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

      if (this.onStateChange) {
        this.onStateChange({
          isReplayActive: this.isReplayActive,
          isPlaying: this.isPlaying,
          currentIndex: this.currentIndex,
          totalBars: this.allCandles.length
        });
      }

      const currentBar = this.getCurrentBar();
      if (this.onBarAdvance && currentBar) {
        this.onBarAdvance(currentBar, this.currentIndex, this.allCandles.length, true);
      }

      return this.getVisibleCandles();
    }
    return null;
  }

  // Jump to first available date/candle
  jumpToFirstBar() {
    if (this.allCandles.length === 0) return null;
    return this.jumpToBar(Math.min(15, this.allCandles.length - 1));
  }

  // Jump to a random historical bar for blind edge testing
  jumpToRandomBar() {
    if (this.allCandles.length === 0) return null;
    const min = Math.min(15, Math.floor(this.allCandles.length * 0.15));
    const max = Math.max(min + 5, Math.floor(this.allCandles.length * 0.8));
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

  // Step 1 bar forward
  stepForward() {
    // 1. Check if we need to prefetch subsequent bars ahead of time
    const remaining = this.allCandles.length - this.currentIndex;
    if (this.isReplayActive && this.canLoadMoreBars && remaining <= this.prefetchThreshold) {
      if (typeof this.onNeedMoreBars === 'function') {
        this.onNeedMoreBars(remaining);
      }
    }

    // 2. Reached the end of loaded buffer
    if (this.currentIndex >= this.allCandles.length) {
      if (this.canLoadMoreBars && typeof this.onNeedMoreBars === 'function') {
        // Trigger immediate fetch and do not stop replay
        this.onNeedMoreBars(0);
        return null;
      }
      this.pause();
      return null;
    }

    const nextBar = this.allCandles[this.currentIndex];
    this.currentIndex++;

    if (this.onBarAdvance) {
      this.onBarAdvance(nextBar, this.currentIndex, this.allCandles.length, false);
    }

    if (this.onStateChange) {
      this.onStateChange({
        isReplayActive: this.isReplayActive,
        isPlaying: this.isPlaying,
        currentIndex: this.currentIndex,
        totalBars: this.allCandles.length
      });
    }

    if (this.currentIndex >= this.allCandles.length) {
      if (this.canLoadMoreBars && typeof this.onNeedMoreBars === 'function') {
        this.onNeedMoreBars(0);
      } else {
        this.pause();
      }
    }

    return nextBar;
  }

  // Step 1 bar backward
  stepBackward() {
    if (this.currentIndex <= 5) return null;
    this.pause();
    this.currentIndex--;
    const currentBar = this.getCurrentBar();

    if (this.onBarAdvance) {
      this.onBarAdvance(currentBar, this.currentIndex, this.allCandles.length, true);
    }

    if (this.onStateChange) {
      this.onStateChange({
        isReplayActive: this.isReplayActive,
        isPlaying: this.isPlaying,
        currentIndex: this.currentIndex,
        totalBars: this.allCandles.length
      });
    }

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
      if (this.canLoadMoreBars && typeof this.onNeedMoreBars === 'function') {
        this.onNeedMoreBars(0);
      } else {
        // Only if truly at the end of available history
        this.currentIndex = Math.max(15, Math.floor(this.allCandles.length * 0.65));
      }
    }

    this.isPlaying = true;
    this.playbackInterval = setInterval(() => {
      this.stepForward();
    }, this.speedMs);

    if (this.onStateChange) {
      this.onStateChange({
        isReplayActive: this.isReplayActive,
        isPlaying: this.isPlaying,
        currentIndex: this.currentIndex,
        totalBars: this.allCandles.length
      });
    }
  }

  pause() {
    if (!this.isPlaying && !this.playbackInterval) return;

    this.isPlaying = false;
    if (this.playbackInterval) {
      clearInterval(this.playbackInterval);
      this.playbackInterval = null;
    }

    if (this.onStateChange) {
      this.onStateChange({
        isReplayActive: this.isReplayActive,
        isPlaying: this.isPlaying,
        currentIndex: this.currentIndex,
        totalBars: this.allCandles.length
      });
    }
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
    return this.allCandles.slice(0, this.currentIndex);
  }

  // Current bar
  getCurrentBar() {
    if (this.currentIndex <= 0 || this.allCandles.length === 0) return null;
    return this.allCandles[this.currentIndex - 1];
  }
}

// Export for browser
window.MarketSimulator = MarketSimulator;

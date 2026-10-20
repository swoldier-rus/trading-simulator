// components/replay-bar.js - Floating Replay Transport Bar & Date Picker Component
import { eventBus } from '../core/event-bus.js';
import { API } from '../api.js';
import { marketDataService } from '../services/market-data.service.js';
import { formatTimestamp, timeframeToSeconds, showToast } from '../core/utils.js';

export class ReplayBarComponent {
  constructor(store) {
    this.store = store;

    // Header buttons
    this.btnToggleReplay = document.getElementById('btnToggleReplay');
    this.btnToggleReplayMenu = document.getElementById('btnToggleReplayMenu');
    this.btnReplayText = document.getElementById('btnReplayText');

    // Floating bar elements
    this.floatingReplayBar = document.getElementById('floatingReplayBar');
    this.btnReplayPlay = document.getElementById('btnReplayPlay');
    this.btnReplayStep = document.getElementById('btnReplayStep');
    this.btnReplayStepBack = document.getElementById('btnReplayStepBack');
    this.btnReplayStartPoint = document.getElementById('btnReplayStartPoint');
    this.btnToggleIntraBar = document.getElementById('btnToggleIntraBar');
    this.replaySpeedSelect = document.getElementById('replaySpeedSelect');
    this.replayScrubSlider = document.getElementById('replayScrubSlider');
    this.replayInfoText = document.getElementById('replayInfoText');
    this.replayTimeText = document.getElementById('replayTimeText');
    this.btnExitReplay = document.getElementById('btnExitReplay');

    // Start point popup menu
    this.startPointMenu = document.getElementById('startPointMenu');
    this.optStartBar = document.getElementById('optStartBar');
    this.optStartDate = document.getElementById('optStartDate');
    this.optStartFirstDate = document.getElementById('optStartFirstDate');
    this.optStartRandomBar = document.getElementById('optStartRandomBar');

    // Date Picker Modal
    this.datePickerModal = document.getElementById('datePickerModal');
    this.btnCloseDatePicker = document.getElementById('btnCloseDatePicker');
    this.btnCancelDatePicker = document.getElementById('btnCancelDatePicker');
    this.btnApplyDatePicker = document.getElementById('btnApplyDatePicker');
    this.inputJumpDate = document.getElementById('inputJumpDate');
    this.inputJumpTime = document.getElementById('inputJumpTime');
    this.datePickerRangeInfo = document.getElementById('datePickerRangeInfo');
    this.btnQuickEarliest = document.getElementById('btnQuickEarliest');
    this.btnQuickMonthAgo = document.getElementById('btnQuickMonthAgo');
    this.btnQuickWeekAgo = document.getElementById('btnQuickWeekAgo');
    this.btnQuickLatest = document.getElementById('btnQuickLatest');

    this.chartEl = document.getElementById('chart');

    this.init();
  }

  init() {
    this.initHeaderToggle();
    this.initTransportControls();
    this.initStartPointMenu();
    this.initDatePickerModal();
    this.initDragAndDrop();

    // Close startPointMenu on outside click
    document.addEventListener('click', (e) => {
      if (this.startPointMenu &&
          !this.startPointMenu.contains(e.target) &&
          !this.btnToggleReplayMenu.contains(e.target) &&
          (!this.btnReplayStartPoint || !this.btnReplayStartPoint.contains(e.target))) {
        this.startPointMenu.style.display = 'none';
      }
    });

    eventBus.on('replay:ui-update', ({ index, total, time, isPlaying, subTickInfo }) => {
      this.updateReadouts(index, total, time, isPlaying, subTickInfo);
    });

    eventBus.on('replay:state-change', (isActive) => {
      this.updateStateView(isActive);
    });
  }

  initHeaderToggle() {
    if (!this.btnToggleReplay) return;
    this.btnToggleReplay.onclick = () => {
      const simulator = this.store.simulator;
      if (!simulator) return;

      if (simulator.isReplayActive) {
        simulator.disableReplay();
        const mainSeries = this.store.mainSeries;
        if (mainSeries) mainSeries.setData(simulator.allCandles);
        if (this.store.chart) this.store.chart.fitContent();
      } else {
        simulator.enableReplay();
      }
    };

    if (this.btnToggleReplayMenu) {
      this.btnToggleReplayMenu.onclick = (e) => {
        e.stopPropagation();
        const rect = this.btnToggleReplayMenu.getBoundingClientRect();
        this.startPointMenu.style.top = `${rect.bottom + 6}px`;
        this.startPointMenu.style.left = `${rect.left - 100}px`;
        this.startPointMenu.style.display = this.startPointMenu.style.display === 'none' ? 'block' : 'none';
      };
    }
  }

  initTransportControls() {
    if (this.btnReplayPlay) {
      this.btnReplayPlay.onclick = () => {
        if (this.store.simulator) this.store.simulator.togglePlay();
      };
    }

    if (this.btnReplayStep) {
      this.btnReplayStep.onclick = () => {
        if (this.store.simulator) this.store.simulator.stepForward();
      };
    }

    if (this.btnReplayStepBack) {
      this.btnReplayStepBack.onclick = () => {
        if (this.store.simulator) this.store.simulator.stepBackward();
      };
    }

    if (this.btnToggleIntraBar) {
      this.btnToggleIntraBar.onclick = () => {
        const simulator = this.store.simulator;
        if (!simulator) return;
        const newMode = !simulator.isIntraBarEnabled;
        simulator.setIntraBarMode(newMode);
        this.btnToggleIntraBar.classList.toggle('active', newMode);
        const textSpan = this.btnToggleIntraBar.querySelector('.ticks-text');
        if (textSpan) {
          textSpan.textContent = newMode ? 'Тики: ВКЛ' : 'Тики: ВЫКЛ';
        }
        showToast(
          newMode
            ? 'Внутрибарная симуляция включена (4 фазы: Открытие, Тень, Пик, Закрытие)'
            : 'Внутрибарная симуляция выключена (побарный режим)',
          'info'
        );
      };
    }

    if (this.btnExitReplay) {
      this.btnExitReplay.onclick = () => {
        const simulator = this.store.simulator;
        if (!simulator) return;
        simulator.disableReplay();
        const mainSeries = this.store.mainSeries;
        if (mainSeries) mainSeries.setData(simulator.allCandles);
        if (this.store.chart) this.store.chart.fitContent();
      };
    }

    if (this.replaySpeedSelect) {
      this.replaySpeedSelect.onchange = (e) => {
        if (this.store.simulator) this.store.simulator.setSpeed(Number(e.target.value));
      };
    }

    if (this.replayScrubSlider) {
      this.replayScrubSlider.oninput = (e) => {
        const simulator = this.store.simulator;
        if (!simulator) return;
        const val = Number(e.target.value);
        const targetIdx = Math.floor((val / 100) * simulator.allCandles.length);
        simulator.jumpToBar(targetIdx);
        eventBus.emit('replay:scrubbed');
      };
    }
  }

  initStartPointMenu() {
    if (this.btnReplayStartPoint) {
      this.btnReplayStartPoint.onclick = (e) => {
        e.stopPropagation();
        const rect = this.btnReplayStartPoint.getBoundingClientRect();
        this.startPointMenu.style.top = `${rect.bottom + 6}px`;
        this.startPointMenu.style.left = `${rect.left}px`;
        this.startPointMenu.style.display = this.startPointMenu.style.display === 'none' ? 'block' : 'none';
      };
    }

    if (this.optStartBar) {
      this.optStartBar.onclick = () => {
        this.startPointMenu.style.display = 'none';
        this.store.set('isSelectingJumpBar', true);
        if (this.chartEl) this.chartEl.style.cursor = 'crosshair';
        if (this.btnReplayStartPoint) this.btnReplayStartPoint.classList.add('active');
        showToast('Кликните на любую свечу на графике, чтобы начать симуляцию с этого момента', 'info');
      };
    }

    if (this.optStartDate) {
      this.optStartDate.onclick = () => {
        this.startPointMenu.style.display = 'none';
        this.openDatePickerModal();
      };
    }

    if (this.optStartFirstDate) {
      this.optStartFirstDate.onclick = () => {
        this.startPointMenu.style.display = 'none';
        if (this.store.simulator) {
          this.store.simulator.jumpToFirstBar();
          showToast('Симуляция начата с первой доступной даты истории', 'success');
        }
      };
    }

    if (this.optStartRandomBar) {
      this.optStartRandomBar.onclick = () => {
        this.startPointMenu.style.display = 'none';
        if (this.store.simulator) {
          this.store.simulator.jumpToRandomBar();
          showToast('Выбран случайный момент истории для слепого теста стратегии!', 'success');
        }
      };
    }
  }

  initDatePickerModal() {
    if (!this.datePickerModal) return;

    if (this.btnCloseDatePicker) {
      this.btnCloseDatePicker.onclick = () => this.datePickerModal.classList.remove('open');
    }
    if (this.btnCancelDatePicker) {
      this.btnCancelDatePicker.onclick = () => this.datePickerModal.classList.remove('open');
    }

    if (this.btnApplyDatePicker) {
      this.btnApplyDatePicker.onclick = async () => {
        await this.handleApplyDatePicker();
      };
    }

    if (this.btnQuickEarliest) {
      this.btnQuickEarliest.onclick = () => {
        const sim = this.store.simulator;
        const t = sim ? sim.getEarliestTime() : null;
        if (t && this.inputJumpDate) {
          const d = new Date(t * 1000);
          this.inputJumpDate.value = d.toISOString().split('T')[0];
        }
      };
    }

    if (this.btnQuickLatest) {
      this.btnQuickLatest.onclick = () => {
        const sim = this.store.simulator;
        const t = sim ? sim.getLatestTime() : null;
        if (t && this.inputJumpDate) {
          const d = new Date(t * 1000);
          this.inputJumpDate.value = d.toISOString().split('T')[0];
        }
      };
    }

    if (this.btnQuickWeekAgo) {
      this.btnQuickWeekAgo.onclick = () => {
        const sim = this.store.simulator;
        const cur = sim ? sim.getCurrentBar() : null;
        const t = cur ? cur.time : (sim ? sim.getLatestTime() : null);
        if (t && this.inputJumpDate) {
          const d = new Date((t - 7 * 86400) * 1000);
          this.inputJumpDate.value = d.toISOString().split('T')[0];
        }
      };
    }

    if (this.btnQuickMonthAgo) {
      this.btnQuickMonthAgo.onclick = () => {
        const sim = this.store.simulator;
        const cur = sim ? sim.getCurrentBar() : null;
        const t = cur ? cur.time : (sim ? sim.getLatestTime() : null);
        if (t && this.inputJumpDate) {
          const d = new Date((t - 30 * 86400) * 1000);
          this.inputJumpDate.value = d.toISOString().split('T')[0];
        }
      };
    }
  }

  openDatePickerModal() {
    const simulator = this.store.simulator;
    if (!simulator) return;
    const earliest = simulator.getEarliestTime();
    const latest = simulator.getLatestTime();

    if (earliest && latest && this.datePickerRangeInfo) {
      this.datePickerRangeInfo.innerHTML = `Загружено: <b>${formatTimestamp(earliest)}</b> — <b>${formatTimestamp(latest)}</b><br><span style="color: var(--tv-text-muted); font-size: 11px;">(Любая выбранная дата автоматически подгрузит историю с биржи)</span>`;
      const currentBar = simulator.getCurrentBar();
      const refTime = currentBar ? currentBar.time : latest;
      const d = new Date(refTime * 1000);
      if (this.inputJumpDate) this.inputJumpDate.value = d.toISOString().split('T')[0];
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      if (this.inputJumpTime) this.inputJumpTime.value = `${hh}:${mm}`;
    }

    if (this.datePickerModal) this.datePickerModal.classList.add('open');
  }

  async handleApplyDatePicker() {
    const dateStr = this.inputJumpDate ? this.inputJumpDate.value : '';
    const timeStr = this.inputJumpTime ? this.inputJumpTime.value || '10:00' : '10:00';

    if (!dateStr) {
      showToast('Пожалуйста, выберите дату', 'error');
      return;
    }

    const [hours, minutes] = timeStr.split(':');
    const targetDate = new Date(dateStr);
    targetDate.setHours(Number(hours) || 10, Number(minutes) || 0, 0, 0);

    const targetSec = Math.floor(targetDate.getTime() / 1000);
    if (this.datePickerModal) this.datePickerModal.classList.remove('open');

    const simulator = this.store.simulator;
    const mainSeries = this.store.mainSeries;
    const chart = this.store.chart;

    if (!simulator) return;
    const earliest = simulator.getEarliestTime();
    const latest = simulator.getLatestTime();

    if (earliest && latest && targetSec >= earliest && targetSec <= latest) {
      const res = simulator.jumpToBar(targetSec);
      if (res) {
        if (mainSeries) mainSeries.setData(simulator.getVisibleCandles());
        if (chart) chart.fitContent();
        eventBus.emit('replay:scrubbed');
        showToast(`Перешли к дате: ${formatTimestamp(targetSec)}`, 'success');
        return;
      }
    }

    showToast(`Загрузка котировок за ${formatTimestamp(targetSec)}...`, 'info');

    const tf = this.store.get('currentTimeframe');
    const step = timeframeToSeconds(tf);
    const toSec = targetSec + Math.max(350 * step, 7 * 86400);

    try {
      const data = await marketDataService.getCandles(this.store.get('currentSymbol'), this.store.get('currentFigi'), tf, 1000, toSec);
      if (data && data.candles && data.candles.length > 0) {
        const newEarliest = data.candles[0].time;
        const newLatest = data.candles[data.candles.length - 1].time;

        if (earliest && newLatest >= earliest && newEarliest < earliest) {
          simulator.prependHistory(data.candles);
        } else {
          simulator.loadData(data.candles);
        }

        simulator.jumpToBar(targetSec);
        if (mainSeries) {
          mainSeries.setData(simulator.getVisibleCandles());
          if (chart) chart.fitContent();
        }
        eventBus.emit('replay:scrubbed');
        showToast(`История загружена! Перешли к дате: ${formatTimestamp(targetSec)}`, 'success');
      } else {
        showToast('По выбранной дате котировки не найдены на бирже', 'error');
      }
    } catch (err) {
      console.error('Error fetching date candles:', err);
      showToast('Ошибка загрузки данных за указанную дату', 'error');
    }
  }

  updateReadouts(index, total, time, isPlaying, subTickInfo = null) {
    if (this.replayInfoText) {
      this.replayInfoText.textContent = `${index} / ${total}`;
    }
    if (this.replayScrubSlider && total > 0) {
      this.replayScrubSlider.value = Math.round((index / total) * 100);
    }
    if (this.replayTimeText) {
      this.replayTimeText.textContent = formatTimestamp(time);
    }
    if (this.btnReplayPlay) {
      this.btnReplayPlay.textContent = isPlaying ? '⏸' : '▶';
      this.btnReplayPlay.title = isPlaying ? 'Пауза (Пробел)' : 'Старт (Пробел)';
    }

    // Sync toggle button state
    if (this.btnToggleIntraBar) {
      const isTicks = !!this.store.simulator?.isIntraBarEnabled;
      this.btnToggleIntraBar.classList.toggle('active', isTicks);
      const textSpan = this.btnToggleIntraBar.querySelector('.ticks-text');
      if (textSpan) {
        textSpan.textContent = isTicks ? 'Тики: ВКЛ' : 'Тики: ВЫКЛ';
      }
    }
  }

  updateStateView(isActive) {
    if (this.floatingReplayBar) {
      this.floatingReplayBar.style.display = isActive ? 'flex' : 'none';
      if (isActive) {
        this.clampPositionInBounds();
      }
    }
    if (this.btnToggleReplay) {
      this.btnToggleReplay.classList.toggle('active', isActive);
    }
    if (this.btnReplayText) {
      this.btnReplayText.textContent = isActive ? 'Симулятор ВКЛ' : 'Симулятор (История)';
    }
  }

  // --- Modern Drag & Drop for Floating Replay Toolbar ---
  initDragAndDrop() {
    if (!this.floatingReplayBar) return;

    this.dragHandle = document.getElementById('replayDragHandle');

    // Restore saved position from localStorage
    this.restoreSavedPosition();

    let dragState = null;

    const onPointerDown = (e) => {
      if (e.button !== 0) return; // Only primary mouse button

      // Ignore clicks on interactive controls inside the toolbar
      if (e.target.closest('button, select, input, .replay-control-btn, .replay-exit-btn, .replay-speed-select, .replay-slider')) {
        return;
      }

      e.preventDefault();

      const bar = this.floatingReplayBar;
      const parent = bar.parentElement;
      if (!parent) return;

      const barRect = bar.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();

      // Current position relative to parent workspace
      const currentLeft = barRect.left - parentRect.left;
      const currentTop = barRect.top - parentRect.top;

      try {
        (this.dragHandle || bar).setPointerCapture(e.pointerId);
      } catch (err) {}

      dragState = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        initialLeft: currentLeft,
        initialTop: currentTop,
        barWidth: barRect.width,
        barHeight: barRect.height,
        parentWidth: parentRect.width,
        parentHeight: parentRect.height
      };

      bar.classList.add('dragging');

      const onPointerMove = (ev) => {
        if (!dragState) return;
        ev.preventDefault();

        const deltaX = ev.clientX - dragState.startX;
        const deltaY = ev.clientY - dragState.startY;

        let newLeft = dragState.initialLeft + deltaX;
        let newTop = dragState.initialTop + deltaY;

        // Boundaries: keep toolbar safely inside workspace with 8px margin
        const minX = 8;
        const maxX = dragState.parentWidth - dragState.barWidth - 8;
        const minY = 8;
        const maxY = dragState.parentHeight - dragState.barHeight - 8;

        newLeft = Math.max(minX, Math.min(maxX, newLeft));
        newTop = Math.max(minY, Math.min(maxY, newTop));

        bar.style.left = `${newLeft}px`;
        bar.style.top = `${newTop}px`;
        bar.style.transform = 'none';
      };

      const onPointerUp = (ev) => {
        if (!dragState) return;

        bar.classList.remove('dragging');

        try {
          const capEl = this.dragHandle || bar;
          if (capEl.hasPointerCapture && capEl.hasPointerCapture(dragState.pointerId)) {
            capEl.releasePointerCapture(dragState.pointerId);
          }
        } catch (err) {}

        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);

        // Save position in localStorage
        const barRect = bar.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();
        const savedPos = {
          left: Math.round(barRect.left - parentRect.left),
          top: Math.round(barRect.top - parentRect.top)
        };
        try {
          localStorage.setItem('trading_simulator_replay_pos', JSON.stringify(savedPos));
        } catch (e) {}

        dragState = null;
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    };

    // Attach pointerdown to toolbar
    this.floatingReplayBar.addEventListener('pointerdown', onPointerDown);

    // Double-click to reset position back to center
    const resetPosition = (e) => {
      e.stopPropagation();
      this.floatingReplayBar.style.left = '50%';
      this.floatingReplayBar.style.top = '16px';
      this.floatingReplayBar.style.transform = 'translateX(-50%)';
      try {
        localStorage.removeItem('trading_simulator_replay_pos');
      } catch (err) {}
      showToast('Положение панели симулятора сброшено по центру', 'info');
    };

    if (this.dragHandle) {
      this.dragHandle.addEventListener('dblclick', resetPosition);
    }
    this.floatingReplayBar.addEventListener('dblclick', (e) => {
      if (e.target.closest('button, select, input, .replay-control-btn, .replay-exit-btn, .replay-speed-select, .replay-slider')) return;
      resetPosition(e);
    });

    // Keep toolbar in bounds on window resize
    window.addEventListener('resize', () => {
      this.clampPositionInBounds();
    });
  }

  restoreSavedPosition() {
    try {
      const saved = localStorage.getItem('trading_simulator_replay_pos');
      if (saved && this.floatingReplayBar) {
        const pos = JSON.parse(saved);
        if (typeof pos.left === 'number' && typeof pos.top === 'number') {
          this.floatingReplayBar.style.left = `${pos.left}px`;
          this.floatingReplayBar.style.top = `${pos.top}px`;
          this.floatingReplayBar.style.transform = 'none';
        }
      }
    } catch (e) {}
  }

  clampPositionInBounds() {
    if (!this.floatingReplayBar || this.floatingReplayBar.style.display === 'none') return;
    const parent = this.floatingReplayBar.parentElement;
    if (!parent) return;

    const parentRect = parent.getBoundingClientRect();
    const barRect = this.floatingReplayBar.getBoundingClientRect();

    if (barRect.width === 0 || parentRect.width === 0) return;

    let left = barRect.left - parentRect.left;
    let top = barRect.top - parentRect.top;

    const minX = 8;
    const maxX = parentRect.width - barRect.width - 8;
    const minY = 8;
    const maxY = parentRect.height - barRect.height - 8;

    if (left < minX || left > maxX || top < minY || top > maxY) {
      left = Math.max(minX, Math.min(maxX, left));
      top = Math.max(minY, Math.min(maxY, top));
      this.floatingReplayBar.style.left = `${left}px`;
      this.floatingReplayBar.style.top = `${top}px`;
      this.floatingReplayBar.style.transform = 'none';
    }
  }
}

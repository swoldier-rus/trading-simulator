// components/chart-zoom-controller.js - TradingView-Style Box Zoom In & Zoom Out Tool
import { eventBus } from '../core/event-bus.js';
import { showToast } from '../core/utils.js';

export class ChartZoomController {
  constructor(store) {
    this.store = store;
    this.chartEl = document.getElementById('chart');
    this.chartContainer = this.chartEl ? this.chartEl.parentElement : null;
    this.zoomBoxOverlay = document.getElementById('chartZoomBoxOverlay');
    this.btnZoomIn = document.getElementById('toolZoomIn');
    this.btnZoomOut = document.getElementById('toolZoomOut');

    this.isToolActive = false;
    this.isDragging = false;
    this.dragStart = null; // { x, y, clientX, clientY, pointerId }
    this.zoomHistory = []; // Stack of { logicalRange, priceRange, isAutoScale, rightOffset, barSpacing }
    this.MIN_DRAG_PIXELS = 10;

    this.init();
  }

  init() {
    if (this.btnZoomOut) {
      this.btnZoomOut.onclick = (e) => {
        e.stopPropagation();
        this.zoomOut();
      };
    }

    if (this.chartContainer) {
      // 1. Capture pointerdown to initiate box zoom
      this.chartContainer.addEventListener('pointerdown', (e) => this.onPointerDown(e), { capture: true });

      // 2. Track pointermove during zoom drag
      window.addEventListener('pointermove', (e) => this.onPointerMove(e), { capture: true });

      // 3. Complete zoom on pointerup
      window.addEventListener('pointerup', (e) => this.onPointerUp(e), { capture: true });
      window.addEventListener('pointercancel', () => this.cancelDrag(), { capture: true });
    }

    // 4. Escape key cancels drag or deactivates tool
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.isDragging) {
          e.preventDefault();
          e.stopPropagation();
          this.cancelDrag();
        } else if (this.isToolActive) {
          e.preventDefault();
          e.stopPropagation();
          this.deactivateTool();
        }
      }
    });

    // 5. Clear history when instrument changes or full scale is reset
    eventBus.on('symbol:change', () => this.clearHistory());
    eventBus.on('chart:reset_state_for_new_instrument', () => this.clearHistory());
    eventBus.on('chart:reset_state_preserving_zoom', () => this.clearHistory());
    eventBus.on('tool:reset', () => {
      if (this.isToolActive) {
        this.deactivateTool();
      }
    });
  }

  isZoomActive() {
    return this.isToolActive || this.isDragging;
  }

  activateTool() {
    this.isToolActive = true;
    if (this.btnZoomIn) this.btnZoomIn.classList.add('active');
    if (this.chartEl) this.chartEl.style.cursor = 'zoom-in';

    // FSM integration
    if (this.store.fsm && typeof this.store.fsm.startDrawing === 'function') {
      this.store.fsm.startDrawing('zoom-in');
    }

    // Disable any active drawing tool in DrawingController
    if (this.store.drawingController && typeof this.store.drawingController.setTool === 'function') {
      if (this.store.drawingController.activeTool() !== null) {
        this.store.drawingController.setTool(null);
      }
    }
  }

  deactivateTool() {
    if (!this.isToolActive) return;
    this.isToolActive = false;
    if (this.btnZoomIn) this.btnZoomIn.classList.remove('active');
    if (this.chartEl) this.chartEl.style.cursor = 'default';

    // FSM integration
    if (this.store.fsm && typeof this.store.fsm.finishDrawing === 'function') {
      this.store.fsm.finishDrawing();
    }

    // Highlight cursor button in drawing rail
    if (this.store.drawingRail && typeof this.store.drawingRail.resetToCursor === 'function') {
      this.store.drawingRail.resetToCursor();
    }
  }

  onPointerDown(e) {
    if (!this.chartEl || !this.chartContainer) return;

    // Only respond to main left mouse button / touch
    if (e.button !== 0) return;

    // Trigger if tool is explicitly active OR if user holds Shift (TradingView quick gesture)
    const isZoomIntent = this.isToolActive || e.shiftKey;
    if (!isZoomIntent) return;

    const rect = this.chartContainer.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;

    // Do not initiate zoom if clicked directly on time or price scales
    const priceScaleWidth = 65;
    const timeScaleHeight = 26;
    if (localX >= rect.width - priceScaleWidth || localY >= rect.height - timeScaleHeight) {
      return;
    }

    // Intercept event to prevent chart panning or drawing placement
    e.stopPropagation();
    e.stopImmediatePropagation();
    e.preventDefault();

    this.isDragging = true;
    this.dragStart = {
      clientX: e.clientX,
      clientY: e.clientY,
      x: localX,
      y: localY,
      pointerId: e.pointerId
    };

    if (this.zoomBoxOverlay) {
      this.zoomBoxOverlay.style.left = `${Math.round(localX)}px`;
      this.zoomBoxOverlay.style.top = `${Math.round(localY)}px`;
      this.zoomBoxOverlay.style.width = '0px';
      this.zoomBoxOverlay.style.height = '0px';
      this.zoomBoxOverlay.style.display = 'block';
    }

    try {
      this.chartContainer.setPointerCapture(e.pointerId);
    } catch {}
  }

  onPointerMove(e) {
    if (!this.isDragging || !this.dragStart || !this.chartContainer) return;

    e.stopPropagation();
    e.stopImmediatePropagation();

    const rect = this.chartContainer.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const currentY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    const left = Math.min(this.dragStart.x, currentX);
    const top = Math.min(this.dragStart.y, currentY);
    const width = Math.abs(currentX - this.dragStart.x);
    const height = Math.abs(currentY - this.dragStart.y);

    if (this.zoomBoxOverlay) {
      this.zoomBoxOverlay.style.left = `${Math.round(left)}px`;
      this.zoomBoxOverlay.style.top = `${Math.round(top)}px`;
      this.zoomBoxOverlay.style.width = `${Math.round(width)}px`;
      this.zoomBoxOverlay.style.height = `${Math.round(height)}px`;
    }
  }

  onPointerUp(e) {
    if (!this.isDragging || !this.dragStart || !this.chartContainer) return;

    e.stopPropagation();
    e.stopImmediatePropagation();

    const rect = this.chartContainer.getBoundingClientRect();
    const endX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const endY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    const startX = this.dragStart.x;
    const startY = this.dragStart.y;
    const pointerId = this.dragStart.pointerId;

    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    this.isDragging = false;
    this.dragStart = null;

    if (this.zoomBoxOverlay) {
      this.zoomBoxOverlay.style.display = 'none';
      this.zoomBoxOverlay.style.width = '0px';
      this.zoomBoxOverlay.style.height = '0px';
    }

    try {
      if (pointerId !== undefined) {
        this.chartContainer.releasePointerCapture(pointerId);
      }
    } catch {}

    // Threshold check (10px): ignore accidental micro-clicks
    if (width >= this.MIN_DRAG_PIXELS && height >= this.MIN_DRAG_PIXELS) {
      this.applyZoomBox(startX, startY, endX, endY);
    }

    // Single-use: automatically return to standard cursor
    if (this.isToolActive) {
      this.deactivateTool();
    }
  }

  cancelDrag() {
    if (!this.isDragging) return;

    const pointerId = this.dragStart?.pointerId;
    this.isDragging = false;
    this.dragStart = null;

    if (this.zoomBoxOverlay) {
      this.zoomBoxOverlay.style.display = 'none';
      this.zoomBoxOverlay.style.width = '0px';
      this.zoomBoxOverlay.style.height = '0px';
    }

    try {
      if (pointerId !== undefined && this.chartContainer) {
        this.chartContainer.releasePointerCapture(pointerId);
      }
    } catch {}
  }

  applyZoomBox(x1, y1, x2, y2) {
    const chart = this.store.chart;
    if (!chart) return;

    const ts = chart._timeScale || (typeof chart.timeScale === 'function' ? chart.timeScale() : chart.timeScale);
    if (!ts) return;

    const panes = typeof chart.panes === 'function' ? chart.panes() : (Array.isArray(chart._panes) ? chart._panes : (chart._panes?.values ? Array.from(chart._panes.values()) : []));
    const pane = panes[0] || null;
    const scales = pane && typeof pane.scales === 'function' ? pane.scales() : [];
    const scale = scales[0] || null;

    // 1. Capture current viewport state to zoomHistory
    const currentLogicalRange = chart.getVisibleLogicalRange();
    const currentPriceRange = scale && typeof scale.priceRange === 'function' ? scale.priceRange() : null;
    const isAutoScale = this.store.chartController ? this.store.chartController.isPriceAutoScaleEnabled() : true;

    this.zoomHistory.push({
      logicalRange: currentLogicalRange ? { ...currentLogicalRange } : null,
      priceRange: currentPriceRange ? { ...currentPriceRange } : null,
      isAutoScale,
      rightOffset: ts.rightOffset,
      barSpacing: ts.barSpacing
    });

    this.updateZoomOutButton();

    // 2. Compute and apply horizontal logical range
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);

    let fromIdx = null;
    let toIdx = null;

    if (typeof ts.xToIndex === 'function') {
      fromIdx = ts.xToIndex(minX);
      toIdx = ts.xToIndex(maxX);
    } else if (typeof chart.coordinateToTime === 'function' && chart._dataLayer) {
      const t1 = chart.coordinateToTime(minX);
      const t2 = chart.coordinateToTime(maxX);
      fromIdx = chart._dataLayer.timeToIndex(t1);
      toIdx = chart._dataLayer.timeToIndex(t2);
    }

    if (Number.isFinite(fromIdx) && Number.isFinite(toIdx) && toIdx > fromIdx) {
      chart.setVisibleLogicalRange({ from: fromIdx, to: toIdx });
    }

    // 3. Compute and apply vertical price range
    let p1 = null;
    let p2 = null;

    if (typeof chart.coordinateToPrice === 'function') {
      p1 = chart.coordinateToPrice(y1);
      p2 = chart.coordinateToPrice(y2);
    } else if (scale && typeof scale.yToPrice === 'function') {
      p1 = scale.yToPrice(y1);
      p2 = scale.yToPrice(y2);
    }

    if (Number.isFinite(p1) && Number.isFinite(p2) && p1 !== p2 && scale) {
      const minPrice = Math.min(p1, p2);
      const maxPrice = Math.max(p1, p2);

      if (typeof scale.setAutoScale === 'function') {
        scale.setAutoScale(false);
      }
      if (typeof scale.setPriceRange === 'function') {
        scale.setPriceRange({ min: minPrice, max: maxPrice });
      }
    }

    // 4. Invalidate and repaint canvas
    if (typeof chart.invalidate === 'function') {
      chart.invalidate(e => e.invalidateGlobal(3));
    }

    // 5. Synchronize all overlays (trade lines, executions, session breaks)
    if (this.store.chartController && typeof this.store.chartController.syncAllOverlays === 'function') {
      this.store.chartController.syncAllOverlays();
    }

    eventBus.emit('chart:zoom');
  }

  zoomOut() {
    if (this.zoomHistory.length === 0) return;

    const chart = this.store.chart;
    if (!chart) return;

    const prev = this.zoomHistory.pop();
    this.updateZoomOutButton();

    if (!prev) return;

    const ts = chart._timeScale || (typeof chart.timeScale === 'function' ? chart.timeScale() : chart.timeScale);
    const panes = typeof chart.panes === 'function' ? chart.panes() : (Array.isArray(chart._panes) ? chart._panes : (chart._panes?.values ? Array.from(chart._panes.values()) : []));
    const pane = panes[0] || null;
    const scales = pane && typeof pane.scales === 'function' ? pane.scales() : [];
    const scale = scales[0] || null;

    // 1. Restore horizontal range
    if (prev.logicalRange && typeof chart.setVisibleLogicalRange === 'function') {
      chart.setVisibleLogicalRange(prev.logicalRange);
    } else if (ts) {
      if (typeof ts.setRightOffset === 'function' && prev.rightOffset !== undefined) {
        ts.setRightOffset(prev.rightOffset);
      }
      if (typeof ts.setBarSpacing === 'function' && prev.barSpacing !== undefined) {
        ts.setBarSpacing(prev.barSpacing);
      }
    }

    // 2. Restore vertical scale
    if (scale) {
      if (prev.isAutoScale) {
        if (typeof scale.setAutoScale === 'function') scale.setAutoScale(true);
      } else if (prev.priceRange) {
        if (typeof scale.setAutoScale === 'function') scale.setAutoScale(false);
        if (typeof scale.setPriceRange === 'function') scale.setPriceRange(prev.priceRange);
      }
    }

    // 3. Invalidate & repaint
    if (typeof chart.invalidate === 'function') {
      chart.invalidate(e => e.invalidateGlobal(3));
    }

    // 4. Synchronize overlays
    if (this.store.chartController && typeof this.store.chartController.syncAllOverlays === 'function') {
      this.store.chartController.syncAllOverlays();
    }

    showToast('Масштаб уменьшен', 'info');
    eventBus.emit('chart:zoom');
  }

  clearHistory() {
    this.zoomHistory = [];
    this.updateZoomOutButton();
  }

  updateZoomOutButton() {
    if (!this.btnZoomOut) return;
    const hasHistory = this.zoomHistory.length > 0;
    this.btnZoomOut.classList.toggle('disabled', !hasHistory);
    this.btnZoomOut.title = hasHistory
      ? `Уменьшить масштаб (Осталось шагов: ${this.zoomHistory.length})`
      : 'Уменьшить масштаб (Предыдущий масштаб)';
  }
}

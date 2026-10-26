// components/drawing-rail.js - Left Vertical Drawing Toolbar Component
import { showToast } from '../core/utils.js';
import { eventBus } from '../core/event-bus.js';

export class DrawingRailComponent {
  constructor(store) {
    this.store = store;
    this.isMagnetActive = !!this.store.get('isMagnetActive');
    this.chartEl = document.getElementById('chart');
    this.leftToolButtons = document.querySelectorAll('.left-tool-btn[data-tool]');
    this.toolMagnet = document.getElementById('toolMagnet');
    this.toolClearDrawings = document.getElementById('toolClearDrawings');

    this.init();
  }

  init() {
    this.leftToolButtons.forEach(btn => {
      btn.onclick = () => {
        const tool = btn.getAttribute('data-tool');
        this.selectTool(tool, btn);
      };
    });

    if (this.toolMagnet) {
      this.toolMagnet.classList.toggle('active', this.isMagnetActive);
      this.toolMagnet.onclick = () => {
        this.isMagnetActive = !this.isMagnetActive;
        this.store.set('isMagnetActive', this.isMagnetActive);
        this.toolMagnet.classList.toggle('active', this.isMagnetActive);
        if (this.store.drawingController) {
          this.store.drawingController.setOptions({ magnet: this.isMagnetActive ? 'weak' : 'off' });
        }
        showToast(`Магнит ${this.isMagnetActive ? 'включен' : 'выключен'}`, 'info');
      };
    }

    if (this.toolClearDrawings) {
      this.toolClearDrawings.onclick = () => {
        if (this.store.multiChart) {
          this.store.multiChart.clearAllDrawings();
          showToast('Все графические элементы очищены', 'info');
        } else if (this.store.drawingController) {
          const allDrawings = this.store.drawingController.drawings();
          if (allDrawings && allDrawings.length > 0) {
            this.store.drawingController.removeMany(allDrawings.map(d => d.id));
            showToast('Все графические элементы очищены', 'info');
          }
        }
      };
    }

    eventBus.on('tool:reset', () => {
      this.resetToCursor();
    });

    // Finish multi-point tools like Path on Enter key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const dc = this.store.drawingController;
        if (dc && typeof dc.finish === 'function' && dc.activeTool() === 'path') {
          dc.finish('enter');
        }
      }
    });

    // Reset toolbar button to cursor when drawing finishes
    if (this.store.chart && typeof this.store.chart.on === 'function') {
      this.store.chart.on('draw:tool', (data) => {
        if (!data || !data.tool) {
          this.resetToCursor();
        }
      });
    }

    this.hookDrawingControllerFinish();
  }

  hookDrawingControllerFinish() {
    const dc = this.store.drawingController;
    if (!dc) {
      setTimeout(() => this.hookDrawingControllerFinish(), 100);
      return;
    }

    if (dc.__finishHooked) return;
    dc.__finishHooked = true;

    // Points for path & polyline are placed instantly on pointerdown (TradingView style);
    // ignore subsequent clicks originating from pointerup/drag-release
    if (!dc.__onClickHooked && typeof dc._onClick === 'function') {
      dc.__onClickHooked = true;
      const origOnClick = dc._onClick;
      dc._onClick = function(t) {
        if (this._tool === 'path' || this._tool === 'polyline') {
          if (!t || !t.fromPointerDown) {
            return;
          }
        }
        return origOnClick.call(this, t);
      };
    }

    const origFinish = dc.finish;
    const store = this.store;
    dc.finish = function(source = 'dblclick') {
      store._lastToolFinishTime = Date.now();
      if ((this._tool === 'path' || this._tool === 'polyline') && Array.isArray(this._pending)) {
        if (source !== 'enter' && source !== 'rightclick' && this._pending.length > 1) {
          this._pending.pop();
        }
      }
      const res = origFinish.call(this);
      if (store.fsm) {
        store.fsm.finishDrawing();
      }
      return res;
    };
  }

  highlightTool(tool) {
    this.leftToolButtons.forEach(b => b.classList.remove('active'));
    const targetBtn = Array.from(this.leftToolButtons).find(b => b.getAttribute('data-tool') === (tool || 'cursor'));
    if (targetBtn) targetBtn.classList.add('active');
    if (this.chartEl) {
      if (tool === 'zoom-in') {
        this.chartEl.style.cursor = 'zoom-in';
      } else {
        this.chartEl.style.cursor = (tool && tool !== 'cursor') ? 'crosshair' : 'default';
      }
    }
  }

  selectTool(tool, activeBtn = null) {
    this.highlightTool(tool);

    if (this.store.fsm) {
      if (tool === 'cursor') {
        this.store.fsm.finishDrawing();
      } else {
        this.store.fsm.startDrawing(tool);
      }
    }

    if (tool === 'zoom-in') {
      if (this.store.drawingController && this.store.drawingController.activeTool() !== null) {
        this.store.drawingController.setTool(null);
      }
      if (this.store.zoomController) {
        this.store.zoomController.activateTool();
      }
      return;
    }

    if (this.store.zoomController && this.store.zoomController.isToolActive) {
      this.store.zoomController.deactivateTool();
    }

    if (this.store.multiChart) {
      this.store.multiChart.setDrawingTool(tool);
    } else if (this.store.drawingController) {
      if (tool === 'cursor') {
        if (this.store.drawingController.activeTool() !== null) {
          this.store.drawingController.setTool(null);
        }
      } else {
        if (this.store.floatingDrawingToolbar) {
          const def = this.store.floatingDrawingToolbar.getDefaultStyle(tool);
          this.store.drawingController.setOptions({ defaultStyle: def });
        }
        if (this.store.drawingController.activeTool() !== tool) {
          this.store.drawingController.setTool(tool);
        }
      }
    }
  }

  resetToCursor() {
    this.highlightTool('cursor');
    if (this.store.multiChart) {
      this.store.multiChart.setDrawingTool('cursor');
    } else if (this.store.drawingController && this.store.drawingController.activeTool() !== null) {
      this.store.drawingController.setTool(null);
    }
    if (this.store.zoomController && this.store.zoomController.isToolActive) {
      this.store.zoomController.deactivateTool();
    }
    if (this.store.fsm) {
      this.store.fsm.finishDrawing();
    }
  }
}

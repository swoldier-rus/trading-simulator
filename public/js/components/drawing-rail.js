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
        if (this.store.drawingController) {
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

    const origFinish = dc.finish;
    dc.finish = function(source = 'dblclick') {
      if ((this._tool === 'path' || this._tool === 'polyline') && Array.isArray(this._pending)) {
        if (source !== 'enter' && this._pending.length > 1) {
          this._pending.pop();
        }
      }
      return origFinish.call(this);
    };
  }

  highlightTool(tool) {
    this.leftToolButtons.forEach(b => b.classList.remove('active'));
    const targetBtn = Array.from(this.leftToolButtons).find(b => b.getAttribute('data-tool') === (tool || 'cursor'));
    if (targetBtn) targetBtn.classList.add('active');
    if (this.chartEl) this.chartEl.style.cursor = (tool && tool !== 'cursor') ? 'crosshair' : 'default';
  }

  selectTool(tool, activeBtn = null) {
    this.highlightTool(tool);

    if (!this.store.drawingController) return;

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

  resetToCursor() {
    this.highlightTool('cursor');
  }
}

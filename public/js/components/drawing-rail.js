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
  }

  selectTool(tool, activeBtn = null) {
    this.leftToolButtons.forEach(b => b.classList.remove('active'));
    if (activeBtn) {
      activeBtn.classList.add('active');
    } else {
      const targetBtn = Array.from(this.leftToolButtons).find(b => b.getAttribute('data-tool') === tool);
      if (targetBtn) targetBtn.classList.add('active');
    }

    if (!this.store.drawingController) return;

    if (tool === 'cursor') {
      this.store.drawingController.setTool(null);
      if (this.chartEl) this.chartEl.style.cursor = 'default';
    } else {
      if (this.store.floatingDrawingToolbar) {
        const def = this.store.floatingDrawingToolbar.getDefaultStyle(tool);
        this.store.drawingController.setOptions({ defaultStyle: def });
      }
      this.store.drawingController.setTool(tool);
      if (this.chartEl) this.chartEl.style.cursor = 'crosshair';
    }
  }

  resetToCursor() {
    const cursorBtn = document.getElementById('toolCursor');
    this.selectTool('cursor', cursorBtn);
  }
}

// components/floating-drawing-toolbar.js - Floating Drawing Properties Toolbar Component (TradingView Replica)
import { showToast } from '../core/utils.js';

export class FloatingDrawingToolbarComponent {
  constructor(store) {
    this.store = store;

    // Elements
    this.toolbar = document.getElementById('floatingDrawingToolbar');
    this.dragHandle = document.getElementById('drawingDragHandle');
    this.toolBadge = document.getElementById('drawingToolBadge');

    // Popups & buttons
    this.btnColor = document.getElementById('btnDrawingColor');
    this.colorPreview = document.getElementById('drawingColorPreview');
    this.colorPopup = document.getElementById('drawingColorPopup');
    this.colorPalette = document.getElementById('drawingColorPalette');
    this.opacitySlider = document.getElementById('drawingOpacitySlider');
    this.opacityVal = document.getElementById('drawingOpacityVal');

    this.btnWidth = document.getElementById('btnDrawingWidth');
    this.widthPreview = document.getElementById('drawingWidthPreview');
    this.widthPopup = document.getElementById('drawingWidthPopup');

    this.btnStyle = document.getElementById('btnDrawingStyle');
    this.stylePreview = document.getElementById('drawingStylePreviewLine');
    this.stylePopup = document.getElementById('drawingStylePopup');

    this.boxFill = document.getElementById('boxDrawingFill');
    this.btnFill = document.getElementById('btnDrawingFill');
    this.fillPreview = document.getElementById('drawingFillPreview');
    this.fillPopup = document.getElementById('drawingFillPopup');
    this.fillPalette = document.getElementById('drawingFillPalette');
    this.fillOpacitySlider = document.getElementById('drawingFillOpacitySlider');
    this.fillOpacityVal = document.getElementById('drawingFillOpacityVal');

    this.btnSettings = document.getElementById('btnOpenDrawingSettings');
    this.btnDelete = document.getElementById('btnDeleteDrawing');

    this.chartEl = document.getElementById('chart');

    this.selectedDrawingId = null;
    this.defaultStyles = this.loadDefaultStyles();

    this.colors = [
      '#ffffff', '#d1d4dc', '#787b86', '#434651', '#1e222d', '#000000',
      '#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#089981', '#00bcd4',
      '#2962ff', '#82b1ff', '#9c27b0', '#ab47bc', '#e91e63', '#ff5252',
      '#64b5f6', '#26a69a', '#ffb74d', '#e57373', '#ba68c8', '#90a4ae'
    ];

    this.init();
  }

  init() {
    this.initColorPalettes();
    this.initWidthOptions();
    this.initStyleOptions();
    this.initActions();
    this.initDragAndDrop();
    this.hookDrawingController();

    // Close open popups when clicking outside
    document.addEventListener('click', (e) => {
      if (this.toolbar && !this.toolbar.contains(e.target)) {
        this.closeAllPopups();
      }
    });
  }

  // Hook into OpenAlgo DrawingController selection and addition
  hookDrawingController() {
    const dc = this.store.drawingController;
    if (!dc) {
      setTimeout(() => this.hookDrawingController(), 200);
      return;
    }

    // Intercept selection changes
    const origSetSelection = dc._setSelection;
    if (origSetSelection && !dc.__selectionHooked) {
      dc.__selectionHooked = true;
      const self = this;
      dc._setSelection = function(targets, ...rest) {
        const res = origSetSelection.call(this, targets, ...rest);
        const sel = this.selection();
        if (sel && sel.length > 0) {
          self.onDrawingSelected(sel[0]);
        } else {
          self.onDrawingDeselected();
        }
        return res;
      };
    }

    // Intercept add() to apply saved default style for the specific tool
    const origAdd = dc.add;
    if (origAdd && !dc.__addHooked) {
      dc.__addHooked = true;
      const self = this;
      dc.add = function(arg1, arg2, ...rest) {
        if (typeof arg1 === 'string') {
          const tool = arg1;
          const opts = arg2 || {};
          const def = self.getDefaultStyle(tool);
          opts.style = { ...def, ...(opts.style || {}) };
          return origAdd.call(this, tool, opts, ...rest);
        } else if (arg1 && arg1.tool) {
          const def = self.getDefaultStyle(arg1.tool);
          arg1.style = { ...def, ...(arg1.style || {}) };
          return origAdd.call(this, arg1, arg2, ...rest);
        }
        return origAdd.call(this, arg1, arg2, ...rest);
      };
    }

    // Double-click on chart canvas to open full Settings Modal
    if (this.chartEl) {
      this.chartEl.addEventListener('dblclick', (e) => {
        // Suppress opening Settings Modal if a drawing was just completed via double-click
        if (Date.now() - (this.store._lastToolFinishTime || 0) < 500) {
          return;
        }
        const sel = dc.selection();
        if (sel && sel.length > 0) {
          e.stopPropagation();
          this.openSettingsModal();
        }
      });
    }

    // Keydown delete / backspace
    window.addEventListener('keydown', (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedDrawingId) {
        this.deleteSelected();
      }
    });
  }

  onDrawingSelected(drawingId) {
    const dc = this.store.drawingController;
    if (!dc) return;

    const d = dc.get(drawingId);
    if (!d) {
      this.hide();
      return;
    }

    this.selectedDrawingId = drawingId;

    // Tool name badge
    const toolLabels = {
      'horizontal-line': 'Уровень',
      'horizontal-ray': 'Луч',
      'trend-line': 'Линия',
      'path': 'Траектория',
      'parallel-channel': 'Канал',
      'fib-retracement': 'Фибо',
      'rectangle': 'Прямоугольник',
      'brush': 'Кисть',
      'price-range': 'Диапазон'
    };
    if (this.toolBadge) {
      this.toolBadge.textContent = toolLabels[d.tool] || d.tool || 'Фигура';
    }

    // Update style previews
    this.updateToolbarPreview(d.style || {}, d.tool);

    // Show/hide fill button for shapes
    const hasFill = ['rectangle', 'parallel-channel', 'fib-retracement'].includes(d.tool);
    if (this.boxFill) {
      this.boxFill.style.display = hasFill ? 'block' : 'none';
    }

    // Position toolbar near drawing
    this.positionToolbar(drawingId);
    this.show();
  }

  onDrawingDeselected() {
    this.selectedDrawingId = null;
    this.closeAllPopups();
    this.hide();
  }

  positionToolbar(drawingId) {
    const dc = this.store.drawingController;
    if (!dc || !this.toolbar) return;

    let targetX = 0;
    let targetY = 0;

    try {
      const screen = typeof dc.screenPoints === 'function' ? dc.screenPoints(drawingId) : null;
      if (screen && screen.length > 0) {
        // Average coordinates
        const avgX = screen.reduce((sum, p) => sum + (p.x || 0), 0) / screen.length;
        const avgY = screen.reduce((sum, p) => sum + (p.y || 0), 0) / screen.length;
        targetX = Math.round(avgX);
        targetY = Math.round(avgY);
      }
    } catch (e) {}

    const chartRect = this.chartEl ? this.chartEl.getBoundingClientRect() : null;
    const parent = this.toolbar.parentElement;
    const parentRect = parent ? parent.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };

    const toolbarW = this.toolbar.offsetWidth || 280;
    const toolbarH = this.toolbar.offsetHeight || 38;

    let posX = 0;
    let posY = 0;

    if (targetY > 0 && chartRect) {
      // Relative to parent
      posX = (chartRect.left - parentRect.left) + targetX - Math.round(toolbarW / 2);
      posY = (chartRect.top - parentRect.top) + targetY - toolbarH - 24;

      // Flip below if too high
      if (posY < 60) {
        posY = (chartRect.top - parentRect.top) + targetY + 28;
      }
    } else {
      // Fallback: top center of chart
      posX = Math.round((parentRect.width - toolbarW) / 2);
      posY = 65;
    }

    // Keep within bounds
    const minX = 60;
    const maxX = parentRect.width - toolbarW - 20;
    const minY = 50;
    const maxY = parentRect.height - toolbarH - 50;

    posX = Math.max(minX, Math.min(maxX, posX));
    posY = Math.max(minY, Math.min(maxY, posY));

    this.toolbar.style.left = `${posX}px`;
    this.toolbar.style.top = `${posY}px`;
  }

  show() {
    if (this.toolbar) {
      this.toolbar.classList.remove('hidden');
    }
  }

  hide() {
    if (this.toolbar) {
      this.toolbar.classList.add('hidden');
    }
  }

  closeAllPopups() {
    if (this.colorPopup) this.colorPopup.classList.remove('open');
    if (this.widthPopup) this.widthPopup.classList.remove('open');
    if (this.stylePopup) this.stylePopup.classList.remove('open');
    if (this.fillPopup) this.fillPopup.classList.remove('open');
    if (this.btnColor) this.btnColor.classList.remove('active');
    if (this.btnWidth) this.btnWidth.classList.remove('active');
    if (this.btnStyle) this.btnStyle.classList.remove('active');
    if (this.btnFill) this.btnFill.classList.remove('active');
  }

  updateToolbarPreview(style = {}, tool = null) {
    const color = style.color || '#2962ff';
    const width = style.lineWidth || 1;
    const lineStyle = style.lineStyle || 'solid';

    if (this.colorPreview) {
      this.colorPreview.style.backgroundColor = color;
    }

    if (this.widthPreview) {
      this.widthPreview.style.height = `${Math.min(4, Math.max(1, width))}px`;
    }

    if (this.stylePreview) {
      if (lineStyle === 'dashed') {
        this.stylePreview.setAttribute('stroke-dasharray', '6,4');
      } else if (lineStyle === 'dotted') {
        this.stylePreview.setAttribute('stroke-dasharray', '2,3');
      } else {
        this.stylePreview.removeAttribute('stroke-dasharray');
      }
    }

    if (this.fillPreview && style.fillColor) {
      const op = style.fillOpacity !== undefined ? style.fillOpacity : 0.2;
      this.fillPreview.style.backgroundColor = style.fillColor;
      this.fillPreview.style.opacity = op;
    }
  }

  // --- Palettes & Dropdowns Setup ---
  initColorPalettes() {
    // Line Color Button
    if (this.btnColor) {
      this.btnColor.onclick = (e) => {
        e.stopPropagation();
        const isOpen = this.colorPopup.classList.contains('open');
        this.closeAllPopups();
        if (!isOpen) {
          this.colorPopup.classList.add('open');
          this.btnColor.classList.add('active');
        }
      };
    }

    // Populate Grid
    if (this.colorPalette) {
      this.colorPalette.innerHTML = '';
      this.colors.forEach(hex => {
        const item = document.createElement('div');
        item.className = 'color-palette-item';
        item.style.backgroundColor = hex;
        item.setAttribute('data-color', hex);
        item.onclick = (e) => {
          e.stopPropagation();
          this.applyLineColor(hex);
        };
        this.colorPalette.appendChild(item);
      });
    }

    // Opacity Slider
    if (this.opacitySlider && this.opacityVal) {
      this.opacitySlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        this.opacityVal.textContent = `${Math.round(val * 100)}%`;
        this.applyLineOpacity(val);
      };
    }

    // Shape Fill Button
    if (this.btnFill) {
      this.btnFill.onclick = (e) => {
        e.stopPropagation();
        const isOpen = this.fillPopup.classList.contains('open');
        this.closeAllPopups();
        if (!isOpen) {
          this.fillPopup.classList.add('open');
          this.btnFill.classList.add('active');
        }
      };
    }

    // Populate Fill Grid
    if (this.fillPalette) {
      this.fillPalette.innerHTML = '';
      this.colors.forEach(hex => {
        const item = document.createElement('div');
        item.className = 'color-palette-item';
        item.style.backgroundColor = hex;
        item.setAttribute('data-color', hex);
        item.onclick = (e) => {
          e.stopPropagation();
          this.applyFillColor(hex);
        };
        this.fillPalette.appendChild(item);
      });
    }

    // Fill Opacity Slider
    if (this.fillOpacitySlider && this.fillOpacityVal) {
      this.fillOpacitySlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        this.fillOpacityVal.textContent = `${Math.round(val * 100)}%`;
        this.applyFillOpacity(val);
      };
    }
  }

  initWidthOptions() {
    if (this.btnWidth) {
      this.btnWidth.onclick = (e) => {
        e.stopPropagation();
        const isOpen = this.widthPopup.classList.contains('open');
        this.closeAllPopups();
        if (!isOpen) {
          this.widthPopup.classList.add('open');
          this.btnWidth.classList.add('active');
        }
      };
    }

    const rows = this.widthPopup ? this.widthPopup.querySelectorAll('.width-option-row') : [];
    rows.forEach(r => {
      r.onclick = (e) => {
        e.stopPropagation();
        const w = parseInt(r.getAttribute('data-width'), 10);
        this.applyLineWidth(w);
        this.closeAllPopups();
      };
    });
  }

  initStyleOptions() {
    if (this.btnStyle) {
      this.btnStyle.onclick = (e) => {
        e.stopPropagation();
        const isOpen = this.stylePopup.classList.contains('open');
        this.closeAllPopups();
        if (!isOpen) {
          this.stylePopup.classList.add('open');
          this.btnStyle.classList.add('active');
        }
      };
    }

    const rows = this.stylePopup ? this.stylePopup.querySelectorAll('.style-option-row') : [];
    rows.forEach(r => {
      r.onclick = (e) => {
        e.stopPropagation();
        const s = r.getAttribute('data-style');
        this.applyLineStyle(s);
        this.closeAllPopups();
      };
    });
  }

  initActions() {
    if (this.btnSettings) {
      this.btnSettings.onclick = (e) => {
        e.stopPropagation();
        this.openSettingsModal();
      };
    }

    if (this.btnDelete) {
      this.btnDelete.onclick = (e) => {
        e.stopPropagation();
        this.deleteSelected();
      };
    }
  }

  // --- Real-time Style Updates ---
  applyLineColor(hex) {
    const dc = this.store.drawingController;
    if (!dc || !this.selectedDrawingId) return;
    const d = dc.get(this.selectedDrawingId);
    if (!d) return;

    const style = { ...(d.style || {}), color: hex };
    dc.update(this.selectedDrawingId, { style });
    this.updateToolbarPreview(style, d.tool);
    this.saveDefaultStyle(d.tool, style);
  }

  applyLineOpacity(opacity) {
    const dc = this.store.drawingController;
    if (!dc || !this.selectedDrawingId) return;
    const d = dc.get(this.selectedDrawingId);
    if (!d) return;

    let hex = (d.style && d.style.color && d.style.color.startsWith('#')) ? d.style.color.slice(0, 7) : '#2962ff';
    const alphaHex = Math.round(opacity * 255).toString(16).padStart(2, '0');
    const color = `${hex}${alphaHex}`;

    const style = { ...(d.style || {}), color };
    dc.update(this.selectedDrawingId, { style });
    this.updateToolbarPreview(style, d.tool);
    this.saveDefaultStyle(d.tool, style);
  }

  applyLineWidth(width) {
    const dc = this.store.drawingController;
    if (!dc || !this.selectedDrawingId) return;
    const d = dc.get(this.selectedDrawingId);
    if (!d) return;

    const style = { ...(d.style || {}), lineWidth: width };
    dc.update(this.selectedDrawingId, { style });
    this.updateToolbarPreview(style, d.tool);
    this.saveDefaultStyle(d.tool, style);
  }

  applyLineStyle(lineStyle) {
    const dc = this.store.drawingController;
    if (!dc || !this.selectedDrawingId) return;
    const d = dc.get(this.selectedDrawingId);
    if (!d) return;

    const style = { ...(d.style || {}), lineStyle };
    dc.update(this.selectedDrawingId, { style });
    this.updateToolbarPreview(style, d.tool);
    this.saveDefaultStyle(d.tool, style);
  }

  applyFillColor(hex) {
    const dc = this.store.drawingController;
    if (!dc || !this.selectedDrawingId) return;
    const d = dc.get(this.selectedDrawingId);
    if (!d) return;

    const op = (d.style && d.style.fillOpacity !== undefined) ? d.style.fillOpacity : 0.2;
    const style = { ...(d.style || {}), fillColor: hex, fillOpacity: op };
    dc.update(this.selectedDrawingId, { style });
    this.updateToolbarPreview(style, d.tool);
    this.saveDefaultStyle(d.tool, style);
  }

  applyFillOpacity(opacity) {
    const dc = this.store.drawingController;
    if (!dc || !this.selectedDrawingId) return;
    const d = dc.get(this.selectedDrawingId);
    if (!d) return;

    const hex = (d.style && d.style.fillColor) ? d.style.fillColor : (d.style?.color || '#2962ff');
    const style = { ...(d.style || {}), fillColor: hex, fillOpacity: opacity };
    dc.update(this.selectedDrawingId, { style });
    this.updateToolbarPreview(style, d.tool);
    this.saveDefaultStyle(d.tool, style);
  }

  openSettingsModal() {
    if (!this.selectedDrawingId) return;
    this.closeAllPopups();
    if (this.store.drawingSettingsModal) {
      this.store.drawingSettingsModal.open(this.selectedDrawingId);
    }
  }

  deleteSelected() {
    const dc = this.store.drawingController;
    if (!dc || !this.selectedDrawingId) return;
    const id = this.selectedDrawingId;
    dc.remove(id);
    this.onDrawingDeselected();
    showToast('Элемент удален', 'info');
  }

  // --- Per-Tool Defaults & localStorage ---
  loadDefaultStyles() {
    try {
      const saved = localStorage.getItem('trading_simulator_drawing_defaults');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      'horizontal-line': { color: '#2962ff', lineWidth: 1, lineStyle: 'solid', showLabels: true },
      'horizontal-ray': { color: '#2962ff', lineWidth: 1, lineStyle: 'solid', showLabels: true },
      'trend-line': { color: '#2962ff', lineWidth: 2, lineStyle: 'solid', showLabels: true },
      'parallel-channel': { color: '#2962ff', lineWidth: 1, lineStyle: 'solid', fillColor: '#2962ff', fillOpacity: 0.15 },
      'fib-retracement': { color: '#787b86', lineWidth: 1, lineStyle: 'solid' },
      'rectangle': { color: '#2962ff', lineWidth: 1, lineStyle: 'solid', fillColor: '#2962ff', fillOpacity: 0.2 },
      'brush': { color: '#f23645', lineWidth: 2, lineStyle: 'solid' },
      'price-range': { color: '#2962ff', lineWidth: 1, lineStyle: 'solid' }
    };
  }

  getDefaultStyle(tool) {
    if (this.defaultStyles && this.defaultStyles[tool]) {
      return { ...this.defaultStyles[tool] };
    }
    if (tool === 'path') {
      return { color: '#2962ff', lineWidth: 2, lineStyle: 'solid', showLabels: true };
    }
    return { color: '#2962ff', lineWidth: 1, lineStyle: 'solid', showLabels: true };
  }

  saveDefaultStyle(tool, style) {
    if (!tool) return;
    if (!this.defaultStyles) this.defaultStyles = {};
    this.defaultStyles[tool] = { ...(this.defaultStyles[tool] || {}), ...style };
    try {
      localStorage.setItem('trading_simulator_drawing_defaults', JSON.stringify(this.defaultStyles));
    } catch (e) {}

    // Also update OpenAlgo's global defaultStyle so current tool creation picks it up
    const dc = this.store.drawingController;
    if (dc && typeof dc.setOptions === 'function') {
      dc.setOptions({ defaultStyle: this.defaultStyles[tool] });
    }
  }

  // --- Toolbar Drag & Drop ---
  initDragAndDrop() {
    if (!this.toolbar || !this.dragHandle) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    const onPointerDown = (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = this.toolbar.getBoundingClientRect();
      const parentRect = this.toolbar.parentElement.getBoundingClientRect();
      initialLeft = rect.left - parentRect.left;
      initialTop = rect.top - parentRect.top;

      this.toolbar.classList.add('dragging');
      try {
        if (this.dragHandle.setPointerCapture) {
          this.dragHandle.setPointerCapture(e.pointerId);
        }
      } catch (err) {}

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      this.toolbar.style.left = `${initialLeft + dx}px`;
      this.toolbar.style.top = `${initialTop + dy}px`;
    };

    const onPointerUp = (e) => {
      if (!isDragging) return;
      isDragging = false;
      this.toolbar.classList.remove('dragging');

      try {
        if (this.dragHandle.releasePointerCapture && e.pointerId !== undefined) {
          this.dragHandle.releasePointerCapture(e.pointerId);
        }
      } catch (err) {}

      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    this.dragHandle.addEventListener('pointerdown', onPointerDown);
  }
}

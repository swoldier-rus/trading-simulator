// components/drawing-settings-modal.js - Full Drawing Tool Properties Modal Dialog
import { showToast } from '../core/utils.js';

export class DrawingSettingsModalComponent {
  constructor(store) {
    this.store = store;
    this.modal = document.getElementById('drawingSettingsModal');
    this.modalTitle = document.getElementById('drawingModalTitle');
    this.btnClose = document.getElementById('btnCloseDrawingModal');
    this.btnCancel = document.getElementById('btnModalCancel');
    this.btnApply = document.getElementById('btnModalApply');
    this.btnSaveDefault = document.getElementById('btnModalSaveDefault');

    // Tabs
    this.tabButtons = this.modal ? this.modal.querySelectorAll('.drawing-modal-tab') : [];
    this.tabContents = this.modal ? this.modal.querySelectorAll('.drawing-modal-tab-content') : [];

    // Form inputs: Style
    this.modalLineColor = document.getElementById('modalLineColor');
    this.modalLineWidth = document.getElementById('modalLineWidth');
    this.modalLineStyle = document.getElementById('modalLineStyle');
    this.rowModalFill = document.getElementById('rowModalFill');
    this.modalFillColor = document.getElementById('modalFillColor');
    this.modalFillOpacity = document.getElementById('modalFillOpacity');
    this.modalFillOpacityText = document.getElementById('modalFillOpacityText');
    this.modalShowLabels = document.getElementById('modalShowLabels');

    // Form inputs: Coords
    this.modalCoordPrice1 = document.getElementById('modalCoordPrice1');
    this.rowCoordPrice2 = document.getElementById('rowCoordPrice2');
    this.modalCoordPrice2 = document.getElementById('modalCoordPrice2');
    this.lblCoordPrice1 = document.getElementById('lblCoordPrice1');
    this.lblCoordPrice2 = document.getElementById('lblCoordPrice2');

    // Form inputs: Text
    this.modalTextVal = document.getElementById('modalTextVal');
    this.modalTextColor = document.getElementById('modalTextColor');
    this.modalTextSize = document.getElementById('modalTextSize');

    this.activeDrawingId = null;

    this.init();
  }

  init() {
    if (!this.modal) return;

    // Close handlers
    if (this.btnClose) this.btnClose.onclick = () => this.close();
    if (this.btnCancel) this.btnCancel.onclick = () => this.close();

    // Tab switching
    this.tabButtons.forEach(btn => {
      btn.onclick = () => {
        this.tabButtons.forEach(b => b.classList.remove('active'));
        this.tabContents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');

        const tabKey = btn.getAttribute('data-tab');
        const content = document.getElementById(`drawingTab${tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}`);
        if (content) content.classList.add('active');
      };
    });

    // Fill opacity slider text readout
    if (this.modalFillOpacity && this.modalFillOpacityText) {
      this.modalFillOpacity.oninput = (e) => {
        this.modalFillOpacityText.textContent = `${Math.round(parseFloat(e.target.value) * 100)}%`;
      };
    }

    // Apply button
    if (this.btnApply) {
      this.btnApply.onclick = () => this.applyChanges();
    }

    // Save as default button
    if (this.btnSaveDefault) {
      this.btnSaveDefault.onclick = () => this.saveDefaults();
    }

    // Click backdrop to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });
  }

  open(drawingId) {
    const dc = this.store.drawingController;
    if (!dc) return;

    const d = dc.get(drawingId);
    if (!d) return;

    this.activeDrawingId = drawingId;

    // Tool title
    const toolNames = {
      'horizontal-line': 'Горизонтальный уровень',
      'horizontal-ray': 'Горизонтальный луч',
      'trend-line': 'Трендовая линия',
      'parallel-channel': 'Параллельный канал',
      'fib-retracement': 'Коррекция Фибоначчи',
      'rectangle': 'Прямоугольник',
      'brush': 'Кисть',
      'price-range': 'Ценовой диапазон'
    };
    const title = toolNames[d.tool] || d.tool || 'Инструмент';
    if (this.modalTitle) {
      this.modalTitle.innerHTML = `<span>⚙️ Настройки: ${title}</span>`;
    }

    // Reset tabs to Style
    this.tabButtons.forEach(b => b.classList.remove('active'));
    this.tabContents.forEach(c => c.classList.remove('active'));
    const tabStyleBtn = document.getElementById('tabDrawingStyleBtn');
    const tabStyle = document.getElementById('drawingTabStyle');
    if (tabStyleBtn) tabStyleBtn.classList.add('active');
    if (tabStyle) tabStyle.classList.add('active');

    // Populate Style fields
    const style = d.style || {};
    const hexColor = (style.color && style.color.startsWith('#')) ? style.color.slice(0, 7) : '#2962ff';
    if (this.modalLineColor) this.modalLineColor.value = hexColor;
    if (this.modalLineWidth) this.modalLineWidth.value = String(style.lineWidth || 1);
    if (this.modalLineStyle) this.modalLineStyle.value = style.lineStyle || 'solid';
    if (this.modalShowLabels) this.modalShowLabels.checked = style.showLabels !== false;

    // Check if tool supports fill (rectangle, parallel-channel)
    const hasFill = ['rectangle', 'parallel-channel', 'fib-retracement'].includes(d.tool);
    if (this.rowModalFill) {
      this.rowModalFill.style.display = hasFill ? 'flex' : 'none';
      if (hasFill) {
        const fillColor = (style.fillColor && style.fillColor.startsWith('#')) ? style.fillColor.slice(0, 7) : hexColor;
        if (this.modalFillColor) this.modalFillColor.value = fillColor;
        const fillOp = style.fillOpacity !== undefined ? style.fillOpacity : 0.2;
        if (this.modalFillOpacity) this.modalFillOpacity.value = fillOp;
        if (this.modalFillOpacityText) this.modalFillOpacityText.textContent = `${Math.round(fillOp * 100)}%`;
      }
    }

    // Populate Coordinates
    const points = d.points || [];
    if (points[0] && this.modalCoordPrice1) {
      this.modalCoordPrice1.value = typeof points[0].price === 'number' ? points[0].price.toFixed(2) : '';
    }
    if (points.length > 1 && points[1]) {
      if (this.rowCoordPrice2) this.rowCoordPrice2.style.display = 'flex';
      if (this.modalCoordPrice2) {
        this.modalCoordPrice2.value = typeof points[1].price === 'number' ? points[1].price.toFixed(2) : '';
      }
    } else {
      if (this.rowCoordPrice2) this.rowCoordPrice2.style.display = 'none';
    }

    // Populate Text
    const txt = d.text || {};
    if (this.modalTextVal) this.modalTextVal.value = txt.value || txt.text || '';
    if (this.modalTextColor) {
      this.modalTextColor.value = (txt.color && txt.color.startsWith('#')) ? txt.color.slice(0, 7) : '#ffffff';
    }
    if (this.modalTextSize) this.modalTextSize.value = String(txt.fontSize || 14);

    this.modal.classList.add('open');
  }

  close() {
    if (this.modal) this.modal.classList.remove('open');
    this.activeDrawingId = null;
  }

  applyChanges() {
    const dc = this.store.drawingController;
    if (!dc || !this.activeDrawingId) return;

    const d = dc.get(this.activeDrawingId);
    if (!d) return;

    // Collect updated styles
    const color = this.modalLineColor ? this.modalLineColor.value : '#2962ff';
    const lineWidth = this.modalLineWidth ? parseInt(this.modalLineWidth.value, 10) : 1;
    const lineStyle = this.modalLineStyle ? this.modalLineStyle.value : 'solid';
    const showLabels = this.modalShowLabels ? this.modalShowLabels.checked : true;

    const updatedStyle = {
      ...(d.style || {}),
      color,
      lineWidth,
      lineStyle,
      showLabels
    };

    const hasFill = ['rectangle', 'parallel-channel', 'fib-retracement'].includes(d.tool);
    if (hasFill) {
      if (this.modalFillColor) updatedStyle.fillColor = this.modalFillColor.value;
      if (this.modalFillOpacity) updatedStyle.fillOpacity = parseFloat(this.modalFillOpacity.value);
    }

    // Collect updated points (Coordinates)
    const points = Array.isArray(d.points) ? JSON.parse(JSON.stringify(d.points)) : [];
    if (this.modalCoordPrice1 && points[0]) {
      const p1 = parseFloat(this.modalCoordPrice1.value);
      if (!isNaN(p1)) points[0].price = p1;
    }
    if (this.modalCoordPrice2 && points[1] && this.rowCoordPrice2.style.display !== 'none') {
      const p2 = parseFloat(this.modalCoordPrice2.value);
      if (!isNaN(p2)) points[1].price = p2;
    }

    // Collect updated text
    const textVal = this.modalTextVal ? this.modalTextVal.value.trim() : '';
    const updatedText = textVal ? {
      ...(d.text || {}),
      value: textVal,
      text: textVal,
      color: this.modalTextColor ? this.modalTextColor.value : '#ffffff',
      fontSize: this.modalTextSize ? parseInt(this.modalTextSize.value, 10) : 14
    } : null;

    const patch = {
      points,
      style: updatedStyle
    };
    if (updatedText) {
      patch.text = updatedText;
    }

    // Apply update to DrawingController
    dc.update(this.activeDrawingId, patch);

    // Also update quick toolbar preview if visible
    if (this.store.floatingDrawingToolbar) {
      this.store.floatingDrawingToolbar.updateToolbarPreview(updatedStyle);
      this.store.floatingDrawingToolbar.saveDefaultStyle(d.tool, updatedStyle);
    }

    showToast('Параметры инструмента обновлены', 'success');
    this.close();
  }

  saveDefaults() {
    const dc = this.store.drawingController;
    if (!dc || !this.activeDrawingId) return;
    const d = dc.get(this.activeDrawingId);
    if (!d) return;

    const color = this.modalLineColor ? this.modalLineColor.value : '#2962ff';
    const lineWidth = this.modalLineWidth ? parseInt(this.modalLineWidth.value, 10) : 1;
    const lineStyle = this.modalLineStyle ? this.modalLineStyle.value : 'solid';
    const showLabels = this.modalShowLabels ? this.modalShowLabels.checked : true;

    const updatedStyle = {
      ...(d.style || {}),
      color,
      lineWidth,
      lineStyle,
      showLabels
    };

    if (this.store.floatingDrawingToolbar) {
      this.store.floatingDrawingToolbar.saveDefaultStyle(d.tool, updatedStyle);
    }

    showToast('Стиль сохранен как стандартный для этого инструмента', 'success');
  }
}

// components/chart-style-modal.js - Dynamic Chart Type Color & Appearance Settings Modal
import { showToast } from '../core/utils.js';

export const DEFAULT_CHART_STYLES = {
  candlestick: {
    upColor: '#089981',
    downColor: '#f23645',
    borderUpColor: '#089981',
    borderDownColor: '#f23645',
    wickUpColor: '#089981',
    wickDownColor: '#f23645',
    bodyVisible: true,
    borderVisible: true,
    wickVisible: true
  },
  'hollow-candle': {
    upColor: '#089981',
    downColor: '#f23645',
    borderUpColor: '#089981',
    borderDownColor: '#f23645',
    wickUpColor: '#089981',
    wickDownColor: '#f23645',
    bodyVisible: true,
    borderVisible: true,
    wickVisible: true
  },
  'volume-candle': {
    upColor: '#089981',
    downColor: '#f23645',
    borderUpColor: '#089981',
    borderDownColor: '#f23645',
    wickUpColor: '#089981',
    wickDownColor: '#f23645',
    bodyVisible: true,
    borderVisible: true,
    wickVisible: true
  },
  bar: {
    upColor: '#089981',
    downColor: '#f23645'
  },
  'high-low': {
    upColor: '#089981',
    downColor: '#f23645'
  },
  line: {
    color: '#2962ff',
    lineWidth: 2
  },
  'line-markers': {
    color: '#2962ff',
    lineWidth: 2
  },
  step: {
    color: '#2962ff',
    lineWidth: 2
  },
  area: {
    lineColor: '#2962ff',
    topColor: 'rgba(41, 98, 255, 0.28)',
    bottomColor: 'rgba(41, 98, 255, 0.0)',
    lineWidth: 2
  },
  'hlc-area': {
    lineColor: '#2962ff',
    topColor: 'rgba(41, 98, 255, 0.28)',
    bottomColor: 'rgba(41, 98, 255, 0.0)',
    lineWidth: 2
  },
  baseline: {
    topLineColor: '#089981',
    bottomLineColor: '#f23645',
    topFillColor1: 'rgba(8, 153, 129, 0.28)',
    topFillColor2: 'rgba(8, 153, 129, 0.05)',
    bottomFillColor1: 'rgba(242, 54, 69, 0.05)',
    bottomFillColor2: 'rgba(242, 54, 69, 0.28)',
    lineWidth: 2
  },
  column: {
    upColor: '#089981',
    downColor: '#f23645'
  }
};

const CHART_TYPE_TITLES = {
  candlestick: 'Японские свечи',
  'hollow-candle': 'Пустые свечи',
  'volume-candle': 'Свечи объёма',
  bar: 'Бары',
  'high-low': 'Мин-Макс',
  line: 'Линия',
  'line-markers': 'Линия с точками',
  step: 'Ступенчатая линия',
  area: 'Область',
  'hlc-area': 'Область HLC',
  baseline: 'Базовая линия',
  column: 'Столбцы'
};

const STORAGE_KEY = 'trading_simulator_chart_custom_styles';

export class ChartStyleModalComponent {
  constructor(store) {
    this.store = store;

    // DOM Elements
    this.modal = document.getElementById('chartStyleModal');
    this.modalTitle = document.getElementById('chartStyleModalTitle');
    this.modalBody = document.getElementById('chartStyleModalBody');
    this.btnClose = document.getElementById('btnCloseChartStyleModal');
    this.btnCancel = document.getElementById('btnChartStyleCancel');
    this.btnApply = document.getElementById('btnChartStyleApply');
    this.btnDefault = document.getElementById('btnChartStyleDefault');

    // Popover
    this.activePopover = null;

    // TradingView Swatch Presets
    this.presetColors = [
      '#ffffff', '#d1d4dc', '#787b86', '#434651', '#1e222d', '#000000',
      '#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#089981', '#00bcd4',
      '#2962ff', '#82b1ff', '#9c27b0', '#ab47bc', '#e91e63', '#ff5252',
      '#64b5f6', '#26a69a', '#ffb74d', '#e57373', '#ba68c8', '#90a4ae'
    ];

    this.currentType = null;
    this.currentWorkingStyle = {};
    this.backupStyle = {};

    this.init();
  }

  init() {
    if (this.btnClose) this.btnClose.onclick = () => this.cancel();
    if (this.btnCancel) this.btnCancel.onclick = () => this.cancel();
    if (this.btnApply) this.btnApply.onclick = () => this.saveAndClose();
    if (this.btnDefault) this.btnDefault.onclick = () => this.resetToDefault();

    if (this.modal) {
      this.modal.onclick = (e) => {
        if (e.target === this.modal) {
          this.cancel();
        }
      };
    }

    // Dismiss active color popover on outside click
    document.addEventListener('click', (e) => {
      if (this.activePopover && !this.activePopover.contains(e.target) && !e.target.closest('.style-color-btn')) {
        this.closeColorPopover();
      }
    });
  }

  // Retrieve user overrides from localStorage
  loadAllCustomStyles() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn('[ChartStyleModal] Failed to load custom styles:', e);
      return {};
    }
  }

  saveCustomStyle(type, style) {
    try {
      const all = this.loadAllCustomStyles();
      all[type] = style;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
      console.warn('[ChartStyleModal] Failed to save custom styles:', e);
    }
  }

  removeCustomStyle(type) {
    try {
      const all = this.loadAllCustomStyles();
      delete all[type];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
      console.warn('[ChartStyleModal] Failed to remove custom style:', e);
    }
  }

  // Get active effective style for any type (default merged with custom)
  getEffectiveStyle(type) {
    const defaults = DEFAULT_CHART_STYLES[type] || {};
    const allCustom = this.loadAllCustomStyles();
    const custom = allCustom[type] || {};
    return { ...defaults, ...custom };
  }

  open() {
    if (!this.modal) return;

    this.currentType = this.store.get('currentChartType') || 'candlestick';
    const effective = this.getEffectiveStyle(this.currentType);
    this.backupStyle = { ...effective };
    this.currentWorkingStyle = { ...effective };

    if (this.modalTitle) {
      const titleName = CHART_TYPE_TITLES[this.currentType] || this.currentType;
      this.modalTitle.textContent = `Настройки: ${titleName}`;
    }

    this.renderForm();
    this.modal.style.display = 'flex';
  }

  close() {
    this.closeColorPopover();
    if (this.modal) this.modal.style.display = 'none';
  }

  cancel() {
    // Revert chart to backup style
    this.currentWorkingStyle = { ...this.backupStyle };
    this.applyLivePreview();
    this.close();
  }

  saveAndClose() {
    if (this.currentType) {
      this.saveCustomStyle(this.currentType, this.currentWorkingStyle);
      showToast('Настройки стиля сохранены', 'success');
    }
    this.close();
  }

  resetToDefault() {
    if (!this.currentType) return;
    const defaults = DEFAULT_CHART_STYLES[this.currentType] || {};
    this.currentWorkingStyle = { ...defaults };
    this.removeCustomStyle(this.currentType);
    this.applyLivePreview();
    this.renderForm();
    showToast('Сброшено к цветам по умолчанию', 'info');
  }

  applyLivePreview() {
    const mainSeries = this.store.mainSeries;
    if (mainSeries && typeof mainSeries.applyOptions === 'function') {
      try {
        mainSeries.applyOptions(this.currentWorkingStyle);
      } catch (err) {
        console.warn('[ChartStyleModal] Live preview error:', err);
      }
    }
  }

  renderForm() {
    if (!this.modalBody) return;
    this.modalBody.innerHTML = '';

    const type = this.currentType;

    if (type === 'candlestick' || type === 'hollow-candle' || type === 'volume-candle') {
      this.renderCandleSettings();
    } else if (type === 'bar' || type === 'high-low') {
      this.renderBarSettings();
    } else if (type === 'line' || type === 'line-markers' || type === 'step') {
      this.renderLineSettings();
    } else if (type === 'area' || type === 'hlc-area') {
      this.renderAreaSettings();
    } else if (type === 'baseline') {
      this.renderBaselineSettings();
    } else if (type === 'column') {
      this.renderColumnSettings();
    } else {
      this.renderGenericColorSettings();
    }
  }

  renderCandleSettings() {
    // 1. Body
    const bodyRow = this.createSettingRow({
      label: 'Тело свечи',
      hasCheckbox: true,
      checked: this.currentWorkingStyle.bodyVisible !== false,
      onCheck: (val) => {
        this.currentWorkingStyle.bodyVisible = val;
        this.applyLivePreview();
      },
      controls: [
        this.createColorButton(this.currentWorkingStyle.upColor || '#089981', (c) => {
          this.currentWorkingStyle.upColor = c;
          this.applyLivePreview();
        }, 'Цвет растущей свечи'),
        this.createColorButton(this.currentWorkingStyle.downColor || '#f23645', (c) => {
          this.currentWorkingStyle.downColor = c;
          this.applyLivePreview();
        }, 'Цвет падающей свечи')
      ]
    });
    this.modalBody.appendChild(bodyRow);

    // 2. Borders
    const borderRow = this.createSettingRow({
      label: 'Границы свечи',
      hasCheckbox: true,
      checked: this.currentWorkingStyle.borderVisible !== false,
      onCheck: (val) => {
        this.currentWorkingStyle.borderVisible = val;
        this.applyLivePreview();
      },
      controls: [
        this.createColorButton(this.currentWorkingStyle.borderUpColor || '#089981', (c) => {
          this.currentWorkingStyle.borderUpColor = c;
          this.applyLivePreview();
        }, 'Граница растущей свечи'),
        this.createColorButton(this.currentWorkingStyle.borderDownColor || '#f23645', (c) => {
          this.currentWorkingStyle.borderDownColor = c;
          this.applyLivePreview();
        }, 'Граница падающей свечи')
      ]
    });
    this.modalBody.appendChild(borderRow);

    // 3. Wicks
    const wickRow = this.createSettingRow({
      label: 'Фитили свечи',
      hasCheckbox: true,
      checked: this.currentWorkingStyle.wickVisible !== false,
      onCheck: (val) => {
        this.currentWorkingStyle.wickVisible = val;
        this.applyLivePreview();
      },
      controls: [
        this.createColorButton(this.currentWorkingStyle.wickUpColor || '#089981', (c) => {
          this.currentWorkingStyle.wickUpColor = c;
          this.applyLivePreview();
        }, 'Фитиль растущей свечи'),
        this.createColorButton(this.currentWorkingStyle.wickDownColor || '#f23645', (c) => {
          this.currentWorkingStyle.wickDownColor = c;
          this.applyLivePreview();
        }, 'Фитиль падающей свечи')
      ]
    });
    this.modalBody.appendChild(wickRow);
  }

  renderBarSettings() {
    const barRow = this.createSettingRow({
      label: 'Цвета баров (вверх / вниз)',
      controls: [
        this.createColorButton(this.currentWorkingStyle.upColor || '#089981', (c) => {
          this.currentWorkingStyle.upColor = c;
          this.applyLivePreview();
        }, 'Растущий бар'),
        this.createColorButton(this.currentWorkingStyle.downColor || '#f23645', (c) => {
          this.currentWorkingStyle.downColor = c;
          this.applyLivePreview();
        }, 'Падающий бар')
      ]
    });
    this.modalBody.appendChild(barRow);
  }

  renderLineSettings() {
    const lineRow = this.createSettingRow({
      label: 'Цвет и толщина линии',
      controls: [
        this.createColorButton(this.currentWorkingStyle.color || '#2962ff', (c) => {
          this.currentWorkingStyle.color = c;
          this.applyLivePreview();
        }, 'Цвет линии'),
        this.createWidthSelect(this.currentWorkingStyle.lineWidth || 2, (w) => {
          this.currentWorkingStyle.lineWidth = w;
          this.applyLivePreview();
        })
      ]
    });
    this.modalBody.appendChild(lineRow);
  }

  renderAreaSettings() {
    const lineRow = this.createSettingRow({
      label: 'Линия границы',
      controls: [
        this.createColorButton(this.currentWorkingStyle.lineColor || '#2962ff', (c) => {
          this.currentWorkingStyle.lineColor = c;
          this.applyLivePreview();
        }, 'Цвет линии границы'),
        this.createWidthSelect(this.currentWorkingStyle.lineWidth || 2, (w) => {
          this.currentWorkingStyle.lineWidth = w;
          this.applyLivePreview();
        })
      ]
    });
    this.modalBody.appendChild(lineRow);

    const fillRow = this.createSettingRow({
      label: 'Градиент области (верх / низ)',
      controls: [
        this.createColorButton(this.currentWorkingStyle.topColor || 'rgba(41, 98, 255, 0.28)', (c) => {
          this.currentWorkingStyle.topColor = c;
          this.applyLivePreview();
        }, 'Цвет верхней части заливки'),
        this.createColorButton(this.currentWorkingStyle.bottomColor || 'rgba(41, 98, 255, 0.0)', (c) => {
          this.currentWorkingStyle.bottomColor = c;
          this.applyLivePreview();
        }, 'Цвет нижней части заливки')
      ]
    });
    this.modalBody.appendChild(fillRow);
  }

  renderBaselineSettings() {
    const topRow = this.createSettingRow({
      label: 'Верхняя зона (линия / заливка)',
      controls: [
        this.createColorButton(this.currentWorkingStyle.topLineColor || '#089981', (c) => {
          this.currentWorkingStyle.topLineColor = c;
          this.applyLivePreview();
        }, 'Линия выше базы'),
        this.createColorButton(this.currentWorkingStyle.topFillColor1 || 'rgba(8, 153, 129, 0.28)', (c) => {
          this.currentWorkingStyle.topFillColor1 = c;
          this.applyLivePreview();
        }, 'Заливка выше базы')
      ]
    });
    this.modalBody.appendChild(topRow);

    const botRow = this.createSettingRow({
      label: 'Нижняя зона (линия / заливка)',
      controls: [
        this.createColorButton(this.currentWorkingStyle.bottomLineColor || '#f23645', (c) => {
          this.currentWorkingStyle.bottomLineColor = c;
          this.applyLivePreview();
        }, 'Линия ниже базы'),
        this.createColorButton(this.currentWorkingStyle.bottomFillColor2 || 'rgba(242, 54, 69, 0.28)', (c) => {
          this.currentWorkingStyle.bottomFillColor2 = c;
          this.applyLivePreview();
        }, 'Заливка ниже базы')
      ]
    });
    this.modalBody.appendChild(botRow);

    const widthRow = this.createSettingRow({
      label: 'Толщина линии',
      controls: [
        this.createWidthSelect(this.currentWorkingStyle.lineWidth || 2, (w) => {
          this.currentWorkingStyle.lineWidth = w;
          this.applyLivePreview();
        })
      ]
    });
    this.modalBody.appendChild(widthRow);
  }

  renderColumnSettings() {
    const colRow = this.createSettingRow({
      label: 'Цвета столбцов (вверх / вниз)',
      controls: [
        this.createColorButton(this.currentWorkingStyle.upColor || '#089981', (c) => {
          this.currentWorkingStyle.upColor = c;
          this.applyLivePreview();
        }, 'Столбец вверх'),
        this.createColorButton(this.currentWorkingStyle.downColor || '#f23645', (c) => {
          this.currentWorkingStyle.downColor = c;
          this.applyLivePreview();
        }, 'Столбец вниз')
      ]
    });
    this.modalBody.appendChild(colRow);
  }

  renderGenericColorSettings() {
    const row = this.createSettingRow({
      label: 'Цвет отображения',
      controls: [
        this.createColorButton(this.currentWorkingStyle.upColor || this.currentWorkingStyle.color || '#2962ff', (c) => {
          this.currentWorkingStyle.upColor = c;
          this.currentWorkingStyle.color = c;
          this.applyLivePreview();
        }, 'Основной цвет')
      ]
    });
    this.modalBody.appendChild(row);
  }

  createSettingRow({ label, hasCheckbox = false, checked = true, onCheck = null, controls = [] }) {
    const row = document.createElement('div');
    row.className = 'style-setting-row';

    const left = document.createElement('div');
    left.className = 'style-setting-left';

    if (hasCheckbox) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = checked;
      cb.onchange = (e) => {
        if (typeof onCheck === 'function') onCheck(e.target.checked);
      };
      left.appendChild(cb);
    }

    const lbl = document.createElement('span');
    lbl.textContent = label;
    left.appendChild(lbl);
    row.appendChild(left);

    const right = document.createElement('div');
    right.className = 'style-setting-control';
    controls.forEach(ctrl => right.appendChild(ctrl));
    row.appendChild(right);

    return row;
  }

  createColorButton(initialColor, onChange, tooltipTitle = 'Выбрать цвет') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'style-color-btn';
    btn.title = tooltipTitle;

    const inner = document.createElement('span');
    inner.className = 'style-color-inner';
    inner.style.backgroundColor = initialColor;
    btn.appendChild(inner);

    btn.onclick = (e) => {
      e.stopPropagation();
      this.openColorPopover(btn, inner.style.backgroundColor || initialColor, (newColor) => {
        inner.style.backgroundColor = newColor;
        if (typeof onChange === 'function') onChange(newColor);
      });
    };

    return btn;
  }

  createWidthSelect(initialWidth, onChange) {
    const select = document.createElement('select');
    select.className = 'style-select-width';
    [1, 2, 3, 4].forEach(w => {
      const opt = document.createElement('option');
      opt.value = w;
      opt.textContent = `${w} px`;
      if (Number(initialWidth) === w) opt.selected = true;
      select.appendChild(opt);
    });

    select.onchange = (e) => {
      if (typeof onChange === 'function') onChange(Number(e.target.value));
    };

    return select;
  }

  openColorPopover(anchorBtn, currentColor, onSelect) {
    this.closeColorPopover();

    const popover = document.createElement('div');
    popover.className = 'style-color-popover';

    // Grid of swatches
    const grid = document.createElement('div');
    grid.className = 'style-color-palette-grid';

    this.presetColors.forEach(hex => {
      const swatch = document.createElement('div');
      swatch.className = 'style-palette-swatch';
      swatch.style.backgroundColor = hex;
      swatch.title = hex;
      swatch.onclick = (e) => {
        e.stopPropagation();
        onSelect(hex);
        this.closeColorPopover();
      };
      grid.appendChild(swatch);
    });
    popover.appendChild(grid);

    // Custom color picker row
    const customRow = document.createElement('div');
    customRow.className = 'style-palette-custom-row';

    const customLabel = document.createElement('span');
    customLabel.className = 'style-palette-custom-label';
    customLabel.textContent = 'Пользовательский:';
    customRow.appendChild(customLabel);

    const nativeInput = document.createElement('input');
    nativeInput.type = 'color';
    nativeInput.className = 'style-native-color-input';
    nativeInput.value = this.rgbaOrHexToHex(currentColor);
    nativeInput.oninput = (e) => {
      onSelect(e.target.value);
    };
    customRow.appendChild(nativeInput);
    popover.appendChild(customRow);

    document.body.appendChild(popover);
    this.activePopover = popover;
    anchorBtn.classList.add('active');

    // Position popover
    const rect = anchorBtn.getBoundingClientRect();
    const popoverWidth = 224;
    const popoverHeight = 180;
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - 10) {
      left = window.innerWidth - popoverWidth - 10;
    }
    popover.style.left = `${Math.max(10, left)}px`;

    if (rect.bottom + popoverHeight > window.innerHeight - 10 && rect.top - popoverHeight > 10) {
      popover.style.top = `${rect.top - popoverHeight - 6}px`;
    } else {
      popover.style.top = `${rect.bottom + 6}px`;
    }
  }

  closeColorPopover() {
    if (this.activePopover) {
      this.activePopover.remove();
      this.activePopover = null;
    }
    document.querySelectorAll('.style-color-btn.active').forEach(b => b.classList.remove('active'));
  }

  rgbaOrHexToHex(color) {
    if (!color) return '#2962ff';
    if (color.startsWith('#')) return color.slice(0, 7);
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (m) {
      const r = parseInt(m[1]).toString(16).padStart(2, '0');
      const g = parseInt(m[2]).toString(16).padStart(2, '0');
      const b = parseInt(m[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
    return '#2962ff';
  }
}

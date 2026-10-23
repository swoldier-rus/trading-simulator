// components/chart-style-modal.js - TradingView Main Chart Settings Modal (Symbol, Chart & Appearance tabs)
import { showToast } from '../core/utils.js';
import { eventBus } from '../core/event-bus.js';

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
    this.chartModalBody = document.getElementById('chartChartModalBody');
    this.appearanceBody = document.getElementById('chartAppearanceModalBody');
    this.tabNavSymbol = document.getElementById('tabNavSymbol');
    this.tabNavChart = document.getElementById('tabNavChart');
    this.tabNavAppearance = document.getElementById('tabNavAppearance');
    this.tabPanelSymbol = document.getElementById('tabPanelSymbol');
    this.tabPanelChart = document.getElementById('tabPanelChart');
    this.tabPanelAppearance = document.getElementById('tabPanelAppearance');

    this.btnClose = document.getElementById('btnCloseChartStyleModal');
    this.btnCancel = document.getElementById('btnChartStyleCancel');
    this.btnApply = document.getElementById('btnChartStyleApply');
    this.btnDefault = document.getElementById('btnChartStyleDefault');

    // Active Popover & Anchor Button
    this.activePopover = null;
    this.activeAnchorBtn = null;

    // TradingView Swatch Presets
    this.presetColors = [
      '#ffffff', '#d1d4dc', '#787b86', '#434651', '#1e222d', '#000000',
      '#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#089981', '#00bcd4',
      '#2962ff', '#82b1ff', '#9c27b0', '#ab47bc', '#e91e63', '#ff5252',
      '#64b5f6', '#26a69a', '#ffb74d', '#e57373', '#ba68c8', '#90a4ae'
    ];

    this.activeTab = 'symbol';
    this.currentType = null;
    this.currentWorkingStyle = {};
    this.backupStyle = {};

    this.currentWorkingShowExecutions = true;
    this.backupShowExecutions = true;

    this.currentWorkingSessionBreaks = {
      enabled: true,
      color: 'rgba(255, 255, 255, 0.2)',
      width: 1,
      style: 'dashed'
    };
    this.backupSessionBreaks = {};

    this.init();
  }

  init() {
    if (this.btnClose) this.btnClose.onclick = () => this.cancel();
    if (this.btnCancel) this.btnCancel.onclick = () => this.cancel();
    if (this.btnApply) this.btnApply.onclick = () => this.saveAndClose();
    if (this.btnDefault) this.btnDefault.onclick = () => this.resetToDefault();

    if (this.tabNavSymbol) {
      this.tabNavSymbol.onclick = () => this.switchTab('symbol');
    }
    if (this.tabNavChart) {
      this.tabNavChart.onclick = () => this.switchTab('chart');
    }
    if (this.tabNavAppearance) {
      this.tabNavAppearance.onclick = () => this.switchTab('appearance');
    }

    if (this.modal) {
      this.modal.onclick = (e) => {
        if (e.target === this.modal) {
          this.cancel();
        }
      };

      const settingsContent = this.modal.querySelector('.tv-settings-content');
      if (settingsContent) {
        settingsContent.addEventListener('scroll', () => {
          if (this.activePopover) this.closeColorPopover();
        }, { passive: true });
      }
    }

    // Dismiss active color popover on outside click
    document.addEventListener('pointerdown', (e) => {
      if (this.activePopover && !this.activePopover.contains(e.target) && !e.target.closest('.style-color-btn')) {
        this.closeColorPopover();
      }
    });

    document.addEventListener('click', (e) => {
      if (this.activePopover && !this.activePopover.contains(e.target) && !e.target.closest('.style-color-btn')) {
        this.closeColorPopover();
      }
    });
  }

  switchTab(tabName) {
    this.closeColorPopover();
    this.activeTab = tabName;

    if (this.tabNavSymbol) this.tabNavSymbol.classList.toggle('active', tabName === 'symbol');
    if (this.tabNavChart) this.tabNavChart.classList.toggle('active', tabName === 'chart');
    if (this.tabNavAppearance) this.tabNavAppearance.classList.toggle('active', tabName === 'appearance');

    if (this.tabPanelSymbol) this.tabPanelSymbol.style.display = tabName === 'symbol' ? 'block' : 'none';
    if (this.tabPanelChart) this.tabPanelChart.style.display = tabName === 'chart' ? 'block' : 'none';
    if (this.tabPanelAppearance) this.tabPanelAppearance.style.display = tabName === 'appearance' ? 'block' : 'none';
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

  open(initialTab = 'symbol') {
    if (!this.modal) return;

    this.currentType = this.store.get('currentChartType') || 'candlestick';
    const effective = this.getEffectiveStyle(this.currentType);
    this.backupStyle = { ...effective };
    this.currentWorkingStyle = { ...effective };

    const showExecs = this.store.get('showExecutionsOnChart') !== false;
    this.backupShowExecutions = showExecs;
    this.currentWorkingShowExecutions = showExecs;

    const sessionBreaksConfig = this.store.get('sessionBreaksConfig') || {
      enabled: this.store.get('showSessionBreaks') !== false,
      color: 'rgba(255, 255, 255, 0.2)',
      width: 1,
      style: 'dashed'
    };
    this.backupSessionBreaks = { ...sessionBreaksConfig };
    this.currentWorkingSessionBreaks = { ...sessionBreaksConfig };

    if (this.modalTitle) {
      this.modalTitle.textContent = 'Настройки графика';
    }

    this.renderForm();
    this.renderChartForm();
    this.renderAppearanceForm();
    this.switchTab(initialTab);

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

    // Revert executions toggle
    if (this.backupShowExecutions !== undefined) {
      this.currentWorkingShowExecutions = this.backupShowExecutions;
      this.store.set('showExecutionsOnChart', this.backupShowExecutions);
      eventBus.emit('executions:toggle', this.backupShowExecutions);
    }

    // Revert session breaks
    if (this.backupSessionBreaks) {
      this.store.set('sessionBreaksConfig', { ...this.backupSessionBreaks });
      this.store.set('showSessionBreaks', this.backupSessionBreaks.enabled);
      if (this.store.sessionBreaksOverlay) {
        this.store.sessionBreaksOverlay.render();
      }
    }

    this.close();
  }

  saveAndClose() {
    if (this.currentType) {
      this.saveCustomStyle(this.currentType, this.currentWorkingStyle);
    }

    if (this.currentWorkingShowExecutions !== undefined) {
      this.store.set('showExecutionsOnChart', this.currentWorkingShowExecutions);
      eventBus.emit('executions:toggle', this.currentWorkingShowExecutions);
    }

    if (this.currentWorkingSessionBreaks) {
      this.store.set('sessionBreaksConfig', { ...this.currentWorkingSessionBreaks });
      this.store.set('showSessionBreaks', this.currentWorkingSessionBreaks.enabled);
      if (this.store.sessionBreaksOverlay) {
        this.store.sessionBreaksOverlay.render();
      }
    }

    showToast('Настройки графика сохранены', 'success');
    this.close();
  }

  resetToDefault() {
    this.closeColorPopover();
    if (this.activeTab === 'symbol') {
      if (!this.currentType) return;
      const defaults = DEFAULT_CHART_STYLES[this.currentType] || {};
      this.currentWorkingStyle = { ...defaults };
      this.removeCustomStyle(this.currentType);
      this.applyLivePreview();
      this.renderForm();
      showToast('Цвета свечей сброшены по умолчанию', 'info');
    } else if (this.activeTab === 'chart') {
      this.currentWorkingShowExecutions = true;
      this.applyExecutionsLivePreview();
      this.renderChartForm();
      showToast('Настройки графика сброшены по умолчанию', 'info');
    } else if (this.activeTab === 'appearance') {
      this.currentWorkingSessionBreaks = {
        enabled: true,
        color: 'rgba(255, 255, 255, 0.2)',
        width: 1,
        style: 'dashed'
      };
      this.applySessionBreaksLivePreview();
      this.renderAppearanceForm();
      showToast('Настройки оформления сброшены по умолчанию', 'info');
    }
  }

  applyExecutionsLivePreview() {
    this.store.set('showExecutionsOnChart', this.currentWorkingShowExecutions);
    eventBus.emit('executions:toggle', this.currentWorkingShowExecutions);
  }

  renderChartForm() {
    if (!this.chartModalBody) return;
    this.chartModalBody.innerHTML = '';

    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'tv-settings-section-title';
    sectionTitle.textContent = 'Торговые операции';
    this.chartModalBody.appendChild(sectionTitle);

    const row = this.createSettingRow({
      label: 'Показать сделки на графике',
      hasCheckbox: true,
      checked: this.currentWorkingShowExecutions !== false,
      onCheck: (val) => {
        this.currentWorkingShowExecutions = val;
        this.applyExecutionsLivePreview();
      }
    });

    this.chartModalBody.appendChild(row);
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

  applySessionBreaksLivePreview() {
    this.store.set('sessionBreaksConfig', { ...this.currentWorkingSessionBreaks });
    this.store.set('showSessionBreaks', this.currentWorkingSessionBreaks.enabled);
    if (this.store.components?.chartOrderMenu) {
      this.store.components.chartOrderMenu.updateCheckmarks();
    }
    if (this.store.sessionBreaksOverlay) {
      this.store.sessionBreaksOverlay.render();
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

  renderAppearanceForm() {
    if (!this.appearanceBody) return;
    this.appearanceBody.innerHTML = '';

    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'tv-settings-section-title';
    sectionTitle.textContent = 'Границы сессий';
    this.appearanceBody.appendChild(sectionTitle);

    const cfg = this.currentWorkingSessionBreaks;

    const row = this.createSettingRow({
      label: 'Границы сессий',
      hasCheckbox: true,
      checked: cfg.enabled !== false,
      onCheck: (val) => {
        cfg.enabled = val;
        this.applySessionBreaksLivePreview();
      },
      controls: [
        this.createColorButton(cfg.color || 'rgba(255, 255, 255, 0.2)', (newColor) => {
          cfg.color = newColor;
          this.applySessionBreaksLivePreview();
        }, 'Цвет границ сессий', { showOpacity: true }),
        this.createWidthSelect(cfg.width || 1, (newWidth) => {
          cfg.width = newWidth;
          this.applySessionBreaksLivePreview();
        }),
        this.createStyleSelect(cfg.style || 'dashed', (newStyle) => {
          cfg.style = newStyle;
          this.applySessionBreaksLivePreview();
        })
      ]
    });

    this.appearanceBody.appendChild(row);
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
        }, 'Бар вверх'),
        this.createColorButton(this.currentWorkingStyle.downColor || '#f23645', (c) => {
          this.currentWorkingStyle.downColor = c;
          this.applyLivePreview();
        }, 'Бар вниз')
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
    // 1. Line
    const lineRow = this.createSettingRow({
      label: 'Цвет границы и толщина',
      controls: [
        this.createColorButton(this.currentWorkingStyle.lineColor || '#2962ff', (c) => {
          this.currentWorkingStyle.lineColor = c;
          this.applyLivePreview();
        }, 'Цвет верхней линии'),
        this.createWidthSelect(this.currentWorkingStyle.lineWidth || 2, (w) => {
          this.currentWorkingStyle.lineWidth = w;
          this.applyLivePreview();
        })
      ]
    });
    this.modalBody.appendChild(lineRow);

    // 2. Gradients
    const gradRow = this.createSettingRow({
      label: 'Градиентная заливка (верх / низ)',
      controls: [
        this.createColorButton(this.currentWorkingStyle.topColor || 'rgba(41, 98, 255, 0.28)', (c) => {
          this.currentWorkingStyle.topColor = c;
          this.applyLivePreview();
        }, 'Верхний цвет градиента'),
        this.createColorButton(this.currentWorkingStyle.bottomColor || 'rgba(41, 98, 255, 0.0)', (c) => {
          this.currentWorkingStyle.bottomColor = c;
          this.applyLivePreview();
        }, 'Нижний цвет градиента')
      ]
    });
    this.modalBody.appendChild(gradRow);
  }

  renderBaselineSettings() {
    // 1. Top & bottom line colors
    const linesRow = this.createSettingRow({
      label: 'Линии (верх / низ)',
      controls: [
        this.createColorButton(this.currentWorkingStyle.topLineColor || '#089981', (c) => {
          this.currentWorkingStyle.topLineColor = c;
          this.applyLivePreview();
        }, 'Линия выше базы'),
        this.createColorButton(this.currentWorkingStyle.bottomLineColor || '#f23645', (c) => {
          this.currentWorkingStyle.bottomLineColor = c;
          this.applyLivePreview();
        }, 'Линия ниже базы'),
        this.createWidthSelect(this.currentWorkingStyle.lineWidth || 2, (w) => {
          this.currentWorkingStyle.lineWidth = w;
          this.applyLivePreview();
        })
      ]
    });
    this.modalBody.appendChild(linesRow);

    // 2. Top fill
    const topFillRow = this.createSettingRow({
      label: 'Заливка выше базовой линии',
      controls: [
        this.createColorButton(this.currentWorkingStyle.topFillColor1 || 'rgba(8, 153, 129, 0.28)', (c) => {
          this.currentWorkingStyle.topFillColor1 = c;
          this.applyLivePreview();
        }, 'Цвет у вершины'),
        this.createColorButton(this.currentWorkingStyle.topFillColor2 || 'rgba(8, 153, 129, 0.05)', (c) => {
          this.currentWorkingStyle.topFillColor2 = c;
          this.applyLivePreview();
        }, 'Цвет у базы')
      ]
    });
    this.modalBody.appendChild(topFillRow);

    // 3. Bottom fill
    const btmFillRow = this.createSettingRow({
      label: 'Заливка ниже базовой линии',
      controls: [
        this.createColorButton(this.currentWorkingStyle.bottomFillColor1 || 'rgba(242, 54, 69, 0.05)', (c) => {
          this.currentWorkingStyle.bottomFillColor1 = c;
          this.applyLivePreview();
        }, 'Цвет у базы'),
        this.createColorButton(this.currentWorkingStyle.bottomFillColor2 || 'rgba(242, 54, 69, 0.28)', (c) => {
          this.currentWorkingStyle.bottomFillColor2 = c;
          this.applyLivePreview();
        }, 'Цвет у основания')
      ]
    });
    this.modalBody.appendChild(btmFillRow);
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

  createColorButton(initialColor, onChange, tooltipTitle = 'Выбрать цвет', options = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'style-color-btn';
    btn.title = tooltipTitle;

    const inner = document.createElement('span');
    inner.className = 'style-color-inner';
    inner.style.backgroundColor = initialColor;
    inner.style.pointerEvents = 'none';
    btn.appendChild(inner);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.activePopover && this.activeAnchorBtn === btn) {
        this.closeColorPopover();
        return;
      }
      this.openColorPopover(btn, inner.style.backgroundColor || initialColor, (newColor) => {
        inner.style.backgroundColor = newColor;
        if (typeof onChange === 'function') onChange(newColor);
      }, options);
    });

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

  createStyleSelect(initialStyle = 'dashed', onChange) {
    const select = document.createElement('select');
    select.className = 'style-select-style';

    const styles = [
      { id: 'dashed', label: 'Пунктирная' },
      { id: 'dotted', label: 'Точки' },
      { id: 'solid', label: 'Сплошная' }
    ];

    styles.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.label;
      if (initialStyle === s.id) opt.selected = true;
      select.appendChild(opt);
    });

    select.onchange = (e) => {
      if (typeof onChange === 'function') onChange(e.target.value);
    };

    return select;
  }

  parseColorComponents(color) {
    if (!color) return { r: 41, g: 98, b: 255, a: 1 };
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      if (hex.length === 3) {
        const r = parseInt(hex[0] + hex[0], 16);
        const g = parseInt(hex[1] + hex[1], 16);
        const b = parseInt(hex[2] + hex[2], 16);
        return { r, g, b, a: 1 };
      }
      const r = parseInt(hex.slice(0, 2), 16) || 0;
      const g = parseInt(hex.slice(2, 4), 16) || 0;
      const b = parseInt(hex.slice(4, 6), 16) || 0;
      const a = hex.length >= 8 ? (parseInt(hex.slice(6, 8), 16) / 255) : 1;
      return { r, g, b, a };
    }
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
    if (m) {
      return {
        r: parseInt(m[1]),
        g: parseInt(m[2]),
        b: parseInt(m[3]),
        a: m[4] !== undefined ? parseFloat(m[4]) : 1
      };
    }
    return { r: 41, g: 98, b: 255, a: 1 };
  }

  formatRgba(r, g, b, a) {
    if (a >= 0.999) {
      const toHex = (n) => n.toString(16).padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
    return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 100) / 100})`;
  }

  openColorPopover(anchorBtn, currentColor, onSelect, { showOpacity = false } = {}) {
    this.closeColorPopover();

    const parsed = this.parseColorComponents(currentColor);
    let currentRgb = { r: parsed.r, g: parsed.g, b: parsed.b };
    let currentAlpha = parsed.a;

    const emitColor = () => {
      const formatted = this.formatRgba(currentRgb.r, currentRgb.g, currentRgb.b, currentAlpha);
      onSelect(formatted);
    };

    const popover = document.createElement('div');
    popover.className = 'style-color-popover';
    popover.style.position = 'fixed';
    popover.style.zIndex = '99999';

    // Prevent propagation inside popover so it doesn't dismiss itself
    popover.addEventListener('click', (e) => e.stopPropagation());
    popover.addEventListener('pointerdown', (e) => e.stopPropagation());
    popover.addEventListener('mousedown', (e) => e.stopPropagation());

    // Grid of swatches
    const grid = document.createElement('div');
    grid.className = 'style-color-palette-grid';

    this.presetColors.forEach(hex => {
      const swatch = document.createElement('div');
      swatch.className = 'style-palette-swatch';
      swatch.style.backgroundColor = hex;
      swatch.title = hex;
      swatch.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = this.parseColorComponents(hex);
        currentRgb = { r: p.r, g: p.g, b: p.b };
        emitColor();
        this.closeColorPopover();
      });
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
    const onNativeColorChange = (e) => {
      const p = this.parseColorComponents(e.target.value);
      currentRgb = { r: p.r, g: p.g, b: p.b };
      emitColor();
    };
    nativeInput.addEventListener('input', onNativeColorChange);
    nativeInput.addEventListener('change', onNativeColorChange);
    customRow.appendChild(nativeInput);
    popover.appendChild(customRow);

    // Opacity slider row
    if (showOpacity) {
      const opacityRow = document.createElement('div');
      opacityRow.className = 'style-color-opacity-row';

      const opacityLabel = document.createElement('span');
      opacityLabel.className = 'style-color-opacity-label';
      opacityLabel.textContent = 'Прозрачность:';
      opacityRow.appendChild(opacityLabel);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.step = '1';
      slider.value = String(Math.round(currentAlpha * 100));
      slider.className = 'style-color-opacity-slider';

      const valSpan = document.createElement('span');
      valSpan.className = 'style-color-opacity-val';
      valSpan.textContent = `${Math.round(currentAlpha * 100)}%`;

      slider.addEventListener('input', (e) => {
        currentAlpha = Number(e.target.value) / 100;
        valSpan.textContent = `${Math.round(currentAlpha * 100)}%`;
        emitColor();
      });

      opacityRow.appendChild(slider);
      opacityRow.appendChild(valSpan);
      popover.appendChild(opacityRow);
    }

    document.body.appendChild(popover);
    this.activePopover = popover;
    this.activeAnchorBtn = anchorBtn;
    anchorBtn.classList.add('active');

    // Position popover relative to anchor button
    const rect = anchorBtn.getBoundingClientRect();
    const popoverWidth = 224;
    const popoverHeight = showOpacity ? 220 : 180;
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - 10) {
      left = window.innerWidth - popoverWidth - 10;
    }
    popover.style.left = `${Math.max(10, Math.round(left))}px`;

    if (rect.bottom + popoverHeight > window.innerHeight - 10 && rect.top - popoverHeight > 10) {
      popover.style.top = `${Math.round(rect.top - popoverHeight - 6)}px`;
    } else {
      popover.style.top = `${Math.round(rect.bottom + 6)}px`;
    }
  }

  closeColorPopover() {
    if (this.activePopover) {
      this.activePopover.remove();
      this.activePopover = null;
    }
    this.activeAnchorBtn = null;
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

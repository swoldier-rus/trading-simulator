// components/indicator-settings-modal.js - Dynamic Indicator Settings & Appearance Modal
import { eventBus } from '../core/event-bus.js';
import { showToast } from '../core/utils.js';

const STORAGE_KEY = 'trading_simulator_indicator_settings';

const PARAM_LABELS_RU = {
  // Common inputs
  'length': 'Длина',
  'period': 'Период',
  'fastPeriod': 'Быстрый период',
  'slowPeriod': 'Медленный период',
  'signalPeriod': 'Период сигнала',
  'source': 'Источник',
  'timeframe': 'Таймфрейм',
  'stdDev': 'Станд. отклонение',
  'mult': 'Множитель',
  'multiplier': 'Множитель',
  'offset': 'Смещение',
  'smoothing': 'Сглаживание',
  'smooth': 'Сглаживание',
  'smoothLength': 'Период сглаживания',
  'overbought': 'Перекупленность',
  'oversold': 'Перепроданность',
  'middle': 'Средняя линия',
  'showMA': 'Скользящая средняя',
  'colorByDirection': 'Окрашивать по направлению',
  'atrPeriod': 'Период ATR',
  'atrMultiplier': 'Множитель ATR',
  'factor': 'Фактор',
  'step': 'Шаг',
  'maximum': 'Максимум',
  'start': 'Старт',
  'increment': 'Приращение',
  'decay': 'Затухание',
  'alpha': 'Альфа',
  'beta': 'Бета',
  'gamma': 'Гамма',
  'threshold': 'Порог',
  'level': 'Уровень',
  'upper': 'Верхняя граница',
  'lower': 'Нижняя граница',
  'showBands': 'Показывать границы',
  'basis': 'Базовая линия',
  'center': 'Центральная линия',
  'trend': 'Тренд',
  // Color inputs
  'color': 'Основной цвет',
  'upColor': 'Цвет роста (Up)',
  'downColor': 'Цвет падения (Down)',
  'macdColor': 'Линия MACD',
  'signalColor': 'Линия сигнала',
  'histUpColor': 'Гистограмма (рост)',
  'histUpFadeColor': 'Гистограмма (затухание)',
  'histDownColor': 'Гистограмма (падение)',
  'histDownFadeColor': 'Гистограмма (затухание падения)',
  'bandColor': 'Цвет полосы / фона',
  'fillColor': 'Цвет заливки',
  'baseColor': 'Базовый цвет'
};

const SOURCE_OPTIONS = [
  { value: 'close', label: 'Закрытие (close)' },
  { value: 'open', label: 'Открытие (open)' },
  { value: 'high', label: 'Максимум (high)' },
  { value: 'low', label: 'Минимум (low)' },
  { value: 'hl2', label: 'Средняя (H+L)/2' },
  { value: 'hlc3', label: 'Типичная (H+L+C)/3' },
  { value: 'ohlc4', label: 'Взвешенная (O+H+L+C)/4' }
];

const TIMEFRAME_OPTIONS = [
  { value: '', label: 'Как на графике' },
  { value: '1m', label: '1 минута' },
  { value: '5m', label: '5 минут' },
  { value: '15m', label: '15 минут' },
  { value: '1h', label: '1 час' },
  { value: '4h', label: '4 часа' },
  { value: '1D', label: '1 день' },
  { value: '1W', label: '1 неделя' }
];

const LINE_STYLE_OPTIONS = [
  { value: 'solid', label: 'Сплошная' },
  { value: 'dashed', label: 'Пунктир' },
  { value: 'dotted', label: 'Точки' }
];

const LINE_WIDTH_OPTIONS = [
  { value: 1, label: '1 px' },
  { value: 1.5, label: '1.5 px' },
  { value: 2, label: '2 px' },
  { value: 3, label: '3 px' },
  { value: 4, label: '4 px' }
];

export class IndicatorSettingsModalComponent {
  constructor(store) {
    this.store = store;

    // Modal elements
    this.modal = document.getElementById('indicatorSettingsModal');
    this.titleEl = document.getElementById('indSettingsTitle');
    this.btnClose = document.getElementById('btnCloseIndSettings');
    this.btnCancel = document.getElementById('btnIndCancel');
    this.btnApply = document.getElementById('btnIndApply');
    this.btnResetDefault = document.getElementById('btnIndResetDefault');

    // Tabs
    this.tabBtnInputs = document.getElementById('indTabBtnInputs');
    this.tabBtnStyle = document.getElementById('indTabBtnStyle');
    this.paneInputs = document.getElementById('indTabPaneInputs');
    this.paneStyle = document.getElementById('indTabPaneStyle');
    this.inputsContainer = document.getElementById('indInputsContainer');
    this.styleContainer = document.getElementById('indStyleContainer');

    // State
    this.currentHandle = null;
    this.currentDef = null;
    this.originalSettings = {};
    this.workingSettings = {};
    this.activeTab = 'inputs';
    this.isOpen = false;

    this.init();
  }

  init() {
    if (!this.modal) return;

    // Close handlers
    if (this.btnClose) {
      this.btnClose.onclick = () => this.close(true);
    }
    if (this.btnCancel) {
      this.btnCancel.onclick = () => this.close(true);
    }
    if (this.btnApply) {
      this.btnApply.onclick = () => this.apply();
    }
    if (this.btnResetDefault) {
      this.btnResetDefault.onclick = () => this.resetDefault();
    }

    // Tab buttons
    if (this.tabBtnInputs) {
      this.tabBtnInputs.onclick = () => this.switchTab('inputs');
    }
    if (this.tabBtnStyle) {
      this.tabBtnStyle.onclick = () => this.switchTab('style');
    }

    // Click backdrop to close (revert)
    this.modal.onclick = (e) => {
      if (e.target === this.modal) {
        this.close(true);
      }
    };

    // Keyboard ESC to close
    document.addEventListener('keydown', (e) => {
      if (this.isOpen && e.key === 'Escape') {
        this.close(true);
      }
    });

    // Listen to global openSettings event
    eventBus.on('indicator:openSettings', ({ handle, indicatorId }) => {
      this.open(handle, indicatorId);
    });
  }

  switchTab(tab) {
    this.activeTab = tab;
    if (this.tabBtnInputs && this.tabBtnStyle && this.paneInputs && this.paneStyle) {
      if (tab === 'inputs') {
        this.tabBtnInputs.classList.add('active');
        this.tabBtnStyle.classList.remove('active');
        this.paneInputs.classList.add('active');
        this.paneStyle.classList.remove('active');
      } else {
        this.tabBtnInputs.classList.remove('active');
        this.tabBtnStyle.classList.add('active');
        this.paneInputs.classList.remove('active');
        this.paneStyle.classList.add('active');
      }
    }
  }

  /**
   * Open the settings dialog for an indicator instance handle.
   * @param {Object} handle - OpenAlgo indicator handle
   * @param {string|Object} [indicatorDefOrId] - indicator descriptor or ID
   */
  open(handle, indicatorDefOrId) {
    if (!handle) return;

    let def = null;
    if (indicatorDefOrId && typeof indicatorDefOrId === 'object' && indicatorDefOrId.inputs) {
      def = indicatorDefOrId;
    } else {
      const id = (typeof indicatorDefOrId === 'string' ? indicatorDefOrId : null) || handle.indicatorId || handle.id;
      if (window.OpenAlgoCharts && typeof window.OpenAlgoCharts.registeredIndicators === 'function') {
        const registered = window.OpenAlgoCharts.registeredIndicators();
        def = registered.find(i => i.id === id);
      }
    }

    if (!def) {
      console.warn('[IndicatorSettingsModal] No descriptor found for indicator handle:', handle);
      showToast('Настройки для этого индикатора недоступны', 'warning');
      return;
    }

    this.currentHandle = handle;
    this.currentDef = def;

    // Read current settings from handle
    const curSettings = typeof handle.settings === 'function' ? handle.settings() : (handle._settings || {});
    this.originalSettings = JSON.parse(JSON.stringify(curSettings));
    this.workingSettings = { ...this.originalSettings };

    // Update modal title
    if (this.titleEl) {
      this.titleEl.textContent = `${def.name || def.id.toUpperCase()} — Настройки`;
    }

    // Build form inputs
    this.buildInputsForm();
    this.buildStyleForm();

    // Decide which tab to open first
    const hasMathInputs = Array.isArray(def.inputs) && def.inputs.some(i => i.type !== 'color');
    this.switchTab(hasMathInputs ? 'inputs' : 'style');

    // Show modal
    this.modal.style.display = 'flex';
    this.isOpen = true;
  }

  close(revert = false) {
    if (revert && this.currentHandle && this.originalSettings) {
      try {
        if (typeof this.currentHandle.setSettings === 'function') {
          this.currentHandle.setSettings(this.originalSettings);
        }
        if (this.store.chart && typeof this.store.chart.invalidate === 'function') {
          this.store.chart.invalidate(e => e.invalidateGlobal(3));
        }
      } catch (err) {
        console.warn('[IndicatorSettingsModal] Error reverting settings:', err);
      }
    }

    if (this.modal) {
      this.modal.style.display = 'none';
    }
    this.isOpen = false;
    this.currentHandle = null;
    this.currentDef = null;
  }

  apply() {
    if (!this.currentHandle || !this.currentDef) return;

    const indId = this.currentDef.id;
    const indName = this.currentDef.name || indId;
    const settingsCopy = { ...this.workingSettings };

    try {
      // 1. Apply live settings
      if (typeof this.currentHandle.setSettings === 'function') {
        this.currentHandle.setSettings(settingsCopy);
      }

      if (this.store.chart && typeof this.store.chart.invalidate === 'function') {
        this.store.chart.invalidate(e => e.invalidateGlobal(3));
      }

      // 2. Persist in localStorage
      this.saveToStorage(indId, settingsCopy);

      showToast(`Настройки ${indName} сохранены`, 'success');
      this.close(false);
      eventBus.emit('indicators:settings_updated', {
        id: indId,
        settings: settingsCopy
      });
    } catch (err) {
      console.error('[IndicatorSettingsModal] Failed to apply settings:', err);
      showToast(`Ошибка сохранения настроек: ${err.message}`, 'error');
    }
  }

  resetDefault() {
    if (!this.currentHandle || !this.currentDef) return;

    const def = this.currentDef;
    const defaults = {};

    // Inputs defaults
    if (Array.isArray(def.inputs)) {
      for (const inp of def.inputs) {
        if (inp.default !== undefined) {
          defaults[inp.key] = inp.default;
        }
      }
    }

    // Plots defaults
    if (Array.isArray(def.plots)) {
      for (const p of def.plots) {
        if (p.style) {
          if (p.style.lineWidth !== undefined) defaults[`${p.key}:width`] = p.style.lineWidth;
          if (p.style.lineStyle !== undefined) defaults[`${p.key}:lineStyle`] = p.style.lineStyle;
          if (p.style.color !== undefined) defaults[`${p.key}:color`] = p.style.color;
          if (p.style.opacity !== undefined) defaults[`${p.key}:opacity`] = p.style.opacity;
        }
      }
    }

    this.workingSettings = { ...this.workingSettings, ...defaults };

    try {
      if (typeof this.currentHandle.setSettings === 'function') {
        this.currentHandle.setSettings(this.workingSettings);
      }
      if (this.store.chart && typeof this.store.chart.invalidate === 'function') {
        this.store.chart.invalidate(e => e.invalidateGlobal(3));
      }

      // Refresh form controls with the new values
      this.buildInputsForm();
      this.buildStyleForm();

      showToast('Настройки сброшены по умолчанию', 'info');
    } catch (err) {
      console.warn('[IndicatorSettingsModal] Error resetting defaults:', err);
    }
  }

  onParamChange(key, value) {
    this.workingSettings[key] = value;

    // Apply live preview to chart
    if (this.currentHandle && typeof this.currentHandle.setSettings === 'function') {
      try {
        this.currentHandle.setSettings(this.workingSettings);
        if (this.store.chart && typeof this.store.chart.invalidate === 'function') {
          this.store.chart.invalidate(e => e.invalidateGlobal(3));
        }
      } catch (err) {
        console.warn(`[IndicatorSettingsModal] Live update error for ${key}:`, err);
      }
    }
  }

  buildInputsForm() {
    if (!this.inputsContainer) return;
    this.inputsContainer.innerHTML = '';

    const def = this.currentDef;
    if (!def || !Array.isArray(def.inputs)) {
      this.inputsContainer.innerHTML = '<div class="ind-empty-message">Нет доступных аргументов</div>';
      return;
    }

    // Filter out pure visual colors which are rendered in Style tab
    const mathInputs = def.inputs.filter(inp => inp.type !== 'color');

    if (mathInputs.length === 0) {
      this.inputsContainer.innerHTML = '<div class="ind-empty-message">У этого индикатора нет дополнительных аргументов</div>';
      return;
    }

    for (const inp of mathInputs) {
      const row = document.createElement('div');
      row.className = 'ind-setting-row';

      const labelText = PARAM_LABELS_RU[inp.key] || inp.label || inp.key;
      const curVal = this.workingSettings[inp.key] !== undefined ? this.workingSettings[inp.key] : inp.default;

      if (inp.type === 'number') {
        row.innerHTML = `
          <label class="ind-setting-label" for="inp_${inp.key}" title="${inp.tooltip || ''}">${labelText}</label>
          <div class="ind-setting-control">
            <input type="number" id="inp_${inp.key}" class="ind-number-input"
              value="${curVal !== undefined ? curVal : 0}"
              ${inp.min !== undefined ? `min="${inp.min}"` : ''}
              ${inp.max !== undefined ? `max="${inp.max}"` : ''}
              step="${inp.step || (Number.isInteger(inp.default) ? '1' : '0.1')}">
          </div>
        `;
        const numInput = row.querySelector(`#inp_${inp.key}`);
        numInput.addEventListener('input', (e) => {
          const raw = e.target.value;
          const val = inp.step && inp.step < 1 ? parseFloat(raw) : Number(raw);
          if (!Number.isNaN(val)) {
            this.onParamChange(inp.key, val);
          }
        });
      } else if (inp.type === 'source') {
        const optionsHtml = SOURCE_OPTIONS.map(opt => `
          <option value="${opt.value}" ${opt.value === curVal ? 'selected' : ''}>${opt.label}</option>
        `).join('');
        row.innerHTML = `
          <label class="ind-setting-label" for="inp_${inp.key}">${labelText}</label>
          <div class="ind-setting-control">
            <select id="inp_${inp.key}" class="ind-select">${optionsHtml}</select>
          </div>
        `;
        const sel = row.querySelector(`#inp_${inp.key}`);
        sel.addEventListener('change', (e) => {
          this.onParamChange(inp.key, e.target.value);
        });
      } else if (inp.type === 'interval') {
        const optionsHtml = TIMEFRAME_OPTIONS.map(opt => `
          <option value="${opt.value}" ${opt.value === curVal ? 'selected' : ''}>${opt.label}</option>
        `).join('');
        row.innerHTML = `
          <label class="ind-setting-label" for="inp_${inp.key}">${labelText}</label>
          <div class="ind-setting-control">
            <select id="inp_${inp.key}" class="ind-select">${optionsHtml}</select>
          </div>
        `;
        const sel = row.querySelector(`#inp_${inp.key}`);
        sel.addEventListener('change', (e) => {
          this.onParamChange(inp.key, e.target.value);
        });
      } else if (inp.type === 'boolean' || inp.type === 'bool') {
        row.className = 'ind-checkbox-row';
        const isChecked = !!curVal;
        row.innerHTML = `
          <input type="checkbox" id="inp_${inp.key}" class="ind-checkbox" ${isChecked ? 'checked' : ''}>
          <label class="ind-checkbox-label" for="inp_${inp.key}">${labelText}</label>
        `;
        const chk = row.querySelector(`#inp_${inp.key}`);
        chk.addEventListener('change', (e) => {
          this.onParamChange(inp.key, e.target.checked);
        });
      } else if (inp.type === 'select') {
        const opts = Array.isArray(inp.options) ? inp.options : [];
        const optionsHtml = opts.map(opt => {
          const val = typeof opt === 'object' ? opt.value : opt;
          const lbl = typeof opt === 'object' ? opt.label : opt;
          return `<option value="${val}" ${val === curVal ? 'selected' : ''}>${lbl}</option>`;
        }).join('');
        row.innerHTML = `
          <label class="ind-setting-label" for="inp_${inp.key}">${labelText}</label>
          <div class="ind-setting-control">
            <select id="inp_${inp.key}" class="ind-select">${optionsHtml}</select>
          </div>
        `;
        const sel = row.querySelector(`#inp_${inp.key}`);
        sel.addEventListener('change', (e) => {
          this.onParamChange(inp.key, e.target.value);
        });
      } else {
        // Fallback for text or unknown
        row.innerHTML = `
          <label class="ind-setting-label" for="inp_${inp.key}">${labelText}</label>
          <div class="ind-setting-control">
            <input type="text" id="inp_${inp.key}" class="ind-select" value="${curVal || ''}">
          </div>
        `;
        const txt = row.querySelector(`#inp_${inp.key}`);
        txt.addEventListener('input', (e) => {
          this.onParamChange(inp.key, e.target.value);
        });
      }

      this.inputsContainer.appendChild(row);
    }
  }

  buildStyleForm() {
    if (!this.styleContainer) return;
    this.styleContainer.innerHTML = '';

    const def = this.currentDef;
    if (!def) return;

    // 1. Render declared plots (lines, histograms, columns)
    if (Array.isArray(def.plots) && def.plots.length > 0) {
      for (const plot of def.plots) {
        const plotRow = document.createElement('div');
        plotRow.className = 'ind-plot-row';

        const plotTitle = plot.title || plot.key.toUpperCase();
        // Determine associated color key: either plot.colorKey, or key directly, or 'color'
        const colorKey = plot.colorKey || (this.workingSettings[plot.key + ':color'] ? plot.key + ':color' : 'color');
        const curColor = this.normalizeHexColor(this.workingSettings[colorKey] || this.workingSettings[plot.key + ':color'] || plot.style?.color || '#2962ff');

        const curWidth = this.workingSettings[`${plot.key}:width`] !== undefined
          ? this.workingSettings[`${plot.key}:width`]
          : (plot.style?.lineWidth || 1.5);

        const curLineStyle = this.workingSettings[`${plot.key}:lineStyle`] || plot.style?.lineStyle || 'solid';

        const widthOptions = LINE_WIDTH_OPTIONS.map(w => `
          <option value="${w.value}" ${Number(w.value) === Number(curWidth) ? 'selected' : ''}>${w.label}</option>
        `).join('');

        const styleOptions = LINE_STYLE_OPTIONS.map(s => `
          <option value="${s.value}" ${s.value === curLineStyle ? 'selected' : ''}>${s.label}</option>
        `).join('');

        plotRow.innerHTML = `
          <span class="ind-plot-title">${plotTitle}</span>
          <div class="ind-plot-controls">
            <div class="ind-color-box" title="Цвет">
              <input type="color" class="ind-color-input" id="color_${plot.key}" value="${curColor}">
              <span class="ind-color-hex">${curColor}</span>
            </div>
            <select class="ind-width-select" id="width_${plot.key}" title="Толщина линии">
              ${widthOptions}
            </select>
            <select class="ind-style-select" id="style_${plot.key}" title="Стиль линии">
              ${styleOptions}
            </select>
          </div>
        `;

        // Color input listener
        const colInput = plotRow.querySelector(`#color_${plot.key}`);
        const hexLabel = plotRow.querySelector('.ind-color-hex');
        colInput.addEventListener('input', (e) => {
          const hex = e.target.value;
          hexLabel.textContent = hex;
          if (plot.colorKey) {
            this.onParamChange(plot.colorKey, hex);
          } else {
            this.onParamChange(`${plot.key}:color`, hex);
          }
        });

        // Width listener
        const widthSelect = plotRow.querySelector(`#width_${plot.key}`);
        widthSelect.addEventListener('change', (e) => {
          this.onParamChange(`${plot.key}:width`, parseFloat(e.target.value));
        });

        // Line style listener
        const styleSelect = plotRow.querySelector(`#style_${plot.key}`);
        styleSelect.addEventListener('change', (e) => {
          this.onParamChange(`${plot.key}:lineStyle`, e.target.value);
        });

        this.styleContainer.appendChild(plotRow);
      }
    }

    // 2. Render standalone color inputs that weren't directly mapped to a single plot
    if (Array.isArray(def.inputs)) {
      const colorInputs = def.inputs.filter(inp => inp.type === 'color');
      const alreadyCoveredKeys = new Set(
        (def.plots || []).map(p => p.colorKey).filter(Boolean)
      );

      for (const colInp of colorInputs) {
        if (alreadyCoveredKeys.has(colInp.key) && def.plots && def.plots.length === 1) {
          // Skip if already represented by the single plot above
          continue;
        }

        const row = document.createElement('div');
        row.className = 'ind-setting-row';

        const labelText = PARAM_LABELS_RU[colInp.key] || colInp.label || colInp.key;
        const curColor = this.normalizeHexColor(this.workingSettings[colInp.key] || colInp.default || '#2962ff');

        row.innerHTML = `
          <label class="ind-setting-label" for="col_${colInp.key}">${labelText}</label>
          <div class="ind-setting-control">
            <div class="ind-color-box">
              <input type="color" id="col_${colInp.key}" class="ind-color-input" value="${curColor}">
              <span class="ind-color-hex" id="hex_${colInp.key}">${curColor}</span>
            </div>
          </div>
        `;

        const input = row.querySelector(`#col_${colInp.key}`);
        const hex = row.querySelector(`#hex_${colInp.key}`);
        input.addEventListener('input', (e) => {
          const val = e.target.value;
          hex.textContent = val;
          this.onParamChange(colInp.key, val);
        });

        this.styleContainer.appendChild(row);
      }
    }
  }

  normalizeHexColor(col) {
    if (!col || typeof col !== 'string') return '#2962ff';
    if (col.startsWith('#')) {
      if (col.length === 4) {
        return '#' + col[1] + col[1] + col[2] + col[2] + col[3] + col[3];
      }
      return col.slice(0, 7);
    }
    // Simple RGB parsing if needed
    const rgbMatch = col.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbMatch) {
      const r = Number(rgbMatch[1]).toString(16).padStart(2, '0');
      const g = Number(rgbMatch[2]).toString(16).padStart(2, '0');
      const b = Number(rgbMatch[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
    return '#2962ff';
  }

  // --- Persistence in localStorage ---
  loadAllSavedSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn('[IndicatorSettingsModal] Error loading settings from storage:', e);
      return {};
    }
  }

  getSavedSettings(indicatorId) {
    const all = this.loadAllSavedSettings();
    return all[indicatorId] || null;
  }

  saveToStorage(indicatorId, settings) {
    try {
      const all = this.loadAllSavedSettings();
      all[indicatorId] = { ...settings };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
      console.warn('[IndicatorSettingsModal] Error saving settings to storage:', e);
    }
  }
}

// components/modals.js - Settings & Indicators Modals Component
import { eventBus } from '../core/event-bus.js';
import { API } from '../api.js';
import { showToast } from '../core/utils.js';

export class ModalsComponent {
  constructor(store) {
    this.store = store;

    // Settings Modal
    this.btnOpenSettings = document.getElementById('btnOpenSettings');
    this.settingsModal = document.getElementById('settingsModal');
    this.btnCloseSettings = document.getElementById('btnCloseSettings');
    this.btnCloseSettingsBottom = document.getElementById('btnCloseSettingsBottom');
    this.btnSaveSettings = document.getElementById('btnSaveSettings');
    this.btnTestToken = document.getElementById('btnTestToken');
    this.inputTinkoffToken = document.getElementById('inputTinkoffToken');
    this.inputInitialBalance = document.getElementById('inputInitialBalance');
    this.inputCommission = document.getElementById('inputCommission');
    this.tokenTestResult = document.getElementById('tokenTestResult');

    // Indicators Modal
    this.btnOpenIndicators = document.getElementById('btnOpenIndicators');
    this.indicatorsModal = document.getElementById('indicatorsModal');
    this.btnCloseIndicators = document.getElementById('btnCloseIndicators');
    this.btnDoneIndicators = document.getElementById('btnDoneIndicators');
    this.inputSearchIndicator = document.getElementById('inputSearchIndicator');
    this.indicatorListContainer = document.getElementById('indicatorListContainer');
    this.activeIndicatorCount = document.getElementById('activeIndicatorCount');

    this.activeIndicators = new Map(); // id -> handle

    this.init();
  }

  init() {
    this.initSettingsModal();
    this.initIndicatorsModal();
  }

  initSettingsModal() {
    if (!this.btnOpenSettings || !this.settingsModal) return;

    this.btnOpenSettings.onclick = async () => {
      const cfg = await API.getSettings();
      if (cfg) {
        if (this.inputInitialBalance) this.inputInitialBalance.value = cfg.initialBalance || 100000;
        if (this.inputCommission) this.inputCommission.value = cfg.commission || 0.05;
        if (cfg.tokenPreview && this.inputTinkoffToken) {
          this.inputTinkoffToken.placeholder = `Активен (${cfg.tokenPreview})`;
        }
      }
      this.settingsModal.classList.add('open');
    };

    if (this.btnCloseSettings) {
      this.btnCloseSettings.onclick = () => this.settingsModal.classList.remove('open');
    }
    if (this.btnCloseSettingsBottom) {
      this.btnCloseSettingsBottom.onclick = () => this.settingsModal.classList.remove('open');
    }

    if (this.btnTestToken) {
      this.btnTestToken.onclick = async () => {
        const token = this.inputTinkoffToken ? this.inputTinkoffToken.value.trim() : '';
        if (this.tokenTestResult) {
          this.tokenTestResult.style.display = 'block';
          this.tokenTestResult.style.color = '#787b86';
          this.tokenTestResult.textContent = 'Проверка подключения к T-Invest API...';
        }

        const res = await API.testToken(token);
        if (this.tokenTestResult) {
          if (res.ok) {
            this.tokenTestResult.style.color = '#089981';
            this.tokenTestResult.textContent = '✓ ' + (res.message || 'Подключение успешно! Токен действителен.');
          } else {
            this.tokenTestResult.style.color = '#f23645';
            this.tokenTestResult.textContent = '✗ ' + (res.error || 'Ошибка проверки токена');
          }
        }
      };
    }

    if (this.btnSaveSettings) {
      this.btnSaveSettings.onclick = async () => {
        const payload = {
          initialBalance: Number(this.inputInitialBalance ? this.inputInitialBalance.value : 100000) || 100000,
          commission: Number(this.inputCommission ? this.inputCommission.value : 0.05) || 0.05
        };

        if (this.inputTinkoffToken && this.inputTinkoffToken.value.trim().length > 10) {
          payload.tinkoffToken = this.inputTinkoffToken.value.trim();
        }

        const res = await API.saveSettings(payload);
        if (res.ok) {
          if (this.store.paperAccount) {
            this.store.paperAccount.commissionRate = payload.commission / 100;
          }
          this.settingsModal.classList.remove('open');
          showToast('Настройки симулятора сохранены', 'success');
          eventBus.emit('settings:saved');
        } else {
          showToast(res.error || 'Ошибка сохранения настроек', 'error');
        }
      };
    }
  }

  initIndicatorsModal() {
    if (!this.btnOpenIndicators || !this.indicatorsModal) return;

    this.btnOpenIndicators.onclick = () => {
      this.populateIndicatorsList();
      this.indicatorsModal.classList.add('open');
    };

    if (this.btnCloseIndicators) {
      this.btnCloseIndicators.onclick = () => this.indicatorsModal.classList.remove('open');
    }
    if (this.btnDoneIndicators) {
      this.btnDoneIndicators.onclick = () => this.indicatorsModal.classList.remove('open');
    }

    if (this.inputSearchIndicator) {
      this.inputSearchIndicator.addEventListener('input', (e) => {
        if (!window.OpenAlgoCharts || !OpenAlgoCharts.registeredIndicators) return;
        const indicators = OpenAlgoCharts.registeredIndicators();
        const q = e.target.value.toLowerCase().trim();
        const filtered = indicators.filter(ind =>
          ind.id.toLowerCase().includes(q) ||
          (ind.name && ind.name.toLowerCase().includes(q)) ||
          (ind.category && ind.category.toLowerCase().includes(q))
        );
        this.renderIndicatorList(filtered);
      });
    }
  }

  populateIndicatorsList() {
    if (!window.OpenAlgoCharts || !OpenAlgoCharts.registeredIndicators) return;
    const indicators = OpenAlgoCharts.registeredIndicators();

    // Sync activeIndicators with actual active indicators on chart
    if (this.store.chart && Array.isArray(this.store.chart._indicators)) {
      this.activeIndicators.clear();
      for (const ind of this.store.chart._indicators) {
        if (ind && ind.indicatorId) {
          this.activeIndicators.set(ind.indicatorId, ind);
        }
      }
      this.updateIndicatorBadge();
    }

    this.renderIndicatorList(indicators);
  }

  renderIndicatorList(list) {
    if (!this.indicatorListContainer) return;
    this.indicatorListContainer.innerHTML = list.map(ind => {
      const isActive = this.activeIndicators.has(ind.id);
      return `
        <div class="indicator-item ${isActive ? 'active' : ''}" data-ind-id="${ind.id}">
          <div class="indicator-info">
            <span class="indicator-name">${ind.name || ind.id.toUpperCase()}</span>
            <span class="indicator-desc">${ind.category || 'Технический анализ'} (${ind.placement === 'pane' ? 'отдельное окно' : 'поверх цены'})</span>
          </div>
          <input type="checkbox" class="indicator-toggle" ${isActive ? 'checked' : ''}>
        </div>
      `;
    }).join('');

    this.indicatorListContainer.querySelectorAll('.indicator-item').forEach(item => {
      item.onclick = (e) => {
        const id = item.getAttribute('data-ind-id');
        const checkbox = item.querySelector('.indicator-toggle');

        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
        }

        const chart = this.store.chart;
        if (!chart) return;

        if (checkbox.checked) {
          try {
            const handle = chart.addIndicator(id);
            this.activeIndicators.set(id, handle);
            item.classList.add('active');
            if (this.store.chartController && typeof this.store.chartController.syncIndicatorLegendOffset === 'function') {
              this.store.chartController.syncIndicatorLegendOffset();
            }
            showToast(`Индикатор ${id.toUpperCase()} добавлен`, 'info');
          } catch (err) {
            console.error('Error adding indicator:', err);
            checkbox.checked = false;
            showToast(`Ошибка добавления индикатора: ${err.message}`, 'error');
          }
        } else {
          try {
            const handle = this.activeIndicators.get(id);
            if (handle) {
              chart.removeIndicator(handle);
              this.activeIndicators.delete(id);
              item.classList.remove('active');
              if (this.store.chartController && typeof this.store.chartController.syncIndicatorLegendOffset === 'function') {
                this.store.chartController.syncIndicatorLegendOffset();
              }
              showToast(`Индикатор ${id.toUpperCase()} удален`, 'info');
            }
          } catch (err) {
            console.error('Error removing indicator:', err);
          }
        }

        this.updateIndicatorBadge();
        eventBus.emit('indicators:change');
      };
    });
  }

  updateIndicatorBadge() {
    if (!this.activeIndicatorCount) return;
    const count = this.activeIndicators.size;
    if (count > 0) {
      this.activeIndicatorCount.textContent = count;
      this.activeIndicatorCount.style.display = 'inline-block';
    } else {
      this.activeIndicatorCount.style.display = 'none';
    }
  }

  closeAll() {
    if (this.settingsModal) this.settingsModal.classList.remove('open');
    if (this.indicatorsModal) this.indicatorsModal.classList.remove('open');
  }
}

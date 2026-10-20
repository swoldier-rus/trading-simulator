// server/config/config.manager.js - Central Configuration Manager
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.resolve(__dirname, '../../config.json');

const defaultConfig = {
  tinkoffToken: '',
  initialBalance: 100000,
  currency: 'RUB',
  commission: 0.05, // 0.05%
  selectedSymbol: 'SBER',
  selectedFigi: 'BBG004730N88',
  selectedTimeframe: '1h'
};

class ConfigManager {
  constructor() {
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return { ...defaultConfig, ...parsed };
      }
    } catch (err) {
      console.error('[ConfigManager] Error reading config.json:', err.message);
    }
    return { ...defaultConfig };
  }

  saveConfig() {
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error('[ConfigManager] Error saving config.json:', err.message);
      return false;
    }
  }

  getConfig() {
    return { ...this.config };
  }

  updateConfig(partial) {
    if (!partial || typeof partial !== 'object') return this.getConfig();

    if (partial.tinkoffToken !== undefined) {
      this.config.tinkoffToken = String(partial.tinkoffToken).trim();
    }
    if (partial.initialBalance !== undefined) {
      this.config.initialBalance = Number(partial.initialBalance) || 100000;
    }
    if (partial.commission !== undefined) {
      this.config.commission = Number(partial.commission) || 0.05;
    }
    if (partial.selectedSymbol !== undefined) {
      this.config.selectedSymbol = String(partial.selectedSymbol);
    }
    if (partial.selectedFigi !== undefined) {
      this.config.selectedFigi = String(partial.selectedFigi);
    }
    if (partial.selectedTimeframe !== undefined) {
      this.config.selectedTimeframe = String(partial.selectedTimeframe);
    }

    this.saveConfig();
    return this.getConfig();
  }
}

const configManager = new ConfigManager();
module.exports = {
  configManager,
  defaultConfig
};

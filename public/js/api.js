// API client for TradingView Simulator
const API = {
  // Get system settings & token status
  async getSettings() {
    try {
      const res = await fetch('/api/settings');
      return await res.json();
    } catch (err) {
      console.error('getSettings error:', err);
      return { hasToken: false, initialBalance: 100000 };
    }
  },

  // Save settings (including T-Investments token)
  async saveSettings(settings) {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      return await res.json();
    } catch (err) {
      console.error('saveSettings error:', err);
      return { ok: false, error: err.message };
    }
  },

  // Test token connection
  async testToken(token) {
    try {
      const res = await fetch('/api/test-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      return await res.json();
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  // Search instruments (MOEX shares)
  async searchInstruments(query) {
    try {
      const res = await fetch(`/api/instruments/search?query=${encodeURIComponent(query || '')}`);
      return await res.json();
    } catch (err) {
      console.error('searchInstruments error:', err);
      return { instruments: [] };
    }
  },

  // Fetch candles (from T-Investments or simulated fallback)
  async getCandles(ticker, figi, interval, count = 350, to = null, from = null) {
    try {
      let url = `/api/candles?ticker=${encodeURIComponent(ticker)}&figi=${encodeURIComponent(figi || '')}&interval=${encodeURIComponent(interval)}&count=${count}`;
      if (to) url += `&to=${encodeURIComponent(to)}`;
      if (from) url += `&from=${encodeURIComponent(from)}`;
      const res = await fetch(url);
      return await res.json();
    } catch (err) {
      console.error('getCandles error:', err);
      return { ok: false, candles: [] };
    }
  }
};

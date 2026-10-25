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

  // Search instruments (MOEX shares and futures)
  async searchInstruments(query, type = 'all') {
    try {
      const res = await fetch(`/api/instruments/search?query=${encodeURIComponent(query || '')}&type=${encodeURIComponent(type || 'all')}`);
      return await res.json();
    } catch (err) {
      console.error('searchInstruments error:', err);
      return { instruments: [] };
    }
  },

  // Fetch candles (from T-Investments or simulated fallback)
  async getCandles(ticker, figi, interval, count = 350, to = null, from = null, lastClose = null) {
    try {
      let url = `/api/candles?ticker=${encodeURIComponent(ticker)}&figi=${encodeURIComponent(figi || '')}&interval=${encodeURIComponent(interval)}&count=${count}`;
      if (to) url += `&to=${encodeURIComponent(to)}`;
      if (from) url += `&from=${encodeURIComponent(from)}`;
      if (lastClose) url += `&lastClose=${encodeURIComponent(lastClose)}`;
      const res = await fetch(url);
      return await res.json();
    } catch (err) {
      console.error('getCandles error:', err);
      return { ok: false, candles: [] };
    }
  },

  // Get historical boundaries (earliest and latest available dates)
  async getInstrumentBoundaries(ticker, figi, interval) {
    try {
      let url = `/api/instruments/boundaries?ticker=${encodeURIComponent(ticker || 'SBER')}&interval=${encodeURIComponent(interval || '1h')}`;
      if (figi) url += `&figi=${encodeURIComponent(figi)}`;
      const res = await fetch(url);
      return await res.json();
    } catch (err) {
      console.error('getInstrumentBoundaries error:', err);
      return { ok: false };
    }
  }
};

if (typeof window !== 'undefined') {
  window.API = API;
}

export default API;
export { API };

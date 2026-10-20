// server/services/simulation.service.js - High-Fidelity Synthetic Candlestick Engine
function intervalToSeconds(interval) {
  switch ((interval || '').toLowerCase()) {
    case '1m': return 60;
    case '5m': return 300;
    case '15m': return 900;
    case '1h': return 3600;
    case '4h': return 14400;
    case '1d': return 86400;
    case '1w': return 604800;
    default: return 3600;
  }
}

/**
 * Generates realistic candlestick price action series for demo & fallback replay
 * @param {number} basePrice 
 * @param {string} interval 
 * @param {number} count 
 * @param {number|null} toTimestampSec 
 * @returns {Array<{ time: number, open: number, high: number, low: number, close: number, volume: number }>}
 */
function generateSimulatedCandles(basePrice, interval, count = 400, toTimestampSec = null, fromTimestampSec = null) {
  const stepSec = intervalToSeconds(interval);
  let startTime;
  let endTime;

  if (fromTimestampSec) {
    startTime = Number(fromTimestampSec);
    endTime = startTime + (count - 1) * stepSec;
  } else {
    endTime = toTimestampSec ? Number(toTimestampSec) : Math.floor(Date.now() / 1000);
    if (interval === '1d') {
      endTime = Math.floor(endTime / 86400) * 86400;
    }
    startTime = endTime - (count - 1) * stepSec;
  }

  const candles = [];
  let current = Number(basePrice) || 250;
  const volatility = 0.007; // 0.7% standard volatility

  for (let i = 0; i < count; i++) {
    const time = startTime + i * stepSec;
    const open = current;
    const change = (Math.random() - 0.495) * 2 * volatility * open;
    const close = Math.max(open * 0.1, +(open + change).toFixed(2));
    const high = +(Math.max(open, close) + Math.random() * volatility * open * 0.8).toFixed(2);
    const low = +(Math.min(open, close) - Math.random() * volatility * open * 0.8).toFixed(2);
    const volume = Math.floor(Math.random() * 40000 + 5000);

    candles.push({
      time,
      open,
      high,
      low,
      close,
      volume
    });

    current = close;
  }

  return candles;
}

module.exports = {
  intervalToSeconds,
  generateSimulatedCandles
};

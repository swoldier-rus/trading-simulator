// core/utils.js - Formatting and UI Helper Utilities

export function formatRussianPrice(p) {
  if (p === null || p === undefined || isNaN(p)) return '0,00';
  if (p >= 10) return p.toFixed(2).replace('.', ',');
  if (p >= 1) return p.toFixed(3).replace('.', ',');
  return p.toFixed(4).replace('.', ',');
}

export function formatMoney(val) {
  return Number(val || 0).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + ' ₽';
}

export function formatTimestamp(sec) {
  if (!sec) return '—';
  const d = new Date(sec * 1000);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function timeframeToSeconds(tf) {
  switch ((tf || '').toLowerCase()) {
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

export function showToast(message, type = 'info') {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.className = 'tv-toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.className = `tv-toast ${type}`;
  toast.style.display = 'flex';

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.display = 'none';
  }, 3500);
}

/**
 * Binary search for candle with exact matching timestamp.
 * Assumes candles are sorted chronologically ascending by .time.
 * Complexity: O(log N)
 * @param {Array<{time: number}>} candles
 * @param {number} targetTime
 * @returns {object|null}
 */
export function binarySearchCandleExact(candles, targetTime) {
  if (!candles || candles.length === 0 || typeof targetTime !== 'number') return null;
  let low = 0;
  let high = candles.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const midTime = candles[mid].time;
    if (midTime === targetTime) {
      return candles[mid];
    } else if (midTime < targetTime) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return null;
}

/**
 * Binary search for index of latest candle with time <= targetTime (floor index).
 * Assumes candles are sorted chronologically ascending by .time.
 * Complexity: O(log N)
 * @param {Array<{time: number}>} candles
 * @param {number} targetTime
 * @returns {number} index of floor candle, or -1 if all candles have time > targetTime
 */
export function binarySearchCandleFloorIndex(candles, targetTime) {
  if (!candles || candles.length === 0 || typeof targetTime !== 'number') return -1;
  let low = 0;
  let high = candles.length - 1;
  let floorIdx = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const midTime = candles[mid].time;
    if (midTime === targetTime) {
      return mid;
    } else if (midTime < targetTime) {
      floorIdx = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return floorIdx;
}

/**
 * Binary search for latest candle with time <= targetTime (floor candle).
 * Assumes candles are sorted chronologically ascending by .time.
 * Complexity: O(log N)
 * @param {Array<{time: number}>} candles
 * @param {number} targetTime
 * @returns {object|null}
 */
export function binarySearchCandleFloor(candles, targetTime) {
  const idx = binarySearchCandleFloorIndex(candles, targetTime);
  return idx >= 0 ? candles[idx] : null;
}


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

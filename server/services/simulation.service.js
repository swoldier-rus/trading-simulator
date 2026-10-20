// server/services/simulation.service.js - Interval Helpers (No synthetic candle generation)
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

module.exports = {
  intervalToSeconds
};

// server/services/cache.service.js - In-memory Server-side Cache with TTL
class ServerCacheService {
  constructor(defaultTtlMs = 60 * 1000) {
    this.cache = new Map();
    this.defaultTtlMs = defaultTtlMs;
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key, data, ttlMs = this.defaultTtlMs) {
    this.cache.set(key, {
      timestamp: Date.now(),
      ttl: ttlMs,
      data
    });
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

const candleCache = new ServerCacheService(60 * 1000);
module.exports = {
  ServerCacheService,
  candleCache
};

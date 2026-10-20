// server/services/rate-limiter.service.js - Token Bucket Rate Limiter with Exponential Backoff
class RateLimiterService {
  constructor(options = {}) {
    this.maxTokens = options.capacity || 10;
    this.tokens = this.maxTokens;
    this.refillRatePerSec = options.refillRatePerSec || 5; // 5 tokens per second
    this.lastRefill = Date.now();
    this.queue = [];
    this.isProcessing = false;

    // Background interval to continuously process queued requests
    this.refillTimer = setInterval(() => {
      this.refill();
      this.processQueue();
    }, 100);
  }

  refill() {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsedSec * this.refillRatePerSec);
    this.lastRefill = now;
  }

  acquire() {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.processQueue();
    });
  }

  processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      this.refill();
      while (this.queue.length > 0 && this.tokens >= 1) {
        this.tokens -= 1;
        const resolve = this.queue.shift();
        resolve();
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Executes an asynchronous task adhering to rate limits and handling 429 backoff
   * @param {Function} task - Async function returning response
   * @param {Object} opts - { maxRetries: 3, baseDelayMs: 600 }
   */
  async executeWithRetry(task, opts = {}) {
    const maxRetries = opts.maxRetries || 3;
    const baseDelayMs = opts.baseDelayMs || 600;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      await this.acquire();
      try {
        const result = await task();

        // If the task returned a fetch Response object, inspect HTTP status
        if (result && typeof result.status === 'number') {
          if (result.status === 429) {
            console.warn(`[RateLimiter] HTTP 429 Rate Limit encountered. Attempt ${attempt}/${maxRetries}. Backing off...`);
            if (attempt < maxRetries) {
              const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 200;
              await new Promise(r => setTimeout(r, delay));
              continue;
            }
          }
        }
        return result;
      } catch (err) {
        const isNetworkErr = err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.message.includes('fetch');
        if (isNetworkErr && attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          console.warn(`[RateLimiter] Network error (${err.message}). Retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
  }

  destroy() {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
    }
  }
}

const rateLimiter = new RateLimiterService({ capacity: 10, refillRatePerSec: 5 });
module.exports = {
  RateLimiterService,
  rateLimiter
};

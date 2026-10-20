// server/services/circuit-breaker.service.js - Circuit Breaker pattern for T-Bank API
const CIRCUIT_STATES = {
  CLOSED: 'CLOSED',       // Normal operation: requests pass through
  OPEN: 'OPEN',           // Tripped: fail fast, fallback immediately
  HALF_OPEN: 'HALF_OPEN'  // Probing: allow 1 test request to check recovery
};

class CircuitBreakerService {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 3;
    this.cooldownMs = options.cooldownMs || 30000; // 30 seconds
    this.state = CIRCUIT_STATES.CLOSED;
    this.consecutiveFailures = 0;
    this.lastFailureTime = 0;
    this.lastSuccessTime = Date.now();
  }

  canExecute() {
    if (this.state === CIRCUIT_STATES.CLOSED) {
      return true;
    }

    if (this.state === CIRCUIT_STATES.OPEN) {
      const now = Date.now();
      if (now - this.lastFailureTime > this.cooldownMs) {
        console.log('[CircuitBreaker] Cooldown expired. Moving from OPEN -> HALF_OPEN');
        this.state = CIRCUIT_STATES.HALF_OPEN;
        return true;
      }
      return false; // Still cooling down, fast fallback
    }

    if (this.state === CIRCUIT_STATES.HALF_OPEN) {
      return true; // Allow probe
    }

    return true;
  }

  recordSuccess() {
    if (this.state !== CIRCUIT_STATES.CLOSED) {
      console.log(`[CircuitBreaker] Probe succeeded. Resetting state from ${this.state} -> CLOSED`);
    }
    this.state = CIRCUIT_STATES.CLOSED;
    this.consecutiveFailures = 0;
    this.lastSuccessTime = Date.now();
  }

  recordFailure(err) {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    const errMsg = err ? (err.message || err.statusText || String(err)) : 'Unknown error';

    if (this.state === CIRCUIT_STATES.HALF_OPEN) {
      console.warn(`[CircuitBreaker] Probe failed (${errMsg}). Re-opening circuit for ${this.cooldownMs}ms`);
      this.state = CIRCUIT_STATES.OPEN;
      return;
    }

    if (this.consecutiveFailures >= this.failureThreshold) {
      console.warn(`[CircuitBreaker] Failure threshold reached (${this.consecutiveFailures}/${this.failureThreshold}). Tripping circuit to OPEN for ${this.cooldownMs}ms`);
      this.state = CIRCUIT_STATES.OPEN;
    }
  }

  getStatus() {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
      lastSuccessTime: this.lastSuccessTime ? new Date(this.lastSuccessTime).toISOString() : null,
      cooldownMs: this.cooldownMs
    };
  }
}

const circuitBreaker = new CircuitBreakerService({ failureThreshold: 3, cooldownMs: 30000 });
module.exports = {
  CIRCUIT_STATES,
  CircuitBreakerService,
  circuitBreaker
};

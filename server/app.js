// server/app.js - Express Application Factory and Middleware Configuration
const express = require('express');
const cors = require('cors');
const path = require('path');

const settingsRouter = require('./routes/settings.router');
const instrumentsRouter = require('./routes/instruments.router');
const candlesRouter = require('./routes/candles.router');

const { circuitBreaker } = require('./services/circuit-breaker.service');
const { candleCache } = require('./services/cache.service');

const app = express();

// Global Middlewares
app.use(cors());
app.use(express.json());

// Static Files Hosting
const publicPath = path.resolve(__dirname, '../public');
const openalgoDistPath = path.resolve(__dirname, '../node_modules/openalgo-charts/dist');

app.use(express.static(publicPath));
app.use('/vendor/openalgo-charts', express.static(openalgoDistPath));

// API Routers
app.use('/api', settingsRouter);
app.use('/api', instrumentsRouter);
app.use('/api', candlesRouter);

// Health check & Diagnostic Status Route
app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    uptimeSeconds: Math.floor(process.uptime()),
    circuitBreaker: circuitBreaker.getStatus(),
    cachedCandlesCount: candleCache.size(),
    timestamp: new Date().toISOString()
  });
});

module.exports = app;

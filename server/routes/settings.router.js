// server/routes/settings.router.js - Settings and Token Verification Routes
const express = require('express');
const { configManager } = require('../config/config.manager');
const { tinkoffService } = require('../services/tinkoff.service');
const { candleCache } = require('../services/cache.service');

const router = express.Router();

// GET /api/settings - Read current settings & token preview
router.get('/settings', (req, res) => {
  const currentConfig = configManager.getConfig();
  const token = currentConfig.tinkoffToken || '';
  const tokenPreview = token.length > 8 ? `${token.slice(0, 4)}...${token.slice(-4)}` : '';

  res.json({
    hasToken: Boolean(token && token.trim().length > 10),
    tokenPreview,
    initialBalance: currentConfig.initialBalance,
    currency: currentConfig.currency,
    commission: currentConfig.commission,
    selectedSymbol: currentConfig.selectedSymbol,
    selectedFigi: currentConfig.selectedFigi,
    selectedTimeframe: currentConfig.selectedTimeframe
  });
});

// POST /api/settings - Update settings & persist to config.json
router.post('/settings', (req, res) => {
  const { tinkoffToken, initialBalance, commission, selectedSymbol, selectedFigi, selectedTimeframe } = req.body;

  configManager.updateConfig({
    tinkoffToken,
    initialBalance,
    commission,
    selectedSymbol,
    selectedFigi,
    selectedTimeframe
  });

  // Clear in-memory cache when settings/token changes
  candleCache.clear();
  res.json({ ok: true, message: 'Настройки успешно сохранены' });
});

// POST /api/test-token - Test validity of token via T-Bank API
router.post('/test-token', async (req, res) => {
  const currentConfig = configManager.getConfig();
  const token = req.body.token || currentConfig.tinkoffToken;

  const result = await tinkoffService.testToken(token);
  if (!result.ok) {
    return res.status(result.status || 400).json(result);
  }
  return res.json(result);
});

module.exports = router;

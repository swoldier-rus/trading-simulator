// server/index.js - Server Bootstrap & Listener
const app = require('./app');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` TradingView Market Simulator running on http://localhost:${PORT}`);
  console.log(` Data Source: T-Investments API (with Demo Fallback)`);
  console.log(` Architecture: Modular Express Backend with Rate Limiting`);
  console.log(` Powered by OpenAlgo Charts Engine`);
  console.log(`=======================================================`);
});

module.exports = server;

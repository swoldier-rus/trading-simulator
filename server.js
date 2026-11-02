// Suppress the standard Node security warning for NODE_TLS_REJECT_UNAUTHORIZED
process.on('warning', (warning) => {
  if (warning.message && warning.message.includes('NODE_TLS_REJECT_UNAUTHORIZED')) {
    return;
  }
  console.warn(warning);
});

// Allow TLS connections with Russian Ministry of Digital Development (Минцифры) certs used by T-Bank
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Delegate to modular server architecture
module.exports = require('./server/index.js');

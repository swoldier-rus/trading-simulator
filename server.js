// Allow TLS connections with Russian Ministry of Digital Development (Минцифры) certs used by T-Bank
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Delegate to modular server architecture
module.exports = require('./server/index.js');

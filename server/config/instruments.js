// server/config/instruments.js - Catalog of default Russian Blue Chips
const DEFAULT_INSTRUMENTS = [
  { ticker: 'SBER', name: 'Сбер Банк', figi: 'BBG004730N88', basePrice: 280, currency: 'RUB', lot: 10 },
  { ticker: 'GAZP', name: 'Газпром', figi: 'BBG004730RP0', basePrice: 145, currency: 'RUB', lot: 10 },
  { ticker: 'LKOH', name: 'ЛУКОЙЛ', figi: 'BBG004731032', basePrice: 7200, currency: 'RUB', lot: 1 },
  { ticker: 'T', name: 'Т-Технологии (Т-Банк)', figi: 'TCS00A107UL4', basePrice: 2600, currency: 'RUB', lot: 1 },
  { ticker: 'YNDX', name: 'Яндекс (МКПАО)', figi: 'BBG006L8G4H1', basePrice: 4100, currency: 'RUB', lot: 1 },
  { ticker: 'ROSN', name: 'Роснефть', figi: 'BBG004731354', basePrice: 520, currency: 'RUB', lot: 1 },
  { ticker: 'GMKN', name: 'Норникель', figi: 'BBG004731489', basePrice: 130, currency: 'RUB', lot: 10 },
  { ticker: 'NVTK', name: 'НОВАТЭК', figi: 'BBG00475KKY8', basePrice: 980, currency: 'RUB', lot: 1 },
  { ticker: 'MGNT', name: 'Магнит', figi: 'BBG004RVFFC0', basePrice: 5600, currency: 'RUB', lot: 1 },
  { ticker: 'VTBR', name: 'Банк ВТБ', figi: 'BBG004730ZJ9', basePrice: 85, currency: 'RUB', lot: 100 },
  { ticker: 'PLZL', name: 'Полюс', figi: 'BBG000R607Y3', basePrice: 14500, currency: 'RUB', lot: 1 },
  { ticker: 'TATN', name: 'Татнефть', figi: 'BBG004RVFFD9', basePrice: 620, currency: 'RUB', lot: 1 },
  { ticker: 'ALRS', name: 'АЛРОСА', figi: 'BBG004S683W7', basePrice: 58, currency: 'RUB', lot: 10 },
  { ticker: 'MOEX', name: 'Московская Биржа', figi: 'BBG004730JJ5', basePrice: 220, currency: 'RUB', lot: 10 },
  { ticker: 'CHMF', name: 'Северсталь', figi: 'BBG00475K6C3', basePrice: 1250, currency: 'RUB', lot: 1 }
];

function findDefaultInstrument(tickerOrFigi) {
  if (!tickerOrFigi) return null;
  const upper = tickerOrFigi.toUpperCase();
  return DEFAULT_INSTRUMENTS.find(i => i.ticker === upper || i.figi === upper) || null;
}

module.exports = {
  DEFAULT_INSTRUMENTS,
  findDefaultInstrument
};

// OpenAlgo-compatible Historical Paper Trading Engine
// Fully simulates bar-by-bar execution, Limit/Stop fills, SL/TP triggers,
// commissions, and portfolio performance analytics on historical data.

class PaperTradingAccount {
  constructor(initialBalance = 100000, commissionRate = 0.0005) {
    this.initialBalance = Number(initialBalance) || 100000;
    this.balance = this.initialBalance;
    this.commissionRate = Number(commissionRate) || 0.0005; // 0.05%
    this.positions = [];
    this.orders = [];
    this.tradeHistory = [];
    this.equityHistory = []; // { time, equity, balance }
    this.peakEquity = this.initialBalance;
    this.maxDrawdownRub = 0;
    this.maxDrawdownPct = 0;

    this.onAccountUpdate = null;
  }

  reset(initialBalance = null) {
    if (initialBalance !== null) {
      this.initialBalance = Number(initialBalance);
    }
    this.balance = this.initialBalance;
    this.positions = [];
    this.orders = [];
    this.tradeHistory = [];
    this.equityHistory = [];
    this.peakEquity = this.initialBalance;
    this.maxDrawdownRub = 0;
    this.maxDrawdownPct = 0;
    this.notifyUpdate();
  }

  // Export full account state for session persistence
  exportState() {
    return {
      initialBalance: this.initialBalance,
      balance: this.balance,
      commissionRate: this.commissionRate,
      positions: JSON.parse(JSON.stringify(this.positions || [])),
      orders: JSON.parse(JSON.stringify(this.orders || [])),
      tradeHistory: JSON.parse(JSON.stringify(this.tradeHistory || [])),
      equityHistory: JSON.parse(JSON.stringify(this.equityHistory || [])),
      peakEquity: this.peakEquity,
      maxDrawdownRub: this.maxDrawdownRub,
      maxDrawdownPct: this.maxDrawdownPct
    };
  }

  // Restore full account state from session storage
  importState(state) {
    if (!state || typeof state !== 'object') return false;
    if (state.initialBalance !== undefined) this.initialBalance = Number(state.initialBalance);
    if (state.balance !== undefined) this.balance = Number(state.balance);
    if (state.commissionRate !== undefined) this.commissionRate = Number(state.commissionRate);
    if (Array.isArray(state.positions)) this.positions = JSON.parse(JSON.stringify(state.positions));
    if (Array.isArray(state.orders)) this.orders = JSON.parse(JSON.stringify(state.orders));
    if (Array.isArray(state.tradeHistory)) this.tradeHistory = JSON.parse(JSON.stringify(state.tradeHistory));
    if (Array.isArray(state.equityHistory)) this.equityHistory = JSON.parse(JSON.stringify(state.equityHistory));
    if (state.peakEquity !== undefined) this.peakEquity = Number(state.peakEquity);
    if (state.maxDrawdownRub !== undefined) this.maxDrawdownRub = Number(state.maxDrawdownRub);
    if (state.maxDrawdownPct !== undefined) this.maxDrawdownPct = Number(state.maxDrawdownPct);
    this.notifyUpdate();
    return true;
  }

  // Open an order (Market or Limit/Stop) on historical data
  placeOrder({ symbol, side, type = 'MARKET', qty, price, sl = null, tp = null, time = null, lotSize = 1 }) {
    qty = Number(qty);
    price = Number(price);
    lotSize = Number(lotSize) || 1;
    const totalShares = qty * lotSize;

    if (!totalShares || totalShares <= 0 || !price || price <= 0) {
      return { ok: false, error: 'Некорректное количество или цена' };
    }

    const notional = totalShares * price;
    const commission = +(notional * this.commissionRate).toFixed(2);

    if (type === 'MARKET') {
      // Find existing position for the same symbol (Netting Mode)
      const existingPos = this.positions.find(p => p.symbol === symbol);

      if (!existingPos) {
        // No existing position: OPEN NEW POSITION
        if (side === 'BUY' && (notional + commission) > this.balance) {
          return {
            ok: false,
            error: `Недостаточно средств! Требуется: ${(notional + commission).toFixed(2)} ₽, доступно: ${this.balance.toFixed(2)} ₽`
          };
        }

        this.balance -= commission;

        const openTimeSec = time || Math.floor(Date.now() / 1000);

        const position = {
          id: 'pos_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
          symbol,
          side, // 'BUY' (Long) or 'SELL' (Short)
          qty: totalShares,
          lots: qty,
          lotSize,
          entryPrice: price,
          currentPrice: price,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
          sl: sl ? Number(sl) : null,
          tp: tp ? Number(tp) : null,
          openTime: openTimeSec,
          commissionPaid: commission,
          entries: [
            {
              id: 'entry_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
              time: openTimeSec,
              price: price,
              qty: totalShares,
              lots: qty,
              side: side,
              index: 1,
              cumulativeLots: qty,
              cumulativeQty: totalShares,
              avgPriceAtEntry: price
            }
          ]
        };

        this.positions.push(position);
        this._updateEquity(time);
        this.notifyUpdate();

        return {
          ok: true,
          type: 'POSITION_OPENED',
          position,
          message: `${side === 'BUY' ? 'Покупка (LONG)' : 'Продажа (SHORT)'} ${qty} лот. (${totalShares} шт.) по ${price.toFixed(2)} ₽`
        };
      }

      // Existing position found for this symbol
      if (existingPos.side === side) {
        // --------------------------------------------------------------------
        // 1. SAME DIRECTION: Scale In / Average Up or Down / Sum Positions
        // --------------------------------------------------------------------
        if (side === 'BUY' && (notional + commission) > this.balance) {
          return {
            ok: false,
            error: `Недостаточно средств для увеличения позиции! Требуется: ${(notional + commission).toFixed(2)} ₽, доступно: ${this.balance.toFixed(2)} ₽`
          };
        }

        this.balance -= commission;

        const oldShares = existingPos.qty;
        const newShares = totalShares;
        const totalSharesAgg = oldShares + newShares;
        const totalLotsAgg = existingPos.lots + qty;

        // Weighted average entry price:
        const weightedAvgPrice = +(((oldShares * existingPos.entryPrice) + (newShares * price)) / totalSharesAgg).toFixed(2);

        // Ensure entries array exists for backwards compatibility
        if (!existingPos.entries || existingPos.entries.length === 0) {
          existingPos.entries = [
            {
              id: 'entry_' + existingPos.id + '_1',
              time: existingPos.openTime,
              price: existingPos.entryPrice,
              qty: oldShares,
              lots: existingPos.lots,
              side: existingPos.side,
              index: 1,
              cumulativeLots: existingPos.lots,
              cumulativeQty: oldShares,
              avgPriceAtEntry: existingPos.entryPrice
            }
          ];
        }

        const entryTimeSec = time || Math.floor(Date.now() / 1000);
        existingPos.entries.push({
          id: 'entry_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
          time: entryTimeSec,
          price: price,
          qty: newShares,
          lots: qty,
          side: side,
          index: existingPos.entries.length + 1,
          cumulativeLots: totalLotsAgg,
          cumulativeQty: totalSharesAgg,
          avgPriceAtEntry: weightedAvgPrice
        });

        existingPos.qty = totalSharesAgg;
        existingPos.lots = totalLotsAgg;
        existingPos.entryPrice = weightedAvgPrice;
        existingPos.currentPrice = price;
        existingPos.commissionPaid = +(existingPos.commissionPaid + commission).toFixed(2);

        if (sl) existingPos.sl = Number(sl);
        if (tp) existingPos.tp = Number(tp);

        let pnl = 0;
        if (existingPos.side === 'BUY') {
          pnl = (price - existingPos.entryPrice) * existingPos.qty;
        } else {
          pnl = (existingPos.entryPrice - price) * existingPos.qty;
        }
        existingPos.unrealizedPnL = +pnl.toFixed(2);
        existingPos.unrealizedPnLPercent = +(((price - existingPos.entryPrice) / existingPos.entryPrice) * 100 * (existingPos.side === 'BUY' ? 1 : -1)).toFixed(2);

        this._updateEquity(time);
        this.notifyUpdate();

        return {
          ok: true,
          type: 'POSITION_SCALED_IN',
          position: existingPos,
          message: `Увеличение позиции ${side === 'BUY' ? 'LONG' : 'SHORT'}: +${qty} лот. по ${price.toFixed(2)} ₽ (Всего: ${totalLotsAgg} лот., средняя ${weightedAvgPrice.toFixed(2)} ₽)`
        };
      } else {
        // --------------------------------------------------------------------
        // 2. OPPOSITE DIRECTION: Close, Partial Close, or Reverse / Flip
        // --------------------------------------------------------------------
        const oldLots = existingPos.lots;
        const oldShares = existingPos.qty;
        const closeLots = Math.min(qty, oldLots);
        const closeShares = closeLots * lotSize;

        // Gross PnL for the closed portion:
        let grossPnL = 0;
        if (existingPos.side === 'BUY') {
          // Closing Long by Selling
          grossPnL = (price - existingPos.entryPrice) * closeShares;
        } else {
          // Closing Short by Buying
          grossPnL = (existingPos.entryPrice - price) * closeShares;
        }

        // Commissions on closed portion:
        const exitCommission = +(closeShares * price * this.commissionRate).toFixed(2);
        const entryCommPart = +(existingPos.commissionPaid * (closeShares / oldShares)).toFixed(2);
        const totalTradeCommission = +(exitCommission + entryCommPart).toFixed(2);

        const netTradePnL = +(grossPnL - totalTradeCommission).toFixed(2);
        const returnPct = +((grossPnL / (existingPos.entryPrice * closeShares)) * 100).toFixed(2);

        this.balance += grossPnL - exitCommission;

        const isFullClose = qty === oldLots;
        const isPartialClose = qty < oldLots;

        const trade = {
          id: existingPos.id + (isPartialClose ? '_p' + Date.now() : ''),
          symbol: existingPos.symbol,
          side: existingPos.side, // Side of the closed position
          qty: closeShares,
          lots: closeLots,
          lotSize: existingPos.lotSize,
          entryPrice: existingPos.entryPrice,
          exitPrice: price,
          pnl: netTradePnL,
          pnlPercent: returnPct,
          openTime: existingPos.openTime,
          closeTime: time || Math.floor(Date.now() / 1000),
          reason: isFullClose
            ? 'Закрытие встречной заявкой'
            : (isPartialClose ? `Частичное закрытие (${closeLots} из ${oldLots} лот.)` : 'Переворот позиции'),
          totalCommission: totalTradeCommission,
          entries: existingPos.entries ? existingPos.entries.slice() : [
            {
              id: 'entry_' + existingPos.id,
              time: existingPos.openTime,
              price: existingPos.entryPrice,
              qty: closeShares,
              lots: closeLots,
              side: existingPos.side,
              index: 1,
              cumulativeLots: closeLots,
              cumulativeQty: closeShares,
              avgPriceAtEntry: existingPos.entryPrice
            }
          ]
        };

        this.tradeHistory.unshift(trade);

        if (isFullClose) {
          // Complete close of position
          const idx = this.positions.indexOf(existingPos);
          if (idx !== -1) this.positions.splice(idx, 1);

          this._updateEquity(time);
          this.notifyUpdate();

          return {
            ok: true,
            type: 'POSITION_CLOSED',
            trade,
            message: `Позиция ${existingPos.side === 'BUY' ? 'LONG' : 'SHORT'} закрыта полностью: ${closeLots} лот. по ${price.toFixed(2)} ₽ (PnL: ${netTradePnL >= 0 ? '+' : ''}${netTradePnL.toFixed(2)} ₽)`
          };
        } else if (isPartialClose) {
          // Partial close: reduce remaining position
          existingPos.lots -= closeLots;
          existingPos.qty -= closeShares;
          existingPos.commissionPaid = +(existingPos.commissionPaid - entryCommPart).toFixed(2);

          // Entry price remains unchanged
          let pnl = 0;
          if (existingPos.side === 'BUY') {
            pnl = (price - existingPos.entryPrice) * existingPos.qty;
          } else {
            pnl = (existingPos.entryPrice - price) * existingPos.qty;
          }
          existingPos.unrealizedPnL = +pnl.toFixed(2);
          existingPos.unrealizedPnLPercent = +(((price - existingPos.entryPrice) / existingPos.entryPrice) * 100 * (existingPos.side === 'BUY' ? 1 : -1)).toFixed(2);

          this._updateEquity(time);
          this.notifyUpdate();

          return {
            ok: true,
            type: 'POSITION_PARTIAL_CLOSED',
            trade,
            position: existingPos,
            message: `Частично закрыт ${existingPos.side === 'BUY' ? 'LONG' : 'SHORT'}: ${closeLots} лот. по ${price.toFixed(2)} ₽ (Осталось: ${existingPos.lots} лот., PnL: ${netTradePnL >= 0 ? '+' : ''}${netTradePnL.toFixed(2)} ₽)`
          };
        } else {
          // Reversal / Flip (qty > oldLots)
          const idx = this.positions.indexOf(existingPos);
          if (idx !== -1) this.positions.splice(idx, 1);

          const remainingLots = qty - oldLots;
          const remainingShares = remainingLots * lotSize;
          const newNotional = remainingShares * price;
          const newCommission = +(newNotional * this.commissionRate).toFixed(2);

          this.balance -= newCommission;

          const revOpenTimeSec = time || Math.floor(Date.now() / 1000);

          const newPos = {
            id: 'pos_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            symbol,
            side,
            qty: remainingShares,
            lots: remainingLots,
            lotSize,
            entryPrice: price,
            currentPrice: price,
            unrealizedPnL: 0,
            unrealizedPnLPercent: 0,
            sl: sl ? Number(sl) : null,
            tp: tp ? Number(tp) : null,
            openTime: revOpenTimeSec,
            commissionPaid: newCommission,
            entries: [
              {
                id: 'entry_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                time: revOpenTimeSec,
                price: price,
                qty: remainingShares,
                lots: remainingLots,
                side: side,
                index: 1,
                cumulativeLots: remainingLots,
                cumulativeQty: remainingShares,
                avgPriceAtEntry: price
              }
            ]
          };

          this.positions.push(newPos);
          this._updateEquity(time);
          this.notifyUpdate();

          return {
            ok: true,
            type: 'POSITION_REVERSED',
            trade,
            position: newPos,
            message: `Переворот: закрыт ${existingPos.side} ${oldLots} лот. (PnL: ${netTradePnL >= 0 ? '+' : ''}${netTradePnL.toFixed(2)} ₽), открыт ${side} ${remainingLots} лот. по ${price.toFixed(2)} ₽`
          };
        }
      }
    } else {
      // Pending Limit or Stop Order
      const order = {
        id: 'ord_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        symbol,
        side,
        type, // 'LIMIT' or 'STOP'
        qty: totalShares,
        lots: qty,
        lotSize,
        price,
        sl: sl ? Number(sl) : null,
        tp: tp ? Number(tp) : null,
        status: 'working',
        createdTime: time || Math.floor(Date.now() / 1000)
      };

      this.orders.push(order);
      this.notifyUpdate();

      return {
        ok: true,
        type: 'ORDER_PLACED',
        order,
        message: `Заявка ${type} ${side} ${qty} лот. по ${price.toFixed(2)} ₽ выставлена`
      };
    }
  }

  // Cancel an active pending order
  cancelOrder(orderId) {
    const idx = this.orders.findIndex(o => o.id === orderId);
    if (idx === -1) return false;
    const removed = this.orders.splice(idx, 1)[0];
    this.notifyUpdate();
    return true;
  }

  // Cancel all pending orders
  cancelAllOrders() {
    const count = this.orders.length;
    this.orders = [];
    this.notifyUpdate();
    return count;
  }

  // Modify limit/stop order price or lots
  modifyOrder(orderId, patch, shiftBrackets = true) {
    const order = this.orders.find(o => o.id === orderId);
    if (!order || !patch) return false;

    // Support both numeric price (legacy signature) and patch object { price, lots }
    const patchObj = typeof patch === 'number' ? { price: patch } : patch;

    if (patchObj.price !== undefined && Number(patchObj.price) > 0) {
      const oldPrice = order.price;
      order.price = Number(patchObj.price);

      // Shift attached SL and TP brackets proportionally
      if (shiftBrackets && oldPrice > 0) {
        const delta = +(order.price - oldPrice).toFixed(2);
        if (order.sl !== null) order.sl = +(order.sl + delta).toFixed(2);
        if (order.tp !== null) order.tp = +(order.tp + delta).toFixed(2);
      }
    }

    if (patchObj.lots !== undefined) {
      const newLots = Math.max(1, Math.round(Number(patchObj.lots)));
      if (!isNaN(newLots) && newLots > 0) {
        order.lots = newLots;
        order.qty = order.lots * (order.lotSize || 1);
      }
    }

    this.notifyUpdate();
    return true;
  }

  // Update attached Stop Loss on a pending order
  updateOrderSL(orderId, sl) {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) return false;
    order.sl = sl !== undefined && sl !== null && sl !== '' ? Number(sl) : null;
    this.notifyUpdate();
    return true;
  }

  // Update attached Take Profit on a pending order
  updateOrderTP(orderId, tp) {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) return false;
    order.tp = tp !== undefined && tp !== null && tp !== '' ? Number(tp) : null;
    this.notifyUpdate();
    return true;
  }

  // Close an existing open position
  closePosition(positionId, currentPrice, time = null, reason = 'Вручную') {
    const idx = this.positions.findIndex(p => p.id === positionId || p.symbol === positionId);
    if (idx === -1) return null;

    const pos = this.positions[idx];
    currentPrice = Number(currentPrice) || pos.currentPrice;

    const notional = pos.qty * currentPrice;
    const exitCommission = +(notional * this.commissionRate).toFixed(2);
    this.balance -= exitCommission;

    let pnl = 0;
    if (pos.side === 'BUY') {
      pnl = (currentPrice - pos.entryPrice) * pos.qty;
    } else {
      pnl = (pos.entryPrice - currentPrice) * pos.qty;
    }

    const netTradePnL = +(pnl - exitCommission - pos.commissionPaid).toFixed(2);
    const returnPct = +((pnl / (pos.entryPrice * pos.qty)) * 100).toFixed(2);

    this.balance += pnl;

    const trade = {
      id: pos.id,
      symbol: pos.symbol,
      side: pos.side,
      qty: pos.qty,
      lots: pos.lots,
      lotSize: pos.lotSize,
      entryPrice: pos.entryPrice,
      exitPrice: currentPrice,
      pnl: netTradePnL,
      pnlPercent: returnPct,
      openTime: pos.openTime,
      closeTime: time || Math.floor(Date.now() / 1000),
      reason,
      totalCommission: +(exitCommission + pos.commissionPaid).toFixed(2),
      entries: pos.entries ? pos.entries.slice() : [
        {
          id: 'entry_' + pos.id,
          time: pos.openTime,
          price: pos.entryPrice,
          qty: pos.qty,
          lots: pos.lots,
          side: pos.side,
          index: 1,
          cumulativeLots: pos.lots,
          cumulativeQty: pos.qty,
          avgPriceAtEntry: pos.entryPrice
        }
      ]
    };

    this.tradeHistory.unshift(trade);
    this.positions.splice(idx, 1);

    this._updateEquity(time);
    this.notifyUpdate();
    return trade;
  }

  // Close all open positions
  closeAllPositions(currentPrice, time = null, reason = 'Закрыть все') {
    const closed = [];
    while (this.positions.length > 0) {
      const pos = this.positions[0];
      const trade = this.closePosition(pos.id, currentPrice, time, reason);
      if (trade) closed.push(trade);
    }
    return closed;
  }

  // Reverse position (e.g. from Long to Short of same size)
  reversePosition(positionId, currentPrice, time = null) {
    const idx = this.positions.findIndex(p => p.id === positionId || p.symbol === positionId);
    if (idx === -1) return null;

    const pos = this.positions[idx];
    const newSide = pos.side === 'BUY' ? 'SELL' : 'BUY';
    const lots = pos.lots;
    const lotSize = pos.lotSize;
    const symbol = pos.symbol;

    this.closePosition(pos.id, currentPrice, time, 'Переворот позиции');
    return this.placeOrder({
      symbol,
      side: newSide,
      type: 'MARKET',
      qty: lots,
      price: currentPrice,
      time,
      lotSize
    });
  }

  // Update SL & TP of an active position
  updatePositionBrackets(positionId, sl, tp) {
    const pos = this.positions.find(p => p.id === positionId || p.symbol === positionId);
    if (!pos) return false;
    pos.sl = sl !== undefined && sl !== null && sl !== '' ? Number(sl) : null;
    pos.tp = tp !== undefined && tp !== null && tp !== '' ? Number(tp) : null;
    this.notifyUpdate();
    return true;
  }

  updatePositionSL(positionId, sl) {
    const pos = this.positions.find(p => p.id === positionId || p.symbol === positionId);
    if (!pos) return false;
    return this.updatePositionBrackets(positionId, sl, pos.tp);
  }

  updatePositionTP(positionId, tp) {
    const pos = this.positions.find(p => p.id === positionId || p.symbol === positionId);
    if (!pos) return false;
    return this.updatePositionBrackets(positionId, pos.sl, tp);
  }

  // Helper to calculate intra-bar 4-tick prices for a candle
  getIntraBarTicks(candle) {
    if (!candle) return [];
    const { open, high, low, close } = candle;
    if (close >= open) {
      // Bullish candle: Open -> Low wick -> High surge -> Close
      return [open, low, high, close];
    } else {
      // Bearish candle: Open -> High wick -> Low plunge -> Close
      return [open, high, low, close];
    }
  }

  // Process individual price tick (intra-bar micro-step or real-time tick)
  onPriceTick(tickPrice, time, symbol, candle = null) {
    if (tickPrice === undefined || tickPrice === null || isNaN(tickPrice)) return [];
    tickPrice = Number(tickPrice);
    const events = [];

    // 1. Check pending Limit / Stop orders
    for (let i = this.orders.length - 1; i >= 0; i--) {
      const ord = this.orders[i];
      if (symbol && ord.symbol !== symbol) continue;

      let filled = false;
      let fillPrice = ord.price;

      if (ord.side === 'BUY') {
        if (ord.type === 'LIMIT' && tickPrice <= ord.price) {
          filled = true;
          fillPrice = (candle && candle.open < ord.price && tickPrice === candle.open) ? candle.open : ord.price;
        } else if (ord.type === 'STOP' && tickPrice >= ord.price) {
          filled = true;
          fillPrice = (candle && candle.open > ord.price && tickPrice === candle.open) ? candle.open : ord.price;
        }
      } else {
        // SELL
        if (ord.type === 'LIMIT' && tickPrice >= ord.price) {
          filled = true;
          fillPrice = (candle && candle.open > ord.price && tickPrice === candle.open) ? candle.open : ord.price;
        } else if (ord.type === 'STOP' && tickPrice <= ord.price) {
          filled = true;
          fillPrice = (candle && candle.open < ord.price && tickPrice === candle.open) ? candle.open : ord.price;
        }
      }

      if (filled) {
        this.orders.splice(i, 1);
        const res = this.placeOrder({
          symbol: ord.symbol,
          side: ord.side,
          type: 'MARKET',
          qty: ord.lots,
          price: fillPrice,
          sl: ord.sl,
          tp: ord.tp,
          time,
          lotSize: ord.lotSize
        });

        if (res.ok) {
          events.push({
            type: 'ORDER_FILLED',
            order: ord,
            fillPrice,
            position: res.position,
            message: `Исполнена заявка ${ord.symbol} ${ord.type} ${ord.side} по цене ${fillPrice.toFixed(2)} ₽`
          });
        }
      }
    }

    // 2. Check open positions for SL and TP against current tick price
    for (let i = this.positions.length - 1; i >= 0; i--) {
      const pos = this.positions[i];
      if (symbol && pos.symbol !== symbol) continue;

      let exitPrice = null;
      let reason = null;

      if (pos.side === 'BUY') {
        // Long position
        if (pos.sl !== null && tickPrice <= pos.sl) {
          exitPrice = (candle && candle.open < pos.sl && tickPrice === candle.open) ? candle.open : pos.sl;
          reason = 'Stop Loss';
        } else if (pos.tp !== null && tickPrice >= pos.tp) {
          exitPrice = (candle && candle.open > pos.tp && tickPrice === candle.open) ? candle.open : pos.tp;
          reason = 'Take Profit';
        }
      } else {
        // Short position
        if (pos.sl !== null && tickPrice >= pos.sl) {
          exitPrice = (candle && candle.open > pos.sl && tickPrice === candle.open) ? candle.open : pos.sl;
          reason = 'Stop Loss';
        } else if (pos.tp !== null && tickPrice <= pos.tp) {
          exitPrice = (candle && candle.open < pos.tp && tickPrice === candle.open) ? candle.open : pos.tp;
          reason = 'Take Profit';
        }
      }

      if (exitPrice !== null) {
        const trade = this.closePosition(pos.id, exitPrice, time, reason);
        if (trade) {
          events.push({
            type: 'POSITION_CLOSED',
            trade,
            message: `Позиция ${pos.symbol} (${pos.side === 'BUY' ? 'LONG' : 'SHORT'}) закрыта по ${reason} по цене ${exitPrice.toFixed(2)} ₽ (PnL: ${trade.pnl > 0 ? '+' : ''}${trade.pnl} ₽)`
          });
        }
      } else {
        // Update unrealized PnL with current tick price
        pos.currentPrice = tickPrice;
        let pnl = 0;
        if (pos.side === 'BUY') {
          pnl = (tickPrice - pos.entryPrice) * pos.qty;
        } else {
          pnl = (pos.entryPrice - tickPrice) * pos.qty;
        }
        pos.unrealizedPnL = +pnl.toFixed(2);
        pos.unrealizedPnLPercent = +(((tickPrice - pos.entryPrice) / pos.entryPrice) * 100 * (pos.side === 'BUY' ? 1 : -1)).toFixed(2);
      }
    }

    // 3. Update equity curve & notify
    this._updateEquity(time);
    this.notifyUpdate();

    return events;
  }

  // Process historical bar: execute the 4 intra-bar ticks sequentially for 100% realism
  onCandle(candle, symbol) {
    if (!candle) return [];
    const ticks = this.getIntraBarTicks(candle);
    const allEvents = [];
    for (let i = 0; i < ticks.length; i++) {
      const tickPrice = ticks[i];
      const events = this.onPriceTick(tickPrice, candle.time, symbol, i === 0 ? candle : null);
      if (events && events.length > 0) {
        allEvents.push(...events);
      }
    }
    return allEvents;
  }

  // Internal: calculate equity, drawdown, and record history
  _updateEquity(time) {
    const unrealized = this.positions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
    const equity = +(this.balance + unrealized).toFixed(2);

    if (equity > this.peakEquity) {
      this.peakEquity = equity;
    }

    const ddRub = +(this.peakEquity - equity).toFixed(2);
    const ddPct = this.peakEquity > 0 ? +((ddRub / this.peakEquity) * 100).toFixed(2) : 0;

    if (ddRub > this.maxDrawdownRub) {
      this.maxDrawdownRub = ddRub;
      this.maxDrawdownPct = ddPct;
    }

    if (time) {
      this.equityHistory.push({
        time,
        equity,
        balance: +this.balance.toFixed(2),
        unrealized: +unrealized.toFixed(2)
      });
      // Cap history length for performance
      if (this.equityHistory.length > 2000) {
        this.equityHistory.shift();
      }
    }
  }

  // Calculate comprehensive performance statistics
  getPerformanceMetrics() {
    const totalTrades = this.tradeHistory.length;
    const wins = this.tradeHistory.filter(t => t.pnl > 0);
    const losses = this.tradeHistory.filter(t => t.pnl <= 0);

    const winningTrades = wins.length;
    const losingTrades = losses.length;
    const winRate = totalTrades > 0 ? +((winningTrades / totalTrades) * 100).toFixed(1) : 0;

    const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
    const netPnL = +(grossProfit - grossLoss).toFixed(2);
    const profitFactor = grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(2) : (grossProfit > 0 ? 999 : 0);

    const avgWin = winningTrades > 0 ? +(grossProfit / winningTrades).toFixed(2) : 0;
    const avgLoss = losingTrades > 0 ? +(grossLoss / losingTrades).toFixed(2) : 0;

    const unrealized = this.positions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
    const equity = +(this.balance + unrealized).toFixed(2);
    const returnPct = +(((equity - this.initialBalance) / this.initialBalance) * 100).toFixed(2);

    return {
      initialBalance: this.initialBalance,
      balance: +this.balance.toFixed(2),
      equity,
      unrealizedPnL: +unrealized.toFixed(2),
      realizedPnL: netPnL,
      returnPct,
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      grossProfit: +grossProfit.toFixed(2),
      grossLoss: +grossLoss.toFixed(2),
      profitFactor,
      avgWin,
      avgLoss,
      maxDrawdownRub: this.maxDrawdownRub,
      maxDrawdownPct: this.maxDrawdownPct,
      workingOrdersCount: this.orders.length,
      openPositionsCount: this.positions.length
    };
  }

  // Formats data specifically for OpenAlgo TradeController primitives
  getOpenAlgoTradeState(symbol) {
    // OpenAlgo TradeController requires:
    // orders: Order[] with id, symbol, side, type, qty, filledQty, price, status, role
    // positions: Position[] with symbol, netQty, avgPrice
    const tradeOrders = [];

    // 1. Working orders
    for (const ord of this.orders) {
      if (!symbol || ord.symbol === symbol) {
        tradeOrders.push({
          id: ord.id,
          symbol: ord.symbol,
          side: ord.side,
          type: ord.type,
          qty: ord.qty,
          filledQty: 0,
          price: ord.price,
          status: 'working',
          role: 'ENTRY'
        });
      }
    }

    // 2. Position brackets (SL and TP lines attached to positions)
    const tradePositions = [];
    for (const pos of this.positions) {
      if (!symbol || pos.symbol === symbol) {
        tradePositions.push({
          symbol: pos.symbol,
          netQty: pos.side === 'BUY' ? pos.qty : -pos.qty,
          avgPrice: pos.entryPrice
        });

        // Add SL bracket line
        if (pos.sl) {
          tradeOrders.push({
            id: pos.id + '_sl',
            symbol: pos.symbol,
            side: pos.side === 'BUY' ? 'SELL' : 'BUY',
            type: 'SL',
            qty: pos.qty,
            filledQty: 0,
            price: pos.sl,
            status: 'working',
            parentId: pos.id,
            role: 'STOP_LOSS'
          });
        }

        // Add TP bracket line
        if (pos.tp) {
          tradeOrders.push({
            id: pos.id + '_tp',
            symbol: pos.symbol,
            side: pos.side === 'BUY' ? 'SELL' : 'BUY',
            type: 'LIMIT',
            qty: pos.qty,
            filledQty: 0,
            price: pos.tp,
            status: 'working',
            parentId: pos.id,
            role: 'TAKE_PROFIT'
          });
        }
      }
    }

    return { orders: tradeOrders, positions: tradePositions };
  }

  // Export trade history as CSV file
  exportCsv() {
    if (this.tradeHistory.length === 0) return null;

    const headers = ['ID', 'Инструмент', 'Сторона', 'Кол-во (шт.)', 'Лоты', 'Цена входа', 'Цена выхода', 'PnL (₽)', 'Доход (%)', 'Причина закрытия', 'Время входа', 'Время выхода', 'Комиссия'];
    const rows = this.tradeHistory.map(t => [
      t.id,
      t.symbol,
      t.side === 'BUY' ? 'LONG' : 'SHORT',
      t.qty,
      t.lots,
      t.entryPrice,
      t.exitPrice,
      t.pnl,
      t.pnlPercent,
      `"${t.reason}"`,
      new Date(t.openTime * 1000).toLocaleString('ru-RU'),
      new Date(t.closeTime * 1000).toLocaleString('ru-RU'),
      t.totalCommission
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  notifyUpdate() {
    if (this.onAccountUpdate) {
      try {
        this.onAccountUpdate(this.getPerformanceMetrics());
      } catch (e) {
        console.error('Error in onAccountUpdate listener:', e);
      }
    }
  }
}

// Export for browser & node & ES modules
if (typeof window !== 'undefined') {
  window.PaperTradingAccount = PaperTradingAccount;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PaperTradingAccount;
}

export default PaperTradingAccount;
export { PaperTradingAccount };

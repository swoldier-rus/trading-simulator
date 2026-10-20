// Technical Indicators Engine for TradingView Simulator
class IndicatorsEngine {
  constructor() {
    this.activeIndicators = {
      ema20: false,
      ema50: false,
      sma200: false,
      bollinger: false
    };

    this.seriesMap = {};
  }

  // Calculate Simple Moving Average (SMA)
  static calculateSMA(candles, period) {
    const result = [];
    let sum = 0;
    for (let i = 0; i < candles.length; i++) {
      sum += candles[i].close;
      if (i >= period) {
        sum -= candles[i - period].close;
      }
      if (i >= period - 1) {
        result.push({
          time: candles[i].time,
          value: +(sum / period).toFixed(2)
        });
      }
    }
    return result;
  }

  // Calculate Exponential Moving Average (EMA)
  static calculateEMA(candles, period) {
    const result = [];
    if (candles.length < period) return result;

    const multiplier = 2 / (period + 1);
    
    // First value is SMA of first 'period' candles
    let initialSum = 0;
    for (let i = 0; i < period; i++) {
      initialSum += candles[i].close;
    }
    let prevEma = initialSum / period;
    result.push({ time: candles[period - 1].time, value: +prevEma.toFixed(2) });

    for (let i = period; i < candles.length; i++) {
      const currentClose = candles[i].close;
      const currentEma = (currentClose - prevEma) * multiplier + prevEma;
      result.push({ time: candles[i].time, value: +currentEma.toFixed(2) });
      prevEma = currentEma;
    }

    return result;
  }

  // Calculate Bollinger Bands (period 20, stdDev 2)
  static calculateBollinger(candles, period = 20, multiplier = 2) {
    const upper = [];
    const middle = [];
    const lower = [];

    if (candles.length < period) return { upper, middle, lower };

    for (let i = period - 1; i < candles.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += candles[i - j].close;
      }
      const mean = sum / period;

      let varianceSum = 0;
      for (let j = 0; j < period; j++) {
        varianceSum += Math.pow(candles[i - j].close - mean, 2);
      }
      const stdDev = Math.sqrt(varianceSum / period);

      const time = candles[i].time;
      middle.push({ time, value: +mean.toFixed(2) });
      upper.push({ time, value: +(mean + multiplier * stdDev).toFixed(2) });
      lower.push({ time, value: +(mean - multiplier * stdDev).toFixed(2) });
    }

    return { upper, middle, lower };
  }

  // Attach series to the LightweightCharts instance
  initSeries(chart, LightweightCharts) {
    // EMA 20 (Orange/Yellow line)
    this.seriesMap.ema20 = chart.addSeries(LightweightCharts.LineSeries, {
      color: '#f5a623',
      lineWidth: 2,
      title: 'EMA 20',
      visible: false
    });

    // EMA 50 (Blue line)
    this.seriesMap.ema50 = chart.addSeries(LightweightCharts.LineSeries, {
      color: '#2962ff',
      lineWidth: 2,
      title: 'EMA 50',
      visible: false
    });

    // SMA 200 (Purple line)
    this.seriesMap.sma200 = chart.addSeries(LightweightCharts.LineSeries, {
      color: '#ab47bc',
      lineWidth: 2,
      title: 'SMA 200',
      visible: false
    });

    // Bollinger Upper (Cyan)
    this.seriesMap.bbUpper = chart.addSeries(LightweightCharts.LineSeries, {
      color: 'rgba(0, 188, 212, 0.6)',
      lineWidth: 1,
      title: 'BB Upper',
      visible: false
    });

    // Bollinger Middle (Cyan dashed)
    this.seriesMap.bbMiddle = chart.addSeries(LightweightCharts.LineSeries, {
      color: 'rgba(0, 188, 212, 0.4)',
      lineWidth: 1,
      lineStyle: 2,
      title: 'BB Basis',
      visible: false
    });

    // Bollinger Lower (Cyan)
    this.seriesMap.bbLower = chart.addSeries(LightweightCharts.LineSeries, {
      color: 'rgba(0, 188, 212, 0.6)',
      lineWidth: 1,
      title: 'BB Lower',
      visible: false
    });
  }

  // Recalculate indicators on candles update
  updateAll(candles) {
    if (!candles || candles.length === 0) return;

    if (this.activeIndicators.ema20) {
      const data = IndicatorsEngine.calculateEMA(candles, 20);
      this.seriesMap.ema20.setData(data);
    }
    if (this.activeIndicators.ema50) {
      const data = IndicatorsEngine.calculateEMA(candles, 50);
      this.seriesMap.ema50.setData(data);
    }
    if (this.activeIndicators.sma200) {
      const data = IndicatorsEngine.calculateSMA(candles, 200);
      this.seriesMap.sma200.setData(data);
    }
    if (this.activeIndicators.bollinger) {
      const bb = IndicatorsEngine.calculateBollinger(candles, 20, 2);
      this.seriesMap.bbUpper.setData(bb.upper);
      this.seriesMap.bbMiddle.setData(bb.middle);
      this.seriesMap.bbLower.setData(bb.lower);
    }
  }

  toggle(indicatorKey, candles) {
    if (this.activeIndicators[indicatorKey] !== undefined) {
      this.activeIndicators[indicatorKey] = !this.activeIndicators[indicatorKey];
      const isVisible = this.activeIndicators[indicatorKey];

      if (indicatorKey === 'bollinger') {
        this.seriesMap.bbUpper.applyOptions({ visible: isVisible });
        this.seriesMap.bbMiddle.applyOptions({ visible: isVisible });
        this.seriesMap.bbLower.applyOptions({ visible: isVisible });
      } else if (this.seriesMap[indicatorKey]) {
        this.seriesMap[indicatorKey].applyOptions({ visible: isVisible });
      }

      if (isVisible && candles) {
        this.updateAll(candles);
      }
      return isVisible;
    }
    return false;
  }
}

if (typeof window !== 'undefined') {
  window.IndicatorsEngine = IndicatorsEngine;
  window.IndicatorManager = IndicatorsEngine;
}

export default IndicatorsEngine;
export { IndicatorsEngine, IndicatorsEngine as IndicatorManager };

const { EmbedBuilder } = require('discord.js');

const colors = {
    bullish: 0x2ecc71,
    bearish: 0xe74c3c,
    neutral: 0x95a5a6
};

const trendArrow = (trend) => {
    switch ((trend || '').toLowerCase()) {
        case 'bullish':
        case 'up':
        case 'uptrend':
            return { arrow: '↑', label: 'Bullish', color: colors.bullish };
        case 'bearish':
        case 'down':
        case 'downtrend':
            return { arrow: '↓', label: 'Bearish', color: colors.bearish };
        default:
            return { arrow: '→', label: 'Sideways', color: colors.neutral };
    }
};

const marketBadge = (marketStatus) => {
    if (marketStatus && marketStatus.isOpen) {
        return '🟢 Open';
    }

    return '⚪ Closed';
};

const priceFormatter = (precision) => new Intl.NumberFormat('en-US', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
});

const detectPrecision = (price, indicatorPrecision) => {
    if (Number.isFinite(indicatorPrecision)) {
        return indicatorPrecision;
    }

    if (!Number.isFinite(price)) return 2;

    if (price >= 100) return 2;
    if (price >= 10) return 3;
    return 5;
};

const relativeTimestamp = (timestamp) => {
    if (!timestamp) return '—';
    const ms = typeof timestamp === 'number' ? timestamp : Date.parse(timestamp);
    if (!Number.isFinite(ms)) return '—';
    return `<t:${Math.floor(ms / 1000)}:R>`;
};

const formatRsi = (rsi) => {
    if (!Number.isFinite(rsi)) return 'RSI —';
    if (rsi <= 30) return `RSI ${rsi.toFixed(1)} (Oversold)`;
    if (rsi >= 70) return `RSI ${rsi.toFixed(1)} (Overbought)`;
    return `RSI ${rsi.toFixed(1)}`;
};

const formatMacd = (macd) => {
    if (!macd || !Number.isFinite(macd.histogram)) return 'MACD —';
    if (macd.histogram > 0) return 'MACD ▲';
    if (macd.histogram < 0) return 'MACD ▼';
    return 'MACD →';
};

const formatSma = (sma50, sma200) => {
    if (!Number.isFinite(sma50) || !Number.isFinite(sma200)) return 'SMA —';
    if (sma50 > sma200) return 'SMA 50>200';
    if (sma50 < sma200) return 'SMA 50<200';
    return 'SMA 50≈200';
};

const formatBb = (price, bb) => {
    if (!bb || !Number.isFinite(price) || !Number.isFinite(bb.upper) || !Number.isFinite(bb.lower)) {
        return 'BB —';
    }

    const range = bb.upper - bb.lower;
    if (!Number.isFinite(range) || range === 0) return 'BB —';

    const position = (price - bb.lower) / range;

    if (position >= 0.85) return 'BB ⬆️';
    if (position <= 0.15) return 'BB ⬇️';
    return 'BB mid';
};

const baseAndVendor = (symbol) => {
    if (!symbol) return { vendor: null, pair: 'Unknown' };
    if (symbol.includes(':')) {
        const [vendor, pair] = symbol.split(':');
        return { vendor, pair };
    }
    return { vendor: null, pair: symbol };
};

const buildPriceEmbed = ({ quote, interval, precisionOverride, locale = 'en' }) => {
    const { symbol, price, timestamp, trend, marketStatus, indicators = {}, volatility = {} } = quote;
    const { vendor, pair } = baseAndVendor(symbol);
    const trendMeta = trendArrow(trend);
    const statusBadge = marketBadge(marketStatus);
    const precision = detectPrecision(price, precisionOverride);
    const formatter = new Intl.NumberFormat(locale, {
        minimumFractionDigits: precision,
        maximumFractionDigits: precision
    });

    const embed = new EmbedBuilder()
        .setColor(trendMeta.color)
        .setTitle(`${pair}${vendor ? ` (${vendor})` : ''} ${trendMeta.arrow} • ${statusBadge}`)
        .setFooter({ text: 'FXPulse • data via finance.khorami.dev' });

    if (marketStatus && !marketStatus.isOpen) {
        embed.setDescription('Market currently closed. Data may be stale.');
    }

    const priceField = Number.isFinite(price) ? formatter.format(price) : '—';

    embed.addFields(
        { name: 'Price', value: priceField, inline: true },
        { name: 'Last Update', value: relativeTimestamp(timestamp), inline: true },
        { name: 'Interval', value: `${interval || quote.interval || '—'}m`, inline: true }
    );

    if (volatility && Number.isFinite(volatility.atr_percentage)) {
        embed.addFields({ name: 'ATR %', value: `${volatility.atr_percentage.toFixed(2)}%`, inline: true });
    }

    const snapshot = [
        formatRsi(indicators.rsi),
        formatMacd(indicators.macd || (indicators.MACD ?? {})),
        formatSma(indicators.sma50, indicators.sma200),
        formatBb(price, indicators.bollingerBands)
    ].join(' • ');

    embed.addFields({ name: 'Snapshot', value: snapshot, inline: false });

    return embed;
};

const formatStochastic = (stochastic) => {
    if (!stochastic || !Number.isFinite(stochastic.k) || !Number.isFinite(stochastic.d)) {
        return 'Stochastic —';
    }

    return `Stoch K ${stochastic.k.toFixed(1)} • D ${stochastic.d.toFixed(1)}`;
};

const formatAtr = (volatility) => {
    if (!volatility) return 'ATR —';
    const atr = Number.isFinite(volatility.atr) ? `${volatility.atr.toFixed(2)}` : '—';
    const atrPct = Number.isFinite(volatility.atr_percentage) ? `${volatility.atr_percentage.toFixed(2)}%` : '—';
    return `ATR ${atr} (${atrPct})`;
};

const deriveInterpretation = (quote) => {
    const segments = [];
    const { indicators = {}, trend, volatility = {}, marketStatus } = quote;

    if (trend) {
        const arrow = trendArrow(trend).arrow;
        segments.push(`Trend leans ${trend.toLowerCase()} ${arrow}.`);
    }

    if (Number.isFinite(indicators.rsi)) {
        if (indicators.rsi >= 70) segments.push('RSI signals potential overbought conditions.');
        else if (indicators.rsi <= 30) segments.push('RSI suggests oversold territory.');
        else segments.push('RSI remains balanced.');
    }

    if (indicators.macd && Number.isFinite(indicators.macd.histogram)) {
        if (indicators.macd.histogram > 0) segments.push('MACD histogram is positive, hinting at bullish momentum.');
        else if (indicators.macd.histogram < 0) segments.push('MACD histogram is negative, indicating bearish pressure.');
        else segments.push('MACD is flat.');
    }

    if (Number.isFinite(indicators.sma50) && Number.isFinite(indicators.sma200)) {
        if (indicators.sma50 > indicators.sma200) segments.push('SMA50 trades above SMA200 (bullish bias).');
        else if (indicators.sma50 < indicators.sma200) segments.push('SMA50 lags SMA200 (bearish bias).');
        else segments.push('SMA50 and SMA200 are aligned.');
    }

    if (volatility && Number.isFinite(volatility.atr_percentage)) {
        segments.push(`ATR% at ${volatility.atr_percentage.toFixed(2)} keeps volatility ${volatility.atr_percentage > 1 ? 'elevated' : 'contained'}.`);
    }

    if (marketStatus && !marketStatus.isOpen) {
        segments.push('Market is currently closed; expect slower updates.');
    }

    if (!segments.length) return 'Market data looks neutral; monitor for catalysts.';

    return segments.join(' ');
};

const buildAnalysisEmbed = ({ quote, interval, locale = 'en' }) => {
    const baseEmbed = buildPriceEmbed({ quote, interval, locale });
    const { indicators = {}, volatility = {} } = quote;

    const closed = quote.marketStatus && quote.marketStatus.isOpen === false;
    const interpretation = deriveInterpretation(quote);
    baseEmbed.setDescription(closed ? `Market currently closed. Data may be stale.\n\n${interpretation}` : interpretation);

    baseEmbed.addFields(
        { name: 'RSI', value: Number.isFinite(indicators.rsi) ? indicators.rsi.toFixed(2) : '—', inline: true },
        { name: 'MACD', value: indicators.macd ? `${indicators.macd.value?.toFixed?.(4) ?? '—'} / ${indicators.macd.signal?.toFixed?.(4) ?? '—'} / ${indicators.macd.histogram?.toFixed?.(4) ?? '—'}` : '—', inline: true },
        { name: 'SMAs', value: Number.isFinite(indicators.sma50) && Number.isFinite(indicators.sma200) ? `${indicators.sma50.toFixed(4)} vs ${indicators.sma200.toFixed(4)}` : '—', inline: true },
        { name: 'Bollinger Bands', value: indicators.bollingerBands ? `U ${indicators.bollingerBands.upper?.toFixed?.(4) ?? '—'} / M ${indicators.bollingerBands.middle?.toFixed?.(4) ?? '—'} / L ${indicators.bollingerBands.lower?.toFixed?.(4) ?? '—'}` : '—', inline: true },
        { name: 'Stochastic', value: formatStochastic(indicators.stochastic), inline: true },
        { name: 'ATR', value: formatAtr(volatility), inline: true }
    );

    return baseEmbed;
};

const buildErrorEmbed = (message) => new EmbedBuilder()
    .setColor(colors.bearish)
    .setTitle('FXPulse')
    .setDescription(message)
    .setFooter({ text: 'FXPulse • data via finance.khorami.dev' });

module.exports = {
    buildPriceEmbed,
    buildAnalysisEmbed,
    buildErrorEmbed,
    trendArrow,
    marketBadge
};

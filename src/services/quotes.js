const { getEnv } = require('../configuration/env');
const { warn } = require('../utils/Console');

const cache = new Map();
const inFlight = new Map();
const lastGoodQuotes = new Map();
const WARNING_SUPPRESSION_MS = 5 * 60 * 1000;
const warningLog = new Map();
const CRITICAL_WARNING_PREFIXES = [
    'Price missing or non-positive',
    'Timestamp missing or invalid',
    'Insufficient candle data',
    'Detected non-positive or invalid OHLC values',
    'Candles appear out of order'
];

const toFiniteNumber = (value) => {
    if (Number.isFinite(value)) return value;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const parseTimestamp = (value) => {
    if (!value) return null;
    const ms = typeof value === 'number' ? value : Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
};

const isDescending = (values) => {
    for (let i = 1; i < values.length; i += 1) {
        if (values[i - 1] < values[i]) {
            return false;
        }
    }
    return true;
};

const summarizeCandles = (candles = []) => {
    const timestamps = [];
    let invalidQuote = false;

    candles.forEach((candle) => {
        const open = toFiniteNumber(candle.open);
        const high = toFiniteNumber(candle.high);
        const low = toFiniteNumber(candle.low);
        const close = toFiniteNumber(candle.close);
        if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close) || open <= 0 || high <= 0 || low <= 0 || close <= 0) {
            invalidQuote = true;
        }

        const parsed = parseTimestamp(candle.time);
        if (parsed !== null) {
            timestamps.push(parsed);
        }
    });

    return { timestamps, invalidQuote };
};

const evaluateWarnings = (quote, { symbol, interval }) => {
    const warnings = [];

    const price = toFiniteNumber(quote.price);
    if (price === null || price <= 0) {
        warnings.push('Price missing or non-positive');
    }

    const timestampMs = parseTimestamp(quote.timestamp);
    if (timestampMs === null) {
        warnings.push('Timestamp missing or invalid');
    } else {
        const ageMinutes = (Date.now() - timestampMs) / 60000;
        if (ageMinutes > 90) {
            warnings.push(`Last update is ${ageMinutes.toFixed(0)} minutes old`);
        }
    }

    if (!Array.isArray(quote.candles) || quote.candles.length < 26) {
        warnings.push('Insufficient candle data');
    } else {
        const { timestamps, invalidQuote } = summarizeCandles(quote.candles);

        if (timestamps.length !== quote.candles.length) {
            warnings.push('One or more candles missing timestamps');
        } else if (!isDescending(timestamps)) {
            warnings.push('Candles appear out of order');
        }

        if (invalidQuote) {
            warnings.push('Detected non-positive or invalid OHLC values');
        }

        if (timestampMs !== null && timestamps.length) {
            const latestCandleAge = Math.abs(timestampMs - timestamps[0]) / 60000;
            if (latestCandleAge > 5) {
                warnings.push('Latest candle timestamp differs from headline timestamp');
            }
        }
    }

    if (quote.marketStatus && quote.marketStatus.isOpen === false && timestampMs !== null) {
        const ageMinutes = (Date.now() - timestampMs) / 60000;
        if (ageMinutes < 15) {
            warnings.push('API reports closed while data updated in the last 15 minutes');
        }
    }

    if (warnings.length) {
        const key = `${symbol}:${interval || 'default'}`;
        const now = Date.now();
        const last = warningLog.get(key) || 0;
        if (now - last > WARNING_SUPPRESSION_MS) {
            warn('[DataCheck]', JSON.stringify({ symbol, interval, warnings }));
            warningLog.set(key, now);
        }
    }

    return warnings;
};

const mergeWithFallback = (incoming, fallback) => {
    if (!fallback) return incoming;

    const merged = {
        ...fallback,
        ...incoming,
        indicators: { ...(fallback.indicators || {}), ...(incoming.indicators || {}) },
        volatility: { ...(fallback.volatility || {}), ...(incoming.volatility || {}) },
        supportResistance: incoming.supportResistance || fallback.supportResistance,
        candles: Array.isArray(incoming.candles) && incoming.candles.length >= 26
            ? incoming.candles
            : fallback.candles,
        price: (() => {
            const price = toFiniteNumber(incoming.price);
            return Number.isFinite(price) && price > 0 ? price : fallback.price;
        })(),
        timestamp: (() => {
            const ts = parseTimestamp(incoming.timestamp);
            return ts !== null ? incoming.timestamp : fallback.timestamp;
        })()
    };

    const warningSet = new Set([...(incoming.warnings || [])]);
    warningSet.add('Using cached data due to upstream anomalies');

    if (fallback.timestamp && fallback.timestamp !== merged.timestamp) {
        warningSet.add(`Showing cached data from ${fallback.timestamp}`);
    }

    merged.warnings = Array.from(warningSet);

    return merged;
};

const isHealthy = (quote) => {
    const price = toFiniteNumber(quote.price);
    const timestamp = parseTimestamp(quote.timestamp);
    const candlesOk = Array.isArray(quote.candles) && quote.candles.length >= 26;
    return Number.isFinite(price) && price > 0 && timestamp !== null && candlesOk;
};

const normalizeSymbol = (symbol) => {
    if (!symbol) return '';
    return symbol.replace(/\s+/g, '').toUpperCase();
};

const cacheKey = (symbol, interval) => `${normalizeSymbol(symbol)}:${interval || 'default'}`;

const shouldUseCache = (entry) => {
    if (!entry) return false;
    return Date.now() < entry.expiresAt;
};

const getQuote = async (symbol, interval) => {
    const { apiBase, cacheTtlMs, apiKey, apiBearer } = getEnv();
    const normalizedSymbol = normalizeSymbol(symbol);

    if (!normalizedSymbol) {
        throw new Error('Missing symbol.');
    }

    const key = cacheKey(normalizedSymbol, interval);
    const cached = cache.get(key);

    if (shouldUseCache(cached)) {
        return cached.value;
    }

    if (inFlight.has(key)) {
        return inFlight.get(key);
    }

    const request = (async () => {
        const lastGood = lastGoodQuotes.get(key) ? JSON.parse(JSON.stringify(lastGoodQuotes.get(key))) : null;

        const url = new URL(`${apiBase.replace(/\/$/, '')}/market-data/${encodeURIComponent(normalizedSymbol)}`);

        if (interval) {
            url.searchParams.set('interval', interval);
        }

        const headers = {
            'Accept': 'application/json',
            'x-api-key': apiKey
        };

        if (apiBearer) {
            headers.Authorization = apiBearer.startsWith('Bearer ')
                ? apiBearer
                : `Bearer ${apiBearer}`;
        }

        let response;
        try {
            response = await fetch(url, {
                method: 'GET',
                headers
            });
        } catch (err) {
            if (lastGood) {
                const fallback = {
                    ...lastGood,
                    warnings: Array.from(new Set([...(lastGood.warnings || []), 'Live fetch failed; showing cached data']))
                };
                cache.set(key, { value: fallback, expiresAt: Date.now() + cacheTtlMs });
                return fallback;
            }
            throw err;
        }

        if (!response.ok) {
            if (response.status === 404) {
                if (lastGood) {
                    const fallback = {
                        ...lastGood,
                        warnings: Array.from(new Set([...(lastGood.warnings || []), 'Symbol not found upstream; showing cached data']))
                    };
                    cache.set(key, { value: fallback, expiresAt: Date.now() + cacheTtlMs });
                    return fallback;
                }
                throw new Error(`No market data found for ${normalizedSymbol}.`);
            }

            if (lastGood) {
                const fallback = {
                    ...lastGood,
                    warnings: Array.from(new Set([...(lastGood.warnings || []), `Upstream error ${response.status}; showing cached data`]))
                };
                cache.set(key, { value: fallback, expiresAt: Date.now() + cacheTtlMs });
                return fallback;
            }

            throw new Error(`Market data request failed with status ${response.status}`);
        }

        const payload = await response.json();

        if (!payload) {
            if (lastGood) {
                const fallback = {
                    ...lastGood,
                    warnings: Array.from(new Set([...(lastGood.warnings || []), 'Empty payload upstream; showing cached data']))
                };
                cache.set(key, { value: fallback, expiresAt: Date.now() + cacheTtlMs });
                return fallback;
            }
            throw new Error(`No payload returned for ${normalizedSymbol}.`);
        }

        const value = {
            ...payload,
            symbol: payload.symbol || normalizedSymbol,
            interval: payload.interval || interval || '15'
        };

        value.warnings = evaluateWarnings(value, { symbol: normalizedSymbol, interval });

        const hasCritical = value.warnings.some((warning) => CRITICAL_WARNING_PREFIXES.some((prefix) => warning.startsWith(prefix)));
        const finalValue = hasCritical && lastGood ? mergeWithFallback(value, lastGood) : value;

        if (!Array.isArray(finalValue.warnings)) {
            finalValue.warnings = [];
        }

        finalValue.warnings = Array.from(new Set(finalValue.warnings));

        if (isHealthy(finalValue)) {
            lastGoodQuotes.set(key, JSON.parse(JSON.stringify(finalValue)));
        }

        cache.set(key, { value: finalValue, expiresAt: Date.now() + cacheTtlMs });

        return finalValue;
    })();

    inFlight.set(key, request);

    try {
        return await request;
    } finally {
        inFlight.delete(key);
    }
};

module.exports = {
    getQuote,
    normalizeSymbol
};

const { getEnv } = require('../configuration/env');
const { warn } = require('../utils/Console');

const cache = new Map();

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
    const { apiBase, cacheTtlMs } = getEnv();
    const normalizedSymbol = normalizeSymbol(symbol);

    if (!normalizedSymbol) {
        throw new Error('Missing symbol.');
    }

    const key = cacheKey(normalizedSymbol, interval);
    const cached = cache.get(key);

    if (shouldUseCache(cached)) {
        return cached.value;
    }

    const url = new URL(`${apiBase.replace(/\/$/, '')}/market-data/${encodeURIComponent(normalizedSymbol)}`);

    if (interval) {
        url.searchParams.set('interval', interval);
    }

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error(`No market data found for ${normalizedSymbol}.`);
        }
        throw new Error(`Market data request failed with status ${response.status}`);
    }

    const payload = await response.json();

    if (!payload || !payload.price) {
        warn('Malformed payload from finance API for symbol', normalizedSymbol);
    }

    const value = {
        ...payload,
        symbol: payload.symbol || normalizedSymbol,
        interval: payload.interval || interval || '15'
    };

    cache.set(key, { value, expiresAt: Date.now() + cacheTtlMs });

    return value;
};

module.exports = {
    getQuote,
    normalizeSymbol
};
